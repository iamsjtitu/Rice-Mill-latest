import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { fmtDate } from "@/utils/date";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { SendToGroupDialog } from "./SendToGroupDialog";
import { useMessagingEnabled } from "../hooks/useMessagingEnabled";
import {
  RefreshCw, Download, FileText, AlertCircle, Truck, Users,
  IndianRupee, FileSpreadsheet, BookOpen, ClipboardList, Receipt, Wallet, Send
} from "lucide-react";
import ExportPreviewDialog from "./common/ExportPreviewDialog";


const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

// ===== Outstanding Report =====
export const OutstandingReport = ({ filters }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/reports/outstanding?${p}`);
      setData(res.data);
    } catch (e) { toast.error("Outstanding report load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportData = async (format) => {
    const p = new URLSearchParams();
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    if (filters.season) p.append('season', filters.season);
    const { downloadFile } = await import('../utils/download');
    downloadFile(`/api/reports/outstanding/${format}?${p}`, `outstanding.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
  };

  if (loading) return <div className="text-slate-400 text-center py-8">Loading...</div>;
  if (!data) return null;

  const dc = data.dc_outstanding;
  const msp = data.msp_outstanding;

  return (
    <div className="space-y-4" data-testid="outstanding-report">
      <div className="flex gap-2">
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300" data-testid="outstanding-refresh">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
        <Button onClick={() => exportData('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400" data-testid="outstanding-export-excel">
          <Download className="w-4 h-4 mr-1" /> Excel
        </Button>
        <Button onClick={() => exportData('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400" data-testid="outstanding-export-pdf">
          <FileText className="w-4 h-4 mr-1" /> PDF
        </Button>
        <ExportPreviewDialog
          data={[
            ...(data?.dc_pending?.entries || []).map(e => ({...e, _type: "DC"})),
            ...(data?.truck_payments?.entries || []).map(e => ({...e, _type: "Truck"})),
          ]}
          title="Outstanding Report / बकाया रिपोर्ट"
          columns={[
            { header: "Type", field: "_type" },
            { header: "Party", field: "party_name", render: v => v || "-" },
            { header: "Amount", field: "total_amount", format: "rupees", align: "right" },
            { header: "Paid", field: "paid_amount", format: "rupees", align: "right" },
            { header: "Balance", field: "balance", format: "rupees", align: "right" },
          ]}
          onPdfExport={() => exportData('pdf')}
          onExcelExport={() => exportData('excel')}
          triggerClassName="border-slate-600 text-blue-400"
          iconOnly
        />
      </div>

      {/* DC Pending Deliveries */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            DC Pending Deliveries ({dc.count})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {dc.items.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-600">
                    <TableHead className="text-slate-300">DC No.</TableHead>
                    <TableHead className="text-slate-300 text-right">Allotted (Q)</TableHead>
                    <TableHead className="text-slate-300 text-right">Delivered (Q)</TableHead>
                    <TableHead className="text-slate-300 text-right">Pending (Q)</TableHead>
                    <TableHead className="text-slate-300">Deadline</TableHead>
                    <TableHead className="text-slate-300">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dc.items.map((item, idx) => (
                    <TableRow key={idx} className="border-slate-700">
                      <TableCell className="text-white font-semibold">{item.dc_number}</TableCell>
                      <TableCell className="text-right text-slate-300">{item.allotted}</TableCell>
                      <TableCell className="text-right text-emerald-400">{item.delivered}</TableCell>
                      <TableCell className="text-right text-red-400 font-semibold">{item.pending}</TableCell>
                      <TableCell className="text-slate-300">{item.deadline || '-'}</TableCell>
                      <TableCell className="text-slate-300 capitalize">{item.rice_type}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-slate-600 bg-slate-700/50">
                    <TableCell className="text-amber-400 font-bold">TOTAL</TableCell>
                    <TableCell className="text-right text-slate-300">-</TableCell>
                    <TableCell className="text-right text-slate-300">-</TableCell>
                    <TableCell className="text-right text-red-400 font-bold">{dc.total_pending_qntl} Q</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-slate-400 text-sm text-center py-4">Koi pending DC nahi hai</p>
          )}
        </CardContent>
      </Card>

      {/* MSP Payment Pending */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm text-amber-400 flex items-center gap-2">
            <IndianRupee className="w-4 h-4" />
            MSP Payment Pending
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ["Delivered (Q)", msp.total_delivered_qntl, "text-white"],
              ["Paid Qty (Q)", msp.total_paid_qty, "text-emerald-400"],
              ["Paid Amount", `₹${(msp.total_paid_amount || 0).toLocaleString()}`, "text-emerald-400"],
              ["Pending Qty (Q)", msp.pending_qty, "text-red-400"],
            ].map(([label, val, color]) => (
              <div key={label} className="text-center p-3 rounded bg-slate-900/50">
                <p className="text-[10px] text-slate-400">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{val}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Truck Summary */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm text-blue-400 flex items-center gap-2">
            <Truck className="w-4 h-4" />
            Truck Summary ({data.trucks.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {data.trucks.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-600">
                    <TableHead className="text-slate-300">Truck No.</TableHead>
                    <TableHead className="text-slate-300 text-right">Trips</TableHead>
                    <TableHead className="text-slate-300 text-right">Final W (Q)</TableHead>
                    <TableHead className="text-slate-300 text-right">Cash Paid</TableHead>
                    <TableHead className="text-slate-300 text-right">Diesel Paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.trucks.filter(t => t.truck_no).map((t, idx) => (
                    <TableRow key={idx} className="border-slate-700">
                      <TableCell className="text-white font-semibold">{t.truck_no}</TableCell>
                      <TableCell className="text-right text-slate-300">{t.total_trips}</TableCell>
                      <TableCell className="text-right text-amber-400 font-semibold">{t.total_qty_qntl}</TableCell>
                      <TableCell className="text-right text-emerald-400">₹{t.total_cash_paid.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-blue-400">₹{t.total_diesel_paid.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-slate-400 text-sm text-center py-4">Koi truck data nahi hai</p>
          )}
        </CardContent>
      </Card>

      {/* Agent Summary */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm text-purple-400 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Agent Summary ({data.agents.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {data.agents.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-600">
                    <TableHead className="text-slate-300">Agent</TableHead>
                    <TableHead className="text-slate-300 text-right">Entries</TableHead>
                    <TableHead className="text-slate-300 text-right">Final W (Q)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.agents.filter(a => a.agent_name !== "Unknown").map((a, idx) => (
                    <TableRow key={idx} className="border-slate-700">
                      <TableCell className="text-white font-semibold">{a.agent_name}</TableCell>
                      <TableCell className="text-right text-slate-300">{a.total_entries}</TableCell>
                      <TableCell className="text-right text-amber-400 font-semibold">{a.total_qty_qntl}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-slate-400 text-sm text-center py-4">Koi agent data nahi hai</p>
          )}
        </CardContent>
      </Card>

      {/* FRK Parties */}
      {data.frk_parties && data.frk_parties.length > 0 && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm text-cyan-400 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              FRK Purchase Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-600">
                    <TableHead className="text-slate-300">Party Name</TableHead>
                    <TableHead className="text-slate-300 text-right">Qty (Q)</TableHead>
                    <TableHead className="text-slate-300 text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.frk_parties.map((f, idx) => (
                    <TableRow key={idx} className="border-slate-700">
                      <TableCell className="text-white font-semibold">{f.party_name}</TableCell>
                      <TableCell className="text-right text-amber-400">{f.total_qty}</TableCell>
                      <TableCell className="text-right text-emerald-400">₹{f.total_amount.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ===== Party Ledger =====
const PartyLedger = ({ filters }) => {
  const { wa } = useMessagingEnabled();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedParty, setSelectedParty] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupText, setGroupText] = useState("");
  const [groupPdfUrl, setGroupPdfUrl] = useState("");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      if (selectedParty) p.append('party_name', selectedParty);
      if (selectedType) p.append('party_type', selectedType);
      if (dateFrom) p.append('date_from', dateFrom);
      if (dateTo) p.append('date_to', dateTo);
      const res = await axios.get(`${API}/reports/party-ledger?${p}`);
      setData(res.data);
    } catch (e) { toast.error("Party ledger load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season, selectedParty, selectedType, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportData = async (format) => {
    const p = new URLSearchParams();
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    if (filters.season) p.append('season', filters.season);
    if (selectedParty) p.append('party_name', selectedParty);
    if (selectedType) p.append('party_type', selectedType);
    if (dateFrom) p.append('date_from', dateFrom);
    if (dateTo) p.append('date_to', dateTo);
    const { downloadFile } = await import('../utils/download');
    downloadFile(`/api/reports/party-ledger/${format}?${p}`, `party_ledger.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
  };

  const sendLedgerWhatsApp = async () => {
    if (!selectedParty) { toast.error("Pehle party select karein"); return; }
    try {
      let waSettings;
      try { waSettings = (await axios.get(`${API}/whatsapp/settings`)).data; } catch(e) { waSettings = {}; }
      const hasDefaults = (waSettings.default_numbers || []).length > 0;
      let phone = "";
      if (!hasDefaults) {
        phone = prompt("WhatsApp number daalein (default numbers set nahi hain):");
        if (!phone) return;
      }
      const pdfParams = new URLSearchParams();
      if (filters.kms_year) pdfParams.append('kms_year', filters.kms_year);
      if (filters.season) pdfParams.append('season', filters.season);
      if (selectedParty) pdfParams.append('party_name', selectedParty);
      if (selectedType) pdfParams.append('party_type', selectedType);
      if (dateFrom) pdfParams.append('date_from', dateFrom);
      if (dateTo) pdfParams.append('date_to', dateTo);
      const pdfUrl = `${API}/reports/party-ledger/pdf?${pdfParams.toString()}`;
      const res = await axios.post(`${API}/whatsapp/send-party-ledger`, {
        party_name: selectedParty,
        total_debit: data.total_debit || 0,
        total_credit: data.total_credit || 0,
        balance: (data.total_debit || 0) - (data.total_credit || 0),
        transactions: (data.transactions || []).slice(0, 10),
        pdf_url: pdfUrl,
        phone
      });
      if (res.data.success) toast.success(res.data.message || "Ledger WhatsApp pe bhej diya!");
      else toast.error(res.data.error || res.data.message || "WhatsApp send fail");
    } catch (e) { toast.error("WhatsApp error: " + (e.response?.data?.detail || e.response?.data?.error || e.message)); }
  };

  const openGroupSendLedger = () => {
    if (!selectedParty) { toast.error("Pehle party select karein"); return; }
    const bal = (data.total_debit || 0) - (data.total_credit || 0);
    const balLabel = bal > 0 ? "Bakaya (Debit)" : bal < 0 ? "Agrim (Credit)" : "Settled";
    setGroupText(`*Party Ledger / खाता विवरण*\nParty: *${selectedParty}*\nDebit: Rs.${(data.total_debit || 0).toLocaleString()}\nCredit: Rs.${(data.total_credit || 0).toLocaleString()}\n*${balLabel}: Rs.${Math.abs(bal).toLocaleString()}*`);
    const p = new URLSearchParams();
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    if (filters.season) p.append('season', filters.season);
    if (selectedParty) p.append('party_name', selectedParty);
    if (selectedType) p.append('party_type', selectedType);
    if (dateFrom) p.append('date_from', dateFrom);
    if (dateTo) p.append('date_to', dateTo);
    setGroupPdfUrl(`/api/reports/party-ledger/pdf?${p.toString()}`);
    setGroupDialogOpen(true);
  };

  if (loading) return <div className="text-slate-400 text-center py-8">Loading...</div>;
  if (!data) return null;

  const balance = (data.total_debit || 0) - (data.total_credit || 0);

  return (
    <div className="space-y-4" data-testid="party-ledger">
      {/* Filters & Export */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-[10px] text-slate-400 mb-0.5">From Date</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="h-8 w-36 rounded-md bg-slate-700 border border-slate-600 text-white text-xs px-2" data-testid="ledger-date-from" />
        </div>
        <div className="flex flex-col">
          <label className="text-[10px] text-slate-400 mb-0.5">To Date</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="h-8 w-36 rounded-md bg-slate-700 border border-slate-600 text-white text-xs px-2" data-testid="ledger-date-to" />
        </div>

        <Select value={selectedType} onValueChange={(v) => { setSelectedType(v === "all" ? "" : v); setSelectedParty(""); }}>
          <SelectTrigger className="w-[130px] bg-slate-700 border-slate-600 text-white text-sm" data-testid="party-type-filter">
            <SelectValue placeholder="Party Type" />
          </SelectTrigger>
          <SelectContent className="bg-slate-700 border-slate-600">
            <SelectItem value="all" className="text-white">All Types</SelectItem>
            <SelectItem value="Agent" className="text-white">Agent</SelectItem>
            <SelectItem value="truck" className="text-white">Truck</SelectItem>
            <SelectItem value="cash_party" className="text-white">Cash Party</SelectItem>
            <SelectItem value="frk_party" className="text-white">FRK Seller</SelectItem>
            <SelectItem value="buyer" className="text-white">Buyer</SelectItem>
            <SelectItem value="pvt_paddy" className="text-white">Pvt Paddy</SelectItem>
            <SelectItem value="rice_buyer" className="text-white">Rice Buyer</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedParty} onValueChange={(v) => setSelectedParty(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[180px] bg-slate-700 border-slate-600 text-white text-sm" data-testid="party-name-filter">
            <SelectValue placeholder="Select Party" />
          </SelectTrigger>
          <SelectContent className="bg-slate-700 border-slate-600 max-h-60">
            <SelectItem value="all" className="text-white">All Parties</SelectItem>
            {(data.party_list || [])
              .map((p, i) => (
                <SelectItem key={i} value={p.name} className="text-white">
                  {p.name} ({p.type})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        {(dateFrom || dateTo) && (
          <Button onClick={() => { setDateFrom(""); setDateTo(""); }} variant="ghost" size="sm"
            className="h-8 text-xs text-red-400 hover:bg-slate-700" data-testid="ledger-clear-dates">Clear Dates</Button>
        )}

        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300" data-testid="party-ledger-refresh">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => exportData('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400" data-testid="party-ledger-export-excel">
            <Download className="w-4 h-4 mr-1" /> Excel
          </Button>
          <Button onClick={() => exportData('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400" data-testid="party-ledger-export-pdf">
            <FileText className="w-4 h-4 mr-1" /> PDF
          </Button>
          <ExportPreviewDialog
            data={data?.ledger || []}
            title="Party Ledger / पार्टी खाता"
            columns={[
              { header: "Date", field: "date", format: "date" },
              { header: "Type", field: "type" },
              { header: "Narration", field: "description" },
              { header: "Debit", field: "debit", format: "rupees", align: "right" },
              { header: "Credit", field: "credit", format: "rupees", align: "right" },
              { header: "Balance", field: "balance", format: "rupees", align: "right" },
            ]}
            onPdfExport={() => exportData('pdf')}
            onExcelExport={() => exportData('excel')}
            triggerClassName="border-slate-600 text-blue-400"
            iconOnly
          />
          {wa && <Button onClick={sendLedgerWhatsApp} variant="outline" size="sm" className="border-green-500 text-green-400 hover:bg-green-500/10" data-testid="party-ledger-whatsapp">
            <Send className="w-4 h-4 mr-1" /> WhatsApp
          </Button>}
          {wa && <Button onClick={openGroupSendLedger} variant="outline" size="sm" className="border-teal-500 text-teal-400 hover:bg-teal-500/10" data-testid="party-ledger-send-to-group">
            <Users className="w-4 h-4 mr-1" /> Group
          </Button>}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-slate-700/50 border-slate-600">
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs">Total Debit (Kharcha)</p>
            <p className="text-red-400 text-xl font-bold" data-testid="total-debit">₹{(data.total_debit || 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-700/50 border-slate-600">
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs">Total Credit (Jama)</p>
            <p className="text-emerald-400 text-xl font-bold" data-testid="total-credit">₹{(data.total_credit || 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className={`border-slate-600 ${balance >= 0 ? 'bg-red-900/20' : 'bg-emerald-900/20'}`}>
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs">Balance (Debit - Credit)</p>
            <p className={`text-xl font-bold ${balance >= 0 ? 'text-red-400' : 'text-emerald-400'}`} data-testid="ledger-balance">
              ₹{Math.abs(balance).toLocaleString()} {balance >= 0 ? '(Dr)' : '(Cr)'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Ledger Table */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm text-amber-400 flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Transactions ({(data.ledger || []).length})
            {selectedParty && <span className="text-slate-400 font-normal ml-2">- {selectedParty}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {(data.ledger || []).length > 0 ? (() => {
            // Compute running balance (oldest first, then display as-is since API returns date-sorted)
            const ledger = data.ledger;
            // Sort chronologically (oldest first) for balance calc
            const chronological = [...ledger].reverse();
            let runBal = 0;
            const balMap = {};
            for (let i = 0; i < chronological.length; i++) {
              const item = chronological[i];
              runBal += (item.debit || 0) - (item.credit || 0);
              balMap[i] = Math.round(runBal * 100) / 100;
            }
            // Map original index to balance (reverse mapping)
            const balByOrigIdx = {};
            for (let i = 0; i < ledger.length; i++) {
              balByOrigIdx[i] = balMap[ledger.length - 1 - i];
            }
            return (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-600">
                    <TableHead className="text-slate-300">Date</TableHead>
                    <TableHead className="text-slate-300">Party</TableHead>
                    <TableHead className="text-slate-300">Type</TableHead>
                    <TableHead className="text-slate-300">Description</TableHead>
                    <TableHead className="text-slate-300 text-right">Debit (₹)</TableHead>
                    <TableHead className="text-slate-300 text-right">Credit (₹)</TableHead>
                    <TableHead className="text-slate-300 text-right">Balance (₹)</TableHead>
                    <TableHead className="text-slate-300">Ref</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.map((item, idx) => (
                    <TableRow key={idx} className="border-slate-700">
                      <TableCell className="text-white text-xs">{fmtDate(item.date)}</TableCell>
                      <TableCell className="text-white font-semibold">{item.party_name}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          item.party_type === 'Agent' ? 'bg-purple-900/50 text-purple-400' :
                          item.party_type === 'Truck' ? 'bg-blue-900/50 text-blue-400' :
                          item.party_type === 'FRK Seller' ? 'bg-cyan-900/50 text-cyan-400' :
                          item.party_type === 'Pvt Paddy' ? 'bg-orange-900/50 text-orange-400' :
                          item.party_type === 'Rice Buyer' ? 'bg-emerald-900/50 text-emerald-400' :
                          'bg-amber-900/50 text-amber-400'
                        }`}>
                          {item.party_type}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-300 text-xs max-w-[200px] truncate">{item.description}</TableCell>
                      <TableCell className="text-right text-red-400 font-semibold">
                        {item.debit > 0 ? `₹${item.debit.toLocaleString()}` : '-'}
                      </TableCell>
                      <TableCell className="text-right text-emerald-400 font-semibold">
                        {item.credit > 0 ? `₹${item.credit.toLocaleString()}` : '-'}
                      </TableCell>
                      <TableCell className={`text-right text-xs font-bold ${(balByOrigIdx[idx] || 0) >= 0 ? 'text-amber-400' : 'text-red-400'}`} data-testid={`ledger-running-balance-${idx}`}>
                        ₹{Math.abs(balByOrigIdx[idx] || 0).toLocaleString()} {(balByOrigIdx[idx] || 0) >= 0 ? '(Dr)' : '(Cr)'}
                      </TableCell>
                      <TableCell className="text-slate-500 text-xs">{item.ref}</TableCell>
                    </TableRow>
                  ))}
                  {/* Totals Row */}
                  <TableRow className="border-slate-600 bg-slate-700/50">
                    <TableCell colSpan={4} className="text-amber-400 font-bold">TOTAL</TableCell>
                    <TableCell className="text-right text-red-400 font-bold">₹{(data.total_debit || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-emerald-400 font-bold">₹{(data.total_credit || 0).toLocaleString()}</TableCell>
                    <TableCell className={`text-right font-bold ${balance >= 0 ? 'text-amber-400' : 'text-emerald-400'}`} data-testid="ledger-final-balance">
                      ₹{Math.abs(balance).toLocaleString()} {balance >= 0 ? '(Dr)' : '(Cr)'}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            );
          })() : (
            <p className="text-slate-400 text-sm text-center py-4">Koi transaction nahi mila</p>
          )}
        </CardContent>
      </Card>
      <SendToGroupDialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen} text={groupText} pdfUrl={groupPdfUrl} />
    </div>
  );
};

// ===== GST Ledger =====
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
      const ky = filters.kms_year || new Date().getFullYear() + '-' + (new Date().getFullYear() + 1);
      const res = await axios.get(`${API}/gst-ledger/opening-balance?kms_year=${ky}`);
      setObForm({ igst: String(res.data.igst || 0), sgst: String(res.data.sgst || 0), cgst: String(res.data.cgst || 0) });
      setShowObDialog(true);
    } catch { toast.error("OB load failed"); }
  };

  const saveOb = async () => {
    try {
      const ky = filters.kms_year || new Date().getFullYear() + '-' + (new Date().getFullYear() + 1);
      await axios.put(`${API}/gst-ledger/opening-balance`, {
        kms_year: ky, igst: parseFloat(obForm.igst) || 0, sgst: parseFloat(obForm.sgst) || 0, cgst: parseFloat(obForm.cgst) || 0
      });
      toast.success("GST Opening Balance saved!"); setShowObDialog(false); fetchData();
    } catch { toast.error("Save failed"); }
  };

  if (loading) return <p className="text-slate-400 text-center py-8">Loading...</p>;
  if (!data) return null;

  const { opening_balance: ob, entries, summary } = data;
  const bal = summary.balance;

  return (
    <div className="space-y-3" data-testid="gst-ledger">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card className="bg-purple-900/30 border-purple-700/40"><CardContent className="p-3">
          <p className="text-[10px] text-purple-400">Opening Balance</p>
          <p className="text-xs text-slate-300 mt-1">CGST: <span className="font-bold text-white">Rs.{(ob.cgst || 0).toLocaleString('en-IN')}</span></p>
          <p className="text-xs text-slate-300">SGST: <span className="font-bold text-white">Rs.{(ob.sgst || 0).toLocaleString('en-IN')}</span></p>
          <p className="text-xs text-slate-300">IGST: <span className="font-bold text-white">Rs.{(ob.igst || 0).toLocaleString('en-IN')}</span></p>
        </CardContent></Card>
        <Card className="bg-green-900/30 border-green-700/40"><CardContent className="p-3">
          <p className="text-[10px] text-green-400">GST Credit (Purchase)</p>
          <p className="text-xs text-slate-300 mt-1">CGST: <span className="font-bold text-green-400">Rs.{summary.credit.cgst.toLocaleString('en-IN')}</span></p>
          <p className="text-xs text-slate-300">SGST: <span className="font-bold text-green-400">Rs.{summary.credit.sgst.toLocaleString('en-IN')}</span></p>
          <p className="text-xs text-slate-300">IGST: <span className="font-bold text-green-400">Rs.{summary.credit.igst.toLocaleString('en-IN')}</span></p>
        </CardContent></Card>
        <Card className="bg-red-900/30 border-red-700/40"><CardContent className="p-3">
          <p className="text-[10px] text-red-400">GST Debit (Sale)</p>
          <p className="text-xs text-slate-300 mt-1">CGST: <span className="font-bold text-red-400">Rs.{summary.debit.cgst.toLocaleString('en-IN')}</span></p>
          <p className="text-xs text-slate-300">SGST: <span className="font-bold text-red-400">Rs.{summary.debit.sgst.toLocaleString('en-IN')}</span></p>
          <p className="text-xs text-slate-300">IGST: <span className="font-bold text-red-400">Rs.{summary.debit.igst.toLocaleString('en-IN')}</span></p>
        </CardContent></Card>
        <Card className="bg-blue-900/30 border-blue-700/40"><CardContent className="p-3">
          <p className="text-[10px] text-blue-400">Current Balance</p>
          <p className="text-xs text-slate-300 mt-1">CGST: <span className={`font-bold ${bal.cgst >= 0 ? 'text-blue-400' : 'text-red-400'}`}>Rs.{bal.cgst.toLocaleString('en-IN')}</span></p>
          <p className="text-xs text-slate-300">SGST: <span className={`font-bold ${bal.sgst >= 0 ? 'text-blue-400' : 'text-red-400'}`}>Rs.{bal.sgst.toLocaleString('en-IN')}</span></p>
          <p className="text-xs text-slate-300">IGST: <span className={`font-bold ${bal.igst >= 0 ? 'text-blue-400' : 'text-red-400'}`}>Rs.{bal.igst.toLocaleString('en-IN')}</span></p>
        </CardContent></Card>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
        <Button onClick={openObDialog} variant="outline" size="sm" className="border-purple-600 text-purple-400 hover:bg-purple-900/30" data-testid="gst-ob-btn">
          <Wallet className="w-4 h-4 mr-1" /> Set Opening Balance
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
              <TableCell className="text-slate-200 text-xs">{e.date}</TableCell>
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

// ===== Main Ledgers Component =====
export default function Ledgers({ filters, user }) {
  const [activeTab, setActiveTab] = useState("outstanding");

  return (
    <div className="space-y-4" data-testid="ledgers-page">
      {/* Sub-tabs */}
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        <Button
          onClick={() => setActiveTab("outstanding")}
          variant={activeTab === "outstanding" ? "default" : "ghost"}
          size="sm"
          className={activeTab === "outstanding"
            ? "bg-red-500 hover:bg-red-600 text-white"
            : "text-slate-300 hover:bg-slate-700"}
          data-testid="tab-outstanding"
        >
          <ClipboardList className="w-4 h-4 mr-1" />
          Outstanding Report
        </Button>
        <Button
          onClick={() => setActiveTab("party-ledger")}
          variant={activeTab === "party-ledger" ? "default" : "ghost"}
          size="sm"
          className={activeTab === "party-ledger"
            ? "bg-blue-500 hover:bg-blue-600 text-white"
            : "text-slate-300 hover:bg-slate-700"}
          data-testid="tab-party-ledger"
        >
          <BookOpen className="w-4 h-4 mr-1" />
          Party Ledger
        </Button>
        <Button
          onClick={() => setActiveTab("gst-ledger")}
          variant={activeTab === "gst-ledger" ? "default" : "ghost"}
          size="sm"
          className={activeTab === "gst-ledger"
            ? "bg-purple-500 hover:bg-purple-600 text-white"
            : "text-slate-300 hover:bg-slate-700"}
          data-testid="tab-gst-ledger"
        >
          <Receipt className="w-4 h-4 mr-1" />
          GST Ledger
        </Button>
      </div>

      {activeTab === "outstanding" ? (
        <OutstandingReport filters={filters} />
      ) : activeTab === "gst-ledger" ? (
        <GSTLedger filters={filters} />
      ) : (
        <PartyLedger filters={filters} />
      )}
    </div>
  );
}
