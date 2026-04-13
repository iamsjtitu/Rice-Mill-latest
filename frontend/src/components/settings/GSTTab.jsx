import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Calculator, FileText } from "lucide-react";
import { API } from "./settingsConstants";
import logger from "../../utils/logger";

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    try {
      await axios.put(`${API}/gst-settings`, gst);
      toast.success("GST settings save ho gayi!");
    } catch (e) { logger.error(e); toast.error("GST save error"); }
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    try {
      await axios.put(`${API}/gst-company-settings`, data);
      toast.success("GST Company settings save ho gayi!");
    } catch (e) { logger.error(e); toast.error("Save error"); }
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

export default GSTTab;
