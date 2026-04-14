import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { safePrintHTML } from "../utils/print";

const isElectronEnv = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);

/**
 * Universal print helper that works in both web and Electron.
 * Uses safePrintHTML which auto-injects watermark.
 */
export async function printHtml(htmlContent, title) {
  await safePrintHTML(htmlContent);
}

/**
 * Print the current page (for report/dashboard printing).
 * Clones the page content and opens it in a new window.
 */
export async function printCurrentPage(title) {
  if (title) document.title = title + " - Mill Entry System";
  // Clone styles and main content, then print with watermark
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map(el => el.outerHTML).join('\n');
  const mainEl = document.querySelector('main') || document.querySelector('[data-theme]') || document.body;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title || 'Print'}</title>${styles}
    <style>@media print { .no-print, [data-no-print] { display:none!important; } }</style>
  </head><body class="bg-white">${mainEl.innerHTML}</body></html>`;
  await safePrintHTML(html);
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
