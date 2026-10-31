'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { constants } = require('node:fs');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const AdmZip = require('adm-zip');
const { exists, hashFile, writeJson } = require('./core/files.cjs');
const { prepareModpack } = require('./modpack-preflight.cjs');

const SYNC_FILE = 'averonsync-mc1.21.1-neoforge-4.0.6-averonsync.0.8.jar';
const SYNC_HASH = '865513111bc79caeef7c1b364342886fb2468c3d3bea95711cd4c02e93c01f9c';
const runFile = promisify(execFile);

async function noLinks(root, destination) {
  const relative = path.relative(root, destination);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Caminho do sincronizador inválido.');
  let current = root;
  for (const part of ['', ...relative.split(path.sep)]) {
    current = part ? path.join(current, part) : current;
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw Error('Link na instalação do sincronizador.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function isSyncJar(file) {
  const zip = new AdmZip(file);
  const metadata = zip.readAsText('META-INF/neoforge.mods.toml');
  return /^\s*modId\s*=\s*["']automodpack(?:_mod)?["']/m.test(metadata);
}

async function syncReady(engine) {
  try {
    if (await exists(path.join(engine.game, 'automodpack/client'))) return false;
    return await hashFile(path.join(engine.game, 'mods', SYNC_FILE), 'sha256') === SYNC_HASH;
  } catch { return false; }
}

async function ensureSync(engine, { run = runFile } = {}) {
  if (typeof engine.javaRunning === 'function' && await engine.javaRunning()) throw Error('Feche o Minecraft antes de preparar o AveronSync.');
  const source = path.join(engine.assets, SYNC_FILE);
  if (await hashFile(source, 'sha256') !== SYNC_HASH || !isSyncJar(source)) throw Error('AveronSync inválido. Reinstale o launcher.');

  // The 5.x bridge understands only 5.x journals. Never run it against the fork's 4.x storage.
  await prepareModpack(engine, { run });
  const mods = path.join(engine.game, 'mods');
  const destination = path.join(mods, SYNC_FILE);
  const staging = destination + '.pending';
  const legacyClient = path.join(engine.game, 'automodpack/client');
  const backup = path.join(engine.root, 'sync-backups');
  const archivedClient = path.join(backup, 'automodpack-5-client');
  const receipt = path.join(engine.root, 'sync-installed.json');
  for (const file of [destination, staging]) await noLinks(engine.root, file);
  for (const file of [legacyClient, archivedClient, receipt, receipt + '.hollow-new']) await noLinks(engine.root, file);
  if (await exists(legacyClient) && await exists(archivedClient)) throw Error('Há duas instalações antigas do modpack. Os dados foram preservados; confira sync-backups antes de migrar.');
  await fs.mkdir(mods, { recursive: true });

  const retired = [];
  for (const name of await fs.readdir(mods)) {
    if (!name.toLowerCase().endsWith('.jar')) continue;
    const file = path.join(mods, name);
    await noLinks(engine.root, file);
    let matches;
    try { matches = isSyncJar(file); }
    catch (error) {
      if (/^(automodpack|averonsync)[-_.]/i.test(name)) throw Error(`Sincronizador ilegível: ${name}. O arquivo foi preservado.`);
      continue;
    }
    if (!matches) continue;
    const hash = await hashFile(file, 'sha256');
    if (name === SYNC_FILE && hash === SYNC_HASH) continue;
    const saved = path.join(backup, `${hash}-${name}`);
    await noLinks(engine.root, saved);
    retired.push({ file, saved, hash });
  }

  if (!retired.length && await syncReady(engine)) return;
  engine.progress('Preparando AveronSync…');
  // Verify the new binary before retiring any old loader; interrupted copies are retryable.
  await fs.copyFile(source, staging);
  if (await hashFile(staging, 'sha256') !== SYNC_HASH) throw Error('Não foi possível conferir a cópia do AveronSync.');
  if (retired.length || await exists(legacyClient)) await fs.mkdir(backup, { recursive: true });
  for (const item of retired) {
    try { await fs.copyFile(item.file, item.saved, constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (await hashFile(item.saved, 'sha256') !== item.hash || await hashFile(item.file, 'sha256') !== item.hash) throw Error('A instalação mudou durante a migração. Tente novamente com o jogo fechado.');
    await fs.unlink(item.file);
  }
  // 4.x uses automodpack/modpacks, while 5.x mounts client/active. Keep the old data outside the game.
  if (await exists(legacyClient)) await fs.rename(legacyClient, archivedClient);
  if (await exists(destination)) {
    if (await hashFile(destination, 'sha256') !== SYNC_HASH) throw Error('Há outro arquivo no destino do AveronSync. Ele foi preservado.');
    await fs.unlink(staging);
  } else await fs.rename(staging, destination);
  await writeJson(receipt, { schema: 1, file: SYNC_FILE, sha256: SYNC_HASH });
}

module.exports = { ensureSync, syncReady, isSyncJar, SYNC_FILE, SYNC_HASH };
