import { useState, useEffect, useCallback, useRef } from "react";
import "@/App.css";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Trash2, Edit, Plus, Calculator, RefreshCw, Filter, X, 
  FileSpreadsheet, FileText, LogOut, User, Lock, Key, Target, 
  BarChart3, TrendingUp, Calendar, Truck, Users, IndianRupee, 
  CheckCircle, Clock, AlertCircle, Undo2, History, Keyboard, 
  Info, Printer, HardDrive, Download, RotateCcw, Shield, ShieldCheck, Sun, Moon,
  Wheat, Wallet, Package, UserCheck, Send, Eye, Scale
} from "lucide-react";

// Import extracted components
import LoginPage from "@/components/LoginPage";
import AutoSuggest from "@/components/common/AutoSuggest";
import Dashboard from "@/components/Dashboard";
import Payments from "@/components/Payments";
import MillingTracker from "@/components/MillingTracker";
import CashBook from "@/components/CashBook";
import DCTracker from "@/components/DCTracker";
import Reports from "@/components/Reports";
import Ledgers from "@/components/Ledgers";
import MillPartsStock from "@/components/MillPartsStock";
import StaffManagement from "@/components/StaffManagement";
import FYSummaryDashboard from "@/components/FYSummaryDashboard";
import BalanceSheet from "@/components/BalanceSheet";
import ExcelImport from "@/components/ExcelImport";
import Vouchers from "@/components/Vouchers";
import { PrintButton } from "@/components/PrintButton";
import ErrorBoundary from "@/components/ErrorBoundary";
import HemaliPayment from "@/components/HemaliPayment";
import WhatsNew, { APP_VERSION } from "@/components/WhatsNew";
import AutoUpdate from "@/components/AutoUpdate";
import { SendToGroupDialog } from "@/components/SendToGroupDialog";
import { useMessagingEnabled } from "./hooks/useMessagingEnabled";
import Settings from "@/components/Settings";
import VehicleWeight from "@/components/VehicleWeight";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

// Format date: YYYY-MM-DD → DD-MM-YYYY
const fmtDate = (d) => {
  if (!d) return '';
  const parts = String(d).split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return d;
};

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

// Safe print helper - uses iframe approach (works in Electron + browser)
const safePrintHTML = (htmlContent) => {
  try {
    const isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
    if (isElectron) {
      // Electron: open a new window with the content for preview + print
      const printWindow = window.open('', '_blank', 'width=900,height=700');
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.onload = () => printWindow.focus();
      } else {
        // Fallback: download as HTML
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'print.html';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
    } else {
      // Browser: use iframe approach
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      iframe.contentDocument.open();
      iframe.contentDocument.write(htmlContent);
      iframe.contentDocument.close();
      setTimeout(() => {
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }, 500);
    }
  } catch(e) {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'print.html';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
};

// Generate FY years (April - March)
const generateFYYears = () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = currentYear - 3; i <= currentYear + 1; i++) {
    years.push(`${i}-${i + 1}`);
  }
  return years;
};

const FY_YEARS = generateFYYears();
// Current FY: if month < April (0-indexed: 3), use prev year
const CURRENT_FY = new Date().getMonth() < 3 ? `${new Date().getFullYear() - 1}-${new Date().getFullYear()}` : `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
const SEASONS = ["Kharif", "Rabi"];

const initialFormState = {
  date: new Date().toISOString().split("T")[0],
  kms_year: CURRENT_FY,
  season: "Kharif",
  truck_no: "",
  rst_no: "",
  tp_no: "",
  agent_name: "",
  mandi_name: "",
  kg: "",
  bag: "",
  g_deposite: "",
  gbw_cut: "",
  plastic_bag: "",
  cutting_percent: "",
  disc_dust_poll: "",
  g_issued: "",
  moisture: "",
  cash_paid: "",
  diesel_paid: "",
  remark: "",
};



function MainApp({ user, onLogout }) {
  const [entries, setEntries] = useState([]);
  const [totals, setTotals] = useState({});
  const [formData, setFormData] = useState(initialFormState);
  const [editingId, setEditingId] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordData, setPasswordData] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("entries"); // "entries", "dashboard", "payments", "milling", "settings"
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

  // Suggestions state
  const [truckSuggestions, setTruckSuggestions] = useState([]);
  const [leasedTruckNos, setLeasedTruckNos] = useState(new Set());
  const [agentSuggestions, setAgentSuggestions] = useState([]);
  const [mandiSuggestions, setMandiSuggestions] = useState([]);
  const [mandiTargets, setMandiTargets] = useState([]);

  // Filter state - default to current FY
  const [filters, setFilters] = useState({
    truck_no: "",
    rst_no: "",
    tp_no: "",
    agent_name: "",
    mandi_name: "",
    kms_year: CURRENT_FY,
    season: "",
    date_from: "",
    date_to: ""
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Load saved FY setting on mount
  useEffect(() => {
    const loadFySetting = async () => {
      try {
        const res = await axios.get(`${API}/fy-settings`);
        if (res.data?.active_fy) {
          setFilters(prev => ({ ...prev, kms_year: res.data.active_fy, season: res.data.season || prev.season }));
        }
      } catch {}
    };
    loadFySetting();
    // Auto-fix: run on every startup to fix any data inconsistencies
    axios.post(`${API}/cash-book/auto-fix`).then(r => {
      if (r.data?.total_fixes > 0) {
        console.log(`[Auto-Fix] Fixed ${r.data.total_fixes} issues:`, r.data.details);
      }
    }).catch(() => {});
  }, []);

  // Save FY setting when year changes
  const handleFyChange = useCallback(async (newFy, newSeason) => {
    setFilters(prev => {
      const updated = { ...prev };
      if (newFy !== undefined) updated.kms_year = newFy;
      if (newSeason !== undefined) updated.season = newSeason;
      return updated;
    });
    try {
      await axios.put(`${API}/fy-settings`, {
        active_fy: newFy !== undefined ? newFy : filters.kms_year,
        season: newSeason !== undefined ? newSeason : filters.season,
      });
    } catch {}
  }, [filters.kms_year, filters.season]);
  
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
    
    // Mill W in QNTL (base for cutting and moisture calculations)
    const mill_w_kg = kg - gbw_cut;
    const mill_w_qntl = mill_w_kg / 100;
    
    // Moisture cut: 17% tak no cut, uske upar (moisture - 17)% cut from Mill W QNTL
    const moisture_cut_percent = moisture > 17 ? (moisture - 17) : 0;
    const moisture_cut_qntl = (mill_w_qntl * moisture_cut_percent) / 100;
    
    // Cutting from Mill W QNTL
    const cutting_qntl = (mill_w_qntl * cutting_percent) / 100;
    
    // P.Pkt cut in QNTL
    const p_pkt_cut_qntl = p_pkt_cut / 100;
    
    // Disc/Dust/Poll in QNTL
    const disc_dust_poll_qntl = disc_dust_poll / 100;

    // Final W = Mill W - P.Pkt - Moisture Cut - Cutting - Disc/Dust
    const final_w_qntl = mill_w_qntl - p_pkt_cut_qntl - moisture_cut_qntl - cutting_qntl - disc_dust_poll_qntl;

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

  // Helper: Find cutting % from mandi targets OR localStorage (case-insensitive)
  const findMandiCutting = useCallback((mandiName) => {
    if (!mandiName) return null;
    const searchName = mandiName.toLowerCase().trim();
    
    // Source 1: Check mandi targets (primary)
    if (mandiTargets.length > 0) {
      const target = mandiTargets.find(t => 
        (t.mandi_name || '').toLowerCase().trim() === searchName
      );
      if (target && target.cutting_percent != null && target.cutting_percent !== 0) return target;
    }
    
    // Source 2: Check localStorage (permanent memory)
    try {
      const saved = JSON.parse(localStorage.getItem('mandi_cutting_map') || '{}');
      if (saved[searchName] && saved[searchName] > 0) {
        return { mandi_name: mandiName, cutting_percent: saved[searchName] };
      }
    } catch(e) {}
    
    return null;
  }, [mandiTargets]);

  // Save mandi→cutting mapping to localStorage on entry save (not on every keystroke)
  const saveCuttingToLocal = useCallback((mandiName, cuttingPercent) => {
    if (!mandiName || !cuttingPercent || parseFloat(cuttingPercent) <= 0) return;
    try {
      const saved = JSON.parse(localStorage.getItem('mandi_cutting_map') || '{}');
      const key = mandiName.toLowerCase().trim();
      saved[key] = parseFloat(cuttingPercent);
      localStorage.setItem('mandi_cutting_map', JSON.stringify(saved));
    } catch(e) {}
  }, []);

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
  }, []);


  // Fetch suggestions
  const fetchSuggestions = useCallback(async () => {
    try {
      const [trucksRes, agentsRes, mandisRes] = await Promise.all([
        axios.get(`${API}/suggestions/trucks`),
        axios.get(`${API}/suggestions/agents`),
        axios.get(`${API}/suggestions/mandis`)
      ]);
      setTruckSuggestions(trucksRes.data.suggestions || []);
      setAgentSuggestions(agentsRes.data.suggestions || []);
      setMandiSuggestions(mandisRes.data.suggestions || []);
    } catch (error) {
      console.error("Suggestions fetch error:", error);
    }
  }, []);

  const fetchMandisForAgent = async (agentName) => {
    try {
      const response = await axios.get(`${API}/suggestions/mandis?agent_name=${encodeURIComponent(agentName)}`);
      if (response.data.suggestions?.length > 0) {
        setMandiSuggestions(response.data.suggestions);
      }
    } catch (error) {
      console.error("Agent mandis fetch error:", error);
    }
  };

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.truck_no) params.append('truck_no', filters.truck_no);
      if (filters.rst_no) params.append('rst_no', filters.rst_no);
      if (filters.tp_no) params.append('tp_no', filters.tp_no);
      if (filters.agent_name) params.append('agent_name', filters.agent_name);
      if (filters.mandi_name) params.append('mandi_name', filters.mandi_name);
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      
      const response = await axios.get(`${API}/entries?${params.toString()}`);
      setEntries(response.data);
    } catch (error) {
      toast.error("Entries load karne mein error");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const fetchTotals = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.truck_no) params.append('truck_no', filters.truck_no);
      if (filters.agent_name) params.append('agent_name', filters.agent_name);
      if (filters.mandi_name) params.append('mandi_name', filters.mandi_name);
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      
      const response = await axios.get(`${API}/totals?${params.toString()}`);
      setTotals(response.data);
    } catch (error) {
      console.error("Totals fetch error:", error);
    }
  }, [filters]);

  useEffect(() => {
    fetchEntries();
    fetchTotals();
    fetchSuggestions();
    // Fetch mandi targets for auto cutting %
    axios.get(`${API}/mandi-targets?kms_year=${filters.kms_year || ''}`).then(r => {
      const targets = r.data || [];
      setMandiTargets(targets);
      console.log('[MILL] Mandi Targets API response:', targets.length, 'targets found', targets.length > 0 ? targets.map(t => `${t.mandi_name}=${t.cutting_percent}%`) : '(empty)');
      if (targets.length > 0) {
        const targetNames = targets.map(t => t.mandi_name).filter(Boolean);
        setMandiSuggestions(prev => {
          const combined = [...new Set([...prev, ...targetNames])];
          return combined.sort();
        });
      }
    }).catch(err => { console.error('[MILL] Mandi targets fetch FAILED:', err.message || err); });
    // Fetch leased truck numbers for badge display
    axios.get(`${API}/truck-leases?status=active`).then(res => {
      setLeasedTruckNos(new Set((res.data || []).map(l => l.truck_no.toUpperCase())));
    }).catch(() => {});
  }, [fetchEntries, fetchTotals, fetchSuggestions, filters.kms_year]);

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
        console.error("Branding fetch error:", error);
      }
    };
    fetchBranding();
  }, []);


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


  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;

      // Backspace on empty field = go to previous field
      if (e.key === 'Backspace' && inInput && !e.ctrlKey && !e.altKey) {
        const el = e.target;
        const val = el.value || el.textContent || '';
        if (val === '') {
          e.preventDefault();
          // Find all focusable fields in the closest form or dialog
          const container = el.closest('form, [role="dialog"], .space-y-4, .space-y-3, .grid');
          if (container) {
            const fields = Array.from(container.querySelectorAll('input, textarea, select, [tabindex]')).filter(f => !f.disabled && f.offsetParent !== null);
            const idx = fields.indexOf(el);
            if (idx > 0) {
              fields[idx - 1].focus();
            }
          }
          return;
        }
      }

      // Ctrl+S: Save/Submit active form (works even in input fields)
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        const submitBtn = document.querySelector('form button[type="submit"], [data-testid="save-btn"], [data-testid="submit-btn"]');
        if (submitBtn) {
          submitBtn.click();
          toast.info("Save (Ctrl+S)");
        }
        return;
      }

      // Ctrl+N: New Entry/Transaction (works even in input)
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        if (activeTab === "entries") {
          setIsDialogOpen(true); setEditingId(null); setFormData(initialFormState);
        } else {
          // Click any visible "Add" button on current tab (exclude whats-new-btn)
          const addBtn = document.querySelector('[data-testid$="-add-btn"]');
          if (addBtn) addBtn.click();
        }
        toast.info("New (Ctrl+N)");
        return;
      }

      // Ctrl+F: Search/Filter (works even in input)
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setShowFilters(true);
        toast.info("Filters (Ctrl+F)");
        return;
      }

      // Ctrl+R: Refresh
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        fetchEntries(); fetchTotals();
        toast.info("Refreshed (Ctrl+R)");
        return;
      }

      // Ctrl+P: Print current view
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        window.print();
        return;
      }

      // Ctrl+Delete / Ctrl+Backspace: Delete selected entries
      if (e.ctrlKey && (e.key === 'Delete' || e.key === 'Backspace') && !inInput) {
        e.preventDefault();
        if (selectedEntries.length > 0) {
          const delBtn = document.querySelector('[data-testid="bulk-delete-btn"]');
          if (delBtn) delBtn.click();
        }
        return;
      }

      // Don't trigger remaining shortcuts when typing
      if (inInput) return;

      // Escape: Close form/dialogs
      if (e.key === 'Escape') {
        setIsDialogOpen(false); setShowFilters(false); setShowShortcuts(false);
      }
      // ?: Show shortcuts help
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault(); setShowShortcuts(true);
      }

      // Alt + tab navigation (existing)
      if (e.altKey) {
        const tabMap = {
          'e': 'entries', 'd': 'dashboard', 'p': 'payments', 'm': 'milling',
          'b': 'cashbook', 't': 'dctracker', 'o': 'reports', 'g': 'vouchers',
          'k': 'mill-parts', 's': 'staff', 'i': 'settings', 'y': 'fy-summary',
        };
        const tabNames = {
          'entries': 'Entries', 'dashboard': 'Dashboard', 'payments': 'Payments', 'milling': 'Milling',
          'cashbook': 'Cash Book', 'dctracker': 'DC Tracker', 'reports': 'Reports', 'vouchers': 'Vouchers',
          'mill-parts': 'Mill Parts', 'staff': 'Staff', 'settings': 'Settings', 'fy-summary': 'FY Summary',
        };
        if (tabMap[e.key]) {
          e.preventDefault();
          setActiveTab(tabMap[e.key]);
          toast.info(`${tabNames[tabMap[e.key]]} (Alt+${e.key.toUpperCase()})`);
        }
        if (e.key === 'n') { e.preventDefault(); setActiveTab("entries"); setIsDialogOpen(true); setEditingId(null); setFormData(initialFormState); toast.info("New Entry (Alt+N)"); }
        if (e.key === 'r') { e.preventDefault(); fetchEntries(); fetchTotals(); toast.info("Refreshed (Alt+R)"); }
        if (e.key === 'f') { e.preventDefault(); setShowFilters(true); toast.info("Filters (Alt+F)"); }
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [fetchEntries, fetchTotals, activeTab, selectedEntries]);

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
        await axios.put(`${API}/entries/${editingId}${params}`, dataToSend);
        toast.success("Entry update ho gayi!");
      } else {
        await axios.post(`${API}/entries${params}`, dataToSend);
        toast.success("Entry add ho gayi!");
      }

      // Save mandi→cutting mapping for future auto-fill
      saveCuttingToLocal(formData.mandi_name, formData.cutting_percent);

      setFormData(initialFormState);
      setEditingId(null);
      setIsDialogOpen(false);
      fetchEntries();
      fetchTotals();
      fetchSuggestions();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Entry save karne mein error");
      console.error(error);
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
      } catch (error) {
        toast.error(error.response?.data?.detail || "Delete karne mein error");
        console.error(error);
      }
    }
  };

  const openNewEntryDialog = () => {
    setFormData(initialFormState);
    setEditingId(null);
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
      const pdfUrl = `http://localhost:8001/api/export/pdf?${params.toString()}`;
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
    if (passwordData.newPassword.length < 4) {
      toast.error("Password kam se kam 4 characters ka hona chahiye");
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

  const clearFilters = () => {
    setFilters({ 
      truck_no: "", 
      rst_no: "",
      tp_no: "",
      agent_name: "", 
      mandi_name: "", 
      kms_year: CURRENT_FY,
      season: "",
      date_from: "",
      date_to: ""
    });
  };

  const hasActiveFilters = filters.truck_no || filters.rst_no || filters.tp_no || filters.agent_name || filters.mandi_name || filters.season || filters.date_from || filters.date_to;

  return (
    <div className={`min-h-screen ${theme === 'light' ? 'bg-gradient-to-br from-slate-100 via-white to-slate-50' : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900'}`} data-theme={theme}>
      <Toaster position="top-right" richColors />
      
      {/* Header */}
      <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-10 no-print">
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-amber-400" data-testid="app-title">
                {branding.company_name}
              </h1>
              <p className="text-slate-400 text-sm">{branding.tagline}</p>
            </div>
            
            {/* User Info & Logout */}
            <div className="flex items-center gap-3">
              {/* Global FY Selector */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-900/30 border border-amber-700/50 rounded-lg" data-testid="global-fy-selector">
                <Calendar className="w-4 h-4 text-amber-400" />
                <div className="flex items-center gap-1">
                  <span className="text-amber-400/70 text-[10px] font-medium">FY</span>
                  <Select value={filters.kms_year} onValueChange={(v) => handleFyChange(v, undefined)}>
                    <SelectTrigger className="bg-transparent border-0 text-amber-400 font-bold h-6 text-sm w-[100px] p-0 focus:ring-0" data-testid="global-fy-year">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-600">
                      {FY_YEARS.map(y => <SelectItem key={y} value={y} className="text-white">{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <span className="text-slate-600">|</span>
                <Select value={filters.season || "all"} onValueChange={(v) => handleFyChange(undefined, v === "all" ? "" : v)}>
                  <SelectTrigger className="bg-transparent border-0 text-slate-300 h-6 text-xs w-[70px] p-0 focus:ring-0" data-testid="global-fy-season">
                    <SelectValue placeholder="Season" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="all" className="text-white">All</SelectItem>
                    <SelectItem value="Kharif" className="text-white">Kharif</SelectItem>
                    <SelectItem value="Rabi" className="text-white">Rabi</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 px-3 py-1 bg-slate-700 rounded-full">
                <User className="w-4 h-4 text-amber-400" />
                <span className="text-white text-sm">{user.username}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${user.role === 'admin' ? 'bg-red-600' : 'bg-blue-600'}`}>
                  {user.role.toUpperCase()}
                </span>
              </div>
              <Button
                onClick={toggleTheme}
                variant="outline"
                size="sm"
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
                data-testid="theme-toggle-btn"
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
              <Button
                onClick={() => setIsPasswordDialogOpen(true)}
                variant="outline"
                size="sm"
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
                data-testid="change-password-btn"
              >
                <Key className="w-4 h-4 mr-1" />
                Password
              </Button>
              <Button
                onClick={() => setShowShortcuts(true)}
                variant="outline"
                size="sm"
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
                data-testid="shortcuts-btn"
                title="Keyboard Shortcuts (Press '?' for help)"
              >
                <Keyboard className="w-4 h-4" />
              </Button>
              <Button
                onClick={() => setShowWhatsNew(true)}
                variant="outline"
                size="sm"
                className="border-amber-600/50 text-amber-400 hover:bg-amber-900/30"
                data-testid="whats-new-btn"
                title="What's New"
              >
                <Info className="w-4 h-4 mr-1" />
                v{APP_VERSION}
              </Button>
              <PrintButton title={activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} />
              <Button
                onClick={onLogout}
                variant="outline"
                size="sm"
                className="border-red-600 text-red-400 hover:bg-red-900/30"
                data-testid="logout-btn"
              >
                <LogOut className="w-4 h-4 mr-1" />
                Logout
              </Button>
            </div>
          </div>

          {/* Keyboard Shortcuts Dialog */}
          <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
            <DialogContent className="max-w-lg bg-slate-800 border-slate-700 text-white">
              <DialogHeader>
                <DialogTitle className="text-amber-400 flex items-center gap-2">
                  <Keyboard className="w-5 h-5" />
                  Keyboard Shortcuts
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Quick Actions (Ctrl)</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-emerald-400 font-mono text-xs">Ctrl+N</kbd>
                    <span className="text-slate-300">New Entry / Transaction</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-emerald-400 font-mono text-xs">Ctrl+S</kbd>
                    <span className="text-slate-300">Save / Submit Form</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-emerald-400 font-mono text-xs">Ctrl+F</kbd>
                    <span className="text-slate-300">Search / Filters</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-emerald-400 font-mono text-xs">Ctrl+R</kbd>
                    <span className="text-slate-300">Refresh Data</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-emerald-400 font-mono text-xs">Ctrl+P</kbd>
                    <span className="text-slate-300">Print</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-emerald-400 font-mono text-xs">Ctrl+Del</kbd>
                    <span className="text-slate-300">Delete Selected</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-emerald-400 font-mono text-xs">Esc</kbd>
                    <span className="text-slate-300">Close Dialog</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-emerald-400 font-mono text-xs">?</kbd>
                    <span className="text-slate-300">Ye Shortcuts</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider pt-2 border-t border-slate-700">Tab Navigation (Alt)</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">Alt+E</kbd>
                    <span className="text-slate-300">Entries</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">Alt+D</kbd>
                    <span className="text-slate-300">Dashboard</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">Alt+P</kbd>
                    <span className="text-slate-300">Payments</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">Alt+M</kbd>
                    <span className="text-slate-300">Milling</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">Alt+B</kbd>
                    <span className="text-slate-300">Cash Book</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">Alt+T</kbd>
                    <span className="text-slate-300">DC Tracker</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">Alt+O</kbd>
                    <span className="text-slate-300">Reports</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">Alt+G</kbd>
                    <span className="text-slate-300">Vouchers</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">Alt+K</kbd>
                    <span className="text-slate-300">Mill Parts</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">Alt+S</kbd>
                    <span className="text-slate-300">Staff</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">Alt+I</kbd>
                    <span className="text-slate-300">Settings</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">Alt+Y</kbd>
                    <span className="text-slate-300">FY Summary</span>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Backup Reminder Dialog */}
          <Dialog open={showBackupReminder} onOpenChange={setShowBackupReminder}>
            <DialogContent className="max-w-sm bg-slate-800 border-amber-700 text-white">
              <DialogHeader>
                <DialogTitle className="text-amber-400 flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Backup Reminder
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-slate-300 text-sm">
                  Aaj ka backup nahi liya hai. Data ki suraksha ke liye backup lein.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={handleCreateBackup}
                    disabled={backupLoading}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    data-testid="backup-reminder-yes"
                  >
                    <HardDrive className="w-4 h-4 mr-2" />
                    {backupLoading ? 'Ho raha hai...' : 'Backup Lein'}
                  </Button>
                  <Button
                    onClick={() => setShowBackupReminder(false)}
                    variant="outline"
                    className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
                    data-testid="backup-reminder-skip"
                  >
                    Baad Mein
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Password Change Dialog */}
          <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
            <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-white">
              <DialogHeader>
                <DialogTitle className="text-amber-400">Password Change Karein</DialogTitle>
              </DialogHeader>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <Label className="text-slate-300">Current Password</Label>
                  <Input
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                    placeholder="Current password"
                    className="bg-slate-700 border-slate-600 text-white"
                    data-testid="current-password"
                  />
                </div>
                <div>
                  <Label className="text-slate-300">New Password</Label>
                  <Input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                    placeholder="New password"
                    className="bg-slate-700 border-slate-600 text-white"
                    data-testid="new-password"
                  />
                </div>
                <div>
                  <Label className="text-slate-300">Confirm New Password</Label>
                  <Input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="Confirm new password"
                    className="bg-slate-700 border-slate-600 text-white"
                    data-testid="confirm-password"
                  />
                </div>
                <div className="flex gap-3 justify-end pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsPasswordDialogOpen(false)}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold"
                  >
                    Change Password
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* Tab Navigation */}
          <div className="flex gap-2 mt-4 border-b border-slate-700 pb-2">
            <Button
              onClick={() => setActiveTab("entries")}
              variant={activeTab === "entries" ? "default" : "ghost"}
              size="sm"
              className={activeTab === "entries" 
                ? "bg-amber-500 hover:bg-amber-600 text-slate-900" 
                : "text-slate-300 hover:bg-slate-700"}
              data-testid="tab-entries"
            >
              <FileSpreadsheet className="w-4 h-4 mr-1" />
              Entries
            </Button>
            <Button
              onClick={() => setActiveTab("dashboard")}
              variant={activeTab === "dashboard" ? "default" : "ghost"}
              size="sm"
              className={activeTab === "dashboard" 
                ? "bg-amber-500 hover:bg-amber-600 text-slate-900" 
                : "text-slate-300 hover:bg-slate-700"}
              data-testid="tab-dashboard"
            >
              <BarChart3 className="w-4 h-4 mr-1" />
              Dashboard & Targets
            </Button>
            <Button
              onClick={() => setActiveTab("milling")}
              variant={activeTab === "milling" ? "default" : "ghost"}
              size="sm"
              className={activeTab === "milling" 
                ? "bg-amber-500 hover:bg-amber-600 text-slate-900" 
                : "text-slate-300 hover:bg-slate-700"}
              data-testid="tab-milling"
            >
              <Wheat className="w-4 h-4 mr-1" />
              Milling (CMR)
            </Button>
            <Button
              onClick={() => setActiveTab("dctracker")}
              variant={activeTab === "dctracker" ? "default" : "ghost"}
              size="sm"
              className={activeTab === "dctracker" 
                ? "bg-amber-500 hover:bg-amber-600 text-slate-900" 
                : "text-slate-300 hover:bg-slate-700"}
              data-testid="tab-dctracker"
            >
              <Truck className="w-4 h-4 mr-1" />
              DC (Payments)
            </Button>
            <Button
              onClick={() => setActiveTab("vouchers")}
              variant={activeTab === "vouchers" ? "default" : "ghost"}
              size="sm"
              className={activeTab === "vouchers" 
                ? "bg-amber-500 hover:bg-amber-600 text-slate-900" 
                : "text-slate-300 hover:bg-slate-700"}
              data-testid="tab-vouchers"
            >
              <FileText className="w-4 h-4 mr-1" />
              Vouchers
            </Button>
            <Button
              onClick={() => setActiveTab("cashbook")}
              variant={activeTab === "cashbook" ? "default" : "ghost"}
              size="sm"
              className={activeTab === "cashbook" 
                ? "bg-amber-500 hover:bg-amber-600 text-slate-900" 
                : "text-slate-300 hover:bg-slate-700"}
              data-testid="tab-cashbook"
            >
              <Wallet className="w-4 h-4 mr-1" />
              Cash Book & Ledgers
            </Button>
            <Button
              onClick={() => setActiveTab("payments")}
              variant={activeTab === "payments" ? "default" : "ghost"}
              size="sm"
              className={activeTab === "payments" 
                ? "bg-amber-500 hover:bg-amber-600 text-slate-900" 
                : "text-slate-300 hover:bg-slate-700"}
              data-testid="tab-payments"
            >
              <IndianRupee className="w-4 h-4 mr-1" />
              Payments
            </Button>
            <Button
              onClick={() => setActiveTab("reports")}
              variant={activeTab === "reports" ? "default" : "ghost"}
              size="sm"
              className={activeTab === "reports" 
                ? "bg-amber-500 hover:bg-amber-600 text-slate-900" 
                : "text-slate-300 hover:bg-slate-700"}
              data-testid="tab-reports"
            >
              <BarChart3 className="w-4 h-4 mr-1" />
              Reports
            </Button>
            <Button
              onClick={() => setActiveTab("mill-parts")}
              variant={activeTab === "mill-parts" ? "default" : "ghost"}
              size="sm"
              className={activeTab === "mill-parts" 
                ? "bg-amber-500 hover:bg-amber-600 text-slate-900" 
                : "text-slate-300 hover:bg-slate-700"}
              data-testid="tab-mill-parts"
            >
              <Package className="w-4 h-4 mr-1" />
              Mill Parts
            </Button>
            <Button
              onClick={() => setActiveTab("staff")}
              variant={activeTab === "staff" ? "default" : "ghost"}
              size="sm"
              className={activeTab === "staff" 
                ? "bg-amber-500 hover:bg-amber-600 text-slate-900" 
                : "text-slate-300 hover:bg-slate-700"}
              data-testid="tab-staff"
            >
              <UserCheck className="w-4 h-4 mr-1" />
              Staff
            </Button>
            <Button
              onClick={() => setActiveTab("hemali")}
              variant={activeTab === "hemali" ? "default" : "ghost"}
              size="sm"
              className={activeTab === "hemali" 
                ? "bg-amber-500 hover:bg-amber-600 text-slate-900" 
                : "text-slate-300 hover:bg-slate-700"}
              data-testid="tab-hemali"
            >
              <Users className="w-4 h-4 mr-1" />
              Hemali
            </Button>
            <Button
              onClick={() => setActiveTab("vehicle-weight")}
              variant={activeTab === "vehicle-weight" ? "default" : "ghost"}
              size="sm"
              className={activeTab === "vehicle-weight" 
                ? "bg-amber-500 hover:bg-amber-600 text-slate-900" 
                : "text-slate-300 hover:bg-slate-700"}
              data-testid="tab-vehicle-weight"
            >
              <Scale className="w-4 h-4 mr-1" />
              Vehicle Wt
            </Button>
            <Button
              onClick={() => setActiveTab("fy-summary")}
              variant={activeTab === "fy-summary" ? "default" : "ghost"}
              size="sm"
              className={activeTab === "fy-summary" 
                ? "bg-amber-500 hover:bg-amber-600 text-slate-900" 
                : "text-slate-300 hover:bg-slate-700"}
              data-testid="tab-fy-summary"
            >
              <TrendingUp className="w-4 h-4 mr-1" />
              FY Summary
            </Button>
            {user.role === 'admin' && (
              <Button
                onClick={() => setActiveTab("settings")}
                variant={activeTab === "settings" ? "default" : "ghost"}
                size="sm"
                className={activeTab === "settings" 
                  ? "bg-purple-500 hover:bg-purple-600 text-white" 
                  : "text-slate-300 hover:bg-slate-700"}
                data-testid="tab-settings"
              >
                <Key className="w-4 h-4 mr-1" />
                Settings
              </Button>
            )}
          </div>

          {/* Action Buttons - Only on Entries tab */}
          {activeTab === "entries" && (
          <div className="flex gap-2 flex-wrap mt-3">
            <Button
              onClick={() => { fetchEntries(); fetchTotals(); }}
              variant="outline"
              size="sm"
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
              data-testid="refresh-btn"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
            <Button
              onClick={() => setShowFilters(!showFilters)}
              variant="outline"
              size="sm"
              className={`border-slate-600 text-slate-300 hover:bg-slate-700 ${hasActiveFilters ? 'bg-amber-900/30 border-amber-600' : ''}`}
              data-testid="filter-btn"
            >
              <Filter className="w-4 h-4 mr-1" />
              Filter
              {hasActiveFilters && <span className="ml-1 bg-amber-500 text-xs px-1 rounded">ON</span>}
            </Button>
            <Button
              onClick={handleExportExcel}
              variant="outline"
              size="sm"
              className="border-green-600 text-green-400 hover:bg-green-900/30"
              data-testid="export-excel-btn"
            >
              <FileSpreadsheet className="w-4 h-4 mr-1" />
              Excel
            </Button>
            <Button
              onClick={handleExportPDF}
              variant="outline"
              size="sm"
              className="border-red-600 text-red-400 hover:bg-red-900/30"
              data-testid="export-pdf-btn"
            >
              <FileText className="w-4 h-4 mr-1" />
              PDF
            </Button>
            {wa && <Button onClick={handleEntriesWhatsApp} variant="outline" size="sm"
              className="border-green-600 text-green-400 hover:bg-green-900/30" data-testid="entries-whatsapp-btn">
              <Send className="w-4 h-4 mr-1" /> WhatsApp
            </Button>}
            {wa && <Button onClick={handleEntriesGroupSend} variant="outline" size="sm"
              className="border-teal-600 text-teal-400 hover:bg-teal-900/30" data-testid="entries-group-btn">
              <Users className="w-4 h-4 mr-1" /> Group
            </Button>}
            {tg && <Button onClick={handleEntriesTelegram} disabled={entriesTgSending} variant="outline" size="sm"
              className="border-blue-600 text-blue-400 hover:bg-blue-900/30" data-testid="entries-telegram-btn">
              <Send className={`w-4 h-4 mr-1 ${entriesTgSending ? 'animate-pulse' : ''}`} /> Telegram
            </Button>}
            {user.role === 'admin' && (
              <ExcelImport filters={filters} user={user} onImportDone={fetchEntries} />
            )}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  onClick={openNewEntryDialog}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold"
                  data-testid="add-entry-btn"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Nayi Entry
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700 text-white">
                <DialogHeader>
                  <DialogTitle className="text-amber-400 text-xl">
                    {editingId ? "Entry Edit Karein" : "Nayi Entry"}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* FY Year & Season */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <Label className="text-slate-300">FY Year</Label>
                      <Select
                        value={formData.kms_year}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, kms_year: value }))}
                      >
                        <SelectTrigger className="bg-slate-700 border-slate-600 text-white" data-testid="select-kms-year">
                          <SelectValue placeholder="Select Year" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-700 border-slate-600">
                          {FY_YEARS.map(year => (
                            <SelectItem key={year} value={year} className="text-white hover:bg-slate-600">
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-slate-300">Season</Label>
                      <Select
                        value={formData.season}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, season: value }))}
                      >
                        <SelectTrigger className="bg-slate-700 border-slate-600 text-white" data-testid="select-season">
                          <SelectValue placeholder="Select Season" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-700 border-slate-600">
                          {SEASONS.map(season => (
                            <SelectItem key={season} value={season} className="text-white hover:bg-slate-600">
                              {season}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-slate-300">Date</Label>
                      <Input
                        type="date"
                        name="date"
                        value={formData.date}
                        onChange={handleInputChange}
                        className="bg-slate-700 border-slate-600 text-white"
                        data-testid="input-date"
                      />
                    </div>
                    <AutoSuggest
                      value={formData.truck_no}
                      onChange={(e) => setFormData(prev => ({ ...prev, truck_no: e.target.value }))}
                      suggestions={truckSuggestions}
                      placeholder="OD00XX0000"
                      onSelect={(val) => setFormData(prev => ({ ...prev, truck_no: val }))}
                      label="Truck No."
                      testId="input-truck-no"
                    />
                    {leasedTruckNos.has((formData.truck_no || '').toUpperCase()) && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-violet-400 bg-violet-500/10 border border-violet-500/30 rounded px-2 py-1" data-testid="leased-truck-indicator">
                        <span className="font-medium">Leased Truck</span> - Yeh truck lease par hai
                      </div>
                    )}
                  </div>

                  {/* RST No. & TP No. */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-300">RST No.</Label>
                      <Input
                        value={formData.rst_no}
                        onChange={(e) => setFormData(prev => ({ ...prev, rst_no: e.target.value }))}
                        placeholder="RST Number"
                        className="bg-slate-700 border-slate-600 text-white"
                        data-testid="input-rst-no"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">TP No.</Label>
                      <Input
                        value={formData.tp_no}
                        onChange={(e) => setFormData(prev => ({ ...prev, tp_no: e.target.value }))}
                        placeholder="TP Number"
                        className="bg-slate-700 border-slate-600 text-white"
                        data-testid="input-tp-no"
                      />
                    </div>
                  </div>

                  {/* Agent & Mandi */}
                  <div className="grid grid-cols-2 gap-4">
                    <AutoSuggest
                      value={formData.agent_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, agent_name: e.target.value }))}
                      suggestions={agentSuggestions}
                      placeholder="Agent name"
                      onSelect={handleAgentSelect}
                      label="Agent Name"
                      testId="input-agent-name"
                    />
                    <AutoSuggest
                      value={formData.mandi_name}
                      onChange={(e) => {
                        const val = e.target.value;
                        const target = findMandiCutting(val);
                        if (target) {
                          setFormData(prev => ({ ...prev, mandi_name: val, cutting_percent: String(target.cutting_percent) }));
                        } else {
                          setFormData(prev => ({ ...prev, mandi_name: val }));
                        }
                      }}
                      suggestions={mandiSuggestions}
                      placeholder="Mandi name"
                      onSelect={(val) => {
                        const target = findMandiCutting(val);
                        if (target) {
                          setFormData(prev => ({ ...prev, mandi_name: target.mandi_name, cutting_percent: String(target.cutting_percent) }));
                          toast.success(`Cutting ${target.cutting_percent}% set from ${target.mandi_name}`);
                        } else {
                          setFormData(prev => ({ ...prev, mandi_name: val }));
                        }
                      }}
                      onBlur={() => {
                        const target = findMandiCutting(formData.mandi_name);
                        if (target) {
                          setFormData(prev => ({ ...prev, mandi_name: target.mandi_name, cutting_percent: String(target.cutting_percent) }));
                        }
                      }}
                      label="Mandi Name"
                      testId="input-mandi-name"
                    />
                  </div>

                  {/* Weight Inputs */}
                  <Card className="bg-slate-700/50 border-slate-600">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-amber-400 text-lg flex items-center gap-2">
                        <Calculator className="w-5 h-5" />
                        Weight & Auto Calculations (KG mein entry, QNTL mein display)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <Label className="text-slate-300">KG *</Label>
                        <Input
                          type="number"
                          name="kg"
                          value={formData.kg}
                          onChange={handleInputChange}
                          placeholder="Enter KG"
                          className="bg-slate-600 border-slate-500 text-white text-lg font-semibold"
                          data-testid="input-kg"
                        />
                      </div>
                      <div>
                        <Label className="text-green-400 font-semibold">QNTL (Auto)</Label>
                        <Input
                          value={calculatedFields.qntl}
                          readOnly
                          className="bg-green-900/30 border-green-700 text-green-400 text-lg font-bold"
                          data-testid="calculated-qntl"
                        />
                        <span className="text-xs text-slate-400">KG ÷ 100</span>
                      </div>
                      <div>
                        <Label className="text-slate-300">BAG</Label>
                        <Input
                          type="number"
                          name="bag"
                          value={formData.bag}
                          onChange={handleInputChange}
                          className="bg-slate-600 border-slate-500 text-white"
                          data-testid="input-bag"
                        />
                      </div>
                      <div>
                        <Label className="text-cyan-400">G.Deposite (Gunny Bag)</Label>
                        <Input
                          type="number"
                          name="g_deposite"
                          value={formData.g_deposite}
                          onChange={handleInputChange}
                          placeholder="Gunny bags deposited"
                          className="bg-cyan-900/30 border-cyan-700 text-cyan-400"
                          data-testid="input-g-deposite"
                        />
                        <span className="text-xs text-slate-400">Fill → 0.5kg | Empty → 1kg</span>
                      </div>
                      <div>
                        <Label className="text-orange-400">GBW Cut (Auto)</Label>
                        <Input
                          type="number"
                          name="gbw_cut"
                          value={formData.gbw_cut}
                          onChange={handleInputChange}
                          className="bg-orange-900/30 border-orange-700 text-orange-400 font-bold"
                          data-testid="input-gbw-cut"
                          readOnly
                        />
                        <span className="text-xs text-slate-400">G.Dep: 0.5kg | Empty: 1kg/bag</span>
                      </div>
                      <div>
                        <Label className="text-pink-400">P.Pkt (Plastic Bags)</Label>
                        <Input
                          type="number"
                          name="plastic_bag"
                          value={formData.plastic_bag}
                          onChange={handleInputChange}
                          placeholder="Bags count"
                          className="bg-pink-900/30 border-pink-700 text-pink-400"
                          data-testid="input-plastic-bag"
                        />
                      </div>
                      <div>
                        <Label className="text-pink-400 font-semibold">P.Pkt Cut (Auto)</Label>
                        <Input
                          value={calculatedFields.p_pkt_cut}
                          readOnly
                          className="bg-pink-900/30 border-pink-700 text-pink-400 font-bold"
                          data-testid="calculated-p-pkt-cut"
                        />
                        <span className="text-xs text-slate-400">0.50 kg × Bags</span>
                      </div>
                      <div>
                        <Label className="text-blue-400 font-semibold">Mill W. QNTL (Auto)</Label>
                        <Input
                          value={calculatedFields.mill_w}
                          readOnly
                          className="bg-blue-900/30 border-blue-700 text-blue-400 text-lg font-bold"
                          data-testid="calculated-mill-w"
                        />
                      </div>
                      <div>
                        <Label className="text-purple-400">Cutting %</Label>
                        <Input
                          type="number"
                          name="cutting_percent"
                          value={formData.cutting_percent}
                          onChange={handleInputChange}
                          placeholder="5, 5.26..."
                          step="0.01"
                          className="bg-purple-900/30 border-purple-700 text-purple-400"
                          data-testid="input-cutting-percent"
                        />
                      </div>
                      <div>
                        <Label className="text-purple-400 font-semibold">Cutting QNTL (Auto)</Label>
                        <Input
                          value={`${calculatedFields.cutting_qntl} QNTL`}
                          readOnly
                          className="bg-purple-900/30 border-purple-700 text-purple-400 font-bold"
                          data-testid="calculated-cutting"
                        />
                        <span className="text-xs text-slate-400">Mill W × {formData.cutting_percent || 0}%</span>
                      </div>
                      <div>
                        <Label className="text-yellow-400">Moisture %</Label>
                        <Input
                          type="number"
                          name="moisture"
                          value={formData.moisture}
                          onChange={handleInputChange}
                          placeholder="17, 18..."
                          step="0.1"
                          className="bg-yellow-900/30 border-yellow-700 text-yellow-400"
                          data-testid="input-moisture"
                        />
                        <span className="text-xs text-slate-400">17% tak no cut</span>
                      </div>
                      <div>
                        <Label className="text-yellow-400 font-semibold">Moisture Cut QNTL (Auto)</Label>
                        <Input
                          value={`${calculatedFields.moisture_cut_qntl} QNTL (${calculatedFields.moisture_cut_percent}%)`}
                          readOnly
                          className="bg-yellow-900/30 border-yellow-700 text-yellow-400 font-bold"
                          data-testid="calculated-moisture-cut"
                        />
                        <span className="text-xs text-slate-400">{formData.moisture > 17 ? `Mill W × ${calculatedFields.moisture_cut_percent}%` : 'No cut'}</span>
                      </div>
                      <div>
                        <Label className="text-slate-300">Disc/Dust/Poll (kg)</Label>
                        <Input
                          type="number"
                          name="disc_dust_poll"
                          value={formData.disc_dust_poll}
                          onChange={handleInputChange}
                          className="bg-slate-600 border-slate-500 text-white"
                          data-testid="input-disc-dust-poll"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-amber-400 font-semibold">Final W. QNTL (Auto)</Label>
                        <Input
                          value={calculatedFields.final_w}
                          readOnly
                          className="bg-amber-900/30 border-amber-700 text-amber-400 text-xl font-bold"
                          data-testid="calculated-final-w"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Other Fields */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <Label className="text-slate-300">G.Issued</Label>
                      <Input
                        type="number"
                        name="g_issued"
                        value={formData.g_issued}
                        onChange={handleInputChange}
                        className="bg-slate-700 border-slate-600 text-white"
                        data-testid="input-g-issued"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">Cash Paid</Label>
                      <Input
                        type="number"
                        name="cash_paid"
                        value={formData.cash_paid}
                        onChange={handleInputChange}
                        className="bg-slate-700 border-slate-600 text-white"
                        data-testid="input-cash-paid"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">Diesel Paid</Label>
                      <Input
                        type="number"
                        name="diesel_paid"
                        value={formData.diesel_paid}
                        onChange={handleInputChange}
                        className="bg-slate-700 border-slate-600 text-white"
                        data-testid="input-diesel-paid"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">Remark</Label>
                      <Input
                        name="remark"
                        value={formData.remark}
                        onChange={handleInputChange}
                        className="bg-slate-700 border-slate-600 text-white"
                        data-testid="input-remark"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 justify-end pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                      className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      data-testid="cancel-btn"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit"
                      className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold"
                      data-testid="submit-btn"
                    >
                      {editingId ? "Update Karein" : "Save Karein"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          )}

          {/* Filter Panel */}
          {activeTab === "entries" && showFilters && (
            <div className="mt-4 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <Filter className="w-4 h-4" /> Filters
                </h3>
                {hasActiveFilters && (
                  <Button
                    onClick={clearFilters}
                    size="sm"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300"
                    data-testid="clear-filters-btn"
                  >
                    <X className="w-4 h-4 mr-1" /> Clear All
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <div>
                  <Label className="text-slate-300 text-sm">FY Year</Label>
                  <Select
                    value={filters.kms_year || "all"}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, kms_year: value === "all" ? "" : value }))}
                  >
                    <SelectTrigger className="bg-slate-600 border-slate-500 text-white" data-testid="filter-kms-year">
                      <SelectValue placeholder="All Years" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      <SelectItem value="all" className="text-white hover:bg-slate-600">All Years</SelectItem>
                      {FY_YEARS.map(year => (
                        <SelectItem key={year} value={year} className="text-white hover:bg-slate-600">{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-300 text-sm">Season</Label>
                  <Select
                    value={filters.season || "all"}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, season: value === "all" ? "" : value }))}
                  >
                    <SelectTrigger className="bg-slate-600 border-slate-500 text-white" data-testid="filter-season">
                      <SelectValue placeholder="All Seasons" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      <SelectItem value="all" className="text-white hover:bg-slate-600">All Seasons</SelectItem>
                      {SEASONS.map(s => (
                        <SelectItem key={s} value={s} className="text-white hover:bg-slate-600">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-300 text-sm">Date From</Label>
                  <Input
                    type="date"
                    value={filters.date_from}
                    onChange={(e) => setFilters(prev => ({ ...prev, date_from: e.target.value }))}
                    className="bg-slate-600 border-slate-500 text-white"
                    data-testid="filter-date-from"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-sm">Date To</Label>
                  <Input
                    type="date"
                    value={filters.date_to}
                    onChange={(e) => setFilters(prev => ({ ...prev, date_to: e.target.value }))}
                    className="bg-slate-600 border-slate-500 text-white"
                    data-testid="filter-date-to"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-sm">Truck No.</Label>
                  <Input
                    value={filters.truck_no}
                    onChange={(e) => setFilters(prev => ({ ...prev, truck_no: e.target.value }))}
                    placeholder="Filter by truck..."
                    className="bg-slate-600 border-slate-500 text-white"
                    data-testid="filter-truck-no"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-sm">RST No.</Label>
                  <Input
                    value={filters.rst_no}
                    onChange={(e) => setFilters(prev => ({ ...prev, rst_no: e.target.value }))}
                    placeholder="Filter by RST..."
                    className="bg-slate-600 border-slate-500 text-white"
                    data-testid="filter-rst-no"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-sm">TP No.</Label>
                  <Input
                    value={filters.tp_no}
                    onChange={(e) => setFilters(prev => ({ ...prev, tp_no: e.target.value }))}
                    placeholder="Filter by TP..."
                    className="bg-slate-600 border-slate-500 text-white"
                    data-testid="filter-tp-no"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-sm">Agent Name</Label>
                  <Input
                    value={filters.agent_name}
                    onChange={(e) => setFilters(prev => ({ ...prev, agent_name: e.target.value }))}
                    placeholder="Filter by agent..."
                    className="bg-slate-600 border-slate-500 text-white"
                    data-testid="filter-agent-name"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-sm">Mandi Name</Label>
                  <Input
                    value={filters.mandi_name}
                    onChange={(e) => setFilters(prev => ({ ...prev, mandi_name: e.target.value }))}
                    placeholder="Filter by mandi..."
                    className="bg-slate-600 border-slate-500 text-white"
                    data-testid="filter-mandi-name"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-4 py-6 print-content">
        {/* Print Header - Only visible when printing */}
        <div className="print-header">
          {branding.company_name || 'Mill Entry System'} — {branding.tagline || ''}
          <div style={{fontSize: '12px', fontWeight: 'normal', marginTop: '2px'}}>
            {activeTab.charAt(0).toUpperCase() + activeTab.slice(1).replace('-', ' ')} | {filters.kms_year} {filters.season || ''}
          </div>
        </div>
        <ErrorBoundary key={activeTab}>
        {activeTab === "dashboard" ? (
          <Dashboard filters={filters} user={user} />
        ) : activeTab === "payments" ? (
          <Payments filters={filters} user={user} branding={branding} />
        ) : activeTab === "milling" ? (
          <MillingTracker filters={filters} user={user} />
        ) : activeTab === "cashbook" ? (
          <CashBook filters={filters} user={user} />
        ) : activeTab === "dctracker" ? (
          <DCTracker filters={filters} user={user} />
        ) : activeTab === "reports" ? (
          <Reports filters={filters} user={user} />
        ) : activeTab === "vouchers" ? (
          <Vouchers filters={filters} user={user} onNavigate={(tab) => setActiveTab(tab)} />
        ) : activeTab === "mill-parts" ? (
          <MillPartsStock filters={filters} user={user} />
        ) : activeTab === "staff" ? (
          <StaffManagement filters={filters} user={user} />
        ) : activeTab === "hemali" ? (
          <HemaliPayment filters={filters} user={user} />
        ) : activeTab === "vehicle-weight" ? (
          <VehicleWeight filters={filters} />
        ) : activeTab === "fy-summary" ? (
          <FYSummaryWithTabs filters={filters} user={user} />
        ) : activeTab === "settings" ? (
          <Settings user={user} kmsYear={filters.kms_year} onBrandingUpdate={(updated) => setBranding(updated)} />
        ) : (
          <>
            {/* Totals Summary */}
            <Card className="bg-slate-800/50 border-slate-700 mb-6">
          <CardHeader>
            <CardTitle className="text-amber-400 flex items-center justify-between">
              <span>Total Summary</span>
              {hasActiveFilters && <span className="text-sm text-slate-400">(Filtered)</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="bg-green-900/30 p-3 rounded-lg border border-green-700">
                <p className="text-green-400 text-xs">Total QNTL</p>
                <p className="text-green-400 text-lg font-bold" data-testid="total-qntl">
                  {totals.total_qntl?.toFixed(2) || 0}
                </p>
              </div>
              <div className="bg-slate-700/50 p-3 rounded-lg">
                <p className="text-slate-400 text-xs">Total BAG</p>
                <p className="text-white text-lg font-bold" data-testid="total-bag">
                  {totals.total_bag?.toLocaleString() || 0}
                </p>
              </div>
              <div className="bg-blue-900/30 p-3 rounded-lg border border-blue-700">
                <p className="text-blue-400 text-xs">Total Mill W (QNTL)</p>
                <p className="text-blue-400 text-lg font-bold" data-testid="total-mill-w">
                  {(totals.total_mill_w / 100)?.toFixed(2) || 0}
                </p>
              </div>
              <div className="bg-amber-900/30 p-3 rounded-lg border border-amber-700">
                <p className="text-amber-400 text-xs">Total Final W (QNTL)</p>
                <p className="text-amber-400 text-lg font-bold" data-testid="total-final-w">
                  {(totals.total_final_w / 100)?.toFixed(2) || 0}
                </p>
              </div>
              <div className="bg-cyan-900/30 p-3 rounded-lg border border-cyan-700">
                <p className="text-cyan-400 text-xs">Total G.Issued</p>
                <p className="text-cyan-400 text-lg font-bold" data-testid="total-g-issued">
                  {totals.total_g_issued?.toLocaleString() || 0}
                </p>
              </div>
              <div className="bg-slate-700/50 p-3 rounded-lg">
                <p className="text-slate-400 text-xs">Total Cash Paid</p>
                <p className="text-white text-lg font-bold" data-testid="total-cash">
                  {totals.total_cash_paid?.toLocaleString() || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Entries Table */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-amber-400 flex items-center justify-between">
              <span>Mill Entries ({entries.length}) - FY: {filters.kms_year || "All"}</span>
              <div className="flex items-center gap-3">
                {selectedEntries.length > 0 && (
                  <Button
                    onClick={handleBulkDelete}
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white"
                    data-testid="bulk-delete-btn"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete ({selectedEntries.length})
                  </Button>
                )}
                {loading && <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto" id="entries-table">
              <Table className="text-[11px]">
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-slate-700/50">
                    <TableHead className="text-slate-300 w-8 px-0.5">
                      <input
                        type="checkbox"
                        checked={selectAll}
                        onChange={handleSelectAll}
                        className="w-4 h-4 rounded border-slate-500 bg-slate-700 text-amber-500 focus:ring-amber-500"
                        data-testid="select-all-checkbox"
                      />
                    </TableHead>
                    <TableHead className="text-slate-300 whitespace-nowrap px-1">Date</TableHead>
                    <TableHead className="text-slate-300 whitespace-nowrap px-1">Season</TableHead>
                    <TableHead className="text-slate-300 whitespace-nowrap px-1">Truck</TableHead>
                    <TableHead className="text-slate-300 whitespace-nowrap px-1">RST</TableHead>
                    <TableHead className="text-slate-300 whitespace-nowrap px-1">TP</TableHead>
                    <TableHead className="text-slate-300 whitespace-nowrap px-1">Agent</TableHead>
                    <TableHead className="text-slate-300 whitespace-nowrap px-1">Mandi</TableHead>
                    <TableHead className="text-green-400 text-right whitespace-nowrap px-1">QNTL</TableHead>
                    <TableHead className="text-slate-300 text-right whitespace-nowrap px-1">BAG</TableHead>
                    <TableHead className="text-cyan-400 text-right whitespace-nowrap px-1">G.Dep</TableHead>
                    <TableHead className="text-slate-300 text-right whitespace-nowrap px-1">GBW</TableHead>
                    <TableHead className="text-pink-400 text-right whitespace-nowrap px-1">P.Pkt</TableHead>
                    <TableHead className="text-pink-300 text-right whitespace-nowrap px-1">P.Cut</TableHead>
                    <TableHead className="text-blue-400 text-right whitespace-nowrap px-1">Mill W</TableHead>
                    <TableHead className="text-orange-400 text-right whitespace-nowrap px-1">M%</TableHead>
                    <TableHead className="text-orange-300 text-right whitespace-nowrap px-1">M.Cut</TableHead>
                    <TableHead className="text-purple-400 text-right whitespace-nowrap px-1">C%</TableHead>
                    <TableHead className="text-slate-400 text-right whitespace-nowrap px-1">D/D/P</TableHead>
                    <TableHead className="text-amber-400 text-right whitespace-nowrap px-1">Final W</TableHead>
                    <TableHead className="text-cyan-400 text-right whitespace-nowrap px-1">G.Iss</TableHead>
                    <TableHead className="text-slate-300 text-right whitespace-nowrap px-1">Cash</TableHead>
                    <TableHead className="text-slate-300 text-right whitespace-nowrap px-1">Diesel</TableHead>
                    <TableHead className="text-slate-300 text-center whitespace-nowrap px-0.5">Act</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={24} className="text-center text-slate-400 py-8">
                        Koi entry nahi hai. "Nayi Entry" button click karein.
                      </TableCell>
                    </TableRow>
                  ) : (
                    entries.map((entry) => (
                      <TableRow 
                        key={entry.id} 
                        className={`border-slate-700 hover:bg-slate-700/30 ${selectedEntries.includes(entry.id) ? 'bg-amber-900/20' : ''}`}
                        data-testid={`entry-row-${entry.id}`}
                      >
                        <TableCell className="px-0.5">
                          <input
                            type="checkbox"
                            checked={selectedEntries.includes(entry.id)}
                            onChange={() => handleSelectEntry(entry.id)}
                            disabled={!canEditEntry(entry)}
                            className="w-4 h-4 rounded border-slate-500 bg-slate-700 text-amber-500 focus:ring-amber-500 disabled:opacity-50"
                            data-testid={`select-${entry.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-white whitespace-nowrap px-1">{fmtDate(entry.date)}</TableCell>
                        <TableCell className="text-white whitespace-nowrap px-1">{entry.season}</TableCell>
                        <TableCell className="text-white font-mono whitespace-nowrap px-1">
                          {entry.truck_no}
                          {leasedTruckNos.has((entry.truck_no || '').toUpperCase()) && (
                            <span className="ml-1 inline-block text-[10px] px-1 py-0.5 rounded bg-violet-500/20 text-violet-400 border border-violet-500/30 font-sans" data-testid={`leased-badge-${entry.id}`}>Leased</span>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-300 whitespace-nowrap px-1">{entry.rst_no || '-'}</TableCell>
                        <TableCell className="text-slate-300 whitespace-nowrap px-1">{entry.tp_no || '-'}</TableCell>
                        <TableCell className="text-white whitespace-nowrap px-1">{entry.agent_name}</TableCell>
                        <TableCell className="text-white whitespace-nowrap px-1">{entry.mandi_name}</TableCell>
                        <TableCell className="text-green-400 text-right font-mono font-bold whitespace-nowrap px-1">
                          {entry.qntl?.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-white text-right font-mono whitespace-nowrap px-1">
                          {entry.bag}
                        </TableCell>
                        <TableCell className="text-cyan-400 text-right font-mono whitespace-nowrap px-1">
                          {entry.g_deposite || 0}
                        </TableCell>
                        <TableCell className="text-slate-300 text-right font-mono whitespace-nowrap px-1">
                          {(entry.gbw_cut / 100)?.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-pink-400 text-right font-mono whitespace-nowrap px-1">
                          {entry.plastic_bag || 0}
                        </TableCell>
                        <TableCell className="text-pink-300 text-right font-mono whitespace-nowrap px-1">
                          {(entry.p_pkt_cut / 100)?.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-blue-400 text-right font-mono font-bold whitespace-nowrap px-1">
                          {(entry.mill_w / 100)?.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-orange-400 text-right font-mono whitespace-nowrap px-1">
                          {entry.moisture || 0}
                        </TableCell>
                        <TableCell className="text-orange-300 text-right font-mono whitespace-nowrap px-1">
                          {((entry.moisture_cut || 0) / 100)?.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-purple-400 text-right font-mono whitespace-nowrap px-1">
                          {entry.cutting_percent}%
                        </TableCell>
                        <TableCell className="text-slate-400 text-right font-mono whitespace-nowrap px-1">
                          {entry.disc_dust_poll || 0}
                        </TableCell>
                        <TableCell className="text-amber-400 text-right font-mono font-bold whitespace-nowrap px-1">
                          {(entry.final_w / 100)?.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-cyan-400 text-right font-mono whitespace-nowrap px-1">
                          {entry.g_issued?.toLocaleString() || 0}
                        </TableCell>
                        <TableCell className="text-white text-right font-mono whitespace-nowrap px-1">
                          {entry.cash_paid?.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-white text-right font-mono whitespace-nowrap px-1">
                          {entry.diesel_paid?.toLocaleString() || 0}
                        </TableCell>
                        <TableCell className="text-center px-0.5">
                          <div className="flex gap-0.5 justify-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEdit(entry)}
                              className={`h-6 w-6 p-0 ${canEditEntry(entry) ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-900/30' : 'text-slate-600 cursor-not-allowed'}`}
                              data-testid={`edit-btn-${entry.id}`}
                              disabled={!canEditEntry(entry)}
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(entry)}
                              className={`h-6 w-6 p-0 ${canEditEntry(entry) ? 'text-red-400 hover:text-red-300 hover:bg-red-900/30' : 'text-slate-600 cursor-not-allowed'}`}
                              data-testid={`delete-btn-${entry.id}`}
                              disabled={!canEditEntry(entry)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
          </>
        )}
        </ErrorBoundary>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-600/60 mt-10 no-print">
        <div className="max-w-[1600px] mx-auto px-4 py-6 text-center space-y-2">
          <p className="text-slate-300 text-sm font-semibold tracking-wide">
            Mill Entry System <span className="text-slate-500 font-normal">- Data Management Software</span>
          </p>
          <div className="flex items-center justify-center gap-3 text-xs text-slate-500 pt-1">
            <span className="text-amber-400/70 font-mono" data-testid="footer-version">v{APP_VERSION}</span>
            <span className="text-slate-700">|</span>
            <span>Designed By: <a href="https://www.9x.design" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 transition-colors" data-testid="footer-designer">9x.design</a></span>
            <span className="text-slate-700">|</span>
            <span>Contact: <a href="tel:+917205930002" className="text-cyan-400 hover:text-cyan-300 transition-colors" data-testid="footer-contact">+91 72059 30002</a></span>
          </div>
        </div>
      </footer>

      {/* What's New Dialog - auto shows on version update */}
      <WhatsNew />
      {showWhatsNew && <WhatsNew forceOpen onClose={() => setShowWhatsNew(false)} />}

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

// Main App with Auth
function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('mill_user');
    return saved ? JSON.parse(saved) : null;
  });

  const handleLogin = (username, role) => {
    const userData = { username, role };
    setUser(userData);
    localStorage.setItem('mill_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('mill_user');
    toast.success("Logged out successfully");
  };

  if (!user) {
    return (
      <>
        <Toaster position="top-right" richColors />
        <LoginPage onLogin={handleLogin} />
      </>
    );
  }

  return (
    <ConfirmProvider>
      <MainApp user={user} onLogout={handleLogout} />
    </ConfirmProvider>
  );
}

export default App;
