const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { prepareMenu, validateManifest } = require('../src/menu-bootstrap.cjs');
const { hashFile } = require('../src/engine.cjs');
async function fixture(callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'averon-menu-test-'));
  const bytes = new Map();
  const files = [ ['mods/fancymenu_neoforge_test.jar', 'mod', 'jar bytes'], ['config/fancymenu/customization/title_screen_layout.txt', 'default', 'layout'], ['config/fancymenu/assets/wallpaper.mp4', 'default', 'video bytes'] ].map(([name, kind, text]) => {
    const data = Buffer.from(text), sha256 = crypto.createHash('sha256').update(data).digest('hex');
    bytes.set(sha256, data);
    return { path: name, kind, sha256, size: data.length, ...(kind === 'mod' ? { prefix: 'fancymenu_neoforge_', modId: 'fancymenu' } : {}), url: `https://painel.hollowsmp.com.br/hollow-packs/launcher-menu/${sha256}${path.extname(name)}` };
  });
  const manifest = { schema: 1, id: 'test', minecraft: '1.21.1', files };
  let calls = 0;
  const engine = { root, game: path.join(root, 'game'), progress() {}, async download(url, destination, hash) {
    calls++; await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(destination, bytes.get(hash));
  } };
  try { await callback({ root, engine, manifest, calls: () => calls }); }
  finally { assert(root.startsWith(os.tmpdir())); await fs.rm(root, { recursive: true, force: true }); }
}
test('fresh menu installs before first launch; subsequent offline launches do not download or reset player settings', () => fixture(async ({ engine, manifest, calls }) => {
  await fs.mkdir(path.join(engine.game, 'config'), { recursive: true });
  await fs.writeFile(path.join(engine.game, 'config/fml.toml'), 'earlyWindowProvider = "fmlearlywindow"\nmaxThreads = 8\n');
  assert.equal((await prepareMenu(engine, { manifest })).installed, 3);
  const fml = await fs.readFile(path.join(engine.game, 'config/fml.toml'), 'utf8');
  assert.match(fml, /drippy_early_window/); assert.match(fml, /maxThreads = 8/);
  await fs.writeFile(path.join(engine.game, manifest.files[1].path), 'player custom menu');
  await fs.writeFile(path.join(engine.game, 'options.txt'), 'renderDistance:20');
  assert.equal((await prepareMenu(engine, { manifest })).downloaded, 0); assert.equal(calls(), 3);
  assert.equal(await fs.readFile(path.join(engine.game, manifest.files[1].path), 'utf8'), 'player custom menu');
  assert.equal(await fs.readFile(path.join(engine.game, 'options.txt'), 'utf8'), 'renderDistance:20');
}));
test('server projection replaces an owned bootstrap mod without duplicate JARs or changing the projection', () => fixture(async ({ engine, manifest, calls }) => {
  await prepareMenu(engine, { manifest });
  const active = path.join(engine.game, 'automodpack/client/active/mods/fancymenu_neoforge_new.jar');
  await fs.mkdir(path.dirname(active), { recursive: true }); await fs.writeFile(active, 'server version');
  const hash = await hashFile(active, 'sha256');
  await prepareMenu(engine, { manifest });
  await assert.rejects(fs.access(path.join(engine.game, manifest.files[0].path)), /ENOENT/);
  assert.equal(await hashFile(active, 'sha256'), hash); assert.equal(calls(), 3);
}));
test('corrupt download blocks installation; changed mod is preserved instead of overwritten', () => fixture(async ({ engine, manifest }) => {
  engine.download = async (url, destination) => { await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(destination, 'bad'); };
  await assert.rejects(prepareMenu(engine, { manifest }), /Download do menu inválido/);
  await assert.rejects(fs.access(path.join(engine.game, manifest.files[0].path)), /ENOENT/);
  await fs.mkdir(path.join(engine.game, 'mods'), { recursive: true });
  await fs.writeFile(path.join(engine.game, manifest.files[0].path), 'user mod');
  await assert.rejects(prepareMenu(engine, { manifest }), /preservado/);
  assert.equal(await fs.readFile(path.join(engine.game, manifest.files[0].path), 'utf8'), 'user mod');
}));
test('unsafe origins, traversal, duplicate paths and directory links are refused', () => fixture(async ({ engine, manifest, root }) => {
  for (const change of [{ path: '../outside' }, { url: 'http://example.com/a.jar' }, { sha256: 'bad' }]) {
    const bad = structuredClone(manifest); Object.assign(bad.files[0], change); assert.throws(() => validateManifest(bad));
  }
  const duplicate = structuredClone(manifest); duplicate.files.push(duplicate.files[0]); assert.throws(() => validateManifest(duplicate));
  const outside = path.join(root, 'outside'); await fs.mkdir(outside);
  await fs.mkdir(engine.game); await fs.symlink(outside, path.join(engine.game, 'config'), 'junction');
  const configs = { ...manifest, files: manifest.files.slice(1) };
  await assert.rejects(prepareMenu(engine, { manifest: configs }), /Link/);
  assert.deepEqual(await fs.readdir(outside), []);
}));
test('an externally opened game blocks menu installation before any file is changed', () => fixture(async ({ engine, manifest, calls }) => {
  engine.javaRunning = async () => true;
  await assert.rejects(prepareMenu(engine, { manifest }), /Feche o Minecraft/);
  assert.equal(calls(), 0);
  await assert.rejects(fs.access(engine.game), /ENOENT/);
}));
