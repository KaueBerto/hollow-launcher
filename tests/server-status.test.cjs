'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { queryServer, ServerMonitor, varInt, readVarInt, packet } = require('../src/server-status.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fixture(accept, action) {
  const sockets = new Set();
  const server = net.createServer(socket => { sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => sockets.delete(socket)); accept(socket); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await action(server.address().port); }
  finally { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
}
function fakeServer(socket, { pong = true } = {}) {
  let buffered = Buffer.alloc(0), packets = 0;
  socket.on('data', data => {
    buffered = Buffer.concat([buffered, data]);
    while (true) {
      const length = readVarInt(buffered); if (!length || buffered.length < length.bytes + length.value) break;
      const body = buffered.subarray(length.bytes, length.bytes + length.value); buffered = buffered.subarray(length.bytes + length.value);
      if (++packets === 1) continue;
      if (body[0] === 0) {
        const json = Buffer.from(JSON.stringify({ version: { name: '1.21.1', protocol: 767 }, players: { online: 3, max: 100 }, description: { text: '<script>never exposed</script>' } }));
        const response = packet(Buffer.concat([varInt(0), varInt(json.length), json]));
        // Fragment frame headers and JSON across multiple network reads.
        socket.write(response.subarray(0, 1)); setTimeout(() => { if (!socket.destroyed) socket.write(response.subarray(1, 9)); }, 5); setTimeout(() => { if (!socket.destroyed) socket.write(response.subarray(9)); }, 10);
      } else if (body[0] === 1 && pong) setTimeout(() => { if (!socket.destroyed) socket.write(packet(body)); }, 15);
    }
  });
}
test('consulta Java aceita pacotes fragmentados e mede pong sem expor MOTD', async () => fixture(fakeServer, async port => {
  const result = await queryServer({ host: '127.0.0.1', port, useSrv: false });
  assert.equal(result.kind, 'online'); assert.equal(result.players, 3); assert.equal(result.maxPlayers, 100);
  assert.ok(result.ping >= 10); assert.ok(result.ping < 1000); assert.ok(result.checkedAt > 0);
  assert.equal('description' in result, false);
}));
test('servidor com status mas sem pong continua online com ping desconhecido', async () => fixture(socket => fakeServer(socket, { pong: false }), async port => {
  const result = await queryServer({ host: '127.0.0.1', port, timeout: 100, useSrv: false });
  assert.equal(result.kind, 'online'); assert.equal(result.ping, null);
}));
test('timeout e dados inválidos não inventam estado offline ou contagens', async () => {
  await fixture(() => {}, async port => {
    const result = await queryServer({ host: '127.0.0.1', port, timeout: 40, useSrv: false }); assert.equal(result.kind, 'unknown');
  });
  await fixture(socket => socket.once('data', () => socket.write(Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]))), async port => {
    const result = await queryServer({ host: '127.0.0.1', port, useSrv: false }); assert.equal(result.kind, 'unknown'); assert.equal(result.players, null);
  });
});
test('SRV usa o endereço de conexão e mantém o nome original no handshake', async () => fixture(socket => {
  socket.once('data', body => assert.ok(body.includes(Buffer.from('hollow.test')))); fakeServer(socket);
}, async port => {
  const result = await queryServer({ host: 'hollow.test', resolver: async domain => {
    assert.equal(domain, '_minecraft._tcp.hollow.test'); return [{ name: '127.0.0.1', port, priority: 0, weight: 0 }];
  } });
  assert.equal(result.kind, 'online');
}));
test('monitor reutiliza consulta em andamento/cache e deixa de publicar após encerrar', async () => {
  let calls = 0, complete;
  const reports = [];
  const monitor = new ServerMonitor({ query: () => { calls++; return new Promise(resolve => complete = resolve); }, report: value => reports.push(value), cacheMs: 1000 });
  const first = monitor.refresh(), second = monitor.refresh(); assert.equal(first, second);
  await wait(0); assert.equal(calls, 1); complete({ kind: 'online', checkedAt: Date.now() }); await first;
  await monitor.refresh(); assert.equal(calls, 1);
  const pending = monitor.refresh(true); await wait(0); assert.equal(calls, 2); const count = reports.length;
  monitor.stop(); complete({ kind: 'online', checkedAt: Date.now() }); await pending; assert.equal(reports.length, count);
});
test('monitor não consulta periodicamente quando launcher está escondido', async () => {
  let calls = 0;
  const monitor = new ServerMonitor({ query: async () => ({ kind: 'online', checkedAt: Date.now(), players: ++calls }), report: () => {}, visible: () => false, interval: 15, cacheMs: 0 });
  monitor.start(); await wait(60); monitor.stop(); assert.equal(calls, 1);
});
