import { useState, useEffect, useCallback } from "react";
import { fmtDate } from "@/utils/date";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit, Users, Calendar, IndianRupee, RefreshCw, Check, X, Clock, Sun, Calculator, Download, FileText } from "lucide-react";
import RoundOffInput from "./common/RoundOffInput";
import PaymentAccountSelect from "./common/PaymentAccountSelect";
import { useConfirm } from "./ConfirmProvider";
import { ShareFileViaWhatsApp } from "./common/ShareFileViaWhatsApp";
import { fetchAsBlob } from "@/utils/download";
import logger from "../utils/logger";
const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const API = (_isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '')) + '/api';

// ===== STAFF MASTER =====
const StaffMaster = ({ staff, fetchStaff }) => {
  const showConfirm = useConfirm();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", salary_type: "monthly", salary_amount: "" });

  const save = async () => {
    if (!form.name || !form.salary_amount) return toast.error("Name aur salary bharein");
    try {
      if (editId) {
        await axios.put(`${API}/staff/${editId}`, form);
        toast.success("Staff updated");
      } else {
        await axios.post(`${API}/staff`, form);
        toast.success("Staff added");
      }
      setShowAdd(false); setEditId(null);
      setForm({ name: "", salary_type: "monthly", salary_amount: "" });
      fetchStaff();
    } catch (e) { logger.error(e); toast.error("Error saving staff"); }
  };

  const remove = async (id) => {
    if (!await showConfirm("Deactivate", "Staff deactivate karein?")) return;
    await axios.delete(`${API}/staff/${id}`);
    toast.success("Staff deactivated"); fetchStaff();
  };

  return (
    <div className="space-y-3" data-testid="staff-master">
      <div className="flex justify-between items-center">
        <h3 className="text-sm text-slate-400">Staff List ({staff.length})</h3>
        <Button onClick={() => { setForm({ name: "", salary_type: "monthly", salary_amount: "" }); setEditId(null); setShowAdd(true); }}
          size="sm" className="bg-amber-500 hover:bg-amber-600 text-slate-900" data-testid="add-staff-btn">
          <Plus className="w-4 h-4 mr-1" /> Add Staff
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-700 text-slate-400">
            <th className="text-left py-2 px-3">Name</th>
            <th className="text-left py-2 px-3">Type</th>
            <th className="text-right py-2 px-3">Salary</th>
            <th className="text-right py-2 px-3">Per Day</th>
            <th className="text-center py-2 px-3">Actions</th>
          </tr></thead>
          <tbody>{staff.map(s => (
            <tr key={s.id} className="border-b border-slate-700/50 hover:bg-slate-800/50">
              <td className="py-2 px-3 text-white font-medium">{s.name}</td>
              <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded text-[10px] font-medium ${s.salary_type === 'monthly' ? 'bg-blue-900/40 text-blue-400' : 'bg-amber-900/40 text-amber-400'}`}>{s.salary_type === 'monthly' ? 'Monthly' : 'Weekly'}</span></td>
              <td className="py-2 px-3 text-right text-amber-400 font-semibold">₹{s.salary_amount?.toLocaleString('en-IN')}{s.salary_type === 'monthly' ? '/mo' : '/day'}</td>
              <td className="py-2 px-3 text-right text-slate-300">₹{s.salary_type === 'monthly' ? (s.salary_amount / 30).toFixed(0) : s.salary_amount}</td>
              <td className="py-2 px-3 text-center">
                <Button onClick={() => { setForm({ name: s.name, salary_type: s.salary_type, salary_amount: s.salary_amount }); setEditId(s.id); setShowAdd(true); }}
                  variant="ghost" size="sm" className="text-blue-400 h-7 px-2"><Edit className="w-3 h-3" /></Button>
                <Button onClick={() => remove(s.id)} variant="ghost" size="sm" className="text-red-400 h-7 px-2"><Trash2 className="w-3 h-3" /></Button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md" data-testid="staff-dialog">
          <DialogHeader><DialogTitle className="text-amber-400">{editId ? 'Edit' : 'Add'} Staff</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs text-slate-400">Name / नाम</Label>
              <Input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))}
                className="bg-slate-700 border-slate-600 text-white" data-testid="staff-name-input" /></div>
            <div><Label className="text-xs text-slate-400">Salary Type</Label>
              <Select value={form.salary_type} onValueChange={v => setForm(p => ({...p, salary_type: v}))}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white" data-testid="staff-type-select"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  <SelectItem value="monthly">Monthly / मासिक</SelectItem>
                  <SelectItem value="weekly">Weekly (Per Day) / दैनिक</SelectItem>
                </SelectContent>
              </Select></div>
            <div><Label className="text-xs text-slate-400">{form.salary_type === 'monthly' ? 'Monthly Salary (₹)' : 'Per Day Rate (₹)'}</Label>
              <Input type="number" value={form.salary_amount} onChange={e => setForm(p => ({...p, salary_amount: parseFloat(e.target.value) || ""}))}
                className="bg-slate-700 border-slate-600 text-white" data-testid="staff-salary-input" /></div>
            <Button onClick={save} className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900" data-testid="staff-save-btn">Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};


// ===== ATTENDANCE =====
const Attendance = ({ staff, filters }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(false);

  const fetchAttendance = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams({ date });
      const res = await axios.get(`${API}/staff/attendance?${p}`);
      const map = {};
      res.data.forEach(a => { map[a.staff_id] = a.status; });
      setRecords(map);
    } catch (e) { logger.error(e); toast.error("Attendance load nahi hua"); }
    finally { setLoading(false); }
  }, [date]);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  const toggle = (staffId, status) => {
    setRecords(p => ({ ...p, [staffId]: status }));
  };

  const saveAll = async () => {
    const recs = staff.map(s => ({ staff_id: s.id, staff_name: s.name, status: records[s.id] || "absent" }));
    try {
      await axios.post(`${API}/staff/attendance/bulk`, {
        date, records: recs, kms_year: filters.kms_year || "", season: filters.season || ""
      });
      toast.success("Attendance saved!");
    } catch (e) { logger.error(e); toast.error("Save failed"); }
  };

  const exportAtt = async (fmt) => {
    const month = date.substring(0, 7);
    const from = `${month}-01`;
    const d = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0);
    const to = `${month}-${String(d.getDate()).padStart(2,'0')}`;
    const p = new URLSearchParams({ date_from: from, date_to: to, fmt });
    const { downloadFile } = await import('../utils/download');
    const { buildFilename } = await import('../utils/filename-format');
    const fname = buildFilename({ base: 'staff-attendance', dateFrom: from, dateTo: to, ext: fmt === 'pdf' ? 'pdf' : 'xlsx' });
    downloadFile(`/api/staff/export/attendance?${p}`, fname);
  };

  const statusConfig = {
    present: { label: "P", color: "bg-emerald-600 text-white", icon: Check },
    absent: { label: "A", color: "bg-red-600 text-white", icon: X },
    half_day: { label: "H", color: "bg-amber-500 text-slate-900", icon: Clock },
    holiday: { label: "CH", color: "bg-blue-500 text-white", icon: Sun },
  };

  return (
    <div className="space-y-3" data-testid="staff-attendance">
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <Label className="text-xs text-slate-400">Date / तारीख</Label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white h-9 w-44" data-testid="attendance-date" />
        </div>
        <Button onClick={saveAll} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-9" data-testid="save-attendance-btn">
          <Check className="w-4 h-4 mr-1" /> Save Attendance
        </Button>
        <Button onClick={() => exportAtt('excel')} variant="outline" size="sm"
          title="Excel download" aria-label="Excel"
          className="border-slate-600 text-green-400 h-9 w-9 p-0" data-testid="att-export-excel">
          <Download className="w-4 h-4" />
        </Button>
        <Button onClick={() => exportAtt('pdf')} variant="outline" size="sm"
          title="PDF download" aria-label="PDF"
          className="border-slate-600 text-red-400 h-9 w-9 p-0" data-testid="att-export-pdf">
          <FileText className="w-4 h-4" />
        </Button>
        <ShareFileViaWhatsApp
          getFile={async () => {
            const m = date.slice(0, 7);
            const from = `${m}-01`;
            const d = new Date(parseInt(m.split('-')[0]), parseInt(m.split('-')[1]), 0);
            const to = `${m}-${String(d.getDate()).padStart(2, '0')}`;
            const p = new URLSearchParams({ date_from: from, date_to: to, fmt: 'excel' });
            return await fetchAsBlob(`/api/staff/export/attendance?${p}`, `staff_attendance_${from}_to_${to}.xlsx`);
          }}
          caption={`Staff Attendance — ${date.slice(0, 7)}`}
          title="WhatsApp pe bhejein (Excel)"
          testId="att-share-whatsapp"
        />
      </div>
      {loading ? <div className="text-slate-400 text-center py-4">Loading...</div> : (
        <div className="space-y-1">
          <div className="flex gap-3 text-[10px] text-slate-500 mb-2">
            <span className="flex items-center gap-1"><span className="w-5 h-5 bg-emerald-600 rounded text-[10px] flex items-center justify-center text-white">P</span> Present</span>
            <span className="flex items-center gap-1"><span className="w-5 h-5 bg-red-600 rounded text-[10px] flex items-center justify-center text-white">A</span> Absent</span>
            <span className="flex items-center gap-1"><span className="w-5 h-5 bg-amber-500 rounded text-[10px] flex items-center justify-center text-slate-900">H</span> Half Day</span>
            <span className="flex items-center gap-1"><span className="w-5 h-5 bg-blue-500 rounded text-[10px] flex items-center justify-center text-white">CH</span> Holiday (Paid)</span>
          </div>
          {staff.map(s => {
            const current = records[s.id] || "absent";
            return (
              <div key={s.id} className="flex items-center justify-between py-2 px-3 bg-slate-800 rounded-lg border border-slate-700">
                <div>
                  <p className="text-sm text-white font-medium">{s.name}</p>
                  <p className="text-[10px] text-slate-500">{s.salary_type === 'monthly' ? `₹${s.salary_amount}/mo` : `₹${s.salary_amount}/day`}</p>
                </div>
                <div className="flex gap-1.5">
                  {Object.entries(statusConfig).map(([key, cfg]) => (
                    <button key={key} onClick={() => toggle(s.id, key)}
                      className={`w-9 h-9 rounded-lg text-xs font-bold flex items-center justify-center transition-all
                        ${current === key ? cfg.color + ' ring-2 ring-white/40 scale-110' : 'bg-slate-700 text-slate-500 hover:bg-slate-600'}`}
                      data-testid={`att-${s.id}-${key}`}>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};


// ===== QUICK MONTHLY REPORT =====
const QuickMonthlyReport = ({ staff, filters }) => {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [staffFilter, setStaffFilter] = useState("all");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const dateFrom = `${month}-01`;
  const dateTo = (() => {
    const [y, m] = month.split('-').map(Number);
    return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  })();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [attRes, staffRes, advRes] = await Promise.all([
        axios.get(`${API}/staff/attendance?date_from=${dateFrom}&date_to=${dateTo}`),
        axios.get(`${API}/staff?active=true`),
        axios.get(`${API}/staff/advance`)
      ]);
      const staffList = staffRes.data;
      const attList = attRes.data;
      const advList = advRes.data || [];

      // Build summary per staff
      const dates = [];
      let d = new Date(dateFrom);
      const end = new Date(dateTo);
      while (d <= end) { dates.push(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 1); }

      const attMap = {};
      attList.forEach(a => { if (!attMap[a.staff_id]) attMap[a.staff_id] = {}; attMap[a.staff_id][a.date] = a.status; });

      const summary = staffList.map(s => {
        let P = 0, A = 0, H = 0, CH = 0;
        dates.forEach(dt => {
          const st = (attMap[s.id] || {})[dt] || '-';
          if (st === 'present') P++;
          else if (st === 'absent') A++;
          else if (st === 'half_day') H++;
          else if (st === 'holiday') CH++;
        });
        const daysWorked = P + CH + H * 0.5;
        const perDay = s.salary_type === 'monthly' ? s.salary_amount / 30 : s.salary_amount;
        const estSalary = Math.round(daysWorked * perDay);
        const advTotal = advList.filter(a => a.staff_id === s.id).reduce((sum, a) => sum + (a.amount || 0), 0);
        return { ...s, P, A, H, CH, daysWorked, perDay: Math.round(perDay), estSalary, totalDays: dates.length, advanceTotal: Math.round(advTotal) };
      });
      setData(summary);
    } catch (e) { logger.error(e); toast.error("Report load nahi hua"); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = staffFilter === "all" ? data : data.filter(s => s.id === staffFilter);

  const totals = filtered.reduce((acc, s) => ({
    P: acc.P + s.P, A: acc.A + s.A, H: acc.H + s.H, CH: acc.CH + s.CH,
    daysWorked: acc.daysWorked + s.daysWorked, estSalary: acc.estSalary + s.estSalary,
    advanceTotal: acc.advanceTotal + (s.advanceTotal || 0)
  }), { P: 0, A: 0, H: 0, CH: 0, daysWorked: 0, estSalary: 0, advanceTotal: 0 });

  const exportReport = async (fmt) => {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, fmt });
    const { downloadFile } = await import('../utils/download');
    const { buildFilename } = await import('../utils/filename-format');
    const fname = buildFilename({ base: 'staff-monthly', dateFrom, dateTo, ext: fmt === 'pdf' ? 'pdf' : 'xlsx' });
    downloadFile(`/api/staff/export/attendance?${p}`, fname);
  };

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y, m] = month.split('-').map(Number);
  const monthLabel = `${monthNames[m - 1]} ${y}`;

  return (
    <div className="space-y-3" data-testid="quick-monthly-report">
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <Label className="text-xs text-slate-400">Month / महीना</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white h-9 w-44" data-testid="report-month" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">Staff Filter</Label>
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-9 w-48" data-testid="report-staff-filter">
              <SelectValue placeholder="All Staff" />
            </SelectTrigger>
            <SelectContent className="bg-slate-700 border-slate-600">
              <SelectItem value="all">All Staff / सभी</SelectItem>
              {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => fetchData()} variant="outline" size="sm" className="border-slate-600 text-blue-400 h-9" data-testid="report-refresh">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
        <Button onClick={() => exportReport('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400 h-9" data-testid="report-export-excel">
          <Download className="w-4 h-4 mr-1" /> Excel
        </Button>
        <Button onClick={() => exportReport('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400 h-9" data-testid="report-export-pdf">
          <FileText className="w-4 h-4 mr-1" /> PDF
        </Button>
      </div>

      {loading ? <div className="text-slate-400 text-center py-8">Loading...</div> : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            {[
              ["Total Staff", filtered.length, "text-white", "bg-slate-800"],
              ["Present (P)", totals.P, "text-emerald-400", "bg-emerald-900/20 border-emerald-700/30"],
              ["Half Day (H)", totals.H, "text-amber-400", "bg-amber-900/20 border-amber-700/30"],
              ["Holiday (CH)", totals.CH, "text-blue-400", "bg-blue-900/20 border-blue-700/30"],
              ["Absent (A)", totals.A, "text-red-400", "bg-red-900/20 border-red-700/30"],
              ["Est. Salary", `₹${totals.estSalary.toLocaleString('en-IN')}`, "text-amber-400", "bg-amber-900/20 border-amber-700/30"],
              ["Advance Bal.", `₹${totals.advanceTotal.toLocaleString('en-IN')}`, "text-red-400", "bg-red-900/20 border-red-700/30"],
            ].map(([label, val, color, bg]) => (
              <div key={label} className={`text-center p-3 rounded-lg border border-slate-700 ${bg}`}>
                <p className="text-[10px] text-slate-400">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{val}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm text-amber-400">{monthLabel} - Staff Attendance Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400 text-xs">
                      <th className="text-left py-2 px-3">Staff Name</th>
                      <th className="text-center py-2 px-3">Type</th>
                      <th className="text-center py-2 px-3 text-emerald-400">P</th>
                      <th className="text-center py-2 px-3 text-red-400">A</th>
                      <th className="text-center py-2 px-3 text-amber-400">H</th>
                      <th className="text-center py-2 px-3 text-blue-400">CH</th>
                      <th className="text-center py-2 px-3">Days Worked</th>
                      <th className="text-right py-2 px-3">Per Day</th>
                      <th className="text-right py-2 px-3">Est. Salary</th>
                      <th className="text-right py-2 px-3 text-red-400">Advance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(s => (
                      <tr key={s.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="py-2 px-3 text-white font-medium">{s.name}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${s.salary_type === 'monthly' ? 'bg-blue-900/40 text-blue-400' : 'bg-amber-900/40 text-amber-400'}`}>
                            {s.salary_type === 'monthly' ? 'Mo' : 'Day'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center text-emerald-400 font-semibold">{s.P}</td>
                        <td className="py-2 px-3 text-center text-red-400 font-semibold">{s.A}</td>
                        <td className="py-2 px-3 text-center text-amber-400 font-semibold">{s.H}</td>
                        <td className="py-2 px-3 text-center text-blue-400 font-semibold">{s.CH}</td>
                        <td className="py-2 px-3 text-center text-white font-bold">{s.daysWorked}</td>
                        <td className="py-2 px-3 text-right text-slate-300">₹{s.perDay?.toLocaleString('en-IN')}</td>
                        <td className="py-2 px-3 text-right text-amber-400 font-bold">₹{s.estSalary?.toLocaleString('en-IN')}</td>
                        <td className="py-2 px-3 text-right text-red-400 font-semibold">₹{(s.advanceTotal || 0).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                    {filtered.length > 1 && (
                      <tr className="border-t-2 border-slate-600 bg-slate-900/50">
                        <td className="py-2 px-3 text-amber-400 font-bold" colSpan={2}>Total</td>
                        <td className="py-2 px-3 text-center text-emerald-400 font-bold">{totals.P}</td>
                        <td className="py-2 px-3 text-center text-red-400 font-bold">{totals.A}</td>
                        <td className="py-2 px-3 text-center text-amber-400 font-bold">{totals.H}</td>
                        <td className="py-2 px-3 text-center text-blue-400 font-bold">{totals.CH}</td>
                        <td className="py-2 px-3 text-center text-white font-bold">{totals.daysWorked}</td>
                        <td className="py-2 px-3 text-right"></td>
                        <td className="py-2 px-3 text-right text-amber-400 font-bold">₹{totals.estSalary?.toLocaleString('en-IN')}</td>
                        <td className="py-2 px-3 text-right text-red-400 font-bold">₹{totals.advanceTotal?.toLocaleString('en-IN')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {filtered.length === 0 && <p className="text-center text-slate-500 py-4 text-sm">Koi data nahi</p>}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};


// ===== ADVANCE LEDGER =====
const AdvanceSection = ({ staff, filters, fetchAdvances, advances, payments }) => {
  const showConfirm = useConfirm();
  const [showAdd, setShowAdd] = useState(false);
  const [filterStaff, setFilterStaff] = useState("");
  const [form, setForm] = useState({ staff_id: "", amount: "", date: new Date().toISOString().split('T')[0], description: "" });
  const [advAcct, setAdvAcct] = useState({ account: 'cash', bank_name: '', owner_name: '' });

  const save = async () => {
    if (!form.staff_id || !form.amount) return toast.error("Staff aur amount bharein");
    if (advAcct.account === 'bank' && !advAcct.bank_name) return toast.error("Bank select karein");
    if (advAcct.account === 'owner' && !advAcct.owner_name) return toast.error("Owner account select karein");
    const s = staff.find(x => x.id === form.staff_id);
    try {
      await axios.post(`${API}/staff/advance`, {
        ...form, staff_name: s?.name || "", amount: parseFloat(form.amount),
        kms_year: filters.kms_year || "", season: filters.season || "",
        account: advAcct.account, bank_name: advAcct.bank_name, owner_name: advAcct.owner_name,
      });
      toast.success("Advance added"); setShowAdd(false);
      setForm({ staff_id: "", amount: "", date: new Date().toISOString().split('T')[0], description: "" });
      setAdvAcct({ account: 'cash', bank_name: '', owner_name: '' });
      fetchAdvances();
    } catch (e) { logger.error(e); toast.error("Error"); }
  };

  const remove = async (id) => {
    if (!await showConfirm("Delete Advance", "Delete advance?")) return;
    await axios.delete(`${API}/staff/advance/${id}`);
    toast.success("Deleted"); fetchAdvances();
  };

  // Build ledger: advances (debit) + salary payment deductions (credit)
  const buildLedger = (staffFilter) => {
    const ledger = [];
    // Advances given = Debit
    for (const a of (advances || [])) {
      if (staffFilter && a.staff_id !== staffFilter) continue;
      ledger.push({ date: a.date || '', staff_name: a.staff_name || '', type: 'debit', description: a.description || 'Advance Given', amount: a.amount || 0, id: a.id, deletable: true });
    }
    // Salary deductions = Credit
    for (const p of (payments || [])) {
      if (staffFilter && p.staff_id !== staffFilter) continue;
      if ((p.advance_deducted || 0) > 0) {
        ledger.push({ date: p.date || (p.created_at || '').split('T')[0] || '', staff_name: p.staff_name || '', type: 'credit', description: `Salary Deduction (${p.period_from || p.from_date || ''} to ${p.period_to || p.to_date || ''})`, amount: p.advance_deducted, id: p.id, deletable: false });
      }
    }
    ledger.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    // Calculate running balance
    let bal = 0;
    for (const item of ledger) {
      if (item.type === 'debit') bal += item.amount;
      else bal -= item.amount;
      item.balance = Math.round(bal * 100) / 100;
    }
    return ledger;
  };

  const ledger = buildLedger(filterStaff);
  const totalDebit = ledger.filter(l => l.type === 'debit').reduce((s, l) => s + l.amount, 0);
  const totalCredit = ledger.filter(l => l.type === 'credit').reduce((s, l) => s + l.amount, 0);
  const balance = Math.round((totalDebit - totalCredit) * 100) / 100;

  const fmtD = (d) => { if (!d) return ''; const p = d.split('-'); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d; };

  const exportLedger = async (fmt) => {
    const staffName = filterStaff ? (staff.find(s => s.id === filterStaff)?.name || '') : 'All Staff';
    if (fmt === 'pdf') {
      let html = `<html><head><title>Advance Ledger</title><style>
        body{font-family:Arial;padding:20px;color:#000}h2{text-align:center;color:#1a365d}
        table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #999;padding:6px 8px;font-size:11px}
        th{background:#1a365d;color:white;text-align:center}.debit{color:#dc2626;text-align:right}.credit{color:#059669;text-align:right}
        .bal{text-align:right;font-weight:bold}.summary{margin-top:10px;text-align:center;font-size:13px}
      </style></head><body>
        <h2>Advance Ledger - ${staffName}</h2>
        <p style="text-align:center;font-size:11px">${filters.kms_year || ''} ${filters.season || ''}</p>
        <table><thead><tr><th>#</th><th>Date</th><th>Staff</th><th>Description</th><th>Debit (Rs.)</th><th>Credit (Rs.)</th><th>Balance (Rs.)</th></tr></thead><tbody>`;
      ledger.forEach((l, i) => {
        html += `<tr><td>${i+1}</td><td>${fmtD(l.date)}</td><td>${l.staff_name}</td><td>${l.description}</td>
          <td class="debit">${l.type==='debit' ? l.amount.toLocaleString('en-IN') : ''}</td>
          <td class="credit">${l.type==='credit' ? l.amount.toLocaleString('en-IN') : ''}</td>
          <td class="bal">${l.balance.toLocaleString('en-IN')}</td></tr>`;
      });
      html += `</tbody></table>
        <div class="summary"><b>Total Advance:</b> Rs.${totalDebit.toLocaleString('en-IN')} | <b>Total Deducted:</b> Rs.${totalCredit.toLocaleString('en-IN')} | <b style="color:red">Balance:</b> Rs.${balance.toLocaleString('en-IN')}</div></body></html>`;
      const { safePrintHTML } = await import('../utils/print');
      await safePrintHTML(html);
    } else {
      // Download as Excel from backend or generate client-side
      try {
        const { downloadPost } = await import('../utils/download');
        await downloadPost(`/api/staff/advance-ledger/export`, {
          ledger: ledger.map(l => ({ date: l.date, staff_name: l.staff_name, description: l.description, debit: l.type === 'debit' ? l.amount : 0, credit: l.type === 'credit' ? l.amount : 0, balance: l.balance })),
          staff_name: staffName, kms_year: filters.kms_year, season: filters.season
        }, `advance_ledger_${staffName}.xlsx`);
      } catch (e) { logger.error(e); toast.error("Excel export failed"); }
    }
  };

  return (
    <div className="space-y-3" data-testid="staff-advance">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-sm text-slate-400">Advance Ledger / अग्रिम खाता</h3>
        <div className="flex gap-2 items-center">
          <select value={filterStaff} onChange={e => setFilterStaff(e.target.value)}
            className="h-8 rounded border border-slate-600 bg-slate-700 px-2 text-xs text-white" data-testid="adv-filter-staff">
            <option value="">All Staff</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Button onClick={() => exportLedger('pdf')} variant="outline" size="sm" className="border-slate-600 text-slate-300 h-7 text-xs" data-testid="adv-export-pdf">
            <FileText className="w-3 h-3 mr-1" /> PDF
          </Button>
          <Button onClick={() => exportLedger('excel')} variant="outline" size="sm" className="border-slate-600 text-slate-300 h-7 text-xs" data-testid="adv-export-excel">
            <Download className="w-3 h-3 mr-1" /> Excel
          </Button>
          <Button onClick={() => setShowAdd(true)} size="sm" className="bg-amber-500 hover:bg-amber-600 text-slate-900 h-7 text-xs" data-testid="add-advance-btn">
            <Plus className="w-3 h-3 mr-1" /> Advance
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-2 bg-red-900/20 rounded border border-red-700/30">
          <p className="text-[10px] text-slate-400">Total Advance</p>
          <p className="text-lg font-bold text-red-400">₹{totalDebit.toLocaleString('en-IN')}</p>
        </div>
        <div className="text-center p-2 bg-emerald-900/20 rounded border border-emerald-700/30">
          <p className="text-[10px] text-slate-400">Total Deducted</p>
          <p className="text-lg font-bold text-emerald-400">₹{totalCredit.toLocaleString('en-IN')}</p>
        </div>
        <div className="text-center p-2 bg-amber-900/20 rounded border border-amber-700/30">
          <p className="text-[10px] text-slate-400">Balance Pending</p>
          <p className="text-lg font-bold text-amber-400">₹{balance.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-xs">
          <thead><tr className="bg-slate-700">
            <th className="text-left py-2 px-3 text-slate-300 font-medium">#</th>
            <th className="text-left py-2 px-3 text-slate-300 font-medium">Date</th>
            <th className="text-left py-2 px-3 text-slate-300 font-medium">Staff</th>
            <th className="text-left py-2 px-3 text-slate-300 font-medium">Description</th>
            <th className="text-right py-2 px-3 text-red-300 font-medium">Debit (Rs.)</th>
            <th className="text-right py-2 px-3 text-emerald-300 font-medium">Credit (Rs.)</th>
            <th className="text-right py-2 px-3 text-slate-300 font-medium">Balance (Rs.)</th>
            <th className="text-center py-2 px-3 text-slate-300 font-medium">Del</th>
          </tr></thead>
          <tbody>{ledger.map((l, i) => (
            <tr key={`${l.id}-${i}`} className="border-t border-slate-700/50 hover:bg-slate-700/30">
              <td className="py-2 px-3 text-slate-500">{i + 1}</td>
              <td className="py-2 px-3 text-slate-300">{fmtD(l.date)}</td>
              <td className="py-2 px-3 text-white font-medium">{l.staff_name}</td>
              <td className="py-2 px-3 text-slate-400">{l.description}</td>
              <td className="py-2 px-3 text-right text-red-400 font-semibold">{l.type === 'debit' ? `₹${l.amount.toLocaleString('en-IN')}` : ''}</td>
              <td className="py-2 px-3 text-right text-emerald-400 font-semibold">{l.type === 'credit' ? `₹${l.amount.toLocaleString('en-IN')}` : ''}</td>
              <td className={`py-2 px-3 text-right font-bold ${l.balance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>₹{l.balance.toLocaleString('en-IN')}</td>
              <td className="py-2 px-3 text-center">{l.deletable && <Button onClick={() => remove(l.id)} variant="ghost" size="sm" className="text-red-400 h-6 px-1"><Trash2 className="w-3 h-3" /></Button>}</td>
            </tr>
          ))}</tbody>
        </table>
        {ledger.length === 0 && <p className="text-center text-slate-500 py-4 text-sm">Koi advance record nahi</p>}
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md" data-testid="advance-dialog">
          <DialogHeader><DialogTitle className="text-amber-400">Give Advance / अग्रिम</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs text-slate-400">Staff</Label>
              <select value={form.staff_id} onChange={e => setForm(p => ({...p, staff_id: e.target.value}))}
                className="flex h-9 w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-ring" data-testid="adv-staff-select">
                <option value="">Select Staff</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div><Label className="text-xs text-slate-400">Amount (₹)</Label>
              <Input type="number" value={form.amount} onChange={e => setForm(p => ({...p, amount: e.target.value}))}
                className="bg-slate-700 border-slate-600 text-white" data-testid="adv-amount-input" /></div>
            <div><Label className="text-xs text-slate-400">Date</Label>
              <Input type="date" value={form.date} onChange={e => setForm(p => ({...p, date: e.target.value}))}
                className="bg-slate-700 border-slate-600 text-white" /></div>
            <div><Label className="text-xs text-slate-400">Description</Label>
              <Input value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))}
                className="bg-slate-700 border-slate-600 text-white" placeholder="Optional" /></div>
            <PaymentAccountSelect value={advAcct} onChange={setAdvAcct} testId="adv-account-select" />
            <Button onClick={save} className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900" data-testid="adv-save-btn">Save Advance</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};


// ===== SALARY PAYMENT =====
const SalaryPayment = ({ staff, filters, payments, fetchPayments }) => {
  const showConfirm = useConfirm();
  const [staffId, setStaffId] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [calcData, setCalcData] = useState(null);
  const [allCalcData, setAllCalcData] = useState(null);
  const [advDeduct, setAdvDeduct] = useState(0);
  const [calculating, setCalculating] = useState(false);
  const [settlingAll, setSettlingAll] = useState(false);
  const [roundOff, setRoundOff] = useState("");
  const [payAcct, setPayAcct] = useState({ account: 'cash', bank_name: '', owner_name: '' });

  const calculate = async () => {
    if (!periodFrom || !periodTo) return toast.error("Period select karein");
    if (!staffId) return toast.error("Staff select karein");

    try {
      setCalculating(true);
      if (staffId === "__all__") {
        // Calculate for all staff
        const results = [];
        for (const s of staff) {
          try {
            const p = new URLSearchParams({ staff_id: s.id, period_from: periodFrom, period_to: periodTo });
            if (filters.kms_year) p.append("kms_year", filters.kms_year);
            
            const res = await axios.get(`${API}/staff/salary-calculate?${p}`);
            results.push({ ...res.data, staff_name: s.name, staff_id: s.id });
          } catch (e) { logger.error(e); }
        }
        setAllCalcData(results);
        setCalcData(null);
      } else {
        const p = new URLSearchParams({ staff_id: staffId, period_from: periodFrom, period_to: periodTo });
        if (filters.kms_year) p.append("kms_year", filters.kms_year);
        
        const res = await axios.get(`${API}/staff/salary-calculate?${p}`);
        setCalcData(res.data);
        setAllCalcData(null);
        // Auto-fill advance deduct with advance balance (max = gross salary)
        const autoDeduct = Math.min(res.data.advance_balance || 0, res.data.gross_salary || 0);
        setAdvDeduct(Math.max(0, autoDeduct));
      }
    } catch (e) { logger.error(e); toast.error("Calculate nahi hua"); }
    finally { setCalculating(false); }
  };

  const settle = async () => {
    if (!calcData) return;
    const net = calcData.gross_salary - advDeduct;
    if (net < 0) return toast.error("Net payment negative nahi ho sakta");
    if (payAcct.account === 'bank' && !payAcct.bank_name) return toast.error("Bank select karein");
    if (payAcct.account === 'owner' && !payAcct.owner_name) return toast.error("Owner account select karein");
    try {
      const s = staff.find(x => x.id === staffId);
      await axios.post(`${API}/staff/payments`, {
        staff_id: staffId, staff_name: s?.name || "",
        salary_type: calcData.staff.salary_type,
        salary_amount: calcData.staff.salary_amount,
        period_from: periodFrom, period_to: periodTo,
        total_days: calcData.total_days, days_worked: calcData.days_worked,
        holidays: calcData.holidays, half_days: calcData.half_days,
        absents: calcData.absents,
        gross_salary: calcData.gross_salary,
        advance_balance: calcData.advance_balance,
        advance_deducted: advDeduct,
        net_payment: net,
        date: new Date().toISOString().split('T')[0],
        kms_year: filters.kms_year || "", season: filters.season || "",
        round_off: parseFloat(roundOff) || 0,
        account: payAcct.account, bank_name: payAcct.bank_name, owner_name: payAcct.owner_name,
      });
      toast.success(`₹${net.toLocaleString('en-IN')} payment done + Cash Book entry created!`);
      setCalcData(null); setStaffId(""); setPeriodFrom(""); setPeriodTo(""); setRoundOff("");
      setPayAcct({ account: 'cash', bank_name: '', owner_name: '' });
      fetchPayments();
    } catch (e) { logger.error(e); toast.error("Payment error"); }
  };

  const settleAll = async () => {
    if (!allCalcData || allCalcData.length === 0) return;
    if (!await showConfirm("Settle Salary", `${allCalcData.length} staff ki salary settle karein?`)) return;
    setSettlingAll(true);
    let success = 0;
    for (const d of allCalcData) {
      try {
        const advBal = d.advance_balance || 0;
        const autoDeduct = Math.max(0, Math.min(advBal, d.gross_salary || 0));
        const net = (d.gross_salary || 0) - autoDeduct;
        if (net <= 0 && autoDeduct <= 0) continue;
        await axios.post(`${API}/staff/payments`, {
          staff_id: d.staff_id || d.staff?.id, staff_name: d.staff_name || d.staff?.name || "",
          salary_type: d.staff?.salary_type || "", salary_amount: d.staff?.salary_amount || 0,
          period_from: periodFrom, period_to: periodTo,
          total_days: d.total_days, days_worked: d.days_worked,
          holidays: d.holidays, half_days: d.half_days, absents: d.absents,
          gross_salary: d.gross_salary, advance_balance: advBal,
          advance_deducted: autoDeduct, net_payment: net,
          date: new Date().toISOString().split('T')[0],
          kms_year: filters.kms_year || "", season: filters.season || ""
        });
        success++;
      } catch (e) { logger.error(e); }
    }
    setSettlingAll(false);
    toast.success(`${success}/${allCalcData.length} staff salary settled!`);
    setAllCalcData(null); setStaffId(""); setPeriodFrom(""); setPeriodTo("");
    fetchPayments();
  };

  const deletePayment = async (id) => {
    if (!await showConfirm("Delete Payment", "Payment delete karein? Cash Book se bhi hatega.")) return;
    await axios.delete(`${API}/staff/payments/${id}`);
    toast.success("Payment deleted"); fetchPayments();
  };

  const exportPayments = async (fmt) => {
    const p = new URLSearchParams({ fmt });
    if (filters.kms_year) p.append("kms_year", filters.kms_year);
    
    const { downloadFile } = await import('../utils/download');
    const { buildFilename } = await import('../utils/filename-format');
    const fname = buildFilename({ base: 'staff-payments', kmsYear: filters.kms_year, ext: fmt === 'pdf' ? 'pdf' : 'xlsx' });
    downloadFile(`/api/staff/export/payments?${p}`, fname);
  };

  return (
    <div className="space-y-4" data-testid="staff-payment">
      {/* Calculate Section */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm text-amber-400 flex items-center gap-2"><Calculator className="w-4 h-4" /> Salary Calculate & Pay</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div><Label className="text-xs text-slate-400">Staff</Label>
              <Select value={staffId} onValueChange={v => { setStaffId(v); setCalcData(null); setAllCalcData(null); }}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white" data-testid="pay-staff-select"><SelectValue placeholder="Select Staff" /></SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  <SelectItem value="__all__" className="text-amber-400 font-semibold">All Staff / सभी</SelectItem>
                  {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.salary_type === 'monthly' ? `₹${s.salary_amount}/mo` : `₹${s.salary_amount}/day`})</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div><Label className="text-xs text-slate-400">Period From</Label>
              <Input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white" data-testid="pay-from" /></div>
            <div><Label className="text-xs text-slate-400">Period To</Label>
              <Input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white" data-testid="pay-to" /></div>
            <div className="flex items-end">
              <Button onClick={calculate} className="bg-blue-600 hover:bg-blue-700 text-white w-full" disabled={calculating} data-testid="calculate-btn">
                <Calculator className="w-4 h-4 mr-1" /> {calculating ? "..." : "Calculate"}
              </Button>
            </div>
          </div>

          {/* All Staff Summary Table */}
          {allCalcData && allCalcData.length > 0 && (
            <div className="mt-3">
              <div className="overflow-x-auto rounded-lg border border-slate-700">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-700">
                      {['#', 'Staff Name', 'Present', 'Half', 'Holiday', 'Absent', 'Days Worked', 'Rate/Day', 'Gross Salary', 'Advance Bal.', 'Adv. Deduct', 'Net Pay'].map(h =>
                        <th key={h} className="text-left text-slate-300 px-3 py-2 font-medium">{h}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {allCalcData.map((d, i) => {
                      const autoDeduct = Math.min(d.advance_balance || 0, d.gross_salary || 0);
                      const netPay = (d.gross_salary || 0) - Math.max(0, autoDeduct);
                      return (
                        <tr key={d.staff_id} className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="text-slate-500 px-3 py-2">{i + 1}</td>
                          <td className="text-white px-3 py-2 font-medium">{d.staff_name}</td>
                          <td className="text-emerald-400 px-3 py-2">{d.present_days}</td>
                          <td className="text-amber-400 px-3 py-2">{d.half_days}</td>
                          <td className="text-blue-400 px-3 py-2">{d.holidays}</td>
                          <td className="text-red-400 px-3 py-2">{d.absents}</td>
                          <td className="text-white px-3 py-2 font-bold">{d.days_worked}</td>
                          <td className="text-slate-300 px-3 py-2">Rs.{d.per_day_rate}</td>
                          <td className="text-emerald-400 px-3 py-2 font-bold">Rs.{(d.gross_salary || 0).toLocaleString('en-IN')}</td>
                          <td className="text-orange-400 px-3 py-2">Rs.{(d.advance_balance || 0).toLocaleString('en-IN')}</td>
                          <td className="text-red-300 px-3 py-2">Rs.{Math.max(0, autoDeduct).toLocaleString('en-IN')}</td>
                          <td className="text-emerald-300 px-3 py-2 font-bold">Rs.{netPay.toLocaleString('en-IN')}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-slate-600 bg-slate-700/50">
                      <td colSpan={8} className="text-white px-3 py-2 font-bold text-right">Total:</td>
                      <td className="text-emerald-400 px-3 py-2 font-bold">Rs.{allCalcData.reduce((s, d) => s + (d.gross_salary || 0), 0).toLocaleString('en-IN')}</td>
                      <td className="text-orange-400 px-3 py-2 font-bold">Rs.{allCalcData.reduce((s, d) => s + (d.advance_balance || 0), 0).toLocaleString('en-IN')}</td>
                      <td className="text-red-300 px-3 py-2 font-bold">Rs.{allCalcData.reduce((s, d) => s + Math.max(0, Math.min(d.advance_balance||0, d.gross_salary||0)), 0).toLocaleString('en-IN')}</td>
                      <td className="text-emerald-300 px-3 py-2 font-bold">Rs.{allCalcData.reduce((s, d) => { const ad = Math.max(0, Math.min(d.advance_balance||0, d.gross_salary||0)); return s + ((d.gross_salary||0) - ad); }, 0).toLocaleString('en-IN')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex justify-end">
                <Button onClick={settleAll} className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={settlingAll} data-testid="settle-all-btn">
                  <IndianRupee className="w-4 h-4 mr-1" /> {settlingAll ? "Settling..." : `Settle All (${allCalcData.length} Staff)`}
                </Button>
              </div>
            </div>
          )}

          {calcData && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {[
                  ["Total Days", calcData.total_days, "text-white"],
                  ["Present", calcData.present_days, "text-emerald-400"],
                  ["Half Day", calcData.half_days, "text-amber-400"],
                  ["Holiday (Paid)", calcData.holidays, "text-blue-400"],
                  ["Absent", calcData.absents, "text-red-400"],
                ].map(([l,v,c]) => (
                  <div key={l} className="text-center p-2 bg-slate-900/50 rounded">
                    <p className="text-[10px] text-slate-400">{l}</p><p className={`text-lg font-bold ${c}`}>{v}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="text-center p-2 bg-slate-900/50 rounded">
                  <p className="text-[10px] text-slate-400">Days Worked (P+H+½H)</p>
                  <p className="text-lg font-bold text-emerald-400">{calcData.days_worked}</p>
                </div>
                <div className="text-center p-2 bg-slate-900/50 rounded">
                  <p className="text-[10px] text-slate-400">Per Day Rate</p>
                  <p className="text-lg font-bold text-slate-300">₹{calcData.per_day_rate}</p>
                </div>
                <div className="text-center p-2 bg-emerald-900/30 rounded border border-emerald-700/40">
                  <p className="text-[10px] text-slate-400">Gross Salary</p>
                  <p className="text-xl font-bold text-emerald-400" data-testid="gross-salary">₹{calcData.gross_salary.toLocaleString('en-IN')}</p>
                </div>
                <div className="text-center p-2 bg-red-900/30 rounded border border-red-700/40">
                  <p className="text-[10px] text-slate-400">Advance Balance</p>
                  <p className="text-xl font-bold text-red-400" data-testid="advance-balance">₹{calcData.advance_balance.toLocaleString('en-IN')}</p>
                </div>
              </div>

              {/* Advance Deduction + Settlement */}
              <div className="bg-slate-900 rounded-lg border border-slate-600 p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div>
                    <Label className="text-xs text-slate-400">Advance Deduct / अग्रिम कटौती (₹)</Label>
                    <Input type="number" value={advDeduct} onChange={e => setAdvDeduct(parseFloat(e.target.value) || 0)}
                      max={Math.min(calcData.advance_balance, calcData.gross_salary)}
                      className="bg-slate-700 border-slate-600 text-white" data-testid="adv-deduct-input" />
                    <p className="text-[10px] text-slate-500 mt-1">Max: ₹{Math.min(calcData.advance_balance, calcData.gross_salary).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="text-center p-3 bg-emerald-900/40 rounded-lg border-2 border-emerald-500/50">
                    <p className="text-xs text-slate-400">Net Payment / भुगतान</p>
                    <p className="text-2xl font-bold text-emerald-400" data-testid="net-payment">
                      ₹{(calcData.gross_salary - advDeduct).toLocaleString('en-IN')}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      ₹{calcData.gross_salary.toLocaleString('en-IN')} - ₹{advDeduct.toLocaleString('en-IN')} advance
                    </p>
                  </div>
                  <Button onClick={settle} className="bg-emerald-600 hover:bg-emerald-700 text-white h-12 text-base" data-testid="settle-btn">
                    <IndianRupee className="w-5 h-5 mr-1" /> Pay & Settle
                  </Button>
                </div>
                <div className="mt-2">
                  <RoundOffInput
                    value={roundOff}
                    onChange={setRoundOff}
                    amount={calcData.gross_salary - advDeduct}
                  />
                </div>
                <div className="mt-2">
                  <PaymentAccountSelect value={payAcct} onChange={setPayAcct} testId="staff-pay-account-select" />
                </div>
                <p className="text-[10px] text-slate-500 mt-2">* Cash Book mein auto Nikasi entry banega</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm text-slate-400">Payment History</CardTitle>
            <div className="flex gap-1">
              <Button onClick={() => exportPayments('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400 h-7 text-xs" data-testid="pay-export-excel">
                <Download className="w-3 h-3 mr-1" /> Excel
              </Button>
              <Button onClick={() => exportPayments('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400 h-7 text-xs" data-testid="pay-export-pdf">
                <FileText className="w-3 h-3 mr-1" /> PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-700 text-slate-400">
                <th className="text-left py-2 px-2">Date</th><th className="text-left py-2 px-2">Staff</th>
                <th className="text-left py-2 px-2">Period</th><th className="text-right py-2 px-2">Days</th>
                <th className="text-right py-2 px-2">Gross</th><th className="text-right py-2 px-2">Adv Cut</th>
                <th className="text-right py-2 px-2">Net Paid</th><th className="text-center py-2 px-2">Del</th>
              </tr></thead>
              <tbody>{payments.map(p => (
                <tr key={p.id} className="border-b border-slate-700/50">
                  <td className="py-2 px-2 text-slate-300">{fmtDate(p.date)}</td>
                  <td className="py-2 px-2 text-white font-medium">{p.staff_name}</td>
                  <td className="py-2 px-2 text-slate-400">{p.period_from} to {p.period_to}</td>
                  <td className="py-2 px-2 text-right text-slate-300">{p.days_worked}</td>
                  <td className="py-2 px-2 text-right text-amber-400">₹{p.gross_salary?.toLocaleString('en-IN')}</td>
                  <td className="py-2 px-2 text-right text-red-400">₹{p.advance_deducted?.toLocaleString('en-IN')}</td>
                  <td className="py-2 px-2 text-right text-emerald-400 font-bold">₹{p.net_payment?.toLocaleString('en-IN')}</td>
                  <td className="py-2 px-2 text-center"><Button onClick={() => deletePayment(p.id)} variant="ghost" size="sm" className="text-red-400 h-6 px-1"><Trash2 className="w-3 h-3" /></Button></td>
                </tr>
              ))}</tbody>
            </table>
            {payments.length === 0 && <p className="text-center text-slate-500 py-4 text-sm">Koi payment nahi</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};


// ===== MAIN COMPONENT =====
const StaffManagement = ({ filters, user }) => {
  const [tab, setTab] = useState("attendance");
  const [staff, setStaff] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [payments, setPayments] = useState([]);

  const fetchStaff = useCallback(async () => {
    try { const res = await axios.get(`${API}/staff`); setStaff(res.data); } catch (e) { logger.error(e); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAdvances = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (filters.kms_year) p.append("kms_year", filters.kms_year);
      
      const res = await axios.get(`${API}/staff/advance?${p}`);
      setAdvances(res.data);
    } catch (e) { logger.error(e); }
  }, [filters.kms_year]);

  const fetchPayments = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (filters.kms_year) p.append("kms_year", filters.kms_year);
      
      const res = await axios.get(`${API}/staff/payments?${p}`);
      setPayments(res.data);
    } catch (e) { logger.error(e); }
  }, [filters.kms_year]);

  useEffect(() => { fetchStaff(); fetchAdvances(); fetchPayments(); }, [fetchStaff, fetchAdvances, fetchPayments]);

  return (
    <div className="space-y-3" data-testid="staff-module">
      <div className="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-700 w-fit">
        {[
          { id: "attendance", label: "Attendance", icon: Calendar },
          { id: "monthly", label: "Monthly Report", icon: FileText },
          { id: "payments", label: "Salary Payment", icon: IndianRupee },
          { id: "advance", label: "Advance", icon: IndianRupee },
          { id: "master", label: "Staff Master", icon: Users },
        ].map(({ id, label, icon: Icon }) => (
          <Button key={id} onClick={() => setTab(id)} variant={tab === id ? "default" : "ghost"} size="sm"
            className={tab === id ? "bg-amber-500 text-slate-900" : "text-slate-400 hover:text-white hover:bg-slate-700"}
            data-testid={`staff-tab-${id}`}>
            <Icon className="w-4 h-4 mr-1" /> {label}
          </Button>
        ))}
      </div>
      {tab === "attendance" && <Attendance staff={staff} filters={filters} />}
      {tab === "monthly" && <QuickMonthlyReport staff={staff} filters={filters} />}
      {tab === "payments" && <SalaryPayment staff={staff} filters={filters} payments={payments} fetchPayments={fetchPayments} />}
      {tab === "advance" && <AdvanceSection staff={staff} filters={filters} advances={advances} fetchAdvances={fetchAdvances} payments={payments} />}
      {tab === "master" && <StaffMaster staff={staff} fetchStaff={fetchStaff} />}
    </div>
  );
};

export default StaffManagement;
