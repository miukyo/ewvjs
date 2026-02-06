const { create_window, start, expose } = require('ewvjs');
const path = require('path');

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
const window = create_window('Hello ewvjs', `file://${path.resolve('index.html')}`, {
  width: 800,
  height: 600,
  vibrancy: true,
  debug: true
});

window.run();

// Start the event loop
start();
