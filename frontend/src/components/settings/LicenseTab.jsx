import { useEffect, useState } from "react";
import axios from "axios";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldCheck, RefreshCw, Copy, Calendar, Monitor, CircleCheck, CircleAlert } from "lucide-react";
import CloudAccessSection from "./CloudAccessSection";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

export default function LicenseTab() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/license/info`);
      setInfo(res.data);
    } catch (e) {
      setInfo({ activated: false, error: e.response?.data?.error || e.message });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const heartbeat = async () => {
    setRefreshing(true);
    try {
      const res = await axios.post(`${API}/license/heartbeat`);
      if (res.data?.active) {
        toast.success("License verified with server");
        await load();
      } else {
        toast.error(res.data?.reason || "Heartbeat failed");
      }
    } catch (e) {
      toast.error(e.response?.data?.error || e.message);
    }
    setRefreshing(false);
  };

  const copyKey = () => {
    if (!info?.key) return;
    navigator.clipboard.writeText(info.key).then(() => toast.success("License key copied"));
  };

  const fmtDate = iso => { if (!iso) return 'Never expires'; try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return iso; } };
  const fmtRelative = iso => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      const diff = (Date.now() - d.getTime()) / 1000;
      if (diff < 60) return 'just now';
      if (diff < 3600) return Math.round(diff / 60) + 'm ago';
      if (diff < 86400) return Math.round(diff / 3600) + 'h ago';
      return Math.round(diff / 86400) + 'd ago';
    } catch { return '—'; }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 text-sm" data-testid="license-info-loading">Loading license info...</div>;

  if (!info?.activated) {
    return (
      <Card className="bg-slate-800/40 border-slate-700" data-testid="license-info-inactive">
        <CardContent className="p-6 text-center">
          <CircleAlert className="w-10 h-10 mx-auto text-amber-500 mb-3" />
          <p className="text-slate-300 font-semibold text-sm">License not activated on this device</p>
          <p className="text-slate-500 text-xs mt-1">Restart the app to see the activation screen.</p>
        </CardContent>
      </Card>
    );
  }

  const planLabel = { lifetime: 'Lifetime + Yearly Support', yearly: 'Yearly Subscription', trial: 'Trial (30 days)' }[info.plan] || info.plan;
  const isExpired = info.expires_at && new Date(info.expires_at) < new Date();

  return (
    <Card className="bg-slate-800/40 border-slate-700" data-testid="license-info-tab">
      <CardHeader className="pb-3 border-b border-slate-700">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-purple-400 flex items-center gap-2 text-base">
            <ShieldCheck className="w-5 h-5" /> License Information
          </CardTitle>
          <div className="flex items-center gap-2">
            {info.is_master && <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px]" data-testid="lic-master-badge">MASTER</Badge>}
            {isExpired
              ? <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px]" data-testid="lic-status-badge">EXPIRED</Badge>
              : <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]" data-testid="lic-status-badge">ACTIVE</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        {/* License Key */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">License Key</div>
          <div className="flex items-center gap-2 p-3 bg-slate-900/60 border border-dashed border-amber-500/40 rounded-lg">
            <span className="font-mono font-bold text-amber-400 text-lg tracking-wider flex-1" data-testid="lic-key">{info.key}</span>
            <Button size="sm" variant="outline" onClick={copyKey} className="h-7 text-[10px] border-slate-600" data-testid="lic-copy-btn">
              <Copy className="w-3 h-3 mr-1" /> Copy
            </Button>
          </div>
        </div>

        {/* Customer + Mill */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-700">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Customer</div>
            <div className="text-slate-200 font-medium mt-1 text-sm" data-testid="lic-customer">{info.customer_name || '—'}</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-700">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Mill / Facility</div>
            <div className="text-slate-200 font-medium mt-1 text-sm" data-testid="lic-mill">{info.mill_name || '—'}</div>
          </div>
        </div>

        {/* Plan + Expiry */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-700 flex items-start gap-2">
            <Calendar className="w-4 h-4 text-slate-500 mt-0.5" />
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Plan</div>
              <div className="text-slate-200 font-medium mt-1 text-sm" data-testid="lic-plan">{planLabel}</div>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-700 flex items-start gap-2">
            <Calendar className="w-4 h-4 text-slate-500 mt-0.5" />
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Expires</div>
              <div className={`font-medium mt-1 text-sm ${isExpired ? 'text-red-400' : 'text-slate-200'}`} data-testid="lic-expiry">{fmtDate(info.expires_at)}</div>
            </div>
          </div>
        </div>

        {/* Machine Info */}
        <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <Monitor className="w-4 h-4 text-slate-500" />
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">This Device</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div><div className="text-slate-500 text-[10px]">Hostname</div><div className="text-slate-300 font-mono" data-testid="lic-hostname">{info.pc_info?.hostname || '—'}</div></div>
            <div><div className="text-slate-500 text-[10px]">Platform</div><div className="text-slate-300 font-mono">{info.pc_info?.platform || '—'}</div></div>
            <div><div className="text-slate-500 text-[10px]">App Version</div><div className="text-slate-300 font-mono">v{info.pc_info?.app_version || '—'}</div></div>
            <div><div className="text-slate-500 text-[10px]">Fingerprint</div><div className="text-slate-300 font-mono" title={info.machine_fingerprint}>{info.machine_fingerprint?.slice(0, 12)}…</div></div>
          </div>
        </div>

        {/* Last Sync + Action */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-700 flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <CircleCheck className="w-3.5 h-3.5 text-emerald-400" />
            Last verified: <span className="text-slate-200 font-medium" data-testid="lic-last-sync">{fmtRelative(info.last_validated_at)}</span>
          </div>
          <Button onClick={heartbeat} size="sm" disabled={refreshing} className="bg-purple-600 hover:bg-purple-700 h-7 text-[11px]" data-testid="lic-heartbeat-btn">
            {refreshing ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            Verify with server
          </Button>
        </div>
      </CardContent>
      {/* Cloud Access section (Desktop-app only) */}
      <div className="px-5 pb-5">
        <CloudAccessSection />
      </div>
    </Card>
  );
}
