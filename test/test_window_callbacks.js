import ewvjs, { create_window } from '../dist/index.js';

const HTML = /* html */ `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Window Callback Regression Test</title>
    <style>
        html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            font-family: sans-serif;
            background: #111;
            color: #f5f5f5;
        }
        body {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: 12px;
        }
        .hint {
            opacity: 0.7;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <h1>Window callback regression test</h1>
    <div class="hint">This window is real. The script drives it through the native bridge.</div>
</body>
</html>
`;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
    console.log('=== Window Callback Regression Tests ===\n');

    const events = [];
    const win = await create_window('Window Callback Regression Test', HTML, {
        width: 800,
        height: 600,
    });

    function logEvent(name, payload) {
        const suffix = payload !== undefined ? `: ${JSON.stringify(payload)}` : '';
        console.log(`on_${name}${suffix}`);
        events.push(name);
    }

    win.on_context_menu = (items) => {
        logEvent('context_menu', { count: items.length });
        return items;
    };
    win.on_close = () => logEvent('close');
    win.on_show = () => logEvent('show');
    win.on_hide = () => logEvent('hide');
    win.on_resize = (size) => logEvent('resize', size);
    win.on_move = (pos) => logEvent('move', pos);
    win.on_focus = () => logEvent('focus');
    win.on_blur = () => logEvent('blur');
    win.on_maximize = () => logEvent('maximize');
    win.on_minimize = () => logEvent('minimize');
    win.on_restore = () => logEvent('restore');

    const startPromise = ewvjs.start();
    await win.run();

    await sleep(1000);

    const jsCallback = win.options.jsCallback;
    if (typeof jsCallback !== 'function') {
        throw new Error('Expected window.options.jsCallback to be installed');
    }

    await jsCallback(['context_menu_requested', [{ label: 'Copy' }, { label: 'Paste' }], '1']);

    await win.setPosition(120, 240);
    await sleep(250);

    await win.setSize(820, 620);
    await sleep(250);

    await win.hide();
    await sleep(250);
    await win.show();
    await sleep(250);

    await jsCallback(['focus_changed', true]);
    await jsCallback(['focus_changed', false]);

    await win.maximize();
    await sleep(250);
    await win.restore();
    await sleep(250);
    await win.minimize();
    await sleep(250);
    await win.restore();
    await sleep(250);

    await win.close();
    await startPromise;

    const expectedEvents = [
        'context_menu',
        'show',
        'hide',
        'focus',
        'blur',
        'move',
        'resize',
        'minimize',
        'maximize',
        'restore',
        'close',
    ];

    for (const eventName of expectedEvents) {
        if (!events.includes(eventName)) {
            throw new Error(`Expected callback not fired: on_${eventName}`);
        }
    }

    if (!win.is_closed) {
        throw new Error('Window should be marked closed after the closed event');
    }

    const closeEventCount = events.filter((event) => event === 'close').length;
    if (closeEventCount !== 1) {
        throw new Error(`Expected on_close to fire once, got ${closeEventCount}`);
    }

    const maximizeCount = events.filter((event) => event === 'maximize').length;
    const minimizeCount = events.filter((event) => event === 'minimize').length;
    const restoreCount = events.filter((event) => event === 'restore').length;
    if (maximizeCount !== 1 || minimizeCount !== 1 || restoreCount < 2) {
        throw new Error(
            `Expected resize state callbacks to fire, got maximize=${maximizeCount}, minimize=${minimizeCount}, restore=${restoreCount}`,
        );
    }

    console.log('✓ all available on_* callbacks fired');
    console.log('✓ resize state callbacks fired');
    console.log('✓ close state updated once');
}

runTests().catch((err) => {
    console.error('\nRegression test failed:', err);
    process.exit(1);
});