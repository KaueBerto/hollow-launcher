'use strict';
const path = require('node:path');
const { validateOptions } = require('./core/minecraft.cjs');
const { installLandscape } = require('./landscape.cjs');

function registerHandlers({ ipcMain, shell, app, engine, microsoft, state, publish, trusted, result, prepare, getWindow, getUpdater, getMonitor, smoke }) {
  ipcMain.handle('launcher:open-logs', event => { trusted(event); shell.showItemInFolder(path.join(engine.root, 'game-launch.log')); return { ok: true }; });
  ipcMain.handle('launcher:landscape', async (event, options) => {
    trusted(event);
    return result(() => prepare(async () => {
      if (state.gameRunning || engine.gameProcess) throw new Error('Feche o Minecraft antes de baixar a paisagem.');
      await engine.saveSettings(options, { requireNickname: false });
      const installed = await installLandscape(engine, { directory: options?.landscapeDirectory });
      return { message: installed.alreadyInstalled ? 'Essa paisagem já está instalada.' : 'Paisagem instalada. O Distant Horizons continua com a opção de ativação que você escolheu.' };
    }));
  });
  ipcMain.handle('launcher:update-check', async event => { trusted(event); return result(async () => { await getUpdater()?.boot(); return {}; }); });
  ipcMain.handle('launcher:update-install', async event => { trusted(event); return result(async () => { await getUpdater()?.install(); return {}; }); });
  ipcMain.handle('launcher:server-refresh', async event => { trusted(event); if (!smoke) await getMonitor().refresh(true); return { ok: true }; });
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
      if (selected.landscape) await installLandscape(engine, { directory: options?.landscapeDirectory });
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
  ipcMain.on('window:minimize', event => { trusted(event); getWindow().minimize(); });
  ipcMain.on('window:close', event => { trusted(event); if (!state.busy) getWindow().close(); });
}

module.exports = { registerHandlers };
