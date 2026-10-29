'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const AdmZip = require('adm-zip');
const { ensureSync, syncReady, SYNC_FILE, SYNC_HASH } = require('../src/modpack-sync.cjs');
const { hashFile, exists } = require('../src/core/files.cjs');

async function fixture(operation) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'averon-sync-'));
  const engine = {
    root, game: path.join(root, 'game'), assets: path.resolve(__dirname, '../assets'),
    java: 'test-java', progress() {}, javaRunning: async () => false, hollowGamePids: async () => [],
  };
  await fs.mkdir(path.join(engine.game, 'mods'), { recursive: true });
  try { await operation(engine); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}

async function oldInstallation(engine) {
  // Deliberately renamed: identity comes from NeoForge metadata, not the filename.
  const jar = path.join(engine.game, 'mods/renamed-loader.jar');
  await fs.copyFile(path.join(engine.assets, 'automodpack-5.0.0-rc.2.jar'), jar);
  const active = path.join(engine.game, 'automodpack/client/active/mods');
  await fs.mkdir(active, { recursive: true });
  await fs.writeFile(path.join(active, 'example.jar'), 'legacy projection');
  await fs.mkdir(path.join(engine.game, 'config'), { recursive: true });
  await fs.writeFile(path.join(engine.game, 'config/player.toml'), 'renderDistance = 24');
  return jar;
}

test('fresh installation uses the exact fork and later launches leave it untouched', () => fixture(async engine => {
  assert.equal(await syncReady(engine), false);
  await ensureSync(engine);
  assert.equal(await syncReady(engine), true);
  const jar = path.join(engine.game, 'mods', SYNC_FILE);
  const before = await fs.stat(jar);
  await ensureSync(engine);
  assert.equal((await fs.stat(jar)).mtimeMs, before.mtimeMs);
  assert.equal(await hashFile(jar, 'sha256'), SYNC_HASH);
  assert.deepEqual(await fs.readdir(path.join(engine.game, 'mods')), [SYNC_FILE]);
}));

for (const previousVersion of ['0.4', '0.5']) test(`${previousVersion} upgrades to 0.6 once, retaining installed modpack, consent and client preferences`, () => fixture(async engine => {
  const oldName = `averonsync-mc1.21.1-neoforge-4.0.6-averonsync.${previousVersion}.jar`;
  const old = path.join(engine.game, 'mods', oldName);
  const zip = new AdmZip();
  zip.addFile('META-INF/neoforge.mods.toml', Buffer.from(`[[mods]]\nmodId="automodpack"\nversion="4.0.6-averonsync.${previousVersion}"\n`));
  zip.writeZip(old);
  const oldHash = await hashFile(old, 'sha256');
  const preserved = {
    'automodpack/automodpack-client.json': '{"selectedModpack":"Averon"}',
    'automodpack/averonsync-consent.json': '{"accepted":true}',
    'automodpack/modpacks/Averon/mods/example.jar': 'installed mod',
    'config/player.toml': 'distance = 24',
    'options.txt': 'mouseSensitivity:0.75',
  };
  for (const [name, content] of Object.entries(preserved)) {
    const file = path.join(engine.game, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  }
  await ensureSync(engine);
  assert.equal(await exists(old), false);
  assert.equal(await hashFile(path.join(engine.root, 'sync-backups', `${oldHash}-${oldName}`), 'sha256'), oldHash);
  assert.deepEqual(await fs.readdir(path.join(engine.game, 'mods')), [SYNC_FILE]);
  assert.match(SYNC_FILE, /averonsync\.0\.6\.jar$/);
  for (const [name, content] of Object.entries(preserved)) assert.equal(await fs.readFile(path.join(engine.game, name), 'utf8'), content);
  const before = (await fs.stat(path.join(engine.game, 'mods', SYNC_FILE))).mtimeMs;
  await ensureSync(engine);
  assert.equal((await fs.stat(path.join(engine.game, 'mods', SYNC_FILE))).mtimeMs, before);
}));

test('migration backs up renamed loader and 5.x projection, preserving player and 4.x data', () => fixture(async engine => {
  const old = await oldInstallation(engine);
  const oldHash = await hashFile(old, 'sha256');
  const forkState = path.join(engine.game, 'automodpack/automodpack-client.json');
  await fs.writeFile(forkState, '{"selectedModpack":"Averon"}');
  // Simulate an interrupted retirement that already copied its backup.
  await fs.mkdir(path.join(engine.root, 'sync-backups'));
  const backup = path.join(engine.root, `sync-backups/${oldHash}-renamed-loader.jar`);
  await fs.copyFile(old, backup);
  await ensureSync(engine);
  assert.equal(await exists(old), false);
  assert.equal(await hashFile(backup, 'sha256'), oldHash);
  assert.equal(await fs.readFile(path.join(engine.root, 'sync-backups/automodpack-5-client/active/mods/example.jar'), 'utf8'), 'legacy projection');
  assert.equal(await fs.readFile(forkState, 'utf8'), '{"selectedModpack":"Averon"}');
  assert.equal(await fs.readFile(path.join(engine.game, 'config/player.toml'), 'utf8'), 'renderDistance = 24');
  await ensureSync(engine);
  assert.equal(await syncReady(engine), true);
}));

test('pending 5.x transaction is completed before archiving; failed completion preserves the old loader', () => fixture(async engine => {
  const old = await oldInstallation(engine);
  const journal = path.join(engine.game, 'automodpack/client/update-transaction.json');
  await fs.writeFile(journal, 'pending');
  await assert.rejects(ensureSync(engine, { run: async () => { throw Error('fixture failure'); } }), /não terminou/);
  assert.equal(await exists(old), true);
  assert.equal(await exists(path.join(engine.game, 'mods', SYNC_FILE)), false);
  let runs = 0;
  await ensureSync(engine, { run: async (java, args) => {
    runs++;
    assert(args.includes('pl.skidam.automodpack_core.client.HollowPackPreflight'));
    assert(args.some(arg => arg.includes('automodpack-5.0.0-rc.2.jar')));
    assert.equal(await exists(old), true);
    await fs.unlink(journal);
    return { stdout: 'HOLLOW_PACK_READY', stderr: '' };
  } });
  assert.equal(runs, 1);
  assert.equal(await syncReady(engine), true);
}));

test('bad bundled fork or open game cannot retire the old installation', () => fixture(async engine => {
  const old = await oldInstallation(engine);
  engine.javaRunning = async () => true;
  await assert.rejects(ensureSync(engine), /Feche o Minecraft/);
  engine.javaRunning = async () => false;
  const assets = path.join(engine.root, 'bad-assets');
  await fs.mkdir(assets);
  await fs.writeFile(path.join(assets, SYNC_FILE), 'bad jar');
  engine.assets = assets;
  await assert.rejects(ensureSync(engine), /AveronSync inválido/);
  assert.equal(await exists(old), true);
  assert.equal(await exists(path.join(engine.game, 'automodpack/client')), true);
}));

test('duplicate sync IDs are retired but unrelated mods stay byte-identical', () => fixture(async engine => {
  await ensureSync(engine);
  await fs.copyFile(path.join(engine.assets, SYNC_FILE), path.join(engine.game, 'mods/other-name.jar'));
  const unrelated = path.join(engine.game, 'mods/unrelated.jar');
  const zip = new AdmZip();
  zip.addFile('META-INF/neoforge.mods.toml', Buffer.from('[[mods]]\nmodId="another_mod"'));
  zip.writeZip(unrelated);
  const hash = await hashFile(unrelated);
  await ensureSync(engine);
  assert.equal(await exists(path.join(engine.game, 'mods/other-name.jar')), false);
  assert.equal(await hashFile(unrelated), hash);
  assert.equal(await syncReady(engine), true);
}));

test('conflicting old-state backup blocks migration without overwriting either copy', () => fixture(async engine => {
  const old = await oldInstallation(engine);
  await fs.mkdir(path.join(engine.root, 'sync-backups/automodpack-5-client'), { recursive: true });
  await assert.rejects(ensureSync(engine), /duas instalações antigas/);
  assert.equal(await exists(old), true);
  assert.equal(await exists(path.join(engine.game, 'automodpack/client/active/mods/example.jar')), true);
}));

test('junction in mods blocks migration and leaves its external target alone', () => fixture(async engine => {
  const target = path.join(engine.root, 'external-mods');
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'sentinel'), 'keep');
  await fs.rmdir(path.join(engine.game, 'mods'));
  await fs.symlink(target, path.join(engine.game, 'mods'), 'junction');
  await assert.rejects(ensureSync(engine), /Link/);
  assert.deepEqual(await fs.readdir(target), ['sentinel']);
  await fs.unlink(path.join(engine.game, 'mods'));
}));
