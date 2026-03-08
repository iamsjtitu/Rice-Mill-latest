from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import HTMLResponse
from starlette.middleware.cors import CORSMiddleware
from database import client, print_pages
import os
import logging
import secrets

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
