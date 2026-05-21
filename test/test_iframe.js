import { create_window } from '../dist/index.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testRealWorldIframeBypass() {
    console.log('=== Testing Cross-Origin IFrame Bypass with a Real-World Website ===\n');

    // Resolve path to parent.html
    const parentHtmlPath = path.resolve(__dirname, 'parent.html');
    console.log(`Loading parent page from: ${parentHtmlPath}`);

    // Create the window using the parent HTML path
    // ewvjs serves this file on a local HTTP server at http://localhost:<port>
    const win = await create_window('Cross-Origin Bypass Test', parentHtmlPath, {
        width: 1024,
        height: 768,
        debug: true
    });

    await win.run();
    console.log('✓ Window created and running. Waiting 5 seconds for example.com to load...');

    // Wait for the window and the cross-origin iframe to load
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Demonstrating the Same-Origin Policy (SOP) Block
    console.log('\n--- SOP Test: Attempting standard top-level browser JS access to the iframe ---');
    try {
        const result = await win.evaluate("document.getElementsByName('cross_origin_frame')[0].contentDocument.body.innerHTML");
        console.log('SOP Access Result:', result);
        console.log('⚠️ Warning: Browser did not throw an error (might have returned null or empty).');
    } catch (e) {
        console.log('✓ Expected Block: Standard browser JS access failed due to Same-Origin Policy:', e.message);
    }

    // Test 1: Natively query the cross-origin iframe using its name string
    console.log('\n--- Test 1: Querying cross-origin iframe natively by frame name ---');
    console.log('Executing script directly inside the example.com iframe context...');
    const innerHeading = await win.evaluate("document.querySelector('h1').innerText", 'cross_origin_frame');
    console.log('Read heading value:', innerHeading);
    if (innerHeading !== '"Example Domain"') {
        console.error(`✗ Fail: Expected '"Example Domain"', got ${innerHeading}`);
        process.exit(1);
    }
    console.log('✓ Test 1 Passed: Successfully read heading from cross-origin iframe!');

    // Test 2: Natively mutate the cross-origin iframe (Bypassing same-origin write restrictions)
    console.log('\n--- Test 2: Mutating cross-origin iframe natively by frame name ---');
    console.log('Modifying the example.com page heading...');
    await win.evaluate("document.querySelector('h1').innerText = 'Hacked Natively by Host API'", 'cross_origin_frame');

    // Read it back to verify
    const updatedHeading = await win.evaluate("document.querySelector('h1').innerText", 'cross_origin_frame');
    console.log('Updated heading value:', updatedHeading);
    if (updatedHeading !== '"Hacked Natively by Host API"') {
        console.error(`✗ Fail: Expected '"Hacked Natively by Host API"', got ${updatedHeading}`);
        process.exit(1);
    }
    console.log('✓ Test 2 Passed: Successfully mutated heading inside cross-origin iframe!');

    console.log('\nAll cross-origin bypass tests passed successfully! Closing window...');
    try {
        await win.close();
    } catch (e) { }

    process.exit(0);
}

testRealWorldIframeBypass().catch(err => {
    console.error('Test failed with error:', err);
    process.exit(1);
});
