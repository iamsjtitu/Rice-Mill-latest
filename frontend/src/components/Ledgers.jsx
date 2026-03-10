import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw, Download, FileText, AlertCircle, Truck, Users,
  IndianRupee, FileSpreadsheet, BookOpen, ClipboardList
} from "lucide-react";

const fmtDate = (d) => { if (!d) return ''; const p = String(d).split('-'); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d; };

const BACKEND_URL = (typeof window !== 'undefined' && window.ELECTRON_API_URL) || process.env.REACT_APP_BACKEND_URL;
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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedParty, setSelectedParty] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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
      </div>

      {activeTab === "outstanding" ? (
        <OutstandingReport filters={filters} />
      ) : (
        <PartyLedger filters={filters} />
      )}
    </div>
  );
}
