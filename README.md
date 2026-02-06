<img width="786" height="593" alt="image" src="https://github.com/user-attachments/assets/94957de5-1abd-458f-84cf-43174e05015c" />

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
- 🖼️ **Customization**: Support for frameless windows, transparency, vibrancy, and more.

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

### `start()`

Starts the application event loop. This keeps the Node.js process alive until all windows are closed.

### `expose(name, callback)`

Exposes a Node.js function to the frontend.

*   `name` (string): The name of the function as it will appear in `window.ewvjs.api`.
*   `callback` (function): The Node.js function to execute. Can be async.

### Window Options

```typescript
{
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
*   **State**: `maximize()`, `minimize()`, `restore()`, `hide()`, `focus()`, `show()`
*   **Size & Position**:
    *   `getSize()`, `setSize(w, h)`, `resize(w, h)`
    *   `getPosition()`, `setPosition(x, y)`, `move(x, y)`
*   **Interaction**:
    *   `setTitle(title)`
    *   `evaluate(script)`: Execute JavaScript in the WebView.
    *   `setIcon(path)`
*   **Cookies**: `get_cookies()`, `set_cookie(...)`, `clear_cookies()`

### Custom Context Menus

Define native context menus using `on_context_menu`. It should return an array of `ContextMenuItem` objects.

#### ContextMenuItem Interface

```typescript
interface ContextMenuItem {
    label?: string;
    type?: 'normal' | 'separator' | 'checkbox' | 'submenu';
    checked?: boolean;
    enabled?: boolean;
    submenu?: ContextMenuItem[];
    click?: () => void;
}
```

Example:

```javascript
win.on_context_menu = (params) => {
    return [
        { label: 'Refresh', click: () => win.reload() },
        { type: 'separator' },
        { label: 'Exit', click: () => win.close() }
    ];
};
```

## CLI Reference

`ewvjs-cli` provides a command-line interface for creating and packaging applications.

### Installation

The CLI is included with the `ewvjs-cli` package and can be run using `npx`:

```bash
npx ewvjs-cli <command> [options]
```

### Commands

#### `init` - Initialize a New Project

Create a new ewvjs project with a sample application structure.

**Usage:**
```bash
npx ewvjs-cli init [name]
```

**Arguments:**
*   `name` - Project name (default: `my-ewvjs-app`)

**Example:**
```bash
npx ewvjs-cli init my-awesome-app
cd my-awesome-app
npm install
npm start
```

This creates:
*   `package.json` - Project configuration with scripts
*   `app.js` - Sample application with Node.js integration
*   `assets/` - Directory for static assets
*   `README.md` - Project documentation

---

#### `package` - Package Application

Package your ewvjs application into a standalone executable.

**Usage:**
```bash
npx ewvjs-cli package <entry> [options]
```

**Arguments:**
*   `entry` - Entry point JavaScript file (required, e.g., `app.js`)

**Options:**

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--output <name>` | `-o` | Output executable name (without .exe) | `app` |
| `--name <name>` | `-n` | Application name | `My App` |
| `--icon <file>` | `-i` | Path to application icon (.ico file) | None |
| `--assets <dir>` | `-a` | Assets directory to include in package | `./assets` |
| `--target <target>` | `-t` | Target platform | `node18-win-x64` |
| `--modules <modules>` | `-m` | Additional node modules to bundle (comma-separated) | None |
| `--no-native` | | Skip bundling native DLLs (if already included) | Includes by default |

**Examples:**

Basic packaging:
```bash
npx ewvjs-cli package app.js
```

Full customization:
```bash
npx ewvjs-cli package app.js \
  --output myapp \
  --name "My Application" \
  --icon icon.ico \
  --assets ./public \
  --modules axios,lodash \
  --compress
```

Package with custom target:
```bash
npx ewvjs-cli package app.js -o myapp -t node20-win-x64
```

**Output:**

The packaged application will be created in the `dist/` directory with:
*   `<output>.exe` - Standalone executable
*   Native WebView2 dependencies (unless `--no-native` is used)
*   Bundled assets from the specified directory

**Notes:**
*   Icon file must be in `.ico` format
*   Additional modules should be listed without spaces: `axios,lodash,express`
*   The `--compress` option requires UPX to be installed and available in PATH
*   Default target `node18-win-x64` works with Node.js 18+ on 64-bit Windows

### Getting Help

Display available commands and options:
```bash
npx ewvjs-cli --help
npx ewvjs-cli package --help
npx ewvjs-cli init --help
```

Display version:
```bash
npx ewvjs-cli --version
```

## License

MIT LICENSE
