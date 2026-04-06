import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calculator, Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import AutoSuggest from "@/components/common/AutoSuggest";
import { FY_YEARS, SEASONS } from "@/utils/constants";
import { useState, useEffect, useRef } from "react";
import axios from "axios";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

export function MillEntryForm({
  isDialogOpen,
  setIsDialogOpen,
  editingId,
  formData,
  setFormData,
  calculatedFields,
  leasedTruckNos,
  truckSuggestions,
  agentSuggestions,
  mandiSuggestions,
  openNewEntryDialog,
  handleSubmit,
  handleInputChange,
  debouncedRstLookup,
  handleAgentSelect,
  findMandiCutting,
  rstFetched,
}) {
  const [dupWarning, setDupWarning] = useState({ rst: null, tp: null });
  const dupTimer = useRef(null);

  // Real-time duplicate check for RST & TP
  useEffect(() => {
    clearTimeout(dupTimer.current);
    dupTimer.current = setTimeout(async () => {
      const rst = String(formData.rst_no || '').trim();
      const tp = String(formData.tp_no || '').trim();
      if (!rst && !tp) { setDupWarning({ rst: null, tp: null }); return; }
      try {
        const params = new URLSearchParams();
        if (rst) params.set('rst_no', rst);
        if (tp) params.set('tp_no', tp);
        params.set('kms_year', formData.kms_year || '');
        if (editingId) params.set('exclude_id', editingId);
        const { data } = await axios.get(`${API}/entries/check-duplicate?${params}`);
        const newWarning = {
          rst: data.rst_exists ? data.rst_entry : null,
          tp: data.tp_exists ? data.tp_entry : null,
        };
        // Show toast for newly detected duplicates
        if (data.rst_exists && !dupWarning.rst) {
          toast.warning(`RST #${rst} pehle se entry hai`);
        }
        if (data.tp_exists && !dupWarning.tp) {
          toast.warning(`TP No. ${tp} pehle se RST #${data.tp_rst_no || '?'} mein entry hai`);
        }
        setDupWarning(newWarning);
      } catch { setDupWarning({ rst: null, tp: null }); }
    }, 400);
    return () => clearTimeout(dupTimer.current);
  }, [formData.rst_no, formData.tp_no, formData.kms_year, editingId]);

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button 
          onClick={openNewEntryDialog}
          className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold"
          data-testid="add-entry-btn"
        >
          <Plus className="w-4 h-4 mr-1" />
          Nayi Entry
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700 text-white"
        onEscapeKeyDown={(e) => {
          const zoomOpen = document.querySelector('[data-testid="photo-zoom-overlay"], [data-testid="camera-zoom-overlay"]');
          if (zoomOpen) e.preventDefault();
        }}>
        <DialogHeader>
          <DialogTitle className="text-amber-400 text-xl">
            {editingId ? "Entry Edit Karein" : "Nayi Entry"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* FY Year & Season */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-slate-300">FY Year</Label>
              <Select
                value={formData.kms_year}
                onValueChange={(value) => setFormData(prev => ({ ...prev, kms_year: value }))}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white" data-testid="select-kms-year">
                  <SelectValue placeholder="Select Year" />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  {FY_YEARS.map(year => (
                    <SelectItem key={year} value={year} className="text-white hover:bg-slate-600">
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300">Season</Label>
              <Select
                value={formData.season}
                onValueChange={(value) => setFormData(prev => ({ ...prev, season: value }))}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white" data-testid="select-season">
                  <SelectValue placeholder="Select Season" />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  {SEASONS.map(season => (
                    <SelectItem key={season} value={season} className="text-white hover:bg-slate-600">
                      {season}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
            <AutoSuggest
              value={formData.truck_no}
              onChange={(e) => setFormData(prev => ({ ...prev, truck_no: e.target.value }))}
              suggestions={truckSuggestions}
              placeholder="OD00XX0000"
              onSelect={(val) => setFormData(prev => ({ ...prev, truck_no: val }))}
              label="Truck No."
              testId="input-truck-no"
            />
            {leasedTruckNos.has((formData.truck_no || '').toUpperCase()) && (
              <div className="mt-1 flex items-center gap-1 text-xs text-violet-400 bg-violet-500/10 border border-violet-500/30 rounded px-2 py-1" data-testid="leased-truck-indicator">
                <span className="font-medium">Leased Truck</span> - Yeh truck lease par hai
              </div>
            )}
          </div>

          {/* RST No. & TP No. */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-300">RST No.</Label>
              <Input
                value={formData.rst_no}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData(prev => ({ ...prev, rst_no: val }));
                  if (val && !isNaN(val) && Number(val) > 0) {
                    debouncedRstLookup(val);
                  }
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }}
                placeholder="RST Number"
                className={`bg-slate-700 border-slate-600 text-white ${dupWarning.rst ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                data-testid="input-rst-no"
              />
              {dupWarning.rst && (
                <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Ye RST pehle se hai: {dupWarning.rst}
                </p>
              )}
            </div>
            <div>
              <Label className="text-slate-300">TP No.</Label>
              <Input
                value={formData.tp_no}
                onChange={(e) => setFormData(prev => ({ ...prev, tp_no: e.target.value }))}
                placeholder="TP Number"
                className={`bg-slate-700 border-slate-600 text-white ${dupWarning.tp ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                data-testid="input-tp-no"
              />
              {dupWarning.tp && (
                <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Ye TP pehle se hai: {dupWarning.tp}
                </p>
              )}
            </div>
          </div>

          {/* Agent & Mandi */}
          <div className="grid grid-cols-2 gap-4">
            <AutoSuggest
              value={formData.agent_name}
              onChange={(e) => setFormData(prev => ({ ...prev, agent_name: e.target.value }))}
              suggestions={agentSuggestions}
              placeholder="Agent name"
              onSelect={handleAgentSelect}
              label="Agent Name"
              testId="input-agent-name"
            />
            <AutoSuggest
              value={formData.mandi_name}
              onChange={(e) => {
                const val = e.target.value;
                const target = findMandiCutting(val);
                if (target) {
                  setFormData(prev => ({ ...prev, mandi_name: val, cutting_percent: String(target.cutting_percent) }));
                } else {
                  setFormData(prev => ({ ...prev, mandi_name: val }));
                }
              }}
              suggestions={mandiSuggestions}
              placeholder="Mandi name"
              onSelect={(val) => {
                const target = findMandiCutting(val);
                if (target) {
                  setFormData(prev => ({ ...prev, mandi_name: target.mandi_name, cutting_percent: String(target.cutting_percent) }));
                  toast.success(`Cutting ${target.cutting_percent}% set from ${target.mandi_name}`);
                } else {
                  setFormData(prev => ({ ...prev, mandi_name: val }));
                }
              }}
              onBlur={() => {
                const target = findMandiCutting(formData.mandi_name);
                if (target) {
                  setFormData(prev => ({ ...prev, mandi_name: target.mandi_name, cutting_percent: String(target.cutting_percent) }));
                }
              }}
              label="Mandi Name"
              testId="input-mandi-name"
            />
          </div>

          {/* Weight Inputs */}
          <Card className="bg-slate-700/50 border-slate-600">
            <CardHeader className="pb-2">
              <CardTitle className="text-amber-400 text-lg flex items-center gap-2">
                <Calculator className="w-5 h-5" />
                Weight & Auto Calculations (KG mein entry, QNTL mein display)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-slate-300">KG *{rstFetched ? ' (RST Locked)' : ''}</Label>
                <Input
                  type="number"
                  name="kg"
                  value={formData.kg}
                  onChange={handleInputChange}
                  placeholder="Enter KG"
                  className={`text-lg font-semibold ${rstFetched ? 'bg-slate-800 border-slate-600 text-slate-400 cursor-not-allowed' : 'bg-slate-600 border-slate-500 text-white'}`}
                  data-testid="input-kg"
                  disabled={rstFetched}
                />
              </div>
              <div>
                <Label className="text-green-400 font-semibold">QNTL (Auto){rstFetched ? ' (Locked)' : ''}</Label>
                <Input
                  value={calculatedFields.qntl}
                  readOnly
                  className={`text-lg font-bold ${rstFetched ? 'bg-slate-800 border-slate-600 text-slate-400 cursor-not-allowed' : 'bg-green-900/30 border-green-700 text-green-400'}`}
                  data-testid="calculated-qntl"
                  disabled={rstFetched}
                />
                <span className="text-xs text-slate-400">KG / 100</span>
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
                <Label className="text-cyan-400">G.Deposite (Gunny Bag)</Label>
                <Input
                  type="number"
                  name="g_deposite"
                  value={formData.g_deposite}
                  onChange={handleInputChange}
                  placeholder="Gunny bags deposited"
                  className="bg-cyan-900/30 border-cyan-700 text-cyan-400"
                  data-testid="input-g-deposite"
                />
                <span className="text-xs text-slate-400">Fill → 0.5kg | Empty → 1kg</span>
              </div>
              <div>
                <Label className="text-orange-400">GBW Cut (Auto)</Label>
                <Input
                  type="number"
                  name="gbw_cut"
                  value={formData.gbw_cut}
                  onChange={handleInputChange}
                  className="bg-orange-900/30 border-orange-700 text-orange-400 font-bold"
                  data-testid="input-gbw-cut"
                  readOnly
                />
                <span className="text-xs text-slate-400">G.Dep: 0.5kg | Empty: 1kg/bag</span>
              </div>
              <div>
                <Label className="text-pink-400">P.Pkt (Plastic Bags)</Label>
                <Input
                  type="number"
                  name="plastic_bag"
                  value={formData.plastic_bag}
                  onChange={handleInputChange}
                  placeholder="Bags count"
                  className="bg-pink-900/30 border-pink-700 text-pink-400"
                  data-testid="input-plastic-bag"
                />
              </div>
              <div>
                <Label className="text-pink-400 font-semibold">P.Pkt Cut (Auto)</Label>
                <Input
                  value={calculatedFields.p_pkt_cut}
                  readOnly
                  className="bg-pink-900/30 border-pink-700 text-pink-400 font-bold"
                  data-testid="calculated-p-pkt-cut"
                />
                <span className="text-xs text-slate-400">0.50 kg x Bags</span>
              </div>
              <div>
                <Label className="text-blue-400 font-semibold">Mill W. QNTL (Auto)</Label>
                <Input
                  value={calculatedFields.mill_w}
                  readOnly
                  className="bg-blue-900/30 border-blue-700 text-blue-400 text-lg font-bold"
                  data-testid="calculated-mill-w"
                />
              </div>
              <div>
                <Label className="text-purple-400">Cutting %</Label>
                <Input
                  type="number"
                  name="cutting_percent"
                  value={formData.cutting_percent}
                  onChange={handleInputChange}
                  placeholder="5, 5.26..."
                  step="0.01"
                  className="bg-purple-900/30 border-purple-700 text-purple-400"
                  data-testid="input-cutting-percent"
                />
              </div>
              <div>
                <Label className="text-purple-400 font-semibold">Cutting QNTL (Auto)</Label>
                <Input
                  value={`${calculatedFields.cutting_qntl} QNTL`}
                  readOnly
                  className="bg-purple-900/30 border-purple-700 text-purple-400 font-bold"
                  data-testid="calculated-cutting"
                />
                <span className="text-xs text-slate-400">Mill W x {formData.cutting_percent || 0}%</span>
              </div>
              <div>
                <Label className="text-yellow-400">Moisture %</Label>
                <Input
                  type="number"
                  name="moisture"
                  value={formData.moisture}
                  onChange={handleInputChange}
                  placeholder="17, 18..."
                  step="0.1"
                  className="bg-yellow-900/30 border-yellow-700 text-yellow-400"
                  data-testid="input-moisture"
                />
                <span className="text-xs text-slate-400">17% tak no cut</span>
              </div>
              <div>
                <Label className="text-yellow-400 font-semibold">Moisture Cut QNTL (Auto)</Label>
                <Input
                  value={`${calculatedFields.moisture_cut_qntl} QNTL (${calculatedFields.moisture_cut_percent}%)`}
                  readOnly
                  className="bg-yellow-900/30 border-yellow-700 text-yellow-400 font-bold"
                  data-testid="calculated-moisture-cut"
                />
                <span className="text-xs text-slate-400">{formData.moisture > 17 ? `Mill W x ${calculatedFields.moisture_cut_percent}%` : 'No cut'}</span>
              </div>
              <div>
                <Label className="text-slate-300">Disc/Dust/Poll (kg)</Label>
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
                <Label className="text-amber-400 font-semibold">Final W. QNTL (Auto)</Label>
                <Input
                  value={calculatedFields.final_w}
                  readOnly
                  className="bg-amber-900/30 border-amber-700 text-amber-400 text-xl font-bold"
                  data-testid="calculated-final-w"
                />
              </div>
            </CardContent>
          </Card>

          {/* Other Fields */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
  );
}
