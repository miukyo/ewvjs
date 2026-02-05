# ewvjs

**Embedded WebView for JavaScript**

`ewvjs` allows you to create modern desktop applications using Node.js and the Microsoft Edge WebView2 control. It provides a lightweight, native GUI experience with full access to Node.js APIs.

## Features

- 🪟 **Native Window Management**: Create, control, and customize native Windows.
- 🌐 **Modern Web Technologies**: Build your UI with HTML, CSS, and JavaScript.
- ⚡ **Node.js Integration**: Call Node.js functions directly from your frontend code.
- 🖱️ **Context Menus**: Customizable native right-click context menus.
- 📦 **Packaging**: Built-in CLI tool to package your app into a standalone executable.
- 🔧 **Native Bindings**: High-performance C# bindings via `node-api-dotnet`.
- 🖼️ **Customization**: Support for frameless windows, transparency, dark mode, and more.

## Installation

```bash
npm install ewvjs
```

## Quick Start

Create a simple application:

```javascript
const { create_window, start } = require('ewvjs');

// Create a new window
const win = create_window('My App', 'https://www.google.com', {
    width: 1024,
    height: 768,
    dark_mode: true
});

// Run the window
win.run();

// Keep the application alive
start();
```

### Exposing Node.js Functions

You can expose Node.js functions to your frontend code easily:

**Backend (Node.js):**
```javascript
const { create_window, expose, start } = require('ewvjs');
const os = require('os');

// Expose a function to specific window or globally
expose('getSystemInfo', () => {
    return {
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length
    };
});

const win = create_window('System Info', 'index.html', { width: 400, height: 300 });
win.run();
start();
```

**Frontend (HTML/JS):**
```javascript
// Call the exposed function via window.ewvjs.api
async function showInfo() {
    const info = await window.ewvjs.api.getSystemInfo();
    console.log(info);
}
```

## API Reference

### `create_window(title, url, options)`

Creates a new WebView window.

*   `title` (string): The window title.
*   `url` (string): The URL to load (http/https) or path to a local HTML file or HTML string.
*   `options` (object): Configuration options.

### Window Options

```typescript
{
    title?: string;              // Window title (overrides create_window arg)
    url?: string;                // URL to load (overrides create_window arg)
    html?: string;               // HTML content to load directly
    width?: number;              // Window width
    height?: number;             // Window height
    x?: number;                  // X position
    y?: number;                  // Y position
    resizable?: boolean;         // Allow resizing
    fullscreen?: boolean;        // Start in fullscreen
    hidden?: boolean;            // Start hidden
    frameless?: boolean;         // Remove window frame
    focus?: boolean;             // Focus window on creation
    minimized?: boolean;         // Start minimized
    maximized?: boolean;         // Start maximized
    on_top?: boolean;            // Keep window on top
    confirm_close?: boolean;     // Require confirmation before closing
    transparent?: boolean;       // Transparent background
    background_color?: string;   // Hex color (e.g. "#FFFFFF")
    vibrancy?: boolean;          // Enable window vibrancy/acrylic effect
    dark_mode?: boolean;         // Enable dark mode
    title_bar?: boolean;         // Show/hide title bar (if not frameless)
    icon?: string;               // Path to .ico file
    session?: {
        persist?: boolean;       // Persist cookies/localStorage
        path?: string;           // Custom user data path
        envname?: string;        // WebView2 Environment name
    };
    additional_args?: string;     // Additional WebView2 arguments
    debug?: boolean;              // Enable debug tools/console
}
```

### Window Methods

Once a window is created, you can control it using the returned `Window` instance:

*   **Lifecycle**: `run()`, `close()`, `destroy()`
*   **State**: `maximize()`, `minimize()`, `restore()`, `show()`, `hide()`, `focus()`, `blur()`
*   **Size & Position**:
    *   `getSize()`, `setSize(w, h)`, `resize(w, h)`
    *   `getPosition()`, `setPosition(x, y)`, `move(x, y)`
*   **Interaction**:
    *   `setTitle(title)`
    *   `navigate(url)`
    *   `evaluate(script)`: Execute JavaScript in the WebView.
    *   `setIcon(path)`
*   **Cookies**: `get_cookies()`, `set_cookie(...)`, `clear_cookies()`

### Custom Context Menus

Define native context menus using `on_context_menu`:

```javascript
win.on_context_menu = (params) => {
    return [
        { label: 'Refresh', click: () => win.reload() },
        { type: 'separator' },
        { label: 'Exit', click: () => win.close() }
    ];
};
```

## CLI & Packaging

`ewvjs` comes with a CLI tool to package your application into a standalone executable.

```bash
npx ewvjs package app.js --output myapp.exe --icon icon.ico
```

**Options:**
*   `--output, -o`: Output filename.
*   `--icon, -i`: Path to application icon (.ico).
*   `--assets, -a`: Directory of assets to copy.
*   `--target, -t`: Target platform (default: node18-win-x64).

## License

MIT LICENSE
