import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Trash2, Plus, Calculator, RefreshCw, Key, FileText,
  AlertCircle, HardDrive, ShieldCheck, Send, Package, Scale,
  Camera, CameraOff, Eye, EyeOff, Wifi, CheckCircle, Users, History,
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

  // Storage Engine state (read-only display)
  const [storageEngine, setStorageEngine] = useState('json');

  const fetchBackups = async () => {
    try {
      const res = await axios.get(`${API}/backups`);
      setBackups(res.data.backups || []);
      setBackupStatus(res.data);
    } catch { setBackupStatus(null); }
  };

  useEffect(() => {
    fetchBackups();
    // Load storage engine status
    axios.get(`${API}/settings/storage-engine`).then(r => {
      setStorageEngine(r.data.engine || 'json');
    }).catch(() => {});
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

  const handleRestoreBackup = async (filename, sourceDir) => {
    const ok = await showConfirm("Restore Backup", `Kya aap "${filename}" se data restore karna chahte hain? Current data replace ho jaayega.`);
    if (!ok) return;
    setBackupLoading(true);
    try {
      const res = await axios.post(`${API}/backups/restore`, { filename, source_dir: sourceDir || null });
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

          {/* Custom Backup Folder */}
          <div className="p-3 bg-slate-700/40 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-3">
                <p className="text-sm text-white font-medium">Backup Folder / बैकअप फोल्डर</p>
                {backupStatus?.custom_backup_dir ? (
                  <div className="mt-1 p-1.5 bg-green-900/30 border border-green-700/50 rounded text-[11px] text-green-300 font-mono break-all">
                    {backupStatus.custom_backup_dir}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-1">Default folder (data folder ke andar)</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={async () => {
                    try {
                      const res = await axios.post(`${API}/backups/browse-folder`);
                      if (res.data.success && res.data.dir) {
                        await axios.put(`${API}/backups/custom-dir`, { dir: res.data.dir });
                        toast.success(`Backup folder: ${res.data.dir}`);
                        fetchBackups();
                      }
                    } catch (e) {
                      if (e.response?.status === 500 && e.response?.data?.detail?.includes('electron')) {
                        toast.error("Ye feature sirf Desktop App mein kaam karega");
                      } else {
                        toast.error("Folder select error");
                      }
                    }
                  }}
                  variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700 h-7 text-xs"
                  data-testid="select-backup-folder-btn"
                >
                  <HardDrive className="w-3.5 h-3.5 mr-1" /> Select Drive
                </Button>
                {backupStatus?.custom_backup_dir && (
                  <Button 
                    onClick={async () => {
                      await axios.put(`${API}/backups/custom-dir`, { dir: null });
                      toast.success("Default folder set");
                      fetchBackups();
                    }}
                    variant="ghost" size="sm" className="text-red-400 hover:text-red-300 h-7 text-xs"
                    data-testid="reset-backup-folder-btn"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
            <p className="text-[10px] text-amber-400">Logout par auto backup + manual backup dono is folder mein save honge</p>
          </div>

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
                    <p className="text-slate-400 text-xs">
                      {new Date(b.created_at).toLocaleString('en-IN')} | {b.size_readable}
                      {b.source === 'custom' && <span className="ml-1 text-amber-400">(Custom Drive)</span>}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleRestoreBackup(b.filename, b.custom_dir)} disabled={backupLoading} className="text-blue-400 border-blue-600 hover:bg-blue-900/30 text-xs" data-testid={`restore-btn-${b.filename}`}>Restore</Button>
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
            <p className="text-slate-300 text-sm font-semibold mb-2">Backup Upload & Restore</p>
            <p className="text-red-400 text-xs mb-3">Warning: Current data replace ho jayega! Pehle backup le lein.</p>
            <div className="flex gap-2">
              {/* ZIP Upload */}
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
                className="flex-1 border-amber-600 text-amber-400 hover:bg-amber-900/30 text-xs"
                data-testid="restore-backup-btn"
              >
                {backupLoading ? 'Restoring...' : 'ZIP Upload & Restore'}
              </Button>

              {/* JSON Upload */}
              <input
                type="file" accept=".json" id="backup-json-restore-input" className="hidden"
                data-testid="restore-json-file-input"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (!file.name.endsWith('.json')) { toast.error("Sirf JSON file upload karein"); return; }
                  if (!await showConfirm("Restore Data", "Kya aap sure hain? JSON backup se data replace ho jayega!")) { e.target.value = ''; return; }
                  try {
                    setBackupLoading(true);
                    const text = await file.text();
                    JSON.parse(text); // Validate
                    const res = await axios.post(`${API}/backups/restore-json`, { data: text, filename: file.name });
                    toast.success(res.data.message || "Restore ho gaya!");
                    window.location.reload();
                  } catch (err) { toast.error(err.response?.data?.detail || err.message || "JSON Restore fail!"); }
                  finally { setBackupLoading(false); e.target.value = ''; }
                }}
              />
              <Button
                onClick={() => document.getElementById('backup-json-restore-input')?.click()}
                disabled={backupLoading} variant="outline"
                className="flex-1 border-blue-600 text-blue-400 hover:bg-blue-900/30 text-xs"
                data-testid="restore-json-backup-btn"
              >
                {backupLoading ? 'Restoring...' : 'JSON Upload & Restore'}
              </Button>
            </div>
          </div>

          <div className="text-center text-slate-500 text-xs">
            <p>Auto Backup: Har din automatically hota hai | Max {backupStatus?.max_backups || 7} backups save hote hain | Location: data/backups/</p>
          </div>
        </CardContent>
      </Card>

      {/* Storage Engine Card */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-amber-400 text-base flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            Storage Engine
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-300 text-sm font-medium">
            Current: <span className={storageEngine === 'sqlite' ? 'text-green-400 font-bold' : storageEngine === 'mongodb' ? 'text-blue-400 font-bold' : 'text-amber-400 font-bold'}>
              {storageEngine === 'sqlite' ? 'SQLite (WAL Mode)' : storageEngine === 'mongodb' ? 'MongoDB' : 'JSON (Fallback)'}
            </span>
          </p>
          <p className="text-slate-500 text-xs mt-1">
            {storageEngine === 'sqlite' 
              ? 'Crash-safe, fast saves, 1 Lakh+ entries support'
              : storageEngine === 'mongodb'
              ? 'Web version - Cloud database'
              : 'Fallback mode - better-sqlite3 install karein for best performance'}
          </p>
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
  const [vigiOpenApiPort, setVigiOpenApiPort] = useState("");
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

  const [rtspTestResult, setRtspTestResult] = useState(null);
  const [rtspTestLoading, setRtspTestLoading] = useState(false);
  const testRtsp = async (url) => {
    if (!url) { toast.error("URL daalo pehle"); return; }
    setRtspTestLoading(true); setRtspTestResult(null);
    toast.info("RTSP test shuru... 15-20 sec lag sakte hain");
    try {
      const r = await axios.get(`${API}/camera-test-rtsp?url=${encodeURIComponent(url)}`, { timeout: 35000 });
      setRtspTestResult(r.data);
      if (r.data.success) toast.success("RTSP stream kaam kar raha hai!");
      else toast.error("RTSP test fail hua");
    } catch (e) { setRtspTestResult({ error: e.message }); }
    setRtspTestLoading(false);
  };

  const [vigiDiagResult, setVigiDiagResult] = useState(null);
  const [vigiDiagLoading, setVigiDiagLoading] = useState(false);
  const diagnoseVigi = async () => {
    const ip = vigiFrontIp || vigiSideIp || vigiIp;
    if (!ip) { toast.error("Camera/NVR IP daalo pehle"); return; }
    setVigiDiagLoading(true); setVigiDiagResult(null);
    try {
      const ch = vigiFrontIp ? '1' : (vigiFrontCh || '1');
      const r = await axios.get(`${API}/vigi-diagnose?ip=${encodeURIComponent(ip)}&username=${encodeURIComponent(vigiUser)}&password=${encodeURIComponent(vigiPass)}&channel=${ch}&openapi_port=${encodeURIComponent(vigiOpenApiPort)}`, { timeout: 30000 });
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
        setVigiOpenApiPort(saved.vigiOpenApiPort || "");
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
        vigiFrontIp: vigiFrontIp, vigiSideIp: vigiSideIp,
        vigiOpenApiPort: vigiOpenApiPort
      }));
      // Also save to backend for server-side access
      try {
        await axios.post(`${API}/vigi-config`, {
          nvr_ip: vigiIp, username: vigiUser, password: vigiPass,
          front_channel: vigiFrontCh, side_channel: vigiSideCh,
          front_ip: vigiFrontIp, side_ip: vigiSideIp,
          openapi_port: vigiOpenApiPort, enabled: true
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
      const r = await axios.get(`${API}/vigi-test?nvr_ip=${encodeURIComponent(testIp)}&username=${encodeURIComponent(vigiUser)}&password=${encodeURIComponent(vigiPass)}&channel=${ch}&openapi_port=${encodeURIComponent(vigiOpenApiPort)}`, { timeout: 30000 });
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
      // Pehle days save karo DB mein, phir run karo
      await axios.put(`${API}/settings/image-cleanup`, { days: cleanupDays });
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
          {/* ─── IP Camera Mode ─── */}
            <div className="space-y-4">
              <div className="bg-slate-700/50 rounded-lg p-3 text-xs text-slate-400 space-y-1">
                <p className="text-amber-400 font-semibold text-sm">IP Camera URL kaise milega?</p>
                <p>1. Camera ka IP address find karo (router settings ya camera app se)</p>
                <p>2. RTSP URL daalo jaise: <code className="text-green-400">rtsp://admin:password@192.168.1.100:554</code></p>
                <p>3. HTTP stream bhi chalega: <code className="text-green-400">http://192.168.1.100:8080/video</code></p>
                <p className="text-amber-300 mt-1">RTSP automatic proxy se chalega - VLC jaisa live stream!</p>
              </div>

              {/* Front Camera URL */}
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
                    placeholder="rtsp://admin:password@192.168.1.100:554/stream1"
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
                <div className="flex gap-2 flex-wrap">
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
                  <Button
                    onClick={() => testRtsp(frontUrl || sideUrl)}
                    disabled={rtspTestLoading || (!frontUrl && !sideUrl)}
                    size="sm"
                    className="bg-blue-700 hover:bg-blue-600 text-white"
                    data-testid="camera-test-rtsp-btn"
                  >
                    {rtspTestLoading ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Camera className="w-4 h-4 mr-1.5" />}
                    {rtspTestLoading ? 'Testing RTSP...' : 'Test RTSP Stream'}
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

                {/* RTSP Test Result */}
                {rtspTestResult && (
                  <div className={`rounded-lg border p-3 text-xs space-y-2 ${
                    rtspTestResult.success ? 'bg-green-900/20 border-green-700/50' : 'bg-red-900/20 border-red-700/50'
                  }`} data-testid="rtsp-test-result">
                    <div className="flex items-start gap-2">
                      {rtspTestResult.success ? (
                        <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      ) : (
                        <CameraOff className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-semibold text-white text-sm">
                          {rtspTestResult.diagnosisHi || rtspTestResult.diagnosis || (rtspTestResult.error ? 'Test Error' : 'RTSP Test')}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1.5 pt-1 border-t border-slate-700">
                      <div className="flex gap-2">
                        <span className="text-slate-500 w-20">FFmpeg:</span>
                        <span className="text-slate-300 break-all text-[10px]">{rtspTestResult.ffmpegPath || 'N/A'}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-slate-500 w-20">Transport:</span>
                        <span className="text-slate-300">{rtspTestResult.transport || 'N/A'}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-slate-500 w-20">Frame:</span>
                        <span className={rtspTestResult.frameSize > 1000 ? 'text-green-400' : 'text-red-400'}>
                          {rtspTestResult.frameSize || 0} bytes {rtspTestResult.hasJpeg ? '(Valid JPEG)' : ''}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-slate-500 w-20">Exit Code:</span>
                        <span className={rtspTestResult.exitCode === 0 ? 'text-green-400' : 'text-red-400'}>
                          {rtspTestResult.exitCode ?? 'N/A'}
                        </span>
                      </div>
                      {rtspTestResult.stderr && (
                        <div>
                          <span className="text-slate-500">FFmpeg Output:</span>
                          <pre className="mt-1 p-2 bg-slate-900 rounded text-[10px] text-slate-400 max-h-40 overflow-auto whitespace-pre-wrap break-all">
                            {rtspTestResult.stderr}
                          </pre>
                        </div>
                      )}
                      {rtspTestResult.udpStderr && (
                        <div>
                          <span className="text-slate-500">UDP stderr:</span>
                          <pre className="mt-1 p-2 bg-slate-900 rounded text-[10px] text-slate-400 max-h-24 overflow-auto whitespace-pre-wrap break-all">
                            {rtspTestResult.udpStderr}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

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

// ======================= USERS TAB =======================

const ROLES = [
  { value: "admin", label: "Admin", desc: "Full access - sab kuch kar sakta hai" },
  { value: "entry_operator", label: "Entry Operator", desc: "Sirf entries add/edit" },
  { value: "accountant", label: "Accountant", desc: "Payments, Cash Book, Reports" },
  { value: "viewer", label: "Viewer", desc: "Sirf dekhna - koi edit nahi" },
];

const PERMISSION_DEFS = [
  { key: "can_edit", label: "Edit Access", desc: "Koi bhi entry edit kar sakta hai" },
  { key: "can_delete", label: "Delete Access", desc: "Records delete kar sakta hai" },
  { key: "can_export", label: "Export (Excel/PDF)", desc: "Data export kar sakta hai" },
  { key: "can_see_payments", label: "Payments Tab", desc: "Payments dekh/manage kar sakta hai" },
  { key: "can_see_cashbook", label: "Cash Book Tab", desc: "Cash Book dekh/manage kar sakta hai" },
  { key: "can_see_reports", label: "Reports Tab", desc: "Reports dekh sakta hai" },
  { key: "can_edit_settings", label: "Settings Access", desc: "Settings change kar sakta hai" },
  { key: "can_manual_weight", label: "Manual Weight", desc: "Weighbridge mein manually weight type kar sakta hai" },
];

const ROLE_DEFAULTS = {
  admin: { can_edit: true, can_delete: true, can_export: true, can_see_payments: true, can_see_cashbook: true, can_see_reports: true, can_edit_settings: true, can_manual_weight: true },
  entry_operator: { can_edit: true, can_delete: false, can_export: false, can_see_payments: false, can_see_cashbook: false, can_see_reports: false, can_edit_settings: false, can_manual_weight: false },
  accountant: { can_edit: true, can_delete: false, can_export: true, can_see_payments: true, can_see_cashbook: true, can_see_reports: true, can_edit_settings: false, can_manual_weight: false },
  viewer: { can_edit: false, can_delete: false, can_export: true, can_see_payments: true, can_see_cashbook: true, can_see_reports: true, can_edit_settings: false, can_manual_weight: false },
};

function UsersTab({ user }) {
  const showConfirm = useConfirm();
  const [users, setUsers] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({ username: "", password: "", display_name: "", role: "viewer", staff_id: "", permissions: {} });
  const [showPw, setShowPw] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${API}/users?username=${user.username}&role=${user.role}`);
      setUsers(res.data.users || []);
      setStaffList(res.data.staff || []);
    } catch { toast.error("Users load nahi ho sake"); }
  };
  useEffect(() => { fetchUsers(); }, []);

  const openAdd = () => {
    setEditingUser(null);
    setForm({ username: "", password: "", display_name: "", role: "viewer", staff_id: "", permissions: { ...ROLE_DEFAULTS.viewer } });
    setShowPw(false);
    setShowDialog(true);
  };

  const openEdit = (u) => {
    setEditingUser(u);
    setForm({
      username: u.username, password: "", display_name: u.display_name || u.username,
      role: u.role, staff_id: u.staff_id || "",
      permissions: { ...ROLE_DEFAULTS[u.role] || {}, ...u.permissions }
    });
    setShowPw(false);
    setShowDialog(true);
  };

  const handleRoleChange = (role) => {
    setForm(f => ({ ...f, role, permissions: { ...ROLE_DEFAULTS[role] || ROLE_DEFAULTS.viewer } }));
  };

  const togglePerm = (key) => {
    setForm(f => ({ ...f, permissions: { ...f.permissions, [key]: !f.permissions[key] } }));
  };

  const save = async () => {
    if (!form.username.trim()) return toast.error("Username zaruri hai");
    if (!editingUser && !form.password.trim()) return toast.error("Password zaruri hai");
    try {
      if (editingUser) {
        const userId = editingUser.id || `default_${editingUser.username}`;
        const resp = await axios.put(`${API}/users/${userId}?username=${user.username}&role=${user.role}`, form);
        toast.success("User update ho gaya");
        // If admin edited their own user, refresh permissions in App instantly
        if (editingUser.username === user.username && resp.data?.user?.permissions) {
          const updatedUser = { ...user, permissions: resp.data.user.permissions };
          localStorage.setItem("mill_user", JSON.stringify(updatedUser));
          if (typeof setUser === 'function') {
            setUser(updatedUser);
          } else {
            window.location.reload();
          }
        }
      } else {
        await axios.post(`${API}/users?username=${user.username}&role=${user.role}`, form);
        toast.success("User ban gaya!");
      }
      setShowDialog(false);
      fetchUsers();
    } catch (e) { 
      const msg = e.response?.data?.detail || e.response?.data?.error_message || e.message || "Error";
      toast.error(msg);
    }
  };

  const deactivate = async (u) => {
    if (!await showConfirm("Deactivate", `${u.display_name || u.username} ko deactivate karein?`)) return;
    try {
      const userId = u.id || `default_${u.username}`;
      await axios.delete(`${API}/users/${userId}?username=${user.username}&role=${user.role}`);
      toast.success("User deactivate ho gaya");
      fetchUsers();
    } catch (e) { 
      const msg = e.response?.data?.detail || e.response?.data?.error_message || e.message || "Error";
      toast.error(msg);
    }
  };

  const roleLabel = (r) => ROLES.find(x => x.value === r)?.label || r;

  return (
    <div className="space-y-4" data-testid="users-tab">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" /> Users & Permissions
            </CardTitle>
            <Button onClick={openAdd} size="sm" className="bg-amber-500 hover:bg-amber-600 text-slate-900 h-7 text-xs" data-testid="add-user-btn">
              <Plus className="w-3 h-3 mr-1" /> Add User
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="text-left py-2 px-2">User</th>
                <th className="text-left py-2 px-2">Role</th>
                <th className="text-left py-2 px-2">Permissions</th>
                <th className="text-left py-2 px-2">Staff Link</th>
                <th className="text-center py-2 px-2">Status</th>
                <th className="text-right py-2 px-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const perms = u.permissions || {};
                const linkedStaff = staffList.find(s => s.id === u.staff_id);
                return (
                  <tr key={u.id || i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="py-2 px-2">
                      <div>
                        <span className="text-slate-200 font-medium">{u.display_name || u.username}</span>
                        <span className="text-slate-500 text-[10px] ml-1">@{u.username}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        u.role === 'admin' ? 'bg-red-600/20 text-red-400' :
                        u.role === 'accountant' ? 'bg-blue-600/20 text-blue-400' :
                        u.role === 'entry_operator' ? 'bg-green-600/20 text-green-400' :
                        'bg-slate-600/30 text-slate-400'
                      }`}>{roleLabel(u.role)}</span>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex flex-wrap gap-0.5">
                        {perms.can_edit && <span className="text-[9px] bg-amber-600/20 text-amber-400 px-1 rounded">Edit</span>}
                        {perms.can_delete && <span className="text-[9px] bg-red-600/20 text-red-400 px-1 rounded">Del</span>}
                        {perms.can_export && <span className="text-[9px] bg-blue-600/20 text-blue-400 px-1 rounded">Export</span>}
                        {perms.can_see_payments && <span className="text-[9px] bg-green-600/20 text-green-400 px-1 rounded">Pay</span>}
                        {perms.can_see_cashbook && <span className="text-[9px] bg-cyan-600/20 text-cyan-400 px-1 rounded">CB</span>}
                        {perms.can_see_reports && <span className="text-[9px] bg-purple-600/20 text-purple-400 px-1 rounded">Rpt</span>}
                        {perms.can_manual_weight && <span className="text-[9px] bg-orange-600/20 text-orange-400 px-1 rounded">MnWt</span>}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-slate-400 text-[10px]">
                      {linkedStaff ? linkedStaff.name : "-"}
                    </td>
                    <td className="py-2 px-2 text-center">
                      {u.active !== false
                        ? <span className="text-[9px] bg-green-600/20 text-green-400 px-1.5 py-0.5 rounded">Active</span>
                        : <span className="text-[9px] bg-red-600/20 text-red-400 px-1.5 py-0.5 rounded">Inactive</span>}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {u.is_default ? (
                        <span className="text-[10px] text-slate-500">Default</span>
                      ) : (
                        <div className="flex gap-1 justify-end">
                          <Button onClick={() => openEdit(u)} variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-amber-400" data-testid={`edit-user-${u.username}`}>
                            <Key className="w-3 h-3" />
                          </Button>
                          {u.username !== 'admin' && u.active !== false && (
                            <Button onClick={() => deactivate(u)} variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-red-400" data-testid={`del-user-${u.username}`}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr><td colSpan={6} className="text-center py-4 text-slate-500">Koi user nahi mila</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-slate-800 border-slate-600 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">{editingUser ? "Edit User" : "New User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-slate-400">Username</Label>
                <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  disabled={!!editingUser} placeholder="e.g. ram"
                  className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="user-form-username" />
              </div>
              <div>
                <Label className="text-[11px] text-slate-400">Display Name</Label>
                <Input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                  placeholder="e.g. Ram Kumar"
                  className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="user-form-display-name" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-slate-400">{editingUser ? "New Password (blank = no change)" : "Password"}</Label>
                <div className="relative">
                  <Input type={showPw ? "text" : "password"} value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="****"
                    className="bg-slate-700 border-slate-600 text-white h-8 text-sm pr-8" data-testid="user-form-password" />
                  <button onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1.5 text-slate-400 hover:text-white cursor-pointer">
                    {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-[11px] text-slate-400">Staff Link (Optional)</Label>
                <Select value={form.staff_id || "_none"} onValueChange={v => setForm(f => ({ ...f, staff_id: v === "_none" ? "" : v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="user-form-staff-link">
                    <SelectValue placeholder="Select Staff" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="_none" className="text-white text-xs">No Link</SelectItem>
                    {staffList.map(s => (
                      <SelectItem key={s.id} value={s.id} className="text-white text-xs">{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Role */}
            <div>
              <Label className="text-[11px] text-slate-400">Role</Label>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                {ROLES.map(r => (
                  <button key={r.value} onClick={() => handleRoleChange(r.value)}
                    className={`text-left px-2.5 py-1.5 rounded border text-[11px] transition-colors cursor-pointer ${
                      form.role === r.value
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                        : 'border-slate-600 bg-slate-700/50 text-slate-300 hover:border-slate-500'
                    }`} data-testid={`role-${r.value}`}>
                    <span className="font-bold">{r.label}</span>
                    <p className="text-[9px] text-slate-400 mt-0.5">{r.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Granular Permissions */}
            <div>
              <Label className="text-[11px] text-slate-400 mb-1.5 block">Permissions (Fine-tune)</Label>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {PERMISSION_DEFS.map(p => {
                  const isAdminLocked = form.role === 'admin' && ['can_edit', 'can_delete', 'can_edit_settings'].includes(p.key);
                  return (
                  <div key={p.key} className="flex items-center justify-between bg-slate-700/40 rounded px-2 py-1.5">
                    <div>
                      <span className="text-[11px] text-slate-200">{p.label}</span>
                      {isAdminLocked && <span className="text-[8px] text-amber-400 ml-1">(Admin)</span>}
                    </div>
                    <Switch
                      checked={isAdminLocked ? true : !!form.permissions[p.key]}
                      onCheckedChange={() => { if (!isAdminLocked) togglePerm(p.key); }}
                      disabled={isAdminLocked}
                      className="scale-75"
                      data-testid={`perm-${p.key}`}
                    />
                  </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowDialog(false)} className="border-slate-600 text-slate-300 h-8">Cancel</Button>
              <Button size="sm" onClick={save} className="bg-amber-500 hover:bg-amber-600 text-slate-900 h-8" data-testid="save-user-btn">
                {editingUser ? "Update" : "Create User"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}



// ======================= AUDIT LOG TAB =======================

const COLLECTION_LABELS = {
  mill_entries: "Mill Entry",
  cash_transactions: "Cash Book",
  private_paddy: "Pvt Paddy",
  rice_sales: "Rice Sale",
  truck_payments: "Truck Payment",
};

const ACTION_COLORS = {
  create: "bg-green-600/20 text-green-400",
  update: "bg-amber-600/20 text-amber-400",
  delete: "bg-red-600/20 text-red-400",
  payment: "bg-blue-600/20 text-blue-400",
  undo_payment: "bg-red-600/20 text-red-400",
};

function AuditLogTab({ user }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterUser, setFilterUser] = useState("");
  const [filterCollection, setFilterCollection] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [retentionDays, setRetentionDays] = useState("");
  const showConfirm = useConfirm();

  const fetchLogs = async () => {
    try {
      let url = `${API}/audit-log?username=${user.username}&role=${user.role}&page=${page}&page_size=30`;
      if (filterUser) url += `&filter_user=${filterUser}`;
      if (filterCollection) url += `&filter_collection=${filterCollection}`;
      if (filterDate) url += `&filter_date=${filterDate}`;
      const res = await axios.get(url);
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
    } catch { toast.error("Audit log load nahi ho saka"); }
  };

  useEffect(() => { fetchLogs(); }, [page, filterUser, filterCollection, filterDate]);

  const handleClearAll = async () => {
    if (!await showConfirm("Clear All Audit Logs", "Kya aap sure hain? Saare audit logs delete ho jayenge!")) return;
    try {
      const res = await axios.delete(`${API}/audit-log/clear?username=${user.username}&role=${user.role}`);
      toast.success(res.data.message);
      fetchLogs();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const handleClearOld = async () => {
    const days = parseInt(retentionDays);
    if (!days || days < 1) { toast.error("Valid din enter karo (1+)"); return; }
    if (!await showConfirm("Purane Logs Delete", `${days} din se purane audit logs delete ho jayenge. Sure?`)) return;
    try {
      const res = await axios.delete(`${API}/audit-log/clear?username=${user.username}&role=${user.role}&days=${days}`);
      toast.success(res.data.message);
      setRetentionDays("");
      fetchLogs();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const formatTime = (ts) => {
    if (!ts) return "-";
    const d = new Date(ts);
    return `${d.toLocaleDateString("en-IN")} ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <div className="space-y-3" data-testid="audit-log-tab">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
              <History className="w-4 h-4 text-amber-400" /> Audit Log - Kisne Kya Kiya
            </CardTitle>
            <span className="text-[10px] text-slate-500">{total} records</span>
          </div>
          {/* Cleanup controls */}
          <div className="flex items-center gap-2 mt-2">
            <Input type="number" min="1" value={retentionDays} onChange={e => setRetentionDays(e.target.value)}
              placeholder="Din..." className="bg-slate-700 border-slate-600 text-white h-7 text-xs w-20" data-testid="audit-retention-days" />
            <Button size="sm" variant="outline" className="h-7 text-xs border-amber-600 text-amber-400 hover:bg-amber-600/20"
              onClick={handleClearOld} data-testid="audit-clear-old-btn">
              <Trash2 className="w-3 h-3 mr-1" /> Purane Delete
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs border-red-600 text-red-400 hover:bg-red-600/20"
              onClick={handleClearAll} data-testid="audit-clear-all-btn">
              <Trash2 className="w-3 h-3 mr-1" /> Sab Clear
            </Button>
          </div>
          {/* Filters */}
          <div className="flex gap-2 mt-2">
            <Input value={filterUser} onChange={e => { setFilterUser(e.target.value); setPage(1); }}
              placeholder="User filter..." className="bg-slate-700 border-slate-600 text-white h-7 text-xs w-32" />
            <Select value={filterCollection || "_all"} onValueChange={v => { setFilterCollection(v === "_all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-7 text-xs w-36">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                <SelectItem value="_all" className="text-white text-xs">All Types</SelectItem>
                {Object.entries(COLLECTION_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-white text-xs">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={filterDate} onChange={e => { setFilterDate(e.target.value); setPage(1); }}
              className="bg-slate-700 border-slate-600 text-white h-7 text-xs w-36" />
            {(filterUser || filterCollection || filterDate) && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-400"
                onClick={() => { setFilterUser(""); setFilterCollection(""); setFilterDate(""); setPage(1); }}>Clear</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-1">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 px-3 py-2 bg-slate-700/30 rounded hover:bg-slate-700/50 transition-colors">
                <div className="flex-shrink-0 mt-0.5">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${ACTION_COLORS[log.action] || "bg-slate-600/30 text-slate-400"}`}>
                    {log.action.toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-200">{log.summary}</p>
                  {log.changes && Object.keys(log.changes).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Object.entries(log.changes).slice(0, 4).map(([field, val]) => (
                        <span key={field} className="text-[9px] bg-slate-600/30 text-slate-400 px-1.5 py-0.5 rounded">
                          {field}: {val.old !== undefined ? `${val.old} → ` : ""}{val.new !== undefined ? val.new : ""}
                        </span>
                      ))}
                      {Object.keys(log.changes).length > 4 && (
                        <span className="text-[9px] text-slate-500">+{Object.keys(log.changes).length - 4} more</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-[10px] text-amber-400 font-medium">{log.username}</p>
                  <p className="text-[9px] text-slate-500">{formatTime(log.timestamp)}</p>
                  <p className="text-[9px] text-slate-600">{COLLECTION_LABELS[log.collection] || log.collection}</p>
                </div>
              </div>
            ))}
            {logs.length === 0 && (
              <p className="text-center text-slate-500 text-xs py-6">Koi audit log nahi mila</p>
            )}
          </div>
          {/* Pagination */}
          {total > 30 && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <Button variant="outline" size="sm" className="h-6 text-[10px] border-slate-600 text-slate-300"
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Prev</Button>
              <span className="text-[10px] text-slate-400">Page {page} / {Math.ceil(total / 30)}</span>
              <Button variant="outline" size="sm" className="h-6 text-[10px] border-slate-600 text-slate-300"
                onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 30)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


// ======================= MAIN SETTINGS COMPONENT =======================

const SUB_TABS = [
  { id: "users", label: "Users", icon: Users },
  { id: "audit", label: "Audit Log", icon: History },
  { id: "branding", label: "Branding", icon: Key },
  { id: "gst", label: "GST", icon: Calculator },
  { id: "stock", label: "Stock", icon: Package },
  { id: "messaging", label: "Messaging", icon: Send },
  { id: "camera", label: "Camera", icon: Camera },
  { id: "weighbridge", label: "Weighbridge", icon: Scale },
  { id: "data", label: "Data", icon: HardDrive },
  { id: "errorlog", label: "Error Log", icon: AlertCircle },
];

export default function Settings({ user, setUser, kmsYear, onBrandingUpdate }) {
  const [activeSubTab, setActiveSubTab] = useState("users");

  return (
    <div className="max-w-4xl mx-auto" data-testid="settings-page">
      {/* Sub-tab Navigation */}
      <div className="mb-6">
        <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
          <TabsList className="w-full bg-slate-800/80 border border-slate-700 h-auto p-1 flex justify-between" data-testid="settings-sub-tabs">
            {SUB_TABS.map(tab => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-1 px-2 py-2 text-[11px] font-medium data-[state=active]:bg-amber-600 data-[state=active]:text-white text-slate-400 hover:text-slate-200 transition-colors rounded-md flex-1 justify-center"
                data-testid={`settings-tab-${tab.id}`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="users">
            <UsersTab user={user} />
          </TabsContent>
          <TabsContent value="audit">
            <AuditLogTab user={user} />
          </TabsContent>
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
