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
import { Plus, Trash2, FileText, IndianRupee, Edit, Download, Search, FileSpreadsheet, Printer, Clock, History, Undo2, Building2, CheckSquare, Receipt, Send } from "lucide-react";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const API = `${_isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '')}/api`;

import { fmtDate } from "@/utils/date";
import { useConfirm } from "./ConfirmProvider";

const HSN_MAP = {
  "Rice (Usna)": "1006 30 20", "Rice (Raw)": "1006 30 10",
  "Broken": "1006 40 00", "Kanki": "1006 40 00",
  "Bran": "2302 40 00", "Kunda": "2302 40 00", "Husk": "2302 40 00",
  "FRK": "1006 30 20", "Paddy": "1006 10 90",
};
const DEFAULT_GST = { "Rice (Usna)": 5, "Rice (Raw)": 5, "Broken": 5, "Kanki": 5, "Bran": 5, "Kunda": 5, "Husk": 5, "FRK": 5, "Paddy": 5 };
const GST_RATES = [0, 5, 12, 18, 28];

export default function SaleBook({ filters, user }) {
  const showConfirm = useConfirm();
  const [vouchers, setVouchers] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [obList, setObList] = useState([]);
  const [isObOpen, setIsObOpen] = useState(false);
  const [obForm, setObForm] = useState({ party_name: "", party_type: "Cash Party", amount: "", balance_type: "jama", note: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [payDialog, setPayDialog] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payAccount, setPayAccount] = useState("cash");
  const [payBankName, setPayBankName] = useState("");
  const [bankAccounts, setBankAccounts] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyParty, setHistoryParty] = useState("");
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchHistory = async (party) => {
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${API}/voucher-payment/history/${encodeURIComponent(party)}?party_type=Sale Book`);
      setHistoryData(res.data.history || []);
    } catch (e) { setHistoryData([]); }
    finally { setHistoryLoading(false); }
  };

  const openHistory = (party) => {
    setHistoryParty(party);
    setShowHistory(true);
    fetchHistory(party);
  };

  const emptyItem = { item_name: "", quantity: "", rate: "", unit: "Qntl", hsn_code: "", gst_percent: 5 };
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    party_name: "", invoice_no: "", buyer_gstin: "", buyer_address: "",
    items: [{ ...emptyItem }],
    gst_type: "none",
    truck_no: "", rst_no: "", remark: "", cash_paid: "", diesel_paid: "", advance: "", eway_bill_no: "",
    kms_year: filters.kms_year || "", season: filters.season || "",
  });

  const p = `kms_year=${filters.kms_year || ''}&season=${filters.season || ''}`;

  const fetchData = useCallback(async () => {
    try {
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
      const [vRes, sRes, obRes, bRes] = await Promise.all([
        axios.get(`${API}/sale-book?${p}${searchParam}`),
        axios.get(`${API}/sale-book/stock-items?${p}`),
        axios.get(`${API}/opening-balances?kms_year=${filters.kms_year || ''}`),
        axios.get(`${API}/bank-accounts`),
      ]);
      setVouchers(vRes.data);
      setStockItems(sRes.data);
      setObList(obRes.data);
      setBankAccounts(bRes.data || []);
    } catch (e) { console.error(e); }
  }, [p, filters.kms_year, searchQuery]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNewForm = () => {
    setEditingId(null);
    setForm({
      date: new Date().toISOString().split('T')[0], party_name: "", invoice_no: "",
      buyer_gstin: "", buyer_address: "",
      items: [{ ...emptyItem }], gst_type: "none",
      truck_no: "", rst_no: "", remark: "", cash_paid: "", diesel_paid: "", advance: "", eway_bill_no: "",
      kms_year: filters.kms_year || "", season: filters.season || "",
    });
    setIsFormOpen(true);
  };

  const openEditForm = (v) => {
    setEditingId(v.id);
    setForm({
      date: v.date || "", party_name: v.party_name || "", invoice_no: v.invoice_no || "",
      buyer_gstin: v.buyer_gstin || "", buyer_address: v.buyer_address || "",
      items: (v.items || []).map(i => ({ item_name: i.item_name, quantity: String(i.quantity || ""), rate: String(i.rate || ""), unit: i.unit || "Qntl", hsn_code: i.hsn_code || "", gst_percent: i.gst_percent ?? 5 })),
      gst_type: v.gst_type || "none",
      truck_no: v.truck_no || "", rst_no: v.rst_no || "", remark: v.remark || "", eway_bill_no: v.eway_bill_no || "",
      cash_paid: v.cash_paid ? String(v.cash_paid) : "", diesel_paid: v.diesel_paid ? String(v.diesel_paid) : "",
      advance: v.advance ? String(v.advance) : "",
      kms_year: v.kms_year || filters.kms_year || "", season: v.season || filters.season || "",
    });
    setIsFormOpen(true);
  };

  const updateItem = (idx, field, value) => {
    setForm(prev => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: value };
      if (field === 'item_name' && value) {
        items[idx].hsn_code = HSN_MAP[value] || items[idx].hsn_code || "";
        items[idx].gst_percent = DEFAULT_GST[value] ?? items[idx].gst_percent ?? 5;
      }
      return { ...prev, items };
    });
  };
  const addItem = () => setForm(prev => ({ ...prev, items: [...prev.items, { ...emptyItem }] }));
  const removeItem = (idx) => setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  const subtotal = form.items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0), 0);
  const isGst = form.gst_type !== 'none';
  const totalItemGst = isGst ? form.items.reduce((sum, item) => {
    const amt = (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);
    return sum + amt * (item.gst_percent || 0) / 100;
  }, 0) : 0;
  const cgstAmt = form.gst_type === 'cgst_sgst' ? totalItemGst / 2 : 0;
  const sgstAmt = form.gst_type === 'cgst_sgst' ? totalItemGst / 2 : 0;
  const igstAmt = form.gst_type === 'igst' ? totalItemGst : 0;
  const total = subtotal + cgstAmt + sgstAmt + igstAmt;
  const advanceAmt = parseFloat(form.advance) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.party_name.trim()) { toast.error("Party name daalna zaroori hai"); return; }
    if (!form.items.some(i => i.item_name && parseFloat(i.quantity) > 0)) {
      toast.error("Kam se kam ek item add karein"); return;
    }
    try {
      const payload = {
        ...form,
        items: form.items.filter(i => i.item_name && parseFloat(i.quantity) > 0).map(i => ({
          item_name: i.item_name, quantity: parseFloat(i.quantity) || 0, rate: parseFloat(i.rate) || 0, unit: i.unit || "Qntl",
          hsn_code: i.hsn_code || "", gst_percent: parseFloat(i.gst_percent) || 0,
        })),
        cash_paid: parseFloat(form.cash_paid) || 0, diesel_paid: parseFloat(form.diesel_paid) || 0,
        advance: parseFloat(form.advance) || 0,
      };
      if (editingId) {
        await axios.put(`${API}/sale-book/${editingId}?username=${user.username}&role=${user.role}`, payload);
        toast.success("Voucher update ho gaya!");
      } else {
        await axios.post(`${API}/sale-book?username=${user.username}&role=${user.role}`, payload);
        toast.success("Sale voucher save ho gaya!");
      }
      setIsFormOpen(false); setEditingId(null); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Save error"); }
  };

  const handleDelete = async (id) => {
    if (!await showConfirm("Delete Voucher", "Kya aap ye voucher delete karna chahte hain?")) return;
    try {
      await axios.delete(`${API}/sale-book/${id}?username=${user.username}&role=${user.role}`);
      toast.success("Voucher delete ho gaya"); setSelectedIds(prev => prev.filter(x => x !== id)); fetchData();
    } catch { toast.error("Delete error"); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!await showConfirm("Bulk Delete", `Kya aap ${selectedIds.length} sale vouchers delete karna chahte hain? Cash Book entries bhi delete hongi.`)) return;
    try {
      await axios.post(`${API}/sale-book/delete-bulk`, { ids: selectedIds });
      toast.success(`${selectedIds.length} vouchers delete ho gaye!`);
      setSelectedIds([]);
      fetchData();
    } catch (e) { toast.error("Bulk delete error"); }
  };

  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = () => setSelectedIds(prev => prev.length === vouchers.length ? [] : vouchers.map(v => v.id));

  const handleExportPDF = () => {
    const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
    window.open(`${API}/sale-book/export/pdf?${p}${searchParam}`, '_blank');
  };

  const handleExportExcel = async () => {
    try {
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
      const res = await axios.get(`${API}/sale-book/export/excel?${p}${searchParam}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url;
      a.download = `sale_book_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click(); setTimeout(() => window.URL.revokeObjectURL(url), 30000);
      toast.success("Excel export ho gaya!");
    } catch { toast.error("Excel export failed"); }
  };

  const handlePayment = async () => {
    if (!payDialog || !payAmount || parseFloat(payAmount) <= 0) { toast.error("Amount daalna zaroori hai"); return; }
    if (payAccount === "bank" && !payBankName) { toast.error("Bank account select karein"); return; }
    try {
      await axios.post(`${API}/voucher-payment`, {
        voucher_type: "sale", voucher_id: payDialog.id, amount: parseFloat(payAmount),
        date: payDate, notes: payNotes, username: user.username,
        kms_year: filters.kms_year || "", season: filters.season || "",
        account: payAccount, bank_name: payAccount === "bank" ? payBankName : "",
      });
      toast.success("Payment record ho gayi!"); setPayDialog(null); setPayAmount(""); setPayNotes(""); setPayAccount("cash"); setPayBankName(""); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Payment error"); }
  };

  const handleUndoPayment = async (paymentId) => {
    if (!await showConfirm("Undo Payment", "Kya aap payment undo karna chahte hain? Cash Book se bhi entry hat jayegi.")) return;
    try {
      await axios.post(`${API}/voucher-payment/undo`, { payment_id: paymentId });
      toast.success("Payment undo ho gayi!");
      if (historyParty) fetchHistory(historyParty);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Undo error"); }
  };

  const handlePrintInvoice = (v) => {
    window.open(`${API}/sale-book/${v.id}/pdf`, '_blank');
  };

  const getStockForItem = (itemName) => {
    const s = stockItems.find(i => i.name === itemName);
    return s ? s.available_qntl : null;
  };

  // Opening Balance
  const handleObSubmit = async (e) => {
    e.preventDefault();
    if (!obForm.party_name.trim() || !parseFloat(obForm.amount)) { toast.error("Party name aur amount daalo"); return; }
    try {
      await axios.post(`${API}/opening-balances?username=${user.username}&role=${user.role}`, {
        ...obForm, amount: parseFloat(obForm.amount) || 0,
        kms_year: filters.kms_year || "", season: filters.season || "",
      });
      toast.success("Opening balance save ho gaya!");
      setIsObOpen(false);
      setObForm({ party_name: "", party_type: "Cash Party", amount: "", balance_type: "jama", note: "" });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Save error"); }
  };

  const handleObDelete = async (id) => {
    if (!await showConfirm("Delete", "Delete opening balance?")) return;
    try {
      await axios.delete(`${API}/opening-balances/${id}?username=${user.username}&role=${user.role}`);
      toast.success("Deleted"); fetchData();
    } catch { toast.error("Delete error"); }
  };

  // WhatsApp Sale Voucher Send
  const [waSending, setWaSending] = useState(null);
  const handleWhatsAppSend = async (v) => {
    setWaSending(v.id);
    try {
      let waSettings = {};
      try { waSettings = (await axios.get(`${API}/whatsapp/settings`)).data; } catch(e) { waSettings = {}; }
      let phone = "";
      const defNums = waSettings.default_numbers || [];
      if (!defNums.length) {
        phone = prompt("WhatsApp number daalein (default numbers set nahi hain):");
        if (!phone) { setWaSending(null); return; }
      }
      const res = await axios.post(`${API}/sale-book/${v.id}/whatsapp-send`, { phone });
      if (res.data.success) toast.success(res.data.message || "WhatsApp pe bhej diya!");
      else toast.error(res.data.error || "WhatsApp send fail");
    } catch(e) { toast.error("WhatsApp error: " + (e.response?.data?.detail || e.message)); }
    finally { setWaSending(null); }
  };

  // GST Summary: HSN-wise tax breakup
  const [gstSummaryVoucher, setGstSummaryVoucher] = useState(null);
  const buildGstSummary = (voucher) => {
    if (!voucher || voucher.gst_type === 'none') return [];
    const hsnMap = {};
    (voucher.items || []).forEach(item => {
      const hsn = item.hsn_code || 'N/A';
      const gstPct = item.gst_percent || 0;
      const key = `${hsn}__${gstPct}`;
      if (!hsnMap[key]) hsnMap[key] = { hsn, gst_percent: gstPct, taxable: 0, gst_amount: 0 };
      const amt = (item.quantity || 0) * (item.rate || 0);
      hsnMap[key].taxable += amt;
      hsnMap[key].gst_amount += (item.gst_amount || amt * gstPct / 100);
    });
    return Object.values(hsnMap);
  };

  return (
    <div className="space-y-4" data-testid="sale-book">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-amber-400 flex items-center gap-2">
          <FileText className="w-5 h-5" /> Sale Book (बिक्री खाता)
        </h2>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={handleExportPDF} variant="outline" size="sm" className="border-red-600 text-red-400 hover:bg-red-900/30" data-testid="sale-book-pdf-btn">
            <Download className="w-3 h-3 mr-1" /> PDF
          </Button>
          <Button onClick={handleExportExcel} variant="outline" size="sm" className="border-green-600 text-green-400 hover:bg-green-900/30" data-testid="sale-book-excel-btn">
            <FileSpreadsheet className="w-3 h-3 mr-1" /> Excel
          </Button>
          <Button onClick={openNewForm} className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold" data-testid="sale-book-add-btn">
            <Plus className="w-4 h-4 mr-1" /> New Sale
          </Button>
        </div>
      </div>

      {/* Search Filter */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search: Party, Invoice No, RST, Truck..."
            className="bg-slate-800 border-slate-700 text-white pl-8 h-8 text-sm" data-testid="sale-book-search" />
        </div>
        {searchQuery && (
          <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")} className="text-slate-400 h-8 text-xs">Clear</Button>
        )}
        {selectedIds.length > 0 && (
          <Button onClick={handleBulkDelete} variant="outline" size="sm" className="border-red-600 text-red-400 hover:bg-red-900/30" data-testid="sv-bulk-delete-btn">
            <Trash2 className="w-3 h-3 mr-1" /> Delete Selected ({selectedIds.length})
          </Button>
        )}
      </div>

      {/* Stock Overview */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
        {stockItems.map(item => (
          <Card key={item.name} className="bg-slate-800/50 border-slate-700 p-2">
            <div className="text-[10px] text-slate-400 truncate">{item.name}</div>
            <div className={`text-sm font-bold ${item.available_qntl > 0 ? 'text-emerald-400' : item.available_qntl < 0 ? 'text-red-400' : 'text-slate-500'}`}>
              {item.available_qntl} Q
            </div>
          </Card>
        ))}
      </div>

      {/* Vouchers Table */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-400 text-xs w-8">
                  <input type="checkbox" checked={vouchers.length > 0 && selectedIds.length === vouchers.length}
                    onChange={toggleSelectAll} className="accent-amber-500 w-3.5 h-3.5 cursor-pointer" data-testid="sv-select-all" />
                </TableHead>
                <TableHead className="text-slate-400 text-xs">No.</TableHead>
                <TableHead className="text-slate-400 text-xs">Date</TableHead>
                <TableHead className="text-slate-400 text-xs">Inv No.</TableHead>
                <TableHead className="text-slate-400 text-xs">Party</TableHead>
                <TableHead className="text-slate-400 text-xs">Items</TableHead>
                <TableHead className="text-slate-400 text-xs text-right">Total</TableHead>
                <TableHead className="text-slate-400 text-xs text-right">Advance</TableHead>
                <TableHead className="text-slate-400 text-xs text-right">Cash</TableHead>
                <TableHead className="text-slate-400 text-xs text-right">Diesel</TableHead>
                <TableHead className="text-slate-400 text-xs text-right">Balance</TableHead>
                <TableHead className="text-slate-400 text-xs w-40"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchers.length === 0 && (
                <TableRow><TableCell colSpan={12} className="text-center text-slate-500 py-8">
                  {searchQuery ? "Koi result nahi mila." : "Koi sale voucher nahi hai."}
                </TableCell></TableRow>
              )}
              {vouchers.map(v => (
                <TableRow key={v.id} className={`border-slate-700 hover:bg-slate-700/30 ${selectedIds.includes(v.id) ? 'bg-amber-500/10' : ''}`}>
                  <TableCell>
                    <input type="checkbox" checked={selectedIds.includes(v.id)} onChange={() => toggleSelect(v.id)}
                      className="accent-amber-500 w-3.5 h-3.5 cursor-pointer" data-testid={`sv-select-${v.id}`} />
                  </TableCell>
                  <TableCell className="text-amber-400 font-mono text-xs">#{v.voucher_no}</TableCell>
                  <TableCell className="text-white text-xs">{fmtDate(v.date)}</TableCell>
                  <TableCell className="text-slate-300 text-xs">{v.invoice_no || '-'}</TableCell>
                  <TableCell className="text-white text-sm font-medium">{v.party_name}</TableCell>
                  <TableCell className="text-slate-300 text-xs max-w-[180px] truncate">{(v.items || []).map(i => `${i.item_name}(${i.quantity}Q)`).join(', ')}</TableCell>
                  <TableCell className="text-emerald-400 font-bold text-xs text-right">Rs.{v.total?.toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-blue-400 text-xs text-right">{v.advance ? `Rs.${v.advance.toLocaleString('en-IN')}` : '-'}</TableCell>
                  <TableCell className="text-white text-xs text-right">{v.cash_paid ? `Rs.${v.cash_paid.toLocaleString('en-IN')}` : '-'}</TableCell>
                  <TableCell className="text-orange-400 text-xs text-right">{v.diesel_paid ? `Rs.${v.diesel_paid.toLocaleString('en-IN')}` : '-'}</TableCell>
                  <TableCell className={`font-bold text-xs text-right ${(v.ledger_balance != null ? v.ledger_balance : (v.balance || 0)) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    Rs.{(v.ledger_balance != null ? v.ledger_balance : (v.balance || 0))?.toLocaleString('en-IN')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5 flex-nowrap">
                    {(v.ledger_balance != null ? v.ledger_balance : (v.balance || 0)) <= 0 && (v.total || 0) > 0 ? (
                      <>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 whitespace-nowrap" data-testid={`sv-paid-badge-${v.id}`}>Paid</span>
                        <Button variant="ghost" size="sm" onClick={() => openHistory(v.party_name)} className="text-sky-400 hover:text-sky-300 h-6 w-6 p-0" title="Payment History" data-testid={`sv-history-${v.id}`}>
                          <Clock className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setPayDialog(v); setPayAmount(""); setPayNotes(""); setPayDate(new Date().toISOString().split('T')[0]); setPayAccount("cash"); setPayBankName(""); }} className="text-emerald-400 hover:text-emerald-300 h-6 w-6 p-0" title="Aur Payment" data-testid={`sv-pay-more-${v.id}`}>
                          <IndianRupee className="w-3 h-3" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => { setPayDialog(v); setPayAmount(""); setPayNotes(""); setPayDate(new Date().toISOString().split('T')[0]); setPayAccount("cash"); setPayBankName(""); }} className="text-emerald-400 hover:text-emerald-300 h-6 w-6 p-0" title="Payment Receive" data-testid={`sv-pay-${v.id}`}>
                          <IndianRupee className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openHistory(v.party_name)} className="text-sky-400 hover:text-sky-300 h-6 w-6 p-0" title="Payment History" data-testid={`sv-history-${v.id}`}>
                          <Clock className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => handleWhatsAppSend(v)} disabled={waSending === v.id} className="text-green-400 hover:text-green-300 h-6 w-6 p-0" title="WhatsApp Send" data-testid={`sv-whatsapp-${v.id}`}>
                      <Send className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handlePrintInvoice(v)} className="text-purple-400 hover:text-purple-300 h-6 w-6 p-0" title="Print Invoice" data-testid={`sv-print-${v.id}`}>
                      <Printer className="w-3 h-3" />
                    </Button>
                    {v.gst_type && v.gst_type !== 'none' && (
                      <Button variant="ghost" size="sm" onClick={() => setGstSummaryVoucher(v)} className="text-amber-400 hover:text-amber-300 h-6 w-6 p-0" title="GST Summary" data-testid={`sv-gst-summary-${v.id}`}>
                        <Receipt className="w-3 h-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => openEditForm(v)} className="text-blue-400 hover:text-blue-300 h-6 w-6 p-0" data-testid={`sv-edit-${v.id}`}>
                      <Edit className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(v.id)} className="text-red-400 hover:text-red-300 h-6 w-6 p-0" data-testid={`sv-del-${v.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Sale Voucher Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={v => { setIsFormOpen(v); if (!v) setEditingId(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700 text-white" data-testid="sale-voucher-form">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <FileText className="w-5 h-5" /> {editingId ? 'Edit Sale Voucher' : 'New Sale Voucher (बिक्री वाउचर)'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Row 1: Invoice No, Date */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Invoice No.</Label>
                <Input value={form.invoice_no} onChange={e => setForm(p => ({ ...p, invoice_no: e.target.value }))}
                  placeholder="INV-001" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-form-invoice" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="sv-form-date" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Party Name *</Label>
                <Input value={form.party_name} onChange={e => setForm(p => ({ ...p, party_name: e.target.value }))}
                  placeholder="Party / Buyer" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="sv-form-party" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">RST No</Label>
                <Input value={form.rst_no} onChange={e => setForm(p => ({ ...p, rst_no: e.target.value }))}
                  placeholder="RST Number" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-form-rst" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">E-Way Bill No</Label>
                <Input value={form.eway_bill_no} onChange={e => setForm(p => ({ ...p, eway_bill_no: e.target.value }))}
                  placeholder="E-Way Bill Number" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-form-eway" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Truck No</Label>
                <Input value={form.truck_no} onChange={e => setForm(p => ({ ...p, truck_no: e.target.value }))}
                  placeholder="Vehicle Number" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-form-truck" />
              </div>
            </div>

            {/* Items Section */}
            <div className="border border-slate-600 rounded-lg overflow-hidden">
              <div className="bg-slate-700/50 px-3 py-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-400">Items (सामान)</span>
                <Button type="button" onClick={addItem} size="sm" variant="ghost" className="h-6 text-emerald-400 hover:text-emerald-300 text-xs" data-testid="sv-add-item">
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-600">
                    <TableHead className="text-slate-400 text-[10px] w-[25%]">Item</TableHead>
                    <TableHead className="text-slate-400 text-[10px] w-[10%]">Stock</TableHead>
                    <TableHead className="text-slate-400 text-[10px] w-[12%]">Qty</TableHead>
                    <TableHead className="text-slate-400 text-[10px] w-[10%]">Rate</TableHead>
                    <TableHead className="text-slate-400 text-[10px] w-[13%]">HSN</TableHead>
                    {isGst && <TableHead className="text-slate-400 text-[10px] w-[10%]">GST%</TableHead>}
                    <TableHead className="text-slate-400 text-[10px] w-[12%] text-right">Amount</TableHead>
                    <TableHead className="text-slate-400 text-[10px] w-[5%]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {form.items.map((item, idx) => {
                    const stock = getStockForItem(item.item_name);
                    const amt = (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);
                    const itemGst = isGst ? amt * (item.gst_percent || 0) / 100 : 0;
                    return (
                      <TableRow key={idx} className="border-slate-600">
                        <TableCell className="p-1">
                          <Select value={item.item_name || "_none"} onValueChange={v => updateItem(idx, 'item_name', v === "_none" ? "" : v)}>
                            <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid={`sv-item-name-${idx}`}><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">-- Select --</SelectItem>
                              {stockItems.map(si => (<SelectItem key={si.name} value={si.name}>{si.name} ({si.available_qntl} Q)</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="p-1">
                          {stock !== null && <span className={`text-xs font-medium ${stock > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{stock} Q</span>}
                        </TableCell>
                        <TableCell className="p-1">
                          <Input type="number" step="0.01" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)}
                            className="bg-slate-700 border-slate-600 text-white h-8 text-xs" placeholder="0" data-testid={`sv-item-qty-${idx}`} />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input type="number" step="0.01" value={item.rate} onChange={e => updateItem(idx, 'rate', e.target.value)}
                            className="bg-slate-700 border-slate-600 text-white h-8 text-xs" placeholder="0" data-testid={`sv-item-rate-${idx}`} />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input value={item.hsn_code} onChange={e => updateItem(idx, 'hsn_code', e.target.value)}
                            className="bg-slate-700 border-slate-600 text-white h-8 text-xs" placeholder="HSN" data-testid={`sv-item-hsn-${idx}`} />
                        </TableCell>
                        {isGst && (
                          <TableCell className="p-1">
                            <Select value={String(item.gst_percent ?? 5)} onValueChange={v => updateItem(idx, 'gst_percent', parseFloat(v))}>
                              <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid={`sv-item-gst-${idx}`}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {GST_RATES.map(r => (<SelectItem key={r} value={String(r)}>{r}%</SelectItem>))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        )}
                        <TableCell className="p-1 text-right">
                          <span className="text-white text-xs font-medium">Rs.{amt.toLocaleString('en-IN')}</span>
                          {isGst && itemGst > 0 && <span className="text-emerald-400 text-[9px] block">+{itemGst.toFixed(0)} GST</span>}
                        </TableCell>
                        <TableCell className="p-1">
                          {form.items.length > 1 && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="h-6 w-6 p-0 text-red-400"><Trash2 className="w-3 h-3" /></Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="text-right text-sm font-bold text-white">Subtotal: Rs.{subtotal.toLocaleString('en-IN')}</div>

            {/* GST Type Toggle */}
            <div className="border border-slate-600 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-3">
                <Label className="text-xs text-amber-400 font-semibold flex items-center gap-1"><Receipt className="w-3 h-3" /> GST</Label>
                <Select value={form.gst_type} onValueChange={v => setForm(p => ({ ...p, gst_type: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-44" data-testid="sv-gst-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No GST (बिना GST)</SelectItem>
                    <SelectItem value="cgst_sgst">CGST + SGST (State)</SelectItem>
                    <SelectItem value="igst">IGST (Interstate)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isGst && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="bg-slate-700/50 rounded p-2">
                    <span className="text-slate-400">Taxable:</span>
                    <span className="text-white font-bold ml-1">Rs.{subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                  </div>
                  {form.gst_type === 'cgst_sgst' && (<>
                    <div className="bg-slate-700/50 rounded p-2">
                      <span className="text-slate-400">CGST:</span>
                      <span className="text-emerald-400 font-bold ml-1">Rs.{cgstAmt.toFixed(2)}</span>
                    </div>
                    <div className="bg-slate-700/50 rounded p-2">
                      <span className="text-slate-400">SGST:</span>
                      <span className="text-emerald-400 font-bold ml-1">Rs.{sgstAmt.toFixed(2)}</span>
                    </div>
                  </>)}
                  {form.gst_type === 'igst' && (
                    <div className="bg-slate-700/50 rounded p-2">
                      <span className="text-slate-400">IGST:</span>
                      <span className="text-emerald-400 font-bold ml-1">Rs.{igstAmt.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="bg-slate-700/50 rounded p-2">
                    <span className="text-slate-400">Total GST:</span>
                    <span className="text-amber-400 font-bold ml-1">Rs.{totalItemGst.toFixed(2)}</span>
                  </div>
                </div>
              )}
              {isGst && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[10px] text-slate-400">Buyer GSTIN</Label>
                    <Input value={form.buyer_gstin} onChange={e => setForm(p => ({ ...p, buyer_gstin: e.target.value }))}
                      placeholder="21AAAAA0000A1Z5" className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="sv-buyer-gstin" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-400">Buyer Address</Label>
                    <Input value={form.buyer_address} onChange={e => setForm(p => ({ ...p, buyer_address: e.target.value }))}
                      placeholder="Buyer address" className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="sv-buyer-address" />
                  </div>
                </div>
              )}
            </div>

            {/* Total + Truck + Payment */}
            <div className="bg-slate-700/50 rounded-lg p-3 space-y-3">
              <div className="flex justify-between items-center text-lg font-bold">
                <span className="text-slate-300">Grand Total:</span>
                <span className="text-emerald-400" data-testid="sv-grand-total">Rs.{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>

              {/* Cash + Diesel Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] text-slate-400">Cash (Truck ko)</Label>
                  <Input type="number" step="0.01" value={form.cash_paid} onChange={e => setForm(p => ({ ...p, cash_paid: e.target.value }))}
                    placeholder="0" className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="sv-cash-paid" />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400">Diesel (Pump se)</Label>
                  <Input type="number" step="0.01" value={form.diesel_paid} onChange={e => setForm(p => ({ ...p, diesel_paid: e.target.value }))}
                    placeholder="0" className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="sv-diesel-paid" />
                </div>
              </div>

              {/* Advance + Balance */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] text-blue-400 font-semibold">Advance (Party se mila)</Label>
                  <Input type="number" step="0.01" value={form.advance} onChange={e => setForm(p => ({ ...p, advance: e.target.value }))}
                    placeholder="0" className="bg-slate-700 border-blue-600 text-white h-8 text-xs" data-testid="sv-advance" />
                </div>
                <div className="flex flex-col justify-end">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400">Balance (Party par baki): </span>
                    <span className={`text-sm font-bold ${(total - advanceAmt) > 0 ? 'text-red-400' : 'text-emerald-400'}`} data-testid="sv-balance">
                      Rs.{(total - advanceAmt).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs text-slate-400">Remark</Label>
              <Input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))}
                placeholder="Optional remark" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-remark" />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold flex-1" data-testid="sv-submit">
                <IndianRupee className="w-4 h-4 mr-1" /> {editingId ? 'Update Voucher' : 'Save Sale Voucher'}
              </Button>
              <Button type="button" variant="outline" className="border-slate-600 text-slate-300" onClick={() => { setIsFormOpen(false); setEditingId(null); }}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={!!payDialog} onOpenChange={v => { if (!v) setPayDialog(null); }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-sm" data-testid="sv-pay-dialog">
          <DialogHeader><DialogTitle className="text-emerald-400 flex items-center gap-2"><IndianRupee className="w-5 h-5" /> Payment Receive / पैसा प्राप्त</DialogTitle></DialogHeader>
          {payDialog && (
            <div className="space-y-3">
              <div className="bg-slate-900 p-3 rounded border border-slate-700 text-xs space-y-1">
                <p><span className="text-slate-400">Party:</span> <span className="text-white font-medium">{payDialog.party_name}</span></p>
                <p><span className="text-slate-400">Invoice:</span> <span className="text-white">{payDialog.invoice_no || '-'}</span></p>
                <p><span className="text-slate-400">Total:</span> <span className="text-emerald-400 font-bold">Rs.{payDialog.total?.toLocaleString('en-IN')}</span></p>
                <p><span className="text-slate-400">Balance Due:</span> <span className="text-red-400 font-bold">Rs.{(payDialog.ledger_balance != null ? payDialog.ledger_balance : payDialog.balance)?.toLocaleString('en-IN')}</span></p>
              </div>
              <div><Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-pay-date" /></div>
              <div><Label className="text-xs text-slate-400">Payment Mode</Label>
                <Select value={payAccount} onValueChange={v => { setPayAccount(v); if (v === "cash") setPayBankName(""); }}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-pay-account">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="cash" className="text-white">Cash (नकद)</SelectItem>
                    <SelectItem value="bank" className="text-white">Bank (बैंक)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {payAccount === "bank" && (
                <div><Label className="text-xs text-slate-400">Bank Account</Label>
                  <Select value={payBankName} onValueChange={setPayBankName}>
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-pay-bank">
                      <SelectValue placeholder="Bank select karein" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-600">
                      {bankAccounts.map(b => (
                        <SelectItem key={b.id} value={b.name} className="text-white">{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div><Label className="text-xs text-slate-400">Amount (Rs.) *</Label>
                <Input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={`Max: ${payDialog.ledger_balance != null ? payDialog.ledger_balance : payDialog.balance}`}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-sm" autoFocus data-testid="sv-pay-amount" /></div>
              <div><Label className="text-xs text-slate-400">Notes</Label>
                <Input value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Optional" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-pay-notes" /></div>
              <Button onClick={handlePayment} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white" data-testid="sv-pay-submit">
                {payAccount === "bank" ? `Bank (${payBankName || '...'}) mein Record Karein` : "Cash mein Record Karein"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-white" data-testid="sv-history-dialog">
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
                  <div key={idx} className="p-3 rounded-lg border bg-slate-700/50 border-slate-600">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-emerald-400 font-bold">+Rs.{Math.abs(record.amount).toLocaleString('en-IN')}</p>
                        <p className="text-slate-400 text-xs">{record.note || 'Payment'}</p>
                      </div>
                      <div className="text-right flex items-start gap-2">
                        <div>
                          <p className="text-slate-400 text-xs">{new Date(record.date).toLocaleDateString('hi-IN')}</p>
                          <p className="text-slate-500 text-xs">by {record.by}</p>
                        </div>
                        {record.can_undo && (
                          <Button variant="ghost" size="sm" onClick={() => handleUndoPayment(record.payment_id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-400/10 h-6 w-6 p-0" title="Undo Payment" data-testid={`sv-undo-${idx}`}>
                            <Undo2 className="w-3 h-3" />
                          </Button>
                        )}
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

      {/* GST Summary Dialog - HSN-wise Tax Breakup */}
      <Dialog open={!!gstSummaryVoucher} onOpenChange={() => setGstSummaryVoucher(null)}>
        <DialogContent className="max-w-lg bg-slate-800 border-slate-700 text-white" data-testid="gst-summary-dialog">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <Receipt className="w-5 h-5" /> GST Summary - HSN Breakup
            </DialogTitle>
          </DialogHeader>
          {gstSummaryVoucher && (
            <div className="space-y-3">
              <div className="flex justify-between text-sm text-slate-300 border-b border-slate-600 pb-2">
                <span>Party: {gstSummaryVoucher.party_name}</span>
                <span>#{gstSummaryVoucher.voucher_no} | {fmtDate(gstSummaryVoucher.date)}</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-600">
                    <TableHead className="text-amber-400 text-xs">HSN Code</TableHead>
                    <TableHead className="text-amber-400 text-xs">GST%</TableHead>
                    <TableHead className="text-amber-400 text-xs text-right">Taxable Amt</TableHead>
                    {gstSummaryVoucher.gst_type === 'cgst_sgst' && <>
                      <TableHead className="text-amber-400 text-xs text-right">CGST</TableHead>
                      <TableHead className="text-amber-400 text-xs text-right">SGST</TableHead>
                    </>}
                    {gstSummaryVoucher.gst_type === 'igst' && (
                      <TableHead className="text-amber-400 text-xs text-right">IGST</TableHead>
                    )}
                    <TableHead className="text-amber-400 text-xs text-right">Total Tax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buildGstSummary(gstSummaryVoucher).map((row, idx) => (
                    <TableRow key={idx} className="border-slate-600">
                      <TableCell className="text-white text-xs font-mono">{row.hsn}</TableCell>
                      <TableCell className="text-slate-300 text-xs">{row.gst_percent}%</TableCell>
                      <TableCell className="text-white text-xs text-right">Rs.{row.taxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</TableCell>
                      {gstSummaryVoucher.gst_type === 'cgst_sgst' && <>
                        <TableCell className="text-emerald-400 text-xs text-right">Rs.{(row.gst_amount / 2).toFixed(2)}</TableCell>
                        <TableCell className="text-emerald-400 text-xs text-right">Rs.{(row.gst_amount / 2).toFixed(2)}</TableCell>
                      </>}
                      {gstSummaryVoucher.gst_type === 'igst' && (
                        <TableCell className="text-emerald-400 text-xs text-right">Rs.{row.gst_amount.toFixed(2)}</TableCell>
                      )}
                      <TableCell className="text-amber-400 text-xs text-right font-bold">Rs.{row.gst_amount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-slate-600 bg-slate-700/50">
                    <TableCell colSpan={2} className="text-white text-xs font-bold">TOTAL</TableCell>
                    <TableCell className="text-white text-xs text-right font-bold">
                      Rs.{(gstSummaryVoucher.subtotal || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </TableCell>
                    {gstSummaryVoucher.gst_type === 'cgst_sgst' && <>
                      <TableCell className="text-emerald-400 text-xs text-right font-bold">Rs.{(gstSummaryVoucher.cgst_amount || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-emerald-400 text-xs text-right font-bold">Rs.{(gstSummaryVoucher.sgst_amount || 0).toFixed(2)}</TableCell>
                    </>}
                    {gstSummaryVoucher.gst_type === 'igst' && (
                      <TableCell className="text-emerald-400 text-xs text-right font-bold">Rs.{(gstSummaryVoucher.igst_amount || 0).toFixed(2)}</TableCell>
                    )}
                    <TableCell className="text-amber-400 text-xs text-right font-bold">
                      Rs.{((gstSummaryVoucher.cgst_amount || 0) + (gstSummaryVoucher.sgst_amount || 0) + (gstSummaryVoucher.igst_amount || 0)).toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <div className="text-right text-sm font-bold text-white pt-2 border-t border-slate-600">
                Grand Total: Rs.{(gstSummaryVoucher.total || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
