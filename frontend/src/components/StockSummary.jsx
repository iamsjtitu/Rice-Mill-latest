import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  RefreshCw, FileText, FileSpreadsheet, Package, Wheat, ShoppingBag, Box,
} from "lucide-react";
import { downloadFile, fetchAsBlob } from "../utils/download";
import { ShareFileViaWhatsApp } from "./common/ShareFileViaWhatsApp";
import logger from "../utils/logger";
const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

const categoryConfig = {
  "Raw Material": { icon: Wheat, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-700" },
  "Finished": { icon: Package, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-700" },
  "By-Product": { icon: Box, color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-700" },
  "Custom": { icon: ShoppingBag, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-700" },
};

export default function StockSummary({ filters }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState("all");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const p = new URLSearchParams();
      if (filters.kms_year) p.append('kms_year', filters.kms_year);
      if (filters.season) p.append('season', filters.season);
      const res = await axios.get(`${API}/stock-summary?${p}`);
      setItems(res.data.items || []);
    } catch (e) { logger.error(e); toast.error("Stock data load nahi hua"); }
    finally { setLoading(false); }
  }, [filters.kms_year, filters.season]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleExport = async (type) => {
    const p = new URLSearchParams();
    if (filters.kms_year) p.append('kms_year', filters.kms_year);
    if (filters.season) p.append('season', filters.season);
    const { buildFilename } = await import('../utils/filename-format');
    const fname = buildFilename({
      base: 'stock-summary',
      kmsYear: filters.kms_year,
      extra: filterCategory && filterCategory !== 'all' ? filterCategory : '',
      ext: type === 'pdf' ? 'pdf' : 'xlsx',
    });
    downloadFile(`/api/stock-summary/export/${type}`, fname);
  };

  const filteredItems = filterCategory === "all" ? items : items.filter(i => i.category === filterCategory);
  const categories = [...new Set(items.map(i => i.category))];

  // Group by category
  const grouped = {};
  filteredItems.forEach(item => {
    const cat = item.category || "Other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });

  const rawItems = filteredItems.filter(i => i.category === 'Raw Material' && (i.unit || 'Qntl') === 'Qntl');
  const finishedItems = filteredItems.filter(i => i.category === 'Finished');
  const totalOB = rawItems.reduce((s, i) => s + (i.opening || 0), 0);
  const totalIn = rawItems.reduce((s, i) => s + (i.in_qty || 0), 0);
  const totalOut = rawItems.reduce((s, i) => s + (i.out_qty || 0), 0);
  const totalAvail = rawItems.reduce((s, i) => s + (i.available || 0), 0);
  const riceAvail = finishedItems.reduce((s, i) => s + (i.available || 0), 0);

  return (
    <div className="space-y-4" data-testid="stock-summary-section">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Total Items", items.length, "text-white"],
          ["Paddy In", `${totalIn.toFixed(2)} Q`, "text-emerald-400"],
          ["Paddy Used", `${totalOut.toFixed(2)} Q`, "text-red-400"],
          ["Paddy Stock", `${totalAvail.toFixed(2)} Q`, totalAvail >= 0 ? "text-sky-400" : "text-red-400"],
        ].map(([label, val, color]) => (
          <Card key={label} className="bg-slate-800 border-slate-700">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-slate-400">{label}</p>
              <p className={`text-lg font-bold ${color}`} data-testid={`stock-${label.toLowerCase().replace(/\s/g,'-')}`}>{val}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <Button onClick={fetchData} variant="outline" size="sm" className="border-slate-600 text-slate-300" data-testid="stock-refresh-btn">
          <RefreshCw className="w-4 h-4" />
        </Button>
        <Button onClick={() => handleExport('pdf')} variant="outline" size="sm"
          title="PDF download" aria-label="PDF"
          className="border-red-700 text-red-400 hover:bg-red-900/30 h-9 w-9 p-0" data-testid="stock-export-pdf">
          <FileText className="w-4 h-4" />
        </Button>
        <Button onClick={() => handleExport('excel')} variant="outline" size="sm"
          title="Excel download" aria-label="Excel"
          className="border-green-700 text-green-400 hover:bg-green-900/30 h-9 w-9 p-0" data-testid="stock-export-excel">
          <FileSpreadsheet className="w-4 h-4" />
        </Button>
        <ShareFileViaWhatsApp
          getFile={async () => fetchAsBlob('/api/stock-summary/export/excel', 'stock_summary.xlsx')}
          caption="Stock Summary Report"
          title="Stock Summary WhatsApp pe bhejein (Excel)"
          testId="stock-share-whatsapp"
        />
        {categories.length > 0 && (
          <div className="flex gap-1 bg-slate-900 p-0.5 rounded border border-slate-700 ml-2">
            <Button onClick={() => setFilterCategory("all")} variant={filterCategory === "all" ? "default" : "ghost"} size="sm"
              className={`h-7 text-xs ${filterCategory === "all" ? "bg-amber-500 text-slate-900" : "text-slate-400 hover:text-white"}`}
              data-testid="stock-filter-all">All</Button>
            {categories.map(cat => (
              <Button key={cat} onClick={() => setFilterCategory(cat)} variant={filterCategory === cat ? "default" : "ghost"} size="sm"
                className={`h-7 text-xs ${filterCategory === cat ? "bg-amber-500 text-slate-900" : "text-slate-400 hover:text-white"}`}
                data-testid={`stock-filter-${cat.toLowerCase().replace(/\s/g,'-')}`}>{cat}</Button>
            ))}
          </div>
        )}
      </div>

      {/* Stock Items by Category */}
      {loading ? (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-8 text-center text-slate-400">Loading...</CardContent>
        </Card>
      ) : Object.entries(grouped).map(([category, catItems]) => {
        const config = categoryConfig[category] || categoryConfig["Custom"];
        const CatIcon = config.icon;
        return (
          <Card key={category} className={`bg-slate-800 ${config.border} border`} data-testid={`stock-category-${category.toLowerCase().replace(/\s/g,'-')}`}>
            <CardContent className="p-0">
              <div className={`${config.bg} px-4 py-2 flex items-center gap-2 border-b ${config.border}`}>
                <CatIcon className={`w-4 h-4 ${config.color}`} />
                <span className={`font-semibold text-sm ${config.color}`}>{category}</span>
                <span className="text-slate-400 text-xs ml-2">({catItems.length} items)</span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow className="border-slate-700">
                    {['Item', 'Opening', 'In (Qntl)', 'Out (Qntl)', 'Available', 'Details'].map(h =>
                      <TableHead key={h} className={`text-slate-300 text-xs ${['Opening', 'In (Qntl)', 'Out (Qntl)', 'Available'].includes(h) ? 'text-right' : ''}`}>{h}</TableHead>)}
                  </TableRow></TableHeader>
                  <TableBody>
                    {catItems.map(item => (
                      <TableRow key={item.name} className="border-slate-700" data-testid={`stock-row-${item.name.toLowerCase().replace(/[\s()]/g,'-')}`}>
                        <TableCell className="text-white font-semibold text-sm">{item.name}</TableCell>
                        <TableCell className="text-right text-amber-400 text-sm">{(item.opening || 0) > 0 ? `${item.opening} ${item.unit}` : '-'}</TableCell>
                        <TableCell className="text-right text-emerald-400 text-sm">{item.in_qty} {item.unit}</TableCell>
                        <TableCell className="text-right text-red-400 text-sm">{item.out_qty} {item.unit}</TableCell>
                        <TableCell className={`text-right font-bold text-base ${item.available >= 0 ? config.color : 'text-red-400'}`} data-testid={`stock-avail-${item.name.toLowerCase().replace(/[\s()]/g,'-')}`}>
                          {item.available} {item.unit}
                        </TableCell>
                        <TableCell className="text-slate-500 text-[10px] max-w-[250px]">{item.details}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
