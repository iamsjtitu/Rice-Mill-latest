// 🛻 Truck Owner Per-Trip Bhada Panel — light-theme friendly, icon actions, full payment flow.
// Backend: /api/truck-owner/{vno}/per-trip · /settle/{rst} · /trip-history/{rst}

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Truck, CheckCircle2, AlertTriangle,
  Download, FileText, Send, IndianRupee, History, Printer, Users,
  Loader2, RefreshCw, Search, X,
} from "lucide-react";
import PaymentAccountSelect from "./common/PaymentAccountSelect";
import RoundOffInput from "./common/RoundOffInput";
import { useConfirm } from "./ConfirmProvider";
import { safePrintHTML } from "../utils/print";
import { buildSlipReceipt, fmtRupee } from "../utils/slipReceipt";
import { SendToGroupDialog } from "./SendToGroupDialog";

const _isElectron = typeof window !== "undefined" && (window.electronAPI || window.ELECTRON_API_URL);
const API = `${_isElectron ? "" : (process.env.REACT_APP_BACKEND_URL || "")}/api`;

const fmtINR = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const fmtDateShort = (s) => {
  if (!s) return "—";
  try {
    const [y, m, d] = s.split("-");
    return `${d}-${["", "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m)] || m}-${y}`;
  } catch { return s; }
};

// ── Main Per-Trip Panel ──
export default function TruckOwnerPerTripPanel({ filters, user, branding, onPaymentMade }) {
  const brand = branding || { company_name: "Rice Mill", tagline: "" };
  const showConfirm = useConfirm();
  const [searchQ, setSearchQ] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Group dialog (Send to WhatsApp Group)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupText, setGroupText] = useState("");
  const [groupPdfUrl, setGroupPdfUrl] = useState("");

  // Pay dialog state
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payTrip, setPayTrip] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payRoundOff, setPayRoundOff] = useState("");
  const [payAcct, setPayAcct] = useState({ account: 'cash', bank_name: '', owner_name: '' });
  const [paySubmitting, setPaySubmitting] = useState(false);

  // History dialog state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTrip, setHistoryTrip] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Fetch all trips across all trucks (default view)
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters?.kms_year) params.append("kms_year", filters.kms_year);
      if (filters?.season) params.append("season", filters.season);
      const r = await axios.get(`${API}/truck-owner/per-trip-all?${params}`);
      setData(r.data);
    } catch (e) {
      toast.error("Per-trip data load failed: " + (e?.response?.data?.detail || e?.message));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters?.kms_year, filters?.season]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const trips = (data?.trips || []).filter((t) => {
    if (filter !== "all" && t.trans_type !== filter) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      const hay = `${t.vehicle_no || ''} ${t.party_name || ''} ${t.farmer_name || ''} ${t.rst_no || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const sm = data?.summary || { total_trips: 0, sale_count: 0, purchase_count: 0, total_bhada: 0, total_paid: 0, total_pending: 0, settled_count: 0, partial_count: 0, pending_count: 0 };

  // ── Actions ───────────────────────────────────────────────────────
  const openPay = (trip) => {
    setPayTrip(trip);
    setPayAmount(String(trip.pending_amount || 0));
    setPayNote("");
    setPayRoundOff("");
    setPayAcct({ account: 'cash', bank_name: '', owner_name: '' });
    setPayDialogOpen(true);
  };

  const submitPay = async () => {
    if (!payTrip || !payTrip.vehicle_no) return;
    const amt = parseFloat(payAmount) || 0;
    if (amt <= 0) { toast.error("Amount > 0 hona chahiye"); return; }
    if (payAcct.account === 'bank' && !payAcct.bank_name) { toast.error("Bank select karein"); return; }
    if (payAcct.account === 'owner' && !payAcct.owner_name) { toast.error("Owner account select karein"); return; }
    setPaySubmitting(true);
    try {
      await axios.post(`${API}/truck-owner/${encodeURIComponent(payTrip.vehicle_no)}/settle/${payTrip.rst_no}`, {
        amount: amt,
        note: payNote,
        round_off: parseFloat(payRoundOff) || 0,
        account: payAcct.account,
        bank_name: payAcct.bank_name,
        owner_name: payAcct.owner_name,
        username: user?.username || "admin",
      });
      toast.success(`RST #${payTrip.rst_no} (${payTrip.vehicle_no}) ka ${fmtINR(amt)} payment ho gaya — ${payAcct.account === 'cash' ? 'Cash' : payAcct.account === 'bank' ? `Bank: ${payAcct.bank_name}` : `Owner: ${payAcct.owner_name}`} se kata`);
      setPayDialogOpen(false);
      fetchAll();
      if (typeof onPaymentMade === 'function') onPaymentMade();
    } catch (e) {
      toast.error("Payment failed: " + (e?.response?.data?.detail || e?.message));
    } finally {
      setPaySubmitting(false);
    }
  };

  const handleMarkPaid = async (trip) => {
    if (!trip.pending_amount || !trip.vehicle_no) return;
    if (!await showConfirm("Mark Paid", `${trip.vehicle_no} — RST #${trip.rst_no} ka full pending bhada ${fmtINR(trip.pending_amount)} cash se settle kar dein?`)) return;
    try {
      await axios.post(`${API}/truck-owner/${encodeURIComponent(trip.vehicle_no)}/settle/${trip.rst_no}`, {
        amount: trip.pending_amount, account: 'cash', username: user?.username || "admin",
        note: 'Quick mark-paid',
      });
      toast.success(`RST #${trip.rst_no} (${trip.vehicle_no}) settled (cash)`);
      fetchAll();
      if (typeof onPaymentMade === 'function') onPaymentMade();
    } catch (e) {
      toast.error("Mark paid failed: " + (e?.response?.data?.detail || e?.message));
    }
  };

  const openHistory = async (trip) => {
    setHistoryTrip(trip);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters?.kms_year) params.append("kms_year", filters.kms_year);
      const r = await axios.get(`${API}/truck-owner/${encodeURIComponent(trip.vehicle_no)}/trip-history/${trip.rst_no}?${params}`);
      setHistoryData(r.data?.payments || []);
    } catch (e) {
      toast.error("History load failed: " + (e?.message || ""));
      setHistoryData([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Build query params honoring all active filters (kms_year, season, filter_status, trans_type, search).
  const _exportParams = () => {
    const params = new URLSearchParams();
    if (filters?.kms_year) params.append("kms_year", filters.kms_year);
    if (filters?.season) params.append("season", filters.season);
    if (statusFilter && statusFilter !== "all") params.append("filter_status", statusFilter);
    if (filter && filter !== "all") params.append("trans_type", filter);
    if (searchQ.trim()) params.append("search", searchQ.trim());
    return params;
  };

  const handleHeaderExport = (kind) => {
    if (!data || (data?.summary?.total_trips || 0) === 0) { toast.error("Koi trips nahi"); return; }
    const params = _exportParams();
    const ep = kind === "pdf" ? "per-trip-all/pdf" : "per-trip-all/excel";
    window.open(`${API}/truck-owner/${ep}?${params}`, "_blank");
    toast.success(`${kind === 'pdf' ? 'PDF' : 'Excel'} download started — ${trips.length} trips`, { duration: 3000 });
  };

  const handleHeaderWhatsApp = async () => {
    // Single-truck only: derive vehicle_no from active search OR currently visible trips.
    const trucksInView = [...new Set(trips.map(t => t.vehicle_no))];
    if (trucksInView.length === 0) { toast.error("Koi trips nahi"); return; }
    if (trucksInView.length > 1) {
      toast.warning("WhatsApp text ek truck ke liye hi banta hai — pehle search karke ek truck filter karein", { duration: 4000 });
      return;
    }
    try {
      const params = new URLSearchParams();
      if (filters?.kms_year) params.append("kms_year", filters.kms_year);
      params.append("filter_status", statusFilter !== "all" ? statusFilter : "pending");
      const r = await axios.get(`${API}/truck-owner/${encodeURIComponent(trucksInView[0])}/whatsapp-text?${params}`);
      const text = r.data?.text || "";
      if (text) {
        try {
          await navigator.clipboard.writeText(text);
          toast.success("WhatsApp text copy ho gaya — kisi bhi WhatsApp chat me paste karein", { duration: 4000 });
        } catch {
          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
        }
      }
    } catch (e) {
      toast.error("WhatsApp text generate failed: " + (e?.message || ""));
    }
  };

  /** Send to Group — opens dialog with consolidated all-trucks summary text + PDF link.
   *  Aggregates current visible trips so user can broadcast filtered view to a WhatsApp group. */
  const handleHeaderGroup = () => {
    const sm2 = data?.summary || sm;
    const trucksInView = [...new Set(trips.map(t => t.vehicle_no))];
    if (trucksInView.length === 0) { toast.error("Koi trips nahi"); return; }

    const flt = [];
    if (statusFilter !== "all") flt.push(`Status: ${statusFilter}`);
    if (filter !== "all") flt.push(`Type: ${filter}`);
    if (searchQ.trim()) flt.push(`Search: ${searchQ.trim()}`);
    const fltLine = flt.length ? `\n_Filter: ${flt.join(' · ')}_\n` : '\n';

    const lines = [];
    lines.push(`*🛻 Per-Trip Bhada Summary*${fltLine}`);
    lines.push(`📊 Trucks: *${trucksInView.length}*  ·  Trips: *${trips.length}*`);
    lines.push(`💰 Total Bhada: *${fmtINR(sm2.total_bhada)}*`);
    lines.push(`✅ Settled: *${fmtINR(sm2.total_paid)}*  (${sm2.settled_count})`);
    lines.push(`⚠️ Pending: *${fmtINR(sm2.total_pending)}*  (${sm2.pending_count + sm2.partial_count})`);
    if (trucksInView.length <= 5) {
      lines.push('');
      lines.push('*Truck-wise:*');
      const truckSummary = {};
      trips.forEach(t => {
        if (!truckSummary[t.vehicle_no]) truckSummary[t.vehicle_no] = { trips: 0, bhada: 0, pending: 0 };
        truckSummary[t.vehicle_no].trips++;
        truckSummary[t.vehicle_no].bhada += t.bhada || 0;
        truckSummary[t.vehicle_no].pending += t.pending_amount || 0;
      });
      Object.entries(truckSummary).forEach(([vno, d]) => {
        const stEmoji = d.pending === 0 ? '✅' : d.pending < d.bhada ? '🟡' : '⚠️';
        lines.push(`${stEmoji} *${vno}* — ${d.trips} trips · ${fmtINR(d.bhada)} bhada · ${fmtINR(d.pending)} pending`);
      });
    }

    setGroupText(lines.join('\n'));
    // Build PDF URL with active filters so the dialog can attach it
    const params = new URLSearchParams();
    if (filters?.kms_year) params.append("kms_year", filters.kms_year);
    if (filters?.season) params.append("season", filters.season);
    if (statusFilter !== "all") params.append("filter_status", statusFilter);
    if (filter !== "all") params.append("trans_type", filter);
    if (searchQ.trim()) params.append("search", searchQ.trim());
    setGroupPdfUrl(`${API}/truck-owner/per-trip-all/pdf?${params.toString()}`);
    setGroupDialogOpen(true);
  };

  // ── Print Compact E-Receipt for a single trip (uses shared slip builder) ──
  const handlePrintTripReceipt = (t) => {
    if (!t || !t.vehicle_no) return;
    const netQtl = (Number(t.net_wt || 0) / 100).toFixed(2);
    const statusLabel = t.status === 'settled' ? 'PAID' : t.status === 'partial' ? 'PARTIAL' : 'PENDING';
    const tagLabel = t.trans_type === 'sale' ? 'Sale' : t.trans_type === 'purchase' ? 'Purchase' : (t.trans_type_raw || '-');

    const sections = [
      { label: "Receipt:", value: new Date().toLocaleDateString('en-IN') },
      { label: "Trip Date:", value: fmtDateShort(t.date) },
      { label: "RST No:", value: `#${t.rst_no}`, bold: true },
      { label: "Truck:", value: t.vehicle_no, bold: true },
      { label: "Type:", value: tagLabel },
      null, // dashed separator
      { label: "Party:", value: (t.party_name || '-').slice(0, 22) },
      ...(t.farmer_name ? [{ label: "Dest:", value: String(t.farmer_name).slice(0, 22) }] : []),
      ...(t.product ? [{ label: "Product:", value: t.product }] : []),
      { label: "Bags:", value: Number(t.tot_pkts || 0).toLocaleString() },
      { label: "Net Wt:", value: `${netQtl} QNTL` },
    ];
    const amounts = [
      { label: "BHADA", value: fmtRupee(t.bhada), bold: true },
      { label: "Paid:", value: fmtRupee(t.paid_amount), color: "#059669" },
      { label: "BALANCE", value: fmtRupee(t.pending_amount), bold: true, color: t.pending_amount > 0 ? "#dc2626" : "#059669" },
    ];

    const html = buildSlipReceipt({
      brand,
      title: "BHADA RECEIPT",
      subtitle: "भाड़ा रसीद",
      sections,
      amounts,
      statusLabel,
    });
    safePrintHTML(html);
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Truck className="w-5 h-5 text-amber-400" />
              <span className="text-amber-400">Per-Trip Bhada</span>
              <span className="text-slate-400 font-normal text-sm">— All Trucks (पर ट्रिप)</span>
              {data?.total_trucks > 0 && <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-200">{data.total_trucks} trucks</span>}
            </CardTitle>
            <p className="text-slate-400 text-xs mt-1">Sab trucks ka data — RST/truck/party search se filter karein. 1-click Pay (Cash/Bank/Owner)</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative w-[260px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <Input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search truck / RST / party..."
                className="pl-8 h-9 text-sm bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-400"
                data-testid="truck-pertrip-search"
              />
              {searchQ && (
                <button type="button" onClick={() => setSearchQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Button size="sm" variant="ghost" onClick={fetchAll} disabled={loading}
              className="h-9 w-9 p-0 text-slate-300 hover:bg-slate-700 border border-slate-600" title="Refresh" data-testid="truck-pertrip-refresh">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>

            {/* Icon-only export group */}
            <div className="flex items-center gap-1 ml-1 pl-2 border-l border-slate-600" data-testid="truck-pertrip-export-group">
              <Button size="sm" variant="ghost" onClick={() => handleHeaderExport("pdf")} disabled={loading}
                className="h-9 w-9 p-0 text-red-400 hover:bg-red-900/30 border border-red-600 disabled:opacity-50" title="PDF Export (current filters apply)" data-testid="truck-pertrip-pdf">
                <FileText className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleHeaderExport("excel")} disabled={loading}
                className="h-9 w-9 p-0 text-emerald-400 hover:bg-emerald-900/30 border border-emerald-600 disabled:opacity-50" title="Excel Export (current filters apply)" data-testid="truck-pertrip-excel">
                <Download className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleHeaderWhatsApp} disabled={loading}
                className="h-9 w-9 p-0 text-green-400 hover:bg-green-900/30 border border-green-600 disabled:opacity-50" title="WhatsApp text (single truck — search to filter)" data-testid="truck-pertrip-whatsapp">
                <Send className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleHeaderGroup} disabled={loading}
                className="h-9 w-9 p-0 text-cyan-400 hover:bg-cyan-900/30 border border-cyan-600 disabled:opacity-50" title="Send to Group (consolidated summary + PDF)" data-testid="truck-pertrip-group">
                <Users className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {(!data || (data?.summary?.total_trips === 0)) && !loading && (
          <div className="text-center py-12 text-slate-400">
            <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Koi truck/trip nahi mila jo bhada wali entries rakhta ho.</p>
            <p className="text-xs mt-1 opacity-70">Vehicle Weight / BP Sale / DC Delivery / Sale-Purchase Voucher me Bhada add karein → yahan dikhne lagega.</p>
          </div>
        )}

        {data && (data?.summary?.total_trips > 0 || loading) && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-3">
              <div className="flex gap-1">
                {[["all","All"],["sale","Sale"],["purchase","Purchase"]].map(([v,l]) => (
                  <Button key={v} size="sm" variant={filter===v?"default":"outline"} onClick={()=>setFilter(v)}
                    className={filter===v?"bg-cyan-500 hover:bg-cyan-600 text-slate-900 h-8 text-xs":"h-8 text-xs border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600"}
                    data-testid={`truck-pertrip-filter-${v}`}>
                    {l}
                  </Button>
                ))}
              </div>
              <div className="flex gap-1 border-l border-slate-700 pl-2">
                {[["all","All"],["pending","Pending"],["partial","Partial"],["settled","Settled"]].map(([v,l]) => (
                  <Button key={v} size="sm" variant={statusFilter===v?"default":"outline"} onClick={()=>setStatusFilter(v)}
                    className={statusFilter===v
                      ? (v==="pending"?"bg-rose-600 hover:bg-rose-700 text-white h-8 text-xs":v==="settled"?"bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs":v==="partial"?"bg-amber-500 hover:bg-amber-600 text-slate-900 h-8 text-xs":"bg-slate-500 text-white h-8 text-xs")
                      : "h-8 text-xs border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600"}
                    data-testid={`truck-pertrip-status-${v}`}>
                    {l}
                  </Button>
                ))}
              </div>
            </div>

            {/* Table — column order matches user request: RST · Date · Type · Party · Destination · Net Wt(qntl) · Bag · Bhada · Paid · Pending · Status · Actions */}
            <div className="rounded-lg border border-slate-700 bg-slate-900/40 overflow-hidden overflow-x-auto">
              {loading ? (
                <div className="p-12 flex items-center justify-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading trips...
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-600 bg-slate-800">
                      <TableHead className="text-slate-300">RST</TableHead>
                      <TableHead className="text-slate-300">Date</TableHead>
                      <TableHead className="text-slate-300">Truck No</TableHead>
                      <TableHead className="text-slate-300">Type</TableHead>
                      <TableHead className="text-slate-300">Party</TableHead>
                      <TableHead className="text-slate-300">Destination</TableHead>
                      <TableHead className="text-slate-300 text-right">Bhada</TableHead>
                      <TableHead className="text-slate-300 text-right">Paid</TableHead>
                      <TableHead className="text-slate-300 text-right">Pending</TableHead>
                      <TableHead className="text-slate-300 text-center">Status</TableHead>
                      <TableHead className="text-slate-300 text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trips.length === 0 ? (
                      <TableRow><TableCell colSpan={11} className="text-center text-slate-500 py-8 text-sm">Filter ke andar koi trip nahi — change karke try karein.</TableCell></TableRow>
                    ) : trips.map((t) => {
                      const isAdmin = user?.role === 'admin';
                      return (
                        <TableRow key={`${t.vehicle_no}-${t.rst_no}-${t.date}`} className="border-slate-700 hover:bg-slate-700/40">
                          <TableCell className="font-mono font-bold text-amber-300">#{t.rst_no}</TableCell>
                          <TableCell className="text-slate-200 text-sm">{fmtDateShort(t.date)}</TableCell>
                          <TableCell className="font-mono text-sky-300 text-sm font-bold">{t.vehicle_no || '—'}</TableCell>
                          <TableCell>
                            {t.trans_type === "sale" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-600 text-white">Sale</span>
                            ) : t.trans_type === "purchase" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-cyan-600 text-white">Purchase</span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-400 text-xs">{t.trans_type_raw || "Other"}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-slate-200 text-sm max-w-[180px] truncate">{t.party_name || "—"}</TableCell>
                          <TableCell className="text-slate-300 text-sm max-w-[180px] truncate">{t.farmer_name || "—"}</TableCell>
                          <TableCell className="text-amber-300 font-bold text-right">{fmtINR(t.bhada)}</TableCell>
                          <TableCell className="text-emerald-400 text-sm text-right">{t.paid_amount > 0 ? fmtINR(t.paid_amount) : "—"}</TableCell>
                          <TableCell className="text-rose-400 font-bold text-right">{t.pending_amount > 0 ? fmtINR(t.pending_amount) : "—"}</TableCell>
                          <TableCell className="text-center">
                            {t.status === "settled" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500 text-white"><CheckCircle2 className="w-3 h-3"/>Settled</span>
                            ) : t.status === "partial" ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-400 text-slate-900">Partial</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500 text-white"><AlertTriangle className="w-3 h-3"/>Pending</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex gap-1 items-center justify-center">
                              {isAdmin && t.status !== 'settled' && (
                                <>
                                  <Button size="sm" variant="ghost" title="Make Payment (Cash/Bank/Owner)"
                                    onClick={() => openPay(t)}
                                    className="h-7 w-7 p-0 text-emerald-400 hover:bg-emerald-900/30 border border-emerald-600"
                                    data-testid={`pertrip-pay-${t.rst_no}`}>
                                    <IndianRupee className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button size="sm" variant="ghost" title="Mark Paid (full pending — cash)"
                                    onClick={() => handleMarkPaid(t)}
                                    className="h-7 w-7 p-0 text-blue-400 hover:bg-blue-900/30 border border-blue-600"
                                    data-testid={`pertrip-markpaid-${t.rst_no}`}>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </Button>
                                </>
                              )}
                              <Button size="sm" variant="ghost" title="Payment History (this trip)"
                                onClick={() => openHistory(t)}
                                className="h-7 w-7 p-0 text-purple-400 hover:bg-purple-900/30 border border-purple-600"
                                data-testid={`pertrip-history-${t.rst_no}`}>
                                <History className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" title="Print Receipt (RST #)"
                                onClick={() => handlePrintTripReceipt(t)}
                                className="h-7 w-7 p-0 text-cyan-400 hover:bg-cyan-900/30 border border-cyan-600"
                                data-testid={`pertrip-print-${t.rst_no}`}>
                                <Printer className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" title="Send on WhatsApp"
                                onClick={handleHeaderWhatsApp}
                                className="h-7 w-7 p-0 text-green-400 hover:bg-green-900/30 border border-green-600"
                                data-testid={`pertrip-wa-${t.rst_no}`}>
                                <Send className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" title="Send to Group"
                                onClick={handleHeaderWhatsApp}
                                className="h-7 w-7 p-0 text-teal-400 hover:bg-teal-900/30 border border-teal-600"
                                data-testid={`pertrip-group-${t.rst_no}`}>
                                <Users className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        )}
      </CardContent>

      {/* ── Make Payment Dialog ─────────────────────────────────── */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-emerald-400">
              Make Payment — RST #{payTrip?.rst_no} <span className="text-slate-400 text-sm font-normal">({payTrip?.vehicle_no || ''})</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {payTrip && (
              <div className="bg-slate-700/50 rounded-lg p-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Bhada (Total):</span><span className="text-amber-300 font-bold">{fmtINR(payTrip.bhada)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Already Paid:</span><span className="text-emerald-400">{fmtINR(payTrip.paid_amount)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Pending:</span><span className="text-rose-400 font-bold">{fmtINR(payTrip.pending_amount)}</span></div>
                <div className="text-[10px] text-slate-500 mt-1">{payTrip.party_name} → {payTrip.farmer_name}</div>
              </div>
            )}
            <div>
              <Label className="text-slate-300 text-xs">Amount (₹)</Label>
              <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                placeholder={`Max: ${payTrip?.pending_amount?.toLocaleString()}`}
                className="bg-slate-700 border-slate-600 text-white mt-1" data-testid="pertrip-pay-amount" />
              <div className="flex gap-2 mt-1">
                <Button size="sm" variant="ghost" type="button" className="h-6 text-[10px] text-emerald-400 hover:bg-emerald-900/30"
                  onClick={() => setPayAmount(String(payTrip?.pending_amount || 0))}>Full</Button>
                <Button size="sm" variant="ghost" type="button" className="h-6 text-[10px] text-blue-400 hover:bg-blue-900/30"
                  onClick={() => setPayAmount(String((payTrip?.pending_amount || 0) / 2))}>Half</Button>
              </div>
            </div>
            <PaymentAccountSelect value={payAcct} onChange={setPayAcct} label="Payment Mode" testId="pertrip-pay-account-select" />
            <div>
              <Label className="text-slate-300 text-xs">Note (Optional)</Label>
              <Input value={payNote} onChange={(e) => setPayNote(e.target.value)}
                placeholder="Payment details..." className="bg-slate-700 border-slate-600 text-white mt-1" data-testid="pertrip-pay-note" />
            </div>
            <RoundOffInput value={payRoundOff} onChange={setPayRoundOff} amount={parseFloat(payAmount) || 0} />
            <Button onClick={submitPay} disabled={paySubmitting || !payAmount || parseFloat(payAmount) <= 0}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="pertrip-pay-submit">
              {paySubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : `Pay ${fmtINR(parseFloat(payAmount) || 0)}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Payment History Dialog ───────────────────────────────── */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-purple-400 flex items-center gap-2">
              <History className="w-4 h-4" />
              Payment History — RST #{historyTrip?.rst_no}
              <span className="text-slate-400 text-xs font-normal">({historyTrip?.vehicle_no || ''})</span>
            </DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="p-8 flex items-center justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...</div>
          ) : historyData.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">Is trip pe abhi tak koi direct payment nahi hua. Pay button click karke settle karein.</div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {historyData.map((p, idx) => (
                <div key={p.id || idx} className="bg-slate-700/40 border border-slate-600 rounded-lg p-3 text-sm">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-300">{fmtDateShort(p.date)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${p.account === 'ledger' ? 'bg-slate-600 text-slate-300' : p.account === 'cash' ? 'bg-amber-700 text-amber-100' : p.account === 'bank' ? 'bg-blue-700 text-blue-100' : 'bg-purple-700 text-purple-100'}`}>
                      {p.account === 'ledger' ? 'Ledger' : p.account === 'cash' ? 'Cash' : p.account === 'bank' ? `Bank: ${p.bank_name || ''}` : `Owner: ${p.owner_name || ''}`}
                    </span>
                  </div>
                  <div className="text-emerald-400 font-bold text-base">{fmtINR(p.amount)}</div>
                  {p.description && <div className="text-slate-400 text-xs mt-1">{p.description}</div>}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Send to Group Dialog */}
      <SendToGroupDialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen} text={groupText} pdfUrl={groupPdfUrl} />
    </Card>
  );
}
