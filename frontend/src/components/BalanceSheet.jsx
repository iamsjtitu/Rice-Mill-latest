import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { FileDown, FileSpreadsheet, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';

const API = ((typeof window !== 'undefined' && window.ELECTRON_API_URL) || process.env.REACT_APP_BACKEND_URL) + '/api';

function BalanceGroup({ group, side }) {
  const [open, setOpen] = useState(false);
  const hasChildren = group.children && group.children.length > 0;
  const sideColor = side === 'liability' ? 'text-red-400' : 'text-emerald-400';
  const sideBg = side === 'liability' ? 'bg-red-500/10' : 'bg-emerald-500/10';

  return (
    <div className="mb-1">
      <div
        className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer hover:bg-slate-700/50 transition ${sideBg}`}
        onClick={() => hasChildren && setOpen(!open)}
        data-testid={`bs-group-${group.group.replace(/\s+/g, '-').toLowerCase()}`}
      >
        <div className="flex items-center gap-2">
          {hasChildren ? (open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />) : <span className="w-3.5" />}
          <span className="text-sm font-semibold text-slate-200">{group.group}</span>
        </div>
        <span className={`text-sm font-bold ${sideColor}`}>{formatAmt(group.amount)}</span>
      </div>
      {open && hasChildren && (
        <div className="ml-6 border-l border-slate-700/50 pl-3 py-1">
          {group.children.map((c, i) => (
            <div key={i} className="flex items-center justify-between px-2 py-1.5 text-xs hover:bg-slate-800/50 rounded">
              <span className="text-slate-300">{c.name} {c.unit ? `(${c.unit})` : ''}</span>
              <span className={`font-medium ${sideColor}`}>{formatAmt(c.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatAmt(n) {
  if (n === undefined || n === null) return '0.00';
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function BalanceSheet({ filters }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/fy-summary/balance-sheet?${p}`);
      setData(res.data);
    } catch (err) { console.error('Balance Sheet error:', err); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [filters.kms_year, filters.season]);

  const downloadPdf = () => {
    const p = new URLSearchParams();
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    if (filters.season) p.append('season', filters.season);
    window.open(`${API}/fy-summary/balance-sheet/pdf?${p}`, '_blank');
  };

  const downloadExcel = () => {
    const p = new URLSearchParams();
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    if (filters.season) p.append('season', filters.season);
    window.open(`${API}/fy-summary/balance-sheet/excel?${p}`, '_blank');
  };

  if (loading) return <div className="text-center text-slate-400 py-20">Loading Balance Sheet...</div>;
  if (!data) return <div className="text-center text-red-400 py-20">Data load nahi hua</div>;

  return (
    <div className="space-y-4" data-testid="balance-sheet">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-amber-400">Balance Sheet</h2>
          <p className="text-xs text-slate-400">As on {data.as_on_date} | KMS {data.kms_year || 'All'} {data.season && `| ${data.season}`}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700" onClick={downloadPdf} data-testid="bs-pdf-btn">
            <FileDown className="w-3 h-3 mr-1" /> PDF
          </Button>
          <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700" onClick={downloadExcel} data-testid="bs-excel-btn">
            <FileSpreadsheet className="w-3 h-3 mr-1" /> Excel
          </Button>
          <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700" onClick={fetchData} data-testid="bs-refresh-btn">
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* LIABILITIES */}
        <Card className="bg-slate-800/80 border-slate-700/50 backdrop-blur">
          <div className="px-4 pt-4 pb-2 border-b border-slate-700/50">
            <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">Liabilities</h3>
          </div>
          <CardContent className="px-3 py-3 space-y-1">
            {data.liabilities.map((g, i) => (
              <BalanceGroup key={i} group={g} side="liability" />
            ))}
            <div className="flex items-center justify-between px-3 py-2.5 bg-red-500/20 rounded-md mt-2 border border-red-500/30">
              <span className="text-sm font-bold text-white">TOTAL</span>
              <span className="text-sm font-bold text-red-400" data-testid="bs-total-liabilities">{formatAmt(data.total_liabilities)}</span>
            </div>
          </CardContent>
        </Card>

        {/* ASSETS */}
        <Card className="bg-slate-800/80 border-slate-700/50 backdrop-blur">
          <div className="px-4 pt-4 pb-2 border-b border-slate-700/50">
            <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">Assets</h3>
          </div>
          <CardContent className="px-3 py-3 space-y-1">
            {data.assets.map((g, i) => (
              <BalanceGroup key={i} group={g} side="asset" />
            ))}
            <div className="flex items-center justify-between px-3 py-2.5 bg-emerald-500/20 rounded-md mt-2 border border-emerald-500/30">
              <span className="text-sm font-bold text-white">TOTAL</span>
              <span className="text-sm font-bold text-emerald-400" data-testid="bs-total-assets">{formatAmt(data.total_assets)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Account Tables */}
      {data.truck_accounts?.length > 0 && (
        <DetailTable title="Truck Accounts" data={data.truck_accounts} />
      )}
      {data.agent_accounts?.length > 0 && (
        <DetailTable title="Agent/Mandi Accounts" data={data.agent_accounts} />
      )}
      {data.dc_accounts?.length > 0 && (
        <DetailTable title="DC Accounts" data={data.dc_accounts} />
      )}
    </div>
  );
}

function DetailTable({ title, data }) {
  const [open, setOpen] = useState(false);
  const total = data.reduce((s, d) => s + d.balance, 0);
  return (
    <Card className="bg-slate-800/80 border-slate-700/50">
      <div className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-700/30" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          <span className="text-sm font-medium text-slate-200">{title}</span>
          <span className="text-xs text-slate-500">({data.length})</span>
        </div>
        <span className={`text-sm font-bold ${total >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>Balance: {formatAmt(total)}</span>
      </div>
      {open && (
        <CardContent className="px-4 pb-3 pt-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-slate-400 py-1.5 font-medium">Name</th>
                <th className="text-right text-slate-400 py-1.5 font-medium">Total</th>
                <th className="text-right text-slate-400 py-1.5 font-medium">Paid</th>
                <th className="text-right text-slate-400 py-1.5 font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i} className="border-b border-slate-700/30">
                  <td className="py-1.5 text-slate-300">{d.name}</td>
                  <td className="py-1.5 text-right text-orange-400">{formatAmt(d.total)}</td>
                  <td className="py-1.5 text-right text-green-400">{formatAmt(d.paid)}</td>
                  <td className={`py-1.5 text-right font-bold ${d.balance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{formatAmt(d.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      )}
    </Card>
  );
}
