// Preload script for secure context bridge
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  // Error reporting: send frontend errors to main process for logging
  logError: (context, message, stack) => {
    ipcRenderer.send('log-frontend-error', { context, message, stack });
  },
  // Open error log file
  openErrorLog: () => {
    ipcRenderer.send('open-error-log');
  },
  // Print support
  print: () => {
    window.print();
  }
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
