import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, CreditCard, History, Printer, IndianRupee, Calendar, Truck, Edit } from "lucide-react";
import { printHtml } from "@/components/PrintButton";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const STATUS_COLORS = {
  paid: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  partial: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  pending: "bg-red-500/20 text-red-400 border-red-500/30",
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtMonth(m) { const [y, mo] = m.split("-"); return `${MONTH_NAMES[parseInt(mo) - 1]} ${y}`; }
function fmtAmt(n) { return new Intl.NumberFormat("en-IN").format(Math.round(n)); }

export default function LeasedTruck({ filters }) {
  const [leases, setLeases] = useState([]);
  const [showAddLease, setShowAddLease] = useState(false);
  const [editLease, setEditLease] = useState(null);
  const [form, setForm] = useState({ truck_no: "", owner_name: "", monthly_rent: "", start_date: "", end_date: "", advance_deposit: "" });
  const [selectedLease, setSelectedLease] = useState(null);
  const [paymentData, setPaymentData] = useState(null);
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [payMonth, setPayMonth] = useState("");
  const [payForm, setPayForm] = useState({ amount: "", account: "cash", bank_name: "", payment_date: new Date().toISOString().split("T")[0], notes: "" });
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [searchText, setSearchText] = useState("");

  const filteredLeases = leases.filter(l => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (l.truck_no || "").toLowerCase().includes(q) || (l.owner_name || "").toLowerCase().includes(q);
  });

  const fetchLeases = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      if (filters.season) params.append("season", filters.season);
      const res = await axios.get(`${API}/truck-leases?${params}`);
      setLeases(res.data);
    } catch (e) { toast.error("Leases load nahi ho sake"); }
  }, [filters.kms_year, filters.season]);

  const fetchBankAccounts = useCallback(async () => {
    try { const res = await axios.get(`${API}/bank-accounts`); setBankAccounts(res.data); } catch {}
  }, []);

  useEffect(() => { fetchLeases(); }, [fetchLeases]);
  useEffect(() => { fetchBankAccounts(); }, [fetchBankAccounts]);

  const handleAddLease = async () => {
    try {
      const payload = { ...form, monthly_rent: +form.monthly_rent, advance_deposit: +(form.advance_deposit || 0), kms_year: filters.kms_year, season: filters.season };
      if (editLease) {
        await axios.put(`${API}/truck-leases/${editLease.id}`, payload);
        toast.success("Lease update ho gaya");
      } else {
        await axios.post(`${API}/truck-leases`, payload);
        toast.success("Naya lease add ho gaya");
      }
      setShowAddLease(false); setEditLease(null);
      setForm({ truck_no: "", owner_name: "", monthly_rent: "", start_date: "", end_date: "", advance_deposit: "" });
      fetchLeases();
    } catch (e) { toast.error(e.response?.data?.detail || "Error saving lease"); }
  };

  const handleDeleteLease = async (id) => {
    if (!window.confirm("Kya aap sure hain? Lease aur uske saare payments delete ho jayenge!")) return;
    try {
      await axios.delete(`${API}/truck-leases/${id}`);
      toast.success("Lease delete ho gaya");
      fetchLeases();
      if (selectedLease?.id === id) { setSelectedLease(null); setPaymentData(null); }
    } catch (e) { toast.error("Delete fail"); }
  };

  const handleSelectLease = async (lease) => {
    setSelectedLease(lease);
    try {
      const res = await axios.get(`${API}/truck-leases/${lease.id}/payments`);
      setPaymentData(res.data);
    } catch (e) { toast.error("Payment data load nahi hua"); }
  };

  const handlePay = async () => {
    try {
      await axios.post(`${API}/truck-leases/${selectedLease.id}/pay`, { ...payForm, amount: +payForm.amount, month: payMonth });
      toast.success(`Rs.${payForm.amount} payment ho gaya - ${fmtMonth(payMonth)}`);
      setShowPayDialog(false);
      setPayForm({ amount: "", account: "cash", bank_name: "", payment_date: new Date().toISOString().split("T")[0], notes: "" });
      handleSelectLease(selectedLease);
      fetchLeases();
    } catch (e) { toast.error(e.response?.data?.detail || "Payment fail"); }
  };

  const handleShowHistory = async (lease) => {
    try {
      const res = await axios.get(`${API}/truck-leases/${lease.id}/history`);
      setHistory(res.data);
      setShowHistory(true);
    } catch (e) { toast.error("History load nahi hua"); }
  };

  const handlePrintReceipt = (lease, month, record) => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Lease Receipt</title>
    <style>body{font-family:Arial,sans-serif;padding:30px;max-width:600px;margin:0 auto}
    .header{text-align:center;border-bottom:2px solid #333;padding-bottom:10px;margin-bottom:20px}
    .header h2{margin:0;font-size:18px} .header p{margin:4px 0;color:#666;font-size:12px}
    table{width:100%;border-collapse:collapse;margin:15px 0} td{padding:6px 10px;border:1px solid #ddd;font-size:13px}
    .label{font-weight:bold;width:40%;background:#f5f5f5} .amount{font-size:16px;font-weight:bold;color:#059669}
    .footer{margin-top:30px;font-size:11px;color:#999;text-align:center}</style></head>
    <body><div class="header"><h2>TRUCK LEASE PAYMENT RECEIPT</h2><p>Mill Entry System</p></div>
    <table><tr><td class="label">Truck No.</td><td>${lease.truck_no}</td></tr>
    <tr><td class="label">Owner</td><td>${lease.owner_name || '-'}</td></tr>
    <tr><td class="label">Month</td><td>${fmtMonth(month)}</td></tr>
    <tr><td class="label">Monthly Rent</td><td>Rs. ${fmtAmt(record.rent)}</td></tr>
    <tr><td class="label">Paid</td><td class="amount">Rs. ${fmtAmt(record.paid)}</td></tr>
    <tr><td class="label">Balance</td><td>Rs. ${fmtAmt(record.balance)}</td></tr>
    <tr><td class="label">Status</td><td>${record.status.toUpperCase()}</td></tr></table>
    <div class="footer">Generated on ${new Date().toLocaleDateString('en-IN')} | Mill Entry System</div></body></html>`;
    printHtml(html, `Lease Receipt - ${lease.truck_no} - ${month}`);
  };

  const totalRent = leases.reduce((s, l) => s + (l.monthly_rent || 0), 0);

  return (
    <div className="space-y-4" data-testid="leased-truck-tab">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-slate-700/50 border-slate-600"><CardContent className="p-4">
          <p className="text-slate-400 text-xs">Active Leases</p>
          <p className="text-2xl font-bold text-white" data-testid="lease-count">{leases.filter(l => l.status === "active").length}</p>
        </CardContent></Card>
        <Card className="bg-slate-700/50 border-slate-600"><CardContent className="p-4">
          <p className="text-slate-400 text-xs">Monthly Rent Total</p>
          <p className="text-2xl font-bold text-amber-400" data-testid="lease-total-rent">Rs. {fmtAmt(totalRent)}</p>
        </CardContent></Card>
        <Card className="bg-slate-700/50 border-slate-600"><CardContent className="p-4">
          <p className="text-slate-400 text-xs">Daily Rate (30 din base)</p>
          <p className="text-2xl font-bold text-cyan-400">Rs. {fmtAmt(Math.round(totalRent / 30))}/day</p>
        </CardContent></Card>
      </div>

      {/* Leases Table */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-white text-base">Leased Trucks</CardTitle>
          <div className="flex items-center gap-2">
            <Input placeholder="Search truck no. / owner..." value={searchText} onChange={e => setSearchText(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white w-52 h-8 text-xs" data-testid="lease-search" />
            <Button onClick={() => window.open(`${API}/truck-leases/export/pdf?kms_year=${filters.kms_year || ''}&season=${filters.season || ''}`, '_blank')}
              variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:text-white h-8 text-xs" data-testid="lease-export-pdf">PDF</Button>
            <Button onClick={() => window.open(`${API}/truck-leases/export/excel?kms_year=${filters.kms_year || ''}&season=${filters.season || ''}`, '_blank')}
              variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:text-white h-8 text-xs" data-testid="lease-export-excel">Excel</Button>
            <Button onClick={() => { setEditLease(null); setForm({ truck_no: "", owner_name: "", monthly_rent: "", start_date: "", end_date: "", advance_deposit: "" }); setShowAddLease(true); }}
              size="sm" className="bg-amber-500 hover:bg-amber-600 text-slate-900 h-8" data-testid="add-lease-btn">
              <Plus className="w-4 h-4 mr-1" /> New Lease
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700 text-slate-400 text-xs">
                <th className="text-left p-3">Truck No.</th><th className="text-left p-3">Owner</th>
                <th className="text-right p-3">Monthly Rent</th><th className="text-left p-3">Start Date</th>
                <th className="text-left p-3">End Date</th><th className="text-right p-3">Advance</th>
                <th className="text-center p-3">Status</th><th className="text-center p-3">Actions</th>
              </tr></thead>
              <tbody>
                {filteredLeases.length === 0 && <tr><td colSpan={8} className="text-center text-slate-500 py-8">Koi lease nahi mila</td></tr>}
                {filteredLeases.map(l => (
                  <tr key={l.id} className={`border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer ${selectedLease?.id === l.id ? "bg-amber-500/10" : ""}`}
                    onClick={() => handleSelectLease(l)} data-testid={`lease-row-${l.truck_no}`}>
                    <td className="p-3 font-mono text-white font-medium">{l.truck_no}</td>
                    <td className="p-3 text-slate-300">{l.owner_name || "-"}</td>
                    <td className="p-3 text-right text-amber-400 font-medium">Rs. {fmtAmt(l.monthly_rent)}</td>
                    <td className="p-3 text-slate-300">{l.start_date || "-"}</td>
                    <td className="p-3 text-slate-300">{l.end_date || "Ongoing"}</td>
                    <td className="p-3 text-right text-slate-300">Rs. {fmtAmt(l.advance_deposit || 0)}</td>
                    <td className="p-3 text-center"><Badge className={l.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-500/20 text-slate-400"}>{l.status}</Badge></td>
                    <td className="p-3 text-center">
                      <div className="flex gap-1 justify-center" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => { setEditLease(l); setForm({ truck_no: l.truck_no, owner_name: l.owner_name, monthly_rent: String(l.monthly_rent), start_date: l.start_date, end_date: l.end_date, advance_deposit: String(l.advance_deposit || 0) }); setShowAddLease(true); }}
                          className="text-blue-400 hover:text-blue-300 h-7 w-7 p-0"><Edit className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleShowHistory(l)}
                          className="text-cyan-400 hover:text-cyan-300 h-7 w-7 p-0"><History className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteLease(l.id)}
                          className="text-red-400 hover:text-red-300 h-7 w-7 p-0"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Payment Grid */}
      {selectedLease && paymentData && (
        <Card className="bg-slate-800 border-slate-700" data-testid="lease-payment-grid">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Truck className="w-5 h-5 text-amber-400" />
              {selectedLease.truck_no} - {selectedLease.owner_name || "Unknown"} | Monthly Payments
            </CardTitle>
            <div className="flex gap-4 text-sm mt-2">
              <span className="text-slate-400">Total Rent: <span className="text-white font-medium">Rs. {fmtAmt(paymentData.total_rent)}</span></span>
              <span className="text-slate-400">Paid: <span className="text-emerald-400 font-medium">Rs. {fmtAmt(paymentData.total_paid)}</span></span>
              <span className="text-slate-400">Balance: <span className="text-red-400 font-medium">Rs. {fmtAmt(paymentData.total_balance)}</span></span>
              {paymentData.advance_deposit > 0 && <span className="text-slate-400">Advance: <span className="text-cyan-400 font-medium">Rs. {fmtAmt(paymentData.advance_deposit)}</span></span>}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-700 text-slate-400 text-xs">
                  <th className="text-left p-3">Month</th><th className="text-right p-3">Rent</th>
                  <th className="text-right p-3">Paid</th><th className="text-right p-3">Balance</th>
                  <th className="text-center p-3">Status</th><th className="text-center p-3">Actions</th>
                </tr></thead>
                <tbody>
                  {paymentData.monthly_records.map(r => (
                    <tr key={r.month} className="border-b border-slate-700/50 hover:bg-slate-700/30" data-testid={`month-row-${r.month}`}>
                      <td className="p-3 text-white font-medium"><Calendar className="w-3.5 h-3.5 inline mr-1 text-slate-500" />{fmtMonth(r.month)}</td>
                      <td className="p-3 text-right text-slate-300">Rs. {fmtAmt(r.rent)}</td>
                      <td className="p-3 text-right text-emerald-400 font-medium">Rs. {fmtAmt(r.paid)}</td>
                      <td className="p-3 text-right text-red-400">Rs. {fmtAmt(r.balance)}</td>
                      <td className="p-3 text-center"><Badge className={STATUS_COLORS[r.status] || ""}>{r.status}</Badge></td>
                      <td className="p-3 text-center">
                        <div className="flex gap-1 justify-center">
                          {r.status !== "paid" && (
                            <Button variant="ghost" size="sm" onClick={() => { setPayMonth(r.month); setPayForm({ ...payForm, amount: String(r.balance) }); setShowPayDialog(true); }}
                              className="text-emerald-400 hover:text-emerald-300 h-7 px-2" data-testid={`pay-btn-${r.month}`}>
                              <CreditCard className="w-3.5 h-3.5 mr-1" /> Pay
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => handlePrintReceipt(selectedLease, r.month, r)}
                            className="text-slate-400 hover:text-white h-7 w-7 p-0" data-testid={`print-btn-${r.month}`}>
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Lease Dialog */}
      <Dialog open={showAddLease} onOpenChange={setShowAddLease}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader><DialogTitle>{editLease ? "Edit Lease" : "New Truck Lease"}</DialogTitle>
            <DialogDescription className="text-slate-400">Leased truck ki details bharein</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs text-slate-400">Truck Number *</label>
              <Input value={form.truck_no} onChange={e => setForm({ ...form, truck_no: e.target.value.toUpperCase() })}
                placeholder="OD15A1234" className="bg-slate-700 border-slate-600 text-white" data-testid="lease-truck-no" /></div>
            <div><label className="text-xs text-slate-400">Owner Name</label>
              <Input value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })}
                placeholder="Owner ka naam" className="bg-slate-700 border-slate-600 text-white" data-testid="lease-owner" /></div>
            <div><label className="text-xs text-slate-400">Monthly Rent (Rs.) *</label>
              <Input type="number" value={form.monthly_rent} onChange={e => setForm({ ...form, monthly_rent: e.target.value })}
                placeholder="120000" className="bg-slate-700 border-slate-600 text-white" data-testid="lease-rent" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-400">Start Date *</label>
                <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                  className="bg-slate-700 border-slate-600 text-white" data-testid="lease-start" /></div>
              <div><label className="text-xs text-slate-400">End Date (optional)</label>
                <Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })}
                  className="bg-slate-700 border-slate-600 text-white" data-testid="lease-end" /></div>
            </div>
            <div><label className="text-xs text-slate-400">Advance Deposit (Rs.)</label>
              <Input type="number" value={form.advance_deposit} onChange={e => setForm({ ...form, advance_deposit: e.target.value })}
                placeholder="0" className="bg-slate-700 border-slate-600 text-white" data-testid="lease-advance" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddLease(false)} className="text-slate-400">Cancel</Button>
            <Button onClick={handleAddLease} className="bg-amber-500 hover:bg-amber-600 text-slate-900" data-testid="lease-save-btn">
              {editLease ? "Update" : "Add Lease"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay Dialog */}
      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader><DialogTitle>Payment - {payMonth && fmtMonth(payMonth)}</DialogTitle>
            <DialogDescription className="text-slate-400">{selectedLease?.truck_no} - {selectedLease?.owner_name}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs text-slate-400">Amount (Rs.) *</label>
              <Input type="number" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })}
                className="bg-slate-700 border-slate-600 text-white" data-testid="pay-amount" /></div>
            <div><label className="text-xs text-slate-400">Account</label>
              <Select value={payForm.account} onValueChange={v => setPayForm({ ...payForm, account: v })}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                </SelectContent>
              </Select></div>
            {payForm.account === "bank" && (
              <div><label className="text-xs text-slate-400">Bank</label>
                <Select value={payForm.bank_name} onValueChange={v => setPayForm({ ...payForm, bank_name: v })}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white"><SelectValue placeholder="Bank select karein" /></SelectTrigger>
                  <SelectContent className="bg-slate-700 border-slate-600">
                    {bankAccounts.map(b => <SelectItem key={b.id} value={b.bank_name}>{b.bank_name}</SelectItem>)}
                  </SelectContent>
                </Select></div>
            )}
            <div><label className="text-xs text-slate-400">Payment Date</label>
              <Input type="date" value={payForm.payment_date} onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })}
                className="bg-slate-700 border-slate-600 text-white" data-testid="pay-date" /></div>
            <div><label className="text-xs text-slate-400">Notes</label>
              <Input value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })}
                placeholder="Optional notes" className="bg-slate-700 border-slate-600 text-white" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowPayDialog(false)} className="text-slate-400">Cancel</Button>
            <Button onClick={handlePay} className="bg-emerald-500 hover:bg-emerald-600 text-white" data-testid="pay-confirm-btn">
              <IndianRupee className="w-4 h-4 mr-1" /> Pay Rs. {payForm.amount || 0}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg">
          <DialogHeader><DialogTitle>Payment History</DialogTitle>
            <DialogDescription className="text-slate-400">All payments for this lease</DialogDescription></DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700 text-slate-400 text-xs">
                <th className="text-left p-2">Date</th><th className="text-left p-2">Month</th>
                <th className="text-right p-2">Amount</th><th className="text-left p-2">Account</th>
                <th className="text-left p-2">Notes</th>
              </tr></thead>
              <tbody>
                {history.length === 0 && <tr><td colSpan={5} className="text-center text-slate-500 py-4">Koi payment nahi mila</td></tr>}
                {history.map(p => (
                  <tr key={p.id} className="border-b border-slate-700/50">
                    <td className="p-2 text-slate-300">{p.payment_date}</td>
                    <td className="p-2 text-white">{fmtMonth(p.month)}</td>
                    <td className="p-2 text-right text-emerald-400 font-medium">Rs. {fmtAmt(p.amount)}</td>
                    <td className="p-2 text-slate-300">{p.account}{p.bank_name ? ` (${p.bank_name})` : ""}</td>
                    <td className="p-2 text-slate-400">{p.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
