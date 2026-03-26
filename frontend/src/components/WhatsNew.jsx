import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Gift, ArrowRight, Check } from "lucide-react";

const APP_VERSION = "42.2.0";

const CHANGELOG = [
  {
    version: "42.2.0",
    date: "26 Mar 2026",
    title: "v42.2 - Duplicate Party Fix + Undo Button Restore",
    items: [
      { type: "fix", text: "Duplicate party name fix - 'Kridha (Kesinga) - Kesinga' ab nahi banega" },
      { type: "fix", text: "Payment Undo button ab Paddy Purchase History mein dikh raha hai" },
      { type: "fix", text: "Health Check ab duplicate party names detect karke merge karega" },
      { type: "fix", text: "GitHub Actions build workflow fix - .exe ab release mein aayega" },
      { type: "imp", text: "Undo+History combined button - jab payment ho toh orange icon dikhega" },
      { type: "imp", text: "Desktop/Local Server mein Mark Paid + Undo Paid logic sync" },
    ],
  },
  {
    version: "42.0.0",
    date: "26 Mar 2026",
    title: "v42 - Payment Fixes + Undo Payment + Round-Off",
    items: [
      { type: "new", text: "Payment History mein Undo Payment button - Cash Book entries bhi auto-delete" },
      { type: "fix", text: "Round-off ab paid_amount mein sahi se add hota hai - balance 0 hoga" },
      { type: "fix", text: "Cash Book se entry delete karne par Paddy Purchase paid_amount auto-revert" },
      { type: "fix", text: "Double payment fix - Pay button disabled during save" },
      { type: "fix", text: "Desktop balance calculation parentheses bug fix" },
      { type: "imp", text: "Route parity - Local Server mein sabhi routes sync" },
      { type: "imp", text: "Backup folders (Google Drive) automatic cleanup" },
    ],
  },
  {
    version: "40.1.0",
    date: "26 Mar 2026",
    title: "v40.1 - Bug Fixes + Auto-Link + Tab Navigation",
    items: [
      { type: "fix", text: "Double payment fix - Pay button ab double-click se duplicate nahi banayega" },
      { type: "fix", text: "Cash Book se payment karne par Paddy Purchase ka paid_amount auto-update hoga" },
      { type: "fix", text: "Ledger entry mein Round Off amount ab sahi dikhega" },
      { type: "fix", text: "Backup folders (Google Drive sync) automatic cleanup" },
      { type: "new", text: "Tab key se bhi form navigation (Enter jaisa)" },
      { type: "new", text: "Ctrl+S se kahin se bhi direct save" },
      { type: "imp", text: "Route parity - Local Server mein sabhi routes sync" },
    ],
  },
  {
    version: "40.0.0",
    date: "26 Mar 2026",
    title: "v40 - Enter Navigation + Code Cleanup",
    items: [
      { type: "new", text: "Transaction Form mein Enter key se agle field par jaayein (sequential navigation)" },
      { type: "imp", text: "Enter dabate jaayein niche niche, last mein Enter se Save" },
      { type: "imp", text: "Code cleanup - triple backend sync aur optimization" },
      { type: "imp", text: "Version 40.0.0 milestone release" },
    ],
  },
  {
    version: "38.6.0",
    date: "25 Mar 2026",
    title: "Accounting Fix + Party Type + Data Health",
    items: [
      { type: "fix", text: "Paddy Purchase ab sirf Party Ledger mein dikhega (Cash Transactions mein nahi - rokad safe)" },
      { type: "fix", text: "Custom Party Type ab type ho payega (Auto-detect override fix)" },
      { type: "fix", text: "Party Ledgers search: match na mile toh 'No ledger found' dikhega" },
      { type: "fix", text: "Pvt Paddy delete karne pe ledger entry bhi automatic delete" },
      { type: "new", text: "Auto-fix: purani entries ka season + account automatically correct" },
    ],
  },
  {
    version: "38.5.0",
    date: "25 Mar 2026",
    title: "Agent Extra Paddy - Cash Book & Daily Report Fix",
    items: [
      { type: "fix", text: "Agent ka Extra Qntl 'Move to Paddy Purchase' ab Cash Book mein party name ke saath dikhega" },
      { type: "fix", text: "Daily Report mein Private Trading ka Qntl aur Rate ab sahi dikhega (0 nahi)" },
      { type: "fix", text: "PDF Report mein Qntl column fix kiya (pehle KG field reference galat tha)" },
      { type: "fix", text: "Auto-fix purani agent_extra entries ko bhi Cash Book mein add karega" },
    ],
  },
  {
    version: "38.4.0",
    date: "25 Mar 2026",
    title: "Pvt Paddy - Cash Book Fix",
    items: [
      { type: "fix", text: "Pvt Paddy Purchase ka party name ab Cash Transactions tab mein dikhta hai (account: cash)" },
      { type: "fix", text: "Purani entries auto-fix se ledger se cash mein migrate ho jayengi" },
    ],
  },
  {
    version: "38.3.0",
    date: "25 Mar 2026",
    title: "Pvt Paddy Party Name - Bulletproof Fix",
    items: [
      { type: "fix", text: "Pvt Paddy Purchase save karne par Cash Book mein party name 100% guarantee se aayega" },
      { type: "fix", text: "3-layer safety: Backend + Safety Net + Frontend Auto-Fix call" },
      { type: "fix", text: "Purani entries bhi auto-fix se Cash Book mein aa jayengi" },
    ],
  },
  {
    version: "38.2.0",
    date: "25 Mar 2026",
    title: "UI Freeze Fix - Global window.confirm Replacement",
    items: [
      { type: "fix", text: "Sabhi components mein window.confirm ko React AlertDialog se replace kiya - ab UI freeze nahi hoga" },
      { type: "fix", text: "Delete, Undo, Mark Paid, Bulk Delete - sabhi actions mein fix laga" },
    ],
  },
  {
    version: "38.1.0",
    date: "25 Mar 2026",
    title: "Bug Fixes - Ctrl+N + Pvt Paddy Party Name",
    items: [
      { type: "fix", text: "Ctrl+N ab sahi kaam karta hai - New Transaction khulta hai, What's New nahi" },
      { type: "fix", text: "Pvt Paddy Purchase mein party name ab Cash Book mein sahi dikhta hai" },
      { type: "fix", text: "Pvt Paddy delete/update pe party jama entry sahi se clean hoti hai (orphan fix)" },
      { type: "fix", text: "Quantity aur Rate ab sahi detail ke saath Cash Book description mein dikhte hain" },
    ],
  },
  {
    version: "37.0.0",
    date: "25 Mar 2026",
    title: "Credit/Debit Fix + UI Freeze Fix",
    items: [
      { type: "fix", text: "Party Ledger mein Credit/Debit direction fix - ab Jama (Cr) aur Nikasi (Dr) sahi dikhte hain" },
      { type: "fix", text: "Auto-ledger entries ab sahi direction mein banti hain (Jama = party ne diya, Nikasi = humne diya)" },
      { type: "fix", text: "Purani galat entries automatic fix ho jaayengi (migration)" },
      { type: "fix", text: "UI freeze on delete - permanent fix with React AlertDialog + aggressive cleanup" },
      { type: "imp", text: "Delete confirm dialog ab sundar React dialog hai, native browser dialog nahi" },
    ],
  },
  {
    version: "36.0.0",
    date: "25 Mar 2026",
    title: "Major Update - Accounting Fix + Exports + Labels",
    items: [
      { type: "fix", text: "Party Ledger mein double-counting bug fix - ab sabhi payments sahi dikhte hain (Agent, Diesel, Voucher, Private, Truck)" },
      { type: "new", text: "Party Ledger mein Sale Book aur Purchase Voucher section add - poora hisaab ek jagah" },
      { type: "imp", text: "Jama (Cr) / Nikasi (Dr) - sabhi jagah updated labels (UI, PDF, Excel)" },
      { type: "imp", text: "Ref column sabhi exports se hata diya (PDF + Excel)" },
      { type: "imp", text: "Sabhi exports mein Company Name + Tagline header" },
      { type: "fix", text: "Hindi font fix - PDF mein ab Hindi text sahi dikhta hai (FreeSans font)" },
      { type: "imp", text: "Sabhi exports ka naya sundar design (styled headers, colors, formatting)" },
      { type: "fix", text: "Desktop build fix - version mismatch auto-detect, ab rebuild automatic hoga" },
    ],
  },
  {
    version: "32.0.0",
    date: "24 Mar 2026",
    title: "Ledger Fix + UI Freeze Fix",
    items: [
      { type: "fix", text: "Party Ledger balance sahi dikhta hai ab - Auto-ledger double-entry fix (Jama/Nikasi correct)" },
      { type: "fix", text: "Delete karne ke baad screen freeze hona band - Radix UI pointer-events fix" },
      { type: "fix", text: "Round Off ab Cash in Hand balance mein count nahi hota (sirf discount hai)" },
      { type: "imp", text: "Account filter mein 'All' option add - Round Off entries bhi dikh sakte hain" },
      { type: "imp", text: "Auto Update UI - native dialog hata, custom React UI (checking, downloading, installed states)" },
      { type: "imp", text: "Truck Lease receipt ab Truck Payment jaisa sundar print hota hai" },
      { type: "fix", text: "Desktop pe purane wrong ledger entries automatically fix hote hain (migration script)" },
    ],
  },
  {
    version: "27.0.0",
    date: "24 Mar 2026",
    title: "Major Release - Round Off Fix + Auto Update UI",
    items: [
      { type: "fix", text: "Sabhi payments mein Round Off balance fix - Truck, Agent, Owner, Diesel, Hemali, Voucher, CashBook, Local Party" },
      { type: "imp", text: "Auto Update notification ab sundar glassmorphism card mein" },
      { type: "fix", text: "Desktop build config fix - utils folder include" },
      { type: "fix", text: "Deployment blockers fix - .gitignore aur server.py" },
    ],
  },
  {
    version: "26.0.3",
    date: "23 Mar 2026",
    title: "Sundar Auto Update UI",
    items: [
      { type: "imp", text: "Auto update notification ab sundar glassmorphism card mein dikhta hai" },
      { type: "imp", text: "Download progress bar, version comparison, Hindi buttons" },
    ],
  },
  {
    version: "26.0.2",
    date: "23 Mar 2026",
    title: "Desktop Round Off Sync Fix",
    items: [
      { type: "fix", text: "Desktop app ke sabhi routes mein Round Off ledger balance fix kiya" },
      { type: "fix", text: "CashBook, Truck, Agent, Owner, Diesel, Hemali, Voucher, Private Trading - sab sync" },
    ],
  },
  {
    version: "26.0.1",
    date: "23 Mar 2026",
    title: "Round Off Balance Fix - Sabhi Payments",
    items: [
      { type: "fix", text: "Round Off balance bug fix - Truck, Agent, Owner, Diesel, Hemali, Voucher, CashBook, Local Party" },
      { type: "fix", text: "Ledger mein ab total (amount + round off) record hota hai, balance sahi aata hai" },
      { type: "fix", text: "Desktop build mein utils folder include kiya" },
    ],
  },
  {
    version: "26.0.0",
    date: "23 Mar 2026",
    title: "Local Party Round Off Fix + Desktop Build Fix",
    items: [
      { type: "fix", text: "Local Party payment mein Round Off balance sahi hota hai ab" },
      { type: "fix", text: "Desktop app mein utils folder build mein include kiya" },
      { type: "new", text: "Local Party Settlement mein Round Off option" },
    ],
  },
  {
    version: "25.1.59",
    date: "23 Mar 2026",
    title: "Desktop Round Off Bug Fix",
    items: [
      { type: "fix", text: "Desktop app mein Round Off ka 'module not found' error fix kiya" },
      { type: "fix", text: "Build config mein utils folder include kiya" },
    ],
  },
  {
    version: "25.1.58",
    date: "23 Mar 2026",
    title: "Local Party mein Round Off",
    items: [
      { type: "new", text: "Local Party Settlement mein Round Off ka option add kiya" },
      { type: "fix", text: "Store Room - Stock In par Part master update hota hai" },
      { type: "new", text: "Transactions table mein Store Room column" },
    ],
  },
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
