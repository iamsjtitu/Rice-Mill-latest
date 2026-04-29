import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, Clock, ShieldCheck } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PRESETS = [2, 5, 10, 30, 60];

export default function PermissionsTab() {
  const [enabled, setEnabled] = useState(true);
  const [durationMin, setDurationMin] = useState(5);
  const [draftDuration, setDraftDuration] = useState("5");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/settings/edit-window`);
        setEnabled(!!res.data?.enabled);
        const d = parseInt(res.data?.duration_minutes ?? 5, 10) || 5;
        setDurationMin(d);
        setDraftDuration(String(d));
      } catch (e) {
        toast.error("Setting load nahi hua: " + (e.response?.data?.detail || e.message));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveSettings = async (nextEnabled, nextDuration) => {
    setSaving(true);
    try {
      const res = await axios.put(`${API}/settings/edit-window`, {
        enabled: nextEnabled,
        duration_minutes: nextDuration,
      });
      const newEnabled = !!res.data?.enabled;
      const newDur = parseInt(res.data?.duration_minutes ?? nextDuration, 10) || 5;
      setEnabled(newEnabled);
      setDurationMin(newDur);
      setDraftDuration(String(newDur));
      return { newEnabled, newDur };
    } catch (e) {
      toast.error("Save fail: " + (e.response?.data?.detail || e.message));
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (checked) => {
    try {
      const { newEnabled, newDur } = await saveSettings(checked, durationMin);
      toast.success(newEnabled
        ? `${newDur}-minute Edit Window ENABLED — entries ${newDur} min ke andar hi edit/delete ho sakti hain`
        : "Edit Window DISABLED — koi bhi entry kabhi bhi edit/delete kar sakte hain");
    } catch (e) { /* already toasted */ }
  };

  const applyDuration = async (mins) => {
    const n = parseInt(mins, 10);
    if (!Number.isFinite(n) || n < 1 || n > 1440) {
      toast.error("Duration 1 se 1440 minutes ke beech honi chahiye");
      setDraftDuration(String(durationMin));
      return;
    }
    try {
      const { newDur } = await saveSettings(enabled, n);
      toast.success(`Edit window duration set to ${newDur} minute${newDur > 1 ? 's' : ''}`);
    } catch (e) { /* already toasted */ }
  };

  if (loading) return <div className="text-slate-400 text-sm p-4" data-testid="perm-loading">Loading...</div>;

  return (
    <div className="space-y-4" data-testid="permissions-tab">
      <Card className="bg-slate-800/60 border-slate-700">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="edit-window-toggle" className="text-base text-white font-semibold cursor-pointer">
                    Edit Window Lock
                  </Label>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Non-admin users sirf {durationMin} min ke andar apni entries edit/delete kar sakte hain
                  </p>
                </div>
                <Switch
                  id="edit-window-toggle"
                  checked={enabled}
                  onCheckedChange={handleToggle}
                  disabled={saving}
                  data-testid="edit-window-toggle"
                  className="data-[state=checked]:bg-amber-500"
                />
              </div>

              {/* Duration controls */}
              <div className={`mt-3 ${enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                <Label className="text-xs text-slate-300 font-semibold">Duration (minutes)</Label>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {PRESETS.map(m => (
                    <Button
                      key={m}
                      size="sm"
                      variant="outline"
                      disabled={saving || !enabled}
                      onClick={() => applyDuration(m)}
                      className={`h-7 px-2.5 text-xs ${durationMin === m ? 'bg-amber-600 border-amber-500 text-white' : 'border-slate-600 text-slate-300 hover:bg-slate-700'}`}
                      data-testid={`duration-preset-${m}`}
                    >
                      {m} min
                    </Button>
                  ))}
                  <span className="text-slate-500 text-xs px-1">or custom:</span>
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={draftDuration}
                    onChange={e => setDraftDuration(e.target.value)}
                    onBlur={() => {
                      const n = parseInt(draftDuration, 10);
                      if (Number.isFinite(n) && n !== durationMin) applyDuration(n);
                      else setDraftDuration(String(durationMin));
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                    disabled={saving || !enabled}
                    className="w-20 h-7 text-xs bg-slate-700 border-slate-600 text-white"
                    data-testid="duration-custom-input"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Range: 1 to 1440 minutes (24 hours)</p>
              </div>

              <div className="mt-3 px-3 py-2 bg-slate-900/50 rounded text-[11px] text-slate-300 leading-relaxed">
                {enabled ? (
                  <>
                    <span className="text-emerald-400 font-bold">✅ ON ({durationMin} min):</span> Saare modules me lock active hai —
                    Mill Entries, Cash Book, Vehicle Weight, Hemali, Sale/Purchase Vouchers, Staff, etc.
                    Admin kabhi bhi edit/delete kar sakte hain.
                  </>
                ) : (
                  <>
                    <span className="text-amber-400 font-bold">⚠️ OFF:</span> Lock disable hai. Saare users entries
                    kabhi bhi edit/delete kar sakte hain (sirf ownership check active rahega).
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-slate-800/40 border-slate-700">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-xs font-bold">Admin Override</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Admin kabhi bhi koi bhi entry edit/delete kar sakte hain — yeh setting unhe affect nahi karti.
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/40 border-slate-700">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-blue-400">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-bold">Why a time limit?</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Quick typo fixes allow karta hai but accidental ya intentional old-data tampering rok deta hai.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
