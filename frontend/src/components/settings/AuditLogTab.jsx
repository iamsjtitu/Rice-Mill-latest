import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, History } from "lucide-react";
import { useConfirm } from "@/components/ConfirmProvider";
import { API, COLLECTION_LABELS, ACTION_COLORS } from "./settingsConstants";

function AuditLogTab({ user }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterUser, setFilterUser] = useState("");
  const [filterCollection, setFilterCollection] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [retentionDays, setRetentionDays] = useState("");
  const showConfirm = useConfirm();

  const fetchLogs = async () => {
    try {
      let url = `${API}/audit-log?username=${user.username}&role=${user.role}&page=${page}&page_size=30`;
      if (filterUser) url += `&filter_user=${filterUser}`;
      if (filterCollection) url += `&filter_collection=${filterCollection}`;
      if (filterDate) url += `&filter_date=${filterDate}`;
      const res = await axios.get(url);
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
    } catch { toast.error("Audit log load nahi ho saka"); }
  };

  useEffect(() => { fetchLogs(); }, [page, filterUser, filterCollection, filterDate]);

  const handleClearAll = async () => {
    if (!await showConfirm("Clear All Audit Logs", "Kya aap sure hain? Saare audit logs delete ho jayenge!")) return;
    try {
      const res = await axios.delete(`${API}/audit-log/clear?username=${user.username}&role=${user.role}`);
      toast.success(res.data.message);
      fetchLogs();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const handleClearOld = async () => {
    const days = parseInt(retentionDays);
    if (!days || days < 1) { toast.error("Valid din enter karo (1+)"); return; }
    if (!await showConfirm("Purane Logs Delete", `${days} din se purane audit logs delete ho jayenge. Sure?`)) return;
    try {
      const res = await axios.delete(`${API}/audit-log/clear?username=${user.username}&role=${user.role}&days=${days}`);
      toast.success(res.data.message);
      setRetentionDays("");
      fetchLogs();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const formatTime = (ts) => {
    if (!ts) return "-";
    const d = new Date(ts);
    return `${d.toLocaleDateString("en-IN")} ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <div className="space-y-3" data-testid="audit-log-tab">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
              <History className="w-4 h-4 text-amber-400" /> Audit Log - Kisne Kya Kiya
            </CardTitle>
            <span className="text-[10px] text-slate-500">{total} records</span>
          </div>
          {/* Cleanup controls */}
          <div className="flex items-center gap-2 mt-2">
            <Input type="number" min="1" value={retentionDays} onChange={e => setRetentionDays(e.target.value)}
              placeholder="Din..." className="bg-slate-700 border-slate-600 text-white h-7 text-xs w-20" data-testid="audit-retention-days" />
            <Button size="sm" variant="outline" className="h-7 text-xs border-amber-600 text-amber-400 hover:bg-amber-600/20"
              onClick={handleClearOld} data-testid="audit-clear-old-btn">
              <Trash2 className="w-3 h-3 mr-1" /> Purane Delete
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs border-red-600 text-red-400 hover:bg-red-600/20"
              onClick={handleClearAll} data-testid="audit-clear-all-btn">
              <Trash2 className="w-3 h-3 mr-1" /> Sab Clear
            </Button>
          </div>
          {/* Filters */}
          <div className="flex gap-2 mt-2">
            <Input value={filterUser} onChange={e => { setFilterUser(e.target.value); setPage(1); }}
              placeholder="User filter..." className="bg-slate-700 border-slate-600 text-white h-7 text-xs w-32" />
            <Select value={filterCollection || "_all"} onValueChange={v => { setFilterCollection(v === "_all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-7 text-xs w-36">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                <SelectItem value="_all" className="text-white text-xs">All Types</SelectItem>
                {Object.entries(COLLECTION_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-white text-xs">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={filterDate} onChange={e => { setFilterDate(e.target.value); setPage(1); }}
              className="bg-slate-700 border-slate-600 text-white h-7 text-xs w-36" />
            {(filterUser || filterCollection || filterDate) && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-400"
                onClick={() => { setFilterUser(""); setFilterCollection(""); setFilterDate(""); setPage(1); }}>Clear</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-1">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 px-3 py-2 bg-slate-700/30 rounded hover:bg-slate-700/50 transition-colors">
                <div className="flex-shrink-0 mt-0.5">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${ACTION_COLORS[log.action] || "bg-slate-600/30 text-slate-400"}`}>
                    {log.action.toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-200">{log.summary}</p>
                  {log.changes && Object.keys(log.changes).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Object.entries(log.changes).slice(0, 4).map(([field, val]) => (
                        <span key={field} className="text-[9px] bg-slate-600/30 text-slate-400 px-1.5 py-0.5 rounded">
                          {field}: {val.old !== undefined ? `${val.old} → ` : ""}{val.new !== undefined ? val.new : ""}
                        </span>
                      ))}
                      {Object.keys(log.changes).length > 4 && (
                        <span className="text-[9px] text-slate-500">+{Object.keys(log.changes).length - 4} more</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-[10px] text-amber-400 font-medium">{log.username}</p>
                  <p className="text-[9px] text-slate-500">{formatTime(log.timestamp)}</p>
                  <p className="text-[9px] text-slate-600">{COLLECTION_LABELS[log.collection] || log.collection}</p>
                </div>
              </div>
            ))}
            {logs.length === 0 && (
              <p className="text-center text-slate-500 text-xs py-6">Koi audit log nahi mila</p>
            )}
          </div>
          {/* Pagination */}
          {total > 30 && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <Button variant="outline" size="sm" className="h-6 text-[10px] border-slate-600 text-slate-300"
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Prev</Button>
              <span className="text-[10px] text-slate-400">Page {page} / {Math.ceil(total / 30)}</span>
              <Button variant="outline" size="sm" className="h-6 text-[10px] border-slate-600 text-slate-300"
                onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 30)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AuditLogTab;
