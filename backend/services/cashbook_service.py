"""
Cashbook Service - Extracted helper functions for cash transaction processing.
Reduces complexity of add_cash_transaction route handler.
"""
from datetime import datetime, timezone
from database import db
import uuid
import re


async def detect_party_type(category: str) -> str:
    """Auto-detect party_type from category by checking across collections."""
    if not category:
        return ""
    
    cat_rgx = {"$regex": f"^{re.escape(category)}$", "$options": "i"}
    cat_contains = {"$regex": re.escape(category), "$options": "i"}
    
    # 1. Check existing cash_transactions (case-insensitive exact match)
    existing = await db.cash_transactions.find_one(
        {"category": cat_rgx, "party_type": {"$nin": ["", None]}},
        {"_id": 0, "party_type": 1}
    )
    if existing and existing.get('party_type'):
        return existing['party_type']
    
    # 2. Cross-collection lookup (case-insensitive)
    lookups = [
        (db.private_paddy, {"party_name": cat_rgx}, "Pvt Paddy Purchase"),
        (db.rice_sales, {"party_name": cat_rgx}, "Rice Sale"),
        (db.diesel_accounts, {"pump_name": cat_rgx}, "Diesel"),
        (db.local_party_accounts, {"party_name": cat_rgx}, "Local Party"),
        (db.truck_payments, {"truck_no": cat_rgx}, "Truck"),
        (db.mandi_targets, {"mandi_name": cat_rgx}, "Agent"),
        (db.staff, {"name": cat_rgx, "active": True}, "Staff"),
    ]
    for coll, query, ptype in lookups:
        if await coll.find_one(query):
            return ptype
    
    # 3. Fuzzy contains match
    fuzzy_lookups = [
        (db.private_paddy, {"party_name": cat_contains}, "Pvt Paddy Purchase"),
        (db.rice_sales, {"party_name": cat_contains}, "Rice Sale"),
        (db.diesel_accounts, {"pump_name": cat_contains}, "Diesel"),
        (db.local_party_accounts, {"party_name": cat_contains}, "Local Party"),
        (db.mandi_targets, {"mandi_name": cat_contains}, "Agent"),
        (db.staff, {"name": cat_contains, "active": True}, "Staff"),
    ]
    for coll, query, ptype in fuzzy_lookups:
        if await coll.find_one(query):
            return ptype
    
    # 4. Check private_payments
    if await db.private_payments.find_one({"party_name": cat_rgx}):
        return "Pvt Paddy Purchase"
    
    return "Cash Party"


async def backfill_party_type(category: str, party_type: str):
    """Retroactively update all old entries for this category with empty party_type."""
    if not category or not party_type:
        return
    cat_rgx = {"$regex": f"^{re.escape(category)}$", "$options": "i"}
    await db.cash_transactions.update_many(
        {"category": cat_rgx, "$or": [{"party_type": ""}, {"party_type": None}, {"party_type": {"$exists": False}}]},
        {"$set": {"party_type": party_type}}
    )


async def create_auto_ledger_entry(txn_dict: dict, round_off: float = 0):
    """Auto-create corresponding ledger entry for double-entry accounting."""
    category = txn_dict.get('category', '').strip()
    if txn_dict.get('account') not in ('cash', 'bank') or not category:
        return
    
    ledger_amount = round(txn_dict['amount'] + round_off, 2) if round_off else txn_dict['amount']
    ledger_entry = {**txn_dict}
    ledger_entry['id'] = str(uuid.uuid4())
    ledger_entry['account'] = 'ledger'
    ledger_entry['amount'] = ledger_amount
    ledger_entry['reference'] = f"auto_ledger:{txn_dict.get('id', '')[:8]}"
    if not ledger_entry.get('description'):
        acct = txn_dict.get('account', 'cash').capitalize()
        ttype = txn_dict.get('txn_type', '')
        ledger_entry['description'] = f"{acct} received from {category}" if ttype == 'jama' else f"{acct} payment to {category}"
    ledger_entry['created_at'] = datetime.now(timezone.utc).isoformat()
    ledger_entry['updated_at'] = datetime.now(timezone.utc).isoformat()
    await db.cash_transactions.insert_one(ledger_entry)
    ledger_entry.pop('_id', None)


async def process_diesel_auto_entry(txn_dict: dict, round_off: float, username: str):
    """Auto-create diesel_accounts payment entry when payment is for a Diesel pump."""
    category = txn_dict.get('category', '').strip()
    if txn_dict.get('party_type') != "Diesel" or not category or txn_dict.get('account') not in ('cash', 'bank'):
        return
    
    cat_rgx_re = re.compile(f"^{re.escape(category)}$", re.IGNORECASE)
    pump = await db.diesel_pumps.find_one({"name": cat_rgx_re}, {"_id": 0})
    if not pump:
        cat_contains = {"$regex": re.escape(category), "$options": "i"}
        pump = await db.diesel_pumps.find_one({"name": cat_contains}, {"_id": 0})
    if not pump:
        return
    
    total_settled = round(txn_dict['amount'] + round_off, 2) if round_off else round(txn_dict['amount'], 2)
    diesel_pay = {
        "id": str(uuid.uuid4()),
        "date": txn_dict.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
        "pump_id": pump["id"], "pump_name": pump["name"],
        "truck_no": "", "agent_name": "",
        "amount": total_settled, "txn_type": "payment",
        "description": f"Payment: Rs.{txn_dict['amount']}" + (f" (Round Off: {'+' if round_off > 0 else ''}{round_off})" if round_off else "") + (f" - {txn_dict.get('description','')}" if txn_dict.get('description') else ""),
        "kms_year": txn_dict.get("kms_year", ""), "season": txn_dict.get("season", ""),
        "created_by": username or "system", "source": "cashbook",
        "linked_cashbook_id": txn_dict.get("id", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.diesel_accounts.insert_one(diesel_pay)
    diesel_pay.pop('_id', None)


async def process_pvt_paddy_auto_payment(txn_dict: dict):
    """Auto-update private_paddy paid_amount when cashbook payment is for Pvt Paddy Purchase party."""
    category = txn_dict.get('category', '').strip()
    if txn_dict.get('party_type') != "Pvt Paddy Purchase" or not category or txn_dict.get('account') not in ('cash', 'bank'):
        return
    
    pvt_entry = None
    parts = category.split(" - ", 1)
    if len(parts) == 2:
        pvt_entry = await db.private_paddy.find_one(
            {"party_name": {"$regex": f"^{re.escape(parts[0].strip())}$", "$options": "i"},
             "mandi_name": {"$regex": f"^{re.escape(parts[1].strip())}$", "$options": "i"},
             "balance": {"$gt": 0}},
            {"_id": 0}
        )
    if not pvt_entry:
        cat_rgx = re.compile(f"^{re.escape(category)}$", re.IGNORECASE)
        pvt_entry = await db.private_paddy.find_one({"party_name": cat_rgx, "balance": {"$gt": 0}}, {"_id": 0})
    if not pvt_entry:
        pvt_entry = await db.private_paddy.find_one(
            {"party_name": {"$regex": re.escape(category), "$options": "i"}, "balance": {"$gt": 0}},
            {"_id": 0}
        )
    if not pvt_entry:
        return
    
    pay_amount = round(txn_dict.get('amount', 0), 2)
    new_paid = round(pvt_entry.get("paid_amount", 0) + pay_amount, 2)
    new_balance = round(pvt_entry.get("total_amount", 0) - new_paid, 2)
    new_status = "paid" if new_balance <= 0 else ("partial" if new_paid > 0 else "pending")
    await db.private_paddy.update_one(
        {"id": pvt_entry["id"]},
        {"$set": {"paid_amount": new_paid, "balance": new_balance, "status": new_status}}
    )
    # Link the cashbook entry to private_paddy
    await db.cash_transactions.update_one({"id": txn_dict["id"]}, {"$set": {"cashbook_pvt_linked": pvt_entry["id"]}})
    await db.cash_transactions.update_one(
        {"reference": f"auto_ledger:{txn_dict['id'][:8]}"},
        {"$set": {"cashbook_pvt_linked": pvt_entry["id"]}}
    )
