import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Polling also catches edits on Windows folders mounted in WSL.
const child = spawn(process.execPath, [
  fileURLToPath(import.meta.resolve('tsx/cli')),
  'watch', '--include', 'src/**/*.ts', 'src/server.ts',
], {
  stdio: 'inherit',
  env: { ...process.env, WPA_DEV_RELOAD: '1', CHOKIDAR_USEPOLLING: 'true', CHOKIDAR_INTERVAL: '300' },
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => { process.exitCode = code ?? 0; });
