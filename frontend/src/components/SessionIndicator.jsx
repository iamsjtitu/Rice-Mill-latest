import { useState, useEffect, useCallback } from "react";
import { Heart, RefreshCw, Monitor, Wifi } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

export default function SessionIndicator({ onDataRefresh }) {
  const [status, setStatus] = useState(null);
  const [lanInfo, setLanInfo] = useState(null);
  const [syncInfo, setSyncInfo] = useState(null);
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

  const fetchSync = useCallback(async () => {
    try {
      const res = await fetch(`${API}/sync-status`);
      if (res.ok) setSyncInfo(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchLan();
    fetchSync();
    const i1 = setInterval(fetchStatus, 30000);
    const i2 = setInterval(fetchLan, 15000);
    const i3 = setInterval(fetchSync, 15000);
    return () => { clearInterval(i1); clearInterval(i2); clearInterval(i3); };
  }, [fetchStatus, fetchLan, fetchSync]);

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
  const browserSessions = lanInfo?.browser_clients || [];
  const hasOthers = activeOthers.length > 0 || lanClients.length > 0 || browserSessions.length > 0;
  const totalCount = 1 + activeOthers.length + lanClients.length + browserSessions.length;

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
      <PopoverContent className="w-48 bg-slate-800 dark:bg-slate-800 border-slate-600 dark:border-slate-600 p-2 shadow-lg" align="end">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Connected</span>
            <button
              onClick={handleRefresh}
              className="p-0.5 rounded hover:bg-slate-700 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 transition-colors cursor-pointer"
              data-testid="session-refresh-btn"
            >
              <RefreshCw className={`w-2.5 h-2.5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Self */}
          <div className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200/80 dark:border-amber-700/30">
            <Monitor className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-[10px] text-amber-700 dark:text-amber-300 font-bold truncate flex-1">{selfName}</p>
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
          </div>

          {/* Google Drive sessions */}
          {activeOthers.map((other, i) => (
            <div key={`gd-${i}`} className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-green-50 dark:bg-green-900/20 border border-green-200/80 dark:border-green-700/30">
              <Monitor className="w-2.5 h-2.5 text-green-600 dark:text-green-400 shrink-0" />
              <p className="text-[10px] text-green-700 dark:text-green-300 font-bold truncate flex-1">{other.computer_name}</p>
              <span className="text-[8px] text-green-500/70 dark:text-green-400/60 shrink-0">
                {other.minutes_ago < 1 ? "now" : `${Math.round(other.minutes_ago)}m`}
              </span>
            </div>
          ))}

          {/* LAN clients */}
          {lanClients.map((client, i) => (
            <div key={`lan-${i}`} className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200/80 dark:border-cyan-700/30">
              <Wifi className="w-2.5 h-2.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
              <p className="text-[10px] text-cyan-700 dark:text-cyan-300 font-bold truncate flex-1">{client.ip}</p>
              <span className="text-[8px] text-cyan-500/70 shrink-0">LAN</span>
            </div>
          ))}

          {/* Browser sessions on same PC */}
          {browserSessions.map((b, i) => (
            <div key={`br-${i}`} className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-purple-50 dark:bg-purple-900/20 border border-purple-200/80 dark:border-purple-700/30">
              <Monitor className="w-2.5 h-2.5 text-purple-600 dark:text-purple-400 shrink-0" />
              <p className="text-[10px] text-purple-700 dark:text-purple-300 font-bold truncate flex-1">Browser</p>
              <span className="text-[8px] text-purple-500/70 dark:text-purple-400/60 shrink-0">
                {b.minutes_ago < 1 ? "now" : `${Math.round(b.minutes_ago)}m`}
              </span>
            </div>
          ))}

          {/* Footer */}
          {!hasOthers && (
            <p className="text-[8px] text-gray-400 dark:text-slate-500 text-center">Sirf aap</p>
          )}
          {hasOthers && (
            <p className="text-[8px] text-amber-500/80 dark:text-amber-400/60 text-center">
              Same record dono jagah mat edit karo
            </p>
          )}

          {/* Data Sync Status */}
          {syncInfo && (
            <>
              <div className="border-t border-slate-600 dark:border-slate-600 my-1" />
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Data Sync</span>
              <div className="px-1.5 py-1 rounded bg-slate-700 dark:bg-slate-700/50 border border-slate-600/80 dark:border-slate-600/50 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-slate-400 dark:text-slate-400">Entries</span>
                  <span className="text-[9px] font-bold text-slate-300 dark:text-slate-200">{syncInfo.entries || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-slate-400 dark:text-slate-400">Vehicle Wt</span>
                  <span className="text-[9px] font-bold text-slate-300 dark:text-slate-200">{syncInfo.vehicle_weights || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-slate-400 dark:text-slate-400">Cash Txns</span>
                  <span className="text-[9px] font-bold text-slate-300 dark:text-slate-200">{syncInfo.cash_transactions || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-slate-400 dark:text-slate-400">Last Save</span>
                  <span className="text-[9px] font-bold text-green-600 dark:text-green-400">
                    {syncInfo.last_save ? new Date(syncInfo.last_save).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-slate-400 dark:text-slate-400">Engine</span>
                  <span className="text-[9px] font-mono text-slate-400 dark:text-slate-300">{syncInfo.engine || '?'}</span>
                </div>
                {syncInfo.pending_save && (
                  <p className="text-[8px] text-amber-500 animate-pulse text-center">Saving...</p>
                )}
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
