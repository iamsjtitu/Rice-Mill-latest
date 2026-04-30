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
 * @param {string|number} rstNo
 * @param {number} bhada — the new lump-sum amount (0 to clear)
 * @param {string} username — for audit trail
 * @param {string} kmsYear — optional, for filtering
 * @returns {Promise<{ok:boolean, vw_id?:string, message?:string}>}
 */
export async function updateVwBhada(rstNo, bhada, username = "system", kmsYear = "") {
  if (!rstNo) return { ok: false, message: "no_rst" };
  const vw = await fetchVwByRst(rstNo, kmsYear);
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
