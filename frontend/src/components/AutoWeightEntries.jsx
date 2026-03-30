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
import { useConfirm } from "./ConfirmProvider";

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
  const [editEntry, setEditEntry] = useState(null);
  const [photoDialog, setPhotoDialog] = useState({ open: false, data: null, loading: false });
  const [zoomImg, setZoomImg] = useState(null);
  const showConfirm = useConfirm();
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

  // ── Action handlers ──
  const handleDelete = async (id) => {
    if (!await showConfirm("Delete", "Kya aap ye entry delete karna chahte hain?")) return;
    try { await axios.delete(`${API}/vehicle-weight/${id}`); toast.success("Deleted"); fetchData(); } catch { toast.error("Error"); }
  };
  const handlePdf = (e) => { const u = `${API}/vehicle-weight/${e.id}/slip-pdf?party_only=1`; _isElectron ? downloadFile(u, `Slip_${e.rst_no}.pdf`) : window.open(u, "_blank"); };
  const openPhotos = async (entry) => {
    setPhotoDialog({ open: true, data: null, loading: true });
    try {
      const [r, br] = await Promise.all([
        axios.get(`${API}/vehicle-weight/${entry.id}/photos`),
        axios.get(`${API}/branding`).catch(() => ({ data: null }))
      ]);
      const brandInfo = { company: br.data?.company_name || "NAVKAR AGRO", tagline: br.data?.tagline || "JOLKO, KESINGA - Mill Entry System" };
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
      await axios.put(`${API}/vehicle-weight/${editEntry.id}`, editEntry);
      toast.success("Updated");
      setEditEntry(null);
      fetchData();
    } catch { toast.error("Update error"); }
  };

  return (
    <>
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
                  <TableHead className="text-gray-500 text-[10px] py-2 px-3 font-semibold text-center">Actions</TableHead>
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
                      <TableCell className="py-2 px-3">
                        <div className="flex items-center gap-0.5 justify-center">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-cyan-600" onClick={() => openPhotos(e)} data-testid={`awe-photos-${e.id}`} title="View Photos"><Eye className="w-3 h-3" /></Button>
                          {!isLinked && (
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-amber-600" onClick={() => openEdit(e)} data-testid={`awe-edit-${e.id}`} title="Edit"><Pencil className="w-3 h-3" /></Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-purple-600" onClick={() => { const u = `${API}/vehicle-weight/${e.id}/slip-pdf?party_only=1`; window.open(u, "_blank"); }} data-testid={`awe-print-${e.id}`} title="Print"><Printer className="w-3 h-3" /></Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-blue-600" onClick={() => handlePdf(e)} data-testid={`awe-pdf-${e.id}`} title="Download"><Download className="w-3 h-3" /></Button>
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
      <DialogContent className="bg-white border-gray-300 max-w-[520px] max-h-[90vh] overflow-y-auto p-0" data-testid="awe-photo-dialog">
        {photoDialog.loading ? (
          <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : photoDialog.data ? (
          <>
          <div className="border-[2px] border-gray-800 rounded m-3" data-testid="awe-photo-slip">
            <div className="text-center border-b-[2px] border-gray-800 py-2 px-3 relative">
              <div className="absolute top-1 right-2 text-[9px] text-gray-500 font-semibold tracking-wide">VIEW COPY</div>
              <h2 className="text-lg font-black text-gray-900 leading-tight tracking-wide">{photoDialog.data?._brand?.company || "NAVKAR AGRO"}</h2>
              <p className="text-[10px] text-gray-500 mt-0.5">{photoDialog.data?._brand?.tagline || "JOLKO, KESINGA - Mill Entry System"}</p>
              <div className="text-xs font-bold text-gray-700 mt-0.5">WEIGHT SLIP / तौल पर्ची</div>
            </div>
            <table className="w-full border-collapse text-[11px]">
              <tbody>
                <tr>
                  <td className="border border-gray-300 px-2 py-1 text-gray-600 font-bold w-[22%]">RST No.</td>
                  <td className="border border-gray-300 px-2 py-1 font-extrabold text-gray-900 text-xs w-[28%]">#{photoDialog.data.rst_no}</td>
                  <td className="border border-gray-300 px-2 py-1 text-gray-600 font-bold w-[22%]">Date / दिनांक</td>
                  <td className="border border-gray-300 px-2 py-1 font-extrabold text-gray-900 w-[28%]">{photoDialog.data.date || '-'}</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-2 py-1 text-gray-600 font-bold">Vehicle / गाड़ी</td>
                  <td className="border border-gray-300 px-2 py-1 font-extrabold text-gray-900">{photoDialog.data.vehicle_no}</td>
                  <td className="border border-gray-300 px-2 py-1 text-gray-600 font-bold">Trans</td>
                  <td className="border border-gray-300 px-2 py-1 font-extrabold text-gray-900">{photoDialog.data.trans_type || '-'}</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-2 py-1 text-gray-600 font-bold">Party / पार्टी</td>
                  <td className="border border-gray-300 px-2 py-1 font-extrabold text-gray-900">{photoDialog.data.party_name || '-'}</td>
                  <td className="border border-gray-300 px-2 py-1 text-gray-600 font-bold">Farmer</td>
                  <td className="border border-gray-300 px-2 py-1 font-extrabold text-gray-900">{photoDialog.data.farmer_name || '-'}</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-2 py-1 text-gray-600 font-bold">Product / माल</td>
                  <td className="border border-gray-300 px-2 py-1 font-extrabold text-gray-900">{photoDialog.data.product || '-'}</td>
                  <td className="border border-gray-300 px-2 py-1 text-gray-600 font-bold">Bags / बोरे</td>
                  <td className="border border-gray-300 px-2 py-1 font-extrabold text-gray-900">{photoDialog.data.tot_pkts || '-'}</td>
                </tr>
              </tbody>
            </table>
            <div className="flex border-t-[2px] border-gray-800">
              <div className="flex-1 text-center py-1.5 border-r border-gray-400 bg-gray-50">
                <span className="block text-[8px] font-bold text-gray-500 uppercase">Gross / कुल</span>
                <span className="block text-sm font-black text-gray-900">{fmtWt(photoDialog.data.first_wt)} KG</span>
              </div>
              <div className="flex-1 text-center py-1.5 border-r border-gray-400 bg-gray-50">
                <span className="block text-[8px] font-bold text-gray-500 uppercase">Tare / खाली</span>
                <span className="block text-sm font-black text-gray-900">{fmtWt(photoDialog.data.second_wt)} KG</span>
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
            <div className="text-center py-1 border-t border-gray-300">
              <span className="text-[8px] text-gray-400">{photoDialog.data?._brand?.company || "NAVKAR AGRO"} | Computer Generated</span>
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
                  <p className="text-[10px] text-gray-500 mb-0.5 font-medium">Front View</p>
                  {photoDialog.data.first_wt_front_img ? (
                    <img src={`data:image/jpeg;base64,${photoDialog.data.first_wt_front_img}`} alt="1st Front" className="w-full rounded border border-gray-200 object-cover cursor-pointer hover:opacity-80" style={{ maxHeight: 180 }} onClick={() => setZoomImg(`data:image/jpeg;base64,${photoDialog.data.first_wt_front_img}`)} />
                  ) : <div className="h-20 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-[10px]">No Photo</div>}
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 mb-0.5 font-medium">Side View</p>
                  {photoDialog.data.first_wt_side_img ? (
                    <img src={`data:image/jpeg;base64,${photoDialog.data.first_wt_side_img}`} alt="1st Side" className="w-full rounded border border-gray-200 object-cover cursor-pointer hover:opacity-80" style={{ maxHeight: 180 }} onClick={() => setZoomImg(`data:image/jpeg;base64,${photoDialog.data.first_wt_side_img}`)} />
                  ) : <div className="h-20 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-[10px]">No Photo</div>}
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
                  <p className="text-[10px] text-gray-500 mb-0.5 font-medium">Front View</p>
                  {photoDialog.data.second_wt_front_img ? (
                    <img src={`data:image/jpeg;base64,${photoDialog.data.second_wt_front_img}`} alt="2nd Front" className="w-full rounded border border-gray-200 object-cover cursor-pointer hover:opacity-80" style={{ maxHeight: 180 }} onClick={() => setZoomImg(`data:image/jpeg;base64,${photoDialog.data.second_wt_front_img}`)} />
                  ) : <div className="h-20 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-[10px]">No Photo</div>}
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 mb-0.5 font-medium">Side View</p>
                  {photoDialog.data.second_wt_side_img ? (
                    <img src={`data:image/jpeg;base64,${photoDialog.data.second_wt_side_img}`} alt="2nd Side" className="w-full rounded border border-gray-200 object-cover cursor-pointer hover:opacity-80" style={{ maxHeight: 180 }} onClick={() => setZoomImg(`data:image/jpeg;base64,${photoDialog.data.second_wt_side_img}`)} />
                  ) : <div className="h-20 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-[10px]">No Photo</div>}
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
        <DialogContent className="bg-white max-w-md">
          <h3 className="text-sm font-bold mb-2">Edit RST #{editEntry.rst_no}</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><label className="text-gray-500 text-[10px]">Vehicle</label><Input className="h-7 text-xs" value={editEntry.vehicle_no || ''} onChange={ev => setEditEntry(p => ({...p, vehicle_no: ev.target.value}))} /></div>
            <div><label className="text-gray-500 text-[10px]">Party</label><Input className="h-7 text-xs" value={editEntry.party_name || ''} onChange={ev => setEditEntry(p => ({...p, party_name: ev.target.value}))} /></div>
            <div><label className="text-gray-500 text-[10px]">Mandi</label><Input className="h-7 text-xs" value={editEntry.farmer_name || ''} onChange={ev => setEditEntry(p => ({...p, farmer_name: ev.target.value}))} /></div>
            <div><label className="text-gray-500 text-[10px]">Pkts</label><Input className="h-7 text-xs" type="number" value={editEntry.tot_pkts || ''} onChange={ev => setEditEntry(p => ({...p, tot_pkts: ev.target.value}))} /></div>
            <div><label className="text-gray-500 text-[10px]">Cash</label><Input className="h-7 text-xs" type="number" value={editEntry.cash_paid || ''} onChange={ev => setEditEntry(p => ({...p, cash_paid: ev.target.value}))} /></div>
            <div><label className="text-gray-500 text-[10px]">Diesel</label><Input className="h-7 text-xs" type="number" value={editEntry.diesel_paid || ''} onChange={ev => setEditEntry(p => ({...p, diesel_paid: ev.target.value}))} /></div>
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
