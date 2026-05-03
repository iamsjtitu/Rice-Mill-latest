/**
 * v104.44.85 — Total Sales Register
 * Unified view across BP Sale Register + Pvt Rice Sales, party-aggregated.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Download, FileSpreadsheet, FileText, MessageCircle, Search, Users, TrendingUp } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmtDate = (d) => d ? (d.length >= 10 ? d.slice(8, 10) + '-' + d.slice(5, 7) + '-' + d.slice(0, 4) : d) : "-";
const fmtNum = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n) => Number(n || 0).toLocaleString('en-IN');

const PRODUCT_OPTIONS = [
  { value: "", label: "All Products" },
  { value: "Rice Bran", label: "Rice Bran" },
  { value: "Broken", label: "Broken" },
  { value: "Pin Broken", label: "Pin Broken" },
  { value: "Mota Kunda", label: "Mota Kunda" },
  { value: "Rejection", label: "Rejection" },
  { value: "Poll", label: "Poll" },
  { value: "Bhusa", label: "Bhusa" },
  { value: "Husk", label: "Husk" },
  { value: "Kanki", label: "Kanki" },
  { value: "Rice", label: "Pvt Rice (all types)" },
  { value: "Govt Rice", label: "Govt Rice" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "All Sources" },
  { value: "bp_sale", label: "BP Sale (By-Products)" },
  { value: "rice_sale", label: "Pvt Rice" },
  { value: "sale_voucher", label: "Govt Rice" },
];

export default function TotalSalesRegister({ filters, user }) {
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState("rows");  // rows | parties
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [selectedParties, setSelectedParties] = useState([]);

  const [local, setLocal] = useState({
    date_from: "",
    date_to: "",
    party_name: "",
    product: "",
    source: "",
    search: "",
  });

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append("kms_year", filters.kms_year);
    if (filters.season) params.append("season", filters.season);
    if (local.date_from) params.append("date_from", local.date_from);
    if (local.date_to) params.append("date_to", local.date_to);
    if (local.party_name) params.append("party_name", local.party_name);
    if (local.product) params.append("product", local.product);
    if (local.source) params.append("source", local.source);
    if (local.search) params.append("search", local.search);
    return params.toString();
  }, [filters, local]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/total-sales-register?${buildParams()}`);
      setRows(res.data?.rows || []);
      setTotals(res.data?.totals || null);
      setParties(res.data?.parties || []);
    } catch (e) {
      toast.error("Failed to load Total Sales");
    } finally { setLoading(false); }
  }, [buildParams]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const doExport = async (kind) => {
    try {
      const { downloadFile } = await import("../utils/download");
      const fname = `total_sales_${filters.kms_year || "all"}_${new Date().toISOString().slice(0, 10)}.${kind === "excel" ? "xlsx" : "pdf"}`;
      downloadFile(`/api/total-sales-register/export/${kind}?${buildParams()}`, fname);
      toast.success(`${kind.toUpperCase()} downloading...`);
    } catch (e) { toast.error("Export failed"); }
  };

  const toggleParty = (name) => {
    setSelectedParties(p => p.includes(name) ? p.filter(x => x !== name) : [...p, name]);
  };

  const sendWhatsApp = async (mode) => {
    // mode: 'single' (one party) or 'group' (multiple)
    const list = mode === "group" ? selectedParties : (selectedParties[0] ? [selectedParties[0]] : []);
    if (list.length === 0) { toast.error("Select kam se kam ek party"); return; }
    try {
      for (const name of list) {
        const p = parties.find(x => x.party_name === name);
        if (!p) continue;
        const msg = [
          `📊 *${name} — Total Sales*`,
          `KMS: ${filters.kms_year || "ALL"} · ${filters.season || ""}`,
          `Entries: ${p.rows}`,
          `Products: ${p.products.join(", ")}`,
          `Net Weight: ${fmtNum(p.net_weight_qtl)} Qtl · ${fmtInt(p.bags)} bags`,
          `Total Bill: ₹${fmtNum(p.total)}`,
          `Received: ₹${fmtNum(p.received)}`,
          `*Pending: ₹${fmtNum(p.balance)}*`,
        ].join("\n");
        const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        window.open(waUrl, "_blank");
      }
      toast.success(`WhatsApp opened for ${list.length} part${list.length > 1 ? "ies" : "y"}`);
      setShowWhatsAppDialog(false);
    } catch (e) { toast.error("WhatsApp error"); }
  };

  const totalPending = useMemo(() => totals ? Math.round(((totals.total || 0) - (totals.received || 0)) * 100) / 100 : 0, [totals]);

  return (
    <div className="space-y-3" data-testid="total-sales-register">
      {/* Header + Filters */}
      <div className="flex flex-wrap items-end gap-2 p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-[11px] text-slate-600 dark:text-slate-400">Search (Party / Vehicle / RST / Bill / Product)</Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={local.search}
              onChange={e => setLocal(p => ({ ...p, search: e.target.value }))}
              placeholder="Type to search..."
              className="pl-8 h-9 text-xs bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
              data-testid="ts-search"
            />
          </div>
        </div>
        <div>
          <Label className="text-[11px] text-slate-600 dark:text-slate-400">Party</Label>
          <Input value={local.party_name} onChange={e => setLocal(p => ({ ...p, party_name: e.target.value }))}
            placeholder="Party name" className="h-9 text-xs bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white w-40" data-testid="ts-party" />
        </div>
        <div>
          <Label className="text-[11px] text-slate-600 dark:text-slate-400">Product</Label>
          <Select value={local.product || "__all__"} onValueChange={v => setLocal(p => ({ ...p, product: v === "__all__" ? "" : v }))}>
            <SelectTrigger className="h-9 text-xs bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white w-40" data-testid="ts-product">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_OPTIONS.map(o => (
                <SelectItem key={o.value || "__all__"} value={o.value || "__all__"}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] text-slate-600 dark:text-slate-400">Source</Label>
          <Select value={local.source || "__all__"} onValueChange={v => setLocal(p => ({ ...p, source: v === "__all__" ? "" : v }))}>
            <SelectTrigger className="h-9 text-xs bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white w-36" data-testid="ts-source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map(o => (
                <SelectItem key={o.value || "__all__"} value={o.value || "__all__"}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] text-slate-600 dark:text-slate-400">Date From</Label>
          <Input type="date" value={local.date_from} onChange={e => setLocal(p => ({ ...p, date_from: e.target.value }))}
            className="h-9 text-xs bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white" data-testid="ts-date-from" />
        </div>
        <div>
          <Label className="text-[11px] text-slate-600 dark:text-slate-400">Date To</Label>
          <Input type="date" value={local.date_to} onChange={e => setLocal(p => ({ ...p, date_to: e.target.value }))}
            className="h-9 text-xs bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white" data-testid="ts-date-to" />
        </div>
      </div>

      {/* Summary chips */}
      {totals && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          <div className="p-2 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <p className="text-[9px] text-slate-500 uppercase">Entries</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{totals.rows_count}</p>
          </div>
          <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700">
            <p className="text-[9px] text-blue-600 dark:text-blue-400 uppercase">N/W (Qtl)</p>
            <p className="text-sm font-bold text-blue-700 dark:text-blue-300">{fmtNum(totals.net_weight_qtl)}</p>
          </div>
          <div className="p-2 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <p className="text-[9px] text-slate-500 uppercase">Bags</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{fmtInt(totals.bags)}</p>
          </div>
          <div className="p-2 rounded bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700">
            <p className="text-[9px] text-emerald-600 dark:text-emerald-400 uppercase">Total</p>
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">₹{fmtNum(totals.total)}</p>
          </div>
          <div className="p-2 rounded bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-700">
            <p className="text-[9px] text-cyan-600 dark:text-cyan-400 uppercase">Received</p>
            <p className="text-sm font-bold text-cyan-700 dark:text-cyan-300">₹{fmtNum(totals.received)}</p>
          </div>
          <div className={`p-2 rounded border ${totalPending > 0 ? "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"}`}>
            <p className="text-[9px] text-amber-600 dark:text-amber-400 uppercase">Pending</p>
            <p className={`text-sm font-bold ${totalPending > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-400"}`}>₹{fmtNum(totalPending)}</p>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2 p-2 rounded bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
        <div className="flex gap-1">
          <Button size="sm" variant={viewMode === "rows" ? "default" : "outline"} className="h-8 text-xs"
            onClick={() => setViewMode("rows")} data-testid="ts-view-rows"><TrendingUp className="w-3 h-3 mr-1" /> Rows</Button>
          <Button size="sm" variant={viewMode === "parties" ? "default" : "outline"} className="h-8 text-xs"
            onClick={() => setViewMode("parties")} data-testid="ts-view-parties"><Users className="w-3 h-3 mr-1" /> Party-wise</Button>
        </div>
        <div className="flex-1" />
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
          onClick={() => doExport("excel")} data-testid="ts-export-excel">
          <FileSpreadsheet className="w-3 h-3 mr-1" /> Excel
        </Button>
        <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white h-8 text-xs"
          onClick={() => doExport("pdf")} data-testid="ts-export-pdf">
          <FileText className="w-3 h-3 mr-1" /> PDF
        </Button>
        <Button size="sm" className="bg-[#25D366] hover:bg-[#1ebe57] text-white h-8 text-xs"
          onClick={() => { setShowWhatsAppDialog(true); setSelectedParties([]); }}
          data-testid="ts-export-whatsapp">
          <MessageCircle className="w-3 h-3 mr-1" /> WhatsApp
        </Button>
      </div>

      {/* Data display */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Loading...</div>
      ) : viewMode === "rows" ? (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto bg-white dark:bg-slate-800 shadow-sm">
          <Table>
            <TableHeader className="bg-slate-900 dark:bg-slate-950 sticky top-0 z-10">
              <TableRow className="border-slate-700">
                <TableHead className="text-white text-[11px] font-bold py-2.5 px-2 w-[75px] whitespace-nowrap">Date</TableHead>
                <TableHead className="text-white text-[11px] font-bold py-2.5 px-2 w-[90px] whitespace-nowrap">Voucher</TableHead>
                <TableHead className="text-white text-[11px] font-bold py-2.5 px-2 w-[50px] whitespace-nowrap">RST</TableHead>
                <TableHead className="text-white text-[11px] font-bold py-2.5 px-2 w-[95px] whitespace-nowrap">Vehicle</TableHead>
                <TableHead className="text-white text-[11px] font-bold py-2.5 px-2 w-[150px] whitespace-nowrap">Party</TableHead>
                <TableHead className="text-white text-[11px] font-bold py-2.5 px-2 w-[90px] whitespace-nowrap">Destination</TableHead>
                <TableHead className="text-white text-[11px] font-bold py-2.5 px-2 w-[80px] text-right whitespace-nowrap">N/W (Qtl)</TableHead>
                <TableHead className="text-white text-[11px] font-bold py-2.5 px-2 w-[55px] text-right whitespace-nowrap">Bags</TableHead>
                <TableHead className="text-white text-[11px] font-bold py-2.5 px-2 w-[65px] text-right whitespace-nowrap">Rate/Q</TableHead>
                <TableHead className="text-white text-[11px] font-bold py-2.5 px-2 w-[85px] text-right whitespace-nowrap">Amount</TableHead>
                <TableHead className="text-white text-[11px] font-bold py-2.5 px-2 w-[65px] text-right whitespace-nowrap">Tax</TableHead>
                <TableHead className="text-white text-[11px] font-bold py-2.5 px-2 w-[90px] text-right whitespace-nowrap">Total</TableHead>
                <TableHead className="text-white text-[11px] font-bold py-2.5 px-2 w-[85px] text-right whitespace-nowrap">Balance</TableHead>
                <TableHead className="text-white text-[11px] font-bold py-2.5 px-2 w-[85px] text-right whitespace-nowrap">Received</TableHead>
                <TableHead className="text-white text-[11px] font-bold py-2.5 px-2 w-[85px] text-right whitespace-nowrap">Pending</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={15} className="text-center py-10 text-slate-400">No sales found</TableCell></TableRow>
              ) : rows.map((r, idx) => {
                const pending = Math.round(((r.total || 0) - (r.advance || 0)) * 100) / 100;
                const rowClass = r.split_type === "PKA"
                  ? "bg-emerald-50/60 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                  : r.split_type === "KCA"
                    ? "bg-amber-50/60 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                    : "hover:bg-slate-50 dark:hover:bg-slate-700/50";
                return (
                  <TableRow key={`${r.id}-${r.split_type || "x"}-${idx}`} className={`border-slate-200 dark:border-slate-700 ${rowClass}`}>
                    <TableCell className="text-[11px] px-2 py-1.5 whitespace-nowrap text-slate-800 dark:text-slate-200">{fmtDate(r.date)}</TableCell>
                    <TableCell className="text-[11px] px-2 py-1.5 whitespace-nowrap font-mono text-amber-700 dark:text-amber-400 font-semibold">
                      {r.voucher_no || "-"}
                      {r.split_type && (
                        <span className={`ml-1 inline-block px-1 py-0.5 rounded text-[8px] font-bold ${r.split_type === "PKA" ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"}`}>
                          {r.split_type}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-[11px] px-2 py-1.5 whitespace-nowrap text-slate-800 dark:text-slate-200">{r.rst_no || "-"}</TableCell>
                    <TableCell className="text-[11px] px-2 py-1.5 whitespace-nowrap text-slate-800 dark:text-slate-200">{r.vehicle_no || "-"}</TableCell>
                    <TableCell className="text-[11px] px-2 py-1.5 font-semibold whitespace-nowrap truncate max-w-[160px] text-slate-900 dark:text-white" title={r.party_name}>{r.party_name || "-"}</TableCell>
                    <TableCell className="text-[11px] px-2 py-1.5 whitespace-nowrap truncate max-w-[100px] text-slate-700 dark:text-slate-300" title={r.destination}>{r.destination || "-"}</TableCell>
                    <TableCell className="text-[11px] px-2 py-1.5 text-right tabular-nums text-slate-900 dark:text-white">{fmtNum(r.net_weight_qtl)}</TableCell>
                    <TableCell className="text-[11px] px-2 py-1.5 text-right tabular-nums text-slate-800 dark:text-slate-200">{fmtInt(r.bags)}</TableCell>
                    <TableCell className="text-[11px] px-2 py-1.5 text-right tabular-nums text-slate-800 dark:text-slate-200">{fmtInt(r.rate_per_qtl)}</TableCell>
                    <TableCell className="text-[11px] px-2 py-1.5 text-right tabular-nums text-slate-900 dark:text-white">₹{fmtNum(r.amount)}</TableCell>
                    <TableCell className="text-[11px] px-2 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{fmtNum(r.tax)}</TableCell>
                    <TableCell className="text-[11px] px-2 py-1.5 text-right tabular-nums font-bold text-slate-900 dark:text-white">₹{fmtNum(r.total)}</TableCell>
                    <TableCell className="text-[11px] px-2 py-1.5 text-right tabular-nums text-slate-800 dark:text-slate-200">₹{fmtNum(r.balance)}</TableCell>
                    <TableCell className="text-[11px] px-2 py-1.5 text-right tabular-nums text-cyan-700 dark:text-cyan-400 font-semibold">₹{fmtNum(r.advance)}</TableCell>
                    <TableCell className={`text-[11px] px-2 py-1.5 text-right tabular-nums font-bold ${pending > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}>₹{fmtNum(pending)}</TableCell>
                  </TableRow>
                );
              })}
              {rows.length > 0 && totals && (
                <TableRow className="border-t-2 border-slate-900 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30">
                  <TableCell colSpan={6} className="text-[11px] px-2 py-2.5 font-bold text-slate-900 dark:text-white uppercase tracking-wide">⬤ Grand Total</TableCell>
                  <TableCell className="text-[11px] px-2 py-2.5 text-right font-bold tabular-nums text-slate-900 dark:text-white">{fmtNum(totals.net_weight_qtl)}</TableCell>
                  <TableCell className="text-[11px] px-2 py-2.5 text-right font-bold tabular-nums text-slate-900 dark:text-white">{fmtInt(totals.bags)}</TableCell>
                  <TableCell className="text-[11px] px-2 py-2.5 text-right font-bold tabular-nums text-slate-600 dark:text-slate-400">—</TableCell>
                  <TableCell className="text-[11px] px-2 py-2.5 text-right font-bold tabular-nums text-slate-900 dark:text-white">₹{fmtNum(totals.amount)}</TableCell>
                  <TableCell className="text-[11px] px-2 py-2.5 text-right font-bold tabular-nums text-slate-700 dark:text-slate-300">{fmtNum(totals.tax)}</TableCell>
                  <TableCell className="text-[11px] px-2 py-2.5 text-right font-bold tabular-nums text-emerald-800 dark:text-emerald-300">₹{fmtNum(totals.total)}</TableCell>
                  <TableCell className="text-[11px] px-2 py-2.5 text-right font-bold tabular-nums text-slate-800 dark:text-slate-200">₹{fmtNum(totals.balance)}</TableCell>
                  <TableCell className="text-[11px] px-2 py-2.5 text-right font-bold tabular-nums text-cyan-800 dark:text-cyan-300">₹{fmtNum(totals.received)}</TableCell>
                  <TableCell className={`text-[11px] px-2 py-2.5 text-right font-bold tabular-nums ${totalPending > 0 ? "text-amber-800 dark:text-amber-300" : "text-emerald-800 dark:text-emerald-300"}`}>₹{fmtNum(totalPending)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {rows.some(r => r.split_type) && (
            <div className="flex items-center gap-4 px-3 py-2 text-[10px] text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-emerald-500/40 border border-emerald-500"></span> PKA (GST Bill)</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-amber-500/40 border border-amber-500"></span> KCA (Kaccha Slip — No GST)</span>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto bg-white dark:bg-slate-800">
          <Table>
            <TableHeader className="bg-slate-100 dark:bg-slate-900 sticky top-0">
              <TableRow>
                <TableHead className="text-slate-600 dark:text-slate-300 text-[11px] py-2 px-3 whitespace-nowrap">Party</TableHead>
                <TableHead className="text-slate-600 dark:text-slate-300 text-[11px] py-2 px-3 whitespace-nowrap">Products</TableHead>
                <TableHead className="text-slate-600 dark:text-slate-300 text-[11px] py-2 px-3 text-right whitespace-nowrap">Entries</TableHead>
                <TableHead className="text-slate-600 dark:text-slate-300 text-[11px] py-2 px-3 text-right whitespace-nowrap">N/W (Qtl)</TableHead>
                <TableHead className="text-slate-600 dark:text-slate-300 text-[11px] py-2 px-3 text-right whitespace-nowrap">Bags</TableHead>
                <TableHead className="text-slate-600 dark:text-slate-300 text-[11px] py-2 px-3 text-right whitespace-nowrap">Total</TableHead>
                <TableHead className="text-slate-600 dark:text-slate-300 text-[11px] py-2 px-3 text-right whitespace-nowrap">Received</TableHead>
                <TableHead className="text-slate-600 dark:text-slate-300 text-[11px] py-2 px-3 text-right whitespace-nowrap">Pending</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parties.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-slate-400">No data</TableCell></TableRow>
              ) : parties.map((p) => (
                <TableRow key={p.party_name} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <TableCell className="text-xs px-3 py-2 font-semibold">{p.party_name}</TableCell>
                  <TableCell className="text-[10px] px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {p.products.map(prod => (
                        <span key={prod} className="inline-block px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[9px] font-medium">
                          {prod}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs px-3 py-2 text-right">{p.rows}</TableCell>
                  <TableCell className="text-xs px-3 py-2 text-right tabular-nums">{fmtNum(p.net_weight_qtl)}</TableCell>
                  <TableCell className="text-xs px-3 py-2 text-right tabular-nums">{fmtInt(p.bags)}</TableCell>
                  <TableCell className="text-xs px-3 py-2 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400">₹{fmtNum(p.total)}</TableCell>
                  <TableCell className="text-xs px-3 py-2 text-right tabular-nums text-cyan-700 dark:text-cyan-400">₹{fmtNum(p.received)}</TableCell>
                  <TableCell className={`text-xs px-3 py-2 text-right tabular-nums font-bold ${p.balance > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}>₹{fmtNum(p.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* WhatsApp dialog */}
      {showWhatsAppDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowWhatsAppDialog(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full p-4 max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()} data-testid="ts-wa-dialog">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
              <MessageCircle className="w-5 h-5 text-[#25D366]" />
              WhatsApp Statement — Select Parties
            </h3>
            <div className="flex-1 overflow-y-auto space-y-1 mb-3">
              {parties.map(p => (
                <label key={p.party_name} className="flex items-center gap-2 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer">
                  <input type="checkbox" checked={selectedParties.includes(p.party_name)} onChange={() => toggleParty(p.party_name)} className="w-4 h-4 accent-[#25D366]" />
                  <span className="flex-1 text-sm text-slate-900 dark:text-white">{p.party_name}</span>
                  <span className="text-[10px] text-slate-500">₹{fmtNum(p.total)}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 bg-[#25D366] hover:bg-[#1ebe57] text-white" onClick={() => sendWhatsApp(selectedParties.length > 1 ? "group" : "single")} disabled={selectedParties.length === 0} data-testid="ts-wa-send">
                Send ({selectedParties.length})
              </Button>
              <Button variant="outline" onClick={() => setShowWhatsAppDialog(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
