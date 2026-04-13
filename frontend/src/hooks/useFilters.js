import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { FY_YEARS, CURRENT_FY, initialFormState } from "../utils/constants";

const _isElectron = typeof window !== 'undefined' && (window.electronAPI || window.ELECTRON_API_URL);
const BACKEND_URL = _isElectron ? '' : (process.env.REACT_APP_BACKEND_URL || '');
const API = `${BACKEND_URL}/api`;

export function useFilters() {
  const todayStr = new Date().toISOString().split("T")[0];
  const [filters, setFilters] = useState({
    truck_no: "", rst_no: "", tp_no: "", agent_name: "", mandi_name: "",
    kms_year: CURRENT_FY, season: localStorage.getItem("mill_season") || "",
    date_from: todayStr, date_to: todayStr
  });
  const [showFilters, setShowFilters] = useState(false);
  const [mandiCuttingMap, setMandiCuttingMap] = useState({});
  const [mandiTargets, setMandiTargets] = useState([]);

  // Load saved FY setting on mount
  useEffect(() => {
    const loadFySetting = async () => {
      try {
        const res = await axios.get(`${API}/fy-settings`);
        if (res.data?.active_fy) {
          const savedFy = res.data.active_fy;
          const savedStart = parseInt(savedFy.split('-')[0]) || 0;
          const currentStart = parseInt(CURRENT_FY.split('-')[0]) || 0;
          if (savedStart < currentStart) {
            const season = res.data.season || '';
            if (season) localStorage.setItem("mill_season", season);
            setFilters(prev => ({ ...prev, kms_year: CURRENT_FY, season: res.data.season || prev.season }));
            axios.put(`${API}/fy-settings`, { active_fy: CURRENT_FY, season: res.data.season || 'Kharif' }).catch(() => {});
          } else {
            if (res.data.season) localStorage.setItem("mill_season", res.data.season);
            setFilters(prev => ({ ...prev, kms_year: savedFy, season: res.data.season || prev.season }));
          }
        }
      } catch {}
    };
    loadFySetting();
    axios.post(`${API}/cash-book/auto-fix`).then(r => {
      if (r.data?.total_fixes > 0) console.log(`[Auto-Fix] Fixed ${r.data.total_fixes} issues:`, r.data.details);
    }).catch(() => {});
  }, []);

  // Load mandi cutting map from backend on mount
  useEffect(() => {
    const loadCuttingMap = async () => {
      try {
        const res = await axios.get(`${API}/settings/mandi-cutting-map`);
        if (res.data && Object.keys(res.data).length > 0) {
          setMandiCuttingMap(res.data);
          localStorage.setItem('mandi_cutting_map', JSON.stringify(res.data));
        } else {
          const saved = JSON.parse(localStorage.getItem('mandi_cutting_map') || '{}');
          if (Object.keys(saved).length > 0) {
            setMandiCuttingMap(saved);
            for (const [key, value] of Object.entries(saved)) {
              axios.put(`${API}/settings/mandi-cutting-map`, { key, value }).catch(() => {});
            }
          }
        }
      } catch {
        try {
          const saved = JSON.parse(localStorage.getItem('mandi_cutting_map') || '{}');
          setMandiCuttingMap(saved);
          if (Object.keys(saved).length > 0) {
            for (const [key, value] of Object.entries(saved)) {
              axios.put(`${API}/settings/mandi-cutting-map`, { key, value }).catch(() => {});
            }
          }
        } catch { /* ignore */ }
      }
    };
    loadCuttingMap();
  }, []);

  const handleFyChange = useCallback(async (newFy, newSeason) => {
    if (newSeason !== undefined) localStorage.setItem("mill_season", newSeason);
    setFilters(prev => {
      const updated = { ...prev };
      if (newFy !== undefined) updated.kms_year = newFy;
      if (newSeason !== undefined) updated.season = newSeason;
      return updated;
    });
    try {
      await axios.put(`${API}/fy-settings`, {
        active_fy: newFy !== undefined ? newFy : filters.kms_year,
        season: newSeason !== undefined ? newSeason : filters.season,
      });
    } catch {}
  }, [filters.kms_year, filters.season]);

  const findMandiCutting = useCallback((mandiName) => {
    if (!mandiName) return null;
    const searchName = mandiName.toLowerCase().trim();
    if (mandiTargets.length > 0) {
      const target = mandiTargets.find(t => (t.mandi_name || '').toLowerCase().trim() === searchName);
      if (target && target.cutting_percent != null && target.cutting_percent !== 0) return target;
    }
    if (mandiCuttingMap[searchName] && mandiCuttingMap[searchName] > 0) {
      return { mandi_name: mandiName, cutting_percent: mandiCuttingMap[searchName] };
    }
    return null;
  }, [mandiTargets, mandiCuttingMap]);

  const saveCuttingToLocal = useCallback((mandiName, cuttingPercent) => {
    if (!mandiName || !cuttingPercent || parseFloat(cuttingPercent) <= 0) return;
    const key = mandiName.toLowerCase().trim();
    const val = parseFloat(cuttingPercent);
    setMandiCuttingMap(prev => ({ ...prev, [key]: val }));
    try {
      const saved = JSON.parse(localStorage.getItem('mandi_cutting_map') || '{}');
      saved[key] = val;
      localStorage.setItem('mandi_cutting_map', JSON.stringify(saved));
    } catch {}
    axios.put(`${API}/settings/mandi-cutting-map`, { key, value: val }).catch(() => {});
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      truck_no: "", rst_no: "", tp_no: "", agent_name: "", mandi_name: "",
      kms_year: CURRENT_FY, season: "", date_from: todayStr, date_to: todayStr
    });
  }, [todayStr]);

  const hasActiveFilters = filters.truck_no || filters.rst_no || filters.tp_no || filters.agent_name || filters.mandi_name || filters.season || (filters.date_from && filters.date_from !== todayStr) || (filters.date_to && filters.date_to !== todayStr);

  return {
    filters, setFilters, showFilters, setShowFilters,
    mandiTargets, setMandiTargets,
    handleFyChange, findMandiCutting, saveCuttingToLocal,
    clearFilters, hasActiveFilters, todayStr,
  };
}
