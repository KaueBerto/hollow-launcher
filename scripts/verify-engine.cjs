'use strict';
// Explicitly opt in: this downloads the game into an existing test fixture and opens a test client.
const fs = require('node:fs/promises');
const path = require('node:path');
const { Engine } = require('../src/engine.cjs');

(async () => {
  const argument = process.argv[2];
  if (!argument) throw new Error('Informe uma pasta de teste isolada. Não use a instalação do jogador.');
  const root = path.resolve(argument);
  if (!['runtime-download-test', 'electron-install-test'].includes(path.basename(root))) throw new Error('Nome de pasta de teste inválido.');
  let lastReport = 0;
  const engine = new Engine({ root, assets: path.resolve(__dirname, '..', 'assets'), report: update => { if (Date.now() - lastReport > 1000) { console.log(update.text); lastReport = Date.now(); } } });
  await engine.install();
  await engine.buildArguments('HollowTeste', 4);
  await engine.launch('HollowTeste', 4);
  const child = engine.gameProcess;
  const closed = new Promise(resolve => child.once('close', resolve));
  let initialized = false;
  try {
    for (let i = 0; i < 60; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (child.exitCode !== null) throw new Error(`Cliente de teste encerrou com código ${child.exitCode}.`);
      const log = await fs.readFile(path.join(root, 'game-launch.log'), 'utf8');
      if (i >= 20 && /Created:.*gui\.png-atlas/.test(log) && /Loaded 0 entity animations/.test(log)) { initialized = true; break; }
    }
    if (!initialized) throw new Error('O cliente não confirmou a inicialização gráfica no prazo.');
    await fs.writeFile(path.join(root, 'electron-verified.txt'), 'Instalação e argumentos JavaScript: OK\nCliente real NeoForge/AutoModpack, texturas e interface carregados: OK\n');
    console.log('Cliente real iniciou com NeoForge e AutoModpack.');
  } finally {
    // Stop only the process started by this verification, never an existing player session.
    if (child.exitCode === null) child.kill();
    await closed;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
