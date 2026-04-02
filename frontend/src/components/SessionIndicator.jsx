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

  // Google Drive session status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/session-status`);
      if (res.ok) setStatus(await res.json());
    } catch { /* ignore */ }
  }, []);

  // LAN clients (desktop/Electron only)
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

  // Build connected list
  const activeOthers = status ? (status.others || []).filter(o => o.active) : [];
  const selfName = status?.self?.computer_name || "This PC";
  const lanClients = lanInfo?.lan_clients || [];
  const hasOthers = activeOthers.length > 0 || lanClients.length > 0;
  const totalCount = 1 + activeOthers.length + lanClients.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative flex items-center justify-center w-8 h-8 rounded-full hover:bg-slate-700/60 transition-colors cursor-pointer"
          data-testid="session-indicator"
          title={hasOthers ? `${totalCount} computers connected` : "Sirf aap"}
        >
          <Heart
            className={`w-5 h-5 transition-colors ${
              hasOthers
                ? "text-red-400 fill-red-400/30"
                : "text-slate-400"
            }`}
            style={hasOthers ? { animation: 'heartbeat 1s ease-in-out infinite' } : {}}
          />
          {hasOthers && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
              {totalCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 bg-slate-800 border-slate-600 p-3" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Connected Computers</span>
            <button
              onClick={handleRefresh}
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
              data-testid="session-refresh-btn"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Self - always shown */}
          <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-amber-900/20 border border-amber-700/30">
            <Monitor className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-amber-300 font-medium truncate">{selfName}</p>
              <p className="text-[10px] text-amber-400/60">Ye computer (Host)</p>
            </div>
            <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
          </div>

          {/* Active Google Drive sessions */}
          {activeOthers.map((other, i) => (
            <div key={`gd-${i}`} className="flex items-center gap-2 px-2 py-1.5 rounded bg-green-900/20 border border-green-700/30">
              <Monitor className="w-4 h-4 text-green-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-green-300 font-medium truncate">{other.computer_name}</p>
                <p className="text-[10px] text-green-400/60">
                  {other.minutes_ago < 1 ? "Abhi active" : `${Math.round(other.minutes_ago)} min pehle`}
                </p>
              </div>
              <Wifi className="w-3.5 h-3.5 text-green-400 shrink-0 animate-pulse" />
            </div>
          ))}

          {/* LAN clients */}
          {lanClients.map((client, i) => (
            <div key={`lan-${i}`} className="flex items-center gap-2 px-2 py-1.5 rounded bg-cyan-900/20 border border-cyan-700/30">
              <Monitor className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-cyan-300 font-medium truncate">{client.ip}</p>
                <p className="text-[10px] text-cyan-400/60">LAN Browser</p>
              </div>
              <Wifi className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            </div>
          ))}

          {/* Summary */}
          {!hasOthers && (
            <p className="text-[11px] text-slate-500 text-center">Koi aur computer connected nahi hai</p>
          )}
          {hasOthers && (
            <p className="text-[10px] text-amber-400/70 text-center">
              Dhyan se - ek hi record dono jagah mat edit karo
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
