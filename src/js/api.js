window.ewvjs = {
    token: '%(token)s',
    platform: 'edgechromium',
    api: {},
    _eventHandlers: {},
    _returnValuesCallbacks: {},

    _hookDrag: function () {
        window.addEventListener('mousedown', function (e) {
            if (e.target.classList.contains('ewvjs-drag-region') || e.target.closest('.ewvjs-drag-region')) {
                if (e.button === 0) { // Left click
                    window.chrome.webview.postMessage("drag");
                }
            }
        });
    },

    _createApi: function (funcList) {
        function sanitize_params(params) {
            var reservedWords = [
                'case',
                'catch',
                'const',
                'debugger',
                'default',
                'delete',
                'do',
                'export',
                'extends',
                'false',
                'function',
                'instanceof',
                'let',
                'new',
                'null',
                'super',
                'switch',
                'this',
                'throw',
                'true',
                'typeof',
                'var',
                'void',
            ];

            for (var i = 0; i < params.length; i++) {
                var param = params[i];
                if (reservedWords.indexOf(param) !== -1) {
                    params[i] = param + '_';
                }
            }

            return params;
        }

        for (var i = 0; i < funcList.length; i++) {
            var element = funcList[i];
            var funcName = element.func;
            var params = element.params;

            var funcHierarchy = funcName.split('.');
            var functionName = funcHierarchy.pop();
            var nestedObject = funcHierarchy.reduce(function (obj, prop) {
                if (!obj[prop]) {
                    obj[prop] = {};
                }
                return obj[prop];
            }, window.ewvjs.api);

            var funcBody =
                'var __id = (Math.random() + "").substring(2);' +
                'var promise = new Promise(function(resolve, reject) {' +
                '    window.ewvjs._checkValue("' +
                funcName +
                '", resolve, reject, __id);' +
                '});' +
                'window.ewvjs._jsApiCallback("' +
                funcName +
                '", Array.prototype.slice.call(arguments), __id);' +
                'return promise;';

            nestedObject[functionName] = new Function(
                sanitize_params(params),
                funcBody
            );
            window.ewvjs._returnValuesCallbacks[funcName] = {};
        }
    },

    _jsApiCallback: function (funcName, params, id) {
        if (
            params.event instanceof Event &&
            params.event.type === 'drop' &&
            params.event.dataTransfer.files
        ) {
            chrome.webview.postMessageWithAdditionalObjects(
                'FilesDropped',
                params.event.dataTransfer.files
            );
        }
        return window.chrome.webview.postMessage([
            funcName,
            window.ewvjs.stringify(params),
            id,
        ]);
    },

    _checkValue: function (funcName, resolve, reject, id) {
        window.ewvjs._returnValuesCallbacks[funcName][id] = function (returnObj) {
            var value = returnObj.value;
            var isError = returnObj.isError;

            delete window.ewvjs._returnValuesCallbacks[funcName][id];

            if (isError) {
                var pyError = JSON.parse(value);
                var error = new Error(pyError.message);
                error.name = pyError.name;
                error.stack = pyError.stack;

                reject(error);
            } else {
                resolve(JSON.parse(value));
            }
        };
    },
    _asyncCallback: function (result, id) {
        window.ewvjs._jsApiCallback('ewvjsAsyncCallback', result, id);
    },
    _isPromise: function (obj) {
        return (
            !!obj &&
            (typeof obj === 'object' || typeof obj === 'function') &&
            typeof obj.then === 'function'
        );
    },

    stringify: function stringify(obj, timing) {
        function tryConvertToArray(obj) {
            try {
                return Array.prototype.slice.call(obj);
            } catch (e) {
                return obj;
            }
        }

        function isArrayLike(a) {
            return (
                a &&
                typeof a.length === 'number' &&
                typeof a !== 'string' &&
                (Array.isArray(a) ||
                    (typeof a === 'object' &&
                        a.length >= 0 &&
                        (a.length === 0 || (a.length - 1) in a)))
            );
        }

        function serialize(obj, ancestors) {
            try {
                if (obj instanceof Window) return 'Window';
                if (obj instanceof Node) {
                    return 'Node';
                }

                var boundSerialize = serialize.bind(obj);

                if (typeof obj !== 'object' || obj === null) {
                    return obj;
                }

                while (
                    ancestors.length > 0 &&
                    ancestors[ancestors.length - 1] !== this
                ) {
                    ancestors.pop();
                }

                if (ancestors.indexOf(obj) > -1) {
                    return '[Circular Reference]';
                }
                ancestors.push(obj);

                if (isArrayLike(obj)) {
                    obj = tryConvertToArray(obj);
                }

                if (Array.isArray(obj)) {
                    var arr = obj.map(function (value) {
                        return boundSerialize(value, ancestors);
                    });
                    return arr;
                }

                var newObj = {};
                for (var key in obj) {
                    if (typeof obj === 'function') {
                        continue;
                    }
                    newObj[key] = boundSerialize(obj[key], ancestors);
                }
                return newObj;
            } catch (e) {
                console.error(e);
                return e.toString();
            }
        }

        var startTime = +new Date();

        var _serialize = serialize.bind(null);
        var finalObj = _serialize(obj, []);
        var result = JSON.stringify(finalObj);

        var endTime = +new Date();
        if (timing) {
            console.log('Serialization time: ' + (endTime - startTime) / 1000 + 's');
        }
        return result;
    },

    _loadCss: function (css) {
        var interval = setInterval(function () {
            if (document.readyState === 'complete') {
                clearInterval(interval);

                var cssElement = document.createElement('style');
                cssElement.type = 'text/css';
                cssElement.innerHTML = css;
                document.head.appendChild(cssElement);
            }
        }, 10);
    },

    _callWindowMethod: function (methodName) {
        var __id = (Math.random() + "").substring(2);
        window.chrome.webview.postMessage([
            'window_' + methodName,
            '[]',
            __id
        ]);
    },
};

window.ewvjs._hookConsole = function () {
    var console = window.console;
    if (!console) return;
    function intercept(method) {
        var original = console[method];
        console[method] = function () {
            var args = Array.prototype.slice.call(arguments);
            window.chrome.webview.postMessage([
                "console",
                JSON.stringify(args),
                "0"
            ]);
            original.apply(console, arguments);
        };
    }
    var methods = ['log', 'warn', 'error'];
    for (var i = 0; i < methods.length; i++) intercept(methods[i]);
};

window.ewvjs._hookConsole();
window.ewvjs._hookDrag();

// Add window state methods directly to window object
window.close = function () {
    window.ewvjs._callWindowMethod('close');
};

window.maximize = function () {
    window.ewvjs._callWindowMethod('maximize');
};

window.restore = function () {
    window.ewvjs._callWindowMethod('restore');
};

window.minimize = function () {
    window.ewvjs._callWindowMethod('minimize');
};

window.focus = function () {
    window.ewvjs._callWindowMethod('focus');
};

window.show = function () {
    window.ewvjs._callWindowMethod('show');
};

window.hide = function () {
    window.ewvjs._callWindowMethod('hide');
};

window.resize = function () {
    window.ewvjs._callWindowMethod('resize');
};

window.move = function () {
    window.ewvjs._callWindowMethod('move');
};
