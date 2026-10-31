'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { serverList } = require('./landscape-folder.cjs');

const SERVER = 'hollowsmp.com.br';
const validDirectory = value => typeof value === 'string' && /^hollowsmp\.com\.br(?:_25565)?$/i.test(value);

async function voxyDirectory(game, { preferredDirectory, selectedDirectory } = {}) {
  let servers = [];
  try { servers = serverList(await fs.readFile(path.join(game, 'servers.dat'))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  // FancyMenu connects to the bare hostname. Voxy 1.0.0 uses ServerData.ip verbatim,
  // replacing ':' with '_', under game/.voxy/saves (verified in VoxyClientInstance).
  const addresses = [{ name: 'AveronSMP (menu)', ip: SERVER }, ...servers.filter(server =>
    typeof server.ip === 'string' && /^hollowsmp\.com\.br(?::25565)?$/i.test(server.ip) && server.hidden !== 1)];
  const choices = [...new Map(addresses.map(server => {
    const directory = server.ip.replaceAll(':', '_');
    return [directory.toLowerCase(), { directory, address: server.ip, name: String(server.name || 'AveronSMP') }];
  })).values()];
  const choose = message => Object.assign(Error(message), { code: 'LANDSCAPE_SELECTION_REQUIRED', choices });
  if (selectedDirectory !== undefined) {
    const choice = choices.find(item => item.directory === selectedDirectory);
    if (!choice) throw choose('Escolha novamente o endereço usado para entrar no AVERON.');
    return choice.directory;
  }
  const previous = choices.find(item => item.directory === preferredDirectory);
  if (previous) return previous.directory;
  if (choices.length === 1) return choices[0].directory;
  throw choose('O Voxy usa uma pasta para cada endereço. Escolha como você entra no servidor.');
}

module.exports = { SERVER, validDirectory, voxyDirectory };
