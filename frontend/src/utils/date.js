// Date format utility: YYYY-MM-DD -> DD-MM-YYYY
export const fmtDate = (d) => {
  if (!d) return '';
  const p = String(d).split('-');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d;
};
