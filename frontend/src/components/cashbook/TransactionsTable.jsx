import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Pencil, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import RecordHistory from "@/components/RecordHistory";

import { fmtDate } from "@/utils/date";

import { formatBalanceDrCr, balanceColorClass } from "../../utils/balance-format";

const TransactionsTable = ({
  txns, loading, user,
  selectedIds, toggleSelect, toggleSelectAll, handleBulkDelete,
  handleEdit, handleDelete,
  isOwnerLedger = false,
}) => {
  // Owner Ledger view → Owner ki perspective se direction flip:
  // Only entries stored with account=='owner' need flipping (cashbook stores them in mill perspective):
  //   stored nikasi (Owner ne mill ke liye paisa diya) = JAMA in Owner's ledger (Owner contribution ↑)
  //   stored jama   (Owner ne mill se paisa liya)      = NIKASI in Owner's ledger (Owner withdrawal ↓)
  // Cash/Bank entries with category=<Owner> + party_type=Owner already in Owner perspective — no flip needed.
  const effectiveType = (t) => {
    if (!isOwnerLedger) return t.txn_type;
    if (t.account !== 'owner') return t.txn_type;
    return t.txn_type === 'jama' ? 'nikasi' : 'jama';
  };

  // Display oldest first → newest last (chronological order)
  // (DB returns DESC by date+created_at; we reverse for display)
  const displayTxns = [...txns].reverse();
  // Compute running balance in same order (cumulative)
  const balMap = {};
  let runBal = 0;
  for (const t of displayTxns) {
    runBal += effectiveType(t) === 'jama' ? (t.amount || 0) : -(t.amount || 0);
    balMap[t.id] = Math.round(runBal * 100) / 100;
  }

  // Auto-ledger entries are paired duplicates (one cash + one ledger row). Excluding them from totals
  // prevents the same amount being counted twice. Display rows still show them for transparency.
  // Each visible transaction is a real ledger/cash entry; sum all for totals.
  // (Earlier we excluded `auto_ledger:` prefix entries to avoid double counting,
  //  but that broke party-ledger views where ledger side is the only visible entry.)
  const totalJama = txns.filter(t => effectiveType(t) === 'jama').reduce((s, t) => s + (t.amount || 0), 0);
  const totalNikasi = txns.filter(t => effectiveType(t) === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0);
  const restBalance = totalJama - totalNikasi;

  return (
    <Card className="bg-slate-800 border-slate-200 shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-amber-700 font-semibold">Transactions / लेन-देन</CardTitle>
          {user.role === 'admin' && selectedIds.length > 0 && (
            <Button onClick={handleBulkDelete} variant="destructive" size="sm" className="h-7 text-xs" data-testid="cashbook-bulk-delete">
              <Trash2 className="w-3 h-3 mr-1" /> Delete Selected ({selectedIds.length})
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0"><div className="overflow-x-auto">
        <table className="w-full" style={{ tableLayout: 'fixed', minWidth: '1200px' }}>
        <colgroup>
          {user.role === 'admin' && <col style={{ width: '32px' }} />}
          <col style={{ width: '85px' }} />
          <col style={{ width: '58px' }} />
          <col style={{ width: '70px' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: 'auto' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '90px' }} />
        </colgroup>
        <thead><tr className="border-b border-slate-200">
          {user.role === 'admin' && (
            <th className="px-2 py-2.5 text-left">
              <input type="checkbox" checked={txns.length > 0 && selectedIds.length === txns.length} onChange={toggleSelectAll}
                className="rounded border-slate-300" data-testid="cashbook-select-all" />
            </th>
          )}
          {[
            { label: 'Date', align: 'left', sticky: false }, { label: 'Account', align: 'left', sticky: false }, { label: 'Type', align: 'left', sticky: false },
            { label: 'Party / पार्टी', align: 'left', sticky: false }, { label: 'Party Type', align: 'left', sticky: false }, { label: 'Description', align: 'left', sticky: false },
            { label: 'Jama (Cr)', align: 'right', sticky: false }, { label: 'Nikasi (Dr)', align: 'right', sticky: false }, { label: 'Balance (₹)', align: 'right', sticky: false },
            { label: 'Reference', align: 'left', sticky: false }, { label: 'Actions', align: 'center', sticky: true }
          ].map(h =>
            <th
              key={h.label}
              className={`px-3 py-2.5 text-${h.align} text-slate-600 text-xs font-semibold ${h.sticky ? 'sticky right-0 bg-slate-50 border-l border-slate-200 z-10' : ''}`}
            >{h.label}</th>)}
        </tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={12} className="text-center text-slate-500 py-8">Loading...</td></tr>
          : txns.length === 0 ? <tr><td colSpan={12} className="text-center text-slate-500 py-8">Koi transaction nahi hai. "New Transaction" click karein.</td></tr>
          : displayTxns.map(t => {
            const eType = effectiveType(t);
            return (
            <tr key={t.id} className={`border-b border-slate-100 ${eType === 'jama' ? 'bg-green-50/50' : 'bg-red-50/50'} ${selectedIds.includes(t.id) ? 'ring-1 ring-amber-400' : ''}`} data-testid={`txn-row-${t.id}`}>
              {user.role === 'admin' && (
                <td className="px-2 py-2.5">
                  <input type="checkbox" checked={selectedIds.includes(t.id)} onChange={() => toggleSelect(t.id)}
                    className="rounded border-slate-300" data-testid={`txn-select-${t.id}`} />
                </td>
              )}
              <td className="px-3 py-2.5 text-slate-800 text-xs font-medium whitespace-nowrap">{fmtDate(t.date)}</td>
              <td className="px-3 py-2.5 text-xs">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${t.account === 'cash' ? 'bg-green-100 text-green-700' : t.account === 'bank' ? 'bg-blue-100 text-blue-700' : t.account === 'owner' ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'}`}>
                  {t.account === 'cash' ? 'Cash' : t.account === 'bank' ? 'Bank' : t.account === 'owner' ? `Owner${t.owner_name ? ` (${t.owner_name})` : ''}` : 'Ledger'}
                </span>
              </td>
              <td className="px-3 py-2.5 text-xs">
                <span className={`flex items-center gap-1 font-medium ${eType === 'jama' ? 'text-green-700' : 'text-red-600'}`}>
                  {eType === 'jama' ? <ArrowDownCircle className="w-3 h-3" /> : <ArrowUpCircle className="w-3 h-3" />}
                  {eType === 'jama' ? 'Jama' : 'Nikasi'}
                </span>
              </td>
              <td className="px-3 py-2.5 text-slate-700 text-xs font-semibold truncate">{t.category}</td>
              <td className="px-3 py-2.5 text-xs">
                {t.party_type && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                  t.party_type === 'Truck' ? 'bg-blue-100 text-blue-700' :
                  t.party_type === 'Agent' ? 'bg-purple-100 text-purple-700' :
                  t.party_type === 'Local Party' ? 'bg-amber-100 text-amber-700' :
                  t.party_type === 'Diesel' ? 'bg-orange-100 text-orange-700' :
                  'bg-slate-100 text-slate-600'
                }`}>{t.party_type}</span>}
              </td>
              <td className="px-3 py-2.5 text-slate-600 text-xs truncate">{t.description}</td>
              <td className="px-3 py-2.5 text-right text-xs font-medium text-green-700">
                {eType === 'jama' ? `₹${(t.amount || 0).toLocaleString('en-IN')}` : '-'}
              </td>
              <td className="px-3 py-2.5 text-right text-xs font-medium text-red-600">
                {eType === 'nikasi' ? `₹${(t.amount || 0).toLocaleString('en-IN')}` : '-'}
              </td>
              <td className={`px-3 py-2.5 text-right text-xs font-bold ${balanceColorClass(balMap[t.id])}`} data-testid={`txn-balance-${t.id}`}>
                {formatBalanceDrCr(balMap[t.id])}
              </td>
              <td className="px-3 py-2.5 text-slate-500 text-xs truncate">{t.reference}</td>
              <td className={`px-3 py-2.5 sticky right-0 border-l border-slate-200 ${eType === 'jama' ? 'bg-green-50/90' : 'bg-red-50/90'} ${selectedIds.includes(t.id) ? 'ring-1 ring-amber-400' : ''}`}>
                {user.role === 'admin' && (
                  <div className="flex gap-0.5 items-center justify-center">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-500 hover:text-blue-700" onClick={() => handleEdit(t)} data-testid={`txn-edit-${t.id}`}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <RecordHistory recordId={t.id} label={t.category || t.description} />
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:text-red-700" onClick={() => handleDelete(t.id)} data-testid={`txn-delete-${t.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </td>
            </tr>
            );
          })}
        </tbody>
        {txns.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50">
              {user.role === 'admin' && <td></td>}
              <td colSpan={6} className="px-3 py-2.5 text-xs font-bold text-slate-700">TOTAL ({txns.length} transactions)</td>
              <td className="px-3 py-2.5 text-right text-xs font-bold text-green-700" data-testid="cashbook-total-jama">₹{totalJama.toLocaleString('en-IN')}</td>
              <td className="px-3 py-2.5 text-right text-xs font-bold text-red-600" data-testid="cashbook-total-nikasi">₹{totalNikasi.toLocaleString('en-IN')}</td>
              <td className={`px-3 py-2.5 text-right text-xs font-bold ${balanceColorClass(restBalance)}`} data-testid="cashbook-rest-balance">{formatBalanceDrCr(restBalance)}</td>
              <td></td>
              <td className="sticky right-0 bg-slate-50 border-l border-slate-200"></td>
            </tr>
          </tfoot>
        )}
        </table>
      </div></CardContent>
    </Card>
  );
};

export default TransactionsTable;
