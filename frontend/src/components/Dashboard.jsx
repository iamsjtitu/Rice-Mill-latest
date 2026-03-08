import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, Edit, Calculator, Target, TrendingUp, TrendingDown, Users, IndianRupee, BarChart3, FileText, RefreshCw,
} from "lucide-react";

const BACKEND_URL = (typeof window !== 'undefined' && window.ELECTRON_API_URL) || process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const CURRENT_KMS_YEAR = `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`;

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
const SEASONS = ["Kharif", "Rabi"];

export const Dashboard = ({ filters, user }) => {
  const [agentTotals, setAgentTotals] = useState([]);
  const [mandiTargets, setMandiTargets] = useState([]);
  const [plData, setPlData] = useState(null);
  const [plLoading, setPlLoading] = useState(true);
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

  const fetchPLSummary = useCallback(async () => {
    try {
      setPlLoading(true);
      const params = new URLSearchParams();
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      const res = await axios.get(`${API}/reports/season-pnl?${params}`);
      setPlData(res.data);
    } catch { setPlData(null); }
    finally { setPlLoading(false); }
  }, [filters.kms_year, filters.season]);

  useEffect(() => {
    fetchDashboardData();
    fetchPLSummary();
  }, [fetchDashboardData, fetchPLSummary]);

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
          onClick={async () => {
            const params = new URLSearchParams();
            if (filters.kms_year) params.append('kms_year', filters.kms_year);
            if (filters.season) params.append('season', filters.season);
            const { downloadFile } = await import('../utils/download');
            downloadFile(`/api/export/summary-report-pdf?${params.toString()}`, 'summary_report.pdf');
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
                          ({target.target_qntl}×₹{target.base_rate ?? 10} + {target.cutting_qntl || 0}×₹{target.cutting_rate ?? 5})
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

export default Dashboard;
