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

const TYPE_CONFIG = {
  entry:            { icon: Truck,       label: "Mill Entries",   color: "text-amber-400 border-amber-500/40", bg: "bg-amber-500/10" },
  cash_transaction: { icon: IndianRupee, label: "Cash Book",      color: "text-emerald-400 border-emerald-500/40", bg: "bg-emerald-500/10" },
  private_paddy:    { icon: Package,     label: "Private Paddy",  color: "text-blue-400 border-blue-500/40", bg: "bg-blue-500/10" },
  sale_voucher:     { icon: FileText,    label: "Sale Vouchers",  color: "text-purple-400 border-purple-500/40", bg: "bg-purple-500/10" },
  purchase_voucher: { icon: FileText,    label: "Purchase Vouchers", color: "text-pink-400 border-pink-500/40", bg: "bg-pink-500/10" },
  dc_entry:         { icon: Truck,       label: "DC Tracker",     color: "text-cyan-400 border-cyan-500/40", bg: "bg-cyan-500/10" },
  staff:            { icon: Users,       label: "Staff",          color: "text-orange-400 border-orange-500/40", bg: "bg-orange-500/10" },
  milling:          { icon: Cog,         label: "Milling",        color: "text-teal-400 border-teal-500/40", bg: "bg-teal-500/10" },
  diesel:           { icon: Fuel,        label: "Diesel",         color: "text-red-400 border-red-500/40", bg: "bg-red-500/10" },
  mill_part:        { icon: Wrench,      label: "Mill Parts",     color: "text-violet-400 border-violet-500/40", bg: "bg-violet-500/10" },
  hemali:           { icon: Users,       label: "Hemali",         color: "text-lime-400 border-lime-500/40", bg: "bg-lime-500/10" },
  rice_sale:        { icon: Package,     label: "Rice Sales",     color: "text-sky-400 border-sky-500/40", bg: "bg-sky-500/10" },
  truck_lease:      { icon: Handshake,   label: "Truck Lease",    color: "text-yellow-400 border-yellow-500/40", bg: "bg-yellow-500/10" },
};

/* ─── Format a label from snake_case ─── */
const fmtLabel = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/* ─── Format value based on key name ─── */
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

/* ─── Color for value based on key ─── */
const valColor = (key) => {
  if (key.includes('amount') || key.includes('salary') || key === 'total' || key.includes('rent') || key.includes('paid') || key === 'balance')
    return 'text-emerald-300';
  if (key.includes('date')) return 'text-blue-300';
  if (key.includes('type') || key.includes('status') || key.includes('account')) return 'text-amber-300';
  return 'text-slate-100';
};

/* ─── Hidden fields in preview ─── */
const HIDE_KEYS = new Set(['id', '_id', 'created_at', 'updated_at', '_v', 'kms_year', 'season']);

export default function QuickSearch({ open, onOpenChange, onNavigate }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [previewItem, setPreviewItem] = useState(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
      setPreviewItem(null);
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
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (val) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 250);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIdx]) {
      e.preventDefault();
      handleNavigate(results[selectedIdx]);
    } else if (e.key === "Escape") {
      if (previewItem) setPreviewItem(null);
      else onOpenChange(false);
    } else if (e.key === "q" && e.ctrlKey && results[selectedIdx]) {
      e.preventDefault();
      setPreviewItem(results[selectedIdx]);
    }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const handleNavigate = (item) => {
    onNavigate(item.tab, item.id, item.subtab);
    onOpenChange(false);
  };

  // Group results
  const grouped = {};
  results.forEach(r => {
    if (!grouped[r.type]) grouped[r.type] = [];
    grouped[r.type].push(r);
  });

  let flatIdx = 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 bg-slate-900 border-slate-700 max-w-2xl gap-0 overflow-hidden"
        data-testid="quick-search-dialog"
      >
        <VisuallyHidden><DialogTitle>Quick Search</DialogTitle></VisuallyHidden>

        {/* Search Input */}
        <div className="flex items-center border-b border-slate-700 px-4 py-3 gap-3">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search entries, parties, vouchers, staff..."
            className="flex-1 bg-transparent text-white text-base outline-none placeholder:text-slate-500"
            data-testid="quick-search-input"
          />
          {loading && <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />}
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-mono text-slate-500 bg-slate-800 border border-slate-700 rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[420px] overflow-y-auto" data-testid="quick-search-results">
          {!query && (
            <div className="px-6 py-10 text-center">
              <Search className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Type to search across all data</p>
              <p className="text-slate-600 text-xs mt-1">Entries, Cash Book, Vouchers, Staff, Diesel, Milling...</p>
            </div>
          )}

          {query && !loading && results.length === 0 && (
            <div className="px-6 py-10 text-center">
              <p className="text-slate-400 text-sm">Koi result nahi mila "{query}"</p>
              <p className="text-slate-600 text-xs mt-1">Alag keyword try karein</p>
            </div>
          )}

          {Object.entries(grouped).map(([type, items]) => {
            const cfg = TYPE_CONFIG[type] || { icon: FileText, label: type, color: "text-slate-400 border-slate-600", bg: "bg-slate-600/20" };
            const Icon = cfg.icon;
            return (
              <div key={type} className="py-1">
                <div className="px-4 py-1.5 flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{cfg.label}</span>
                  <span className="text-[10px] text-slate-600">({items.length})</span>
                </div>
                {items.map((item) => {
                  const currentIdx = flatIdx++;
                  const isSelected = currentIdx === selectedIdx;
                  return (
                    <div
                      key={item.id + '-' + currentIdx}
                      data-idx={currentIdx}
                      data-testid={`search-result-${item.type}-${item.id}`}
                      className={`mx-2 px-3 py-2 rounded-md cursor-pointer flex items-center gap-3 group transition-colors ${
                        isSelected ? "bg-amber-500/10 border border-amber-500/30" : "hover:bg-slate-800 border border-transparent"
                      }`}
                      onClick={() => handleNavigate(item)}
                      onMouseEnter={() => setSelectedIdx(currentIdx)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium truncate ${isSelected ? 'text-amber-300' : 'text-slate-200'}`}>
                            {item.title}
                          </span>
                          {item.date && (
                            <span className="text-[10px] text-slate-500 flex items-center gap-0.5 shrink-0">
                              <Calendar className="w-2.5 h-2.5" />
                              {item.date}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 truncate mt-0.5">{item.subtitle}</p>
                      </div>
                      {/* Action buttons — visible on hover AND when selected via keyboard */}
                      <div className={`flex items-center gap-1 shrink-0 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setPreviewItem(item); }}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-700 text-slate-400 hover:text-amber-400 transition-colors"
                          title="Quick View (Ctrl+Q)"
                          data-testid={`preview-btn-${item.id}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {isSelected && <span className="text-[9px] text-slate-500 font-mono">Ctrl+Q</span>}
                        </button>
                        <button
                          onClick={() => handleNavigate(item)}
                          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-colors"
                          title="Go to Tab"
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

        {/* Footer */}
        {results.length > 0 && (
          <div className="border-t border-slate-700 px-4 py-2 flex items-center justify-between text-[10px] text-slate-500">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><kbd className="px-1 bg-slate-800 rounded border border-slate-700 text-[9px]">↑↓</kbd> Navigate</span>
              <span className="flex items-center gap-1"><kbd className="px-1 bg-slate-800 rounded border border-slate-700 text-[9px]">Enter</kbd> Open</span>
              <span className="flex items-center gap-1"><kbd className="px-1 bg-slate-800 rounded border border-slate-700 text-[9px]">Ctrl+Q</kbd> Quick View</span>
            </div>
            <span>{results.length} results</span>
          </div>
        )}

        {/* ─── Preview Panel (Redesigned) ─── */}
        {previewItem && (
          <PreviewPanel item={previewItem} onClose={() => setPreviewItem(null)} onNavigate={handleNavigate} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Beautiful Preview Panel Component ─── */
function PreviewPanel({ item, onClose, onNavigate }) {
  const cfg = TYPE_CONFIG[item.type] || { icon: FileText, label: item.type, color: "text-slate-400 border-slate-600", bg: "bg-slate-600/10" };
  const Icon = cfg.icon;
  const data = item.data || {};
  const keys = Object.keys(data).filter(k => !HIDE_KEYS.has(k) && data[k] !== null && data[k] !== undefined && data[k] !== '');

  return (
    <div className="absolute inset-0 bg-slate-900/98 backdrop-blur-md z-10 flex flex-col" data-testid="quick-search-preview">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700/80">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${cfg.bg} border ${cfg.color.split(' ')[1]}`}>
            <Icon className={`w-4 h-4 ${cfg.color.split(' ')[0]}`} />
          </div>
          <div>
            <Badge variant="outline" className={`${cfg.color} text-[10px] mb-0.5`}>
              {cfg.label}
            </Badge>
            <p className="text-sm font-semibold text-white truncate max-w-[350px]">{item.title}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-slate-700/80 text-slate-400 hover:text-white transition-colors"
          data-testid="close-preview-btn"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-2 gap-2.5">
          {keys.map((key) => {
            const val = fmtValue(key, data[key]);
            if (!val) return null;
            const isAmount = key.includes('amount') || key.includes('salary') || key === 'total' || key.includes('rent') || key.includes('paid') || key === 'balance';
            return (
              <div
                key={key}
                className={`rounded-lg px-3 py-2.5 border transition-colors ${
                  isAmount
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-slate-800/40 border-slate-700/40'
                }`}
              >
                <div className="text-[9px] font-medium text-slate-500 uppercase tracking-widest mb-1">{fmtLabel(key)}</div>
                <div className={`text-sm font-semibold ${valColor(key)}`}>{val}</div>
              </div>
            );
          })}
        </div>

        {/* Date & subtitle strip */}
        {item.date && (
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <Calendar className="w-3.5 h-3.5" />
            <span>{item.date}</span>
            {item.subtitle && <span className="text-slate-600">|</span>}
            {item.subtitle && <span className="text-slate-500 truncate">{item.subtitle}</span>}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-700/80 px-5 py-3 flex items-center justify-between">
        <button
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
        >
          <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-[9px] font-mono">ESC</kbd>
          Back
        </button>
        <button
          onClick={() => onNavigate(item)}
          className={`flex items-center gap-2 px-4 py-2 ${cfg.bg} border ${cfg.color.split(' ')[1]} ${cfg.color.split(' ')[0]} text-xs font-semibold rounded-lg hover:brightness-125 transition-all`}
          data-testid="navigate-from-preview-btn"
        >
          Open in {cfg.label} <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
