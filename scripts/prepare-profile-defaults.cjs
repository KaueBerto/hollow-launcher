'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');

const source = process.argv[2];
const assets = process.argv[3] || path.join(__dirname, '..', 'assets');
if (!source) throw Error('Uso: node scripts/prepare-profile-defaults.cjs <pasta-do-jogo> [pasta-assets]');

const excluded = [
  /^config\/(?:fancymenu|drippyloadingscreen)(?:\/|$)/i,
  /^config\/jei\/world(?:\/|$)/i,
  /^config\/voicechat\/username-cache\.json$/i,
  /^config\/skinrestorer(?:\/|$)/i,
  /^config\/worldedit\/sessions(?:\/|$)/i,
  /^config\/axiom\/(?:blueprints|hotbars)(?:\/|$)/i,
  /^config\/axiom\/translations\.zip$/i,
  /^config\/litematica(?:\/|$)/i,
  /^config\/xaero\/(?:lib\/server_profiles|world-map\/server_profiles)(?:\/|$)/i,
  /^config\/(?:spark\/tmp|spark\/tmp-client|craftedcore\/cache)(?:\/|$)/i,
  /^config\/ars_nouveau\/search_index\/write\.lock$/i,
  /(?:^|\/)(?:logs?|cache|sessions?|history|recent|tmp|backups?)(?:\/|$)/i,
  /(?:\.bak|\.backup|\.lock|\.tmp)$/i,
  /^config\/(?:resourceful-config-web\.json|watermedia\.toml|grieflogger\/grieflogger\.toml)$/i,
  /^config\/DistantHorizons\.toml$/i,
];
const rootFiles = ['options.txt', 'optionsof.txt', 'optionsshaders.txt'];
const enforcedFiles = [
  'config/emf_compat.json',
  'config/entity_model_features.json',
  'config/entity_texture_features.json',
  'config/etf_warnings.json',
];
const normalize = value => value.split(path.sep).join('/');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const selected = [];

for (const name of rootFiles) {
  const file = path.join(source, name);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) selected.push({ path: name, file });
}
const config = path.join(source, 'config');
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw Error(`Link recusado no perfil: ${file}`);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile()) {
      const relative = `config/${normalize(path.relative(config, file))}`;
      if (!excluded.some(rule => rule.test(relative))) selected.push({ path: relative, file });
    }
  }
}
if (fs.existsSync(config)) walk(config);

selected.sort((a, b) => a.path.localeCompare(b.path, 'en'));
const seen = new Set();
const zip = new AdmZip();
const files = [];
for (const item of selected) {
  const key = item.path.toLowerCase();
  if (seen.has(key)) throw Error(`Caminho duplicado: ${item.path}`);
  seen.add(key);
  let data = fs.readFileSync(item.file);
  if (item.path === 'config/cpm.json') {
    const cpm = JSON.parse(data.toString('utf8'));
    cpm.editorRecentProjects = [];
    cpm.serverSettings = {};
    cpm.playerSettings = {};
    cpm.friendSettings = {};
    cpm.friendList = {};
    cpm.blockedList = {};
    data = Buffer.from(JSON.stringify(cpm, null, 2) + '\n');
  }
  zip.addFile(item.path, data);
  const entry = zip.getEntry(item.path);
  entry.header.time = new Date('2000-01-01T00:00:00.000Z');
  files.push({ path: item.path, size: data.length, sha256: sha256(data) });
}
if (!files.length || files.length > 2000) throw Error(`Quantidade inválida de arquivos: ${files.length}`);
const archive = zip.toBuffer();
if (archive.length > 100 * 1024 * 1024) throw Error('Preset excede 100 MiB.');
fs.mkdirSync(assets, { recursive: true });
const archivePath = path.join(assets, 'profile-defaults.zip');
const manifestPath = path.join(assets, 'profile-defaults-manifest.json');
const policyHash = sha256(Buffer.concat([archive, Buffer.from(JSON.stringify(enforcedFiles))]));
fs.writeFileSync(archivePath, archive);
fs.writeFileSync(manifestPath, JSON.stringify({
  schema: 1,
  id: `averon-profile-${policyHash.slice(0, 12)}`,
  minecraft: '1.21.1',
  archive: { file: 'profile-defaults.zip', size: archive.length, sha256: sha256(archive) },
  enforcedFiles,
  files,
}, null, 2) + '\n');
console.log(JSON.stringify({ archivePath, manifestPath, files: files.length, bytes: archive.length, sha256: sha256(archive) }, null, 2));
