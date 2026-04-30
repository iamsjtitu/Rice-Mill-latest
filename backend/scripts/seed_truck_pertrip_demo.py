"""Seed demo data for Truck Owner Per-Trip Breakdown preview.

Creates 2 trucks with multiple Sale + Purchase trips with varied bhada amounts,
plus a couple of partial NIKASI payments — so the FIFO settlement view shows
mix of Settled / Partial / Pending statuses.

Idempotent: safely re-runnable. Cleans up existing demo entries by reference prefix.
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from database import db
import uuid
from datetime import datetime, timezone

DEMO_TRUCKS = [
    {
        "vehicle_no": "OD-15-DEMO-1234",
        "driver": "Ramesh Yadav",
        "kms_year": "2026-2027",
        "trips": [
            {"date": "2026-04-08", "trans_type": "Receive(Purchase)", "party_name": "Kesinga Mandi",   "farmer_name": "Kesinga Mandi",   "product": "PADDY", "tot_pkts": 100, "first_wt": 22000, "second_wt": 4000, "net_wt": 18000, "bhada": 2200, "second_dt": "2026-04-08"},
            {"date": "2026-04-12", "trans_type": "Dispatch(Sale)",   "party_name": "Sai Traders",      "farmer_name": "Sai Traders",     "product": "RICE",  "tot_pkts": 80,  "first_wt": 18000, "second_wt": 2000, "net_wt": 16000, "bhada": 4200, "bag_type": "bran_plastic", "second_dt": "2026-04-12"},
            {"date": "2026-04-15", "trans_type": "Receive(Purchase)", "party_name": "Patna Mandi",      "farmer_name": "Patna Mandi",     "product": "PADDY", "tot_pkts": 60,  "first_wt": 16000, "second_wt": 3500, "net_wt": 12500, "bhada": 1800, "second_dt": "2026-04-15"},
            {"date": "2026-04-18", "trans_type": "Dispatch(Sale)",   "party_name": "Govt Rice DC",     "farmer_name": "DC Komna",        "product": "RICE",  "tot_pkts": 100, "first_wt": 22000, "second_wt": 2000, "net_wt": 20000, "bhada": 4500, "bag_type": "bran_plastic", "second_dt": "2026-04-18"},
            {"date": "2026-04-25", "trans_type": "Receive(Purchase)", "party_name": "Ram Mandi Komna",  "farmer_name": "Ram Mandi Komna", "product": "PADDY", "tot_pkts": 50,  "first_wt": 14000, "second_wt": 3000, "net_wt": 11000, "bhada": 2000, "second_dt": "2026-04-25"},
            {"date": "2026-04-28", "trans_type": "Dispatch(Sale)",   "party_name": "R. Trader & Co.",  "farmer_name": "R. Trader",       "product": "BRAN",  "tot_pkts": 70,  "first_wt": 15000, "second_wt": 2000, "net_wt": 13000, "bhada": 3500, "bag_type": "bran_plastic", "second_dt": "2026-04-28"},
            {"date": "2026-04-30", "trans_type": "Dispatch(Sale)",   "party_name": "Mahesh Trader",    "farmer_name": "Mahesh Trader",   "product": "RICE",  "tot_pkts": 90,  "first_wt": 20000, "second_wt": 2000, "net_wt": 18000, "bhada": 4000, "bag_type": "bran_plastic", "second_dt": "2026-04-30"},
        ],
        # Total bhada = 2200+4200+1800+4500+2000+3500+4000 = 22,200
        # Paid = 16,000 (5 trips fully + 1 partial 1500)
        "nikasis": [
            {"date": "2026-04-13", "amount": 6400, "desc": "Bhada payment cash"},   # covers RST1 (2200), RST2 (4200) = 6400 → settled
            {"date": "2026-04-19", "amount": 8300, "desc": "Bhada batch payment"},  # covers RST3 (1800), RST4 (4500), RST5 (2000) = 8300 → settled
            {"date": "2026-04-29", "amount": 1500, "desc": "Partial Bhada"},        # covers RST6 partially (1500/3500) → partial
            # RST7 (4000) → pending fully
        ],
    },
    {
        "vehicle_no": "OD-21-DEMO-5678",
        "driver": "Suresh Pradhan",
        "kms_year": "2026-2027",
        "trips": [
            {"date": "2026-04-10", "trans_type": "Receive(Purchase)", "party_name": "FCI Lot 23-B",     "farmer_name": "FCI Lot 23-B",    "product": "PADDY", "tot_pkts": 100, "first_wt": 21000, "second_wt": 3000, "net_wt": 18000, "bhada": 2500, "second_dt": "2026-04-10"},
            {"date": "2026-04-20", "trans_type": "Dispatch(Sale)",   "party_name": "Local Buyer",      "farmer_name": "Local Buyer",     "product": "RICE",  "tot_pkts": 75,  "first_wt": 17000, "second_wt": 2000, "net_wt": 15000, "bhada": 3800, "bag_type": "bran_plastic", "second_dt": "2026-04-20"},
            {"date": "2026-04-26", "trans_type": "Receive(Purchase)", "party_name": "Komna Mandi",      "farmer_name": "Komna Mandi",     "product": "PADDY", "tot_pkts": 80,  "first_wt": 19000, "second_wt": 4000, "net_wt": 15000, "bhada": 2700, "second_dt": "2026-04-26"},
        ],
        # Total bhada = 9000, Paid = 0 → all pending
        "nikasis": [],
    },
]

DEMO_REF_PREFIX = "demo_truck_pertrip:"


async def cleanup_existing_demo():
    """Remove any pre-existing demo data (re-run safe)."""
    for t in DEMO_TRUCKS:
        vno = t["vehicle_no"]
        await db.vehicle_weights.delete_many({"vehicle_no": vno})
        await db.cash_transactions.delete_many({"category": vno, "party_type": "Truck"})
    # Sometimes auto-jama created via _sync_sale_bhada_ledger may also exist
    print("[demo] Cleared old demo data")


async def seed():
    await cleanup_existing_demo()

    # Get next RST atomically (just compute manually for demo)
    last_rst_doc = await db.vehicle_weights.find_one({}, sort=[("rst_no", -1)], projection={"_id": 0, "rst_no": 1})
    next_rst = (int(last_rst_doc.get("rst_no", 0)) + 1) if last_rst_doc else 1
    next_rst = max(next_rst, 1000)  # Stay out of real RST range

    now_iso = datetime.now(timezone.utc).isoformat()

    for truck in DEMO_TRUCKS:
        vno = truck["vehicle_no"]
        for trip in truck["trips"]:
            entry = {
                "id": str(uuid.uuid4()),
                "rst_no": next_rst,
                "vehicle_no": vno,
                "kms_year": truck["kms_year"],
                "season": "Kharif",
                "status": "completed",
                "created_at": now_iso,
                "updated_at": now_iso,
                "first_wt_dt": trip["date"] + "T08:00:00Z",
                "second_wt_dt": trip.get("second_dt", trip["date"]) + "T15:00:00Z",
                "g_issued": 0,
                "tp_no": "",
                "tp_weight": 0,
                "cash_paid": 0,
                "diesel_paid": 0,
                "remark": f"Demo seed",
                **trip,
            }
            await db.vehicle_weights.insert_one(entry)
            # Auto-jama (mimic backend _sync_sale_bhada_ledger)
            tt_lower = trip["trans_type"].lower()
            is_sale = "sale" in tt_lower or "dispatch" in tt_lower
            ref_kind = "vw_sale_bhada" if is_sale else "vw_purchase_bhada"
            label = "Sale" if is_sale else "Purchase"
            jama = {
                "id": str(uuid.uuid4()),
                "date": trip["date"],
                "account": "ledger",
                "txn_type": "jama",
                "category": vno,
                "party_type": "Truck",
                "amount": trip["bhada"],
                "description": f"{label} Bhada (RST #{next_rst}) → {trip['farmer_name']}",
                "kms_year": truck["kms_year"],
                "season": "Kharif",
                "created_by": "demo_seed",
                "linked_entry_id": entry["id"],
                "reference": f"{ref_kind}:{next_rst}",
                "created_at": now_iso,
                "updated_at": now_iso,
            }
            await db.cash_transactions.insert_one(jama)
            next_rst += 1

        # Insert NIKASI payments
        for nik in truck["nikasis"]:
            ent = {
                "id": str(uuid.uuid4()),
                "date": nik["date"],
                "account": "ledger",
                "txn_type": "nikasi",
                "category": vno,
                "party_type": "Truck",
                "amount": nik["amount"],
                "description": nik["desc"],
                "kms_year": truck["kms_year"],
                "season": "Kharif",
                "created_by": "demo_seed",
                "reference": f"{DEMO_REF_PREFIX}{vno}:{nik['date']}",
                "created_at": now_iso,
                "updated_at": now_iso,
            }
            await db.cash_transactions.insert_one(ent)

        print(f"[demo] Seeded truck {vno}: {len(truck['trips'])} trips + {len(truck['nikasis'])} nikasi(s)")

    print("[demo] DONE")

if __name__ == "__main__":
    asyncio.run(seed())
