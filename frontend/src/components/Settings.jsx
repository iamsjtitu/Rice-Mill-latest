import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Trash2, Plus, Calculator, RefreshCw, Key, FileText,
  AlertCircle, HardDrive, ShieldCheck, Send, Package, Scale,
  Camera, CameraOff, Eye, EyeOff, Wifi, CheckCircle,
} from "lucide-react";
import { useConfirm } from "@/components/ConfirmProvider";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

// ---- Stock Items for Opening Stock ----
const STOCK_ITEMS = [
  { key: "paddy", label: "Paddy / धान", unit: "Qntl" },
  { key: "rice_usna", label: "Rice Usna / उसना चावल", unit: "Qntl" },
  { key: "rice_raw", label: "Rice Raw / कच्चा चावल", unit: "Qntl" },
  { key: "bran", label: "Bran / भूसी", unit: "Qntl" },
  { key: "kunda", label: "Kunda / कुंडा", unit: "Qntl" },
  { key: "broken", label: "Broken / टूटा", unit: "Qntl" },
  { key: "kanki", label: "Kanki / कंकी", unit: "Qntl" },
  { key: "husk", label: "Husk / छिलका", unit: "Qntl" },
  { key: "frk", label: "FRK", unit: "Qntl" },
];

// ======================= SUB-TAB COMPONENTS =======================

// ---- Branding Tab ----
function BrandingTab({ user, onBrandingUpdate }) {
  const [brandingForm, setBrandingForm] = useState({ company_name: "", tagline: "", custom_fields: [] });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    axios.get(`${API}/branding`).then(r => {
      const data = { ...r.data, custom_fields: r.data.custom_fields || [] };
      setBrandingForm(data);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const handleSave = async () => {
    try {
      const res = await axios.put(`${API}/branding?username=${user.username}&role=${user.role}`, brandingForm);
      if (res.data.success) {
        onBrandingUpdate({ ...brandingForm });
        toast.success("Branding update ho gaya!");
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Branding update mein error");
    }
  };

  if (!loaded) return null;

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-purple-400 flex items-center gap-2">
          <Key className="w-5 h-5" />
          Branding / ब्रांडिंग
        </CardTitle>
        <p className="text-slate-400 text-sm">
          Yahan se app ka naam, tagline aur extra fields change karein. Ye header, footer, PDF aur Excel exports mein dikhega.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div>
            <Label className="text-slate-300 text-lg">Company Name / कंपनी का नाम</Label>
            <Input
              value={brandingForm.company_name}
              onChange={(e) => setBrandingForm(prev => ({ ...prev, company_name: e.target.value }))}
              placeholder="Enter company name"
              className="bg-slate-700 border-slate-600 text-white text-xl font-bold mt-2"
              data-testid="branding-company-name"
            />
            <p className="text-xs text-slate-500 mt-1">Example: NAVKAR AGRO, XYZ TRADERS, ABC MILL</p>
          </div>
          <div>
            <Label className="text-slate-300 text-lg">Tagline / विवरण</Label>
            <Input
              value={brandingForm.tagline}
              onChange={(e) => setBrandingForm(prev => ({ ...prev, tagline: e.target.value }))}
              placeholder="Enter tagline"
              className="bg-slate-700 border-slate-600 text-white mt-2"
              data-testid="branding-tagline"
            />
            <p className="text-xs text-slate-500 mt-1">Example: JOLKO, KESINGA - Mill Entry System</p>
          </div>
        </div>

        {/* Custom Fields Section */}
        <div className="border border-slate-600 rounded-lg p-4 bg-slate-900/50 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-amber-400 text-sm font-semibold">Extra Fields (PDF / Excel Header में दिखेंगे)</Label>
            {(brandingForm.custom_fields || []).length < 6 && (
              <Button
                size="sm" variant="outline"
                className="border-amber-600 text-amber-400 hover:bg-amber-900/30 text-xs"
                onClick={() => setBrandingForm(prev => ({
                  ...prev,
                  custom_fields: [...(prev.custom_fields || []), { label: "", value: "", position: "center", placement: "below" }]
                }))}
                data-testid="add-custom-field-btn"
              >
                <Plus className="w-3 h-3 mr-1" /> Field Add
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-500">Max 6 fields. GST Number, Phone, Address jaise details add karein.</p>

          {(brandingForm.custom_fields || []).map((cf, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end" data-testid={`custom-field-row-${idx}`}>
              <div className="col-span-3">
                {idx === 0 && <Label className="text-slate-400 text-xs mb-1 block">Label (optional)</Label>}
                <Input
                  value={cf.label}
                  onChange={(e) => {
                    const updated = [...brandingForm.custom_fields];
                    updated[idx] = { ...updated[idx], label: e.target.value };
                    setBrandingForm(prev => ({ ...prev, custom_fields: updated }));
                  }}
                  placeholder="GSTIN, Phone..."
                  className="bg-slate-700 border-slate-600 text-white text-sm h-9"
                  data-testid={`custom-field-label-${idx}`}
                />
              </div>
              <div className="col-span-3">
                {idx === 0 && <Label className="text-slate-400 text-xs mb-1 block">Value</Label>}
                <Input
                  value={cf.value}
                  onChange={(e) => {
                    const updated = [...brandingForm.custom_fields];
                    updated[idx] = { ...updated[idx], value: e.target.value };
                    setBrandingForm(prev => ({ ...prev, custom_fields: updated }));
                  }}
                  placeholder="Value enter karein..."
                  className="bg-slate-700 border-slate-600 text-white text-sm h-9"
                  data-testid={`custom-field-value-${idx}`}
                />
              </div>
              <div className="col-span-2">
                {idx === 0 && <Label className="text-slate-400 text-xs mb-1 block">Position</Label>}
                <Select
                  value={cf.position || "center"}
                  onValueChange={(v) => {
                    const updated = [...brandingForm.custom_fields];
                    updated[idx] = { ...updated[idx], position: v };
                    setBrandingForm(prev => ({ ...prev, custom_fields: updated }));
                  }}
                >
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-9 text-xs" data-testid={`custom-field-position-${idx}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="left" className="text-white">Left</SelectItem>
                    <SelectItem value="center" className="text-white">Center</SelectItem>
                    <SelectItem value="right" className="text-white">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                {idx === 0 && <Label className="text-slate-400 text-xs mb-1 block">Placement</Label>}
                <Select
                  value={cf.placement || "below"}
                  onValueChange={(v) => {
                    const updated = [...brandingForm.custom_fields];
                    updated[idx] = { ...updated[idx], placement: v };
                    setBrandingForm(prev => ({ ...prev, custom_fields: updated }));
                  }}
                >
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-9 text-xs" data-testid={`custom-field-placement-${idx}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="above" className="text-white">Name ke Upar</SelectItem>
                    <SelectItem value="below" className="text-white">Name ke Neeche</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1 flex justify-center">
                <Button
                  size="sm" variant="ghost"
                  className="text-red-400 hover:bg-red-900/30 h-9 w-9 p-0"
                  onClick={() => {
                    const updated = brandingForm.custom_fields.filter((_, i) => i !== idx);
                    setBrandingForm(prev => ({ ...prev, custom_fields: updated }));
                  }}
                  data-testid={`custom-field-delete-${idx}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}

          {(brandingForm.custom_fields || []).length === 0 && (
            <p className="text-slate-500 text-xs text-center py-2">Koi extra field nahi hai. "Field Add" button se add karein.</p>
          )}
        </div>

        {/* Preview */}
        <div className="border border-slate-600 rounded-lg p-4 bg-slate-900/50">
          <p className="text-xs text-slate-400 mb-2">Preview / झलक (PDF Header jaisa dikhega):</p>
          {(brandingForm.custom_fields || []).filter(f => f.value && f.placement === 'above').length > 0 && (
            <div className="flex justify-between text-xs text-slate-300 border-b border-slate-700 pb-2 mb-2">
              <div className="text-left">
                {(brandingForm.custom_fields || []).filter(f => f.position === 'left' && f.placement === 'above' && f.value).map((f, i) => (
                  <div key={i}>{f.label ? <><span className="font-semibold">{f.label}:</span> {f.value}</> : f.value}</div>
                ))}
              </div>
              <div className="text-center">
                {(brandingForm.custom_fields || []).filter(f => f.position === 'center' && f.placement === 'above' && f.value).map((f, i) => (
                  <div key={i}>{f.label ? <><span className="font-semibold">{f.label}:</span> {f.value}</> : f.value}</div>
                ))}
              </div>
              <div className="text-right">
                {(brandingForm.custom_fields || []).filter(f => f.position === 'right' && f.placement === 'above' && f.value).map((f, i) => (
                  <div key={i}>{f.label ? <><span className="font-semibold">{f.label}:</span> {f.value}</> : f.value}</div>
                ))}
              </div>
            </div>
          )}
          <div className="text-center border-b border-slate-700 pb-2 mb-2">
            <h2 className="text-2xl font-bold text-amber-400">{brandingForm.company_name || "Company Name"}</h2>
            <p className="text-slate-400 text-sm">{brandingForm.tagline || "Tagline"}</p>
          </div>
          {(brandingForm.custom_fields || []).filter(f => f.value && (f.placement || 'below') === 'below').length > 0 && (
            <div className="flex justify-between text-xs text-slate-300 border-b border-slate-700 pb-2">
              <div className="text-left">
                {(brandingForm.custom_fields || []).filter(f => f.position === 'left' && (f.placement || 'below') === 'below' && f.value).map((f, i) => (
                  <div key={i}>{f.label ? <><span className="font-semibold">{f.label}:</span> {f.value}</> : f.value}</div>
                ))}
              </div>
              <div className="text-center">
                {(brandingForm.custom_fields || []).filter(f => f.position === 'center' && (f.placement || 'below') === 'below' && f.value).map((f, i) => (
                  <div key={i}>{f.label ? <><span className="font-semibold">{f.label}:</span> {f.value}</> : f.value}</div>
                ))}
              </div>
              <div className="text-right">
                {(brandingForm.custom_fields || []).filter(f => f.position === 'right' && (f.placement || 'below') === 'below' && f.value).map((f, i) => (
                  <div key={i}>{f.label ? <><span className="font-semibold">{f.label}:</span> {f.value}</> : f.value}</div>
                ))}
              </div>
            </div>
          )}
        </div>
        <Button
          onClick={handleSave}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold"
          data-testid="save-branding-btn"
        >
          Save Branding / ब्रांडिंग सेव करें
        </Button>
      </CardContent>
    </Card>
  );
}

// ---- GST Tab ----
function GSTTab() {
  return (
    <div className="space-y-6">
      {/* GST Rate Settings */}
      <Card className="bg-slate-800 border-slate-700" data-testid="gst-settings-section">
        <CardHeader>
          <CardTitle className="text-blue-400 flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            GST Settings / जीएसटी सेटिंग्स
          </CardTitle>
          <p className="text-slate-400 text-sm">
            Default GST rates set karein. Ye Sale Book mein automatically apply hoga.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <GSTSettingsForm />
        </CardContent>
      </Card>

      {/* GST Company Details */}
      <Card className="bg-slate-800 border-slate-700" data-testid="gst-company-settings-section">
        <CardHeader>
          <CardTitle className="text-indigo-400 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            GST Invoice Company Details / जीएसटी इनवॉइस कंपनी
          </CardTitle>
          <p className="text-slate-400 text-sm">
            GST Invoice PDF mein ye company details dikhegi. Vouchers tab se invoice banayein.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <GstCompanyForm />
        </CardContent>
      </Card>
    </div>
  );
}

function GSTSettingsForm() {
  const [gst, setGst] = useState({ cgst_percent: 0, sgst_percent: 0, igst_percent: 0 });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    axios.get(`${API}/gst-settings`).then(r => { setGst(r.data); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);
  const save = async () => {
    try {
      await axios.put(`${API}/gst-settings`, gst);
      toast.success("GST settings save ho gayi!");
    } catch { toast.error("GST save error"); }
  };
  if (!loaded) return null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label className="text-slate-300">CGST %</Label>
          <Input type="number" step="0.01" value={gst.cgst_percent} onChange={e => setGst(p => ({ ...p, cgst_percent: parseFloat(e.target.value) || 0 }))}
            className="bg-slate-700 border-slate-600 text-white" data-testid="gst-cgst" />
        </div>
        <div>
          <Label className="text-slate-300">SGST %</Label>
          <Input type="number" step="0.01" value={gst.sgst_percent} onChange={e => setGst(p => ({ ...p, sgst_percent: parseFloat(e.target.value) || 0 }))}
            className="bg-slate-700 border-slate-600 text-white" data-testid="gst-sgst" />
        </div>
        <div>
          <Label className="text-slate-300">IGST %</Label>
          <Input type="number" step="0.01" value={gst.igst_percent} onChange={e => setGst(p => ({ ...p, igst_percent: parseFloat(e.target.value) || 0 }))}
            className="bg-slate-700 border-slate-600 text-white" data-testid="gst-igst" />
        </div>
      </div>
      <Button onClick={save} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold" data-testid="save-gst-btn">
        Save GST Settings / जीएसटी सेव करें
      </Button>
    </div>
  );
}

function GstCompanyForm() {
  const [data, setData] = useState({ company_name: "", gstin: "", address: "", state_code: "21", state_name: "Odisha", phone: "", bank_name: "", bank_account: "", bank_ifsc: "" });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    axios.get(`${API}/gst-company-settings`).then(r => { setData(r.data); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);
  const save = async () => {
    try {
      await axios.put(`${API}/gst-company-settings`, data);
      toast.success("GST Company settings save ho gayi!");
    } catch { toast.error("Save error"); }
  };
  if (!loaded) return null;
  const f = (key, label, placeholder) => (
    <div key={key}>
      <Label className="text-slate-300">{label}</Label>
      <Input value={data[key]} onChange={e => setData(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder}
        className="bg-slate-700 border-slate-600 text-white" data-testid={`gst-co-${key}`} />
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {f("company_name", "Company Name", "Navkar Agro")}
        {f("gstin", "GSTIN", "21AAAAA0000A1Z5")}
        {f("address", "Address", "Jolko, Kesinga")}
        {f("state_code", "State Code", "21")}
        {f("state_name", "State Name", "Odisha")}
        {f("phone", "Phone", "9876543210")}
      </div>
      <p className="text-xs text-slate-500 mt-2">Bank Details (Invoice PDF mein dikhega)</p>
      <div className="grid grid-cols-3 gap-3">
        {f("bank_name", "Bank Name", "SBI")}
        {f("bank_account", "Account No.", "12345678901")}
        {f("bank_ifsc", "IFSC Code", "SBIN0001234")}
      </div>
      <Button onClick={save} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold" data-testid="save-gst-company-btn">
        Save GST Company Settings / जीएसटी कंपनी सेव करें
      </Button>
    </div>
  );
}

// ---- Stock Tab ----
function StockTab({ kmsYear, user }) {
  const [stocks, setStocks] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [carrying, setCarrying] = useState(false);

  useEffect(() => {
    const fetchStock = async () => {
      try {
        const params = new URLSearchParams();
        if (kmsYear) params.append('kms_year', kmsYear);
        const res = await axios.get(`${API}/opening-stock?${params}`);
        setStocks(res.data?.stocks || {});
      } catch { setStocks({}); }
      setLoaded(true);
    };
    fetchStock();
  }, [kmsYear]);

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/opening-stock?username=${user.username}&role=${user.role}`, { kms_year: kmsYear, stocks });
      toast.success("Opening stock save ho gaya!");
    } catch (e) { toast.error(e.response?.data?.detail || "Save error"); }
    setSaving(false);
  };

  const carryForward = async () => {
    const parts = kmsYear.split('-');
    if (parts.length !== 2) return;
    const prevKms = `${parseInt(parts[0]) - 1}-${parseInt(parts[1]) - 1}`;
    setCarrying(true);
    try {
      const res = await axios.post(`${API}/opening-stock/carry-forward?username=${user.username}&role=${user.role}`, {
        source_kms_year: prevKms, target_kms_year: kmsYear,
      });
      if (res.data.success) {
        setStocks(res.data.data?.stocks || {});
        toast.success(`${prevKms} ka closing stock → ${kmsYear} ka opening stock carry forward ho gaya!`);
      }
    } catch (e) { toast.error(e.response?.data?.detail || "Carry forward error"); }
    setCarrying(false);
  };

  if (!loaded) return null;

  return (
    <Card className="bg-slate-800 border-slate-700" data-testid="opening-stock-section">
      <CardHeader>
        <CardTitle className="text-orange-400 flex items-center gap-2">
          <Package className="w-5 h-5" />
          Opening Stock Balance / शुरुआती स्टॉक
        </CardTitle>
        <p className="text-slate-400 text-sm">
          FY year ke liye opening stock (Qntl) set karein. Ye stock calculations mein use hoga.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">FY: <span className="text-amber-400 font-bold">{kmsYear}</span></p>
            <Button
              onClick={carryForward} disabled={carrying} size="sm" variant="outline"
              className="border-cyan-600 text-cyan-400 hover:bg-cyan-900/30 text-xs"
              data-testid="carry-forward-btn"
            >
              {carrying ? 'Processing...' : 'Auto Carry Forward (Previous Year Closing → OB)'}
            </Button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
            {STOCK_ITEMS.map(item => (
              <div key={item.key}>
                <Label className="text-slate-300 text-xs">{item.label}</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number" step="0.01"
                    value={stocks[item.key] || ""}
                    onChange={e => setStocks(prev => ({ ...prev, [item.key]: e.target.value }))}
                    placeholder="0"
                    className="bg-slate-700 border-slate-600 text-white text-sm h-8"
                    data-testid={`opening-stock-${item.key}`}
                  />
                  <span className="text-slate-500 text-xs">{item.unit}</span>
                </div>
              </div>
            ))}
          </div>
          <Button onClick={save} disabled={saving} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold" data-testid="save-opening-stock-btn">
            {saving ? 'Saving...' : 'Save Opening Stock / शुरुआती स्टॉक सेव करें'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Messaging Tab (WhatsApp + Telegram) ----
function MessagingTab() {
  // WhatsApp state
  const [waSettings, setWaSettings] = useState({ api_key: "", country_code: "91", enabled: false, api_key_masked: "", default_numbers: [], default_group_id: "", default_group_name: "", group_schedule_enabled: false, group_schedule_time: "" });
  const [waForm, setWaForm] = useState({ api_key: "", country_code: "91", default_numbers: "", default_group_id: "", default_group_name: "", group_schedule_enabled: false, group_schedule_time: "", enabled: false });
  const [waTestPhone, setWaTestPhone] = useState("");
  const [waLoading, setWaLoading] = useState(false);
  const [waGroups, setWaGroups] = useState([]);
  const [waGroupsLoading, setWaGroupsLoading] = useState(false);

  // Telegram state
  const [telegramConfig, setTelegramConfig] = useState({ bot_token: "", chat_ids: [], schedule_time: "21:00", enabled: false });
  const [telegramLogs, setTelegramLogs] = useState([]);
  const [telegramLoading, setTelegramLoading] = useState(false);

  const fetchWaSettings = async () => {
    try {
      const res = await axios.get(`${API}/whatsapp/settings`);
      setWaSettings(res.data);
      setWaForm({
        api_key: res.data.api_key || "",
        country_code: res.data.country_code || "91",
        default_numbers: (res.data.default_numbers || []).join(", "),
        default_group_id: res.data.default_group_id || "",
        default_group_name: res.data.default_group_name || "",
        group_schedule_enabled: res.data.group_schedule_enabled || false,
        group_schedule_time: res.data.group_schedule_time || "",
        enabled: res.data.enabled || false
      });
    } catch (e) { console.error("WA settings fetch error:", e); }
  };

  const fetchTelegramConfig = async () => {
    try { const res = await axios.get(`${API}/telegram/config`); setTelegramConfig(res.data); } catch {}
  };
  const fetchTelegramLogs = async () => {
    try { const res = await axios.get(`${API}/telegram/logs`); setTelegramLogs(res.data); } catch {}
  };

  useEffect(() => {
    fetchWaSettings();
    fetchWaGroups();
    fetchTelegramConfig();
    fetchTelegramLogs();
  }, []);

  const fetchWaGroups = async () => {
    setWaGroupsLoading(true);
    try {
      const res = await axios.get(`${API}/whatsapp/groups`);
      if (res.data.success) setWaGroups(res.data.groups || []);
    } catch {}
    setWaGroupsLoading(false);
  };

  const handleSaveTelegramConfig = async () => {
    setTelegramLoading(true);
    try {
      const res = await axios.post(`${API}/telegram/config`, telegramConfig);
      toast.success(res.data.message || "Telegram config save ho gayi!");
      fetchTelegramConfig();
      window.dispatchEvent(new Event("messaging-config-changed"));
    } catch (e) { toast.error(e.response?.data?.detail || "Telegram config save nahi hua"); }
    setTelegramLoading(false);
  };

  const handleTestTelegram = async () => {
    setTelegramLoading(true);
    try {
      const res = await axios.post(`${API}/telegram/test`, {
        bot_token: telegramConfig.bot_token, chat_ids: telegramConfig.chat_ids
      });
      toast.success(res.data.message || "Test message bhej diya!");
    } catch (e) { toast.error(e.response?.data?.detail || "Test message nahi gaya"); }
    setTelegramLoading(false);
  };

  const handleSendReportNow = async () => {
    setTelegramLoading(true);
    try {
      const res = await axios.post(`${API}/telegram/send-report`, {
        date: new Date().toISOString().split('T')[0]
      });
      if (res.data.success) {
        toast.success(res.data.message || "Report bhej diya!");
      } else {
        const failed = (res.data.details || []).filter(d => !d.ok).map(d => `${d.label}: ${d.error}`).join(', ');
        toast.error(`Failed: ${failed || res.data.message}`);
      }
      fetchTelegramLogs();
    } catch (e) { toast.error(e.response?.data?.detail || "Report nahi gaya"); }
    setTelegramLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* WhatsApp Integration */}
      <Card className="bg-slate-800 border-slate-700" data-testid="whatsapp-section">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-green-400 flex items-center gap-2">
              <Send className="w-5 h-5" />
              WhatsApp Integration / व्हाट्सएप
            </CardTitle>
            <div className="flex items-center gap-3 cursor-pointer select-none" data-testid="wa-master-toggle">
              <span className={`text-sm font-bold ${waForm.enabled ? 'text-green-400' : 'text-red-400'}`}>
                {waForm.enabled ? 'ON' : 'OFF'}
              </span>
              <div className="relative" onClick={async () => {
                const newEnabled = !waForm.enabled;
                setWaForm(prev => ({ ...prev, enabled: newEnabled }));
                try {
                  await axios.put(`${API}/whatsapp/settings`, {
                    api_key: waForm.api_key, country_code: waForm.country_code,
                    enabled: newEnabled,
                    default_numbers: waForm.default_numbers,
                    default_group_id: waForm.default_group_id, default_group_name: waForm.default_group_name,
                    group_schedule_enabled: waForm.group_schedule_enabled, group_schedule_time: waForm.group_schedule_time
                  });
                  window.dispatchEvent(new Event("messaging-config-changed"));
                  toast.success(newEnabled ? "WhatsApp ON!" : "WhatsApp OFF!");
                } catch { toast.error("Save fail!"); setWaForm(prev => ({ ...prev, enabled: !newEnabled })); }
              }}>
                <div className={`w-12 h-6 rounded-full transition-colors ${waForm.enabled ? 'bg-green-600' : 'bg-slate-600'}`} />
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${waForm.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </div>
            </div>
          </div>
          <p className="text-slate-400 text-sm">
            {waForm.enabled ? 'WhatsApp buttons sab jagah dikhenge. OFF karo toh chhup jayenge.' : 'WhatsApp OFF hai - sab buttons chhupe hain. ON karein aur Save karein.'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Status */}
          <div className={`p-3 rounded-lg border ${waSettings.enabled && waSettings.api_key ? 'bg-green-900/30 border-green-700' : 'bg-slate-700/50 border-slate-600'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`font-semibold text-sm ${waSettings.enabled && waSettings.api_key ? 'text-green-400' : 'text-slate-400'}`}>
                  {waSettings.enabled && waSettings.api_key ? 'WhatsApp Connected' : 'WhatsApp Not Connected'}
                </p>
                {waSettings.api_key_masked && <p className="text-slate-400 text-xs mt-1">API Key: {waSettings.api_key_masked}</p>}
              </div>
              <p className="text-slate-400 text-xs">
                Country: +{waSettings.country_code || '91'} | Numbers: {(waSettings.default_numbers || []).length || 'None'} | Group: {waSettings.default_group_name || 'Not set'} {waSettings.group_schedule_enabled ? `| Auto: ${waSettings.group_schedule_time}` : ''}
              </p>
            </div>
          </div>

          {/* API Key Input */}
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-8">
              <Label className="text-slate-400 text-xs mb-1 block">360Messenger API Key</Label>
              <Input type="password" value={waForm.api_key}
                onChange={(e) => setWaForm(prev => ({ ...prev, api_key: e.target.value }))}
                placeholder="API key paste karein..."
                className="bg-slate-700 border-slate-600 text-white text-sm" data-testid="wa-api-key-input" />
            </div>
            <div className="col-span-4">
              <Label className="text-slate-400 text-xs mb-1 block">Country Code</Label>
              <Input value={waForm.country_code}
                onChange={(e) => setWaForm(prev => ({ ...prev, country_code: e.target.value }))}
                placeholder="91"
                className="bg-slate-700 border-slate-600 text-white text-sm" data-testid="wa-country-code-input" />
            </div>
          </div>

          {/* Default Numbers */}
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">Default Numbers (comma se alag karein)</Label>
            <Input value={waForm.default_numbers}
              onChange={(e) => setWaForm(prev => ({ ...prev, default_numbers: e.target.value }))}
              placeholder="9876543210, 9876543211"
              className="bg-slate-700 border-slate-600 text-white text-sm" data-testid="wa-default-numbers-input" />
            <p className="text-slate-500 text-xs mt-1">Ye numbers pe directly message jayega bina prompt ke.</p>
          </div>

          {/* Default Group for "Send to Group" */}
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">Default WhatsApp Group (Send to Group ke liye)</Label>
            <div className="flex items-center gap-2">
              <select
                value={waForm.default_group_id}
                onChange={(e) => {
                  const gId = e.target.value;
                  const gName = waGroups.find(g => g.id === gId)?.name || "";
                  setWaForm(prev => ({ ...prev, default_group_id: gId, default_group_name: gName }));
                }}
                className="flex-1 bg-slate-700 border border-slate-600 text-white text-sm rounded-md px-3 py-2"
                data-testid="wa-default-group-select"
              >
                <option value="">-- Group select karein --</option>
                {waGroups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <Button variant="ghost" size="sm" onClick={fetchWaGroups} disabled={waGroupsLoading} className="text-slate-400 shrink-0" data-testid="wa-refresh-groups">
                <RefreshCw className={`w-4 h-4 ${waGroupsLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            {waForm.default_group_name && <p className="text-green-400 text-xs mt-1">Selected: {waForm.default_group_name}</p>}
            <p className="text-slate-500 text-xs mt-1">Ye group har jagah "Send to Group" mein auto-select hoga.</p>
          </div>

          {/* Auto Schedule - Daily Report to Group */}
          {waForm.default_group_id && (
            <div className="p-3 rounded-lg border border-slate-600 bg-slate-700/30 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-slate-300 text-sm font-medium">Auto Daily Report → Group</Label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={waForm.group_schedule_enabled}
                    onChange={(e) => setWaForm(prev => ({ ...prev, group_schedule_enabled: e.target.checked }))}
                    className="w-4 h-4 rounded accent-green-500" data-testid="wa-schedule-toggle" />
                  <span className={`text-xs font-semibold ${waForm.group_schedule_enabled ? 'text-green-400' : 'text-slate-500'}`}>
                    {waForm.group_schedule_enabled ? 'ON' : 'OFF'}
                  </span>
                </label>
              </div>
              {waForm.group_schedule_enabled && (
                <div className="flex items-center gap-3">
                  <Label className="text-slate-400 text-xs shrink-0">Time:</Label>
                  <Input type="time" value={waForm.group_schedule_time}
                    onChange={(e) => setWaForm(prev => ({ ...prev, group_schedule_time: e.target.value }))}
                    className="bg-slate-700 border-slate-600 text-white text-sm w-36" data-testid="wa-schedule-time" />
                  <p className="text-slate-500 text-xs">Roz is time pe daily report {waForm.default_group_name || 'group'} mein jayegi</p>
                </div>
              )}
            </div>
          )}

          <Button
            onClick={async () => {
              try {
                setWaLoading(true);
                await axios.put(`${API}/whatsapp/settings`, {
                  api_key: waForm.api_key, country_code: waForm.country_code,
                  enabled: waForm.enabled,
                  default_numbers: waForm.default_numbers,
                  default_group_id: waForm.default_group_id, default_group_name: waForm.default_group_name,
                  group_schedule_enabled: waForm.group_schedule_enabled, group_schedule_time: waForm.group_schedule_time
                });
                toast.success("WhatsApp settings save ho gayi!");
                fetchWaSettings();
                window.dispatchEvent(new Event("messaging-config-changed"));
              } catch { toast.error("Save fail!"); }
              finally { setWaLoading(false); }
            }}
            disabled={waLoading || !waForm.api_key}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
            data-testid="wa-save-btn"
          >
            Save WhatsApp Settings
          </Button>

          {/* Test Message */}
          {waSettings.enabled && waSettings.api_key && (
            <div className="border border-slate-600 rounded-lg p-4 bg-slate-900/50">
              <p className="text-slate-300 text-sm font-semibold mb-2">Test Message / टेस्ट मैसेज</p>
              <div className="flex gap-2">
                <Input value={waTestPhone}
                  onChange={(e) => setWaTestPhone(e.target.value)}
                  placeholder="Phone number (e.g. 9876543210)"
                  className="bg-slate-700 border-slate-600 text-white text-sm flex-1" data-testid="wa-test-phone" />
                <Button
                  onClick={async () => {
                    if (!waTestPhone) { toast.error("Phone number daalein"); return; }
                    try {
                      setWaLoading(true);
                      const res = await axios.post(`${API}/whatsapp/test`, { phone: waTestPhone });
                      if (res.data.success) toast.success("Test message bhej diya!");
                      else toast.error(res.data.error || "Test fail");
                    } catch (e) { toast.error(e.response?.data?.detail || "Test fail"); }
                    finally { setWaLoading(false); }
                  }}
                  disabled={waLoading} variant="outline"
                  className="border-green-600 text-green-400 hover:bg-green-900/30" data-testid="wa-test-btn"
                >
                  {waLoading ? 'Sending...' : 'Send Test'}
                </Button>
              </div>
            </div>
          )}

          <div className="text-center text-slate-500 text-xs">
            <p>360Messenger API use hota hai | <a href="https://360messenger.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">360messenger.com</a></p>
          </div>
        </CardContent>
      </Card>

      {/* Telegram Bot */}
      <Card className="bg-slate-800 border-slate-700" data-testid="telegram-section">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-blue-400 flex items-center gap-2">
              <Send className="w-5 h-5" />
              Telegram Bot - Daily Report
            </CardTitle>
            <div className="flex items-center gap-3 cursor-pointer select-none" data-testid="tg-master-toggle">
              <span className={`text-sm font-bold ${telegramConfig.enabled ? 'text-blue-400' : 'text-red-400'}`}>
                {telegramConfig.enabled ? 'ON' : 'OFF'}
              </span>
              <div className="relative" onClick={() => setTelegramConfig(prev => ({ ...prev, enabled: !prev.enabled }))}>
                <div className={`w-12 h-6 rounded-full transition-colors ${telegramConfig.enabled ? 'bg-blue-600' : 'bg-slate-600'}`} />
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${telegramConfig.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </div>
            </div>
          </div>
          <p className="text-slate-400 text-sm">
            {telegramConfig.enabled ? 'Telegram buttons dikhenge + auto schedule ON' : 'Telegram OFF hai - sab buttons chhupe hain. ON karein aur Save karein.'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Bot Token */}
          <div>
            <Label className="text-slate-300">Bot Token</Label>
            <Input
              value={telegramConfig.bot_token}
              onChange={(e) => setTelegramConfig(prev => ({ ...prev, bot_token: e.target.value }))}
              placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v..."
              className="bg-slate-700 border-slate-600 text-white mt-1 font-mono text-sm"
              type="password" data-testid="telegram-bot-token" />
            <p className="text-xs text-slate-500 mt-1">@BotFather se milega. /newbot command use karein.</p>
          </div>

          {/* Bot Info */}
          {telegramConfig.bot_name && (
            <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3">
              <p className="text-blue-400 text-sm font-semibold">Connected Bot: {telegramConfig.bot_name}</p>
              {telegramConfig.bot_username && <p className="text-blue-300 text-xs">@{telegramConfig.bot_username}</p>}
            </div>
          )}

          {/* Recipients */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-slate-300 font-semibold">Recipients ({(telegramConfig.chat_ids || []).length})</Label>
              <Button
                onClick={() => setTelegramConfig(prev => ({ ...prev, chat_ids: [...(prev.chat_ids || []), { chat_id: "", label: "" }] }))}
                variant="outline" size="sm"
                className="border-blue-600 text-blue-400 hover:bg-blue-900/30 h-7 text-xs"
                data-testid="telegram-add-recipient"
              >
                <Plus className="w-3 h-3 mr-1" /> Add Recipient
              </Button>
            </div>
            <p className="text-xs text-slate-500">Individual users, groups ya channels - sabko report bhej sakte hain</p>

            {(telegramConfig.chat_ids || []).length === 0 && (
              <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-4 text-center text-slate-400 text-sm">
                Koi recipient nahi hai. "Add Recipient" click karein.
              </div>
            )}

            {(telegramConfig.chat_ids || []).map((item, idx) => (
              <div key={idx} className="flex gap-2 items-center bg-slate-700/30 p-2 rounded-lg border border-slate-600" data-testid={`telegram-recipient-${idx}`}>
                <div className="flex-1">
                  <Input
                    value={item.label}
                    onChange={(e) => {
                      const updated = [...(telegramConfig.chat_ids || [])];
                      updated[idx] = { ...updated[idx], label: e.target.value };
                      setTelegramConfig(prev => ({ ...prev, chat_ids: updated }));
                    }}
                    placeholder="Name (Owner, Accountant, Group...)"
                    className="bg-slate-700 border-slate-600 text-white h-8 text-xs mb-1"
                    data-testid={`telegram-recipient-label-${idx}`}
                  />
                  <Input
                    value={item.chat_id}
                    onChange={(e) => {
                      const updated = [...(telegramConfig.chat_ids || [])];
                      updated[idx] = { ...updated[idx], chat_id: e.target.value };
                      setTelegramConfig(prev => ({ ...prev, chat_ids: updated }));
                    }}
                    placeholder="Chat ID (e.g. 123456789 ya -100...)"
                    className="bg-slate-700 border-slate-600 text-white h-8 text-xs font-mono"
                    data-testid={`telegram-recipient-id-${idx}`}
                  />
                </div>
                <Button
                  onClick={() => {
                    const updated = (telegramConfig.chat_ids || []).filter((_, i) => i !== idx);
                    setTelegramConfig(prev => ({ ...prev, chat_ids: updated }));
                  }}
                  variant="ghost" size="sm"
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/20 h-8 w-8 p-0"
                  data-testid={`telegram-recipient-remove-${idx}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* Schedule Time */}
          <div>
            <Label className="text-slate-300">Schedule Time / समय</Label>
            <Input
              type="time" value={telegramConfig.schedule_time}
              onChange={(e) => setTelegramConfig(prev => ({ ...prev, schedule_time: e.target.value }))}
              className="bg-slate-700 border-slate-600 text-white mt-1"
              data-testid="telegram-schedule-time" />
            <p className="text-xs text-slate-500 mt-1">Roz is time pe report bhejega (jab Telegram ON ho)</p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handleSaveTelegramConfig}
              disabled={telegramLoading || !telegramConfig.bot_token || !(telegramConfig.chat_ids || []).some(c => c.chat_id)}
              className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="telegram-save-btn"
            >
              {telegramLoading ? 'Saving...' : 'Save Config'}
            </Button>
            <Button
              onClick={handleTestTelegram}
              disabled={telegramLoading || !telegramConfig.bot_token || !(telegramConfig.chat_ids || []).some(c => c.chat_id)}
              variant="outline" className="border-blue-600 text-blue-400 hover:bg-blue-900/30" data-testid="telegram-test-btn"
            >
              Test Message
            </Button>
            <Button
              onClick={handleSendReportNow}
              disabled={telegramLoading || !telegramConfig.bot_token || !(telegramConfig.chat_ids || []).some(c => c.chat_id)}
              variant="outline" className="border-green-600 text-green-400 hover:bg-green-900/30" data-testid="telegram-send-now-btn"
            >
              <Send className="w-4 h-4 mr-1" /> Send Report Now
            </Button>
          </div>

          {/* Recent Logs */}
          {telegramLogs.length > 0 && (
            <div className="space-y-2">
              <p className="text-slate-300 text-sm font-semibold">Recent Sends:</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {telegramLogs.map((log, idx) => (
                  <div key={idx} className={`flex items-center justify-between text-xs p-2 rounded ${log.status === 'success' ? 'bg-green-900/20 border border-green-800/30' : 'bg-red-900/20 border border-red-800/30'}`} data-testid={`telegram-log-${idx}`}>
                    <span className="text-slate-300">{log.date} - {log.type === 'scheduled' ? 'Auto' : 'Manual'}{log.sent_to ? ` (${log.sent_to}/${log.total})` : ''}</span>
                    <span className={log.status === 'success' ? 'text-green-400' : 'text-red-400'}>
                      {log.status === 'success' ? 'Sent' : 'Failed'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Setup Guide */}
          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-xs text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">Setup Guide:</p>
            <p>1. Telegram mein @BotFather search karein, /newbot command bhejein</p>
            <p>2. Jo Token mile wo upar paste karein</p>
            <p>3. Bot ko start karein ya group mein add karein</p>
            <p>4. @userinfobot se apna Chat ID lein, group ke liye @getidsbot use karein</p>
            <p>5. "Add Recipient" se naam aur Chat ID add karein (multiple log add kar sakte hain)</p>
            <p>6. "Test Message" se verify karein, phir Save karein</p>
          </div>
        </CardContent>
      </Card>

      {/* Auto Vehicle Weight Messaging */}
      <AutoVWMessagingCard />
    </div>
  );
}

// ---- Auto Vehicle Weight Messaging Card ----
function AutoVWMessagingCard() {
  const [enabled, setEnabled] = useState(false);
  const [waGroupId, setWaGroupId] = useState('');
  const [waGroupName, setWaGroupName] = useState('');
  const [tgChatIds, setTgChatIds] = useState([]);
  const [newTgName, setNewTgName] = useState('');
  const [newTgChatId, setNewTgChatId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [waGroups, setWaGroups] = useState([]);
  const [waGroupsLoading, setWaGroupsLoading] = useState(false);

  useEffect(() => {
    axios.get(`${API}/vehicle-weight/auto-notify-setting`)
      .then(r => {
        setEnabled(r.data.enabled || false);
        setWaGroupId(r.data.wa_group_id || '');
        setWaGroupName(r.data.wa_group_name || '');
        setTgChatIds(r.data.tg_chat_ids || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const fetchWaGroups = async () => {
    setWaGroupsLoading(true);
    try {
      const res = await axios.get(`${API}/whatsapp/groups`);
      if (res.data.success) setWaGroups(res.data.groups || []);
    } catch {}
    setWaGroupsLoading(false);
  };

  const toggle = async () => {
    const newVal = !enabled;
    setEnabled(newVal);
    try {
      await axios.put(`${API}/vehicle-weight/auto-notify-setting`, { enabled: newVal });
      toast.success(newVal ? "Auto VW Messaging ON" : "Auto VW Messaging OFF");
    } catch { toast.error("Setting save error"); setEnabled(!newVal); }
  };

  const saveGroupConfig = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/vehicle-weight/auto-notify-setting`, {
        wa_group_id: waGroupId,
        wa_group_name: waGroupName,
        tg_chat_ids: tgChatIds,
      });
      toast.success("VW Messaging group config save ho gaya!");
    } catch { toast.error("Save error"); }
    setSaving(false);
  };

  const addTgChatId = () => {
    if (!newTgChatId.trim()) return;
    setTgChatIds(prev => [...prev, { name: newTgName.trim() || `Chat ${prev.length + 1}`, chat_id: newTgChatId.trim() }]);
    setNewTgName('');
    setNewTgChatId('');
  };

  const removeTgChatId = (idx) => {
    setTgChatIds(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <Card className="bg-slate-800 border-slate-700" data-testid="auto-vw-messaging-section">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-amber-400 flex items-center gap-2">
            <Scale className="w-5 h-5" />
            Auto Vehicle Weight Messaging
          </CardTitle>
          <div className="flex items-center gap-3 cursor-pointer select-none" data-testid="auto-vw-toggle">
            <span className={`text-sm font-bold ${enabled ? 'text-amber-400' : 'text-red-400'}`}>
              {loading ? '...' : enabled ? 'ON' : 'OFF'}
            </span>
            <div className="relative" onClick={toggle}>
              <div className={`w-12 h-6 rounded-full transition-colors ${enabled ? 'bg-amber-600' : 'bg-slate-600'}`} />
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </div>
          </div>
        </div>
        <p className="text-slate-400 text-sm mt-1">
          {enabled
            ? 'Weight complete hote hi WhatsApp Group + Telegram par auto message + camera photos jayega.'
            : 'OFF hai — weight complete hone par koi auto message nahi jayega.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* WhatsApp Group for VW */}
        <div className="space-y-2">
          <Label className="text-green-400 text-sm font-bold">WhatsApp Group (VW ke liye alag)</Label>
          <div className="flex gap-2">
            <Input
              value={waGroupId}
              onChange={e => setWaGroupId(e.target.value)}
              placeholder="WhatsApp Group ID"
              className="bg-slate-900 border-slate-600 text-white text-sm flex-1"
              data-testid="vw-wa-group-id"
            />
            <Button size="sm" onClick={fetchWaGroups} disabled={waGroupsLoading}
              className="bg-green-700 hover:bg-green-600 text-white text-xs" data-testid="vw-fetch-wa-groups">
              {waGroupsLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Load Groups'}
            </Button>
          </div>
          {waGroupName && <p className="text-green-400 text-xs">Selected: {waGroupName}</p>}
          {waGroups.length > 0 && (
            <div className="max-h-32 overflow-y-auto space-y-1 bg-slate-900/50 rounded p-2">
              {waGroups.map((g, i) => (
                <div key={i}
                  className={`text-xs p-1.5 rounded cursor-pointer ${waGroupId === g.id ? 'bg-green-900/50 text-green-300 border border-green-600' : 'text-slate-300 hover:bg-slate-700'}`}
                  onClick={() => { setWaGroupId(g.id); setWaGroupName(g.name || g.id); }}
                  data-testid={`vw-wa-group-option-${i}`}>
                  {g.name || g.id}
                </div>
              ))}
            </div>
          )}
          <p className="text-slate-500 text-xs">Ye group set nahi kiya toh default WhatsApp numbers mai jayega.</p>
        </div>

        {/* Telegram Group for VW */}
        <div className="space-y-2">
          <Label className="text-blue-400 text-sm font-bold">Telegram Chat IDs (VW ke liye alag)</Label>
          {tgChatIds.length > 0 && (
            <div className="space-y-1">
              {tgChatIds.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-900/50 p-2 rounded text-xs">
                  <span className="text-blue-300 flex-1">{item.name}</span>
                  <span className="text-slate-400 font-mono">{item.chat_id}</span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400 hover:text-red-600"
                    onClick={() => removeTgChatId(idx)} data-testid={`vw-tg-remove-${idx}`}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={newTgName}
              onChange={e => setNewTgName(e.target.value)}
              placeholder="Name"
              className="bg-slate-900 border-slate-600 text-white text-sm w-1/3"
              data-testid="vw-tg-new-name"
            />
            <Input
              value={newTgChatId}
              onChange={e => setNewTgChatId(e.target.value)}
              placeholder="Chat ID (e.g. -1001234567890)"
              className="bg-slate-900 border-slate-600 text-white text-sm flex-1"
              data-testid="vw-tg-new-chatid"
            />
            <Button size="sm" onClick={addTgChatId}
              className="bg-blue-700 hover:bg-blue-600 text-white text-xs" data-testid="vw-tg-add-btn">
              <Plus className="w-3 h-3" />
            </Button>
          </div>
          <p className="text-slate-500 text-xs">Ye set nahi kiya toh default Telegram config mai jayega. Bot Token same rahega jo upar set hai.</p>
        </div>

        {/* Save Button */}
        <Button onClick={saveGroupConfig} disabled={saving}
          className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold" data-testid="vw-save-group-config">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
          Save VW Group Config
        </Button>

        <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600 text-xs text-slate-400 space-y-1">
          <p>* Jab second weight capture hota hai, auto message + camera photos jayega</p>
          <p>* WhatsApp Group set hai toh usmai jayega, nahi toh default numbers mai</p>
          <p>* Telegram Chat IDs set hai toh usmai jayega, nahi toh default config mai</p>
          <p>* Photos: 1st Weight Front/Side + 2nd Weight Front/Side (Telegram mai photo, WhatsApp mai text + photo URL)</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Weighbridge Configuration Card ----
function WeighbridgeConfigCard() {
  const isElectronApp = typeof window !== 'undefined' && window.electronAPI?.serialGetConfig;
  const [config, setConfig] = useState({
    enabled: false, port: 'COM4', baudRate: 2400,
    dataBits: 8, parity: 'none', stopBits: 1, autoConnect: true
  });
  const [ports, setPorts] = useState([]);
  const [status, setStatus] = useState({ connected: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isElectronApp) { setLoading(false); return; }
    Promise.all([
      window.electronAPI.serialGetConfig(),
      window.electronAPI.serialListPorts(),
      window.electronAPI.serialGetStatus()
    ]).then(([cfg, portsList, st]) => {
      if (cfg) setConfig(cfg);
      setPorts(portsList || []);
      setStatus(st || { connected: false });
      setLoading(false);
    }).catch(() => setLoading(false));

    window.electronAPI.onSerialStatus((s) => setStatus(s));
    return () => window.electronAPI.removeSerialListeners();
  }, [isElectronApp]);

  const saveConfig = async () => {
    try {
      await window.electronAPI.serialSaveConfig(config);
      toast.success("Weighbridge config saved!");
    } catch { toast.error("Save error"); }
  };

  const handleConnect = () => {
    window.electronAPI.serialConnect(config);
    toast.info(`Connecting to ${config.port}...`);
  };
  const handleDisconnect = () => {
    window.electronAPI.serialDisconnect();
    toast.info("Disconnected");
  };

  if (!isElectronApp) {
    return (
      <Card className="bg-slate-800 border-slate-700" data-testid="weighbridge-config-section">
        <CardHeader>
          <CardTitle className="text-purple-400 flex items-center gap-2">
            <Scale className="w-5 h-5" /> Weighbridge Configuration
          </CardTitle>
          <p className="text-slate-400 text-sm mt-1">
            Serial Port configuration sirf Desktop App (Electron) mai available hai. Web version mai Simulator chalega.
          </p>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800 border-slate-700" data-testid="weighbridge-config-section">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-purple-400 flex items-center gap-2">
            <Scale className="w-5 h-5" /> Weighbridge Configuration
          </CardTitle>
          <div className={`flex items-center gap-2 text-sm font-bold ${status.connected ? 'text-green-400' : 'text-red-400'}`}>
            <div className={`w-2 h-2 rounded-full ${status.connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            {status.connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p className="text-slate-400 text-sm">Loading...</p> : (
          <>
            <div className="flex items-center gap-3">
              <label className="text-slate-300 text-sm">Enable Weighbridge</label>
              <div className="relative cursor-pointer" onClick={() => {
                setConfig(p => {
                  const updated = { ...p, enabled: !p.enabled };
                  // Auto-save when toggling enabled/disabled
                  if (window.electronAPI?.serialSaveConfig) {
                    window.electronAPI.serialSaveConfig(updated).catch(() => {});
                  }
                  if (!updated.enabled && window.electronAPI?.serialDisconnect) {
                    window.electronAPI.serialDisconnect();
                  }
                  return updated;
                });
              }}>
                <div className={`w-10 h-5 rounded-full transition-colors ${config.enabled ? 'bg-purple-600' : 'bg-slate-600'}`} />
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${config.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </div>
            {config.enabled && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">COM Port</Label>
                    <Select value={config.port} onValueChange={v => setConfig(p => ({ ...p, port: v }))}>
                      <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ports.length > 0 ? ports.map(p => (
                          <SelectItem key={p.path} value={p.path}>{p.path} {p.manufacturer ? `(${p.manufacturer})` : ''}</SelectItem>
                        )) : ['COM1','COM2','COM3','COM4','COM5','COM6','COM7','COM8'].map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Baud Rate</Label>
                    <Select value={String(config.baudRate)} onValueChange={v => setConfig(p => ({ ...p, baudRate: Number(v) }))}>
                      <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1200, 2400, 4800, 9600, 19200, 38400].map(b => (
                          <SelectItem key={b} value={String(b)}>{b}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Data Bits</Label>
                    <Select value={String(config.dataBits)} onValueChange={v => setConfig(p => ({ ...p, dataBits: Number(v) }))}>
                      <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[7, 8].map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Parity</Label>
                    <Select value={config.parity} onValueChange={v => setConfig(p => ({ ...p, parity: v }))}>
                      <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['none', 'even', 'odd'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Stop Bits</Label>
                    <Select value={String(config.stopBits)} onValueChange={v => setConfig(p => ({ ...p, stopBits: Number(v) }))}>
                      <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2].map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex items-center gap-2 mb-1">
                      <input type="checkbox" checked={config.autoConnect} onChange={e => setConfig(p => ({ ...p, autoConnect: e.target.checked }))}
                        className="w-4 h-4 rounded border-slate-500" />
                      <Label className="text-slate-400 text-xs">Auto Connect</Label>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveConfig} className="bg-purple-600 hover:bg-purple-500 text-white text-xs h-8">
                    Save Config
                  </Button>
                  {!status.connected ? (
                    <Button onClick={handleConnect} className="bg-green-600 hover:bg-green-500 text-white text-xs h-8">
                      Connect
                    </Button>
                  ) : (
                    <Button onClick={handleDisconnect} variant="outline" className="border-red-500 text-red-400 hover:bg-red-500/10 text-xs h-8">
                      Disconnect
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DataTab({ user }) {
  const showConfirm = useConfirm();
  const [healthResult, setHealthResult] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [backups, setBackups] = useState([]);
  const [backupStatus, setBackupStatus] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);

  const fetchBackups = async () => {
    try {
      const res = await axios.get(`${API}/backups`);
      setBackups(res.data.backups || []);
      setBackupStatus(res.data);
    } catch { setBackupStatus(null); }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await axios.post(`${API}/backups`);
      toast.success(res.data.message || "Backup ban gaya!");
      fetchBackups();
    } catch (e) { toast.error("Backup mein error: " + (e.response?.data?.detail || e.message)); }
    setBackupLoading(false);
  };

  const handleRestoreBackup = async (filename) => {
    const ok = await showConfirm("Restore Backup", `Kya aap "${filename}" se data restore karna chahte hain? Current data replace ho jaayega.`);
    if (!ok) return;
    setBackupLoading(true);
    try {
      const res = await axios.post(`${API}/backups/restore`, { filename });
      toast.success(res.data.message || "Restore ho gaya!");
      window.location.reload();
    } catch (e) { toast.error("Restore mein error: " + (e.response?.data?.detail || e.message)); }
    setBackupLoading(false);
  };

  const handleDeleteBackup = async (filename) => {
    const ok = await showConfirm("Delete Backup", `Kya aap "${filename}" backup delete karna chahte hain?`);
    if (!ok) return;
    try {
      await axios.delete(`${API}/backups/${filename}`);
      toast.success("Backup delete ho gaya");
      fetchBackups();
    } catch { toast.error("Delete mein error"); }
  };

  return (
    <div className="space-y-6">
      {/* Data Health Check */}
      <Card className="bg-slate-800 border-slate-700" data-testid="data-health-section">
        <CardHeader>
          <CardTitle className="text-emerald-400 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Data Health Check / डेटा हेल्थ चेक
          </CardTitle>
          <p className="text-slate-400 text-sm">
            Auto-fix run karein - missing ledger entries, wrong accounts, orphan data sab automatically fix ho jayega.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {healthResult && (
            <div className={`p-4 rounded-lg border ${healthResult.total_fixes > 0 ? 'bg-amber-900/30 border-amber-700' : 'bg-green-900/30 border-green-700'}`}>
              <p className={`font-semibold text-sm ${healthResult.total_fixes > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                {healthResult.total_fixes > 0 ? `${healthResult.total_fixes} issues fix kiye` : 'Sab theek hai - koi issue nahi!'}
              </p>
              {healthResult.details && Object.entries(healthResult.details).map(([k, v]) =>
                v > 0 ? <p key={k} className="text-slate-400 text-xs mt-1">{k.replace(/_/g, ' ')}: {v}</p> : null
              )}
              {healthResult.ran_at && <p className="text-slate-500 text-xs mt-2">Last run: {new Date(healthResult.ran_at).toLocaleString('en-IN')}</p>}
            </div>
          )}
          <Button
            onClick={async () => {
              try {
                setHealthLoading(true);
                const res = await axios.post(`${API}/cash-book/auto-fix`);
                setHealthResult({ ...res.data, ran_at: new Date().toISOString() });
              } catch (e) { console.error(e); }
              finally { setHealthLoading(false); }
            }}
            disabled={healthLoading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            data-testid="run-health-check-btn"
          >
            {healthLoading ? 'Checking...' : 'Run Health Check / हेल्थ चेक चलाएं'}
          </Button>
        </CardContent>
      </Card>

      {/* Backup Section */}
      <Card className="bg-slate-800 border-slate-700" data-testid="backup-section">
        <CardHeader>
          <CardTitle className="text-green-400 flex items-center gap-2">
            <HardDrive className="w-5 h-5" />
            Data Backup / डेटा बैकअप
          </CardTitle>
          <p className="text-slate-400 text-sm">
            Backup Now se server folder mein save hoga. ZIP Download se apne computer mein download hoga. Auto backup har din hota hai.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Backup Status */}
          {backupStatus && (
            <div className={`p-3 rounded-lg border ${backupStatus.has_today_backup ? 'bg-green-900/30 border-green-700' : 'bg-amber-900/30 border-amber-700'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`font-semibold text-sm ${backupStatus.has_today_backup ? 'text-green-400' : 'text-amber-400'}`}>
                    {backupStatus.has_today_backup ? 'Aaj ka backup hai' : 'Aaj ka backup nahi liya!'}
                  </p>
                  {backups.length > 0 && (
                    <p className="text-slate-400 text-xs mt-1">
                      Last backup: {new Date(backups[0].created_at).toLocaleString('en-IN')} ({backups[0].size_readable})
                    </p>
                  )}
                </div>
                <p className="text-slate-400 text-sm">{backups.length} / {backupStatus.max_backups} backups</p>
              </div>
            </div>
          )}

          {/* Backup Now */}
          <Button
            onClick={handleCreateBackup} disabled={backupLoading}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
            data-testid="create-backup-btn"
          >
            {backupLoading ? 'Backup ho raha hai...' : 'Backup Now / अभी बैकअप लें'}
          </Button>

          {/* Saved Backups */}
          {backups.length > 0 && (
            <div className="space-y-2">
              <p className="text-slate-300 text-sm font-semibold">Saved Backups (Last {backupStatus?.max_backups || 7}):</p>
              {backups.map((b) => (
                <div key={b.filename} className="flex items-center justify-between bg-slate-700/50 p-3 rounded-lg border border-slate-600" data-testid={`backup-item-${b.filename}`}>
                  <div>
                    <p className="text-white text-sm font-mono">{b.filename}</p>
                    <p className="text-slate-400 text-xs">{new Date(b.created_at).toLocaleString('en-IN')} | {b.size_readable}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleRestoreBackup(b.filename)} disabled={backupLoading} className="text-blue-400 border-blue-600 hover:bg-blue-900/30 text-xs" data-testid={`restore-btn-${b.filename}`}>Restore</Button>
                    <Button size="sm" variant="outline" onClick={() => handleDeleteBackup(b.filename)} className="text-red-400 border-red-600 hover:bg-red-900/30 text-xs" data-testid={`delete-backup-btn-${b.filename}`}>Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ZIP Download */}
          <div className="border border-slate-600 rounded-lg p-4 bg-slate-900/50">
            <p className="text-slate-300 text-sm font-semibold mb-2">ZIP Download / ज़िप डाउनलोड</p>
            <p className="text-slate-500 text-xs mb-3">Computer mein ZIP file download hogi - email ya drive mein share kar sakte hain.</p>
            <Button
              onClick={async () => {
                try {
                  setBackupLoading(true);
                  const response = await fetch(`${API}/backup/download?username=${user.username}&role=${user.role}`);
                  if (!response.ok) throw new Error("Download fail");
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `mill_backup_${new Date().toISOString().slice(0, 10)}.zip`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  setTimeout(() => window.URL.revokeObjectURL(url), 30000);
                  toast.success("Backup ZIP download ho gaya!");
                } catch (e) { toast.error("Download fail: " + e.message); }
                finally { setBackupLoading(false); }
              }}
              disabled={backupLoading} variant="outline"
              className="w-full border-green-600 text-green-400 hover:bg-green-900/30 font-semibold"
              data-testid="download-backup-btn"
            >
              {backupLoading ? 'Downloading...' : 'Download ZIP / ज़िप डाउनलोड'}
            </Button>
          </div>

          {/* ZIP Restore */}
          <div className="border border-slate-600 rounded-lg p-4 bg-slate-900/50">
            <p className="text-slate-300 text-sm font-semibold mb-2">ZIP se Restore / ज़िप से रिस्टोर</p>
            <p className="text-red-400 text-xs mb-3">Warning: Current data replace ho jayega! Pehle backup le lein.</p>
            <input
              type="file" accept=".zip" id="backup-restore-input" className="hidden"
              data-testid="restore-file-input"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!file.name.endsWith('.zip')) { toast.error("Sirf ZIP file upload karein"); return; }
                if (!await showConfirm("Restore Data", "Kya aap sure hain? Current data replace ho jayega!")) { e.target.value = ''; return; }
                try {
                  setBackupLoading(true);
                  const formData = new FormData();
                  formData.append('file', file);
                  const res = await axios.post(`${API}/backup/restore?username=${user.username}&role=${user.role}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                  });
                  toast.success(res.data.message || "Restore ho gaya!");
                } catch (err) { toast.error(err.response?.data?.detail || "Restore fail!"); }
                finally { setBackupLoading(false); e.target.value = ''; }
              }}
            />
            <Button
              onClick={() => document.getElementById('backup-restore-input')?.click()}
              disabled={backupLoading} variant="outline"
              className="w-full border-amber-600 text-amber-400 hover:bg-amber-900/30 font-semibold"
              data-testid="restore-backup-btn"
            >
              {backupLoading ? 'Restoring...' : 'Upload ZIP & Restore / ज़िप अपलोड करके रिस्टोर'}
            </Button>
          </div>

          <div className="text-center text-slate-500 text-xs">
            <p>Auto Backup: Har din automatically hota hai | Max {backupStatus?.max_backups || 7} backups save hote hain | Location: data/backups/</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ======================= ERROR LOG TAB =======================
function ErrorLogTab() {
  const [errorLog, setErrorLog] = useState("");

  const fetchErrorLog = async () => {
    try {
      const res = await axios.get(`${API}/error-log`);
      setErrorLog(res.data.content || "");
    } catch { setErrorLog(""); }
  };

  useEffect(() => { fetchErrorLog(); }, []);

  return (
    <div className="space-y-4">
      <Card className="bg-slate-800 border-slate-700" data-testid="error-log-section">
        <CardHeader>
          <CardTitle className="text-red-400 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Error Log / त्रुटि लॉग
          </CardTitle>
          <p className="text-slate-400 text-sm">
            App ke errors yahan dikhte hain. Ye Desktop version mein kaam karta hai.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button onClick={fetchErrorLog} variant="outline" size="sm"
              className="border-red-600 text-red-400 hover:bg-red-900/30" data-testid="refresh-error-log-btn">
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh Log
            </Button>
            <Button
              onClick={async () => {
                try {
                  await fetch(`${API}/error-log`, { method: 'DELETE' });
                  setErrorLog("Log clear ho gaya. Koi error nahi hai.");
                } catch (e) { console.error(e); }
              }}
              variant="outline" size="sm"
              className="border-amber-600 text-amber-400 hover:bg-amber-900/30" data-testid="clear-error-log-btn">
              <Trash2 className="w-4 h-4 mr-1" /> Clear Log
            </Button>
          </div>
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 max-h-64 overflow-y-auto">
            <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono" data-testid="error-log-content">
              {errorLog || "Koi error log nahi hai."}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ======================= CAMERA SETUP TAB =======================
function CameraSetupTab() {
  const [camType, setCamType] = useState("ip"); // "ip", "usb", or "vigi"
  const [frontUrl, setFrontUrl] = useState("");
  const [sideUrl, setSideUrl] = useState("");
  const [frontPreview, setFrontPreview] = useState(false);
  const [sidePreview, setSidePreview] = useState(false);
  const [frontError, setFrontError] = useState(false);
  const [sideError, setSideError] = useState(false);
  // USB state
  const [devices, setDevices] = useState([]);
  const [frontId, setFrontId] = useState("");
  const [sideId, setSideId] = useState("");
  const [previewStream, setPreviewStream] = useState({ front: null, side: null });
  const frontRef = useRef(null);
  const sideRef = useRef(null);
  // VIGI NVR state
  const [vigiIp, setVigiIp] = useState("");
  const [vigiUser, setVigiUser] = useState("admin");
  const [vigiPass, setVigiPass] = useState("");
  const [vigiFrontCh, setVigiFrontCh] = useState("");
  const [vigiSideCh, setVigiSideCh] = useState("");
  const [vigiFrontIp, setVigiFrontIp] = useState("");
  const [vigiSideIp, setVigiSideIp] = useState("");
  const [vigiTesting, setVigiTesting] = useState(false);
  const [vigiTestResult, setVigiTestResult] = useState(null);
  // Image cleanup state
  const [cleanupDays, setCleanupDays] = useState(0);
  const [cleanupLoading, setCleanupLoading] = useState(false);

  // Get display URL - use proxy for RTSP
  const getPreviewUrl = (url) => {
    if (!url) return "";
    if (url.toLowerCase().startsWith("rtsp://")) {
      return `${API}/camera-stream?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  const [diagResult, setDiagResult] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const diagnoseCam = async (url) => {
    if (!url) { toast.error("URL daalo pehle"); return; }
    setDiagLoading(true); setDiagResult(null);
    try {
      const r = await axios.get(`${API}/camera-check?url=${encodeURIComponent(url)}`, { timeout: 30000 });
      setDiagResult(r.data);
    } catch (e) { setDiagResult({ error: e.message }); }
    setDiagLoading(false);
  };

  const [vigiDiagResult, setVigiDiagResult] = useState(null);
  const [vigiDiagLoading, setVigiDiagLoading] = useState(false);
  const diagnoseVigi = async () => {
    const ip = vigiFrontIp || vigiSideIp || vigiIp;
    if (!ip) { toast.error("Camera/NVR IP daalo pehle"); return; }
    setVigiDiagLoading(true); setVigiDiagResult(null);
    try {
      const ch = vigiFrontIp ? '1' : (vigiFrontCh || '1');
      const r = await axios.get(`${API}/vigi-diagnose?ip=${encodeURIComponent(ip)}&username=${encodeURIComponent(vigiUser)}&password=${encodeURIComponent(vigiPass)}&channel=${ch}`, { timeout: 30000 });
      setVigiDiagResult(r.data);
    } catch (e) { setVigiDiagResult({ error: e.message }); }
    setVigiDiagLoading(false);
  };

  // Load saved config
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('camera_config') || '{}');
      const type = saved.type || "ip";
      setCamType(type);
      if (type === "ip") {
        setFrontUrl(saved.frontUrl || "");
        setSideUrl(saved.sideUrl || "");
      } else if (type === "vigi") {
        setVigiIp(saved.vigiIp || "");
        setVigiUser(saved.vigiUser || "admin");
        setVigiPass(saved.vigiPass || "");
        setVigiFrontCh(saved.vigiFrontChannel || "");
        setVigiSideCh(saved.vigiSideChannel || "");
        setVigiFrontIp(saved.vigiFrontIp || "");
        setVigiSideIp(saved.vigiSideIp || "");
      } else {
        if (saved.frontId) setFrontId(saved.frontId);
        if (saved.sideId) setSideId(saved.sideId);
      }
    } catch { /* ignore */ }
    axios.get(`${API}/settings/image-cleanup`).then(r => {
      setCleanupDays(r.data.days || 0);
    }).catch(() => {});
  }, []);

  const loadDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true }).then(s => s.getTracks().forEach(t => t.stop()));
      const all = await navigator.mediaDevices.enumerateDevices();
      const vids = all.filter(d => d.kind === 'videoinput');
      setDevices(vids);
    } catch { toast.error("Camera access nahi mila"); }
  };

  useEffect(() => {
    if (camType === "usb") loadDevices();
  }, [camType]);

  useEffect(() => () => {
    if (previewStream.front) previewStream.front.getTracks().forEach(t => t.stop());
    if (previewStream.side) previewStream.side.getTracks().forEach(t => t.stop());
  }, [previewStream]);

  const startPreview = async (deviceId, videoRef, key) => {
    if (previewStream[key]) { previewStream[key].getTracks().forEach(t => t.stop()); }
    if (!deviceId) {
      if (videoRef.current) videoRef.current.srcObject = null;
      setPreviewStream(p => ({ ...p, [key]: null }));
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: 640, height: 480 }
      });
      if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); }
      setPreviewStream(p => ({ ...p, [key]: s }));
    } catch { toast.error("Camera start nahi ho paya"); }
  };

  const handleSave = async () => {
    if (camType === "ip") {
      localStorage.setItem('camera_config', JSON.stringify({ type: "ip", frontUrl, sideUrl }));
    } else if (camType === "vigi") {
      localStorage.setItem('camera_config', JSON.stringify({
        type: "vigi", vigiIp, vigiUser, vigiPass,
        vigiFrontChannel: vigiFrontCh, vigiSideChannel: vigiSideCh,
        vigiFrontIp: vigiFrontIp, vigiSideIp: vigiSideIp
      }));
      // Also save to backend for server-side access
      try {
        await axios.post(`${API}/vigi-config`, {
          nvr_ip: vigiIp, username: vigiUser, password: vigiPass,
          front_channel: vigiFrontCh, side_channel: vigiSideCh,
          front_ip: vigiFrontIp, side_ip: vigiSideIp, enabled: true
        });
      } catch { /* ignore on web */ }
    } else {
      localStorage.setItem('camera_config', JSON.stringify({ type: "usb", frontId, sideId }));
    }
    window.dispatchEvent(new Event('camera-config-changed'));
    try {
      await axios.put(`${API}/settings/image-cleanup`, { days: cleanupDays });
    } catch { /* ignore */ }
    toast.success("Camera config save ho gaya!");
  };

  const testVigiConnection = async () => {
    const testIp = vigiFrontIp || vigiIp;
    if (!testIp) { toast.error("NVR IP ya Camera IP daalo"); return; }
    setVigiTesting(true); setVigiTestResult(null);
    try {
      const ch = vigiFrontIp ? '1' : (vigiFrontCh || '1');
      const r = await axios.get(`${API}/vigi-test?nvr_ip=${encodeURIComponent(testIp)}&username=${encodeURIComponent(vigiUser)}&password=${encodeURIComponent(vigiPass)}&channel=${ch}`, { timeout: 30000 });
      setVigiTestResult(r.data);
      if (r.data.success) toast.success("Connected!");
      else toast.error(r.data.error || "Connection fail");
    } catch (e) { setVigiTestResult({ success: false, error: e.message }); toast.error("Connection error - timeout ya network issue"); }
    setVigiTesting(false);
  };

  const handleManualCleanup = async () => {
    if (cleanupDays <= 0) { toast.error("Pehle cleanup days set karein"); return; }
    setCleanupLoading(true);
    try {
      const r = await axios.post(`${API}/settings/image-cleanup/run`);
      if (r.data.success) {
        toast.success(r.data.message || `${r.data.deleted} images deleted`);
      } else {
        toast.info(r.data.message || "Cleanup disabled");
      }
    } catch { toast.error("Cleanup error"); }
    setCleanupLoading(false);
  };

  return (
    <div className="space-y-4">
      <Card className="bg-slate-800 border-slate-700" data-testid="camera-setup-section">
        <CardHeader>
          <CardTitle className="text-amber-400 flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Camera Setup / IP Camera Setup
          </CardTitle>
          <p className="text-slate-400 text-sm">
            Vehicle Weight ke liye Front aur Side camera configure karein
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Camera Type Selector */}
          <div className="flex gap-2" data-testid="camera-type-selector">
            <button
              onClick={() => setCamType("vigi")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${camType === "vigi" ? "bg-green-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"}`}
              data-testid="camera-type-vigi-btn"
            >
              <Wifi className="w-4 h-4 inline mr-1.5" />
              VIGI NVR (Recommended)
            </button>
            <button
              onClick={() => setCamType("ip")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${camType === "ip" ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"}`}
              data-testid="camera-type-ip-btn"
            >
              <Wifi className="w-4 h-4 inline mr-1.5" />
              IP Camera (RTSP)
            </button>
            <button
              onClick={() => setCamType("usb")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${camType === "usb" ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"}`}
              data-testid="camera-type-usb-btn"
            >
              <Camera className="w-4 h-4 inline mr-1.5" />
              USB Webcam
            </button>
          </div>

          {camType === "vigi" ? (
            /* ─── VIGI NVR Mode ─── */
            <div className="space-y-4">
              <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3 text-xs text-slate-300 space-y-1">
                <p className="text-green-400 font-semibold text-sm">VIGI Camera Mode (No ffmpeg = Fast + Low RAM)</p>
                <p>HTTP snapshot se camera connect karega - ffmpeg nahi chalega, RAM kam lagega</p>
                <p>Option 1: NVR IP + Channel number (agar NVR hai)</p>
                <p>Option 2: Direct Camera IP (agar NVR nahi chal raha toh seedha camera ka IP daalo)</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-slate-300 text-xs">Username</Label>
                  <input type="text" value={vigiUser}
                    onChange={e => setVigiUser(e.target.value)}
                    placeholder="admin"
                    className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-md px-3 py-2"
                    data-testid="vigi-username" />
                </div>
                <div>
                  <Label className="text-slate-300 text-xs">Password</Label>
                  <input type="password" value={vigiPass}
                    onChange={e => setVigiPass(e.target.value)}
                    placeholder="Admin@123"
                    className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-md px-3 py-2"
                    data-testid="vigi-password" />
                </div>
                <div>
                  <Label className="text-slate-300 text-xs">NVR IP (optional)</Label>
                  <input type="text" value={vigiIp}
                    onChange={e => setVigiIp(e.target.value)}
                    placeholder="192.168.31.2"
                    className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-md px-3 py-2"
                    data-testid="vigi-nvr-ip" />
                </div>
              </div>

              <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-3 space-y-3">
                <p className="text-amber-400 text-xs font-semibold">Front Camera</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-slate-400 text-[11px]">Direct Camera IP (recommended)</Label>
                    <input type="text" value={vigiFrontIp}
                      onChange={e => setVigiFrontIp(e.target.value)}
                      placeholder="192.168.31.65"
                      className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-md px-3 py-2"
                      data-testid="vigi-front-ip" />
                  </div>
                  <div>
                    <Label className="text-slate-400 text-[11px]">NVR Channel (agar NVR use kar rahe)</Label>
                    <input type="number" value={vigiFrontCh}
                      onChange={e => setVigiFrontCh(e.target.value)}
                      placeholder="9"
                      className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-md px-3 py-2"
                      data-testid="vigi-front-channel" />
                  </div>
                </div>
              </div>

              <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-3 space-y-3">
                <p className="text-amber-400 text-xs font-semibold">Side Camera</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-slate-400 text-[11px]">Direct Camera IP (recommended)</Label>
                    <input type="text" value={vigiSideIp}
                      onChange={e => setVigiSideIp(e.target.value)}
                      placeholder="192.168.31.66"
                      className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-md px-3 py-2"
                      data-testid="vigi-side-ip" />
                  </div>
                  <div>
                    <Label className="text-slate-400 text-[11px]">NVR Channel (agar NVR use kar rahe)</Label>
                    <input type="number" value={vigiSideCh}
                      onChange={e => setVigiSideCh(e.target.value)}
                      placeholder="5"
                      className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-md px-3 py-2"
                      data-testid="vigi-side-channel" />
                  </div>
                </div>
              </div>

              {/* Test & Preview */}
              <div className="flex gap-2 items-center flex-wrap">
                <Button onClick={testVigiConnection} disabled={vigiTesting || (!vigiIp && !vigiFrontIp)}
                  size="sm" className="bg-green-700 hover:bg-green-600 text-white" data-testid="vigi-test-btn">
                  {vigiTesting ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Wifi className="w-4 h-4 mr-1" />}
                  Test Connection
                </Button>
                <Button onClick={diagnoseVigi} disabled={vigiDiagLoading || (!vigiIp && !vigiFrontIp && !vigiSideIp)}
                  size="sm" className="bg-orange-700 hover:bg-orange-600 text-white" data-testid="vigi-diagnose-btn">
                  {vigiDiagLoading ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <AlertCircle className="w-4 h-4 mr-1" />}
                  {vigiDiagLoading ? 'Checking...' : 'Diagnose'}
                </Button>
                {vigiTestResult && (
                  <span className={`text-xs ${vigiTestResult.success ? 'text-green-400' : 'text-red-400'}`}>
                    {vigiTestResult.success ? `Connected! (${vigiTestResult.imageSize} bytes)` : vigiTestResult.error}
                  </span>
                )}
              </div>

              {/* VIGI Diagnose Results */}
              {vigiDiagResult && (
                <div className={`rounded-lg border p-3 text-xs space-y-2 ${
                  vigiDiagResult.error ? 'bg-red-900/20 border-red-700/50' :
                  vigiDiagResult.snapshotTest?.startsWith('OK') ? 'bg-green-900/20 border-green-700/50' :
                  'bg-amber-900/20 border-amber-700/50'
                }`} data-testid="vigi-diagnose-result">
                  <div className="flex items-start gap-2">
                    {vigiDiagResult.error ? (
                      <CameraOff className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    ) : vigiDiagResult.snapshotTest?.startsWith('OK') ? (
                      <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                    )}
                    <div>
                      <p className="font-semibold text-white text-sm">
                        {vigiDiagResult.error ? 'Diagnose Error' : vigiDiagResult.diagnosisHi || vigiDiagResult.diagnosis}
                      </p>
                      {vigiDiagResult.error && <p className="text-red-300 mt-1">{vigiDiagResult.error}</p>}
                    </div>
                  </div>

                  {!vigiDiagResult.error && (
                    <div className="space-y-1.5 pt-1 border-t border-slate-700">
                      <div className="flex gap-2">
                        <span className="text-slate-500 w-20">IP:</span>
                        <span className="text-slate-300">{vigiDiagResult.ip}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-slate-500 w-20">Network:</span>
                        <span className={vigiDiagResult.networkReachable ? 'text-green-400' : 'text-red-400'}>
                          {vigiDiagResult.networkReachable ? 'Reachable' : 'NOT Reachable'}
                        </span>
                      </div>
                      {vigiDiagResult.portScan && Object.keys(vigiDiagResult.portScan).length > 0 && (
                        <div className="flex gap-2">
                          <span className="text-slate-500 w-20">Ports:</span>
                          <span className="text-slate-300">
                            {Object.entries(vigiDiagResult.portScan).map(([p, s]) => (
                              <span key={p} className={`mr-2 ${s === 'OPEN' ? 'text-green-400' : 'text-red-400'}`}>
                                {p}: {s}
                              </span>
                            ))}
                          </span>
                        </div>
                      )}
                      {vigiDiagResult.httpAccess && (
                        <div className="flex gap-2">
                          <span className="text-slate-500 w-20">HTTP:</span>
                          <span className={vigiDiagResult.httpAccess === 'OK' ? 'text-green-400' : 'text-amber-400'}>
                            {vigiDiagResult.httpAccess}
                          </span>
                        </div>
                      )}
                      {vigiDiagResult.digestAuth && (
                        <div className="flex gap-2">
                          <span className="text-slate-500 w-20">Auth:</span>
                          <span className={vigiDiagResult.digestAuth === 'OK' ? 'text-green-400' : 'text-red-400'}>
                            {vigiDiagResult.digestAuth}
                          </span>
                        </div>
                      )}
                      {vigiDiagResult.snapshotTest && (
                        <div className="flex gap-2">
                          <span className="text-slate-500 w-20">Snapshot:</span>
                          <span className={vigiDiagResult.snapshotTest.startsWith('OK') ? 'text-green-400' : 'text-red-400'}>
                            {vigiDiagResult.snapshotTest}
                          </span>
                        </div>
                      )}
                      {vigiDiagResult.snapshotPath && (
                        <div className="flex gap-2">
                          <span className="text-slate-500 w-20">Path:</span>
                          <span className="text-green-400">{vigiDiagResult.snapshotPath}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Preview boxes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-slate-400 text-xs mb-1">Front {vigiFrontIp ? `(${vigiFrontIp})` : vigiFrontCh ? `(NVR Ch ${vigiFrontCh})` : ''}</p>
                  <div className="rounded-lg overflow-hidden border border-slate-600 bg-black h-[180px]">
                    {(vigiFrontIp || (vigiIp && vigiFrontCh)) ? (
                      <img src={`${API}/vigi-stream?channel=${vigiFrontIp ? '1' : vigiFrontCh}&fps=2&nvr_ip=${encodeURIComponent(vigiFrontIp || vigiIp)}&username=${encodeURIComponent(vigiUser)}&password=${encodeURIComponent(vigiPass)}`}
                        alt="Front" className="w-full h-full object-contain"
                        onError={() => {}} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <p className="text-slate-500 text-xs">Camera IP ya NVR Channel daalo</p>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-slate-400 text-xs mb-1">Side {vigiSideIp ? `(${vigiSideIp})` : vigiSideCh ? `(NVR Ch ${vigiSideCh})` : ''}</p>
                  <div className="rounded-lg overflow-hidden border border-slate-600 bg-black h-[180px]">
                    {(vigiSideIp || (vigiIp && vigiSideCh)) ? (
                      <img src={`${API}/vigi-stream?channel=${vigiSideIp ? '1' : vigiSideCh}&fps=2&nvr_ip=${encodeURIComponent(vigiSideIp || vigiIp)}&username=${encodeURIComponent(vigiUser)}&password=${encodeURIComponent(vigiPass)}`}
                        alt="Side" className="w-full h-full object-contain"
                        onError={() => {}} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <p className="text-slate-500 text-xs">Camera IP ya NVR Channel daalo</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : camType === "ip" ? (
            /* ─── IP Camera Mode ─── */
            <div className="space-y-4">
              <div className="bg-slate-700/50 rounded-lg p-3 text-xs text-slate-400 space-y-1">
                <p className="text-amber-400 font-semibold text-sm">IP Camera URL kaise milega?</p>
                <p>1. Camera ka IP address find karo (router settings ya camera app se)</p>
                <p>2. RTSP URL daalo jaise: <code className="text-green-400">rtsp://admin:password@192.168.1.100:554</code></p>
                <p>3. HTTP stream bhi chalega: <code className="text-green-400">http://192.168.1.100:8080/video</code></p>
                <p className="text-amber-300 mt-1">RTSP automatic proxy se chalega - VLC jaisa live stream!</p>
              </div>

              {/* Front Camera URL */}
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm font-semibold">Front Camera URL</Label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={frontUrl}
                    onChange={(e) => { setFrontUrl(e.target.value); setFrontPreview(false); setFrontError(false); }}
                    placeholder="http://192.168.1.100:8080/video"
                    className="flex-1 bg-slate-700 border border-slate-600 text-white text-sm rounded-md px-3 py-2"
                    data-testid="front-camera-url-input"
                  />
                  <Button
                    onClick={() => { setFrontPreview(!frontPreview); setFrontError(false); }}
                    size="sm"
                    variant="outline"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                    data-testid="front-camera-preview-btn"
                    disabled={!frontUrl}
                  >
                    {frontPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <div className="rounded-lg overflow-hidden border border-slate-600 bg-black h-[180px]">
                  {frontPreview && frontUrl ? (
                    frontError ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center">
                          <CameraOff className="w-6 h-6 text-red-500 mx-auto mb-1" />
                          <p className="text-red-400 text-xs">Camera connect nahi ho paya</p>
                          <p className="text-slate-500 text-[10px] mt-1">URL check karein ya camera ON hai?</p>
                        </div>
                      </div>
                    ) : (
                      <img
                        src={getPreviewUrl(frontUrl)}
                        alt="Front Camera"
                        className="w-full h-full object-contain"
                        crossOrigin="anonymous"
                        onError={() => setFrontError(true)}
                        onLoad={() => setFrontError(false)}
                      />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <p className="text-slate-500 text-xs">{frontUrl ? "Preview dekhne ke liye Eye icon dabayein" : "URL daalein"}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Side Camera URL */}
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm font-semibold">Side Camera URL</Label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={sideUrl}
                    onChange={(e) => { setSideUrl(e.target.value); setSidePreview(false); setSideError(false); }}
                    placeholder="http://192.168.1.101:8080/video"
                    className="flex-1 bg-slate-700 border border-slate-600 text-white text-sm rounded-md px-3 py-2"
                    data-testid="side-camera-url-input"
                  />
                  <Button
                    onClick={() => { setSidePreview(!sidePreview); setSideError(false); }}
                    size="sm"
                    variant="outline"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                    data-testid="side-camera-preview-btn"
                    disabled={!sideUrl}
                  >
                    {sidePreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <div className="rounded-lg overflow-hidden border border-slate-600 bg-black h-[180px]">
                  {sidePreview && sideUrl ? (
                    sideError ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center">
                          <CameraOff className="w-6 h-6 text-red-500 mx-auto mb-1" />
                          <p className="text-red-400 text-xs">Camera connect nahi ho paya</p>
                          <p className="text-slate-500 text-[10px] mt-1">URL check karein ya camera ON hai?</p>
                        </div>
                      </div>
                    ) : (
                      <img
                        src={getPreviewUrl(sideUrl)}
                        alt="Side Camera"
                        className="w-full h-full object-contain"
                        crossOrigin="anonymous"
                        onError={() => setSideError(true)}
                        onLoad={() => setSideError(false)}
                      />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <p className="text-slate-500 text-xs">{sideUrl ? "Preview dekhne ke liye Eye icon dabayein" : "URL daalein"}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Diagnose Button */}
              <div className="mt-4 space-y-3">
                <div className="flex gap-2">
                  <Button
                    onClick={() => diagnoseCam(frontUrl || sideUrl)}
                    disabled={diagLoading || (!frontUrl && !sideUrl)}
                    size="sm"
                    className="bg-orange-700 hover:bg-orange-600 text-white"
                    data-testid="camera-diagnose-btn"
                  >
                    {diagLoading ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <AlertCircle className="w-4 h-4 mr-1.5" />}
                    {diagLoading ? 'Checking...' : 'Diagnose Camera'}
                  </Button>
                  <p className="text-slate-500 text-[10px] self-center">Camera connect nahi ho raha? Isse click karke wajah pata karein</p>
                </div>

                {diagResult && (
                  <div className={`rounded-lg border p-3 text-xs space-y-2 ${
                    diagResult.error ? 'bg-red-900/20 border-red-700/50' :
                    diagResult.networkReachable && diagResult.snapshotTest?.startsWith('OK') ? 'bg-green-900/20 border-green-700/50' :
                    'bg-amber-900/20 border-amber-700/50'
                  }`} data-testid="camera-diagnose-result">
                    {/* Diagnosis Summary */}
                    <div className="flex items-start gap-2">
                      {diagResult.error ? (
                        <CameraOff className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                      ) : diagResult.networkReachable && diagResult.snapshotTest?.startsWith('OK') ? (
                        <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-semibold text-white text-sm">
                          {diagResult.error ? 'Diagnose Error' : diagResult.diagnosisHi || diagResult.diagnosis}
                        </p>
                        {diagResult.error && <p className="text-red-300 mt-1">{diagResult.error}</p>}
                      </div>
                    </div>

                    {!diagResult.error && (
                      <div className="space-y-1.5 pt-1 border-t border-slate-700">
                        {/* URL Parse */}
                        {diagResult.urlParsed && (
                          <div className="flex gap-2">
                            <span className="text-slate-500 w-20">URL Parse:</span>
                            <span className="text-green-400">OK - IP: {diagResult.urlParsed.ip}, Port: {diagResult.urlParsed.port}, User: {diagResult.urlParsed.user || 'none'}</span>
                          </div>
                        )}
                        {/* Network */}
                        <div className="flex gap-2">
                          <span className="text-slate-500 w-20">Network:</span>
                          <span className={diagResult.networkReachable ? 'text-green-400' : 'text-red-400'}>
                            {diagResult.networkReachable ? 'Reachable' : 'NOT Reachable'}
                          </span>
                        </div>
                        {/* Port Scan */}
                        {diagResult.portScan && Object.keys(diagResult.portScan).length > 0 && (
                          <div className="flex gap-2">
                            <span className="text-slate-500 w-20">Ports:</span>
                            <span className="text-slate-300">
                              {Object.entries(diagResult.portScan).map(([p, s]) => (
                                <span key={p} className={`mr-2 ${s === 'OPEN' ? 'text-green-400' : 'text-red-400'}`}>
                                  {p}: {s}
                                </span>
                              ))}
                            </span>
                          </div>
                        )}
                        {/* ffmpeg */}
                        <div className="flex gap-2">
                          <span className="text-slate-500 w-20">ffmpeg:</span>
                          <span className={diagResult.ffmpegAvailable ? 'text-green-400' : 'text-amber-400'}>
                            {diagResult.ffmpegAvailable ? 'Available' : 'Not Found'}
                          </span>
                        </div>
                        {/* Snapshot Test */}
                        {diagResult.snapshotTest && (
                          <div className="flex gap-2">
                            <span className="text-slate-500 w-20">Snapshot:</span>
                            <span className={diagResult.snapshotTest.startsWith('OK') ? 'text-green-400' : 'text-red-400'}>
                              {diagResult.snapshotTest}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ─── USB Webcam Mode ─── */
            <div className="space-y-4">
              {devices.length === 0 ? (
                <div className="text-center py-6">
                  <CameraOff className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">Koi USB camera detect nahi hua</p>
                  <Button onClick={loadDevices} variant="outline" size="sm" className="mt-2 border-slate-600 text-slate-300">
                    <RefreshCw className="w-3 h-3 mr-1" /> Refresh
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-slate-400 text-xs">{devices.length} camera(s) detected</p>
                  <div className="space-y-2">
                    <Label className="text-slate-300 text-sm font-semibold">Front Camera</Label>
                    <select
                      value={frontId}
                      onChange={(e) => { setFrontId(e.target.value); startPreview(e.target.value, frontRef, 'front'); }}
                      className="w-full bg-slate-700 border border-slate-600 text-white text-xs rounded-md px-3 py-2"
                      data-testid="front-camera-select"
                    >
                      <option value="">-- Select Front Camera --</option>
                      {devices.map((d, i) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Camera ${i + 1}`}
                        </option>
                      ))}
                    </select>
                    <div className="rounded-lg overflow-hidden border border-slate-600 bg-black h-[160px]">
                      {previewStream.front ? (
                        <video ref={frontRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <p className="text-slate-500 text-xs">Preview</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300 text-sm font-semibold">Side Camera</Label>
                    <select
                      value={sideId}
                      onChange={(e) => { setSideId(e.target.value); startPreview(e.target.value, sideRef, 'side'); }}
                      className="w-full bg-slate-700 border border-slate-600 text-white text-xs rounded-md px-3 py-2"
                      data-testid="side-camera-select"
                    >
                      <option value="">-- Select Side Camera --</option>
                      {devices.map((d, i) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Camera ${i + 1}`}
                        </option>
                      ))}
                    </select>
                    <div className="rounded-lg overflow-hidden border border-slate-600 bg-black h-[160px]">
                      {previewStream.side ? (
                        <video ref={sideRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <p className="text-slate-500 text-xs">Preview</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <Button onClick={handleSave} className="w-full bg-amber-600 hover:bg-amber-700 text-white" data-testid="save-camera-config-btn">
            Save Camera Config
          </Button>
        </CardContent>
      </Card>

      {/* Image Auto-Cleanup Card */}
      <Card className="bg-slate-800 border-slate-700" data-testid="image-cleanup-section">
        <CardHeader>
          <CardTitle className="text-amber-400 flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            Image Auto-Cleanup
          </CardTitle>
          <p className="text-slate-400 text-sm">
            Purani camera images automatically delete hongi set days ke baad. 0 = OFF
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-slate-300 text-sm mb-1 block">Kitne din baad delete karein?</Label>
              <Input
                type="number"
                min="0"
                max="365"
                value={cleanupDays}
                onChange={(e) => setCleanupDays(parseInt(e.target.value) || 0)}
                className="bg-slate-900 border-slate-600 text-white"
                placeholder="0 = disabled"
                data-testid="cleanup-days-input"
              />
            </div>
            <Button
              onClick={handleManualCleanup}
              disabled={cleanupLoading || cleanupDays <= 0}
              variant="outline"
              className="border-red-600 text-red-400 hover:bg-red-600/20"
              data-testid="manual-cleanup-btn"
            >
              {cleanupLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Abhi Clean Karo
            </Button>
          </div>
          <p className="text-slate-500 text-xs">
            Ye setting save hone par active hogi. App har 24 ghante mai purani images check karke delete karega.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ======================= MAIN SETTINGS COMPONENT =======================

const SUB_TABS = [
  { id: "branding", label: "Branding", icon: Key },
  { id: "gst", label: "GST", icon: Calculator },
  { id: "stock", label: "Stock", icon: Package },
  { id: "messaging", label: "Messaging", icon: Send },
  { id: "camera", label: "Camera", icon: Camera },
  { id: "weighbridge", label: "Weighbridge", icon: Scale },
  { id: "data", label: "Data", icon: HardDrive },
  { id: "errorlog", label: "Error Log", icon: AlertCircle },
];

export default function Settings({ user, kmsYear, onBrandingUpdate }) {
  const [activeSubTab, setActiveSubTab] = useState("branding");

  return (
    <div className="max-w-2xl mx-auto" data-testid="settings-page">
      {/* Sub-tab Navigation */}
      <div className="mb-6">
        <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
          <TabsList className="w-full bg-slate-800/80 border border-slate-700 h-auto p-1 gap-0.5 flex flex-nowrap overflow-x-auto" data-testid="settings-sub-tabs">
            {SUB_TABS.map(tab => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-1 px-2.5 py-2 text-[11px] font-medium data-[state=active]:bg-amber-600 data-[state=active]:text-white text-slate-400 hover:text-slate-200 transition-colors rounded-md whitespace-nowrap flex-shrink-0"
                data-testid={`settings-tab-${tab.id}`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="branding">
            <BrandingTab user={user} onBrandingUpdate={onBrandingUpdate} />
          </TabsContent>
          <TabsContent value="gst">
            <GSTTab />
          </TabsContent>
          <TabsContent value="stock">
            <StockTab kmsYear={kmsYear} user={user} />
          </TabsContent>
          <TabsContent value="messaging">
            <MessagingTab />
          </TabsContent>
          <TabsContent value="camera">
            <CameraSetupTab />
          </TabsContent>
          <TabsContent value="weighbridge">
            <WeighbridgeConfigCard />
          </TabsContent>
          <TabsContent value="data">
            <DataTab user={user} />
          </TabsContent>
          <TabsContent value="errorlog">
            <ErrorLogTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
