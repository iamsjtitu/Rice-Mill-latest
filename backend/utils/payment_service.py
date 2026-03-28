"""
Centralized Payment Service
Common logic for creating/reversing cash book + ledger entries lives HERE.
"""
from database import db
from datetime import datetime, timezone
import uuid


async def create_cash_and_ledger(
    date: str, account: str, txn_type: str,
    category: str, party_type: str, description: str,
    amount: float, ledger_amount: float,
    kms_year: str, season: str, username: str,
    linked_payment_id: str, reference: str = "",
    ledger_description: str = "", bank_name: str = ""
):
    """Create paired Cash Book + Party Ledger entries.
    - amount: actual cash/bank amount
    - ledger_amount: total including round-off (for ledger)
    Returns (cash_entry_id, ledger_entry_id)
    """
    now = datetime.now(timezone.utc).isoformat()
    base = {
        "kms_year": kms_year, "season": season,
        "created_by": username, "linked_payment_id": linked_payment_id,
        "created_at": now, "updated_at": now,
    }

    cash_id = str(uuid.uuid4())
    cash_entry = {
        "id": cash_id, "date": date, "account": account, "txn_type": txn_type,
        "category": category, "party_type": party_type,
        "description": description,
        "amount": round(amount, 2),
        "reference": reference or f"pay:{linked_payment_id[:8]}",
        **base
    }
    if account == "bank" and bank_name:
        cash_entry["bank_name"] = bank_name

    ledger_id = str(uuid.uuid4())
    ledger_entry = {
        "id": ledger_id, "date": date, "account": "ledger",
        "txn_type": txn_type,
        "category": category, "party_type": party_type,
        "description": ledger_description or description,
        "amount": round(ledger_amount, 2),
        "reference": reference.replace(":", "_ledger:") if reference else f"pay_ledger:{linked_payment_id[:8]}",
        **base
    }

    await db.cash_transactions.insert_one(cash_entry)
    await db.cash_transactions.insert_one(ledger_entry)
    return cash_id, ledger_id


async def delete_linked_cash_entries(linked_payment_id: str):
    """Delete all cash_transactions linked to a payment ID."""
    result = await db.cash_transactions.delete_many({"linked_payment_id": linked_payment_id})
    return result.deleted_count


async def update_entry_paid_amount(collection_name: str, entry_id: str, amount_delta: float):
    """Adjust paid_amount on a purchase/sale entry by delta. Positive = more paid, Negative = reversal.
    Returns updated (paid_amount, balance) or None if not found.
    """
    coll = db[collection_name]
    entry = await coll.find_one({"id": entry_id})
    if not entry:
        return None
    total = float(entry.get("total_amount", 0) or 0)
    current_paid = float(entry.get("paid_amount", 0) or 0)
    new_paid = round(max(0, current_paid + amount_delta), 2)
    new_balance = round(total - new_paid, 2)
    await coll.update_one({"id": entry_id}, {"$set": {
        "paid_amount": new_paid,
        "balance": new_balance,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }})
    return new_paid, new_balance
