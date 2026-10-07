'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { SERVER, MC } = require('./engine.cjs');

function serverList(buffer) {
  if (buffer[0] === 31 && buffer[1] === 139) buffer = gunzipSync(buffer, { maxOutputLength: 8 * 1024 * 1024 });
  let offset = 0;
  const take = n => { if (n < 0 || offset + n > buffer.length) throw Error('Cadastro de servidores inválido.'); const b = buffer.subarray(offset, offset += n); return b; };
  const byte = () => take(1)[0];
  const integer = () => take(4).readInt32BE();
  const string = () => take(take(2).readUInt16BE()).toString('utf8');
  function value(type, depth = 0) {
    if (depth > 32) throw Error('Cadastro de servidores inválido.');
    if (type === 1) return take(1).readInt8();
    if (type === 8) return string();
    if (type === 10) { const result = Object.create(null); let t; while ((t = byte()) !== 0) { const name = string(); result[name] = value(t, depth + 1); } return result; }
    if (type === 9) { const t = byte(), count = integer(); if (count < 0 || count > 100000) throw Error('Lista inválida.'); return Array.from({length: count}, () => value(t, depth + 1)); }
    const sizes = {1:1,2:2,3:4,4:8,5:4,6:8};
    if (sizes[type]) { take(sizes[type]); return null; }
    if ([7,11,12].includes(type)) { const n = integer(); if (n < 0) throw Error('Lista inválida.'); take(n * ({7:1,11:4,12:8}[type])); return null; }
    throw Error('Tag NBT inválida.');
  }
  if (byte() !== 10) throw Error('Cadastro de servidores inválido.');
  string(); return value(10).servers || [];
}
const clean = text => text.replace(/[\\/:*?"<>|]/g, '');
// Same PercentEscaper("", true) naming used by Distant Horizons 3.3.3.
const escape = text => encodeURIComponent(text).replace(/[!'()*~]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%20/g, '+');
function folderName(server, mode = 'NAME_ONLY') {
  const [host, port = ''] = server.ip.split(':');
  const name = clean(server.name), ip = clean(host), suffix = port ? '-' + clean(port) : '';
  const names = { NAME_ONLY:name, IP_ONLY:ip, NAME_IP:`${name}, IP ${ip}`, NAME_IP_PORT:`${name}, IP ${ip}${suffix}`, NAME_IP_PORT_MC_VERSION:`${name}, IP ${ip}${suffix}, GameVersion ${MC}` };
  if (!(mode in names)) throw Error('Modo de pasta do Distant Horizons desconhecido.');
  const folder = escape(names[mode]);
  if (!folder || ['.', '..'].includes(folder)) throw Error('Nome de servidor inválido.');
  return folder;
}
async function landscapeDirectory(game, level) {
  const normalize = ip => ip.toLowerCase().replace(/:25565$/, '');
  let servers;
  try { servers = serverList(await fs.readFile(path.join(game, 'servers.dat'))); }
  catch (e) { if (e.code !== 'ENOENT') throw e; servers = [{ name:'Hollow SMP', ip:SERVER }]; }
  const matching = servers.filter(s => typeof s.ip === 'string' && normalize(s.ip) === normalize(SERVER) && s.hidden !== 1);
  if (!matching.length) throw Error('Cadastre hollowsmp.com.br na lista de servidores antes de baixar a paisagem.');
  let config = '';
  try { config = await fs.readFile(path.join(game, 'config', 'DistantHorizons.toml'), 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const mode = /^\s*serverFolderNameMode\s*=\s*"([A-Z_]+)"/m.exec(config)?.[1] || 'NAME_ONLY';
  const folders = [...new Set(matching.map(s => folderName(s, mode)))];
  if (folders.length !== 1) throw Error('Há mais de um cadastro do Hollow SMP com nomes diferentes. Mantenha um cadastro para instalar a paisagem.');
  return path.join(folders[0], level);
}
module.exports = { serverList, folderName, landscapeDirectory };
