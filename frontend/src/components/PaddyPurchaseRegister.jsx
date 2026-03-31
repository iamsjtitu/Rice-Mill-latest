import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileText, Send, Filter, X, Loader2 } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

export default function PaddyPurchaseRegister({ filters: globalFilters }) {
  const [entries, setEntries] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 100;

  const [regFilters, setRegFilters] = useState({
    date_from: "",
    date_to: "",
    rst_no: "",
    tp_no: "",
    truck_no: "",
    agent_name: "",
    mandi_name: ""
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
      if (regFilters.date_from) params.append("date_from", regFilters.date_from);
      if (regFilters.date_to) params.append("date_to", regFilters.date_to);
      if (regFilters.rst_no) params.append("rst_no", regFilters.rst_no);
      if (regFilters.tp_no) params.append("tp_no", regFilters.tp_no);
      if (regFilters.truck_no) params.append("truck_no", regFilters.truck_no);
      if (regFilters.agent_name) params.append("agent_name", regFilters.agent_name);
      if (regFilters.mandi_name) params.append("mandi_name", regFilters.mandi_name);
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
    if (regFilters.date_from) params.append("date_from", regFilters.date_from);
    if (regFilters.date_to) params.append("date_to", regFilters.date_to);
    if (regFilters.rst_no) params.append("rst_no", regFilters.rst_no);
    if (regFilters.tp_no) params.append("tp_no", regFilters.tp_no);
    if (regFilters.truck_no) params.append("truck_no", regFilters.truck_no);
    if (regFilters.agent_name) params.append("agent_name", regFilters.agent_name);
    if (regFilters.mandi_name) params.append("mandi_name", regFilters.mandi_name);
    return params.toString();
  };

  const downloadExcel = () => {
    window.open(`${API}/export/excel?${buildExportParams()}`, "_blank");
  };

  const downloadPDF = () => {
    window.open(`${API}/export/pdf?${buildExportParams()}`, "_blank");
  };

  const sendWhatsApp = async () => {
    setSending("wa");
    try {
      const pdfUrl = `/api/export/pdf?${buildExportParams()}`;
      const dateLabel = regFilters.date_from && regFilters.date_to
        ? `${regFilters.date_from} to ${regFilters.date_to}`
        : regFilters.date_from || regFilters.date_to || "All Dates";
      const res = await axios.post(`${API}/whatsapp/send-pdf`, {
        pdf_url: pdfUrl,
        text: `Paddy Purchase Register - ${dateLabel} | FY: ${globalFilters.kms_year || "All"} | ${totalCount} entries`
      });
      if (res.data.success) toast.success(res.data.message || "WhatsApp bhej diya!");
      else toast.error(res.data.error || "WhatsApp send fail");
    } catch (e) {
      toast.error(e.response?.data?.detail || "WhatsApp send error");
    } finally { setSending(""); }
  };

  const sendTelegram = async () => {
    setSending("tg");
    try {
      const pdfUrl = `/api/export/pdf?${buildExportParams()}`;
      const dateLabel = regFilters.date_from && regFilters.date_to
        ? `${regFilters.date_from} to ${regFilters.date_to}`
        : regFilters.date_from || regFilters.date_to || "All Dates";
      const res = await axios.post(`${API}/telegram/send-custom`, {
        pdf_url: pdfUrl,
        text: `Paddy Purchase Register - ${dateLabel} | FY: ${globalFilters.kms_year || "All"} | ${totalCount} entries`
      });
      if (res.data.success) toast.success(res.data.message || "Telegram bhej diya!");
      else toast.error("Telegram send fail");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Telegram send error");
    } finally { setSending(""); }
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
          <Button size="sm" onClick={downloadExcel} className="bg-green-700 hover:bg-green-600 text-white"
            data-testid="ppr-download-excel">
            <Download className="w-4 h-4 mr-1" /> Excel
          </Button>
          <Button size="sm" onClick={downloadPDF} className="bg-red-700 hover:bg-red-600 text-white"
            data-testid="ppr-download-pdf">
            <FileText className="w-4 h-4 mr-1" /> PDF
          </Button>
          <Button size="sm" onClick={sendWhatsApp} disabled={!!sending}
            className="bg-green-600 hover:bg-green-500 text-white" data-testid="ppr-send-wa">
            {sending === "wa" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            WhatsApp
          </Button>
          <Button size="sm" onClick={sendTelegram} disabled={!!sending}
            className="bg-blue-600 hover:bg-blue-500 text-white" data-testid="ppr-send-tg">
            {sending === "tg" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            Telegram
          </Button>
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
            </tr>
          </thead>
          <tbody className="text-slate-200">
            {loading ? (
              <tr><td colSpan={18} className="p-8 text-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading...
              </td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={18} className="p-8 text-center text-slate-500">Koi entry nahi mili</td></tr>
            ) : entries.map((e, i) => (
              <tr key={e.id || i} className={`border-t border-slate-700/50 ${i % 2 === 0 ? 'bg-slate-800/30' : 'bg-slate-800/10'} hover:bg-slate-700/30`}>
                <td className="p-2 text-slate-500 text-xs">{(page - 1) * PAGE_SIZE + i + 1}</td>
                <td className="p-2 whitespace-nowrap">{e.date}</td>
                <td className="p-2 whitespace-nowrap font-mono text-xs">{e.truck_no}</td>
                <td className="p-2 whitespace-nowrap">{e.rst_no}</td>
                <td className="p-2 whitespace-nowrap">{e.tp_no}</td>
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
              </tr>
            ))}
            {/* Totals row */}
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
    </div>
  );
}
