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

  if (!status || !status.others || status.others.length === 0) return null;

  const activeOthers = status.others.filter(o => o.active);
  if (activeOthers.length === 0) return null;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2" data-testid="session-indicator">
        {activeOthers.map((other, i) => (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <Badge className="bg-green-600/20 text-green-400 border-green-500/30 text-[10px] gap-1 cursor-default" data-testid="session-active-badge">
                <Wifi className="w-3 h-3 animate-pulse" />
                <Monitor className="w-3 h-3" />
                {other.computer_name}
                <span className="text-green-300/60">({other.minutes_ago < 1 ? "abhi" : `${Math.round(other.minutes_ago)} min pehle`})</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="bg-slate-800 border-slate-600 text-white">
              <p>{other.computer_name} pe software active hai</p>
              <p className="text-amber-400 text-xs">Sirf dekho, entry mat karo</p>
            </TooltipContent>
          </Tooltip>
        ))}
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
