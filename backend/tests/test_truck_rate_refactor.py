"""
Regression test for the truck-rate ledger upsert refactor.
Tests the `upsert_jama_ledger()` helper for INSERT, UPDATE, DELETE paths.

Run: cd /app/backend && python3 tests/test_truck_rate_refactor.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import uuid
from database import db
from services.cashbook_service import upsert_jama_ledger


TEST_PREFIX = "test_refactor_jama"
TEST_ENTRY_ID = f"test-entry-{uuid.uuid4().hex[:8]}"


async def cleanup():
    await db.cash_transactions.delete_many({"reference": {"$regex": f"^{TEST_PREFIX}:"}})
    await db.cash_transactions.delete_many({"linked_entry_id": TEST_ENTRY_ID})


async def test_insert_new_jama():
    print("→ test_insert_new_jama")
    await cleanup()
    result = await upsert_jama_ledger(
        query={"linked_entry_id": TEST_ENTRY_ID, "reference": {"$regex": f"^{TEST_PREFIX}:"}},
        doc={
            "date": "2026-04-29", "category": "TEST_TRUCK_001", "party_type": "Truck",
            "description": "Test Insert: 100Q @ Rs.50", "amount": 5000.0,
            "reference": f"{TEST_PREFIX}:abc123",
            "linked_entry_id": TEST_ENTRY_ID,
            "kms_year": "2025-26", "season": "Kharif", "created_by": "test_runner",
        },
    )
    assert result["action"] == "inserted", f"Expected inserted, got {result['action']}"
    assert result["id"] is not None
    found = await db.cash_transactions.find_one({"id": result["id"]}, {"_id": 0})
    assert found is not None
    assert found["amount"] == 5000.0
    assert found["account"] == "ledger"
    assert found["txn_type"] == "jama"
    assert found["category"] == "TEST_TRUCK_001"
    print("  ✓ PASS")
    await cleanup()


async def test_update_existing_jama_no_duplicate():
    print("→ test_update_existing_jama_no_duplicate")
    await cleanup()
    r1 = await upsert_jama_ledger(
        query={"linked_entry_id": TEST_ENTRY_ID, "reference": {"$regex": f"^{TEST_PREFIX}:"}},
        doc={
            "date": "2026-04-29", "category": "TEST_TRUCK_002", "party_type": "Truck",
            "description": "Initial 100Q @ Rs.50", "amount": 5000.0,
            "reference": f"{TEST_PREFIX}:def456",
            "linked_entry_id": TEST_ENTRY_ID,
            "kms_year": "2025-26", "season": "Kharif", "created_by": "test_runner",
        },
    )
    assert r1["action"] == "inserted"
    r2 = await upsert_jama_ledger(
        query={"linked_entry_id": TEST_ENTRY_ID, "reference": {"$regex": f"^{TEST_PREFIX}:"}},
        doc={
            "date": "2026-04-29", "category": "TEST_TRUCK_002", "party_type": "Truck",
            "description": "Updated 100Q @ Rs.75", "amount": 7500.0,
            "reference": f"{TEST_PREFIX}:def456",
            "linked_entry_id": TEST_ENTRY_ID,
            "kms_year": "2025-26", "season": "Kharif", "created_by": "test_runner",
        },
    )
    assert r2["action"] == "updated", f"Expected updated, got {r2['action']}"
    assert r2["id"] == r1["id"]
    matches = await db.cash_transactions.find(
        {"linked_entry_id": TEST_ENTRY_ID, "reference": {"$regex": f"^{TEST_PREFIX}:"}},
        {"_id": 0}
    ).to_list(10)
    assert len(matches) == 1, f"Expected 1, got {len(matches)}"
    assert matches[0]["amount"] == 7500.0
    assert "Rs.75" in matches[0]["description"]
    print("  ✓ PASS")
    await cleanup()


async def test_delete_on_zero_amount():
    print("→ test_delete_on_zero_amount")
    await cleanup()
    r1 = await upsert_jama_ledger(
        query={"linked_entry_id": TEST_ENTRY_ID, "reference": {"$regex": f"^{TEST_PREFIX}:"}},
        doc={
            "date": "2026-04-29", "category": "TEST_TRUCK_003", "party_type": "Truck",
            "description": "100Q @ Rs.50", "amount": 5000.0,
            "reference": f"{TEST_PREFIX}:ghi789",
            "linked_entry_id": TEST_ENTRY_ID,
            "kms_year": "2025-26", "season": "Kharif", "created_by": "test_runner",
        },
    )
    assert r1["action"] == "inserted"
    r2 = await upsert_jama_ledger(
        query={"linked_entry_id": TEST_ENTRY_ID, "reference": {"$regex": f"^{TEST_PREFIX}:"}},
        doc={"amount": 0, "description": "ignored"},
        allow_delete_on_zero=True,
    )
    assert r2["action"] == "deleted", f"Expected deleted, got {r2['action']}"
    assert r2["count"] == 1
    matches = await db.cash_transactions.find(
        {"linked_entry_id": TEST_ENTRY_ID, "reference": {"$regex": f"^{TEST_PREFIX}:"}},
        {"_id": 0}
    ).to_list(10)
    assert len(matches) == 0
    print("  ✓ PASS")
    await cleanup()


async def test_delete_on_zero_skips_when_no_existing():
    print("→ test_delete_on_zero_skips_when_no_existing")
    await cleanup()
    r = await upsert_jama_ledger(
        query={"linked_entry_id": TEST_ENTRY_ID, "reference": {"$regex": f"^{TEST_PREFIX}:"}},
        doc={"amount": 0},
        allow_delete_on_zero=True,
    )
    assert r["action"] == "deleted"
    assert r["count"] == 0
    print("  ✓ PASS")
    await cleanup()


async def main():
    print("=" * 60)
    print("upsert_jama_ledger() Regression Tests")
    print("=" * 60)
    try:
        await test_insert_new_jama()
        await test_update_existing_jama_no_duplicate()
        await test_delete_on_zero_amount()
        await test_delete_on_zero_skips_when_no_existing()
        print("=" * 60)
        print("✅ ALL 4 TESTS PASSED")
        print("=" * 60)
        return 0
    except AssertionError as e:
        print(f"❌ TEST FAILED: {e}")
        await cleanup()
        return 1
    except Exception as e:
        print(f"❌ ERROR: {type(e).__name__}: {e}")
        await cleanup()
        return 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
