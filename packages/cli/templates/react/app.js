import { create_window, start, expose } from 'ewvjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Expose API functions to the React frontend
expose('greet', (name) => {
  return `Hello, ${name}! This greeting is sent from Node.js 🚀`;
});

expose('getSystemInfo', () => {
  return {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    uptime: process.uptime(),
    memory: process.memoryUsage().heapUsed
  };
});

// Detect if running in development mode
const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

// In development, load from Vite dev server. In production, load from compiled dist folder.
const startUrl = isDev 
  ? 'http://localhost:5173' 
  : path.resolve(__dirname, 'dist/index.html');

console.log(`Launching application (isDev: ${isDev}). Loading: ${startUrl}`);

const window = create_window('ewvjs React Desktop App', startUrl, {
  width: 1000,
  height: 750,
  debug: true
});

window.run();

// Start ewvjs process event loop
start();
