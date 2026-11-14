'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { hashFile } = require('../src/core/files.cjs');
const { SYNC_FILE, SYNC_HASH } = require('../src/modpack-sync.cjs');
const { LEGACY_MOD_HASH } = require('../src/modpack-preflight.cjs');
const metadata = require('../package.json');

(async () => {
  const root = path.resolve(__dirname, '..');
  const dist = path.join(root, 'dist');
  if (await hashFile(path.join(root, 'assets', 'automodpack-5.0.0-rc.2.jar'), 'sha256') !== LEGACY_MOD_HASH) throw new Error('AutoModpack inválido.');
  if (await hashFile(path.join(root, 'assets', SYNC_FILE), 'sha256') !== SYNC_HASH) throw new Error('AveronSync inválido.');
  const { PREFLIGHT_HASH } = require('../src/modpack-preflight.cjs');
  if (await hashFile(path.join(root, 'assets', 'hollow-pack-preflight.jar'), 'sha256') !== PREFLIGHT_HASH) throw new Error('Verificador do modpack inválido.');
  const exe = path.join(dist, metadata.build.win.artifactName.replace('${version}', metadata.version));
  const zip = new AdmZip();
  zip.addLocalFile(exe, '', 'AveronSMP-Instalar.exe');
  zip.addLocalFile(path.join(root, 'docs', 'LAUNCHER-UPDATES.md'));
  zip.addLocalFile(path.join(root, 'docs', 'LEIA-ME.txt'));
  zip.addLocalFile(path.join(root, 'docs', 'MICROSOFT.md'));
  zip.addLocalFile(path.join(root, 'docs', 'DISCORD.md'));
  zip.addLocalFile(path.join(root, 'docs', 'AMBIENTE.md'));
  zip.addLocalFile(path.join(root, 'docs', 'MENU.md'));
  zip.addLocalFile(path.join(root, 'docs', 'AVERONSYNC.md'));
  zip.addLocalFile(path.join(root, 'docs', 'ARCHITECTURE.md'));
  zip.addLocalFile(path.join(root, 'docs', 'MACOS.md'));
  zip.addLocalFile(path.join(root, 'docs', 'minecraft-menu.png'));
  zip.addLocalFile(path.join(root, 'docs', 'PAISAGEM.md'));
  zip.addLocalFile(path.join(root, 'docs', 'landscape-selection.png'));
  zip.addLocalFile(path.join(root, 'THIRD-PARTY.txt'));
  zip.addLocalFolder(path.join(root, 'licenses'), 'licenses');
  zip.addLocalFile(path.join(root, 'vendor/averonsync/AveronSync-0.32-source.zip'), 'licenses');
  zip.addLocalFolder(path.join(root, 'java', 'preflight'), 'preflight-source');
  // electron-builder may keep the runtime only in win-unpacked after packaging.
  const electronLicense = await firstExisting([
    path.join(root, 'node_modules', 'electron', 'dist', 'LICENSE'),
    path.join(root, 'node_modules', 'electron', 'LICENSE'),
    path.join(dist, 'win-unpacked', 'LICENSE.electron.txt'),
  ]);
  const chromiumNotices = await firstExisting([
    path.join(root, 'node_modules', 'electron', 'dist', 'LICENSES.chromium.html'),
    path.join(dist, 'win-unpacked', 'LICENSES.chromium.html'),
  ]);
  zip.addLocalFile(electronLicense, 'licenses', 'Electron-LICENSE.txt');
  zip.addLocalFile(chromiumNotices, 'licenses');
  const archive = path.join(dist, 'AveronSMP-Launcher-Windows.zip');
  zip.writeZip(archive);
  const files = [archive, exe, `${exe}.blockmap`, path.join(dist, 'latest.yml')];
  await fs.writeFile(path.join(dist, 'SHA256.txt'), (await Promise.all(files.map(async file => `${await hashFile(file, 'sha256')}  ${path.basename(file)}\n`))).join(''));
  console.log(`Pacote criado: ${archive}`);
})().catch(error => { console.error(error); process.exitCode = 1; });

async function firstExisting(candidates) {
  for (const candidate of candidates) {
    try { await fs.access(candidate); return candidate; } catch {}
  }
  throw new Error(`Licença distribuída não encontrada: ${candidates.map(file => path.basename(file)).join(', ')}`);
}
