import { useState, useEffect, useCallback } from "react";
import { fmtDate } from "@/utils/date";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, Wallet } from "lucide-react";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const API = (_isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '')) + '/api';

const GSTLedger = ({ filters }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showObDialog, setShowObDialog] = useState(false);
  const [obForm, setObForm] = useState({ igst: "", sgst: "", cgst: "" });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/gst-ledger?${p}`);
      setData(res.data);
    } catch { toast.error("GST Ledger load failed"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openObDialog = async () => {
    try {
      const ky = filters.kms_year || "2025-2026";
      const res = await axios.get(`${API}/gst-ledger/opening-balance?kms_year=${ky}`);
      setObForm({ igst: String(res.data.igst || 0), sgst: String(res.data.sgst || 0), cgst: String(res.data.cgst || 0) });
      setShowObDialog(true);
    } catch { toast.error("OB load failed"); }
  };

  const saveOb = async () => {
    try {
      const ky = filters.kms_year || "2025-2026";
      await axios.put(`${API}/gst-ledger/opening-balance`, {
        kms_year: ky, igst: parseFloat(obForm.igst) || 0, sgst: parseFloat(obForm.sgst) || 0, cgst: parseFloat(obForm.cgst) || 0
      });
      toast.success("GST Opening Balance saved!"); setShowObDialog(false); fetchData();
    } catch { toast.error("Save failed"); }
  };

  if (loading) return <p className="text-slate-400 text-center py-8">Loading GST Ledger...</p>;
  if (!data) return null;

  const { opening_balance: ob, entries, summary } = data;
  const bal = summary.balance;

  return (
    <div className="space-y-3" data-testid="gst-ledger">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card className="bg-purple-900/30 border-purple-700/40"><CardContent className="p-3">
          <p className="text-[10px] text-purple-400 font-semibold">Opening Balance</p>
          <p className="text-xs text-slate-300 mt-1">CGST: <span className="font-bold text-white">Rs.{(ob.cgst || 0).toLocaleString('en-IN')}</span></p>
          <p className="text-xs text-slate-300">SGST: <span className="font-bold text-white">Rs.{(ob.sgst || 0).toLocaleString('en-IN')}</span></p>
          <p className="text-xs text-slate-300">IGST: <span className="font-bold text-white">Rs.{(ob.igst || 0).toLocaleString('en-IN')}</span></p>
        </CardContent></Card>
        <Card className="bg-green-900/30 border-green-700/40"><CardContent className="p-3">
          <p className="text-[10px] text-green-400 font-semibold">GST Credit (Purchase)</p>
          <p className="text-xs text-slate-300 mt-1">CGST: <span className="font-bold text-green-400">+Rs.{summary.credit.cgst.toLocaleString('en-IN')}</span></p>
          <p className="text-xs text-slate-300">SGST: <span className="font-bold text-green-400">+Rs.{summary.credit.sgst.toLocaleString('en-IN')}</span></p>
          <p className="text-xs text-slate-300">IGST: <span className="font-bold text-green-400">+Rs.{summary.credit.igst.toLocaleString('en-IN')}</span></p>
        </CardContent></Card>
        <Card className="bg-red-900/30 border-red-700/40"><CardContent className="p-3">
          <p className="text-[10px] text-red-400 font-semibold">GST Debit (Sale)</p>
          <p className="text-xs text-slate-300 mt-1">CGST: <span className="font-bold text-red-400">-Rs.{summary.debit.cgst.toLocaleString('en-IN')}</span></p>
          <p className="text-xs text-slate-300">SGST: <span className="font-bold text-red-400">-Rs.{summary.debit.sgst.toLocaleString('en-IN')}</span></p>
          <p className="text-xs text-slate-300">IGST: <span className="font-bold text-red-400">-Rs.{summary.debit.igst.toLocaleString('en-IN')}</span></p>
        </CardContent></Card>
        <Card className="bg-blue-900/30 border-blue-700/40"><CardContent className="p-3">
          <p className="text-[10px] text-blue-400 font-semibold">Current Balance</p>
          <p className="text-xs text-slate-300 mt-1">CGST: <span className={`font-bold ${bal.cgst >= 0 ? 'text-blue-400' : 'text-red-400'}`}>Rs.{bal.cgst.toLocaleString('en-IN')}</span></p>
          <p className="text-xs text-slate-300">SGST: <span className={`font-bold ${bal.sgst >= 0 ? 'text-blue-400' : 'text-red-400'}`}>Rs.{bal.sgst.toLocaleString('en-IN')}</span></p>
          <p className="text-xs text-slate-300">IGST: <span className={`font-bold ${bal.igst >= 0 ? 'text-blue-400' : 'text-red-400'}`}>Rs.{bal.igst.toLocaleString('en-IN')}</span></p>
        </CardContent></Card>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
        <Button onClick={openObDialog} variant="outline" size="sm" className="border-purple-600 text-purple-400 hover:bg-purple-900/30" data-testid="gst-ob-btn">
          <Wallet className="w-4 h-4 mr-1" /> GST Opening Balance
        </Button>
      </div>

      {/* GST Ledger Table */}
      <Card className="bg-slate-800 border-slate-700"><CardContent className="p-0"><div className="overflow-x-auto">
        <Table className="w-full table-auto"><TableHeader><TableRow className="border-slate-700 hover:bg-transparent">
          <TableHead className="text-slate-300 text-xs">Date</TableHead>
          <TableHead className="text-slate-300 text-xs">Type</TableHead>
          <TableHead className="text-slate-300 text-xs">Voucher</TableHead>
          <TableHead className="text-slate-300 text-xs">Party</TableHead>
          <TableHead className="text-slate-300 text-xs text-right">CGST</TableHead>
          <TableHead className="text-slate-300 text-xs text-right">SGST</TableHead>
          <TableHead className="text-slate-300 text-xs text-right">IGST</TableHead>
          <TableHead className="text-slate-300 text-xs text-right">Bal CGST</TableHead>
          <TableHead className="text-slate-300 text-xs text-right">Bal SGST</TableHead>
          <TableHead className="text-slate-300 text-xs text-right">Bal IGST</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {entries.length === 0 ? <TableRow><TableCell colSpan={10} className="text-center text-slate-400 py-8">Koi GST transaction nahi hai</TableCell></TableRow>
          : entries.map((e, i) => (
            <TableRow key={i} className="border-slate-700">
              <TableCell className="text-slate-200 text-xs">{fmtDate(e.date)}</TableCell>
              <TableCell className="text-xs">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${e.direction === 'credit' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {e.voucher_type} ({e.direction === 'credit' ? '+' : '-'})
                </span>
              </TableCell>
              <TableCell className="text-amber-400 text-xs">#{e.voucher_no}</TableCell>
              <TableCell className="text-slate-300 text-xs">{e.party}</TableCell>
              <TableCell className={`text-xs text-right font-medium ${e.direction === 'credit' ? 'text-green-400' : 'text-red-400'}`}>{e.cgst > 0 ? `${e.direction === 'credit' ? '+' : '-'}${e.cgst}` : '-'}</TableCell>
              <TableCell className={`text-xs text-right font-medium ${e.direction === 'credit' ? 'text-green-400' : 'text-red-400'}`}>{e.sgst > 0 ? `${e.direction === 'credit' ? '+' : '-'}${e.sgst}` : '-'}</TableCell>
              <TableCell className={`text-xs text-right font-medium ${e.direction === 'credit' ? 'text-green-400' : 'text-red-400'}`}>{e.igst > 0 ? `${e.direction === 'credit' ? '+' : '-'}${e.igst}` : '-'}</TableCell>
              <TableCell className={`text-xs text-right ${e.running_cgst >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{e.running_cgst}</TableCell>
              <TableCell className={`text-xs text-right ${e.running_sgst >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{e.running_sgst}</TableCell>
              <TableCell className={`text-xs text-right ${e.running_igst >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{e.running_igst}</TableCell>
            </TableRow>
          ))}
        </TableBody></Table>
      </div></CardContent></Card>

      {/* GST Opening Balance Dialog */}
      <Dialog open={showObDialog} onOpenChange={setShowObDialog}>
        <DialogContent className="max-w-sm bg-slate-800 border-slate-700 text-white" data-testid="gst-ob-dialog">
          <DialogHeader><DialogTitle className="text-purple-400">GST Opening Balance (FY: {filters.kms_year})</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs text-slate-400">CGST Opening Balance (Rs.)</Label>
              <Input type="number" step="0.01" value={obForm.cgst} onChange={e => setObForm(p => ({ ...p, cgst: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gst-ob-cgst" /></div>
            <div><Label className="text-xs text-slate-400">SGST Opening Balance (Rs.)</Label>
              <Input type="number" step="0.01" value={obForm.sgst} onChange={e => setObForm(p => ({ ...p, sgst: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gst-ob-sgst" /></div>
            <div><Label className="text-xs text-slate-400">IGST Opening Balance (Rs.)</Label>
              <Input type="number" step="0.01" value={obForm.igst} onChange={e => setObForm(p => ({ ...p, igst: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="gst-ob-igst" /></div>
            <Button onClick={saveOb} className="w-full bg-purple-600 hover:bg-purple-700 text-white" data-testid="gst-ob-save">Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GSTLedger;
