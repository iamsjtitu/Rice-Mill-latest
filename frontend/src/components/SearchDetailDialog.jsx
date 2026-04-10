import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Truck, IndianRupee, Package, FileText, Users, Cog,
  ArrowRight, Calendar, Fuel, Wrench, Handshake, X
} from "lucide-react";

const TYPE_CONFIG = {
  entry:            { icon: Truck,       label: "Mill Entry",         accent: "amber" },
  cash_transaction: { icon: IndianRupee, label: "Cash Book",          accent: "emerald" },
  private_paddy:    { icon: Package,     label: "Private Paddy",      accent: "blue" },
  sale_voucher:     { icon: FileText,    label: "Sale Voucher",       accent: "purple" },
  purchase_voucher: { icon: FileText,    label: "Purchase Voucher",   accent: "pink" },
  dc_entry:         { icon: Truck,       label: "DC Tracker",         accent: "cyan" },
  staff:            { icon: Users,       label: "Staff",              accent: "orange" },
  milling:          { icon: Cog,         label: "Milling",            accent: "teal" },
  diesel:           { icon: Fuel,        label: "Diesel",             accent: "red" },
  mill_part:        { icon: Wrench,      label: "Mill Parts",         accent: "violet" },
  hemali:           { icon: Users,       label: "Hemali",             accent: "lime" },
  rice_sale:        { icon: Package,     label: "Rice Sale",          accent: "sky" },
  truck_lease:      { icon: Handshake,   label: "Truck Lease",        accent: "yellow" },
};

const HIDE_KEYS = new Set(['id', '_id', 'created_at', 'updated_at', '_v', 'kms_year', 'season']);

const fmtLabel = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const isAmountKey = (key) => key.includes('amount') || key.includes('salary') || key === 'total' || key.includes('rent') || key.includes('paid') || key === 'balance';

const fmtValue = (key, val) => {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    if (isAmountKey(key)) return `₹ ${val.toLocaleString('en-IN')}`;
    if (key.includes('kg') || key.includes('qntl') || key.includes('weight') || key.includes('wt'))
      return `${val.toLocaleString('en-IN')} ${key.includes('qntl') ? 'Q' : 'KG'}`;
    return val.toLocaleString('en-IN');
  }
  return String(val);
};

const ACCENT_COLORS = {
  amber:   { badge: 'bg-amber-500/15 text-amber-400 border-amber-500/40',   iconBg: 'bg-amber-500/10', iconText: 'text-amber-400' },
  emerald: { badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40', iconBg: 'bg-emerald-500/10', iconText: 'text-emerald-400' },
  blue:    { badge: 'bg-blue-500/15 text-blue-400 border-blue-500/40',      iconBg: 'bg-blue-500/10', iconText: 'text-blue-400' },
  purple:  { badge: 'bg-purple-500/15 text-purple-400 border-purple-500/40', iconBg: 'bg-purple-500/10', iconText: 'text-purple-400' },
  pink:    { badge: 'bg-pink-500/15 text-pink-400 border-pink-500/40',      iconBg: 'bg-pink-500/10', iconText: 'text-pink-400' },
  cyan:    { badge: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40',      iconBg: 'bg-cyan-500/10', iconText: 'text-cyan-400' },
  orange:  { badge: 'bg-orange-500/15 text-orange-400 border-orange-500/40', iconBg: 'bg-orange-500/10', iconText: 'text-orange-400' },
  teal:    { badge: 'bg-teal-500/15 text-teal-400 border-teal-500/40',      iconBg: 'bg-teal-500/10', iconText: 'text-teal-400' },
  red:     { badge: 'bg-red-500/15 text-red-400 border-red-500/40',         iconBg: 'bg-red-500/10', iconText: 'text-red-400' },
  violet:  { badge: 'bg-violet-500/15 text-violet-400 border-violet-500/40', iconBg: 'bg-violet-500/10', iconText: 'text-violet-400' },
  lime:    { badge: 'bg-lime-500/15 text-lime-400 border-lime-500/40',      iconBg: 'bg-lime-500/10', iconText: 'text-lime-400' },
  sky:     { badge: 'bg-sky-500/15 text-sky-400 border-sky-500/40',         iconBg: 'bg-sky-500/10', iconText: 'text-sky-400' },
  yellow:  { badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40', iconBg: 'bg-yellow-500/10', iconText: 'text-yellow-400' },
};

export default function SearchDetailDialog({ item, onClose, onGoToTab }) {
  if (!item) return null;

  const cfg = TYPE_CONFIG[item.type] || { icon: FileText, label: item.type, accent: "amber" };
  const Icon = cfg.icon;
  const ac = ACCENT_COLORS[cfg.accent] || ACCENT_COLORS.amber;
  const data = item.data || {};
  const keys = Object.keys(data).filter(k => !HIDE_KEYS.has(k) && data[k] !== null && data[k] !== undefined && data[k] !== '');

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-lg p-0 gap-0 overflow-hidden" data-testid="search-detail-dialog">
        {/* Header */}
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-slate-700/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${ac.iconBg}`}>
                <Icon className={`w-5 h-5 ${ac.iconText}`} />
              </div>
              <div>
                <Badge variant="outline" className={`${ac.badge} text-[10px] mb-1`}>{cfg.label}</Badge>
                <DialogTitle className="text-sm font-semibold text-white">{item.title}</DialogTitle>
              </div>
            </div>
          </div>
          {item.date && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1 pl-[52px]">
              <Calendar className="w-3 h-3" /> {item.date}
              {item.subtitle && <span className="text-slate-600 ml-1">|</span>}
              {item.subtitle && <span className="truncate text-slate-400">{item.subtitle}</span>}
            </div>
          )}
        </DialogHeader>

        {/* Data Grid */}
        <div className="px-5 py-4 max-h-[400px] overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            {keys.map((key) => {
              const val = fmtValue(key, data[key]);
              if (!val) return null;
              const isAmt = isAmountKey(key);
              return (
                <div
                  key={key}
                  className={`rounded-lg px-3 py-2.5 border ${
                    isAmt ? 'bg-emerald-900/15 border-emerald-500/20' : 'bg-slate-800/50 border-slate-700/40'
                  }`}
                >
                  <div className="text-[9px] font-semibold uppercase tracking-widest mb-0.5 text-slate-500">{fmtLabel(key)}</div>
                  <div className={`text-sm font-semibold ${
                    isAmt ? 'text-emerald-300' : key.includes('date') ? 'text-blue-300' : 'text-slate-100'
                  }`}>{val}</div>
                </div>
              );
            })}
          </div>
          {keys.length === 0 && (
            <p className="text-center text-slate-500 text-sm py-6">Koi data available nahi hai</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700/80 px-5 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-white hover:bg-slate-800" data-testid="search-detail-close-btn">
            <X className="w-3.5 h-3.5 mr-1.5" /> Band karein
          </Button>
          <Button
            size="sm"
            onClick={() => { onGoToTab(item); onClose(); }}
            className="bg-amber-600 hover:bg-amber-500 text-white"
            data-testid="search-detail-goto-btn"
          >
            {cfg.label} mein dekhein <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
