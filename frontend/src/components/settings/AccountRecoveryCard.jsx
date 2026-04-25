import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShieldCheck, Key, MessageCircle, Copy, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { API } from "./settingsConstants";

/**
 * Account Recovery Card — Admin-only.
 * Manages: (a) Recovery Code (one-time, hashed) and (b) Recovery WhatsApp number for OTP-based reset.
 */
export function AccountRecoveryCard({ user }) {
  const [codeStatus, setCodeStatus] = useState({ has_code: false, set_at: "" });
  const [waInfo, setWaInfo] = useState({ has_number: false, masked: "", whatsapp: "" });
  const [loading, setLoading] = useState(false);

  // Generate code dialog
  const [genOpen, setGenOpen] = useState(false);
  const [genPassword, setGenPassword] = useState("");
  const [genCode, setGenCode] = useState("");

  // WhatsApp dialog
  const [waOpen, setWaOpen] = useState(false);
  const [waPassword, setWaPassword] = useState("");
  const [waNumber, setWaNumber] = useState("");

  const refresh = async () => {
    try {
      const [codeRes, waRes] = await Promise.all([
        axios.get(`${API}/auth/recovery-code/status?username=${user.username}&role=${user.role}`),
        axios.get(`${API}/auth/recovery-whatsapp?username=${user.username}&role=${user.role}`),
      ]);
      setCodeStatus(codeRes.data || { has_code: false });
      setWaInfo(waRes.data || { has_number: false });
    } catch (e) { /* admin-only; silent if fails */ }
  };
  useEffect(() => { refresh(); }, [user.username]); // eslint-disable-line react-hooks/exhaustive-deps

  const isAdmin = user.role === "admin";
  if (!isAdmin) return null;

  const handleGenerateCode = async () => {
    if (!genPassword.trim()) return toast.error("Current password daalein");
    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/recovery-code/generate`, {
        username: user.username, current_password: genPassword,
      });
      setGenCode(res.data.code || "");
      setGenPassword("");
      toast.success("Recovery code generate ho gaya — abhi save kar lo!");
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Generate fail");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveWhatsapp = async () => {
    if (!waPassword.trim()) return toast.error("Current password daalein");
    const cleaned = waNumber.replace(/\D/g, "");
    if (waNumber && cleaned.length < 10) return toast.error("WhatsApp number kam se kam 10 digits ka hona chahiye");
    setLoading(true);
    try {
      await axios.put(`${API}/auth/recovery-whatsapp`, {
        username: user.username, current_password: waPassword, whatsapp: waNumber,
      });
      toast.success(waNumber ? "Recovery WhatsApp save ho gaya" : "Recovery WhatsApp hata diya");
      setWaOpen(false);
      setWaPassword("");
      setWaNumber("");
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save fail");
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(genCode).then(() => toast.success("Code copy ho gaya"));
  };

  return (
    <>
      <Card className="bg-white border-2 border-emerald-200 shadow-sm" data-testid="account-recovery-card">
        <CardHeader className="border-b border-emerald-100 bg-emerald-50/40 py-3 px-4">
          <CardTitle className="text-emerald-700 text-base flex items-center gap-2 font-bold">
            <ShieldCheck className="w-5 h-5" />
            Account Recovery / पासवर्ड भूल जाने पर
          </CardTitle>
          <p className="text-slate-600 text-xs">Agar password bhul gaye, toh in dono mein se kisi se reset kar sakte hain.</p>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          {/* Recovery Code Row */}
          <div className="flex items-center justify-between flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex items-start gap-2.5 min-w-0">
              <Key className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-slate-900 font-semibold text-sm">Recovery Code</p>
                {codeStatus.has_code ? (
                  <p className="text-xs text-emerald-700 font-medium">
                    ✓ Set hai — {codeStatus.set_at ? new Date(codeStatus.set_at).toLocaleString("en-IN") : "—"}
                  </p>
                ) : (
                  <p className="text-xs text-amber-700 font-medium">⚠ Set nahi hai</p>
                )}
              </div>
            </div>
            <Button
              onClick={() => { setGenOpen(true); setGenCode(""); setGenPassword(""); }}
              size="sm" variant="outline"
              className="border-2 border-blue-300 text-blue-700 hover:bg-blue-50 font-semibold"
              data-testid="generate-recovery-code-btn"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              {codeStatus.has_code ? "Regenerate Code" : "Generate Code"}
            </Button>
          </div>

          {/* WhatsApp Recovery Row */}
          <div className="flex items-center justify-between flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex items-start gap-2.5 min-w-0">
              <MessageCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-slate-900 font-semibold text-sm">Recovery WhatsApp Number</p>
                {waInfo.has_number ? (
                  <p className="text-xs text-emerald-700 font-mono font-medium">✓ {waInfo.masked}</p>
                ) : (
                  <p className="text-xs text-amber-700 font-medium">⚠ Number set nahi hai</p>
                )}
              </div>
            </div>
            <Button
              onClick={() => { setWaOpen(true); setWaPassword(""); setWaNumber(waInfo.whatsapp || ""); }}
              size="sm" variant="outline"
              className="border-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-semibold"
              data-testid="set-recovery-whatsapp-btn"
            >
              {waInfo.has_number ? "Update Number" : "Set Number"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ============ Generate Code Dialog ============ */}
      <Dialog open={genOpen} onOpenChange={(v) => { if (!v) { setGenOpen(false); setGenCode(""); setGenPassword(""); } }}>
        <DialogContent className="max-w-md bg-white border-2 border-slate-200" data-testid="generate-code-dialog">
          <DialogHeader>
            <DialogTitle className="text-slate-900 flex items-center gap-2 font-bold">
              <Key className="w-5 h-5 text-blue-600" />
              {codeStatus.has_code ? "Regenerate Recovery Code" : "Generate Recovery Code"}
            </DialogTitle>
          </DialogHeader>

          {!genCode ? (
            <>
              {codeStatus.has_code && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2.5 text-xs text-amber-900 flex gap-2 items-start">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Naya code generate karne se purana code <b>invalid</b> ho jayega.</span>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-slate-700 text-sm font-semibold">Confirm with Current Password</Label>
                <Input
                  type="password"
                  value={genPassword}
                  onChange={(e) => setGenPassword(e.target.value)}
                  placeholder="Your current password"
                  className="bg-white border-2 border-slate-300 text-slate-900 h-9"
                  data-testid="gen-code-password-input"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setGenOpen(false)} className="border-slate-300 text-slate-700">Cancel</Button>
                <Button onClick={handleGenerateCode} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold" data-testid="gen-code-confirm-btn">
                  {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</> : "Generate"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-lg p-4 text-center space-y-2">
                <p className="text-xs text-emerald-700 font-bold uppercase tracking-wider">Aapka Recovery Code</p>
                <p className="font-mono text-2xl font-bold text-slate-900 tracking-widest break-all" data-testid="recovery-code-display">{genCode}</p>
                <Button
                  onClick={copyCode}
                  size="sm" variant="outline"
                  className="border-2 border-emerald-300 text-emerald-700 hover:bg-emerald-100 font-semibold"
                  data-testid="copy-recovery-code-btn"
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
                </Button>
              </div>
              <div className="bg-red-50 border border-red-200 rounded p-2.5 text-xs text-red-800 flex gap-2 items-start">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Ye code <b>sirf abhi dikhega</b>. Iska screenshot le lo / paper pe likh lo / safe jagah save karo. Dialog band hone ke baad dobara nahi dikhega.</span>
              </div>
              <Button onClick={() => setGenOpen(false)} className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold" data-testid="gen-code-done-btn">
                Maine Save Kar Liya / I've Saved It
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ Set WhatsApp Dialog ============ */}
      <Dialog open={waOpen} onOpenChange={(v) => { if (!v) setWaOpen(false); }}>
        <DialogContent className="max-w-md bg-white border-2 border-slate-200" data-testid="set-whatsapp-dialog">
          <DialogHeader>
            <DialogTitle className="text-slate-900 flex items-center gap-2 font-bold">
              <MessageCircle className="w-5 h-5 text-emerald-600" />
              {waInfo.has_number ? "Update Recovery WhatsApp" : "Set Recovery WhatsApp"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-600">
            Forgot Password ke time is number pe OTP bheja jayega. 360Messenger ke through bheja jata hai (Settings → Messaging mein API key set honi chahiye).
          </p>
          <div className="space-y-1.5">
            <Label className="text-slate-700 text-sm font-semibold">WhatsApp Number (10 digits, country code optional)</Label>
            <Input
              value={waNumber}
              onChange={(e) => setWaNumber(e.target.value)}
              placeholder="9876543210"
              className="bg-white border-2 border-slate-300 text-slate-900 h-9 font-mono"
              data-testid="recovery-whatsapp-input"
              autoFocus
            />
            <p className="text-xs text-slate-500">Empty chhodne par recovery number remove ho jayega.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-700 text-sm font-semibold">Confirm with Current Password</Label>
            <Input
              type="password"
              value={waPassword}
              onChange={(e) => setWaPassword(e.target.value)}
              placeholder="Your current password"
              className="bg-white border-2 border-slate-300 text-slate-900 h-9"
              data-testid="recovery-whatsapp-password-input"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setWaOpen(false)} className="border-slate-300 text-slate-700">Cancel</Button>
            <Button onClick={handleSaveWhatsapp} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold" data-testid="recovery-whatsapp-save-btn">
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AccountRecoveryCard;
