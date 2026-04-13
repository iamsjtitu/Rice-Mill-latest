import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

const isElectronEnv = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);

/**
 * Universal print helper that works in both web and Electron.
 * Opens a new window with the printable content and triggers print.
 */
export function printHtml(htmlContent, title) {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { alert('Popup blocked! Please allow popups.'); return; }
  const doc = w.document;
  doc.open();
  doc.write(htmlContent);
  doc.close();
  // Give time for styles/images to load before printing
  const triggerPrint = () => {
    w.focus();
    if (isElectronEnv && w.electronAPI) {
      w.electronAPI.print();
    } else {
      w.print();
    }
  };
  if (doc.readyState === 'complete') {
    setTimeout(triggerPrint, 500);
  } else {
    w.onload = () => setTimeout(triggerPrint, 500);
  }
}

/**
 * Print the current page (for report/dashboard printing).
 * Clones the page content and opens it in a new window.
 */
export function printCurrentPage(title) {
  if (title) document.title = title + " - Mill Entry System";
  if (!isElectronEnv) {
    window.print();
    return;
  }
  // Electron: clone styles and main content
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map(el => el.outerHTML).join('\n');
  const mainEl = document.querySelector('main') || document.querySelector('[data-theme]') || document.body;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title || 'Print'}</title>${styles}
    <style>@media print { .no-print, [data-no-print] { display:none!important; } }</style>
  </head><body class="bg-white">${mainEl.innerHTML}</body></html>`;
  printHtml(html, title);
}

export const PrintButton = ({ title, className = "" }) => {
  return (
    <Button
      onClick={() => printCurrentPage(title)}
      variant="outline"
      size="sm"
      className={`border-slate-600 text-slate-300 hover:text-white no-print ${className}`}
      data-testid="print-btn"
      data-no-print
    >
      <Printer className="w-4 h-4 mr-1" /> Print
    </Button>
  );
};
