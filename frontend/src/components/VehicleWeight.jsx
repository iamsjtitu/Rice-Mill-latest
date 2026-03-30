import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, RefreshCw, Scale, Truck, Clock, CheckCircle, Download, Send, Users, Camera, CameraOff, Play, Square, Zap, WifiOff, Wifi, Plus, Eye } from "lucide-react";
import { useMessagingEnabled } from "../hooks/useMessagingEnabled";
import { SendToGroupDialog } from "./SendToGroupDialog";
import { downloadFile } from "../utils/download";

const _isElectron = typeof window !== "undefined" && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? "" : (process.env.REACT_APP_BACKEND_URL || "");
const API = `${BACKEND_URL}/api`;

const fmtWt = (w) => w ? `${Number(w).toLocaleString()} KG` : "0 KG";

// --- Live Scale Simulator ---
function useLiveScale() {
  const [weight, setWeight] = useState(0);
  const [stable, setStable] = useState(false);
  const [running, setRunning] = useState(false);
  const [connected, setConnected] = useState(false);
  const intervalRef = useRef(null);
  const targetRef = useRef(0);
  const tickRef = useRef(0);

  const startSimulation = useCallback((targetWt) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const target = targetWt || (Math.floor(Math.random() * 25000) + 5000);
    targetRef.current = target;
    tickRef.current = 0;
    setStable(false);
    setRunning(true);
    setConnected(true);
    setWeight(0);
    intervalRef.current = setInterval(() => {
      tickRef.current++;
      const t = tickRef.current;
      if (t < 25) {
        const progress = t / 25;
        const noise = (Math.random() - 0.5) * target * 0.08;
        setWeight(Math.round(target * progress + noise));
      } else if (t < 40) {
        const osc = (Math.random() - 0.5) * target * 0.02 * (1 - (t - 25) / 15);
        setWeight(Math.round(target + osc));
      } else {
        setWeight(target);
        setStable(true);
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, 80);
  }, []);

  const stopSimulation = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
    setStable(false);
    setWeight(0);
    setConnected(false);
  }, []);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);
  return { weight, stable, running, connected, startSimulation, stopSimulation };
}

// --- Camera Feed ---
function CameraFeed() {
  const videoRef = useRef(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState(null);
  const streamRef = useRef(null);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      setActive(true);
    } catch { setError("Camera access nahi mila"); setActive(false); }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <div data-testid="camera-feed-panel">
      <div className="flex items-center justify-between mb-1">
        <span className="text-slate-400 text-[10px] font-medium flex items-center gap-1">
          {active ? <Camera className="w-3 h-3 text-green-400" /> : <CameraOff className="w-3 h-3 text-red-400" />}
          Camera
        </span>
        <Button onClick={active ? stopCamera : startCamera} variant="ghost" size="sm"
          className={`h-5 px-1.5 text-[10px] ${active ? 'text-red-400' : 'text-green-400'}`}
          data-testid="camera-toggle-btn">
          {active ? <><Square className="w-2.5 h-2.5 mr-0.5" />Stop</> : <><Play className="w-2.5 h-2.5 mr-0.5" />Start</>}
        </Button>
      </div>
      <div className="bg-black rounded overflow-hidden aspect-video flex items-center justify-center border border-slate-700">
        {active ? (
          <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
        ) : (
          <div className="text-center p-2">
            {error ? <p className="text-red-400 text-[10px]">{error}</p> : (
              <><CameraOff className="w-6 h-6 text-slate-600 mx-auto mb-1" /><p className="text-slate-600 text-[9px]">Desktop mein camera connect hoga</p></>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function VehicleWeight({ filters }) {
  const { wa } = useMessagingEnabled();
  const [entries, setEntries] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nextRst, setNextRst] = useState(1);
  const [secondWtDialog, setSecondWtDialog] = useState({ open: false, entry: null });
  const [secondWtValue, setSecondWtValue] = useState("");
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupText, setGroupText] = useState("");
  const [groupPdfUrl, setGroupPdfUrl] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const scale = useLiveScale();

  const defaultForm = {
    date: new Date().toISOString().split("T")[0],
    vehicle_no: "", party_name: "", farmer_name: "",
    product: "PADDY", trans_type: "Receive(Pur)",
    j_pkts: "", p_pkts: "", tot_pkts: "",
    first_wt: "", remark: ""
  };
  const [form, setForm] = useState(defaultForm);
  const kms = filters?.kms_year || "";

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, pendingRes, rstRes] = await Promise.all([
        axios.get(`${API}/vehicle-weight?kms_year=${kms}&limit=200`),
        axios.get(`${API}/vehicle-weight/pending?kms_year=${kms}`),
        axios.get(`${API}/vehicle-weight/next-rst?kms_year=${kms}`)
      ]);
      setEntries(entriesRes.data.entries || []);
      setPending(pendingRes.data.pending || []);
      setNextRst(rstRes.data.rst_no || 1);
    } catch { toast.error("Data load error"); }
    setLoading(false);
  }, [kms]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const captureFirstWt = () => {
    if (scale.stable && scale.weight > 0) {
      setForm(p => ({ ...p, first_wt: String(scale.weight) }));
      toast.success(`First Wt captured: ${scale.weight} KG`);
    }
  };
  const captureSecondWt = () => {
    if (scale.stable && scale.weight > 0) {
      setSecondWtValue(String(scale.weight));
      toast.success(`Second Wt captured: ${scale.weight} KG`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.vehicle_no) { toast.error("Vehicle No. daalen"); return; }
    if (!form.first_wt || Number(form.first_wt) <= 0) { toast.error("First Weight daalen"); return; }
    try {
      const res = await axios.post(`${API}/vehicle-weight`, { ...form, kms_year: kms });
      if (res.data.success) { toast.success(res.data.message); setForm(defaultForm); fetchData(); }
    } catch (e) { toast.error(e.response?.data?.detail || "Save error"); }
  };

  const handleSecondWt = async () => {
    if (!secondWtValue || Number(secondWtValue) <= 0) { toast.error("Second Weight daalen"); return; }
    try {
      const res = await axios.put(`${API}/vehicle-weight/${secondWtDialog.entry.id}/second-weight`, { second_wt: secondWtValue });
      if (res.data.success) { toast.success(res.data.message); setSecondWtDialog({ open: false, entry: null }); setSecondWtValue(""); fetchData(); }
    } catch (e) { toast.error(e.response?.data?.detail || "Update error"); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete karein?")) return;
    try { await axios.delete(`${API}/vehicle-weight/${id}`); toast.success("Deleted"); fetchData(); }
    catch { toast.error("Delete error"); }
  };

  const handleSlipPdf = (entry) => {
    const url = `${API}/vehicle-weight/${entry.id}/slip-pdf`;
    if (_isElectron) { downloadFile(url, `WeightSlip_RST${entry.rst_no}.pdf`); } else { window.open(url, "_blank"); }
  };

  const handleSlipWA = async (entry) => {
    try {
      const text = `*Weight Slip - RST #${entry.rst_no}*\nVehicle: ${entry.vehicle_no}\nParty: ${entry.party_name}\nProduct: ${entry.product}\nFirst: ${entry.first_wt} KG\nSecond: ${entry.second_wt} KG\n*Net: ${entry.net_wt} KG*`;
      const res = await axios.post(`${API}/whatsapp/send-daily-report`, { report_text: text, pdf_url: `http://localhost:8001/api/vehicle-weight/${entry.id}/slip-pdf`, send_to_numbers: true, send_to_group: false });
      if (res.data.success) toast.success("WhatsApp bhej diya!"); else toast.error(res.data.error || "WhatsApp fail");
    } catch (e) { toast.error(e.response?.data?.detail || "WhatsApp error"); }
  };

  const handleSlipGroup = (entry) => {
    setGroupText(`*Weight Slip - RST #${entry.rst_no}*\nVehicle: ${entry.vehicle_no}\nParty: ${entry.party_name}\nFirst: ${entry.first_wt} KG | Second: ${entry.second_wt} KG\n*Net: ${entry.net_wt} KG*`);
    setGroupPdfUrl(`/api/vehicle-weight/${entry.id}/slip-pdf`);
    setGroupDialogOpen(true);
  };

  const completedEntries = entries.filter(e => e.status === "completed");

  return (
    <div className="space-y-3" data-testid="vehicle-weight-page">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <Scale className="w-5 h-5 text-amber-400" />
          Auto Vehicle Weight
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] ${scale.connected ? 'border-green-500 text-green-400' : 'border-red-500 text-red-400'}`}>
            {scale.connected ? <><Wifi className="w-3 h-3 mr-1" />COM3 Connected</> : <><WifiOff className="w-3 h-3 mr-1" />Disconnected</>}
          </Badge>
          <Button onClick={fetchData} variant="outline" size="sm" className="h-7 border-slate-600 text-xs" data-testid="vw-refresh">
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* ===== MAIN LAYOUT: Left (Entry Form + Scale + Camera) | Right (Pending List) ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">

        {/* ===== LEFT PANEL: Vehicle Weight Entry [Add] ===== */}
        <div className="lg:col-span-3 space-y-3">
          <Card className="bg-slate-900 border-slate-700" data-testid="vw-entry-card">
            <CardHeader className="pb-1 pt-2 px-3 bg-red-900/40 rounded-t-lg border-b border-red-800/50">
              <CardTitle className="text-sm text-red-300 font-bold flex items-center gap-2">
                <Scale className="w-4 h-4" /> Vehicle Weight Entry [Add] — RST(Auto): {nextRst}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-12 gap-2">
                  {/* Left: Form Fields */}
                  <div className="col-span-12 md:col-span-7 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-slate-400 text-[10px]">Date</Label>
                        <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                          className="bg-slate-800 border-slate-600 text-white h-7 text-xs" data-testid="vw-date" />
                      </div>
                      <div>
                        <Label className="text-slate-400 text-[10px]">Vehicle No. *</Label>
                        <Input value={form.vehicle_no} onChange={e => setForm(p => ({ ...p, vehicle_no: e.target.value.toUpperCase() }))}
                          placeholder="OD 02 AB 1234" className="bg-slate-800 border-slate-600 text-white h-7 text-xs" data-testid="vw-vehicle" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-slate-400 text-[10px]">Party Name</Label>
                        <Input value={form.party_name} onChange={e => setForm(p => ({ ...p, party_name: e.target.value }))}
                          placeholder="Party" className="bg-slate-800 border-slate-600 text-white h-7 text-xs" data-testid="vw-party" />
                      </div>
                      <div>
                        <Label className="text-slate-400 text-[10px]">Farmer Name</Label>
                        <Input value={form.farmer_name} onChange={e => setForm(p => ({ ...p, farmer_name: e.target.value }))}
                          placeholder="Farmer" className="bg-slate-800 border-slate-600 text-white h-7 text-xs" data-testid="vw-farmer" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-slate-400 text-[10px]">Product</Label>
                        <Select value={form.product} onValueChange={v => setForm(p => ({ ...p, product: v }))}>
                          <SelectTrigger className="bg-slate-800 border-slate-600 text-white h-7 text-xs" data-testid="vw-product"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-slate-700 border-slate-600">
                            <SelectItem value="PADDY">PADDY</SelectItem>
                            <SelectItem value="GOVT PADDY">GOVT PADDY</SelectItem>
                            <SelectItem value="RICE">RICE</SelectItem>
                            <SelectItem value="BHUSI">BHUSI</SelectItem>
                            <SelectItem value="KANDA">KANDA</SelectItem>
                            <SelectItem value="OTHER">OTHER</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-slate-400 text-[10px]">Trans. Type</Label>
                        <Select value={form.trans_type} onValueChange={v => setForm(p => ({ ...p, trans_type: v }))}>
                          <SelectTrigger className="bg-slate-800 border-slate-600 text-white h-7 text-xs" data-testid="vw-trans"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-slate-700 border-slate-600">
                            <SelectItem value="Receive(Pur)">Receive(Pur)</SelectItem>
                            <SelectItem value="Dispatch(Sale)">Dispatch(Sale)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-slate-400 text-[10px]">Tot. Pkts</Label>
                        <Input type="number" value={form.tot_pkts} onChange={e => setForm(p => ({ ...p, tot_pkts: e.target.value }))}
                          placeholder="0" className="bg-slate-800 border-slate-600 text-white h-7 text-xs" data-testid="vw-bags" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-slate-400 text-[10px]">Remark</Label>
                      <Input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))}
                        placeholder="Optional" className="bg-slate-800 border-slate-600 text-white h-7 text-xs" data-testid="vw-remark" />
                    </div>
                  </div>

                  {/* Right: Camera */}
                  <div className="col-span-12 md:col-span-5">
                    <CameraFeed />
                  </div>
                </div>

                {/* Weight Display + Capture */}
                <div className="grid grid-cols-2 gap-3 mt-3">
                  {/* First Weight Box */}
                  <div className="rounded-lg overflow-hidden border border-slate-600">
                    <div className="bg-red-900/60 px-2 py-0.5 text-red-200 text-xs font-bold">First Wt.</div>
                    <div className="bg-black p-3 text-center">
                      <Input type="number" value={form.first_wt}
                        onChange={e => setForm(p => ({ ...p, first_wt: e.target.value }))}
                        placeholder="0" className="bg-transparent border-none text-center text-3xl font-mono font-bold text-amber-400 h-12 p-0 focus-visible:ring-0"
                        data-testid="vw-first-wt" />
                      <div className="text-slate-500 text-[10px]">KG</div>
                    </div>
                    {scale.stable && (
                      <Button type="button" onClick={captureFirstWt} className="w-full h-6 rounded-none bg-green-800 hover:bg-green-700 text-[10px]" data-testid="vw-capture-first">
                        <Zap className="w-3 h-3 mr-1" /> Capture {scale.weight.toLocaleString()} KG
                      </Button>
                    )}
                  </div>

                  {/* Live Scale Display */}
                  <div className="rounded-lg overflow-hidden border border-slate-600">
                    <div className="bg-slate-700 px-2 py-0.5 text-slate-300 text-xs font-bold flex items-center justify-between">
                      <span>Live Scale</span>
                      {!scale.running ? (
                        <button type="button" onClick={() => scale.startSimulation()}
                          className="text-green-400 text-[10px] flex items-center gap-0.5 hover:text-green-300" data-testid="vw-simulate-btn">
                          <Zap className="w-3 h-3" /> Simulate
                        </button>
                      ) : (
                        <button type="button" onClick={scale.stopSimulation}
                          className="text-red-400 text-[10px] flex items-center gap-0.5 hover:text-red-300" data-testid="vw-stop-btn">
                          <Square className="w-3 h-3" /> Stop
                        </button>
                      )}
                    </div>
                    <div className="bg-black p-3 text-center">
                      <div className={`font-mono text-3xl font-bold tracking-wider transition-colors ${
                        scale.stable ? 'text-green-400' : scale.running ? 'text-amber-400' : 'text-slate-600'
                      }`} data-testid="live-weight-display"
                        style={{ textShadow: scale.running ? '0 0 15px currentColor' : 'none' }}>
                        {scale.weight > 0 ? scale.weight.toLocaleString() : '0'}
                      </div>
                      <div className="text-slate-500 text-[10px]">KG</div>
                      {scale.stable && <div className="text-green-400 text-[10px] mt-0.5 animate-pulse flex items-center justify-center gap-1"><CheckCircle className="w-3 h-3" />STABLE</div>}
                      {scale.running && !scale.stable && <div className="text-amber-400 text-[10px] mt-0.5 animate-pulse">Measuring...</div>}
                    </div>
                  </div>
                </div>

                {/* Submit Buttons */}
                <div className="flex gap-2 mt-3">
                  <Button type="submit" className="flex-1 bg-green-700 hover:bg-green-600 font-bold h-8 text-xs" data-testid="vw-save-first">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add (Save First Wt)
                  </Button>
                  <Button type="button" onClick={() => setForm(defaultForm)} variant="outline" className="border-slate-600 h-8 text-xs">Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* ===== RIGHT PANEL: Pending Vehicle List ===== */}
        <div className="lg:col-span-2">
          <Card className="bg-slate-900 border-slate-700 h-full" data-testid="vw-pending-card">
            <CardHeader className="pb-1 pt-2 px-3 bg-red-900/40 rounded-t-lg border-b border-red-800/50">
              <CardTitle className="text-sm text-red-300 font-bold flex items-center gap-2">
                <Clock className="w-4 h-4" /> Pending Vehicle List ({pending.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700 bg-slate-800/80">
                      <TableHead className="text-slate-400 text-[10px] py-1.5 px-2">RST</TableHead>
                      <TableHead className="text-slate-400 text-[10px] py-1.5 px-2">Vehicle</TableHead>
                      <TableHead className="text-slate-400 text-[10px] py-1.5 px-2 text-right">1st Wt.</TableHead>
                      <TableHead className="text-slate-400 text-[10px] py-1.5 px-2">Party</TableHead>
                      <TableHead className="text-slate-400 text-[10px] py-1.5 px-2 text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-slate-500 py-8 text-xs">Koi pending vehicle nahi</TableCell></TableRow>
                    )}
                    {pending.map(p => (
                      <TableRow key={p.id} className="border-slate-700/50 hover:bg-yellow-900/20 cursor-pointer" data-testid={`vw-pending-row-${p.id}`}>
                        <TableCell className="text-amber-400 font-bold text-xs py-1.5 px-2">#{p.rst_no}</TableCell>
                        <TableCell className="text-white text-xs py-1.5 px-2 font-medium">{p.vehicle_no}</TableCell>
                        <TableCell className="text-blue-300 text-xs py-1.5 px-2 text-right font-mono">{fmtWt(p.first_wt)}</TableCell>
                        <TableCell className="text-slate-300 text-xs py-1.5 px-2 truncate max-w-[80px]">{p.party_name || '-'}</TableCell>
                        <TableCell className="py-1.5 px-2 text-center">
                          <div className="flex items-center gap-0.5 justify-center">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-yellow-400 hover:bg-yellow-900/30"
                              data-testid={`vw-2nd-wt-${p.id}`}
                              onClick={() => { setSecondWtDialog({ open: true, entry: p }); setSecondWtValue(""); }}>
                              <Scale className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:bg-red-900/30"
                              data-testid={`vw-del-pending-${p.id}`} onClick={() => handleDelete(p.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===== COMPLETED ENTRIES TABLE ===== */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-1 pt-2 px-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="text-slate-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" /> Completed Entries ({completedEntries.length})
            </span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-slate-400" onClick={() => setShowCompleted(!showCompleted)}
              data-testid="vw-toggle-completed">
              <Eye className="w-3 h-3 mr-1" /> {showCompleted ? 'Hide' : 'Show'}
            </Button>
          </CardTitle>
        </CardHeader>
        {showCompleted && (
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-[10px]">RST</TableHead>
                    <TableHead className="text-slate-400 text-[10px]">Date</TableHead>
                    <TableHead className="text-slate-400 text-[10px]">Vehicle</TableHead>
                    <TableHead className="text-slate-400 text-[10px]">Party</TableHead>
                    <TableHead className="text-slate-400 text-[10px]">Product</TableHead>
                    <TableHead className="text-slate-400 text-[10px] text-right">1st Wt</TableHead>
                    <TableHead className="text-slate-400 text-[10px] text-right">2nd Wt</TableHead>
                    <TableHead className="text-slate-400 text-[10px] text-right font-bold">Net Wt</TableHead>
                    <TableHead className="text-slate-400 text-[10px] text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedEntries.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-slate-500 py-6 text-xs">Koi completed entry nahi</TableCell></TableRow>
                  )}
                  {completedEntries.map(e => (
                    <TableRow key={e.id} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="text-amber-400 font-bold text-xs">#{e.rst_no}</TableCell>
                      <TableCell className="text-slate-300 text-xs">{e.date}</TableCell>
                      <TableCell className="text-white text-xs font-medium">{e.vehicle_no}</TableCell>
                      <TableCell className="text-slate-300 text-xs">{e.party_name}</TableCell>
                      <TableCell className="text-slate-400 text-xs">{e.product}</TableCell>
                      <TableCell className="text-right text-blue-300 text-xs font-mono">{fmtWt(e.first_wt)}</TableCell>
                      <TableCell className="text-right text-blue-300 text-xs font-mono">{fmtWt(e.second_wt)}</TableCell>
                      <TableCell className="text-right font-bold text-green-400 text-sm font-mono">{fmtWt(e.net_wt)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-0.5 justify-center">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400" onClick={() => handleSlipPdf(e)} data-testid={`vw-pdf-${e.id}`}>
                            <Download className="w-3 h-3" />
                          </Button>
                          {wa && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-green-400" onClick={() => handleSlipWA(e)} data-testid={`vw-wa-${e.id}`}>
                            <Send className="w-3 h-3" />
                          </Button>}
                          {wa && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-teal-400" onClick={() => handleSlipGroup(e)} data-testid={`vw-group-${e.id}`}>
                            <Users className="w-3 h-3" />
                          </Button>}
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => handleDelete(e.id)} data-testid={`vw-del-${e.id}`}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Second Weight Dialog */}
      <Dialog open={secondWtDialog.open} onOpenChange={(v) => setSecondWtDialog({ open: v, entry: v ? secondWtDialog.entry : null })}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-sm" data-testid="vw-second-dialog">
          <DialogHeader>
            <DialogTitle className="text-green-400 flex items-center gap-2"><Scale className="w-5 h-5" /> Second Weight</DialogTitle>
          </DialogHeader>
          {secondWtDialog.entry && (
            <div className="space-y-3">
              <div className="bg-slate-700/50 p-3 rounded-lg space-y-1 text-sm">
                <p className="text-white"><span className="text-slate-400">RST:</span> #{secondWtDialog.entry.rst_no}</p>
                <p className="text-white"><span className="text-slate-400">Vehicle:</span> {secondWtDialog.entry.vehicle_no}</p>
                <p className="text-white"><span className="text-slate-400">Party:</span> {secondWtDialog.entry.party_name}</p>
                <p className="text-blue-300 font-bold"><span className="text-slate-400">First Wt:</span> {fmtWt(secondWtDialog.entry.first_wt)}</p>
              </div>
              <div>
                <Label className="text-green-400 text-sm font-bold">Second Weight (KG) *</Label>
                <div className="flex gap-2">
                  <Input type="number" value={secondWtValue} onChange={e => setSecondWtValue(e.target.value)}
                    placeholder="KG" className="bg-slate-700 border-slate-600 text-white text-lg font-bold h-12 flex-1" data-testid="vw-second-wt-input" autoFocus />
                  {scale.stable && (
                    <Button type="button" onClick={captureSecondWt} className="bg-green-700 hover:bg-green-600 h-12 px-3" data-testid="vw-capture-second-dialog">
                      <Zap className="w-4 h-4 mr-1" /> {scale.weight.toLocaleString()}
                    </Button>
                  )}
                </div>
              </div>
              {secondWtValue && Number(secondWtValue) > 0 && (
                <div className="bg-green-900/30 p-3 rounded-lg text-center">
                  <p className="text-green-400 text-xl font-bold" data-testid="vw-net-preview">
                    Net: {Math.abs(secondWtDialog.entry.first_wt - Number(secondWtValue)).toLocaleString()} KG
                  </p>
                </div>
              )}
              <Button onClick={handleSecondWt} className="w-full bg-green-600 hover:bg-green-700 font-bold h-11" data-testid="vw-save-second">
                <CheckCircle className="w-4 h-4 mr-2" /> Save Second Weight
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SendToGroupDialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen} text={groupText} pdfUrl={groupPdfUrl} />
    </div>
  );
}
