'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createWriteStream } = require('node:fs');
const { MC, VERSION, offlineUuid, validateOptions, allowed, argumentsOf } = require('./core/minecraft.cjs');
const { readJson, under, exists, extract } = require('./core/files.cjs');
const { alive, trackGameProcess } = require('./game-process.cjs');
const { ensureSync } = require('./modpack-sync.cjs');
const runFile = promisify(execFile);

async function buildArguments(engine, nickname, ram, account) {
  validateOptions({ mode: 'nickname', nickname, ram });
  if (account && (account.name !== nickname || !/^[a-f0-9]{32}$/i.test(account.id) || typeof account.accessToken !== 'string' || !account.accessToken || !Number.isFinite(account.expires) || account.expires <= Date.now())) throw new Error('Sessão Microsoft inválida ou expirada. Faça login novamente.');
  const vanilla = await readJson(engine.versionFile(MC)), neo = await readJson(engine.versionFile(VERSION));
  const merged = new Map();
  for (const library of [...vanilla.libraries, ...neo.libraries]) {
    if (!allowed(library)) continue;
    const parts = library.name.split(':');
    merged.set(`${parts[0]}:${parts[1]}:${parts[3] || ''}`, library);
  }
  const libraries = path.join(engine.game, 'libraries'), natives = path.join(engine.game, 'natives');
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
  classpath.push(path.join(engine.game, 'versions', MC, `${MC}.jar`));
  const replacements = {
    auth_player_name: nickname, version_name: VERSION, game_directory: engine.game,
    assets_root: path.join(engine.game, 'assets'), assets_index_name: vanilla.assetIndex.id,
    auth_uuid: account?.id || offlineUuid(nickname), auth_access_token: account?.accessToken || '0', clientid: account?.clientId || '', auth_xuid: account?.xuid || '',
    user_type: account ? 'msa' : 'legacy', version_type: 'release', natives_directory: natives,
    launcher_name: 'HollowSMP', launcher_version: require('../package.json').version, classpath: classpath.join(';'),
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
async function launch(engine, nickname, ram, account) {
  if (alive(engine.gameProcess)) throw new Error('O Minecraft já está aberto.');
  await ensureSync(engine);
  const { prepareMenu } = require('./menu-bootstrap.cjs');
  await prepareMenu(engine);
  const argumentsList = await engine.buildArguments(nickname, ram, account);
  const { javaInvocation, startupFailure } = require('./java-invocation.cjs');
  const invocation = javaInvocation(engine.java, argumentsList, engine.game, { account: Boolean(account) });
  const argumentFile = path.join(engine.root, 'game-args.txt');
  if (invocation.method === 'argument-file') {
    await fs.writeFile(argumentFile, '', { mode: 0o600 });
    if (account && engine.platform === 'win32') {
      // Java needs an argument file for Windows command length limits. Protect it before writing credentials.
      const script = "$ErrorActionPreference='Stop'; $file=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + Buffer.from(argumentFile).toString('base64') + "')); $acl=New-Object Security.AccessControl.FileSecurity; $acl.SetAccessRuleProtection($true,$false); $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User; $acl.SetOwner($sid); $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow'))); $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-18')),'FullControl','Allow'))); [IO.File]::SetAccessControl($file,$acl)";
      try { await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000 }); }
      catch { await fs.rm(argumentFile, { force: true }); throw new Error('Não consegui proteger a sessão no Windows. Verifique o acesso à pasta HollowSMP e tente novamente.'); }
    }
    await fs.writeFile(argumentFile, invocation.args.map(value => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`).join('\n'), 'utf8');
  } else await fs.rm(argumentFile, { force: true });
  const output = createWriteStream(path.join(engine.root, 'game-launch.log'), { flags: 'w' });
  output.write(`Averon Launcher ${require('../package.json').version} — ${new Date().toISOString()}\nInicialização: ${invocation.method}; memória: ${ram} GB\n`);
  const started = Date.now();
  const child = spawn(engine.java, invocation.method === 'direct' ? invocation.args : [`@${argumentFile}`], { cwd: engine.game, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let launchFailure = null;
  let argumentCleanup;
  const cleanupArgs = () => argumentCleanup ||= fs.rm(argumentFile, { force: true }).catch(() => {});
  const { redactedLog } = require('./redacted-log.cjs');
  const stdout = child.stdout.pipe(redactedLog(account?.accessToken));
  const stderr = child.stderr.pipe(redactedLog(account?.accessToken));
  stdout.pipe(output, { end: false }); stderr.pipe(output, { end: false });
  // First Java output means the VM has parsed the argument file.
  child.stdout.once('data', cleanupArgs); child.stderr.once('data', cleanupArgs);
  const finish = trackGameProcess(engine, child, { cleanup: cleanupArgs, finishLog: async code => {
    stdout.unpipe(output); stderr.unpipe(output);
    stdout.resume(); stderr.resume(); // Drain inherited helper output without keeping the game active.
    await new Promise(resolve => output.end(`\nExit code: ${code}\n`, resolve));
    const elapsed = Date.now() - started;
    if (code === 0 && elapsed >= 15000) return;
    const log = await fs.open(path.join(engine.root, 'game-launch.log'), 'r').then(async file => {
      try {
        const { size } = await file.stat();
        const buffer = Buffer.alloc(Math.min(size, 16384));
        const { bytesRead } = await file.read(buffer, 0, buffer.length, Math.max(0, size - buffer.length));
        return buffer.subarray(0, bytesRead).toString('utf8');
      } finally { await file.close(); }
    }).catch(() => '');
    const message = startupFailure(code, elapsed, log);
    if (message) launchFailure = { id: `${child.pid || 'spawn'}-${started}`, title: elapsed < 15000 ? 'Não foi possível iniciar o Minecraft' : 'O Minecraft encerrou', message };
  }, exitReport: () => ({ launchFailure }) });
  try { await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); }
  catch (error) { await finish(null); throw error; }
  return child.pid;
}
module.exports = { buildArguments, launch };
