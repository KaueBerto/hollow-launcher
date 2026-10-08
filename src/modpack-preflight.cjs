'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const PREFLIGHT_HASH='280a29961a20583d3cbac82ec3ae27e2b53bd273f67b1b6dd6f00976cd7ed572';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function prepareModpack(engine,{readPids=()=>engine.hollowGamePids(),wait=pause,timeout=120000,now=Date.now,run}={}){
 const client=path.join(engine.game,'automodpack','client');
 try{await fs.access(client);}catch(error){if(error.code==='ENOENT')return;throw error;}
 const started=now();
 while((await readPids()).length){
  engine.progress('Aguardando o Minecraft e a atualização anterior terminarem…');
  if(now()-started>=timeout)throw Error('O Minecraft ou o atualizador ainda está aberto. Aguarde o encerramento antes de jogar novamente.');
  await wait(1000);
 }
 const journal=path.join(client,'update-transaction.json');
 try{await fs.access(journal);}catch(error){if(error.code==='ENOENT')return;throw error;}
 engine.progress('Concluindo atualização do modpack antes de abrir o Minecraft…');
 const bridge=path.join(engine.assets,'hollow-pack-preflight.jar');
 const original=path.join(engine.assets,'automodpack-5.0.0-rc.2.jar');
 const {hashFile,MOD_HASH}=require('./engine.cjs');
 if(await hashFile(bridge,'sha256')!==PREFLIGHT_HASH||await hashFile(original,'sha256')!==MOD_HASH)throw Error('O verificador do modpack está inválido. Reinstale o launcher.');
 const libraries=path.join(engine.game,'libraries');
 const cp=[bridge,original,path.join(libraries,'com/google/code/gson/gson/2.10.1/gson-2.10.1.jar'),path.join(libraries,'org/apache/logging/log4j/log4j-api/2.22.1/log4j-api-2.22.1.jar'),path.join(libraries,'org/apache/logging/log4j/log4j-core/2.22.1/log4j-core-2.22.1.jar')].join(';');
 try{
  const result=await run(engine.java,['-cp',cp,'pl.skidam.automodpack_core.client.HollowPackPreflight',engine.game],{cwd:engine.game,windowsHide:true,timeout:120000,maxBuffer:2*1024*1024});
  await fs.writeFile(path.join(engine.root,'modpack-preflight.log'),result.stdout+'\n'+result.stderr);
  if(!result.stdout.includes('HOLLOW_PACK_READY'))throw Error('Atualização não confirmada.');
  try{await fs.access(journal);throw Error('Ainda existe uma atualização pendente.');}catch(error){if(error.code!=='ENOENT')throw error;}
 }catch(error){
  await fs.writeFile(path.join(engine.root,'modpack-preflight.log'),(error.stdout||'')+'\n'+(error.stderr||'')+'\n'+String(error));
  throw Error('A atualização do modpack não terminou. O jogo não foi aberto para evitar repetir a atualização. Confira modpack-preflight.log.');
 }
}
module.exports={prepareModpack,PREFLIGHT_HASH};
