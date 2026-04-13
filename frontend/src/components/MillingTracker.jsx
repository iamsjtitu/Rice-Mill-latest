import { useState, useEffect, useCallback } from "react";
import { fmtDate } from "@/utils/date";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Trash2, Edit, Plus, RefreshCw, Filter, X, ShoppingCart, Package, Download, FileText, ClipboardList, Scissors } from "lucide-react";
import { useConfirm } from "./ConfirmProvider";
import logger from "../utils/logger";
const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

const CURRENT_KMS_YEAR = (() => {
  const now = new Date();
  const y = now.getFullYear();
  // FY = April-March
  return now.getMonth() >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
})();

const PRODUCT_LABELS = {
  bran: "Bran (भूसी)", kunda: "Kunda (कुंडा)", broken: "Broken (टूटा)", kanki: "Kanki (कंकी)", husk: "Husk (भूसा)",
};

// ===== Sub-tab: Milling Entries =====
const MillingEntriesTab = ({ filters, user, paddyStock, frkStock, onRefresh }) => {
  const showConfirm = useConfirm();
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bpCategories, setBpCategories] = useState([]);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0], rice_type: "parboiled", paddy_input_qntl: "",
    rice_percent: "", frk_used_qntl: "", kms_year: CURRENT_KMS_YEAR, season: "Kharif", note: "",
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [millingFilters, setMillingFilters] = useState({ rice_type: "", date_from: "", date_to: "" });
  const [showFilters, setShowFilters] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      if (millingFilters.rice_type) params.append('rice_type', millingFilters.rice_type);
      if (millingFilters.date_from) params.append('date_from', millingFilters.date_from);
      if (millingFilters.date_to) params.append('date_to', millingFilters.date_to);
      const [entriesRes, summaryRes, catsRes] = await Promise.all([
        axios.get(`${API}/milling-entries?${params.toString()}`),
        axios.get(`${API}/milling-summary?${params.toString()}`),
        axios.get(`${API}/byproduct-categories`),
      ]);
      setEntries(entriesRes.data);
      setSummary(summaryRes.data);
      setBpCategories(catsRes.data || []);
    } catch (error) {
      toast.error("Milling data load nahi hua");
    } finally { setLoading(false); }
  }, [filters.kms_year, filters.season, millingFilters]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const nonAutoCats = bpCategories.filter(c => !c.is_auto);
  const autoCat = bpCategories.find(c => c.is_auto);

  const paddy = parseFloat(formData.paddy_input_qntl) || 0;
  const ricePct = parseFloat(formData.rice_percent) || 0;
  const manualPcts = nonAutoCats.reduce((sum, c) => sum + (parseFloat(formData[`${c.id}_percent`]) || 0), 0);
  const autoPct = Math.max(0, 100 - ricePct - manualPcts);
  const riceQntl = paddy * ricePct / 100;
  const frkUsed = parseFloat(formData.frk_used_qntl) || 0;
  const cmrQntl = riceQntl + frkUsed;
  const outturnRatio = paddy > 0 ? (cmrQntl / paddy * 100) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formData, paddy_input_qntl: paddy, rice_percent: ricePct, frk_used_qntl: frkUsed };
      nonAutoCats.forEach(c => { payload[`${c.id}_percent`] = parseFloat(formData[`${c.id}_percent`]) || 0; });
      if (editingId) {
        await axios.put(`${API}/milling-entries/${editingId}?username=${user.username}&role=${user.role}`, payload);
        toast.success("Milling entry update ho gayi!");
      } else {
        await axios.post(`${API}/milling-entries?username=${user.username}&role=${user.role}`, payload);
        toast.success("Milling entry save ho gayi!");
      }
      setIsDialogOpen(false); setEditingId(null);
      setFormData({ date: new Date().toISOString().split('T')[0], rice_type: "parboiled", paddy_input_qntl: "",
        rice_percent: "", frk_used_qntl: "", kms_year: CURRENT_KMS_YEAR, season: "Kharif", note: "" });
      fetchEntries(); onRefresh();
    } catch (error) { toast.error("Error: " + (error.response?.data?.detail || error.message)); }
  };

  const handleEdit = (entry) => {
    const fd = { date: entry.date, rice_type: entry.rice_type, paddy_input_qntl: entry.paddy_input_qntl.toString(),
      rice_percent: entry.rice_percent.toString(), frk_used_qntl: (entry.frk_used_qntl || 0).toString(),
      kms_year: entry.kms_year, season: entry.season, note: entry.note || "" };
    bpCategories.forEach(c => { fd[`${c.id}_percent`] = (entry[`${c.id}_percent`] || 0).toString(); });
    setFormData(fd);
    setEditingId(entry.id); setIsDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!await showConfirm("Delete Milling Entry", "Kya aap ye milling entry delete karna chahte hain?")) return;
    try {
      await axios.delete(`${API}/milling-entries/${id}?username=${user.username}&role=${user.role}`);
      toast.success("Delete ho gayi!"); fetchEntries(); onRefresh();
    } catch (error) { toast.error("Delete nahi hua"); }
  };

  const exportReport = async (format) => {
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      const { downloadFile } = await import('../utils/download');
      downloadFile(`/api/milling-report/${format}?${params.toString()}`, `milling_report.${format === 'excel' ? 'xlsx' : 'pdf'}`);
      toast.success(`${format.toUpperCase()} export ho gaya!`);
    } catch (error) { toast.error("Export failed"); }
  };

  return (
    <div className="space-y-4">
      {/* Stock Bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {paddyStock && (
          <Card className="bg-gradient-to-r from-slate-800 to-slate-800/80 border-slate-700">
            <CardContent className="p-3">
              <p className="text-[10px] text-slate-400 mb-1">Paddy Stock (QNTL - BAG - P.Cut)</p>
              <div className="flex items-center gap-3 text-sm flex-wrap">
                <div><span className="text-slate-400 text-xs">CMR:</span> <span className="text-blue-400 font-bold">{paddyStock.cmr_paddy_in_qntl || 0} Q</span></div>
                {paddyStock.pvt_paddy_in_qntl > 0 && <div><span className="text-slate-400 text-xs">Pvt:</span> <span className="text-purple-400 font-bold">{paddyStock.pvt_paddy_in_qntl} Q</span></div>}
                <div><span className="text-slate-400 text-xs">Total In:</span> <span className="text-blue-300 font-bold">{paddyStock.total_paddy_in_qntl} Q</span></div>
                <div><span className="text-slate-400 text-xs">Used:</span> <span className="text-orange-400 font-bold">{paddyStock.total_paddy_used_qntl} Q</span></div>
                <div><span className="text-slate-400 text-xs">Avl:</span> <span className={`font-bold ${paddyStock.available_paddy_qntl > 0 ? 'text-green-400' : 'text-red-400'}`}>{paddyStock.available_paddy_qntl} Q</span></div>
              </div>
            </CardContent>
          </Card>
        )}
        {frkStock && (
          <Card className="bg-gradient-to-r from-slate-800 to-slate-800/80 border-cyan-800/30">
            <CardContent className="p-3">
              <p className="text-[10px] text-cyan-400 mb-1">FRK Stock (Purchased)</p>
              <div className="flex items-center gap-4 text-sm">
                <div><span className="text-slate-400 text-xs">Bought:</span> <span className="text-cyan-400 font-bold">{frkStock.total_purchased_qntl} Q</span></div>
                <div><span className="text-slate-400 text-xs">Used:</span> <span className="text-orange-400 font-bold">{frkStock.total_used_qntl} Q</span></div>
                <div><span className="text-slate-400 text-xs">Avl:</span> <span className={`font-bold ${frkStock.available_qntl > 0 ? 'text-green-400' : 'text-red-400'}`}>{frkStock.available_qntl} Q</span></div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Summary Cards */}
      {summary && summary.total_entries > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Entries", val: summary.total_entries, color: "text-amber-400" },
            { label: "Paddy Used (Q)", val: summary.total_paddy_qntl, color: "text-blue-400" },
            { label: "Rice (Q)", val: summary.total_rice_qntl, color: "text-green-400" },
            { label: "FRK Used (Q)", val: summary.total_frk_qntl, color: "text-cyan-400" },
            { label: "CMR (Q)", val: summary.total_cmr_qntl, color: "text-emerald-400" },
            { label: "Avg Outturn %", val: `${summary.avg_outturn_ratio}%`, color: "text-purple-400" },
          ].map((c, i) => (
            <Card key={i} className="bg-slate-800 border-slate-700"><CardContent className="p-3 text-center">
              <p className="text-xs text-slate-400">{c.label}</p>
              <p className={`text-xl font-bold ${c.color}`}>{c.val}</p>
            </CardContent></Card>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => { setFormData({ date: new Date().toISOString().split('T')[0], rice_type: "parboiled", paddy_input_qntl: "",
          rice_percent: "", frk_used_qntl: "", kms_year: filters.kms_year || CURRENT_KMS_YEAR, season: filters.season || "Kharif", note: "" });
          setEditingId(null); setIsDialogOpen(true); }} className="bg-amber-500 hover:bg-amber-600 text-slate-900" size="sm" data-testid="milling-add-btn">
          <Plus className="w-4 h-4 mr-1" /> New Milling Entry
        </Button>
        <Button onClick={() => { fetchEntries(); onRefresh(); }} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
        <Button onClick={() => setShowFilters(!showFilters)} variant="outline" size="sm"
          className={showFilters ? "border-amber-500 text-amber-400" : "border-slate-600 text-slate-300 hover:bg-slate-700"}>
          <Filter className="w-4 h-4 mr-1" /> Filter
        </Button>
        <Button onClick={() => exportReport('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400 hover:bg-slate-700" data-testid="milling-export-excel">
          <Download className="w-4 h-4 mr-1" /> Excel
        </Button>
        <Button onClick={() => exportReport('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400 hover:bg-slate-700" data-testid="milling-export-pdf">
          <FileText className="w-4 h-4 mr-1" /> PDF
        </Button>
      </div>

      {showFilters && (
        <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <Label className="text-xs text-slate-400">Rice Type</Label>
              <Select value={millingFilters.rice_type || "all"} onValueChange={(v) => setMillingFilters(p => ({ ...p, rice_type: v === "all" ? "" : v }))}>
                <SelectTrigger className="w-36 bg-slate-700 border-slate-600 text-white h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="parboiled">Parboiled</SelectItem><SelectItem value="raw">Raw</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-400">From</Label>
              <Input type="date" value={millingFilters.date_from} onChange={(e) => setMillingFilters(p => ({ ...p, date_from: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-36" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">To</Label>
              <Input type="date" value={millingFilters.date_to} onChange={(e) => setMillingFilters(p => ({ ...p, date_to: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-36" />
            </div>
            <Button onClick={() => setMillingFilters({ rice_type: "", date_from: "", date_to: "" })} variant="ghost" size="sm" className="text-slate-400 h-8"><X className="w-3 h-3 mr-1" /> Clear</Button>
          </div>
        </CardContent></Card>
      )}

      {/* Table */}
      <Card className="bg-slate-800 border-slate-700"><CardContent className="p-0"><div className="overflow-x-auto">
        <Table><TableHeader><TableRow className="border-slate-700 hover:bg-transparent">
          {['Date','Type','Paddy(Q)','Rice%','Rice(Q)','FRK(Q)','CMR(Q)','Outturn%',
            ...bpCategories.map(c => c.is_auto ? `${c.name}%` : `${c.name}(Q)`),
            'Note','Actions'].map(h =>
            <TableHead key={h} className={`text-slate-300 text-xs ${['Date','Type','Note'].includes(h) ? '' : h === 'Actions' ? 'text-center' : 'text-right'}`}>{h}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={10 + bpCategories.length} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
          : entries.length === 0 ? <TableRow><TableCell colSpan={10 + bpCategories.length} className="text-center text-slate-400 py-8">Koi milling entry nahi hai</TableCell></TableRow>
          : entries.map(e => (
            <TableRow key={e.id} className="border-slate-700">
              <TableCell className="text-white text-xs">{fmtDate(e.date)}</TableCell>
              <TableCell className="text-xs"><span className={`px-2.5 py-1 rounded-md text-xs font-bold tracking-wide ${e.rice_type === 'parboiled' ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40' : 'bg-sky-500/25 text-sky-300 border border-sky-500/40'}`}>{e.rice_type === 'parboiled' ? 'Usna' : 'Arwa'}</span></TableCell>
              <TableCell className="text-blue-300 text-xs text-right font-medium">{e.paddy_input_qntl}</TableCell>
              <TableCell className="text-slate-300 text-xs text-right">{e.rice_percent}%</TableCell>
              <TableCell className="text-green-400 text-xs text-right font-medium">{e.rice_qntl}</TableCell>
              <TableCell className="text-cyan-300 text-xs text-right">{e.frk_used_qntl || 0}</TableCell>
              <TableCell className="text-emerald-400 text-xs text-right font-bold">{e.cmr_delivery_qntl}</TableCell>
              <TableCell className="text-purple-400 text-xs text-right font-bold">{e.outturn_ratio}%</TableCell>
              {bpCategories.map(c => (
                <TableCell key={c.id} className={`text-xs text-right ${c.is_auto ? 'text-yellow-300' : 'text-orange-300'}`}>
                  {c.is_auto ? `${e[`${c.id}_percent`] || 0}%` : (e[`${c.id}_qntl`] || 0)}
                </TableCell>
              ))}
              <TableCell className="text-slate-400 text-xs max-w-[80px] truncate">{e.note}</TableCell>
              <TableCell className="text-center"><div className="flex gap-1 justify-center">
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-400" onClick={() => handleEdit(e)}><Edit className="w-3 h-3" /></Button>
                {user.role === 'admin' && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => handleDelete(e.id)}><Trash2 className="w-3 h-3" /></Button>}
              </div></TableCell>
            </TableRow>
          ))}
        </TableBody></Table>
      </div></CardContent></Card>

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(v) => { setIsDialogOpen(v); if (!v) setEditingId(null); }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto" data-testid="milling-form-dialog">
          <DialogHeader><DialogTitle className="text-amber-400">{editingId ? "Edit Milling Entry" : "New Milling Entry"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={formData.date} onChange={(e) => setFormData(p => ({ ...p, date: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="milling-form-date" /></div>
              <div><Label className="text-xs text-slate-400">Rice Type</Label>
                <Select value={formData.rice_type} onValueChange={(v) => setFormData(p => ({ ...p, rice_type: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="milling-form-type"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="parboiled">Parboiled (उसना)</SelectItem><SelectItem value="raw">Raw (अरवा)</SelectItem></SelectContent>
                </Select></div>
            </div>
            <div><Label className="text-xs text-slate-400">Paddy Input (QNTL) {paddyStock && <span className={`font-bold ${(paddyStock.available_paddy_qntl - (parseFloat(formData.paddy_input_qntl) || 0)) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>(Stock: {Math.round((paddyStock.available_paddy_qntl - (parseFloat(formData.paddy_input_qntl) || 0)) * 100) / 100} Q)</span>}</Label>
              <Input type="number" step="0.01" value={formData.paddy_input_qntl} onChange={(e) => setFormData(p => ({ ...p, paddy_input_qntl: e.target.value }))}
                placeholder={paddyStock ? `Max ${paddyStock.available_paddy_qntl}` : ""} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="milling-form-paddy" />
              {paddyStock && paddy > paddyStock.available_paddy_qntl && <p className="text-red-400 text-xs mt-1">Stock se zyada!</p>}
            </div>
            <div className="border border-slate-600 rounded p-3 space-y-2">
              <p className="text-xs text-amber-400 font-medium">Paddy Output % / धान से निकला</p>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-[10px] text-slate-400">Rice%</Label>
                  <Input type="number" step="0.01" value={formData.rice_percent} onChange={(e) => setFormData(p => ({ ...p, rice_percent: e.target.value }))}
                    placeholder="52" className="bg-slate-700 border-slate-600 text-white h-7 text-xs" data-testid="milling-form-rice-pct" /></div>
                {nonAutoCats.map(c => (
                  <div key={c.id}><Label className="text-[10px] text-slate-400">{c.name}%</Label>
                    <Input type="number" step="0.01" value={formData[`${c.id}_percent`] || ""} onChange={(e) => setFormData(p => ({ ...p, [`${c.id}_percent`]: e.target.value }))}
                      placeholder="0" className="bg-slate-700 border-slate-600 text-white h-7 text-xs" data-testid={`milling-form-${c.id}-pct`} /></div>))}
                {autoCat && <div><Label className="text-[10px] text-slate-400">{autoCat.name}% (Auto)</Label>
                  <div className="bg-slate-900 border border-slate-600 rounded h-7 flex items-center px-2 text-xs text-yellow-300">{autoPct.toFixed(2)}%</div></div>}
              </div>
              {(ricePct + manualPcts) > 100 && <p className="text-red-400 text-xs">100% se zyada! ({(ricePct + manualPcts).toFixed(2)}%)</p>}
            </div>
            <div className="border border-cyan-800/40 rounded p-3">
              <p className="text-xs text-cyan-400 font-medium mb-1">FRK from Stock / स्टॉक से FRK {frkStock && <span className="text-green-400">(Avl: {frkStock.available_qntl} Q)</span>}</p>
              <Input type="number" step="0.01" value={formData.frk_used_qntl} onChange={(e) => setFormData(p => ({ ...p, frk_used_qntl: e.target.value }))}
                placeholder="0" className="bg-slate-700 border-slate-600 text-white h-7 text-xs" data-testid="milling-form-frk-used" />
              {frkStock && frkUsed > frkStock.available_qntl && <p className="text-red-400 text-xs mt-1">FRK stock se zyada!</p>}
            </div>
            <div className="border border-slate-600 rounded p-3 bg-slate-900/50">
              <p className="text-xs text-green-400 font-medium mb-2">Live Preview</p>
              <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between"><span className="text-slate-400">Rice:</span><span>{riceQntl.toFixed(2)} Q</span></div>
                <div className="flex justify-between"><span className="text-slate-400">FRK:</span><span className="text-cyan-300">{frkUsed.toFixed(2)} Q</span></div>
                {nonAutoCats.map(c => (
                  <div key={c.id} className="flex justify-between"><span className="text-slate-400">{c.name}:</span><span>{(paddy * (parseFloat(formData[`${c.id}_percent`]) || 0) / 100).toFixed(2)} Q</span></div>
                ))}
                {autoCat && <div className="flex justify-between"><span className="text-slate-400">{autoCat.name}:</span><span className="text-yellow-300">{(paddy * autoPct / 100).toFixed(2)} Q</span></div>}
                <div className="flex justify-between"><span className="text-slate-400">CMR:</span><span className="text-emerald-400 font-bold">{cmrQntl.toFixed(2)} Q</span></div>
                <div className="flex justify-between col-span-3"><span className="text-slate-400">Outturn:</span><span className={`font-bold ${outturnRatio >= 67 ? 'text-green-400' : outturnRatio >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{outturnRatio.toFixed(2)}%</span></div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-[10px] text-slate-400">FY Year</Label><Input value={formData.kms_year} onChange={(e) => setFormData(p => ({ ...p, kms_year: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-7 text-xs" /></div>
              <div><Label className="text-[10px] text-slate-400">Season</Label>
                <Select value={formData.season} onValueChange={(v) => setFormData(p => ({ ...p, season: v }))}><SelectTrigger className="bg-slate-700 border-slate-600 text-white h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Kharif">Kharif</SelectItem><SelectItem value="Rabi">Rabi</SelectItem></SelectContent></Select></div>
              <div><Label className="text-[10px] text-slate-400">Note</Label><Input value={formData.note} onChange={(e) => setFormData(p => ({ ...p, note: e.target.value }))} placeholder="Optional" className="bg-slate-700 border-slate-600 text-white h-7 text-xs" /></div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-slate-900 flex-1" data-testid="milling-form-submit">{editingId ? "Update" : "Save Entry"}</Button>
              <Button type="button" variant="outline" className="border-slate-600 text-slate-300" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};


// ===== Sub-tab: FRK Purchases =====
const FrkPurchaseTab = ({ filters, user, frkStock, onRefresh }) => {
  const showConfirm = useConfirm();
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], party_name: "", quantity_qntl: "", rate_per_qntl: "", note: "", kms_year: CURRENT_KMS_YEAR, season: "Kharif" });

  const fetch = useCallback(async () => {
    try { setLoading(true);
      const params = new URLSearchParams();
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      const res = await axios.get(`${API}/frk-purchases?${params.toString()}`);
      setPurchases(res.data);
    } catch (e) { toast.error("FRK data load nahi hua"); } finally { setLoading(false); }
  }, [filters.kms_year, filters.season]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/frk-purchases?username=${user.username}&role=${user.role}`, {
        ...form, quantity_qntl: parseFloat(form.quantity_qntl) || 0, rate_per_qntl: parseFloat(form.rate_per_qntl) || 0 });
      toast.success("FRK purchase save ho gayi!");
      setIsDialogOpen(false); setForm({ date: new Date().toISOString().split('T')[0], party_name: "", quantity_qntl: "", rate_per_qntl: "", note: "", kms_year: CURRENT_KMS_YEAR, season: "Kharif" });
      fetch(); onRefresh();
    } catch (error) { toast.error("Error: " + (error.response?.data?.detail || error.message)); }
  };

  const handleDelete = async (id) => {
    if (!await showConfirm("Delete", "Delete karna chahte hain?")) return;
    try { await axios.delete(`${API}/frk-purchases/${id}`); toast.success("Deleted!"); fetch(); onRefresh(); } catch (e) { toast.error("Delete nahi hua"); }
  };

  return (
    <div className="space-y-4">
      {frkStock && (
        <Card className="bg-gradient-to-r from-slate-800 to-slate-800/80 border-cyan-800/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-6 text-sm">
              <div><span className="text-slate-400 text-xs">Total Purchased:</span> <span className="text-cyan-400 font-bold">{frkStock.total_purchased_qntl} Q</span></div>
              <div><span className="text-slate-400 text-xs">Used in CMR:</span> <span className="text-orange-400 font-bold">{frkStock.total_used_qntl} Q</span></div>
              <div><span className="text-slate-400 text-xs">Available:</span> <span className={`font-bold ${frkStock.available_qntl > 0 ? 'text-green-400' : 'text-red-400'}`}>{frkStock.available_qntl} Q</span></div>
              <div><span className="text-slate-400 text-xs">Total Cost:</span> <span className="text-amber-400 font-bold">₹{frkStock.total_cost?.toLocaleString()}</span></div>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="flex gap-2">
        <Button onClick={() => { setForm({ date: new Date().toISOString().split('T')[0], party_name: "", quantity_qntl: "", rate_per_qntl: "", note: "", kms_year: filters.kms_year || CURRENT_KMS_YEAR, season: filters.season || "Kharif" }); setIsDialogOpen(true); }}
          className="bg-cyan-600 hover:bg-cyan-700 text-white" size="sm" data-testid="frk-add-btn"><Plus className="w-4 h-4 mr-1" /> New FRK Purchase</Button>
        <Button onClick={() => { fetch(); onRefresh(); }} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
        <Button onClick={async () => { try { const params = new URLSearchParams(); if (filters.kms_year) params.append('kms_year', filters.kms_year); if (filters.season) params.append('season', filters.season); const { downloadFile } = await import('../utils/download'); downloadFile(`/api/frk-purchases/excel?${params}`, 'frk_purchases.xlsx'); toast.success("Excel export!"); } catch(e) { toast.error("Export failed"); }}}
          variant="outline" size="sm" className="border-slate-600 text-green-400 hover:bg-slate-700" data-testid="frk-export-excel"><Download className="w-4 h-4 mr-1" /> Excel</Button>
        <Button onClick={async () => { try { const params = new URLSearchParams(); if (filters.kms_year) params.append('kms_year', filters.kms_year); if (filters.season) params.append('season', filters.season); const { downloadFile } = await import('../utils/download'); downloadFile(`/api/frk-purchases/pdf?${params}`, 'frk_purchases.pdf'); toast.success("PDF export!"); } catch(e) { toast.error("Export failed"); }}}
          variant="outline" size="sm" className="border-slate-600 text-red-400 hover:bg-slate-700" data-testid="frk-export-pdf"><FileText className="w-4 h-4 mr-1" /> PDF</Button>
      </div>
      <Card className="bg-slate-800 border-slate-700"><CardContent className="p-0"><div className="overflow-x-auto">
        <Table><TableHeader><TableRow className="border-slate-700 hover:bg-transparent">
          {['Date','Party Name','Qty (Q)','Rate (₹/Q)','Amount (₹)','Note','Actions'].map(h =>
            <TableHead key={h} className={`text-slate-300 text-xs ${['Qty (Q)','Rate (₹/Q)','Amount (₹)'].includes(h) ? 'text-right' : h === 'Actions' ? 'text-center' : ''}`}>{h}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-6">Loading...</TableCell></TableRow>
          : purchases.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-6">Koi FRK purchase nahi hai</TableCell></TableRow>
          : purchases.map(p => (
            <TableRow key={p.id} className="border-slate-700">
              <TableCell className="text-white text-xs">{fmtDate(p.date)}</TableCell>
              <TableCell className="text-slate-300 text-xs">{p.party_name}</TableCell>
              <TableCell className="text-cyan-300 text-xs text-right font-medium">{p.quantity_qntl}</TableCell>
              <TableCell className="text-slate-300 text-xs text-right">₹{p.rate_per_qntl}</TableCell>
              <TableCell className="text-amber-400 text-xs text-right font-bold">₹{(p.total_amount || 0).toLocaleString()}</TableCell>
              <TableCell className="text-slate-400 text-xs max-w-[100px] truncate">{p.note}</TableCell>
              <TableCell className="text-center">{user.role === 'admin' &&
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => handleDelete(p.id)}><Trash2 className="w-3 h-3" /></Button>}
              </TableCell>
            </TableRow>))}
        </TableBody></Table>
      </div></CardContent></Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md" data-testid="frk-form-dialog">
          <DialogHeader><DialogTitle className="text-cyan-400">New FRK Purchase / FRK खरीद</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Date</Label><Input type="date" value={form.date} onChange={(e) => setForm(p => ({ ...p, date: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="frk-form-date" /></div>
              <div><Label className="text-xs text-slate-400">Party Name</Label><Input value={form.party_name} onChange={(e) => setForm(p => ({ ...p, party_name: e.target.value }))} placeholder="Party name" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="frk-form-party" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Quantity (QNTL)</Label><Input type="number" step="0.01" value={form.quantity_qntl} onChange={(e) => setForm(p => ({ ...p, quantity_qntl: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="frk-form-qty" /></div>
              <div><Label className="text-xs text-slate-400">Rate (₹/QNTL)</Label><Input type="number" step="0.01" value={form.rate_per_qntl} onChange={(e) => setForm(p => ({ ...p, rate_per_qntl: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="frk-form-rate" /></div>
            </div>
            {(parseFloat(form.quantity_qntl) > 0 && parseFloat(form.rate_per_qntl) > 0) && <p className="text-sm text-amber-400 font-medium">Total: ₹{((parseFloat(form.quantity_qntl)||0) * (parseFloat(form.rate_per_qntl)||0)).toLocaleString()}</p>}
            <div><Label className="text-xs text-slate-400">Note</Label><Input value={form.note} onChange={(e) => setForm(p => ({ ...p, note: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="bg-cyan-600 hover:bg-cyan-700 text-white flex-1" data-testid="frk-form-submit">Save Purchase</Button>
              <Button type="button" variant="outline" className="border-slate-600 text-slate-300" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};


// ===== Sub-tab: By-Product Stock & Sales =====
const ByProductTab = ({ filters, user, onRefresh }) => {
  const showConfirm = useConfirm();
  const [stock, setStock] = useState(null);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaleDialogOpen, setIsSaleDialogOpen] = useState(false);
  const [saleForm, setSaleForm] = useState({ date: new Date().toISOString().split('T')[0], product: "bran", quantity_qntl: "", rate_per_qntl: "", buyer_name: "", note: "", kms_year: CURRENT_KMS_YEAR, season: "Kharif" });

  const fetchData = useCallback(async () => {
    try { setLoading(true);
      const params = new URLSearchParams();
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      const [stockRes, salesRes] = await Promise.all([axios.get(`${API}/byproduct-stock?${params}`), axios.get(`${API}/byproduct-sales?${params}`)]);
      setStock(stockRes.data); setSales(salesRes.data);
    } catch (e) { toast.error("Data load nahi hua"); } finally { setLoading(false); }
  }, [filters.kms_year, filters.season]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/byproduct-sales?username=${user.username}&role=${user.role}`, { ...saleForm, quantity_qntl: parseFloat(saleForm.quantity_qntl) || 0, rate_per_qntl: parseFloat(saleForm.rate_per_qntl) || 0 });
      toast.success("Sale save ho gayi!"); setIsSaleDialogOpen(false);
      setSaleForm({ date: new Date().toISOString().split('T')[0], product: "bran", quantity_qntl: "", rate_per_qntl: "", buyer_name: "", note: "", kms_year: CURRENT_KMS_YEAR, season: "Kharif" });
      fetchData(); onRefresh();
    } catch (error) { toast.error("Error: " + (error.response?.data?.detail || error.message)); }
  };

  const handleDeleteSale = async (id) => {
    if (!await showConfirm("Delete", "Delete karna chahte hain?")) return;
    try { await axios.delete(`${API}/byproduct-sales/${id}`); toast.success("Deleted!"); fetchData(); onRefresh(); } catch (e) { toast.error("Delete nahi hua"); }
  };

  return (
    <div className="space-y-4">
      {stock && <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {Object.entries(PRODUCT_LABELS).map(([key, label]) => { const s = stock[key] || {};
          return (<Card key={key} className="bg-slate-800 border-slate-700" data-testid={`byproduct-stock-${key}`}><CardContent className="p-3">
            <p className="text-xs text-amber-400 font-medium mb-2">{label}</p>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-slate-400">Produced:</span><span className="text-green-400">{s.produced_qntl || 0} Q</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Sold:</span><span className="text-orange-400">{s.sold_qntl || 0} Q</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Available:</span><span className="text-white font-bold">{s.available_qntl || 0} Q</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Revenue:</span><span className="text-emerald-400">₹{(s.total_revenue || 0).toLocaleString()}</span></div>
            </div>
            <Button onClick={() => { setSaleForm(p => ({ ...p, product: key, kms_year: filters.kms_year || CURRENT_KMS_YEAR, season: filters.season || "Kharif" })); setIsSaleDialogOpen(true); }}
              size="sm" variant="outline" className="w-full mt-2 h-6 text-xs border-slate-600 text-slate-300 hover:bg-slate-700"><ShoppingCart className="w-3 h-3 mr-1" /> Sell</Button>
          </CardContent></Card>); })}
      </div>}
      <div className="flex gap-2">
        <Button onClick={async () => { try { const params = new URLSearchParams(); if (filters.kms_year) params.append('kms_year', filters.kms_year); if (filters.season) params.append('season', filters.season); const { downloadFile } = await import('../utils/download'); downloadFile(`/api/byproduct-sales/excel?${params}`, 'byproduct_sales.xlsx'); toast.success("Excel export!"); } catch(e) { toast.error("Export failed"); }}}
          variant="outline" size="sm" className="border-slate-600 text-green-400 hover:bg-slate-700" data-testid="byproduct-export-excel"><Download className="w-4 h-4 mr-1" /> Excel</Button>
        <Button onClick={async () => { try { const params = new URLSearchParams(); if (filters.kms_year) params.append('kms_year', filters.kms_year); if (filters.season) params.append('season', filters.season); const { downloadFile } = await import('../utils/download'); downloadFile(`/api/byproduct-sales/pdf?${params}`, 'byproduct_sales.pdf'); toast.success("PDF export!"); } catch(e) { toast.error("Export failed"); }}}
          variant="outline" size="sm" className="border-slate-600 text-red-400 hover:bg-slate-700" data-testid="byproduct-export-pdf"><FileText className="w-4 h-4 mr-1" /> PDF</Button>
      </div>
      <Card className="bg-slate-800 border-slate-700"><CardHeader className="pb-2 pt-3 px-4"><div className="flex justify-between items-center">
        <CardTitle className="text-sm text-amber-400">Recent Sales</CardTitle>
        <Button onClick={() => { setSaleForm({ date: new Date().toISOString().split('T')[0], product: "bran", quantity_qntl: "", rate_per_qntl: "", buyer_name: "", note: "", kms_year: filters.kms_year || CURRENT_KMS_YEAR, season: filters.season || "Kharif" }); setIsSaleDialogOpen(true); }}
          size="sm" className="bg-amber-500 hover:bg-amber-600 text-slate-900 h-7 text-xs"><Plus className="w-3 h-3 mr-1" /> New Sale</Button>
      </div></CardHeader>
      <CardContent className="p-0"><div className="overflow-x-auto">
        <Table><TableHeader><TableRow className="border-slate-700 hover:bg-transparent">
          {['Date','Product','Qty(Q)','Rate(₹/Q)','Amount(₹)','Buyer','Note',''].map(h => <TableHead key={h} className="text-slate-300 text-xs">{h}</TableHead>)}
        </TableRow></TableHeader><TableBody>
          {loading ? <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-6">Loading...</TableCell></TableRow>
          : sales.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-6">Koi sale nahi</TableCell></TableRow>
          : sales.map(s => (<TableRow key={s.id} className="border-slate-700">
            <TableCell className="text-white text-xs">{fmtDate(s.date)}</TableCell>
            <TableCell className="text-xs"><span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400">{PRODUCT_LABELS[s.product]||s.product}</span></TableCell>
            <TableCell className="text-blue-300 text-xs">{s.quantity_qntl}</TableCell>
            <TableCell className="text-slate-300 text-xs">₹{s.rate_per_qntl}</TableCell>
            <TableCell className="text-emerald-400 text-xs font-bold">₹{(s.total_amount||0).toLocaleString()}</TableCell>
            <TableCell className="text-slate-300 text-xs">{s.buyer_name}</TableCell>
            <TableCell className="text-slate-400 text-xs max-w-[80px] truncate">{s.note}</TableCell>
            <TableCell>{user.role === 'admin' && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => handleDeleteSale(s.id)}><Trash2 className="w-3 h-3" /></Button>}</TableCell>
          </TableRow>))}
        </TableBody></Table>
      </div></CardContent></Card>

      <Dialog open={isSaleDialogOpen} onOpenChange={setIsSaleDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md" data-testid="sale-form-dialog">
          <DialogHeader><DialogTitle className="text-amber-400">By-Product Sale / बिक्री</DialogTitle></DialogHeader>
          <form onSubmit={handleSaleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Date</Label><Input type="date" value={saleForm.date} onChange={(e) => setSaleForm(p => ({...p, date: e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required /></div>
              <div><Label className="text-xs text-slate-400">Product</Label><Select value={saleForm.product} onValueChange={(v) => setSaleForm(p => ({...p, product: v}))}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PRODUCT_LABELS).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Qty (QNTL) {stock && stock[saleForm.product] && <span className="text-green-400">(Avl: {stock[saleForm.product].available_qntl}Q)</span>}</Label>
                <Input type="number" step="0.01" value={saleForm.quantity_qntl} onChange={(e) => setSaleForm(p => ({...p, quantity_qntl: e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required /></div>
              <div><Label className="text-xs text-slate-400">Rate (₹/Q)</Label><Input type="number" step="0.01" value={saleForm.rate_per_qntl} onChange={(e) => setSaleForm(p => ({...p, rate_per_qntl: e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required /></div>
            </div>
            <div><Label className="text-xs text-slate-400">Buyer Name</Label><Input value={saleForm.buyer_name} onChange={(e) => setSaleForm(p => ({...p, buyer_name: e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
            {(parseFloat(saleForm.quantity_qntl)>0 && parseFloat(saleForm.rate_per_qntl)>0) && <p className="text-sm text-emerald-400">Total: ₹{((parseFloat(saleForm.quantity_qntl)||0)*(parseFloat(saleForm.rate_per_qntl)||0)).toLocaleString()}</p>}
            <div className="flex gap-2 pt-2"><Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-slate-900 flex-1">Save Sale</Button>
              <Button type="button" variant="outline" className="border-slate-600 text-slate-300" onClick={() => setIsSaleDialogOpen(false)}>Cancel</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};


// ===== Sub-tab: Paddy Chalna (Cutting) =====
const PaddyChalnaTab = ({ filters }) => {
  const showConfirm = useConfirm();
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], bags_cut: "", remark: "" });
  const [editingId, setEditingId] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
      const sumParams = new URLSearchParams();
      if (filters.kms_year) sumParams.append('kms_year', filters.kms_year);
      if (filters.season) sumParams.append('season', filters.season);
      const [eRes, sRes] = await Promise.all([
        axios.get(`${API}/paddy-cutting?${params}`),
        axios.get(`${API}/paddy-cutting/summary?${sumParams}`)
      ]);
      setEntries(eRes.data.entries || []);
      setSummary(sRes.data);
    } catch (e) { /* ignore */ }
    setLoading(false);
  }, [filters.kms_year, filters.season, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => { setForm({ date: new Date().toISOString().split('T')[0], bags_cut: "", remark: "" }); setEditingId(null); };

  const handleSave = async () => {
    if (!form.bags_cut || Number(form.bags_cut) <= 0) { toast.error("Bags Cut daalen"); return; }
    try {
      const payload = { ...form, bags_cut: Number(form.bags_cut), kms_year: filters.kms_year || "", season: filters.season || "" };
      if (editingId) {
        await axios.put(`${API}/paddy-cutting/${editingId}`, payload);
        toast.success("Updated");
      } else {
        await axios.post(`${API}/paddy-cutting`, payload);
        toast.success("Cutting entry saved");
      }
      resetForm(); setIsDialogOpen(false); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const handleEdit = (e) => { setForm({ date: e.date, bags_cut: e.bags_cut, remark: e.remark || "" }); setEditingId(e.id); setIsDialogOpen(true); };

  const handleDelete = async (id) => {
    if (!await showConfirm("Delete", "Kya aap ye cutting entry delete karna chahte hain?")) return;
    try { await axios.delete(`${API}/paddy-cutting/${id}`); toast.success("Deleted"); fetchData(); } catch (e) { logger.error(e); toast.error("Error"); }
  };

  const handleExport = async (type) => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);
    try {
      const res = await axios.get(`${API}/paddy-cutting/${type}?${params}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url;
      a.download = `paddy_chalna.${type === 'excel' ? 'xlsx' : 'pdf'}`;
      a.click(); window.URL.revokeObjectURL(url);
    } catch (e) { logger.error(e); toast.error("Export failed"); }
  };

  const s = summary || {};

  return (
    <div className="space-y-4" data-testid="paddy-chalna-tab">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-gradient-to-br from-blue-900/40 to-slate-800 border-blue-800/50">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">Total Paddy Bags</p>
            <p className="text-2xl font-bold text-blue-400" data-testid="bags-total">{(s.total_received || 0).toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">Mill + Plastic (From truck entries)</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-900/40 to-slate-800 border-amber-800/50">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">Total Cut</p>
            <p className="text-2xl font-bold text-amber-400" data-testid="total-cut">{(s.total_cut || 0).toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">Chalna / Cutting done</p>
          </CardContent>
        </Card>
        <Card className={`bg-gradient-to-br ${(s.remaining || 0) >= 0 ? 'from-green-900/40 to-slate-800 border-green-800/50' : 'from-red-900/40 to-slate-800 border-red-800/50'}`}>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">Remaining Paddy Bags</p>
            <p className={`text-2xl font-bold ${(s.remaining || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`} data-testid="bags-remaining">{(s.remaining || 0).toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">Total - Cut</p>
          </CardContent>
        </Card>
      </div>

      {/* Date Filter + Export */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-slate-400 text-xs">From Date</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-slate-700 border-slate-600 text-white w-40" data-testid="cutting-date-from" />
        </div>
        <div>
          <Label className="text-slate-400 text-xs">To Date</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-slate-700 border-slate-600 text-white w-40" data-testid="cutting-date-to" />
        </div>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-slate-400 hover:text-white h-9" data-testid="cutting-clear-dates">
            <X className="w-4 h-4 mr-1" /> Clear
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('excel')} className="border-green-700 text-green-400 hover:bg-green-900/30" data-testid="cutting-export-excel">
            <Download className="w-4 h-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('pdf')} className="border-red-700 text-red-400 hover:bg-red-900/30" data-testid="cutting-export-pdf">
            <FileText className="w-4 h-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Add Entry Button + Table */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-2 pt-3 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm text-amber-400 flex items-center gap-2"><Scissors className="w-4 h-4" /> Paddy Chalna Log</CardTitle>
          <Button size="sm" onClick={() => { resetForm(); setIsDialogOpen(true); }} className="bg-amber-600 hover:bg-amber-700 text-white" data-testid="add-cutting-btn">
            <Plus className="w-4 h-4 mr-1" /> Nayi Cutting
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {loading ? <p className="text-slate-500 text-sm text-center py-4">Loading...</p> : entries.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-6">Koi cutting entry nahi hai. "Nayi Cutting" se add karein.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-xs">#</TableHead>
                    <TableHead className="text-slate-400 text-xs">Date</TableHead>
                    <TableHead className="text-slate-400 text-xs text-right">Bags Cut</TableHead>
                    <TableHead className="text-slate-400 text-xs">Remark</TableHead>
                    <TableHead className="text-slate-400 text-xs text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e, i) => (
                    <TableRow key={e.id} className="border-slate-700/50 hover:bg-slate-700/30" data-testid={`cutting-row-${i}`}>
                      <TableCell className="py-2 text-xs text-slate-500">{i + 1}</TableCell>
                      <TableCell className="py-2 text-sm text-slate-200">{fmtDate(e.date)}</TableCell>
                      <TableCell className="py-2 text-sm text-amber-400 font-semibold text-right">{(e.bags_cut || 0).toLocaleString()}</TableCell>
                      <TableCell className="py-2 text-xs text-slate-400">{e.remark || '-'}</TableCell>
                      <TableCell className="py-2 text-center">
                        <div className="flex gap-1 justify-center">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-amber-400" onClick={() => handleEdit(e)} data-testid={`cutting-edit-${i}`}><Edit className="w-3 h-3" /></Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-red-400" onClick={() => handleDelete(e.id)} data-testid={`cutting-del-${i}`}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={v => { if (!v) resetForm(); setIsDialogOpen(v); }}>
        <DialogContent className="bg-slate-800 border-slate-600 max-w-sm" data-testid="cutting-dialog">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2"><Scissors className="w-4 h-4" /> {editingId ? "Edit Cutting" : "Nayi Cutting Entry"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-slate-300 text-xs">Date</Label>
              <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="bg-slate-700 border-slate-600 text-white" data-testid="cutting-date" />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Bags Cut</Label>
              <Input type="number" value={form.bags_cut} onChange={e => setForm(p => ({ ...p, bags_cut: e.target.value }))} placeholder="Kitne bags cut kiye" className="bg-slate-700 border-slate-600 text-white" data-testid="cutting-bags" />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Remark</Label>
              <Input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))} placeholder="Optional note" className="bg-slate-700 border-slate-600 text-white" data-testid="cutting-remark" />
            </div>
            <Button onClick={handleSave} className="w-full bg-amber-600 hover:bg-amber-700" data-testid="cutting-save-btn">{editingId ? "Update" : "Save"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};


// ===== Main MillingTracker Component =====
const MillingTracker = ({ filters, user }) => {
  const [subTab, setSubTab] = useState("milling");
  const [paddyStock, setPaddyStock] = useState(null);
  const [frkStock, setFrkStock] = useState(null);

  const fetchStocks = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      const [ps, fs] = await Promise.all([
        axios.get(`${API}/paddy-stock?${params}`), axios.get(`${API}/frk-stock?${params}`)]);
      setPaddyStock(ps.data); setFrkStock(fs.data);
    } catch (e) { /* ignore */ }
  }, [filters.kms_year, filters.season]);

  useEffect(() => { fetchStocks(); }, [fetchStocks]);

  const tabs = [
    { id: "milling", label: "Milling Entries" },
    { id: "chalna", label: "Paddy Chalna" },
  ];

  return (
    <div className="space-y-4" data-testid="milling-tracker">
      <div className="flex gap-2 border-b border-slate-700 pb-2 flex-wrap">
        {tabs.map(t => (
          <Button key={t.id} onClick={() => setSubTab(t.id)} variant={subTab === t.id ? "default" : "ghost"} size="sm"
            className={subTab === t.id ? "bg-amber-500 hover:bg-amber-600 text-slate-900" : "text-slate-300 hover:bg-slate-700"}
            data-testid={`subtab-${t.id}`}>
            {t.id === 'custody' && <ClipboardList className="w-4 h-4 mr-1" />}
            {t.id === 'chalna' && <Scissors className="w-4 h-4 mr-1" />}
            {t.label}
          </Button>
        ))}
      </div>
      {subTab === "milling" && <MillingEntriesTab filters={filters} user={user} paddyStock={paddyStock} frkStock={frkStock} onRefresh={fetchStocks} />}
      {subTab === "chalna" && <PaddyChalnaTab filters={filters} />}
    </div>
  );
};

export default MillingTracker;
