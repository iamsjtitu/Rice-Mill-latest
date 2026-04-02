import { useState, useEffect, useCallback } from "react";
import { Heart, RefreshCw, Monitor, Wifi } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

export default function SessionIndicator({ onDataRefresh }) {
  const [status, setStatus] = useState(null);
  const [lanInfo, setLanInfo] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/session-status`);
      if (res.ok) setStatus(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchLan = useCallback(async () => {
    if (!_isElectron) return;
    try {
      const res = await fetch(`${API}/lan-clients`);
      if (res.ok) setLanInfo(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchLan();
    const i1 = setInterval(fetchStatus, 30000);
    const i2 = setInterval(fetchLan, 15000);
    return () => { clearInterval(i1); clearInterval(i2); };
  }, [fetchStatus, fetchLan]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch(`${API}/data-refresh`, { method: "POST" });
      if (onDataRefresh) onDataRefresh();
    } catch { /* ignore */ }
    setTimeout(() => setRefreshing(false), 1000);
  };

  const activeOthers = status ? (status.others || []).filter(o => o.active) : [];
  const selfName = status?.self?.computer_name || "This PC";
  const lanClients = lanInfo?.lan_clients || [];
  const hasOthers = activeOthers.length > 0 || lanClients.length > 0;
  const totalCount = 1 + activeOthers.length + lanClients.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative flex items-center justify-center w-7 h-7 rounded-full hover:bg-black/5 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
          data-testid="session-indicator"
          title={hasOthers ? `${totalCount} computers connected` : "Sirf aap"}
        >
          <Heart
            className={`w-4 h-4 transition-colors ${
              hasOthers
                ? "text-red-500 fill-red-500/40 dark:text-red-400 dark:fill-red-400/30"
                : "text-gray-400 dark:text-slate-500"
            }`}
            style={hasOthers ? { animation: 'heartbeat 1s ease-in-out infinite' } : {}}
          />
          {hasOthers && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-[7px] font-bold text-white leading-none">
              {totalCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 p-2.5 shadow-lg" align="end">
        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Connected</span>
            <button
              onClick={handleRefresh}
              className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 transition-colors cursor-pointer"
              data-testid="session-refresh-btn"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Self */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30">
            <Monitor className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium truncate">{selfName}</p>
              <p className="text-[9px] text-amber-500/70 dark:text-amber-400/60 leading-tight">Ye computer</p>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
          </div>

          {/* Google Drive sessions */}
          {activeOthers.map((other, i) => (
            <div key={`gd-${i}`} className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/30">
              <Monitor className="w-3 h-3 text-green-600 dark:text-green-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-green-700 dark:text-green-300 font-medium truncate">{other.computer_name}</p>
                <p className="text-[9px] text-green-500/70 dark:text-green-400/60 leading-tight">
                  {other.minutes_ago < 1 ? "Abhi" : `${Math.round(other.minutes_ago)} min`}
                </p>
              </div>
              <Wifi className="w-3 h-3 text-green-500 dark:text-green-400 shrink-0 animate-pulse" />
            </div>
          ))}

          {/* LAN clients */}
          {lanClients.map((client, i) => (
            <div key={`lan-${i}`} className="flex items-center gap-1.5 px-2 py-1 rounded bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-700/30">
              <Monitor className="w-3 h-3 text-cyan-600 dark:text-cyan-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-cyan-700 dark:text-cyan-300 font-medium truncate">{client.ip}</p>
                <p className="text-[9px] text-cyan-500/70 dark:text-cyan-400/60 leading-tight">LAN Browser</p>
              </div>
              <Wifi className="w-3 h-3 text-cyan-500 dark:text-cyan-400 shrink-0" />
            </div>
          ))}

          {/* Footer */}
          {!hasOthers && (
            <p className="text-[9px] text-gray-400 dark:text-slate-500 text-center py-0.5">Koi aur connected nahi</p>
          )}
          {hasOthers && (
            <p className="text-[9px] text-amber-500 dark:text-amber-400/70 text-center py-0.5">
              Ek hi record dono jagah mat edit karo
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
