import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Gift, ArrowRight, Check } from "lucide-react";

const APP_VERSION = "25.1.57";

const CHANGELOG = [
  {
    version: "25.1.57",
    date: "23 Mar 2026",
    title: "Store Room Bug Fixes",
    items: [
      { type: "fix", text: "Stock In mein Store Room select karne par Part master bhi update hota hai" },
      { type: "new", text: "Transactions table mein Store Room column add kiya" },
    ],
  },
  {
    version: "25.1.56",
    date: "22 Mar 2026",
    title: "Telegram Confirmation Dialog",
    items: [
      { type: "imp", text: "Telegram bhejne se pehle confirmation - date aur recipients dikhein" },
      { type: "imp", text: "Galti se wrong report na jaye, Cancel ka option" },
    ],
  },
  {
    version: "25.1.55",
    date: "22 Mar 2026",
    title: "Round Off Filter + Telegram Share",
    items: [
      { type: "new", text: "Daily Report mein Telegram Share button (Detail mode)" },
      { type: "imp", text: "Cash Transactions se Round Off entries hide (alag toggle se dikhein)" },
    ],
  },
  {
    version: "25.1.54",
    date: "22 Mar 2026",
    title: "Daily Report Export mein Store Room",
    items: [
      { type: "new", text: "Daily Report PDF/Excel export mein Mill Parts ka Store Room column" },
      { type: "imp", text: "Desktop app mein bhi Store Room export support" },
    ],
  },
  {
    version: "25.1.53",
    date: "22 Mar 2026",
    title: "Store Room Everywhere + Export Update",
    items: [
      { type: "new", text: "Stock In/Used form mein Store Room select option" },
      { type: "new", text: "Stock Summary table mein Store Room column" },
      { type: "new", text: "Part-wise Summary mein Store Room info" },
      { type: "imp", text: "Sabhi Excel aur PDF exports mein Store Room column add" },
    ],
  },
  {
    version: "25.1.52",
    date: "22 Mar 2026",
    title: "Footer Redesign + Version Bump",
    items: [
      { type: "imp", text: "Footer centered layout - clean aur professional look" },
      { type: "imp", text: "Version, Designer, Contact info centered mein" },
    ],
  },
  {
    version: "25.1.50",
    date: "22 Mar 2026",
    title: "Store Room Export + What's New",
    items: [
      { type: "new", text: "Store Room Report mein Excel aur PDF export" },
      { type: "new", text: "What's New popup - har update par automatic dikhe" },
      { type: "new", text: "Footer mein version number, contact info" },
    ],
  },
  {
    version: "25.1.49",
    date: "22 Mar 2026",
    title: "Store Room Feature",
    items: [
      { type: "new", text: "Mill Parts mein Store Room management (Add/Edit/Delete)" },
      { type: "new", text: "Parts Master mein Store Room assign kar sakte hain" },
      { type: "new", text: "Room-wise Inventory Report - nayi tab" },
      { type: "imp", text: "Store Room delete karne par parts auto-unassign" },
    ],
  },
  {
    version: "25.1.48",
    date: "22 Mar 2026",
    title: "Round Off Feature",
    items: [
      { type: "new", text: "Saare payment sections mein Round Off option" },
      { type: "new", text: "Round Off ki alag entry Cash Book mein dikhe" },
      { type: "imp", text: "+10 ya -10 se payment adjust kar sakte hain" },
      { type: "imp", text: "CashBook, Hemali, Truck, Agent, Diesel, Voucher, Staff, Private Trading - sabmein available" },
    ],
  },
  {
    version: "25.1.47",
    date: "Mar 2026",
    title: "Hemali Payment Complete",
    items: [
      { type: "new", text: "Hemali Payment System - full implementation" },
      { type: "fix", text: "Data integrity fixes across all payment flows" },
      { type: "imp", text: "Startup integrity checks (web + desktop)" },
    ],
  },
];

const typeBadge = {
  new: { label: "NEW", cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  fix: { label: "FIX", cls: "bg-red-500/20 text-red-400 border-red-500/30" },
  imp: { label: "IMP", cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
};

const WhatsNew = ({ forceOpen = false, onClose }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      return;
    }
    const lastSeen = localStorage.getItem("whats_new_version");
    if (lastSeen !== APP_VERSION) {
      setOpen(true);
    }
  }, [forceOpen]);

  const handleClose = () => {
    localStorage.setItem("whats_new_version", APP_VERSION);
    setOpen(false);
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else setOpen(true); }}>
      <DialogContent className="max-w-lg bg-slate-800 border-slate-700 text-white max-h-[80vh] overflow-y-auto" data-testid="whats-new-dialog">
        <DialogHeader>
          <DialogTitle className="text-amber-400 flex items-center gap-2 text-lg">
            <Gift className="w-5 h-5" />
            What's New / नया क्या है
            <span className="ml-auto text-xs font-normal text-slate-400">v{APP_VERSION}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 mt-2">
          {CHANGELOG.map((release, ri) => (
            <div key={release.version} className={`space-y-2 ${ri > 0 ? 'pt-4 border-t border-slate-700/60' : ''}`}>
              <div className="flex items-center gap-2">
                {ri === 0 && <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />}
                <h3 className={`font-bold text-sm ${ri === 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  v{release.version} - {release.title}
                </h3>
                <span className="text-[10px] text-slate-500 ml-auto">{release.date}</span>
              </div>
              <ul className="space-y-1.5 ml-1">
                {release.items.map((item, ii) => {
                  const badge = typeBadge[item.type] || typeBadge.imp;
                  return (
                    <li key={ii} className="flex items-start gap-2 text-sm">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className="text-slate-300">{item.text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-3 border-t border-slate-700/60">
          <Button onClick={handleClose} className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold" data-testid="whats-new-close">
            <Check className="w-4 h-4 mr-1" /> Samajh Gaya!
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export { APP_VERSION, WhatsNew };
export default WhatsNew;
