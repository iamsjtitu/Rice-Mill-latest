import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  FileSpreadsheet, Plus, Pencil, Trash2, Loader2,
  BookOpen, Package, FlaskConical, ShoppingBag, ClipboardList,
  RefreshCw, Download, FileText, Search
} from "lucide-react";
import MandiCustodyRegister from "./MandiCustodyRegister";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

// ============ SUB TABS CONFIG ============
const SUB_TABS = [
  { id: "paddy-custody", label: "Paddy Custody", desc: "Custody Register", icon: ClipboardList },
  { id: "form-a", label: "Form A", desc: "Paddy from OSCSC", icon: BookOpen },
  { id: "form-b", label: "Form B", desc: "CMR Delivery", icon: BookOpen },
  { id: "form-e", label: "Form E", desc: "Own Paddy", icon: ShoppingBag },
  { id: "form-f", label: "Form F", desc: "Own Rice Sale", icon: ShoppingBag },
  { id: "frk", label: "FRK Blending", desc: "Fortified Rice", icon: FlaskConical },
  { id: "gunny-bags", label: "Gunny Bags", desc: "Bag Stock", icon: Package },
];

// ============ PADDY CUSTODY REGISTER (Moved from Milling Tracker) ============
function PaddyCustodyRegister({ filters }) {
  const [view, setView] = useState("register"); // "register" or "mandi"
  const [register, setRegister] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchRegister = useCallback(async () => {
    try { setLoading(true);
      const params = new URLSearchParams();
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      const res = await axios.get(`${API}/paddy-custody-register?${params}`);
      setRegister(res.data);
    } catch { toast.error("Register load nahi hua"); } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchRegister(); }, [fetchRegister]);

  const exportExcel = async () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    window.open(`${API}/paddy-custody-register/excel?${params}`, "_blank");
  };

  const exportPdf = async () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.kms_year) params.append("kms_year", filters.kms_year);
      if (filters.season) params.append("season", filters.season);
      if (filters.date_from) params.append("date_from", filters.date_from);
      if (filters.date_to) params.append("date_to", filters.date_to);
      const res = await axios.get(`${API}/govt-registers/form-a?${params}`);
      setData(res.data);
    } catch { toast.error("Form A data load error"); }
    setLoading(false);
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleExcel = () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append("kms_year", filters.kms_year);
    if (filters.season) params.append("season", filters.season);
    if (filters.date_from) params.append("date_from", filters.date_from);
    if (filters.date_to) params.append("date_to", filters.date_to);
    window.open(`${API}/govt-registers/form-a/excel?${params}`, "_blank");
  };

  return (
    <div className="space-y-4" data-testid="form-a-register">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold text-amber-400">Form A - Paddy Stock Register</h3>
          <p className="text-xs text-slate-400">Paddy received from OSCSC/State Procuring Agency (Mill Entries se linked)</p>
        </div>
        <Button onClick={handleExcel} size="sm" className="bg-green-700 hover:bg-green-600" data-testid="form-a-excel-btn">
          <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel Export
        </Button>
      </div>
      {loading ? <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-400" /></div> : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Total Received" value={`${data.summary?.total_received || 0} Qtl`} color="green" />
            <SummaryCard label="Total Milled" value={`${data.summary?.total_milled || 0} Qtl`} color="blue" />
            <SummaryCard label="Balance" value={`${data.summary?.final_balance || 0} Qtl`} color="amber" />
            <SummaryCard label="Days" value={data.summary?.total_days || 0} color="purple" />
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
    } catch { toast.error("Form B data load error"); }
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
    } catch { toast.error("Form E data load error"); }
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
    } catch { toast.error("Form F data load error"); }
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
    } catch { toast.error("FRK data load error"); }
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
    } catch { toast.error("Delete error"); }
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
    } catch { toast.error("Gunny bag data load error"); }
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
    } catch { toast.error("Delete error"); }
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
      {activeTab === "form-a" && <FormARegister filters={localFilters} />}
      {activeTab === "form-b" && <FormBRegister filters={localFilters} />}
      {activeTab === "form-e" && <FormERegister filters={localFilters} />}
      {activeTab === "form-f" && <FormFRegister filters={localFilters} />}
      {activeTab === "frk" && <FrkRegister filters={localFilters} user={user} />}
      {activeTab === "gunny-bags" && <GunnyBagRegister filters={localFilters} user={user} />}
    </div>
  );
}
