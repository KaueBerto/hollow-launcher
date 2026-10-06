'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { GameWindow, OfficialGameWatcher } = require('../src/game-window.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function fakeWindow() {
  return { visible: true, minimized: false, destroyed: false, isDestroyed() { return this.destroyed; }, isMinimized() { return this.minimized; }, hide() { this.visible = false; }, show() { this.visible = true; }, restore() { this.minimized = false; }, focus() {} };
}
test('esconde ao iniciar e restaura ao encerrar, sem encerrar a janela', () => {
  const window = fakeWindow(), controller = new GameWindow(() => window);
  controller.started(); assert.equal(window.visible, false); assert.equal(window.destroyed, false);
  controller.ended(); assert.equal(window.visible, true);
});
test('reabertura manual restaura janela minimizada e janela destruída é ignorada', () => {
  const window = fakeWindow(), controller = new GameWindow(() => window);
  controller.started(); window.minimized = true; controller.reveal(); assert.equal(window.visible, true); assert.equal(window.minimized, false);
  window.destroyed = true; assert.doesNotThrow(() => controller.started()); assert.doesNotThrow(() => controller.ended());
});
test('Microsoft aguarda o jogo, ignora falha de consulta e restaura ao fechar', async () => {
  const queries = [[], [12], new Error('query unavailable'), [12], []];
  const events = [];
  const watcher = new OfficialGameWatcher({ interval: 5, readPids: async () => { const value = queries.shift(); if (value instanceof Error) throw value; return value || []; }, started: () => events.push('started'), ended: () => events.push('ended') });
  try { watcher.start(); for (let i=0;i<50 && events.length<2;i++) await pause(5); assert.deepEqual(events, ['started', 'ended']); }
  finally { watcher.stop(); }
});
test('consulta antiga não esconde janela depois de cancelar o acompanhamento', async () => {
  let finish;
  const events = [];
  const watcher = new OfficialGameWatcher({ readPids: () => new Promise(resolve => { finish = resolve; }), started: () => events.push('started'), ended: () => events.push('ended') });
  watcher.start(); watcher.stop(); finish([12]); await pause(5); assert.deepEqual(events, []);
});
