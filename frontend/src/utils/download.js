import axios from 'axios';
import logger from "./logger";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const API = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');

/**
 * Universal file download (GET) - works in Browser + Electron
 *
 * ELECTRON: Sends URL to main process via IPC → main process fetches from local server
 *           → shows native Save dialog → writes to disk → auto-opens file
 * BROWSER:  Fetches as blob → anchor tag download
 */
export const downloadFile = async (url, filename) => {
  const fullUrl = url.startsWith('http') ? url : `${API}${url}`;
  const finalName = filename || guessFilename(url, '');

  if (_isElectron) {
    // Method 1: IPC - main process fetches and saves directly
    if (window.electronAPI && typeof window.electronAPI.downloadAndSave === 'function') {
      try {
        logger.log('[downloadFile] IPC downloadAndSave:', fullUrl, finalName);
        const result = await window.electronAPI.downloadAndSave(fullUrl, finalName);
        logger.log('[downloadFile] IPC result:', JSON.stringify(result));
        if (result && result.success) return;
        if (result && result.reason === 'cancelled') return;
        logger.warn('[downloadFile] IPC failed, falling back to window.open');
      } catch (ipcErr) {
        logger.error('[downloadFile] IPC error:', ipcErr);
      }
    }
    // Method 2: Fallback - window.open triggers setWindowOpenHandler → downloadURL
    logger.log('[downloadFile] Using window.open fallback:', fullUrl);
    window.open(fullUrl, '_blank');
    return;
  }

  try {
    const res = await axios.get(fullUrl, { responseType: 'blob' });
    _saveBlobBrowser(res.data, res.headers['content-type'], finalName);
  } catch (e) {
    logger.error('Download failed, trying direct open:', e);
    window.open(fullUrl, '_blank');
  }
};

/**
 * Universal file download (POST) - for exports that send data in body
 * ELECTRON + BROWSER: Fetches blob → saves via IPC or anchor
 */
export const downloadPost = async (url, body, filename) => {
  const fullUrl = url.startsWith('http') ? url : `${API}${url}`;
  const finalName = filename || guessFilename(url, '');

  try {
    const res = await axios.post(fullUrl, body, { responseType: 'arraybuffer' });
    const contentType = res.headers['content-type'] || 'application/octet-stream';

    if (_isElectron && window.electronAPI && window.electronAPI.downloadAndSave) {
      // For POST: write temp file on server, then use IPC to save
      // Fallback: use blob approach
      _saveBlobBrowser(new Blob([res.data], { type: contentType }), contentType, finalName);
      return;
    }

    _saveBlobBrowser(res.data, contentType, finalName);
  } catch (e) {
    logger.error('POST download failed:', e);
    throw e;
  }
};

function _saveBlobBrowser(blobData, contentType, filename) {
  const blob = new Blob([blobData], { type: contentType || 'application/octet-stream' });
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { document.body.removeChild(a); } catch (e) { logger.error('Cleanup error:', e); }
    window.URL.revokeObjectURL(blobUrl);
  }, 30000);
}

function guessFilename(url, contentType) {
  const p = url.split('?')[0];
  if (contentType && contentType.includes('pdf')) return 'export.pdf';
  if (contentType && (contentType.includes('spreadsheet') || contentType.includes('excel'))) return 'export.xlsx';
  if (p.includes('pdf')) return 'export.pdf';
  if (p.includes('excel') || p.includes('xlsx')) return 'export.xlsx';
  return 'export';
}
