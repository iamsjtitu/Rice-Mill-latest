import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, FileText, IndianRupee, Package } from "lucide-react";

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
  const [loading, setLoading] = useState(false);

  const emptyItem = { item_name: "", quantity: "", rate: "", unit: "Qntl" };
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    party_name: "",
    items: [{ ...emptyItem }],
    gst_type: "none",
    cgst_percent: 0, sgst_percent: 0, igst_percent: 0,
    truck_no: "", rst_no: "", remark: "",
    cash_paid: "", diesel_paid: "",
    kms_year: filters.kms_year || "", season: filters.season || "",
  });

  const p = `kms_year=${filters.kms_year || ''}&season=${filters.season || ''}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, sRes, gRes] = await Promise.all([
        axios.get(`${API}/sale-book?${p}`),
        axios.get(`${API}/sale-book/stock-items?${p}`),
        axios.get(`${API}/gst-settings`),
      ]);
      setVouchers(vRes.data);
      setStockItems(sRes.data);
      setGstSettings(gRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [p]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNewForm = () => {
    setForm({
      date: new Date().toISOString().split('T')[0],
      party_name: "",
      items: [{ ...emptyItem }],
      gst_type: "none",
      cgst_percent: gstSettings.cgst_percent, sgst_percent: gstSettings.sgst_percent, igst_percent: gstSettings.igst_percent,
      truck_no: "", rst_no: "", remark: "",
      cash_paid: "", diesel_paid: "",
      kms_year: filters.kms_year || "", season: filters.season || "",
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

  // Calculations
  const subtotal = form.items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0), 0);
  const cgstAmt = form.gst_type === 'cgst_sgst' ? subtotal * (form.cgst_percent || 0) / 100 : 0;
  const sgstAmt = form.gst_type === 'cgst_sgst' ? subtotal * (form.sgst_percent || 0) / 100 : 0;
  const igstAmt = form.gst_type === 'igst' ? subtotal * (form.igst_percent || 0) / 100 : 0;
  const total = subtotal + cgstAmt + sgstAmt + igstAmt;
  const paid = (parseFloat(form.cash_paid) || 0) + (parseFloat(form.diesel_paid) || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.party_name.trim()) { toast.error("Party name daalna zaroori hai"); return; }
    if (form.items.length === 0 || !form.items.some(i => i.item_name && parseFloat(i.quantity) > 0)) {
      toast.error("Kam se kam ek item add karein"); return;
    }
    try {
      const payload = {
        ...form,
        items: form.items.filter(i => i.item_name && parseFloat(i.quantity) > 0).map(i => ({
          item_name: i.item_name, quantity: parseFloat(i.quantity) || 0, rate: parseFloat(i.rate) || 0, unit: i.unit || "Qntl"
        })),
        cash_paid: parseFloat(form.cash_paid) || 0,
        diesel_paid: parseFloat(form.diesel_paid) || 0,
      };
      await axios.post(`${API}/sale-book?username=${user.username}&role=${user.role}`, payload);
      toast.success("Sale voucher save ho gaya!");
      setIsFormOpen(false);
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

  const getStockForItem = (itemName) => {
    const s = stockItems.find(i => i.name === itemName);
    return s ? s.available_qntl : null;
  };

  return (
    <div className="space-y-4" data-testid="sale-book">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-amber-400 flex items-center gap-2">
          <FileText className="w-5 h-5" /> Sale Book (बिक्री खाता)
        </h2>
        <Button onClick={openNewForm} className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold" data-testid="sale-book-add-btn">
          <Plus className="w-4 h-4 mr-1" /> New Sale Voucher
        </Button>
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
                <TableHead className="text-slate-400 text-xs">No.</TableHead>
                <TableHead className="text-slate-400 text-xs">Date</TableHead>
                <TableHead className="text-slate-400 text-xs">Party</TableHead>
                <TableHead className="text-slate-400 text-xs">Items</TableHead>
                <TableHead className="text-slate-400 text-xs text-right">Subtotal</TableHead>
                <TableHead className="text-slate-400 text-xs text-right">GST</TableHead>
                <TableHead className="text-slate-400 text-xs text-right">Total</TableHead>
                <TableHead className="text-slate-400 text-xs text-right">Paid</TableHead>
                <TableHead className="text-slate-400 text-xs text-right">Balance</TableHead>
                <TableHead className="text-slate-400 text-xs"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchers.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-slate-500 py-8">Koi sale voucher nahi hai. "New Sale Voucher" se add karein.</TableCell></TableRow>
              )}
              {vouchers.map(v => (
                <TableRow key={v.id} className="border-slate-700 hover:bg-slate-700/30">
                  <TableCell className="text-amber-400 font-mono text-xs" data-testid={`sv-no-${v.id}`}>#{v.voucher_no}</TableCell>
                  <TableCell className="text-white text-xs">{fmtDate(v.date)}</TableCell>
                  <TableCell className="text-white text-sm font-medium" data-testid={`sv-party-${v.id}`}>{v.party_name}</TableCell>
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
                  <TableCell>
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
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700 text-white" data-testid="sale-voucher-form">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <FileText className="w-5 h-5" /> New Sale Voucher (बिक्री वाउचर)
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Top Row: Date, Party, Truck, RST */}
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

            {/* Items Section - Tally Style */}
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
                                <SelectItem key={si.name} value={si.name}>
                                  {si.name} ({si.available_qntl} Q)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="p-1">
                          {stock !== null && (
                            <span className={`text-xs font-medium ${stock > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {stock} Q
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="p-1">
                          <Input type="number" step="0.01" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)}
                            className="bg-slate-700 border-slate-600 text-white h-8 text-xs" placeholder="0" data-testid={`sv-item-qty-${idx}`} />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input type="number" step="0.01" value={item.rate} onChange={e => updateItem(idx, 'rate', e.target.value)}
                            className="bg-slate-700 border-slate-600 text-white h-8 text-xs" placeholder="0" data-testid={`sv-item-rate-${idx}`} />
                        </TableCell>
                        <TableCell className="p-1 text-right text-white text-xs font-medium">
                          Rs.{amt.toLocaleString('en-IN')}
                        </TableCell>
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

            {/* Subtotal */}
            <div className="text-right text-sm font-bold text-white">
              Subtotal: Rs.{subtotal.toLocaleString('en-IN')}
            </div>

            {/* GST Section */}
            <div className="border border-slate-600 rounded-lg p-3 space-y-3">
              <Label className="text-xs text-amber-400 font-semibold">GST</Label>
              <div className="grid grid-cols-4 gap-3 items-end">
                <div>
                  <Label className="text-[10px] text-slate-400">GST Type</Label>
                  <Select value={form.gst_type} onValueChange={v => {
                    setForm(p => ({
                      ...p, gst_type: v,
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
                {form.gst_type === 'cgst_sgst' && (
                  <>
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
                  </>
                )}
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
                <IndianRupee className="w-4 h-4 mr-1" /> Save Sale Voucher
              </Button>
              <Button type="button" variant="outline" className="border-slate-600 text-slate-300" onClick={() => setIsFormOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
