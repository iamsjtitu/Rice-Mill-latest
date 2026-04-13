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


# ============================================================
# Summary helpers (extracted from get_cash_book_summary)
# ============================================================

def compute_account_totals(txns: list) -> dict:
    """Compute cash/bank in/out totals from transactions, excluding Round Off entries."""
    real_txns = [t for t in txns if t.get('party_type') != 'Round Off']
    return {
        "cash_in": sum(t['amount'] for t in real_txns if t.get('account') == 'cash' and t.get('txn_type') == 'jama'),
        "cash_out": sum(t['amount'] for t in real_txns if t.get('account') == 'cash' and t.get('txn_type') == 'nikasi'),
        "bank_in": sum(t['amount'] for t in real_txns if t.get('account') == 'bank' and t.get('txn_type') == 'jama'),
        "bank_out": sum(t['amount'] for t in real_txns if t.get('account') == 'bank' and t.get('txn_type') == 'nikasi'),
        "real_txns": real_txns,
    }


def compute_bank_details(real_txns: list, bank_names: list) -> dict:
    """Compute per-bank breakdowns from real transactions."""
    bank_details = {}
    for bn in bank_names:
        b_in = sum(t['amount'] for t in real_txns if t.get('account') == 'bank' and t.get('txn_type') == 'jama' and t.get('bank_name') == bn)
        b_out = sum(t['amount'] for t in real_txns if t.get('account') == 'bank' and t.get('txn_type') == 'nikasi' and t.get('bank_name') == bn)
        bank_details[bn] = {"in": round(b_in, 2), "out": round(b_out, 2), "balance": round(b_in - b_out, 2)}
    # Unlinked bank txns without bank_name
    unlinked_in = sum(t['amount'] for t in real_txns if t.get('account') == 'bank' and t.get('txn_type') == 'jama' and not t.get('bank_name'))
    unlinked_out = sum(t['amount'] for t in real_txns if t.get('account') == 'bank' and t.get('txn_type') == 'nikasi' and not t.get('bank_name'))
    if unlinked_in > 0 or unlinked_out > 0:
        bank_details["Other"] = {"in": round(unlinked_in, 2), "out": round(unlinked_out, 2), "balance": round(unlinked_in - unlinked_out, 2)}
    return bank_details


async def compute_opening_balances(kms_year: str) -> tuple:
    """Compute opening cash/bank balances from saved data or previous FY carry-forward."""
    opening_cash = 0.0
    opening_bank = 0.0
    opening_bank_details = {}
    if not kms_year:
        return opening_cash, opening_bank, opening_bank_details

    saved_ob = await db.opening_balances.find_one({"kms_year": kms_year}, {"_id": 0})
    if saved_ob:
        opening_cash = saved_ob.get("cash", 0.0)
        opening_bank = saved_ob.get("bank", 0.0)
        opening_bank_details = saved_ob.get("bank_details", {})
    else:
        parts = kms_year.split('-')
        if len(parts) == 2:
            try:
                prev_fy = f"{int(parts[0])-1}-{int(parts[1])-1}"
                prev_txns = await db.cash_transactions.find({"kms_year": prev_fy}, {"_id": 0}).to_list(10000)
                prev_real = [t for t in prev_txns if t.get('party_type') != 'Round Off']
                prev_cash_in = sum(t['amount'] for t in prev_real if t.get('account') == 'cash' and t.get('txn_type') == 'jama')
                prev_cash_out = sum(t['amount'] for t in prev_real if t.get('account') == 'cash' and t.get('txn_type') == 'nikasi')
                prev_bank_in = sum(t['amount'] for t in prev_real if t.get('account') == 'bank' and t.get('txn_type') == 'jama')
                prev_bank_out = sum(t['amount'] for t in prev_real if t.get('account') == 'bank' and t.get('txn_type') == 'nikasi')
                prev_ob = await db.opening_balances.find_one({"kms_year": prev_fy}, {"_id": 0})
                if prev_ob:
                    opening_cash = round((prev_ob.get("cash", 0) + prev_cash_in - prev_cash_out), 2)
                    opening_bank = round((prev_ob.get("bank", 0) + prev_bank_in - prev_bank_out), 2)
                else:
                    opening_cash = round(prev_cash_in - prev_cash_out, 2)
                    opening_bank = round(prev_bank_in - prev_bank_out, 2)
            except (ValueError, IndexError):
                pass
    return opening_cash, opening_bank, opening_bank_details


# ============================================================
# Delete reversal helpers (extracted from delete_cash_transaction)
# ============================================================

async def revert_pvt_paddy_payment(txn: dict):
    """Revert private paddy purchase payment when cashbook entry is deleted."""
    rev_amount = round(txn.get('amount', 0), 2)
    pvt_entry = None
    linked_pay_id = txn.get("linked_payment_id", "")
    ref = txn.get("reference", "")
    linked_entry_id = txn.get("linked_entry_id", "")

    if linked_pay_id and not linked_pay_id.startswith("mark_paid:"):
        pay_doc = await db.private_payments.find_one({"id": linked_pay_id}, {"_id": 0})
        if pay_doc:
            pvt_entry = await db.private_paddy.find_one({"id": pay_doc.get("ref_id")}, {"_id": 0})
            rev_amount = round(pay_doc.get("amount", 0) + pay_doc.get("round_off", 0), 2)
            await db.private_payments.delete_one({"id": linked_pay_id})
        await db.cash_transactions.delete_many({"linked_payment_id": linked_pay_id, "account": "ledger"})
    elif linked_pay_id and linked_pay_id.startswith("mark_paid:"):
        entry_id_prefix = linked_pay_id.replace("mark_paid:", "")
        pvt_entry = await db.private_paddy.find_one({"id": {"$regex": f"^{entry_id_prefix}"}}, {"_id": 0})
        await db.cash_transactions.delete_many({"linked_payment_id": linked_pay_id, "account": "ledger"})
        if pvt_entry:
            await db.private_paddy.update_one({"id": pvt_entry["id"]}, {"$set": {"payment_status": "pending"}})
    elif ref.startswith("pvt_paddy_adv:"):
        if linked_entry_id:
            pvt_entry = await db.private_paddy.find_one({"id": linked_entry_id}, {"_id": 0})
        ledger_ref = ref.replace("pvt_paddy_adv:", "pvt_paddy_advl:")
        await db.cash_transactions.delete_many({"reference": ledger_ref})
    elif not linked_pay_id and txn.get('account') in ('cash', 'bank'):
        cat = txn.get('category', '')
        if txn.get('cashbook_pvt_linked'):
            pvt_entry = await db.private_paddy.find_one({"id": txn['cashbook_pvt_linked']}, {"_id": 0})
        if not pvt_entry and cat:
            parts = cat.split(" - ", 1)
            if len(parts) == 2:
                pvt_entry = await db.private_paddy.find_one(
                    {"party_name": {"$regex": f"^{re.escape(parts[0].strip())}$", "$options": "i"},
                     "mandi_name": {"$regex": f"^{re.escape(parts[1].strip())}$", "$options": "i"}},
                    {"_id": 0}
                )
            if not pvt_entry:
                pvt_entry = await db.private_paddy.find_one({"party_name": {"$regex": re.escape(cat), "$options": "i"}}, {"_id": 0})

    if pvt_entry and rev_amount > 0:
        new_paid = round(max(0, pvt_entry.get("paid_amount", 0) - rev_amount), 2)
        new_balance = round(pvt_entry.get("total_amount", 0) - new_paid, 2)
        await db.private_paddy.update_one(
            {"id": pvt_entry["id"]},
            {"$set": {"paid_amount": new_paid, "balance": new_balance, "payment_status": "pending" if new_paid < pvt_entry.get("total_amount", 0) else "paid"}}
        )


async def revert_rice_sale_payment(txn: dict):
    """Revert rice sale payment when cashbook entry is deleted."""
    rev_amount = round(txn.get('amount', 0), 2)
    rice_entry = None
    linked_pay_id = txn.get("linked_payment_id", "")

    if linked_pay_id and not linked_pay_id.startswith("mark_paid"):
        pay_doc = await db.private_payments.find_one({"id": linked_pay_id}, {"_id": 0})
        if pay_doc:
            rice_entry = await db.rice_sales.find_one({"id": pay_doc.get("ref_id")}, {"_id": 0})
            rev_amount = round(pay_doc.get("amount", 0) + pay_doc.get("round_off", 0), 2)
            await db.private_payments.delete_one({"id": linked_pay_id})
        await db.cash_transactions.delete_many({"linked_payment_id": linked_pay_id, "account": "ledger"})
    elif linked_pay_id and linked_pay_id.startswith("mark_paid_rice:"):
        entry_id_prefix = linked_pay_id.replace("mark_paid_rice:", "")
        rice_entry = await db.rice_sales.find_one({"id": {"$regex": f"^{entry_id_prefix}"}}, {"_id": 0})
        await db.cash_transactions.delete_many({"linked_payment_id": linked_pay_id, "account": "ledger"})
        if rice_entry:
            await db.rice_sales.update_one({"id": rice_entry["id"]}, {"$set": {"payment_status": "pending"}})

    if rice_entry and rev_amount > 0:
        new_paid = round(max(0, rice_entry.get("paid_amount", 0) - rev_amount), 2)
        new_balance = round(rice_entry.get("total_amount", 0) - new_paid, 2)
        await db.rice_sales.update_one(
            {"id": rice_entry["id"]},
            {"$set": {"paid_amount": new_paid, "balance": new_balance, "payment_status": "pending" if new_paid < rice_entry.get("total_amount", 0) else "paid"}}
        )


async def revert_linked_payments(txn: dict):
    """Revert truck, agent, lease payments when cashbook entry is deleted."""
    linked_id = txn.get('linked_payment_id', '')

    # Truck payment reversal
    if linked_id.startswith('truck:'):
        entry_id = linked_id.replace('truck:', '')
        tp_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
        if tp_doc:
            rev_amount = round(txn.get('amount', 0), 2)
            new_paid = round(max(0, tp_doc.get("paid_amount", 0) - rev_amount), 2)
            history = tp_doc.get("payments_history", [])
            for i in range(len(history) - 1, -1, -1):
                if round(history[i].get("amount", 0), 2) == rev_amount:
                    history.pop(i)
                    break
            await db.truck_payments.update_one(
                {"entry_id": entry_id},
                {"$set": {"paid_amount": new_paid, "payments_history": history, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
        ref_prefix = txn.get('reference', '').replace('truck_pay:', 'truck_pay_ledger:')
        if ref_prefix:
            await db.cash_transactions.delete_many({"reference": ref_prefix})

    # Agent payment reversal
    elif linked_id.startswith('agent:'):
        parts = linked_id.split(':')
        if len(parts) >= 4:
            mandi_name, kms_year, season = parts[1], parts[2], parts[3]
            ap_doc = await db.agent_payments.find_one(
                {"mandi_name": mandi_name, "kms_year": kms_year, "season": season}, {"_id": 0}
            )
            if ap_doc:
                rev_amount = round(txn.get('amount', 0), 2)
                new_paid = round(max(0, ap_doc.get("paid_amount", 0) - rev_amount), 2)
                history = ap_doc.get("payments_history", [])
                for i in range(len(history) - 1, -1, -1):
                    if round(history[i].get("amount", 0), 2) == rev_amount:
                        history.pop(i)
                        break
                await db.agent_payments.update_one(
                    {"mandi_name": mandi_name, "kms_year": kms_year, "season": season},
                    {"$set": {"paid_amount": new_paid, "payments_history": history, "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
            ref_prefix = txn.get('reference', '').replace('agent_pay:', 'agent_pay_ledger:')
            if ref_prefix:
                await db.cash_transactions.delete_many({"reference": ref_prefix})

    # Truck lease payment reversal
    elif linked_id.startswith('truck_lease:'):
        parts = linked_id.split(':')
        if len(parts) >= 4:
            payment_id = parts[3] if len(parts) > 3 else ""
            if payment_id:
                await db.truck_lease_payments.delete_one({"id": payment_id})
            ref_prefix = txn.get('reference', '').replace('lease_pay:', 'auto_ledger:')
            if ref_prefix:
                await db.cash_transactions.delete_many({"reference": ref_prefix})


async def revert_hemali_payment(txn: dict):
    """Revert hemali payment when cashbook entry is deleted."""
    ref = txn.get("reference", "")
    if not ref.startswith("hemali_payment:"):
        return
    hemali_pid = ref.replace("hemali_payment:", "")
    await db.hemali_payments.update_one(
        {"id": hemali_pid},
        {"$set": {"status": "unpaid", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await db.cash_transactions.delete_many({
        "reference": {"$in": [f"hemali_work:{hemali_pid}", f"hemali_paid:{hemali_pid}"]}
    })
    await db.local_party_accounts.delete_many({
        "reference": f"hemali_paid:{hemali_pid}"
    })
