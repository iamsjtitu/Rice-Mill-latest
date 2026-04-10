import axios from "axios";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
export const API = `${BACKEND_URL}/api`;

export const STOCK_ITEMS = [
  { key: "paddy", label: "Paddy / धान", unit: "Qntl" },
  { key: "rice_usna", label: "Rice Usna / उसना चावल", unit: "Qntl" },
  { key: "rice_raw", label: "Rice Raw / कच्चा चावल", unit: "Qntl" },
  { key: "bran", label: "Bran / भूसी", unit: "Qntl" },
  { key: "kunda", label: "Kunda / कुंडा", unit: "Qntl" },
  { key: "broken", label: "Broken / टूटा", unit: "Qntl" },
  { key: "kanki", label: "Kanki / कंकी", unit: "Qntl" },
  { key: "husk", label: "Husk / छिलका", unit: "Qntl" },
  { key: "frk", label: "FRK", unit: "Qntl" },
];

export const ROLES = [
  { value: "admin", label: "Admin", desc: "Full access - sab kuch kar sakta hai" },
  { value: "entry_operator", label: "Entry Operator", desc: "Sirf entries add/edit" },
  { value: "accountant", label: "Accountant", desc: "Payments, Cash Book, Reports" },
  { value: "viewer", label: "Viewer", desc: "Sirf dekhna - koi edit nahi" },
];

export const PERMISSION_DEFS = [
  { key: "can_edit", label: "Edit Access", desc: "Koi bhi entry edit kar sakta hai" },
  { key: "can_delete", label: "Delete Access", desc: "Records delete kar sakta hai" },
  { key: "can_export", label: "Export (Excel/PDF)", desc: "Data export kar sakta hai" },
  { key: "can_see_payments", label: "Payments Tab", desc: "Payments dekh/manage kar sakta hai" },
  { key: "can_see_cashbook", label: "Cash Book Tab", desc: "Cash Book dekh/manage kar sakta hai" },
  { key: "can_see_reports", label: "Reports Tab", desc: "Reports dekh sakta hai" },
  { key: "can_edit_settings", label: "Settings Access", desc: "Settings change kar sakta hai" },
  { key: "can_manual_weight", label: "Manual Weight", desc: "Weighbridge mein manually weight type kar sakta hai" },
  { key: "can_edit_rst", label: "RST Edit", desc: "Auto Vehicle Weight mein RST number manually edit kar sakta hai" },
  { key: "can_change_date", label: "Date Change", desc: "Auto Vehicle Weight mein date change kar sakta hai" },
  { key: "can_edit_vw_linked", label: "VW Linked Edit", desc: "Mill Entry mein use hui VW entry ko edit/delete kar sakta hai" },
];

export const ROLE_DEFAULTS = {
  admin: { can_edit: true, can_delete: true, can_export: true, can_see_payments: true, can_see_cashbook: true, can_see_reports: true, can_edit_settings: true, can_manual_weight: true, can_edit_rst: true, can_change_date: true, can_edit_vw_linked: true },
  entry_operator: { can_edit: true, can_delete: false, can_export: false, can_see_payments: false, can_see_cashbook: false, can_see_reports: false, can_edit_settings: false, can_manual_weight: false, can_edit_rst: false, can_change_date: false, can_edit_vw_linked: false },
  accountant: { can_edit: true, can_delete: false, can_export: true, can_see_payments: true, can_see_cashbook: true, can_see_reports: true, can_edit_settings: false, can_manual_weight: false, can_edit_rst: false, can_change_date: false, can_edit_vw_linked: false },
  viewer: { can_edit: false, can_delete: false, can_export: true, can_see_payments: true, can_see_cashbook: true, can_see_reports: true, can_edit_settings: false, can_manual_weight: false, can_edit_rst: false, can_change_date: false, can_edit_vw_linked: false },
};

export const COLLECTION_LABELS = {
  mill_entries: "Mill Entry",
  cash_transactions: "Cash Book",
  private_paddy: "Pvt Paddy",
  rice_sales: "Rice Sale",
  truck_payments: "Truck Payment",
};

export const ACTION_COLORS = {
  create: "bg-green-600/20 text-green-400",
  update: "bg-amber-600/20 text-amber-400",
  delete: "bg-red-600/20 text-red-400",
  payment: "bg-blue-600/20 text-blue-400",
  undo_payment: "bg-red-600/20 text-red-400",
};
