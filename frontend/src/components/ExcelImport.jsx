import { useState, useRef } from "react";
import { fmtDate } from "@/utils/date";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Upload, FileSpreadsheet, Check, AlertCircle, Loader2 } from "lucide-react";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

const ExcelImport = ({ filters, user, onImportDone }) => {
  const [showDialog, setShowDialog] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const fileRef = useRef(null);

  const handleFileSelect = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith('.xlsx') && !f.name.endsWith('.xls')) {
      toast.error("Sirf Excel file (.xlsx) select karein");
      return;
    }
    setFile(f);
    setResult(null);
    setPreviewing(true);
    try {
      const formData = new FormData();
      formData.append('file', f);
      formData.append('kms_year', filters.kms_year || '');
      formData.append('season', filters.season || '');
      formData.append('username', user.username);
      formData.append('preview_only', 'true');
      const res = await axios.post(`${API}/entries/import-excel`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setPreview(res.data);
      setShowDialog(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Excel file read nahi ho paya");
    } finally { setPreviewing(false); }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kms_year', filters.kms_year || '');
      formData.append('season', filters.season || '');
      formData.append('username', user.username);
      formData.append('preview_only', 'false');
      const res = await axios.post(`${API}/entries/import-excel`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(res.data);
      setPreview(null);
      toast.success(res.data.message || "Import successful!");
      if (onImportDone) onImportDone();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Import failed");
    } finally { setImporting(false); }
  };

  const resetAll = () => {
    setFile(null); setPreview(null); setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
      <input type="file" ref={fileRef} accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" data-testid="excel-import-file-input" />
      <Button onClick={() => { resetAll(); fileRef.current?.click(); }} size="sm"
        className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={previewing}
        data-testid="excel-import-btn">
        {previewing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
        {previewing ? 'Reading...' : 'Excel Import'}
      </Button>

      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) { setShowDialog(false); resetAll(); } }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-4xl max-h-[85vh] overflow-y-auto" data-testid="excel-import-dialog">
          <DialogHeader>
            <DialogTitle className="text-indigo-400 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Excel Import {file?.name ? `- ${file.name}` : ''}
            </DialogTitle>
          </DialogHeader>

          {/* Preview Section */}
          {preview && !result && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-slate-700/50 border-slate-600">
                  <CardContent className="p-3">
                    <p className="text-xs text-slate-400">Entries Found</p>
                    <p className="text-2xl font-bold text-indigo-400">{preview.count}</p>
                  </CardContent>
                </Card>
                <Card className="bg-slate-700/50 border-slate-600">
                  <CardContent className="p-3">
                    <p className="text-xs text-slate-400">Skipped (empty rows)</p>
                    <p className="text-2xl font-bold text-yellow-400">{preview.skipped}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="p-2 bg-slate-700/30 rounded">
                <p className="text-xs text-slate-400 mb-1">Columns Detected:</p>
                <div className="flex flex-wrap gap-1">
                  {preview.columns_detected?.map(c => (
                    <span key={c} className="px-2 py-0.5 bg-indigo-900/30 text-indigo-400 rounded text-[10px]">{c}</span>
                  ))}
                </div>
              </div>

              <p className="text-xs text-slate-400">Preview (first 10 entries):</p>
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700 hover:bg-transparent">
                      {['Date', 'Truck', 'Agent', 'Mandi', 'KG', 'Bag', 'GBW Cut', 'Cut %', 'Disc', 'Cash Paid', 'Diesel', 'Remark'].map(h =>
                        <TableHead key={h} className="text-slate-300 text-[10px] whitespace-nowrap">{h}</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.sample?.map((e, i) => (
                      <TableRow key={i} className="border-slate-700">
                        <TableCell className="text-xs text-white">{fmtDate(e.date)}</TableCell>
                        <TableCell className="text-xs text-white">{e.truck_no}</TableCell>
                        <TableCell className="text-xs text-white">{e.agent_name}</TableCell>
                        <TableCell className="text-xs text-white">{e.mandi_name}</TableCell>
                        <TableCell className="text-xs text-white">{e.kg}</TableCell>
                        <TableCell className="text-xs text-white">{e.bag}</TableCell>
                        <TableCell className="text-xs text-white">{e.gbw_cut}</TableCell>
                        <TableCell className="text-xs text-white">{e.cutting_percent?.toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-white">{e.disc_dust_poll}</TableCell>
                        <TableCell className="text-xs text-green-400">{e.cash_paid || '-'}</TableCell>
                        <TableCell className="text-xs text-orange-400">{e.diesel_paid || '-'}</TableCell>
                        <TableCell className="text-xs text-slate-400">{e.remark || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="p-2 bg-amber-900/20 border border-amber-800/30 rounded text-xs text-amber-400">
                <AlertCircle className="w-3 h-3 inline mr-1" />
                Cash Paid aur Diesel Paid entries automatically Cash Book aur Diesel Account mein bhi jayengi.
                {filters.kms_year && <span className="ml-1">KMS Year: <b>{filters.kms_year}</b></span>}
                {filters.season && <span className="ml-1">Season: <b>{filters.season}</b></span>}
              </div>

              <div className="flex gap-2">
                <Button onClick={handleImport} className="bg-indigo-600 hover:bg-indigo-700 text-white flex-1" disabled={importing} data-testid="excel-import-confirm-btn">
                  {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                  {importing ? 'Importing...' : `Import ${preview.count} Entries`}
                </Button>
                <Button variant="outline" onClick={() => { setShowDialog(false); resetAll(); }} className="border-slate-600 text-slate-300">Cancel</Button>
              </div>
            </div>
          )}

          {/* Result Section */}
          {result && (
            <div className="space-y-3">
              <Card className="bg-emerald-900/20 border-emerald-800/30">
                <CardContent className="p-4 text-center">
                  <Check className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <p className="text-lg font-bold text-emerald-400">Import Complete!</p>
                  <p className="text-sm text-slate-300 mt-1">{result.message}</p>
                </CardContent>
              </Card>
              <div className="grid grid-cols-3 gap-3">
                <Card className="bg-slate-700/50 border-slate-600"><CardContent className="p-3 text-center">
                  <p className="text-[10px] text-slate-400">Mill Entries</p>
                  <p className="text-xl font-bold text-white">{result.imported}</p>
                </CardContent></Card>
                <Card className="bg-slate-700/50 border-slate-600"><CardContent className="p-3 text-center">
                  <p className="text-[10px] text-slate-400">Cash Book</p>
                  <p className="text-xl font-bold text-green-400">{result.cash_book_entries}</p>
                </CardContent></Card>
                <Card className="bg-slate-700/50 border-slate-600"><CardContent className="p-3 text-center">
                  <p className="text-[10px] text-slate-400">Diesel Account</p>
                  <p className="text-xl font-bold text-orange-400">{result.diesel_entries}</p>
                </CardContent></Card>
              </div>
              <Button onClick={() => { setShowDialog(false); resetAll(); }} className="w-full bg-slate-700 hover:bg-slate-600 text-white">Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ExcelImport;
