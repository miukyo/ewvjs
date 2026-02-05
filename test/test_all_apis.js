const { create_window } = require('../dist/index.js');

async function testAllAPIs() {
    console.log('=== Testing All Window APIs ===\n');
    
    const win = create_window('API Test Window', 'https://www.google.com', {
        width: 800,
        height: 600,
        session: { persist: true }
    });

    await win.run();
    console.log('✓ Window created and initialized\n');
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    const results = {
        passed: [],
        failed: []
    };

    async function test(name, fn) {
        try {
            console.log(`Testing ${name}...`);
            const result = await fn();
            console.log(`✓ ${name} passed`, result !== undefined ? `- Result: ${JSON.stringify(result)}` : '');
            results.passed.push(name);
            return result;
        } catch (error) {
            console.error(`✗ ${name} failed:`, error.message);
            results.failed.push(name);
            return null;
        }
    }

    // Test getter methods
    console.log('\n--- Testing Getter Methods ---');
    await test('getSize', async () => {
        const size = await win.getSize();
        if (!size || typeof size.width !== 'number' || typeof size.height !== 'number') {
            throw new Error('Invalid size returned');
        }
        return size;
    });

    await test('getPosition', async () => {
        const pos = await win.getPosition();
        if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
            throw new Error('Invalid position returned');
        }
        return pos;
    });

    // Test setter methods
    console.log('\n--- Testing Setter Methods ---');
    await test('setTitle', async () => {
        await win.setTitle('Updated Test Title');
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'Title updated';
    });

    await test('setSize', async () => {
        await win.setSize(900, 650);
        await new Promise(resolve => setTimeout(resolve, 100));
        const newSize = await win.getSize();
        return newSize;
    });

    await test('setPosition', async () => {
        await win.setPosition(100, 100);
        await new Promise(resolve => setTimeout(resolve, 100));
        const newPos = await win.getPosition();
        return newPos;
    });

    // Test window state methods
    console.log('\n--- Testing Window State Methods ---');
    await test('maximize', async () => {
        await win.maximize();
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'Maximized';
    });

    await test('restore', async () => {
        await win.restore();
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'Restored';
    });

    await test('minimize', async () => {
        await win.minimize();
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'Minimized';
    });

    await test('restore (from minimize)', async () => {
        await win.restore();
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'Restored from minimize';
    });

    // Test visibility methods
    console.log('\n--- Testing Visibility Methods ---');
    await test('hide', async () => {
        await win.hide();
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'Hidden';
    });

    await test('show', async () => {
        await win.show();
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'Shown';
    });

    await test('focus', async () => {
        await win.focus();
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'Focused';
    });

    // Test title bar
    console.log('\n--- Testing Title Bar ---');
    await test('hide title bar', async () => {
        await win.hide_titlebar();
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'Title bar hidden';
    });

    await test('show title bar', async () => {
        await win.show_titlebar();
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'Title bar shown';
    });

    // Test evaluate (JavaScript execution)
    console.log('\n--- Testing JavaScript Evaluation ---');
    await test('evaluate (simple)', async () => {
        const result = await win.evaluate_js('2 + 2');
        return `Result: ${result}`;
    });

    await test('evaluate (document.title)', async () => {
        const title = await win.evaluate_js('document.title');
        return `Page title: ${title}`;
    });

    // Test cookies
    console.log('\n--- Testing Cookie Methods ---');
    await test('setCookie', async () => {
        await win.set_cookie('test_cookie', 'test_value', '.google.com', '/');
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'Cookie set';
    });

    await test('getCookies', async () => {
        const cookies = await win.get_cookies();
        return `Found ${cookies ? cookies.length : 0} cookies`;
    });

    // Note: clearCookies would clear all cookies including session ones, so skip for now
    // await test('clearCookies', async () => {
    //     await win.clear_cookies();
    //     return 'Cookies cleared';
    // });

    // Test resize/move convenience methods
    console.log('\n--- Testing Convenience Methods ---');
    await test('resize', async () => {
        await win.resize(850, 700);
        await new Promise(resolve => setTimeout(resolve, 100));
        const size = await win.getSize();
        return size;
    });

    await test('move', async () => {
        await win.move(150, 150);
        await new Promise(resolve => setTimeout(resolve, 100));
        const pos = await win.getPosition();
        return pos;
    });

    // Test getting window dimensions
    console.log('\n--- Testing Dimension Getters ---');
    await test('get_width', async () => {
        const width = await win.get_width();
        return `Width: ${width}px`;
    });

    await test('get_height', async () => {
        const height = await win.get_height();
        return `Height: ${height}px`;
    });

    // Print summary
    console.log('\n\n=== Test Summary ===');
    console.log(`✓ Passed: ${results.passed.length}`);
    console.log(`✗ Failed: ${results.failed.length}`);
    console.log(`Total: ${results.passed.length + results.failed.length}`);
    
    if (results.passed.length > 0) {
        console.log('\nPassed tests:', results.passed.join(', '));
    }
    
    if (results.failed.length > 0) {
        console.log('\nFailed tests:', results.failed.join(', '));
    }

    // Cleanup
    console.log('\n\nClosing window...');
    try {
        await win.destroy();
    } catch (e) {
        // Ignore close errors
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('Test complete!');
    process.exit(results.failed.length === 0 ? 0 : 1);
}

testAllAPIs().catch(err => {
    console.error('Test failed with error:', err);
    process.exit(1);
});
