import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, RefreshCw, Download, FileText, Truck, ClipboardList, ChevronDown, ChevronUp, IndianRupee, Package, Edit } from "lucide-react";

const BACKEND_URL = (typeof window !== 'undefined' && window.ELECTRON_API_URL) || process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CURRENT_KMS = (() => { const n = new Date(), y = n.getFullYear(); return n.getMonth() >= 9 ? `${y}-${y+1}` : `${y-1}-${y}`; })();

// ===== DC ENTRIES SUB-TAB =====
const DCEntries = ({ filters, user }) => {
  const [dcs, setDcs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedDC, setExpandedDC] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [form, setForm] = useState({ dc_number: "", date: new Date().toISOString().split('T')[0], quantity_qntl: "", rice_type: "parboiled", godown_name: "", deadline: "", notes: "", kms_year: CURRENT_KMS, season: "Kharif" });
  const [delForm, setDelForm] = useState({ dc_id: "", date: new Date().toISOString().split('T')[0], quantity_qntl: "", vehicle_no: "", driver_name: "", slip_no: "", godown_name: "", notes: "", kms_year: CURRENT_KMS, season: "Kharif" });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      const [dcRes, sumRes] = await Promise.all([axios.get(`${API}/dc-entries?${p}`), axios.get(`${API}/dc-summary?${p}`)]);
      setDcs(dcRes.data); setSummary(sumRes.data);
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
      await axios.post(`${API}/dc-deliveries?username=${user.username}`, { ...delForm, quantity_qntl: parseFloat(delForm.quantity_qntl) });
      toast.success("Delivery add hui!"); setShowDeliveryForm(false);
      setDelForm({ dc_id: "", date: new Date().toISOString().split('T')[0], quantity_qntl: "", vehicle_no: "", driver_name: "", slip_no: "", godown_name: "", notes: "", kms_year: filters.kms_year || CURRENT_KMS, season: filters.season || "Kharif" });
      fetchDeliveries(expandedDC); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || e.message); }
  };

  const handleDeleteDC = async (id) => { if (!window.confirm("DC delete karein?")) return; try { await axios.delete(`${API}/dc-entries/${id}`); toast.success("DC deleted"); fetchData(); } catch (e) { toast.error("Delete nahi hua"); } };
  const handleDeleteDelivery = async (id) => { if (!window.confirm("Delivery delete karein?")) return; try { await axios.delete(`${API}/dc-deliveries/${id}`); toast.success("Deleted"); fetchDeliveries(expandedDC); fetchData(); } catch (e) { toast.error("Delete nahi hua"); } };
  const exportData = async (format) => {
    try {
      const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/dc-entries/${format}?${p}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url;
      a.download = `dc_register.${format === 'excel' ? 'xlsx' : 'pdf'}`; a.click(); window.URL.revokeObjectURL(url);
    } catch (e) { toast.error("Export failed"); }
  };

  const statusBadge = (s) => {
    const cls = s === 'completed' ? 'bg-green-500/20 text-green-400' : s === 'partial' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400';
    return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>{s === 'completed' ? 'Done' : s === 'partial' ? 'Partial' : 'Pending'}</span>;
  };

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
      <div className="flex gap-2 flex-wrap">
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
        <Button onClick={() => setShowForm(true)} className="bg-amber-500 hover:bg-amber-600 text-slate-900" size="sm" data-testid="dc-add-btn"><Plus className="w-4 h-4 mr-1" /> New DC</Button>
        <Button onClick={() => exportData('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400 hover:bg-slate-700" data-testid="dc-export-excel"><Download className="w-4 h-4 mr-1" /> Excel</Button>
        <Button onClick={() => exportData('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400 hover:bg-slate-700" data-testid="dc-export-pdf"><FileText className="w-4 h-4 mr-1" /> PDF</Button>
      </div>
      <Card className="bg-slate-800 border-slate-700"><CardContent className="p-0"><div className="overflow-x-auto">
        <Table><TableHeader><TableRow className="border-slate-700 hover:bg-transparent">
          {['','DC No','Date','Type','Allotted(Q)','Delivered(Q)','Pending(Q)','Status','Deadline','Godown',''].map(h =>
            <TableHead key={h} className="text-slate-300 text-xs">{h}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={11} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
          : dcs.length === 0 ? <TableRow><TableCell colSpan={11} className="text-center text-slate-400 py-8">Koi DC nahi hai. "New DC" click karein.</TableCell></TableRow>
          : dcs.map(dc => (<React.Fragment key={dc.id}>
            <TableRow key={dc.id} className="border-slate-700 cursor-pointer hover:bg-slate-750" onClick={() => handleExpandDC(dc.id)} data-testid={`dc-row-${dc.id}`}>
              <TableCell>{expandedDC === dc.id ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}</TableCell>
              <TableCell className="text-amber-400 font-medium text-xs">{dc.dc_number}</TableCell>
              <TableCell className="text-white text-xs">{dc.date}</TableCell>
              <TableCell className="text-xs"><span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400">{(dc.rice_type||'').charAt(0).toUpperCase()+(dc.rice_type||'').slice(1)}</span></TableCell>
              <TableCell className="text-white text-xs text-right">{dc.quantity_qntl}</TableCell>
              <TableCell className="text-green-400 text-xs text-right">{dc.delivered_qntl}</TableCell>
              <TableCell className="text-red-400 text-xs text-right">{dc.pending_qntl}</TableCell>
              <TableCell>{statusBadge(dc.status)}</TableCell>
              <TableCell className="text-slate-300 text-xs">{dc.deadline}</TableCell>
              <TableCell className="text-slate-400 text-xs">{dc.godown_name}</TableCell>
              <TableCell>{user.role === 'admin' && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={(e) => { e.stopPropagation(); handleDeleteDC(dc.id); }}><Trash2 className="w-3 h-3" /></Button>}</TableCell>
            </TableRow>
            {expandedDC === dc.id && (
              <TableRow key={`${dc.id}-del`} className="border-slate-700 bg-slate-900/50">
                <TableCell colSpan={11} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-amber-400 font-medium">Deliveries for {dc.dc_number}</p>
                    <Button onClick={() => { setDelForm(f => ({ ...f, dc_id: dc.id, kms_year: dc.kms_year, season: dc.season, godown_name: dc.godown_name })); setShowDeliveryForm(true); }} size="sm" className="bg-green-600 hover:bg-green-700 text-white h-6 text-xs" data-testid="dc-add-delivery-btn"><Plus className="w-3 h-3 mr-1" /> Add Delivery</Button>
                  </div>
                  {deliveries.length === 0 ? <p className="text-xs text-slate-500 py-2">No deliveries yet</p> : (
                    <Table><TableHeader><TableRow className="border-slate-600 hover:bg-transparent">
                      {['Date','Qty (Q)','Vehicle','Driver','Slip No','Godown','Note',''].map(h =>
                        <TableHead key={h} className="text-slate-400 text-[10px] py-1">{h}</TableHead>)}
                    </TableRow></TableHeader>
                    <TableBody>{deliveries.map(d => (
                      <TableRow key={d.id} className="border-slate-700" data-testid={`delivery-row-${d.id}`}>
                        <TableCell className="text-white text-[11px] py-1">{d.date}</TableCell>
                        <TableCell className="text-green-400 text-[11px] py-1 font-medium">{d.quantity_qntl}</TableCell>
                        <TableCell className="text-slate-300 text-[11px] py-1">{d.vehicle_no}</TableCell>
                        <TableCell className="text-slate-400 text-[11px] py-1">{d.driver_name}</TableCell>
                        <TableCell className="text-slate-400 text-[11px] py-1">{d.slip_no}</TableCell>
                        <TableCell className="text-slate-400 text-[11px] py-1">{d.godown_name}</TableCell>
                        <TableCell className="text-slate-500 text-[11px] py-1">{d.notes}</TableCell>
                        <TableCell className="py-1">{user.role === 'admin' && <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400" onClick={() => handleDeleteDelivery(d.id)}><Trash2 className="w-2.5 h-2.5" /></Button>}</TableCell>
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
              <div><Label className="text-xs text-slate-400">Quantity (QNTL)</Label>
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
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md" data-testid="delivery-form-dialog">
          <DialogHeader><DialogTitle className="text-green-400">Add Delivery / डिलीवरी जोड़ें</DialogTitle></DialogHeader>
          <form onSubmit={handleAddDelivery} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={delForm.date} onChange={e => setDelForm(p=>({...p,date:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="delivery-form-date" /></div>
              <div><Label className="text-xs text-slate-400">Quantity (QNTL)</Label>
                <Input type="number" step="0.01" value={delForm.quantity_qntl} onChange={e => setDelForm(p=>({...p,quantity_qntl:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="delivery-form-qty" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Vehicle No</Label>
                <Input value={delForm.vehicle_no} onChange={e => setDelForm(p=>({...p,vehicle_no:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="delivery-form-vehicle" /></div>
              <div><Label className="text-xs text-slate-400">Driver Name</Label>
                <Input value={delForm.driver_name} onChange={e => setDelForm(p=>({...p,driver_name:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="delivery-form-driver" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Slip No</Label>
                <Input value={delForm.slip_no} onChange={e => setDelForm(p=>({...p,slip_no:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="delivery-form-slip" /></div>
              <div><Label className="text-xs text-slate-400">Godown</Label>
                <Input value={delForm.godown_name} onChange={e => setDelForm(p=>({...p,godown_name:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
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
const MSPPayments = ({ filters, user, dcList }) => {
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], dc_id: "", quantity_qntl: "", rate_per_qntl: "", amount: "", payment_mode: "", reference: "", bank_name: "", notes: "", kms_year: CURRENT_KMS, season: "Kharif" });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season);
      const [payRes, sumRes] = await Promise.all([axios.get(`${API}/msp-payments?${p}`), axios.get(`${API}/msp-payments/summary?${p}`)]);
      setPayments(payRes.data); setSummary(sumRes.data);
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

  const handleDelete = async (id) => { if (!window.confirm("Payment delete karein?")) return; try { await axios.delete(`${API}/msp-payments/${id}`); toast.success("Deleted!"); fetchData(); } catch (e) { toast.error("Delete nahi hua"); } };
  const exportData = async (format) => {
    try {
      const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/msp-payments/${format}?${p}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url;
      a.download = `msp_payments.${format === 'excel' ? 'xlsx' : 'pdf'}`; a.click();
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
              <TableCell className="text-white text-xs">{p.date}</TableCell>
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
                <Select value={form.dc_id || "_none"} onValueChange={v => setForm(p=>({...p,dc_id:v==="_none"?"":v}))}>
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
                    {["NEFT","RTGS","Cheque","Cash","DD"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div><Label className="text-xs text-slate-400">Reference (UTR/Cheque)</Label>
                <Input value={form.reference} onChange={e => setForm(p=>({...p,reference:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="msp-form-ref" /></div>
            </div>
            <div><Label className="text-xs text-slate-400">Bank Name</Label>
              <Input value={form.bank_name} onChange={e => setForm(p=>({...p,bank_name:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="msp-form-bank" /></div>
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
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const defaultForm = { date: new Date().toISOString().split('T')[0], bag_type: "new", txn_type: "in", quantity: "", source: "", rate: "", reference: "", notes: "", kms_year: CURRENT_KMS, season: "Kharif" };
  const [form, setForm] = useState(defaultForm);
  const [bagFilter, setBagFilter] = useState("all");

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
    setForm({ date: entry.date || '', bag_type: entry.bag_type || 'new', txn_type: entry.txn_type || 'in', quantity: entry.quantity?.toString() || '', source: entry.source || '', rate: entry.rate?.toString() || '', reference: entry.reference || '', notes: entry.notes || '', kms_year: entry.kms_year || '', season: entry.season || '' });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const qty = parseInt(form.quantity);
    if (!qty || qty <= 0) { toast.error("Quantity 0 se zyada honi chahiye"); return; }
    try {
      const payload = { ...form, quantity: qty, rate: parseFloat(form.rate) || 0 };
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

  const handleDelete = async (id) => { if (!window.confirm("Delete karein?")) return; try { await axios.delete(`${API}/gunny-bags/${id}`); toast.success("Deleted!"); fetchData(); } catch (e) { toast.error("Delete nahi hua"); } };
  const exportData = async (format) => {
    try {
      const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/gunny-bags/${format}?${p}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url;
      a.download = `gunny_bags.${format === 'excel' ? 'xlsx' : 'pdf'}`; a.click();
    } catch (e) { toast.error("Export failed"); }
  };

  return (
    <div className="space-y-3" data-testid="gunny-bags-tab">
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <Card className="bg-gradient-to-br from-blue-900/40 to-slate-800 border-blue-800/30"><CardContent className="p-3">
            <p className="text-[10px] text-blue-400">Bag Received (Mill)</p>
            <p className="text-xl font-bold text-blue-400">{summary.auto_mill?.total_in || 0}</p>
            <p className="text-[9px] text-slate-500 mt-1">From truck entries</p>
          </CardContent></Card>
          <Card className="bg-gradient-to-br from-purple-900/40 to-slate-800 border-purple-800/30"><CardContent className="p-3">
            <p className="text-[10px] text-purple-400">P.Pkt (Plastic)</p>
            <p className="text-xl font-bold text-purple-400">{summary.ppkt?.total || 0}</p>
            <p className="text-[9px] text-slate-500 mt-1">From truck entries</p>
          </CardContent></Card>
          <Card className="bg-gradient-to-br from-orange-900/30 to-slate-800 border-orange-800/30"><CardContent className="p-3">
            <p className="text-[10px] text-orange-400">Old Bags (Market)</p>
            <p className="text-xl font-bold text-orange-400">{summary.old?.balance || 0}</p>
            <div className="flex gap-2 text-[10px] mt-1"><span className="text-green-500">In: {summary.old?.total_in || 0}</span><span className="text-red-400">Out: {summary.old?.total_out || 0}</span></div>
            <p className="text-[9px] text-amber-400">Cost: Rs.{(summary.old?.total_cost || 0).toLocaleString('en-IN')}</p>
          </CardContent></Card>
          <Card className="bg-gradient-to-br from-red-900/40 to-slate-800 border-red-800/30"><CardContent className="p-3">
            <p className="text-[10px] text-red-400">Total G.Issued</p>
            <p className="text-xl font-bold text-red-400">{summary.g_issued_total || 0}</p>
            <p className="text-[9px] text-slate-500 mt-1">Gunny bags OUT</p>
          </CardContent></Card>
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
            <p className="text-[10px] text-white font-medium">Total (Excl Govt)</p>
            <p className="text-xl font-bold text-white">{summary.grand_total || 0} bags</p>
            <p className="text-[9px] text-slate-500 mt-1">All Old Bags (In - Out)</p>
          </CardContent></Card>
          <Card className="bg-gradient-to-br from-emerald-900/40 to-slate-800 border-emerald-800/30"><CardContent className="p-3">
            <p className="text-[10px] text-emerald-400">Govt Bags (Free)</p>
            <p className="text-xl font-bold text-emerald-400">{summary.new?.balance || 0}</p>
            <div className="flex gap-2 text-[10px] mt-1"><span className="text-green-500">In: {summary.new?.total_in || 0}</span><span className="text-red-400">Out: {summary.new?.total_out || 0}</span></div>
            <p className="text-[9px] text-slate-500 mt-1">Not in total</p>
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
          ].map(f => (
            <Button key={f.id} onClick={() => setBagFilter(f.id)} variant={bagFilter === f.id ? "default" : "ghost"} size="sm"
              className={`h-7 text-xs ${bagFilter === f.id ? "bg-amber-500 text-slate-900" : "text-slate-400 hover:text-white"}`}
              data-testid={`gunny-filter-${f.id}`}>{f.label}</Button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button onClick={openNewForm} className="bg-amber-500 hover:bg-amber-600 text-slate-900" size="sm" data-testid="gunny-add-btn"><Plus className="w-4 h-4 mr-1" /> New Entry</Button>
          <Button onClick={() => exportData('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400 hover:bg-slate-700" data-testid="gunny-export-excel"><Download className="w-4 h-4 mr-1" /> Excel</Button>
          <Button onClick={() => exportData('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400 hover:bg-slate-700" data-testid="gunny-export-pdf"><FileText className="w-4 h-4 mr-1" /> PDF</Button>
        </div>
      </div>
      <Card className="bg-slate-800 border-slate-700"><CardContent className="p-0"><div className="overflow-x-auto">
        <Table><TableHeader><TableRow className="border-slate-700 hover:bg-transparent">
          {['Date','Bag Type','In/Out','Quantity','Source/To','Rate','Amount (Rs.)','Reference','Notes',''].map(h =>
            <TableHead key={h} className={`text-slate-300 text-xs ${['Quantity','Rate','Amount (Rs.)'].includes(h) ? 'text-right' : ''}`}>{h}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={10} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
          : entries.length === 0 ? <TableRow><TableCell colSpan={10} className="text-center text-slate-400 py-8">Koi entry nahi hai.</TableCell></TableRow>
          : entries.filter(e => {
              if (bagFilter === "mill") return !!e.linked_entry_id;
              if (bagFilter === "market") return e.bag_type === "old" && !e.linked_entry_id;
              if (bagFilter === "govt") return e.bag_type === "new";
              return true;
            }).map(e => (
            <TableRow key={e.id} className={`border-slate-700 ${e.txn_type === 'in' ? 'bg-green-900/5' : 'bg-red-900/5'}`} data-testid={`gunny-row-${e.id}`}>
              <TableCell className="text-white text-xs">{e.date}</TableCell>
              <TableCell className="text-xs"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${e.bag_type === 'new' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'}`}>{e.bag_type === 'new' ? 'New (Govt)' : 'Old (Market)'}</span></TableCell>
              <TableCell className="text-xs"><span className={e.txn_type === 'in' ? 'text-green-400' : 'text-red-400'}>{e.txn_type === 'in' ? 'IN' : 'OUT'}</span></TableCell>
              <TableCell className="text-white text-xs text-right font-medium">{e.quantity}</TableCell>
              <TableCell className="text-slate-300 text-xs">{e.source}</TableCell>
              <TableCell className="text-slate-400 text-xs text-right">{e.rate > 0 ? `Rs.${e.rate}` : '-'}</TableCell>
              <TableCell className="text-slate-400 text-xs text-right">{e.amount > 0 ? `Rs.${e.amount.toLocaleString('en-IN')}` : '-'}</TableCell>
              <TableCell className="text-slate-400 text-xs">{e.reference}</TableCell>
              <TableCell className="text-slate-500 text-xs max-w-[120px] truncate">{e.notes}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {e.linked_entry_id && <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" data-testid={`gunny-auto-badge-${e.id}`}>Auto</span>}
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
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md" data-testid="gunny-form-dialog">
          <DialogHeader><DialogTitle className="text-amber-400">{editingId ? 'Edit Gunny Bag Entry' : 'New Gunny Bag Entry / बोरी'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p=>({...p,date:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="gunny-form-date" /></div>
              <div><Label className="text-xs text-slate-400">Bag Type</Label>
                <Select value={form.bag_type} onValueChange={v => setForm(p=>({...p,bag_type:v}))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-bagtype"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="new">New (Govt)</SelectItem><SelectItem value="old">Old (Market)</SelectItem></SelectContent>
                </Select></div>
              <div><Label className="text-xs text-slate-400">In/Out</Label>
                <Select value={form.txn_type} onValueChange={v => setForm(p=>({...p,txn_type:v}))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-txntype"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="in">In (Received)</SelectItem><SelectItem value="out">Out (Used)</SelectItem></SelectContent>
                </Select></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs text-slate-400">Quantity (bags)</Label>
                <Input type="number" value={form.quantity} onChange={e => setForm(p=>({...p,quantity:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="gunny-form-qty" /></div>
              <div><Label className="text-xs text-slate-400">Rate (Rs./bag)</Label>
                <Input type="number" step="0.01" value={form.rate} onChange={e => setForm(p=>({...p,rate:e.target.value}))} placeholder="0 for free" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-rate" /></div>
              <div><Label className="text-xs text-slate-400">Source / To</Label>
                <Input value={form.source} onChange={e => setForm(p=>({...p,source:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-source" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Reference</Label>
                <Input value={form.reference} onChange={e => setForm(p=>({...p,reference:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-ref" /></div>
              <div><Label className="text-xs text-slate-400">Notes</Label>
                <Input value={form.notes} onChange={e => setForm(p=>({...p,notes:e.target.value}))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gunny-form-notes" /></div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-slate-900 flex-1" data-testid="gunny-form-submit">{editingId ? 'Update Entry' : 'Save Entry'}</Button>
              <Button type="button" variant="outline" className="border-slate-600 text-slate-300" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
            </div>
          </form>
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
