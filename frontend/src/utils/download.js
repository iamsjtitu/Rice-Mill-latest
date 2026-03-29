import axios from 'axios';

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const API = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');

/**
 * Universal file download (GET) - works in Browser + Electron
 *
 * ELECTRON: Uses window.open(url) → setWindowOpenHandler → downloadURL() → native Save dialog
 * BROWSER:  Fetches as blob → anchor tag download
 */
export const downloadFile = async (url, filename) => {
  const fullUrl = url.startsWith('http') ? url : `${API}${url}`;

  if (_isElectron) {
    window.open(fullUrl, '_blank');
    return;
  }

  try {
    const res = await axios.get(fullUrl, { responseType: 'blob' });
    _saveBlobBrowser(res.data, res.headers['content-type'], filename || guessFilename(url, res.headers['content-type']));
  } catch (e) {
    console.error('Download failed, trying direct open:', e);
    window.open(fullUrl, '_blank');
  }
};

/**
 * Universal file download (POST) - for exports that send data in body
 *
 * ELECTRON: Fetches blob → IPC save-file → native Save dialog → writes to disk
 * BROWSER:  Fetches blob → anchor tag download
 */
export const downloadPost = async (url, body, filename) => {
  const fullUrl = url.startsWith('http') ? url : `${API}${url}`;

  try {
    const res = await axios.post(fullUrl, body, { responseType: 'blob' });
    const contentType = res.headers['content-type'] || 'application/octet-stream';
    const finalName = filename || guessFilename(url, contentType);

    if (_isElectron && window.electronAPI && window.electronAPI.saveFile) {
      const arrayBuffer = await res.data.arrayBuffer();
      await window.electronAPI.saveFile(arrayBuffer, finalName, contentType);
      return;
    }

    _saveBlobBrowser(res.data, contentType, finalName);
  } catch (e) {
    console.error('POST download failed:', e);
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
    try { document.body.removeChild(a); } catch (e) {}
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
