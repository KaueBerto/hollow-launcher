'use strict';
class LauncherMusic {
  constructor(audio, button, storage) {
    this.audio = audio;
    this.button = button;
    this.storage = storage;
    this.allowed = false;
    this.active = false;
    this.failed = false;
    try { this.muted = storage.getItem('averon.music.muted') === 'true'; } catch { this.muted = false; }
    audio.volume = 0.25;
    audio.loop = true;
    audio.muted = this.muted;
    audio.addEventListener('error', () => {
      this.failed = true;
      this.active = false;
      this.updateButton();
    });
    button.addEventListener('click', () => {
      this.muted = !this.muted;
      audio.muted = this.muted;
      try { storage.setItem('averon.music.muted', String(this.muted)); } catch {}
      this.sync();
    });
    this.updateButton();
  }
  updateButton() {
    this.button.setAttribute('aria-pressed', String(this.muted));
    this.button.setAttribute('aria-label', this.muted ? 'Ativar música' : 'Silenciar música');
    this.button.title = this.failed ? 'Música indisponível' : `${this.muted ? 'Ativar' : 'Silenciar'} música · volume 25%`;
    this.button.dataset.muted = String(this.muted);
    this.button.disabled = this.failed;
  }
  setAllowed(allowed) {
    this.allowed = Boolean(allowed);
    this.sync();
  }
  sync() {
    this.updateButton();
    const desired = this.allowed && !this.muted && !this.failed;
    if (desired === this.active) return;
    this.active = desired;
    if (desired) {
      Promise.resolve(this.audio.play()).catch(() => {
        if (!this.active) return;
        this.active = false;
        this.muted = true;
        this.audio.muted = true;
        this.updateButton();
      });
    } else this.audio.pause();
  }
}
if (typeof module !== 'undefined') module.exports = { LauncherMusic };
else window.LauncherMusic = LauncherMusic;
