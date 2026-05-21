# ewvjs-cli

CLI tool for packaging ewvjs applications into standalone executables.

## Installation

```bash
npm install -g ewvjs-cli
```

Or use with npx:

```bash
npx ewvjs-cli --help
```

## Usage

### List available templates

```bash
ewvjs-cli init --list-templates
```

### Initialize a new ewvjs project

```bash
ewvjs-cli init my-app
```

With a specific template:

```bash
# Basic template (default - plain HTML/JS frontend)
ewvjs-cli init my-app --template basic

# React template (premium React 19 + Vite 8 + TypeScript dashboard)
ewvjs-cli init my-app --template react
```

### Package your application

```bash
ewvjs-cli package app.js -o myapp -n "My Application"
```

#### Options

- `-o, --output <name>` - Output executable name (default: "app")
- `-a, --assets <dir>` - Assets directory to include (default: "./assets")
- `-i, --icon <file>` - Application icon (.ico file)
- `-n, --name <name>` - Application name (default: "My App")
- `-t, --target <target>` - Target platform (default: "node18-win-x64")
- `-m, --modules <modules>` - Additional node modules to bundle (comma-separated)

### Example

```bash
# Create a new project
ewvjs-cli init my-awesome-app
cd my-awesome-app

# Install dependencies
npm install

# Run in development
npm start

# Create a React project
ewvjs-cli init simple-app --template react

# Package for distribution
ewvjs-cli package app.js -o MyAwesomeApp -n "My Awesome App" -i icon.ico
```

## License

MIT
