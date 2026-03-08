import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Download, FileText, TrendingUp, TrendingDown, BarChart3, Scale, CalendarDays, Truck, Wheat, IndianRupee, Package } from "lucide-react";

const BACKEND_URL = (typeof window !== 'undefined' && window.ELECTRON_API_URL) || process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// ===== CMR vs DC Report =====
const CMRvsDC = ({ filters }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/reports/cmr-vs-dc?${p}`); setData(res.data);
    } catch (e) { toast.error("Report load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season]);
  useEffect(() => { fetchData(); }, [fetchData]);
  const exportData = async (format) => {
    try {
      const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/reports/cmr-vs-dc/${format}?${p}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url;
      a.download = `cmr_vs_dc.${format === 'excel' ? 'xlsx' : 'pdf'}`; a.click();
    } catch (e) { toast.error("Export failed"); }
  };
  if (loading) return <div className="text-slate-400 text-center py-8">Loading...</div>;
  if (!data) return null;
  const m = data.milling, d = data.dc, c = data.comparison;
  return (
    <div className="space-y-4" data-testid="cmr-vs-dc-report">
      <div className="flex gap-2">
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
        <Button onClick={() => exportData('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400" data-testid="cmr-dc-export-excel"><Download className="w-4 h-4 mr-1" /> Excel</Button>
        <Button onClick={() => exportData('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400" data-testid="cmr-dc-export-pdf"><FileText className="w-4 h-4 mr-1" /> PDF</Button>
      </div>
      {/* Milling Output */}
      <Card className="bg-slate-800 border-slate-700"><CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm text-blue-400">Milling Output / उत्पादन</CardTitle></CardHeader>
        <CardContent className="pt-0"><div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[["Paddy Milled", m.total_paddy_milled, "Q", "text-white"], ["Rice Produced", m.total_rice_produced, "Q", "text-white"],
            ["FRK Used", m.total_frk_used, "Q", "text-amber-400"], ["CMR Ready", m.total_cmr_ready, "Q", "text-green-400"],
            ["Outturn", m.avg_outturn_pct, "%", "text-blue-400"], ["Milling Count", m.milling_count, "", "text-slate-300"]
          ].map(([label, val, unit, color]) => (
            <div key={label} className="text-center p-2 rounded bg-slate-900/50">
              <p className="text-[10px] text-slate-400">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{val}{unit && <span className="text-xs ml-0.5">{unit}</span>}</p>
            </div>
          ))}
        </div></CardContent>
      </Card>
      {/* DC Status */}
      <Card className="bg-slate-800 border-slate-700"><CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm text-green-400">DC Allotment & Delivery</CardTitle></CardHeader>
        <CardContent className="pt-0"><div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {[["DC Allotted", d.total_allotted, "Q", "text-white"], ["DC Delivered", d.total_delivered, "Q", "text-green-400"],
            ["DC Pending", d.total_pending, "Q", "text-red-400"], ["Total DCs", d.dc_count, "", "text-slate-300"],
            ["Deliveries", d.delivery_count, "", "text-slate-300"]
          ].map(([label, val, unit, color]) => (
            <div key={label} className="text-center p-2 rounded bg-slate-900/50">
              <p className="text-[10px] text-slate-400">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{val}{unit && <span className="text-xs ml-0.5">{unit}</span>}</p>
            </div>
          ))}
        </div></CardContent>
      </Card>
      {/* Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className={`border-slate-700 ${c.cmr_vs_dc_allotted >= 0 ? 'bg-gradient-to-br from-green-900/30 to-slate-800' : 'bg-gradient-to-br from-red-900/30 to-slate-800'}`}><CardContent className="p-4 text-center">
          <p className="text-xs text-slate-400 mb-1">CMR vs DC Allotted</p>
          <p className={`text-2xl font-bold ${c.cmr_vs_dc_allotted >= 0 ? 'text-green-400' : 'text-red-400'}`}>{c.cmr_vs_dc_allotted > 0 ? '+' : ''}{c.cmr_vs_dc_allotted} Q</p>
          <p className="text-[10px] text-slate-500 mt-1">{c.cmr_vs_dc_allotted >= 0 ? 'Surplus - zyada taiyar' : 'Deficit - kam taiyar'}</p>
        </CardContent></Card>
        <Card className={`border-slate-700 ${c.cmr_vs_dc_delivered >= 0 ? 'bg-gradient-to-br from-amber-900/30 to-slate-800' : 'bg-gradient-to-br from-red-900/30 to-slate-800'}`}><CardContent className="p-4 text-center">
          <p className="text-xs text-slate-400 mb-1">Ready but Not Delivered</p>
          <p className={`text-2xl font-bold ${c.cmr_vs_dc_delivered >= 0 ? 'text-amber-400' : 'text-red-400'}`}>{c.cmr_vs_dc_delivered} Q</p>
          <p className="text-[10px] text-slate-500 mt-1">CMR ready - actually delivered</p>
        </CardContent></Card>
        <Card className="bg-gradient-to-br from-blue-900/30 to-slate-800 border-slate-700"><CardContent className="p-4 text-center">
          <p className="text-xs text-slate-400 mb-1">By-Product Revenue</p>
          <p className="text-2xl font-bold text-blue-400">₹{data.byproduct_revenue.toLocaleString('en-IN')}</p>
        </CardContent></Card>
      </div>
    </div>
  );
};

// ===== Season P&L Report =====
const SeasonPnL = ({ filters }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/reports/season-pnl?${p}`); setData(res.data);
    } catch (e) { toast.error("P&L load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season]);
  useEffect(() => { fetchData(); }, [fetchData]);
  const exportData = async (format) => {
    try {
      const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/reports/season-pnl/${format}?${p}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url;
      a.download = `season_pnl.${format === 'excel' ? 'xlsx' : 'pdf'}`; a.click();
    } catch (e) { toast.error("Export failed"); }
  };
  if (loading) return <div className="text-slate-400 text-center py-8">Loading...</div>;
  if (!data) return null;
  return (
    <div className="space-y-4" data-testid="season-pnl-report">
      <div className="flex gap-2">
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
        <Button onClick={() => exportData('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400" data-testid="pnl-export-excel"><Download className="w-4 h-4 mr-1" /> Excel</Button>
        <Button onClick={() => exportData('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400" data-testid="pnl-export-pdf"><FileText className="w-4 h-4 mr-1" /> PDF</Button>
      </div>
      {/* Net P&L */}
      <Card className={`border-2 ${data.profit ? 'border-green-600 bg-gradient-to-r from-green-900/40 to-slate-800' : 'border-red-600 bg-gradient-to-r from-red-900/40 to-slate-800'}`}>
        <CardContent className="p-5 text-center">
          <p className="text-sm text-slate-300 mb-1">{data.profit ? 'NET PROFIT / शुद्ध लाभ' : 'NET LOSS / शुद्ध हानि'}</p>
          <p className={`text-4xl font-bold ${data.profit ? 'text-green-400' : 'text-red-400'}`}>
            {data.profit ? <TrendingUp className="w-8 h-8 inline mr-2" /> : <TrendingDown className="w-8 h-8 inline mr-2" />}
            ₹{Math.abs(data.net_pnl).toLocaleString('en-IN')}
          </p>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Income */}
        <Card className="bg-slate-800 border-green-800/30"><CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm text-green-400">Income / आय</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-1">
            {[["MSP Payments", data.income.msp_payments], ["By-Product Sales", data.income.byproduct_sales],
              ["Cash Book Jama", data.income.cash_book_jama]].map(([label, val]) => (
              <div key={label} className="flex justify-between py-1.5 border-b border-slate-700/50">
                <span className="text-xs text-slate-300">{label}</span>
                <span className="text-xs text-green-400 font-medium">₹{val.toLocaleString('en-IN')}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 border-t-2 border-green-800/50">
              <span className="text-sm font-bold text-green-400">Total Income</span>
              <span className="text-sm font-bold text-green-400">₹{data.income.total.toLocaleString('en-IN')}</span>
            </div>
          </CardContent>
        </Card>
        {/* Expenses */}
        <Card className="bg-slate-800 border-red-800/30"><CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm text-red-400">Expenses / खर्चा</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-1">
            {[["FRK Purchases", data.expenses.frk_purchases], ["Gunny Bags", data.expenses.gunny_bags],
              ["Cash Book Nikasi", data.expenses.cash_book_nikasi], ["Truck Payments", data.expenses.truck_payments],
              ["Agent Payments", data.expenses.agent_payments]].map(([label, val]) => (
              <div key={label} className="flex justify-between py-1.5 border-b border-slate-700/50">
                <span className="text-xs text-slate-300">{label}</span>
                <span className="text-xs text-red-400 font-medium">₹{val.toLocaleString('en-IN')}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 border-t-2 border-red-800/50">
              <span className="text-sm font-bold text-red-400">Total Expenses</span>
              <span className="text-sm font-bold text-red-400">₹{data.expenses.total.toLocaleString('en-IN')}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// ===== DAILY REPORT =====
const DailyReport = ({ filters }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams({ date });
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/reports/daily?${p}`);
      setData(res.data);
    } catch { toast.error("Daily report load nahi hua"); }
    finally { setLoading(false); }
  }, [date, filters.kms_year, filters.season]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const exportData = (format) => {
    const p = new URLSearchParams({ date });
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    if (filters.season) p.append('season', filters.season);
    window.open(`${API}/reports/daily/${format}?${p}`, '_blank');
  };

  const Section = ({ title, icon: Icon, color, children, count }) => (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className={`text-sm ${color} flex items-center gap-2`}>
          {Icon && <Icon className="w-4 h-4" />} {title} {count !== undefined && <span className="text-slate-500 text-xs">({count})</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-1 pb-3 px-4">{children}</CardContent>
    </Card>
  );

  return (
    <div className="space-y-4" data-testid="daily-report">
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <Label className="text-xs text-slate-400">Date / तारीख</Label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white h-9 w-44" data-testid="daily-report-date" />
        </div>
        <Button onClick={fetchReport} variant="outline" size="sm" className="border-slate-600 text-slate-300 h-9"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
        <Button onClick={() => exportData('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400 h-9" data-testid="daily-export-excel"><Download className="w-4 h-4 mr-1" /> Excel</Button>
        <Button onClick={() => exportData('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400 h-9" data-testid="daily-export-pdf"><FileText className="w-4 h-4 mr-1" /> PDF</Button>
      </div>

      {loading ? <div className="text-center py-8 text-slate-400">Loading...</div>
      : !data ? null : (
        <div className="space-y-3">
          {/* Paddy Entries */}
          <Section title="Paddy Entries / धान" icon={Truck} color="text-blue-400" count={data.paddy_entries.count}>
            <div className="grid grid-cols-3 gap-3 mb-2">
              {[["Total KG", data.paddy_entries.total_kg, "text-white"], ["Total Bags", data.paddy_entries.total_bags, "text-amber-400"], ["Final Weight", data.paddy_entries.total_final_w, "text-green-400"]].map(([l,v,c]) => (
                <div key={l} className="text-center p-2 bg-slate-900/50 rounded">
                  <p className="text-[10px] text-slate-400">{l}</p>
                  <p className={`text-lg font-bold ${c}`}>{v}</p>
                </div>
              ))}
            </div>
            {data.paddy_entries.details.length > 0 && (
              <div className="overflow-x-auto text-xs">
                <table className="w-full"><thead><tr className="border-b border-slate-700 text-slate-400">
                  <th className="text-left py-1 px-2">Truck</th><th className="text-left py-1 px-2">Agent</th>
                  <th className="text-right py-1 px-2">KG</th><th className="text-right py-1 px-2">Final W</th>
                </tr></thead><tbody>
                  {data.paddy_entries.details.map((d,i) => (
                    <tr key={i} className="border-b border-slate-700/50">
                      <td className="py-1 px-2 text-white">{d.truck_no}</td><td className="py-1 px-2 text-slate-300">{d.agent}</td>
                      <td className="py-1 px-2 text-right text-amber-400">{d.kg}</td><td className="py-1 px-2 text-right text-green-400">{d.final_w}</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            )}
          </Section>

          {/* Milling */}
          {data.milling.count > 0 && (
            <Section title="Milling / पिसाई" icon={Wheat} color="text-amber-400" count={data.milling.count}>
              <div className="grid grid-cols-3 gap-3">
                {[["Paddy In", `${data.milling.paddy_input_qntl} Q`, "text-white"], ["Rice Out", `${data.milling.rice_output_qntl} Q`, "text-green-400"], ["FRK Used", `${data.milling.frk_used_qntl} Q`, "text-red-400"]].map(([l,v,c]) => (
                  <div key={l} className="text-center p-2 bg-slate-900/50 rounded">
                    <p className="text-[10px] text-slate-400">{l}</p><p className={`text-lg font-bold ${c}`}>{v}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Private Trading */}
          {(data.pvt_paddy.count > 0 || data.rice_sales.count > 0) && (
            <Section title="Private Trading / निजी व्यापार" icon={Wheat} color="text-purple-400">
              <div className="grid grid-cols-2 gap-3">
                {data.pvt_paddy.count > 0 && (
                  <div className="p-2 bg-slate-900/50 rounded">
                    <p className="text-[10px] text-slate-400 mb-1">Pvt Paddy Purchase ({data.pvt_paddy.count})</p>
                    <p className="text-sm text-white">{data.pvt_paddy.total_kg} KG</p>
                    <p className="text-xs text-amber-400">₹{data.pvt_paddy.total_amount.toLocaleString('en-IN')}</p>
                  </div>
                )}
                {data.rice_sales.count > 0 && (
                  <div className="p-2 bg-slate-900/50 rounded">
                    <p className="text-[10px] text-slate-400 mb-1">Rice Sales ({data.rice_sales.count})</p>
                    <p className="text-sm text-white">{data.rice_sales.total_qntl} Q</p>
                    <p className="text-xs text-green-400">₹{data.rice_sales.total_amount.toLocaleString('en-IN')}</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Cash Flow */}
          <Section title="Cash Flow / नकद" icon={IndianRupee} color="text-green-400">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[["Cash Jama", data.cash_flow.cash_jama, "text-green-400"], ["Cash Nikasi", data.cash_flow.cash_nikasi, "text-red-400"],
                ["Bank Jama", data.cash_flow.bank_jama, "text-green-400"], ["Bank Nikasi", data.cash_flow.bank_nikasi, "text-red-400"]].map(([l,v,c]) => (
                <div key={l} className="text-center p-2 bg-slate-900/50 rounded">
                  <p className="text-[10px] text-slate-400">{l}</p>
                  <p className={`text-sm font-bold ${c}`}>₹{v.toLocaleString('en-IN')}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className={`text-center p-2 rounded ${data.cash_flow.net_cash >= 0 ? 'bg-green-900/20' : 'bg-red-900/20'}`}>
                <p className="text-[10px] text-slate-400">Net Cash</p>
                <p className={`text-lg font-bold ${data.cash_flow.net_cash >= 0 ? 'text-green-400' : 'text-red-400'}`}>₹{data.cash_flow.net_cash.toLocaleString('en-IN')}</p>
              </div>
              <div className={`text-center p-2 rounded ${data.cash_flow.net_bank >= 0 ? 'bg-green-900/20' : 'bg-red-900/20'}`}>
                <p className="text-[10px] text-slate-400">Net Bank</p>
                <p className={`text-lg font-bold ${data.cash_flow.net_bank >= 0 ? 'text-green-400' : 'text-red-400'}`}>₹{data.cash_flow.net_bank.toLocaleString('en-IN')}</p>
              </div>
            </div>
          </Section>

          {/* Payments Summary */}
          <Section title="Payments Summary" icon={IndianRupee} color="text-cyan-400">
            <div className="grid grid-cols-3 gap-3">
              {[["MSP Received", data.payments.msp_received, "text-green-400"], ["Pvt Paddy Paid", data.payments.pvt_paddy_paid, "text-red-400"], ["Rice Sale Rcvd", data.payments.rice_sale_received, "text-green-400"]].map(([l,v,c]) => (
                <div key={l} className="text-center p-2 bg-slate-900/50 rounded">
                  <p className="text-[10px] text-slate-400">{l}</p>
                  <p className={`text-sm font-bold ${c}`}>₹{v.toLocaleString('en-IN')}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* DC + By-products + FRK + Mill Parts */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-slate-400">DC Deliveries</p>
              <p className="text-lg font-bold text-white">{data.dc_deliveries.count}</p>
              <p className="text-xs text-slate-400">{data.dc_deliveries.total_qntl} Q</p>
            </CardContent></Card>
            <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-slate-400">By-Products</p>
              <p className="text-lg font-bold text-amber-400">₹{data.byproducts.total_amount.toLocaleString('en-IN')}</p>
              <p className="text-xs text-slate-400">{data.byproducts.count} sales</p>
            </CardContent></Card>
            <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-slate-400">FRK Purchase</p>
              <p className="text-lg font-bold text-red-400">₹{data.frk.total_amount.toLocaleString('en-IN')}</p>
              <p className="text-xs text-slate-400">{data.frk.total_qntl} Q</p>
            </CardContent></Card>
            <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-slate-400">Mill Parts</p>
              <p className="text-lg font-bold text-cyan-400">{data.mill_parts.in_count} in / {data.mill_parts.used_count} used</p>
            </CardContent></Card>
          </div>
        </div>
      )}
    </div>
  );
};

// ===== MAIN REPORTS COMPONENT =====
const Reports = ({ filters, user }) => {
  const [activeReport, setActiveReport] = useState("cmr-dc");
  return (
    <div className="space-y-3" data-testid="reports-module">
      <div className="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-700 w-fit">
        {[
          { id: "cmr-dc", label: "CMR vs DC", icon: Scale },
          { id: "pnl", label: "Season P&L", icon: BarChart3 },
          { id: "daily", label: "Daily Report", icon: CalendarDays },
        ].map(({ id, label, icon: Icon }) => (
          <Button key={id} onClick={() => setActiveReport(id)} variant={activeReport === id ? "default" : "ghost"} size="sm"
            className={activeReport === id ? "bg-amber-500 text-slate-900" : "text-slate-400 hover:text-white hover:bg-slate-700"}
            data-testid={`report-tab-${id}`}>
            <Icon className="w-4 h-4 mr-1" /> {label}
          </Button>
        ))}
      </div>
      {activeReport === "cmr-dc" && <CMRvsDC filters={filters} />}
      {activeReport === "pnl" && <SeasonPnL filters={filters} />}
      {activeReport === "daily" && <DailyReport filters={filters} />}
    </div>
  );
};

export default Reports;
