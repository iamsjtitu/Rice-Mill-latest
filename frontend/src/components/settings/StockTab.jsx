import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Package } from "lucide-react";
import logger from "../../utils/logger";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

const BASE_ITEMS = [
  { key: "paddy", label: "Paddy / धान", unit: "Qntl" },
  { key: "rice_usna", label: "Rice Usna / उसना चावल", unit: "Qntl" },
  { key: "rice_raw", label: "Rice Raw / कच्चा चावल", unit: "Qntl" },
  { key: "bran", label: "Rice Bran", unit: "Qntl" },
  { key: "kunda", label: "Mota Kunda", unit: "Qntl" },
  { key: "broken", label: "Broken Rice", unit: "Qntl" },
  { key: "rejection_rice", label: "Rejection Rice", unit: "Qntl" },
  { key: "pin_broken_rice", label: "Pin Broken Rice", unit: "Qntl" },
  { key: "poll", label: "Poll", unit: "Qntl" },
  { key: "husk", label: "Bhusa", unit: "Qntl" },
  { key: "frk", label: "FRK", unit: "Qntl" },
  { key: "gunny_old", label: "Gunny Bags (Market)", unit: "Bags" },
  { key: "gunny_govt", label: "Gunny Bags (Govt)", unit: "Bags" },
  { key: "gunny_bran_ppkt", label: "Bran P.Pkt", unit: "Bags" },
  { key: "gunny_broken_ppkt", label: "Broken P.Pkt", unit: "Bags" },
];

function StockTab({ kmsYear, user }) {
  const [stocks, setStocks] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [carrying, setCarrying] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const params = new URLSearchParams();
        if (kmsYear) params.append('kms_year', kmsYear);
        const res = await axios.get(`${API}/opening-stock?${params}`);
        const savedStocks = res.data?.stocks || {};
        const merged = {};
        for (const item of BASE_ITEMS) {
          merged[item.key] = savedStocks[item.key] || 0;
        }
        for (const [k, v] of Object.entries(savedStocks)) {
          if (!(k in merged)) merged[k] = v;
        }
        setStocks(merged);
      } catch (e) { logger.error('Stock data fetch error:', e); setStocks({}); }
      setLoaded(true);
    };
    fetchData();
  }, [kmsYear]);

  const save = async () => {
    setSaving(true);
    try {
      // Merge: fetch current saved stock first, then overlay our changes
      // This prevents deleting keys that exist in DB but not in current UI
      const params = new URLSearchParams();
      if (kmsYear) params.append('kms_year', kmsYear);
      let existingStocks = {};
      try {
        const cur = await axios.get(`${API}/opening-stock?${params}`);
        existingStocks = cur.data?.stocks || {};
      } catch (e) { /* first time - no existing data */ }
      
      // Merge: existing values + current form values (form takes priority)
      const mergedStocks = { ...existingStocks, ...stocks };
      
      await axios.put(`${API}/opening-stock?username=${user.username}&role=${user.role}`, { kms_year: kmsYear, stocks: mergedStocks });
      toast.success("Opening stock save ho gaya!");
    } catch (e) { toast.error(e.response?.data?.detail || "Save error"); }
    setSaving(false);
  };

  const carryForward = async () => {
    const parts = kmsYear.split('-');
    if (parts.length !== 2) return;
    const prevKms = `${parseInt(parts[0]) - 1}-${parseInt(parts[1]) - 1}`;
    setCarrying(true);
    try {
      const res = await axios.post(`${API}/opening-stock/carry-forward?username=${user.username}&role=${user.role}`, {
        source_kms_year: prevKms, target_kms_year: kmsYear,
      });
      if (res.data.success) {
        setStocks(res.data.data?.stocks || {});
        toast.success(`${prevKms} ka closing stock → ${kmsYear} ka opening stock carry forward ho gaya!`);
      }
    } catch (e) { toast.error(e.response?.data?.detail || "Carry forward error"); }
    setCarrying(false);
  };

  if (!loaded) return null;

  return (
    <Card className="bg-slate-800 border-slate-700" data-testid="opening-stock-section">
      <CardHeader>
        <CardTitle className="text-orange-400 flex items-center gap-2">
          <Package className="w-5 h-5" />
          Opening Stock Balance / शुरुआती स्टॉक
        </CardTitle>
        <p className="text-slate-400 text-sm">
          FY year ke liye opening stock (Qntl) set karein. Ye stock calculations mein use hoga.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">FY: <span className="text-amber-400 font-bold">{kmsYear}</span></p>
            <Button
              onClick={carryForward} disabled={carrying} size="sm" variant="outline"
              className="border-cyan-600 text-cyan-400 hover:bg-cyan-900/30 text-xs"
              data-testid="carry-forward-btn"
            >
              {carrying ? 'Processing...' : 'Auto Carry Forward (Previous Year Closing → OB)'}
            </Button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
            {BASE_ITEMS.map(item => (
              <div key={item.key}>
                <Label className="text-slate-300 text-xs">{item.label}</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number" step="0.01"
                    value={stocks[item.key] || ""}
                    onChange={e => setStocks(prev => ({ ...prev, [item.key]: e.target.value }))}
                    placeholder="0"
                    className="bg-slate-700 border-slate-600 text-white text-sm h-8"
                    data-testid={`opening-stock-${item.key}`}
                  />
                  <span className="text-slate-500 text-xs">{item.unit}</span>
                </div>
              </div>
            ))}
          </div>
          <Button onClick={save} disabled={saving} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold" data-testid="save-opening-stock-btn">
            {saving ? 'Saving...' : 'Save Opening Stock / शुरुआती स्टॉक सेव करें'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default StockTab;
