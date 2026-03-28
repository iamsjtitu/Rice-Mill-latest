// Desktop app: use relative URL (frontend & API on same server)
// Web app: use baked-in REACT_APP_BACKEND_URL
const isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
export const API = `${BACKEND_URL}/api`;

export const CURRENT_KMS_YEAR = (() => {
  const now = new Date();
  const y = now.getFullYear();
  // FY = April-March: month >= 3 (April) means current year start
  return now.getMonth() >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
})();

export const KMS_YEARS = [
  "2020-2021", "2021-2022", "2022-2023", "2023-2024",
  "2024-2025", "2025-2026", "2026-2027", "2027-2028"
];

export const SEASONS = ["Kharif", "Rabi"];
