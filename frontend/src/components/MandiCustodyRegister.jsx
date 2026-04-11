import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileSpreadsheet, FileText, Search, Loader2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

export default function MandiCustodyRegister({ filters }) {
  const [data, setData] = useState({ mandis: [], rows: [], grand_total: 0 });
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters?.kmsYear) params.kms_year = filters.kmsYear;
      if (filters?.season) params.season = filters.season;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const { data: d } = await axios.get(`${API}/reports/mandi-custody-register`, { params });
      setData(d);
    } catch {
      toast.error("Data load nahi hua");
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [filters?.kmsYear, filters?.season]);

  const exportPdf = () => {
    const params = new URLSearchParams();
    if (filters?.kmsYear) params.set("kms_year", filters.kmsYear);
    if (filters?.season) params.set("season", filters.season);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    window.open(`${API}/reports/mandi-custody-register/pdf?${params}`, "_blank");
  };

  const exportExcel = () => {
    const params = new URLSearchParams();
    if (filters?.kmsYear) params.set("kms_year", filters.kmsYear);
    if (filters?.season) params.set("season", filters.season);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    window.open(`${API}/reports/mandi-custody-register/excel?${params}`, "_blank");
  };

  const fmtDate = (d) => {
    if (!d) return "-";
    const parts = d.split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
  };

  const { mandis, rows, grand_total } = data;

  return (
    <div data-testid="mandi-custody-register">
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap bg-white border border-slate-200 rounded-lg px-4 py-3">
        <span className="text-slate-500 text-xs font-medium">Date Range:</span>
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="w-36 bg-white border-slate-300 text-slate-800 text-xs" data-testid="custody-date-from" />
        <span className="text-slate-400 text-xs">to</span>
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="w-36 bg-white border-slate-300 text-slate-800 text-xs" data-testid="custody-date-to" />
        <Button size="sm" onClick={fetchData} className="bg-blue-600 hover:bg-blue-700 text-white text-xs" data-testid="custody-search-btn">
          <Search className="w-3.5 h-3.5 mr-1" /> Search
        </Button>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={exportPdf} className="border-red-300 text-red-600 hover:bg-red-50 text-xs" data-testid="custody-pdf-btn">
            <FileText className="w-3.5 h-3.5 mr-1" /> PDF
          </Button>
          <Button size="sm" variant="outline" onClick={exportExcel} className="border-green-300 text-green-600 hover:bg-green-50 text-xs" data-testid="custody-excel-btn">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1" /> Excel
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-white border border-slate-200 rounded-lg">
          Koi data nahi mila. Entries add karein ya filter change karein.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="custody-table">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="text-left text-slate-600 font-semibold px-3 py-2.5 sticky left-0 bg-slate-100 z-10 whitespace-nowrap border-r border-slate-200">Date</th>
                  {mandis.map(m => (
                    <th key={m} className="text-center text-slate-600 font-semibold px-2 py-2.5 whitespace-nowrap min-w-[90px] border-r border-slate-100">{m}</th>
                  ))}
                  <th className="text-center text-amber-700 font-bold px-3 py-2.5 whitespace-nowrap bg-amber-50 border-l border-amber-200">TOTAL</th>
                  <th className="text-center text-blue-700 font-bold px-3 py-2.5 whitespace-nowrap bg-blue-50 border-l border-blue-200">PROG. TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={r.date} className={`border-b border-slate-100 ${ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/30 transition-colors`}>
                    <td className="px-3 py-2 font-medium text-slate-700 sticky left-0 z-10 whitespace-nowrap border-r border-slate-200"
                      style={{ backgroundColor: ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
                      {fmtDate(r.date)}
                    </td>
                    {mandis.map(m => {
                      const v = r.mandis[m] || 0;
                      return (
                        <td key={m} className={`text-center px-2 py-2 tabular-nums border-r border-slate-50 ${v > 0 ? 'text-slate-800 font-medium' : 'text-slate-300'}`}>
                          {v > 0 ? v.toFixed(2) : "-"}
                        </td>
                      );
                    })}
                    <td className="text-center px-3 py-2 font-semibold text-amber-700 bg-amber-50/60 border-l border-amber-100 tabular-nums">
                      {r.total.toFixed(2)}
                    </td>
                    <td className="text-center px-3 py-2 font-semibold text-blue-700 bg-blue-50/60 border-l border-blue-100 tabular-nums">
                      {r.prog_total.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-700">
                  <td className="px-3 py-2.5 font-bold text-white sticky left-0 bg-slate-700 z-10 border-r border-slate-600">Grand Total</td>
                  {mandis.map(m => {
                    const mTotal = rows.reduce((s, r) => s + (r.mandis[m] || 0), 0);
                    return (
                      <td key={m} className="text-center px-2 py-2.5 font-semibold text-slate-200 tabular-nums border-r border-slate-600">
                        {mTotal > 0 ? mTotal.toFixed(2) : "-"}
                      </td>
                    );
                  })}
                  <td className="text-center px-3 py-2.5 font-bold text-amber-300 border-l border-slate-500 tabular-nums">
                    {grand_total.toFixed(2)}
                  </td>
                  <td className="text-center px-3 py-2.5 font-bold text-blue-300 border-l border-slate-500 tabular-nums">
                    {grand_total.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
