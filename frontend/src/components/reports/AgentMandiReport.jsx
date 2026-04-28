import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { fmtDate } from "@/utils/date";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Download, FileText, Truck, Users } from "lucide-react";
import { fetchAsBlob } from "../../utils/download";
import { ShareFileViaWhatsApp } from "../common/ShareFileViaWhatsApp";
import { API } from "./constants";

const AgentMandiReport = ({ filters }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedMandis, setExpandedMandis] = useState({});
  const [pvtDialog, setPvtDialog] = useState({ open: false, mandi: null });
  const [pvtRate, setPvtRate] = useState("");
  const [selectedMandi, setSelectedMandi] = useState("all");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      if (search.trim()) p.append('search', search.trim());
      if (dateFrom) p.append('date_from', dateFrom);
      if (dateTo) p.append('date_to', dateTo);
      const res = await axios.get(`${API}/reports/agent-mandi-wise?${p}`);
      setData(res.data);
      // Auto-expand all when searching
      if (search.trim()) {
        const expanded = {};
        (res.data.mandis || []).forEach(m => { expanded[m.mandi_name] = true; });
        setExpandedMandis(expanded);
      }
    } catch (e) { toast.error("Report load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season, search, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleMandi = (name) => {
    setExpandedMandis(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const expandAll = () => {
    const expanded = {};
    (data?.mandis || []).forEach(m => { expanded[m.mandi_name] = true; });
    setExpandedMandis(expanded);
  };
  const collapseAll = () => setExpandedMandis({});

  // Build export URL with current filters (used for WhatsApp share too)
  const buildExportUrl = (format) => {
    const p = new URLSearchParams();
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    if (filters.season) p.append('season', filters.season);
    if (search.trim()) p.append('search', search.trim());
    if (dateFrom) p.append('date_from', dateFrom);
    if (dateTo) p.append('date_to', dateTo);
    const expanded = Object.keys(expandedMandis).filter(k => expandedMandis[k]);
    if (expanded.length > 0) p.append('mandis', expanded.join(','));
    return `/api/reports/agent-mandi-wise/${format}?${p}`;
  };

  const exportData = async (format) => {
    try {
      const { downloadFile } = await import('../../utils/download');
      downloadFile(buildExportUrl(format), `agent_mandi_report.${format === 'excel' ? 'xlsx' : 'pdf'}`);
    } catch (e) { toast.error("Export failed"); }
  };

  const handleMoveToPvt = async () => {
    const rate = parseFloat(pvtRate);
    if (!rate || rate <= 0) { toast.error("Rate daalein"); return; }
    try {
      const res = await axios.post(`${API}/reports/agent-mandi-wise/move-to-pvt`, {
        mandi_name: pvtDialog.mandi.mandi_name,
        agent_name: pvtDialog.mandi.agent_name,
        extra_qntl: pvtDialog.mandi.extra_qntl,
        rate, kms_year: filters.kms_year, season: filters.season || "Kharif",
        username: "admin",
        last_truck: pvtDialog.mandi.last_truck || {}
      });
      if (res.data.success) { toast.success(res.data.message); setPvtDialog({ open: false, mandi: null }); setPvtRate(""); fetchData(); }
      else toast.error(res.data.detail || "Error");
    } catch (e) { toast.error(e.response?.data?.detail || "Move failed"); }
  };

  const fmtNum = (v) => typeof v === 'number' ? v.toLocaleString('en-IN') : v;

  if (loading) return <div className="text-slate-400 text-center py-8">Loading...</div>;

  return (
    <div className="space-y-4" data-testid="agent-mandi-report">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] max-w-[300px]">
          <Input
            placeholder="Mandi ya Agent name search karein..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white text-sm"
            data-testid="agent-mandi-search"
          />
        </div>
        {data && data.mandis && (
          <Select value={selectedMandi} onValueChange={setSelectedMandi}>
            <SelectTrigger className="w-[160px] bg-slate-700 border-slate-600 text-white h-9 text-sm" data-testid="mandi-filter">
              <SelectValue placeholder="Mandi Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Mandi</SelectItem>
              {data.mandis.filter(m => m.mandi_name).map(m => (
                <SelectItem key={m.mandi_name} value={m.mandi_name}>{m.mandi_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-xs whitespace-nowrap">From:</span>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white text-sm w-[145px]" data-testid="agent-mandi-date-from" />
          <span className="text-slate-400 text-xs whitespace-nowrap">To:</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white text-sm w-[145px]" data-testid="agent-mandi-date-to" />
          {(dateFrom || dateTo) && (
            <Button onClick={() => { setDateFrom(""); setDateTo(""); }} variant="ghost" size="sm" className="text-red-400 hover:text-red-300 px-2 h-8">Clear</Button>
          )}
        </div>
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300" data-testid="agent-mandi-refresh">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
        <Button onClick={expandAll} variant="outline" size="sm" className="border-slate-600 text-slate-300">Expand All</Button>
        <Button onClick={collapseAll} variant="outline" size="sm" className="border-slate-600 text-slate-300">Collapse All</Button>
        <div className="flex gap-2 ml-auto">
          <Button onClick={() => exportData('excel')} size="sm"
            title="Excel download" aria-label="Excel"
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 w-9 p-0" data-testid="agent-mandi-export-excel">
            <Download className="w-4 h-4" />
          </Button>
          <Button onClick={() => exportData('pdf')} size="sm"
            title="PDF download" aria-label="PDF"
            className="bg-red-600 hover:bg-red-700 text-white h-9 w-9 p-0" data-testid="agent-mandi-export-pdf">
            <FileText className="w-4 h-4" />
          </Button>
          <ShareFileViaWhatsApp
            getFile={async () => fetchAsBlob(buildExportUrl('pdf'), 'agent_mandi_report.pdf')}
            caption="Agent / Mandi Report"
            title="Agent/Mandi Report WhatsApp pe bhejein (PDF)"
            testId="agent-mandi-share-whatsapp"
          />
        </div>
      </div>

      {/* Grand Summary - dynamic based on selected mandi */}
      {data && data.grand_totals && (() => {
        let totals = data.grand_totals;
        if (selectedMandi !== "all") {
          const m = (data.mandis || []).find(x => x.mandi_name === selectedMandi);
          if (m && m.totals) totals = m.totals;
        }
        return (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
          {[
            ["Total Entries", totals.entry_count, "", "text-white"],
            ["Total Final W", ((totals.total_final_w || 0) / 100).toFixed(2), "Q", "text-amber-400"],
            ["Extra QNTL", totals.total_extra_qntl || totals.extra_qntl || 0, "Q", "text-red-400"],
            ["Total Bags", totals.total_bag, "", "text-blue-400"],
            ["Gunny Deposit", totals.total_g_deposite || totals.g_deposite || 0, "", "text-cyan-400"],
            ["Gunny Issued", totals.total_g_issued || totals.g_issued || 0, "", "text-purple-400"],
            ["Final Weight", ((totals.total_final_w || 0) / 100).toFixed(2), "Q", "text-emerald-400"],
            ["TP Weight", (totals.total_tp_weight || 0), "Q", "text-orange-400"],
          ].map(([label, val, unit, color]) => (
            <Card key={label} className="bg-slate-800 border-slate-700">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-slate-400">{label}{selectedMandi !== "all" && <span className="text-amber-400/60 ml-1">({selectedMandi})</span>}</p>
                <p className={`text-lg font-bold ${color}`}>{fmtNum(val)}{unit && <span className="text-xs ml-0.5">{unit}</span>}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        );
      })()}

      {/* Mandi Groups */}
      {data && data.mandis && data.mandis.length > 0 ? (
        <div className="space-y-3">
          {data.mandis.map((mandi) => (
            <Card key={mandi.mandi_name} className="bg-slate-800 border-slate-700 overflow-hidden">
              {/* Mandi Header - clickable */}
              <div
                onClick={() => toggleMandi(mandi.mandi_name)}
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-700/50 transition-colors"
                data-testid={`mandi-row-${mandi.mandi_name}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-lg transition-transform ${expandedMandis[mandi.mandi_name] ? 'rotate-90' : ''}`}>&#9654;</span>
                  <div>
                    <span className="text-amber-400 font-bold text-base">{mandi.mandi_name}</span>
                    <span className="text-slate-400 text-sm ml-3">Agent: <span className="text-white">{mandi.agent_name}</span></span>
                    {mandi.target_qntl > 0 && (
                      <span className="text-slate-500 text-xs ml-3">Target: {fmtNum(mandi.target_qntl)}Q + {mandi.cutting_percent || 0}% = {fmtNum(mandi.expected_total)}Q | Final W: {fmtNum(mandi.actual_final_qntl)}Q | Extra: {fmtNum(mandi.extra_qntl)}Q</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-center"><p className="text-[10px] text-slate-500">Entries</p><p className="text-white font-bold">{mandi.totals.entry_count}</p></div>
                  <div className="text-center"><p className="text-[10px] text-slate-500">Final W</p><p className="text-amber-400 font-bold">{fmtNum(mandi.totals.total_final_w/100)}</p></div>
                  {mandi.extra_qntl > 0 && (
                    <div className="text-center"><p className="text-[10px] text-red-400">Extra</p><p className="text-red-400 font-bold">{fmtNum(mandi.extra_qntl)}Q</p></div>
                  )}
                  <div className="text-center"><p className="text-[10px] text-slate-500">Bags</p><p className="text-blue-400 font-bold">{fmtNum(mandi.totals.total_bag)}</p></div>
                  <div className="text-center"><p className="text-[10px] text-slate-500">G.Deposit</p><p className="text-cyan-400 font-bold">{fmtNum(mandi.totals.total_g_deposite)}</p></div>
                  <div className="text-center"><p className="text-[10px] text-slate-500">G.Issued</p><p className="text-purple-400 font-bold">{fmtNum(mandi.totals.total_g_issued)}</p></div>
                  <div className="text-center"><p className="text-[10px] text-slate-500">Final Wt</p><p className="text-emerald-400 font-bold">{fmtNum(mandi.totals.total_final_w/100)}</p></div>
                  <div className="text-center"><p className="text-[10px] text-slate-500">TP Wt</p><p className="text-orange-400 font-bold">{fmtNum(mandi.totals.total_tp_weight || 0)}</p></div>
                  {mandi.extra_qntl > 0 && (
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); setPvtDialog({ open: true, mandi }); setPvtRate(""); }}
                      className={mandi.pvt_moved ? "bg-slate-600 text-slate-300 cursor-not-allowed" : "bg-red-600 hover:bg-red-700 text-white"}
                      disabled={mandi.pvt_moved} data-testid={`move-pvt-${mandi.mandi_name}`}>
                      {mandi.pvt_moved ? "Paddy Purchased" : "Move to Paddy Purchase"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Expanded entries table */}
              {expandedMandis[mandi.mandi_name] && (
                <div className="border-t border-slate-700 overflow-x-auto">
                  <table className="w-full text-xs table-fixed" style={{minWidth:'1050px'}}>
                    <thead>
                      <tr className="bg-slate-900/80">
                        <th className="px-2 py-2 text-slate-400 font-medium text-left w-[80px]">Date</th>
                        <th className="px-2 py-2 text-slate-400 font-medium text-left w-[90px]">Truck No</th>
                        <th className="px-2 py-2 text-slate-400 font-medium text-right w-[65px]">QNTL</th>
                        <th className="px-2 py-2 text-slate-400 font-medium text-right w-[50px]">BAG</th>
                        <th className="px-2 py-2 text-slate-400 font-medium text-right w-[60px]">G.Dep</th>
                        <th className="px-2 py-2 text-slate-400 font-medium text-right w-[60px]">G.Iss</th>
                        <th className="px-2 py-2 text-slate-400 font-medium text-right w-[60px]">GBW</th>
                        <th className="px-2 py-2 text-slate-400 font-medium text-right w-[55px]">P.Pkt</th>
                        <th className="px-2 py-2 text-slate-400 font-medium text-right w-[60px]">P.Cut</th>
                        <th className="px-2 py-2 text-slate-400 font-medium text-right w-[70px]">Mill W</th>
                        <th className="px-2 py-2 text-slate-400 font-medium text-right w-[45px]">M%</th>
                        <th className="px-2 py-2 text-slate-400 font-medium text-right w-[60px]">M.Cut</th>
                        <th className="px-2 py-2 text-slate-400 font-medium text-right w-[45px]">C%</th>
                        <th className="px-2 py-2 text-slate-400 font-medium text-right w-[60px]">D/D/P</th>
                        <th className="px-2 py-2 text-slate-400 font-medium text-right w-[70px]">Final W</th>
                        <th className="px-2 py-2 text-slate-400 font-medium text-right w-[60px]">TP Wt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mandi.entries.map((entry, idx) => (
                        <tr key={entry.id || `entry-${entry.truck_no}-${entry.date}-${idx}`} className={`border-t border-slate-700/50 ${idx % 2 === 0 ? '' : 'bg-slate-800/50'} hover:bg-slate-700/30`}>
                          <td className="px-2 py-1.5 text-white whitespace-nowrap">{fmtDate(entry.date)}</td>
                          <td className="px-2 py-1.5 text-white font-semibold">{entry.truck_no}</td>
                          <td className="px-2 py-1.5 text-right text-amber-400 font-semibold">{entry.qntl}</td>
                          <td className="px-2 py-1.5 text-right text-blue-400">{entry.bag}</td>
                          <td className="px-2 py-1.5 text-right text-cyan-400">{entry.g_deposite}</td>
                          <td className="px-2 py-1.5 text-right text-purple-400">{entry.g_issued}</td>
                          <td className="px-2 py-1.5 text-right text-slate-300">{fmtNum(entry.gbw_cut/100)}</td>
                          <td className="px-2 py-1.5 text-right text-purple-300">{entry.plastic_bag}</td>
                          <td className="px-2 py-1.5 text-right text-slate-300">{fmtNum(entry.p_pkt_cut/100)}</td>
                          <td className="px-2 py-1.5 text-right text-slate-300">{fmtNum(entry.mill_w/100)}</td>
                          <td className="px-2 py-1.5 text-right text-slate-400">{entry.moisture_cut_percent}</td>
                          <td className="px-2 py-1.5 text-right text-slate-300">{fmtNum(entry.moisture_cut/100)}</td>
                          <td className="px-2 py-1.5 text-right text-red-400">{entry.cutting_percent}</td>
                          <td className="px-2 py-1.5 text-right text-slate-300">{fmtNum(entry.disc_dust_poll/100)}</td>
                          <td className="px-2 py-1.5 text-right text-emerald-400 font-semibold">{fmtNum(entry.final_w/100)}</td>
                          <td className="px-2 py-1.5 text-right text-slate-300">{Number(entry.tp_weight || 0) > 0 ? fmtNum(entry.tp_weight) : '-'}</td>
                        </tr>
                      ))}
                      {/* Totals row */}
                      <tr className="border-t-2 border-amber-600/50 bg-amber-900/20">
                        <td className="px-2 py-2 text-amber-400 font-bold" colSpan={2}>TOTAL</td>
                        <td className="px-2 py-2 text-right text-amber-400 font-bold">{fmtNum(mandi.totals.total_mill_w)}</td>
                        <td className="px-2 py-2 text-right text-blue-400 font-bold">{fmtNum(mandi.totals.total_bag)}</td>
                        <td className="px-2 py-2 text-right text-cyan-400 font-bold">{fmtNum(mandi.totals.total_g_deposite)}</td>
                        <td className="px-2 py-2 text-right text-purple-400 font-bold">{fmtNum(mandi.totals.total_g_issued)}</td>
                        <td className="px-2 py-2 text-right text-slate-300 font-bold">{fmtNum(mandi.totals.total_gbw_cut/100)}</td>
                        <td className="px-2 py-2 text-right text-purple-300 font-bold">{fmtNum(mandi.totals.total_plastic_bag)}</td>
                        <td className="px-2 py-2 text-right text-slate-300 font-bold">{fmtNum(mandi.totals.total_p_pkt_cut/100)}</td>
                        <td className="px-2 py-2 text-right text-white font-bold">{fmtNum(mandi.totals.total_mill_w/100)}</td>
                        <td className="px-2 py-2"></td>
                        <td className="px-2 py-2 text-right text-slate-300 font-bold">{fmtNum(mandi.totals.total_moisture_cut/100)}</td>
                        <td className="px-2 py-2"></td>
                        <td className="px-2 py-2 text-right text-slate-300 font-bold">{fmtNum(mandi.totals.total_disc_dust_poll/100)}</td>
                        <td className="px-2 py-2 text-right text-emerald-400 font-bold">{fmtNum(mandi.totals.total_final_w/100)}</td>
                        <td className="px-2 py-2 text-right text-slate-300 font-bold">{fmtNum(mandi.totals.total_tp_weight || 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-slate-400">
          <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Koi data nahi mila</p>
        </div>
      )}

      {/* Move to Pvt Purchase Dialog */}
      {pvtDialog.open && pvtDialog.mandi && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setPvtDialog({ open: false, mandi: null })}>
          <Card className="bg-slate-800 border-slate-600 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <CardContent className="p-6 space-y-4">
              <h3 className="text-lg font-bold text-amber-400">Move to Paddy Purchase</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Mandi:</span><span className="text-white font-semibold">{pvtDialog.mandi.mandi_name}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Agent:</span><span className="text-white font-semibold">{pvtDialog.mandi.agent_name}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Target:</span><span className="text-white">{fmtNum(pvtDialog.mandi.target_qntl)}Q + {pvtDialog.mandi.cutting_percent || 0}% = {fmtNum(pvtDialog.mandi.expected_total)}Q</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Final W:</span><span className="text-amber-400">{fmtNum(pvtDialog.mandi.actual_final_qntl)}Q</span></div>
                <div className="flex justify-between border-t border-slate-700 pt-2"><span className="text-red-400 font-bold">Extra QNTL:</span><span className="text-red-400 font-bold">{fmtNum(pvtDialog.mandi.extra_qntl)}Q</span></div>
                {pvtDialog.mandi.last_truck && (
                  <div className="flex justify-between"><span className="text-slate-400">Last Truck:</span><span className="text-cyan-400">{pvtDialog.mandi.last_truck.truck_no} ({pvtDialog.mandi.last_truck.date})</span></div>
                )}
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Rate per QNTL (Rs.)</label>
                <Input type="number" value={pvtRate} onChange={e => setPvtRate(e.target.value)} placeholder="e.g. 1800"
                  className="bg-slate-700 border-slate-600 text-white" data-testid="pvt-rate-input" />
              </div>
              {pvtRate && parseFloat(pvtRate) > 0 && (
                <div className="bg-slate-900 rounded p-3 text-center">
                  <p className="text-slate-400 text-xs">Total Amount</p>
                  <p className="text-2xl font-bold text-emerald-400">Rs. {fmtNum(Math.round(pvtDialog.mandi.extra_qntl * parseFloat(pvtRate) * 100) / 100)}</p>
                  <p className="text-slate-500 text-xs">{pvtDialog.mandi.extra_qntl}Q x Rs.{pvtRate}/Q</p>
                </div>
              )}
              <div className="flex gap-3">
                <Button onClick={() => setPvtDialog({ open: false, mandi: null })} variant="outline" className="flex-1 border-slate-600 text-slate-300">Cancel</Button>
                <Button onClick={handleMoveToPvt} className="flex-1 bg-red-600 hover:bg-red-700 text-white" data-testid="confirm-move-pvt">
                  Move to Paddy Purchase
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AgentMandiReport;
