import { useState, useEffect, useCallback, useMemo } from "react";
import { fmtDate } from "@/utils/date";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, RefreshCw, Package, ArrowDown, ArrowUp, Download, FileText, AlertTriangle, Settings, Edit, Search, Calendar, Filter, Warehouse } from "lucide-react";
import { downloadFile } from "../utils/download";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
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
  const [searchPart, setSearchPart] = useState("");
  const [storeRooms, setStoreRooms] = useState([]);
  const [storeRoomForm, setStoreRoomForm] = useState({ name: "" });
  const [editingRoom, setEditingRoom] = useState(null);
  const [storeRoomReport, setStoreRoomReport] = useState([]);
  const [txnFilters, setTxnFilters] = useState({ date_from: "", date_to: "", part_name: "", txn_type: "", party_name: "" });

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      const tp = new URLSearchParams(p);
      if (txnFilters.date_from) tp.append('date_from', txnFilters.date_from);
      if (txnFilters.date_to) tp.append('date_to', txnFilters.date_to);
      if (txnFilters.part_name) tp.append('part_name', txnFilters.part_name);
      if (txnFilters.txn_type) tp.append('txn_type', txnFilters.txn_type);
      if (txnFilters.party_name) tp.append('party_name', txnFilters.party_name);
      const [partsRes, summaryRes, stockRes, roomsRes] = await Promise.all([
        axios.get(`${API}/mill-parts`),
        axios.get(`${API}/mill-parts/summary?${p}`),
        axios.get(`${API}/mill-parts-stock?${tp}`),
        axios.get(`${API}/store-rooms`),
      ]);
      setParts(partsRes.data);
      setSummary(summaryRes.data);
      setStockEntries(stockRes.data);
      setStoreRooms(roomsRes.data);
    } catch { toast.error("Data load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season, txnFilters]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleAddPart = async (e) => {
    e.preventDefault();
    if (!partForm.name.trim()) { toast.error("Part name bharo"); return; }
    try {
      const room = storeRooms.find(r => r.id === partForm.store_room);
      await axios.post(`${API}/mill-parts`, { ...partForm, store_room_name: room?.name || "" });
      toast.success("Part add ho gaya!"); setPartDialog(false);
      setPartForm({ name: "", category: "General", unit: "Pcs", min_stock: "0", store_room: "" }); fetchAll();
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
      const part = parts.find(p => p.name === stockForm.part_name);
      await axios.post(`${API}/mill-parts-stock`, {
        ...stockForm,
        store_room: part?.store_room || stockForm.store_room || "",
        store_room_name: part?.store_room_name || stockForm.store_room_name || "",
        kms_year: filters.kms_year, season: filters.season, created_by: user.username
      });
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

  // Store Room CRUD
  const handleAddRoom = async (e) => {
    e.preventDefault();
    if (!storeRoomForm.name.trim()) return toast.error("Store Room name bharo");
    try {
      if (editingRoom) {
        await axios.put(`${API}/store-rooms/${editingRoom.id}`, { name: storeRoomForm.name });
        toast.success("Store Room update ho gaya!");
      } else {
        await axios.post(`${API}/store-rooms`, { name: storeRoomForm.name });
        toast.success("Store Room add ho gaya!");
      }
      setStoreRoomForm({ name: "" }); setEditingRoom(null); fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleDeleteRoom = async (id) => {
    if (!window.confirm("Store Room delete karein? Isme assigned parts unassigned ho jayenge.")) return;
    try { await axios.delete(`${API}/store-rooms/${id}`); toast.success("Deleted!"); fetchAll(); }
    catch { toast.error("Delete nahi hua"); }
  };

  const fetchStoreRoomReport = async () => {
    try {
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/mill-parts/store-room-report?${p}`);
      setStoreRoomReport(res.data);
    } catch { toast.error("Report load nahi hua"); }
  };

  const handleEditPart = async (part, field, value) => {
    try {
      const update = { [field]: value };
      if (field === "store_room") {
        const room = storeRooms.find(r => r.id === value);
        update.store_room_name = room?.name || "";
      }
      await axios.put(`${API}/mill-parts/${part.id}`, update);
      toast.success("Updated!"); fetchAll();
    } catch { toast.error("Update nahi hua"); }
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

  const exportTxns = async (format) => {
    const p = new URLSearchParams();
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    if (filters.season) p.append('season', filters.season);
    if (txnFilters.date_from) p.append('date_from', txnFilters.date_from);
    if (txnFilters.date_to) p.append('date_to', txnFilters.date_to);
    if (txnFilters.part_name) p.append('part_name', txnFilters.part_name);
    if (txnFilters.txn_type) p.append('txn_type', txnFilters.txn_type);
    if (txnFilters.party_name) p.append('party_name', txnFilters.party_name);
    const { downloadFile } = await import('../utils/download');
    downloadFile(`/api/mill-parts-stock/export/${format}?${p}`, `mill_parts_txns.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
  };

  const lowStockParts = useMemo(() => summary.filter(s => s.min_stock > 0 && s.current_stock < s.min_stock), [summary]);
  const totalPurchase = useMemo(() => summary.reduce((s, p) => s + p.total_purchase_amount, 0), [summary]);
  const filteredStock = useMemo(() => {
    if (!searchPart.trim()) return stockEntries;
    const q = searchPart.toLowerCase();
    return stockEntries.filter(t => (t.part_name || '').toLowerCase().includes(q) || (t.party_name || '').toLowerCase().includes(q));
  }, [stockEntries, searchPart]);
  const filteredSummary = useMemo(() => {
    if (!searchPart.trim()) return summary;
    const q = searchPart.toLowerCase();
    return summary.filter(s => (s.part_name || '').toLowerCase().includes(q));
  }, [summary, searchPart]);

  return (
    <div className="space-y-4" data-testid="mill-parts-page">
      {/* Sub-tabs */}
      <div className="flex gap-2 border-b border-slate-700 pb-2 flex-wrap">
        {[
          { id: "summary", label: "Stock Summary", icon: Package },
          { id: "transactions", label: "Transactions", icon: ArrowDown },
          { id: "partwise", label: "Part-wise Summary", icon: Filter },
          { id: "parts", label: "Parts Master", icon: Settings },
          { id: "storerooms", label: "Store Rooms", icon: Warehouse },
          { id: "roomreport", label: "Room-wise Report", icon: Warehouse },
        ].map(({ id, label, icon: Icon }) => (
          <Button key={id} onClick={() => { setActiveTab(id); if (id === "roomreport") fetchStoreRoomReport(); }}
            variant={activeTab === id ? "default" : "ghost"} size="sm"
            className={activeTab === id ? "bg-cyan-500 hover:bg-cyan-600 text-white" : "text-slate-300 hover:bg-slate-700"}
            data-testid={`parts-tab-${id}`}>
            <Icon className="w-4 h-4 mr-1" /> {label}
          </Button>
        ))}
      </div>

      {/* Search bar */}
      {(activeTab === "summary" || activeTab === "transactions" || activeTab === "partwise") && (
        <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 max-w-xs">
          <Search className="w-4 h-4 text-slate-400" />
          <input value={searchPart} onChange={e => setSearchPart(e.target.value)}
            placeholder="Part name search karein..."
            className="bg-transparent border-none text-white text-sm w-full outline-none placeholder-slate-500"
            data-testid="mill-parts-search" />
          {searchPart && <button onClick={() => setSearchPart("")} className="text-slate-400 hover:text-white text-xs">x</button>}
        </div>
      )}

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
                {['Part Name', 'Category', 'Unit', 'OB', 'Stock In', 'Used', 'Current Stock', 'Purchase ₹', 'Parties'].map(h =>
                  <TableHead key={h} className={`text-slate-300 text-xs ${['OB', 'Stock In', 'Used', 'Current Stock', 'Purchase ₹'].includes(h) ? 'text-right' : ''}`}>{h}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
                : summary.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8">Parts Master se pehle parts add karein</TableCell></TableRow>
                : filteredSummary.map(s => (
                  <TableRow key={s.part_name} className={`border-slate-700 ${s.min_stock > 0 && s.current_stock < s.min_stock ? 'bg-red-900/10' : ''}`} data-testid={`stock-row-${s.part_name}`}>
                    <TableCell className="text-white font-semibold">{s.part_name} {s.min_stock > 0 && s.current_stock < s.min_stock && <AlertTriangle className="w-3 h-3 text-red-400 inline ml-1" />}</TableCell>
                    <TableCell className="text-slate-400 text-xs">{s.category}</TableCell>
                    <TableCell className="text-slate-400 text-xs">{s.unit}</TableCell>
                    <TableCell className="text-right text-yellow-400">{s.opening_stock || 0}</TableCell>
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
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5"><Calendar className="w-3 h-3 inline mr-1" />From</label>
              <Input type="date" value={txnFilters.date_from} onChange={e => setTxnFilters(p => ({ ...p, date_from: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-36" data-testid="txn-date-from" />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">To</label>
              <Input type="date" value={txnFilters.date_to} onChange={e => setTxnFilters(p => ({ ...p, date_to: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-36" data-testid="txn-date-to" />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5"><Filter className="w-3 h-3 inline mr-1" />Part</label>
              <Select value={txnFilters.part_name || "all"} onValueChange={v => setTxnFilters(p => ({ ...p, part_name: v === "all" ? "" : v }))}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-40" data-testid="txn-part-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Parts</SelectItem>
                  {parts.map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">Type</label>
              <Select value={txnFilters.txn_type || "all"} onValueChange={v => setTxnFilters(p => ({ ...p, txn_type: v === "all" ? "" : v }))}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-28" data-testid="txn-type-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="in">IN</SelectItem>
                  <SelectItem value="used">USED</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">Party</label>
              <Input placeholder="Party name..." value={txnFilters.party_name} onChange={e => setTxnFilters(p => ({ ...p, party_name: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-36" data-testid="txn-party-filter" />
            </div>
            {(txnFilters.date_from || txnFilters.date_to || txnFilters.part_name || txnFilters.txn_type || txnFilters.party_name) && (
              <Button variant="ghost" size="sm" className="text-red-400 h-8 text-xs" onClick={() => setTxnFilters({ date_from: "", date_to: "", part_name: "", txn_type: "", party_name: "" })} data-testid="txn-clear-filters">Clear</Button>
            )}
          </div>
          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => { setStockForm(prev => ({ ...prev, txn_type: "in" })); setStockDialog(true); }} className="bg-emerald-500 hover:bg-emerald-600 text-white" size="sm"><ArrowDown className="w-4 h-4 mr-1" /> Stock In</Button>
            <Button onClick={() => { setStockForm(prev => ({ ...prev, txn_type: "used" })); setStockDialog(true); }} className="bg-red-500 hover:bg-red-600 text-white" size="sm"><ArrowUp className="w-4 h-4 mr-1" /> Stock Used</Button>
            <div className="ml-auto flex gap-2">
              <Button onClick={() => exportTxns('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400" data-testid="txn-export-excel"><Download className="w-4 h-4 mr-1" /> Excel</Button>
              <Button onClick={() => exportTxns('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400" data-testid="txn-export-pdf"><FileText className="w-4 h-4 mr-1" /> PDF</Button>
            </div>
          </div>
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="border-slate-700">
                {['Date', 'Part', 'Type', 'Qty', 'Rate', 'Amount ₹', 'Party', 'Bill No', ''].map(h =>
                  <TableHead key={h} className="text-slate-300 text-xs">{h}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {filteredStock.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8">Koi transaction nahi{searchPart ? ` "${searchPart}" ke liye` : ''}</TableCell></TableRow>
                : filteredStock.map(t => (
                  <TableRow key={t.id} className="border-slate-700">
                    <TableCell className="text-white text-xs">{fmtDate(t.date)}</TableCell>
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

      {/* ===== PART-WISE SUMMARY TAB ===== */}
      {activeTab === "partwise" && (
        <div className="space-y-4">
          {/* Part Selector - native select for better Electron compatibility */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 max-w-xs">
              <select value={searchPart || ""} onChange={e => setSearchPart(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg h-9 text-sm px-3 outline-none"
                data-testid="partwise-part-select">
                <option value="">-- Part Select Karein --</option>
                {[...new Set([...parts.map(p => p.name), ...summary.map(s => s.part_name)])].filter(Boolean).sort().map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            {searchPart && (
              <div className="flex gap-2">
                <Button onClick={() => { const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season); p.append('part_name', searchPart); downloadFile(`/api/mill-parts/part-summary/excel?${p}`, `${searchPart}_summary.xlsx`); }}
                  variant="outline" size="sm" className="border-emerald-600/50 text-emerald-400 hover:bg-emerald-900/30" data-testid="partwise-export-excel">
                  <Download className="w-4 h-4 mr-1" /> Excel
                </Button>
                <Button onClick={() => { const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season); p.append('part_name', searchPart); downloadFile(`/api/mill-parts/part-summary/pdf?${p}`, `${searchPart}_summary.pdf`); }}
                  variant="outline" size="sm" className="border-red-600/50 text-red-400 hover:bg-red-900/30" data-testid="partwise-export-pdf">
                  <FileText className="w-4 h-4 mr-1" /> PDF
                </Button>
              </div>
            )}
          </div>

          {/* Empty state */}
          {!searchPart && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Search className="w-12 h-12 mb-3 text-slate-600" />
              <p className="text-base font-medium">Part select karein summary dekhne ke liye</p>
              <p className="text-xs mt-1">Upar dropdown se koi part choose karein</p>
            </div>
          )}

          {/* Selected Part Summary */}
          {searchPart && (() => {
            const s = summary.find(x => x.part_name === searchPart) || summary.find(x => x.part_name.toLowerCase().includes(searchPart.toLowerCase()));
            if (!s) return <p className="text-slate-400 text-center py-8">"{searchPart}" ka data nahi mila</p>;
            const partTxns = stockEntries.filter(t => t.part_name === s.part_name);
            return (
              <div className="space-y-4">
                {/* Part Header Card */}
                <Card className="bg-gradient-to-r from-slate-800 to-slate-800/80 border-slate-600/50 overflow-hidden" data-testid="partwise-detail-card">
                  <CardContent className="p-0">
                    <div className="p-4 pb-3 border-b border-slate-700/50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                          <Package className="w-5 h-5 text-cyan-400" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-white">{s.part_name}</h3>
                          <p className="text-xs text-slate-400">{s.category} | {s.unit}</p>
                        </div>
                      </div>
                    </div>
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-700/50">
                      <div className="p-4 text-center">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Stock In</p>
                        <p className="text-2xl font-bold text-emerald-400">{s.stock_in}</p>
                        <p className="text-[10px] text-slate-500">{s.unit}</p>
                      </div>
                      <div className="p-4 text-center">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Used</p>
                        <p className="text-2xl font-bold text-red-400">{s.stock_used}</p>
                        <p className="text-[10px] text-slate-500">{s.unit}</p>
                      </div>
                      <div className="p-4 text-center">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Current Stock</p>
                        <p className={`text-2xl font-bold ${s.current_stock > 0 ? 'text-amber-400' : 'text-red-400'}`}>{s.current_stock}</p>
                        <p className="text-[10px] text-slate-500">{s.unit}</p>
                      </div>
                      <div className="p-4 text-center">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Purchase</p>
                        <p className="text-2xl font-bold text-blue-400">Rs.{(s.total_purchase_amount || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Party-wise Purchase */}
                {(s.parties || []).length > 0 && (
                  <Card className="bg-slate-800/80 border-slate-700/50">
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-sm text-slate-300 font-semibold">Party-wise Purchase</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {s.parties.map((p, pi) => (
                          <div key={pi} className="bg-slate-750 border border-slate-600/40 rounded-lg p-3 hover:border-slate-500/60 transition-colors" data-testid={`party-card-${pi}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-bold text-white truncate">{p.name}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-[10px] text-slate-500 uppercase">Qty</p>
                                <p className="text-sm font-semibold text-emerald-400">{p.qty} <span className="text-[10px] text-slate-500">{s.unit}</span></p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] text-slate-500 uppercase">Amount</p>
                                <p className="text-sm font-semibold text-blue-400">Rs.{(p.amount || 0).toLocaleString()}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Recent Transactions */}
                {partTxns.length > 0 && (
                  <Card className="bg-slate-800/80 border-slate-700/50">
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-sm text-slate-300 font-semibold">Transactions ({partTxns.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0"><div className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow className="border-slate-700">
                          {['Date','Type','Qty','Rate','Amount','Party','Bill No'].map(h =>
                            <TableHead key={h} className="text-slate-400 text-xs h-8">{h}</TableHead>)}
                        </TableRow></TableHeader>
                        <TableBody>
                          {partTxns.map(t => (
                            <TableRow key={t.id} className="border-slate-700/40">
                              <TableCell className="text-xs text-white py-1.5">{fmtDate(t.date)}</TableCell>
                              <TableCell className="py-1.5"><span className={`px-2 py-0.5 text-xs rounded-full font-medium ${t.txn_type === 'in' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>{t.txn_type === 'in' ? 'IN' : 'USED'}</span></TableCell>
                              <TableCell className={`text-xs py-1.5 font-bold ${t.txn_type === 'in' ? 'text-emerald-400' : 'text-red-400'}`}>{t.quantity}</TableCell>
                              <TableCell className="text-xs py-1.5 text-slate-300">{t.rate ? `Rs.${t.rate}` : '-'}</TableCell>
                              <TableCell className="text-xs py-1.5 text-white">{t.total_amount ? `Rs.${t.total_amount.toLocaleString()}` : '-'}</TableCell>
                              <TableCell className="text-xs py-1.5 text-slate-300">{t.party_name || '-'}</TableCell>
                              <TableCell className="text-xs py-1.5 text-slate-400">{t.bill_no || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div></CardContent>
                  </Card>
                )}
              </div>
            );
          })()}
        </div>
      )}
      {/* ===== PARTS MASTER TAB ===== */}
      {activeTab === "parts" && (
        <div className="space-y-4">
          <Button onClick={() => { setPartForm({ name: "", category: "General", unit: "Pcs", min_stock: "0", store_room: "" }); setPartDialog(true); }} className="bg-cyan-500 hover:bg-cyan-600 text-white" size="sm" data-testid="add-part-btn"><Plus className="w-4 h-4 mr-1" /> Naya Part Add</Button>
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-0"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="border-slate-700">
                {['Part Name', 'Category', 'Unit', 'Min Stock', 'Store Room', ''].map(h => <TableHead key={h} className="text-slate-300 text-xs">{h}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {parts.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-8">Koi part nahi. Add karein.</TableCell></TableRow>
                : parts.map(p => (
                  <TableRow key={p.id} className="border-slate-700">
                    <TableCell className="text-white font-semibold">{p.name}</TableCell>
                    <TableCell className="text-slate-300">{p.category}</TableCell>
                    <TableCell className="text-slate-300">{p.unit}</TableCell>
                    <TableCell className="text-amber-400">{p.min_stock}</TableCell>
                    <TableCell>
                      <select value={p.store_room || ""} onChange={e => handleEditPart(p, "store_room", e.target.value)}
                        className="h-7 rounded border border-slate-600 bg-slate-700 px-2 text-xs text-white" data-testid={`part-room-${p.id}`}>
                        <option value="">-- None --</option>
                        {storeRooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </TableCell>
                    <TableCell>{user.role === 'admin' && <Button variant="ghost" size="sm" className="h-6 px-1 text-red-400" onClick={() => handleDeletePart(p.id)}><Trash2 className="w-3 h-3" /></Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div></CardContent></Card>
        </div>
      )}

      {/* ===== STORE ROOMS TAB ===== */}
      {activeTab === "storerooms" && (
        <div className="space-y-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="p-4 pb-3"><CardTitle className="text-sm text-cyan-400">Store Rooms / स्टोर रूम</CardTitle></CardHeader>
            <CardContent className="p-4 pt-0 space-y-4">
              <form onSubmit={handleAddRoom} className="flex gap-2 items-end" data-testid="store-room-form">
                <div className="flex-1">
                  <Label className="text-xs text-slate-400">{editingRoom ? "Edit Room Name" : "Naya Store Room"}</Label>
                  <Input value={storeRoomForm.name} onChange={e => setStoreRoomForm({ name: e.target.value })}
                    placeholder="Store Room 1, Main Godown..." className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="store-room-name-input" />
                </div>
                <Button type="submit" size="sm" className="bg-cyan-500 hover:bg-cyan-600 text-white h-8" data-testid="store-room-save-btn">
                  {editingRoom ? "Update" : "Add"}
                </Button>
                {editingRoom && <Button type="button" size="sm" variant="outline" onClick={() => { setEditingRoom(null); setStoreRoomForm({ name: "" }); }} className="border-slate-600 text-slate-300 h-8">Cancel</Button>}
              </form>

              <div className="space-y-2">
                {storeRooms.length === 0 ? <p className="text-slate-400 text-sm text-center py-4">Koi store room nahi hai. Add karein.</p>
                : storeRooms.map(r => (
                  <div key={r.id} className="flex items-center justify-between bg-slate-700/50 rounded-lg px-4 py-2.5 border border-slate-600/40" data-testid={`store-room-${r.id}`}>
                    <div className="flex items-center gap-3">
                      <Warehouse className="w-4 h-4 text-cyan-400" />
                      <span className="text-white font-medium">{r.name}</span>
                      <span className="text-xs text-slate-400 ml-2">
                        ({parts.filter(p => p.store_room === r.id).length} parts)
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-blue-400 hover:text-blue-300"
                        onClick={() => { setEditingRoom(r); setStoreRoomForm({ name: r.name }); }}><Edit className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400 hover:text-red-300"
                        onClick={() => handleDeleteRoom(r.id)} data-testid={`delete-room-${r.id}`}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== ROOM-WISE REPORT TAB ===== */}
      {activeTab === "roomreport" && (
        <div className="space-y-4">
          <div className="flex gap-2 items-center">
            <h3 className="text-white font-semibold text-base">Store Room-wise Inventory Report</h3>
            <Button onClick={fetchStoreRoomReport} variant="outline" size="sm" className="border-slate-600 text-slate-300"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          </div>
          {storeRoomReport.length === 0 ? (
            <p className="text-slate-400 text-center py-8">Report load ho raha hai ya koi data nahi...</p>
          ) : storeRoomReport.map(group => (
            <Card key={group.store_room_id} className="bg-slate-800 border-slate-700" data-testid={`room-report-${group.store_room_id}`}>
              <CardHeader className="p-3 pb-2 flex flex-row items-center gap-2">
                <Warehouse className="w-4 h-4 text-cyan-400" />
                <CardTitle className="text-sm text-cyan-400 font-bold">{group.store_room_name}</CardTitle>
                <span className="text-xs text-slate-400 ml-auto">{group.parts.length} parts</span>
              </CardHeader>
              <CardContent className="p-0"><div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow className="border-slate-700">
                    {['Part Name', 'Category', 'Unit', 'Stock In', 'Used', 'Current Stock'].map(h =>
                      <TableHead key={h} className={`text-slate-300 text-xs ${['Stock In', 'Used', 'Current Stock'].includes(h) ? 'text-right' : ''}`}>{h}</TableHead>)}
                  </TableRow></TableHeader>
                  <TableBody>
                    {group.parts.map(p => (
                      <TableRow key={p.part_name} className={`border-slate-700/50 ${p.current_stock <= 0 ? 'bg-red-900/10' : ''}`}>
                        <TableCell className="text-white font-medium text-sm">{p.part_name}</TableCell>
                        <TableCell className="text-slate-400 text-xs">{p.category}</TableCell>
                        <TableCell className="text-slate-400 text-xs">{p.unit}</TableCell>
                        <TableCell className="text-right text-emerald-400">{p.stock_in}</TableCell>
                        <TableCell className="text-right text-red-400">{p.stock_used}</TableCell>
                        <TableCell className={`text-right font-bold ${p.current_stock <= 0 ? 'text-red-400' : 'text-amber-400'}`}>{p.current_stock} {p.unit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div></CardContent>
            </Card>
          ))}
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
                <select value={partForm.unit} onChange={e => setPartForm(p => ({ ...p, unit: e.target.value }))} className="flex h-8 w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1 text-sm text-white shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="Pcs" className="bg-slate-700">Pcs</option>
                  <option value="Kg" className="bg-slate-700">Kg</option>
                  <option value="Ltr" className="bg-slate-700">Ltr</option>
                  <option value="Mtr" className="bg-slate-700">Mtr</option>
                  <option value="Set" className="bg-slate-700">Set</option>
                </select>
              </div>
            </div>
            <div><Label className="text-xs text-slate-400">Min Stock (Alert)</Label><Input type="number" value={partForm.min_stock} onChange={e => setPartForm(p => ({ ...p, min_stock: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" /></div>
            <div><Label className="text-xs text-slate-400">Store Room</Label>
              <select value={partForm.store_room || ""} onChange={e => setPartForm(p => ({ ...p, store_room: e.target.value }))}
                className="flex h-8 w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1 text-sm text-white shadow-sm focus:outline-none focus:ring-1 focus:ring-ring" data-testid="part-store-room-select">
                <option value="" className="bg-slate-700">-- None --</option>
                {storeRooms.map(r => <option key={r.id} value={r.id} className="bg-slate-700">{r.name}</option>)}
              </select>
            </div>
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
                <select value={stockForm.part_name} onChange={e => setStockForm(p => ({ ...p, part_name: e.target.value }))} className="flex h-8 w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1 text-sm text-white shadow-sm focus:outline-none focus:ring-1 focus:ring-ring" data-testid="stock-part-select">
                  <option value="" className="bg-slate-700">Select</option>
                  {parts.map(p => <option key={p.id} value={p.name} className="bg-slate-700">{p.name}</option>)}
                </select>
                {stockForm.part_name && (() => {
                  const ps = summary.find(s => s.part_name === stockForm.part_name);
                  const stock = ps ? ps.current_stock : 0;
                  const unit = ps ? ps.unit : 'Pcs';
                  return (
                    <p className="text-[10px] mt-1 font-medium" data-testid="stock-current-info">
                      Current Stock: <span className={`font-bold ${stock > 0 ? 'text-cyan-400' : 'text-red-400'}`}>{stock} {unit}</span>
                      {stockForm.txn_type === 'used' && stockForm.quantity && parseFloat(stockForm.quantity) > 0 && (
                        <span className="ml-2">
                          After: <span className={`font-bold ${(stock - parseFloat(stockForm.quantity)) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {(stock - parseFloat(stockForm.quantity)).toFixed(1)} {unit}
                          </span>
                          <span className="text-red-400 ml-1">(-{stockForm.quantity})</span>
                        </span>
                      )}
                      {stockForm.txn_type === 'in' && stockForm.quantity && parseFloat(stockForm.quantity) > 0 && (
                        <span className="ml-2">
                          After: <span className="font-bold text-emerald-400">{(stock + parseFloat(stockForm.quantity)).toFixed(1)} {unit}</span>
                          <span className="text-emerald-400 ml-1">(+{stockForm.quantity})</span>
                        </span>
                      )}
                    </p>
                  );
                })()}
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
                  <select value={editingStock.part_name} onChange={e => setEditingStock(p => ({ ...p, part_name: e.target.value }))} className="flex h-8 w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1 text-sm text-white shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="" className="bg-slate-700">Select</option>
                    {parts.map(p => <option key={p.id} value={p.name} className="bg-slate-700">{p.name}</option>)}
                  </select>
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
