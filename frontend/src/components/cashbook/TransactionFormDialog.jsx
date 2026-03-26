import { useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import RoundOffInput from "@/components/common/RoundOffInput";

const FIELD_ORDER = [
  'cashbook-form-date',
  'cashbook-form-category',
  'cashbook-form-amount',
  'cashbook-form-manual-party-type',
  'cashbook-form-desc',
  'cashbook-form-ref',
  'round-off-input',
  'cashbook-form-submit',
];

const focusNextField = (currentTestId) => {
  const idx = FIELD_ORDER.indexOf(currentTestId);
  if (idx === -1) return;
  for (let i = idx + 1; i < FIELD_ORDER.length; i++) {
    const el = document.querySelector(`[data-testid="${FIELD_ORDER[i]}"]`);
    if (el && el.offsetParent !== null) {
      el.focus();
      if (el.tagName === 'INPUT') el.select();
      return;
    }
  }
};

const enterNav = (testId) => (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    focusNextField(testId);
  }
};

const TransactionFormDialog = ({
  isOpen, onOpenChange, editingId,
  form, setForm, summary,
  categories, allTxns, partyBalance,
  onSubmit, bankAccounts = [],
}) => {

  const handleCategoryKeyDown = useCallback((e) => {
    const filtered = categories.filter(c => !form.category || c.toLowerCase().includes(form.category.toLowerCase()));
    const idx = form._highlightIdx ?? -1;

    if (e.key === 'ArrowDown' && form._showPartySuggestions && filtered.length > 0) {
      e.preventDefault();
      setForm(p => ({ ...p, _highlightIdx: Math.min((idx + 1), filtered.length - 1) }));
    } else if (e.key === 'ArrowUp' && form._showPartySuggestions && filtered.length > 0) {
      e.preventDefault();
      setForm(p => ({ ...p, _highlightIdx: Math.max((idx - 1), 0) }));
    } else if (e.key === 'Enter' && form._showPartySuggestions && filtered.length > 0 && idx >= 0 && idx < filtered.length) {
      e.preventDefault();
      e.stopPropagation();
      const c = filtered[idx];
      if (form._showManualType) {
        setForm(p => ({ ...p, category: c, _showPartySuggestions: false, _highlightIdx: -1 }));
      } else {
        const match = allTxns.find(t => t.category && t.category.toLowerCase() === c.toLowerCase() && t.party_type);
        setForm(p => ({ ...p, category: c, party_type: match ? match.party_type : (p.party_type || ""), _showPartySuggestions: false, _highlightIdx: -1 }));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      setForm(p => ({ ...p, _showPartySuggestions: false, _highlightIdx: -1 }));
      focusNextField('cashbook-form-category');
    } else if (e.key === 'Escape') {
      setForm(p => ({ ...p, _showPartySuggestions: false, _highlightIdx: -1 }));
    }
  }, [categories, form.category, form._showPartySuggestions, form._highlightIdx, form._showManualType, allTxns, setForm]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-slate-200 text-slate-800 max-w-md" data-testid="cashbook-form-dialog">
        <DialogHeader><DialogTitle className="text-amber-700">{editingId ? 'Edit Transaction' : 'New Transaction'}</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} onKeyDown={e => { if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') e.preventDefault(); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-600">Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm(p => ({ ...p, date: e.target.value }))}
                onKeyDown={enterNav('cashbook-form-date')}
                className="border-slate-300 h-8 text-sm" required data-testid="cashbook-form-date" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Account</Label>
              <Select value={form.account} onValueChange={(v) => setForm(p => ({ ...p, account: v, category: "", bank_name: "" }))}>
                <SelectTrigger className="border-slate-300 h-8 text-sm" data-testid="cashbook-form-account"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash (नकद)</SelectItem>
                  <SelectItem value="bank">Bank (बैंक)</SelectItem>
                </SelectContent>
              </Select>
              {summary && (
                <p className="text-[10px] mt-1 font-medium" data-testid="cashbook-form-balance">
                  Balance: <span className={`${(form.account === 'cash' ? summary.cash_balance : summary.bank_balance) >= 0 ? 'text-emerald-600' : 'text-red-600'} font-bold`}>
                    Rs.{(form.account === 'cash' ? summary.cash_balance : summary.bank_balance)?.toLocaleString('en-IN')}
                  </span>
                </p>
              )}
            </div>
          </div>
          {form.account === 'bank' && bankAccounts.length > 0 && (
            <div>
              <Label className="text-xs text-slate-600">Bank Account</Label>
              <Select value={form.bank_name || "_none"} onValueChange={(v) => setForm(p => ({ ...p, bank_name: v === "_none" ? "" : v }))}>
                <SelectTrigger className="border-slate-300 h-8 text-sm" data-testid="cashbook-form-bank-name"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">-- Select Bank --</SelectItem>
                  {bankAccounts.map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs text-slate-600 font-semibold">Party / Category (Ledger ke liye zaroori)</Label>
            </div>
            <div className="relative">
              <Input
                value={form.category}
                onChange={(e) => {
                  const val = e.target.value;
                  if (form._showManualType) {
                    setForm(p => ({ ...p, category: val, _showPartySuggestions: true, _highlightIdx: -1 }));
                  } else {
                    const match = allTxns.find(t => t.category && t.category.toLowerCase() === val.toLowerCase() && t.party_type);
                    setForm(p => ({ ...p, category: val, party_type: match ? match.party_type : (p.party_type || ""), _showPartySuggestions: true, _highlightIdx: -1 }));
                  }
                }}
                onFocus={() => setForm(p => ({ ...p, _showPartySuggestions: true, _highlightIdx: -1 }))}
                onBlur={() => setTimeout(() => setForm(p => ({ ...p, _showPartySuggestions: false, _highlightIdx: -1 })), 200)}
                onKeyDown={handleCategoryKeyDown}
                placeholder="Party name search karein..."
                className="border-slate-300 h-8 text-sm"
                autoComplete="off"
                data-testid="cashbook-form-category"
              />
              {form._showPartySuggestions && (
                (() => {
                  const filtered = categories.filter(c => !form.category || c.toLowerCase().includes(form.category.toLowerCase()));
                  return filtered.length > 0 ? (
                    <div className="absolute z-50 w-full mt-1 max-h-40 overflow-auto bg-white border border-slate-200 rounded-md shadow-lg">
                      {filtered.map((c, i) => {
                        const pt = allTxns.find(t => t.category === c && t.party_type);
                        const isHighlighted = (form._highlightIdx ?? -1) === i;
                        return (
                          <div key={c}
                            className={`px-3 py-1.5 text-sm cursor-pointer flex justify-between items-center ${isHighlighted ? 'bg-amber-100' : 'hover:bg-amber-50'}`}
                            onMouseDown={() => {
                              if (form._showManualType) {
                                setForm(p => ({ ...p, category: c, _showPartySuggestions: false, _highlightIdx: -1 }));
                              } else {
                                const match = allTxns.find(t => t.category && t.category.toLowerCase() === c.toLowerCase() && t.party_type);
                                setForm(p => ({ ...p, category: c, party_type: match ? match.party_type : (p.party_type || ""), _showPartySuggestions: false, _highlightIdx: -1 }));
                              }
                            }}
                            onMouseEnter={() => setForm(p => ({ ...p, _highlightIdx: i }))}>
                            <span className="text-slate-800">{c}</span>
                            {pt && pt.party_type && <span className={`text-[10px] px-1.5 py-0.5 rounded ${
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
            {partyBalance && (
              <div className="mt-1 p-1.5 bg-amber-50 border border-amber-200 rounded text-[10px]" data-testid="cashbook-party-balance">
                <span className="font-semibold text-amber-800">{form.category}:</span>
                <span className="text-green-700 ml-2">Jama: Rs.{(partyBalance.totalIn || 0).toLocaleString('en-IN')}</span>
                <span className="text-red-600 ml-2">Nikasi: Rs.{(partyBalance.totalOut || 0).toLocaleString('en-IN')}</span>
                <span className={`ml-2 font-bold ${(partyBalance.balance || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  Balance: Rs.{(partyBalance.balance || 0).toLocaleString('en-IN')}
                </span>
                <span className="text-slate-500 ml-1">({partyBalance.count} txns)</span>
              </div>
            )}
            <p className="text-[9px] text-amber-600 mt-0.5">* Yahan jo name doge wo Party Ledger mein automatically aayega</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-600">Type</Label>
              <Select value={form.txn_type} onValueChange={(v) => setForm(p => ({ ...p, txn_type: v }))}>
                <SelectTrigger className="border-slate-300 h-8 text-sm" data-testid="cashbook-form-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="jama">Jama (Cr)</SelectItem>
                  <SelectItem value="nikasi">Nikasi (Dr)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-600">Amount (Rs.)</Label>
              <Input type="number" step="0.01" value={form.amount}
                onChange={(e) => setForm(p => ({ ...p, amount: e.target.value }))}
                onKeyDown={enterNav('cashbook-form-amount')}
                placeholder="0.00" className="border-slate-300 h-8 text-sm" required data-testid="cashbook-form-amount" />
              {summary && form.amount && parseFloat(form.amount) > 0 && (
                <p className="text-[10px] mt-1 font-medium" data-testid="cashbook-form-new-balance">
                  After: <span className={`font-bold ${
                    ((form.account === 'cash' ? summary.cash_balance : summary.bank_balance) + (form.txn_type === 'jama' ? 1 : -1) * parseFloat(form.amount)) >= 0
                      ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    Rs.{(((form.account === 'cash' ? (summary.cash_balance || 0) : (summary.bank_balance || 0)) + (form.txn_type === 'jama' ? 1 : -1) * parseFloat(form.amount)) || 0).toLocaleString('en-IN')}
                  </span>
                  <span className={`ml-1 ${form.txn_type === 'jama' ? 'text-emerald-600' : 'text-red-600'}`}>
                    ({form.txn_type === 'jama' ? '+' : '-'}Rs.{parseFloat(form.amount).toLocaleString('en-IN')})
                  </span>
                </p>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-600">Party Type (Auto / Manual)</Label>
            <Select value={form._showManualType ? "_manual" : (form.party_type || "_auto")} onValueChange={(v) => setForm(p => ({ ...p, party_type: v === "_auto" ? "" : v === "_manual" ? (p.party_type || "") : v, _showManualType: v === "_manual" }))}>
              <SelectTrigger className="border-slate-300 h-8 text-sm" data-testid="cashbook-form-party-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_auto">Auto Detect</SelectItem>
                <SelectItem value="Cash Party">Cash Party</SelectItem>
                <SelectItem value="Pvt Paddy Purchase">Pvt Paddy Purchase</SelectItem>
                <SelectItem value="Rice Sale">Rice Sale</SelectItem>
                <SelectItem value="Diesel">Diesel</SelectItem>
                <SelectItem value="Local Party">Local Party</SelectItem>
                <SelectItem value="Truck">Truck</SelectItem>
                <SelectItem value="Agent">Agent</SelectItem>
                <SelectItem value="By-Product Sale">By-Product Sale</SelectItem>
                <SelectItem value="Staff">Staff</SelectItem>
                <SelectItem value="_manual">-- Manual (Type karein) --</SelectItem>
              </SelectContent>
            </Select>
            {form._showManualType && (
              <Input value={form.party_type} onChange={e => setForm(p => ({ ...p, party_type: e.target.value }))}
                onKeyDown={enterNav('cashbook-form-manual-party-type')}
                placeholder="Custom party type likhein..." className="border-slate-300 h-8 text-sm mt-1" autoFocus data-testid="cashbook-form-manual-party-type" />
            )}
          </div>
          <div>
            <Label className="text-xs text-slate-600">Description</Label>
            <Input value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
              onKeyDown={enterNav('cashbook-form-desc')}
              placeholder="Details likhein..." className="border-slate-300 h-8 text-sm" data-testid="cashbook-form-desc" />
          </div>
          <div>
            <Label className="text-xs text-slate-600">Reference (Cheque No / Receipt etc.)</Label>
            <Input value={form.reference} onChange={(e) => setForm(p => ({ ...p, reference: e.target.value }))}
              onKeyDown={enterNav('cashbook-form-ref')}
              placeholder="Optional" className="border-slate-300 h-8 text-sm" data-testid="cashbook-form-ref" />
          </div>
          <RoundOffInput
            value={form.round_off || ""}
            onChange={(val) => setForm(p => ({ ...p, round_off: val }))}
            onKeyDown={enterNav('round-off-input')}
            amount={parseFloat(form.amount) || 0}
            darkMode={false}
          />
          {parseFloat(form.amount) > 0 && (
            <div className={`p-2 rounded text-sm font-medium ${form.txn_type === 'jama' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
              {form.account === 'cash' ? 'Cash' : `Bank${form.bank_name ? ` (${form.bank_name})` : ''}`} {form.txn_type === 'jama' ? 'Jama' : 'Nikasi'}: Rs.{parseFloat(form.amount).toLocaleString('en-IN')}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white flex-1" data-testid="cashbook-form-submit">
              {editingId ? 'Update Transaction' : 'Save Transaction'}
            </Button>
            <Button type="button" variant="outline" className="border-slate-300 text-slate-600" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionFormDialog;
