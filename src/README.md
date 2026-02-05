# Source Code Structure

The TypeScript source code is organized into logical modules for better readability and maintainability.

## Module Overview

### `index.ts`
Main entry point that exports the public API. This is what users import when using ewvjs.

**Exports:**
- `WebView` class
- `Window` class
- All type definitions
- Convenience functions: `create_window()`, `start()`, `expose()`
- Default singleton instance

### `webview.ts`
Contains the `WebView` class which manages the application lifecycle.

**Responsibilities:**
- Platform detection and initialization
- Window creation and lifecycle management
- Exposed function registry
- Event loop management

**Key Methods:**
- `create_window()` - Creates a new window instance
- `start()` - Starts the application event loop
- `expose()` - Registers Node.js functions to be callable from WebView

### `window.ts`
Contains the `Window` class which represents individual window instances.

**Responsibilities:**
- Window state management
- Message routing between WebView and Node.js
- Context menu handling
- Exposed function call/response handling
- API method delegation to platform

**Method Categories:**
- **Core**: `run()`, `close()`, `evaluate_js()`
- **State**: `maximize()`, `minimize()`, `restore()`, `show()`, `hide()`, `focus()`
- **Size/Position**: `getSize()`, `setSize()`, `getPosition()`, `setPosition()`, `move()`, `resize()`
- **Title**: `setTitle()`, `set_title()`
- **Title Bar**: `show_titlebar()`, `hide_titlebar()`
- **Cookies**: `get_cookies()`, `set_cookie()`, `clear_cookies()`

**Message Handling:**
- `_on_message()` - Routes messages from C# to appropriate handlers
- `_handleExposedFunction()` - Executes exposed Node.js functions
- `_handleContextMenu()` - Processes context menu requests
- `_handleMenuClick()` - Triggers menu item callbacks

### `types.ts`
Type definitions and interfaces.

**Types:**
- `ContextMenuItem` - Context menu item definition
- `WindowOptions` - Window configuration options

### `utils.ts`
Utility functions used across modules.

**Functions:**
- `getParamNames()` - Extracts parameter names from a function
- `generateId()` - Generates random IDs for menu items

## Data Flow

```
User Code
    ↓
index.ts (exports)
    ↓
webview.ts (creates Window instances)
    ↓
window.ts (manages window lifecycle)
    ↓
platforms/windows.ts (platform-specific implementation)
    ↓
csharp/WebViewWindow.cs (native WebView2 integration)
```

## Message Flow (Exposed Functions)

```
WebView JavaScript
    ↓ postMessage([funcName, params, id])
C# WebViewWindow.CoreWebView2_WebMessageReceived
    ↓ SendMessageAsync()
window.ts _on_message()
    ↓ _handleExposedFunction()
Node.js Function Execution
    ↓ _sendSuccessResponse()
window.evaluate_js()
    ↓ resolves promise in WebView
WebView JavaScript receives result
```

## Best Practices

1. **Window Creation**: Always call `window.run()` after creating a window
2. **Exposed Functions**: Register with `expose()` before creating windows
3. **Cleanup**: Windows automatically clean up on close
4. **Error Handling**: All async methods can throw - use try/catch
5. **Threading**: All window operations are automatically marshaled to the correct thread

## Example Usage

```typescript
import ewvjs from 'ewvjs';

// Expose a Node.js function
ewvjs.expose('greet', (name: string) => {
    return `Hello, ${name}!`;
});

// Create and run a window
const win = ewvjs.create_window('My App', '<h1>Test</h1>');
await win.run();

// Start the event loop
await ewvjs.start();
```
