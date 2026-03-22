"""
Round Off utility - Creates a separate "Round Off" entry in cash_transactions.
Called from any payment endpoint when round_off amount is provided.
"""
from datetime import datetime, timezone
from database import db
import uuid


async def create_round_off_entry(
    round_off_amount: float,
    date: str,
    category: str,
    account: str = "cash",
    bank_name: str = "",
    kms_year: str = "",
    season: str = "",
    created_by: str = "",
    reference: str = "",
    description: str = "",
):
    """
    Create a round-off cash_transaction entry.
    
    round_off_amount > 0: Extra paid (nikasi) - e.g., 990 rounded to 1000, round_off = +10
    round_off_amount < 0: Less paid (jama) - e.g., 1010 rounded to 1000, round_off = -10
    
    Returns the created entry dict or None if round_off is 0.
    """
    if not round_off_amount or round_off_amount == 0:
        return None

    abs_amount = round(abs(round_off_amount), 2)
    # Positive round_off = extra paid out = nikasi
    # Negative round_off = less paid / adjustment back = jama
    txn_type = "nikasi" if round_off_amount > 0 else "jama"

    if not description:
        sign = "+" if round_off_amount > 0 else ""
        description = f"Round Off ({sign}{round_off_amount}) - {category}"

    entry = {
        "id": str(uuid.uuid4()),
        "date": date,
        "account": account,
        "txn_type": txn_type,
        "category": "Round Off",
        "party_type": "Round Off",
        "description": description,
        "amount": abs_amount,
        "reference": reference or f"round_off:{category[:20]}",
        "bank_name": bank_name if account == "bank" else "",
        "kms_year": kms_year,
        "season": season,
        "created_by": created_by,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.cash_transactions.insert_one(entry)
    entry.pop("_id", None)
    return entry
