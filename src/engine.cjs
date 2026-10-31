'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const runFile = promisify(execFile);
const { alive, relevantJavaPids } = require('./game-process.cjs');

const { MC, NF, VERSION, SERVER, offlineUuid, validateOptions, allowed, argumentsOf, nbtServerList } = require('./core/minecraft.cjs');
const { exists, readJson, writeJson, under, hashFile, extract, copyTree } = require('./core/files.cjs');
const { workers } = require('./core/workers.cjs');
const { buildArguments, launch } = require('./game-launch.cjs');
const { jsonFrom, download } = require('./downloads.cjs');
const { installJava, libraries, installer, install } = require('./game-installation.cjs');
const { syncReady, SYNC_HASH: MOD_HASH } = require('./modpack-sync.cjs');
const { memoryLimits, clampRam } = require('./core/memory.cjs');

class Engine {
  constructor({ root, assets, report = () => {}, platform = process.platform, totalMemory } = {}) {
    this.root = path.resolve(root || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'HollowSMP'));
    this.game = path.join(this.root, 'game');
    this.java = path.join(this.root, 'runtime', 'bin', 'java.exe');
    this.assets = assets;
    this.report = report;
    this.platform = platform;
    this.gameProcess = null;
    this.memory = memoryLimits(totalMemory);
  }
  versionFile(version) { return path.join(this.game, 'versions', version, `${version}.json`); }
  async ready() {
    if (!await exists(path.join(this.root, 'ready.json')) || !await exists(this.java) || !await exists(this.versionFile(VERSION))) return false;
    return syncReady(this);
  }
  async loadSettings() {
    const defaults = { mode: 'nickname', nickname: 'Aventureiro', ram: this.memory.recommendedGB, remember: true, landscape: false };
    try {
      const value = await readJson(path.join(this.root, 'launcher-settings.json'));
      // Understand preferences saved by the previous Windows Forms launcher.
      const mode = value.mode === 1 || value.mode === 'microsoft' ? 'microsoft' : 'nickname';
      const ram = clampRam(value.ram, this.memory);
      return { mode, ram, nickname: String(value.nickname || '').slice(0, 16), remember: value.remember !== false, landscape: value.landscape === true };
    } catch { return defaults; }
  }
  async saveSettings(options, validation) {
    const value = this.validateOptions(options, validation);
    await writeJson(path.join(this.root, 'launcher-settings.json'), { ...value, nickname: value.remember ? value.nickname : '' });
  }
  validateOptions(options, validation) { return validateOptions(options, { ...validation, memory: this.memory }); }
  async jsonFrom(url) { return jsonFrom(this, url); }
  async download(url, destination, expected, algorithm = 'sha1', onProgress) { return download(this, url, destination, expected, algorithm, onProgress); }
  progress(text, done, total) {
    const now = Date.now();
    if (total > 0 && done < total && now - (this.lastProgress || 0) < 100) return;
    this.lastProgress = now;
    this.report({ text, percent: total > 0 ? Math.round(done / total * 100) : null });
  }
  async installJava() { return installJava(this); }
  async libraries(version) { return libraries(this, version); }
  async installer(jar) { return installer(this, jar); }
  async install() { return install(this); }
  async buildArguments(nickname, ram, account) { return buildArguments(this, nickname, ram, account); }
  async launch(nickname, ram, account) { return launch(this, nickname, ram, account); }
  async javaRunning() {
    if (alive(this.gameProcess)) return true;
    return (await this.hollowGamePids()).length > 0;
  }
  async hollowGamePids() {
    if (this.platform !== 'win32') return [];
    const encodedRoot = Buffer.from(this.game).toString('base64');
    const encodedJava = Buffer.from(this.java).toString('base64');
    const script = "$ErrorActionPreference='Stop'; $game=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + encodedRoot + "')); $java=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + encodedJava + "')); $rows=@(Get-CimInstance Win32_Process -Filter \"Name='java.exe' OR Name='javaw.exe'\" | Where-Object { ($_.ExecutablePath -and $_.ExecutablePath -ieq $java) -or ($_.CommandLine -and $_.CommandLine.IndexOf($game,[StringComparison]::OrdinalIgnoreCase) -ge 0) } | ForEach-Object { @{pid=[int]$_.ProcessId; executable=$_.ExecutablePath; command=$_.CommandLine} }); ConvertTo-Json -InputObject $rows -Compress";
    const { stdout } = await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000 });
    return relevantJavaPids(JSON.parse(stdout.trim()), { game: this.game, java: this.java });
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
    if (await this.javaRunning()) throw new Error('Feche o Minecraft e aguarde a atualização do modpack antes de resetar.');
    await this.assertNoLinks(this.root);
    if (!await exists(this.root)) return;
    // Preflight all files with exclusive Windows handles before any deletion.
    const script = "$ErrorActionPreference='Stop'; $root=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + Buffer.from(this.root).toString('base64') + "')); Get-ChildItem -LiteralPath $root -File -Recurse -Force | ForEach-Object { $stream=[IO.File]::Open($_.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None); $stream.Dispose() }";
    if (this.platform === 'win32') {
      try { await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 120000 }); }
      catch { throw new Error('Não foi possível acessar todos os arquivos. Feche o Minecraft e tente novamente.'); }
    }
    await this.assertNoLinks(this.root);
    // Finish a pending Voxy swap before reset can remove its staging files.
    await require('./voxy-landscape.cjs').recoverInstall(this);
    // Keep player data, including both current Voxy and legacy DH caches.
    const preserved = new Set([
      'launcher-settings.json', 'landscape-installed.json', 'voxy-landscape-installed.json', 'landscape-backups/voxy', 'menu-defaults-installed.json', 'sync-backups',
      'game/options.txt', 'game/optionsof.txt', 'game/optionsshaders.txt',
      'game/servers.dat', 'game/config',
      'game/Distant_Horizons_server_data', 'game/.voxy', 'game/voxy', 'game/schematics',
    ].map(name => under(this.root, name).toLowerCase()));
    async function remove(directory) {
      for (const entry of await fs.readdir(directory)) {
        const full = under(directory, entry), stat = await fs.lstat(full);
        if (stat.isSymbolicLink()) throw new Error('Reset bloqueado: link na instalação.');
        if (preserved.has(full.toLowerCase())) continue;
        if (stat.isDirectory()) await remove(full);
        else { await fs.chmod(full, 0o666); await fs.unlink(full); }
      }
      if (!(await fs.readdir(directory)).length) await fs.rmdir(directory);
    }
    await remove(this.root);
  }
  async registerOfficial(ram, testHome) {
    this.validateOptions({ mode: 'microsoft', ram });
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
