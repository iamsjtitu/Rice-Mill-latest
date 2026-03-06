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
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Trash2, Edit, Plus, Calculator, RefreshCw, Filter, X, 
  FileSpreadsheet, FileText, LogOut, User, Lock, Key, Target, 
  BarChart3, TrendingUp, Calendar, Truck, Users, IndianRupee, 
  CheckCircle, Clock, AlertCircle, Undo2, History, Keyboard, 
  Info, Printer 
} from "lucide-react";

// Import extracted components
import LoginPage from "@/components/LoginPage";
import AutoSuggest from "@/components/common/AutoSuggest";

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

// ============================================================
// DASHBOARD COMPONENT
// ============================================================
const Dashboard = ({ filters, user }) => {
  const [agentTotals, setAgentTotals] = useState([]);
  const [mandiTargets, setMandiTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTargetForm, setShowTargetForm] = useState(false);
  const [targetForm, setTargetForm] = useState({
    mandi_name: "",
    target_qntl: "",
    cutting_percent: "5",
    base_rate: "10",
    cutting_rate: "5",
    kms_year: filters.kms_year || CURRENT_KMS_YEAR,
    season: filters.season || "Kharif"
  });
  const [editingTargetId, setEditingTargetId] = useState(null);

  const CHART_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899'];

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);

      const [agentRes, targetRes] = await Promise.all([
        axios.get(`${API}/dashboard/agent-totals?${params.toString()}`),
        axios.get(`${API}/mandi-targets/summary?${params.toString()}`)
      ]);

      setAgentTotals(agentRes.data.agent_totals || []);
      setMandiTargets(targetRes.data || []);
    } catch (error) {
      console.error("Dashboard fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [filters.kms_year, filters.season]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleCreateTarget = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...targetForm,
        target_qntl: parseFloat(targetForm.target_qntl),
        cutting_percent: parseFloat(targetForm.cutting_percent),
        base_rate: parseFloat(targetForm.base_rate),
        cutting_rate: parseFloat(targetForm.cutting_rate)
      };

      if (editingTargetId) {
        await axios.put(`${API}/mandi-targets/${editingTargetId}?username=${user.username}&role=${user.role}`, payload);
        toast.success("Target update ho gaya!");
      } else {
        await axios.post(`${API}/mandi-targets?username=${user.username}&role=${user.role}`, payload);
        toast.success("Target set ho gaya!");
      }
      
      setShowTargetForm(false);
      setEditingTargetId(null);
      setTargetForm({
        mandi_name: "",
        target_qntl: "",
        cutting_percent: "5",
        base_rate: "10",
        cutting_rate: "5",
        kms_year: filters.kms_year || CURRENT_KMS_YEAR,
        season: filters.season || "Kharif"
      });
      fetchDashboardData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Target save karne mein error");
    }
  };

  const handleDeleteTarget = async (targetId) => {
    if (!window.confirm("Kya aap ye target delete karna chahte hain?")) return;
    try {
      await axios.delete(`${API}/mandi-targets/${targetId}?username=${user.username}&role=${user.role}`);
      toast.success("Target delete ho gaya!");
      fetchDashboardData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Delete karne mein error");
    }
  };

  const handleEditTarget = (target) => {
    setTargetForm({
      mandi_name: target.mandi_name,
      target_qntl: target.target_qntl.toString(),
      cutting_percent: target.cutting_percent.toString(),
      base_rate: (target.base_rate ?? 10).toString(),
      cutting_rate: (target.cutting_rate ?? 5).toString(),
      kms_year: target.kms_year,
      season: target.season
    });
    setEditingTargetId(target.id);
    setShowTargetForm(true);
  };

  const expectedTotal = parseFloat(targetForm.target_qntl || 0) + 
    (parseFloat(targetForm.target_qntl || 0) * parseFloat(targetForm.cutting_percent || 0) / 100);
  
  // Agent payment calculation preview
  const targetAmount = parseFloat(targetForm.target_qntl || 0) * parseFloat(targetForm.base_rate ?? 10);
  const cuttingQntl = parseFloat(targetForm.target_qntl || 0) * parseFloat(targetForm.cutting_percent || 0) / 100;
  const cuttingAmount = cuttingQntl * parseFloat(targetForm.cutting_rate ?? 5);
  const totalAgentAmount = targetAmount + cuttingAmount;

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Report Button */}
      <div className="flex justify-end">
        <Button
          onClick={() => {
            const params = new URLSearchParams();
            if (filters.kms_year) params.append('kms_year', filters.kms_year);
            if (filters.season) params.append('season', filters.season);
            window.open(`${API}/export/summary-report-pdf?${params.toString()}`, '_blank');
          }}
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          <FileText className="w-4 h-4 mr-2" />
          Summary Report PDF
        </Button>
      </div>

      {/* Mandi Target Section */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg text-amber-400 flex items-center gap-2">
              <Target className="w-5 h-5" />
              Mandi Target vs Achieved
            </CardTitle>
            {user.role === 'admin' && (
              <Button
                onClick={() => {
                  setShowTargetForm(!showTargetForm);
                  setEditingTargetId(null);
                  setTargetForm({
                    mandi_name: "",
                    target_qntl: "",
                    cutting_percent: "5",
                    base_rate: "10",
                    cutting_rate: "5",
                    kms_year: filters.kms_year || CURRENT_KMS_YEAR,
                    season: filters.season || "Kharif"
                  });
                }}
                size="sm"
                className="bg-amber-500 hover:bg-amber-600 text-slate-900"
                data-testid="add-target-btn"
              >
                <Plus className="w-4 h-4 mr-1" />
                Naya Target
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Target Form */}
          {showTargetForm && user.role === 'admin' && (
            <form onSubmit={handleCreateTarget} className="mb-6 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                <div>
                  <Label className="text-slate-300 text-xs">Mandi Name</Label>
                  <Input
                    value={targetForm.mandi_name}
                    onChange={(e) => setTargetForm(prev => ({ ...prev, mandi_name: e.target.value }))}
                    placeholder="Badkutru"
                    className="bg-slate-700 border-slate-600 text-white text-sm"
                    required
                    data-testid="target-mandi-name"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-xs">Target (QNTL)</Label>
                  <Input
                    type="number"
                    value={targetForm.target_qntl}
                    onChange={(e) => setTargetForm(prev => ({ ...prev, target_qntl: e.target.value }))}
                    placeholder="5000"
                    className="bg-slate-700 border-slate-600 text-white text-sm"
                    required
                    data-testid="target-qntl"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-xs">Cutting %</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={targetForm.cutting_percent}
                    onChange={(e) => setTargetForm(prev => ({ ...prev, cutting_percent: e.target.value }))}
                    placeholder="5"
                    className="bg-slate-700 border-slate-600 text-white text-sm"
                    required
                    data-testid="target-cutting"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-xs">KMS Year</Label>
                  <Select
                    value={targetForm.kms_year}
                    onValueChange={(value) => setTargetForm(prev => ({ ...prev, kms_year: value }))}
                  >
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      {KMS_YEARS.map(year => (
                        <SelectItem key={year} value={year} className="text-white">{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Rates Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                <div>
                  <Label className="text-slate-300 text-xs">Base Rate (₹/QNTL)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={targetForm.base_rate}
                    onChange={(e) => setTargetForm(prev => ({ ...prev, base_rate: e.target.value }))}
                    placeholder="10"
                    className="bg-slate-700 border-slate-600 text-white text-sm"
                    required
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-xs">Cutting Rate (₹/QNTL)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={targetForm.cutting_rate}
                    onChange={(e) => setTargetForm(prev => ({ ...prev, cutting_rate: e.target.value }))}
                    placeholder="5"
                    className="bg-slate-700 border-slate-600 text-white text-sm"
                    required
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-xs">Season</Label>
                  <Select
                    value={targetForm.season}
                    onValueChange={(value) => setTargetForm(prev => ({ ...prev, season: value }))}
                  >
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      {SEASONS.map(s => (
                        <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Expected Total & Agent Payment Preview */}
              {targetForm.target_qntl && (
                <div className="mb-4 p-3 bg-slate-600/30 border border-slate-500/50 rounded-lg space-y-2">
                  <p className="text-emerald-400 text-sm">
                    <TrendingUp className="w-4 h-4 inline mr-1" />
                    Expected Total: <strong>{expectedTotal.toFixed(2)} QNTL</strong>
                    <span className="text-slate-400 ml-2">
                      ({targetForm.target_qntl} + {targetForm.cutting_percent}% excess)
                    </span>
                  </p>
                  <p className="text-amber-400 text-sm">
                    <IndianRupee className="w-4 h-4 inline mr-1" />
                    Agent Payment: <strong>₹{totalAgentAmount.toFixed(2)}</strong>
                    <span className="text-slate-400 ml-2">
                      ({targetForm.target_qntl}×₹{targetForm.base_rate} + {cuttingQntl.toFixed(2)}×₹{targetForm.cutting_rate})
                    </span>
                  </p>
                </div>
              )}
              
              <div className="flex gap-2">
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="save-target-btn">
                  {editingTargetId ? "Update" : "Save"} Target
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowTargetForm(false)}
                  className="border-slate-600 text-slate-300"
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {/* Target Progress Bars */}
          {mandiTargets.length > 0 ? (
            <div className="space-y-4">
              {mandiTargets.map((target, idx) => (
                <div key={idx} className="p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-white font-semibold">{target.mandi_name}</h4>
                      <p className="text-slate-400 text-xs">
                        Target: {target.target_qntl} QNTL + {target.cutting_percent}% = 
                        <span className="text-amber-400 font-semibold ml-1">{target.expected_total} QNTL</span>
                      </p>
                      <p className="text-blue-400 text-xs">
                        Agent Payment: ₹{target.total_agent_amount || 0} 
                        <span className="text-slate-500 ml-1">
                          ({target.target_qntl}×₹{target.base_rate || 10} + {target.cutting_qntl || 0}×₹{target.cutting_rate || 5})
                        </span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${target.progress_percent >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {target.progress_percent}%
                      </p>
                      {user.role === 'admin' && (
                        <div className="flex gap-1 mt-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditTarget({ ...target, id: target.id || mandiTargets[idx].id })}
                            className="h-6 w-6 p-0 text-blue-400 hover:bg-blue-900/30"
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteTarget(target.id || mandiTargets[idx].id)}
                            className="h-6 w-6 p-0 text-red-400 hover:bg-red-900/30"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="relative h-6 bg-slate-600 rounded-full overflow-hidden">
                    <div
                      className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${
                        target.progress_percent >= 100 ? 'bg-emerald-500' : 
                        target.progress_percent >= 75 ? 'bg-amber-500' : 
                        target.progress_percent >= 50 ? 'bg-blue-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(target.progress_percent, 100)}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-semibold text-white drop-shadow">
                        {target.achieved_qntl} / {target.expected_total} QNTL
                      </span>
                    </div>
                  </div>
                  
                  {/* Status */}
                  <div className="flex justify-between mt-2 text-xs">
                    <span className="text-emerald-400">
                      Achieved: {target.achieved_qntl} QNTL
                    </span>
                    <span className={target.pending_qntl > 0 ? 'text-red-400' : 'text-emerald-400'}>
                      {target.pending_qntl > 0 ? `Pending: ${target.pending_qntl} QNTL` : 'Target Complete! ✓'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Koi target set nahi hai</p>
              {user.role === 'admin' && (
                <p className="text-xs mt-1">Naya target add karne ke liye button click karein</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Payments Component
const Payments = ({ filters, user }) => {
  const [truckPayments, setTruckPayments] = useState([]);
  const [agentPayments, setAgentPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePaymentTab, setActivePaymentTab] = useState("truck");
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showRateDialog, setShowRateDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [newRate, setNewRate] = useState("");
  const [truckSearchFilter, setTruckSearchFilter] = useState("");
  const [paymentHistory, setPaymentHistory] = useState([]);

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);

      const [truckRes, agentRes] = await Promise.all([
        axios.get(`${API}/truck-payments?${params.toString()}`),
        axios.get(`${API}/agent-payments?${params.toString()}`)
      ]);

      setTruckPayments(truckRes.data || []);
      setAgentPayments(agentRes.data || []);
    } catch (error) {
      console.error("Payments fetch error:", error);
      toast.error("Payments load karne mein error");
    } finally {
      setLoading(false);
    }
  }, [filters.kms_year, filters.season]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Filter truck payments by search
  const filteredTruckPayments = truckSearchFilter
    ? truckPayments.filter(p => 
        p.truck_no.toLowerCase().includes(truckSearchFilter.toLowerCase()) ||
        p.mandi_name.toLowerCase().includes(truckSearchFilter.toLowerCase())
      )
    : truckPayments;

  // Export truck payments to Excel
  const handleExportTruckExcel = () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    if (truckSearchFilter) params.append('truck_no', truckSearchFilter);
    window.open(`${API}/export/truck-payments-excel?${params.toString()}`, '_blank');
  };

  // Export truck payments to PDF
  const handleExportTruckPDF = () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    if (truckSearchFilter) params.append('truck_no', truckSearchFilter);
    window.open(`${API}/export/truck-payments-pdf?${params.toString()}`, '_blank');
  };

  // Export agent payments
  const handleExportAgentExcel = () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    window.open(`${API}/export/agent-payments-excel?${params.toString()}`, '_blank');
  };

  const handleExportAgentPDF = () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    window.open(`${API}/export/agent-payments-pdf?${params.toString()}`, '_blank');
  };

  // Export Truck Owner Consolidated
  const handleExportTruckOwnerExcel = () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    window.open(`${API}/export/truck-owner-excel?${params.toString()}`, '_blank');
  };

  const handleExportTruckOwnerPDF = () => {
    const params = new URLSearchParams();
    if (filters.kms_year) params.append('kms_year', filters.kms_year);
    if (filters.season) params.append('season', filters.season);
    window.open(`${API}/export/truck-owner-pdf?${params.toString()}`, '_blank');
  };

  // Undo paid
  const handleUndoPaid = async (item) => {
    if (!window.confirm("Kya aap is payment ko undo karna chahte hain? Paid amount 0 ho jayega.")) return;
    try {
      if (activePaymentTab === "truck") {
        await axios.post(
          `${API}/truck-payments/${item.entry_id}/undo-paid?username=${user.username}&role=${user.role}`
        );
      } else {
        await axios.post(
          `${API}/agent-payments/${encodeURIComponent(item.mandi_name)}/undo-paid?kms_year=${item.kms_year}&season=${item.season}&username=${user.username}&role=${user.role}`
        );
      }
      toast.success("Payment undo ho gaya!");
      fetchPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Undo karne mein error");
    }
  };

  // View payment history
  const handleViewHistory = async (item) => {
    try {
      let res;
      if (activePaymentTab === "truck") {
        res = await axios.get(`${API}/truck-payments/${item.entry_id}/history`);
      } else {
        res = await axios.get(
          `${API}/agent-payments/${encodeURIComponent(item.mandi_name)}/history?kms_year=${item.kms_year}&season=${item.season}`
        );
      }
      setPaymentHistory(res.data.history || []);
      setSelectedItem(item);
      setShowHistoryDialog(true);
    } catch (error) {
      toast.error("History load karne mein error");
    }
  };

  const handleSetRate = async () => {
    if (!newRate || !selectedItem) return;
    try {
      if (activePaymentTab === "truck") {
        await axios.put(
          `${API}/truck-payments/${selectedItem.entry_id}/rate?username=${user.username}&role=${user.role}`,
          { rate_per_qntl: parseFloat(newRate) }
        );
      } else {
        await axios.put(
          `${API}/agent-rates/${encodeURIComponent(selectedItem.agent_name)}?kms_year=${filters.kms_year}&season=${filters.season}&username=${user.username}&role=${user.role}`,
          { rate_per_qntl: parseFloat(newRate) }
        );
      }
      toast.success("Rate set ho gaya!");
      setShowRateDialog(false);
      setNewRate("");
      fetchPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Rate set karne mein error");
    }
  };

  const handleMakePayment = async () => {
    if (!paymentAmount || !selectedItem) return;
    try {
      if (activePaymentTab === "truck") {
        await axios.post(
          `${API}/truck-payments/${selectedItem.entry_id}/pay?username=${user.username}&role=${user.role}`,
          { amount: parseFloat(paymentAmount), note: paymentNote }
        );
      } else {
        await axios.post(
          `${API}/agent-payments/${encodeURIComponent(selectedItem.mandi_name)}/pay?kms_year=${filters.kms_year}&season=${filters.season}&username=${user.username}&role=${user.role}`,
          { amount: parseFloat(paymentAmount), note: paymentNote }
        );
      }
      toast.success("Payment recorded!");
      setShowPaymentDialog(false);
      setPaymentAmount("");
      setPaymentNote("");
      fetchPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Payment karne mein error");
    }
  };

  const handleMarkPaid = async (item) => {
    if (!window.confirm("Kya aap isko fully paid mark karna chahte hain?")) return;
    try {
      if (activePaymentTab === "truck") {
        await axios.post(
          `${API}/truck-payments/${item.entry_id}/mark-paid?username=${user.username}&role=${user.role}`
        );
      } else {
        await axios.post(
          `${API}/agent-payments/${encodeURIComponent(item.mandi_name)}/mark-paid?kms_year=${item.kms_year}&season=${item.season}&username=${user.username}&role=${user.role}`
        );
      }
      toast.success("Payment cleared!");
      fetchPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Mark paid mein error");
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'paid':
        return <span className="px-2 py-1 text-xs rounded-full bg-emerald-900/50 text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Paid</span>;
      case 'partial':
        return <span className="px-2 py-1 text-xs rounded-full bg-amber-900/50 text-amber-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Partial</span>;
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-red-900/50 text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Pending</span>;
    }
  };

  // Print Invoice for Truck Payment
  const handlePrintInvoice = (payment) => {
    const invoiceWindow = window.open('', '_blank', 'width=800,height=600');
    const invoiceContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Payment Receipt - ${payment.truck_no}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; background: #f5f5f5; }
          .invoice { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 20px; margin-bottom: 20px; }
          .header h1 { color: #f59e0b; font-size: 28px; margin-bottom: 5px; }
          .header p { color: #666; font-size: 14px; }
          .receipt-title { text-align: center; background: #1e293b; color: white; padding: 10px; border-radius: 4px; margin-bottom: 20px; font-size: 18px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
          .info-item { padding: 10px; background: #f8fafc; border-radius: 4px; }
          .info-item label { display: block; font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
          .info-item span { font-size: 16px; font-weight: 600; color: #1e293b; }
          .amount-section { background: #fef3c7; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .amount-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #fbbf24; }
          .amount-row:last-child { border-bottom: none; }
          .amount-row.total { font-size: 20px; font-weight: bold; color: #1e293b; border-top: 2px solid #f59e0b; margin-top: 10px; padding-top: 15px; }
          .amount-row.deduction { color: #dc2626; }
          .amount-row.paid { color: #059669; }
          .status-badge { display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
          .status-paid { background: #d1fae5; color: #059669; }
          .status-partial { background: #fef3c7; color: #d97706; }
          .status-pending { background: #fee2e2; color: #dc2626; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
          .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
          .signature-box { text-align: center; }
          .signature-line { border-top: 1px solid #1e293b; margin-top: 50px; padding-top: 5px; font-size: 12px; color: #64748b; }
          .print-note { text-align: center; color: #94a3b8; font-size: 11px; margin-top: 20px; }
          @media print {
            body { background: white; padding: 0; }
            .invoice { box-shadow: none; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="header">
            <h1>NAVKAR AGRO</h1>
            <p>JOLKO, KESINGA - Mill Entry System</p>
          </div>
          
          <div class="receipt-title">
            PAYMENT RECEIPT / भुगतान रसीद
          </div>
          
          <div class="info-grid">
            <div class="info-item">
              <label>Receipt Date / रसीद दिनांक</label>
              <span>${new Date().toLocaleDateString('en-IN')}</span>
            </div>
            <div class="info-item">
              <label>Trip Date / ट्रिप दिनांक</label>
              <span>${payment.date}</span>
            </div>
            <div class="info-item">
              <label>Truck Number / ट्रक नंबर</label>
              <span>${payment.truck_no}</span>
            </div>
            <div class="info-item">
              <label>Mandi Name / मंडी</label>
              <span>${payment.mandi_name}</span>
            </div>
            <div class="info-item">
              <label>Final Weight / अंतिम वजन</label>
              <span>${payment.final_qntl} QNTL</span>
            </div>
            <div class="info-item">
              <label>Rate / दर</label>
              <span>Rs. ${payment.rate_per_qntl} /QNTL</span>
            </div>
          </div>
          
          <div class="amount-section">
            <div class="amount-row">
              <span>Gross Amount / कुल राशि</span>
              <span>Rs. ${payment.gross_amount.toLocaleString('en-IN')}</span>
            </div>
            <div class="amount-row deduction">
              <span>Deductions (Cash + Diesel) / कटौती</span>
              <span>- Rs. ${payment.deductions.toLocaleString('en-IN')}</span>
            </div>
            <div class="amount-row total">
              <span>Net Amount / शुद्ध राशि</span>
              <span>Rs. ${payment.net_amount.toLocaleString('en-IN')}</span>
            </div>
            <div class="amount-row paid">
              <span>Amount Paid / भुगतान किया</span>
              <span>Rs. ${payment.paid_amount.toLocaleString('en-IN')}</span>
            </div>
            <div class="amount-row">
              <span>Balance / बाकी</span>
              <span>Rs. ${payment.balance_amount.toLocaleString('en-IN')}</span>
            </div>
          </div>
          
          <div style="text-align: center; margin: 15px 0;">
            <span class="status-badge status-${payment.status}">${payment.status === 'paid' ? 'PAID / भुगतान हो गया' : payment.status === 'partial' ? 'PARTIAL / आंशिक' : 'PENDING / बाकी'}</span>
          </div>
          
          <div class="footer">
            <div class="signature-section">
              <div class="signature-box">
                <div class="signature-line">Driver Signature / ड्राइवर हस्ताक्षर</div>
              </div>
              <div class="signature-box">
                <div class="signature-line">Authorized Signature / अधिकृत हस्ताक्षर</div>
              </div>
            </div>
          </div>
          
          <div class="print-note">
            This is a computer generated receipt / यह कंप्यूटर जनित रसीद है
          </div>
        </div>
        
        <div class="no-print" style="text-align: center; margin-top: 20px;">
          <button onclick="window.print()" style="background: #f59e0b; color: white; border: none; padding: 12px 30px; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold;">
            🖨️ Print Receipt
          </button>
        </div>
      </body>
      </html>
    `;
    invoiceWindow.document.write(invoiceContent);
    invoiceWindow.document.close();
  };

  // Print Invoice for Agent Payment
  const handlePrintAgentInvoice = (payment) => {
    const invoiceWindow = window.open('', '_blank', 'width=800,height=600');
    const invoiceContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Agent Payment Receipt - ${payment.mandi_name}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; background: #f5f5f5; }
          .invoice { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 20px; margin-bottom: 20px; }
          .header h1 { color: #f59e0b; font-size: 28px; margin-bottom: 5px; }
          .header p { color: #666; font-size: 14px; }
          .receipt-title { text-align: center; background: #7c3aed; color: white; padding: 10px; border-radius: 4px; margin-bottom: 20px; font-size: 18px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
          .info-item { padding: 10px; background: #f8fafc; border-radius: 4px; }
          .info-item label { display: block; font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
          .info-item span { font-size: 16px; font-weight: 600; color: #1e293b; }
          .amount-section { background: #ede9fe; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .amount-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #a78bfa; }
          .amount-row:last-child { border-bottom: none; }
          .amount-row.total { font-size: 20px; font-weight: bold; color: #1e293b; border-top: 2px solid #7c3aed; margin-top: 10px; padding-top: 15px; }
          .amount-row.paid { color: #059669; }
          .status-badge { display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
          .status-paid { background: #d1fae5; color: #059669; }
          .status-partial { background: #fef3c7; color: #d97706; }
          .status-pending { background: #fee2e2; color: #dc2626; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
          .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
          .signature-box { text-align: center; }
          .signature-line { border-top: 1px solid #1e293b; margin-top: 50px; padding-top: 5px; font-size: 12px; color: #64748b; }
          .print-note { text-align: center; color: #94a3b8; font-size: 11px; margin-top: 20px; }
          .target-info { background: #fef3c7; padding: 15px; border-radius: 8px; margin-bottom: 15px; }
          .target-info h4 { color: #92400e; margin-bottom: 8px; font-size: 14px; }
          .target-info p { font-size: 13px; color: #78350f; }
          @media print {
            body { background: white; padding: 0; }
            .invoice { box-shadow: none; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="header">
            <h1>NAVKAR AGRO</h1>
            <p>JOLKO, KESINGA - Mill Entry System</p>
          </div>
          
          <div class="receipt-title">
            AGENT PAYMENT RECEIPT / एजेंट भुगतान रसीद
          </div>
          
          <div class="info-grid">
            <div class="info-item">
              <label>Receipt Date / रसीद दिनांक</label>
              <span>${new Date().toLocaleDateString('en-IN')}</span>
            </div>
            <div class="info-item">
              <label>KMS Year / Season</label>
              <span>${payment.kms_year} - ${payment.season}</span>
            </div>
            <div class="info-item">
              <label>Mandi Name / मंडी</label>
              <span>${payment.mandi_name}</span>
            </div>
            <div class="info-item">
              <label>Agent Name / एजेंट</label>
              <span>${payment.agent_name}</span>
            </div>
          </div>
          
          <div class="target-info">
            <h4>Target Details / लक्ष्य विवरण</h4>
            <p>Target: ${payment.target_qntl} QNTL + Cutting ${payment.cutting_percent}% = ${(payment.target_qntl + payment.cutting_qntl).toFixed(2)} QNTL</p>
            <p>Achieved: ${payment.achieved_qntl} QNTL ${payment.is_target_complete ? '✅ Complete' : '⏳ In Progress'}</p>
          </div>
          
          <div class="amount-section">
            <div class="amount-row">
              <span>Target Amount / लक्ष्य राशि (${payment.target_qntl} × Rs.${payment.base_rate})</span>
              <span>Rs. ${(payment.target_qntl * payment.base_rate).toLocaleString('en-IN')}</span>
            </div>
            <div class="amount-row">
              <span>Cutting Amount / कटिंग राशि (${payment.cutting_qntl} × Rs.${payment.cutting_rate})</span>
              <span>Rs. ${(payment.cutting_qntl * payment.cutting_rate).toLocaleString('en-IN')}</span>
            </div>
            <div class="amount-row total">
              <span>Total Amount / कुल राशि</span>
              <span>Rs. ${payment.total_amount.toLocaleString('en-IN')}</span>
            </div>
            <div class="amount-row paid">
              <span>Amount Paid / भुगतान किया</span>
              <span>Rs. ${payment.paid_amount.toLocaleString('en-IN')}</span>
            </div>
            <div class="amount-row">
              <span>Balance / बाकी</span>
              <span>Rs. ${payment.balance_amount.toLocaleString('en-IN')}</span>
            </div>
          </div>
          
          <div style="text-align: center; margin: 15px 0;">
            <span class="status-badge status-${payment.status}">${payment.status === 'paid' ? 'PAID / भुगतान हो गया' : payment.status === 'partial' ? 'PARTIAL / आंशिक' : 'PENDING / बाकी'}</span>
          </div>
          
          <div class="footer">
            <div class="signature-section">
              <div class="signature-box">
                <div class="signature-line">Agent Signature / एजेंट हस्ताक्षर</div>
              </div>
              <div class="signature-box">
                <div class="signature-line">Authorized Signature / अधिकृत हस्ताक्षर</div>
              </div>
            </div>
          </div>
          
          <div class="print-note">
            This is a computer generated receipt / यह कंप्यूटर जनित रसीद है
          </div>
        </div>
        
        <div class="no-print" style="text-align: center; margin-top: 20px;">
          <button onclick="window.print()" style="background: #7c3aed; color: white; border: none; padding: 12px 30px; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold;">
            🖨️ Print Receipt
          </button>
        </div>
      </body>
      </html>
    `;
    invoiceWindow.document.write(invoiceContent);
    invoiceWindow.document.close();
  };

  // Calculate Truck-wise consolidated payments (group by truck_no)
  const truckWiseConsolidated = filteredTruckPayments.reduce((acc, payment) => {
    const truckNo = payment.truck_no;
    if (!acc[truckNo]) {
      acc[truckNo] = {
        truck_no: truckNo,
        trips: [],
        total_final_qntl: 0,
        total_gross: 0,
        total_deductions: 0,
        total_net: 0,
        total_paid: 0,
        total_balance: 0
      };
    }
    acc[truckNo].trips.push(payment);
    acc[truckNo].total_final_qntl += payment.final_qntl;
    acc[truckNo].total_gross += payment.gross_amount;
    acc[truckNo].total_deductions += payment.deductions;
    acc[truckNo].total_net += payment.net_amount;
    acc[truckNo].total_paid += payment.paid_amount;
    acc[truckNo].total_balance += payment.balance_amount;
    return acc;
  }, {});

  const consolidatedTruckList = Object.values(truckWiseConsolidated);

  // Print Consolidated Truck Invoice
  const handlePrintConsolidatedInvoice = (truckData) => {
    const tripsHtml = truckData.trips.map(t => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${t.date}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${t.mandi_name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${t.final_qntl}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">Rs.${t.rate_per_qntl}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">Rs.${t.gross_amount.toLocaleString('en-IN')}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #dc2626;">-Rs.${t.deductions.toLocaleString('en-IN')}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">Rs.${t.net_amount.toLocaleString('en-IN')}</td>
      </tr>
    `).join('');

    const invoiceWindow = window.open('', '_blank', 'width=900,height=700');
    const invoiceContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Truck Owner Payment - ${truckData.truck_no}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; background: #f5f5f5; }
          .invoice { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 20px; margin-bottom: 20px; }
          .header h1 { color: #f59e0b; font-size: 28px; margin-bottom: 5px; }
          .header p { color: #666; font-size: 14px; }
          .receipt-title { text-align: center; background: #0891b2; color: white; padding: 10px; border-radius: 4px; margin-bottom: 20px; font-size: 18px; }
          .truck-info { background: #ecfeff; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center; }
          .truck-info h2 { color: #0e7490; font-size: 24px; }
          .truck-info p { color: #155e75; margin-top: 5px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
          th { background: #1e293b; color: white; padding: 10px; text-align: left; }
          th:nth-child(n+3) { text-align: right; }
          .summary { background: #fef3c7; padding: 20px; border-radius: 8px; margin-top: 20px; }
          .summary-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #fbbf24; }
          .summary-row:last-child { border-bottom: none; }
          .summary-row.total { font-size: 22px; font-weight: bold; color: #1e293b; border-top: 2px solid #f59e0b; margin-top: 10px; padding-top: 15px; }
          .summary-row.paid { color: #059669; }
          .summary-row.balance { color: #dc2626; }
          .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
          .signature-box { text-align: center; }
          .signature-line { border-top: 1px solid #1e293b; margin-top: 50px; padding-top: 5px; font-size: 12px; color: #64748b; }
          .print-note { text-align: center; color: #94a3b8; font-size: 11px; margin-top: 20px; }
          @media print {
            body { background: white; padding: 0; }
            .invoice { box-shadow: none; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="header">
            <h1>NAVKAR AGRO</h1>
            <p>JOLKO, KESINGA - Mill Entry System</p>
          </div>
          
          <div class="receipt-title">
            TRUCK OWNER CONSOLIDATED PAYMENT / ट्रक मालिक समेकित भुगतान
          </div>
          
          <div class="truck-info">
            <h2>🚛 ${truckData.truck_no}</h2>
            <p>Total Trips: ${truckData.trips.length} | Receipt Date: ${new Date().toLocaleDateString('en-IN')}</p>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Mandi</th>
                <th>QNTL</th>
                <th>Rate</th>
                <th>Gross</th>
                <th>Deductions</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              ${tripsHtml}
            </tbody>
          </table>
          
          <div class="summary">
            <div class="summary-row">
              <span>Total Weight / कुल वजन</span>
              <span>${truckData.total_final_qntl.toFixed(2)} QNTL</span>
            </div>
            <div class="summary-row">
              <span>Total Gross / कुल राशि</span>
              <span>Rs. ${truckData.total_gross.toLocaleString('en-IN')}</span>
            </div>
            <div class="summary-row" style="color: #dc2626;">
              <span>Total Deductions / कुल कटौती (Cash + Diesel)</span>
              <span>- Rs. ${truckData.total_deductions.toLocaleString('en-IN')}</span>
            </div>
            <div class="summary-row total">
              <span>Net Payable / देय राशि</span>
              <span>Rs. ${truckData.total_net.toLocaleString('en-IN')}</span>
            </div>
            <div class="summary-row paid">
              <span>Already Paid / पहले से भुगतान</span>
              <span>Rs. ${truckData.total_paid.toLocaleString('en-IN')}</span>
            </div>
            <div class="summary-row balance">
              <span>Balance Due / बकाया राशि</span>
              <span>Rs. ${truckData.total_balance.toLocaleString('en-IN')}</span>
            </div>
          </div>
          
          <div class="signature-section">
            <div class="signature-box">
              <div class="signature-line">Truck Owner Signature / ट्रक मालिक हस्ताक्षर</div>
            </div>
            <div class="signature-box">
              <div class="signature-line">Authorized Signature / अधिकृत हस्ताक्षर</div>
            </div>
          </div>
          
          <div class="print-note">
            This is a computer generated receipt / यह कंप्यूटर जनित रसीद है
          </div>
        </div>
        
        <div class="no-print" style="text-align: center; margin-top: 20px;">
          <button onclick="window.print()" style="background: #0891b2; color: white; border: none; padding: 12px 30px; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold;">
            🖨️ Print Receipt
          </button>
        </div>
      </body>
      </html>
    `;
    invoiceWindow.document.write(invoiceContent);
    invoiceWindow.document.close();
  };

  // Calculate totals for filtered truck payments
  const truckTotals = {
    netAmount: filteredTruckPayments.reduce((sum, p) => sum + p.net_amount, 0),
    paid: filteredTruckPayments.reduce((sum, p) => sum + p.paid_amount, 0),
    balance: filteredTruckPayments.reduce((sum, p) => sum + p.balance_amount, 0)
  };

  const agentTotals = {
    totalAmount: agentPayments.reduce((sum, p) => sum + p.total_amount, 0),
    paid: agentPayments.reduce((sum, p) => sum + p.paid_amount, 0),
    balance: agentPayments.reduce((sum, p) => sum + p.balance_amount, 0)
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Payment Tabs */}
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        <Button
          onClick={() => setActivePaymentTab("truck")}
          variant={activePaymentTab === "truck" ? "default" : "ghost"}
          size="sm"
          className={activePaymentTab === "truck" 
            ? "bg-amber-500 hover:bg-amber-600 text-slate-900" 
            : "text-slate-300 hover:bg-slate-700"}
        >
          <Truck className="w-4 h-4 mr-1" />
          Truck Payments ({filteredTruckPayments.length})
        </Button>
        <Button
          onClick={() => setActivePaymentTab("consolidated")}
          variant={activePaymentTab === "consolidated" ? "default" : "ghost"}
          size="sm"
          className={activePaymentTab === "consolidated" 
            ? "bg-cyan-500 hover:bg-cyan-600 text-slate-900" 
            : "text-slate-300 hover:bg-slate-700"}
        >
          <Truck className="w-4 h-4 mr-1" />
          Truck Owner ({consolidatedTruckList.length})
        </Button>
        <Button
          onClick={() => setActivePaymentTab("agent")}
          variant={activePaymentTab === "agent" ? "default" : "ghost"}
          size="sm"
          className={activePaymentTab === "agent" 
            ? "bg-amber-500 hover:bg-amber-600 text-slate-900" 
            : "text-slate-300 hover:bg-slate-700"}
        >
          <Users className="w-4 h-4 mr-1" />
          Agent Payments ({agentPayments.length})
        </Button>
      </div>

      {/* Truck Filter & Export - Only for Truck Tab */}
      {activePaymentTab === "truck" && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] max-w-[300px]">
            <Input
              placeholder="Truck No. ya Mandi search karein..."
              value={truckSearchFilter}
              onChange={(e) => setTruckSearchFilter(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white text-sm"
            />
          </div>
          {truckSearchFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTruckSearchFilter("")}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button
              onClick={handleExportTruckExcel}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <FileSpreadsheet className="w-4 h-4 mr-1" />
              Excel
            </Button>
            <Button
              onClick={handleExportTruckPDF}
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <FileText className="w-4 h-4 mr-1" />
              PDF
            </Button>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-slate-700/50 border-slate-600">
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs">Total Amount</p>
            <p className="text-white text-xl font-bold">
              ₹{(activePaymentTab === "truck" ? truckTotals.netAmount : agentTotals.totalAmount).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-900/30 border-emerald-600/50">
          <CardContent className="p-4">
            <p className="text-emerald-400 text-xs">Paid</p>
            <p className="text-emerald-400 text-xl font-bold">
              ₹{(activePaymentTab === "truck" ? truckTotals.paid : agentTotals.paid).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-red-900/30 border-red-600/50">
          <CardContent className="p-4">
            <p className="text-red-400 text-xs">Balance</p>
            <p className="text-red-400 text-xl font-bold">
              ₹{(activePaymentTab === "truck" ? truckTotals.balance : agentTotals.balance).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Truck Payments Table */}
      {activePaymentTab === "truck" && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-amber-400 flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Truck Payments (Bhada)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-600">
                    <TableHead className="text-slate-300">Date</TableHead>
                    <TableHead className="text-slate-300">Truck No</TableHead>
                    <TableHead className="text-slate-300">Mandi</TableHead>
                    <TableHead className="text-slate-300 text-right">Final QNTL</TableHead>
                    <TableHead className="text-slate-300 text-right">Rate</TableHead>
                    <TableHead className="text-slate-300 text-right">Gross</TableHead>
                    <TableHead className="text-slate-300 text-right">Cash+Diesel</TableHead>
                    <TableHead className="text-slate-300 text-right">Net</TableHead>
                    <TableHead className="text-slate-300 text-right">Paid</TableHead>
                    <TableHead className="text-slate-300 text-right">Balance</TableHead>
                    <TableHead className="text-slate-300">Status</TableHead>
                    {user.role === 'admin' && <TableHead className="text-slate-300">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTruckPayments.map((payment, idx) => (
                    <TableRow key={idx} className="border-slate-700 hover:bg-slate-700/50">
                      <TableCell className="text-white text-xs">{payment.date}</TableCell>
                      <TableCell className="text-white font-semibold">{payment.truck_no}</TableCell>
                      <TableCell className="text-slate-300 text-xs">{payment.mandi_name}</TableCell>
                      <TableCell className="text-amber-400 text-right font-semibold">{payment.final_qntl}</TableCell>
                      <TableCell className="text-right">
                        <span className="text-blue-400">₹{payment.rate_per_qntl}</span>
                      </TableCell>
                      <TableCell className="text-right text-slate-300">₹{payment.gross_amount}</TableCell>
                      <TableCell className="text-right text-red-400">-₹{payment.deductions}</TableCell>
                      <TableCell className="text-right text-white font-semibold">₹{payment.net_amount}</TableCell>
                      <TableCell className="text-right text-emerald-400">₹{payment.paid_amount}</TableCell>
                      <TableCell className="text-right text-red-400 font-semibold">₹{payment.balance_amount}</TableCell>
                      <TableCell>{getStatusBadge(payment.status)}</TableCell>
                      {user.role === 'admin' && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setSelectedItem(payment); setNewRate(payment.rate_per_qntl.toString()); setShowRateDialog(true); }}
                              className="h-7 px-2 text-blue-400 hover:bg-blue-900/30"
                              title="Set Rate"
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            {payment.status !== 'paid' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { setSelectedItem(payment); setShowPaymentDialog(true); }}
                                  className="h-7 px-2 text-emerald-400 hover:bg-emerald-900/30"
                                  title="Make Payment"
                                >
                                  <IndianRupee className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleMarkPaid(payment)}
                                  className="h-7 px-2 text-amber-400 hover:bg-amber-900/30"
                                  title="Mark Paid"
                                >
                                  <CheckCircle className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                            {payment.status === 'paid' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleUndoPaid(payment)}
                                className="h-7 px-2 text-red-400 hover:bg-red-900/30"
                                title="Undo Paid"
                              >
                                <Undo2 className="w-3 h-3" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleViewHistory(payment)}
                              className="h-7 px-2 text-purple-400 hover:bg-purple-900/30"
                              title="Payment History"
                            >
                              <History className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handlePrintInvoice(payment)}
                              className="h-7 px-2 text-cyan-400 hover:bg-cyan-900/30"
                              title="Print Receipt"
                            >
                              <Printer className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Truck Owner Consolidated Payments */}
      {activePaymentTab === "consolidated" && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg text-cyan-400 flex items-center gap-2">
                  <Truck className="w-5 h-5" />
                  Truck Owner Consolidated Payments (ट्रक मालिक समेकित भुगतान)
                </CardTitle>
                <p className="text-slate-400 text-xs mt-1">
                  Ek truck ke saare trips ka total - sab cut karke final amount
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleExportTruckOwnerExcel}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-1" />
                  Excel
                </Button>
                <Button
                  onClick={handleExportTruckOwnerPDF}
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <FileText className="w-4 h-4 mr-1" />
                  PDF
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {consolidatedTruckList.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-600">
                      <TableHead className="text-slate-300">Truck No</TableHead>
                      <TableHead className="text-slate-300 text-center">Trips</TableHead>
                      <TableHead className="text-slate-300 text-right">Total QNTL</TableHead>
                      <TableHead className="text-slate-300 text-right">Gross Amount</TableHead>
                      <TableHead className="text-slate-300 text-right">Deductions</TableHead>
                      <TableHead className="text-slate-300 text-right">Net Payable</TableHead>
                      <TableHead className="text-slate-300 text-right">Paid</TableHead>
                      <TableHead className="text-slate-300 text-right">Balance</TableHead>
                      <TableHead className="text-slate-300">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consolidatedTruckList.map((truckData, idx) => (
                      <TableRow key={idx} className="border-slate-700 hover:bg-slate-700/50">
                        <TableCell className="text-white font-bold text-lg">{truckData.truck_no}</TableCell>
                        <TableCell className="text-center">
                          <span className="bg-slate-600 px-2 py-1 rounded-full text-xs text-white">
                            {truckData.trips.length} trips
                          </span>
                        </TableCell>
                        <TableCell className="text-amber-400 text-right font-semibold">
                          {truckData.total_final_qntl.toFixed(2)} QNTL
                        </TableCell>
                        <TableCell className="text-slate-300 text-right">
                          ₹{truckData.total_gross.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-red-400 text-right">
                          -₹{truckData.total_deductions.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-white text-right font-bold text-lg">
                          ₹{truckData.total_net.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-emerald-400 text-right">
                          ₹{truckData.total_paid.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-bold ${truckData.total_balance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            ₹{truckData.total_balance.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handlePrintConsolidatedInvoice(truckData)}
                            className="h-8 px-3 text-cyan-400 hover:bg-cyan-900/30 border border-cyan-600"
                            title="Print Consolidated Receipt"
                          >
                            <Printer className="w-4 h-4 mr-1" />
                            Print
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                
                {/* Consolidated Total Summary */}
                <div className="mt-4 p-4 bg-slate-700/50 rounded-lg">
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-slate-400 text-xs">Total Trucks</p>
                      <p className="text-white font-bold text-xl">{consolidatedTruckList.length}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs">Total Net Payable</p>
                      <p className="text-white font-bold text-xl">
                        ₹{consolidatedTruckList.reduce((sum, t) => sum + t.total_net, 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs">Total Paid</p>
                      <p className="text-emerald-400 font-bold text-xl">
                        ₹{consolidatedTruckList.reduce((sum, t) => sum + t.total_paid, 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs">Total Balance</p>
                      <p className="text-red-400 font-bold text-xl">
                        ₹{consolidatedTruckList.reduce((sum, t) => sum + t.total_balance, 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <Truck className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Koi truck payment nahi hai</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Agent Payments Table */}
      {activePaymentTab === "agent" && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-amber-400 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Agent/Mandi Payments (Target Based)
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  onClick={handleExportAgentExcel}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-1" />
                  Excel
                </Button>
                <Button
                  onClick={handleExportAgentPDF}
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <FileText className="w-4 h-4 mr-1" />
                  PDF
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {agentPayments.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-600">
                      <TableHead className="text-slate-300">Mandi</TableHead>
                      <TableHead className="text-slate-300">Agent</TableHead>
                      <TableHead className="text-slate-300 text-right">Target</TableHead>
                      <TableHead className="text-slate-300 text-right">Cutting</TableHead>
                      <TableHead className="text-slate-300 text-right">Rates</TableHead>
                      <TableHead className="text-slate-300 text-right">Total Amount</TableHead>
                      <TableHead className="text-slate-300 text-right">Achieved</TableHead>
                      <TableHead className="text-slate-300 text-right">Paid</TableHead>
                      <TableHead className="text-slate-300 text-right">Balance</TableHead>
                      <TableHead className="text-slate-300">Status</TableHead>
                      {user.role === 'admin' && <TableHead className="text-slate-300">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentPayments.map((payment, idx) => (
                      <TableRow key={idx} className="border-slate-700 hover:bg-slate-700/50">
                        <TableCell className="text-white font-semibold">{payment.mandi_name}</TableCell>
                        <TableCell className="text-slate-300 text-xs">{payment.agent_name}</TableCell>
                        <TableCell className="text-amber-400 text-right">{payment.target_qntl} QNTL</TableCell>
                        <TableCell className="text-right text-xs">
                          <span className="text-slate-400">{payment.cutting_qntl} QNTL</span>
                          <span className="text-slate-500 ml-1">({payment.cutting_percent}%)</span>
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          <span className="text-blue-400">₹{payment.base_rate}</span>
                          <span className="text-slate-500"> + </span>
                          <span className="text-purple-400">₹{payment.cutting_rate}</span>
                        </TableCell>
                        <TableCell className="text-right text-white font-semibold">₹{payment.total_amount}</TableCell>
                        <TableCell className="text-right">
                          <span className={payment.is_target_complete ? 'text-emerald-400' : 'text-amber-400'}>
                            {payment.achieved_qntl} QNTL
                          </span>
                          {payment.is_target_complete && <CheckCircle className="w-3 h-3 inline ml-1 text-emerald-400" />}
                        </TableCell>
                        <TableCell className="text-right text-emerald-400">₹{payment.paid_amount}</TableCell>
                        <TableCell className="text-right text-red-400 font-semibold">₹{payment.balance_amount}</TableCell>
                        <TableCell>{getStatusBadge(payment.status)}</TableCell>
                        {user.role === 'admin' && (
                          <TableCell>
                            <div className="flex gap-1">
                              {payment.status !== 'paid' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => { setSelectedItem(payment); setShowPaymentDialog(true); }}
                                    className="h-7 px-2 text-emerald-400 hover:bg-emerald-900/30"
                                    title="Make Payment"
                                  >
                                    <IndianRupee className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleMarkPaid(payment)}
                                    className="h-7 px-2 text-amber-400 hover:bg-amber-900/30"
                                    title="Mark Paid"
                                  >
                                    <CheckCircle className="w-3 h-3" />
                                  </Button>
                                </>
                              )}
                              {payment.status === 'paid' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleUndoPaid(payment)}
                                  className="h-7 px-2 text-red-400 hover:bg-red-900/30"
                                  title="Undo Paid"
                                >
                                  <Undo2 className="w-3 h-3" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleViewHistory(payment)}
                                className="h-7 px-2 text-purple-400 hover:bg-purple-900/30"
                                title="Payment History"
                              >
                                <History className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handlePrintAgentInvoice(payment)}
                                className="h-7 px-2 text-cyan-400 hover:bg-cyan-900/30"
                                title="Print Receipt"
                              >
                                <Printer className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Koi mandi target set nahi hai</p>
                <p className="text-xs mt-1">Pehle Dashboard mein Mandi Target set karein</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <History className="w-5 h-5" />
              Payment History
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-slate-300 text-sm border-b border-slate-600 pb-2">
              {activePaymentTab === "truck" 
                ? `Truck: ${selectedItem?.truck_no}` 
                : `Mandi: ${selectedItem?.mandi_name}`}
            </p>
            {paymentHistory.length > 0 ? (
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                {paymentHistory.map((record, idx) => (
                  <div 
                    key={idx} 
                    className={`p-3 rounded-lg border ${
                      record.amount < 0 
                        ? 'bg-red-900/20 border-red-600/50' 
                        : 'bg-slate-700/50 border-slate-600'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className={`font-bold ${record.amount < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                          {record.amount < 0 ? '' : '+'}₹{Math.abs(record.amount).toLocaleString()}
                        </p>
                        <p className="text-slate-400 text-xs">{record.note || 'Payment'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-slate-400 text-xs">
                          {new Date(record.date).toLocaleDateString('hi-IN')}
                        </p>
                        <p className="text-slate-500 text-xs">by {record.by}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-center py-4">Koi payment record nahi hai</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rate Dialog */}
      <Dialog open={showRateDialog} onOpenChange={setShowRateDialog}>
        <DialogContent className="max-w-sm bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-amber-400">Rate Set Karein</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-slate-300 text-sm">
              {activePaymentTab === "truck" 
                ? `Truck: ${selectedItem?.truck_no}` 
                : `Agent: ${selectedItem?.agent_name}`}
            </p>
            <div>
              <Label className="text-slate-300">Rate per QNTL (₹)</Label>
              <Input
                type="number"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                placeholder="32"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowRateDialog(false)} className="border-slate-600 text-slate-300">
                Cancel
              </Button>
              <Button onClick={handleSetRate} className="bg-amber-500 hover:bg-amber-600 text-slate-900">
                Save Rate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-sm bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-amber-400">Payment Karein</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-slate-700/50 rounded-lg">
              <p className="text-slate-300 text-sm">
                {activePaymentTab === "truck" 
                  ? `Truck: ${selectedItem?.truck_no}` 
                  : `Agent: ${selectedItem?.agent_name}`}
              </p>
              <p className="text-white font-semibold">
                Balance: ₹{selectedItem?.balance_amount || 0}
              </p>
            </div>
            <div>
              <Label className="text-slate-300">Payment Amount (₹)</Label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="Enter amount"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div>
              <Label className="text-slate-300">Note (Optional)</Label>
              <Input
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="Payment note..."
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowPaymentDialog(false)} className="border-slate-600 text-slate-300">
                Cancel
              </Button>
              <Button onClick={handleMakePayment} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <IndianRupee className="w-4 h-4 mr-1" />
                Pay
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
  const [activeTab, setActiveTab] = useState("entries"); // "entries", "dashboard", "payments", "settings"

  // Branding state
  const [branding, setBranding] = useState({ company_name: "NAVKAR AGRO", tagline: "Mill Entry System" });
  const [brandingForm, setBrandingForm] = useState({ company_name: "", tagline: "" });

  // Suggestions state
  const [truckSuggestions, setTruckSuggestions] = useState([]);
  const [agentSuggestions, setAgentSuggestions] = useState([]);
  const [mandiSuggestions, setMandiSuggestions] = useState([]);

  // Filter state - default to current KMS year
  const [filters, setFilters] = useState({
    truck_no: "",
    rst_no: "",
    tp_no: "",
    agent_name: "",
    mandi_name: "",
    kms_year: CURRENT_KMS_YEAR,
    season: "",
    date_from: "",
    date_to: ""
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  
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
  }, [fetchEntries, fetchTotals, fetchSuggestions]);

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
        setBranding(response.data);
        setBrandingForm(response.data);
      } catch (error) {
        console.error("Branding fetch error:", error);
      }
    };
    fetchBranding();
  }, []);

  // Update branding
  const handleUpdateBranding = async () => {
    try {
      const response = await axios.put(
        `${API}/branding?username=${user.username}&role=${user.role}`,
        brandingForm
      );
      if (response.data.success) {
        setBranding(brandingForm);
        toast.success("Branding update ho gaya!");
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Branding update mein error");
    }
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Don't trigger shortcuts when typing in input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }

      // Alt + N: New Entry (open form)
      if (e.altKey && e.key === 'n') {
        e.preventDefault();
        setActiveTab("entries");
        setIsDialogOpen(true);
        setEditingId(null);
        setFormData(initialFormState);
        toast.info("New Entry Form (Alt+N)");
      }
      // Alt + E: Go to Entries tab
      if (e.altKey && e.key === 'e') {
        e.preventDefault();
        setActiveTab("entries");
        toast.info("Entries Tab (Alt+E)");
      }
      // Alt + D: Go to Dashboard tab
      if (e.altKey && e.key === 'd') {
        e.preventDefault();
        setActiveTab("dashboard");
        toast.info("Dashboard Tab (Alt+D)");
      }
      // Alt + P: Go to Payments tab
      if (e.altKey && e.key === 'p') {
        e.preventDefault();
        setActiveTab("payments");
        toast.info("Payments Tab (Alt+P)");
      }
      // Alt + R: Refresh data
      if (e.altKey && e.key === 'r') {
        e.preventDefault();
        fetchEntries();
        fetchTotals();
        toast.info("Data Refreshed (Alt+R)");
      }
      // Alt + F: Focus on filter
      if (e.altKey && e.key === 'f') {
        e.preventDefault();
        setShowFilters(true);
        toast.info("Filters Open (Alt+F)");
      }
      // Escape: Close form/dialogs
      if (e.key === 'Escape') {
        setIsDialogOpen(false);
        setShowFilters(false);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [fetchEntries, fetchTotals]);

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
            @page { size: A4 landscape; margin: 8mm; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: Arial, sans-serif; 
              font-size: 7px;
              background: #f8fafc;
            }
            .container {
              background: white;
              padding: 8px;
              border-radius: 4px;
            }
            .header {
              background: linear-gradient(135deg, #d97706, #b45309);
              color: white;
              padding: 8px 12px;
              border-radius: 4px 4px 0 0;
              text-align: center;
              margin-bottom: 6px;
            }
            .header h1 { 
              font-size: 14px; 
              margin-bottom: 2px;
              text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
            }
            .header p { font-size: 9px; opacity: 0.9; }
            table { 
              width: 100%; 
              border-collapse: collapse;
              font-size: 6.5px;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            th { 
              background: linear-gradient(180deg, #1e293b, #0f172a);
              color: white; 
              padding: 4px 2px;
              font-weight: bold;
              font-size: 6.5px;
              text-transform: uppercase;
              letter-spacing: 0.3px;
            }
            td { 
              padding: 3px 2px;
              border: 1px solid #e2e8f0;
            }
            tr:nth-child(even) { background-color: #f1f5f9; }
            tr:hover { background-color: #e0f2fe; }
            .totals { 
              background: linear-gradient(180deg, #fef3c7, #fde68a) !important; 
              font-weight: bold;
              font-size: 7px;
            }
            .totals td { border-top: 2px solid #d97706; }
            .qntl { background-color: #d1fae5 !important; color: #065f46; font-weight: bold; }
            .gunny { background-color: #dbeafe !important; color: #1e40af; }
            .final { background-color: #fde68a !important; color: #92400e; font-weight: bold; }
            .cash { background-color: #fce7f3 !important; color: #9d174d; }
            .right { text-align: right; }
            .center { text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>NAVKAR AGRO - JOLKO, KESINGA</h1>
              <p>KMS: ${filters.kms_year || "All"} | ${filters.season || "All Seasons"} | Generated: ${new Date().toLocaleDateString('en-IN')}</p>
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
                  <th>G.Dep</th>
                  <th>GBW</th>
                  <th>Mill W</th>
                  <th>M%</th>
                  <th>M.Cut</th>
                  <th>C%</th>
                  <th>D/D/P</th>
                  <th>Final W</th>
                  <th>G.Iss</th>
                  <th>Cash</th>
                  <th>Diesel</th>
                </tr>
              </thead>
              <tbody>
                ${entries.map(entry => `
                  <tr>
                    <td>${entry.date?.substring(5) || ''}</td>
                    <td>${entry.truck_no}</td>
                    <td>${entry.agent_name}</td>
                    <td>${entry.mandi_name}</td>
                    <td class="qntl right">${entry.qntl?.toFixed(2)}</td>
                    <td class="right">${entry.bag}</td>
                    <td class="gunny right">${entry.g_deposite || 0}</td>
                    <td class="right">${entry.gbw_cut?.toFixed(0)}</td>
                    <td class="right">${(entry.mill_w / 100)?.toFixed(2)}</td>
                    <td class="center">${entry.moisture || 0}</td>
                    <td class="right">${((entry.moisture_cut || 0) / 100)?.toFixed(2)}</td>
                    <td class="center">${entry.cutting_percent}</td>
                    <td class="right">${entry.disc_dust_poll || 0}</td>
                    <td class="final right">${(entry.final_w / 100)?.toFixed(2)}</td>
                    <td class="right">${entry.g_issued || 0}</td>
                    <td class="cash right">${entry.cash_paid || 0}</td>
                    <td class="cash right">${entry.diesel_paid || 0}</td>
                  </tr>
                `).join('')}
                <tr class="totals">
                  <td colspan="4"><strong>TOTAL (${entries.length} entries)</strong></td>
                  <td class="qntl right">${totals.total_qntl?.toFixed(2)}</td>
                  <td class="right">${totals.total_bag}</td>
                  <td class="gunny right">${totals.total_g_deposite || 0}</td>
                  <td class="right">${totals.total_gbw_cut?.toFixed(0)}</td>
                  <td class="right">${(totals.total_mill_w / 100)?.toFixed(2)}</td>
                  <td class="center">-</td>
                  <td class="center">-</td>
                  <td class="center">-</td>
                  <td class="right">${totals.total_disc_dust_poll || 0}</td>
                  <td class="final right">${(totals.total_final_w / 100)?.toFixed(2)}</td>
                  <td class="right">${totals.total_g_issued || 0}</td>
                  <td class="cash right">${totals.total_cash_paid || 0}</td>
                  <td class="cash right">${totals.total_diesel_paid || 0}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
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
      rst_no: "",
      tp_no: "",
      agent_name: "", 
      mandi_name: "", 
      kms_year: CURRENT_KMS_YEAR,
      season: "",
      date_from: "",
      date_to: ""
    });
  };

  const hasActiveFilters = filters.truck_no || filters.rst_no || filters.tp_no || filters.agent_name || filters.mandi_name || filters.season || filters.date_from || filters.date_to;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <Toaster position="top-right" richColors />
      
      {/* Header */}
      <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-amber-400" data-testid="app-title">
                {branding.company_name}
              </h1>
              <p className="text-slate-400 text-sm">{branding.tagline}</p>
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
            <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-white">
              <DialogHeader>
                <DialogTitle className="text-amber-400 flex items-center gap-2">
                  <Keyboard className="w-5 h-5" />
                  Keyboard Shortcuts
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">Alt + N</kbd>
                    <span className="text-slate-300">New Entry</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">Alt + E</kbd>
                    <span className="text-slate-300">Entries Tab</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">Alt + D</kbd>
                    <span className="text-slate-300">Dashboard</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">Alt + P</kbd>
                    <span className="text-slate-300">Payments</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">Alt + R</kbd>
                    <span className="text-slate-300">Refresh Data</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">Alt + F</kbd>
                    <span className="text-slate-300">Open Filters</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">Esc</kbd>
                    <span className="text-slate-300">Close Dialogs</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-700">
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Autocomplete fields mein Arrow keys aur Enter use karein
                  </p>
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
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
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
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === "dashboard" ? (
          <Dashboard filters={filters} user={user} />
        ) : activeTab === "payments" ? (
          <Payments filters={filters} user={user} />
        ) : activeTab === "settings" ? (
          /* Settings Page - Branding */
          <Card className="bg-slate-800 border-slate-700 max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-purple-400 flex items-center gap-2">
                <Key className="w-5 h-5" />
                Settings - Branding
              </CardTitle>
              <p className="text-slate-400 text-sm">
                Yahan se app ka naam aur tagline change karein. Ye header, footer, aur exports mein dikhega.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-slate-300 text-lg">Company Name / कंपनी का नाम</Label>
                  <Input
                    value={brandingForm.company_name}
                    onChange={(e) => setBrandingForm(prev => ({ ...prev, company_name: e.target.value }))}
                    placeholder="Enter company name"
                    className="bg-slate-700 border-slate-600 text-white text-xl font-bold mt-2"
                    data-testid="branding-company-name"
                  />
                  <p className="text-xs text-slate-500 mt-1">Example: NAVKAR AGRO, XYZ TRADERS, ABC MILL</p>
                </div>
                
                <div>
                  <Label className="text-slate-300 text-lg">Tagline / विवरण</Label>
                  <Input
                    value={brandingForm.tagline}
                    onChange={(e) => setBrandingForm(prev => ({ ...prev, tagline: e.target.value }))}
                    placeholder="Enter tagline"
                    className="bg-slate-700 border-slate-600 text-white mt-2"
                    data-testid="branding-tagline"
                  />
                  <p className="text-xs text-slate-500 mt-1">Example: JOLKO, KESINGA - Mill Entry System</p>
                </div>
              </div>
              
              {/* Preview */}
              <div className="border border-slate-600 rounded-lg p-4 bg-slate-900/50">
                <p className="text-xs text-slate-400 mb-2">Preview / झलक:</p>
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-amber-400">{brandingForm.company_name || "Company Name"}</h2>
                  <p className="text-slate-400">{brandingForm.tagline || "Tagline"}</p>
                </div>
              </div>
              
              <Button
                onClick={handleUpdateBranding}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                data-testid="save-branding-btn"
              >
                Save Branding / ब्रांडिंग सेव करें
              </Button>
              
              <div className="text-center text-slate-500 text-xs">
                <p>⚠️ Changes सभी जगह apply होंगे - Header, Print Receipts, Excel/PDF Exports</p>
              </div>
            </CardContent>
          </Card>
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
                    <TableHead className="text-slate-300">RST No.</TableHead>
                    <TableHead className="text-slate-300">TP No.</TableHead>
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
                      <TableCell colSpan={17} className="text-center text-slate-400 py-8">
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
                        <TableCell className="text-slate-300 text-sm">{entry.rst_no || '-'}</TableCell>
                        <TableCell className="text-slate-300 text-sm">{entry.tp_no || '-'}</TableCell>
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
          </>
        )}
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
