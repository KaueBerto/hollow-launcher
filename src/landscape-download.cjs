'use strict';
const fs = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { hashFile: digest } = require('./core/files.cjs');
async function size(file) { try { return (await fs.stat(file)).size; } catch(error) { if (error.code === 'ENOENT') return 0; throw error; } }
// Bounded parallel ranges, each resumable independently. Completed parts survive failures.
async function downloadParts(m, folder, progress, request = fetch, partSize = 8 * 1024 * 1024, archiveName = 'landscape.gz') {
  if (!Number.isSafeInteger(m.bytes) || m.bytes <= 0 || m.bytes > 16e9 || !/^[a-f0-9]{64}$/.test(m.sha256) || new URL(m.url).protocol !== 'https:') throw Error('Download de paisagem inválido.');
  if (!Number.isSafeInteger(partSize) || partSize <= 0 || Math.ceil(m.bytes / partSize) > 4096 || !/^[a-z-]+\.(gz|zip)$/.test(archiveName)) throw Error('Configuração do download inválida.');
  await fs.mkdir(folder, { recursive: true });
  const count = Math.ceil(m.bytes / partSize), done = Array(count).fill(0);
  const archive = path.join(folder, archiveName);
  if (await size(archive) === m.bytes && await digest(archive, 'sha256') === m.sha256) return archive;
  let next = 0, failure;
  const report = () => progress?.(done.reduce((a,b) => a+b,0),m.bytes);
  await Promise.all(Array.from({length:Math.min(4,count)},async () => {
    while (!failure && next < count) {
      const index = next++, start = index*partSize, length = Math.min(partSize,m.bytes-start), file = path.join(folder,`${index}.part`);
      try {
        for (let attempt=0;attempt<3;attempt++) {
          let have = await size(file);
          if (have > length) { await fs.rm(file); have=0; }
          done[index]=have; report();
          if (have === length) break;
          try {
            const response=await request(m.url,{headers:{Range:`bytes=${start+have}-${start+length-1}`,'Accept-Encoding':'identity'},signal:AbortSignal.timeout(180000)});
            const expected=`bytes ${start+have}-${start+length-1}/${m.bytes}`;
            if(response.status!==206 || response.headers.get('content-range')!==expected || !response.body || response.url && new URL(response.url).protocol!=='https:') { await response.body?.cancel(); throw new Error('A hospedagem não aceitou o download em partes.'); }
            const meter=new Transform({transform(chunk,encoding,callback){
              have+=chunk.length;done[index]=have;
              if(have>length) return callback(new Error('Parte maior que o esperado.'));
              report();callback(null,chunk);
            }});
            await pipeline(Readable.fromWeb(response.body),meter,createWriteStream(file,{flags:'a'}));
            if(have!==length) throw new Error('Download interrompido.');
            break;
          } catch(error) { if(attempt===2) throw error; await new Promise(r=>setTimeout(r,500*(attempt+1))); }
        }
      } catch(error) { failure ||= error; }
    }
  }));
  if(failure) throw failure;
  const space = await fs.statfs(folder);
  if (space.bavail * space.bsize < m.bytes + 64 * 1024 * 1024) throw Error('Espaço insuficiente para concluir o download da paisagem. Libere espaço e tente novamente.');
  const hash = crypto.createHash('sha256');
  const meter = new Transform({ transform(chunk, encoding, callback) { hash.update(chunk); callback(null, chunk); } });
  async function* parts() {
    for (let i = 0; i < count; i++) yield* createReadStream(path.join(folder, `${i}.part`));
  }
  await pipeline(Readable.from(parts()), meter, createWriteStream(`${archive}.assembling`));
  if(hash.digest('hex')!==m.sha256) {
    await fs.rm(`${archive}.assembling`,{force:true});
    for(let i=0;i<count;i++) await fs.rm(path.join(folder,`${i}.part`),{force:true});
    throw new Error('A paisagem não passou na verificação. Tente baixar novamente.');
  }
  await fs.rename(`${archive}.assembling`,archive);
  for(let i=0;i<count;i++) await fs.rm(path.join(folder,`${i}.part`),{force:true});
  return archive;
}

module.exports = { downloadParts };
