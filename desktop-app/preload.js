// Preload script for secure context bridge
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  logError: (context, message, stack) => {
    ipcRenderer.send('log-frontend-error', { context, message, stack });
  },
  openErrorLog: () => {
    ipcRenderer.send('open-error-log');
  },
  print: () => {
    window.print();
  },
  forceFocus: () => {
    ipcRenderer.send('force-focus');
  },
  // Auto-update IPC
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_e, info) => callback(info)),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_e, progress) => callback(progress)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', () => callback()),
  onUpdateError: (callback) => ipcRenderer.on('update-error', (_e, msg) => callback(msg)),
  startDownload: () => ipcRenderer.send('start-update-download'),
  installUpdate: () => ipcRenderer.send('install-update'),
  dismissUpdate: () => ipcRenderer.send('dismiss-update'),
});

// Fix typing issue: detect when keyboard stops working and force focus
let lastKeyTime = 0;
let focusCheckInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  // On any click, request focus from main process
  document.addEventListener('mousedown', () => {
    ipcRenderer.send('force-focus');
  }, true);

  // Detect stuck focus: if clicks happen but no keydown for 5s, force focus
  document.addEventListener('click', () => {
    lastKeyTime = Date.now();
  });
  document.addEventListener('keydown', () => {
    lastKeyTime = Date.now();
  });
});

// Catch unhandled errors in renderer and send to main process
window.addEventListener('error', (event) => {
  ipcRenderer.send('log-frontend-error', {
    context: 'RENDERER_ERROR',
    message: event.message,
    stack: `${event.filename}:${event.lineno}:${event.colno}\n${event.error ? event.error.stack : ''}`
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  ipcRenderer.send('log-frontend-error', {
    context: 'RENDERER_UNHANDLED_REJECTION',
    message: reason ? (reason.message || String(reason)) : 'Unknown rejection',
    stack: reason && reason.stack ? reason.stack : ''
  });
});
