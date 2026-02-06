# ewvjs-cli

CLI tool for packaging ewvjs applications into standalone executables.

## Installation

```bash
npm install -g ewvjs-cli
```

Or use with npx:

```bash
npx ewvjs-cli ewv --help
```

## Usage

### List available templates

```bash
ewv init --list-templates
```

### Initialize a new ewvjs project

```bash
ewv init my-app
```

With a specific template:

```bash
# Minimal template (simple Hello World)
ewv init my-app --template minimal

# Basic template (default - interactive with APIs)
ewv init my-app --template basic

# Advanced template (multiple windows, file operations)
ewv init my-app --template advanced
```

### Package your application

```bash
ewv package app.js -o myapp -n "My Application"
```

#### Options

- `-o, --output <name>` - Output executable name (default: "app")
- `-a, --assets <dir>` - Assets directory to include (default: "./assets")
- `-i, --icon <file>` - Application icon (.ico file)
- `-n, --name <name>` - Application name (default: "My App")
- `-t, --target <target>` - Target platform (default: "node18-win-x64")
- `-m, --modules <modules>` - Additional node modules to bundle (comma-separated)
- `--compress` - Compress the executable with UPX
- `--no-native` - Skip bundling native DLLs

### Example

```bash
# Create a new project
ewv init my-awesome-app
cd my-awesome-app

# Install dependencies
npm install

# Run in development
npm start

# Create with a specific template
ewv init simple-app --template minimal

# Create an advanced app
ewv init pro-app --template advanced

# Package for distribution
ewv package app.js -o MyAwesomeApp -n "My Awesome App" -i icon.ico --compress
```

## Templates

ewvjs-cli includes three project templates:

### minimal
A simple "Hello World" template - perfect for quick testing.

### basic (default)
Interactive application with exposed Node.js functions and a polished UI.

### advanced
Comprehensive template with multiple windows, file operations, and external assets.

Use `ewv init --list-templates` to see all available templates.

## License

MIT
