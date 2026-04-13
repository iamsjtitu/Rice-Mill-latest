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
import { Plus, Trash2, Edit, Search, Download } from "lucide-react";
import { fmtDate } from "@/utils/date";
import { useConfirm } from "./ConfirmProvider";
import logger from "../utils/logger";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const API = `${_isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '')}/api`;

export default function ByProductSaleRegister({ filters, user, product }) {
  const showConfirm = useConfirm();
  const [sales, setSales] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [billFromSugg, setBillFromSugg] = useState([]);
  const [partySugg, setPartySugg] = useState([]);
  const [destSugg, setDestSugg] = useState([]);
  const [rstLoading, setRstLoading] = useState(false);

  const blankForm = {
    bill_number: "", billing_date: new Date().toISOString().split("T")[0],
    date: new Date().toISOString().split("T")[0], rst_no: "", vehicle_no: "",
    bill_from: "", party_name: "", destination: "",
    net_weight_kg: "", bags: "", rate_per_qtl: "",
    gst_type: "none", gst_percent: "",
    cash_paid: "", diesel_paid: "", advance: "", remark: "",
    product, kms_year: filters.kms_year || "", season: filters.season || "",
  };
  const [form, setForm] = useState(blankForm);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (product) params.append("product", product);
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      if (filters.season) params.append("season", filters.season);
      const [salesRes, bfRes, pRes, dRes] = await Promise.all([
        axios.get(`${API}/bp-sale-register?${params}`),
        axios.get(`${API}/bp-sale-register/suggestions/bill-from`),
        axios.get(`${API}/bp-sale-register/suggestions/party-name`),
        axios.get(`${API}/bp-sale-register/suggestions/destination`),
      ]);
      setSales(salesRes.data);
      setBillFromSugg(bfRes.data || []);
      setPartySugg(pRes.data || []);
      setDestSugg(dRes.data || []);
    } catch (e) { logger.error(e); }
  }, [product, filters.kms_year, filters.season]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // RST auto-fetch from Vehicle Weight
  const fetchRst = async (rstNo) => {
    if (!rstNo) return;
    setRstLoading(true);
    try {
      const res = await axios.get(`${API}/vehicle-weight/by-rst/${rstNo}?kms_year=${filters.kms_year || ""}`);
      if (res.data?.entry) {
        const e = res.data.entry;
        setForm(p => ({
          ...p,
          vehicle_no: e.vehicle_no || p.vehicle_no,
          party_name: e.party_name || p.party_name,
          destination: e.farmer_name || p.destination,
          net_weight_kg: e.net_weight ? String(e.net_weight) : p.net_weight_kg,
          bags: e.tot_pkts ? String(e.tot_pkts) : p.bags,
        }));
        toast.success("RST data fetch ho gaya!");
      }
    } catch (e) {
      if (e.response?.status === 404) toast.error("RST not found");
      else logger.error(e);
    } finally { setRstLoading(false); }
  };

  // Calculations
  const nwKg = parseFloat(form.net_weight_kg) || 0;
  const nwQtl = nwKg / 100;
  const rate = parseFloat(form.rate_per_qtl) || 0;
  const amount = Math.round(nwQtl * rate * 100) / 100;
  const gstPct = form.gst_type !== "none" ? (parseFloat(form.gst_percent) || 0) : 0;
  const taxAmt = Math.round(amount * gstPct / 100 * 100) / 100;
  const total = Math.round((amount + taxAmt) * 100) / 100;
  const cash = parseFloat(form.cash_paid) || 0;
  const diesel = parseFloat(form.diesel_paid) || 0;
  const advance = parseFloat(form.advance) || 0;
  const balance = Math.round((total - cash - diesel - advance) * 100) / 100;

  const openNew = () => {
    setEditingId(null);
    setForm({ ...blankForm, product, kms_year: filters.kms_year || "", season: filters.season || "" });
    setIsFormOpen(true);
  };

  const openEdit = (s) => {
    setEditingId(s.id);
    setForm({
      bill_number: s.bill_number || "", billing_date: s.billing_date || "", date: s.date || "",
      rst_no: s.rst_no || "", vehicle_no: s.vehicle_no || "",
      bill_from: s.bill_from || "", party_name: s.party_name || "", destination: s.destination || "",
      net_weight_kg: s.net_weight_kg ? String(s.net_weight_kg) : "",
      bags: s.bags ? String(s.bags) : "", rate_per_qtl: s.rate_per_qtl ? String(s.rate_per_qtl) : "",
      gst_type: s.gst_type || "none", gst_percent: s.gst_percent ? String(s.gst_percent) : "",
      cash_paid: s.cash_paid ? String(s.cash_paid) : "", diesel_paid: s.diesel_paid ? String(s.diesel_paid) : "",
      advance: s.advance ? String(s.advance) : "", remark: s.remark || "",
      product: s.product || product, kms_year: s.kms_year || "", season: s.season || "",
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.party_name?.trim()) { toast.error("Party Name daalen"); return; }
    try {
      const payload = { ...form, net_weight_kg: nwKg, rate_per_qtl: rate, bags: parseInt(form.bags) || 0 };
      if (editingId) {
        await axios.put(`${API}/bp-sale-register/${editingId}?username=${user.username}&role=${user.role}`, payload);
        toast.success("Updated!");
      } else {
        await axios.post(`${API}/bp-sale-register?username=${user.username}&role=${user.role}`, payload);
        toast.success("Sale saved!");
      }
      setIsFormOpen(false); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleDelete = async (id) => {
    if (!await showConfirm("Delete", "Delete karna chahte hain?")) return;
    try { await axios.delete(`${API}/bp-sale-register/${id}`); toast.success("Deleted!"); fetchData(); } catch (e) { toast.error("Error"); }
  };

  const filtered = searchQuery
    ? sales.filter(s => (s.party_name || "").toLowerCase().includes(searchQuery.toLowerCase()) || (s.bill_number || "").toLowerCase().includes(searchQuery.toLowerCase()) || (s.vehicle_no || "").toLowerCase().includes(searchQuery.toLowerCase()))
    : sales;

  const totalAmount = filtered.reduce((s, v) => s + (v.total || 0), 0);
  const totalBalance = filtered.reduce((s, v) => s + (v.balance || 0), 0);

  return (
    <div className="space-y-3" data-testid={`bp-sale-register-${product}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search party, bill, vehicle..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 bg-slate-800 border-slate-600 text-white h-8 text-xs" data-testid="bp-sale-search" />
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-slate-400">{filtered.length} entries | Total: <span className="text-emerald-400 font-bold">{totalAmount.toLocaleString()}</span> | Balance: <span className="text-red-400 font-bold">{totalBalance.toLocaleString()}</span></span>
          <Button onClick={async () => { try { const params = new URLSearchParams(); if (product) params.append('product', product); if (filters.kms_year) params.append('kms_year', filters.kms_year); if (filters.season) params.append('season', filters.season); const { downloadFile } = await import('../utils/download'); downloadFile(`/api/bp-sale-register/export/excel?${params}`, `${product || 'byproduct'}_sales.xlsx`); toast.success("Excel exported!"); } catch(e) { toast.error("Export failed"); }}}
            variant="outline" size="sm" className="border-slate-600 text-green-400 hover:bg-slate-700 h-7 text-[10px]" data-testid="bp-export-excel">
            <Download className="w-3 h-3 mr-1" /> Excel
          </Button>
          <Button onClick={async () => { try { const params = new URLSearchParams(); if (product) params.append('product', product); if (filters.kms_year) params.append('kms_year', filters.kms_year); if (filters.season) params.append('season', filters.season); const { downloadFile } = await import('../utils/download'); downloadFile(`/api/bp-sale-register/export/pdf?${params}`, `${product || 'byproduct'}_sales.pdf`); toast.success("PDF exported!"); } catch(e) { toast.error("Export failed"); }}}
            variant="outline" size="sm" className="border-slate-600 text-red-400 hover:bg-slate-700 h-7 text-[10px]" data-testid="bp-export-pdf">
            <Download className="w-3 h-3 mr-1" /> PDF
          </Button>
          <Button onClick={openNew} size="sm" className="bg-amber-500 hover:bg-amber-600 text-slate-900" data-testid="bp-sale-add">
            <Plus className="w-4 h-4 mr-1" /> New Sale
          </Button>
        </div>
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[1200px]">
              <TableHeader>
                <TableRow className="border-slate-700 hover:bg-transparent">
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[75px]">Date</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[70px]">Bill No</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[50px]">RST</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[90px]">Vehicle</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[100px]">Party</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[80px]">Destination</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[65px] text-right">N/W(Kg)</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[45px] text-right">Bags</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[55px] text-right">Rate/Q</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[70px] text-right">Amount</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[45px] text-right">Tax</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[70px] text-right">Total</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[50px] text-right">Cash</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[50px] text-right">Diesel</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[45px] text-right">Adv</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[65px] text-right">Balance</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={17} className="text-center text-slate-400 py-6">Koi sale nahi</TableCell></TableRow>
                ) : filtered.map(s => (
                  <TableRow key={s.id} className="border-slate-700 hover:bg-slate-700/30">
                    <TableCell className="text-white text-[10px] px-2 whitespace-nowrap">{fmtDate(s.date)}</TableCell>
                    <TableCell className="text-slate-300 text-[10px] px-2 whitespace-nowrap">{s.bill_number}</TableCell>
                    <TableCell className="text-amber-400 text-[10px] px-2 font-medium">{s.rst_no}</TableCell>
                    <TableCell className="text-slate-300 text-[10px] px-2 whitespace-nowrap">{s.vehicle_no}</TableCell>
                    <TableCell className="text-white text-[10px] px-2 font-medium whitespace-nowrap">{s.party_name}</TableCell>
                    <TableCell className="text-slate-300 text-[10px] px-2 whitespace-nowrap">{s.destination}</TableCell>
                    <TableCell className="text-blue-300 text-[10px] px-2 text-right">{s.net_weight_kg}</TableCell>
                    <TableCell className="text-slate-300 text-[10px] px-2 text-right">{s.bags}</TableCell>
                    <TableCell className="text-slate-300 text-[10px] px-2 text-right">{s.rate_per_qtl}</TableCell>
                    <TableCell className="text-emerald-400 text-[10px] px-2 text-right whitespace-nowrap">{(s.amount || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-orange-300 text-[10px] px-2 text-right">{(s.tax_amount || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-emerald-400 text-[10px] px-2 text-right font-bold whitespace-nowrap">{(s.total || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-green-300 text-[10px] px-2 text-right">{s.cash_paid || 0}</TableCell>
                    <TableCell className="text-orange-300 text-[10px] px-2 text-right">{s.diesel_paid || 0}</TableCell>
                    <TableCell className="text-sky-300 text-[10px] px-2 text-right">{s.advance || 0}</TableCell>
                    <TableCell className={`text-[10px] px-2 text-right font-bold whitespace-nowrap ${(s.balance || 0) > 0 ? 'text-red-400' : 'text-green-400'}`}>{(s.balance || 0).toLocaleString()}</TableCell>
                    <TableCell className="px-1">
                      <div className="flex gap-0.5">
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

      {/* Sale Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="bp-sale-form">
          <DialogHeader>
            <DialogTitle className="text-amber-400">{editingId ? "Edit" : "New"} {product} Sale</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
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

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-[10px] text-slate-400">N/W (Kg)</Label>
                <Input type="number" step="0.01" value={form.net_weight_kg}
                  onChange={e => setForm(p => ({ ...p, net_weight_kg: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="bp-nw" />
                {nwKg > 0 && <p className="text-[9px] text-slate-500 mt-0.5">= {nwQtl.toFixed(2)} Qtl</p>}
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

            {/* Amount preview */}
            {amount > 0 && (
              <div className="bg-slate-700/50 rounded p-2 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-slate-400">Amount ({nwQtl.toFixed(2)} Q x {rate})</span><span className="text-emerald-400 font-bold">{amount.toLocaleString()}</span></div>
                {taxAmt > 0 && <div className="flex justify-between"><span className="text-slate-400">Tax ({gstPct}%)</span><span className="text-orange-400">{taxAmt.toLocaleString()}</span></div>}
                <div className="flex justify-between border-t border-slate-600 pt-1"><span className="text-white font-bold">Total</span><span className="text-emerald-400 font-bold text-sm">{total.toLocaleString()}</span></div>
              </div>
            )}

            {/* GST */}
            <div className="grid grid-cols-2 gap-3">
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
              {form.gst_type !== "none" && (
                <div>
                  <Label className="text-[10px] text-slate-400">GST %</Label>
                  <Select value={form.gst_percent || "5"} onValueChange={v => setForm(p => ({ ...p, gst_percent: v }))}>
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{[5, 12, 18, 28].map(g => <SelectItem key={g} value={String(g)}>{g}%</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Payment section */}
            <div className="border-t border-slate-600 pt-3">
              <p className="text-[10px] text-amber-400 font-medium mb-2">Payment Details</p>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <Label className="text-[10px] text-green-400">Cash (Truck ko)</Label>
                  <Input type="number" value={form.cash_paid} onChange={e => setForm(p => ({ ...p, cash_paid: e.target.value }))}
                    placeholder="0" className="bg-green-900/20 border-green-700 text-green-300 h-8 text-xs" data-testid="bp-cash" />
                </div>
                <div>
                  <Label className="text-[10px] text-orange-400">Diesel (Pump se)</Label>
                  <Input type="number" value={form.diesel_paid} onChange={e => setForm(p => ({ ...p, diesel_paid: e.target.value }))}
                    placeholder="0" className="bg-orange-900/20 border-orange-700 text-orange-300 h-8 text-xs" data-testid="bp-diesel" />
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
