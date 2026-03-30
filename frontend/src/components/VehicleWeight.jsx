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
import { Trash2, RefreshCw, Scale, Truck, Clock, CheckCircle, Download, Send, Users, Camera, CameraOff, Wifi, Plus, Eye, EyeOff, Zap, Pencil, Printer, FileSpreadsheet, FileText, Filter, Search, X } from "lucide-react";
import AutoSuggest from "./common/AutoSuggest";
import { useMessagingEnabled } from "../hooks/useMessagingEnabled";
import { useConfirm } from "./ConfirmProvider";
import { downloadFile } from "../utils/download";
import PaginationBar from "./PaginationBar";

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

/* ─── Single Camera Feed with Snapshot Capture (IP Camera + USB Webcam) ─── */
const CameraFeed = forwardRef(function CameraFeed({ label, camKey, compact }, ref) {
  const [active, setActive] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [camType, setCamType] = useState("usb"); // "ip" or "usb"
  const [camUrl, setCamUrl] = useState("");
  const [imgError, setImgError] = useState(false);
  const videoRef = useRef(null);
  const imgRef = useRef(null);
  const zoomVideoRef = useRef(null);
  const zoomImgRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);

  // Load camera config
  useEffect(() => {
    try {
      const cfg = JSON.parse(localStorage.getItem('camera_config') || '{}');
      const type = cfg.type || "usb";
      setCamType(type);
      if (type === "ip") {
        const url = camKey === "front" ? (cfg.frontUrl || "") : (cfg.sideUrl || "");
        setCamUrl(url);
        // Auto-start IP cameras immediately
        if (url) { setActive(true); setImgError(false); }
      }
    } catch { /* ignore */ }

    const handleConfigChange = () => {
      try {
        const cfg = JSON.parse(localStorage.getItem('camera_config') || '{}');
        setCamType(cfg.type || "usb");
        if (cfg.type === "ip") {
          const url = camKey === "front" ? (cfg.frontUrl || "") : (cfg.sideUrl || "");
          setCamUrl(url);
          if (url) { setActive(true); setImgError(false); }
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('camera-config-changed', handleConfigChange);
    return () => window.removeEventListener('camera-config-changed', handleConfigChange);
  }, [camKey]);

  // Get display URL - use proxy for RTSP streams
  const getStreamUrl = useCallback((url) => {
    if (!url) return "";
    if (url.toLowerCase().startsWith("rtsp://")) {
      return `${API}/camera-stream?url=${encodeURIComponent(url)}`;
    }
    return url;
  }, []);

  const getSnapshotUrl = useCallback((url) => {
    if (!url) return "";
    if (url.toLowerCase().startsWith("rtsp://")) {
      return `${API}/camera-snapshot?url=${encodeURIComponent(url)}`;
    }
    return url;
  }, []);

  // Expose captureFrame method to parent via ref
  useImperativeHandle(ref, () => ({
    captureFrame: () => {
      if (!active) return null;
      if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      if (camType === "ip" && imgRef.current) {
        const img = imgRef.current;
        canvas.width = img.naturalWidth || 640;
        canvas.height = img.naturalHeight || 480;
        try { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); }
        catch {
          // CORS fallback: fetch snapshot via proxy
          return null;
        }
      } else if (videoRef.current) {
        const video = videoRef.current;
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } else { return null; }

      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      return dataUrl.split(",")[1];
    },
    isActive: () => active
  }));

  const displayUrl = getStreamUrl(camUrl);

  const toggle = useCallback(async () => {
    if (active) {
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
      if (videoRef.current) videoRef.current.srcObject = null;
      setActive(false);
      setZoomed(false);
      setImgError(false);
    } else {
      if (camType === "ip") {
        if (!camUrl) { toast.error("Camera URL set nahi hai. Settings > Camera Setup mai URL daalein"); return; }
        setImgError(false);
        setActive(true);
      } else {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
          streamRef.current = s;
          if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); }
          setActive(true);
        } catch { toast.error("Camera access nahi mila"); }
      }
    }
  }, [active, camType, camUrl]);

  // Attach stream to zoom video when zoomed opens (USB mode)
  useEffect(() => {
    if (zoomed && camType === "usb" && zoomVideoRef.current && streamRef.current) {
      zoomVideoRef.current.srcObject = streamRef.current;
      zoomVideoRef.current.play().catch(() => {});
    }
  }, [zoomed, camType]);

  // ESC key to close zoom
  useEffect(() => {
    if (!zoomed) return;
    const handler = (e) => { if (e.key === 'Escape') setZoomed(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [zoomed]);

  useEffect(() => () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); }
    // Stop IP camera MJPEG streams on unmount
    if (imgRef.current) imgRef.current.src = "";
    if (zoomImgRef.current) zoomImgRef.current.src = "";
  }, []);

  const renderFeed = (imgRefToUse, vidRefToUse, cssClass) => {
    if (camType === "ip") {
      return imgError ? (
        <div className={`${cssClass} flex items-center justify-center bg-red-900/30`}>
          <p className="text-red-400 text-[9px] text-center px-2">IP Camera connect nahi ho paya.<br/>URL check karein.</p>
        </div>
      ) : (
        <img ref={imgRefToUse} src={displayUrl} alt={label} className={`${cssClass} object-cover`}
          crossOrigin="anonymous"
          onError={() => setImgError(true)}
          onLoad={() => setImgError(false)}
        />
      );
    }
    return <video ref={vidRefToUse} className={`${cssClass} object-cover`} autoPlay muted playsInline />;
  };

  return (
    <>
      <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-900 cursor-pointer" data-testid="camera-feed-panel"
        onClick={() => { if (active) setZoomed(true); }}>
        <div className="absolute top-1 left-1 z-10 flex items-center gap-1">
          <Badge className={`text-[8px] px-1 py-0 ${active ? 'bg-green-600' : 'bg-gray-600'}`}>
            {active ? <Camera className="w-2.5 h-2.5 mr-0.5" /> : <CameraOff className="w-2.5 h-2.5 mr-0.5" />}
            {active ? 'LIVE' : 'OFF'}
          </Badge>
          {camType === "ip" && <Badge className="text-[7px] px-1 py-0 bg-blue-700">IP</Badge>}
        </div>
        <button onClick={(e) => { e.stopPropagation(); toggle(); }} className="absolute top-1 right-1 z-10 bg-black/60 rounded px-1.5 py-0.5 text-[8px] text-white hover:bg-black/80" data-testid="camera-toggle-btn">
          {active ? 'Stop' : 'Start'}
        </button>
        {active && <div className="absolute bottom-1 right-1 z-10 bg-black/50 rounded px-1 py-0.5 text-[7px] text-white/70">Click to zoom</div>}
        <div className={compact ? "h-[88px]" : "h-[140px]"}>
          {active ? (
            renderFeed(imgRef, videoRef, "w-full h-full")
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-900">
              <div className="text-center">
                {camType === "ip" ? <Wifi className="w-4 h-4 text-blue-500 mx-auto" /> : <Camera className="w-4 h-4 text-gray-600 mx-auto" />}
                <p className="text-gray-500 text-[7px] mt-0.5">{label || "Camera"} {camType === "ip" ? "(IP)" : ""}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Zoom Popup */}
      {zoomed && (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center" onClick={() => setZoomed(false)} data-testid="camera-zoom-overlay">
          <div className="relative w-[85vw] max-w-[900px] rounded-xl overflow-hidden shadow-2xl border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gray-900 px-4 py-2 flex items-center justify-between border-b border-gray-700">
              <span className="text-white text-sm font-semibold flex items-center gap-2">
                <Camera className="w-4 h-4 text-green-400" /> {label || "Camera"}
                <Badge className="bg-green-600 text-[9px] ml-1">LIVE</Badge>
                {camType === "ip" && <Badge className="bg-blue-700 text-[9px]">IP Camera</Badge>}
              </span>
              <button onClick={() => setZoomed(false)} className="text-gray-400 hover:text-white text-xs bg-gray-800 rounded px-2 py-1">
                ESC
              </button>
            </div>
            {camType === "ip" ? (
              <img ref={zoomImgRef} src={displayUrl} alt={label} className="w-full aspect-video object-contain bg-black" crossOrigin="anonymous" />
            ) : (
              <video ref={zoomVideoRef} className="w-full aspect-video object-contain bg-black" autoPlay muted playsInline />
            )}
          </div>
        </div>
      )}
    </>
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
  const [vwPage, setVwPage] = useState(1);
  const [vwTotalPages, setVwTotalPages] = useState(1);
  const [vwTotalCount, setVwTotalCount] = useState(0);
  const VW_PAGE_SIZE = 200;
  const [secondWtValue, setSecondWtValue] = useState("");
  const [secondWtMode, setSecondWtMode] = useState(null);
  const [showCompleted, setShowCompleted] = useState(true);
  const [autoNotify, setAutoNotify] = useState(false);
  const [editDialog, setEditDialog] = useState({ open: false, entry: null });
  const [editForm, setEditForm] = useState({});
  const [photoDialog, setPhotoDialog] = useState({ open: false, data: null, loading: false });
  const [linkedRst, setLinkedRst] = useState(new Set());
  const [zoomImg, setZoomImg] = useState(null); // for photo zoom
  const scale = useLiveScale();
  const { wa } = useMessagingEnabled();
  const showConfirm = useConfirm();
  const frontCamRef = useRef(null);
  const sideCamRef = useRef(null);

  const [mandiTargets, setMandiTargets] = useState([]);
  const [partySuggestions, setPartySuggestions] = useState([]);
  const [mandiSuggestions, setMandiSuggestions] = useState([]);
  const [truckSuggestions, setTruckSuggestions] = useState([]);
  const kms = filters?.kms_year || "";

  // VW Filters - default today
  const todayStr = new Date().toISOString().split("T")[0];
  const [vwFilters, setVwFilters] = useState({ date_from: todayStr, date_to: todayStr, vehicle_no: "", party_name: "", farmer_name: "", rst_no: "" });
  const [showVwFilters, setShowVwFilters] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      axios.get(`${API}/suggestions/agents`, { signal: ctrl.signal }),
      axios.get(`${API}/suggestions/mandis`, { signal: ctrl.signal }),
      axios.get(`${API}/suggestions/trucks`, { signal: ctrl.signal }),
      axios.get(`${API}/mandi-targets?kms_year=${kms}`, { signal: ctrl.signal }),
      axios.get(`${API}/vehicle-weight/auto-notify-setting`, { signal: ctrl.signal })
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
    return () => ctrl.abort();
  }, [kms]);

  const fetchMandisForParty = async (agent) => {
    try {
      const r = await axios.get(`${API}/suggestions/mandis?agent_name=${encodeURIComponent(agent)}`);
      setMandiSuggestions(r.data.suggestions || []);
    } catch {}
  };

  const abortRef = useRef(null);
  const fetchData = useCallback(async (fetchPage) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const p = fetchPage || vwPage;
      const fp = new URLSearchParams({ kms_year: kms, status: "completed", page: p, page_size: VW_PAGE_SIZE });
      if (vwFilters.date_from) fp.append("date_from", vwFilters.date_from);
      if (vwFilters.date_to) fp.append("date_to", vwFilters.date_to);
      if (vwFilters.vehicle_no) fp.append("vehicle_no", vwFilters.vehicle_no);
      if (vwFilters.party_name) fp.append("party_name", vwFilters.party_name);
      if (vwFilters.farmer_name) fp.append("farmer_name", vwFilters.farmer_name);
      if (vwFilters.rst_no) fp.append("rst_no", vwFilters.rst_no);
      const [eR, pR, nR, lR] = await Promise.all([
        axios.get(`${API}/vehicle-weight?${fp.toString()}`, { signal: ctrl.signal }),
        axios.get(`${API}/vehicle-weight/pending?kms_year=${kms}`, { signal: ctrl.signal }),
        axios.get(`${API}/vehicle-weight/next-rst?kms_year=${kms}`, { signal: ctrl.signal }),
        axios.get(`${API}/vehicle-weight/linked-rst?kms_year=${kms}`, { signal: ctrl.signal })
      ]);
      setEntries(eR.data.entries || []);
      setVwTotalPages(eR.data.total_pages || 1);
      setVwTotalCount(eR.data.total || 0);
      setVwPage(eR.data.page || 1);
      setPending(pR.data.pending || []);
      setNextRst(nR.data.next_rst || 1);
      setLinkedRst(new Set(lR.data.linked_rst || []));
    } catch (e) { if (!ctrl.signal.aborted) toast.error("Data fetch error"); }
    if (!ctrl.signal.aborted) setLoading(false);
  }, [kms, vwPage, vwFilters]);
  useEffect(() => { fetchData(); return () => { if (abortRef.current) abortRef.current.abort(); }; }, [fetchData]);

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
      // Capture camera photos on second weight
      const frontImg = frontCamRef.current?.captureFrame?.() || "";
      const sideImg = sideCamRef.current?.captureFrame?.() || "";
      const r = await axios.put(`${API}/vehicle-weight/${secondWtMode.id}/second-weight`, {
        second_wt: secondWtValue,
        cash_paid: form.cash_paid || "0",
        diesel_paid: form.diesel_paid || "0",
        second_wt_front_img: frontImg,
        second_wt_side_img: sideImg
      });
      if (r.data.success) {
        toast.success(r.data.message);
        // Auto-notify on weight completion (images already saved, just send)
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
      // Capture camera photos on first weight
      const frontImg = frontCamRef.current?.captureFrame?.() || "";
      const sideImg = sideCamRef.current?.captureFrame?.() || "";
      const payload = { ...form, kms_year: kms, first_wt_front_img: frontImg, first_wt_side_img: sideImg };
      if (form.rst_no && Number(form.rst_no) > 0) payload.rst_no = Number(form.rst_no);
      const r = await axios.post(`${API}/vehicle-weight`, payload);
      if (r.data.success) { toast.success(r.data.message); setForm({ ...blank, rst_no: "" }); setRstEditable(false); fetchData(); }
    } catch (e) { toast.error(e.response?.data?.detail || "Save error"); }
  };

  const handleDelete = async (id) => { if (!await showConfirm("Delete", "Kya aap ye transaction delete karna chahte hain?")) return; try { await axios.delete(`${API}/vehicle-weight/${id}`); toast.success("Deleted"); fetchData(); } catch { toast.error("Error"); } };

  // Auto-notify: images already saved with entry, just trigger notify
  const sendAutoNotify = async (entryId) => {
    if (!autoNotify) return;
    try {
      const r = await axios.post(`${API}/vehicle-weight/auto-notify`, {
        entry_id: entryId
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

  const handlePdf = (e) => { const u = `${API}/vehicle-weight/${e.id}/slip-pdf?party_only=1`; _isElectron ? downloadFile(u, `Slip_${e.rst_no}.pdf`) : window.open(u, "_blank"); };

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

  // ── View Photos ──
  const openPhotos = async (entry) => {
    setPhotoDialog({ open: true, data: null, loading: true });
    try {
      const [r, br] = await Promise.all([
        axios.get(`${API}/vehicle-weight/${entry.id}/photos`),
        axios.get(`${API}/branding`).catch(() => ({ data: null }))
      ]);
      const brandInfo = { company: br.data?.company_name || "NAVKAR AGRO", tagline: br.data?.tagline || "JOLKO, KESINGA - Mill Entry System" };
      setPhotoDialog({ open: true, data: { ...r.data, _brand: brandInfo }, loading: false });
    } catch {
      toast.error("Photos load nahi hue");
      setPhotoDialog({ open: false, data: null, loading: false });
    }
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
          <div class="slip-title">WEIGHT SLIP / तौल पर्ची</div>
        </div>
        <table class="info-table">
          <tr><td class="lbl">RST No.</td><td class="val rst">#${rst}</td><td class="lbl">Date / दिनांक</td><td class="val">${e.date}</td></tr>
          <tr><td class="lbl">Vehicle / गाड़ी</td><td class="val">${e.vehicle_no}</td><td class="lbl">Trans</td><td class="val">${e.trans_type || '-'}</td></tr>
          <tr><td class="lbl">Party / पार्टी</td><td class="val">${e.party_name || '-'}</td><td class="lbl">Farmer</td><td class="val">${e.farmer_name || '-'}</td></tr>
          <tr><td class="lbl">Product / माल</td><td class="val">${e.product || '-'}</td><td class="lbl">Bags / बोरे</td><td class="val">${e.tot_pkts || '-'}</td></tr>
        </table>
        <table class="wt-table">
          <tr>
            <td class="wt-cell"><span class="wt-label">Gross / कुल</span><span class="wt-val">${gross} KG</span></td>
            <td class="wt-cell"><span class="wt-label">Tare / खाली</span><span class="wt-val">${tare} KG</span></td>
            <td class="wt-cell net"><span class="wt-label">Net / शुद्ध</span><span class="wt-val">${net} KG</span></td>
            ${(cash > 0 || diesel > 0) ? `
              ${cash > 0 ? `<td class="wt-cell pay"><span class="wt-label">Cash / नकद</span><span class="wt-val pay-v">${cash.toLocaleString()}</span></td>` : ''}
              ${diesel > 0 ? `<td class="wt-cell pay"><span class="wt-label">Diesel / डीजल</span><span class="wt-val pay-v">${diesel.toLocaleString()}</span></td>` : ''}
            ` : ''}
          </tr>
        </table>
        ${showSignature ? `
        <div class="sig-section">
          <div class="sig-box"><div class="sig-line"></div><p>Driver / ड्राइवर</p></div>
          <div class="sig-box"><div class="sig-line"></div><p>Authorized / अधिकृत</p></div>
        </div>
        ` : ''}
        <p class="footer-note">${company} | Computer Generated</p>
      </div>
    `;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Weight Slip #${rst}</title>
    <style>
      @page { size: 148mm 210mm; margin: 3mm 4mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { width: 140mm; margin: 0 auto; }
      .copy-block { border: 1.5px solid #222; border-radius: 3px; padding: 6px 8px 5px; position: relative; }
      .copy-label { position: absolute; top: -1px; right: 8px; background: white; padding: 0 5px; font-size: 8px; font-weight: bold; color: #666; letter-spacing: 0.8px; text-transform: uppercase; }
      .header { text-align: center; margin-bottom: 4px; border-bottom: 2px solid #1a1a2e; padding-bottom: 4px; }
      .header h1 { font-size: 18px; font-weight: 900; color: #1a1a2e; line-height: 1.1; }
      .tagline { font-size: 9px; color: #777; margin: 2px 0; }
      .slip-title { font-size: 11px; color: #333; font-weight: 700; margin-top: 2px; }
      .info-table { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
      .info-table td { padding: 3px 5px; font-size: 10px; border: 0.5px solid #ccc; line-height: 1.3; }
      .lbl { color: #333; font-weight: 700; width: 20%; white-space: nowrap; }
      .val { color: #000; font-weight: 800; width: 30%; }
      .val.rst { font-size: 12px; color: #1a1a2e; }
      .wt-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
      .wt-cell { text-align: center; padding: 4px 3px; border: 1.5px solid #999; background: #f5f5f5; vertical-align: middle; }
      .wt-cell.net { background: #e8f5e9; border-color: #2e7d32; }
      .wt-cell.pay { background: #fff8e1; border-color: #f9a825; }
      .wt-label { display: block; font-size: 8px; color: #444; font-weight: 600; margin-bottom: 1px; }
      .wt-val { display: block; font-size: 15px; font-weight: 900; color: #000; }
      .wt-cell.net .wt-val { color: #1b5e20; font-size: 16px; }
      .pay-v { color: #e65100 !important; font-size: 13px !important; }
      .sig-section { display: flex; justify-content: space-between; margin-top: 3px; }
      .sig-box { text-align: center; width: 44%; }
      .sig-line { border-bottom: 1.5px solid #333; height: 16px; margin-bottom: 2px; }
      .sig-box p { font-size: 8px; color: #444; font-weight: 600; }
      .footer-note { text-align: center; font-size: 7px; color: #999; margin-top: 3px; }
      .cut-line { border-top: 1.5px dashed #aaa; margin: 3mm 0; position: relative; height: 0; }
      .cut-text { position: absolute; top: -6px; left: 50%; transform: translateX(-50%); background: white; padding: 0 6px; font-size: 7px; color: #aaa; }
      @media print { body { margin: 0; } .no-print { display: none !important; } }
      @media screen { .page { padding: 10px; border: 1px solid #ccc; margin: 10px auto; max-width: 550px; } }
    </style></head><body>
    <div class="page">
      ${copyHTML("PARTY COPY / पार्टी प्रति", false)}
      <div class="cut-line"><span class="cut-text">- - - CUT HERE / काटें - - -</span></div>
      ${copyHTML("CUSTOMER COPY / ग्राहक प्रति", true)}
    </div>
    <div class="no-print" style="text-align:center;margin-top:20px;">
      <button onclick="window.print()" style="background:#d97706;color:white;border:none;padding:12px 30px;border-radius:6px;cursor:pointer;font-size:16px;font-weight:bold;">Print / प्रिंट करें</button>
    </div>
    </body></html>`;

    safePrintHTML(html);
  };

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
                        labelClassName="text-gray-600 text-[10px] mb-0.5 block"
                        inputClassName="bg-white border-gray-300 text-gray-900 h-8 text-xs font-medium"
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
                      labelClassName="text-gray-600 text-[10px] mb-0.5 block"
                      inputClassName="bg-white border-gray-300 text-gray-900 h-8 text-xs"
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
                      labelClassName="text-gray-600 text-[10px] mb-0.5 block"
                      inputClassName="bg-white border-gray-300 text-gray-900 h-8 text-xs"
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

          {/* 2 Cameras - Stacked Vertically */}
          <div className="space-y-2">
            <CameraFeed ref={frontCamRef} label="Front View" camKey="front" />
            <CameraFeed ref={sideCamRef} label="Side View" camKey="side" />
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
        <CardHeader className="pb-2 pt-3 px-4 bg-gray-50/50">
          <CardTitle className="text-xs flex items-center justify-between">
            <span className="text-gray-700 flex items-center gap-1.5 cursor-pointer" onClick={() => setShowCompleted(!showCompleted)}>
              <CheckCircle className="w-3.5 h-3.5 text-green-600" /> Completed Entries
              <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px] ml-1">{vwTotalCount}</Badge>
            </span>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] text-gray-600 border-gray-300" onClick={() => setShowVwFilters(!showVwFilters)} data-testid="vw-filter-toggle">
                <Filter className="w-3 h-3 mr-1" />{showVwFilters ? 'Hide' : 'Filters'}
              </Button>
              <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] text-emerald-700 border-emerald-300 hover:bg-emerald-50" data-testid="vw-export-excel"
                onClick={() => { const fp = new URLSearchParams({ kms_year: kms, status: "completed", ...vwFilters }); Object.keys(vwFilters).forEach(k => { if (!vwFilters[k]) fp.delete(k); }); downloadFile(`${API}/vehicle-weight/export/excel?${fp.toString()}`, `vehicle_weight.xlsx`); }}>
                <FileSpreadsheet className="w-3 h-3 mr-1" />Excel
              </Button>
              <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] text-red-700 border-red-300 hover:bg-red-50" data-testid="vw-export-pdf"
                onClick={() => { const fp = new URLSearchParams({ kms_year: kms, status: "completed", ...vwFilters }); Object.keys(vwFilters).forEach(k => { if (!vwFilters[k]) fp.delete(k); }); downloadFile(`${API}/vehicle-weight/export/pdf?${fp.toString()}`, `vehicle_weight.pdf`); }}>
                <FileText className="w-3 h-3 mr-1" />PDF
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-gray-500 hover:text-gray-800" data-testid="vw-toggle-completed" onClick={() => setShowCompleted(!showCompleted)}>
                {showCompleted ? <><EyeOff className="w-3 h-3 mr-1" />Hide</> : <><Eye className="w-3 h-3 mr-1" />Show</>}
              </Button>
            </div>
          </CardTitle>
          {/* ── Filter Bar ── */}
          {showVwFilters && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mt-2 pb-1" data-testid="vw-filter-bar">
              <div>
                <label className="text-[9px] text-gray-500 font-medium">Date From</label>
                <Input type="date" className="h-7 text-xs" value={vwFilters.date_from} onChange={e => { setVwFilters(p => ({ ...p, date_from: e.target.value })); setVwPage(1); }} data-testid="vw-filter-date-from" />
              </div>
              <div>
                <label className="text-[9px] text-gray-500 font-medium">Date To</label>
                <Input type="date" className="h-7 text-xs" value={vwFilters.date_to} onChange={e => { setVwFilters(p => ({ ...p, date_to: e.target.value })); setVwPage(1); }} data-testid="vw-filter-date-to" />
              </div>
              <div>
                <label className="text-[9px] text-gray-500 font-medium">RST No</label>
                <Input type="text" placeholder="RST..." className="h-7 text-xs" value={vwFilters.rst_no} onChange={e => { setVwFilters(p => ({ ...p, rst_no: e.target.value })); setVwPage(1); }} data-testid="vw-filter-rst" />
              </div>
              <div>
                <label className="text-[9px] text-gray-500 font-medium">Vehicle</label>
                <Input type="text" placeholder="Vehicle..." className="h-7 text-xs" value={vwFilters.vehicle_no} onChange={e => { setVwFilters(p => ({ ...p, vehicle_no: e.target.value })); setVwPage(1); }} data-testid="vw-filter-vehicle" />
              </div>
              <div>
                <label className="text-[9px] text-gray-500 font-medium">Party</label>
                <Input type="text" placeholder="Party..." className="h-7 text-xs" value={vwFilters.party_name} onChange={e => { setVwFilters(p => ({ ...p, party_name: e.target.value })); setVwPage(1); }} data-testid="vw-filter-party" />
              </div>
              <div>
                <label className="text-[9px] text-gray-500 font-medium">Mandi</label>
                <div className="flex gap-1">
                  <Input type="text" placeholder="Mandi..." className="h-7 text-xs" value={vwFilters.farmer_name} onChange={e => { setVwFilters(p => ({ ...p, farmer_name: e.target.value })); setVwPage(1); }} data-testid="vw-filter-mandi" />
                  <Button variant="ghost" size="sm" className="h-7 px-1.5 text-[10px] text-gray-400 hover:text-red-600" data-testid="vw-filter-clear"
                    onClick={() => { setVwFilters({ date_from: todayStr, date_to: todayStr, vehicle_no: "", party_name: "", farmer_name: "", rst_no: "" }); setVwPage(1); }}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}
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
                    <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold">Mandi</TableHead>
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
                  {entries.length === 0 ? (
                    <TableRow><TableCell colSpan={13} className="text-center text-gray-400 py-8 text-xs" data-testid="vw-no-entries-today">
                      {vwFilters.date_from === todayStr && vwFilters.date_to === todayStr
                        ? "Aaj ki koi Vehicle Weight entry nahi hai"
                        : "Koi entry nahi mili - Filter change karke dekhein"}
                    </TableCell></TableRow>
                  ) : entries.map((e, i) => (
                    <TableRow key={e.id} className={`border-gray-100 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                      <TableCell className="py-2 px-3"><span className="text-amber-700 font-bold text-xs">#{e.rst_no}</span></TableCell>
                      <TableCell className="text-gray-500 text-[11px] py-2 px-3">{e.date}</TableCell>
                      <TableCell className="text-gray-900 text-xs py-2 px-3 font-medium">{e.vehicle_no}</TableCell>
                      <TableCell className="text-gray-700 text-xs py-2 px-3">{e.party_name}</TableCell>
                      <TableCell className="text-gray-500 text-xs py-2 px-3">{e.farmer_name || '-'}</TableCell>
                      <TableCell className="py-2 px-3"><Badge variant="outline" className="text-[9px] border-gray-300 text-gray-600 font-normal">{e.product}</Badge></TableCell>
                      <TableCell className="text-gray-500 text-xs py-2 px-3">{e.tot_pkts || '-'}</TableCell>
                      <TableCell className="text-blue-700 text-xs py-2 px-3 text-right font-mono">{fmtWt(e.first_wt)}</TableCell>
                      <TableCell className="text-blue-700 text-xs py-2 px-3 text-right font-mono">{fmtWt(e.second_wt)}</TableCell>
                      <TableCell className="text-right py-2 px-3"><span className="text-green-700 font-bold text-sm font-mono">{fmtWt(e.net_wt)}</span></TableCell>
                      <TableCell className="text-right text-green-700 text-xs py-2 px-3 font-mono">{e.cash_paid ? fmtWt(e.cash_paid) : '-'}</TableCell>
                      <TableCell className="text-right text-orange-700 text-xs py-2 px-3 font-mono">{e.diesel_paid ? fmtWt(e.diesel_paid) : '-'}</TableCell>
                      <TableCell className="py-2 px-3">
                        <div className="flex items-center gap-0.5 justify-center">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-cyan-600" onClick={() => openPhotos(e)} data-testid={`vw-photos-${e.id}`} title="View Photos"><Eye className="w-3 h-3" /></Button>
                          {!linkedRst.has(e.rst_no) && (
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-amber-600" onClick={() => openEdit(e)} data-testid={`vw-edit-${e.id}`} title="Edit"><Pencil className="w-3 h-3" /></Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-purple-600" onClick={() => handlePrint(e)} data-testid={`vw-print-${e.id}`} title="Print"><Printer className="w-3 h-3" /></Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-blue-600" onClick={() => handlePdf(e)} data-testid={`vw-pdf-${e.id}`} title="Download"><Download className="w-3 h-3" /></Button>
                          {wa && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-green-400 hover:text-green-600" onClick={() => handleWA(e)} data-testid={`vw-wa-${e.id}`} title="WhatsApp"><Send className="w-3 h-3" /></Button>}
                          {wa && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-teal-400 hover:text-teal-600" onClick={() => handleGroup(e)} data-testid={`vw-group-${e.id}`} title="Group"><Users className="w-3 h-3" /></Button>}
                          {linkedRst.has(e.rst_no) ? (
                            <span className="h-6 w-6 flex items-center justify-center text-green-500" title="Mill Entry done" data-testid={`vw-linked-${e.id}`}><CheckCircle className="w-4 h-4" /></span>
                          ) : (
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-600" onClick={() => handleDelete(e.id)} data-testid={`vw-del-${e.id}`} title="Delete"><Trash2 className="w-3 h-3" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <PaginationBar page={vwPage} totalPages={vwTotalPages} total={vwTotalCount} pageSize={VW_PAGE_SIZE}
              onPageChange={(p) => { setVwPage(p); fetchData(p); }} />
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

      {/* Photo View Dialog - Print Slip Style */}
      <Dialog open={photoDialog.open} onOpenChange={v => !v && setPhotoDialog({ open: false, data: null, loading: false })}>
        <DialogContent className="bg-white border-gray-300 max-w-[520px] max-h-[90vh] overflow-y-auto p-0" data-testid="vw-photo-dialog">
          {photoDialog.loading ? (
            <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : photoDialog.data ? (
            <>
            <div className="border-[2px] border-gray-800 rounded m-3" data-testid="vw-photo-slip">
              {/* ── Slip Header ── */}
              <div className="text-center border-b-[2px] border-gray-800 py-2 px-3 relative">
                <div className="absolute top-1 right-2 text-[9px] text-gray-500 font-semibold tracking-wide">VIEW COPY</div>
                <h2 className="text-lg font-black text-gray-900 leading-tight tracking-wide" data-testid="slip-company-name">{photoDialog.data?._brand?.company || "NAVKAR AGRO"}</h2>
                <p className="text-[10px] text-gray-500 mt-0.5">{photoDialog.data?._brand?.tagline || "JOLKO, KESINGA - Mill Entry System"}</p>
                <div className="text-xs font-bold text-gray-700 mt-0.5">WEIGHT SLIP / तौल पर्ची</div>
              </div>

              {/* ── Info Table ── */}
              <table className="w-full border-collapse text-[11px]" data-testid="slip-info-table">
                <tbody>
                  <tr>
                    <td className="border border-gray-300 px-2 py-1 text-gray-600 font-bold whitespace-nowrap w-[22%]">RST No.</td>
                    <td className="border border-gray-300 px-2 py-1 font-extrabold text-gray-900 text-xs w-[28%]">#{photoDialog.data.rst_no}</td>
                    <td className="border border-gray-300 px-2 py-1 text-gray-600 font-bold whitespace-nowrap w-[22%]">Date / दिनांक</td>
                    <td className="border border-gray-300 px-2 py-1 font-extrabold text-gray-900 w-[28%]">{photoDialog.data.date || '-'}</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-2 py-1 text-gray-600 font-bold whitespace-nowrap">Vehicle / गाड़ी</td>
                    <td className="border border-gray-300 px-2 py-1 font-extrabold text-gray-900">{photoDialog.data.vehicle_no}</td>
                    <td className="border border-gray-300 px-2 py-1 text-gray-600 font-bold whitespace-nowrap">Trans</td>
                    <td className="border border-gray-300 px-2 py-1 font-extrabold text-gray-900">{photoDialog.data.trans_type || '-'}</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-2 py-1 text-gray-600 font-bold whitespace-nowrap">Party / पार्टी</td>
                    <td className="border border-gray-300 px-2 py-1 font-extrabold text-gray-900">{photoDialog.data.party_name || '-'}</td>
                    <td className="border border-gray-300 px-2 py-1 text-gray-600 font-bold whitespace-nowrap">Farmer</td>
                    <td className="border border-gray-300 px-2 py-1 font-extrabold text-gray-900">{photoDialog.data.farmer_name || '-'}</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-2 py-1 text-gray-600 font-bold whitespace-nowrap">Product / माल</td>
                    <td className="border border-gray-300 px-2 py-1 font-extrabold text-gray-900">{photoDialog.data.product || '-'}</td>
                    <td className="border border-gray-300 px-2 py-1 text-gray-600 font-bold whitespace-nowrap">Bags / बोरे</td>
                    <td className="border border-gray-300 px-2 py-1 font-extrabold text-gray-900">{photoDialog.data.tot_pkts || '-'}</td>
                  </tr>
                  {photoDialog.data.remark && photoDialog.data.remark !== '-' && (
                    <tr>
                      <td className="border border-gray-300 px-2 py-1 text-gray-600 font-bold whitespace-nowrap">Remark / टिप्पणी</td>
                      <td className="border border-gray-300 px-2 py-1 font-extrabold text-gray-900" colSpan={3}>{photoDialog.data.remark}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* ── Weight Summary Bar ── */}
              <div className="flex border-t-[2px] border-gray-800" data-testid="slip-weight-bar">
                <div className="flex-1 text-center py-1.5 border-r border-gray-400 bg-gray-50">
                  <span className="block text-[8px] font-bold text-gray-500 uppercase">Gross / कुल</span>
                  <span className="block text-sm font-black text-gray-900">{fmtWt(photoDialog.data.first_wt)} KG</span>
                </div>
                <div className="flex-1 text-center py-1.5 border-r border-gray-400 bg-gray-50">
                  <span className="block text-[8px] font-bold text-gray-500 uppercase">Tare / खाली</span>
                  <span className="block text-sm font-black text-gray-900">{fmtWt(photoDialog.data.second_wt)} KG</span>
                </div>
                <div className="flex-1 text-center py-1.5 border-r border-gray-400" style={{ background: '#e8f5e9' }}>
                  <span className="block text-[8px] font-bold text-green-800 uppercase">Net / शुद्ध</span>
                  <span className="block text-base font-black text-green-900">{fmtWt(photoDialog.data.net_wt)} KG</span>
                </div>
                {(Number(photoDialog.data.cash_paid || 0) > 0) && (
                  <div className="flex-1 text-center py-1.5 border-r border-gray-400" style={{ background: '#fff3e0' }}>
                    <span className="block text-[8px] font-bold text-orange-800 uppercase">Cash / नकद</span>
                    <span className="block text-sm font-black text-orange-900">{Number(photoDialog.data.cash_paid).toLocaleString()}</span>
                  </div>
                )}
                {(Number(photoDialog.data.diesel_paid || 0) > 0) && (
                  <div className="flex-1 text-center py-1.5" style={{ background: '#fff3e0' }}>
                    <span className="block text-[8px] font-bold text-orange-800 uppercase">Diesel / डीजल</span>
                    <span className="block text-sm font-black text-orange-900">{Number(photoDialog.data.diesel_paid).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* ── Footer ── */}
              <div className="text-center py-1 border-t border-gray-300">
                <span className="text-[8px] text-gray-400">{photoDialog.data?._brand?.company || "NAVKAR AGRO"} | Computer Generated</span>
              </div>
            </div>

            {/* ── Photos Section (Always visible) ── */}
              <div className="space-y-3 mx-3 mb-3">
                {/* 1st Weight Photos */}
                  <div className="border border-blue-300 rounded p-2.5 bg-blue-50/30">
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className="text-blue-800 font-bold text-[11px] flex items-center gap-1"><Scale className="w-3 h-3" /> 1st Weight (Gross)</h3>
                      <span className="text-blue-900 font-mono font-bold text-xs">{fmtWt(photoDialog.data.first_wt)} KG</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-gray-500 mb-0.5 font-medium">Front View</p>
                        {photoDialog.data.first_wt_front_img ? (
                          <img src={`data:image/jpeg;base64,${photoDialog.data.first_wt_front_img}`} alt="1st Wt Front" className="w-full rounded border border-gray-200 object-cover cursor-pointer hover:opacity-80 transition" style={{ maxHeight: 180 }} onClick={() => setZoomImg(`data:image/jpeg;base64,${photoDialog.data.first_wt_front_img}`)} />
                        ) : <div className="h-20 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-[10px]">No Photo</div>}
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 mb-0.5 font-medium">Side View</p>
                        {photoDialog.data.first_wt_side_img ? (
                          <img src={`data:image/jpeg;base64,${photoDialog.data.first_wt_side_img}`} alt="1st Wt Side" className="w-full rounded border border-gray-200 object-cover cursor-pointer hover:opacity-80 transition" style={{ maxHeight: 180 }} onClick={() => setZoomImg(`data:image/jpeg;base64,${photoDialog.data.first_wt_side_img}`)} />
                        ) : <div className="h-20 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-[10px]">No Photo</div>}
                      </div>
                    </div>
                  </div>

                {/* 2nd Weight Photos */}
                  <div className="border border-green-300 rounded p-2.5 bg-green-50/30">
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className="text-green-800 font-bold text-[11px] flex items-center gap-1"><Scale className="w-3 h-3" /> 2nd Weight (Tare)</h3>
                      <span className="text-green-900 font-mono font-bold text-xs">{fmtWt(photoDialog.data.second_wt)} KG</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-gray-500 mb-0.5 font-medium">Front View</p>
                        {photoDialog.data.second_wt_front_img ? (
                          <img src={`data:image/jpeg;base64,${photoDialog.data.second_wt_front_img}`} alt="2nd Wt Front" className="w-full rounded border border-gray-200 object-cover cursor-pointer hover:opacity-80 transition" style={{ maxHeight: 180 }} onClick={() => setZoomImg(`data:image/jpeg;base64,${photoDialog.data.second_wt_front_img}`)} />
                        ) : <div className="h-20 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-[10px]">No Photo</div>}
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 mb-0.5 font-medium">Side View</p>
                        {photoDialog.data.second_wt_side_img ? (
                          <img src={`data:image/jpeg;base64,${photoDialog.data.second_wt_side_img}`} alt="2nd Wt Side" className="w-full rounded border border-gray-200 object-cover cursor-pointer hover:opacity-80 transition" style={{ maxHeight: 180 }} onClick={() => setZoomImg(`data:image/jpeg;base64,${photoDialog.data.second_wt_side_img}`)} />
                        ) : <div className="h-20 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-[10px]">No Photo</div>}
                      </div>
                    </div>
                  </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      {/* Photo Zoom Dialog */}
      {zoomImg && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center cursor-pointer" onClick={() => setZoomImg(null)} data-testid="photo-zoom-overlay">
          <img src={zoomImg} alt="Zoomed" className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl object-contain" />
          <button className="absolute top-4 right-4 text-white bg-black/50 rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/80 text-lg font-bold" onClick={() => setZoomImg(null)} data-testid="photo-zoom-close">&times;</button>
        </div>
      )}

    </div>
  );
}
