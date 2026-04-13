import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, CreditCard, History, Printer, IndianRupee, Calendar, Truck, Edit, Send, Users } from "lucide-react";
import { printHtml } from "@/components/PrintButton";
import { useConfirm } from "./ConfirmProvider";
import { fmtDate } from "../utils/date";
import { downloadFile } from "../utils/download";
import { SendToGroupDialog } from "./SendToGroupDialog";
import { useMessagingEnabled } from "../hooks/useMessagingEnabled";
import logger from "../utils/logger";
const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = BACKEND_URL + "/api";

const STATUS_COLORS = {
  paid: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  partial: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  pending: "bg-red-500/20 text-red-400 border-red-500/30",
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtMonth(m) { const [y, mo] = m.split("-"); return `${MONTH_NAMES[parseInt(mo) - 1]} ${y}`; }
function fmtAmt(n) { return new Intl.NumberFormat("en-IN").format(Math.round(n)); }

export default function LeasedTruck({ filters }) {
  const showConfirm = useConfirm();
  const { wa } = useMessagingEnabled();
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
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupText, setGroupText] = useState("");
  const [groupPdfUrl, setGroupPdfUrl] = useState("");

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
    try { const res = await axios.get(`${API}/bank-accounts`); setBankAccounts(res.data); } catch (e) { logger.error(e); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!await showConfirm("Delete Lease", "Kya aap sure hain? Lease aur uske saare payments delete ho jayenge!")) return;
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
    const statusLabel = record.status === 'paid' ? 'PAID / भुगतान हो गया' : record.status === 'partial' ? 'PARTIAL / आंशिक भुगतान' : 'PENDING / बकाया';
    const statusColor = record.status === 'paid' ? '#059669' : record.status === 'partial' ? '#d97706' : '#dc2626';

    // Build payment history rows if available
    const paymentsHtml = (record.payments || []).map(p => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${fmtDate(p.date) || '-'}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-align: right; font-weight: bold; color: #059669;">Rs. ${fmtAmt(p.amount)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-transform: capitalize;">${p.account || 'cash'}${p.bank_name ? ' - ' + p.bank_name : ''}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">${p.notes || '-'}</td>
      </tr>
    `).join('');

    const hasPayments = (record.payments || []).length > 0;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Lease Receipt - ${lease.truck_no}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; background: #f5f5f5; }
      .invoice { max-width: 700px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
      .header { text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 15px; margin-bottom: 20px; }
      .header h1 { color: #f59e0b; font-size: 26px; margin-bottom: 4px; }
      .header p { color: #666; font-size: 13px; }
      .receipt-title { text-align: center; background: #0891b2; color: white; padding: 10px; border-radius: 6px; margin-bottom: 20px; font-size: 16px; letter-spacing: 0.5px; }
      .truck-info { background: #ecfeff; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center; }
      .truck-info h2 { color: #0e7490; font-size: 22px; margin-bottom: 4px; }
      .truck-info p { color: #155e75; font-size: 13px; }
      .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
      .detail-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
      .detail-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
      .detail-value { font-size: 16px; font-weight: bold; color: #1e293b; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      th { background: #1e293b; color: white; padding: 10px 12px; text-align: left; font-size: 12px; }
      .summary { background: #fef3c7; padding: 20px; border-radius: 8px; margin-top: 15px; }
      .summary-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #fbbf24; font-size: 14px; }
      .summary-row:last-child { border-bottom: none; }
      .summary-row.total { font-size: 20px; font-weight: bold; color: #1e293b; border-top: 2px solid #f59e0b; margin-top: 10px; padding-top: 12px; }
      .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
      .signature-box { text-align: center; }
      .signature-line { border-top: 1px solid #1e293b; margin-top: 50px; padding-top: 5px; font-size: 11px; color: #64748b; }
      .print-note { text-align: center; color: #94a3b8; font-size: 11px; margin-top: 20px; }
      .status-badge { display: inline-block; padding: 4px 16px; border-radius: 20px; font-size: 13px; font-weight: bold; color: white; background: ${statusColor}; }
      @media print { @page { size: A4; margin: 10mm; } body { background: white; padding: 0; } .invoice { box-shadow: none; max-width: 100%; } .no-print { display: none; } }
    </style></head>
    <body>
      <div class="invoice">
        <div class="header">
          <h1>Mill Entry System</h1>
          <p>Data Management Software</p>
        </div>
        <div class="receipt-title">TRUCK LEASE PAYMENT RECEIPT / ट्रक लीज भुगतान रसीद</div>
        <div class="truck-info">
          <h2>${lease.truck_no}</h2>
          <p>Owner: ${lease.owner_name || '-'} | Month: ${fmtMonth(month)} | Receipt Date: ${new Date().toLocaleDateString('en-IN')}</p>
        </div>

        <div class="details-grid">
          <div class="detail-box">
            <div class="detail-label">Monthly Rent / मासिक किराया</div>
            <div class="detail-value">Rs. ${fmtAmt(record.rent)}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Status / स्थिति</div>
            <div style="margin-top: 2px;"><span class="status-badge">${statusLabel}</span></div>
          </div>
          ${lease.start_date ? `<div class="detail-box"><div class="detail-label">Lease Start / लीज शुरू</div><div class="detail-value">${lease.start_date}</div></div>` : ''}
          ${lease.advance_deposit ? `<div class="detail-box"><div class="detail-label">Advance Deposit / अग्रिम जमा</div><div class="detail-value" style="color:#0891b2;">Rs. ${fmtAmt(lease.advance_deposit)}</div></div>` : ''}
        </div>

        ${hasPayments ? `
        <h3 style="font-size: 14px; color: #475569; margin-bottom: 10px;">Payment History / भुगतान विवरण</h3>
        <table>
          <thead><tr><th>Date / तारीख</th><th style="text-align:right;">Amount / राशि</th><th>Mode / माध्यम</th><th>Notes</th></tr></thead>
          <tbody>${paymentsHtml}</tbody>
        </table>` : ''}

        <div class="summary">
          <div class="summary-row">
            <span>Monthly Rent / मासिक किराया</span>
            <span>Rs. ${fmtAmt(record.rent)}</span>
          </div>
          <div class="summary-row total">
            <span>Total Paid / कुल भुगतान</span>
            <span style="color: #059669;">Rs. ${fmtAmt(record.paid)}</span>
          </div>
          <div class="summary-row" style="color: #dc2626; font-weight: bold;">
            <span>Balance Due / बकाया राशि</span>
            <span>Rs. ${fmtAmt(record.balance)}</span>
          </div>
        </div>

        <div class="signature-section">
          <div class="signature-box"><div class="signature-line">Truck Owner Signature / ट्रक मालिक हस्ताक्षर</div></div>
          <div class="signature-box"><div class="signature-line">Authorized Signature / अधिकृत हस्ताक्षर</div></div>
        </div>
        <div class="print-note">This is a computer generated receipt / यह कंप्यूटर जनित रसीद है</div>
      </div>
      <div class="no-print" style="text-align: center; margin-top: 20px;">
        <button onclick="window.print()" style="background: #0891b2; color: white; border: none; padding: 12px 30px; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold;">Print Receipt</button>
      </div>
    </body></html>`;
    printHtml(html, `Lease Receipt - ${lease.truck_no} - ${month}`);
  };

  const totalRent = leases.reduce((s, l) => s + (l.monthly_rent || 0), 0);

  // WhatsApp - Send lease summary for a specific truck
  const handleWhatsAppLease = async (lease) => {
    try {
      let waSettings;
      try { waSettings = (await axios.get(`${API}/whatsapp/settings`)).data; } catch(e) { waSettings = {}; }
      const hasDefaults = (waSettings.default_numbers || []).length > 0;
      let phone = "";
      if (!hasDefaults) {
        phone = prompt("WhatsApp number daalein (default numbers set nahi hain):");
        if (!phone) return;
      }
      const pdfUrl = `${API}/truck-leases/export/pdf?kms_year=${filters.kms_year || ''}&season=${filters.season || ''}`;
      const res = await axios.post(`${API}/whatsapp/send-truck-owner`, {
        truck_no: lease.truck_no,
        total_trips: 0,
        total_gross: lease.monthly_rent || 0,
        total_deductions: 0,
        total_net: lease.monthly_rent || 0,
        total_paid: 0,
        total_balance: lease.monthly_rent || 0,
        pdf_url: pdfUrl,
        phone
      });
      if (res.data.success) toast.success(res.data.message || "WhatsApp bhej diya!");
      else toast.error(res.data.error || res.data.message || "WhatsApp fail");
    } catch (e) { toast.error("WhatsApp error: " + (e.response?.data?.detail || e.response?.data?.error || e.message)); }
  };

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
            <Button onClick={() => downloadFile(`${API}/truck-leases/export/pdf?kms_year=${filters.kms_year || ''}&season=${filters.season || ''}`, `truck_leases_${filters.kms_year || 'all'}.pdf`)}
              variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:text-white h-8 text-xs" data-testid="lease-export-pdf">PDF</Button>
            <Button onClick={() => downloadFile(`${API}/truck-leases/export/excel?kms_year=${filters.kms_year || ''}&season=${filters.season || ''}`, `truck_leases_${filters.kms_year || 'all'}.xlsx`)}
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
                        {wa && <Button variant="ghost" size="sm" onClick={() => handleWhatsAppLease(l)}
                          className="text-green-400 hover:text-green-300 h-7 w-7 p-0" title="WhatsApp" data-testid={`lease-wa-${l.truck_no}`}><Send className="w-3.5 h-3.5" /></Button>}
                        {wa && <Button variant="ghost" size="sm" title="Send to Group" data-testid={`lease-group-${l.truck_no}`}
                          className="text-teal-400 hover:text-teal-300 h-7 w-7 p-0"
                          onClick={() => {
                            setGroupText(`*Truck Owner Payment / ट्रक मालिक भुगतान*\nTruck: *${l.truck_no}*\nOwner: ${l.owner_name || ''}\nMonthly Rent: Rs.${fmtAmt(l.monthly_rent || 0)}`);
                            setGroupPdfUrl("");
                            setGroupDialogOpen(true);
                          }}
                        ><Users className="w-3.5 h-3.5" /></Button>}
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
      <SendToGroupDialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen} text={groupText} pdfUrl={groupPdfUrl} />
    </div>
  );
}
