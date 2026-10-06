'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { LauncherUpdate } = require('../src/launcher-update.cjs');

function fixture(overrides = {}) {
  const updater = new EventEmitter(), reports = [], installs = [];
  let checks = 0;
  updater.checkForUpdates = async () => { checks++; updater.emit('update-not-available'); };
  updater.quitAndInstall = (...args) => installs.push(args);
  const manager = new LauncherUpdate({ updater, report: value => reports.push(value), active: () => false, gamePids: async () => [], beforeInstall: async () => {}, ...overrides });
  return { updater, manager, reports, installs, checks: () => checks };
}
test('stable updates only, no downgrade or installation on quit', async () => {
  const f = fixture(); await f.manager.check();
  assert.equal(f.updater.autoDownload, true);
  assert.equal(f.updater.autoInstallOnAppQuit, false);
  assert.equal(f.updater.allowPrerelease, false);
  assert.equal(f.updater.allowDowngrade, false);
  assert.equal(f.manager.state.kind, 'current');
});
test('downloads in background, clamps progress and installs once explicitly', async () => {
  const f = fixture();
  f.updater.emit('update-available', { version: '2.2.1' });
  f.updater.emit('download-progress', { percent: 120 });
  assert.equal(f.manager.state.percent, 100);
  await f.manager.check(); assert.equal(f.checks(), 0);
  assert.equal(f.installs.length, 0);
  f.updater.emit('update-downloaded', { version: '2.2.1' });
  await f.manager.install(); assert.deepEqual(f.installs, [[true, true]]);
  await assert.rejects(f.manager.install(), /já está/);
});
test('blocks updates during preparation, game and an externally opened Hollow game', async () => {
  for (const overrides of [{ active: () => true }, { gamePids: async () => [42] }]) {
    const f = fixture(overrides); f.updater.emit('update-downloaded', { version: '2.2.1' });
    await assert.rejects(f.manager.install(), /Minecraft/);
    assert.equal(f.installs.length, 0); assert.equal(f.manager.installing, false);
  }
});
test('reserves installation while inspecting processes and rechecks activity afterwards', async () => {
  let resolve, active = false;
  const f = fixture({ active: () => active, gamePids: () => new Promise(r => { resolve = r; }) });
  f.updater.emit('update-downloaded', { version: '2.2.1' });
  const applying = f.manager.install();
  assert.equal(f.reports.at(-1).updating, true);
  await assert.rejects(f.manager.install(), /já está/);
  active = true; resolve([]);
  await assert.rejects(applying, /Minecraft/);
  assert.equal(f.reports.at(-1).updating, false);
});
test('network/download failure is handled and a later check retries', async () => {
  const f = fixture();
  f.updater.checkForUpdates = async () => { throw new Error('offline'); };
  await f.manager.check(); assert.equal(f.manager.state.kind, 'error');
  f.updater.checkForUpdates = async () => ({ downloadPromise: Promise.reject(new Error('interrupted')) });
  await f.manager.check(); assert.equal(f.manager.state.kind, 'error');
  f.updater.checkForUpdates = async () => { f.updater.emit('update-not-available'); };
  await f.manager.check(); assert.equal(f.manager.state.kind, 'current');
});
test('installer failure releases controls and restores application services', async () => {
  let restored = 0;
  const f = fixture({ failedInstall: () => restored++ });
  f.updater.emit('update-downloaded', { version: '2.2.1' });
  f.updater.quitAndInstall = () => f.updater.emit('error', new Error('installer failed'));
  await f.manager.install();
  assert.equal(f.manager.installing, false); assert.equal(restored, 1);
  assert.equal(f.manager.state.kind, 'error'); assert.equal(f.reports.some(r => r.updating === false), true);
});
test('development/portable modes never check or start timers', async () => {
  const f = fixture({ enabled: false }); f.manager.start(); await f.manager.check();
  assert.equal(f.checks(), 0); assert.equal(f.manager.timer, undefined);
  await assert.rejects(f.manager.install(), /Aguarde/);
});
