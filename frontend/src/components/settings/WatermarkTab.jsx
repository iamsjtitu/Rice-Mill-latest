import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Droplets, Upload, Type, Image } from "lucide-react";
import { API } from "./settingsConstants";

function WatermarkTab() {
  const [settings, setSettings] = useState({ enabled: false, type: 'text', text: '', opacity: 0.06, font_size: 52, rotation: 45 });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/settings/watermark`);
      setSettings(data);
    } catch (e) { console.error('Watermark settings load error:', e); /* first time - use defaults */ }
    setLoading(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/settings/watermark`, settings);
      toast.success('Watermark settings save ho gaya');
    } catch (e) { toast.error('Save failed'); }
    setSaving(false);
  };

  const uploadImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await axios.post(`${API}/settings/watermark/upload`, fd);
      setSettings(prev => ({ ...prev, type: 'image', image_path: data.image_path }));
      toast.success('Image upload ho gayi');
    } catch (e) { console.error('Watermark upload error:', e); toast.error('Upload failed'); }
  };

  const opacityPercent = Math.round((settings.opacity || 0.06) * 100);

  if (loading) return <div className="text-center py-8 text-slate-400">Loading...</div>;

  return (
    <div className="space-y-4" data-testid="watermark-settings">
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
            <Droplets className="w-4 h-4 text-amber-500" /> PDF Watermark Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Enable/Disable */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-slate-700 text-sm font-medium">Watermark Enable karein</Label>
              <p className="text-slate-400 text-xs mt-0.5">ON karne par sabhi PDF exports mein watermark aayega</p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={v => setSettings(p => ({ ...p, enabled: v }))}
              data-testid="watermark-toggle"
            />
          </div>

          {settings.enabled && (
            <>
              {/* Type Selection */}
              <div>
                <Label className="text-slate-500 text-xs mb-2 block font-medium">Watermark Type</Label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={settings.type === 'text' ? 'default' : 'outline'}
                    className={settings.type === 'text' ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}
                    onClick={() => setSettings(p => ({ ...p, type: 'text' }))}
                    data-testid="watermark-type-text"
                  >
                    <Type className="w-3.5 h-3.5 mr-1.5" /> Text
                  </Button>
                  <Button
                    size="sm"
                    variant={settings.type === 'image' ? 'default' : 'outline'}
                    className={settings.type === 'image' ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}
                    onClick={() => setSettings(p => ({ ...p, type: 'image' }))}
                    data-testid="watermark-type-image"
                  >
                    <Image className="w-3.5 h-3.5 mr-1.5" /> Image
                  </Button>
                </div>
              </div>

              {/* Text Input */}
              {settings.type === 'text' && (
                <div>
                  <Label className="text-slate-500 text-xs mb-1 block font-medium">Watermark Text (Company Name / Custom Text)</Label>
                  <Input
                    value={settings.text || ''}
                    onChange={e => setSettings(p => ({ ...p, text: e.target.value }))}
                    placeholder="e.g. NAVKAR AGRO"
                    className="bg-white border-slate-300 text-slate-800"
                    data-testid="watermark-text-input"
                  />
                </div>
              )}

              {/* Image Upload */}
              {settings.type === 'image' && (
                <div>
                  <Label className="text-slate-500 text-xs mb-1 block font-medium">Watermark Image (Logo)</Label>
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm" variant="outline"
                      className="border-slate-300 text-slate-600 hover:bg-slate-50"
                      onClick={() => fileRef.current?.click()}
                      data-testid="watermark-upload-btn"
                    >
                      <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload Image
                    </Button>
                    <input ref={fileRef} type="file" accept="image/*" onChange={uploadImage} className="hidden" />
                    {settings.image_path && (
                      <span className="text-green-600 text-xs flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Image uploaded
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Opacity Slider */}
              <div>
                <Label className="text-slate-500 text-xs mb-1 block font-medium">Opacity (Halkapan): {opacityPercent}%</Label>
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 text-xs">2%</span>
                  <input
                    type="range" min="2" max="20" value={opacityPercent}
                    onChange={e => setSettings(p => ({ ...p, opacity: parseInt(e.target.value) / 100 }))}
                    className="flex-1 accent-amber-500"
                    data-testid="watermark-opacity-slider"
                  />
                  <span className="text-slate-400 text-xs">20%</span>
                </div>
                <p className="text-slate-400 text-[10px] mt-1">Kam value = zyada halka watermark (bank documents jaisa)</p>
              </div>

              {/* Font Size & Rotation - only for text type */}
              {settings.type === 'text' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-500 text-xs mb-1 block font-medium">Font Size: {settings.font_size || 52}px</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-xs">20</span>
                      <input
                        type="range" min="20" max="120" value={settings.font_size || 52}
                        onChange={e => setSettings(p => ({ ...p, font_size: parseInt(e.target.value) }))}
                        className="flex-1 accent-amber-500"
                        data-testid="watermark-fontsize-slider"
                      />
                      <span className="text-slate-400 text-xs">120</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-500 text-xs mb-1 block font-medium">Rotation Angle: {settings.rotation || 45}°</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-xs">0°</span>
                      <input
                        type="range" min="0" max="90" value={settings.rotation || 45}
                        onChange={e => setSettings(p => ({ ...p, rotation: parseInt(e.target.value) }))}
                        className="flex-1 accent-amber-500"
                        data-testid="watermark-rotation-slider"
                      />
                      <span className="text-slate-400 text-xs">90°</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview Box - Tiled Watermark */}
              <div className="relative bg-white border border-slate-200 rounded-lg p-8 overflow-hidden" style={{ minHeight: 160 }}>
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {settings.type === 'text' ? (
                    <div className="absolute inset-0" style={{ opacity: Math.max((settings.opacity || 0.06) * 3, 0.15) }}>
                      {[0, 1, 2, 3, 4].map(row => (
                        <div key={row} className="flex gap-8 whitespace-nowrap" style={{ transform: `rotate(-${settings.rotation || 45}deg) translateY(${row * 50 - 60}px) translateX(-40px)` }}>
                          {[0, 1, 2, 3].map(col => (
                            <span key={col} style={{ fontSize: `${Math.min(settings.font_size || 52, 36)}px` }} className="font-bold text-slate-400 select-none">
                              {settings.text || 'WATERMARK'}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    settings.image_path ? (
                      <div className="absolute inset-0 flex flex-wrap gap-4 items-center justify-center" style={{ opacity: Math.max((settings.opacity || 0.06) * 3, 0.15) }}>
                        {[0, 1, 2, 3].map(i => <Droplets key={i} className="w-16 h-16 text-slate-400" />)}
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ opacity: 0.15 }}>
                        <span className="text-2xl font-bold text-slate-300">IMAGE</span>
                      </div>
                    )
                  )}
                </div>
                <div className="relative z-10 text-center">
                  <p className="text-slate-700 text-sm font-bold">PDF Preview</p>
                  <p className="text-slate-400 text-xs">Yeh dikhata hai watermark kaise dikhega - puri page par repeat hota hai</p>
                  <p className="text-amber-500 text-[10px] mt-1">(Preview mein thoda zyada dikhai deta hai, actual PDF mein halka hoga)</p>
                </div>
              </div>
            </>
          )}

          <Button onClick={save} disabled={saving} className="bg-amber-600 hover:bg-amber-500 text-white w-full" data-testid="watermark-save-btn">
            {saving ? 'Saving...' : 'Save Watermark Settings'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default WatermarkTab;
