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
import { Plus, Trash2, FileText, IndianRupee, Edit, Download } from "lucide-react";

const API = `${(typeof window !== 'undefined' && window.ELECTRON_API_URL) || process.env.REACT_APP_BACKEND_URL}/api`;

const fmtDate = (d) => {
  if (!d) return '';
  const parts = String(d).split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return d;
};

export default function SaleBook({ filters, user }) {
  const [vouchers, setVouchers] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [gstSettings, setGstSettings] = useState({ cgst_percent: 0, sgst_percent: 0, igst_percent: 0 });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [obList, setObList] = useState([]);
  const [isObOpen, setIsObOpen] = useState(false);
  const [obForm, setObForm] = useState({ party_name: "", party_type: "Cash Party", amount: "", balance_type: "jama", note: "" });

  const emptyItem = { item_name: "", quantity: "", rate: "", unit: "Qntl" };
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    party_name: "", items: [{ ...emptyItem }],
    gst_type: "none", cgst_percent: 0, sgst_percent: 0, igst_percent: 0,
    truck_no: "", rst_no: "", remark: "", cash_paid: "", diesel_paid: "",
    kms_year: filters.kms_year || "", season: filters.season || "",
  });

  const p = `kms_year=${filters.kms_year || ''}&season=${filters.season || ''}`;

  const fetchData = useCallback(async () => {
    try {
      const [vRes, sRes, gRes, obRes] = await Promise.all([
        axios.get(`${API}/sale-book?${p}`),
        axios.get(`${API}/sale-book/stock-items?${p}`),
        axios.get(`${API}/gst-settings`),
        axios.get(`${API}/opening-balances?kms_year=${filters.kms_year || ''}`),
      ]);
      setVouchers(vRes.data);
      setStockItems(sRes.data);
      setGstSettings(gRes.data);
      setObList(obRes.data);
    } catch (e) { console.error(e); }
  }, [p, filters.kms_year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNewForm = () => {
    setEditingId(null);
    setForm({
      date: new Date().toISOString().split('T')[0], party_name: "",
      items: [{ ...emptyItem }], gst_type: "none",
      cgst_percent: gstSettings.cgst_percent, sgst_percent: gstSettings.sgst_percent, igst_percent: gstSettings.igst_percent,
      truck_no: "", rst_no: "", remark: "", cash_paid: "", diesel_paid: "",
      kms_year: filters.kms_year || "", season: filters.season || "",
    });
    setIsFormOpen(true);
  };

  const openEditForm = (v) => {
    setEditingId(v.id);
    setForm({
      date: v.date || "", party_name: v.party_name || "",
      items: (v.items || []).map(i => ({ item_name: i.item_name, quantity: String(i.quantity || ""), rate: String(i.rate || ""), unit: i.unit || "Qntl" })),
      gst_type: v.gst_type || "none",
      cgst_percent: v.cgst_percent || 0, sgst_percent: v.sgst_percent || 0, igst_percent: v.igst_percent || 0,
      truck_no: v.truck_no || "", rst_no: v.rst_no || "", remark: v.remark || "",
      cash_paid: v.cash_paid ? String(v.cash_paid) : "", diesel_paid: v.diesel_paid ? String(v.diesel_paid) : "",
      kms_year: v.kms_year || filters.kms_year || "", season: v.season || filters.season || "",
    });
    setIsFormOpen(true);
  };

  const updateItem = (idx, field, value) => {
    setForm(prev => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...prev, items };
    });
  };

  const addItem = () => setForm(prev => ({ ...prev, items: [...prev.items, { ...emptyItem }] }));
  const removeItem = (idx) => setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  const subtotal = form.items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0), 0);
  const cgstAmt = form.gst_type === 'cgst_sgst' ? subtotal * (form.cgst_percent || 0) / 100 : 0;
  const sgstAmt = form.gst_type === 'cgst_sgst' ? subtotal * (form.sgst_percent || 0) / 100 : 0;
  const igstAmt = form.gst_type === 'igst' ? subtotal * (form.igst_percent || 0) / 100 : 0;
  const total = subtotal + cgstAmt + sgstAmt + igstAmt;
  const paid = (parseFloat(form.cash_paid) || 0) + (parseFloat(form.diesel_paid) || 0);

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
          item_name: i.item_name, quantity: parseFloat(i.quantity) || 0, rate: parseFloat(i.rate) || 0, unit: i.unit || "Qntl"
        })),
        cash_paid: parseFloat(form.cash_paid) || 0, diesel_paid: parseFloat(form.diesel_paid) || 0,
      };
      if (editingId) {
        await axios.put(`${API}/sale-book/${editingId}?username=${user.username}&role=${user.role}`, payload);
        toast.success("Voucher update ho gaya!");
      } else {
        await axios.post(`${API}/sale-book?username=${user.username}&role=${user.role}`, payload);
        toast.success("Sale voucher save ho gaya!");
      }
      setIsFormOpen(false);
      setEditingId(null);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Save error"); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Kya aap ye voucher delete karna chahte hain?")) return;
    try {
      await axios.delete(`${API}/sale-book/${id}?username=${user.username}&role=${user.role}`);
      toast.success("Voucher delete ho gaya");
      fetchData();
    } catch { toast.error("Delete error"); }
  };

  const handleExportPDF = async () => {
    const url = `${API}/sale-book/export/pdf?${p}`;
    window.open(url, '_blank');
    toast.success("PDF export ho raha hai!");
  };

  const getStockForItem = (itemName) => {
    const s = stockItems.find(i => i.name === itemName);
    return s ? s.available_qntl : null;
  };

  // Opening Balance
  const handleObSubmit = async (e) => {
    e.preventDefault();
    if (!obForm.party_name.trim()) { toast.error("Party name daalo"); return; }
    if (!parseFloat(obForm.amount)) { toast.error("Amount daalo"); return; }
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
    if (!window.confirm("Delete opening balance?")) return;
    try {
      await axios.delete(`${API}/opening-balances/${id}?username=${user.username}&role=${user.role}`);
      toast.success("Deleted");
      fetchData();
    } catch { toast.error("Delete error"); }
  };

  return (
    <div className="space-y-4" data-testid="sale-book">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-amber-400 flex items-center gap-2">
          <FileText className="w-5 h-5" /> Sale Book (बिक्री खाता)
        </h2>
        <div className="flex gap-2">
          <Button onClick={() => setIsObOpen(true)} variant="outline" size="sm" className="border-blue-600 text-blue-400 hover:bg-blue-900/30" data-testid="ob-add-btn">
            <Plus className="w-3 h-3 mr-1" /> Opening Balance
          </Button>
          <Button onClick={handleExportPDF} variant="outline" size="sm" className="border-red-600 text-red-400 hover:bg-red-900/30" data-testid="sale-book-pdf-btn">
            <Download className="w-3 h-3 mr-1" /> PDF
          </Button>
          <Button onClick={openNewForm} className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold" data-testid="sale-book-add-btn">
            <Plus className="w-4 h-4 mr-1" /> New Sale Voucher
          </Button>
        </div>
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

      {/* Opening Balances */}
      {obList.length > 0 && (
        <Card className="bg-slate-800/30 border-blue-800/50">
          <CardContent className="p-3">
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
          </CardContent>
        </Card>
      )}

      {/* Vouchers Table */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-400 text-xs">No.</TableHead>
                <TableHead className="text-slate-400 text-xs">Date</TableHead>
                <TableHead className="text-slate-400 text-xs">Party</TableHead>
                <TableHead className="text-slate-400 text-xs">Items</TableHead>
                <TableHead className="text-slate-400 text-xs text-right">Subtotal</TableHead>
                <TableHead className="text-slate-400 text-xs text-right">GST</TableHead>
                <TableHead className="text-slate-400 text-xs text-right">Total</TableHead>
                <TableHead className="text-slate-400 text-xs text-right">Paid</TableHead>
                <TableHead className="text-slate-400 text-xs text-right">Balance</TableHead>
                <TableHead className="text-slate-400 text-xs w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchers.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-slate-500 py-8">Koi sale voucher nahi hai. "New Sale Voucher" se add karein.</TableCell></TableRow>
              )}
              {vouchers.map(v => (
                <TableRow key={v.id} className="border-slate-700 hover:bg-slate-700/30">
                  <TableCell className="text-amber-400 font-mono text-xs">#{v.voucher_no}</TableCell>
                  <TableCell className="text-white text-xs">{fmtDate(v.date)}</TableCell>
                  <TableCell className="text-white text-sm font-medium">{v.party_name}</TableCell>
                  <TableCell className="text-slate-300 text-xs">{(v.items || []).map(i => `${i.item_name} (${i.quantity}Q)`).join(', ')}</TableCell>
                  <TableCell className="text-white text-xs text-right">Rs.{v.subtotal?.toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-slate-300 text-xs text-right">
                    {v.gst_type !== 'none' && v.gst_type ? `Rs.${((v.cgst_amount || 0) + (v.sgst_amount || 0) + (v.igst_amount || 0)).toLocaleString('en-IN')}` : '-'}
                  </TableCell>
                  <TableCell className="text-emerald-400 font-bold text-xs text-right">Rs.{v.total?.toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-white text-xs text-right">Rs.{v.paid_amount?.toLocaleString('en-IN')}</TableCell>
                  <TableCell className={`font-bold text-xs text-right ${v.balance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    Rs.{v.balance?.toLocaleString('en-IN')}
                  </TableCell>
                  <TableCell className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditForm(v)} className="text-blue-400 hover:text-blue-300 h-6 w-6 p-0" data-testid={`sv-edit-${v.id}`}>
                      <Edit className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(v.id)} className="text-red-400 hover:text-red-300 h-6 w-6 p-0" data-testid={`sv-del-${v.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="sv-form-date" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Party Name *</Label>
                <Input value={form.party_name} onChange={e => setForm(p => ({ ...p, party_name: e.target.value }))}
                  placeholder="Party / Buyer name" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="sv-form-party" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Truck No</Label>
                <Input value={form.truck_no} onChange={e => setForm(p => ({ ...p, truck_no: e.target.value }))}
                  placeholder="OD00XX0000" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-form-truck" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">RST No</Label>
                <Input value={form.rst_no} onChange={e => setForm(p => ({ ...p, rst_no: e.target.value }))}
                  placeholder="RST Number" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="sv-form-rst" />
              </div>
            </div>

            {/* Items Section */}
            <div className="border border-slate-600 rounded-lg overflow-hidden">
              <div className="bg-slate-700/50 px-3 py-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-400">Items (सामान)</span>
                <Button type="button" onClick={addItem} size="sm" variant="ghost" className="h-6 text-emerald-400 hover:text-emerald-300 text-xs" data-testid="sv-add-item">
                  <Plus className="w-3 h-3 mr-1" /> Add Item
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-600">
                    <TableHead className="text-slate-400 text-[10px] w-[35%]">Name of Item</TableHead>
                    <TableHead className="text-slate-400 text-[10px] w-[15%]">Stock</TableHead>
                    <TableHead className="text-slate-400 text-[10px] w-[15%]">Quantity</TableHead>
                    <TableHead className="text-slate-400 text-[10px] w-[12%]">Rate</TableHead>
                    <TableHead className="text-slate-400 text-[10px] w-[15%] text-right">Amount</TableHead>
                    <TableHead className="text-slate-400 text-[10px] w-[8%]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {form.items.map((item, idx) => {
                    const stock = getStockForItem(item.item_name);
                    const amt = (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);
                    return (
                      <TableRow key={idx} className="border-slate-600">
                        <TableCell className="p-1">
                          <Select value={item.item_name || "_none"} onValueChange={v => updateItem(idx, 'item_name', v === "_none" ? "" : v)}>
                            <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid={`sv-item-name-${idx}`}><SelectValue placeholder="Select Item" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">-- Select --</SelectItem>
                              {stockItems.map(si => (
                                <SelectItem key={si.name} value={si.name}>{si.name} ({si.available_qntl} Q)</SelectItem>
                              ))}
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
                        <TableCell className="p-1 text-right text-white text-xs font-medium">Rs.{amt.toLocaleString('en-IN')}</TableCell>
                        <TableCell className="p-1">
                          {form.items.length > 1 && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="h-6 w-6 p-0 text-red-400">
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

            <div className="text-right text-sm font-bold text-white">Subtotal: Rs.{subtotal.toLocaleString('en-IN')}</div>

            {/* GST */}
            <div className="border border-slate-600 rounded-lg p-3 space-y-3">
              <Label className="text-xs text-amber-400 font-semibold">GST</Label>
              <div className="grid grid-cols-4 gap-3 items-end">
                <div>
                  <Label className="text-[10px] text-slate-400">GST Type</Label>
                  <Select value={form.gst_type} onValueChange={v => {
                    setForm(p => ({ ...p, gst_type: v,
                      cgst_percent: v === 'cgst_sgst' ? gstSettings.cgst_percent : 0,
                      sgst_percent: v === 'cgst_sgst' ? gstSettings.sgst_percent : 0,
                      igst_percent: v === 'igst' ? gstSettings.igst_percent : 0,
                    }));
                  }}>
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="sv-gst-type"><SelectValue /></SelectTrigger>
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
                      <Input type="number" step="0.01" value={form.cgst_percent} onChange={e => setForm(p => ({ ...p, cgst_percent: parseFloat(e.target.value) || 0 }))}
                        className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="sv-cgst-pct" />
                      <span className="text-[10px] text-emerald-400 whitespace-nowrap">Rs.{cgstAmt.toFixed(2)}</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-400">SGST %</Label>
                    <div className="flex items-center gap-1">
                      <Input type="number" step="0.01" value={form.sgst_percent} onChange={e => setForm(p => ({ ...p, sgst_percent: parseFloat(e.target.value) || 0 }))}
                        className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="sv-sgst-pct" />
                      <span className="text-[10px] text-emerald-400 whitespace-nowrap">Rs.{sgstAmt.toFixed(2)}</span>
                    </div>
                  </div>
                </>)}
                {form.gst_type === 'igst' && (
                  <div>
                    <Label className="text-[10px] text-slate-400">IGST %</Label>
                    <div className="flex items-center gap-1">
                      <Input type="number" step="0.01" value={form.igst_percent} onChange={e => setForm(p => ({ ...p, igst_percent: parseFloat(e.target.value) || 0 }))}
                        className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="sv-igst-pct" />
                      <span className="text-[10px] text-emerald-400 whitespace-nowrap">Rs.{igstAmt.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Total + Payment */}
            <div className="bg-slate-700/50 rounded-lg p-3 space-y-3">
              <div className="flex justify-between items-center text-lg font-bold">
                <span className="text-slate-300">Grand Total:</span>
                <span className="text-emerald-400" data-testid="sv-grand-total">Rs.{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-[10px] text-slate-400">Cash Paid</Label>
                  <Input type="number" step="0.01" value={form.cash_paid} onChange={e => setForm(p => ({ ...p, cash_paid: e.target.value }))}
                    placeholder="0" className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="sv-cash-paid" />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400">Diesel Paid</Label>
                  <Input type="number" step="0.01" value={form.diesel_paid} onChange={e => setForm(p => ({ ...p, diesel_paid: e.target.value }))}
                    placeholder="0" className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="sv-diesel-paid" />
                </div>
                <div className="flex flex-col justify-end">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400">Balance: </span>
                    <span className={`text-sm font-bold ${(total - paid) > 0 ? 'text-red-400' : 'text-emerald-400'}`} data-testid="sv-balance">
                      Rs.{(total - paid).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
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

      {/* Opening Balance Dialog */}
      <Dialog open={isObOpen} onOpenChange={setIsObOpen}>
        <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-white" data-testid="ob-form-dialog">
          <DialogHeader>
            <DialogTitle className="text-blue-400">Opening Balance (शुरुआती बाकी)</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleObSubmit} className="space-y-3">
            <div>
              <Label className="text-xs text-slate-400">Party Name *</Label>
              <Input value={obForm.party_name} onChange={e => setObForm(p => ({ ...p, party_name: e.target.value }))}
                placeholder="Party ka naam" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" required data-testid="ob-party" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Party Type</Label>
                <Select value={obForm.party_type} onValueChange={v => setObForm(p => ({ ...p, party_type: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="ob-type"><SelectValue /></SelectTrigger>
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
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-400">Balance Type</Label>
                <Select value={obForm.balance_type} onValueChange={v => setObForm(p => ({ ...p, balance_type: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="ob-balance-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jama">Jama (Party owes us / उधार)</SelectItem>
                    <SelectItem value="nikasi">Nikasi (We owe party / हमारा देना)</SelectItem>
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
                placeholder="Optional" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="ob-note" />
            </div>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold" data-testid="ob-submit">
              Save Opening Balance
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
