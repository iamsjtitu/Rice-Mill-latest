// Helpers to integrate Bhada (Lumpsum) field across BP Sale, Sale Voucher, DC Delivery,
// Pvt Purchase Voucher forms — single source of truth = `vehicle_weights.bhada`.
//
// On RST entry → fetch existing VW entry + its bhada (if any).
// On form save → call /vehicle-weight/{id}/edit?username=... with `{bhada}` so the
// canonical VW.bhada updates AND the existing _sync_*_bhada_ledger triggers automatically.
//
// This keeps a single ledger entry per RST trip — no duplication across forms.

import axios from "axios";

const API = (process.env.REACT_APP_BACKEND_URL || "") + "/api";

/**
 * Fetch the VW entry for a given RST. Returns null if not found.
 * Optionally returns just the bhada via `?onlyBhada=true`.
 */
export async function fetchVwByRst(rstNo, kmsYear = "") {
  if (!rstNo) return null;
  try {
    const res = await axios.get(`${API}/vehicle-weight/by-rst/${encodeURIComponent(rstNo)}`, {
      params: kmsYear ? { kms_year: kmsYear } : {},
    });
    // Endpoint shape: returns the entry directly OR { entry: {...} }
    return res.data?.entry || res.data || null;
  } catch {
    return null;
  }
}

/**
 * Update VW.bhada for the entry matching `rstNo`. Idempotent — backend's
 * `_sync_*_bhada_ledger` keeps the truck-owner ledger in sync.
 *
 * v104.44.46 — If VW entry doesn't exist, auto-create a minimal stub VW entry
 * (so user doesn't have to manually create VW first). The stub has:
 *   - rst_no, kms_year, bhada, vehicle_no, party_name, trans_type, date
 *   - first_wt = 0 (placeholder; user can edit later)
 *   - status = "pending" (incomplete weight)
 * This way truck-owner ledger sync triggers automatically.
 *
 * @param {string|number} rstNo
 * @param {number} bhada — the new lump-sum amount (0 to clear)
 * @param {string} username — for audit trail
 * @param {string} kmsYear — optional, for filtering
 * @param {object} stubData — optional fields for auto-create: { vehicle_no, party_name, trans_type, date, season, farmer_name }
 * @returns {Promise<{ok:boolean, vw_id?:string, auto_created?:boolean, message?:string}>}
 */
export async function updateVwBhada(rstNo, bhada, username = "system", kmsYear = "", stubData = {}) {
  if (!rstNo) return { ok: false, message: "no_rst" };
  let vw = await fetchVwByRst(rstNo, kmsYear);

  // Auto-create stub VW if not found AND bhada > 0 OR we have stub data
  if ((!vw || !vw.id) && (parseFloat(bhada) > 0 || stubData.vehicle_no || stubData.party_name)) {
    try {
      const payload = {
        rst_no: parseInt(rstNo, 10) || rstNo,
        kms_year: kmsYear || "",
        season: stubData.season || "Kharif",
        date: stubData.date || new Date().toISOString().slice(0, 10),
        vehicle_no: (stubData.vehicle_no || "").toUpperCase(),
        party_name: stubData.party_name || "",
        farmer_name: stubData.farmer_name || stubData.party_name || "AUTO",
        trans_type: stubData.trans_type || "Dispatch(Sale)",
        first_wt: 0,
        product: stubData.product || "PADDY",
        bhada: parseFloat(bhada) || 0,
        username: username || "system",
      };
      const res = await axios.post(`${API}/vehicle-weight`, payload);
      const created = res.data?.entry || res.data;
      if (created && created.id) {
        return { ok: true, vw_id: created.id, auto_created: true };
      }
    } catch (e) {
      return { ok: false, message: "vw_auto_create_failed: " + (e?.response?.data?.detail || e.message) };
    }
  }

  if (!vw || !vw.id) return { ok: false, message: "vw_not_found" };
  try {
    await axios.put(`${API}/vehicle-weight/${vw.id}/edit`, { bhada: parseFloat(bhada) || 0 }, {
      params: { username: username || "system" },
    });
    return { ok: true, vw_id: vw.id };
  } catch (e) {
    return { ok: false, message: e?.response?.data?.detail || e.message };
  }
}
