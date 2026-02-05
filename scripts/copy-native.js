const fs = require('fs');
const path = require('path');

// Determine which .NET version to use (prefer net10.0-windows if exists, otherwise net9.0-windows)
const sourceBasePath = path.join(__dirname, '..', 'src', 'csharp', 'bin', 'Release');
let sourcePath;

if (fs.existsSync(path.join(sourceBasePath, 'net10.0-windows'))) {
    sourcePath = path.join(sourceBasePath, 'net10.0-windows');
    console.log('Using .NET 10.0 native binaries');
} else if (fs.existsSync(path.join(sourceBasePath, 'net9.0-windows'))) {
    sourcePath = path.join(sourceBasePath, 'net9.0-windows');
    console.log('Using .NET 9.0 native binaries');
} else {
    console.error('Error: No compiled native binaries found. Please build the C# project first.');
    console.error('Run: dotnet build src/csharp/WebView.csproj -c Release');
    process.exit(1);
}

const targetPath = path.join(__dirname, '..', 'native');

// Create target directory if it doesn't exist
if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
}

// Also create dist/js directory for api.js
const distJsPath = path.join(__dirname, '..', 'dist', 'js');
if (!fs.existsSync(distJsPath)) {
    fs.mkdirSync(distJsPath, { recursive: true });
}

// Copy api.js to dist/js
const apiJsSrc = path.join(__dirname, '..', 'src', 'js', 'api.js');
const apiJsDest = path.join(distJsPath, 'api.js');
if (fs.existsSync(apiJsSrc)) {
    fs.copyFileSync(apiJsSrc, apiJsDest);
    // console.log('✓ Copied api.js to dist/js');
}

// Copy function
function copyRecursive(src, dest) {
    if (fs.statSync(src).isDirectory()) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        const entries = fs.readdirSync(src);
        for (const entry of entries) {
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

// Files and directories to copy
const itemsToCopy = [
    'WebView.dll',
    'WebView.cjs',
    'WebView.mjs',
    'WebView.d.ts',
    'WebView.deps.json',
    'import.cjs',
    'Microsoft.Web.WebView2.Core.dll',
    'Microsoft.Web.WebView2.WinForms.dll',
    'Microsoft.Web.WebView2.Wpf.dll',
    'runtimes'
];

// console.log(`Copying native binaries from ${sourcePath} to ${targetPath}...`);

for (const item of itemsToCopy) {
    const src = path.join(sourcePath, item);
    const dest = path.join(targetPath, item);
    
    if (fs.existsSync(src)) {
        copyRecursive(src, dest);
        // console.log(`✓ Copied ${item}`);
    } else {
        console.warn(`⚠ Warning: ${item} not found at ${src}`);
    }
}

// Copy node-api-dotnet module
// console.log('Copying node-api-dotnet module...');
const nodeApiDotnetSrc = path.join(__dirname, '..', 'node_modules', 'node-api-dotnet');
const nodeApiDotnetDest = path.join(targetPath, 'node_modules', 'node-api-dotnet');

if (fs.existsSync(nodeApiDotnetSrc)) {
    copyRecursive(nodeApiDotnetSrc, nodeApiDotnetDest);
    // console.log('✓ Copied node-api-dotnet module');
} else {
    console.warn('⚠ Warning: node-api-dotnet module not found');
}

console.log('Native binaries copied successfully!');
