import { create_window, start, expose } from 'ewvjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

expose('greet', (name) => {
  return `Hello, ${name}! This is from Node.js 🚀`;
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
const window = create_window('Hello ewvjs', `file://${path.resolve('assets/index.html')}`, {
  width: 800,
  height: 600,
  debug: true
});

window.run();

// Start the event loop
start();
