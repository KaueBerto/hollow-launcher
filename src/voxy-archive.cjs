'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createWriteStream } = require('node:fs');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const crypto = require('node:crypto');
const yauzl = require('yauzl');
const { under, hashFile, readJson } = require('./core/files.cjs');
const { SERVER } = require('./voxy-folder.cjs');

async function noLinks(root, destination) {
  const relative = path.relative(root, destination);
  under(root, relative);
  let current = root;
  for (const part of ['', ...relative.split(path.sep)]) {
    if (part) current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw Error('Link não permitido na instalação da paisagem.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function validate(manifest) {
  const fail = () => { throw Error('Manifesto de paisagem do Voxy inválido.'); };
  const m = manifest;
  if (!m || m.schema !== 1 || m.kind !== 'voxy-rocksdb' || m.server !== SERVER || m.archiveRoot !== SERVER || !Number.isInteger(m.version) || m.version < 1) fail();
  if (!Number.isSafeInteger(m.bytes) || m.bytes <= 0 || m.bytes > 12e9 || !Number.isSafeInteger(m.unpackedBytes) || m.unpackedBytes <= 0 || m.unpackedBytes > 20e9 || !/^[a-f0-9]{64}$/.test(m.sha256)) fail();
  if (m.url !== `https://painel.hollowsmp.com.br/averon-voxy/${m.sha256}.zip` || !Array.isArray(m.files) || !m.files.length || m.files.length > 4096) fail();
  const names = new Set();
  let total = 0;
  for (const item of m.files) {
    if (!item || typeof item.path !== 'string' || names.has(item.path.toLowerCase()) || item.path.includes('\\')) fail();
    const storage = /^[a-f0-9]{32}\/storage\/[A-Za-z0-9_.-]{1,100}$/.test(item.path);
    const basename = path.posix.basename(item.path);
    if (item.path !== 'config.json' && !storage || ['.', '..'].includes(basename) || /\.$/.test(basename) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(basename)) fail();
    if (!Number.isSafeInteger(item.bytes) || item.bytes < 0 || item.bytes > 10e9 || !/^[a-f0-9]{64}$/.test(item.sha256)) fail();
    if (item.path === 'config.json' && (item.bytes <= 0 || item.bytes > 65536)) fail();
    names.add(item.path.toLowerCase()); total += item.bytes;
  }
  if (total !== m.unpackedBytes || !names.has('config.json')) fail();
  const dimensions = [...new Set(m.files.filter(item => item.path !== 'config.json').map(item => item.path.split('/')[0]))];
  if (!dimensions.length || dimensions.some(dimension => !names.has(`${dimension}/storage/current`))) fail();
  return m;
}

function dimensionsOf(manifest) {
  return [...new Set(manifest.files.filter(item => item.path !== 'config.json').map(item => item.path.split('/')[0]))];
}

async function validCache(directory, dimensions) {
  try {
    await noLinks(directory, path.join(directory, 'config.json'));
    if ((await fs.stat(path.join(directory, 'config.json'))).size > 65536) return false;
    const config = await readJson(path.join(directory, 'config.json'));
    if (config.version !== 1 || !config.sectionStorageConfig || !dimensions.length) return false;
    for (const dimension of dimensions) {
      if (!/^[a-f0-9]{32}$/.test(dimension)) return false;
      const storage = path.join(directory, dimension, 'storage');
      await noLinks(directory, path.join(storage, 'CURRENT'));
      if ((await fs.stat(path.join(storage, 'CURRENT'))).size > 128) return false;
      const current = (await fs.readFile(path.join(storage, 'CURRENT'), 'utf8')).trim();
      if (!/^MANIFEST-\d+$/.test(current)) return false;
      await noLinks(directory, path.join(storage, current));
      const stat = await fs.lstat(path.join(storage, current));
      if (!stat.isFile() || stat.size <= 0) return false;
    }
    return true;
  } catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return false; throw error; }
}

async function checkSpace(directory, required) {
  const info = await fs.statfs(directory);
  if (info.bavail * info.bsize < required + 256 * 1024 * 1024) throw Error('Espaço insuficiente para preparar a paisagem do Voxy. Libere espaço no disco e tente novamente.');
}

async function verifyTree(root, manifest, { complete = false } = {}) {
  const allowed = new Set([...manifest.files.map(item => item.path), '.averon-landscape.json', '.averon-landscape.json.hollow-new']);
  async function walk(directory, prefix = '') {
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const relative = prefix + entry.name;
      if (entry.isSymbolicLink()) throw Error('Link não permitido no cache da paisagem.');
      if (entry.isDirectory()) {
        if (![...allowed].some(name => name.startsWith(relative + '/'))) throw Error('Arquivo inesperado na preparação da paisagem.');
        await walk(path.join(directory, entry.name), relative + '/');
      } else if (!entry.isFile() || !allowed.has(relative)) throw Error('Arquivo inesperado na preparação da paisagem.');
    }
  }
  await walk(root);
  if (complete) {
    for (const item of manifest.files) {
      const file = under(root, item.path);
      let valid = false;
      try { valid = (await fs.stat(file)).size === item.bytes && await hashFile(file, 'sha256') === item.sha256; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!valid) throw Object.assign(Error('A preparação interrompida da paisagem está incompleta. Tente baixar novamente.'), { code: 'VOXY_STAGE_INCOMPLETE' });
    }
  }
}

async function checkTreeLinks(directory) {
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink() || stat.isFile() && stat.nlink > 1) throw Error('Link não permitido no download da paisagem.');
  if (stat.isDirectory()) for (const name of await fs.readdir(directory)) await checkTreeLinks(path.join(directory, name));
}

async function extractVoxy(archive, staging, manifest, progress = () => {}) {
  const m = validate(manifest);
  const expected = new Map(m.files.map(item => [item.path, item]));
  const zip = await yauzl.openPromise(archive, { autoClose: false, strictFileNames: true, validateEntrySizes: true });
  let zipFailure;
  zip.on('error', error => { zipFailure = error; });
  const files = new Map();
  try {
    // Inspect the complete central directory before writing any entry.
    for await (const entry of zip.eachEntry()) {
      const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
      if (mode && mode !== 0x8000 && mode !== 0x4000 || entry.generalPurposeBitFlag & 1 || !entry.fileName.startsWith(m.archiveRoot + '/')) throw Error('ZIP de paisagem inválido.');
      const relative = entry.fileName.slice(m.archiveRoot.length + 1);
      if (entry.fileName.endsWith('/')) {
        if (relative && ![...expected.keys()].some(name => name.startsWith(relative))) throw Error('Pasta inesperada no ZIP da paisagem.');
        continue;
      }
      const item = expected.get(relative);
      if (!item || files.has(relative) || entry.uncompressedSize !== item.bytes) throw Error('O ZIP não corresponde ao manifesto da paisagem.');
      files.set(relative, entry);
    }
    if (files.size !== expected.size) throw Error('Há arquivos ausentes no ZIP da paisagem.');
    await noLinks(path.dirname(staging), staging);
    await verifyTree(staging, m);
    await fs.mkdir(staging, { recursive: true });
    let done = 0;
    for (const [relative, entry] of files) {
      const item = expected.get(relative);
      const destination = under(staging, relative);
      await noLinks(staging, destination);
      let valid = false;
      try { valid = (await fs.stat(destination)).size === item.bytes && await hashFile(destination, 'sha256') === item.sha256; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!valid) {
        await checkSpace(staging, item.bytes);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.rm(destination, { force: true });
        const hash = crypto.createHash('sha256');
        let bytes = 0;
        const meter = new Transform({ transform(chunk, encoding, callback) {
          bytes += chunk.length; hash.update(chunk);
          callback(bytes > item.bytes ? Error('Arquivo de paisagem maior que o esperado.') : null, chunk);
        } });
        await pipeline(await zip.openReadStreamPromise(entry), meter, createWriteStream(destination, { flags: 'wx' }));
        if (zipFailure) throw zipFailure;
        if (bytes !== item.bytes || hash.digest('hex') !== item.sha256) throw Error('Arquivo de paisagem não passou na verificação.');
      }
      done += item.bytes;
      progress(done, m.unpackedBytes);
    }
    if (!await validCache(staging, dimensionsOf(m))) throw Error('Os dados do Voxy estão incompletos ou inválidos.');
  } finally { zip.close(); }
}

module.exports = { validate, dimensionsOf, validCache, checkSpace, noLinks, checkTreeLinks, verifyTree, extractVoxy };
