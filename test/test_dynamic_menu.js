const { create_window, start } = require('../dist/index');

async function runTests() {
    console.log("Starting Dynamic Context Menu verification...");

    const win = create_window("Dynamic Context Menu Test", "data:text/html,<h1>Dynamic Context Menu</h1><p>Right-click. The menu is created DYNAMICALLY in JS based on where you click (simulated here).</p>", {
        width: 800,
        height: 600
    });

    win.on_context_menu = (defaultItems) => {
        console.log("Context menu requested. Default items count:", defaultItems.length);

        // Return a custom menu
        return [
            {
                label: 'Custom Action',
                click: () => console.log('Custom Action clicked!')
            },
            { type: 'separator' },
            {
                label: 'Debug Info',
                submenu: [
                    {
                        label: `Default Items: ${defaultItems.length}`,
                        enabled: false
                    },
                    {
                        label: 'Show Default Items in Console',
                        click: () => console.log('Default items:', defaultItems)
                    }
                ]
            }
        ];
    };

    await win.run();

    console.log("Window created. Please right-click and test the dynamic menu.");
    await start();
}

runTests().catch(console.error);
