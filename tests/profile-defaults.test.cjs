'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { prepareProfileDefaults, validateManifest } = require('../src/profile-defaults.cjs');

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
async function fixture(entries = { 'options.txt': 'key_key.jump:key.keyboard.space\n', 'config/example.json': '{"enabled":true}\n' }) {
  const temporaryRoot = path.join(__dirname, '..', 'dist', 'test-profile-defaults');
  await fs.mkdir(temporaryRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(temporaryRoot, 'averon-profile-'));
  const game = path.join(root, 'game'), assets = path.join(root, 'assets');
  await fs.mkdir(assets, { recursive: true });
  const zip = new AdmZip();
  const files = [];
  for (const [name, text] of Object.entries(entries)) {
    const data = Buffer.from(text); zip.addFile(name, data);
    files.push({ path: name, size: data.length, sha256: hash(data) });
  }
  const buffer = zip.toBuffer(), archivePath = path.join(assets, 'profile-defaults.zip');
  await fs.writeFile(archivePath, buffer);
  const manifest = { schema: 1, id: `averon-profile-${hash(buffer).slice(0, 12)}`, minecraft: '1.21.1', archive: { file: 'profile-defaults.zip', size: buffer.length, sha256: hash(buffer) }, enforcedFiles: [], files };
  return { root, game, assets, archivePath, manifest, javaRunning: async () => false };
}

test('instala o perfil somente em arquivos ausentes e registra o recibo', async t => {
  const engine = await fixture(); t.after(() => fs.rm(engine.root, { recursive: true, force: true }));
  await fs.mkdir(engine.game, { recursive: true });
  await fs.writeFile(path.join(engine.game, 'options.txt'), 'preferência do jogador\n');
  const result = await prepareProfileDefaults(engine, { manifest: engine.manifest, archivePath: engine.archivePath });
  assert.deepEqual(result, { installed: 1, preserved: 1, enforced: 0 });
  assert.equal(await fs.readFile(path.join(engine.game, 'options.txt'), 'utf8'), 'preferência do jogador\n');
  assert.equal(await fs.readFile(path.join(engine.game, 'config/example.json'), 'utf8'), '{"enabled":true}\n');
  assert.equal(JSON.parse(await fs.readFile(path.join(engine.root, 'profile-defaults-installed.json'))).id, engine.manifest.id);
  assert.deepEqual(await prepareProfileDefaults(engine, { manifest: engine.manifest, archivePath: engine.archivePath }), { installed: 0, preserved: 2, enforced: 0 });
});

test('padroniza EMF e ETF uma vez, com backup, sem alterar outras preferências', async t => {
  const engine = await fixture({
    'options.txt': 'original-default\n',
    'config/entity_model_features.json': '{"model":"averon"}\n',
    'config/entity_texture_features.json': '{"texture":"averon"}\n',
  });
  t.after(() => fs.rm(engine.root, { recursive: true, force: true }));
  engine.manifest.enforcedFiles = ['config/entity_model_features.json', 'config/entity_texture_features.json'];
  await fs.mkdir(path.join(engine.game, 'config'), { recursive: true });
  await fs.writeFile(path.join(engine.game, 'options.txt'), 'player-options\n');
  await fs.writeFile(path.join(engine.game, 'config/entity_model_features.json'), '{"model":"old"}\n');
  await fs.writeFile(path.join(engine.game, 'config/entity_texture_features.json'), '{"texture":"averon"}\n');
  const result = await prepareProfileDefaults(engine, { manifest: engine.manifest, archivePath: engine.archivePath });
  assert.deepEqual(result, { installed: 0, preserved: 2, enforced: 1 });
  assert.equal(await fs.readFile(path.join(engine.game, 'options.txt'), 'utf8'), 'player-options\n');
  assert.equal(await fs.readFile(path.join(engine.game, 'config/entity_model_features.json'), 'utf8'), '{"model":"averon"}\n');
  assert.equal(await fs.readFile(path.join(engine.root, 'profile-defaults-backups', engine.manifest.id, 'config/entity_model_features.json'), 'utf8'), '{"model":"old"}\n');
});

test('recusa manifesto inseguro, arquivo adulterado e Minecraft aberto', async t => {
  const engine = await fixture(); t.after(() => fs.rm(engine.root, { recursive: true, force: true }));
  assert.throws(() => validateManifest({ ...engine.manifest, files: [{ ...engine.manifest.files[0], path: '../options.txt' }] }), /inválid/);
  const changed = { ...engine.manifest, archive: { ...engine.manifest.archive, sha256: '0'.repeat(64) } };
  await assert.rejects(prepareProfileDefaults(engine, { manifest: changed, archivePath: engine.archivePath }), /corrompido/);
  engine.javaRunning = async () => true;
  await assert.rejects(prepareProfileDefaults(engine, { manifest: engine.manifest, archivePath: engine.archivePath }), /Feche o Minecraft/);
});
