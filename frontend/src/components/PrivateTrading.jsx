import { useState, useEffect, useCallback, useMemo } from "react";
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
import {
  Plus, Trash2, RefreshCw, ShoppingCart, Wheat, IndianRupee, Eye, Calculator, Search, FileText, FileSpreadsheet, Download, Calendar, Users, CheckCircle, Undo2, History,
} from "lucide-react";
import { downloadFile } from "../utils/download";
import RoundOffInput from "./common/RoundOffInput";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

const CURRENT_KMS_YEAR = (() => {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
})();

const calcPaddyFields = (f) => {
  const kg = parseFloat(f.kg) || 0;
  const bag = parseInt(f.bag) || 0;
  const gDep = parseFloat(f.g_deposite) || 0;
  const plasticBag = parseInt(f.plastic_bag) || 0;
  const moisture = parseFloat(f.moisture) || 0;
  const cuttingPct = parseFloat(f.cutting_percent) || 0;
  const discDustPoll = parseFloat(f.disc_dust_poll) || 0;
  const rate = parseFloat(f.rate_per_qntl) || 0;
  const qntl = Math.round(kg / 100 * 100) / 100;
  const gbw_cut = gDep > 0 ? Math.round(gDep * 0.5 * 100) / 100 : Math.round(bag * 1 * 100) / 100;
  const mill_w = Math.round((kg - gbw_cut) * 100) / 100;
  const p_pkt_cut = Math.round(plasticBag * 0.5 * 100) / 100;
  const moistureCutPct = moisture > 17 ? Math.round((moisture - 17) * 100) / 100 : 0;
  const moistureCut = Math.round(mill_w * moistureCutPct / 100 * 100) / 100;
  const afterMoisture = mill_w - moistureCut;
  const cutting = Math.round(afterMoisture * cuttingPct / 100 * 100) / 100;
  const final_w = Math.round((afterMoisture - cutting - p_pkt_cut - discDustPoll) * 100) / 100;
  const final_qntl = Math.round(final_w / 100 * 100) / 100;
  const total_amount = Math.round(final_qntl * rate * 100) / 100;
  return { qntl, gbw_cut, mill_w, p_pkt_cut, moistureCutPct, moistureCut, cutting, final_w, final_qntl, total_amount };
};

// ===== Paddy Purchase Sub-Component =====
const PaddyPurchase = ({ filters, user }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [payDialog, setPayDialog] = useState({ open: false, item: null });
  const [payForm, setPayForm] = useState({ date: new Date().toISOString().split('T')[0], amount: "", mode: "cash", reference: "", remark: "" });
  const [searchText, setSearchText] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [historyDialog, setHistoryDialog] = useState({ open: false, item: null, history: [] });
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0], kms_year: CURRENT_KMS_YEAR, season: "Kharif",
    party_name: "", truck_no: "", rst_no: "", agent_name: "", mandi_name: "",
    kg: "", bag: "", rate_per_qntl: "", g_deposite: "", plastic_bag: "", moisture: "",
    cutting_percent: "", disc_dust_poll: "", g_issued: "", cash_paid: "", diesel_paid: "",
    paid_amount: "0", remark: "",
  });

  const calc = useMemo(() => calcPaddyFields(form), [form]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/private-paddy?${p}`);
      setItems(res.data);
    } catch { toast.error("Data load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    if (!searchText) return items;
    const s = searchText.toLowerCase();
    return items.filter(i =>
      (i.party_name || "").toLowerCase().includes(s) ||
      (i.mandi_name || "").toLowerCase().includes(s) ||
      (i.agent_name || "").toLowerCase().includes(s) ||
      (i.truck_no || "").toLowerCase().includes(s)
    );
  }, [items, searchText]);

  const resetForm = () => {
    setForm({ date: new Date().toISOString().split('T')[0], kms_year: filters.kms_year || CURRENT_KMS_YEAR, season: filters.season || "Kharif",
      party_name: "", truck_no: "", rst_no: "", agent_name: "", mandi_name: "",
      kg: "", bag: "", rate_per_qntl: "", g_deposite: "", plastic_bag: "", moisture: "",
      cutting_percent: "", disc_dust_poll: "", g_issued: "", cash_paid: "", diesel_paid: "",
      paid_amount: "0", remark: "" });
    setEditId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.party_name) { toast.error("Party name bharna zaroori hai"); return; }
    if (!parseFloat(form.kg)) { toast.error("KG bharna zaroori hai"); return; }
    try {
      if (editId) {
        await axios.put(`${API}/private-paddy/${editId}`, { ...form, gbw_cut: calc.gbw_cut });
        toast.success("Entry update ho gayi!");
      } else {
        await axios.post(`${API}/private-paddy?username=${user.username}&role=${user.role}`, { ...form, gbw_cut: calc.gbw_cut });
        toast.success("Paddy purchase entry save ho gayi!");
      }
      setDialogOpen(false); resetForm(); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleEdit = (item) => {
    setForm({
      date: item.date, kms_year: item.kms_year, season: item.season,
      party_name: item.party_name, truck_no: item.truck_no || "", rst_no: item.rst_no || "",
      agent_name: item.agent_name || "", mandi_name: item.mandi_name || "",
      kg: item.kg, bag: item.bag, rate_per_qntl: item.rate_per_qntl,
      g_deposite: item.g_deposite || "", plastic_bag: item.plastic_bag || "",
      moisture: item.moisture || "", cutting_percent: item.cutting_percent || "",
      disc_dust_poll: item.disc_dust_poll || "",
      g_issued: item.g_issued || "", cash_paid: item.cash_paid || "", diesel_paid: item.diesel_paid || "",
      paid_amount: item.paid_amount || "0", remark: item.remark || "",
    });
    setEditId(item.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete karna chahte hain?")) return;
    try { await axios.delete(`${API}/private-paddy/${id}`); toast.success("Deleted!"); fetchData(); }
    catch { toast.error("Delete nahi hua"); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`${selectedIds.length} entries delete karna chahte hain?`)) return;
    try {
      await Promise.all(selectedIds.map(id => axios.delete(`${API}/private-paddy/${id}`)));
      toast.success(`${selectedIds.length} entries deleted!`);
      setSelectedIds([]); fetchData();
    } catch { toast.error("Kuch delete nahi hue"); }
  };

  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelectedIds(prev => prev.length === filtered.length ? [] : filtered.map(i => i.id));

  const handlePayment = async (e) => {
    e.preventDefault();
    const amt = parseFloat(payForm.amount);
    if (!amt || amt <= 0) { toast.error("Amount 0 se zyada hona chahiye"); return; }
    try {
      await axios.post(`${API}/private-payments?username=${user.username}&role=${user.role}`, {
        date: payForm.date, party_name: payDialog.item.party_name,
        payment_type: "paid", ref_type: "paddy_purchase", ref_id: payDialog.item.id,
        amount: amt, mode: payForm.mode, reference: payForm.reference, remark: payForm.remark,
        kms_year: payDialog.item.kms_year, season: payDialog.item.season,
        round_off: parseFloat(payForm.round_off) || 0,
      });
      toast.success("Payment save ho gaya!");
      setPayDialog({ open: false, item: null }); setPayForm({ date: new Date().toISOString().split('T')[0], amount: "", mode: "cash", reference: "", remark: "", round_off: "" });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleMarkPaid = async (item) => {
    const bal = Math.round((item.total_amount || 0) - (item.paid_amount || 0));
    if (!window.confirm(`${item.party_name} ko fully paid mark karna chahte hain? Balance Rs.${bal.toLocaleString()} clear hoga.`)) return;
    try {
      await axios.post(`${API}/private-paddy/${item.id}/mark-paid?username=${user.username}&role=${user.role}`);
      toast.success("Mark Paid ho gaya!"); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleUndoPaid = async (item) => {
    if (!window.confirm(`${item.party_name} ka payment undo karna chahte hain? Sab reset ho jayega.`)) return;
    try {
      await axios.post(`${API}/private-paddy/${item.id}/undo-paid?username=${user.username}&role=${user.role}`);
      toast.success("Undo ho gaya!"); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleViewHistory = async (item) => {
    try {
      const res = await axios.get(`${API}/private-paddy/${item.id}/history`);
      setHistoryDialog({ open: true, item, history: res.data.history || [] });
    } catch { toast.error("History load nahi hua"); }
  };

  const totals = useMemo(() => {
    const totalAmt = filtered.reduce((s, i) => s + (i.total_amount || 0), 0);
    const totalPaid = filtered.reduce((s, i) => s + (i.paid_amount || 0), 0);
    const totalQntl = filtered.reduce((s, i) => s + (i.final_qntl || i.quantity_qntl || 0), 0);
    return { totalAmt: Math.round(totalAmt), totalPaid: Math.round(totalPaid), balance: Math.round(totalAmt - totalPaid), totalQntl: Math.round(totalQntl * 100) / 100 };
  }, [filtered]);

  const handleExport = (type) => {
    const p = new URLSearchParams();
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    if (filters.season) p.append('season', filters.season);
    if (searchText) p.append('search', searchText);
    downloadFile(`/api/private-paddy/${type}?${p}`, `pvt_paddy.${type === 'pdf' ? 'pdf' : 'xlsx'}`);
  };

  return (
    <div className="space-y-4" data-testid="paddy-purchase-section">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["Total Entries", filtered.length, "text-white"],
          ["Total Qntl", `${totals.totalQntl} Q`, "text-amber-400"],
          ["Total Amount", `Rs.${totals.totalAmt.toLocaleString()}`, "text-white"],
          ["Paid", `Rs.${totals.totalPaid.toLocaleString()}`, "text-emerald-400"],
          ["Balance", `Rs.${totals.balance.toLocaleString()}`, "text-red-400"],
        ].map(([label, val, color]) => (
          <Card key={label} className="bg-slate-800 border-slate-700">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-slate-400">{label}</p>
              <p className={`text-lg font-bold ${color}`} data-testid={`paddy-summary-${label.toLowerCase().replace(/\s/g,'-')}`}>{val}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="bg-amber-500 hover:bg-amber-600 text-slate-900" size="sm" data-testid="paddy-add-btn">
          <Plus className="w-4 h-4 mr-1" /> Nayi Entry
        </Button>
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300" data-testid="paddy-refresh-btn">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
        <Button onClick={() => handleExport('pdf')} variant="outline" size="sm" className="border-red-700 text-red-400 hover:bg-red-900/30" data-testid="paddy-export-pdf">
          <FileText className="w-4 h-4 mr-1" /> PDF
        </Button>
        <Button onClick={() => handleExport('excel')} variant="outline" size="sm" className="border-green-700 text-green-400 hover:bg-green-900/30" data-testid="paddy-export-excel">
          <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
        </Button>
        <div className="relative ml-auto min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="Party / Mandi / Agent search..."
            className="bg-slate-700 border-slate-600 text-white h-8 text-sm pl-8" data-testid="paddy-search-input" />
        </div>
        {selectedIds.length > 0 && (
          <Button onClick={handleBulkDelete} variant="outline" size="sm" className="border-red-700 text-red-400 hover:bg-red-900/30" data-testid="paddy-bulk-delete">
            <Trash2 className="w-4 h-4 mr-1" /> Delete ({selectedIds.length})
          </Button>
        )}
      </div>

      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-0"><div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="border-slate-700">
              <TableHead className="w-8"><input type="checkbox" checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={toggleAll} className="accent-amber-500" data-testid="paddy-select-all" /></TableHead>
              {['Date', 'Party', 'Mandi', 'Agent', 'Truck', 'KG', 'Final Q', 'Rate/Q', 'Total Rs', 'Paid Rs', 'Balance Rs', 'G.Iss', 'Cash', 'Diesel', ''].map(h =>
                <TableHead key={h} className={`text-slate-300 text-xs whitespace-nowrap ${['KG', 'Final Q', 'Rate/Q', 'Total Rs', 'Paid Rs', 'Balance Rs', 'G.Iss', 'Cash', 'Diesel'].includes(h) ? 'text-right' : ''}`}>{h}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={16} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
              : filtered.length === 0 ? <TableRow><TableCell colSpan={16} className="text-center text-slate-400 py-8">Koi entry nahi mili.</TableCell></TableRow>
              : filtered.map(item => {
                const fq = item.final_qntl || item.quantity_qntl || 0;
                const bal = item.balance != null ? item.balance : (item.total_amount || 0) - (item.paid_amount || 0);
                return (
                <TableRow key={item.id} className={`border-slate-700 ${selectedIds.includes(item.id) ? 'bg-amber-900/20' : ''}`} data-testid={`paddy-row-${item.id}`}>
                  <TableCell><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} className="accent-amber-500" /></TableCell>
                  <TableCell className="text-white text-xs whitespace-nowrap">{fmtDate(item.date)}</TableCell>
                  <TableCell className="text-white font-semibold text-sm">{item.party_name}</TableCell>
                  <TableCell className="text-cyan-400 text-xs">{item.mandi_name || '-'}</TableCell>
                  <TableCell className="text-purple-400 text-xs">{item.agent_name || '-'}</TableCell>
                  <TableCell className="text-slate-300 text-xs">{item.truck_no || '-'}</TableCell>
                  <TableCell className="text-right text-slate-300 text-xs">{item.kg || '-'}</TableCell>
                  <TableCell className="text-right text-amber-400 font-semibold text-sm">{fq} Q</TableCell>
                  <TableCell className="text-right text-slate-300 text-xs">Rs.{item.rate_per_qntl}</TableCell>
                  <TableCell className="text-right text-white font-semibold text-sm">Rs.{(item.total_amount || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-emerald-400 text-sm">Rs.{(item.paid_amount || 0).toLocaleString()}</TableCell>
                  <TableCell className={`text-right font-semibold text-sm ${bal > 0 ? 'text-red-400' : 'text-emerald-400'}`} data-testid={`paddy-balance-${item.id}`}>
                    <div className="flex flex-col items-end">
                      <span>Rs.{Math.round(bal).toLocaleString()}</span>
                      {item.payment_status === 'paid' && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full mt-0.5 font-bold">PAID</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-blue-300 text-xs">{item.g_issued || '-'}</TableCell>
                  <TableCell className="text-right text-emerald-300 text-xs">{item.cash_paid ? `Rs.${item.cash_paid.toLocaleString()}` : '-'}</TableCell>
                  <TableCell className="text-right text-orange-300 text-xs">{item.diesel_paid ? `Rs.${item.diesel_paid.toLocaleString()}` : '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {item.payment_status !== 'paid' && (
                        <>
                          <Button variant="ghost" size="sm" className="h-6 px-1 text-emerald-400" onClick={() => { setPayDialog({ open: true, item }); setPayForm({ ...payForm, date: new Date().toISOString().split('T')[0] }); }} data-testid={`paddy-pay-${item.id}`} title="Payment">
                            <IndianRupee className="w-3 h-3" />
                          </Button>
                          {user.role === 'admin' && (
                            <Button variant="ghost" size="sm" className="h-6 px-1 text-amber-400" onClick={() => handleMarkPaid(item)} data-testid={`paddy-markpaid-${item.id}`} title="Mark Paid">
                              <CheckCircle className="w-3 h-3" />
                            </Button>
                          )}
                        </>
                      )}
                      {item.payment_status === 'paid' && user.role === 'admin' && (
                        <Button variant="ghost" size="sm" className="h-6 px-1 text-red-400" onClick={() => handleUndoPaid(item)} data-testid={`paddy-undo-${item.id}`} title="Undo Paid">
                          <Undo2 className="w-3 h-3" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-6 px-1 text-purple-400" onClick={() => handleViewHistory(item)} data-testid={`paddy-history-${item.id}`} title="Payment History">
                        <History className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 px-1 text-blue-400" onClick={() => handleEdit(item)} data-testid={`paddy-edit-${item.id}`} title="Edit">
                        <Eye className="w-3 h-3" />
                      </Button>
                      {user.role === 'admin' && (
                        <Button variant="ghost" size="sm" className="h-6 px-1 text-red-400" onClick={() => handleDelete(item.id)} data-testid={`paddy-del-${item.id}`} title="Delete">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>
        </div></CardContent>
      </Card>

      {/* Add/Edit Paddy Purchase Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="paddy-form-dialog">
          <DialogHeader><DialogTitle className="text-amber-400">{editId ? "Entry Edit" : "Nayi Paddy Purchase Entry"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-slate-300 text-xs">Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pvt-paddy-date" />
              </div>
              <div>
                <Label className="text-slate-300 text-xs">Party Name *</Label>
                <Input value={form.party_name} onChange={e => setForm(p => ({ ...p, party_name: e.target.value }))} placeholder="Party name" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="pvt-paddy-party" />
              </div>
              <div>
                <Label className="text-slate-300 text-xs">Truck No.</Label>
                <Input value={form.truck_no} onChange={e => setForm(p => ({ ...p, truck_no: e.target.value }))} placeholder="OD00XX0000" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pvt-paddy-truck" />
              </div>
              <div>
                <Label className="text-slate-300 text-xs">RST No.</Label>
                <Input value={form.rst_no} onChange={e => setForm(p => ({ ...p, rst_no: e.target.value }))} placeholder="RST Number" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pvt-paddy-rst" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-slate-300 text-xs">Agent Name</Label>
                <Input value={form.agent_name} onChange={e => setForm(p => ({ ...p, agent_name: e.target.value }))} placeholder="Agent" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pvt-paddy-agent" />
              </div>
              <div>
                <Label className="text-slate-300 text-xs">Mandi Name</Label>
                <Input value={form.mandi_name} onChange={e => setForm(p => ({ ...p, mandi_name: e.target.value }))} placeholder="Mandi" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pvt-paddy-mandi" />
              </div>
              <div>
                <Label className="text-amber-400 text-xs font-semibold">Rate / Qntl (Rs.) *</Label>
                <Input type="number" step="0.01" value={form.rate_per_qntl} onChange={e => setForm(p => ({ ...p, rate_per_qntl: e.target.value }))} placeholder="Rs. per quintal" className="bg-amber-900/30 border-amber-700 text-amber-400 h-8 text-sm font-semibold" data-testid="pvt-paddy-rate" />
              </div>
            </div>
            <Card className="bg-slate-700/50 border-slate-600">
              <CardHeader className="pb-1 pt-2 px-3">
                <CardTitle className="text-amber-400 text-sm flex items-center gap-2"><Calculator className="w-4 h-4" /> Weight & Auto Calculations</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 px-3 pb-3">
                <div>
                  <Label className="text-slate-300 text-xs">KG *</Label>
                  <Input type="number" value={form.kg} onChange={e => setForm(p => ({ ...p, kg: e.target.value }))} placeholder="KG" className="bg-slate-600 border-slate-500 text-white h-8 text-sm font-semibold" required data-testid="pvt-paddy-kg" />
                </div>
                <div>
                  <Label className="text-green-400 text-xs font-semibold">QNTL (Auto)</Label>
                  <Input value={calc.qntl} readOnly className="bg-green-900/30 border-green-700 text-green-400 h-8 text-sm font-bold" />
                </div>
                <div>
                  <Label className="text-slate-300 text-xs">BAG</Label>
                  <Input type="number" value={form.bag} onChange={e => setForm(p => ({ ...p, bag: e.target.value }))} className="bg-slate-600 border-slate-500 text-white h-8 text-sm" data-testid="pvt-paddy-bag" />
                </div>
                <div>
                  <Label className="text-cyan-400 text-xs">G.Deposite</Label>
                  <Input type="number" value={form.g_deposite} onChange={e => setForm(p => ({ ...p, g_deposite: e.target.value }))} className="bg-cyan-900/30 border-cyan-700 text-cyan-400 h-8 text-sm" data-testid="pvt-paddy-gdep" />
                </div>
                <div>
                  <Label className="text-orange-400 text-xs">GBW Cut (Auto)</Label>
                  <Input value={calc.gbw_cut} readOnly className="bg-orange-900/30 border-orange-700 text-orange-400 h-8 text-sm font-bold" />
                </div>
                <div>
                  <Label className="text-blue-400 text-xs font-semibold">Mill W. (Auto)</Label>
                  <Input value={calc.mill_w} readOnly className="bg-blue-900/30 border-blue-700 text-blue-400 h-8 text-sm font-bold" />
                </div>
                <div>
                  <Label className="text-pink-400 text-xs">P.Pkt (Plastic)</Label>
                  <Input type="number" value={form.plastic_bag} onChange={e => setForm(p => ({ ...p, plastic_bag: e.target.value }))} className="bg-pink-900/30 border-pink-700 text-pink-400 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-pink-400 text-xs">P.Pkt Cut (Auto)</Label>
                  <Input value={calc.p_pkt_cut} readOnly className="bg-pink-900/30 border-pink-700 text-pink-400 h-8 text-sm font-bold" />
                </div>
                <div>
                  <Label className="text-purple-400 text-xs">Cutting %</Label>
                  <Input type="number" step="0.01" value={form.cutting_percent} onChange={e => setForm(p => ({ ...p, cutting_percent: e.target.value }))} className="bg-purple-900/30 border-purple-700 text-purple-400 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-purple-400 text-xs">Cutting (Auto)</Label>
                  <Input value={calc.cutting} readOnly className="bg-purple-900/30 border-purple-700 text-purple-400 h-8 text-sm font-bold" />
                </div>
                <div>
                  <Label className="text-yellow-400 text-xs">Moisture %</Label>
                  <Input type="number" step="0.1" value={form.moisture} onChange={e => setForm(p => ({ ...p, moisture: e.target.value }))} className="bg-yellow-900/30 border-yellow-700 text-yellow-400 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-yellow-400 text-xs">Moisture Cut (Auto)</Label>
                  <Input value={`${calc.moistureCut} (${calc.moistureCutPct}%)`} readOnly className="bg-yellow-900/30 border-yellow-700 text-yellow-400 h-8 text-sm font-bold" />
                </div>
                <div>
                  <Label className="text-slate-300 text-xs">Disc/Dust/Poll</Label>
                  <Input type="number" value={form.disc_dust_poll} onChange={e => setForm(p => ({ ...p, disc_dust_poll: e.target.value }))} className="bg-slate-600 border-slate-500 text-white h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-amber-400 text-xs font-semibold">Final W. (Auto)</Label>
                  <Input value={`${calc.final_w} KG = ${calc.final_qntl} Q`} readOnly className="bg-amber-900/30 border-amber-700 text-amber-400 h-8 text-sm font-bold" />
                </div>
                <div>
                  <Label className="text-blue-400 text-xs font-semibold">G.Issued (Gunny)</Label>
                  <Input type="number" value={form.g_issued} onChange={e => setForm(p => ({ ...p, g_issued: e.target.value }))} placeholder="0" className="bg-blue-900/30 border-blue-700 text-blue-400 h-8 text-sm" data-testid="pvt-paddy-g-issued" />
                </div>
                <div className="col-span-2">
                  <Label className="text-emerald-400 text-xs font-semibold">Total Amount (Auto)</Label>
                  <Input value={`Rs.${calc.total_amount.toLocaleString()} (${calc.final_qntl}Q x Rs.${parseFloat(form.rate_per_qntl) || 0}/Q)`} readOnly className="bg-emerald-900/30 border-emerald-700 text-emerald-400 h-8 text-lg font-bold" />
                </div>
              </CardContent>
            </Card>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-emerald-400 text-xs font-semibold">Cash Paid (Rs.)</Label>
                <Input type="number" value={form.cash_paid} onChange={e => setForm(p => ({ ...p, cash_paid: e.target.value }))} placeholder="0" className="bg-emerald-900/30 border-emerald-700 text-emerald-400 h-8 text-sm" data-testid="pvt-paddy-cash-paid" />
              </div>
              <div>
                <Label className="text-orange-400 text-xs font-semibold">Diesel Paid (Rs.)</Label>
                <Input type="number" value={form.diesel_paid} onChange={e => setForm(p => ({ ...p, diesel_paid: e.target.value }))} placeholder="0" className="bg-orange-900/30 border-orange-700 text-orange-400 h-8 text-sm" data-testid="pvt-paddy-diesel-paid" />
              </div>
              <div>
                <Label className="text-slate-300 text-xs">Advance Paid (Rs.)</Label>
                <Input type="number" value={form.paid_amount} onChange={e => setForm(p => ({ ...p, paid_amount: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pvt-paddy-paid" />
              </div>
              <div>
                <Label className="text-slate-300 text-xs">Remark</Label>
                <Input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pvt-paddy-remark" />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-slate-600 text-slate-300">Cancel</Button>
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold" data-testid="pvt-paddy-submit">{editId ? "Update" : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={payDialog.open} onOpenChange={(o) => setPayDialog({ open: o, item: payDialog.item })}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-sm" data-testid="paddy-pay-dialog">
          <DialogHeader><DialogTitle className="text-emerald-400">Payment - {payDialog.item?.party_name}</DialogTitle></DialogHeader>
          {payDialog.item && (
            <div className="text-xs text-slate-400 mb-2">
              Total: Rs.{payDialog.item.total_amount?.toLocaleString()} | Paid: Rs.{payDialog.item.paid_amount?.toLocaleString()} | <span className="text-red-400">Balance: Rs.{((payDialog.item.total_amount || 0) - (payDialog.item.paid_amount || 0)).toLocaleString()}</span>
            </div>
          )}
          <form onSubmit={handlePayment} className="space-y-3">
            <div><Label className="text-xs text-slate-400">Date</Label><Input type="date" value={payForm.date} onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
            <div><Label className="text-xs text-slate-400">Amount (Rs.)</Label><Input type="number" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="paddy-pay-amount" /></div>
            <div><Label className="text-xs text-slate-400">Mode</Label>
              <Select value={payForm.mode} onValueChange={v => setPayForm(p => ({ ...p, mode: v }))}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="bank">Bank</SelectItem><SelectItem value="cheque">Cheque</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs text-slate-400">Reference</Label><Input value={payForm.reference} onChange={e => setPayForm(p => ({ ...p, reference: e.target.value }))} placeholder="Cheque no / UTR" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
            <RoundOffInput
              value={payForm.round_off || ""}
              onChange={(val) => setPayForm(p => ({ ...p, round_off: val }))}
              amount={parseFloat(payForm.amount) || 0}
            />
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setPayDialog({ open: false, item: null })} className="border-slate-600 text-slate-300 flex-1">Cancel</Button>
              <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white flex-1" data-testid="paddy-pay-submit">Pay</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment History Dialog */}
      <Dialog open={historyDialog.open} onOpenChange={(o) => setHistoryDialog(prev => ({ ...prev, open: o }))}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg" data-testid="paddy-history-dialog">
          <DialogHeader><DialogTitle className="text-purple-400 flex items-center gap-2"><History className="w-5 h-5" /> Payment History - {historyDialog.item?.party_name}</DialogTitle></DialogHeader>
          {historyDialog.item && (
            <div className="text-xs text-slate-400 mb-3 flex gap-4">
              <span>Total: <span className="text-white font-semibold">Rs.{historyDialog.item.total_amount?.toLocaleString()}</span></span>
              <span>Paid: <span className="text-emerald-400 font-semibold">Rs.{historyDialog.item.paid_amount?.toLocaleString()}</span></span>
              <span>Status: <span className={`font-semibold ${historyDialog.item.payment_status === 'paid' ? 'text-emerald-400' : 'text-amber-400'}`}>{historyDialog.item.payment_status === 'paid' ? 'PAID' : 'PENDING'}</span></span>
            </div>
          )}
          {historyDialog.history.length === 0 ? (
            <p className="text-slate-500 text-center py-6">Koi payment history nahi hai</p>
          ) : (
            <div className="overflow-y-auto max-h-[350px] space-y-2">
              {historyDialog.history.map((h, i) => (
                <Card key={h.id || i} className="bg-slate-700/50 border-slate-600">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">Rs.{h.amount?.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-400">{fmtDate(h.date)} | {h.mode || 'cash'} {h.reference ? `| ${h.reference}` : ''}</p>
                      {h.remark && <p className="text-[10px] text-slate-500 italic">{h.remark}</p>}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${h.payment_type === 'paid' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                      {h.payment_type || 'paid'}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ===== Rice Sale Sub-Component =====
const RiceSale = ({ filters, user }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [payDialog, setPayDialog] = useState({ open: false, item: null });
  const [payForm, setPayForm] = useState({ date: new Date().toISOString().split('T')[0], amount: "", mode: "cash", reference: "", remark: "" });
  const [searchText, setSearchText] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [historyDialog, setHistoryDialog] = useState({ open: false, item: null, history: [] });
  const [riceStockByType, setRiceStockByType] = useState({ usna: null, raw: null });
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0], kms_year: CURRENT_KMS_YEAR, season: "Kharif",
    party_name: "", rice_type: "Usna", rst_no: "", quantity_qntl: "", rate_per_qntl: "", bags: "", truck_no: "",
    cash_paid: "", diesel_paid: "", paid_amount: "0", remark: "",
  });

  const riceTotal = useMemo(() => {
    const qty = parseFloat(form.quantity_qntl) || 0;
    const rate = parseFloat(form.rate_per_qntl) || 0;
    return Math.round(qty * rate * 100) / 100;
  }, [form.quantity_qntl, form.rate_per_qntl]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/rice-sales?${p}`);
      setItems(res.data);
      // Fetch rice stock by type
      try {
        const stockRes = await axios.get(`${API}/rice-stock?${p}`);
        setRiceStockByType({
          usna: stockRes.data.parboiled_available_qntl,
          raw: stockRes.data.raw_available_qntl,
        });
      } catch { setRiceStockByType({ usna: null, raw: null }); }
    } catch { toast.error("Data load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    if (!searchText) return items;
    const s = searchText.toLowerCase();
    return items.filter(i =>
      (i.party_name || "").toLowerCase().includes(s) ||
      (i.truck_no || "").toLowerCase().includes(s) ||
      (i.rice_type || "").toLowerCase().includes(s) ||
      (i.rst_no || "").toLowerCase().includes(s)
    );
  }, [items, searchText]);

  const resetForm = () => {
    setForm({ date: new Date().toISOString().split('T')[0], kms_year: filters.kms_year || CURRENT_KMS_YEAR, season: filters.season || "Kharif",
      party_name: "", rice_type: "Usna", rst_no: "", quantity_qntl: "", rate_per_qntl: "", bags: "", truck_no: "",
      cash_paid: "", diesel_paid: "", paid_amount: "0", remark: "" });
    setEditId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.party_name) { toast.error("Party name bharna zaroori hai"); return; }
    if (!parseFloat(form.quantity_qntl)) { toast.error("Quantity bharna zaroori hai"); return; }
    try {
      if (editId) {
        await axios.put(`${API}/rice-sales/${editId}`, form);
        toast.success("Entry update ho gayi!");
      } else {
        await axios.post(`${API}/rice-sales?username=${user.username}&role=${user.role}`, form);
        toast.success("Rice sale entry save ho gayi!");
      }
      setDialogOpen(false); resetForm(); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleEdit = (item) => {
    setForm({
      date: item.date, kms_year: item.kms_year, season: item.season,
      party_name: item.party_name, rice_type: item.rice_type || "Usna",
      rst_no: item.rst_no || "",
      quantity_qntl: item.quantity_qntl, rate_per_qntl: item.rate_per_qntl,
      bags: item.bags || "", truck_no: item.truck_no || "",
      cash_paid: item.cash_paid || "", diesel_paid: item.diesel_paid || "",
      paid_amount: item.paid_amount || "0", remark: item.remark || "",
    });
    setEditId(item.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete karna chahte hain?")) return;
    try { await axios.delete(`${API}/rice-sales/${id}`); toast.success("Deleted!"); fetchData(); }
    catch { toast.error("Delete nahi hua"); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`${selectedIds.length} entries delete karna chahte hain?`)) return;
    try {
      await Promise.all(selectedIds.map(id => axios.delete(`${API}/rice-sales/${id}`)));
      toast.success(`${selectedIds.length} entries deleted!`);
      setSelectedIds([]); fetchData();
    } catch { toast.error("Kuch delete nahi hue"); }
  };

  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelectedIds(prev => prev.length === filtered.length ? [] : filtered.map(i => i.id));

  const handlePayment = async (e) => {
    e.preventDefault();
    const amt = parseFloat(payForm.amount);
    if (!amt || amt <= 0) { toast.error("Amount 0 se zyada hona chahiye"); return; }
    try {
      await axios.post(`${API}/private-payments?username=${user.username}&role=${user.role}`, {
        date: payForm.date, party_name: payDialog.item.party_name,
        payment_type: "received", ref_type: "rice_sale", ref_id: payDialog.item.id,
        amount: amt, mode: payForm.mode, reference: payForm.reference, remark: payForm.remark,
        kms_year: payDialog.item.kms_year, season: payDialog.item.season,
        round_off: parseFloat(payForm.round_off) || 0,
      });
      toast.success("Payment received!");
      setPayDialog({ open: false, item: null }); setPayForm({ date: new Date().toISOString().split('T')[0], amount: "", mode: "cash", reference: "", remark: "", round_off: "" });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleMarkPaid = async (item) => {
    const bal = Math.round((item.total_amount || 0) - (item.paid_amount || 0));
    if (!window.confirm(`${item.party_name} ko fully paid mark karna chahte hain? Balance Rs.${bal.toLocaleString()} clear hoga.`)) return;
    try {
      await axios.post(`${API}/rice-sales/${item.id}/mark-paid?username=${user.username}&role=${user.role}`);
      toast.success("Mark Paid ho gaya!"); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleUndoPaid = async (item) => {
    if (!window.confirm(`${item.party_name} ka payment undo karna chahte hain? Sab reset ho jayega.`)) return;
    try {
      await axios.post(`${API}/rice-sales/${item.id}/undo-paid?username=${user.username}&role=${user.role}`);
      toast.success("Undo ho gaya!"); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleViewHistory = async (item) => {
    try {
      const res = await axios.get(`${API}/rice-sales/${item.id}/history`);
      setHistoryDialog({ open: true, item, history: res.data.history || [] });
    } catch { toast.error("History load nahi hua"); }
  };

  const totals = useMemo(() => {
    const totalAmt = filtered.reduce((s, i) => s + (i.total_amount || 0), 0);
    const totalPaid = filtered.reduce((s, i) => s + (i.paid_amount || 0), 0);
    const totalQntl = filtered.reduce((s, i) => s + (i.quantity_qntl || 0), 0);
    return { totalAmt: Math.round(totalAmt), totalPaid: Math.round(totalPaid), balance: Math.round(totalAmt - totalPaid), totalQntl: Math.round(totalQntl * 100) / 100 };
  }, [filtered]);

  const handleExport = (type) => {
    const p = new URLSearchParams();
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    if (filters.season) p.append('season', filters.season);
    if (searchText) p.append('search', searchText);
    downloadFile(`/api/rice-sales/${type}?${p}`, `rice_sales.${type === 'pdf' ? 'pdf' : 'xlsx'}`);
  };

  return (
    <div className="space-y-4" data-testid="rice-sale-section">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["Total Entries", filtered.length, "text-white"],
          ["Total Qntl", `${totals.totalQntl} Q`, "text-amber-400"],
          ["Total Amount", `Rs.${totals.totalAmt.toLocaleString()}`, "text-white"],
          ["Received", `Rs.${totals.totalPaid.toLocaleString()}`, "text-emerald-400"],
          ["Balance", `Rs.${totals.balance.toLocaleString()}`, "text-red-400"],
        ].map(([label, val, color]) => (
          <Card key={label} className="bg-slate-800 border-slate-700">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-slate-400">{label}</p>
              <p className={`text-lg font-bold ${color}`} data-testid={`rice-summary-${label.toLowerCase().replace(/\s/g,'-')}`}>{val}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="bg-emerald-500 hover:bg-emerald-600 text-white" size="sm" data-testid="rice-add-btn">
          <Plus className="w-4 h-4 mr-1" /> Nayi Sale Entry
        </Button>
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300" data-testid="rice-refresh-btn">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
        <Button onClick={() => handleExport('pdf')} variant="outline" size="sm" className="border-red-700 text-red-400 hover:bg-red-900/30" data-testid="rice-export-pdf">
          <FileText className="w-4 h-4 mr-1" /> PDF
        </Button>
        <Button onClick={() => handleExport('excel')} variant="outline" size="sm" className="border-green-700 text-green-400 hover:bg-green-900/30" data-testid="rice-export-excel">
          <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
        </Button>
        <div className="relative ml-auto min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="Party / RST / Type search..."
            className="bg-slate-700 border-slate-600 text-white h-8 text-sm pl-8" data-testid="rice-search-input" />
        </div>
        {selectedIds.length > 0 && (
          <Button onClick={handleBulkDelete} variant="outline" size="sm" className="border-red-700 text-red-400 hover:bg-red-900/30" data-testid="rice-bulk-delete">
            <Trash2 className="w-4 h-4 mr-1" /> Delete ({selectedIds.length})
          </Button>
        )}
      </div>

      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-0"><div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="border-slate-700">
              <TableHead className="w-8"><input type="checkbox" checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={toggleAll} className="accent-emerald-500" data-testid="rice-select-all" /></TableHead>
              {['Date', 'Party', 'RST No', 'Type', 'Qntl', 'Rate/Q', 'Total Rs', 'Received Rs', 'Balance Rs', 'Truck', 'Cash', 'Diesel', ''].map(h =>
                <TableHead key={h} className={`text-slate-300 text-xs whitespace-nowrap ${['Qntl', 'Rate/Q', 'Total Rs', 'Received Rs', 'Balance Rs', 'Cash', 'Diesel'].includes(h) ? 'text-right' : ''}`}>{h}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={11} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
              : filtered.length === 0 ? <TableRow><TableCell colSpan={11} className="text-center text-slate-400 py-8">Koi sale nahi mili.</TableCell></TableRow>
              : filtered.map(item => {
                const bal = item.balance != null ? item.balance : (item.total_amount || 0) - (item.paid_amount || 0);
                return (
                <TableRow key={item.id} className={`border-slate-700 ${selectedIds.includes(item.id) ? 'bg-emerald-900/20' : ''}`} data-testid={`rice-row-${item.id}`}>
                  <TableCell><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} className="accent-emerald-500" /></TableCell>
                  <TableCell className="text-white text-xs whitespace-nowrap">{fmtDate(item.date)}</TableCell>
                  <TableCell className="text-white font-semibold text-sm">{item.party_name}</TableCell>
                  <TableCell className="text-sky-400 text-xs font-medium">{item.rst_no || '-'}</TableCell>
                  <TableCell><span className={`px-2.5 py-1 rounded-md text-xs font-bold tracking-wide ${item.rice_type === 'Usna' ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40' : item.rice_type === 'Raw' ? 'bg-sky-500/25 text-sky-300 border border-sky-500/40' : 'bg-violet-500/25 text-violet-300 border border-violet-500/40'}`}>{item.rice_type}</span></TableCell>
                  <TableCell className="text-right text-amber-400 font-semibold text-sm">{item.quantity_qntl} Q</TableCell>
                  <TableCell className="text-right text-slate-300 text-xs">Rs.{item.rate_per_qntl}</TableCell>
                  <TableCell className="text-right text-white font-semibold text-sm">Rs.{(item.total_amount || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-emerald-400 text-sm">Rs.{(item.paid_amount || 0).toLocaleString()}</TableCell>
                  <TableCell className={`text-right font-semibold text-sm ${bal > 0 ? 'text-red-400' : 'text-emerald-400'}`} data-testid={`rice-balance-${item.id}`}>
                    <div className="flex flex-col items-end">
                      <span>Rs.{Math.round(bal).toLocaleString()}</span>
                      {item.payment_status === 'paid' && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full mt-0.5 font-bold">PAID</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-300 text-xs">{item.truck_no || '-'}</TableCell>
                  <TableCell className="text-right text-emerald-300 text-xs">{item.cash_paid ? `Rs.${item.cash_paid.toLocaleString()}` : '-'}</TableCell>
                  <TableCell className="text-right text-orange-300 text-xs">{item.diesel_paid ? `Rs.${item.diesel_paid.toLocaleString()}` : '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {item.payment_status !== 'paid' && (
                        <>
                          <Button variant="ghost" size="sm" className="h-6 px-1 text-emerald-400" onClick={() => { setPayDialog({ open: true, item }); setPayForm({ ...payForm, date: new Date().toISOString().split('T')[0] }); }} data-testid={`rice-pay-${item.id}`} title="Payment">
                            <IndianRupee className="w-3 h-3" />
                          </Button>
                          {user.role === 'admin' && (
                            <Button variant="ghost" size="sm" className="h-6 px-1 text-amber-400" onClick={() => handleMarkPaid(item)} data-testid={`rice-markpaid-${item.id}`} title="Mark Paid">
                              <CheckCircle className="w-3 h-3" />
                            </Button>
                          )}
                        </>
                      )}
                      {item.payment_status === 'paid' && user.role === 'admin' && (
                        <Button variant="ghost" size="sm" className="h-6 px-1 text-red-400" onClick={() => handleUndoPaid(item)} data-testid={`rice-undo-${item.id}`} title="Undo Paid">
                          <Undo2 className="w-3 h-3" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-6 px-1 text-purple-400" onClick={() => handleViewHistory(item)} data-testid={`rice-history-${item.id}`} title="Payment History">
                        <History className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 px-1 text-blue-400" onClick={() => handleEdit(item)} data-testid={`rice-edit-${item.id}`} title="Edit">
                        <Eye className="w-3 h-3" />
                      </Button>
                      {user.role === 'admin' && (
                        <Button variant="ghost" size="sm" className="h-6 px-1 text-red-400" onClick={() => handleDelete(item.id)} data-testid={`rice-del-${item.id}`} title="Delete">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>
        </div></CardContent>
      </Card>

      {/* Add/Edit Rice Sale Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg" data-testid="rice-form-dialog">
          <DialogHeader><DialogTitle className="text-emerald-400">{editId ? "Sale Edit" : "Nayi Rice Sale"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="rice-form-date" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Party Name *</Label>
                <Input value={form.party_name} onChange={e => setForm(p => ({ ...p, party_name: e.target.value }))} placeholder="Buyer name" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="rice-form-party" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">RST No.</Label>
                <Input value={form.rst_no} onChange={e => setForm(p => ({ ...p, rst_no: e.target.value }))} placeholder="RST Number" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="rice-form-rst" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Rice Type</Label>
                <Select value={form.rice_type} onValueChange={v => setForm(p => ({ ...p, rice_type: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="rice-form-type"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Usna">Usna</SelectItem><SelectItem value="Raw">Raw</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                {(() => {
                  const currentStock = form.rice_type === 'Raw' ? riceStockByType.raw : riceStockByType.usna;
                  const remaining = currentStock !== null ? Math.round((currentStock - (parseFloat(form.quantity_qntl) || 0)) * 100) / 100 : null;
                  return (
                    <Label className="text-xs text-slate-400">Quantity (Qntl) * {remaining !== null && <span className={`ml-1 font-bold ${remaining > 0 ? 'text-emerald-400' : 'text-red-400'}`}>(Stock {form.rice_type}: {remaining} Q)</span>}</Label>
                  );
                })()}
                <Input type="number" step="0.01" value={form.quantity_qntl} onChange={e => setForm(p => ({ ...p, quantity_qntl: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="rice-form-qty" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Rate / Qntl (Rs.) *</Label>
                <Input type="number" step="0.01" value={form.rate_per_qntl} onChange={e => setForm(p => ({ ...p, rate_per_qntl: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="rice-form-rate" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Bags</Label>
                <Input type="number" value={form.bags} onChange={e => setForm(p => ({ ...p, bags: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="rice-form-bags" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Truck No.</Label>
                <Input value={form.truck_no} onChange={e => setForm(p => ({ ...p, truck_no: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="rice-form-truck" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Advance Received (Rs.)</Label>
                <Input type="number" value={form.paid_amount} onChange={e => setForm(p => ({ ...p, paid_amount: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="rice-form-paid" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Cash Paid (Rs.)</Label>
                <Input type="number" value={form.cash_paid} onChange={e => setForm(p => ({ ...p, cash_paid: e.target.value }))} placeholder="0" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="rice-form-cash" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Diesel Paid (Rs.)</Label>
                <Input type="number" value={form.diesel_paid} onChange={e => setForm(p => ({ ...p, diesel_paid: e.target.value }))} placeholder="0" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="rice-form-diesel" />
              </div>
            </div>
            <div>
              <Label className="text-emerald-400 text-sm font-bold">Total: Rs.{riceTotal.toLocaleString()}</Label>
            </div>
            <div>
              <Label className="text-xs text-slate-400">Remark</Label>
              <Input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-slate-600 text-slate-300">Cancel</Button>
              <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold" data-testid="rice-form-submit">{editId ? "Update" : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={payDialog.open} onOpenChange={(o) => setPayDialog({ open: o, item: payDialog.item })}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-sm" data-testid="rice-pay-dialog">
          <DialogHeader><DialogTitle className="text-emerald-400">Payment Received - {payDialog.item?.party_name}</DialogTitle></DialogHeader>
          {payDialog.item && (
            <div className="text-xs text-slate-400 mb-2">
              Total: Rs.{payDialog.item.total_amount?.toLocaleString()} | Received: Rs.{payDialog.item.paid_amount?.toLocaleString()} | <span className="text-red-400">Balance: Rs.{((payDialog.item.total_amount || 0) - (payDialog.item.paid_amount || 0)).toLocaleString()}</span>
            </div>
          )}
          <form onSubmit={handlePayment} className="space-y-3">
            <div><Label className="text-xs text-slate-400">Date</Label><Input type="date" value={payForm.date} onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
            <div><Label className="text-xs text-slate-400">Amount (Rs.)</Label><Input type="number" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="rice-pay-amount" /></div>
            <div><Label className="text-xs text-slate-400">Mode</Label>
              <Select value={payForm.mode} onValueChange={v => setPayForm(p => ({ ...p, mode: v }))}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="bank">Bank</SelectItem><SelectItem value="cheque">Cheque</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs text-slate-400">Reference</Label><Input value={payForm.reference} onChange={e => setPayForm(p => ({ ...p, reference: e.target.value }))} placeholder="Cheque no / UTR" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
            <RoundOffInput
              value={payForm.round_off || ""}
              onChange={(val) => setPayForm(p => ({ ...p, round_off: val }))}
              amount={parseFloat(payForm.amount) || 0}
            />
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setPayDialog({ open: false, item: null })} className="border-slate-600 text-slate-300 flex-1">Cancel</Button>
              <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white flex-1" data-testid="rice-pay-submit">Receive</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment History Dialog */}
      <Dialog open={historyDialog.open} onOpenChange={(o) => setHistoryDialog(prev => ({ ...prev, open: o }))}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg" data-testid="rice-history-dialog">
          <DialogHeader><DialogTitle className="text-purple-400 flex items-center gap-2"><History className="w-5 h-5" /> Payment History - {historyDialog.item?.party_name}</DialogTitle></DialogHeader>
          {historyDialog.item && (
            <div className="text-xs text-slate-400 mb-3 flex gap-4">
              <span>Total: <span className="text-white font-semibold">Rs.{historyDialog.item.total_amount?.toLocaleString()}</span></span>
              <span>Received: <span className="text-emerald-400 font-semibold">Rs.{historyDialog.item.paid_amount?.toLocaleString()}</span></span>
              <span>Status: <span className={`font-semibold ${historyDialog.item.payment_status === 'paid' ? 'text-emerald-400' : 'text-amber-400'}`}>{historyDialog.item.payment_status === 'paid' ? 'PAID' : 'PENDING'}</span></span>
            </div>
          )}
          {historyDialog.history.length === 0 ? (
            <p className="text-slate-500 text-center py-6">Koi payment history nahi hai</p>
          ) : (
            <div className="overflow-y-auto max-h-[350px] space-y-2">
              {historyDialog.history.map((h, i) => (
                <Card key={h.id || i} className="bg-slate-700/50 border-slate-600">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">Rs.{h.amount?.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-400">{fmtDate(h.date)} | {h.mode || 'cash'} {h.reference ? `| ${h.reference}` : ''}</p>
                      {h.remark && <p className="text-[10px] text-slate-500 italic">{h.remark}</p>}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${h.payment_type === 'received' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                      {h.payment_type || 'received'}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};


// ===== Party Summary Sub-Component =====
const PartySummary = ({ filters, onNavigate }) => {
  const [data, setData] = useState({ parties: [], totals: {} });
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewType, setViewType] = useState("all");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      if (dateFrom) p.append('date_from', dateFrom);
      if (dateTo) p.append('date_to', dateTo);
      if (searchText) p.append('search', searchText);
      const res = await axios.get(`${API}/private-trading/party-summary?${p}`);
      setData(res.data);
    } catch { toast.error("Data load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season, dateFrom, dateTo, searchText]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleExport = (type) => {
    const p = new URLSearchParams();
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    if (filters.season) p.append('season', filters.season);
    if (dateFrom) p.append('date_from', dateFrom);
    if (dateTo) p.append('date_to', dateTo);
    if (searchText) p.append('search', searchText);
    if (viewType && viewType !== "all") p.append('view_type', viewType);
    downloadFile(`/api/private-trading/party-summary/${type}?${p}`, `party_summary.${type === 'pdf' ? 'pdf' : 'xlsx'}`);
  };

  const t = data.totals;

  return (
    <div className="space-y-4" data-testid="party-summary-section">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["Parties", data.parties.length, "text-white"],
          ["Purchase Bal", `Rs.${(t.total_purchase_balance || 0).toLocaleString()}`, "text-red-400"],
          ["Sale Bal", `Rs.${(t.total_sale_balance || 0).toLocaleString()}`, "text-cyan-400"],
          ["Net Balance", `Rs.${(t.total_net_balance || 0).toLocaleString()}`, (t.total_net_balance || 0) > 0 ? "text-red-400" : "text-emerald-400"],
          ["Total Purchase", `Rs.${(t.total_purchase || 0).toLocaleString()}`, "text-amber-400"],
        ].map(([label, val, color]) => (
          <Card key={label} className="bg-slate-800 border-slate-700">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-slate-400">{label}</p>
              <p className={`text-lg font-bold ${color}`} data-testid={`summary-${label.toLowerCase().replace(/\s/g,'-')}`}>{val}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={viewType} onValueChange={setViewType}>
          <SelectTrigger className="w-[130px] bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="summary-view-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All (सब)</SelectItem>
            <SelectItem value="paddy">Paddy Purchase</SelectItem>
            <SelectItem value="rice">Rice Sale</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300" data-testid="summary-refresh-btn">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
        <Button onClick={() => handleExport('pdf')} variant="outline" size="sm" className="border-red-700 text-red-400 hover:bg-red-900/30" data-testid="summary-export-pdf">
          <FileText className="w-4 h-4 mr-1" /> PDF
        </Button>
        <Button onClick={() => handleExport('excel')} variant="outline" size="sm" className="border-green-700 text-green-400 hover:bg-green-900/30" data-testid="summary-export-excel">
          <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
        </Button>
        <div className="flex items-center gap-1 ml-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-[130px]" data-testid="summary-date-from" />
          <span className="text-slate-500 text-xs">to</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-[130px]" data-testid="summary-date-to" />
        </div>
        <div className="relative ml-auto min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="Party / Mandi / Agent..."
            className="bg-slate-700 border-slate-600 text-white h-8 text-sm pl-8" data-testid="summary-search-input" />
        </div>
      </div>

      {/* Paddy Purchase Section */}
      {(viewType === "all" || viewType === "paddy") && (() => {
        const paddyParties = data.parties.filter(p => p.purchase_amount > 0);
        const paddyTotalAmt = paddyParties.reduce((s, p) => s + p.purchase_amount, 0);
        const paddyTotalPaid = paddyParties.reduce((s, p) => s + p.purchase_paid, 0);
        const paddyTotalBal = paddyParties.reduce((s, p) => s + p.purchase_balance, 0);
        return (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-amber-400 text-sm flex items-center gap-2"><Wheat className="w-4 h-4" /> Paddy Purchase ({paddyParties.length} parties)</CardTitle>
          </CardHeader>
          <CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="border-slate-700">
                {['Party', 'Mandi', 'Agent', 'Purchase Amt', 'Paid', 'Balance'].map(h =>
                  <TableHead key={h} className={`text-slate-300 text-xs whitespace-nowrap ${['Purchase Amt', 'Paid', 'Balance'].includes(h) ? 'text-right' : ''}`}>{h}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
                : paddyParties.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-6">Koi paddy purchase nahi mili.</TableCell></TableRow>
                : paddyParties.map((p, idx) => (
                  <TableRow key={p.party_name + idx} className="border-slate-700 cursor-pointer hover:bg-slate-700/50 transition-colors" data-testid={`paddy-summary-row-${idx}`}
                    onClick={() => { if (onNavigate) { toast.info(`"${p.party_name}" ki Cash Book Ledger khul rahi hai...`); onNavigate("cashbook"); } }}>
                    <TableCell className="text-white font-semibold text-sm">{p.party_name}</TableCell>
                    <TableCell className="text-cyan-400 text-xs">{p.mandi_name || '-'}</TableCell>
                    <TableCell className="text-purple-400 text-xs">{p.agent_name || '-'}</TableCell>
                    <TableCell className="text-right text-amber-400 text-sm">Rs.{p.purchase_amount.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-emerald-400 text-xs">Rs.{p.purchase_paid.toLocaleString()}</TableCell>
                    <TableCell className={`text-right font-semibold text-sm ${p.purchase_balance > 0 ? 'text-red-400' : 'text-emerald-400'}`} data-testid={`paddy-summary-bal-${idx}`}>Rs.{p.purchase_balance.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {paddyParties.length > 0 && (
                  <TableRow className="border-slate-700 bg-amber-900/20">
                    <TableCell className="font-bold text-amber-400 text-sm" colSpan={3}>TOTAL</TableCell>
                    <TableCell className="text-right text-amber-400 font-bold text-sm">Rs.{Math.round(paddyTotalAmt).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-emerald-400 font-bold text-xs">Rs.{Math.round(paddyTotalPaid).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-red-400 font-bold text-sm" data-testid="paddy-summary-total-bal">Rs.{Math.round(paddyTotalBal).toLocaleString()}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div></CardContent>
        </Card>);
      })()}

      {/* Rice Sale Section */}
      {(viewType === "all" || viewType === "rice") && (() => {
        const riceParties = data.parties.filter(p => p.sale_amount > 0);
        const riceTotalAmt = riceParties.reduce((s, p) => s + p.sale_amount, 0);
        const riceTotalRcvd = riceParties.reduce((s, p) => s + p.sale_received, 0);
        const riceTotalBal = riceParties.reduce((s, p) => s + p.sale_balance, 0);
        return (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-emerald-400 text-sm flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Rice Sale ({riceParties.length} parties)</CardTitle>
          </CardHeader>
          <CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="border-slate-700">
                {['Party', 'Sale Amt', 'Received', 'Balance'].map(h =>
                  <TableHead key={h} className={`text-slate-300 text-xs whitespace-nowrap ${['Sale Amt', 'Received', 'Balance'].includes(h) ? 'text-right' : ''}`}>{h}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={4} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
                : riceParties.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-slate-400 py-6">Koi rice sale nahi mili.</TableCell></TableRow>
                : riceParties.map((p, idx) => (
                  <TableRow key={p.party_name + idx} className="border-slate-700 cursor-pointer hover:bg-slate-700/50 transition-colors" data-testid={`rice-summary-row-${idx}`}
                    onClick={() => { if (onNavigate) { toast.info(`"${p.party_name}" ki Cash Book Ledger khul rahi hai...`); onNavigate("cashbook"); } }}>
                    <TableCell className="text-white font-semibold text-sm">{p.party_name}</TableCell>
                    <TableCell className="text-right text-sky-400 text-sm">Rs.{p.sale_amount.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-emerald-400 text-xs">Rs.{p.sale_received.toLocaleString()}</TableCell>
                    <TableCell className={`text-right font-semibold text-sm ${p.sale_balance > 0 ? 'text-red-400' : 'text-emerald-400'}`} data-testid={`rice-summary-bal-${idx}`}>Rs.{p.sale_balance.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {riceParties.length > 0 && (
                  <TableRow className="border-slate-700 bg-emerald-900/20">
                    <TableCell className="font-bold text-emerald-400 text-sm">TOTAL</TableCell>
                    <TableCell className="text-right text-sky-400 font-bold text-sm">Rs.{Math.round(riceTotalAmt).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-emerald-400 font-bold text-xs">Rs.{Math.round(riceTotalRcvd).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-red-400 font-bold text-sm" data-testid="rice-summary-total-bal">Rs.{Math.round(riceTotalBal).toLocaleString()}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div></CardContent>
        </Card>);
      })()}
    </div>
  );
};

// ===== Main Component =====
export default function PrivateTrading({ filters, user, onNavigate }) {
  const [activeTab, setActiveTab] = useState("paddy");

  return (
    <div className="space-y-4" data-testid="private-trading-page">
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        <Button onClick={() => setActiveTab("paddy")}
          variant={activeTab === "paddy" ? "default" : "ghost"} size="sm"
          className={activeTab === "paddy" ? "bg-amber-500 hover:bg-amber-600 text-slate-900" : "text-slate-300 hover:bg-slate-700"}
          data-testid="tab-pvt-paddy">
          <Wheat className="w-4 h-4 mr-1" /> Paddy Purchase
        </Button>
        <Button onClick={() => setActiveTab("rice")}
          variant={activeTab === "rice" ? "default" : "ghost"} size="sm"
          className={activeTab === "rice" ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "text-slate-300 hover:bg-slate-700"}
          data-testid="tab-pvt-rice">
          <ShoppingCart className="w-4 h-4 mr-1" /> Rice Sale
        </Button>
        <Button onClick={() => setActiveTab("summary")}
          variant={activeTab === "summary" ? "default" : "ghost"} size="sm"
          className={activeTab === "summary" ? "bg-sky-500 hover:bg-sky-600 text-white" : "text-slate-300 hover:bg-slate-700"}
          data-testid="tab-pvt-summary">
          <Users className="w-4 h-4 mr-1" /> Party Summary
        </Button>
      </div>

      {activeTab === "paddy" ? (
        <PaddyPurchase filters={filters} user={user} />
      ) : activeTab === "rice" ? (
        <RiceSale filters={filters} user={user} />
      ) : (
        <PartySummary filters={filters} onNavigate={onNavigate} />
      )}
    </div>
  );
}
