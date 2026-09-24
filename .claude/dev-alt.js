// Verification dev server on :3001 with its own build folder (.next-alt),
// so it never shares .next with the main dev server on :3000.
const { spawn } = require('child_process');
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '-p', '3001'], {
  stdio: 'inherit',
  env: { ...process.env, NEXT_DIST_DIR: '.next-alt' },
});
child.on('exit', (code) => process.exit(code ?? 0));
