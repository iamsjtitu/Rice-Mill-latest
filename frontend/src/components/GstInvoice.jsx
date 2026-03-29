import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Plus, Trash2, Download, Eye, X, Edit2, Send, Save } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const API = `${_isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '')}/api`;

const GST_RATES = [0, 5, 12, 18, 28];
const HSN_CODES = {
  "Rice (Parboiled)": "1006 30 20",
  "Rice (Raw)": "1006 30 10",
  "Paddy": "1006 10 90",
  "Broken Rice": "1006 40 00",
  "Bran (Kunda)": "2302 40 00",
  "Husk (Bhusi)": "2302 40 00",
};

const emptyItem = { name: "", hsn: "", qty: 0, unit: "QNTL", rate: 0, gst_pct: 5 };

function calcItem(it) {
  const taxable = (it.qty || 0) * (it.rate || 0);
  const gst = taxable * (it.gst_pct || 0) / 100;
  return { taxable, gst, total: taxable + gst };
}

function calcTotals(items, is_igst) {
  const taxable = items.reduce((s, it) => s + (it.qty || 0) * (it.rate || 0), 0);
  const gst = items.reduce((s, it) => s + (it.qty || 0) * (it.rate || 0) * (it.gst_pct || 0) / 100, 0);
  return {
    taxable: Math.round(taxable * 100) / 100,
    gst: Math.round(gst * 100) / 100,
    cgst: is_igst ? 0 : Math.round(gst / 2 * 100) / 100,
    sgst: is_igst ? 0 : Math.round(gst / 2 * 100) / 100,
    igst: is_igst ? Math.round(gst * 100) / 100 : 0,
    total: Math.round((taxable + gst) * 100) / 100,
  };
}

// ================ INVOICE FORM ================
function InvoiceForm({ invoice, onSave, onCancel }) {
  const [form, setForm] = useState(invoice || {
    invoice_no: "", date: new Date().toISOString().split("T")[0],
    buyer_name: "", buyer_gstin: "", buyer_address: "", buyer_phone: "",
    is_igst: false, items: [{ ...emptyItem }], notes: "",
  });

  const updateItem = (idx, field, val) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: val };
    if (field === "name" && HSN_CODES[val]) items[idx].hsn = HSN_CODES[val];
    setForm(f => ({ ...f, items }));
  };
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { ...emptyItem }] }));
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const totals = calcTotals(form.items, form.is_igst);

  const handleSave = () => {
    if (!form.invoice_no.trim()) return toast.error("Invoice No. daalein");
    if (!form.buyer_name.trim()) return toast.error("Buyer name daalein");
    if (!form.items.length || !form.items.some(it => it.qty > 0)) return toast.error("Kam se kam 1 item with qty add karein");
    onSave(form);
  };

  return (
    <div className="space-y-4">
      {/* Header Fields */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-slate-400">Invoice No. *</Label>
          <Input value={form.invoice_no} onChange={e => setForm(f => ({ ...f, invoice_no: e.target.value }))}
            placeholder="INV-2026-001" className="bg-slate-800 border-slate-600 text-white h-9" data-testid="gst-inv-no" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Date</Label>
          <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            className="bg-slate-800 border-slate-600 text-white h-9" data-testid="gst-inv-date" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Buyer Phone</Label>
          <Input value={form.buyer_phone} onChange={e => setForm(f => ({ ...f, buyer_phone: e.target.value }))}
            placeholder="9876543210" className="bg-slate-800 border-slate-600 text-white h-9" data-testid="gst-buyer-phone" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-slate-400">Buyer Name *</Label>
          <Input value={form.buyer_name} onChange={e => setForm(f => ({ ...f, buyer_name: e.target.value }))}
            placeholder="Party name" className="bg-slate-800 border-slate-600 text-white h-9" data-testid="gst-buyer-name" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Buyer GSTIN</Label>
          <Input value={form.buyer_gstin} onChange={e => setForm(f => ({ ...f, buyer_gstin: e.target.value }))}
            placeholder="22AAAAA0000A1Z5" className="bg-slate-800 border-slate-600 text-white h-9" data-testid="gst-buyer-gstin" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Buyer Address</Label>
          <Input value={form.buyer_address} onChange={e => setForm(f => ({ ...f, buyer_address: e.target.value }))}
            placeholder="Address" className="bg-slate-800 border-slate-600 text-white h-9" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <label className="text-xs text-slate-400 flex items-center gap-2">
          <input type="checkbox" checked={form.is_igst} onChange={e => setForm(f => ({ ...f, is_igst: e.target.checked }))} className="rounded" />
          IGST (Inter-state)
        </label>
      </div>

      {/* Items Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-700 text-xs">
              <th className="text-left py-2 px-1">Item</th>
              <th className="text-left py-2 px-1 w-24">HSN</th>
              <th className="text-right py-2 px-1 w-20">Qty</th>
              <th className="text-center py-2 px-1 w-16">Unit</th>
              <th className="text-right py-2 px-1 w-24">Rate</th>
              <th className="text-center py-2 px-1 w-16">GST%</th>
              <th className="text-right py-2 px-1 w-24">Total</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {form.items.map((it, idx) => (
              <tr key={idx} className="border-b border-slate-800">
                <td className="py-1 px-1">
                  <select value={it.name} onChange={e => updateItem(idx, "name", e.target.value)}
                    className="bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 w-full text-sm" data-testid={`gst-item-name-${idx}`}>
                    <option value="">Select...</option>
                    {Object.keys(HSN_CODES).map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </td>
                <td className="py-1 px-1">
                  <Input value={it.hsn} onChange={e => updateItem(idx, "hsn", e.target.value)} className="bg-slate-800 border-slate-600 text-white h-8 text-xs" />
                </td>
                <td className="py-1 px-1">
                  <Input type="number" value={it.qty || ""} onChange={e => updateItem(idx, "qty", parseFloat(e.target.value) || 0)}
                    className="bg-slate-800 border-slate-600 text-white h-8 text-right" data-testid={`gst-item-qty-${idx}`} />
                </td>
                <td className="py-1 px-1 text-center">
                  <select value={it.unit} onChange={e => updateItem(idx, "unit", e.target.value)}
                    className="bg-slate-800 border border-slate-600 text-white rounded px-1 py-1 text-xs">
                    <option>QNTL</option><option>KG</option><option>BAG</option><option>PCS</option>
                  </select>
                </td>
                <td className="py-1 px-1">
                  <Input type="number" value={it.rate || ""} onChange={e => updateItem(idx, "rate", parseFloat(e.target.value) || 0)}
                    className="bg-slate-800 border-slate-600 text-white h-8 text-right" data-testid={`gst-item-rate-${idx}`} />
                </td>
                <td className="py-1 px-1 text-center">
                  <select value={it.gst_pct} onChange={e => updateItem(idx, "gst_pct", parseInt(e.target.value))}
                    className="bg-slate-800 border border-slate-600 text-white rounded px-1 py-1 text-xs">
                    {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </td>
                <td className="py-1 px-1 text-right text-emerald-400 font-mono text-xs">Rs.{calcItem(it).total.toLocaleString()}</td>
                <td className="py-1 px-1">
                  {form.items.length > 1 && <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button size="sm" variant="outline" onClick={addItem} className="border-slate-600 text-slate-300" data-testid="gst-add-item">
        <Plus className="w-4 h-4 mr-1" /> Add Item
      </Button>

      {/* Notes */}
      <div>
        <Label className="text-xs text-slate-400">Notes (optional)</Label>
        <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          placeholder="Payment terms, delivery notes..." className="bg-slate-800 border-slate-600 text-white h-9" />
      </div>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="bg-slate-800/50 rounded-lg p-3 w-64 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-slate-400">Taxable:</span><span className="text-white font-mono">Rs.{totals.taxable.toLocaleString()}</span></div>
          {form.is_igst ? (
            <div className="flex justify-between"><span className="text-slate-400">IGST:</span><span className="text-white font-mono">Rs.{totals.igst.toLocaleString()}</span></div>
          ) : (
            <>
              <div className="flex justify-between"><span className="text-slate-400">CGST:</span><span className="text-white font-mono">Rs.{totals.cgst.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">SGST:</span><span className="text-white font-mono">Rs.{totals.sgst.toLocaleString()}</span></div>
            </>
          )}
          <div className="flex justify-between border-t border-slate-600 pt-1 font-bold">
            <span className="text-white">Total:</span><span className="text-emerald-400 font-mono" data-testid="gst-total">Rs.{Math.round(totals.total).toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        {onCancel && <Button size="sm" variant="outline" onClick={onCancel} className="border-slate-600 text-slate-300">Cancel</Button>}
        <Button size="sm" onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700" data-testid="gst-save-btn">
          <Save className="w-4 h-4 mr-1" /> Save Invoice
        </Button>
      </div>
    </div>
  );
}

// ================ MAIN COMPONENT ================
export default function GstInvoice({ filters }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editInvoice, setEditInvoice] = useState(null);
  const [previewId, setPreviewId] = useState(null);

  const fetchInvoices = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters?.kms_year) params.append("kms_year", filters.kms_year);
      if (filters?.season) params.append("season", filters.season);
      const res = await axios.get(`${API}/gst-invoices?${params}`);
      setInvoices(res.data);
    } catch (e) { toast.error("Invoice load error"); }
    setLoading(false);
  }, [filters?.kms_year, filters?.season]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleSave = async (form) => {
    try {
      const payload = { ...form, kms_year: filters?.kms_year || "", season: filters?.season || "" };
      if (editInvoice) {
        await axios.put(`${API}/gst-invoices/${editInvoice.id}`, payload);
        toast.success("Invoice update ho gayi!");
      } else {
        await axios.post(`${API}/gst-invoices`, payload);
        toast.success("Invoice save ho gayi!");
      }
      setShowForm(false);
      setEditInvoice(null);
      fetchInvoices();
    } catch (e) { toast.error(e.response?.data?.detail || "Save error"); }
  };

  const handleDelete = async (inv) => {
    if (!window.confirm(`Invoice ${inv.invoice_no} delete karein?`)) return;
    try {
      await axios.delete(`${API}/gst-invoices/${inv.id}`);
      toast.success("Invoice delete ho gayi!");
      fetchInvoices();
    } catch { toast.error("Delete error"); }
  };

  const handlePdf = (inv) => {
    window.open(`${API}/gst-invoices/${inv.id}/pdf`, '_blank');
  };

  const handleWhatsApp = async (inv) => {
    try {
      const pdfUrl = `${API}/gst-invoices/${inv.id}/pdf`;
      const res = await axios.post(`${API}/whatsapp/send-gst-invoice`, {
        invoice_id: inv.id,
        pdf_url: pdfUrl,
        phone: inv.buyer_phone || "",
      });
      if (res.data.success) toast.success(res.data.message);
      else toast.error(res.data.error || "WhatsApp send fail");
    } catch (e) { toast.error("WhatsApp error"); }
  };

  const handleEdit = (inv) => {
    setEditInvoice(inv);
    setShowForm(true);
  };

  if (loading) return <p className="text-slate-400 text-center py-8">Loading...</p>;

  return (
    <div className="space-y-4" data-testid="gst-invoice-page">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-400" /> GST Invoices
        </h3>
        <Button size="sm" onClick={() => { setEditInvoice(null); setShowForm(true); }} className="bg-blue-600 hover:bg-blue-700" data-testid="gst-new-invoice-btn">
          <Plus className="w-4 h-4 mr-1" /> New Invoice
        </Button>
      </div>

      {/* Invoice List */}
      {invoices.length === 0 && !showForm ? (
        <div className="text-center py-12 text-slate-500">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Koi GST Invoice nahi hai</p>
          <p className="text-xs mt-1">New Invoice button se naya invoice banayein</p>
        </div>
      ) : !showForm && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700 text-xs">
                <th className="text-left py-2 px-2">Invoice No.</th>
                <th className="text-left py-2 px-2">Date</th>
                <th className="text-left py-2 px-2">Buyer</th>
                <th className="text-left py-2 px-2">GSTIN</th>
                <th className="text-right py-2 px-2">Taxable</th>
                <th className="text-right py-2 px-2">GST</th>
                <th className="text-right py-2 px-2">Total</th>
                <th className="text-center py-2 px-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                  <td className="py-2 px-2 font-mono text-blue-300" data-testid={`gst-inv-row-${inv.invoice_no}`}>{inv.invoice_no}</td>
                  <td className="py-2 px-2 text-slate-300">{inv.date}</td>
                  <td className="py-2 px-2 text-white">{inv.buyer_name}</td>
                  <td className="py-2 px-2 text-slate-400 text-xs">{inv.buyer_gstin || "—"}</td>
                  <td className="py-2 px-2 text-right font-mono text-slate-300">Rs.{(inv.totals?.taxable || 0).toLocaleString()}</td>
                  <td className="py-2 px-2 text-right font-mono text-slate-400">Rs.{(inv.totals?.gst || 0).toLocaleString()}</td>
                  <td className="py-2 px-2 text-right font-mono text-emerald-400 font-bold">Rs.{Math.round(inv.totals?.total || 0).toLocaleString()}</td>
                  <td className="py-2 px-2 text-center">
                    <div className="flex gap-1 justify-center">
                      <Button size="sm" variant="ghost" onClick={() => handlePdf(inv)} className="h-7 px-2 text-blue-400 hover:text-blue-300" title="PDF Download" data-testid={`gst-pdf-${inv.invoice_no}`}>
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleWhatsApp(inv)} className="h-7 px-2 text-green-400 hover:text-green-300" title="WhatsApp" data-testid={`gst-wa-${inv.invoice_no}`}>
                        <Send className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(inv)} className="h-7 px-2 text-yellow-400 hover:text-yellow-300" title="Edit" data-testid={`gst-edit-${inv.invoice_no}`}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(inv)} className="h-7 px-2 text-red-400 hover:text-red-300" title="Delete" data-testid={`gst-del-${inv.invoice_no}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoice Form */}
      {showForm && (
        <Card className="bg-slate-900/50 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-blue-400">{editInvoice ? "Edit Invoice" : "New Invoice"}</CardTitle>
          </CardHeader>
          <CardContent>
            <InvoiceForm
              invoice={editInvoice}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditInvoice(null); }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
