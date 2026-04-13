import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, FileText, AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import logger from "../utils/logger";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

export default function WeightDiscrepancy({ filters }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [agent, setAgent] = useState("");
  const [mandi, setMandi] = useState("");
  const [agentList, setAgentList] = useState([]);
  const [mandiList, setMandiList] = useState([]);

  useEffect(() => {
    axios.get(`${API}/suggestions/agents`).then(r => setAgentList(Array.isArray(r.data) ? r.data : r.data?.suggestions || [])).catch(() => {});
    axios.get(`${API}/suggestions/mandis`).then(r => setMandiList(Array.isArray(r.data) ? r.data : r.data?.suggestions || [])).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.kmsYear) params.set("kms_year", filters.kmsYear);
      if (filters.season) params.set("season", filters.season);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (agent) params.set("agent", agent);
      if (mandi) params.set("mandi", mandi);
      const { data: d } = await axios.get(`${API}/reports/weight-discrepancy?${params}`);
      setData(d);
    } catch (e) { logger.error(e); toast.error("Failed to load"); }
    setLoading(false);
  };

  const exportFile = (format) => {
    const params = new URLSearchParams();
    if (filters.kmsYear) params.set("kms_year", filters.kmsYear);
    if (filters.season) params.set("season", filters.season);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (agent) params.set("agent", agent);
    if (mandi) params.set("mandi", mandi);
    window.open(`${API}/reports/weight-discrepancy/${format}?${params}`, "_blank");
  };

  return (
    <div className="space-y-4" data-testid="weight-discrepancy-report">
      {/* Filters */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
            <div>
              <Label className="text-slate-600 text-xs mb-1 block font-medium">Date From</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="bg-white border-slate-300 text-slate-800 h-8 text-xs" data-testid="wd-date-from" />
            </div>
            <div>
              <Label className="text-slate-600 text-xs mb-1 block font-medium">Date To</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="bg-white border-slate-300 text-slate-800 h-8 text-xs" data-testid="wd-date-to" />
            </div>
            <div>
              <Label className="text-slate-600 text-xs mb-1 block font-medium">Agent</Label>
              <Select value={agent} onValueChange={v => setAgent(v === '_all' ? '' : v)} data-testid="wd-agent">
                <SelectTrigger className="bg-white border-slate-300 text-slate-800 h-8 text-xs">
                  <SelectValue placeholder="All Agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Agents</SelectItem>
                  {agentList.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-600 text-xs mb-1 block font-medium">Mandi</Label>
              <Select value={mandi} onValueChange={v => setMandi(v === '_all' ? '' : v)} data-testid="wd-mandi">
                <SelectTrigger className="bg-white border-slate-300 text-slate-800 h-8 text-xs">
                  <SelectValue placeholder="All Mandis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Mandis</SelectItem>
                  {mandiList.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={fetchData} disabled={loading} className="bg-amber-600 hover:bg-amber-500 text-white h-8 text-xs flex-1" data-testid="wd-search">
                <Search className="w-3 h-3 mr-1" /> {loading ? "..." : "Search"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardContent className="p-3 text-center">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider font-medium">Total Discrepancies</p>
              <p className="text-2xl font-black text-red-500 font-mono" data-testid="wd-total-count">{data.total_count}</p>
            </CardContent>
          </Card>
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardContent className="p-3 text-center">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider font-medium">Entries with TP Wt</p>
              <p className="text-2xl font-black text-amber-500 font-mono">{data.total_entries_with_tp}</p>
            </CardContent>
          </Card>
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardContent className="p-3 text-center">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider font-medium">Total Diff (QNTL)</p>
              <p className={`text-2xl font-black font-mono ${data.total_diff_qntl > 0 ? 'text-green-600' : 'text-red-500'}`} data-testid="wd-total-diff-q">{data.total_diff_qntl > 0 ? '+' : ''}{data.total_diff_qntl}</p>
            </CardContent>
          </Card>
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardContent className="p-3 text-center">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider font-medium">Total Diff (KG)</p>
              <p className={`text-2xl font-black font-mono ${data.total_diff_kg > 0 ? 'text-green-600' : 'text-red-500'}`}>{data.total_diff_kg > 0 ? '+' : ''}{data.total_diff_kg}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Export & Table */}
      {data && data.discrepancies.length > 0 && (
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="p-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" /> Weight Discrepancy ({data.total_count})
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => exportFile('excel')} className="h-7 text-xs border-green-600 text-green-600 hover:bg-green-50" data-testid="wd-export-excel">
                <FileSpreadsheet className="w-3 h-3 mr-1" /> Excel
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportFile('pdf')} className="h-7 text-xs border-red-500 text-red-500 hover:bg-red-50" data-testid="wd-export-pdf">
                <FileText className="w-3 h-3 mr-1" /> PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 hover:bg-transparent bg-slate-50">
                    <TableHead className="text-slate-500 text-[10px]">#</TableHead>
                    <TableHead className="text-slate-500 text-[10px]">Date</TableHead>
                    <TableHead className="text-slate-500 text-[10px]">Truck</TableHead>
                    <TableHead className="text-slate-500 text-[10px]">RST</TableHead>
                    <TableHead className="text-slate-500 text-[10px]">TP No</TableHead>
                    <TableHead className="text-slate-500 text-[10px]">Agent</TableHead>
                    <TableHead className="text-slate-500 text-[10px]">Mandi</TableHead>
                    <TableHead className="text-slate-500 text-[10px] text-right">TP Wt (Q)</TableHead>
                    <TableHead className="text-slate-500 text-[10px] text-right">QNTL</TableHead>
                    <TableHead className="text-slate-500 text-[10px] text-right">Diff (Q)</TableHead>
                    <TableHead className="text-slate-500 text-[10px] text-right">Diff (KG)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.discrepancies.map((d, i) => (
                    <TableRow key={i} className="border-slate-100 hover:bg-slate-50">
                      <TableCell className="text-slate-400 text-xs py-1.5 px-2">{i + 1}</TableCell>
                      <TableCell className="text-slate-700 text-xs py-1.5 px-2 whitespace-nowrap">{d.date}</TableCell>
                      <TableCell className="text-slate-700 text-xs py-1.5 px-2">{d.truck_no}</TableCell>
                      <TableCell className="text-slate-700 text-xs py-1.5 px-2">{d.rst_no}</TableCell>
                      <TableCell className="text-slate-700 text-xs py-1.5 px-2">{d.tp_no}</TableCell>
                      <TableCell className="text-slate-700 text-xs py-1.5 px-2">{d.agent_name}</TableCell>
                      <TableCell className="text-slate-700 text-xs py-1.5 px-2">{d.mandi_name}</TableCell>
                      <TableCell className="text-amber-600 text-xs py-1.5 px-2 text-right font-mono font-bold">{d.tp_weight}</TableCell>
                      <TableCell className="text-slate-700 text-xs py-1.5 px-2 text-right font-mono">{d.qntl}</TableCell>
                      <TableCell className={`text-xs py-1.5 px-2 text-right font-mono font-bold ${d.diff_qntl > 0 ? 'text-green-600' : 'text-red-500'}`}>{d.diff_qntl > 0 ? '+' : ''}{d.diff_qntl}</TableCell>
                      <TableCell className={`text-xs py-1.5 px-2 text-right font-mono font-bold ${d.diff_kg > 0 ? 'text-green-600' : 'text-red-500'}`}>{d.diff_kg > 0 ? '+' : ''}{d.diff_kg}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {data && data.discrepancies.length === 0 && (
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-green-600 font-semibold">Koi discrepancy nahi mili!</p>
            <p className="text-slate-500 text-xs mt-1">Sabhi TP Weight aur QNTL match kar rahe hain</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
