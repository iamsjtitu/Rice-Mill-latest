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
import { Plus, Trash2, FileText, IndianRupee, Edit, Download, Search, FileSpreadsheet, Printer, Clock, History, Undo2, Building2, CheckSquare, Receipt, Send, Users } from "lucide-react";
import { ShareFileViaWhatsApp } from "./common/ShareFileViaWhatsApp";
import { fetchAsBlob } from "../utils/download";
import { formatSaleVoucher } from "../utils/voucher-format";
import { fetchVwByRst, updateVwBhada } from "../utils/vw-bhada";
import { useRstCheck } from "../hooks/useRstCheck";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const API = `${_isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '')}/api`;

import { fmtDate } from "@/utils/date";
import { useConfirm } from "./ConfirmProvider";
import { SendToGroupDialog } from "./SendToGroupDialog";
import { useMessagingEnabled } from "../hooks/useMessagingEnabled";
import logger from "../utils/logger";

const WhatsAppIcon = ({ className = "w-3.5 h-3.5" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M20.52 3.48A11.77 11.77 0 0 0 12.02 0C5.46 0 .12 5.33.12 11.9a11.8 11.8 0 0 0 1.6 5.95L0 24l6.3-1.65a11.88 11.88 0 0 0 5.72 1.46h.01c6.56 0 11.9-5.33 11.9-11.9a11.76 11.76 0 0 0-3.41-8.43zM12.03 21.8h-.01a9.88 9.88 0 0 1-5.04-1.38l-.36-.21-3.74.98 1-3.64-.23-.37a9.85 9.85 0 0 1-1.52-5.28c0-5.47 4.45-9.9 9.9-9.9 2.65 0 5.14 1.03 7.01 2.9a9.87 9.87 0 0 1 2.9 7.02c0 5.46-4.45 9.9-9.91 9.9zm5.43-7.41c-.3-.15-1.76-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.76.97-.93 1.17-.17.2-.34.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.47.13-.62.13-.13.3-.34.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.47 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.26.48 1.69.62.71.22 1.35.19 1.86.12.57-.08 1.76-.72 2-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z"/>
  </svg>
);
const HSN_MAP = {
  "Rice (Usna)": "1006 30 20", "Rice (Raw)": "1006 30 10",
  "Broken Rice": "1006 40 00", "Rejection Rice": "1006 40 00", "Pin Broken Rice": "1006 40 00",
  "Rice Bran": "2302 40 00", "Mota Kunda": "2302 40 00", "Bhusa": "2302 40 00", "Poll": "2302 40 00",
  "FRK": "1006 30 20", "Paddy": "1006 10 90",
  "Broken": "1006 40 00", "Kanki": "1006 40 00", "Bran": "2302 40 00", "Kunda": "2302 40 00", "Husk": "2302 40 00",
};
const DEFAULT_GST = { "Rice (Usna)": 5, "Rice (Raw)": 5, "Broken Rice": 5, "Rejection Rice": 5, "Pin Broken Rice": 5,
  "Rice Bran": 5, "Mota Kunda": 5, "Bhusa": 5, "Poll": 5, "FRK": 5, "Paddy": 5,
  "Broken": 5, "Kanki": 5, "Bran": 5, "Kunda": 5, "Husk": 5 };
const GST_RATES = [0, 5, 12, 18, 28];

export default function SaleBook({ filters, user, category }) {
  const showConfirm = useConfirm();
  const { wa } = useMessagingEnabled();
  const [vouchers, setVouchers] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [originalRst, setOriginalRst] = useState("");
  const { checkRst, clear: clearRstCheck, RstWarning, buildBlockerMessage: buildRstMsg } = useRstCheck({ context: "sale", excludeId: editingId });
  const [obList, setObList] = useState([]);
  const [isObOpen, setIsObOpen] = useState(false);
  const [obForm, setObForm] = useState({ party_name: "", party_type: "Cash Party", amount: "", balance_type: "jama", note: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  // v104.44.42 — Sub-tab filter: ALL | PKA (gst) | KCA (none)
  const [gstFilter, setGstFilter] = useState("ALL");
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

  const emptyItem = { item_name: "", quantity: "", rate: "", unit: "KG", hsn_code: "", gst_percent: 5, oil_percent: "" };
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    party_name: "", voucher_no_label: "", invoice_no: "", bill_book: "", destination: "", buyer_gstin: "", buyer_address: "",
    items: [{ ...emptyItem }],
    gst_type: "none",
    truck_no: "", rst_no: "", remark: "", cash_paid: "", diesel_paid: "", bhada: "", advance: "", eway_bill_no: "",
    kms_year: filters.kms_year || "", season: filters.season || "",
  });

  // v104.44.40 — Build full filter param string for fetch + export
  const buildFilterParams = () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);
    if (filters.party_name) params.append('party_name', filters.party_name);
    if (category) params.append('item_category', category);
    if (searchQuery) params.append('search', searchQuery);
    // v104.44.42 — PKA / KCA sub-tab filter (backend supports gst_filter)
    if (gstFilter && gstFilter !== "ALL") params.append('gst_filter', gstFilter);
    return params;
  };
  const p = `kms_year=${filters.kms_year || ''}`;

  const fetchData = useCallback(async () => {
    try {
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
      const catParam = category ? `&item_category=${encodeURIComponent(category)}` : '';
      // v104.44.42 — PKA/KCA filter param
      const gstParam = (gstFilter && gstFilter !== "ALL") ? `&gst_filter=${gstFilter}` : '';
      const [vRes, sRes, obRes, bRes] = await Promise.all([
        axios.get(`${API}/sale-book?${p}${searchParam}${catParam}${gstParam}`),
        axios.get(`${API}/sale-book/stock-items?${p}`),
        axios.get(`${API}/opening-balances?kms_year=${filters.kms_year || ''}`),
        axios.get(`${API}/bank-accounts`),
      ]);
      setVouchers(vRes.data);
      setStockItems(sRes.data);
      setObList(obRes.data);
      setBankAccounts(bRes.data || []);
    } catch (e) { logger.error(e); }
  }, [p, filters.kms_year, searchQuery, category, gstFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNewForm = async () => {
    setEditingId(null);
    setOriginalRst("");
    const defaultItem = category
      ? { ...emptyItem, item_name: category }
      : { ...emptyItem };
    setForm({
      date: new Date().toISOString().split('T')[0], party_name: "", voucher_no_label: "", invoice_no: "", bill_book: "", destination: "",
      buyer_gstin: "", buyer_address: "",
      items: [defaultItem], gst_type: "none",
      truck_no: "", rst_no: "", remark: "", cash_paid: "", diesel_paid: "", bhada: "", advance: "", eway_bill_no: "",
      kms_year: filters.kms_year || "", season: filters.season || "",
    });
    setIsFormOpen(true);
    // Pre-fill next serial S-NNN; user can edit.
    try {
      const r = await axios.get(`${API}/sale-book/next-voucher-label`);
      if (r.data?.voucher_no_label) setForm(p => ({ ...p, voucher_no_label: r.data.voucher_no_label }));
    } catch (e) { /* silent */ }
  };

  const openEditForm = (v) => {
    setEditingId(v.id);
    setOriginalRst(String(v.rst_no || ""));
    setForm({
      date: v.date || "", party_name: v.party_name || "", voucher_no_label: v.voucher_no_label || formatSaleVoucher(v),
      invoice_no: v.invoice_no || "",
      bill_book: v.bill_book || "", destination: v.destination || "",
      buyer_gstin: v.buyer_gstin || "", buyer_address: v.buyer_address || "",
      items: (v.items || []).map(i => ({ item_name: i.item_name, quantity: String(i.quantity || ""), rate: String(i.rate || ""), unit: i.unit || "KG", hsn_code: i.hsn_code || "", gst_percent: i.gst_percent ?? 5, oil_percent: i.oil_percent ? String(i.oil_percent) : "" })),
      gst_type: v.gst_type || "none",
      truck_no: v.truck_no || "", rst_no: v.rst_no || "", remark: v.remark || "", eway_bill_no: v.eway_bill_no || "",
      cash_paid: v.cash_paid ? String(v.cash_paid) : "", diesel_paid: v.diesel_paid ? String(v.diesel_paid) : "",
      bhada: v.bhada ? String(v.bhada) : "",
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
    // 🛡️ Backend-backed RST cross-check — HARD BLOCK real duplicates
    // Skip if editing and RST unchanged (preserves natural flow with linked VW/other records)
    const rstTrim = (form.rst_no || '').trim();
    if (rstTrim && (!editingId || rstTrim !== originalRst)) {
      const { hasBlocker } = await checkRst(rstTrim, { immediate: true });
      if (hasBlocker) {
        toast.error(`❌ RST ${rstTrim} duplicate — save block hua\n${buildRstMsg()}`, { duration: 7000 });
        return;
      }
    }
    try {
      const payload = {
        ...form,
        items: form.items.filter(i => i.item_name && parseFloat(i.quantity) > 0).map(i => ({
          item_name: i.item_name, quantity: parseFloat(i.quantity) || 0, rate: parseFloat(i.rate) || 0, unit: i.unit || "Qntl",
          hsn_code: i.hsn_code || "", gst_percent: parseFloat(i.gst_percent) || 0,
        })),
        cash_paid: parseFloat(form.cash_paid) || 0, diesel_paid: parseFloat(form.diesel_paid) || 0,
        bhada: parseFloat(form.bhada) || 0,
        advance: parseFloat(form.advance) || 0,
      };
      if (editingId) {
        await axios.put(`${API}/sale-book/${editingId}?username=${user.username}&role=${user.role}`, payload);
        toast.success("Voucher update ho gaya!");
      } else {
        await axios.post(`${API}/sale-book?username=${user.username}&role=${user.role}`, payload);
        toast.success("Sale voucher save ho gaya!");
      }
      // Sync Bhada to canonical Vehicle Weight entry (single source of truth)
      const bhadaVal = parseFloat(form.bhada) || 0;
      if (form.rst_no) {
        const r = await updateVwBhada(form.rst_no, bhadaVal, user.username, filters.kms_year || "");
        if (!r.ok && bhadaVal > 0) {
          toast.warning(`Bhada save hua par truck owner ledger me sync nahi hua (RST not in Vehicle Weight). Pehle Vehicle Weight entry banayein.`, { duration: 6000 });
        }
      }
      setIsFormOpen(false); setEditingId(null); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Save error"); }
  };

  const handleDelete = async (id) => {
    if (!await showConfirm("Delete Voucher", "Kya aap ye voucher delete karna chahte hain?")) return;
    try {
      await axios.delete(`${API}/sale-book/${id}?username=${user.username}&role=${user.role}`);
      toast.success("Voucher delete ho gaya"); setSelectedIds(prev => prev.filter(x => x !== id)); fetchData();
    } catch (e) { logger.error(e); toast.error("Delete error"); }
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

  const handleExportPDF = async () => {
    const params = buildFilterParams();
    const { downloadFile } = await import('../utils/download');
    const { buildFilename } = await import('../utils/filename-format');
    const fname = buildFilename({
      base: 'sale_book',
      party: filters.party_name || searchQuery,
      dateFrom: filters.date_from,
      dateTo: filters.date_to,
      kmsYear: filters.kms_year,
      ext: 'pdf',
    });
    downloadFile(`/api/sale-book/export/pdf?${params}`, fname);
  };

  const handleExportExcel = async () => {
    try {
      const params = buildFilterParams();
      const { downloadFile } = await import('../utils/download');
      const { buildFilename } = await import('../utils/filename-format');
      const fname = buildFilename({
        base: 'sale_book',
        party: filters.party_name || searchQuery,
        dateFrom: filters.date_from,
        dateTo: filters.date_to,
        kmsYear: filters.kms_year,
        ext: 'xlsx',
      });
      downloadFile(`/api/sale-book/export/excel?${params}`, fname);
      toast.success("Excel export ho gaya!");
    } catch (e) { logger.error(e); toast.error("Excel export failed"); }
  };

  // v104.44.40 — Header-level WhatsApp summary + Group share for all filtered vouchers
  const _saleBookSummaryText = () => {
    const flt = [];
    if (filters.kms_year) flt.push(`KMS: ${filters.kms_year}`);
    if (filters.season) flt.push(`Season: ${filters.season}`);
    if (filters.party_name) flt.push(`Party: ${filters.party_name}`);
    if (filters.date_from) flt.push(`From: ${filters.date_from}`);
    if (filters.date_to) flt.push(`To: ${filters.date_to}`);
    if (category) flt.push(`Item: ${category}`);
    if (searchQuery) flt.push(`Search: ${searchQuery}`);
    const totalAmt = vouchers.reduce((s, v) => s + (v.total || 0), 0);
    const totalBal = vouchers.reduce((s, v) => s + (v.balance || 0), 0);
    const totalAdv = vouchers.reduce((s, v) => s + (v.advance || 0), 0);
    const lines = [];
    lines.push(`*📋 Sale Book Summary${category ? ' — ' + category : ''}*`);
    if (flt.length) { lines.push(''); lines.push(`_${flt.join(' · ')}_`); }
    lines.push('');
    lines.push(`📊 Total Vouchers: *${vouchers.length}*`);
    lines.push(`💰 Gross Sale: *₹${totalAmt.toLocaleString()}*`);
    lines.push(`💵 Advance: *₹${totalAdv.toLocaleString()}*`);
    lines.push(`📕 Balance: *₹${totalBal.toLocaleString()}*`);
    if (vouchers.length > 0 && vouchers.length <= 10) {
      lines.push('');
      lines.push('*Vouchers:*');
      vouchers.slice(0, 10).forEach(v => {
        lines.push(`• ${formatSaleVoucher(v) || v.voucher_no || '-'} · ${fmtDate(v.date)} · ${v.party_name || '-'} · ₹${(v.total || 0).toLocaleString()}`);
      });
    }
    return lines.join('\n');
  };

  const handleHeaderWhatsApp = async () => {
    if (vouchers.length === 0) { toast.error("Koi sale vouchers nahi"); return; }
    const text = _saleBookSummaryText();
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Summary copy ho gayi — WhatsApp chat me paste karein", { duration: 4000 });
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    }
  };

  const handleHeaderGroupSummary = () => {
    if (vouchers.length === 0) { toast.error("Koi sale vouchers nahi"); return; }
    setGroupText(_saleBookSummaryText());
    setGroupPdfUrl(`${API}/sale-book/export/pdf?${buildFilterParams()}`);
    setGroupDialogOpen(true);
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

  const handlePrintInvoice = async (v) => {
    const { downloadFile } = await import('../utils/download');
    const { buildFilename } = await import('../utils/filename-format');
    const fname = buildFilename({ base: 'sale-invoice', party: formatSaleVoucher(v) || v.id, ext: 'pdf' });
    downloadFile(`${API}/sale-book/${v.id}/pdf`, fname);
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
    } catch (e) { logger.error(e); toast.error("Delete error"); }
  };

  // WhatsApp Sale Voucher Send
  const [waSending, setWaSending] = useState(null);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupText, setGroupText] = useState("");
  const [groupPdfUrl, setGroupPdfUrl] = useState("");

  const openGroupSendSale = (v) => {
    const total = (v.items || []).reduce((s, i) => s + (i.amount || 0), 0);
    setGroupText(`*Sale Voucher*\nNo: ${formatSaleVoucher(v) || v.id}\nDate: ${v.date}\nParty: *${v.party_name}*\nTotal: *Rs.${total.toLocaleString()}*`);
    setGroupPdfUrl(`/api/sale-book/${v.id}/pdf`);
    setGroupDialogOpen(true);
  };
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
          <Button onClick={handleExportPDF} variant="outline" size="sm" className="border-red-600 text-red-400 hover:bg-red-900/30 h-9 w-9 p-0" title="PDF (current filters)" data-testid="sale-book-pdf-btn">
            <FileText className="w-4 h-4" />
          </Button>
          <Button onClick={handleExportExcel} variant="outline" size="sm" className="border-green-600 text-green-400 hover:bg-green-900/30 h-9 w-9 p-0" title="Excel (current filters)" data-testid="sale-book-excel-btn">
            <FileSpreadsheet className="w-4 h-4" />
          </Button>
          <Button onClick={handleHeaderWhatsApp} variant="outline" size="sm"
            className="h-9 w-9 p-0 text-[#25D366] hover:bg-green-900/30 border border-green-600" title="WhatsApp (summary text)" data-testid="sale-book-whatsapp-btn">
            <WhatsAppIcon className="w-4 h-4" />
          </Button>
          <Button onClick={handleHeaderGroupSummary} variant="outline" size="sm"
            className="h-9 w-9 p-0 text-cyan-400 hover:bg-cyan-900/30 border border-cyan-600" title="Send to Group (summary + PDF)" data-testid="sale-book-group-btn">
            <Users className="w-4 h-4" />
          </Button>
          <Button onClick={openNewForm} className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold" data-testid="sale-book-add-btn">
            <Plus className="w-4 h-4 mr-1" /> New Sale
          </Button>
        </div>
      </div>

      {/* v104.44.42 — Sub-tab Filter: ALL | PKA (GST Pakka) | KCA (Kaccha) */}
      <div className="flex gap-1 items-center bg-slate-800/40 p-1 rounded-md w-fit border border-slate-700" data-testid="sale-book-gst-tabs">
        {[
          { key: "ALL", label: "ALL", activeCls: "bg-amber-500 text-slate-900 shadow-sm", desc: "Sab vouchers" },
          { key: "PKA", label: "PKA", activeCls: "bg-emerald-500 text-slate-900 shadow-sm", desc: "Pakka GST sales" },
          { key: "KCA", label: "KCA", activeCls: "bg-rose-500 text-slate-900 shadow-sm", desc: "Kaccha sales" },
        ].map(t => (
          <button key={t.key} onClick={() => setGstFilter(t.key)} title={t.desc}
            className={`px-4 py-1.5 text-xs font-semibold rounded transition-all ${gstFilter === t.key ? t.activeCls : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
            data-testid={`sale-book-gst-tab-${t.key}`}>
            {t.label}
          </button>
        ))}
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
                <TableHead className="text-slate-400 text-xs">Bill No.</TableHead>
                <TableHead className="text-slate-400 text-xs">Party</TableHead>
                <TableHead className="text-slate-400 text-xs">Destination</TableHead>
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
                <TableRow><TableCell colSpan={13} className="text-center text-slate-500 py-8">
                  {searchQuery ? "Koi result nahi mila." : "Koi sale voucher nahi hai."}
                </TableCell></TableRow>
              )}
              {vouchers.map(v => (
                <TableRow key={v.id} className={`border-slate-700 hover:bg-slate-700/30 ${selectedIds.includes(v.id) ? 'bg-amber-500/10' : ''}`}>
                  <TableCell>
                    <input type="checkbox" checked={selectedIds.includes(v.id)} onChange={() => toggleSelect(v.id)}
                      className="accent-amber-500 w-3.5 h-3.5 cursor-pointer" data-testid={`sv-select-${v.id}`} />
                  </TableCell>
                  <TableCell className="text-amber-400 font-mono text-xs" data-testid={`sb-row-vno-${v.id}`}>{formatSaleVoucher(v)}</TableCell>
                  <TableCell className="text-white text-xs">{fmtDate(v.date)}</TableCell>
                  <TableCell className="text-slate-300 text-xs">{v.invoice_no || '-'}</TableCell>
                  <TableCell className="text-white text-sm font-medium">{v.party_name}</TableCell>
                  <TableCell className="text-slate-300 text-xs">{v.destination || '-'}</TableCell>
                  <TableCell className="text-slate-300 text-xs max-w-[180px] truncate">{(v.items || []).map(i => `${i.item_name}(${i.quantity}KG)`).join(', ')}</TableCell>
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
                    {wa && <Button variant="ghost" size="sm" onClick={() => handleWhatsAppSend(v)} disabled={waSending === v.id} className="text-green-400 hover:text-green-300 h-6 w-6 p-0" title="WhatsApp Send" data-testid={`sv-whatsapp-${v.id}`}>
                      <Send className="w-3 h-3" />
                    </Button>}
                    {wa && <Button variant="ghost" size="sm" onClick={() => openGroupSendSale(v)} className="text-teal-400 hover:text-teal-300 h-6 w-6 p-0" title="Send to Group" data-testid={`sv-group-${v.id}`}>
                      <Users className="w-3 h-3" />
                    </Button>}
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
            {/* Row 1: Voucher No, Bill No, Date, Party, RST, Bill Book */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Voucher No.</Label>
                <Input value={form.voucher_no_label} onChange={e => setForm(p => ({ ...p, voucher_no_label: e.target.value }))}
                  placeholder="S-001" className="bg-slate-700 border-slate-600 text-amber-400 font-mono h-8 text-sm" data-testid="sv-form-voucher-no" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Bill No.</Label>
                <Input value={form.invoice_no} onChange={e => setForm(p => ({ ...p, invoice_no: e.target.value }))}
                  placeholder="Bill No." className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-form-invoice" />
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
                <Input value={form.rst_no} onChange={e => {
                    const v = e.target.value;
                    setForm(p => ({ ...p, rst_no: v }));
                    if (v.trim()) checkRst(v); else clearRstCheck();
                  }}
                  onBlur={async () => {
                    if (!form.rst_no) return;
                    const vw = await fetchVwByRst(form.rst_no, filters.kms_year || "");
                    if (vw) {
                      setForm(p => ({
                        ...p,
                        truck_no: p.truck_no || vw.vehicle_no || "",
                        party_name: p.party_name || vw.party_name || "",
                        destination: p.destination || vw.farmer_name || "",
                        bhada: vw.bhada != null && Number(vw.bhada) > 0 ? String(vw.bhada) : p.bhada,
                      }));
                    }
                  }}
                  placeholder="RST Number" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-form-rst" />
                <RstWarning />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Bill Book</Label>
                <Input value={form.bill_book} onChange={e => setForm(p => ({ ...p, bill_book: e.target.value }))}
                  placeholder="Kaha se bill hua" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-form-billbook" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Destination</Label>
                <Input value={form.destination} onChange={e => setForm(p => ({ ...p, destination: e.target.value }))}
                  placeholder="Maal kaha jayega" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-form-destination" />
              </div>
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
                    <TableHead className="text-slate-400 text-[10px] w-[10%]">Qty (KG)</TableHead>
                    <TableHead className="text-slate-400 text-[10px] w-[10%]">Rate</TableHead>
                    <TableHead className="text-slate-400 text-[10px] w-[10%]">Oil %</TableHead>
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
                      <TableRow key={`item-${idx}-${item.item_name || 'empty'}`} className="border-slate-600">
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
                          {(item.item_name === "Bran" || item.item_name === "Kunda") ? (
                            <Input type="number" step="0.1" value={item.oil_percent || ""} onChange={e => updateItem(idx, 'oil_percent', e.target.value)}
                              className="bg-slate-700 border-slate-600 text-white h-8 text-xs" placeholder="Oil %" data-testid={`sv-item-oil-${idx}`} />
                          ) : <span className="text-slate-500 text-xs px-2">-</span>}
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

              {/* Bhada (Lumpsum) Row */}
              <div className="grid grid-cols-1">
                <div>
                  <Label className="text-[10px] text-amber-400 font-semibold">Bhada / भाड़ा (Lumpsum)</Label>
                  <Input type="number" step="0.01" value={form.bhada} onChange={e => setForm(p => ({ ...p, bhada: e.target.value }))}
                    placeholder="Truck bhada — e.g. 4000"
                    className="bg-amber-900/20 border-amber-700 text-amber-200 h-8 text-xs font-bold" data-testid="sv-bhada" />
                  <p className="text-[9px] text-slate-500 mt-0.5">Single source: Vehicle Weight ke saath sync hota hai (RST ke through)</p>
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
                <p><span className="text-slate-400">Bill No.:</span> <span className="text-white">{payDialog.invoice_no || '-'}</span></p>
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
                  <div key={record.id || `history-${idx}`} className="p-3 rounded-lg border bg-slate-700/50 border-slate-600">
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
                <span>{formatSaleVoucher(gstSummaryVoucher)} | {fmtDate(gstSummaryVoucher.date)}</span>
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
                    <TableRow key={`gst-${row.hsn}-${row.gst_percent}`} className="border-slate-600">
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
      <SendToGroupDialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen} text={groupText} pdfUrl={groupPdfUrl} />
    </div>
  );
}
