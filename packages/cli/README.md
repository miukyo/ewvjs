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
# Basic template (default - interactive with APIs)
ewvjs-cli init my-app --template basic
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
- `--compress` - Compress the executable with UPX
- `--no-native` - Skip bundling native DLLs

### Example

```bash
# Create a new project
ewvjs-cli init my-awesome-app
cd my-awesome-app

# Install dependencies
npm install

# Run in development
npm start

# Create with a specific template
ewvjs-cli init simple-app --template basic

# Package for distribution
ewvjs-cli package app.js -o MyAwesomeApp -n "My Awesome App" -i icon.ico --compress
```

## License

MIT
