'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { nbtServerList } = require('../src/engine.cjs');
const { serverList, folderName, landscapeDirectory } = require('../src/landscape-folder.cjs');
test('launcher server cadastro resolves to Hollow+SMP and source name resolves to Minecraft+Server', () => {
  const [server] = serverList(nbtServerList());
  assert.equal(server.ip, 'hollowsmp.com.br:25565');
  assert.equal(folderName(server), 'Hollow+SMP');
  assert.equal(folderName({...server,name:'Minecraft Server'}), 'Minecraft+Server');
  assert.equal(folderName({...server,name:'Hollow/ SMP!'}), 'Hollow+SMP%21');
  assert.equal(folderName(server,'NAME_IP_PORT'), 'Hollow+SMP%2C+IP+hollowsmp.com.br-25565');
  assert.throws(() => serverList(Buffer.from([10,0])));
});
test('destination follows saved cadastro and DH folder mode rather than manifest source folder', async () => {
  const game = await fs.mkdtemp(path.join(os.tmpdir(),'hollow-folder-'));
  try {
    await fs.writeFile(path.join(game,'servers.dat'),nbtServerList());
    assert.equal(await landscapeDirectory(game,'level'),path.join('Hollow+SMP','level'));
    await fs.mkdir(path.join(game,'config'));
    await fs.writeFile(path.join(game,'config','DistantHorizons.toml'),'serverFolderNameMode = "IP_ONLY"');
    assert.equal(await landscapeDirectory(game,'level'),path.join('hollowsmp.com.br','level'));
    assert.equal(serverList(require('node:zlib').gzipSync(nbtServerList()))[0].name,'Hollow SMP');
  } finally { await fs.rm(game,{recursive:true,force:true}); }
});
