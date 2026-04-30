// Visual-only DEMO of "Truck Owner Per-Trip Breakdown" — uses mock data, no backend calls.
// Mounted via URL hash `#truck-trip-demo` for preview before the real feature is implemented.
//
// Goal: show user the look-and-feel of:
//   • Summary KPIs (Trips, Bhada, Settled, Pending)
//   • Per-trip table with Sale/Purchase tag + Settled/Pending status + Pay button
//   • Filters
//   • Export buttons (Pending PDF / All Excel / Bulk Settle)

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Truck, Calendar, TrendingUp, CheckCircle2, AlertTriangle,
  Download, FileText, MessageCircle, IndianRupee, Eye, ArrowUpRight, X,
} from "lucide-react";

// ── Mock data ────────────────────────────────────────────────────────────
const MOCK_TRIPS = [
  { rst: 8,  date: "30-Apr-2026", type: "sale",     party: "Mahesh Trader",    bhada: 4000, settledAmt: 0,    status: "pending" },
  { rst: 7,  date: "28-Apr-2026", type: "sale",     party: "R. Trader & Co.",  bhada: 3500, settledAmt: 3500, status: "settled" },
  { rst: 6,  date: "25-Apr-2026", type: "purchase", party: "Ram Mandi Komna",  bhada: 2000, settledAmt: 2000, status: "settled" },
  { rst: 5,  date: "20-Apr-2026", type: "purchase", party: "FCI Lot 23-B",     bhada: 2500, settledAmt: 0,    status: "pending" },
  { rst: 4,  date: "18-Apr-2026", type: "sale",     party: "Govt Rice DC",     bhada: 4500, settledAmt: 4500, status: "settled" },
  { rst: 3,  date: "15-Apr-2026", type: "purchase", party: "Patna Mandi",      bhada: 1800, settledAmt: 1800, status: "settled" },
  { rst: 2,  date: "12-Apr-2026", type: "sale",     party: "Sai Traders",      bhada: 4200, settledAmt: 2000, status: "partial" },
  { rst: 1,  date: "08-Apr-2026", type: "purchase", party: "Kesinga Mandi",    bhada: 2200, settledAmt: 2200, status: "settled" },
];

const TRUCK = { vehicle_no: "MH-12-AB-1234", driver: "Ramesh Yadav", phone: "+91 98765 43210" };

// ── Tile component ───────────────────────────────────────────────────────
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

// ── Main Demo Component ──────────────────────────────────────────────────
export default function TruckOwnerPerTripDemo({ onClose }) {
  const [filter, setFilter] = useState("all"); // all / sale / purchase
  const [statusFilter, setStatusFilter] = useState("all"); // all / pending / settled

  const filteredTrips = MOCK_TRIPS.filter(t =>
    (filter === "all" || t.type === filter) &&
    (statusFilter === "all" || t.status === statusFilter || (statusFilter === "pending" && t.status === "partial"))
  );

  const totalBhada   = MOCK_TRIPS.reduce((s, t) => s + t.bhada, 0);
  const totalSettled = MOCK_TRIPS.reduce((s, t) => s + t.settledAmt, 0);
  const totalPending = totalBhada - totalSettled;
  const settledCount = MOCK_TRIPS.filter(t => t.status === "settled").length;
  const pendingCount = MOCK_TRIPS.filter(t => t.status !== "settled").length;
  const saleCount    = MOCK_TRIPS.filter(t => t.type === "sale").length;
  const purchaseCount = MOCK_TRIPS.filter(t => t.type === "purchase").length;

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-sm overflow-y-auto" data-testid="truck-trip-demo-overlay">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* DEMO BANNER */}
        <div className="mb-3 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-600/30 to-orange-600/30 border border-amber-500/50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-200">
            <Eye className="w-4 h-4" />
            <span className="text-sm font-semibold">PREVIEW MODE</span>
            <span className="text-xs opacity-80">— ye sirf design demo hai (mock data). Real feature implement karne se pehle dekho aur feedback do.</span>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} className="text-amber-200 hover:bg-amber-900/40" data-testid="truck-demo-close">
            <X className="w-4 h-4 mr-1" /> Close Demo
          </Button>
        </div>

        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <Truck className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">{TRUCK.vehicle_no}</h2>
              <p className="text-xs text-slate-400">Driver: <span className="text-slate-300">{TRUCK.driver}</span> · {TRUCK.phone}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700" data-testid="truck-demo-tab-pertrip">
              <ArrowUpRight className="w-3.5 h-3.5 mr-1" /> Per-Trip
            </Button>
            <Button size="sm" variant="ghost" className="text-slate-400 hover:text-slate-200">
              Ledger View
            </Button>
          </div>
        </div>

        {/* SUMMARY KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <StatTile icon={Calendar}    label="Total Trips"    value={MOCK_TRIPS.length} subtext={`${saleCount} Sale · ${purchaseCount} Purchase`} color="bg-slate-800/80 border-slate-700 text-slate-200" />
          <StatTile icon={IndianRupee} label="Total Bhada"     value={`Rs.${totalBhada.toLocaleString('en-IN')}`} subtext="Cumulative earned" color="bg-amber-900/30 border-amber-700/50 text-amber-200" />
          <StatTile icon={CheckCircle2} label="Settled"        value={`Rs.${totalSettled.toLocaleString('en-IN')}`} subtext={`${settledCount} trips paid`} color="bg-emerald-900/30 border-emerald-700/50 text-emerald-200" />
          <StatTile icon={AlertTriangle} label="Pending"       value={`Rs.${totalPending.toLocaleString('en-IN')}`} subtext={`${pendingCount} trips unpaid`} color="bg-rose-900/30 border-rose-700/50 text-rose-200" />
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
              {[["all","All"],["pending","⚠️ Pending"],["settled","✅ Settled"]].map(([v,l]) => (
                <Button key={v} size="sm" variant={statusFilter===v?"default":"outline"} onClick={()=>setStatusFilter(v)}
                  className={statusFilter===v?(v==="pending"?"bg-rose-600 hover:bg-rose-700 h-7 text-xs":v==="settled"?"bg-emerald-600 hover:bg-emerald-700 h-7 text-xs":"bg-slate-600 h-7 text-xs"):"h-7 text-xs border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"}>
                  {l}
                </Button>
              ))}
            </div>
            <Input type="date" defaultValue="2026-04-01" className="h-7 text-xs w-32 bg-slate-800 border-slate-700 text-slate-200" />
            <Input type="date" defaultValue="2026-04-30" className="h-7 text-xs w-32 bg-slate-800 border-slate-700 text-slate-200" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-900/40" data-testid="truck-demo-pending-pdf">
              <FileText className="w-3 h-3 mr-1" /> Pending PDF
            </Button>
            <Button size="sm" className="h-7 text-xs bg-emerald-700 hover:bg-emerald-600 text-white" data-testid="truck-demo-whatsapp">
              <MessageCircle className="w-3 h-3 mr-1" /> WhatsApp
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700">
              <Download className="w-3 h-3 mr-1" /> Excel
            </Button>
          </div>
        </div>

        {/* TABLE */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 bg-slate-900/80 hover:bg-slate-900/80">
                <TableHead className="text-[10px] text-slate-400 w-[55px]">RST</TableHead>
                <TableHead className="text-[10px] text-slate-400">Date</TableHead>
                <TableHead className="text-[10px] text-slate-400">Type</TableHead>
                <TableHead className="text-[10px] text-slate-400">Party</TableHead>
                <TableHead className="text-[10px] text-slate-400 text-right">Bhada</TableHead>
                <TableHead className="text-[10px] text-slate-400 text-right">Paid</TableHead>
                <TableHead className="text-[10px] text-slate-400 text-right">Pending</TableHead>
                <TableHead className="text-[10px] text-slate-400">Status</TableHead>
                <TableHead className="text-[10px] text-slate-400 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTrips.map(t => {
                const pending = t.bhada - t.settledAmt;
                return (
                  <TableRow key={t.rst} className="border-slate-700/50 hover:bg-slate-700/30">
                    <TableCell className="font-mono font-bold text-sky-300 text-xs">#{t.rst}</TableCell>
                    <TableCell className="text-xs text-slate-300">{t.date}</TableCell>
                    <TableCell>
                      {t.type === "sale" ? (
                        <Badge className="bg-emerald-900/40 text-emerald-300 border border-emerald-700/50 text-[10px]">🟢 Sale</Badge>
                      ) : (
                        <Badge className="bg-sky-900/40 text-sky-300 border border-sky-700/50 text-[10px]">🔵 Purchase</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-300">{t.party}</TableCell>
                    <TableCell className="text-xs text-amber-300 font-bold text-right">Rs.{t.bhada.toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-xs text-emerald-400 text-right">{t.settledAmt > 0 ? `Rs.${t.settledAmt.toLocaleString('en-IN')}` : "—"}</TableCell>
                    <TableCell className="text-xs text-rose-400 font-bold text-right">{pending > 0 ? `Rs.${pending.toLocaleString('en-IN')}` : "—"}</TableCell>
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
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] text-slate-400 hover:text-slate-200">
                          <Eye className="w-3 h-3 mr-1" />View
                        </Button>
                      ) : (
                        <Button size="sm" className="h-6 text-[10px] bg-emerald-700 hover:bg-emerald-600 text-white" data-testid={`truck-demo-pay-${t.rst}`}>
                          <IndianRupee className="w-3 h-3 mr-0.5" />Pay
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* BOTTOM CTAs */}
        <div className="mt-4 flex flex-col md:flex-row gap-3 items-center justify-between p-3 rounded-lg bg-gradient-to-r from-slate-800/80 to-slate-900/80 border border-slate-700">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Showing <span className="text-slate-200 font-semibold">{filteredTrips.length}</span> trips · Pending <span className="text-rose-300 font-bold">Rs.{totalPending.toLocaleString('en-IN')}</span> for {TRUCK.vehicle_no}
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" data-testid="truck-demo-bulk-settle">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Mark All Settled
            </Button>
          </div>
        </div>

        <div className="mt-4 px-4 py-3 rounded-lg bg-blue-950/40 border border-blue-700/40 text-blue-200 text-xs">
          <strong className="text-blue-100">💡 Implementation Note:</strong> Real feature me — har "Pay" button click → Cash Book ka Add Transaction modal pre-filled khulega (account=ledger, party_type=Truck, category={TRUCK.vehicle_no}, txn_type=nikasi, amount=pending bhada, description=auto). Save → row green ho jayega. "Pending PDF" → sirf unpaid trips ka PDF, "WhatsApp" → auto-message with pending list to driver phone.
        </div>
      </div>
    </div>
  );
}
