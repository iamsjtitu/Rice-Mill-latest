import { useEffect, useState } from "react";
import axios from "axios";
import { Label } from "../ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

/**
 * Reusable Payment Account selector for any payment dialog.
 * Renders Cash / Bank / Owner accounts in one Select.
 *
 * Props:
 *   value: { account: 'cash'|'bank'|'owner', bank_name?: string, owner_name?: string }
 *   onChange(value): called whenever the user picks a different option
 *   label: optional label text (default: "Payment Account")
 *   testId: data-testid for the trigger
 *   compact: smaller dialog variant (h-8 vs default)
 */
const PaymentAccountSelect = ({ value, onChange, label = "Payment Account", testId = "payment-account-select", compact = false }) => {
  const [bankAccounts, setBankAccounts] = useState([]);
  const [ownerAccounts, setOwnerAccounts] = useState([]);

  useEffect(() => {
    (async () => {
      try { const r = await axios.get(`${API}/bank-accounts`); setBankAccounts(r.data || []); } catch (e) { /* ignore */ }
      try { const r = await axios.get(`${API}/owner-accounts`); setOwnerAccounts(r.data || []); } catch (e) { /* ignore */ }
    })();
  }, []);

  const composite =
    value.account === 'owner' && value.owner_name ? `owner:${value.owner_name}` :
    value.account === 'bank' && value.bank_name ? `bank:${value.bank_name}` :
    value.account || 'cash';

  const handleChange = (v) => {
    if (v.startsWith('owner:')) onChange({ account: 'owner', owner_name: v.slice(6), bank_name: '' });
    else if (v.startsWith('bank:')) onChange({ account: 'bank', bank_name: v.slice(5), owner_name: '' });
    else onChange({ account: v, bank_name: '', owner_name: '' });
  };

  return (
    <div>
      {label && <Label className="text-slate-300">{label}</Label>}
      <Select value={composite} onValueChange={handleChange}>
        <SelectTrigger className={`bg-slate-700 border-slate-600 text-white ${compact ? 'h-8 text-sm' : ''}`} data-testid={testId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="cash">Cash (नकद)</SelectItem>
          {bankAccounts.length > 0 && (
            <>
              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-indigo-400 font-semibold border-t mt-1">Bank Accounts</div>
              {bankAccounts.map(b => (
                <SelectItem key={b.id} value={`bank:${b.bank_name}`} data-testid={`pay-acc-bank-${b.id}`}>
                  {b.bank_name}
                </SelectItem>
              ))}
            </>
          )}
          {ownerAccounts.length > 0 && (
            <>
              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-amber-400 font-semibold border-t mt-1">Owner Accounts</div>
              {ownerAccounts.map(o => (
                <SelectItem key={o.id} value={`owner:${o.name}`} data-testid={`pay-acc-owner-${o.id}`}>
                  {o.name} <span className="text-[10px] text-amber-400 ml-1">(मालिक)</span>
                </SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  );
};

export default PaymentAccountSelect;
