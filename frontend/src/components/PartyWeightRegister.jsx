// v104.44.70 — Party Weight Register (tracks party dharam-kaata weight per voucher)
// v104.44.93 — Filter bar, summary strip, Excel/PDF/WhatsApp/Group exports
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { fmtDate } from "@/utils/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Scale, Search, FileSpreadsheet, FileText, Users, X } from "lucide-react";
import { commercialRound } from "../utils/roundOff";
import { SendToGroupDialog } from "./SendToGroupDialog";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const WhatsAppIcon = ({ className = "w-3.5 h-3.5" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M20.52 3.48A11.77 11.77 0 0 0 12.02 0C5.46 0 .12 5.33.12 11.9a11.8 11.8 0 0 0 1.6 5.95L0 24l6.3-1.65a11.88 11.88 0 0 0 5.72 1.46h.01c6.56 0 11.9-5.33 11.9-11.9a11.76 11.76 0 0 0-3.41-8.43zM12.03 21.8h-.01a9.88 9.88 0 0 1-5.04-1.38l-.36-.21-3.74.98 1-3.64-.23-.37a9.85 9.85 0 0 1-1.52-5.28c0-5.47 4.45-9.9 9.9-9.9 2.65 0 5.14 1.03 7.01 2.9a9.87 9.87 0 0 1 2.9 7.02c0 5.46-4.45 9.9-9.91 9.9zm5.43-7.41c-.3-.15-1.76-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.76.97-.93 1.17-.17.2-.34.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.47.13-.62.13-.13.3-.34.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.47 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.26.48 1.69.62.71.22 1.35.19 1.86.12.57-.08 1.76-.72 2-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z"/>
  </svg>
);

export default function PartyWeightRegister({ filters, user, product }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  // v104.44.93 — Local search filters
  const [search, setSearch] = useState({ party_name: "", voucher_no: "", vehicle_no: "", date_from: "", date_to: "" });
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupText, setGroupText] = useState("");
  const [groupPdfUrl, setGroupPdfUrl] = useState("");
  const [form, setForm] = useState({
    voucher_no: "",
    date: "",
    party_name: "",
    vehicle_no: "",
    rst_no: "",
    our_net_weight_kg: "",
    our_net_weight_qtl: "",
    party_net_weight_kg: "",
    party_net_weight_qtl: "",
    remark: "",
    locked: true,  // our fields locked by default
    auto_adjust: true,  // v104.44.93 — auto-adjust BP sale on save (default ON)
  });
  const [lookupBusy, setLookupBusy] = useState(false);
  const [voucherLocked, setVoucherLocked] = useState(false);  // true after successful fetch

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    if (product) p.append("product", product);
    if (filters.kms_year) p.append("kms_year", filters.kms_year);
    if (filters.season) p.append("season", filters.season);
    if (search.party_name) p.append("party_name", search.party_name);
    if (search.voucher_no) p.append("voucher_no", search.voucher_no);
    if (search.vehicle_no) p.append("vehicle_no", search.vehicle_no);
    if (search.date_from) p.append("date_from", search.date_from);
    if (search.date_to) p.append("date_to", search.date_to);
    return p.toString();
  }, [product, filters, search]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/party-weight?${buildParams()}`);
      setItems(res.data || []);
    } catch (e) {
      toast.error("Load fail: " + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  }, [buildParams]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // v104.44.93 — Excel / PDF / WhatsApp / Group exports
  const doExport = (kind) => {
    const url = `${API}/party-weight/export/${kind}?${buildParams()}`;
    window.open(url, "_blank");
  };

  const buildSummaryText = useCallback(() => {
    const ts = items.reduce((s, i) => s + (i.shortage_kg || 0), 0);
    const te = items.reduce((s, i) => s + (i.excess_kg || 0), 0);
    const sc = items.filter(i => (i.shortage_kg || 0) > 0).length;
    const ec = items.filter(i => (i.excess_kg || 0) > 0).length;
    const lines = [
      `*Party Weight Register* — ${product}`,
      `KMS: ${filters.kms_year || "ALL"} · ${filters.season || ""}`.trim(),
      search.date_from || search.date_to ? `Date: ${search.date_from || 'start'} → ${search.date_to || 'today'}` : null,
      search.party_name ? `Party: ${search.party_name}` : null,
      ``,
      `Records: ${items.length}`,
      `Shortage Cases: ${sc}  ·  Total: ${ts.toFixed(2)} Kg`,
      `Excess Cases: ${ec}  ·  Total: ${te.toFixed(2)} Kg`,
    ].filter(Boolean);
    return lines.join("\n");
  }, [items, product, filters, search]);

  const handleWhatsApp = async () => {
    try {
      const url = `${API}/party-weight/export/pdf?${buildParams()}`;
      const fname = `party_weight_${product}_${new Date().toISOString().slice(0, 10)}.pdf`;
      const summary = buildSummaryText();
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("PDF fetch failed");
      const blob = await resp.blob();
      const file = new File([blob], fname, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: "Party Weight Register", text: summary, files: [file] });
        toast.success("Share dialog open");
      } else {
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = dlUrl; a.download = fname; a.click();
        setTimeout(() => URL.revokeObjectURL(dlUrl), 1000);
        window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, "_blank");
        toast.success("PDF downloaded + WhatsApp opened — manually attach", { duration: 5000 });
      }
    } catch (e) { toast.error("WhatsApp share fail: " + (e.message || e)); }
  };

  const handleGroup = () => {
    setGroupText(buildSummaryText());
    setGroupPdfUrl(`${API}/party-weight/export/pdf?${buildParams()}`);
    setGroupOpen(true);
  };

  const clearSearch = () => setSearch({ party_name: "", voucher_no: "", vehicle_no: "", date_from: "", date_to: "" });
  const hasActiveSearch = !!(search.party_name || search.voucher_no || search.vehicle_no || search.date_from || search.date_to);

  const openNew = () => {
    setEditId(null);
    setVoucherLocked(false);
    setForm({
      voucher_no: "", date: "", party_name: "", vehicle_no: "", rst_no: "",
      our_net_weight_kg: "", our_net_weight_qtl: "",
      party_net_weight_kg: "", party_net_weight_qtl: "",
      remark: "", locked: true, auto_adjust: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (s) => {
    setEditId(s.id);
    setVoucherLocked(true);  // always locked in edit
    setForm({
      voucher_no: s.voucher_no || "",
      date: s.date || "",
      party_name: s.party_name || "",
      vehicle_no: s.vehicle_no || "",
      rst_no: s.rst_no || "",
      our_net_weight_kg: String(s.our_net_weight_kg || ""),
      our_net_weight_qtl: ((s.our_net_weight_kg || 0) / 100).toFixed(2),
      party_net_weight_kg: String(s.party_net_weight_kg || ""),
      party_net_weight_qtl: ((s.party_net_weight_kg || 0) / 100).toFixed(2),
      remark: s.remark || "",
      locked: true,
      auto_adjust: !!s.auto_adjusted,
    });
    setDialogOpen(true);
  };

  // Voucher lookup (on Enter or blur) — auto-prepends "S-" if user typed only number
  const doLookup = async () => {
    const raw = form.voucher_no.trim();
    if (!raw) return;
    // Auto-prefix "S-" if user typed digits-only (or missing "-"), so "001" → "S-001"
    const needsPrefix = !raw.toUpperCase().startsWith("S-") && !raw.includes("-");
    const v = needsPrefix ? `S-${raw}` : raw;
    setLookupBusy(true);
    try {
      const params = new URLSearchParams({ voucher_no: v });
      if (product) params.append("product", product);
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      const res = await axios.get(`${API}/party-weight/lookup?${params}`);
      const d = res.data;
      setForm(p => ({
        ...p,
        voucher_no: v,  // normalize to full form
        date: d.date || p.date,
        party_name: d.party_name || "",
        vehicle_no: d.vehicle_no || "",
        rst_no: d.rst_no || "",
        our_net_weight_kg: String(d.net_weight_kg || 0),
        our_net_weight_qtl: ((d.net_weight_kg || 0) / 100).toFixed(2),
      }));
      setVoucherLocked(true);  // lock voucher input after successful fetch
      toast.success(`Voucher #${v} fetched: ${d.party_name} · ${d.net_weight_kg} kg`);
      // Focus party weight qtl (now first field in order)
      setTimeout(() => {
        const el = document.querySelector('[data-testid="pw-party-qtl"]');
        if (el) { el.focus(); try { el.select(); } catch(_){} }
      }, 150);
    } catch (e) {
      toast.error(`Voucher #${v} not found`);
    } finally { setLookupBusy(false); }
  };

  // "Change voucher" → unlock to allow re-fetch
  const unlockVoucher = () => {
    setVoucherLocked(false);
    setForm(p => ({
      ...p,
      voucher_no: "", date: "", party_name: "", vehicle_no: "", rst_no: "",
      our_net_weight_kg: "", our_net_weight_qtl: "",
    }));
    setTimeout(() => {
      const el = document.querySelector('[data-testid="pw-voucher-no"]');
      if (el) { el.focus(); try { el.select(); } catch(_){} }
    }, 80);
  };

  // Mutual conversion for party weight (kg ↔ qtl)
  const updatePartyKg = (v) => {
    const kg = parseFloat(v) || 0;
    setForm(p => ({ ...p, party_net_weight_kg: v, party_net_weight_qtl: v === "" ? "" : (kg / 100).toFixed(2) }));
  };
  const updatePartyQtl = (v) => {
    const qtl = parseFloat(v) || 0;
    // Multiply then round to 2 decimals to avoid JS float noise (149.80 * 100 = 14980.000000000002)
    const kgClean = Math.round(qtl * 100 * 100) / 100;
    setForm(p => ({ ...p, party_net_weight_qtl: v, party_net_weight_kg: v === "" ? "" : String(kgClean) }));
  };

  const ourKg = parseFloat(form.our_net_weight_kg) || 0;
  const partyKg = parseFloat(form.party_net_weight_kg) || 0;
  const diffKgRaw = ourKg - partyKg;
  const diffKg = Math.round(diffKgRaw * 100) / 100;  // 2-decimal clean (avoids 19.99999 float noise)
  const diffQtl = diffKg / 100;

  const handleSave = async () => {
    if (!form.voucher_no.trim()) { toast.error("Voucher No. required"); return; }
    if (!ourKg) { toast.error("Voucher fetch karke our N/W load karein"); return; }
    if (!partyKg) { toast.error("Party weight daalein"); return; }

    const payload = {
      product,
      voucher_no: form.voucher_no.trim(),
      date: form.date,
      party_name: form.party_name,
      vehicle_no: form.vehicle_no,
      rst_no: form.rst_no,
      our_net_weight_kg: commercialRound(ourKg),
      party_net_weight_kg: commercialRound(partyKg),
      remark: form.remark,
      kms_year: filters.kms_year || "",
      season: filters.season || "",
      auto_adjust: !!form.auto_adjust,  // v104.44.93
    };
    try {
      if (editId) {
        await axios.put(`${API}/party-weight/${editId}?username=${user.username}&role=${user.role}`, payload);
        toast.success("Updated");
      } else {
        await axios.post(`${API}/party-weight?username=${user.username}&role=${user.role}`, payload);
        toast.success("Saved");
      }
      setDialogOpen(false);
      fetchItems();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this entry?")) return;
    try {
      await axios.delete(`${API}/party-weight/${id}?username=${user.username}&role=${user.role}`);
      toast.success("Deleted");
      fetchItems();
    } catch (e) { toast.error(e.response?.data?.detail || e.message); }
  };

  const totOur = items.reduce((s, i) => s + (i.our_net_weight_kg || 0), 0);
  const totParty = items.reduce((s, i) => s + (i.party_net_weight_kg || 0), 0);
  const totShortage = items.reduce((s, i) => s + (i.shortage_kg || 0), 0);
  const totExcess = items.reduce((s, i) => s + (i.excess_kg || 0), 0);

  return (
    <div className="space-y-3" data-testid="party-weight-register">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Scale className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            Party Weight — {product}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Party ke dharam kaata ka weight — shortage/excess tracking</p>
        </div>
        <Button onClick={openNew} size="sm" className="bg-cyan-500 hover:bg-cyan-600 text-white" data-testid="pw-add">
          <Plus className="w-4 h-4 mr-1" /> New Entry
        </Button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="p-2 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" data-testid="pw-stat-records">
          <p className="text-[9px] text-slate-500 uppercase">Records</p>
          <p className="text-sm font-bold text-slate-900 dark:text-white">{items.length}</p>
        </div>
        <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700">
          <p className="text-[9px] text-blue-600 dark:text-blue-400 uppercase">Our N/W (Qtl)</p>
          <p className="text-sm font-bold text-blue-700 dark:text-blue-300">{(totOur / 100).toFixed(2)}</p>
        </div>
        <div className="p-2 rounded bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700">
          <p className="text-[9px] text-indigo-600 dark:text-indigo-400 uppercase">Party N/W (Qtl)</p>
          <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{(totParty / 100).toFixed(2)}</p>
        </div>
        <div className={`p-2 rounded border ${totShortage > 0 ? "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"}`} data-testid="pw-stat-shortage">
          <p className="text-[9px] text-red-600 dark:text-red-400 uppercase">Shortage (Kg)</p>
          <p className={`text-sm font-bold tabular-nums ${totShortage > 0 ? "text-red-700 dark:text-red-300" : "text-slate-700 dark:text-slate-200"}`}>{totShortage.toFixed(2)}</p>
        </div>
        <div className={`p-2 rounded border ${totExcess > 0 ? "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"}`} data-testid="pw-stat-excess">
          <p className="text-[9px] text-emerald-600 dark:text-emerald-400 uppercase">Excess (Kg)</p>
          <p className={`text-sm font-bold tabular-nums ${totExcess > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-slate-700 dark:text-slate-200"}`}>{totExcess.toFixed(2)}</p>
        </div>
      </div>

      {/* Filter + Export bar */}
      <div className="flex flex-wrap items-end gap-2 p-2 rounded bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
        <div className="flex flex-col gap-0.5">
          <Label className="text-[10px] text-slate-600 dark:text-slate-400">Party</Label>
          <Input value={search.party_name} onChange={e => setSearch(s => ({ ...s, party_name: e.target.value }))}
            placeholder="Party name..." className="h-8 text-xs w-32" data-testid="pw-filter-party" />
        </div>
        <div className="flex flex-col gap-0.5">
          <Label className="text-[10px] text-slate-600 dark:text-slate-400">Voucher</Label>
          <Input value={search.voucher_no} onChange={e => setSearch(s => ({ ...s, voucher_no: e.target.value }))}
            placeholder="S-001" className="h-8 text-xs w-24" data-testid="pw-filter-voucher" />
        </div>
        <div className="flex flex-col gap-0.5">
          <Label className="text-[10px] text-slate-600 dark:text-slate-400">Vehicle</Label>
          <Input value={search.vehicle_no} onChange={e => setSearch(s => ({ ...s, vehicle_no: e.target.value }))}
            placeholder="OD19..." className="h-8 text-xs w-28" data-testid="pw-filter-vehicle" />
        </div>
        <div className="flex flex-col gap-0.5">
          <Label className="text-[10px] text-slate-600 dark:text-slate-400">From</Label>
          <Input type="date" value={search.date_from} onChange={e => setSearch(s => ({ ...s, date_from: e.target.value }))}
            className="h-8 text-xs w-32" data-testid="pw-filter-from" />
        </div>
        <div className="flex flex-col gap-0.5">
          <Label className="text-[10px] text-slate-600 dark:text-slate-400">To</Label>
          <Input type="date" value={search.date_to} onChange={e => setSearch(s => ({ ...s, date_to: e.target.value }))}
            className="h-8 text-xs w-32" data-testid="pw-filter-to" />
        </div>
        {hasActiveSearch && (
          <Button onClick={clearSearch} variant="ghost" size="sm" className="h-8 text-xs text-slate-600" data-testid="pw-filter-clear">
            <X className="w-3 h-3 mr-1" /> Clear
          </Button>
        )}
        <div className="flex-1" />
        <div className="flex gap-1.5">
          <Button onClick={() => doExport("excel")} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs" data-testid="pw-export-excel">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1" /> Excel
          </Button>
          <Button onClick={() => doExport("pdf")} size="sm" className="bg-red-600 hover:bg-red-700 text-white h-8 text-xs" data-testid="pw-export-pdf">
            <FileText className="w-3.5 h-3.5 mr-1" /> PDF
          </Button>
          <Button onClick={handleWhatsApp} variant="ghost" size="sm" className="h-8 w-8 p-0 text-[#25D366] hover:bg-green-100 dark:hover:bg-green-900/30 border border-green-600" title="WhatsApp" data-testid="pw-whatsapp">
            <WhatsAppIcon className="w-4 h-4" />
          </Button>
          <Button onClick={handleGroup} variant="ghost" size="sm" className="h-8 w-8 p-0 text-cyan-600 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 border border-cyan-600" title="Send to Group" data-testid="pw-group">
            <Users className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-x-auto shadow-sm">
        <Table>
          <TableHeader className="bg-slate-100 dark:bg-slate-900/50 sticky top-0">
            <TableRow className="border-slate-200 dark:border-slate-700">
              <TableHead className="text-slate-700 dark:text-slate-300 text-xs py-2 px-2">Date</TableHead>
              <TableHead className="text-slate-700 dark:text-slate-300 text-xs py-2 px-2">V.No</TableHead>
              <TableHead className="text-slate-700 dark:text-slate-300 text-xs py-2 px-2">RST</TableHead>
              <TableHead className="text-slate-700 dark:text-slate-300 text-xs py-2 px-2">Vehicle</TableHead>
              <TableHead className="text-slate-700 dark:text-slate-300 text-xs py-2 px-2">Party</TableHead>
              <TableHead className="text-slate-700 dark:text-slate-300 text-xs py-2 px-2 text-right">Our (Qtl)</TableHead>
              <TableHead className="text-slate-700 dark:text-slate-300 text-xs py-2 px-2 text-right">Party (Qtl)</TableHead>
              <TableHead className="text-slate-700 dark:text-slate-300 text-xs py-2 px-2 text-right">Shortage (Qtl)</TableHead>
              <TableHead className="text-slate-700 dark:text-slate-300 text-xs py-2 px-2 text-right">Excess (Qtl)</TableHead>
              <TableHead className="text-slate-700 dark:text-slate-300 text-xs py-2 px-2">Remark</TableHead>
              <TableHead className="text-slate-700 dark:text-slate-300 text-xs py-2 px-2 w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={11} className="text-center text-slate-400 py-6">Loading...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={11} className="text-center text-slate-400 py-6">No entries — click <span className="text-cyan-500 font-semibold">+ New</span> to add</TableCell></TableRow>
            ) : items.map(s => (
              <TableRow key={s.id} className="border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                <TableCell className="text-slate-700 dark:text-slate-300 text-xs px-2">{fmtDate(s.date)}</TableCell>
                <TableCell className="text-amber-700 dark:text-amber-400 text-xs px-2 font-bold">{s.voucher_no}</TableCell>
                <TableCell className="text-slate-700 dark:text-slate-300 text-xs px-2">{s.rst_no || '-'}</TableCell>
                <TableCell className="text-slate-700 dark:text-slate-300 text-xs px-2">{s.vehicle_no || '-'}</TableCell>
                <TableCell className="text-slate-800 dark:text-slate-200 text-xs px-2 font-medium">{s.party_name}</TableCell>
                <TableCell className="text-blue-700 dark:text-blue-400 text-xs px-2 text-right font-bold">{((s.our_net_weight_kg || 0) / 100).toFixed(2)}</TableCell>
                <TableCell className="text-indigo-700 dark:text-indigo-400 text-xs px-2 text-right font-bold">{((s.party_net_weight_kg || 0) / 100).toFixed(2)}</TableCell>
                <TableCell className="text-red-600 dark:text-red-400 text-xs px-2 text-right font-bold">{s.shortage_kg > 0 ? (s.shortage_kg / 100).toFixed(2) : '-'}</TableCell>
                <TableCell className="text-green-600 dark:text-green-400 text-xs px-2 text-right font-bold">{s.excess_kg > 0 ? (s.excess_kg / 100).toFixed(2) : '-'}</TableCell>
                <TableCell className="text-slate-600 dark:text-slate-400 text-xs px-2">{s.remark || '-'}</TableCell>
                <TableCell className="px-2">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-500" onClick={() => openEdit(s)} data-testid={`pw-edit-${s.voucher_no}`}><Edit className="w-3.5 h-3.5" /></Button>
                    {user.role === "admin" && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDelete(s.id)} data-testid={`pw-del-${s.voucher_no}`}><Trash2 className="w-3.5 h-3.5" /></Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 max-w-2xl" data-testid="pw-dialog">
          <DialogHeader>
            <DialogTitle className="text-cyan-600 dark:text-cyan-400 flex items-center gap-2">
              <Scale className="w-5 h-5" /> {editId ? 'Edit' : 'New'} Party Weight — {product}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Voucher fetch row */}
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/50 rounded-lg p-3">
              <Label className="text-xs font-semibold text-amber-700 dark:text-amber-400">Voucher No. <span className="font-normal text-amber-600/70 dark:text-amber-500/70">(sirf number: e.g. 001 → S-001)</span></Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={form.voucher_no}
                  onChange={e => setForm(p => ({ ...p, voucher_no: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); doLookup(); } }}
                  placeholder="Enter number & press Enter (S- auto-prepend)"
                  className={`bg-white dark:bg-slate-700 border-amber-300 dark:border-amber-700 text-slate-900 dark:text-white h-9 ${voucherLocked ? 'cursor-not-allowed bg-amber-100 dark:bg-amber-900/40 font-bold' : ''}`}
                  autoFocus
                  disabled={voucherLocked}
                  data-testid="pw-voucher-no"
                />
                {voucherLocked && !editId ? (
                  <Button onClick={unlockVoucher} size="sm" variant="outline" className="h-9 border-amber-400 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50" data-testid="pw-unlock">
                    Change
                  </Button>
                ) : (
                  <Button onClick={doLookup} disabled={lookupBusy || !form.voucher_no.trim() || !!editId} size="sm" className="bg-amber-500 hover:bg-amber-600 text-white h-9" data-testid="pw-fetch">
                    <Search className="w-4 h-4 mr-1" /> {lookupBusy ? '...' : 'Fetch'}
                  </Button>
                )}
              </div>
              {form.party_name && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-2">
                  <b>{form.party_name}</b> · {fmtDate(form.date)} · RST #{form.rst_no || '-'} · {form.vehicle_no || '-'}
                </p>
              )}
            </div>

            {/* Our weight (locked) + Party weight (dual qtl/kg input) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-300 dark:border-blue-700/50 rounded-lg p-3">
                <Label className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase">Our N/W (Locked)</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div>
                    <Label className="text-[10px] text-blue-600/80 dark:text-blue-500/80">Qtl</Label>
                    <Input value={form.our_net_weight_qtl} readOnly disabled className="bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200 h-9 font-bold tabular-nums cursor-not-allowed disabled:opacity-100" data-testid="pw-our-qtl" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-blue-600/80 dark:text-blue-500/80">Kg</Label>
                    <Input value={form.our_net_weight_kg} readOnly disabled className="bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200 h-9 font-bold tabular-nums cursor-not-allowed disabled:opacity-100" data-testid="pw-our-kg" />
                  </div>
                </div>
              </div>
              <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-300 dark:border-indigo-700/50 rounded-lg p-3">
                <Label className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase">Party N/W</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div>
                    <Label className="text-[10px] text-indigo-600/80 dark:text-indigo-500/80">Qtl</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.party_net_weight_qtl}
                      onChange={e => updatePartyQtl(e.target.value)}
                      placeholder="0"
                      className="bg-white dark:bg-slate-700 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-white h-9 font-bold tabular-nums"
                      data-testid="pw-party-qtl"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-indigo-600/80 dark:text-indigo-500/80">Kg</Label>
                    <Input
                      type="number"
                      value={form.party_net_weight_kg}
                      onChange={e => updatePartyKg(e.target.value)}
                      placeholder="0"
                      className="bg-white dark:bg-slate-700 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-white h-9 font-bold tabular-nums"
                      data-testid="pw-party-kg"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Shortage / Excess display */}
            {ourKg > 0 && partyKg > 0 && (
              <div className={`rounded-lg border-2 p-3 text-center ${diffKg > 0 ? 'bg-red-50 dark:bg-red-950/30 border-red-400 dark:border-red-700' : diffKg < 0 ? 'bg-green-50 dark:bg-green-950/30 border-green-400 dark:border-green-700' : 'bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700'}`} data-testid="pw-diff-display">
                {diffKg > 0 ? (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-red-700 dark:text-red-400 font-semibold">Shortage (Kami)</div>
                    <div className="text-2xl font-extrabold text-red-700 dark:text-red-300 tabular-nums mt-0.5">
                      {diffKg.toLocaleString('en-IN')} Kg <span className="text-base font-bold text-red-600/80">({diffQtl.toFixed(2)} Qtl)</span>
                    </div>
                    <div className="text-[10px] text-red-600 dark:text-red-400/80 mt-1">Party ke paas {diffKg} Kg kam aaya</div>
                  </div>
                ) : diffKg < 0 ? (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-green-700 dark:text-green-400 font-semibold">Excess (Zyada)</div>
                    <div className="text-2xl font-extrabold text-green-700 dark:text-green-300 tabular-nums mt-0.5">
                      {Math.abs(diffKg).toLocaleString('en-IN')} Kg <span className="text-base font-bold text-green-600/80">({Math.abs(diffQtl).toFixed(2)} Qtl)</span>
                    </div>
                    <div className="text-[10px] text-green-600 dark:text-green-400/80 mt-1">Party ke paas {Math.abs(diffKg)} Kg zyada aaya</div>
                  </div>
                ) : (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-700 dark:text-slate-300 font-semibold">Perfect Match</div>
                    <div className="text-xl font-bold text-slate-700 dark:text-slate-200 tabular-nums mt-0.5">0 Kg diff</div>
                  </div>
                )}
              </div>
            )}

            <div>
              <Label className="text-xs text-slate-700 dark:text-slate-300">Remark (optional)</Label>
              <Input
                value={form.remark}
                onChange={e => setForm(p => ({ ...p, remark: e.target.value }))}
                placeholder="Any note..."
                className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 mt-1"
                data-testid="pw-remark"
              />
            </div>

            {/* v104.44.93 — Auto-Adjust checkbox */}
            <label className="flex items-start gap-2 p-2.5 rounded-lg border-2 border-dashed border-cyan-300 dark:border-cyan-700/50 bg-cyan-50/60 dark:bg-cyan-950/20 cursor-pointer hover:bg-cyan-50 dark:hover:bg-cyan-950/40">
              <input
                type="checkbox"
                checked={!!form.auto_adjust}
                onChange={e => setForm(p => ({ ...p, auto_adjust: e.target.checked }))}
                className="mt-0.5 w-4 h-4 accent-cyan-600"
                data-testid="pw-auto-adjust"
              />
              <div className="flex-1 text-xs">
                <div className="font-bold text-cyan-700 dark:text-cyan-300">Auto-Adjust to Sale Bill</div>
                <div className="text-cyan-600/80 dark:text-cyan-400/80 mt-0.5">
                  {diffKg > 0
                    ? `Shortage ${diffKg} Kg → KCA weight/amount auto-reduce hoga (split bill mein), warna virtual KCA ledger mein party ko credit entry banegi.`
                    : diffKg < 0
                      ? `Excess ${Math.abs(diffKg)} Kg → KCA weight/amount auto-add hoga (split bill mein), warna virtual KCA ledger mein party debit entry banegi.`
                      : "Saving ke time BP sale bill update ho jayega — split mein KCA portion ko adjust karega; solo PKA mein virtual KCA ledger entry banayega."}
                </div>
              </div>
            </label>

            <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleSave} className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white" data-testid="pw-save">
                {editId ? 'Update' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* v104.44.93 — Send-to-Group dialog */}
      <SendToGroupDialog open={groupOpen} onOpenChange={setGroupOpen} text={groupText} pdfUrl={groupPdfUrl} />
    </div>
  );
}
