'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { DiscordPresence, frame } = require('../src/discord-presence.cjs');
const applicationId = '123456789012345678';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  const end = Date.now() + 2000;
  while (!predicate()) { if (Date.now() > end) throw new Error('Timeout'); await wait(5); }
}
async function fixture(accept, action) {
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => sockets.delete(socket));
    let buffered = Buffer.alloc(0);
    socket.on('data', chunk => {
      buffered = Buffer.concat([buffered, chunk]);
      while (buffered.length >= 8 && buffered.length >= 8 + buffered.readUInt32LE(4)) {
        const opcode = buffered.readUInt32LE(0), size = buffered.readUInt32LE(4);
        const bytes = buffered.subarray(8, 8 + size); buffered = buffered.subarray(8 + size);
        accept(socket, opcode, bytes);
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const presence = new DiscordPresence({ applicationId, pid: 42, pipes: ['test'],
    connect: () => net.createConnection(server.address().port, '127.0.0.1'), timeout: 100, retryDelay: 30 });
  try { await action(presence); }
  finally { await presence.stop(); for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
}
function ready(socket) { socket.write(frame(1, { cmd: 'DISPATCH', evt: 'READY', data: { user: { id: 'not-exposed' } } })); }
function acknowledge(socket, message) { socket.write(frame(1, { cmd: 'SET_ACTIVITY', nonce: message.nonce, data: {} })); }

test('presença fixa aguarda READY fragmentado, não envia detalhes e limpa ao fechar', async () => {
  const messages = [];
  await fixture((socket, opcode, bytes) => {
    const message = JSON.parse(bytes); messages.push({ opcode, message });
    if (opcode === 0) {
      assert.deepEqual(message, { v: 1, client_id: applicationId });
      const response = frame(1, { cmd: 'DISPATCH', evt: 'READY', data: {} });
      socket.write(response.subarray(0, 3)); setTimeout(() => { if (!socket.destroyed) socket.write(response.subarray(3)); }, 10);
    } else acknowledge(socket, message);
  }, async presence => {
    presence.start(); await until(() => presence.status === 'active');
    assert.deepEqual(messages[1].message.args, { pid: 42, activity: { type: 0 } });
    await wait(70); assert.equal(messages.length, 2);
    await presence.stop(); await until(() => messages.length === 3);
    assert.equal(messages[2].message.args.activity, null);
    assert.equal(presence.retry, null); assert.equal(presence.socket, null);
  });
});
test('heartbeat devolve bytes sem JSON e reconecta depois do Discord fechar', async () => {
  let connections = 0, pong = false;
  await fixture((socket, opcode, bytes) => {
    if (opcode === 0) { connections++; ready(socket); }
    else if (opcode === 4) { assert.deepEqual(bytes, Buffer.from([0, 255, 31])); pong = true; socket.destroy(); }
    else {
      const message = JSON.parse(bytes); acknowledge(socket, message);
      if (message.args.activity && connections === 1) socket.write(frame(3, Buffer.from([0, 255, 31])));
    }
  }, async presence => {
    presence.start(); await until(() => pong && connections === 2 && presence.status === 'active');
  });
});
test('Discord iniciado depois é descoberto, sem bloquear ou lançar erro', async () => {
  await fixture((socket, opcode, bytes) => { if (opcode === 0) ready(socket); else acknowledge(socket, JSON.parse(bytes)); }, async presence => {
    const original = presence.connect; let attempts = 0;
    presence.connect = name => { if (++attempts === 1) throw new Error('Discord fechado'); return original(name); };
    presence.start(); assert.equal(presence.status, 'waiting');
    await until(() => presence.status === 'active'); assert.equal(attempts, 2);
  });
});
test('ID ausente ou inválido não abre IPC; stop cancela novas tentativas', async () => {
  for (const applicationId of ['', 'abc', '123', '00000000000000000']) {
    const presence = new DiscordPresence({ applicationId, connect: () => { throw new Error('Não deve conectar'); } });
    presence.start(); assert.equal(presence.status, 'disabled'); await presence.stop();
  }
  let attempts = 0;
  const presence = new DiscordPresence({ applicationId, retryDelay: 10, pipes: ['test'], connect: () => { attempts++; throw new Error('Offline'); } });
  presence.start(); await presence.stop(); await wait(40); assert.equal(attempts, 1);
});
test('erro de atividade e frames excessivos abortam sem marcar presença ativa', async () => {
  for (const oversized of [false, true]) {
    await fixture((socket, opcode) => {
      if (opcode === 0 && oversized) { const header = Buffer.alloc(8); header.writeUInt32LE(1); header.writeUInt32LE(70000, 4); socket.write(header); }
      else if (opcode === 0) ready(socket);
      else socket.write(frame(1, { evt: 'ERROR', data: { code: 4000 } }));
    }, async presence => {
      presence.retryDelay = 10000;
      presence.start(); await until(() => presence.status === 'waiting');
      assert.notEqual(presence.status, 'active');
    });
  }
});
