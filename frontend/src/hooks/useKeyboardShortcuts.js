import { useEffect, useCallback } from "react";
import { toast } from "sonner";
import { CURRENT_FY, initialFormState } from "../utils/constants";

export function useKeyboardShortcuts({
  activeTab, setActiveTabSafe, selectedEntries, fetchEntries, fetchTotals,
  setIsDialogOpen, setEditingId, setFormData, setShowFilters, setShowShortcuts,
  setQuickSearchOpen, filters
}) {
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;

      // Prevent browser back navigation on Backspace
      if (e.key === 'Backspace' && !inInput) { e.preventDefault(); return; }
      if (e.key === 'Backspace' && e.target.readOnly) { e.preventDefault(); return; }

      // Backspace on empty field = go to previous field
      if (e.key === 'Backspace' && inInput && !e.ctrlKey && !e.altKey) {
        const el = e.target;
        const val = el.value || el.textContent || '';
        if (val === '' || el.readOnly) {
          e.preventDefault();
          const container = el.closest('[role="dialog"]') || el.closest('form') || el.closest('.space-y-4, .space-y-3, .grid');
          if (container) {
            const fields = Array.from(container.querySelectorAll(
              'input:not([type="hidden"]):not([disabled]):not([readonly]), textarea:not([disabled]), select:not([disabled])'
            )).filter(f => f.offsetParent !== null && f.offsetWidth > 0);
            const idx = fields.indexOf(el);
            if (idx > 0) { fields[idx - 1].focus(); if (fields[idx - 1].select) fields[idx - 1].select(); }
          }
          return;
        }
      }

      // Enter key = move to next field
      if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (e.target.tagName === 'BUTTON') return;
        if (!inInput) return;
        if (e.target.tagName === 'TEXTAREA') return;
        const el = e.target;
        const container = el.closest('[role="dialog"]') || el.closest('form') || el.closest('.space-y-4, .space-y-3, .grid');
        if (container) {
          const fields = Array.from(container.querySelectorAll(
            'input:not([type="hidden"]):not([disabled]):not([readonly]), textarea:not([disabled]), button[type="submit"], [data-testid="save-btn"]'
          )).filter(f => f.offsetParent !== null && f.offsetWidth > 0);
          const idx = fields.indexOf(el);
          if (idx >= 0 && idx < fields.length - 1) {
            e.preventDefault(); e.stopPropagation();
            fields[idx + 1].focus(); if (fields[idx + 1].select) fields[idx + 1].select();
            return;
          }
          if (idx === fields.length - 1) {
            e.preventDefault(); e.stopPropagation();
            const submitBtn = container.querySelector('button[type="submit"], [data-testid="save-btn"], [data-testid="submit-btn"]');
            if (submitBtn) submitBtn.click();
            return;
          }
        }
      }

      // Ctrl+S: Save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        const submitBtn = document.querySelector('form button[type="submit"], [data-testid="save-btn"], [data-testid="submit-btn"]');
        if (submitBtn) { submitBtn.click(); toast.info("Save (Ctrl+S)"); }
        return;
      }

      // Ctrl+N: New Entry
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        if (activeTab === "entries") {
          setIsDialogOpen(true); setEditingId(null);
          setFormData({...initialFormState, kms_year: filters.kms_year || CURRENT_FY, season: filters.season || "Kharif"});
        } else {
          const addBtn = document.querySelector('[data-testid$="-add-btn"]');
          if (addBtn) addBtn.click();
        }
        toast.info("New (Ctrl+N)");
        return;
      }

      // Ctrl+F: Filter
      if (e.ctrlKey && e.key === 'f') { e.preventDefault(); setShowFilters(true); toast.info("Filters (Ctrl+F)"); return; }
      // Ctrl+R: Refresh
      if (e.ctrlKey && e.key === 'r') { e.preventDefault(); fetchEntries(); fetchTotals(); toast.info("Refreshed (Ctrl+R)"); return; }
      // Ctrl+P: Print
      if (e.ctrlKey && e.key === 'p') { e.preventDefault(); window.print(); return; }
      // Ctrl+K: Quick Search
      if (e.ctrlKey && e.key === 'k') { e.preventDefault(); setQuickSearchOpen(true); return; }
      // Ctrl+Delete: Delete selected
      if (e.ctrlKey && (e.key === 'Delete' || e.key === 'Backspace') && !inInput) {
        e.preventDefault();
        if (selectedEntries.length > 0) {
          const delBtn = document.querySelector('[data-testid="bulk-delete-btn"]');
          if (delBtn) delBtn.click();
        }
        return;
      }

      // Don't trigger remaining shortcuts when typing
      if (inInput) return;

      if (e.key === 'Escape') { setIsDialogOpen(false); setShowFilters(false); setShowShortcuts(false); }
      if (e.key === '?' || (e.shiftKey && e.key === '/')) { e.preventDefault(); setShowShortcuts(true); }

      // Alt + tab navigation
      if (e.altKey) {
        const tabMap = {
          'e': 'entries', 'd': 'dashboard', 'p': 'payments', 'm': 'milling',
          'b': 'cashbook', 't': 'dctracker', 'o': 'reports', 'g': 'vouchers',
          'k': 'mill-parts', 's': 'staff', 'i': 'settings', 'y': 'fy-summary',
        };
        const tabNames = {
          'entries': 'Entries', 'dashboard': 'Dashboard', 'payments': 'Payments', 'milling': 'Milling',
          'cashbook': 'Cash Book', 'dctracker': 'DC Tracker', 'reports': 'Reports', 'vouchers': 'Vouchers',
          'mill-parts': 'Mill Parts', 'staff': 'Staff', 'settings': 'Settings', 'fy-summary': 'FY Summary',
        };
        if (tabMap[e.key]) { e.preventDefault(); setActiveTabSafe(tabMap[e.key]); toast.info(`${tabNames[tabMap[e.key]]} (Alt+${e.key.toUpperCase()})`); }
        if (e.key === 'n') { e.preventDefault(); setActiveTabSafe("entries"); setIsDialogOpen(true); setEditingId(null); setFormData({...initialFormState, kms_year: filters.kms_year || CURRENT_FY, season: filters.season || "Kharif"}); toast.info("New Entry (Alt+N)"); }
        if (e.key === 'r') { e.preventDefault(); fetchEntries(); fetchTotals(); toast.info("Refreshed (Alt+R)"); }
        if (e.key === 'f') { e.preventDefault(); setShowFilters(true); toast.info("Filters (Alt+F)"); }
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [fetchEntries, fetchTotals, activeTab, selectedEntries, setActiveTabSafe, setIsDialogOpen, setEditingId, setFormData, setShowFilters, setShowShortcuts, setQuickSearchOpen, filters]);
}
