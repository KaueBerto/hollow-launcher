'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const yauzl = require('yauzl');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const { constants } = require('node:fs');
const { hashFile } = require('./core/files.cjs');

function validateManifest(manifest) {
  if (manifest?.schema !== 1 || manifest.minecraft !== '1.21.1' || typeof manifest.id !== 'string' || !/^averon-profile-[a-f0-9]{12}$/.test(manifest.id)) throw Error('Manifesto do perfil padrão inválido.');
  if (manifest.archive?.file !== 'profile-defaults.zip' || !Number.isSafeInteger(manifest.archive.size) || manifest.archive.size <= 0 || manifest.archive.size > 100 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(manifest.archive.sha256)) throw Error('Arquivo do perfil padrão inválido.');
  if (!Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 2000) throw Error('Lista do perfil padrão inválida.');
  const names = new Set();
  let total = 0;
  for (const item of manifest.files) {
    const parts = typeof item.path === 'string' ? item.path.split('/') : [];
    const safeSegments = parts.length && !parts.some(part => !part || part === '.' || part === '..' || /[<>:"|?*\\\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part));
    const safe = typeof item.path === 'string' && !item.path.startsWith('/') && safeSegments && (/^options(?:of|shaders)?\.txt$/.test(item.path) || item.path.startsWith('config/'));
    const key = item.path?.toLowerCase();
    if (!safe || names.has(key) || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > 10 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(item.sha256)) throw Error('Entrada do perfil padrão inválida.');
    names.add(key); total += item.size;
  }
  if (total > 100 * 1024 * 1024) throw Error('Perfil padrão excede o limite.');
  return new Map(manifest.files.map(item => [item.path, item]));
}
async function noLinks(root, destination) {
  const relative = path.relative(root, destination);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Caminho do perfil padrão inválido.');
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw Error('Link encontrado no perfil do jogo.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
async function prepareProfileDefaults(engine, options = {}) {
  const manifestPath = options.manifestPath || path.join(engine.assets, 'profile-defaults-manifest.json');
  const manifest = options.manifest || JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const expected = validateManifest(manifest);
  const archive = options.archivePath || path.join(engine.assets, manifest.archive.file);
  const stat = await fs.stat(archive);
  if (stat.size !== manifest.archive.size || await hashFile(archive, 'sha256') !== manifest.archive.sha256) throw Error('O preset de configurações do launcher está corrompido.');
  if (typeof engine.javaRunning === 'function' && await engine.javaRunning()) throw Error('Feche o Minecraft antes de preparar as configurações padrão.');
  const receipt = path.join(engine.root, 'profile-defaults-installed.json');
  await noLinks(engine.root, receipt);
  try {
    const current = JSON.parse(await fs.readFile(receipt, 'utf8'));
    if (current.id === manifest.id && current.archive === manifest.archive.sha256) return { installed: 0, preserved: manifest.files.length };
  } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }

  let installed = 0, preserved = 0;
  const found = new Set();
  const zip = await yauzl.openPromise(archive, { autoClose: false, strictFileNames: true, validateEntrySizes: true });
  let zipFailure;
  zip.on('error', error => { zipFailure = error; });
  try {
    for await (const entry of zip.eachEntry()) {
      const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
      if (/\/$/.test(entry.fileName) || entry.fileName.includes('\\') || mode && mode !== 0x8000 || entry.generalPurposeBitFlag & 1) throw Error('Entrada insegura no perfil padrão.');
      const item = expected.get(entry.fileName);
      if (!item || found.has(entry.fileName) || entry.uncompressedSize !== item.size) throw Error('Conteúdo inesperado no perfil padrão.');
      found.add(entry.fileName);
      const destination = path.join(engine.game, ...entry.fileName.split('/'));
      await noLinks(engine.root, destination);
      let exists = false;
      try { await fs.access(destination); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const digest = crypto.createHash('sha256');
      let bytes = 0;
      const verify = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; digest.update(chunk); callback(null, chunk); } });
      const input = await zip.openReadStreamPromise(entry);
      if (exists) {
        verify.on('data', () => {});
        await pipeline(input, verify);
        if (zipFailure) throw zipFailure;
        if (bytes !== item.size || digest.digest('hex') !== item.sha256) throw Error(`Configuração padrão inválida: ${entry.fileName}`);
        preserved++;
      } else {
        await fs.mkdir(path.dirname(destination), { recursive: true });
        const temporary = destination + '.profile-default-pending';
        await noLinks(engine.root, temporary);
        const handle = await fs.open(temporary, 'wx');
        try { await pipeline(input, verify, handle.createWriteStream()); }
        catch (error) { await handle.close().catch(() => {}); await fs.unlink(temporary).catch(() => {}); throw error; }
        await handle.close().catch(() => {});
        if (zipFailure) { await fs.unlink(temporary).catch(() => {}); throw zipFailure; }
        if (bytes !== item.size || digest.digest('hex') !== item.sha256) { await fs.unlink(temporary).catch(() => {}); throw Error(`Configuração padrão inválida: ${entry.fileName}`); }
        try { await fs.copyFile(temporary, destination, constants.COPYFILE_EXCL); installed++; }
        catch (error) { if (error.code !== 'EEXIST') throw error; preserved++; }
        finally { await fs.unlink(temporary).catch(() => {}); }
      }
    }
  } finally { zip.close(); }
  if (found.size !== expected.size) throw Error('O perfil padrão está incompleto.');
  const temporaryReceipt = receipt + '.pending';
  await fs.mkdir(engine.root, { recursive: true });
  await fs.writeFile(temporaryReceipt, JSON.stringify({ schema: 1, id: manifest.id, archive: manifest.archive.sha256, installedAt: new Date().toISOString() }, null, 2));
  await fs.rename(temporaryReceipt, receipt);
  return { installed, preserved };
}
module.exports = { prepareProfileDefaults, validateManifest };
