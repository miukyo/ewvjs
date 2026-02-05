#!/usr/bin/env node

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const packageApp = require('../lib/packager');
const { setIcon } = require('../lib/icon');

const program = new Command();

program
  .name('ewvjs')
  .description('CLI tool for packaging ewvjs applications')
  .version(require('../package.json').version);

program
  .command('package')
  .description('Package your ewvjs application into a standalone executable')
  .argument('<entry>', 'Entry point JavaScript file (e.g., app.js)')
  .option('-o, --output <name>', 'Output executable name', 'app')
  .option('-a, --assets <dir>', 'Assets directory to include (e.g., ./assets)', './assets')
  .option('-i, --icon <file>', 'Application icon (.ico file)')
  .option('-n, --name <name>', 'Application name', 'My App')
  .option('-t, --target <target>', 'Target platform', 'node18-win-x64')
  .option('-m, --modules <modules>', 'Additional node modules to bundle (comma-separated, e.g., "axios,lodash")')
  .option('--compress', 'Compress the executable with UPX', false)
  .option('--no-native', 'Skip bundling native DLLs (use if already included)')
  .action(async (entry, options) => {
    try {
      console.log('📦 Packaging ewvjs application...\n');
      
      // Validate entry file exists
      const entryPath = path.resolve(process.cwd(), entry);
      if (!fs.existsSync(entryPath)) {
        console.error(`❌ Error: Entry file not found: ${entry}`);
        process.exit(1);
      }

      // Validate icon if provided
      if (options.icon) {
        const iconPath = path.resolve(process.cwd(), options.icon);
        if (!fs.existsSync(iconPath)) {
          console.error(`❌ Error: Icon file not found: ${options.icon}`);
          process.exit(1);
        }
        if (!iconPath.endsWith('.ico')) {
          console.error('❌ Error: Icon must be a .ico file');
          process.exit(1);
        }
      }

      // Parse additional modules if provided
      const additionalModules = options.modules 
        ? options.modules.split(',').map(m => m.trim()).filter(m => m)
        : [];

      const config = {
        entry: entryPath,
        output: options.output,
        assets: options.assets ? path.resolve(process.cwd(), options.assets) : null,
        icon: options.icon ? path.resolve(process.cwd(), options.icon) : null,
        name: options.name,
        target: options.target,
        compress: options.compress,
        includeNative: options.native,
        additionalModules: additionalModules
      };

      await packageApp(config);

      console.log('\n✅ Packaging complete!');
      console.log(`📁 Output: ${path.join(process.cwd(), 'dist', options.output + '.exe')}`);
      
    } catch (error) {
      console.error('\n❌ Packaging failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize a new ewvjs project')
  .argument('[name]', 'Project name', 'my-ewvjs-app')
  .action((name) => {
    const projectDir = path.join(process.cwd(), name);
    
    if (fs.existsSync(projectDir)) {
      console.error(`❌ Error: Directory ${name} already exists`);
      process.exit(1);
    }

    console.log(`📂 Creating new ewvjs project: ${name}\n`);
    
    // Create directory structure
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'assets'), { recursive: true });
    
    // Create package.json
    const packageJson = {
      name: name,
      version: '1.0.0',
      description: 'My ewvjs application',
      main: 'app.js',
      scripts: {
        start: 'node app.js',
        package: 'ewvjs package app.js -o myapp -n "My App"'
      },
      dependencies: {
        ewvjs: '^1.0.0'
      }
    };
    
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
    
    // Create sample app.js
    const appJs = `const { create_window, start, expose } = require('ewvjs');

expose('greet', (name) => {
  return \`Hello, \${name}! This is from Node.js 🚀\`;
});

expose('getSystemInfo', () => {
  return {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    uptime: process.uptime()
  };
});

// Create main window
const window = create_window('Hello ewvjs', \`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Hello ewvjs</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: sans-serif;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }
    
    .container {
      text-align: center;
      max-width: 600px;
    }
    
    h1 {
      font-size: 3em;
      margin-bottom: 20px;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
    }
    
    p {
      font-size: 1.2em;
      margin-bottom: 30px;
      opacity: 0.9;
    }
    
    input {
      width: 100%;
      padding: 15px;
      font-size: 16px;
      border: none;
      margin-bottom: 15px;
      background: rgba(255, 255, 255, 0.9);
      color: #333;
    }
    
    button {
      background: white;
      color: #000000;
      border: none;
      padding: 15px 30px;
      font-size: 18px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.3s ease;
      margin: 5px;
    }
    
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
    }
    
    button:active {
      transform: translateY(0);
    }
    
    .result {
      margin-top: 20px;
      padding: 20px;
      background: rgba(255, 255, 255, 0.15);
      min-height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .info {
      text-align: left;
      font-size: 0.9em;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 Hello ewvjs!</h1>
    <p>A lightweight WebView2 application for Windows</p>
    
    <input type="text" id="nameInput" placeholder="Enter your name..." value="World">
    
    <div>
      <button onclick="sayHello()">Greet Me</button>
      <button onclick="showSystemInfo()">System Info</button>
    </div>
    
    <div class="result" id="result">
      Click a button to see the result...
    </div>
  </div>
  
  <script>
    async function sayHello() {
      const name = document.getElementById('nameInput').value || 'World';
      const result = await window.ewvjs.api.greet(name);
      document.getElementById('result').innerHTML = '<strong>' + result + '</strong>';
    }
    
    async function showSystemInfo() {
      const info = await window.ewvjs.api.getSystemInfo();
      document.getElementById('result').innerHTML = 
        '<div class="info">' +
        '<strong>System Information:</strong><br>' +
        'Platform: ' + info.platform + '<br>' +
        'Architecture: ' + info.arch + '<br>' +
        'Node.js: ' + info.nodeVersion + '<br>' +
        'Uptime: ' + Math.floor(info.uptime) + ' seconds' +
        '</div>';
    }
  </script>
</body>
</html>
\`, {
  width: 800,
  height: 600,
  vibrancy: true,
  debug: true
});

window.run();

// Start the event loop
start();
`;
    
    fs.writeFileSync(path.join(projectDir, 'app.js'), appJs);
    
    // Create README
    const readme = `# ${name}

A ewvjs application.

## Getting Started

1. Install dependencies:
\`\`\`bash
npm install
\`\`\`

2. Run the application:
\`\`\`bash
npm start
\`\`\`

3. Package the application:
\`\`\`bash
npm run package
\`\`\`

## Project Structure

- \`app.js\` - Main application entry point
- \`assets/\` - Static assets (images, fonts, etc.)
- \`package.json\` - Project configuration

## Documentation

Visit [ewvjs documentation](https://github.com/your-repo/ewvjs) for more information.
`;
    
    fs.writeFileSync(path.join(projectDir, 'README.md'), readme);
    
    console.log('✅ Project created successfully!\n');
    console.log('Next steps:');
    console.log(`  cd ${name}`);
    console.log('  npm install');
    console.log('  npm start\n');
  });

program.parse();
