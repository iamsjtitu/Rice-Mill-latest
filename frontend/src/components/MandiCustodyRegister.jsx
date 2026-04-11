import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileSpreadsheet, FileText, Download, Loader2 } from "lucide-react";

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
    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d;
  };

  const { mandis, rows, grand_total } = data;

  return (
    <div data-testid="mandi-custody-register">
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="w-36 bg-slate-800 border-slate-600 text-white text-xs" data-testid="custody-date-from" />
        <span className="text-slate-400 text-xs">to</span>
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="w-36 bg-slate-800 border-slate-600 text-white text-xs" data-testid="custody-date-to" />
        <Button size="sm" onClick={fetchData} className="bg-amber-600 hover:bg-amber-500 text-white text-xs" data-testid="custody-search-btn">
          Search
        </Button>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={exportPdf} className="border-slate-600 text-slate-300 hover:bg-slate-700 text-xs" data-testid="custody-pdf-btn">
            <FileText className="w-3.5 h-3.5 mr-1" /> PDF
          </Button>
          <Button size="sm" variant="outline" onClick={exportExcel} className="border-slate-600 text-slate-300 hover:bg-slate-700 text-xs" data-testid="custody-excel-btn">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1" /> Excel
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-slate-400">Koi data nahi mila. Entries add karein ya filter change karein.</div>
      ) : (
        <Card className="bg-slate-900 border-slate-700 overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="custody-table">
                <thead>
                  <tr className="bg-[#1a365d]">
                    <th className="text-left text-white font-semibold px-3 py-2 sticky left-0 bg-[#1a365d] z-10 whitespace-nowrap">Date</th>
                    {mandis.map(m => (
                      <th key={m} className="text-center text-white font-semibold px-2 py-2 whitespace-nowrap min-w-[80px]">{m}</th>
                    ))}
                    <th className="text-center text-amber-200 font-bold px-3 py-2 whitespace-nowrap bg-[#1a365d] border-l border-slate-500">TOTAL</th>
                    <th className="text-center text-blue-200 font-bold px-3 py-2 whitespace-nowrap bg-[#1a365d] border-l border-slate-500">PROG. TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={r.date} className={ri % 2 === 0 ? "bg-slate-900" : "bg-slate-800/50"}>
                      <td className="px-3 py-1.5 font-medium text-slate-200 sticky left-0 z-10 whitespace-nowrap"
                        style={{ backgroundColor: ri % 2 === 0 ? '#0f172a' : '#1e293b' }}>
                        {fmtDate(r.date)}
                      </td>
                      {mandis.map(m => {
                        const v = r.mandis[m] || 0;
                        return (
                          <td key={m} className={`text-center px-2 py-1.5 tabular-nums ${v > 0 ? 'text-slate-100' : 'text-slate-600'}`}>
                            {v > 0 ? v.toFixed(2) : "-"}
                          </td>
                        );
                      })}
                      <td className="text-center px-3 py-1.5 font-semibold text-amber-300 bg-amber-900/20 border-l border-slate-700 tabular-nums">
                        {r.total.toFixed(2)}
                      </td>
                      <td className="text-center px-3 py-1.5 font-semibold text-blue-300 bg-blue-900/20 border-l border-slate-700 tabular-nums">
                        {r.prog_total.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#1a365d]">
                    <td className="px-3 py-2 font-bold text-white sticky left-0 bg-[#1a365d] z-10">Grand Total</td>
                    {mandis.map(m => {
                      const mTotal = rows.reduce((s, r) => s + (r.mandis[m] || 0), 0);
                      return (
                        <td key={m} className="text-center px-2 py-2 font-semibold text-amber-200 tabular-nums">
                          {mTotal > 0 ? mTotal.toFixed(2) : "-"}
                        </td>
                      );
                    })}
                    <td className="text-center px-3 py-2 font-bold text-amber-200 border-l border-slate-500 tabular-nums">
                      {grand_total.toFixed(2)}
                    </td>
                    <td className="text-center px-3 py-2 font-bold text-blue-200 border-l border-slate-500 tabular-nums">
                      {grand_total.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
