import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Edit, Search, Eye, Download } from "lucide-react";
import { fmtDate } from "@/utils/date";
import { useConfirm } from "./ConfirmProvider";
import logger from "../utils/logger";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const API = `${_isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '')}/api`;

export default function OilPremiumRegister({ filters, user }) {
  const showConfirm = useConfirm();
  const [items, setItems] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewItem, setViewItem] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const blankForm = {
    date: new Date().toISOString().split("T")[0],
    voucher_no: "", rst_no: "", bran_type: "Boiled",
    party_name: "", rate: "", qty_qtl: "",
    actual_oil_pct: "", remark: "",
    sale_ref_id: "",
    kms_year: filters.kms_year || "", season: filters.season || "",
  };
  const [form, setForm] = useState(blankForm);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      if (filters.season) params.append("season", filters.season);
      const res = await axios.get(`${API}/oil-premium?${params}`);
      setItems(res.data);
    } catch (e) { logger.error(e); }
  }, [filters.kms_year, filters.season]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const lookupSale = async (field, value) => {
    if (!value) return;
    setLookupLoading(true);
    try {
      const params = new URLSearchParams();
      params.append(field, value);
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      const res = await axios.get(`${API}/oil-premium/lookup-sale?${params}`);
      if (res.data) {
        const s = res.data;
        setForm(p => ({
          ...p,
          sale_ref_id: s.id || "",
          voucher_no: s.voucher_no || p.voucher_no,
          rst_no: s.rst_no || p.rst_no,
          party_name: s.party_name || "",
          rate: s.rate_per_qtl ? String(s.rate_per_qtl) : "",
          qty_qtl: s.net_weight_qtl ? String(s.net_weight_qtl) : "",
          date: s.date || p.date,
        }));
        toast.success("Sale details fetch ho gaye!");
      }
    } catch (e) {
      if (e.response?.status === 404) toast.error("Sale nahi mili - check voucher/RST");
      else logger.error(e);
    } finally { setLookupLoading(false); }
  };

  // Calculations
  const branType = form.bran_type || "Boiled";
  const standard = branType === "Raw" ? 22 : 25;
  const actual = parseFloat(form.actual_oil_pct) || 0;
  const rate = parseFloat(form.rate) || 0;
  const qty = parseFloat(form.qty_qtl) || 0;
  const diff = actual - standard;
  const premium = standard ? Math.round(rate * diff * qty / standard * 100) / 100 : 0;

  const openNew = () => {
    setEditingId(null);
    setForm({ ...blankForm, kms_year: filters.kms_year || "", season: filters.season || "" });
    setIsFormOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({
      date: item.date || "", voucher_no: item.voucher_no || "", rst_no: item.rst_no || "",
      bran_type: item.bran_type || "Boiled", party_name: item.party_name || "",
      rate: item.rate ? String(item.rate) : "", qty_qtl: item.qty_qtl ? String(item.qty_qtl) : "",
      actual_oil_pct: item.actual_oil_pct ? String(item.actual_oil_pct) : "",
      remark: item.remark || "", sale_ref_id: item.sale_ref_id || "",
      kms_year: item.kms_year || "", season: item.season || "",
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.party_name?.trim()) { toast.error("Party Name daalen"); return; }
    if (!actual) { toast.error("Actual Oil % daalen"); return; }
    try {
      const payload = { ...form, rate, qty_qtl: qty, actual_oil_pct: actual };
      if (editingId) {
        await axios.put(`${API}/oil-premium/${editingId}?username=${user.username}&role=${user.role}`, payload);
        toast.success("Updated!");
      } else {
        await axios.post(`${API}/oil-premium?username=${user.username}&role=${user.role}`, payload);
        toast.success("Oil Premium saved!");
      }
      setIsFormOpen(false); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleDelete = async (id) => {
    if (!await showConfirm("Delete", "Delete karna chahte hain?")) return;
    try { await axios.delete(`${API}/oil-premium/${id}`); toast.success("Deleted!"); fetchData(); } catch (e) { toast.error("Error"); }
  };

  const filtered = items.filter(i => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (i.party_name || "").toLowerCase().includes(q) ||
      (i.voucher_no || "").toLowerCase().includes(q) ||
      (i.rst_no || "").toLowerCase().includes(q);
  });

  const totalPremium = filtered.reduce((s, i) => s + (i.premium_amount || 0), 0);
  const totalQty = filtered.reduce((s, i) => s + (i.qty_qtl || 0), 0);

  const buildExportParams = () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    return params;
  };

  return (
    <div className="space-y-3" data-testid="oil-premium-register">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
          <p className="text-[10px] text-slate-400 mb-1">Total Entries</p>
          <p className="text-lg font-bold text-blue-400">{filtered.length}</p>
        </CardContent></Card>
        <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
          <p className="text-[10px] text-slate-400 mb-1">Total Qty</p>
          <p className="text-lg font-bold text-cyan-400">{totalQty.toFixed(2)} <span className="text-xs text-slate-400">Qtl</span></p>
        </CardContent></Card>
        <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
          <p className="text-[10px] text-slate-400 mb-1">Total Premium</p>
          <p className={`text-lg font-bold ${totalPremium >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{totalPremium.toLocaleString()} <span className="text-xs text-slate-400">Rs</span></p>
        </CardContent></Card>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search party, voucher, RST..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 bg-slate-800 border-slate-600 text-white h-8 text-xs" data-testid="oil-premium-search" />
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-slate-400">{filtered.length} entries | Qty: <span className="text-cyan-400 font-bold">{totalQty.toFixed(2)}</span> | Premium: <span className={`font-bold ${totalPremium >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{totalPremium.toLocaleString()}</span></span>
          <Button onClick={async () => { try { const params = buildExportParams(); const { downloadFile } = await import('../utils/download'); downloadFile(`/api/oil-premium/export/excel?${params}`, 'oil_premium.xlsx'); toast.success("Excel exported!"); } catch(e) { toast.error("Export failed"); }}}
            variant="outline" size="sm" className="border-slate-600 text-green-400 hover:bg-slate-700 h-7 text-[10px]" data-testid="oil-export-excel">
            <Download className="w-3 h-3 mr-1" /> Excel
          </Button>
          <Button onClick={async () => { try { const params = buildExportParams(); const { downloadFile } = await import('../utils/download'); downloadFile(`/api/oil-premium/export/pdf?${params}`, 'oil_premium.pdf'); toast.success("PDF exported!"); } catch(e) { toast.error("Export failed"); }}}
            variant="outline" size="sm" className="border-slate-600 text-red-400 hover:bg-slate-700 h-7 text-[10px]" data-testid="oil-export-pdf">
            <Download className="w-3 h-3 mr-1" /> PDF
          </Button>
          <Button onClick={openNew} size="sm" className="bg-amber-500 hover:bg-amber-600 text-slate-900" data-testid="oil-premium-add">
            <Plus className="w-4 h-4 mr-1" /> New Oil Premium
          </Button>
        </div>
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700 hover:bg-transparent">
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[70px]">Date</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[65px]">Voucher</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[50px]">RST</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[55px]">Type</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[100px]">Party</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[55px] text-right">Rate</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[55px] text-right">Qty(Q)</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[50px] text-right">Std%</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[55px] text-right">Actual%</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[50px] text-right">Diff%</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[80px] text-right">Premium</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={12} className="text-center text-slate-400 py-6">Koi oil premium entry nahi</TableCell></TableRow>
                ) : filtered.map(i => (
                  <TableRow key={i.id} className="border-slate-700 hover:bg-slate-700/30">
                    <TableCell className="text-white text-[10px] px-2 whitespace-nowrap">{fmtDate(i.date)}</TableCell>
                    <TableCell className="text-cyan-400 text-[10px] px-2 font-medium">{i.voucher_no}</TableCell>
                    <TableCell className="text-amber-400 text-[10px] px-2 font-medium">{i.rst_no}</TableCell>
                    <TableCell className="text-[10px] px-2">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${i.bran_type === 'Raw' ? 'bg-orange-900/40 text-orange-300' : 'bg-blue-900/40 text-blue-300'}`}>
                        {i.bran_type}
                      </span>
                    </TableCell>
                    <TableCell className="text-white text-[10px] px-2 font-medium">{i.party_name}</TableCell>
                    <TableCell className="text-slate-300 text-[10px] px-2 text-right">{i.rate}</TableCell>
                    <TableCell className="text-blue-300 text-[10px] px-2 text-right">{(i.qty_qtl || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-slate-400 text-[10px] px-2 text-right">{i.standard_oil_pct}%</TableCell>
                    <TableCell className="text-white text-[10px] px-2 text-right font-medium">{i.actual_oil_pct}%</TableCell>
                    <TableCell className={`text-[10px] px-2 text-right font-bold ${(i.difference_pct || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(i.difference_pct || 0) > 0 ? '+' : ''}{(i.difference_pct || 0).toFixed(2)}%
                    </TableCell>
                    <TableCell className={`text-[10px] px-2 text-right font-bold ${(i.premium_amount || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(i.premium_amount || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="px-1">
                      <div className="flex gap-0.5">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-white" onClick={() => setViewItem(i)} data-testid={`oil-view-${i.id}`}><Eye className="w-3 h-3" /></Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-400" onClick={() => openEdit(i)}><Edit className="w-3 h-3" /></Button>
                        {user.role === "admin" && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => handleDelete(i.id)}><Trash2 className="w-3 h-3" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* View Detail Dialog */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md" data-testid="oil-premium-view">
          <DialogHeader>
            <DialogTitle className="text-amber-400">Oil Premium Detail</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div><span className="text-slate-400 text-xs">Date:</span> <span className="text-white">{fmtDate(viewItem.date)}</span></div>
                {viewItem.voucher_no && <div><span className="text-slate-400 text-xs">Voucher:</span> <span className="text-cyan-400 font-medium">{viewItem.voucher_no}</span></div>}
                {viewItem.rst_no && <div><span className="text-slate-400 text-xs">RST:</span> <span className="text-amber-400">{viewItem.rst_no}</span></div>}
                <div><span className="text-slate-400 text-xs">Type:</span> <span className={viewItem.bran_type === 'Raw' ? 'text-orange-400' : 'text-blue-400'}>{viewItem.bran_type}</span></div>
                <div><span className="text-slate-400 text-xs">Party:</span> <span className="text-white font-medium">{viewItem.party_name}</span></div>
              </div>
              <div className="border-t border-slate-600 pt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                <div><span className="text-slate-400 text-xs">Rate:</span> <span className="text-white">{viewItem.rate}</span></div>
                <div><span className="text-slate-400 text-xs">Qty:</span> <span className="text-blue-300">{(viewItem.qty_qtl || 0).toFixed(2)} Qtl</span></div>
                <div><span className="text-slate-400 text-xs">Standard Oil%:</span> <span className="text-slate-300">{viewItem.standard_oil_pct}%</span></div>
                <div><span className="text-slate-400 text-xs">Actual Oil%:</span> <span className="text-white font-bold">{viewItem.actual_oil_pct}%</span></div>
                <div><span className="text-slate-400 text-xs">Difference:</span> <span className={`font-bold ${(viewItem.difference_pct || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(viewItem.difference_pct || 0) > 0 ? '+' : ''}{(viewItem.difference_pct || 0).toFixed(2)}%</span></div>
              </div>
              <div className="border-t border-slate-600 pt-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300 font-medium">Premium Amount</span>
                  <span className={`text-xl font-bold ${(viewItem.premium_amount || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    Rs. {(viewItem.premium_amount || 0).toLocaleString()}
                  </span>
                </div>
                <p className="text-[9px] text-slate-500 mt-1">
                  = {viewItem.rate} x {(viewItem.difference_pct || 0).toFixed(2)}% x {(viewItem.qty_qtl || 0).toFixed(2)} / {viewItem.standard_oil_pct}%
                </p>
              </div>
              {viewItem.remark && <div className="border-t border-slate-600 pt-2"><span className="text-slate-400 text-xs">Remark:</span> <span className="text-slate-300">{viewItem.remark}</span></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-xl max-h-[90vh] overflow-y-auto" data-testid="oil-premium-form">
          <DialogHeader>
            <DialogTitle className="text-amber-400">{editingId ? "Edit" : "New"} Oil Premium</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Lookup Section */}
            <div className="bg-slate-700/40 rounded p-3 space-y-2">
              <p className="text-[10px] text-amber-400 font-medium">Sale Lookup - Voucher ya RST se auto-fill</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] text-slate-400">Voucher No {lookupLoading && <span className="text-amber-400">(loading...)</span>}</Label>
                  <Input value={form.voucher_no} onChange={e => setForm(p => ({ ...p, voucher_no: e.target.value }))}
                    onBlur={() => { if (form.voucher_no && !form.sale_ref_id) lookupSale("voucher_no", form.voucher_no); }}
                    placeholder="Voucher No daalen" className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="oil-voucher-no" />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400">RST No</Label>
                  <Input value={form.rst_no} onChange={e => setForm(p => ({ ...p, rst_no: e.target.value }))}
                    onBlur={() => { if (form.rst_no && !form.sale_ref_id) lookupSale("rst_no", form.rst_no); }}
                    placeholder="RST No daalen" className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="oil-rst-no" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-[10px] text-slate-400">Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="oil-date" />
              </div>
              <div>
                <Label className="text-[10px] text-slate-400">Bran Type</Label>
                <Select value={form.bran_type} onValueChange={v => setForm(p => ({ ...p, bran_type: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="oil-bran-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Raw">Raw (Standard 22%)</SelectItem>
                    <SelectItem value="Boiled">Boiled / Usna (Standard 25%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-slate-400">Party Name *</Label>
                <Input value={form.party_name} onChange={e => setForm(p => ({ ...p, party_name: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-xs" required data-testid="oil-party" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-[10px] text-slate-400">Rate (per Qtl)</Label>
                <Input type="number" step="0.01" value={form.rate}
                  onChange={e => setForm(p => ({ ...p, rate: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="oil-rate" />
              </div>
              <div>
                <Label className="text-[10px] text-slate-400">Qty (Qtl)</Label>
                <Input type="number" step="0.01" value={form.qty_qtl}
                  onChange={e => setForm(p => ({ ...p, qty_qtl: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="oil-qty" />
              </div>
              <div>
                <Label className="text-[10px] text-slate-400">Actual Oil % *</Label>
                <Input type="number" step="0.01" value={form.actual_oil_pct}
                  onChange={e => setForm(p => ({ ...p, actual_oil_pct: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="oil-actual-pct" />
              </div>
            </div>

            {/* Premium Calculation Preview */}
            {actual > 0 && (
              <div className={`rounded p-3 text-xs space-y-1.5 ${premium >= 0 ? 'bg-emerald-900/20 border border-emerald-700/50' : 'bg-red-900/20 border border-red-700/50'}`}>
                <div className="flex justify-between"><span className="text-slate-400">Standard Oil%</span><span className="text-white">{standard}% ({branType})</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Actual Oil%</span><span className="text-white font-bold">{actual}%</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Difference</span>
                  <span className={`font-bold ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{diff > 0 ? '+' : ''}{diff.toFixed(2)}%</span>
                </div>
                <div className="border-t border-slate-600 pt-1.5 flex justify-between">
                  <span className="text-slate-300 font-medium">{premium >= 0 ? 'Premium' : 'Deduction'}</span>
                  <span className={`text-base font-bold ${premium >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    Rs. {premium.toLocaleString()}
                  </span>
                </div>
                <p className="text-[9px] text-slate-500">= {rate} x {diff.toFixed(2)} x {qty.toFixed(2)} / {standard}</p>
              </div>
            )}

            <div>
              <Label className="text-[10px] text-slate-400">Remark</Label>
              <Input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))}
                placeholder="Optional" className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="oil-remark" />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-slate-900 flex-1" data-testid="oil-premium-submit">
                {editingId ? "Update" : "Save Oil Premium"}
              </Button>
              <Button type="button" variant="outline" className="border-slate-600 text-slate-300" onClick={() => setIsFormOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
