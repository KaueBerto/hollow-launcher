'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { constants } = require('node:fs');

async function noLinks(root, destination) {
  const relative = path.relative(root, destination);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Caminho do menu inválido.');
  let current = root;
  for (const part of ['', ...relative.split(path.sep)]) {
    current = part ? path.join(current, part) : current;
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw Error('Link na instalação do menu.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
function validateManifest(manifest) {
  if (manifest?.schema !== 1 || manifest.minecraft !== '1.21.1' || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 100) throw Error('Manifesto do menu inválido.');
  const names = new Set();
  for (const item of manifest.files) {
    if (typeof item.path !== 'string' || item.path.includes('\\') || item.path.split('/').some(p => !p || p === '.' || p === '..') || names.has(item.path.toLowerCase())) throw Error('Caminho do menu inválido.');
    names.add(item.path.toLowerCase());
    if (!/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.size) || item.size <= 0 || item.size > 300 * 1024 * 1024) throw Error('Hash ou tamanho do menu inválido.');
    const mod = item.kind === 'mod' && /^mods\/[A-Za-z0-9_.+-]+\.jar$/.test(item.path) && /^[a-z0-9_-]+$/.test(item.modId) && /^[A-Za-z0-9_-]+$/.test(item.prefix);
    const preset = item.kind === 'default' && /^config\/(fancymenu|drippyloadingscreen)\/[A-Za-z0-9_./ -]+$/.test(item.path);
    const pack = item.kind === 'resource-pack' && /^resourcepacks\/[A-Za-z0-9_.+-]+\.zip$/.test(item.path);
    if (!mod && !preset && !pack) throw Error('Arquivo de menu não permitido.');
    const expected = pack ? `https://painel.hollowsmp.com.br/hollow-packs/${path.posix.basename(item.path)}` : `https://painel.hollowsmp.com.br/hollow-packs/launcher-menu/${item.sha256}${path.posix.extname(item.path)}`;
    if (item.url !== expected) throw Error('Origem do menu inválida.');
  }
  if (manifest.enabledResourcePacks !== undefined && (!Array.isArray(manifest.enabledResourcePacks) || manifest.enabledResourcePacks.some(id => !manifest.files.some(f => f.kind === 'resource-pack' && id === `file/${path.posix.basename(f.path)}`)))) throw Error('Seleção de texturas inválida.');
}
async function activateResourcePacks(engine, ids, previous) {
  const activated = new Set(previous || []);
  const pending = ids.filter(id => !activated.has(id));
  if (!pending.length) return [...activated];
  const options = path.join(engine.game, 'options.txt');
  await noLinks(engine.root, options);
  let original = '';
  try { original = await fs.readFile(options, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const matches = [...original.matchAll(/^resourcePacks:([^\r\n]*)/gm)];
  if (matches.length > 1) throw Error('Há seleções de resource packs duplicadas em options.txt. O arquivo foi preservado.');
  let selected = ['vanilla', 'mod_resources'];
  if (matches.length) {
    try { selected = JSON.parse(matches[0][1]); } catch { throw Error('A seleção de resource packs em options.txt é inválida. As configurações foram preservadas.'); }
    if (!Array.isArray(selected) || selected.some(id => typeof id !== 'string')) throw Error('A seleção de resource packs é inválida.');
  }
  for (const id of pending) if (!selected.includes(id)) selected.push(id);
  const line = 'resourcePacks:' + JSON.stringify(selected);
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const updated = matches.length ? original.replace(/^resourcePacks:[^\r\n]*/m, line) : original + (original && !original.endsWith('\n') ? newline : '') + line + newline;
  if (updated !== original) {
    // Back up once for this activation, then atomically replace only the pack selection.
    const backup = path.join(engine.root, 'options-before-menu-resourcepack.txt');
    await noLinks(engine.root, backup);
    try { await fs.writeFile(backup, original, { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const temporary = options + '.menu-pending';
    await noLinks(engine.root, temporary);
    await fs.mkdir(path.dirname(options), { recursive: true });
    await fs.writeFile(temporary, updated);
    const current = await fs.readFile(options, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
    if (current !== original) { await fs.unlink(temporary); throw Error('As opções do jogo mudaram durante a preparação. Tente novamente.'); }
    await fs.rename(temporary, options);
  }
  for (const id of pending) activated.add(id);
  return [...activated];
}
async function prepareMenu(engine, { manifest } = {}) {
  const { hashFile } = require('./engine.cjs');
  manifest ||= JSON.parse(await fs.readFile(path.join(engine.assets, 'menu-bootstrap-manifest.json'), 'utf8'));
  validateManifest(manifest);
  if (typeof engine.javaRunning === 'function' && await engine.javaRunning()) throw Error('Feche o Minecraft antes de preparar o menu.');
  const receiptPath = path.join(engine.root, 'menu-defaults-installed.json');
  await noLinks(engine.root, receiptPath);
  let previous = {};
  try { previous = JSON.parse(await fs.readFile(receiptPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const saveReceipt = async value => {
    const temporary = receiptPath + '.pending';
    await noLinks(engine.root, temporary);
    await fs.mkdir(engine.root, { recursive: true });
    await fs.writeFile(temporary, JSON.stringify(value, null, 2));
    await fs.rename(temporary, receiptPath);
  };
  const owned = { ...previous.ownedMods };
  const activatedBefore = Array.isArray(previous.activatedResourcePacks) ? previous.activatedResourcePacks : [];
  let downloaded = 0, installed = 0;
  for (const item of manifest.files) {
    const destination = path.join(engine.game, ...item.path.split('/'));
    await noLinks(engine.root, destination);
    if (item.kind === 'mod') {
      const active = path.join(engine.game, 'automodpack/client/active/mods');
      await noLinks(engine.root, active);
      let activeMods = [];
      try { activeMods = await fs.readdir(active); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const candidates = activeMods.filter(n => n.startsWith(item.prefix) && n.endsWith('.jar'));
      if (candidates.length) {
        // AutoModpack owns its projection. Only retire the exact root JAR we installed.
        {
          try {
            const hash = await hashFile(destination, 'sha256');
            if (hash === owned[item.path] || hash === item.sha256) await fs.unlink(destination);
            else throw Error('Mod do menu alterado; preserve-o e resolva a cópia duplicada antes de jogar.');
          } catch (error) { if (error.code !== 'ENOENT') throw error; }
          delete owned[item.path];
        }
        continue;
      }
      await fs.mkdir(path.dirname(destination), { recursive: true });
      const other = (await fs.readdir(path.dirname(destination))).filter(n => n.startsWith(item.prefix) && n.endsWith('.jar'));
      if (other.some(n => n !== path.basename(destination))) throw Error(`Existe outra versão de ${item.modId} na pasta mods. Resolva a duplicação antes de jogar.`);
      try {
        if (await hashFile(destination, 'sha256') !== item.sha256) throw Error(`O arquivo de ${item.modId} difere do menu padrão. Ele foi preservado; confira a instalação.`);
        continue;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    } else if (item.kind === 'resource-pack') {
      try {
        if (await hashFile(destination, 'sha256') !== item.sha256) throw Error('O resource pack local difere do padrão. O arquivo foi preservado; confira a instalação.');
        continue;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    } else {
      try { await fs.access(destination); continue; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const cached = path.join(engine.root, 'downloads/menu', item.sha256 + path.extname(item.path));
    await noLinks(engine.root, cached);
    await noLinks(engine.root, cached + '.partial');
    engine.progress(`Preparando menu AVERON: ${path.basename(item.path)}…`);
    await engine.download(item.url, cached, item.sha256, 'sha256', (done, total) => engine.progress('Baixando menu AVERON e dependências…', done, total));
    if (await hashFile(cached, 'sha256') !== item.sha256 || (await fs.stat(cached)).size !== item.size) throw Error('Download do menu inválido. O jogo não foi aberto.');
    downloaded++;
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await noLinks(engine.root, destination);
    try { await fs.copyFile(cached, destination, constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== 'EEXIST') throw error; else continue; }
    installed++;
    if (item.kind === 'mod') owned[item.path] = item.sha256;
    // Persist ownership after each JAR, so an interrupted first installation can resume safely.
    await saveReceipt({ id: manifest.id, ownedMods: owned, fmlConfigured: previous.fmlConfigured === true, activatedResourcePacks: activatedBefore });
  }
  if (!previous.fmlConfigured) {
    const fml = path.join(engine.game, 'config/fml.toml');
    await noLinks(engine.root, fml);
    let text = '';
    try { text = await fs.readFile(fml, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const provider = /^earlyWindowProvider\s*=\s*"([^"]*)"/m.exec(text);
    if (!provider) text = 'earlyWindowProvider = "drippy_early_window"\n' + text;
    else if (provider[1] === 'fmlearlywindow') text = text.replace(/^earlyWindowProvider[^\r\n]*/m, 'earlyWindowProvider = "drippy_early_window"');
    await fs.mkdir(path.dirname(fml), { recursive: true });
    await fs.writeFile(fml, text);
  }
  const activatedResourcePacks = await activateResourcePacks(engine, manifest.enabledResourcePacks || [], activatedBefore);
  await saveReceipt({ id: manifest.id, ownedMods: owned, fmlConfigured: true, activatedResourcePacks });
  return { downloaded, installed };
}
module.exports = { prepareMenu, validateManifest };
