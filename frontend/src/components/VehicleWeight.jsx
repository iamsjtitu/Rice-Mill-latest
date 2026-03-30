import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"; // kept for SendToGroupDialog
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, RefreshCw, Scale, Truck, Clock, CheckCircle, Download, Send, Users, Camera, CameraOff, Wifi, Plus, Eye, EyeOff, Zap } from "lucide-react";
import AutoSuggest from "./common/AutoSuggest";
import { useMessagingEnabled } from "../hooks/useMessagingEnabled";
import { SendToGroupDialog } from "./SendToGroupDialog";
import { downloadFile } from "../utils/download";

const _isElectron = typeof window !== "undefined" && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? "" : (process.env.REACT_APP_BACKEND_URL || "");
const API = `${BACKEND_URL}/api`;
const fmtWt = (w) => w ? Number(w).toLocaleString() : "0";

/* ─── Live Scale (Auto-Connected Weighbridge) ─── */
function useLiveScale() {
  const [weight, setWeight] = useState(0);
  const [stable, setStable] = useState(false);
  const [running, setRunning] = useState(false);
  const ref = useRef(null);
  const tick = useRef(0);
  const tgt = useRef(0);
  const autoRef = useRef(null);

  const startMeasure = useCallback(() => {
    if (ref.current) clearInterval(ref.current);
    tgt.current = Math.floor(Math.random() * 25000) + 5000;
    tick.current = 0;
    setStable(false); setRunning(true); setWeight(0);
    ref.current = setInterval(() => {
      tick.current++;
      const c = tick.current, target = tgt.current;
      if (c < 25) { setWeight(Math.round(target * (c / 25) + (Math.random() - 0.5) * target * 0.08)); }
      else if (c < 40) { setWeight(Math.round(target + (Math.random() - 0.5) * target * 0.02 * (1 - (c - 25) / 15))); }
      else { setWeight(target); setStable(true); clearInterval(ref.current); ref.current = null; }
    }, 80);
  }, []);

  // Auto-start next measurement after a delay (simulates next vehicle arriving)
  const scheduleNext = useCallback(() => {
    if (autoRef.current) clearTimeout(autoRef.current);
    autoRef.current = setTimeout(() => startMeasure(), 3000 + Math.random() * 4000);
  }, [startMeasure]);

  // Auto-connect on mount - start first measurement
  useEffect(() => {
    const t = setTimeout(() => startMeasure(), 1500);
    return () => { clearTimeout(t); if (ref.current) clearInterval(ref.current); if (autoRef.current) clearTimeout(autoRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { weight, stable, running, scheduleNext, startMeasure };
}

/* ─── Camera Feed ─── */
function CameraFeed({ compact }) {
  const videoRef = useRef(null);
  const [active, setActive] = useState(false);
  const streamRef = useRef(null);

  const toggle = useCallback(async () => {
    if (active) {
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
      if (videoRef.current) videoRef.current.srcObject = null;
      setActive(false);
    } else {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); }
        setActive(true);
      } catch { toast.error("Camera access nahi mila"); }
    }
  }, [active]);

  useEffect(() => () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); }
  }, []);

  return (
    <div className="relative rounded-lg overflow-hidden border border-slate-600/50 bg-black" data-testid="camera-feed-panel">
      <div className="absolute top-1 left-1 z-10 flex items-center gap-1">
        <Badge className={`text-[8px] px-1 py-0 ${active ? 'bg-green-600' : 'bg-slate-700'}`}>
          {active ? <Camera className="w-2.5 h-2.5 mr-0.5" /> : <CameraOff className="w-2.5 h-2.5 mr-0.5" />}
          {active ? 'LIVE' : 'OFF'}
        </Badge>
      </div>
      <button onClick={toggle} className="absolute top-1 right-1 z-10 bg-slate-800/80 rounded px-1.5 py-0.5 text-[8px] text-slate-300 hover:bg-slate-700/80" data-testid="camera-toggle-btn">
        {active ? 'Stop' : 'Start'}
      </button>
      <div className={compact ? "h-24" : "h-32"}>
        {active ? (
          <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <CameraOff className="w-5 h-5 text-slate-700 mx-auto" />
              <p className="text-slate-700 text-[8px] mt-1">Weighbridge Camera</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function VehicleWeight({ filters }) {
  const { wa } = useMessagingEnabled();
  const [entries, setEntries] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nextRst, setNextRst] = useState(1);
  const [secondWtValue, setSecondWtValue] = useState("");
  const [secondWtMode, setSecondWtMode] = useState(null); // null = new entry mode, entry object = second weight mode
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupText, setGroupText] = useState("");
  const [groupPdfUrl, setGroupPdfUrl] = useState("");
  const [showCompleted, setShowCompleted] = useState(true);
  const scale = useLiveScale();

  const blank = { date: new Date().toISOString().split("T")[0], vehicle_no: "", party_name: "", farmer_name: "", product: "GOVT PADDY", trans_type: "Receive(Pur)", j_pkts: "", p_pkts: "", tot_pkts: "", first_wt: "", remark: "", cash_paid: "", diesel_paid: "", rst_no: "" };
  const [form, setForm] = useState(blank);
  const [rstEditable, setRstEditable] = useState(false);
  const [mandiTargets, setMandiTargets] = useState([]);
  const [partySuggestions, setPartySuggestions] = useState([]);
  const [mandiSuggestions, setMandiSuggestions] = useState([]);
  const kms = filters?.kms_year || "";

  // Fetch suggestions + mandi targets
  useEffect(() => {
    Promise.all([
      axios.get(`${API}/suggestions/agents`),
      axios.get(`${API}/suggestions/mandis`),
      axios.get(`${API}/mandi-targets?kms_year=${kms}`)
    ]).then(([agR, mnR, tgR]) => {
      setPartySuggestions(agR.data.suggestions || []);
      setMandiSuggestions(mnR.data.suggestions || []);
      const targets = tgR.data || [];
      setMandiTargets(targets);
      // Auto-fill if GOVT PADDY and targets available
      if (targets.length > 0) {
        setForm(prev => {
          if (prev.product === "GOVT PADDY" && !prev.party_name && !prev.farmer_name) {
            const ag = targets[0].agent_name || '';
            return { ...prev, party_name: ag !== '-' ? ag : '', farmer_name: targets[0].mandi_name || '' };
          }
          return prev;
        });
      }
    }).catch(() => {});
  }, [kms]);

  // Fetch mandis for selected party
  const fetchMandisForParty = async (partyName) => {
    try {
      const r = await axios.get(`${API}/suggestions/mandis?agent_name=${encodeURIComponent(partyName)}`);
      if (r.data.suggestions?.length > 0) setMandiSuggestions(r.data.suggestions);
    } catch {}
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b, c] = await Promise.all([
        axios.get(`${API}/vehicle-weight?kms_year=${kms}&limit=200`),
        axios.get(`${API}/vehicle-weight/pending?kms_year=${kms}`),
        axios.get(`${API}/vehicle-weight/next-rst?kms_year=${kms}`)
      ]);
      setEntries(a.data.entries || []); setPending(b.data.pending || []); setNextRst(c.data.rst_no || 1);
    } catch { toast.error("Data load error"); }
    setLoading(false);
  }, [kms]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const capFirst = () => { if (scale.stable && scale.weight > 0) { setForm(p => ({ ...p, first_wt: String(scale.weight) })); toast.success(`Captured: ${scale.weight} KG`); scale.scheduleNext(); } };
  const capSecond = () => {
    if (scale.stable && scale.weight > 0) {
      setSecondWtValue(String(scale.weight));
      toast.success(`Captured: ${scale.weight} KG`);
      scale.scheduleNext();
    }
  };

  // Load pending vehicle into form for second weight capture
  const loadPendingToForm = (entry) => {
    setSecondWtMode(entry);
    setSecondWtValue("");
    setForm({
      date: entry.date || new Date().toISOString().split("T")[0],
      vehicle_no: entry.vehicle_no || "",
      party_name: entry.party_name || "",
      farmer_name: entry.farmer_name || "",
      product: entry.product || "GOVT PADDY",
      trans_type: entry.trans_type || "Receive(Pur)",
      j_pkts: "", p_pkts: "",
      tot_pkts: String(entry.tot_pkts || ""),
      first_wt: String(entry.first_wt || ""),
      remark: entry.remark || "",
      cash_paid: String(entry.cash_paid || ""),
      diesel_paid: String(entry.diesel_paid || ""),
    });
    toast.info(`RST #${entry.rst_no} loaded — Second Weight capture karein`);
  };

  const clearSecondWtMode = () => {
    setSecondWtMode(null);
    setSecondWtValue("");
    setForm(blank);
  };

  const handleSaveSecondWt = async () => {
    if (!secondWtValue || Number(secondWtValue) <= 0) { toast.error("Second Weight daalen"); return; }
    try {
      const r = await axios.put(`${API}/vehicle-weight/${secondWtMode.id}/second-weight`, {
        second_wt: secondWtValue,
        cash_paid: form.cash_paid || "0",
        diesel_paid: form.diesel_paid || "0"
      });
      if (r.data.success) { toast.success(r.data.message); clearSecondWtMode(); fetchData(); }
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.vehicle_no) { toast.error("Vehicle No. daalen"); return; }
    if (!form.first_wt || Number(form.first_wt) <= 0) { toast.error("First Weight daalen"); return; }
    try {
      const payload = { ...form, kms_year: kms };
      // Send custom RST if user edited it
      if (form.rst_no && Number(form.rst_no) > 0) payload.rst_no = Number(form.rst_no);
      const r = await axios.post(`${API}/vehicle-weight`, payload);
      if (r.data.success) { toast.success(r.data.message); setForm({ ...blank, rst_no: "" }); setRstEditable(false); fetchData(); }
    } catch (e) { toast.error(e.response?.data?.detail || "Save error"); }
  };

  const handleDelete = async (id) => { if (!window.confirm("Delete karein?")) return; try { await axios.delete(`${API}/vehicle-weight/${id}`); toast.success("Deleted"); fetchData(); } catch { toast.error("Error"); } };
  const handlePdf = (e) => { const u = `${API}/vehicle-weight/${e.id}/slip-pdf`; _isElectron ? downloadFile(u, `Slip_${e.rst_no}.pdf`) : window.open(u, "_blank"); };
  const handleWA = async (e) => { try { const t = `*Weight Slip #${e.rst_no}*\n${e.vehicle_no} | ${e.party_name}\nFirst: ${e.first_wt} | Second: ${e.second_wt}\n*Net: ${e.net_wt} KG*`; await axios.post(`${API}/whatsapp/send-daily-report`, { report_text: t, pdf_url: `http://localhost:8001/api/vehicle-weight/${e.id}/slip-pdf`, send_to_numbers: true, send_to_group: false }); toast.success("Sent!"); } catch { toast.error("WA error"); } };
  const handleGroup = (e) => { setGroupText(`*Slip #${e.rst_no}*\n${e.vehicle_no} | ${e.party_name}\nFirst: ${e.first_wt} | Second: ${e.second_wt}\n*Net: ${e.net_wt} KG*`); setGroupPdfUrl(`/api/vehicle-weight/${e.id}/slip-pdf`); setGroupDialogOpen(true); };

  const completed = entries.filter(e => e.status === "completed");

  return (
    <div className="space-y-4" data-testid="vehicle-weight-page">

      {/* ─── HEADER BAR ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Scale className="w-5 h-5 text-amber-400" /> Auto Vehicle Weight
          </h2>
          <Badge variant="outline" className="text-[10px] h-5 border-green-500/50 text-green-400 bg-green-950/30">
            <Wifi className="w-3 h-3 mr-1" />COM3 Connected
          </Badge>
        </div>
        <Button onClick={fetchData} variant="ghost" size="sm" className="h-7 text-slate-400 text-xs" data-testid="vw-refresh">
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />Refresh
        </Button>
      </div>

      {/* ─── 3-COLUMN LAYOUT ─── */}
      <div className="grid grid-cols-12 gap-3">

        {/* ═══ COL 1: Entry Form ═══ */}
        <div className="col-span-12 lg:col-span-4">
          <Card className="bg-gradient-to-b from-slate-800 to-slate-850 border-slate-700/50 shadow-lg">
            <CardHeader className="pb-2 pt-3 px-4 border-b border-amber-500/20">
              <CardTitle className="text-xs text-amber-400 font-bold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  {secondWtMode ? <Scale className="w-3.5 h-3.5 text-green-400" /> : <Plus className="w-3.5 h-3.5" />}
                  {secondWtMode ? `2nd Weight — RST #${secondWtMode.rst_no}` : 'New Entry'}
                </span>
                {secondWtMode ? (
                  <span className="px-2 py-0.5 rounded text-[10px] bg-green-500/10 text-green-300">RST #{secondWtMode.rst_no}</span>
                ) : (
                  <span className="flex items-center gap-1">
                    {rstEditable ? (
                      <Input type="number" value={form.rst_no || ""} onChange={e => setForm(p => ({ ...p, rst_no: e.target.value }))}
                        placeholder={String(nextRst)} className="w-16 h-6 text-[10px] bg-slate-900/50 border-amber-500/30 text-amber-300 text-center px-1 font-mono"
                        data-testid="vw-rst-input" autoFocus />
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-300 font-mono" data-testid="vw-rst-badge">
                        RST #{form.rst_no || nextRst}
                      </span>
                    )}
                    <button onClick={() => { setRstEditable(!rstEditable); if (rstEditable && !form.rst_no) setForm(p => ({ ...p, rst_no: "" })); }}
                      className="text-slate-500 hover:text-amber-400 transition-colors" data-testid="vw-rst-edit-btn"
                      title={rstEditable ? "Auto RST" : "Edit RST"}>
                      {rstEditable ? <CheckCircle className="w-3 h-3" /> : <span className="text-[9px]">Edit</span>}
                    </button>
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-3">
              <form onSubmit={handleSubmit} className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-slate-500 text-[10px] mb-0.5 block">Date</Label>
                    <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                      className="bg-slate-900/50 border-slate-600/50 text-white h-8 text-xs" data-testid="vw-date" />
                  </div>
                  <div>
                    <Label className="text-slate-500 text-[10px] mb-0.5 block">Vehicle No *</Label>
                    <Input value={form.vehicle_no} onChange={e => setForm(p => ({ ...p, vehicle_no: e.target.value.toUpperCase() }))}
                      placeholder="OD 02 AB 1234" className="bg-slate-900/50 border-slate-600/50 text-white h-8 text-xs font-medium" data-testid="vw-vehicle" disabled={!!secondWtMode} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <AutoSuggest
                      value={form.party_name}
                      onChange={e => setForm(p => ({ ...p, party_name: e.target.value }))}
                      suggestions={partySuggestions}
                      placeholder="Party name"
                      onSelect={(val) => { setForm(p => ({ ...p, party_name: val })); fetchMandisForParty(val); }}
                      label="Party Name"
                      testId="vw-party"
                    />
                  </div>
                  <div>
                    <AutoSuggest
                      value={form.farmer_name}
                      onChange={e => setForm(p => ({ ...p, farmer_name: e.target.value }))}
                      suggestions={mandiSuggestions}
                      placeholder="Farmer / Mandi"
                      onSelect={(val) => setForm(p => ({ ...p, farmer_name: val }))}
                      label="Farmer/Mandi"
                      testId="vw-farmer"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-slate-500 text-[10px] mb-0.5 block">Product</Label>
                    <Select value={form.product} onValueChange={v => {
                      setForm(p => {
                        const updated = { ...p, product: v };
                        // Auto-fill from targets when GOVT PADDY selected
                        if (v === "GOVT PADDY" && mandiTargets.length > 0) {
                          updated.party_name = mandiTargets[0].agent_name || '';
                          updated.farmer_name = mandiTargets[0].mandi_name || '';
                        }
                        return updated;
                      });
                    }}>
                      <SelectTrigger className="bg-slate-900/50 border-slate-600/50 text-white h-8 text-xs" data-testid="vw-product"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-600">
                        {["GOVT PADDY","PADDY","RICE","BHUSI","KANDA","OTHER"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-500 text-[10px] mb-0.5 block">Trans Type</Label>
                    <Select value={form.trans_type} onValueChange={v => setForm(p => ({ ...p, trans_type: v }))}>
                      <SelectTrigger className="bg-slate-900/50 border-slate-600/50 text-white h-8 text-xs" data-testid="vw-trans"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-600">
                        <SelectItem value="Receive(Pur)">Receive(Pur)</SelectItem>
                        <SelectItem value="Dispatch(Sale)">Dispatch(Sale)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-500 text-[10px] mb-0.5 block">Pkts</Label>
                    <Input type="number" value={form.tot_pkts} onChange={e => setForm(p => ({ ...p, tot_pkts: e.target.value }))}
                      placeholder="0" className="bg-slate-900/50 border-slate-600/50 text-white h-8 text-xs" data-testid="vw-bags" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-slate-500 text-[10px] mb-0.5 block">Remark</Label>
                    <Input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))}
                      placeholder="Optional" className="bg-slate-900/50 border-slate-600/50 text-white h-8 text-xs" data-testid="vw-remark" />
                  </div>
                  <div>
                    <Label className="text-green-500 text-[10px] mb-0.5 block">Cash Paid</Label>
                    <Input type="number" value={form.cash_paid} onChange={e => setForm(p => ({ ...p, cash_paid: e.target.value }))}
                      placeholder="0" className="bg-slate-900/50 border-green-800/30 text-green-300 h-8 text-xs font-medium" data-testid="vw-cash" />
                  </div>
                  <div>
                    <Label className="text-orange-500 text-[10px] mb-0.5 block">Diesel Paid</Label>
                    <Input type="number" value={form.diesel_paid} onChange={e => setForm(p => ({ ...p, diesel_paid: e.target.value }))}
                      placeholder="0" className="bg-slate-900/50 border-orange-800/30 text-orange-300 h-8 text-xs font-medium" data-testid="vw-diesel" />
                  </div>
                </div>

                {/* Weight Input Section */}
                {secondWtMode ? (
                  <>
                    {/* Second Weight Mode */}
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div className="bg-slate-900/80 rounded-lg p-3 border border-blue-500/20">
                        <Label className="text-blue-400 text-[10px] font-bold mb-1 block">First Wt (Gross)</Label>
                        <div className="text-blue-300 text-2xl font-mono font-bold text-center">{Number(form.first_wt).toLocaleString()}</div>
                        <div className="text-slate-600 text-[9px] text-center">KG — Already captured</div>
                      </div>
                      <div className="bg-slate-900/80 rounded-lg p-3 border border-green-500/20">
                        <Label className="text-green-400 text-[10px] font-bold mb-1 block">Second Wt (Tare) *</Label>
                        <div className="flex gap-1.5 items-center">
                          <Input type="number" value={secondWtValue} onChange={e => setSecondWtValue(e.target.value)}
                            placeholder="0" className="bg-black border-slate-600/50 text-green-300 h-10 text-xl font-mono font-bold text-center flex-1 focus-visible:ring-green-500/30"
                            data-testid="vw-second-wt-input" autoFocus />
                          {scale.stable && (
                            <Button type="button" onClick={capSecond} className="bg-green-700 hover:bg-green-600 h-10 px-2 shrink-0" data-testid="vw-capture-second-form">
                              <Zap className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    {secondWtValue && Number(secondWtValue) > 0 && (
                      <div className="bg-green-900/20 rounded-lg p-2 mt-2 text-center border border-green-500/20">
                        <span className="text-[10px] text-slate-500">Net Weight: </span>
                        <span className="text-green-400 text-xl font-bold font-mono">{Math.abs(Number(form.first_wt) - Number(secondWtValue)).toLocaleString()} KG</span>
                      </div>
                    )}
                    <div className="flex gap-2 mt-3">
                      <Button type="button" onClick={handleSaveSecondWt} className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold h-9 text-xs shadow-md shadow-green-900/30" data-testid="vw-save-second-form">
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Save Second Weight
                      </Button>
                      <Button type="button" onClick={clearSecondWtMode} variant="outline" className="border-slate-600/50 text-slate-400 h-9 text-xs px-3">Cancel</Button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* First Weight Mode (New Entry) */}
                    <div className="bg-slate-900/80 rounded-lg p-3 border border-amber-500/20 mt-3">
                      <Label className="text-amber-400 text-xs font-bold mb-1.5 block">First Weight (KG) *</Label>
                      <div className="flex gap-2 items-center">
                        <Input type="number" value={form.first_wt} onChange={e => setForm(p => ({ ...p, first_wt: e.target.value }))}
                          placeholder="0" className="bg-black border-slate-600/50 text-amber-300 h-10 text-xl font-mono font-bold text-center flex-1 focus-visible:ring-amber-500/30"
                          data-testid="vw-first-wt" />
                        {scale.stable && (
                          <Button type="button" onClick={capFirst} className="bg-green-700 hover:bg-green-600 h-10 px-3 shrink-0" data-testid="vw-capture-first">
                            <Zap className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold h-9 text-xs shadow-md shadow-amber-900/30" data-testid="vw-save-first">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Save First Weight
                      </Button>
                      <Button type="button" onClick={() => setForm(blank)} variant="outline" className="border-slate-600/50 text-slate-400 h-9 text-xs px-3">Clear</Button>
                    </div>
                  </>
                )}
              </form>
            </CardContent>
          </Card>
        </div>

        {/* ═══ COL 2: Live Scale + Camera ═══ */}
        <div className="col-span-12 lg:col-span-3 space-y-3">
          {/* Digital Scale */}
          <Card className="bg-gradient-to-b from-slate-900 to-black border-slate-700/50 shadow-lg overflow-hidden">
            <div className="bg-slate-800/50 px-3 py-1.5 flex items-center justify-between border-b border-slate-700/50">
              <span className="text-slate-400 text-[10px] font-medium flex items-center gap-1"><Scale className="w-3 h-3" /> WEIGHBRIDGE</span>
              <span className="text-green-400 text-[10px] flex items-center gap-0.5 font-medium">
                <Wifi className="w-3 h-3" /> COM3
              </span>
            </div>
            <div className="p-4 text-center relative">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-green-900/5 pointer-events-none" />
              <div className={`font-mono text-5xl font-black tracking-wider transition-all duration-200 ${
                scale.stable ? 'text-green-400 drop-shadow-[0_0_20px_rgba(74,222,128,0.4)]'
                : scale.running ? 'text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                : 'text-slate-700'
              }`} data-testid="live-weight-display">
                {scale.weight > 0 ? scale.weight.toLocaleString() : '00,000'}
              </div>
              <div className="text-slate-600 text-[10px] mt-0.5 font-mono tracking-widest">KILOGRAM</div>
              {scale.stable && <Badge className="mt-2 bg-green-600/20 text-green-400 border-green-500/30 text-[9px]"><CheckCircle className="w-2.5 h-2.5 mr-1" />STABLE - LOCKED</Badge>}
              {scale.running && !scale.stable && <p className="text-amber-400 text-[9px] mt-2 animate-pulse font-mono">MEASURING...</p>}
            </div>
          </Card>

          {/* Camera */}
          <CameraFeed compact />
        </div>

        {/* ═══ COL 3: Pending Vehicle List ═══ */}
        <div className="col-span-12 lg:col-span-5">
          <Card className="bg-gradient-to-b from-slate-800 to-slate-850 border-slate-700/50 shadow-lg h-full">
            <CardHeader className="pb-2 pt-3 px-4 border-b border-yellow-500/20">
              <CardTitle className="text-xs font-bold flex items-center justify-between">
                <span className="text-yellow-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Pending Vehicle List
                </span>
                <Badge className="bg-yellow-500/10 text-yellow-300 border-yellow-500/30 text-[10px]">{pending.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0" data-testid="vw-pending-card">
              <div className="overflow-auto max-h-[420px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700/50 bg-slate-800/50">
                      <TableHead className="text-slate-500 text-[10px] py-2 px-2 font-semibold">RST</TableHead>
                      <TableHead className="text-slate-500 text-[10px] py-2 px-2 font-semibold">Vehicle</TableHead>
                      <TableHead className="text-slate-500 text-[10px] py-2 px-2 font-semibold text-right">1st Wt</TableHead>
                      <TableHead className="text-slate-500 text-[10px] py-2 px-2 font-semibold">Party</TableHead>
                      <TableHead className="text-slate-500 text-[10px] py-2 px-2 font-semibold text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12">
                          <Truck className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                          <p className="text-slate-600 text-xs">Koi pending vehicle nahi</p>
                        </TableCell>
                      </TableRow>
                    ) : pending.map((p, i) => (
                      <TableRow key={p.id} className={`border-slate-700/30 hover:bg-yellow-500/5 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-800/30'}`} data-testid={`vw-pending-row-${p.id}`}>
                        <TableCell className="py-2 px-2">
                          <span className="text-amber-400 font-bold text-xs bg-amber-400/10 px-1.5 py-0.5 rounded">#{p.rst_no}</span>
                        </TableCell>
                        <TableCell className="text-white text-xs py-2 px-2 font-medium">{p.vehicle_no}</TableCell>
                        <TableCell className="text-cyan-300 text-xs py-2 px-2 text-right font-mono font-medium">{fmtWt(p.first_wt)}</TableCell>
                        <TableCell className="text-slate-300 text-xs py-2 px-2 truncate max-w-[80px]">{p.party_name || '-'}</TableCell>
                        <TableCell className="py-2 px-2 text-center">
                          <div className="flex items-center gap-1 justify-center">
                            <Button size="sm" className="h-6 px-2 text-[10px] bg-yellow-600/80 hover:bg-yellow-500 text-white"
                              data-testid={`vw-2nd-wt-${p.id}`}
                              onClick={() => loadPendingToForm(p)}>
                              <Scale className="w-3 h-3 mr-1" /> 2nd Wt
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500/40 hover:text-red-400"
                              data-testid={`vw-del-pending-${p.id}`}
                              onClick={() => handleDelete(p.id)}>
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

      {/* ─── COMPLETED ENTRIES TABLE ─── */}
      <Card className="bg-slate-800/50 border-slate-700/50 shadow">
        <CardHeader className="pb-2 pt-3 px-4 cursor-pointer" onClick={() => setShowCompleted(!showCompleted)}>
          <CardTitle className="text-xs flex items-center justify-between">
            <span className="text-slate-300 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-green-500" /> Completed Entries
              <Badge className="bg-green-500/10 text-green-400 border-green-500/30 text-[10px] ml-1">{completed.length}</Badge>
            </span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-slate-500" data-testid="vw-toggle-completed">
              {showCompleted ? <><EyeOff className="w-3 h-3 mr-1" />Hide</> : <><Eye className="w-3 h-3 mr-1" />Show</>}
            </Button>
          </CardTitle>
        </CardHeader>
        {showCompleted && (
          <CardContent className="p-0 border-t border-slate-700/30">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/30 bg-slate-800/30">
                    <TableHead className="text-slate-500 text-[10px] py-2 px-3 font-semibold">RST</TableHead>
                    <TableHead className="text-slate-500 text-[10px] py-2 px-3 font-semibold">Date</TableHead>
                    <TableHead className="text-slate-500 text-[10px] py-2 px-3 font-semibold">Vehicle</TableHead>
                    <TableHead className="text-slate-500 text-[10px] py-2 px-3 font-semibold">Party</TableHead>
                    <TableHead className="text-slate-500 text-[10px] py-2 px-3 font-semibold">Product</TableHead>
                    <TableHead className="text-slate-500 text-[10px] py-2 px-3 font-semibold">Pkts</TableHead>
                    <TableHead className="text-slate-500 text-[10px] py-2 px-3 font-semibold text-right">1st Wt</TableHead>
                    <TableHead className="text-slate-500 text-[10px] py-2 px-3 font-semibold text-right">2nd Wt</TableHead>
                    <TableHead className="text-slate-500 text-[10px] py-2 px-3 font-semibold text-right">Net Wt</TableHead>
                    <TableHead className="text-slate-500 text-[10px] py-2 px-3 font-semibold text-right">Cash</TableHead>
                    <TableHead className="text-slate-500 text-[10px] py-2 px-3 font-semibold text-right">Diesel</TableHead>
                    <TableHead className="text-slate-500 text-[10px] py-2 px-3 font-semibold text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completed.length === 0 ? (
                    <TableRow><TableCell colSpan={12} className="text-center text-slate-600 py-8 text-xs">Koi completed entry nahi</TableCell></TableRow>
                  ) : completed.map((e, i) => (
                    <TableRow key={e.id} className={`border-slate-700/20 hover:bg-slate-700/20 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-800/20'}`}>
                      <TableCell className="py-2 px-3"><span className="text-amber-400 font-bold text-xs">#{e.rst_no}</span></TableCell>
                      <TableCell className="text-slate-400 text-[11px] py-2 px-3">{e.date}</TableCell>
                      <TableCell className="text-white text-xs py-2 px-3 font-medium">{e.vehicle_no}</TableCell>
                      <TableCell className="text-slate-300 text-xs py-2 px-3">{e.party_name}</TableCell>
                      <TableCell className="py-2 px-3"><Badge variant="outline" className="text-[9px] border-slate-600/50 text-slate-400 font-normal">{e.product}</Badge></TableCell>
                      <TableCell className="text-slate-400 text-xs py-2 px-3">{e.tot_pkts || '-'}</TableCell>
                      <TableCell className="text-cyan-300 text-xs py-2 px-3 text-right font-mono">{fmtWt(e.first_wt)}</TableCell>
                      <TableCell className="text-cyan-300 text-xs py-2 px-3 text-right font-mono">{fmtWt(e.second_wt)}</TableCell>
                      <TableCell className="text-right py-2 px-3"><span className="text-green-400 font-bold text-sm font-mono">{fmtWt(e.net_wt)}</span></TableCell>
                      <TableCell className="text-right text-green-300 text-xs py-2 px-3 font-mono">{e.cash_paid ? fmtWt(e.cash_paid) : '-'}</TableCell>
                      <TableCell className="text-right text-orange-300 text-xs py-2 px-3 font-mono">{e.diesel_paid ? fmtWt(e.diesel_paid) : '-'}</TableCell>
                      <TableCell className="py-2 px-3">
                        <div className="flex items-center gap-0.5 justify-center">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-500 hover:text-white" onClick={() => handlePdf(e)} data-testid={`vw-pdf-${e.id}`}><Download className="w-3 h-3" /></Button>
                          {wa && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-green-500/60 hover:text-green-400" onClick={() => handleWA(e)} data-testid={`vw-wa-${e.id}`}><Send className="w-3 h-3" /></Button>}
                          {wa && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-teal-500/60 hover:text-teal-400" onClick={() => handleGroup(e)} data-testid={`vw-group-${e.id}`}><Users className="w-3 h-3" /></Button>}
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500/40 hover:text-red-400" onClick={() => handleDelete(e.id)} data-testid={`vw-del-${e.id}`}><Trash2 className="w-3 h-3" /></Button>
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

      {/* Old Second Weight Dialog removed - using inline form mode now */}

      <SendToGroupDialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen} text={groupText} pdfUrl={groupPdfUrl} />
    </div>
  );
}
