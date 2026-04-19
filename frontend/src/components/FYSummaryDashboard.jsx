import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { TrendingUp, TrendingDown, Banknote, Package, Fuel, Users, Wheat, Wrench, ArrowRightLeft, RefreshCw, FileDown, BookOpen, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { useConfirm } from './ConfirmProvider';
import { downloadFile } from '../utils/download';
import logger from "../utils/logger";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const API = (_isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '')) + '/api';

function SummaryCard({ title, icon: Icon, iconColor, children }) {
  return (
    <Card className="bg-slate-800/80 border-slate-700/50 backdrop-blur">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          <span className="text-slate-200">{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">{children}</CardContent>
    </Card>
  );
}

function BalanceRow({ label, opening, inflow, outflow, closing, unit = "Rs." }) {
  return (
    <TableRow className="border-slate-700/50">
      <TableCell className="text-slate-300 text-xs font-medium py-1.5">{label}</TableCell>
      <TableCell className="text-right text-yellow-400 text-xs py-1.5">{unit === "Rs." ? `₹${(opening || 0).toLocaleString('en-IN')}` : `${(opening || 0).toLocaleString('en-IN')} ${unit}`}</TableCell>
      <TableCell className="text-right text-emerald-400 text-xs py-1.5">{unit === "Rs." ? `₹${(inflow || 0).toLocaleString('en-IN')}` : `${(inflow || 0).toLocaleString('en-IN')} ${unit}`}</TableCell>
      <TableCell className="text-right text-red-400 text-xs py-1.5">{unit === "Rs." ? `₹${(outflow || 0).toLocaleString('en-IN')}` : `${(outflow || 0).toLocaleString('en-IN')} ${unit}`}</TableCell>
      <TableCell className={`text-right text-xs font-bold py-1.5 ${closing >= 0 ? 'text-amber-400' : 'text-red-400'}`}>{unit === "Rs." ? `₹${(closing || 0).toLocaleString('en-IN')}` : `${(closing || 0).toLocaleString('en-IN')} ${unit}`}</TableCell>
    </TableRow>
  );
}

function MiniTable({ headers, children }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-slate-700/50">
          {headers.map((h, i) => (
            <TableHead key={i} className={`text-slate-400 text-[10px] uppercase tracking-wider py-1 ${i > 0 ? 'text-right' : ''}`}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  );
}

export default function FYSummaryDashboard({ filters }) {
  const showConfirm = useConfirm();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [carryingForward, setCarryingForward] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      
      const res = await axios.get(`${API}/fy-summary?${p}`);
      setData(res.data);
    } catch (err) {
      logger.error('FY Summary fetch error:', err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [filters.kms_year]); // eslint-disable-line react-hooks/exhaustive-deps

  const downloadPdf = () => {
    const p = new URLSearchParams();
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    
    downloadFile(`${API}/fy-summary/pdf?${p}`, `fy_summary_${filters.kms_year || 'all'}.pdf`);
  };

  const handleCarryForward = async () => {
    if (!filters.kms_year) {
      toast.error("Pehle KMS Year select karein");
      return;
    }
    const parts = filters.kms_year.split('-');
    const nextFY = `${parseInt(parts[0])+1}-${parseInt(parts[1])+1}`;
    if (!await showConfirm("Carry Forward", `${filters.kms_year} ka closing balance ${nextFY} mein opening balance ke roop mein carry forward karein?`)) return;

    setCarryingForward(true);
    try {
      const res = await axios.post(`${API}/fy-summary/carry-forward`, { kms_year: filters.kms_year });
      toast.success(`Balances ${res.data.next_fy} mein carry forward ho gaye!`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Carry forward failed");
    }
    setCarryingForward(false);
  };

  if (loading) return <div className="text-center text-slate-400 py-20">Loading FY Summary...</div>;
  if (!data) return <div className="text-center text-red-400 py-20">Data load nahi hua</div>;

  const cb = data.cash_bank || {};
  const ps = data.paddy_stock || {};
  const ml = data.milling || {};
  const frk = data.frk_stock || {};
  const bp = data.byproducts || {};
  const lp = data.local_party || {};
  const pt = data.private_trading || {};
  const ledger = data.ledger_parties || {};

  return (
    <div className="space-y-4" data-testid="fy-summary-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-amber-400">FY Summary Dashboard</h2>
          <p className="text-xs text-slate-400">{data.kms_year} {data.season && `| ${data.season}`} - Opening vs Closing Balances</p>
        </div>
        <div className="flex gap-2">
          {filters.kms_year && (
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleCarryForward} disabled={carryingForward} data-testid="carry-forward-btn">
              {carryingForward ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <ArrowRight className="w-3 h-3 mr-1" />}
              Carry Forward to Next FY
            </Button>
          )}
          <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700" onClick={downloadPdf} data-testid="fy-summary-pdf">
            <FileDown className="w-3 h-3 mr-1" /> PDF Export
          </Button>
          <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700" onClick={fetchData} data-testid="fy-summary-refresh">
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Cash & Bank */}
      <SummaryCard title="Cash & Bank" icon={Banknote} iconColor="text-green-400">
        <MiniTable headers={['Account', 'Opening', 'In', 'Out', 'Closing']}>
          <BalanceRow label="Cash" opening={cb.opening_cash} inflow={cb.cash_in} outflow={cb.cash_out} closing={cb.closing_cash} />
          <BalanceRow label="Bank" opening={cb.opening_bank} inflow={cb.bank_in} outflow={cb.bank_out} closing={cb.closing_bank} />
          <TableRow className="border-slate-600 bg-slate-700/30">
            <TableCell className="text-white text-xs font-bold py-1.5">Total</TableCell>
            <TableCell className="text-right text-yellow-400 text-xs font-bold py-1.5">₹{((cb.opening_cash || 0) + (cb.opening_bank || 0)).toLocaleString('en-IN')}</TableCell>
            <TableCell className="text-right text-emerald-400 text-xs font-bold py-1.5">₹{((cb.cash_in || 0) + (cb.bank_in || 0)).toLocaleString('en-IN')}</TableCell>
            <TableCell className="text-right text-red-400 text-xs font-bold py-1.5">₹{((cb.cash_out || 0) + (cb.bank_out || 0)).toLocaleString('en-IN')}</TableCell>
            <TableCell className="text-right text-amber-400 text-xs font-bold py-1.5">₹{((cb.closing_cash || 0) + (cb.closing_bank || 0)).toLocaleString('en-IN')}</TableCell>
          </TableRow>
        </MiniTable>
      </SummaryCard>

      {/* Paddy & FRK Stock */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SummaryCard title="Paddy Stock (Qtl)" icon={Wheat} iconColor="text-amber-400">
          <MiniTable headers={['Item', 'Opening', 'In', 'Used', 'Closing']}>
            <BalanceRow label="Paddy" opening={ps.opening_stock} inflow={ps.paddy_in} outflow={ps.paddy_used} closing={ps.closing_stock} unit="Qtl" />
          </MiniTable>
        </SummaryCard>
        <SummaryCard title="FRK Stock (Qtl)" icon={Package} iconColor="text-blue-400">
          <MiniTable headers={['Item', 'Opening', 'Purchased', 'Used', 'Closing']}>
            <BalanceRow label="FRK" opening={frk.opening_stock} inflow={frk.purchased} outflow={frk.used} closing={frk.closing_stock} unit="Qtl" />
          </MiniTable>
          <p className="text-[10px] text-slate-500 mt-1">Total FRK Cost: ₹{(frk.total_cost || 0).toLocaleString('en-IN')}</p>
        </SummaryCard>
      </div>

      {/* Milling Summary */}
      <SummaryCard title="Milling Summary" icon={ArrowRightLeft} iconColor="text-purple-400">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-center">
          {[
            { label: "Entries", value: ml.total_entries, color: "text-white" },
            { label: "Paddy Milled", value: `${ml.total_paddy_milled} Qtl`, color: "text-amber-400" },
            { label: "Rice Produced", value: `${ml.total_rice_produced} Qtl`, color: "text-emerald-400" },
            { label: "FRK Used", value: `${ml.total_frk_used} Qtl`, color: "text-blue-400" },
            { label: "CMR Delivered", value: `${ml.total_cmr_delivered} Qtl`, color: "text-cyan-400" },
            { label: "Avg Outturn", value: `${ml.avg_outturn}%`, color: "text-purple-400" },
          ].map(item => (
            <div key={item.label} className="bg-slate-700/40 rounded-lg p-2">
              <p className="text-[10px] text-slate-400">{item.label}</p>
              <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>
      </SummaryCard>

      {/* Byproduct Stock */}
      <SummaryCard title="Byproduct Stock (Qtl)" icon={Package} iconColor="text-orange-400">
        <MiniTable headers={['Product', 'Opening', 'Produced', 'Sold', 'Closing', 'Revenue']}>
          {Object.entries(bp).map(([name, v]) => (
            <TableRow key={name} className="border-slate-700/50">
              <TableCell className="text-slate-300 text-xs font-medium py-1.5 capitalize">{name}</TableCell>
              <TableCell className="text-right text-yellow-400 text-xs py-1.5">{(v.opening_stock || 0).toLocaleString('en-IN')}</TableCell>
              <TableCell className="text-right text-emerald-400 text-xs py-1.5">{(v.produced || 0).toLocaleString('en-IN')}</TableCell>
              <TableCell className="text-right text-red-400 text-xs py-1.5">{(v.sold || 0).toLocaleString('en-IN')}</TableCell>
              <TableCell className={`text-right text-xs font-bold py-1.5 ${v.closing_stock >= 0 ? 'text-amber-400' : 'text-red-400'}`}>{(v.closing_stock || 0).toLocaleString('en-IN')}</TableCell>
              <TableCell className="text-right text-white text-xs py-1.5">₹{(v.revenue || 0).toLocaleString('en-IN')}</TableCell>
            </TableRow>
          ))}
        </MiniTable>
      </SummaryCard>

      {/* Mill Parts Stock */}
      {(data.mill_parts || []).length > 0 && (
        <SummaryCard title="Mill Parts Stock" icon={Wrench} iconColor="text-cyan-400">
          <MiniTable headers={['Part', 'Unit', 'Opening', 'In', 'Used', 'Closing']}>
            {(data.mill_parts || []).map(p => (
              <TableRow key={p.name} className="border-slate-700/50">
                <TableCell className="text-slate-300 text-xs py-1.5">{p.name}</TableCell>
                <TableCell className="text-right text-slate-400 text-[10px] py-1.5">{p.unit}</TableCell>
                <TableCell className="text-right text-yellow-400 text-xs py-1.5">{p.opening_stock}</TableCell>
                <TableCell className="text-right text-emerald-400 text-xs py-1.5">{p.stock_in}</TableCell>
                <TableCell className="text-right text-red-400 text-xs py-1.5">{p.stock_used}</TableCell>
                <TableCell className={`text-right text-xs font-bold py-1.5 ${p.closing_stock >= 0 ? 'text-amber-400' : 'text-red-400'}`}>{p.closing_stock} {p.unit}</TableCell>
              </TableRow>
            ))}
          </MiniTable>
        </SummaryCard>
      )}

      {/* Diesel Accounts */}
      {(data.diesel || []).length > 0 && (
        <SummaryCard title="Diesel Accounts" icon={Fuel} iconColor="text-red-400">
          <MiniTable headers={['Pump', 'Opening', 'Diesel', 'Paid', 'Balance']}>
            {(data.diesel || []).map(d => (
              <BalanceRow key={d.pump_name} label={d.pump_name} opening={d.opening_balance} inflow={d.total_diesel} outflow={d.total_paid} closing={d.closing_balance} />
            ))}
          </MiniTable>
        </SummaryCard>
      )}

      {/* Local Party Accounts */}
      <SummaryCard title="Local Party Accounts" icon={Users} iconColor="text-indigo-400">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
          {[
            { label: "Parties", value: lp.party_count, color: "text-white" },
            { label: "Opening Bal", value: `₹${(lp.opening_balance || 0).toLocaleString('en-IN')}`, color: "text-yellow-400" },
            { label: "Total Debit", value: `₹${(lp.total_debit || 0).toLocaleString('en-IN')}`, color: "text-orange-400" },
            { label: "Total Paid", value: `₹${(lp.total_paid || 0).toLocaleString('en-IN')}`, color: "text-green-400" },
            { label: "Closing Bal", value: `₹${(lp.closing_balance || 0).toLocaleString('en-IN')}`, color: "text-red-400" },
          ].map(item => (
            <div key={item.label} className="bg-slate-700/40 rounded-lg p-2">
              <p className="text-[10px] text-slate-400">{item.label}</p>
              <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>
      </SummaryCard>

      {/* Staff Advances */}
      {(data.staff_advances || []).length > 0 && (
        <SummaryCard title="Staff Advances" icon={Users} iconColor="text-pink-400">
          <MiniTable headers={['Staff', 'Opening', 'Advance', 'Deducted', 'Balance']}>
            {(data.staff_advances || []).map(s => (
              <BalanceRow key={s.name} label={s.name} opening={s.opening_balance} inflow={s.total_advance} outflow={s.total_deducted} closing={s.closing_balance} />
            ))}
          </MiniTable>
        </SummaryCard>
      )}

      {/* Ledger Parties */}
      {ledger.parties?.length > 0 && (
        <SummaryCard title="Ledger Parties (Cashbook)" icon={BookOpen} iconColor="text-violet-400">
          <div className="flex gap-3 text-xs mb-3 flex-wrap">
            <span className="text-slate-400">Parties: <b className="text-white">{ledger.total_parties}</b></span>
            <span className="text-slate-400">Opening: <b className="text-yellow-400">₹{(ledger.total_opening || 0).toLocaleString('en-IN')}</b></span>
            <span className="text-slate-400">Jama: <b className="text-emerald-400">₹{(ledger.total_jama || 0).toLocaleString('en-IN')}</b></span>
            <span className="text-slate-400">Nikasi: <b className="text-red-400">₹{(ledger.total_nikasi || 0).toLocaleString('en-IN')}</b></span>
            <span className="text-slate-400">Closing: <b className="text-amber-400">₹{(ledger.total_closing || 0).toLocaleString('en-IN')}</b></span>
          </div>
          <div className="max-h-[300px] overflow-auto">
            <MiniTable headers={['Party', 'Type', 'Opening', 'Jama', 'Nikasi', 'Balance']}>
              {ledger.parties.map(l => (
                <TableRow key={l.party_name} className="border-slate-700/50">
                  <TableCell className="text-slate-300 text-xs py-1.5">{l.party_name}</TableCell>
                  <TableCell className="text-right text-slate-400 text-[10px] py-1.5">{l.party_type}</TableCell>
                  <TableCell className="text-right text-yellow-400 text-xs py-1.5">₹{(l.opening_balance || 0).toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-right text-emerald-400 text-xs py-1.5">₹{(l.total_jama || 0).toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-right text-red-400 text-xs py-1.5">₹{(l.total_nikasi || 0).toLocaleString('en-IN')}</TableCell>
                  <TableCell className={`text-right text-xs font-bold py-1.5 ${l.closing_balance >= 0 ? 'text-amber-400' : 'text-red-400'}`}>₹{(l.closing_balance || 0).toLocaleString('en-IN')}</TableCell>
                </TableRow>
              ))}
            </MiniTable>
          </div>
        </SummaryCard>
      )}

      {/* Private Trading */}
      <SummaryCard title="Private Trading" icon={TrendingUp} iconColor="text-teal-400">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-2 font-medium">Paddy Purchase</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Qty", value: `${pt.paddy_qty || 0} Qtl`, color: "text-amber-400" },
                { label: "Amount", value: `₹${(pt.paddy_purchase_amount || 0).toLocaleString('en-IN')}`, color: "text-orange-400" },
                { label: "Paid", value: `₹${(pt.paddy_paid || 0).toLocaleString('en-IN')}`, color: "text-green-400" },
                { label: "Balance", value: `₹${(pt.paddy_balance || 0).toLocaleString('en-IN')}`, color: "text-red-400" },
              ].map(item => (
                <div key={item.label} className="bg-slate-700/40 rounded p-2 text-center">
                  <p className="text-[10px] text-slate-400">{item.label}</p>
                  <p className={`text-xs font-bold ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-2 font-medium">Rice Sales</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Qty", value: `${pt.rice_qty || 0} Qtl`, color: "text-amber-400" },
                { label: "Amount", value: `₹${(pt.rice_sale_amount || 0).toLocaleString('en-IN')}`, color: "text-cyan-400" },
                { label: "Received", value: `₹${(pt.rice_received || 0).toLocaleString('en-IN')}`, color: "text-green-400" },
                { label: "Balance", value: `₹${(pt.rice_balance || 0).toLocaleString('en-IN')}`, color: "text-red-400" },
              ].map(item => (
                <div key={item.label} className="bg-slate-700/40 rounded p-2 text-center">
                  <p className="text-[10px] text-slate-400">{item.label}</p>
                  <p className={`text-xs font-bold ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SummaryCard>
    </div>
  );
}
