import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Download, FileText } from "lucide-react";
import { API } from "./constants";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";

const CMRvsDC = ({ filters }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/reports/cmr-vs-dc?${p}`); setData(res.data);
    } catch (e) { toast.error("Report load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season]);
  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData);
  const exportData = async (format) => {
    try {
      const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season);
      const { downloadFile } = await import('../../utils/download');
      downloadFile(`/api/reports/cmr-vs-dc/${format}?${p}`, `cmr_vs_dc.${format === 'excel' ? 'xlsx' : 'pdf'}`);
    } catch (e) { toast.error("Export failed"); }
  };
  if (loading) return <div className="text-slate-400 text-center py-8">Loading...</div>;
  if (!data) return null;
  const m = data.milling, d = data.dc, c = data.comparison;
  return (
    <div className="space-y-4" data-testid="cmr-vs-dc-report">
      <div className="flex gap-2">
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
        <Button onClick={() => exportData('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400" data-testid="cmr-dc-export-excel"><Download className="w-4 h-4 mr-1" /> Excel</Button>
        <Button onClick={() => exportData('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400" data-testid="cmr-dc-export-pdf"><FileText className="w-4 h-4 mr-1" /> PDF</Button>
      </div>
      <Card className="bg-slate-800 border-slate-700"><CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm text-blue-400">Milling Output / उत्पादन</CardTitle></CardHeader>
        <CardContent className="pt-0"><div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[["Paddy Milled", m.total_paddy_milled, "Q", "text-white"], ["Rice Produced", m.total_rice_produced, "Q", "text-white"],
            ["FRK Used", m.total_frk_used, "Q", "text-amber-400"], ["CMR Ready", m.total_cmr_ready, "Q", "text-green-400"],
            ["Outturn", m.avg_outturn_pct, "%", "text-blue-400"], ["Milling Count", m.milling_count, "", "text-slate-300"]
          ].map(([label, val, unit, color]) => (
            <div key={label} className="text-center p-2 rounded bg-slate-900/50">
              <p className="text-[10px] text-slate-400">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{val}{unit && <span className="text-xs ml-0.5">{unit}</span>}</p>
            </div>
          ))}
        </div></CardContent>
      </Card>
      <Card className="bg-slate-800 border-slate-700"><CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm text-green-400">DC Allotment & Delivery</CardTitle></CardHeader>
        <CardContent className="pt-0"><div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {[["DC Allotted", d.total_allotted, "Q", "text-white"], ["DC Delivered", d.total_delivered, "Q", "text-green-400"],
            ["DC Pending", d.total_pending, "Q", "text-red-400"], ["Total DCs", d.dc_count, "", "text-slate-300"],
            ["Deliveries", d.delivery_count, "", "text-slate-300"]
          ].map(([label, val, unit, color]) => (
            <div key={label} className="text-center p-2 rounded bg-slate-900/50">
              <p className="text-[10px] text-slate-400">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{val}{unit && <span className="text-xs ml-0.5">{unit}</span>}</p>
            </div>
          ))}
        </div></CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className={`border-slate-700 ${c.cmr_vs_dc_allotted >= 0 ? 'bg-gradient-to-br from-green-900/30 to-slate-800' : 'bg-gradient-to-br from-red-900/30 to-slate-800'}`}><CardContent className="p-4 text-center">
          <p className="text-xs text-slate-400 mb-1">CMR vs DC Allotted</p>
          <p className={`text-2xl font-bold ${c.cmr_vs_dc_allotted >= 0 ? 'text-green-400' : 'text-red-400'}`}>{c.cmr_vs_dc_allotted > 0 ? '+' : ''}{c.cmr_vs_dc_allotted} Q</p>
          <p className="text-[10px] text-slate-500 mt-1">{c.cmr_vs_dc_allotted >= 0 ? 'Surplus - zyada taiyar' : 'Deficit - kam taiyar'}</p>
        </CardContent></Card>
        <Card className={`border-slate-700 ${c.cmr_vs_dc_delivered >= 0 ? 'bg-gradient-to-br from-amber-900/30 to-slate-800' : 'bg-gradient-to-br from-red-900/30 to-slate-800'}`}><CardContent className="p-4 text-center">
          <p className="text-xs text-slate-400 mb-1">Ready but Not Delivered</p>
          <p className={`text-2xl font-bold ${c.cmr_vs_dc_delivered >= 0 ? 'text-amber-400' : 'text-red-400'}`}>{c.cmr_vs_dc_delivered} Q</p>
          <p className="text-[10px] text-slate-500 mt-1">CMR ready - actually delivered</p>
        </CardContent></Card>
        <Card className="bg-gradient-to-br from-blue-900/30 to-slate-800 border-slate-700"><CardContent className="p-4 text-center">
          <p className="text-xs text-slate-400 mb-1">By-Product Revenue</p>
          <p className="text-2xl font-bold text-blue-400">₹{data.byproduct_revenue.toLocaleString('en-IN')}</p>
        </CardContent></Card>
      </div>
    </div>
  );
};

export default CMRvsDC;
