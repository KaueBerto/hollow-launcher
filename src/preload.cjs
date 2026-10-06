'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hollow', Object.freeze({
  state: () => ipcRenderer.invoke('launcher:state'),
  save: options => ipcRenderer.invoke('launcher:save', options),
  play: options => ipcRenderer.invoke('launcher:play', options),
  reset: () => ipcRenderer.invoke('launcher:reset'),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  downloadOfficial: () => ipcRenderer.invoke('launcher:official-download'),
  onState: callback => {
    const listener = (_, state) => callback(state);
    ipcRenderer.on('launcher:changed', listener);
    return () => ipcRenderer.removeListener('launcher:changed', listener);
  },
}));
