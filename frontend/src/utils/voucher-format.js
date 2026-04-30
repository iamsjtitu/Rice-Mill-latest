// Voucher number display helpers.
// Backend stores integer `voucher_no` (auto-sequenced) plus optional `voucher_no_label`
// (editable user-supplied like "S-001", "CUSTOM-XYZ"). UI prefers the label; otherwise
// falls back to a zero-padded prefix-based label.
export function formatVoucherNo(v, prefix = "S") {
  if (!v) return "";
  const lbl = (v.voucher_no_label || "").trim();
  if (lbl) return lbl;
  const n = Number(v.voucher_no || 0);
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

export function formatSaleVoucher(v) { return formatVoucherNo(v, "S"); }
export function formatPurchaseVoucher(v) { return formatVoucherNo(v, "P"); }
