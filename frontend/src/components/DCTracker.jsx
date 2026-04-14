import React, { useState, useEffect, useCallback, useMemo } from "react";
import { fmtDate } from "@/utils/date";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, RefreshCw, Download, FileText, Truck, ClipboardList, ChevronDown, ChevronUp, IndianRupee, Package, Edit, Clock, History, Search } from "lucide-react";
import { useConfirm } from "./ConfirmProvider";
const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

const CURRENT_KMS = (() => { const n = new Date(), y = n.getFullYear(); return n.getMonth() >= 3 ? `${y}-${y+1}` : `${y-1}-${y}`; })();

// ===== DC ENTRIES SUB-TAB =====
export const DCEntries = ({ filters, user }) => {
  const showConfirm = useConfirm();
  const [dcs, setDcs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedDC, setExpandedDC] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [riceStockAvail, setRiceStockAvail] = useState(null);
  const [riceStockByType, setRiceStockByType] = useState({ parboiled: null, raw: null });
  const [form, setForm] = useState({ dc_number: "", date: new Date().toISOString().split('T')[0], quantity_qntl: "", rice_type: "parboiled", godown_name: "", deadline: "", notes: "", kms_year: CURRENT_KMS, season: "Kharif" });
  const [delForm, setDelForm] = useState({ dc_id: "", date: new Date().toISOString().split('T')[0], quantity_qntl: "", vehicle_no: "", driver_name: "", slip_no: "", godown_name: "", invoice_no: "", rst_no: "", eway_bill_no: "", bags_used: "", cash_paid: "", diesel_paid: "", cgst_amount: "", sgst_amount: "", notes: "", kms_year: CURRENT_KMS, season: "Kharif" });
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      const [dcRes, sumRes] = await Promise.all([axios.get(`${API}/dc-entries?${p}`), axios.get(`${API}/dc-summary?${p}`)]);
      setDcs(dcRes.data); setSummary(sumRes.data);
      try { const stockRes = await axios.get(`${API}/rice-stock?${p}`); setRiceStockAvail(stockRes.data.available_qntl); setRiceStockByType({ parboiled: stockRes.data.parboiled_available_qntl, raw: stockRes.data.raw_available_qntl }); } catch (e) { setRiceStockAvail(null); setRiceStockByType({ parboiled: null, raw: null }); }
    } catch (e) { toast.error("DC data load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDeliveries = async (dcId) => {
    try { const res = await axios.get(`${API}/dc-deliveries?dc_id=${dcId}`); setDeliveries(res.data); } catch (e) { toast.error("Deliveries load nahi hui"); }
  };

  const handleExpandDC = (dcId) => {
    if (expandedDC === dcId) { setExpandedDC(null); setDeliveries([]); }
    else { setExpandedDC(dcId); fetchDeliveries(dcId); }
  };

  const handleAddDC = async (e) => {
    e.preventDefault();
    if (!form.dc_number || !form.quantity_qntl) { toast.error("DC No aur Quantity zaruri hai"); return; }
    try {
      await axios.post(`${API}/dc-entries?username=${user.username}`, { ...form, quantity_qntl: parseFloat(form.quantity_qntl) });
      toast.success("DC add ho gaya!"); setShowForm(false);
      setForm({ dc_number: "", date: new Date().toISOString().split('T')[0], quantity_qntl: "", rice_type: "parboiled", godown_name: "", deadline: "", notes: "", kms_year: filters.kms_year || CURRENT_KMS, season: filters.season || "Kharif" });
      fetchData();
    } catch (e) { toast.error("Error: " + (e.response?.data?.detail || e.message)); }
  };

  const handleAddDelivery = async (e) => {
    e.preventDefault();
    if (!delForm.quantity_qntl) { toast.error("Quantity zaruri hai"); return; }
    try {
      await axios.post(`${API}/dc-deliveries?username=${user.username}`, {
        ...delForm,
        quantity_qntl: parseFloat(delForm.quantity_qntl) || 0,
        bags_used: parseInt(delForm.bags_used) || 0,
        cash_paid: parseFloat(delForm.cash_paid) || 0,
        diesel_paid: parseFloat(delForm.diesel_paid) || 0,
        cgst_amount: parseFloat(delForm.cgst_amount) || 0,
        sgst_amount: parseFloat(delForm.sgst_amount) || 0,
      });
      toast.success("Delivery add hui!"); setShowDeliveryForm(false);
      setDelForm({ dc_id: "", date: new Date().toISOString().split('T')[0], quantity_qntl: "", vehicle_no: "", driver_name: "", slip_no: "", godown_name: "", invoice_no: "", rst_no: "", eway_bill_no: "", bags_used: "", cash_paid: "", diesel_paid: "", cgst_amount: "", sgst_amount: "", notes: "", kms_year: filters.kms_year || CURRENT_KMS, season: filters.season || "Kharif" });
      fetchDeliveries(expandedDC); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || e.message); }
  };

  const handleDeleteDC = async (id) => { if (!await showConfirm("Delete DC", "DC delete karein?")) return; try { await axios.delete(`${API}/dc-entries/${id}`); toast.success("DC deleted"); fetchData(); } catch (e) { toast.error("Delete nahi hua"); } };
  const handleDeleteDelivery = async (id) => { if (!await showConfirm("Delete Delivery", "Delivery delete karein?")) return; try { await axios.delete(`${API}/dc-deliveries/${id}`); toast.success("Deleted"); fetchDeliveries(expandedDC); fetchData(); } catch (e) { toast.error("Delete nahi hua"); } };
  const exportData = async (format) => {
    try {
      const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season);
      const { downloadFile } = await import('../utils/download');
      downloadFile(`/api/dc-entries/${format}?${p}`, `dc_register.${format === 'excel' ? 'xlsx' : 'pdf'}`);
    } catch (e) { toast.error("Export failed"); }
  };

  const statusBadge = (s) => {
    const cls = s === 'completed' ? 'bg-green-500/20 text-green-400' : s === 'partial' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400';
    return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>{s === 'completed' ? 'Done' : s === 'partial' ? 'Partial' : 'Pending'}</span>;
  };

  // Filter DCs by search query (DC number or delivery invoice number)
  const filteredDCs = searchQuery.trim()
    ? dcs.filter(dc => {
        const q = searchQuery.trim().toLowerCase();
        if ((dc.dc_number || "").toLowerCase().includes(q)) return true;
        // Also match if any delivery of this DC has matching invoice_no
        if ((dc.deliveries || []).some(d => (d.invoice_no || "").toLowerCase().includes(q))) return true;
        return false;
      })
    : dcs;

  return (
    <div className="space-y-3" data-testid="dc-entries-tab">
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
            <p className="text-[10px] text-slate-400">Total DC</p><p className="text-xl font-bold text-blue-400">{summary.total_dc}</p>
          </CardContent></Card>
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
            <p className="text-[10px] text-slate-400">Allotted (Q)</p><p className="text-xl font-bold text-white">{summary.total_allotted_qntl}</p>
          </CardContent></Card>
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
            <p className="text-[10px] text-slate-400">Delivered (Q)</p><p className="text-xl font-bold text-green-400">{summary.total_delivered_qntl}</p>
          </CardContent></Card>
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
            <p className="text-[10px] text-slate-400">Pending (Q)</p><p className="text-xl font-bold text-red-400">{summary.total_pending_qntl}</p>
          </CardContent></Card>
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
            <p className="text-[10px] text-slate-400">Status</p>
            <p className="text-[10px] mt-1"><span className="text-green-400">{summary.completed} Done</span> <span className="text-amber-400 ml-1">{summary.partial} Partial</span> <span className="text-red-400 ml-1">{summary.pending} Pending</span></p>
          </CardContent></Card>
        </div>
      )}
      <div className="flex gap-2 flex-wrap items-center">
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
        <Button onClick={() => setShowForm(true)} className="bg-amber-500 hover:bg-amber-600 text-slate-900" size="sm" data-testid="dc-add-btn"><Plus className="w-4 h-4 mr-1" /> New DC</Button>
        <Button onClick={() => exportData('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400 hover:bg-slate-700" data-testid="dc-export-excel"><Download className="w-4 h-4 mr-1" /> Excel</Button>
        <Button onClick={() => exportData('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400 hover:bg-slate-700" data-testid="dc-export-pdf"><FileText className="w-4 h-4 mr-1" /> PDF</Button>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="DC No / Invoice No search..."
            className="bg-slate-700 border-slate-600 text-white h-8 text-sm pl-8 w-56"
            data-testid="dc-search-input"
          />
        </div>
      </div>
      <Card className="bg-slate-800 border-slate-700"><CardContent className="p-0"><div className="overflow-x-auto">
        <Table className="w-full table-auto"><TableHeader><TableRow className="border-slate-700 hover:bg-transparent">
          <TableHead className="text-slate-300 text-xs w-8"></TableHead>
          <TableHead className="text-slate-300 text-xs">DC No</TableHead>
          <TableHead className="text-slate-300 text-xs">Date</TableHead>
          <TableHead className="text-slate-300 text-xs">Type</TableHead>
          <TableHead className="text-slate-300 text-xs text-right">Allotted(Q)</TableHead>
          <TableHead className="text-slate-300 text-xs text-right">Delivered(Q)</TableHead>
          <TableHead className="text-slate-300 text-xs text-right">Pending(Q)</TableHead>
          <TableHead className="text-slate-300 text-xs">Status</TableHead>
          <TableHead className="text-slate-300 text-xs">Deadline</TableHead>
          <TableHead className="text-slate-300 text-xs">Godown</TableHead>
          <TableHead className="text-slate-300 text-xs w-8"></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={11} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
          : filteredDCs.length === 0 ? <TableRow><TableCell colSpan={11} className="text-center text-slate-400 py-8">{searchQuery ? "Koi result nahi mila." : 'Koi DC nahi hai. "New DC" click karein.'}</TableCell></TableRow>
          : filteredDCs.map(dc => (<React.Fragment key={dc.id}>
            <TableRow key={dc.id} className="border-slate-700 cursor-pointer hover:bg-slate-750" onClick={() => handleExpandDC(dc.id)} data-testid={`dc-row-${dc.id}`}>
              <TableCell className="w-8 px-2">{expandedDC === dc.id ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}</TableCell>
              <TableCell className="text-amber-400 font-semibold text-sm">{dc.dc_number}</TableCell>
              <TableCell className="text-slate-200 text-xs">{fmtDate(dc.date)}</TableCell>
              <TableCell className="text-xs"><span className={`px-2 py-0.5 rounded text-xs font-bold ${(dc.rice_type||'')==='parboiled' ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40' : 'bg-sky-500/25 text-sky-300 border border-sky-500/40'}`}>{(dc.rice_type||'')==='parboiled' ? 'Usna' : 'Arwa'}</span></TableCell>
              <TableCell className="text-white text-sm text-right font-medium">{dc.quantity_qntl} Q</TableCell>
              <TableCell className="text-green-400 text-sm text-right font-medium">{dc.delivered_qntl} Q</TableCell>
              <TableCell className="text-red-400 text-sm text-right font-medium">{dc.pending_qntl} Q</TableCell>
              <TableCell>{statusBadge(dc.status)}</TableCell>
              <TableCell className="text-slate-300 text-xs">{dc.deadline || '-'}</TableCell>
              <TableCell className="text-slate-400 text-xs">{dc.godown_name || '-'}</TableCell>
              <TableCell className="w-8 px-2">{user.role === 'admin' && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={(e) => { e.stopPropagation(); handleDeleteDC(dc.id); }}><Trash2 className="w-3 h-3" /></Button>}</TableCell>
            </TableRow>
            {expandedDC === dc.id && (
              <TableRow key={`${dc.id}-del`} className="border-slate-700 bg-slate-900/50">
                <TableCell colSpan={11} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-amber-400 font-medium">Deliveries for {dc.dc_number}</p>
                    <Button onClick={() => { setDelForm(f => ({ ...f, dc_id: dc.id, kms_year: dc.kms_year, season: dc.season, godown_name: dc.godown_name, _rice_type: dc.rice_type || 'parboiled' })); setShowDeliveryForm(true); }} size="sm" className="bg-green-600 hover:bg-green-700 text-white h-6 text-xs" data-testid="dc-add-delivery-btn"><Plus className="w-3 h-3 mr-1" /> Add Delivery</Button>
                  </div>
                  {deliveries.length === 0 ? <p className="text-xs text-slate-500 py-2">No deliveries yet</p> : (
                    <Table className="w-full table-auto"><TableHeader><TableRow className="border-slate-600 hover:bg-transparent">
                      {['Date','Qty (Q)','Invoice','RST','Vehicle','Bags','Cash','Diesel','Godown',''].map(h =>
                        <TableHead key={h} className="text-slate-400 text-[10px] py-1">{h}</TableHead>)}
                    </TableRow></TableHeader>
                    <TableBody>{deliveries.map(d => (
                      <TableRow key={d.id} className="border-slate-700" data-testid={`delivery-row-${d.id}`}>
                        <TableCell className="text-slate-200 text-[11px] py-1">{fmtDate(d.date)}</TableCell>
                        <TableCell className="text-green-400 text-[11px] py-1 font-semibold">{d.quantity_qntl} Q</TableCell>
                        <TableCell className="text-slate-300 text-[11px] py-1">{d.invoice_no || '-'}</TableCell>
                        <TableCell className="text-slate-300 text-[11px] py-1">{d.rst_no || '-'}</TableCell>
                        <TableCell className="text-slate-300 text-[11px] py-1">{d.vehicle_no}</TableCell>
                        <TableCell className="text-amber-400 text-[11px] py-1">{d.bags_used || '-'}</TableCell>
                        <TableCell className="text-red-400 text-[11px] py-1">{d.cash_paid ? `₹${d.cash_paid}` : '-'}</TableCell>
                        <TableCell className="text-orange-400 text-[11px] py-1">{d.diesel_paid ? `₹${d.diesel_paid}` : '-'}</TableCell>
                        <TableCell className="text-slate-400 text-[11px] py-1">{d.godown_name}</TableCell>
                        <TableCell className="py-1 flex gap-1">
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-blue-400" onClick={() => window.open(`${API}/dc-deliveries/invoice/${d.id}`, '_blank')} title="Print Invoice"><FileText className="w-2.5 h-2.5" /></Button>
                          {user.role === 'admin' && <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400" onClick={() => handleDeleteDelivery(d.id)}><Trash2 className="w-2.5 h-2.5" /></Button>}
                        </TableCell>
                      </TableRow>
                    ))}</TableBody></Table>
                  )}
                </TableCell>
              </TableRow>
            )}
          </React.Fragment>))}
        </TableBody></Table>
      </div></CardContent></Card>

      {/* Add DC Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md" data-testid="dc-form-dialog">
          <DialogHeader><DialogTitle className="text-amber-400">New DC / नया DC</DialogTitle></DialogHeader>
          <form onSubmit={handleAddDC} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">DC Number</Label>
                <Input value={form.dc_number} onChange={e => setForm(p=>({...p,dc_number:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="dc-form-number" /></div>
              <div><Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p=>({...p,date:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="dc-form-date" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Quantity (QNTL) {riceStockByType[form.rice_type] !== null && <span className={`font-bold ${(riceStockByType[form.rice_type] - (parseFloat(form.quantity_qntl) || 0)) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>({form.rice_type === 'parboiled' ? 'Parboiled' : 'Raw'} Stock: {Math.round((riceStockByType[form.rice_type] - (parseFloat(form.quantity_qntl) || 0)) * 100) / 100} Q)</span>}</Label>
                <Input type="number" step="0.01" value={form.quantity_qntl} onChange={e => setForm(p=>({...p,quantity_qntl:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="dc-form-qty" /></div>
              <div><Label className="text-xs text-slate-400">Rice Type</Label>
                <Select value={form.rice_type} onValueChange={v => setForm(p=>({...p,rice_type:v}))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="dc-form-type"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="parboiled">Parboiled</SelectItem><SelectItem value="raw">Raw</SelectItem></SelectContent>
                </Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Godown</Label>
                <Input value={form.godown_name} onChange={e => setForm(p=>({...p,godown_name:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="dc-form-godown" /></div>
              <div><Label className="text-xs text-slate-400">Deadline</Label>
                <Input type="date" value={form.deadline} onChange={e => setForm(p=>({...p,deadline:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="dc-form-deadline" /></div>
            </div>
            <div><Label className="text-xs text-slate-400">Notes</Label>
              <Input value={form.notes} onChange={e => setForm(p=>({...p,notes:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="dc-form-notes" /></div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-slate-900 flex-1" data-testid="dc-form-submit">Save DC</Button>
              <Button type="button" variant="outline" className="border-slate-600 text-slate-300" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Delivery Dialog */}
      <Dialog open={showDeliveryForm} onOpenChange={setShowDeliveryForm}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto" data-testid="delivery-form-dialog">
          <DialogHeader><DialogTitle className="text-green-400">Add Delivery / डिलीवरी जोड़ें</DialogTitle></DialogHeader>
          <form onSubmit={handleAddDelivery} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={delForm.date} onChange={e => setDelForm(p=>({...p,date:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="delivery-form-date" /></div>
              <div><Label className="text-xs text-slate-400">Quantity (QNTL) {riceStockByType[delForm._rice_type || 'parboiled'] !== null && <span className={`font-bold ${(riceStockByType[delForm._rice_type || 'parboiled'] - (parseFloat(delForm.quantity_qntl) || 0)) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>({(delForm._rice_type || 'parboiled') === 'parboiled' ? 'Parboiled' : 'Raw'} Stock: {Math.round((riceStockByType[delForm._rice_type || 'parboiled'] - (parseFloat(delForm.quantity_qntl) || 0)) * 100) / 100} Q)</span>}</Label>
                <Input type="number" step="0.01" value={delForm.quantity_qntl} onChange={e => setDelForm(p=>({...p,quantity_qntl:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="delivery-form-qty" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Invoice Number</Label>
                <Input value={delForm.invoice_no} onChange={e => setDelForm(p=>({...p,invoice_no:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="delivery-form-invoice" /></div>
              <div><Label className="text-xs text-slate-400">RST Number</Label>
                <Input value={delForm.rst_no} onChange={e => setDelForm(p=>({...p,rst_no:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="delivery-form-rst" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">E-Way Bill Number</Label>
                <Input value={delForm.eway_bill_no} onChange={e => setDelForm(p=>({...p,eway_bill_no:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="delivery-form-eway" /></div>
              <div><Label className="text-xs text-slate-400">Vehicle No</Label>
                <Input value={delForm.vehicle_no} onChange={e => setDelForm(p=>({...p,vehicle_no:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="delivery-form-vehicle" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Driver Name</Label>
                <Input value={delForm.driver_name} onChange={e => setDelForm(p=>({...p,driver_name:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="delivery-form-driver" /></div>
              <div><Label className="text-xs text-slate-400">Slip No</Label>
                <Input value={delForm.slip_no} onChange={e => setDelForm(p=>({...p,slip_no:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="delivery-form-slip" /></div>
              <div><Label className="text-xs text-slate-400">Godown</Label>
                <Input value={delForm.godown_name} onChange={e => setDelForm(p=>({...p,godown_name:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs text-amber-400 font-semibold">Beg (Govt Bags)</Label>
                <Input type="number" value={delForm.bags_used} onChange={e => setDelForm(p=>({...p,bags_used:e.target.value}))} placeholder="0" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="delivery-form-bags" />
                <p className="text-[9px] text-amber-500 mt-0.5">Govt bags se minus hoga</p></div>
              <div><Label className="text-xs text-red-400 font-semibold">Cash Paid (Rs.)</Label>
                <Input type="number" step="0.01" value={delForm.cash_paid} onChange={e => setDelForm(p=>({...p,cash_paid:e.target.value}))} placeholder="0" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="delivery-form-cash" />
                <p className="text-[9px] text-red-500 mt-0.5">Cash Book auto entry</p></div>
              <div><Label className="text-xs text-orange-400 font-semibold">Diesel Paid (Rs.)</Label>
                <Input type="number" step="0.01" value={delForm.diesel_paid} onChange={e => setDelForm(p=>({...p,diesel_paid:e.target.value}))} placeholder="0" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="delivery-form-diesel" />
                <p className="text-[9px] text-orange-500 mt-0.5">Truck payment auto entry</p></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-green-400 font-semibold">CGST (Rs.)</Label>
                <Input type="number" step="0.01" value={delForm.cgst_amount} onChange={e => setDelForm(p=>({...p,cgst_amount:e.target.value}))} placeholder="0" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="delivery-form-cgst" /></div>
              <div><Label className="text-xs text-green-400 font-semibold">SGST (Rs.)</Label>
                <Input type="number" step="0.01" value={delForm.sgst_amount} onChange={e => setDelForm(p=>({...p,sgst_amount:e.target.value}))} placeholder="0" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="delivery-form-sgst" /></div>
            </div>
            <div><Label className="text-xs text-slate-400">Notes</Label>
              <Input value={delForm.notes} onChange={e => setDelForm(p=>({...p,notes:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white flex-1" data-testid="delivery-form-submit">Save Delivery</Button>
              <Button type="button" variant="outline" className="border-slate-600 text-slate-300" onClick={() => setShowDeliveryForm(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ===== MSP PAYMENTS SUB-TAB =====
export const MSPPayments = ({ filters, user, dcList }) => {
  const showConfirm = useConfirm();
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], dc_id: "", quantity_qntl: "", rate_per_qntl: "", amount: "", payment_mode: "", reference: "", bank_name: "", notes: "", kms_year: CURRENT_KMS, season: "Kharif" });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season);
      const [payRes, sumRes, bankRes] = await Promise.all([axios.get(`${API}/msp-payments?${p}`), axios.get(`${API}/msp-payments/summary?${p}`), axios.get(`${API}/bank-accounts`)]);
      setPayments(payRes.data); setSummary(sumRes.data); setBankAccounts(bankRes.data);
    } catch (e) { toast.error("MSP data load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { toast.error("Amount 0 se zyada hona chahiye"); return; }
    try {
      await axios.post(`${API}/msp-payments?username=${user.username}`, { ...form, amount: amt, quantity_qntl: parseFloat(form.quantity_qntl) || 0, rate_per_qntl: parseFloat(form.rate_per_qntl) || 0 });
      toast.success("MSP Payment add ho gayi!"); setShowForm(false); fetchData();
      setForm({ date: new Date().toISOString().split('T')[0], dc_id: "", quantity_qntl: "", rate_per_qntl: "", amount: "", payment_mode: "", reference: "", bank_name: "", notes: "", kms_year: filters.kms_year || CURRENT_KMS, season: filters.season || "Kharif" });
    } catch (e) { toast.error(e.response?.data?.detail || e.message); }
  };

  const handleDelete = async (id) => { if (!await showConfirm("Delete Payment", "Payment delete karein?")) return; try { await axios.delete(`${API}/msp-payments/${id}`); toast.success("Deleted!"); fetchData(); } catch (e) { toast.error("Delete nahi hua"); } };
  const exportData = async (format) => {
    try {
      const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season);
      const { downloadFile } = await import('../utils/download');
      downloadFile(`/api/msp-payments/${format}?${p}`, `msp_payments.${format === 'excel' ? 'xlsx' : 'pdf'}`);
    } catch (e) { toast.error("Export failed"); }
  };

  // Auto-calculate amount
  useEffect(() => {
    const q = parseFloat(form.quantity_qntl) || 0;
    const r = parseFloat(form.rate_per_qntl) || 0;
    if (q > 0 && r > 0) setForm(p => ({ ...p, amount: (q * r).toFixed(2) }));
  }, [form.quantity_qntl, form.rate_per_qntl]);

  return (
    <div className="space-y-3" data-testid="msp-payments-tab">
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Card className="bg-gradient-to-br from-green-900/40 to-slate-800 border-green-800/30"><CardContent className="p-3">
            <p className="text-[10px] text-green-400">Total Received</p>
            <p className="text-xl font-bold text-green-400">₹{summary.total_paid_amount.toLocaleString('en-IN')}</p>
            <p className="text-[10px] text-slate-400">{summary.total_payments} payments</p>
          </CardContent></Card>
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
            <p className="text-[10px] text-slate-400">Paid Qty</p><p className="text-xl font-bold text-white">{summary.total_paid_qty} Q</p>
          </CardContent></Card>
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
            <p className="text-[10px] text-slate-400">Avg Rate</p><p className="text-xl font-bold text-blue-400">₹{summary.avg_rate}/Q</p>
          </CardContent></Card>
          <Card className="bg-gradient-to-br from-red-900/30 to-slate-800 border-red-800/30"><CardContent className="p-3">
            <p className="text-[10px] text-red-400">Pending Payment</p><p className="text-xl font-bold text-red-400">{summary.pending_payment_qty} Q</p>
            <p className="text-[10px] text-slate-400">of {summary.total_delivered_qntl}Q delivered</p>
          </CardContent></Card>
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
        <Button onClick={() => setShowForm(true)} className="bg-amber-500 hover:bg-amber-600 text-slate-900" size="sm" data-testid="msp-add-btn"><Plus className="w-4 h-4 mr-1" /> New Payment</Button>
        <Button onClick={() => exportData('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400 hover:bg-slate-700" data-testid="msp-export-excel"><Download className="w-4 h-4 mr-1" /> Excel</Button>
        <Button onClick={() => exportData('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400 hover:bg-slate-700" data-testid="msp-export-pdf"><FileText className="w-4 h-4 mr-1" /> PDF</Button>
      </div>
      <Card className="bg-slate-800 border-slate-700"><CardContent className="p-0"><div className="overflow-x-auto">
        <Table><TableHeader><TableRow className="border-slate-700 hover:bg-transparent">
          {['Date','DC No','Qty (Q)','Rate (₹/Q)','Amount (₹)','Mode','Reference','Bank',''].map(h =>
            <TableHead key={h} className={`text-slate-300 text-xs ${['Qty (Q)','Rate (₹/Q)','Amount (₹)'].includes(h) ? 'text-right' : ''}`}>{h}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
          : payments.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8">Koi payment nahi hai.</TableCell></TableRow>
          : payments.map(p => (
            <TableRow key={p.id} className="border-slate-700" data-testid={`msp-row-${p.id}`}>
              <TableCell className="text-white text-xs">{fmtDate(p.date)}</TableCell>
              <TableCell className="text-amber-400 text-xs">{p.dc_number || '-'}</TableCell>
              <TableCell className="text-white text-xs text-right">{p.quantity_qntl}</TableCell>
              <TableCell className="text-slate-300 text-xs text-right">{p.rate_per_qntl}</TableCell>
              <TableCell className="text-green-400 text-xs text-right font-medium">₹{p.amount.toLocaleString('en-IN')}</TableCell>
              <TableCell className="text-slate-300 text-xs">{p.payment_mode}</TableCell>
              <TableCell className="text-slate-400 text-xs">{p.reference}</TableCell>
              <TableCell className="text-slate-400 text-xs">{p.bank_name}</TableCell>
              <TableCell>{user.role === 'admin' && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => handleDelete(p.id)}><Trash2 className="w-3 h-3" /></Button>}</TableCell>
            </TableRow>
          ))}
        </TableBody></Table>
      </div></CardContent></Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md" data-testid="msp-form-dialog">
          <DialogHeader><DialogTitle className="text-green-400">New MSP Payment</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p=>({...p,date:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="msp-form-date" /></div>
              <div><Label className="text-xs text-slate-400">DC (Optional)</Label>
                <Select value={form.dc_id || "_none"} onValueChange={v => {
                  const dcId = v === "_none" ? "" : v;
                  setForm(p => ({...p, dc_id: dcId}));
                  if (dcId) {
                    // Auto-fill quantity from DC deliveries
                    axios.get(`${API}/dc-entries?kms_year=${filters.kms_year || CURRENT_KMS}&season=${filters.season || "Kharif"}`).then(res => {
                      const dc = (res.data || []).find(d => d.id === dcId);
                      if (dc && dc.delivered_qntl) {
                        setForm(p => ({...p, quantity_qntl: String(dc.delivered_qntl)}));
                      }
                    }).catch(() => {});
                  }
                }}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="msp-form-dc"><SelectValue placeholder="Select DC" /></SelectTrigger>
                  <SelectContent><SelectItem value="_none">-- None --</SelectItem>
                    {dcList.map(d => <SelectItem key={d.id} value={d.id}>{d.dc_number}</SelectItem>)}
                  </SelectContent>
                </Select></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs text-slate-400">Qty (Q)</Label>
                <Input type="number" step="0.01" value={form.quantity_qntl} onChange={e => setForm(p=>({...p,quantity_qntl:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="msp-form-qty" /></div>
              <div><Label className="text-xs text-slate-400">Rate (₹/Q)</Label>
                <Input type="number" step="0.01" value={form.rate_per_qntl} onChange={e => setForm(p=>({...p,rate_per_qntl:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="msp-form-rate" /></div>
              <div><Label className="text-xs text-slate-400">Amount (₹)</Label>
                <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(p=>({...p,amount:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="msp-form-amount" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Payment Mode</Label>
                <Select value={form.payment_mode || "_none"} onValueChange={v => setForm(p=>({...p,payment_mode:v==="_none"?"":v}))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="msp-form-mode"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="_none">-- Select --</SelectItem>
                    {["NEFT","RTGS","Cheque","DD"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div><Label className="text-xs text-slate-400">Reference (UTR/Cheque)</Label>
                <Input value={form.reference} onChange={e => setForm(p=>({...p,reference:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="msp-form-ref" /></div>
            </div>
            <div><Label className="text-xs text-slate-400">Bank Name</Label>
              <Select value={form.bank_name || "_none"} onValueChange={v => setForm(p=>({...p,bank_name:v==="_none"?"":v}))}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="msp-form-bank"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="_none">-- Select Bank --</SelectItem>
                  {bankAccounts.map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white flex-1" data-testid="msp-form-submit">Save Payment</Button>
              <Button type="button" variant="outline" className="border-slate-600 text-slate-300" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ===== GUNNY BAGS SUB-TAB =====
export const GunnyBags = ({ filters, user }) => {
  const showConfirm = useConfirm();
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const defaultForm = { date: new Date().toISOString().split('T')[0], bag_type: "old", txn_type: "in", quantity: "", source: "", party_name: "", rate: "", invoice_no: "", truck_no: "", rst_no: "", gst_type: "none", cgst_percent: "", sgst_percent: "", gst_percent: "", advance: "", reference: "", notes: "", kms_year: CURRENT_KMS, season: "Kharif", used_for_rice: "", used_for_bp: "", damaged: "", returned: "" };
  const [form, setForm] = useState(defaultForm);
  const [bagFilter, setBagFilter] = useState("all");
  const [txnFilter, setTxnFilter] = useState("all");

  // Compute realtime stock per bag type from entries
  const bagStock = useMemo(() => {
    const stock = { old: 0, new: 0, bran_plastic: 0, broken_plastic: 0 };
    entries.forEach(e => {
      const bt = e.bag_type || "old";
      if (stock[bt] !== undefined) {
        if (e.txn_type === "in") stock[bt] += (e.quantity || 0);
        else stock[bt] -= (e.quantity || 0);
      }
    });
    return stock;
  }, [entries]);

  const bagTypeLabel = { old: "Old (Market)", new: "New (Govt)", bran_plastic: "Bran P.Pkt", broken_plastic: "Broken P.Pkt" };
  const selectedBagStock = bagStock[form.bag_type] || 0;
  const enteredQty = parseInt(form.quantity) || 0;
  const previewStock = form.txn_type === "in" ? selectedBagStock + enteredQty : selectedBagStock - enteredQty;
  const stockLabel = enteredQty > 0 
    ? `Stock: ${selectedBagStock} → ${previewStock}` 
    : `Stock: ${selectedBagStock}`;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season);
      const [entRes, sumRes] = await Promise.all([axios.get(`${API}/gunny-bags?${p}`), axios.get(`${API}/gunny-bags/summary?${p}`)]);
      setEntries(entRes.data); setSummary(sumRes.data);
    } catch (e) { toast.error("Gunny bag data load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const openNewForm = () => {
    setEditingId(null);
    setForm({ ...defaultForm, kms_year: filters.kms_year || CURRENT_KMS, season: filters.season || "Kharif" });
    setShowForm(true);
  };

  const openEditForm = (entry) => {
    setEditingId(entry.id);
    setForm({
      date: entry.date || '', bag_type: entry.bag_type || 'old', txn_type: entry.txn_type || 'in',
      quantity: entry.quantity?.toString() || '', source: entry.source || '', party_name: entry.party_name || entry.source || '',
      rate: entry.rate?.toString() || '', invoice_no: entry.invoice_no || '', truck_no: entry.truck_no || '',
      rst_no: entry.rst_no || '', gst_type: entry.gst_type || 'none',
      cgst_percent: entry.cgst_percent?.toString() || '', sgst_percent: entry.sgst_percent?.toString() || '',
      gst_percent: entry.gst_percent?.toString() || '',
      advance: entry.advance?.toString() || '', reference: entry.reference || '', notes: entry.notes || '',
      kms_year: entry.kms_year || '', season: entry.season || '',
      used_for_rice: entry.used_for_rice?.toString() || '', used_for_bp: entry.used_for_bp || '', damaged: entry.damaged?.toString() || '', returned: entry.returned?.toString() || ''
    });
    setShowForm(true);
  };

  // Calculate GST and total
  const qty = parseInt(form.quantity) || 0;
  const rate = parseFloat(form.rate) || 0;
  const subtotal = qty * rate;
  let cgstAmt = 0, sgstAmt = 0, igstAmt = 0, gstAmt = 0;
  if (form.gst_type === 'cgst_sgst') {
    cgstAmt = subtotal * (parseFloat(form.cgst_percent) || 0) / 100;
    sgstAmt = subtotal * (parseFloat(form.sgst_percent) || 0) / 100;
    gstAmt = cgstAmt + sgstAmt;
  } else if (form.gst_type === 'igst') {
    igstAmt = subtotal * (parseFloat(form.gst_percent) || 0) / 100;
    gstAmt = igstAmt;
  }
  const grandTotal = subtotal + gstAmt;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!qty || qty <= 0) { toast.error("Quantity 0 se zyada honi chahiye"); return; }
    try {
      const payload = {
        ...form, quantity: qty, rate: form.txn_type === 'out' ? 0 : rate, advance: form.txn_type === 'out' ? 0 : (parseFloat(form.advance) || 0),
        cgst_percent: form.txn_type === 'out' ? 0 : (parseFloat(form.cgst_percent) || 0),
        sgst_percent: form.txn_type === 'out' ? 0 : (parseFloat(form.sgst_percent) || 0),
        gst_percent: form.txn_type === 'out' ? 0 : (parseFloat(form.gst_percent) || 0),
        used_for_rice: parseInt(form.used_for_rice) || 0,
        used_for_bp: form.used_for_bp || "",
        damaged: parseInt(form.damaged) || 0,
        returned: parseInt(form.returned) || 0,
      };
      if (editingId) {
        await axios.put(`${API}/gunny-bags/${editingId}?username=${user.username}`, payload);
        toast.success("Entry update ho gayi!");
      } else {
        await axios.post(`${API}/gunny-bags?username=${user.username}`, payload);
        toast.success("Entry add ho gayi!");
      }
      setShowForm(false); setEditingId(null); fetchData();
      setForm(defaultForm);
    } catch (e) { toast.error(e.response?.data?.detail || e.message); }
  };

  const handleDelete = async (id) => { if (!await showConfirm("Delete", "Delete karein?")) return; try { await axios.delete(`${API}/gunny-bags/${id}`); toast.success("Deleted!"); fetchData(); } catch (e) { toast.error("Delete nahi hua"); } };
  const [payDialog, setPayDialog] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyParty, setHistoryParty] = useState("");
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchHistory = async (party) => {
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${API}/voucher-payment/history/${encodeURIComponent(party)}?party_type=Gunny Bag`);
      setHistoryData(res.data.history || []);
    } catch (e) { setHistoryData([]); }
    finally { setHistoryLoading(false); }
  };

  const openHistory = (party) => {
    setHistoryParty(party);
    setShowHistory(true);
    fetchHistory(party);
  };

  const handleGunnyPayment = async () => {
    if (!payDialog || !payAmount || parseFloat(payAmount) <= 0) { toast.error("Amount daalna zaroori hai"); return; }
    try {
      await axios.post(`${API}/voucher-payment`, {
        voucher_type: "gunny", voucher_id: payDialog.id, amount: parseFloat(payAmount),
        date: payDate, notes: payNotes, username: user.username,
        kms_year: filters.kms_year || "", season: filters.season || "",
      });
      toast.success("Payment record ho gayi!"); setPayDialog(null); setPayAmount(""); setPayNotes(""); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Payment error"); }
  };
  const exportData = async (format) => {
    try {
      const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season);
      if (bagFilter !== 'all') p.append('bag_filter', bagFilter);
      if (txnFilter !== 'all') p.append('txn_filter', txnFilter);
      const { downloadFile } = await import('../utils/download');
      downloadFile(`/api/gunny-bags/${format}?${p}`, `gunny_bags.${format === 'excel' ? 'xlsx' : 'pdf'}`);
    } catch (e) { toast.error("Export failed"); }
  };

  return (
    <div className="space-y-3" data-testid="gunny-bags-tab">
      {summary && (
        <div className="grid grid-cols-4 md:grid-cols-4 lg:grid-cols-8 gap-1.5">
          <Card className="border border-blue-200 dark:border-blue-800/30 bg-blue-50/50 dark:bg-blue-900/20"><CardContent className="p-2">
            <p className="text-[9px] text-blue-600 dark:text-blue-400 font-medium">Bag Received (Mill)</p>
            <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{summary.auto_mill?.total_in || 0}</p>
            <p className="text-[8px] text-slate-500">From truck entries</p>
          </CardContent></Card>
          <Card className="border border-purple-200 dark:border-purple-800/30 bg-purple-50/50 dark:bg-purple-900/20"><CardContent className="p-2">
            <p className="text-[9px] text-purple-600 dark:text-purple-400 font-medium">P.Pkt (Plastic)</p>
            <p className="text-lg font-bold text-purple-700 dark:text-purple-400">{summary.ppkt?.total || 0}</p>
            <p className="text-[8px] text-slate-500">From truck entries</p>
          </CardContent></Card>
          <Card className="border border-orange-200 dark:border-orange-800/30 bg-orange-50/50 dark:bg-orange-900/20"><CardContent className="p-2">
            <p className="text-[9px] text-orange-600 dark:text-orange-400 font-medium">Old Bags (Market)</p>
            <p className="text-lg font-bold text-orange-700 dark:text-orange-400">{summary.old?.balance || 0}</p>
            <div className="flex gap-1.5 text-[8px] mt-0.5"><span className="text-green-600 dark:text-green-500">In: {summary.old?.total_in || 0}</span><span className="text-red-500 dark:text-red-400">Out: {summary.old?.total_out || 0}</span></div>
          </CardContent></Card>
          <Card className="border border-red-200 dark:border-red-800/30 bg-red-50/50 dark:bg-red-900/20"><CardContent className="p-2">
            <p className="text-[9px] text-red-600 dark:text-red-400 font-medium">Total G.Issued</p>
            <p className="text-lg font-bold text-red-700 dark:text-red-400">{summary.g_issued_total || 0}</p>
            <p className="text-[8px] text-slate-500">Gunny bags OUT</p>
          </CardContent></Card>
          <Card className="border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800"><CardContent className="p-2">
            <p className="text-[9px] text-slate-700 dark:text-slate-200 font-semibold">Total (Excl Govt)</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{summary.grand_total || 0}</p>
            <p className="text-[8px] text-slate-500">All Old Bags (In - Out)</p>
          </CardContent></Card>
          <Card className="border border-emerald-200 dark:border-emerald-800/30 bg-emerald-50/50 dark:bg-emerald-900/20"><CardContent className="p-2">
            <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">Govt Bags (Free)</p>
            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{summary.new?.balance || 0}</p>
            <div className="flex gap-1.5 text-[8px] mt-0.5"><span className="text-green-600 dark:text-green-500">In: {summary.new?.total_in || 0}</span><span className="text-red-500 dark:text-red-400">Out: {summary.new?.total_out || 0}</span></div>
          </CardContent></Card>
          <Card className="border border-violet-200 dark:border-violet-800/30 bg-violet-50/50 dark:bg-violet-900/20"><CardContent className="p-2">
            <p className="text-[9px] text-violet-600 dark:text-violet-400 font-medium">Bran P.Pkt</p>
            <p className="text-lg font-bold text-violet-700 dark:text-violet-400">{summary.bran_plastic?.balance || 0}</p>
            <div className="flex gap-1.5 text-[8px] mt-0.5"><span className="text-green-600 dark:text-green-500">In: {summary.bran_plastic?.total_in || 0}</span><span className="text-red-500 dark:text-red-400">Out: {summary.bran_plastic?.total_out || 0}</span></div>
          </CardContent></Card>
          <Card className="border border-cyan-200 dark:border-cyan-800/30 bg-cyan-50/50 dark:bg-cyan-900/20"><CardContent className="p-2">
            <p className="text-[9px] text-cyan-600 dark:text-cyan-400 font-medium">Broken P.Pkt</p>
            <p className="text-lg font-bold text-cyan-700 dark:text-cyan-400">{summary.broken_plastic?.balance || 0}</p>
            <div className="flex gap-1.5 text-[8px] mt-0.5"><span className="text-green-600 dark:text-green-500">In: {summary.broken_plastic?.total_in || 0}</span><span className="text-red-500 dark:text-red-400">Out: {summary.broken_plastic?.total_out || 0}</span></div>
          </CardContent></Card>
        </div>
      )}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex gap-1 bg-slate-900 p-0.5 rounded border border-slate-700">
          {[
            { id: "all", label: "All" },
            { id: "mill", label: "Bag Received (Mill)" },
            { id: "market", label: "Old Bags (Market)" },
            { id: "govt", label: "Govt Bags" },
            { id: "bran_plastic", label: "Bran P.Pkt" },
            { id: "broken_plastic", label: "Broken P.Pkt" },
          ].map(f => (
            <Button key={f.id} onClick={() => setBagFilter(f.id)} variant={bagFilter === f.id ? "default" : "ghost"} size="sm"
              className={`h-7 text-xs ${bagFilter === f.id ? "bg-amber-500 text-slate-900" : "text-slate-400 hover:text-white"}`}
              data-testid={`gunny-filter-${f.id}`}>{f.label}</Button>
          ))}
        </div>
        <div className="flex gap-1 bg-slate-900 p-0.5 rounded border border-slate-700">
          {[
            { id: "all", label: "All" },
            { id: "in", label: "IN" },
            { id: "out", label: "OUT" },
          ].map(f => (
            <Button key={f.id} onClick={() => setTxnFilter(f.id)} variant={txnFilter === f.id ? "default" : "ghost"} size="sm"
              className={`h-7 text-xs ${txnFilter === f.id ? (f.id === "in" ? "bg-green-600 text-white" : f.id === "out" ? "bg-red-600 text-white" : "bg-amber-500 text-slate-900") : "text-slate-400 hover:text-white"}`}
              data-testid={`gunny-txn-${f.id}`}>{f.label}</Button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button onClick={openNewForm} className="bg-amber-500 hover:bg-amber-600 text-slate-900" size="sm" data-testid="gunny-add-btn"><Plus className="w-4 h-4 mr-1" /> New Entry</Button>
          <Button onClick={() => exportData('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400 hover:bg-slate-700" data-testid="gunny-export-excel"><Download className="w-4 h-4 mr-1" /> Excel</Button>
          <Button onClick={() => exportData('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400 hover:bg-slate-700" data-testid="gunny-export-pdf"><FileText className="w-4 h-4 mr-1" /> PDF</Button>
          <Button onClick={async () => {
            const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season);
            try { const { downloadFile } = await import('../utils/download'); downloadFile(`/api/gunny-bags/purchase-report/excel?${p}`, 'gunny_purchase_report.xlsx'); } catch(e) { toast.error("Report export failed"); }
          }} variant="outline" size="sm" className="border-amber-600 text-amber-400 hover:bg-amber-900/30" data-testid="gunny-purchase-report">
            <FileText className="w-4 h-4 mr-1" /> Purchase Report
          </Button>
        </div>
      </div>
      <Card className="bg-slate-800 border-slate-700"><CardContent className="p-0"><div className="overflow-x-auto">
        <Table><TableHeader><TableRow className="border-slate-700 hover:bg-transparent">
          {['Date','Party','Inv No','Truck','In/Out','Qty','Rate','Total','GST','Paid','Used For','Damaged','Return','Type','Remark',''].map(h =>
            <TableHead key={h} className={`text-slate-300 text-xs ${['Qty','Rate','Total','GST','Paid','Damaged','Return'].includes(h) ? 'text-right' : ''}`}>{h}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={16} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
          : entries.length === 0 ? <TableRow><TableCell colSpan={16} className="text-center text-slate-400 py-8">Koi entry nahi hai.</TableCell></TableRow>
          : entries.filter(e => {
              if (bagFilter === "mill" && !e.linked_entry_id) return false;
              if (bagFilter === "market" && (e.bag_type !== "old" || e.linked_entry_id)) return false;
              if (bagFilter === "govt" && e.bag_type !== "new") return false;
              if (bagFilter === "bran_plastic" && e.bag_type !== "bran_plastic") return false;
              if (bagFilter === "broken_plastic" && e.bag_type !== "broken_plastic") return false;
              if (txnFilter === "in" && e.txn_type !== "in") return false;
              if (txnFilter === "out" && e.txn_type !== "out") return false;
              return true;
            }).map(e => (
            <TableRow key={e.id} className={`border-slate-700 ${e.txn_type === 'in' ? 'bg-green-900/5' : 'bg-red-900/5'}`} data-testid={`gunny-row-${e.id}`}>
              <TableCell className="text-white text-xs">{fmtDate(e.date)}</TableCell>
              <TableCell className="text-white text-xs font-medium">{e.party_name || e.source || '-'}</TableCell>
              <TableCell className="text-slate-400 text-xs">{e.invoice_no || '-'}</TableCell>
              <TableCell className="text-slate-400 text-xs">{e.truck_no || '-'}</TableCell>
              <TableCell className="text-xs"><span className={e.txn_type === 'in' ? 'text-green-400' : 'text-red-400'}>{e.txn_type === 'in' ? 'IN' : 'OUT'}</span></TableCell>
              <TableCell className="text-white text-xs text-right font-medium">{e.quantity}</TableCell>
              <TableCell className="text-slate-400 text-xs text-right">{e.rate > 0 ? `Rs.${e.rate}` : '-'}</TableCell>
              <TableCell className="text-amber-400 text-xs text-right font-medium">{(e.total || e.amount || 0) > 0 ? `Rs.${(e.total || e.amount || 0).toLocaleString('en-IN')}` : '-'}</TableCell>
              <TableCell className="text-slate-400 text-xs text-right">{(e.gst_amount || 0) > 0 ? `Rs.${e.gst_amount}` : '-'}</TableCell>
              <TableCell className="text-emerald-400 text-xs text-right">{(e.ledger_paid || e.advance || 0) > 0 ? `Rs.${(e.ledger_paid || e.advance || 0).toLocaleString('en-IN')}` : '-'}</TableCell>
              <TableCell className="text-blue-400 text-xs">{e.used_for_bp || '-'}</TableCell>
              <TableCell className="text-red-400 text-xs text-right">{e.damaged > 0 ? e.damaged : '-'}</TableCell>
              <TableCell className="text-amber-400 text-xs text-right">{e.returned > 0 ? e.returned : '-'}</TableCell>
              <TableCell className="text-xs"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${e.bag_type === 'new' ? 'bg-emerald-500/20 text-emerald-400' : e.bag_type === 'bran_plastic' ? 'bg-purple-500/20 text-purple-400' : e.bag_type === 'broken_plastic' ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'}`}>{e.bag_type === 'new' ? 'Govt' : e.bag_type === 'bran_plastic' ? 'Bran P.Pkt' : e.bag_type === 'broken_plastic' ? 'Broken P.Pkt' : 'Market'}</span></TableCell>
              <TableCell className="text-slate-400 text-xs truncate max-w-[80px]" title={e.notes || ''}>{e.notes || '-'}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {e.linked_entry_id && <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" data-testid={`gunny-auto-badge-${e.id}`}>Auto</span>}
                  {e.txn_type === 'in' && (e.total || e.amount || 0) > 0 && (
                    (e.ledger_balance != null ? e.ledger_balance : ((e.total || e.amount || 0) - (e.advance || 0))) <= 0 ? (
                      <>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" data-testid={`gunny-paid-badge-${e.id}`}>Paid</span>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-sky-400" onClick={() => openHistory(e.party_name || e.source)} title="Payment History" data-testid={`gunny-history-${e.id}`}><Clock className="w-3 h-3" /></Button>
                      </>
                    ) : (
                      user.role === 'admin' && !e.linked_entry_id && (
                        <>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-emerald-400" onClick={() => { setPayDialog(e); setPayAmount(""); setPayNotes(""); setPayDate(new Date().toISOString().split('T')[0]); }} title="Payment Karein" data-testid={`gunny-pay-${e.id}`}><IndianRupee className="w-3 h-3" /></Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-sky-400" onClick={() => openHistory(e.party_name || e.source)} title="Payment History" data-testid={`gunny-history-${e.id}`}><Clock className="w-3 h-3" /></Button>
                        </>
                      )
                    )
                  )}
                  {user.role === 'admin' && !e.linked_entry_id && (
                    <>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-400" onClick={() => openEditForm(e)} data-testid={`gunny-edit-${e.id}`}><Edit className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => handleDelete(e.id)} data-testid={`gunny-delete-${e.id}`}><Trash2 className="w-3 h-3" /></Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody></Table>
      </div></CardContent></Card>

      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) setEditingId(null); }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl" data-testid="gunny-form-dialog">
          <DialogHeader><DialogTitle className="text-amber-400">{editingId ? 'Edit Gunny Bag Entry' : 'New Gunny Bag Entry / बोरी'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Row 1: Date, Bag Type, In/Out */}
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p=>({...p,date:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="gunny-form-date" /></div>
              <div><Label className="text-xs text-slate-400">Bag Type <span className={`ml-1 font-bold ${previewStock > 0 ? 'text-emerald-400' : previewStock < 0 ? 'text-red-400' : 'text-amber-400'}`}>({stockLabel})</span></Label>
                <Select value={form.bag_type} onValueChange={v => setForm(p=>({...p,bag_type:v}))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-bagtype"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New (Govt) — {bagStock.new} bags</SelectItem>
                    <SelectItem value="old">Old (Market) — {bagStock.old} bags</SelectItem>
                    <SelectItem value="bran_plastic">Bran P.Pkt — {bagStock.bran_plastic} bags</SelectItem>
                    <SelectItem value="broken_plastic">Broken P.Pkt — {bagStock.broken_plastic} bags</SelectItem>
                  </SelectContent>
                </Select></div>
              <div><Label className="text-xs text-slate-400">In/Out</Label>
                <Select value={form.txn_type} onValueChange={v => setForm(p=>({...p,txn_type:v}))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-txntype"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="in">In (Received)</SelectItem><SelectItem value="out">Out (Used)</SelectItem></SelectContent>
                </Select></div>
            </div>
            {/* Conditional fields based on In/Out */}
            {form.txn_type === "in" ? (
            <>
            {/* Row 2: Invoice No, RST No, Truck No */}
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs text-slate-400">Invoice No.</Label>
                <Input value={form.invoice_no} onChange={e => setForm(p=>({...p,invoice_no:e.target.value}))} placeholder="Invoice number" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-invoice" /></div>
              <div><Label className="text-xs text-slate-400">RST No.</Label>
                <Input value={form.rst_no} onChange={e => setForm(p=>({...p,rst_no:e.target.value}))} placeholder="RST number" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-rst" /></div>
              <div><Label className="text-xs text-slate-400">Truck No.</Label>
                <Input value={form.truck_no} onChange={e => setForm(p=>({...p,truck_no:e.target.value}))} placeholder="Truck number" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-truck" /></div>
            </div>
            {/* Row 3: Party Name, Quantity, Rate */}
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs text-slate-400">Party Name</Label>
                <Input value={form.party_name} onChange={e => setForm(p=>({...p,party_name:e.target.value}))} placeholder="Party / Supplier" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-party" /></div>
              <div><Label className="text-xs text-slate-400">Quantity (bags) <span className={`ml-1 font-bold ${previewStock > 0 ? 'text-emerald-400' : previewStock < 0 ? 'text-red-400' : 'text-amber-400'}`}>{stockLabel}</span></Label>
                <Input type="number" value={form.quantity} onChange={e => setForm(p=>({...p,quantity:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="gunny-form-qty" /></div>
              <div><Label className="text-xs text-slate-400">Rate (Rs./bag)</Label>
                <Input type="number" step="0.01" value={form.rate} onChange={e => setForm(p=>({...p,rate:e.target.value}))} placeholder="0 for free" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-rate" /></div>
            </div>
            {/* Row 4: GST & Advance */}
            <div className="grid grid-cols-4 gap-3">
              <div><Label className="text-xs text-slate-400">GST Type</Label>
                <Select value={form.gst_type} onValueChange={v => setForm(p=>({...p,gst_type:v}))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-gsttype"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">No GST</SelectItem><SelectItem value="cgst_sgst">CGST+SGST</SelectItem><SelectItem value="igst">IGST</SelectItem></SelectContent>
                </Select></div>
              {form.gst_type === 'cgst_sgst' && (
                <>
                  <div><Label className="text-xs text-slate-400">CGST %</Label>
                    <Input type="number" step="0.01" value={form.cgst_percent} onChange={e => setForm(p=>({...p,cgst_percent:e.target.value}))} placeholder="e.g. 9" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-cgstpercent" /></div>
                  <div><Label className="text-xs text-slate-400">SGST %</Label>
                    <Input type="number" step="0.01" value={form.sgst_percent} onChange={e => setForm(p=>({...p,sgst_percent:e.target.value}))} placeholder="e.g. 9" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-sgstpercent" /></div>
                </>
              )}
              {form.gst_type === 'igst' && (
                <div><Label className="text-xs text-slate-400">IGST %</Label>
                  <Input type="number" step="0.01" value={form.gst_percent} onChange={e => setForm(p=>({...p,gst_percent:e.target.value}))} placeholder="e.g. 18" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-gstpercent" /></div>
              )}
              <div><Label className="text-xs text-slate-400">Party Advance</Label>
                <Input type="number" step="0.01" value={form.advance} onChange={e => setForm(p=>({...p,advance:e.target.value}))} placeholder="0" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-advance" /></div>
            </div>
            </>
            ) : (
            <>
            {/* OUT fields: Used For, Damaged, Return */}
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Quantity (bags) <span className={`ml-1 font-bold ${previewStock > 0 ? 'text-emerald-400' : previewStock < 0 ? 'text-red-400' : 'text-amber-400'}`}>{stockLabel}</span></Label>
                <Input type="number" value={form.quantity} onChange={e => setForm(p=>({...p,quantity:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="gunny-form-qty" /></div>
              <div><Label className="text-xs text-blue-400">Used For</Label>
                <Select value={form.used_for_bp || "_none"} onValueChange={v => setForm(p=>({...p,used_for_bp: v === "_none" ? "" : v}))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-used-bp"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">-- None --</SelectItem>
                    <SelectItem value="Rice Usna">Rice Usna</SelectItem>
                    <SelectItem value="Rice Raw">Rice Raw</SelectItem>
                    <SelectItem value="Rice Bran">Rice Bran</SelectItem>
                    <SelectItem value="Mota Kunda">Mota Kunda</SelectItem>
                    <SelectItem value="Broken Rice">Broken Rice</SelectItem>
                    <SelectItem value="Rejection Rice">Rejection Rice</SelectItem>
                    <SelectItem value="Pin Broken Rice">Pin Broken Rice</SelectItem>
                    <SelectItem value="Poll">Poll</SelectItem>
                    <SelectItem value="Bhusa">Bhusa</SelectItem>
                    <SelectItem value="FRK">FRK</SelectItem>
                    <SelectItem value="Paddy">Paddy</SelectItem>
                  </SelectContent>
                </Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-red-400">Damaged</Label>
                <Input type="number" value={form.damaged} onChange={e => setForm(p=>({...p,damaged:e.target.value}))} placeholder="0" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-damaged" /></div>
              <div><Label className="text-xs text-amber-400">Return</Label>
                <Input type="number" value={form.returned} onChange={e => setForm(p=>({...p,returned:e.target.value}))} placeholder="0" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-returned" /></div>
            </div>
            </>
            )}
            {/* Row 5: Remark */}
            <div className="grid grid-cols-1 gap-3">
              <div><Label className="text-xs text-slate-400">Remark</Label>
                <Input value={form.notes} onChange={e => setForm(p=>({...p,notes:e.target.value}))} placeholder="Remark" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-notes" /></div>
            </div>
            {/* Amount Summary */}
            {subtotal > 0 && (
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 grid grid-cols-4 gap-2 text-xs">
                <div><span className="text-slate-400">Subtotal:</span> <span className="text-white font-medium">Rs.{subtotal.toLocaleString('en-IN')}</span></div>
                {cgstAmt > 0 && <div><span className="text-slate-400">CGST:</span> <span className="text-sky-400 font-medium">Rs.{cgstAmt.toFixed(0)}</span></div>}
                {sgstAmt > 0 && <div><span className="text-slate-400">SGST:</span> <span className="text-sky-400 font-medium">Rs.{sgstAmt.toFixed(0)}</span></div>}
                {igstAmt > 0 && <div><span className="text-slate-400">IGST:</span> <span className="text-sky-400 font-medium">Rs.{igstAmt.toFixed(0)}</span></div>}
                <div><span className="text-slate-400">Total:</span> <span className="text-amber-400 font-bold">Rs.{grandTotal.toLocaleString('en-IN')}</span></div>
                {(parseFloat(form.advance) || 0) > 0 && <div><span className="text-slate-400">Balance:</span> <span className="text-red-400 font-bold">Rs.{(grandTotal - (parseFloat(form.advance) || 0)).toLocaleString('en-IN')}</span></div>}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-slate-900 flex-1" data-testid="gunny-form-submit">{editingId ? 'Update Entry' : 'Save Entry'}</Button>
              <Button type="button" variant="outline" className="border-slate-600 text-slate-300" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={!!payDialog} onOpenChange={v => { if (!v) setPayDialog(null); }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-sm" data-testid="gunny-pay-dialog">
          <DialogHeader><DialogTitle className="text-emerald-400 flex items-center gap-2"><IndianRupee className="w-5 h-5" /> Payment Karein / भुगतान</DialogTitle></DialogHeader>
          {payDialog && (
            <div className="space-y-3">
              <div className="bg-slate-900 p-3 rounded border border-slate-700 text-xs space-y-1">
                <p><span className="text-slate-400">Party:</span> <span className="text-white font-medium">{payDialog.party_name || payDialog.source || '-'}</span></p>
                <p><span className="text-slate-400">Total:</span> <span className="text-emerald-400 font-bold">Rs.{(payDialog.total || payDialog.amount || 0).toLocaleString('en-IN')}</span></p>
                <p><span className="text-slate-400">Paid:</span> <span className="text-sky-400">Rs.{(payDialog.ledger_paid || payDialog.advance || 0).toLocaleString('en-IN')}</span></p>
                <p><span className="text-slate-400">Balance:</span> <span className="text-red-400 font-bold">Rs.{(payDialog.ledger_balance != null ? payDialog.ledger_balance : ((payDialog.total || payDialog.amount || 0) - (payDialog.advance || 0))).toLocaleString('en-IN')}</span></p>
              </div>
              <div><Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-pay-date" /></div>
              <div><Label className="text-xs text-slate-400">Amount (Rs.) *</Label>
                <Input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-sm" autoFocus data-testid="gunny-pay-amount" /></div>
              <div><Label className="text-xs text-slate-400">Notes</Label>
                <Input value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Optional" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-pay-notes" /></div>
              <Button onClick={handleGunnyPayment} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white" data-testid="gunny-pay-submit">
                Payment Record Karein
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-white" data-testid="gunny-history-dialog">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <History className="w-5 h-5" /> Payment History
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-slate-300 text-sm border-b border-slate-600 pb-2">Party: {historyParty}</p>
            {historyLoading ? (
              <p className="text-slate-400 text-center py-4">Loading...</p>
            ) : historyData.length > 0 ? (
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                {historyData.map((record, idx) => (
                  <div key={record.id || record.date || `dc-hist-${idx}`} className="p-3 rounded-lg border bg-slate-700/50 border-slate-600">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-emerald-400 font-bold">+Rs.{Math.abs(record.amount).toLocaleString('en-IN')}</p>
                        <p className="text-slate-400 text-xs">{record.note || 'Payment'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-slate-400 text-xs">{new Date(record.date).toLocaleDateString('hi-IN')}</p>
                        <p className="text-slate-500 text-xs">by {record.by}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-center py-4">Koi payment record nahi hai</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ===== MAIN DC TRACKER COMPONENT =====
const DCTracker = ({ filters, user }) => {
  const [activeSubTab, setActiveSubTab] = useState("dc");
  const [dcList, setDcList] = useState([]);

  useEffect(() => {
    const fetchDCs = async () => {
      try {
        const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season);
        const res = await axios.get(`${API}/dc-entries?${p}`);
        setDcList(res.data);
      } catch (e) { /* ignore */ }
    };
    fetchDCs();
  }, [filters.kms_year, filters.season, activeSubTab]);

  return (
    <div className="space-y-3" data-testid="dc-tracker">
      <div className="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-700 w-fit">
        {[
          { id: "dc", label: "DC / Delivery Challan", icon: ClipboardList },
          { id: "msp", label: "MSP Payments", icon: IndianRupee },
        ].map(({ id, label, icon: Icon }) => (
          <Button key={id} onClick={() => setActiveSubTab(id)} variant={activeSubTab === id ? "default" : "ghost"} size="sm"
            className={activeSubTab === id ? "bg-amber-500 text-slate-900" : "text-slate-400 hover:text-white hover:bg-slate-700"}
            data-testid={`subtab-${id}`}>
            <Icon className="w-4 h-4 mr-1" /> {label}
          </Button>
        ))}
      </div>
      {activeSubTab === "dc" && <DCEntries filters={filters} user={user} />}
      {activeSubTab === "msp" && <MSPPayments filters={filters} user={user} dcList={dcList} />}
    </div>
  );
};

export default DCTracker;
