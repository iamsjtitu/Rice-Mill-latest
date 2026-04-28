import { useRef, useCallback, useEffect } from "react";
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
  if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
    e.preventDefault();
    e.stopPropagation();
    focusNextField(testId);
  }
};

const HARDCODED_PARTY_TYPES = ["Cash Party", "Pvt Paddy Purchase", "Rice Sale", "Diesel", "Local Party", "Truck", "Agent", "By-Product Sale", "Staff", "BP Sale", "Owner"];

const TransactionFormDialog = ({
  isOpen, onOpenChange, editingId,
  form, setForm, summary,
  categories, allTxns, partyBalance,
  onSubmit, bankAccounts = [], ownerAccounts = [],
}) => {

  // Owner account names (used in Account dropdown — selected account routes
  // money in/out via that owner's virtual ledger).
  const ownerNamesLC = ownerAccounts.map(o => String(o.name || '').toLowerCase());
  const isOwner = (name) => ownerNamesLC.includes(String(name || '').toLowerCase().trim());

  // Merge hardcoded + custom party types from existing transactions
  const customTypes = [...new Set((allTxns || []).map(t => t.party_type).filter(Boolean))];
  const allPartyTypes = [...new Set([...HARDCODED_PARTY_TYPES, ...customTypes])].sort();

  // Categories augmented with owner account names (so they show in autocomplete
  // with green "Owner" badge; selecting auto-sets party_type='Owner').
  const ownerCategoryNames = ownerAccounts.map(o => o.name).filter(Boolean);
  const augmentedCategories = [...new Set([...(categories || []), ...ownerCategoryNames])].sort();

  const formRef = useRef(null);

  const handleCategoryKeyDown = useCallback((e) => {
    const filtered = augmentedCategories.filter(c => !form.category || c.toLowerCase().includes(form.category.toLowerCase()));
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
      } else if (isOwner(c)) {
        setForm(p => ({ ...p, category: c, party_type: "Owner", _showPartySuggestions: false, _highlightIdx: -1 }));
      } else {
        const match = allTxns.find(t => t.category && t.category.toLowerCase() === c.toLowerCase() && t.party_type);
        setForm(p => ({ ...p, category: c, party_type: match ? match.party_type : (p.party_type || ""), _showPartySuggestions: false, _highlightIdx: -1 }));
      }
    } else if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      setForm(p => ({ ...p, _showPartySuggestions: false, _highlightIdx: -1 }));
      focusNextField('cashbook-form-category');
    } else if (e.key === 'Escape') {
      setForm(p => ({ ...p, _showPartySuggestions: false, _highlightIdx: -1 }));
    }
  }, [categories, form.category, form._showPartySuggestions, form._highlightIdx, form._showManualType, allTxns, setForm]);

  // Ctrl+S to save from anywhere in the form
  useEffect(() => {
    if (!isOpen) return;
    const handleCtrlS = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    document.addEventListener('keydown', handleCtrlS);
    return () => document.removeEventListener('keydown', handleCtrlS);
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-200 text-slate-800 max-w-md" data-testid="cashbook-form-dialog">
        <DialogHeader><DialogTitle className="text-amber-700">{editingId ? 'Edit Transaction' : 'New Transaction'}</DialogTitle></DialogHeader>
        <form ref={formRef} onSubmit={onSubmit} onKeyDown={e => { if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') e.preventDefault(); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-600">Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm(p => ({ ...p, date: e.target.value }))}
                onKeyDown={enterNav('cashbook-form-date')}
                className="border-slate-300 h-8 text-sm" required data-testid="cashbook-form-date" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Account</Label>
              <Select
                value={form.account === 'owner' && form.owner_name ? `owner:${form.owner_name}` : form.account}
                onValueChange={(v) => {
                  if (v.startsWith('owner:')) {
                    const ownerName = v.slice(6);
                    setForm(p => ({ ...p, account: 'owner', owner_name: ownerName, bank_name: "", category: "" }));
                  } else {
                    setForm(p => ({ ...p, account: v, category: "", bank_name: "", owner_name: "" }));
                  }
                }}>
                <SelectTrigger className="border-slate-300 h-8 text-sm" data-testid="cashbook-form-account"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash (नकद)</SelectItem>
                  <SelectItem value="bank">Bank (बैंक)</SelectItem>
                  {ownerAccounts.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-amber-600 font-semibold border-t mt-1">Owner Accounts</div>
                      {ownerAccounts.map(o => (
                        <SelectItem key={o.id} value={`owner:${o.name}`} data-testid={`cashbook-form-owner-${o.id}`}>
                          {o.name} <span className="text-[10px] text-amber-700 ml-1">(मालिक)</span>
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              {summary && form.account !== 'owner' && (
                <p className="text-[10px] mt-1 font-medium" data-testid="cashbook-form-balance">
                  Balance: <span className={`${(form.account === 'cash' ? summary.cash_balance : summary.bank_balance) >= 0 ? 'text-emerald-600' : 'text-red-600'} font-bold`}>
                    Rs.{(form.account === 'cash' ? summary.cash_balance : summary.bank_balance)?.toLocaleString('en-IN')}
                  </span>
                </p>
              )}
              {form.account === 'owner' && form.owner_name && (() => {
                // Owner balance interpreted as "Mill ka karz Owner ki taraf":
                //   - Owner paid mill's vendor (account=owner + nikasi) → contribution +
                //   - Mill received via Owner (account=owner + jama) → withdrawal -
                //   - Mill paid Owner cash (account=cash, category=Owner, nikasi) → +
                //   - Owner gave mill cash (account=cash, category=Owner, jama) → +
                // To keep things simple: ledger value of an Owner txn:
                //   account=owner + nikasi = +amount (Owner contributed to mill)
                //   account=owner + jama   = -amount (Owner withdrew from mill)
                //   category=Owner, party_type=Owner, jama (any account) = +amount
                //   category=Owner, party_type=Owner, nikasi (any account) = -amount
                const isAutoLedger = (t) => /^auto_ledger:/.test(String(t.reference || ''));
                const sign = (t) => {
                  if (isAutoLedger(t)) return 0;
                  if (t.account === 'owner' && t.owner_name === form.owner_name) {
                    return t.txn_type === 'nikasi' ? +(t.amount || 0) : -(t.amount || 0);
                  }
                  if (t.category === form.owner_name && t.party_type === 'Owner') {
                    return t.txn_type === 'jama' ? +(t.amount || 0) : -(t.amount || 0);
                  }
                  return 0;
                };
                const bal = (allTxns || []).reduce((s, t) => s + sign(t), 0);
                return (
                  <p className="text-[10px] mt-1 font-medium" data-testid="cashbook-form-owner-balance">
                    {form.owner_name} Balance: <span className={`${bal >= 0 ? 'text-emerald-600' : 'text-red-600'} font-bold`}>Rs.{bal.toLocaleString('en-IN')}</span>
                  </p>
                );
              })()}
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
                  } else if (isOwner(val)) {
                    setForm(p => ({ ...p, category: val, party_type: "Owner", _showPartySuggestions: true, _highlightIdx: -1 }));
                  } else {
                    const match = allTxns.find(t => t.category && t.category.toLowerCase() === val.toLowerCase() && t.party_type);
                    setForm(p => ({ ...p, category: val, party_type: match ? match.party_type : (p.party_type || ""), _showPartySuggestions: true, _highlightIdx: -1 }));
                  }
                }}
                onFocus={() => setForm(p => ({ ...p, _showPartySuggestions: true, _highlightIdx: -1 }))}
                onBlur={() => setTimeout(() => setForm(p => ({ ...p, _showPartySuggestions: false, _highlightIdx: -1 })), 200)}
                onKeyDown={handleCategoryKeyDown}
                placeholder="Party / Owner name search karein..."
                className="border-slate-300 h-8 text-sm"
                autoComplete="off"
                data-testid="cashbook-form-category"
              />
              {form._showPartySuggestions && (
                (() => {
                  const filtered = augmentedCategories.filter(c => !form.category || c.toLowerCase().includes(form.category.toLowerCase()));
                  return filtered.length > 0 ? (
                    <div className="absolute z-50 w-full mt-1 max-h-40 overflow-auto bg-slate-800 border border-slate-200 rounded-md shadow-lg">
                      {filtered.map((c, i) => {
                        const owner = isOwner(c);
                        const pt = owner ? { party_type: 'Owner' } : allTxns.find(t => t.category === c && t.party_type);
                        const isHighlighted = (form._highlightIdx ?? -1) === i;
                        return (
                          <div key={c}
                            className={`px-3 py-1.5 text-sm cursor-pointer flex justify-between items-center ${isHighlighted ? 'bg-amber-100' : 'hover:bg-amber-50'}`}
                            onMouseDown={() => {
                              if (form._showManualType) {
                                setForm(p => ({ ...p, category: c, _showPartySuggestions: false, _highlightIdx: -1 }));
                              } else if (owner) {
                                setForm(p => ({ ...p, category: c, party_type: "Owner", _showPartySuggestions: false, _highlightIdx: -1 }));
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
                              pt.party_type === 'Owner' ? 'bg-emerald-100 text-emerald-700 font-semibold' :
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
              {summary && form.amount && parseFloat(form.amount) > 0 && form.account !== 'owner' && (
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
                {allPartyTypes.map(pt => (
                  <SelectItem key={pt} value={pt}>{pt}</SelectItem>
                ))}
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
              {form.account === 'owner' ? `Owner: ${form.owner_name || '?'}` : form.account === 'cash' ? 'Cash' : `Bank${form.bank_name ? ` (${form.bank_name})` : ''}`} {form.txn_type === 'jama' ? 'Jama' : 'Nikasi'}: Rs.{parseFloat(form.amount).toLocaleString('en-IN')}
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
