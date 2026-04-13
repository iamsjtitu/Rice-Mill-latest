import { useState } from "react";
import { History } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import axios from "axios";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

const ACTION_COLORS = {
  create: "bg-green-600/20 text-green-400 border-green-700/30",
  update: "bg-amber-600/20 text-amber-400 border-amber-700/30",
  delete: "bg-red-600/20 text-red-400 border-red-700/30",
  payment: "bg-blue-600/20 text-blue-400 border-blue-700/30",
  undo_payment: "bg-red-600/20 text-red-400 border-red-700/30",
};

export default function RecordHistory({ recordId, label }) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/audit-log/record/${recordId}`);
      setLogs(res.data.logs || []);
    } catch (e) { setLogs([]); }
    setLoading(false);
  };

  const handleOpen = () => {
    setOpen(true);
    fetchHistory();
  };

  const formatTime = (ts) => {
    if (!ts) return "-";
    const d = new Date(ts);
    return `${d.toLocaleDateString("en-IN")} ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <>
      <button onClick={handleOpen} className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
        title="History" data-testid={`record-history-${recordId}`}>
        <History className="w-3.5 h-3.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-slate-800 border-slate-600 text-white max-w-md max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <History className="w-4 h-4 text-amber-400" />
              History {label ? `- ${label}` : ""}
            </DialogTitle>
          </DialogHeader>
          {loading ? (
            <p className="text-center text-slate-400 text-xs py-4">Loading...</p>
          ) : logs.length === 0 ? (
            <p className="text-center text-slate-500 text-xs py-4">Koi history nahi mili</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className={`px-3 py-2 rounded border ${ACTION_COLORS[log.action] || "bg-slate-700/30 border-slate-600"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase">{log.action}</span>
                    <span className="text-[9px] text-slate-400">{formatTime(log.timestamp)}</span>
                  </div>
                  <p className="text-[11px] text-slate-200 mb-1">{log.summary}</p>
                  {log.changes && Object.keys(log.changes).length > 0 && (
                    <div className="space-y-0.5">
                      {Object.entries(log.changes).map(([field, val]) => (
                        <div key={field} className="text-[10px] text-slate-300">
                          <span className="text-slate-500">{field}:</span>{" "}
                          {val.old !== undefined && <span className="line-through text-red-400/70">{String(val.old)}</span>}
                          {val.old !== undefined && val.new !== undefined && " → "}
                          {val.new !== undefined && <span className="text-green-400">{String(val.new)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[9px] text-slate-500 mt-1">by {log.username}</p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
