'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');
const {DIRECTORY,validate,downloadParts,installLandscape}=require('../src/landscape.cjs');
function manifest(data){return{version:1,directory:DIRECTORY,url:'https://painel.hollowsmp.com.br/hollow-landscape/test.gz',bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex'),databaseBytes:10,databaseSha256:'a'.repeat(64)}}
test('manifest rejects unrelated host and directory traversal',()=>{
 const m=manifest(Buffer.from('test'));assert.equal(validate(m),m);
 assert.throws(()=>validate({...m,directory:'../../config'}));assert.throws(()=>validate({...m,url:'https://evil.invalid/file'}));
});
test('download resumes partial ranges, bounds concurrency and verifies full checksum',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hollow-landscape-'));const data=Buffer.from('abcdefghijklmno');let active=0,max=0;const ranges=[];
 try{
  await fs.writeFile(path.join(root,'0.part'),data.subarray(0,2));
  const request=async(url,opts)=>{const [,a,b]=/bytes=(\d+)-(\d+)/.exec(opts.headers.Range);ranges.push([+a,+b]);active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,10));active--;return new Response(data.subarray(+a,+b+1),{status:206,headers:{'content-range':`bytes ${a}-${b}/${data.length}`}})};
  const m=manifest(data);const archive=await downloadParts(m,root,()=>{},request,4);assert.deepEqual(await fs.readFile(archive),data);assert(ranges.some(([start])=>start===2));assert(max<=4);
  let requested=false;await downloadParts(m,root,()=>{},async()=>{requested=true;throw Error('unexpected')},4);assert.equal(requested,false);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
test('corrupt completed parts are rejected and cleared for a fresh attempt',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hollow-landscape-'));
 try{await fs.writeFile(path.join(root,'0.part'),'xxxx');await assert.rejects(downloadParts(manifest(Buffer.from('good')),root,()=>{},fetch,4),/verificação/);await assert.rejects(fs.access(path.join(root,'0.part')))}finally{await fs.rm(root,{recursive:true,force:true})}
});
test('installation streams gzip, backs up existing database and does not download twice',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hollow-landscape-'));const {gzipSync}=require('node:zlib');
 const raw=Buffer.concat([Buffer.from('SQLite format 3\0'),Buffer.alloc(100)]),packed=gzipSync(raw),m=manifest(packed);
 m.databaseBytes=raw.length;m.databaseSha256=crypto.createHash('sha256').update(raw).digest('hex');
 const oldFetch=global.fetch;let requests=0;
 const engine={root,game:path.join(root,'game'),gameProcess:null,javaRunning:async()=>false,jsonFrom:async()=>m,progress:()=>{}};
 const target=path.join(engine.game,'Distant_Horizons_server_data','Hollow+SMP',DIRECTORY.split('/')[1],'DistantHorizons.sqlite');
 try{
  await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,'previous cache');
  global.fetch=async(url,options)=>{requests++;const [,start,end]=/bytes=(\d+)-(\d+)/.exec(options.headers.Range);return new Response(packed.subarray(+start,+end+1),{status:206,headers:{'content-range':`bytes ${start}-${end}/${packed.length}`}})};
  assert.equal((await installLandscape(engine)).alreadyInstalled,false);assert.deepEqual(await fs.readFile(target),raw);
  const backup=(await fs.readdir(path.join(root,'landscape-backups')))[0];assert.equal(await fs.readFile(path.join(root,'landscape-backups',backup,'DistantHorizons.sqlite'),'utf8'),'previous cache');
  assert.equal((await installLandscape(engine)).alreadyInstalled,true);assert.equal(requests,1);
  engine.gameProcess={};await assert.rejects(installLandscape(engine),/Feche o Minecraft/);
 }finally{global.fetch=oldFetch;await fs.rm(root,{recursive:true,force:true})}
});

test('legacy receipt reuses local landscape once, including databases changed during play',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hollow-landscape-legacy-'));
 const raw=Buffer.concat([Buffer.from('SQLite format 3\0'),Buffer.alloc(100)]),m=manifest(Buffer.from('unused'));
 m.databaseBytes=raw.length;m.databaseSha256=crypto.createHash('sha256').update(raw).digest('hex');
 const engine={root,game:path.join(root,'game'),gameProcess:null,javaRunning:async()=>false,jsonFrom:async()=>m,progress:()=>{}};
 const original=path.join(engine.game,'Distant_Horizons_server_data',DIRECTORY,'DistantHorizons.sqlite');
 const target=path.join(engine.game,'Distant_Horizons_server_data','Hollow+SMP',DIRECTORY.split('/')[1],'DistantHorizons.sqlite');
 const oldFetch=global.fetch;
 try{
  global.fetch=async()=>{assert.fail('Paisagem já instalada não deve baixar novamente');};
  await fs.mkdir(path.dirname(original),{recursive:true});await fs.writeFile(original,raw);
  await fs.writeFile(original+'-wal','pending terrain journal');
  await fs.writeFile(path.join(root,'landscape-installed.json'),JSON.stringify({sha256:m.databaseSha256,version:1}));
  assert.equal((await installLandscape(engine)).alreadyInstalled,true);
  assert.deepEqual(await fs.readFile(target),raw);assert.deepEqual(await fs.readFile(original),raw);
  assert.equal(await fs.readFile(target+'-wal','utf8'),'pending terrain journal');
  await fs.appendFile(target,'terrain discovered during play');
  assert.equal((await installLandscape(engine)).alreadyInstalled,true);
  assert.equal((JSON.parse(await fs.readFile(path.join(root,'landscape-installed.json')))).directory,path.join('Hollow+SMP',DIRECTORY.split('/')[1]));
 }finally{global.fetch=oldFetch;await fs.rm(root,{recursive:true,force:true});}
});

test('legacy receipt upgrades in place and does not trust a truncated database',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hollow-landscape-receipt-'));
 const raw=Buffer.concat([Buffer.from('SQLite format 3\0'),Buffer.alloc(100)]),{gzipSync}=require('node:zlib'),packed=gzipSync(raw),m=manifest(packed);
 m.databaseBytes=raw.length;m.databaseSha256=crypto.createHash('sha256').update(raw).digest('hex');
 const engine={root,game:path.join(root,'game'),gameProcess:null,javaRunning:async()=>false,jsonFrom:async()=>m,progress:()=>{}};
 const target=path.join(engine.game,'Distant_Horizons_server_data','Hollow+SMP',DIRECTORY.split('/')[1],'DistantHorizons.sqlite');
 const oldFetch=global.fetch;let requests=0;
 try{
  global.fetch=async(url,options)=>{requests++;const [,start,end]=/bytes=(\d+)-(\d+)/.exec(options.headers.Range);return new Response(packed.subarray(+start,+end+1),{status:206,headers:{'content-range':`bytes ${start}-${end}/${packed.length}`}})};
  await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,raw);
  await fs.writeFile(path.join(root,'landscape-installed.json'),JSON.stringify({sha256:m.databaseSha256,version:1}));
  assert.equal((await installLandscape(engine)).alreadyInstalled,true);assert.equal(requests,0);
  await fs.writeFile(target,'corrupt');
  assert.equal((await installLandscape(engine)).alreadyInstalled,false);assert.equal(requests,1);
  assert.deepEqual(await fs.readFile(target),raw);
 }finally{global.fetch=oldFetch;await fs.rm(root,{recursive:true,force:true});}
});
