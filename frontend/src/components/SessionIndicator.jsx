import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Monitor, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const API = process.env.REACT_APP_BACKEND_URL;

export default function SessionIndicator({ onDataRefresh }) {
  const [status, setStatus] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/session-status`);
      if (res.ok) setStatus(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch(`${API}/api/data-refresh`, { method: "POST" });
      if (onDataRefresh) onDataRefresh();
    } catch { /* ignore */ }
    setTimeout(() => setRefreshing(false), 1000);
  };

  if (!status) return null;

  const activeOthers = (status.others || []).filter(o => o.active);
  const selfName = status.self?.computer_name || "This PC";

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2" data-testid="session-indicator">
        {/* Self indicator - always visible */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              className={`text-[10px] gap-1 cursor-default ${
                activeOthers.length > 0
                  ? "bg-amber-600/20 text-amber-400 border-amber-500/30"
                  : "bg-emerald-600/20 text-emerald-400 border-emerald-500/30"
              }`}
              data-testid="session-self-badge"
            >
              <Monitor className="w-3 h-3" />
              {activeOthers.length > 0 ? selfName : "Only You"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="bg-slate-800 border-slate-600 text-white">
            {activeOthers.length > 0
              ? <p>{activeOthers.length} aur computer(s) active hai</p>
              : <p>Sirf aapka computer active hai</p>
            }
          </TooltipContent>
        </Tooltip>

        {/* Other active computers */}
        {activeOthers.map((other, i) => (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <Badge className="bg-green-600/20 text-green-400 border-green-500/30 text-[10px] gap-1 cursor-default" data-testid="session-active-badge">
                <Wifi className="w-3 h-3 animate-pulse" />
                <Monitor className="w-3 h-3" />
                {other.computer_name}
                <span className="text-green-300/60">({other.minutes_ago < 1 ? "abhi" : `${Math.round(other.minutes_ago)} min`})</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="bg-slate-800 border-slate-600 text-white">
              <p>{other.computer_name} pe software active hai</p>
              <p className="text-amber-400 text-xs">Dhyan se - dono jagah entry mat karo</p>
            </TooltipContent>
          </Tooltip>
        ))}

        {/* Inactive/stale computers */}
        {(status.others || []).filter(o => !o.active && o.minutes_ago < 60).map((other, i) => (
          <Tooltip key={`inactive-${i}`}>
            <TooltipTrigger asChild>
              <Badge className="bg-slate-600/20 text-slate-400 border-slate-500/30 text-[10px] gap-1 cursor-default" data-testid="session-inactive-badge">
                <WifiOff className="w-3 h-3" />
                {other.computer_name}
                <span className="text-slate-500">({Math.round(other.minutes_ago)} min)</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="bg-slate-800 border-slate-600 text-white">
              <p>{other.computer_name} {Math.round(other.minutes_ago)} min pehle active tha</p>
            </TooltipContent>
          </Tooltip>
        ))}

        {/* Refresh button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              className="h-6 w-6 p-0 text-slate-400 hover:text-amber-400 hover:bg-slate-700"
              data-testid="session-refresh-btn"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="bg-slate-800 border-slate-600 text-white">
            Data Refresh karo
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
