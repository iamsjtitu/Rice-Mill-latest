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

# Categorise collections
SALE_COLLECTIONS = ["sale_vouchers", "by_product_sale_vouchers"]
PURCHASE_COLLECTIONS = ["purchase_vouchers", "private_paddy", "entries"]


async def _search(collection: str, rst_no: str, exclude_id: str = ""):
    """Case-insensitive RST match, returns compact info."""
    coll = db[collection]
    # Match by rst_no exactly (trimmed, string compare)
    query = {"rst_no": {"$regex": f"^{rst_no}$", "$options": "i"}}
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
    docs = await coll.find(query, {"_id": 0}).limit(5).to_list(5)
    results = []
    for d in docs:
        results.append({
            "collection": collection,
            "id": d.get("id", ""),
            "voucher_no": d.get("voucher_no", "") or d.get("voucher_no_label", ""),
            "party_name": d.get("party_name", "") or d.get("seller_name", "") or d.get("buyer_name", ""),
            "date": d.get("date", ""),
            "rst_no": d.get("rst_no", ""),
            "amount": d.get("total", 0) or d.get("subtotal", 0) or d.get("final_amount", 0),
            "kg": d.get("kg", 0) or d.get("quantity", 0),
            "agent_name": d.get("agent_name", ""),
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

    return {
        "rst_no": rst_no,
        "context": ctx,
        "exists_same": exists_same,
        "exists_other": exists_other,
    }
