'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { exists, hashFile } = require('./core/files.cjs');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createWriteStream } = require('node:fs');

async function jsonFrom(engine, url) {
  if (new URL(url).protocol !== 'https:') throw new Error('O download exige HTTPS.');
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Servidor de download respondeu ${response.status}. Tente novamente.`);
  if (new URL(response.url).protocol !== 'https:') throw new Error('Redirecionamento de download inválido.');
  return response.json();
}
async function download(engine, url, destination, expected, algorithm = 'sha1', onProgress) {
  if (new URL(url).protocol !== 'https:') throw new Error('O download exige HTTPS.');
  if (expected && await exists(destination) && await hashFile(destination, algorithm) === expected.toLowerCase()) return;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const partial = `${destination}.partial`;
  if (expected && await exists(partial) && await hashFile(partial, algorithm) === expected.toLowerCase()) { await fs.rename(partial, destination); return; }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let offset = expected ? await fs.stat(partial).then(s => s.size).catch(() => 0) : 0;
      const response = await fetch(url, { headers: offset ? { Range: `bytes=${offset}-`, 'Accept-Encoding': 'identity' } : {}, signal: AbortSignal.timeout(600000) });
      if (response.status === 416) { await response.body?.cancel(); await fs.rm(partial, { force: true }); throw new Error('Retomando o download novamente.'); }
      if (!response.ok || !response.body) throw new Error(`Falha no download (${response.status}).`);
      if (new URL(response.url).protocol !== 'https:') throw new Error('Redirecionamento de download inválido.');
      if (response.status === 206) {
        const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') || '');
        if (!range || Number(range[1]) !== offset) { await response.body.cancel(); throw new Error('Retomada de download inválida.'); }
      } else offset = 0;
      const total = (Number(response.headers.get('content-length')) || 0) + offset;
      let received = offset, lastReport = 0;
      const meter = new Transform({ transform(chunk, encoding, callback) {
        received += chunk.length;
        if (onProgress && Date.now() - lastReport > 150) { lastReport = Date.now(); onProgress(received, total); }
        callback(null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(partial, { flags: offset ? 'a' : 'w' }));
      if (expected && await hashFile(partial, algorithm) !== expected.toLowerCase()) { await fs.rm(partial, { force: true }); throw new Error('O download não passou na verificação.'); }
      await fs.rename(partial, destination);
      if (onProgress) onProgress(received, total);
      return;
    } catch (error) {
      if (!expected) await fs.rm(partial, { force: true });
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
    }
  }
}
module.exports = { jsonFrom, download };
