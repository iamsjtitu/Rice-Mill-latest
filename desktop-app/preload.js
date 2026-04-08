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
  // Serial / Weighbridge IPC
  serialGetConfig: () => ipcRenderer.invoke('serial-get-config'),
  serialSaveConfig: (config) => ipcRenderer.invoke('serial-save-config', config),
  serialListPorts: () => ipcRenderer.invoke('serial-list-ports'),
  serialConnect: (config) => ipcRenderer.send('serial-connect', config),
  serialDisconnect: () => ipcRenderer.send('serial-disconnect'),
  serialGetStatus: () => ipcRenderer.invoke('serial-get-status'),
  onSerialWeight: (callback) => ipcRenderer.on('serial-weight', (_e, data) => callback(data)),
  onSerialStatus: (callback) => ipcRenderer.on('serial-status', (_e, data) => callback(data)),
  onSerialError: (callback) => ipcRenderer.on('serial-error', (_e, data) => callback(data)),
  removeSerialListeners: () => {
    ipcRenderer.removeAllListeners('serial-weight');
    ipcRenderer.removeAllListeners('serial-status');
    ipcRenderer.removeAllListeners('serial-error');
  },
  // Auto-update IPC
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_e, info) => callback(info)),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_e, progress) => callback(progress)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', () => callback()),
  onUpdateError: (callback) => ipcRenderer.on('update-error', (_e, msg) => callback(msg)),
  onUpdateChecking: (callback) => ipcRenderer.on('update-checking', () => callback()),
  onUpdateNotAvailable: (callback) => ipcRenderer.on('update-not-available', (_e, info) => callback(info)),
  startDownload: () => ipcRenderer.send('start-update-download'),
  installUpdate: () => ipcRenderer.send('install-update'),
  dismissUpdate: () => ipcRenderer.send('dismiss-update'),
  // File download IPC - main process fetches directly from local server (no binary data over IPC)
  downloadAndSave: (url, filename) => ipcRenderer.invoke('download-and-save', url, filename),
  // Close/Quit app
  closeApp: () => ipcRenderer.send('close-app'),
});

// Fix typing issue: detect when keyboard stops working and force focus
let lastKeyTime = 0;
let focusCheckInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  // === FIX: Radix UI pointer-events stuck after window.confirm() ===
  // Patch window.confirm to restore pointer-events after native dialog closes
  const _origConfirm = window.confirm.bind(window);
  window.confirm = function(msg) {
    const result = _origConfirm(msg);
    // Aggressively restore pointer-events
    document.body.style.pointerEvents = '';
    document.body.style.removeProperty('pointer-events');
    // Also after next frames
    requestAnimationFrame(() => {
      document.body.style.removeProperty('pointer-events');
      requestAnimationFrame(() => {
        document.body.style.removeProperty('pointer-events');
      });
    });
    setTimeout(() => { document.body.style.removeProperty('pointer-events'); }, 100);
    setTimeout(() => { document.body.style.removeProperty('pointer-events'); }, 300);
    return result;
  };

  // MutationObserver: detect stuck pointer-events:none on body when no dialog is open
  const peObserver = new MutationObserver(() => {
    if (document.body.style.pointerEvents === 'none') {
      setTimeout(() => {
        const hasOverlay = document.querySelector(
          '[data-radix-dialog-overlay],[data-radix-alert-dialog-overlay],[data-radix-select-content],[data-radix-popover-content],[data-radix-dropdown-menu-content]'
        );
        if (!hasOverlay && document.body.style.pointerEvents === 'none') {
          document.body.style.removeProperty('pointer-events');
          console.log('[PointerFix] Removed stuck pointer-events:none from body');
        }
      }, 200);
    }
  });
  peObserver.observe(document.body, { attributeFilter: ['style'], attributes: true });

  // Periodic safety check every 2 seconds
  setInterval(() => {
    if (document.body.style.pointerEvents === 'none') {
      const hasOverlay = document.querySelector(
        '[data-radix-dialog-overlay],[data-radix-alert-dialog-overlay],[data-radix-select-content],[data-radix-popover-content],[data-radix-dropdown-menu-content]'
      );
      if (!hasOverlay) {
        document.body.style.removeProperty('pointer-events');
      }
    }
  }, 2000);

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
