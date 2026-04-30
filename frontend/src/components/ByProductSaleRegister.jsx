import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Edit, Search, Download, Eye, Filter } from "lucide-react";
import { fmtDate } from "@/utils/date";
import { useConfirm } from "./ConfirmProvider";
import { useCloseFiltersOnEsc } from "../utils/useCloseFiltersOnEsc";
import { updateVwBhada } from "../utils/vw-bhada";
import logger from "../utils/logger";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const API = `${_isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '')}/api`;

export default function ByProductSaleRegister({ filters, user, product }) {
  const showConfirm = useConfirm();
  const [sales, setSales] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewSale, setViewSale] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  useCloseFiltersOnEsc(setShowFilters);
  const [filterValues, setFilterValues] = useState({ date_from: "", date_to: "", billing_date_from: "", billing_date_to: "", rst_no: "", vehicle_no: "", bill_from: "", party_name: "", destination: "" });
  const [billFromSugg, setBillFromSugg] = useState([]);
  const [partySugg, setPartySugg] = useState([]);
  const [destSugg, setDestSugg] = useState([]);
  const [rstLoading, setRstLoading] = useState(false);
  const [oilPremiumMap, setOilPremiumMap] = useState({});

  const blankForm = {
    bill_number: "", billing_date: new Date().toISOString().split("T")[0],
    date: new Date().toISOString().split("T")[0], rst_no: "", vehicle_no: "",
    bill_from: "", party_name: "", destination: "",
    net_weight_kg: "", net_weight_qtl_display: "", bags: "", rate_per_qtl: "",
    sauda_amount: "",
    gst_type: "none", gst_percent: "",
    // Split billing (Pakka + Kaccha single dispatch)
    split_billing: false, billed_weight_kg: "", kaccha_weight_kg: "", kaccha_rate_per_qtl: "",
    // Helper Qtl displays for split mode (auto-synced with kg)
    billed_weight_qtl_display: "", kaccha_weight_qtl_display: "",
    cash_paid: "", diesel_paid: "", bhada: "", advance: "", remark: "",
    product, kms_year: filters.kms_year || "", season: filters.season || "",
  };
  const [form, setForm] = useState(blankForm);
  const [stockInfo, setStockInfo] = useState(null);

  // Product ID mapping for stock API
  const productIdMap = {"Rice Bran":"bran","Mota Kunda":"kunda","Broken Rice":"broken","Rejection Rice":"rejection_rice","Pin Broken Rice":"pin_broken_rice","Poll":"poll","Bhusa":"husk"};
  const productId = productIdMap[product] || product;

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (product) params.append("product", product);
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      if (filters.season) params.append("season", filters.season);
      const stockParams = new URLSearchParams();
      if (filters.kms_year) stockParams.append("kms_year", filters.kms_year);
      if (filters.season) stockParams.append("season", filters.season);
      const fetches = [
        axios.get(`${API}/bp-sale-register?${params}`),
        axios.get(`${API}/bp-sale-register/suggestions/bill-from`),
        axios.get(`${API}/bp-sale-register/suggestions/party-name`),
        axios.get(`${API}/bp-sale-register/suggestions/destination`),
        axios.get(`${API}/byproduct-stock?${stockParams}`),
      ];
      if (product === "Rice Bran") {
        fetches.push(axios.get(`${API}/oil-premium?${stockParams}`));
      }
      const results = await Promise.all(fetches);
      setSales(results[0].data);
      setBillFromSugg(results[1].data || []);
      setPartySugg(results[2].data || []);
      setDestSugg(results[3].data || []);
      setStockInfo(results[4].data?.[productId] || null);
      if (product === "Rice Bran" && results[5]) {
        const map = {};
        (results[5].data || []).forEach(op => {
          const key = op.voucher_no || op.rst_no || '';
          if (key) map[key] = op;
        });
        setOilPremiumMap(map);
      }
    } catch (e) { logger.error(e); }
  }, [product, productId, filters.kms_year, filters.season]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // RST auto-fetch from Vehicle Weight — Sale context only
  // Backend validates trans_type and returns 409 if RST belongs to Purchase
  const fetchRst = async (rstNo) => {
    if (!rstNo) return;
    setRstLoading(true);
    try {
      const res = await axios.get(`${API}/vehicle-weight/by-rst/${rstNo}?kms_year=${filters.kms_year || ""}&expected_context=sale`);
      if (res.data?.entry) {
        const e = res.data.entry;
        // Backend stores as `net_wt`, but some legacy contexts may return `net_weight`. Try both.
        const nw = e.net_wt != null ? e.net_wt : (e.net_weight != null ? e.net_weight : null);
        const nwQtl = nw != null ? Math.round(nw / 100 * 100) / 100 : null;
        setForm(p => {
          const splitOn = !!p.split_billing;
          // In split mode, default Pakka = full total (100% billed), Kaccha = 0.
          // User can shift portion to Kaccha as needed (auto-balance handles it).
          const pakkaKgDefault = splitOn && nw != null ? String(nw) : p.billed_weight_kg;
          const pakkaQtlDefault = splitOn && nwQtl != null ? String(nwQtl) : p.billed_weight_qtl_display;
          const kacchaKgDefault = splitOn ? "0" : p.kaccha_weight_kg;
          const kacchaQtlDefault = splitOn ? "0" : p.kaccha_weight_qtl_display;
          return {
            ...p,
            vehicle_no: e.vehicle_no || p.vehicle_no,
            party_name: e.party_name || p.party_name,
            destination: e.farmer_name || p.destination,
            net_weight_kg: nw != null ? String(nw) : p.net_weight_kg,
            net_weight_qtl_display: nwQtl != null ? String(nwQtl) : p.net_weight_qtl_display,
            bags: e.tot_pkts ? String(e.tot_pkts) : p.bags,
            billed_weight_kg: pakkaKgDefault,
            billed_weight_qtl_display: pakkaQtlDefault,
            kaccha_weight_kg: kacchaKgDefault,
            kaccha_weight_qtl_display: kacchaQtlDefault,
            bhada: e.bhada != null && Number(e.bhada) > 0 ? String(e.bhada) : p.bhada,
          };
        });
        toast.success("RST data fetch ho gaya!");
      }
    } catch (e) {
      if (e.response?.status === 409) {
        // RST belongs to Purchase (or wrong context) — show clear warning, do NOT fill form
        toast.error(e.response.data?.detail || "Ye RST Number Purchase ka hai", { duration: 5000 });
      } else if (e.response?.status === 404) {
        toast.error("RST not found");
      } else {
        logger.error(e);
      }
    } finally { setRstLoading(false); }
  };

  // Calculations (branches on split_billing)
  const rate = parseFloat(form.rate_per_qtl) || 0;
  const isSplit = !!form.split_billing;
  const billedKg = parseFloat(form.billed_weight_kg) || 0;
  const kacchaKg = parseFloat(form.kaccha_weight_kg) || 0;
  // Kaccha rate falls back to main rate when not provided
  const kacchaRate = form.kaccha_rate_per_qtl !== "" && form.kaccha_rate_per_qtl != null
    ? (parseFloat(form.kaccha_rate_per_qtl) || 0)
    : rate;
  // In split mode: total N/W is user-supplied (from RST or manual). Pakka+Kaccha are splits of it.
  // In non-split mode: net_weight_kg is the dispatch weight directly.
  const totalSplitKg = parseFloat(form.net_weight_kg) || 0;
  const totalSplitQtl = totalSplitKg / 100;
  const nwKg = isSplit ? totalSplitKg : (parseFloat(form.net_weight_kg) || 0);
  const nwQtl = nwKg / 100;
  const billedQtl = billedKg / 100;
  const kacchaQtl = kacchaKg / 100;
  const billedAmount = Math.round(billedQtl * rate * 100) / 100;
  const kacchaAmount = Math.round(kacchaQtl * kacchaRate * 100) / 100;
  const amount = isSplit ? billedAmount : Math.round(nwQtl * rate * 100) / 100; // GST-taxable portion
  const gstPct = form.gst_type !== "none" ? (parseFloat(form.gst_percent) || 0) : 0;
  const taxAmt = Math.round(amount * gstPct / 100 * 100) / 100;
  const total = isSplit
    ? Math.round((billedAmount + taxAmt + kacchaAmount) * 100) / 100
    : Math.round((amount + taxAmt) * 100) / 100;
  const cash = parseFloat(form.cash_paid) || 0;
  const diesel = parseFloat(form.diesel_paid) || 0;
  const advance = parseFloat(form.advance) || 0;
  const balance = Math.round((total - advance) * 100) / 100;

  // When editing, add back original entry's weight to available stock
  const editingEntry = editingId ? sales.find(s => s.id === editingId) : null;
  const editingQtl = editingEntry ? parseFloat(editingEntry.net_weight_qtl) || 0 : 0;
  const effectiveAvailQtl = stockInfo ? (stockInfo.available_qntl + editingQtl) : 0;

  const openNew = async () => {
    setEditingId(null);
    setForm({ ...blankForm, product, kms_year: filters.kms_year || "", season: filters.season || "" });
    setIsFormOpen(true);
    // Pre-fill next serial voucher_no (S-001, S-002 ...). User can edit.
    try {
      const res = await axios.get(`${API}/bp-sale-register/next-voucher-no`);
      if (res.data?.voucher_no) {
        setForm(p => ({ ...p, voucher_no: res.data.voucher_no }));
      }
    } catch (e) { /* silent — form works with blank voucher_no too */ }
  };

  const openEdit = (s) => {
    setEditingId(s.id);
    setForm({
      voucher_no: s.voucher_no || "", bill_number: s.bill_number || "", billing_date: s.billing_date || "", date: s.date || "",
      rst_no: s.rst_no || "", vehicle_no: s.vehicle_no || "",
      bill_from: s.bill_from || "", party_name: s.party_name || "", destination: s.destination || "",
      net_weight_kg: s.net_weight_kg ? String(s.net_weight_kg) : "",
      net_weight_qtl_display: s.net_weight_kg ? String(Math.round(s.net_weight_kg / 100 * 100) / 100) : "",
      bags: s.bags ? String(s.bags) : "", rate_per_qtl: s.rate_per_qtl ? String(s.rate_per_qtl) : "",
      gst_type: s.gst_type || "none", gst_percent: s.gst_percent ? String(s.gst_percent) : "",
      split_billing: !!s.split_billing,
      billed_weight_kg: s.billed_weight_kg ? String(s.billed_weight_kg) : "",
      kaccha_weight_kg: s.kaccha_weight_kg ? String(s.kaccha_weight_kg) : "",
      kaccha_rate_per_qtl: s.kaccha_rate_per_qtl ? String(s.kaccha_rate_per_qtl) : "",
      sauda_amount: s.sauda_amount != null ? String(s.sauda_amount) : "",
      billed_weight_qtl_display: s.billed_weight_kg ? String(Math.round(s.billed_weight_kg / 100 * 100) / 100) : "",
      kaccha_weight_qtl_display: s.kaccha_weight_kg ? String(Math.round(s.kaccha_weight_kg / 100 * 100) / 100) : "",
      cash_paid: s.cash_paid ? String(s.cash_paid) : "", diesel_paid: s.diesel_paid ? String(s.diesel_paid) : "",
      bhada: s.bhada ? String(s.bhada) : "",
      advance: s.advance ? String(s.advance) : "", remark: s.remark || "",
      product: s.product || product, kms_year: s.kms_year || "", season: s.season || "",
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.party_name?.trim()) { toast.error("Party Name daalen"); return; }
    if (form.split_billing) {
      if (billedKg <= 0 && kacchaKg <= 0) { toast.error("Pakka ya Kaccha weight daalen"); return; }
    } else {
      if (nwKg <= 0) { toast.error("Net weight daalen"); return; }
    }
    try {
      const payload = {
        ...form,
        net_weight_kg: nwKg,
        rate_per_qtl: rate,
        bags: parseInt(form.bags) || 0,
        split_billing: !!form.split_billing,
        billed_weight_kg: form.split_billing ? billedKg : 0,
        kaccha_weight_kg: form.split_billing ? kacchaKg : 0,
        kaccha_rate_per_qtl: form.split_billing ? kacchaRate : 0,
      };
      if (editingId) {
        await axios.put(`${API}/bp-sale-register/${editingId}?username=${user.username}&role=${user.role}`, payload);
        toast.success("Updated!");
      } else {
        await axios.post(`${API}/bp-sale-register?username=${user.username}&role=${user.role}`, payload);
        toast.success("Sale saved!");
      }
      // Sync Bhada (Lumpsum) to canonical Vehicle Weight entry — single source of truth
      // for truck-owner ledger. Backend's _sync_*_bhada_ledger updates on PUT to VW edit.
      const bhadaVal = parseFloat(form.bhada) || 0;
      if (form.rst_no) {
        const r = await updateVwBhada(form.rst_no, bhadaVal, user.username, filters.kms_year || "");
        if (!r.ok && bhadaVal > 0) {
          toast.warning(`Bhada save hua par truck owner ledger me sync nahi hua (RST not in Vehicle Weight). Pehle Vehicle Weight entry banayein.`, { duration: 6000 });
        }
      }
      setIsFormOpen(false); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleDelete = async (id) => {
    if (!await showConfirm("Delete", "Delete karna chahte hain?")) return;
    try { await axios.delete(`${API}/bp-sale-register/${id}`); toast.success("Deleted!"); fetchData(); } catch (e) { toast.error("Error"); }
  };

  const filtered = sales.filter(s => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(s.party_name || "").toLowerCase().includes(q) && !(s.voucher_no || "").toLowerCase().includes(q) && !(s.bill_number || "").toLowerCase().includes(q) && !(s.vehicle_no || "").toLowerCase().includes(q)) return false;
    }
    const f = filterValues;
    if (f.date_from && (s.date || "") < f.date_from) return false;
    if (f.date_to && (s.date || "") > f.date_to) return false;
    if (f.billing_date_from && (s.billing_date || "") < f.billing_date_from) return false;
    if (f.billing_date_to && (s.billing_date || "") > f.billing_date_to) return false;
    if (f.rst_no && !(s.rst_no || "").toLowerCase().includes(f.rst_no.toLowerCase())) return false;
    if (f.vehicle_no && !(s.vehicle_no || "").toLowerCase().includes(f.vehicle_no.toLowerCase())) return false;
    if (f.bill_from && !(s.bill_from || "").toLowerCase().includes(f.bill_from.toLowerCase())) return false;
    if (f.party_name && !(s.party_name || "").toLowerCase().includes(f.party_name.toLowerCase())) return false;
    if (f.destination && !(s.destination || "").toLowerCase().includes(f.destination.toLowerCase())) return false;
    return true;
  });

  // Build export filter params
  const buildExportParams = () => {
    const params = new URLSearchParams();
    if (product) params.append('product', product);
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    const f = filterValues;
    if (f.date_from) params.append('date_from', f.date_from);
    if (f.date_to) params.append('date_to', f.date_to);
    if (f.billing_date_from) params.append('billing_date_from', f.billing_date_from);
    if (f.billing_date_to) params.append('billing_date_to', f.billing_date_to);
    if (f.rst_no) params.append('rst_no', f.rst_no);
    if (f.vehicle_no) params.append('vehicle_no', f.vehicle_no);
    if (f.bill_from) params.append('bill_from', f.bill_from);
    if (f.party_name) params.append('party_name', f.party_name);
    if (f.destination) params.append('destination', f.destination);
    return params;
  };

  const hasActiveFilters = Object.values(filterValues).some(v => v);

  // Get oil premium data for a sale entry
  const getOilPremium = (sale) => {
    if (product !== "Rice Bran") return null;
    return oilPremiumMap[sale.voucher_no] || oilPremiumMap[sale.rst_no] || null;
  };
  const isRiceBran = product === "Rice Bran";
  const hasAnyOilPremium = isRiceBran && filtered.some(s => getOilPremium(s));
  const clearFilters = () => setFilterValues({ date_from: "", date_to: "", billing_date_from: "", billing_date_to: "", rst_no: "", vehicle_no: "", bill_from: "", party_name: "", destination: "" });

  const totalAmount = filtered.reduce((s, v) => s + (v.total || 0), 0);
  const totalBalance = filtered.reduce((s, v) => s + (v.balance || 0), 0);

  return (
    <div className="space-y-3" data-testid={`bp-sale-register-${product}`}>
      {/* Stock Summary Card */}
      {stockInfo && (
        <div className="grid grid-cols-4 gap-3">
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
            <p className="text-[10px] text-slate-400 mb-1">Produced (Milling)</p>
            <p className="text-lg font-bold text-green-400">{stockInfo.produced_qntl || 0} <span className="text-xs text-slate-400">Qtl</span></p>
          </CardContent></Card>
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
            <p className="text-[10px] text-slate-400 mb-1">Total Sold</p>
            <p className="text-lg font-bold text-orange-400">{stockInfo.sold_qntl || 0} <span className="text-xs text-slate-400">Qtl</span></p>
          </CardContent></Card>
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
            <p className="text-[10px] text-slate-400 mb-1">Available Stock</p>
            <p className={`text-lg font-bold ${(stockInfo.available_qntl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{stockInfo.available_qntl || 0} <span className="text-xs text-slate-400">Qtl</span></p>
          </CardContent></Card>
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
            <p className="text-[10px] text-slate-400 mb-1">Total Revenue</p>
            <p className="text-lg font-bold text-amber-400">{(stockInfo.total_revenue || 0).toLocaleString()} <span className="text-xs text-slate-400">Rs</span></p>
          </CardContent></Card>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search party, bill, vehicle..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 bg-slate-800 border-slate-600 text-white h-8 text-xs" data-testid="bp-sale-search" />
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-slate-400">{filtered.length} entries | Total: <span className="text-emerald-400 font-bold">{totalAmount.toLocaleString()}</span> | Balance: <span className="text-red-400 font-bold">{totalBalance.toLocaleString()}</span></span>
          <Button onClick={async () => { try { const params = buildExportParams(); const { downloadFile } = await import('../utils/download'); const { buildFilename } = await import('../utils/filename-format'); const fname = buildFilename({ base: `${product || 'byproduct'}_sales`, party: filters.party_name, dateFrom: filters.date_from, dateTo: filters.date_to, kmsYear: filters.kms_year, ext: 'xlsx' }); downloadFile(`/api/bp-sale-register/export/excel?${params}`, fname); toast.success("Excel exported!"); } catch(e) { toast.error("Export failed"); }}}
            variant="outline" size="sm" className="border-slate-600 text-green-400 hover:bg-slate-700 h-7 text-[10px]" data-testid="bp-export-excel">
            <Download className="w-3 h-3 mr-1" /> Excel
          </Button>
          <Button onClick={async () => { try { const params = buildExportParams(); const { downloadFile } = await import('../utils/download'); const { buildFilename } = await import('../utils/filename-format'); const fname = buildFilename({ base: `${product || 'byproduct'}_sales`, party: filters.party_name, dateFrom: filters.date_from, dateTo: filters.date_to, kmsYear: filters.kms_year, ext: 'pdf' }); downloadFile(`/api/bp-sale-register/export/pdf?${params}`, fname); toast.success("PDF exported!"); } catch(e) { toast.error("Export failed"); }}}
            variant="outline" size="sm" className="border-slate-600 text-red-400 hover:bg-slate-700 h-7 text-[10px]" data-testid="bp-export-pdf">
            <Download className="w-3 h-3 mr-1" /> PDF
          </Button>
          <Button onClick={openNew} size="sm" className="bg-amber-500 hover:bg-amber-600 text-slate-900" data-testid="bp-sale-add">
            <Plus className="w-4 h-4 mr-1" /> New Sale
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="space-y-2">
        <Button onClick={() => setShowFilters(p => !p)} variant="ghost" size="sm"
          className={`text-xs ${hasActiveFilters ? 'text-amber-400' : 'text-slate-400'} hover:bg-slate-700`} data-testid="bp-filter-toggle">
          <Filter className="w-3 h-3 mr-1" /> Filters {hasActiveFilters && `(Active)`}
          {hasActiveFilters && <button onClick={(e) => { e.stopPropagation(); clearFilters(); }} className="ml-2 text-red-400 hover:text-red-300 text-[10px]">Clear</button>}
        </Button>
        {showFilters && (
          <div className="grid grid-cols-4 md:grid-cols-6 gap-2 p-2 bg-slate-800/80 rounded border border-slate-700">
            <div>
              <Label className="text-[9px] text-slate-500">Date From</Label>
              <Input type="date" value={filterValues.date_from} onChange={e => setFilterValues(p => ({ ...p, date_from: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white h-7 text-[10px]" />
            </div>
            <div>
              <Label className="text-[9px] text-slate-500">Date To</Label>
              <Input type="date" value={filterValues.date_to} onChange={e => setFilterValues(p => ({ ...p, date_to: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white h-7 text-[10px]" />
            </div>
            <div>
              <Label className="text-[9px] text-slate-500">Bill Date From</Label>
              <Input type="date" value={filterValues.billing_date_from} onChange={e => setFilterValues(p => ({ ...p, billing_date_from: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white h-7 text-[10px]" />
            </div>
            <div>
              <Label className="text-[9px] text-slate-500">Bill Date To</Label>
              <Input type="date" value={filterValues.billing_date_to} onChange={e => setFilterValues(p => ({ ...p, billing_date_to: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white h-7 text-[10px]" />
            </div>
            <div>
              <Label className="text-[9px] text-slate-500">RST No</Label>
              <Input value={filterValues.rst_no} onChange={e => setFilterValues(p => ({ ...p, rst_no: e.target.value }))} placeholder="RST"
                className="bg-slate-700 border-slate-600 text-white h-7 text-[10px]" />
            </div>
            <div>
              <Label className="text-[9px] text-slate-500">Vehicle</Label>
              <Input value={filterValues.vehicle_no} onChange={e => setFilterValues(p => ({ ...p, vehicle_no: e.target.value }))} placeholder="Vehicle"
                className="bg-slate-700 border-slate-600 text-white h-7 text-[10px]" />
            </div>
            <div>
              <Label className="text-[9px] text-slate-500">Bill From</Label>
              <Input value={filterValues.bill_from} onChange={e => setFilterValues(p => ({ ...p, bill_from: e.target.value }))} placeholder="Bill From"
                list="filter-bf" className="bg-slate-700 border-slate-600 text-white h-7 text-[10px]" />
              <datalist id="filter-bf">{billFromSugg.map(s => <option key={s} value={s} />)}</datalist>
            </div>
            <div>
              <Label className="text-[9px] text-slate-500">Party</Label>
              <Input value={filterValues.party_name} onChange={e => setFilterValues(p => ({ ...p, party_name: e.target.value }))} placeholder="Party"
                list="filter-party" className="bg-slate-700 border-slate-600 text-white h-7 text-[10px]" />
              <datalist id="filter-party">{partySugg.map(s => <option key={s} value={s} />)}</datalist>
            </div>
            <div>
              <Label className="text-[9px] text-slate-500">Destination</Label>
              <Input value={filterValues.destination} onChange={e => setFilterValues(p => ({ ...p, destination: e.target.value }))} placeholder="Destination"
                list="filter-dest" className="bg-slate-700 border-slate-600 text-white h-7 text-[10px]" />
              <datalist id="filter-dest">{destSugg.map(s => <option key={s} value={s} />)}</datalist>
            </div>
          </div>
        )}
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[1100px]">
              <TableHeader>
                <TableRow className="border-slate-700 hover:bg-transparent">
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[70px]">Date</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[60px]">Voucher</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[65px]">Bill No</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[70px]">Bill Date</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[45px]">RST</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[85px]">Vehicle</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[90px]">Bill From</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[100px]">Party</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[75px]">Destination</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[60px] text-right">N/W(Kg)</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[40px] text-right">Bags</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[50px] text-right">Rate/Q</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[65px] text-right">Amount</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[65px] text-right">Total</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[65px] text-right">Balance</TableHead>
                  {hasAnyOilPremium && <>
                    <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[45px] text-right">Oil%</TableHead>
                    <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[45px] text-right">Diff%</TableHead>
                    <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[65px] text-right">Premium</TableHead>
                  </>}
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={hasAnyOilPremium ? 19 : 16} className="text-center text-slate-400 py-6">Koi sale nahi</TableCell></TableRow>
                ) : filtered.map(s => (
                  <TableRow key={s.id} className="border-slate-700 hover:bg-slate-700/30">
                    <TableCell className="text-white text-[10px] px-2 whitespace-nowrap">{fmtDate(s.date)}</TableCell>
                    <TableCell className="text-cyan-400 text-[10px] px-2 font-medium">{s.voucher_no}</TableCell>
                    <TableCell className="text-slate-300 text-[10px] px-2 whitespace-nowrap">{s.bill_number}</TableCell>
                    <TableCell className="text-slate-400 text-[10px] px-2 whitespace-nowrap">{fmtDate(s.billing_date)}</TableCell>
                    <TableCell className="text-amber-400 text-[10px] px-2 font-medium">{s.rst_no}</TableCell>
                    <TableCell className="text-slate-300 text-[10px] px-2 whitespace-nowrap">{s.vehicle_no}</TableCell>
                    <TableCell className="text-slate-400 text-[10px] px-2 whitespace-nowrap truncate max-w-[90px]">{s.bill_from}</TableCell>
                    <TableCell className="text-white text-[10px] px-2 font-medium whitespace-nowrap">
                      {s.party_name}
                      {s.split_billing && <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold" title={`Pakka: ${(s.billed_weight_kg||0)}kg · Kaccha: ${(s.kaccha_weight_kg||0)}kg`}>SPLIT</span>}
                    </TableCell>
                    <TableCell className="text-slate-300 text-[10px] px-2 whitespace-nowrap">{s.destination}</TableCell>
                    <TableCell className="text-blue-300 text-[10px] px-2 text-right">{s.net_weight_kg}</TableCell>
                    <TableCell className="text-slate-300 text-[10px] px-2 text-right">{s.bags}</TableCell>
                    <TableCell className="text-slate-300 text-[10px] px-2 text-right">{s.rate_per_qtl}</TableCell>
                    <TableCell className="text-emerald-400 text-[10px] px-2 text-right whitespace-nowrap">{(s.amount || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-emerald-400 text-[10px] px-2 text-right font-bold whitespace-nowrap">{(s.total || 0).toLocaleString()}</TableCell>
                    <TableCell className={`text-[10px] px-2 text-right font-bold whitespace-nowrap ${(s.balance || 0) > 0 ? 'text-red-400' : 'text-green-400'}`}>{(s.balance || 0).toLocaleString()}</TableCell>
                    {hasAnyOilPremium && (() => {
                      const op = getOilPremium(s);
                      return <>
                        <TableCell className="text-white text-[10px] px-2 text-right">{op ? `${op.actual_oil_pct}%` : ''}</TableCell>
                        <TableCell className={`text-[10px] px-2 text-right font-medium ${op ? ((op.difference_pct || 0) >= 0 ? 'text-emerald-400' : 'text-red-400') : ''}`}>
                          {op ? `${(op.difference_pct || 0) > 0 ? '+' : ''}${(op.difference_pct || 0).toFixed(2)}%` : ''}
                        </TableCell>
                        <TableCell className={`text-[10px] px-2 text-right font-bold ${op ? ((op.premium_amount || 0) >= 0 ? 'text-emerald-400' : 'text-red-400') : ''}`}>
                          {op ? (op.premium_amount || 0).toLocaleString() : ''}
                        </TableCell>
                      </>;
                    })()}
                    <TableCell className="px-1">
                      <div className="flex gap-0.5">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-white" onClick={() => setViewSale(s)} data-testid={`bp-view-${s.id}`}><Eye className="w-3 h-3" /></Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-400" onClick={() => openEdit(s)}><Edit className="w-3 h-3" /></Button>
                        {user.role === "admin" && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => handleDelete(s.id)}><Trash2 className="w-3 h-3" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* View Detail Dialog */}
      <Dialog open={!!viewSale} onOpenChange={() => setViewSale(null)}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg" data-testid="bp-sale-view">
          <DialogHeader>
            <DialogTitle className="text-amber-400">{product} Sale Detail</DialogTitle>
          </DialogHeader>
          {viewSale && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {viewSale.voucher_no && <div><span className="text-slate-400 text-xs">Voucher No:</span> <span className="text-cyan-400 font-medium">{viewSale.voucher_no}</span></div>}
                {viewSale.bill_number && <div><span className="text-slate-400 text-xs">Bill No:</span> <span className="text-white font-medium">{viewSale.bill_number}</span></div>}
                {viewSale.billing_date && <div><span className="text-slate-400 text-xs">Billing Date:</span> <span className="text-white">{fmtDate(viewSale.billing_date)}</span></div>}
                {viewSale.date && <div><span className="text-slate-400 text-xs">Date:</span> <span className="text-white">{fmtDate(viewSale.date)}</span></div>}
                {viewSale.rst_no && <div><span className="text-slate-400 text-xs">RST No:</span> <span className="text-amber-400 font-medium">{viewSale.rst_no}</span></div>}
                {viewSale.vehicle_no && <div><span className="text-slate-400 text-xs">Vehicle:</span> <span className="text-white">{viewSale.vehicle_no}</span></div>}
                {viewSale.bill_from && <div><span className="text-slate-400 text-xs">Bill From:</span> <span className="text-white">{viewSale.bill_from}</span></div>}
                {viewSale.party_name && <div><span className="text-slate-400 text-xs">Party:</span> <span className="text-white font-medium">{viewSale.party_name}</span></div>}
                {viewSale.sauda_amount != null && viewSale.sauda_amount !== '' && Number(viewSale.sauda_amount) > 0 && (
                  <div><span className="text-slate-400 text-xs">Sauda Amount:</span> <span className="text-cyan-300 font-medium">₹{Number(viewSale.sauda_amount).toLocaleString('en-IN')}/Qtl</span> <span className="text-slate-500 text-[9px]">(info only)</span></div>
                )}
                {viewSale.destination && <div><span className="text-slate-400 text-xs">Destination:</span> <span className="text-white">{viewSale.destination}</span></div>}
              </div>
              <div className="border-t border-slate-600 pt-2 grid grid-cols-3 gap-x-4 gap-y-2">
                {viewSale.net_weight_kg > 0 && <div><span className="text-slate-400 text-xs">N/W:</span> <span className="text-blue-300 font-medium">{viewSale.net_weight_kg} Kg ({(viewSale.net_weight_qtl || 0).toFixed(2)} Q)</span></div>}
                {viewSale.bags > 0 && <div><span className="text-slate-400 text-xs">Bags:</span> <span className="text-white">{viewSale.bags}</span></div>}
                {viewSale.rate_per_qtl > 0 && <div><span className="text-slate-400 text-xs">Rate/Q:</span> <span className="text-white">{viewSale.rate_per_qtl}</span></div>}
              </div>
              <div className="border-t border-slate-600 pt-2 space-y-1">
                {(() => {
                  const op = getOilPremium(viewSale);
                  const premiumAdj = op && typeof op.premium_amount === 'number' ? op.premium_amount : 0;
                  const baseKaccha = parseFloat(viewSale.kaccha_amount || 0);
                  const effectiveKaccha = +(baseKaccha + premiumAdj).toFixed(2);
                  const baseTotal = parseFloat(viewSale.total || 0);
                  const effectiveTotal = +(baseTotal + premiumAdj).toFixed(2);
                  if (viewSale.split_billing) {
                    return (
                      <>
                        <div className="flex justify-between"><span className="text-emerald-400 text-xs">Pakka ({((viewSale.billed_weight_kg || 0)/100).toFixed(2)} Q × {viewSale.rate_per_qtl})</span><span className="text-emerald-400 font-bold">₹{(viewSale.billed_amount || 0).toLocaleString('en-IN')}</span></div>
                        {viewSale.tax_amount > 0 && <div className="flex justify-between"><span className="text-slate-400 text-xs">GST ({viewSale.gst_percent || 0}% on Pakka)</span><span className="text-orange-400">₹{(viewSale.tax_amount || 0).toLocaleString('en-IN')}</span></div>}
                        <div className="flex justify-between"><span className="text-amber-400 text-xs">Kaccha ({((viewSale.kaccha_weight_kg || 0)/100).toFixed(2)} Q × {viewSale.kaccha_rate_per_qtl || viewSale.rate_per_qtl})</span><span className="text-amber-400 font-bold">₹{baseKaccha.toLocaleString('en-IN')}</span></div>
                        {premiumAdj !== 0 && (
                          <>
                            <div className="flex justify-between"><span className={`text-xs ${premiumAdj < 0 ? 'text-red-400' : 'text-emerald-400'}`}>↳ Lab Test Adj. ({op.bran_type}: {(op.difference_pct||0) > 0 ? '+' : ''}{(op.difference_pct||0).toFixed(2)}%)</span><span className={`font-bold ${premiumAdj < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{premiumAdj > 0 ? '+' : ''}₹{premiumAdj.toLocaleString('en-IN')}</span></div>
                            <div className="flex justify-between border-t border-slate-700 pt-1"><span className="text-amber-300 text-xs font-semibold">Effective Kaccha</span><span className="text-amber-300 font-bold">₹{effectiveKaccha.toLocaleString('en-IN')}</span></div>
                          </>
                        )}
                      </>
                    );
                  }
                  return (
                    <>
                      {viewSale.amount > 0 && <div className="flex justify-between"><span className="text-slate-400">Amount</span><span className="text-emerald-400">{(viewSale.amount || 0).toLocaleString()}</span></div>}
                      {viewSale.tax_amount > 0 && <div className="flex justify-between"><span className="text-slate-400">Tax ({viewSale.gst_percent || 0}%)</span><span className="text-orange-400">{(viewSale.tax_amount || 0).toLocaleString()}</span></div>}
                      {premiumAdj !== 0 && (
                        <div className="flex justify-between"><span className={`text-xs ${premiumAdj < 0 ? 'text-red-400' : 'text-emerald-400'}`}>↳ Lab Test Adj. ({op.bran_type}: {(op.difference_pct||0) > 0 ? '+' : ''}{(op.difference_pct||0).toFixed(2)}%)</span><span className={`font-bold ${premiumAdj < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{premiumAdj > 0 ? '+' : ''}₹{premiumAdj.toLocaleString('en-IN')}</span></div>
                      )}
                    </>
                  );
                })()}
                {(() => {
                  const op = getOilPremium(viewSale);
                  const premiumAdj = op && typeof op.premium_amount === 'number' ? op.premium_amount : 0;
                  const baseTotal = parseFloat(viewSale.total || 0);
                  const effectiveTotal = +(baseTotal + premiumAdj).toFixed(2);
                  if (premiumAdj === 0) {
                    return <div className="flex justify-between font-bold"><span className="text-white">Total</span><span className="text-emerald-400 text-base">{(viewSale.total || 0).toLocaleString()}</span></div>;
                  }
                  return (
                    <>
                      <div className="flex justify-between text-xs"><span className="text-slate-400">Original Total</span><span className="text-slate-300 line-through">₹{baseTotal.toLocaleString('en-IN')}</span></div>
                      <div className="flex justify-between font-bold"><span className="text-white">Effective Total (after Lab Test)</span><span className="text-emerald-400 text-base">₹{effectiveTotal.toLocaleString('en-IN')}</span></div>
                    </>
                  );
                })()}
              </div>
              <div className="border-t border-slate-600 pt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {viewSale.cash_paid > 0 && <div className="flex justify-between"><span className="text-green-400 text-xs">Cash (Truck ko)</span><span className="text-green-300">{(viewSale.cash_paid || 0).toLocaleString()}</span></div>}
                {viewSale.diesel_paid > 0 && <div className="flex justify-between"><span className="text-orange-400 text-xs">Diesel (Pump se)</span><span className="text-orange-300">{(viewSale.diesel_paid || 0).toLocaleString()}</span></div>}
                {viewSale.advance > 0 && <div className="flex justify-between"><span className="text-sky-400 text-xs">Advance (Party se)</span><span className="text-sky-300">{(viewSale.advance || 0).toLocaleString()}</span></div>}
                {(() => {
                  const op = getOilPremium(viewSale);
                  const premiumAdj = op && typeof op.premium_amount === 'number' ? op.premium_amount : 0;
                  const baseBal = parseFloat(viewSale.balance || 0);
                  const effectiveBal = +(baseBal + premiumAdj).toFixed(2);
                  return (
                    <div className="flex justify-between font-bold col-span-2 border-t border-slate-600 pt-1 mt-1">
                      <span className="text-slate-300">Balance (Party par baki)</span>
                      <span className={`text-base ${effectiveBal > 0 ? 'text-red-400' : 'text-green-400'}`}>{effectiveBal.toLocaleString('en-IN')}{premiumAdj !== 0 && <span className="text-[10px] text-slate-500 ml-1">(Lab Test adj.)</span>}</span>
                    </div>
                  );
                })()}
              </div>
              {viewSale.remark && <div className="border-t border-slate-600 pt-2"><span className="text-slate-400 text-xs">Remark:</span> <span className="text-slate-300">{viewSale.remark}</span></div>}
              {(() => { const op = getOilPremium(viewSale); return op ? (
                <div className="border-t border-slate-600 pt-2 space-y-1">
                  <p className="text-[10px] text-amber-400 font-medium mb-1">Oil Premium</p>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                    <div><span className="text-slate-400 text-xs">Type:</span> <span className={op.bran_type === 'Raw' ? 'text-orange-400' : 'text-blue-400'}>{op.bran_type}</span></div>
                    <div><span className="text-slate-400 text-xs">Standard:</span> <span className="text-slate-300">{op.standard_oil_pct}%</span></div>
                    <div><span className="text-slate-400 text-xs">Actual:</span> <span className="text-white font-bold">{op.actual_oil_pct}%</span></div>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-slate-400 text-xs">Diff: <span className={`font-bold ${(op.difference_pct||0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(op.difference_pct||0) > 0 ? '+' : ''}{(op.difference_pct||0).toFixed(2)}%</span></span>
                    <span className={`text-base font-bold ${(op.premium_amount||0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>Rs. {(op.premium_amount||0).toLocaleString()}</span>
                  </div>
                </div>
              ) : null; })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sale Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="bp-sale-form">
          <DialogHeader>
            <DialogTitle className="text-amber-400">{editingId ? "Edit" : "New"} {product} Sale</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-4 gap-3">
              <div>
                <Label className="text-[10px] text-slate-400">Voucher No</Label>
                <Input value={form.voucher_no} onChange={e => setForm(p => ({ ...p, voucher_no: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="bp-voucher-no" />
              </div>
              <div>
                <Label className="text-[10px] text-slate-400">Bill Number</Label>
                <Input value={form.bill_number} onChange={e => setForm(p => ({ ...p, bill_number: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="bp-bill-number" />
              </div>
              <div>
                <Label className="text-[10px] text-slate-400">Billing Date</Label>
                <Input type="date" value={form.billing_date} onChange={e => setForm(p => ({ ...p, billing_date: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="bp-billing-date" />
              </div>
              <div>
                <Label className="text-[10px] text-slate-400">Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-xs" required data-testid="bp-date" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-[10px] text-slate-400">RST Number {rstLoading && <span className="text-amber-400">(loading...)</span>}</Label>
                <Input value={form.rst_no} onChange={e => setForm(p => ({ ...p, rst_no: e.target.value }))}
                  onBlur={() => { if (form.rst_no) fetchRst(form.rst_no); }}
                  placeholder="RST se auto-fetch" className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="bp-rst" />
              </div>
              <div>
                <Label className="text-[10px] text-slate-400">Vehicle Number</Label>
                <Input value={form.vehicle_no} onChange={e => setForm(p => ({ ...p, vehicle_no: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="bp-vehicle" />
              </div>
              <div>
                <Label className="text-[10px] text-slate-400">Bill From</Label>
                <Input value={form.bill_from} onChange={e => setForm(p => ({ ...p, bill_from: e.target.value }))}
                  list="bill-from-list" className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="bp-bill-from" />
                <datalist id="bill-from-list">{billFromSugg.map(s => <option key={s} value={s} />)}</datalist>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] text-slate-400">Party Name *</Label>
                <Input value={form.party_name} onChange={e => setForm(p => ({ ...p, party_name: e.target.value }))}
                  list="party-list" className="bg-slate-700 border-slate-600 text-white h-8 text-xs" required data-testid="bp-party" />
                <datalist id="party-list">{partySugg.map(s => <option key={s} value={s} />)}</datalist>
              </div>
              <div>
                <Label className="text-[10px] text-slate-400">Destination</Label>
                <Input value={form.destination} onChange={e => setForm(p => ({ ...p, destination: e.target.value }))}
                  list="dest-list" className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="bp-dest" />
                <datalist id="dest-list">{destSugg.map(s => <option key={s} value={s} />)}</datalist>
              </div>
            </div>

            {/* Split billing toggle */}
            <div className="flex items-center justify-between p-2 rounded border border-slate-600 bg-slate-700/40">
              <div className="flex-1">
                <Label className="text-[11px] text-slate-200 font-medium flex items-center gap-2">
                  <input type="checkbox" checked={!!form.split_billing}
                    onChange={e => setForm(p => ({ ...p, split_billing: e.target.checked }))}
                    className="w-4 h-4 accent-amber-500" data-testid="bp-split-toggle" />
                  Split Billing (Pakka + Kaccha)
                </Label>
                <p className="text-[10px] text-slate-500 ml-6">Ek dispatch mein kuch maal bill pe, kuch slip pe — GST sirf billed portion pe lagega</p>
              </div>
            </div>

            {!isSplit && (
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <Label className="text-[10px] text-slate-400">N/W (Qtl) {stockInfo && <span className={`font-bold ${(effectiveAvailQtl - nwQtl) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>(Stock: {Math.round((effectiveAvailQtl - nwQtl) * 100) / 100} Qtl)</span>}</Label>
                  <Input type="number" step="0.01"
                    value={form.net_weight_qtl_display ?? (form.net_weight_kg ? String(Math.round((parseFloat(form.net_weight_kg) || 0) / 100 * 100) / 100) : "")}
                    onChange={e => {
                      const qtl = e.target.value;
                      setForm(p => ({ ...p, net_weight_qtl_display: qtl, net_weight_kg: qtl === "" ? "" : String(Math.round((parseFloat(qtl) || 0) * 100 * 100) / 100) }));
                    }}
                    className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="bp-nw-qtl" />
                  {stockInfo && nwQtl > effectiveAvailQtl && <p className="text-red-400 text-[9px] mt-0.5">Stock se zyada!</p>}
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400">N/W (Kg) <span className="text-slate-500 text-[9px]">(auto)</span></Label>
                  <Input type="number" step="0.01" value={form.net_weight_kg}
                    readOnly tabIndex={-1}
                    className="bg-slate-800 border-slate-700 text-slate-300 h-8 text-xs cursor-not-allowed" data-testid="bp-nw" />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400">Bags</Label>
                  <Input type="number" value={form.bags} onChange={e => setForm(p => ({ ...p, bags: e.target.value }))}
                    className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="bp-bags" />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400">Rate (per Qtl)</Label>
                  <Input type="number" step="0.01" value={form.rate_per_qtl}
                    onChange={e => setForm(p => ({ ...p, rate_per_qtl: e.target.value }))}
                    className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="bp-rate" />
                </div>
              </div>
            )}

            {isSplit && (
              <div className="space-y-2">
                {/* TOTAL N/W (top of split section) — RST se ya manual fill */}
                <div className="grid grid-cols-2 gap-3 p-2 rounded bg-blue-900/20 border border-blue-500/30">
                  <div>
                    <Label className="text-[10px] text-blue-300 font-bold uppercase tracking-wider">Total N/W (Qtl) {stockInfo && <span className={`font-bold ${(effectiveAvailQtl - totalSplitQtl) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>(Stock: {Math.round((effectiveAvailQtl - totalSplitQtl) * 100) / 100} Qtl)</span>}</Label>
                    <Input type="number" step="0.01"
                      value={form.net_weight_qtl_display ?? (form.net_weight_kg ? String(Math.round((parseFloat(form.net_weight_kg) || 0) / 100 * 100) / 100) : "")}
                      onChange={e => {
                        const qtl = e.target.value;
                        const newTotalKg = qtl === "" ? "" : String(Math.round((parseFloat(qtl) || 0) * 100 * 100) / 100);
                        const newTotalQtl = parseFloat(qtl) || 0;
                        // If Pakka already set, recalc Kaccha = Total - Pakka. Else keep current.
                        const curPakkaQtl = parseFloat(form.billed_weight_qtl_display) || 0;
                        let newKacchaQtl = curPakkaQtl > 0 ? Math.max(0, Math.round((newTotalQtl - curPakkaQtl) * 100) / 100) : 0;
                        setForm(p => ({
                          ...p,
                          net_weight_qtl_display: qtl,
                          net_weight_kg: newTotalKg,
                          kaccha_weight_qtl_display: curPakkaQtl > 0 ? String(newKacchaQtl) : p.kaccha_weight_qtl_display,
                          kaccha_weight_kg: curPakkaQtl > 0 ? String(Math.round(newKacchaQtl * 100 * 100) / 100) : p.kaccha_weight_kg,
                        }));
                      }}
                      className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="bp-split-total-qtl" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-blue-300 font-bold uppercase tracking-wider">Total N/W (Kg) <span className="text-slate-500 text-[9px]">(auto)</span></Label>
                    <Input type="number" step="0.01" value={form.net_weight_kg}
                      readOnly tabIndex={-1}
                      className="bg-slate-800 border-slate-700 text-slate-300 h-8 text-xs cursor-not-allowed" data-testid="bp-split-total-kg" />
                  </div>
                </div>

                {/* PAKKA */}
                <div className="grid grid-cols-5 gap-3 p-2 rounded bg-emerald-900/20 border border-emerald-500/30">
                  <div className="col-span-5">
                    <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Pakka (GST Bill)</p>
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-400">Pakka Wt (Qtl)</Label>
                    <Input type="number" step="0.01"
                      value={form.billed_weight_qtl_display}
                      onChange={e => {
                        const pq = e.target.value;
                        const pakkaQtl = parseFloat(pq) || 0;
                        const totalQtl = parseFloat(form.net_weight_qtl_display) || (parseFloat(form.net_weight_kg) || 0) / 100;
                        // Auto-balance: Kaccha = Total - Pakka
                        const kacchaQ = Math.max(0, Math.round((totalQtl - pakkaQtl) * 100) / 100);
                        setForm(p => ({
                          ...p,
                          billed_weight_qtl_display: pq,
                          billed_weight_kg: pq === "" ? "" : String(Math.round(pakkaQtl * 100 * 100) / 100),
                          kaccha_weight_qtl_display: totalQtl > 0 ? String(kacchaQ) : p.kaccha_weight_qtl_display,
                          kaccha_weight_kg: totalQtl > 0 ? String(Math.round(kacchaQ * 100 * 100) / 100) : p.kaccha_weight_kg,
                        }));
                      }}
                      className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="bp-billed-qtl" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-400">Pakka Wt (Kg) <span className="text-slate-500 text-[9px]">(auto)</span></Label>
                    <Input type="number" step="0.01" value={form.billed_weight_kg}
                      readOnly tabIndex={-1}
                      className="bg-slate-800 border-slate-700 text-slate-300 h-8 text-xs cursor-not-allowed" data-testid="bp-billed-kg" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-400">Rate (per Qtl)</Label>
                    <Input type="number" step="0.01" value={form.rate_per_qtl}
                      onChange={e => setForm(p => ({ ...p, rate_per_qtl: e.target.value }))}
                      className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="bp-rate" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] text-slate-400">Pakka Amount</Label>
                    <div className="h-8 px-2 rounded bg-slate-900/60 border border-slate-700 flex items-center text-xs text-emerald-300 font-mono" data-testid="bp-billed-amount">
                      ₹{billedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                {/* KACCHA */}
                <div className="grid grid-cols-5 gap-3 p-2 rounded bg-amber-900/20 border border-amber-500/30">
                  <div className="col-span-5">
                    <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Kaccha (Slip — No GST)</p>
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-400">Kaccha Wt (Qtl)</Label>
                    <Input type="number" step="0.01"
                      value={form.kaccha_weight_qtl_display}
                      onChange={e => {
                        const kq = e.target.value;
                        const kacchaQ = parseFloat(kq) || 0;
                        const totalQtl = parseFloat(form.net_weight_qtl_display) || (parseFloat(form.net_weight_kg) || 0) / 100;
                        // Auto-balance: Pakka = Total - Kaccha
                        const pakkaQ = Math.max(0, Math.round((totalQtl - kacchaQ) * 100) / 100);
                        setForm(p => ({
                          ...p,
                          kaccha_weight_qtl_display: kq,
                          kaccha_weight_kg: kq === "" ? "" : String(Math.round(kacchaQ * 100 * 100) / 100),
                          billed_weight_qtl_display: totalQtl > 0 ? String(pakkaQ) : p.billed_weight_qtl_display,
                          billed_weight_kg: totalQtl > 0 ? String(Math.round(pakkaQ * 100 * 100) / 100) : p.billed_weight_kg,
                        }));
                      }}
                      className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="bp-kaccha-qtl" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-400">Kaccha Wt (Kg) <span className="text-slate-500 text-[9px]">(auto)</span></Label>
                    <Input type="number" step="0.01" value={form.kaccha_weight_kg}
                      readOnly tabIndex={-1}
                      className="bg-slate-800 border-slate-700 text-slate-300 h-8 text-xs cursor-not-allowed" data-testid="bp-kaccha-kg" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-400">Rate (per Qtl)</Label>
                    <Input type="number" step="0.01" value={form.kaccha_rate_per_qtl}
                      onChange={e => setForm(p => ({ ...p, kaccha_rate_per_qtl: e.target.value }))}
                      placeholder={rate ? String(rate) : "Same as Pakka"}
                      className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="bp-kaccha-rate" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-400">Bags (total)</Label>
                    <Input type="number" value={form.bags} onChange={e => setForm(p => ({ ...p, bags: e.target.value }))}
                      className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="bp-bags" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-400">Kaccha Amount</Label>
                    <div className="h-8 px-2 rounded bg-slate-900/60 border border-slate-700 flex items-center text-xs text-amber-300 font-mono" data-testid="bp-kaccha-amount">
                      ₹{kacchaAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                {/* Mismatch warning */}
                {totalSplitQtl > 0 && Math.abs((billedQtl + kacchaQtl) - totalSplitQtl) > 0.01 && (
                  <p className="text-amber-400 text-[10px] text-right">
                    ⚠ Pakka + Kaccha = {(billedQtl + kacchaQtl).toFixed(2)} Q, Total N/W = {totalSplitQtl.toFixed(2)} Q (mismatch)
                  </p>
                )}

                <div className="flex items-center justify-between px-2 py-1.5 rounded bg-slate-700/50 text-[11px]">
                  <span className="text-slate-400">Total Physical Dispatch:</span>
                  <span className={`font-bold ${stockInfo && totalSplitQtl > effectiveAvailQtl ? 'text-red-400' : 'text-blue-300'}`}>
                    {totalSplitKg.toFixed(2)} Kg = {totalSplitQtl.toFixed(2)} Qtl
                    {stockInfo && <span className="text-slate-500 ml-2">(Stock: {Math.round((effectiveAvailQtl - totalSplitQtl) * 100) / 100} Qtl remaining)</span>}
                  </span>
                </div>
                {stockInfo && totalSplitQtl > effectiveAvailQtl && <p className="text-red-400 text-[10px] text-right">⚠ Physical dispatch stock se zyada hai</p>}
              </div>
            )}

            {/* Amount preview */}
            {total > 0 && (
              <div className="bg-slate-700/50 rounded p-2 text-xs space-y-1">
                {isSplit ? (
                  <>
                    <div className="flex justify-between"><span className="text-slate-400">Pakka Amount ({billedQtl.toFixed(2)} Q × {rate})</span><span className="text-emerald-400 font-bold">₹{billedAmount.toLocaleString('en-IN')}</span></div>
                    {taxAmt > 0 && <div className="flex justify-between"><span className="text-slate-400">GST ({gstPct}% on Pakka)</span><span className="text-orange-400">₹{taxAmt.toLocaleString('en-IN')}</span></div>}
                    <div className="flex justify-between"><span className="text-slate-400">Kaccha Amount ({kacchaQtl.toFixed(2)} Q × {kacchaRate})</span><span className="text-amber-400 font-bold">₹{kacchaAmount.toLocaleString('en-IN')}</span></div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between"><span className="text-slate-400">Amount ({nwQtl.toFixed(2)} Q × {rate})</span><span className="text-emerald-400 font-bold">₹{amount.toLocaleString('en-IN')}</span></div>
                    {taxAmt > 0 && <div className="flex justify-between"><span className="text-slate-400">Tax ({gstPct}%)</span><span className="text-orange-400">₹{taxAmt.toLocaleString('en-IN')}</span></div>}
                  </>
                )}
                <div className="flex justify-between border-t border-slate-600 pt-1"><span className="text-white font-bold">Total Receivable</span><span className="text-emerald-400 font-bold text-sm">₹{total.toLocaleString('en-IN')}</span></div>
              </div>
            )}

            {/* GST + Sauda Amount (info-only) */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-[10px] text-slate-400">Tax</Label>
                <Select value={form.gst_type} onValueChange={v => setForm(p => ({ ...p, gst_type: v, gst_percent: v === "none" ? "" : "5" }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Tax</SelectItem>
                    <SelectItem value="gst">GST</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.gst_type !== "none" ? (
                <div>
                  <Label className="text-[10px] text-slate-400">GST %</Label>
                  <Select value={form.gst_percent || "5"} onValueChange={v => setForm(p => ({ ...p, gst_percent: v }))}>
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{[5, 12, 18, 28].map(g => <SelectItem key={g} value={String(g)}>{g}%</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : <div />}
              <div>
                <Label className="text-[10px] text-slate-400" title="Sirf jaankari ke liye — kisi calculation mein use nahi hota">
                  Sauda Amount (per Qtl) <span className="text-slate-500 text-[9px]">(info only)</span>
                </Label>
                <Input type="number" step="0.01" value={form.sauda_amount}
                  onChange={e => setForm(p => ({ ...p, sauda_amount: e.target.value }))}
                  placeholder="e.g. 3700"
                  className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="bp-sauda-amount" />
              </div>
            </div>

            {/* Payment section */}
            <div className="border-t border-slate-600 pt-3">
              <p className="text-[10px] text-amber-400 font-medium mb-2">Payment Details</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-[10px] text-amber-400 font-semibold">Bhada / भाड़ा (Lumpsum)</Label>
                  <Input type="number" step="0.01" value={form.bhada}
                    onChange={e => setForm(p => ({ ...p, bhada: e.target.value }))}
                    placeholder="Truck bhada (e.g. 4000)"
                    className="bg-amber-900/20 border-amber-700 text-amber-200 h-8 text-xs font-bold" data-testid="bp-bhada" />
                  <p className="text-[9px] text-slate-500 mt-0.5">Truck owner ko diya jaane wala lump-sum freight</p>
                </div>
                <div>
                  <Label className="text-[10px] text-sky-400">Advance (Party se)</Label>
                  <Input type="number" value={form.advance} onChange={e => setForm(p => ({ ...p, advance: e.target.value }))}
                    placeholder="0" className="bg-sky-900/20 border-sky-700 text-sky-300 h-8 text-xs" data-testid="bp-advance" />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400">Balance (Party par baki)</Label>
                  <div className={`h-8 flex items-center px-2 rounded border text-xs font-bold ${balance > 0 ? 'bg-red-900/20 border-red-700 text-red-400' : 'bg-green-900/20 border-green-700 text-green-400'}`}>
                    Rs.{balance.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <Label className="text-[10px] text-slate-400">Remark</Label>
              <Input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))}
                placeholder="Optional" className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="bp-remark" />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-slate-900 flex-1" data-testid="bp-sale-submit">
                {editingId ? "Update" : "Save Sale"}
              </Button>
              <Button type="button" variant="outline" className="border-slate-600 text-slate-300" onClick={() => setIsFormOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
