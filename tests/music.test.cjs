const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LauncherMusic } = require('../renderer/music.js');

function setup(saved = null) {
  const events = {};
  const audio = { played: 0, paused: 0, addEventListener: (n, fn) => events[n] = fn,
    play() { this.played++; return Promise.resolve(); }, pause() { this.paused++; } };
  const button = { dataset: {}, setAttribute(n, v) { this[n] = v; }, addEventListener(n, fn) { this[n] = fn; } };
  const storage = { value: saved, getItem() { return this.value; }, setItem(k, v) { this.value = v; } };
  return { audio, button, storage, events, music: new LauncherMusic(audio, button, storage) };
}
test('music starts at 25%, loops, pauses for gameplay/hidden window, resumes without restarting', () => {
  const { music, audio } = setup();
  assert.equal(audio.volume, .25); assert.equal(audio.loop, true); assert.equal(audio.played, 0);
  music.setAllowed(true); music.setAllowed(true); assert.equal(audio.played, 1);
  music.setAllowed(false); assert.equal(audio.paused, 1);
  music.setAllowed(true); assert.equal(audio.played, 2);
});
test('mute button persists preference and never overrides remembered mute', () => {
  const { music, audio, button, storage } = setup('true');
  music.setAllowed(true); assert.equal(audio.played, 0); assert.equal(button['aria-pressed'], 'true');
  button.click(); assert.equal(audio.played, 1); assert.equal(storage.value, 'false');
  button.click(); assert.equal(audio.paused, 1); assert.equal(storage.value, 'true');
  music.setAllowed(false); music.setAllowed(true); assert.equal(audio.played, 1);
});
test('missing audio fails quietly and rejected autoplay remains controllable', async () => {
  const a = setup(); a.events.error(); a.music.setAllowed(true);
  assert.equal(a.audio.played, 0); assert.equal(a.button.disabled, true);
  const b = setup(); b.audio.play = () => Promise.reject(new Error('autoplay'));
  b.music.setAllowed(true); await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.button['aria-pressed'], 'true'); assert.equal(b.button.disabled, false);
});
