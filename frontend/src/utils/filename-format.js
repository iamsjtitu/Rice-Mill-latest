// Smart filename builder for downloads.
// Embeds party name, date range, kms_year etc. so audit/file-mgmt becomes easy.
//
// Output style: HYPHEN-separated, lowercase (matches user's "{name}-report" preference)
//
// Usage:
//   buildFilename({ base: 'paddy_purchase', party: filters.party_name,
//                   dateFrom: filters.date_from, dateTo: filters.date_to, ext: 'pdf' })
//   → "acme-traders-paddy-purchase-2026-04-01-to-2026-04-30.pdf"
//
//   buildFilename({ base: 'cash_book', party: 'Titu', subType: 'owner_ledger', ext: 'xlsx' })
//   → "titu-owner-ledger.xlsx"
//
//   buildFilename({ base: 'debujain', dateFrom: '2026-04-01', dateTo: '2026-04-30', ext: 'pdf' })
//   → "debujain-report-2026-04-01-to-2026-04-30.pdf"
//
// Special chars in party names get sanitized (Windows + Linux + WhatsApp safe).

const sanitize = (s) => String(s || '').trim()
  .replace(/[^A-Za-z0-9 _-]+/g, '')   // strip special chars
  .replace(/[\s_]+/g, '-')              // spaces & underscores → hyphen
  .replace(/-+/g, '-')                  // collapse multiple hyphens
  .replace(/^-+|-+$/g, '')              // trim leading/trailing hyphens
  .toLowerCase();

// Compact date range:
//   2026-04-01 → 2026-04-30 (same month + full range)  → "Apr-2026"
//   2026-04-01 → 2026-06-30 (multi-month) → "2026-04-01-to-2026-06-30"
//   only one of dateFrom/dateTo → "{date}-to-end" or "start-to-{date}"
const formatDateRange = (dateFrom, dateTo) => {
  const df = (dateFrom || '').trim();
  const dt = (dateTo || '').trim();
  if (!df && !dt) return '';
  if (df && !dt) return `${df}-to-end`;
  if (!df && dt) return `start-to-${dt}`;
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
  return `${df}-to-${dt}`;
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
  const baseSafe = sanitize(base) || 'report';
  const dateRange = formatDateRange(dateFrom, dateTo);
  const dateSafe = sanitize(dateRange);
  const kmsSafe = sanitize(kmsYear);
  const extraSafe = sanitize(extra);

  const parts = [];
  if (partySafe) {
    // Party-prefixed: "{party}-{base/subType}-..."
    parts.push(partySafe);
    parts.push(subSafe || baseSafe);
  } else {
    // No party: "{base}-report" + suffixes
    parts.push(baseSafe);
    if (!baseSafe.endsWith('-report') && !baseSafe.endsWith('report')) parts.push('report');
    if (subSafe) parts.push(subSafe);
  }
  if (dateSafe) parts.push(dateSafe);
  // Only include kms_year if no date range (avoids redundancy)
  if (!dateSafe && kmsSafe) parts.push(kmsSafe);
  if (extraSafe) parts.push(extraSafe);

  return `${parts.filter(Boolean).join('-').replace(/-+/g, '-')}.${ext}`;
}

export { sanitize, formatDateRange };
