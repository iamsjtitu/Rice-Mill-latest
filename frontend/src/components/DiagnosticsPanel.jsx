import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, FolderOpen, Database, HardDrive, AlertCircle, CheckCircle, Copy } from "lucide-react";
import { APP_VERSION } from "@/utils/constants-version";
import { toast } from "sonner";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

const FAMOUS_COLLECTIONS = [
  { key: "entries", label: "Mill Entries" },
  { key: "vehicle_weights", label: "Vehicle Weights" },
  { key: "purchases", label: "Purchases" },
  { key: "sales", label: "Sales" },
  { key: "payments", label: "Payments (Jama/Udhar)" },
  { key: "cash_book", label: "Cash Book" },
  { key: "hemali_payments", label: "Hemali Payments" },
  { key: "hemali_items", label: "Hemali Items Config" },
  { key: "hemali_sardars", label: "Hemali Sardars" },
  { key: "parties", label: "Parties" },
  { key: "agents", label: "Agents" },
  { key: "byproduct_sales", label: "By-product Sales" },
  { key: "govt_registers", label: "Govt Registers" },
];

const DiagnosticsPanel = ({ open, onOpenChange }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await axios.get(`${API}/diagnostics/db-stats`);
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Fetch failed");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) fetchDiagnostics(); }, [open, fetchDiagnostics]);

  const copyFolderPath = () => {
    if (!data?.data_folder) return;
    try {
      navigator.clipboard.writeText(data.data_folder);
      toast.success("Folder path copied");
    } catch { toast.error("Copy failed"); }
  };

  const collections = data?.collections || {};
  const knownCols = FAMOUS_COLLECTIONS.map(c => ({ ...c, stat: collections[c.key] })).filter(c => c.stat);
  const otherCols = Object.keys(collections)
    .filter(k => !FAMOUS_COLLECTIONS.find(c => c.key === k))
    .map(k => ({ key: k, label: k, stat: collections[k] }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-100 max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="diagnostics-panel">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-400">
            <Database className="w-5 h-5" />
            Database Diagnostics <span className="text-xs text-slate-400 font-normal">v{APP_VERSION}</span>
          </DialogTitle>
        </DialogHeader>

        {loading && <div className="py-8 text-center text-slate-400">Loading diagnostics...</div>}

        {error && (
          <div className="bg-red-950/30 border border-red-800 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-300 font-medium">Could not reach diagnostics endpoint</p>
              <p className="text-red-400 text-sm mt-1">{error}</p>
              <p className="text-slate-400 text-xs mt-2">Likely: desktop app is on an older version. Update to v104.28.5+ via auto-updater.</p>
            </div>
          </div>
        )}

        {data && !loading && (
          <div className="space-y-4">
            {/* Data Folder */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-slate-200">Data Folder</span>
                <Badge className="ml-auto bg-slate-700 text-slate-300 text-[10px]">{data.engine}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-slate-950 px-3 py-2 rounded border border-slate-700 text-emerald-400 break-all select-all">
                  {data.data_folder || "(unknown)"}
                </code>
                <Button size="sm" variant="ghost" onClick={copyFolderPath} className="h-8 w-8 p-0 text-slate-400 hover:text-white" data-testid="copy-folder-path-btn">
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              {data.db_file && (
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                  <HardDrive className="w-3 h-3" />
                  <code className="text-slate-500 break-all">{data.db_file}</code>
                  {data.db_file_exists ? (
                    <span className="flex items-center gap-1 text-emerald-400 flex-shrink-0 ml-auto"><CheckCircle className="w-3 h-3" /> exists</span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-400 flex-shrink-0 ml-auto"><AlertCircle className="w-3 h-3" /> missing</span>
                  )}
                </div>
              )}
            </div>

            {/* Main collections */}
            <div>
              <h3 className="text-sm font-semibold text-slate-200 mb-2">Record Counts</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {knownCols.map(c => (
                  <div key={c.key}
                       className={`bg-slate-800/40 border rounded-lg p-3 ${
                         (c.stat?.count || 0) === 0
                           ? 'border-orange-800/50'
                           : 'border-slate-700'
                       }`}
                       data-testid={`diag-col-${c.key}`}>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{c.label}</div>
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-lg font-bold ${(c.stat?.count || 0) === 0 ? 'text-orange-400' : 'text-emerald-400'}`}>
                        {(c.stat?.count ?? 0).toLocaleString('en-IN')}
                      </span>
                      <span className="text-[10px] text-slate-500">records</span>
                    </div>
                    <code className="block text-[10px] text-slate-600 mt-0.5 truncate">{c.key}</code>
                  </div>
                ))}
              </div>
            </div>

            {/* Other collections (collapsed by default) */}
            {otherCols.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-200 select-none">
                  Show all {otherCols.length} other collections
                </summary>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mt-2">
                  {otherCols.map(c => (
                    <div key={c.key} className="bg-slate-800/30 border border-slate-700/50 rounded px-2 py-1.5 text-[11px] flex justify-between" data-testid={`diag-other-${c.key}`}>
                      <code className="text-slate-500 truncate">{c.key}</code>
                      <span className="text-slate-300 font-medium ml-2">{c.stat?.count ?? '–'}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-slate-700">
          <p className="text-xs text-slate-500">
            Items / Sardars nahi aa rahe? Record counts check karo. Agar 0 hai toh data folder galat select hua hai.
          </p>
          <Button size="sm" variant="outline" onClick={fetchDiagnostics} disabled={loading}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700" data-testid="refresh-diagnostics-btn">
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DiagnosticsPanel;
