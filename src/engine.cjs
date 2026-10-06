'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const AdmZip = require('adm-zip');
const runFile = promisify(execFile);

const MC = '1.21.1';
const NF = '21.1.253';
const VERSION = `neoforge-${NF}`;
const SERVER = 'hollowsmp.com.br:25565';
const MOD_HASH = '96dc57f223b83850a1684ebb8283e1e6aa5cfb89ae5226464de6d5fc85bb1f80';
const INSTALLER_HASH = '8e8a6889b6d7ddcae5f93c4f9c90035e14ea70cdc5b74147773265809c4f9137';

async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function readJson(file) { return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '')); }
async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.hollow-new`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temporary, file);
}
function under(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || /[\x00:]/.test(relative)) throw new Error('Caminho de arquivo inválido.');
  const full = path.resolve(root, relative.replaceAll('/', path.sep));
  const difference = path.relative(path.resolve(root), full);
  if (!difference || difference.startsWith(`..${path.sep}`) || difference === '..' || path.isAbsolute(difference)) {
    throw new Error('Caminho fora da pasta de instalação.');
  }
  return full;
}
async function hashFile(file, algorithm = 'sha1') {
  const hash = crypto.createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function offlineUuid(nickname) {
  const bytes = crypto.createHash('md5').update(`OfflinePlayer:${nickname}`).digest();
  bytes[6] = (bytes[6] & 15) | 48;
  bytes[8] = (bytes[8] & 63) | 128;
  return bytes.toString('hex');
}
function validateOptions(options) {
  if (!options || !['nickname', 'microsoft'].includes(options.mode)) throw new Error('Escolha uma conta válida.');
  if (!Number.isInteger(options.ram) || options.ram < 2 || options.ram > 24) throw new Error('Escolha de 2 a 24 GB de memória.');
  if (options.mode === 'nickname' && !/^[A-Za-z0-9_]{3,16}$/.test(options.nickname || '')) {
    throw new Error('Use um nickname de 3 a 16 letras, números ou _.');
  }
  return { mode: options.mode, ram: options.ram, nickname: String(options.nickname || '').slice(0, 16), remember: Boolean(options.remember) };
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
async function extract(zipPath, target, nativesOnly = false) {
  const zip = new AdmZip(zipPath);
  // Validate the whole archive before writing even the first file.
  const entries = zip.getEntries().filter(entry => !nativesOnly || /\.dll$/i.test(entry.entryName));
  for (const entry of entries) {
    under(target, entry.entryName);
    const mode = entry.header.attr >>> 16;
    if ((mode & 0xf000) === 0xa000) throw new Error('O arquivo ZIP contém um link não permitido.');
  }
  for (const entry of entries) {
    const destination = under(target, entry.entryName);
    if (entry.isDirectory) await fs.mkdir(destination, { recursive: true });
    else { await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(destination, entry.getData()); }
  }
}
async function copyTree(source, target) {
  await fs.mkdir(target, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Link não permitido na instalação.');
    const from = under(source, entry.name), to = under(target, entry.name);
    if (entry.isDirectory()) await copyTree(from, to);
    else if (!await exists(to) || await hashFile(from, 'sha256') !== await hashFile(to, 'sha256')) await fs.copyFile(from, to);
  }
}
async function workers(items, concurrency, operation) {
  let next = 0;
  let failure;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failure && next < items.length) {
      const index = next++;
      try { await operation(items[index], index); } catch (error) { failure ||= error; }
    }
  }));
  if (failure) throw failure;
}
function nbtServerList() {
  const string = text => { const bytes = Buffer.from(text); const length = Buffer.alloc(2); length.writeUInt16BE(bytes.length); return Buffer.concat([length, bytes]); };
  return Buffer.concat([Buffer.from([10]), string(''), Buffer.from([9]), string('servers'), Buffer.from([10, 0, 0, 0, 1, 8]), string('name'), string('Hollow SMP'), Buffer.from([8]), string('ip'), string(SERVER), Buffer.from([0, 0])]);
}

class Engine {
  constructor({ root, assets, report = () => {}, platform = process.platform } = {}) {
    this.root = path.resolve(root || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'HollowSMP'));
    this.game = path.join(this.root, 'game');
    this.java = path.join(this.root, 'runtime', 'bin', 'java.exe');
    this.assets = assets;
    this.report = report;
    this.platform = platform;
    this.gameProcess = null;
  }
  versionFile(version) { return path.join(this.game, 'versions', version, `${version}.json`); }
  async ready() {
    if (!await exists(path.join(this.root, 'ready.json')) || !await exists(this.java) || !await exists(this.versionFile(VERSION))) return false;
    try { return (await fs.readdir(path.join(this.game, 'mods'))).some(name => /^automodpack-.*\.jar$/.test(name)); } catch { return false; }
  }
  async loadSettings() {
    const defaults = { mode: 'nickname', nickname: 'Aventureiro', ram: 6, remember: true };
    try {
      const value = await readJson(path.join(this.root, 'launcher-settings.json'));
      // Understand preferences saved by the previous Windows Forms launcher.
      const mode = value.mode === 1 || value.mode === 'microsoft' ? 'microsoft' : 'nickname';
      const ram = Math.max(2, Math.min(24, Math.round(Number(value.ram) || 6)));
      return { mode, ram, nickname: String(value.nickname || '').slice(0, 16), remember: value.remember !== false };
    } catch { return defaults; }
  }
  async saveSettings(options) {
    const value = validateOptions(options);
    await writeJson(path.join(this.root, 'launcher-settings.json'), { ...value, nickname: value.remember ? value.nickname : '' });
  }
  async jsonFrom(url) {
    if (new URL(url).protocol !== 'https:') throw new Error('O download exige HTTPS.');
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Servidor de download respondeu ${response.status}. Tente novamente.`);
    if (new URL(response.url).protocol !== 'https:') throw new Error('Redirecionamento de download inválido.');
    return response.json();
  }
  async download(url, destination, expected, algorithm = 'sha1', onProgress) {
    if (new URL(url).protocol !== 'https:') throw new Error('O download exige HTTPS.');
    if (expected && await exists(destination) && await hashFile(destination, algorithm) === expected.toLowerCase()) return;
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const partial = `${destination}.partial`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(600000) });
        if (!response.ok || !response.body) throw new Error(`Falha no download (${response.status}).`);
        if (new URL(response.url).protocol !== 'https:') throw new Error('Redirecionamento de download inválido.');
        const total = Number(response.headers.get('content-length')) || 0;
        let received = 0, lastReport = 0;
        const meter = new Transform({ transform(chunk, encoding, callback) {
          received += chunk.length;
          if (onProgress && Date.now() - lastReport > 150) { lastReport = Date.now(); onProgress(received, total); }
          callback(null, chunk);
        } });
        await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(partial));
        if (expected && await hashFile(partial, algorithm) !== expected.toLowerCase()) throw new Error('O download não passou na verificação.');
        await fs.rename(partial, destination);
        if (onProgress) onProgress(received, total);
        return;
      } catch (error) {
        await fs.rm(partial, { force: true });
        if (attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
      }
    }
  }
  progress(text, done, total) {
    const now = Date.now();
    if (total > 0 && done < total && now - (this.lastProgress || 0) < 100) return;
    this.lastProgress = now;
    this.report({ text, percent: total > 0 ? Math.round(done / total * 100) : null });
  }
  async installJava() {
    if (await exists(this.java)) return;
    this.progress('Baixando Java 21…');
    const metadata = await this.jsonFrom('https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse');
    const archive = metadata[0]?.binary?.package;
    if (!archive?.link || !archive.checksum) throw new Error('Não encontrei o Java 21 para Windows.');
    const zip = path.join(this.root, 'downloads', 'java21.zip');
    await this.download(archive.link, zip, archive.checksum, 'sha256', (done, total) => this.progress('Baixando Java 21…', done, total));
    this.progress('Preparando Java 21…');
    const staging = path.join(this.root, 'runtime-extract');
    await extract(zip, staging);
    for (const entry of await fs.readdir(staging, { withFileTypes: true })) {
      const source = under(staging, entry.name);
      if (entry.isDirectory() && await exists(path.join(source, 'bin', 'java.exe'))) { await copyTree(source, path.join(this.root, 'runtime')); return; }
    }
    throw new Error('O Java baixado está incompleto.');
  }
  async libraries(version) {
    await workers((version.libraries || []).filter(library => allowed(library)), 6, async library => {
      const downloads = library.downloads || {};
      const artifact = downloads.artifact;
      if (artifact?.url) await this.download(artifact.url, under(path.join(this.game, 'libraries'), artifact.path), artifact.sha1);
      const classifier = library.natives?.windows?.replace('${arch}', '64');
      const native = downloads.classifiers?.[classifier];
      if (native?.url) await this.download(native.url, under(path.join(this.game, 'libraries'), native.path), native.sha1);
    });
  }
  async installer(jar) {
    const log = path.join(this.root, 'neoforge-install.log');
    await fs.writeFile(log, 'Hollow Launcher Electron\n');
    const output = createWriteStream(log, { flags: 'a' });
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(this.java, ['-jar', jar, '--installClient', this.game], { cwd: this.root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout.pipe(output, { end: false }); child.stderr.pipe(output, { end: false });
        child.once('error', reject);
        child.once('close', code => code === 0 ? resolve() : reject(new Error('O NeoForge não terminou a instalação. Consulte neoforge-install.log.')));
      });
    } finally { await new Promise(resolve => output.end(resolve)); }
    if (!await exists(this.versionFile(VERSION))) throw new Error('A instalação do NeoForge está incompleta.');
  }
  async install() {
    if (this.platform !== 'win32' || process.arch !== 'x64') throw new Error('Este launcher exige Windows de 64 bits.');
    await fs.mkdir(this.game, { recursive: true });
    await this.installJava();
    this.progress('Preparando Minecraft 1.21.1…');
    const manifest = await this.jsonFrom('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    const version = manifest.versions.find(item => item.id === MC);
    if (!version) throw new Error('Não encontrei a versão do Minecraft.');
    await this.download(version.url, this.versionFile(MC), version.sha1);
    const vanilla = await readJson(this.versionFile(MC));
    const client = vanilla.downloads.client;
    await this.download(client.url, path.join(this.game, 'versions', MC, `${MC}.jar`), client.sha1, 'sha1', (done, total) => this.progress('Baixando Minecraft 1.21.1…', done, total));
    this.progress('Preparando bibliotecas…'); await this.libraries(vanilla);
    if (!await exists(this.versionFile(VERSION))) {
      this.progress('Instalando NeoForge… Isso pode levar alguns minutos.');
      const jar = path.join(this.root, 'downloads', 'neoforge-installer.jar');
      await this.download(`https://maven.neoforged.net/releases/net/neoforged/neoforge/${NF}/neoforge-${NF}-installer.jar`, jar, INSTALLER_HASH, 'sha256');
      const profiles = path.join(this.game, 'launcher_profiles.json');
      if (!await exists(profiles)) await writeJson(profiles, { profiles: {} });
      await this.installer(jar);
    }
    await this.libraries(await readJson(this.versionFile(VERSION)));
    this.progress('Conferindo recursos do jogo…');
    const indexPath = under(path.join(this.game, 'assets', 'indexes'), `${vanilla.assetIndex.id}.json`);
    await this.download(vanilla.assetIndex.url, indexPath, vanilla.assetIndex.sha1);
    const objects = [...new Map(Object.values((await readJson(indexPath)).objects).map(item => [item.hash, item])).values()];
    let done = 0;
    await workers(objects, 12, async item => {
      const hash = item.hash;
      if (!/^[0-9a-f]{40}$/.test(hash)) throw new Error('Recurso inválido no manifesto.');
      await this.download(`https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`, under(path.join(this.game, 'assets', 'objects'), `${hash.slice(0, 2)}/${hash}`), hash);
      this.progress(`Recursos: ${++done} / ${objects.length}`, done, objects.length);
    });
    this.progress('Preparando Hollow SMP…');
    const mods = path.join(this.game, 'mods'); await fs.mkdir(mods, { recursive: true });
    if (!(await fs.readdir(mods)).some(name => /^automodpack-.*\.jar$/.test(name))) {
      const original = path.join(this.assets, 'automodpack-5.0.0-rc.2.jar');
      if (await hashFile(original, 'sha256') !== MOD_HASH) throw new Error('AutoModpack inválido.');
      await fs.copyFile(original, path.join(mods, path.basename(original)));
    }
    const servers = path.join(this.game, 'servers.dat');
    if (!await exists(servers)) await fs.writeFile(servers, nbtServerList());
    await writeJson(path.join(this.root, 'ready.json'), { minecraft: MC, neoforge: NF, launcher: 'electron', created: new Date().toISOString() });
    this.progress('Instalação concluída.', 1, 1);
  }
  async buildArguments(nickname, ram) {
    validateOptions({ mode: 'nickname', nickname, ram });
    const vanilla = await readJson(this.versionFile(MC)), neo = await readJson(this.versionFile(VERSION));
    const merged = new Map();
    for (const library of [...vanilla.libraries, ...neo.libraries]) {
      if (!allowed(library)) continue;
      const parts = library.name.split(':');
      merged.set(`${parts[0]}:${parts[1]}:${parts[3] || ''}`, library);
    }
    const libraries = path.join(this.game, 'libraries'), natives = path.join(this.game, 'natives');
    await fs.mkdir(natives, { recursive: true });
    const classpath = [];
    for (const library of merged.values()) {
      const artifact = library.downloads?.artifact;
      if (artifact) {
        const jar = under(libraries, artifact.path);
        if (!await exists(jar)) throw new Error(`Biblioteca ausente: ${path.basename(jar)}. Use Resetar para reparar.`);
        classpath.push(jar);
        if (library.name.includes(':natives-windows')) await extract(jar, natives, true);
      }
      const classifier = library.natives?.windows?.replace('${arch}', '64');
      const native = library.downloads?.classifiers?.[classifier];
      if (native) await extract(under(libraries, native.path), natives, true);
    }
    classpath.push(path.join(this.game, 'versions', MC, `${MC}.jar`));
    const replacements = {
      auth_player_name: nickname, version_name: VERSION, game_directory: this.game,
      assets_root: path.join(this.game, 'assets'), assets_index_name: vanilla.assetIndex.id,
      auth_uuid: offlineUuid(nickname), auth_access_token: '0', clientid: '', auth_xuid: '',
      user_type: 'legacy', version_type: 'release', natives_directory: natives,
      launcher_name: 'HollowSMP', launcher_version: '2.0.0', classpath: classpath.join(';'),
      library_directory: libraries, classpath_separator: ';', user_properties: '{}',
    };
    const expand = argument => String(argument).replace(/\$\{([^}]+)\}/g, (_, name) => {
      if (!(name in replacements)) throw new Error(`Argumento desconhecido: ${name}`);
      return replacements[name];
    });
    return [`-Xms1G`, `-Xmx${ram}G`, '-Dfile.encoding=UTF-8', ...[vanilla, neo].flatMap(version => argumentsOf(version, 'jvm').map(expand)),
      `-DignoreList=client-extra,${VERSION}.jar,${MC}.jar`, neo.mainClass,
      ...[vanilla, neo].flatMap(version => argumentsOf(version, 'game').map(expand))];
  }
  async launch(nickname, ram) {
    if (this.gameProcess && this.gameProcess.exitCode === null) throw new Error('O Minecraft já está aberto.');
    const argumentsList = await this.buildArguments(nickname, ram);
    const argumentFile = path.join(this.root, 'game-args.txt');
    await fs.writeFile(argumentFile, argumentsList.map(value => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`).join('\n'), 'utf8');
    const output = createWriteStream(path.join(this.root, 'game-launch.log'), { flags: 'w' });
    output.write(`Hollow Launcher Electron — ${new Date().toISOString()}\n`);
    const child = spawn(this.java, [`@${argumentFile}`], { cwd: this.game, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.gameProcess = child;
    child.stdout.pipe(output, { end: false }); child.stderr.pipe(output, { end: false });
    child.once('close', code => { output.end(`\nExit code: ${code}\n`); if (this.gameProcess === child) this.gameProcess = null; this.report({ text: code === 0 ? 'Minecraft fechado.' : 'O Minecraft encerrou. Confira game-launch.log.', gameRunning: false }); });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    return child.pid;
  }
  async javaRunning() {
    if (this.gameProcess && this.gameProcess.exitCode === null) return true;
    if (this.platform !== 'win32') return false;
    const { stdout } = await runFile('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 15000 });
    return /^"javaw?\.exe"/im.test(stdout);
  }
  async assertNoLinks(root) {
    let ancestor = path.resolve(root);
    while (true) {
      try { if ((await fs.lstat(ancestor)).isSymbolicLink()) throw new Error('Reset bloqueado: a instalação contém um link.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const parent = path.dirname(ancestor); if (parent === ancestor) break; ancestor = parent;
    }
    async function inspect(directory) {
      for (const entry of await fs.readdir(directory)) {
        const full = under(directory, entry), stat = await fs.lstat(full);
        if (stat.isSymbolicLink()) throw new Error('Reset bloqueado: a instalação contém um link.');
        if (stat.isDirectory()) await inspect(full);
      }
    }
    if (await exists(root)) await inspect(root);
  }
  async reset() {
    const protectedRoots = [path.parse(this.root).root, os.homedir(), process.env.LOCALAPPDATA, process.env.APPDATA].filter(Boolean).map(value => path.resolve(value).toLowerCase());
    if (protectedRoots.includes(this.root.toLowerCase()) || path.basename(this.root).toLowerCase() !== 'hollowsmp') throw new Error('Pasta de reset inválida.');
    if (await this.javaRunning()) throw new Error('Feche o Minecraft e outros programas Java antes de resetar.');
    await this.assertNoLinks(this.root);
    if (!await exists(this.root)) return;
    // Preflight all files with exclusive Windows handles before any deletion.
    const script = "$ErrorActionPreference='Stop'; $root=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + Buffer.from(this.root).toString('base64') + "')); Get-ChildItem -LiteralPath $root -File -Recurse -Force | ForEach-Object { $stream=[IO.File]::Open($_.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None); $stream.Dispose() }";
    if (this.platform === 'win32') {
      try { await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 120000 }); }
      catch { throw new Error('Não foi possível acessar todos os arquivos. Feche o Minecraft e tente novamente.'); }
    }
    await this.assertNoLinks(this.root);
    async function remove(directory) {
      for (const entry of await fs.readdir(directory)) {
        const full = under(directory, entry), stat = await fs.lstat(full);
        if (stat.isSymbolicLink()) throw new Error('Reset bloqueado: link na instalação.');
        if (stat.isDirectory()) await remove(full);
        else { await fs.chmod(full, 0o666); await fs.unlink(full); }
      }
      await fs.rmdir(directory);
    }
    await remove(this.root);
  }
  async registerOfficial(ram, testHome) {
    validateOptions({ mode: 'microsoft', ram });
    if (!testHome) {
      const { stdout } = await runFile('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true });
      if (/^"MinecraftLauncher\.exe"/im.test(stdout)) throw new Error('Feche o Minecraft Launcher antes de preparar o perfil Hollow.');
    }
    const home = testHome || path.join(process.env.APPDATA, '.minecraft');
    const files = [];
    for (const name of ['launcher_profiles.json', 'launcher_profiles_microsoft_store.json']) if (await exists(path.join(home, name))) files.push(path.join(home, name));
    if (!files.length) throw new Error('Abra o Minecraft Launcher oficial, faça login uma vez e feche-o. Depois tente novamente.');
    await copyTree(path.join(this.game, 'libraries'), path.join(home, 'libraries'));
    await copyTree(path.join(this.game, 'versions'), path.join(home, 'versions'));
    for (const file of files) {
      const value = await readJson(file); value.profiles ||= {};
      value.profiles['hollow-smp'] = { name: 'Hollow SMP', type: 'custom', created: new Date().toISOString(), lastVersionId: VERSION, gameDir: this.game, javaDir: this.java, javaArgs: `-Xmx${ram}G -Xms1G -Dfile.encoding=UTF-8`, icon: 'Grass' };
      if (!await exists(`${file}.before-hollow.bak`)) await fs.copyFile(file, `${file}.before-hollow.bak`);
      await writeJson(file, value);
    }
  }
  async officialLocation() {
    for (const folder of [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean)) {
      const exe = path.join(folder, 'Minecraft Launcher', 'MinecraftLauncher.exe');
      if (await exists(exe)) return exe;
    }
    const store = path.join(process.env.LOCALAPPDATA, 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe');
    if (await exists(store)) return 'shell:AppsFolder\\Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft';
    throw new Error('Instale o Minecraft Launcher oficial e faça login antes de usar Microsoft.');
  }
}

module.exports = { Engine, MC, NF, VERSION, MOD_HASH, SERVER, exists, readJson, writeJson, under, hashFile, offlineUuid, validateOptions, allowed, argumentsOf, extract, workers, nbtServerList };
