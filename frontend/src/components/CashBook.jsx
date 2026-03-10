import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";

const fmtDate = (d) => { if (!d) return ''; const p = String(d).split('-'); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d; };
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
import { Trash2, Plus, RefreshCw, Filter, X, Download, FileText, ArrowDownCircle, ArrowUpCircle, Wallet, Landmark, PlusCircle, Pencil, Users, CheckCircle, AlertCircle } from "lucide-react";

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
  const [allTxns, setAllTxns] = useState([]); // unfiltered txns for category list
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [customCategories, setCustomCategories] = useState([]);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0], account: "cash", txn_type: "jama",
    category: "", party_type: "", description: "", amount: "", reference: "",
    kms_year: CURRENT_KMS_YEAR, season: "Kharif",
  });
  const [txnFilters, setTxnFilters] = useState({ account: "", txn_type: "", category: "", party_type: "", date_from: "", date_to: "" });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [activeView, setActiveView] = useState("transactions"); // "transactions" or "party-summary"
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
      if (txnFilters.account) params.append('account', txnFilters.account);
      if (txnFilters.txn_type) params.append('txn_type', txnFilters.txn_type);
      if (txnFilters.category) params.append('category', txnFilters.category);
      if (txnFilters.party_type) params.append('party_type', txnFilters.party_type);
      if (txnFilters.date_from) params.append('date_from', txnFilters.date_from);
      if (txnFilters.date_to) params.append('date_to', txnFilters.date_to);
      // Also fetch unfiltered list for category dropdown
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
  }, [filters.kms_year, filters.season, txnFilters]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { if (activeView === "party-summary") fetchPartySummary(); }, [activeView, fetchPartySummary]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { toast.error("Amount 0 se zyada hona chahiye"); return; }
    try {
      if (editingId) {
        await axios.put(`${API}/cash-book/${editingId}?username=${user.username}&role=${user.role}`, {
          ...form, amount: amt,
        });
        toast.success("Transaction update ho gayi!");
      } else {
        await axios.post(`${API}/cash-book?username=${user.username}&role=${user.role}`, {
          ...form, amount: amt,
        });
        toast.success("Transaction save ho gayi!");
      }
      setIsDialogOpen(false);
      setEditingId(null);
      setForm({ date: new Date().toISOString().split('T')[0], account: "cash", txn_type: "jama",
        category: "", party_type: "", description: "", amount: "", reference: "",
        kms_year: filters.kms_year || CURRENT_KMS_YEAR, season: filters.season || "Kharif" });
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

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.length === txns.length ? [] : txns.map(t => t.id));
  };

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

  const catKey = `${form.account}_${form.txn_type}`;
  const defaultCats = DEFAULT_CATEGORIES[catKey] || [];
  const customCats = customCategories.filter(c => c.type === catKey);
  // Include categories from all transactions for autocomplete
  const txnCategories = [...new Set(allTxns.map(t => t.category).filter(Boolean))];
  const categories = [...new Set([...defaultCats, ...customCats.map(c => c.name), ...txnCategories])].sort();

  // All unique categories for filter dropdown (from all txns)
  // If party_type filter is active, only show parties matching that type
  const allCategoriesForFilter = [...new Set(
    allTxns
      .filter(t => !txnFilters.party_type || t.party_type === txnFilters.party_type)
      .map(t => t.category)
      .filter(Boolean)
  )].sort();

  // Compute party balance when category is typed
  const getPartyBalance = (partyName) => {
    if (!partyName) return null;
    const partyTxns = allTxns.filter(t => t.category && t.category.toLowerCase() === partyName.toLowerCase());
    if (partyTxns.length === 0) return null;
    const totalIn = partyTxns.filter(t => t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0);
    const totalOut = partyTxns.filter(t => t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0);
    return { totalIn: Math.round(totalIn * 100) / 100, totalOut: Math.round(totalOut * 100) / 100, balance: Math.round((totalIn - totalOut) * 100) / 100, count: partyTxns.length };
  };
  const partyBalance = getPartyBalance(form.category);

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      await axios.post(`${API}/cash-book/categories`, { name, type: catKey });
      toast.success(`Category "${name}" add ho gayi!`);
      setNewCategoryName("");
      setShowAddCategory(false);
      setForm(p => ({ ...p, category: name }));
      fetchCategories();
    } catch (e) { toast.error(e.response?.data?.detail || "Category add nahi hui"); }
  };

  const handleDeleteCategory = async (catId, catName) => {
    if (!window.confirm(`"${catName}" category delete karein?`)) return;
    try {
      await axios.delete(`${API}/cash-book/categories/${catId}`);
      toast.success("Category deleted!");
      fetchCategories();
    } catch (e) { toast.error("Delete nahi hua"); }
  };

  return (
    <div className="space-y-4" data-testid="cash-book">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* Opening Balance Card */}
          <Card className="bg-purple-50 border-purple-200 shadow-sm" data-testid="opening-balance-card">
            <CardContent className="p-4">
              <p className="text-xs text-purple-600 font-medium mb-1">Opening Balance / शुरुआती</p>
              <p className="text-lg font-bold text-purple-800">
                ₹{((summary.opening_cash || 0) + (summary.opening_bank || 0)).toLocaleString('en-IN')}
              </p>
              <div className="flex gap-3 mt-1 text-[10px]">
                <span className="text-green-700 font-medium">Cash: ₹{(summary.opening_cash || 0).toLocaleString('en-IN')}</span>
                <span className="text-blue-700 font-medium">Bank: ₹{(summary.opening_bank || 0).toLocaleString('en-IN')}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200 shadow-sm" data-testid="cash-balance-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-4 h-4 text-green-600" />
                <p className="text-xs text-green-700 font-medium">Cash in Hand / नकद</p>
              </div>
              <p className={`text-2xl font-bold ${summary.cash_balance >= 0 ? 'text-green-800' : 'text-red-600'}`}>
                ₹{summary.cash_balance.toLocaleString('en-IN')}
              </p>
              <div className="flex gap-3 mt-1 text-[10px]">
                <span className="text-green-700 font-medium">In: ₹{summary.cash_in.toLocaleString('en-IN')}</span>
                <span className="text-red-600 font-medium">Out: ₹{summary.cash_out.toLocaleString('en-IN')}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-blue-50 border-blue-200 shadow-sm" data-testid="bank-balance-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Landmark className="w-4 h-4 text-blue-600" />
                <p className="text-xs text-blue-700 font-medium">Bank Balance / बैंक</p>
              </div>
              <p className={`text-2xl font-bold ${summary.bank_balance >= 0 ? 'text-blue-800' : 'text-red-600'}`}>
                ₹{summary.bank_balance.toLocaleString('en-IN')}
              </p>
              <div className="flex gap-3 mt-1 text-[10px]">
                <span className="text-green-700 font-medium">In: ₹{summary.bank_in.toLocaleString('en-IN')}</span>
                <span className="text-red-600 font-medium">Out: ₹{summary.bank_out.toLocaleString('en-IN')}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-amber-50 border-amber-200 shadow-sm" data-testid="total-balance-card">
            <CardContent className="p-4">
              <p className="text-xs text-amber-700 font-medium mb-1">Total Balance / कुल</p>
              <p className={`text-2xl font-bold ${summary.total_balance >= 0 ? 'text-amber-800' : 'text-red-600'}`}>
                ₹{summary.total_balance.toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-slate-600 mt-1">{summary.total_transactions} transactions</p>
            </CardContent>
          </Card>
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardContent className="p-4 flex flex-col justify-center items-center gap-2">
              <Button onClick={() => {
                setEditingId(null);
                setForm({ date: new Date().toISOString().split('T')[0], account: "cash", txn_type: "jama",
                  category: "", party_type: "", description: "", amount: "", reference: "",
                  kms_year: filters.kms_year || CURRENT_KMS_YEAR, season: filters.season || "Kharif" });
                setIsDialogOpen(true);
              }} className="bg-amber-500 hover:bg-amber-600 text-slate-900 w-full" size="sm" data-testid="cashbook-add-btn">
                <Plus className="w-4 h-4 mr-1" /> New Transaction
              </Button>
              <div className="flex gap-1 w-full">
                <Button onClick={() => exportData('excel')} variant="outline" size="sm" className="flex-1 border-green-300 text-green-700 hover:bg-green-50 text-xs" data-testid="cashbook-export-excel">
                  <Download className="w-3 h-3 mr-1" /> Excel
                </Button>
                <Button onClick={() => exportData('pdf')} variant="outline" size="sm" className="flex-1 border-red-300 text-red-600 hover:bg-red-50 text-xs" data-testid="cashbook-export-pdf">
                  <FileText className="w-3 h-3 mr-1" /> PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sub-tabs: Transactions vs Party Summary */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700">
          <Button onClick={() => setActiveView("transactions")} variant="ghost" size="sm"
            className={activeView === "transactions" ? "bg-amber-500 text-slate-900 hover:bg-amber-600" : "text-slate-300 hover:bg-slate-700"}
            data-testid="cashbook-tab-transactions">
            <Wallet className="w-4 h-4 mr-1" /> Transactions
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

      {activeView === "transactions" && (<>
      {/* Permanent Filter Section */}
      <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <Label className="text-xs text-slate-400">Account</Label>
              <Select value={txnFilters.account || "all"} onValueChange={(v) => setTxnFilters(p => ({ ...p, account: v === "all" ? "" : v }))}>
                <SelectTrigger className="w-32 bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="cashbook-filter-account"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="ledger">Ledger</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-400">Type</Label>
              <Select value={txnFilters.txn_type || "all"} onValueChange={(v) => setTxnFilters(p => ({ ...p, txn_type: v === "all" ? "" : v }))}>
                <SelectTrigger className="w-32 bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="cashbook-filter-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="jama">Jama (In)</SelectItem>
                  <SelectItem value="nikasi">Nikasi (Out)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-400">Party Type</Label>
              <Select value={txnFilters.party_type || "all"} onValueChange={(v) => setTxnFilters(p => ({ ...p, party_type: v === "all" ? "" : v, category: "" }))}>
                <SelectTrigger className="w-36 bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="cashbook-filter-party-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {[...new Set(allTxns.map(t => t.party_type).filter(Boolean))].sort().map(pt => (
                    <SelectItem key={pt} value={pt}>{pt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-400">Select Party / पार्टी</Label>
              <Select value={txnFilters.category || "all"} onValueChange={(v) => setTxnFilters(p => ({ ...p, category: v === "all" ? "" : v }))}>
                <SelectTrigger className="w-44 bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="cashbook-filter-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Parties</SelectItem>
                  {allCategoriesForFilter.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-400">From</Label>
              <Input type="date" value={txnFilters.date_from} onChange={(e) => setTxnFilters(p => ({ ...p, date_from: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-36" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">To</Label>
              <Input type="date" value={txnFilters.date_to} onChange={(e) => setTxnFilters(p => ({ ...p, date_to: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-36" />
            </div>
            <Button onClick={() => setTxnFilters({ account: "", txn_type: "", category: "", party_type: "", date_from: "", date_to: "" })} variant="ghost" size="sm" className="text-slate-400 h-8" data-testid="cashbook-filter-clear"><X className="w-3 h-3 mr-1" /> Clear</Button>
          </div>
        </CardContent></Card>

      {/* Transactions Table */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm text-amber-700 font-semibold">Transactions / लेन-देन</CardTitle>
            {user.role === 'admin' && selectedIds.length > 0 && (
              <Button onClick={handleBulkDelete} variant="destructive" size="sm" className="h-7 text-xs" data-testid="cashbook-bulk-delete">
                <Trash2 className="w-3 h-3 mr-1" /> Delete Selected ({selectedIds.length})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0"><div className="overflow-x-auto">
          <Table><TableHeader><TableRow className="border-slate-200 hover:bg-transparent">
            {user.role === 'admin' && (
              <TableHead className="w-8">
                <input type="checkbox" checked={txns.length > 0 && selectedIds.length === txns.length} onChange={toggleSelectAll}
                  className="rounded border-slate-300" data-testid="cashbook-select-all" />
              </TableHead>
            )}
            {['Date', 'Account', 'Type', 'Party / पार्टी', 'Party Type', 'Description', 'Jama (₹)', 'Nikasi (₹)', 'Balance (₹)', 'Reference', ''].map(h =>
              <TableHead key={h} className={`text-slate-600 text-xs ${['Jama (₹)', 'Nikasi (₹)', 'Balance (₹)'].includes(h) ? 'text-right' : ''}`}>{h}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={11} className="text-center text-slate-500 py-8">Loading...</TableCell></TableRow>
            : txns.length === 0 ? <TableRow><TableCell colSpan={11} className="text-center text-slate-500 py-8">Koi transaction nahi hai. "New Transaction" click karein.</TableCell></TableRow>
            : (() => {
              // Compute running balance (oldest to newest, then display newest first)
              const sorted = [...txns].reverse();
              let runBal = 0;
              const balMap = {};
              for (const t of sorted) {
                runBal += t.txn_type === 'jama' ? (t.amount || 0) : -(t.amount || 0);
                balMap[t.id] = Math.round(runBal * 100) / 100;
              }
              return txns.map(t => (
              <TableRow key={t.id} className={`border-slate-100 ${t.txn_type === 'jama' ? 'bg-green-50/50' : 'bg-red-50/50'} ${selectedIds.includes(t.id) ? 'ring-1 ring-amber-400' : ''}`} data-testid={`txn-row-${t.id}`}>
                {user.role === 'admin' && (
                  <TableCell className="w-8">
                    <input type="checkbox" checked={selectedIds.includes(t.id)} onChange={() => toggleSelect(t.id)}
                      className="rounded border-slate-300" data-testid={`txn-select-${t.id}`} />
                  </TableCell>
                )}                <TableCell className="text-slate-800 text-xs font-medium">{fmtDate(t.date)}</TableCell>
                <TableCell className="text-xs">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${t.account === 'cash' ? 'bg-green-100 text-green-700' : t.account === 'bank' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {t.account === 'cash' ? 'Cash' : t.account === 'bank' ? 'Bank' : 'Ledger'}
                  </span>
                </TableCell>
                <TableCell className="text-xs">
                  <span className={`flex items-center gap-1 font-medium ${t.txn_type === 'jama' ? 'text-green-700' : 'text-red-600'}`}>
                    {t.txn_type === 'jama' ? <ArrowDownCircle className="w-3 h-3" /> : <ArrowUpCircle className="w-3 h-3" />}
                    {t.txn_type === 'jama' ? 'Jama' : 'Nikasi'}
                  </span>
                </TableCell>
                <TableCell className="text-slate-700 text-xs font-semibold">{t.category}</TableCell>
                <TableCell className="text-xs">
                  {t.party_type && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    t.party_type === 'Truck' ? 'bg-blue-100 text-blue-700' :
                    t.party_type === 'Agent' ? 'bg-purple-100 text-purple-700' :
                    t.party_type === 'Local Party' ? 'bg-amber-100 text-amber-700' :
                    t.party_type === 'Diesel' ? 'bg-orange-100 text-orange-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>{t.party_type}</span>}
                </TableCell>
                <TableCell className="text-slate-600 text-xs max-w-[120px] truncate">{t.description}</TableCell>
                <TableCell className="text-right text-xs font-medium text-green-700">
                  {t.txn_type === 'jama' ? `₹${t.amount.toLocaleString('en-IN')}` : '-'}
                </TableCell>
                <TableCell className="text-right text-xs font-medium text-red-600">
                  {t.txn_type === 'nikasi' ? `₹${t.amount.toLocaleString('en-IN')}` : '-'}
                </TableCell>
                <TableCell className={`text-right text-xs font-bold ${(balMap[t.id] || 0) >= 0 ? 'text-amber-700' : 'text-red-700'}`} data-testid={`txn-balance-${t.id}`}>
                  ₹{(balMap[t.id] || 0).toLocaleString('en-IN')}
                </TableCell>
                <TableCell className="text-slate-500 text-xs max-w-[80px] truncate">{t.reference}</TableCell>
                <TableCell>
                  {user.role === 'admin' && (
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-500 hover:text-blue-700" onClick={() => handleEdit(t)} data-testid={`txn-edit-${t.id}`}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:text-red-700" onClick={() => handleDelete(t.id)} data-testid={`txn-delete-${t.id}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ));})()}
          </TableBody>
          {txns.length > 0 && (() => {
            const totalJama = txns.filter(t => t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0);
            const totalNikasi = txns.filter(t => t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0);
            const restBalance = totalJama - totalNikasi;
            return (
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  {user.role === 'admin' && <td></td>}
                  <td colSpan={4} className="px-4 py-2 text-xs font-bold text-slate-700">TOTAL ({txns.length} transactions)</td>
                  <td></td>
                  <td className="px-4 py-2 text-right text-xs font-bold text-green-700" data-testid="cashbook-total-jama">₹{totalJama.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2 text-right text-xs font-bold text-red-600" data-testid="cashbook-total-nikasi">₹{totalNikasi.toLocaleString('en-IN')}</td>
                  <td className={`px-4 py-2 text-right text-xs font-bold ${restBalance >= 0 ? 'text-amber-700' : 'text-red-700'}`} data-testid="cashbook-rest-balance">₹{restBalance.toLocaleString('en-IN')}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            );
          })()}
          </Table>
        </div></CardContent>
      </Card>

      </>)}

      {/* Party Summary View */}
      {activeView === "party-summary" && (
        <div className="space-y-4">
          {/* Party Summary Filter & Export */}
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
            <div className="flex gap-3 flex-wrap items-end">
              <div>
                <Label className="text-xs text-slate-400">Party Type</Label>
                <Select value={partySummaryFilter || "all"} onValueChange={(v) => setPartySummaryFilter(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-40 bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="party-summary-filter"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="Local Party">Local Party</SelectItem>
                    <SelectItem value="Truck">Truck</SelectItem>
                    <SelectItem value="Agent">Agent</SelectItem>
                    <SelectItem value="Diesel">Diesel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => { const u = `${API}/cash-book/party-summary/excel?kms_year=${filters.kms_year||''}&season=${filters.season||''}${partySummaryFilter?'&party_type='+partySummaryFilter:''}`; window.open(u); }}
                variant="outline" size="sm" className="border-green-600 text-green-400 hover:bg-green-900/30 h-8" data-testid="party-summary-export-excel">
                <Download className="w-3 h-3 mr-1" /> Excel
              </Button>
              <Button onClick={() => { const u = `${API}/cash-book/party-summary/pdf?kms_year=${filters.kms_year||''}&season=${filters.season||''}${partySummaryFilter?'&party_type='+partySummaryFilter:''}`; window.open(u); }}
                variant="outline" size="sm" className="border-red-600 text-red-400 hover:bg-red-900/30 h-8" data-testid="party-summary-export-pdf">
                <FileText className="w-3 h-3 mr-1" /> PDF
              </Button>
            </div>
          </CardContent></Card>

          {/* Summary Cards */}
          {partySummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="p-3 text-center">
                  <p className="text-[10px] text-slate-400 uppercase">Total Parties</p>
                  <p className="text-2xl font-bold text-white" data-testid="party-summary-total">{partySummary.summary.total_parties}</p>
                </CardContent>
              </Card>
              <Card className="bg-emerald-900/30 border-emerald-700/50">
                <CardContent className="p-3 text-center">
                  <p className="text-[10px] text-emerald-400 uppercase">Settled (Balance 0)</p>
                  <p className="text-2xl font-bold text-emerald-400" data-testid="party-summary-settled">{partySummary.summary.settled_count}</p>
                </CardContent>
              </Card>
              <Card className="bg-red-900/30 border-red-700/50">
                <CardContent className="p-3 text-center">
                  <p className="text-[10px] text-red-400 uppercase">Pending</p>
                  <p className="text-2xl font-bold text-red-400" data-testid="party-summary-pending">{partySummary.summary.pending_count}</p>
                </CardContent>
              </Card>
              <Card className="bg-amber-900/30 border-amber-700/50">
                <CardContent className="p-3 text-center">
                  <p className="text-[10px] text-amber-400 uppercase">Outstanding</p>
                  <p className="text-2xl font-bold text-amber-400" data-testid="party-summary-outstanding">₹{Math.abs(partySummary.summary.total_outstanding).toLocaleString('en-IN')}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Party Table */}
          {partySummary && partySummary.parties.length > 0 ? (
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-700">
                        {['#', 'Party Name', 'Party Type', 'Jama / Purchase (₹)', 'Nikasi / Payment (₹)', 'Balance (₹)', 'Txns', 'Status'].map(h => (
                          <TableHead key={h} className="text-slate-300 text-xs font-semibold">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partySummary.parties.map((p, idx) => (
                        <TableRow key={p.party_name} className={`border-slate-700 cursor-pointer hover:bg-slate-700/50 ${p.balance === 0 ? 'bg-emerald-900/10' : p.balance < 0 ? 'bg-red-900/10' : ''}`}
                          onClick={() => { setActiveView("transactions"); setTxnFilters(prev => ({ ...prev, category: p.party_name, party_type: p.party_type || "" })); }}
                          data-testid={`party-row-${idx}`}>
                          <TableCell className="text-slate-400 text-xs">{idx + 1}</TableCell>
                          <TableCell className="text-white font-semibold text-sm">{p.party_name}</TableCell>
                          <TableCell>
                            {p.party_type && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              p.party_type === 'Truck' ? 'bg-blue-900/50 text-blue-400' :
                              p.party_type === 'Agent' ? 'bg-purple-900/50 text-purple-400' :
                              p.party_type === 'Local Party' ? 'bg-amber-900/50 text-amber-400' :
                              p.party_type === 'Diesel' ? 'bg-orange-900/50 text-orange-400' :
                              'bg-slate-700 text-slate-300'
                            }`}>{p.party_type}</span>}
                          </TableCell>
                          <TableCell className="text-right text-emerald-400 font-semibold">₹{p.total_jama.toLocaleString('en-IN')}</TableCell>
                          <TableCell className="text-right text-red-400 font-semibold">₹{p.total_nikasi.toLocaleString('en-IN')}</TableCell>
                          <TableCell className={`text-right font-bold ${p.balance === 0 ? 'text-emerald-400' : p.balance > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                            ₹{Math.abs(p.balance).toLocaleString('en-IN')} {p.balance > 0 ? '(Dr)' : p.balance < 0 ? '(Cr)' : ''}
                          </TableCell>
                          <TableCell className="text-center text-slate-400 text-xs">{p.txn_count}</TableCell>
                          <TableCell>
                            {p.balance === 0 ? (
                              <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium"><CheckCircle className="w-3 h-3" /> Settled</span>
                            ) : (
                              <span className="flex items-center gap-1 text-red-400 text-xs font-medium"><AlertCircle className="w-3 h-3" /> Pending</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Total Row */}
                      <TableRow className="border-slate-600 bg-slate-700/50">
                        <TableCell colSpan={3} className="text-amber-400 font-bold">TOTAL ({partySummary.parties.length} parties)</TableCell>
                        <TableCell className="text-right text-emerald-400 font-bold">₹{partySummary.summary.total_jama.toLocaleString('en-IN')}</TableCell>
                        <TableCell className="text-right text-red-400 font-bold">₹{partySummary.summary.total_nikasi.toLocaleString('en-IN')}</TableCell>
                        <TableCell className="text-right text-amber-400 font-bold">₹{Math.abs(partySummary.summary.total_outstanding).toLocaleString('en-IN')}</TableCell>
                        <TableCell></TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : partySummary ? (
            <Card className="bg-slate-800 border-slate-700"><CardContent className="p-8 text-center text-slate-400">Koi party data nahi mila</CardContent></Card>
          ) : null}
        </div>
      )}

      {/* Add Transaction Dialog - rendered outside activeView conditional so it works from any tab */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingId(null); }}>
        <DialogContent className="bg-white border-slate-200 text-slate-800 max-w-md" data-testid="cashbook-form-dialog">
          <DialogHeader><DialogTitle className="text-amber-700">{editingId ? 'Edit Transaction' : 'New Transaction'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-600">Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm(p => ({ ...p, date: e.target.value }))}
                  className="border-slate-300 h-8 text-sm" required data-testid="cashbook-form-date" />
              </div>
              <div>
                <Label className="text-xs text-slate-600">Account</Label>
                <Select value={form.account} onValueChange={(v) => setForm(p => ({ ...p, account: v, category: "" }))}>
                  <SelectTrigger className="border-slate-300 h-8 text-sm" data-testid="cashbook-form-account"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash (नकद)</SelectItem>
                    <SelectItem value="bank">Bank (बैंक)</SelectItem>
                  </SelectContent>
                </Select>
                {summary && (
                  <p className="text-[10px] mt-1 font-medium" data-testid="cashbook-form-balance">
                    Balance: <span className={`${(form.account === 'cash' ? summary.cash_balance : summary.bank_balance) >= 0 ? 'text-emerald-600' : 'text-red-600'} font-bold`}>
                      ₹{(form.account === 'cash' ? summary.cash_balance : summary.bank_balance)?.toLocaleString('en-IN')}
                    </span>
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-600">Type</Label>
                <Select value={form.txn_type} onValueChange={(v) => setForm(p => ({ ...p, txn_type: v, category: "" }))}>
                  <SelectTrigger className="border-slate-300 h-8 text-sm" data-testid="cashbook-form-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jama">Jama (जमा / In)</SelectItem>
                    <SelectItem value="nikasi">Nikasi (निकासी / Out)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-600">Amount (₹)</Label>
                <Input type="number" step="0.01" value={form.amount}
                  onChange={(e) => setForm(p => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00" className="border-slate-300 h-8 text-sm" required data-testid="cashbook-form-amount" />
                {summary && form.amount && parseFloat(form.amount) > 0 && (
                  <p className="text-[10px] mt-1 font-medium" data-testid="cashbook-form-new-balance">
                    After: <span className={`font-bold ${
                      ((form.account === 'cash' ? summary.cash_balance : summary.bank_balance) + (form.txn_type === 'jama' ? 1 : -1) * parseFloat(form.amount)) >= 0
                        ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      ₹{((form.account === 'cash' ? summary.cash_balance : summary.bank_balance) + (form.txn_type === 'jama' ? 1 : -1) * parseFloat(form.amount)).toLocaleString('en-IN')}
                    </span>
                    <span className={`ml-1 ${form.txn_type === 'jama' ? 'text-emerald-600' : 'text-red-600'}`}>
                      ({form.txn_type === 'jama' ? '+' : '-'}₹{parseFloat(form.amount).toLocaleString('en-IN')})
                    </span>
                  </p>
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs text-slate-600 font-semibold">Party / Category (Ledger ke liye zaroori)</Label>
              </div>
              <Input
                list="category-list"
                value={form.category}
                onChange={(e) => setForm(p => ({ ...p, category: e.target.value }))}
                placeholder="Party name likho ya select karo (e.g. Titu, Dimpy)"
                className="border-slate-300 h-8 text-sm"
                data-testid="cashbook-form-category"
              />
              <datalist id="category-list">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
              {partyBalance && (
                <div className="mt-1 p-1.5 bg-amber-50 border border-amber-200 rounded text-[10px]" data-testid="cashbook-party-balance">
                  <span className="font-semibold text-amber-800">{form.category}:</span>
                  <span className="text-green-700 ml-2">In: ₹{partyBalance.totalIn.toLocaleString('en-IN')}</span>
                  <span className="text-red-600 ml-2">Out: ₹{partyBalance.totalOut.toLocaleString('en-IN')}</span>
                  <span className={`ml-2 font-bold ${partyBalance.balance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    Balance: ₹{partyBalance.balance.toLocaleString('en-IN')}
                  </span>
                  <span className="text-slate-500 ml-1">({partyBalance.count} txns)</span>
                </div>
              )}
              <p className="text-[9px] text-amber-600 mt-0.5">* Yahan jo name doge wo Party Ledger mein automatically aayega</p>
            </div>
            <div>
              <Label className="text-xs text-slate-600">Party Type</Label>
              <select value={form.party_type || ""} onChange={(e) => setForm(p => ({ ...p, party_type: e.target.value }))}
                className="w-full border border-slate-300 h-8 text-sm rounded-md px-2 outline-none" data-testid="cashbook-form-party-type">
                <option value="">-- Select --</option>
                <option value="Truck">Truck</option>
                <option value="Agent">Agent</option>
                <option value="Local Party">Local Party</option>
                <option value="Diesel">Diesel</option>
                <option value="Manual">Manual</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-slate-600">Description / विवरण</Label>
              <Input value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Details likhein..." className="border-slate-300 h-8 text-sm" data-testid="cashbook-form-desc" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Reference (Cheque No / Receipt etc.)</Label>
              <Input value={form.reference} onChange={(e) => setForm(p => ({ ...p, reference: e.target.value }))}
                placeholder="Optional" className="border-slate-300 h-8 text-sm" data-testid="cashbook-form-ref" />
            </div>
            {parseFloat(form.amount) > 0 && (
              <div className={`p-2 rounded text-sm font-medium ${form.txn_type === 'jama' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                {form.account === 'cash' ? 'Cash' : 'Bank'} {form.txn_type === 'jama' ? 'Jama' : 'Nikasi'}: ₹{parseFloat(form.amount).toLocaleString('en-IN')}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white flex-1" data-testid="cashbook-form-submit">
                {editingId ? 'Update Transaction' : 'Save Transaction'}
              </Button>
              <Button type="button" variant="outline" className="border-slate-300 text-slate-600" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CashBook;
