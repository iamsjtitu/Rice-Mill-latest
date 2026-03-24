import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";

import { useState, useRef, useCallback } from "react";

const CashBookFilters = ({
  activeView, txnFilters, setTxnFilters, allTxns,
  filterPartySearch, setFilterPartySearch,
  showFilterPartyDropdown, setShowFilterPartyDropdown,
  allCategoriesForFilter,
}) => {
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const dropdownRef = useRef(null);

  const getFilteredItems = useCallback(() => {
    return filterPartySearch
      ? allCategoriesForFilter.filter(c => c.toLowerCase().includes(filterPartySearch.toLowerCase()))
      : allCategoriesForFilter;
  }, [filterPartySearch, allCategoriesForFilter]);

  const handlePartyKeyDown = (e) => {
    if (!showFilterPartyDropdown) return;
    const items = getFilteredItems();
    const totalItems = items.length + 1; // +1 for "All Parties"

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx(prev => (prev + 1) % totalItems);
      // Scroll into view
      setTimeout(() => {
        const el = dropdownRef.current?.querySelector(`[data-idx="${(highlightIdx + 1) % totalItems}"]`);
        el?.scrollIntoView({ block: "nearest" });
      }, 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx(prev => (prev - 1 + totalItems) % totalItems);
      setTimeout(() => {
        const el = dropdownRef.current?.querySelector(`[data-idx="${(highlightIdx - 1 + totalItems) % totalItems}"]`);
        el?.scrollIntoView({ block: "nearest" });
      }, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIdx === 0) {
        // "All Parties"
        setTxnFilters(p => ({ ...p, category: "" }));
        setFilterPartySearch("");
      } else if (highlightIdx > 0 && highlightIdx <= items.length) {
        setTxnFilters(p => ({ ...p, category: items[highlightIdx - 1] }));
        setFilterPartySearch("");
      }
      setShowFilterPartyDropdown(false);
      setHighlightIdx(-1);
    } else if (e.key === "Escape") {
      setShowFilterPartyDropdown(false);
      setHighlightIdx(-1);
    }
  };
  return (
    <Card className="bg-slate-800 border-slate-700"><CardContent className="p-3">
      <div className="flex gap-3 flex-wrap items-end">
        {activeView === "transactions" && (
        <div>
          <Label className="text-xs text-slate-400">Account</Label>
          <Select value={txnFilters.account || "all"} onValueChange={(v) => setTxnFilters(p => ({ ...p, account: v === "all" ? "" : v }))}>
            <SelectTrigger className="w-32 bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="cashbook-filter-account"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="bank">Bank</SelectItem>
              <SelectItem value="ledger">Ledger</SelectItem>
            </SelectContent>
          </Select>
        </div>
        )}
        <div>
          <Label className="text-xs text-slate-400">Type</Label>
          <Select value={txnFilters.txn_type || "all"} onValueChange={(v) => setTxnFilters(p => ({ ...p, txn_type: v === "all" ? "" : v }))}>
            <SelectTrigger className="w-32 bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="cashbook-filter-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="jama">Jama (In)</SelectItem>
              <SelectItem value="nikasi">Nikasi (Out)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {activeView === "transactions" && (<>
        <div>
          <Label className="text-xs text-slate-400">Party Type</Label>
          <Select value={txnFilters.party_type || "all"} onValueChange={(v) => {
            const pt = v === "all" ? "" : v;
            setTxnFilters(p => ({ ...p, party_type: pt, category: "", ...(pt === "Round Off" ? { account: "" } : {}) }));
          }}>
            <SelectTrigger className="w-36 bg-slate-700 border-slate-600 text-white h-8 text-xs" data-testid="cashbook-filter-party-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {[...new Set(allTxns.map(t => t.party_type).filter(Boolean))].sort().map(pt => (
                <SelectItem key={pt} value={pt}>{pt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-slate-400">Select Party</Label>
          <div className="relative">
            <Input
              value={txnFilters.category ? txnFilters.category : filterPartySearch}
              onChange={(e) => { setFilterPartySearch(e.target.value); setTxnFilters(p => ({ ...p, category: "" })); setShowFilterPartyDropdown(true); setHighlightIdx(-1); }}
              onFocus={() => { setShowFilterPartyDropdown(true); setHighlightIdx(-1); }}
              onBlur={() => setTimeout(() => { setShowFilterPartyDropdown(false); setHighlightIdx(-1); }, 200)}
              onKeyDown={handlePartyKeyDown}
              placeholder="Search party..."
              className="w-44 bg-slate-700 border-slate-600 text-white h-8 text-xs"
              autoComplete="off"
              data-testid="cashbook-filter-category"
            />
            {txnFilters.category && (
              <button onClick={() => { setTxnFilters(p => ({ ...p, category: "" })); setFilterPartySearch(""); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            )}
            {showFilterPartyDropdown && (
              (() => {
                const items = getFilteredItems();
                return items.length > 0 ? (
                  <div ref={dropdownRef} className="absolute z-50 w-56 mt-1 max-h-48 overflow-auto bg-white border border-slate-200 rounded-md shadow-lg">
                    <div data-idx="0" className={`px-3 py-1.5 text-xs cursor-pointer flex justify-between items-center text-slate-500 font-medium border-b border-slate-100 ${highlightIdx === 0 ? 'bg-amber-100' : 'hover:bg-amber-50'}`}
                      onMouseDown={() => { setTxnFilters(p => ({ ...p, category: "" })); setFilterPartySearch(""); setShowFilterPartyDropdown(false); }}>
                      All Parties
                    </div>
                    {items.map((c, i) => {
                      const pt = allTxns.find(t => t.category === c && t.party_type);
                      return (
                        <div key={c} data-idx={i + 1}
                          className={`px-3 py-1.5 text-xs cursor-pointer flex justify-between items-center ${highlightIdx === i + 1 ? 'bg-amber-100' : 'hover:bg-amber-50'}`}
                          onMouseDown={() => { setTxnFilters(p => ({ ...p, category: c })); setFilterPartySearch(""); setShowFilterPartyDropdown(false); }}>
                          <span className="text-slate-800">{c}</span>
                          {pt && pt.party_type && <span className={`text-[9px] px-1 py-0.5 rounded ${
                            pt.party_type === 'Truck' ? 'bg-blue-100 text-blue-700' :
                            pt.party_type === 'Agent' ? 'bg-purple-100 text-purple-700' :
                            pt.party_type === 'Local Party' ? 'bg-amber-100 text-amber-700' :
                            pt.party_type === 'Diesel' ? 'bg-orange-100 text-orange-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>{pt.party_type}</span>}
                        </div>
                      );
                    })}
                  </div>
                ) : null;
              })()
            )}
          </div>
        </div>
        </>)}
        <div>
          <Label className="text-xs text-slate-400">From</Label>
          <Input type="date" value={txnFilters.date_from} onChange={(e) => setTxnFilters(p => ({ ...p, date_from: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-36" />
        </div>
        <div>
          <Label className="text-xs text-slate-400">To</Label>
          <Input type="date" value={txnFilters.date_to} onChange={(e) => setTxnFilters(p => ({ ...p, date_to: e.target.value }))} className="bg-slate-700 border-slate-600 text-white h-8 text-xs w-36" />
        </div>
        <Button onClick={() => setTxnFilters({ account: "", txn_type: "", category: "", party_type: "", date_from: "", date_to: "" })} variant="ghost" size="sm" className="text-slate-400 h-8" data-testid="cashbook-filter-clear"><X className="w-3 h-3 mr-1" /> Clear</Button>
      </div>
    </CardContent></Card>
  );
};

export default CashBookFilters;
