import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Filter, FileSpreadsheet, FileText, X, CheckCircle, Trash2, RefreshCw } from "lucide-react";
import PaginationBar from "./PaginationBar";
import { downloadFile } from "../utils/download";

const _isElectron = typeof window !== "undefined" && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? "" : (process.env.REACT_APP_BACKEND_URL || "");
const API = `${BACKEND_URL}/api`;
const fmtWt = (w) => w ? Number(w).toLocaleString() : "0";

function getLast7DaysDate() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split("T")[0];
}
const todayStr = new Date().toISOString().split("T")[0];

export default function AutoWeightEntries({ filters }) {
  const kms = filters?.kms_year || "";
  const PAGE_SIZE = 150;
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [linkedRst, setLinkedRst] = useState(new Set());
  const [showFilters, setShowFilters] = useState(true);
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

  useEffect(() => { fetchData(); return () => { if (abortRef.current) abortRef.current.abort(); }; }, [fetchData]);

  return (
    <Card className="bg-white border-gray-200 shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4 bg-gray-50/50">
        <CardTitle className="text-xs flex items-center justify-between">
          <span className="text-gray-700 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-blue-600" /> Auto Weight Entries (Last 7 Days)
            <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-[10px] ml-1">{totalCount}</Badge>
          </span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] text-gray-600 border-gray-300" onClick={() => setShowFilters(!showFilters)} data-testid="awe-filter-toggle">
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
              <label className="text-[9px] text-gray-500 font-medium">Date From</label>
              <Input type="date" className="h-7 text-xs" value={vwFilters.date_from} onChange={e => { setVwFilters(p => ({ ...p, date_from: e.target.value })); setPage(1); }} data-testid="awe-filter-date-from" />
            </div>
            <div>
              <label className="text-[9px] text-gray-500 font-medium">Date To</label>
              <Input type="date" className="h-7 text-xs" value={vwFilters.date_to} onChange={e => { setVwFilters(p => ({ ...p, date_to: e.target.value })); setPage(1); }} data-testid="awe-filter-date-to" />
            </div>
            <div>
              <label className="text-[9px] text-gray-500 font-medium">RST No</label>
              <Input type="text" placeholder="RST..." className="h-7 text-xs" value={vwFilters.rst_no} onChange={e => { setVwFilters(p => ({ ...p, rst_no: e.target.value })); setPage(1); }} data-testid="awe-filter-rst" />
            </div>
            <div>
              <label className="text-[9px] text-gray-500 font-medium">Vehicle</label>
              <Input type="text" placeholder="Vehicle..." className="h-7 text-xs" value={vwFilters.vehicle_no} onChange={e => { setVwFilters(p => ({ ...p, vehicle_no: e.target.value })); setPage(1); }} data-testid="awe-filter-vehicle" />
            </div>
            <div>
              <label className="text-[9px] text-gray-500 font-medium">Party</label>
              <Input type="text" placeholder="Party..." className="h-7 text-xs" value={vwFilters.party_name} onChange={e => { setVwFilters(p => ({ ...p, party_name: e.target.value })); setPage(1); }} data-testid="awe-filter-party" />
            </div>
            <div>
              <label className="text-[9px] text-gray-500 font-medium">Mandi</label>
              <div className="flex gap-1">
                <Input type="text" placeholder="Mandi..." className="h-7 text-xs" value={vwFilters.farmer_name} onChange={e => { setVwFilters(p => ({ ...p, farmer_name: e.target.value })); setPage(1); }} data-testid="awe-filter-mandi" />
                <Button variant="ghost" size="sm" className="h-7 px-1.5 text-[10px] text-gray-400 hover:text-red-600" data-testid="awe-filter-clear"
                  onClick={() => { setVwFilters({ date_from: getLast7DaysDate(), date_to: todayStr, vehicle_no: "", party_name: "", farmer_name: "", rst_no: "" }); setPage(1); }}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0 border-t border-gray-100">
        {loading ? (
          <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-100 bg-gray-50">
                  <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold">RST</TableHead>
                  <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold">Date</TableHead>
                  <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold">Vehicle</TableHead>
                  <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold">Party</TableHead>
                  <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold">Mandi</TableHead>
                  <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold">Product</TableHead>
                  <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold">Pkts</TableHead>
                  <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold text-right">1st Wt</TableHead>
                  <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold text-right">2nd Wt</TableHead>
                  <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold text-right">Net Wt</TableHead>
                  <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold text-right">Cash</TableHead>
                  <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold text-right">Diesel</TableHead>
                  <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 ? (
                  <TableRow><TableCell colSpan={13} className="text-center text-gray-400 py-8 text-xs" data-testid="awe-no-entries">
                    Koi entry nahi mili - Filter change karke dekhein
                  </TableCell></TableRow>
                ) : entries.map((e, i) => {
                  const isLinked = linkedRst.has(e.rst_no);
                  return (
                    <TableRow key={e.id} className={`border-gray-100 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/50'} ${isLinked ? 'bg-green-50/40' : ''}`} data-testid={`awe-row-${e.rst_no}`}>
                      <TableCell className="py-2 px-3"><span className="text-amber-700 font-bold text-xs">#{e.rst_no}</span></TableCell>
                      <TableCell className="py-2 px-3 text-xs text-gray-600">{e.date}</TableCell>
                      <TableCell className="py-2 px-3 text-xs font-semibold text-gray-800">{e.vehicle_no}</TableCell>
                      <TableCell className="py-2 px-3 text-xs text-gray-700">{e.party_name}</TableCell>
                      <TableCell className="py-2 px-3 text-xs text-gray-600">{e.farmer_name || '-'}</TableCell>
                      <TableCell className="py-2 px-3"><Badge variant="outline" className="text-[9px] py-0">{e.product}</Badge></TableCell>
                      <TableCell className="py-2 px-3 text-xs text-gray-600">{e.tot_pkts || '-'}</TableCell>
                      <TableCell className="py-2 px-3 text-xs text-right text-blue-700 font-semibold">{fmtWt(e.first_wt)}</TableCell>
                      <TableCell className="py-2 px-3 text-xs text-right text-blue-700 font-semibold">{fmtWt(e.second_wt)}</TableCell>
                      <TableCell className="py-2 px-3 text-xs text-right text-green-700 font-bold">{fmtWt(e.net_wt)}</TableCell>
                      <TableCell className="py-2 px-3 text-xs text-right text-amber-700 font-semibold">{e.cash_paid ? fmtWt(e.cash_paid) : '-'}</TableCell>
                      <TableCell className="py-2 px-3 text-xs text-right text-red-600 font-semibold">{e.diesel_paid ? fmtWt(e.diesel_paid) : '-'}</TableCell>
                      <TableCell className="py-2 px-3 text-center">
                        {isLinked ? (
                          <span className="inline-flex items-center gap-0.5 text-green-600" title="Mill Entry done" data-testid={`awe-linked-${e.rst_no}`}>
                            <CheckCircle className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="text-orange-500 text-[10px] font-medium" title="Pending Mill Entry" data-testid={`awe-pending-${e.rst_no}`}>Pending</span>
                        )}
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
  );
}
