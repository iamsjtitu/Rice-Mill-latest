import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export const PrintButton = ({ title, className = "" }) => {
  const handlePrint = () => {
    // Set print title if provided
    if (title) document.title = title + " - Mill Entry System";
    window.print();
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
