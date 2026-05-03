import React, { useState, useEffect, useCallback } from "react";
import { commercialRound } from "../utils/roundOff";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Edit, Search, Download, Eye, Filter, FileSpreadsheet, FileText, Users } from "lucide-react";
import { fmtDate } from "@/utils/date";
import { useConfirm } from "./ConfirmProvider";
import { useRstCheck } from "../hooks/useRstCheck";
import { useCloseFiltersOnEsc } from "../utils/useCloseFiltersOnEsc";
import { updateVwBhada } from "../utils/vw-bhada";
import { SendToGroupDialog } from "./SendToGroupDialog";
import logger from "../utils/logger";
import PartyWeightRegister from "./PartyWeightRegister";

const WhatsAppIcon = ({ className = "w-3.5 h-3.5" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M20.52 3.48A11.77 11.77 0 0 0 12.02 0C5.46 0 .12 5.33.12 11.9a11.8 11.8 0 0 0 1.6 5.95L0 24l6.3-1.65a11.88 11.88 0 0 0 5.72 1.46h.01c6.56 0 11.9-5.33 11.9-11.9a11.76 11.76 0 0 0-3.41-8.43zM12.03 21.8h-.01a9.88 9.88 0 0 1-5.04-1.38l-.36-.21-3.74.98 1-3.64-.23-.37a9.85 9.85 0 0 1-1.52-5.28c0-5.47 4.45-9.9 9.9-9.9 2.65 0 5.14 1.03 7.01 2.9a9.87 9.87 0 0 1 2.9 7.02c0 5.46-4.45 9.9-9.91 9.9zm5.43-7.41c-.3-.15-1.76-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.76.97-.93 1.17-.17.2-.34.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.47.13-.62.13-.13.3-.34.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.47 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.26.48 1.69.62.71.22 1.35.19 1.86.12.57-.08 1.76-.72 2-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z"/>
  </svg>
);

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const API = `${_isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '')}/api`;

export default function ByProductSaleRegister({ filters, user, product }) {
  const showConfirm = useConfirm();
  const [sales, setSales] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [originalRst, setOriginalRst] = useState("");
  const { checkRst, clear: clearRstCheck, RstWarning, buildBlockerMessage: buildRstMsg } = useRstCheck({ context: "sale", excludeId: editingId });
  const [searchQuery, setSearchQuery] = useState("");
  const [viewSale, setViewSale] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  useCloseFiltersOnEsc(setShowFilters);
  const [filterValues, setFilterValues] = useState({ date_from: "", date_to: "", billing_date_from: "", billing_date_to: "", rst_no: "", vehicle_no: "", bill_from: "", party_name: "", destination: "" });
  const [billFromSugg, setBillFromSugg] = useState([]);
  const [partySugg, setPartySugg] = useState([]);
  // v104.44.39 — Send to Group dialog state
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupText, setGroupText] = useState("");
  const [groupPdfUrl, setGroupPdfUrl] = useState("");
  // v104.44.42 — Sub-tab filter: ALL | PKA | KCA
  const [gstFilter, setGstFilter] = useState("ALL");
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
    // v104.44.71 — Bag type (stock deduct) + Bran-only weight cut per bag
    bag_type: "", bag_weight_cut_g: product === "Rice Bran" ? "200" : "0",
    // Split billing (Pakka + Kaccha single dispatch)
    split_billing: false, billed_weight_kg: "", kaccha_weight_kg: "", kaccha_rate_per_qtl: "",
    // Helper Qtl displays for split mode (auto-synced with kg)
    billed_weight_qtl_display: "", kaccha_weight_qtl_display: "",
    cash_paid: "", diesel_paid: "", bhada: "", advance: "", remark: "",
    product, kms_year: filters.kms_year || "", season: filters.season || "",
  };
  const [form, setForm] = useState(blankForm);
  const [stockInfo, setStockInfo] = useState(null);
  // v104.44.71 — Bag stock aggregated per bag_type (from gunny_bags collection)
  const [bagStock, setBagStock] = useState({ old: 0, bran_plastic: 0, broken_plastic: 0 });

  // Product ID mapping for stock API
  const productIdMap = {"Rice Bran":"bran","Mota Kunda":"kunda","Broken Rice":"broken","Rejection Rice":"rejection_rice","Pin Broken Rice":"pin_broken_rice","Poll":"poll","Bhusa":"husk"};
  const productId = productIdMap[product] || product;

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (product) params.append("product", product);
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      if (filters.season) params.append("season", filters.season);
      // v104.44.42 — PKA / KCA filter
      if (gstFilter && gstFilter !== "ALL") params.append("gst_filter", gstFilter);
      const stockParams = new URLSearchParams();
      if (filters.kms_year) stockParams.append("kms_year", filters.kms_year);
      if (filters.season) stockParams.append("season", filters.season);
      const fetches = [
        axios.get(`${API}/bp-sale-register/with-payments?${params}`),
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
  }, [product, productId, filters.kms_year, filters.season, gstFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // v104.44.71 — Bag stock (from gunny_bags collection; same as VW uses)
  const fetchBagStock = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/gunny-bags`, { params: { kms_year: filters.kms_year || "" } });
      const items = Array.isArray(r.data) ? r.data : (r.data?.entries || []);
      const totals = { old: 0, bran_plastic: 0, broken_plastic: 0 };
      for (const e of items) {
        const bt = e.bag_type || 'old';
        if (bt === 'new') continue;  // exclude Govt bags
        if (!(bt in totals)) totals[bt] = 0;
        const q = parseInt(e.quantity || 0) || 0;
        if (e.txn_type === 'in') totals[bt] += q;
        else if (e.txn_type === 'out') totals[bt] -= q;
      }
      setBagStock(totals);
    } catch (e) { /* silent */ }
  }, [filters.kms_year]);
  useEffect(() => { fetchBagStock(); }, [fetchBagStock]);

  // v104.44.61 — Auto-refresh: poll payments-etag every 5s, refetch when changed
  const lastEtagRef = React.useRef('');
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      try {
        const r = await axios.get(`${API}/bp-sale-register/payments-etag`);
        const newEtag = r.data?.etag || '';
        if (lastEtagRef.current && newEtag && newEtag !== lastEtagRef.current) {
          // Cash Book / payment-related collections changed → refetch sales
          fetchData();
        }
        lastEtagRef.current = newEtag;
      } catch { /* silently ignore — keep polling */ }
    };
    poll();  // immediate first poll to capture baseline
    const id = setInterval(poll, 5000);
    return () => { stopped = true; clearInterval(id); };
  }, [fetchData]);

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
            // v104.44.71 — Auto-fetch bag_type from VW (exclude Govt 'new' — we only BP-sell private bags)
            bag_type: (e.bag_type && e.bag_type !== 'new') ? e.bag_type : p.bag_type,
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
        // v104.44.35 — Fresh RST (not in VW) — silent ignore (user is creating new entry manually)
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
  // v104.44.76 — Unified flow: Total N/W → (minus bag cut) → Final M.W → Split happens from Final M.W
  const totalNwKg = parseFloat(form.net_weight_kg) || 0;
  const totalNwQtl = totalNwKg / 100;
  // Bag cut (Bran only)
  const bagCount = parseInt(form.bags) || 0;
  const bagCutGrams = product === "Rice Bran" ? (parseFloat(form.bag_weight_cut_g) || 0) : 0;
  const totalCutKg = Math.round((bagCount * bagCutGrams / 1000) * 100) / 100;
  // Final M.W = Total N/W minus total bag cut — this is the BILLING BASIS (single source of truth)
  const nwKg = Math.max(0, Math.round((totalNwKg - totalCutKg) * 100) / 100);
  const nwQtl = nwKg / 100;
  // Legacy aliases for stock warnings & split calcs (point to same Final M.W)
  const totalSplitKg = totalNwKg;
  const totalSplitQtl = totalNwQtl;
  // Split: Pakka and Kaccha values are FINAL (post-cut) weights entered/auto-balanced from nwKg
  const finalBilledKg = billedKg;
  const finalKacchaKg = kacchaKg;
  const billedQtl = finalBilledKg / 100;
  const kacchaQtl = finalKacchaKg / 100;
  const billedAmount = Math.round(billedQtl * rate * 100) / 100;
  const kacchaAmount = Math.round(kacchaQtl * kacchaRate * 100) / 100;
  const amount = isSplit ? billedAmount : Math.round(nwQtl * rate * 100) / 100; // GST-taxable portion
  // v104.44.77 — Pro-rata bag count for display only (info field in Pakka / Kaccha panels).
  // Distribution based on weight ratio; total always preserved (no double-deduct from stock).
  const pakkaBagsInfo = (isSplit && nwKg > 0) ? Math.round(bagCount * (finalBilledKg / nwKg)) : 0;
  const kacchaBagsInfo = isSplit ? Math.max(0, bagCount - pakkaBagsInfo) : 0;
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
    setOriginalRst("");
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
    setOriginalRst(String(s.rst_no || ""));
    setForm({
      voucher_no: s.voucher_no || "", bill_number: s.bill_number || "", billing_date: s.billing_date || "", date: s.date || "",
      rst_no: s.rst_no || "", vehicle_no: s.vehicle_no || "",
      bill_from: s.bill_from || "", party_name: s.party_name || "", destination: s.destination || "",
      net_weight_kg: s.net_weight_kg ? String(s.net_weight_kg) : "",
      net_weight_qtl_display: s.net_weight_kg ? String(Math.round(s.net_weight_kg / 100 * 100) / 100) : "",
      bags: s.bags ? String(s.bags) : "", rate_per_qtl: s.rate_per_qtl ? String(s.rate_per_qtl) : "",
      bag_type: s.bag_type || "",
      bag_weight_cut_g: s.bag_weight_cut_g != null ? String(s.bag_weight_cut_g) : (s.product === "Rice Bran" ? "200" : "0"),
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

  const handleSubmit = async (e, opts = {}) => {
    if (e && e.preventDefault) e.preventDefault();
    const saveAndNew = !!opts.saveAndNew;
    if (!form.party_name?.trim()) { toast.error("Party Name daalen"); return; }
    if (form.split_billing) {
      if (billedKg <= 0 && kacchaKg <= 0) { toast.error("Pakka ya Kaccha weight daalen"); return; }
    } else {
      if (nwKg <= 0) { toast.error("Net weight daalen"); return; }
    }
    // 🛡️ Backend-backed RST cross-check — HARD BLOCK
    // Skip if editing and RST unchanged
    const rstTrim = (form.rst_no || '').trim();
    if (rstTrim && (!editingId || rstTrim !== originalRst)) {
      const { hasBlocker } = await checkRst(rstTrim, { immediate: true });
      if (hasBlocker) {
        toast.error(`❌ RST ${rstTrim} duplicate — save block hua\n${buildRstMsg()}`, { duration: 7000 });
        return;
      }
    }
    try {
      const payload = {
        ...form,
        net_weight_kg: nwKg,  // final weight (post bag-cut) — used for billing
        rate_per_qtl: rate,
        bags: parseInt(form.bags) || 0,
        bag_type: form.bag_type || "",
        bag_weight_cut_g: product === "Rice Bran" ? (parseFloat(form.bag_weight_cut_g) || 0) : 0,
        // v104.44.68 — Auto round-off payment fields globally
        cash_paid: commercialRound(parseFloat(form.cash_paid) || 0),
        diesel_paid: commercialRound(parseFloat(form.diesel_paid) || 0),
        bhada: commercialRound(parseFloat(form.bhada) || 0),
        advance: commercialRound(parseFloat(form.advance) || 0),
        split_billing: !!form.split_billing,
        billed_weight_kg: form.split_billing ? finalBilledKg : 0,
        kaccha_weight_kg: form.split_billing ? finalKacchaKg : 0,
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
      // v104.44.46 — Auto-create VW stub if missing
      const bhadaVal = parseFloat(form.bhada) || 0;
      if (form.rst_no) {
        const r = await updateVwBhada(form.rst_no, bhadaVal, user.username, filters.kms_year || "", {
          vehicle_no: form.vehicle_no,
          party_name: form.party_name,
          farmer_name: form.party_name,
          trans_type: "Dispatch(Sale)",
          date: form.date,
          season: filters.season,
          product: product || "BYPRODUCT",
        });
        if (r.auto_created) {
          toast.info(`Vehicle Weight entry auto-create ho gayi (RST ${form.rst_no}). Weight add karna chahein to VW tab me edit karein.`, { duration: 5000 });
        } else if (!r.ok && bhadaVal > 0) {
          toast.warning(`Bhada save hua par truck owner ledger me sync nahi hua (${r.message || "unknown"}).`, { duration: 6000 });
        }
      }
      // v104.44.74 — Ctrl+S = Save & New (preserves party/date/bill_from/season for fast multi-entry)
      if (saveAndNew && !editingId) {
        const preserve = {
          party_name: form.party_name, date: form.date, billing_date: form.billing_date,
          vehicle_no: "", bill_from: form.bill_from, destination: form.destination,
          bag_type: form.bag_type, bag_weight_cut_g: form.bag_weight_cut_g,
          kms_year: form.kms_year, season: form.season,
        };
        setForm({ ...blankForm, ...preserve });
        setEditingId(null);
        fetchData(); fetchBagStock();
        toast.info("Next entry — party/date auto-filled", { duration: 2000 });
        // Focus RST for fast next-entry
        setTimeout(() => {
          const el = document.querySelector('[data-testid="bp-rst"]');
          if (el) el.focus();
        }, 80);
        return;
      }
      setIsFormOpen(false); fetchData(); fetchBagStock();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleDelete = async (id) => {
    if (!await showConfirm("Delete", "Delete karna chahte hain?")) return;
    try { await axios.delete(`${API}/bp-sale-register/${id}`); toast.success("Deleted!"); fetchData(); fetchBagStock(); } catch (e) { toast.error("Error"); }
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

  // Build export filter params — v104.44.39: merge parent filters (date_from/date_to/party_name)
  // with local filterValues (local always wins). Fixes "filter ke hisab se download nahi ho raha".
  const buildExportParams = () => {
    const params = new URLSearchParams();
    if (product) params.append('product', product);
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    const f = filterValues;
    // Date range: local > parent
    const dFrom = f.date_from || filters.date_from || '';
    const dTo = f.date_to || filters.date_to || '';
    if (dFrom) params.append('date_from', dFrom);
    if (dTo) params.append('date_to', dTo);
    if (f.billing_date_from) params.append('billing_date_from', f.billing_date_from);
    if (f.billing_date_to) params.append('billing_date_to', f.billing_date_to);
    if (f.rst_no) params.append('rst_no', f.rst_no);
    if (f.vehicle_no) params.append('vehicle_no', f.vehicle_no);
    if (f.bill_from) params.append('bill_from', f.bill_from);
    // Party: local > parent
    const pName = f.party_name || filters.party_name || '';
    if (pName) params.append('party_name', pName);
    if (f.destination) params.append('destination', f.destination);
    // v104.44.42 — PKA / KCA filter
    if (gstFilter && gstFilter !== "ALL") params.append('gst_filter', gstFilter);
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
  // v104.44.56 — Payment columns visible only if at least one sale has received payments
  const hasAnyPayments = filtered.some(s => (s.payments_alloc?.length || 0) > 0);
  // v104.44.56 — Option C: Party Statement dialog state
  const [stmtDialogOpen, setStmtDialogOpen] = useState(false);
  const [stmtParty, setStmtParty] = useState("");
  const [expandedRows, setExpandedRows] = useState({});  // v104.44.56 Option B
  const toggleRow = (key) => setExpandedRows(p => ({ ...p, [key]: !p[key] }));
  // v104.44.70 — Top-level sub-tab: "sales" (default) | "party_weight"
  const [mainTab, setMainTab] = useState("sales");
  const clearFilters = () => setFilterValues({ date_from: "", date_to: "", billing_date_from: "", billing_date_to: "", rst_no: "", vehicle_no: "", bill_from: "", party_name: "", destination: "" });

  const totalAmount = filtered.reduce((s, v) => s + (v.total || 0), 0);
  const totalBalance = filtered.reduce((s, v) => s + (v.balance || 0), 0);
  // v104.44.53 — Balance after premium adjustment (shown in header + table last col)
  const totalBalanceFinal = filtered.reduce((s, v) => {
    const op = getOilPremium(v);
    const prem = op ? Number(op.premium_amount || 0) : 0;
    return s + (v.balance || 0) + prem;
  }, 0);

  // v104.44.39 — Build WhatsApp summary text for current product+filters
  const _bpSummaryText = () => {
    const flt = [];
    if (filters.kms_year) flt.push(`KMS: ${filters.kms_year}`);
    if (filters.season) flt.push(`Season: ${filters.season}`);
    const f = filterValues;
    if (f.party_name || filters.party_name) flt.push(`Party: ${f.party_name || filters.party_name}`);
    if (f.date_from || filters.date_from) flt.push(`From: ${f.date_from || filters.date_from}`);
    if (f.date_to || filters.date_to) flt.push(`To: ${f.date_to || filters.date_to}`);
    if (f.destination) flt.push(`Dest: ${f.destination}`);
    const lines = [];
    lines.push(`*📋 ${product} Sale Register*`);
    if (flt.length) { lines.push(''); lines.push(`_${flt.join(' · ')}_`); }
    lines.push('');
    lines.push(`📊 Total Entries: *${filtered.length}*`);
    lines.push(`💰 Total Amount: *₹${totalAmount.toLocaleString()}*`);
    lines.push(`📕 Total Balance: *₹${Math.round(totalBalanceFinal).toLocaleString()}*`);
    if (filtered.length > 0 && filtered.length <= 10) {
      lines.push('');
      lines.push('*Entries:*');
      filtered.slice(0, 10).forEach(s => {
        lines.push(`• ${s.voucher_no || '-'} · ${fmtDate(s.date)} · ${s.party_name || '-'} · ${s.bags || 0}bg · ₹${(s.total || 0).toLocaleString()}`);
      });
    }
    return lines.join('\n');
  };

  // v104.44.55 — WhatsApp button: directly share the PDF file via Web Share API
  // Mobile: opens native share sheet (WhatsApp/Telegram/etc with PDF attached)
  // Desktop: tries Web Share, falls back to download + open wa.me with summary text
  const handleHeaderWhatsApp = async () => {
    if (filtered.length === 0) { toast.error("Koi entries nahi"); return; }
    const summary = _bpSummaryText();
    const pdfUrl = `${API}/bp-sale-register/export/pdf?${buildExportParams()}`;
    const productSlug = (product || 'byproduct').toLowerCase().replace(/\s+/g, '_');
    const todayStr = new Date().toISOString().slice(0, 10);
    const filename = `${productSlug}_sale_register_${todayStr}.pdf`;

    try {
      toast.info("PDF ready kar rahe...", { duration: 1500 });
      const res = await fetch(pdfUrl, { credentials: 'include' });
      if (!res.ok) throw new Error('PDF fetch failed');
      const blob = await res.blob();
      const file = new File([blob], filename, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        // Native share — WhatsApp/Telegram select karke direct PDF send
        await navigator.share({ files: [file], title: filename, text: summary });
        toast.success("Share dialog open — WhatsApp select karein");
        return;
      }
      // Fallback: download PDF + open WhatsApp Web with summary text
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, "_blank");
      toast.success("PDF download ho gayi + WhatsApp open — manually attach karein", { duration: 5000 });
    } catch (e) {
      if (e?.name === 'AbortError') return; // user cancelled native share
      toast.error("WhatsApp share fail: " + (e.message || e));
    }
  };

  const handleHeaderGroup = () => {
    if (filtered.length === 0) { toast.error("Koi entries nahi"); return; }
    setGroupText(_bpSummaryText());
    setGroupPdfUrl(`${API}/bp-sale-register/export/pdf?${buildExportParams()}`);
    setGroupDialogOpen(true);
  };

  return (
    <div className="space-y-3" data-testid={`bp-sale-register-${product}`}>
      {/* v104.44.70 — Top-level sub-tabs: Sales | Party Weight */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setMainTab("sales")}
          className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${mainTab === "sales" ? "border-amber-500 text-amber-600 dark:text-amber-400" : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200"}`}
          data-testid={`bp-tab-sales-${product}`}
        >
          Sales Register
        </button>
        <button
          onClick={() => setMainTab("party_weight")}
          className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px flex items-center gap-1 ${mainTab === "party_weight" ? "border-cyan-500 text-cyan-600 dark:text-cyan-400" : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200"}`}
          data-testid={`bp-tab-party-weight-${product}`}
        >
          ⚖️ Party Weight
        </button>
      </div>

      {mainTab === "party_weight" ? (
        <PartyWeightRegister filters={filters} user={user} product={product} />
      ) : (<>
      {/* Stock Summary Card */}
      {stockInfo && (
        <div className="grid grid-cols-4 gap-3">
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-1">Produced (Milling)</p>
            <p className="text-lg font-bold text-green-400">{stockInfo.produced_qntl || 0} <span className="text-xs text-slate-600 dark:text-slate-400">Qtl</span></p>
          </CardContent></Card>
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-1">Total Sold</p>
            <p className="text-lg font-bold text-orange-400">{stockInfo.sold_qntl || 0} <span className="text-xs text-slate-600 dark:text-slate-400">Qtl</span></p>
          </CardContent></Card>
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-1">Available Stock</p>
            <p className={`text-lg font-bold ${(stockInfo.available_qntl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{stockInfo.available_qntl || 0} <span className="text-xs text-slate-600 dark:text-slate-400">Qtl</span></p>
          </CardContent></Card>
          <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-1">Total Revenue</p>
            <p className="text-lg font-bold text-amber-400">{(stockInfo.total_revenue || 0).toLocaleString()} <span className="text-xs text-slate-600 dark:text-slate-400">Rs</span></p>
          </CardContent></Card>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-2 w-4 h-4 text-slate-600 dark:text-slate-400" />
          <Input placeholder="Search party, bill, vehicle..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 bg-slate-800 border-slate-600 text-white h-9 text-xs" data-testid="bp-sale-search" />
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-slate-600 dark:text-slate-400" title="Auto-refresh: BP Sale Register cash payments ke saath sync rehta hai (every 5s check)">{filtered.length} entries | Total: <span className="text-emerald-400 font-bold">{totalAmount.toLocaleString()}</span>{gstFilter !== "PKA" && <> | Balance: <span className={totalBalanceFinal > 0 ? "text-red-500 font-bold" : "text-green-500 font-bold"}>{Math.round(totalBalanceFinal).toLocaleString()}</span></>} <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" title="Live sync"></span></span>
          <Button onClick={async () => { try { const params = buildExportParams(); const { downloadFile } = await import('../utils/download'); const { buildFilename } = await import('../utils/filename-format'); const fname = buildFilename({ base: `${product || 'byproduct'}_sales`, party: filterValues.party_name || filters.party_name, dateFrom: filterValues.date_from || filters.date_from, dateTo: filterValues.date_to || filters.date_to, kmsYear: filters.kms_year, ext: 'xlsx' }); downloadFile(`/api/bp-sale-register/export/excel?${params}`, fname); toast.success("Excel exported!"); } catch(e) { toast.error("Export failed"); }}}
            variant="ghost" size="sm" className="h-8 w-8 p-0 text-green-400 hover:bg-green-900/30 border border-green-600" title="Excel (current filters)" data-testid="bp-export-excel">
            <FileSpreadsheet className="w-4 h-4" />
          </Button>
          <Button onClick={async () => { try { const params = buildExportParams(); const { downloadFile } = await import('../utils/download'); const { buildFilename } = await import('../utils/filename-format'); const fname = buildFilename({ base: `${product || 'byproduct'}_sales`, party: filterValues.party_name || filters.party_name, dateFrom: filterValues.date_from || filters.date_from, dateTo: filterValues.date_to || filters.date_to, kmsYear: filters.kms_year, ext: 'pdf' }); downloadFile(`/api/bp-sale-register/export/pdf?${params}`, fname); toast.success("PDF exported!"); } catch(e) { toast.error("Export failed"); }}}
            variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:bg-red-900/30 border border-red-600" title="PDF (current filters)" data-testid="bp-export-pdf">
            <FileText className="w-4 h-4" />
          </Button>
          <Button onClick={handleHeaderWhatsApp} variant="ghost" size="sm"
            className="h-8 w-8 p-0 text-[#25D366] hover:bg-green-900/30 border border-green-600" title="WhatsApp pe PDF share karein" data-testid="bp-whatsapp-btn">
            <WhatsAppIcon className="w-4 h-4" />
          </Button>
          <Button onClick={handleHeaderGroup} variant="ghost" size="sm"
            className="h-8 w-8 p-0 text-cyan-400 hover:bg-cyan-900/30 border border-cyan-600" title="Send to Group (summary + PDF)" data-testid="bp-group-btn">
            <Users className="w-4 h-4" />
          </Button>
          {/* v104.44.56 — Option C: Party Statement button */}
          <Button onClick={() => setStmtDialogOpen(true)} variant="ghost" size="sm"
            className="h-8 w-8 p-0 text-purple-400 hover:bg-purple-900/30 border border-purple-600" title="Party Statement (chronological ledger PDF/Excel)" data-testid="bp-stmt-btn">
            <FileText className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 text-[8px] font-bold bg-purple-500 text-white rounded-full px-1">$</span>
          </Button>
          <Button onClick={openNew} size="sm" className="bg-amber-500 hover:bg-amber-600 text-slate-900" data-testid="bp-sale-add">
            <Plus className="w-4 h-4 mr-1" /> New Sale
          </Button>
        </div>
      </div>

      {/* v104.44.42 — Sub-tab Filter: ALL | PKA (with GST/Pakka portion) | KCA (Kaccha) */}
      <div className="flex gap-1 items-center bg-slate-800/40 p-1 rounded-md w-fit border border-slate-700" data-testid="bp-gst-tabs">
        {[
          { key: "ALL", label: "ALL", activeCls: "bg-amber-500 text-slate-900 shadow-sm", desc: "Sab entries" },
          { key: "PKA", label: "PKA", activeCls: "bg-emerald-500 text-slate-900 shadow-sm", desc: "Pakka GST sales (split entries bhi)" },
          { key: "KCA", label: "KCA", activeCls: "bg-rose-500 text-slate-900 shadow-sm", desc: "Pure Kaccha sales (split nahi)" },
        ].map(t => (
          <button key={t.key} onClick={() => setGstFilter(t.key)} title={t.desc}
            className={`px-4 py-1.5 text-xs font-semibold rounded transition-all ${gstFilter === t.key ? t.activeCls : 'text-slate-600 dark:text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
            data-testid={`bp-gst-tab-${t.key}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="space-y-2">
        <Button onClick={() => setShowFilters(p => !p)} variant="ghost" size="sm"
          className={`text-xs ${hasActiveFilters ? 'text-amber-400' : 'text-slate-600 dark:text-slate-400'} hover:bg-slate-700`} data-testid="bp-filter-toggle">
          <Filter className="w-3 h-3 mr-1" /> Filters {hasActiveFilters && `(Active)`}
          {hasActiveFilters && <button onClick={(e) => { e.stopPropagation(); clearFilters(); }} className="ml-2 text-red-400 hover:text-red-300 text-[10px]">Clear</button>}
        </Button>
        {showFilters && (
          <div className="grid grid-cols-4 md:grid-cols-6 gap-2 p-2 bg-slate-800/80 rounded border border-slate-700">
            <div>
              <Label className="text-[9px] text-slate-500">Date From</Label>
              <Input type="date" value={filterValues.date_from} onChange={e => setFilterValues(p => ({ ...p, date_from: e.target.value }))}
                className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-7 text-[10px]" />
            </div>
            <div>
              <Label className="text-[9px] text-slate-500">Date To</Label>
              <Input type="date" value={filterValues.date_to} onChange={e => setFilterValues(p => ({ ...p, date_to: e.target.value }))}
                className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-7 text-[10px]" />
            </div>
            <div>
              <Label className="text-[9px] text-slate-500">Bill Date From</Label>
              <Input type="date" value={filterValues.billing_date_from} onChange={e => setFilterValues(p => ({ ...p, billing_date_from: e.target.value }))}
                className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-7 text-[10px]" />
            </div>
            <div>
              <Label className="text-[9px] text-slate-500">Bill Date To</Label>
              <Input type="date" value={filterValues.billing_date_to} onChange={e => setFilterValues(p => ({ ...p, billing_date_to: e.target.value }))}
                className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-7 text-[10px]" />
            </div>
            <div>
              <Label className="text-[9px] text-slate-500">RST No</Label>
              <Input value={filterValues.rst_no} onChange={e => setFilterValues(p => ({ ...p, rst_no: e.target.value }))} placeholder="RST"
                className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-7 text-[10px]" />
            </div>
            <div>
              <Label className="text-[9px] text-slate-500">Vehicle</Label>
              <Input value={filterValues.vehicle_no} onChange={e => setFilterValues(p => ({ ...p, vehicle_no: e.target.value }))} placeholder="Vehicle"
                className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-7 text-[10px]" />
            </div>
            <div>
              <Label className="text-[9px] text-slate-500">Bill From</Label>
              <Input value={filterValues.bill_from} onChange={e => setFilterValues(p => ({ ...p, bill_from: e.target.value }))} placeholder="Bill From"
                list="filter-bf" className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-7 text-[10px]" />
              <datalist id="filter-bf">{billFromSugg.map(s => <option key={s} value={s} />)}</datalist>
            </div>
            <div>
              <Label className="text-[9px] text-slate-500">Party</Label>
              <Input value={filterValues.party_name} onChange={e => setFilterValues(p => ({ ...p, party_name: e.target.value }))} placeholder="Party"
                list="filter-party" className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-7 text-[10px]" />
              <datalist id="filter-party">{partySugg.map(s => <option key={s} value={s} />)}</datalist>
            </div>
            <div>
              <Label className="text-[9px] text-slate-500">Destination</Label>
              <Input value={filterValues.destination} onChange={e => setFilterValues(p => ({ ...p, destination: e.target.value }))} placeholder="Destination"
                list="filter-dest" className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-7 text-[10px]" />
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
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[60px] text-right">N/W(Qtl)</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[40px] text-right">Bags</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[50px] text-right">Rate/Q</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[65px] text-right">Amount</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[55px] text-right">Tax</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[65px] text-right">Total</TableHead>
                  {gstFilter !== "PKA" && hasAnyOilPremium && <>
                    <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[45px] text-right">Oil%</TableHead>
                    <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[45px] text-right">Diff%</TableHead>
                    <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[65px] text-right">Premium</TableHead>
                  </>}
                  {gstFilter !== "PKA" && <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[75px] text-right" title="Balance after Premium adjustment">Balance</TableHead>}
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[70px]" title="Last payment date received">Last Pmt</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[75px] text-right" title="Total payments received against this sale">Received</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[80px] text-right" title="Pending after all payments + premium (negative = overpaid)">Pending</TableHead>
                  <TableHead className="text-slate-300 text-[10px] py-2 px-2 w-[110px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={gstFilter === "PKA" ? 16 : (hasAnyOilPremium ? 20 : 17)} className="text-center text-slate-600 dark:text-slate-400 py-6">Koi sale nahi</TableCell></TableRow>
                ) : filtered.map(s => (
                  <React.Fragment key={s.id}>
                  <TableRow className="border-slate-700 hover:bg-slate-700/30">
                    <TableCell className="text-white text-[10px] px-2 whitespace-nowrap">{fmtDate(s.date)}</TableCell>
                    <TableCell className="text-cyan-400 text-[10px] px-2 font-medium">{s.voucher_no}</TableCell>
                    <TableCell className="text-slate-300 text-[10px] px-2 whitespace-nowrap">{s.bill_number}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400 text-[10px] px-2 whitespace-nowrap">{fmtDate(s.billing_date)}</TableCell>
                    <TableCell className="text-amber-400 text-[10px] px-2 font-medium">{s.rst_no}</TableCell>
                    <TableCell className="text-slate-300 text-[10px] px-2 whitespace-nowrap">{s.vehicle_no}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400 text-[10px] px-2 whitespace-nowrap truncate max-w-[90px]">{s.bill_from}</TableCell>
                    <TableCell className="text-white text-[10px] px-2 font-medium whitespace-nowrap">
                      {s.party_name}
                      {s.split_billing && <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold" title={`Pakka: ${(s.billed_weight_kg||0)}kg · Kaccha: ${(s.kaccha_weight_kg||0)}kg`}>SPLIT</span>}
                    </TableCell>
                    <TableCell className="text-slate-300 text-[10px] px-2 whitespace-nowrap">{s.destination}</TableCell>
                    <TableCell className="text-blue-700 dark:text-blue-300 text-[10px] px-2 text-right whitespace-nowrap">{((s.net_weight_kg || 0) / 100).toFixed(2)}</TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-300 text-[10px] px-2 text-right">{s.bags}</TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-300 text-[10px] px-2 text-right">
                      {s.split_billing && s._view_mode !== "PKA" && s._view_mode !== "KCA" ? (
                        <div className="flex flex-col items-end leading-tight">
                          <span className="text-emerald-700 dark:text-emerald-400" title="Pakka rate">{s.rate_per_qtl}</span>
                          <span className="text-rose-700 dark:text-rose-400" title="Kaccha rate">{s.kaccha_rate_per_qtl || s.rate_per_qtl}</span>
                        </div>
                      ) : (s._view_mode === "KCA" ? (s.kaccha_rate_per_qtl || s.rate_per_qtl) : s.rate_per_qtl)}
                    </TableCell>
                    <TableCell className="text-[10px] px-2 text-right whitespace-nowrap">
                      {/* v104.44.50 — Mode-aware amount + light/dark color contrast */}
                      {s._view_mode === "PKA" ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{(s.billed_amount || 0).toLocaleString()}</span>
                      ) : s._view_mode === "KCA" ? (
                        <span className="text-rose-700 dark:text-rose-400 font-semibold">{(s.kaccha_amount || 0).toLocaleString()}</span>
                      ) : s.split_billing ? (
                        <div className="flex flex-col items-end leading-tight" title={`Pakka ₹${(s.billed_amount||0).toLocaleString()} + Kaccha ₹${(s.kaccha_amount||0).toLocaleString()}`}>
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{(s.billed_amount || 0).toLocaleString()}</span>
                          <span className="text-rose-700 dark:text-rose-400 font-semibold">{(s.kaccha_amount || 0).toLocaleString()}</span>
                        </div>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{(s.amount || 0).toLocaleString()}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[10px] px-2 text-right whitespace-nowrap">
                      {Number(s.tax_amount || 0) > 0 ? <span className="text-amber-700 dark:text-amber-400 font-semibold">{(s.tax_amount || 0).toLocaleString()}</span> : <span className="text-slate-600 dark:text-slate-400 dark:text-slate-600">—</span>}
                    </TableCell>
                    <TableCell className="text-emerald-700 dark:text-emerald-400 text-[10px] px-2 text-right font-bold whitespace-nowrap">{(s.total || 0).toLocaleString()}</TableCell>
                    {gstFilter !== "PKA" && hasAnyOilPremium && (() => {
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
                    {gstFilter !== "PKA" && (() => {
                      const op = getOilPremium(s);
                      const prem = op ? Number(op.premium_amount || 0) : 0;
                      const balFinal = Math.round(((s.balance || 0) + prem) * 100) / 100;
                      return <TableCell className={`text-[10px] px-2 text-right font-bold whitespace-nowrap ${balFinal > 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`} title={`Balance after Premium: ${(s.balance || 0).toLocaleString()} ${prem >= 0 ? '+' : ''}${prem.toLocaleString()}`}>{balFinal.toLocaleString()}</TableCell>;
                    })()}
                    <TableCell className="text-slate-300 text-[10px] px-2 whitespace-nowrap">{s.last_payment_date ? fmtDate(s.last_payment_date) : <span className="text-slate-500">—</span>}</TableCell>
                    <TableCell className="text-cyan-700 dark:text-cyan-400 text-[10px] px-2 text-right font-bold whitespace-nowrap">{(s.total_received || 0) > 0 ? (s.total_received || 0).toLocaleString() : <span className="text-slate-500 dark:text-slate-600">—</span>}</TableCell>
                    {(() => {
                      const op = getOilPremium(s);
                      const prem = (op && gstFilter !== 'PKA') ? Number(op.premium_amount || 0) : 0;
                      // v104.44.60 — Pending = Balance + Premium − Received (matches Statement closing). PKA: no premium.
                      const pendingFinal = Math.round(((s.balance || 0) + prem - (s.total_received || 0)) * 100) / 100;
                      return <TableCell className={`text-[10px] px-2 text-right font-bold whitespace-nowrap ${pendingFinal > 0 ? 'text-orange-600 dark:text-orange-400' : (pendingFinal < 0 ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400')}`} title={pendingFinal < 0 ? 'Overpaid (extra received)' : 'Pending balance'}>{pendingFinal.toLocaleString()}</TableCell>;
                    })()}
                    <TableCell className="px-1 w-[110px]">
                      <div className="flex gap-0.5 flex-nowrap items-center">
                        {(s.payments_alloc?.length || 0) > 0 && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0 text-purple-400 hover:bg-purple-900/30" title={`${s.payments_alloc.length} payment(s) — click to expand`} onClick={() => toggleRow(s.voucher_no || s.id)} data-testid={`bp-expand-${s.voucher_no || s.id}`}>
                            {expandedRows[s.voucher_no || s.id] ? <span className="text-[14px] leading-none">▾</span> : <span className="text-[14px] leading-none">▸</span>}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0 text-slate-600 dark:text-slate-400 hover:text-white" onClick={() => setViewSale(s)} data-testid={`bp-view-${s.id}`}><Eye className="w-3 h-3" /></Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0 text-blue-400" onClick={() => openEdit(s)} data-testid={`bp-edit-${s.voucher_no || s.id}`}><Edit className="w-3 h-3" /></Button>
                        {user.role === "admin" && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0 text-red-400" onClick={() => handleDelete(s.id)}><Trash2 className="w-3 h-3" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                  {/* v104.44.56 Option B — expandable nested payment rows */}
                  {expandedRows[s.voucher_no || s.id] && (s.payments_alloc?.length || 0) > 0 && s.payments_alloc.map((p, pi) => (
                    <TableRow key={`${s.id}-p-${pi}`} className="border-slate-800 bg-slate-900/40 hover:bg-slate-800/40">
                      <TableCell colSpan={4} className="text-[10px] px-2 py-1 pl-12 text-purple-400 italic">
                        ↳ <span className="text-slate-600 dark:text-slate-400">Payment</span> {fmtDate(p.date)}
                      </TableCell>
                      <TableCell colSpan={6} className="text-[10px] px-2 py-1 text-slate-300 truncate">{p.description || ''}</TableCell>
                      <TableCell className="text-[10px] px-2 py-1 text-right">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${p.type === 'pka' ? 'bg-emerald-900/30 text-emerald-400' : p.type === 'kca' ? 'bg-rose-900/30 text-rose-400' : 'bg-slate-700 text-slate-300'}`}>{(p.type || '').toUpperCase() || '—'}</span>
                      </TableCell>
                      <TableCell className="text-[10px] px-2 py-1 text-right text-slate-500">—</TableCell>
                      <TableCell className="text-[10px] px-2 py-1 text-right text-slate-500">—</TableCell>
                      <TableCell className="text-[10px] px-2 py-1 text-right font-bold text-cyan-700 dark:text-cyan-400">−{(p.amount || 0).toLocaleString()}</TableCell>
                      <TableCell colSpan={5} />
                    </TableRow>
                  ))}
                </React.Fragment>
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
                {viewSale.voucher_no && <div><span className="text-slate-600 dark:text-slate-400 text-xs">Voucher No:</span> <span className="text-cyan-400 font-medium">{viewSale.voucher_no}</span></div>}
                {viewSale.bill_number && <div><span className="text-slate-600 dark:text-slate-400 text-xs">Bill No:</span> <span className="text-white font-medium">{viewSale.bill_number}</span></div>}
                {viewSale.billing_date && <div><span className="text-slate-600 dark:text-slate-400 text-xs">Billing Date:</span> <span className="text-white">{fmtDate(viewSale.billing_date)}</span></div>}
                {viewSale.date && <div><span className="text-slate-600 dark:text-slate-400 text-xs">Date:</span> <span className="text-white">{fmtDate(viewSale.date)}</span></div>}
                {viewSale.rst_no && <div><span className="text-slate-600 dark:text-slate-400 text-xs">RST No:</span> <span className="text-amber-400 font-medium">{viewSale.rst_no}</span></div>}
                {viewSale.vehicle_no && <div><span className="text-slate-600 dark:text-slate-400 text-xs">Vehicle:</span> <span className="text-white">{viewSale.vehicle_no}</span></div>}
                {viewSale.bill_from && <div><span className="text-slate-600 dark:text-slate-400 text-xs">Bill From:</span> <span className="text-white">{viewSale.bill_from}</span></div>}
                {viewSale.party_name && <div><span className="text-slate-600 dark:text-slate-400 text-xs">Party:</span> <span className="text-white font-medium">{viewSale.party_name}</span></div>}
                {viewSale.sauda_amount != null && viewSale.sauda_amount !== '' && Number(viewSale.sauda_amount) > 0 && (
                  <div><span className="text-slate-600 dark:text-slate-400 text-xs">Sauda Amount:</span> <span className="text-cyan-300 font-medium">₹{Number(viewSale.sauda_amount).toLocaleString('en-IN')}/Qtl</span> <span className="text-slate-400 dark:text-slate-500">(info only)</span></div>
                )}
                {viewSale.destination && <div><span className="text-slate-600 dark:text-slate-400 text-xs">Destination:</span> <span className="text-white">{viewSale.destination}</span></div>}
              </div>
              <div className="border-t border-slate-600 pt-2 grid grid-cols-3 gap-x-4 gap-y-2">
                {viewSale.net_weight_kg > 0 && <div><span className="text-slate-600 dark:text-slate-400 text-xs">N/W:</span> <span className="text-blue-300 font-medium">{viewSale.net_weight_kg} Kg ({(viewSale.net_weight_qtl || 0).toFixed(2)} Q)</span></div>}
                {viewSale.bags > 0 && <div><span className="text-slate-600 dark:text-slate-400 text-xs">Bags:</span> <span className="text-white">{viewSale.bags}</span></div>}
                {viewSale.rate_per_qtl > 0 && <div><span className="text-slate-600 dark:text-slate-400 text-xs">Rate/Q:</span> <span className="text-white">{viewSale.rate_per_qtl}</span></div>}
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
                        {viewSale.tax_amount > 0 && <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400 text-xs">GST ({viewSale.gst_percent || 0}% on Pakka)</span><span className="text-orange-400">₹{(viewSale.tax_amount || 0).toLocaleString('en-IN')}</span></div>}
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
                      {viewSale.amount > 0 && <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Amount</span><span className="text-emerald-400">{(viewSale.amount || 0).toLocaleString()}</span></div>}
                      {viewSale.tax_amount > 0 && <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Tax ({viewSale.gst_percent || 0}%)</span><span className="text-orange-400">{(viewSale.tax_amount || 0).toLocaleString()}</span></div>}
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
                      <div className="flex justify-between text-xs"><span className="text-slate-600 dark:text-slate-400">Original Total</span><span className="text-slate-300 line-through">₹{baseTotal.toLocaleString('en-IN')}</span></div>
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
              {viewSale.remark && <div className="border-t border-slate-600 pt-2"><span className="text-slate-600 dark:text-slate-400 text-xs">Remark:</span> <span className="text-slate-300">{viewSale.remark}</span></div>}
              {(() => { const op = getOilPremium(viewSale); return op ? (
                <div className="border-t border-slate-600 pt-2 space-y-1">
                  <p className="text-[10px] text-amber-400 font-medium mb-1">Oil Premium</p>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                    <div><span className="text-slate-600 dark:text-slate-400 text-xs">Type:</span> <span className={op.bran_type === 'Raw' ? 'text-orange-400' : 'text-blue-400'}>{op.bran_type}</span></div>
                    <div><span className="text-slate-600 dark:text-slate-400 text-xs">Standard:</span> <span className="text-slate-300">{op.standard_oil_pct}%</span></div>
                    <div><span className="text-slate-600 dark:text-slate-400 text-xs">Actual:</span> <span className="text-white font-bold">{op.actual_oil_pct}%</span></div>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-slate-600 dark:text-slate-400 text-xs">Diff: <span className={`font-bold ${(op.difference_pct||0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(op.difference_pct||0) > 0 ? '+' : ''}{(op.difference_pct||0).toFixed(2)}%</span></span>
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
        <DialogContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white max-w-6xl max-h-[92vh] overflow-y-auto" data-testid="bp-sale-form">
          <DialogHeader>
            <DialogTitle className="text-amber-600 dark:text-amber-400 flex items-center justify-between">
              <span>{editingId ? "Edit" : "New"} {product} Sale</span>
              <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                ⌨ Enter = Save · Esc = Close · Ctrl+S = Save & New
              </span>
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleSubmit}
            onKeyDown={(e) => {
              // v104.44.74 — Ctrl+S / Cmd+S → Save & New (preserves party/date)
              if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                handleSubmit(null, { saveAndNew: true });
              }
            }}
            className="space-y-3">
            <div className="grid grid-cols-4 gap-3">
              <div>
                <Label className="text-[11px] text-slate-600 dark:text-slate-400">Voucher No</Label>
                <Input value={form.voucher_no} onChange={e => setForm(p => ({ ...p, voucher_no: e.target.value }))}
                  className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs" data-testid="bp-voucher-no" />
              </div>
              <div>
                <Label className="text-[11px] text-slate-600 dark:text-slate-400">Bill Number</Label>
                <Input value={form.bill_number} onChange={e => setForm(p => ({ ...p, bill_number: e.target.value }))}
                  className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs" data-testid="bp-bill-number" />
              </div>
              <div>
                <Label className="text-[11px] text-slate-600 dark:text-slate-400">Billing Date</Label>
                <Input type="date" value={form.billing_date} onChange={e => setForm(p => ({ ...p, billing_date: e.target.value }))}
                  className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs" data-testid="bp-billing-date" />
              </div>
              <div>
                <Label className="text-[11px] text-slate-600 dark:text-slate-400">Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs" required data-testid="bp-date" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-[11px] text-slate-600 dark:text-slate-400">RST Number {rstLoading && <span className="text-amber-400">(loading...)</span>}</Label>
                <Input value={form.rst_no} onChange={e => {
                    const v = e.target.value;
                    setForm(p => ({ ...p, rst_no: v }));
                    if (v.trim()) checkRst(v); else clearRstCheck();
                  }}
                  onBlur={() => { if (form.rst_no) fetchRst(form.rst_no); }}
                  placeholder="RST se auto-fetch" className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs" data-testid="bp-rst" />
                <RstWarning />
              </div>
              <div>
                <Label className="text-[11px] text-slate-600 dark:text-slate-400">Vehicle Number</Label>
                <Input value={form.vehicle_no} onChange={e => setForm(p => ({ ...p, vehicle_no: e.target.value }))}
                  className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs" data-testid="bp-vehicle" />
              </div>
              <div>
                <Label className="text-[11px] text-slate-600 dark:text-slate-400">Bill From</Label>
                <Input value={form.bill_from} onChange={e => setForm(p => ({ ...p, bill_from: e.target.value }))}
                  list="bill-from-list" className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs" data-testid="bp-bill-from" />
                <datalist id="bill-from-list">{billFromSugg.map(s => <option key={s} value={s} />)}</datalist>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-slate-600 dark:text-slate-400">Party Name *</Label>
                <Input value={form.party_name} onChange={e => setForm(p => ({ ...p, party_name: e.target.value }))}
                  list="party-list" className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs" required data-testid="bp-party" />
                <datalist id="party-list">{partySugg.map(s => <option key={s} value={s} />)}</datalist>
              </div>
              <div>
                <Label className="text-[11px] text-slate-600 dark:text-slate-400">Destination</Label>
                <Input value={form.destination} onChange={e => setForm(p => ({ ...p, destination: e.target.value }))}
                  list="dest-list" className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs" data-testid="bp-dest" />
                <datalist id="dest-list">{destSugg.map(s => <option key={s} value={s} />)}</datalist>
              </div>
            </div>

            {/* v104.44.76 — COMMON block (shared by split & non-split modes):
                Row 1: Bag Type | Bags | Bag W.C
                Row 2: Total N/W (Qtl) | Total N/W (Kg) | Final M.W (Kg) */}
            <div className="space-y-3 p-3 rounded bg-cyan-50 dark:bg-cyan-900/10 border border-cyan-300 dark:border-cyan-700/30">
              <div className={`grid gap-3 ${product === "Rice Bran" ? "grid-cols-3" : "grid-cols-2"}`}>
                <div>
                  <Label className="text-[11px] text-cyan-700 dark:text-cyan-300 font-semibold">Bag Type <span className="text-amber-500 dark:text-amber-400">*</span></Label>
                  <Select value={form.bag_type || ""} onValueChange={v => setForm(p => ({ ...p, bag_type: v }))}>
                    <SelectTrigger className="bg-white dark:bg-slate-700 border-cyan-400/50 dark:border-cyan-700/50 text-slate-900 dark:text-white h-9 text-xs" data-testid="bp-bag-type">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="old">Old (Market) — {bagStock.old ?? 0}</SelectItem>
                      <SelectItem value="bran_plastic">Bran P.Pkt — {bagStock.bran_plastic ?? 0}</SelectItem>
                      <SelectItem value="broken_plastic">Broken P.Pkt — {bagStock.broken_plastic ?? 0}</SelectItem>
                    </SelectContent>
                  </Select>
                  {bagCount > 0 && form.bag_type && bagStock[form.bag_type] !== undefined && bagCount > bagStock[form.bag_type] && (
                    <p className="text-red-500 dark:text-red-400 text-[10px] mt-0.5">⚠ {bagCount - bagStock[form.bag_type]} bags short</p>
                  )}
                </div>
                <div>
                  <Label className="text-[11px] text-slate-600 dark:text-slate-400">Bags (total) <span className="text-slate-400 dark:text-slate-500 text-[10px]">(shared)</span></Label>
                  <Input type="number" value={form.bags} onChange={e => setForm(p => ({ ...p, bags: e.target.value }))}
                    className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs" data-testid="bp-bags" />
                </div>
                {product === "Rice Bran" && (
                  <div>
                    <Label className="text-[11px] text-cyan-700 dark:text-cyan-300 font-semibold">Bag W.C (g) <span className="text-slate-400 dark:text-slate-500 text-[10px]">(fixed)</span></Label>
                    <Input type="number" value={form.bag_weight_cut_g}
                      readOnly disabled tabIndex={-1}
                      className="bg-slate-100 dark:bg-slate-800 border-cyan-300 dark:border-cyan-800 text-slate-600 dark:text-slate-300 h-9 text-xs cursor-not-allowed disabled:opacity-100 font-bold" data-testid="bp-bag-cut" />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-[11px] text-blue-700 dark:text-blue-300 font-semibold">N/W (Qtl)</Label>
                  <Input type="number" step="0.01"
                    value={form.net_weight_qtl_display ?? (form.net_weight_kg ? String(Math.round((parseFloat(form.net_weight_kg) || 0) / 100 * 100) / 100) : "")}
                    onChange={e => {
                      const qtl = e.target.value;
                      const newTotalKg = qtl === "" ? "" : String(Math.round((parseFloat(qtl) || 0) * 100 * 100) / 100);
                      const newTotalQtl = parseFloat(qtl) || 0;
                      // New Final M.W (after cut) for auto-balance recompute
                      const newFinalKg = Math.max(0, Math.round((newTotalQtl * 100 - totalCutKg) * 100) / 100);
                      const newFinalQtl = newFinalKg / 100;
                      // If Pakka already set, recalc Kaccha from NEW Final M.W
                      const curPakkaQtl = parseFloat(form.billed_weight_qtl_display) || 0;
                      const newKacchaQtl = curPakkaQtl > 0 ? Math.max(0, Math.round((newFinalQtl - curPakkaQtl) * 100) / 100) : 0;
                      setForm(p => ({
                        ...p,
                        net_weight_qtl_display: qtl, net_weight_kg: newTotalKg,
                        kaccha_weight_qtl_display: curPakkaQtl > 0 ? String(newKacchaQtl) : p.kaccha_weight_qtl_display,
                        kaccha_weight_kg: curPakkaQtl > 0 ? String(Math.round(newKacchaQtl * 100 * 100) / 100) : p.kaccha_weight_kg,
                      }));
                    }}
                    className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs" data-testid="bp-nw-qtl" />
                </div>
                <div>
                  <Label className="text-[11px] text-blue-700 dark:text-blue-300 font-semibold">N/W (Kg) <span className="text-slate-400 dark:text-slate-500 text-[10px]">(auto)</span></Label>
                  <Input type="number" step="0.01" value={form.net_weight_kg}
                    readOnly tabIndex={-1}
                    className="bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-300 h-9 text-xs cursor-not-allowed" data-testid="bp-nw" />
                </div>
                <div>
                  <Label className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">
                    Final M.W (Kg) <span className="text-slate-400 dark:text-slate-500 text-[10px]">(after cut)</span>
                    {stockInfo && <span className={`ml-1 font-bold ${(effectiveAvailQtl - nwQtl) >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>· Stock: {Math.round((effectiveAvailQtl - nwQtl) * 100) / 100} Qtl</span>}
                  </Label>
                  <div className="h-9 px-2 rounded bg-emerald-50 dark:bg-slate-900/60 border border-emerald-400 dark:border-emerald-700/40 flex items-center text-xs text-emerald-700 dark:text-emerald-300 font-mono font-bold" data-testid="bp-final-mw">
                    {nwKg.toFixed(2)}
                    {totalCutKg > 0 && <span className="ml-1 text-[10px] text-slate-500">(−{totalCutKg.toFixed(2)})</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Split billing toggle */}
            <div className="flex items-center justify-between p-3 rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40">
              <div className="flex-1">
                <Label className="text-[12px] text-slate-700 dark:text-slate-200 font-medium flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.split_billing}
                    onChange={e => setForm(p => ({ ...p, split_billing: e.target.checked }))}
                    className="w-4 h-4 accent-amber-500" data-testid="bp-split-toggle" />
                  Split Billing (Pakka + Kaccha)
                </Label>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 ml-6">Final M.W ko Pakka (GST) + Kaccha (slip) me baantke bill — GST sirf Pakka portion pe</p>
              </div>
            </div>

            {!isSplit && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] text-slate-600 dark:text-slate-400">Rate (per Qtl)</Label>
                  <Input type="number" step="0.01" value={form.rate_per_qtl}
                    onChange={e => setForm(p => ({ ...p, rate_per_qtl: e.target.value }))}
                    className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs" data-testid="bp-rate" />
                </div>
                <div>
                  <Label className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold">Amount (on Final M.W)</Label>
                  <div className="h-9 px-2 rounded bg-amber-50 dark:bg-slate-900/60 border border-amber-400 dark:border-amber-700/40 flex items-center text-xs text-amber-700 dark:text-amber-300 font-mono font-bold" data-testid="bp-amount">
                    ₹{amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            )}

            {isSplit && (
              <div className="space-y-2">
                {/* PAKKA */}
                <div className="p-3 rounded bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-500/30 space-y-3">
                  <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Pakka (GST Bill)</p>
                  <div className="grid grid-cols-5 gap-3">
                  <div>
                    <Label className="text-[11px] text-slate-600 dark:text-slate-400">Pakka Wt (Qtl)</Label>
                    <Input type="number" step="0.01"
                      value={form.billed_weight_qtl_display}
                      onChange={e => {
                        const pq = e.target.value;
                        const pakkaQtl = parseFloat(pq) || 0;
                        // Auto-balance FROM Final M.W (nwQtl, post-cut), not Total N/W
                        const kacchaQ = Math.max(0, Math.round((nwQtl - pakkaQtl) * 100) / 100);
                        setForm(p => ({
                          ...p,
                          billed_weight_qtl_display: pq,
                          billed_weight_kg: pq === "" ? "" : String(Math.round(pakkaQtl * 100 * 100) / 100),
                          kaccha_weight_qtl_display: nwQtl > 0 ? String(kacchaQ) : p.kaccha_weight_qtl_display,
                          kaccha_weight_kg: nwQtl > 0 ? String(Math.round(kacchaQ * 100 * 100) / 100) : p.kaccha_weight_kg,
                        }));
                      }}
                      className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs" data-testid="bp-billed-qtl" />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-600 dark:text-slate-400">Pakka Wt (Kg) <span className="text-slate-400 dark:text-slate-500 text-[10px]">(auto)</span></Label>
                    <Input type="number" step="0.01" value={form.billed_weight_kg}
                      readOnly tabIndex={-1}
                      className="bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-300 h-9 text-xs cursor-not-allowed" data-testid="bp-billed-kg" />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-500 dark:text-slate-400">Bags</Label>
                    <div className="h-9 px-2 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center text-xs text-slate-600 dark:text-slate-300 font-mono" data-testid="bp-billed-bags-info">
                      {pakkaBagsInfo}
                    </div>
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-600 dark:text-slate-400">Rate (per Qtl)</Label>
                    <Input type="number" step="0.01" value={form.rate_per_qtl}
                      onChange={e => setForm(p => ({ ...p, rate_per_qtl: e.target.value }))}
                      className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs" data-testid="bp-rate" />
                  </div>
                  <div>
                    <Label className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">Pakka Amount</Label>
                    <div className="h-9 px-2 rounded bg-emerald-50 dark:bg-slate-900/60 border border-emerald-400 dark:border-slate-700 flex items-center text-xs text-emerald-700 dark:text-emerald-300 font-mono font-bold" data-testid="bp-billed-amount">
                      ₹{billedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  </div>
                </div>

                {/* KACCHA — simple 1-row: Qtl | Kg | Rate | Amount (NO bag fields, those are in common block) */}
                <div className="p-3 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-500/30 space-y-3">
                  <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Kaccha (Slip — No GST)</p>
                  <div className="grid grid-cols-5 gap-3">
                    <div>
                      <Label className="text-[11px] text-slate-600 dark:text-slate-400">Kaccha Wt (Qtl)</Label>
                      <Input type="number" step="0.01"
                        value={form.kaccha_weight_qtl_display}
                        onChange={e => {
                          const kq = e.target.value;
                          const kacchaQ = parseFloat(kq) || 0;
                          // Auto-balance FROM Final M.W (nwQtl), not Total N/W
                          const pakkaQ = Math.max(0, Math.round((nwQtl - kacchaQ) * 100) / 100);
                          setForm(p => ({
                            ...p,
                            kaccha_weight_qtl_display: kq,
                            kaccha_weight_kg: kq === "" ? "" : String(Math.round(kacchaQ * 100 * 100) / 100),
                            billed_weight_qtl_display: nwQtl > 0 ? String(pakkaQ) : p.billed_weight_qtl_display,
                            billed_weight_kg: nwQtl > 0 ? String(Math.round(pakkaQ * 100 * 100) / 100) : p.billed_weight_kg,
                          }));
                        }}
                        className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs" data-testid="bp-kaccha-qtl" />
                    </div>
                    <div>
                      <Label className="text-[11px] text-slate-600 dark:text-slate-400">Kaccha Wt (Kg) <span className="text-slate-400 dark:text-slate-500 text-[10px]">(auto)</span></Label>
                      <Input type="number" step="0.01" value={form.kaccha_weight_kg}
                        readOnly tabIndex={-1}
                        className="bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-300 h-9 text-xs cursor-not-allowed" data-testid="bp-kaccha-kg" />
                    </div>
                    <div>
                      <Label className="text-[11px] text-slate-500 dark:text-slate-400">Bags</Label>
                      <div className="h-9 px-2 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center text-xs text-slate-600 dark:text-slate-300 font-mono" data-testid="bp-kaccha-bags-info">
                        {kacchaBagsInfo}
                      </div>
                    </div>
                    <div>
                      <Label className="text-[11px] text-slate-600 dark:text-slate-400">Rate (per Qtl)</Label>
                      <Input type="number" step="0.01" value={form.kaccha_rate_per_qtl}
                        onChange={e => setForm(p => ({ ...p, kaccha_rate_per_qtl: e.target.value }))}
                        placeholder={rate ? String(rate) : "Same as Pakka"}
                        className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs" data-testid="bp-kaccha-rate" />
                    </div>
                    <div>
                      <Label className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold">Kaccha Amount</Label>
                      <div className="h-9 px-2 rounded bg-amber-50 dark:bg-slate-900/60 border border-amber-400 dark:border-slate-700 flex items-center text-xs text-amber-700 dark:text-amber-300 font-mono font-bold" data-testid="bp-kaccha-amount">
                        ₹{kacchaAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mismatch warning — Pakka + Kaccha must equal Final M.W (post-cut) */}
                {nwQtl > 0 && Math.abs(((billedKg + kacchaKg) / 100) - nwQtl) > 0.01 && (
                  <p className="text-amber-500 dark:text-amber-400 text-[10px] text-right">
                    ⚠ Pakka + Kaccha = {((billedKg + kacchaKg) / 100).toFixed(2)} Q, Final M.W = {nwQtl.toFixed(2)} Q (mismatch)
                  </p>
                )}

                <div className="flex items-center justify-between px-2 py-1.5 rounded bg-slate-700/50 text-[11px]">
                  <span className="text-slate-600 dark:text-slate-400">Total Physical Dispatch:</span>
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
                    <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Pakka Amount ({billedQtl.toFixed(2)} Q × {rate})</span><span className="text-emerald-400 font-bold">₹{billedAmount.toLocaleString('en-IN')}</span></div>
                    {taxAmt > 0 && <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">GST ({gstPct}% on Pakka)</span><span className="text-orange-400">₹{taxAmt.toLocaleString('en-IN')}</span></div>}
                    <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Kaccha Amount ({kacchaQtl.toFixed(2)} Q × {kacchaRate})</span><span className="text-amber-400 font-bold">₹{kacchaAmount.toLocaleString('en-IN')}</span></div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Amount ({nwQtl.toFixed(2)} Q × {rate})</span><span className="text-emerald-400 font-bold">₹{amount.toLocaleString('en-IN')}</span></div>
                    {taxAmt > 0 && <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Tax ({gstPct}%)</span><span className="text-orange-400">₹{taxAmt.toLocaleString('en-IN')}</span></div>}
                  </>
                )}
                <div className="flex justify-between border-t border-slate-600 pt-1"><span className="text-white font-bold">Total Receivable</span><span className="text-emerald-400 font-bold text-sm">₹{total.toLocaleString('en-IN')}</span></div>
              </div>
            )}

            {/* GST + Sauda Amount (info-only) */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-[11px] text-slate-600 dark:text-slate-400">Tax</Label>
                <Select value={form.gst_type} onValueChange={v => setForm(p => ({ ...p, gst_type: v, gst_percent: v === "none" ? "" : "5" }))}>
                  <SelectTrigger className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Tax</SelectItem>
                    <SelectItem value="gst">GST</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.gst_type !== "none" ? (
                <div>
                  <Label className="text-[11px] text-slate-600 dark:text-slate-400">GST %</Label>
                  <Select value={form.gst_percent || "5"} onValueChange={v => setForm(p => ({ ...p, gst_percent: v }))}>
                    <SelectTrigger className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{[5, 12, 18, 28].map(g => <SelectItem key={g} value={String(g)}>{g}%</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : <div />}
              <div>
                <Label className="text-[11px] text-slate-600 dark:text-slate-400" title="Sirf jaankari ke liye — kisi calculation mein use nahi hota">
                  Sauda Amount (per Qtl) <span className="text-slate-400 dark:text-slate-500">(info only)</span>
                </Label>
                <Input type="number" step="0.01" value={form.sauda_amount}
                  onChange={e => setForm(p => ({ ...p, sauda_amount: e.target.value }))}
                  placeholder="e.g. 3700"
                  className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs" data-testid="bp-sauda-amount" />
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
                    className="bg-amber-900/20 border-amber-700 text-amber-200 h-9 text-xs font-bold" data-testid="bp-bhada" />
                  <p className="text-[9px] text-slate-500 mt-0.5">Truck owner ko diya jaane wala lump-sum freight</p>
                </div>
                <div>
                  <Label className="text-[10px] text-sky-400">Advance (Party se)</Label>
                  <Input type="number" value={form.advance} onChange={e => setForm(p => ({ ...p, advance: e.target.value }))}
                    placeholder="0" className="bg-sky-900/20 border-sky-700 text-sky-300 h-9 text-xs" data-testid="bp-advance" />
                </div>
                <div>
                  <Label className="text-[11px] text-slate-600 dark:text-slate-400">Balance (Party par baki)</Label>
                  <div className={`h-8 flex items-center px-2 rounded border text-xs font-bold ${balance > 0 ? 'bg-red-900/20 border-red-700 text-red-400' : 'bg-green-900/20 border-green-700 text-green-400'}`}>
                    Rs.{balance.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <Label className="text-[11px] text-slate-600 dark:text-slate-400">Remark</Label>
              <Input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))}
                placeholder="Optional" className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white h-9 text-xs" data-testid="bp-remark" />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-slate-900 flex-1" data-testid="bp-sale-submit">
                {editingId ? "Update" : "Save Sale"} <span className="ml-1 text-[9px] opacity-70 font-normal hidden sm:inline">(Enter)</span>
              </Button>
              {!editingId && (
                <Button type="button" onClick={() => handleSubmit(null, { saveAndNew: true })}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white" data-testid="bp-sale-save-new">
                  Save &amp; New <span className="ml-1 text-[9px] opacity-70 font-normal hidden sm:inline">(Ctrl+S)</span>
                </Button>
              )}
              <Button type="button" variant="outline" className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300" onClick={() => setIsFormOpen(false)}>
                Cancel <span className="ml-1 text-[9px] opacity-70 hidden sm:inline">(Esc)</span>
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {/* v104.44.39 — Send to WhatsApp Group dialog */}
      <SendToGroupDialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen} text={groupText} pdfUrl={groupPdfUrl} />

      {/* v104.44.56 Option C — Party Statement Dialog */}
      <Dialog open={stmtDialogOpen} onOpenChange={setStmtDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md" data-testid="bp-stmt-dialog">
          <DialogHeader>
            <DialogTitle className="text-purple-400 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Party Statement
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-slate-600 dark:text-slate-400">Party Name</Label>
              <Input list="stmt-party-list" value={stmtParty} onChange={e => setStmtParty(e.target.value)}
                placeholder="Type or select party..."
                className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-xs h-8 mt-1"
                data-testid="bp-stmt-party" />
              <datalist id="stmt-party-list">
                {partySugg.map(p => <option key={p} value={p} />)}
              </datalist>
              <p className="text-[10px] text-slate-500 mt-1">Statement {gstFilter === 'ALL' ? 'PKA + KCA combined' : gstFilter + ' only'} mode me banayega. Filters (KMS year, season) apply honge.</p>
            </div>
            <div className="flex gap-2 pt-2 border-t border-slate-700">
              <Button onClick={async () => {
                if (!stmtParty.trim()) { toast.error("Party name daalein"); return; }
                try {
                  const params = new URLSearchParams();
                  params.append('party', stmtParty.trim());
                  if (filters.kms_year) params.append('kms_year', filters.kms_year);
                  if (filters.season) params.append('season', filters.season);
                  if (gstFilter && gstFilter !== 'ALL') params.append('gst_filter', gstFilter);
                  const { downloadFile } = await import('../utils/download');
                  const fname = `${stmtParty.toLowerCase().replace(/\s+/g, '_')}_statement_${new Date().toISOString().slice(0, 10)}.xlsx`;
                  downloadFile(`/api/bp-sale-register/export/statement-excel?${params}`, fname);
                  toast.success("Statement Excel downloaded");
                  setStmtDialogOpen(false);
                } catch(e) { toast.error("Statement Excel fail"); }
              }} className="flex-1 bg-green-600 hover:bg-green-700 text-white" data-testid="bp-stmt-excel">
                <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
              </Button>
              <Button onClick={async () => {
                if (!stmtParty.trim()) { toast.error("Party name daalein"); return; }
                try {
                  const params = new URLSearchParams();
                  params.append('party', stmtParty.trim());
                  if (filters.kms_year) params.append('kms_year', filters.kms_year);
                  if (filters.season) params.append('season', filters.season);
                  if (gstFilter && gstFilter !== 'ALL') params.append('gst_filter', gstFilter);
                  const { downloadFile } = await import('../utils/download');
                  const fname = `${stmtParty.toLowerCase().replace(/\s+/g, '_')}_statement_${new Date().toISOString().slice(0, 10)}.pdf`;
                  downloadFile(`/api/bp-sale-register/export/statement-pdf?${params}`, fname);
                  toast.success("Statement PDF downloaded");
                  setStmtDialogOpen(false);
                } catch(e) { toast.error("Statement PDF fail"); }
              }} className="flex-1 bg-red-600 hover:bg-red-700 text-white" data-testid="bp-stmt-pdf">
                <FileText className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button onClick={async () => {
                if (!stmtParty.trim()) { toast.error("Party name daalein"); return; }
                try {
                  const params = new URLSearchParams();
                  params.append('party', stmtParty.trim());
                  if (filters.kms_year) params.append('kms_year', filters.kms_year);
                  if (filters.season) params.append('season', filters.season);
                  if (gstFilter && gstFilter !== 'ALL') params.append('gst_filter', gstFilter);
                  const url = `${API}/bp-sale-register/export/statement-pdf?${params}`;
                  const res = await fetch(url, { credentials: 'include' });
                  const blob = await res.blob();
                  const fname = `${stmtParty.toLowerCase().replace(/\s+/g, '_')}_statement.pdf`;
                  const file = new File([blob], fname, { type: 'application/pdf' });
                  if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: fname, text: `${stmtParty} Statement` });
                    toast.success("Share dialog open");
                  } else {
                    const url2 = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url2; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
                    setTimeout(() => URL.revokeObjectURL(url2), 4000);
                    window.open(`https://wa.me/?text=${encodeURIComponent(`${stmtParty} Statement`)}`, "_blank");
                  }
                  setStmtDialogOpen(false);
                } catch(e) { toast.error("Share fail"); }
              }} className="flex-1 bg-[#25D366] hover:bg-green-700 text-white" data-testid="bp-stmt-whatsapp">
                <WhatsAppIcon className="w-4 h-4 mr-1" /> Send
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </>)}
    </div>
  );
}
