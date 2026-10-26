'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { exists, readJson, writeJson, under, extract, copyTree } = require('./core/files.cjs');
const { spawn } = require('node:child_process');
const { createWriteStream } = require('node:fs');
const { MC, NF, VERSION, allowed, nbtServerList } = require('./core/minecraft.cjs');
const { workers } = require('./core/workers.cjs');
const { ensureSync } = require('./modpack-sync.cjs');
const INSTALLER_HASH = '8e8a6889b6d7ddcae5f93c4f9c90035e14ea70cdc5b74147773265809c4f9137';

async function installJava(engine) {
  if (await exists(engine.java)) return;
  engine.progress('Baixando Java 21…');
  const metadata = await engine.jsonFrom('https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse');
  const archive = metadata[0]?.binary?.package;
  if (!archive?.link || !archive.checksum) throw new Error('Não encontrei o Java 21 para Windows.');
  const zip = path.join(engine.root, 'downloads', 'java21.zip');
  await engine.download(archive.link, zip, archive.checksum, 'sha256', (done, total) => engine.progress('Baixando Java 21…', done, total));
  engine.progress('Preparando Java 21…');
  const staging = path.join(engine.root, 'runtime-extract');
  await extract(zip, staging);
  for (const entry of await fs.readdir(staging, { withFileTypes: true })) {
    const source = under(staging, entry.name);
    if (entry.isDirectory() && await exists(path.join(source, 'bin', 'java.exe'))) { await copyTree(source, path.join(engine.root, 'runtime')); return; }
  }
  throw new Error('O Java baixado está incompleto.');
}
async function libraries(engine, version) {
  await workers((version.libraries || []).filter(library => allowed(library)), 6, async library => {
    const downloads = library.downloads || {};
    const artifact = downloads.artifact;
    if (artifact?.url) await engine.download(artifact.url, under(path.join(engine.game, 'libraries'), artifact.path), artifact.sha1);
    const classifier = library.natives?.windows?.replace('${arch}', '64');
    const native = downloads.classifiers?.[classifier];
    if (native?.url) await engine.download(native.url, under(path.join(engine.game, 'libraries'), native.path), native.sha1);
  });
}
async function installer(engine, jar) {
  const log = path.join(engine.root, 'neoforge-install.log');
  await fs.writeFile(log, 'Hollow Launcher Electron\n');
  const output = createWriteStream(log, { flags: 'a' });
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(engine.java, ['-jar', jar, '--installClient', engine.game], { cwd: engine.root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.pipe(output, { end: false }); child.stderr.pipe(output, { end: false });
      child.once('error', reject);
      child.once('close', code => code === 0 ? resolve() : reject(new Error('O NeoForge não terminou a instalação. Consulte neoforge-install.log.')));
    });
  } finally { await new Promise(resolve => output.end(resolve)); }
  if (!await exists(engine.versionFile(VERSION))) throw new Error('A instalação do NeoForge está incompleta.');
}
async function install(engine) {
  if (engine.platform !== 'win32' || process.arch !== 'x64') throw new Error('Este launcher exige Windows de 64 bits.');
  await fs.mkdir(engine.game, { recursive: true });
  await engine.installJava();
  engine.progress('Preparando Minecraft 1.21.1…');
  const manifest = await engine.jsonFrom('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
  const version = manifest.versions.find(item => item.id === MC);
  if (!version) throw new Error('Não encontrei a versão do Minecraft.');
  await engine.download(version.url, engine.versionFile(MC), version.sha1);
  const vanilla = await readJson(engine.versionFile(MC));
  const client = vanilla.downloads.client;
  await engine.download(client.url, path.join(engine.game, 'versions', MC, `${MC}.jar`), client.sha1, 'sha1', (done, total) => engine.progress('Baixando Minecraft 1.21.1…', done, total));
  engine.progress('Preparando bibliotecas…'); await engine.libraries(vanilla);
  if (!await exists(engine.versionFile(VERSION))) {
    engine.progress('Instalando NeoForge… Isso pode levar alguns minutos.');
    const jar = path.join(engine.root, 'downloads', 'neoforge-installer.jar');
    await engine.download(`https://maven.neoforged.net/releases/net/neoforged/neoforge/${NF}/neoforge-${NF}-installer.jar`, jar, INSTALLER_HASH, 'sha256');
    const profiles = path.join(engine.game, 'launcher_profiles.json');
    if (!await exists(profiles)) await writeJson(profiles, { profiles: {} });
    await engine.installer(jar);
  }
  await engine.libraries(await readJson(engine.versionFile(VERSION)));
  engine.progress('Conferindo recursos do jogo…');
  const indexPath = under(path.join(engine.game, 'assets', 'indexes'), `${vanilla.assetIndex.id}.json`);
  await engine.download(vanilla.assetIndex.url, indexPath, vanilla.assetIndex.sha1);
  const objects = [...new Map(Object.values((await readJson(indexPath)).objects).map(item => [item.hash, item])).values()];
  let done = 0;
  await workers(objects, 12, async item => {
    const hash = item.hash;
    if (!/^[0-9a-f]{40}$/.test(hash)) throw new Error('Recurso inválido no manifesto.');
    await engine.download(`https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`, under(path.join(engine.game, 'assets', 'objects'), `${hash.slice(0, 2)}/${hash}`), hash);
    engine.progress(`Recursos: ${++done} / ${objects.length}`, done, objects.length);
  });
  engine.progress('Preparando AVERON SMP…');
  await ensureSync(engine);
  const servers = path.join(engine.game, 'servers.dat');
  if (!await exists(servers)) await fs.writeFile(servers, nbtServerList());
  await writeJson(path.join(engine.root, 'ready.json'), { minecraft: MC, neoforge: NF, launcher: 'electron', created: new Date().toISOString() });
  engine.progress('Instalação concluída.', 1, 1);
}
module.exports = { installJava, libraries, installer, install };
