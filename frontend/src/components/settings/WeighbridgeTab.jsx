import { useState, useEffect } from "react";
import { toast } from "sonner";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Scale, Wifi, CheckCircle, XCircle } from "lucide-react";
import logger from "../../utils/logger";

const isElectronDesktop = typeof window !== 'undefined' && window.electronAPI?.serialGetConfig;
const isLanBrowser = typeof window !== 'undefined' && (window.ELECTRON_API_URL) && !window.electronAPI;
const BACKEND_URL = (typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL)) ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

/* ── LAN Weighbridge Host Config (for local-server) ── */
function LanWeighbridgeConfig() {
  const [hostUrl, setHostUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    axios.get(`${API}/settings/weighbridge-host`).then(r => {
      setHostUrl(r.data.url || '');
    }).catch(() => {});
  }, []);

  const saveHost = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/settings/weighbridge-host`, { url: hostUrl });
      toast.success("Desktop App URL saved!");
    } catch (e) { toast.error("Save error"); }
    setSaving(false);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await axios.get(`${API}/weighbridge/live-weight`, { timeout: 3000 });
      if (r.data.connected) {
        setTestResult({ ok: true, msg: `Connected! Weight: ${r.data.weight} KG` });
      } else if (r.data.error) {
        setTestResult({ ok: false, msg: r.data.error });
      } else {
        setTestResult({ ok: false, msg: 'Weighbridge disconnected (serial port off ho sakta hai)' });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: 'Connection failed — URL check karein' });
    }
    setTesting(false);
  };

  return (
    <Card className="bg-slate-800 border-slate-700" data-testid="weighbridge-config-section">
      <CardHeader>
        <CardTitle className="text-purple-400 flex items-center gap-2">
          <Scale className="w-5 h-5" /> Weighbridge Configuration (LAN)
        </CardTitle>
        <p className="text-slate-400 text-sm mt-1">
          Local Network se weighbridge data dikhane ke liye Desktop App ka URL set karein. Desktop App wahi machine pe run hona chahiye jaha serial port (weighbridge) connected hai.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-slate-300 text-xs mb-1 block">Desktop App URL</Label>
          <div className="flex gap-2">
            <Input
              value={hostUrl}
              onChange={e => setHostUrl(e.target.value)}
              placeholder="http://192.168.1.100:5000"
              className="bg-slate-700 border-slate-600 text-white text-sm h-9 flex-1"
              data-testid="weighbridge-host-input"
            />
            <Button onClick={saveHost} disabled={saving} className="bg-purple-600 hover:bg-purple-500 text-white text-xs h-9 px-4" data-testid="weighbridge-host-save">
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
          <p className="text-slate-500 text-[10px] mt-1">Example: http://192.168.1.100:5000 (Desktop App ka IP aur port)</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={testConnection} disabled={testing || !hostUrl} variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700 text-xs h-8" data-testid="weighbridge-host-test">
            <Wifi className="w-3.5 h-3.5 mr-1.5" />
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>
          {testResult && (
            <span className={`flex items-center gap-1 text-xs font-medium ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
              {testResult.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              {testResult.msg}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function WeighbridgeConfigCard() {
  const isElectronApp = isElectronDesktop;
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
    } catch (e) { logger.error('Weighbridge save error:', e); toast.error("Save error"); }
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
    // LAN browser: show Desktop App URL configuration
    if (isLanBrowser) {
      return <LanWeighbridgeConfig />;
    }
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

export default WeighbridgeConfigCard;
