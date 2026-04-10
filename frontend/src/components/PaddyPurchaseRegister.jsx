import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileText, Filter, X, Loader2, Users, Eye } from "lucide-react";
import { useMessagingEnabled } from "@/hooks/useMessagingEnabled";
import { SendToGroupDialog } from "@/components/SendToGroupDialog";
import ViewEntryDialog from "@/components/ViewEntryDialog";
import { fmtDate } from "../utils/date";

const _isElectron = typeof window !== "undefined" && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? "" : (process.env.REACT_APP_BACKEND_URL || "");
const API = `${BACKEND_URL}/api`;

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

const TelegramIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

export default function PaddyPurchaseRegister({ filters: globalFilters }) {
  const { wa, tg } = useMessagingEnabled();
  const [entries, setEntries] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupText, setGroupText] = useState("");
  const [groupPdfUrl, setGroupPdfUrl] = useState("");
  const [viewEntry, setViewEntry] = useState(null);
  const PAGE_SIZE = 100;

  const [regFilters, setRegFilters] = useState({
    date_from: "", date_to: "", rst_no: "", tp_no: "",
    truck_no: "", agent_name: "", mandi_name: ""
  });

  const abortRef = useRef(null);
  const fetchData = useCallback(async (fetchPage) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      setLoading(true);
      const p = fetchPage || page;
      const params = new URLSearchParams();
      if (globalFilters.kms_year) params.append("kms_year", globalFilters.kms_year);
      if (globalFilters.season) params.append("season", globalFilters.season);
      Object.entries(regFilters).forEach(([k, v]) => { if (v) params.append(k, v); });
      params.append("page", p);
      params.append("page_size", PAGE_SIZE);

      const [entRes, totRes] = await Promise.all([
        axios.get(`${API}/entries?${params}`, { signal: ctrl.signal }),
        axios.get(`${API}/totals?${params}`, { signal: ctrl.signal })
      ]);
      if (!ctrl.signal.aborted) {
        const data = entRes.data;
        setEntries(data.entries || []);
        setTotalPages(data.total_pages || 1);
        setTotalCount(data.total || 0);
        setPage(data.page || 1);
        setTotals(totRes.data);
      }
    } catch (e) {
      if (!ctrl.signal.aborted) toast.error("Data load nahi hua");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [globalFilters.kms_year, globalFilters.season, regFilters, page]);

  useEffect(() => {
    const timer = setTimeout(() => fetchData(), 300);
    return () => { clearTimeout(timer); if (abortRef.current) abortRef.current.abort(); };
  }, [fetchData]);

  const buildExportParams = () => {
    const params = new URLSearchParams();
    if (globalFilters.kms_year) params.append("kms_year", globalFilters.kms_year);
    if (globalFilters.season) params.append("season", globalFilters.season);
    Object.entries(regFilters).forEach(([k, v]) => { if (v) params.append(k, v); });
    params.append("report_title", "Paddy Purchase Register / पैडी खरीद रजिस्टर");
    return params.toString();
  };

  const dateLabel = () => {
    if (regFilters.date_from && regFilters.date_to) return `${regFilters.date_from} to ${regFilters.date_to}`;
    return regFilters.date_from || regFilters.date_to || "All Dates";
  };

  const sendWhatsApp = async () => {
    setSending("wa");
    try {
      const res = await axios.post(`${API}/whatsapp/send-pdf`, {
        pdf_url: `/api/export/pdf?${buildExportParams()}`,
        text: `*Paddy Purchase Register*\n${dateLabel()} | FY: ${globalFilters.kms_year || "All"} | ${totalCount} entries`
      });
      if (res.data.success) toast.success(res.data.message || "WhatsApp bhej diya!");
      else toast.error(res.data.error || "WhatsApp send fail");
    } catch (e) { toast.error(e.response?.data?.detail || "WhatsApp send error"); }
    finally { setSending(""); }
  };

  const openGroupDialog = () => {
    setGroupText(`*Paddy Purchase Register*\n${dateLabel()} | FY: ${globalFilters.kms_year || "All"} | ${totalCount} entries`);
    setGroupPdfUrl(`/api/export/pdf?${buildExportParams()}`);
    setGroupDialogOpen(true);
  };

  const sendTelegram = async () => {
    setSending("tg");
    try {
      const res = await axios.post(`${API}/telegram/send-custom`, {
        pdf_url: `/api/export/pdf?${buildExportParams()}`,
        text: `Paddy Purchase Register | ${dateLabel()} | FY: ${globalFilters.kms_year || "All"} | ${totalCount} entries`
      });
      if (res.data.success) toast.success(res.data.message || "Telegram bhej diya!");
      else toast.error("Telegram send fail");
    } catch (e) { toast.error(e.response?.data?.detail || "Telegram send error"); }
    finally { setSending(""); }
  };

  const clearFilters = () => {
    setRegFilters({ date_from: "", date_to: "", rst_no: "", tp_no: "", truck_no: "", agent_name: "", mandi_name: "" });
    setPage(1);
  };

  const hasFilters = Object.values(regFilters).some(v => v);

  const fmt = (v, div100) => {
    if (v === undefined || v === null) return "-";
    const n = div100 ? v / 100 : v;
    return n ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "-";
  };

  return (
    <div className="space-y-4" data-testid="paddy-purchase-register">
      {/* Header Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-amber-400">
          Paddy Purchase Register ({totalCount.toLocaleString()} entries)
        </h2>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setShowFilters(!showFilters)}
            className="border-slate-600 text-slate-300" data-testid="ppr-toggle-filters">
            <Filter className="w-4 h-4 mr-1" /> Filters
          </Button>
          <Button size="sm" onClick={() => window.open(`${API}/export/excel?${buildExportParams()}`, "_blank")}
            className="bg-green-700 hover:bg-green-600 text-white" data-testid="ppr-download-excel">
            <Download className="w-4 h-4 mr-1" /> Excel
          </Button>
          <Button size="sm" onClick={() => window.open(`${API}/export/pdf?${buildExportParams()}`, "_blank")}
            className="bg-red-700 hover:bg-red-600 text-white" data-testid="ppr-download-pdf">
            <FileText className="w-4 h-4 mr-1" /> PDF
          </Button>
          {wa && (
            <Button size="sm" onClick={sendWhatsApp} disabled={!!sending}
              className="bg-[#25D366] hover:bg-[#1da851] text-white" data-testid="ppr-send-wa">
              {sending === "wa" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <WhatsAppIcon />}
              <span className="ml-1">WhatsApp</span>
            </Button>
          )}
          {wa && (
            <Button size="sm" onClick={openGroupDialog} variant="outline"
              className="border-teal-600 text-teal-400 hover:bg-teal-900/30" data-testid="ppr-send-wa-group">
              <Users className="w-4 h-4 mr-1" /> Group
            </Button>
          )}
          {tg && (
            <Button size="sm" onClick={sendTelegram} disabled={!!sending}
              className="bg-[#0088cc] hover:bg-[#006da3] text-white" data-testid="ppr-send-tg">
              {sending === "tg" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <TelegramIcon />}
              <span className="ml-1">Telegram</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      {showFilters && (
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700" data-testid="ppr-filters">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 items-end">
            <div>
              <Label className="text-slate-400 text-xs">From Date</Label>
              <Input type="date" value={regFilters.date_from}
                onChange={e => setRegFilters(p => ({ ...p, date_from: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="ppr-date-from" />
            </div>
            <div>
              <Label className="text-slate-400 text-xs">To Date</Label>
              <Input type="date" value={regFilters.date_to}
                onChange={e => setRegFilters(p => ({ ...p, date_to: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="ppr-date-to" />
            </div>
            <div>
              <Label className="text-slate-400 text-xs">RST No</Label>
              <Input value={regFilters.rst_no} placeholder="RST..."
                onChange={e => setRegFilters(p => ({ ...p, rst_no: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="ppr-rst" />
            </div>
            <div>
              <Label className="text-slate-400 text-xs">TP No</Label>
              <Input value={regFilters.tp_no} placeholder="TP..."
                onChange={e => setRegFilters(p => ({ ...p, tp_no: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="ppr-tp" />
            </div>
            <div>
              <Label className="text-slate-400 text-xs">Truck No</Label>
              <Input value={regFilters.truck_no} placeholder="Truck..."
                onChange={e => setRegFilters(p => ({ ...p, truck_no: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="ppr-truck" />
            </div>
            <div>
              <Label className="text-slate-400 text-xs">Agent</Label>
              <Input value={regFilters.agent_name} placeholder="Agent..."
                onChange={e => setRegFilters(p => ({ ...p, agent_name: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="ppr-agent" />
            </div>
            <div>
              <Label className="text-slate-400 text-xs">Mandi</Label>
              <Input value={regFilters.mandi_name} placeholder="Mandi..."
                onChange={e => setRegFilters(p => ({ ...p, mandi_name: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="ppr-mandi" />
            </div>
            {hasFilters && (
              <Button size="sm" variant="ghost" onClick={clearFilters}
                className="text-red-400 hover:text-red-300 h-8" data-testid="ppr-clear-filters">
                <X className="w-4 h-4 mr-1" /> Clear
              </Button>
            )}
          </div>
        </div>
      )}

      {/* View Entry Dialog */}
      {viewEntry && <ViewEntryDialog entry={viewEntry} onClose={() => setViewEntry(null)} />}

      {/* Data Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-sm" data-testid="ppr-table">
          <thead>
            <tr className="bg-slate-800 text-slate-300 text-xs">
              <th className="p-2 text-left whitespace-nowrap">#</th>
              <th className="p-2 text-left whitespace-nowrap">Date</th>
              <th className="p-2 text-left whitespace-nowrap">Truck No</th>
              <th className="p-2 text-left whitespace-nowrap">RST</th>
              <th className="p-2 text-left whitespace-nowrap">TP</th>
              <th className="p-2 text-right whitespace-nowrap">TP Wt</th>
              <th className="p-2 text-left whitespace-nowrap">Agent</th>
              <th className="p-2 text-left whitespace-nowrap">Mandi</th>
              <th className="p-2 text-right whitespace-nowrap">QNTL</th>
              <th className="p-2 text-right whitespace-nowrap">Bags</th>
              <th className="p-2 text-right whitespace-nowrap">G.Dep</th>
              <th className="p-2 text-right whitespace-nowrap">GBW Cut</th>
              <th className="p-2 text-right whitespace-nowrap">P.Pkt</th>
              <th className="p-2 text-right whitespace-nowrap">Mill W</th>
              <th className="p-2 text-right whitespace-nowrap">Moist%</th>
              <th className="p-2 text-right whitespace-nowrap">Cut%</th>
              <th className="p-2 text-right whitespace-nowrap">D/D/P</th>
              <th className="p-2 text-right whitespace-nowrap">Final W</th>
              <th className="p-2 text-right whitespace-nowrap">G.Issued</th>
              <th className="p-2 text-center whitespace-nowrap w-10">View</th>
            </tr>
          </thead>
          <tbody className="text-slate-200">
            {loading ? (
              <tr><td colSpan={20} className="p-8 text-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading...
              </td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={20} className="p-8 text-center text-slate-500">Koi entry nahi mili</td></tr>
            ) : entries.map((e, i) => (
              <tr key={e.id || i} className={`border-t border-slate-700/50 ${i % 2 === 0 ? 'bg-slate-800/30' : 'bg-slate-800/10'} hover:bg-slate-700/30 cursor-pointer`}
                onClick={() => setViewEntry(e)}
                data-testid={`ppr-row-${i}`}>
                <td className="p-2 text-slate-500 text-xs">{(page - 1) * PAGE_SIZE + i + 1}</td>
                <td className="p-2 whitespace-nowrap">{fmtDate(e.date)}</td>
                <td className="p-2 whitespace-nowrap font-mono text-xs">{e.truck_no}</td>
                <td className="p-2 whitespace-nowrap">{e.rst_no}</td>
                <td className="p-2 whitespace-nowrap">{e.tp_no}</td>
                <td className="p-2 text-right font-mono">{Number(e.tp_weight || 0) > 0 ? Number(e.tp_weight).toLocaleString() : '-'}</td>
                <td className="p-2 whitespace-nowrap">{e.agent_name}</td>
                <td className="p-2 whitespace-nowrap">{e.mandi_name}</td>
                <td className="p-2 text-right">{fmt(e.qntl)}</td>
                <td className="p-2 text-right">{e.bag || "-"}</td>
                <td className="p-2 text-right">{e.g_deposite || "-"}</td>
                <td className="p-2 text-right">{fmt(e.gbw_cut)}</td>
                <td className="p-2 text-right">{e.plastic_bag || "-"}</td>
                <td className="p-2 text-right">{fmt(e.mill_w, true)}</td>
                <td className="p-2 text-right">{e.moisture || "-"}</td>
                <td className="p-2 text-right">{e.cutting_percent || "-"}</td>
                <td className="p-2 text-right">{e.disc_dust_poll || "-"}</td>
                <td className="p-2 text-right font-semibold text-amber-300">{fmt(e.final_w, true)}</td>
                <td className="p-2 text-right">{e.g_issued || "-"}</td>
                <td className="p-2 text-center">
                  <Button size="sm" variant="ghost" onClick={(ev) => { ev.stopPropagation(); setViewEntry(e); }}
                    className="h-6 w-6 p-0 text-amber-400 hover:text-amber-300 hover:bg-amber-900/30"
                    data-testid={`ppr-view-btn-${i}`} title="View Details">
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {totals && entries.length > 0 && (
              <tr className="border-t-2 border-amber-500/50 bg-amber-500/10 font-semibold text-amber-300">
                <td colSpan={7} className="p-2 text-right">TOTAL</td>
                <td className="p-2 text-right">{fmt(totals.total_qntl)}</td>
                <td className="p-2 text-right">{totals.total_bag || "-"}</td>
                <td className="p-2 text-right">{totals.total_g_deposite || "-"}</td>
                <td className="p-2 text-right">{fmt(totals.total_gbw_cut)}</td>
                <td className="p-2 text-right">-</td>
                <td className="p-2 text-right">{fmt(totals.total_mill_w, true)}</td>
                <td className="p-2 text-right">-</td>
                <td className="p-2 text-right">-</td>
                <td className="p-2 text-right">{totals.total_disc_dust_poll || "-"}</td>
                <td className="p-2 text-right font-bold">{fmt(totals.total_final_w, true)}</td>
                <td className="p-2 text-right">{totals.total_g_issued || "-"}</td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2" data-testid="ppr-pagination">
          <Button size="sm" variant="outline" onClick={() => { setPage(p => Math.max(1, p - 1)); fetchData(Math.max(1, page - 1)); }}
            disabled={page <= 1} className="border-slate-600 text-slate-300 h-8">Prev</Button>
          <span className="text-slate-400 text-sm">{page} / {totalPages}</span>
          <Button size="sm" variant="outline" onClick={() => { setPage(p => Math.min(totalPages, p + 1)); fetchData(Math.min(totalPages, page + 1)); }}
            disabled={page >= totalPages} className="border-slate-600 text-slate-300 h-8">Next</Button>
        </div>
      )}

      {/* WhatsApp Group Send Dialog */}
      <SendToGroupDialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}
        text={groupText} pdfUrl={groupPdfUrl} />
    </div>
  );
}
