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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Trash2, Edit, Plus, RefreshCw, Filter, X } from "lucide-react";

const BACKEND_URL = (typeof window !== 'undefined' && window.ELECTRON_API_URL) || process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CURRENT_KMS_YEAR = (() => {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 9 ? `${y}-${(y + 1) % 100}` : `${y - 1}-${y % 100}`;
})();

const initialMillingForm = {
  date: new Date().toISOString().split('T')[0],
  rice_type: "parboiled",
  paddy_input_qntl: "",
  rice_percent: "",
  frk_percent: "",
  bran_percent: "",
  kunda_percent: "",
  broken_percent: "",
  kanki_percent: "",
  kms_year: CURRENT_KMS_YEAR,
  season: "Kharif",
  note: "",
};

const MillingTracker = ({ filters, user }) => {
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState(initialMillingForm);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [millingFilters, setMillingFilters] = useState({
    rice_type: "",
    date_from: "",
    date_to: "",
  });
  const [showFilters, setShowFilters] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.kms_year) params.append('kms_year', filters.kms_year);
      if (filters.season) params.append('season', filters.season);
      if (millingFilters.rice_type) params.append('rice_type', millingFilters.rice_type);
      if (millingFilters.date_from) params.append('date_from', millingFilters.date_from);
      if (millingFilters.date_to) params.append('date_to', millingFilters.date_to);

      const [entriesRes, summaryRes] = await Promise.all([
        axios.get(`${API}/milling-entries?${params.toString()}`),
        axios.get(`${API}/milling-summary?${params.toString()}`)
      ]);
      setEntries(entriesRes.data);
      setSummary(summaryRes.data);
    } catch (error) {
      console.error("Milling fetch error:", error);
      toast.error("Milling data load nahi hua");
    } finally {
      setLoading(false);
    }
  }, [filters.kms_year, filters.season, millingFilters]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Auto-calculate husk and totals in preview
  const paddy = parseFloat(formData.paddy_input_qntl) || 0;
  const ricePct = parseFloat(formData.rice_percent) || 0;
  const frkPct = parseFloat(formData.frk_percent) || 0;
  const branPct = parseFloat(formData.bran_percent) || 0;
  const kundaPct = parseFloat(formData.kunda_percent) || 0;
  const brokenPct = parseFloat(formData.broken_percent) || 0;
  const kankiPct = parseFloat(formData.kanki_percent) || 0;
  const usedPct = ricePct + frkPct + branPct + kundaPct + brokenPct + kankiPct;
  const huskPct = Math.max(0, 100 - usedPct);
  const outturnRatio = ricePct + frkPct;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        paddy_input_qntl: parseFloat(formData.paddy_input_qntl) || 0,
        rice_percent: parseFloat(formData.rice_percent) || 0,
        frk_percent: parseFloat(formData.frk_percent) || 0,
        bran_percent: parseFloat(formData.bran_percent) || 0,
        kunda_percent: parseFloat(formData.kunda_percent) || 0,
        broken_percent: parseFloat(formData.broken_percent) || 0,
        kanki_percent: parseFloat(formData.kanki_percent) || 0,
      };

      if (editingId) {
        await axios.put(`${API}/milling-entries/${editingId}?username=${user.username}&role=${user.role}`, payload);
        toast.success("Milling entry update ho gayi!");
      } else {
        await axios.post(`${API}/milling-entries?username=${user.username}&role=${user.role}`, payload);
        toast.success("Milling entry save ho gayi!");
      }

      setIsDialogOpen(false);
      setEditingId(null);
      setFormData(initialMillingForm);
      fetchEntries();
    } catch (error) {
      toast.error("Error: " + (error.response?.data?.detail || error.message));
    }
  };

  const handleEdit = (entry) => {
    setFormData({
      date: entry.date,
      rice_type: entry.rice_type,
      paddy_input_qntl: entry.paddy_input_qntl.toString(),
      rice_percent: entry.rice_percent.toString(),
      frk_percent: entry.frk_percent.toString(),
      bran_percent: entry.bran_percent.toString(),
      kunda_percent: entry.kunda_percent.toString(),
      broken_percent: entry.broken_percent.toString(),
      kanki_percent: entry.kanki_percent.toString(),
      kms_year: entry.kms_year,
      season: entry.season,
      note: entry.note || "",
    });
    setEditingId(entry.id);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Kya aap ye milling entry delete karna chahte hain?")) return;
    try {
      await axios.delete(`${API}/milling-entries/${id}?username=${user.username}&role=${user.role}`);
      toast.success("Milling entry delete ho gayi!");
      fetchEntries();
    } catch (error) {
      toast.error("Delete nahi hua: " + (error.response?.data?.detail || error.message));
    }
  };

  const openNewForm = () => {
    setFormData({ ...initialMillingForm, kms_year: filters.kms_year || CURRENT_KMS_YEAR, season: filters.season || "Kharif" });
    setEditingId(null);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-4" data-testid="milling-tracker">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-slate-400">Total Entries</p>
              <p className="text-xl font-bold text-amber-400" data-testid="milling-total-entries">{summary.total_entries}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-slate-400">Paddy Input (QNTL)</p>
              <p className="text-xl font-bold text-blue-400" data-testid="milling-total-paddy">{summary.total_paddy_qntl}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-slate-400">Rice (QNTL)</p>
              <p className="text-xl font-bold text-green-400" data-testid="milling-total-rice">{summary.total_rice_qntl}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-slate-400">CMR Delivery (QNTL)</p>
              <p className="text-xl font-bold text-emerald-400" data-testid="milling-total-cmr">{summary.total_cmr_qntl}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-slate-400">Avg Outturn %</p>
              <p className="text-xl font-bold text-purple-400" data-testid="milling-avg-outturn">{summary.avg_outturn_ratio}%</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-slate-400">Bran+Kunda (QNTL)</p>
              <p className="text-xl font-bold text-orange-400">{(summary.total_bran_qntl + summary.total_kunda_qntl).toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Type-wise Summary */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm text-amber-400">Parboiled (Usna)</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><span className="text-slate-400">Entries:</span> <span className="text-white font-medium">{summary.parboiled.count}</span></div>
                <div><span className="text-slate-400">Paddy:</span> <span className="text-white font-medium">{summary.parboiled.total_paddy_qntl} Q</span></div>
                <div><span className="text-slate-400">CMR:</span> <span className="text-white font-medium">{summary.parboiled.total_cmr_qntl} Q</span></div>
                <div><span className="text-slate-400">Rice:</span> <span className="text-white font-medium">{summary.parboiled.total_rice_qntl} Q</span></div>
                <div><span className="text-slate-400">FRK:</span> <span className="text-white font-medium">{summary.parboiled.total_frk_qntl} Q</span></div>
                <div><span className="text-slate-400">Outturn:</span> <span className="text-green-400 font-medium">{summary.parboiled.avg_outturn}%</span></div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm text-cyan-400">Raw (Arwa)</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><span className="text-slate-400">Entries:</span> <span className="text-white font-medium">{summary.raw.count}</span></div>
                <div><span className="text-slate-400">Paddy:</span> <span className="text-white font-medium">{summary.raw.total_paddy_qntl} Q</span></div>
                <div><span className="text-slate-400">CMR:</span> <span className="text-white font-medium">{summary.raw.total_cmr_qntl} Q</span></div>
                <div><span className="text-slate-400">Rice:</span> <span className="text-white font-medium">{summary.raw.total_rice_qntl} Q</span></div>
                <div><span className="text-slate-400">FRK:</span> <span className="text-white font-medium">{summary.raw.total_frk_qntl} Q</span></div>
                <div><span className="text-slate-400">Outturn:</span> <span className="text-green-400 font-medium">{summary.raw.avg_outturn}%</span></div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={openNewForm} className="bg-amber-500 hover:bg-amber-600 text-slate-900" size="sm" data-testid="milling-add-btn">
          <Plus className="w-4 h-4 mr-1" /> New Milling Entry
        </Button>
        <Button onClick={fetchEntries} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700" data-testid="milling-refresh-btn">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
        <Button
          onClick={() => setShowFilters(!showFilters)}
          variant="outline"
          size="sm"
          className={showFilters ? "border-amber-500 text-amber-400" : "border-slate-600 text-slate-300 hover:bg-slate-700"}
          data-testid="milling-filter-btn"
        >
          <Filter className="w-4 h-4 mr-1" /> Filter
        </Button>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-3">
            <div className="flex gap-3 flex-wrap items-end">
              <div>
                <Label className="text-xs text-slate-400">Rice Type</Label>
                <Select value={millingFilters.rice_type} onValueChange={(v) => setMillingFilters(p => ({ ...p, rice_type: v === "all" ? "" : v }))}>
                  <SelectTrigger className="w-36 bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="milling-filter-type">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="parboiled">Parboiled (Usna)</SelectItem>
                    <SelectItem value="raw">Raw (Arwa)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-400">Date From</Label>
                <Input
                  type="date"
                  value={millingFilters.date_from}
                  onChange={(e) => setMillingFilters(p => ({ ...p, date_from: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-36"
                  data-testid="milling-filter-date-from"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Date To</Label>
                <Input
                  type="date"
                  value={millingFilters.date_to}
                  onChange={(e) => setMillingFilters(p => ({ ...p, date_to: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-36"
                  data-testid="milling-filter-date-to"
                />
              </div>
              <Button onClick={() => setMillingFilters({ rice_type: "", date_from: "", date_to: "" })} variant="ghost" size="sm" className="text-slate-400 hover:text-white h-8">
                <X className="w-3 h-3 mr-1" /> Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entries Table */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700 hover:bg-transparent">
                  <TableHead className="text-slate-300 text-xs">Date</TableHead>
                  <TableHead className="text-slate-300 text-xs">Type</TableHead>
                  <TableHead className="text-slate-300 text-xs text-right">Paddy (Q)</TableHead>
                  <TableHead className="text-slate-300 text-xs text-right">Rice %</TableHead>
                  <TableHead className="text-slate-300 text-xs text-right">Rice (Q)</TableHead>
                  <TableHead className="text-slate-300 text-xs text-right">FRK %</TableHead>
                  <TableHead className="text-slate-300 text-xs text-right">FRK (Q)</TableHead>
                  <TableHead className="text-slate-300 text-xs text-right">CMR (Q)</TableHead>
                  <TableHead className="text-slate-300 text-xs text-right">Outturn %</TableHead>
                  <TableHead className="text-slate-300 text-xs text-right">Bran (Q)</TableHead>
                  <TableHead className="text-slate-300 text-xs text-right">Husk %</TableHead>
                  <TableHead className="text-slate-300 text-xs">Note</TableHead>
                  <TableHead className="text-slate-300 text-xs text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={13} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
                ) : entries.length === 0 ? (
                  <TableRow><TableCell colSpan={13} className="text-center text-slate-400 py-8" data-testid="milling-empty">Koi milling entry nahi hai. "New Milling Entry" se add karein.</TableCell></TableRow>
                ) : entries.map((entry) => (
                  <TableRow key={entry.id} className="border-slate-700 hover:bg-slate-750" data-testid={`milling-row-${entry.id}`}>
                    <TableCell className="text-white text-xs">{entry.date}</TableCell>
                    <TableCell className="text-xs">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${entry.rice_type === 'parboiled' ? 'bg-amber-500/20 text-amber-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                        {entry.rice_type === 'parboiled' ? 'Usna' : 'Arwa'}
                      </span>
                    </TableCell>
                    <TableCell className="text-blue-300 text-xs text-right font-medium">{entry.paddy_input_qntl}</TableCell>
                    <TableCell className="text-slate-300 text-xs text-right">{entry.rice_percent}%</TableCell>
                    <TableCell className="text-green-400 text-xs text-right font-medium">{entry.rice_qntl}</TableCell>
                    <TableCell className="text-slate-300 text-xs text-right">{entry.frk_percent}%</TableCell>
                    <TableCell className="text-green-300 text-xs text-right">{entry.frk_qntl}</TableCell>
                    <TableCell className="text-emerald-400 text-xs text-right font-bold">{entry.cmr_delivery_qntl}</TableCell>
                    <TableCell className="text-purple-400 text-xs text-right font-bold">{entry.outturn_ratio}%</TableCell>
                    <TableCell className="text-orange-300 text-xs text-right">{entry.bran_qntl}</TableCell>
                    <TableCell className="text-slate-400 text-xs text-right">{entry.husk_percent}%</TableCell>
                    <TableCell className="text-slate-400 text-xs max-w-[100px] truncate">{entry.note}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex gap-1 justify-center">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-400 hover:text-blue-300" onClick={() => handleEdit(entry)} data-testid={`milling-edit-${entry.id}`}>
                          <Edit className="w-3 h-3" />
                        </Button>
                        {user.role === 'admin' && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-300" onClick={() => handleDelete(entry.id)} data-testid={`milling-delete-${entry.id}`}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(v) => { setIsDialogOpen(v); if (!v) { setEditingId(null); setFormData(initialMillingForm); } }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto" data-testid="milling-form-dialog">
          <DialogHeader>
            <DialogTitle className="text-amber-400">{editingId ? "Edit Milling Entry" : "New Milling Entry"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Row 1: Date + Type */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Date / तारीख</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(p => ({ ...p, date: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-8 text-sm"
                  required
                  data-testid="milling-form-date"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Rice Type / चावल प्रकार</Label>
                <Select value={formData.rice_type} onValueChange={(v) => setFormData(p => ({ ...p, rice_type: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-8 text-sm" data-testid="milling-form-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parboiled">Parboiled (उसना)</SelectItem>
                    <SelectItem value="raw">Raw (अरवा)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Paddy Input */}
            <div>
              <Label className="text-xs text-slate-400">Paddy Input (QNTL) / धान इनपुट</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.paddy_input_qntl}
                onChange={(e) => setFormData(p => ({ ...p, paddy_input_qntl: e.target.value }))}
                placeholder="e.g. 100"
                className="bg-slate-700 border-slate-600 text-white h-8 text-sm"
                required
                data-testid="milling-form-paddy"
              />
            </div>

            {/* Output Percentages */}
            <div className="border border-slate-600 rounded p-3 space-y-2">
              <p className="text-xs text-amber-400 font-medium">Output Percentages / उत्पाद प्रतिशत</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px] text-slate-400">Rice % (चावल)</Label>
                  <Input type="number" step="0.01" value={formData.rice_percent} onChange={(e) => setFormData(p => ({ ...p, rice_percent: e.target.value }))}
                    placeholder="52" className="bg-slate-700 border-slate-600 text-white h-7 text-xs" data-testid="milling-form-rice-pct" />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400">FRK %</Label>
                  <Input type="number" step="0.01" value={formData.frk_percent} onChange={(e) => setFormData(p => ({ ...p, frk_percent: e.target.value }))}
                    placeholder="15" className="bg-slate-700 border-slate-600 text-white h-7 text-xs" data-testid="milling-form-frk-pct" />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400">Bran % (भूसी)</Label>
                  <Input type="number" step="0.01" value={formData.bran_percent} onChange={(e) => setFormData(p => ({ ...p, bran_percent: e.target.value }))}
                    placeholder="5" className="bg-slate-700 border-slate-600 text-white h-7 text-xs" data-testid="milling-form-bran-pct" />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400">Kunda % (कुंडा)</Label>
                  <Input type="number" step="0.01" value={formData.kunda_percent} onChange={(e) => setFormData(p => ({ ...p, kunda_percent: e.target.value }))}
                    placeholder="3" className="bg-slate-700 border-slate-600 text-white h-7 text-xs" data-testid="milling-form-kunda-pct" />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400">Broken % (टूटा)</Label>
                  <Input type="number" step="0.01" value={formData.broken_percent} onChange={(e) => setFormData(p => ({ ...p, broken_percent: e.target.value }))}
                    placeholder="2" className="bg-slate-700 border-slate-600 text-white h-7 text-xs" data-testid="milling-form-broken-pct" />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400">Kanki % (कंकी)</Label>
                  <Input type="number" step="0.01" value={formData.kanki_percent} onChange={(e) => setFormData(p => ({ ...p, kanki_percent: e.target.value }))}
                    placeholder="1" className="bg-slate-700 border-slate-600 text-white h-7 text-xs" data-testid="milling-form-kanki-pct" />
                </div>
              </div>
            </div>

            {/* Live Preview */}
            <div className="border border-slate-600 rounded p-3 bg-slate-900/50">
              <p className="text-xs text-green-400 font-medium mb-2">Live Preview / लाइव प्रीव्यू</p>
              <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between"><span className="text-slate-400">Rice:</span><span className="text-white">{(paddy * ricePct / 100).toFixed(2)} Q</span></div>
                <div className="flex justify-between"><span className="text-slate-400">FRK:</span><span className="text-white">{(paddy * frkPct / 100).toFixed(2)} Q</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Bran:</span><span className="text-white">{(paddy * branPct / 100).toFixed(2)} Q</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Kunda:</span><span className="text-white">{(paddy * kundaPct / 100).toFixed(2)} Q</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Broken:</span><span className="text-white">{(paddy * brokenPct / 100).toFixed(2)} Q</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Kanki:</span><span className="text-white">{(paddy * kankiPct / 100).toFixed(2)} Q</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Husk:</span><span className="text-yellow-300">{huskPct.toFixed(2)}% = {(paddy * huskPct / 100).toFixed(2)} Q</span></div>
                <div className="flex justify-between"><span className="text-slate-400">CMR:</span><span className="text-emerald-400 font-bold">{(paddy * outturnRatio / 100).toFixed(2)} Q</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Outturn:</span><span className={`font-bold ${outturnRatio >= 67 ? 'text-green-400' : outturnRatio >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{outturnRatio.toFixed(2)}%</span></div>
              </div>
              {usedPct > 100 && <p className="text-red-400 text-xs mt-1">Total percent 100% se zyada hai ({usedPct.toFixed(2)}%)</p>}
            </div>

            {/* KMS Year + Season + Note */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-[10px] text-slate-400">KMS Year</Label>
                <Input value={formData.kms_year} onChange={(e) => setFormData(p => ({ ...p, kms_year: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white h-7 text-xs" data-testid="milling-form-kms" />
              </div>
              <div>
                <Label className="text-[10px] text-slate-400">Season</Label>
                <Select value={formData.season} onValueChange={(v) => setFormData(p => ({ ...p, season: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-7 text-xs" data-testid="milling-form-season">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Kharif">Kharif</SelectItem>
                    <SelectItem value="Rabi">Rabi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-slate-400">Note</Label>
                <Input value={formData.note} onChange={(e) => setFormData(p => ({ ...p, note: e.target.value }))}
                  placeholder="Optional note" className="bg-slate-700 border-slate-600 text-white h-7 text-xs" data-testid="milling-form-note" />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-slate-900 flex-1" data-testid="milling-form-submit">
                {editingId ? "Update" : "Save Entry"}
              </Button>
              <Button type="button" variant="outline" className="border-slate-600 text-slate-300" onClick={() => setIsDialogOpen(false)} data-testid="milling-form-cancel">
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MillingTracker;
