import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Package, ChevronRight } from "lucide-react";
import { CURRENT_KMS_YEAR as CURRENT_KMS } from "./common/constants";
import logger from "../utils/logger";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

function fmtDate(d) { if (!d) return ''; try { const p = d.split('T')[0].split('-'); return `${p[2]}-${p[1]}-${p[0]}`; } catch { return d; } }
function daysAgo(d) { if (!d) return ''; const diff = Math.floor((Date.now() - new Date(d)) / 86400000); if (diff === 0) return 'Today'; if (diff === 1) return '1 day ago'; return `${diff} days ago`; }
function daysLeft(d) { if (!d) return null; const diff = Math.ceil((new Date(d) - Date.now()) / 86400000); return diff; }

function getStackStatus(stack) {
  const lots = stack.lots || [];
  const allotted = stack.allotted_date;
  if (!allotted) return { deadlines: [] };
  
  const allottedMs = new Date(allotted).getTime();
  const firstLotDL = new Date(allottedMs + 2 * 86400000);
  const fullDL = new Date(allottedMs + 7 * 86400000);
  const now = new Date();
  
  const deliveredLots = lots.filter(l => l.status === 'delivered');
  const totalLots = parseInt(stack.total_lots) || lots.length;
  const hasFirstLot = deliveredLots.length > 0;
  
  // Build deadlines array
  const deadlines = [];
  
  // 1st Lot deadline — only show if no lot delivered yet
  if (!hasFirstLot) {
    const d = daysLeft(firstLotDL.toISOString().split('T')[0]);
    if (d !== null && d < 0) {
      deadlines.push({ label: '1st Lot Overdue', value: 'CANCELLED', color: 'text-red-600', bold: true });
    } else {
      deadlines.push({ label: '1st Lot Deadline', value: `within ${Math.max(d, 0)} days`, color: 'text-red-600', bold: true });
    }
  }
  
  // Full delivery deadline — always show if not completed
  if (deliveredLots.length < totalLots) {
    const d = daysLeft(fullDL.toISOString().split('T')[0]);
    if (d !== null && d < 0) {
      deadlines.push({ label: 'To be finished', value: 'LAPSED', color: 'text-orange-600', bold: true });
    } else {
      deadlines.push({ label: 'To be finished', value: `within ${Math.max(d, 0)} days`, color: 'text-orange-600', bold: false });
    }
  }
  
  // Delivery Due — days since last delivered or allotted
  if (hasFirstLot && deliveredLots.length < totalLots) {
    const lastDel = deliveredLots.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    const lastDate = lastDel?.date || allotted;
    const daysSince = Math.floor((now - new Date(lastDate)) / 86400000);
    const fullDaysLeft = daysLeft(fullDL.toISOString().split('T')[0]);
    const dueIn = Math.max(fullDaysLeft || 0, 0);
    deadlines.push({ label: 'Delivery Due', value: `within ${dueIn} days`, color: 'text-blue-600', bold: false });
  }
  
  // Status badge
  let badge = null;
  if (!hasFirstLot && now > firstLotDL) {
    badge = { label: 'CANCELLED', color: 'bg-red-600 text-white', desc: '1st lot 2 din mein nahi hua' };
  } else if (deliveredLots.length < totalLots && now > fullDL) {
    badge = { label: 'LAPSED', color: 'bg-orange-600 text-white', desc: '7 din mein delivery nahi hua' };
  } else if (totalLots > 0 && deliveredLots.length >= totalLots) {
    badge = { label: 'COMPLETED', color: 'bg-emerald-600 text-white', desc: 'Sab lots delivered' };
  } else if (!hasFirstLot) {
    const d = daysLeft(firstLotDL.toISOString().split('T')[0]);
    if (d !== null && d <= 1) badge = { label: `1st LOT: ${d}d left!`, color: 'bg-red-500 text-white animate-pulse', desc: '' };
  }
  
  const headerColor = badge?.label === 'CANCELLED' ? 'bg-red-600' : badge?.label === 'LAPSED' ? 'bg-orange-600' : badge?.label === 'COMPLETED' ? 'bg-emerald-700' : 'bg-emerald-600';
  
  return { deadlines, badge, headerColor };
}

export default function DCStacks({ filters }) {
  const [stacks, setStacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedStack, setSelectedStack] = useState(null);
  const [lotDialog, setLotDialog] = useState({ open: false, stackId: null, stackInfo: '' });
  const [lotForm, setLotForm] = useState({ date: new Date().toISOString().split('T')[0], agency: '', lot_ack_no: '', no_of_trucks: 1, bags: '', nett_weight_qtl: '', status: 'delivered' });

  const blankStack = { depot_name: '', depot_code: '', stack_no: '', kms_year: filters.kms_year || CURRENT_KMS, season: filters.season || 'Kharif', delivery_to: 'FCI', rice_type: 'parboiled', tec: '', booking_id: '', total_lots: '', allotted_date: new Date().toISOString().split('T')[0], restricted_transport: false };
  const [form, setForm] = useState(blankStack);

  const fetchStacks = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/dc-stacks?${p}`);
      setStacks(res.data || []);
    } catch (e) { logger.error(e); }
    setLoading(false);
  }, [filters.kms_year, filters.season]);

  useEffect(() => { fetchStacks(); }, [fetchStacks]);

  const handleSaveStack = async () => {
    if (!form.depot_name) { toast.error('Depot Name required'); return; }
    try {
      await axios.post(`${API}/dc-stacks`, form);
      toast.success('Stack created!');
      setShowForm(false);
      setForm(blankStack);
      fetchStacks();
    } catch (e) { toast.error('Save failed'); }
  };

  const handleDeleteStack = async (id) => {
    if (!window.confirm('Delete this stack and all lots?')) return;
    try {
      await axios.delete(`${API}/dc-stacks/${id}`);
      toast.success('Stack deleted');
      if (selectedStack?.id === id) setSelectedStack(null);
      fetchStacks();
    } catch (e) { toast.error('Delete failed'); }
  };

  const handleAddLot = async () => {
    if (!lotForm.bags && !lotForm.nett_weight_qtl) { toast.error('Bags ya Weight dalein'); return; }
    try {
      await axios.post(`${API}/dc-stacks/${lotDialog.stackId}/lots`, lotForm);
      toast.success('Lot added!');
      setLotDialog({ open: false, stackId: null, stackInfo: '' });
      setLotForm({ date: new Date().toISOString().split('T')[0], agency: '', lot_ack_no: '', no_of_trucks: 1, bags: '', nett_weight_qtl: '', status: 'delivered' });
      fetchStacks();
    } catch (e) { toast.error('Lot save failed'); }
  };

  const handleDeleteLot = async (stackId, lotId) => {
    try {
      await axios.delete(`${API}/dc-stacks/${stackId}/lots/${lotId}`);
      toast.success('Lot deleted');
      fetchStacks();
    } catch (e) { toast.error('Delete failed'); }
  };

  const toggleLotStatus = async (stackId, lot) => {
    const newStatus = lot.status === 'delivered' ? 'pending' : 'delivered';
    try {
      await axios.put(`${API}/dc-stacks/${stackId}/lots/${lot.id}`, { status: newStatus });
      fetchStacks();
    } catch (e) { toast.error('Update failed'); }
  };

  return (
    <div className="space-y-3" data-testid="dc-stacks">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Stacks</h3>
        <Button size="sm" onClick={() => { setForm(blankStack); setShowForm(true); }} className="bg-emerald-600 hover:bg-emerald-500 text-white" data-testid="new-stack-btn">
          <Plus className="w-4 h-4 mr-1" /> New Stack
        </Button>
      </div>

      {/* Stack Cards */}
      {loading ? <p className="text-slate-400 text-sm py-4 text-center">Loading...</p>
       : stacks.length === 0 ? <p className="text-slate-400 text-sm py-8 text-center">Koi stack nahi. "New Stack" se add karein.</p>
       : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {stacks.map(stack => {
            const status = getStackStatus(stack);
            return (
            <div key={stack.id} className={`bg-white border rounded-lg shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow ${status.badge?.label === 'CANCELLED' ? 'border-red-400' : status.badge?.label === 'LAPSED' ? 'border-orange-400' : 'border-slate-200'}`} onClick={() => setSelectedStack(selectedStack?.id === stack.id ? null : stack)} data-testid={`stack-card-${stack.id}`}>
              {/* Header */}
              <div className={`text-white px-3 py-2 flex items-center justify-between ${status.headerColor || 'bg-emerald-600'}`}>
                <span className="font-bold text-sm">{stack.depot_name} - {stack.depot_code} # Stack: {stack.stack_no || '-'}</span>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-white/70 hover:text-white hover:bg-black/20" onClick={e => { e.stopPropagation(); handleDeleteStack(stack.id); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Status Badge */}
              {status.badge && (
                <div className={`px-3 py-1 text-center text-xs font-bold ${status.badge.color}`}>
                  {status.badge.label}
                </div>
              )}

              {/* Body */}
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-emerald-700 font-semibold text-xs">KMS {stack.kms_year} {stack.delivery_to} {stack.rice_type === 'parboiled' ? 'Usna' : 'Arwa'}</span>
                  <span className="text-red-500 font-bold text-xs">{stack.delivery_to === 'RRC' ? 'State CMR' : 'FCI CMR'}</span>
                </div>

                {(stack.tec || stack.booking_id) && (
                  <p className="text-slate-600 text-xs">TEC / Booking ID: {stack.tec || '-'} / {stack.booking_id || '-'}</p>
                )}

                <div className="text-center py-2">
                  <span className="text-4xl font-black text-red-500">{stack.lots_delivered || 0}/{stack.total_lots || stack.lots_total || 0}</span>
                </div>

                {/* Deadlines */}
                <div className="space-y-1.5 border-t border-slate-100 pt-2 text-xs">
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="font-bold text-slate-700">Allotted:</span>
                    <span className="text-slate-600">{daysAgo(stack.allotted_date)} <span className="text-slate-400">[{fmtDate(stack.allotted_date)}]</span></span>
                  </div>
                  {status.deadlines.map((dl, i) => (
                    <div key={i} className="flex justify-between border-b border-slate-100 pb-1">
                      <span className={`font-bold ${dl.color}`}>{dl.label}:</span>
                      <span className={`${dl.bold ? 'font-bold' : 'font-semibold'} ${dl.color}`}>{dl.value}</span>
                    </div>
                  ))}
                  {stack.last_delivered_date && (
                    <div className="flex justify-between border-b border-slate-100 pb-1">
                      <span className="font-bold text-slate-700">Last Delivered:</span>
                      <span className="text-slate-600">{daysAgo(stack.last_delivered_date)} <span className="text-slate-400">[{fmtDate(stack.last_delivered_date)}]</span></span>
                    </div>
                  )}
                </div>

                {stack.restricted_transport && (
                  <p className="text-emerald-600 font-semibold text-xs">Opted Restricted Transportation</p>
                )}

                {/* Lot Details */}
                <div className="pt-1">
                  <p className="text-slate-700 font-bold text-xs mb-1">LOT Details</p>
                  <div className="flex flex-wrap gap-1">
                    {(stack.lots || []).map(lot => (
                      <button key={lot.id} onClick={e => { e.stopPropagation(); toggleLotStatus(stack.id, lot); }}
                        className={`w-8 h-8 rounded text-xs font-bold border ${lot.status === 'delivered' ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-amber-100 text-amber-700 border-amber-300'}`}
                        title={`Lot ${lot.lot_number} - ${lot.status} | ${lot.bags || 0} bags | ${lot.nett_weight_qtl || 0} Q\nClick to toggle status`}
                        data-testid={`lot-btn-${lot.id}`}>
                        {lot.lot_number}
                      </button>
                    ))}
                    <button onClick={e => { e.stopPropagation(); setLotDialog({ open: true, stackId: stack.id, stackInfo: `TEC: ${stack.tec || '-'} ${stack.depot_code || ''} ${stack.depot_name || ''} ${stack.kms_year || ''} ${stack.delivery_to || ''}` }); }}
                      className="w-8 h-8 rounded text-xs font-bold border border-blue-300 bg-white text-blue-600 hover:bg-blue-50"
                      data-testid={`lot-add-${stack.id}`}>
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );})}
        </div>
      )}

      {/* Selected Stack Detail - Show lots table */}
      {selectedStack && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mt-3" data-testid="stack-detail">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-amber-400 font-bold text-sm">{selectedStack.depot_name} - Stack {selectedStack.stack_no} | Lots</h4>
            <Button size="sm" variant="ghost" className="text-slate-400" onClick={() => setSelectedStack(null)}>Close</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-600 text-slate-400">
                <th className="py-1 px-2 text-left">#</th>
                <th className="py-1 px-2 text-left">Date</th>
                <th className="py-1 px-2 text-left">Agency</th>
                <th className="py-1 px-2 text-left">LOT/ACK No</th>
                <th className="py-1 px-2 text-right">Trucks</th>
                <th className="py-1 px-2 text-right">Bags</th>
                <th className="py-1 px-2 text-right">Weight(Q)</th>
                <th className="py-1 px-2 text-center">Status</th>
                <th className="py-1 px-2"></th>
              </tr></thead>
              <tbody>
                {(selectedStack.lots || []).map(lot => (
                  <tr key={lot.id} className="border-b border-slate-700">
                    <td className="py-1.5 px-2 text-white font-bold">{lot.lot_number}</td>
                    <td className="py-1.5 px-2 text-slate-300">{fmtDate(lot.date)}</td>
                    <td className="py-1.5 px-2 text-slate-300">{lot.agency || '-'}</td>
                    <td className="py-1.5 px-2 text-amber-400 font-semibold">{lot.lot_ack_no || '-'}</td>
                    <td className="py-1.5 px-2 text-right text-slate-300">{lot.no_of_trucks || '-'}</td>
                    <td className="py-1.5 px-2 text-right text-slate-300">{lot.bags || '-'}</td>
                    <td className="py-1.5 px-2 text-right text-green-400 font-semibold">{lot.nett_weight_qtl || '-'}</td>
                    <td className="py-1.5 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${lot.status === 'delivered' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {lot.status === 'delivered' ? 'Delivered' : 'Pending'}
                      </span>
                    </td>
                    <td className="py-1.5 px-2">
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400" onClick={() => handleDeleteLot(selectedStack.id, lot.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {(selectedStack.lots || []).length === 0 && (
                  <tr><td colSpan={9} className="py-4 text-center text-slate-500">Koi lot nahi. "+" button se add karein.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Stack Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg">
          <DialogHeader><DialogTitle className="text-amber-400">New Stack</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-[10px] text-slate-400">Depot Name</Label>
                <Input value={form.depot_name} onChange={e => setForm(p=>({...p,depot_name:e.target.value}))} className="h-8 text-xs bg-slate-700 border-slate-600" data-testid="stack-depot-name" /></div>
              <div><Label className="text-[10px] text-slate-400">Depot Code</Label>
                <Input value={form.depot_code} onChange={e => setForm(p=>({...p,depot_code:e.target.value}))} className="h-8 text-xs bg-slate-700 border-slate-600" data-testid="stack-depot-code" /></div>
              <div><Label className="text-[10px] text-slate-400">Stack No.</Label>
                <Input value={form.stack_no} onChange={e => setForm(p=>({...p,stack_no:e.target.value}))} className="h-8 text-xs bg-slate-700 border-slate-600" data-testid="stack-no" /></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-[10px] text-slate-400">Delivery To</Label>
                <Select value={form.delivery_to} onValueChange={v => setForm(p=>({...p,delivery_to:v}))}>
                  <SelectTrigger className="h-8 text-xs bg-slate-700 border-slate-600"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="FCI">FCI</SelectItem><SelectItem value="RRC">RRC</SelectItem></SelectContent>
                </Select></div>
              <div><Label className="text-[10px] text-slate-400">Rice Type</Label>
                <Select value={form.rice_type} onValueChange={v => setForm(p=>({...p,rice_type:v}))}>
                  <SelectTrigger className="h-8 text-xs bg-slate-700 border-slate-600"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="parboiled">Usna (Parboiled)</SelectItem><SelectItem value="raw">Arwa (Raw)</SelectItem></SelectContent>
                </Select></div>
              <div><Label className="text-[10px] text-slate-400">Total Lots</Label>
                <Input type="number" value={form.total_lots} onChange={e => setForm(p=>({...p,total_lots:e.target.value}))} className="h-8 text-xs bg-slate-700 border-slate-600" data-testid="stack-total-lots" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-[10px] text-slate-400">TEC</Label>
                <Input value={form.tec} onChange={e => setForm(p=>({...p,tec:e.target.value}))} className="h-8 text-xs bg-slate-700 border-slate-600" data-testid="stack-tec" /></div>
              <div><Label className="text-[10px] text-slate-400">Booking ID</Label>
                <Input value={form.booking_id} onChange={e => setForm(p=>({...p,booking_id:e.target.value}))} className="h-8 text-xs bg-slate-700 border-slate-600" data-testid="stack-booking-id" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-[10px] text-slate-400">Allotted Date</Label>
                <Input type="date" value={form.allotted_date} onChange={e => setForm(p=>({...p,allotted_date:e.target.value}))} className="h-8 text-xs bg-slate-700 border-slate-600" /></div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.restricted_transport || false} onChange={e => setForm(p=>({...p,restricted_transport:e.target.checked}))} className="rounded" />
                  <span className="text-xs text-emerald-400">Restricted Transportation</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setShowForm(false)} className="text-slate-400">Cancel</Button>
              <Button onClick={handleSaveStack} className="bg-emerald-600 hover:bg-emerald-500 text-white" data-testid="stack-save-btn">Save Stack</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Lot Dialog */}
      <Dialog open={lotDialog.open} onOpenChange={v => setLotDialog(p => ({ ...p, open: v }))}>
        <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-md">
          <DialogHeader><DialogTitle className="text-slate-700">Generate Consignment/ACK/Lot No</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-600 border-b pb-2">{lotDialog.stackInfo}</p>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs text-slate-600 font-bold">Date</Label>
                <Input type="date" value={lotForm.date} onChange={e => setLotForm(p=>({...p,date:e.target.value}))} className="h-9 text-sm" /></div>
              <div><Label className="text-xs text-slate-600 font-bold">Agency</Label>
                <Input value={lotForm.agency} onChange={e => setLotForm(p=>({...p,agency:e.target.value}))} placeholder="Choose" className="h-9 text-sm" /></div>
              <div><Label className="text-xs text-slate-600 font-bold">LOT/ACK No</Label>
                <Input value={lotForm.lot_ack_no} onChange={e => setLotForm(p=>({...p,lot_ack_no:e.target.value}))} className="h-9 text-sm" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs text-slate-600 font-bold">No Of Trucks</Label>
                <Input type="number" value={lotForm.no_of_trucks} onChange={e => setLotForm(p=>({...p,no_of_trucks:e.target.value}))} className="h-9 text-sm bg-slate-100" /></div>
              <div><Label className="text-xs text-slate-600 font-bold">Bags</Label>
                <Input type="number" value={lotForm.bags} onChange={e => setLotForm(p=>({...p,bags:e.target.value}))} className="h-9 text-sm bg-slate-100" /></div>
              <div><Label className="text-xs text-slate-600 font-bold">Nett Weight (In Qtl)</Label>
                <Input type="number" value={lotForm.nett_weight_qtl} onChange={e => setLotForm(p=>({...p,nett_weight_qtl:e.target.value}))} className="h-9 text-sm bg-slate-100" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button variant="outline" onClick={() => setLotDialog({ open: false, stackId: null, stackInfo: '' })} className="text-slate-600">Close</Button>
              <Button onClick={handleAddLot} className="bg-blue-600 hover:bg-blue-500 text-white" data-testid="lot-save-btn">Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
