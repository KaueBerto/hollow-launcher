'use strict';
const fs = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createGunzip } = require('node:zlib');
const MANIFEST = 'https://painel.hollowsmp.com.br/hollow-landscape/manifest.json';
const DIRECTORY = 'Minecraft+Server/b4c77i87dhs4g@minecraft@@overworld';
const { landscapeDirectory } = require('./landscape-folder.cjs');
async function digest(file) { const h = crypto.createHash('sha256'); for await (const b of createReadStream(file)) h.update(b); return h.digest('hex'); }
async function size(file) { try { return (await fs.stat(file)).size; } catch { return 0; } }
async function validDatabase(file, minimum = 16) {
  let handle;
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.size < minimum) return false;
    handle = await fs.open(file, 'r');
    const header = Buffer.alloc(16);
    await handle.read(header, 0, 16, 0);
    return header.toString() === 'SQLite format 3\0';
  } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  finally { await handle?.close(); }
}
function validate(m) {
  if (!m || !Number.isInteger(m.version) || m.directory !== DIRECTORY || !Number.isSafeInteger(m.bytes) || m.bytes <= 0 || m.bytes > 4e9 || !Number.isSafeInteger(m.databaseBytes) || m.databaseBytes <= 0 || m.databaseBytes > 8e9 || !/^[a-f0-9]{64}$/.test(m.sha256) || !/^[a-f0-9]{64}$/.test(m.databaseSha256) || !m.url.startsWith('https://painel.hollowsmp.com.br/hollow-landscape/')) throw new Error('Dados da paisagem inválidos.');
  return m;
}
// Bounded parallel ranges, each resumable independently. Completed parts survive failures.
async function downloadParts(m, folder, progress, request = fetch, partSize = 8 * 1024 * 1024) {
  validate(m); await fs.mkdir(folder, { recursive: true });
  const count = Math.ceil(m.bytes / partSize), done = Array(count).fill(0);
  const archive = path.join(folder, 'landscape.gz');
  if (await size(archive) === m.bytes && await digest(archive) === m.sha256) return archive;
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
  const output=await fs.open(`${archive}.assembling`,'w');
  try { for(let i=0;i<count;i++) for await(const chunk of createReadStream(path.join(folder,`${i}.part`))) await output.write(chunk); }
  finally { await output.close(); }
  if(await digest(`${archive}.assembling`)!==m.sha256) {
    await fs.rm(`${archive}.assembling`,{force:true});
    for(let i=0;i<count;i++) await fs.rm(path.join(folder,`${i}.part`),{force:true});
    throw new Error('A paisagem não passou na verificação. Tente baixar novamente.');
  }
  await fs.rename(`${archive}.assembling`,archive);
  for(let i=0;i<count;i++) await fs.rm(path.join(folder,`${i}.part`),{force:true});
  return archive;
}
async function installLandscape(engine) {
  if(engine.gameProcess || await engine.javaRunning()) throw new Error('Feche o Minecraft antes de baixar a paisagem.');
  const m=validate(await engine.jsonFrom(MANIFEST));
  const marker=path.join(engine.root,'landscape-installed.json');
  const directory=await landscapeDirectory(engine.game,DIRECTORY.split('/')[1]);
  const target=path.join(engine.game,'Distant_Horizons_server_data',directory,'DistantHorizons.sqlite');
  let installed;
  try { installed=JSON.parse(await fs.readFile(marker,'utf8')); } catch(error) { if(error.code!=='ENOENT' && !(error instanceof SyntaxError)) throw error; }
  if(installed?.sha256===m.databaseSha256) {
    // DH edits its SQLite database during play; its checksum cannot stay equal to the original archive.
    if(installed.directory===directory && await validDatabase(target)) return {alreadyInstalled:true};
    if(!installed.directory) {
      // 2.3.0 saved no destination in its receipt and installed into the manifest's source folder.
      if(await validDatabase(target,m.databaseBytes)) {
        await fs.writeFile(marker,JSON.stringify({...installed,directory}));
        return {alreadyInstalled:true};
      }
      const previous=path.join(engine.game,'Distant_Horizons_server_data',DIRECTORY,'DistantHorizons.sqlite');
      if(previous!==target && !await size(target) && await validDatabase(previous,m.databaseBytes)) {
        engine.progress('Reaproveitando paisagem já baixada…');
        await fs.mkdir(path.dirname(target),{recursive:true});
        const temporary=`${target}.hollow-installing`;
        try {
          await fs.copyFile(previous,temporary);
          let hasWal=false;
          try { await fs.copyFile(previous+'-wal',temporary+'-wal'); hasWal=true; }
          catch(error) { if(error.code!=='ENOENT') throw error; }
          if(engine.gameProcess || await engine.javaRunning()) throw new Error('Feche o Minecraft para instalar a paisagem.');
          if(hasWal) await fs.rename(temporary+'-wal',target+'-wal');
          await fs.rename(temporary,target);
          await fs.writeFile(marker,JSON.stringify({...installed,directory}));
        } finally { await fs.rm(temporary,{force:true}); await fs.rm(temporary+'-wal',{force:true}); }
        return {alreadyInstalled:true};
      }
    }
  }
  engine.progress('Baixando paisagem do Distant Horizons…');
  const folder=path.join(engine.root,'downloads',`landscape-${m.sha256}`);
  const archive=await downloadParts(m,folder,(done,total)=>engine.progress(`Baixando paisagem: ${(done/1048576).toFixed(0)} / ${(total/1048576).toFixed(0)} MB`,done,total));
  engine.progress('Preparando paisagem do Distant Horizons…');
  await fs.mkdir(path.dirname(target),{recursive:true});
  const temporary=`${target}.hollow-installing`;
  let bytes=0; const hash=crypto.createHash('sha256');
  const meter=new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;hash.update(chunk);callback(bytes>m.databaseBytes?new Error('Paisagem maior que o esperado.'):null,chunk);}});
  try {
    await pipeline(createReadStream(archive),createGunzip(),meter,createWriteStream(temporary));
    if(bytes!==m.databaseBytes || hash.digest('hex')!==m.databaseSha256) throw new Error('O banco da paisagem não passou na verificação.');
    const header=await fs.open(temporary,'r'); const magic=Buffer.alloc(16);try{await header.read(magic,0,16,0);}finally{await header.close();}
    if(magic.toString()!=='SQLite format 3\0') throw new Error('Banco de paisagem inválido.');
    if(engine.gameProcess || await engine.javaRunning()) throw new Error('Feche o Minecraft para instalar a paisagem.');
    if(await size(target)>0) {
      const backup=path.join(engine.root,'landscape-backups',String(Date.now()));await fs.mkdir(backup,{recursive:true});
      for(const suffix of ['','-wal','-shm']) { try{await fs.rename(target+suffix,path.join(backup,'DistantHorizons.sqlite'+suffix));}catch(e){if(e.code!=='ENOENT')throw e;} }
    }
    await fs.rename(temporary,target);
    await fs.writeFile(marker,JSON.stringify({sha256:m.databaseSha256,version:m.version,directory}));
    await fs.rm(archive,{force:true});
    engine.progress('Paisagem instalada.',1,1);
    return {alreadyInstalled:false};
  } catch(error) { await fs.rm(temporary,{force:true});throw error; }
}
module.exports={MANIFEST,DIRECTORY,validate,downloadParts,installLandscape};
