import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Camera, CameraOff, Eye, EyeOff, RefreshCw, AlertCircle, CheckCircle, Trash2 } from "lucide-react";
import { API } from "./settingsConstants";
import logger from "../../utils/logger";

function CameraSetupTab() {
  const [camType, setCamType] = useState("ip"); // "ip", "usb", or "vigi"
  const [frontUrl, setFrontUrl] = useState("");
  const [sideUrl, setSideUrl] = useState("");
  const [frontPreview, setFrontPreview] = useState(false);
  const [sidePreview, setSidePreview] = useState(false);
  const [frontError, setFrontError] = useState(false);
  const [sideError, setSideError] = useState(false);
  // USB state
  const [devices, setDevices] = useState([]);
  const [frontId, setFrontId] = useState("");
  const [sideId, setSideId] = useState("");
  const [previewStream, setPreviewStream] = useState({ front: null, side: null });
  const frontRef = useRef(null);
  const sideRef = useRef(null);
  // VIGI NVR state
  const [vigiIp, setVigiIp] = useState("");
  const [vigiUser, setVigiUser] = useState("admin");
  const [vigiPass, setVigiPass] = useState("");
  const [vigiFrontCh, setVigiFrontCh] = useState("");
  const [vigiSideCh, setVigiSideCh] = useState("");
  const [vigiOpenApiPort, setVigiOpenApiPort] = useState("");
  const [vigiFrontIp, setVigiFrontIp] = useState("");
  const [vigiSideIp, setVigiSideIp] = useState("");
  const [vigiTesting, setVigiTesting] = useState(false);
  const [vigiTestResult, setVigiTestResult] = useState(null);
  // Image cleanup state
  const [cleanupDays, setCleanupDays] = useState(0);
  const [cleanupLoading, setCleanupLoading] = useState(false);

  // Get display URL - use proxy for RTSP
  const getPreviewUrl = (url) => {
    if (!url) return "";
    if (url.toLowerCase().startsWith("rtsp://")) {
      return `${API}/camera-stream?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  const [diagResult, setDiagResult] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const diagnoseCam = async (url) => {
    if (!url) { toast.error("URL daalo pehle"); return; }
    setDiagLoading(true); setDiagResult(null);
    try {
      const r = await axios.get(`${API}/camera-check?url=${encodeURIComponent(url)}`, { timeout: 30000 });
      setDiagResult(r.data);
    } catch (e) { setDiagResult({ error: e.message }); }
    setDiagLoading(false);
  };

  const [rtspTestResult, setRtspTestResult] = useState(null);
  const [rtspTestLoading, setRtspTestLoading] = useState(false);
  const testRtsp = async (url) => {
    if (!url) { toast.error("URL daalo pehle"); return; }
    setRtspTestLoading(true); setRtspTestResult(null);
    toast.info("RTSP test shuru... 15-20 sec lag sakte hain");
    try {
      const r = await axios.get(`${API}/camera-test-rtsp?url=${encodeURIComponent(url)}`, { timeout: 35000 });
      setRtspTestResult(r.data);
      if (r.data.success) toast.success("RTSP stream kaam kar raha hai!");
      else toast.error("RTSP test fail hua");
    } catch (e) { setRtspTestResult({ error: e.message }); }
    setRtspTestLoading(false);
  };

  const [vigiDiagResult, setVigiDiagResult] = useState(null);
  const [vigiDiagLoading, setVigiDiagLoading] = useState(false);
  const diagnoseVigi = async () => {
    const ip = vigiFrontIp || vigiSideIp || vigiIp;
    if (!ip) { toast.error("Camera/NVR IP daalo pehle"); return; }
    setVigiDiagLoading(true); setVigiDiagResult(null);
    try {
      const ch = vigiFrontIp ? '1' : (vigiFrontCh || '1');
      const r = await axios.get(`${API}/vigi-diagnose?ip=${encodeURIComponent(ip)}&username=${encodeURIComponent(vigiUser)}&password=${encodeURIComponent(vigiPass)}&channel=${ch}&openapi_port=${encodeURIComponent(vigiOpenApiPort)}`, { timeout: 30000 });
      setVigiDiagResult(r.data);
    } catch (e) { setVigiDiagResult({ error: e.message }); }
    setVigiDiagLoading(false);
  };

  // Load saved config - from backend first, then localStorage fallback
  useEffect(() => {
    const loadConfig = async () => {
      let saved = {};
      let fromBackend = false;
      try {
        const res = await axios.get(`${API}/settings/camera-config`);
        if (res.data && Object.keys(res.data).length > 0) {
          saved = res.data;
          fromBackend = true;
        }
      } catch (e) { logger.error('Camera config backend load error:', e); /* fallback to localStorage */ }
      
      if (!fromBackend) {
        try {
          saved = JSON.parse(localStorage.getItem('camera_config') || '{}');
          // Auto-migrate localStorage to backend
          if (saved && Object.keys(saved).length > 0) {
            axios.put(`${API}/settings/camera-config`, saved).catch(() => {});
          }
        } catch (e) { logger.error('Camera config localStorage parse error:', e); saved = {}; }
      }
      
      const type = saved.type || "ip";
      setCamType(type);
      if (type === "ip") {
        setFrontUrl(saved.frontUrl || "");
        setSideUrl(saved.sideUrl || "");
      } else if (type === "vigi") {
        setVigiIp(saved.vigiIp || "");
        setVigiUser(saved.vigiUser || "admin");
        setVigiPass(saved.vigiPass || "");
        setVigiFrontCh(saved.vigiFrontChannel || "");
        setVigiSideCh(saved.vigiSideChannel || "");
        setVigiFrontIp(saved.vigiFrontIp || "");
        setVigiSideIp(saved.vigiSideIp || "");
        setVigiOpenApiPort(saved.vigiOpenApiPort || "");
      } else {
        if (saved.frontId) setFrontId(saved.frontId);
        if (saved.sideId) setSideId(saved.sideId);
      }
    };
    loadConfig();
    axios.get(`${API}/settings/image-cleanup`).then(r => {
      setCleanupDays(r.data.days || 0);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true }).then(s => s.getTracks().forEach(t => t.stop()));
      const all = await navigator.mediaDevices.enumerateDevices();
      const vids = all.filter(d => d.kind === 'videoinput');
      setDevices(vids);
    } catch (e) { logger.error('Camera access error:', e); toast.error("Camera access nahi mila"); }
  };

  useEffect(() => {
    if (camType === "usb") loadDevices();
  }, [camType]);

  useEffect(() => () => {
    if (previewStream.front) previewStream.front.getTracks().forEach(t => t.stop());
    if (previewStream.side) previewStream.side.getTracks().forEach(t => t.stop());
  }, [previewStream]);

  const startPreview = async (deviceId, videoRef, key) => {
    if (previewStream[key]) { previewStream[key].getTracks().forEach(t => t.stop()); }
    if (!deviceId) {
      if (videoRef.current) videoRef.current.srcObject = null;
      setPreviewStream(p => ({ ...p, [key]: null }));
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: 640, height: 480 }
      });
      if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); }
      setPreviewStream(p => ({ ...p, [key]: s }));
    } catch (e) { logger.error('Camera start error:', e); toast.error("Camera start nahi ho paya"); }
  };

  const handleSave = async () => {
    let configData = {};
    if (camType === "ip") {
      configData = { type: "ip", frontUrl, sideUrl };
    } else if (camType === "vigi") {
      configData = {
        type: "vigi", vigiIp, vigiUser, vigiPass,
        vigiFrontChannel: vigiFrontCh, vigiSideChannel: vigiSideCh,
        vigiFrontIp: vigiFrontIp, vigiSideIp: vigiSideIp,
        vigiOpenApiPort: vigiOpenApiPort
      };
      // Also save vigi config to dedicated endpoint
      try {
        await axios.post(`${API}/vigi-config`, {
          nvr_ip: vigiIp, username: vigiUser, password: vigiPass,
          front_channel: vigiFrontCh, side_channel: vigiSideCh,
          front_ip: vigiFrontIp, side_ip: vigiSideIp,
          openapi_port: vigiOpenApiPort, enabled: true
        });
      } catch (e) { logger.error('Vigi config save error:', e); /* ignore on web */ }
    } else {
      configData = { type: "usb", frontId, sideId };
    }
    // Save to localStorage (for current browser)
    localStorage.setItem('camera_config', JSON.stringify(configData));
    // Save to backend database (for all devices)
    try {
      await axios.put(`${API}/settings/camera-config`, configData);
    } catch (e) { logger.error('Camera config backend save error:', e); }
    window.dispatchEvent(new Event('camera-config-changed'));
    try {
      await axios.put(`${API}/settings/image-cleanup`, { days: cleanupDays });
    } catch (e) { logger.error('Image cleanup config save error:', e); }
    toast.success("Camera config save ho gaya - sab devices pe sync hoga!");
  };

  const testVigiConnection = async () => {
    const testIp = vigiFrontIp || vigiIp;
    if (!testIp) { toast.error("NVR IP ya Camera IP daalo"); return; }
    setVigiTesting(true); setVigiTestResult(null);
    try {
      const ch = vigiFrontIp ? '1' : (vigiFrontCh || '1');
      const r = await axios.get(`${API}/vigi-test?nvr_ip=${encodeURIComponent(testIp)}&username=${encodeURIComponent(vigiUser)}&password=${encodeURIComponent(vigiPass)}&channel=${ch}&openapi_port=${encodeURIComponent(vigiOpenApiPort)}`, { timeout: 30000 });
      setVigiTestResult(r.data);
      if (r.data.success) toast.success("Connected!");
      else toast.error(r.data.error || "Connection fail");
    } catch (e) { setVigiTestResult({ success: false, error: e.message }); toast.error("Connection error - timeout ya network issue"); }
    setVigiTesting(false);
  };

  const handleManualCleanup = async () => {
    if (cleanupDays <= 0) { toast.error("Pehle cleanup days set karein"); return; }
    setCleanupLoading(true);
    try {
      // Pehle days save karo DB mein, phir run karo
      await axios.put(`${API}/settings/image-cleanup`, { days: cleanupDays });
      const r = await axios.post(`${API}/settings/image-cleanup/run`);
      if (r.data.success) {
        toast.success(r.data.message || `${r.data.deleted} images deleted`);
      } else {
        toast.info(r.data.message || "Cleanup disabled");
      }
    } catch (e) { logger.error('Cleanup error:', e); toast.error("Cleanup error"); }
    setCleanupLoading(false);
  };

  return (
    <div className="space-y-4">
      <Card className="bg-slate-800 border-slate-700" data-testid="camera-setup-section">
        <CardHeader>
          <CardTitle className="text-amber-400 flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Camera Setup / IP Camera Setup
          </CardTitle>
          <p className="text-slate-400 text-sm">
            Vehicle Weight ke liye Front aur Side camera configure karein
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* ─── IP Camera Mode ─── */}
            <div className="space-y-4">
              <div className="bg-slate-700/50 rounded-lg p-3 text-xs text-slate-400 space-y-1">
                <p className="text-amber-400 font-semibold text-sm">IP Camera URL kaise milega?</p>
                <p>1. Camera ka IP address find karo (router settings ya camera app se)</p>
                <p>2. RTSP URL daalo jaise: <code className="text-green-400">rtsp://admin:password@192.168.1.100:554</code></p>
                <p>3. HTTP stream bhi chalega: <code className="text-green-400">http://192.168.1.100:8080/video</code></p>
                <p className="text-amber-300 mt-1">RTSP automatic proxy se chalega - VLC jaisa live stream!</p>
              </div>

              {/* Front Camera URL */}
              <div className="bg-slate-700/50 rounded-lg p-3 text-xs text-slate-400 space-y-1">
                <p className="text-amber-400 font-semibold text-sm">IP Camera URL kaise milega?</p>
                <p>1. Camera ka IP address find karo (router settings ya camera app se)</p>
                <p>2. RTSP URL daalo jaise: <code className="text-green-400">rtsp://admin:password@192.168.1.100:554</code></p>
                <p>3. HTTP stream bhi chalega: <code className="text-green-400">http://192.168.1.100:8080/video</code></p>
                <p className="text-amber-300 mt-1">RTSP automatic proxy se chalega - VLC jaisa live stream!</p>
              </div>

              {/* Front Camera URL */}
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm font-semibold">Front Camera URL</Label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={frontUrl}
                    onChange={(e) => { setFrontUrl(e.target.value); setFrontPreview(false); setFrontError(false); }}
                    placeholder="rtsp://admin:password@192.168.1.100:554/stream1"
                    className="flex-1 bg-slate-700 border border-slate-600 text-white text-sm rounded-md px-3 py-2"
                    data-testid="front-camera-url-input"
                  />
                  <Button
                    onClick={() => { setFrontPreview(!frontPreview); setFrontError(false); }}
                    size="sm"
                    variant="outline"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                    data-testid="front-camera-preview-btn"
                    disabled={!frontUrl}
                  >
                    {frontPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <div className="rounded-lg overflow-hidden border border-slate-600 bg-black h-[180px]">
                  {frontPreview && frontUrl ? (
                    frontError ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center">
                          <CameraOff className="w-6 h-6 text-red-500 mx-auto mb-1" />
                          <p className="text-red-400 text-xs">Camera connect nahi ho paya</p>
                          <p className="text-slate-500 text-[10px] mt-1">URL check karein ya camera ON hai?</p>
                        </div>
                      </div>
                    ) : (
                      <img
                        src={getPreviewUrl(frontUrl)}
                        alt="Front Camera"
                        className="w-full h-full object-contain"
                        crossOrigin="anonymous"
                        onError={() => setFrontError(true)}
                        onLoad={() => setFrontError(false)}
                      />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <p className="text-slate-500 text-xs">{frontUrl ? "Preview dekhne ke liye Eye icon dabayein" : "URL daalein"}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Side Camera URL */}
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm font-semibold">Side Camera URL</Label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={sideUrl}
                    onChange={(e) => { setSideUrl(e.target.value); setSidePreview(false); setSideError(false); }}
                    placeholder="http://192.168.1.101:8080/video"
                    className="flex-1 bg-slate-700 border border-slate-600 text-white text-sm rounded-md px-3 py-2"
                    data-testid="side-camera-url-input"
                  />
                  <Button
                    onClick={() => { setSidePreview(!sidePreview); setSideError(false); }}
                    size="sm"
                    variant="outline"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                    data-testid="side-camera-preview-btn"
                    disabled={!sideUrl}
                  >
                    {sidePreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <div className="rounded-lg overflow-hidden border border-slate-600 bg-black h-[180px]">
                  {sidePreview && sideUrl ? (
                    sideError ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center">
                          <CameraOff className="w-6 h-6 text-red-500 mx-auto mb-1" />
                          <p className="text-red-400 text-xs">Camera connect nahi ho paya</p>
                          <p className="text-slate-500 text-[10px] mt-1">URL check karein ya camera ON hai?</p>
                        </div>
                      </div>
                    ) : (
                      <img
                        src={getPreviewUrl(sideUrl)}
                        alt="Side Camera"
                        className="w-full h-full object-contain"
                        crossOrigin="anonymous"
                        onError={() => setSideError(true)}
                        onLoad={() => setSideError(false)}
                      />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <p className="text-slate-500 text-xs">{sideUrl ? "Preview dekhne ke liye Eye icon dabayein" : "URL daalein"}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Diagnose Button */}
              <div className="mt-4 space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <Button
                    onClick={() => diagnoseCam(frontUrl || sideUrl)}
                    disabled={diagLoading || (!frontUrl && !sideUrl)}
                    size="sm"
                    className="bg-orange-700 hover:bg-orange-600 text-white"
                    data-testid="camera-diagnose-btn"
                  >
                    {diagLoading ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <AlertCircle className="w-4 h-4 mr-1.5" />}
                    {diagLoading ? 'Checking...' : 'Diagnose Camera'}
                  </Button>
                  <Button
                    onClick={() => testRtsp(frontUrl || sideUrl)}
                    disabled={rtspTestLoading || (!frontUrl && !sideUrl)}
                    size="sm"
                    className="bg-blue-700 hover:bg-blue-600 text-white"
                    data-testid="camera-test-rtsp-btn"
                  >
                    {rtspTestLoading ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Camera className="w-4 h-4 mr-1.5" />}
                    {rtspTestLoading ? 'Testing RTSP...' : 'Test RTSP Stream'}
                  </Button>
                  <p className="text-slate-500 text-[10px] self-center">Camera connect nahi ho raha? Isse click karke wajah pata karein</p>
                </div>

                {diagResult && (
                  <div className={`rounded-lg border p-3 text-xs space-y-2 ${
                    diagResult.error ? 'bg-red-900/20 border-red-700/50' :
                    diagResult.networkReachable && diagResult.snapshotTest?.startsWith('OK') ? 'bg-green-900/20 border-green-700/50' :
                    'bg-amber-900/20 border-amber-700/50'
                  }`} data-testid="camera-diagnose-result">
                    {/* Diagnosis Summary */}
                    <div className="flex items-start gap-2">
                      {diagResult.error ? (
                        <CameraOff className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                      ) : diagResult.networkReachable && diagResult.snapshotTest?.startsWith('OK') ? (
                        <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-semibold text-white text-sm">
                          {diagResult.error ? 'Diagnose Error' : diagResult.diagnosisHi || diagResult.diagnosis}
                        </p>
                        {diagResult.error && <p className="text-red-300 mt-1">{diagResult.error}</p>}
                      </div>
                    </div>

                    {!diagResult.error && (
                      <div className="space-y-1.5 pt-1 border-t border-slate-700">
                        {/* URL Parse */}
                        {diagResult.urlParsed && (
                          <div className="flex gap-2">
                            <span className="text-slate-500 w-20">URL Parse:</span>
                            <span className="text-green-400">OK - IP: {diagResult.urlParsed.ip}, Port: {diagResult.urlParsed.port}, User: {diagResult.urlParsed.user || 'none'}</span>
                          </div>
                        )}
                        {/* Network */}
                        <div className="flex gap-2">
                          <span className="text-slate-500 w-20">Network:</span>
                          <span className={diagResult.networkReachable ? 'text-green-400' : 'text-red-400'}>
                            {diagResult.networkReachable ? 'Reachable' : 'NOT Reachable'}
                          </span>
                        </div>
                        {/* Port Scan */}
                        {diagResult.portScan && Object.keys(diagResult.portScan).length > 0 && (
                          <div className="flex gap-2">
                            <span className="text-slate-500 w-20">Ports:</span>
                            <span className="text-slate-300">
                              {Object.entries(diagResult.portScan).map(([p, s]) => (
                                <span key={p} className={`mr-2 ${s === 'OPEN' ? 'text-green-400' : 'text-red-400'}`}>
                                  {p}: {s}
                                </span>
                              ))}
                            </span>
                          </div>
                        )}
                        {/* ffmpeg */}
                        <div className="flex gap-2">
                          <span className="text-slate-500 w-20">ffmpeg:</span>
                          <span className={diagResult.ffmpegAvailable ? 'text-green-400' : 'text-amber-400'}>
                            {diagResult.ffmpegAvailable ? 'Available' : 'Not Found'}
                          </span>
                        </div>
                        {/* Snapshot Test */}
                        {diagResult.snapshotTest && (
                          <div className="flex gap-2">
                            <span className="text-slate-500 w-20">Snapshot:</span>
                            <span className={diagResult.snapshotTest.startsWith('OK') ? 'text-green-400' : 'text-red-400'}>
                              {diagResult.snapshotTest}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* RTSP Test Result */}
                {rtspTestResult && (
                  <div className={`rounded-lg border p-3 text-xs space-y-2 ${
                    rtspTestResult.success ? 'bg-green-900/20 border-green-700/50' : 'bg-red-900/20 border-red-700/50'
                  }`} data-testid="rtsp-test-result">
                    <div className="flex items-start gap-2">
                      {rtspTestResult.success ? (
                        <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      ) : (
                        <CameraOff className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-semibold text-white text-sm">
                          {rtspTestResult.diagnosisHi || rtspTestResult.diagnosis || (rtspTestResult.error ? 'Test Error' : 'RTSP Test')}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1.5 pt-1 border-t border-slate-700">
                      <div className="flex gap-2">
                        <span className="text-slate-500 w-20">FFmpeg:</span>
                        <span className="text-slate-300 break-all text-[10px]">{rtspTestResult.ffmpegPath || 'N/A'}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-slate-500 w-20">Transport:</span>
                        <span className="text-slate-300">{rtspTestResult.transport || 'N/A'}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-slate-500 w-20">Frame:</span>
                        <span className={rtspTestResult.frameSize > 1000 ? 'text-green-400' : 'text-red-400'}>
                          {rtspTestResult.frameSize || 0} bytes {rtspTestResult.hasJpeg ? '(Valid JPEG)' : ''}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-slate-500 w-20">Exit Code:</span>
                        <span className={rtspTestResult.exitCode === 0 ? 'text-green-400' : 'text-red-400'}>
                          {rtspTestResult.exitCode ?? 'N/A'}
                        </span>
                      </div>
                      {rtspTestResult.stderr && (
                        <div>
                          <span className="text-slate-500">FFmpeg Output:</span>
                          <pre className="mt-1 p-2 bg-slate-900 rounded text-[10px] text-slate-400 max-h-40 overflow-auto whitespace-pre-wrap break-all">
                            {rtspTestResult.stderr}
                          </pre>
                        </div>
                      )}
                      {rtspTestResult.udpStderr && (
                        <div>
                          <span className="text-slate-500">UDP stderr:</span>
                          <pre className="mt-1 p-2 bg-slate-900 rounded text-[10px] text-slate-400 max-h-24 overflow-auto whitespace-pre-wrap break-all">
                            {rtspTestResult.udpStderr}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

          <Button onClick={handleSave} className="w-full bg-amber-600 hover:bg-amber-700 text-white" data-testid="save-camera-config-btn">
            Save Camera Config
          </Button>
        </CardContent>
      </Card>

      {/* Image Auto-Cleanup Card */}
      <Card className="bg-slate-800 border-slate-700" data-testid="image-cleanup-section">
        <CardHeader>
          <CardTitle className="text-amber-400 flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            Image Auto-Cleanup
          </CardTitle>
          <p className="text-slate-400 text-sm">
            Purani camera images automatically delete hongi set days ke baad. 0 = OFF
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-slate-300 text-sm mb-1 block">Kitne din baad delete karein?</Label>
              <Input
                type="number"
                min="0"
                max="365"
                value={cleanupDays}
                onChange={(e) => setCleanupDays(parseInt(e.target.value) || 0)}
                className="bg-slate-900 border-slate-600 text-white"
                placeholder="0 = disabled"
                data-testid="cleanup-days-input"
              />
            </div>
            <Button
              onClick={handleManualCleanup}
              disabled={cleanupLoading || cleanupDays <= 0}
              variant="outline"
              className="border-red-600 text-red-400 hover:bg-red-600/20"
              data-testid="manual-cleanup-btn"
            >
              {cleanupLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Abhi Clean Karo
            </Button>
          </div>
          <p className="text-slate-500 text-xs">
            Ye setting save hone par active hogi. App har 24 ghante mai purani images check karke delete karega.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default CameraSetupTab;
