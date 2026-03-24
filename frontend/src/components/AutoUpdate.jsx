import { useState, useEffect } from "react";
import { Download, RefreshCw, CheckCircle2, X, ArrowUpCircle, Loader2, Sparkles, Rocket } from "lucide-react";

const AutoUpdate = () => {
  const [state, setState] = useState("idle");
  const [info, setInfo] = useState({});
  const [progress, setProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.onUpdateAvailable((data) => {
      setInfo(data);
      setState("available");
      setDismissed(false);
    });
    window.electronAPI.onDownloadProgress((data) => {
      setProgress(Math.round(data.percent || 0));
      setState("downloading");
    });
    window.electronAPI.onUpdateDownloaded(() => {
      setState("downloaded");
    });
    window.electronAPI.onUpdateError(() => {
      setState("error");
      setTimeout(() => setState("idle"), 5000);
    });
  }, []);

  if (state === "idle" || dismissed) return null;

  const handleDownload = () => {
    window.electronAPI?.startDownload();
    setState("downloading");
    setProgress(0);
  };

  const handleInstall = () => {
    window.electronAPI?.installUpdate();
  };

  const handleDismiss = () => {
    setDismissed(true);
    window.electronAPI?.dismissUpdate();
  };

  return (
    <div className="fixed top-5 right-5 z-[99999]" data-testid="auto-update-notification"
      style={{ animation: "slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}>
      <style>{`
        @keyframes slideDown { from { opacity: 0; transform: translateY(-16px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes pulse-ring { 0% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); } 70% { box-shadow: 0 0 0 8px rgba(59,130,246,0); } 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); } }
        .shimmer-bar { background: linear-gradient(90deg, #3b82f6 0%, #06b6d4 30%, #a78bfa 50%, #06b6d4 70%, #3b82f6 100%); background-size: 200% 100%; animation: shimmer 2s linear infinite; }
        .pulse-ring { animation: pulse-ring 2s ease-out infinite; }
      `}</style>

      <div className="w-[340px] rounded-2xl overflow-hidden"
        style={{ 
          background: "linear-gradient(135deg, rgba(15,23,42,0.98), rgba(30,41,59,0.98))",
          border: "1px solid rgba(148,163,184,0.15)",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(148,163,184,0.05), inset 0 1px 0 rgba(255,255,255,0.05)"
        }}>

        {/* Top accent line */}
        <div className="h-[2px] w-full" style={{
          background: state === "downloaded" 
            ? "linear-gradient(90deg, #10b981, #34d399, #6ee7b7, #34d399, #10b981)" 
            : "linear-gradient(90deg, #3b82f6, #8b5cf6, #06b6d4, #8b5cf6, #3b82f6)",
          backgroundSize: "200% 100%",
          animation: "shimmer 3s linear infinite"
        }} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <div className="flex items-center gap-3">
            <div className={`relative p-2 rounded-xl ${
              state === "downloaded" ? "bg-emerald-500/15" : 
              state === "downloading" ? "bg-blue-500/15" : 
              state === "error" ? "bg-red-500/15" : "bg-blue-500/15"
            }`}>
              {state === "downloaded" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : state === "downloading" ? (
                <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
              ) : state === "error" ? (
                <X className="w-5 h-5 text-red-400" />
              ) : (
                <Rocket className="w-5 h-5 text-blue-400" />
              )}
              {state === "available" && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-500 rounded-full pulse-ring" />
              )}
            </div>
            <div>
              <p className="text-[13px] font-bold text-white leading-tight">
                {state === "available" && "Naya Update Aaya Hai!"}
                {state === "downloading" && "Download Ho Raha Hai..."}
                {state === "downloaded" && "Install Ke Liye Ready!"}
                {state === "error" && "Update Mein Error"}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {state === "available" && "Naye features aur fixes ke saath"}
                {state === "downloading" && `v${info.version || ""} download ho raha hai`}
                {state === "downloaded" && "Restart karo aur enjoy karo"}
                {state === "error" && "Baad mein try karein"}
              </p>
            </div>
          </div>
          {state !== "downloading" && (
            <button onClick={handleDismiss} className="p-1.5 rounded-lg hover:bg-slate-700/60 transition-all duration-200" data-testid="update-dismiss">
              <X className="w-4 h-4 text-slate-500 hover:text-slate-300" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="px-5 pb-4 pt-2">
          {state === "available" && (
            <div className="space-y-3">
              {/* Version comparison */}
              <div className="flex items-center gap-3 rounded-xl p-3"
                style={{ background: "rgba(30,41,59,0.6)", border: "1px solid rgba(148,163,184,0.08)" }}>
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Abhi</p>
                  <p className="text-base text-slate-400 font-mono mt-0.5">v{info.currentVersion}</p>
                </div>
                <div className="flex flex-col items-center gap-0.5 px-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <div className="w-px h-3 bg-slate-700" />
                </div>
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-emerald-400 uppercase tracking-wider font-medium">Naya</p>
                  <p className="text-base text-emerald-400 font-mono font-bold mt-0.5">v{info.version}</p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button onClick={handleDismiss}
                  className="flex-1 px-3 py-2.5 text-xs font-semibold text-slate-400 rounded-xl transition-all duration-200 hover:text-slate-300"
                  style={{ background: "rgba(30,41,59,0.8)", border: "1px solid rgba(148,163,184,0.1)" }}
                  data-testid="update-later">
                  Baad Mein
                </button>
                <button onClick={handleDownload}
                  className="flex-1 px-3 py-2.5 text-xs font-semibold text-white rounded-xl transition-all duration-200 flex items-center justify-center gap-2 hover:brightness-110"
                  style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)", boxShadow: "0 4px 12px rgba(59,130,246,0.3)" }}
                  data-testid="update-download">
                  <Download className="w-4 h-4" /> Download Karo
                </button>
              </div>
            </div>
          )}

          {state === "downloading" && (
            <div className="space-y-3">
              {/* Progress bar */}
              <div className="rounded-xl p-3" style={{ background: "rgba(30,41,59,0.6)", border: "1px solid rgba(148,163,184,0.08)" }}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[11px] text-slate-400 font-medium">v{info.version}</span>
                  <span className="text-[13px] text-blue-400 font-mono font-bold">{progress}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500 ease-out shimmer-bar"
                    style={{ width: `${Math.max(progress, 2)}%` }} />
                </div>
              </div>
            </div>
          )}

          {state === "downloaded" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button onClick={handleDismiss}
                  className="flex-1 px-3 py-2.5 text-xs font-semibold text-slate-400 rounded-xl transition-all duration-200 hover:text-slate-300"
                  style={{ background: "rgba(30,41,59,0.8)", border: "1px solid rgba(148,163,184,0.1)" }}
                  data-testid="update-restart-later">
                  Baad Mein
                </button>
                <button onClick={handleInstall}
                  className="flex-1 px-3 py-2.5 text-xs font-semibold text-white rounded-xl transition-all duration-200 flex items-center justify-center gap-2 hover:brightness-110"
                  style={{ background: "linear-gradient(135deg, #10b981, #059669)", boxShadow: "0 4px 12px rgba(16,185,129,0.3)" }}
                  data-testid="update-install">
                  <RefreshCw className="w-4 h-4" /> Restart Karo
                </button>
              </div>
            </div>
          )}

          {state === "error" && (
            <p className="text-xs text-red-400/80 pb-1">Update check mein error aaya. Thodi der baad try karein.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AutoUpdate;
