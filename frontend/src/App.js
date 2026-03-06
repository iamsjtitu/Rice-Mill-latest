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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Trash2, Edit, Plus, Calculator, RefreshCw, Filter, X, FileSpreadsheet, FileText, LogOut, User, Lock, Key } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Generate KMS years
const generateKMSYears = () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = currentYear - 3; i <= currentYear; i++) {
    years.push(`${i}-${i + 1}`);
  }
  return years;
};

const KMS_YEARS = generateKMSYears();
const CURRENT_KMS_YEAR = `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`; // 2025-2026
const SEASONS = ["Kharif", "Rabi"];

const initialFormState = {
  date: new Date().toISOString().split("T")[0],
  kms_year: CURRENT_KMS_YEAR,
  season: "Kharif",
  truck_no: "",
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

// Auto-suggest Dropdown Component
const AutoSuggest = ({ value, onChange, suggestions, placeholder, onSelect, label, testId }) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (value && suggestions.length > 0) {
      const filtered = suggestions.filter(s => 
        s.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSuggestions(filtered);
    } else {
      setFilteredSuggestions(suggestions);
    }
  }, [value, suggestions]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <Label className="text-slate-300">{label}</Label>
      <Input
        value={value}
        onChange={(e) => {
          onChange(e);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        placeholder={placeholder}
        className="bg-slate-700 border-slate-600 text-white"
        data-testid={testId}
      />
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-slate-700 border border-slate-600 rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filteredSuggestions.map((suggestion, index) => (
            <div
              key={index}
              className="px-3 py-2 cursor-pointer hover:bg-slate-600 text-white text-sm"
              onClick={() => {
                onSelect(suggestion);
                setShowSuggestions(false);
              }}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Login Component
const LoginPage = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/login`, { username, password });
      if (response.data.success) {
        onLogin(response.data.username, response.data.role);
        toast.success(`Welcome ${response.data.role === 'admin' ? 'Admin' : 'Staff'}!`);
      }
    } catch (error) {
      toast.error("Invalid username or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-800 border-slate-700">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-amber-400">NAVKAR AGRO</CardTitle>
          <p className="text-slate-400">JOLKO, KESINGA - Mill Entry System</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label className="text-slate-300">Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="pl-10 bg-slate-700 border-slate-600 text-white"
                  data-testid="login-username"
                />
              </div>
            </div>
            <div>
              <Label className="text-slate-300">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="pl-10 bg-slate-700 border-slate-600 text-white"
                  data-testid="login-password"
                />
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold"
              disabled={loading}
              data-testid="login-btn"
            >
              {loading ? "Logging in..." : "Login"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

// Main App Component
function MainApp({ user, onLogout }) {
  const [entries, setEntries] = useState([]);
  const [totals, setTotals] = useState({});
  const [formData, setFormData] = useState(initialFormState);
  const [editingId, setEditingId] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordData, setPasswordData] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);

  // Suggestions state
  const [truckSuggestions, setTruckSuggestions] = useState([]);
  const [agentSuggestions, setAgentSuggestions] = useState([]);
  const [mandiSuggestions, setMandiSuggestions] = useState([]);

  // Filter state - default to current KMS year
  const [filters, setFilters] = useState({
    truck_no: "",
    agent_name: "",
    mandi_name: "",
    kms_year: CURRENT_KMS_YEAR,
    season: ""
  });
  const [showFilters, setShowFilters] = useState(false);
  
  // Selection state for bulk delete
  const [selectedEntries, setSelectedEntries] = useState([]);
  const [selectAll, setSelectAll] = useState(false);

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
      if (filters.agent_name) params.append('agent_name', filters.agent_name);
      if (filters.mandi_name) params.append('mandi_name', filters.mandi_name);
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      
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
  }, [fetchEntries, fetchTotals, fetchSuggestions]);

  // Reset selection when entries change
  useEffect(() => {
    setSelectedEntries([]);
    setSelectAll(false);
  }, [entries]);

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
    
    if (window.confirm(`Kya aap ${selectedEntries.length} entries delete karna chahte hain?`)) {
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
      kms_year: entry.kms_year || KMS_YEARS[KMS_YEARS.length - 2],
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

    if (window.confirm("Kya aap sure hain is entry ko delete karna chahte hain?")) {
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

  const handleExportExcel = () => {
    const params = new URLSearchParams();
    if (filters.truck_no) params.append('truck_no', filters.truck_no);
    if (filters.agent_name) params.append('agent_name', filters.agent_name);
    if (filters.mandi_name) params.append('mandi_name', filters.mandi_name);
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    
    window.open(`${API}/export/excel?${params.toString()}`, '_blank');
    toast.success("Excel download ho raha hai!");
  };

  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Navkar Agro - Mill Entries</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #d97706; text-align: center; }
            .info { text-align: center; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ccc; padding: 4px; text-align: left; font-size: 9px; }
            th { background-color: #1e293b; color: white; }
            .totals { background-color: #fef3c7; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>NAVKAR AGRO - Mill Entries</h1>
          <div class="info">
            <p>Date: ${new Date().toLocaleDateString()} | KMS Year: ${filters.kms_year || "All"} ${filters.season ? `| Season: ${filters.season}` : ''}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Truck</th>
                <th>Agent</th>
                <th>Mandi</th>
                <th>QNTL</th>
                <th>BAG</th>
                <th>GBW Cut</th>
                <th>Mill W</th>
                <th>Moist %</th>
                <th>Moist Cut</th>
                <th>Cut %</th>
                <th>Disc/Dust</th>
                <th>Final W</th>
                <th>G.Issued</th>
                <th>Cash</th>
                <th>Diesel</th>
              </tr>
            </thead>
            <tbody>
              ${entries.map(entry => `
                <tr>
                  <td>${entry.date}</td>
                  <td>${entry.truck_no}</td>
                  <td>${entry.agent_name}</td>
                  <td>${entry.mandi_name}</td>
                  <td>${entry.qntl?.toFixed(2)}</td>
                  <td>${entry.bag}</td>
                  <td>${entry.gbw_cut?.toFixed(2)}</td>
                  <td>${(entry.mill_w / 100)?.toFixed(2)}</td>
                  <td>${entry.moisture || 0}%</td>
                  <td>${entry.moisture_cut?.toFixed(2) || 0}</td>
                  <td>${entry.cutting_percent}%</td>
                  <td>${entry.disc_dust_poll || 0}</td>
                  <td>${(entry.final_w / 100)?.toFixed(2)}</td>
                  <td>${entry.g_issued || 0}</td>
                  <td>${entry.cash_paid || 0}</td>
                  <td>${entry.diesel_paid || 0}</td>
                </tr>
              `).join('')}
              <tr class="totals">
                <td colspan="4">TOTAL</td>
                <td>${totals.total_qntl?.toFixed(2)}</td>
                <td>${totals.total_bag}</td>
                <td>${totals.total_gbw_cut?.toFixed(2)}</td>
                <td>${(totals.total_mill_w / 100)?.toFixed(2)}</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>${totals.total_disc_dust_poll || 0}</td>
                <td>${(totals.total_final_w / 100)?.toFixed(2)}</td>
                <td>${totals.total_g_issued || 0}</td>
                <td>${totals.total_cash_paid || 0}</td>
                <td>${totals.total_diesel_paid || 0}</td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
    toast.success("PDF generate ho raha hai!");
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
      agent_name: "", 
      mandi_name: "", 
      kms_year: CURRENT_KMS_YEAR,
      season: "" 
    });
  };

  const hasActiveFilters = filters.truck_no || filters.agent_name || filters.mandi_name || filters.season;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <Toaster position="top-right" richColors />
      
      {/* Header */}
      <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-amber-400" data-testid="app-title">
                NAVKAR AGRO
              </h1>
              <p className="text-slate-400 text-sm">JOLKO, KESINGA - Mill Entry System</p>
            </div>
            
            {/* User Info & Logout */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1 bg-slate-700 rounded-full">
                <User className="w-4 h-4 text-amber-400" />
                <span className="text-white text-sm">{user.username}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${user.role === 'admin' ? 'bg-red-600' : 'bg-blue-600'}`}>
                  {user.role.toUpperCase()}
                </span>
              </div>
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

          {/* Action Buttons */}
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
                  {/* KMS Year & Season */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <Label className="text-slate-300">KMS Year</Label>
                      <Select
                        value={formData.kms_year}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, kms_year: value }))}
                      >
                        <SelectTrigger className="bg-slate-700 border-slate-600 text-white" data-testid="select-kms-year">
                          <SelectValue placeholder="Select Year" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-700 border-slate-600">
                          {KMS_YEARS.map(year => (
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
                      onChange={(e) => setFormData(prev => ({ ...prev, mandi_name: e.target.value }))}
                      suggestions={mandiSuggestions}
                      placeholder="Mandi name"
                      onSelect={(val) => setFormData(prev => ({ ...prev, mandi_name: val }))}
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
                        <Label className="text-blue-400 font-semibold">Mill W. QNTL (Auto)</Label>
                        <Input
                          value={calculatedFields.mill_w}
                          readOnly
                          className="bg-blue-900/30 border-blue-700 text-blue-400 text-lg font-bold"
                          data-testid="calculated-mill-w"
                        />
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
                        <Label className="text-yellow-400 font-semibold">Moisture Cut (Auto)</Label>
                        <Input
                          value={`${calculatedFields.moisture_cut} kg (${calculatedFields.moisture_cut_percent}%)`}
                          readOnly
                          className="bg-yellow-900/30 border-yellow-700 text-yellow-400 font-bold"
                          data-testid="calculated-moisture-cut"
                        />
                        <span className="text-xs text-slate-400">{formData.moisture > 17 ? `${formData.moisture}-17 = ${calculatedFields.moisture_cut_percent}% cut` : 'No cut'}</span>
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

          {/* Filter Panel */}
          {showFilters && (
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
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <Label className="text-slate-300 text-sm">KMS Year</Label>
                  <Select
                    value={filters.kms_year || "all"}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, kms_year: value === "all" ? "" : value }))}
                  >
                    <SelectTrigger className="bg-slate-600 border-slate-500 text-white" data-testid="filter-kms-year">
                      <SelectValue placeholder="All Years" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      <SelectItem value="all" className="text-white hover:bg-slate-600">All Years</SelectItem>
                      {KMS_YEARS.map(year => (
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
      <main className="max-w-7xl mx-auto px-4 py-6">
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
              <span>Mill Entries ({entries.length}) - KMS: {filters.kms_year || "All"}</span>
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
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-slate-700/50">
                    <TableHead className="text-slate-300 w-10">
                      <input
                        type="checkbox"
                        checked={selectAll}
                        onChange={handleSelectAll}
                        className="w-4 h-4 rounded border-slate-500 bg-slate-700 text-amber-500 focus:ring-amber-500"
                        data-testid="select-all-checkbox"
                      />
                    </TableHead>
                    <TableHead className="text-slate-300">Date</TableHead>
                    <TableHead className="text-slate-300">Season</TableHead>
                    <TableHead className="text-slate-300">Truck</TableHead>
                    <TableHead className="text-slate-300">Agent</TableHead>
                    <TableHead className="text-slate-300">Mandi</TableHead>
                    <TableHead className="text-green-400 text-right">QNTL</TableHead>
                    <TableHead className="text-slate-300 text-right">BAG</TableHead>
                    <TableHead className="text-blue-400 text-right">Mill W</TableHead>
                    <TableHead className="text-purple-400 text-right">Cut %</TableHead>
                    <TableHead className="text-amber-400 text-right">Final W</TableHead>
                    <TableHead className="text-cyan-400 text-right">G.Issued</TableHead>
                    <TableHead className="text-slate-300 text-right">Cash</TableHead>
                    <TableHead className="text-slate-300 text-right">Diesel</TableHead>
                    <TableHead className="text-slate-300 text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center text-slate-400 py-8">
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
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedEntries.includes(entry.id)}
                            onChange={() => handleSelectEntry(entry.id)}
                            disabled={!canEditEntry(entry)}
                            className="w-4 h-4 rounded border-slate-500 bg-slate-700 text-amber-500 focus:ring-amber-500 disabled:opacity-50"
                            data-testid={`select-${entry.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-white">{entry.date}</TableCell>
                        <TableCell className="text-white text-xs">{entry.season}</TableCell>
                        <TableCell className="text-white font-mono text-sm">{entry.truck_no}</TableCell>
                        <TableCell className="text-white">{entry.agent_name}</TableCell>
                        <TableCell className="text-white">{entry.mandi_name}</TableCell>
                        <TableCell className="text-green-400 text-right font-mono font-bold">
                          {entry.qntl?.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-white text-right font-mono">
                          {entry.bag}
                        </TableCell>
                        <TableCell className="text-blue-400 text-right font-mono font-bold">
                          {(entry.mill_w / 100)?.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-purple-400 text-right font-mono">
                          {entry.cutting_percent}%
                        </TableCell>
                        <TableCell className="text-amber-400 text-right font-mono font-bold">
                          {(entry.final_w / 100)?.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-cyan-400 text-right font-mono">
                          {entry.g_issued?.toLocaleString() || 0}
                        </TableCell>
                        <TableCell className="text-white text-right font-mono">
                          {entry.cash_paid?.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-white text-right font-mono">
                          {entry.diesel_paid?.toLocaleString() || 0}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex gap-1 justify-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEdit(entry)}
                              className={`h-8 w-8 p-0 ${canEditEntry(entry) ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-900/30' : 'text-slate-600 cursor-not-allowed'}`}
                              data-testid={`edit-btn-${entry.id}`}
                              disabled={!canEditEntry(entry)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(entry)}
                              className={`h-8 w-8 p-0 ${canEditEntry(entry) ? 'text-red-400 hover:text-red-300 hover:bg-red-900/30' : 'text-slate-600 cursor-not-allowed'}`}
                              data-testid={`delete-btn-${entry.id}`}
                              disabled={!canEditEntry(entry)}
                            >
                              <Trash2 className="w-4 h-4" />
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
      </main>

      {/* Footer */}
      <footer className="bg-slate-800/50 border-t border-slate-700 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-400 text-sm">
          <p>Navkar Agro Mill Entry System</p>
          <p className="text-xs mt-1">1 Quintal = 100 KG | P.Pkt = 0.50 kg/bag</p>
        </div>
      </footer>
    </div>
  );
}

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
    return <LoginPage onLogin={handleLogin} />;
  }

  return <MainApp user={user} onLogout={handleLogout} />;
}

export default App;
