import axios from 'axios';

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const API = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');

/**
 * Universal file download - works in Browser + Electron
 * Fetches as blob, creates download link with correct MIME type
 */
export const downloadFile = async (url, filename) => {
  const fullUrl = url.startsWith('http') ? url : `${API}${url}`;
  
  try {
    // Fetch file as blob
    const res = await axios.get(fullUrl, { responseType: 'blob' });
    
    // Use the server's Content-Type to create proper blob
    const contentType = res.headers['content-type'] || 'application/octet-stream';
    const blob = new Blob([res.data], { type: contentType });
    const blobUrl = window.URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = blobUrl;
    a.download = filename || guessFilename(url, contentType);
    document.body.appendChild(a);
    a.click();
    
    // Keep blob alive for 2 minutes so Electron save dialog has time
    setTimeout(() => {
      try { document.body.removeChild(a); } catch(e) {}
      window.URL.revokeObjectURL(blobUrl);
    }, 120000);
    
  } catch (e) {
    console.error('Download failed, trying direct open:', e);
    window.open(fullUrl, '_blank');
  }
};

function guessFilename(url, contentType) {
  const path = url.split('?')[0];
  if (contentType && contentType.includes('pdf')) return 'export.pdf';
  if (contentType && (contentType.includes('spreadsheet') || contentType.includes('excel'))) return 'export.xlsx';
  if (path.includes('pdf')) return 'export.pdf';
  if (path.includes('excel') || path.includes('xlsx')) return 'export.xlsx';
  return 'export';
}
