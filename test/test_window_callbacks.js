import { Window } from '../dist/index.js';

function createFakePlatform() {
    return {
        async createWindow() {
            return {
                close() { return 'closed'; },
                maximize() { return 'maximized'; },
            };
        }
    };
}

async function runTests() {
    console.log('=== Window Callback Regression Tests ===\n');

    const events = [];
    const window = new Window(createFakePlatform(), {}, {});

    window.on_close = () => events.push('close');
    window.on_maximize = () => events.push('maximize');

    await window.run();

    const jsCallback = window.options.jsCallback;
    if (typeof jsCallback !== 'function') {
        throw new Error('Expected window.options.jsCallback to be installed');
    }

    await jsCallback(['resized', { width: 800, height: 600, state: 'maximized' }]);
    await jsCallback(['closed', '']);

    if (!events.includes('maximize')) {
        throw new Error('on_maximize was not called for a maximized resize event');
    }

    if (!events.includes('close')) {
        throw new Error('on_close was not called for a closed event');
    }

    if (!window.is_closed) {
        throw new Error('Window should be marked closed after the closed event');
    }

    const closedEventCount = events.filter((event) => event === 'close').length;
    if (closedEventCount !== 1) {
        throw new Error(`Expected on_close to fire once, got ${closedEventCount}`);
    }

    console.log('✓ on_maximize fired from resized message');
    console.log('✓ on_close fired from closed message');
    console.log('✓ closed state updated once');
}

runTests().catch((err) => {
    console.error('\nRegression test failed:', err);
    process.exit(1);
});