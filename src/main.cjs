'use strict';
const { app, BrowserWindow, ipcMain, shell, Tray, Menu, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { Engine, validateOptions, exists } = require('./engine.cjs');
const { GameWindow } = require('./game-window.cjs');
const { MicrosoftAuth } = require('./microsoft-auth.cjs');

const smoke = process.argv.includes('--smoke-ui');
const integration = process.argv.includes('--verify-engine');
const verifyRootIndex = process.argv.indexOf('--test-root');
const verifyOutputIndex = process.argv.indexOf('--test-output');
if (smoke) app.disableHardwareAcceleration();
let window, engine, tray, microsoft;
const gameWindow = new GameWindow(() => window);
const state = { busy: false, ready: false, gameRunning: false, text: '', percent: null };
const pagePath = path.join(__dirname, '..', 'renderer', 'index.html');
if ((smoke || integration) && verifyRootIndex >= 0) app.setPath('userData', path.join(path.dirname(path.resolve(process.argv[verifyRootIndex + 1])), 'electron-test-profile'));

if (!smoke && !integration && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => gameWindow.reveal());

function publish(update) {
  const wasRunning = state.gameRunning;
  Object.assign(state, update);
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
  if (state.busy) throw new Error('Aguarde a preparação terminar.');
  publish({ busy: true, text: 'Preparando…', percent: null });
  try { return await operation(); }
  finally { publish({ busy: false, ready: await engine.ready(), text: '', percent: null }); }
}
function registerHandlers() {
  ipcMain.handle('launcher:state', async event => { trusted(event); return { ...state, account: await microsoft.publicAccount(), ready: await engine.ready(), settings: await engine.loadSettings(), version: app.getVersion() }; });
  ipcMain.handle('launcher:save', async (event, options) => {
    trusted(event);
    return result(async () => { if (state.busy) return {}; await engine.saveSettings(options); return {}; });
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
      // A first installation can outlast a short session. Refresh before launching.
      const identity = account ? await microsoft.authenticate() : undefined;
      const pid = await engine.launch(identity?.name || selected.nickname, selected.ram, identity);
      publish({ gameRunning: true });
      return { pid };
    }));
  });
  ipcMain.handle('launcher:reset', async event => {
    trusted(event);
    return result(() => prepare(async () => {
      if (state.gameRunning) throw new Error('Feche o Minecraft antes de resetar.');
      publish({ text: 'Limpando a instalação…' });
      await engine.reset();
      microsoft.session = null;
      publish({ account: null });
      await engine.install();
      return { settings: await engine.loadSettings(), message: 'Instalação renovada. Clique em Jogar e entre no servidor para receber o modpack.' };
    }));
  });
  ipcMain.handle('launcher:logout', async event => { trusted(event); return result(async () => {
    if (state.busy || state.gameRunning) throw new Error('Feche o jogo e aguarde a preparação para sair da conta.');
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
  publish({ gameRunning: true });
  if (window.isVisible()) throw new Error('Launcher não se escondeu ao abrir o jogo.');
  publish({ gameRunning: false });
  if (!window.isVisible()) throw new Error('Launcher não voltou ao fechar o jogo.');
  const report = await window.webContents.executeJavaScript(`(async () => {
    const check = (value, message) => { if (!value) throw new Error(message); };
    const modes = [...document.querySelectorAll('[name="mode"]')];
    for (let i=0;i<16;i++) { modes[i%2].click(); check(modes.filter(item=>item.checked).length===1,'Seletores de conta'); }
    modes[0].click();
    const slider=document.querySelector('#ram');slider.value='13';slider.dispatchEvent(new Event('input',{bubbles:true}));check(document.querySelector('#ram-value').textContent==='13 GB','Memória');slider.value='6';slider.dispatchEvent(new Event('input',{bubbles:true}));
    const logo=document.querySelector('.logo');const animation=logo.getAnimations()[0];check(animation,'Animação ausente');animation.pause();animation.currentTime=0;const first=new DOMMatrixReadOnly(getComputedStyle(logo).transform);animation.currentTime=4000;const middle=new DOMMatrixReadOnly(getComputedStyle(logo).transform);check(Math.abs(middle.m42-first.m42)>=13,'Flutuação vertical muito pequena');check(Math.abs(middle.m41-first.m41)>=5,'Movimento lateral muito pequeno');check(first.m12<0 && middle.m12>0,'Inclinação da logo ausente');animation.currentTime=8000;const last=new DOMMatrixReadOnly(getComputedStyle(logo).transform);check(Math.abs(last.m42-first.m42)<.01,'Salto no reinício da animação');animation.play();
    check(await document.fonts.load('700 16px Monocraft').then(fonts=>fonts.length>0),'Fonte não carregada');
    check(typeof require==='undefined' && typeof process==='undefined','Node exposto à interface');
    check(document.querySelector('#reset').offsetWidth>0,'Botão reset');
    document.querySelector('#reset').click();check(document.querySelector('#confirm-reset').open,'Confirmação reset');document.querySelector('#cancel-reset').click();check(!document.querySelector('#confirm-reset').open,'Cancelar reset');
    return ['16 trocas de conta: OK','Memória sincronizada: OK','Animação CSS ativa: OK','Fonte incorporada: OK','Interface sem Node: OK','Confirmação e cancelamento de reset: OK'];
  })()`);
  report.push('Launcher escondido durante o jogo e restaurado ao fechar: OK');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Criptografia Windows indisponível no teste.');
  const protectedToken = safeStorage.encryptString('hollow-test-token');
  if (protectedToken.includes(Buffer.from('hollow-test-token')) || safeStorage.decryptString(protectedToken) !== 'hollow-test-token') throw new Error('Proteção da sessão falhou.');
  report.push('Criptografia Windows de sessão: OK');
  publish({ authPending: true, busy: true, account: { name: 'HollowTeste' } });
  await window.webContents.executeJavaScript(`document.querySelector('[value="microsoft"]').checked=true; render(); if(document.querySelector('#cancel-login').hidden || document.querySelector('#account-note').textContent!=='HollowTeste') throw new Error('Controles do login Microsoft');`);
  publish({ authPending: false, busy: false, account: null });
  report.push('Nome de conta e cancelamento Microsoft: OK');
  await window.webContents.executeJavaScript(`document.querySelector('[value="nickname"]').click()`);
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
    width: 920, height: 530, resizable: false, maximizable: false, frame: false,
    backgroundColor: '#160b22', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'hollow.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, offscreen: smoke, backgroundThrottling: !smoke },
  });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.on('close', event => { if (state.busy) { event.preventDefault(); publish({ text: 'Aguarde a preparação terminar para fechar.' }); } });
  window.on('minimize', () => window.webContents.send('launcher:animation', false));
  window.on('restore', () => window.webContents.send('launcher:animation', true));
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
  if (smoke) await smokeUi(); else window.show();
}).catch(async error => {
  if ((smoke || integration) && verifyOutputIndex >= 0) {
    const output = path.resolve(process.argv[verifyOutputIndex + 1]); await fs.mkdir(output, { recursive: true }); await fs.writeFile(path.join(output, 'error.txt'), error.stack || String(error));
  }
  console.error(error);
  app.exit(1);
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { microsoft?.cancel(); });
