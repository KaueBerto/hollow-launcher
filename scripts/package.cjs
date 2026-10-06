'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { hashFile, MOD_HASH } = require('../src/engine.cjs');
const metadata = require('../package.json');

(async () => {
  const root = path.resolve(__dirname, '..');
  const dist = path.join(root, 'dist');
  if (await hashFile(path.join(root, 'assets', 'automodpack-5.0.0-rc.2.jar'), 'sha256') !== MOD_HASH) throw new Error('AutoModpack inválido.');
  const exe = path.join(dist, `HollowSMP-Launcher-${metadata.version}.exe`);
  const zip = new AdmZip();
  zip.addLocalFile(exe, '', 'HollowSMP-Launcher.exe');
  zip.addLocalFile(path.join(root, 'docs', 'LEIA-ME.txt'));
  zip.addLocalFile(path.join(root, 'docs', 'MICROSOFT.md'));
  zip.addLocalFile(path.join(root, 'THIRD-PARTY.txt'));
  zip.addLocalFolder(path.join(root, 'licenses'), 'licenses');
  // Chromium notices are distributed by Electron alongside its runtime.
  zip.addLocalFile(path.join(root, 'node_modules', 'electron', 'dist', 'LICENSE'), 'licenses', 'Electron-LICENSE.txt');
  zip.addLocalFile(path.join(root, 'node_modules', 'electron', 'dist', 'LICENSES.chromium.html'), 'licenses');
  const archive = path.join(dist, 'HollowSMP-Launcher-Windows.zip');
  zip.writeZip(archive);
  await fs.writeFile(path.join(dist, 'SHA256.txt'), `${await hashFile(archive, 'sha256')}  HollowSMP-Launcher-Windows.zip\n${await hashFile(exe, 'sha256')}  ${path.basename(exe)}\n`);
  console.log(`Pacote criado: ${archive}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
