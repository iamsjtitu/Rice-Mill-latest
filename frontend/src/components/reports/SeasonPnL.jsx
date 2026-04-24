import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Download, FileText, TrendingUp, TrendingDown } from "lucide-react";
import { API } from "./constants";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";

const SeasonPnL = ({ filters }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/reports/season-pnl?${p}`); setData(res.data);
    } catch (e) { toast.error("P&L load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season]);
  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData);
  const exportData = async (format) => {
    try {
      const p = new URLSearchParams(); if (filters.kms_year) p.append('kms_year', filters.kms_year); if (filters.season) p.append('season', filters.season);
      const { downloadFile } = await import('../../utils/download');
      downloadFile(`/api/reports/season-pnl/${format}?${p}`, `season_pnl.${format === 'excel' ? 'xlsx' : 'pdf'}`);
    } catch (e) { toast.error("Export failed"); }
  };
  if (loading) return <div className="text-slate-400 text-center py-8">Loading...</div>;
  if (!data) return null;
  return (
    <div className="space-y-4" data-testid="season-pnl-report">
      <div className="flex gap-2">
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
        <Button onClick={() => exportData('excel')} variant="outline" size="sm" className="border-slate-600 text-green-400" data-testid="pnl-export-excel"><Download className="w-4 h-4 mr-1" /> Excel</Button>
        <Button onClick={() => exportData('pdf')} variant="outline" size="sm" className="border-slate-600 text-red-400" data-testid="pnl-export-pdf"><FileText className="w-4 h-4 mr-1" /> PDF</Button>
      </div>
      <Card className={`border-2 ${data.profit ? 'border-green-600 bg-gradient-to-r from-green-900/40 to-slate-800' : 'border-red-600 bg-gradient-to-r from-red-900/40 to-slate-800'}`}>
        <CardContent className="p-5 text-center">
          <p className="text-sm text-slate-300 mb-1">{data.profit ? 'NET PROFIT / शुद्ध लाभ' : 'NET LOSS / शुद्ध हानि'}</p>
          <p className={`text-4xl font-bold ${data.profit ? 'text-green-400' : 'text-red-400'}`}>
            {data.profit ? <TrendingUp className="w-8 h-8 inline mr-2" /> : <TrendingDown className="w-8 h-8 inline mr-2" />}
            ₹{Math.abs(data.net_pnl).toLocaleString('en-IN')}
          </p>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-slate-800 border-green-800/30"><CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm text-green-400">Income / आय</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-1">
            {[["MSP Payments", data.income.msp_payments], ["By-Product Sales", data.income.byproduct_sales],
              ["Cash Book Jama", data.income.cash_book_jama]].map(([label, val]) => (
              <div key={label} className="flex justify-between py-1.5 border-b border-slate-700/50">
                <span className="text-xs text-slate-300">{label}</span>
                <span className="text-xs text-green-400 font-medium">₹{val.toLocaleString('en-IN')}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 border-t-2 border-green-800/50">
              <span className="text-sm font-bold text-green-400">Total Income</span>
              <span className="text-sm font-bold text-green-400">₹{data.income.total.toLocaleString('en-IN')}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-red-800/30"><CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm text-red-400">Expenses / खर्चा</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-1">
            {[["FRK Purchases", data.expenses.frk_purchases], ["Gunny Bags", data.expenses.gunny_bags],
              ["Cash Book Nikasi", data.expenses.cash_book_nikasi], ["Truck Payments", data.expenses.truck_payments],
              ["Agent Payments", data.expenses.agent_payments]].map(([label, val]) => (
              <div key={label} className="flex justify-between py-1.5 border-b border-slate-700/50">
                <span className="text-xs text-slate-300">{label}</span>
                <span className="text-xs text-red-400 font-medium">₹{val.toLocaleString('en-IN')}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 border-t-2 border-red-800/50">
              <span className="text-sm font-bold text-red-400">Total Expenses</span>
              <span className="text-sm font-bold text-red-400">₹{data.expenses.total.toLocaleString('en-IN')}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SeasonPnL;
