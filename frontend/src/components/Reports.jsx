import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { fmtDate } from "@/utils/date";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Download, FileText, TrendingUp, TrendingDown, BarChart3, Scale, CalendarDays, Truck, Wheat, IndianRupee, Package, Users, Fuel, Send, AlertTriangle } from "lucide-react";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
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
  const [mode, setMode] = useState("normal"); // "normal" or "detail"

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams({ date, mode });
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/reports/daily?${p}`);
      setData(res.data);
    } catch { toast.error("Daily report load nahi hua"); }
    finally { setLoading(false); }
  }, [date, mode, filters.kms_year, filters.season]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const exportData = async (format) => {
    const p = new URLSearchParams({ date, mode });
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    if (filters.season) p.append('season', filters.season);
    const { downloadFile } = await import('../utils/download');
    downloadFile(`/api/reports/daily/${format}?${p}`, `daily_report_${mode}_${date}.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
  };

  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [tgConfirmOpen, setTgConfirmOpen] = useState(false);
  const [tgRecipients, setTgRecipients] = useState([]);
  const [tgLoading, setTgLoading] = useState(false);

  const openTelegramConfirm = async () => {
    setTgLoading(true);
    setTgConfirmOpen(true);
    try {
      const res = await axios.get(`${API}/telegram/config`);
      setTgRecipients(res.data.chat_ids || []);
    } catch {
      setTgRecipients([]);
    } finally { setTgLoading(false); }
  };

  const sendToTelegram = async () => {
    try {
      setSendingTelegram(true);
      setTgConfirmOpen(false);
      const payload = { date };
      if (filters.kms_year) payload.kms_year = filters.kms_year;
      if (filters.season) payload.season = filters.season;
      const res = await axios.post(`${API}/telegram/send-report`, payload);
      if (res.data.success) {
        toast.success(res.data.message || "Telegram par bhej diya!");
      } else {
        toast.error(res.data.message || "Telegram send failed");
      }
    } catch (e) {
      const msg = e.response?.data?.detail || "Telegram send failed";
      toast.error(msg);
    } finally { setSendingTelegram(false); }
  };

  const isDetail = mode === "detail";

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

  const DetailTable = ({ headers, rows, className = "" }) => (
    <div className={`overflow-x-auto text-xs mt-2 ${className}`}>
      <table className="w-full"><thead><tr className="border-b border-slate-700 text-slate-400">
        {headers.map(h => <th key={h.key} className={`py-1.5 px-2 ${h.align === 'right' ? 'text-right' : 'text-left'}`}>{h.label}</th>)}
      </tr></thead><tbody>
        {rows.map((r,i) => <tr key={i} className="border-b border-slate-700/50">{r}</tr>)}
      </tbody></table>
    </div>
  );

  return (
    <div className="space-y-4" data-testid="daily-report">
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <Label className="text-xs text-slate-400">Date / तारीख</Label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white h-9 w-44" data-testid="daily-report-date" />
        </div>
        {/* Mode Toggle */}
        <div className="flex bg-slate-900 rounded-lg border border-slate-700 overflow-hidden h-9">
          <button onClick={() => setMode("normal")}
            className={`px-3 text-xs font-medium transition-colors ${mode === "normal" ? "bg-amber-500 text-slate-900" : "text-slate-400 hover:text-white"}`}
            data-testid="daily-mode-normal">Normal</button>
          <button onClick={() => setMode("detail")}
            className={`px-3 text-xs font-medium transition-colors ${mode === "detail" ? "bg-amber-500 text-slate-900" : "text-slate-400 hover:text-white"}`}
            data-testid="daily-mode-detail">Detail</button>
        </div>
        <Button onClick={fetchReport} variant="outline" size="sm" className="border-slate-600 text-slate-300 h-9"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
        <Button onClick={() => exportData('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400 h-9" data-testid="daily-export-excel"><Download className="w-4 h-4 mr-1" /> Excel</Button>
        <Button onClick={() => exportData('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400 h-9" data-testid="daily-export-pdf"><FileText className="w-4 h-4 mr-1" /> PDF</Button>
        {isDetail && (
          <Button onClick={openTelegramConfirm} disabled={sendingTelegram} variant="outline" size="sm"
            className="border-blue-500 text-blue-400 hover:bg-blue-500/10 h-9" data-testid="daily-send-telegram">
            <Send className={`w-4 h-4 mr-1 ${sendingTelegram ? 'animate-pulse' : ''}`} />
            {sendingTelegram ? "Sending..." : "Telegram"}
          </Button>
        )}
        <Button variant="outline" size="sm" className="border-green-500 text-green-400 hover:bg-green-500/10 h-9" data-testid="daily-send-whatsapp"
          onClick={async () => {
            if (!data) { toast.error("Pehle report load karein"); return; }
            const summary = [
              `*Daily Report - ${date}* (${mode})`,
              `---`,
              `Paddy: ${data.paddy_entries?.count || 0} entries | Mill W: ${((data.paddy_entries?.total_mill_w || 0)/100).toFixed(2)} QNTL`,
              data.milling ? `Milling: ${data.milling.count || 0} entries | Rice: ${((data.milling.total_rice || 0)/100).toFixed(2)} QNTL` : '',
              data.cash_transactions ? `Cash: In Rs.${(data.cash_transactions.total_in || 0).toLocaleString()} | Out Rs.${(data.cash_transactions.total_out || 0).toLocaleString()}` : '',
              data.sale_vouchers ? `Sales: ${data.sale_vouchers.count || 0} vouchers | Rs.${(data.sale_vouchers.total_amount || 0).toLocaleString()}` : '',
              `---`,
              `Mill Entry System`
            ].filter(Boolean).join('\n');
            // Build PDF URL for attachment
            const pdfUrl = `${API}/daily-report/pdf?date=${date}&mode=${mode}&kms_year=${filters.kms_year || ''}&season=${filters.season || ''}`;
            try {
              const res = await axios.post(`${API}/whatsapp/send-daily-report`, {
                report_text: summary, pdf_url: pdfUrl, send_to_group: true
              });
              if (res.data.success) toast.success(res.data.message || "Daily Report WhatsApp pe bhej diya!");
              else toast.error(res.data.error || "WhatsApp fail");
            } catch (e) { toast.error(e.response?.data?.detail || "WhatsApp fail"); }
          }}
        >
          <Send className="w-4 h-4 mr-1" /> WhatsApp
        </Button>
      </div>

      {loading ? <div className="text-center py-8 text-slate-400">Loading...</div>
      : !data ? null : (
        <div className="space-y-3">
          {/* Paddy Entries */}
          <Section title="Paddy Entries / धान" icon={Truck} color="text-blue-400" count={data.paddy_entries.count}>
            <div className="grid grid-cols-4 gap-3 mb-2">
              {[
                ["Total Mill W (QNTL)", ((data.paddy_entries.total_mill_w || 0) / 100).toFixed(2), "text-white"],
                ["Total BAG", data.paddy_entries.total_bags, "text-amber-400"],
                ["Final W. QNTL (Auto)", (data.paddy_entries.total_final_w / 100).toFixed(2), "text-green-400"],
                ["Total Bag Deposite", data.paddy_entries.total_g_deposite || 0, "text-cyan-400"],
              ].map(([l,v,c]) => (
                <div key={l} className="text-center p-2 bg-slate-900/50 rounded">
                  <p className="text-[10px] text-slate-400">{l}</p>
                  <p className={`text-lg font-bold ${c}`}>{v}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-3 mb-2">
              {[
                ["Total Bag Issued", data.paddy_entries.total_g_issued || 0, "text-purple-400"],
                ["Total Cash Paid", `₹${(data.paddy_entries.total_cash_paid || 0).toLocaleString()}`, "text-green-300"],
                ["Total Diesel Paid", `₹${(data.paddy_entries.total_diesel_paid || 0).toLocaleString()}`, "text-orange-400"],
              ].map(([l,v,c]) => (
                <div key={l} className="text-center p-2 bg-slate-900/50 rounded">
                  <p className="text-[10px] text-slate-400">{l}</p>
                  <p className={`text-lg font-bold ${c}`}>{v}</p>
                </div>
              ))}
            </div>
            {data.paddy_entries.details.length > 0 && (
              isDetail ? (
                <DetailTable
                  headers={[
                    {key:'truck',label:'Truck',align:'left'},{key:'agent',label:'Agent',align:'left'},{key:'mandi',label:'Mandi',align:'left'},
                    {key:'rst',label:'RST',align:'left'},{key:'tp',label:'TP',align:'left'},
                    {key:'qntl',label:'QNTL',align:'right'},{key:'bags',label:'Bags',align:'right'},
                    {key:'gdep',label:'G.Dep',align:'right'},{key:'gbw',label:'GBW',align:'right'},
                    {key:'ppkt',label:'P.Pkt',align:'right'},{key:'ppkt_cut',label:'P.Cut',align:'right'},
                    {key:'mill_w',label:'Mill W',align:'right'},{key:'moist',label:'M%',align:'right'},
                    {key:'mcut',label:'M.Cut',align:'right'},{key:'cut',label:'C%',align:'right'},
                    {key:'ddp',label:'D/D/P',align:'right'},{key:'final',label:'Final W',align:'right'},
                    {key:'gissued',label:'G.Iss',align:'right'},{key:'cash',label:'Cash',align:'right'},{key:'diesel',label:'Diesel',align:'right'}
                  ]}
                  rows={data.paddy_entries.details.map((d,i) => (<>
                    <td className="py-1 px-1.5 text-white whitespace-nowrap">{d.truck_no}</td>
                    <td className="py-1 px-1.5 text-slate-300 whitespace-nowrap">{d.agent}</td>
                    <td className="py-1 px-1.5 text-slate-300 whitespace-nowrap">{d.mandi}</td>
                    <td className="py-1 px-1.5 text-slate-400 whitespace-nowrap">{d.rst_no || '-'}</td>
                    <td className="py-1 px-1.5 text-slate-400 whitespace-nowrap">{d.tp_no || '-'}</td>
                    <td className="py-1 px-1.5 text-right text-green-400 font-semibold">{(d.kg / 100).toFixed(2)}</td>
                    <td className="py-1 px-1.5 text-right text-slate-300">{d.bags}</td>
                    <td className="py-1 px-1.5 text-right text-cyan-400">{d.g_deposite || 0}</td>
                    <td className="py-1 px-1.5 text-right text-slate-400">{((d.gbw_cut || 0) / 100).toFixed(2)}</td>
                    <td className="py-1 px-1.5 text-right text-pink-400">{d.plastic_bag || 0}</td>
                    <td className="py-1 px-1.5 text-right text-pink-300">{((d.p_pkt_cut || 0) / 100).toFixed(2)}</td>
                    <td className="py-1 px-1.5 text-right text-blue-400">{(d.mill_w / 100).toFixed(2)}</td>
                    <td className="py-1 px-1.5 text-right text-orange-400">{d.moisture || 0}</td>
                    <td className="py-1 px-1.5 text-right text-orange-300">{((d.moisture_cut || 0) / 100).toFixed(2)}</td>
                    <td className="py-1 px-1.5 text-right text-purple-400">{d.cutting_percent}%</td>
                    <td className="py-1 px-1.5 text-right text-slate-400">{d.disc_dust_poll || 0}</td>
                    <td className="py-1 px-1.5 text-right text-amber-400 font-semibold">{(d.final_w / 100).toFixed(2)}</td>
                    <td className="py-1 px-1.5 text-right text-cyan-400">{d.g_issued}</td>
                    <td className="py-1 px-1.5 text-right text-green-300">{d.cash_paid || 0}</td>
                    <td className="py-1 px-1.5 text-right text-orange-400">{d.diesel_paid || 0}</td>
                  </>))}
                />
              ) : (
                <DetailTable
                  headers={[{key:'truck',label:'Truck',align:'left'},{key:'agent',label:'Agent',align:'left'},
                    {key:'qntl',label:'QNTL',align:'right'},{key:'final',label:'Final W',align:'right'}]}
                  rows={data.paddy_entries.details.map((d,i) => (<>
                    <td className="py-1 px-2 text-white">{d.truck_no}</td>
                    <td className="py-1 px-2 text-slate-300">{d.agent}</td>
                    <td className="py-1 px-2 text-right text-amber-400">{(d.kg / 100).toFixed(2)}</td>
                    <td className="py-1 px-2 text-right text-green-400">{(d.final_w / 100).toFixed(2)}</td>
                  </>))}
                />
              )
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
              {isDetail && data.milling.details.length > 0 && (
                <DetailTable
                  headers={[{key:'pin',label:'Paddy In(Q)',align:'right'},{key:'rout',label:'Rice Out(Q)',align:'right'},
                    {key:'type',label:'Type',align:'left'},{key:'frk',label:'FRK(Q)',align:'right'},
                    {key:'cmr',label:'CMR Ready(Q)',align:'right'},{key:'out',label:'Outturn%',align:'right'}]}
                  rows={data.milling.details.map((d,i) => (<>
                    <td className="py-1 px-2 text-right text-white">{d.paddy_in}</td>
                    <td className="py-1 px-2 text-right text-green-400">{d.rice_out}</td>
                    <td className="py-1 px-2 text-slate-300">{d.type}</td>
                    <td className="py-1 px-2 text-right text-red-400">{d.frk}</td>
                    <td className="py-1 px-2 text-right text-cyan-400">{d.cmr_ready}</td>
                    <td className="py-1 px-2 text-right text-amber-400">{d.outturn}%</td>
                  </>))}
                />
              )}
            </Section>
          )}

          {/* Private Trading */}
          {(data.pvt_paddy.count > 0 || data.rice_sales.count > 0) && (
            <Section title="Private Trading / निजी व्यापार" icon={Wheat} color="text-purple-400">
              {data.pvt_paddy.count > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-slate-400 mb-1 font-semibold">Paddy Purchase ({data.pvt_paddy.count}) - {data.pvt_paddy.total_qntl} Qntl | ₹{data.pvt_paddy.total_amount.toLocaleString('en-IN')}</p>
                  {isDetail ? (
                    <DetailTable
                      headers={[{key:'party',label:'Party',align:'left'},{key:'mandi',label:'Mandi',align:'left'},
                        {key:'truck',label:'Truck',align:'left'},{key:'qntl',label:'Qntl',align:'right'},
                        {key:'rate',label:'Rate/Q',align:'right'},{key:'amt',label:'Amount',align:'right'},
                        {key:'cash',label:'Cash',align:'right'},{key:'diesel',label:'Diesel',align:'right'}]}
                      rows={data.pvt_paddy.details.map((d,i) => (<>
                        <td className="py-1 px-2 text-white">{d.party}</td>
                        <td className="py-1 px-2 text-slate-300">{d.mandi}</td>
                        <td className="py-1 px-2 text-slate-400">{d.truck_no}</td>
                        <td className="py-1 px-2 text-right text-amber-400">{d.qntl}</td>
                        <td className="py-1 px-2 text-right text-slate-300">₹{d.rate}</td>
                        <td className="py-1 px-2 text-right text-red-400 font-semibold">₹{d.amount?.toLocaleString('en-IN')}</td>
                        <td className="py-1 px-2 text-right text-green-300">₹{(d.cash_paid||0).toLocaleString('en-IN')}</td>
                        <td className="py-1 px-2 text-right text-orange-400">₹{(d.diesel_paid||0).toLocaleString('en-IN')}</td>
                      </>))}
                    />
                  ) : (
                    <DetailTable
                      headers={[{key:'party',label:'Party',align:'left'},{key:'mandi',label:'Mandi',align:'left'},
                        {key:'qntl',label:'Qntl',align:'right'},{key:'amt',label:'Amount',align:'right'}]}
                      rows={data.pvt_paddy.details.map((d,i) => (<>
                        <td className="py-1 px-2 text-white">{d.party}</td>
                        <td className="py-1 px-2 text-slate-300">{d.mandi}</td>
                        <td className="py-1 px-2 text-right text-amber-400">{d.qntl}</td>
                        <td className="py-1 px-2 text-right text-red-400">₹{d.amount?.toLocaleString('en-IN')}</td>
                      </>))}
                    />
                  )}
                </div>
              )}
              {data.rice_sales.count > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-1 font-semibold">Rice Sales ({data.rice_sales.count}) - {data.rice_sales.total_qntl} Q | ₹{data.rice_sales.total_amount.toLocaleString('en-IN')}</p>
                  {isDetail ? (
                    <DetailTable
                      headers={[{key:'party',label:'Party',align:'left'},{key:'qntl',label:'Qntl',align:'right'},
                        {key:'type',label:'Type',align:'left'},{key:'rate',label:'Rate',align:'right'},
                        {key:'amt',label:'Amount',align:'right'},{key:'veh',label:'Vehicle',align:'left'}]}
                      rows={data.rice_sales.details.map((d,i) => (<>
                        <td className="py-1 px-2 text-white">{d.party}</td>
                        <td className="py-1 px-2 text-right text-amber-400">{d.qntl}</td>
                        <td className="py-1 px-2 text-slate-300">{d.type}</td>
                        <td className="py-1 px-2 text-right text-slate-300">₹{d.rate}</td>
                        <td className="py-1 px-2 text-right text-green-400 font-semibold">₹{d.amount?.toLocaleString('en-IN')}</td>
                        <td className="py-1 px-2 text-slate-400">{d.vehicle}</td>
                      </>))}
                    />
                  ) : (
                    <DetailTable
                      headers={[{key:'party',label:'Party',align:'left'},{key:'qntl',label:'Qntl',align:'right'},
                        {key:'type',label:'Type',align:'left'},{key:'amt',label:'Amount',align:'right'}]}
                      rows={data.rice_sales.details.map((d,i) => (<>
                        <td className="py-1 px-2 text-white">{d.party}</td>
                        <td className="py-1 px-2 text-right text-amber-400">{d.qntl}</td>
                        <td className="py-1 px-2 text-slate-300">{d.type}</td>
                        <td className="py-1 px-2 text-right text-green-400">₹{d.amount?.toLocaleString('en-IN')}</td>
                      </>))}
                    />
                  )}
                </div>
              )}
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
            {data.cash_flow.details.length > 0 && (
              isDetail ? (
                <DetailTable
                  headers={[{key:'desc',label:'Description',align:'left'},{key:'party',label:'Party',align:'left'},
                    {key:'cat',label:'Category',align:'left'},{key:'type',label:'Type',align:'left'},
                    {key:'acc',label:'Account',align:'left'},{key:'amt',label:'Amount',align:'right'}]}
                  rows={data.cash_flow.details.map((d,i) => (<>
                    <td className="py-1 px-2 text-white">{d.desc}</td>
                    <td className="py-1 px-2 text-slate-300">{d.party}</td>
                    <td className="py-1 px-2 text-slate-400">{d.category}</td>
                    <td className="py-1 px-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${d.type === 'jama' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>{d.type.toUpperCase()}</span></td>
                    <td className="py-1 px-2 text-slate-300">{d.account.toUpperCase()}</td>
                    <td className={`py-1 px-2 text-right font-semibold ${d.type === 'jama' ? 'text-green-400' : 'text-red-400'}`}>₹{d.amount.toLocaleString('en-IN')}</td>
                  </>))}
                />
              ) : (
                <DetailTable
                  headers={[{key:'desc',label:'Description',align:'left'},{key:'type',label:'Type',align:'left'},
                    {key:'acc',label:'Account',align:'left'},{key:'amt',label:'Amount',align:'right'}]}
                  rows={data.cash_flow.details.map((d,i) => (<>
                    <td className="py-1 px-2 text-white">{d.desc}</td>
                    <td className="py-1 px-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${d.type === 'jama' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>{d.type.toUpperCase()}</span></td>
                    <td className="py-1 px-2 text-slate-300">{d.account.toUpperCase()}</td>
                    <td className={`py-1 px-2 text-right font-semibold ${d.type === 'jama' ? 'text-green-400' : 'text-red-400'}`}>₹{d.amount.toLocaleString('en-IN')}</td>
                  </>))}
                />
              )
            )}
          </Section>

          {/* Cash Transactions / लेन-देन */}
          {data.cash_transactions && data.cash_transactions.count > 0 && (
            <Section title="Cash Transactions / लेन-देन" icon={IndianRupee} color="text-yellow-400" count={data.cash_transactions.count}>
              <div className="grid grid-cols-3 gap-3 mb-2">
                {[
                  ["Total Jama", `₹${(data.cash_transactions.total_jama || 0).toLocaleString('en-IN')}`, "text-green-400"],
                  ["Total Nikasi", `₹${(data.cash_transactions.total_nikasi || 0).toLocaleString('en-IN')}`, "text-red-400"],
                  ["Balance", `₹${((data.cash_transactions.total_jama || 0) - (data.cash_transactions.total_nikasi || 0)).toLocaleString('en-IN')}`, 
                    (data.cash_transactions.total_jama || 0) >= (data.cash_transactions.total_nikasi || 0) ? "text-green-400" : "text-red-400"],
                ].map(([l,v,c]) => (
                  <div key={l} className="text-center p-2 bg-slate-900/50 rounded">
                    <p className="text-[10px] text-slate-400">{l}</p>
                    <p className={`text-sm font-bold ${c}`}>{v}</p>
                  </div>
                ))}
              </div>
              <DetailTable
                headers={[
                  {key:'date',label:'Date',align:'left'},
                  {key:'party',label:'Party Name',align:'left'},
                  {key:'type',label:'Type (Jama/Nikasi)',align:'left'},
                  {key:'amt',label:'Amount (Rs.)',align:'right'},
                  ...(isDetail ? [{key:'desc',label:'Description',align:'left'}] : []),
                  {key:'mode',label:'Payment Mode',align:'left'}
                ]}
                rows={data.cash_transactions.details.map((d,i) => (<>
                  <td className="py-1 px-2 text-slate-300 whitespace-nowrap">{d.date}</td>
                  <td className="py-1 px-2 text-white">{d.party_name}{d.party_type ? <span className="text-[9px] text-slate-500 ml-1">({d.party_type})</span> : ''}</td>
                  <td className="py-1 px-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${d.txn_type === 'jama' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                      {d.txn_type === 'jama' ? 'JAMA' : 'NIKASI'}
                    </span>
                  </td>
                  <td className={`py-1 px-2 text-right font-semibold ${d.txn_type === 'jama' ? 'text-green-400' : 'text-red-400'}`}>₹{(d.amount || 0).toLocaleString('en-IN')}</td>
                  {isDetail && <td className="py-1 px-2 text-slate-400 text-[10px]">{d.description}</td>}
                  <td className="py-1 px-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${d.payment_mode === 'Ledger' ? 'bg-blue-900/40 text-blue-400' : d.payment_mode === 'Cash' ? 'bg-amber-900/40 text-amber-400' : 'bg-purple-900/40 text-purple-400'}`}>
                      {d.payment_mode}
                    </span>
                  </td>
                </>))}
              />
            </Section>
          )}

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
            {isDetail && data.payments.msp_details && data.payments.msp_details.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] text-slate-500 font-semibold mb-1">MSP Payment Details:</p>
                <DetailTable
                  headers={[{key:'dc',label:'DC No',align:'left'},{key:'qntl',label:'Qntl',align:'right'},
                    {key:'rate',label:'Rate/Q',align:'right'},{key:'amt',label:'Amount',align:'right'},{key:'mode',label:'Mode',align:'left'}]}
                  rows={data.payments.msp_details.map((d,i) => (<>
                    <td className="py-1 px-2 text-white">{d.dc_no}</td>
                    <td className="py-1 px-2 text-right text-amber-400">{d.qntl}</td>
                    <td className="py-1 px-2 text-right text-slate-300">₹{d.rate}</td>
                    <td className="py-1 px-2 text-right text-green-400">₹{d.amount?.toLocaleString('en-IN')}</td>
                    <td className="py-1 px-2 text-slate-300">{d.mode}</td>
                  </>))}
                />
              </div>
            )}
            {isDetail && data.payments.pvt_payment_details && data.payments.pvt_payment_details.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] text-slate-500 font-semibold mb-1">Private Payment Details:</p>
                <DetailTable
                  headers={[{key:'party',label:'Party',align:'left'},{key:'type',label:'Type',align:'left'},
                    {key:'mode',label:'Mode',align:'left'},{key:'amt',label:'Amount',align:'right'}]}
                  rows={data.payments.pvt_payment_details.map((d,i) => (<>
                    <td className="py-1 px-2 text-white">{d.party}</td>
                    <td className="py-1 px-2 text-slate-300">{d.ref_type}</td>
                    <td className="py-1 px-2 text-slate-400">{d.mode}</td>
                    <td className="py-1 px-2 text-right text-amber-400">₹{d.amount?.toLocaleString('en-IN')}</td>
                  </>))}
                />
              </div>
            )}
          </Section>

          {/* Pump Account / Diesel */}
          {data.pump_account && (data.pump_account.total_diesel > 0 || data.pump_account.total_paid > 0 || (data.pump_account.details && data.pump_account.details.length > 0)) && (
            <Section title="Pump Account / डीज़ल" icon={Fuel} color="text-orange-400">
              <div className="grid grid-cols-3 gap-3 mb-2">
                {[["Total Diesel", `₹${data.pump_account.total_diesel.toLocaleString('en-IN')}`, "text-orange-400"],
                  ["Total Paid", `₹${data.pump_account.total_paid.toLocaleString('en-IN')}`, "text-green-400"],
                  ["Balance", `₹${data.pump_account.balance.toLocaleString('en-IN')}`, "text-red-400"]
                ].map(([l,v,c]) => (
                  <div key={l} className="text-center p-2 bg-slate-900/50 rounded">
                    <p className="text-[10px] text-slate-400">{l}</p>
                    <p className={`text-sm font-bold ${c}`}>{v}</p>
                  </div>
                ))}
              </div>
              {data.pump_account.details && data.pump_account.details.length > 0 && (
                <DetailTable
                  headers={[{key:'pump',label:'Pump',align:'left'},{key:'type',label:'Type',align:'left'},
                    {key:'truck',label:'Truck',align:'left'},{key:'agent',label:'Agent',align:'left'},
                    {key:'desc',label:'Description',align:'left'},{key:'amt',label:'Amount',align:'right'}]}
                  rows={data.pump_account.details.map((d,i) => (<>
                    <td className="py-1 px-2 text-white">{d.pump}</td>
                    <td className={`py-1 px-2 ${d.txn_type === 'payment' ? 'text-green-400' : 'text-orange-400'}`}>{d.txn_type === 'payment' ? 'PAID' : 'DIESEL'}</td>
                    <td className="py-1 px-2 text-slate-300">{d.truck_no || '-'}</td>
                    <td className="py-1 px-2 text-slate-300">{d.agent || '-'}</td>
                    <td className="py-1 px-2 text-slate-400">{d.desc || '-'}</td>
                    <td className="py-1 px-2 text-right text-amber-400 font-semibold">₹{d.amount?.toLocaleString('en-IN')}</td>
                  </>))}
                />
              )}
            </Section>
          )}

          {/* DC Deliveries */}
          {data.dc_deliveries.count > 0 && (
            <Section title="DC Deliveries" icon={Truck} color="text-white" count={data.dc_deliveries.count}>
              <p className="text-sm text-amber-400 font-bold">{data.dc_deliveries.total_qntl} Q delivered</p>
              {isDetail && data.dc_deliveries.details && data.dc_deliveries.details.length > 0 && (
                <DetailTable
                  headers={[{key:'dc',label:'DC No',align:'left'},{key:'godown',label:'Godown',align:'left'},
                    {key:'veh',label:'Vehicle',align:'left'},{key:'qntl',label:'Qntl',align:'right'},{key:'bags',label:'Bags',align:'right'}]}
                  rows={data.dc_deliveries.details.map((d,i) => (<>
                    <td className="py-1 px-2 text-white">{d.dc_no}</td>
                    <td className="py-1 px-2 text-slate-300">{d.godown}</td>
                    <td className="py-1 px-2 text-slate-300">{d.vehicle}</td>
                    <td className="py-1 px-2 text-right text-amber-400">{d.qntl}</td>
                    <td className="py-1 px-2 text-right text-slate-300">{d.bags}</td>
                  </>))}
                />
              )}
            </Section>
          )}

          {/* Mill Parts Stock - Full Section */}
          {(data.mill_parts.in_count > 0 || data.mill_parts.used_count > 0) && (
            <Section title="Mill Parts Stock" icon={Package} color="text-cyan-400">
              <div className="grid grid-cols-3 gap-3 mb-2">
                <div className="text-center p-2 bg-slate-900/50 rounded">
                  <p className="text-[10px] text-slate-400">Parts In</p>
                  <p className="text-lg font-bold text-emerald-400">{data.mill_parts.in_count}</p>
                </div>
                <div className="text-center p-2 bg-slate-900/50 rounded">
                  <p className="text-[10px] text-slate-400">Parts Used</p>
                  <p className="text-lg font-bold text-red-400">{data.mill_parts.used_count}</p>
                </div>
                <div className="text-center p-2 bg-slate-900/50 rounded">
                  <p className="text-[10px] text-slate-400">Purchase Amount</p>
                  <p className="text-lg font-bold text-amber-400">₹{(data.mill_parts.in_amount || 0).toLocaleString('en-IN')}</p>
                </div>
              </div>
              {data.mill_parts.in_details.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] text-emerald-400 font-semibold mb-1">Parts Purchased:</p>
                  <DetailTable
                    headers={[{key:'part',label:'Part',align:'left'},{key:'room',label:'Store Room',align:'left'},
                      {key:'qty',label:'Qty',align:'right'},{key:'rate',label:'Rate',align:'right'},
                      {key:'party',label:'Party',align:'left'},{key:'bill',label:'Bill No',align:'left'},
                      {key:'amt',label:'Amount',align:'right'}]}
                    rows={data.mill_parts.in_details.map((d,i) => (<>
                      <td className="py-1 px-2 text-white font-semibold">{d.part}</td>
                      <td className="py-1 px-2 text-cyan-400 text-[11px]">{d.store_room || '-'}</td>
                      <td className="py-1 px-2 text-right text-amber-400">{d.qty}</td>
                      <td className="py-1 px-2 text-right text-slate-300">₹{d.rate}</td>
                      <td className="py-1 px-2 text-slate-300">{d.party}</td>
                      <td className="py-1 px-2 text-slate-400">{d.bill_no}</td>
                      <td className="py-1 px-2 text-right text-emerald-400 font-semibold">₹{d.amount?.toLocaleString('en-IN')}</td>
                    </>))}
                  />
                </div>
              )}
              {data.mill_parts.used_details.length > 0 && (
                <div>
                  <p className="text-[10px] text-red-400 font-semibold mb-1">Parts Used:</p>
                  <DetailTable
                    headers={[{key:'part',label:'Part',align:'left'},{key:'room',label:'Store Room',align:'left'},
                      {key:'qty',label:'Qty',align:'right'},{key:'remark',label:'Remark',align:'left'}]}
                    rows={data.mill_parts.used_details.map((d,i) => (<>
                      <td className="py-1 px-2 text-white font-semibold">{d.part}</td>
                      <td className="py-1 px-2 text-cyan-400 text-[11px]">{d.store_room || '-'}</td>
                      <td className="py-1 px-2 text-right text-red-400">{d.qty}</td>
                      <td className="py-1 px-2 text-slate-400">{d.remark}</td>
                    </>))}
                  />
                </div>
              )}
            </Section>
          )}

          {/* Staff Attendance */}
          {data.staff_attendance && data.staff_attendance.total > 0 && (
            <Section title="Staff Attendance / हाज़िरी" icon={Users} color="text-violet-400" count={data.staff_attendance.total}>
              <div className="grid grid-cols-5 gap-2 mb-2">
                {[
                  ["Present", data.staff_attendance.present, "text-emerald-400 bg-emerald-900/20"],
                  ["Half Day", data.staff_attendance.half_day, "text-amber-400 bg-amber-900/20"],
                  ["Holiday", data.staff_attendance.holiday, "text-blue-400 bg-blue-900/20"],
                  ["Absent", data.staff_attendance.absent, "text-red-400 bg-red-900/20"],
                  ["Not Marked", data.staff_attendance.not_marked || 0, "text-slate-400 bg-slate-800"],
                ].map(([l,v,c]) => (
                  <div key={l} className={`text-center p-2 rounded ${c.split(' ').slice(1).join(' ')}`}>
                    <p className="text-[10px] text-slate-400">{l}</p>
                    <p className={`text-lg font-bold ${c.split(' ')[0]}`}>{v}</p>
                  </div>
                ))}
              </div>
              {data.staff_attendance.details.length > 0 && (
                <DetailTable
                  headers={[{key:'name',label:'Staff Name',align:'left'},{key:'status',label:'Status',align:'left'}]}
                  rows={data.staff_attendance.details.map((d,i) => {
                    const statusMap = {present: ['P - Present','text-emerald-400 bg-emerald-900/40'], absent: ['A - Absent','text-red-400 bg-red-900/40'],
                      half_day: ['H - Half Day','text-amber-400 bg-amber-900/40'], holiday: ['CH - Holiday','text-blue-400 bg-blue-900/40'],
                      not_marked: ['- Not Marked','text-slate-500 bg-slate-800']};
                    const [label, cls] = statusMap[d.status] || [d.status, 'text-slate-400'];
                    return (<>
                      <td className="py-1.5 px-2 text-white font-medium">{d.name}</td>
                      <td className="py-1.5 px-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${cls}`}>{label}</span></td>
                    </>);
                  })}
                />
              )}
            </Section>
          )}

          {/* Hemali Payments */}
          {data.hemali_payments && data.hemali_payments.count > 0 && (
            <Section title="Hemali Payments / हेमाली" icon={Users} color="text-amber-400" count={data.hemali_payments.count}>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[
                  ["Paid", data.hemali_payments.paid_count, "text-green-400 bg-green-900/20"],
                  ["Unpaid", data.hemali_payments.unpaid_count, "text-orange-400 bg-orange-900/20"],
                  ["Total Work", `₹${(data.hemali_payments.total_work || 0).toLocaleString('en-IN')}`, "text-amber-400 bg-amber-900/20"],
                  ["Total Paid", `₹${(data.hemali_payments.total_paid || 0).toLocaleString('en-IN')}`, "text-red-400 bg-red-900/20"],
                ].map(([l,v,c]) => (
                  <div key={l} className={`text-center p-2 rounded ${c.split(' ').slice(1).join(' ')}`}>
                    <p className="text-[10px] text-slate-400">{l}</p>
                    <p className={`text-lg font-bold ${c.split(' ')[0]}`}>{v}</p>
                  </div>
                ))}
              </div>
              {data.hemali_payments.details && data.hemali_payments.details.length > 0 && (
                <DetailTable
                  headers={[
                    {key:'sardar',label:'Sardar',align:'left'}, {key:'items',label:'Items',align:'left'},
                    {key:'total',label:'Total',align:'right'}, {key:'adv',label:'Adv Deduct',align:'right'},
                    {key:'paid',label:'Paid',align:'right'}, {key:'newadv',label:'New Adv',align:'right'},
                    {key:'status',label:'Status',align:'left'},
                  ]}
                  rows={data.hemali_payments.details.map((d,i) => (<>
                    <td className="py-1 px-2 text-white font-medium">{d.sardar}</td>
                    <td className="py-1 px-2 text-slate-300 max-w-[150px] truncate">{d.items}</td>
                    <td className="py-1 px-2 text-right text-amber-400">₹{(d.total || 0).toLocaleString('en-IN')}</td>
                    <td className="py-1 px-2 text-right text-orange-400">{d.advance_deducted > 0 ? `₹${d.advance_deducted.toLocaleString('en-IN')}` : '-'}</td>
                    <td className="py-1 px-2 text-right text-red-400 font-semibold">₹{(d.amount_paid || 0).toLocaleString('en-IN')}</td>
                    <td className="py-1 px-2 text-right text-yellow-400">{d.new_advance > 0 ? `₹${d.new_advance.toLocaleString('en-IN')}` : '-'}</td>
                    <td className="py-1 px-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${d.status === 'paid' ? 'text-green-400 bg-green-900/40' : 'text-orange-400 bg-orange-900/40'}`}>
                        {d.status === 'paid' ? 'PAID' : 'UNPAID'}
                      </span>
                    </td>
                  </>))}
                />
              )}
            </Section>
          )}

          {/* Sale Vouchers */}
          {data.sale_vouchers && data.sale_vouchers.count > 0 && (
            <Section title="Sale Vouchers / बिक्री वाउचर" icon={IndianRupee} color="text-green-400">
              <p className="text-xs text-slate-400 mb-1 font-semibold">
                Total: {data.sale_vouchers.count} vouchers | ₹{data.sale_vouchers.total_amount.toLocaleString('en-IN')}
              </p>
              {data.sale_vouchers.details && data.sale_vouchers.details.length > 0 && (
                <DetailTable
                  headers={[{key:'vno',label:'V.No',align:'left'},{key:'party',label:'Party',align:'left'},
                    {key:'truck',label:'Truck',align:'left'},{key:'total',label:'Total',align:'right'},
                    {key:'adv',label:'Advance',align:'right'},{key:'bal',label:'Balance',align:'right'}]}
                  rows={data.sale_vouchers.details.map((d,i) => (<>
                    <td className="py-1 px-2 text-white">{d.voucher_no}</td>
                    <td className="py-1 px-2 text-slate-300">{d.party}</td>
                    <td className="py-1 px-2 text-slate-400">{d.truck_no}</td>
                    <td className="py-1 px-2 text-right text-green-400 font-semibold">₹{d.total?.toLocaleString('en-IN')}</td>
                    <td className="py-1 px-2 text-right text-amber-400">₹{(d.advance||0).toLocaleString('en-IN')}</td>
                    <td className="py-1 px-2 text-right text-red-400">₹{(d.balance||0).toLocaleString('en-IN')}</td>
                  </>))}
                />
              )}
            </Section>
          )}

          {/* Purchase Vouchers */}
          {data.purchase_vouchers && data.purchase_vouchers.count > 0 && (
            <Section title="Purchase Vouchers / खरीद वाउचर" icon={IndianRupee} color="text-red-400">
              <p className="text-xs text-slate-400 mb-1 font-semibold">
                Total: {data.purchase_vouchers.count} vouchers | ₹{data.purchase_vouchers.total_amount.toLocaleString('en-IN')}
              </p>
              {data.purchase_vouchers.details && data.purchase_vouchers.details.length > 0 && (
                <DetailTable
                  headers={[{key:'vno',label:'V.No',align:'left'},{key:'party',label:'Party',align:'left'},
                    {key:'truck',label:'Truck',align:'left'},{key:'total',label:'Total',align:'right'},
                    {key:'adv',label:'Advance',align:'right'},{key:'bal',label:'Balance',align:'right'}]}
                  rows={data.purchase_vouchers.details.map((d,i) => (<>
                    <td className="py-1 px-2 text-white">{d.voucher_no}</td>
                    <td className="py-1 px-2 text-slate-300">{d.party}</td>
                    <td className="py-1 px-2 text-slate-400">{d.truck_no}</td>
                    <td className="py-1 px-2 text-right text-red-400 font-semibold">₹{d.total?.toLocaleString('en-IN')}</td>
                    <td className="py-1 px-2 text-right text-amber-400">₹{(d.advance||0).toLocaleString('en-IN')}</td>
                    <td className="py-1 px-2 text-right text-green-400">₹{(d.balance||0).toLocaleString('en-IN')}</td>
                  </>))}
                />
              )}
            </Section>
          )}

          {/* By-products + FRK bottom cards (always show) */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3 text-center">
              <p className="text-[10px] text-slate-400">DC Deliveries</p>
              <p className="text-lg font-bold text-white">{data.dc_deliveries.count}</p>
              <p className="text-xs text-slate-400">{data.dc_deliveries.total_qntl} Q</p>
            </CardContent></Card>
            <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
              <p className="text-[10px] text-slate-400 text-center">By-Products ({data.byproducts.count})</p>
              <p className="text-lg font-bold text-amber-400 text-center">₹{data.byproducts.total_amount.toLocaleString('en-IN')}</p>
              {isDetail && data.byproducts.details && data.byproducts.details.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {data.byproducts.details.map((d,i) => (
                    <p key={i} className="text-[10px] text-slate-400">{d.type} - {d.buyer}: ₹{d.amount?.toLocaleString('en-IN')}</p>
                  ))}
                </div>
              )}
            </CardContent></Card>
            <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
              <p className="text-[10px] text-slate-400 text-center">FRK Purchase ({data.frk.count})</p>
              <p className="text-lg font-bold text-red-400 text-center">₹{data.frk.total_amount.toLocaleString('en-IN')}</p>
              <p className="text-xs text-slate-400 text-center">{data.frk.total_qntl} Q</p>
              {isDetail && data.frk.details && data.frk.details.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {data.frk.details.map((d,i) => (
                    <p key={i} className="text-[10px] text-slate-400">{d.party}: {d.qntl}Q @ ₹{d.rate} = ₹{d.amount?.toLocaleString('en-IN')}</p>
                  ))}
                </div>
              )}
            </CardContent></Card>
          </div>
        </div>
      )}

      {/* Telegram Confirmation Dialog */}
      <Dialog open={tgConfirmOpen} onOpenChange={setTgConfirmOpen}>
        <DialogContent className="max-w-sm bg-slate-800 border-slate-700 text-white" data-testid="telegram-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="text-blue-400 flex items-center gap-2">
              <Send className="w-5 h-5" /> Telegram par Report Bhejein?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="bg-slate-900/60 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Date / तारीख</span>
                <span className="text-white font-medium">{date.split('-').reverse().join('-')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Mode</span>
                <span className="text-amber-400 font-medium">Detail PDF</span>
              </div>
              {filters.kms_year && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">FY Year</span>
                  <span className="text-white">{filters.kms_year}</span>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs text-slate-400 mb-2">Recipients / प्राप्तकर्ता:</p>
              {tgLoading ? (
                <p className="text-xs text-slate-500">Loading...</p>
              ) : tgRecipients.length > 0 ? (
                <div className="space-y-1.5">
                  {tgRecipients.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 bg-slate-700/50 px-3 py-1.5 rounded text-sm">
                      <Send className="w-3 h-3 text-blue-400 shrink-0" />
                      <span className="text-white">{r.label || r.chat_id}</span>
                      <span className="text-slate-500 text-xs ml-auto">{r.chat_id}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-400 text-xs bg-amber-500/10 p-2 rounded">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Telegram configured nahi hai. Settings mein setup karein.</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-700">
              <Button onClick={() => setTgConfirmOpen(false)} variant="outline" size="sm"
                className="flex-1 border-slate-600 text-slate-300" data-testid="telegram-confirm-cancel">
                Cancel
              </Button>
              <Button onClick={sendToTelegram} disabled={tgRecipients.length === 0} size="sm"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" data-testid="telegram-confirm-send">
                <Send className="w-4 h-4 mr-1" /> Bhejein
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ===== AGENT & MANDI WISE REPORT =====
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

  const exportData = async (format) => {
    try {
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      if (search.trim()) p.append('search', search.trim());
      if (dateFrom) p.append('date_from', dateFrom);
      if (dateTo) p.append('date_to', dateTo);
      // Pass expanded mandi names so PDF/Excel only includes those
      const expanded = Object.keys(expandedMandis).filter(k => expandedMandis[k]);
      if (expanded.length > 0) p.append('mandis', expanded.join(','));
      const res = await axios.get(`${API}/reports/agent-mandi-wise/${format}?${p}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url;
      a.download = `agent_mandi_report.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
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
              {data.mandis.map(m => (
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
          <Button onClick={() => exportData('excel')} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="agent-mandi-export-excel">
            <Download className="w-4 h-4 mr-1" /> Excel
          </Button>
          <Button onClick={() => exportData('pdf')} size="sm" className="bg-red-600 hover:bg-red-700 text-white" data-testid="agent-mandi-export-pdf">
            <FileText className="w-4 h-4 mr-1" /> PDF
          </Button>
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
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
          {[
            ["Total Entries", totals.entry_count, "", "text-white"],
            ["Total Final W", ((totals.total_final_w || 0) / 100).toFixed(2), "Q", "text-amber-400"],
            ["Extra QNTL", totals.total_extra_qntl || totals.extra_qntl || 0, "Q", "text-red-400"],
            ["Total Bags", totals.total_bag, "", "text-blue-400"],
            ["Gunny Deposit", totals.total_g_deposite || totals.g_deposite || 0, "", "text-cyan-400"],
            ["Gunny Issued", totals.total_g_issued || totals.g_issued || 0, "", "text-purple-400"],
            ["Final Weight", ((totals.total_final_w || 0) / 100).toFixed(2), "Q", "text-emerald-400"],
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
                      </tr>
                    </thead>
                    <tbody>
                      {mandi.entries.map((entry, idx) => (
                        <tr key={idx} className={`border-t border-slate-700/50 ${idx % 2 === 0 ? '' : 'bg-slate-800/50'} hover:bg-slate-700/30`}>
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

// ===== MAIN REPORTS COMPONENT =====
const Reports = ({ filters, user }) => {
  const [activeReport, setActiveReport] = useState("cmr-dc");
  return (
    <div className="space-y-3" data-testid="reports-module">
      <div className="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-700 w-fit flex-wrap">
        {[
          { id: "cmr-dc", label: "CMR vs DC", icon: Scale },
          { id: "pnl", label: "Season P&L", icon: BarChart3 },
          { id: "daily", label: "Daily Report", icon: CalendarDays },
          { id: "agent-mandi", label: "Agent & Mandi", icon: Users },
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
      {activeReport === "agent-mandi" && <AgentMandiReport filters={filters} />}
    </div>
  );
};

export default Reports;
