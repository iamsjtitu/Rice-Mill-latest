import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Key } from "lucide-react";
import { API } from "./settingsConstants";

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
            <div key={`cf-${cf.label || ''}-${idx}`} className="grid grid-cols-12 gap-2 items-end" data-testid={`custom-field-row-${idx}`}>
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
                  <div key={`prev-${f.label}-${f.value}-${i}`}>{f.label ? <><span className="font-semibold">{f.label}:</span> {f.value}</> : f.value}</div>
                ))}
              </div>
              <div className="text-center">
                {(brandingForm.custom_fields || []).filter(f => f.position === 'center' && f.placement === 'above' && f.value).map((f, i) => (
                  <div key={`prev-${f.label}-${f.value}-${i}`}>{f.label ? <><span className="font-semibold">{f.label}:</span> {f.value}</> : f.value}</div>
                ))}
              </div>
              <div className="text-right">
                {(brandingForm.custom_fields || []).filter(f => f.position === 'right' && f.placement === 'above' && f.value).map((f, i) => (
                  <div key={`prev-${f.label}-${f.value}-${i}`}>{f.label ? <><span className="font-semibold">{f.label}:</span> {f.value}</> : f.value}</div>
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
                  <div key={`prev-${f.label}-${f.value}-${i}`}>{f.label ? <><span className="font-semibold">{f.label}:</span> {f.value}</> : f.value}</div>
                ))}
              </div>
              <div className="text-center">
                {(brandingForm.custom_fields || []).filter(f => f.position === 'center' && (f.placement || 'below') === 'below' && f.value).map((f, i) => (
                  <div key={`prev-${f.label}-${f.value}-${i}`}>{f.label ? <><span className="font-semibold">{f.label}:</span> {f.value}</> : f.value}</div>
                ))}
              </div>
              <div className="text-right">
                {(brandingForm.custom_fields || []).filter(f => f.position === 'right' && (f.placement || 'below') === 'below' && f.value).map((f, i) => (
                  <div key={`prev-${f.label}-${f.value}-${i}`}>{f.label ? <><span className="font-semibold">{f.label}:</span> {f.value}</> : f.value}</div>
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

export default BrandingTab;
