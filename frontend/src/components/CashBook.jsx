import { useState, useEffect, useCallback } from "react";
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
import { Trash2, Plus, RefreshCw, Filter, X, Download, FileText, ArrowDownCircle, ArrowUpCircle, Wallet, Landmark, PlusCircle } from "lucide-react";

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
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [customCategories, setCustomCategories] = useState([]);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0], account: "cash", txn_type: "jama",
    category: "", description: "", amount: "", reference: "",
    kms_year: CURRENT_KMS_YEAR, season: "Kharif",
  });
  const [txnFilters, setTxnFilters] = useState({ account: "", date_from: "", date_to: "" });
  const [showFilters, setShowFilters] = useState(false);

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
      if (txnFilters.date_from) params.append('date_from', txnFilters.date_from);
      if (txnFilters.date_to) params.append('date_to', txnFilters.date_to);
      const [txnRes, sumRes] = await Promise.all([
        axios.get(`${API}/cash-book?${params}`),
        axios.get(`${API}/cash-book/summary?${params}`)
      ]);
      setTxns(txnRes.data);
      setSummary(sumRes.data);
    } catch (e) { toast.error("Cash book load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season, txnFilters]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { toast.error("Amount 0 se zyada hona chahiye"); return; }
    try {
      await axios.post(`${API}/cash-book?username=${user.username}&role=${user.role}`, {
        ...form, amount: amt,
      });
      toast.success("Transaction save ho gayi!");
      setIsDialogOpen(false);
      setForm({ date: new Date().toISOString().split('T')[0], account: "cash", txn_type: "jama",
        category: "", description: "", amount: "", reference: "",
        kms_year: filters.kms_year || CURRENT_KMS_YEAR, season: filters.season || "Kharif" });
      fetchData();
    } catch (error) { toast.error("Error: " + (error.response?.data?.detail || error.message)); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Kya aap ye transaction delete karna chahte hain?")) return;
    try {
      await axios.delete(`${API}/cash-book/${id}`);
      toast.success("Deleted!"); fetchData();
    } catch (e) { toast.error("Delete nahi hua"); }
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
  const categories = [...defaultCats, ...customCats.map(c => c.name)].filter((v, i, a) => a.indexOf(v) === i);

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-gradient-to-br from-green-900/40 to-slate-800 border-green-800/30" data-testid="cash-balance-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-4 h-4 text-green-400" />
                <p className="text-xs text-green-400 font-medium">Cash in Hand / नकद</p>
              </div>
              <p className={`text-2xl font-bold ${summary.cash_balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ₹{summary.cash_balance.toLocaleString('en-IN')}
              </p>
              <div className="flex gap-3 mt-1 text-[10px]">
                <span className="text-green-500">In: ₹{summary.cash_in.toLocaleString('en-IN')}</span>
                <span className="text-red-400">Out: ₹{summary.cash_out.toLocaleString('en-IN')}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-900/40 to-slate-800 border-blue-800/30" data-testid="bank-balance-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Landmark className="w-4 h-4 text-blue-400" />
                <p className="text-xs text-blue-400 font-medium">Bank Balance / बैंक</p>
              </div>
              <p className={`text-2xl font-bold ${summary.bank_balance >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                ₹{summary.bank_balance.toLocaleString('en-IN')}
              </p>
              <div className="flex gap-3 mt-1 text-[10px]">
                <span className="text-green-500">In: ₹{summary.bank_in.toLocaleString('en-IN')}</span>
                <span className="text-red-400">Out: ₹{summary.bank_out.toLocaleString('en-IN')}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-900/30 to-slate-800 border-amber-800/30" data-testid="total-balance-card">
            <CardContent className="p-4">
              <p className="text-xs text-amber-400 font-medium mb-1">Total Balance / कुल</p>
              <p className={`text-2xl font-bold ${summary.total_balance >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                ₹{summary.total_balance.toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">{summary.total_transactions} transactions</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-4 flex flex-col justify-center items-center gap-2">
              <Button onClick={() => {
                setForm({ date: new Date().toISOString().split('T')[0], account: "cash", txn_type: "jama",
                  category: "", description: "", amount: "", reference: "",
                  kms_year: filters.kms_year || CURRENT_KMS_YEAR, season: filters.season || "Kharif" });
                setIsDialogOpen(true);
              }} className="bg-amber-500 hover:bg-amber-600 text-slate-900 w-full" size="sm" data-testid="cashbook-add-btn">
                <Plus className="w-4 h-4 mr-1" /> New Transaction
              </Button>
              <div className="flex gap-1 w-full">
                <Button onClick={() => exportData('excel')} variant="outline" size="sm" className="flex-1 border-slate-600 text-green-400 hover:bg-slate-700 text-xs" data-testid="cashbook-export-excel">
                  <Download className="w-3 h-3 mr-1" /> Excel
                </Button>
                <Button onClick={() => exportData('pdf')} variant="outline" size="sm" className="flex-1 border-slate-600 text-red-400 hover:bg-slate-700 text-xs" data-testid="cashbook-export-pdf">
                  <FileText className="w-3 h-3 mr-1" /> PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
        <Button onClick={() => setShowFilters(!showFilters)} variant="outline" size="sm"
          className={showFilters ? "border-amber-500 text-amber-400" : "border-slate-600 text-slate-300 hover:bg-slate-700"}>
          <Filter className="w-4 h-4 mr-1" /> Filter
        </Button>
      </div>

      {showFilters && (
        <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <Label className="text-xs text-slate-400">Account</Label>
              <Select value={txnFilters.account || "all"} onValueChange={(v) => setTxnFilters(p => ({ ...p, account: v === "all" ? "" : v }))}>
                <SelectTrigger className="w-32 bg-slate-700 border-slate-600 text-white h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
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
            <Button onClick={() => setTxnFilters({ account: "", date_from: "", date_to: "" })} variant="ghost" size="sm" className="text-slate-400 h-8"><X className="w-3 h-3 mr-1" /> Clear</Button>
          </div>
        </CardContent></Card>
      )}

      {/* Transactions Table */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm text-amber-400">Transactions / लेन-देन</CardTitle>
        </CardHeader>
        <CardContent className="p-0"><div className="overflow-x-auto">
          <Table><TableHeader><TableRow className="border-slate-700 hover:bg-transparent">
            {['Date', 'Account', 'Type', 'Category', 'Description', 'Jama (₹)', 'Nikasi (₹)', 'Reference', ''].map(h =>
              <TableHead key={h} className={`text-slate-300 text-xs ${['Jama (₹)', 'Nikasi (₹)'].includes(h) ? 'text-right' : ''}`}>{h}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
            : txns.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8">Koi transaction nahi hai. "New Transaction" click karein.</TableCell></TableRow>
            : txns.map(t => (
              <TableRow key={t.id} className={`border-slate-700 ${t.txn_type === 'jama' ? 'bg-green-900/5' : 'bg-red-900/5'}`} data-testid={`txn-row-${t.id}`}>
                <TableCell className="text-white text-xs">{t.date}</TableCell>
                <TableCell className="text-xs">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${t.account === 'cash' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                    {t.account === 'cash' ? 'Cash' : 'Bank'}
                  </span>
                </TableCell>
                <TableCell className="text-xs">
                  <span className={`flex items-center gap-1 ${t.txn_type === 'jama' ? 'text-green-400' : 'text-red-400'}`}>
                    {t.txn_type === 'jama' ? <ArrowDownCircle className="w-3 h-3" /> : <ArrowUpCircle className="w-3 h-3" />}
                    {t.txn_type === 'jama' ? 'Jama' : 'Nikasi'}
                  </span>
                </TableCell>
                <TableCell className="text-slate-300 text-xs">{t.category}</TableCell>
                <TableCell className="text-slate-400 text-xs max-w-[120px] truncate">{t.description}</TableCell>
                <TableCell className="text-right text-xs font-medium text-green-400">
                  {t.txn_type === 'jama' ? `₹${t.amount.toLocaleString('en-IN')}` : '-'}
                </TableCell>
                <TableCell className="text-right text-xs font-medium text-red-400">
                  {t.txn_type === 'nikasi' ? `₹${t.amount.toLocaleString('en-IN')}` : '-'}
                </TableCell>
                <TableCell className="text-slate-400 text-xs max-w-[80px] truncate">{t.reference}</TableCell>
                <TableCell>
                  {user.role === 'admin' && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => handleDelete(t.id)} data-testid={`txn-delete-${t.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </div></CardContent>
      </Card>

      {/* Add Transaction Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md" data-testid="cashbook-form-dialog">
          <DialogHeader><DialogTitle className="text-amber-400">New Transaction / नया लेन-देन</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm(p => ({ ...p, date: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="cashbook-form-date" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Account</Label>
                <Select value={form.account} onValueChange={(v) => setForm(p => ({ ...p, account: v, category: "" }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="cashbook-form-account"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash (नकद)</SelectItem>
                    <SelectItem value="bank">Bank (बैंक)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Type</Label>
                <Select value={form.txn_type} onValueChange={(v) => setForm(p => ({ ...p, txn_type: v, category: "" }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="cashbook-form-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jama">Jama (जमा / In)</SelectItem>
                    <SelectItem value="nikasi">Nikasi (निकासी / Out)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-400">Amount (₹)</Label>
                <Input type="number" step="0.01" value={form.amount}
                  onChange={(e) => setForm(p => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="cashbook-form-amount" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs text-slate-400">Category</Label>
                <Button type="button" variant="ghost" size="sm" className="h-5 px-1 text-amber-400 hover:text-amber-300 text-[10px]"
                  onClick={() => setShowAddCategory(!showAddCategory)} data-testid="cashbook-add-category-btn">
                  <PlusCircle className="w-3 h-3 mr-0.5" /> New Category
                </Button>
              </div>
              {showAddCategory && (
                <div className="flex gap-1 mb-2">
                  <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Category name likhein..." className="bg-slate-700 border-slate-600 text-white h-7 text-xs flex-1"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
                    data-testid="cashbook-new-category-input" />
                  <Button type="button" onClick={handleAddCategory} size="sm" className="bg-amber-500 hover:bg-amber-600 text-slate-900 h-7 text-xs px-2"
                    data-testid="cashbook-save-category-btn">Save</Button>
                  <Button type="button" onClick={() => { setShowAddCategory(false); setNewCategoryName(""); }} variant="ghost" size="sm" className="h-7 text-xs px-1 text-slate-400">
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
              <Select value={form.category || "_none"} onValueChange={(v) => setForm(p => ({ ...p, category: v === "_none" ? "" : v }))}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="cashbook-form-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">-- Select --</SelectItem>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              {customCats.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {customCats.map(c => (
                    <span key={c.id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] bg-slate-700 text-slate-300 border border-slate-600">
                      {c.name}
                      {user.role === 'admin' && (
                        <button type="button" onClick={() => handleDeleteCategory(c.id, c.name)} className="text-red-400 hover:text-red-300 ml-0.5">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs text-slate-400">Description / विवरण</Label>
              <Input value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Details likhein..." className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="cashbook-form-desc" />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Reference (Cheque No / Receipt etc.)</Label>
              <Input value={form.reference} onChange={(e) => setForm(p => ({ ...p, reference: e.target.value }))}
                placeholder="Optional" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="cashbook-form-ref" />
            </div>
            {parseFloat(form.amount) > 0 && (
              <div className={`p-2 rounded text-sm font-medium ${form.txn_type === 'jama' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                {form.account === 'cash' ? 'Cash' : 'Bank'} {form.txn_type === 'jama' ? 'Jama' : 'Nikasi'}: ₹{parseFloat(form.amount).toLocaleString('en-IN')}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-slate-900 flex-1" data-testid="cashbook-form-submit">Save Transaction</Button>
              <Button type="button" variant="outline" className="border-slate-600 text-slate-300" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CashBook;
