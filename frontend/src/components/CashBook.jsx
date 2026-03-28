import { useState, useEffect, useCallback } from "react";
import { fmtDate } from "@/utils/date";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Wallet, Banknote, Users, RefreshCw, Plus, Trash2, Landmark, Receipt, FileText, Send } from "lucide-react";
import SummaryCards from "./cashbook/SummaryCards";
import CashBookFilters from "./cashbook/CashBookFilters";
import TransactionsTable from "./cashbook/TransactionsTable";
import PartySummaryTab from "./cashbook/PartySummaryTab";
import TransactionFormDialog from "./cashbook/TransactionFormDialog";
import GSTLedger from "./GSTLedger";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "./ConfirmProvider";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

const CURRENT_KMS_YEAR = (() => {
  const now = new Date();
  const y = now.getFullYear();
  // FY = April-March
  return now.getMonth() >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
})();

const DEFAULT_CATEGORIES = {
  cash_jama: ["Truck Payment Received", "Sale Payment", "Bank Se Nikala", "Loan Received", "Other"],
  cash_nikasi: ["Truck Payment", "Diesel", "Labour", "Transport", "FRK Purchase", "Bank Me Jama", "Other"],
  bank_jama: ["MSP Payment", "Cash Jama Kiya", "NEFT/RTGS Received", "Cheque Received", "Other"],
  bank_nikasi: ["Payment Transfer", "Cheque Issued", "NEFT/RTGS Sent", "Cash Nikala", "Other"],
};

const CashBook = ({ filters, user }) => {
  const showConfirm = useConfirm();
  const [txns, setTxns] = useState([]);
  const [allTxns, setAllTxns] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [customCategories, setCustomCategories] = useState([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0], account: "cash", txn_type: "jama",
    category: "", party_type: "", description: "", amount: "", reference: "", bank_name: "",
    kms_year: CURRENT_KMS_YEAR, season: "Kharif",
  });
  const [txnFilters, setTxnFilters] = useState({ account: "ledger", txn_type: "", category: "", party_type: "", date_from: "", date_to: "" });
  const [filterPartySearch, setFilterPartySearch] = useState("");
  const [showFilterPartyDropdown, setShowFilterPartyDropdown] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [activeView, setActiveView] = useState("cash-transactions");
  const [partySummary, setPartySummary] = useState(null);
  const [partySummaryFilter, setPartySummaryFilter] = useState("");
  const [isObOpen, setIsObOpen] = useState(false);
  const [obList, setObList] = useState([]);
  const [obForm, setObForm] = useState({ party_name: "", party_type: "Cash Party", amount: "", balance_type: "jama", note: "", ob_account: "ledger" });
  const [bankAccounts, setBankAccounts] = useState([]);
  const [newBankName, setNewBankName] = useState("");
  const [isBankMgmtOpen, setIsBankMgmtOpen] = useState(false);
  const [isObSettingsOpen, setIsObSettingsOpen] = useState(false);
  const [obCash, setObCash] = useState("");
  const [obBankDetails, setObBankDetails] = useState({});
  const [isSvPayOpen, setIsSvPayOpen] = useState(false);
  const [svVouchers, setSvVouchers] = useState([]);
  const [svPayForm, setSvPayForm] = useState({ voucher_id: "", party_name: "", amount: "", date: new Date().toISOString().split('T')[0], notes: "", account: "cash", bank_name: "" });
  const [isPvPayOpen, setIsPvPayOpen] = useState(false);
  const [pvVouchers, setPvVouchers] = useState([]);
  const [pvPayForm, setPvPayForm] = useState({ voucher_id: "", party_name: "", amount: "", date: new Date().toISOString().split('T')[0], notes: "", account: "cash", bank_name: "" });
  const [agentSuggestions, setAgentSuggestions] = useState({ mandi_names: [], truck_numbers: [], agent_names: [] });

  const fetchPartySummary = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      if (partySummaryFilter) params.append('party_type', partySummaryFilter);
      const res = await axios.get(`${API}/cash-book/party-summary?${params}`);
      const data = res.data;
      if (Array.isArray(data)) {
        setPartySummary({
          parties: data,
          summary: {
            total_parties: data.length,
            settled_count: data.filter(p => p.balance === 0).length,
            pending_count: data.filter(p => p.balance !== 0).length,
            total_jama: Math.round(data.reduce((s, p) => s + (p.jama || 0), 0) * 100) / 100,
            total_nikasi: Math.round(data.reduce((s, p) => s + (p.nikasi || 0), 0) * 100) / 100,
            total_outstanding: Math.round(data.filter(p => p.balance !== 0).reduce((s, p) => s + (p.balance || 0), 0) * 100) / 100
          }
        });
      } else {
        setPartySummary(data);
      }
    } catch (e) { toast.error("Party summary load failed"); }
  }, [filters.kms_year, filters.season, partySummaryFilter]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/cash-book/categories`);
      setCustomCategories(res.data);
    } catch (e) { /* ignore */ }
  }, []);

  const fetchAgentNames = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      const res = await axios.get(`${API}/cash-book/agent-names?${params}`);
      setAgentSuggestions(res.data);
    } catch (e) { /* ignore */ }
  }, [filters.kms_year, filters.season]);

  const fetchBankAccounts = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/bank-accounts`);
      setBankAccounts(res.data);
    } catch (e) { /* ignore */ }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      if (activeView === 'cash-transactions') {
        params.append('account', 'cash');
      } else {
        if (txnFilters.account) params.append('account', txnFilters.account);
      }
      params.append('exclude_round_off', 'true');
      if (txnFilters.txn_type) params.append('txn_type', txnFilters.txn_type);
      if (txnFilters.category) params.append('category', txnFilters.category);
      if (txnFilters.party_type) params.append('party_type', txnFilters.party_type);
      if (txnFilters.date_from) params.append('date_from', txnFilters.date_from);
      if (txnFilters.date_to) params.append('date_to', txnFilters.date_to);
      const allParams = new URLSearchParams();
      if (filters.kms_year) allParams.append('kms_year', filters.kms_year);
      if (filters.season) allParams.append('season', filters.season);
      const [txnRes, sumRes, allRes] = await Promise.all([
        axios.get(`${API}/cash-book?${params}`),
        axios.get(`${API}/cash-book/summary?${params}`),
        axios.get(`${API}/cash-book?${allParams}`)
      ]);
      setTxns(txnRes.data);
      setSummary(sumRes.data);
      setAllTxns(allRes.data);
      // Fetch opening balances
      try {
        const obRes = await axios.get(`${API}/opening-balances?kms_year=${filters.kms_year || ''}`);
        setObList(obRes.data);
      } catch {}
    } catch (e) { toast.error("Cash book load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season, txnFilters, activeView]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { fetchAgentNames(); }, [fetchAgentNames]);
  useEffect(() => { fetchBankAccounts(); }, [fetchBankAccounts]);
  useEffect(() => { if (activeView === "party-summary") fetchPartySummary(); }, [activeView, fetchPartySummary]);

  const resetForm = () => setForm({
    date: new Date().toISOString().split('T')[0], account: "cash", txn_type: "jama",
    category: "", party_type: "", description: "", amount: "", reference: "", bank_name: "",
    kms_year: filters.kms_year || CURRENT_KMS_YEAR, season: filters.season || "Kharif",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { toast.error("Amount 0 se zyada hona chahiye"); return; }
    const roundOff = parseFloat(form.round_off) || 0;
    try {
      if (editingId) {
        await axios.put(`${API}/cash-book/${editingId}?username=${user.username}&role=${user.role}`, { ...form, amount: amt });
        toast.success("Transaction update ho gayi!");
      } else {
        await axios.post(`${API}/cash-book?username=${user.username}&role=${user.role}&round_off=${roundOff}`, { ...form, amount: amt });
        toast.success("Transaction save ho gayi!");
      }
      setIsDialogOpen(false);
      setEditingId(null);
      resetForm();
      fetchData();
    } catch (error) { toast.error("Error: " + (error.response?.data?.detail || error.message)); }
  };

  const handleEdit = (t) => {
    setEditingId(t.id);
    setForm({
      date: t.date || "", account: t.account || "cash", txn_type: t.txn_type || "jama",
      category: t.category || "", party_type: t.party_type || "", description: t.description || "",
      amount: String(t.amount || ""), reference: t.reference || "", bank_name: t.bank_name || "",
      kms_year: t.kms_year || CURRENT_KMS_YEAR, season: t.season || "Kharif",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!await showConfirm("Delete", "Kya aap ye transaction delete karna chahte hain?")) return;
    try {
      await axios.delete(`${API}/cash-book/${id}`);
      toast.success("Deleted!"); setSelectedIds(prev => prev.filter(x => x !== id)); fetchData();
    } catch (e) { toast.error("Delete nahi hua"); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!await showConfirm("Bulk Delete", `Kya aap ${selectedIds.length} transactions delete karna chahte hain?`)) return;
    try {
      await axios.post(`${API}/cash-book/delete-bulk`, { ids: selectedIds });
      toast.success(`${selectedIds.length} transactions deleted!`);
      setSelectedIds([]);
      fetchData();
    } catch (e) { toast.error("Bulk delete nahi hua"); }
  };

  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = () => setSelectedIds(prev => prev.length === txns.length ? [] : txns.map(t => t.id));

  const exportData = async (format) => {
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      // Pass all active filters for export
      if (activeView === 'cash-transactions') {
        params.append('account', 'cash');
      } else {
        if (txnFilters.account) params.append('account', txnFilters.account);
      }
      if (txnFilters.txn_type) params.append('txn_type', txnFilters.txn_type);
      if (txnFilters.category) params.append('category', txnFilters.category);
      if (txnFilters.party_type) params.append('party_type', txnFilters.party_type);
      if (txnFilters.date_from) params.append('date_from', txnFilters.date_from);
      if (txnFilters.date_to) params.append('date_to', txnFilters.date_to);
      const res = await axios.get(`${API}/cash-book/${format}?${params}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url;
      a.download = `cash_book.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      a.click(); window.URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} export ho gaya!`);
    } catch (e) { toast.error("Export failed"); }
  };

  const openNewTransaction = () => {
    setEditingId(null);
    resetForm();
    setIsDialogOpen(true);
  };

  // WhatsApp Party Ledger send function
  const sendPartyLedgerWA = async () => {
    const partyName = txnFilters.category || filterPartySearch;
    if (!partyName) { toast.error("Pehle party select karein"); return; }
    try {
      let waSettings;
      try { waSettings = (await axios.get(`${API}/whatsapp/settings`)).data; } catch(e) { waSettings = {}; }
      const hasDefaults = (waSettings.default_numbers || []).length > 0;
      let phone = "";
      if (!hasDefaults) {
        phone = prompt("WhatsApp number daalein (default numbers set nahi hain):");
        if (!phone) return;
      }
      // Calculate totals from displayed transactions
      const partyTxns = txns.filter(t => (t.category || '').toLowerCase() === partyName.toLowerCase());
      const totalDebit = partyTxns.filter(t => t.txn_type === 'nikasi').reduce((s,t) => s + (t.amount || 0), 0);
      const totalCredit = partyTxns.filter(t => t.txn_type === 'jama').reduce((s,t) => s + (t.amount || 0), 0);
      const res = await axios.post(`${API}/whatsapp/send-party-ledger`, {
        party_name: partyName, total_debit: totalDebit, total_credit: totalCredit,
        balance: totalDebit - totalCredit,
        transactions: partyTxns.slice(0, 10).map(t => ({ date: t.date, txn_type: t.txn_type, amount: t.amount, description: t.description })),
        phone
      });
      if (res.data.success) toast.success(res.data.message || "Ledger WhatsApp pe bhej diya!");
      else toast.error(res.data.error || "WhatsApp send fail");
    } catch (e) { toast.error("WhatsApp error: " + (e.response?.data?.detail || e.message)); }
  };

  // Computed values
  const catKey = `${form.account}_${form.txn_type}`;
  const defaultCats = DEFAULT_CATEGORIES[catKey] || [];
  const customCats = customCategories.filter(c => c.type === catKey);
  const txnCategories = [...new Set(allTxns.map(t => t.category).filter(Boolean))];
  // Include mandi names (agents) and truck numbers from entries for easier payment
  const entryNames = [...(agentSuggestions.mandi_names || []), ...(agentSuggestions.truck_numbers || [])];
  const categories = [...new Set([...defaultCats, ...customCats.map(c => c.name), ...txnCategories, ...entryNames])].sort();

  const allCategoriesForFilter = [...new Set(
    allTxns
      .filter(t => !txnFilters.party_type || t.party_type === txnFilters.party_type)
      .map(t => t.category)
      .filter(Boolean)
  )].sort();

  const getPartyBalance = (partyName) => {
    if (!partyName) return null;
    // Only count ledger entries for party balance (source of truth)
    const partyTxns = allTxns.filter(t => t.category && t.category.toLowerCase() === partyName.toLowerCase() && t.account === 'ledger');
    if (partyTxns.length === 0) return null;
    const totalIn = partyTxns.filter(t => t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0);
    const totalOut = partyTxns.filter(t => t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0);
    return { totalIn: Math.round(totalIn * 100) / 100, totalOut: Math.round(totalOut * 100) / 100, balance: Math.round((totalIn - totalOut) * 100) / 100, count: partyTxns.length };
  };
  const partyBalance = getPartyBalance(form.category);

  const handlePartyClick = (p) => {
    setActiveView("transactions");
    setTxnFilters(prev => ({ ...prev, category: p.party_name, party_type: p.party_type || "" }));
  };

  const handleObSubmit = async (e) => {
    e.preventDefault();
    if (!obForm.party_name.trim()) { toast.error("Party name daalo"); return; }
    if (!parseFloat(obForm.amount)) { toast.error("Amount daalo"); return; }
    try {
      const payload = {
        party_name: obForm.party_name.trim(),
        party_type: obForm.party_type,
        amount: parseFloat(obForm.amount) || 0,
        balance_type: obForm.balance_type,
        note: obForm.note || '',
        kms_year: filters.kms_year || CURRENT_KMS_YEAR,
        season: filters.season || "Kharif",
      };
      await axios.post(`${API}/opening-balances?username=${user.username}&role=${user.role}`, payload);
      toast.success("Opening balance save ho gaya!");
      setIsObOpen(false);
      setObForm({ party_name: "", party_type: "Cash Party", amount: "", balance_type: "jama", note: "", ob_account: "ledger" });
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

  const openSvPayDialog = async () => {
    try {
      const res = await axios.get(`${API}/sale-book?kms_year=${filters.kms_year || ''}&season=${filters.season || ''}`);
      const pending = (res.data || []).filter(v => {
        const bal = v.ledger_balance != null ? v.ledger_balance : (v.balance || 0);
        return bal > 0;
      });
      setSvVouchers(pending);
      setSvPayForm({ voucher_id: "", party_name: "", amount: "", date: new Date().toISOString().split('T')[0], notes: "", account: "cash", bank_name: "" });
      setIsSvPayOpen(true);
    } catch { toast.error("Sale vouchers load nahi hue"); }
  };

  const handleSvPaySubmit = async () => {
    if (!svPayForm.voucher_id) { toast.error("Voucher select karein"); return; }
    const amt = parseFloat(svPayForm.amount);
    if (!amt || amt <= 0) { toast.error("Amount daalna zaroori hai"); return; }
    if (svPayForm.account === "bank" && !svPayForm.bank_name) { toast.error("Bank account select karein"); return; }
    try {
      await axios.post(`${API}/voucher-payment`, {
        voucher_type: "sale", voucher_id: svPayForm.voucher_id, amount: amt,
        date: svPayForm.date, notes: svPayForm.notes, username: user.username,
        kms_year: filters.kms_year || "", season: filters.season || "",
        account: svPayForm.account, bank_name: svPayForm.account === "bank" ? svPayForm.bank_name : "",
      });
      toast.success("Sale Voucher Payment record ho gayi!");
      setIsSvPayOpen(false);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Payment error"); }
  };

  const selectedSvVoucher = svVouchers.find(v => v.id === svPayForm.voucher_id);

  const openPvPayDialog = async () => {
    try {
      const res = await axios.get(`${API}/purchase-book?kms_year=${filters.kms_year || ''}&season=${filters.season || ''}`);
      const pending = (res.data || []).filter(v => {
        const bal = v.ledger_balance != null ? v.ledger_balance : (v.balance || 0);
        return bal > 0;
      });
      setPvVouchers(pending);
      setPvPayForm({ voucher_id: "", party_name: "", amount: "", date: new Date().toISOString().split('T')[0], notes: "", account: "cash", bank_name: "" });
      setIsPvPayOpen(true);
    } catch { toast.error("Purchase vouchers load nahi hue"); }
  };

  const handlePvPaySubmit = async () => {
    if (!pvPayForm.voucher_id) { toast.error("Voucher select karein"); return; }
    const amt = parseFloat(pvPayForm.amount);
    if (!amt || amt <= 0) { toast.error("Amount daalna zaroori hai"); return; }
    if (pvPayForm.account === "bank" && !pvPayForm.bank_name) { toast.error("Bank account select karein"); return; }
    try {
      await axios.post(`${API}/voucher-payment`, {
        voucher_type: "purchase", voucher_id: pvPayForm.voucher_id, amount: amt,
        date: pvPayForm.date, notes: pvPayForm.notes, username: user.username,
        kms_year: filters.kms_year || "", season: filters.season || "",
        account: pvPayForm.account, bank_name: pvPayForm.account === "bank" ? pvPayForm.bank_name : "",
      });
      toast.success("Purchase Voucher Payment record ho gayi!");
      setIsPvPayOpen(false);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Payment error"); }
  };

  const selectedPvVoucher = pvVouchers.find(v => v.id === pvPayForm.voucher_id);

  return (
    <div className="space-y-4" data-testid="cash-book">
      {/* Action Buttons Row */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => setIsBankMgmtOpen(true)} variant="outline" size="sm" className="border-indigo-600 text-indigo-400 hover:bg-indigo-900/30" data-testid="bank-mgmt-btn">
          <Landmark className="w-3 h-3 mr-1" /> Bank Accounts
        </Button>
        <Button onClick={openSvPayDialog} variant="outline" size="sm" className="border-emerald-600 text-emerald-400 hover:bg-emerald-900/30" data-testid="sv-payment-btn">
          <FileText className="w-3 h-3 mr-1" /> Sale Voucher Payment
        </Button>
        <Button onClick={openPvPayDialog} variant="outline" size="sm" className="border-orange-600 text-orange-400 hover:bg-orange-900/30" data-testid="pv-payment-btn">
          <FileText className="w-3 h-3 mr-1" /> Purchase Voucher Payment
        </Button>
        <Button onClick={async () => {
          try {
            const res = await axios.get(`${API}/cash-book/opening-balance?kms_year=${filters.kms_year || CURRENT_KMS_YEAR}`);
            setObCash(String(res.data.cash || 0));
            const bd = res.data.bank_details || {};
            const merged = {};
            bankAccounts.forEach(b => { merged[b.name] = String(bd[b.name] || 0); });
            setObBankDetails(merged);
            setIsObSettingsOpen(true);
          } catch { toast.error("Opening balance load failed"); }
        }} variant="outline" size="sm" className="border-purple-600 text-purple-400 hover:bg-purple-900/30" data-testid="ob-settings-btn">
          <Wallet className="w-3 h-3 mr-1" /> Set Opening Balance
        </Button>
      </div>

      <SummaryCards summary={summary} onNewTransaction={openNewTransaction} onExport={exportData} />

      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700">
          <Button onClick={() => { setActiveView("cash-transactions"); setTxnFilters(prev => ({ ...prev, category: "", party_type: "" })); }} variant="ghost" size="sm"
            className={activeView === "cash-transactions" ? "bg-amber-500 text-slate-900 hover:bg-amber-600" : "text-slate-300 hover:bg-slate-700"}
            data-testid="cashbook-tab-cash-transactions">
            <Banknote className="w-4 h-4 mr-1" /> Cash Transactions
          </Button>
          <Button onClick={() => { setActiveView("transactions"); setTxnFilters(prev => ({ ...prev, category: "", party_type: "" })); }} variant="ghost" size="sm"
            className={activeView === "transactions" ? "bg-amber-500 text-slate-900 hover:bg-amber-600" : "text-slate-300 hover:bg-slate-700"}
            data-testid="cashbook-tab-transactions">
            <Wallet className="w-4 h-4 mr-1" /> Party Ledgers
          </Button>
          <Button onClick={() => setActiveView("party-summary")} variant="ghost" size="sm"
            className={activeView === "party-summary" ? "bg-amber-500 text-slate-900 hover:bg-amber-600" : "text-slate-300 hover:bg-slate-700"}
            data-testid="cashbook-tab-party-summary">
            <Users className="w-4 h-4 mr-1" /> Party Summary
          </Button>
          <Button onClick={() => setActiveView("gst-ledger")} variant="ghost" size="sm"
            className={activeView === "gst-ledger" ? "bg-purple-500 text-white hover:bg-purple-600" : "text-slate-300 hover:bg-slate-700"}
            data-testid="cashbook-tab-gst-ledger">
            <Receipt className="w-4 h-4 mr-1" /> GST Ledger
          </Button>
        </div>
        <Button onClick={() => activeView === "party-summary" ? fetchPartySummary() : fetchData()} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
        {activeView === "transactions" && (txnFilters.category || filterPartySearch) && (
          <Button onClick={sendPartyLedgerWA} variant="outline" size="sm" className="border-green-600 text-green-400 hover:bg-green-600/10" data-testid="cashbook-party-ledger-whatsapp">
            <Send className="w-4 h-4 mr-1" /> WhatsApp
          </Button>
        )}
      </div>

      {/* Opening Balances Display */}
      {obList.length > 0 && (
        <div className="bg-slate-800/30 border border-blue-800/50 rounded-lg p-3">
          <div className="text-xs font-semibold text-blue-400 mb-2">Opening Balances (FY: {filters.kms_year})</div>
          <div className="flex flex-wrap gap-2">
            {obList.map(ob => (
              <div key={ob.id} className="flex items-center gap-1 bg-slate-700/50 px-2 py-1 rounded text-xs">
                <span className="text-white font-medium">{ob.category}</span>
                <span className={`font-bold ${ob.txn_type === 'jama' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {ob.txn_type === 'jama' ? '+' : '-'}Rs.{ob.amount?.toLocaleString('en-IN')}
                </span>
                <span className="text-slate-500 text-[10px]">{ob.party_type}</span>
                <button onClick={() => handleObDelete(ob.id)} className="text-red-400 hover:text-red-300 ml-1">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(activeView === "transactions" || activeView === "cash-transactions") && (<>
        <CashBookFilters
          activeView={activeView} txnFilters={txnFilters} setTxnFilters={setTxnFilters}
          allTxns={allTxns} filterPartySearch={filterPartySearch} setFilterPartySearch={setFilterPartySearch}
          showFilterPartyDropdown={showFilterPartyDropdown} setShowFilterPartyDropdown={setShowFilterPartyDropdown}
          allCategoriesForFilter={allCategoriesForFilter}
        />
        {(() => {
          const displayedTxns = (filterPartySearch && !txnFilters.category)
            ? txns.filter(t => (t.category || '').toLowerCase().includes(filterPartySearch.toLowerCase()))
            : txns;
          return displayedTxns.length === 0 && filterPartySearch && !txnFilters.category ? (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8 text-center" data-testid="no-ledger-found">
              <p className="text-slate-400 text-sm">"{filterPartySearch}" ka koi ledger nahi mila</p>
              <p className="text-slate-500 text-xs mt-1">No ledger found for this party</p>
            </div>
          ) : (
            <TransactionsTable
              txns={displayedTxns} loading={loading} user={user}
              selectedIds={selectedIds} toggleSelect={toggleSelect} toggleSelectAll={toggleSelectAll}
              handleBulkDelete={handleBulkDelete} handleEdit={handleEdit} handleDelete={handleDelete}
            />
          );
        })()}
      </>)}

      {activeView === "party-summary" && (
        <PartySummaryTab
          partySummary={partySummary} partySummaryFilter={partySummaryFilter}
          setPartySummaryFilter={setPartySummaryFilter} filters={filters}
          API={API} onPartyClick={handlePartyClick}
        />
      )}

      {activeView === "gst-ledger" && (
        <GSTLedger filters={filters} />
      )}

      <TransactionFormDialog
        isOpen={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingId(null); }}
        editingId={editingId} form={form} setForm={setForm} summary={summary}
        categories={categories} allTxns={allTxns} partyBalance={partyBalance}
        onSubmit={handleSubmit} bankAccounts={bankAccounts}
      />

      {/* Opening Balance Dialog (Party Ledger) */}
      <Dialog open={isObOpen} onOpenChange={setIsObOpen}>
        <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-white" data-testid="cashbook-ob-dialog">
          <DialogHeader>
            <DialogTitle className="text-blue-400">Opening Balance (Party Ledger)</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleObSubmit} className="space-y-3">
            <div>
              <Label className="text-xs text-slate-400">Party / Account Name *</Label>
              <Input value={obForm.party_name} onChange={e => setObForm(p => ({ ...p, party_name: e.target.value }))}
                placeholder="Party ka naam" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="ob-party-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Balance Type</Label>
                <Select value={obForm.balance_type} onValueChange={v => setObForm(p => ({ ...p, balance_type: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="ob-bal-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jama">Jama (Cr)</SelectItem>
                    <SelectItem value="nikasi">Nikasi (Dr)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-400">Party Type</Label>
                <Select value={obForm.party_type} onValueChange={v => setObForm(p => ({ ...p, party_type: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="ob-party-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash Party">Cash Party</SelectItem>
                    <SelectItem value="Pvt Paddy Purchase">Pvt Paddy Purchase</SelectItem>
                    <SelectItem value="Rice Sale">Rice Sale</SelectItem>
                    <SelectItem value="Diesel">Diesel</SelectItem>
                    <SelectItem value="Local Party">Local Party</SelectItem>
                    <SelectItem value="Truck">Truck</SelectItem>
                    <SelectItem value="Agent">Agent</SelectItem>
                    <SelectItem value="By-Product Sale">By-Product Sale</SelectItem>
                    <SelectItem value="Sale Book">Sale Book</SelectItem>
                    <SelectItem value="Staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-400">Amount (Rs.) *</Label>
              <Input type="number" step="0.01" value={obForm.amount} onChange={e => setObForm(p => ({ ...p, amount: e.target.value }))}
                placeholder="0" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="ob-amount" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Note</Label>
              <Input value={obForm.note} onChange={e => setObForm(p => ({ ...p, note: e.target.value }))}
                placeholder="Optional note" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="ob-note" />
            </div>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold" data-testid="ob-submit-btn">
              Save Opening Balance
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bank Account Management Dialog */}
      <Dialog open={isBankMgmtOpen} onOpenChange={setIsBankMgmtOpen}>
        <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-white" data-testid="bank-mgmt-dialog">
          <DialogHeader>
            <DialogTitle className="text-indigo-400">Bank Accounts</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input value={newBankName} onChange={e => setNewBankName(e.target.value)}
                placeholder="Bank name (e.g. Bank of Baroda)" className="bg-slate-700 border-slate-600 text-white h-8 text-sm flex-1" data-testid="new-bank-name" />
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white h-8" data-testid="add-bank-btn"
                onClick={async () => {
                  if (!newBankName.trim()) return;
                  try {
                    await axios.post(`${API}/bank-accounts`, { name: newBankName.trim() });
                    toast.success("Bank account added!"); setNewBankName(""); fetchBankAccounts();
                  } catch (e) { toast.error(e.response?.data?.detail || "Error adding bank"); }
                }}>
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
            {bankAccounts.length === 0 && <p className="text-xs text-slate-500 text-center py-4">Koi bank account nahi hai. Upar se add karein.</p>}
            <div className="space-y-1 max-h-60 overflow-auto">
              {bankAccounts.map(b => (
                <div key={b.id} className="flex items-center justify-between bg-slate-700/50 px-3 py-2 rounded" data-testid={`bank-item-${b.id}`}>
                  <div className="flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm text-white">{b.name}</span>
                  </div>
                  <button onClick={async () => {
                    if (!await showConfirm("Delete Bank", `"${b.name}" delete karna hai?`)) return;
                    try { await axios.delete(`${API}/bank-accounts/${b.id}`); toast.success("Deleted"); fetchBankAccounts(); }
                    catch { toast.error("Delete failed"); }
                  }} className="text-red-400 hover:text-red-300">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Opening Balance Settings Dialog (Cash + Bank) */}
      <Dialog open={isObSettingsOpen} onOpenChange={setIsObSettingsOpen}>
        <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-white" data-testid="ob-settings-dialog">
          <DialogHeader>
            <DialogTitle className="text-purple-400">Opening Balance Settings (FY: {filters.kms_year || CURRENT_KMS_YEAR})</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-slate-400 font-semibold">Cash Opening Balance (Rs.)</Label>
              <Input type="number" step="0.01" value={obCash} onChange={e => setObCash(e.target.value)}
                placeholder="0" className="bg-slate-700 border-slate-600 text-white h-9 text-sm mt-1" data-testid="ob-cash-input" />
            </div>
            {bankAccounts.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-slate-400 font-semibold">Bank Opening Balances (Rs.)</Label>
                {bankAccounts.map(b => (
                  <div key={b.id} className="flex items-center gap-2">
                    <span className="text-xs text-indigo-300 w-40 truncate">{b.name}</span>
                    <Input type="number" step="0.01" value={obBankDetails[b.name] || ""}
                      onChange={e => setObBankDetails(prev => ({ ...prev, [b.name]: e.target.value }))}
                      placeholder="0" className="bg-slate-700 border-slate-600 text-white h-8 text-sm flex-1" data-testid={`ob-bank-${b.name}`} />
                  </div>
                ))}
              </div>
            )}
            {bankAccounts.length === 0 && (
              <p className="text-xs text-slate-500">Pehle "Bank Accounts" button se bank add karein, phir yahan opening balance set hoga.</p>
            )}
            <div className="bg-slate-700/50 rounded p-2 text-xs text-slate-300">
              <span className="font-semibold">Total Opening: </span>
              Rs.{(parseFloat(obCash || 0) + Object.values(obBankDetails).reduce((s, v) => s + (parseFloat(v) || 0), 0)).toLocaleString('en-IN')}
            </div>
            <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold" data-testid="ob-settings-save"
              onClick={async () => {
                try {
                  const bankDet = {};
                  Object.entries(obBankDetails).forEach(([k, v]) => { bankDet[k] = parseFloat(v) || 0; });
                  await axios.put(`${API}/cash-book/opening-balance`, {
                    kms_year: filters.kms_year || CURRENT_KMS_YEAR,
                    cash: parseFloat(obCash) || 0,
                    bank_details: bankDet,
                  });
                  toast.success("Opening balance save ho gaya!"); setIsObSettingsOpen(false); fetchData();
                } catch { toast.error("Save failed"); }
              }}>
              Save Opening Balance
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Sale Voucher Payment Dialog */}
      <Dialog open={isSvPayOpen} onOpenChange={setIsSvPayOpen}>
        <DialogContent className="max-w-sm bg-slate-800 border-slate-700 text-white" data-testid="sv-payment-dialog">
          <DialogHeader>
            <DialogTitle className="text-emerald-400 flex items-center gap-2">
              <FileText className="w-5 h-5" /> Sale Voucher Payment / बिक्री भुगतान
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-slate-400">Sale Voucher Select Karein *</Label>
              <Select value={svPayForm.voucher_id} onValueChange={v => {
                const sv = svVouchers.find(x => x.id === v);
                setSvPayForm(p => ({ ...p, voucher_id: v, party_name: sv?.party_name || "" }));
              }}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-pay-select-voucher">
                  <SelectValue placeholder="Voucher select karein..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600 max-h-60">
                  {svVouchers.length === 0 ? (
                    <div className="text-slate-400 text-xs text-center py-3">Koi pending sale voucher nahi hai</div>
                  ) : svVouchers.map(v => (
                    <SelectItem key={v.id} value={v.id} className="text-white text-xs">
                      {v.party_name} - #{v.voucher_no} | Bal: Rs.{(v.ledger_balance != null ? v.ledger_balance : v.balance)?.toLocaleString('en-IN')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedSvVoucher && (
              <div className="bg-slate-900 p-3 rounded border border-slate-700 text-xs space-y-1">
                <p><span className="text-slate-400">Party:</span> <span className="text-white font-medium">{selectedSvVoucher.party_name}</span></p>
                <p><span className="text-slate-400">Invoice:</span> <span className="text-white">{selectedSvVoucher.invoice_no || '-'}</span></p>
                <p><span className="text-slate-400">Total:</span> <span className="text-emerald-400 font-bold">Rs.{selectedSvVoucher.total?.toLocaleString('en-IN')}</span></p>
                <p><span className="text-slate-400">Balance Due:</span> <span className="text-red-400 font-bold">Rs.{(selectedSvVoucher.ledger_balance != null ? selectedSvVoucher.ledger_balance : selectedSvVoucher.balance)?.toLocaleString('en-IN')}</span></p>
              </div>
            )}
            <div><Label className="text-xs text-slate-400">Date</Label>
              <Input type="date" value={svPayForm.date} onChange={e => setSvPayForm(p => ({ ...p, date: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-pay-cb-date" /></div>
            <div><Label className="text-xs text-slate-400">Payment Mode</Label>
              <Select value={svPayForm.account} onValueChange={v => setSvPayForm(p => ({ ...p, account: v, bank_name: v === "cash" ? "" : p.bank_name }))}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-pay-cb-account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  <SelectItem value="cash" className="text-white">Cash (नकद)</SelectItem>
                  <SelectItem value="bank" className="text-white">Bank (बैंक)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {svPayForm.account === "bank" && (
              <div><Label className="text-xs text-slate-400">Bank Account</Label>
                <Select value={svPayForm.bank_name} onValueChange={v => setSvPayForm(p => ({ ...p, bank_name: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-pay-cb-bank">
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
              <Input type="number" step="0.01" value={svPayForm.amount} onChange={e => setSvPayForm(p => ({ ...p, amount: e.target.value }))}
                placeholder={selectedSvVoucher ? `Max: ${selectedSvVoucher.ledger_balance != null ? selectedSvVoucher.ledger_balance : selectedSvVoucher.balance}` : "0"}
                className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-pay-cb-amount" /></div>
            <div><Label className="text-xs text-slate-400">Notes</Label>
              <Input value={svPayForm.notes} onChange={e => setSvPayForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Optional" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-pay-cb-notes" /></div>
            <Button onClick={handleSvPaySubmit} disabled={!svPayForm.voucher_id}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold" data-testid="sv-pay-cb-submit">
              {svPayForm.account === "bank" && svPayForm.bank_name ? `Bank (${svPayForm.bank_name}) mein Record` : "Cash mein Record"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Purchase Voucher Payment Dialog */}
      <Dialog open={isPvPayOpen} onOpenChange={setIsPvPayOpen}>
        <DialogContent className="max-w-sm bg-slate-800 border-slate-700 text-white" data-testid="pv-payment-dialog">
          <DialogHeader>
            <DialogTitle className="text-orange-400 flex items-center gap-2">
              <FileText className="w-5 h-5" /> Purchase Voucher Payment / खरीद भुगतान
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-slate-400">Purchase Voucher Select Karein *</Label>
              <Select value={pvPayForm.voucher_id} onValueChange={v => {
                const pv = pvVouchers.find(x => x.id === v);
                setPvPayForm(p => ({ ...p, voucher_id: v, party_name: pv?.party_name || "" }));
              }}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pv-pay-select-voucher">
                  <SelectValue placeholder="Voucher select karein..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600 max-h-60">
                  {pvVouchers.length === 0 ? (
                    <div className="text-slate-400 text-xs text-center py-3">Koi pending purchase voucher nahi hai</div>
                  ) : pvVouchers.map(v => (
                    <SelectItem key={v.id} value={v.id} className="text-white text-xs">
                      {v.party_name} - #{v.voucher_no} | Bal: Rs.{(v.ledger_balance != null ? v.ledger_balance : v.balance)?.toLocaleString('en-IN')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedPvVoucher && (
              <div className="bg-slate-900 p-3 rounded border border-slate-700 text-xs space-y-1">
                <p><span className="text-slate-400">Party:</span> <span className="text-white font-medium">{selectedPvVoucher.party_name}</span></p>
                <p><span className="text-slate-400">Invoice:</span> <span className="text-white">{selectedPvVoucher.invoice_no || '-'}</span></p>
                <p><span className="text-slate-400">Total:</span> <span className="text-orange-400 font-bold">Rs.{selectedPvVoucher.total?.toLocaleString('en-IN')}</span></p>
                <p><span className="text-slate-400">Balance Due:</span> <span className="text-red-400 font-bold">Rs.{(selectedPvVoucher.ledger_balance != null ? selectedPvVoucher.ledger_balance : selectedPvVoucher.balance)?.toLocaleString('en-IN')}</span></p>
              </div>
            )}
            <div><Label className="text-xs text-slate-400">Date</Label>
              <Input type="date" value={pvPayForm.date} onChange={e => setPvPayForm(p => ({ ...p, date: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pv-pay-cb-date" /></div>
            <div><Label className="text-xs text-slate-400">Payment Mode</Label>
              <Select value={pvPayForm.account} onValueChange={v => setPvPayForm(p => ({ ...p, account: v, bank_name: v === "cash" ? "" : p.bank_name }))}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pv-pay-cb-account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  <SelectItem value="cash" className="text-white">Cash (नकद)</SelectItem>
                  <SelectItem value="bank" className="text-white">Bank (बैंक)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {pvPayForm.account === "bank" && (
              <div><Label className="text-xs text-slate-400">Bank Account</Label>
                <Select value={pvPayForm.bank_name} onValueChange={v => setPvPayForm(p => ({ ...p, bank_name: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pv-pay-cb-bank">
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
              <Input type="number" step="0.01" value={pvPayForm.amount} onChange={e => setPvPayForm(p => ({ ...p, amount: e.target.value }))}
                placeholder={selectedPvVoucher ? `Max: ${selectedPvVoucher.ledger_balance != null ? selectedPvVoucher.ledger_balance : selectedPvVoucher.balance}` : "0"}
                className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pv-pay-cb-amount" /></div>
            <div><Label className="text-xs text-slate-400">Notes</Label>
              <Input value={pvPayForm.notes} onChange={e => setPvPayForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Optional" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="pv-pay-cb-notes" /></div>
            <Button onClick={handlePvPaySubmit} disabled={!pvPayForm.voucher_id}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold" data-testid="pv-pay-cb-submit">
              {pvPayForm.account === "bank" && pvPayForm.bank_name ? `Bank (${pvPayForm.bank_name}) mein Record` : "Cash mein Record"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CashBook;
