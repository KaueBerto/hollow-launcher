'use strict';
const { app, BrowserWindow, ipcMain, shell, Tray, Menu, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { Engine, SERVER } = require('./engine.cjs');
const { GameWindow } = require('./game-window.cjs');
const { MicrosoftAuth } = require('./microsoft-auth.cjs');
const { queryServer, ServerMonitor } = require('./server-status.cjs');
const { DiscordPresence } = require('./discord-presence.cjs');
const discordConfig = require('./discord-config.cjs');
const { LauncherUpdate } = require('./launcher-update.cjs');

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
    if (error.code === 'LANDSCAPE_SELECTION_REQUIRED') return { ok: false, code: error.code, choices: error.choices };
    try { await fs.mkdir(engine.root, { recursive: true }); await fs.writeFile(path.join(engine.root, 'launcher-error.log'), error.stack || String(error)); } catch {}
    return { ok: false, error: error.message || 'Não foi possível concluir. Tente novamente.' };
  }
}
async function prepare(operation) {
  if (state.busy || state.updating || state.startup?.visible) throw new Error('Aguarde a preparação ou atualização terminar.');
  publish({ busy: true, text: 'Preparando…', percent: null, launchFailure: null });
  try { return await operation(); }
  finally { publish({ busy: false, ready: await engine.ready(), text: '', percent: null }); }
}
app.whenReady().then(async () => {
  const testRoot = (smoke || integration) && verifyRootIndex >= 0 ? path.resolve(process.argv[verifyRootIndex + 1]) : undefined;
  if ((smoke || integration) && !testRoot) throw new Error('As verificações exigem --test-root para isolar os dados do jogador.');
  engine = new Engine({ root: testRoot, assets: app.isPackaged ? path.join(process.resourcesPath, 'assets') : path.join(__dirname, '..', 'assets'), report: update => publish(update) });
  microsoft = new MicrosoftAuth({ root: engine.root, storage: safeStorage, openBrowser: url => shell.openExternal(url), report: publish });
  if (integration) {
    await engine.install();
    await engine.buildArguments('AveronTeste', 4);
    await fs.writeFile(path.join(engine.root, 'electron-verified.txt'), 'Instalação e argumentos do motor JavaScript: OK\n');
    app.exit(0); return;
  }
  require('./ipc.cjs').registerHandlers({ ipcMain, shell, app, engine, microsoft, state, publish, trusted, result, prepare, getWindow: () => window, getUpdater: () => launcherUpdate, getMonitor: () => serverMonitor, smoke });
  window = new BrowserWindow({
    width: smoke ? 920 : 380, height: smoke ? 530 : 440, resizable: false, maximizable: false, frame: false,
    backgroundColor: '#0d120f', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'averon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, autoplayPolicy: 'no-user-gesture-required', offscreen: smoke, backgroundThrottling: !smoke },
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
    tray = new Tray(path.join(__dirname, '..', 'assets', 'averon.ico'));
    tray.setToolTip('AVERON SMP — Launcher');
    tray.on('double-click', () => gameWindow.reveal());
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Mostrar launcher', click: () => gameWindow.reveal() },
      { type: 'separator' },
      { label: 'Sair', click: () => { if (!state.busy) app.quit(); } },
    ]));
  }
  await window.loadFile(pagePath);
  if (smoke) await new Promise(resolve => setTimeout(resolve, 300));
  if (smoke) await require('./diagnostics/ui-smoke.cjs').smokeUi({ window, engine, publish, gameWindow, safeStorage, app, verifyOutputIndex, resizeWindow }); else {
    window.show(); serverMonitor.start();
    discordPresence = new DiscordPresence(discordConfig);
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
