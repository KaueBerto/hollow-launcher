'use strict';

// Startup updates are automatic; ordinary shutdown must never install over a running game.
class LauncherUpdate {
  constructor({ updater, report, active, gamePids, beforeInstall, failedInstall = () => {}, enabled = true, intervalMs = 6 * 60 * 60 * 1000, checkTimeoutMs = 15000 }) {
    Object.assign(this, { updater, report, active, gamePids, beforeInstall, failedInstall, enabled, intervalMs, checkTimeoutMs });
    this.state = { kind: enabled ? 'idle' : 'disabled' };
    this.checking = false;
    this.installing = false;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.on('checking-for-update', () => this.set({ kind: 'checking' }));
    updater.on('update-available', info => this.set({ kind: 'downloading', version: info.version, percent: 0 }));
    updater.on('download-progress', info => this.set({ ...this.state, kind: 'downloading', percent: Math.max(0, Math.min(100, Number(info.percent) || 0)) }));
    updater.on('update-not-available', () => this.set({ kind: 'current' }));
    updater.on('update-downloaded', info => this.set({ kind: 'ready', version: info.version, percent: 100 }));
    updater.on('error', () => {
      if (this.installing) { this.installing = false; this.report({ updating: false }); this.failedInstall(); }
      this.set({ kind: 'error' });
      if (this.booting) this.finishBoot();
    });
  }
  set(value) {
    this.state = value; this.report({ update: value });
    if (this.booting) {
      if (value.kind !== 'checking' && value.kind !== 'idle') clearTimeout(this.bootTimer);
      this.report({ startup: { visible: true, ...value } });
    }
  }
  finishBoot() {
    clearTimeout(this.bootTimer); this.booting = false;
    this.report({ startup: { visible: false } });
  }
  async boot() {
    if (this.booting || this.installing) return;
    if (!this.enabled) { this.finishBoot(); return; }
    this.booting = true;
    this.report({ startup: { visible: true, kind: 'checking' } });
    // A stalled metadata request must not prevent playing. Late results stay in the background.
    const timedOut = new Promise(resolve => {
      this.bootTimer = setTimeout(() => {
        this.finishBoot(); this.set({ kind: 'error' }); resolve();
      }, this.checkTimeoutMs);
    });
    this.bootTimer.unref?.();
    await Promise.race([this.check(), timedOut]);
    if (!this.booting) return;
    if (this.state.kind === 'ready') {
      clearTimeout(this.bootTimer);
      try { await this.install(); if (this.installing) return; }
      catch { /* A running game or an installer failure opens the normal launcher safely. */ }
    }
    this.finishBoot();
  }
  start({ checkNow = true } = {}) {
    if (!this.enabled || this.timer) return;
    if (checkNow) void this.check();
    this.timer = setInterval(() => { void this.check(); }, this.intervalMs);
    this.timer.unref?.();
  }
  stop() { clearInterval(this.timer); clearTimeout(this.bootTimer); this.timer = null; }
  async check() {
    if (!this.enabled || this.checking || this.installing || ['ready', 'downloading'].includes(this.state.kind)) return;
    this.checking = true;
    try { const response = await this.updater.checkForUpdates(); await response?.downloadPromise; }
    catch { this.set({ kind: 'error' }); }
    finally { this.checking = false; }
  }
  async install() {
    if (this.installing) throw new Error('A atualização já está sendo aplicada.');
    if (this.state.kind !== 'ready') throw new Error('Aguarde o download da atualização.');
    if (this.active()) throw new Error('Feche o Minecraft e aguarde a preparação antes de atualizar.');
    // Reserve the main process before awaiting process inspection, preventing Play/reset races.
    this.installing = true;
    this.report({ updating: true });
    try {
      if ((await this.gamePids()).length || this.active()) throw new Error('Feche o Minecraft antes de atualizar o launcher.');
      await this.beforeInstall();
      if (this.booting) this.report({ startup: { visible: true, kind: 'installing', version: this.state.version, percent: 100 } });
      this.updater.quitAndInstall(true, true);
    } catch (error) {
      this.installing = false;
      this.report({ updating: false });
      this.failedInstall();
      throw error;
    }
  }
}

module.exports = { LauncherUpdate };
