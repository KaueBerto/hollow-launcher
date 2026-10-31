'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { memoryLimits, clampRam, GIB } = require('../src/core/memory.cjs');
const { validateOptions } = require('../src/core/minecraft.cjs');
const { Engine } = require('../src/engine.cjs');
const { registerHandlers } = require('../src/ipc.cjs');

async function fixture(totalGB, operation) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'averon-memory-'));
  const engine = new Engine({ root: path.join(root, 'HollowSMP'), totalMemory: totalGB * GIB, assets: path.resolve(__dirname, '../assets') });
  try { await operation(engine); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('RAM maximum follows the full physical capacity while the automatic default stays conservative', () => {
  for (const [total, recommended] of [[4, 2], [8, 6], [12, 6], [16, 6], [24, 6], [32, 6], [64, 6], [96, 6]]) {
    const memory = memoryLimits(total * GIB);
    assert.equal(memory.totalGB, total);
    assert.equal(memory.maximumGB, total);
    assert.equal(memory.recommendedGB, recommended);
    assert.equal(memory.supported, true);
  }
  assert.equal(memoryLimits(7.9 * GIB).totalGB, 8);
});

test('invalid RAM readings fail explicitly and machines under 4 GB cannot launch', () => {
  for (const value of [NaN, Infinity, -1, 0]) assert.throws(() => memoryLimits(value));
  assert.throws(() => validateOptions({ mode: 'nickname', nickname: 'Player', ram: 2 }, { memory: memoryLimits(2 * GIB) }), /pelo menos 4 GB/);
});

test('memory validation follows this machine rather than a fixed maximum of 24 GB', () => {
  const options = { mode: 'nickname', nickname: 'Player', ram: 24 };
  assert.throws(() => validateOptions(options, { memory: memoryLimits(8 * GIB) }), /2 a 8 GB/);
  const memory = memoryLimits(64 * GIB);
  assert.equal(validateOptions({ ...options, ram: 40 }, { memory }).ram, 40);
  for (const ram of [65, 1, 6.5, NaN, '6']) assert.throws(() => validateOptions({ ...options, ram }, { memory }));
  assert.equal(clampRam(Infinity, memory), 6);
  assert.equal(clampRam(-1, memory), 6);
  assert.equal(clampRam(500, memory), 64);
});

test('saved RAM above the new machine limit is clamped while all player preferences are retained', () => fixture(8, async engine => {
  const preferences = { mode: 'nickname', nickname: 'MyPlayer', ram: 24, remember: true, landscape: true };
  const file = path.join(engine.root, 'launcher-settings.json');
  await fs.mkdir(engine.root);
  await fs.writeFile(file, JSON.stringify(preferences));
  assert.deepEqual(await engine.loadSettings(), { ...preferences, ram: 8 });
  await engine.saveSettings(await engine.loadSettings());
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { ...preferences, ram: 8 });
  await assert.rejects(engine.saveSettings({ ...preferences, memory: memoryLimits(128 * GIB) }), /2 a 8 GB/);
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).ram, 8);
}));

test('first installation on a 4 GB PC defaults to 2 GB; Java rejects an excessive heap before reading installation files', () => fixture(4, async engine => {
  assert.equal((await engine.loadSettings()).ram, 2);
  await assert.rejects(engine.buildArguments('Player', 6), /2 a 4 GB/);
}));

test('IPC exposes actual hardware limits and rejects forged memory selections before login or launching', () => fixture(8, async engine => {
  const handlers = new Map();
  registerHandlers({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler), on() {} },
    app: { getVersion: () => 'test' }, engine, state: {},
    microsoft: { publicAccount: async () => null, authenticate: async () => { throw Error('Login should not start'); } },
    trusted() {}, result: operation => operation(), prepare: operation => operation(),
  });
  const state = await handlers.get('launcher:state')({});
  assert.equal(state.memory.totalGB, 8);
  assert.equal(state.memory.maximumGB, 8);
  const options = { mode: 'microsoft', ram: 24, remember: true, memory: memoryLimits(128 * GIB) };
  await assert.rejects(handlers.get('launcher:play')({}, options), /2 a 8 GB/);
  await assert.rejects(handlers.get('launcher:save')({}, options), /2 a 8 GB/);
}));
