const { spawn } = require('node:child_process');
const path = require('node:path');

const env = { ...process.env };
// Development tools can inherit this flag from an Electron-based editor.
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(require('electron'), ['.'], {
  cwd: path.resolve(__dirname, '..'),
  env,
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error('Failed to start Electron:', error.message);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 1));
