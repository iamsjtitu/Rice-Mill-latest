import axios from 'axios';
import { toast } from 'sonner';
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

  // 1. Trigger download (saves to user's Downloads folder)
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  // 2. Auto-open behavior — same UX as Electron (shell.openPath) but adapted for browsers.
  //    Browsers ONLY have built-in viewers for PDF / image / text. For Excel/ZIP/etc.
  //    a `window.open(blobUrl)` would trigger a SECOND download (xlsx duplicate). So we
  //    open a tab only for PDFs (where the browser renders inline) and just download
  //    other files. The browser's built-in download notification still gives the user a
  //    one-click "Open" button on most platforms, so the file is always reachable.
  const ct = (contentType || '').toLowerCase();
  const fnLower = (filename || '').toLowerCase();
  const isPdf = ct.includes('pdf') || fnLower.endsWith('.pdf');
  if (isPdf) {
    setTimeout(() => {
      try { window.open(blobUrl, '_blank'); } catch (e) { logger.error('Auto-open error:', e); }
    }, 200);
  } else {
    // Non-PDF: skip the second window.open (prevents duplicate xlsx downloads).
    // Surface a toast hint so the user knows the file is in Downloads.
    try {
      const isExcel = ct.includes('spreadsheet') || ct.includes('excel') || fnLower.endsWith('.xlsx') || fnLower.endsWith('.xls');
      toast.success(`${isExcel ? 'Excel' : 'File'} downloaded`, {
        description: `${filename} ab Downloads folder mein hai — wahan se open karein.`,
        duration: 5000,
      });
    } catch (_) { /* toast optional */ }
  }

  setTimeout(() => {
    try { document.body.removeChild(a); } catch (e) { logger.error('Cleanup error:', e); }
    window.URL.revokeObjectURL(blobUrl);
  }, 60000);
}

function guessFilename(url, contentType) {
  const p = url.split('?')[0];
  if (contentType && contentType.includes('pdf')) return 'export.pdf';
  if (contentType && (contentType.includes('spreadsheet') || contentType.includes('excel'))) return 'export.xlsx';
  if (p.includes('pdf')) return 'export.pdf';
  if (p.includes('excel') || p.includes('xlsx')) return 'export.xlsx';
  return 'export';
}

/**
 * Fetch a URL as a Blob (for in-memory use — e.g., uploading to WhatsApp).
 * Does NOT trigger a download dialog. Returns { blob, name }.
 */
export const fetchAsBlob = async (url, filename) => {
  const fullUrl = url.startsWith('http') ? url : `${API}${url}`;
  const res = await axios.get(fullUrl, { responseType: 'blob' });
  const ct = res.headers['content-type'] || 'application/octet-stream';
  const blob = new Blob([res.data], { type: ct });
  return { blob, name: filename || guessFilename(url, ct) };
};
