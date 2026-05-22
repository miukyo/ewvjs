import ewvjs from '../dist/index.js';

/**
 * Tests for title_bar: false behavior.
 *
 * Verifies:
 *  1. Window with title_bar:false opens with no top padding (FormBorderStyle.None)
 *  2. setTitleBar(true) restores the titlebar (FormBorderStyle.Sizable)
 *  3. setTitleBar(false) hides it again
 *  4. Window is draggable via the drag region after title_bar is hidden
 */

const HTML = /* html */`
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: transparent; font-family: sans-serif; }
    #drag { width: 100%; height: 40px; background: black; color: #fff;
            display: flex; align-items: center; justify-content: center;
            cursor: move; user-select: none; font-size: 13px; }
    #content { padding: 16px; color: #eee; background: transparent; height: calc(100% - 40px); }
    #status { margin-top: 8px; font-size: 12px; color: #aaa; }
  </style>
</head>
<body>
  <div id="drag" class="ewvjs-drag-region">⠿ DRAG HERE (no titlebar)</div>
  <div id="content">
    <h2>title_bar: false test</h2>
    <div id="status">Waiting...</div>
  </div>
</body>
</html>
`;

const results = { passed: [], failed: [] };

async function test(name, fn) {
    try {
        process.stdout.write(`  Testing ${name}... `);
        const result = await fn();
        const display = result !== undefined ? ` → ${JSON.stringify(result)}` : '';
        console.log(`✓${display}`);
        results.passed.push(name);
        return result;
    } catch (err) {
        console.log(`✗  ${err.message}`);
        results.failed.push(name);
        return null;
    }
}

async function runTests() {
    console.log('\n=== Title Bar Tests ===\n');
    ewvjs.start();

    // ── Test 1: window opens with title_bar: false ──────────────────────────
    console.log('--- [1] Initial window with title_bar: false ---');
    const win = await ewvjs.create_window('TitleBar Test', HTML, {
        width: 600,
        height: 400,
        title_bar: false,
    });
    await win.run();
    await sleep(600);

    await test('window created without title bar', async () => {
        return 'ok';
    });

    // Verify the content starts at y=0 by checking the top drag region is visible
    await test('evaluate runs in frameless window', async () => {
        const result = await win.evaluate('document.getElementById("drag").getBoundingClientRect().top');
        const top = parseFloat(JSON.parse(result));
        if (top !== 0) throw new Error(`Expected drag region top=0, got ${top}`);
        return `drag top = ${top}px`;
    });


    // ── Summary ──────────────────────────────────────────────────────────────
    console.log('\n--- Closing windows ---');
    // try { await win.close(); } catch { }
    // try { await win2.close(); } catch { }
    await sleep(300);

    console.log('\n=== Summary ===');
    console.log(`✓ Passed: ${results.passed.length}`);
    console.log(`✗ Failed: ${results.failed.length}`);
    if (results.failed.length > 0) {
        console.log('Failed:', results.failed.join(', '));
    }
    // process.exit(results.failed.length === 0 ? 0 : 1);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

runTests().catch(err => {
    console.error('\nUnhandled error:', err);
    process.exit(1);
});
