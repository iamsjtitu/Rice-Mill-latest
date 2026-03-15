import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download, FileText, CheckCircle, AlertCircle, TrendingUp, TrendingDown, Users, Wallet } from "lucide-react";

const PartySummaryTab = ({
  partySummary, partySummaryFilter, setPartySummaryFilter,
  filters, API, onPartyClick,
}) => {
  const [statusFilter, setStatusFilter] = useState("");

  const filteredParties = partySummary?.parties?.filter(p => {
    if (statusFilter === "settled") return p.balance === 0;
    if (statusFilter === "pending") return p.balance !== 0;
    return true;
  }) || [];

  const fJama = filteredParties.reduce((s, p) => s + (p.total_jama || p.jama || 0), 0);
  const fNikasi = filteredParties.reduce((s, p) => s + (p.total_nikasi || p.nikasi || 0), 0);
  const fBalance = fJama - fNikasi;

  return (
    <div className="space-y-5">
      {/* Filters & Export */}
      <Card className="bg-slate-800/80 border-slate-700/60 backdrop-blur-sm"><CardContent className="p-4">
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <Label className="text-xs text-slate-400 mb-1.5 block">Party Type</Label>
            <Select value={partySummaryFilter || "all"} onValueChange={(v) => setPartySummaryFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40 bg-slate-700/80 border-slate-600 text-white h-9 text-xs rounded-lg" data-testid="party-summary-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Local Party">Local Party</SelectItem>
                <SelectItem value="Truck">Truck</SelectItem>
                <SelectItem value="Agent">Agent</SelectItem>
                <SelectItem value="Diesel">Diesel</SelectItem>
                <SelectItem value="Pvt Paddy Purchase">Pvt Paddy Purchase</SelectItem>
                <SelectItem value="Rice Sale">Rice Sale</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-400 mb-1.5 block">Status</Label>
            <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-36 bg-slate-700/80 border-slate-600 text-white h-9 text-xs rounded-lg" data-testid="party-summary-status-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="settled">Settled</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => { const u = `${API}/cash-book/party-summary/excel?kms_year=${filters.kms_year||''}&season=${filters.season||''}${partySummaryFilter?'&party_type='+partySummaryFilter:''}${statusFilter?'&status='+statusFilter:''}`; window.open(u); }}
            variant="outline" size="sm" className="border-emerald-600/50 text-emerald-400 hover:bg-emerald-900/30 h-9 rounded-lg px-4" data-testid="party-summary-export-excel">
            <Download className="w-3.5 h-3.5 mr-1.5" /> Excel
          </Button>
          <Button onClick={() => { const u = `${API}/cash-book/party-summary/pdf?kms_year=${filters.kms_year||''}&season=${filters.season||''}${partySummaryFilter?'&party_type='+partySummaryFilter:''}${statusFilter?'&status='+statusFilter:''}`; window.open(u); }}
            variant="outline" size="sm" className="border-red-600/50 text-red-400 hover:bg-red-900/30 h-9 rounded-lg px-4" data-testid="party-summary-export-pdf">
            <FileText className="w-3.5 h-3.5 mr-1.5" /> PDF
          </Button>
        </div>
      </CardContent></Card>

      {/* Summary Cards */}
      {partySummary && partySummary.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-slate-800 to-slate-800/60 border-slate-600/40 shadow-lg">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/15 flex items-center justify-center">
                <Users className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Total Parties</p>
                <p className="text-2xl font-bold text-white" data-testid="party-summary-total">{partySummary.summary.total_parties}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-emerald-900/30 to-emerald-900/10 border-emerald-700/40 shadow-lg">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-[10px] text-emerald-400 uppercase tracking-wider">Settled (Balance 0)</p>
                <p className="text-2xl font-bold text-emerald-400" data-testid="party-summary-settled">{partySummary.summary.settled_count}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-red-900/30 to-red-900/10 border-red-700/40 shadow-lg">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-[10px] text-red-400 uppercase tracking-wider">Pending</p>
                <p className="text-2xl font-bold text-red-400" data-testid="party-summary-pending">{partySummary.summary.pending_count}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-900/30 to-amber-900/10 border-amber-700/40 shadow-lg">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-[10px] text-amber-400 uppercase tracking-wider">Outstanding</p>
                <p className="text-2xl font-bold text-amber-400" data-testid="party-summary-outstanding">Rs.{Math.abs(partySummary.summary.total_outstanding).toLocaleString('en-IN')}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Party Table */}
      {partySummary && partySummary.parties.length > 0 ? (
        filteredParties.length > 0 ? (
          <Card className="bg-slate-800/80 border-slate-700/50 shadow-xl overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '36px' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '17%' }} />
                    <col style={{ width: '17%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '46px' }} />
                    <col style={{ width: '88px' }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-slate-600/60 bg-slate-700/50">
                      <th className="text-left text-slate-400 text-[11px] font-semibold px-3 py-3 uppercase tracking-wider">#</th>
                      <th className="text-left text-slate-400 text-[11px] font-semibold px-3 py-3 uppercase tracking-wider">Party Name</th>
                      <th className="text-left text-slate-400 text-[11px] font-semibold px-3 py-3 uppercase tracking-wider">Type</th>
                      <th className="text-right text-slate-400 text-[11px] font-semibold px-3 py-3 uppercase tracking-wider">Jama (Rs.)</th>
                      <th className="text-right text-slate-400 text-[11px] font-semibold px-3 py-3 uppercase tracking-wider">Nikasi (Rs.)</th>
                      <th className="text-right text-slate-400 text-[11px] font-semibold px-3 py-3 uppercase tracking-wider">Balance (Rs.)</th>
                      <th className="text-center text-slate-400 text-[11px] font-semibold px-2 py-3 uppercase tracking-wider">Txns</th>
                      <th className="text-center text-slate-400 text-[11px] font-semibold px-3 py-3 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredParties.map((p, idx) => (
                      <tr key={p.party_name} className={`border-b border-slate-700/40 cursor-pointer transition-all duration-200 hover:bg-slate-700/60 hover:shadow-md ${
                        p.balance === 0 ? 'bg-emerald-900/5' : p.balance < 0 ? 'bg-red-900/8' : ''
                      }`}
                        onClick={() => onPartyClick(p)}
                        data-testid={`party-row-${idx}`}>
                        <td className="text-slate-500 text-xs px-3 py-3 font-medium">{idx + 1}</td>
                        <td className="text-white font-semibold text-sm px-3 py-3 truncate">{p.party_name}</td>
                        <td className="px-3 py-3">
                          {p.party_type && <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${
                            p.party_type === 'Truck' ? 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20' :
                            p.party_type === 'Agent' ? 'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/20' :
                            p.party_type === 'Local Party' ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20' :
                            p.party_type === 'Diesel' ? 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/20' :
                            p.party_type === 'Pvt Paddy Purchase' ? 'bg-pink-500/15 text-pink-400 ring-1 ring-pink-500/20' :
                            'bg-slate-600/30 text-slate-400 ring-1 ring-slate-500/20'
                          }`}>{p.party_type}</span>}
                        </td>
                        <td className="text-right px-3 py-3">
                          <span className="text-emerald-400 font-semibold text-sm">Rs.{(p.total_jama || p.jama || 0).toLocaleString('en-IN')}</span>
                        </td>
                        <td className="text-right px-3 py-3">
                          <span className="text-red-400 font-semibold text-sm">Rs.{(p.total_nikasi || p.nikasi || 0).toLocaleString('en-IN')}</span>
                        </td>
                        <td className={`text-right font-bold text-sm px-3 py-3 ${p.balance === 0 ? 'text-emerald-400' : p.balance > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                          <span className="inline-flex items-center gap-1">
                            Rs.{Math.abs(p.balance).toLocaleString('en-IN')}
                            {p.balance !== 0 && <span className="text-[10px] font-medium opacity-70">{p.balance > 0 ? '(Dr)' : '(Cr)'}</span>}
                          </span>
                        </td>
                        <td className="text-center text-slate-400 text-xs px-2 py-3 font-medium">{p.txn_count}</td>
                        <td className="px-3 py-3">
                          {p.balance === 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold ring-1 ring-emerald-500/20">
                              <CheckCircle className="w-3 h-3" /> Settled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-semibold ring-1 ring-red-500/20">
                              <AlertCircle className="w-3 h-3" /> Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-amber-500/30 bg-gradient-to-r from-amber-900/20 to-slate-800/50">
                      <td colSpan={3} className="text-amber-400 font-bold text-sm px-3 py-3.5">TOTAL ({filteredParties.length} parties)</td>
                      <td className="text-right text-emerald-400 font-bold text-sm px-3 py-3.5">Rs.{fJama.toLocaleString('en-IN')}</td>
                      <td className="text-right text-red-400 font-bold text-sm px-3 py-3.5">Rs.{fNikasi.toLocaleString('en-IN')}</td>
                      <td className="text-right text-amber-400 font-bold text-sm px-3 py-3.5">Rs.{Math.abs(fBalance).toLocaleString('en-IN')}</td>
                      <td></td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : <p className="text-center text-slate-400 py-8">No parties match filter</p>
      ) : partySummary ? (
        <Card className="bg-slate-800 border-slate-700"><CardContent className="p-8 text-center text-slate-400">Koi party data nahi mila</CardContent></Card>
      ) : null}
    </div>
  );
};

export default PartySummaryTab;
