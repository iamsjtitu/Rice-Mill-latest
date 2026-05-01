import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Plus, Trash2, Download, Eye, X } from "lucide-react";

const GST_RATES = [0, 5, 12, 18, 28];
const HSN_CODES = {
  "Rice (Parboiled)": "1006 30 20",
  "Rice (Raw)": "1006 30 10",
  "Paddy": "1006 10 90",
  "Broken Rice": "1006 40 00",
  "Bran (Kunda)": "2302 40 00",
  "Husk (Bhusi)": "2302 40 00",
};

export default function FeatureDemo() {
  const [invoice, setInvoice] = useState({
    invoice_no: "INV-2026-001",
    date: new Date().toISOString().split("T")[0],
    buyer_name: "",
    buyer_gstin: "",
    is_igst: false,
    items: [{ name: "Rice (Parboiled)", hsn: "1006 30 20", qty: 0, unit: "QNTL", rate: 0, gst_pct: 5 }],
  });
  const [showPreview, setShowPreview] = useState(false);

  const updateItem = (idx, field, val) => {
    const items = [...invoice.items];
    items[idx] = { ...items[idx], [field]: val };
    if (field === "name" && HSN_CODES[val]) items[idx].hsn = HSN_CODES[val];
    setInvoice({ ...invoice, items });
  };
  const addItem = () => setInvoice({ ...invoice, items: [...invoice.items, { name: "", hsn: "", qty: 0, unit: "QNTL", rate: 0, gst_pct: 5 }] });
  const removeItem = (idx) => setInvoice({ ...invoice, items: invoice.items.filter((_, i) => i !== idx) });

  const calcItem = (it) => {
    const taxable = (it.qty || 0) * (it.rate || 0);
    const gst = taxable * (it.gst_pct || 0) / 100;
    return { taxable, gst, total: taxable + gst };
  };
  const totals = invoice.items.reduce((acc, it) => {
    const c = calcItem(it);
    return { taxable: acc.taxable + c.taxable, gst: acc.gst + c.gst, total: acc.total + c.total };
  }, { taxable: 0, gst: 0, total: 0 });

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white">GST Invoice Generator</h2>
        <p className="text-sm text-slate-400 mt-1">Demo - Approve hone ke baad desktop app mein add hoga</p>
      </div>

      <Card className="bg-slate-900/50 border-slate-700" data-testid="gst-invoice-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base text-emerald-400 flex items-center gap-2">
              <FileText className="w-5 h-5" /> GST Invoice
            </CardTitle>
            <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-1 rounded">DEMO</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Invoice Header */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-slate-400">Invoice No.</label>
              <Input value={invoice.invoice_no} onChange={e => setInvoice({ ...invoice, invoice_no: e.target.value })} className="bg-slate-800 border-slate-600 text-white h-9" data-testid="invoice-no" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Date</label>
              <Input type="date" value={invoice.date} onChange={e => setInvoice({ ...invoice, date: e.target.value })} className="bg-slate-800 border-slate-600 text-white h-9" data-testid="invoice-date" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Buyer Name</label>
              <Input placeholder="Party name" value={invoice.buyer_name} onChange={e => setInvoice({ ...invoice, buyer_name: e.target.value })} className="bg-slate-800 border-slate-600 text-white h-9" data-testid="buyer-name" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Buyer GSTIN</label>
              <Input placeholder="22AAAAA0000A1Z5" value={invoice.buyer_gstin} onChange={e => setInvoice({ ...invoice, buyer_gstin: e.target.value })} className="bg-slate-800 border-slate-600 text-white h-9" data-testid="buyer-gstin" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-400 flex items-center gap-2">
              <input type="checkbox" checked={invoice.is_igst} onChange={e => setInvoice({ ...invoice, is_igst: e.target.checked })} className="rounded" />
              IGST (Inter-state)
            </label>
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700">
                  <th className="text-left py-2 px-1">Item</th>
                  <th className="text-left py-2 px-1">HSN</th>
                  <th className="text-right py-2 px-1 w-20">Qty</th>
                  <th className="text-center py-2 px-1 w-16">Unit</th>
                  <th className="text-right py-2 px-1 w-24">Rate</th>
                  <th className="text-center py-2 px-1 w-20">GST%</th>
                  <th className="text-right py-2 px-1 w-24">Amount</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((it, idx) => {
                  const c = calcItem(it);
                  return (
                    <tr key={`item-${it.name}-${idx}`} className="border-b border-slate-800">
                      <td className="py-1 px-1">
                        <select value={it.name} onChange={e => updateItem(idx, "name", e.target.value)}
                          className="bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 w-full text-sm" data-testid={`item-name-${idx}`}>
                          <option value="">Select...</option>
                          {Object.keys(HSN_CODES).map(k => <option key={k} value={k}>{k}</option>)}
                          <option value="custom">Custom</option>
                        </select>
                      </td>
                      <td className="py-1 px-1">
                        <Input value={it.hsn} onChange={e => updateItem(idx, "hsn", e.target.value)} className="bg-slate-800 border-slate-600 text-white h-8 text-xs w-28" />
                      </td>
                      <td className="py-1 px-1">
                        <Input type="number" value={it.qty || ""} onChange={e => updateItem(idx, "qty", parseFloat(e.target.value) || 0)} className="bg-slate-800 border-slate-600 text-white h-8 text-right" data-testid={`item-qty-${idx}`} />
                      </td>
                      <td className="py-1 px-1 text-center">
                        <select value={it.unit} onChange={e => updateItem(idx, "unit", e.target.value)}
                          className="bg-slate-800 border border-slate-600 text-white rounded px-1 py-1 text-xs">
                          <option>QNTL</option><option>KG</option><option>BAG</option><option>PCS</option>
                        </select>
                      </td>
                      <td className="py-1 px-1">
                        <Input type="number" value={it.rate || ""} onChange={e => updateItem(idx, "rate", parseFloat(e.target.value) || 0)} className="bg-slate-800 border-slate-600 text-white h-8 text-right" data-testid={`item-rate-${idx}`} />
                      </td>
                      <td className="py-1 px-1 text-center">
                        <select value={it.gst_pct} onChange={e => updateItem(idx, "gst_pct", parseInt(e.target.value))}
                          className="bg-slate-800 border border-slate-600 text-white rounded px-1 py-1 text-xs">
                          {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>
                      <td className="py-1 px-1 text-right text-emerald-400 font-mono">Rs.{c.total.toLocaleString()}</td>
                      <td className="py-1 px-1">
                        {invoice.items.length > 1 && (
                          <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Button size="sm" variant="outline" onClick={addItem} className="border-slate-600 text-slate-300" data-testid="add-item-btn">
            <Plus className="w-4 h-4 mr-1" /> Add Item
          </Button>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="bg-slate-800/50 rounded-lg p-3 w-72 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Taxable Amount:</span><span className="text-white font-mono">Rs.{totals.taxable.toLocaleString()}</span></div>
              {invoice.is_igst ? (
                <div className="flex justify-between"><span className="text-slate-400">IGST:</span><span className="text-white font-mono">Rs.{totals.gst.toLocaleString()}</span></div>
              ) : (
                <>
                  <div className="flex justify-between"><span className="text-slate-400">CGST:</span><span className="text-white font-mono">Rs.{(totals.gst / 2).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">SGST:</span><span className="text-white font-mono">Rs.{(totals.gst / 2).toLocaleString()}</span></div>
                </>
              )}
              <div className="flex justify-between border-t border-slate-600 pt-1 font-bold">
                <span className="text-white">Grand Total:</span>
                <span className="text-emerald-400 font-mono text-lg" data-testid="grand-total">Rs.{Math.round(totals.total).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={() => setShowPreview(true)} className="bg-emerald-600 hover:bg-emerald-700" data-testid="preview-invoice-btn">
              <Eye className="w-4 h-4 mr-1" /> Preview Invoice
            </Button>
            <Button size="sm" variant="outline" className="border-slate-600 text-slate-300">
              <Download className="w-4 h-4" /> Download
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowPreview(false)}>
          <div className="bg-white text-black rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto p-6" onClick={e => e.stopPropagation()} data-testid="invoice-preview-modal">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold">NAVKAR AGRO</h2>
                <p className="text-sm text-gray-500">JOLKO, KESINGA</p>
                <p className="text-xs text-gray-400">GSTIN: 21XXXXX0000X1Z5</p>
              </div>
              <div className="text-right">
                <h3 className="text-lg font-bold text-blue-700">TAX INVOICE</h3>
                <p className="text-sm">No: {invoice.invoice_no}</p>
                <p className="text-sm">Date: {invoice.date}</p>
              </div>
            </div>
            <div className="border-t border-b py-2 mb-4 text-sm">
              <p><strong>Bill To:</strong> {invoice.buyer_name || "—"}</p>
              <p>GSTIN: {invoice.buyer_gstin || "—"}</p>
            </div>
            <table className="w-full text-sm mb-4 border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-2 py-1 text-left">#</th>
                  <th className="border px-2 py-1 text-left">Item</th>
                  <th className="border px-2 py-1">HSN</th>
                  <th className="border px-2 py-1 text-right">Qty</th>
                  <th className="border px-2 py-1 text-right">Rate</th>
                  <th className="border px-2 py-1 text-right">Taxable</th>
                  <th className="border px-2 py-1 text-right">GST</th>
                  <th className="border px-2 py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((it, idx) => {
                  const c = calcItem(it);
                  return (
                    <tr key={`prev-${it.name}-${idx}`}>
                      <td className="border px-2 py-1">{idx + 1}</td>
                      <td className="border px-2 py-1">{it.name || "—"}</td>
                      <td className="border px-2 py-1 text-center">{it.hsn}</td>
                      <td className="border px-2 py-1 text-right">{it.qty} {it.unit}</td>
                      <td className="border px-2 py-1 text-right">Rs.{(it.rate || 0).toLocaleString()}</td>
                      <td className="border px-2 py-1 text-right">Rs.{c.taxable.toLocaleString()}</td>
                      <td className="border px-2 py-1 text-right">Rs.{c.gst.toLocaleString()}</td>
                      <td className="border px-2 py-1 text-right font-bold">Rs.{c.total.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 font-bold">
                <tr>
                  <td colSpan={5} className="border px-2 py-1 text-right">Total:</td>
                  <td className="border px-2 py-1 text-right">Rs.{totals.taxable.toLocaleString()}</td>
                  <td className="border px-2 py-1 text-right">Rs.{totals.gst.toLocaleString()}</td>
                  <td className="border px-2 py-1 text-right text-blue-700">Rs.{Math.round(totals.total).toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
            <div className="text-sm space-y-1 mb-4">
              {invoice.is_igst ? (
                <p>IGST: Rs.{totals.gst.toLocaleString()}</p>
              ) : (
                <p>CGST: Rs.{(totals.gst / 2).toLocaleString()} | SGST: Rs.{(totals.gst / 2).toLocaleString()}</p>
              )}
              <p className="font-bold text-lg">Grand Total: Rs.{Math.round(totals.total).toLocaleString()}</p>
            </div>
            <div className="flex justify-between text-xs text-gray-400 border-t pt-2">
              <span>Computer Generated Invoice</span>
              <span>NAVKAR AGRO - Mill Entry System</span>
            </div>
            <div className="mt-4 flex justify-end">
              <Button size="sm" onClick={() => setShowPreview(false)} className="bg-gray-200 text-gray-800 hover:bg-gray-300">Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
