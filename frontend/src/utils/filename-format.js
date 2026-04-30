// Smart filename builder for downloads.
// Embeds party name, date range, kms_year etc. so audit/file-mgmt becomes easy.
//
// Usage:
//   buildFilename({ base: 'paddy_purchase', party: filters.party_name,
//                   dateFrom: filters.date_from, dateTo: filters.date_to, ext: 'pdf' })
//   → "Acme_Traders_paddy_purchase_2026-04-01_to_2026-04-30.pdf"
//
//   buildFilename({ base: 'cash_book', party: 'Titu', subType: 'owner_ledger', ext: 'xlsx' })
//   → "Titu_owner_ledger.xlsx"
//
// Special chars in party names get sanitized (Windows + Linux + WhatsApp safe).

const sanitize = (s) => String(s || '').trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');

// Compact date range:
//   2026-04-01 → 2026-04-30 (same month)  → "Apr-2026"
//   2026-04-01 → 2026-06-30 (multi-month) → "2026-04-01_to_2026-06-30"
//   only one of dateFrom/dateTo → that single date string
const formatDateRange = (dateFrom, dateTo) => {
  const df = (dateFrom || '').trim();
  const dt = (dateTo || '').trim();
  if (!df && !dt) return '';
  if (df && !dt) return df;
  if (!df && dt) return `upto_${dt}`;
  if (df === dt) return df;
  // Same month + first-to-last day → MMM-YYYY
  try {
    const [y1, m1, d1] = df.split('-');
    const [y2, m2, d2] = dt.split('-');
    if (y1 === y2 && m1 === m2) {
      const lastDay = new Date(Number(y1), Number(m1), 0).getDate();
      if (d1 === '01' && Number(d2) === lastDay) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[Number(m1) - 1]}-${y1}`;
      }
    }
  } catch (e) { /* fall through */ }
  return `${df}_to_${dt}`;
};

export function buildFilename({
  base,
  party = '',
  subType = '',     // e.g. 'owner_ledger', 'party_ledger', 'voucher'
  dateFrom = '',
  dateTo = '',
  kmsYear = '',
  extra = '',       // any additional descriptor
  ext = 'pdf',
}) {
  const partySafe = sanitize(party);
  const subSafe = sanitize(subType);
  const dateRange = formatDateRange(dateFrom, dateTo);
  const dateSafe = sanitize(dateRange);
  const kmsSafe = sanitize(kmsYear);
  const extraSafe = sanitize(extra);

  const parts = [];
  if (partySafe) parts.push(partySafe);
  // If party + subType (like Titu + owner_ledger), use them directly. Otherwise base first.
  if (partySafe && subSafe) {
    parts.push(subSafe);
  } else {
    parts.push(sanitize(base) || 'report');
    if (subSafe) parts.push(subSafe);
  }
  if (dateSafe) parts.push(dateSafe);
  // Only include kms_year if no date range (avoids redundancy)
  if (!dateSafe && kmsSafe) parts.push(kmsSafe);
  if (extraSafe) parts.push(extraSafe);

  return `${parts.filter(Boolean).join('_')}.${ext}`;
}

export { sanitize, formatDateRange };
