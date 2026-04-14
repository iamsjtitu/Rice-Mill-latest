import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  FileSpreadsheet, Plus, Pencil, Trash2, Loader2,
  BookOpen, Package, FlaskConical, ShoppingBag, ClipboardList,
  RefreshCw, Download, FileText, Search, Truck, Shield, ArrowRightLeft
} from "lucide-react";
import MandiCustodyRegister from "./MandiCustodyRegister";
import { useConfirm } from "./ConfirmProvider";
import { Label } from "@/components/ui/label";
import logger from "../utils/logger";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

// ============ SUB TABS CONFIG ============
const SUB_TABS = [
  { id: "paddy-custody", label: "Paddy Custody", desc: "Custody Register", icon: ClipboardList },
  { id: "transit-pass", label: "Transit Pass", desc: "TP Register", icon: Truck },
  { id: "milling-register", label: "Milling Register", desc: "Paddy/Rice Ledger", icon: ArrowRightLeft },
  { id: "form-a", label: "Form A", desc: "Paddy from OSCSC", icon: BookOpen },
  { id: "form-b", label: "Form B", desc: "CMR Delivery", icon: BookOpen },
  { id: "form-e", label: "Form E", desc: "Own Paddy", icon: ShoppingBag },
  { id: "form-f", label: "Form F", desc: "Own Rice Sale", icon: ShoppingBag },
  { id: "frk", label: "FRK Blending", desc: "Fortified Rice", icon: FlaskConical },
  { id: "gunny-bags", label: "Gunny Bags", desc: "Bag Stock", icon: Package },
  { id: "security-deposit", label: "Security Deposit", desc: "Bank Guarantee", icon: Shield },
];

// ============ PADDY CUSTODY REGISTER (Moved from Milling Tracker) ============
function PaddyCustodyRegister({ filters }) {
  const [view, setView] = useState("register"); // "register" or "mandi"
  const [register, setRegister] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("daily"); // "daily" or "weekly"

  const fetchRegister = useCallback(async () => {
    try { setLoading(true);
      const params = new URLSearchParams();
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      params.append('group_by', viewMode);
      const res = await axios.get(`${API}/paddy-custody-register?${params}`);
      setRegister(res.data);
    } catch (e) { logger.error(e); toast.error("Register load nahi hua"); } finally { setLoading(false); }
  }, [filters, viewMode]);

  useEffect(() => { fetchRegister(); }, [fetchRegister]);

  const exportExcel = async () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    params.append('group_by', viewMode);
    window.open(`${API}/paddy-custody-register/excel?${params}`, "_blank");
  };

  const exportPdf = async () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    params.append('group_by', viewMode);
    window.open(`${API}/paddy-custody-register/pdf?${params}`, "_blank");
  };

  return (
    <div className="space-y-4" data-testid="paddy-custody-register">
      {/* Toggle: Register / Mandi Wise */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          <Button onClick={() => setView("register")} size="sm"
            className={view === "register" ? "bg-amber-600 text-white hover:bg-amber-500" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}
            data-testid="custody-view-register">
            <ClipboardList className="w-3.5 h-3.5 mr-1.5" /> Paddy Custody Register
          </Button>
          <Button onClick={() => setView("mandi")} size="sm"
            className={view === "mandi" ? "bg-amber-600 text-white hover:bg-amber-500" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}
            data-testid="custody-view-mandi">
            <Package className="w-3.5 h-3.5 mr-1.5" /> Mandi Wise Custody Register
          </Button>
        </div>
        {view === "register" && (
          <div className="flex gap-2">
            <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5">
              <button onClick={() => setViewMode("daily")} className={`px-3 py-1 rounded text-xs font-medium transition ${viewMode === "daily" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-white"}`} data-testid="custody-daily-btn">Daily</button>
              <button onClick={() => setViewMode("weekly")} className={`px-3 py-1 rounded text-xs font-medium transition ${viewMode === "weekly" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-white"}`} data-testid="custody-weekly-btn">Weekly</button>
            </div>
            <Button onClick={fetchRegister} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
            <Button onClick={exportExcel} size="sm" className="bg-green-700 hover:bg-green-600" data-testid="custody-export-excel"><FileSpreadsheet className="w-4 h-4 mr-1" /> Excel</Button>
            <Button onClick={exportPdf} size="sm" className="bg-red-700 hover:bg-red-600" data-testid="custody-export-pdf"><FileText className="w-4 h-4 mr-1" /> PDF</Button>
          </div>
        )}
      </div>

      {view === "mandi" ? (
        <MandiCustodyRegister filters={filters} />
      ) : (
        <>
          {register && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <SummaryCard label="Total Received" value={`${register.total_received} Qtl`} color="green" />
              <SummaryCard label="Total Released" value={`${register.total_issued} Qtl`} color="blue" />
              <SummaryCard label="Current Balance" value={`${register.final_balance} Qtl`} color="amber" />
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-sm" data-testid="custody-table">
              <thead>
                <tr className="bg-slate-800 text-slate-300">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-right">Received (Qtl)</th>
                  <th className="px-3 py-2 text-right">Released (Qtl)</th>
                  <th className="px-3 py-2 text-right">Balance (Qtl)</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-400" /></td></tr>
                ) : (!register || register.rows.length === 0) ? (
                  <tr><td colSpan={5} className="text-center py-6 text-slate-500">Koi entry nahi</td></tr>
                ) : register.rows.map((r, i) => (
                  <tr key={i} className={`border-t border-slate-700/50 ${r.type === 'received' ? 'bg-green-900/10' : 'bg-orange-900/10'}`}>
                    <td className="px-3 py-2 text-slate-300">{formatDate(r.date)}</td>
                    <td className="px-3 py-2 text-slate-400 text-xs">{r.description}</td>
                    <td className={`px-3 py-2 text-right font-medium ${r.received_qntl > 0 ? 'text-green-400' : 'text-slate-600'}`}>{r.received_qntl > 0 ? r.received_qntl : '-'}</td>
                    <td className={`px-3 py-2 text-right font-medium ${r.issued_qntl > 0 ? 'text-orange-400' : 'text-slate-600'}`}>{r.issued_qntl > 0 ? r.issued_qntl : '-'}</td>
                    <td className="px-3 py-2 text-right text-amber-400 font-bold">{r.balance_qntl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ============ FORM A COMPONENT ============
function FormARegister({ filters }) {
  const [data, setData] = useState({ rows: [], summary: {} });
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState("daily"); // "daily" or "weekly"

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      if (filters.season) params.append("season", filters.season);
      if (filters.date_from) params.append("date_from", filters.date_from);
      if (filters.date_to) params.append("date_to", filters.date_to);
      params.append("group_by", viewMode);
      const res = await axios.get(`${API}/govt-registers/form-a?${params}`);
      setData(res.data);
    } catch (e) { logger.error(e); toast.error("Form A data load error"); }
    setLoading(false);
  }, [filters, viewMode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleExcel = () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append("kms_year", filters.kms_year);
    if (filters.season) params.append("season", filters.season);
    if (filters.date_from) params.append("date_from", filters.date_from);
    if (filters.date_to) params.append("date_to", filters.date_to);
    params.append("group_by", viewMode);
    window.open(`${API}/govt-registers/form-a/excel?${params}`, "_blank");
  };

  return (
    <div className="space-y-4" data-testid="form-a-register">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold text-amber-400">Form A - Paddy Stock Register</h3>
          <p className="text-xs text-slate-400">Paddy received from OSCSC/State Procuring Agency (Mill Entries se linked)</p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5">
            <button onClick={() => setViewMode("daily")} className={`px-3 py-1 rounded text-xs font-medium transition ${viewMode === "daily" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-white"}`} data-testid="form-a-daily-btn">Daily</button>
            <button onClick={() => setViewMode("weekly")} className={`px-3 py-1 rounded text-xs font-medium transition ${viewMode === "weekly" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-white"}`} data-testid="form-a-weekly-btn">Weekly</button>
          </div>
          <Button onClick={handleExcel} size="sm" className="bg-green-700 hover:bg-green-600" data-testid="form-a-excel-btn">
            <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
          </Button>
          <Button onClick={() => {
            const params = new URLSearchParams();
            if (filters.kms_year) params.append("kms_year", filters.kms_year);
            if (filters.season) params.append("season", filters.season);
            if (filters.date_from) params.append("date_from", filters.date_from);
            if (filters.date_to) params.append("date_to", filters.date_to);
            params.append("group_by", viewMode);
            window.open(`${API}/govt-registers/form-a/pdf?${params}`, "_blank");
          }} size="sm" className="bg-red-700 hover:bg-red-600" data-testid="form-a-pdf-btn">
            <FileText className="w-4 h-4 mr-1" /> PDF
          </Button>
        </div>
      </div>
      {loading ? <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-400" /></div> : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Total Received" value={`${data.summary?.total_received || 0} Qtl`} color="green" />
            <SummaryCard label="Total Milled" value={`${data.summary?.total_milled || 0} Qtl`} color="blue" />
            <SummaryCard label="Balance" value={`${data.summary?.final_balance || 0} Qtl`} color="amber" />
            <SummaryCard label={viewMode === "weekly" ? "Weeks" : "Days"} value={data.summary?.total_days || 0} color="purple" />
          </div>
          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-sm" data-testid="form-a-table">
              <thead>
                <tr className="bg-slate-800 text-slate-300">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-right">Opening Bal (Qtl)</th>
                  <th className="px-3 py-2 text-right">Received (Qtl)</th>
                  <th className="px-3 py-2 text-right">Bags</th>
                  <th className="px-3 py-2 text-right">Total (Qtl)</th>
                  <th className="px-3 py-2 text-right">Milled (Qtl)</th>
                  <th className="px-3 py-2 text-right">Closing Bal (Qtl)</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-6 text-slate-500">Koi data nahi mila</td></tr>
                ) : data.rows.map((r, i) => (
                  <tr key={i} className={`border-t border-slate-700/50 ${i % 2 === 0 ? 'bg-slate-800/30' : ''}`}>
                    <td className="px-3 py-2 text-slate-300">{formatDate(r.date)}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{r.opening_balance}</td>
                    <td className="px-3 py-2 text-right text-green-400 font-medium">{r.received_qntl}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{r.bags}</td>
                    <td className="px-3 py-2 text-right text-slate-300">{r.total_paddy}</td>
                    <td className="px-3 py-2 text-right text-blue-400">{r.milled_qntl}</td>
                    <td className="px-3 py-2 text-right text-amber-400 font-medium">{r.closing_balance}</td>
                  </tr>
                ))}
              </tbody>
              {data.rows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-700/50 font-bold border-t-2 border-slate-600">
                    <td className="px-3 py-2 text-amber-400">TOTAL</td>
                    <td className="px-3 py-2 text-right">-</td>
                    <td className="px-3 py-2 text-right text-green-400">{data.summary?.total_received}</td>
                    <td className="px-3 py-2 text-right">-</td>
                    <td className="px-3 py-2 text-right">-</td>
                    <td className="px-3 py-2 text-right text-blue-400">{data.summary?.total_milled}</td>
                    <td className="px-3 py-2 text-right text-amber-400">{data.summary?.final_balance}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ============ FORM B COMPONENT ============
function FormBRegister({ filters }) {
  const [data, setData] = useState({ rows: [], summary: {} });
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      if (filters.season) params.append("season", filters.season);
      if (filters.date_from) params.append("date_from", filters.date_from);
      if (filters.date_to) params.append("date_to", filters.date_to);
      const res = await axios.get(`${API}/govt-registers/form-b?${params}`);
      setData(res.data);
    } catch (e) { logger.error(e); toast.error("Form B data load error"); }
    setLoading(false);
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleExcel = () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append("kms_year", filters.kms_year);
    if (filters.season) params.append("season", filters.season);
    window.open(`${API}/govt-registers/form-b/excel?${params}`, "_blank");
  };

  return (
    <div className="space-y-4" data-testid="form-b-register">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold text-amber-400">Form B - CMR Register</h3>
          <p className="text-xs text-slate-400">Custom Milled Rice (CMR) produced & delivered (Milling + Sale Book se linked)</p>
        </div>
        <Button onClick={handleExcel} size="sm" className="bg-green-700 hover:bg-green-600" data-testid="form-b-excel-btn">
          <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel Export
        </Button>
      </div>
      {loading ? <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-400" /></div> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryCard label="Total Produced" value={`${data.summary?.total_produced || 0} Qtl`} color="green" />
            <SummaryCard label="Total Delivered" value={`${data.summary?.total_delivered || 0} Qtl`} color="blue" />
            <SummaryCard label="Balance" value={`${data.summary?.final_balance || 0} Qtl`} color="amber" />
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-sm" data-testid="form-b-table">
              <thead>
                <tr className="bg-slate-800 text-slate-300">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-right">Opening Bal (Qtl)</th>
                  <th className="px-3 py-2 text-right">CMR Produced (Qtl)</th>
                  <th className="px-3 py-2 text-right">Total Rice (Qtl)</th>
                  <th className="px-3 py-2 text-right">CMR Delivered (Qtl)</th>
                  <th className="px-3 py-2 text-right">Closing Bal (Qtl)</th>
                  <th className="px-3 py-2 text-left">Delivered To</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-6 text-slate-500">Koi data nahi mila</td></tr>
                ) : data.rows.map((r, i) => (
                  <tr key={i} className={`border-t border-slate-700/50 ${i % 2 === 0 ? 'bg-slate-800/30' : ''}`}>
                    <td className="px-3 py-2 text-slate-300">{formatDate(r.date)}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{r.opening_balance}</td>
                    <td className="px-3 py-2 text-right text-green-400 font-medium">{r.cmr_produced}</td>
                    <td className="px-3 py-2 text-right text-slate-300">{r.total_rice}</td>
                    <td className="px-3 py-2 text-right text-blue-400">{r.cmr_delivered}</td>
                    <td className="px-3 py-2 text-right text-amber-400 font-medium">{r.closing_balance}</td>
                    <td className="px-3 py-2 text-slate-400 text-xs">{r.delivered_to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ============ FORM E COMPONENT ============
function FormERegister({ filters }) {
  const [data, setData] = useState({ rows: [], summary: {} });
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      if (filters.season) params.append("season", filters.season);
      const res = await axios.get(`${API}/govt-registers/form-e?${params}`);
      setData(res.data);
    } catch (e) { logger.error(e); toast.error("Form E data load error"); }
    setLoading(false);
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleExcel = () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append("kms_year", filters.kms_year);
    if (filters.season) params.append("season", filters.season);
    window.open(`${API}/govt-registers/form-e/excel?${params}`, "_blank");
  };

  return (
    <div className="space-y-4" data-testid="form-e-register">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold text-amber-400">Form E - Miller's Own Paddy</h3>
          <p className="text-xs text-slate-400">Private paddy purchases & stock (Private Trading se linked)</p>
        </div>
        <Button onClick={handleExcel} size="sm" className="bg-green-700 hover:bg-green-600" data-testid="form-e-excel-btn">
          <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel Export
        </Button>
      </div>
      {loading ? <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-400" /></div> : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <SummaryCard label="Total Purchased" value={`${data.summary?.total_purchased || 0} Qtl`} color="green" />
            <SummaryCard label="Balance" value={`${data.summary?.final_balance || 0} Qtl`} color="amber" />
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-sm" data-testid="form-e-table">
              <thead>
                <tr className="bg-slate-800 text-slate-300">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-right">Opening Bal (Qtl)</th>
                  <th className="px-3 py-2 text-right">Purchased (Qtl)</th>
                  <th className="px-3 py-2 text-right">Bags</th>
                  <th className="px-3 py-2 text-right">Total (Qtl)</th>
                  <th className="px-3 py-2 text-right">Closing Bal (Qtl)</th>
                  <th className="px-3 py-2 text-left">Party</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-6 text-slate-500">Koi data nahi mila</td></tr>
                ) : data.rows.map((r, i) => (
                  <tr key={i} className={`border-t border-slate-700/50 ${i % 2 === 0 ? 'bg-slate-800/30' : ''}`}>
                    <td className="px-3 py-2 text-slate-300">{formatDate(r.date)}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{r.opening_balance}</td>
                    <td className="px-3 py-2 text-right text-green-400 font-medium">{r.purchased_qntl}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{r.bags}</td>
                    <td className="px-3 py-2 text-right text-slate-300">{r.total}</td>
                    <td className="px-3 py-2 text-right text-amber-400 font-medium">{r.closing_balance}</td>
                    <td className="px-3 py-2 text-slate-400 text-xs">{r.parties}</td>
                    <td className="px-3 py-2 text-right text-slate-300">{r.amount?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ============ FORM F COMPONENT ============
function FormFRegister({ filters }) {
  const [data, setData] = useState({ rows: [], summary: {} });
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      if (filters.season) params.append("season", filters.season);
      const res = await axios.get(`${API}/govt-registers/form-f?${params}`);
      setData(res.data);
    } catch (e) { logger.error(e); toast.error("Form F data load error"); }
    setLoading(false);
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleExcel = () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append("kms_year", filters.kms_year);
    if (filters.season) params.append("season", filters.season);
    window.open(`${API}/govt-registers/form-f/excel?${params}`, "_blank");
  };

  return (
    <div className="space-y-4" data-testid="form-f-register">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold text-amber-400">Form F - Miller's Own Rice Sale</h3>
          <p className="text-xs text-slate-400">Rice produced & sold from own account (Sale Book se linked)</p>
        </div>
        <Button onClick={handleExcel} size="sm" className="bg-green-700 hover:bg-green-600" data-testid="form-f-excel-btn">
          <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel Export
        </Button>
      </div>
      {loading ? <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-400" /></div> : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-sm" data-testid="form-f-table">
            <thead>
              <tr className="bg-slate-800 text-slate-300">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-right">Rice Sold (Qtl)</th>
                <th className="px-3 py-2 text-left">Party Name</th>
                <th className="px-3 py-2 text-right">Amount (Rs)</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-6 text-slate-500">Koi data nahi mila</td></tr>
              ) : data.rows.map((r, i) => (
                <tr key={i} className={`border-t border-slate-700/50 ${i % 2 === 0 ? 'bg-slate-800/30' : ''}`}>
                  <td className="px-3 py-2 text-slate-300">{formatDate(r.date)}</td>
                  <td className="px-3 py-2 text-right text-green-400 font-medium">{r.sold_qntl}</td>
                  <td className="px-3 py-2 text-slate-400">{r.parties}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{r.amount?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            {data.rows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-700/50 font-bold border-t-2 border-slate-600">
                  <td className="px-3 py-2 text-amber-400">TOTAL</td>
                  <td className="px-3 py-2 text-right text-green-400">{data.summary?.total_sold}</td>
                  <td className="px-3 py-2">-</td>
                  <td className="px-3 py-2 text-right">-</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

// ============ FRK BLENDING REGISTER COMPONENT ============
function FrkRegister({ filters, user }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    batch_no: "", supplier: "",
    opening_balance: "", received_qty: "", issued_for_blending: "",
    rice_blended_qty: "", blend_ratio: "1:100", remark: ""
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      if (filters.season) params.append("season", filters.season);
      const res = await axios.get(`${API}/govt-registers/frk?${params}`);
      setEntries(res.data);
    } catch (e) { logger.error(e); toast.error("FRK data load error"); }
    setLoading(false);
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    try {
      const payload = {
        ...form,
        kms_year: filters.kms_year || "",
        season: filters.season || "",
        opening_balance: parseFloat(form.opening_balance) || 0,
        received_qty: parseFloat(form.received_qty) || 0,
        issued_for_blending: parseFloat(form.issued_for_blending) || 0,
        rice_blended_qty: parseFloat(form.rice_blended_qty) || 0,
      };
      if (editingId) {
        await axios.put(`${API}/govt-registers/frk/${editingId}?username=${user.username}`, payload);
        toast.success("FRK entry update ho gayi!");
      } else {
        await axios.post(`${API}/govt-registers/frk?username=${user.username}`, payload);
        toast.success("FRK entry add ho gayi!");
      }
      setDialogOpen(false);
      setEditingId(null);
      setForm({ date: new Date().toISOString().split("T")[0], batch_no: "", supplier: "", opening_balance: "", received_qty: "", issued_for_blending: "", rice_blended_qty: "", blend_ratio: "1:100", remark: "" });
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Save error"); }
  };

  const handleEdit = (entry) => {
    setForm({
      date: entry.date || "",
      batch_no: entry.batch_no || "",
      supplier: entry.supplier || "",
      opening_balance: String(entry.opening_balance || ""),
      received_qty: String(entry.received_qty || ""),
      issued_for_blending: String(entry.issued_for_blending || ""),
      rice_blended_qty: String(entry.rice_blended_qty || ""),
      blend_ratio: entry.blend_ratio || "1:100",
      remark: entry.remark || "",
    });
    setEditingId(entry.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Kya aap sure hain?")) return;
    try {
      await axios.delete(`${API}/govt-registers/frk/${id}?username=${user.username}&role=${user.role}`);
      toast.success("FRK entry delete ho gayi!");
      fetchData();
    } catch (e) { logger.error(e); toast.error("Delete error"); }
  };

  const handleExcel = () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append("kms_year", filters.kms_year);
    if (filters.season) params.append("season", filters.season);
    window.open(`${API}/govt-registers/frk/excel?${params}`, "_blank");
  };

  return (
    <div className="space-y-4" data-testid="frk-register">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold text-amber-400">FRK Blending Register</h3>
          <p className="text-xs text-slate-400">Fortified Rice Kernel (FRK) batch tracking - OSCSC 1:100 ratio</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setEditingId(null); setForm({ date: new Date().toISOString().split("T")[0], batch_no: "", supplier: "", opening_balance: "", received_qty: "", issued_for_blending: "", rice_blended_qty: "", blend_ratio: "1:100", remark: "" }); setDialogOpen(true); }} size="sm" className="bg-amber-600 hover:bg-amber-500" data-testid="frk-add-btn">
            <Plus className="w-4 h-4 mr-1" /> Add Entry
          </Button>
          <Button onClick={handleExcel} size="sm" className="bg-green-700 hover:bg-green-600" data-testid="frk-excel-btn">
            <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
          </Button>
        </div>
      </div>

      {loading ? <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-400" /></div> : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-sm" data-testid="frk-table">
            <thead>
              <tr className="bg-slate-800 text-slate-300">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Batch No</th>
                <th className="px-3 py-2 text-left">Supplier</th>
                <th className="px-3 py-2 text-right">Opening (Kg)</th>
                <th className="px-3 py-2 text-right">Received (Kg)</th>
                <th className="px-3 py-2 text-right">Total (Kg)</th>
                <th className="px-3 py-2 text-right">Issued (Kg)</th>
                <th className="px-3 py-2 text-right">Closing (Kg)</th>
                <th className="px-3 py-2 text-right">Rice Blended (Qtl)</th>
                <th className="px-3 py-2 text-center">Ratio</th>
                <th className="px-3 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-6 text-slate-500">Koi FRK entry nahi hai</td></tr>
              ) : entries.map((e, i) => (
                <tr key={e.id} className={`border-t border-slate-700/50 ${i % 2 === 0 ? 'bg-slate-800/30' : ''}`}>
                  <td className="px-3 py-2 text-slate-300">{formatDate(e.date)}</td>
                  <td className="px-3 py-2 text-slate-300">{e.batch_no}</td>
                  <td className="px-3 py-2 text-slate-400">{e.supplier}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{e.opening_balance}</td>
                  <td className="px-3 py-2 text-right text-green-400">{e.received_qty}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{e.total}</td>
                  <td className="px-3 py-2 text-right text-blue-400">{e.issued_for_blending}</td>
                  <td className="px-3 py-2 text-right text-amber-400 font-medium">{e.closing_balance}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{e.rice_blended_qty}</td>
                  <td className="px-3 py-2 text-center text-slate-400">{e.blend_ratio}</td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => handleEdit(e)} className="p-1 hover:bg-slate-700 rounded" data-testid={`frk-edit-${e.id}`}><Pencil className="w-3.5 h-3.5 text-blue-400" /></button>
                      <button onClick={() => handleDelete(e.id)} className="p-1 hover:bg-red-900/30 rounded" data-testid={`frk-delete-${e.id}`}><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* FRK Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-amber-400">{editingId ? "Edit" : "New"} FRK Entry</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-slate-400">Date</label><Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="frk-date" /></div>
            <div><label className="text-xs text-slate-400">Batch No</label><Input value={form.batch_no} onChange={e => setForm(p => ({ ...p, batch_no: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" placeholder="FRK/001" data-testid="frk-batch" /></div>
            <div className="col-span-2"><label className="text-xs text-slate-400">Supplier</label><Input value={form.supplier} onChange={e => setForm(p => ({ ...p, supplier: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" placeholder="FSSAI/ISO certified supplier" data-testid="frk-supplier" /></div>
            <div><label className="text-xs text-slate-400">Opening Balance (Kg)</label><Input type="number" value={form.opening_balance} onChange={e => setForm(p => ({ ...p, opening_balance: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="frk-opening" /></div>
            <div><label className="text-xs text-slate-400">Received Qty (Kg)</label><Input type="number" value={form.received_qty} onChange={e => setForm(p => ({ ...p, received_qty: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="frk-received" /></div>
            <div><label className="text-xs text-slate-400">Issued for Blending (Kg)</label><Input type="number" value={form.issued_for_blending} onChange={e => setForm(p => ({ ...p, issued_for_blending: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="frk-issued" /></div>
            <div><label className="text-xs text-slate-400">Rice Blended (Qtl)</label><Input type="number" value={form.rice_blended_qty} onChange={e => setForm(p => ({ ...p, rice_blended_qty: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="frk-rice-blended" /></div>
            <div><label className="text-xs text-slate-400">Blend Ratio</label>
              <Select value={form.blend_ratio} onValueChange={v => setForm(p => ({ ...p, blend_ratio: v }))}>
                <SelectTrigger className="bg-slate-900 border-slate-600 text-white" data-testid="frk-ratio"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  <SelectItem value="1:100" className="text-white">1:100</SelectItem>
                  <SelectItem value="1:150" className="text-white">1:150</SelectItem>
                  <SelectItem value="1:200" className="text-white">1:200</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><label className="text-xs text-slate-400">Remark</label><Input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="frk-remark" /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => setDialogOpen(false)} variant="outline" className="border-slate-600 text-slate-300">Cancel</Button>
            <Button onClick={handleSave} className="bg-amber-600 hover:bg-amber-500" data-testid="frk-save-btn">{editingId ? "Update" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ GUNNY BAG REGISTER COMPONENT ============
function GunnyBagRegister({ filters, user }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    bag_type: "new", source: "",
    opening_balance: "", received: "",
    used_for_rice: "", used_for_paddy: "",
    damaged: "", returned: "", remark: ""
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      if (filters.season) params.append("season", filters.season);
      const res = await axios.get(`${API}/govt-registers/gunny-bags?${params}`);
      setEntries(res.data);
    } catch (e) { logger.error(e); toast.error("Gunny bag data load error"); }
    setLoading(false);
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    try {
      const payload = {
        ...form,
        kms_year: filters.kms_year || "",
        season: filters.season || "",
        opening_balance: parseInt(form.opening_balance) || 0,
        received: parseInt(form.received) || 0,
        used_for_rice: parseInt(form.used_for_rice) || 0,
        used_for_paddy: parseInt(form.used_for_paddy) || 0,
        damaged: parseInt(form.damaged) || 0,
        returned: parseInt(form.returned) || 0,
      };
      if (editingId) {
        await axios.put(`${API}/govt-registers/gunny-bags/${editingId}?username=${user.username}`, payload);
        toast.success("Gunny bag entry update ho gayi!");
      } else {
        await axios.post(`${API}/govt-registers/gunny-bags?username=${user.username}`, payload);
        toast.success("Gunny bag entry add ho gayi!");
      }
      setDialogOpen(false);
      setEditingId(null);
      setForm({ date: new Date().toISOString().split("T")[0], bag_type: "new", source: "", opening_balance: "", received: "", used_for_rice: "", used_for_paddy: "", damaged: "", returned: "", remark: "" });
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Save error"); }
  };

  const handleEdit = (entry) => {
    setForm({
      date: entry.date || "",
      bag_type: entry.bag_type || "new",
      source: entry.source || "",
      opening_balance: String(entry.opening_balance || ""),
      received: String(entry.received || ""),
      used_for_rice: String(entry.used_for_rice || ""),
      used_for_paddy: String(entry.used_for_paddy || ""),
      damaged: String(entry.damaged || ""),
      returned: String(entry.returned || ""),
      remark: entry.remark || "",
    });
    setEditingId(entry.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Kya aap sure hain?")) return;
    try {
      await axios.delete(`${API}/govt-registers/gunny-bags/${id}?username=${user.username}&role=${user.role}`);
      toast.success("Gunny bag entry delete ho gayi!");
      fetchData();
    } catch (e) { logger.error(e); toast.error("Delete error"); }
  };

  const handleExcel = () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append("kms_year", filters.kms_year);
    if (filters.season) params.append("season", filters.season);
    window.open(`${API}/govt-registers/gunny-bags/excel?${params}`, "_blank");
  };

  return (
    <div className="space-y-4" data-testid="gunny-bag-register">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold text-amber-400">Gunny Bag Stock Register</h3>
          <p className="text-xs text-slate-400">Gunny bags stock: new, old, plastic - OSCSC ke liye report</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setEditingId(null); setForm({ date: new Date().toISOString().split("T")[0], bag_type: "new", source: "", opening_balance: "", received: "", used_for_rice: "", used_for_paddy: "", damaged: "", returned: "", remark: "" }); setDialogOpen(true); }} size="sm" className="bg-amber-600 hover:bg-amber-500" data-testid="gunny-add-btn">
            <Plus className="w-4 h-4 mr-1" /> Add Entry
          </Button>
          <Button onClick={handleExcel} size="sm" className="bg-green-700 hover:bg-green-600" data-testid="gunny-excel-btn">
            <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
          </Button>
        </div>
      </div>

      {loading ? <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-400" /></div> : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-sm" data-testid="gunny-bag-table">
            <thead>
              <tr className="bg-slate-800 text-slate-300">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-right">Opening</th>
                <th className="px-3 py-2 text-right">Received</th>
                <th className="px-3 py-2 text-right">Used (Rice)</th>
                <th className="px-3 py-2 text-right">Used (Paddy)</th>
                <th className="px-3 py-2 text-right">Damaged</th>
                <th className="px-3 py-2 text-right">Returned</th>
                <th className="px-3 py-2 text-right">Closing</th>
                <th className="px-3 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-6 text-slate-500">Koi entry nahi hai</td></tr>
              ) : entries.map((e, i) => (
                <tr key={e.id} className={`border-t border-slate-700/50 ${i % 2 === 0 ? 'bg-slate-800/30' : ''}`}>
                  <td className="px-3 py-2 text-slate-300">{formatDate(e.date)}</td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs font-medium ${e.bag_type === 'new' ? 'bg-green-900/50 text-green-400' : e.bag_type === 'old' ? 'bg-yellow-900/50 text-yellow-400' : 'bg-blue-900/50 text-blue-400'}`}>{e.bag_type?.toUpperCase()}</span></td>
                  <td className="px-3 py-2 text-slate-400">{e.source}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{e.opening_balance}</td>
                  <td className="px-3 py-2 text-right text-green-400">{e.received}</td>
                  <td className="px-3 py-2 text-right text-blue-400">{e.used_for_rice}</td>
                  <td className="px-3 py-2 text-right text-blue-400">{e.used_for_paddy}</td>
                  <td className="px-3 py-2 text-right text-red-400">{e.damaged}</td>
                  <td className="px-3 py-2 text-right text-yellow-400">{e.returned}</td>
                  <td className="px-3 py-2 text-right text-amber-400 font-medium">{e.closing_balance}</td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => handleEdit(e)} className="p-1 hover:bg-slate-700 rounded" data-testid={`gunny-edit-${e.id}`}><Pencil className="w-3.5 h-3.5 text-blue-400" /></button>
                      <button onClick={() => handleDelete(e.id)} className="p-1 hover:bg-red-900/30 rounded" data-testid={`gunny-delete-${e.id}`}><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Gunny Bag Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-amber-400">{editingId ? "Edit" : "New"} Gunny Bag Entry</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-slate-400">Date</label><Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="gunny-date" /></div>
            <div><label className="text-xs text-slate-400">Bag Type</label>
              <Select value={form.bag_type} onValueChange={v => setForm(p => ({ ...p, bag_type: v }))}>
                <SelectTrigger className="bg-slate-900 border-slate-600 text-white" data-testid="gunny-type"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  <SelectItem value="new" className="text-white">New</SelectItem>
                  <SelectItem value="old" className="text-white">Old/Used</SelectItem>
                  <SelectItem value="plastic" className="text-white">Plastic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><label className="text-xs text-slate-400">Source</label><Input value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" placeholder="OSCSC / Purchase / Return" data-testid="gunny-source" /></div>
            <div><label className="text-xs text-slate-400">Opening Balance</label><Input type="number" value={form.opening_balance} onChange={e => setForm(p => ({ ...p, opening_balance: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="gunny-opening" /></div>
            <div><label className="text-xs text-slate-400">Received</label><Input type="number" value={form.received} onChange={e => setForm(p => ({ ...p, received: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="gunny-received" /></div>
            <div><label className="text-xs text-slate-400">Used for Rice</label><Input type="number" value={form.used_for_rice} onChange={e => setForm(p => ({ ...p, used_for_rice: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="gunny-used-rice" /></div>
            <div><label className="text-xs text-slate-400">Used for Paddy</label><Input type="number" value={form.used_for_paddy} onChange={e => setForm(p => ({ ...p, used_for_paddy: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="gunny-used-paddy" /></div>
            <div><label className="text-xs text-slate-400">Damaged</label><Input type="number" value={form.damaged} onChange={e => setForm(p => ({ ...p, damaged: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="gunny-damaged" /></div>
            <div><label className="text-xs text-slate-400">Returned</label><Input type="number" value={form.returned} onChange={e => setForm(p => ({ ...p, returned: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="gunny-returned" /></div>
            <div className="col-span-2"><label className="text-xs text-slate-400">Remark</label><Input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="gunny-remark" /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => setDialogOpen(false)} variant="outline" className="border-slate-600 text-slate-300">Cancel</Button>
            <Button onClick={handleSave} className="bg-amber-600 hover:bg-amber-500" data-testid="gunny-save-btn">{editingId ? "Update" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ TRANSIT PASS REGISTER (Auto from Mill Entries) ============
function TransitPassRegister({ filters }) {
  const [data, setData] = useState({ rows: [], summary: {}, filter_options: { mandis: [], agents: [] } });
  const [loading, setLoading] = useState(false);
  const [tpFilters, setTpFilters] = useState({ mandi_name: "", agent_name: "" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      if (filters.season) params.append("season", filters.season);
      if (filters.date_from) params.append("date_from", filters.date_from);
      if (filters.date_to) params.append("date_to", filters.date_to);
      if (tpFilters.mandi_name) params.append("mandi_name", tpFilters.mandi_name);
      if (tpFilters.agent_name) params.append("agent_name", tpFilters.agent_name);
      const res = await axios.get(`${API}/govt-registers/transit-pass?${params}`);
      setData(res.data);
    } catch (e) { logger.error(e); toast.error("Transit Pass data load error"); }
    setLoading(false);
  }, [filters, tpFilters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const buildExportParams = () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append("kms_year", filters.kms_year);
    if (filters.season) params.append("season", filters.season);
    if (filters.date_from) params.append("date_from", filters.date_from);
    if (filters.date_to) params.append("date_to", filters.date_to);
    if (tpFilters.mandi_name) params.append("mandi_name", tpFilters.mandi_name);
    if (tpFilters.agent_name) params.append("agent_name", tpFilters.agent_name);
    return params;
  };

  // Fetch all options (without mandi/agent filter) for dropdowns
  const [allOptions, setAllOptions] = useState({ mandis: [], agents: [] });
  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams();
        if (filters.kms_year) params.append("kms_year", filters.kms_year);
        if (filters.season) params.append("season", filters.season);
        const res = await axios.get(`${API}/govt-registers/transit-pass?${params}`);
        setAllOptions(res.data.filter_options || { mandis: [], agents: [] });
      } catch (e) { logger.error(e); }
    })();
  }, [filters.kms_year, filters.season]);

  return (
    <div className="space-y-4" data-testid="transit-pass-register">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold text-amber-400">Transit Pass Register</h3>
          <p className="text-xs text-slate-400">Mill Entries se auto-generated (jahan TP No. hai)</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => window.open(`${API}/govt-registers/transit-pass/excel?${buildExportParams()}`, "_blank")} size="sm" className="bg-green-700 hover:bg-green-600" data-testid="tp-excel-btn">
            <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
          </Button>
          <Button onClick={() => window.open(`${API}/govt-registers/transit-pass/pdf?${buildExportParams()}`, "_blank")} size="sm" className="bg-red-700 hover:bg-red-600" data-testid="tp-pdf-btn">
            <FileText className="w-4 h-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Mandi / Agent Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <label className="text-xs text-slate-400">Mandi:</label>
          <select value={tpFilters.mandi_name} onChange={e => setTpFilters(p => ({ ...p, mandi_name: e.target.value }))}
            className="bg-slate-900 border border-slate-600 text-white rounded h-8 text-xs px-2 min-w-[120px]" data-testid="tp-filter-mandi">
            <option value="">All Mandis</option>
            {allOptions.mandis.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <label className="text-xs text-slate-400">Agent:</label>
          <select value={tpFilters.agent_name} onChange={e => setTpFilters(p => ({ ...p, agent_name: e.target.value }))}
            className="bg-slate-900 border border-slate-600 text-white rounded h-8 text-xs px-2 min-w-[120px]" data-testid="tp-filter-agent">
            <option value="">All Agents</option>
            {allOptions.agents.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {(tpFilters.mandi_name || tpFilters.agent_name) && (
          <Button onClick={() => setTpFilters({ mandi_name: "", agent_name: "" })} variant="ghost" size="sm" className="text-slate-400 text-xs h-8">
            Clear Filters
          </Button>
        )}
      </div>

      {loading ? <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-400" /></div> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Total Entries" value={data.summary?.total_entries || 0} color="purple" />
            <SummaryCard label="Total Qty" value={`${data.summary?.total_qty || 0} Qtl`} color="green" />
            <SummaryCard label="Total TP Qty" value={`${data.summary?.total_tp_weight || 0} Qtl`} color="amber" />
            <SummaryCard label="Total Bags" value={data.summary?.total_bags || 0} color="blue" />
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-sm" data-testid="tp-table">
              <thead>
                <tr className="bg-slate-800 text-slate-300">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">TP No.</th>
                  <th className="px-3 py-2 text-left">RST</th>
                  <th className="px-3 py-2 text-left">Vehicle</th>
                  <th className="px-3 py-2 text-left">Agent</th>
                  <th className="px-3 py-2 text-left">Mandi/PPC</th>
                  <th className="px-3 py-2 text-right">Qty (Qtl)</th>
                  <th className="px-3 py-2 text-right">TP Wt</th>
                  <th className="px-3 py-2 text-right">Bags</th>
                  <th className="px-3 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-6 text-slate-500">Koi TP entry nahi mili</td></tr>
                ) : data.rows.map((r, i) => (
                  <tr key={i} className={`border-t border-slate-700/50 ${i % 2 === 0 ? 'bg-slate-800/30' : ''}`}>
                    <td className="px-3 py-2 text-slate-300">{formatDate(r.date)}</td>
                    <td className="px-3 py-2 text-amber-400 font-medium">{r.tp_no}</td>
                    <td className="px-3 py-2 text-slate-400">{r.rst_no}</td>
                    <td className="px-3 py-2 text-slate-300">{r.truck_no}</td>
                    <td className="px-3 py-2 text-slate-400">{r.agent_name}</td>
                    <td className="px-3 py-2 text-slate-400">{r.mandi_name}</td>
                    <td className="px-3 py-2 text-right text-green-400 font-medium">{r.qty_qntl}</td>
                    <td className="px-3 py-2 text-right text-cyan-400 font-medium">{r.tp_weight}</td>
                    <td className="px-3 py-2 text-right text-slate-300">{r.bags}</td>
                    <td className="px-3 py-2 text-center"><span className="px-2 py-0.5 rounded text-xs bg-green-900/50 text-green-400">Accepted</span></td>
                  </tr>
                ))}
              </tbody>
              {data.rows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-700/50 font-bold border-t-2 border-slate-600">
                    <td className="px-3 py-2 text-amber-400">TOTAL</td>
                    <td className="px-3 py-2 text-slate-300">{data.summary?.total_entries} entries</td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-right text-green-400">{data.summary?.total_qty}</td>
                    <td className="px-3 py-2 text-right text-cyan-400">{data.summary?.total_tp_weight}</td>
                    <td className="px-3 py-2 text-right text-slate-300">{data.summary?.total_bags}</td>
                    <td className="px-3 py-2"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ============ MILLING REGISTER ============
function MillingRegister({ filters, user }) {
  const [data, setData] = useState({ rows: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [releases, setReleases] = useState([]);
  const [tpStock, setTpStock] = useState(0);
  const [releaseStock, setReleaseStock] = useState(null);
  const [isReleaseOpen, setIsReleaseOpen] = useState(false);
  const [editingRelId, setEditingRelId] = useState(null);
  const [relForm, setRelForm] = useState({ date: new Date().toISOString().split("T")[0], qty_qtl: "", ro_number: "", kms_year: "", season: "" });
  const showConfirm = useConfirm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      if (filters.season) params.append("season", filters.season);
      const [regRes, relRes, relStockRes, tpRes] = await Promise.all([
        axios.get(`${API}/govt-registers/milling-register?${params}`),
        axios.get(`${API}/paddy-release?${params}`),
        axios.get(`${API}/paddy-release/stock?${params}`),
        axios.get(`${API}/govt-registers/tp-weight-stock?${params}`),
      ]);
      setData(regRes.data);
      setReleases(relRes.data);
      setReleaseStock(relStockRes.data);
      setTpStock(tpRes.data?.total_tp_weight || 0);
    } catch (e) { logger.error(e); toast.error("Milling Register load error"); }
    setLoading(false);
  }, [filters.kms_year, filters.season]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fmtD = (d) => { if (!d) return ''; const p = d.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}` : d; };
  const s = data.summary || {};
  const totalReleased = releases.reduce((acc, r) => acc + (r.qty_qtl || 0), 0);
  const tpAfterRelease = Math.round((tpStock - totalReleased) * 100) / 100;

  const openNewRelease = () => {
    setEditingRelId(null);
    setRelForm({ date: new Date().toISOString().split("T")[0], qty_qtl: "", ro_number: "", kms_year: filters.kms_year || "", season: filters.season || "" });
    setIsReleaseOpen(true);
  };
  const openEditRelease = (r) => {
    setEditingRelId(r.id);
    setRelForm({ date: r.date || "", qty_qtl: String(r.qty_qtl || ""), ro_number: r.ro_number || "", kms_year: r.kms_year || "", season: r.season || "" });
    setIsReleaseOpen(true);
  };
  const handleRelSubmit = async (e) => {
    e.preventDefault();
    const qty = parseFloat(relForm.qty_qtl);
    if (!qty || qty <= 0) { toast.error("Qty daalen"); return; }
    try {
      if (editingRelId) {
        await axios.put(`${API}/paddy-release/${editingRelId}?username=${user?.username}`, relForm);
        toast.success("Updated!");
      } else {
        await axios.post(`${API}/paddy-release?username=${user?.username}`, relForm);
        toast.success("Paddy Released!");
      }
      setIsReleaseOpen(false); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };
  const handleRelDelete = async (id) => {
    if (!await showConfirm("Delete", "Release delete karein?")) return;
    try { await axios.delete(`${API}/paddy-release/${id}`); toast.success("Deleted!"); fetchData(); } catch (e) { toast.error("Error"); }
  };

  return (
    <div className="space-y-4" data-testid="milling-register">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-800 dark:text-amber-400">Milling Register / मिलिंग रजिस्टर</h3>
        <div className="flex items-center gap-2">
          <Button onClick={async () => { try { const params = new URLSearchParams(); if(filters.kms_year) params.append('kms_year',filters.kms_year); if(filters.season) params.append('season',filters.season); const { downloadFile } = await import('../utils/download'); downloadFile(`/api/govt-registers/milling-register/excel?${params}`, 'milling_register.xlsx'); toast.success("Excel!"); } catch(e) { toast.error("Export failed"); }}}
            variant="outline" size="sm" className="border-slate-600 text-green-600 dark:text-green-400 hover:bg-slate-100 dark:hover:bg-slate-700 h-7 text-[10px]" data-testid="mr-export-excel">
            <Download className="w-3 h-3 mr-1" /> Excel
          </Button>
          <Button onClick={async () => { try { const params = new URLSearchParams(); if(filters.kms_year) params.append('kms_year',filters.kms_year); if(filters.season) params.append('season',filters.season); const { downloadFile } = await import('../utils/download'); downloadFile(`/api/govt-registers/milling-register/pdf?${params}`, 'milling_register.pdf'); toast.success("PDF!"); } catch(e) { toast.error("Export failed"); }}}
            variant="outline" size="sm" className="border-slate-600 text-red-600 dark:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-700 h-7 text-[10px]" data-testid="mr-export-pdf">
            <Download className="w-3 h-3 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border"><CardContent className="p-3 text-center">
          <p className="text-[10px] text-slate-500">Total Paddy Released (CM A/c)</p>
          <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{(s.total_paddy_received || 0).toLocaleString()} <span className="text-xs text-slate-400">Qtl</span></p>
          <p className="text-[10px] text-slate-500">Milled: {(s.total_paddy_milled || 0).toLocaleString()}</p>
        </CardContent></Card>
        <Card className="border"><CardContent className="p-3 text-center">
          <p className="text-[10px] text-slate-500">Total Rice Produced</p>
          <p className="text-lg font-bold text-green-700 dark:text-emerald-400">{(s.total_rice_produced || 0).toLocaleString()} <span className="text-xs text-slate-400">Qtl</span></p>
          <p className="text-[10px] text-slate-500">Delivered: {(s.total_rice_delivered || 0).toLocaleString()}</p>
        </CardContent></Card>
        <Card className="border"><CardContent className="p-3 text-center">
          <p className="text-[10px] text-slate-500">Closing Balances</p>
          <p className="text-sm"><span className="text-orange-600 dark:text-amber-400 font-bold">{(s.cb_paddy || 0).toLocaleString()}</span> <span className="text-slate-500 text-xs">Paddy</span></p>
          <p className="text-sm"><span className="text-teal-700 dark:text-cyan-400 font-bold">{(s.cb_rice || 0).toLocaleString()}</span> <span className="text-slate-500 text-xs">Rice</span></p>
        </CardContent></Card>
      </div>

      {/* Paddy Release Section */}
      <Card className="border">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-800 dark:text-amber-400">Paddy Release / धान जारी</h4>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">TP Stock: <span className="font-bold text-blue-700 dark:text-blue-400">{tpStock.toLocaleString()} Qtl</span></span>
              <span className="text-xs text-slate-500">Released: <span className="font-bold text-amber-600 dark:text-amber-400">{totalReleased.toLocaleString()} Qtl</span></span>
              <span className="text-xs text-slate-500">Remaining: <span className={`font-bold ${tpAfterRelease >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{tpAfterRelease.toLocaleString()} Qtl</span></span>
              <Button onClick={openNewRelease} size="sm" className="bg-amber-500 hover:bg-amber-600 text-slate-900 h-7 text-[10px]" data-testid="paddy-release-add">
                <Plus className="w-3 h-3 mr-1" /> Release
              </Button>
            </div>
          </div>
          {releases.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead><tr className="border-b border-slate-300 dark:border-slate-600">
                  <th className="text-left py-1 px-2 text-slate-600 dark:text-slate-400">Date</th>
                  <th className="text-left py-1 px-2 text-slate-600 dark:text-slate-400">RO Number</th>
                  <th className="text-right py-1 px-2 text-slate-600 dark:text-slate-400">Qty (Qtl)</th>
                  <th className="py-1 px-1 w-[60px]"></th>
                </tr></thead>
                <tbody>
                  {releases.map(r => (
                    <tr key={r.id} className="border-b border-slate-200 dark:border-slate-700/50 hover:bg-blue-50/50 dark:hover:bg-slate-700/30">
                      <td className="py-1 px-2 text-slate-800 dark:text-white">{fmtD(r.date)}</td>
                      <td className="py-1 px-2 text-teal-700 dark:text-cyan-400 font-medium">{r.ro_number}</td>
                      <td className="py-1 px-2 text-right text-amber-600 dark:text-amber-400 font-bold">{(r.qty_qtl || 0).toLocaleString()}</td>
                      <td className="py-1 px-1">
                        <div className="flex gap-0.5">
                          <button onClick={() => openEditRelease(r)} className="text-blue-500 hover:text-blue-700 p-0.5"><Pencil className="w-3 h-3" /></button>
                          {user?.role === "admin" && <button onClick={() => handleRelDelete(r.id)} className="text-red-500 hover:text-red-700 p-0.5"><Trash2 className="w-3 h-3" /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Release Form Dialog */}
      <Dialog open={isReleaseOpen} onOpenChange={setIsReleaseOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-sm" data-testid="paddy-release-form">
          <DialogHeader><DialogTitle className="text-amber-400">{editingRelId ? "Edit" : "New"} Paddy Release</DialogTitle></DialogHeader>
          <form onSubmit={handleRelSubmit} className="space-y-3">
            <div><Label className="text-[10px] text-slate-400">Date</Label>
              <Input type="date" value={relForm.date} onChange={e => setRelForm(p => ({ ...p, date: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-xs" required /></div>
            <div><Label className="text-[10px] text-slate-400">Qty (Qtl) *</Label>
              <Input type="number" step="0.01" value={relForm.qty_qtl} onChange={e => setRelForm(p => ({ ...p, qty_qtl: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-xs" required />
              <p className="text-[9px] text-slate-500 mt-0.5">TP Stock Available: <span className="text-green-400">{tpAfterRelease.toLocaleString()} Qtl</span></p></div>
            <div><Label className="text-[10px] text-slate-400">RO Number</Label>
              <Input value={relForm.ro_number} onChange={e => setRelForm(p => ({ ...p, ro_number: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-xs" /></div>
            <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-slate-900 w-full">{editingRelId ? "Update" : "Release Paddy"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {loading ? <p className="text-slate-400 text-center py-8">Loading...</p> : (
        <Card className="border">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-[10px]" data-testid="milling-register-table">
              <thead>
                <tr className="border-b-2 border-slate-300 dark:border-slate-600">
                  <th colSpan={2} className="bg-slate-100 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300 py-1 px-1 text-center border-r border-slate-300 dark:border-slate-600"></th>
                  <th colSpan={7} className="bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 py-1.5 px-1 text-center border-r border-slate-300 dark:border-slate-600 font-bold text-[11px]">PADDY / धान</th>
                  <th colSpan={8} className="bg-green-50 dark:bg-emerald-900/40 text-green-800 dark:text-emerald-300 py-1.5 px-1 text-center font-bold text-[11px]">RICE / चावल</th>
                </tr>
                <tr className="border-b border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50">
                  <th className="text-slate-700 dark:text-slate-300 py-1.5 px-2 text-left sticky left-0 bg-slate-50 dark:bg-slate-700/90 z-10 font-semibold">Date</th>
                  <th className="text-slate-700 dark:text-slate-300 py-1.5 px-1 text-left font-semibold">Milling Month</th>
                  <th className="text-blue-800 dark:text-blue-300 py-1.5 px-1 text-right border-l border-slate-300 dark:border-slate-600 font-semibold">OB Paddy</th>
                  <th className="text-blue-800 dark:text-blue-300 py-1.5 px-1 text-right font-semibold">Rcvd from CM A/c</th>
                  <th className="text-blue-800 dark:text-blue-300 py-1.5 px-1 text-right font-semibold">Total Paddy</th>
                  <th className="text-blue-800 dark:text-blue-300 py-1.5 px-1 text-right font-semibold">Issue For Milling</th>
                  <th className="text-blue-600 dark:text-blue-400 py-1.5 px-1 text-right font-semibold">Prog Rcpt of Paddy</th>
                  <th className="text-blue-600 dark:text-blue-400 py-1.5 px-1 text-right font-semibold">Prog Milling of Paddy</th>
                  <th className="text-orange-700 dark:text-amber-400 py-1.5 px-1 text-right font-bold border-r border-slate-300 dark:border-slate-600">CB of Paddy</th>
                  <th className="text-green-800 dark:text-emerald-300 py-1.5 px-1 text-right font-semibold">OB Rice</th>
                  <th className="text-green-800 dark:text-emerald-300 py-1.5 px-1 text-right font-semibold">Rice Rcpt from Milling</th>
                  <th className="text-green-800 dark:text-emerald-300 py-1.5 px-1 text-right font-semibold">Total Rice</th>
                  <th className="text-green-700 dark:text-green-400 py-1.5 px-1 text-right font-semibold">Rice Delivery RRC</th>
                  <th className="text-green-700 dark:text-green-400 py-1.5 px-1 text-right font-semibold">Rice Delivery FCI</th>
                  <th className="text-green-600 dark:text-emerald-400 py-1.5 px-1 text-right font-semibold">Prog Rice Milling</th>
                  <th className="text-green-600 dark:text-emerald-400 py-1.5 px-1 text-right font-semibold">Prog Rice Delivered</th>
                  <th className="text-teal-700 dark:text-cyan-400 py-1.5 px-1 text-right font-bold">CB of Rice</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr><td colSpan={17} className="text-center text-slate-400 py-6">Koi data nahi - Paddy Release aur Milling entries se auto-generate hota hai</td></tr>
                ) : data.rows.map((r, i) => (
                  <tr key={r.date} className={`border-b border-slate-200 dark:border-slate-700/50 hover:bg-blue-50/50 dark:hover:bg-slate-700/30 ${i % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-slate-50/80 dark:bg-slate-800/30'}`}>
                    <td className="text-slate-900 dark:text-white py-1.5 px-2 font-semibold sticky left-0 bg-inherit z-10 whitespace-nowrap">{fmtD(r.date)}</td>
                    <td className="text-slate-500 dark:text-slate-400 py-1.5 px-1 whitespace-nowrap">{(r.month || '').substring(0,3)}</td>
                    <td className="text-slate-600 dark:text-blue-200 py-1.5 px-1 text-right border-l border-slate-200 dark:border-slate-700">{r.ob_paddy || ''}</td>
                    <td className={`py-1.5 px-1 text-right ${r.rcvd_from_cm ? 'text-blue-700 dark:text-blue-400 font-semibold' : 'text-slate-300 dark:text-slate-600'}`}>{r.rcvd_from_cm || ''}</td>
                    <td className="text-slate-700 dark:text-blue-200 py-1.5 px-1 text-right font-medium">{r.total_paddy}</td>
                    <td className={`py-1.5 px-1 text-right ${r.issue_for_milling ? 'text-orange-600 dark:text-orange-400 font-semibold' : 'text-slate-300 dark:text-slate-600'}`}>{r.issue_for_milling || ''}</td>
                    <td className="text-blue-500 dark:text-blue-400/60 py-1.5 px-1 text-right">{r.prog_rcpt_paddy}</td>
                    <td className="text-blue-500 dark:text-blue-400/60 py-1.5 px-1 text-right">{r.prog_milling_paddy}</td>
                    <td className="text-orange-700 dark:text-amber-400 py-1.5 px-1 text-right font-bold border-r border-slate-200 dark:border-slate-700">{r.cb_paddy}</td>
                    <td className="text-slate-600 dark:text-emerald-200 py-1.5 px-1 text-right">{r.ob_rice || ''}</td>
                    <td className={`py-1.5 px-1 text-right ${r.rice_from_milling ? 'text-green-700 dark:text-emerald-400 font-semibold' : 'text-slate-300 dark:text-slate-600'}`}>{r.rice_from_milling || ''}</td>
                    <td className="text-slate-700 dark:text-emerald-200 py-1.5 px-1 text-right font-medium">{r.total_rice}</td>
                    <td className={`py-1.5 px-1 text-right ${r.delivery_rrc ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-slate-300 dark:text-slate-600'}`}>{r.delivery_rrc || ''}</td>
                    <td className={`py-1.5 px-1 text-right ${r.delivery_fci ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-slate-300 dark:text-slate-600'}`}>{r.delivery_fci || ''}</td>
                    <td className="text-green-600 dark:text-emerald-400/60 py-1.5 px-1 text-right">{r.prog_rice_milling}</td>
                    <td className="text-green-600 dark:text-emerald-400/60 py-1.5 px-1 text-right">{r.prog_rice_delivered}</td>
                    <td className="text-teal-700 dark:text-cyan-400 py-1.5 px-1 text-right font-bold">{r.cb_rice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============ CMR DELIVERY TRACKER WITH OTR ============
function CmrDeliveryTracker({ filters, user }) {
  const [data, setData] = useState({ entries: [], summary: {} });
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0], delivery_no: "", rrc_depot: "",
    rice_type: "Parboiled", cmr_qty: "", bags: "", vehicle_no: "",
    driver_name: "", fortified: true, gate_pass_no: "", quality_grade: "FAQ", remark: ""
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      if (filters.season) params.append("season", filters.season);
      if (filters.date_from) params.append("date_from", filters.date_from);
      if (filters.date_to) params.append("date_to", filters.date_to);
      const res = await axios.get(`${API}/govt-registers/cmr-delivery?${params}`);
      setData(res.data);
    } catch (e) { logger.error(e); toast.error("CMR data load error"); }
    setLoading(false);
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => setForm({ date: new Date().toISOString().split("T")[0], delivery_no: "", rrc_depot: "", rice_type: "Parboiled", cmr_qty: "", bags: "", vehicle_no: "", driver_name: "", fortified: true, gate_pass_no: "", quality_grade: "FAQ", remark: "" });

  const handleSave = async () => {
    if (!form.cmr_qty || parseFloat(form.cmr_qty) <= 0) { toast.error("CMR Qty daalo!"); return; }
    try {
      const payload = { ...form, kms_year: filters.kms_year || "", season: filters.season || "", cmr_qty: parseFloat(form.cmr_qty) || 0, bags: parseInt(form.bags) || 0 };
      if (editingId) {
        await axios.put(`${API}/govt-registers/cmr-delivery/${editingId}?username=${user.username}`, payload);
        toast.success("CMR delivery update ho gayi!");
      } else {
        await axios.post(`${API}/govt-registers/cmr-delivery?username=${user.username}`, payload);
        toast.success("CMR delivery add ho gayi!");
      }
      setDialogOpen(false); setEditingId(null); resetForm(); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Save error"); }
  };

  const handleEdit = (entry) => {
    setForm({ date: entry.date || "", delivery_no: entry.delivery_no || "", rrc_depot: entry.rrc_depot || "", rice_type: entry.rice_type || "Parboiled", cmr_qty: String(entry.cmr_qty || ""), bags: String(entry.bags || ""), vehicle_no: entry.vehicle_no || "", driver_name: entry.driver_name || "", fortified: entry.fortified !== false, gate_pass_no: entry.gate_pass_no || "", quality_grade: entry.quality_grade || "FAQ", remark: entry.remark || "" });
    setEditingId(entry.id); setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Kya aap sure hain?")) return;
    try { await axios.delete(`${API}/govt-registers/cmr-delivery/${id}?username=${user.username}&role=${user.role}`); toast.success("Deleted!"); fetchData(); } catch (e) { logger.error(e); toast.error("Delete error"); }
  };

  const handleExcel = () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append("kms_year", filters.kms_year);
    if (filters.season) params.append("season", filters.season);
    window.open(`${API}/govt-registers/cmr-delivery/excel?${params}`, "_blank");
  };

  const s = data.summary || {};

  return (
    <div className="space-y-4" data-testid="cmr-delivery-tracker">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold text-amber-400">CMR Delivery Tracker</h3>
          <p className="text-xs text-slate-400">Custom Milled Rice delivery to OSCSC/RRC with Outturn Ratio</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setEditingId(null); resetForm(); setDialogOpen(true); }} size="sm" className="bg-amber-600 hover:bg-amber-500" data-testid="cmr-add-btn">
            <Plus className="w-4 h-4 mr-1" /> Add Delivery
          </Button>
          <Button onClick={handleExcel} size="sm" className="bg-green-700 hover:bg-green-600" data-testid="cmr-excel-btn">
            <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
          </Button>
        </div>
      </div>
      {loading ? <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-400" /></div> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <SummaryCard label="CMR Delivered" value={`${s.total_cmr_delivered || 0} Qtl`} color="green" />
            <SummaryCard label="Paddy Received" value={`${s.total_paddy_received || 0} Qtl`} color="blue" />
            <SummaryCard label="Outturn Ratio" value={`${s.outturn_ratio || 0}%`} color="amber" />
            <SummaryCard label="Deliveries" value={s.total_deliveries || 0} color="purple" />
            <SummaryCard label="Total Bags" value={s.total_bags || 0} color="green" />
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-sm" data-testid="cmr-table">
              <thead>
                <tr className="bg-slate-800 text-slate-300">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Del. No</th>
                  <th className="px-3 py-2 text-left">RRC/Depot</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-right">CMR (Qtl)</th>
                  <th className="px-3 py-2 text-right">Bags</th>
                  <th className="px-3 py-2 text-left">Vehicle</th>
                  <th className="px-3 py-2 text-center">+F</th>
                  <th className="px-3 py-2 text-center">Grade</th>
                  <th className="px-3 py-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data.entries || []).length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-6 text-slate-500">Koi CMR delivery nahi hai</td></tr>
                ) : data.entries.map((e, i) => (
                  <tr key={e.id} className={`border-t border-slate-700/50 ${i % 2 === 0 ? 'bg-slate-800/30' : ''}`}>
                    <td className="px-3 py-2 text-slate-300">{formatDate(e.date)}</td>
                    <td className="px-3 py-2 text-amber-400">{e.delivery_no}</td>
                    <td className="px-3 py-2 text-slate-300">{e.rrc_depot}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs ${e.rice_type === 'Parboiled' ? 'bg-blue-900/50 text-blue-400' : 'bg-green-900/50 text-green-400'}`}>{e.rice_type}</span></td>
                    <td className="px-3 py-2 text-right text-green-400 font-medium">{e.cmr_qty}</td>
                    <td className="px-3 py-2 text-right text-slate-300">{e.bags}</td>
                    <td className="px-3 py-2 text-slate-400">{e.vehicle_no}</td>
                    <td className="px-3 py-2 text-center">{e.fortified ? <span className="text-blue-400 font-bold">+F</span> : <span className="text-slate-600">-</span>}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{e.quality_grade}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => handleEdit(e)} className="p-1 hover:bg-slate-700 rounded"><Pencil className="w-3.5 h-3.5 text-blue-400" /></button>
                        <button onClick={() => handleDelete(e.id)} className="p-1 hover:bg-red-900/30 rounded"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-lg">
          <DialogHeader><DialogTitle className="text-amber-400">{editingId ? "Edit" : "New"} CMR Delivery</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-slate-400">Date</label><Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="cmr-date" /></div>
            <div><label className="text-xs text-slate-400">Delivery No</label><Input value={form.delivery_no} onChange={e => setForm(p => ({ ...p, delivery_no: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="cmr-delivery-no" /></div>
            <div><label className="text-xs text-slate-400">RRC/Depot</label><Input value={form.rrc_depot} onChange={e => setForm(p => ({ ...p, rrc_depot: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="cmr-rrc" /></div>
            <div><label className="text-xs text-slate-400">Rice Type</label>
              <Select value={form.rice_type} onValueChange={v => setForm(p => ({ ...p, rice_type: v }))}>
                <SelectTrigger className="bg-slate-900 border-slate-600 text-white" data-testid="cmr-type"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600"><SelectItem value="Parboiled" className="text-white">Parboiled</SelectItem><SelectItem value="Raw" className="text-white">Raw</SelectItem></SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-slate-400">CMR Qty (Qtl)</label><Input type="number" value={form.cmr_qty} onChange={e => setForm(p => ({ ...p, cmr_qty: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="cmr-qty" /></div>
            <div><label className="text-xs text-slate-400">Bags</label><Input type="number" value={form.bags} onChange={e => setForm(p => ({ ...p, bags: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="cmr-bags" /></div>
            <div><label className="text-xs text-slate-400">Vehicle No</label><Input value={form.vehicle_no} onChange={e => setForm(p => ({ ...p, vehicle_no: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="cmr-vehicle" /></div>
            <div><label className="text-xs text-slate-400">Quality Grade</label>
              <Select value={form.quality_grade} onValueChange={v => setForm(p => ({ ...p, quality_grade: v }))}>
                <SelectTrigger className="bg-slate-900 border-slate-600 text-white" data-testid="cmr-grade"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600"><SelectItem value="FAQ" className="text-white">FAQ</SelectItem><SelectItem value="URS" className="text-white">URS</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.fortified} onChange={e => setForm(p => ({ ...p, fortified: e.target.checked }))} className="rounded" data-testid="cmr-fortified" />
                <span className="text-sm text-slate-300">Fortified Rice (+F Logo)</span>
              </label>
            </div>
            <div className="col-span-2"><label className="text-xs text-slate-400">Remark</label><Input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="cmr-remark" /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => setDialogOpen(false)} variant="outline" className="border-slate-600 text-slate-300">Cancel</Button>
            <Button onClick={handleSave} className="bg-amber-600 hover:bg-amber-500" data-testid="cmr-save-btn">{editingId ? "Update" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ SECURITY DEPOSIT MANAGEMENT ============
function SecurityDepositManager({ filters, user }) {
  const [data, setData] = useState({ entries: [], summary: {} });
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    bg_number: "", bank_name: "", amount: "", sd_ratio: "1:6",
    milling_capacity_mt: "", issue_date: "", expiry_date: "",
    status: "active", miller_type: "regular", remark: ""
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      const res = await axios.get(`${API}/govt-registers/security-deposit?${params}`);
      setData(res.data);
    } catch (e) { logger.error(e); toast.error("Security deposit data load error"); }
    setLoading(false);
  }, [filters.kms_year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => setForm({ bg_number: "", bank_name: "", amount: "", sd_ratio: "1:6", milling_capacity_mt: "", issue_date: "", expiry_date: "", status: "active", miller_type: "regular", remark: "" });

  const handleSave = async () => {
    if (!form.bg_number || !form.bank_name) { toast.error("BG Number aur Bank Name zaroori hai!"); return; }
    try {
      const payload = { ...form, kms_year: filters.kms_year || "", amount: parseFloat(form.amount) || 0, milling_capacity_mt: parseFloat(form.milling_capacity_mt) || 0 };
      if (editingId) {
        await axios.put(`${API}/govt-registers/security-deposit/${editingId}?username=${user.username}`, payload);
        toast.success("Security deposit update ho gayi!");
      } else {
        await axios.post(`${API}/govt-registers/security-deposit?username=${user.username}`, payload);
        toast.success("Security deposit add ho gayi!");
      }
      setDialogOpen(false); setEditingId(null); resetForm(); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Save error"); }
  };

  const handleEdit = (entry) => {
    setForm({ bg_number: entry.bg_number || "", bank_name: entry.bank_name || "", amount: String(entry.amount || ""), sd_ratio: entry.sd_ratio || "1:6", milling_capacity_mt: String(entry.milling_capacity_mt || ""), issue_date: entry.issue_date || "", expiry_date: entry.expiry_date || "", status: entry.status || "active", miller_type: entry.miller_type || "regular", remark: entry.remark || "" });
    setEditingId(entry.id); setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Kya aap sure hain?")) return;
    try { await axios.delete(`${API}/govt-registers/security-deposit/${id}?username=${user.username}&role=${user.role}`); toast.success("Deleted!"); fetchData(); } catch (e) { logger.error(e); toast.error("Delete error"); }
  };

  const handleExcel = () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append("kms_year", filters.kms_year);
    window.open(`${API}/govt-registers/security-deposit/excel?${params}`, "_blank");
  };

  const s = data.summary || {};
  const statusColor = { active: "bg-green-900/50 text-green-400", released: "bg-blue-900/50 text-blue-400", expired: "bg-red-900/50 text-red-400" };

  return (
    <div className="space-y-4" data-testid="security-deposit-manager">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold text-amber-400">Security Deposit (Bank Guarantee)</h3>
          <p className="text-xs text-slate-400">OSCSC Bank Guarantee tracking - SD ratio, validity, status</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setEditingId(null); resetForm(); setDialogOpen(true); }} size="sm" className="bg-amber-600 hover:bg-amber-500" data-testid="sd-add-btn">
            <Plus className="w-4 h-4 mr-1" /> Add Deposit
          </Button>
          <Button onClick={handleExcel} size="sm" className="bg-green-700 hover:bg-green-600" data-testid="sd-excel-btn">
            <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
          </Button>
        </div>
      </div>
      {loading ? <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-400" /></div> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Active Amount" value={`Rs ${(s.total_active_amount || 0).toLocaleString()}`} color="green" />
            <SummaryCard label="Active" value={s.active_count || 0} color="green" />
            <SummaryCard label="Released" value={s.released_count || 0} color="blue" />
            <SummaryCard label="Expired" value={s.expired_count || 0} color="red" />
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-sm" data-testid="sd-table">
              <thead>
                <tr className="bg-slate-800 text-slate-300">
                  <th className="px-3 py-2 text-left">BG Number</th>
                  <th className="px-3 py-2 text-left">Bank</th>
                  <th className="px-3 py-2 text-right">Amount (Rs)</th>
                  <th className="px-3 py-2 text-center">Ratio</th>
                  <th className="px-3 py-2 text-right">Capacity (MT)</th>
                  <th className="px-3 py-2 text-left">Issue Date</th>
                  <th className="px-3 py-2 text-left">Expiry Date</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-center">Type</th>
                  <th className="px-3 py-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data.entries || []).length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-6 text-slate-500">Koi security deposit nahi hai</td></tr>
                ) : data.entries.map((e, i) => (
                  <tr key={e.id} className={`border-t border-slate-700/50 ${i % 2 === 0 ? 'bg-slate-800/30' : ''}`}>
                    <td className="px-3 py-2 text-amber-400 font-medium">{e.bg_number}</td>
                    <td className="px-3 py-2 text-slate-300">{e.bank_name}</td>
                    <td className="px-3 py-2 text-right text-green-400 font-medium">{(e.amount || 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-center text-slate-300">{e.sd_ratio}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{e.milling_capacity_mt || '-'}</td>
                    <td className="px-3 py-2 text-slate-300">{formatDate(e.issue_date)}</td>
                    <td className="px-3 py-2 text-slate-300">{formatDate(e.expiry_date)}</td>
                    <td className="px-3 py-2 text-center"><span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor[e.status] || 'bg-slate-700 text-slate-300'}`}>{(e.status || '').toUpperCase()}</span></td>
                    <td className="px-3 py-2 text-center text-slate-400 text-xs">{e.miller_type}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => handleEdit(e)} className="p-1 hover:bg-slate-700 rounded"><Pencil className="w-3.5 h-3.5 text-blue-400" /></button>
                        <button onClick={() => handleDelete(e.id)} className="p-1 hover:bg-red-900/30 rounded"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-lg">
          <DialogHeader><DialogTitle className="text-amber-400">{editingId ? "Edit" : "New"} Security Deposit</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-slate-400">BG Number</label><Input value={form.bg_number} onChange={e => setForm(p => ({ ...p, bg_number: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" placeholder="BG/2025/001" data-testid="sd-bg-number" /></div>
            <div><label className="text-xs text-slate-400">Bank Name</label><Input value={form.bank_name} onChange={e => setForm(p => ({ ...p, bank_name: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" placeholder="SBI / PNB" data-testid="sd-bank" /></div>
            <div><label className="text-xs text-slate-400">Amount (Rs)</label><Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="sd-amount" /></div>
            <div><label className="text-xs text-slate-400">SD Ratio</label>
              <Select value={form.sd_ratio} onValueChange={v => setForm(p => ({ ...p, sd_ratio: v }))}>
                <SelectTrigger className="bg-slate-900 border-slate-600 text-white" data-testid="sd-ratio"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600"><SelectItem value="1:1" className="text-white">1:1 (New Mill)</SelectItem><SelectItem value="1:3" className="text-white">1:3 (1st Year)</SelectItem><SelectItem value="1:6" className="text-white">1:6 (Regular)</SelectItem></SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-slate-400">Milling Capacity (MT/2 shifts)</label><Input type="number" value={form.milling_capacity_mt} onChange={e => setForm(p => ({ ...p, milling_capacity_mt: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="sd-capacity" /></div>
            <div><label className="text-xs text-slate-400">Miller Type</label>
              <Select value={form.miller_type} onValueChange={v => setForm(p => ({ ...p, miller_type: v }))}>
                <SelectTrigger className="bg-slate-900 border-slate-600 text-white" data-testid="sd-miller-type"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600"><SelectItem value="regular" className="text-white">Regular</SelectItem><SelectItem value="new" className="text-white">New Mill</SelectItem><SelectItem value="hybrid" className="text-white">Hybrid</SelectItem></SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-slate-400">Issue Date</label><Input type="date" value={form.issue_date} onChange={e => setForm(p => ({ ...p, issue_date: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="sd-issue-date" /></div>
            <div><label className="text-xs text-slate-400">Expiry Date</label><Input type="date" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="sd-expiry-date" /></div>
            <div><label className="text-xs text-slate-400">Status</label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger className="bg-slate-900 border-slate-600 text-white" data-testid="sd-status"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600"><SelectItem value="active" className="text-white">Active</SelectItem><SelectItem value="released" className="text-white">Released</SelectItem><SelectItem value="expired" className="text-white">Expired</SelectItem></SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-slate-400">Remark</label><Input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))} className="bg-slate-900 border-slate-600 text-white" data-testid="sd-remark" /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => setDialogOpen(false)} variant="outline" className="border-slate-600 text-slate-300">Cancel</Button>
            <Button onClick={handleSave} className="bg-amber-600 hover:bg-amber-500" data-testid="sd-save-btn">{editingId ? "Update" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ HELPER COMPONENTS ============
function SummaryCard({ label, value, color }) {
  const colors = {
    green: "bg-green-900/30 border-green-700/50 text-green-400",
    blue: "bg-blue-900/30 border-blue-700/50 text-blue-400",
    amber: "bg-amber-900/30 border-amber-700/50 text-amber-400",
    purple: "bg-purple-900/30 border-purple-700/50 text-purple-400",
    red: "bg-red-900/30 border-red-700/50 text-red-400",
  };
  return (
    <div className={`px-4 py-3 rounded-lg border ${colors[color] || colors.amber}`} data-testid={`summary-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}

// ============ DATE FILTER ============
function DateFilter({ filters, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1">
        <label className="text-xs text-slate-400">From:</label>
        <Input type="date" value={filters.date_from || ""} onChange={e => onChange({ ...filters, date_from: e.target.value })}
          className="bg-slate-900 border-slate-600 text-white h-8 text-xs w-36" data-testid="govt-date-from" />
      </div>
      <div className="flex items-center gap-1">
        <label className="text-xs text-slate-400">To:</label>
        <Input type="date" value={filters.date_to || ""} onChange={e => onChange({ ...filters, date_to: e.target.value })}
          className="bg-slate-900 border-slate-600 text-white h-8 text-xs w-36" data-testid="govt-date-to" />
      </div>
      <Button onClick={() => onChange({ ...filters, date_from: "", date_to: "" })} variant="ghost" size="sm" className="text-slate-400 text-xs h-8">
        Clear Dates
      </Button>
    </div>
  );
}

// ============ MAIN COMPONENT ============
export default function GovtRegisters({ filters: parentFilters, user }) {
  const [activeTab, setActiveTab] = useState("paddy-custody");
  const [localFilters, setLocalFilters] = useState({
    kms_year: parentFilters.kms_year || "",
    season: parentFilters.season || "",
    date_from: "",
    date_to: "",
  });

  // Sync parent filters
  useEffect(() => {
    setLocalFilters(prev => ({
      ...prev,
      kms_year: parentFilters.kms_year || "",
      season: parentFilters.season || "",
    }));
  }, [parentFilters.kms_year, parentFilters.season]);

  return (
    <div className="space-y-4" data-testid="govt-registers">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-amber-400">Government Registers</h2>
          <p className="text-xs text-slate-400">Odisha OSCSC KMS 2025-26 Compliance Registers</p>
        </div>
        <DateFilter filters={localFilters} onChange={setLocalFilters} />
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex gap-1.5 flex-wrap border-b border-slate-700 pb-2">
        {SUB_TABS.map(({ id, label, desc, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t text-sm font-medium transition-colors ${
              activeTab === id
                ? "bg-amber-500/20 text-amber-400 border-b-2 border-amber-400"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
            data-testid={`govt-tab-${id}`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden text-xs">{label.replace("Form ", "")}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "paddy-custody" && <PaddyCustodyRegister filters={localFilters} />}
      {activeTab === "transit-pass" && <TransitPassRegister filters={localFilters} />}
      {activeTab === "milling-register" && <MillingRegister filters={localFilters} user={user} />}
      {activeTab === "form-a" && <FormARegister filters={localFilters} />}
      {activeTab === "form-b" && <FormBRegister filters={localFilters} />}
      {activeTab === "form-e" && <FormERegister filters={localFilters} />}
      {activeTab === "form-f" && <FormFRegister filters={localFilters} />}
      {activeTab === "frk" && <FrkRegister filters={localFilters} user={user} />}
      {activeTab === "gunny-bags" && <GunnyBagRegister filters={localFilters} user={user} />}
      {activeTab === "security-deposit" && <SecurityDepositManager filters={localFilters} user={user} />}
    </div>
  );
}
