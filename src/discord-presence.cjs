'use strict';
const net = require('node:net');
const { randomUUID } = require('node:crypto');

const MAX_FRAME = 64 * 1024;
function frame(opcode, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload));
  const result = Buffer.allocUnsafe(8 + body.length);
  result.writeUInt32LE(opcode, 0); result.writeUInt32LE(body.length, 4); body.copy(result, 8);
  return result;
}

class DiscordPresence {
  constructor({ applicationId, pid = process.pid, connect = name => net.createConnection(name),
    pipes = Array.from({ length: 10 }, (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`),
    timeout = 4000, retryDelay = 15000 } = {}) {
    this.applicationId = String(applicationId || '');
    this.pid = pid; this.connect = connect; this.pipes = pipes;
    this.timeout = timeout; this.retryDelay = retryDelay;
    this.running = false; this.socket = null; this.retry = null; this.deadline = null;
    this.status = 'disabled'; this.generation = 0; this.stopping = null;
  }
  start() {
    if (this.running || !/^[1-9]\d{16,19}$/.test(this.applicationId)) return;
    this.running = true; this.status = 'connecting'; this.attempt(0);
  }
  attempt(index) {
    if (!this.running) return;
    if (index >= this.pipes.length) {
      this.status = 'waiting';
      this.retry = setTimeout(() => { this.retry = null; this.attempt(0); }, this.retryDelay);
      this.retry.unref?.(); return;
    }
    const generation = ++this.generation;
    let socket;
    try { socket = this.connect(this.pipes[index]); }
    catch { this.attempt(index + 1); return; }
    this.socket = socket;
    let buffered = Buffer.alloc(0), ready = false, nonce = null, settled = false;
    const active = () => this.running && this.generation === generation && this.socket === socket;
    const close = () => { if (!socket.destroyed) socket.destroy(); };
    const arm = () => {
      clearTimeout(this.deadline);
      this.deadline = setTimeout(close, this.timeout); this.deadline.unref?.();
    };
    const write = (opcode, body) => { if (active() && !socket.destroyed) socket.write(frame(opcode, body)); };
    arm();
    socket.once('connect', () => write(0, { v: 1, client_id: this.applicationId }));
    socket.on('error', () => close());
    socket.once('close', () => {
      if (!active() || settled) return;
      settled = true; clearTimeout(this.deadline); this.deadline = null; this.socket = null;
      if (!ready) this.attempt(index + 1);
      else {
        this.status = 'waiting';
        this.retry = setTimeout(() => { this.retry = null; this.attempt(0); }, this.retryDelay);
        this.retry.unref?.();
      }
    });
    socket.on('data', chunk => {
      if (!active()) return;
      if (buffered.length + chunk.length > MAX_FRAME + 8) { close(); return; }
      buffered = Buffer.concat([buffered, chunk]);
      while (buffered.length >= 8) {
        const opcode = buffered.readUInt32LE(0), length = buffered.readUInt32LE(4);
        if (length > MAX_FRAME || opcode > 4) { close(); return; }
        if (buffered.length < 8 + length) return;
        const bytes = buffered.subarray(8, 8 + length); buffered = buffered.subarray(8 + length);
        if (opcode === 3) { write(4, bytes); continue; }
        if (opcode === 4) continue;
        if (opcode !== 1) { close(); return; }
        let message;
        try { message = JSON.parse(bytes.toString('utf8')); } catch { close(); return; }
        if (!message || typeof message !== 'object' || message.evt === 'ERROR') { close(); return; }
        if (!ready && message.cmd === 'DISPATCH' && message.evt === 'READY') {
          ready = true; nonce = randomUUID(); arm();
          // Discord uses the application's name for the Playing label. No changing details, timer, or images.
          write(1, { cmd: 'SET_ACTIVITY', args: { pid: this.pid, activity: { type: 0 } }, nonce });
        } else if (ready && message.cmd === 'SET_ACTIVITY' && message.nonce === nonce) {
          clearTimeout(this.deadline); this.deadline = null; this.status = 'active';
        }
      }
    });
  }
  stop() {
    if (this.stopping) return this.stopping;
    this.running = false; this.generation++; this.status = 'stopped';
    clearTimeout(this.retry); clearTimeout(this.deadline); this.retry = null; this.deadline = null;
    const socket = this.socket; this.socket = null;
    if (!socket || socket.destroyed) return Promise.resolve();
    this.stopping = new Promise(resolve => {
      const done = () => { clearTimeout(timer); socket.destroy(); resolve(); };
      const timer = setTimeout(done, 250);
      socket.once('close', done);
      try { socket.end(frame(1, { cmd: 'SET_ACTIVITY', args: { pid: this.pid, activity: null }, nonce: randomUUID() }), done); }
      catch { done(); }
    });
    return this.stopping;
  }
}
module.exports = { DiscordPresence, frame };
