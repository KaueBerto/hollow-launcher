'use strict';
const { app, BrowserWindow, ipcMain, shell, Tray, Menu, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { Engine, validateOptions, SERVER } = require('./engine.cjs');
const { GameWindow } = require('./game-window.cjs');
const { MicrosoftAuth } = require('./microsoft-auth.cjs');
const { queryServer, ServerMonitor } = require('./server-status.cjs');
const { DiscordPresence } = require('./discord-presence.cjs');
const discordConfig = require('./discord-config.cjs');
const { LauncherUpdate } = require('./launcher-update.cjs');
const { installLandscape } = require('./landscape.cjs');

const smoke = process.argv.includes('--smoke-ui');
const integration = process.argv.includes('--verify-engine');
const verifyRootIndex = process.argv.indexOf('--test-root');
const verifyOutputIndex = process.argv.indexOf('--test-output');
if (smoke) app.disableHardwareAcceleration();
let window, engine, tray, microsoft, serverMonitor;
let discordPresence, launcherUpdate, quitting = false;
const gameWindow = new GameWindow(() => window);
const state = { busy: false, ready: false, gameRunning: false, text: '', percent: null, startup: { visible: !smoke, kind: 'checking' } };
const pagePath = path.join(__dirname, '..', 'renderer', 'index.html');
if ((smoke || integration) && verifyRootIndex >= 0) app.setPath('userData', path.join(path.dirname(path.resolve(process.argv[verifyRootIndex + 1])), 'electron-test-profile'));

if (!smoke && !integration && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => gameWindow.reveal());

function resizeWindow(width, height) {
  // Windows constrains a non-resizable window to its current size.
  window.setResizable(true); window.setSize(width, height); window.setResizable(false);
}

function publish(update) {
  const wasRunning = state.gameRunning;
  Object.assign(state, update);
  if (update.startup && window && !window.isDestroyed() && !smoke) {
    const [width] = window.getSize();
    const desired = update.startup.visible ? 380 : 920;
    if (width !== desired) { resizeWindow(desired, update.startup.visible ? 440 : 530); window.center(); }
  }
  if (!wasRunning && state.gameRunning) gameWindow.started();
  else if (wasRunning && !state.gameRunning) gameWindow.ended();
  if (window && !window.isDestroyed()) window.webContents.send('launcher:changed', state);
}
function trusted(event) {
  if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Origem não permitida.');
}
async function result(operation) {
  try { return { ok: true, ...await operation() }; }
  catch (error) {
    try { await fs.mkdir(engine.root, { recursive: true }); await fs.writeFile(path.join(engine.root, 'launcher-error.log'), error.stack || String(error)); } catch {}
    return { ok: false, error: error.message || 'Não foi possível concluir. Tente novamente.' };
  }
}
async function prepare(operation) {
  if (state.busy || state.updating || state.startup?.visible) throw new Error('Aguarde a preparação ou atualização terminar.');
  publish({ busy: true, text: 'Preparando…', percent: null });
  try { return await operation(); }
  finally { publish({ busy: false, ready: await engine.ready(), text: '', percent: null }); }
}
function registerHandlers() {
  ipcMain.handle('launcher:landscape', async (event, options) => {
    trusted(event);
    return result(() => prepare(async () => {
      if (state.gameRunning || engine.gameProcess) throw new Error('Feche o Minecraft antes de baixar a paisagem.');
      await engine.saveSettings(options, { requireNickname: false });
      const installed = await installLandscape(engine);
      return { message: installed.alreadyInstalled ? 'Essa paisagem já está instalada.' : 'Paisagem instalada. O Distant Horizons continua com a opção de ativação que você escolheu.' };
    }));
  });
  ipcMain.handle('launcher:update-check', async event => { trusted(event); return result(async () => { await launcherUpdate?.boot(); return {}; }); });
  ipcMain.handle('launcher:update-install', async event => { trusted(event); return result(async () => { await launcherUpdate?.install(); return {}; }); });
  ipcMain.handle('launcher:server-refresh', async event => { trusted(event); if (!smoke) await serverMonitor.refresh(true); return { ok: true }; });
  ipcMain.handle('launcher:state', async event => { trusted(event); return { ...state, account: await microsoft.publicAccount(), ready: await engine.ready(), settings: await engine.loadSettings(), version: app.getVersion() }; });
  ipcMain.handle('launcher:save', async (event, options) => {
    trusted(event);
    return result(async () => { if (state.busy || state.updating || state.startup?.visible) return {}; await engine.saveSettings(options); return {}; });
  });
  ipcMain.handle('launcher:play', async (event, options) => {
    trusted(event);
    return result(() => prepare(async () => {
      const selected = validateOptions(options);
      if (state.gameRunning || engine.gameProcess) throw new Error('O Minecraft já está aberto.');
      await engine.saveSettings(selected);
      const account = selected.mode === 'microsoft' ? await microsoft.authenticate() : undefined;
      publish({ account: await microsoft.publicAccount() });
      if (!await engine.ready()) await engine.install();
      if (selected.landscape) await installLandscape(engine);
      // A first installation can outlast a short session. Refresh before launching.
      const identity = account ? await microsoft.authenticate() : undefined;
      const pid = await engine.launch(identity?.name || selected.nickname, selected.ram, identity);
      publish({ gameRunning: true });
      return { pid };
    }));
  });
  ipcMain.handle('launcher:reset', async (event, options) => {
    trusted(event);
    return result(() => prepare(async () => {
      if (state.gameRunning) throw new Error('Feche o Minecraft antes de resetar.');
      const selected = validateOptions(options, { requireNickname: false });
      publish({ text: 'Limpando a instalação…' });
      await engine.reset();
      await engine.saveSettings(selected, { requireNickname: false });
      microsoft.session = null;
      publish({ account: null });
      await engine.install();
      return { settings: selected, message: 'Instalação renovada. Nickname, opções, paisagem do Distant Horizons e schematics foram preservados. Clique em Jogar e entre no servidor para receber o modpack.' };
    }));
  });
  ipcMain.handle('launcher:logout', async event => { trusted(event); return result(async () => {
    if (state.busy || state.gameRunning || state.updating || state.startup?.visible) throw new Error('Feche o jogo e aguarde a preparação para sair da conta.');
    await microsoft.logout(); publish({ account: null }); return {};
  }); });
  ipcMain.on('launcher:cancel-login', event => { trusted(event); microsoft.cancel(); });
  ipcMain.on('window:minimize', event => { trusted(event); window.minimize(); });
  ipcMain.on('window:close', event => { trusted(event); if (!state.busy) window.close(); });
}

async function smokeUi() {
  const output = verifyOutputIndex >= 0 ? path.resolve(process.argv[verifyOutputIndex + 1]) : path.join(__dirname, '..', 'dist', 'ui-check');
  await fs.mkdir(output, { recursive: true });
  const errors = [];
  window.webContents.on('console-message', (_event, details) => { if (details.level === 'error') errors.push(details.message); });
  await window.webContents.executeJavaScript(`window.hollowTestReady`);
  window.show();
  await window.webContents.executeJavaScript(`if(!document.body.classList.contains('entered') || getComputedStyle(document.querySelector('.controls')).animationName!=='panel-enter') throw new Error('Entrada suave ausente');`);
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
    check(document.querySelector('.landscape-choice').textContent.includes('baixar paisagem do distant horizons do servidor'), 'Texto da paisagem');
    check(typeof window.hollow.landscape === 'function', 'Download opcional indisponível');
    for (let i=0;i<16;i++) { modes[i%2].click(); check(modes.filter(item=>item.checked).length===1,'Seletores de conta'); }
    modes[0].click();
    const slider=document.querySelector('#ram');slider.value='13';slider.dispatchEvent(new Event('input',{bubbles:true}));check(document.querySelector('#ram-value').textContent==='13 GB','Memória');slider.value='6';slider.dispatchEvent(new Event('input',{bubbles:true}));
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
  })()`);
  report.push('Fechamento nativo e X escondem durante o jogo; janela preservada e restaurada ao encerrar: OK');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Criptografia Windows indisponível no teste.');
  const protectedToken = safeStorage.encryptString('hollow-test-token');
  if (protectedToken.includes(Buffer.from('hollow-test-token')) || safeStorage.decryptString(protectedToken) !== 'hollow-test-token') throw new Error('Proteção da sessão falhou.');
  report.push('Criptografia Windows de sessão: OK');
  publish({ authPending: true, busy: true, account: { name: 'HollowTeste' } });
  await window.webContents.executeJavaScript(`document.querySelector('[value="microsoft"]').checked=true; render(); if(document.querySelector('#cancel-login').hidden || document.querySelector('#account-note').textContent!=='HollowTeste') throw new Error('Controles do login Microsoft');`);
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
  const playerOptions = 'renderDistance:14\nmouseSensitivity:0.65\nkey_key.forward:key.keyboard.up\n';
  await fs.mkdir(path.join(engine.game, 'config'), { recursive: true });
  await fs.writeFile(path.join(engine.game, 'options.txt'), playerOptions);
  await fs.writeFile(path.join(engine.game, 'config', 'client.json'), '{"sentinel":true}');
  try {
    for (const remember of [true, false]) {
      await window.webContents.executeJavaScript(`document.querySelector('[value="nickname"]').click(); document.querySelector('#nickname').value='TypedHollow'; document.querySelector('#nickname').dispatchEvent(new Event('input')); document.querySelector('#ram').value='9'; document.querySelector('#remember').checked=${remember}; document.querySelector('#reset').click(); document.querySelector('#do-reset').click();`);
      let finished = false;
      for (let i = 0; i < 100; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (await window.webContents.executeJavaScript(`document.querySelector('#message').open`)) { finished = true; break; }
      }
      if (!finished) throw new Error('Reset não terminou no smoke');
      await window.webContents.executeJavaScript(`if(document.querySelector('#nickname').value!=='TypedHollow' || document.querySelector('#ram').value!=='9' || document.querySelector('#remember').checked!==${remember} || !document.querySelector('#message-text').textContent.includes('preservados')) throw new Error('Reset perdeu preferências ou falhou'); document.querySelector('#message').close();`);
      const saved = await engine.loadSettings();
      if (saved.nickname !== (remember ? 'TypedHollow' : '') || saved.ram !== 9 || saved.remember !== remember) throw new Error('Preferências salvas após reset incorretas');
      if (await fs.readFile(path.join(engine.game, 'options.txt'), 'utf8') !== playerOptions) throw new Error('Reset perdeu opções do jogo');
      if (await fs.readFile(path.join(engine.game, 'config', 'client.json'), 'utf8') !== '{"sentinel":true}') throw new Error('Reset perdeu configuração do mod');
    }
  } finally { engine.install = originalInstall; engine.javaRunning = originalJavaRunning; }
  report.push('Reset real isolado: nickname recém-digitado, RAM, lembrar nickname, teclas, vídeo e config de mod preservados: OK');
  await window.webContents.executeJavaScript(`document.querySelector('[value="nickname"]').click()`);
  await new Promise(resolve=>setTimeout(resolve,800));
  await fs.writeFile(path.join(output, 'nickname.png'), (await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript(`document.querySelector('[value="microsoft"]').click()`);
  await new Promise(resolve => setTimeout(resolve, 100));
  await fs.writeFile(path.join(output, 'microsoft.png'), (await window.webContents.capturePage()).toPNG());
  if (errors.length) throw new Error(errors.join('\n'));
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  app.exit(0);
}

app.whenReady().then(async () => {
  const testRoot = (smoke || integration) && verifyRootIndex >= 0 ? path.resolve(process.argv[verifyRootIndex + 1]) : undefined;
  if ((smoke || integration) && !testRoot) throw new Error('As verificações exigem --test-root para isolar os dados do jogador.');
  engine = new Engine({ root: testRoot, assets: app.isPackaged ? path.join(process.resourcesPath, 'assets') : path.join(__dirname, '..', 'assets'), report: update => publish(update) });
  microsoft = new MicrosoftAuth({ root: engine.root, storage: safeStorage, openBrowser: url => shell.openExternal(url), report: publish });
  if (integration) {
    await engine.install();
    await engine.buildArguments('HollowTeste', 4);
    await fs.writeFile(path.join(engine.root, 'electron-verified.txt'), 'Instalação e argumentos do motor JavaScript: OK\n');
    app.exit(0); return;
  }
  registerHandlers();
  window = new BrowserWindow({
    width: smoke ? 920 : 380, height: smoke ? 530 : 440, resizable: false, maximizable: false, frame: false,
    backgroundColor: '#160b22', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'hollow.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, offscreen: smoke, backgroundThrottling: !smoke },
  });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.on('close', event => {
    if ((state.busy || state.updating) && !quitting) {
      event.preventDefault(); publish({ text: 'Aguarde a preparação terminar para fechar.' });
      return;
    }
    gameWindow.closeRequested(event, { running: state.gameRunning || Boolean(engine.gameProcess), quitting });
  });
  window.on('minimize', () => window.webContents.send('launcher:animation', false));
  window.on('restore', () => window.webContents.send('launcher:animation', true));
  serverMonitor = new ServerMonitor({ query: () => { const [host, port] = SERVER.split(':'); return queryServer({ host, port: Number(port) }); }, report: server => publish({ server }), visible: () => window && !window.isDestroyed() && window.isVisible() && !window.isMinimized() });
  window.on('show', () => { if (!smoke) serverMonitor.refresh(); });
  window.on('restore', () => { if (!smoke) serverMonitor.refresh(); });
  if (!smoke) {
    tray = new Tray(path.join(__dirname, '..', 'assets', 'hollow.ico'));
    tray.setToolTip('Hollow SMP — Launcher');
    tray.on('double-click', () => gameWindow.reveal());
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Mostrar launcher', click: () => gameWindow.reveal() },
      { type: 'separator' },
      { label: 'Sair', click: () => { if (!state.busy) app.quit(); } },
    ]));
  }
  await window.loadFile(pagePath);
  if (smoke) await new Promise(resolve => setTimeout(resolve, 300));
  if (smoke) await smokeUi(); else {
    window.show(); serverMonitor.start();
    discordPresence = new DiscordPresence({ applicationId: discordConfig.applicationId });
    discordPresence.start();
    launcherUpdate = new LauncherUpdate({
      updater: require('electron-updater').autoUpdater,
      enabled: app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR,
      report: publish,
      active: () => state.busy || state.gameRunning || Boolean(engine.gameProcess),
      gamePids: () => engine.hollowGamePids(),
      beforeInstall: async () => { await discordPresence?.stop(); serverMonitor.stop(); quitting = true; },
      failedInstall: () => { quitting = false; serverMonitor.start(); discordPresence.start(); },
    });
    publish({ update: launcherUpdate.state });
    void launcherUpdate.boot().finally(() => { if (!launcherUpdate.installing) launcherUpdate.start({ checkNow: false }); });
  }
}).catch(async error => {
  if ((smoke || integration) && verifyOutputIndex >= 0) {
    const output = path.resolve(process.argv[verifyOutputIndex + 1]); await fs.mkdir(output, { recursive: true }); await fs.writeFile(path.join(output, 'error.txt'), error.stack || String(error));
  }
  console.error(error);
  app.exit(1);
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  launcherUpdate?.stop();
  microsoft?.cancel(); serverMonitor?.stop();
  if (discordPresence && !quitting) {
    event.preventDefault(); quitting = true;
    discordPresence.stop().finally(() => app.quit());
  } else quitting = true;
});
