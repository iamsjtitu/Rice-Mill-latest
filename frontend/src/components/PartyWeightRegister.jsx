// v104.44.70 — Party Weight Register (tracks party dharam-kaata weight per voucher)
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { fmtDate } from "@/utils/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Scale, Search } from "lucide-react";
import { commercialRound } from "../utils/roundOff";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function PartyWeightRegister({ filters, user, product }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
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
  });
  const [lookupBusy, setLookupBusy] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (product) params.append("product", product);
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      if (filters.season) params.append("season", filters.season);
      const res = await axios.get(`${API}/party-weight?${params}`);
      setItems(res.data || []);
    } catch (e) {
      toast.error("Load fail: " + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  }, [product, filters]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openNew = () => {
    setEditId(null);
    setForm({
      voucher_no: "", date: "", party_name: "", vehicle_no: "", rst_no: "",
      our_net_weight_kg: "", our_net_weight_qtl: "",
      party_net_weight_kg: "", party_net_weight_qtl: "",
      remark: "", locked: true
    });
    setDialogOpen(true);
  };

  const openEdit = (s) => {
    setEditId(s.id);
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
      locked: true
    });
    setDialogOpen(true);
  };

  // Voucher lookup (on Enter or blur)
  const doLookup = async () => {
    const v = form.voucher_no.trim();
    if (!v) return;
    setLookupBusy(true);
    try {
      const params = new URLSearchParams({ voucher_no: v });
      if (product) params.append("product", product);
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      const res = await axios.get(`${API}/party-weight/lookup?${params}`);
      const d = res.data;
      setForm(p => ({
        ...p,
        date: d.date || p.date,
        party_name: d.party_name || "",
        vehicle_no: d.vehicle_no || "",
        rst_no: d.rst_no || "",
        our_net_weight_kg: String(d.net_weight_kg || 0),
        our_net_weight_qtl: ((d.net_weight_kg || 0) / 100).toFixed(2),
      }));
      toast.success(`Voucher #${v} fetched: ${d.party_name} · ${d.net_weight_kg} kg`);
      // Focus party weight kg
      setTimeout(() => {
        const el = document.querySelector('[data-testid="pw-party-kg"]');
        if (el) { el.focus(); try { el.select(); } catch(_){} }
      }, 150);
    } catch (e) {
      toast.error(`Voucher #${v} not found`);
    } finally { setLookupBusy(false); }
  };

  // Mutual conversion for party weight (kg ↔ qtl)
  const updatePartyKg = (v) => {
    const kg = parseFloat(v) || 0;
    setForm(p => ({ ...p, party_net_weight_kg: v, party_net_weight_qtl: v === "" ? "" : (kg / 100).toFixed(2) }));
  };
  const updatePartyQtl = (v) => {
    const qtl = parseFloat(v) || 0;
    setForm(p => ({ ...p, party_net_weight_qtl: v, party_net_weight_kg: v === "" ? "" : String(qtl * 100) }));
  };

  const ourKg = parseFloat(form.our_net_weight_kg) || 0;
  const partyKg = parseFloat(form.party_net_weight_kg) || 0;
  const diffKg = ourKg - partyKg;
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Scale className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            Party Weight — {product}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Party ke dharam kaata ka weight — shortage/excess tracking</p>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {items.length} entries | Our: <span className="text-blue-600 dark:text-blue-400 font-bold">{(totOur / 100).toFixed(2)} qtl</span>
            {" | "}Party: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{(totParty / 100).toFixed(2)} qtl</span>
            {totShortage > 0 && <> {" | "}Shortage: <span className="text-red-600 dark:text-red-400 font-bold">{(totShortage / 100).toFixed(2)} qtl</span></>}
            {totExcess > 0 && <> {" | "}Excess: <span className="text-green-600 dark:text-green-400 font-bold">{(totExcess / 100).toFixed(2)} qtl</span></>}
          </span>
          <Button onClick={openNew} size="sm" className="bg-cyan-500 hover:bg-cyan-600 text-white" data-testid="pw-add">
            <Plus className="w-4 h-4 mr-1" /> New
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
              <Label className="text-xs font-semibold text-amber-700 dark:text-amber-400">Voucher No.</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={form.voucher_no}
                  onChange={e => setForm(p => ({ ...p, voucher_no: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); doLookup(); } }}
                  placeholder="Enter voucher no. & press Enter"
                  className="bg-white dark:bg-slate-700 border-amber-300 dark:border-amber-700 text-slate-900 dark:text-white h-9"
                  autoFocus
                  disabled={!!editId}
                  data-testid="pw-voucher-no"
                />
                <Button onClick={doLookup} disabled={lookupBusy || !form.voucher_no.trim() || !!editId} size="sm" className="bg-amber-500 hover:bg-amber-600 text-white h-9" data-testid="pw-fetch">
                  <Search className="w-4 h-4 mr-1" /> {lookupBusy ? '...' : 'Fetch'}
                </Button>
              </div>
              {form.party_name && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-2">
                  <b>{form.party_name}</b> · {fmtDate(form.date)} · RST #{form.rst_no || '-'} · {form.vehicle_no || '-'}
                </p>
              )}
            </div>

            {/* Our weight (locked) + Party weight (dual kg/qtl input) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-300 dark:border-blue-700/50 rounded-lg p-3">
                <Label className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase">Our N/W (Locked)</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div>
                    <Label className="text-[10px] text-blue-600/80 dark:text-blue-500/80">Kg</Label>
                    <Input value={form.our_net_weight_kg} readOnly className="bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200 h-9 font-bold tabular-nums cursor-not-allowed" data-testid="pw-our-kg" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-blue-600/80 dark:text-blue-500/80">Qtl</Label>
                    <Input value={form.our_net_weight_qtl} readOnly className="bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200 h-9 font-bold tabular-nums cursor-not-allowed" data-testid="pw-our-qtl" />
                  </div>
                </div>
              </div>
              <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-300 dark:border-indigo-700/50 rounded-lg p-3">
                <Label className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase">Party N/W</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
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

            <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleSave} className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white" data-testid="pw-save">
                {editId ? 'Update' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
