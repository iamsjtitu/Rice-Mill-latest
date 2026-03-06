import { useState, useEffect, useCallback } from "react";
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
import { Trash2, Edit, Plus, Calculator, RefreshCw } from "lucide-react";

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
  cutting: "",
  total_wt: "",
  g_issued: "",
  moisture: "",
  disc_dust_poll: "",
  cash_paid: "",
  diesel_paid: "",
  remark: "",
  fc: "",
};

function App() {
  const [entries, setEntries] = useState([]);
  const [totals, setTotals] = useState({});
  const [formData, setFormData] = useState(initialFormState);
  const [editingId, setEditingId] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Calculated fields (auto-calculated from form data)
  const [calculatedFields, setCalculatedFields] = useState({
    qntl: 0,
    mill_w: 0,
    final_w: 0,
  });

  // Auto-calculate fields when kg, gbw_cut, disc_dust_poll, or cutting changes
  useEffect(() => {
    const kg = parseFloat(formData.kg) || 0;
    const gbw_cut = parseFloat(formData.gbw_cut) || 0;
    const disc_dust_poll = parseFloat(formData.disc_dust_poll) || 0;
    const cutting = parseFloat(formData.cutting) || 0;

    setCalculatedFields({
      qntl: (kg / 100).toFixed(2),
      mill_w: (kg - gbw_cut).toFixed(2),
      final_w: (kg - gbw_cut - disc_dust_poll - cutting).toFixed(2),
    });
  }, [formData.kg, formData.gbw_cut, formData.disc_dust_poll, formData.cutting]);

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/entries`);
      setEntries(response.data);
    } catch (error) {
      toast.error("Entries load karne mein error");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTotals = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/totals`);
      setTotals(response.data);
    } catch (error) {
      console.error("Totals fetch error:", error);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
    fetchTotals();
  }, [fetchEntries, fetchTotals]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
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
        cutting: parseFloat(formData.cutting) || 0,
        total_wt: parseFloat(formData.total_wt) || 0,
        g_issued: parseFloat(formData.g_issued) || 0,
        moisture: parseFloat(formData.moisture) || 0,
        disc_dust_poll: parseFloat(formData.disc_dust_poll) || 0,
        cash_paid: parseFloat(formData.cash_paid) || 0,
        diesel_paid: parseFloat(formData.diesel_paid) || 0,
        fc: parseFloat(formData.fc) || 0,
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
      cutting: entry.cutting?.toString() || "",
      total_wt: entry.total_wt?.toString() || "",
      g_issued: entry.g_issued?.toString() || "",
      moisture: entry.moisture?.toString() || "",
      disc_dust_poll: entry.disc_dust_poll?.toString() || "",
      cash_paid: entry.cash_paid?.toString() || "",
      diesel_paid: entry.diesel_paid?.toString() || "",
      remark: entry.remark || "",
      fc: entry.fc?.toString() || "",
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <Toaster position="top-right" richColors />
      
      {/* Header */}
      <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-amber-400" data-testid="app-title">
                NAVKAR AGRO
              </h1>
              <p className="text-slate-400 text-sm">JOLKO, KESINGA - Mill Entry System</p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => { fetchEntries(); fetchTotals(); }}
                variant="outline"
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
                data-testid="refresh-btn"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    onClick={openNewEntryDialog}
                    className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold"
                    data-testid="add-entry-btn"
                  >
                    <Plus className="w-4 h-4 mr-2" />
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
                    {/* Basic Info */}
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
                      <div>
                        <Label className="text-slate-300">Truck No.</Label>
                        <Input
                          name="truck_no"
                          value={formData.truck_no}
                          onChange={handleInputChange}
                          placeholder="OD00XX0000"
                          className="bg-slate-700 border-slate-600 text-white"
                          data-testid="input-truck-no"
                        />
                      </div>
                      <div>
                        <Label className="text-slate-300">Agent Name</Label>
                        <Input
                          name="agent_name"
                          value={formData.agent_name}
                          onChange={handleInputChange}
                          className="bg-slate-700 border-slate-600 text-white"
                          data-testid="input-agent-name"
                        />
                      </div>
                      <div>
                        <Label className="text-slate-300">Mandi Name</Label>
                        <Input
                          name="mandi_name"
                          value={formData.mandi_name}
                          onChange={handleInputChange}
                          className="bg-slate-700 border-slate-600 text-white"
                          data-testid="input-mandi-name"
                        />
                      </div>
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
                          <Label className="text-slate-300">G.Deposite</Label>
                          <Input
                            type="number"
                            name="g_deposite"
                            value={formData.g_deposite}
                            onChange={handleInputChange}
                            className="bg-slate-600 border-slate-500 text-white"
                            data-testid="input-g-deposite"
                          />
                        </div>
                        <div>
                          <Label className="text-slate-300">GBW Cut</Label>
                          <Input
                            type="number"
                            name="gbw_cut"
                            value={formData.gbw_cut}
                            onChange={handleInputChange}
                            className="bg-slate-600 border-slate-500 text-white"
                            data-testid="input-gbw-cut"
                          />
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
                          <Label className="text-slate-300">Cutting</Label>
                          <Input
                            type="number"
                            name="cutting"
                            value={formData.cutting}
                            onChange={handleInputChange}
                            className="bg-slate-600 border-slate-500 text-white"
                            data-testid="input-cutting"
                          />
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
                        <div className="col-span-2">
                          <Label className="text-amber-400 font-semibold">Final W. (Auto)</Label>
                          <Input
                            value={calculatedFields.final_w}
                            readOnly
                            className="bg-amber-900/30 border-amber-700 text-amber-400 text-xl font-bold"
                            data-testid="calculated-final-w"
                          />
                          <span className="text-xs text-slate-400">KG - GBW Cut - Disc/Dust/Poll - Cutting</span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Other Fields */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <Label className="text-slate-300">Total WT.</Label>
                        <Input
                          type="number"
                          name="total_wt"
                          value={formData.total_wt}
                          onChange={handleInputChange}
                          className="bg-slate-700 border-slate-600 text-white"
                          data-testid="input-total-wt"
                        />
                      </div>
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
                      <div>
                        <Label className="text-slate-300">F.C (Final Cost)</Label>
                        <Input
                          type="number"
                          name="fc"
                          value={formData.fc}
                          onChange={handleInputChange}
                          className="bg-slate-700 border-slate-600 text-white"
                          data-testid="input-fc"
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
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Totals Summary */}
        <Card className="bg-slate-800/50 border-slate-700 mb-6">
          <CardHeader>
            <CardTitle className="text-amber-400">Total Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              <div className="bg-slate-700/50 p-3 rounded-lg">
                <p className="text-slate-400 text-xs">Total KG</p>
                <p className="text-white text-xl font-bold" data-testid="total-kg">
                  {totals.total_kg?.toLocaleString() || 0}
                </p>
              </div>
              <div className="bg-green-900/30 p-3 rounded-lg border border-green-700">
                <p className="text-green-400 text-xs">Total QNTL</p>
                <p className="text-green-400 text-xl font-bold" data-testid="total-qntl">
                  {totals.total_qntl?.toFixed(2) || 0}
                </p>
              </div>
              <div className="bg-slate-700/50 p-3 rounded-lg">
                <p className="text-slate-400 text-xs">Total BAG</p>
                <p className="text-white text-xl font-bold" data-testid="total-bag">
                  {totals.total_bag?.toLocaleString() || 0}
                </p>
              </div>
              <div className="bg-blue-900/30 p-3 rounded-lg border border-blue-700">
                <p className="text-blue-400 text-xs">Total Mill W.</p>
                <p className="text-blue-400 text-xl font-bold" data-testid="total-mill-w">
                  {totals.total_mill_w?.toLocaleString() || 0}
                </p>
              </div>
              <div className="bg-amber-900/30 p-3 rounded-lg border border-amber-700">
                <p className="text-amber-400 text-xs">Total Final W.</p>
                <p className="text-amber-400 text-xl font-bold" data-testid="total-final-w">
                  {totals.total_final_w?.toLocaleString() || 0}
                </p>
              </div>
              <div className="bg-slate-700/50 p-3 rounded-lg">
                <p className="text-slate-400 text-xs">Cash Paid</p>
                <p className="text-white text-xl font-bold" data-testid="total-cash-paid">
                  {totals.total_cash_paid?.toLocaleString() || 0}
                </p>
              </div>
              <div className="bg-slate-700/50 p-3 rounded-lg">
                <p className="text-slate-400 text-xs">Total F.C</p>
                <p className="text-white text-xl font-bold" data-testid="total-fc">
                  {totals.total_fc?.toLocaleString() || 0}
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
            <div className="overflow-x-auto">
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
                    <TableHead className="text-amber-400 text-right">Final W.</TableHead>
                    <TableHead className="text-slate-300 text-right">Cash</TableHead>
                    <TableHead className="text-slate-300 text-right">F.C</TableHead>
                    <TableHead className="text-slate-300 text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-slate-400 py-8">
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
                        <TableCell className="text-white">{entry.truck_no}</TableCell>
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
                        <TableCell className="text-amber-400 text-right font-mono font-bold">
                          {entry.final_w?.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-white text-right font-mono">
                          {entry.cash_paid?.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-white text-right font-mono">
                          {entry.fc?.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex gap-2 justify-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEdit(entry)}
                              className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/30"
                              data-testid={`edit-btn-${entry.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(entry.id)}
                              className="text-red-400 hover:text-red-300 hover:bg-red-900/30"
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
          <p className="text-xs mt-1">1 Quintal = 100 KG</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
