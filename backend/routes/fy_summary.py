from fastapi import APIRouter
from typing import Optional
from database import db

router = APIRouter()

def get_prev_fy(kms_year: str) -> str:
    parts = kms_year.split('-')
    if len(parts) == 2:
        try:
            return f"{int(parts[0])-1}-{int(parts[1])-1}"
        except (ValueError, IndexError):
            pass
    return ""


@router.get("/fy-summary")
async def get_fy_summary(kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season

    prev_fy = get_prev_fy(kms_year) if kms_year else ""
    prev_q = {}
    if prev_fy: prev_q["kms_year"] = prev_fy
    if season: prev_q["season"] = season

    # ===== 1. CASH & BANK =====
    cash_txns = await db.cash_transactions.find(query, {"_id": 0}).to_list(10000)
    cash_in = sum(t.get("amount", 0) for t in cash_txns if t.get("account") == "cash" and t.get("txn_type") == "jama")
    cash_out = sum(t.get("amount", 0) for t in cash_txns if t.get("account") == "cash" and t.get("txn_type") == "nikasi")
    bank_in = sum(t.get("amount", 0) for t in cash_txns if t.get("account") == "bank" and t.get("txn_type") == "jama")
    bank_out = sum(t.get("amount", 0) for t in cash_txns if t.get("account") == "bank" and t.get("txn_type") == "nikasi")

    # Opening balance from saved or computed
    ob_cash, ob_bank = 0.0, 0.0
    if kms_year:
        saved_ob = await db.opening_balances.find_one({"kms_year": kms_year}, {"_id": 0})
        if saved_ob:
            ob_cash = saved_ob.get("cash", 0.0)
            ob_bank = saved_ob.get("bank", 0.0)
        elif prev_fy:
            prev_cash = await db.cash_transactions.find(prev_q, {"_id": 0}).to_list(10000)
            p_ci = sum(t.get("amount", 0) for t in prev_cash if t.get("account") == "cash" and t.get("txn_type") == "jama")
            p_co = sum(t.get("amount", 0) for t in prev_cash if t.get("account") == "cash" and t.get("txn_type") == "nikasi")
            p_bi = sum(t.get("amount", 0) for t in prev_cash if t.get("account") == "bank" and t.get("txn_type") == "jama")
            p_bo = sum(t.get("amount", 0) for t in prev_cash if t.get("account") == "bank" and t.get("txn_type") == "nikasi")
            ob_cash = round(p_ci - p_co, 2)
            ob_bank = round(p_bi - p_bo, 2)

    cash_section = {
        "opening_cash": round(ob_cash, 2), "cash_in": round(cash_in, 2), "cash_out": round(cash_out, 2),
        "closing_cash": round(ob_cash + cash_in - cash_out, 2),
        "opening_bank": round(ob_bank, 2), "bank_in": round(bank_in, 2), "bank_out": round(bank_out, 2),
        "closing_bank": round(ob_bank + bank_in - bank_out, 2),
    }

    # ===== 2. PADDY STOCK =====
    mill_entries = await db.mill_entries.find(query, {"_id": 0, "qntl": 1, "bag": 1}).to_list(10000)
    paddy_in = round(sum(e.get("qntl", 0) - e.get("bag", 0) / 100 for e in mill_entries), 2)
    milling_entries = await db.milling_entries.find(query, {"_id": 0}).to_list(10000)
    paddy_used = round(sum(e.get("paddy_input_qntl", 0) for e in milling_entries), 2)

    ob_paddy = 0.0
    if prev_fy:
        prev_me = await db.mill_entries.find(prev_q, {"_id": 0, "qntl": 1, "bag": 1}).to_list(10000)
        prev_mi = await db.milling_entries.find(prev_q, {"_id": 0, "paddy_input_qntl": 1}).to_list(10000)
        prev_paddy_in = sum(e.get("qntl", 0) - e.get("bag", 0) / 100 for e in prev_me)
        prev_paddy_used = sum(e.get("paddy_input_qntl", 0) for e in prev_mi)
        ob_paddy = round(prev_paddy_in - prev_paddy_used, 2)

    paddy_section = {
        "opening_stock": ob_paddy, "paddy_in": paddy_in, "paddy_used": paddy_used,
        "closing_stock": round(ob_paddy + paddy_in - paddy_used, 2)
    }

    # ===== 3. MILLING SUMMARY =====
    total_rice = round(sum(e.get("rice_qntl", 0) for e in milling_entries), 2)
    total_frk_used = round(sum(e.get("frk_used_qntl", 0) for e in milling_entries), 2)
    total_cmr = round(sum(e.get("cmr_delivery_qntl", 0) for e in milling_entries), 2)
    avg_outturn = round(total_cmr / paddy_used * 100, 2) if paddy_used > 0 else 0

    milling_section = {
        "total_paddy_milled": paddy_used, "total_rice_produced": total_rice,
        "total_frk_used": total_frk_used, "total_cmr_delivered": total_cmr,
        "avg_outturn": avg_outturn, "total_entries": len(milling_entries)
    }

    # ===== 4. FRK STOCK =====
    frk_purchases = await db.frk_purchases.find(query, {"_id": 0}).to_list(1000)
    frk_bought = round(sum(p.get("quantity_qntl", 0) for p in frk_purchases), 2)
    frk_cost = round(sum(p.get("total_amount", 0) for p in frk_purchases), 2)

    ob_frk = 0.0
    if prev_fy:
        prev_frk = await db.frk_purchases.find(prev_q, {"_id": 0}).to_list(1000)
        prev_frk_bought = sum(p.get("quantity_qntl", 0) for p in prev_frk)
        prev_mil = await db.milling_entries.find(prev_q, {"_id": 0, "frk_used_qntl": 1}).to_list(1000)
        prev_frk_used = sum(e.get("frk_used_qntl", 0) for e in prev_mil)
        ob_frk = round(prev_frk_bought - prev_frk_used, 2)

    frk_section = {
        "opening_stock": ob_frk, "purchased": frk_bought, "used": total_frk_used,
        "closing_stock": round(ob_frk + frk_bought - total_frk_used, 2), "total_cost": frk_cost
    }

    # ===== 5. BYPRODUCT STOCK =====
    byproduct_sales = await db.byproduct_sales.find(query, {"_id": 0}).to_list(1000)
    products = ["bran", "kunda", "broken", "kanki", "husk"]
    byproduct_section = {}

    prev_milling_bp = []
    prev_bp_sales = []
    if prev_fy:
        prev_milling_bp = await db.milling_entries.find(prev_q, {"_id": 0}).to_list(1000)
        prev_bp_sales = await db.byproduct_sales.find(prev_q, {"_id": 0}).to_list(1000)

    for p in products:
        produced = round(sum(e.get(f"{p}_qntl", 0) for e in milling_entries), 2)
        sold = round(sum(s.get("quantity_qntl", 0) for s in byproduct_sales if s.get("product") == p), 2)
        revenue = round(sum(s.get("total_amount", 0) for s in byproduct_sales if s.get("product") == p), 2)
        ob = 0.0
        if prev_fy:
            prev_prod = sum(e.get(f"{p}_qntl", 0) for e in prev_milling_bp)
            prev_sold = sum(s.get("quantity_qntl", 0) for s in prev_bp_sales if s.get("product") == p)
            ob = round(prev_prod - prev_sold, 2)
        byproduct_section[p] = {
            "opening_stock": ob, "produced": produced, "sold": sold,
            "closing_stock": round(ob + produced - sold, 2), "revenue": revenue
        }

    # ===== 6. MILL PARTS STOCK =====
    parts = await db.mill_parts.find({}, {"_id": 0}).to_list(1000)
    parts_txns = await db.mill_parts_stock.find(query, {"_id": 0}).to_list(10000)
    prev_parts_txns = []
    if prev_fy:
        prev_parts_txns = await db.mill_parts_stock.find(prev_q, {"_id": 0}).to_list(10000)

    parts_section = []
    for part in parts:
        pn = part["name"]
        s_in = sum(t.get("quantity", 0) for t in parts_txns if t.get("part_name") == pn and t.get("txn_type") == "in")
        s_out = sum(t.get("quantity", 0) for t in parts_txns if t.get("part_name") == pn and t.get("txn_type") != "in")
        ob = 0.0
        if prev_fy:
            p_in = sum(t.get("quantity", 0) for t in prev_parts_txns if t.get("part_name") == pn and t.get("txn_type") == "in")
            p_out = sum(t.get("quantity", 0) for t in prev_parts_txns if t.get("part_name") == pn and t.get("txn_type") != "in")
            ob = round(p_in - p_out, 2)
        parts_section.append({
            "name": pn, "unit": part.get("unit", "Pcs"), "opening_stock": ob,
            "stock_in": round(s_in, 2), "stock_used": round(s_out, 2),
            "closing_stock": round(ob + s_in - s_out, 2)
        })

    # ===== 7. DIESEL ACCOUNTS =====
    diesel_txns = await db.diesel_accounts.find(query, {"_id": 0}).to_list(5000)
    pumps = await db.diesel_pumps.find({}, {"_id": 0}).to_list(100)
    prev_diesel = []
    if prev_fy:
        prev_diesel = await db.diesel_accounts.find(prev_q, {"_id": 0}).to_list(5000)

    diesel_section = []
    for pump in pumps:
        pid = pump["id"]
        pt = [t for t in diesel_txns if t.get("pump_id") == pid]
        td = sum(t.get("amount", 0) for t in pt if t.get("txn_type") == "debit")
        tp = sum(t.get("amount", 0) for t in pt if t.get("txn_type") == "payment")
        ob = 0.0
        if prev_fy:
            pp = [t for t in prev_diesel if t.get("pump_id") == pid]
            ob = round(sum(t.get("amount", 0) for t in pp if t.get("txn_type") == "debit") - sum(t.get("amount", 0) for t in pp if t.get("txn_type") == "payment"), 2)
        diesel_section.append({
            "pump_name": pump["name"], "opening_balance": ob,
            "total_diesel": round(td, 2), "total_paid": round(tp, 2),
            "closing_balance": round(ob + td - tp, 2)
        })

    # ===== 8. LOCAL PARTY ACCOUNTS =====
    lp_txns = await db.local_party_accounts.find(query, {"_id": 0}).to_list(10000)
    prev_lp = []
    if prev_fy:
        prev_lp = await db.local_party_accounts.find(prev_q, {"_id": 0}).to_list(10000)

    lp_map = {}
    for t in lp_txns:
        pn = (t.get("party_name", "")).strip()
        if not pn: continue
        if pn not in lp_map:
            lp_map[pn] = {"debit": 0, "paid": 0}
        if t.get("txn_type") == "debit": lp_map[pn]["debit"] += t.get("amount", 0)
        elif t.get("txn_type") == "payment": lp_map[pn]["paid"] += t.get("amount", 0)

    prev_lp_map = {}
    for t in prev_lp:
        pn = (t.get("party_name", "")).strip()
        if not pn: continue
        if pn not in prev_lp_map: prev_lp_map[pn] = 0
        if t.get("txn_type") == "debit": prev_lp_map[pn] += t.get("amount", 0)
        elif t.get("txn_type") == "payment": prev_lp_map[pn] -= t.get("amount", 0)

    all_parties = set(list(lp_map.keys()) + [k for k, v in prev_lp_map.items() if round(v, 2) != 0])
    lp_total_ob = sum(round(prev_lp_map.get(p, 0), 2) for p in all_parties)
    lp_total_debit = sum(lp_map.get(p, {}).get("debit", 0) for p in all_parties)
    lp_total_paid = sum(lp_map.get(p, {}).get("paid", 0) for p in all_parties)
    local_party_section = {
        "party_count": len(all_parties),
        "opening_balance": round(lp_total_ob, 2),
        "total_debit": round(lp_total_debit, 2), "total_paid": round(lp_total_paid, 2),
        "closing_balance": round(lp_total_ob + lp_total_debit - lp_total_paid, 2)
    }

    # ===== 9. STAFF ADVANCES =====
    staff_list = await db.staff.find({"active": True}, {"_id": 0}).to_list(100)
    all_advances = await db.staff_advance.find(query, {"_id": 0}).to_list(5000)
    all_payments = await db.staff_payments.find(query, {"_id": 0}).to_list(5000)
    prev_adv = []
    prev_pay = []
    if prev_fy:
        prev_adv = await db.staff_advance.find(prev_q, {"_id": 0}).to_list(5000)
        prev_pay = await db.staff_payments.find(prev_q, {"_id": 0}).to_list(5000)

    staff_section = []
    for s in staff_list:
        sid = s["id"]
        adv = sum(a.get("amount", 0) for a in all_advances if a.get("staff_id") == sid)
        ded = sum(p.get("advance_deducted", 0) for p in all_payments if p.get("staff_id") == sid)
        ob = 0.0
        if prev_fy:
            p_a = sum(a.get("amount", 0) for a in prev_adv if a.get("staff_id") == sid)
            p_d = sum(p.get("advance_deducted", 0) for p in prev_pay if p.get("staff_id") == sid)
            ob = round(p_a - p_d, 2)
        staff_section.append({
            "name": s["name"], "opening_balance": ob,
            "total_advance": round(adv, 2), "total_deducted": round(ded, 2),
            "closing_balance": round(ob + adv - ded, 2)
        })

    # ===== 10. PRIVATE TRADING =====
    priv_paddy = await db.private_paddy.find(query, {"_id": 0}).to_list(5000)
    rice_sales = await db.rice_sales.find(query, {"_id": 0}).to_list(5000)
    pp_total = round(sum(p.get("total_amount", 0) for p in priv_paddy), 2)
    pp_paid = round(sum(p.get("paid_amount", 0) for p in priv_paddy), 2)
    rs_total = round(sum(r.get("total_amount", 0) for r in rice_sales), 2)
    rs_paid = round(sum(r.get("paid_amount", 0) for r in rice_sales), 2)

    private_section = {
        "paddy_purchase_amount": pp_total, "paddy_paid": pp_paid, "paddy_balance": round(pp_total - pp_paid, 2),
        "paddy_qty": round(sum(p.get("quantity_qntl", 0) for p in priv_paddy), 2),
        "rice_sale_amount": rs_total, "rice_received": rs_paid, "rice_balance": round(rs_total - rs_paid, 2),
        "rice_qty": round(sum(r.get("quantity_qntl", 0) for r in rice_sales), 2),
    }

    return {
        "kms_year": kms_year or "", "season": season or "",
        "cash_bank": cash_section,
        "paddy_stock": paddy_section,
        "milling": milling_section,
        "frk_stock": frk_section,
        "byproducts": byproduct_section,
        "mill_parts": parts_section,
        "diesel": diesel_section,
        "local_party": local_party_section,
        "staff_advances": staff_section,
        "private_trading": private_section
    }
