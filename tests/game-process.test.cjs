'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const { spawn } = require('node:child_process');
const { alive, trackGameProcess, relevantJavaPids } = require('../src/game-process.cjs');

test('exit releases the game before inherited helper streams close; old close cannot clear a new game', async () => {
  const reports = [], engine = { report: value => reports.push(value) };
  const child = new EventEmitter(); child.exitCode = null;
  let cleanupDone, cleanupCalls = 0, logCalls = 0;
  const finish = trackGameProcess(engine, child, { cleanup: () => { cleanupCalls++; return new Promise(resolve => { cleanupDone = resolve; }); }, finishLog: async () => { logCalls++; } });
  assert.equal(alive(child), true);
  child.exitCode = 0; child.emit('exit', 0);
  assert.equal(alive(child), false);
  assert.equal(engine.gameProcess, child, 'files stay reserved until local cleanup finishes');
  cleanupDone(); await finish(0);
  assert.equal(engine.gameProcess, null);
  assert.equal(reports.length, 1);
  const next = new EventEmitter(); next.exitCode = null;
  engine.gameProcess = next;
  child.emit('close', 0); await finish(0);
  assert.equal(engine.gameProcess, next);
  assert.equal(reports.length, 1); assert.equal(cleanupCalls, 1); assert.equal(logCalls, 1);
});

test('real process exit releases state and close does not report twice', { timeout: 10000 }, async () => {
  const child = spawn(process.execPath, ['-e', 'console.log("ready")'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.resume(); child.stderr.resume();
  const close = once(child, 'close'), exit = once(child, 'exit');
  const reports = [], engine = { report: value => reports.push(value) };
  const finish = trackGameProcess(engine, child);
  try {
    const [code] = await exit; await finish(code);
    assert.equal(code, 0);
    assert.equal(engine.gameProcess, null); assert.equal(reports[0].gameRunning, false);
    await close; assert.equal(reports.length, 1);
  } finally { if (alive(child)) child.kill(); }
});

test('signals and spawn failure release state once', async () => {
  const reports = [], engine = { report: value => reports.push(value) };
  const child = new EventEmitter(); child.exitCode = null; child.signalCode = 'SIGTERM';
  assert.equal(alive(child), false);
  const finish = trackGameProcess(engine, child);
  child.emit('close', null); await finish(null);
  assert.equal(engine.gameProcess, null); assert.equal(reports.length, 1);
});

test('only Hollow game and pack helpers block; Crash Assistant and unrelated Java do not', () => {
  const java = 'C:\\HollowSMP\\runtime\\bin\\java.exe', game = 'C:\\HollowSMP\\game';
  const rows = [
    { pid: 10, executable: java, command: 'java.exe @game-args.txt' },
    { pid: 11, executable: java, command: 'java.exe dev.kostromdan.mods.crash_assistant.app.class_loading.Boot --parent 10' },
    { pid: 12, executable: java, command: 'java.exe -jar automodpack-update-helper.jar' },
    { pid: 13, executable: 'C:\\Java\\java.exe', command: 'java.exe -jar unrelated.jar' },
    { pid: 14, executable: 'C:\\Java\\java.exe', command: `java.exe net.minecraft.client.main.Main --gameDir ${game}` },
    { pid: 15, executable: java.toUpperCase(), command: null },
  ];
  assert.deepEqual(relevantJavaPids(rows, { java, game }), [10, 12, 14, 15]);
  assert.throws(() => relevantJavaPids(null, { java, game }));
  assert.throws(() => relevantJavaPids([{ pid: '10' }], { java, game }));
});
