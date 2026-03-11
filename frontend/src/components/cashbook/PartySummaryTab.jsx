import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download, FileText, CheckCircle, AlertCircle } from "lucide-react";

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

  const fJama = filteredParties.reduce((s, p) => s + p.total_jama, 0);
  const fNikasi = filteredParties.reduce((s, p) => s + p.total_nikasi, 0);
  const fBalance = fJama - fNikasi;

  return (
    <div className="space-y-4">
      {/* Filters & Export */}
      <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <Label className="text-xs text-slate-400">Party Type</Label>
            <Select value={partySummaryFilter || "all"} onValueChange={(v) => setPartySummaryFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40 bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="party-summary-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Local Party">Local Party</SelectItem>
                <SelectItem value="Truck">Truck</SelectItem>
                <SelectItem value="Agent">Agent</SelectItem>
                <SelectItem value="Diesel">Diesel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-400">Status</Label>
            <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-36 bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="party-summary-status-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="settled">Settled</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => { const u = `${API}/cash-book/party-summary/excel?kms_year=${filters.kms_year||''}&season=${filters.season||''}${partySummaryFilter?'&party_type='+partySummaryFilter:''}`; window.open(u); }}
            variant="outline" size="sm" className="border-green-600 text-green-400 hover:bg-green-900/30 h-8" data-testid="party-summary-export-excel">
            <Download className="w-3 h-3 mr-1" /> Excel
          </Button>
          <Button onClick={() => { const u = `${API}/cash-book/party-summary/pdf?kms_year=${filters.kms_year||''}&season=${filters.season||''}${partySummaryFilter?'&party_type='+partySummaryFilter:''}`; window.open(u); }}
            variant="outline" size="sm" className="border-red-600 text-red-400 hover:bg-red-900/30 h-8" data-testid="party-summary-export-pdf">
            <FileText className="w-3 h-3 mr-1" /> PDF
          </Button>
        </div>
      </CardContent></Card>

      {/* Summary Cards */}
      {partySummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-slate-400 uppercase">Total Parties</p>
              <p className="text-2xl font-bold text-white" data-testid="party-summary-total">{partySummary.summary.total_parties}</p>
            </CardContent>
          </Card>
          <Card className="bg-emerald-900/30 border-emerald-700/50">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-emerald-400 uppercase">Settled (Balance 0)</p>
              <p className="text-2xl font-bold text-emerald-400" data-testid="party-summary-settled">{partySummary.summary.settled_count}</p>
            </CardContent>
          </Card>
          <Card className="bg-red-900/30 border-red-700/50">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-red-400 uppercase">Pending</p>
              <p className="text-2xl font-bold text-red-400" data-testid="party-summary-pending">{partySummary.summary.pending_count}</p>
            </CardContent>
          </Card>
          <Card className="bg-amber-900/30 border-amber-700/50">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-amber-400 uppercase">Outstanding</p>
              <p className="text-2xl font-bold text-amber-400" data-testid="party-summary-outstanding">₹{Math.abs(partySummary.summary.total_outstanding).toLocaleString('en-IN')}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Party Table */}
      {partySummary && partySummary.parties.length > 0 ? (
        filteredParties.length > 0 ? (
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '40px' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '50px' }} />
                    <col style={{ width: '90px' }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-700/30">
                      <th className="text-left text-slate-300 text-xs font-semibold px-3 py-2.5">#</th>
                      <th className="text-left text-slate-300 text-xs font-semibold px-3 py-2.5">Party Name</th>
                      <th className="text-left text-slate-300 text-xs font-semibold px-3 py-2.5">Type</th>
                      <th className="text-right text-slate-300 text-xs font-semibold px-3 py-2.5">Jama (₹)</th>
                      <th className="text-right text-slate-300 text-xs font-semibold px-3 py-2.5">Nikasi (₹)</th>
                      <th className="text-right text-slate-300 text-xs font-semibold px-3 py-2.5">Balance (₹)</th>
                      <th className="text-center text-slate-300 text-xs font-semibold px-2 py-2.5">Txns</th>
                      <th className="text-center text-slate-300 text-xs font-semibold px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredParties.map((p, idx) => (
                      <tr key={p.party_name} className={`border-b border-slate-700/50 cursor-pointer hover:bg-slate-700/50 transition-colors ${p.balance === 0 ? 'bg-emerald-900/10' : p.balance < 0 ? 'bg-red-900/10' : ''}`}
                        onClick={() => onPartyClick(p)}
                        data-testid={`party-row-${idx}`}>
                        <td className="text-slate-400 text-xs px-3 py-2.5">{idx + 1}</td>
                        <td className="text-white font-semibold text-sm px-3 py-2.5 truncate">{p.party_name}</td>
                        <td className="px-3 py-2.5">
                          {p.party_type && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                            p.party_type === 'Truck' ? 'bg-blue-900/50 text-blue-400' :
                            p.party_type === 'Agent' ? 'bg-purple-900/50 text-purple-400' :
                            p.party_type === 'Local Party' ? 'bg-amber-900/50 text-amber-400' :
                            p.party_type === 'Diesel' ? 'bg-orange-900/50 text-orange-400' :
                            'bg-slate-700 text-slate-300'
                          }`}>{p.party_type}</span>}
                        </td>
                        <td className="text-right text-emerald-400 font-semibold text-sm px-3 py-2.5">₹{p.total_jama.toLocaleString('en-IN')}</td>
                        <td className="text-right text-red-400 font-semibold text-sm px-3 py-2.5">₹{p.total_nikasi.toLocaleString('en-IN')}</td>
                        <td className={`text-right font-bold text-sm px-3 py-2.5 ${p.balance === 0 ? 'text-emerald-400' : p.balance > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                          ₹{Math.abs(p.balance).toLocaleString('en-IN')} {p.balance > 0 ? '(Dr)' : p.balance < 0 ? '(Cr)' : ''}
                        </td>
                        <td className="text-center text-slate-400 text-xs px-2 py-2.5">{p.txn_count}</td>
                        <td className="px-3 py-2.5">
                          {p.balance === 0 ? (
                            <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium whitespace-nowrap"><CheckCircle className="w-3 h-3" /> Settled</span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-400 text-xs font-medium whitespace-nowrap"><AlertCircle className="w-3 h-3" /> Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-600 bg-slate-700/50">
                      <td colSpan={3} className="text-amber-400 font-bold text-sm px-3 py-2.5">TOTAL ({filteredParties.length} parties)</td>
                      <td className="text-right text-emerald-400 font-bold text-sm px-3 py-2.5">₹{fJama.toLocaleString('en-IN')}</td>
                      <td className="text-right text-red-400 font-bold text-sm px-3 py-2.5">₹{fNikasi.toLocaleString('en-IN')}</td>
                      <td className="text-right text-amber-400 font-bold text-sm px-3 py-2.5">₹{Math.abs(fBalance).toLocaleString('en-IN')}</td>
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
