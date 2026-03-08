import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, RefreshCw, Package, ArrowDown, ArrowUp, Download, FileText, AlertTriangle, Settings, Edit } from "lucide-react";

const BACKEND_URL = (typeof window !== 'undefined' && window.ELECTRON_API_URL) || process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function MillPartsStock({ filters, user }) {
  const [parts, setParts] = useState([]);
  const [summary, setSummary] = useState([]);
  const [stockEntries, setStockEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("summary");
  const [partDialog, setPartDialog] = useState(false);
  const [stockDialog, setStockDialog] = useState(false);
  const [partForm, setPartForm] = useState({ name: "", category: "General", unit: "Pcs", min_stock: "0" });
  const [stockForm, setStockForm] = useState({
    date: new Date().toISOString().split('T')[0], part_name: "", txn_type: "in",
    quantity: "", rate: "", party_name: "", bill_no: "", remark: "",
  });
  const [editingStock, setEditingStock] = useState(null);
  const [editDialog, setEditDialog] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      const [partsRes, summaryRes, stockRes] = await Promise.all([
        axios.get(`${API}/mill-parts`),
        axios.get(`${API}/mill-parts/summary?${p}`),
        axios.get(`${API}/mill-parts-stock?${p}`),
      ]);
      setParts(partsRes.data);
      setSummary(summaryRes.data);
      setStockEntries(stockRes.data);
    } catch { toast.error("Data load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleAddPart = async (e) => {
    e.preventDefault();
    if (!partForm.name.trim()) { toast.error("Part name bharo"); return; }
    try {
      await axios.post(`${API}/mill-parts`, partForm);
      toast.success("Part add ho gaya!"); setPartDialog(false);
      setPartForm({ name: "", category: "General", unit: "Pcs", min_stock: "0" }); fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleDeletePart = async (id) => {
    if (!window.confirm("Part delete karein?")) return;
    try { await axios.delete(`${API}/mill-parts/${id}`); toast.success("Deleted!"); fetchAll(); }
    catch { toast.error("Delete nahi hua"); }
  };

  const handleAddStock = async (e) => {
    e.preventDefault();
    if (!stockForm.part_name || !parseFloat(stockForm.quantity)) { toast.error("Part aur quantity bharo"); return; }
    try {
      await axios.post(`${API}/mill-parts-stock`, { ...stockForm, kms_year: filters.kms_year, season: filters.season, created_by: user.username });
      toast.success(`Stock ${stockForm.txn_type === 'in' ? 'aya' : 'use hua'}!`);
      setStockDialog(false);
      setStockForm({ date: new Date().toISOString().split('T')[0], part_name: "", txn_type: "in", quantity: "", rate: "", party_name: "", bill_no: "", remark: "" });
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleDeleteStock = async (id) => {
    if (!window.confirm("Entry delete karein?")) return;
    try { await axios.delete(`${API}/mill-parts-stock/${id}`); toast.success("Deleted!"); fetchAll(); }
    catch { toast.error("Delete nahi hua"); }
  };

  const openEditStock = (t) => {
    setEditingStock({
      id: t.id, date: t.date, part_name: t.part_name, txn_type: t.txn_type,
      quantity: String(t.quantity), rate: String(t.rate || ""), party_name: t.party_name || "",
      bill_no: t.bill_no || "", remark: t.remark || "",
    });
    setEditDialog(true);
  };

  const handleEditStock = async (e) => {
    e.preventDefault();
    if (!editingStock) return;
    try {
      await axios.put(`${API}/mill-parts-stock/${editingStock.id}`, {
        ...editingStock, kms_year: filters.kms_year, season: filters.season, created_by: user.username
      });
      toast.success("Entry update ho gaya!");
      setEditDialog(false);
      setEditingStock(null);
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || "Update nahi hua"); }
  };

  const exportData = async (format) => {
    const p = new URLSearchParams();
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    if (filters.season) p.append('season', filters.season);
    const { downloadFile } = await import('../utils/download');
    downloadFile(`/api/mill-parts/summary/${format}?${p}`, `mill_parts_stock.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
  };

  const lowStockParts = useMemo(() => summary.filter(s => s.min_stock > 0 && s.current_stock < s.min_stock), [summary]);
  const totalPurchase = useMemo(() => summary.reduce((s, p) => s + p.total_purchase_amount, 0), [summary]);

  return (
    <div className="space-y-4" data-testid="mill-parts-page">
      {/* Sub-tabs */}
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        {[
          { id: "summary", label: "Stock Summary", icon: Package },
          { id: "transactions", label: "Transactions", icon: ArrowDown },
          { id: "parts", label: "Parts Master", icon: Settings },
        ].map(({ id, label, icon: Icon }) => (
          <Button key={id} onClick={() => setActiveTab(id)}
            variant={activeTab === id ? "default" : "ghost"} size="sm"
            className={activeTab === id ? "bg-cyan-500 hover:bg-cyan-600 text-white" : "text-slate-300 hover:bg-slate-700"}
            data-testid={`parts-tab-${id}`}>
            <Icon className="w-4 h-4 mr-1" /> {label}
          </Button>
        ))}
      </div>

      {/* ===== SUMMARY TAB ===== */}
      {activeTab === "summary" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap items-center">
            <Button onClick={() => { setStockForm(prev => ({ ...prev, txn_type: "in" })); setStockDialog(true); }} className="bg-emerald-500 hover:bg-emerald-600 text-white" size="sm" data-testid="stock-in-btn">
              <ArrowDown className="w-4 h-4 mr-1" /> Stock In
            </Button>
            <Button onClick={() => { setStockForm(prev => ({ ...prev, txn_type: "used" })); setStockDialog(true); }} className="bg-red-500 hover:bg-red-600 text-white" size="sm" data-testid="stock-used-btn">
              <ArrowUp className="w-4 h-4 mr-1" /> Stock Used
            </Button>
            <Button onClick={fetchAll} variant="outline" size="sm" className="border-slate-600 text-slate-300"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
            <div className="ml-auto flex gap-2">
              <Button onClick={() => exportData('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400" data-testid="parts-export-excel"><Download className="w-4 h-4 mr-1" /> Excel</Button>
              <Button onClick={() => exportData('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400" data-testid="parts-export-pdf"><FileText className="w-4 h-4 mr-1" /> PDF</Button>
            </div>
          </div>

          {/* Overview cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-slate-400">Total Parts</p>
              <p className="text-lg font-bold text-white">{parts.length}</p>
            </CardContent></Card>
            <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-slate-400">Total Purchase</p>
              <p className="text-lg font-bold text-emerald-400">₹{Math.round(totalPurchase).toLocaleString()}</p>
            </CardContent></Card>
            <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-slate-400">Transactions</p>
              <p className="text-lg font-bold text-cyan-400">{stockEntries.length}</p>
            </CardContent></Card>
            {lowStockParts.length > 0 && (
              <Card className="bg-red-900/20 border-red-800/30"><CardContent className="p-3 text-center">
                <p className="text-[10px] text-red-400 flex items-center justify-center gap-1"><AlertTriangle className="w-3 h-3" /> Low Stock</p>
                <p className="text-lg font-bold text-red-400">{lowStockParts.length} parts</p>
              </CardContent></Card>
            )}
          </div>

          {/* Stock Summary Table */}
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="border-slate-700">
                {['Part Name', 'Category', 'Unit', 'Stock In', 'Used', 'Current Stock', 'Purchase ₹', 'Parties'].map(h =>
                  <TableHead key={h} className={`text-slate-300 text-xs ${['Stock In', 'Used', 'Current Stock', 'Purchase ₹'].includes(h) ? 'text-right' : ''}`}>{h}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
                : summary.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-8">Parts Master se pehle parts add karein</TableCell></TableRow>
                : summary.map(s => (
                  <TableRow key={s.part_name} className={`border-slate-700 ${s.min_stock > 0 && s.current_stock < s.min_stock ? 'bg-red-900/10' : ''}`} data-testid={`stock-row-${s.part_name}`}>
                    <TableCell className="text-white font-semibold">{s.part_name} {s.min_stock > 0 && s.current_stock < s.min_stock && <AlertTriangle className="w-3 h-3 text-red-400 inline ml-1" />}</TableCell>
                    <TableCell className="text-slate-400 text-xs">{s.category}</TableCell>
                    <TableCell className="text-slate-400 text-xs">{s.unit}</TableCell>
                    <TableCell className="text-right text-emerald-400">{s.stock_in}</TableCell>
                    <TableCell className="text-right text-red-400">{s.stock_used}</TableCell>
                    <TableCell className={`text-right font-bold ${s.current_stock <= 0 ? 'text-red-400' : 'text-amber-400'}`}>{s.current_stock} {s.unit}</TableCell>
                    <TableCell className="text-right text-white">₹{s.total_purchase_amount.toLocaleString()}</TableCell>
                    <TableCell className="text-slate-400 text-xs">{s.parties.map(p => p.name).join(', ') || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div></CardContent></Card>
        </div>
      )}

      {/* ===== TRANSACTIONS TAB ===== */}
      {activeTab === "transactions" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={() => { setStockForm(prev => ({ ...prev, txn_type: "in" })); setStockDialog(true); }} className="bg-emerald-500 hover:bg-emerald-600 text-white" size="sm"><ArrowDown className="w-4 h-4 mr-1" /> Stock In</Button>
            <Button onClick={() => { setStockForm(prev => ({ ...prev, txn_type: "used" })); setStockDialog(true); }} className="bg-red-500 hover:bg-red-600 text-white" size="sm"><ArrowUp className="w-4 h-4 mr-1" /> Stock Used</Button>
          </div>
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="border-slate-700">
                {['Date', 'Part', 'Type', 'Qty', 'Rate', 'Amount ₹', 'Party', 'Bill No', ''].map(h =>
                  <TableHead key={h} className="text-slate-300 text-xs">{h}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {stockEntries.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8">Koi transaction nahi</TableCell></TableRow>
                : stockEntries.map(t => (
                  <TableRow key={t.id} className="border-slate-700">
                    <TableCell className="text-white text-xs">{t.date}</TableCell>
                    <TableCell className="text-white font-semibold">{t.part_name}</TableCell>
                    <TableCell><span className={`px-2 py-0.5 text-xs rounded-full ${t.txn_type === 'in' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>{t.txn_type === 'in' ? 'IN' : 'USED'}</span></TableCell>
                    <TableCell className="text-amber-400 font-semibold">{t.quantity}</TableCell>
                    <TableCell className="text-slate-300">₹{t.rate || '-'}</TableCell>
                    <TableCell className="text-white">{t.total_amount ? `₹${t.total_amount.toLocaleString()}` : '-'}</TableCell>
                    <TableCell className="text-slate-300 text-xs">{t.party_name || '-'}</TableCell>
                    <TableCell className="text-slate-400 text-xs">{t.bill_no || '-'}</TableCell>
                    <TableCell>{user.role === 'admin' && <div className="flex gap-1"><Button variant="ghost" size="sm" className="h-6 px-1 text-blue-400" onClick={() => openEditStock(t)} data-testid={`edit-stock-${t.id}`}><Edit className="w-3 h-3" /></Button><Button variant="ghost" size="sm" className="h-6 px-1 text-red-400" onClick={() => handleDeleteStock(t.id)}><Trash2 className="w-3 h-3" /></Button></div>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div></CardContent></Card>
        </div>
      )}

      {/* ===== PARTS MASTER TAB ===== */}
      {activeTab === "parts" && (
        <div className="space-y-4">
          <Button onClick={() => setPartDialog(true)} className="bg-cyan-500 hover:bg-cyan-600 text-white" size="sm" data-testid="add-part-btn"><Plus className="w-4 h-4 mr-1" /> Naya Part Add</Button>
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="border-slate-700">
                {['Part Name', 'Category', 'Unit', 'Min Stock', ''].map(h => <TableHead key={h} className="text-slate-300 text-xs">{h}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {parts.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-8">Koi part nahi. Add karein.</TableCell></TableRow>
                : parts.map(p => (
                  <TableRow key={p.id} className="border-slate-700">
                    <TableCell className="text-white font-semibold">{p.name}</TableCell>
                    <TableCell className="text-slate-300">{p.category}</TableCell>
                    <TableCell className="text-slate-300">{p.unit}</TableCell>
                    <TableCell className="text-amber-400">{p.min_stock}</TableCell>
                    <TableCell>{user.role === 'admin' && <Button variant="ghost" size="sm" className="h-6 px-1 text-red-400" onClick={() => handleDeletePart(p.id)}><Trash2 className="w-3 h-3" /></Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div></CardContent></Card>
        </div>
      )}

      {/* Add Part Dialog */}
      <Dialog open={partDialog} onOpenChange={setPartDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-sm" data-testid="add-part-dialog">
          <DialogHeader><DialogTitle className="text-cyan-400">Naya Part Add Karein</DialogTitle></DialogHeader>
          <form onSubmit={handleAddPart} className="space-y-3">
            <div><Label className="text-xs text-slate-400">Part Name *</Label><Input value={partForm.name} onChange={e => setPartForm(p => ({ ...p, name: e.target.value }))} placeholder="Belt, Bearing..." className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="part-name-input" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Category</Label><Input value={partForm.category} onChange={e => setPartForm(p => ({ ...p, category: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
              <div><Label className="text-xs text-slate-400">Unit</Label>
                <Select value={partForm.unit} onValueChange={v => setPartForm(p => ({ ...p, unit: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Pcs">Pcs</SelectItem><SelectItem value="Kg">Kg</SelectItem><SelectItem value="Ltr">Ltr</SelectItem><SelectItem value="Mtr">Mtr</SelectItem><SelectItem value="Set">Set</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div><Label className="text-xs text-slate-400">Min Stock (Alert)</Label><Input type="number" value={partForm.min_stock} onChange={e => setPartForm(p => ({ ...p, min_stock: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setPartDialog(false)} className="border-slate-600 text-slate-300 flex-1">Cancel</Button>
              <Button type="submit" className="bg-cyan-500 hover:bg-cyan-600 text-white flex-1" data-testid="part-save-btn">Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stock In/Used Dialog */}
      <Dialog open={stockDialog} onOpenChange={setStockDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md" data-testid="stock-entry-dialog">
          <DialogHeader><DialogTitle className={stockForm.txn_type === 'in' ? 'text-emerald-400' : 'text-red-400'}>
            {stockForm.txn_type === 'in' ? 'Stock In / माल आया' : 'Stock Used / माल लगा'}
          </DialogTitle></DialogHeader>
          <form onSubmit={handleAddStock} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Date</Label><Input type="date" value={stockForm.date} onChange={e => setStockForm(p => ({ ...p, date: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
              <div><Label className="text-xs text-slate-400">Part *</Label>
                <Select value={stockForm.part_name} onValueChange={v => setStockForm(p => ({ ...p, part_name: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="stock-part-select"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent className="max-h-60">{parts.map(p => <SelectItem key={p.id} value={p.name} className="text-white">{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Quantity *</Label><Input type="number" step="0.01" value={stockForm.quantity} onChange={e => setStockForm(p => ({ ...p, quantity: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="stock-qty-input" /></div>
              {stockForm.txn_type === 'in' && <div><Label className="text-xs text-slate-400">Rate / Unit (₹)</Label><Input type="number" step="0.01" value={stockForm.rate} onChange={e => setStockForm(p => ({ ...p, rate: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>}
            </div>
            {stockForm.txn_type === 'in' && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs text-slate-400">Party Name</Label><Input value={stockForm.party_name} onChange={e => setStockForm(p => ({ ...p, party_name: e.target.value }))} placeholder="Supplier" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="stock-party-input" /></div>
                <div><Label className="text-xs text-slate-400">Bill No.</Label><Input value={stockForm.bill_no} onChange={e => setStockForm(p => ({ ...p, bill_no: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
              </div>
            )}
            {stockForm.quantity && stockForm.rate && stockForm.txn_type === 'in' && (
              <p className="text-emerald-400 font-bold text-sm">Total: ₹{(parseFloat(stockForm.quantity || 0) * parseFloat(stockForm.rate || 0)).toLocaleString()}</p>
            )}
            <div><Label className="text-xs text-slate-400">Remark</Label><Input value={stockForm.remark} onChange={e => setStockForm(p => ({ ...p, remark: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setStockDialog(false)} className="border-slate-600 text-slate-300 flex-1">Cancel</Button>
              <Button type="submit" className={`flex-1 ${stockForm.txn_type === 'in' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'} text-white`} data-testid="stock-save-btn">Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Stock Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md" data-testid="edit-stock-dialog">
          <DialogHeader><DialogTitle className="text-blue-400">Edit Stock Entry</DialogTitle></DialogHeader>
          {editingStock && (
            <form onSubmit={handleEditStock} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs text-slate-400">Date</Label><Input type="date" value={editingStock.date} onChange={e => setEditingStock(p => ({ ...p, date: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
                <div><Label className="text-xs text-slate-400">Part</Label>
                  <Select value={editingStock.part_name} onValueChange={v => setEditingStock(p => ({ ...p, part_name: v }))}>
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-60">{parts.map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs text-slate-400">Quantity</Label><Input type="number" step="0.01" value={editingStock.quantity} onChange={e => setEditingStock(p => ({ ...p, quantity: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required /></div>
                {editingStock.txn_type === 'in' && <div><Label className="text-xs text-slate-400">Rate (Rs.)</Label><Input type="number" step="0.01" value={editingStock.rate} onChange={e => setEditingStock(p => ({ ...p, rate: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>}
              </div>
              {editingStock.txn_type === 'in' && (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs text-slate-400">Party Name</Label><Input value={editingStock.party_name} onChange={e => setEditingStock(p => ({ ...p, party_name: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
                  <div><Label className="text-xs text-slate-400">Bill No.</Label><Input value={editingStock.bill_no} onChange={e => setEditingStock(p => ({ ...p, bill_no: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
                </div>
              )}
              <div><Label className="text-xs text-slate-400">Remark</Label><Input value={editingStock.remark} onChange={e => setEditingStock(p => ({ ...p, remark: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditDialog(false)} className="border-slate-600 text-slate-300 flex-1">Cancel</Button>
                <Button type="submit" className="bg-blue-500 hover:bg-blue-600 text-white flex-1" data-testid="edit-stock-save-btn">Update</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
