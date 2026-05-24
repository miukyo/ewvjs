import * as path from 'path';
import * as fs from 'fs';
import * as Module from 'module';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Cache the injected API script so it's only read from disk once
let _cachedApiScript: string | null = null;

export class WindowsPlatform {

    constructor() {
    }

    getExeVersion(exePath?: string): string | null {
        // Compute dllDir similar to createWindow
        const isPkg = typeof (process as any).pkg !== 'undefined';

        let dllDir: string;
        if (isPkg) {
            const execDir = path.dirname(process.execPath);
            dllDir = path.join(execDir, 'native');
        } else {
            dllDir = path.resolve(__dirname, '../../native');
        }

        try {
            const nativeModule = require(path.join(dllDir, 'WebView.cjs'));
            const EwvjsInterop = nativeModule.EwvjsInterop;
            if (typeof EwvjsInterop.getFileVersion === 'function') {
                try {
                    const res = EwvjsInterop.getFileVersion(exePath || process.execPath);
                    return res || null;
                } catch (e) {
                    return null;
                }
            }
        } catch (e) {
            // ignore
        }
        return null;
    }

    createWindow(options: any) {
        // Detect if running as packaged executable (pkg) or in development
        const isPkg = typeof (process as any).pkg !== 'undefined';

        let dllDir: string;
        let apiPath: string;

        if (isPkg) {
            // When packaged with pkg, native DLLs are next to the executable
            const execDir = path.dirname(process.execPath);
            dllDir = path.join(execDir, 'native');

            // api.js is bundled in the snapshot, use snapshot path
            apiPath = path.resolve(__dirname, '../js/api.js');
        } else {
            // Development mode: use relative paths from compiled location
            dllDir = path.resolve(__dirname, '../../native');
            apiPath = path.resolve(__dirname, '../js/api.js');
        }

        // Ensure WebView2Loader.dll and others are found
        const arch = process.arch;
        const winArch = arch === 'ia32' ? 'win-x86' : `win-${arch}`;
        const runtimePath = path.join(dllDir, 'runtimes', winArch, 'native');

        process.env.PATH = `${dllDir};${runtimePath};${process.env.PATH}`;

        // Set up module resolution for node-api-dotnet BEFORE requiring WebView.cjs
        const nodeModulesPath = path.join(dllDir, 'node_modules');
        if (fs.existsSync(nodeModulesPath)) {
            const existingNodePath = process.env.NODE_PATH || '';
            process.env.NODE_PATH = existingNodePath
                ? `${nodeModulesPath};${existingNodePath}`
                : nodeModulesPath;

            // Add to global module paths so it's available for all requires
            const ModuleConstructor = Module as any;
            if (ModuleConstructor.globalPaths && Array.isArray(ModuleConstructor.globalPaths)) {
                if (!ModuleConstructor.globalPaths.includes(nodeModulesPath)) {
                    ModuleConstructor.globalPaths.unshift(nodeModulesPath);
                }
            }
        }

        // Load the node-api-dotnet module
        let EwvjsInterop;
        try {
            const nativeModule = require(path.join(dllDir, 'WebView.cjs'));
            EwvjsInterop = nativeModule.EwvjsInterop;
        } catch (e) {
            console.error("Failed to load native module from " + dllDir, e);
            throw e;
        }

        // Prepare initScript — read & cache once, then reuse
        const token = Math.random().toString(36).substring(2, 15);
        if (_cachedApiScript === null) {
            _cachedApiScript = fs.readFileSync(apiPath, 'utf8');
        }
        let apiScript = _cachedApiScript.replace('%(token)s', token);
        if (options.exposedFunctionsList && options.exposedFunctionsList.length > 0) {
            apiScript += `\nwindow.ewvjs._createApi(${JSON.stringify(options.exposedFunctionsList)});`;
        }
        options.initScript = apiScript;

        // Handle messages from WebView

        options.onMessage = (message: any, callback?: (err: any, result: any) => void) => {
            // Check for close message
            if (message === '["closed", ""]' || (Array.isArray(message) && message[0] === 'closed')) {
            }

            if (typeof message === 'string') {
                try {
                    message = JSON.parse(message);
                } catch (e) {
                    // Ignore parsing error, maybe it's just a string message
                }
            }

            if (options.jsCallback) {
                // Call jsCallback and handle the result
                const result = options.jsCallback(message);


                // If there's a callback (for messages that expect responses like context menu)
                if (callback) {
                    if (result && typeof result.then === 'function') {
                        // Handle promise
                        result.then(
                            (res: any) => {
                                // Serialize result to JSON string for C#
                                const jsonResult = res ? JSON.stringify(res) : null;
                                callback(null, jsonResult);
                            },
                            (err: any) => callback(err, null)
                        );
                    } else {
                        // Handle synchronous result
                        const jsonResult = result ? JSON.stringify(result) : null;
                        callback(null, jsonResult);
                    }
                }
            }
        };
        try {
            return EwvjsInterop.invoke(options);
        } catch (e) { console.error("TS: Invoke failed:", e); throw e; }
    }
}
