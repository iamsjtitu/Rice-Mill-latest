from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import HTMLResponse
from starlette.middleware.cors import CORSMiddleware
from database import client, print_pages
import os
import logging
import secrets
import asyncio

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Print page storage endpoints (must be on main api_router)
@api_router.post("/print")
async def create_print_page(request: Request):
    data = await request.json()
    page_id = secrets.token_urlsafe(16)
    print_pages[page_id] = data.get("html", "")
    return {"page_id": page_id, "url": f"/api/print/{page_id}"}

@api_router.get("/print/{page_id}", response_class=HTMLResponse)
async def get_print_page(page_id: str):
    html = print_pages.get(page_id, "<h1>Page not found</h1>")
    return HTMLResponse(content=html)

@api_router.get("/error-log")
async def get_error_log():
    return {"content": "Error log sirf Desktop App version mein available hai.\nWeb version mein yeh feature applicable nahi hai.", "available": False}

@api_router.delete("/error-log")
async def clear_error_log():
    return {"success": True, "message": "Error log clear ho gaya"}

# Import and include all route modules
from routes.auth import router as auth_router
from routes.entries import router as entries_router
from routes.payments import router as payments_router
from routes.exports import router as exports_router
from routes.milling import router as milling_router
from routes.cashbook import router as cashbook_router
from routes.dc_payments import router as dc_payments_router
from routes.reports import router as reports_router
from routes.private_trading import router as private_trading_router
from routes.ledgers import router as ledgers_router
from routes.mill_parts import router as mill_parts_router
from routes.daily_report import router as daily_report_router
from routes.staff import router as staff_router
from routes.diesel import router as diesel_router
from routes.local_party import router as local_party_router
from routes.fy_summary import router as fy_summary_router
from routes.telegram import router as telegram_router
from routes.salebook import router as salebook_router
from routes.purchase_vouchers import router as purchase_vouchers_router
from routes.voucher_payments import router as voucher_payments_router
from routes.gst_ledger import router as gst_ledger_router
from routes.truck_lease import router as truck_lease_router
from routes.hemali import router as hemali_router

api_router.include_router(auth_router)
api_router.include_router(entries_router)
api_router.include_router(payments_router)
api_router.include_router(exports_router)
api_router.include_router(milling_router)
api_router.include_router(cashbook_router)
api_router.include_router(dc_payments_router)
api_router.include_router(reports_router)
api_router.include_router(private_trading_router)
api_router.include_router(ledgers_router)
api_router.include_router(mill_parts_router)
api_router.include_router(daily_report_router)
api_router.include_router(staff_router)
api_router.include_router(diesel_router)
api_router.include_router(local_party_router)
api_router.include_router(fy_summary_router)
api_router.include_router(telegram_router)
api_router.include_router(salebook_router)
api_router.include_router(purchase_vouchers_router)
api_router.include_router(voucher_payments_router)
api_router.include_router(gst_ledger_router)
api_router.include_router(truck_lease_router)
api_router.include_router(hemali_router)

@api_router.post("/delete-all-data")
async def delete_all_data():
    from database import db as _db
    collections = ["mill_entries", "dc_entries", "dc_deliveries", "dc_msp_payments",
                    "sale_vouchers", "purchase_vouchers", "gunny_bags",
                    "cash_transactions", "opening_balances", "gst_opening_balances",
                    "local_party_accounts", "party_ledger", "mandi_targets",
                    "voucher_payments", "stock_summary"]
    deleted = {}
    for col in collections:
        result = await _db[col].delete_many({})
        deleted[col] = result.deleted_count
    return {"message": "All data cleared", "deleted": deleted}

# Include the api_router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


# Telegram scheduler background task
async def _telegram_scheduler_loop():
    """Check every 60 seconds if it's time to send the scheduled report"""
    from routes.telegram import get_telegram_config, scheduled_send_report
    while True:
        try:
            config = await get_telegram_config()
            if config and config.get("enabled") and config.get("schedule_time"):
                from datetime import datetime
                now = datetime.now()
                current_time = now.strftime("%H:%M")
                if current_time == config["schedule_time"]:
                    logger.info("Telegram scheduler: Time matched, sending report...")
                    await scheduled_send_report()
                    await asyncio.sleep(61)  # skip this minute
                    continue
        except Exception as e:
            logger.error(f"Telegram scheduler error: {e}")
        await asyncio.sleep(30)


@app.on_event("startup")
async def start_telegram_scheduler():
    asyncio.create_task(_telegram_scheduler_loop())
    logger.info("Telegram scheduler started")

@app.on_event("startup")
async def fix_empty_descriptions():
    """One-time migration: fill empty descriptions in cash_transactions"""
    try:
        from database import db
        empty_txns = await db.cash_transactions.find(
            {"$or": [{"description": ""}, {"description": None}, {"description": {"$exists": False}}]}
        ).to_list(length=500)
        if not empty_txns:
            return
        count = 0
        for txn in empty_txns:
            cat = txn.get("category", "Unknown")
            acct = (txn.get("account", "cash") or "cash").capitalize()
            ttype = txn.get("txn_type", "nikasi")
            if ttype == "jama":
                desc = f"{acct} received from {cat}"
            else:
                desc = f"{acct} payment to {cat}"
            await db.cash_transactions.update_one(
                {"id": txn["id"]},
                {"$set": {"description": desc}}
            )
            count += 1
        if count > 0:
            logger.info(f"Fixed {count} empty descriptions in cash_transactions")
    except Exception as e:
        logger.error(f"Empty description migration error: {e}")


@app.on_event("startup")
async def hemali_integrity_check():
    """Startup: reconcile hemali payments with cashbook entries"""
    try:
        from database import db
        import uuid as _uuid
        fixed = 0
        # 1. Paid hemali payments without cashbook entry → revert to unpaid
        paid_payments = await db.hemali_payments.find({"status": "paid"}, {"_id": 0}).to_list(5000)
        for p in paid_payments:
            cash_entry = await db.cash_transactions.find_one({"reference": f"hemali_payment:{p['id']}"}, {"_id": 0})
            if not cash_entry:
                await db.hemali_payments.update_one({"id": p["id"]}, {"$set": {"status": "unpaid"}})
                await db.cash_transactions.delete_many({
                    "reference": {"$in": [f"hemali_work:{p['id']}", f"hemali_paid:{p['id']}"]}
                })
                await db.local_party_accounts.delete_many({
                    "reference": f"hemali_debit:{p['id']}"
                })
                fixed += 1
                logger.info(f"Hemali integrity: reverted payment {p['id']} to unpaid (no cashbook entry)")

        # 2. Paid hemali payments without ledger entries → create them
        paid_payments = await db.hemali_payments.find({"status": "paid"}, {"_id": 0}).to_list(5000)
        for p in paid_payments:
            ledger_entry = await db.cash_transactions.find_one({"reference": f"hemali_work:{p['id']}"}, {"_id": 0})
            if not ledger_entry:
                now = datetime.now(timezone.utc).isoformat()
                items_desc = ", ".join(f"{i['item_name']} x{i['quantity']}" for i in p.get("items", []))
                sardar = p.get("sardar_name", "")
                adv_info = ""
                if p.get("advance_deducted", 0) > 0:
                    adv_info += f" | Adv Deducted: Rs.{p['advance_deducted']:.0f}"
                if p.get("new_advance", 0) > 0:
                    adv_info += f" | New Advance: Rs.{p['new_advance']:.0f}"
                base = {"kms_year": p.get("kms_year", ""), "season": p.get("season", ""),
                        "created_by": p.get("created_by", ""), "created_at": now, "updated_at": now}
                await db.cash_transactions.insert_one({
                    "id": str(_uuid.uuid4()), "date": p["date"], "account": "ledger", "txn_type": "jama",
                    "amount": p.get("total", 0), "category": "Hemali Payment", "party_type": "Hemali",
                    "description": f"{sardar} - {items_desc} | Total: Rs.{p.get('total',0):.0f}",
                    "reference": f"hemali_work:{p['id']}", **base,
                })
                await db.cash_transactions.insert_one({
                    "id": str(_uuid.uuid4()), "date": p["date"], "account": "ledger", "txn_type": "nikasi",
                    "amount": p.get("amount_paid", 0), "category": "Hemali Payment", "party_type": "Hemali",
                    "description": f"{sardar} - Paid Rs.{p.get('amount_paid',0):.0f}{adv_info}",
                    "reference": f"hemali_paid:{p['id']}", **base,
                })
                # Also create local_party_accounts debit if missing
                lp_entry = await db.local_party_accounts.find_one({"reference": f"hemali_debit:{p['id']}"}, {"_id": 0})
                if not lp_entry:
                    await db.local_party_accounts.insert_one({
                        "id": str(_uuid.uuid4()), "date": p["date"],
                        "party_name": "Hemali Payment", "txn_type": "debit",
                        "amount": p.get("total", 0),
                        "description": f"{sardar} - {items_desc} | Total: Rs.{p.get('total',0):.0f}",
                        "reference": f"hemali_debit:{p['id']}", "source_type": "hemali",
                        "kms_year": p.get("kms_year", ""), "season": p.get("season", ""),
                        "created_by": p.get("created_by", ""), "created_at": now,
                    })
                fixed += 1
                logger.info(f"Hemali integrity: created missing ledger entries for payment {p['id']}")

        if fixed > 0:
            logger.info(f"Hemali integrity check: fixed {fixed} payments")
    except Exception as e:
        logger.error(f"Hemali integrity check error: {e}")
