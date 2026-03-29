import axios from 'axios';

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const API = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');

/**
 * Universal file download - works in Browser + Electron
 *
 * ELECTRON: Uses window.open(url) which triggers setWindowOpenHandler in main.js
 *           → main process calls downloadURL() → native Save dialog appears
 *
 * BROWSER:  Fetches as blob and triggers download via anchor tag
 */
export const downloadFile = async (url, filename) => {
  const fullUrl = url.startsWith('http') ? url : `${API}${url}`;

  // --- Electron: let main process handle via downloadURL ---
  if (_isElectron) {
    window.open(fullUrl, '_blank');
    return;
  }

  // --- Browser: blob fetch + anchor download ---
  try {
    const res = await axios.get(fullUrl, { responseType: 'blob' });
    const contentType = res.headers['content-type'] || 'application/octet-stream';
    const blob = new Blob([res.data], { type: contentType });
    const blobUrl = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = blobUrl;
    a.download = filename || guessFilename(url, contentType);
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      try { document.body.removeChild(a); } catch (e) {}
      window.URL.revokeObjectURL(blobUrl);
    }, 30000);
  } catch (e) {
    console.error('Download failed, trying direct open:', e);
    window.open(fullUrl, '_blank');
  }
};

function guessFilename(url, contentType) {
  const p = url.split('?')[0];
  if (contentType && contentType.includes('pdf')) return 'export.pdf';
  if (contentType && (contentType.includes('spreadsheet') || contentType.includes('excel'))) return 'export.xlsx';
  if (p.includes('pdf')) return 'export.pdf';
  if (p.includes('excel') || p.includes('xlsx')) return 'export.xlsx';
  return 'export';
}
