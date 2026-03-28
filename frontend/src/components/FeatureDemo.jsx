import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Camera, Mic, MicOff, Plus, Trash2, Download, Eye, X, Image as ImageIcon } from "lucide-react";

// ==================== GST INVOICE DEMO ====================
const GST_RATES = [0, 5, 12, 18, 28];
const HSN_CODES = {
  "Rice (Parboiled)": "1006 30 20",
  "Rice (Raw)": "1006 30 10",
  "Paddy": "1006 10 90",
  "Broken Rice": "1006 40 00",
  "Bran (Kunda)": "2302 40 00",
  "Husk (Bhusi)": "2302 40 00",
};

function GstInvoiceDemo() {
  const [invoice, setInvoice] = useState({
    invoice_no: "INV-2026-001",
    date: new Date().toISOString().split("T")[0],
    buyer_name: "",
    buyer_gstin: "",
    buyer_address: "",
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-emerald-400" /> GST Invoice Generator
        </h3>
        <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-1 rounded">DEMO</span>
      </div>

      {/* Invoice Header */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-slate-400">Invoice No.</label>
          <Input value={invoice.invoice_no} onChange={e => setInvoice({ ...invoice, invoice_no: e.target.value })} className="bg-slate-800 border-slate-600 text-white h-9" />
        </div>
        <div>
          <label className="text-xs text-slate-400">Date</label>
          <Input type="date" value={invoice.date} onChange={e => setInvoice({ ...invoice, date: e.target.value })} className="bg-slate-800 border-slate-600 text-white h-9" />
        </div>
        <div>
          <label className="text-xs text-slate-400">Buyer Name</label>
          <Input placeholder="Party name" value={invoice.buyer_name} onChange={e => setInvoice({ ...invoice, buyer_name: e.target.value })} className="bg-slate-800 border-slate-600 text-white h-9" />
        </div>
        <div>
          <label className="text-xs text-slate-400">Buyer GSTIN</label>
          <Input placeholder="22AAAAA0000A1Z5" value={invoice.buyer_gstin} onChange={e => setInvoice({ ...invoice, buyer_gstin: e.target.value })} className="bg-slate-800 border-slate-600 text-white h-9" />
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
                <tr key={idx} className="border-b border-slate-800">
                  <td className="py-1 px-1">
                    <select value={it.name} onChange={e => updateItem(idx, "name", e.target.value)}
                      className="bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 w-full text-sm">
                      <option value="">Select...</option>
                      {Object.keys(HSN_CODES).map(k => <option key={k} value={k}>{k}</option>)}
                      <option value="custom">Custom</option>
                    </select>
                  </td>
                  <td className="py-1 px-1">
                    <Input value={it.hsn} onChange={e => updateItem(idx, "hsn", e.target.value)} className="bg-slate-800 border-slate-600 text-white h-8 text-xs w-28" />
                  </td>
                  <td className="py-1 px-1">
                    <Input type="number" value={it.qty || ""} onChange={e => updateItem(idx, "qty", parseFloat(e.target.value) || 0)} className="bg-slate-800 border-slate-600 text-white h-8 text-right" />
                  </td>
                  <td className="py-1 px-1 text-center">
                    <select value={it.unit} onChange={e => updateItem(idx, "unit", e.target.value)}
                      className="bg-slate-800 border border-slate-600 text-white rounded px-1 py-1 text-xs">
                      <option>QNTL</option><option>KG</option><option>BAG</option><option>PCS</option>
                    </select>
                  </td>
                  <td className="py-1 px-1">
                    <Input type="number" value={it.rate || ""} onChange={e => updateItem(idx, "rate", parseFloat(e.target.value) || 0)} className="bg-slate-800 border-slate-600 text-white h-8 text-right" />
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

      <Button size="sm" variant="outline" onClick={addItem} className="border-slate-600 text-slate-300">
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
            <span className="text-emerald-400 font-mono text-lg">Rs.{Math.round(totals.total).toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={() => setShowPreview(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Eye className="w-4 h-4 mr-1" /> Preview Invoice
        </Button>
        <Button size="sm" variant="outline" className="border-slate-600 text-slate-300">
          <Download className="w-4 h-4 mr-1" /> PDF Download
        </Button>
      </div>

      {/* Invoice Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowPreview(false)}>
          <div className="bg-white text-black rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
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
                    <tr key={idx}>
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
                <>
                  <p>CGST: Rs.{(totals.gst / 2).toLocaleString()} | SGST: Rs.{(totals.gst / 2).toLocaleString()}</p>
                </>
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

// ==================== PHOTO ATTACHMENT DEMO ====================
function PhotoAttachmentDemo() {
  const [photos, setPhotos] = useState([]);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const fileRef = useRef(null);

  const handleFiles = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotos(prev => [...prev, { name: file.name, size: file.size, dataUrl: ev.target.result }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removePhoto = (idx) => setPhotos(photos.filter((_, i) => i !== idx));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Camera className="w-5 h-5 text-blue-400" /> Photo Attachment (Entry)
        </h3>
        <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-1 rounded">DEMO</span>
      </div>

      {/* Mock Entry Form */}
      <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
        <p className="text-xs text-slate-400 mb-2">Paddy Entry Form (with Photo)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className="text-xs text-slate-400">Truck No</label><Input value="OD-02-AB-1234" readOnly className="bg-slate-800 border-slate-600 text-white h-9" /></div>
          <div><label className="text-xs text-slate-400">Agent</label><Input value="Ram Kumar" readOnly className="bg-slate-800 border-slate-600 text-white h-9" /></div>
          <div><label className="text-xs text-slate-400">Mandi</label><Input value="Kesinga" readOnly className="bg-slate-800 border-slate-600 text-white h-9" /></div>
          <div><label className="text-xs text-slate-400">QNTL</label><Input value="150.50" readOnly className="bg-slate-800 border-slate-600 text-white h-9" /></div>
        </div>

        {/* Photo Section */}
        <div className="border-2 border-dashed border-slate-600 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <Button size="sm" onClick={() => fileRef.current?.click()} className="bg-blue-600 hover:bg-blue-700">
              <Camera className="w-4 h-4 mr-1" /> Photo Upload
            </Button>
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFiles} className="hidden" />
            <span className="text-xs text-slate-400">{photos.length} photo(s) attached</span>
          </div>

          {photos.length > 0 ? (
            <div className="flex gap-3 flex-wrap">
              {photos.map((p, idx) => (
                <div key={idx} className="relative group">
                  <img src={p.dataUrl} alt={p.name} className="w-24 h-24 object-cover rounded-lg border border-slate-600 cursor-pointer hover:border-blue-400 transition-all"
                    onClick={() => setPreviewPhoto(p)} />
                  <button onClick={() => removePhoto(idx)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-3 h-3" />
                  </button>
                  <p className="text-[10px] text-slate-400 mt-1 truncate w-24">{p.name}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-slate-500">
              <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Receipt/Slip ki photo yahan upload karein</p>
            </div>
          )}
        </div>
      </div>

      {/* Full Preview Modal */}
      {previewPhoto && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setPreviewPhoto(null)}>
          <div className="relative max-w-3xl max-h-[90vh]">
            <img src={previewPhoto.dataUrl} alt={previewPhoto.name} className="max-w-full max-h-[85vh] rounded-lg" />
            <button onClick={() => setPreviewPhoto(null)} className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-2">
              <X className="w-5 h-5" />
            </button>
            <p className="text-center text-white text-sm mt-2">{previewPhoto.name}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== VOICE INPUT DEMO ====================
function VoiceInputDemo() {
  const [fields, setFields] = useState({
    truck_no: "", agent: "", mandi: "", kg: "", bags: "", rate: "", moisture: ""
  });
  const [activeField, setActiveField] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef(null);

  const startListening = useCallback((fieldName) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech Recognition is not supported in this browser. Use Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "hi-IN";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
      setActiveField(fieldName);
      setTranscript("");
    };

    recognition.onresult = (event) => {
      let result = "";
      for (let i = 0; i < event.results.length; i++) {
        result += event.results[i][0].transcript;
      }
      setTranscript(result);
      // Convert Hindi numbers to English
      const numMap = { "\u0966": "0", "\u0967": "1", "\u0968": "2", "\u0969": "3", "\u096A": "4", "\u096B": "5", "\u096C": "6", "\u096D": "7", "\u096E": "8", "\u096F": "9" };
      let converted = result;
      Object.entries(numMap).forEach(([h, e]) => { converted = converted.replace(new RegExp(h, "g"), e); });
      // For number fields, extract just numbers
      const numFields = ["kg", "bags", "rate", "moisture"];
      if (numFields.includes(fieldName)) {
        const nums = converted.match(/[\d.]+/);
        if (nums) converted = nums[0];
      }
      setFields(prev => ({ ...prev, [fieldName]: converted.trim() }));
    };

    recognition.onerror = (event) => {
      console.log("Speech error:", event.error);
      setIsListening(false);
      setActiveField(null);
    };

    recognition.onend = () => {
      setIsListening(false);
      setActiveField(null);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
    setActiveField(null);
  };

  const VoiceField = ({ label, name, type = "text", placeholder }) => (
    <div>
      <label className="text-xs text-slate-400">{label}</label>
      <div className="flex gap-1">
        <Input
          type={type}
          value={fields[name]}
          onChange={e => setFields({ ...fields, [name]: e.target.value })}
          placeholder={placeholder}
          className={`bg-slate-800 border-slate-600 text-white h-9 flex-1 ${activeField === name ? "ring-2 ring-red-400 border-red-400" : ""}`}
        />
        <Button
          size="sm"
          onClick={() => isListening && activeField === name ? stopListening() : startListening(name)}
          className={`h-9 w-9 p-0 ${isListening && activeField === name ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-slate-700 hover:bg-slate-600"}`}
          data-testid={`mic-btn-${name}`}
        >
          {isListening && activeField === name ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Mic className="w-5 h-5 text-red-400" /> Hindi Voice Input
        </h3>
        <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-1 rounded">DEMO</span>
      </div>

      {isListening && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-3 animate-pulse">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-ping" />
          <span className="text-red-300 text-sm">Bol rahe hain... "{transcript || "..."}"</span>
        </div>
      )}

      <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
        <p className="text-xs text-slate-400 mb-2">Mic button dabao aur Hindi mein bolo - field auto-fill hoga</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <VoiceField label="Truck No" name="truck_no" placeholder="OD-02-AB-1234" />
          <VoiceField label="Agent" name="agent" placeholder="Agent name bolo" />
          <VoiceField label="Mandi" name="mandi" placeholder="Mandi name bolo" />
          <VoiceField label="KG (Weight)" name="kg" type="number" placeholder="15050" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <VoiceField label="Bags" name="bags" placeholder="150" />
          <VoiceField label="Rate (Rs)" name="rate" type="number" placeholder="1960" />
          <VoiceField label="Moisture %" name="moisture" type="number" placeholder="14.5" />
        </div>
      </div>

      <div className="bg-slate-800/30 rounded-lg p-3 text-xs text-slate-400 space-y-1">
        <p className="font-semibold text-slate-300">Instructions:</p>
        <p>1. Mic button dabao (red ho jayega)</p>
        <p>2. Hindi mein bolo: "Kesinga", "ek sau pachaas", "OD 02 AB 1234"</p>
        <p>3. Number fields mein sirf number extract hoga</p>
        <p>4. Chrome browser mein best kaam karta hai</p>
      </div>
    </div>
  );
}

// ==================== MAIN DEMO PAGE ====================
export default function FeatureDemo() {
  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white">Feature Demo</h2>
        <p className="text-sm text-slate-400 mt-1">Ye sirf demo hai - approve hone ke baad desktop app mein add hoga</p>
      </div>

      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-emerald-400">1. GST Invoice Generator</CardTitle>
        </CardHeader>
        <CardContent>
          <GstInvoiceDemo />
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-blue-400">2. Photo Attachment (Paddy Entry)</CardTitle>
        </CardHeader>
        <CardContent>
          <PhotoAttachmentDemo />
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-red-400">3. Hindi Voice Input</CardTitle>
        </CardHeader>
        <CardContent>
          <VoiceInputDemo />
        </CardContent>
      </Card>
    </div>
  );
}
