import { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Cloud, ExternalLink, Copy, Loader2, CircleCheck, CircleAlert, Power, Download } from "lucide-react";

/**
 * Cloud Access section inside Settings > License tab.
 * Only works in Electron (uses window.electronAPI). On web/LAN deployments
 * it renders a graceful placeholder.
 */
export default function CloudAccessSection() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, message: "" });
  const [showConfirmForce, setShowConfirmForce] = useState(false);
  const progressListenerRef = useRef(false);

  const isElectron = typeof window !== "undefined" && window.electronAPI && typeof window.electronAPI.cloudAccessStatus === "function";

  const refresh = async () => {
    if (!isElectron) { setLoading(false); return; }
    try {
      const s = await window.electronAPI.cloudAccessStatus();
      setStatus(s);
    } catch (e) {
      setStatus({ success: false, error: e.message });
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    if (isElectron && !progressListenerRef.current) {
      progressListenerRef.current = true;
      window.electronAPI.onCloudAccessProgress(({ pct, message }) => {
        setProgress({ pct, message });
      });
    }
    return () => {
      if (isElectron) window.electronAPI.removeCloudAccessListeners();
    };
    // eslint-disable-next-line
  }, []);

  const enable = async (force = false) => {
    setBusy(true);
    setProgress({ pct: 1, message: "Starting…" });
    try {
      const r = await window.electronAPI.cloudAccessEnable({ force });
      if (r.requires_confirmation) {
        setShowConfirmForce(true);
        setBusy(false);
        setProgress({ pct: 0, message: "" });
        return;
      }
      if (r.success) {
        toast.success("Cloud Access is live! Accessible at " + r.hostname);
        await refresh();
      } else {
        toast.error(r.error || "Enable failed");
      }
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
    setProgress({ pct: 0, message: "" });
    setShowConfirmForce(false);
  };

  const stopService = async () => {
    setBusy(true);
    try {
      const r = await window.electronAPI.cloudAccessStop();
      if (r.success) { toast.success("Tunnel paused"); await refresh(); }
      else toast.error(r.error);
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  const startService = async () => {
    setBusy(true);
    try {
      const r = await window.electronAPI.cloudAccessStart();
      if (r.success) { toast.success("Tunnel resumed"); await refresh(); }
      else toast.error(r.error);
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  const disable = async () => {
    if (!window.confirm("Disable Cloud Access?\n\nThis will uninstall the Windows service and stop the tunnel. Your system will only be accessible locally until re-enabled.")) return;
    setBusy(true);
    try {
      const r = await window.electronAPI.cloudAccessDisable();
      if (r.success) { toast.success("Cloud Access disabled"); await refresh(); }
      else toast.error(r.error);
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  const copyUrl = () => {
    const url = "https://" + status.hostname;
    navigator.clipboard.writeText(url).then(() => toast.success("URL copied"));
  };
  const openUrl = () => window.open("https://" + status.hostname, "_blank");

  if (loading) return <div className="p-4 text-center text-slate-500 text-xs" data-testid="cloud-access-loading">Loading cloud access status…</div>;

  // Web / LAN deployment (no Electron API available) → informational placeholder
  if (!isElectron) {
    return (
      <Card className="bg-slate-800/40 border-slate-700 mt-4" data-testid="cloud-access-web-stub">
        <CardContent className="p-4 flex items-center gap-3">
          <Cloud className="w-5 h-5 text-slate-500" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-200">Cloud Access</div>
            <div className="text-xs text-slate-500">Available in the Desktop App only. Install MillEntry on your mill PC to enable remote access.</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // State: already live
  if (status?.live) {
    return (
      <Card className="bg-slate-800/40 border-slate-700 mt-4" data-testid="cloud-access-live">
        <CardContent className="p-5">
          <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Cloud className="w-5 h-5 text-emerald-400" />
              <div className="text-sm font-semibold text-slate-200">Cloud Access</div>
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]" data-testid="cloud-status-badge">LIVE</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={stopService} disabled={busy} className="h-7 text-[11px] border-slate-600" data-testid="cloud-pause-btn">
                Pause
              </Button>
              <Button size="sm" variant="outline" onClick={disable} disabled={busy} className="h-7 text-[11px] border-red-500/40 text-red-400 hover:bg-red-500/10" data-testid="cloud-disable-btn">
                Disable
              </Button>
            </div>
          </div>
          <div className="p-3 bg-slate-900/60 border border-dashed border-emerald-500/40 rounded-lg flex items-center gap-2">
            <span className="font-mono font-bold text-emerald-400 text-base flex-1" data-testid="cloud-url">https://{status.hostname}</span>
            <Button size="sm" variant="outline" onClick={copyUrl} className="h-7 text-[10px] border-slate-600" data-testid="cloud-copy-btn">
              <Copy className="w-3 h-3 mr-1" /> Copy
            </Button>
            <Button size="sm" variant="outline" onClick={openUrl} className="h-7 text-[10px] border-slate-600" data-testid="cloud-open-btn">
              <ExternalLink className="w-3 h-3 mr-1" /> Open
            </Button>
          </div>
          <p className="text-xs text-slate-500 mt-3">Access your mill data from any device using the URL above. Tunnel stays active as long as this PC is on.</p>
        </CardContent>
      </Card>
    );
  }

  // State: provisioned on server but service not running
  if (status?.provisioned && !status.service_running) {
    return (
      <Card className="bg-slate-800/40 border-slate-700 mt-4" data-testid="cloud-access-paused">
        <CardContent className="p-5">
          <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Cloud className="w-5 h-5 text-amber-400" />
              <div className="text-sm font-semibold text-slate-200">Cloud Access</div>
              <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">PAUSED</Badge>
            </div>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Your tunnel <span className="font-mono text-amber-400">{status.hostname}</span> is provisioned but the local tunnel service is stopped.
          </p>
          <Button size="sm" onClick={startService} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs" data-testid="cloud-resume-btn">
            <Power className="w-3 h-3 mr-1.5" /> Resume Tunnel
          </Button>
        </CardContent>
      </Card>
    );
  }

  // State: enable-in-progress
  if (busy) {
    return (
      <Card className="bg-slate-800/40 border-slate-700 mt-4" data-testid="cloud-access-installing">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
            <div className="text-sm font-semibold text-slate-200">Setting up Cloud Access</div>
          </div>
          <Progress value={progress.pct} className="mb-2 h-2" />
          <div className="text-xs text-slate-400" data-testid="cloud-progress-message">{progress.message || "Starting…"}</div>
          <div className="text-[10px] text-slate-600 mt-1">{progress.pct}%</div>
        </CardContent>
      </Card>
    );
  }

  // State: pre-existing cloudflared service detected
  if (status?.pre_existing) {
    return (
      <Card className="bg-slate-800/40 border-slate-700 mt-4" data-testid="cloud-access-pre-existing">
        <CardContent className="p-5">
          <div className="flex items-start gap-3 mb-3">
            <CircleCheck className="w-5 h-5 text-emerald-400 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-200">Cloud Access — Pre-Configured</div>
              <p className="text-xs text-slate-400 mt-1">
                A cloudflared tunnel service is already installed on this PC (configured manually before MillEntry managed it).
                Your existing tunnel continues to work as-is — <strong>no action needed</strong>.
              </p>
              <p className="text-[11px] text-slate-500 mt-2">
                If you want MillEntry to manage a new tunnel (replacing the existing one), click the button below.
                This will <span className="text-amber-400 font-medium">remove the current service</span> and set up a new managed tunnel.
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => {
            if (window.confirm("Replace existing cloudflared service?\n\nThis will uninstall the manually configured service and set up a new MillEntry-managed tunnel. Your current tunnel URL will stop working.\n\nContinue?")) {
              enable(true);
            }
          }} disabled={busy} className="h-8 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10" data-testid="cloud-replace-btn">
            Replace with Managed Tunnel
          </Button>
        </CardContent>
      </Card>
    );
  }

  // State: fresh — no cloud access yet
  return (
    <Card className="bg-slate-800/40 border-slate-700 mt-4" data-testid="cloud-access-disabled">
      <CardContent className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <Cloud className="w-5 h-5 text-slate-500 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-200">Cloud Access</div>
            <p className="text-xs text-slate-400 mt-1">
              Enable a private tunnel to access your mill data from anywhere — phone, laptop, or another office. Traffic is encrypted via Cloudflare.
            </p>
            <ul className="text-[11px] text-slate-500 mt-2 space-y-0.5">
              <li>• One-time setup, ~30 seconds</li>
              <li>• Downloads <span className="font-mono text-slate-400">cloudflared</span> (~40 MB) and installs as Windows service</li>
              <li>• Requires Administrator privileges once (UAC prompt)</li>
              <li>• URL format: <span className="font-mono text-slate-400">your-mill.9x.design</span></li>
            </ul>
          </div>
        </div>
        {status?.error && status?.error !== 'offline' && (
          <div className="flex items-start gap-2 p-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-400 mb-3">
            <CircleAlert className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{status.error}</span>
          </div>
        )}
        <Button size="sm" onClick={() => enable(false)} disabled={busy} className="bg-purple-600 hover:bg-purple-700 h-8 text-xs" data-testid="cloud-enable-btn">
          <Download className="w-3 h-3 mr-1.5" /> Enable Cloud Access
        </Button>
      </CardContent>
    </Card>
  );
}
