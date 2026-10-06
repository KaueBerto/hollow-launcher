'use strict';

class GameWindow {
  constructor(getWindow) { this.getWindow = getWindow; this.hiddenForGame = false; }
  started() {
    const window = this.getWindow();
    if (!window || window.isDestroyed()) return;
    this.hiddenForGame = true;
    window.hide();
  }
  ended() {
    if (!this.hiddenForGame) return;
    this.hiddenForGame = false;
    const window = this.getWindow();
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
  }
  reveal() {
    this.hiddenForGame = false;
    const window = this.getWindow();
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
}

class OfficialGameWatcher {
  constructor({ readPids, started, ended, interval = 2000 }) {
    this.readPids = readPids;
    this.started = started;
    this.ended = ended;
    this.interval = interval;
    this.generation = 0;
    this.running = false;
    this.timer = null;
  }
  stop() { this.generation++; clearTimeout(this.timer); this.timer = null; this.running = false; }
  start() {
    this.stop();
    const generation = this.generation;
    const poll = async () => {
      let pids;
      try { pids = await this.readPids(); }
      catch { /* A failed query is unknown, never a signal that Minecraft closed. */ }
      if (generation !== this.generation) return;
      if (Array.isArray(pids)) {
        if (pids.length && !this.running) { this.running = true; this.started(); }
        else if (!pids.length && this.running) { this.stop(); this.ended(); return; }
      }
      this.timer = setTimeout(poll, this.interval);
      this.timer.unref?.();
    };
    poll();
  }
}

module.exports = { GameWindow, OfficialGameWatcher };
