import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Badge } from "@/components/ui/badge";
import {
  Search, Truck, IndianRupee, Package, FileText, Users, Cog,
  ArrowRight, Eye, Calendar, Loader2, X, Fuel, Wrench, Handshake
} from "lucide-react";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

/* ─── Theme detection hook ─── */
function useTheme() {
  const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute('data-theme') !== 'light');
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.getAttribute('data-theme') !== 'light');
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return isDark;
}

const TYPE_CONFIG = {
  entry:            { icon: Truck,       label: "Mill Entries",   accent: "amber" },
  cash_transaction: { icon: IndianRupee, label: "Cash Book",      accent: "emerald" },
  private_paddy:    { icon: Package,     label: "Private Paddy",  accent: "blue" },
  sale_voucher:     { icon: FileText,    label: "Sale Vouchers",  accent: "purple" },
  purchase_voucher: { icon: FileText,    label: "Purchase Vouchers", accent: "pink" },
  dc_entry:         { icon: Truck,       label: "DC Tracker",     accent: "cyan" },
  staff:            { icon: Users,       label: "Staff",          accent: "orange" },
  milling:          { icon: Cog,         label: "Milling",        accent: "teal" },
  diesel:           { icon: Fuel,        label: "Diesel",         accent: "red" },
  mill_part:        { icon: Wrench,      label: "Mill Parts",     accent: "violet" },
  hemali:           { icon: Users,       label: "Hemali",         accent: "lime" },
  rice_sale:        { icon: Package,     label: "Rice Sales",     accent: "sky" },
  truck_lease:      { icon: Handshake,   label: "Truck Lease",    accent: "yellow" },
};

/* ─── Format label from snake_case ─── */
const fmtLabel = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/* ─── Format value ─── */
const fmtValue = (key, val) => {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    if (key.includes('amount') || key.includes('salary') || key === 'total' || key.includes('rent') || key.includes('paid') || key === 'balance')
      return `₹ ${val.toLocaleString('en-IN')}`;
    if (key.includes('kg') || key.includes('qntl') || key.includes('weight') || key.includes('wt'))
      return `${val.toLocaleString('en-IN')} ${key.includes('qntl') ? 'Q' : 'KG'}`;
    return val.toLocaleString('en-IN');
  }
  return String(val);
};

const HIDE_KEYS = new Set(['id', '_id', 'created_at', 'updated_at', '_v', 'kms_year', 'season']);

const isAmountKey = (key) => key.includes('amount') || key.includes('salary') || key === 'total' || key.includes('rent') || key.includes('paid') || key === 'balance';

export default function QuickSearch({ open, onOpenChange, onNavigate }) {
  const isDark = useTheme();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [previewItem, setPreviewItem] = useState(null);

  // Keep ref synced for closure access in onEscapeKeyDown
  useEffect(() => { previewRef.current = previewItem; }, [previewItem]);

  // Intercept ESC at document level BEFORE Radix Dialog captures it
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape' && previewRef.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setPreviewItem(null);
      }
    };
    document.addEventListener('keydown', handler, true); // capture phase
    return () => document.removeEventListener('keydown', handler, true);
  }, [open]);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const debounceRef = useRef(null);
  const previewRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery(""); setResults([]); setSelectedIdx(0); setPreviewItem(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 1) { setResults([]); return; }
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/quick-search`, { params: { q, limit: 8 } });
      setResults(data.results || []);
      setSelectedIdx(0);
    } catch (e) { setResults([]); }
    finally { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInputChange = (val) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 250);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && results[selectedIdx]) { e.preventDefault(); handleNavigate(results[selectedIdx]); }
    else if (e.key === "Escape") {
      if (previewItem) { e.preventDefault(); e.stopPropagation(); setPreviewItem(null); }
      else { onOpenChange(false); }
    }
    else if (e.key === "q" && e.ctrlKey && results[selectedIdx]) { e.preventDefault(); setPreviewItem(results[selectedIdx]); }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const handleNavigate = (item) => { onNavigate(item.tab, item.id, item.subtab, item); onOpenChange(false); };

  const grouped = {};
  results.forEach(r => { if (!grouped[r.type]) grouped[r.type] = []; grouped[r.type].push(r); });
  let flatIdx = 0;

  // Theme classes
  const dialogBg = isDark ? "bg-slate-900 border-slate-700" : "bg-slate-800 border-slate-600 shadow-2xl";
  const inputBorder = isDark ? "border-slate-700" : "border-slate-600";
  const inputText = isDark ? "text-white placeholder:text-slate-500" : "text-slate-100 placeholder:text-gray-400";
  const footerBorder = isDark ? "border-slate-700" : "border-slate-600";
  const kbdClass = isDark ? "bg-slate-800 border-slate-700 text-slate-500" : "bg-slate-700 border-slate-600 text-slate-400";

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v && previewRef.current) { setPreviewItem(null); return; }
      onOpenChange(v);
    }}>
      <DialogContent
        className={`p-0 ${dialogBg} max-w-2xl gap-0 overflow-hidden`}
        data-testid="quick-search-dialog"
        onEscapeKeyDown={(e) => { if (previewItem) { e.preventDefault(); setPreviewItem(null); } }}
      >
        <VisuallyHidden><DialogTitle>Quick Search</DialogTitle></VisuallyHidden>

        {/* Search bar */}
        <div className={`flex items-center border-b ${inputBorder} px-4 py-3 gap-3`}>
          <Search className={`w-5 h-5 shrink-0 ${isDark ? 'text-slate-400' : 'text-gray-400'}`} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search entries, parties, vouchers, staff..."
            className={`flex-1 bg-transparent text-base outline-none ${inputText}`}
            data-testid="quick-search-input"
          />
          {loading && <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />}
          <kbd className={`hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-mono rounded border ${kbdClass}`}>ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[420px] overflow-y-auto" data-testid="quick-search-results">
          {!query && (
            <div className="px-6 py-10 text-center">
              <Search className={`w-10 h-10 mx-auto mb-3 ${isDark ? 'text-slate-600' : 'text-gray-300'}`} />
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Type to search across all data</p>
              <p className={`text-xs mt-1 ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>Entries, Cash Book, Vouchers, Staff, Diesel, Milling...</p>
            </div>
          )}

          {query && !loading && results.length === 0 && (
            <div className="px-6 py-10 text-center">
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Koi result nahi mila "{query}"</p>
            </div>
          )}

          {Object.entries(grouped).map(([type, items]) => {
            const cfg = TYPE_CONFIG[type] || { icon: FileText, label: type, accent: "gray" };
            const Icon = cfg.icon;
            return (
              <div key={type} className="py-1">
                {/* Group header */}
                <div className="px-4 py-1.5 flex items-center gap-2">
                  <Icon className={`w-3.5 h-3.5 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
                  <span className={`text-xs font-medium uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                    {cfg.label}
                  </span>
                  <span className={`text-[10px] ${isDark ? 'text-slate-600' : 'text-gray-300'}`}>({items.length})</span>
                </div>
                {items.map((item) => {
                  const currentIdx = flatIdx++;
                  const isSelected = currentIdx === selectedIdx;
                  const selBg = isDark ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-300';
                  const hoverBg = isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-700';
                  return (
                    <div
                      key={item.id + '-' + currentIdx}
                      data-idx={currentIdx}
                      data-testid={`search-result-${item.type}-${item.id}`}
                      className={`mx-2 px-3 py-2 rounded-md cursor-pointer flex items-center gap-3 group transition-colors border ${
                        isSelected ? selBg : `${hoverBg} border-transparent`
                      }`}
                      onClick={() => handleNavigate(item)}
                      onMouseEnter={() => setSelectedIdx(currentIdx)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium truncate ${isSelected ? (isDark ? 'text-amber-300' : 'text-amber-700') : (isDark ? 'text-slate-200' : 'text-slate-200')}`}>
                            {item.title}
                          </span>
                          {item.date && (
                            <span className={`text-[10px] flex items-center gap-0.5 shrink-0 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                              <Calendar className="w-2.5 h-2.5" />{item.date}
                            </span>
                          )}
                        </div>
                        <p className={`text-xs truncate mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{item.subtitle}</p>
                      </div>
                      {/* Actions — visible on selected or hover */}
                      <div className={`flex items-center gap-1 shrink-0 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setPreviewItem(item); }}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${isDark ? 'hover:bg-slate-700 text-slate-400 hover:text-amber-400' : 'hover:bg-gray-200 text-gray-400 hover:text-amber-600'}`}
                          title="Quick View (Ctrl+Q)"
                          data-testid={`preview-btn-${item.id}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {isSelected && <span className={`text-[9px] font-mono ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Ctrl+Q</span>}
                        </button>
                        <button
                          onClick={() => handleNavigate(item)}
                          className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-slate-700 text-slate-400 hover:text-emerald-400' : 'hover:bg-gray-200 text-gray-400 hover:text-emerald-600'}`}
                          data-testid={`navigate-btn-${item.id}`}
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Keyboard hints */}
        {results.length > 0 && (
          <div className={`border-t ${footerBorder} px-4 py-2 flex items-center justify-between text-[10px] ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><kbd className={`px-1 rounded border text-[9px] ${kbdClass}`}>↑↓</kbd> Navigate</span>
              <span className="flex items-center gap-1"><kbd className={`px-1 rounded border text-[9px] ${kbdClass}`}>Enter</kbd> Open</span>
              <span className="flex items-center gap-1"><kbd className={`px-1 rounded border text-[9px] ${kbdClass}`}>Ctrl+Q</kbd> Quick View</span>
            </div>
            <span>{results.length} results</span>
          </div>
        )}

        {/* Preview Panel */}
        {previewItem && <PreviewPanel item={previewItem} onClose={() => setPreviewItem(null)} onNavigate={handleNavigate} isDark={isDark} />}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Preview Panel ─── */
function PreviewPanel({ item, onClose, onNavigate, isDark }) {
  const cfg = TYPE_CONFIG[item.type] || { icon: FileText, label: item.type, accent: "gray" };
  const Icon = cfg.icon;
  const data = item.data || {};
  const keys = Object.keys(data).filter(k => !HIDE_KEYS.has(k) && data[k] !== null && data[k] !== undefined && data[k] !== '');

  const panelBg = isDark ? 'bg-slate-900' : 'bg-slate-800';
  const headerBorder = isDark ? 'border-slate-700/80' : 'border-slate-600';
  const closeBtnStyle = isDark ? 'hover:bg-slate-700/80 text-slate-400 hover:text-white' : 'hover:bg-slate-700 text-gray-400 hover:text-slate-300';

  // Accent colors per type
  const accentMap = {
    amber:   { badge: isDark ? 'bg-amber-500/15 text-amber-400 border-amber-500/40' : 'bg-amber-50 text-amber-700 border-amber-200',
               iconBg: isDark ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200',
               iconText: isDark ? 'text-amber-400' : 'text-amber-600',
               btn: isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-amber-50 border-amber-300 text-amber-700' },
    emerald: { badge: isDark ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' : 'bg-emerald-50 text-emerald-700 border-emerald-200',
               iconBg: isDark ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200',
               iconText: isDark ? 'text-emerald-400' : 'text-emerald-600',
               btn: isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-300 text-emerald-700' },
    blue:    { badge: isDark ? 'bg-blue-500/15 text-blue-400 border-blue-500/40' : 'bg-blue-50 text-blue-700 border-blue-200',
               iconBg: isDark ? 'bg-blue-500/10 border-blue-500/30' : 'bg-blue-50 border-blue-200',
               iconText: isDark ? 'text-blue-400' : 'text-blue-600',
               btn: isDark ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-blue-50 border-blue-300 text-blue-700' },
    purple:  { badge: isDark ? 'bg-purple-500/15 text-purple-400 border-purple-500/40' : 'bg-purple-50 text-purple-700 border-purple-200',
               iconBg: isDark ? 'bg-purple-500/10 border-purple-500/30' : 'bg-purple-50 border-purple-200',
               iconText: isDark ? 'text-purple-400' : 'text-purple-600',
               btn: isDark ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' : 'bg-purple-50 border-purple-300 text-purple-700' },
    red:     { badge: isDark ? 'bg-red-500/15 text-red-400 border-red-500/40' : 'bg-red-50 text-red-700 border-red-200',
               iconBg: isDark ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200',
               iconText: isDark ? 'text-red-400' : 'text-red-600',
               btn: isDark ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-red-50 border-red-300 text-red-700' },
  };
  const fallback = accentMap.amber;
  const ac = accentMap[cfg.accent] || fallback;

  // Row colors for data grid
  const rowBg = isDark ? 'bg-slate-800/50 border-slate-700/40' : 'bg-slate-700 border-slate-600';
  const amountRowBg = isDark ? 'bg-emerald-900/15 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200';
  const labelColor = isDark ? 'text-slate-500' : 'text-gray-400';
  const valueColor = isDark ? 'text-slate-100' : 'text-slate-100';
  const amountColor = isDark ? 'text-emerald-300' : 'text-emerald-700';
  const dateColor = isDark ? 'text-blue-300' : 'text-blue-700';
  const typeColor = isDark ? 'text-amber-300' : 'text-amber-700';
  const subtitleColor = isDark ? 'text-slate-500' : 'text-gray-400';
  const kbdClass = isDark ? 'bg-slate-800 border-slate-700 text-slate-500' : 'bg-slate-700 border-slate-600 text-slate-400';

  const getValColor = (key) => {
    if (isAmountKey(key)) return amountColor;
    if (key.includes('date')) return dateColor;
    if (key.includes('type') || key.includes('status') || key.includes('account')) return typeColor;
    return valueColor;
  };

  return (
    <div className={`absolute inset-0 ${panelBg} z-10 flex flex-col`} data-testid="quick-search-preview">
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-3.5 border-b ${headerBorder}`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg border ${ac.iconBg}`}>
            <Icon className={`w-4 h-4 ${ac.iconText}`} />
          </div>
          <div>
            <Badge variant="outline" className={`${ac.badge} text-[10px] mb-0.5`}>{cfg.label}</Badge>
            <p className={`text-sm font-semibold truncate max-w-[350px] ${isDark ? 'text-white' : 'text-slate-100'}`}>{item.title}</p>
          </div>
        </div>
        <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${closeBtnStyle}`} data-testid="close-preview-btn">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content — clean rows */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-2 gap-2">
          {keys.map((key) => {
            const val = fmtValue(key, data[key]);
            if (!val) return null;
            const isAmt = isAmountKey(key);
            return (
              <div key={key} className={`rounded-lg px-3 py-2 border ${isAmt ? amountRowBg : rowBg}`}>
                <div className={`text-[9px] font-semibold uppercase tracking-widest mb-0.5 ${labelColor}`}>{fmtLabel(key)}</div>
                <div className={`text-sm font-semibold ${getValColor(key)}`}>{val}</div>
              </div>
            );
          })}
        </div>

        {/* Date & subtitle */}
        {item.date && (
          <div className={`mt-3 flex items-center gap-2 text-xs ${subtitleColor}`}>
            <Calendar className="w-3.5 h-3.5" />
            <span>{item.date}</span>
            {item.subtitle && <><span className={isDark ? 'text-slate-600' : 'text-gray-300'}>|</span><span className="truncate">{item.subtitle}</span></>}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={`border-t ${headerBorder} px-5 py-3 flex items-center justify-between`}>
        <button onClick={onClose} className={`text-xs flex items-center gap-1.5 transition-colors ${isDark ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-slate-300'}`}>
          <kbd className={`px-1.5 py-0.5 rounded border text-[9px] font-mono ${kbdClass}`}>ESC</kbd> Back
        </button>
        <button
          onClick={() => onNavigate(item)}
          className={`flex items-center gap-2 px-4 py-2 border text-xs font-semibold rounded-lg hover:brightness-110 transition-all ${ac.btn}`}
          data-testid="navigate-from-preview-btn"
        >
          Open in {cfg.label} <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
