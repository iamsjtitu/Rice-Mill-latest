import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, Download, FileText, AlertTriangle, Truck, Wheat, IndianRupee, Package, Users, Fuel, Send, Scissors } from "lucide-react";
import { SendToGroupDialog } from "../SendToGroupDialog";
import { useMessagingEnabled } from "../../hooks/useMessagingEnabled";
import { API } from "./constants";
import logger from "../../utils/logger";

const DailyReport = ({ filters }) => {
  const { wa, tg } = useMessagingEnabled();
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
    } catch (e) { logger.error(e); toast.error("Daily report load nahi hua"); }
    finally { setLoading(false); }
  }, [date, mode, filters.kms_year, filters.season]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const exportData = async (format) => {
    const p = new URLSearchParams({ date, mode });
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    if (filters.season) p.append('season', filters.season);
    const { downloadFile } = await import('../../utils/download');
    downloadFile(`/api/reports/daily/${format}?${p}`, `daily_report_${mode}_${date}.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
  };

  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [tgConfirmOpen, setTgConfirmOpen] = useState(false);
  const [tgRecipients, setTgRecipients] = useState([]);
  const [tgLoading, setTgLoading] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupText, setGroupText] = useState("");
  const [groupPdfUrl, setGroupPdfUrl] = useState("");

  const openTelegramConfirm = async () => {
    setTgLoading(true);
    setTgConfirmOpen(true);
    try {
      const res = await axios.get(`${API}/telegram/config`);
      setTgRecipients(res.data.chat_ids || []);
    } catch (e) {
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

  // Auto-slug from title for Jump-to-Section nav
  const _slugify = (t) => (t || '').split('/')[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
  const Section = ({ title, icon: Icon, color, children, count, sectionId }) => {
    const id = sectionId || `section-${_slugify(title)}`;
    return (
      <Card id={id} data-section-id={id} className="bg-slate-800 border-slate-700 scroll-mt-24">
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className={`text-sm ${color} flex items-center gap-2`}>
            {Icon && <Icon className="w-4 h-4" />} {title} {count !== undefined && <span className="text-slate-500 text-xs">({count})</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1 pb-3 px-4">{children}</CardContent>
      </Card>
    );
  };

  const DetailTable = ({ headers, rows, className = "" }) => (
    <div className={`overflow-x-auto text-xs mt-2 ${className}`}>
      <table className="w-full"><thead><tr className="border-b border-slate-700 text-slate-400">
        {headers.map(h => <th key={h.key} className={`py-1.5 px-2 ${h.align === 'right' ? 'text-right' : 'text-left'}`}>{h.label}</th>)}
      </tr></thead><tbody>
        {rows.map((r,i) => <tr key={`row-${i}`} className="border-b border-slate-700/50">{r}</tr>)}
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
        <Button onClick={fetchReport} variant="outline" size="sm" className="border-slate-600 text-slate-300 h-9"><RefreshCw className="w-4 h-4" /></Button>
        <Button onClick={() => exportData('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400 h-9" data-testid="daily-export-excel"><Download className="w-4 h-4" /></Button>
        <Button onClick={() => exportData('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400 h-9" data-testid="daily-export-pdf"><FileText className="w-4 h-4" /></Button>
        {tg && isDetail && (
          <Button onClick={openTelegramConfirm} disabled={sendingTelegram} variant="outline" size="sm"
            title="Telegram pe bhejein" aria-label="Telegram pe bhejein"
            className="border-blue-500 text-blue-400 hover:bg-blue-500/10 h-9 w-9 p-0" data-testid="daily-send-telegram">
            <Send className={`w-4 h-4 ${sendingTelegram ? 'animate-pulse' : ''}`} />
          </Button>
        )}
        {wa && <Button variant="outline" size="sm"
          title="WhatsApp pe bhejein (default numbers)" aria-label="WhatsApp pe bhejein"
          className="border-green-500 text-green-400 hover:bg-green-500/10 h-9 w-9 p-0" data-testid="daily-send-whatsapp"
          onClick={async () => {
            if (!data) { toast.error("Pehle report load karein"); return; }
            // Check if default numbers exist, else ask
            let waSettings;
            try { waSettings = (await axios.get(`${API}/whatsapp/settings`)).data; } catch(e) { waSettings = {}; }
            const hasDefaults = (waSettings.default_numbers || []).length > 0 || waSettings.group_id;
            let phone = "";
            if (!hasDefaults) {
              phone = prompt("Default numbers set nahi hain. Phone number daalein (ya Settings > WhatsApp mein default numbers set karein):");
              if (!phone) return;
            }
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
            const pdfUrl = `${API}/reports/daily/pdf?date=${date}&mode=${mode}&kms_year=${filters.kms_year || ''}&season=${filters.season || ''}`;
            try {
              const res = await axios.post(`${API}/whatsapp/send-daily-report`, {
                report_text: summary, pdf_url: pdfUrl, send_to_group: false, phone
              });
              if (res.data.success) toast.success(res.data.message || "Daily Report WhatsApp pe bhej diya!");
              else toast.error(res.data.error || res.data.message || "WhatsApp fail");
            } catch (e) { toast.error(e.response?.data?.detail || e.response?.data?.error || "WhatsApp error"); }
          }}
        >
          <Send className="w-4 h-4" />
        </Button>}
        {wa && <Button variant="outline" size="sm"
          title="WhatsApp Group pe bhejein" aria-label="WhatsApp Group pe bhejein"
          className="border-teal-500 text-teal-400 hover:bg-teal-500/10 h-9 w-9 p-0" data-testid="daily-send-to-group"
          onClick={() => {
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
            setGroupText(summary);
            setGroupPdfUrl(`/api/reports/daily/pdf?date=${date}&mode=${mode}&kms_year=${filters.kms_year || ''}&season=${filters.season || ''}`);
            setGroupDialogOpen(true);
          }}
        >
          <Users className="w-4 h-4" />
        </Button>}
      </div>

      {loading ? <div className="text-center py-8 text-slate-400">Loading...</div>
      : !data ? null : (
        <div className="space-y-3">
          {/* 🎯 v104.44.20 — Jump to Section Nav */}
          <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg px-3 py-2 flex items-center gap-2" data-testid="jump-to-section">
            <span className="text-[11px] text-slate-400 font-semibold whitespace-nowrap">Jump to:</span>
            <select
              className="flex-1 bg-slate-800 text-white text-xs border border-slate-600 rounded px-2 py-1 cursor-pointer hover:bg-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                const el = document.getElementById(id);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                e.target.value = '';
              }}
              data-testid="jump-to-section-select"
              defaultValue=""
            >
              <option value="" disabled>-- Select Section --</option>
              {(() => {
                const sections = [
                  ['Paddy Entries / धान', 'paddy-entries', data.paddy_entries?.count > 0],
                  ['Milling / पिसाई', 'milling', data.milling?.count > 0],
                  ['Private Trading', 'private-trading', (data.private_paddy_purchase?.count || 0) + (data.private_rice_sale?.count || 0) > 0],
                  ['Cash Flow / नकद', 'cash-flow', true],
                  ['Cash Transactions', 'cash-transactions', data.cash_transactions?.count > 0],
                  ['Payments Summary', 'payments-summary', true],
                  ['Pump Account / डीज़ल', 'pump-account', data.pump_account?.details?.length > 0],
                  ['DC Deliveries', 'dc-deliveries', data.dc_deliveries?.count > 0],
                  ['Mill Parts Stock', 'mill-parts-stock', data.mill_parts?.in_count + data.mill_parts?.used_count > 0],
                  ['Staff Attendance / हाज़िरी', 'staff-attendance', data.staff_attendance?.total > 0],
                  ['Hemali Payments / हेमाली', 'hemali-payments', data.hemali_payments?.count > 0],
                  ['Paddy Chalna / छलना', 'paddy-chalna', data.paddy_cutting?.count > 0],
                  ['Vehicle Weight (Auto)', 'vehicle-weight', data.vehicle_weight?.sale_count + data.vehicle_weight?.purchase_count > 0],
                  ['Per-Trip Bhada', 'per-trip-bhada', data.per_trip_bhada?.truck_count > 0],
                  ['Party Payments Breakdown', 'party-payments-breakdown', (data.truck_payments?.count || 0) + (data.agent_payments?.count || 0) + (data.local_party_payments?.count || 0) > 0],
                  ['Leased Truck / लीज़ ट्रक', 'leased-truck', data.leased_truck?.count > 0],
                  ['Oil Premium / Lab Test', 'oil-premium', data.oil_premium?.count > 0],
                  ['Sale Vouchers', 'sale-vouchers', data.sale_vouchers?.count > 0],
                  ['Purchase Vouchers', 'purchase-vouchers', data.purchase_vouchers?.count > 0],
                  ['By-Product Sales', 'by-product-sales', data.byproducts?.count > 0],
                  ['FRK Purchases', 'frk-purchases', data.frk?.count > 0],
                ];
                return sections.filter(([_,__,show]) => show).map(([label, slug]) => (
                  <option key={slug} value={`section-${slug}`}>{label}</option>
                ));
              })()}
            </select>
            <span className="text-[10px] text-slate-500 italic hidden md:inline">⬆ Auto-scroll</span>
          </div>

          {/* Paddy Entries */}
          <Section title="Paddy Entries / धान" icon={Truck} color="text-blue-400" count={data.paddy_entries.count}>
            <div className="grid grid-cols-5 gap-3 mb-2">
              {[
                ["Total Mill W (QNTL)", ((data.paddy_entries.total_mill_w || 0) / 100).toFixed(2), "text-white"],
                ["Total BAG", data.paddy_entries.total_bags, "text-amber-400"],
                ["Final W. QNTL (Auto)", (data.paddy_entries.total_final_w / 100).toFixed(2), "text-green-400"],
                ["Total TP Weight", data.paddy_entries.total_tp_weight || 0, "text-orange-400"],
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
                    {key:'tpwt',label:'TP Wt',align:'right'},
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
                    <td className="py-1 px-1.5 text-right text-orange-400">{Number(d.tp_weight || 0) > 0 ? d.tp_weight : '-'}</td>
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

          {/* Paddy Chalna / Cutting */}
          {data.paddy_cutting && data.paddy_cutting.count > 0 && (
            <Section title="Paddy Chalna / छलना" icon={Scissors} color="text-amber-400" count={data.paddy_cutting.count}>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[
                  ["Aaj Cut", data.paddy_cutting.total_bags_cut || 0, "text-amber-400 bg-amber-900/20"],
                  ["Total Paddy Bags", data.paddy_cutting.cum_total_received || 0, "text-blue-400 bg-blue-900/20"],
                  ["Total Cut (All)", data.paddy_cutting.cum_total_cut || 0, "text-orange-400 bg-orange-900/20"],
                  ["Remaining", data.paddy_cutting.cum_remaining || 0, `${(data.paddy_cutting.cum_remaining || 0) >= 0 ? 'text-green-400 bg-green-900/20' : 'text-red-400 bg-red-900/20'}`],
                ].map(([l,v,c]) => (
                  <div key={l} className={`text-center p-2 rounded ${c.split(' ').slice(1).join(' ')}`}>
                    <p className="text-[10px] text-slate-400">{l}</p>
                    <p className={`text-lg font-bold ${c.split(' ')[0]}`}>{v.toLocaleString()}</p>
                  </div>
                ))}
              </div>
              {isDetail && data.paddy_cutting.details && data.paddy_cutting.details.length > 0 && (
                <DetailTable
                  headers={[
                    {key:'bags',label:'Bags Cut',align:'right'}, {key:'remark',label:'Remark',align:'left'},
                  ]}
                  rows={data.paddy_cutting.details.map((d,i) => (<>
                    <td className="py-1 px-2 text-right text-amber-400 font-semibold">{(d.bags_cut || 0).toLocaleString()}</td>
                    <td className="py-1 px-2 text-slate-300">{d.remark || '-'}</td>
                  </>))}
                />
              )}
            </Section>
          )}

          {/* ══ v104.44.18 — P0 NEW SECTIONS ══ */}

          {/* Vehicle Weight — Auto Vehicle Weight (Sale + Purchase trips) */}
          {data.vehicle_weight && (data.vehicle_weight.sale_count > 0 || data.vehicle_weight.purchase_count > 0) && (
            <Section title="Vehicle Weight / ऑटो वज़न (Sale + Purchase)" icon={Truck} color="text-sky-400">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                {[
                  ["Sale Trips", data.vehicle_weight.sale_count, "text-emerald-400"],
                  ["Sale Net (Q)", data.vehicle_weight.sale_net_qntl, "text-emerald-300"],
                  ["Sale Bhada", `₹${(data.vehicle_weight.sale_bhada_total || 0).toLocaleString('en-IN')}`, "text-orange-400"],
                  ["Sale Bags", data.vehicle_weight.sale_bags, "text-slate-300"],
                ].map(([l,v,c]) => (
                  <div key={l} className="text-center p-2 bg-slate-900/50 rounded" data-testid={`vw-sale-${l.toLowerCase().replace(/\s/g,'-')}`}>
                    <p className="text-[10px] text-slate-400">{l}</p>
                    <p className={`text-sm font-bold ${c}`}>{v}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                {[
                  ["Purchase Trips", data.vehicle_weight.purchase_count, "text-blue-400"],
                  ["Purchase Net (Q)", data.vehicle_weight.purchase_net_qntl, "text-blue-300"],
                  ["Purchase Bhada", `₹${(data.vehicle_weight.purchase_bhada_total || 0).toLocaleString('en-IN')}`, "text-orange-400"],
                  ["Purchase Bags", data.vehicle_weight.purchase_bags, "text-slate-300"],
                ].map(([l,v,c]) => (
                  <div key={l} className="text-center p-2 bg-slate-900/50 rounded" data-testid={`vw-purchase-${l.toLowerCase().replace(/\s/g,'-')}`}>
                    <p className="text-[10px] text-slate-400">{l}</p>
                    <p className={`text-sm font-bold ${c}`}>{v}</p>
                  </div>
                ))}
              </div>
              {data.vehicle_weight.sale_details?.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] text-emerald-400 font-semibold mb-1">Sale / Dispatch:</p>
                  <DetailTable
                    headers={[{key:'rst',label:'RST',align:'left'},{key:'veh',label:'Vehicle',align:'left'},
                      {key:'party',label:'Party',align:'left'},{key:'dest',label:'Destination',align:'left'},
                      {key:'prod',label:'Product',align:'left'},{key:'bags',label:'Bags',align:'right'},
                      {key:'bagtype',label:'Bag Type',align:'left'},{key:'net',label:'Net Wt',align:'right'},
                      {key:'bhada',label:'Bhada',align:'right'}]}
                    rows={data.vehicle_weight.sale_details.map((d,i) => (<>
                      <td className="py-1 px-2 text-slate-300">{d.rst_no || '-'}</td>
                      <td className="py-1 px-2 text-white">{d.vehicle_no}</td>
                      <td className="py-1 px-2 text-slate-300">{d.party}</td>
                      <td className="py-1 px-2 text-slate-400">{d.destination || '-'}</td>
                      <td className="py-1 px-2 text-slate-300">{d.product}</td>
                      <td className="py-1 px-2 text-right text-slate-300">{d.bags}</td>
                      <td className="py-1 px-2 text-cyan-400 text-[10px]">{d.bag_type || '-'}</td>
                      <td className="py-1 px-2 text-right text-emerald-400">{d.net_wt}</td>
                      <td className="py-1 px-2 text-right text-orange-400 font-semibold">₹{(d.bhada||0).toLocaleString('en-IN')}</td>
                    </>))}
                  />
                </div>
              )}
              {isDetail && data.vehicle_weight.purchase_details?.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] text-blue-400 font-semibold mb-1">Purchase / Receive:</p>
                  <DetailTable
                    headers={[{key:'rst',label:'RST',align:'left'},{key:'veh',label:'Vehicle',align:'left'},
                      {key:'party',label:'Party',align:'left'},{key:'mandi',label:'Mandi',align:'left'},
                      {key:'prod',label:'Product',align:'left'},{key:'bags',label:'Bags',align:'right'},
                      {key:'net',label:'Net Wt',align:'right'},{key:'bhada',label:'Bhada',align:'right'}]}
                    rows={data.vehicle_weight.purchase_details.map((d,i) => (<>
                      <td className="py-1 px-2 text-slate-300">{d.rst_no || '-'}</td>
                      <td className="py-1 px-2 text-white">{d.vehicle_no}</td>
                      <td className="py-1 px-2 text-slate-300">{d.party}</td>
                      <td className="py-1 px-2 text-slate-400">{d.mandi || '-'}</td>
                      <td className="py-1 px-2 text-slate-300">{d.product}</td>
                      <td className="py-1 px-2 text-right text-slate-300">{d.bags}</td>
                      <td className="py-1 px-2 text-right text-blue-400">{d.net_wt}</td>
                      <td className="py-1 px-2 text-right text-orange-400 font-semibold">₹{(d.bhada||0).toLocaleString('en-IN')}</td>
                    </>))}
                  />
                </div>
              )}
            </Section>
          )}

          {/* Per-Trip Bhada Summary (by truck) */}
          {data.per_trip_bhada && data.per_trip_bhada.truck_count > 0 && (
            <Section title="Per-Trip Bhada / प्रति यात्रा भाड़ा" icon={Truck} color="text-orange-400" count={data.per_trip_bhada.trip_count}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                {[
                  ["Trucks", data.per_trip_bhada.truck_count, "text-white"],
                  ["Bhada Total", `₹${(data.per_trip_bhada.bhada_total || 0).toLocaleString('en-IN')}`, "text-orange-400"],
                  ["Paid Today", `₹${(data.per_trip_bhada.paid_today || 0).toLocaleString('en-IN')}`, "text-emerald-400"],
                  ["Pending", `₹${(data.per_trip_bhada.pending_today || 0).toLocaleString('en-IN')}`, "text-red-400"],
                ].map(([l,v,c]) => (
                  <div key={l} className="text-center p-2 bg-slate-900/50 rounded" data-testid={`pertrip-${l.toLowerCase().replace(/\s/g,'-')}`}>
                    <p className="text-[10px] text-slate-400">{l}</p>
                    <p className={`text-sm font-bold ${c}`}>{v}</p>
                  </div>
                ))}
              </div>
              {data.per_trip_bhada.details?.length > 0 && (
                <DetailTable
                  headers={[{key:'veh',label:'Vehicle',align:'left'},{key:'trips',label:'Trips',align:'right'},
                    {key:'bhada',label:'Bhada Total',align:'right'}]}
                  rows={data.per_trip_bhada.details.map((d,i) => (<>
                    <td className="py-1 px-2 text-white font-medium">{d.vehicle_no}</td>
                    <td className="py-1 px-2 text-right text-slate-300">{d.trips}</td>
                    <td className="py-1 px-2 text-right text-orange-400 font-semibold">₹{(d.bhada||0).toLocaleString('en-IN')}</td>
                  </>))}
                />
              )}
            </Section>
          )}

          {/* Truck / Agent / LocalParty Payment Summaries (from cash_transactions) */}
          {(data.truck_payments?.count > 0 || data.agent_payments?.count > 0 || data.local_party_payments?.count > 0) && (
            <Section title="Party Payments Breakdown / पार्टी भुगतान सार" icon={IndianRupee} color="text-purple-400">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {key: 'truck', label: '🛻 Truck Owner', data: data.truck_payments, color: 'blue'},
                  {key: 'agent', label: '👤 Agent', data: data.agent_payments, color: 'amber'},
                  {key: 'local', label: '🏬 Local Party', data: data.local_party_payments, color: 'teal'},
                ].map(({key, label, data: pd, color}) => (
                  <div key={key} className={`p-3 bg-slate-900/50 rounded border border-${color}-900/30`} data-testid={`party-payment-${key}`}>
                    <p className={`text-xs font-semibold text-${color}-400 mb-2`}>{label} ({pd?.count || 0})</p>
                    <div className="grid grid-cols-2 gap-1 text-[11px]">
                      <span className="text-slate-400">Jama:</span>
                      <span className="text-emerald-400 text-right">₹{(pd?.jama || 0).toLocaleString('en-IN')}</span>
                      <span className="text-slate-400">Nikasi:</span>
                      <span className="text-red-400 text-right">₹{(pd?.nikasi || 0).toLocaleString('en-IN')}</span>
                      <span className="text-slate-400 pt-1 border-t border-slate-700 col-span-1">Net:</span>
                      <span className={`pt-1 border-t border-slate-700 text-right font-bold ${(pd?.net || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>₹{(pd?.net || 0).toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                ))}
              </div>
              {isDetail && (
                <div className="mt-3 space-y-3">
                  {[
                    {key: 'truck', label: 'Truck Owner Details', data: data.truck_payments, color: 'text-blue-400'},
                    {key: 'agent', label: 'Agent Details', data: data.agent_payments, color: 'text-amber-400'},
                    {key: 'local', label: 'Local Party Details', data: data.local_party_payments, color: 'text-teal-400'},
                  ].filter(x => x.data?.details?.length > 0).map(({key, label, data: pd, color}) => (
                    <div key={key}>
                      <p className={`text-[11px] font-semibold mb-1 ${color}`}>{label}:</p>
                      <DetailTable
                        headers={[{key:'party',label:'Party',align:'left'},{key:'type',label:'Type',align:'left'},
                          {key:'acc',label:'Account',align:'left'},{key:'amt',label:'Amount',align:'right'},
                          {key:'desc',label:'Description',align:'left'}]}
                        rows={pd.details.map((d,i) => (<>
                          <td className="py-1 px-2 text-white">{d.party || '-'}</td>
                          <td className="py-1 px-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${d.txn_type === 'jama' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                              {d.txn_type === 'jama' ? 'JAMA' : 'NIKASI'}
                            </span>
                          </td>
                          <td className="py-1 px-2 text-slate-400 text-[10px]">{(d.account || '').toUpperCase()}</td>
                          <td className={`py-1 px-2 text-right font-semibold ${d.txn_type === 'jama' ? 'text-green-400' : 'text-red-400'}`}>₹{(d.amount||0).toLocaleString('en-IN')}</td>
                          <td className="py-1 px-2 text-slate-400 text-[10px]">{d.description || '-'}</td>
                        </>))}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* ══ v104.44.19 — P1 NEW SECTIONS ══ */}

          {/* Leased Truck Payments */}
          {data.leased_truck && data.leased_truck.count > 0 && (
            <Section title="Leased Truck / लीज़ ट्रक" icon={Truck} color="text-indigo-400" count={data.leased_truck.count}>
              <div className="grid grid-cols-2 md:grid-cols-2 gap-3 mb-2">
                <div className="text-center p-2 bg-slate-900/50 rounded">
                  <p className="text-[10px] text-slate-400">Total Payments</p>
                  <p className="text-lg font-bold text-white">{data.leased_truck.count}</p>
                </div>
                <div className="text-center p-2 bg-slate-900/50 rounded">
                  <p className="text-[10px] text-slate-400">Total Paid</p>
                  <p className="text-lg font-bold text-emerald-400">₹{(data.leased_truck.total_paid || 0).toLocaleString('en-IN')}</p>
                </div>
              </div>
              {data.leased_truck.details?.length > 0 && (
                <DetailTable
                  headers={[{key:'truck',label:'Truck No',align:'left'},{key:'owner',label:'Owner',align:'left'},
                    {key:'type',label:'Payment Type',align:'left'},{key:'mode',label:'Mode',align:'left'},
                    {key:'amt',label:'Amount',align:'right'},
                    ...(isDetail ? [{key:'remark',label:'Remark',align:'left'}] : [])]}
                  rows={data.leased_truck.details.map((d,i) => (<>
                    <td className="py-1 px-2 text-white font-medium">{d.truck_no}</td>
                    <td className="py-1 px-2 text-slate-300">{d.owner || '-'}</td>
                    <td className="py-1 px-2 text-slate-300 capitalize">{d.payment_type || '-'}</td>
                    <td className="py-1 px-2 text-slate-400">{d.mode || '-'}</td>
                    <td className="py-1 px-2 text-right text-emerald-400 font-semibold">₹{(d.amount||0).toLocaleString('en-IN')}</td>
                    {isDetail && <td className="py-1 px-2 text-slate-400 text-[10px]">{d.remark || '-'}</td>}
                  </>))}
                />
              )}
            </Section>
          )}

          {/* Oil Premium / Lab Test */}
          {data.oil_premium && data.oil_premium.count > 0 && (
            <Section title="Oil Premium / Lab Test / लैब टेस्ट" icon={Package} color="text-pink-400" count={data.oil_premium.count}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                {[
                  ["Total Entries", data.oil_premium.count, "text-white"],
                  ["Positive (+)", data.oil_premium.positive_count, "text-emerald-400"],
                  ["Negative (-)", data.oil_premium.negative_count, "text-red-400"],
                  ["Net Premium", `₹${(data.oil_premium.total_premium || 0).toLocaleString('en-IN')}`,
                    data.oil_premium.total_premium >= 0 ? "text-emerald-400" : "text-red-400"],
                ].map(([l,v,c]) => (
                  <div key={l} className="text-center p-2 bg-slate-900/50 rounded" data-testid={`oil-premium-${l.toLowerCase().replace(/\s|\(|\)|\+|-/g,'')}`}>
                    <p className="text-[10px] text-slate-400">{l}</p>
                    <p className={`text-sm font-bold ${c}`}>{v}</p>
                  </div>
                ))}
              </div>
              {data.oil_premium.details?.length > 0 && (
                <DetailTable
                  headers={[{key:'voucher',label:'V.No',align:'left'},{key:'rst',label:'RST',align:'left'},
                    {key:'party',label:'Party',align:'left'},{key:'qty',label:'Qty(Q)',align:'right'},
                    {key:'rate',label:'Sauda Amt',align:'right'},{key:'diff',label:'Diff %',align:'right'},
                    {key:'prem',label:'Premium',align:'right'},
                    ...(isDetail ? [{key:'remark',label:'Remark',align:'left'}] : [])]}
                  rows={data.oil_premium.details.map((d,i) => (<>
                    <td className="py-1 px-2 text-cyan-400">{d.voucher_no || '-'}</td>
                    <td className="py-1 px-2 text-slate-300">{d.rst_no || '-'}</td>
                    <td className="py-1 px-2 text-white">{d.party || '-'}</td>
                    <td className="py-1 px-2 text-right text-amber-400">{d.qty_qntl || 0}</td>
                    <td className="py-1 px-2 text-right text-slate-300">₹{d.rate || 0}</td>
                    <td className={`py-1 px-2 text-right font-medium ${(d.diff_pct||0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {d.diff_pct > 0 ? '+' : ''}{(d.diff_pct||0).toFixed(2)}%
                    </td>
                    <td className={`py-1 px-2 text-right font-bold ${(d.premium_amount||0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(d.premium_amount||0) >= 0 ? '+' : ''}₹{Math.abs(d.premium_amount||0).toLocaleString('en-IN')}
                    </td>
                    {isDetail && <td className="py-1 px-2 text-slate-400 text-[10px]">{d.remark || '-'}</td>}
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
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-[9px]">
                    <thead>
                      <tr className="border-b border-slate-600">
                        <th className="text-slate-400 text-left py-1 px-1">Product</th>
                        <th className="text-slate-400 text-left py-1 px-1">Voucher</th>
                        <th className="text-slate-400 text-left py-1 px-1">Party</th>
                        <th className="text-slate-400 text-left py-1 px-1">Destination</th>
                        <th className="text-slate-400 text-right py-1 px-1">N/W(Kg)</th>
                        <th className="text-slate-400 text-right py-1 px-1">Bags</th>
                        <th className="text-slate-400 text-right py-1 px-1">Rate/Q</th>
                        <th className="text-slate-400 text-right py-1 px-1">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byproducts.details.map((d,i) => (
                        <tr key={`bp-${i}`} className="border-b border-slate-700/50">
                          <td className="text-amber-300 py-0.5 px-1">{d.product}</td>
                          <td className="text-cyan-400 py-0.5 px-1">{d.voucher_no}</td>
                          <td className="text-white py-0.5 px-1">{d.party_name}</td>
                          <td className="text-slate-300 py-0.5 px-1">{d.destination}</td>
                          <td className="text-blue-300 py-0.5 px-1 text-right">{d.net_weight_kg?.toLocaleString('en-IN')}</td>
                          <td className="text-slate-300 py-0.5 px-1 text-right">{d.bags || ''}</td>
                          <td className="text-slate-300 py-0.5 px-1 text-right">{d.rate_per_qtl}</td>
                          <td className="text-emerald-400 py-0.5 px-1 text-right font-medium">₹{d.total?.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                  <span className="text-slate-400">KMS Year</span>
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
                    <div key={`tg-r-${r.chat_id || i}`} className="flex items-center gap-2 bg-slate-700/50 px-3 py-1.5 rounded text-sm">
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
      <SendToGroupDialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen} text={groupText} pdfUrl={groupPdfUrl} />
    </div>
  );
};

export default DailyReport;
