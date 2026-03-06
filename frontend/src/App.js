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
import { Label } from "@/components/ui/label";
import { Trash2, Edit, Plus, Calculator, RefreshCw, Download, Filter, X, FileSpreadsheet, FileText } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const initialFormState = {
  date: new Date().toISOString().split("T")[0],
  truck_no: "",
  agent_name: "",
  mandi_name: "",
  kg: "",
  bag: "",
  g_deposite: "",
  gbw_cut: "",
  plastic_bag: "",
  cutting_percent: "",
  g_issued: "",
  moisture: "",
  disc_dust_poll: "",
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

function App() {
  const [entries, setEntries] = useState([]);
  const [totals, setTotals] = useState({});
  const [formData, setFormData] = useState(initialFormState);
  const [editingId, setEditingId] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Suggestions state
  const [truckSuggestions, setTruckSuggestions] = useState([]);
  const [agentSuggestions, setAgentSuggestions] = useState([]);
  const [mandiSuggestions, setMandiSuggestions] = useState([]);

  // Filter state
  const [filters, setFilters] = useState({
    truck_no: "",
    agent_name: "",
    mandi_name: ""
  });
  const [showFilters, setShowFilters] = useState(false);

  // Calculated fields (auto-calculated from form data)
  const [calculatedFields, setCalculatedFields] = useState({
    qntl: 0,
    mill_w: 0,
    p_pkt_cut: 0,
    cutting: 0,
    final_w: 0,
  });

  // Auto-calculate fields when inputs change
  useEffect(() => {
    const kg = parseFloat(formData.kg) || 0;
    const gbw_cut = parseFloat(formData.gbw_cut) || 0;
    const disc_dust_poll = parseFloat(formData.disc_dust_poll) || 0;
    const plastic_bag = parseInt(formData.plastic_bag) || 0;
    const cutting_percent = parseFloat(formData.cutting_percent) || 0;

    // P.Pkt cut (0.5 kg per plastic bag)
    const p_pkt_cut = plastic_bag * 0.5;
    
    // Weight for cutting calculation
    const weight_for_cutting = kg - gbw_cut - p_pkt_cut;
    
    // Cutting based on percentage
    const cutting = (weight_for_cutting * cutting_percent) / 100;

    setCalculatedFields({
      qntl: (kg / 100).toFixed(2),
      mill_w: (kg - gbw_cut).toFixed(2),
      p_pkt_cut: p_pkt_cut.toFixed(2),
      cutting: cutting.toFixed(2),
      final_w: (kg - gbw_cut - p_pkt_cut - cutting - disc_dust_poll).toFixed(2),
    });
  }, [formData.kg, formData.gbw_cut, formData.disc_dust_poll, formData.plastic_bag, formData.cutting_percent]);

  // Auto-fill G.Deposite and GBW Cut when BAG changes
  useEffect(() => {
    if (formData.bag) {
      const bagCount = parseInt(formData.bag) || 0;
      setFormData(prev => ({
        ...prev,
        g_deposite: prev.g_deposite || bagCount.toString(),
        gbw_cut: bagCount.toString()  // 1 kg per bag auto cut
      }));
    }
  }, [formData.bag]);

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

  // Fetch mandis for selected agent
  const fetchMandisForAgent = async (agentName) => {
    try {
      const response = await axios.get(`${API}/agent-mandi/${encodeURIComponent(agentName)}/mandis`);
      if (response.data.mandis?.length > 0) {
        setMandiSuggestions(response.data.mandis);
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
        g_issued: parseFloat(formData.g_issued) || 0,
        moisture: parseFloat(formData.moisture) || 0,
        disc_dust_poll: parseFloat(formData.disc_dust_poll) || 0,
        cash_paid: parseFloat(formData.cash_paid) || 0,
        diesel_paid: parseFloat(formData.diesel_paid) || 0,
      };

      if (editingId) {
        await axios.put(`${API}/entries/${editingId}`, dataToSend);
        toast.success("Entry update ho gayi!");
      } else {
        await axios.post(`${API}/entries`, dataToSend);
        toast.success("Entry add ho gayi!");
      }

      setFormData(initialFormState);
      setEditingId(null);
      setIsDialogOpen(false);
      fetchEntries();
      fetchTotals();
      fetchSuggestions();
    } catch (error) {
      toast.error("Entry save karne mein error");
      console.error(error);
    }
  };

  const handleEdit = (entry) => {
    setFormData({
      date: entry.date,
      truck_no: entry.truck_no || "",
      agent_name: entry.agent_name || "",
      mandi_name: entry.mandi_name || "",
      kg: entry.kg?.toString() || "",
      bag: entry.bag?.toString() || "",
      g_deposite: entry.g_deposite?.toString() || "",
      gbw_cut: entry.gbw_cut?.toString() || "",
      plastic_bag: entry.plastic_bag?.toString() || "",
      cutting_percent: entry.cutting_percent?.toString() || "",
      g_issued: entry.g_issued?.toString() || "",
      moisture: entry.moisture?.toString() || "",
      disc_dust_poll: entry.disc_dust_poll?.toString() || "",
      cash_paid: entry.cash_paid?.toString() || "",
      diesel_paid: entry.diesel_paid?.toString() || "",
      remark: entry.remark || "",
    });
    setEditingId(entry.id);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Kya aap sure hain is entry ko delete karna chahte hain?")) {
      try {
        await axios.delete(`${API}/entries/${id}`);
        toast.success("Entry delete ho gayi!");
        fetchEntries();
        fetchTotals();
      } catch (error) {
        toast.error("Delete karne mein error");
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
    
    window.open(`${API}/export/excel?${params.toString()}`, '_blank');
    toast.success("Excel download ho raha hai!");
  };

  const handleExportPDF = () => {
    // Generate PDF using browser print
    const printContent = document.getElementById('entries-table');
    if (printContent) {
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>Navkar Agro - Mill Entries</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              h1 { color: #d97706; text-align: center; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 12px; }
              th { background-color: #1e293b; color: white; }
              .totals { background-color: #fef3c7; font-weight: bold; }
              @media print { body { -webkit-print-color-adjust: exact; } }
            </style>
          </head>
          <body>
            <h1>NAVKAR AGRO - Mill Entries</h1>
            <p>Date: ${new Date().toLocaleDateString()}</p>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Truck No</th>
                  <th>Agent</th>
                  <th>Mandi</th>
                  <th>KG</th>
                  <th>QNTL</th>
                  <th>BAG</th>
                  <th>Mill W</th>
                  <th>P.Pkt Cut</th>
                  <th>Cutting %</th>
                  <th>Cutting</th>
                  <th>Final W</th>
                  <th>Cash</th>
                </tr>
              </thead>
              <tbody>
                ${entries.map(entry => `
                  <tr>
                    <td>${entry.date}</td>
                    <td>${entry.truck_no}</td>
                    <td>${entry.agent_name}</td>
                    <td>${entry.mandi_name}</td>
                    <td>${entry.kg?.toLocaleString()}</td>
                    <td>${entry.qntl?.toFixed(2)}</td>
                    <td>${entry.bag}</td>
                    <td>${entry.mill_w?.toLocaleString()}</td>
                    <td>${entry.p_pkt_cut?.toFixed(2)}</td>
                    <td>${entry.cutting_percent}%</td>
                    <td>${entry.cutting?.toFixed(2)}</td>
                    <td>${entry.final_w?.toLocaleString()}</td>
                    <td>${entry.cash_paid?.toLocaleString()}</td>
                  </tr>
                `).join('')}
                <tr class="totals">
                  <td colspan="4">TOTAL</td>
                  <td>${totals.total_kg?.toLocaleString()}</td>
                  <td>${totals.total_qntl?.toFixed(2)}</td>
                  <td>${totals.total_bag}</td>
                  <td>${totals.total_mill_w?.toLocaleString()}</td>
                  <td>${totals.total_p_pkt_cut?.toFixed(2)}</td>
                  <td>-</td>
                  <td>${totals.total_cutting?.toFixed(2)}</td>
                  <td>${totals.total_final_w?.toLocaleString()}</td>
                  <td>${totals.total_cash_paid?.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
    toast.success("PDF generate ho raha hai!");
  };

  const clearFilters = () => {
    setFilters({ truck_no: "", agent_name: "", mandi_name: "" });
  };

  const hasActiveFilters = filters.truck_no || filters.agent_name || filters.mandi_name;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <Toaster position="top-right" richColors />
      
      {/* Header */}
      <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-amber-400" data-testid="app-title">
                NAVKAR AGRO
              </h1>
              <p className="text-slate-400 text-sm">JOLKO, KESINGA - Mill Entry System</p>
            </div>
            <div className="flex gap-2 flex-wrap">
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
                    {/* Basic Info with Auto-suggest */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

                    {/* Weight Inputs with Auto Calculations */}
                    <Card className="bg-slate-700/50 border-slate-600">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-amber-400 text-lg flex items-center gap-2">
                          <Calculator className="w-5 h-5" />
                          Weight & Auto Calculations
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
                          <Label className="text-cyan-400">G.Deposite (Auto from BAG)</Label>
                          <Input
                            type="number"
                            name="g_deposite"
                            value={formData.g_deposite}
                            onChange={handleInputChange}
                            className="bg-cyan-900/30 border-cyan-700 text-cyan-400"
                            data-testid="input-g-deposite"
                          />
                        </div>
                        <div>
                          <Label className="text-orange-400">GBW Cut (Auto: 1kg/bag)</Label>
                          <Input
                            type="number"
                            name="gbw_cut"
                            value={formData.gbw_cut}
                            onChange={handleInputChange}
                            placeholder="Auto from BAG"
                            className="bg-orange-900/30 border-orange-700 text-orange-400"
                            data-testid="input-gbw-cut"
                          />
                          <span className="text-xs text-slate-400">BAG × 1 kg</span>
                        </div>
                        <div>
                          <Label className="text-blue-400 font-semibold">Mill W. (Auto)</Label>
                          <Input
                            value={calculatedFields.mill_w}
                            readOnly
                            className="bg-blue-900/30 border-blue-700 text-blue-400 text-lg font-bold"
                            data-testid="calculated-mill-w"
                          />
                          <span className="text-xs text-slate-400">KG - GBW Cut</span>
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
                          <Label className="text-purple-400 font-semibold">Cutting (Auto)</Label>
                          <Input
                            value={calculatedFields.cutting}
                            readOnly
                            className="bg-purple-900/30 border-purple-700 text-purple-400 font-bold"
                            data-testid="calculated-cutting"
                          />
                          <span className="text-xs text-slate-400">(KG-GBW-P.Pkt) × %</span>
                        </div>
                        <div>
                          <Label className="text-slate-300">Disc/Dust/Poll</Label>
                          <Input
                            type="number"
                            name="disc_dust_poll"
                            value={formData.disc_dust_poll}
                            onChange={handleInputChange}
                            className="bg-slate-600 border-slate-500 text-white"
                            data-testid="input-disc-dust-poll"
                          />
                        </div>
                        <div>
                          <Label className="text-amber-400 font-semibold">Final W. (Auto)</Label>
                          <Input
                            value={calculatedFields.final_w}
                            readOnly
                            className="bg-amber-900/30 border-amber-700 text-amber-400 text-xl font-bold"
                            data-testid="calculated-final-w"
                          />
                          <span className="text-xs text-slate-400">KG - GBW - P.Pkt - Cut - Disc</span>
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
                        <Label className="text-slate-300">Moisture</Label>
                        <Input
                          type="number"
                          name="moisture"
                          value={formData.moisture}
                          onChange={handleInputChange}
                          className="bg-slate-700 border-slate-600 text-white"
                          data-testid="input-moisture"
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
                      <div className="col-span-2">
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <div className="bg-slate-700/50 p-3 rounded-lg">
                <p className="text-slate-400 text-xs">Total KG</p>
                <p className="text-white text-lg font-bold" data-testid="total-kg">
                  {totals.total_kg?.toLocaleString() || 0}
                </p>
              </div>
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
                <p className="text-blue-400 text-xs">Total Mill W.</p>
                <p className="text-blue-400 text-lg font-bold" data-testid="total-mill-w">
                  {totals.total_mill_w?.toLocaleString() || 0}
                </p>
              </div>
              <div className="bg-pink-900/30 p-3 rounded-lg border border-pink-700">
                <p className="text-pink-400 text-xs">P.Pkt Cut</p>
                <p className="text-pink-400 text-lg font-bold" data-testid="total-p-pkt-cut">
                  {totals.total_p_pkt_cut?.toFixed(2) || 0}
                </p>
              </div>
              <div className="bg-purple-900/30 p-3 rounded-lg border border-purple-700">
                <p className="text-purple-400 text-xs">Total Cutting</p>
                <p className="text-purple-400 text-lg font-bold" data-testid="total-cutting">
                  {totals.total_cutting?.toFixed(2) || 0}
                </p>
              </div>
              <div className="bg-amber-900/30 p-3 rounded-lg border border-amber-700">
                <p className="text-amber-400 text-xs">Total Final W.</p>
                <p className="text-amber-400 text-lg font-bold" data-testid="total-final-w">
                  {totals.total_final_w?.toLocaleString() || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Entries Table */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-amber-400 flex items-center justify-between">
              <span>Mill Entries ({entries.length})</span>
              {loading && <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto" id="entries-table">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-slate-700/50">
                    <TableHead className="text-slate-300">Date</TableHead>
                    <TableHead className="text-slate-300">Truck No.</TableHead>
                    <TableHead className="text-slate-300">Agent</TableHead>
                    <TableHead className="text-slate-300">Mandi</TableHead>
                    <TableHead className="text-slate-300 text-right">KG</TableHead>
                    <TableHead className="text-green-400 text-right">QNTL</TableHead>
                    <TableHead className="text-slate-300 text-right">BAG</TableHead>
                    <TableHead className="text-blue-400 text-right">Mill W.</TableHead>
                    <TableHead className="text-pink-400 text-right">P.Pkt</TableHead>
                    <TableHead className="text-purple-400 text-right">Cut %</TableHead>
                    <TableHead className="text-amber-400 text-right">Final W.</TableHead>
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
                        className="border-slate-700 hover:bg-slate-700/30"
                        data-testid={`entry-row-${entry.id}`}
                      >
                        <TableCell className="text-white">{entry.date}</TableCell>
                        <TableCell className="text-white font-mono">{entry.truck_no}</TableCell>
                        <TableCell className="text-white">{entry.agent_name}</TableCell>
                        <TableCell className="text-white">{entry.mandi_name}</TableCell>
                        <TableCell className="text-white text-right font-mono">
                          {entry.kg?.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-green-400 text-right font-mono font-bold">
                          {entry.qntl?.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-white text-right font-mono">
                          {entry.bag}
                        </TableCell>
                        <TableCell className="text-blue-400 text-right font-mono font-bold">
                          {entry.mill_w?.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-pink-400 text-right font-mono">
                          {entry.p_pkt_cut?.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-purple-400 text-right font-mono">
                          {entry.cutting_percent}%
                        </TableCell>
                        <TableCell className="text-amber-400 text-right font-mono font-bold">
                          {entry.final_w?.toLocaleString()}
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
                              className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 h-8 w-8 p-0"
                              data-testid={`edit-btn-${entry.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(entry.id)}
                              className="text-red-400 hover:text-red-300 hover:bg-red-900/30 h-8 w-8 p-0"
                              data-testid={`delete-btn-${entry.id}`}
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
          <p>Navkar Agro Mill Entry System - KG to Quintals Auto Conversion</p>
          <p className="text-xs mt-1">1 Quintal = 100 KG | P.Pkt = 0.50 kg/bag</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
