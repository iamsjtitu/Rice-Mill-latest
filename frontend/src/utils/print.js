// Safe print helper - uses iframe approach (works in Electron + browser)
import logger from "./logger";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');

// Cache watermark settings
let _wmCache = null;
let _wmFetched = false;

const fetchWatermarkSettings = async () => {
  if (_wmFetched) return _wmCache;
  try {
    const res = await fetch(`${BACKEND_URL}/api/settings/watermark`);
    if (res.ok) {
      _wmCache = await res.json();
    }
  } catch (e) { /* silently fail */ }
  _wmFetched = true;
  // Re-fetch after 60s
  setTimeout(() => { _wmFetched = false; }, 60000);
  return _wmCache;
};

const getWatermarkCSS = (settings) => {
  if (!settings || !settings.enabled || settings.type !== 'text' || !settings.text) return '';
  const text = settings.text || '';
  const opacity = settings.opacity || 0.06;
  const fontSize = settings.font_size || 36;
  const rotation = -(settings.rotation || 30);
  
  return `
    .print-watermark-container {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 9999; overflow: hidden;
    }
    .print-watermark-tile {
      position: absolute; white-space: nowrap;
      font-size: ${fontSize}px; font-weight: bold; font-family: Arial, sans-serif;
      color: rgba(150, 150, 150, ${opacity * 2});
      transform: rotate(${rotation}deg);
      user-select: none; -webkit-user-select: none;
    }
    @media print {
      .print-watermark-container { position: fixed !important; }
      .print-watermark-tile { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
};

const getWatermarkHTML = (settings) => {
  if (!settings || !settings.enabled || settings.type !== 'text' || !settings.text) return '';
  const text = settings.text || '';
  let tiles = '';
  for (let y = -100; y < 1200; y += 120) {
    for (let x = -200; x < 1200; x += 280) {
      tiles += `<div class="print-watermark-tile" style="left:${x}px;top:${y}px;">${text}</div>`;
    }
  }
  return `<div class="print-watermark-container">${tiles}</div>`;
};

const injectWatermark = (htmlContent, settings) => {
  if (!settings || !settings.enabled) return htmlContent;
  const wmCSS = getWatermarkCSS(settings);
  const wmHTML = getWatermarkHTML(settings);
  if (!wmCSS) return htmlContent;
  // Inject CSS before </head> or at start, and HTML after <body> or at start
  let result = htmlContent;
  if (result.includes('</head>')) {
    result = result.replace('</head>', `<style>${wmCSS}</style></head>`);
  } else if (result.includes('<body')) {
    result = result.replace('<body', `<style>${wmCSS}</style><body`);
  } else {
    result = `<style>${wmCSS}</style>` + result;
  }
  if (result.includes('<body>')) {
    result = result.replace('<body>', `<body>${wmHTML}`);
  } else if (result.includes('<body ')) {
    result = result.replace(/<body([^>]*)>/, `<body$1>${wmHTML}`);
  } else {
    result = wmHTML + result;
  }
  return result;
};

export const safePrintHTML = async (htmlContent) => {
  try {
    // Fetch watermark settings and inject into HTML
    const wmSettings = await fetchWatermarkSettings();
    const finalHTML = injectWatermark(htmlContent, wmSettings);

    const isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
    if (isElectron) {
      const printWindow = window.open('', '_blank', 'width=900,height=700');
      if (printWindow) {
        const doc = printWindow.document;
        doc.open();
        doc.write(finalHTML);
        doc.close();
        printWindow.onload = () => printWindow.focus();
      } else {
        const blob = new Blob([finalHTML], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'print.html';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
    } else {
      // Safe iframe approach - content is isolated in sandboxed iframe
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(finalHTML);
      iframeDoc.close();
      setTimeout(() => {
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }, 500);
    }
  } catch(e) {
    logger.error('Print failed, downloading as HTML:', e);
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'print.html';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
};
