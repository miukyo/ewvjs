const { settings } = require('node:cluster');
const ewvjs = require('../dist/index');

async function test() {
    console.log('Creating window for features test...');
    const html = `
        <html>
        <head>
            <style>
                html,body {
                background-color: transparent;
                }
                .ewvjs-drag-region {
                    width: 100%;
                    height: 50px;
                    background: #333;
                    color: white;
                    text-align: center;
                    line-height: 50px;
                    cursor: move;
                    user-select: none;
                }
            </style>
        </head>
        <body>
            <div class="ewvjs-drag-region">DRAG ME</div>
            <h1>Features Test</h1>
            <button onclick="window.ewvjs.api.log('Hello from JS')">Log to Node</button>
        </body>
        </html>
    `;
    const w = ewvjs.create_window('Features Test', html, { vibrancy: true, title_bar: false });

    ewvjs.expose('log', (msg) => console.log('JS says:', msg));

    await w.run();
    console.log('Window running.');

    // Wait for API injection
    console.log('Waiting for API to be injected...');
    await new Promise(r => setTimeout(r, 1000));

    // 1. Test Title
    console.log('Testing set_title...');
    await w.set_title('New Title Work');

    // // 2. Test State
    // console.log('Testing maximize...');
    // await w.maximize();
    // // await new Promise(r => setTimeout(r, 1000));

    // console.log('Testing restore...');
    // await w.restore();
    await new Promise(r => setTimeout(r, 1000));

    // // 3. Test Resize
    // console.log('Testing resize...');
    // await w.resize(600, 400);

    // // 4. Test Move
    // console.log('Testing move...');
    // await w.move(100, 100);

    // 5. Test Cookies
    console.log('Testing cookies...');
    await w.evaluate_js('document.cookie = "test=123"');
    const cookies = await w.get_cookies();
    console.log('Cookies:', cookies);

    // 6. Test Title Bar
    console.log('Testing title bar toggle...');
    // await w.hide_titlebar();
    await new Promise(r => setTimeout(r, 2000));
    // await w.show_titlebar();

    console.log('Features test sequence complete. Observe the window.');
    await ewvjs.start();
    console.log('All windows closed. Test complete.');

}

test().catch(console.error);
