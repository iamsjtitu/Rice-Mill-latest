import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Filter, FileSpreadsheet, FileText, X, CheckCircle, Trash2, RefreshCw, Eye, Pencil, Printer, Download, Scale } from "lucide-react";
import PaginationBar from "./PaginationBar";
import { downloadFile } from "../utils/download";
import { fmtDate } from "../utils/date";
import { useConfirm } from "./ConfirmProvider";
const _isElectron = typeof window !== "undefined" && (window.electronAPI || window.ELECTRON_API_URL);
const _isElectronEnv = typeof window !== "undefined" && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? "" : (process.env.REACT_APP_BACKEND_URL || "");
const API = `${BACKEND_URL}/api`;
const fmtWt = (w) => w ? Number(w).toLocaleString() : "0";

import { safePrintHTML } from "../utils/print";

function getLast7DaysDate() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split("T")[0];
}
const todayStr = new Date().toISOString().split("T")[0];

export default function AutoWeightEntries({ filters, onVwChange }) {
  const kms = filters?.kms_year || "";
  const PAGE_SIZE = 30;
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [linkedRst, setLinkedRst] = useState(new Set());
  const [showFilters, setShowFilters] = useState(true);
  const [editEntry, setEditEntry] = useState(null);
  const [photoDialog, setPhotoDialog] = useState({ open: false, data: null, loading: false });
  const [zoomImg, setZoomImg] = useState(null);
  const showConfirm = useConfirm();

  // ESC key handler for photo zoom overlay
  useEffect(() => {
    if (!zoomImg) return;
    const handler = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setZoomImg(null); } };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [zoomImg]);

  const [vwFilters, setVwFilters] = useState({
    date_from: getLast7DaysDate(), date_to: todayStr,
    vehicle_no: "", party_name: "", farmer_name: "", rst_no: ""
  });

  const abortRef = useRef(null);
  const fetchData = useCallback(async (fetchPage) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const p = fetchPage || page;
      const fp = new URLSearchParams({ kms_year: kms, status: "completed", page: p, page_size: PAGE_SIZE });
      if (vwFilters.date_from) fp.append("date_from", vwFilters.date_from);
      if (vwFilters.date_to) fp.append("date_to", vwFilters.date_to);
      if (vwFilters.vehicle_no) fp.append("vehicle_no", vwFilters.vehicle_no);
      if (vwFilters.party_name) fp.append("party_name", vwFilters.party_name);
      if (vwFilters.farmer_name) fp.append("farmer_name", vwFilters.farmer_name);
      if (vwFilters.rst_no) fp.append("rst_no", vwFilters.rst_no);
      const [eR, lR] = await Promise.all([
        axios.get(`${API}/vehicle-weight?${fp.toString()}`, { signal: ctrl.signal }),
        axios.get(`${API}/vehicle-weight/linked-rst?kms_year=${kms}`, { signal: ctrl.signal })
      ]);
      setEntries(eR.data.entries || []);
      setTotalPages(eR.data.total_pages || 1);
      setTotalCount(eR.data.total || 0);
      setPage(eR.data.page || 1);
      setLinkedRst(new Set(lR.data.linked_rst || []));
    } catch (e) { if (!ctrl.signal.aborted) toast.error("Data fetch error"); }
    if (!ctrl.signal.aborted) setLoading(false);
  }, [kms, page, vwFilters]);

  useEffect(() => {
    const timer = setTimeout(() => fetchData(), 300);
    return () => { clearTimeout(timer); if (abortRef.current) abortRef.current.abort(); };
  }, [fetchData]);

  // ── Action handlers ──
  const handleDelete = async (id) => {
    if (!await showConfirm("Delete", "Kya aap ye entry delete karna chahte hain?")) return;
    try { await axios.delete(`${API}/vehicle-weight/${id}`); toast.success("Deleted"); fetchData(); if (onVwChange) onVwChange(); } catch { toast.error("Error"); }
  };
  const handlePdf = (e) => { const u = `${API}/vehicle-weight/${e.id}/slip-pdf?party_only=1`; _isElectron ? downloadFile(u, `Slip_${e.rst_no}.pdf`) : window.open(u, "_blank"); };

  // ── Print A5 with 2 copies (Party Copy + Customer Copy) ──
  const handlePrint = async (e) => {
    let company = "NAVKAR AGRO", tagline = "JOLKO, KESINGA";
    let aboveFields = [], belowFields = [];
    try {
      const r = await axios.get(`${API}/branding`);
      if (r.data) {
        company = r.data.company_name || company;
        tagline = r.data.tagline || tagline;
        const cf = r.data.custom_fields || [];
        cf.forEach(f => {
          const val = (f.value || '').trim();
          if (!val) return;
          const lbl = (f.label || '').trim();
          const txt = lbl ? `<b>${lbl}:</b> ${val}` : val;
          if (f.placement === 'above') aboveFields.push(txt);
          else belowFields.push(txt);
        });
      }
    } catch {}

    const rst = e.rst_no;
    const gross = Number(e.gross_wt || e.first_wt || 0).toLocaleString();
    const tare = Number(e.tare_wt || e.second_wt || 0).toLocaleString();
    const net = Number(e.net_wt || 0).toLocaleString();
    const cash = Number(e.cash_paid || 0);
    const diesel = Number(e.diesel_paid || 0);

    const aboveHTML = aboveFields.length > 0 ? `<div class="custom-row above">${aboveFields.join(' &nbsp;|&nbsp; ')}</div>` : '';
    const belowHTML = belowFields.length > 0 ? `<div class="custom-row below">${belowFields.join(' &nbsp;|&nbsp; ')}</div>` : '';

    const copyHTML = (copyLabel, showSignature) => `
      <div class="copy-block">
        <div class="copy-label">${copyLabel}</div>
        <div class="header">
          ${aboveHTML}
          <h1>${company}</h1>
          <p class="tagline">${tagline}</p>
          ${belowHTML}
          <div class="slip-title">WEIGHT SLIP / तौल पर्ची</div>
        </div>
        <table class="info-table">
          <tr><td class="lbl">RST No.</td><td class="val rst">#${rst}</td><td class="lbl">Date / दिनांक</td><td class="val">${fmtDate(e.date)}</td></tr>
          <tr><td class="lbl">Vehicle / गाड़ी</td><td class="val">${e.vehicle_no}</td><td class="lbl">Trans Type</td><td class="val">${e.trans_type || '-'}</td></tr>
          <tr><td class="lbl">Party / पार्टी</td><td class="val">${e.party_name || '-'}</td><td class="lbl">Source/Mandi</td><td class="val">${e.farmer_name || '-'}</td></tr>
          <tr><td class="lbl">Product / माल</td><td class="val">${e.product || '-'}</td><td class="lbl">Bags / बोरे</td><td class="val">${e.tot_pkts || '-'}</td></tr>
          ${Number(e.g_issued || 0) > 0 ? `<tr><td class="lbl">G.Issued</td><td class="val" style="color:#4338ca;font-weight:900">${Number(e.g_issued).toLocaleString()}</td><td class="lbl"></td><td class="val"></td></tr>` : ''}
        </table>
        <table class="wt-table">
          <tr>
            <td class="wt-cell"><span class="wt-label">Gross / कुल</span><span class="wt-val">${gross} KG</span></td>
            <td class="wt-cell"><span class="wt-label">Tare / खाली</span><span class="wt-val">${tare} KG</span></td>
            <td class="wt-cell net"><span class="wt-label">Net / शुद्ध</span><span class="wt-val">${net} KG</span></td>
            ${(cash > 0 || diesel > 0) ? `
              ${cash > 0 ? `<td class="wt-cell pay"><span class="wt-label">Cash / नकद</span><span class="wt-val pay-v">${cash.toLocaleString()}</span></td>` : ''}
              ${diesel > 0 ? `<td class="wt-cell pay"><span class="wt-label">Diesel / डीजल</span><span class="wt-val pay-v">${diesel.toLocaleString()}</span></td>` : ''}
            ` : ''}
          </tr>
        </table>
        ${showSignature ? `
        <div class="sig-section">
          <div class="sig-box"><div class="sig-line"></div><p>Driver / ड्राइवर</p></div>
          <div class="sig-box"><div class="sig-line"></div><p>Authorized / अधिकृत</p></div>
        </div>
        ` : ''}
        <p class="footer-note">${company} | Computer Generated</p>
      </div>
    `;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Weight Slip #${rst}</title>
    <style>
      @page { size: 148mm 210mm; margin: 3mm 4mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { width: 140mm; margin: 0 auto; }
      .copy-block { border: 1.5px solid #222; border-radius: 3px; padding: 6px 8px 5px; position: relative; }
      .copy-label { position: absolute; top: -1px; right: 8px; background: white; padding: 0 5px; font-size: 8px; font-weight: bold; color: #666; letter-spacing: 0.8px; text-transform: uppercase; }
      .header { text-align: center; margin-bottom: 4px; border-bottom: 2px solid #1a1a2e; padding-bottom: 4px; }
      .header h1 { font-size: 18px; font-weight: 900; color: #1a1a2e; line-height: 1.1; }
      .tagline { font-size: 9px; color: #777; margin: 2px 0; }
      .custom-row { font-size: 8px; color: #555; margin: 2px 0; line-height: 1.4; }
      .custom-row.above { color: #8B0000; font-weight: 600; }
      .custom-row.below { color: #374151; }
      .slip-title { font-size: 11px; color: #333; font-weight: 700; margin-top: 2px; }
      .info-table { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
      .info-table td { padding: 3px 5px; font-size: 10px; border: 0.5px solid #ccc; line-height: 1.3; }
      .lbl { color: #333; font-weight: 700; width: 20%; white-space: nowrap; }
      .val { color: #000; font-weight: 800; width: 30%; }
      .val.rst { font-size: 12px; color: #1a1a2e; }
      .wt-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
      .wt-cell { text-align: center; padding: 4px 3px; border: 1.5px solid #999; background: #f5f5f5; vertical-align: middle; }
      .wt-cell.net { background: #e8f5e9; border-color: #2e7d32; }
      .wt-cell.pay { background: #fff8e1; border-color: #f9a825; }
      .wt-label { display: block; font-size: 8px; color: #444; font-weight: 600; margin-bottom: 1px; }
      .wt-val { display: block; font-size: 15px; font-weight: 900; color: #000; }
      .wt-cell.net .wt-val { color: #1b5e20; font-size: 16px; }
      .pay-v { color: #e65100 !important; font-size: 13px !important; }
      .sig-section { display: flex; justify-content: space-between; margin-top: 3px; }
      .sig-box { text-align: center; width: 44%; }
      .sig-line { border-bottom: 1.5px solid #333; height: 16px; margin-bottom: 2px; }
      .sig-box p { font-size: 8px; color: #444; font-weight: 600; }
      .footer-note { text-align: center; font-size: 7px; color: #999; margin-top: 3px; }
      .cut-line { border-top: 1.5px dashed #aaa; margin: 3mm 0; position: relative; height: 0; }
      .cut-text { position: absolute; top: -6px; left: 50%; transform: translateX(-50%); background: white; padding: 0 6px; font-size: 7px; color: #aaa; }
      @media print { body { margin: 0; } .no-print { display: none !important; } }
      @media screen { .page { padding: 10px; border: 1px solid #ccc; margin: 10px auto; max-width: 550px; } }
    </style></head><body>
    <div class="page">
      ${copyHTML("PARTY COPY / पार्टी प्रति", false)}
      <div class="cut-line"><span class="cut-text">- - - CUT HERE / काटें - - -</span></div>
      ${copyHTML("CUSTOMER COPY / ग्राहक प्रति", true)}
    </div>
    <div class="no-print" style="text-align:center;margin-top:20px;">
      <button onclick="window.print()" style="background:#d97706;color:white;border:none;padding:12px 30px;border-radius:6px;cursor:pointer;font-size:16px;font-weight:bold;">Print / प्रिंट करें</button>
    </div>
    </body></html>`;

    safePrintHTML(html);
  };
  const openPhotos = async (entry) => {
    setPhotoDialog({ open: true, data: null, loading: true });
    try {
      const [r, br] = await Promise.all([
        axios.get(`${API}/vehicle-weight/${entry.id}/photos`),
        axios.get(`${API}/branding`).catch(() => ({ data: null }))
      ]);
      const brandInfo = { company: br.data?.company_name || "NAVKAR AGRO", tagline: br.data?.tagline || "JOLKO, KESINGA - Mill Entry System", custom_fields: br.data?.custom_fields || [] };
      setPhotoDialog({ open: true, data: { ...r.data, _brand: brandInfo }, loading: false });
    } catch {
      toast.error("Photos load nahi hue");
      setPhotoDialog({ open: false, data: null, loading: false });
    }
  };
  const openEdit = (entry) => { setEditEntry({ ...entry }); };
  const saveEdit = async () => {
    if (!editEntry) return;
    try {
      await axios.put(`${API}/vehicle-weight/${editEntry.id}/edit`, editEntry);
      toast.success("Updated");
      setEditEntry(null);
      fetchData();
    } catch { toast.error("Update error"); }
  };

  return (
    <>
    <Card className="bg-slate-800 border-slate-600 shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4 bg-slate-700/50">
        <CardTitle className="text-xs flex items-center justify-between">
          <span className="text-slate-300 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-blue-600" /> Auto Weight Entries (Last 7 Days)
            <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-[10px] ml-1">{totalCount}</Badge>
          </span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] text-slate-400 border-slate-600" onClick={() => setShowFilters(!showFilters)} data-testid="awe-filter-toggle">
              <Filter className="w-3 h-3 mr-1" />{showFilters ? 'Hide' : 'Filters'}
            </Button>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] text-emerald-700 border-emerald-300 hover:bg-emerald-50" data-testid="awe-export-excel"
              onClick={() => { const fp = new URLSearchParams({ kms_year: kms, status: "completed", ...vwFilters }); Object.keys(vwFilters).forEach(k => { if (!vwFilters[k]) fp.delete(k); }); downloadFile(`${API}/vehicle-weight/export/excel?${fp.toString()}`, `auto_weight_entries.xlsx`); }}>
              <FileSpreadsheet className="w-3 h-3 mr-1" />Excel
            </Button>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] text-red-700 border-red-300 hover:bg-red-50" data-testid="awe-export-pdf"
              onClick={() => { const fp = new URLSearchParams({ kms_year: kms, status: "completed", ...vwFilters }); Object.keys(vwFilters).forEach(k => { if (!vwFilters[k]) fp.delete(k); }); downloadFile(`${API}/vehicle-weight/export/pdf?${fp.toString()}`, `auto_weight_entries.pdf`); }}>
              <FileText className="w-3 h-3 mr-1" />PDF
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => fetchData(1)} data-testid="awe-refresh">
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </CardTitle>
        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mt-2 pb-1" data-testid="awe-filter-bar">
            <div>
              <label className="text-[9px] text-slate-400 font-medium">Date From</label>
              <Input type="date" className="h-7 text-xs" value={vwFilters.date_from} onChange={e => { setVwFilters(p => ({ ...p, date_from: e.target.value })); setPage(1); }} data-testid="awe-filter-date-from" />
            </div>
            <div>
              <label className="text-[9px] text-slate-400 font-medium">Date To</label>
              <Input type="date" className="h-7 text-xs" value={vwFilters.date_to} onChange={e => { setVwFilters(p => ({ ...p, date_to: e.target.value })); setPage(1); }} data-testid="awe-filter-date-to" />
            </div>
            <div>
              <label className="text-[9px] text-slate-400 font-medium">RST No</label>
              <Input type="text" placeholder="RST..." className="h-7 text-xs" value={vwFilters.rst_no} onChange={e => { setVwFilters(p => ({ ...p, rst_no: e.target.value })); setPage(1); }} data-testid="awe-filter-rst" />
            </div>
            <div>
              <label className="text-[9px] text-slate-400 font-medium">Vehicle</label>
              <Input type="text" placeholder="Vehicle..." className="h-7 text-xs" value={vwFilters.vehicle_no} onChange={e => { setVwFilters(p => ({ ...p, vehicle_no: e.target.value })); setPage(1); }} data-testid="awe-filter-vehicle" />
            </div>
            <div>
              <label className="text-[9px] text-slate-400 font-medium">Party</label>
              <Input type="text" placeholder="Party..." className="h-7 text-xs" value={vwFilters.party_name} onChange={e => { setVwFilters(p => ({ ...p, party_name: e.target.value })); setPage(1); }} data-testid="awe-filter-party" />
            </div>
            <div>
              <label className="text-[9px] text-slate-400 font-medium">Mandi</label>
              <div className="flex gap-1">
                <Input type="text" placeholder="Mandi..." className="h-7 text-xs" value={vwFilters.farmer_name} onChange={e => { setVwFilters(p => ({ ...p, farmer_name: e.target.value })); setPage(1); }} data-testid="awe-filter-mandi" />
                <Button variant="ghost" size="sm" className="h-7 px-1.5 text-[10px] text-slate-500 hover:text-red-600" data-testid="awe-filter-clear"
                  onClick={() => { setVwFilters({ date_from: getLast7DaysDate(), date_to: todayStr, vehicle_no: "", party_name: "", farmer_name: "", rst_no: "" }); setPage(1); }}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0 border-t border-slate-700">
        {loading ? (
          <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-slate-500" /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700 bg-slate-700">
                  <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold">RST</TableHead>
                  <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold">Date</TableHead>
                  <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold">Vehicle</TableHead>
                  <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold">Party</TableHead>
                  <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold">Source</TableHead>
                  <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold">Product</TableHead>
                  <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold">Bags</TableHead>
                  <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold text-right">1st Wt</TableHead>
                  <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold text-right">2nd Wt</TableHead>
                  <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold text-right">Net Wt</TableHead>
                  <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold text-right">G.Issued</TableHead>
                  <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold">TP No.</TableHead>
                  <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold text-right">TP Wt</TableHead>
                  <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold text-right">Cash</TableHead>
                  <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold text-right">Diesel</TableHead>
                  <TableHead className="text-slate-400 text-[10px] py-2 px-3 font-semibold text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 ? (
                  <TableRow><TableCell colSpan={16} className="text-center text-slate-500 py-8 text-xs" data-testid="awe-no-entries">
                    Koi entry nahi mili - Filter change karke dekhein
                  </TableCell></TableRow>
                ) : entries.map((e, i) => {
                  const isLinked = linkedRst.has(e.rst_no);
                  return (
                    <TableRow key={e.id} className={`border-slate-700 hover:bg-slate-700 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-700/50'} ${isLinked ? 'bg-green-50/40' : ''}`} data-testid={`awe-row-${e.rst_no}`}>
                      <TableCell className="py-2 px-3"><span className="text-amber-700 font-bold text-xs">#{e.rst_no}</span></TableCell>
                      <TableCell className="py-2 px-3 text-xs text-slate-400">{fmtDate(e.date)}</TableCell>
                      <TableCell className="py-2 px-3 text-xs font-semibold text-slate-200">{e.vehicle_no}</TableCell>
                      <TableCell className="py-2 px-3 text-xs text-slate-300">{e.party_name}</TableCell>
                      <TableCell className="py-2 px-3 text-xs text-slate-400">{e.farmer_name || '-'}</TableCell>
                      <TableCell className="py-2 px-3"><Badge variant="outline" className="text-[9px] py-0">{e.product}</Badge></TableCell>
                      <TableCell className="py-2 px-3 text-xs text-slate-400">{e.tot_pkts || '-'}</TableCell>
                      <TableCell className="py-2 px-3 text-xs text-right text-blue-700 font-semibold">{fmtWt(e.first_wt)}</TableCell>
                      <TableCell className="py-2 px-3 text-xs text-right text-blue-700 font-semibold">{fmtWt(e.second_wt)}</TableCell>
                      <TableCell className="py-2 px-3 text-xs text-right text-green-700 font-bold">{fmtWt(e.net_wt)}</TableCell>
                      <TableCell className="py-2 px-3 text-xs text-right text-indigo-700 font-semibold">{e.g_issued ? fmtWt(e.g_issued) : '-'}</TableCell>
                      <TableCell className="py-2 px-3 text-xs text-slate-400">{e.tp_no || '-'}</TableCell>
                      <TableCell className="py-2 px-3 text-xs text-right text-slate-400 font-mono">{Number(e.tp_weight || 0) > 0 ? Number(e.tp_weight) : '-'}</TableCell>
                      <TableCell className="py-2 px-3 text-xs text-right text-amber-700 font-semibold">{e.cash_paid ? fmtWt(e.cash_paid) : '-'}</TableCell>
                      <TableCell className="py-2 px-3 text-xs text-right text-red-600 font-semibold">{e.diesel_paid ? fmtWt(e.diesel_paid) : '-'}</TableCell>
                      <TableCell className="py-2 px-3">
                        <div className="flex items-center gap-0.5 justify-center">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-500 hover:text-cyan-600" onClick={() => openPhotos(e)} data-testid={`awe-photos-${e.id}`} title="View Photos"><Eye className="w-3 h-3" /></Button>
                          {!isLinked && (
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-500 hover:text-amber-600" onClick={() => openEdit(e)} data-testid={`awe-edit-${e.id}`} title="Edit"><Pencil className="w-3 h-3" /></Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-500 hover:text-purple-600" onClick={() => handlePrint(e)} data-testid={`awe-print-${e.id}`} title="Print"><Printer className="w-3 h-3" /></Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-500 hover:text-blue-600" onClick={() => handlePdf(e)} data-testid={`awe-pdf-${e.id}`} title="Download"><Download className="w-3 h-3" /></Button>
                          {isLinked ? (
                            <span className="h-6 w-6 flex items-center justify-center text-green-500" title="Mill Entry done" data-testid={`awe-linked-${e.rst_no}`}><CheckCircle className="w-4 h-4" /></span>
                          ) : (
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-600" onClick={() => handleDelete(e.id)} data-testid={`awe-del-${e.id}`} title="Delete"><Trash2 className="w-3 h-3" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <PaginationBar page={page} totalPages={totalPages} total={totalCount} pageSize={PAGE_SIZE}
              onPageChange={(p) => { setPage(p); fetchData(p); }} />
          </div>
        )}
      </CardContent>
    </Card>

    {/* Photo View Dialog - Print Slip Style */}
    <Dialog open={photoDialog.open} onOpenChange={v => !v && setPhotoDialog({ open: false, data: null, loading: false })}>
      <DialogContent className="bg-slate-800 border-slate-600 max-w-[520px] max-h-[90vh] overflow-y-auto p-0" data-testid="awe-photo-dialog"
        onEscapeKeyDown={(e) => {
          const zoomOpen = document.querySelector('[data-testid="awe-photo-zoom-overlay"], [data-testid="photo-zoom-overlay"], [data-testid="camera-zoom-overlay"]');
          if (zoomOpen) e.preventDefault();
        }}>
        {photoDialog.loading ? (
          <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-slate-500" /></div>
        ) : photoDialog.data ? (
          <>
          <div className="border-[2px] border-gray-800 rounded m-3" data-testid="awe-photo-slip">
            <div className="text-center border-b-[2px] border-gray-800 py-2 px-3 relative">
              <div className="absolute top-1 right-2 text-[9px] text-slate-400 font-semibold tracking-wide">VIEW COPY</div>
              {/* Custom fields ABOVE */}
              {(() => { const above = (photoDialog.data?._brand?.custom_fields || []).filter(f => f.placement === 'above' && f.value); return above.length > 0 ? <p className="text-[9px] text-red-800 font-semibold mb-0.5">{above.map(f => f.label ? `${f.label}: ${f.value}` : f.value).join('  |  ')}</p> : null; })()}
              <h2 className="text-lg font-black text-slate-100 leading-tight tracking-wide">{photoDialog.data?._brand?.company || "NAVKAR AGRO"}</h2>
              <p className="text-[10px] text-slate-400 mt-0.5">{photoDialog.data?._brand?.tagline || "JOLKO, KESINGA - Mill Entry System"}</p>
              {/* Custom fields BELOW */}
              {(() => { const below = (photoDialog.data?._brand?.custom_fields || []).filter(f => f.placement !== 'above' && f.value); return below.length > 0 ? <p className="text-[9px] text-slate-400 mt-0.5">{below.map(f => f.label ? `${f.label}: ${f.value}` : f.value).join('  |  ')}</p> : null; })()}
              <div className="text-xs font-bold text-slate-300 mt-0.5">WEIGHT SLIP / तौल पर्ची</div>
            </div>
            <table className="w-full border-collapse text-[11px]">
              <tbody>
                <tr>
                  <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold w-[22%]">RST No.</td>
                  <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100 text-xs w-[28%]">#{photoDialog.data.rst_no}</td>
                  <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold w-[22%]">Date / दिनांक</td>
                  <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100 w-[28%]">{fmtDate(photoDialog.data.date) || '-'}</td>
                </tr>
                <tr>
                  <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold">Vehicle / गाड़ी</td>
                  <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100">{photoDialog.data.vehicle_no}</td>
                  <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold">Trans Type</td>
                  <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100">{photoDialog.data.trans_type || '-'}</td>
                </tr>
                <tr>
                  <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold">Party / पार्टी</td>
                  <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100">{photoDialog.data.party_name || '-'}</td>
                  <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold">Source/Mandi</td>
                  <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100">{photoDialog.data.farmer_name || '-'}</td>
                </tr>
                <tr>
                  <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold">Product / माल</td>
                  <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100">{photoDialog.data.product || '-'}</td>
                  <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold">Bags / बोरे</td>
                  <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100">{photoDialog.data.tot_pkts || '-'}</td>
                </tr>
                {(Number(photoDialog.data.g_issued || 0) > 0) && (
                  <tr>
                    <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold">G.Issued</td>
                    <td className="border border-slate-600 px-2 py-1 font-extrabold text-indigo-700">{fmtWt(photoDialog.data.g_issued)}</td>
                    <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold">TP No.</td>
                    <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100">{photoDialog.data.tp_no || '-'}</td>
                  </tr>
                )}
                {(!photoDialog.data.g_issued || Number(photoDialog.data.g_issued) === 0) && photoDialog.data.tp_no && (
                  <tr>
                    <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold">TP No.</td>
                    <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100">{photoDialog.data.tp_no}</td>
                    <td className="border border-slate-600 px-2 py-1"></td>
                    <td className="border border-slate-600 px-2 py-1"></td>
                  </tr>
                )}
                {Number(photoDialog.data.tp_weight || 0) > 0 && (
                  <tr>
                    <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold">TP Weight</td>
                    <td className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100">{Number(photoDialog.data.tp_weight)} Q</td>
                    <td className="border border-slate-600 px-2 py-1"></td>
                    <td className="border border-slate-600 px-2 py-1"></td>
                  </tr>
                )}
                {photoDialog.data.remark && (
                  <tr>
                    <td className="border border-slate-600 px-2 py-1 text-slate-400 font-bold">Remark / टिप्पणी</td>
                    <td colSpan="3" className="border border-slate-600 px-2 py-1 font-extrabold text-slate-100">{photoDialog.data.remark}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="flex border-t-[2px] border-gray-800">
              <div className="flex-1 text-center py-1.5 border-r border-gray-400 bg-slate-700">
                <span className="block text-[8px] font-bold text-slate-400 uppercase">Gross / कुल</span>
                <span className="block text-sm font-black text-slate-100">{fmtWt(photoDialog.data.first_wt)} KG</span>
              </div>
              <div className="flex-1 text-center py-1.5 border-r border-gray-400 bg-slate-700">
                <span className="block text-[8px] font-bold text-slate-400 uppercase">Tare / खाली</span>
                <span className="block text-sm font-black text-slate-100">{fmtWt(photoDialog.data.second_wt)} KG</span>
              </div>
              <div className="flex-1 text-center py-1.5 border-r border-gray-400" style={{ background: '#e8f5e9' }}>
                <span className="block text-[8px] font-bold text-green-800 uppercase">Net / शुद्ध</span>
                <span className="block text-base font-black text-green-900">{fmtWt(photoDialog.data.net_wt)} KG</span>
              </div>
              {Number(photoDialog.data.cash_paid || 0) > 0 && (
                <div className="flex-1 text-center py-1.5 border-r border-gray-400" style={{ background: '#fff3e0' }}>
                  <span className="block text-[8px] font-bold text-orange-800 uppercase">Cash / नकद</span>
                  <span className="block text-sm font-black text-orange-900">{Number(photoDialog.data.cash_paid).toLocaleString()}</span>
                </div>
              )}
              {Number(photoDialog.data.diesel_paid || 0) > 0 && (
                <div className="flex-1 text-center py-1.5" style={{ background: '#fff3e0' }}>
                  <span className="block text-[8px] font-bold text-orange-800 uppercase">Diesel / डीजल</span>
                  <span className="block text-sm font-black text-orange-900">{Number(photoDialog.data.diesel_paid).toLocaleString()}</span>
                </div>
              )}
            </div>
            <div className="text-center py-1 border-t border-slate-600">
              <span className="text-[8px] text-slate-500">{photoDialog.data?._brand?.company || "NAVKAR AGRO"} | Computer Generated</span>
            </div>
          </div>
          <div className="space-y-3 mx-3 mb-3">
            <div className="border border-blue-300 rounded p-2.5 bg-blue-50/30">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-blue-800 font-bold text-[11px] flex items-center gap-1"><Scale className="w-3 h-3" /> 1st Weight (Gross)</h3>
                <span className="text-blue-900 font-mono font-bold text-xs">{fmtWt(photoDialog.data.first_wt)} KG</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-slate-400 mb-0.5 font-medium">Front View</p>
                  {photoDialog.data.first_wt_front_img ? (
                    <img src={`data:image/jpeg;base64,${photoDialog.data.first_wt_front_img}`} alt="1st Front" className="w-full rounded border border-slate-600 object-cover cursor-pointer hover:opacity-80" style={{ maxHeight: 180 }} onClick={() => setZoomImg(`data:image/jpeg;base64,${photoDialog.data.first_wt_front_img}`)} />
                  ) : <div className="h-20 bg-slate-700 rounded flex items-center justify-center text-slate-500 text-[10px]">No Photo</div>}
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 mb-0.5 font-medium">Side View</p>
                  {photoDialog.data.first_wt_side_img ? (
                    <img src={`data:image/jpeg;base64,${photoDialog.data.first_wt_side_img}`} alt="1st Side" className="w-full rounded border border-slate-600 object-cover cursor-pointer hover:opacity-80" style={{ maxHeight: 180 }} onClick={() => setZoomImg(`data:image/jpeg;base64,${photoDialog.data.first_wt_side_img}`)} />
                  ) : <div className="h-20 bg-slate-700 rounded flex items-center justify-center text-slate-500 text-[10px]">No Photo</div>}
                </div>
              </div>
            </div>
            <div className="border border-green-300 rounded p-2.5 bg-green-50/30">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-green-800 font-bold text-[11px] flex items-center gap-1"><Scale className="w-3 h-3" /> 2nd Weight (Tare)</h3>
                <span className="text-green-900 font-mono font-bold text-xs">{fmtWt(photoDialog.data.second_wt)} KG</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-slate-400 mb-0.5 font-medium">Front View</p>
                  {photoDialog.data.second_wt_front_img ? (
                    <img src={`data:image/jpeg;base64,${photoDialog.data.second_wt_front_img}`} alt="2nd Front" className="w-full rounded border border-slate-600 object-cover cursor-pointer hover:opacity-80" style={{ maxHeight: 180 }} onClick={() => setZoomImg(`data:image/jpeg;base64,${photoDialog.data.second_wt_front_img}`)} />
                  ) : <div className="h-20 bg-slate-700 rounded flex items-center justify-center text-slate-500 text-[10px]">No Photo</div>}
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 mb-0.5 font-medium">Side View</p>
                  {photoDialog.data.second_wt_side_img ? (
                    <img src={`data:image/jpeg;base64,${photoDialog.data.second_wt_side_img}`} alt="2nd Side" className="w-full rounded border border-slate-600 object-cover cursor-pointer hover:opacity-80" style={{ maxHeight: 180 }} onClick={() => setZoomImg(`data:image/jpeg;base64,${photoDialog.data.second_wt_side_img}`)} />
                  ) : <div className="h-20 bg-slate-700 rounded flex items-center justify-center text-slate-500 text-[10px]">No Photo</div>}
                </div>
              </div>
            </div>
          </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>

    {/* Edit Dialog */}
    {editEntry && (
      <Dialog open={!!editEntry} onOpenChange={v => !v && setEditEntry(null)}>
        <DialogContent className="bg-slate-800 max-w-md">
          <h3 className="text-sm font-bold mb-2">Edit RST #{editEntry.rst_no}</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><label className="text-slate-400 text-[10px]">Vehicle</label><Input className="h-7 text-xs" value={editEntry.vehicle_no || ''} onChange={ev => setEditEntry(p => ({...p, vehicle_no: ev.target.value}))} /></div>
            <div><label className="text-slate-400 text-[10px]">Party</label><Input className="h-7 text-xs" value={editEntry.party_name || ''} onChange={ev => setEditEntry(p => ({...p, party_name: ev.target.value}))} /></div>
            <div><label className="text-slate-400 text-[10px]">Source</label><Input className="h-7 text-xs" value={editEntry.farmer_name || ''} onChange={ev => setEditEntry(p => ({...p, farmer_name: ev.target.value}))} /></div>
            <div><label className="text-slate-400 text-[10px]">Bags</label><Input className="h-7 text-xs" type="number" value={editEntry.tot_pkts || ''} onChange={ev => setEditEntry(p => ({...p, tot_pkts: ev.target.value}))} /></div>
            <div><label className="text-slate-400 text-[10px]">Cash</label><Input className="h-7 text-xs" type="number" value={editEntry.cash_paid || ''} onChange={ev => setEditEntry(p => ({...p, cash_paid: ev.target.value}))} /></div>
            <div><label className="text-slate-400 text-[10px]">Diesel</label><Input className="h-7 text-xs" type="number" value={editEntry.diesel_paid || ''} onChange={ev => setEditEntry(p => ({...p, diesel_paid: ev.target.value}))} /></div>
            <div><label className="text-slate-400 text-[10px]">G.Issued</label><Input className="h-7 text-xs" type="number" value={editEntry.g_issued || ''} onChange={ev => setEditEntry(p => ({...p, g_issued: ev.target.value}))} /></div>
            <div><label className="text-slate-400 text-[10px]">TP No.</label><Input className="h-7 text-xs" value={editEntry.tp_no || ''} onChange={ev => setEditEntry(p => ({...p, tp_no: ev.target.value}))} /></div>
            <div><label className="text-slate-400 text-[10px]">TP Weight</label><Input className="h-7 text-xs" type="number" value={editEntry.tp_weight || ''} onChange={ev => setEditEntry(p => ({...p, tp_weight: ev.target.value}))} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={() => setEditEntry(null)}>Cancel</Button>
            <Button size="sm" className="bg-blue-600 text-white" onClick={saveEdit}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    )}

    {/* Photo Zoom */}
    {zoomImg && (
      <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center cursor-pointer" onClick={() => setZoomImg(null)} data-testid="awe-photo-zoom-overlay">
        <img src={zoomImg} alt="Zoomed" className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl object-contain" />
        <button className="absolute top-4 right-4 text-white bg-black/50 rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/80 text-lg font-bold" onClick={() => setZoomImg(null)}>&times;</button>
      </div>
    )}
    </>
  );
}
