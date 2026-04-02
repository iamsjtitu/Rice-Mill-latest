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
  Plus, Trash2, RefreshCw, ShoppingCart, Wheat, IndianRupee, Eye, Calculator, Search, FileText, FileSpreadsheet, Calendar, Users, CheckCircle, Undo2, History, Send,
} from "lucide-react";
import { downloadFile } from "../utils/download";
import RoundOffInput from "./common/RoundOffInput";
import { useConfirm } from "./ConfirmProvider";
import { SendToGroupDialog } from "./SendToGroupDialog";
import RecordHistory from "./RecordHistory";
import { useMessagingEnabled } from "../hooks/useMessagingEnabled";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

const CURRENT_KMS_YEAR = (() => {
  const now = new Date();
  const y = now.getFullYear();
  // FY = April-March
  return now.getMonth() >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
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

// ===== Paddy Purchase Component =====
export const PaddyPurchase = ({ filters, user }) => {
  const showConfirm = useConfirm();
  const { wa } = useMessagingEnabled();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [payDialog, setPayDialog] = useState({ open: false, item: null });
  const [payForm, setPayForm] = useState({ date: new Date().toISOString().split('T')[0], amount: "", mode: "cash", reference: "", remark: "", round_off: "" });
  const [payLoading, setPayLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [historyDialog, setHistoryDialog] = useState({ open: false, item: null, history: [] });
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupText, setGroupText] = useState("");
  const [groupPdfUrl, setGroupPdfUrl] = useState("");
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
      // Ensure cash book entries are created (auto-fix safety net)
      try { await axios.post(`${API}/cash-book/auto-fix`); } catch(_) {}
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
      _v: item._v,
    });
    setEditId(item.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!await showConfirm("Delete", "Delete karna chahte hain?")) return;
    try { await axios.delete(`${API}/private-paddy/${id}`); toast.success("Deleted!"); fetchData(); }
    catch { toast.error("Delete nahi hua"); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!await showConfirm("Bulk Delete", `${selectedIds.length} entries delete karna chahte hain?`)) return;
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
    if (payLoading) return;
    const amt = parseFloat(payForm.amount);
    if (!amt || amt <= 0) { toast.error("Amount 0 se zyada hona chahiye"); return; }
    setPayLoading(true);
    try {
      await axios.post(`${API}/private-payments?username=${user.username}&role=${user.role}`, {
        date: payForm.date, party_name: payDialog.item.party_name,
        payment_type: "paid", ref_type: "paddy_purchase", ref_id: payDialog.item.id,
        amount: amt, mode: payForm.mode, reference: payForm.reference, remark: payForm.remark,
        round_off: parseFloat(payForm.round_off) || 0,
        kms_year: payDialog.item.kms_year, season: payDialog.item.season,
      });
      toast.success("Payment save ho gaya!");
      setPayDialog({ open: false, item: null }); setPayForm({ date: new Date().toISOString().split('T')[0], amount: "", mode: "cash", reference: "", remark: "", round_off: "" });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); } finally { setPayLoading(false); }
  };

  const handleMarkPaid = async (item) => {
    const bal = Math.round((item.total_amount || 0) - (item.paid_amount || 0));
    if (!await showConfirm("Mark Paid", `${item.party_name} ko fully paid mark karna chahte hain? Balance Rs.${bal.toLocaleString()} clear hoga.`)) return;
    try {
      await axios.post(`${API}/private-paddy/${item.id}/mark-paid?username=${user.username}&role=${user.role}`);
      toast.success("Mark Paid ho gaya!"); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleUndoPaid = async (item) => {
    if (!await showConfirm("Undo Payment", `${item.party_name} ka payment undo karna chahte hain? Sab reset ho jayega.`)) return;
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
                        <Button variant="ghost" size="sm" className="h-6 px-1 text-red-400" onClick={() => handleUndoPaid(item)} data-testid={`paddy-undo-${item.id}`} title="Undo Paid (Sab Reset)">
                          <Undo2 className="w-3 h-3" />
                        </Button>
                      )}
                      {item.payment_status !== 'paid' && (item.paid_amount || 0) > 0 && user.role === 'admin' && (
                        <Button variant="ghost" size="sm" className="h-6 px-1 text-orange-400 hover:text-orange-300" onClick={() => handleViewHistory(item)} data-testid={`paddy-undo-history-${item.id}`} title="Payment Undo / History">
                          <Undo2 className="w-3 h-3 mr-0.5" /><History className="w-3 h-3" />
                        </Button>
                      )}
                      {!(item.payment_status !== 'paid' && (item.paid_amount || 0) > 0 && user.role === 'admin') && (
                        <Button variant="ghost" size="sm" className="h-6 px-1 text-purple-400" onClick={() => handleViewHistory(item)} data-testid={`paddy-history-${item.id}`} title="Payment History">
                          <History className="w-3 h-3" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-6 px-1 text-blue-400" onClick={() => handleEdit(item)} data-testid={`paddy-edit-${item.id}`} title="Edit">
                        <Eye className="w-3 h-3" />
                      </Button>
                      <RecordHistory recordId={item.id} label={item.party_name} />
                      {user.role === 'admin' && (
                        <Button variant="ghost" size="sm" className="h-6 px-1 text-red-400" onClick={() => handleDelete(item.id)} data-testid={`paddy-del-${item.id}`} title="Delete">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                      {wa && bal > 0 && (<>
                        <Button variant="ghost" size="sm" className="h-6 px-1 text-green-400" data-testid={`paddy-wa-${item.id}`} title="WhatsApp Reminder"
                          onClick={async () => {
                            let phone = "";
                            try {
                              const ws = (await axios.get(`${API}/whatsapp/settings`)).data;
                              if (!(ws.default_numbers || []).length) {
                                phone = prompt("Default numbers set nahi hain. Phone number daalein:");
                                if (!phone) return;
                              }
                            } catch(e) {
                              phone = prompt("Phone number daalein:");
                              if (!phone) return;
                            }
                            try {
                              const res = await axios.post(`${API}/whatsapp/send-payment-reminder`, {
                                phone, party_name: item.party_name,
                                total_amount: item.total_amount || 0, paid_amount: item.paid_amount || 0, balance: bal
                              });
                              if (res.data.success) toast.success(res.data.message || "WhatsApp reminder bhej diya!");
                              else toast.error(res.data.error || "WhatsApp fail - Settings check karein");
                            } catch (e) { toast.error(e.response?.data?.detail || "WhatsApp send fail"); }
                          }}
                        >
                          <Send className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 px-1 text-teal-400" data-testid={`paddy-group-${item.id}`} title="Send to Group"
                          onClick={() => {
                            setGroupText(`*Payment Reminder*\nParty: *${item.party_name}*\nTotal: Rs.${(item.total_amount || 0).toLocaleString()}\nPaid: Rs.${(item.paid_amount || 0).toLocaleString()}\n*Balance: Rs.${bal.toLocaleString()}*`);
                            setGroupPdfUrl("");
                            setGroupDialogOpen(true);
                          }}
                        >
                          <Users className="w-3 h-3" />
                        </Button>
                      </>)}
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
              <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white flex-1" disabled={payLoading} data-testid="paddy-pay-submit">{payLoading ? "Saving..." : "Pay"}</Button>
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
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${h.payment_type === 'paid' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                        {h.payment_type || 'paid'}
                      </span>
                      {user.role === 'admin' && h.id && (
                        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30"
                          data-testid={`paddy-undo-pay-${h.id}`}
                          title="Payment Undo / Delete"
                          onClick={async () => {
                            const confirmed = await showConfirm("Kya aap ye payment undo karna chahte hain? Cash Book se bhi linked entries delete hongi.");
                            if (!confirmed) return;
                            try {
                              await axios.delete(`${API}/private-payments/${h.id}?username=${user.username}&role=${user.role}`);
                              toast.success("Payment undo ho gaya! Cash Book se bhi delete hua.");
                              const res = await axios.get(`${API}/private-paddy/${historyDialog.item.id}/history`);
                              setHistoryDialog(prev => ({ ...prev, history: res.data.history || [] }));
                              fetchData();
                            } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
                          }}>
                          <Undo2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <SendToGroupDialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen} text={groupText} pdfUrl={groupPdfUrl} />
    </div>
  );
};

// ===== Party Summary Component =====
export const PartySummary = ({ filters, onNavigate }) => {
  const [data, setData] = useState({ paddy_purchase: {}, sale_vouchers: {}, purchase_vouchers: {}, totals: {} });
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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
    downloadFile(`/api/private-trading/party-summary/${type}?${p}`, `party_summary.${type === 'pdf' ? 'pdf' : 'xlsx'}`);
  };

  const t = data.totals || {};
  const paddy = data.paddy_purchase || { parties: [], total_amount: 0, total_paid: 0, total_balance: 0 };
  const sale = data.sale_vouchers || { parties: [], total_amount: 0, total_paid: 0, total_balance: 0 };
  const purchase = data.purchase_vouchers || { parties: [], total_amount: 0, total_paid: 0, total_balance: 0 };

  const SectionTable = ({ title, icon: Icon, color, borderColor, parties, totalAmt, totalPaid, totalBal, amtLabel, paidLabel, testPrefix }) => (
    <Card className={`bg-slate-800 ${borderColor} border`}>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className={`${color} text-sm flex items-center gap-2`}><Icon className="w-4 h-4" /> {title} ({parties.length} parties)</CardTitle>
      </CardHeader>
      <CardContent className="p-0"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="border-slate-700">
            {['Party', 'Entries', amtLabel, paidLabel, 'Balance'].map(h =>
              <TableHead key={h} className={`text-slate-300 text-xs whitespace-nowrap ${[amtLabel, paidLabel, 'Balance'].includes(h) ? 'text-right' : ''}`}>{h}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-6">Loading...</TableCell></TableRow>
            : parties.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-6">Koi entry nahi mili.</TableCell></TableRow>
            : parties.map((p, idx) => (
              <TableRow key={p.party_name + idx} className="border-slate-700 cursor-pointer hover:bg-slate-700/50 transition-colors" data-testid={`${testPrefix}-row-${idx}`}
                onClick={() => { if (onNavigate) { toast.info(`"${p.party_name}" ki ledger khul rahi hai...`); onNavigate("cashbook"); } }}>
                <TableCell className="text-white font-semibold text-sm">{p.party_name}</TableCell>
                <TableCell className="text-slate-400 text-xs">{p.entries}</TableCell>
                <TableCell className={`text-right ${color} text-sm`}>Rs.{(p.amount || 0).toLocaleString()}</TableCell>
                <TableCell className="text-right text-emerald-400 text-xs">Rs.{(p.paid || 0).toLocaleString()}</TableCell>
                <TableCell className={`text-right font-semibold text-sm ${(p.balance || 0) > 0 ? 'text-red-400' : 'text-emerald-400'}`} data-testid={`${testPrefix}-bal-${idx}`}>Rs.{(p.balance || 0).toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {parties.length > 0 && (
              <TableRow className="border-slate-700 bg-slate-700/30">
                <TableCell className={`font-bold ${color} text-sm`} colSpan={2}>TOTAL</TableCell>
                <TableCell className={`text-right ${color} font-bold text-sm`}>Rs.{Math.round(totalAmt).toLocaleString()}</TableCell>
                <TableCell className="text-right text-emerald-400 font-bold text-xs">Rs.{Math.round(totalPaid).toLocaleString()}</TableCell>
                <TableCell className="text-right text-red-400 font-bold text-sm" data-testid={`${testPrefix}-total-bal`}>Rs.{Math.round(totalBal).toLocaleString()}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div></CardContent>
    </Card>
  );

  return (
    <div className="space-y-4" data-testid="party-summary-section">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Total Parties", t.total_parties || 0, "text-white"],
          ["Purchase Bal", `Rs.${(t.total_purchase_balance || 0).toLocaleString()}`, "text-red-400"],
          ["Sale Bal", `Rs.${(t.total_sale_balance || 0).toLocaleString()}`, "text-cyan-400"],
          ["Net Balance", `Rs.${(t.total_net_balance || 0).toLocaleString()}`, (t.total_net_balance || 0) > 0 ? "text-red-400" : "text-emerald-400"],
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
            placeholder="Party search..."
            className="bg-slate-700 border-slate-600 text-white h-8 text-sm pl-8" data-testid="summary-search-input" />
        </div>
      </div>

      {/* 1. Sale Vouchers Section */}
      <SectionTable
        title="Sale Vouchers" icon={ShoppingCart} color="text-emerald-400" borderColor="border-emerald-700"
        parties={sale.parties || []} totalAmt={sale.total_amount} totalPaid={sale.total_paid} totalBal={sale.total_balance}
        amtLabel="Sale Amount" paidLabel="Received" testPrefix="sv-summary"
      />

      {/* 2. Purchase Vouchers Section */}
      <SectionTable
        title="Purchase Vouchers" icon={Wheat} color="text-purple-400" borderColor="border-purple-700"
        parties={purchase.parties || []} totalAmt={purchase.total_amount} totalPaid={purchase.total_paid} totalBal={purchase.total_balance}
        amtLabel="Purchase Amount" paidLabel="Paid" testPrefix="pv-summary"
      />

      {/* 3. Paddy Purchase Section */}
      <SectionTable
        title="Paddy Purchase" icon={Wheat} color="text-amber-400" borderColor="border-amber-700"
        parties={paddy.parties || []} totalAmt={paddy.total_amount} totalPaid={paddy.total_paid} totalBal={paddy.total_balance}
        amtLabel="Purchase Amount" paidLabel="Paid" testPrefix="paddy-summary"
      />
    </div>
  );
};
