from fastapi import APIRouter, HTTPException, Request
from database import db
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime, timezone
import uuid

router = APIRouter()

# ============ GST SETTINGS ============

class GSTSettings(BaseModel):
    cgst_percent: float = 0
    sgst_percent: float = 0
    igst_percent: float = 0

@router.get("/gst-settings")
async def get_gst_settings():
    settings = await db.settings.find_one({"key": "gst"}, {"_id": 0})
    if not settings:
        return {"cgst_percent": 0, "sgst_percent": 0, "igst_percent": 0}
    return {"cgst_percent": settings.get("cgst_percent", 0), "sgst_percent": settings.get("sgst_percent", 0), "igst_percent": settings.get("igst_percent", 0)}

@router.put("/gst-settings")
async def update_gst_settings(data: GSTSettings):
    await db.settings.update_one(
        {"key": "gst"},
        {"$set": {"key": "gst", "cgst_percent": data.cgst_percent, "sgst_percent": data.sgst_percent, "igst_percent": data.igst_percent}},
        upsert=True
    )
    return {"success": True, "message": "GST settings updated"}

# ============ SALE BOOK ============

class SaleItemCreate(BaseModel):
    item_name: str
    quantity: float = 0
    rate: float = 0
    unit: str = "Qntl"
    hsn_code: str = ""
    gst_percent: float = 0

class SaleVoucherCreate(BaseModel):
    date: str
    party_name: str
    invoice_no: str = ""
    buyer_gstin: str = ""
    buyer_address: str = ""
    items: list[SaleItemCreate] = []
    gst_type: str = "none"
    cgst_percent: float = 0
    sgst_percent: float = 0
    igst_percent: float = 0
    truck_no: str = ""
    rst_no: str = ""
    remark: str = ""
    cash_paid: float = 0
    diesel_paid: float = 0
    advance: float = 0
    eway_bill_no: str = ""
    kms_year: str = ""
    season: str = ""

class SaleVoucher(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    voucher_no: int = 0
    invoice_no: str = ""
    date: str = ""
    party_name: str = ""
    buyer_gstin: str = ""
    buyer_address: str = ""
    items: list = []
    subtotal: float = 0
    gst_type: str = "none"
    cgst_percent: float = 0
    sgst_percent: float = 0
    igst_percent: float = 0
    cgst_amount: float = 0
    sgst_amount: float = 0
    igst_amount: float = 0
    total: float = 0
    truck_no: str = ""
    rst_no: str = ""
    remark: str = ""
    cash_paid: float = 0
    diesel_paid: float = 0
    advance: float = 0
    eway_bill_no: str = ""
    paid_amount: float = 0
    balance: float = 0
    kms_year: str = ""
    season: str = ""
    created_by: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@router.get("/sale-book/stock-items")
async def get_stock_items(kms_year: Optional[str] = None, season: Optional[str] = None):
    from utils.stock_calculator import (
        calc_rice_produced, calc_govt_delivered, calc_pvt_rice_sold,
        calc_sale_voucher_items, calc_purchase_voucher_items,
        calc_byproduct_produced, calc_byproduct_sold, calc_frk_in, BY_PRODUCTS
    )
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season

    # ===== FETCH OPENING STOCK =====
    ob = {}
    if kms_year:
        ob_doc = await db.opening_stock.find_one({"kms_year": kms_year}, {"_id": 0})
        if ob_doc:
            ob = ob_doc.get("stocks", {})
    ob_usna = float(ob.get("rice_usna", ob.get("rice", 0)))
    ob_raw = float(ob.get("rice_raw", 0))
    ob_bran = float(ob.get("bran", 0))
    ob_kunda = float(ob.get("kunda", 0))
    ob_broken = float(ob.get("broken", 0))
    ob_kanki = float(ob.get("kanki", 0))
    ob_husk = float(ob.get("husk", 0))
    ob_frk = float(ob.get("frk", 0))

    milling = await db.milling_entries.find(query, {"_id": 0}).to_list(10000)
    dc = await db.dc_entries.find(query, {"_id": 0}).to_list(10000)
    pvt_sales = await db.rice_sales.find(query, {"_id": 0}).to_list(10000)
    sale_vouchers = await db.sale_vouchers.find(query, {"_id": 0}).to_list(10000)
    purchase_vouchers = await db.purchase_vouchers.find(query, {"_id": 0}).to_list(10000)
    bp_sales = await db.byproduct_sales.find(query, {"_id": 0}).to_list(10000)

    usna_produced = calc_rice_produced(milling, 'usna')
    raw_produced = calc_rice_produced(milling, 'raw')
    govt_delivered = calc_govt_delivered(dc)
    pvt_sold_usna = calc_pvt_rice_sold(pvt_sales, 'usna')
    pvt_sold_raw = calc_pvt_rice_sold(pvt_sales, 'raw')
    sb_sold = calc_sale_voucher_items(sale_vouchers)
    pv_bought = calc_purchase_voucher_items(purchase_vouchers)
    bp_produced = calc_byproduct_produced(milling)
    bp_sold_map = calc_byproduct_sold(bp_sales)

    items = []
    usna_avail = round(ob_usna + usna_produced + pv_bought.get("Rice (Usna)", 0) - govt_delivered - pvt_sold_usna - sb_sold.get("Rice (Usna)", 0), 2)
    raw_avail = round(ob_raw + raw_produced + pv_bought.get("Rice (Raw)", 0) - pvt_sold_raw - sb_sold.get("Rice (Raw)", 0), 2)
    items.append({"name": "Rice (Usna)", "available_qntl": usna_avail, "unit": "Qntl"})
    items.append({"name": "Rice (Raw)", "available_qntl": raw_avail, "unit": "Qntl"})

    bp_ob_map = {"bran": ob_bran, "kunda": ob_kunda, "broken": ob_broken, "kanki": ob_kanki, "husk": ob_husk}
    for p in BY_PRODUCTS:
        produced = bp_produced.get(p, 0)
        purchased = pv_bought.get(p.title(), 0)
        sold_bp = round(bp_sold_map.get(p, 0), 2)
        sold_sb = sb_sold.get(p.title(), 0)
        item_ob = bp_ob_map.get(p, 0)
        avail = round(item_ob + produced + purchased - sold_bp - sold_sb, 2)
        items.append({"name": p.title(), "available_qntl": avail, "unit": "Qntl"})

    frk_purchases = await db.frk_purchases.find(query, {"_id": 0}).to_list(10000) if await db.frk_purchases.count_documents(query) > 0 else []
    frk_in = calc_frk_in(frk_purchases)
    frk_pv = pv_bought.get("FRK", 0)
    frk_sold_sb = sb_sold.get("FRK", 0)
    items.append({"name": "FRK", "available_qntl": round(ob_frk + frk_in + frk_pv - frk_sold_sb, 2), "unit": "Qntl"})

    # Custom items from Purchase Vouchers not already covered
    known_items = {"Rice (Usna)", "Rice (Raw)", "FRK"} | {p.title() for p in BY_PRODUCTS}
    for item_name, qty in pv_bought.items():
        if item_name not in known_items and item_name:
            sold = sb_sold.get(item_name, 0)
            items.append({"name": item_name, "available_qntl": round(qty - sold, 2), "unit": "Qntl"})

    return items


@router.get("/sale-book")
async def get_sale_vouchers(kms_year: Optional[str] = None, season: Optional[str] = None,
                            party_name: Optional[str] = None, invoice_no: Optional[str] = None,
                            rst_no: Optional[str] = None, search: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if party_name: query["party_name"] = {"$regex": party_name, "$options": "i"}
    if invoice_no: query["invoice_no"] = {"$regex": invoice_no, "$options": "i"}
    if rst_no: query["rst_no"] = {"$regex": rst_no, "$options": "i"}
    if search:
        query["$or"] = [
            {"party_name": {"$regex": search, "$options": "i"}},
            {"invoice_no": {"$regex": search, "$options": "i"}},
            {"rst_no": {"$regex": search, "$options": "i"}},
            {"truck_no": {"$regex": search, "$options": "i"}},
        ]
    vouchers = await db.sale_vouchers.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    
    # Get ledger-based paid amounts per party (includes Cash Book manual payments)
    party_names = list(set(v.get("party_name", "") for v in vouchers if v.get("party_name")))
    ledger_paid_map = {}
    if party_names:
        ledger_query = {"account": "ledger", "txn_type": "nikasi", "category": {"$in": party_names}, "party_type": "Sale Book"}
        if kms_year: ledger_query["kms_year"] = kms_year
        if season: ledger_query["season"] = season
        ledger_txns = await db.cash_transactions.find(ledger_query, {"_id": 0}).to_list(50000)
        for lt in ledger_txns:
            pn = lt.get("category", "")
            ledger_paid_map[pn] = ledger_paid_map.get(pn, 0) + lt.get("amount", 0)
    
    for v in vouchers:
        pn = v.get("party_name", "")
        if pn:
            total_paid = round(ledger_paid_map.get(pn, 0), 2)
            v["ledger_paid"] = total_paid
            v["ledger_balance"] = round((v.get("total", 0)) - total_paid, 2)
    
    return vouchers


async def _get_default_pump():
    """Get default diesel pump name"""
    pump = await db.diesel_accounts.find_one({}, {"_id": 0, "pump_name": 1}, sort=[("_id", -1)])
    return pump.get("pump_name", "Diesel Pump") if pump else "Diesel Pump"


async def _create_sale_ledger_entries(d, doc_id, vno, items, username):
    """Create all accounting entries for a sale voucher"""
    party = (d.get('party_name') or '').strip()
    cash = d.get('cash_paid', 0) or 0
    diesel = d.get('diesel_paid', 0) or 0
    advance = d.get('advance', 0) or 0
    total = d.get('total', 0) or 0
    truck = (d.get('truck_no') or '').strip()
    now_iso = datetime.now(timezone.utc).isoformat()
    base = {"kms_year": d.get('kms_year', ''), "season": d.get('season', ''), "created_by": username, "created_at": now_iso, "updated_at": now_iso}
    inv = d.get('invoice_no', '')
    desc_suffix = f" | Inv:{inv}" if inv else ""
    items_str = ', '.join(i['item_name'] for i in items)
    entries = []

    # 1. Party Ledger JAMA: total sale amount (party owes us)
    if party and total > 0:
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "ledger", "txn_type": "jama",
            "amount": total, "category": party, "party_type": "Sale Book",
            "description": f"Sale #{vno} - {items_str}{desc_suffix}",
            "reference": f"sale_voucher:{doc_id}", **base
        })

    # 2. Advance from party: Party Ledger NIKASI (reduces party debt)
    if advance > 0 and party:
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "ledger", "txn_type": "nikasi",
            "amount": advance, "category": party, "party_type": "Sale Book",
            "description": f"Advance received - Sale #{vno}{desc_suffix}",
            "reference": f"sale_voucher_adv:{doc_id}", **base
        })
        # Cash JAMA: advance cash received (money comes into cash box)
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "cash", "txn_type": "jama",
            "amount": advance, "category": party, "party_type": "Sale Book",
            "description": f"Advance received - Sale #{vno}{desc_suffix}",
            "reference": f"sale_voucher_adv_cash:{doc_id}", **base
        })

    # 3. Cash paid to truck → Cash NIKASI (cash going out)
    if cash > 0:
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "cash", "txn_type": "nikasi",
            "amount": cash, "category": truck or party, "party_type": "Truck" if truck else "Sale Book",
            "description": f"Truck cash - Sale #{vno}{desc_suffix}",
            "reference": f"sale_voucher_cash:{doc_id}", **base
        })

    # 4. Diesel paid → Diesel Pump Ledger JAMA (we owe pump) + diesel_accounts entry
    if diesel > 0:
        pump_name = await _get_default_pump()
        # Get pump_id
        pump_doc = await db.diesel_accounts.find_one({"pump_name": pump_name}, {"_id": 0, "pump_id": 1})
        pump_id = pump_doc.get("pump_id", "") if pump_doc else ""
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "ledger", "txn_type": "jama",
            "amount": diesel, "category": pump_name, "party_type": "Diesel",
            "description": f"Diesel for truck - Sale #{vno} - {party}{desc_suffix}",
            "reference": f"sale_voucher_diesel:{doc_id}", **base
        })
        # Also create entry in diesel_accounts collection (txn_type=debit so it counts in summary)
        diesel_entry = {
            "id": str(uuid.uuid4()), "date": d.get('date', ''),
            "pump_id": pump_id, "pump_name": pump_name,
            "truck_no": truck, "agent_name": party,
            "amount": diesel, "txn_type": "debit",
            "description": f"Diesel for Sale #{vno} - {party}{desc_suffix}",
            "reference": f"sale_voucher_diesel:{doc_id}",
            **base
        }
        await db.diesel_accounts.insert_one(diesel_entry)

    # 5. Truck cash+diesel → Truck Ledger NIKASI (deductions from future bhada)
    if cash > 0 and truck:
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "ledger", "txn_type": "nikasi",
            "amount": cash, "category": truck, "party_type": "Truck",
            "description": f"Truck cash deduction - Sale #{vno}{desc_suffix}",
            "reference": f"sale_truck_cash:{doc_id}", **base
        })
    if diesel > 0 and truck:
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "ledger", "txn_type": "nikasi",
            "amount": diesel, "category": truck, "party_type": "Truck",
            "description": f"Truck diesel deduction - Sale #{vno}{desc_suffix}",
            "reference": f"sale_truck_diesel:{doc_id}", **base
        })
    # Create truck_payments entry (rate will be set later by admin)
    truck_total = cash + diesel
    if truck_total > 0 and truck:
        truck_entry = {
            "entry_id": doc_id,
            "truck_no": truck, "date": d.get('date', ''),
            "cash_taken": cash, "diesel_taken": diesel,
            "gross_amount": 0, "deductions": truck_total,
            "net_amount": 0, "paid_amount": 0,
            "balance_amount": 0, "status": "pending",
            "source": "Sale Book",
            "description": f"Sale #{vno} - {party}{desc_suffix}",
            "reference": f"sale_voucher_truck:{doc_id}",
            **base
        }
        await db.truck_payments.insert_one(truck_entry)

    for entry in entries:
        await db.cash_transactions.insert_one(entry)

    # Create local_party_accounts entry for sale voucher (party owes us = debit)
    if party and total > 0:
        lp = {
            "id": str(uuid.uuid4()), "date": d.get('date', ''),
            "party_name": party, "txn_type": "debit",
            "amount": total, "description": f"Sale #{vno} - {items_str}{desc_suffix}",
            "source_type": "sale_voucher", "reference": f"sale_voucher:{doc_id}",
            "kms_year": d.get('kms_year', ''), "season": d.get('season', ''),
            "created_by": username, "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.local_party_accounts.insert_one(lp)
    # If advance received, add payment entry in local_party
    if advance > 0 and party:
        lp_adv = {
            "id": str(uuid.uuid4()), "date": d.get('date', ''),
            "party_name": party, "txn_type": "payment",
            "amount": advance, "description": f"Advance received - Sale #{vno}{desc_suffix}",
            "source_type": "sale_voucher_advance", "reference": f"sale_voucher_adv:{doc_id}",
            "kms_year": d.get('kms_year', ''), "season": d.get('season', ''),
            "created_by": username, "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.local_party_accounts.insert_one(lp_adv)


def _compute_sale_gst(d):
    """Compute per-item GST and voucher totals. Modifies d in-place."""
    raw_items = d.get('items', [])
    gst_type = d.get('gst_type', 'none')
    items = []
    subtotal = 0
    total_gst = 0
    for item in raw_items:
        qty = item.get('quantity', 0) or 0
        rate = item.get('rate', 0) or 0
        amount = round(qty * rate, 2)
        gst_pct = item.get('gst_percent', 0) or 0
        item_gst = round(amount * gst_pct / 100, 2) if gst_type != 'none' else 0
        items.append({**item, "amount": amount, "gst_amount": item_gst})
        subtotal += amount
        total_gst += item_gst
    d['items'] = items
    d['subtotal'] = round(subtotal, 2)
    if gst_type == 'cgst_sgst':
        d['cgst_amount'] = round(total_gst / 2, 2)
        d['sgst_amount'] = round(total_gst / 2, 2)
        d['igst_amount'] = 0
    elif gst_type == 'igst':
        d['cgst_amount'] = 0
        d['sgst_amount'] = 0
        d['igst_amount'] = round(total_gst, 2)
    else:
        d['cgst_amount'] = 0
        d['sgst_amount'] = 0
        d['igst_amount'] = 0
    total = round(subtotal + d['cgst_amount'] + d['sgst_amount'] + d['igst_amount'], 2)
    d['total'] = total
    advance = d.get('advance', 0) or 0
    d['paid_amount'] = round(advance, 2)
    d['balance'] = round(total - advance, 2)
    return items


@router.post("/sale-book")
async def create_sale_voucher(input: SaleVoucherCreate, username: str = "", role: str = ""):
    d = input.model_dump()
    items = _compute_sale_gst(d)
    d['created_by'] = username
    
    last = await db.sale_vouchers.find_one(sort=[("voucher_no", -1)], projection={"_id": 0, "voucher_no": 1})
    d['voucher_no'] = (last.get('voucher_no', 0) if last else 0) + 1
    
    obj = SaleVoucher(**d)
    doc = obj.model_dump()
    await db.sale_vouchers.insert_one(doc)
    doc.pop('_id', None)
    
    await _create_sale_ledger_entries(d, doc.get('id', ''), d['voucher_no'], items, username)
    
    return doc


@router.delete("/sale-book/{voucher_id}")
async def delete_sale_voucher(voucher_id: str, username: str = "", role: str = ""):
    existing = await db.sale_vouchers.find_one({"id": voucher_id}, {"_id": 0})
    if not existing: raise HTTPException(status_code=404, detail="Voucher not found")
    await db.sale_vouchers.delete_one({"id": voucher_id})
    await db.cash_transactions.delete_many({"reference": {"$regex": f"sale_voucher.*:{voucher_id}"}})
    await db.diesel_accounts.delete_many({"reference": {"$regex": f"sale_voucher.*:{voucher_id}"}})
    await db.truck_payments.delete_many({"reference": {"$regex": f"sale_voucher.*:{voucher_id}"}})
    await db.local_party_accounts.delete_many({"reference": {"$regex": f"sale_voucher.*:{voucher_id}"}})
    return {"message": "Sale voucher deleted", "id": voucher_id}


@router.post("/sale-book/delete-bulk")
async def bulk_delete_sale_vouchers(request: Request):
    data = await request.json()
    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    deleted = 0
    for vid in ids:
        existing = await db.sale_vouchers.find_one({"id": vid}, {"_id": 0})
        if existing:
            await db.sale_vouchers.delete_one({"id": vid})
            await db.cash_transactions.delete_many({"reference": {"$regex": f"sale_voucher.*:{vid}"}})
            await db.diesel_accounts.delete_many({"reference": {"$regex": f"sale_voucher.*:{vid}"}})
            await db.truck_payments.delete_many({"reference": {"$regex": f"sale_voucher.*:{vid}"}})
            await db.local_party_accounts.delete_many({"reference": {"$regex": f"sale_voucher.*:{vid}"}})
            deleted += 1
    return {"message": f"{deleted} sale vouchers deleted", "deleted": deleted}


@router.put("/sale-book/{voucher_id}")
async def update_sale_voucher(voucher_id: str, input: SaleVoucherCreate, username: str = "", role: str = ""):
    existing = await db.sale_vouchers.find_one({"id": voucher_id}, {"_id": 0})
    if not existing: raise HTTPException(status_code=404, detail="Voucher not found")
    
    d = input.model_dump()
    items = _compute_sale_gst(d)
    d['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.sale_vouchers.update_one({"id": voucher_id}, {"$set": d})
    
    # Delete old entries and recreate
    await db.cash_transactions.delete_many({"reference": {"$regex": f"sale_voucher.*:{voucher_id}"}})
    await db.diesel_accounts.delete_many({"reference": {"$regex": f"sale_voucher.*:{voucher_id}"}})
    await db.truck_payments.delete_many({"reference": {"$regex": f"sale_voucher.*:{voucher_id}"}})
    await db.local_party_accounts.delete_many({"reference": {"$regex": f"sale_voucher.*:{voucher_id}"}})
    vno = existing.get('voucher_no', 0)
    await _create_sale_ledger_entries(d, voucher_id, vno, items, username)
    
    updated = await db.sale_vouchers.find_one({"id": voucher_id}, {"_id": 0})
    return updated


# ============ SALE BOOK PDF EXPORT (A4 Fit, Professional) ============

@router.get("/sale-book/export/pdf")
async def export_sale_book_pdf(kms_year: Optional[str] = None, season: Optional[str] = None, search: Optional[str] = None):
    from fastapi.responses import Response
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from utils.export_helpers import get_pdf_styles; from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    import io

    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if search:
        query["$or"] = [
            {"party_name": {"$regex": search, "$options": "i"}},
            {"invoice_no": {"$regex": search, "$options": "i"}},
            {"rst_no": {"$regex": search, "$options": "i"}},
        ]
    vouchers = await db.sale_vouchers.find(query, {"_id": 0}).sort("voucher_no", 1).to_list(10000)

    # Get ledger-based paid amounts
    party_names = list(set(v.get("party_name", "") for v in vouchers if v.get("party_name")))
    ledger_paid_map = {}
    if party_names:
        ledger_q = {"account": "ledger", "txn_type": "nikasi", "category": {"$in": party_names}, "party_type": "Sale Book"}
        if kms_year: ledger_q["kms_year"] = kms_year
        ledger_txns = await db.cash_transactions.find(ledger_q, {"_id": 0}).to_list(50000)
        for lt in ledger_txns:
            pn = lt.get("category", "")
            ledger_paid_map[pn] = ledger_paid_map.get(pn, 0) + lt.get("amount", 0)

    branding = await db.settings.find_one({"key": "branding"}, {"_id": 0}) or {}
    company = branding.get("company_name", "NAVKAR AGRO")
    tagline = branding.get("tagline", "")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=6*mm, rightMargin=6*mm, topMargin=8*mm, bottomMargin=6*mm)
    elements = []
    styles = get_pdf_styles()

    from utils.branding_helper import get_pdf_company_header_from_db
    elements.extend(await get_pdf_company_header_from_db())

    meta_parts = ["Sale Book"]
    if kms_year: meta_parts.append(f"FY: {kms_year}")
    if season: meta_parts.append(season)
    meta_parts.append(f"Date: {datetime.now().strftime('%d-%m-%Y')}")
    meta_style = ParagraphStyle('Meta', parent=styles['Normal'], fontSize=7, textColor=colors.HexColor('#555555'), alignment=TA_CENTER, spaceAfter=4)
    elements.append(Paragraph(" | ".join(meta_parts), meta_style))

    cell_s = ParagraphStyle('Cell', parent=styles['Normal'], fontSize=6, leading=8)
    cell_r = ParagraphStyle('CellR', parent=styles['Normal'], fontSize=6, leading=8, alignment=TA_RIGHT)
    cell_b = ParagraphStyle('CellB', parent=styles['Normal'], fontSize=6, leading=8, fontName='FreeSansBold')
    cell_rb = ParagraphStyle('CellRB', parent=styles['Normal'], fontSize=6, leading=8, alignment=TA_RIGHT, fontName='FreeSansBold')

    headers = ['#', 'Date', 'Inv', 'Party', 'Items', 'Truck/RST', 'Total', 'Adv', 'Cash', 'Diesel', 'Paid', 'Balance', 'Status']
    table_data = [headers]
    # Optimized for A4 landscape
    col_widths = [12*mm, 18*mm, 16*mm, 28*mm, 52*mm, 22*mm, 20*mm, 16*mm, 16*mm, 16*mm, 20*mm, 20*mm, 16*mm]

    g = {"total": 0, "adv": 0, "cash": 0, "diesel": 0, "paid": 0, "bal": 0}
    for v in vouchers:
        items_str = ', '.join(f"{i['item_name']} ({i['quantity']} Qntl)" for i in v.get('items', []))
        dp = str(v.get('date', '')).split('-')
        fd = f"{dp[2]}/{dp[1]}/{dp[0]}" if len(dp) == 3 else v.get('date', '')
        truck_rst = v.get('truck_no', '')
        if v.get('rst_no'): truck_rst += f"/{v['rst_no']}"
        total = v.get('total', 0) or 0
        pn = v.get('party_name', '')
        ledger_paid = round(ledger_paid_map.get(pn, 0), 2)
        ledger_bal = round(total - ledger_paid, 2)
        status = "Paid" if ledger_bal <= 0 and total > 0 else "Pending"
        g["total"] += total
        g["adv"] += v.get('advance', 0) or 0
        g["cash"] += v.get('cash_paid', 0) or 0
        g["diesel"] += v.get('diesel_paid', 0) or 0
        g["paid"] += ledger_paid
        g["bal"] += ledger_bal
        table_data.append([
            Paragraph(f"#{v.get('voucher_no','')}", cell_s),
            Paragraph(fd, cell_s),
            Paragraph(str(v.get('invoice_no', '')), cell_s),
            Paragraph(f"<b>{pn}</b>", cell_s),
            Paragraph(items_str, cell_s),
            Paragraph(truck_rst, cell_s),
            Paragraph(f"{total:,.0f}", cell_rb),
            Paragraph(f"{v.get('advance',0) or 0:,.0f}", cell_r),
            Paragraph(f"{v.get('cash_paid',0) or 0:,.0f}", cell_r),
            Paragraph(f"{v.get('diesel_paid',0) or 0:,.0f}", cell_r),
            Paragraph(f"{ledger_paid:,.0f}", cell_r),
            Paragraph(f"{ledger_bal:,.0f}", cell_rb),
            Paragraph(status, cell_s),
        ])

    # Total row
    table_data.append([
        Paragraph(f"<b>TOTAL ({len(vouchers)})</b>", cell_b), '', '', '', '', '',
        Paragraph(f"<b>{g['total']:,.0f}</b>", cell_rb),
        Paragraph(f"<b>{g['adv']:,.0f}</b>", cell_rb),
        Paragraph(f"<b>{g['cash']:,.0f}</b>", cell_rb),
        Paragraph(f"<b>{g['diesel']:,.0f}</b>", cell_rb),
        Paragraph(f"<b>{g['paid']:,.0f}</b>", cell_rb),
        Paragraph(f"<b>{g['bal']:,.0f}</b>", cell_rb),
        '',
    ])

    tbl = RLTable(table_data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a5276')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'FreeSansBold'),
        ('FONTSIZE', (0, 0), (-1, 0), 6),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#CBD5E1')),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#1a5276')),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.white),
    ]
    for i in range(1, len(table_data) - 1):
        if i % 2 == 0:
            style_cmds.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#F8FAFC')))
    tbl.setStyle(TableStyle(style_cmds))
    elements.append(tbl)

    footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=6, textColor=colors.HexColor('#999999'), alignment=TA_CENTER, spaceBefore=6)
    elements.append(Paragraph(f"{company} - Sale Book | Generated: {datetime.now().strftime('%d-%m-%Y %H:%M')}", footer_style))

    doc.build(elements)
    return Response(content=buf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=sale_book.pdf"})


# ============ SALE BOOK EXCEL EXPORT ============

@router.get("/sale-book/export/excel")
async def export_sale_book_excel(kms_year: Optional[str] = None, season: Optional[str] = None, search: Optional[str] = None):
    from fastapi.responses import Response
    import io
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, Alignment, Border, Side, PatternFill, numbers
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl not installed")
    
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if search:
        query["$or"] = [
            {"party_name": {"$regex": search, "$options": "i"}},
            {"invoice_no": {"$regex": search, "$options": "i"}},
            {"rst_no": {"$regex": search, "$options": "i"}},
        ]
    vouchers = await db.sale_vouchers.find(query, {"_id": 0}).sort("voucher_no", 1).to_list(10000)
    branding = await db.settings.find_one({"key": "branding"}, {"_id": 0}) or {}
    company = branding.get("company_name", "NAVKAR AGRO")

    # Ledger-based paid amounts
    party_names = list(set(v.get("party_name", "") for v in vouchers if v.get("party_name")))
    ledger_paid_map = {}
    if party_names:
        ledger_q = {"account": "ledger", "txn_type": "nikasi", "category": {"$in": party_names}, "party_type": "Sale Book"}
        if kms_year: ledger_q["kms_year"] = kms_year
        ledger_txns = await db.cash_transactions.find(ledger_q, {"_id": 0}).to_list(50000)
        for lt in ledger_txns:
            pn = lt.get("category", "")
            ledger_paid_map[pn] = ledger_paid_map.get(pn, 0) + lt.get("amount", 0)
    
    from utils.export_helpers import (style_excel_title, style_excel_header_row,
        style_excel_data_rows, style_excel_total_row, COLORS, BORDER_THIN)
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Sale Book"
    
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.orientation = 'landscape'
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    
    # Header
    cols = ['#', 'Date', 'Inv No.', 'Party', 'Items (Qntl)', 'Truck/RST', 'Total', 'Advance', 'Cash', 'Diesel', 'Ledger Paid', 'Balance', 'Status']
    widths = [5, 9, 9, 16, 30, 12, 10, 9, 8, 8, 10, 10, 7]
    ncols = len(cols)
    
    title = f"{company} - Sale Book / बिक्री बही"
    subtitle = f"FY: {kms_year or 'All'} | {season or 'All'} | {datetime.now().strftime('%d-%m-%Y')}"
    style_excel_title(ws, title, ncols, subtitle)
    
    for i, (col, w) in enumerate(zip(cols, widths), 1):
        ws.cell(row=4, column=i, value=col)
        ws.column_dimensions[ws.cell(row=4, column=i).column_letter].width = w
    style_excel_header_row(ws, 4, ncols)
    
    g = {"total": 0, "adv": 0, "cash": 0, "diesel": 0, "paid": 0, "bal": 0}
    data_start = 5
    for ri, v in enumerate(vouchers, data_start):
        items_str = ', '.join(f"{i['item_name']} ({i['quantity']} Qntl)" for i in v.get('items', []))
        dp = str(v.get('date', '')).split('-')
        fd = f"{dp[2]}/{dp[1]}/{dp[0]}" if len(dp) == 3 else v.get('date', '')
        truck_rst = v.get('truck_no', '')
        if v.get('rst_no'): truck_rst += f"/{v['rst_no']}"
        total = v.get('total', 0) or 0
        pn = v.get('party_name', '')
        ledger_paid = round(ledger_paid_map.get(pn, 0), 2)
        ledger_bal = round(total - ledger_paid, 2)
        status = "Paid" if ledger_bal <= 0 and total > 0 else "Pending"
        g["total"] += total
        g["adv"] += v.get('advance', 0) or 0
        g["cash"] += v.get('cash_paid', 0) or 0
        g["diesel"] += v.get('diesel_paid', 0) or 0
        g["paid"] += ledger_paid
        g["bal"] += ledger_bal
        
        row_data = [v.get('voucher_no',''), fd, v.get('invoice_no',''), pn, items_str, truck_rst,
                    total, v.get('advance', 0) or 0, v.get('cash_paid', 0) or 0, v.get('diesel_paid', 0) or 0,
                    ledger_paid, ledger_bal, status]
        for ci, val in enumerate(row_data, 1):
            cell = ws.cell(row=ri, column=ci, value=val)
            if ci >= 7 and ci <= 12:
                cell.alignment = Alignment(horizontal='right')
                if isinstance(val, (int, float)): cell.number_format = '#,##0'
    
    if vouchers:
        style_excel_data_rows(ws, data_start, data_start + len(vouchers) - 1, ncols, cols)
    
    tr = len(vouchers) + data_start
    ws.cell(row=tr, column=1, value=f"TOTAL ({len(vouchers)} vouchers)")
    for ci, val in enumerate([g['total'], g['adv'], g['cash'], g['diesel'], g['paid'], g['bal'], ''], 7):
        cell = ws.cell(row=tr, column=ci, value=val)
        cell.alignment = Alignment(horizontal='right')
        if isinstance(val, (int, float)): cell.number_format = '#,##0'
    style_excel_total_row(ws, tr, ncols)
    
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return Response(content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=sale_book_{datetime.now().strftime('%Y%m%d')}.xlsx"})


# ============ OPENING BALANCE ============

class OpeningBalanceCreate(BaseModel):
    party_name: str
    party_type: str = ""
    amount: float = 0
    balance_type: str = "jama"
    kms_year: str = ""
    season: str = ""
    note: str = ""


# ============ SINGLE SALE VOUCHER INVOICE PDF ============

def _num_to_words_inr(n):
    """Convert number to Indian currency words."""
    ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
            'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
            'Seventeen', 'Eighteen', 'Nineteen']
    tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
    def _chunk(num):
        if num == 0: return ''
        if num < 20: return ones[num]
        if num < 100: return tens[num // 10] + (' ' + ones[num % 10] if num % 10 else '')
        return ones[num // 100] + ' Hundred' + (' and ' + _chunk(num % 100) if num % 100 else '')
    n = int(round(n))
    if n == 0: return 'Zero Rupees Only'
    parts = []
    if n >= 10000000:
        parts.append(_chunk(n // 10000000) + ' Crore')
        n %= 10000000
    if n >= 100000:
        parts.append(_chunk(n // 100000) + ' Lakh')
        n %= 100000
    if n >= 1000:
        parts.append(_chunk(n // 1000) + ' Thousand')
        n %= 1000
    if n > 0:
        parts.append(_chunk(n))
    return 'Rupees ' + ' '.join(parts) + ' Only'


@router.get("/sale-book/{voucher_id}/pdf")
async def export_single_sale_voucher_pdf(voucher_id: str):
    from fastapi.responses import Response
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer, HRFlowable
    from utils.export_helpers import get_pdf_styles
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
    import io

    v = await db.sale_vouchers.find_one({"id": voucher_id}, {"_id": 0})
    if not v: raise HTTPException(status_code=404, detail="Voucher not found")

    branding = await db.settings.find_one({"key": "branding"}, {"_id": 0}) or {}
    company = branding.get("company_name", "NAVKAR AGRO")
    tagline = branding.get("tagline", "")

    gst_co = await db.settings.find_one({"key": "gst_company"}, {"_id": 0}) or {}
    co_gstin = gst_co.get("gstin", branding.get("gstin", ""))
    co_address = gst_co.get("address", branding.get("address", ""))
    co_phone = gst_co.get("phone", branding.get("phone", ""))
    co_state = gst_co.get("state_name", "")
    co_state_code = gst_co.get("state_code", "")
    co_bank_name = gst_co.get("bank_name", "")
    co_bank_acc = gst_co.get("bank_account", "")
    co_bank_ifsc = gst_co.get("bank_ifsc", "")

    gst_type = v.get('gst_type', 'none')
    has_gst = gst_type != 'none'

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=10*mm, rightMargin=10*mm, topMargin=8*mm, bottomMargin=8*mm)
    elements = []
    styles = get_pdf_styles()

    navy = colors.HexColor('#1B2A4A')
    accent = colors.HexColor('#2C5F8A')
    light_bg = colors.HexColor('#F0F4F8')
    border_c = colors.HexColor('#B0BEC5')
    white = colors.white
    W = 190 * mm

    s_company = ParagraphStyle('co', fontName='FreeSansBold', fontSize=16, textColor=navy, alignment=TA_CENTER, leading=20)
    s_tagline = ParagraphStyle('tg', fontName='FreeSans', fontSize=8, textColor=colors.HexColor('#666'), alignment=TA_CENTER, leading=10)
    s_title = ParagraphStyle('ti', fontName='FreeSansBold', fontSize=12, textColor=white, alignment=TA_CENTER, leading=15)
    s_label = ParagraphStyle('lb', fontName='FreeSans', fontSize=7.5, textColor=colors.HexColor('#666'), leading=10)
    s_val = ParagraphStyle('vl', fontName='FreeSansBold', fontSize=8.5, textColor=colors.HexColor('#1a1a1a'), leading=11)
    s_hd = ParagraphStyle('hd', fontName='FreeSansBold', fontSize=7.5, textColor=white, alignment=TA_CENTER, leading=10)
    s_cell = ParagraphStyle('cl', fontName='FreeSans', fontSize=8, leading=10)
    s_cell_r = ParagraphStyle('cr', fontName='FreeSans', fontSize=8, leading=10, alignment=TA_RIGHT)
    s_cell_c = ParagraphStyle('cc', fontName='FreeSans', fontSize=8, leading=10, alignment=TA_CENTER)
    s_cell_rb = ParagraphStyle('crb', fontName='FreeSansBold', fontSize=8.5, leading=10, alignment=TA_RIGHT, textColor=navy)
    s_tot_label = ParagraphStyle('tl', fontName='FreeSans', fontSize=8.5, alignment=TA_RIGHT, textColor=colors.HexColor('#444'))
    s_tot_val = ParagraphStyle('tv', fontName='FreeSansBold', fontSize=9, alignment=TA_RIGHT, textColor=navy)
    s_grand_label = ParagraphStyle('gl', fontName='FreeSansBold', fontSize=10, alignment=TA_RIGHT, textColor=navy)
    s_grand_val = ParagraphStyle('gv', fontName='FreeSansBold', fontSize=11, alignment=TA_RIGHT, textColor=navy)
    s_words = ParagraphStyle('wd', fontName='FreeSans', fontSize=7.5, textColor=colors.HexColor('#333'), leading=10)
    s_bank = ParagraphStyle('bk', fontName='FreeSans', fontSize=7.5, textColor=colors.HexColor('#444'), leading=10)
    s_sig = ParagraphStyle('sg', fontName='FreeSans', fontSize=8.5, alignment=TA_CENTER, textColor=colors.HexColor('#333'))
    s_sig_b = ParagraphStyle('sgb', fontName='FreeSansBold', fontSize=8.5, alignment=TA_CENTER, textColor=navy)

    # ========== COMPANY HEADER ==========
    elements.append(Paragraph(company, s_company))
    if tagline:
        elements.append(Paragraph(tagline, s_tagline))
    if co_address:
        elements.append(Paragraph(co_address, s_tagline))
    gstin_parts = []
    if co_gstin: gstin_parts.append(f"GSTIN: {co_gstin}")
    if co_phone: gstin_parts.append(f"Ph: {co_phone}")
    if co_state: gstin_parts.append(f"State: {co_state} ({co_state_code})")
    if gstin_parts:
        elements.append(Paragraph(" | ".join(gstin_parts), ParagraphStyle('gp', fontName='FreeSans', fontSize=7.5, alignment=TA_CENTER, textColor=colors.HexColor('#555'), leading=10)))
    elements.append(Spacer(1, 2*mm))

    # ========== INVOICE TITLE BAR ==========
    title_text = "TAX INVOICE" if has_gst else "SALE INVOICE"
    title_tbl = RLTable([[Paragraph(title_text, s_title)]], colWidths=[W])
    title_tbl.setStyle(TableStyle([('BACKGROUND', (0,0), (-1,-1), navy), ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4), ('ALIGN', (0,0), (-1,-1), 'CENTER')]))
    elements.append(title_tbl)
    elements.append(Spacer(1, 3*mm))

    # ========== TWO-COLUMN INFO BOXES ==========
    dp = str(v.get('date', '')).split('-')
    date_str = f"{dp[2]}/{dp[1]}/{dp[0]}" if len(dp) == 3 else v.get('date', '')

    def _info_cell(label, value):
        return Paragraph(f'<font color="#888" size="7">{label}:</font><br/><font size="9"><b>{value}</b></font>', s_val)

    left_info = [
        [_info_cell("Invoice No", v.get('invoice_no', '') or f"SV-{v.get('voucher_no', '')}"),
         _info_cell("Date", date_str)],
        [_info_cell("Truck No", v.get('truck_no', '') or '-'),
         _info_cell("RST No", v.get('rst_no', '') or '-')],
    ]
    if v.get('eway_bill_no'):
        left_info.append([_info_cell("E-Way Bill", v['eway_bill_no']), ''])

    right_info = [[_info_cell("Party / Buyer", v.get('party_name', ''))]]
    if v.get('buyer_gstin'):
        right_info.append([_info_cell("Buyer GSTIN", v['buyer_gstin'])])
    if v.get('buyer_address'):
        right_info.append([_info_cell("Address", v['buyer_address'])])

    left_tbl = RLTable(left_info, colWidths=[45*mm, 45*mm])
    left_tbl.setStyle(TableStyle([('FONTNAME', (0,0), (-1,-1), 'FreeSans'), ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 2), ('BOTTOMPADDING', (0,0), (-1,-1), 2)]))
    right_tbl = RLTable(right_info, colWidths=[90*mm])
    right_tbl.setStyle(TableStyle([('FONTNAME', (0,0), (-1,-1), 'FreeSans'), ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 2), ('BOTTOMPADDING', (0,0), (-1,-1), 2)]))

    wrapper = RLTable([[left_tbl, right_tbl]], colWidths=[95*mm, 95*mm])
    wrapper.setStyle(TableStyle([
        ('BOX', (0,0), (0,0), 0.5, border_c), ('BOX', (1,0), (1,0), 0.5, border_c),
        ('BACKGROUND', (0,0), (-1,-1), light_bg),
        ('TOPPADDING', (0,0), (-1,-1), 3), ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 4), ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    elements.append(wrapper)
    elements.append(Spacer(1, 3*mm))

    # ========== ITEMS TABLE ==========
    if has_gst:
        hdrs = ['S.No', 'Description of Goods', 'HSN', 'Qty', 'Unit', 'Rate (Rs)', 'Taxable Amt', 'GST %', 'GST Amt', 'Total (Rs)']
        h_row = [Paragraph(f'<b>{h}</b>', s_hd) for h in hdrs]
        items_data = [h_row]
        col_w = [8*mm, 38*mm, 17*mm, 14*mm, 11*mm, 18*mm, 22*mm, 12*mm, 18*mm, 22*mm]
    else:
        hdrs = ['S.No', 'Description of Goods', 'Quantity', 'Unit', 'Rate (Rs)', 'Amount (Rs)']
        h_row = [Paragraph(f'<b>{h}</b>', s_hd) for h in hdrs]
        items_data = [h_row]
        col_w = [12*mm, 68*mm, 22*mm, 16*mm, 28*mm, 34*mm]

    for idx, item in enumerate(v.get('items', []), 1):
        qty = item.get('quantity', 0) or 0
        rate = item.get('rate', 0) or 0
        amt = round(qty * rate, 2)
        if has_gst:
            gst_pct = item.get('gst_percent', 0) or 0
            gst_amt = item.get('gst_amount', 0) or round(amt * gst_pct / 100, 2)
            item_total = round(amt + gst_amt, 2)
            items_data.append([
                Paragraph(str(idx), s_cell_c), Paragraph(item.get('item_name', ''), s_cell),
                Paragraph(item.get('hsn_code', ''), s_cell_c),
                Paragraph(f"{qty:g}", s_cell_r), Paragraph(item.get('unit', 'Qntl'), s_cell_c),
                Paragraph(f"{rate:,.2f}", s_cell_r), Paragraph(f"{amt:,.2f}", s_cell_r),
                Paragraph(f"{gst_pct:g}%", s_cell_c), Paragraph(f"{gst_amt:,.2f}", s_cell_r),
                Paragraph(f"{item_total:,.2f}", s_cell_rb)
            ])
        else:
            items_data.append([
                Paragraph(str(idx), s_cell_c), Paragraph(item.get('item_name', ''), s_cell),
                Paragraph(f"{qty:g}", s_cell_r), Paragraph(item.get('unit', 'Qntl'), s_cell_c),
                Paragraph(f"{rate:,.2f}", s_cell_r), Paragraph(f"{amt:,.2f}", s_cell_rb)
            ])

    items_tbl = RLTable(items_data, colWidths=col_w, repeatRows=1)
    tbl_style = [
        ('FONTNAME', (0,0), (-1,-1), 'FreeSans'),
        ('BACKGROUND', (0,0), (-1,0), accent), ('TEXTCOLOR', (0,0), (-1,0), white),
        ('GRID', (0,0), (-1,0), 0.5, accent),
        ('LINEBELOW', (0,0), (-1,-1), 0.3, colors.HexColor('#DEE2E6')),
        ('LINEBEFORE', (0,0), (0,-1), 0.3, colors.HexColor('#DEE2E6')),
        ('LINEAFTER', (-1,0), (-1,-1), 0.3, colors.HexColor('#DEE2E6')),
        ('TOPPADDING', (0,0), (-1,-1), 3), ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]
    for i in range(1, len(items_data)):
        if i % 2 == 0:
            tbl_style.append(('BACKGROUND', (0,i), (-1,i), colors.HexColor('#F8FAFC')))
    items_tbl.setStyle(TableStyle(tbl_style))
    elements.append(items_tbl)
    elements.append(Spacer(1, 2*mm))

    # ========== TOTALS - TWO COLUMNS ==========
    subtotal = v.get('subtotal', 0) or 0
    cgst = v.get('cgst_amount', 0) or 0
    sgst = v.get('sgst_amount', 0) or 0
    igst = v.get('igst_amount', 0) or 0
    total = v.get('total', 0) or 0
    advance = v.get('advance', 0) or 0
    cash = v.get('cash_paid', 0) or 0
    diesel = v.get('diesel_paid', 0) or 0
    balance = v.get('balance', 0) or 0

    tot_rows = []
    tot_rows.append([Paragraph('Taxable Amount', s_tot_label), Paragraph(f'Rs. {subtotal:,.2f}', s_tot_val)])
    if cgst > 0: tot_rows.append([Paragraph('CGST', s_tot_label), Paragraph(f'Rs. {cgst:,.2f}', s_tot_val)])
    if sgst > 0: tot_rows.append([Paragraph('SGST', s_tot_label), Paragraph(f'Rs. {sgst:,.2f}', s_tot_val)])
    if igst > 0: tot_rows.append([Paragraph('IGST', s_tot_label), Paragraph(f'Rs. {igst:,.2f}', s_tot_val)])
    tot_rows.append([Paragraph('<b>Grand Total</b>', s_grand_label), Paragraph(f'<b>Rs. {total:,.2f}</b>', s_grand_val)])
    if advance > 0: tot_rows.append([Paragraph('Less: Advance (Party se)', s_tot_label), Paragraph(f'Rs. {advance:,.2f}', s_tot_val)])
    if cash > 0: tot_rows.append([Paragraph('Less: Cash (Truck ko)', s_tot_label), Paragraph(f'Rs. {cash:,.2f}', s_tot_val)])
    if diesel > 0: tot_rows.append([Paragraph('Less: Diesel (Pump se)', s_tot_label), Paragraph(f'Rs. {diesel:,.2f}', s_tot_val)])
    tot_rows.append([Paragraph('<b>Balance Due</b>', s_grand_label), Paragraph(f'<b>Rs. {balance:,.2f}</b>', s_grand_val)])

    tot_tbl = RLTable(tot_rows, colWidths=[50*mm, 40*mm])
    tot_tbl.setStyle(TableStyle([('FONTNAME', (0,0), (-1,-1), 'FreeSans'),
        ('TOPPADDING', (0,0), (-1,-1), 1.5), ('BOTTOMPADDING', (0,0), (-1,-1), 1.5),
        ('LINEABOVE', (0,len(tot_rows)-1), (-1,len(tot_rows)-1), 1, navy)]))

    words_text = _num_to_words_inr(total)
    left_parts = [[Paragraph('<b>Amount in Words:</b>', s_words)], [Paragraph(f'<i>{words_text}</i>', s_words)]]
    if has_gst and co_bank_name:
        left_parts.append([Spacer(1, 3*mm)])
        left_parts.append([Paragraph('<b>Bank Details:</b>', s_bank)])
        left_parts.append([Paragraph(f'Bank: {co_bank_name}', s_bank)])
        left_parts.append([Paragraph(f'A/c No: {co_bank_acc}', s_bank)])
        left_parts.append([Paragraph(f'IFSC: {co_bank_ifsc}', s_bank)])

    left_tbl2 = RLTable(left_parts, colWidths=[95*mm])
    left_tbl2.setStyle(TableStyle([('FONTNAME', (0,0), (-1,-1), 'FreeSans'), ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 1), ('BOTTOMPADDING', (0,0), (-1,-1), 1)]))

    summary_wrapper = RLTable([[left_tbl2, tot_tbl]], colWidths=[100*mm, 90*mm])
    summary_wrapper.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 0.5, border_c), ('LINEBEFORE', (1,0), (1,0), 0.5, border_c),
        ('TOPPADDING', (0,0), (-1,-1), 4), ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 5), ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('VALIGN', (0,0), (-1,-1), 'TOP'), ('BACKGROUND', (1,0), (1,0), light_bg)]))
    elements.append(summary_wrapper)

    # ========== HSN-WISE TAX SUMMARY ==========
    if has_gst:
        elements.append(Spacer(1, 3*mm))
        hsn_map = {}
        for item in v.get('items', []):
            hsn = item.get('hsn_code', '') or 'N/A'
            pct = item.get('gst_percent', 0) or 0
            key = f"{hsn}__{pct}"
            if key not in hsn_map: hsn_map[key] = {'hsn': hsn, 'pct': pct, 'taxable': 0, 'gst': 0}
            amt = (item.get('quantity', 0) or 0) * (item.get('rate', 0) or 0)
            hsn_map[key]['taxable'] += amt
            hsn_map[key]['gst'] += item.get('gst_amount', 0) or round(amt * pct / 100, 2)

        s_hsn_hd = ParagraphStyle('hh', fontName='FreeSansBold', fontSize=7, textColor=white, alignment=TA_CENTER, leading=9)
        s_hsn_c = ParagraphStyle('hc', fontName='FreeSans', fontSize=7.5, alignment=TA_CENTER, leading=10)
        s_hsn_r = ParagraphStyle('hr', fontName='FreeSans', fontSize=7.5, alignment=TA_RIGHT, leading=10)
        s_hsn_rb = ParagraphStyle('hrb', fontName='FreeSansBold', fontSize=7.5, alignment=TA_RIGHT, leading=10)

        if gst_type == 'cgst_sgst':
            hsn_hdrs = ['HSN Code', 'Taxable Value', 'CGST Rate', 'CGST Amt', 'SGST Rate', 'SGST Amt', 'Total Tax']
            hsn_cw = [24*mm, 28*mm, 18*mm, 24*mm, 18*mm, 24*mm, 28*mm]
        else:
            hsn_hdrs = ['HSN Code', 'Taxable Value', 'IGST Rate', 'IGST Amount', 'Total Tax']
            hsn_cw = [30*mm, 36*mm, 24*mm, 36*mm, 36*mm]

        hsn_data = [[Paragraph(f'<b>{h}</b>', s_hsn_hd) for h in hsn_hdrs]]
        t_taxable, t_cgst2, t_sgst2, t_igst2, t_tax = 0, 0, 0, 0, 0
        for row in hsn_map.values():
            t_taxable += row['taxable']; t_tax += row['gst']
            if gst_type == 'cgst_sgst':
                half = round(row['gst'] / 2, 2); t_cgst2 += half; t_sgst2 += half
                hsn_data.append([Paragraph(row['hsn'], s_hsn_c), Paragraph(f"{row['taxable']:,.2f}", s_hsn_r),
                    Paragraph(f"{row['pct']/2:g}%", s_hsn_c), Paragraph(f"{half:,.2f}", s_hsn_r),
                    Paragraph(f"{row['pct']/2:g}%", s_hsn_c), Paragraph(f"{half:,.2f}", s_hsn_r),
                    Paragraph(f"{row['gst']:,.2f}", s_hsn_rb)])
            else:
                t_igst2 += row['gst']
                hsn_data.append([Paragraph(row['hsn'], s_hsn_c), Paragraph(f"{row['taxable']:,.2f}", s_hsn_r),
                    Paragraph(f"{row['pct']:g}%", s_hsn_c), Paragraph(f"{row['gst']:,.2f}", s_hsn_r),
                    Paragraph(f"{row['gst']:,.2f}", s_hsn_rb)])
        if gst_type == 'cgst_sgst':
            hsn_data.append([Paragraph('<b>Total</b>', s_hsn_rb), Paragraph(f"<b>{t_taxable:,.2f}</b>", s_hsn_rb),
                Paragraph('', s_hsn_c), Paragraph(f"<b>{t_cgst2:,.2f}</b>", s_hsn_rb),
                Paragraph('', s_hsn_c), Paragraph(f"<b>{t_sgst2:,.2f}</b>", s_hsn_rb),
                Paragraph(f"<b>{t_tax:,.2f}</b>", s_hsn_rb)])
        else:
            hsn_data.append([Paragraph('<b>Total</b>', s_hsn_rb), Paragraph(f"<b>{t_taxable:,.2f}</b>", s_hsn_rb),
                Paragraph('', s_hsn_c), Paragraph(f"<b>{t_igst2:,.2f}</b>", s_hsn_rb),
                Paragraph(f"<b>{t_tax:,.2f}</b>", s_hsn_rb)])

        hsn_tbl = RLTable(hsn_data, colWidths=hsn_cw)
        hsn_tbl.setStyle(TableStyle([('FONTNAME', (0,0), (-1,-1), 'FreeSans'),
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#546E7A')), ('TEXTCOLOR', (0,0), (-1,0), white),
            ('GRID', (0,0), (-1,-1), 0.3, colors.HexColor('#CFD8DC')),
            ('TOPPADDING', (0,0), (-1,-1), 2), ('BOTTOMPADDING', (0,0), (-1,-1), 2),
            ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor('#ECEFF1'))]))
        elements.append(Paragraph('<b>HSN-wise Tax Summary</b>', ParagraphStyle('hsn_t', fontName='FreeSansBold', fontSize=8, textColor=navy, spaceAfter=2)))
        elements.append(hsn_tbl)

    if v.get('remark'):
        elements.append(Spacer(1, 3*mm))
        elements.append(Paragraph(f'<b>Remark:</b> {v["remark"]}', s_label))

    # ========== SIGNATURE ==========
    elements.append(Spacer(1, 12*mm))
    sig_data = [
        [Paragraph("Receiver's Signature", s_sig), '', Paragraph(f'For <b>{company}</b>', s_sig_b)],
        ['', '', ''],
        [Paragraph('_____________________', s_sig), '', Paragraph('_____________________', s_sig)],
        ['', '', Paragraph('Authorized Signatory', s_sig)],
    ]
    sig_tbl = RLTable(sig_data, colWidths=[60*mm, 60*mm, 60*mm])
    sig_tbl.setStyle(TableStyle([('FONTNAME', (0,0), (-1,-1), 'FreeSans'), ('VALIGN', (0,0), (-1,-1), 'BOTTOM'),
        ('TOPPADDING', (0,0), (-1,-1), 1), ('BOTTOMPADDING', (0,0), (-1,-1), 1)]))
    elements.append(sig_tbl)

    elements.append(Spacer(1, 4*mm))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=border_c))
    s_foot = ParagraphStyle('ft', fontName='FreeSans', fontSize=6.5, textColor=colors.HexColor('#999'), alignment=TA_CENTER, leading=9)
    elements.append(Paragraph('This is a computer generated invoice.', s_foot))

    doc.build(elements)
    return Response(content=buf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=sale_invoice_{v.get('voucher_no','')}.pdf"})


@router.get("/opening-balances")
async def get_opening_balances(kms_year: Optional[str] = None):
    query = {"is_opening_balance": True}
    if kms_year: query["kms_year"] = kms_year
    return await db.cash_transactions.find(query, {"_id": 0}).sort("category", 1).to_list(10000)

@router.post("/opening-balances")
async def create_opening_balance(data: OpeningBalanceCreate, username: str = "", role: str = ""):
    entry = {
        "id": str(uuid.uuid4()),
        "date": "",
        "account": "ledger",
        "txn_type": data.balance_type,
        "amount": abs(data.amount),
        "category": data.party_name.strip(),
        "party_type": data.party_type or "Cash Party",
        "description": f"Opening Balance - {data.note}" if data.note else "Opening Balance",
        "reference": "opening_balance",
        "is_opening_balance": True,
        "kms_year": data.kms_year,
        "season": data.season,
        "created_by": username,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.cash_transactions.insert_one(entry)
    entry.pop('_id', None)
    return entry

@router.delete("/opening-balances/{entry_id}")
async def delete_opening_balance(entry_id: str, username: str = "", role: str = ""):
    existing = await db.cash_transactions.find_one({"id": entry_id, "is_opening_balance": True}, {"_id": 0})
    if not existing: raise HTTPException(status_code=404, detail="Opening balance not found")
    await db.cash_transactions.delete_one({"id": entry_id})
    return {"message": "Opening balance deleted", "id": entry_id}


# ============ WHATSAPP SALE VOUCHER SEND ============

@router.post("/sale-book/{voucher_id}/whatsapp-send")
async def whatsapp_send_sale_voucher(voucher_id: str, request: Request):
    """Generate PDF, upload to tmpfiles.org, and send via WhatsApp."""
    import httpx, io
    body = await request.json()
    phone = body.get("phone", "").strip()

    v = await db.sale_vouchers.find_one({"id": voucher_id}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Voucher not found")

    branding = await db.settings.find_one({"key": "branding"}, {"_id": 0}) or {}
    company = branding.get("company_name", "Mill Entry System")

    # Build WhatsApp text message
    gst_type = v.get('gst_type', 'none')
    has_gst = gst_type != 'none'
    date_str = v.get('date', '')
    dp = date_str.split('-')
    if len(dp) == 3:
        date_str = f"{dp[2]}/{dp[1]}/{dp[0]}"

    text = (
        f"*{company}*\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"*{'TAX INVOICE' if has_gst else 'SALE INVOICE'}*\n"
        f"Voucher: #{v.get('voucher_no', '')}\n"
        f"Date: {date_str}\n"
    )
    if v.get('invoice_no'):
        text += f"Invoice No: {v['invoice_no']}\n"
    text += f"━━━━━━━━━━━━━━━━\n"
    text += f"Party: *{v.get('party_name', '')}*\n"
    if v.get('buyer_gstin'):
        text += f"GSTIN: {v['buyer_gstin']}\n"
    text += f"━━━━━━━━━━━━━━━━\n"

    for item in v.get('items', []):
        qty = item.get('quantity', 0)
        rate = item.get('rate', 0)
        amt = round(qty * rate, 2)
        text += f"{item.get('item_name', '')} | {qty}Q x Rs.{rate:,.0f} = Rs.{amt:,.0f}"
        if has_gst and item.get('gst_percent'):
            text += f" (+{item.get('gst_percent')}% GST)"
        text += "\n"

    text += f"━━━━━━━━━━━━━━━━\n"
    text += f"Taxable: Rs.{v.get('subtotal', 0):,.2f}\n"
    cgst = v.get('cgst_amount', 0)
    sgst = v.get('sgst_amount', 0)
    igst = v.get('igst_amount', 0)
    if cgst > 0:
        text += f"CGST: Rs.{cgst:,.2f}\n"
    if sgst > 0:
        text += f"SGST: Rs.{sgst:,.2f}\n"
    if igst > 0:
        text += f"IGST: Rs.{igst:,.2f}\n"
    text += f"*Grand Total: Rs.{v.get('total', 0):,.2f}*\n"
    if v.get('advance', 0) > 0:
        text += f"Advance: Rs.{v.get('advance', 0):,.2f}\n"
    text += f"*Balance: Rs.{v.get('balance', 0):,.2f}*\n"
    text += f"\nThank you\n{company}"

    # Generate PDF
    from fastapi.responses import Response
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from utils.export_helpers import get_pdf_styles
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=12*mm, rightMargin=12*mm, topMargin=10*mm, bottomMargin=10*mm)
    elements = []
    styles = get_pdf_styles()
    blue = '#1a5276'

    from utils.branding_helper import get_pdf_company_header_from_db as _gph
    elements.extend(await _gph())

    gst_co = await db.settings.find_one({"key": "gst_company"}, {"_id": 0}) or {}
    co_gstin = gst_co.get("gstin", "")
    co_state = gst_co.get("state_name", "")
    co_state_code = gst_co.get("state_code", "")

    if co_gstin:
        gstin_s = ParagraphStyle('GS', parent=styles['Normal'], fontSize=8, alignment=TA_CENTER, textColor=colors.HexColor('#333'))
        elements.append(Paragraph(f"GSTIN: {co_gstin} | State: {co_state} ({co_state_code})", gstin_s))
    elements.append(Spacer(1, 3*mm))

    inv_title = ParagraphStyle('IT', parent=styles['Heading2'], fontSize=13, textColor=colors.HexColor(blue), alignment=TA_CENTER, spaceBefore=0, spaceAfter=2)
    elements.append(Paragraph("TAX INVOICE" if has_gst else "SALE INVOICE", inv_title))

    label_s = ParagraphStyle('L', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#555'))
    val_s = ParagraphStyle('V', parent=styles['Normal'], fontSize=9, fontName='FreeSansBold')
    cell_s = ParagraphStyle('C', parent=styles['Normal'], fontSize=8, leading=11)
    cell_r = ParagraphStyle('CR', parent=styles['Normal'], fontSize=8, leading=11, alignment=TA_RIGHT)
    cell_rb = ParagraphStyle('CRB', parent=styles['Normal'], fontSize=9, leading=11, alignment=TA_RIGHT, fontName='FreeSansBold')
    hd_s = ParagraphStyle('H', parent=styles['Normal'], fontSize=8, leading=11, fontName='FreeSansBold', textColor=colors.white)

    info_data = [
        [Paragraph('<b>Voucher:</b>', label_s), Paragraph(f"#{v.get('voucher_no', '')}", val_s),
         Paragraph('<b>Date:</b>', label_s), Paragraph(date_str, val_s)],
        [Paragraph('<b>Party:</b>', label_s), Paragraph(v.get('party_name', ''), val_s),
         Paragraph('<b>Invoice:</b>', label_s), Paragraph(v.get('invoice_no', ''), val_s)],
    ]
    if v.get('buyer_gstin') or v.get('buyer_address'):
        info_data.append([Paragraph('<b>Buyer GSTIN:</b>', label_s), Paragraph(v.get('buyer_gstin', ''), val_s),
                         Paragraph('<b>Address:</b>', label_s), Paragraph(v.get('buyer_address', ''), val_s)])

    info_tbl = RLTable(info_data, colWidths=[28*mm, 55*mm, 28*mm, 55*mm])
    info_tbl.setStyle(TableStyle([('FONTNAME', (0,0), (-1,-1), 'FreeSans'), ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 2), ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('LINEBELOW', (0,-1), (-1,-1), 1, colors.HexColor('#ddd'))]))
    elements.append(info_tbl)
    elements.append(Spacer(1, 4*mm))

    if has_gst:
        headers = [Paragraph('<b>S.No</b>', hd_s), Paragraph('<b>Item</b>', hd_s), Paragraph('<b>HSN</b>', hd_s),
                   Paragraph('<b>Qty</b>', hd_s), Paragraph('<b>Rate</b>', hd_s), Paragraph('<b>Taxable</b>', hd_s),
                   Paragraph('<b>GST%</b>', hd_s), Paragraph('<b>GST</b>', hd_s), Paragraph('<b>Total</b>', hd_s)]
        col_w = [10*mm, 35*mm, 20*mm, 18*mm, 18*mm, 22*mm, 14*mm, 20*mm, 25*mm]
    else:
        headers = [Paragraph('<b>S.No</b>', hd_s), Paragraph('<b>Item</b>', hd_s),
                   Paragraph('<b>Qty</b>', hd_s), Paragraph('<b>Rate</b>', hd_s), Paragraph('<b>Amount</b>', hd_s)]
        col_w = [15*mm, 60*mm, 30*mm, 30*mm, 35*mm]

    items_data = [headers]
    for idx, item in enumerate(v.get('items', []), 1):
        qty = item.get('quantity', 0) or 0
        rate = item.get('rate', 0) or 0
        amt = round(qty * rate, 2)
        if has_gst:
            gst_pct = item.get('gst_percent', 0)
            gst_amt = item.get('gst_amount', 0) or round(amt * gst_pct / 100, 2)
            items_data.append([Paragraph(str(idx), cell_s), Paragraph(item.get('item_name', ''), cell_s),
                Paragraph(item.get('hsn_code', ''), cell_s), Paragraph(f"{qty}", cell_r), Paragraph(f"{rate:,.2f}", cell_r),
                Paragraph(f"{amt:,.2f}", cell_r), Paragraph(f"{gst_pct}%", cell_r),
                Paragraph(f"{gst_amt:,.2f}", cell_r), Paragraph(f"{round(amt+gst_amt,2):,.2f}", cell_rb)])
        else:
            items_data.append([Paragraph(str(idx), cell_s), Paragraph(item.get('item_name', ''), cell_s),
                Paragraph(f"{qty} Q", cell_r), Paragraph(f"{rate:,.2f}", cell_r), Paragraph(f"{amt:,.2f}", cell_rb)])

    items_tbl = RLTable(items_data, colWidths=col_w, repeatRows=1)
    items_tbl.setStyle(TableStyle([('FONTNAME', (0,0), (-1,-1), 'FreeSans'),
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor(blue)), ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('TOPPADDING', (0,0), (-1,-1), 3), ('BOTTOMPADDING', (0,0), (-1,-1), 3), ('VALIGN', (0,0), (-1,-1), 'MIDDLE')]))
    elements.append(items_tbl)
    elements.append(Spacer(1, 3*mm))

    tot_s = ParagraphStyle('TS', parent=styles['Normal'], fontSize=9, alignment=TA_RIGHT)
    tot_b = ParagraphStyle('TB', parent=styles['Normal'], fontSize=11, alignment=TA_RIGHT, fontName='FreeSansBold', textColor=colors.HexColor(blue))

    total_data = [[Paragraph('Taxable:', tot_s), Paragraph(f"Rs. {v.get('subtotal', 0):,.2f}", tot_s)]]
    if cgst > 0: total_data.append([Paragraph('CGST:', tot_s), Paragraph(f"Rs. {cgst:,.2f}", tot_s)])
    if sgst > 0: total_data.append([Paragraph('SGST:', tot_s), Paragraph(f"Rs. {sgst:,.2f}", tot_s)])
    if igst > 0: total_data.append([Paragraph('IGST:', tot_s), Paragraph(f"Rs. {igst:,.2f}", tot_s)])
    total_data.append([Paragraph('<b>Grand Total:</b>', tot_b), Paragraph(f"<b>Rs. {v.get('total', 0):,.2f}</b>", tot_b)])
    total_data.append([Paragraph('<b>Balance:</b>', tot_b), Paragraph(f"<b>Rs. {v.get('balance', 0):,.2f}</b>", tot_b)])

    tot_tbl = RLTable(total_data, colWidths=[120*mm, 50*mm])
    tot_tbl.setStyle(TableStyle([('FONTNAME', (0,0), (-1,-1), 'FreeSans'),
        ('TOPPADDING', (0,0), (-1,-1), 2), ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('LINEABOVE', (0,-1), (-1,-1), 1, colors.HexColor(blue))]))
    elements.append(tot_tbl)

    elements.append(Spacer(1, 15*mm))
    sig_data = [[Paragraph('Received By', ParagraphStyle('Sig', alignment=TA_CENTER, fontSize=9)),
                 Paragraph(f'For {company}', ParagraphStyle('Sig', alignment=TA_CENTER, fontSize=9, fontName='FreeSansBold'))]]
    sig_tbl = RLTable(sig_data, colWidths=[85*mm, 85*mm])
    sig_tbl.setStyle(TableStyle([('FONTNAME', (0,0), (-1,-1), 'FreeSans'), ('LINEABOVE', (0,0), (0,0), 0.5, colors.black), ('LINEABOVE', (1,0), (1,0), 0.5, colors.black)]))
    elements.append(sig_tbl)

    doc.build(elements)
    pdf_bytes = buf.getvalue()

    # Upload PDF to tmpfiles.org
    pdf_url = ""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            files = {"file": (f"sale_invoice_{v.get('voucher_no','')}.pdf", pdf_bytes, "application/pdf")}
            resp = await client.post("https://tmpfiles.org/api/v1/upload", files=files)
            if resp.status_code == 200:
                data = resp.json()
                url = data.get("data", {}).get("url", "")
                if url:
                    pdf_url = url.replace("tmpfiles.org/", "tmpfiles.org/dl/")
    except Exception as e:
        import logging
        logging.getLogger("salebook").error(f"tmpfiles upload error: {e}")

    # Send via WhatsApp
    from routes.whatsapp import _send_wa_message, _get_wa_settings
    wa_settings = await _get_wa_settings()
    if not wa_settings.get("api_key"):
        return {"success": False, "error": "WhatsApp API key set nahi hai. Settings mein jaake set karein."}

    default_numbers = wa_settings.get("default_numbers", [])
    if isinstance(default_numbers, str):
        default_numbers = [n.strip() for n in default_numbers.split(",") if n.strip()]

    targets = [phone] if phone else default_numbers
    results = []
    for num in targets:
        if num and num.strip():
            r = await _send_wa_message(num.strip(), text, pdf_url)
            results.append({"target": num, "success": r.get("success", False)})

    if not results:
        return {"success": False, "error": "Koi phone number nahi hai. Settings > WhatsApp mein set karein."}

    sc = sum(1 for r in results if r["success"])
    return {"success": sc > 0, "message": f"Sale Invoice {sc}/{len(results)} pe bhej diya!", "details": results, "pdf_url": pdf_url}
