import { spawn } from 'child_process';
import http from 'http';

function checkViteReady(url, callback) {
  const req = http.get(url, () => {
    callback(true);
  });
  req.on('error', () => {
    callback(false);
  });
}

console.log('Starting Vite development server...');
const vite = spawn('npx', ['vite'], { stdio: 'inherit', shell: true });

// Check when Vite is ready at http://localhost:5173
console.log('Waiting for Vite server to boot...');
const checkInterval = setInterval(() => {
  checkViteReady('http://localhost:5173', (ready) => {
    if (ready) {
      clearInterval(checkInterval);
      console.log('✓ Vite server is ready! Launching ewvjs desktop window...');
      
      const app = spawn('node', ['app.js', '--dev'], { stdio: 'inherit', shell: true });
      
      app.on('close', (code) => {
        console.log(`ewvjs window closed (exit code ${code}). Terminating Vite server...`);
        vite.kill();
        process.exit(code);
      });
    }
  });
}, 300);

process.on('SIGINT', () => {
  vite.kill();
  process.exit();
});
process.on('SIGTERM', () => {
  vite.kill();
  process.exit();
});
