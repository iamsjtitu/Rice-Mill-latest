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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  IndianRupee, RefreshCw, Download, FileText, Plus, Trash2, Handshake, Printer, Search, Loader2,
} from "lucide-react";

const BACKEND_URL = (typeof window !== 'undefined' && window.ELECTRON_API_URL) || process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LocalPartyAccount = ({ filters, user }) => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedParty, setSelectedParty] = useState("");
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [showSettleDialog, setShowSettleDialog] = useState(false);
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleDate, setSettleDate] = useState(new Date().toISOString().split('T')[0]);
  const [settleNotes, setSettleNotes] = useState("");
  const [manualForm, setManualForm] = useState({
    party_name: "", amount: "", date: new Date().toISOString().split('T')[0], description: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      if (dateFrom) p.append('date_from', dateFrom);
      if (dateTo) p.append('date_to', dateTo);
      const res = await axios.get(`${API}/local-party/summary?${p}`);
      setSummary(res.data);
    } catch (e) { toast.error("Data load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season, dateFrom, dateTo]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const fetchPartyReport = useCallback(async (partyName) => {
    if (!partyName) { setReportData(null); return; }
    setReportLoading(true);
    try {
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      if (dateFrom) p.append('date_from', dateFrom);
      if (dateTo) p.append('date_to', dateTo);
      const res = await axios.get(`${API}/local-party/report/${encodeURIComponent(partyName)}?${p}`);
      setReportData(res.data);
    } catch (e) { toast.error("Report load nahi hua"); }
    finally { setReportLoading(false); }
  }, [filters.kms_year, filters.season, dateFrom, dateTo]);

  const handleSelectParty = (val) => {
    if (val === "__all__") {
      setSelectedParty("__all__");
      setReportData(null);
    } else {
      setSelectedParty(val);
      fetchPartyReport(val);
    }
  };

  const handleSettle = async () => {
    const amt = parseFloat(settleAmount);
    if (!selectedParty || !amt || amt <= 0) { toast.error("Amount bharein"); return; }
    try {
      await axios.post(`${API}/local-party/settle`, {
        party_name: selectedParty, amount: amt, date: settleDate,
        kms_year: filters.kms_year || "", season: filters.season || "",
        notes: settleNotes, created_by: user.username
      });
      toast.success(`Rs.${amt} payment to ${selectedParty} recorded!`);
      setShowSettleDialog(false);
      setSettleAmount(""); setSettleNotes("");
      fetchSummary();
      fetchPartyReport(selectedParty);
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const handleManualAdd = async () => {
    const amt = parseFloat(manualForm.amount);
    if (!manualForm.party_name.trim() || !amt || amt <= 0) {
      toast.error("Party name aur amount bharein"); return;
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
      fetchSummary();
      if (selectedParty && manualForm.party_name.toLowerCase() === selectedParty.toLowerCase()) {
        fetchPartyReport(selectedParty);
      }
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const handleDeleteTxn = async (id) => {
    if (!window.confirm("Transaction delete karein?")) return;
    try {
      await axios.delete(`${API}/local-party/${id}`);
      toast.success("Deleted");
      fetchSummary();
      fetchPartyReport(selectedParty);
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
      a.href = url; a.download = `local_party_account.${format === 'pdf' ? 'pdf' : 'xlsx'}`; a.click();
    } catch (e) { toast.error(`${format.toUpperCase()} export failed`); }
  };

  const handlePrint = () => {
    if (!reportData) return;
    const w = window.open('', '_blank', 'width=800,height=600');
    w.document.write(`<html><head><title>${reportData.party_name} - Hisaab</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;color:#000}
      h2{text-align:center;margin-bottom:5px}
      .meta{text-align:center;color:#555;font-size:13px;margin-bottom:15px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#065f46;color:#fff}
      .debit{color:#c00}.payment{color:#090}
      .summary{margin-top:15px;font-size:13px}
      .summary span{margin-right:20px}
      @media print{body{margin:0;padding:10px}}</style></head><body>
      <h2>${reportData.party_name} - Hisaab / Ledger</h2>
      <p class="meta">${filters.kms_year ? 'KMS: ' + filters.kms_year : ''} ${filters.season ? '| Season: ' + filters.season : ''} | Date: ${new Date().toLocaleDateString('en-IN')}</p>
      <table><thead><tr><th>#</th><th>Date</th><th>Description</th><th>Source</th><th>Debit (Rs.)</th><th>Payment (Rs.)</th><th>Balance (Rs.)</th></tr></thead><tbody>`);
    reportData.transactions.forEach((t, i) => {
      w.document.write(`<tr><td>${i + 1}</td><td>${t.date}</td><td>${t.description || ''}</td>
        <td>${t.source_type === 'mill_part' ? 'Mill Part' : t.source_type === 'gunny_bag' ? 'Gunny Bag' : t.source_type === 'settlement' ? 'Settlement' : t.source_type === 'cashbook' ? 'CashBook' : 'Manual'}</td>
        <td class="debit">${t.txn_type === 'debit' ? t.amount : ''}</td>
        <td class="payment">${t.txn_type === 'payment' ? t.amount : ''}</td>
        <td style="font-weight:bold">${t.running_balance}</td></tr>`);
    });
    w.document.write(`</tbody></table>
      <div class="summary"><span><b>Total Debit:</b> Rs.${reportData.total_debit}</span>
      <span><b>Total Paid:</b> Rs.${reportData.total_paid}</span>
      <span style="color:red"><b>Balance:</b> Rs.${reportData.balance}</span></div></body></html>`);
    w.document.close(); w.focus();
    setTimeout(() => w.print(), 300);
  };

  const partyInfo = summary?.parties?.find(p => p.party_name === selectedParty);
  const filteredParties = summary?.parties?.filter(p =>
    !searchTerm || p.party_name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="space-y-3" data-testid="local-party-tab">
      {/* Top Bar: Party Selector + Actions */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px] max-w-[320px] relative">
          <Label className="text-[10px] text-slate-500 mb-1 block">Select Party</Label>
          <input
            value={showPartyDropdown ? searchTerm : (selectedParty === "__all__" ? "All / सभी" : selectedParty || "")}
            onChange={e => { setSearchTerm(e.target.value); if (!showPartyDropdown) setShowPartyDropdown(true); }}
            onFocus={() => { setShowPartyDropdown(true); setSearchTerm(""); }}
            onBlur={() => setTimeout(() => setShowPartyDropdown(false), 200)}
            placeholder="Party search ya select karein..."
            className="flex h-9 w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-ring"
            data-testid="party-search-input"
          />
          {selectedParty && !showPartyDropdown && (
            <button onClick={() => { setSelectedParty(""); setSearchTerm(""); setReportData(null); }} className="absolute right-2 top-[26px] text-slate-400 hover:text-white text-xs">✕</button>
          )}
          {showPartyDropdown && (
            <div className="absolute z-50 mt-1 max-h-56 overflow-auto rounded-md border border-slate-600 bg-slate-800 shadow-xl w-full">
              <div
                onMouseDown={e => e.preventDefault()}
                onClick={() => { handleSelectParty("__all__"); setShowPartyDropdown(false); setSearchTerm(""); }}
                className="px-3 py-2 text-sm text-amber-400 font-semibold cursor-pointer hover:bg-slate-700"
              >All / सभी</div>
              {filteredParties.map(p => (
                <div key={p.party_name}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { handleSelectParty(p.party_name); setShowPartyDropdown(false); setSearchTerm(""); }}
                  className="px-3 py-2 text-sm text-white cursor-pointer hover:bg-slate-700 flex justify-between"
                >
                  <span>{p.party_name}</span>
                  <span className={`text-xs ${p.balance > 0 ? 'text-red-400' : 'text-green-400'}`}>Rs.{(p.balance||0).toLocaleString('en-IN')}</span>
                </div>
              ))}
              {filteredParties.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">Koi party nahi mili</div>}
            </div>
          )}
        </div>

        {/* Date Range Filter */}
        <div className="flex items-end gap-1.5">
          <div>
            <Label className="text-[10px] text-slate-500 mb-1 block">From</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white h-9 text-xs w-[130px]" data-testid="local-party-date-from" />
          </div>
          <div>
            <Label className="text-[10px] text-slate-500 mb-1 block">To</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white h-9 text-xs w-[130px]" data-testid="local-party-date-to" />
          </div>
          {(dateFrom || dateTo) && (
            <Button onClick={() => { setDateFrom(""); setDateTo(""); }} variant="ghost" size="sm" className="text-slate-400 h-9 px-2 text-xs">Clear</Button>
          )}
        </div>

        {/* Action buttons */}
        {selectedParty && partyInfo && user.role === 'admin' && partyInfo.balance > 0 && (
          <Button onClick={() => setShowSettleDialog(true)} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-9" data-testid="settle-btn">
            <Handshake className="w-4 h-4 mr-1" /> Settle / Pay
          </Button>
        )}
        {selectedParty && reportData && (
          <Button onClick={handlePrint} size="sm" variant="outline" className="border-slate-600 text-slate-300 h-9" data-testid="report-print-btn">
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
        )}
        {user.role === 'admin' && (
          <Button onClick={() => setShowManualDialog(true)} size="sm" className="bg-teal-600 hover:bg-teal-700 text-white h-9" data-testid="local-party-manual-btn">
            <Plus className="w-4 h-4 mr-1" /> Manual Purchase
          </Button>
        )}
        <Button onClick={() => { fetchSummary(); if (selectedParty) fetchPartyReport(selectedParty); }} variant="outline" size="sm" className="border-slate-600 text-slate-300 h-9">
          <RefreshCw className="w-4 h-4" />
        </Button>
        <div className="ml-auto flex gap-1.5">
          <Button onClick={() => handleExport('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400 h-9" data-testid="local-party-export-excel">
            <Download className="w-4 h-4 mr-1" /> Excel
          </Button>
          <Button onClick={() => handleExport('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400 h-9" data-testid="local-party-export-pdf">
            <FileText className="w-4 h-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Grand Totals Bar - only show when party selected */}
      {summary && selectedParty && (
        <div className="flex gap-3 text-xs flex-wrap">
          {selectedParty !== "__all__" && partyInfo ? (
            <>
              <span className="text-slate-400">Party: <b className="text-white">{selectedParty}</b></span>
              {(partyInfo.opening_balance || 0) > 0 && <span className="text-slate-400">Opening Bal: <b className="text-yellow-400">Rs.{(partyInfo.opening_balance || 0).toLocaleString('en-IN')}</b></span>}
              <span className="text-slate-400">Total Debit: <b className="text-orange-400">Rs.{(partyInfo.total_debit || 0).toLocaleString('en-IN')}</b></span>
              <span className="text-slate-400">Total Paid: <b className="text-green-400">Rs.{(partyInfo.total_paid || 0).toLocaleString('en-IN')}</b></span>
              <span className="text-slate-400">Balance: <b className="text-red-400">Rs.{(partyInfo.balance || 0).toLocaleString('en-IN')}</b></span>
            </>
          ) : selectedParty === "__all__" ? (
            <>
              <span className="text-slate-400">Parties: <b className="text-white">{summary.parties?.length || 0}</b></span>
              {(summary.grand_opening_balance || 0) > 0 && <span className="text-slate-400">Opening Bal: <b className="text-yellow-400">Rs.{(summary.grand_opening_balance || 0).toLocaleString('en-IN')}</b></span>}
              <span className="text-slate-400">Total Debit: <b className="text-orange-400">Rs.{(summary.grand_total_debit || 0).toLocaleString('en-IN')}</b></span>
              <span className="text-slate-400">Total Paid: <b className="text-green-400">Rs.{(summary.grand_total_paid || 0).toLocaleString('en-IN')}</b></span>
              <span className="text-slate-400">Balance: <b className="text-red-400">Rs.{(summary.grand_balance || 0).toLocaleString('en-IN')}</b></span>
            </>
          ) : null}
        </div>
      )}

      {/* Selected Party Info + Statement */}
      {!selectedParty && !loading && (
        <div className="text-center py-12 text-slate-500">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Party select karein upar se dropdown mein</p>
          <p className="text-xs mt-1">Mill Parts ya Gunny Bags se auto entries aayengi</p>
        </div>
      )}

      {/* All Parties Table */}
      {selectedParty === "__all__" && summary?.parties?.length > 0 && (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    {['#', 'Party Name', 'OB (Rs.)', 'Total Debit (Rs.)', 'Total Paid (Rs.)', 'Balance (Rs.)', 'Transactions'].map(h =>
                      <TableHead key={h} className={`text-slate-300 text-xs ${['OB (Rs.)', 'Total Debit (Rs.)', 'Total Paid (Rs.)', 'Balance (Rs.)'].includes(h) ? 'text-right' : ''}`}>{h}</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.parties.map((p, i) => (
                    <TableRow key={p.party_name} className="border-slate-700 cursor-pointer hover:bg-slate-700/50" onClick={() => handleSelectParty(p.party_name)}>
                      <TableCell className="text-slate-500 text-xs">{i + 1}</TableCell>
                      <TableCell className="text-white text-xs font-medium">{p.party_name}</TableCell>
                      <TableCell className="text-yellow-400 text-xs text-right">{(p.opening_balance || 0) > 0 ? `Rs.${(p.opening_balance || 0).toLocaleString('en-IN')}` : '-'}</TableCell>
                      <TableCell className="text-orange-400 text-xs text-right font-medium">Rs.{(p.total_debit || 0).toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-green-400 text-xs text-right font-medium">Rs.{(p.total_paid || 0).toLocaleString('en-IN')}</TableCell>
                      <TableCell className={`text-xs text-right font-bold ${p.balance > 0 ? 'text-red-400' : 'text-green-400'}`}>Rs.{(p.balance || 0).toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-slate-400 text-xs">{p.txn_count || 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedParty && selectedParty !== "__all__" && (
        <>
          {/* Party Header */}
          {partyInfo && (
            <div className="flex items-center gap-4 p-3 bg-slate-800/80 border border-slate-700 rounded-lg">
              <div className="flex-1">
                <p className="text-white font-semibold">{partyInfo.party_name}</p>
                <div className="flex gap-4 text-xs mt-1">
                  <span className="text-orange-400">Debit: Rs.{partyInfo.total_debit.toLocaleString('en-IN')}</span>
                  <span className="text-green-400">Paid: Rs.{partyInfo.total_paid.toLocaleString('en-IN')}</span>
                  <span className="text-slate-400">{partyInfo.txn_count} entries</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400">Balance</p>
                <p className={`text-xl font-bold ${partyInfo.balance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  Rs.{partyInfo.balance.toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          )}

          {/* Statement Table */}
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-0">
              {reportLoading ? (
                <div className="flex items-center justify-center py-8 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-700 hover:bg-transparent">
                        {['#', 'Date', 'Description', 'Source', 'Debit (Rs.)', 'Payment (Rs.)', 'Balance (Rs.)', ''].map(h =>
                          <TableHead key={h} className={`text-slate-300 text-xs ${['Debit (Rs.)', 'Payment (Rs.)', 'Balance (Rs.)'].includes(h) ? 'text-right' : ''}`}>{h}</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(!reportData || reportData.transactions?.length === 0) ? (
                        <TableRow><TableCell colSpan={8} className="text-center text-slate-500 py-8 text-sm">
                          Koi transaction nahi hai is party ka.
                        </TableCell></TableRow>
                      ) : reportData.transactions.map((t, i) => (
                        <TableRow key={t.id} className={`border-slate-700 ${t.txn_type === 'payment' ? 'bg-green-900/5' : ''}`} data-testid={`local-party-row-${t.id}`}>
                          <TableCell className="text-slate-500 text-xs">{i + 1}</TableCell>
                          <TableCell className="text-white text-xs">{t.date}</TableCell>
                          <TableCell className="text-slate-300 text-xs max-w-[220px] truncate">{t.description}</TableCell>
                          <TableCell className="text-xs">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                              t.source_type === 'mill_part' ? 'bg-cyan-900/30 text-cyan-400' :
                              t.source_type === 'gunny_bag' ? 'bg-amber-900/30 text-amber-400' :
                              t.source_type === 'settlement' ? 'bg-green-900/30 text-green-400' :
                              t.source_type === 'cashbook' ? 'bg-blue-900/30 text-blue-400' :
                              'bg-slate-700 text-slate-400'
                            }`}>
                              {t.source_type === 'mill_part' ? 'Mill Part' :
                               t.source_type === 'gunny_bag' ? 'Gunny Bag' :
                               t.source_type === 'settlement' ? 'Settlement' :
                               t.source_type === 'cashbook' ? 'CashBook' : 'Manual'}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-right text-orange-400 font-medium">
                            {t.txn_type === 'debit' ? `Rs.${t.amount?.toLocaleString('en-IN')}` : ''}
                          </TableCell>
                          <TableCell className="text-xs text-right text-green-400 font-medium">
                            {t.txn_type === 'payment' ? `Rs.${t.amount?.toLocaleString('en-IN')}` : ''}
                          </TableCell>
                          <TableCell className="text-xs text-right font-bold text-white">
                            Rs.{t.running_balance?.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell>
                            {user.role === 'admin' && (t.source_type === 'manual' || t.source_type === 'settlement') && (
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => handleDeleteTxn(t.id)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Settlement Dialog */}
      <Dialog open={showSettleDialog} onOpenChange={setShowSettleDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-sm" data-testid="local-party-settle-dialog">
          <DialogHeader>
            <DialogTitle className="text-emerald-400">Settlement - {selectedParty}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {partyInfo && (
              <div className="p-2 bg-slate-700/50 rounded text-xs">
                Pending: <span className="text-red-400 font-bold">Rs.{partyInfo.balance.toLocaleString('en-IN')}</span>
              </div>
            )}
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
    </div>
  );
};

export default LocalPartyAccount;
