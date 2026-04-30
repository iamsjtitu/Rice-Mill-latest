// 🛻 Truck Owner Per-Trip Bhada Panel — restyled to match existing app theme.
// Brighter accents (cyan/amber/emerald/rose), larger text, solid status pills.

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Truck, Calendar, TrendingUp, CheckCircle2, AlertTriangle,
  Download, FileText, MessageCircle, IndianRupee, Eye, Loader2, RefreshCw,
} from "lucide-react";

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

// Bright KPI tile matching app's accent style
const StatTile = ({ icon: Icon, label, value, subtext, accent }) => {
  const accents = {
    slate:   "from-slate-700/60 to-slate-800/60 border-slate-600 text-slate-100",
    amber:   "from-amber-700/30 to-amber-900/30 border-amber-600 text-amber-100",
    emerald: "from-emerald-700/30 to-emerald-900/30 border-emerald-600 text-emerald-100",
    rose:    "from-rose-700/30 to-rose-900/30 border-rose-600 text-rose-100",
  };
  const iconAccent = { slate: "text-slate-400", amber: "text-amber-400", emerald: "text-emerald-400", rose: "text-rose-400" };
  return (
    <div className={`relative overflow-hidden rounded-lg border bg-gradient-to-br p-4 ${accents[accent] || accents.slate}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider opacity-80 font-medium">{label}</p>
          <p className="text-2xl font-bold mt-1.5">{value}</p>
          {subtext && <p className="text-[11px] opacity-75 mt-1">{subtext}</p>}
        </div>
        <Icon className={`w-9 h-9 ${iconAccent[accent] || iconAccent.slate} opacity-60`} />
      </div>
    </div>
  );
};

export default function TruckOwnerPerTripPanel({ filters, user }) {
  const [trucks, setTrucks] = useState([]);
  const [selectedTruck, setSelectedTruck] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [trucksLoading, setTrucksLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [settling, setSettling] = useState(null);

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

  const handleSettle = async (trip) => {
    if (!data?.vehicle_no || !trip.pending_amount) return;
    setSettling(trip.rst_no);
    try {
      await axios.post(`${API}/truck-owner/${encodeURIComponent(data.vehicle_no)}/settle/${trip.rst_no}`, {
        amount: trip.pending_amount,
        username: user?.username || "admin",
      });
      toast.success(`RST #${trip.rst_no} settled — ${fmtINR(trip.pending_amount)}`);
      fetchData(selectedTruck);
    } catch (e) {
      toast.error("Settle failed: " + (e?.response?.data?.detail || e?.message));
    } finally {
      setSettling(null);
    }
  };

  const handleExport = (kind) => {
    if (!selectedTruck) return;
    const params = new URLSearchParams();
    if (filters?.kms_year) params.append("kms_year", filters.kms_year);
    if (filters?.season) params.append("season", filters.season);
    if (kind === "pdf") params.append("filter_status", "pending");
    const url = `${API}/truck-owner/${encodeURIComponent(selectedTruck)}/per-trip-${kind === "pdf" ? "pdf" : "excel"}?${params}`;
    window.open(url, "_blank");
  };

  const handleWhatsApp = async () => {
    if (!selectedTruck) return;
    try {
      const params = new URLSearchParams();
      if (filters?.kms_year) params.append("kms_year", filters.kms_year);
      if (filters?.season) params.append("season", filters.season);
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
              Per-Trip Bhada Breakdown <span className="text-slate-400 font-normal text-base">(ट्रक मालिक — पर ट्रिप)</span>
            </CardTitle>
            <p className="text-slate-400 text-xs mt-1">Har trip ka bhada — Settled / Partial / Pending. Pay button se direct settle karo.</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={selectedTruck} onValueChange={setSelectedTruck} disabled={trucksLoading}>
              <SelectTrigger className="w-[260px] bg-slate-700 border-slate-600 text-slate-200 h-9 text-sm" data-testid="truck-pertrip-select">
                <SelectValue placeholder={trucksLoading ? "Loading trucks..." : "Select truck..."} />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {trucks.length === 0 && !trucksLoading && (
                  <div className="p-3 text-xs text-slate-400 text-center">Koi truck nahi mila — bhada wali entries seed karo ya VW me bhada add karo.</div>
                )}
                {trucks.map(t => (
                  <SelectItem key={t.vehicle_no} value={t.vehicle_no} className="text-slate-200 focus:bg-slate-700">
                    <span className="font-mono text-amber-300">{t.vehicle_no}</span>
                    <span className="ml-2 text-[10px] text-slate-400">· {t.trips_count} trips · {fmtINR(t.total_bhada)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => { loadTrucks(); if (selectedTruck) fetchData(selectedTruck); }} disabled={loading || trucksLoading}
              className="h-9 text-xs border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600" data-testid="truck-pertrip-refresh">
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading || trucksLoading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" onClick={() => handleExport("excel")} disabled={!selectedTruck || loading}
              className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50" data-testid="truck-pertrip-excel">
              <Download className="w-3.5 h-3.5 mr-1" /> Excel
            </Button>
            <Button size="sm" onClick={() => handleExport("pdf")} disabled={!selectedTruck || loading}
              className="h-9 text-xs bg-red-600 hover:bg-red-700 text-white disabled:opacity-50" title="Pending Bhada PDF — sirf unpaid trips" data-testid="truck-pertrip-pending-pdf">
              <FileText className="w-3.5 h-3.5 mr-1" /> Pending PDF
            </Button>
            <Button size="sm" onClick={handleWhatsApp} disabled={!selectedTruck || loading}
              className="h-9 text-xs bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50" title="WhatsApp text clipboard pe copy hota hai" data-testid="truck-pertrip-whatsapp">
              <MessageCircle className="w-3.5 h-3.5 mr-1" /> WhatsApp
            </Button>
          </div>
        </div>
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
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatTile icon={Calendar}      label="Total Trips" value={sm.total_trips} subtext={`${sm.sale_count} Sale · ${sm.purchase_count} Purchase`} accent="slate" />
              <StatTile icon={IndianRupee}   label="Total Bhada" value={fmtINR(sm.total_bhada)} subtext="Cumulative earned" accent="amber" />
              <StatTile icon={CheckCircle2}  label="Settled"     value={fmtINR(sm.total_paid)}  subtext={`${sm.settled_count} fully · ${sm.partial_count} partial`} accent="emerald" />
              <StatTile icon={AlertTriangle} label="Pending"     value={fmtINR(sm.total_pending)} subtext={`${sm.pending_count + sm.partial_count} trips`} accent="rose" />
            </div>

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
                {[["all","All"],["pending","⚠ Pending"],["partial","Partial"],["settled","✓ Settled"]].map(([v,l]) => (
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

            {/* Table */}
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
                      <TableHead className="text-slate-300 text-right">Net Wt (KG)</TableHead>
                      <TableHead className="text-slate-300 text-right">Bhada</TableHead>
                      <TableHead className="text-slate-300 text-right">Paid</TableHead>
                      <TableHead className="text-slate-300 text-right">Pending</TableHead>
                      <TableHead className="text-slate-300 text-center">Status</TableHead>
                      <TableHead className="text-slate-300 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trips.length === 0 ? (
                      <TableRow><TableCell colSpan={10} className="text-center text-slate-500 py-8 text-sm">Filter ke andar koi trip nahi — change karke try karein.</TableCell></TableRow>
                    ) : trips.map((t) => (
                      <TableRow key={`${t.rst_no}-${t.date}`} className="border-slate-700 hover:bg-slate-700/40">
                        <TableCell className="font-mono font-bold text-amber-300">#{t.rst_no}</TableCell>
                        <TableCell className="text-slate-200 text-sm">{fmtDateShort(t.date)}</TableCell>
                        <TableCell>
                          {t.trans_type === "sale" ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">Sale</span>
                          ) : t.trans_type === "purchase" ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">Purchase</span>
                          ) : (
                            <span className="text-slate-400 text-xs">{t.trans_type_raw || "Other"}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-200 text-sm max-w-[200px] truncate">{t.party_name || t.farmer_name || "—"}</TableCell>
                        <TableCell className="text-slate-300 text-sm text-right">{Number(t.net_wt || 0).toLocaleString()}</TableCell>
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
                        <TableCell className="text-right">
                          {t.status === "settled" ? (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500" disabled>
                              <Eye className="w-3.5 h-3.5 mr-1" />Done
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => handleSettle(t)} disabled={settling === t.rst_no || user?.role !== "admin"}
                              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" data-testid={`truck-pertrip-pay-${t.rst_no}`}
                              title={user?.role !== "admin" ? "Sirf admin settle kar sakta hai" : "Pending bhada settle karein — auto NIKASI banegi"}>
                              {settling === t.rst_no ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><IndianRupee className="w-3.5 h-3.5 mr-0.5" />Pay {fmtINR(t.pending_amount)}</>}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Bottom summary */}
            <div className="mt-3 flex flex-wrap items-center gap-3 justify-between p-3 rounded-lg bg-slate-700/40 border border-slate-600 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span><span className="text-slate-100 font-bold">{trips.length}</span> of {sm.total_trips} trips shown</span>
                {sm.total_pending > 0 && <> · <span className="text-rose-300 font-bold">{fmtINR(sm.total_pending)} pending</span></>}
                {sm.extra_paid_unallocated > 0 && <> · <span className="text-emerald-300 font-bold">+{fmtINR(sm.extra_paid_unallocated)} extra paid</span></>}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
