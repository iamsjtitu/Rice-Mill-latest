import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MessageCircle, Key, Loader2, ShieldCheck } from "lucide-react";
import { PasswordStrengthMeter, isPasswordValid } from "./PasswordStrengthMeter";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

/**
 * Forgot Password Modal — two flows:
 *  1) WhatsApp OTP   → request OTP → enter OTP + new password
 *  2) Recovery Code  → enter code + new password
 */
export function ForgotPasswordDialog({ open, onOpenChange }) {
  const [mode, setMode] = useState("whatsapp");

  // Shared
  const [username, setUsername] = useState("admin");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // WhatsApp flow
  const [otpSent, setOtpSent] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);

  // Recovery flow
  const [recoveryCode, setRecoveryCode] = useState("");

  // Submit
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    onOpenChange(false);
    setTimeout(() => {
      // Reset state after dialog close animation
      setMode("whatsapp");
      setUsername("admin");
      setNewPassword("");
      setConfirmPassword("");
      setOtp("");
      setOtpSent(false);
      setMaskedPhone("");
      setRecoveryCode("");
      setSubmitting(false);
      setSendingOtp(false);
    }, 200);
  };

  const validateNewPassword = () => {
    if (!isPasswordValid(newPassword)) {
      toast.error("Password kam se kam 6 characters ka hona chahiye");
      return false;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Naya password aur confirm password match nahi kar rahe");
      return false;
    }
    return true;
  };

  const handleSendOtp = async () => {
    if (!username.trim()) return toast.error("Username daalein");
    setSendingOtp(true);
    try {
      const res = await axios.post(`${API}/auth/forgot-password/send-otp`, { username: username.trim() });
      setOtpSent(true);
      setMaskedPhone(res.data.masked_phone || "");
      toast.success(res.data.message || "OTP bhej diya");
    } catch (e) {
      toast.error(e.response?.data?.detail || "OTP bhejne mein error");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp.trim() || otp.length !== 6) return toast.error("6-digit OTP daalein");
    if (!validateNewPassword()) return;
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/auth/forgot-password/verify-otp`, {
        username: username.trim(), otp: otp.trim(), new_password: newPassword,
      });
      toast.success(res.data.message || "Password reset ho gaya!");
      close();
    } catch (e) {
      toast.error(e.response?.data?.detail || "OTP verify fail");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecoveryCode = async (e) => {
    e.preventDefault();
    if (!recoveryCode.trim()) return toast.error("Recovery code daalein");
    if (!validateNewPassword()) return;
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/auth/forgot-password/recovery-code`, {
        username: username.trim(), code: recoveryCode.trim(), new_password: newPassword,
      });
      toast.success(res.data.message || "Password reset ho gaya!");
      close();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Recovery code galat hai");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="max-w-md bg-white border-2 border-slate-200" data-testid="forgot-password-dialog">
        <DialogHeader>
          <DialogTitle className="text-slate-900 flex items-center gap-2 text-lg font-bold">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            Forgot Password / पासवर्ड भूल गए?
          </DialogTitle>
          <p className="text-slate-600 text-sm">Apna password reset karein WhatsApp OTP ya Recovery Code se.</p>
        </DialogHeader>

        {/* Username */}
        <div className="space-y-1.5">
          <Label className="text-slate-700 text-sm font-semibold">Username</Label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            className="bg-white border-2 border-slate-300 text-slate-900 h-9"
            data-testid="fp-username-input"
            disabled={otpSent}
          />
        </div>

        <Tabs value={mode} onValueChange={(v) => { setMode(v); setOtpSent(false); }} className="w-full">
          <TabsList className="grid grid-cols-2 bg-slate-100 border border-slate-200">
            <TabsTrigger value="whatsapp" className="data-[state=active]:bg-white data-[state=active]:text-emerald-700 font-semibold" data-testid="fp-tab-whatsapp">
              <MessageCircle className="w-4 h-4.5" /> OTP
            </TabsTrigger>
            <TabsTrigger value="code" className="data-[state=active]:bg-white data-[state=active]:text-blue-700 font-semibold" data-testid="fp-tab-code">
              <Key className="w-4 h-4 mr-1.5" /> Recovery Code
            </TabsTrigger>
          </TabsList>

          {/* ============ TAB 1: WhatsApp OTP ============ */}
          <TabsContent value="whatsapp" className="space-y-3 mt-3">
            {!otpSent ? (
              <>
                <p className="text-slate-600 text-xs leading-relaxed">
                  Aapke registered WhatsApp number pe ek 6-digit OTP bheja jayega.
                </p>
                <Button
                  onClick={handleSendOtp}
                  disabled={sendingOtp}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-10"
                  data-testid="fp-send-otp-btn"
                >
                  {sendingOtp ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Bhej raha hai...</> : "OTP Bhejein / OTP Send"}
                </Button>
              </>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-3">
                <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-3 text-xs text-emerald-900">
                  <p className="font-semibold">OTP bhej diya: <span className="font-mono">{maskedPhone}</span></p>
                  <p className="mt-1">10 minutes ke andar enter karein. Naya OTP chahiye?
                    <button type="button" onClick={() => { setOtpSent(false); setOtp(""); }} className="ml-1 underline font-semibold">Resend</button>
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-700 text-sm font-semibold">6-Digit OTP</Label>
                  <Input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    maxLength={6}
                    inputMode="numeric"
                    className="bg-white border-2 border-slate-300 text-slate-900 h-10 font-mono text-center tracking-widest text-lg"
                    data-testid="fp-otp-input"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-700 text-sm font-semibold">New Password</Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Naya password"
                    className="bg-white border-2 border-slate-300 text-slate-900 h-9"
                    data-testid="fp-new-password-otp"
                  />
                  <PasswordStrengthMeter password={newPassword} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-700 text-sm font-semibold">Confirm New Password</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm"
                    className="bg-white border-2 border-slate-300 text-slate-900 h-9"
                    data-testid="fp-confirm-password-otp"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-10"
                  data-testid="fp-verify-submit-btn"
                >
                  {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Reset ho raha hai...</> : "Reset Password"}
                </Button>
              </form>
            )}
          </TabsContent>

          {/* ============ TAB 2: Recovery Code ============ */}
          <TabsContent value="code" className="space-y-3 mt-3">
            <form onSubmit={handleRecoveryCode} className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-slate-700 text-sm font-semibold">Recovery Code (16 chars)</Label>
                <Input
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  className="bg-white border-2 border-slate-300 text-slate-900 h-10 font-mono uppercase tracking-wider"
                  data-testid="fp-recovery-code-input"
                  autoFocus
                />
                <p className="text-xs text-slate-500">Ye code aapne Settings → Account Recovery se generate kiya tha.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-700 text-sm font-semibold">New Password</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Naya password"
                  className="bg-white border-2 border-slate-300 text-slate-900 h-9"
                  data-testid="fp-new-password-code"
                />
                <PasswordStrengthMeter password={newPassword} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-700 text-sm font-semibold">Confirm New Password</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm"
                  className="bg-white border-2 border-slate-300 text-slate-900 h-9"
                  data-testid="fp-confirm-password-code"
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded p-2.5 text-xs text-amber-900">
                <span className="font-semibold">⚠ Note:</span> Ye recovery code use hone ke baad invalid ho jayega. Reset ke baad Settings se naya code generate karein.
              </div>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold h-10"
                data-testid="fp-code-submit-btn"
              >
                {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Reset ho raha hai...</> : "Reset Password with Code"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end pt-2 border-t border-slate-200">
          <Button variant="outline" onClick={close} className="border-slate-300 text-slate-700 hover:bg-slate-50" data-testid="fp-cancel-btn">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ForgotPasswordDialog;
