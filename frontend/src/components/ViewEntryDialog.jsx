import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Truck, MapPin, User, Calendar, Wheat, Weight, Droplets, Scissors, CircleDollarSign } from "lucide-react";
import { fmtDate } from "@/utils/date";

function InfoCard({ icon: Icon, title, children, color = "amber" }) {
  const borderColors = { amber: "border-amber-500/30", green: "border-green-500/30", blue: "border-blue-500/30", orange: "border-orange-500/30", purple: "border-purple-500/30", cyan: "border-cyan-500/30", pink: "border-pink-500/30" };
  const bgColors = { amber: "bg-amber-500/5", green: "bg-green-500/5", blue: "bg-blue-500/5", orange: "bg-orange-500/5", purple: "bg-purple-500/5", cyan: "bg-cyan-500/5", pink: "bg-pink-500/5" };
  const iconColors = { amber: "text-amber-400", green: "text-green-400", blue: "text-blue-400", orange: "text-orange-400", purple: "text-purple-400", cyan: "text-cyan-400", pink: "text-pink-400" };
  return (
    <div className={`rounded-lg border ${borderColors[color]} ${bgColors[color]} p-3`}>
      <div className="flex items-center gap-2 mb-2.5">
        {Icon && <Icon className={`w-4 h-4 ${iconColors[color]}`} />}
        <h4 className={`text-xs font-semibold uppercase tracking-wider ${iconColors[color]}`}>{title}</h4>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Val({ label, value, color, large, mono }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-slate-500 text-xs whitespace-nowrap">{label}</span>
      <span className={`text-right ${color || 'text-slate-200'} ${large ? 'text-base font-bold' : 'text-sm'} ${mono ? 'font-mono' : ''}`}>
        {value || value === 0 ? value : '-'}
      </span>
    </div>
  );
}

export default function ViewEntryDialog({ entry, onClose }) {
  useEffect(() => {
    if (!entry) return;
    const handleKey = (e) => {
      if (e.key === "Escape") {
        // Don't close dialog if a photo/camera zoom is open - let zoom handler close first
        const zoomOpen = document.querySelector('[data-testid="photo-zoom-overlay"], [data-testid="camera-zoom-overlay"], [data-testid="awe-photo-zoom-overlay"]');
        if (zoomOpen) return;
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [entry, onClose]);

  if (!entry) return null;

  const q = (v) => ((v || 0) / 100).toFixed(2);
  const rs = (v) => v ? `Rs. ${Number(v).toLocaleString('en-IN')}` : '-';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} data-testid="view-entry-dialog">
      <div className="bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-600/50 rounded-2xl shadow-2xl shadow-black/40 w-[95vw] max-w-[720px] max-h-[88vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60 bg-slate-800/80">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <Truck className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-white font-bold text-lg tracking-tight">{entry.truck_no}</h2>
                <p className="text-slate-400 text-xs">{fmtDate(entry.date)} &middot; {entry.kms_year} &middot; {entry.season}</p>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 rounded-full text-slate-400 hover:text-white hover:bg-slate-700" data-testid="view-dialog-close">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Identity */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-700/40 rounded-lg p-2.5 text-center">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">RST No</p>
              <p className="text-white font-mono font-bold text-sm">{entry.rst_no || '-'}</p>
            </div>
            <div className="bg-slate-700/40 rounded-lg p-2.5 text-center">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">TP No</p>
              <p className="text-white font-mono font-bold text-sm">{entry.tp_no || '-'}</p>
            </div>
            <div className="bg-slate-700/40 rounded-lg p-2.5 text-center">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">Agent</p>
              <p className="text-white font-semibold text-sm truncate">{entry.agent_name || '-'}</p>
            </div>
            <div className="bg-slate-700/40 rounded-lg p-2.5 text-center">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">Mandi</p>
              <p className="text-white font-semibold text-sm truncate">{entry.mandi_name || '-'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Weight Section */}
            <InfoCard icon={Weight} title="Weight Details" color="green">
              <Val label="QNTL" value={entry.qntl?.toFixed(2)} color="text-green-400" large mono />
              <Val label="Bags" value={entry.bag} mono />
              <Val label="KG" value={entry.kg} mono />
              <Val label="G.Deposite" value={entry.g_deposite} color="text-cyan-400" mono />
              <Val label="G.Issued" value={entry.g_issued?.toLocaleString()} color="text-cyan-400" mono />
            </InfoCard>

            {/* Cuts Section */}
            <InfoCard icon={Scissors} title="Katoti / Cuts" color="pink">
              <Val label="GBW Cut (Q)" value={q(entry.gbw_cut)} mono />
              <Val label="Plastic Bag" value={entry.plastic_bag} color="text-pink-400" mono />
              <Val label="P.Pkt Cut (Q)" value={q(entry.p_pkt_cut)} color="text-pink-300" mono />
              <Val label="D/D/P" value={entry.disc_dust_poll} mono />
              <Val label="Cutting %" value={entry.cutting_percent ? `${entry.cutting_percent}%` : '-'} color="text-purple-400" mono />
              <Val label="Cutting (Q)" value={q(entry.cutting)} mono />
            </InfoCard>

            {/* Moisture & Mill Weight */}
            <InfoCard icon={Droplets} title="Moisture & Mill Weight" color="blue">
              <Val label="Mill W (Q)" value={q(entry.mill_w)} color="text-blue-400" large mono />
              <Val label="Moisture %" value={entry.moisture ? `${entry.moisture}%` : '-'} color="text-orange-400" mono />
              <Val label="Moisture Cut (Q)" value={q(entry.moisture_cut)} color="text-orange-300" mono />
            </InfoCard>

            {/* Payment Section */}
            <InfoCard icon={CircleDollarSign} title="Payment" color="amber">
              <Val label="Final W (Q)" value={q(entry.final_w)} color="text-amber-400" large mono />
              <Val label="Cash Paid" value={rs(entry.cash_paid)} color="text-green-400" />
              <Val label="Diesel Paid" value={rs(entry.diesel_paid)} color="text-orange-400" />
            </InfoCard>
          </div>

          {/* Remark */}
          {entry.remark && (
            <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-700/40">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Remark</p>
              <p className="text-slate-200 text-sm">{entry.remark}</p>
            </div>
          )}

          {/* Footer meta */}
          <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-700/30">
            <span>Created by: {entry.created_by || '-'}</span>
            <span>{entry.created_at ? new Date(entry.created_at).toLocaleString('en-IN') : ''}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
