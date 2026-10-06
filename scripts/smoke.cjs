'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const electron = require('electron');

(async () => {
  const project = path.resolve(__dirname, '..');
  const output = path.join(project, 'dist', `ui-${Date.now()}`);
  await fs.mkdir(output, { recursive: true });
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [project, '--smoke-ui', '--test-root', path.join(output, 'HollowSMP'), '--test-output', output], { env, windowsHide: true, stdio: 'inherit' });
  child.once('error', error => { console.error(error); process.exitCode = 1; });
  child.once('close', async code => {
    if (code !== 0) { try { console.error(await fs.readFile(path.join(output, 'error.txt'), 'utf8')); } catch {} process.exitCode = code || 1; }
    else { console.log(await fs.readFile(path.join(output, 'results.json'), 'utf8')); console.log(`Preview: ${output}`); }
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
