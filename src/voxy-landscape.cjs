'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { exists, readJson, writeJson, under } = require('./core/files.cjs');
const { downloadParts } = require('./landscape-download.cjs');
const { voxyDirectory, validDirectory } = require('./voxy-folder.cjs');
const { validate, dimensionsOf, validCache, checkSpace, noLinks, checkTreeLinks, verifyTree, extractVoxy } = require('./voxy-archive.cjs');

const MANIFEST_FILE = 'voxy-landscape-manifest.json';
const RECEIPT = 'voxy-landscape-installed.json';
const JOURNAL = 'voxy-landscape-transaction.json';
const PROOF = '.averon-landscape.json';

async function cleanupArchive(engine, manifest) {
  const archive = under(engine.root, path.join('downloads', `voxy-${manifest.sha256}`, 'voxy.zip'));
  try {
    await noLinks(engine.root, archive);
    await fs.rm(archive, { force: true });
  } catch { /* An antivirus lock on disposable download data must not block an installed cache. */ }
}

async function loadManifest(assets) { return validate(await readJson(path.join(assets, MANIFEST_FILE))); }
async function landscapeInfo(assets) {
  const m = await loadManifest(assets);
  return { kind: 'voxy', bytes: m.bytes, unpackedBytes: m.unpackedBytes,
    temporaryBytes: Math.max(2 * m.bytes, m.bytes + m.unpackedBytes) + 256 * 1024 * 1024 };
}
async function closed(engine) {
  if (engine.gameProcess || await engine.javaRunning()) throw Error('Feche o Minecraft antes de instalar a paisagem do Voxy.');
}
async function readOptional(root, filename) {
  const file = under(root, filename);
  await noLinks(root, file);
  try { return await readJson(file); }
  catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return null; throw error; }
}
async function installedSource(target, manifest) {
  await noLinks(target, path.join(target, PROOF));
  try {
    const proof = await readJson(path.join(target, PROOF));
    return proof.sha256 === manifest.sha256 && await validCache(target, dimensionsOf(manifest));
  } catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return false; throw error; }
}
function locations(engine, transaction) {
  if (transaction?.schema !== 1 || !validDirectory(transaction.directory) || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(transaction.id)) throw Error('Registro de instalação da paisagem inválido.');
  const manifest = validate(transaction.manifest);
  return {
    manifest,
    target: under(engine.root, path.join('game/.voxy/saves', transaction.directory)),
    stage: under(engine.root, path.join('downloads', `voxy-${manifest.sha256}`, 'stage')),
    backup: under(engine.root, path.join('landscape-backups/voxy', transaction.id, transaction.directory)),
    journal: under(engine.root, JOURNAL),
  };
}

async function finishInstall(engine, transaction, { verifyStage = true } = {}) {
  const { manifest: m, target, stage, backup, journal } = locations(engine, transaction);
  for (const file of [target, stage, backup, journal]) await noLinks(engine.root, file);
  await closed(engine);
  if (await exists(stage)) {
    if (verifyStage) await verifyTree(stage, m, { complete: true });
    if (!await installedSource(stage, m)) throw Error('A preparação da paisagem está incompleta. Os dados anteriores foram preservados.');
    if (await exists(target)) {
      if (await exists(backup)) throw Error('Há uma instalação interrompida com duas cópias da paisagem. Elas foram preservadas para recuperação.');
      await fs.mkdir(path.dirname(backup), { recursive: true });
      await fs.rename(target, backup);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    try { await fs.rename(stage, target); }
    catch (error) {
      // If Windows still holds a cache handle, put the old cache back before reporting failure.
      if (!await exists(target) && await exists(backup)) await fs.rename(backup, target);
      throw error;
    }
  } else if (!await installedSource(target, m)) {
    if (!await exists(target) && await exists(backup)) {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.rename(backup, target);
      await fs.unlink(journal);
    }
    throw Error('Não foi possível concluir a paisagem interrompida. A cópia anterior foi preservada.');
  }
  await closed(engine);
  if (!await installedSource(target, m)) throw Error('O Voxy não confirmou os arquivos instalados. Confira a paisagem antes de jogar.');
  const receipt = under(engine.root, RECEIPT);
  await noLinks(engine.root, receipt);
  await noLinks(engine.root, receipt + '.hollow-new');
  await writeJson(receipt, { kind: 'voxy', schema: 1, sha256: m.sha256, version: m.version, directory: transaction.directory });
  await fs.unlink(journal);
  await cleanupArchive(engine, m);
}

async function recoverInstall(engine) {
  const journal = under(engine.root, JOURNAL);
  await noLinks(engine.root, journal);
  let transaction;
  try { transaction = await readJson(journal); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  engine.progress('Concluindo instalação anterior da paisagem do Voxy…');
  try { await finishInstall(engine, transaction); }
  catch (error) {
    if (error.code !== 'VOXY_STAGE_INCOMPLETE') throw error;
    const { target, backup } = locations(engine, transaction);
    await closed(engine);
    if (await exists(backup)) {
      if (await exists(target)) throw error;
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.rename(backup, target);
    }
    // Keep incomplete files for verified extraction to repair; don't trap every retry in the old transaction.
    await fs.unlink(journal);
    return false;
  }
  return true;
}

async function installLandscape(engine, { directory: selectedDirectory, manifest, download = downloadParts, request = fetch } = {}) {
  await closed(engine);
  await recoverInstall(engine);
  const m = manifest ? validate(manifest) : await loadManifest(engine.assets);
  const installed = await readOptional(engine.root, RECEIPT);
  const directory = await voxyDirectory(engine.game, { preferredDirectory: installed?.directory, selectedDirectory });
  const target = under(engine.root, path.join('game/.voxy/saves', directory));
  await noLinks(engine.root, target);
  // RocksDB compacts SST/WAL files while playing; comparing them to the original ZIP would cause endless downloads.
  if (await installedSource(target, m)) {
    const receipt = under(engine.root, RECEIPT);
    await noLinks(engine.root, receipt + '.hollow-new');
    if (installed?.sha256 !== m.sha256 || installed.directory !== directory) {
      await writeJson(receipt, { kind: 'voxy', schema: 1, sha256: m.sha256, version: m.version, directory });
    }
    await cleanupArchive(engine, m);
    return { alreadyInstalled: true };
  }

  const folder = under(engine.root, path.join('downloads', `voxy-${m.sha256}`));
  await noLinks(engine.root, folder);
  await fs.mkdir(folder, { recursive: true });
  await checkTreeLinks(folder);
  if (!await exists(path.join(folder, 'voxy.zip'))) await checkSpace(folder, m.bytes);
  engine.progress('Baixando paisagem do Voxy…');
  const archive = await download(m, folder,
    (done, total) => engine.progress(`Baixando paisagem do Voxy: ${(done / 1e9).toFixed(2)} / ${(total / 1e9).toFixed(2)} GB`, done, total),
    request, 8 * 1024 * 1024, 'voxy.zip');
  await closed(engine);
  const transaction = { schema: 1, id: randomUUID(), directory, manifest: m };
  const { stage, journal } = locations(engine, transaction);
  await noLinks(engine.root, stage);
  engine.progress('Preparando paisagem do Voxy…');
  await extractVoxy(archive, stage, m, (done, total) => engine.progress('Preparando paisagem do Voxy…', done, total));
  await closed(engine);
  await noLinks(engine.root, path.join(stage, PROOF));
  await noLinks(engine.root, path.join(stage, PROOF + '.hollow-new'));
  await writeJson(path.join(stage, PROOF), { schema: 1, sha256: m.sha256 });
  await noLinks(engine.root, journal + '.hollow-new');
  await writeJson(journal, transaction);
  await finishInstall(engine, transaction, { verifyStage: false });
  engine.progress('Paisagem do Voxy instalada.', 1, 1);
  return { alreadyInstalled: false };
}

module.exports = { MANIFEST_FILE, RECEIPT, JOURNAL, PROOF, loadManifest, landscapeInfo, installLandscape, recoverInstall, finishInstall };
