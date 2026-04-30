// Compact thermal-style receipt builder (~80mm wide) — used across all "Print Receipt" actions.
//
// Builds a printer-friendly HTML slip with:
//   • Mill name + tagline (header)
//   • Title (e.g. "PAYMENT RECEIPT")
//   • Info rows (label / value pairs) — vertical, dashed-separated sections
//   • Amount lines (BHADA / PAID / BALANCE-style total rows)
//   • Status badge (color-coded with border)
//   • Driver + Authorized signature lines
//   • Footer note
//
// Usage:
//   import { buildSlipReceipt } from "../utils/slipReceipt";
//   const html = buildSlipReceipt({ brand, title, sections, amounts, status, ... });
//   safePrintHTML(html);

const escHTML = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const STATUS_COLORS = {
  paid:    "#059669",
  settled: "#059669",
  partial: "#d97706",
  pending: "#dc2626",
  unpaid:  "#dc2626",
  overdue: "#dc2626",
  default: "#475569",
};

/**
 * Build a compact thermal-receipt HTML.
 * @param {Object} opts
 * @param {Object} opts.brand   - { company_name, tagline }
 * @param {string} opts.title   - e.g. "PAYMENT RECEIPT"
 * @param {string} [opts.subtitle] - e.g. "भुगतान रसीद" (Hindi sub-title)
 * @param {string} [opts.docNo] - Optional doc/receipt number
 * @param {Array<{ label, value, bold?, valColor? }>} opts.sections - flat list of rows; pass `null` between groups for dashed separator
 * @param {Array<{ label, value, color?, bold? }>} [opts.amounts] - Amount lines (rendered with larger font)
 * @param {string} [opts.statusLabel] - Eg "PAID" / "PENDING"
 * @param {string} [opts.statusColor] - Hex color (overrides STATUS_COLORS lookup)
 * @param {boolean} [opts.signatures=true] - Show Driver + Authorized signature lines
 * @param {string} [opts.footer="— Computer generated —"]
 * @param {number} [opts.width=280] - Slip pixel width (default ~80mm)
 * @returns {string} HTML document
 */
export function buildSlipReceipt({
  brand = {},
  title = "RECEIPT",
  subtitle = "",
  docNo = "",
  sections = [],
  amounts = [],
  statusLabel = "",
  statusColor = "",
  signatures = true,
  footer = "— Computer generated —",
  width = 280,
}) {
  const company = (brand.company_name || "RICE MILL").toUpperCase();
  const tagline = brand.tagline || "";

  const sCol = statusColor || STATUS_COLORS[statusLabel.toLowerCase()] || STATUS_COLORS.default;

  // Render rows: null/undefined entries become dashed separators
  const rowsHTML = sections.map((s) => {
    if (!s) return `<div class="dashed"></div>`;
    const valStyle = s.valColor ? `color:${s.valColor};` : "";
    const bold = s.bold ? " bold" : "";
    return `<div class="row"><span class="lbl">${escHTML(s.label)}</span><span class="val${bold}" style="${valStyle}">${escHTML(s.value)}</span></div>`;
  }).join("");

  const amountsHTML = amounts.map((a) => {
    const isTotal = !!a.bold;
    const cls = isTotal ? "row total-row" : "row";
    const colorStyle = a.color ? `color:${a.color};` : "";
    return `<div class="${cls}" style="${colorStyle}"><span ${isTotal ? "" : 'class="lbl"'}>${escHTML(a.label)}</span><span ${isTotal ? "" : 'class="val"'} style="${colorStyle}">${escHTML(a.value)}</span></div>`;
  }).join("");

  const statusHTML = statusLabel
    ? `<div class="dashed"></div>
       <div class="center" style="margin: 8px 0 4px;">
         <span class="badge" style="color:${sCol};border-color:${sCol};">${escHTML(statusLabel.toUpperCase())}</span>
       </div>`
    : "";

  const sigHTML = signatures
    ? `<div class="dashed"></div>
       <div class="sig">
         <div class="row" style="gap:20px;">
           <div style="flex:1;text-align:center;"><div class="sig-line">Driver</div></div>
           <div style="flex:1;text-align:center;"><div class="sig-line">Authorized</div></div>
         </div>
       </div>`
    : "";

  return `
    <!DOCTYPE html>
    <html><head><title>${escHTML(title)}${docNo ? ` - ${escHTML(docNo)}` : ""}</title>
    <style>
      @page { size: 80mm auto; margin: 3mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Courier New', monospace; padding: 8px; background: #ddd; }
      .slip { width: ${width}px; margin: 0 auto; background: white; padding: 14px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-size: 11px; line-height: 1.5; color: #000; }
      .center { text-align: center; }
      .right  { text-align: right; }
      .bold   { font-weight: bold; }
      .big    { font-size: 13px; }
      .h1     { font-size: 15px; font-weight: bold; letter-spacing: 0.5px; }
      .dashed { border-top: 1px dashed #555; margin: 6px 0; }
      .row    { display: flex; justify-content: space-between; padding: 2px 0; }
      .row .lbl { color: #444; }
      .row .val { font-weight: 600; }
      .total-row { font-size: 13px; font-weight: bold; padding: 4px 0; }
      .badge { display: inline-block; padding: 3px 10px; border: 2px solid; border-radius: 3px; font-weight: bold; font-size: 12px; letter-spacing: 1px; }
      .sig    { margin-top: 28px; font-size: 10px; }
      .sig-line { border-top: 1px solid #000; padding-top: 2px; margin-top: 28px; }
      @media print {
        body { background: white; padding: 0; }
        .slip { box-shadow: none; padding: 6px 4px; }
        .no-print { display: none; }
      }
    </style></head><body>
      <div class="slip">
        <div class="center h1">${escHTML(company)}</div>
        ${tagline ? `<div class="center" style="font-size:10px;color:#555;margin-top:2px;">${escHTML(tagline)}</div>` : ""}
        <div class="dashed"></div>
        <div class="center bold big">${escHTML(title)}</div>
        ${subtitle ? `<div class="center" style="font-size:10px;color:#666;">${escHTML(subtitle)}</div>` : ""}
        ${docNo ? `<div class="center" style="font-size:10px;color:#666;margin-top:2px;">${escHTML(docNo)}</div>` : ""}
        <div class="dashed"></div>
        ${rowsHTML}
        ${amounts.length ? `<div class="dashed"></div>${amountsHTML}` : ""}
        ${statusHTML}
        ${sigHTML}
        <div class="center" style="font-size:9px;color:#888;margin-top:10px;">${escHTML(footer)}</div>
      </div>
      <div class="no-print" style="text-align:center;margin-top:12px;">
        <button onclick="window.print()" style="background:#f59e0b;color:white;border:none;padding:8px 20px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:bold;">🖨 Print</button>
      </div>
    </body></html>`;
}

export const fmtRupee = (n) => `Rs. ${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
