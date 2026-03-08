import { useState, useEffect, useCallback, useMemo } from "react";
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
  Plus, Trash2, RefreshCw, ShoppingCart, Wheat, IndianRupee, Eye, EyeOff, Calculator,
} from "lucide-react";

const BACKEND_URL = (typeof window !== 'undefined' && window.ELECTRON_API_URL) || process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CURRENT_KMS_YEAR = (() => {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
})();

// ===== Paddy Purchase Auto Calculations =====
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
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0], kms_year: CURRENT_KMS_YEAR, season: "Kharif",
    party_name: "", truck_no: "", rst_no: "", agent_name: "", mandi_name: "",
    kg: "", bag: "", rate_per_qntl: "", g_deposite: "", plastic_bag: "", moisture: "",
    cutting_percent: "", disc_dust_poll: "", paid_amount: "0", remark: "",
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

  const resetForm = () => {
    setForm({ date: new Date().toISOString().split('T')[0], kms_year: filters.kms_year || CURRENT_KMS_YEAR, season: filters.season || "Kharif",
      party_name: "", truck_no: "", rst_no: "", agent_name: "", mandi_name: "",
      kg: "", bag: "", rate_per_qntl: "", g_deposite: "", plastic_bag: "", moisture: "",
      cutting_percent: "", disc_dust_poll: "", paid_amount: "0", remark: "" });
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
      disc_dust_poll: item.disc_dust_poll || "", paid_amount: item.paid_amount || "0", remark: item.remark || "",
    });
    setEditId(item.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete karna chahte hain?")) return;
    try { await axios.delete(`${API}/private-paddy/${id}`); toast.success("Deleted!"); fetchData(); }
    catch { toast.error("Delete nahi hua"); }
  };

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
      });
      toast.success("Payment save ho gaya!");
      setPayDialog({ open: false, item: null }); setPayForm({ date: new Date().toISOString().split('T')[0], amount: "", mode: "cash", reference: "", remark: "" });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const totals = useMemo(() => {
    const totalAmt = items.reduce((s, i) => s + (i.total_amount || 0), 0);
    const totalPaid = items.reduce((s, i) => s + (i.paid_amount || 0), 0);
    const totalQntl = items.reduce((s, i) => s + (i.final_qntl || 0), 0);
    return { totalAmt: Math.round(totalAmt), totalPaid: Math.round(totalPaid), balance: Math.round(totalAmt - totalPaid), totalQntl: Math.round(totalQntl * 100) / 100 };
  }, [items]);

  return (
    <div className="space-y-4" data-testid="paddy-purchase-section">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["Total Entries", items.length, "text-white"],
          ["Total Qntl", `${totals.totalQntl} Q`, "text-amber-400"],
          ["Total Amount", `₹${totals.totalAmt.toLocaleString()}`, "text-white"],
          ["Paid", `₹${totals.totalPaid.toLocaleString()}`, "text-emerald-400"],
          ["Balance", `₹${totals.balance.toLocaleString()}`, "text-red-400"],
        ].map(([label, val, color]) => (
          <Card key={label} className="bg-slate-800 border-slate-700">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-slate-400">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{val}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="bg-amber-500 hover:bg-amber-600 text-slate-900" size="sm" data-testid="paddy-add-btn">
          <Plus className="w-4 h-4 mr-1" /> Nayi Entry
        </Button>
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Table */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-0"><div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="border-slate-700">
              {['Date', 'Party', 'Truck', 'KG', 'Final Q', 'Rate/Q', 'Total ₹', 'Paid ₹', 'Balance ₹', ''].map(h =>
                <TableHead key={h} className={`text-slate-300 text-xs ${['KG', 'Final Q', 'Rate/Q', 'Total ₹', 'Paid ₹', 'Balance ₹'].includes(h) ? 'text-right' : ''}`}>{h}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={10} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
              : items.length === 0 ? <TableRow><TableCell colSpan={10} className="text-center text-slate-400 py-8">Koi entry nahi. "Nayi Entry" click karein.</TableCell></TableRow>
              : items.map(item => (
                <TableRow key={item.id} className="border-slate-700" data-testid={`paddy-row-${item.id}`}>
                  <TableCell className="text-white text-xs">{item.date}</TableCell>
                  <TableCell className="text-white font-semibold text-sm">{item.party_name}</TableCell>
                  <TableCell className="text-slate-300 text-xs">{item.truck_no || '-'}</TableCell>
                  <TableCell className="text-right text-slate-300 text-xs">{item.kg}</TableCell>
                  <TableCell className="text-right text-amber-400 font-semibold text-sm">{item.final_qntl} Q</TableCell>
                  <TableCell className="text-right text-slate-300 text-xs">₹{item.rate_per_qntl}</TableCell>
                  <TableCell className="text-right text-white font-semibold text-sm">₹{(item.total_amount || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-emerald-400 text-sm">₹{(item.paid_amount || 0).toLocaleString()}</TableCell>
                  <TableCell className={`text-right font-semibold text-sm ${(item.balance || 0) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    ₹{(item.balance || 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" className="h-6 px-1 text-emerald-400" onClick={() => { setPayDialog({ open: true, item }); setPayForm({ ...payForm, date: new Date().toISOString().split('T')[0] }); }} data-testid={`paddy-pay-${item.id}`}>
                        <IndianRupee className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 px-1 text-blue-400" onClick={() => handleEdit(item)} data-testid={`paddy-edit-${item.id}`}>
                        <Eye className="w-3 h-3" />
                      </Button>
                      {user.role === 'admin' && (
                        <Button variant="ghost" size="sm" className="h-6 px-1 text-red-400" onClick={() => handleDelete(item.id)} data-testid={`paddy-del-${item.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
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
                <Label className="text-amber-400 text-xs font-semibold">Rate / Qntl (₹) *</Label>
                <Input type="number" step="0.01" value={form.rate_per_qntl} onChange={e => setForm(p => ({ ...p, rate_per_qntl: e.target.value }))} placeholder="₹ per quintal" className="bg-amber-900/30 border-amber-700 text-amber-400 h-8 text-sm font-semibold" data-testid="pvt-paddy-rate" />
              </div>
            </div>

            {/* Weight & Calculations */}
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
                <div className="col-span-2">
                  <Label className="text-emerald-400 text-xs font-semibold">Total Amount (Auto)</Label>
                  <Input value={`₹${calc.total_amount.toLocaleString()} (${calc.final_qntl}Q × ₹${parseFloat(form.rate_per_qntl) || 0}/Q)`} readOnly className="bg-emerald-900/30 border-emerald-700 text-emerald-400 h-8 text-lg font-bold" />
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-300 text-xs">Advance Paid (₹)</Label>
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
              Total: ₹{payDialog.item.total_amount?.toLocaleString()} | Paid: ₹{payDialog.item.paid_amount?.toLocaleString()} | <span className="text-red-400">Balance: ₹{payDialog.item.balance?.toLocaleString()}</span>
            </div>
          )}
          <form onSubmit={handlePayment} className="space-y-3">
            <div><Label className="text-xs text-slate-400">Date</Label><Input type="date" value={payForm.date} onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
            <div><Label className="text-xs text-slate-400">Amount (₹)</Label><Input type="number" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="paddy-pay-amount" /></div>
            <div><Label className="text-xs text-slate-400">Mode</Label>
              <Select value={payForm.mode} onValueChange={v => setPayForm(p => ({ ...p, mode: v }))}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="bank">Bank</SelectItem><SelectItem value="cheque">Cheque</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs text-slate-400">Reference</Label><Input value={payForm.reference} onChange={e => setPayForm(p => ({ ...p, reference: e.target.value }))} placeholder="Cheque no / UTR" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setPayDialog({ open: false, item: null })} className="border-slate-600 text-slate-300 flex-1">Cancel</Button>
              <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white flex-1" data-testid="paddy-pay-submit">Pay</Button>
            </div>
          </form>
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
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0], kms_year: CURRENT_KMS_YEAR, season: "Kharif",
    party_name: "", rice_type: "Usna", quantity_qntl: "", rate_per_qntl: "", bags: "", truck_no: "",
    paid_amount: "0", remark: "",
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
    } catch { toast.error("Data load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => {
    setForm({ date: new Date().toISOString().split('T')[0], kms_year: filters.kms_year || CURRENT_KMS_YEAR, season: filters.season || "Kharif",
      party_name: "", rice_type: "Usna", quantity_qntl: "", rate_per_qntl: "", bags: "", truck_no: "",
      paid_amount: "0", remark: "" });
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
      quantity_qntl: item.quantity_qntl, rate_per_qntl: item.rate_per_qntl,
      bags: item.bags || "", truck_no: item.truck_no || "",
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
      });
      toast.success("Payment received!");
      setPayDialog({ open: false, item: null }); setPayForm({ date: new Date().toISOString().split('T')[0], amount: "", mode: "cash", reference: "", remark: "" });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const totals = useMemo(() => {
    const totalAmt = items.reduce((s, i) => s + (i.total_amount || 0), 0);
    const totalPaid = items.reduce((s, i) => s + (i.paid_amount || 0), 0);
    const totalQntl = items.reduce((s, i) => s + (i.quantity_qntl || 0), 0);
    return { totalAmt: Math.round(totalAmt), totalPaid: Math.round(totalPaid), balance: Math.round(totalAmt - totalPaid), totalQntl: Math.round(totalQntl * 100) / 100 };
  }, [items]);

  return (
    <div className="space-y-4" data-testid="rice-sale-section">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["Total Entries", items.length, "text-white"],
          ["Total Qntl", `${totals.totalQntl} Q`, "text-amber-400"],
          ["Total Amount", `₹${totals.totalAmt.toLocaleString()}`, "text-white"],
          ["Received", `₹${totals.totalPaid.toLocaleString()}`, "text-emerald-400"],
          ["Balance", `₹${totals.balance.toLocaleString()}`, "text-red-400"],
        ].map(([label, val, color]) => (
          <Card key={label} className="bg-slate-800 border-slate-700">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-slate-400">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{val}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="bg-emerald-500 hover:bg-emerald-600 text-white" size="sm" data-testid="rice-add-btn">
          <Plus className="w-4 h-4 mr-1" /> Nayi Sale Entry
        </Button>
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Table */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-0"><div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="border-slate-700">
              {['Date', 'Party', 'Type', 'Qntl', 'Rate/Q', 'Total ₹', 'Received ₹', 'Balance ₹', 'Truck', ''].map(h =>
                <TableHead key={h} className={`text-slate-300 text-xs ${['Qntl', 'Rate/Q', 'Total ₹', 'Received ₹', 'Balance ₹'].includes(h) ? 'text-right' : ''}`}>{h}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={10} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
              : items.length === 0 ? <TableRow><TableCell colSpan={10} className="text-center text-slate-400 py-8">Koi sale nahi. "Nayi Sale Entry" click karein.</TableCell></TableRow>
              : items.map(item => (
                <TableRow key={item.id} className="border-slate-700" data-testid={`rice-row-${item.id}`}>
                  <TableCell className="text-white text-xs">{item.date}</TableCell>
                  <TableCell className="text-white font-semibold text-sm">{item.party_name}</TableCell>
                  <TableCell><span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-900/40 text-amber-400">{item.rice_type}</span></TableCell>
                  <TableCell className="text-right text-amber-400 font-semibold text-sm">{item.quantity_qntl} Q</TableCell>
                  <TableCell className="text-right text-slate-300 text-xs">₹{item.rate_per_qntl}</TableCell>
                  <TableCell className="text-right text-white font-semibold text-sm">₹{(item.total_amount || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-emerald-400 text-sm">₹{(item.paid_amount || 0).toLocaleString()}</TableCell>
                  <TableCell className={`text-right font-semibold text-sm ${(item.balance || 0) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    ₹{(item.balance || 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-slate-300 text-xs">{item.truck_no || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" className="h-6 px-1 text-emerald-400" onClick={() => { setPayDialog({ open: true, item }); setPayForm({ ...payForm, date: new Date().toISOString().split('T')[0] }); }} data-testid={`rice-pay-${item.id}`}>
                        <IndianRupee className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 px-1 text-blue-400" onClick={() => handleEdit(item)} data-testid={`rice-edit-${item.id}`}>
                        <Eye className="w-3 h-3" />
                      </Button>
                      {user.role === 'admin' && (
                        <Button variant="ghost" size="sm" className="h-6 px-1 text-red-400" onClick={() => handleDelete(item.id)} data-testid={`rice-del-${item.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div></CardContent>
      </Card>

      {/* Add/Edit Rice Sale Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg" data-testid="rice-form-dialog">
          <DialogHeader><DialogTitle className="text-emerald-400">{editId ? "Sale Edit" : "Nayi Rice Sale"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="rice-form-date" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Party Name *</Label>
                <Input value={form.party_name} onChange={e => setForm(p => ({ ...p, party_name: e.target.value }))} placeholder="Buyer name" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="rice-form-party" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Rice Type</Label>
                <Select value={form.rice_type} onValueChange={v => setForm(p => ({ ...p, rice_type: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="rice-form-type"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Usna">Usna</SelectItem><SelectItem value="Raw">Raw</SelectItem><SelectItem value="Boiled">Boiled</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-400">Quantity (Qntl) *</Label>
                <Input type="number" step="0.01" value={form.quantity_qntl} onChange={e => setForm(p => ({ ...p, quantity_qntl: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="rice-form-qty" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Rate / Qntl (₹) *</Label>
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
                <Label className="text-xs text-slate-400">Advance Received (₹)</Label>
                <Input type="number" value={form.paid_amount} onChange={e => setForm(p => ({ ...p, paid_amount: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="rice-form-paid" />
              </div>
            </div>
            <div>
              <Label className="text-emerald-400 text-sm font-bold">Total: ₹{riceTotal.toLocaleString()}</Label>
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
              Total: ₹{payDialog.item.total_amount?.toLocaleString()} | Received: ₹{payDialog.item.paid_amount?.toLocaleString()} | <span className="text-red-400">Balance: ₹{payDialog.item.balance?.toLocaleString()}</span>
            </div>
          )}
          <form onSubmit={handlePayment} className="space-y-3">
            <div><Label className="text-xs text-slate-400">Date</Label><Input type="date" value={payForm.date} onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
            <div><Label className="text-xs text-slate-400">Amount (₹)</Label><Input type="number" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="rice-pay-amount" /></div>
            <div><Label className="text-xs text-slate-400">Mode</Label>
              <Select value={payForm.mode} onValueChange={v => setPayForm(p => ({ ...p, mode: v }))}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="bank">Bank</SelectItem><SelectItem value="cheque">Cheque</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs text-slate-400">Reference</Label><Input value={payForm.reference} onChange={e => setPayForm(p => ({ ...p, reference: e.target.value }))} placeholder="Cheque no / UTR" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setPayDialog({ open: false, item: null })} className="border-slate-600 text-slate-300 flex-1">Cancel</Button>
              <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white flex-1" data-testid="rice-pay-submit">Receive</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ===== Main Component =====
export default function PrivateTrading({ filters, user }) {
  const [activeTab, setActiveTab] = useState("paddy");

  return (
    <div className="space-y-4" data-testid="private-trading-page">
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        <Button onClick={() => setActiveTab("paddy")}
          variant={activeTab === "paddy" ? "default" : "ghost"} size="sm"
          className={activeTab === "paddy" ? "bg-amber-500 hover:bg-amber-600 text-slate-900" : "text-slate-300 hover:bg-slate-700"}
          data-testid="tab-pvt-paddy">
          <Wheat className="w-4 h-4 mr-1" /> Paddy Purchase / धान खरीदी
        </Button>
        <Button onClick={() => setActiveTab("rice")}
          variant={activeTab === "rice" ? "default" : "ghost"} size="sm"
          className={activeTab === "rice" ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "text-slate-300 hover:bg-slate-700"}
          data-testid="tab-pvt-rice">
          <ShoppingCart className="w-4 h-4 mr-1" /> Rice Sale / चावल बिक्री
        </Button>
      </div>

      {activeTab === "paddy" ? (
        <PaddyPurchase filters={filters} user={user} />
      ) : (
        <RiceSale filters={filters} user={user} />
      )}
    </div>
  );
}
