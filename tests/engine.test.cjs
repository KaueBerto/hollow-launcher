'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const AdmZip = require('adm-zip');
const { Engine, under, offlineUuid, allowed, validateOptions, readJson, writeJson, extract, MOD_HASH, hashFile, workers } = require('../src/engine.cjs');
const directory = path.resolve(__dirname, '..', 'dist', 'tests');

async function fixture(operation) {
  await fs.mkdir(directory, { recursive: true });
  const folder = await fs.mkdtemp(path.join(directory, 'case-'));
  const engine = new Engine({ root: path.join(folder, 'HollowSMP'), assets: path.resolve(__dirname, '..', 'assets') });
  engine.javaRunning = async () => false;
  try { await operation(engine, folder); }
  finally {
    if (!folder.startsWith(`${directory}${path.sep}`)) throw new Error('Limpeza fora da pasta de testes.');
    await fs.rm(folder, { recursive: true, force: true });
  }
}
test('UUID offline e regras de plataforma', () => {
  assert.equal(offlineUuid('Notch'), 'b50ad385829d3141a2167e7d7539ba7f');
  assert.equal(allowed({ rules: [{ action: 'allow', os: { name: 'linux' } }] }), false);
  assert.equal(allowed({ rules: [{ action: 'allow', features: { is_demo_user: true } }] }), false);
  assert.equal(allowed({ rules: [{ action: 'allow', os: { name: 'windows' } }] }), true);
  assert.throws(() => validateOptions({ mode: 'nickname', nickname: 'a;evil', ram: 6 }));
  assert.throws(() => validateOptions({ mode: 'nickname', nickname: 'Hollow', ram: 25 }));
});
test('caminhos recusam travessia, raiz e caminhos absolutos', () => {
  for (const name of ['../outside', '..\\outside', '.', 'C:\\outside', '/outside']) assert.throws(() => under(directory, name));
  assert.equal(under(directory, 'assets/object'), path.join(directory, 'assets', 'object'));
});
test('AutoModpack original preservado', async () => assert.equal(await hashFile(path.resolve(__dirname, '..', 'assets', 'automodpack-5.0.0-rc.2.jar'), 'sha256'), MOD_HASH));
test('preferências da versão C# são migradas e nickname não lembrado é removido', async () => fixture(async engine => {
  await writeJson(path.join(engine.root, 'launcher-settings.json'), { mode: 1, nickname: 'Hollow', ram: 8, remember: true });
  assert.deepEqual(await engine.loadSettings(), { mode: 'microsoft', nickname: 'Hollow', ram: 8, remember: true });
  await engine.saveSettings({ mode: 'nickname', nickname: 'Hollow', ram: 6, remember: false });
  assert.equal((await engine.loadSettings()).nickname, '');
}));
test('reset elimina apenas a instalação isolada, recusa diretório pai e aceita repetição', async () => fixture(async (engine, folder) => {
  await fs.mkdir(path.join(engine.game, 'mods'), { recursive: true });
  await fs.writeFile(path.join(engine.game, 'mods', 'example.jar'), 'test');
  const outside = path.join(folder, 'outside.txt'); await fs.writeFile(outside, 'keep');
  await engine.reset(); await engine.reset();
  assert.equal(await fs.readFile(outside, 'utf8'), 'keep');
  await assert.rejects(fs.access(engine.root));
  const invalid = new Engine({ root: folder }); invalid.javaRunning = async () => false;
  await assert.rejects(invalid.reset(), /inválida/);
}));
test('reset bloqueia Java aberto sem apagar arquivos', async () => fixture(async engine => {
  await writeJson(path.join(engine.root, 'ready.json'), { sentinel: true });
  engine.javaRunning = async () => true;
  await assert.rejects(engine.reset(), /Feche o Minecraft/);
  assert.equal((await readJson(path.join(engine.root, 'ready.json'))).sentinel, true);
}));
test('reset recusa junction e preserva seu alvo externo', async () => fixture(async (engine, folder) => {
  const target = path.join(folder, 'outside'); await fs.mkdir(target); await fs.writeFile(path.join(target, 'keep.txt'), 'keep');
  await fs.mkdir(engine.root); const link = path.join(engine.root, 'linked');
  await fs.symlink(target, link, 'junction');
  try { await assert.rejects(engine.reset(), /link/); assert.equal(await fs.readFile(path.join(target, 'keep.txt'), 'utf8'), 'keep'); }
  finally { await fs.unlink(link); }
}));
test('reset recusa arquivo ocupado antes de apagar a instalação', { skip: process.platform !== 'win32' }, async () => fixture(async (engine, folder) => {
  await fs.mkdir(engine.root); const locked = path.join(engine.root, 'locked.txt'); await fs.writeFile(locked, 'preserve');
  const ready = path.join(folder, 'lock-ready');
  const script = `$stream=[IO.File]::Open('${locked.replaceAll("'", "''")}',[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None); [IO.File]::WriteAllText('${ready.replaceAll("'", "''")}','ready'); [Console]::ReadLine() | Out-Null; $stream.Dispose()`;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  try {
    let found = false; for (let i=0;i<100;i++) { try { await fs.access(ready); found = true; break; } catch { await new Promise(resolve=>setTimeout(resolve,50)); } }
    assert.equal(found, true, 'Processo de teste não abriu o arquivo');
    await assert.rejects(engine.reset(), /acessar todos os arquivos/);
  } finally { child.stdin.end('\n'); await new Promise(resolve => child.once('close', resolve)); }
  assert.equal(await fs.readFile(locked, 'utf8'), 'preserve');
}));
test('registro Microsoft preserva perfis, configurações e backup', async () => fixture(async (engine, folder) => {
  const home = path.join(folder, 'official');
  await fs.mkdir(path.join(engine.game, 'libraries'), { recursive: true });
  await fs.mkdir(path.join(engine.game, 'versions'), { recursive: true });
  const file = path.join(home, 'launcher_profiles.json');
  await writeJson(file, { profiles: { existing: { name: 'Keep' } }, settings: { sentinel: true } });
  await engine.registerOfficial(8, home);
  const value = await readJson(file);
  assert.equal(value.profiles.existing.name, 'Keep'); assert.equal(value.settings.sentinel, true);
  assert.equal(value.profiles['hollow-smp'].gameDir, engine.game);
  assert.equal(value.profiles['hollow-smp'].javaArgs.includes('-Xmx8G'), true);
  assert.equal((await readJson(`${file}.before-hollow.bak`)).profiles['hollow-smp'], undefined);
}));
test('ZIP extrai arquivos válidos e downloads exigem HTTPS', async () => fixture(async (engine, folder) => {
  const zip = new AdmZip(); zip.addFile('runtime/bin/java.exe', Buffer.from('fixture'));
  const file = path.join(folder, 'java.zip'); zip.writeZip(file);
  await extract(file, engine.root); assert.equal(await fs.readFile(path.join(engine.root, 'runtime', 'bin', 'java.exe'), 'utf8'), 'fixture');
  await assert.rejects(engine.download('http://example.com/file', path.join(engine.root, 'unsafe')), /HTTPS/);
}));
test('downloads reaproveitam hashes e não finalizam conteúdo inválido', async () => fixture(async engine => {
  const file = path.join(engine.root, 'asset'); await fs.mkdir(engine.root);
  await fs.writeFile(file, 'valid'); const expected = crypto.createHash('sha1').update('valid').digest('hex');
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, url: 'https://example.com/asset', body: new ReadableStream({ start(controller) { controller.enqueue(Buffer.from('invalid')); controller.close(); } }), headers: new Headers() }; };
  try {
    await engine.download('https://example.com/asset', file, expected); assert.equal(calls, 0);
    const invalid = path.join(engine.root, 'invalid'); await assert.rejects(engine.download('https://example.com/asset', invalid, expected), /verificação/);
    await assert.rejects(fs.access(invalid)); await assert.rejects(fs.access(`${invalid}.partial`));
  } finally { global.fetch = originalFetch; }
}));
test('fila de downloads espera todos os trabalhadores após falha', async () => {
  let active = 0;
  await assert.rejects(workers([0,1,2,3], 2, async item => { active++; try { if (item === 0) throw new Error('network'); await new Promise(resolve => setTimeout(resolve, 30)); } finally { active--; } }), /network/);
  assert.equal(active, 0);
});
