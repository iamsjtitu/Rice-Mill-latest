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

class SaleVoucherCreate(BaseModel):
    date: str
    party_name: str
    invoice_no: str = ""
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
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    
    milling = await db.milling_entries.find(query, {"_id": 0}).to_list(10000)
    dc = await db.dc_entries.find(query, {"_id": 0}).to_list(10000)
    pvt_sales = await db.rice_sales.find(query, {"_id": 0}).to_list(10000)
    sale_vouchers = await db.sale_vouchers.find(query, {"_id": 0}).to_list(10000)
    purchase_vouchers = await db.purchase_vouchers.find(query, {"_id": 0}).to_list(10000)
    
    parboiled_produced = round(sum(e.get('rice_qntl', 0) for e in milling if e.get('rice_type', '').lower() in ('usna', 'parboiled')), 2)
    raw_produced = round(sum(e.get('rice_qntl', 0) for e in milling if e.get('rice_type', '').lower() == 'raw'), 2)
    govt_delivered = round(sum(e.get('quantity_qntl', 0) for e in dc), 2)
    pvt_sold_usna = round(sum(s.get('quantity_qntl', 0) for s in pvt_sales if s.get('rice_type', '').lower() in ('usna', 'parboiled')), 2)
    pvt_sold_raw = round(sum(s.get('quantity_qntl', 0) for s in pvt_sales if s.get('rice_type', '').lower() == 'raw'), 2)
    
    sb_sold = {}
    for sv in sale_vouchers:
        for item in sv.get('items', []):
            name = item.get('item_name', '')
            sb_sold[name] = sb_sold.get(name, 0) + (item.get('quantity', 0) or 0)
    
    # Purchase Voucher bought quantities
    pv_bought = {}
    for pv in purchase_vouchers:
        for item in pv.get('items', []):
            name = item.get('item_name', '')
            pv_bought[name] = pv_bought.get(name, 0) + (item.get('quantity', 0) or 0)
    
    bp_sales = await db.byproduct_sales.find(query, {"_id": 0}).to_list(10000)
    products = ["bran", "kunda", "broken", "kanki", "husk"]
    
    items = []
    usna_avail = round(parboiled_produced + pv_bought.get("Rice (Usna)", 0) - govt_delivered - pvt_sold_usna - sb_sold.get("Rice (Usna)", 0), 2)
    raw_avail = round(raw_produced + pv_bought.get("Rice (Raw)", 0) - pvt_sold_raw - sb_sold.get("Rice (Raw)", 0), 2)
    items.append({"name": "Rice (Usna)", "available_qntl": usna_avail, "unit": "Qntl"})
    items.append({"name": "Rice (Raw)", "available_qntl": raw_avail, "unit": "Qntl"})
    
    for p in products:
        produced = round(sum(e.get(f'{p}_qntl', 0) for e in milling), 2)
        purchased = pv_bought.get(p.title(), 0)
        sold_bp = round(sum(s.get('quantity_qntl', 0) for s in bp_sales if s.get('product') == p), 2)
        sold_sb = sb_sold.get(p.title(), 0)
        avail = round(produced + purchased - sold_bp - sold_sb, 2)
        items.append({"name": p.title(), "available_qntl": avail, "unit": "Qntl"})
    
    frk_purchases = await db.frk_purchases.find(query, {"_id": 0}).to_list(10000) if await db.frk_purchases.count_documents(query) > 0 else []
    frk_produced = round(sum(e.get('quantity_qntl', 0) or e.get('quantity', 0) for e in frk_purchases), 2)
    frk_pv = pv_bought.get("FRK", 0)
    frk_sold_sb = sb_sold.get("FRK", 0)
    items.append({"name": "FRK", "available_qntl": round(frk_produced + frk_pv - frk_sold_sb, 2), "unit": "Qntl"})
    
    # Custom items from Purchase Vouchers not already covered
    known_items = {"Rice (Usna)", "Rice (Raw)", "FRK"} | {p.title() for p in products}
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


@router.post("/sale-book")
async def create_sale_voucher(input: SaleVoucherCreate, username: str = "", role: str = ""):
    d = input.model_dump()
    
    items = []
    subtotal = 0
    for item in d.get('items', []):
        amount = round(item.get('quantity', 0) * item.get('rate', 0), 2)
        items.append({**item, "amount": amount})
        subtotal += amount
    
    d['items'] = items
    d['subtotal'] = round(subtotal, 2)
    
    cgst_amt = round(subtotal * d.get('cgst_percent', 0) / 100, 2) if d.get('gst_type') == 'cgst_sgst' else 0
    sgst_amt = round(subtotal * d.get('sgst_percent', 0) / 100, 2) if d.get('gst_type') == 'cgst_sgst' else 0
    igst_amt = round(subtotal * d.get('igst_percent', 0) / 100, 2) if d.get('gst_type') == 'igst' else 0
    
    d['cgst_amount'] = cgst_amt
    d['sgst_amount'] = sgst_amt
    d['igst_amount'] = igst_amt
    total = round(subtotal + cgst_amt + sgst_amt + igst_amt, 2)
    d['total'] = total
    
    advance = d.get('advance', 0) or 0
    d['paid_amount'] = round(advance, 2)
    d['balance'] = round(total - advance, 2)
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
    items = []
    subtotal = 0
    for item in d.get('items', []):
        amount = round(item.get('quantity', 0) * item.get('rate', 0), 2)
        items.append({**item, "amount": amount})
        subtotal += amount
    
    d['items'] = items
    d['subtotal'] = round(subtotal, 2)
    cgst_amt = round(subtotal * d.get('cgst_percent', 0) / 100, 2) if d.get('gst_type') == 'cgst_sgst' else 0
    sgst_amt = round(subtotal * d.get('sgst_percent', 0) / 100, 2) if d.get('gst_type') == 'cgst_sgst' else 0
    igst_amt = round(subtotal * d.get('igst_percent', 0) / 100, 2) if d.get('gst_type') == 'igst' else 0
    d['cgst_amount'] = cgst_amt
    d['sgst_amount'] = sgst_amt
    d['igst_amount'] = igst_amt
    total = round(subtotal + cgst_amt + sgst_amt + igst_amt, 2)
    d['total'] = total
    advance = d.get('advance', 0) or 0
    d['paid_amount'] = round(advance, 2)
    d['balance'] = round(total - advance, 2)
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
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
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
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle('SaleTitle', parent=styles['Heading1'], fontSize=14, textColor=colors.HexColor('#1a5276'), alignment=TA_CENTER, spaceAfter=1)
    elements.append(Paragraph(company, title_style))
    if tagline:
        sub_style = ParagraphStyle('SubTitle', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#666666'), alignment=TA_CENTER, spaceAfter=1)
        elements.append(Paragraph(tagline, sub_style))

    meta_parts = ["Sale Book"]
    if kms_year: meta_parts.append(f"FY: {kms_year}")
    if season: meta_parts.append(season)
    meta_parts.append(f"Date: {datetime.now().strftime('%d-%m-%Y')}")
    meta_style = ParagraphStyle('Meta', parent=styles['Normal'], fontSize=7, textColor=colors.HexColor('#555555'), alignment=TA_CENTER, spaceAfter=4)
    elements.append(Paragraph(" | ".join(meta_parts), meta_style))

    cell_s = ParagraphStyle('Cell', parent=styles['Normal'], fontSize=6, leading=8)
    cell_r = ParagraphStyle('CellR', parent=styles['Normal'], fontSize=6, leading=8, alignment=TA_RIGHT)
    cell_b = ParagraphStyle('CellB', parent=styles['Normal'], fontSize=6, leading=8, fontName='Helvetica-Bold')
    cell_rb = ParagraphStyle('CellRB', parent=styles['Normal'], fontSize=6, leading=8, alignment=TA_RIGHT, fontName='Helvetica-Bold')

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
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
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
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Sale Book"
    
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.orientation = 'landscape'
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    
    # Colors
    blue = '1A5276'
    light_blue = 'D6EAF8'
    green = '27AE60'
    red = 'E74C3C'
    
    # Styles
    title_font = Font(name='Calibri', size=14, bold=True, color=blue)
    sub_font = Font(name='Calibri', size=9, color='666666')
    hd_font = Font(name='Calibri', size=8, bold=True, color='FFFFFF')
    hd_fill = PatternFill(start_color=blue, end_color=blue, fill_type='solid')
    data_font = Font(name='Calibri', size=8)
    bold_font = Font(name='Calibri', size=8, bold=True)
    amt_font = Font(name='Calibri', size=8, bold=True, color=blue)
    paid_font = Font(name='Calibri', size=8, bold=True, color=green)
    bal_font = Font(name='Calibri', size=8, bold=True, color=red)
    total_font = Font(name='Calibri', size=9, bold=True, color='FFFFFF')
    total_fill = PatternFill(start_color=blue, end_color=blue, fill_type='solid')
    alt_fill = PatternFill(start_color='F8FAFC', end_color='F8FAFC', fill_type='solid')
    thin = Border(bottom=Side(style='thin', color='E0E0E0'))
    
    # Header
    cols = ['#', 'Date', 'Inv No.', 'Party', 'Items (Qntl)', 'Truck/RST', 'Total', 'Advance', 'Cash', 'Diesel', 'Ledger Paid', 'Balance', 'Status']
    widths = [5, 9, 9, 16, 30, 12, 10, 9, 8, 8, 10, 10, 7]
    last_col_letter = chr(64 + len(cols))
    
    ws.merge_cells(f'A1:{last_col_letter}1')
    ws['A1'] = company
    ws['A1'].font = title_font
    ws['A1'].alignment = Alignment(horizontal='center')
    
    ws.merge_cells(f'A2:{last_col_letter}2')
    ws['A2'] = f"Sale Book | {f'FY: {kms_year}' if kms_year else ''} {f'| {season}' if season else ''} | {datetime.now().strftime('%d-%m-%Y')}"
    ws['A2'].font = sub_font
    ws['A2'].alignment = Alignment(horizontal='center')
    
    for i, (col, w) in enumerate(zip(cols, widths), 1):
        cell = ws.cell(row=4, column=i, value=col)
        cell.font = hd_font
        cell.fill = hd_fill
        cell.alignment = Alignment(horizontal='right' if i >= 7 else 'left', vertical='center', wrap_text=True)
        ws.column_dimensions[cell.column_letter].width = w
    
    g = {"total": 0, "adv": 0, "cash": 0, "diesel": 0, "paid": 0, "bal": 0}
    for ri, v in enumerate(vouchers, 5):
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
            cell.border = thin
            cell.font = bold_font if ci == 4 else (amt_font if ci == 7 else (paid_font if ci == 11 else (bal_font if ci == 12 else data_font)))
            if ci >= 7 and ci <= 12:
                cell.alignment = Alignment(horizontal='right')
                if isinstance(val, (int, float)): cell.number_format = '#,##0'
            if ri % 2 == 0: cell.fill = alt_fill
    
    tr = len(vouchers) + 5
    ws.merge_cells(f'A{tr}:F{tr}')
    for ci in range(1, len(cols) + 1):
        cell = ws.cell(row=tr, column=ci)
        cell.fill = total_fill
        cell.font = total_font
    ws.cell(row=tr, column=1, value=f"TOTAL ({len(vouchers)} vouchers)")
    for ci, val in enumerate([g['total'], g['adv'], g['cash'], g['diesel'], g['paid'], g['bal'], ''], 7):
        cell = ws.cell(row=tr, column=ci, value=val)
        cell.font = total_font
        cell.fill = total_fill
        cell.alignment = Alignment(horizontal='right')
        if isinstance(val, (int, float)): cell.number_format = '#,##0'
    
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
