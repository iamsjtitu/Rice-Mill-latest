import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, RefreshCw, FileText, Send, Users, Scale, Truck, Clock, CheckCircle, Download } from "lucide-react";
import { useMessagingEnabled } from "../hooks/useMessagingEnabled";
import { SendToGroupDialog } from "./SendToGroupDialog";
import { downloadFile } from "../utils/download";

const _isElectron = typeof window !== "undefined" && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? "" : (process.env.REACT_APP_BACKEND_URL || "");
const API = `${BACKEND_URL}/api`;

const fmtWt = (w) => w ? `${Number(w).toLocaleString()} KG` : "0 KG";

export default function VehicleWeight({ filters }) {
  const { wa } = useMessagingEnabled();
  const [entries, setEntries] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [nextRst, setNextRst] = useState(1);
  const [secondWtDialog, setSecondWtDialog] = useState({ open: false, entry: null });
  const [secondWtValue, setSecondWtValue] = useState("");
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupText, setGroupText] = useState("");
  const [groupPdfUrl, setGroupPdfUrl] = useState("");

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    vehicle_no: "", party_name: "", farmer_name: "",
    product: "PADDY", trans_type: "Receive(Pur)",
    j_pkts: "", p_pkts: "", tot_pkts: "",
    first_wt: "", remark: ""
  });

  const kms = filters?.kms_year || "";

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, pendingRes, rstRes] = await Promise.all([
        axios.get(`${API}/vehicle-weight?kms_year=${kms}&limit=100`),
        axios.get(`${API}/vehicle-weight/pending?kms_year=${kms}`),
        axios.get(`${API}/vehicle-weight/next-rst?kms_year=${kms}`)
      ]);
      setEntries(entriesRes.data.entries || []);
      setPending(pendingRes.data.pending || []);
      setNextRst(rstRes.data.rst_no || 1);
    } catch (e) {
      toast.error("Data load error");
    }
    setLoading(false);
  }, [kms]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.vehicle_no) { toast.error("Vehicle No. daalen"); return; }
    if (!form.first_wt || Number(form.first_wt) <= 0) { toast.error("First Weight daalen"); return; }
    try {
      const res = await axios.post(`${API}/vehicle-weight`, { ...form, kms_year: kms });
      if (res.data.success) {
        toast.success(res.data.message);
        setShowForm(false);
        setForm({ date: new Date().toISOString().split("T")[0], vehicle_no: "", party_name: "", farmer_name: "", product: "PADDY", trans_type: "Receive(Pur)", j_pkts: "", p_pkts: "", tot_pkts: "", first_wt: "", remark: "" });
        fetchData();
      }
    } catch (e) { toast.error(e.response?.data?.detail || "Save error"); }
  };

  const handleSecondWt = async () => {
    if (!secondWtValue || Number(secondWtValue) <= 0) { toast.error("Second Weight daalen"); return; }
    const entry = secondWtDialog.entry;
    try {
      const res = await axios.put(`${API}/vehicle-weight/${entry.id}/second-weight`, { second_wt: secondWtValue });
      if (res.data.success) {
        toast.success(res.data.message);
        setSecondWtDialog({ open: false, entry: null });
        setSecondWtValue("");
        fetchData();
      }
    } catch (e) { toast.error(e.response?.data?.detail || "Update error"); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete karein?")) return;
    try {
      await axios.delete(`${API}/vehicle-weight/${id}`);
      toast.success("Deleted");
      fetchData();
    } catch (e) { toast.error("Delete error"); }
  };

  const handleSlipPdf = (entry) => {
    const url = `${API}/vehicle-weight/${entry.id}/slip-pdf`;
    if (_isElectron) { downloadFile(url, `WeightSlip_RST${entry.rst_no}.pdf`); }
    else { window.open(url, "_blank"); }
  };

  const handleSlipWA = async (entry) => {
    try {
      const text = `*Weight Slip - RST #${entry.rst_no}*\nVehicle: ${entry.vehicle_no}\nParty: ${entry.party_name}\nProduct: ${entry.product}\nFirst: ${entry.first_wt} KG\nSecond: ${entry.second_wt} KG\n*Net: ${entry.net_wt} KG*`;
      const res = await axios.post(`${API}/whatsapp/send-daily-report`, {
        report_text: text, pdf_url: `http://localhost:8001/api/vehicle-weight/${entry.id}/slip-pdf`,
        send_to_numbers: true, send_to_group: false
      });
      if (res.data.success) toast.success("WhatsApp bhej diya!");
      else toast.error(res.data.error || "WhatsApp fail");
    } catch (e) { toast.error(e.response?.data?.detail || "WhatsApp error"); }
  };

  const handleSlipGroup = (entry) => {
    setGroupText(`*Weight Slip - RST #${entry.rst_no}*\nVehicle: ${entry.vehicle_no}\nParty: ${entry.party_name}\nFirst: ${entry.first_wt} KG | Second: ${entry.second_wt} KG\n*Net: ${entry.net_wt} KG*`);
    setGroupPdfUrl(`/api/vehicle-weight/${entry.id}/slip-pdf`);
    setGroupDialogOpen(true);
  };

  return (
    <div className="space-y-4" data-testid="vehicle-weight-page">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Scale className="w-5 h-5 text-amber-400" />
          Vehicle Weight / वाहन तौल
        </h2>
        <div className="flex items-center gap-2">
          <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600" data-testid="vw-refresh">
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button onClick={() => setShowForm(true)} size="sm" className="bg-amber-600 hover:bg-amber-700" data-testid="vw-new-entry">
            <Plus className="w-4 h-4 mr-1" /> New Weight Entry
          </Button>
        </div>
      </div>

      {/* Pending Vehicles Banner */}
      {pending.length > 0 && (
        <Card className="bg-yellow-900/20 border-yellow-700/50" data-testid="vw-pending-banner">
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-yellow-400 text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" /> Pending Vehicles - Second Weight Baaki ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="flex flex-wrap gap-2">
              {pending.map(p => (
                <Button key={p.id} variant="outline" size="sm"
                  className="border-yellow-600 text-yellow-300 hover:bg-yellow-900/30 text-xs"
                  data-testid={`vw-pending-${p.id}`}
                  onClick={() => { setSecondWtDialog({ open: true, entry: p }); setSecondWtValue(""); }}>
                  <Truck className="w-3 h-3 mr-1" />
                  RST#{p.rst_no} | {p.vehicle_no} | {fmtWt(p.first_wt)}
                </Button>
              ))}
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
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">RST</TableHead>
                  <TableHead className="text-slate-400">Date</TableHead>
                  <TableHead className="text-slate-400">Vehicle</TableHead>
                  <TableHead className="text-slate-400">Party</TableHead>
                  <TableHead className="text-slate-400">Product</TableHead>
                  <TableHead className="text-slate-400">Bags</TableHead>
                  <TableHead className="text-slate-400 text-right">First Wt</TableHead>
                  <TableHead className="text-slate-400 text-right">Second Wt</TableHead>
                  <TableHead className="text-slate-400 text-right font-bold">Net Wt</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                  <TableHead className="text-slate-400 text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 && (
                  <TableRow><TableCell colSpan={11} className="text-center text-slate-500 py-8">Koi entry nahi. "New Weight Entry" click karein.</TableCell></TableRow>
                )}
                {entries.map(e => (
                  <TableRow key={e.id} className="border-slate-700/50 hover:bg-slate-700/30">
                    <TableCell className="text-amber-400 font-bold">#{e.rst_no}</TableCell>
                    <TableCell className="text-slate-300 text-sm">{e.date}</TableCell>
                    <TableCell className="text-white font-medium">{e.vehicle_no}</TableCell>
                    <TableCell className="text-slate-300">{e.party_name}</TableCell>
                    <TableCell className="text-slate-400 text-sm">{e.product}</TableCell>
                    <TableCell className="text-slate-400 text-sm">{e.tot_pkts || '-'}</TableCell>
                    <TableCell className="text-right text-blue-300">{fmtWt(e.first_wt)}</TableCell>
                    <TableCell className="text-right text-blue-300">{e.second_wt ? fmtWt(e.second_wt) : '-'}</TableCell>
                    <TableCell className="text-right font-bold text-lg text-green-400">{e.net_wt ? fmtWt(e.net_wt) : '-'}</TableCell>
                    <TableCell>
                      {e.status === "pending" ? (
                        <Badge variant="outline" className="border-yellow-600 text-yellow-400 text-xs">Pending</Badge>
                      ) : (
                        <Badge variant="outline" className="border-green-600 text-green-400 text-xs"><CheckCircle className="w-3 h-3 mr-1" />Done</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-center">
                        {e.status === "pending" && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-yellow-400 hover:bg-yellow-900/30"
                            data-testid={`vw-2nd-wt-${e.id}`}
                            onClick={() => { setSecondWtDialog({ open: true, entry: e }); setSecondWtValue(""); }}>
                            <Scale className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {e.status === "completed" && (
                          <>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-400 hover:text-white"
                              data-testid={`vw-pdf-${e.id}`} onClick={() => handleSlipPdf(e)}>
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                            {wa && <Button variant="ghost" size="sm" className="h-7 px-2 text-green-400"
                              data-testid={`vw-wa-${e.id}`} onClick={() => handleSlipWA(e)}>
                              <Send className="w-3.5 h-3.5" />
                            </Button>}
                            {wa && <Button variant="ghost" size="sm" className="h-7 px-2 text-teal-400"
                              data-testid={`vw-group-${e.id}`} onClick={() => handleSlipGroup(e)}>
                              <Users className="w-3.5 h-3.5" />
                            </Button>}
                          </>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-red-400 hover:text-red-300"
                          data-testid={`vw-del-${e.id}`} onClick={() => handleDelete(e.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* New Entry Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-lg" data-testid="vw-new-dialog">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <Scale className="w-5 h-5" /> New Weight Entry — RST #{nextRst}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-400 text-xs">Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="bg-slate-700 border-slate-600 text-white" data-testid="vw-date" />
              </div>
              <div>
                <Label className="text-slate-400 text-xs">Vehicle No. *</Label>
                <Input value={form.vehicle_no} onChange={e => setForm(p => ({ ...p, vehicle_no: e.target.value.toUpperCase() }))}
                  placeholder="OD 02 AB 1234" className="bg-slate-700 border-slate-600 text-white" data-testid="vw-vehicle" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-400 text-xs">Party Name</Label>
                <Input value={form.party_name} onChange={e => setForm(p => ({ ...p, party_name: e.target.value }))}
                  placeholder="Party" className="bg-slate-700 border-slate-600 text-white" data-testid="vw-party" />
              </div>
              <div>
                <Label className="text-slate-400 text-xs">Farmer Name</Label>
                <Input value={form.farmer_name} onChange={e => setForm(p => ({ ...p, farmer_name: e.target.value }))}
                  placeholder="Farmer" className="bg-slate-700 border-slate-600 text-white" data-testid="vw-farmer" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-slate-400 text-xs">Product</Label>
                <Select value={form.product} onValueChange={v => setForm(p => ({ ...p, product: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white" data-testid="vw-product">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 border-slate-600">
                    <SelectItem value="PADDY">PADDY</SelectItem>
                    <SelectItem value="RICE">RICE</SelectItem>
                    <SelectItem value="BHUSI">BHUSI</SelectItem>
                    <SelectItem value="KANDA">KANDA</SelectItem>
                    <SelectItem value="OTHER">OTHER</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-400 text-xs">Trans Type</Label>
                <Select value={form.trans_type} onValueChange={v => setForm(p => ({ ...p, trans_type: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white" data-testid="vw-trans">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 border-slate-600">
                    <SelectItem value="Receive(Pur)">Receive (Purchase)</SelectItem>
                    <SelectItem value="Dispatch(Sale)">Dispatch (Sale)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-400 text-xs">Total Bags</Label>
                <Input type="number" value={form.tot_pkts} onChange={e => setForm(p => ({ ...p, tot_pkts: e.target.value }))}
                  placeholder="0" className="bg-slate-700 border-slate-600 text-white" data-testid="vw-bags" />
              </div>
            </div>
            <div>
              <Label className="text-amber-400 text-sm font-bold">First Weight (KG) *</Label>
              <Input type="number" value={form.first_wt} onChange={e => setForm(p => ({ ...p, first_wt: e.target.value }))}
                placeholder="Enter weight in KG" className="bg-slate-700 border-slate-600 text-white text-lg font-bold h-12"
                data-testid="vw-first-wt" autoFocus />
            </div>
            <div>
              <Label className="text-slate-400 text-xs">Remark</Label>
              <Input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))}
                placeholder="Optional" className="bg-slate-700 border-slate-600 text-white" data-testid="vw-remark" />
            </div>
            <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold h-11" data-testid="vw-save-first">
              <Scale className="w-4 h-4 mr-2" /> Save First Weight — RST #{nextRst}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Second Weight Dialog */}
      <Dialog open={secondWtDialog.open} onOpenChange={(v) => setSecondWtDialog({ open: v, entry: v ? secondWtDialog.entry : null })}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-sm" data-testid="vw-second-dialog">
          <DialogHeader>
            <DialogTitle className="text-green-400 flex items-center gap-2">
              <Scale className="w-5 h-5" /> Second Weight
            </DialogTitle>
          </DialogHeader>
          {secondWtDialog.entry && (
            <div className="space-y-3">
              <div className="bg-slate-700/50 p-3 rounded-lg space-y-1 text-sm">
                <p className="text-white"><span className="text-slate-400">RST:</span> #{secondWtDialog.entry.rst_no}</p>
                <p className="text-white"><span className="text-slate-400">Vehicle:</span> {secondWtDialog.entry.vehicle_no}</p>
                <p className="text-white"><span className="text-slate-400">Party:</span> {secondWtDialog.entry.party_name}</p>
                <p className="text-blue-300 font-bold"><span className="text-slate-400">First Wt:</span> {fmtWt(secondWtDialog.entry.first_wt)}</p>
              </div>
              <div>
                <Label className="text-green-400 text-sm font-bold">Second Weight (KG) *</Label>
                <Input type="number" value={secondWtValue} onChange={e => setSecondWtValue(e.target.value)}
                  placeholder="Enter weight in KG" className="bg-slate-700 border-slate-600 text-white text-lg font-bold h-12"
                  data-testid="vw-second-wt-input" autoFocus />
              </div>
              {secondWtValue && Number(secondWtValue) > 0 && (
                <div className="bg-green-900/30 p-3 rounded-lg text-center">
                  <p className="text-green-400 text-xl font-bold" data-testid="vw-net-preview">
                    Net: {Math.abs(secondWtDialog.entry.first_wt - Number(secondWtValue)).toLocaleString()} KG
                  </p>
                </div>
              )}
              <Button onClick={handleSecondWt} className="w-full bg-green-600 hover:bg-green-700 font-bold h-11" data-testid="vw-save-second">
                <CheckCircle className="w-4 h-4 mr-2" /> Save Second Weight
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SendToGroupDialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen} text={groupText} pdfUrl={groupPdfUrl} />
    </div>
  );
}
