/**
 * Unified RST cross-check hook + inline warning component.
 * v104.44.28 — Calls /api/rst-check which detects:
 *   - Duplicates in same context (sale/purchase)
 *   - Cross-type collisions (purchase RST in sale, vice versa)
 *
 * Usage:
 *   const { checkRst, RstWarning } = useRstCheck({ context: 'sale', excludeId: editingId });
 *   // In form:
 *   <Input value={form.rst_no} onChange={e => { setForm(...); checkRst(e.target.value); }} />
 *   <RstWarning />
 *
 *   // On submit:
 *   const result = await checkRst(form.rst_no, { immediate: true });
 *   if (result.hasIssue) { const ok = await showConfirm(...); if (!ok) return; }
 */
import { useState, useCallback, useRef } from "react";
import axios from "axios";

const _isElectron = typeof window !== "undefined" && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? "" : (process.env.REACT_APP_BACKEND_URL || "");
const API = `${BACKEND_URL}/api`;

const COLLECTION_LABELS = {
  sale_vouchers: "Sale Voucher",
  by_product_sale_vouchers: "By-Product Sale",
  purchase_vouchers: "Purchase Voucher",
  private_paddy: "Paddy Purchase",
  entries: "Mill Entry",
  vehicle_weights: "Vehicle Weight",
};

export function useRstCheck({ context = "sale", excludeId = "" } = {}) {
  const [data, setData] = useState(null); // { exists_same, exists_other }
  const abortRef = useRef(null);
  const lastRstRef = useRef("");

  const checkRst = useCallback(async (rstNo, { immediate = false } = {}) => {
    const rst = String(rstNo || "").trim();
    lastRstRef.current = rst;
    if (!rst) { setData(null); return { hasIssue: false, data: null }; }

    // Debounce — skip duplicate rapid checks unless immediate
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await axios.get(`${API}/rst-check`, {
        params: { rst_no: rst, context, exclude_id: excludeId },
        signal: ctrl.signal,
      });
      if (lastRstRef.current !== rst) return { hasIssue: false, data: null }; // stale
      setData(res.data);
      const hasIssue = (res.data.exists_same?.length || 0) + (res.data.exists_other?.length || 0) > 0;
      return { hasIssue, data: res.data };
    } catch (e) {
      if (!ctrl.signal.aborted) setData(null);
      return { hasIssue: false, data: null };
    }
  }, [context, excludeId]);

  const clear = useCallback(() => setData(null), []);

  const RstWarning = () => {
    if (!data) return null;
    const same = data.exists_same || [];
    const other = data.exists_other || [];
    if (!same.length && !other.length) return null;

    return (
      <div className="mt-1 space-y-1" data-testid="rst-check-warning">
        {same.map((m, i) => {
          const label = COLLECTION_LABELS[m.collection] || m.collection;
          const extraLabel = m.trans_type ? ` (${m.trans_type})` : "";
          return (
            <div key={`s-${i}`} className="text-[10px] text-amber-400 flex items-center gap-1">
              ⚠️ Duplicate: {label}{extraLabel} — {m.voucher_no ? `V.No ${m.voucher_no} · ` : ""}{m.party_name || "-"} · {m.date || "-"}
            </div>
          );
        })}
        {other.map((m, i) => {
          const label = COLLECTION_LABELS[m.collection] || m.collection;
          const extraLabel = m.trans_type ? ` (${m.trans_type})` : "";
          return (
            <div key={`o-${i}`} className="text-[10px] text-red-400 flex items-center gap-1 font-medium" data-testid={`rst-cross-warn-${i}`}>
              🚫 Cross-type: Ye RST {context === "sale" ? "PURCHASE" : "SALE"} side me hai — {label}{extraLabel} · {m.party_name || "-"} · {m.date || "-"}
            </div>
          );
        })}
      </div>
    );
  };

  const buildConfirmMessage = () => {
    if (!data) return "";
    const same = data.exists_same || [];
    const other = data.exists_other || [];
    const lines = [];
    if (same.length) {
      lines.push(`⚠️ ${context === "sale" ? "Sale" : "Purchase"} me duplicate mile:`);
      same.forEach(m => lines.push(`• ${COLLECTION_LABELS[m.collection] || m.collection}: V.No ${m.voucher_no || "-"} · ${m.party_name || "-"} · ${m.date || "-"}`));
    }
    if (other.length) {
      lines.push(`\n🚫 CROSS-TYPE ALERT — Ye RST ${context === "sale" ? "PURCHASE" : "SALE"} me maujood hai:`);
      other.forEach(m => lines.push(`• ${COLLECTION_LABELS[m.collection] || m.collection}: ${m.party_name || "-"} · ${m.date || "-"}${m.voucher_no ? ` · V.No ${m.voucher_no}` : ""}`));
    }
    lines.push(`\nKya aap phir bhi is RST ko ${context === "sale" ? "sale" : "purchase"} me save karna chahte hain?`);
    return lines.join("\n");
  };

  return { checkRst, clear, data, RstWarning, buildConfirmMessage };
}
