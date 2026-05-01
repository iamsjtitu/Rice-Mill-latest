import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { fmtDate } from "@/utils/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Star, Trash2, Plus, RefreshCw, Download, FileText, IndianRupee } from "lucide-react";
import { useConfirm } from "../ConfirmProvider";
import RoundOffInput from "../common/RoundOffInput";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

const DieselAccount = ({ filters, user }) => {
  const showConfirm = useConfirm();
  const [pumps, setPumps] = useState([]);
  const [summary, setSummary] = useState(null);
  const [txns, setTxns] = useState([]);
  const [selectedPump, setSelectedPump] = useState("all");
  const [loading, setLoading] = useState(true);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterTruck, setFilterTruck] = useState("");
  const [showAddPump, setShowAddPump] = useState(false);
  const [newPumpName, setNewPumpName] = useState("");
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [payPumpId, setPayPumpId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState("");
  const [payRoundOff, setPayRoundOff] = useState("");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (selectedPump !== "all") p.append('pump_id', selectedPump);
      if (filterDateFrom) p.append('date_from', filterDateFrom);
      if (filterDateTo) p.append('date_to', filterDateTo);
      if (filterType !== "all") p.append('txn_type', filterType);
      if (filterTruck.trim()) p.append('truck_no', filterTruck.trim());
      const [pRes, sRes, tRes] = await Promise.all([
        axios.get(`${API}/diesel-pumps`),
        axios.get(`${API}/diesel-accounts/summary?${p}`),
        axios.get(`${API}/diesel-accounts?${p}`)
      ]);
      setPumps(pRes.data || []);
      setSummary(sRes.data);
      setTxns(tRes.data || []);
    } catch (e) { toast.error("Diesel data load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, selectedPump, filterDateFrom, filterDateTo, filterType, filterTruck]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddPump = async () => {
    if (!newPumpName.trim()) return;
    try {
      await axios.post(`${API}/diesel-pumps`, { name: newPumpName.trim(), is_default: pumps.length === 0 });
      toast.success("Pump add ho gaya!"); setNewPumpName(""); setShowAddPump(false); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const handleSetDefault = async (pumpId) => {
    try {
      await axios.put(`${API}/diesel-pumps/${pumpId}/set-default`);
      toast.success("Default pump set!"); fetchData();
    } catch (e) { toast.error("Error"); }
  };

  const handleDeletePump = async (pumpId) => {
    if (!await showConfirm("Delete Pump", "Pump delete karein?")) return;
    try {
      await axios.delete(`${API}/diesel-pumps/${pumpId}`);
      toast.success("Pump deleted"); fetchData();
    } catch (e) { toast.error("Error"); }
  };

  const handlePay = async () => {
    const amt = parseFloat(payAmount);
    if (!payPumpId || !amt || amt <= 0) { toast.error("Pump aur amount bharein"); return; }
    try {
      await axios.post(`${API}/diesel-accounts/pay?username=${user.username}`, {
        pump_id: payPumpId, amount: amt, date: payDate,
        kms_year: filters.kms_year || "", season: filters.season || "", notes: payNotes,
        round_off: parseFloat(payRoundOff) || 0,
      });
      toast.success(`Rs.${amt} payment recorded!`);
      setShowPayDialog(false); setPayAmount(""); setPayNotes(""); setPayRoundOff(""); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const handleDeleteTxn = async (id) => {
    if (!await showConfirm("Delete", "Transaction delete karein?")) return;
    try { await axios.delete(`${API}/diesel-accounts/${id}`); toast.success("Deleted"); setDieselSelectedIds(prev => prev.filter(x => x !== id)); fetchData(); }
    catch (e) { toast.error("Error"); }
  };

  const [dieselSelectedIds, setDieselSelectedIds] = useState([]);
  const handleDieselBulkDelete = async () => {
    if (dieselSelectedIds.length === 0) return;
    if (!await showConfirm("Bulk Delete", `Kya aap ${dieselSelectedIds.length} transactions delete karna chahte hain?`)) return;
    try {
      await axios.post(`${API}/diesel-accounts/delete-bulk`, { ids: dieselSelectedIds });
      toast.success(`${dieselSelectedIds.length} transactions deleted!`);
      setDieselSelectedIds([]); fetchData();
    } catch (e) { toast.error("Bulk delete nahi hua"); }
  };
  const toggleDieselSelect = (id) => {
    setDieselSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleDieselSelectAll = () => {
    setDieselSelectedIds(prev => prev.length === txns.length ? [] : txns.map(t => t.id));
  };

  return (
    <div className="space-y-4" data-testid="diesel-account-tab">
      {/* Pump Management */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-slate-400 text-sm font-medium">Pumps:</span>
        {pumps.map(p => (
          <div key={p.id} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border ${p.is_default ? 'border-orange-500 bg-orange-900/20 text-orange-300' : 'border-slate-600 bg-slate-800 text-slate-300'}`}>
            {p.is_default && <Star className="w-3 h-3 text-orange-400 fill-orange-400" />}
            <span>{p.name}</span>
            {!p.is_default && user.role === 'admin' && (
              <button onClick={() => handleSetDefault(p.id)} className="text-[9px] text-slate-500 hover:text-orange-400 ml-1" title="Set as default">Default</button>
            )}
            {user.role === 'admin' && (
              <button onClick={() => handleDeletePump(p.id)} className="text-red-400 hover:text-red-300 ml-1"><Trash2 className="w-3 h-3" /></button>
            )}
          </div>
        ))}
        {user.role === 'admin' && !showAddPump && (
          <Button onClick={() => setShowAddPump(true)} variant="outline" size="sm" className="h-7 text-xs border-slate-600 text-slate-400" data-testid="add-pump-btn">
            <Plus className="w-3 h-3 mr-1" /> Add Pump
          </Button>
        )}
        {showAddPump && (
          <div className="flex items-center gap-1">
            <Input value={newPumpName} onChange={e => setNewPumpName(e.target.value)} placeholder="Pump name" className="h-7 w-40 bg-slate-700 border-slate-600 text-white text-xs" data-testid="new-pump-name" onKeyDown={e => e.key === 'Enter' && handleAddPump()} />
            <Button onClick={handleAddPump} size="sm" className="h-7 text-xs bg-orange-500 text-white">Save</Button>
            <Button onClick={() => setShowAddPump(false)} variant="ghost" size="sm" className="h-7 text-xs text-slate-400">X</Button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {summary.pumps?.map(p => (
            <Card key={p.pump_id} className={`border-slate-700 ${p.is_default ? 'bg-gradient-to-br from-orange-900/30 to-slate-800 border-orange-800/30' : 'bg-slate-800'}`}>
              <CardContent className="p-3">
                <div className="flex items-center gap-1 mb-1">
                  {p.is_default && <Star className="w-3 h-3 text-orange-400 fill-orange-400" />}
                  <p className="text-[10px] text-slate-400 truncate">{p.pump_name}</p>
                </div>
                <p className="text-lg font-bold text-red-400">Rs.{p.balance.toLocaleString('en-IN')}</p>
                <div className="flex gap-2 text-[10px] mt-1">
                  {p.opening_balance > 0 && <span className="text-yellow-400">OB: Rs.{p.opening_balance.toLocaleString('en-IN')}</span>}
                  <span className="text-orange-400">Diesel: Rs.{p.total_diesel.toLocaleString('en-IN')}</span>
                  <span className="text-green-400">Paid: Rs.{p.total_paid.toLocaleString('en-IN')}</span>
                </div>
                <p className="text-[9px] text-slate-500">{p.txn_count} entries</p>
                <Button onClick={() => { setPayPumpId(p.pump_id); setShowPayDialog(true); }} size="sm" className="mt-2 h-6 text-[10px] bg-emerald-600 hover:bg-emerald-700 w-full" data-testid={`pay-pump-${p.pump_id}`}>
                  <IndianRupee className="w-3 h-3 mr-0.5" /> Pay / Settle
                </Button>
              </CardContent>
            </Card>
          ))}
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-3">
              <p className="text-[10px] text-white font-medium">Grand Total</p>
              <p className="text-lg font-bold text-white">Rs.{(summary.grand_balance || 0).toLocaleString('en-IN')}</p>
              <div className="flex gap-2 text-[10px] mt-1">
                <span className="text-orange-400">Total: Rs.{(summary.grand_total_diesel || 0).toLocaleString('en-IN')}</span>
                <span className="text-green-400">Paid: Rs.{(summary.grand_total_paid || 0).toLocaleString('en-IN')}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-end">
        <div className="flex flex-col">
          <label className="text-[10px] text-slate-400 mb-0.5">From Date</label>
          <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
            className="h-8 w-36 bg-slate-700 border-slate-600 text-white text-xs" data-testid="diesel-filter-date-from" />
        </div>
        <div className="flex flex-col">
          <label className="text-[10px] text-slate-400 mb-0.5">To Date</label>
          <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
            className="h-8 w-36 bg-slate-700 border-slate-600 text-white text-xs" data-testid="diesel-filter-date-to" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-32 bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="diesel-filter-type"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="debit">Diesel</SelectItem>
            <SelectItem value="payment">Payment</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Truck No..." value={filterTruck} onChange={e => setFilterTruck(e.target.value)}
          className="h-8 w-36 bg-slate-700 border-slate-600 text-white text-xs" data-testid="diesel-filter-truck"
          onKeyDown={e => e.key === 'Enter' && fetchData()} />
        <Select value={selectedPump} onValueChange={setSelectedPump}>
          <SelectTrigger className="w-40 bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="diesel-pump-filter"><SelectValue placeholder="All Pumps" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Pumps</SelectItem>
            {pumps.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {(filterDateFrom || filterDateTo || filterType !== "all" || filterTruck) && (
          <Button onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); setFilterType("all"); setFilterTruck(""); }}
            variant="ghost" size="sm" className="h-8 text-xs text-red-400 hover:bg-slate-700" data-testid="diesel-clear-filters">
            Clear Filters
          </Button>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300"><RefreshCw className="w-4 h-4" /></Button>
        <Button onClick={async () => { try { const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); const { downloadFile } = await import('../../utils/download'); const { buildFilename } = await import('../../utils/filename-format'); const fname = buildFilename({ base: 'diesel-account', kmsYear: filters.kms_year, ext: 'xlsx' }); downloadFile(`/api/diesel-accounts/excel?${p}`, fname); } catch (e) { toast.error("Excel export failed"); } }} variant="outline" size="sm" className="border-slate-600 text-green-400 hover:bg-slate-700" data-testid="diesel-export-excel"><Download className="w-4 h-4" /></Button>
        <Button onClick={async () => { try { const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); const { downloadFile } = await import('../../utils/download'); const { buildFilename } = await import('../../utils/filename-format'); const fname = buildFilename({ base: 'diesel-account', kmsYear: filters.kms_year, ext: 'pdf' }); downloadFile(`/api/diesel-accounts/pdf?${p}`, fname); } catch (e) { toast.error("PDF export failed"); } }} variant="outline" size="sm" className="border-slate-600 text-red-400 hover:bg-slate-700" data-testid="diesel-export-pdf"><FileText className="w-4 h-4" /></Button>
      </div>

      {/* Transactions Table */}
      <Card className="bg-slate-800 border-slate-700">
        {user.role === 'admin' && dieselSelectedIds.length > 0 && (
          <div className="px-4 pt-3">
            <Button onClick={handleDieselBulkDelete} variant="destructive" size="sm" className="h-7 text-xs" data-testid="diesel-bulk-delete">
              <Trash2 className="w-3 h-3 mr-1" /> Delete Selected ({dieselSelectedIds.length})
            </Button>
          </div>
        )}
        <CardContent className="p-0"><div className="overflow-x-auto">
        <Table><TableHeader><TableRow className="border-slate-700 hover:bg-transparent">
          {user.role === 'admin' && (
            <TableHead className="w-8">
              <input type="checkbox" checked={txns.length > 0 && dieselSelectedIds.length === txns.length} onChange={toggleDieselSelectAll}
                className="rounded border-slate-600" data-testid="diesel-select-all" />
            </TableHead>
          )}
          {['Date','Pump','Type','Truck No','Mandi','Amount (Rs.)','Description',''].map(h =>
            <TableHead key={h} className={`text-slate-300 text-xs ${h === 'Amount (Rs.)' ? 'text-right' : ''}`}>{h}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
          : txns.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8">Koi transaction nahi hai.</TableCell></TableRow>
          : txns.map(t => (
            <TableRow key={t.id} className={`border-slate-700 ${t.txn_type === 'payment' ? 'bg-green-900/10' : 'bg-orange-900/5'} ${dieselSelectedIds.includes(t.id) ? 'ring-1 ring-orange-400' : ''}`} data-testid={`diesel-row-${t.id}`}>
              {user.role === 'admin' && (
                <TableCell className="w-8">
                  <input type="checkbox" checked={dieselSelectedIds.includes(t.id)} onChange={() => toggleDieselSelect(t.id)}
                    className="rounded border-slate-600" data-testid={`diesel-select-${t.id}`} />
                </TableCell>
              )}
              <TableCell className="text-white text-xs">{fmtDate(t.date)}</TableCell>
              <TableCell className="text-slate-300 text-xs">{t.pump_name}</TableCell>
              <TableCell className="text-xs"><span className={t.txn_type === 'payment' ? 'text-green-400 font-medium' : 'text-orange-400'}>{t.txn_type === 'payment' ? 'PAYMENT' : 'DIESEL'}</span></TableCell>
              <TableCell className="text-slate-300 text-xs">{t.truck_no || '-'}</TableCell>
              <TableCell className="text-slate-300 text-xs">{t.mandi_name || t.agent_name || '-'}</TableCell>
              <TableCell className={`text-xs text-right font-medium ${t.txn_type === 'payment' ? 'text-green-400' : 'text-orange-400'}`}>{t.txn_type === 'payment' ? '-' : ''}Rs.{t.amount?.toLocaleString('en-IN')}</TableCell>
              <TableCell className="text-slate-500 text-xs max-w-[200px] truncate">{t.description}</TableCell>
              <TableCell>{user.role === 'admin' && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => handleDeleteTxn(t.id)}><Trash2 className="w-3 h-3" /></Button>}</TableCell>
            </TableRow>
          ))}
        </TableBody></Table>
      </div></CardContent></Card>

      {/* Payment Dialog */}
      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-sm" data-testid="diesel-pay-dialog">
          <DialogHeader><DialogTitle className="text-emerald-400">Diesel Payment / Settlement</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs text-slate-400">Pump</Label>
              <Select value={payPumpId} onValueChange={setPayPumpId}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="diesel-pay-pump"><SelectValue placeholder="Select Pump" /></SelectTrigger>
                <SelectContent>{pumps.map(p => <SelectItem key={p.id} value={p.id}>{p.name} {p.is_default ? '(Default)' : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-400">Amount (Rs.)</Label>
                <Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Amount" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="diesel-pay-amount" /></div>
              <div><Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="diesel-pay-date" /></div>
            </div>
            <div><Label className="text-xs text-slate-400">Notes</Label>
              <Input value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Optional notes" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="diesel-pay-notes" /></div>
            {payPumpId && summary?.pumps && (() => {
              const ps = summary.pumps.find(p => p.pump_id === payPumpId);
              return ps ? <p className="text-xs text-slate-400">Pending: <span className="text-red-400 font-bold">Rs.{ps.balance.toLocaleString('en-IN')}</span></p> : null;
            })()}
            <RoundOffInput value={payRoundOff} onChange={setPayRoundOff} amount={parseFloat(payAmount) || 0} />
            <div className="flex gap-2">
              <Button onClick={handlePay} className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1" data-testid="diesel-pay-submit">
                <IndianRupee className="w-4 h-4 mr-1" /> Pay
              </Button>
              <Button variant="outline" onClick={() => setShowPayDialog(false)} className="border-slate-600 text-slate-300">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DieselAccount;
