import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { FileDown, FileSpreadsheet, ChevronDown, ChevronRight, RefreshCw, Printer } from 'lucide-react';
import { downloadFile } from '../utils/download';
import logger from "../utils/logger";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const API = (_isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '')) + '/api';

function formatAmt(n) {
  if (n === undefined || n === null) return '0.00';
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function BalanceGroup({ group, side, expanded, onToggle, focusedChild }) {
  const hasChildren = group.children && group.children.length > 0;
  const sideColor = side === 'liability' ? 'text-red-400' : 'text-emerald-400';
  const sideBg = side === 'liability' ? 'bg-red-500/10' : 'bg-emerald-500/10';

  return (
    <div className="mb-1">
      <div
        className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer hover:bg-slate-700/50 transition ${sideBg} ${focusedChild === -1 ? 'ring-2 ring-amber-400/80 bg-amber-500/10' : ''}`}
        onClick={() => hasChildren && onToggle()}
        data-testid={`bs-group-${group.group.replace(/\s+/g, '-').toLowerCase()}`}
      >
        <div className="flex items-center gap-2">
          {hasChildren ? (expanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />) : <span className="w-3.5" />}
          <span className="text-sm font-semibold text-slate-200">{group.group}</span>
          {hasChildren && <span className="text-[10px] text-slate-500">({group.children.length})</span>}
        </div>
        <span className={`text-sm font-bold ${sideColor}`}>{formatAmt(group.amount)}</span>
      </div>
      {expanded && hasChildren && (
        <div className="ml-6 border-l border-slate-700/50 pl-3 py-1">
          {group.children.map((c, i) => (
            <div
              key={i}
              className={`flex items-center justify-between px-2 py-1.5 text-xs hover:bg-slate-800/50 rounded ${focusedChild === i ? 'ring-2 ring-amber-400/80 bg-amber-500/10' : ''}`}
              data-testid={`bs-child-${c.name.replace(/\s+/g, '-').toLowerCase()}`}
            >
              <span className="text-slate-300">
                {c.name} {c.unit ? `(${c.unit})` : ''}
              </span>
              <span className={`font-medium ${sideColor}`}>{formatAmt(c.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BalanceSheet({ filters }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const containerRef = useRef(null);

  // Keyboard nav state
  const [focusCol, setFocusCol] = useState('liability');
  const [focusIdx, setFocusIdx] = useState(0);
  const [kbActive, setKbActive] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/fy-summary/balance-sheet?${p}`);
      setData(res.data);
    } catch (err) { logger.error('Balance Sheet error:', err); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [filters.kms_year, filters.season]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGroup = useCallback((groupName) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName); else next.add(groupName);
      return next;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build flat navigable list for a side
  const buildFlatList = useCallback((groups) => {
    if (!groups) return [];
    const list = [];
    for (const g of groups) {
      list.push({ type: 'group', group: g, name: g.group });
      if (expandedGroups.has(g.group) && g.children?.length > 0) {
        for (let ci = 0; ci < g.children.length; ci++) {
          list.push({ type: 'child', group: g, childIdx: ci, child: g.children[ci], name: g.children[ci].name });
        }
      }
    }
    return list;
  }, [expandedGroups]);

  const liabList = useMemo(() => data ? buildFlatList(data.liabilities) : [], [data, buildFlatList]);
  const assetList = useMemo(() => data ? buildFlatList(data.assets) : [], [data, buildFlatList]);

  const currentList = focusCol === 'liability' ? liabList : assetList;

  useEffect(() => {
    if (focusIdx >= currentList.length && currentList.length > 0) {
      setFocusIdx(currentList.length - 1);
    }
  }, [currentList.length, focusIdx]);

  // Keyboard handler
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const key = e.key;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(key)) return;

      e.preventDefault();
      setKbActive(true);

      if (key === 'ArrowDown') {
        setFocusIdx(prev => Math.min(prev + 1, currentList.length - 1));
      } else if (key === 'ArrowUp') {
        setFocusIdx(prev => Math.max(prev - 1, 0));
      } else if (key === 'ArrowRight') {
        const item = currentList[focusIdx];
        if (item?.type === 'group' && item.group.children?.length > 0 && !expandedGroups.has(item.name)) {
          toggleGroup(item.name);
        } else if (focusCol === 'liability') {
          setFocusCol('asset');
          setFocusIdx(0);
        }
      } else if (key === 'ArrowLeft') {
        const item = currentList[focusIdx];
        if (item?.type === 'group' && expandedGroups.has(item.name)) {
          toggleGroup(item.name);
        } else if (item?.type === 'child') {
          toggleGroup(item.group.group);
        } else if (focusCol === 'asset') {
          setFocusCol('liability');
          setFocusIdx(0);
        }
      } else if (key === 'Enter' || key === ' ') {
        const item = currentList[focusIdx];
        if (item?.type === 'group' && item.group.children?.length > 0) {
          toggleGroup(item.name);
        }
      }
    };

    el.addEventListener('keydown', handleKey);
    return () => el.removeEventListener('keydown', handleKey);
  }, [currentList, focusIdx, focusCol, expandedGroups, toggleGroup]);

  // Scroll focused item into view
  useEffect(() => {
    if (!kbActive) return;
    const focusedEl = containerRef.current?.querySelector('[data-focused="true"]');
    if (focusedEl) focusedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusIdx, focusCol, kbActive]);

  const getFocusInfo = useCallback((side) => {
    if (!kbActive || focusCol !== side) return {};
    const item = (side === 'liability' ? liabList : assetList)[focusIdx];
    if (!item) return {};
    if (item.type === 'group') return { focusedGroup: item.name, focusedChild: -1 };
    if (item.type === 'child') return { focusedGroup: item.group.group, focusedChild: item.childIdx };
    return {};
  }, [kbActive, focusCol, focusIdx, liabList, assetList]);

  const downloadPdf = async () => {
    const p = new URLSearchParams();
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    if (filters.season) p.append('season', filters.season);
    const { buildFilename } = await import('../utils/filename-format');
    downloadFile(`${API}/fy-summary/balance-sheet/pdf?${p}`, buildFilename({ base: 'balance-sheet', kmsYear: filters.kms_year, ext: 'pdf' }));
  };

  const downloadExcel = async () => {
    const p = new URLSearchParams();
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    if (filters.season) p.append('season', filters.season);
    const { buildFilename } = await import('../utils/filename-format');
    downloadFile(`${API}/fy-summary/balance-sheet/excel?${p}`, buildFilename({ base: 'balance-sheet', kmsYear: filters.kms_year, ext: 'xlsx' }));
  };

  const handlePrint = async () => {
    const html = buildPrintHtml(data);
    const { safePrintHTML } = await import('../utils/print');
    await safePrintHTML(html);
  };

  if (loading) return <div className="text-center text-slate-400 py-20">Loading Balance Sheet...</div>;
  if (!data) return <div className="text-center text-red-400 py-20">Data load nahi hua</div>;

  const liabFocus = getFocusInfo('liability');
  const assetFocus = getFocusInfo('asset');

  return (
    <div
      className="space-y-4 outline-none"
      data-testid="balance-sheet"
      ref={containerRef}
      tabIndex={0}
      onFocus={() => setKbActive(true)}
      onBlur={() => setKbActive(false)}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-amber-400">Balance Sheet</h2>
          <p className="text-xs text-slate-400">
            As on {data.as_on_date} | KMS {data.kms_year || 'All'} {data.season && `| ${data.season}`}
            {kbActive && <span className="ml-2 text-amber-400/70 text-[10px]">Keyboard ON - Arrow keys se navigate karein</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700" onClick={handlePrint} data-testid="bs-print-btn">
            <Printer className="w-3 h-3 mr-1" /> Print
          </Button>
          <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700" onClick={downloadPdf} data-testid="bs-pdf-btn">
            <FileDown className="w-3 h-3" />
          </Button>
          <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700" onClick={downloadExcel} data-testid="bs-excel-btn">
            <FileSpreadsheet className="w-3 h-3" />
          </Button>
          <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700" onClick={fetchData} data-testid="bs-refresh-btn">
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* LIABILITIES */}
        <Card className={`bg-slate-800/80 border-slate-700/50 backdrop-blur ${kbActive && focusCol === 'liability' ? 'ring-1 ring-amber-500/40' : ''}`}>
          <div className="px-4 pt-4 pb-2 border-b border-slate-700/50">
            <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">Liabilities</h3>
          </div>
          <CardContent className="px-3 py-3 space-y-1">
            {data.liabilities.map((g, i) => {
              const isFocusedGroup = liabFocus.focusedGroup === g.group;
              return (
                <div key={i} data-focused={isFocusedGroup && liabFocus.focusedChild === -1 ? 'true' : undefined}>
                  <BalanceGroup
                    group={g}
                    side="liability"
                    expanded={expandedGroups.has(g.group)}
                    onToggle={() => toggleGroup(g.group)}
                    focusedChild={isFocusedGroup ? liabFocus.focusedChild : null}
                  />
                </div>
              );
            })}
            <div className="flex items-center justify-between px-3 py-2.5 bg-red-500/20 rounded-md mt-2 border border-red-500/30">
              <span className="text-sm font-bold text-white">TOTAL</span>
              <span className="text-sm font-bold text-red-400" data-testid="bs-total-liabilities">{formatAmt(data.total_liabilities)}</span>
            </div>
          </CardContent>
        </Card>

        {/* ASSETS */}
        <Card className={`bg-slate-800/80 border-slate-700/50 backdrop-blur ${kbActive && focusCol === 'asset' ? 'ring-1 ring-amber-500/40' : ''}`}>
          <div className="px-4 pt-4 pb-2 border-b border-slate-700/50">
            <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">Assets</h3>
          </div>
          <CardContent className="px-3 py-3 space-y-1">
            {data.assets.map((g, i) => {
              const isFocusedGroup = assetFocus.focusedGroup === g.group;
              return (
                <div key={i} data-focused={isFocusedGroup && assetFocus.focusedChild === -1 ? 'true' : undefined}>
                  <BalanceGroup
                    group={g}
                    side="asset"
                    expanded={expandedGroups.has(g.group)}
                    onToggle={() => toggleGroup(g.group)}
                    focusedChild={isFocusedGroup ? assetFocus.focusedChild : null}
                  />
                </div>
              );
            })}
            <div className="flex items-center justify-between px-3 py-2.5 bg-emerald-500/20 rounded-md mt-2 border border-emerald-500/30">
              <span className="text-sm font-bold text-white">TOTAL</span>
              <span className="text-sm font-bold text-emerald-400" data-testid="bs-total-assets">{formatAmt(data.total_assets)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Account Tables */}
      {data.truck_accounts?.length > 0 && <DetailTable title="Truck Accounts" data={data.truck_accounts} />}
      {data.agent_accounts?.length > 0 && <DetailTable title="Agent/Mandi Accounts" data={data.agent_accounts} />}
      {data.dc_accounts?.length > 0 && <DetailTable title="DC Accounts" data={data.dc_accounts} />}
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
                <tr key={i} className="border-b border-slate-700/30 hover:bg-slate-700/30">
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

function buildPrintHtml(data) {
  const fmt = (n) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const buildSide = (title, groups, total, color) => {
    let html = `<td style="vertical-align:top;width:50%;padding:0 8px;">
      <h3 style="color:${color};font-size:14px;border-bottom:2px solid ${color};padding-bottom:4px;margin-bottom:8px;">${title}</h3>`;
    for (const g of groups) {
      html += `<div style="margin-bottom:6px;">
        <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:12px;background:#f1f5f9;padding:4px 8px;border-radius:4px;">
          <span>${g.group}</span><span style="color:${color}">${fmt(g.amount)}</span>
        </div>`;
      for (const c of (g.children || [])) {
        html += `<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 20px;border-bottom:1px solid #eee;">
          <span>${c.name}${c.unit ? ' (' + c.unit + ')' : ''}</span><span>${fmt(c.amount)}</span>
        </div>`;
      }
      html += `</div>`;
    }
    html += `<div style="display:flex;justify-content:space-between;font-weight:bold;font-size:13px;background:${color};color:white;padding:6px 8px;border-radius:4px;margin-top:8px;">
      <span>TOTAL</span><span>${fmt(total)}</span>
    </div></td>`;
    return html;
  };

  return `<!DOCTYPE html><html><head><title>Balance Sheet - ${data.kms_year || 'All'}</title>
    <style>body{font-family:Arial,sans-serif;margin:20px;color:#333}h2{text-align:center;margin-bottom:4px}p.sub{text-align:center;color:#666;font-size:12px;margin-bottom:16px}table.main{width:100%;border-collapse:collapse}
    @media print{body{margin:10px}}</style></head><body>
    <h2>Balance Sheet</h2>
    <p class="sub">As on ${data.as_on_date} | FY ${data.kms_year || 'All'}${data.season ? ' | ' + data.season : ''}</p>
    <table class="main"><tr>
      ${buildSide('LIABILITIES', data.liabilities, data.total_liabilities, '#dc2626')}
      ${buildSide('ASSETS', data.assets, data.total_assets, '#059669')}
    </tr></table>
    </body></html>`;
}
