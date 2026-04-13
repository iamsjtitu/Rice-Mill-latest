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
import { fmtDate } from "../utils/date";
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

import { safePrintHTML } from "../utils/print";
import logger from "../utils/logger";

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleNext = useCallback(() => {}, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { weight, stable, running: connected, connected, scheduleNext };
}

/* ─── LAN Scale (Poll weight from desktop API over network) ─── */
function useLanScale() {
  const [weight, setWeight] = useState(0);
  const [stable, setStable] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const r = await fetch(`${API}/weighbridge/live-weight`);
        if (r.ok && active) {
          const d = await r.json();
          setWeight(d.weight || 0);
          setStable(d.stable || false);
          setConnected(d.connected || false);
        }
      } catch (e) { if (active) setConnected(false); }
    };
    poll();
    const iv = setInterval(poll, 500);
    return () => { active = false; clearInterval(iv); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleNext = useCallback(() => {}, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { weight, stable, running: connected, connected, scheduleNext };
}

/* ─── Simulator Scale (Cloud/Web Demo) ─── */
function useSimulatorScale(active = true) {
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleNext = useCallback(() => {
    if (autoRef.current) clearTimeout(autoRef.current);
    autoRef.current = setTimeout(() => startMeasure(), 3000 + Math.random() * 4000);
  }, [startMeasure]);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => startMeasure(), 1500);
    return () => { clearTimeout(t); if (ref.current) clearInterval(ref.current); if (autoRef.current) clearTimeout(autoRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { weight, stable, running, scheduleNext, startMeasure };
}

/* ─── Auto-select: Real scale in Electron, LAN poll over network, Simulator in Web ─── */
function useLiveScale() {
  const isElectronApp = _isElectron && window.electronAPI?.serialGetStatus;
  const isLanBrowser = _isElectron && !window.electronAPI;
  const real = useRealScale();
  const lan = useLanScale();
  const sim = useSimulatorScale(!isElectronApp && !isLanBrowser);
  if (isElectronApp) return real;
  if (isLanBrowser) return lan;
  return sim;
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


  const applyCameraConfig = (cfg) => {
    const type = cfg.type || "usb";
    setCamType(type);
    if (type === "ip") {
      const url = camKey === "front" ? (cfg.frontUrl || "") : (cfg.sideUrl || "");
      setCamUrl(url);
    } else if (type === "vigi") {
      const frontIp = cfg.vigiFrontIp || '';
      const sideIp = cfg.vigiSideIp || '';
      const ch = camKey === "front" ? (cfg.vigiFrontChannel || "") : (cfg.vigiSideChannel || "");
      const deviceIp = camKey === "front" ? (frontIp || cfg.vigiIp) : (sideIp || cfg.vigiIp);
      const channel = (camKey === "front" && frontIp) ? '1' : (camKey === "side" && sideIp) ? '1' : ch;
      if (deviceIp && channel) {
        const params = new URLSearchParams({ channel, fps: '3', nvr_ip: deviceIp, username: cfg.vigiUser || 'admin', password: cfg.vigiPass || '', openapi_port: cfg.vigiOpenApiPort || '' });
        setCamUrl(`${API}/vigi-stream?${params.toString()}`);
      }
    }
  };

  // Load camera config — from backend first, then localStorage fallback
  useEffect(() => {
    const loadCameraConfig = async () => {
      let cfg = {};
      let fromBackend = false;
      try {
        const res = await axios.get(`${API}/settings/camera-config`);
        if (res.data && Object.keys(res.data).length > 0) { cfg = res.data; fromBackend = true; }
      } catch (e) { /* fallback */ }
      if (!fromBackend) {
        try { cfg = JSON.parse(localStorage.getItem('camera_config') || '{}'); } catch (e) { cfg = {}; }
        // Auto-migrate to backend
        if (cfg && Object.keys(cfg).length > 0) { axios.put(`${API}/settings/camera-config`, cfg).catch(() => {}); }
      }
      applyCameraConfig(cfg);
    };
    loadCameraConfig();

    const handleConfigChange = async () => {
      let cfg = {};
      try {
        const res = await axios.get(`${API}/settings/camera-config`);
        if (res.data && Object.keys(res.data).length > 0) cfg = res.data;
      } catch (e) { /* fallback */ }
      if (!cfg || Object.keys(cfg).length === 0) {
        try { cfg = JSON.parse(localStorage.getItem('camera_config') || '{}'); } catch (e) { cfg = {}; }
      }
      applyCameraConfig(cfg);
    };
    window.addEventListener('camera-config-changed', handleConfigChange);
    return () => window.removeEventListener('camera-config-changed', handleConfigChange);
  }, [camKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get display URL - use proxy for RTSP, direct for VIGI
  const getStreamUrl = useCallback((url) => {
    if (!url) return "";
    // VIGI stream URLs are already API URLs
    if (url.includes('/api/vigi-stream')) return url;
    if (url.toLowerCase().startsWith("rtsp://")) {
      return `${API}/camera-stream?url=${encodeURIComponent(url)}`;
    }
    return url;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getSnapshotUrl = useCallback((url) => {
    if (!url) return "";
    // VIGI stream - use vigi-snapshot endpoint with same params
    if (url.includes('/api/vigi-stream')) {
      const u = new URL(url, 'http://localhost');
      const ch = u.searchParams.get('channel');
      const nvrIp = u.searchParams.get('nvr_ip') || '';
      const user = u.searchParams.get('username') || '';
      const pass = u.searchParams.get('password') || '';
      const params = new URLSearchParams({ channel: ch });
      if (nvrIp) params.set('nvr_ip', nvrIp);
      if (user) params.set('username', user);
      if (pass) params.set('password', pass);
      return `${API}/vigi-snapshot?${params.toString()}`;
    }
    if (url.toLowerCase().startsWith("rtsp://")) {
      return `${API}/camera-snapshot?url=${encodeURIComponent(url)}`;
    }
    return url;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose captureFrame method to parent via ref
  useImperativeHandle(ref, () => ({
    captureFrame: async () => {
      if (!active) return null;

      // VIGI mode: fetch snapshot directly from API (no CORS issues)
      if (camType === "vigi" && camUrl.includes('/api/vigi-stream')) {
        try {
          const u = new URL(camUrl, 'http://localhost');
          const ch = u.searchParams.get('channel');
          const nvrIp = u.searchParams.get('nvr_ip') || '';
          const user = u.searchParams.get('username') || '';
          const pass = u.searchParams.get('password') || '';
          const params = new URLSearchParams({ channel: ch });
          if (nvrIp) params.set('nvr_ip', nvrIp);
          if (user) params.set('username', user);
          if (pass) params.set('password', pass);
          const resp = await fetch(`${API}/vigi-snapshot?${params.toString()}`);
          if (resp.ok) {
            const blob = await resp.blob();
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result.split(",")[1]);
              reader.readAsDataURL(blob);
            });
          }
        } catch (e) { logger.error(e); }
        return null;
      }

      if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      if ((camType === "ip" || camType === "vigi") && imgRef.current) {
        const img = imgRef.current;
        canvas.width = img.naturalWidth || 1920;
        canvas.height = img.naturalHeight || 1080;
        try { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); }
        catch { return null; }
      } else if (videoRef.current) {
        const video = videoRef.current;
        canvas.width = video.videoWidth || 1920;
        canvas.height = video.videoHeight || 1080;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } else { return null; }

      // Async blob conversion - UI thread block nahi hoga
      const base64 = await new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) { resolve(null); return; }
          const reader = new FileReader();
          reader.onloadend = () => {
            // Canvas memory free karo capture ke baad
            canvas.width = 1;
            canvas.height = 1;
            resolve(reader.result.split(",")[1]);
          };
          reader.readAsDataURL(blob);
        }, "image/jpeg", 0.85);
      });
      return base64;
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
      if (camType === "ip" || camType === "vigi") {
        if (!camUrl) { toast.error("Camera URL set nahi hai. Settings > Camera Setup mai configure karein"); return; }
        setImgError(false);
        setActive(true);
      } else {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 15, max: 30 } } });
          streamRef.current = s;
          if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); }
          setActive(true);
        } catch (e) { logger.error(e); toast.error("Camera access nahi mila"); }
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
    const handler = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setZoomed(false); } };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [zoomed]);

  useEffect(() => () => {
    // CRITICAL CLEANUP: Kill ALL camera resources on unmount to prevent crash
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach(t => t.stop()); } catch (e) { logger.error(e); }
      streamRef.current = null;
    }
    // Immediately disconnect MJPEG streams (kills ffmpeg on server)
    if (imgRef.current) { imgRef.current.src = ""; imgRef.current.removeAttribute('src'); }
    if (zoomImgRef.current) { zoomImgRef.current.src = ""; zoomImgRef.current.removeAttribute('src'); }
    // Force kill any lingering ffmpeg processes on server
    try { axios.get(`${API}/camera-kill-all`).catch(() => {}); } catch (e) { logger.error(e); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const renderFeed = (imgRefToUse, vidRefToUse, cssClass) => {
    if (camType === "ip" || camType === "vigi") {
      return imgError ? (
        <div className={`${cssClass} flex items-center justify-center bg-red-900/30`}>
          <p className="text-red-400 text-[9px] text-center px-2">{camType === "vigi" ? "NVR" : "IP Camera"} connect nahi ho paya.<br/>{camType === "vigi" ? "NVR settings check karein." : "URL check karein."}</p>
        </div>
      ) : (
        <img ref={imgRefToUse} src={displayUrl} alt={label} className={`${cssClass} object-cover`}
          crossOrigin="anonymous" decoding="async"
          onError={() => setImgError(true)}
          onLoad={() => setImgError(false)}
        />
      );
    }
    return <video ref={vidRefToUse} className={`${cssClass} object-cover`} autoPlay muted playsInline />;
  };

  return (
    <>
      <div className="relative rounded-lg overflow-hidden border border-slate-600 bg-gray-900 cursor-pointer" data-testid="camera-feed-panel"
        onClick={() => { if (active) setZoomed(true); }}>
        <div className="absolute top-1 left-1 z-10 flex items-center gap-1">
          <Badge className={`text-[8px] px-1 py-0 ${active ? 'bg-green-600' : 'bg-gray-600'}`}>
            {active ? <Camera className="w-2.5 h-2.5 mr-0.5" /> : <CameraOff className="w-2.5 h-2.5 mr-0.5" />}
            {active ? 'LIVE' : 'OFF'}
          </Badge>
          {camType === "ip" && <Badge className="text-[7px] px-1 py-0 bg-blue-700">IP</Badge>}
          {camType === "vigi" && <Badge className="text-[7px] px-1 py-0 bg-green-700">NVR</Badge>}
        </div>
        <button onClick={(e) => { e.stopPropagation(); toggle(); }} className="absolute top-1 right-1 z-10 bg-black/60 rounded px-1.5 py-0.5 text-[8px] text-white hover:bg-black/80" data-testid="camera-toggle-btn">
          {active ? 'Stop' : 'Start'}
        </button>
        {active && <div className="absolute bottom-1 right-1 z-10 bg-black/50 rounded px-1 py-0.5 text-[7px] text-white/70">Click to zoom</div>}
        <div className={compact ? "h-[88px]" : "h-[140px]"}>
          {active ? (
            renderFeed(imgRef, videoRef, "w-full h-full")
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-900 cursor-pointer" onClick={(e) => { e.stopPropagation(); toggle(); }}>
              <div className="text-center">
                {(camType === "ip" || camType === "vigi") ? <Wifi className="w-5 h-5 text-blue-500 mx-auto" /> : <Camera className="w-5 h-5 text-slate-400 mx-auto" />}
                <p className="text-slate-500 text-[8px] mt-1 font-semibold">{label || "Camera"}</p>
                <p className="text-green-500 text-[9px] mt-1 font-bold">Click to Start</p>
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
                {camType === "vigi" && <Badge className="bg-green-700 text-[9px]">NVR</Badge>}
              </span>
              <button onClick={() => setZoomed(false)} className="text-slate-500 hover:text-white text-xs bg-gray-800 rounded px-2 py-1">
                ESC
              </button>
            </div>
            {(camType === "ip" || camType === "vigi") ? (
              <img ref={zoomImgRef} src={displayUrl} alt={label} className="w-full aspect-video object-contain bg-black" crossOrigin="anonymous" decoding="async" />
            ) : (
              <video ref={zoomVideoRef} className="w-full aspect-video object-contain bg-black" autoPlay muted playsInline />
            )}
          </div>
        </div>
      )}
    </>
  );
});

export default function VehicleWeight({ filters, user, onVwChange }) {
  const blank = { date: new Date().toISOString().split("T")[0], vehicle_no: "", party_name: "", farmer_name: "", product: "GOVT PADDY", trans_type: "Receive(Purchase)", j_pkts: "", p_pkts: "", tot_pkts: "", first_wt: "", remark: "", cash_paid: "", diesel_paid: "", rst_no: "", g_issued: "", tp_no: "", tp_weight: "" };
  const [form, setForm] = useState(blank);
  const [rstEditable, setRstEditable] = useState(false);
  const [entries, setEntries] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nextRst, setNextRst] = useState(1);
  const [vwPage, setVwPage] = useState(1);
  const [vwTotalPages, setVwTotalPages] = useState(1);
  const [vwTotalCount, setVwTotalCount] = useState(0);
  const VW_PAGE_SIZE = 30;
  const [secondWtValue, setSecondWtValue] = useState("");
  const [secondWtMode, setSecondWtMode] = useState(null);
  const [showCompleted, setShowCompleted] = useState(true);
  const [autoNotify, setAutoNotify] = useState(false);
  const [editDialog, setEditDialog] = useState({ open: false, entry: null });
  const [editForm, setEditForm] = useState({});
  const [photoDialog, setPhotoDialog] = useState({ open: false, data: null, loading: false });
  const [linkedRst, setLinkedRst] = useState(new Set());
  const [zoomImg, setZoomImg] = useState(null); // for photo zoom
  const [tpWarning, setTpWarning] = useState("");
  const canManualWeight = user?.permissions?.can_manual_weight !== false && user?.role === 'admin' || user?.permissions?.can_manual_weight === true;
  const rstEditAllowed = user?.permissions?.can_edit_rst === true || (user?.role === 'admin' && user?.permissions?.can_edit_rst !== false);
  const canChangeDate = user?.permissions?.can_change_date === true || (user?.role === 'admin' && user?.permissions?.can_change_date !== false);
  const canEditVwLinked = user?.permissions?.can_edit_vw_linked === true || (user?.role === 'admin' && user?.permissions?.can_edit_vw_linked !== false);

  // ESC key to close photo zoom
  useEffect(() => {
    if (!zoomImg) return;
    const handler = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setZoomImg(null); } };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [zoomImg]);

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
    } catch (e) { logger.error(e); }
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
      setNextRst(nR.data.rst_no || 1);
      setLinkedRst(new Set(lR.data.linked_rst || []));
    } catch (e) { if (!ctrl.signal.aborted) toast.error("Data fetch error"); }
    if (!ctrl.signal.aborted) setLoading(false);
  }, [kms, vwPage, vwFilters]);
  useEffect(() => {
    const timer = setTimeout(() => fetchData(), 300);
    return () => { clearTimeout(timer); if (abortRef.current) abortRef.current.abort(); };
  }, [fetchData]);

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
      trans_type: entry.trans_type || "Receive(Purchase)",
      tot_pkts: entry.tot_pkts || "",
      j_pkts: entry.j_pkts || "",
      p_pkts: entry.p_pkts || "",
      first_wt: String(entry.first_wt || 0),
      remark: entry.remark || "",
      tp_no: entry.tp_no || "",
      tp_weight: entry.tp_weight ? String(entry.tp_weight) : "",
      cash_paid: entry.cash_paid ? String(entry.cash_paid) : "",
      diesel_paid: entry.diesel_paid ? String(entry.diesel_paid) : "",
      g_issued: entry.g_issued ? String(entry.g_issued) : "",
      rst_no: ""
    });
    setSecondWtValue("");
    toast.info(`RST #${entry.rst_no} loaded — Second Weight capture karein`);
  };
  const clearSecondWtMode = () => { setSecondWtMode(null); setForm(blank); setSecondWtValue(""); };

  const handleSaveSecondWt = async () => {
    if (!secondWtValue || Number(secondWtValue) <= 0) { toast.error("Second Weight daalen"); return; }
    const firstWtNum = Number(secondWtMode?.first_wt || 0);
    const secondWtNum = Number(secondWtValue);
    if (secondWtNum > firstWtNum) {
      toast.error(`2nd Weight (${secondWtNum} KG) pehle weight (${firstWtNum} KG) se zyada hai! Negative weight allowed nahi hai.`);
      return;
    }
    try {
      // Capture camera photos on second weight
      const frontImg = (await frontCamRef.current?.captureFrame?.()) || "";
      const sideImg = (await sideCamRef.current?.captureFrame?.()) || "";
      const r = await axios.put(`${API}/vehicle-weight/${secondWtMode.id}/second-weight`, {
        second_wt: secondWtValue,
        cash_paid: form.cash_paid || "0",
        diesel_paid: form.diesel_paid || "0",
        g_issued: form.g_issued || "0",
        tp_no: form.tp_no || "",
        tp_weight: form.tp_weight || "0",
        tot_pkts: form.tot_pkts || "0",
        second_wt_front_img: frontImg,
        second_wt_side_img: sideImg
      });
      if (r.data.success) {
        toast.success(r.data.message);
        sendAutoNotify(secondWtMode.id);
        clearSecondWtMode();
        fetchData();
        if (onVwChange) onVwChange();
      }
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  // TP Number duplicate check
  const checkTpDuplicate = (tpNo) => {
    if (!tpNo || !tpNo.toString().trim()) { setTpWarning(""); return false; }
    const tp = tpNo.toString().trim();
    const allEntries = [...entries, ...pending];
    const found = allEntries.find(e => e.tp_no && e.tp_no.toString().trim() === tp);
    if (found) {
      const msg = `TP No. ${tp} already RST #${found.rst_no} mein added hai!`;
      setTpWarning(msg);
      return true;
    }
    setTpWarning("");
    return false;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.vehicle_no) { toast.error("Vehicle No. daalen"); return; }
    if (!form.party_name?.trim()) { toast.error("Party Name daalen"); return; }
    if (!form.farmer_name?.trim()) { toast.error("Source / Mandi daalen"); return; }
    if (!form.first_wt || Number(form.first_wt) <= 0) { toast.error("First Weight daalen"); return; }
    if (form.tp_no && checkTpDuplicate(form.tp_no)) { toast.error(tpWarning || "Duplicate TP No."); return; }
    try {
      // Capture camera photos on first weight
      const frontImg = (await frontCamRef.current?.captureFrame?.()) || "";
      const sideImg = (await sideCamRef.current?.captureFrame?.()) || "";
      const payload = { ...form, kms_year: kms, first_wt_front_img: frontImg, first_wt_side_img: sideImg };
      if (!canChangeDate) payload.date = todayStr;
      if (form.rst_no && Number(form.rst_no) > 0) payload.rst_no = Number(form.rst_no);
      const r = await axios.post(`${API}/vehicle-weight`, payload);
      if (r.data.success) { toast.success(r.data.message); setForm({ ...blank, rst_no: "" }); setRstEditable(false); setTpWarning(""); fetchData(); if (onVwChange) onVwChange(); }
    } catch (e) { toast.error(e.response?.data?.detail || "Save error"); }
  };

  const handleDelete = async (id) => { if (!await showConfirm("Delete", "Kya aap ye VW entry delete karna chahte hain?\n\nNote: Isse linked Mill Entry + Cash/Diesel transactions bhi delete ho jayenge!")) return; try { const res = await axios.delete(`${API}/vehicle-weight/${id}`); toast.success(res.data?.message || "Deleted"); fetchData(); if (onVwChange) onVwChange(); } catch (err) { toast.error(err?.response?.data?.detail || "Error"); } };

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
      logger.error("Auto-notify error:", e);
    }
  };
  // Build complete weight text for messaging
  const buildWeightText = (e) => {
    let t = `*Weight Slip — RST #${e.rst_no}*\n`;
    t += `Date: ${fmtDate(e.date)}\n`;
    t += `Vehicle: ${e.vehicle_no}\n`;
    t += `Trans: ${e.trans_type || '-'}\n`;
    t += `Party: ${e.party_name || '-'}\n`;
    t += `Source/Mandi: ${e.farmer_name || '-'}\n`;
    t += `Product: ${e.product || '-'}\n`;
    t += `Bags: ${e.tot_pkts || '-'}\n`;
    t += `───────────────\n`;
    t += `Gross Wt: ${Number(e.gross_wt || e.first_wt || 0).toLocaleString()} KG\n`;
    t += `Tare Wt: ${Number(e.tare_wt || e.second_wt || 0).toLocaleString()} KG\n`;
    t += `*Net Wt: ${Number(e.net_wt || 0).toLocaleString()} KG*\n`;
    t += `───────────────\n`;
    const cash = Number(e.cash_paid || 0);
    const diesel = Number(e.diesel_paid || 0);
    const gIssued = Number(e.g_issued || 0);
    if (gIssued > 0) t += `G.Issued: ${gIssued.toLocaleString()}\n`;
    if (e.tp_no) t += `TP: ${e.tp_no}\n`;
    if (Number(e.tp_weight || 0) > 0) t += `TP Weight: ${Number(e.tp_weight)} Q\n`;
    if (e.remark) t += `Remark: ${e.remark}\n`;
    if (cash > 0) t += `Cash Paid: ₹${cash.toLocaleString()}\n`;
    if (diesel > 0) t += `Diesel Paid: ₹${diesel.toLocaleString()}\n`;
    if (gIssued > 0 || cash > 0 || diesel > 0) t += `───────────────\n`;
    return t;
  };

  const handlePdf = (e) => { const u = `${API}/vehicle-weight/${e.id}/slip-pdf?party_only=1`; _isElectron ? downloadFile(u, `Slip_${e.rst_no}.pdf`) : window.open(u, "_blank"); };

  const handleWA = async (e) => {
    try {
      const text = buildWeightText(e);
      const frontImg = (await frontCamRef.current?.captureFrame?.()) || "";
      const sideImg = (await sideCamRef.current?.captureFrame?.()) || "";
      await axios.post(`${API}/vehicle-weight/send-manual`, {
        entry_id: e.id, text, front_image: frontImg, side_image: sideImg,
        send_to_numbers: true, send_to_group: false
      });
      toast.success("WhatsApp sent!");
    } catch (e) { logger.error(e); toast.error("WA send error"); }
  };

  const handleGroup = async (e) => {
    try {
      const text = buildWeightText(e);
      const frontImg = (await frontCamRef.current?.captureFrame?.()) || "";
      const sideImg = (await sideCamRef.current?.captureFrame?.()) || "";
      await axios.post(`${API}/vehicle-weight/send-manual`, {
        entry_id: e.id, text, front_image: frontImg, side_image: sideImg,
        send_to_numbers: false, send_to_group: true
      });
      toast.success("Group msg sent!");
    } catch (e) { logger.error(e); toast.error("Group send error"); }
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
      diesel_paid: entry.diesel_paid || "",
      g_issued: entry.g_issued || "",
      tp_no: entry.tp_no || "",
      tp_weight: entry.tp_weight ? String(entry.tp_weight) : "",
      remark: entry.remark || ""
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
      const brandInfo = { company: br.data?.company_name || "NAVKAR AGRO", tagline: br.data?.tagline || "JOLKO, KESINGA - Mill Entry System", custom_fields: br.data?.custom_fields || [] };
      setPhotoDialog({ open: true, data: { ...r.data, _brand: brandInfo }, loading: false });
    } catch (e) {
      toast.error("Photos load nahi hue");
      setPhotoDialog({ open: false, data: null, loading: false });
    }
  };
  const saveEdit = async () => {
    try {
      const r = await axios.put(`${API}/vehicle-weight/${editDialog.entry.id}/edit`, editForm);
      if (r.data.success) { toast.success("Updated!"); setEditDialog({ open: false, entry: null }); fetchData(); }
    } catch (err) { toast.error(err?.response?.data?.detail || "Update error"); }
  };

  // ── Print A5 with 2 copies (Party Copy + Customer Copy) ──
  const handlePrint = async (e) => {
    // Fetch settings branding with custom fields
    let company = "NAVKAR AGRO", tagline = "JOLKO, KESINGA";
    let aboveFields = [], belowFields = [];
    try {
      const r = await axios.get(`${API}/branding`);
      if (r.data) {
        company = r.data.company_name || company;
        tagline = r.data.tagline || tagline;
        const cf = r.data.custom_fields || [];
        cf.forEach(f => {
          const val = (f.value || '').trim();
          if (!val) return;
          const lbl = (f.label || '').trim();
          const txt = lbl ? `<b>${lbl}:</b> ${val}` : val;
          if (f.placement === 'above') aboveFields.push(txt);
          else belowFields.push(txt);
        });
      }
    } catch (e) { logger.error(e); }

    const rst = e.rst_no;
    const gross = Number(e.gross_wt || e.first_wt || 0).toLocaleString();
    const tare = Number(e.tare_wt || e.second_wt || 0).toLocaleString();
    const net = Number(e.net_wt || 0).toLocaleString();
    const cash = Number(e.cash_paid || 0);
    const diesel = Number(e.diesel_paid || 0);

    const aboveHTML = aboveFields.length > 0 ? `<div class="custom-row above">${aboveFields.join(' &nbsp;|&nbsp; ')}</div>` : '';
    const belowHTML = belowFields.length > 0 ? `<div class="custom-row below">${belowFields.join(' &nbsp;|&nbsp; ')}</div>` : '';

    const copyHTML = (copyLabel, showSignature, isCustomerCopy = false) => `
      <div class="copy-block">
        <div class="copy-label">${copyLabel}</div>
        <div class="header">
          ${aboveHTML}
          <h1>${company}</h1>
          <p class="tagline">${tagline}</p>
          ${belowHTML}
          <div class="slip-title">WEIGHT SLIP / तौल पर्ची</div>
        </div>
        <table class="info-table">
          <tr><td class="lbl">RST No.</td><td class="val rst">#${rst}</td><td class="lbl">Date / दिनांक</td><td class="val">${fmtDate(e.date)}</td></tr>
          <tr><td class="lbl">Vehicle / गाड़ी</td><td class="val">${e.vehicle_no}</td><td class="lbl">Trans Type</td><td class="val">${e.trans_type || '-'}</td></tr>
          <tr><td class="lbl">Party / पार्टी</td><td class="val">${e.party_name || '-'}</td><td class="lbl">Source/Mandi</td><td class="val">${e.farmer_name || '-'}</td></tr>
          <tr><td class="lbl">Product / माल</td><td class="val">${e.product || '-'}</td><td class="lbl">Bags / बोरे</td><td class="val">${e.tot_pkts || '-'}</td></tr>
          ${!isCustomerCopy && Number(e.g_issued || 0) > 0 ? `<tr><td class="lbl">G.Issued</td><td class="val" style="color:#4338ca;font-weight:900">${Number(e.g_issued).toLocaleString()}</td><td class="lbl">TP No.</td><td class="val">${e.tp_no || '-'}</td></tr>` : (!isCustomerCopy && e.tp_no ? `<tr><td class="lbl">TP No.</td><td class="val">${e.tp_no}</td><td class="lbl"></td><td class="val"></td></tr>` : '')}
          ${!isCustomerCopy && Number(e.tp_weight || 0) > 0 ? `<tr><td class="lbl">TP Weight</td><td class="val">${Number(e.tp_weight)} Q</td><td class="lbl"></td><td class="val"></td></tr>` : ''}
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
      .custom-row { font-size: 8px; color: #555; margin: 2px 0; line-height: 1.4; }
      .custom-row.above { color: #8B0000; font-weight: 600; }
      .custom-row.below { color: #374151; }
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
      ${copyHTML("CUSTOMER COPY / ग्राहक प्रति", true, true)}
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
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Scale className="w-5 h-5 text-amber-600" /> Auto Vehicle Weight
          </h2>
          <Badge variant="outline" className={`text-[10px] h-5 ${scale.running || scale.connected ? 'border-green-500 text-green-700 bg-green-50' : 'border-gray-400 text-slate-400 bg-slate-700'}`}>
            <Wifi className="w-3 h-3 mr-1" />{_isElectron && window.electronAPI?.serialGetStatus ? (scale.connected ? 'COM Connected' : 'COM Disconnected') : (_isElectron && !window.electronAPI) ? (scale.connected ? 'LAN Scale' : 'LAN No Scale') : 'COM3 Demo'}
          </Badge>
        </div>
        <Button onClick={fetchData} variant="ghost" size="sm" className="h-7 text-slate-400 hover:text-slate-200 text-xs" data-testid="vw-refresh">
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />Refresh
        </Button>
      </div>

      {/* ─── 3-COLUMN LAYOUT ─── */}
      <div className="grid grid-cols-12 gap-3">

        {/* ═══ COL 1: Entry Form ═══ */}
        <div className="col-span-12 lg:col-span-4">
          <Card className="bg-slate-800 border-slate-600 shadow-sm">
            <CardHeader className="pb-2 pt-3 px-4 border-b border-slate-700 bg-slate-700/50">
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
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setRstEditable(false); } }}
                        placeholder={String(nextRst)} className="w-16 h-6 text-[10px] bg-slate-700 border-amber-500 text-amber-700 text-center px-1 font-mono"
                        data-testid="vw-rst-input" autoFocus />
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 font-mono font-bold" data-testid="vw-rst-badge">
                        RST #{form.rst_no || nextRst}
                      </span>
                    )}
                    {rstEditAllowed && (
                      <button onClick={() => { setRstEditable(!rstEditable); if (rstEditable && !form.rst_no) setForm(p => ({ ...p, rst_no: "" })); }}
                        className="text-slate-500 hover:text-amber-600 transition-colors" data-testid="vw-rst-edit-btn"
                        title={rstEditable ? "Auto RST" : "Edit RST"}>
                        {rstEditable ? <CheckCircle className="w-3 h-3 text-green-600" /> : <span className="text-[9px] text-slate-400 hover:text-amber-600">Edit</span>}
                      </button>
                    )}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-3">
              <form onSubmit={handleSubmit} className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-slate-400 text-[10px] mb-0.5 block">Date {(!canChangeDate || secondWtMode) && <span className="text-amber-400">(Locked)</span>}</Label>
                    <Input type="date" value={(!canChangeDate || secondWtMode) ? form.date : form.date} onChange={e => { if (canChangeDate && !secondWtMode) setForm(p => ({ ...p, date: e.target.value })); }}
                      disabled={!canChangeDate || !!secondWtMode}
                      className={`bg-slate-700 border-slate-500 text-white h-8 text-xs ${(!canChangeDate || secondWtMode) ? 'opacity-70 cursor-not-allowed' : ''}`} data-testid="vw-date" />
                  </div>
                  <div>
                    {secondWtMode ? (
                      <>
                        <Label className="text-slate-400 text-[10px] mb-0.5 block">Vehicle No *</Label>
                        <Input value={form.vehicle_no} disabled className="bg-slate-700 border-slate-500 text-slate-200 h-8 text-xs font-medium" data-testid="vw-vehicle" />
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
                        labelClassName="text-slate-400 text-[10px] mb-0.5 block"
                        inputClassName="bg-slate-700 border-slate-500 text-white h-8 text-xs font-medium"
                      />
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    {secondWtMode ? (
                      <>
                        <Label className="text-slate-400 text-[10px] mb-0.5 block">Party Name * <span className="text-amber-400">(Locked)</span></Label>
                        <Input value={form.party_name} disabled className="bg-slate-700 border-slate-500 text-slate-200 h-8 text-xs opacity-70 cursor-not-allowed" data-testid="vw-party" />
                      </>
                    ) : (
                    <AutoSuggest
                      value={form.party_name}
                      onChange={e => setForm(p => ({ ...p, party_name: e.target.value }))}
                      suggestions={partySuggestions}
                      placeholder="Party name"
                      onSelect={(val) => { setForm(p => ({ ...p, party_name: val })); fetchMandisForParty(val); }}
                      label="Party Name *"
                      testId="vw-party"
                      labelClassName="text-slate-400 text-[10px] mb-0.5 block"
                      inputClassName="bg-slate-700 border-slate-500 text-white h-8 text-xs"
                    />
                    )}
                  </div>
                  <div>
                    {secondWtMode ? (
                      <>
                        <Label className="text-slate-400 text-[10px] mb-0.5 block">Source * <span className="text-amber-400">(Locked)</span></Label>
                        <Input value={form.farmer_name} disabled className="bg-slate-700 border-slate-500 text-slate-200 h-8 text-xs opacity-70 cursor-not-allowed" data-testid="vw-farmer" />
                      </>
                    ) : (
                    <AutoSuggest
                      value={form.farmer_name}
                      onChange={e => setForm(p => ({ ...p, farmer_name: e.target.value }))}
                      suggestions={mandiSuggestions}
                      placeholder="Source"
                      onSelect={(val) => setForm(p => ({ ...p, farmer_name: val }))}
                      label="Source *"
                      testId="vw-farmer"
                      labelClassName="text-slate-400 text-[10px] mb-0.5 block"
                      inputClassName="bg-slate-700 border-slate-500 text-white h-8 text-xs"
                    />
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-slate-400 text-[10px] mb-0.5 block">Product {secondWtMode && <span className="text-amber-400">(Locked)</span>}</Label>
                    {secondWtMode ? (
                      <Input value={form.product} disabled className="bg-slate-700 border-slate-500 text-slate-200 h-8 text-xs opacity-70 cursor-not-allowed" />
                    ) : (
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
                      <SelectTrigger className="bg-slate-700 border-slate-500 text-white h-8 text-xs" data-testid="vw-product"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["GOVT PADDY","PADDY","RICE","BHUSI","KANDA","OTHER"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    )}
                  </div>
                  <div>
                    <Label className="text-slate-400 text-[10px] mb-0.5 block">Trans Type {secondWtMode && <span className="text-amber-400">(Locked)</span>}</Label>
                    {secondWtMode ? (
                      <Input value={form.trans_type} disabled className="bg-slate-700 border-slate-500 text-slate-200 h-8 text-xs opacity-70 cursor-not-allowed" />
                    ) : (
                    <Select value={form.trans_type} onValueChange={v => setForm(p => ({ ...p, trans_type: v }))}>
                      <SelectTrigger className="bg-slate-700 border-slate-500 text-white h-8 text-xs" data-testid="vw-trans"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Receive(Purchase)">Receive(Purchase)</SelectItem>
                        <SelectItem value="Dispatch(Sale)">Dispatch(Sale)</SelectItem>
                      </SelectContent>
                    </Select>
                    )}
                  </div>
                  <div>
                    <Label className="text-slate-400 text-[10px] mb-0.5 block">Bags</Label>
                    <Input type="number" value={form.tot_pkts} onChange={e => setForm(p => ({ ...p, tot_pkts: e.target.value }))}
                      placeholder="0" className="bg-slate-700 border-slate-500 text-white h-8 text-xs" data-testid="vw-bags" />
                  </div>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  <div>
                    <Label className="text-slate-400 text-[10px] mb-0.5 block">TP No.</Label>
                    <Input value={form.tp_no} onChange={e => { setForm(p => ({ ...p, tp_no: e.target.value })); checkTpDuplicate(e.target.value); }}
                      placeholder="Optional" className={`bg-slate-700 border-slate-500 text-white h-8 text-xs ${tpWarning ? 'border-red-500 ring-1 ring-red-500' : ''}`} data-testid="vw-tp-no" />
                    {tpWarning && <p className="text-red-400 text-[9px] mt-0.5">{tpWarning}</p>}
                  </div>
                  <div>
                    <Label className="text-slate-400 text-[10px] mb-0.5 block">TP Weight</Label>
                    <Input type="number" value={form.tp_weight} onChange={e => setForm(p => ({ ...p, tp_weight: e.target.value }))}
                      placeholder="QNTL" className="bg-slate-700 border-slate-500 text-white h-8 text-xs" data-testid="vw-tp-weight" />
                  </div>
                  <div>
                    <Label className="text-slate-400 text-[10px] mb-0.5 block">Remark</Label>
                    <Input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))}
                      placeholder="Optional" className="bg-slate-700 border-slate-500 text-white h-8 text-xs" data-testid="vw-remark" />
                  </div>
                  <div>
                    <Label className="text-slate-400 text-[10px] mb-0.5 block">G.Issued</Label>
                    <Input type="number" value={form.g_issued} onChange={e => setForm(p => ({ ...p, g_issued: e.target.value }))}
                      placeholder="0" className="bg-slate-700 border-slate-500 text-white h-8 text-xs" data-testid="vw-g-issued" />
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
                          <Input type="number" value={secondWtValue} onChange={e => { if (canManualWeight) setSecondWtValue(e.target.value); }}
                            placeholder="0" className={`bg-slate-700 border-green-500 text-green-800 h-10 text-xl font-mono font-bold text-center flex-1 focus-visible:ring-green-500/30 ${!canManualWeight ? 'cursor-not-allowed opacity-70' : ''}`}
                            readOnly={!canManualWeight}
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
                        <span className="text-[10px] text-slate-400">Net Weight: </span>
                        <span className="text-green-700 text-xl font-bold font-mono">{Math.abs(Number(form.first_wt) - Number(secondWtValue)).toLocaleString()} KG</span>
                      </div>
                    )}
                    <div className="flex gap-2 mt-3">
                      <Button type="button" onClick={handleSaveSecondWt} className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold h-9 text-xs" data-testid="save-btn">
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Save Second Weight
                      </Button>
                      <Button type="button" onClick={clearSecondWtMode} variant="outline" className="border-slate-600 text-slate-400 h-9 text-xs px-3 hover:bg-slate-700">Cancel</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 mt-3">
                      <Label className="text-amber-700 text-xs font-bold mb-1.5 block">First Weight (KG) *</Label>
                      <div className="flex gap-2 items-center">
                        <Input type="number" value={form.first_wt} onChange={e => { if (canManualWeight) setForm(p => ({ ...p, first_wt: e.target.value })); }}
                          placeholder="0" className={`bg-slate-700 border-amber-500 text-amber-800 h-10 text-xl font-mono font-bold text-center flex-1 focus-visible:ring-amber-500/30 ${!canManualWeight ? 'cursor-not-allowed opacity-70' : ''}`}
                          readOnly={!canManualWeight}
                          data-testid="vw-first-wt" />
                        {scale.stable && (
                          <Button type="button" onClick={capFirst} className="bg-green-600 hover:bg-green-500 h-10 px-3 shrink-0" data-testid="vw-capture-first">
                            <Zap className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold h-9 text-xs" data-testid="save-btn">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Save First Weight
                      </Button>
                      <Button type="button" onClick={() => setForm(blank)} variant="outline" className="border-slate-600 text-slate-400 h-9 text-xs px-3 hover:bg-slate-700">Clear</Button>
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
          <Card className="bg-gradient-to-b from-gray-900 to-black border-slate-600 shadow overflow-hidden">
            <div className="bg-gray-800 px-3 py-1.5 flex items-center justify-between border-b border-gray-700">
              <span className="text-slate-500 text-[10px] font-medium flex items-center gap-1"><Scale className="w-3 h-3" /> WEIGHBRIDGE</span>
              <span className="text-green-400 text-[10px] flex items-center gap-0.5 font-medium">
                <Wifi className="w-3 h-3" /> COM3
              </span>
            </div>
            <div className="p-4 text-center relative">
              <div className={`font-mono text-5xl font-black tracking-wider transition-all duration-200 ${
                scale.stable ? 'text-green-400 drop-shadow-[0_0_20px_rgba(74,222,128,0.4)]'
                : scale.running ? 'text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                : 'text-slate-300'
              }`} data-testid="live-weight-display">
                {scale.weight > 0 ? scale.weight.toLocaleString() : '00,000'}
              </div>
              <div className="text-slate-400 text-[10px] mt-0.5 font-mono tracking-widest">KILOGRAM</div>
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
          <Card className="bg-slate-800 border-slate-600 shadow-sm h-full">
            <CardHeader className="pb-2 pt-3 px-4 border-b border-slate-700 bg-yellow-50/50">
              <CardTitle className="text-xs font-bold flex items-center justify-between">
                <span className="text-yellow-700 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Pending Vehicle List
                </span>
                <Badge className={`text-[10px] ${pending.length > 0 ? 'bg-red-100 text-red-700 border-red-400 animate-pulse' : 'bg-yellow-100 text-yellow-700 border-yellow-300'}`}>{pending.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0" data-testid="vw-pending-card">
              <div className="overflow-auto max-h-[420px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700 bg-slate-700">
                      <TableHead className="text-slate-400 text-[10px] py-2 px-2 font-semibold">RST</TableHead>
                      <TableHead className="text-slate-400 text-[10px] py-2 px-2 font-semibold">Vehicle</TableHead>
                      <TableHead className="text-slate-400 text-[10px] py-2 px-2 font-semibold text-right">1st Wt</TableHead>
                      <TableHead className="text-slate-400 text-[10px] py-2 px-2 font-semibold">Party</TableHead>
                      <TableHead className="text-slate-400 text-[10px] py-2 px-2 font-semibold text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12">
                          <Truck className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-slate-500 text-xs">Koi pending vehicle nahi</p>
                        </TableCell>
                      </TableRow>
                    ) : pending.map((p, i) => (
                      <TableRow key={p.id} className={`border-slate-700 hover:bg-yellow-50/50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-700/50'}`} data-testid={`vw-pending-row-${p.id}`}>
                        <TableCell className="py-2 px-2">
                          <span className="text-amber-700 font-bold text-xs bg-amber-100 px-1.5 py-0.5 rounded">#{p.rst_no}</span>
                        </TableCell>
                        <TableCell className="text-slate-100 text-xs py-2 px-2 font-medium">{p.vehicle_no}</TableCell>
                        <TableCell className="text-blue-700 text-xs py-2 px-2 text-right font-mono font-medium">{fmtWt(p.first_wt)}</TableCell>
                        <TableCell className="text-slate-400 text-xs py-2 px-2 truncate max-w-[80px]">{p.party_name || '-'}</TableCell>
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
      <Card className="bg-slate-800 border-slate-600 shadow-sm">
        <CardHeader className="pb-2 pt-3 px-4 bg-slate-700/50">
          <CardTitle className="text-xs flex items-center justify-between">
            <span className="text-slate-300 flex items-center gap-1.5 cursor-pointer" onClick={() => setShowCompleted(!showCompleted)}>
              <CheckCircle className="w-3.5 h-3.5 text-green-600" /> Completed Entries
              <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px] ml-1">{vwTotalCount}</Badge>
            </span>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] text-slate-400 border-slate-600" onClick={() => setShowVwFilters(!showVwFilters)} data-testid="vw-filter-toggle">
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
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-slate-400 hover:text-slate-200" data-testid="vw-toggle-completed" onClick={() => setShowCompleted(!showCompleted)}>
                {showCompleted ? <><EyeOff className="w-3 h-3 mr-1" />Hide</> : <><Eye className="w-3 h-3 mr-1" />Show</>}
              </Button>
            </div>
          </CardTitle>
          {/* ── Filter Bar ── */}
          {showVwFilters && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mt-2 pb-1" data-testid="vw-filter-bar">
              <div>
                <label className="text-[9px] text-slate-400 font-medium">Date From</label>
                <Input type="date" className="h-7 text-xs" value={vwFilters.date_from} onChange={e => { setVwFilters(p => ({ ...p, date_from: e.target.value })); setVwPage(1); }} data-testid="vw-filter-date-from" />
              </div>
              <div>
                <label className="text-[9px] text-slate-400 font-medium">Date To</label>
                <Input type="date" className="h-7 text-xs" value={vwFilters.date_to} onChange={e => { setVwFilters(p => ({ ...p, date_to: e.target.value })); setVwPage(1); }} data-testid="vw-filter-date-to" />
              </div>
              <div>
                <label className="text-[9px] text-slate-400 font-medium">RST No</label>
                <Input type="text" placeholder="RST..." className="h-7 text-xs" value={vwFilters.rst_no} onChange={e => { setVwFilters(p => ({ ...p, rst_no: e.target.value })); setVwPage(1); }} data-testid="vw-filter-rst" />
              </div>
              <div>
                <label className="text-[9px] text-slate-400 font-medium">Vehicle</label>
                <Input type="text" placeholder="Vehicle..." className="h-7 text-xs" value={vwFilters.vehicle_no} onChange={e => { setVwFilters(p => ({ ...p, vehicle_no: e.target.value })); setVwPage(1); }} data-testid="vw-filter-vehicle" />
              </div>
              <div>
                <label className="text-[9px] text-slate-400 font-medium">Party</label>
                <Input type="text" placeholder="Party..." className="h-7 text-xs" value={vwFilters.party_name} onChange={e => { setVwFilters(p => ({ ...p, party_name: e.target.value })); setVwPage(1); }} data-testid="vw-filter-party" />
              </div>
              <div>
                <label className="text-[9px] text-slate-400 font-medium">Mandi</label>
                <div className="flex gap-1">
                  <Input type="text" placeholder="Mandi..." className="h-7 text-xs" value={vwFilters.farmer_name} onChange={e => { setVwFilters(p => ({ ...p, farmer_name: e.target.value })); setVwPage(1); }} data-testid="vw-filter-mandi" />
                  <Button variant="ghost" size="sm" className="h-7 px-1.5 text-[10px] text-slate-500 hover:text-red-600" data-testid="vw-filter-clear"
                    onClick={() => { setVwFilters({ date_from: todayStr, date_to: todayStr, vehicle_no: "", party_name: "", farmer_name: "", rst_no: "" }); setVwPage(1); }}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardHeader>
        {showCompleted && (
          <CardContent className="p-0 border-t border-slate-700">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 bg-slate-700">
                    <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold">RST</TableHead>
                    <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold">Date</TableHead>
                    <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold">Vehicle</TableHead>
                    <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold">Party</TableHead>
                    <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold">Source</TableHead>
                    <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold">Product</TableHead>
                    <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold">Bags</TableHead>
                    <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold text-right">1st Wt</TableHead>
                    <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold text-right">2nd Wt</TableHead>
                    <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold text-right">Net Wt</TableHead>
                    <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold text-right">G.Issued</TableHead>
                    <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold">TP No.</TableHead>
                    <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold text-right">TP Wt</TableHead>
                    <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold text-right">Cash</TableHead>
                    <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold text-right">Diesel</TableHead>
                    <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow><TableCell colSpan={16} className="text-center text-slate-500 py-8 text-xs" data-testid="vw-no-entries-today">
                      {vwFilters.date_from === todayStr && vwFilters.date_to === todayStr
                        ? "Aaj ki koi Vehicle Weight entry nahi hai"
                        : "Koi entry nahi mili - Filter change karke dekhein"}
                    </TableCell></TableRow>
                  ) : entries.map((e, i) => (
                    <TableRow key={e.id} className={`border-slate-700 hover:bg-slate-700 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-700/50'}`}>
                      <TableCell className="py-2 px-3"><span className="text-amber-700 font-bold text-xs">#{e.rst_no}</span></TableCell>
                      <TableCell className="text-slate-400 text-[11px] py-2 px-3">{fmtDate(e.date)}</TableCell>
                      <TableCell className="text-slate-100 text-xs py-2 px-3 font-medium">{e.vehicle_no}</TableCell>
                      <TableCell className="text-slate-300 text-xs py-2 px-3">{e.party_name}</TableCell>
                      <TableCell className="text-slate-400 text-xs py-2 px-3">{e.farmer_name || '-'}</TableCell>
                      <TableCell className="py-2 px-3"><Badge variant="outline" className="text-[9px] border-slate-600 text-slate-400 font-normal">{e.product}</Badge></TableCell>
                      <TableCell className="text-slate-400 text-xs py-2 px-3">{e.tot_pkts || '-'}</TableCell>
                      <TableCell className="text-blue-700 text-xs py-2 px-3 text-right font-mono">{fmtWt(e.first_wt)}</TableCell>
                      <TableCell className="text-blue-700 text-xs py-2 px-3 text-right font-mono">{fmtWt(e.second_wt)}</TableCell>
                      <TableCell className="text-right py-2 px-3"><span className="text-green-700 font-bold text-sm font-mono">{fmtWt(e.net_wt)}</span></TableCell>
                      <TableCell className="text-right text-indigo-700 text-xs py-2 px-3 font-mono">{e.g_issued ? fmtWt(e.g_issued) : '-'}</TableCell>
                      <TableCell className="text-slate-400 text-xs py-2 px-3">{e.tp_no || '-'}</TableCell>
                      <TableCell className="text-right text-xs py-2 px-3 font-mono">
                        {Number(e.tp_weight || 0) > 0 ? (
                          <span className="text-slate-400">
                            {Number(e.tp_weight)}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right text-green-700 text-xs py-2 px-3 font-mono">{e.cash_paid ? fmtWt(e.cash_paid) : '-'}</TableCell>
                      <TableCell className="text-right text-orange-700 text-xs py-2 px-3 font-mono">{e.diesel_paid ? fmtWt(e.diesel_paid) : '-'}</TableCell>
                      <TableCell className="py-2 px-3">
                        <div className="flex items-center gap-0.5 justify-center">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-500 hover:text-cyan-600" onClick={() => openPhotos(e)} data-testid={`vw-photos-${e.id}`} title="View Photos"><Eye className="w-3 h-3" /></Button>
                          {(!linkedRst.has(e.rst_no) || canEditVwLinked) && (
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-500 hover:text-amber-600" onClick={() => openEdit(e)} data-testid={`vw-edit-${e.id}`} title="Edit"><Pencil className="w-3 h-3" /></Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-500 hover:text-purple-600" onClick={() => handlePrint(e)} data-testid={`vw-print-${e.id}`} title="Print"><Printer className="w-3 h-3" /></Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-500 hover:text-blue-600" onClick={() => handlePdf(e)} data-testid={`vw-pdf-${e.id}`} title="Download"><Download className="w-3 h-3" /></Button>
                          {wa && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-green-400 hover:text-green-600" onClick={() => handleWA(e)} data-testid={`vw-wa-${e.id}`} title="WhatsApp"><Send className="w-3 h-3" /></Button>}
                          {wa && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-teal-400 hover:text-teal-600" onClick={() => handleGroup(e)} data-testid={`vw-group-${e.id}`} title="Group"><Users className="w-3 h-3" /></Button>}
                          {linkedRst.has(e.rst_no) && !canEditVwLinked ? (
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
        <DialogContent className="bg-slate-800 border-slate-600 max-w-md" data-testid="vw-edit-dialog">
          <DialogHeader>
            <DialogTitle className="text-amber-700 flex items-center gap-2">
              <Pencil className="w-4 h-4" /> Edit RST #{editDialog.entry?.rst_no}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <AutoSuggest
                  value={editForm.vehicle_no || ""}
                  onChange={e => setEditForm(p => ({ ...p, vehicle_no: e.target.value.toUpperCase() }))}
                  suggestions={truckSuggestions}
                  placeholder="Vehicle No"
                  onSelect={(val) => setEditForm(p => ({ ...p, vehicle_no: val.toUpperCase() }))}
                  label="Vehicle No"
                  testId="edit-vehicle"
                  labelClassName="text-slate-400 text-xs mb-1 block"
                  inputClassName="h-9 text-sm border-slate-600"
                />
              </div>
              <div>
                <Label className="text-slate-400 text-xs mb-1 block">Product</Label>
                <Select value={editForm.product || ""} onValueChange={v => setEditForm(p => ({ ...p, product: v }))}>
                  <SelectTrigger className="h-9 text-sm border-slate-600" data-testid="edit-product"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["GOVT PADDY","PADDY","RICE","BHUSI","KANDA","OTHER"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <AutoSuggest
                  value={editForm.party_name || ""}
                  onChange={e => setEditForm(p => ({ ...p, party_name: e.target.value }))}
                  suggestions={partySuggestions}
                  placeholder="Party Name"
                  onSelect={(val) => setEditForm(p => ({ ...p, party_name: val }))}
                  label="Party Name"
                  testId="edit-party"
                  labelClassName="text-slate-400 text-xs mb-1 block"
                  inputClassName="h-9 text-sm border-slate-600"
                />
              </div>
              <div>
                <AutoSuggest
                  value={editForm.farmer_name || ""}
                  onChange={e => setEditForm(p => ({ ...p, farmer_name: e.target.value }))}
                  suggestions={mandiSuggestions}
                  placeholder="Source"
                  onSelect={(val) => setEditForm(p => ({ ...p, farmer_name: val }))}
                  label="Source"
                  testId="edit-farmer"
                  labelClassName="text-slate-400 text-xs mb-1 block"
                  inputClassName="h-9 text-sm border-slate-600"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <Label className="text-slate-400 text-xs mb-1 block">Bags</Label>
                <Input type="number" value={editForm.tot_pkts || ""} onChange={e => setEditForm(p => ({ ...p, tot_pkts: e.target.value }))}
                  className="h-9 text-sm border-slate-600" data-testid="edit-bags" />
              </div>
              <div>
                <Label className="text-slate-400 text-xs mb-1 block">G.Issued</Label>
                <Input type="number" value={editForm.g_issued || ""} onChange={e => setEditForm(p => ({ ...p, g_issued: e.target.value }))}
                  className="h-9 text-sm border-slate-600" data-testid="edit-g-issued" />
              </div>
              <div>
                <Label className="text-slate-400 text-xs mb-1 block">TP No.</Label>
                <Input value={editForm.tp_no || ""} onChange={e => setEditForm(p => ({ ...p, tp_no: e.target.value }))}
                  className="h-9 text-sm border-slate-600" data-testid="edit-tp-no" />
              </div>
              <div>
                <Label className="text-slate-400 text-xs mb-1 block">TP Weight (Q)</Label>
                <Input type="number" value={editForm.tp_weight || ""} onChange={e => setEditForm(p => ({ ...p, tp_weight: e.target.value }))}
                  className="h-9 text-sm border-slate-600" data-testid="edit-tp-weight" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
        <DialogContent className="bg-slate-800 border-slate-600 max-w-[520px] max-h-[90vh] overflow-y-auto p-0" data-testid="vw-photo-dialog"
          onEscapeKeyDown={(e) => {
            const zoomOpen = document.querySelector('[data-testid="photo-zoom-overlay"], [data-testid="camera-zoom-overlay"]');
            if (zoomOpen) e.preventDefault();
          }}>
          {photoDialog.loading ? (
            <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-slate-500" /></div>
          ) : photoDialog.data ? (
            <>
            <div className="border-[2px] border-gray-800 rounded m-3" data-testid="vw-photo-slip">
              {/* ── Slip Header ── */}
              <div className="text-center border-b-[2px] border-gray-800 py-2 px-3 relative">
                <div className="absolute top-1 right-2 text-[9px] text-slate-400 font-semibold tracking-wide">VIEW COPY</div>
                {/* Custom fields ABOVE */}
                {(() => { const above = (photoDialog.data?._brand?.custom_fields || []).filter(f => f.placement === 'above' && f.value); return above.length > 0 ? <p className="text-[9px] text-red-800 font-semibold mb-0.5">{above.map(f => f.label ? `${f.label}: ${f.value}` : f.value).join('  |  ')}</p> : null; })()}
                <h2 className="text-lg font-black text-slate-100 leading-tight tracking-wide" data-testid="slip-company-name">{photoDialog.data?._brand?.company || "NAVKAR AGRO"}</h2>
                <p className="text-[10px] text-slate-400 mt-0.5">{photoDialog.data?._brand?.tagline || "JOLKO, KESINGA - Mill Entry System"}</p>
                {/* Custom fields BELOW */}
                {(() => { const below = (photoDialog.data?._brand?.custom_fields || []).filter(f => f.placement !== 'above' && f.value); return below.length > 0 ? <p className="text-[9px] text-slate-400 mt-0.5">{below.map(f => f.label ? `${f.label}: ${f.value}` : f.value).join('  |  ')}</p> : null; })()}
                <div className="text-xs font-bold text-slate-300 mt-0.5">WEIGHT SLIP / तौल पर्ची</div>
              </div>

              {/* ── Info Table ── */}
              <table className="w-full border-collapse text-[11px]" data-testid="slip-info-table">
                <tbody>
                  <tr>
                    <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold whitespace-nowrap w-[22%]">RST No.</td>
                    <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100 text-xs w-[28%]">#{photoDialog.data.rst_no}</td>
                    <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold whitespace-nowrap w-[22%]">Date / दिनांक</td>
                    <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100 w-[28%]">{fmtDate(photoDialog.data.date) || '-'}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold whitespace-nowrap">Vehicle / गाड़ी</td>
                    <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100">{photoDialog.data.vehicle_no}</td>
                    <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold whitespace-nowrap">Trans Type</td>
                    <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100">{photoDialog.data.trans_type || '-'}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold whitespace-nowrap">Party / पार्टी</td>
                    <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100">{photoDialog.data.party_name || '-'}</td>
                    <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold whitespace-nowrap">Source/Mandi</td>
                    <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100">{photoDialog.data.farmer_name || '-'}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold whitespace-nowrap">Product / माल</td>
                    <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100">{photoDialog.data.product || '-'}</td>
                    <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold whitespace-nowrap">Bags / बोरे</td>
                    <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100">{photoDialog.data.tot_pkts || '-'}</td>
                  </tr>
                  {(photoDialog.data.g_issued > 0) && (
                    <tr>
                      <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold whitespace-nowrap">G.Issued</td>
                      <td className="border border-slate-600 px-2 py-1 font-extrabold text-indigo-700">{fmtWt(photoDialog.data.g_issued)}</td>
                      <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold whitespace-nowrap">TP No.</td>
                      <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100">{photoDialog.data.tp_no || '-'}</td>
                    </tr>
                  )}
                  {(!photoDialog.data.g_issued || Number(photoDialog.data.g_issued) === 0) && photoDialog.data.tp_no && (
                    <tr>
                      <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold whitespace-nowrap">TP No.</td>
                      <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100">{photoDialog.data.tp_no}</td>
                      <td className="border border-slate-600 px-2 py-1"></td>
                      <td className="border border-slate-600 px-2 py-1"></td>
                    </tr>
                  )}
                  {Number(photoDialog.data.tp_weight || 0) > 0 && (
                    <tr>
                      <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold whitespace-nowrap">TP Weight</td>
                      <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100">{Number(photoDialog.data.tp_weight)} Q</td>
                      <td className="border border-slate-600 px-2 py-1"></td>
                      <td className="border border-slate-600 px-2 py-1"></td>
                    </tr>
                  )}
                  {photoDialog.data.remark && photoDialog.data.remark !== '-' && (
                    <tr>
                      <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold whitespace-nowrap">Remark / टिप्पणी</td>
                      <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100" colSpan={3}>{photoDialog.data.remark}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* ── Weight Summary Bar ── */}
              <div className="flex border-t-[2px] border-gray-800" data-testid="slip-weight-bar">
                <div className="flex-1 text-center py-1.5 border-r border-gray-400 bg-slate-700">
                  <span className="block text-[8px] font-bold text-slate-400 uppercase">Gross / कुल</span>
                  <span className="block text-sm font-black text-slate-100">{fmtWt(photoDialog.data.first_wt)} KG</span>
                </div>
                <div className="flex-1 text-center py-1.5 border-r border-gray-400 bg-slate-700">
                  <span className="block text-[8px] font-bold text-slate-400 uppercase">Tare / खाली</span>
                  <span className="block text-sm font-black text-slate-100">{fmtWt(photoDialog.data.second_wt)} KG</span>
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
              <div className="text-center py-1 border-t border-slate-600">
                <span className="text-[8px] text-slate-500">{photoDialog.data?._brand?.company || "NAVKAR AGRO"} | Computer Generated</span>
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
                        <p className="text-[10px] text-slate-400 mb-0.5 font-medium">Front View</p>
                        {photoDialog.data.first_wt_front_img ? (
                          <img src={`data:image/jpeg;base64,${photoDialog.data.first_wt_front_img}`} alt="1st Wt Front" className="w-full rounded border border-slate-600 object-cover cursor-pointer hover:opacity-80 transition" style={{ maxHeight: 180 }} onClick={() => setZoomImg(`data:image/jpeg;base64,${photoDialog.data.first_wt_front_img}`)} />
                        ) : <div className="h-20 bg-slate-700 rounded flex items-center justify-center text-slate-500 text-[10px]">No Photo</div>}
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 mb-0.5 font-medium">Side View</p>
                        {photoDialog.data.first_wt_side_img ? (
                          <img src={`data:image/jpeg;base64,${photoDialog.data.first_wt_side_img}`} alt="1st Wt Side" className="w-full rounded border border-slate-600 object-cover cursor-pointer hover:opacity-80 transition" style={{ maxHeight: 180 }} onClick={() => setZoomImg(`data:image/jpeg;base64,${photoDialog.data.first_wt_side_img}`)} />
                        ) : <div className="h-20 bg-slate-700 rounded flex items-center justify-center text-slate-500 text-[10px]">No Photo</div>}
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
                        <p className="text-[10px] text-slate-400 mb-0.5 font-medium">Front View</p>
                        {photoDialog.data.second_wt_front_img ? (
                          <img src={`data:image/jpeg;base64,${photoDialog.data.second_wt_front_img}`} alt="2nd Wt Front" className="w-full rounded border border-slate-600 object-cover cursor-pointer hover:opacity-80 transition" style={{ maxHeight: 180 }} onClick={() => setZoomImg(`data:image/jpeg;base64,${photoDialog.data.second_wt_front_img}`)} />
                        ) : <div className="h-20 bg-slate-700 rounded flex items-center justify-center text-slate-500 text-[10px]">No Photo</div>}
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 mb-0.5 font-medium">Side View</p>
                        {photoDialog.data.second_wt_side_img ? (
                          <img src={`data:image/jpeg;base64,${photoDialog.data.second_wt_side_img}`} alt="2nd Wt Side" className="w-full rounded border border-slate-600 object-cover cursor-pointer hover:opacity-80 transition" style={{ maxHeight: 180 }} onClick={() => setZoomImg(`data:image/jpeg;base64,${photoDialog.data.second_wt_side_img}`)} />
                        ) : <div className="h-20 bg-slate-700 rounded flex items-center justify-center text-slate-500 text-[10px]">No Photo</div>}
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
        <div className="fixed inset-0 z-[9998] bg-black/80 flex items-center justify-center cursor-pointer" onClick={() => setZoomImg(null)} data-testid="photo-zoom-overlay">
          <img src={zoomImg} alt="Zoomed" className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl object-contain" />
          <button className="absolute top-4 right-4 text-white bg-black/50 rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/80 text-lg font-bold" onClick={() => setZoomImg(null)} data-testid="photo-zoom-close">&times;</button>
        </div>
      )}

    </div>
  );
}
