// 🛻 Truck Owner Per-Trip Breakdown — REAL data driven (live preview).
// Opens via floating "🛻 Truck Per-Trip" CTA OR URL hash `#truck-trip-demo`.
// Hits /api/truck-owner/{vehicle_no}/per-trip endpoint with FIFO settlement.

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Truck, Calendar, TrendingUp, CheckCircle2, AlertTriangle,
  Download, FileText, MessageCircle, IndianRupee, Eye, ArrowUpRight, X, Loader2, RefreshCw,
} from "lucide-react";

const _isElectron = typeof window !== "undefined" && (window.electronAPI || window.ELECTRON_API_URL);
const API = `${_isElectron ? "" : (process.env.REACT_APP_BACKEND_URL || "")}/api`;

const StatTile = ({ icon: Icon, label, value, subtext, color }) => (
  <div className={`relative overflow-hidden rounded-lg border p-3 ${color}`}>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-[10px] uppercase tracking-wider opacity-75 font-medium">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {subtext && <p className="text-[10px] opacity-70 mt-1">{subtext}</p>}
      </div>
      <Icon className="w-7 h-7 opacity-30" />
    </div>
  </div>
);

const fmtINR = (n) => `Rs.${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const fmtDate = (s) => {
  if (!s) return "—";
  try {
    const [y, m, d] = s.split("-");
    return `${d}-${["", "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m)] || m}-${y}`;
  } catch { return s; }
};

export default function TruckOwnerPerTripDemo({ onClose }) {
  const [trucks, setTrucks] = useState([]);
  const [selectedTruck, setSelectedTruck] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");        // all/sale/purchase
  const [statusFilter, setStatusFilter] = useState("all"); // all/pending/settled/partial
  const [settling, setSettling] = useState(null);     // rst_no being settled

  // Load truck list
  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`${API}/truck-owner/per-trip-trucks`);
        const list = r.data?.trucks || [];
        setTrucks(list);
        if (list.length && !selectedTruck) setSelectedTruck(list[0].vehicle_no);
      } catch (e) {
        toast.error("Truck list load failed: " + (e?.message || ""));
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch data when truck changes
  const fetchData = useCallback(async (vno) => {
    if (!vno) return;
    setLoading(true);
    try {
      const r = await axios.get(`${API}/truck-owner/${encodeURIComponent(vno)}/per-trip`);
      setData(r.data);
    } catch (e) {
      toast.error("Per-trip load failed: " + (e?.response?.data?.detail || e?.message));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (selectedTruck) fetchData(selectedTruck); }, [selectedTruck, fetchData]);

  const trips = (data?.trips || []).filter((t) =>
    (filter === "all" || t.trans_type === filter) &&
    (statusFilter === "all" || t.status === statusFilter)
  );
  const sm = data?.summary || { total_trips: 0, sale_count: 0, purchase_count: 0, total_bhada: 0, total_paid: 0, total_pending: 0, settled_count: 0, partial_count: 0, pending_count: 0 };

  const handleSettle = async (trip) => {
    if (!data?.vehicle_no || !trip.pending_amount) return;
    setSettling(trip.rst_no);
    try {
      await axios.post(`${API}/truck-owner/${encodeURIComponent(data.vehicle_no)}/settle/${trip.rst_no}`, {
        amount: trip.pending_amount,
        username: "admin",
      });
      toast.success(`RST #${trip.rst_no} settled — ${fmtINR(trip.pending_amount)}`);
      fetchData(selectedTruck);
    } catch (e) {
      toast.error("Settle failed: " + (e?.response?.data?.detail || e?.message));
    } finally {
      setSettling(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-sm overflow-y-auto" data-testid="truck-trip-demo-overlay">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* PREVIEW BANNER */}
        <div className="mb-3 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-600/30 to-orange-600/30 border border-amber-500/50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-200 text-xs">
            <Eye className="w-4 h-4" />
            <span className="font-semibold">LIVE PREVIEW</span>
            <span className="opacity-80">— real backend data + FIFO settlement. Demo trucks me prefix `OD-15-DEMO-` aur `OD-21-DEMO-` use kiye gaye hain. <strong>Settle</strong> aur <strong>data refresh</strong> live working hai.</span>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} className="text-amber-200 hover:bg-amber-900/40 h-7" data-testid="truck-demo-close">
            <X className="w-4 h-4 mr-1" /> Close
          </Button>
        </div>

        {/* HEADER + TRUCK SELECTOR */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <Truck className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">{selectedTruck || "Select Truck"}</h2>
              <p className="text-xs text-slate-400">
                Per-Trip Breakdown · {sm.total_trips} trip(s)
                {sm.extra_paid_unallocated > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 text-[10px]">+{fmtINR(sm.extra_paid_unallocated)} extra paid</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <Select value={selectedTruck} onValueChange={setSelectedTruck}>
              <SelectTrigger className="w-[230px] bg-slate-800 border-slate-700 text-slate-200 h-9 text-sm" data-testid="truck-demo-select">
                <SelectValue placeholder="Select truck..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {trucks.length === 0 && <div className="p-3 text-xs text-slate-400">Koi truck nahi mila — backend par bhada wale entries seed karein.</div>}
                {trucks.map(t => (
                  <SelectItem key={t.vehicle_no} value={t.vehicle_no} className="text-slate-200 focus:bg-slate-700">
                    <span className="font-mono">{t.vehicle_no}</span>
                    <span className="ml-2 text-[10px] text-slate-400">· {t.trips_count} trips · {fmtINR(t.total_bhada)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => fetchData(selectedTruck)} className="h-9 text-xs border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700" disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <StatTile icon={Calendar}     label="Total Trips" value={sm.total_trips} subtext={`${sm.sale_count} Sale · ${sm.purchase_count} Purchase`} color="bg-slate-800/80 border-slate-700 text-slate-200" />
          <StatTile icon={IndianRupee}  label="Total Bhada" value={fmtINR(sm.total_bhada)} subtext="Cumulative earned" color="bg-amber-900/30 border-amber-700/50 text-amber-200" />
          <StatTile icon={CheckCircle2} label="Settled"     value={fmtINR(sm.total_paid)}  subtext={`${sm.settled_count} fully · ${sm.partial_count} partial`} color="bg-emerald-900/30 border-emerald-700/50 text-emerald-200" />
          <StatTile icon={AlertTriangle} label="Pending"    value={fmtINR(sm.total_pending)} subtext={`${sm.pending_count + sm.partial_count} trips`} color="bg-rose-900/30 border-rose-700/50 text-rose-200" />
        </div>

        {/* FILTERS + EXPORTS */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1">
              {[["all","All"],["sale","Sale"],["purchase","Purchase"]].map(([v,l]) => (
                <Button key={v} size="sm" variant={filter===v?"default":"outline"} onClick={()=>setFilter(v)}
                  className={filter===v?"bg-sky-600 hover:bg-sky-700 text-white h-7 text-xs":"h-7 text-xs border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"}>
                  {l}
                </Button>
              ))}
            </div>
            <div className="flex gap-1 border-l border-slate-700 pl-2">
              {[["all","All"],["pending","⚠️ Pending"],["partial","Partial"],["settled","✅ Settled"]].map(([v,l]) => (
                <Button key={v} size="sm" variant={statusFilter===v?"default":"outline"} onClick={()=>setStatusFilter(v)}
                  className={statusFilter===v?(v==="pending"?"bg-rose-600 hover:bg-rose-700 h-7 text-xs":v==="settled"?"bg-emerald-600 hover:bg-emerald-700 h-7 text-xs":v==="partial"?"bg-amber-600 hover:bg-amber-700 h-7 text-xs":"bg-slate-600 h-7 text-xs"):"h-7 text-xs border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"}>
                  {l}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs bg-rose-600/80 hover:bg-rose-700 text-white shadow-lg shadow-rose-900/40 cursor-not-allowed opacity-70" title="Implementation pending">
              <FileText className="w-3 h-3 mr-1" /> Pending PDF (soon)
            </Button>
            <Button size="sm" className="h-7 text-xs bg-emerald-700/80 hover:bg-emerald-600 text-white cursor-not-allowed opacity-70" title="Implementation pending">
              <MessageCircle className="w-3 h-3 mr-1" /> WhatsApp (soon)
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-not-allowed opacity-70" title="Implementation pending">
              <Download className="w-3 h-3 mr-1" /> Excel (soon)
            </Button>
          </div>
        </div>

        {/* TABLE */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
          {loading ? (
            <div className="p-12 flex items-center justify-center text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading trips...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700 bg-slate-900/80 hover:bg-slate-900/80">
                  <TableHead className="text-[10px] text-slate-400 w-[55px]">RST</TableHead>
                  <TableHead className="text-[10px] text-slate-400">Date</TableHead>
                  <TableHead className="text-[10px] text-slate-400">Type</TableHead>
                  <TableHead className="text-[10px] text-slate-400">Party</TableHead>
                  <TableHead className="text-[10px] text-slate-400 text-right">Net Wt (KG)</TableHead>
                  <TableHead className="text-[10px] text-slate-400 text-right">Bhada</TableHead>
                  <TableHead className="text-[10px] text-slate-400 text-right">Paid</TableHead>
                  <TableHead className="text-[10px] text-slate-400 text-right">Pending</TableHead>
                  <TableHead className="text-[10px] text-slate-400">Status</TableHead>
                  <TableHead className="text-[10px] text-slate-400 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trips.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center text-slate-500 py-8 text-sm">Koi trips nahi mile — filter change karein ya alag truck select karein.</TableCell></TableRow>
                ) : trips.map((t) => (
                  <TableRow key={`${t.rst_no}-${t.date}`} className="border-slate-700/50 hover:bg-slate-700/30">
                    <TableCell className="font-mono font-bold text-sky-300 text-xs">#{t.rst_no}</TableCell>
                    <TableCell className="text-xs text-slate-300">{fmtDate(t.date)}</TableCell>
                    <TableCell>
                      {t.trans_type === "sale" ? (
                        <Badge className="bg-emerald-900/40 text-emerald-300 border border-emerald-700/50 text-[10px]">🟢 Sale</Badge>
                      ) : t.trans_type === "purchase" ? (
                        <Badge className="bg-sky-900/40 text-sky-300 border border-sky-700/50 text-[10px]">🔵 Purchase</Badge>
                      ) : (
                        <Badge className="bg-slate-700 text-slate-300 text-[10px]">{t.trans_type_raw || "Other"}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-300 max-w-[180px] truncate">{t.party_name || t.farmer_name || "—"}</TableCell>
                    <TableCell className="text-xs text-slate-400 text-right">{Number(t.net_wt || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-amber-300 font-bold text-right">{fmtINR(t.bhada)}</TableCell>
                    <TableCell className="text-xs text-emerald-400 text-right">{t.paid_amount > 0 ? fmtINR(t.paid_amount) : "—"}</TableCell>
                    <TableCell className="text-xs text-rose-400 font-bold text-right">{t.pending_amount > 0 ? fmtINR(t.pending_amount) : "—"}</TableCell>
                    <TableCell>
                      {t.status === "settled" ? (
                        <Badge className="bg-emerald-700 text-emerald-50 text-[10px] gap-1"><CheckCircle2 className="w-2.5 h-2.5"/>Settled</Badge>
                      ) : t.status === "partial" ? (
                        <Badge className="bg-amber-700 text-amber-50 text-[10px]">Partial</Badge>
                      ) : (
                        <Badge className="bg-rose-700 text-rose-50 text-[10px] gap-1"><AlertTriangle className="w-2.5 h-2.5"/>Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {t.status === "settled" ? (
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] text-slate-500 hover:text-slate-300" disabled>
                          <Eye className="w-3 h-3 mr-1" />Done
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => handleSettle(t)} disabled={settling === t.rst_no}
                          className="h-6 text-[10px] bg-emerald-700 hover:bg-emerald-600 text-white" data-testid={`truck-pertrip-pay-${t.rst_no}`}>
                          {settling === t.rst_no ? <Loader2 className="w-3 h-3 animate-spin" /> : <><IndianRupee className="w-3 h-3 mr-0.5" />Pay {fmtINR(t.pending_amount)}</>}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* BOTTOM SUMMARY */}
        <div className="mt-4 flex flex-col md:flex-row gap-3 items-center justify-between p-3 rounded-lg bg-gradient-to-r from-slate-800/80 to-slate-900/80 border border-slate-700">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Showing <span className="text-slate-200 font-semibold">{trips.length}</span> trips of {sm.total_trips}
            {sm.total_pending > 0 && (
              <> · <span className="text-rose-300 font-bold">{fmtINR(sm.total_pending)} pending</span> for {data?.vehicle_no || "—"}</>
            )}
          </div>
        </div>

        <div className="mt-4 px-4 py-3 rounded-lg bg-blue-950/40 border border-blue-700/40 text-blue-200 text-xs">
          <strong className="text-blue-100">💡 Note:</strong> "Pay" button par click karte hi backend me <code className="px-1 bg-slate-800 rounded">cash_transactions</code> me NIKASI entry ban jaata hai (account=ledger, party_type=Truck, category={data?.vehicle_no || "&lt;truck&gt;"}, txn_type=nikasi) → table refresh hoke status "Settled" ho jata hai. <strong>Pending PDF / WhatsApp / Excel</strong> abhi disabled — final implementation me available honge. <strong>Real implementation me</strong> ye view <em>Payments → Truck Owner</em> tab ke andar drill-down dialog ban jaayega.
        </div>
      </div>
    </div>
  );
}
