import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
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
import { Trash2, RefreshCw, Scale, Truck, Clock, CheckCircle, Download, Send, Users, Camera, CameraOff, Wifi, Plus, Eye, EyeOff, Zap, Pencil, Printer } from "lucide-react";
import AutoSuggest from "./common/AutoSuggest";
import { useMessagingEnabled } from "../hooks/useMessagingEnabled";
import { downloadFile } from "../utils/download";

const _isElectron = typeof window !== "undefined" && (window.electronAPI || window.ELECTRON_API_URL);
const _isElectronEnv = typeof window !== "undefined" && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? "" : (process.env.REACT_APP_BACKEND_URL || "");
const API = `${BACKEND_URL}/api`;
const fmtWt = (w) => w ? Number(w).toLocaleString() : "0";

const safePrintHTML = (htmlContent) => {
  try {
    if (_isElectronEnv) {
      const w = window.open('', '_blank', 'width=900,height=700');
      if (w) { w.document.open(); w.document.write(htmlContent); w.document.close(); w.onload = () => w.focus(); }
    } else {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      iframe.contentDocument.open();
      iframe.contentDocument.write(htmlContent);
      iframe.contentDocument.close();
      setTimeout(() => { iframe.contentWindow.print(); setTimeout(() => document.body.removeChild(iframe), 1000); }, 500);
    }
  } catch (e) {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }
};

/* ─── Real Weighbridge Scale (Electron Serial Port) ─── */
function useRealScale() {
  const [weight, setWeight] = useState(0);
  const [stable, setStable] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api.onSerialWeight((data) => {
      setWeight(data.weight || 0);
      setStable(data.stable || false);
    });
    api.onSerialStatus((data) => {
      setConnected(data.connected || false);
      if (!data.connected) { setWeight(0); setStable(false); }
    });

    // Check initial status
    api.serialGetStatus().then(s => {
      setConnected(s.connected || false);
      setWeight(s.weight || 0);
      setStable(s.stable || false);
    });

    return () => { api.removeSerialListeners(); };
  }, []);

  const scheduleNext = useCallback(() => {}, []);
  return { weight, stable, running: connected, connected, scheduleNext };
}

/* ─── Simulator Scale (Cloud/Web Demo) ─── */
function useSimulatorScale() {
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

  const scheduleNext = useCallback(() => {
    if (autoRef.current) clearTimeout(autoRef.current);
    autoRef.current = setTimeout(() => startMeasure(), 3000 + Math.random() * 4000);
  }, [startMeasure]);

  useEffect(() => {
    const t = setTimeout(() => startMeasure(), 1500);
    return () => { clearTimeout(t); if (ref.current) clearInterval(ref.current); if (autoRef.current) clearTimeout(autoRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { weight, stable, running, scheduleNext, startMeasure };
}

/* ─── Auto-select: Real scale in Electron, Simulator in Web ─── */
function useLiveScale() {
  const isElectronApp = _isElectron && window.electronAPI?.serialGetStatus;
  const real = useRealScale();
  const sim = useSimulatorScale();
  return isElectronApp ? real : sim;
}

/* ─── Single Camera Feed with Snapshot Capture ─── */
const CameraFeed = forwardRef(function CameraFeed({ label, compact }, ref) {
  const [active, setActive] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);

  // Expose captureFrame method to parent via ref
  useImperativeHandle(ref, () => ({
    captureFrame: () => {
      if (!active || !videoRef.current) return null;
      const video = videoRef.current;
      if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      // Return base64 without the data:image prefix
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      return dataUrl.split(",")[1];
    },
    isActive: () => active
  }));

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
    <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-900" data-testid="camera-feed-panel">
      <div className="absolute top-1 left-1 z-10 flex items-center gap-1">
        <Badge className={`text-[8px] px-1 py-0 ${active ? 'bg-green-600' : 'bg-gray-600'}`}>
          {active ? <Camera className="w-2.5 h-2.5 mr-0.5" /> : <CameraOff className="w-2.5 h-2.5 mr-0.5" />}
          {active ? 'LIVE' : 'OFF'}
        </Badge>
      </div>
      <button onClick={toggle} className="absolute top-1 right-1 z-10 bg-black/60 rounded px-1.5 py-0.5 text-[8px] text-white hover:bg-black/80" data-testid="camera-toggle-btn">
        {active ? 'Stop' : 'Start'}
      </button>
      <div className={compact ? "h-[88px]" : "h-32"}>
        {active ? (
          <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-900">
            <div className="text-center">
              <Camera className="w-4 h-4 text-gray-600 mx-auto" />
              <p className="text-gray-500 text-[7px] mt-0.5">{label || "Camera"}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default function VehicleWeight({ filters }) {
  const blank = { date: new Date().toISOString().split("T")[0], vehicle_no: "", party_name: "", farmer_name: "", product: "GOVT PADDY", trans_type: "Receive(Pur)", j_pkts: "", p_pkts: "", tot_pkts: "", first_wt: "", remark: "", cash_paid: "", diesel_paid: "", rst_no: "" };
  const [form, setForm] = useState(blank);
  const [rstEditable, setRstEditable] = useState(false);
  const [entries, setEntries] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nextRst, setNextRst] = useState(1);
  const [secondWtValue, setSecondWtValue] = useState("");
  const [secondWtMode, setSecondWtMode] = useState(null);
  const [showCompleted, setShowCompleted] = useState(true);
  const [autoNotify, setAutoNotify] = useState(false);
  const [editDialog, setEditDialog] = useState({ open: false, entry: null });
  const [editForm, setEditForm] = useState({});
  const scale = useLiveScale();
  const wa = useMessagingEnabled();
  const frontCamRef = useRef(null);
  const sideCamRef = useRef(null);

  const [mandiTargets, setMandiTargets] = useState([]);
  const [partySuggestions, setPartySuggestions] = useState([]);
  const [mandiSuggestions, setMandiSuggestions] = useState([]);
  const [truckSuggestions, setTruckSuggestions] = useState([]);
  const kms = filters?.kms_year || "";

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/suggestions/agents`),
      axios.get(`${API}/suggestions/mandis`),
      axios.get(`${API}/suggestions/trucks`),
      axios.get(`${API}/mandi-targets?kms_year=${kms}`),
      axios.get(`${API}/vehicle-weight/auto-notify-setting`)
    ]).then(([agR, mnR, trR, tgR, anR]) => {
      setPartySuggestions(agR.data.suggestions || []);
      setMandiSuggestions(mnR.data.suggestions || []);
      setTruckSuggestions(trR.data.suggestions || []);
      setAutoNotify(anR.data.enabled || false);
      const targets = tgR.data || [];
      setMandiTargets(targets);
      if (targets.length > 0) {
        setForm(p => ({ ...p, party_name: targets[0].agent_name || '', farmer_name: targets[0].mandi_name || '' }));
      }
    }).catch(() => {});
  }, [kms]);

  const fetchMandisForParty = async (agent) => {
    try {
      const r = await axios.get(`${API}/suggestions/mandis?agent_name=${encodeURIComponent(agent)}`);
      setMandiSuggestions(r.data.suggestions || []);
    } catch {}
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [eR, pR, nR] = await Promise.all([
        axios.get(`${API}/vehicle-weight?kms_year=${kms}`),
        axios.get(`${API}/vehicle-weight/pending?kms_year=${kms}`),
        axios.get(`${API}/vehicle-weight/next-rst?kms_year=${kms}`)
      ]);
      setEntries(eR.data.entries || []);
      setPending(pR.data.pending || []);
      setNextRst(nR.data.next_rst || 1);
    } catch { toast.error("Data fetch error"); }
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

  const loadPendingToForm = (entry) => {
    setSecondWtMode(entry);
    setForm({
      date: entry.date || blank.date,
      vehicle_no: entry.vehicle_no || "",
      party_name: entry.party_name || "",
      farmer_name: entry.farmer_name || "",
      product: entry.product || "GOVT PADDY",
      trans_type: entry.trans_type || "Receive(Pur)",
      tot_pkts: entry.tot_pkts || "",
      j_pkts: entry.j_pkts || "",
      p_pkts: entry.p_pkts || "",
      first_wt: String(entry.first_wt || 0),
      remark: entry.remark || "",
      cash_paid: entry.cash_paid ? String(entry.cash_paid) : "",
      diesel_paid: entry.diesel_paid ? String(entry.diesel_paid) : "",
      rst_no: ""
    });
    setSecondWtValue("");
    toast.info(`RST #${entry.rst_no} loaded — Second Weight capture karein`);
  };
  const clearSecondWtMode = () => { setSecondWtMode(null); setForm(blank); setSecondWtValue(""); };

  const handleSaveSecondWt = async () => {
    if (!secondWtValue || Number(secondWtValue) <= 0) { toast.error("Second Weight daalen"); return; }
    try {
      const r = await axios.put(`${API}/vehicle-weight/${secondWtMode.id}/second-weight`, {
        second_wt: secondWtValue,
        cash_paid: form.cash_paid || "0",
        diesel_paid: form.diesel_paid || "0"
      });
      if (r.data.success) {
        toast.success(r.data.message);
        // Auto-notify on weight completion
        sendAutoNotify(secondWtMode.id);
        clearSecondWtMode();
        fetchData();
      }
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.vehicle_no) { toast.error("Vehicle No. daalen"); return; }
    if (!form.first_wt || Number(form.first_wt) <= 0) { toast.error("First Weight daalen"); return; }
    try {
      const payload = { ...form, kms_year: kms };
      if (form.rst_no && Number(form.rst_no) > 0) payload.rst_no = Number(form.rst_no);
      const r = await axios.post(`${API}/vehicle-weight`, payload);
      if (r.data.success) { toast.success(r.data.message); setForm({ ...blank, rst_no: "" }); setRstEditable(false); fetchData(); }
    } catch (e) { toast.error(e.response?.data?.detail || "Save error"); }
  };

  const handleDelete = async (id) => { if (!window.confirm("Delete karein?")) return; try { await axios.delete(`${API}/vehicle-weight/${id}`); toast.success("Deleted"); fetchData(); } catch { toast.error("Error"); } };

  // Auto-notify: capture camera frames & send to WhatsApp/Telegram
  const sendAutoNotify = async (entryId) => {
    if (!autoNotify) return;
    try {
      const frontImg = frontCamRef.current?.captureFrame?.() || "";
      const sideImg = sideCamRef.current?.captureFrame?.() || "";
      const r = await axios.post(`${API}/vehicle-weight/auto-notify`, {
        entry_id: entryId,
        front_image: frontImg,
        side_image: sideImg
      });
      if (r.data.success) {
        toast.success(`Auto Msg: ${r.data.message}`);
      }
    } catch (e) {
      console.error("Auto-notify error:", e);
    }
  };
  // Build complete weight text for messaging
  const buildWeightText = (e) => {
    let t = `*Weight Slip — RST #${e.rst_no}*\n`;
    t += `Date: ${e.date}\n`;
    t += `Vehicle: ${e.vehicle_no}\n`;
    t += `Party: ${e.party_name || '-'}\n`;
    t += `Farmer/Mandi: ${e.farmer_name || '-'}\n`;
    t += `Product: ${e.product || '-'}\n`;
    t += `Packets: ${e.tot_pkts || '-'}\n`;
    t += `───────────────\n`;
    t += `Gross Wt: ${Number(e.gross_wt || e.first_wt || 0).toLocaleString()} KG\n`;
    t += `Tare Wt: ${Number(e.tare_wt || e.second_wt || 0).toLocaleString()} KG\n`;
    t += `*Net Wt: ${Number(e.net_wt || 0).toLocaleString()} KG*\n`;
    t += `───────────────\n`;
    const cash = Number(e.cash_paid || 0);
    const diesel = Number(e.diesel_paid || 0);
    if (cash > 0) t += `Cash Paid: ₹${cash.toLocaleString()}\n`;
    if (diesel > 0) t += `Diesel Paid: ₹${diesel.toLocaleString()}\n`;
    if (cash > 0 || diesel > 0) t += `───────────────\n`;
    return t;
  };

  const handlePdf = (e) => { const u = `${API}/vehicle-weight/${e.id}/slip-pdf`; _isElectron ? downloadFile(u, `Slip_${e.rst_no}.pdf`) : window.open(u, "_blank"); };

  const handleWA = async (e) => {
    try {
      const text = buildWeightText(e);
      const frontImg = frontCamRef.current?.captureFrame?.() || "";
      const sideImg = sideCamRef.current?.captureFrame?.() || "";
      await axios.post(`${API}/vehicle-weight/send-manual`, {
        entry_id: e.id, text, front_image: frontImg, side_image: sideImg,
        send_to_numbers: true, send_to_group: false
      });
      toast.success("WhatsApp sent!");
    } catch { toast.error("WA send error"); }
  };

  const handleGroup = async (e) => {
    try {
      const text = buildWeightText(e);
      const frontImg = frontCamRef.current?.captureFrame?.() || "";
      const sideImg = sideCamRef.current?.captureFrame?.() || "";
      await axios.post(`${API}/vehicle-weight/send-manual`, {
        entry_id: e.id, text, front_image: frontImg, side_image: sideImg,
        send_to_numbers: false, send_to_group: true
      });
      toast.success("Group msg sent!");
    } catch { toast.error("Group send error"); }
  };

  // ── Edit entry ──
  const openEdit = (entry) => {
    setEditForm({
      vehicle_no: entry.vehicle_no || "",
      party_name: entry.party_name || "",
      farmer_name: entry.farmer_name || "",
      product: entry.product || "",
      tot_pkts: entry.tot_pkts || "",
      cash_paid: entry.cash_paid || "",
      diesel_paid: entry.diesel_paid || ""
    });
    setEditDialog({ open: true, entry });
  };
  const saveEdit = async () => {
    try {
      const r = await axios.put(`${API}/vehicle-weight/${editDialog.entry.id}/edit`, editForm);
      if (r.data.success) { toast.success("Updated!"); setEditDialog({ open: false, entry: null }); fetchData(); }
    } catch { toast.error("Update error"); }
  };

  // ── Print A5 with 2 copies (Party Copy + Customer Copy) ──
  const handlePrint = async (e) => {
    // Fetch settings branding
    let company = "NAVKAR AGRO", tagline = "JOLKO, KESINGA";
    try {
      const r = await axios.get(`${API}/branding`);
      if (r.data) { company = r.data.company_name || company; tagline = r.data.tagline || tagline; }
    } catch {}

    const rst = e.rst_no;
    const gross = Number(e.gross_wt || e.first_wt || 0).toLocaleString();
    const tare = Number(e.tare_wt || e.second_wt || 0).toLocaleString();
    const net = Number(e.net_wt || 0).toLocaleString();
    const cash = Number(e.cash_paid || 0);
    const diesel = Number(e.diesel_paid || 0);

    const copyHTML = (copyLabel, showSignature) => `
      <div class="copy-block">
        <div class="copy-label">${copyLabel}</div>
        <div class="header">
          <h1>${company}</h1>
          <p class="tagline">${tagline}</p>
          <h2>WEIGHT SLIP / तौल पर्ची</h2>
        </div>
        <table class="info-table">
          <tr><td class="lbl">RST No.</td><td class="val">#${rst}</td><td class="lbl">Date / दिनांक</td><td class="val">${e.date}</td></tr>
          <tr><td class="lbl">Vehicle No. / गाड़ी नं.</td><td class="val">${e.vehicle_no}</td><td class="lbl">Pkts / बोरे</td><td class="val">${e.tot_pkts || '-'}</td></tr>
          <tr><td class="lbl">Party / पार्टी</td><td class="val">${e.party_name || '-'}</td><td class="lbl">Mandi / मंडी</td><td class="val">${e.farmer_name || '-'}</td></tr>
          <tr><td class="lbl">Product / माल</td><td class="val" colspan="3">${e.product || '-'}</td></tr>
        </table>
        <table class="wt-table">
          <tr>
            <td class="wt-cell"><span class="wt-label">Gross Wt / कुल वजन</span><span class="wt-val">${gross} KG</span></td>
            <td class="wt-cell"><span class="wt-label">Tare Wt / खाली वजन</span><span class="wt-val">${tare} KG</span></td>
            <td class="wt-cell net"><span class="wt-label">Net Wt / शुद्ध वजन</span><span class="wt-val">${net} KG</span></td>
          </tr>
        </table>
        ${(cash > 0 || diesel > 0) ? `
        <table class="pay-table">
          <tr>
            ${cash > 0 ? `<td class="pay-cell"><span class="pay-label">Cash Paid / नकद</span><span class="pay-val">${cash.toLocaleString()}</span></td>` : ''}
            ${diesel > 0 ? `<td class="pay-cell"><span class="pay-label">Diesel Paid / डीजल</span><span class="pay-val">${diesel.toLocaleString()}</span></td>` : ''}
          </tr>
        </table>
        ` : ''}
        ${showSignature ? `
        <div class="sig-section">
          <div class="sig-box"><div class="sig-line"></div><p>Driver Signature / ड्राइवर हस्ताक्षर</p></div>
          <div class="sig-box"><div class="sig-line"></div><p>Authorized Signature / अधिकृत हस्ताक्षर</p></div>
        </div>
        ` : '<div style="height:12px"></div>'}
        <p class="footer-note">Computer Generated / कंप्यूटर जनित</p>
      </div>
    `;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Weight Slip #${rst}</title>
    <style>
      @page { size: A5 portrait; margin: 6mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; background: white; }
      .page { width: 148mm; min-height: 210mm; margin: 0 auto; display: flex; flex-direction: column; }
      .copy-block { border: 1.5px solid #333; border-radius: 4px; padding: 8px 10px; margin-bottom: 6px; flex: 1; position: relative; page-break-inside: avoid; }
      .copy-label { position: absolute; top: -8px; right: 12px; background: white; padding: 0 6px; font-size: 8px; font-weight: bold; color: #666; letter-spacing: 1px; text-transform: uppercase; }
      .header { text-align: center; margin-bottom: 6px; }
      .header h1 { font-size: 16px; font-weight: 900; color: #1a1a2e; margin-bottom: 1px; }
      .tagline { font-size: 8px; color: #888; margin-bottom: 4px; }
      .header h2 { font-size: 11px; color: #444; border-bottom: 1px solid #ddd; padding-bottom: 3px; display: inline-block; }
      .info-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
      .info-table td { padding: 3px 5px; font-size: 9px; border: 0.5px solid #ddd; }
      .lbl { color: #666; font-weight: 600; width: 22%; }
      .val { color: #111; font-weight: 700; width: 28%; }
      .wt-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
      .wt-cell { text-align: center; padding: 5px; border: 1px solid #ccc; width: 33.3%; background: #f8f8f8; }
      .wt-cell.net { background: #e8f5e9; border-color: #4caf50; }
      .wt-label { display: block; font-size: 7px; color: #666; margin-bottom: 2px; }
      .wt-val { display: block; font-size: 13px; font-weight: 900; color: #111; }
      .wt-cell.net .wt-val { color: #2e7d32; }
      .pay-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
      .pay-cell { text-align: center; padding: 4px; border: 1px solid #ddd; background: #fff8e1; }
      .pay-label { display: block; font-size: 7px; color: #666; }
      .pay-val { display: block; font-size: 11px; font-weight: 800; color: #e65100; }
      .sig-section { display: flex; justify-content: space-between; margin-top: 10px; margin-bottom: 4px; }
      .sig-box { text-align: center; width: 45%; }
      .sig-line { border-bottom: 1px solid #333; height: 25px; margin-bottom: 3px; }
      .sig-box p { font-size: 7px; color: #666; }
      .footer-note { text-align: center; font-size: 6px; color: #aaa; margin-top: 4px; }
      .cut-line { border-top: 1px dashed #999; margin: 4px 0; position: relative; }
      .cut-text { position: absolute; top: -7px; left: 50%; transform: translateX(-50%); background: white; padding: 0 8px; font-size: 7px; color: #999; }
      @media print { body { margin: 0; } .no-print { display: none !important; } .page { width: auto; min-height: auto; } }
      @media screen { .page { padding: 15px; border: 1px solid #ddd; margin: 10px auto; max-width: 600px; } }
    </style></head><body>
    <div class="page">
      ${copyHTML("PARTY COPY / पार्टी कॉपी", false)}
      <div class="cut-line"><span class="cut-text">✂ CUT HERE / काटें</span></div>
      ${copyHTML("CUSTOMER COPY / ग्राहक कॉपी", true)}
    </div>
    <div class="no-print" style="text-align:center;margin-top:20px;">
      <button onclick="window.print()" style="background:#d97706;color:white;border:none;padding:12px 30px;border-radius:6px;cursor:pointer;font-size:16px;font-weight:bold;">Print / प्रिंट करें</button>
    </div>
    </body></html>`;

    safePrintHTML(html);
  };

  const completed = entries.filter(e => e.status === "completed");

  return (
    <div className="space-y-4" data-testid="vehicle-weight-page">

      {/* ─── HEADER BAR ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Scale className="w-5 h-5 text-amber-600" /> Auto Vehicle Weight
          </h2>
          <Badge variant="outline" className={`text-[10px] h-5 ${scale.running || scale.connected ? 'border-green-500 text-green-700 bg-green-50' : 'border-gray-400 text-gray-500 bg-gray-50'}`}>
            <Wifi className="w-3 h-3 mr-1" />{_isElectron && window.electronAPI?.serialGetStatus ? (scale.connected ? 'COM Connected' : 'COM Disconnected') : 'COM3 Demo'}
          </Badge>
        </div>
        <Button onClick={fetchData} variant="ghost" size="sm" className="h-7 text-gray-500 hover:text-gray-800 text-xs" data-testid="vw-refresh">
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />Refresh
        </Button>
      </div>

      {/* ─── 3-COLUMN LAYOUT ─── */}
      <div className="grid grid-cols-12 gap-3">

        {/* ═══ COL 1: Entry Form ═══ */}
        <div className="col-span-12 lg:col-span-4">
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardHeader className="pb-2 pt-3 px-4 border-b border-gray-100 bg-gray-50/50">
              <CardTitle className="text-xs text-amber-700 font-bold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  {secondWtMode ? <Scale className="w-3.5 h-3.5 text-green-600" /> : <Plus className="w-3.5 h-3.5" />}
                  {secondWtMode ? `2nd Weight — RST #${secondWtMode.rst_no}` : 'New Entry'}
                </span>
                {secondWtMode ? (
                  <span className="px-2 py-0.5 rounded text-[10px] bg-green-100 text-green-700 font-mono font-bold">RST #{secondWtMode.rst_no}</span>
                ) : (
                  <span className="flex items-center gap-1">
                    {rstEditable ? (
                      <Input type="number" value={form.rst_no || ""} onChange={e => setForm(p => ({ ...p, rst_no: e.target.value }))}
                        placeholder={String(nextRst)} className="w-16 h-6 text-[10px] bg-white border-amber-300 text-amber-700 text-center px-1 font-mono"
                        data-testid="vw-rst-input" autoFocus />
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 font-mono font-bold" data-testid="vw-rst-badge">
                        RST #{form.rst_no || nextRst}
                      </span>
                    )}
                    <button onClick={() => { setRstEditable(!rstEditable); if (rstEditable && !form.rst_no) setForm(p => ({ ...p, rst_no: "" })); }}
                      className="text-gray-400 hover:text-amber-600 transition-colors" data-testid="vw-rst-edit-btn"
                      title={rstEditable ? "Auto RST" : "Edit RST"}>
                      {rstEditable ? <CheckCircle className="w-3 h-3 text-green-600" /> : <span className="text-[9px] text-gray-500 hover:text-amber-600">Edit</span>}
                    </button>
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-3">
              <form onSubmit={handleSubmit} className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-gray-600 text-[10px] mb-0.5 block">Date</Label>
                    <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                      className="bg-white border-gray-300 text-gray-900 h-8 text-xs" data-testid="vw-date" />
                  </div>
                  <div>
                    {secondWtMode ? (
                      <>
                        <Label className="text-gray-600 text-[10px] mb-0.5 block">Vehicle No *</Label>
                        <Input value={form.vehicle_no} disabled className="bg-gray-100 border-gray-300 text-gray-700 h-8 text-xs font-medium" data-testid="vw-vehicle" />
                      </>
                    ) : (
                      <AutoSuggest
                        value={form.vehicle_no}
                        onChange={e => setForm(p => ({ ...p, vehicle_no: e.target.value.toUpperCase() }))}
                        suggestions={truckSuggestions}
                        placeholder="OD 02 AB 1234"
                        onSelect={(val) => setForm(p => ({ ...p, vehicle_no: val.toUpperCase() }))}
                        label="Vehicle No *"
                        testId="vw-vehicle"
                      />
                    )}
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
                    <Label className="text-gray-600 text-[10px] mb-0.5 block">Product</Label>
                    <Select value={form.product} onValueChange={v => {
                      setForm(p => {
                        const updated = { ...p, product: v };
                        if (v === "GOVT PADDY" && mandiTargets.length > 0) {
                          updated.party_name = mandiTargets[0].agent_name || '';
                          updated.farmer_name = mandiTargets[0].mandi_name || '';
                        }
                        return updated;
                      });
                    }}>
                      <SelectTrigger className="bg-white border-gray-300 text-gray-900 h-8 text-xs" data-testid="vw-product"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["GOVT PADDY","PADDY","RICE","BHUSI","KANDA","OTHER"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-gray-600 text-[10px] mb-0.5 block">Trans Type</Label>
                    <Select value={form.trans_type} onValueChange={v => setForm(p => ({ ...p, trans_type: v }))}>
                      <SelectTrigger className="bg-white border-gray-300 text-gray-900 h-8 text-xs" data-testid="vw-trans"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Receive(Pur)">Receive(Pur)</SelectItem>
                        <SelectItem value="Dispatch(Sale)">Dispatch(Sale)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-gray-600 text-[10px] mb-0.5 block">Pkts</Label>
                    <Input type="number" value={form.tot_pkts} onChange={e => setForm(p => ({ ...p, tot_pkts: e.target.value }))}
                      placeholder="0" className="bg-white border-gray-300 text-gray-900 h-8 text-xs" data-testid="vw-bags" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-gray-600 text-[10px] mb-0.5 block">Remark</Label>
                    <Input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))}
                      placeholder="Optional" className="bg-white border-gray-300 text-gray-900 h-8 text-xs" data-testid="vw-remark" />
                  </div>
                  <div>
                    <Label className="text-green-700 text-[10px] mb-0.5 block font-semibold">Cash Paid</Label>
                    <Input type="number" value={form.cash_paid} onChange={e => setForm(p => ({ ...p, cash_paid: e.target.value }))}
                      placeholder="0" className="bg-green-50/50 border-green-300 text-green-800 h-8 text-xs font-medium" data-testid="vw-cash" />
                  </div>
                  <div>
                    <Label className="text-orange-700 text-[10px] mb-0.5 block font-semibold">Diesel Paid</Label>
                    <Input type="number" value={form.diesel_paid} onChange={e => setForm(p => ({ ...p, diesel_paid: e.target.value }))}
                      placeholder="0" className="bg-orange-50/50 border-orange-300 text-orange-800 h-8 text-xs font-medium" data-testid="vw-diesel" />
                  </div>
                </div>

                {/* Weight Input Section */}
                {secondWtMode ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                        <Label className="text-blue-700 text-[10px] font-bold mb-1 block">First Wt (Gross)</Label>
                        <div className="text-blue-700 text-2xl font-mono font-bold text-center">{Number(form.first_wt).toLocaleString()}</div>
                        <div className="text-blue-400 text-[9px] text-center">KG — Already captured</div>
                      </div>
                      <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                        <Label className="text-green-700 text-[10px] font-bold mb-1 block">Second Wt (Tare) *</Label>
                        <div className="flex gap-1.5 items-center">
                          <Input type="number" value={secondWtValue} onChange={e => setSecondWtValue(e.target.value)}
                            placeholder="0" className="bg-white border-green-300 text-green-800 h-10 text-xl font-mono font-bold text-center flex-1 focus-visible:ring-green-500/30"
                            data-testid="vw-second-wt-input" autoFocus />
                          {scale.stable && (
                            <Button type="button" onClick={capSecond} className="bg-green-600 hover:bg-green-500 h-10 px-2 shrink-0" data-testid="vw-capture-second-form">
                              <Zap className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    {secondWtValue && Number(secondWtValue) > 0 && (
                      <div className="bg-green-50 rounded-lg p-2 mt-2 text-center border border-green-200">
                        <span className="text-[10px] text-gray-500">Net Weight: </span>
                        <span className="text-green-700 text-xl font-bold font-mono">{Math.abs(Number(form.first_wt) - Number(secondWtValue)).toLocaleString()} KG</span>
                      </div>
                    )}
                    <div className="flex gap-2 mt-3">
                      <Button type="button" onClick={handleSaveSecondWt} className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold h-9 text-xs" data-testid="vw-save-second-form">
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Save Second Weight
                      </Button>
                      <Button type="button" onClick={clearSecondWtMode} variant="outline" className="border-gray-300 text-gray-600 h-9 text-xs px-3 hover:bg-gray-50">Cancel</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 mt-3">
                      <Label className="text-amber-700 text-xs font-bold mb-1.5 block">First Weight (KG) *</Label>
                      <div className="flex gap-2 items-center">
                        <Input type="number" value={form.first_wt} onChange={e => setForm(p => ({ ...p, first_wt: e.target.value }))}
                          placeholder="0" className="bg-white border-amber-300 text-amber-800 h-10 text-xl font-mono font-bold text-center flex-1 focus-visible:ring-amber-500/30"
                          data-testid="vw-first-wt" />
                        {scale.stable && (
                          <Button type="button" onClick={capFirst} className="bg-green-600 hover:bg-green-500 h-10 px-3 shrink-0" data-testid="vw-capture-first">
                            <Zap className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold h-9 text-xs" data-testid="vw-save-first">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Save First Weight
                      </Button>
                      <Button type="button" onClick={() => setForm(blank)} variant="outline" className="border-gray-300 text-gray-600 h-9 text-xs px-3 hover:bg-gray-50">Clear</Button>
                    </div>
                  </>
                )}
              </form>
            </CardContent>
          </Card>
        </div>

        {/* ═══ COL 2: Live Scale + 2 Cameras ═══ */}
        <div className="col-span-12 lg:col-span-3 space-y-2">
          {/* Digital Scale Display */}
          <Card className="bg-gradient-to-b from-gray-900 to-black border-gray-300 shadow overflow-hidden">
            <div className="bg-gray-800 px-3 py-1.5 flex items-center justify-between border-b border-gray-700">
              <span className="text-gray-400 text-[10px] font-medium flex items-center gap-1"><Scale className="w-3 h-3" /> WEIGHBRIDGE</span>
              <span className="text-green-400 text-[10px] flex items-center gap-0.5 font-medium">
                <Wifi className="w-3 h-3" /> COM3
              </span>
            </div>
            <div className="p-4 text-center relative">
              <div className={`font-mono text-5xl font-black tracking-wider transition-all duration-200 ${
                scale.stable ? 'text-green-400 drop-shadow-[0_0_20px_rgba(74,222,128,0.4)]'
                : scale.running ? 'text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                : 'text-gray-700'
              }`} data-testid="live-weight-display">
                {scale.weight > 0 ? scale.weight.toLocaleString() : '00,000'}
              </div>
              <div className="text-gray-500 text-[10px] mt-0.5 font-mono tracking-widest">KILOGRAM</div>
              {scale.stable && <Badge className="mt-2 bg-green-600/20 text-green-400 border-green-500/30 text-[9px]"><CheckCircle className="w-2.5 h-2.5 mr-1" />STABLE - LOCKED</Badge>}
              {scale.running && !scale.stable && <p className="text-amber-400 text-[9px] mt-2 animate-pulse font-mono">MEASURING...</p>}
            </div>
          </Card>

          {/* 2 Cameras - Different Angles */}
          <div className="grid grid-cols-2 gap-2">
            <CameraFeed ref={frontCamRef} label="Front View" compact />
            <CameraFeed ref={sideCamRef} label="Side View" compact />
          </div>
        </div>

        {/* ═══ COL 3: Pending Vehicle List ═══ */}
        <div className="col-span-12 lg:col-span-5">
          <Card className="bg-white border-gray-200 shadow-sm h-full">
            <CardHeader className="pb-2 pt-3 px-4 border-b border-gray-100 bg-yellow-50/50">
              <CardTitle className="text-xs font-bold flex items-center justify-between">
                <span className="text-yellow-700 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Pending Vehicle List
                </span>
                <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300 text-[10px]">{pending.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0" data-testid="vw-pending-card">
              <div className="overflow-auto max-h-[420px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-100 bg-gray-50">
                      <TableHead className="text-gray-500 text-[10px] py-2 px-2 font-semibold">RST</TableHead>
                      <TableHead className="text-gray-500 text-[10px] py-2 px-2 font-semibold">Vehicle</TableHead>
                      <TableHead className="text-gray-500 text-[10px] py-2 px-2 font-semibold text-right">1st Wt</TableHead>
                      <TableHead className="text-gray-500 text-[10px] py-2 px-2 font-semibold">Party</TableHead>
                      <TableHead className="text-gray-500 text-[10px] py-2 px-2 font-semibold text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12">
                          <Truck className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-gray-400 text-xs">Koi pending vehicle nahi</p>
                        </TableCell>
                      </TableRow>
                    ) : pending.map((p, i) => (
                      <TableRow key={p.id} className={`border-gray-100 hover:bg-yellow-50/50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`} data-testid={`vw-pending-row-${p.id}`}>
                        <TableCell className="py-2 px-2">
                          <span className="text-amber-700 font-bold text-xs bg-amber-100 px-1.5 py-0.5 rounded">#{p.rst_no}</span>
                        </TableCell>
                        <TableCell className="text-gray-900 text-xs py-2 px-2 font-medium">{p.vehicle_no}</TableCell>
                        <TableCell className="text-blue-700 text-xs py-2 px-2 text-right font-mono font-medium">{fmtWt(p.first_wt)}</TableCell>
                        <TableCell className="text-gray-600 text-xs py-2 px-2 truncate max-w-[80px]">{p.party_name || '-'}</TableCell>
                        <TableCell className="py-2 px-2 text-center">
                          <div className="flex items-center gap-1 justify-center">
                            <Button size="sm" className="h-6 px-2 text-[10px] bg-yellow-500 hover:bg-yellow-400 text-white"
                              data-testid={`vw-2nd-wt-${p.id}`}
                              onClick={() => loadPendingToForm(p)}>
                              <Scale className="w-3 h-3 mr-1" /> 2nd Wt
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
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
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="pb-2 pt-3 px-4 cursor-pointer bg-gray-50/50" onClick={() => setShowCompleted(!showCompleted)}>
          <CardTitle className="text-xs flex items-center justify-between">
            <span className="text-gray-700 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-green-600" /> Completed Entries
              <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px] ml-1">{completed.length}</Badge>
            </span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-gray-500 hover:text-gray-800" data-testid="vw-toggle-completed">
              {showCompleted ? <><EyeOff className="w-3 h-3 mr-1" />Hide</> : <><Eye className="w-3 h-3 mr-1" />Show</>}
            </Button>
          </CardTitle>
        </CardHeader>
        {showCompleted && (
          <CardContent className="p-0 border-t border-gray-100">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-100 bg-gray-50">
                    <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold">RST</TableHead>
                    <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold">Date</TableHead>
                    <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold">Vehicle</TableHead>
                    <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold">Party</TableHead>
                    <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold">Product</TableHead>
                    <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold">Pkts</TableHead>
                    <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold text-right">1st Wt</TableHead>
                    <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold text-right">2nd Wt</TableHead>
                    <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold text-right">Net Wt</TableHead>
                    <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold text-right">Cash</TableHead>
                    <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold text-right">Diesel</TableHead>
                    <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completed.length === 0 ? (
                    <TableRow><TableCell colSpan={12} className="text-center text-gray-400 py-8 text-xs">Koi completed entry nahi</TableCell></TableRow>
                  ) : completed.map((e, i) => (
                    <TableRow key={e.id} className={`border-gray-100 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                      <TableCell className="py-2 px-3"><span className="text-amber-700 font-bold text-xs">#{e.rst_no}</span></TableCell>
                      <TableCell className="text-gray-500 text-[11px] py-2 px-3">{e.date}</TableCell>
                      <TableCell className="text-gray-900 text-xs py-2 px-3 font-medium">{e.vehicle_no}</TableCell>
                      <TableCell className="text-gray-700 text-xs py-2 px-3">{e.party_name}</TableCell>
                      <TableCell className="py-2 px-3"><Badge variant="outline" className="text-[9px] border-gray-300 text-gray-600 font-normal">{e.product}</Badge></TableCell>
                      <TableCell className="text-gray-500 text-xs py-2 px-3">{e.tot_pkts || '-'}</TableCell>
                      <TableCell className="text-blue-700 text-xs py-2 px-3 text-right font-mono">{fmtWt(e.first_wt)}</TableCell>
                      <TableCell className="text-blue-700 text-xs py-2 px-3 text-right font-mono">{fmtWt(e.second_wt)}</TableCell>
                      <TableCell className="text-right py-2 px-3"><span className="text-green-700 font-bold text-sm font-mono">{fmtWt(e.net_wt)}</span></TableCell>
                      <TableCell className="text-right text-green-700 text-xs py-2 px-3 font-mono">{e.cash_paid ? fmtWt(e.cash_paid) : '-'}</TableCell>
                      <TableCell className="text-right text-orange-700 text-xs py-2 px-3 font-mono">{e.diesel_paid ? fmtWt(e.diesel_paid) : '-'}</TableCell>
                      <TableCell className="py-2 px-3">
                        <div className="flex items-center gap-0.5 justify-center">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-amber-600" onClick={() => openEdit(e)} data-testid={`vw-edit-${e.id}`} title="Edit"><Pencil className="w-3 h-3" /></Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-purple-600" onClick={() => handlePrint(e)} data-testid={`vw-print-${e.id}`} title="Print"><Printer className="w-3 h-3" /></Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-blue-600" onClick={() => handlePdf(e)} data-testid={`vw-pdf-${e.id}`} title="Download"><Download className="w-3 h-3" /></Button>
                          {wa && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-green-400 hover:text-green-600" onClick={() => handleWA(e)} data-testid={`vw-wa-${e.id}`} title="WhatsApp"><Send className="w-3 h-3" /></Button>}
                          {wa && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-teal-400 hover:text-teal-600" onClick={() => handleGroup(e)} data-testid={`vw-group-${e.id}`} title="Group"><Users className="w-3 h-3" /></Button>}
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-600" onClick={() => handleDelete(e.id)} data-testid={`vw-del-${e.id}`} title="Delete"><Trash2 className="w-3 h-3" /></Button>
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

      {/* Edit Dialog */}
      <Dialog open={editDialog.open} onOpenChange={v => setEditDialog({ open: v, entry: v ? editDialog.entry : null })}>
        <DialogContent className="bg-white border-gray-200 max-w-md" data-testid="vw-edit-dialog">
          <DialogHeader>
            <DialogTitle className="text-amber-700 flex items-center gap-2">
              <Pencil className="w-4 h-4" /> Edit RST #{editDialog.entry?.rst_no}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-600 text-xs mb-1 block">Vehicle No</Label>
                <Input value={editForm.vehicle_no || ""} onChange={e => setEditForm(p => ({ ...p, vehicle_no: e.target.value.toUpperCase() }))}
                  className="h-9 text-sm border-gray-300" data-testid="edit-vehicle" />
              </div>
              <div>
                <Label className="text-gray-600 text-xs mb-1 block">Product</Label>
                <Select value={editForm.product || ""} onValueChange={v => setEditForm(p => ({ ...p, product: v }))}>
                  <SelectTrigger className="h-9 text-sm border-gray-300" data-testid="edit-product"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["GOVT PADDY","PADDY","RICE","BHUSI","KANDA","OTHER"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-600 text-xs mb-1 block">Party Name</Label>
                <Input value={editForm.party_name || ""} onChange={e => setEditForm(p => ({ ...p, party_name: e.target.value }))}
                  className="h-9 text-sm border-gray-300" data-testid="edit-party" />
              </div>
              <div>
                <Label className="text-gray-600 text-xs mb-1 block">Farmer/Mandi</Label>
                <Input value={editForm.farmer_name || ""} onChange={e => setEditForm(p => ({ ...p, farmer_name: e.target.value }))}
                  className="h-9 text-sm border-gray-300" data-testid="edit-farmer" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-gray-600 text-xs mb-1 block">Packets</Label>
                <Input type="number" value={editForm.tot_pkts || ""} onChange={e => setEditForm(p => ({ ...p, tot_pkts: e.target.value }))}
                  className="h-9 text-sm border-gray-300" data-testid="edit-pkts" />
              </div>
              <div>
                <Label className="text-green-700 text-xs mb-1 block font-semibold">Cash Paid</Label>
                <Input type="number" value={editForm.cash_paid || ""} onChange={e => setEditForm(p => ({ ...p, cash_paid: e.target.value }))}
                  className="h-9 text-sm border-green-300 bg-green-50/50" data-testid="edit-cash" />
              </div>
              <div>
                <Label className="text-orange-700 text-xs mb-1 block font-semibold">Diesel Paid</Label>
                <Input type="number" value={editForm.diesel_paid || ""} onChange={e => setEditForm(p => ({ ...p, diesel_paid: e.target.value }))}
                  className="h-9 text-sm border-orange-300 bg-orange-50/50" data-testid="edit-diesel" />
              </div>
            </div>
            <Button onClick={saveEdit} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold h-10" data-testid="edit-save-btn">
              <CheckCircle className="w-4 h-4 mr-2" /> Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
