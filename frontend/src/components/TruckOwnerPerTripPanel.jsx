// 🛻 Truck Owner Per-Trip Bhada Panel — embedded inside Payments tab.
// Real backend driven, FIFO settlement, one-click Pay.
// Hits /api/truck-owner endpoints.

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
import { Badge } from "@/components/ui/badge";
import {
  Truck, Calendar, TrendingUp, CheckCircle2, AlertTriangle,
  Download, FileText, MessageCircle, IndianRupee, Eye, Loader2, RefreshCw,
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
const fmtDateShort = (s) => {
  if (!s) return "—";
  try {
    const [y, m, d] = s.split("-");
    return `${d}-${["", "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m)] || m}-${y}`;
  } catch { return s; }
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

  // Load truck list
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

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <CardTitle className="text-lg text-amber-400 flex items-center gap-2">
            <Truck className="w-5 h-5" />
            🛻 Per-Trip Bhada Breakdown
            <span className="px-1.5 py-0 text-[9px] rounded bg-amber-900/60 text-amber-300 uppercase tracking-wider">Beta · Preview</span>
          </CardTitle>
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
                    <span className="font-mono">{t.vehicle_no}</span>
                    <span className="ml-2 text-[10px] text-slate-400">· {t.trips_count} trips · {fmtINR(t.total_bhada)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => { loadTrucks(); if (selectedTruck) fetchData(selectedTruck); }} disabled={loading || trucksLoading}
              className="h-9 text-xs border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600" data-testid="truck-pertrip-refresh">
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading || trucksLoading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Empty state */}
        {!selectedTruck && !trucksLoading && (
          <div className="text-center py-12 text-slate-400">
            <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Koi truck nahi mila jo bhada wali entries rakhta ho.</p>
            <p className="text-xs mt-1 opacity-70">Vehicle Weight, BP Sale, DC Delivery, Sale/Purchase Voucher me Bhada add karein → yahan dikhne lagega.</p>
          </div>
        )}

        {selectedTruck && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatTile icon={Calendar}      label="Total Trips" value={sm.total_trips} subtext={`${sm.sale_count} Sale · ${sm.purchase_count} Purchase`} color="bg-slate-700/50 border-slate-600 text-slate-200" />
              <StatTile icon={IndianRupee}   label="Total Bhada" value={fmtINR(sm.total_bhada)} subtext="Cumulative earned" color="bg-amber-900/30 border-amber-700/50 text-amber-200" />
              <StatTile icon={CheckCircle2}  label="Settled"     value={fmtINR(sm.total_paid)}  subtext={`${sm.settled_count} fully · ${sm.partial_count} partial`} color="bg-emerald-900/30 border-emerald-700/50 text-emerald-200" />
              <StatTile icon={AlertTriangle} label="Pending"     value={fmtINR(sm.total_pending)} subtext={`${sm.pending_count + sm.partial_count} trips`} color="bg-rose-900/30 border-rose-700/50 text-rose-200" />
            </div>

            {/* Filters + Exports */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
              <div className="flex flex-wrap gap-2">
                <div className="flex gap-1">
                  {[["all","All"],["sale","Sale"],["purchase","Purchase"]].map(([v,l]) => (
                    <Button key={v} size="sm" variant={filter===v?"default":"outline"} onClick={()=>setFilter(v)}
                      className={filter===v?"bg-sky-600 hover:bg-sky-700 text-white h-7 text-xs":"h-7 text-xs border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600"}
                      data-testid={`truck-pertrip-filter-${v}`}>
                      {l}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-1 border-l border-slate-700 pl-2">
                  {[["all","All"],["pending","⚠️ Pending"],["partial","Partial"],["settled","✅ Settled"]].map(([v,l]) => (
                    <Button key={v} size="sm" variant={statusFilter===v?"default":"outline"} onClick={()=>setStatusFilter(v)}
                      className={statusFilter===v?(v==="pending"?"bg-rose-600 hover:bg-rose-700 h-7 text-xs":v==="settled"?"bg-emerald-600 hover:bg-emerald-700 h-7 text-xs":v==="partial"?"bg-amber-600 hover:bg-amber-700 h-7 text-xs":"bg-slate-600 h-7 text-xs"):"h-7 text-xs border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600"}
                      data-testid={`truck-pertrip-status-${v}`}>
                      {l}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => {
                  const params = new URLSearchParams();
                  if (filters?.kms_year) params.append("kms_year", filters.kms_year);
                  if (filters?.season) params.append("season", filters.season);
                  params.append("filter_status", "pending");
                  window.open(`${API}/truck-owner/${encodeURIComponent(selectedTruck)}/per-trip-pdf?${params}`, "_blank");
                }} disabled={!selectedTruck || loading}
                  className="h-7 text-xs bg-rose-600 hover:bg-rose-700 text-white shadow-md disabled:opacity-50" title="Pending Bhada PDF — sirf unpaid trips" data-testid="truck-pertrip-pending-pdf">
                  <FileText className="w-3 h-3 mr-1" /> Pending PDF
                </Button>
                <Button size="sm" onClick={async () => {
                  if (!selectedTruck) return;
                  try {
                    const params = new URLSearchParams();
                    if (filters?.kms_year) params.append("kms_year", filters.kms_year);
                    if (filters?.season) params.append("season", filters.season);
                    params.append("filter_status", "pending");
                    const r = await axios.get(`${API}/truck-owner/${encodeURIComponent(selectedTruck)}/whatsapp-text?${params}`);
                    const text = r.data?.text || "";
                    if (text) {
                      // Try copy to clipboard, fallback to wa.me
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
                }} disabled={!selectedTruck || loading}
                  className="h-7 text-xs bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50" title="Pending Bhada WhatsApp text — clipboard pe copy hota hai" data-testid="truck-pertrip-whatsapp">
                  <MessageCircle className="w-3 h-3 mr-1" /> WhatsApp
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  const params = new URLSearchParams();
                  if (filters?.kms_year) params.append("kms_year", filters.kms_year);
                  if (filters?.season) params.append("season", filters.season);
                  window.open(`${API}/truck-owner/${encodeURIComponent(selectedTruck)}/per-trip-excel?${params}`, "_blank");
                }} disabled={!selectedTruck || loading}
                  className="h-7 text-xs border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-50" data-testid="truck-pertrip-excel">
                  <Download className="w-3 h-3 mr-1" /> Excel
                </Button>
              </div>
            </div>

            {/* Trips Table */}
            <div className="rounded-lg border border-slate-700 bg-slate-900/40 overflow-hidden">
              {loading ? (
                <div className="p-12 flex items-center justify-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading trips...
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700 bg-slate-800 hover:bg-slate-800">
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
                      <TableRow><TableCell colSpan={10} className="text-center text-slate-500 py-8 text-sm">Filter ke andar koi trip nahi — change karke try karein.</TableCell></TableRow>
                    ) : trips.map((t) => (
                      <TableRow key={`${t.rst_no}-${t.date}`} className="border-slate-700/50 hover:bg-slate-700/30">
                        <TableCell className="font-mono font-bold text-sky-300 text-xs">#{t.rst_no}</TableCell>
                        <TableCell className="text-xs text-slate-300">{fmtDateShort(t.date)}</TableCell>
                        <TableCell>
                          {t.trans_type === "sale" ? (
                            <Badge className="bg-emerald-900/40 text-emerald-300 border border-emerald-700/50 text-[10px]">🟢 Sale</Badge>
                          ) : t.trans_type === "purchase" ? (
                            <Badge className="bg-sky-900/40 text-sky-300 border border-sky-700/50 text-[10px]">🔵 Purchase</Badge>
                          ) : (
                            <Badge className="bg-slate-700 text-slate-300 text-[10px]">{t.trans_type_raw || "Other"}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-300 max-w-[200px] truncate">{t.party_name || t.farmer_name || "—"}</TableCell>
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
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] text-slate-500" disabled>
                              <Eye className="w-3 h-3 mr-1" />Done
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => handleSettle(t)} disabled={settling === t.rst_no || user?.role !== "admin"}
                              className="h-6 text-[10px] bg-emerald-700 hover:bg-emerald-600 text-white" data-testid={`truck-pertrip-pay-${t.rst_no}`}
                              title={user?.role !== "admin" ? "Sirf admin settle kar sakta hai" : "Pending bhada settle karein — auto NIKASI banegi"}>
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

            {/* Bottom summary */}
            <div className="mt-3 flex items-center justify-between p-2 px-3 rounded-lg bg-slate-700/30 border border-slate-700 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                Showing <span className="text-slate-200 font-semibold">{trips.length}</span> of {sm.total_trips} trips
                {sm.total_pending > 0 && <> · <span className="text-rose-300 font-bold">{fmtINR(sm.total_pending)} pending</span></>}
                {sm.extra_paid_unallocated > 0 && <> · <span className="text-emerald-300">+{fmtINR(sm.extra_paid_unallocated)} extra paid</span></>}
              </div>
              <span className="text-slate-500 italic">Beta — feedback aur final approval ke liye dekh rahe hain</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
