import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Universal file download - works in Browser + Electron
 * Uses blob download instead of window.open
 */
export const downloadFile = async (url, filename) => {
  try {
    const fullUrl = url.startsWith('http') ? url : `${API}${url}`;
    const res = await axios.get(fullUrl, { responseType: 'blob' });
    const blob = new Blob([res.data]);
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || getFilenameFromUrl(url);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(blobUrl);
  } catch (e) {
    console.error('Download failed:', e);
    // Fallback: try window.open
    const fullUrl = url.startsWith('http') ? url : `${API}${url}`;
    window.open(fullUrl, '_blank');
  }
};

function getFilenameFromUrl(url) {
  const path = url.split('?')[0];
  if (path.includes('pdf')) return 'export.pdf';
  if (path.includes('excel') || path.includes('xlsx')) return 'export.xlsx';
  return 'export';
}
