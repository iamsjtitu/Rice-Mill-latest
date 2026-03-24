import { useState, useEffect } from "react";
import { Download, RefreshCw, CheckCircle2, X, ArrowUpCircle, Loader2 } from "lucide-react";

const AutoUpdate = () => {
  const [state, setState] = useState("idle"); // idle | available | downloading | downloaded | error
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
      setProgress(data.percent || 0);
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
    <div className="fixed top-4 right-4 z-[99999] animate-in slide-in-from-top-2 duration-500" data-testid="auto-update-notification">
      <div className="w-80 rounded-xl border border-slate-700/80 bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${state === "downloaded" ? "bg-emerald-500/20" : "bg-blue-500/20"}`}>
              {state === "downloaded" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : state === "downloading" ? (
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
              ) : (
                <ArrowUpCircle className="w-4 h-4 text-blue-400" />
              )}
            </div>
            <span className="text-sm font-semibold text-white">
              {state === "available" && "Naya Update!"}
              {state === "downloading" && "Downloading..."}
              {state === "downloaded" && "Update Ready!"}
              {state === "error" && "Update Error"}
            </span>
          </div>
          {state !== "downloading" && (
            <button onClick={handleDismiss} className="p-1 rounded-md hover:bg-slate-700/50 transition-colors" data-testid="update-dismiss">
              <X className="w-3.5 h-3.5 text-slate-500" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="px-4 pb-3">
          {state === "available" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-slate-800/60 rounded-lg p-2.5">
                <div>
                  <p className="text-xs text-slate-500">Current</p>
                  <p className="text-sm text-slate-300 font-mono">v{info.currentVersion}</p>
                </div>
                <div className="flex items-center gap-1.5 text-blue-400">
                  <RefreshCw className="w-3.5 h-3.5" />
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">New</p>
                  <p className="text-sm text-emerald-400 font-mono font-bold">v{info.version}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleDismiss}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                  data-testid="update-later">
                  Baad Mein
                </button>
                <button onClick={handleDownload}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  data-testid="update-download">
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
              </div>
            </div>
          )}

          {state === "downloading" && (
            <div className="space-y-2">
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }} />
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">v{info.version} download ho raha hai...</span>
                <span className="text-blue-400 font-mono font-bold">{progress}%</span>
              </div>
            </div>
          )}

          {state === "downloaded" && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">v{info.version} download ho gaya! Restart karein install ke liye.</p>
              <div className="flex gap-2">
                <button onClick={handleDismiss}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                  data-testid="update-restart-later">
                  Baad Mein
                </button>
                <button onClick={handleInstall}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  data-testid="update-install">
                  <RefreshCw className="w-3.5 h-3.5" /> Restart
                </button>
              </div>
            </div>
          )}

          {state === "error" && (
            <p className="text-xs text-red-400">Update check mein error aaya. Baad mein try karein.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AutoUpdate;
