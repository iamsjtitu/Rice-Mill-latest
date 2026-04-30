// 🛻 Truck Owner Per-Trip Bhada Panel — light-theme friendly, icon actions, full payment flow.
// Backend: /api/truck-owner/{vno}/per-trip · /settle/{rst} · /trip-history/{rst}

import { useState, useEffect, useCallback, useRef } from "react";
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

// ── Searchable Combobox for trucks ──────────────────────────────────
function TruckCombobox({ trucks, value, onChange, disabled }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const display = value || "";
  const filtered = q.trim()
    ? trucks.filter(t => t.vehicle_no.toLowerCase().includes(q.toLowerCase()))
    : trucks;

  return (
    <div ref={wrapRef} className="relative w-[280px]">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <Input
          value={open ? q : display}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); setQ(""); }}
          placeholder="Truck search... (e.g. MH-12)"
          disabled={disabled}
          className="pl-8 h-9 text-sm bg-slate-700 border-slate-600 text-slate-100 font-mono placeholder:text-slate-400 placeholder:font-normal"
          data-testid="truck-pertrip-search"
        />
        {value && (
          <button type="button" onClick={() => { onChange(""); setQ(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-slate-600 bg-slate-800 shadow-2xl">
          {filtered.length === 0 ? (
            <div className="p-3 text-xs text-slate-400 text-center">Koi truck match nahi mila</div>
          ) : filtered.map(t => (
            <button
              type="button"
              key={t.vehicle_no}
              onClick={() => { onChange(t.vehicle_no); setOpen(false); setQ(""); }}
              className={`w-full text-left px-3 py-2 hover:bg-slate-700 flex items-center justify-between gap-2 ${value === t.vehicle_no ? 'bg-slate-700/60' : ''}`}
              data-testid={`truck-pertrip-option-${t.vehicle_no}`}
            >
              <span className="font-mono text-amber-300 text-sm font-semibold">{t.vehicle_no}</span>
              <span className="text-xs text-slate-400">{t.trips_count} trips · {fmtINR(t.total_bhada)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TruckOwnerPerTripPanel({ filters, user, branding }) {
  const brand = branding || { company_name: "Rice Mill", tagline: "" };
  const { showConfirm } = useConfirm();
  const [trucks, setTrucks] = useState([]);
  const [selectedTruck, setSelectedTruck] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [trucksLoading, setTrucksLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

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

  const loadTrucks = useCallback(async () => {
    setTrucksLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters?.kms_year) params.append("kms_year", filters.kms_year);
      if (filters?.season) params.append("season", filters.season);
      const r = await axios.get(`${API}/truck-owner/per-trip-trucks?${params}`);
      const list = r.data?.trucks || [];
      setTrucks(list);
      if (list.length && !selectedTruck) setSelectedTruck(list[0].vehicle_no);
      else if (!list.length) { setSelectedTruck(""); setData(null); }
    } catch (e) {
      toast.error("Truck list load failed: " + (e?.message || ""));
    } finally {
      setTrucksLoading(false);
    }
  }, [filters?.kms_year, filters?.season]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadTrucks(); }, [loadTrucks]);

  const fetchData = useCallback(async (vno) => {
    if (!vno) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters?.kms_year) params.append("kms_year", filters.kms_year);
      if (filters?.season) params.append("season", filters.season);
      const r = await axios.get(`${API}/truck-owner/${encodeURIComponent(vno)}/per-trip?${params}`);
      setData(r.data);
    } catch (e) {
      toast.error("Per-trip load failed: " + (e?.response?.data?.detail || e?.message));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters?.kms_year, filters?.season]);

  useEffect(() => { if (selectedTruck) fetchData(selectedTruck); }, [selectedTruck, fetchData]);

  const trips = (data?.trips || []).filter((t) =>
    (filter === "all" || t.trans_type === filter) &&
    (statusFilter === "all" || t.status === statusFilter)
  );
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
    if (!payTrip || !data?.vehicle_no) return;
    const amt = parseFloat(payAmount) || 0;
    if (amt <= 0) { toast.error("Amount > 0 hona chahiye"); return; }
    if (payAcct.account === 'bank' && !payAcct.bank_name) { toast.error("Bank select karein"); return; }
    if (payAcct.account === 'owner' && !payAcct.owner_name) { toast.error("Owner account select karein"); return; }
    setPaySubmitting(true);
    try {
      await axios.post(`${API}/truck-owner/${encodeURIComponent(data.vehicle_no)}/settle/${payTrip.rst_no}`, {
        amount: amt,
        note: payNote,
        round_off: parseFloat(payRoundOff) || 0,
        account: payAcct.account,
        bank_name: payAcct.bank_name,
        owner_name: payAcct.owner_name,
        username: user?.username || "admin",
      });
      toast.success(`RST #${payTrip.rst_no} ka ${fmtINR(amt)} payment ho gaya — ${payAcct.account === 'cash' ? 'Cash' : payAcct.account === 'bank' ? `Bank: ${payAcct.bank_name}` : `Owner: ${payAcct.owner_name}`} se kata`);
      setPayDialogOpen(false);
      fetchData(selectedTruck);
    } catch (e) {
      toast.error("Payment failed: " + (e?.response?.data?.detail || e?.message));
    } finally {
      setPaySubmitting(false);
    }
  };

  const handleMarkPaid = async (trip) => {
    if (!trip.pending_amount) return;
    if (!await showConfirm("Mark Paid", `RST #${trip.rst_no} ka full pending bhada ${fmtINR(trip.pending_amount)} cash se settle kar dein?`)) return;
    try {
      await axios.post(`${API}/truck-owner/${encodeURIComponent(data.vehicle_no)}/settle/${trip.rst_no}`, {
        amount: trip.pending_amount, account: 'cash', username: user?.username || "admin",
        note: 'Quick mark-paid',
      });
      toast.success(`RST #${trip.rst_no} settled (cash)`);
      fetchData(selectedTruck);
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
      const r = await axios.get(`${API}/truck-owner/${encodeURIComponent(data.vehicle_no)}/trip-history/${trip.rst_no}?${params}`);
      setHistoryData(r.data?.payments || []);
    } catch (e) {
      toast.error("History load failed: " + (e?.message || ""));
      setHistoryData([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleHeaderExport = (kind) => {
    if (!selectedTruck) return;
    const params = new URLSearchParams();
    if (filters?.kms_year) params.append("kms_year", filters.kms_year);
    if (filters?.season) params.append("season", filters.season);
    const ep = kind === "pdf" ? "per-trip-pdf" : "per-trip-excel";
    window.open(`${API}/truck-owner/${encodeURIComponent(selectedTruck)}/${ep}?${params}`, "_blank");
  };

  // ── Print Compact E-Receipt for a single trip (thermal-receipt style 80mm) ──
  const handlePrintTripReceipt = (t) => {
    if (!t || !data?.vehicle_no) return;
    const netQtl = (Number(t.net_wt || 0) / 100).toFixed(2);
    const statusLabel = t.status === 'settled' ? 'PAID' : t.status === 'partial' ? 'PARTIAL' : 'PENDING';
    const statusColor = t.status === 'settled' ? '#059669' : t.status === 'partial' ? '#d97706' : '#dc2626';
    const tagLabel = t.trans_type === 'sale' ? 'Sale' : t.trans_type === 'purchase' ? 'Purchase' : (t.trans_type_raw || '-');
    const html = `
      <!DOCTYPE html>
      <html><head><title>Receipt - ${data.vehicle_no} - RST #${t.rst_no}</title>
      <style>
        @page { size: 80mm auto; margin: 3mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; padding: 8px; background: #ddd; }
        .slip { width: 280px; margin: 0 auto; background: white; padding: 14px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-size: 11px; line-height: 1.5; color: #000; }
        .center { text-align: center; }
        .right  { text-align: right; }
        .bold   { font-weight: bold; }
        .big    { font-size: 13px; }
        .h1     { font-size: 15px; font-weight: bold; letter-spacing: 0.5px; }
        .h2     { font-size: 12px; font-weight: bold; }
        .dashed { border-top: 1px dashed #555; margin: 6px 0; }
        .row    { display: flex; justify-content: space-between; padding: 2px 0; }
        .row .lbl { color: #444; }
        .row .val { font-weight: 600; }
        .total-row { font-size: 13px; font-weight: bold; padding: 4px 0; }
        .badge { display: inline-block; padding: 3px 10px; border: 2px solid; border-radius: 3px; font-weight: bold; font-size: 12px; letter-spacing: 1px; }
        .sig    { margin-top: 28px; font-size: 10px; }
        .sig-line { border-top: 1px solid #000; padding-top: 2px; margin-top: 28px; }
        @media print {
          body { background: white; padding: 0; }
          .slip { box-shadow: none; padding: 6px 4px; }
          .no-print { display: none; }
        }
      </style></head><body>
        <div class="slip">
          <div class="center h1">${(brand.company_name || "RICE MILL").toUpperCase()}</div>
          ${brand.tagline ? `<div class="center" style="font-size:10px;color:#555;margin-top:2px;">${brand.tagline}</div>` : ""}
          <div class="dashed"></div>
          <div class="center bold big">BHADA RECEIPT</div>
          <div class="center" style="font-size:10px;color:#666;">भाड़ा रसीद</div>
          <div class="dashed"></div>
          <div class="row"><span class="lbl">Receipt:</span><span class="val">${new Date().toLocaleDateString('en-IN')}</span></div>
          <div class="row"><span class="lbl">Trip Date:</span><span class="val">${fmtDateShort(t.date)}</span></div>
          <div class="row"><span class="lbl">RST No:</span><span class="val bold">#${t.rst_no}</span></div>
          <div class="row"><span class="lbl">Truck:</span><span class="val bold">${data.vehicle_no}</span></div>
          <div class="row"><span class="lbl">Type:</span><span class="val">${tagLabel}</span></div>
          <div class="dashed"></div>
          <div class="row"><span class="lbl">Party:</span><span class="val">${(t.party_name || '-').slice(0,22)}</span></div>
          ${t.farmer_name ? `<div class="row"><span class="lbl">Dest:</span><span class="val">${t.farmer_name.slice(0,22)}</span></div>` : ""}
          ${t.product ? `<div class="row"><span class="lbl">Product:</span><span class="val">${t.product}</span></div>` : ""}
          <div class="row"><span class="lbl">Bags:</span><span class="val">${Number(t.tot_pkts || 0).toLocaleString()}</span></div>
          <div class="row"><span class="lbl">Net Wt:</span><span class="val">${netQtl} QNTL</span></div>
          <div class="dashed"></div>
          <div class="row total-row"><span>BHADA</span><span>Rs. ${Number(t.bhada || 0).toLocaleString('en-IN')}</span></div>
          <div class="row"><span class="lbl">Paid:</span><span class="val" style="color:#059669;">Rs. ${Number(t.paid_amount || 0).toLocaleString('en-IN')}</span></div>
          <div class="row total-row" style="color:${t.pending_amount > 0 ? '#dc2626' : '#059669'};"><span>BALANCE</span><span>Rs. ${Number(t.pending_amount || 0).toLocaleString('en-IN')}</span></div>
          <div class="dashed"></div>
          <div class="center" style="margin: 8px 0 4px;">
            <span class="badge" style="color:${statusColor};border-color:${statusColor};">${statusLabel}</span>
          </div>
          <div class="dashed"></div>
          <div class="sig">
            <div class="row" style="gap:20px;">
              <div style="flex:1;text-align:center;"><div class="sig-line">Driver</div></div>
              <div style="flex:1;text-align:center;"><div class="sig-line">Authorized</div></div>
            </div>
          </div>
          <div class="center" style="font-size:9px;color:#888;margin-top:10px;">— Computer generated —</div>
        </div>
        <div class="no-print" style="text-align:center;margin-top:12px;">
          <button onclick="window.print()" style="background:#f59e0b;color:white;border:none;padding:8px 20px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:bold;">🖨 Print</button>
        </div>
      </body></html>`;
    safePrintHTML(html);
  };

  const handleHeaderWhatsApp = async () => {
    if (!selectedTruck) return;
    try {
      const params = new URLSearchParams();
      if (filters?.kms_year) params.append("kms_year", filters.kms_year);
      params.append("filter_status", "pending");
      const r = await axios.get(`${API}/truck-owner/${encodeURIComponent(selectedTruck)}/whatsapp-text?${params}`);
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

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle className="text-lg text-amber-400 flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Per-Trip Bhada
              <span className="text-slate-400 font-normal text-sm">— Truck-wise (पर ट्रिप)</span>
            </CardTitle>
            <p className="text-slate-400 text-xs mt-1">Search truck → trip-wise bhada · Settled/Pending status · 1-click Pay (Cash/Bank/Owner)</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <TruckCombobox trucks={trucks} value={selectedTruck} onChange={setSelectedTruck} disabled={trucksLoading} />
            <Button size="sm" variant="ghost" onClick={() => { loadTrucks(); if (selectedTruck) fetchData(selectedTruck); }} disabled={loading || trucksLoading}
              className="h-9 w-9 p-0 text-slate-300 hover:bg-slate-700 border border-slate-600" title="Refresh" data-testid="truck-pertrip-refresh">
              <RefreshCw className={`w-3.5 h-3.5 ${loading || trucksLoading ? "animate-spin" : ""}`} />
            </Button>

            {/* Icon-only export group */}
            <div className="flex items-center gap-1 ml-1 pl-2 border-l border-slate-600" data-testid="truck-pertrip-export-group">
              <Button size="sm" variant="ghost" onClick={() => handleHeaderExport("pdf")} disabled={!selectedTruck || loading}
                className="h-9 w-9 p-0 text-red-400 hover:bg-red-900/30 border border-red-600 disabled:opacity-50" title="PDF Export" data-testid="truck-pertrip-pdf">
                <FileText className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleHeaderExport("excel")} disabled={!selectedTruck || loading}
                className="h-9 w-9 p-0 text-emerald-400 hover:bg-emerald-900/30 border border-emerald-600 disabled:opacity-50" title="Excel Export" data-testid="truck-pertrip-excel">
                <Download className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleHeaderWhatsApp} disabled={!selectedTruck || loading}
                className="h-9 w-9 p-0 text-green-400 hover:bg-green-900/30 border border-green-600 disabled:opacity-50" title="WhatsApp (Pending Summary)" data-testid="truck-pertrip-whatsapp">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Compact stat strip — replaces the gradient KPI tiles (no more cards) */}
        {selectedTruck && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 pt-3 border-t border-slate-700 text-sm">
            <div><span className="text-slate-400">Total Trips:</span> <span className="text-slate-100 font-bold">{sm.total_trips}</span> <span className="text-slate-500 text-xs">({sm.sale_count} Sale · {sm.purchase_count} Purchase)</span></div>
            <div><span className="text-slate-400">Total Bhada:</span> <span className="text-amber-300 font-bold">{fmtINR(sm.total_bhada)}</span></div>
            <div><span className="text-slate-400">Settled:</span> <span className="text-emerald-300 font-bold">{fmtINR(sm.total_paid)}</span> <span className="text-slate-500 text-xs">({sm.settled_count} fully · {sm.partial_count} partial)</span></div>
            <div><span className="text-slate-400">Pending:</span> <span className="text-rose-300 font-bold">{fmtINR(sm.total_pending)}</span> <span className="text-slate-500 text-xs">({sm.pending_count + sm.partial_count} trips)</span></div>
            {sm.extra_paid_unallocated > 0 && (
              <div><span className="text-slate-400">Extra Paid:</span> <span className="text-emerald-200 font-bold">+{fmtINR(sm.extra_paid_unallocated)}</span></div>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {!selectedTruck && !trucksLoading && (
          <div className="text-center py-12 text-slate-400">
            <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Koi truck nahi mila jo bhada wali entries rakhta ho.</p>
            <p className="text-xs mt-1 opacity-70">Vehicle Weight / BP Sale / DC Delivery / Sale-Purchase Voucher me Bhada add karein → yahan dikhne lagega.</p>
          </div>
        )}

        {selectedTruck && (
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
                      <TableHead className="text-slate-300">Type</TableHead>
                      <TableHead className="text-slate-300">Party</TableHead>
                      <TableHead className="text-slate-300">Destination</TableHead>
                      <TableHead className="text-slate-300 text-right">Net Wt (Qtl)</TableHead>
                      <TableHead className="text-slate-300 text-right">Bag</TableHead>
                      <TableHead className="text-slate-300 text-right">Bhada</TableHead>
                      <TableHead className="text-slate-300 text-right">Paid</TableHead>
                      <TableHead className="text-slate-300 text-right">Pending</TableHead>
                      <TableHead className="text-slate-300 text-center">Status</TableHead>
                      <TableHead className="text-slate-300 text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trips.length === 0 ? (
                      <TableRow><TableCell colSpan={12} className="text-center text-slate-500 py-8 text-sm">Filter ke andar koi trip nahi — change karke try karein.</TableCell></TableRow>
                    ) : trips.map((t) => {
                      const netQtl = (Number(t.net_wt || 0) / 100).toFixed(2);
                      const isAdmin = user?.role === 'admin';
                      return (
                        <TableRow key={`${t.rst_no}-${t.date}`} className="border-slate-700 hover:bg-slate-700/40">
                          <TableCell className="font-mono font-bold text-amber-300">#{t.rst_no}</TableCell>
                          <TableCell className="text-slate-200 text-sm">{fmtDateShort(t.date)}</TableCell>
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
                          <TableCell className="text-slate-200 text-sm text-right font-semibold">{netQtl}</TableCell>
                          <TableCell className="text-slate-300 text-sm text-right">{Number(t.tot_pkts || 0).toLocaleString()}</TableCell>
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
              Make Payment — RST #{payTrip?.rst_no} <span className="text-slate-400 text-sm font-normal">({data?.vehicle_no})</span>
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
              <span className="text-slate-400 text-xs font-normal">({data?.vehicle_no})</span>
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
    </Card>
  );
}
