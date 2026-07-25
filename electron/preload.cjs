// Sandboxed preload. Bridges the auto-updater status/commands from the main
// process to the web UI (which is served over http://127.0.0.1). Only a tiny,
// explicit surface is exposed — no Node access leaks to the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('raUpdate', {
  isElectron: true,
  // Subscribe to update status pushes. Returns an unsubscribe function.
  onStatus: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('update:status', handler);
    return () => ipcRenderer.removeListener('update:status', handler);
  },
  check: () => ipcRenderer.invoke('update:check'),
  install: () => ipcRenderer.invoke('update:install'),
});
