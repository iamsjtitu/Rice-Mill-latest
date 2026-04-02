import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, X } from "lucide-react";
import { FY_YEARS, SEASONS } from "@/utils/constants";

export function FilterPanel({ filters, setFilters, hasActiveFilters, clearFilters }) {
  return (
    <div className="mt-4 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Filter className="w-4 h-4" /> Filters
        </h3>
        {hasActiveFilters && (
          <Button
            onClick={clearFilters}
            size="sm"
            variant="ghost"
            className="text-red-400 hover:text-red-300"
            data-testid="clear-filters-btn"
          >
            <X className="w-4 h-4 mr-1" /> Clear All
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <div>
          <Label className="text-slate-300 text-sm">FY Year</Label>
          <Select
            value={filters.kms_year || "all"}
            onValueChange={(value) => setFilters(prev => ({ ...prev, kms_year: value === "all" ? "" : value }))}
          >
            <SelectTrigger className="bg-slate-600 border-slate-500 text-white" data-testid="filter-kms-year">
              <SelectValue placeholder="All Years" />
            </SelectTrigger>
            <SelectContent className="bg-slate-700 border-slate-600">
              <SelectItem value="all" className="text-white hover:bg-slate-600">All Years</SelectItem>
              {FY_YEARS.map(year => (
                <SelectItem key={year} value={year} className="text-white hover:bg-slate-600">{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-slate-300 text-sm">Season</Label>
          <Select
            value={filters.season || "all"}
            onValueChange={(value) => setFilters(prev => ({ ...prev, season: value === "all" ? "" : value }))}
          >
            <SelectTrigger className="bg-slate-600 border-slate-500 text-white" data-testid="filter-season">
              <SelectValue placeholder="All Seasons" />
            </SelectTrigger>
            <SelectContent className="bg-slate-700 border-slate-600">
              <SelectItem value="all" className="text-white hover:bg-slate-600">All Seasons</SelectItem>
              {SEASONS.map(s => (
                <SelectItem key={s} value={s} className="text-white hover:bg-slate-600">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-slate-300 text-sm">Date From</Label>
          <Input
            type="date"
            value={filters.date_from}
            onChange={(e) => setFilters(prev => ({ ...prev, date_from: e.target.value }))}
            className="bg-slate-600 border-slate-500 text-white"
            data-testid="filter-date-from"
          />
        </div>
        <div>
          <Label className="text-slate-300 text-sm">Date To</Label>
          <Input
            type="date"
            value={filters.date_to}
            onChange={(e) => setFilters(prev => ({ ...prev, date_to: e.target.value }))}
            className="bg-slate-600 border-slate-500 text-white"
            data-testid="filter-date-to"
          />
        </div>
        <div>
          <Label className="text-slate-300 text-sm">Truck No.</Label>
          <Input
            value={filters.truck_no}
            onChange={(e) => setFilters(prev => ({ ...prev, truck_no: e.target.value }))}
            placeholder="Filter by truck..."
            className="bg-slate-600 border-slate-500 text-white"
            data-testid="filter-truck-no"
          />
        </div>
        <div>
          <Label className="text-slate-300 text-sm">RST No.</Label>
          <Input
            value={filters.rst_no}
            onChange={(e) => setFilters(prev => ({ ...prev, rst_no: e.target.value }))}
            placeholder="Filter by RST..."
            className="bg-slate-600 border-slate-500 text-white"
            data-testid="filter-rst-no"
          />
        </div>
        <div>
          <Label className="text-slate-300 text-sm">TP No.</Label>
          <Input
            value={filters.tp_no}
            onChange={(e) => setFilters(prev => ({ ...prev, tp_no: e.target.value }))}
            placeholder="Filter by TP..."
            className="bg-slate-600 border-slate-500 text-white"
            data-testid="filter-tp-no"
          />
        </div>
        <div>
          <Label className="text-slate-300 text-sm">Agent Name</Label>
          <Input
            value={filters.agent_name}
            onChange={(e) => setFilters(prev => ({ ...prev, agent_name: e.target.value }))}
            placeholder="Filter by agent..."
            className="bg-slate-600 border-slate-500 text-white"
            data-testid="filter-agent-name"
          />
        </div>
        <div>
          <Label className="text-slate-300 text-sm">Mandi Name</Label>
          <Input
            value={filters.mandi_name}
            onChange={(e) => setFilters(prev => ({ ...prev, mandi_name: e.target.value }))}
            placeholder="Filter by mandi..."
            className="bg-slate-600 border-slate-500 text-white"
            data-testid="filter-mandi-name"
          />
        </div>
      </div>
    </div>
  );
}
