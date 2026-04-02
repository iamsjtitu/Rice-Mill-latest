import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Badge } from "@/components/ui/badge";
import {
  Search, Truck, IndianRupee, Package, FileText, Users, Cog,
  ArrowRight, Eye, Calendar, Loader2, X
} from "lucide-react";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

const TYPE_CONFIG = {
  entry:            { icon: Truck,       label: "Mill Entries",   color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  cash_transaction: { icon: IndianRupee, label: "Cash Book",      color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  private_paddy:    { icon: Package,     label: "Private Paddy",  color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  sale_voucher:     { icon: FileText,    label: "Sale Vouchers",  color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  purchase_voucher: { icon: FileText,    label: "Purchase Vouchers", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
  dc_entry:         { icon: Truck,       label: "DC Tracker",     color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  staff:            { icon: Users,       label: "Staff",          color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  milling:          { icon: Cog,         label: "Milling",        color: "bg-teal-500/20 text-teal-400 border-teal-500/30" },
  diesel:           { icon: Truck,       label: "Diesel",         color: "bg-red-500/20 text-red-400 border-red-500/30" },
  mill_part:        { icon: Cog,         label: "Mill Parts",     color: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
  hemali:           { icon: Users,       label: "Hemali",         color: "bg-lime-500/20 text-lime-400 border-lime-500/30" },
  rice_sale:        { icon: Package,     label: "Rice Sales",     color: "bg-sky-500/20 text-sky-400 border-sky-500/30" },
  truck_lease:      { icon: Truck,       label: "Truck Lease",    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
};

export default function QuickSearch({ open, onOpenChange, onNavigate }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [previewItem, setPreviewItem] = useState(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const debounceRef = useRef(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
      setPreviewItem(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Debounced search
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

  // Keyboard nav
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
    }
  };

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const handleNavigate = (item) => {
    onNavigate(item.tab, item.id);
    onOpenChange(false);
  };

  // Group results by type
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
            const cfg = TYPE_CONFIG[type] || { icon: FileText, label: type, color: "bg-slate-600/20 text-slate-400" };
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
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); setPreviewItem(item); }}
                          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-amber-400 transition-colors"
                          title="Quick View"
                          data-testid={`preview-btn-${item.id}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
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
              <span className="flex items-center gap-1"><kbd className="px-1 bg-slate-800 rounded border border-slate-700 text-[9px]">Up/Down</kbd> Navigate</span>
              <span className="flex items-center gap-1"><kbd className="px-1 bg-slate-800 rounded border border-slate-700 text-[9px]">Enter</kbd> Open</span>
            </div>
            <span>{results.length} results</span>
          </div>
        )}

        {/* Preview Panel */}
        {previewItem && (
          <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-sm z-10 flex flex-col" data-testid="quick-search-preview">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={TYPE_CONFIG[previewItem.type]?.color || "border-slate-600"}>
                  {TYPE_CONFIG[previewItem.type]?.label || previewItem.type}
                </Badge>
                <span className="text-sm font-medium text-white">{previewItem.title}</span>
              </div>
              <button onClick={() => setPreviewItem(null)} className="p-1 rounded hover:bg-slate-700 text-slate-400" data-testid="close-preview-btn">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-3">
                {previewItem.data && Object.entries(previewItem.data).map(([key, val]) => {
                  if (key === 'id' || val === null || val === undefined || val === '') return null;
                  const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                  const displayVal = typeof val === 'number'
                    ? (key.includes('amount') || key.includes('salary') || key === 'total' || key === 'kg' || key === 'qntl' || key.includes('rent'))
                      ? `Rs. ${val.toLocaleString('en-IN')}`
                      : val.toLocaleString('en-IN')
                    : String(val);
                  return (
                    <div key={key} className="bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-700/50">
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
                      <div className="text-sm text-slate-200 font-medium truncate">{displayVal}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-slate-700 px-4 py-2.5 flex items-center justify-between">
              <button onClick={() => setPreviewItem(null)} className="text-xs text-slate-400 hover:text-white transition-colors">
                Back to results
              </button>
              <button
                onClick={() => handleNavigate(previewItem)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-medium rounded-md transition-colors"
                data-testid="navigate-from-preview-btn"
              >
                Open in {TYPE_CONFIG[previewItem.type]?.label || previewItem.tab} <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
