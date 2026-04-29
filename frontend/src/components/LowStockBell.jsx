import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Bell, AlertTriangle, PackageX, ChevronRight } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

const REFRESH_INTERVAL_MS = 60_000; // 1 minute

const LowStockBell = ({ filters, onNavigate }) => {
  const [alerts, setAlerts] = useState([]);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);

  const fetchAlerts = async () => {
    try {
      const params = {};
      if (filters?.kms_year) params.kms_year = filters.kms_year;
      if (filters?.season) params.season = filters.season;
      const res = await axios.get(`${API}/mill-parts/low-stock-alerts`, { params });
      const data = res.data || {};
      setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
      setCount(Number(data.count) || 0);
    } catch (e) {
      // Silent fail — bell just won't show count
      setAlerts([]);
      setCount(0);
    }
  };

  useEffect(() => {
    fetchAlerts();
    timerRef.current = setInterval(fetchAlerts, REFRESH_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters?.kms_year, filters?.season]);

  // Refresh when dropdown opens (user wants latest)
  useEffect(() => {
    if (open) fetchAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const outOfStock = alerts.filter(a => a.is_out_of_stock).length;
  const hasAlerts = count > 0;

  const handleViewAll = () => {
    setOpen(false);
    if (onNavigate) onNavigate("mill-parts");
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Low Stock Alerts"
          title={hasAlerts ? `${count} part(s) low/out of stock` : 'Mill Parts Stock OK'}
          data-testid="low-stock-bell-btn"
          className={`relative flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-lg border transition-colors
            ${hasAlerts
              ? 'border-red-600/60 text-red-400 hover:bg-red-900/30 animate-[pulse_2s_ease-in-out_infinite]'
              : 'border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}
        >
          <Bell className="w-4 h-4" />
          {hasAlerts && (
            <span
              data-testid="low-stock-bell-badge"
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-600 rounded-full ring-2 ring-slate-800"
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="bg-slate-800 border-slate-600 w-[340px] sm:w-[380px] p-0 max-h-[480px] overflow-hidden"
        data-testid="low-stock-bell-dropdown"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-900/60">
          <div className="flex items-center gap-2">
            <AlertTriangle className={`w-4 h-4 ${hasAlerts ? 'text-red-400' : 'text-emerald-400'}`} />
            <div>
              <p className="text-sm font-semibold text-white">Low Stock Alerts</p>
              <p className="text-[10px] text-slate-400">
                {hasAlerts
                  ? `${count} part(s)${outOfStock ? ` • ${outOfStock} out of stock` : ''}`
                  : 'Sab parts stock OK hain'}
              </p>
            </div>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">
            {filters?.kms_year || ''}{filters?.season ? ` • ${filters.season}` : ''}
          </span>
        </div>

        {/* List */}
        <div className="max-h-[340px] overflow-y-auto" data-testid="low-stock-bell-list">
          {!hasAlerts && (
            <div className="px-4 py-8 text-center" data-testid="low-stock-bell-empty">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-900/30 border border-emerald-700/40 mb-2">
                <Bell className="w-5 h-5 text-emerald-400" />
              </div>
              <p className="text-sm text-slate-300">Sab kuch theek hai!</p>
              <p className="text-[11px] text-slate-500 mt-1">Koi part low ya out of stock nahi hai.</p>
            </div>
          )}
          {hasAlerts && alerts.map((a, idx) => (
            <div
              key={`${a.part_name}-${idx}`}
              data-testid={`low-stock-item-${idx}`}
              className={`flex items-start gap-3 px-4 py-2.5 border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors
                ${a.is_out_of_stock ? 'bg-red-950/20' : ''}`}
            >
              <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
                ${a.is_out_of_stock ? 'bg-red-900/40 border border-red-700/40' : 'bg-amber-900/30 border border-amber-700/40'}`}>
                {a.is_out_of_stock
                  ? <PackageX className="w-4 h-4 text-red-400" />
                  : <AlertTriangle className="w-4 h-4 text-amber-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white truncate">{a.part_name}</p>
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0
                    ${a.is_out_of_stock ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'}`}>
                    {a.is_out_of_stock ? 'Out' : 'Low'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                  <span className={a.is_out_of_stock ? 'text-red-300 font-bold' : 'text-amber-300 font-bold'}>
                    {a.current_stock} {a.unit}
                  </span>
                  <span className="text-slate-600">/</span>
                  <span>Min: {a.min_stock} {a.unit}</span>
                </div>
                {(a.store_room_name || a.category) && (
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                    {a.store_room_name || 'Unassigned'}{a.category ? ` • ${a.category}` : ''}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700 bg-slate-900/60">
          <button
            type="button"
            onClick={handleViewAll}
            data-testid="low-stock-view-all-btn"
            className="w-full px-4 py-2.5 text-xs font-semibold text-amber-400 hover:bg-slate-700/40 flex items-center justify-center gap-1.5 transition-colors"
          >
            Mill Parts Stock kholein
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LowStockBell;
