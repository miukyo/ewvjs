# ewvjs Templates

This directory contains project templates for the `ewvjs init` command.

## Available Templates

### minimal
A minimal "Hello World" template for quick testing.

**Features:**
- Single HTML page with inline styles
- No backend APIs
- Simple gradient background
- Perfect for quick prototypes

**Files:**
- `app.js` - Minimal window creation
- `package.json`
- `README.md`
- `.gitignore`

**Usage:**
```bash
ewv init my-minimal-app --template minimal
```

---

### basic (default)
An interactive application demonstrating exposed Node.js functions.

**Features:**
- Interactive UI with input fields and buttons
- Backend functions exposed to frontend (`greet`, `getSystemInfo`)
- Vibrancy effect
- Debug mode enabled
- Inline HTML with embedded styles

**Files:**
- `app.js` - Main application with exposed APIs
- `package.json`
- `README.md`
- `.gitignore`

**Usage:**
```bash
ewv init my-app
# or explicitly:
ewv init my-app --template basic
```

---

### advanced
A comprehensive template showcasing multiple features.

**Features:**
- Multiple windows support
- File system operations (read, write, list)
- System information retrieval
- External HTML/CSS/JS files
- Organized project structure with assets folder
- More complex UI with multiple sections

**Files:**
- `app.js` - Main application with advanced APIs
- `index.html` - Separate HTML file
- `assets/styles.css` - External stylesheet
- `assets/app.js` - Frontend JavaScript
- `package.json`
- `README.md`
- `.gitignore`

**Usage:**
```bash
ewv init my-advanced-app --template advanced
```

## Template File Format

Template files use the `.tpl` extension and support template variables:

- `{{PROJECT_NAME}}` - Replaced with the project name

Example:
```json
{
  "name": "{{PROJECT_NAME}}",
  "version": "1.0.0"
}
```

## Adding New Templates

1. Create a new directory in `templates/`
2. Add template files with `.tpl` extension
3. Use `{{PROJECT_NAME}}` for dynamic project name
4. Update `lib/templates.js` to include the new template in `getAvailableTemplates()`

## Directory Structure

```
templates/
├── minimal/
│   ├── app.js.tpl
│   ├── package.json.tpl
│   ├── README.md.tpl
│   └── .gitignore.tpl
├── basic/
│   ├── app.js.tpl
│   ├── package.json.tpl
│   ├── README.md.tpl
│   └── .gitignore.tpl
└── advanced/
    ├── app.js.tpl
    ├── index.html.tpl
    ├── package.json.tpl
    ├── README.md.tpl
    ├── .gitignore.tpl
    └── assets/
        ├── app.js.tpl
        └── styles.css.tpl
```
