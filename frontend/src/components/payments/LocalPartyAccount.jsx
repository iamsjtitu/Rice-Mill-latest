import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  IndianRupee, RefreshCw, Download, FileText, Plus, Trash2, Handshake, Eye, ArrowLeft, Printer,
} from "lucide-react";

const BACKEND_URL = (typeof window !== 'undefined' && window.ELECTRON_API_URL) || process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LocalPartyAccount = ({ filters, user }) => {
  const [summary, setSummary] = useState(null);
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedParty, setSelectedParty] = useState(null);
  const [showSettleDialog, setShowSettleDialog] = useState(false);
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [settleParty, setSettleParty] = useState("");
  const [settleAmount, setSettleAmount] = useState("");
  const [settleDate, setSettleDate] = useState(new Date().toISOString().split('T')[0]);
  const [settleNotes, setSettleNotes] = useState("");
  const [manualForm, setManualForm] = useState({
    party_name: "", amount: "", date: new Date().toISOString().split('T')[0], description: ""
  });
  const [reportParty, setReportParty] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      if (selectedParty) p.append('party_name', selectedParty);
      const [sRes, tRes] = await Promise.all([
        axios.get(`${API}/local-party/summary?${p}`),
        axios.get(`${API}/local-party/transactions?${p}`)
      ]);
      setSummary(sRes.data);
      setTxns(tRes.data || []);
    } catch (e) {
      toast.error("Local party data load nahi hua");
    } finally {
      setLoading(false);
    }
  }, [filters.kms_year, filters.season, selectedParty]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSettle = async () => {
    const amt = parseFloat(settleAmount);
    if (!settleParty || !amt || amt <= 0) { toast.error("Party aur amount bharein"); return; }
    try {
      await axios.post(`${API}/local-party/settle`, {
        party_name: settleParty, amount: amt, date: settleDate,
        kms_year: filters.kms_year || "", season: filters.season || "",
        notes: settleNotes, created_by: user.username
      });
      toast.success(`Rs.${amt} payment to ${settleParty} recorded!`);
      setShowSettleDialog(false);
      setSettleAmount("");
      setSettleNotes("");
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const handleManualAdd = async () => {
    const amt = parseFloat(manualForm.amount);
    if (!manualForm.party_name.trim() || !amt || amt <= 0) {
      toast.error("Party name aur amount bharein");
      return;
    }
    try {
      await axios.post(`${API}/local-party/manual`, {
        ...manualForm, amount: amt,
        kms_year: filters.kms_year || "", season: filters.season || "",
        created_by: user.username
      });
      toast.success("Manual purchase add ho gaya!");
      setShowManualDialog(false);
      setManualForm({ party_name: "", amount: "", date: new Date().toISOString().split('T')[0], description: "" });
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const handleDeleteTxn = async (id) => {
    if (!window.confirm("Transaction delete karein?")) return;
    try {
      await axios.delete(`${API}/local-party/${id}`);
      toast.success("Deleted");
      fetchData();
    } catch (e) { toast.error("Delete nahi hua"); }
  };

  const handleExport = async (format) => {
    try {
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/local-party/${format}?${p}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `local_party_account.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      a.click();
    } catch (e) { toast.error(`${format.toUpperCase()} export failed`); }
  };

  const openPartyReport = async (partyName) => {
    setReportParty(partyName);
    setReportLoading(true);
    try {
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/local-party/report/${encodeURIComponent(partyName)}?${p}`);
      setReportData(res.data);
    } catch (e) { toast.error("Report load nahi hua"); }
    finally { setReportLoading(false); }
  };

  const handlePrintReport = () => {
    const el = document.getElementById('party-report-print');
    if (!el) return;
    const w = window.open('', '_blank', 'width=800,height=600');
    w.document.write(`<html><head><title>Party Report - ${reportParty}</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;color:#000}
      h2{text-align:center;margin-bottom:5px}
      .meta{text-align:center;color:#555;font-size:13px;margin-bottom:15px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#065f46;color:#fff;font-weight:bold}
      .debit{color:#c00}.payment{color:#090}
      .summary{margin-top:15px;font-size:13px}
      .summary span{margin-right:20px}
      @media print{body{margin:0;padding:10px}}</style></head><body>`);
    w.document.write(el.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  };

  return (
    <div className="space-y-4" data-testid="local-party-tab">
      {/* Actions bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {selectedParty && (
          <Button onClick={() => setSelectedParty(null)} variant="outline" size="sm" className="border-slate-600 text-slate-300" data-testid="local-party-back-btn">
            <ArrowLeft className="w-4 h-4 mr-1" /> All Parties
          </Button>
        )}
        {user.role === 'admin' && (
          <Button onClick={() => setShowManualDialog(true)} size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" data-testid="local-party-manual-btn">
            <Plus className="w-4 h-4 mr-1" /> Manual Purchase
          </Button>
        )}
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => handleExport('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400" data-testid="local-party-export-excel">
            <Download className="w-4 h-4 mr-1" /> Excel
          </Button>
          <Button onClick={() => handleExport('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400" data-testid="local-party-export-pdf">
            <FileText className="w-4 h-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Party Summary Cards */}
      {!selectedParty && summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {summary.parties?.map(p => (
            <Card key={p.party_name} className={`border-slate-700 bg-slate-800 cursor-pointer hover:border-teal-600 transition-colors`}
              onClick={() => setSelectedParty(p.party_name)} data-testid={`party-card-${p.party_name}`}>
              <CardContent className="p-3">
                <p className="text-sm text-white font-semibold truncate">{p.party_name}</p>
                <p className="text-lg font-bold text-red-400 mt-1">Rs.{p.balance.toLocaleString('en-IN')}</p>
                <div className="flex gap-2 text-[10px] mt-1">
                  <span className="text-orange-400">Debit: Rs.{p.total_debit.toLocaleString('en-IN')}</span>
                  <span className="text-green-400">Paid: Rs.{p.total_paid.toLocaleString('en-IN')}</span>
                </div>
                <p className="text-[9px] text-slate-500">{p.txn_count} entries</p>
                {user.role === 'admin' && p.balance > 0 && (
                  <Button
                    onClick={(e) => { e.stopPropagation(); setSettleParty(p.party_name); setShowSettleDialog(true); }}
                    size="sm" className="mt-2 h-6 text-[10px] bg-emerald-600 hover:bg-emerald-700 w-full"
                    data-testid={`settle-btn-${p.party_name}`}
                  >
                    <Handshake className="w-3 h-3 mr-0.5" /> Settle / Pay
                  </Button>
                )}
                <Button
                  onClick={(e) => { e.stopPropagation(); openPartyReport(p.party_name); }}
                  size="sm" variant="outline" className="mt-1 h-6 text-[10px] border-slate-600 text-slate-300 w-full"
                  data-testid={`report-btn-${p.party_name}`}
                >
                  <Printer className="w-3 h-3 mr-0.5" /> Report / Print
                </Button>
              </CardContent>
            </Card>
          ))}
          {/* Grand Total Card */}
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-3">
              <p className="text-[10px] text-white font-medium">Grand Total</p>
              <p className="text-lg font-bold text-white">Rs.{(summary.grand_balance || 0).toLocaleString('en-IN')}</p>
              <div className="flex gap-2 text-[10px] mt-1">
                <span className="text-orange-400">Total: Rs.{(summary.grand_total_debit || 0).toLocaleString('en-IN')}</span>
                <span className="text-green-400">Paid: Rs.{(summary.grand_total_paid || 0).toLocaleString('en-IN')}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Selected Party Header */}
      {selectedParty && summary && (() => {
        const ps = summary.parties?.find(p => p.party_name === selectedParty);
        return ps ? (
          <Card className="bg-gradient-to-r from-teal-900/30 to-slate-800 border-teal-800/30">
            <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg text-white font-bold">{ps.party_name}</p>
                <div className="flex gap-4 text-sm mt-1">
                  <span className="text-orange-400">Debit: Rs.{ps.total_debit.toLocaleString('en-IN')}</span>
                  <span className="text-green-400">Paid: Rs.{ps.total_paid.toLocaleString('en-IN')}</span>
                  <span className="text-red-400 font-bold">Balance: Rs.{ps.balance.toLocaleString('en-IN')}</span>
                </div>
              </div>
              {user.role === 'admin' && ps.balance > 0 && (
                <Button onClick={() => { setSettleParty(ps.party_name); setShowSettleDialog(true); }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white" size="sm">
                  <Handshake className="w-4 h-4 mr-1" /> Settle / Pay
                </Button>
              )}
              <Button onClick={() => openPartyReport(ps.party_name)}
                variant="outline" className="border-slate-600 text-slate-300" size="sm">
                <Printer className="w-4 h-4 mr-1" /> Report / Print
              </Button>
            </CardContent>
          </Card>
        ) : null;
      })()}

      {/* Transactions Table */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700 hover:bg-transparent">
                  {['Date', 'Party', 'Type', 'Amount (Rs.)', 'Description', 'Source', ''].map(h =>
                    <TableHead key={h} className={`text-slate-300 text-xs ${h === 'Amount (Rs.)' ? 'text-right' : ''}`}>{h}</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
                ) : txns.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">
                    Koi transaction nahi hai. Mill Parts ya Gunny Bags se auto aayenge.
                  </TableCell></TableRow>
                ) : txns.map(t => (
                  <TableRow key={t.id} className={`border-slate-700 ${t.txn_type === 'payment' ? 'bg-green-900/10' : 'bg-teal-900/5'}`} data-testid={`local-party-row-${t.id}`}>
                    <TableCell className="text-white text-xs">{t.date}</TableCell>
                    <TableCell className="text-white text-xs font-medium">{t.party_name}</TableCell>
                    <TableCell className="text-xs">
                      <span className={t.txn_type === 'payment' ? 'text-green-400 font-medium' : 'text-orange-400'}>
                        {t.txn_type === 'payment' ? 'PAYMENT' : 'PURCHASE'}
                      </span>
                    </TableCell>
                    <TableCell className={`text-xs text-right font-medium ${t.txn_type === 'payment' ? 'text-green-400' : 'text-orange-400'}`}>
                      {t.txn_type === 'payment' ? '-' : ''}Rs.{t.amount?.toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="text-slate-500 text-xs max-w-[200px] truncate">{t.description}</TableCell>
                    <TableCell className="text-xs">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        t.source_type === 'mill_part' ? 'bg-cyan-900/30 text-cyan-400' :
                        t.source_type === 'gunny_bag' ? 'bg-amber-900/30 text-amber-400' :
                        t.source_type === 'settlement' ? 'bg-green-900/30 text-green-400' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {t.source_type === 'mill_part' ? 'Mill Part' :
                         t.source_type === 'gunny_bag' ? 'Gunny Bag' :
                         t.source_type === 'settlement' ? 'Settlement' : 'Manual'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {user.role === 'admin' && (t.source_type === 'manual' || t.source_type === 'settlement') && (
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => handleDeleteTxn(t.id)} data-testid={`delete-local-txn-${t.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Settlement Dialog */}
      <Dialog open={showSettleDialog} onOpenChange={setShowSettleDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-sm" data-testid="local-party-settle-dialog">
          <DialogHeader>
            <DialogTitle className="text-emerald-400">Local Party Payment / Settlement</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-2 bg-slate-700/50 rounded">
              <p className="text-sm text-white font-medium">{settleParty}</p>
              {summary?.parties && (() => {
                const ps = summary.parties.find(p => p.party_name === settleParty);
                return ps ? <p className="text-xs text-slate-400">Pending: <span className="text-red-400 font-bold">Rs.{ps.balance.toLocaleString('en-IN')}</span></p> : null;
              })()}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Amount (Rs.)</Label>
                <Input type="number" value={settleAmount} onChange={e => setSettleAmount(e.target.value)}
                  placeholder="Amount" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="settle-amount-input" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={settleDate} onChange={e => setSettleDate(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="settle-date-input" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-400">Notes</Label>
              <Input value={settleNotes} onChange={e => setSettleNotes(e.target.value)}
                placeholder="Optional notes" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="settle-notes-input" />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSettle} className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1" data-testid="settle-submit-btn">
                <IndianRupee className="w-4 h-4 mr-1" /> Pay
              </Button>
              <Button variant="outline" onClick={() => setShowSettleDialog(false)} className="border-slate-600 text-slate-300">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Purchase Dialog */}
      <Dialog open={showManualDialog} onOpenChange={setShowManualDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-sm" data-testid="local-party-manual-dialog">
          <DialogHeader>
            <DialogTitle className="text-teal-400">Manual Purchase Add Karein</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-slate-400">Party Name *</Label>
              <Input value={manualForm.party_name} onChange={e => setManualForm(p => ({ ...p, party_name: e.target.value }))}
                placeholder="Vendor / Party name" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="manual-party-input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Amount (Rs.) *</Label>
                <Input type="number" value={manualForm.amount} onChange={e => setManualForm(p => ({ ...p, amount: e.target.value }))}
                  placeholder="Amount" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="manual-amount-input" />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Date</Label>
                <Input type="date" value={manualForm.date} onChange={e => setManualForm(p => ({ ...p, date: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-400">Description</Label>
              <Input value={manualForm.description} onChange={e => setManualForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Kya liya? (optional)" className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="manual-desc-input" />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleManualAdd} className="bg-teal-600 hover:bg-teal-700 text-white flex-1" data-testid="manual-submit-btn">
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
              <Button variant="outline" onClick={() => setShowManualDialog(false)} className="border-slate-600 text-slate-300">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Party Report Dialog */}
      <Dialog open={!!reportParty} onOpenChange={(open) => { if (!open) { setReportParty(null); setReportData(null); } }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-3xl max-h-[80vh] overflow-y-auto" data-testid="party-report-dialog">
          <DialogHeader>
            <DialogTitle className="text-teal-400 flex items-center justify-between">
              <span>{reportParty} - Complete Hisaab</span>
              <Button onClick={handlePrintReport} size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" data-testid="report-print-btn">
                <Printer className="w-4 h-4 mr-1" /> Print
              </Button>
            </DialogTitle>
          </DialogHeader>
          {reportLoading ? (
            <p className="text-center text-slate-400 py-8">Loading...</p>
          ) : reportData ? (
            <div>
              {/* Print-ready content */}
              <div id="party-report-print">
                <h2>{reportData.party_name} - Hisaab / Ledger</h2>
                <p className="meta">{filters.kms_year ? `KMS Year: ${filters.kms_year}` : ''} {filters.season ? `| Season: ${filters.season}` : ''} | Date: {new Date().toLocaleDateString('en-IN')}</p>
                <table>
                  <thead>
                    <tr><th>#</th><th>Date</th><th>Description</th><th>Source</th><th>Debit (Rs.)</th><th>Payment (Rs.)</th><th>Balance (Rs.)</th></tr>
                  </thead>
                  <tbody>
                    {reportData.transactions.map((t, i) => (
                      <tr key={t.id}>
                        <td>{i + 1}</td>
                        <td>{t.date}</td>
                        <td>{t.description}</td>
                        <td>{t.source_type === 'mill_part' ? 'Mill Part' : t.source_type === 'gunny_bag' ? 'Gunny Bag' : t.source_type === 'settlement' ? 'Settlement' : 'Manual'}</td>
                        <td className="debit">{t.txn_type === 'debit' ? t.amount?.toLocaleString('en-IN') : ''}</td>
                        <td className="payment">{t.txn_type === 'payment' ? t.amount?.toLocaleString('en-IN') : ''}</td>
                        <td style={{ fontWeight: 'bold' }}>{t.running_balance?.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="summary">
                  <span><b>Total Debit:</b> Rs.{reportData.total_debit?.toLocaleString('en-IN')}</span>
                  <span><b>Total Paid:</b> Rs.{reportData.total_paid?.toLocaleString('en-IN')}</span>
                  <span style={{ color: 'red' }}><b>Balance:</b> Rs.{reportData.balance?.toLocaleString('en-IN')}</span>
                </div>
              </div>

              {/* On-screen styled summary */}
              <div className="mt-4 grid grid-cols-3 gap-3">
                <Card className="bg-orange-900/20 border-orange-800/30"><CardContent className="p-3 text-center">
                  <p className="text-[10px] text-orange-400">Total Debit</p>
                  <p className="text-lg font-bold text-orange-400">Rs.{reportData.total_debit?.toLocaleString('en-IN')}</p>
                </CardContent></Card>
                <Card className="bg-green-900/20 border-green-800/30"><CardContent className="p-3 text-center">
                  <p className="text-[10px] text-green-400">Total Paid</p>
                  <p className="text-lg font-bold text-green-400">Rs.{reportData.total_paid?.toLocaleString('en-IN')}</p>
                </CardContent></Card>
                <Card className="bg-red-900/20 border-red-800/30"><CardContent className="p-3 text-center">
                  <p className="text-[10px] text-red-400">Balance</p>
                  <p className="text-lg font-bold text-red-400">Rs.{reportData.balance?.toLocaleString('en-IN')}</p>
                </CardContent></Card>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LocalPartyAccount;
