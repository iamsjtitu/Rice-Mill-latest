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
  Plus, Trash2, RefreshCw, Search, FileText, FileSpreadsheet, Eye, ShoppingBag, IndianRupee, Receipt, Clock, History, Undo2, Printer,
} from "lucide-react";
import { formatPurchaseVoucher } from "../utils/voucher-format";
import { downloadFile, fetchAsBlob } from "../utils/download";
import { ShareFileViaWhatsApp } from "./common/ShareFileViaWhatsApp";
import RoundOffInput from "./common/RoundOffInput";
import { useConfirm } from "./ConfirmProvider";
import { fetchVwByRst, updateVwBhada } from "../utils/vw-bhada";
import logger from "../utils/logger";
const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

const emptyItem = { item_name: "", quantity: "", rate: "", unit: "Qntl", _custom: false };

export default function PurchaseVouchers({ filters, user }) {
  const showConfirm = useConfirm();
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [gstSettings, setGstSettings] = useState({ cgst_percent: 0, sgst_percent: 0, igst_percent: 0 });
  const [payDialog, setPayDialog] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payAccount, setPayAccount] = useState("cash");
  const [payBankName, setPayBankName] = useState("");
  const [payRoundOff, setPayRoundOff] = useState("");
  const [bankAccounts, setBankAccounts] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyParty, setHistoryParty] = useState("");
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchHistory = async (party) => {
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${API}/voucher-payment/history/${encodeURIComponent(party)}?party_type=Purchase Voucher`);
      setHistoryData(res.data.history || []);
    } catch (e) { setHistoryData([]); }
    finally { setHistoryLoading(false); }
  };

  const openHistory = (party) => {
    setHistoryParty(party);
    setShowHistory(true);
    fetchHistory(party);
  };
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    party_name: "", voucher_no_label: "", invoice_no: "", rst_no: "", truck_no: "", eway_bill_no: "",
    items: [{ ...emptyItem }],
    gst_type: "none", cgst_percent: 0, sgst_percent: 0, igst_percent: 0,
    cash_paid: "", diesel_paid: "", bhada: "", advance: "", remark: "",
    kms_year: "", season: "",
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      
      if (searchText) p.append('search', searchText);
      const sp = new URLSearchParams();
      if (filters.kms_year) sp.append('kms_year', filters.kms_year);
      
      const [res, bRes, sRes] = await Promise.all([
        axios.get(`${API}/purchase-book?${p}`),
        axios.get(`${API}/bank-accounts`),
        axios.get(`${API}/purchase-book/stock-items?${sp}`),
      ]);
      setVouchers(res.data);
      setBankAccounts(bRes.data || []);
      setStockItems(sRes.data || []);
    } catch (e) { logger.error(e); toast.error("Data load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, searchText]);

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/purchase-book/item-suggestions`);
      setSuggestions(res.data || []);
    } catch (e) { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchGstSettings = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/gst-settings`);
      setGstSettings(res.data);
    } catch (e) { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchSuggestions(); fetchGstSettings(); }, [fetchSuggestions, fetchGstSettings]);

  const subtotal = useMemo(() =>
    form.items.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.rate) || 0), 0)
  , [form.items]);

  const getStockForItem = (itemName) => {
    const s = stockItems.find(i => i.name === itemName);
    return s ? s.available_qntl : null;
  };

  const gstCalc = useMemo(() => {
    const cgst = form.gst_type === 'cgst_sgst' ? round2(subtotal * (parseFloat(form.cgst_percent) || 0) / 100) : 0;
    const sgst = form.gst_type === 'cgst_sgst' ? round2(subtotal * (parseFloat(form.sgst_percent) || 0) / 100) : 0;
    const igst = form.gst_type === 'igst' ? round2(subtotal * (parseFloat(form.igst_percent) || 0) / 100) : 0;
    return { cgst, sgst, igst, total: round2(subtotal + cgst + sgst + igst) };
  }, [subtotal, form.gst_type, form.cgst_percent, form.sgst_percent, form.igst_percent]);

  const resetForm = () => {
    setForm({
      date: new Date().toISOString().split('T')[0],
      party_name: "", voucher_no_label: "", invoice_no: "", rst_no: "", truck_no: "", eway_bill_no: "",
      items: [{ ...emptyItem }],
      gst_type: "none", cgst_percent: 0, sgst_percent: 0, igst_percent: 0,
      cash_paid: "", diesel_paid: "", bhada: "", advance: "", remark: "",
      kms_year: filters.kms_year || "", season: filters.season || "",
    });
    setEditId(null);
  };

  const handleItemChange = (idx, field, value) => {
    setForm(prev => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...prev, items };
    });
  };

  const addItem = () => setForm(prev => ({ ...prev, items: [...prev.items, { ...emptyItem }] }));
  const removeItem = (idx) => {
    if (form.items.length <= 1) return;
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  };

  const handleGstTypeChange = (val) => {
    if (val === 'cgst_sgst') {
      setForm(prev => ({ ...prev, gst_type: val, cgst_percent: gstSettings.cgst_percent, sgst_percent: gstSettings.sgst_percent, igst_percent: 0 }));
    } else if (val === 'igst') {
      setForm(prev => ({ ...prev, gst_type: val, cgst_percent: 0, sgst_percent: 0, igst_percent: gstSettings.igst_percent }));
    } else {
      setForm(prev => ({ ...prev, gst_type: 'none', cgst_percent: 0, sgst_percent: 0, igst_percent: 0 }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.party_name.trim()) { toast.error("Party name zaroori hai"); return; }
    const validItems = form.items.filter(i => i.item_name.trim() && (parseFloat(i.quantity) || 0) > 0);
    if (validItems.length === 0) { toast.error("Kam se kam ek item daalein"); return; }

    // 🛡️ Duplicate RST guard
    const rstTrim = (form.rst_no || '').trim();
    if (rstTrim) {
      const duplicate = vouchers.find(v =>
        (v.rst_no || '').trim().toLowerCase() === rstTrim.toLowerCase() &&
        v.id !== editId
      );
      if (duplicate) {
        const confirmed = await showConfirm(
          `⚠️ RST ${rstTrim} pehle se maujood hai`,
          `Is RST number ka purchase voucher pehle se save ho chuka hai:\n` +
          `• Voucher No: ${duplicate.voucher_no_label || duplicate.voucher_no || '-'}\n` +
          `• Party: ${duplicate.party_name || '-'}\n` +
          `• Date: ${duplicate.date || '-'}\n\n` +
          `Kya aap phir bhi naya duplicate voucher banana chahte hain?`
        );
        if (!confirmed) return;
      }
    }

    const payload = {
      ...form,
      items: validItems.map(i => ({
        item_name: i.item_name.trim(),
        quantity: parseFloat(i.quantity) || 0,
        rate: parseFloat(i.rate) || 0,
        unit: i.unit || "Qntl",
      })),
      cash_paid: parseFloat(form.cash_paid) || 0,
      diesel_paid: parseFloat(form.diesel_paid) || 0,
      bhada: parseFloat(form.bhada) || 0,
      advance: parseFloat(form.advance) || 0,
      cgst_percent: parseFloat(form.cgst_percent) || 0,
      sgst_percent: parseFloat(form.sgst_percent) || 0,
      igst_percent: parseFloat(form.igst_percent) || 0,
      kms_year: filters.kms_year || form.kms_year,
      season: filters.season || form.season,
    };

    try {
      if (editId) {
        await axios.put(`${API}/purchase-book/${editId}?username=${user.username}&role=${user.role}`, payload);
        toast.success("Purchase voucher update ho gaya!");
      } else {
        await axios.post(`${API}/purchase-book?username=${user.username}&role=${user.role}`, payload);
        toast.success("Purchase voucher save ho gaya!");
      }
      // Sync Bhada to canonical Vehicle Weight entry (single source of truth)
      const bhadaVal = parseFloat(form.bhada) || 0;
      if (form.rst_no) {
        const r = await updateVwBhada(form.rst_no, bhadaVal, user.username, filters.kms_year || "");
        if (!r.ok && bhadaVal > 0) {
          toast.warning(`Bhada save hua par truck owner ledger me sync nahi hua (RST not in Vehicle Weight). Pehle Vehicle Weight entry banayein.`, { duration: 6000 });
        }
      }
      setDialogOpen(false); resetForm(); fetchData(); fetchSuggestions();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleEdit = (v) => {
    setForm({
      date: v.date || "", party_name: v.party_name || "",
      voucher_no_label: v.voucher_no_label || formatPurchaseVoucher(v),
      invoice_no: v.invoice_no || "",
      rst_no: v.rst_no || "", truck_no: v.truck_no || "", eway_bill_no: v.eway_bill_no || "",
      items: (v.items || []).map(i => ({
        item_name: i.item_name || "", quantity: String(i.quantity || ""),
        rate: String(i.rate || ""), unit: i.unit || "Qntl",
        _custom: !stockItems.find(s => s.name === i.item_name),
      })),
      gst_type: v.gst_type || "none",
      cgst_percent: v.cgst_percent || 0, sgst_percent: v.sgst_percent || 0, igst_percent: v.igst_percent || 0,
      cash_paid: String(v.cash_paid || ""), diesel_paid: String(v.diesel_paid || ""),
      bhada: v.bhada ? String(v.bhada) : "",
      advance: String(v.advance || ""), remark: v.remark || "",
      kms_year: v.kms_year || "", season: v.season || "",
    });
    setEditId(v.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!await showConfirm("Delete", "Delete karna chahte hain?")) return;
    try {
      await axios.delete(`${API}/purchase-book/${id}?username=${user.username}&role=${user.role}`);
      toast.success("Deleted!"); setSelectedIds(prev => prev.filter(x => x !== id)); fetchData();
    } catch (e) { logger.error(e); toast.error("Delete nahi hua"); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!await showConfirm("Bulk Delete", `Kya aap ${selectedIds.length} purchase vouchers delete karna chahte hain? Cash Book entries bhi delete hongi.`)) return;
    try {
      await axios.post(`${API}/purchase-book/delete-bulk`, { ids: selectedIds });
      toast.success(`${selectedIds.length} vouchers delete ho gaye!`);
      setSelectedIds([]);
      fetchData();
    } catch (e) { toast.error("Bulk delete error"); }
  };

  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = () => setSelectedIds(prev => prev.length === vouchers.length ? [] : vouchers.map(v => v.id));

  const handleExport = async (type) => {
    const p = new URLSearchParams();
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    if (searchText) p.append('search', searchText);
    const qs = p.toString() ? `?${p.toString()}` : '';
    const { buildFilename } = await import('../utils/filename-format');
    const ext = type === 'pdf' ? 'pdf' : 'xlsx';
    const fname = buildFilename({
      base: 'purchase_book',
      party: searchText,
      kmsYear: filters.kms_year,
      ext,
    });
    downloadFile(`/api/purchase-book/export/${type}${qs}`, fname);
  };

  const handlePrintInvoice = async (v) => {
    const { buildFilename } = await import('../utils/filename-format');
    const fname = buildFilename({ base: 'purchase-invoice', party: formatPurchaseVoucher(v) || v.id, ext: 'pdf' });
    downloadFile(`${API}/purchase-book/${v.id}/pdf`, fname);
  };

  const handlePayment = async () => {
    if (!payDialog || !payAmount || parseFloat(payAmount) <= 0) { toast.error("Amount daalna zaroori hai"); return; }
    if (payAccount === "bank" && !payBankName) { toast.error("Bank account select karein"); return; }
    try {
      await axios.post(`${API}/voucher-payment`, {
        voucher_type: "purchase", voucher_id: payDialog.id, amount: parseFloat(payAmount),
        date: payDate, notes: payNotes, username: user.username,
        kms_year: filters.kms_year || "", season: filters.season || "",
        account: payAccount, bank_name: payAccount === "bank" ? payBankName : "",
        round_off: parseFloat(payRoundOff) || 0,
      });
      toast.success("Payment record ho gayi!"); setPayDialog(null); setPayAmount(""); setPayNotes(""); setPayAccount("cash"); setPayBankName(""); setPayRoundOff(""); fetchData();
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

  const totals = useMemo(() => {
    const t = vouchers.reduce((a, v) => ({
      total: a.total + (v.total || 0), advance: a.advance + (v.advance || 0),
      cash: a.cash + (v.cash_paid || 0), diesel: a.diesel + (v.diesel_paid || 0),
      balance: a.balance + (v.balance || 0),
    }), { total: 0, advance: 0, cash: 0, diesel: 0, balance: 0 });
    return { ...t, total: Math.round(t.total), balance: Math.round(t.balance) };
  }, [vouchers]);

  // Calculate paid totals from ledger
  const ledgerTotals = useMemo(() => {
    const paid = vouchers.reduce((s, v) => s + (v.ledger_paid || v.advance || 0), 0);
    const balance = vouchers.reduce((s, v) => s + (v.ledger_balance != null ? v.ledger_balance : (v.balance || 0)), 0);
    return { paid: Math.round(paid), balance: Math.round(balance) };
  }, [vouchers]);

  return (
    <div className="space-y-4" data-testid="purchase-vouchers-section">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["Vouchers", vouchers.length, "text-white"],
          ["Total Amount", `Rs.${totals.total.toLocaleString()}`, "text-emerald-400"],
          ["Paid", `Rs.${ledgerTotals.paid.toLocaleString()}`, "text-sky-400"],
          ["Cash+Diesel", `Rs.${Math.round(totals.cash + totals.diesel).toLocaleString()}`, "text-amber-400"],
          ["Balance", `Rs.${ledgerTotals.balance.toLocaleString()}`, "text-red-400"],
        ].map(([label, val, color]) => (
          <Card key={label} className="bg-slate-800 border-slate-700">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-slate-400">{label}</p>
              <p className={`text-lg font-bold ${color}`} data-testid={`pv-summary-${label.toLowerCase().replace(/\s/g,'-')}`}>{val}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <Button onClick={async () => {
          resetForm();
          setDialogOpen(true);
          // Pre-fill next P-NNN serial; user can edit.
          try {
            const r = await axios.get(`${API}/purchase-book/next-voucher-label`);
            if (r.data?.voucher_no_label) setForm(p => ({ ...p, voucher_no_label: r.data.voucher_no_label }));
          } catch (e) { /* silent */ }
        }} className="bg-emerald-500 hover:bg-emerald-600 text-white" size="sm" data-testid="pv-add-btn">
          <Plus className="w-4 h-4 mr-1" /> Nayi Entry
        </Button>
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300" data-testid="pv-refresh-btn">
          <RefreshCw className="w-4 h-4" />
        </Button>
        <Button onClick={() => handleExport('pdf')} variant="outline" size="sm" className="border-red-700 text-red-400 hover:bg-red-900/30 h-9 w-9 p-0" title="PDF" data-testid="pv-export-pdf">
          <FileText className="w-4 h-4" />
        </Button>
        <Button onClick={() => handleExport('excel')} variant="outline" size="sm" className="border-green-700 text-green-400 hover:bg-green-900/30 h-9 w-9 p-0" title="Excel" data-testid="pv-export-excel">
          <FileSpreadsheet className="w-4 h-4" />
        </Button>
        <ShareFileViaWhatsApp
          getFile={async () => {
            const p = new URLSearchParams();
            if (filters.kms_year) p.append('kms_year', filters.kms_year);
            if (searchText) p.append('search', searchText);
            const qs = p.toString() ? `?${p.toString()}` : '';
            return await fetchAsBlob(`/api/purchase-book/export/pdf${qs}`, 'purchase_book.pdf');
          }}
          caption="Purchase Vouchers Report"
          title="Purchase Vouchers WhatsApp pe bhejein (PDF)"
          testId="pv-share-whatsapp"
        />
        <div className="relative ml-auto min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="Party / Invoice / RST search..."
            className="bg-slate-700 border-slate-600 text-white h-8 text-sm pl-8" data-testid="pv-search-input" />
        </div>
        {selectedIds.length > 0 && (
          <Button onClick={handleBulkDelete} variant="outline" size="sm" className="border-red-600 text-red-400 hover:bg-red-900/30" data-testid="pv-bulk-delete-btn">
            <Trash2 className="w-3 h-3 mr-1" /> Delete ({selectedIds.length})
          </Button>
        )}
      </div>

      {/* Voucher List */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-0"><div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="border-slate-700">
              <TableHead className="text-slate-300 text-xs w-8">
                <input type="checkbox" checked={vouchers.length > 0 && selectedIds.length === vouchers.length}
                  onChange={toggleSelectAll} className="accent-emerald-500 w-3.5 h-3.5 cursor-pointer" data-testid="pv-select-all" />
              </TableHead>
              {['#', 'Date', 'Invoice', 'RST', 'Party', 'Items', 'Truck', 'Subtotal', 'GST', 'Total', 'Paid', 'Balance', ''].map(h =>
                <TableHead key={h} className={`text-slate-300 text-xs whitespace-nowrap ${['Subtotal', 'GST', 'Total', 'Paid', 'Balance'].includes(h) ? 'text-right' : ''}`}>{h}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={14} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
              : vouchers.length === 0 ? <TableRow><TableCell colSpan={14} className="text-center text-slate-400 py-8">Koi purchase voucher nahi mila.</TableCell></TableRow>
              : vouchers.map(v => {
                const gst = (v.cgst_amount || 0) + (v.sgst_amount || 0) + (v.igst_amount || 0);
                return (
                <TableRow key={v.id} className={`border-slate-700 ${selectedIds.includes(v.id) ? 'bg-emerald-500/10' : ''}`} data-testid={`pv-row-${v.id}`}>
                  <TableCell>
                    <input type="checkbox" checked={selectedIds.includes(v.id)} onChange={() => toggleSelect(v.id)}
                      className="accent-emerald-500 w-3.5 h-3.5 cursor-pointer" data-testid={`pv-select-${v.id}`} />
                  </TableCell>
                  <TableCell className="text-amber-400 text-xs font-mono" data-testid={`pv-row-vno-${v.id}`}>{formatPurchaseVoucher(v)}</TableCell>
                  <TableCell className="text-white text-xs whitespace-nowrap">{fmtDate(v.date)}</TableCell>
                  <TableCell className="text-cyan-400 text-xs">{v.invoice_no || '-'}</TableCell>
                  <TableCell className="text-purple-400 text-xs">{v.rst_no || '-'}</TableCell>
                  <TableCell className="text-white font-semibold text-sm">{v.party_name}</TableCell>
                  <TableCell className="text-xs text-slate-300 max-w-[180px] truncate">
                    {(v.items || []).map(i => `${i.item_name}(${i.quantity}${i.unit === 'Qntl' ? 'Q' : i.unit})`).join(', ')}
                  </TableCell>
                  <TableCell className="text-slate-300 text-xs">{v.truck_no || '-'}</TableCell>
                  <TableCell className="text-right text-slate-300 text-xs">Rs.{(v.subtotal || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-yellow-400 text-xs">{gst > 0 ? `Rs.${gst.toLocaleString()}` : '-'}</TableCell>
                  <TableCell className="text-right text-emerald-400 font-semibold text-sm">Rs.{(v.total || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-sky-400 text-xs">Rs.{(v.ledger_paid || v.advance || 0).toLocaleString()}</TableCell>
                  <TableCell className={`text-right font-semibold text-sm ${(v.ledger_balance != null ? v.ledger_balance : (v.balance || 0)) > 0 ? 'text-red-400' : 'text-emerald-400'}`} data-testid={`pv-balance-${v.id}`}>
                    Rs.{(v.ledger_balance != null ? v.ledger_balance : (v.balance || 0)).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end items-center">
                      {(v.ledger_balance != null ? v.ledger_balance : (v.balance || 0)) <= 0 && (v.total || 0) > 0 ? (
                        <>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" data-testid={`pv-paid-badge-${v.id}`}>Paid</span>
                          <Button variant="ghost" size="sm" className="h-6 px-1 text-sky-400" onClick={() => openHistory(v.party_name)} title="Payment History" data-testid={`pv-history-${v.id}`}>
                            <Clock className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 px-1 text-emerald-400" onClick={() => { setPayDialog(v); setPayAmount(""); setPayNotes(""); setPayDate(new Date().toISOString().split('T')[0]); setPayAccount("cash"); setPayBankName(""); }} title="Aur Payment" data-testid={`pv-pay-more-${v.id}`}>
                            <IndianRupee className="w-3 h-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" className="h-6 px-1 text-emerald-400" onClick={() => { setPayDialog(v); setPayAmount(""); setPayNotes(""); setPayDate(new Date().toISOString().split('T')[0]); setPayAccount("cash"); setPayBankName(""); }} title="Payment Karein" data-testid={`pv-pay-${v.id}`}>
                            <IndianRupee className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 px-1 text-sky-400" onClick={() => openHistory(v.party_name)} title="Payment History" data-testid={`pv-history-${v.id}`}>
                            <Clock className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="sm" className="h-6 px-1 text-blue-400" onClick={() => handleEdit(v)} data-testid={`pv-edit-${v.id}`}>
                        <Eye className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 px-1 text-purple-400" onClick={() => handlePrintInvoice(v)} title="Print Invoice" data-testid={`pv-print-${v.id}`}>
                        <Printer className="w-3 h-3" />
                      </Button>
                      {user.role === 'admin' && (
                        <Button variant="ghost" size="sm" className="h-6 px-1 text-red-400" onClick={() => handleDelete(v.id)} data-testid={`pv-del-${v.id}`}>
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

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="pv-form-dialog">
          <DialogHeader><DialogTitle className="text-emerald-400 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" /> {editId ? "Edit Purchase Voucher" : "Nayi Purchase Entry"}
          </DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Row 1: Voucher No, Invoice No, Date, Party, RST */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <Label className="text-xs text-amber-400 font-semibold">Voucher No.</Label>
                <Input value={form.voucher_no_label} onChange={e => setForm(p => ({ ...p, voucher_no_label: e.target.value }))}
                  placeholder="P-001" className="bg-slate-700 border-slate-600 text-amber-400 font-mono h-8 text-sm" data-testid="pv-voucher-no" />
              </div>
              <div>
                <Label className="text-xs text-cyan-400 font-semibold flex items-center gap-1"><Receipt className="w-3 h-3" /> Invoice No.</Label>
                <Input value={form.invoice_no} onChange={e => setForm(p => ({ ...p, invoice_no: e.target.value }))}
                  placeholder="INV-001" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pv-invoice" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pv-date" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Party Name *</Label>
                <Input value={form.party_name} onChange={e => setForm(p => ({ ...p, party_name: e.target.value }))}
                  placeholder="Party / Seller" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="pv-party" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">RST No.</Label>
                <Input value={form.rst_no} onChange={e => setForm(p => ({ ...p, rst_no: e.target.value }))}
                  onBlur={async () => {
                    if (!form.rst_no) return;
                    const vw = await fetchVwByRst(form.rst_no, filters.kms_year || "");
                    if (vw) {
                      setForm(p => ({
                        ...p,
                        truck_no: p.truck_no || vw.vehicle_no || "",
                        party_name: p.party_name || vw.party_name || "",
                        bhada: vw.bhada != null && Number(vw.bhada) > 0 ? String(vw.bhada) : p.bhada,
                      }));
                    }
                  }}
                  placeholder="RST Number" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pv-rst" />
                {(() => {
                  const rstTrim = (form.rst_no || '').trim();
                  if (!rstTrim) return null;
                  const dup = vouchers.find(v =>
                    (v.rst_no || '').trim().toLowerCase() === rstTrim.toLowerCase() &&
                    v.id !== editId
                  );
                  if (!dup) return null;
                  return (
                    <div className="mt-1 text-[10px] text-amber-400 flex items-center gap-1" data-testid="pv-rst-duplicate-warn">
                      ⚠️ RST {rstTrim} pehle se save: V.No {dup.voucher_no_label || dup.voucher_no || '-'} · {dup.party_name || '-'}
                    </div>
                  );
                })()}
              </div>
            </div>
            {/* Row 2: E-Way, Truck */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">E-Way Bill No.</Label>
                <Input value={form.eway_bill_no} onChange={e => setForm(p => ({ ...p, eway_bill_no: e.target.value }))}
                  placeholder="E-Way Bill Number" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pv-eway" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Truck No.</Label>
                <Input value={form.truck_no} onChange={e => setForm(p => ({ ...p, truck_no: e.target.value }))}
                  placeholder="Vehicle Number" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pv-truck" />
              </div>
            </div>

            {/* Items Section - Table based like Sale Voucher */}
            <div className="border border-slate-600 rounded-lg overflow-hidden">
              <div className="bg-slate-700/50 px-3 py-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-400">Items (सामान)</span>
                <Button type="button" onClick={addItem} size="sm" variant="ghost" className="h-6 text-emerald-400 hover:text-emerald-300 text-xs" data-testid="pv-add-item">
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-600">
                    <TableHead className="text-slate-400 text-[10px] w-[35%]">Name of Item</TableHead>
                    <TableHead className="text-slate-400 text-[10px] w-[10%]">Stock</TableHead>
                    <TableHead className="text-slate-400 text-[10px] w-[15%]">Quantity</TableHead>
                    <TableHead className="text-slate-400 text-[10px] w-[12%]">Rate</TableHead>
                    <TableHead className="text-slate-400 text-[10px] w-[18%] text-right">Amount</TableHead>
                    <TableHead className="text-slate-400 text-[10px] w-[10%]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {form.items.map((item, idx) => {
                    const stock = getStockForItem(item.item_name);
                    const isCustom = item._custom;
                    const amt = (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);
                    return (
                      <TableRow key={`pv-item-${idx}-${item.item_name || 'empty'}`} className="border-slate-600">
                        <TableCell className="p-1">
                          {isCustom ? (
                            <div className="flex gap-1">
                              <Input value={item.item_name} onChange={e => handleItemChange(idx, 'item_name', e.target.value)}
                                placeholder="Item name" className="bg-amber-900/30 border-amber-700 text-amber-400 h-8 text-xs flex-1" autoFocus
                                list={`item-suggest-${idx}`} data-testid={`pv-item-custom-${idx}`} />
                              <datalist id={`item-suggest-${idx}`}>
                                {suggestions.map(s => <option key={s} value={s} />)}
                              </datalist>
                              <Button type="button" variant="ghost" size="sm" onClick={() => { handleItemChange(idx, '_custom', false); handleItemChange(idx, 'item_name', ''); }}
                                className="h-8 px-1 text-slate-400 text-[10px]">List</Button>
                            </div>
                          ) : (
                            <Select value={item.item_name || "_none"} onValueChange={v => {
                              if (v === "_custom") {
                                handleItemChange(idx, 'item_name', '');
                                handleItemChange(idx, '_custom', true);
                              } else {
                                handleItemChange(idx, 'item_name', v === "_none" ? "" : v);
                                handleItemChange(idx, '_custom', false);
                              }
                            }}>
                              <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid={`pv-item-select-${idx}`}>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_none">-- Select --</SelectItem>
                                {stockItems.map(si => (
                                  <SelectItem key={si.name} value={si.name}>{si.name} ({si.available_qntl} Q)</SelectItem>
                                ))}
                                <SelectItem value="_custom" className="text-amber-400">+ Other / Custom Item</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell className="p-1">
                          {stock !== null ? (
                            <span className={`text-xs font-medium ${stock > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{stock} Q</span>
                          ) : isCustom ? (
                            <span className="text-xs text-amber-400">New</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="p-1">
                          <Input type="number" step="0.01" value={item.quantity} onChange={e => handleItemChange(idx, 'quantity', e.target.value)}
                            className="bg-slate-700 border-slate-600 text-white h-8 text-xs" placeholder="0" data-testid={`pv-item-qty-${idx}`} />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input type="number" step="0.01" value={item.rate} onChange={e => handleItemChange(idx, 'rate', e.target.value)}
                            className="bg-slate-700 border-slate-600 text-white h-8 text-xs" placeholder="0" data-testid={`pv-item-rate-${idx}`} />
                        </TableCell>
                        <TableCell className="p-1 text-right text-white text-xs font-medium">Rs.{amt.toLocaleString('en-IN')}</TableCell>
                        <TableCell className="p-1">
                          {form.items.length > 1 && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="h-6 w-6 p-0 text-red-400" data-testid={`pv-item-del-${idx}`}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="text-right text-sm font-bold text-white" data-testid="pv-subtotal">Subtotal: Rs.{subtotal.toLocaleString('en-IN')}</div>

            {/* GST */}
            <div className="border border-slate-600 rounded-lg p-3 space-y-3">
              <Label className="text-xs text-amber-400 font-semibold">GST</Label>
              <div className="grid grid-cols-4 gap-3 items-end">
                <div>
                  <Label className="text-[10px] text-slate-400">GST Type</Label>
                  <Select value={form.gst_type} onValueChange={handleGstTypeChange}>
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="pv-gst-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No GST</SelectItem>
                      <SelectItem value="cgst_sgst">CGST + SGST</SelectItem>
                      <SelectItem value="igst">IGST</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.gst_type === 'cgst_sgst' && (<>
                  <div>
                    <Label className="text-[10px] text-slate-400">CGST %</Label>
                    <div className="flex items-center gap-1">
                      <Input type="number" step="0.01" value={form.cgst_percent}
                        onChange={e => setForm(p => ({ ...p, cgst_percent: e.target.value }))}
                        className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="pv-cgst" />
                      <span className="text-[10px] text-emerald-400 whitespace-nowrap">Rs.{gstCalc.cgst.toFixed(2)}</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-400">SGST %</Label>
                    <div className="flex items-center gap-1">
                      <Input type="number" step="0.01" value={form.sgst_percent}
                        onChange={e => setForm(p => ({ ...p, sgst_percent: e.target.value }))}
                        className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="pv-sgst" />
                      <span className="text-[10px] text-emerald-400 whitespace-nowrap">Rs.{gstCalc.sgst.toFixed(2)}</span>
                    </div>
                  </div>
                </>)}
                {form.gst_type === 'igst' && (
                  <div>
                    <Label className="text-[10px] text-slate-400">IGST %</Label>
                    <div className="flex items-center gap-1">
                      <Input type="number" step="0.01" value={form.igst_percent}
                        onChange={e => setForm(p => ({ ...p, igst_percent: e.target.value }))}
                        className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="pv-igst" />
                      <span className="text-[10px] text-emerald-400 whitespace-nowrap">Rs.{gstCalc.igst.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Total + Payment Section */}
            <div className="bg-slate-700/50 rounded-lg p-3 space-y-3">
              <div className="flex justify-between items-center text-lg font-bold">
                <span className="text-slate-300">Grand Total:</span>
                <span className="text-emerald-400" data-testid="pv-grand-total">Rs.{gstCalc.total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>

              {/* Bhada (Lumpsum) */}
              <div className="grid grid-cols-1">
                <div>
                  <Label className="text-[10px] text-amber-400 font-semibold">Bhada / भाड़ा (Lumpsum)</Label>
                  <Input type="number" step="0.01" value={form.bhada} onChange={e => setForm(p => ({ ...p, bhada: e.target.value }))}
                    placeholder="Truck bhada — e.g. 4000"
                    className="bg-amber-900/20 border-amber-700 text-amber-200 h-8 text-xs font-bold" data-testid="pv-bhada" />
                  <p className="text-[9px] text-slate-500 mt-0.5">RST se auto-fetch hota hai · Vehicle Weight ke saath sync</p>
                </div>
              </div>

              {/* Advance + Balance */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] text-blue-400 font-semibold">Advance Paid (Party ko diya)</Label>
                  <Input type="number" step="0.01" value={form.advance} onChange={e => setForm(p => ({ ...p, advance: e.target.value }))}
                    placeholder="0" className="bg-slate-700 border-blue-600 text-white h-8 text-xs" data-testid="pv-advance" />
                </div>
                <div className="flex flex-col justify-end">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400">Balance (Party ko dena baki): </span>
                    <span className={`text-sm font-bold ${(gstCalc.total - (parseFloat(form.advance) || 0)) > 0 ? 'text-red-400' : 'text-emerald-400'}`} data-testid="pv-balance">
                      Rs.{(gstCalc.total - (parseFloat(form.advance) || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs text-slate-400">Remark</Label>
              <Input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))}
                placeholder="Optional remark" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pv-remark" />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold flex-1" data-testid="pv-submit">
                <IndianRupee className="w-4 h-4 mr-1" /> {editId ? 'Update Voucher' : 'Save Purchase Voucher'}
              </Button>
              <Button type="button" variant="outline" className="border-slate-600 text-slate-300" onClick={() => setDialogOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={!!payDialog} onOpenChange={v => { if (!v) setPayDialog(null); }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-sm" data-testid="pv-pay-dialog">
          <DialogHeader><DialogTitle className="text-emerald-400 flex items-center gap-2"><IndianRupee className="w-5 h-5" /> Payment Karein / भुगतान</DialogTitle></DialogHeader>
          {payDialog && (
            <div className="space-y-3">
              <div className="bg-slate-900 p-3 rounded border border-slate-700 text-xs space-y-1">
                <p><span className="text-slate-400">Party:</span> <span className="text-white font-medium">{payDialog.party_name}</span></p>
                <p><span className="text-slate-400">Invoice:</span> <span className="text-white">{payDialog.invoice_no || '-'}</span></p>
                <p><span className="text-slate-400">Total:</span> <span className="text-emerald-400 font-bold">Rs.{payDialog.total?.toLocaleString('en-IN')}</span></p>
                <p><span className="text-slate-400">Balance Due:</span> <span className="text-red-400 font-bold">Rs.{(payDialog.ledger_balance != null ? payDialog.ledger_balance : payDialog.balance)?.toLocaleString('en-IN')}</span></p>
              </div>
              <div><Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pv-pay-date" /></div>
              <div><Label className="text-xs text-slate-400">Payment Mode</Label>
                <Select value={payAccount} onValueChange={v => { setPayAccount(v); if (v === "cash") setPayBankName(""); }}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pv-pay-account">
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
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pv-pay-bank">
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
                  className="bg-slate-700 border-slate-600 text-white h-8 text-sm" autoFocus data-testid="pv-pay-amount" /></div>
              <div><Label className="text-xs text-slate-400">Notes</Label>
                <Input value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Optional" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pv-pay-notes" /></div>
              <RoundOffInput
                value={payRoundOff}
                onChange={setPayRoundOff}
                amount={parseFloat(payAmount) || 0}
              />
              <Button onClick={handlePayment} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white" data-testid="pv-pay-submit">
                {payAccount === "bank" ? `Bank (${payBankName || '...'}) mein Record Karein` : "Cash mein Record Karein"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-white" data-testid="pv-history-dialog">
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
                  <div key={record.id || record.date || `pv-hist-${idx}`} className="p-3 rounded-lg border bg-slate-700/50 border-slate-600">
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
                            className="text-red-400 hover:text-red-300 hover:bg-red-400/10 h-6 w-6 p-0" title="Undo Payment" data-testid={`pv-undo-${idx}`}>
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
    </div>
  );
}

function round2(n) { return Math.round(n * 100) / 100; }
