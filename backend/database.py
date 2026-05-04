"""
v104.44.97 — Database wrapper with auto commercial-rounding for amount fields.

Intercepts insert_one / insert_many / replace_one / find_one_and_update for
amount-bearing collections (cash_transactions, local_party_accounts, payments,
etc.) and rounds the `amount` field to integer using commercial rounding
(half-up: 49.50 → 50, NOT banker's rounding).

This guarantees no paise (.XX) leak into ledger entries from any insertion site
in the codebase, even legacy code that bypasses our utility helpers.
"""
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os
from utils.rounding import commercial_round

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Collections whose `amount` field should be commercial-rounded on every write
AMOUNT_COLLECTIONS = {
    "cash_transactions",
    "local_party_accounts",
    "truck_payments",
    "agent_payments",
    "staff_payments",
    "owner_payments",
    "hemali_payments",
    "diesel_accounts",
    "msp_payments",
    "leased_truck_payments",
    "voucher_payments",
}


def _round_amount_in_place(doc):
    """Round 'amount' field on a document in place. Idempotent."""
    if isinstance(doc, dict) and "amount" in doc and doc["amount"] is not None:
        doc["amount"] = commercial_round(doc["amount"])
    return doc


class _RoundingCollection:
    """Thin proxy around AsyncIOMotorCollection that rounds 'amount' on writes."""

    __slots__ = ("_coll",)

    def __init__(self, coll):
        self._coll = coll

    # ── Intercepted writes ──
    async def insert_one(self, doc, *args, **kwargs):
        _round_amount_in_place(doc)
        return await self._coll.insert_one(doc, *args, **kwargs)

    async def insert_many(self, docs, *args, **kwargs):
        for d in docs:
            _round_amount_in_place(d)
        return await self._coll.insert_many(docs, *args, **kwargs)

    async def replace_one(self, filt, replacement, *args, **kwargs):
        _round_amount_in_place(replacement)
        return await self._coll.replace_one(filt, replacement, *args, **kwargs)

    async def update_one(self, filt, update, *args, **kwargs):
        # Round inside $set if present
        if isinstance(update, dict):
            for op_key in ("$set", "$setOnInsert"):
                if op_key in update and isinstance(update[op_key], dict) and "amount" in update[op_key]:
                    update[op_key]["amount"] = commercial_round(update[op_key]["amount"])
        return await self._coll.update_one(filt, update, *args, **kwargs)

    async def update_many(self, filt, update, *args, **kwargs):
        if isinstance(update, dict):
            for op_key in ("$set",):
                if op_key in update and isinstance(update[op_key], dict) and "amount" in update[op_key]:
                    update[op_key]["amount"] = commercial_round(update[op_key]["amount"])
        return await self._coll.update_many(filt, update, *args, **kwargs)

    async def find_one_and_update(self, filt, update, *args, **kwargs):
        if isinstance(update, dict):
            for op_key in ("$set", "$setOnInsert"):
                if op_key in update and isinstance(update[op_key], dict) and "amount" in update[op_key]:
                    update[op_key]["amount"] = commercial_round(update[op_key]["amount"])
        return await self._coll.find_one_and_update(filt, update, *args, **kwargs)

    # ── Pass-through everything else ──
    def __getattr__(self, name):
        return getattr(self._coll, name)


class _RoundingDB:
    """DB proxy that wraps amount-bearing collections with rounding logic."""

    __slots__ = ("_db", "_cache")

    def __init__(self, db):
        self._db = db
        self._cache = {}

    def __getitem__(self, name):
        if name in self._cache:
            return self._cache[name]
        coll = self._db[name]
        if name in AMOUNT_COLLECTIONS:
            coll = _RoundingCollection(coll)
        self._cache[name] = coll
        return coll

    def __getattr__(self, name):
        # Allow access like db.cash_transactions
        if name.startswith("_"):
            raise AttributeError(name)
        return self.__getitem__(name)


mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
_raw_db = client[os.environ['DB_NAME']]
db = _RoundingDB(_raw_db)

USERS = {
    "admin": {"password": os.environ.get("ADMIN_PASSWORD", "admin123"), "role": "admin"},
    "staff": {"password": os.environ.get("STAFF_PASSWORD", "staff123"), "role": "staff"}
}

# Print page storage (server-side print for Electron compatibility)
print_pages = {}
