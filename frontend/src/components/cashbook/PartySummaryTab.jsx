import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

  const fJama = filteredParties.reduce((s, p) => s + (p.total_jama || p.jama || 0), 0);
  const fNikasi = filteredParties.reduce((s, p) => s + (p.total_nikasi || p.nikasi || 0), 0);
  const fBalance = fJama - fNikasi;

  return (
    <div className="space-y-3">
      {/* Filters & Export - compact row */}
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <Label className="text-xs text-slate-400 mb-1 block">Party Type</Label>
          <Select value={partySummaryFilter || "all"} onValueChange={(v) => setPartySummaryFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-36 bg-slate-700/80 border-slate-600 text-white h-8 text-xs" data-testid="party-summary-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Local Party">Local Party</SelectItem>
              <SelectItem value="Truck">Truck</SelectItem>
              <SelectItem value="Agent">Agent</SelectItem>
              <SelectItem value="Diesel">Diesel</SelectItem>
              <SelectItem value="Pvt Paddy Purchase">Pvt Paddy Purchase</SelectItem>
              <SelectItem value="Rice Sale">Rice Sale</SelectItem>
              <SelectItem value="Cash Party">Cash Party</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-slate-400 mb-1 block">Status</Label>
          <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-32 bg-slate-700/80 border-slate-600 text-white h-8 text-xs" data-testid="party-summary-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="settled">Settled</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => { const u = `${API}/cash-book/party-summary/excel?kms_year=${filters.kms_year||''}&season=${filters.season||''}${partySummaryFilter?'&party_type='+partySummaryFilter:''}${statusFilter?'&status='+statusFilter:''}`; window.open(u); }}
          variant="outline" size="sm" className="border-emerald-600/50 text-emerald-400 hover:bg-emerald-900/30 h-8 px-3 text-xs" data-testid="party-summary-export-excel">
          <Download className="w-3 h-3 mr-1" /> Excel
        </Button>
        <Button onClick={() => { const u = `${API}/cash-book/party-summary/pdf?kms_year=${filters.kms_year||''}&season=${filters.season||''}${partySummaryFilter?'&party_type='+partySummaryFilter:''}${statusFilter?'&status='+statusFilter:''}`; window.open(u); }}
          variant="outline" size="sm" className="border-red-600/50 text-red-400 hover:bg-red-900/30 h-8 px-3 text-xs" data-testid="party-summary-export-pdf">
          <FileText className="w-3 h-3 mr-1" /> PDF
        </Button>
      </div>

      {/* Compact Stats Row */}
      {partySummary?.summary && (
        <div className="flex gap-4 text-xs">
          <span className="text-slate-400">Parties: <span className="text-white font-semibold" data-testid="party-summary-total">{partySummary.summary.total_parties}</span></span>
          <span className="text-slate-400">Settled: <span className="text-emerald-400 font-semibold" data-testid="party-summary-settled">{partySummary.summary.settled_count}</span></span>
          <span className="text-slate-400">Pending: <span className="text-red-400 font-semibold" data-testid="party-summary-pending">{partySummary.summary.pending_count}</span></span>
          <span className="text-slate-400">Outstanding: <span className="text-amber-400 font-semibold" data-testid="party-summary-outstanding">Rs.{Math.abs(partySummary.summary.total_outstanding).toLocaleString('en-IN')}</span></span>
        </div>
      )}

      {/* Party Table */}
      {partySummary && partySummary.parties.length > 0 ? (
        filteredParties.length > 0 ? (
          <div className="bg-slate-800/80 border border-slate-700/50 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-600/60 bg-slate-700/40">
                    <th className="text-left text-slate-400 text-[11px] font-medium px-3 py-2.5 w-8">#</th>
                    <th className="text-left text-slate-400 text-[11px] font-medium px-3 py-2.5">Party Name</th>
                    <th className="text-left text-slate-400 text-[11px] font-medium px-3 py-2.5 w-28">Type</th>
                    <th className="text-right text-slate-400 text-[11px] font-medium px-3 py-2.5 w-32">Jama (Cr)</th>
                    <th className="text-right text-slate-400 text-[11px] font-medium px-3 py-2.5 w-32">Nikasi (Dr)</th>
                    <th className="text-right text-slate-400 text-[11px] font-medium px-3 py-2.5 w-32">Balance</th>
                    <th className="text-center text-slate-400 text-[11px] font-medium px-2 py-2.5 w-12">Txns</th>
                    <th className="text-center text-slate-400 text-[11px] font-medium px-2 py-2.5 w-20">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParties.map((p, idx) => (
                    <tr key={p.party_name}
                      className="border-b border-slate-700/30 cursor-pointer hover:bg-slate-700/40 transition-colors"
                      onClick={() => onPartyClick(p)}
                      data-testid={`party-row-${idx}`}>
                      <td className="text-slate-500 text-xs px-3 py-2">{idx + 1}</td>
                      <td className="text-white font-medium text-sm px-3 py-2">{p.party_name}</td>
                      <td className="px-3 py-2">
                        {p.party_type && <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          p.party_type === 'Truck' ? 'bg-blue-500/15 text-blue-400' :
                          p.party_type === 'Agent' ? 'bg-purple-500/15 text-purple-400' :
                          p.party_type === 'Diesel' ? 'bg-orange-500/15 text-orange-400' :
                          'bg-slate-600/30 text-slate-400'
                        }`}>{p.party_type}</span>}
                      </td>
                      <td className="text-right text-emerald-400 text-sm px-3 py-2">
                        {(p.total_jama || p.jama || 0) > 0 ? `Rs.${(p.total_jama || p.jama || 0).toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td className="text-right text-red-400 text-sm px-3 py-2">
                        {(p.total_nikasi || p.nikasi || 0) > 0 ? `Rs.${(p.total_nikasi || p.nikasi || 0).toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td className={`text-right font-semibold text-sm px-3 py-2 ${p.balance === 0 ? 'text-emerald-400' : p.balance > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                        {p.balance === 0 ? 'Settled' : <>Rs.{Math.abs(p.balance).toLocaleString('en-IN')} <span className="text-[10px] opacity-70">{p.balance > 0 ? '(Dr)' : '(Cr)'}</span></>}
                      </td>
                      <td className="text-center text-slate-400 text-xs px-2 py-2">{p.txn_count}</td>
                      <td className="text-center px-2 py-2">
                        {p.balance === 0 ? (
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-red-400 mx-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
                  {/* Total Row */}
                  <tr className="border-t border-amber-500/30 bg-slate-700/30">
                    <td colSpan={3} className="text-amber-400 font-semibold text-xs px-3 py-2.5">TOTAL ({filteredParties.length} parties)</td>
                    <td className="text-right text-emerald-400 font-semibold text-sm px-3 py-2.5">Rs.{fJama.toLocaleString('en-IN')}</td>
                    <td className="text-right text-red-400 font-semibold text-sm px-3 py-2.5">Rs.{fNikasi.toLocaleString('en-IN')}</td>
                    <td className="text-right text-amber-400 font-semibold text-sm px-3 py-2.5">Rs.{Math.abs(fBalance).toLocaleString('en-IN')}</td>
                    <td></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : <p className="text-center text-slate-400 py-6 text-sm">No parties match filter</p>
      ) : partySummary ? (
        <p className="text-center text-slate-400 py-6 text-sm">Koi party data nahi mila</p>
      ) : null}
    </div>
  );
};

export default PartySummaryTab;
