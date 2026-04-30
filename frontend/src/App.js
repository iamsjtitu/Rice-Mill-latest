import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import "@/App.css";
import axios from "axios";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { 
  FileSpreadsheet, 
  Users, CheckCircle, 
  Send, Scale, ClipboardList,
  Loader2,
} from "lucide-react";

// Eagerly loaded (used on initial render / always needed)
import LoginPage from "@/components/LoginPage";
import Dashboard from "@/components/Dashboard";
import Payments from "@/components/Payments";
import MillingTracker from "@/components/MillingTracker";
import CashBook from "@/components/CashBook";
import ErrorBoundary from "@/components/ErrorBoundary";
import { APP_VERSION } from "@/utils/constants-version";
import AutoUpdate from "@/components/AutoUpdate";
import { SendToGroupDialog } from "@/components/SendToGroupDialog";
import { useMessagingEnabled } from "./hooks/useMessagingEnabled";
import { useFilters } from "./hooks/useFilters";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { EntryTable } from "@/components/entries/EntryTable";
import { AppHeader } from "@/components/entries/AppHeader";

// Lazy loaded (tab-only, not needed at startup)
const Reports = lazy(() => import("@/components/Reports"));
const DCTracker = lazy(() => import("@/components/DCTracker"));
const Ledgers = lazy(() => import("@/components/Ledgers"));
const MillPartsStock = lazy(() => import("@/components/MillPartsStock"));
const StaffManagement = lazy(() => import("@/components/StaffManagement"));
const FYSummaryDashboard = lazy(() => import("@/components/FYSummaryDashboard"));
const BalanceSheet = lazy(() => import("@/components/BalanceSheet"));
const Vouchers = lazy(() => import("@/components/Vouchers"));
const StockRegister = lazy(() => import("@/components/StockRegister"));
const HemaliPayment = lazy(() => import("@/components/HemaliPayment"));
const GovtRegisters = lazy(() => import("@/components/GovtRegisters"));
const Settings = lazy(() => import("@/components/Settings"));
const VehicleWeight = lazy(() => import("@/components/VehicleWeight"));
const AutoWeightEntries = lazy(() => import("@/components/AutoWeightEntries"));
const PaddyPurchaseRegister = lazy(() => import("@/components/PaddyPurchaseRegister"));
const WhatsNew = lazy(() => import("@/components/WhatsNew"));

// Suspense fallback for lazy components
const LazyFallback = () => (
  <div className="flex items-center justify-center py-16">
    <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
    <span className="ml-3 text-slate-400 text-sm">Loading...</span>
  </div>
);

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

// ============ GLOBAL MUTATION INVALIDATION ============
// React Query cache invalidation on every successful mutation. Server-side
// Cache-Control: no-store ensures no HTTP caching. Components do their own
// fetches via useEffect — manual refresh button always works.
axios.interceptors.response.use(
  (response) => {
    try {
      const method = (response.config?.method || 'get').toLowerCase();
      if (method !== 'get') {
        try { queryClient.invalidateQueries(); } catch { /* ignore */ }
      }
    } catch { /* non-blocking */ }
    return response;
  },
);

// Global 409 Conflict handler (Optimistic Locking)
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 409) {
      toast.error(error.response?.data?.detail || "Ye record kisi aur ne update kar diya hai. Data refresh ho raha hai.", { duration: 4000 });
      try { queryClient.invalidateQueries(); } catch {}
      window.dispatchEvent(new CustomEvent('data-conflict-refresh'));
    }
    return Promise.reject(error);
  }
);

// Server already sends Cache-Control: no-store on /api/* routes — no additional
// client-side header manipulation needed. (Previously attempted to add a Pragma
// header via request interceptor but axios v1.x AxiosHeaders class made that
// unsafe; server headers alone are sufficient.)

import { safePrintHTML } from './utils/print';
import { FY_YEARS, CURRENT_FY, SEASONS, initialFormState } from './utils/constants';

// FY Summary with sub-tabs (Summary + Balance Sheet)
function FYSummaryWithTabs({ filters, user }) {
  const [subTab, setSubTab] = useState("summary");
  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        <button
          className={`px-4 py-1.5 rounded-t text-sm font-medium transition ${subTab === 'summary' ? 'bg-amber-500/20 text-amber-400 border-b-2 border-amber-400' : 'text-slate-400 hover:text-slate-200'}`}
          onClick={() => setSubTab("summary")}
          data-testid="fy-tab-summary"
        >FY Summary</button>
        <button
          className={`px-4 py-1.5 rounded-t text-sm font-medium transition ${subTab === 'balance-sheet' ? 'bg-amber-500/20 text-amber-400 border-b-2 border-amber-400' : 'text-slate-400 hover:text-slate-200'}`}
          onClick={() => setSubTab("balance-sheet")}
          data-testid="fy-tab-balance-sheet"
        >Balance Sheet</button>
      </div>
      {subTab === "summary" ? (
        <FYSummaryDashboard filters={filters} />
      ) : (
        <BalanceSheet filters={filters} />
      )}
    </div>
  );
}

// Main App Component



function MainApp({ user, setUser, onLogout }) {
  const [entries, setEntries] = useState([]);
  const [totals, setTotals] = useState({});
  const [formData, setFormData] = useState(initialFormState);
  const [editingId, setEditingId] = useState(null);
  const [rstFetched, setRstFetched] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordData, setPasswordData] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("entries");
  const [entriesSubTab, setEntriesSubTab] = useState("mill-entries");

  // Use extracted filter hook
  const {
    filters, setFilters, showFilters, setShowFilters,
    mandiTargets, setMandiTargets,
    handleFyChange, findMandiCutting, saveCuttingToLocal,
    clearFilters, hasActiveFilters, todayStr,
  } = useFilters();

  // Global ESC key handler - dispatch custom event to close filters everywhere
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        window.dispatchEvent(new CustomEvent('close-filters'));
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Kill camera streams when switching away from vehicle-weight
  const setActiveTabSafe = useCallback((tab) => {
    if (activeTab === "entries" && entriesSubTab === "vehicle-weight" && tab !== "entries") {
      try { axios.get(`${API}/camera-kill-all`).catch(() => {}); } catch (e) { logger.error(e); }
    }
    setActiveTab(tab);
  }, [activeTab, entriesSubTab]);

  const setEntriesSubTabSafe = useCallback((sub) => {
    if (entriesSubTab === "vehicle-weight" && sub !== "vehicle-weight") {
      try { axios.get(`${API}/camera-kill-all`).catch(() => {}); } catch (e) { logger.error(e); }
    }
    setEntriesSubTab(sub);
  }, [entriesSubTab]);
  const [pendingVwCount, setPendingVwCount] = useState(0);
  const [paymentsInitSubTab, setPaymentsInitSubTab] = useState(null);
  const [viewEntryData, setViewEntryData] = useState(null);
  const [savedFiltersBeforeView, setSavedFiltersBeforeView] = useState(null);

  // Navigate from PPR to Mill Entries and open View dialog
  const navigateToMillEntry = useCallback(async (entryId) => {
    try {
      const res = await axios.get(`${API}/entries/${entryId}`);
      if (res.data) {
        setSavedFiltersBeforeView({ ...filters });
        setEntriesSubTabSafe("mill-entries");
        setViewEntryData(res.data);
      }
    } catch (err) {
      logger.error("Entry fetch failed:", err);
    }
  }, [filters, setEntriesSubTabSafe]);

  // Called when View dialog is closed after PPR navigation
  const handleCloseViewEntry = useCallback(() => {
    setViewEntryData(null);
    if (savedFiltersBeforeView) {
      setFilters(savedFiltersBeforeView);
      setSavedFiltersBeforeView(null);
    }
  }, [savedFiltersBeforeView, setFilters]);

  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [searchDetailItem, setSearchDetailItem] = useState(null);
  const { wa, tg } = useMessagingEnabled();
  const [entryGroupDialogOpen, setEntryGroupDialogOpen] = useState(false);
  const [entryGroupText, setEntryGroupText] = useState("");
  const [entryGroupPdfUrl, setEntryGroupPdfUrl] = useState("");

  // Theme state
  const [theme, setTheme] = useState(() => localStorage.getItem('mill_theme') || 'dark');
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('mill_theme', newTheme);
  };
  // Sync data-theme to <html> so portals (dialogs, popovers) also get themed
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Branding state
  const [branding, setBranding] = useState({ company_name: "NAVKAR AGRO", tagline: "Mill Entry System", custom_fields: [] });

  // Backup state (kept for backup reminder dialog)
  const [backups, setBackups] = useState([]);
  const [backupStatus, setBackupStatus] = useState(null);
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);

  const [showWhatsNew, setShowWhatsNew] = useState(false);

  // Listen for data conflict refresh events (optimistic locking)
  useEffect(() => {
    const handleConflictRefresh = () => {
      fetchEntries();
      fetchTotals();
    };
    window.addEventListener('data-conflict-refresh', handleConflictRefresh);
    return () => window.removeEventListener('data-conflict-refresh', handleConflictRefresh);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Suggestions state
  const [truckSuggestions, setTruckSuggestions] = useState([]);
  const [leasedTruckNos, setLeasedTruckNos] = useState(new Set());
  const [agentSuggestions, setAgentSuggestions] = useState([]);
  const [mandiSuggestions, setMandiSuggestions] = useState([]);

  // Selection state for bulk delete
  const [selectedEntries, setSelectedEntries] = useState([]);
  const [selectAll, setSelectAll] = useState(false);

  // Confirm dialog state (replaces window.confirm to avoid Electron UI freeze)
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: "", description: "", onConfirm: null });
  const showConfirm = (title, description) => {
    return new Promise((resolve) => {
      setConfirmDialog({
        open: true,
        title,
        description,
        onConfirm: () => { setConfirmDialog(prev => ({ ...prev, open: false })); resolve(true); },
        onCancel: () => { setConfirmDialog(prev => ({ ...prev, open: false })); resolve(false); },
      });
    });
  };

  // Calculated fields
  const [calculatedFields, setCalculatedFields] = useState({
    qntl: 0,
    mill_w: 0,
    p_pkt_cut: 0,
    cutting: 0,
    final_w: 0,
  });

  // Auto-calculate fields
  useEffect(() => {
    const kg = parseFloat(formData.kg) || 0;
    const gbw_cut = parseFloat(formData.gbw_cut) || 0;
    const disc_dust_poll = parseFloat(formData.disc_dust_poll) || 0;
    const plastic_bag = parseInt(formData.plastic_bag) || 0;
    const cutting_percent = parseFloat(formData.cutting_percent) || 0;
    const moisture = parseFloat(formData.moisture) || 0;

    const p_pkt_cut = plastic_bag * 0.5;
    
    // Mill W in QNTL = KG - GBW Cut - P.Pkt Cut (all bag deductions included)
    const mill_w_kg = kg - gbw_cut - p_pkt_cut;
    const mill_w_qntl = mill_w_kg / 100;
    
    // Moisture cut: 17% tak no cut, uske upar (moisture - 17)% cut from Mill W QNTL
    const moisture_cut_percent = moisture > 17 ? (moisture - 17) : 0;
    const moisture_cut_qntl = (mill_w_qntl * moisture_cut_percent) / 100;
    
    // Cutting from Mill W QNTL
    const cutting_qntl = (mill_w_qntl * cutting_percent) / 100;
    
    // P.Pkt cut in QNTL (for display reference)
    const p_pkt_cut_qntl = p_pkt_cut / 100;
    
    // Disc/Dust/Poll in QNTL
    const disc_dust_poll_qntl = disc_dust_poll / 100;

    // Final W = Mill W - Moisture Cut - Cutting - Disc/Dust (P.Pkt already subtracted in Mill W)
    const final_w_qntl = mill_w_qntl - moisture_cut_qntl - cutting_qntl - disc_dust_poll_qntl;

    setCalculatedFields({
      qntl: (kg / 100).toFixed(2),
      mill_w: mill_w_qntl.toFixed(2),
      p_pkt_cut: p_pkt_cut.toFixed(2),
      p_pkt_cut_qntl: p_pkt_cut_qntl.toFixed(2),
      moisture_cut: (moisture_cut_qntl * 100).toFixed(2), // Show in KG for reference
      moisture_cut_qntl: moisture_cut_qntl.toFixed(2),
      moisture_cut_percent: moisture_cut_percent.toFixed(2),
      cutting: (cutting_qntl * 100).toFixed(2), // Show in KG for reference
      cutting_qntl: cutting_qntl.toFixed(2),
      final_w: final_w_qntl.toFixed(2),
    });
  }, [formData.kg, formData.gbw_cut, formData.disc_dust_poll, formData.plastic_bag, formData.cutting_percent, formData.moisture]);

  // Auto-calculate GBW Cut based on G.Deposite
  useEffect(() => {
    if (formData.bag) {
      const bagCount = parseInt(formData.bag) || 0;
      const gDeposite = parseFloat(formData.g_deposite) || 0;
      const cutRate = gDeposite > 0 ? 0.5 : 1;
      const gbwCut = bagCount * cutRate;
      
      setFormData(prev => ({
        ...prev,
        gbw_cut: gbwCut.toString()
      }));
    }
  }, [formData.bag, formData.g_deposite]);

  // Remove external badges - run only on Electron (desktop app)
  useEffect(() => {
    const isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
    if (isElectron) return; // No badge on desktop app, skip
    const removeBadge = () => {
      document.querySelectorAll('a[href*="emergent"], iframe[src*="emergent"]').forEach(el => {
        el.remove();
      });
    };
    removeBadge();
    const timeout = setTimeout(removeBadge, 3000);
    return () => clearTimeout(timeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // Fetch suggestions
  const suggestionsAbortRef = useRef(null);
  const fetchSuggestions = useCallback(async () => {
    if (suggestionsAbortRef.current) suggestionsAbortRef.current.abort();
    const ctrl = new AbortController();
    suggestionsAbortRef.current = ctrl;
    try {
      const [trucksRes, agentsRes, mandisRes] = await Promise.all([
        axios.get(`${API}/suggestions/trucks`, { signal: ctrl.signal }),
        axios.get(`${API}/suggestions/agents`, { signal: ctrl.signal }),
        axios.get(`${API}/suggestions/mandis`, { signal: ctrl.signal })
      ]);
      if (!ctrl.signal.aborted) {
        setTruckSuggestions(trucksRes.data.suggestions || []);
        setAgentSuggestions(agentsRes.data.suggestions || []);
        setMandiSuggestions(mandisRes.data.suggestions || []);
      }
    } catch (error) {
      if (!ctrl.signal.aborted) logger.error("Suggestions fetch error:", error);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMandisForAgent = async (agentName) => {
    try {
      const response = await axios.get(`${API}/suggestions/mandis?agent_name=${encodeURIComponent(agentName)}`);
      if (response.data.suggestions?.length > 0) {
        setMandiSuggestions(response.data.suggestions);
      }
    } catch (error) {
      logger.error("Agent mandis fetch error:", error);
    }
  };

  // Auto-fill from Vehicle Weight RST number
  const rstTimerRef = useRef(null);

  // Fetch pending VW count for notification badge
  const fetchPendingVwCount = useCallback(async () => {
    try {
      const kms = filters.kms_year || '';
      const r = await axios.get(`${API}/vehicle-weight/pending-count?kms_year=${kms}`);
      setPendingVwCount(r.data.pending_count || 0);
    } catch (e) { /* ignore */ }
  }, [filters.kms_year]);
  useEffect(() => { fetchPendingVwCount(); }, [fetchPendingVwCount]);
  const fetchVehicleWeightByRst = useCallback(async (rstNo) => {
    if (!rstNo || isNaN(rstNo)) return;
    try {
      const res = await axios.get(`${API}/vehicle-weight/by-rst/${rstNo}?kms_year=${filters.kms_year || ''}`);
      if (res.data.success && res.data.entry) {
        const vw = res.data.entry;
        setFormData(prev => {
          const mandiName = vw.farmer_name || prev.mandi_name;
          const cuttingTarget = findMandiCutting(mandiName);
          return {
            ...prev,
            date: vw.date || prev.date,
            truck_no: vw.vehicle_no || prev.truck_no,
            agent_name: vw.party_name || prev.agent_name,
            mandi_name: mandiName,
            kg: vw.net_wt ? String(vw.net_wt) : prev.kg,
            bag: vw.tot_pkts ? String(vw.tot_pkts) : prev.bag,
            cash_paid: vw.cash_paid ? String(vw.cash_paid) : prev.cash_paid,
            diesel_paid: vw.diesel_paid ? String(vw.diesel_paid) : prev.diesel_paid,
            g_issued: vw.g_issued ? String(vw.g_issued) : prev.g_issued,
            tp_no: vw.tp_no || prev.tp_no,
            tp_weight: vw.tp_weight ? String(vw.tp_weight) : prev.tp_weight,
            remark: vw.remark || prev.remark,
            cutting_percent: cuttingTarget ? String(cuttingTarget.cutting_percent) : prev.cutting_percent,
          };
        });
        const netInfo = vw.net_wt ? ` | Net: ${Number(vw.net_wt).toLocaleString()} KG` : '';
        const cashInfo = vw.cash_paid ? ` | Cash: ${vw.cash_paid}` : '';
        toast.success(`RST #${rstNo} से auto-fill: ${vw.vehicle_no} | ${vw.party_name}${netInfo}${cashInfo}`);
        setRstFetched(true);
      }
    } catch (e) {
      // RST not found in vehicle weight - ignore silently
    }
  }, [filters.kms_year, findMandiCutting]);

  const debouncedRstLookup = useCallback((rstNo) => {
    if (rstTimerRef.current) clearTimeout(rstTimerRef.current);
    rstTimerRef.current = setTimeout(() => fetchVehicleWeightByRst(rstNo), 600);
  }, [fetchVehicleWeightByRst]);

  const [entriesPage, setEntriesPage] = useState(1);
  const [entriesTotalPages, setEntriesTotalPages] = useState(1);
  const [entriesTotalCount, setEntriesTotalCount] = useState(0);
  const ENTRIES_PAGE_SIZE = 200;

  const entriesAbortRef = useRef(null);
  const fetchEntries = useCallback(async (fetchPage) => {
    if (entriesAbortRef.current) entriesAbortRef.current.abort();
    const ctrl = new AbortController();
    entriesAbortRef.current = ctrl;
    try {
      setLoading(true);
      const p = fetchPage || entriesPage;
      const params = new URLSearchParams();
      if (filters.truck_no) params.append('truck_no', filters.truck_no);
      if (filters.rst_no) params.append('rst_no', filters.rst_no);
      if (filters.tp_no) params.append('tp_no', filters.tp_no);
      if (filters.agent_name) params.append('agent_name', filters.agent_name);
      if (filters.mandi_name) params.append('mandi_name', filters.mandi_name);
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      // Skip date filter when any search field is active
      const hasSearch = filters.truck_no || filters.rst_no || filters.tp_no || filters.agent_name || filters.mandi_name;
      if (!hasSearch) {
        if (filters.date_from) params.append('date_from', filters.date_from);
        if (filters.date_to) params.append('date_to', filters.date_to);
      }
      params.append('page', p);
      params.append('page_size', ENTRIES_PAGE_SIZE);
      
      const response = await axios.get(`${API}/entries?${params.toString()}`, { signal: ctrl.signal });
      const data = response.data;
      setEntries(data.entries || data);
      setEntriesTotalPages(data.total_pages || 1);
      setEntriesTotalCount(data.total || 0);
      setEntriesPage(data.page || 1);
    } catch (error) {
      if (!ctrl.signal.aborted) { toast.error("Entries load karne mein error"); logger.error(error); }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [filters, entriesPage]);

  const totalsAbortRef = useRef(null);
  const fetchTotals = useCallback(async () => {
    if (totalsAbortRef.current) totalsAbortRef.current.abort();
    const ctrl = new AbortController();
    totalsAbortRef.current = ctrl;
    try {
      const params = new URLSearchParams();
      if (filters.truck_no) params.append('truck_no', filters.truck_no);
      if (filters.agent_name) params.append('agent_name', filters.agent_name);
      if (filters.mandi_name) params.append('mandi_name', filters.mandi_name);
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      const hasSearch = filters.truck_no || filters.agent_name || filters.mandi_name;
      if (!hasSearch) {
        if (filters.date_from) params.append('date_from', filters.date_from);
        if (filters.date_to) params.append('date_to', filters.date_to);
      }
      
      const response = await axios.get(`${API}/totals?${params.toString()}`, { signal: ctrl.signal });
      if (!ctrl.signal.aborted) setTotals(response.data);
    } catch (error) {
      if (!ctrl.signal.aborted) logger.error("Totals fetch error:", error);
    }
  }, [filters]);

  const mainFetchAbortRef = useRef(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mainFetchAbortRef.current) mainFetchAbortRef.current.abort();
      const ctrl = new AbortController();
      mainFetchAbortRef.current = ctrl;
      fetchEntries();
      fetchTotals();
      fetchSuggestions();
      // Fetch mandi targets for auto cutting %
      axios.get(`${API}/mandi-targets?kms_year=${filters.kms_year || ''}`, { signal: ctrl.signal }).then(r => {
        const targets = r.data || [];
        setMandiTargets(targets);
        if (targets.length > 0) {
          const targetNames = targets.map(t => t.mandi_name).filter(Boolean);
          setMandiSuggestions(prev => {
            const combined = [...new Set([...prev, ...targetNames])];
            return combined.sort();
          });
        }
      }).catch(() => {});
      // Fetch leased truck numbers for badge display
      axios.get(`${API}/truck-leases?status=active`, { signal: ctrl.signal }).then(res => {
        setLeasedTruckNos(new Set((res.data || []).map(l => l.truck_no.toUpperCase())));
      }).catch(() => {});
    }, 300);
    return () => { clearTimeout(timer); if (mainFetchAbortRef.current) mainFetchAbortRef.current.abort(); };
  }, [fetchEntries, fetchTotals, fetchSuggestions, filters.kms_year]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset selection when entries change
  useEffect(() => {
    setSelectedEntries([]);
    setSelectAll(false);
  }, [entries]);

  // Fetch branding on mount
  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const response = await axios.get(`${API}/branding`);
        const data = { ...response.data, custom_fields: response.data.custom_fields || [] };
        setBranding(data);
      } catch (error) {
        logger.error("Branding fetch error:", error);
      }
    };
    fetchBranding();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // ---- BACKUP FUNCTIONS ----
  const fetchBackups = async () => {
    try {
      const res = await axios.get(`${API}/backups`);
      setBackups(res.data.backups || []);
      setBackupStatus(res.data);
    } catch (e) {
      // Backup API not available (web version) - silently ignore
      setBackupStatus(null);
    }
  };


  const checkBackupReminder = async () => {
    try {
      const res = await axios.get(`${API}/backups/status`);
      if (!res.data.has_today_backup && res.data.total_backups > 0) {
        setShowBackupReminder(true);
      }
    } catch (e) {
      // Not on local server
    }
  };

  useEffect(() => {
    if (user) checkBackupReminder();
  }, [user]);

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await axios.post(`${API}/backups`);
      toast.success(res.data.message || "Backup ban gaya!");
      fetchBackups();
      setShowBackupReminder(false);
    } catch (e) {
      toast.error("Backup mein error: " + (e.response?.data?.detail || e.message));
    }
    setBackupLoading(false);
  };


  // Global Keyboard Shortcuts (extracted hook)
  const [showShortcuts, setShowShortcuts] = useState(false);
  useKeyboardShortcuts({
    activeTab, setActiveTabSafe, selectedEntries, fetchEntries, fetchTotals,
    setIsDialogOpen, setEditingId, setFormData, setShowFilters, setShowShortcuts,
    setQuickSearchOpen, filters
  });

  // Handle select all
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedEntries([]);
    } else {
      const editableEntries = entries.filter(e => canEditEntry(e)).map(e => e.id);
      setSelectedEntries(editableEntries);
    }
    setSelectAll(!selectAll);
  };

  // Handle single selection
  const handleSelectEntry = (entryId) => {
    setSelectedEntries(prev => {
      if (prev.includes(entryId)) {
        return prev.filter(id => id !== entryId);
      } else {
        return [...prev, entryId];
      }
    });
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (selectedEntries.length === 0) {
      toast.error("Koi entry select nahi ki");
      return;
    }
    
    const ok = await showConfirm("Bulk Delete", `Kya aap ${selectedEntries.length} entries delete karna chahte hain?`);
    if (ok) {
      try {
        const params = `?username=${user.username}&role=${user.role}`;
        let deleted = 0;
        let failed = 0;
        
        for (const entryId of selectedEntries) {
          try {
            await axios.delete(`${API}/entries/${entryId}${params}`);
            deleted++;
          } catch (error) {
            failed++;
          }
        }
        
        if (deleted > 0) {
          toast.success(`${deleted} entries delete ho gayi!`);
        }
        if (failed > 0) {
          toast.error(`${failed} entries delete nahi hui (permission issue)`);
        }
        
        setSelectedEntries([]);
        setSelectAll(false);
        fetchEntries();
        fetchTotals();
        fetchPendingVwCount();
      } catch (error) {
        toast.error("Delete karne mein error");
      }
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAgentSelect = (agentName) => {
    setFormData(prev => ({ ...prev, agent_name: agentName }));
    fetchMandisForAgent(agentName);
  };

  // Check if user can edit/delete entry
  const canEditEntry = (entry) => {
    if (user.role === 'admin') return true;
    
    if (entry.created_by !== user.username) return false;
    
    const createdAt = new Date(entry.created_at);
    const now = new Date();
    const diffMinutes = (now - createdAt) / (1000 * 60);
    
    return diffMinutes <= 5;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation: At least truck_no or agent_name or mandi_name required
    const hasData = formData.truck_no?.trim() || formData.agent_name?.trim() || formData.mandi_name?.trim() || 
                    (parseFloat(formData.kg) > 0) || (parseInt(formData.bag) > 0);
    if (!hasData) {
      toast.error("Blank entry save nahi hogi! Kam se kam Truck No, Agent ya Mandi bharo");
      return;
    }

    // Validation: Bags mandatory (Gunny + Plastic)
    const totalBags = (parseInt(formData.bag) || 0) + (parseInt(formData.plastic_bag) || 0);
    if (totalBags <= 0) {
      toast.error("Bags khali nahi ho sakta! Gunny Bags ya Plastic Bags daalna zaroori hai");
      return;
    }

    try {
      const dataToSend = {
        ...formData,
        kg: parseFloat(formData.kg) || 0,
        bag: parseInt(formData.bag) || 0,
        g_deposite: parseFloat(formData.g_deposite) || 0,
        gbw_cut: parseFloat(formData.gbw_cut) || 0,
        plastic_bag: parseInt(formData.plastic_bag) || 0,
        cutting_percent: parseFloat(formData.cutting_percent) || 0,
        disc_dust_poll: parseFloat(formData.disc_dust_poll) || 0,
        g_issued: parseFloat(formData.g_issued) || 0,
        moisture: parseFloat(formData.moisture) || 0,
        cash_paid: parseFloat(formData.cash_paid) || 0,
        diesel_paid: parseFloat(formData.diesel_paid) || 0,
      };

      const params = `?username=${user.username}&role=${user.role}`;

      if (editingId) {
        await axios.put(`${API}/entries/${editingId}${params}`, { ...dataToSend, _v: formData._v });
        toast.success("Entry update ho gayi!");
      } else {
        await axios.post(`${API}/entries${params}`, dataToSend);
        toast.success("Entry add ho gayi!");
      }

      // Save mandi→cutting mapping for future auto-fill
      saveCuttingToLocal(formData.mandi_name, formData.cutting_percent);

      setFormData({...initialFormState, kms_year: filters.kms_year || CURRENT_FY, season: filters.season || "Kharif"});
      setEditingId(null);
      setIsDialogOpen(false);
      fetchEntries();
      fetchTotals();
      fetchSuggestions();
      fetchPendingVwCount();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Entry save karne mein error");
      logger.error(error);
    }
  };

  const handleEdit = (entry) => {
    if (!canEditEntry(entry)) {
      if (entry.created_by !== user.username) {
        toast.error("Aap sirf apni entry edit kar sakte hain");
      } else {
        toast.error("5 minute se zyada ho gaye, ab edit nahi ho sakta");
      }
      return;
    }

    setFormData({
      date: entry.date,
      kms_year: entry.kms_year || FY_YEARS[FY_YEARS.length - 2],
      season: entry.season || "Kharif",
      truck_no: entry.truck_no || "",
      agent_name: entry.agent_name || "",
      mandi_name: entry.mandi_name || "",
      kg: entry.kg?.toString() || "",
      bag: entry.bag?.toString() || "",
      g_deposite: entry.g_deposite?.toString() || "",
      gbw_cut: entry.gbw_cut?.toString() || "",
      plastic_bag: entry.plastic_bag?.toString() || "",
      cutting_percent: entry.cutting_percent?.toString() || "",
      disc_dust_poll: entry.disc_dust_poll?.toString() || "",
      g_issued: entry.g_issued?.toString() || "",
      moisture: entry.moisture?.toString() || "",
      cash_paid: entry.cash_paid?.toString() || "",
      diesel_paid: entry.diesel_paid?.toString() || "",
      remark: entry.remark || "",
      rst_no: entry.rst_no || "",
      tp_no: entry.tp_no || "",
      tp_weight: entry.tp_weight?.toString() || "",
      _v: entry._v,
    });
    setEditingId(entry.id);
    setIsDialogOpen(true);
  };

  const handleDelete = async (entry) => {
    if (!canEditEntry(entry)) {
      if (entry.created_by !== user.username) {
        toast.error("Aap sirf apni entry delete kar sakte hain");
      } else {
        toast.error("5 minute se zyada ho gaye, ab delete nahi ho sakta");
      }
      return;
    }

    const ok = await showConfirm("Delete Entry", "Kya aap sure hain is entry ko delete karna chahte hain?");
    if (ok) {
      try {
        const params = `?username=${user.username}&role=${user.role}`;
        await axios.delete(`${API}/entries/${entry.id}${params}`);
        toast.success("Entry delete ho gayi!");
        fetchEntries();
        fetchTotals();
        fetchPendingVwCount();
      } catch (error) {
        toast.error(error.response?.data?.detail || "Delete karne mein error");
        logger.error(error);
      }
    }
  };

  const openNewEntryDialog = () => {
    setFormData({...initialFormState, kms_year: filters.kms_year || CURRENT_FY, season: filters.season || "Kharif"});
    setEditingId(null);
    setRstFetched(false);
    setIsDialogOpen(true);
  };

  const handleExportExcel = async () => {
    const params = new URLSearchParams();
    if (filters.truck_no) params.append('truck_no', filters.truck_no);
    if (filters.agent_name) params.append('agent_name', filters.agent_name);
    if (filters.mandi_name) params.append('mandi_name', filters.mandi_name);
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    
    const { downloadFile } = await import('./utils/download');
    downloadFile(`/api/export/excel?${params.toString()}`, 'entries.xlsx');
    toast.success("Excel download ho raha hai!");
  };

  const handleExportPDF = async () => {
    const params = new URLSearchParams();
    if (filters.truck_no) params.append('truck_no', filters.truck_no);
    if (filters.agent_name) params.append('agent_name', filters.agent_name);
    if (filters.mandi_name) params.append('mandi_name', filters.mandi_name);
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    
    const { downloadFile } = await import('./utils/download');
    downloadFile(`/api/export/pdf?${params.toString()}`, 'mill_entries.pdf');
    toast.success("PDF generate ho raha hai!");
  };

  // Build filter params for entries WA/Group
  const _entryFilterParams = () => {
    const p = new URLSearchParams();
    if (filters.truck_no) p.append('truck_no', filters.truck_no);
    if (filters.agent_name) p.append('agent_name', filters.agent_name);
    if (filters.mandi_name) p.append('mandi_name', filters.mandi_name);
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    if (filters.season) p.append('season', filters.season);
    return p;
  };
  const _entryFilterLabel = () => {
    const parts = [];
    if (filters.kms_year) parts.push(`FY:${filters.kms_year}`);
    if (filters.season) parts.push(filters.season);
    if (filters.mandi_name) parts.push(filters.mandi_name);
    if (filters.agent_name) parts.push(filters.agent_name);
    if (filters.truck_no) parts.push(filters.truck_no);
    return parts.length ? parts.join(' | ') : 'All';
  };

  const handleEntriesWhatsApp = async () => {
    try {
      const params = _entryFilterParams();
      const pdfUrl = `${API}/export/pdf?${params.toString()}`;
      const text = `*Paddy Entries Report*\nFilter: ${_entryFilterLabel()}\nTotal Entries: ${entries.length}`;
      const res = await axios.post(`${API}/whatsapp/send-daily-report`, {
        report_text: text, pdf_url: pdfUrl, send_to_numbers: true, send_to_group: false
      });
      if (res.data.success) toast.success("WhatsApp bhej diya!");
      else toast.error(res.data.error || "WhatsApp send fail");
    } catch (e) { toast.error(e.response?.data?.detail || "WhatsApp send error"); }
  };

  const handleEntriesGroupSend = () => {
    const params = _entryFilterParams();
    setEntryGroupText(`*Paddy Entries Report*\nFilter: ${_entryFilterLabel()}\nTotal Entries: ${entries.length}`);
    setEntryGroupPdfUrl(`/api/export/pdf?${params.toString()}`);
    setEntryGroupDialogOpen(true);
  };

  const [entriesTgSending, setEntriesTgSending] = useState(false);
  const handleEntriesTelegram = async () => {
    setEntriesTgSending(true);
    try {
      const params = _entryFilterParams();
      const text = `Paddy Entries Report | Filter: ${_entryFilterLabel()} | Total: ${entries.length}`;
      const res = await axios.post(`${API}/telegram/send-custom`, { text, pdf_url: `/api/export/pdf?${params.toString()}` });
      if (res.data.success) toast.success("Telegram bhej diya!");
      else toast.error(res.data.error || "Telegram send fail");
    } catch (e) { toast.error(e.response?.data?.detail || "Telegram send error"); }
    setEntriesTgSending(false);
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("New password aur confirm password match nahi kar rahe");
      return;
    }
    if (passwordData.newPassword.length < 6) {
      toast.error("Password kam se kam 6 characters ka hona chahiye");
      return;
    }
    try {
      const response = await axios.post(`${API}/auth/change-password`, {
        username: user.username,
        current_password: passwordData.currentPassword,
        new_password: passwordData.newPassword
      });
      if (response.data.success) {
        toast.success("Password change ho gaya!");
        setIsPasswordDialogOpen(false);
        setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Password change mein error");
    }
  };

  return (
    <div className={`min-h-screen ${theme === 'light' ? 'bg-gradient-to-br from-slate-100 via-white to-slate-50' : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900'}`} data-theme={theme}>
      <Toaster position="top-right" richColors expand={true} toastOptions={{ style: { zIndex: 99999 } }} />
      
      <AppHeader
        branding={branding} user={user} onLogout={onLogout} APP_VERSION={APP_VERSION}
        theme={theme} toggleTheme={toggleTheme}
        filters={filters} setFilters={setFilters} showFilters={showFilters} setShowFilters={setShowFilters}
        hasActiveFilters={hasActiveFilters} clearFilters={clearFilters} handleFyChange={handleFyChange}
        activeTab={activeTab} setActiveTabSafe={setActiveTabSafe} entriesSubTab={entriesSubTab}
        fetchEntries={fetchEntries} fetchTotals={fetchTotals}
        showShortcuts={showShortcuts} setShowShortcuts={setShowShortcuts}
        showBackupReminder={showBackupReminder} setShowBackupReminder={setShowBackupReminder}
        handleCreateBackup={handleCreateBackup} backupLoading={backupLoading}
        isPasswordDialogOpen={isPasswordDialogOpen} setIsPasswordDialogOpen={setIsPasswordDialogOpen}
        passwordData={passwordData} setPasswordData={setPasswordData} handlePasswordChange={handlePasswordChange}
        quickSearchOpen={quickSearchOpen} setQuickSearchOpen={setQuickSearchOpen}
        searchDetailItem={searchDetailItem} setSearchDetailItem={setSearchDetailItem}
        setPaymentsInitSubTab={setPaymentsInitSubTab} navigateToMillEntry={navigateToMillEntry}
        showWhatsNew={showWhatsNew} setShowWhatsNew={setShowWhatsNew}
        isDialogOpen={isDialogOpen} setIsDialogOpen={setIsDialogOpen} editingId={editingId}
        formData={formData} setFormData={setFormData} calculatedFields={calculatedFields}
        leasedTruckNos={leasedTruckNos} truckSuggestions={truckSuggestions}
        agentSuggestions={agentSuggestions} mandiSuggestions={mandiSuggestions}
        openNewEntryDialog={openNewEntryDialog} handleSubmit={handleSubmit}
        handleInputChange={handleInputChange} debouncedRstLookup={debouncedRstLookup}
        handleAgentSelect={handleAgentSelect} findMandiCutting={findMandiCutting} rstFetched={rstFetched}
        handleExportExcel={handleExportExcel} handleExportPDF={handleExportPDF}
        handleEntriesWhatsApp={handleEntriesWhatsApp} handleEntriesGroupSend={handleEntriesGroupSend}
        handleEntriesTelegram={handleEntriesTelegram} entriesTgSending={entriesTgSending}
        wa={wa} tg={tg}
      />

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-2 sm:px-4 py-3 sm:py-6 print-content">
        {/* Print Header - Only visible when printing */}
        <div className="print-header">
          {branding.company_name || 'Mill Entry System'} — {branding.tagline || ''}
          <div style={{fontSize: '12px', fontWeight: 'normal', marginTop: '2px'}}>
            {activeTab.charAt(0).toUpperCase() + activeTab.slice(1).replace('-', ' ')} | {filters.kms_year} {filters.season || ''}
          </div>
        </div>
        <ErrorBoundary key={activeTab}>
        <Suspense fallback={<LazyFallback />}>
        {activeTab === "dashboard" ? (
          <Dashboard filters={filters} user={user} />
        ) : activeTab === "payments" ? (
          <Payments filters={filters} user={user} branding={branding} initialSubTab={paymentsInitSubTab} onSubTabConsumed={() => setPaymentsInitSubTab(null)} />
        ) : activeTab === "milling" ? (
          <MillingTracker filters={filters} user={user} />
        ) : activeTab === "cashbook" ? (
          <CashBook filters={filters} user={user} />
        ) : activeTab === "reports" ? (
          <Reports filters={filters} user={user} />
        ) : activeTab === "vouchers" ? (
          <Vouchers filters={filters} user={user} onNavigate={(tab) => setActiveTabSafe(tab)} />
        ) : activeTab === "stock-register" ? (
          <StockRegister filters={filters} user={user} />
        ) : activeTab === "mill-parts" ? (
          <MillPartsStock filters={filters} user={user} />
        ) : activeTab === "staff" ? (
          <StaffManagement filters={filters} user={user} />
        ) : activeTab === "hemali" ? (
          <HemaliPayment filters={filters} user={user} />
        ) : activeTab === "fy-summary" ? (
          <FYSummaryWithTabs filters={filters} user={user} />
        ) : activeTab === "settings" ? (
          <Settings user={user} setUser={setUser} kmsYear={filters.kms_year} onBrandingUpdate={(updated) => setBranding(updated)} />
        ) : (
          <>
            {/* Entries Sub-tabs: Mill Entries | Vehicle Weight */}
            <div className="flex gap-1 sm:gap-2 mb-4 border-b border-slate-700 pb-2 overflow-x-auto" data-testid="entries-sub-tabs">
              <Button
                onClick={() => setEntriesSubTabSafe("mill-entries")}
                variant={entriesSubTab === 'mill-entries' ? "default" : "ghost"}
                size="sm"
                className={`whitespace-nowrap text-xs sm:text-sm ${entriesSubTab === 'mill-entries'
                  ? "bg-amber-500 hover:bg-amber-600 text-slate-900"
                  : "text-slate-300 hover:bg-slate-700"}`}
                data-testid="subtab-mill-entries"
              >
                <FileSpreadsheet className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Mill</span> Entries
              </Button>
              <Button
                onClick={() => setEntriesSubTabSafe("vehicle-weight")}
                variant={entriesSubTab === 'vehicle-weight' ? "default" : "ghost"}
                size="sm"
                className={`whitespace-nowrap text-xs sm:text-sm ${entriesSubTab === 'vehicle-weight'
                  ? "bg-amber-500 hover:bg-amber-600 text-slate-900"
                  : "text-slate-300 hover:bg-slate-700"}`}
                data-testid="subtab-vehicle-weight"
              >
                <Scale className="w-4 h-4 mr-1" /> Auto Vehicle Weight
              </Button>
              <Button
                onClick={() => setEntriesSubTabSafe("auto-weight-entries")}
                variant={entriesSubTab === 'auto-weight-entries' ? "default" : "ghost"}
                size="sm"
                className={entriesSubTab === 'auto-weight-entries'
                  ? "bg-amber-500 hover:bg-amber-600 text-slate-900"
                  : "text-slate-300 hover:bg-slate-700"}
                data-testid="subtab-auto-weight-entries"
              >
                <CheckCircle className="w-4 h-4 mr-1" /> Auto Weight Entries
                {pendingVwCount > 0 && <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none animate-pulse">{pendingVwCount}</span>}
              </Button>
            </div>

            {entriesSubTab === "vehicle-weight" ? (
              <VehicleWeight filters={filters} user={user} onVwChange={fetchPendingVwCount} />
            ) : entriesSubTab === "auto-weight-entries" ? (
              <AutoWeightEntries filters={filters} onVwChange={fetchPendingVwCount} />
            ) : (
            <>
            <EntryTable
              totals={totals}
              entries={entries}
              entriesPage={entriesPage}
              entriesTotalPages={entriesTotalPages}
              entriesTotalCount={entriesTotalCount}
              pageSize={ENTRIES_PAGE_SIZE}
              selectedEntries={selectedEntries}
              selectAll={selectAll}
              loading={loading}
              leasedTruckNos={leasedTruckNos}
              hasActiveFilters={hasActiveFilters}
              filters={filters}
              todayStr={todayStr}
              handleSelectAll={handleSelectAll}
              handleSelectEntry={handleSelectEntry}
              handleBulkDelete={handleBulkDelete}
              handleEdit={handleEdit}
              handleDelete={handleDelete}
              canEditEntry={canEditEntry}
              fetchEntries={fetchEntries}
              setEntriesPage={setEntriesPage}
              viewEntryData={viewEntryData}
              onCloseViewEntry={handleCloseViewEntry}
            />
            </>
            )}
          </>
        )}
        </Suspense>
        </ErrorBoundary>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-600/60 mt-10 no-print">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-4 py-4 sm:py-6 text-center space-y-2">
          <p className="text-slate-300 text-xs sm:text-sm font-semibold tracking-wide">
            Mill Entry System <span className="text-slate-500 font-normal hidden sm:inline">- Data Management Software</span>
          </p>
          <div className="flex items-center justify-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-slate-500 pt-1 flex-wrap">
            <span className="text-amber-400/70 font-mono" data-testid="footer-version">v{APP_VERSION}</span>
            <span className="text-slate-700">|</span>
            <span>Designed By: <a href="https://www.9x.design" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 transition-colors" data-testid="footer-designer">9x.design</a></span>
            <span className="text-slate-700 hidden sm:inline">|</span>
            <span className="hidden sm:inline">Contact: <a href="tel:+917205930002" className="text-cyan-400 hover:text-cyan-300 transition-colors" data-testid="footer-contact">+91 72059 30002</a></span>
          </div>
        </div>
      </footer>

      {/* What's New Dialog - auto shows on version update */}
      <Suspense fallback={null}>
        <WhatsNew />
        {showWhatsNew && <WhatsNew forceOpen onClose={() => setShowWhatsNew(false)} />}
      </Suspense>

      {/* Auto Update Notification */}
      <AutoUpdate />

      {/* Entries Group Send Dialog */}
      <SendToGroupDialog open={entryGroupDialogOpen} onOpenChange={setEntryGroupDialogOpen} text={entryGroupText} pdfUrl={entryGroupPdfUrl} />

      {/* Confirm Dialog (replaces window.confirm to prevent UI freeze) */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => { if (!open && confirmDialog.onCancel) confirmDialog.onCancel(); }}>
        <AlertDialogContent className="bg-slate-800 border-slate-700" data-testid="confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">{confirmDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600" data-testid="confirm-cancel-btn">Nahi</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={confirmDialog.onConfirm} data-testid="confirm-ok-btn">Haan, Karein</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { ConfirmProvider } from "@/components/ConfirmProvider";
import logger from "@/utils/logger";

// Main App with Auth
function App() {
  const [user, setUser] = useState(() => {
    const saved = sessionStorage.getItem('mill_user');
    return saved ? JSON.parse(saved) : null;
  });

  const handleLogin = (username, role, permissions = {}, display_name = "") => {
    const userData = { username, role, permissions, display_name: display_name || username };
    setUser(userData);
    sessionStorage.setItem('mill_user', JSON.stringify(userData));
  };

  const handleLogout = async () => {
    // Auto backup on logout
    try {
      await axios.post(`${API}/backups/on-logout`);
    } catch (_) {}
    setUser(null);
    sessionStorage.removeItem('mill_user');
    localStorage.removeItem('mill_user');
    toast.success("Logged out - Backup saved!");
    // Electron: close app instead of showing login page
    if (window.electronAPI?.closeApp) {
      setTimeout(() => window.electronAPI.closeApp(), 500);
    }
  };

  if (!user) {
    return (
      <>
        <Toaster position="top-right" richColors expand={true} toastOptions={{ style: { zIndex: 99999 } }} />
        <LoginPage onLogin={handleLogin} />
      </>
    );
  }

  return (
    <ConfirmProvider>
      <MainApp user={user} setUser={setUser} onLogout={handleLogout} />
    </ConfirmProvider>
  );
}

export default App;
