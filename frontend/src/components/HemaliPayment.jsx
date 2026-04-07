import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit, Users, IndianRupee, RefreshCw, Undo2, Download, FileText, Settings, Calculator, CheckCircle, Printer } from "lucide-react";
import { fmtDate } from "@/utils/date";
import RoundOffInput from "@/components/common/RoundOffInput";
import { useConfirm } from "./ConfirmProvider";
const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const API = (_isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '')) + '/api';

// ===== ITEMS CONFIG =====
const ItemsConfig = ({ items, fetchItems }) => {
  const showConfirm = useConfirm();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", rate: "", unit: "bag" });

  const save = async () => {
    if (!form.name || !form.rate) return toast.error("Name aur rate bharein");
    try {
      if (editId) {
        await axios.put(`${API}/hemali/items/${editId}`, form);
        toast.success("Item updated");
      } else {
        await axios.post(`${API}/hemali/items`, form);
        toast.success("Item added");
      }
      setShowAdd(false); setEditId(null);
      setForm({ name: "", rate: "", unit: "bag" });
      fetchItems();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const remove = async (id) => {
    if (!await showConfirm("Deactivate", "Item deactivate karein?")) return;
    try {
      await axios.delete(`${API}/hemali/items/${id}`);
      toast.success("Item deactivated"); fetchItems();
    } catch { toast.error("Error"); }
  };

  return (
    <Card className="bg-slate-800 border-slate-700" data-testid="hemali-items-config">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <CardTitle className="text-amber-400 text-sm flex items-center gap-2">
            <Settings className="w-4 h-4" /> Hemali Items (Rate Config)
          </CardTitle>
          <Button onClick={() => { setForm({ name: "", rate: "", unit: "bag" }); setEditId(null); setShowAdd(true); }}
            size="sm" className="bg-amber-500 hover:bg-amber-600 text-slate-900 h-7 text-xs" data-testid="add-hemali-item-btn">
            <Plus className="w-3 h-3 mr-1" /> Add Item
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">Koi item nahi hai. Pehle items add karein.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700 text-slate-400 text-xs">
                <th className="text-left py-2 px-3">Item Name</th>
                <th className="text-right py-2 px-3">Rate (Rs.)</th>
                <th className="text-left py-2 px-3">Unit</th>
                <th className="text-center py-2 px-3">Actions</th>
              </tr></thead>
              <tbody>{items.map(item => (
                <tr key={item.id} className="border-b border-slate-700/50 hover:bg-slate-800/50">
                  <td className="py-2 px-3 text-white font-medium">{item.name}</td>
                  <td className="py-2 px-3 text-right text-amber-400 font-semibold">Rs.{item.rate}/{item.unit}</td>
                  <td className="py-2 px-3 text-slate-300">{item.unit}</td>
                  <td className="py-2 px-3 text-center">
                    <Button onClick={() => { setForm({ name: item.name, rate: item.rate, unit: item.unit }); setEditId(item.id); setShowAdd(true); }}
                      variant="ghost" size="sm" className="text-blue-400 h-7 px-2"><Edit className="w-3 h-3" /></Button>
                    <Button onClick={() => remove(item.id)} variant="ghost" size="sm" className="text-red-400 h-7 px-2"><Trash2 className="w-3 h-3" /></Button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </CardContent>
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md" data-testid="hemali-item-dialog">
          <DialogHeader><DialogTitle className="text-amber-400">{editId ? 'Edit' : 'Add'} Hemali Item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs text-slate-400">Item Name / काम का नाम</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Paddy Bag Unload" className="bg-slate-700 border-slate-600 text-white" data-testid="hemali-item-name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Rate (Rs.) / दर</Label>
                <Input type="number" step="0.5" value={form.rate} onChange={e => setForm(p => ({ ...p, rate: e.target.value }))}
                  placeholder="3" className="bg-slate-700 border-slate-600 text-white" data-testid="hemali-item-rate" /></div>
              <div><Label className="text-xs text-slate-400">Unit / इकाई</Label>
                <Input value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}
                  placeholder="bag" className="bg-slate-700 border-slate-600 text-white" data-testid="hemali-item-unit" /></div>
            </div>
            <Button onClick={save} className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold" data-testid="hemali-item-save">{editId ? 'Update' : 'Add'} Item</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

// ===== MONTHLY SUMMARY =====
const MonthlySummary = ({ filters }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterSardar, setFilterSardar] = useState("");
  const [filterMonth, setFilterMonth] = useState("");

  // Generate month options for last 12 months
  const monthOptions = (() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push(d.toISOString().slice(0, 7));
    }
    return opts;
  })();

  // Format YYYY-MM to MM-YYYY
  const fmtMonth = (m) => {
    if (!m || m.length < 7) return m;
    return `${m.slice(5, 7)}-${m.slice(0, 4)}`;
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      
      if (filterSardar) params.append("sardar_name", filterSardar);
      if (filterMonth) params.append("month", filterMonth);
      const res = await axios.get(`${API}/hemali/monthly-summary?${params}`);
      setData(res.data || []);
    } catch { toast.error("Monthly summary load error"); }
    setLoading(false);
  }, [filters.kms_year, filterSardar, filterMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleExport = async (format) => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append("kms_year", filters.kms_year);
    
    if (filterSardar) params.append("sardar_name", filterSardar);
    if (filterMonth) params.append("month", filterMonth);
    const { downloadFile } = await import("@/utils/download");
    downloadFile(`/api/hemali/monthly-summary/${format}?${params}`, `hemali_monthly.${format === "pdf" ? "pdf" : "xlsx"}`);
    toast.success(`${format.toUpperCase()} download ho raha hai!`);
  };

  return (
    <div className="space-y-4" data-testid="hemali-monthly-summary">
      <div className="flex flex-wrap gap-2 items-center">
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
        <Button onClick={() => handleExport("pdf")} variant="outline" size="sm" className="border-red-600 text-red-400 hover:bg-red-900/30" data-testid="monthly-export-pdf">
          <FileText className="w-4 h-4 mr-1" /> PDF
        </Button>
        <Button onClick={() => handleExport("excel")} variant="outline" size="sm" className="border-green-600 text-green-400 hover:bg-green-900/30" data-testid="monthly-export-excel">
          <Download className="w-4 h-4 mr-1" /> Excel
        </Button>
        <div className="flex items-center gap-2 ml-auto">
          <Select value={filterMonth || "all"} onValueChange={v => setFilterMonth(v === "all" ? "" : v)}>
            <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-[140px]" data-testid="monthly-filter-month">
              <SelectValue placeholder="All Months" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-600">
              <SelectItem value="all" className="text-white">All Months</SelectItem>
              {monthOptions.map(m => <SelectItem key={m} value={m} className="text-white">{fmtMonth(m)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input value={filterSardar} onChange={e => setFilterSardar(e.target.value)}
            placeholder="Sardar name filter..." className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-[180px]" data-testid="monthly-filter-sardar" />
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400 text-center py-8">Loading...</p>
      ) : data.length === 0 ? (
        <p className="text-slate-500 text-center py-8">Koi data nahi mila.</p>
      ) : (
        <div className="space-y-6">
          {data.map((sardar, si) => (
            <Card key={sardar.sardar_name} className="bg-slate-800 border-slate-700" data-testid={`monthly-sardar-${si}`}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-amber-400 text-sm flex items-center gap-2">
                    <Users className="w-4 h-4" /> {sardar.sardar_name}
                  </CardTitle>
                  <div className="flex gap-4 text-xs">
                    <span className="text-slate-400">Total Work: <span className="text-amber-400 font-semibold">Rs.{sardar.grand_total_work.toLocaleString("en-IN")}</span></span>
                    <span className="text-slate-400">Total Paid: <span className="text-red-400 font-semibold">Rs.{sardar.grand_total_paid.toLocaleString("en-IN")}</span></span>
                    <span className={`font-semibold ${sardar.current_advance_balance > 0 ? "text-yellow-400" : "text-green-400"}`}>
                      Advance Balance: Rs.{sardar.current_advance_balance.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-700 text-slate-400 text-xs">
                      <th className="text-left py-2 px-3">Month</th>
                      <th className="text-center py-2 px-3">Payments (Paid/Total)</th>
                      <th className="text-right py-2 px-3">Total Work</th>
                      <th className="text-right py-2 px-3">Total Paid</th>
                      <th className="text-right py-2 px-3">Advance Given</th>
                      <th className="text-right py-2 px-3">Advance Deducted</th>
                      <th className="text-left py-2 px-3">Items Breakdown</th>
                    </tr></thead>
                    <tbody>
                      {sardar.months.map((m, mi) => (
                        <tr key={m.month} className="border-b border-slate-700/50 hover:bg-slate-800/50">
                          <td className="py-2 px-3 text-white font-medium">{fmtMonth(m.month)}</td>
                          <td className="py-2 px-3 text-center text-slate-300">{m.paid_payments}/{m.total_payments}</td>
                          <td className="py-2 px-3 text-right text-amber-400">Rs.{m.total_work.toLocaleString("en-IN")}</td>
                          <td className="py-2 px-3 text-right text-red-400">Rs.{m.total_paid.toLocaleString("en-IN")}</td>
                          <td className="py-2 px-3 text-right text-yellow-400">{m.advance_given > 0 ? `Rs.${m.advance_given.toLocaleString("en-IN")}` : "-"}</td>
                          <td className="py-2 px-3 text-right text-orange-400">{m.advance_deducted > 0 ? `Rs.${m.advance_deducted.toLocaleString("en-IN")}` : "-"}</td>
                          <td className="py-2 px-3 text-xs text-slate-400 max-w-[200px]">
                            {Object.entries(m.items_breakdown || {}).map(([name, v]) => `${name}: ${v.quantity}`).join(", ")}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-slate-900/50 font-semibold">
                        <td className="py-2 px-3 text-white">TOTAL</td>
                        <td className="py-2 px-3"></td>
                        <td className="py-2 px-3 text-right text-amber-400">Rs.{sardar.grand_total_work.toLocaleString("en-IN")}</td>
                        <td className="py-2 px-3 text-right text-red-400">Rs.{sardar.grand_total_paid.toLocaleString("en-IN")}</td>
                        <td className="py-2 px-3 text-right text-yellow-400">Rs.{sardar.grand_total_advance_given.toLocaleString("en-IN")}</td>
                        <td className="py-2 px-3 text-right text-orange-400">Rs.{sardar.grand_total_advance_deducted.toLocaleString("en-IN")}</td>
                        <td className="py-2 px-3"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// ===== MAIN HEMALI PAYMENT =====
export default function HemaliPayment({ filters, user }) {
  const showConfirm = useConfirm();
  const [subTab, setSubTab] = useState("payments");
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [sardars, setSardars] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState(null);

  // Mark Paid dialog
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [markPaidPayment, setMarkPaidPayment] = useState(null);
  const [markPaidAmount, setMarkPaidAmount] = useState("");
  const [markPaidRoundOff, setMarkPaidRoundOff] = useState("");

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterSardar, setFilterSardar] = useState("");

  // Form
  const [form, setForm] = useState({ sardar_name: "", date: new Date().toISOString().split("T")[0], items: [], amount_paid: "" });
  const [advanceInfo, setAdvanceInfo] = useState({ advance: 0, sardar_name: "" });

  const fetchItems = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/hemali/items`);
      setItems(res.data || []);
    } catch { /* ignore */ }
  }, []);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      
      if (dateFrom) params.append("from_date", dateFrom);
      if (dateTo) params.append("to_date", dateTo);
      if (filterSardar) params.append("sardar_name", filterSardar);
      const res = await axios.get(`${API}/hemali/payments?${params}`);
      setPayments(res.data || []);
    } catch { toast.error("Payments load error"); }
    setLoading(false);
  }, [filters.kms_year, dateFrom, dateTo, filterSardar]);

  const fetchSardars = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/hemali/sardars`);
      setSardars(res.data || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchItems(); fetchSardars(); }, [fetchItems, fetchSardars]);
  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  // Fetch advance when sardar_name changes (auto)
  const fetchAdvance = useCallback(async (name) => {
    if (!name || name.trim().length < 2) { setAdvanceInfo({ advance: 0, sardar_name: "" }); return; }
    try {
      const res = await axios.get(`${API}/hemali/advance?sardar_name=${encodeURIComponent(name.trim())}&kms_year=${filters.kms_year || ""}`);
      setAdvanceInfo(res.data);
    } catch { setAdvanceInfo({ advance: 0, sardar_name: name }); }
  }, [filters.kms_year]);

  // Auto-fetch advance when sardar name changes in form
  useEffect(() => {
    if (showCreate && form.sardar_name.trim().length >= 2) {
      const t = setTimeout(() => fetchAdvance(form.sardar_name), 400);
      return () => clearTimeout(t);
    }
  }, [form.sardar_name, showCreate, fetchAdvance]);

  const openCreate = () => {
    setEditId(null);
    setForm({
      sardar_name: "",
      date: new Date().toISOString().split("T")[0],
      items: items.map(i => ({ item_name: i.name, rate: i.rate, quantity: "" })),
      amount_paid: "",
    });
    setAdvanceInfo({ advance: 0, sardar_name: "" });
    setShowCreate(true);
  };

  const openEdit = (p) => {
    setEditId(p.id);
    // Map existing items + any new items from config
    const existingNames = new Set((p.items || []).map(i => i.item_name));
    const formItems = (p.items || []).map(i => ({ item_name: i.item_name, rate: i.rate, quantity: String(i.quantity) }));
    for (const ci of items) {
      if (!existingNames.has(ci.name)) {
        formItems.push({ item_name: ci.name, rate: ci.rate, quantity: "" });
      }
    }
    setForm({
      sardar_name: p.sardar_name,
      date: p.date,
      items: formItems,
      amount_paid: String(p.amount_paid || ""),
    });
    setAdvanceInfo({ advance: p.advance_before || 0, sardar_name: p.sardar_name });
    setShowCreate(true);
  };

  // Calculate totals from form items
  const calcTotal = form.items.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.rate) || 0), 0);
  const advDeducted = Math.min(advanceInfo.advance, calcTotal);
  const amountPayable = Math.max(0, calcTotal - advDeducted);

  const handleCreate = async () => {
    if (!form.sardar_name.trim()) return toast.error("Sardar name bharein");
    const usedItems = form.items.filter(i => parseFloat(i.quantity) > 0);
    if (!usedItems.length) return toast.error("Kam se kam ek item ki quantity bharein");
    try {
      const payload = {
        sardar_name: form.sardar_name.trim(),
        date: form.date,
        items: usedItems,
        amount_paid: parseFloat(form.amount_paid) || amountPayable,
        kms_year: filters.kms_year || "",
        season: filters.season || "",
        created_by: user?.username || "",
      };
      if (editId) {
        await axios.put(`${API}/hemali/payments/${editId}`, payload);
        toast.success("Hemali payment updated!");
      } else {
        await axios.post(`${API}/hemali/payments`, payload);
        toast.success("Hemali payment created!");
      }
      setShowCreate(false);
      setEditId(null);
      fetchPayments();
      fetchSardars();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const handleUndo = async (id) => {
    if (!await showConfirm("Undo Payment", "Payment undo karein? Cash book se bhi hat jaayega.")) return;
    try {
      await axios.put(`${API}/hemali/payments/${id}/undo`);
      toast.success("Payment undone");
      fetchPayments();
    } catch (e) { toast.error(e.response?.data?.detail || "Undo error"); }
  };

  const handleMarkPaid = (p) => {
    setMarkPaidPayment(p);
    setMarkPaidAmount(String(p.amount_payable || p.amount_paid || 0));
    setMarkPaidRoundOff("");
    setShowMarkPaid(true);
  };

  const confirmMarkPaid = async () => {
    if (!markPaidPayment) return;
    const amt = parseFloat(markPaidAmount) || 0;
    if (amt <= 0) return toast.error("Amount 0 se zyada hona chahiye");
    try {
      await axios.put(`${API}/hemali/payments/${markPaidPayment.id}/mark-paid`, {
        amount_paid: amt,
        round_off: parseFloat(markPaidRoundOff) || 0,
      });
      toast.success("Payment marked as Paid!");
      setShowMarkPaid(false);
      setMarkPaidPayment(null);
      setMarkPaidRoundOff("");
      fetchPayments();
    } catch (e) { toast.error(e.response?.data?.detail || "Mark paid error"); }
  };

  const handlePrint = async (id) => {
    const { downloadFile } = await import("@/utils/download");
    downloadFile(`/api/hemali/payments/${id}/print`, `hemali_receipt_${id.slice(0,8)}.pdf`);
    toast.success("Receipt download ho rahi hai!");
  };

  const handleDelete = async (id) => {
    if (!await showConfirm("Delete Payment", "Payment delete karein? Yeh permanent hai.")) return;
    try {
      await axios.delete(`${API}/hemali/payments/${id}`);
      toast.success("Payment deleted");
      fetchPayments();
      fetchSardars();
    } catch (e) { toast.error(e.response?.data?.detail || "Delete error"); }
  };

  const handleExportPDF = async () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append("kms_year", filters.kms_year);
    
    if (dateFrom) params.append("from_date", dateFrom);
    if (dateTo) params.append("to_date", dateTo);
    if (filterSardar) params.append("sardar_name", filterSardar);
    const { downloadFile } = await import("@/utils/download");
    downloadFile(`/api/hemali/export/pdf?${params}`, "hemali_payments.pdf");
    toast.success("PDF download ho raha hai!");
  };

  const handleExportExcel = async () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append("kms_year", filters.kms_year);
    
    if (dateFrom) params.append("from_date", dateFrom);
    if (dateTo) params.append("to_date", dateTo);
    if (filterSardar) params.append("sardar_name", filterSardar);
    const { downloadFile } = await import("@/utils/download");
    downloadFile(`/api/hemali/export/excel?${params}`, "hemali_payments.xlsx");
    toast.success("Excel download ho raha hai!");
  };

  // Summary
  const paidPayments = payments.filter(p => p.status === "paid");
  const totalPaid = paidPayments.reduce((s, p) => s + (p.amount_paid || 0), 0);
  const totalWork = paidPayments.reduce((s, p) => s + (p.total || 0), 0);

  return (
    <div className="space-y-4" data-testid="hemali-payment-page">
      {/* Sub-tabs */}
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        <button onClick={() => setSubTab("payments")} data-testid="hemali-tab-payments"
          className={`px-4 py-1.5 rounded-t text-sm font-medium transition ${subTab === "payments" ? "bg-amber-500/20 text-amber-400 border-b-2 border-amber-400" : "text-slate-400 hover:text-slate-200"}`}>
          Hemali Payments
        </button>
        <button onClick={() => setSubTab("monthly")} data-testid="hemali-tab-monthly"
          className={`px-4 py-1.5 rounded-t text-sm font-medium transition ${subTab === "monthly" ? "bg-amber-500/20 text-amber-400 border-b-2 border-amber-400" : "text-slate-400 hover:text-slate-200"}`}>
          Monthly Summary
        </button>
        <button onClick={() => setSubTab("items")} data-testid="hemali-tab-items"
          className={`px-4 py-1.5 rounded-t text-sm font-medium transition ${subTab === "items" ? "bg-amber-500/20 text-amber-400 border-b-2 border-amber-400" : "text-slate-400 hover:text-slate-200"}`}>
          Items Config
        </button>
      </div>

      {subTab === "items" ? (
        <ItemsConfig items={items} fetchItems={fetchItems} />
      ) : subTab === "monthly" ? (
        <MonthlySummary filters={filters} />
      ) : (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-3">
                <p className="text-xs text-slate-400">Total Payments</p>
                <p className="text-xl font-bold text-white" data-testid="hemali-total-count">{paidPayments.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-3">
                <p className="text-xs text-slate-400">Total Work Amount</p>
                <p className="text-xl font-bold text-amber-400" data-testid="hemali-total-work">Rs.{totalWork.toLocaleString("en-IN")}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-3">
                <p className="text-xs text-slate-400">Total Paid</p>
                <p className="text-xl font-bold text-red-400" data-testid="hemali-total-paid">Rs.{totalPaid.toLocaleString("en-IN")}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-3">
                <p className="text-xs text-slate-400">Sardars</p>
                <p className="text-xl font-bold text-blue-400" data-testid="hemali-sardar-count">{sardars.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap gap-2 items-center">
            <Button onClick={openCreate} className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold" data-testid="create-hemali-payment-btn">
              <Plus className="w-4 h-4 mr-1" /> Nayi Hemali Payment
            </Button>
            <Button onClick={fetchPayments} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700" data-testid="refresh-hemali-btn">
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
            <Button onClick={handleExportPDF} variant="outline" size="sm" className="border-red-600 text-red-400 hover:bg-red-900/30" data-testid="hemali-export-pdf">
              <FileText className="w-4 h-4 mr-1" /> PDF
            </Button>
            <Button onClick={handleExportExcel} variant="outline" size="sm" className="border-green-600 text-green-400 hover:bg-green-900/30" data-testid="hemali-export-excel">
              <Download className="w-4 h-4 mr-1" /> Excel
            </Button>

            {/* Filters */}
            <div className="flex items-center gap-2 ml-auto">
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-[130px]" data-testid="hemali-filter-from" />
              <span className="text-slate-500 text-xs">to</span>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-[130px]" data-testid="hemali-filter-to" />
              <Select value={filterSardar || "all"} onValueChange={v => setFilterSardar(v === "all" ? "" : v)}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-[140px]" data-testid="hemali-filter-sardar">
                  <SelectValue placeholder="All Sardars" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  <SelectItem value="all" className="text-white">All Sardars</SelectItem>
                  {sardars.map(s => <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Payments Table */}
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-0">
              {loading ? (
                <p className="text-slate-400 text-center py-8">Loading...</p>
              ) : payments.length === 0 ? (
                <p className="text-slate-500 text-center py-8">Koi payment nahi mili. Nayi payment banayein.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="hemali-payments-table">
                    <thead><tr className="border-b border-slate-700 text-slate-400 text-xs">
                      <th className="text-left py-2 px-3">#</th>
                      <th className="text-left py-2 px-3">Date</th>
                      <th className="text-left py-2 px-3">Sardar</th>
                      <th className="text-left py-2 px-3">Items</th>
                      <th className="text-right py-2 px-3">Total</th>
                      <th className="text-right py-2 px-3">Adv Deducted</th>
                      <th className="text-right py-2 px-3">Payable</th>
                      <th className="text-right py-2 px-3">Paid</th>
                      <th className="text-right py-2 px-3">New Advance</th>
                      <th className="text-center py-2 px-3">Status</th>
                      <th className="text-center py-2 px-3">Actions</th>
                    </tr></thead>
                    <tbody>{payments.map((p, idx) => (
                      <tr key={p.id} className={`border-b border-slate-700/50 hover:bg-slate-800/50 ${p.status === "undone" ? "opacity-50" : ""}`} data-testid={`hemali-payment-row-${idx}`}>
                        <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                        <td className="py-2 px-3 text-white">{fmtDate(p.date)}</td>
                        <td className="py-2 px-3 text-white font-medium">{p.sardar_name}</td>
                        <td className="py-2 px-3 text-slate-300 text-xs max-w-[200px] truncate">
                          {(p.items || []).map(i => `${i.item_name} x${i.quantity}`).join(", ")}
                        </td>
                        <td className="py-2 px-3 text-right text-amber-400">Rs.{(p.total || 0).toLocaleString("en-IN")}</td>
                        <td className="py-2 px-3 text-right text-orange-400">{p.advance_deducted > 0 ? `Rs.${(p.advance_deducted || 0).toLocaleString("en-IN")}` : "-"}</td>
                        <td className="py-2 px-3 text-right text-slate-300">Rs.{(p.amount_payable || 0).toLocaleString("en-IN")}</td>
                        <td className="py-2 px-3 text-right text-red-400 font-semibold">Rs.{(p.amount_paid || 0).toLocaleString("en-IN")}</td>
                        <td className="py-2 px-3 text-right text-yellow-400">{p.new_advance > 0 ? `Rs.${(p.new_advance || 0).toLocaleString("en-IN")}` : "-"}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${p.status === "paid" ? "bg-green-900/40 text-green-400" : "bg-orange-900/40 text-orange-400"}`}>
                            {p.status === "paid" ? "Paid" : "Unpaid"}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          {p.status === "unpaid" && (
                            <>
                              <Button onClick={() => handleMarkPaid(p)} variant="ghost" size="sm" className="text-green-400 h-7 px-2" title="Make Payment" data-testid={`hemali-mark-paid-${idx}`}>
                                <CheckCircle className="w-3 h-3" />
                              </Button>
                              <Button onClick={() => openEdit(p)} variant="ghost" size="sm" className="text-blue-400 h-7 px-2" title="Edit" data-testid={`hemali-edit-${idx}`}>
                                <Edit className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                          {p.status === "paid" && (
                            <Button onClick={() => handleUndo(p.id)} variant="ghost" size="sm" className="text-orange-400 h-7 px-2" title="Undo Payment" data-testid={`hemali-undo-${idx}`}>
                              <Undo2 className="w-3 h-3" />
                            </Button>
                          )}
                          <Button onClick={() => handlePrint(p.id)} variant="ghost" size="sm" className="text-blue-400 h-7 px-2" title="Print Receipt" data-testid={`hemali-print-${idx}`}>
                            <Printer className="w-3 h-3" />
                          </Button>
                          <Button onClick={() => handleDelete(p.id)} variant="ghost" size="sm" className="text-red-400 h-7 px-2" title="Delete" data-testid={`hemali-delete-${idx}`}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Payment Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="hemali-create-dialog">
          <DialogHeader><DialogTitle className="text-amber-400 flex items-center gap-2"><Calculator className="w-5 h-5" /> {editId ? 'Edit' : 'Nayi'} Hemali Payment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Sardar + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Sardar Name / सरदार का नाम</Label>
                <Input value={form.sardar_name}
                  onChange={e => { setForm(p => ({ ...p, sardar_name: e.target.value })); }}
                  placeholder="e.g. Ramesh" className="bg-slate-700 border-slate-600 text-white" data-testid="hemali-sardar-name"
                  list="sardar-suggestions" />
                <datalist id="sardar-suggestions">
                  {sardars.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div>
                <Label className="text-xs text-slate-400">Date / तारीख</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white" data-testid="hemali-payment-date" />
              </div>
            </div>

            {/* Advance info */}
            {advanceInfo.advance > 0 && (
              <div className="bg-yellow-900/30 border border-yellow-700/50 rounded p-3" data-testid="hemali-advance-info">
                <p className="text-yellow-400 text-sm font-medium">
                  Pichla Advance: Rs.{advanceInfo.advance.toLocaleString("en-IN")}
                  <span className="text-yellow-500/70 text-xs ml-2">(Auto-deduct hoga)</span>
                </p>
              </div>
            )}

            {/* Items */}
            <div>
              <Label className="text-xs text-slate-400 mb-2 block">Items / काम</Label>
              {form.items.length === 0 ? (
                <p className="text-slate-500 text-sm">Pehle "Items Config" tab mein items add karein.</p>
              ) : (
                <div className="space-y-2">
                  {form.items.map((item, i) => (
                    <div key={i} className="grid grid-cols-[1fr_80px_80px_90px] gap-2 items-center" data-testid={`hemali-item-row-${i}`}>
                      <span className="text-slate-300 text-sm">{item.item_name} <span className="text-slate-500">(@Rs.{item.rate}/{items.find(x => x.name === item.item_name)?.unit || "bag"})</span></span>
                      <Input type="number" placeholder="Qty" value={item.quantity}
                        onChange={e => {
                          const newItems = [...form.items];
                          newItems[i] = { ...newItems[i], quantity: e.target.value };
                          setForm(p => ({ ...p, items: newItems }));
                        }}
                        className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid={`hemali-qty-${i}`} />
                      <span className="text-right text-amber-400 text-sm">Rs.{((parseFloat(item.quantity) || 0) * item.rate).toFixed(2)}</span>
                      <span className="text-right text-slate-500 text-xs">{parseFloat(item.quantity) > 0 ? `${item.quantity} x ${item.rate}` : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Calculation Summary */}
            <div className="bg-slate-900 rounded p-3 space-y-1 text-sm" data-testid="hemali-calc-summary">
              <div className="flex justify-between"><span className="text-slate-400">Total Work:</span><span className="text-white font-semibold">Rs.{calcTotal.toFixed(2)}</span></div>
              {advanceInfo.advance > 0 && (
                <div className="flex justify-between"><span className="text-yellow-400">Advance Deducted:</span><span className="text-yellow-400">- Rs.{advDeducted.toFixed(2)}</span></div>
              )}
              <div className="flex justify-between border-t border-slate-700 pt-1"><span className="text-slate-300 font-medium">Amount Payable:</span><span className="text-amber-400 font-bold text-base">Rs.{amountPayable.toFixed(2)}</span></div>
            </div>

            {/* Amount paid override */}
            <div>
              <Label className="text-xs text-slate-400">Amount Paid (Rs.) / दिया गया (blank = payable amount)</Label>
              <Input type="number" value={form.amount_paid} onChange={e => setForm(p => ({ ...p, amount_paid: e.target.value }))}
                placeholder={amountPayable.toFixed(2)} className="bg-slate-700 border-slate-600 text-white" data-testid="hemali-amount-paid" />
              {parseFloat(form.amount_paid) > amountPayable && (
                <p className="text-yellow-400 text-xs mt-1" data-testid="hemali-new-advance-preview">
                  New Advance: Rs.{(parseFloat(form.amount_paid) - amountPayable).toFixed(2)} (extra paid)
                </p>
              )}
            </div>

            <Button onClick={handleCreate} className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold" data-testid="hemali-submit-payment">
              <IndianRupee className="w-4 h-4 mr-1" /> {editId ? 'Payment Update Karein' : 'Payment Create Karein'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mark Paid Dialog */}
      <Dialog open={showMarkPaid} onOpenChange={setShowMarkPaid}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md" data-testid="hemali-mark-paid-dialog">
          <DialogHeader><DialogTitle className="text-green-400 flex items-center gap-2"><CheckCircle className="w-5 h-5" /> Make Payment</DialogTitle></DialogHeader>
          {markPaidPayment && (
            <div className="space-y-4">
              <div className="bg-slate-900 rounded p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Sardar:</span><span className="text-white font-semibold">{markPaidPayment.sardar_name}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Date:</span><span className="text-white">{fmtDate(markPaidPayment.date)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Total Work:</span><span className="text-amber-400 font-semibold">Rs.{(markPaidPayment.total || 0).toLocaleString("en-IN")}</span></div>
                {markPaidPayment.advance_deducted > 0 && (
                  <div className="flex justify-between"><span className="text-yellow-400">Advance Deducted:</span><span className="text-yellow-400">- Rs.{(markPaidPayment.advance_deducted || 0).toLocaleString("en-IN")}</span></div>
                )}
                <div className="flex justify-between border-t border-slate-700 pt-1"><span className="text-slate-300 font-medium">Amount Payable:</span><span className="text-amber-400 font-bold">Rs.{(markPaidPayment.amount_payable || 0).toLocaleString("en-IN")}</span></div>
              </div>
              <div>
                <Label className="text-xs text-slate-400">Payment Amount (Rs.) / भुगतान राशि</Label>
                <Input type="number" value={markPaidAmount} onChange={e => setMarkPaidAmount(e.target.value)}
                  placeholder="Full or partial amount" className="bg-slate-700 border-slate-600 text-white" data-testid="hemali-mark-paid-amount" />
                {parseFloat(markPaidAmount) > (markPaidPayment.amount_payable || 0) && (
                  <p className="text-yellow-400 text-xs mt-1">New Advance: Rs.{(parseFloat(markPaidAmount) - (markPaidPayment.amount_payable || 0)).toFixed(2)}</p>
                )}
                {parseFloat(markPaidAmount) < (markPaidPayment.amount_payable || 0) && parseFloat(markPaidAmount) > 0 && (
                  <p className="text-orange-400 text-xs mt-1">Partial Payment: Rs.{(markPaidPayment.amount_payable - parseFloat(markPaidAmount)).toFixed(2)} remaining</p>
                )}
              </div>
              <RoundOffInput
                value={markPaidRoundOff}
                onChange={setMarkPaidRoundOff}
                amount={parseFloat(markPaidAmount) || 0}
              />
              <Button onClick={confirmMarkPaid} className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold" data-testid="hemali-confirm-mark-paid">
                <CheckCircle className="w-4 h-4 mr-1" /> Payment Confirm Karein
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
