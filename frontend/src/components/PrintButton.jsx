import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export const PrintButton = ({ title, className = "" }) => {
  const isElectronEnv = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
  
  const handlePrint = () => {
    if (title) document.title = title + " - Mill Entry System";
    if (isElectronEnv) {
      const content = document.documentElement.outerHTML;
      const w = window.open('', '_blank', 'width=900,height=700');
      if (w) { w.document.open(); w.document.write(content); w.document.close(); w.onload = () => w.focus(); }
    } else {
      window.print();
    }
  };

  return (
    <Button
      onClick={handlePrint}
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
