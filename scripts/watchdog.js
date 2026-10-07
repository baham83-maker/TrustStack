import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const port = Number(process.env.PORT || 54321);
const host = '127.0.0.1';
const rootDir = process.cwd();
const serverScript = 'server/index.js';
let current = null;

function log(message) {
  console.log(`[watchdog] ${new Date().toISOString()} ${message}`);
}

function spawnServer() {
  if (current && !current.killed) return;

  const serverPath = `${rootDir}/${serverScript}`;
  if (!existsSync(serverPath)) {
    throw new Error(`Missing server entrypoint: ${serverPath}`);
  }

  current = spawn(process.execPath, [serverPath], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port) },
  });

  current.stdout.on('data', (chunk) => process.stdout.write(chunk));
  current.stderr.on('data', (chunk) => process.stderr.write(chunk));

  current.on('exit', (code) => {
    log(`Backend exited with code ${code ?? 'unknown'}. Restarting in 5s...`);
    current = null;
    setTimeout(spawnServer, 5000);
  });
}

function checkHealth() {
  const request = http.get({ host, port, path: '/api/health', timeout: 2500 }, (response) => {
    if (response.statusCode && response.statusCode >= 200 && response.statusCode < 400) {
      response.resume();
      return;
    }
    log(`Health check failed with status ${response.statusCode}. Restarting backend.`);
    if (current && !current.killed) current.kill('SIGTERM');
    current = null;
    spawnServer();
  });

  request.on('timeout', () => {
    log('Health check timed out. Restarting backend.');
    request.destroy();
    if (current && !current.killed) current.kill('SIGTERM');
    current = null;
    spawnServer();
  });

  request.on('error', () => {
    log('Backend health check failed. Restarting backend.');
    if (current && !current.killed) current.kill('SIGTERM');
    current = null;
    spawnServer();
  });
}

spawnServer();
setInterval(checkHealth, 30000);
log(`Watchdog started for ${host}:${port}. Managed server: ${serverScript}`);
