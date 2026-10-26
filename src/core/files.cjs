'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createReadStream } = require('node:fs');
const AdmZip = require('adm-zip');

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

module.exports = { exists, readJson, writeJson, under, hashFile, extract, copyTree };
