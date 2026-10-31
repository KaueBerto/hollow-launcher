'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
async function smokeUi({ window, engine, publish, gameWindow, safeStorage, app, verifyOutputIndex, resizeWindow }) {
  const { validateManifest } = require('../menu-bootstrap.cjs');
  validateManifest(JSON.parse(await fs.readFile(path.join(engine.assets, 'menu-bootstrap-manifest.json'), 'utf8')));
  const output = verifyOutputIndex >= 0 ? path.resolve(process.argv[verifyOutputIndex + 1]) : path.join(__dirname, '../..', 'dist', 'ui-check');
  await fs.mkdir(output, { recursive: true });
  const errors = [];
  window.webContents.on('console-message', event => { if (event.level === 'error') { errors.push(event.message); console.error(event.message); } });
  await window.webContents.executeJavaScript(`window.hollowTestReady`);
  window.show();
  const entranceError = await window.webContents.executeJavaScript(`(() => {
    if (!document.body.classList.contains('entered')) return 'Interface não carregou';
    if (reducedMotion.matches) return '';
    // Replay in one renderer turn; a loaded machine may have finished the original animation already.
    document.body.classList.remove('entering'); void document.querySelector('.controls').offsetWidth;
    document.body.classList.add('entering');
    return getComputedStyle(document.querySelector('.controls')).animationName === 'panel-enter' ? '' : 'Entrada suave ausente';
  })()`);
  if (entranceError) throw new Error(entranceError);
  publish({ gameRunning: true });
  if (window.isVisible()) throw new Error('Launcher não se escondeu ao abrir o jogo.');
  gameWindow.reveal();
  window.close();
  if (window.isDestroyed() || window.isVisible()) throw new Error('Fechar a janela durante o jogo não a escondeu.');
  gameWindow.reveal();
  await window.webContents.executeJavaScript(`document.querySelector('#close').click()`);
  await new Promise(resolve => setTimeout(resolve, 100));
  if (window.isDestroyed() || window.isVisible()) throw new Error('O X durante o jogo não escondeu o launcher.');
  publish({ gameRunning: false });
  if (!window.isVisible()) throw new Error('Launcher não voltou ao fechar o jogo.');
  const report = await window.webContents.executeJavaScript(`(async () => {
    const check = (value, message) => { if (!value) throw new Error(message); };
    const modes = [...document.querySelectorAll('[name="mode"]')];
    check(!document.querySelector('#landscape').checked, 'Paisagem deve vir desmarcada');
    check(document.querySelector('.landscape-choice').textContent.includes('baixar paisagem do voxy do servidor'), 'Texto da paisagem');
    check(typeof window.hollow.landscape === 'function', 'Download opcional indisponível');
    check(current.landscapeInfo?.kind==='voxy' && document.querySelector('#landscape-size').textContent.includes('4,36 GB'), 'Tamanho do LOD do Voxy incorreto');
    for (let i=0;i<16;i++) { modes[i%2].click(); check(modes.filter(item=>item.checked).length===1,'Seletores de conta'); }
    modes[0].click();
    const slider=document.querySelector('#ram');const expectedRam=Math.min(13,Number(slider.max));slider.value=String(expectedRam);slider.dispatchEvent(new Event('input',{bubbles:true}));check(document.querySelector('#ram-value').textContent===expectedRam+' GB','Memória');slider.value='6';slider.dispatchEvent(new Event('input',{bubbles:true}));
    const logo=document.querySelector('.logo');const animation=logo.getAnimations()[0];check(animation,'Animação ausente');animation.pause();animation.currentTime=0;const first=new DOMMatrixReadOnly(getComputedStyle(logo).transform);animation.currentTime=4000;const middle=new DOMMatrixReadOnly(getComputedStyle(logo).transform);check(Math.abs(middle.m42-first.m42)>=13,'Flutuação vertical muito pequena');check(Math.abs(middle.m41-first.m41)>=5,'Movimento lateral muito pequeno');check(first.m12<0 && middle.m12>0,'Inclinação da logo ausente');animation.currentTime=8000;const last=new DOMMatrixReadOnly(getComputedStyle(logo).transform);check(Math.abs(last.m42-first.m42)<.01,'Salto no reinício da animação');animation.play();
    check(await document.fonts.load('700 16px Monocraft').then(fonts=>fonts.length>0),'Fonte não carregada');
    check(typeof require==='undefined' && typeof process==='undefined','Node exposto à interface');
    check(document.querySelector('#reset').offsetWidth>0,'Botão reset');
    const wait = ms=>new Promise(resolve=>setTimeout(resolve,ms));
    document.querySelector('#reset').click();check(document.querySelector('#confirm-reset').open,'Confirmação reset');document.querySelector('#cancel-reset').click();await wait(200);check(!document.querySelector('#confirm-reset').open,'Cancelar reset');
    await wait(850);const box=document.querySelector('.account-input').getBoundingClientRect();
    for(let i=0;i<12;i++) modes[i%2].click();await wait(280);const nextBox=document.querySelector('.account-input').getBoundingClientRect();check(Math.abs(box.x-nextBox.x)<.1 && Math.abs(box.y-nextBox.y)<.1 && Math.abs(box.width-nextBox.width)<.1,'Troca de conta deslocou o layout');
    check(getComputedStyle(document.querySelector('.controls')).opacity==='1' && !document.body.classList.contains('entering'),'Entrada não terminou');
    document.querySelector('#reset').click();await wait(250);document.querySelector('#confirm-reset').dispatchEvent(new Event('cancel',{cancelable:true}));await wait(200);check(!document.querySelector('#confirm-reset').open,'Escape durante animação');
    return ['16 trocas de conta: OK','Memória sincronizada: OK','Animação CSS ativa: OK','Fonte incorporada: OK','Interface sem Node: OK','Confirmação e cancelamento de reset: OK','Motion: entrada, trocas rápidas sem deslocamento e Escape nos avisos: OK'];
  })().catch(error => ({ smokeError: error.stack || String(error) }))`);
  if (report.smokeError) throw new Error(report.smokeError);
  const { memoryLimits, GIB } = require('../core/memory.cjs');
  const actualMemory = engine.memory;
  try {
    engine.memory = memoryLimits(8 * GIB);
    publish({ memory: engine.memory });
    await window.webContents.executeJavaScript(`(async () => {
      const slider=document.querySelector('#ram');
      slider.value='24';slider.dispatchEvent(new Event('input',{bubbles:true}));
      if(slider.max!=='6' || slider.value!=='6' || document.querySelector('#ram-value').textContent!=='6 GB' || document.querySelector('#ram-hardware').textContent!=='PC: 8 GB') throw Error('Limite real de RAM não foi aplicado');
      clearTimeout(saveTimer);
      const response=await window.hollow.save({...options(),ram:24});
      if(response.ok || !response.error.includes('2 a 6 GB')) throw Error('IPC aceitou memória maior que o limite real');
    })()`);
    await fs.writeFile(path.join(output, 'memory-8gb.png'), (await window.webContents.capturePage()).toPNG());
    engine.memory = memoryLimits(64 * GIB);
    publish({ memory: engine.memory });
    await window.webContents.executeJavaScript(`(() => {
      const slider=document.querySelector('#ram');slider.value='40';slider.dispatchEvent(new Event('input',{bubbles:true}));clearTimeout(saveTimer);
      if(slider.max!=='48' || slider.value!=='40' || document.querySelector('#ram-value').textContent!=='40 GB') throw Error('RAM ainda limitada a 24 GB no PC de 64 GB');
    })()`);
  } finally {
    engine.memory = actualMemory;
    publish({ memory: actualMemory });
    await window.webContents.executeJavaScript(`document.querySelector('#ram').value='6';clearTimeout(saveTimer);render();`);
  }
  report.push('RAM real: PC de 8 GB limitado a 6 GB; PC de 64 GB aceita 40 GB; IPC recusa limite adulterado: OK');
  await window.webContents.executeJavaScript(`(async () => {
    const audio = music.audio;
    await Promise.race([new Promise((resolve, reject) => {
      if (audio.readyState >= 1) return resolve();
      audio.addEventListener('loadedmetadata', resolve, { once: true });
      audio.addEventListener('error', () => reject(new Error('MP3 não decodifica')), { once: true });
      audio.load();
    }), new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout do MP3')), 10000))]);
    if (!(audio.duration > 0) || audio.volume !== .25 || !audio.loop) throw new Error('Áudio inválido');
    music.setAllowed(false);
    const previous = music.muted;
    document.querySelector('#music-toggle').click();
    if (music.muted === previous || localStorage.getItem('averon.music.muted') !== String(music.muted)) throw new Error('Mudo não foi salvo');
    document.querySelector('#music-toggle').click();
    if (!audio.paused) throw new Error('Música tocando enquanto pausada');
  })()`);
  report.push('MP3 incorporado decodifica; volume 25%, loop e botão de mudo persistente: OK');
  publish({ launchFailure: { id: 'smoke-launch-failure', title: 'O Minecraft encerrou', message: 'Erro de inicialização de teste' } });
  await window.webContents.executeJavaScript(`if (!document.querySelector('#message').open || document.querySelector('#message-open-logs').hidden || typeof window.hollow.openLogs !== 'function') throw Error('Diagnóstico de abertura não apareceu'); document.querySelector('#message-ok').click();`);
  await new Promise(resolve => setTimeout(resolve, 250));
  publish({ launchFailure: { id: 'smoke-launch-failure', message: 'Erro de inicialização de teste' } });
  await window.webContents.executeJavaScript(`if (document.querySelector('#message').open) throw Error('Diagnóstico repetido');`);
  publish({ launchFailure: null });
  report.push('Falha ao abrir Minecraft mostra aviso e Abrir logs, sem repetir a cada atualização de estado: OK');
  await window.webContents.executeJavaScript(`(async () => {
    window.landscapeChoiceTestCalls = 0;
    window.landscapeChoiceOperation = async () => {
      window.landscapeChoiceTestCalls++;
      if (window.landscapeChoiceTestCalls === 1) return { ok:false, code:'LANDSCAPE_SELECTION_REQUIRED', choices:[{name:'Hollow SMP',address:'hollowsmp.com.br',directory:'hollowsmp.com.br'},{name:'Averon SMP',address:'hollowsmp.com.br:25565',directory:'hollowsmp.com.br_25565'}] };
      window.landscapeChosenForTest = options().landscapeDirectory;
      return {ok:true};
    };
    await execute(window.landscapeChoiceOperation);
    if (!document.querySelector('#landscape-select').open || document.querySelector('#landscape-server').options.length !== 2) throw Error('Seleção de cadastro da paisagem não abriu');
  })()`);
  await window.webContents.executeJavaScript(`Promise.allSettled(document.querySelector('#landscape-select').getAnimations().map(animation => animation.finished))`);
  await fs.writeFile(path.join(output, 'landscape-selection.png'), (await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript(`(async () => {
    document.querySelector('#landscape-server').value='hollowsmp.com.br_25565';
    document.querySelector('#landscape-confirm').click();
    await new Promise(resolve=>setTimeout(resolve,50));
    if (window.landscapeChoiceTestCalls !== 2 || window.landscapeChosenForTest !== 'hollowsmp.com.br_25565' || document.querySelector('#landscape-select').open) throw Error('Escolha da paisagem não retomou a operação');
    window.landscapeChoiceTestCalls=0;
    await execute(window.landscapeChoiceOperation);
    document.querySelector('#landscape-cancel').click();
    await new Promise(resolve=>setTimeout(resolve,250));
    if (window.landscapeChoiceTestCalls !== 1 || document.querySelector('#landscape-select').open) throw Error('Cancelar paisagem iniciou download');
  })()`);
  report.push('Cadastros duplicados: escolha explícita retoma a operação na pasta selecionada; Cancelar não baixa: OK');
  report.push('Fechamento nativo e X escondem durante o jogo; janela preservada e restaurada ao encerrar: OK');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Criptografia Windows indisponível no teste.');
  const protectedToken = safeStorage.encryptString('hollow-test-token');
  if (protectedToken.includes(Buffer.from('hollow-test-token')) || safeStorage.decryptString(protectedToken) !== 'hollow-test-token') throw new Error('Proteção da sessão falhou.');
  report.push('Criptografia Windows de sessão: OK');
  publish({ authPending: true, busy: true, account: { name: 'AveronTeste' } });
  await window.webContents.executeJavaScript(`document.querySelector('[value="microsoft"]').checked=true; render(); if(document.querySelector('#cancel-login').hidden || document.querySelector('#account-note').textContent!=='AveronTeste') throw new Error('Controles do login Microsoft');`);
  publish({ authPending: false, busy: false, account: null });
  report.push('Nome de conta e cancelamento Microsoft: OK');
  publish({ busy: true, ready: false, text: 'Preparando…' });
  publish({ text: 'Instalação concluída.', percent: 100 });
  await window.webContents.executeJavaScript(`if(!document.querySelector('.progress-area').classList.contains('finishing') || document.querySelector('#progress').value!==100) throw new Error('Confirmação visual de conclusão');`);
  publish({ busy: false, ready: true, text: '', percent: null });
  await new Promise(resolve=>setTimeout(resolve,1900));
  await window.webContents.executeJavaScript(`if(!document.querySelector('.progress-area').hidden) throw new Error('Conclusão ficou presa na tela');`);
  // Browser emulation verifies reduced motion without changing the user's Windows settings.
  await window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await window.webContents.executeJavaScript(`(async()=>{document.querySelector('[value="nickname"]').click(); document.querySelector('#reset').click(); document.querySelector('#cancel-reset').click(); if(document.querySelector('#confirm-reset').open || getComputedStyle(document.querySelector('.logo')).animationName!=='none') throw new Error('Preferência por movimento reduzido');})()`);
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
  window.webContents.debugger.detach();
  await window.webContents.executeJavaScript(`if(getComputedStyle(document.querySelector('.controls')).opacity!=='1' || getComputedStyle(document.querySelector('.brand')).opacity!=='1') throw new Error('Interface sumiu ao trocar preferência de movimento');`);
  publish({ busy: false, ready: false, text: '', percent: null, account: null });
  report.push('Motion: conclusão sem travar controles e preferência por movimento reduzido: OK');
  publish({ server: { kind: 'online', players: 3, maxPlayers: 100, ping: 23, checking: false } });
  await window.webContents.executeJavaScript(`(async()=>{ const art = new Image(); art.src='../assets/end-background.png'; await art.decode(); if(art.naturalWidth<1000 || document.querySelectorAll('.end-particle').length!==18) throw new Error('Cenário e partículas'); if(!document.querySelector('#server-details').textContent.includes('3/100 jogadores · 23 ms')) throw new Error('Contagem e ping'); const button=document.querySelector('#play'), rect=button.getBoundingClientRect(); if(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)!==button) throw new Error('Atmosfera bloqueou botão'); })()`);
  publish({ busy: true });
  await new Promise(resolve=>setTimeout(resolve,700));
  await window.webContents.executeJavaScript(`if(!document.querySelector('.brand').classList.contains('preparing') || Number(getComputedStyle(document.querySelector('.brand'),'::before').opacity)<.1) throw new Error('Portal não reagiu à preparação');`);
  publish({ busy: false, server: { kind: 'unknown', players: null, maxPlayers: null, ping: null, checking: false } });
  await window.webContents.executeJavaScript(`if(document.querySelector('#server-details').textContent.includes('3/100') || document.querySelector('.brand').classList.contains('preparing')) throw new Error('Estado antigo permaneceu na interface');`);
  report.push('End: cenário carregado, partículas sem bloquear controles, portal reativo e status/ping sem dados inventados: OK');
  publish({ busy: false, ready: false, gameRunning: false, text: '', percent: null, server: { kind: 'online', players: 0, maxPlayers: 20, ping: 19, checking: false } });
  publish({ update: { kind: 'downloading', version: '2.2.1', percent: 45 } });
  await window.webContents.executeJavaScript(`if(document.querySelector('#launcher-update').textContent!=='Atualizando 45%' || !document.querySelector('#launcher-update').disabled || document.querySelector('#play').disabled) throw new Error('Download de atualização bloqueou o jogo');`);
  publish({ update: { kind: 'ready', version: '2.2.1' }, busy: true });
  await window.webContents.executeJavaScript(`if(!document.querySelector('#launcher-update').disabled) throw new Error('Atualização liberada durante preparação');`);
  publish({ busy: false, updating: true });
  await window.webContents.executeJavaScript(`if(!document.querySelector('#play').disabled || !document.querySelector('#reset').disabled) throw new Error('Instalação de atualização não bloqueou controles');`);
  publish({ updating: false, update: { kind: 'error' } });
  await window.webContents.executeJavaScript(`if(document.querySelector('#play').disabled || document.querySelector('#launcher-update').textContent!=='Tentar atualização') throw new Error('Falha de atualização bloqueou o jogo');`);
  publish({ update: { kind: 'current' } });
  report.push('Atualizações: download sem bloquear jogo, aplicação bloqueada durante preparação e falha com nova tentativa: OK');
  resizeWindow(380, 440);
  publish({ startup: { visible: true, kind: 'checking' } });
  await window.webContents.executeJavaScript(`if(document.querySelector('#startup-update').hidden || !document.querySelector('header').inert || !document.querySelector('main').inert) throw new Error('Tela inicial não protege os controles');`);
  await new Promise(resolve => setTimeout(resolve, 250));
  await window.webContents.executeJavaScript(`if(innerWidth!==380 || innerHeight!==440) throw new Error('Janela inicial não ficou compacta');`);
  await fs.writeFile(path.join(output, 'startup-checking.png'), (await window.webContents.capturePage()).toPNG());
  publish({ startup: { visible: true, kind: 'downloading', version: '2.2.3', percent: 42 } });
  await window.webContents.executeJavaScript(`if(document.querySelector('#startup-progress').value!==42 || !document.querySelector('#startup-note').textContent.includes('42%')) throw new Error('Progresso da tela inicial'); const rect=document.querySelector('.startup-card').getBoundingClientRect(); if(rect.x<0 || rect.right>innerWidth || rect.y<0 || rect.bottom>innerHeight) throw new Error('Tela inicial fora da janela');`);
  await new Promise(resolve => setTimeout(resolve, 150));
  await fs.writeFile(path.join(output, 'startup-download.png'), (await window.webContents.capturePage()).toPNG());
  publish({ updating: true, startup: { visible: true, kind: 'installing' } });
  await window.webContents.executeJavaScript(`if(!document.querySelector('#startup-close').disabled || document.querySelector('#startup-title').textContent!=='Aplicando atualização…') throw new Error('Aplicação na tela inicial');`);
  publish({ updating: false, startup: { visible: false }, update: { kind: 'current' } });
  resizeWindow(920, 530);
  await new Promise(resolve => setTimeout(resolve, 150));
  await window.webContents.executeJavaScript(`if(innerWidth!==920 || innerHeight!==530) throw new Error('Launcher não voltou ao tamanho normal');`);
  await window.webContents.executeJavaScript(`if(!document.querySelector('#startup-update').hidden || document.querySelector('main').inert) throw new Error('Tela inicial não liberou o launcher');`);
  report.push('Tela inicial compacta: controles protegidos, progresso alinhado, aplicação automática e abertura do launcher: OK');
  // Exercise the real reset IPC and filesystem in the isolated smoke root, without game downloads.
  const originalInstall = engine.install, originalJavaRunning = engine.javaRunning;
  engine.install = async () => {};
  engine.javaRunning = async () => false;
  const resetRam = Math.min(9, engine.memory.maximumGB);
  const playerOptions = 'renderDistance:14\nmouseSensitivity:0.65\nkey_key.forward:key.keyboard.up\n';
  await fs.mkdir(path.join(engine.game, 'config'), { recursive: true });
  await fs.writeFile(path.join(engine.game, 'options.txt'), playerOptions);
  await fs.writeFile(path.join(engine.game, 'config', 'client.json'), '{"sentinel":true}');
  try {
    for (const remember of [true, false]) {
      await window.webContents.executeJavaScript(`document.querySelector('[value="nickname"]').click(); document.querySelector('#nickname').value='TypedAveron'; document.querySelector('#nickname').dispatchEvent(new Event('input')); document.querySelector('#ram').value='${resetRam}'; document.querySelector('#remember').checked=${remember}; document.querySelector('#reset').click(); document.querySelector('#do-reset').click();`);
      let finished = false;
      for (let i = 0; i < 100; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (await window.webContents.executeJavaScript(`document.querySelector('#message').open`)) { finished = true; break; }
      }
      if (!finished) throw new Error('Reset não terminou no smoke');
      await window.webContents.executeJavaScript(`if(document.querySelector('#nickname').value!=='TypedAveron' || document.querySelector('#ram').value!=='${resetRam}' || document.querySelector('#remember').checked!==${remember} || !document.querySelector('#message-text').textContent.includes('preservados')) throw new Error('Reset perdeu preferências ou falhou'); document.querySelector('#message').close();`);
      const saved = await engine.loadSettings();
      if (saved.nickname !== (remember ? 'TypedAveron' : '') || saved.ram !== resetRam || saved.remember !== remember) throw new Error('Preferências salvas após reset incorretas');
      if (await fs.readFile(path.join(engine.game, 'options.txt'), 'utf8') !== playerOptions) throw new Error('Reset perdeu opções do jogo');
      if (await fs.readFile(path.join(engine.game, 'config', 'client.json'), 'utf8') !== '{"sentinel":true}') throw new Error('Reset perdeu configuração do mod');
    }
  } finally { engine.install = originalInstall; engine.javaRunning = originalJavaRunning; }
  report.push('Reset real isolado: nickname recém-digitado, RAM, lembrar nickname, teclas, vídeo e config de mod preservados: OK');
  publish({ ready: true });
  await window.webContents.executeJavaScript(`document.querySelector('[value="nickname"]').click(); document.querySelector('#nickname').value='Aventureiro'; document.querySelector('#ram').value='6'; document.querySelector('#remember').checked=true; render()`);
  await new Promise(resolve=>setTimeout(resolve,800));
  await fs.writeFile(path.join(output, 'nickname.png'), (await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript(`document.querySelector('[value="microsoft"]').click()`);
  await new Promise(resolve => setTimeout(resolve, 100));
  await fs.writeFile(path.join(output, 'microsoft.png'), (await window.webContents.capturePage()).toPNG());
  if (errors.length) throw new Error(errors.join('\n'));
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  app.exit(0);
}

module.exports = { smokeUi };
