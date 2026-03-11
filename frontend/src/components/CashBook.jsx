import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Wallet, Banknote, Users, RefreshCw } from "lucide-react";
import SummaryCards from "./cashbook/SummaryCards";
import CashBookFilters from "./cashbook/CashBookFilters";
import TransactionsTable from "./cashbook/TransactionsTable";
import PartySummaryTab from "./cashbook/PartySummaryTab";
import TransactionFormDialog from "./cashbook/TransactionFormDialog";

const BACKEND_URL = (typeof window !== 'undefined' && window.ELECTRON_API_URL) || process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CURRENT_KMS_YEAR = (() => {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
})();

const DEFAULT_CATEGORIES = {
  cash_jama: ["Truck Payment Received", "Sale Payment", "Bank Se Nikala", "Loan Received", "Other"],
  cash_nikasi: ["Truck Payment", "Diesel", "Labour", "Transport", "FRK Purchase", "Bank Me Jama", "Other"],
  bank_jama: ["MSP Payment", "Cash Jama Kiya", "NEFT/RTGS Received", "Cheque Received", "Other"],
  bank_nikasi: ["Payment Transfer", "Cheque Issued", "NEFT/RTGS Sent", "Cash Nikala", "Other"],
};

const CashBook = ({ filters, user }) => {
  const [txns, setTxns] = useState([]);
  const [allTxns, setAllTxns] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [customCategories, setCustomCategories] = useState([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0], account: "cash", txn_type: "jama",
    category: "", party_type: "", description: "", amount: "", reference: "",
    kms_year: CURRENT_KMS_YEAR, season: "Kharif",
  });
  const [txnFilters, setTxnFilters] = useState({ account: "", txn_type: "", category: "", party_type: "", date_from: "", date_to: "" });
  const [filterPartySearch, setFilterPartySearch] = useState("");
  const [showFilterPartyDropdown, setShowFilterPartyDropdown] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [activeView, setActiveView] = useState("cash-transactions");
  const [partySummary, setPartySummary] = useState(null);
  const [partySummaryFilter, setPartySummaryFilter] = useState("");

  const fetchPartySummary = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      if (partySummaryFilter) params.append('party_type', partySummaryFilter);
      const res = await axios.get(`${API}/cash-book/party-summary?${params}`);
      setPartySummary(res.data);
    } catch (e) { toast.error("Party summary load failed"); }
  }, [filters.kms_year, filters.season, partySummaryFilter]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/cash-book/categories`);
      setCustomCategories(res.data);
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
    } catch (e) { toast.error("Cash book load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season, txnFilters, activeView]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { if (activeView === "party-summary") fetchPartySummary(); }, [activeView, fetchPartySummary]);

  const resetForm = () => setForm({
    date: new Date().toISOString().split('T')[0], account: "cash", txn_type: "jama",
    category: "", party_type: "", description: "", amount: "", reference: "",
    kms_year: filters.kms_year || CURRENT_KMS_YEAR, season: filters.season || "Kharif",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { toast.error("Amount 0 se zyada hona chahiye"); return; }
    try {
      if (editingId) {
        await axios.put(`${API}/cash-book/${editingId}?username=${user.username}&role=${user.role}`, { ...form, amount: amt });
        toast.success("Transaction update ho gayi!");
      } else {
        await axios.post(`${API}/cash-book?username=${user.username}&role=${user.role}`, { ...form, amount: amt });
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
      amount: String(t.amount || ""), reference: t.reference || "",
      kms_year: t.kms_year || CURRENT_KMS_YEAR, season: t.season || "Kharif",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Kya aap ye transaction delete karna chahte hain?")) return;
    try {
      await axios.delete(`${API}/cash-book/${id}`);
      toast.success("Deleted!"); setSelectedIds(prev => prev.filter(x => x !== id)); fetchData();
    } catch (e) { toast.error("Delete nahi hua"); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Kya aap ${selectedIds.length} transactions delete karna chahte hain?`)) return;
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
      if (txnFilters.account) params.append('account', txnFilters.account);
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

  // Computed values
  const catKey = `${form.account}_${form.txn_type}`;
  const defaultCats = DEFAULT_CATEGORIES[catKey] || [];
  const customCats = customCategories.filter(c => c.type === catKey);
  const txnCategories = [...new Set(allTxns.map(t => t.category).filter(Boolean))];
  const categories = [...new Set([...defaultCats, ...customCats.map(c => c.name), ...txnCategories])].sort();

  const allCategoriesForFilter = [...new Set(
    allTxns
      .filter(t => !txnFilters.party_type || t.party_type === txnFilters.party_type)
      .map(t => t.category)
      .filter(Boolean)
  )].sort();

  const getPartyBalance = (partyName) => {
    if (!partyName) return null;
    const partyTxns = allTxns.filter(t => t.category && t.category.toLowerCase() === partyName.toLowerCase());
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

  return (
    <div className="space-y-4" data-testid="cash-book">
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
        </div>
        <Button onClick={() => activeView === "party-summary" ? fetchPartySummary() : fetchData()} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {(activeView === "transactions" || activeView === "cash-transactions") && (<>
        <CashBookFilters
          activeView={activeView} txnFilters={txnFilters} setTxnFilters={setTxnFilters}
          allTxns={allTxns} filterPartySearch={filterPartySearch} setFilterPartySearch={setFilterPartySearch}
          showFilterPartyDropdown={showFilterPartyDropdown} setShowFilterPartyDropdown={setShowFilterPartyDropdown}
          allCategoriesForFilter={allCategoriesForFilter}
        />
        <TransactionsTable
          txns={txns} loading={loading} user={user}
          selectedIds={selectedIds} toggleSelect={toggleSelect} toggleSelectAll={toggleSelectAll}
          handleBulkDelete={handleBulkDelete} handleEdit={handleEdit} handleDelete={handleDelete}
        />
      </>)}

      {activeView === "party-summary" && (
        <PartySummaryTab
          partySummary={partySummary} partySummaryFilter={partySummaryFilter}
          setPartySummaryFilter={setPartySummaryFilter} filters={filters}
          API={API} onPartyClick={handlePartyClick}
        />
      )}

      <TransactionFormDialog
        isOpen={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingId(null); }}
        editingId={editingId} form={form} setForm={setForm} summary={summary}
        categories={categories} allTxns={allTxns} partyBalance={partyBalance}
        onSubmit={handleSubmit}
      />
    </div>
  );
};

export default CashBook;
