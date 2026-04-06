import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, FileText, FileSpreadsheet, Search, Loader2, Download, X } from "lucide-react";
import { fmtDate } from "@/utils/date";

/**
 * ExportPreviewDialog - Reusable export preview with full data table
 *
 * Props:
 *   data         - Array of objects (pre-loaded data)
 *   fetchUrl     - OR API url to fetch data when opened (returns array or {items:[]})
 *   columns      - [{header, field, format?, align?, render?}]
 *   title        - Dialog title
 *   onPdfExport  - callback for PDF download
 *   onExcelExport- callback for Excel download
 *   triggerLabel - optional button label (default: "Preview")
 *   triggerClassName - optional CSS for trigger button
 *   buttonSize   - button size prop (default: "sm")
 *   iconOnly     - show only Eye icon, no text
 */
const ExportPreviewDialog = ({
  data: propData,
  fetchUrl,
  columns = [],
  title = "Export Preview",
  onPdfExport,
  onExcelExport,
  triggerLabel,
  triggerClassName = "border-blue-700 text-blue-400 hover:bg-blue-900/30",
  buttonSize = "sm",
  iconOnly = false,
}) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
  const API = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');

  useEffect(() => {
    if (!open) return;
    if (propData) {
      setData(propData);
      return;
    }
    if (fetchUrl) {
      setLoading(true);
      const fullUrl = fetchUrl.startsWith('http') ? fetchUrl : `${API}${fetchUrl}`;
      fetch(fullUrl, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
        .then(r => r.json())
        .then(d => {
          setData(Array.isArray(d) ? d : (d.items || d.data || d.parties || d.entries || d.payments || d.results || []));
        })
        .catch(() => setData([]))
        .finally(() => setLoading(false));
    }
  }, [open, propData, fetchUrl, API]);

  const formatValue = useCallback((val, col) => {
    if (col.render) return col.render(val);
    if (val === undefined || val === null || val === "") return "-";
    switch (col.format) {
      case "date": return fmtDate(String(val).substring(0, 10));
      case "rupees": return `Rs.${Number(val).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
      case "number": return Number(val).toLocaleString('en-IN', { maximumFractionDigits: 2 });
      case "qntl": return (Number(val) / 100).toFixed(2);
      case "integer": return Math.round(Number(val)).toLocaleString('en-IN');
      default: return String(val);
    }
  }, []);

  const filtered = search
    ? data.filter(row => columns.some(c => {
        const v = row[c.field];
        return v && String(v).toLowerCase().includes(search.toLowerCase());
      }))
    : data;

  return (
    <>
      <Button
        variant="outline"
        size={buttonSize}
        className={triggerClassName}
        onClick={() => setOpen(true)}
        data-testid="export-preview-btn"
        title="Preview / पूर्वावलोकन"
      >
        <Eye className="w-4 h-4" />
        {!iconOnly && <span className="ml-1">{triggerLabel || "Preview"}</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[92vh] p-0 bg-slate-900 border-slate-700 flex flex-col" data-testid="export-preview-dialog">
          <DialogHeader className="px-4 pt-4 pb-2 border-b border-slate-700 flex-shrink-0">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-amber-400 text-base font-bold flex-shrink-0">
                {title}
              </DialogTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search..."
                    className="bg-slate-800 border-slate-600 text-white h-7 text-xs pl-7 w-[180px]"
                    data-testid="preview-search"
                  />
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {filtered.length} / {data.length} rows
                </span>
                {onPdfExport && (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-red-600 text-red-400 hover:bg-red-900/30"
                    onClick={() => { onPdfExport(); }}
                    data-testid="preview-pdf-btn">
                    <FileText className="w-3.5 h-3.5 mr-1" /> PDF
                  </Button>
                )}
                {onExcelExport && (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-green-600 text-green-400 hover:bg-green-900/30"
                    onClick={() => { onExcelExport(); }}
                    data-testid="preview-excel-btn">
                    <FileSpreadsheet className="w-3.5 h-3.5 mr-1" /> Excel
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto px-2 pb-2 min-h-0" data-testid="preview-table-scroll">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                <span className="ml-2 text-slate-400">Loading data...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-slate-500">
                No data found / कोई डेटा नहीं मिला
              </div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="bg-slate-800 border-slate-700 hover:bg-slate-800">
                    <TableHead className="text-amber-400 text-[10px] font-bold px-2 py-1.5 w-8">#</TableHead>
                    {columns.map((c, i) => (
                      <TableHead key={i} className={`text-amber-400 text-[10px] font-bold px-2 py-1.5 whitespace-nowrap ${c.align === 'right' ? 'text-right' : ''}`}>
                        {c.header}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row, ri) => (
                    <TableRow key={ri} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-slate-500 text-[10px] px-2 py-1">{ri + 1}</TableCell>
                      {columns.map((c, ci) => (
                        <TableCell key={ci} className={`text-[11px] px-2 py-1 whitespace-nowrap ${c.align === 'right' ? 'text-right font-mono' : ''} ${c.className || 'text-slate-300'}`}>
                          {formatValue(row[c.field], c)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ExportPreviewDialog;
