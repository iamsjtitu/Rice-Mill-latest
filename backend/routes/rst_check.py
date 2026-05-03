"""
Unified RST number cross-check across collections.
v104.44.28 — Detects:
  • Duplicate in same category (sale/purchase)
  • Cross-type overlap (e.g. purchase RST tried in sale)

Query: GET /api/rst-check?rst_no=XYZ&context=sale|purchase&exclude_id=<optional>
Response: {
  "exists_same": [ { collection, id, voucher_no, party_name, date, amount } ],
  "exists_other": [ { collection, id, party_name, date, kg_or_qty } ],
}
"""
from fastapi import APIRouter, Query
from database import db

router = APIRouter(tags=["rst-check"])

# Categorise collections.
# vehicle_weights is special — has trans_type: 'Dispatch(Sale)' or 'Receive(Purchase)'
# We handle it separately in _search_vw.
# FIX v104.44.32: use actual MongoDB collection names:
#   bp_sale_register (not by_product_sale_vouchers)
#   mill_entries (not entries)
SALE_COLLECTIONS = ["sale_vouchers", "bp_sale_register"]
PURCHASE_COLLECTIONS = ["purchase_vouchers", "private_paddy", "mill_entries"]


def _rst_match_query(rst_no: str):
    """Match RST number stored as string OR int.
    MongoDB regex only matches strings, so use $in with both variants.
    """
    variants = [rst_no, rst_no.strip()]
    try:
        # Include numeric variant (stored as int)
        variants.append(int(rst_no.strip()))
    except (ValueError, TypeError):
        pass
    # Case-insensitive string match + int match via $in
    return {"rst_no": {"$in": list(set(variants))}}


async def _search(collection: str, rst_no: str, exclude_id: str = ""):
    """Match RST exactly (string OR int), return compact info."""
    query = _rst_match_query(rst_no)
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
    coll = db[collection]
    docs = await coll.find(query, {"_id": 0}).limit(5).to_list(5)
    results = []
    for d in docs:
        results.append({
            "collection": collection,
            "id": d.get("id", ""),
            "voucher_no": d.get("voucher_no", "") or d.get("voucher_no_label", ""),
            "party_name": d.get("party_name", "") or d.get("seller_name", "") or d.get("buyer_name", ""),
            "date": d.get("date", ""),
            "rst_no": str(d.get("rst_no", "")),
            "amount": d.get("total", 0) or d.get("subtotal", 0) or d.get("final_amount", 0),
            "kg": d.get("kg", 0) or d.get("quantity", 0),
            "agent_name": d.get("agent_name", ""),
            "mandi_name": d.get("mandi_name", ""),
        })
    return results


async def _search_vw(rst_no: str, exclude_id: str, is_sale: bool):
    """Search vehicle_weights with trans_type filter.
    is_sale=True → Dispatch/Sale entries; False → Receive/Purchase entries.
    """
    query = _rst_match_query(rst_no)
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
    docs = await db["vehicle_weights"].find(query, {"_id": 0}).limit(5).to_list(5)
    results = []
    for d in docs:
        tt = (d.get("trans_type") or "").lower()
        is_dispatch = any(k in tt for k in ["dispatch", "sale"])
        is_receive = any(k in tt for k in ["receive", "purchase"])
        # Filter by category
        if is_sale and not is_dispatch:
            continue
        if not is_sale and not is_receive:
            continue
        results.append({
            "collection": "vehicle_weights",
            "id": d.get("id", ""),
            "voucher_no": "",
            "party_name": d.get("party_name", ""),
            "date": d.get("date", ""),
            "rst_no": str(d.get("rst_no", "")),
            "amount": 0,
            "kg": d.get("net_weight", 0),
            "trans_type": d.get("trans_type", ""),
            "vehicle_no": d.get("vehicle_no", ""),
            "mandi_name": d.get("mandi_name", ""),
        })
    return results


@router.get("/rst-check")
async def rst_check(
    rst_no: str = Query(..., description="RST number to check"),
    context: str = Query("sale", description="'sale' or 'purchase' - the form user is filling"),
    exclude_id: str = Query("", description="Doc id to exclude (when editing existing)"),
):
    rst_no = (rst_no or "").strip()
    if not rst_no:
        return {"exists_same": [], "exists_other": []}

    ctx = (context or "sale").lower()
    same_cols = SALE_COLLECTIONS if ctx == "sale" else PURCHASE_COLLECTIONS
    other_cols = PURCHASE_COLLECTIONS if ctx == "sale" else SALE_COLLECTIONS

    exists_same = []
    exists_other = []
    for c in same_cols:
        exists_same.extend(await _search(c, rst_no, exclude_id))
    for c in other_cols:
        exists_other.extend(await _search(c, rst_no, exclude_id))

    # Vehicle Weight trans_type-aware inclusion
    # v104.44.64 — VW (Receive/Purchase) is the natural SOURCE of mill_entries (purchase context),
    # so it should NOT be flagged as duplicate when filling Mill Entry / Paddy Purchase.
    # Same logic for VW (Dispatch/Sale) → it's the source of sale_vouchers/bp_sale_register (sale context).
    # We only flag VW in OTHER category (cross-type overlap), not same.
    # Same category: VW with matching trans_type (dispatch if context=sale, receive if context=purchase)
    # → NOT a duplicate, it's the parent. Skip.
    # Other category: VW with opposite trans_type → real conflict.
    exists_other.extend(await _search_vw(rst_no, exclude_id, is_sale=(ctx != "sale")))

    return {
        "rst_no": rst_no,
        "context": ctx,
        "exists_same": exists_same,
        "exists_other": exists_other,
    }


# v104.44.29 — Cross-collection next RST + next TP helpers
# v104.44.36 — max+1 logic with outlier cap (RST > 9999 = junk/test typo, TP > 99999 same)
SANE_RST_CAP = 9999
SANE_TP_CAP = 99999


async def _next_max_across(collections: list, field: str, kms_year: str = "", cap: int = 9999):
    """Returns max RST/TP across given collections, capped at outlier limit.
    Ignores stale junk values (e.g., test RST 77777). Returns 0 if no sane values."""
    used = set()
    query = {"kms_year": kms_year} if kms_year else {}
    for coll_name in collections:
        try:
            docs = await db[coll_name].find(query, {"_id": 0, field: 1}).to_list(length=50000)
            for d in docs:
                raw = d.get(field, "")
                try:
                    n = int(str(raw).strip() or 0)
                    if 0 < n <= cap:
                        used.add(n)
                except (ValueError, TypeError):
                    pass
        except Exception:
            pass
    return max(used) if used else 0


# Backward-compat aliases
async def _smallest_unused_across(collections: list, field: str, kms_year: str = ""):
    return await _next_max_across(collections, field, kms_year) + 1


async def _max_number_across(collections: list, field: str, kms_year: str = ""):
    return await _next_max_across(collections, field, kms_year)


@router.get("/rst-check/next-rst")
async def next_rst_all(kms_year: str = Query("", description="KMS year filter")):
    """Returns next available RST number — max+1 across ALL RST-using collections.
    Outlier RSTs > 9999 are ignored (treated as junk/test data)."""
    mx = await _next_max_across(
        ["vehicle_weights", "sale_vouchers", "purchase_vouchers",
         "private_paddy", "mill_entries", "bp_sale_register"],
        "rst_no", kms_year, cap=SANE_RST_CAP,
    )
    return {"rst_no": mx + 1, "kms_year": kms_year}


@router.get("/rst-check/next-tp")
async def next_tp_all(kms_year: str = Query("", description="KMS year filter")):
    """Returns next available TP number — max+1 across mill entries and vehicle_weights.
    Outliers > 99999 ignored."""
    mx = await _next_max_across(
        ["mill_entries", "vehicle_weights"], "tp_no", kms_year, cap=SANE_TP_CAP,
    )
    return {"tp_no": mx + 1, "kms_year": kms_year}
