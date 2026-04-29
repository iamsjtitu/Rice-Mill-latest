import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Lock, Clock, ShieldCheck } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function PermissionsTab() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/settings/edit-window`);
        setEnabled(!!res.data?.enabled);
      } catch (e) {
        toast.error("Setting load nahi hua: " + (e.response?.data?.detail || e.message));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleToggle = async (checked) => {
    setSaving(true);
    try {
      const res = await axios.put(`${API}/settings/edit-window`, { enabled: checked });
      setEnabled(!!res.data?.enabled);
      toast.success(checked
        ? "5-minute Edit Window ENABLED — entries 5 min ke andar hi edit/delete ho sakti hain"
        : "5-minute Edit Window DISABLED — koi bhi entry kabhi bhi edit/delete kar sakte hain");
    } catch (e) {
      toast.error("Save fail: " + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
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
                    5-Minute Edit Window
                  </Label>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Non-admin users sirf 5 min ke andar apni entries edit/delete kar sakte hain
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
              <div className="mt-3 px-3 py-2 bg-slate-900/50 rounded text-[11px] text-slate-300 leading-relaxed">
                {enabled ? (
                  <>
                    <span className="text-emerald-400 font-bold">✅ ON:</span> Saare modules me 5-min lock active hai —
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
              <span className="text-xs font-bold">Why 5 minutes?</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Quick typo fixes allow karta hai but accidental old-data tampering rok deta hai.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
