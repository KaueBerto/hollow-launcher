'use strict';
const net = require('node:net');
const dns = require('node:dns/promises');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const MAX_PACKET = 1024 * 1024;
function varInt(value) {
  let number = value >>> 0;
  const bytes = [];
  do { let byte = number & 127; number >>>= 7; if (number) byte |= 128; bytes.push(byte); } while (number);
  return Buffer.from(bytes);
}
function readVarInt(buffer, offset = 0) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (offset + i >= buffer.length) return null;
    const byte = buffer[offset + i]; value += (byte & 127) * 2 ** (7 * i);
    if (!(byte & 128)) return { value, bytes: i + 1 };
  }
  throw new Error('Invalid VarInt');
}
const packet = bytes => Buffer.concat([varInt(bytes.length), bytes]);
function handshake(host, port) {
  const name = Buffer.from(host, 'utf8'), number = Buffer.alloc(2); number.writeUInt16BE(port);
  return packet(Buffer.concat([varInt(0), varInt(767), varInt(name.length), name, number, varInt(1)]));
}
function statusData(value) {
  if (!value || typeof value !== 'object' || !value.version || !value.players) throw new Error('Invalid status');
  const count = number => Number.isSafeInteger(number) && number >= 0 && number <= 10000000 ? number : null;
  return { kind: 'online', players: count(value.players.online), maxPlayers: count(value.players.max), ping: null };
}
// Java server-list protocol. Never logs in, joins the world or changes the server.
async function queryServer({ host, port = 25565, timeout = 5000, useSrv = true, resolver = dns.resolveSrv } = {}) {
  if (typeof host !== 'string' || !host || host.length > 255 || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid address');
  const checkedAt = Date.now();
  let socket, timer, pongTimer, finished = false;
  return new Promise(resolve => {
    let result;
    const finish = value => {
      if (finished) return; finished = true;
      clearTimeout(timer); clearTimeout(pongTimer); socket?.destroy();
      resolve({ ...(value || result || { kind: 'unknown', players: null, maxPlayers: null, ping: null }), checkedAt });
    };
    timer = setTimeout(() => finish(), timeout);
    (async () => {
      let target = host, targetPort = port;
      if (useSrv && port === 25565 && !net.isIP(host)) {
        try {
          const records = await resolver(`_minecraft._tcp.${host}`);
          const record = records.sort((a, b) => a.priority - b.priority || b.weight - a.weight)[0];
          if (record?.name && record.name !== '.' && Number.isInteger(record.port) && record.port > 0 && record.port <= 65535) { target = record.name; targetPort = record.port; }
        } catch {}
      }
      if (finished) return;
      socket = net.createConnection({ host: target, port: targetPort });
      socket.setNoDelay(true);
      socket.on('error', () => finish()); socket.on('close', () => finish());
      socket.on('connect', () => { socket.write(handshake(host, targetPort)); socket.write(packet(varInt(0))); });
      let buffered = Buffer.alloc(0), pingStart, nonce;
      socket.on('data', chunk => {
        try {
          if (buffered.length + chunk.length > MAX_PACKET + 5) throw new Error('Too much data');
          buffered = Buffer.concat([buffered, chunk]);
          while (!finished) {
            const header = readVarInt(buffered);
            if (!header) return;
            if (header.value < 1 || header.value > MAX_PACKET) throw new Error('Invalid length');
            if (buffered.length < header.bytes + header.value) return;
            const body = buffered.subarray(header.bytes, header.bytes + header.value);
            buffered = buffered.subarray(header.bytes + header.value);
            const id = readVarInt(body); if (!id) throw new Error('Invalid ID');
            if (!result && id.value === 0) {
              const length = readVarInt(body, id.bytes);
              if (!length || length.value !== body.length - id.bytes - length.bytes) throw new Error('Invalid JSON length');
              result = statusData(JSON.parse(body.subarray(id.bytes + length.bytes).toString('utf8')));
              nonce = crypto.randomBytes(8); pingStart = performance.now();
              socket.write(packet(Buffer.concat([varInt(1), nonce])));
              pongTimer = setTimeout(() => finish(result), Math.min(1000, timeout));
            } else if (result && id.value === 1 && body.length === id.bytes + 8 && body.subarray(id.bytes).equals(nonce)) {
              result.ping = Math.max(0, Math.round(performance.now() - pingStart)); finish(result);
            } else throw new Error('Unexpected packet');
          }
        } catch { finish(result); }
      });
    })().catch(() => finish());
  });
}
class ServerMonitor {
  constructor({ query, report, visible = () => true, interval = 45000, cacheMs = 15000 }) {
    Object.assign(this, { query, report, visible, interval, cacheMs });
  }
  refresh(force = false) {
    if (this.stopped) return Promise.resolve(this.value);
    if (this.pending) return this.pending;
    if (!force && this.value && Date.now() - this.value.checkedAt < this.cacheMs) return Promise.resolve(this.value);
    this.report({ kind: this.value?.kind || 'checking', checking: true, ...this.value });
    this.pending = Promise.resolve().then(this.query).catch(() => ({ kind: 'unknown', checkedAt: Date.now() })).then(value => {
      this.value = value; if (!this.stopped) this.report({ ...value, checking: false }); return value;
    }).finally(() => { this.pending = null; });
    return this.pending;
  }
  start() {
    this.stopped = false; this.refresh();
    clearInterval(this.timer);
    this.timer = setInterval(() => { if (this.visible()) this.refresh(); }, this.interval);
    this.timer.unref?.();
  }
  stop() { this.stopped = true; clearInterval(this.timer); }
}
module.exports = { queryServer, ServerMonitor, varInt, readVarInt, packet, handshake, statusData };
