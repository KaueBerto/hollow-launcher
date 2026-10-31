'use strict';
const os = require('node:os');
const crypto = require('node:crypto');
const { memoryLimits } = require('./memory.cjs');

const MC = '1.21.1';
const NF = '21.1.253';
const VERSION = `neoforge-${NF}`;
const SERVER = 'hollowsmp.com.br:25565';
function offlineUuid(nickname) {
  const bytes = crypto.createHash('md5').update(`OfflinePlayer:${nickname}`).digest();
  bytes[6] = (bytes[6] & 15) | 48;
  bytes[8] = (bytes[8] & 63) | 128;
  return bytes.toString('hex');
}
function validateOptions(options, { requireNickname = true, memory = memoryLimits() } = {}) {
  if (!options || !['nickname', 'microsoft'].includes(options.mode)) throw new Error('Escolha uma conta válida.');
  if (!memory.supported) throw new Error('O computador precisa ter pelo menos 4 GB de RAM para reservar memória para o Minecraft e o Windows.');
  if (!Number.isInteger(options.ram) || options.ram < memory.minimumGB || options.ram > memory.maximumGB) {
    throw new Error(`Escolha de ${memory.minimumGB} a ${memory.maximumGB} GB de memória para este computador (${memory.totalGB} GB de RAM).`);
  }
  if (requireNickname && options.mode === 'nickname' && !/^[A-Za-z0-9_]{3,16}$/.test(options.nickname || '')) {
    throw new Error('Use um nickname de 3 a 16 letras, números ou _.');
  }
  return { mode: options.mode, ram: options.ram, nickname: String(options.nickname || '').slice(0, 16), remember: Boolean(options.remember), landscape: options.landscape === true };
}
function allowed(node, systemVersion = os.release()) {
  if (!node.rules) return true;
  let allow = false;
  for (const rule of node.rules) {
    const system = rule.os || {};
    let match = (!system.name || system.name === 'windows') && (!system.arch || ['x86_64', 'amd64'].includes(system.arch));
    if (system.version && !new RegExp(system.version).test(systemVersion)) match = false;
    if (Object.values(rule.features || {}).some(Boolean)) match = false;
    if (match) allow = rule.action === 'allow';
  }
  return allow;
}
function argumentsOf(version, type) {
  return (version.arguments?.[type] || []).flatMap(item => {
    if (typeof item === 'string') return [item];
    if (!allowed(item)) return [];
    return Array.isArray(item.value) ? item.value : [item.value];
  });
}
function nbtServerList() {
  const string = text => { const bytes = Buffer.from(text); const length = Buffer.alloc(2); length.writeUInt16BE(bytes.length); return Buffer.concat([length, bytes]); };
  return Buffer.concat([Buffer.from([10]), string(''), Buffer.from([9]), string('servers'), Buffer.from([10, 0, 0, 0, 1, 8]), string('name'), string('Hollow SMP'), Buffer.from([8]), string('ip'), string(SERVER), Buffer.from([0, 0])]);
}


module.exports = { MC, NF, VERSION, SERVER, offlineUuid, validateOptions, allowed, argumentsOf, nbtServerList };
