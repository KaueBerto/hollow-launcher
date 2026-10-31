'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { validate, extractVoxy } = require('../src/voxy-archive.cjs');
const { installLandscape, recoverInstall, RECEIPT, JOURNAL, PROOF } = require('../src/voxy-landscape.cjs');
const { voxyDirectory, SERVER } = require('../src/voxy-folder.cjs');
const { registrations } = require('./helpers/server-registrations.cjs');
const { Engine } = require('../src/engine.cjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const dimension = 'a'.repeat(32);
const data = {
  'config.json': JSON.stringify({ version: 1, sectionStorageConfig: { TYPE: 'Serializer' } }),
  [`${dimension}/storage/CURRENT`]: 'MANIFEST-000001\n',
  [`${dimension}/storage/MANIFEST-000001`]: 'test manifest',
  [`${dimension}/storage/000002.sst`]: 'terrain data',
  [`${dimension}/storage/LOCK`]: '',
};

async function fixture(operation) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'averon-voxy-'));
  const zip = new AdmZip();
  for (const [name, value] of Object.entries(data)) zip.addFile(`${SERVER}/${name}`, Buffer.from(value));
  const bytes = zip.toBuffer();
  const manifest = { schema: 1, kind: 'voxy-rocksdb', version: 1, server: SERVER, archiveRoot: SERVER,
    bytes: bytes.length, sha256: hash(bytes), unpackedBytes: Object.values(data).reduce((sum, value) => sum + Buffer.byteLength(value), 0),
    files: Object.entries(data).map(([name, value]) => ({ path: name, bytes: Buffer.byteLength(value), sha256: hash(value) })) };
  manifest.url = `https://painel.hollowsmp.com.br/averon-voxy/${manifest.sha256}.zip`;
  const archive = path.join(root, 'original.zip'); await fs.writeFile(archive, bytes);
  let downloads = 0;
  const engine = { root, game: path.join(root, 'game'), javaRunning: async () => false, progress() {} };
  const options = { manifest, download: async () => { downloads++; return archive; } };
  const target = path.join(engine.game, '.voxy/saves', SERVER);
  try { await operation({ root, engine, manifest, archive, zip, options, target, downloads: () => downloads }); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('Voxy manifest supports the supplied ZIP64 size and rejects unsafe origins, paths, totals and non-Voxy payloads', () => fixture(async ({ manifest }) => {
  assert.equal(validate({ ...manifest, bytes: 4355124433 }).bytes, 4355124433);
  for (const change of [{ kind: 'sqlite' }, { url: 'https://evil.invalid/archive.zip' }, { bytes: 30e9 }, { unpackedBytes: 1 }, { archiveRoot: '../game' }]) assert.throws(() => validate({ ...manifest, ...change }));
  for (const name of ['../options.txt', 'config/client.json', `${dimension}/storage/CON`, `${dimension}/storage/..`, `${dimension}\\storage\\file`]) {
    assert.throws(() => validate({ ...manifest, files: [{ ...manifest.files[0], path: name }, ...manifest.files.slice(1)] }));
  }
}));

test('Voxy paths use the address, not the saved server name; default port and menu address remain distinct', () => fixture(async ({ engine }) => {
  assert.equal(await voxyDirectory(engine.game), SERVER);
  await fs.mkdir(engine.game);
  const original = registrations([{ name: 'Any nickname', ip: SERVER }, { name: 'Renamed server', ip: SERVER }]);
  await fs.writeFile(path.join(engine.game, 'servers.dat'), original);
  assert.equal(await voxyDirectory(engine.game), SERVER);
  assert.deepEqual(await fs.readFile(path.join(engine.game, 'servers.dat')), original);
  await fs.writeFile(path.join(engine.game, 'servers.dat'), registrations([{ name: 'Averon', ip: SERVER + ':25565' }]));
  await assert.rejects(voxyDirectory(engine.game), error => error.code === 'LANDSCAPE_SELECTION_REQUIRED' && error.choices.length === 2);
  assert.equal(await voxyDirectory(engine.game, { selectedDirectory: SERVER + '_25565' }), SERVER + '_25565');
  await assert.rejects(voxyDirectory(engine.game, { selectedDirectory: '../outside' }), error => error.code === 'LANDSCAPE_SELECTION_REQUIRED');
}));

test('installs in .voxy/saves, backs up an old cache and preserves other server caches and legacy DH data', () => fixture(async ({ engine, options, target, root, manifest, downloads }) => {
  await fs.mkdir(target, { recursive: true }); await fs.writeFile(path.join(target, 'old-cache'), 'previous terrain');
  const other = path.join(engine.game, '.voxy/saves/other.example/sentinel');
  const dh = path.join(engine.game, 'Distant_Horizons_server_data/old.sqlite');
  for (const file of [other, dh]) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, 'keep'); }
  await fs.writeFile(path.join(root, 'landscape-installed.json'), '{"old":"DH"}');
  assert.equal((await installLandscape(engine, options)).alreadyInstalled, false);
  assert.equal(await fs.readFile(path.join(target, `${dimension}/storage/000002.sst`), 'utf8'), 'terrain data');
  assert.equal(JSON.parse(await fs.readFile(path.join(root, RECEIPT), 'utf8')).sha256, manifest.sha256);
  const [backup] = await fs.readdir(path.join(root, 'landscape-backups/voxy'));
  assert.equal(await fs.readFile(path.join(root, 'landscape-backups/voxy', backup, SERVER, 'old-cache'), 'utf8'), 'previous terrain');
  for (const file of [other, dh]) assert.equal(await fs.readFile(file, 'utf8'), 'keep');
  assert.equal(await fs.readFile(path.join(root, 'landscape-installed.json'), 'utf8'), '{"old":"DH"}');
  assert.equal((await installLandscape(engine, options)).alreadyInstalled, true);
  assert.equal(downloads(), 1);
}));

test('RocksDB compaction and new terrain do not trigger repeated downloads', () => fixture(async ({ engine, options, target, downloads }) => {
  await installLandscape(engine, options);
  const storage = path.join(target, dimension, 'storage');
  await fs.unlink(path.join(storage, '000002.sst')); await fs.unlink(path.join(storage, 'MANIFEST-000001'));
  await fs.writeFile(path.join(storage, 'CURRENT'), 'MANIFEST-000009\n');
  await fs.writeFile(path.join(storage, 'MANIFEST-000009'), 'new manifest');
  await fs.writeFile(path.join(storage, '000010.sst'), 'additional terrain and compacted data');
  assert.equal((await installLandscape(engine, options)).alreadyInstalled, true);
  assert.equal(downloads(), 1);
  assert.equal(await fs.readFile(path.join(storage, '000010.sst'), 'utf8'), 'additional terrain and compacted data');
}));

test('real launcher reset preserves Voxy receipt and cache, so the next installation makes no download', () => fixture(async f => {
  const engine = new Engine({ root: path.join(f.root, 'HollowSMP'), platform: 'test' });
  engine.javaRunning = async () => false;
  await installLandscape(engine, f.options);
  await engine.reset();
  assert.equal((await installLandscape(engine, f.options)).alreadyInstalled, true);
  assert.equal(f.downloads(), 1);
  assert.equal(await fs.readFile(path.join(engine.game, '.voxy/saves', SERVER, dimension, 'storage/000002.sst'), 'utf8'), 'terrain data');
}));

test('missing cache metadata reinstalls once, while a missing receipt can be recovered from the verified source marker', () => fixture(async ({ engine, options, target, root, downloads }) => {
  await installLandscape(engine, options);
  await fs.unlink(path.join(root, RECEIPT));
  assert.equal((await installLandscape(engine, options)).alreadyInstalled, true);
  assert.equal(downloads(), 1);
  await fs.unlink(path.join(target, dimension, 'storage/CURRENT'));
  assert.equal((await installLandscape(engine, options)).alreadyInstalled, false);
  assert.equal(downloads(), 2);
}));

test('server address selection happens before download, is validated and is remembered', () => fixture(async ({ engine, options, downloads, target }) => {
  await fs.mkdir(engine.game);
  await fs.writeFile(path.join(engine.game, 'servers.dat'), registrations([{ name: 'Averon', ip: SERVER + ':25565' }]));
  await assert.rejects(installLandscape(engine, options), error => error.code === 'LANDSCAPE_SELECTION_REQUIRED');
  assert.equal(downloads(), 0);
  await installLandscape(engine, { ...options, directory: SERVER + '_25565' });
  assert.equal((await installLandscape(engine, options)).alreadyInstalled, true);
  assert.equal(downloads(), 1);
  await assert.rejects(fs.access(target), /ENOENT/);
}));

test('a running game blocks installation, including a game opened during the download', () => fixture(async ({ engine, options, target, downloads }) => {
  engine.gameProcess = {};
  await assert.rejects(installLandscape(engine, options), /Feche o Minecraft/);
  assert.equal(downloads(), 0); engine.gameProcess = null;
  const originalDownload = options.download;
  await assert.rejects(installLandscape(engine, { ...options, download: async (...args) => { const file = await originalDownload(...args); engine.gameProcess = {}; return file; } }), /Feche o Minecraft/);
  await assert.rejects(fs.access(target), /ENOENT/);
}));

test('untrusted ZIP entries and symlinks are rejected before any staging file is written', () => fixture(async ({ root, zip, manifest }) => {
  const archive = path.join(root, 'bad.zip'); const staging = path.join(root, 'stage');
  zip.addFile(`${SERVER}/../outside.txt`, Buffer.from('escape')); await fs.writeFile(archive, zip.toBuffer());
  await assert.rejects(extractVoxy(archive, staging, manifest));
  await assert.rejects(fs.access(staging), /ENOENT/);
  zip.deleteFile(`${SERVER}/../outside.txt`);
  zip.getEntry(`${SERVER}/${dimension}/storage/000002.sst`).header.attr = (0xa1ff << 16) >>> 0;
  await fs.writeFile(archive, zip.toBuffer());
  await assert.rejects(extractVoxy(archive, staging, manifest), /ZIP/);
  await assert.rejects(fs.access(staging), /ENOENT/);
}));

test('bad per-file checksum and a linked cache preserve the existing live cache', () => fixture(async ({ engine, options, manifest, target, root }) => {
  await fs.mkdir(target, { recursive: true }); await fs.writeFile(path.join(target, 'sentinel'), 'keep');
  const bad = { ...manifest, files: manifest.files.map(item => item.path.endsWith('.sst') ? { ...item, sha256: 'b'.repeat(64) } : item) };
  await assert.rejects(installLandscape(engine, { ...options, manifest: bad }), /verificação/);
  assert.equal(await fs.readFile(path.join(target, 'sentinel'), 'utf8'), 'keep');
  await fs.unlink(path.join(target, 'sentinel')); await fs.rmdir(target);
  const external = path.join(root, 'external'); await fs.mkdir(external); await fs.writeFile(path.join(external, 'sentinel'), 'outside');
  await fs.symlink(external, target, 'junction');
  await assert.rejects(installLandscape(engine, options), /Link/);
  assert.deepEqual(await fs.readdir(external), ['sentinel']);
  await fs.unlink(target);
}));

async function interrupted(f) {
  const transaction = { schema: 1, id: crypto.randomUUID(), directory: SERVER, manifest: f.manifest };
  const stage = path.join(f.root, 'downloads', `voxy-${f.manifest.sha256}`, 'stage');
  await extractVoxy(f.archive, stage, f.manifest);
  await fs.writeFile(path.join(stage, PROOF), JSON.stringify({ schema: 1, sha256: f.manifest.sha256 }));
  await fs.writeFile(path.join(f.root, JOURNAL), JSON.stringify(transaction));
  return { transaction, stage, backup: path.join(f.root, 'landscape-backups/voxy', transaction.id, SERVER) };
}

test('interrupted swap resumes after old cache was backed up, without any download', () => fixture(async f => {
  await fs.mkdir(f.target, { recursive: true }); await fs.writeFile(path.join(f.target, 'old'), 'previous');
  const { backup, stage } = await interrupted(f);
  await fs.mkdir(path.dirname(backup), { recursive: true }); await fs.rename(f.target, backup);
  assert.equal(await recoverInstall(f.engine), true);
  assert.equal(await fs.readFile(path.join(backup, 'old'), 'utf8'), 'previous');
  await assert.rejects(fs.access(stage), /ENOENT/);
  await assert.rejects(fs.access(path.join(f.root, JOURNAL)), /ENOENT/);
  assert.equal(f.downloads(), 0);
  assert.equal((await installLandscape(f.engine, f.options)).alreadyInstalled, true);
}));

test('interruption after promotion repairs the receipt instead of downloading or overwriting modified terrain', () => fixture(async f => {
  const { stage } = await interrupted(f);
  const cachedZip = path.join(path.dirname(stage), 'voxy.zip');
  await fs.copyFile(f.archive, cachedZip);
  await fs.mkdir(path.dirname(f.target), { recursive: true }); await fs.rename(stage, f.target);
  await fs.appendFile(path.join(f.target, dimension, 'storage/000002.sst'), 'discovered later');
  await recoverInstall(f.engine);
  await assert.rejects(fs.access(cachedZip), /ENOENT/);
  assert.equal((await installLandscape(f.engine, f.options)).alreadyInstalled, true);
  assert.equal(f.downloads(), 0);
  assert.match(await fs.readFile(path.join(f.target, dimension, 'storage/000002.sst'), 'utf8'), /discovered later/);
}));

test('an incomplete interrupted stage restores the old cache and can be repaired on the next installation', () => fixture(async f => {
  await fs.mkdir(f.target, { recursive: true }); await fs.writeFile(path.join(f.target, 'old'), 'previous');
  const { stage, backup } = await interrupted(f);
  await fs.mkdir(path.dirname(backup), { recursive: true }); await fs.rename(f.target, backup);
  await fs.writeFile(path.join(stage, dimension, 'storage/000002.sst'), 'truncated');
  assert.equal(await recoverInstall(f.engine), false);
  assert.equal(await fs.readFile(path.join(f.target, 'old'), 'utf8'), 'previous');
  await assert.rejects(fs.access(path.join(f.root, JOURNAL)), /ENOENT/);
  assert.equal((await installLandscape(f.engine, f.options)).alreadyInstalled, false);
  assert.equal((await installLandscape(f.engine, f.options)).alreadyInstalled, true);
}));

test('promotion failure rolls the old cache back and a later retry finishes from the preserved stage', async t => fixture(async f => {
  await fs.mkdir(f.target, { recursive: true }); await fs.writeFile(path.join(f.target, 'old'), 'previous');
  const { stage, backup } = await interrupted(f);
  const originalRename = fs.rename;
  const mock = t.mock.method(fs, 'rename', async (from, to) => { if (from === stage) throw Object.assign(Error('locked'), { code: 'EPERM' }); return originalRename(from, to); });
  await assert.rejects(recoverInstall(f.engine), /locked/);
  assert.equal(await fs.readFile(path.join(f.target, 'old'), 'utf8'), 'previous');
  await assert.rejects(fs.access(backup), /ENOENT/);
  mock.mock.restore();
  await recoverInstall(f.engine);
  assert.equal(await fs.readFile(path.join(backup, 'old'), 'utf8'), 'previous');
  assert.equal((await installLandscape(f.engine, f.options)).alreadyInstalled, true);
}));
