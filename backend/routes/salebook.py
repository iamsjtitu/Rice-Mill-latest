from fastapi import APIRouter, HTTPException
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
    
    bp_sales = await db.byproduct_sales.find(query, {"_id": 0}).to_list(10000)
    products = ["bran", "kunda", "broken", "kanki", "husk"]
    
    items = []
    usna_avail = round(parboiled_produced - govt_delivered - pvt_sold_usna - sb_sold.get("Rice (Usna)", 0), 2)
    raw_avail = round(raw_produced - pvt_sold_raw - sb_sold.get("Rice (Raw)", 0), 2)
    items.append({"name": "Rice (Usna)", "available_qntl": usna_avail, "unit": "Qntl"})
    items.append({"name": "Rice (Raw)", "available_qntl": raw_avail, "unit": "Qntl"})
    
    for p in products:
        produced = round(sum(e.get(f'{p}_qntl', 0) for e in milling), 2)
        sold_bp = round(sum(s.get('quantity_qntl', 0) for s in bp_sales if s.get('product') == p), 2)
        sold_sb = sb_sold.get(p.title(), 0)
        avail = round(produced - sold_bp - sold_sb, 2)
        items.append({"name": p.title(), "available_qntl": avail, "unit": "Qntl"})
    
    frk_purchases = await db.frk_purchases.find(query, {"_id": 0}).to_list(10000) if await db.frk_purchases.count_documents(query) > 0 else []
    frk_produced = round(sum(e.get('quantity_qntl', 0) or e.get('quantity', 0) for e in frk_purchases), 2)
    frk_sold_sb = sb_sold.get("FRK", 0)
    items.append({"name": "FRK", "available_qntl": round(frk_produced - frk_sold_sb, 2), "unit": "Qntl"})
    
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
    return await db.sale_vouchers.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)


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
            "description": f"Diesel for truck - Sale #{vno}{desc_suffix}",
            "reference": f"sale_voucher_diesel:{doc_id}", **base
        })
        # Also create entry in diesel_accounts collection
        diesel_entry = {
            "id": str(uuid.uuid4()), "date": d.get('date', ''),
            "pump_id": pump_id, "pump_name": pump_name,
            "truck_no": truck, "agent_name": "",
            "amount": diesel, "txn_type": "diesel",
            "description": f"Diesel for Sale #{vno} - {truck}{desc_suffix}",
            "reference": f"sale_voucher_diesel:{doc_id}",
            **base
        }
        await db.diesel_accounts.insert_one(diesel_entry)

    # 5. Truck payment (cash + diesel) → Truck Ledger + truck_payments entry
    truck_total = cash + diesel
    if truck_total > 0 and truck:
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "ledger", "txn_type": "jama",
            "amount": truck_total, "category": truck, "party_type": "Truck",
            "description": f"Truck payment - Sale #{vno} (Cash:{cash} + Diesel:{diesel}){desc_suffix}",
            "reference": f"sale_voucher_truck:{doc_id}", **base
        })
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "ledger", "txn_type": "nikasi",
            "amount": truck_total, "category": truck, "party_type": "Truck",
            "description": f"Truck paid (Cash:{cash} + Diesel:{diesel}) - Sale #{vno}{desc_suffix}",
            "reference": f"sale_voucher_truck:{doc_id}", **base
        })
        # Also create entry in truck_payments collection
        truck_entry = {
            "entry_id": str(uuid.uuid4()),
            "truck_no": truck, "date": d.get('date', ''),
            "cash_taken": cash, "diesel_taken": diesel,
            "gross_amount": truck_total, "deductions": 0,
            "net_amount": truck_total, "paid_amount": truck_total,
            "balance_amount": 0, "status": "paid",
            "source": "Sale Book",
            "description": f"Sale #{vno} - {party}{desc_suffix}",
            "reference": f"sale_voucher_truck:{doc_id}",
            **base
        }
        await db.truck_payments.insert_one(truck_entry)

    for entry in entries:
        await db.cash_transactions.insert_one(entry)


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
    return {"message": "Sale voucher deleted", "id": voucher_id}


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
    vno = existing.get('voucher_no', 0)
    await _create_sale_ledger_entries(d, voucher_id, vno, items, username)
    
    updated = await db.sale_vouchers.find_one({"id": voucher_id}, {"_id": 0})
    return updated


# ============ SALE BOOK PDF EXPORT (A4 Fit, Professional) ============

@router.get("/sale-book/export/pdf")
async def export_sale_book_pdf(kms_year: Optional[str] = None, season: Optional[str] = None, search: Optional[str] = None):
    from fastapi.responses import Response
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
    tagline = branding.get("tagline", "")
    
    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page {{ size: A4; margin: 12mm 10mm; }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 9px; color: #222; }}
    .header {{ text-align: center; border-bottom: 2px solid #1a5276; padding-bottom: 8px; margin-bottom: 10px; }}
    .header h1 {{ font-size: 18px; color: #1a5276; letter-spacing: 1px; }}
    .header .sub {{ font-size: 10px; color: #666; margin-top: 2px; }}
    .meta {{ display: flex; justify-content: space-between; font-size: 9px; color: #555; margin-bottom: 8px; padding: 4px 0; border-bottom: 1px solid #ddd; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 8.5px; }}
    th {{ background: #1a5276; color: white; padding: 5px 4px; text-align: left; font-weight: 600; font-size: 8px; }}
    td {{ padding: 4px; border-bottom: 1px solid #e0e0e0; }}
    tr:nth-child(even) {{ background: #f8f9fa; }}
    .r {{ text-align: right; }} .c {{ text-align: center; }} .b {{ font-weight: 700; }}
    .total-row {{ background: #1a5276 !important; color: white; font-weight: 700; }}
    .total-row td {{ padding: 6px 4px; border: none; }}
    .footer {{ margin-top: 12px; text-align: center; font-size: 8px; color: #999; border-top: 1px solid #ddd; padding-top: 6px; }}
    .amt {{ font-family: 'Consolas', monospace; }}
    </style></head><body>
    <div class="header"><h1>{company}</h1>"""
    if tagline:
        html += f'<div class="sub">{tagline}</div>'
    html += f"""</div>
    <div class="meta"><span>Sale Book Report</span><span>{f'FY: {kms_year}' if kms_year else ''} {f'| {season}' if season else ''}</span><span>Date: {datetime.now().strftime('%d-%m-%Y')}</span></div>
    <table><tr><th class="c">No.</th><th>Date</th><th>Inv No.</th><th>Party</th><th>Items</th><th>Truck/RST</th><th class="r">Subtotal</th><th class="r">GST</th><th class="r">Total</th><th class="r">Advance</th><th class="r">Cash</th><th class="r">Diesel</th><th class="r">Balance</th></tr>"""
    
    g = {"sub": 0, "gst": 0, "total": 0, "adv": 0, "cash": 0, "diesel": 0, "bal": 0}
    for v in vouchers:
        items_str = ', '.join(f"{i['item_name']}({i['quantity']}Q)" for i in v.get('items', []))
        gst = (v.get('cgst_amount', 0) or 0) + (v.get('sgst_amount', 0) or 0) + (v.get('igst_amount', 0) or 0)
        dp = str(v.get('date', '')).split('-')
        fd = f"{dp[2]}/{dp[1]}/{dp[0]}" if len(dp) == 3 else v.get('date', '')
        truck_rst = f"{v.get('truck_no','')}"
        if v.get('rst_no'): truck_rst += f" / {v['rst_no']}"
        g["sub"] += v.get('subtotal', 0) or 0
        g["gst"] += gst
        g["total"] += v.get('total', 0) or 0
        g["adv"] += v.get('advance', 0) or 0
        g["cash"] += v.get('cash_paid', 0) or 0
        g["diesel"] += v.get('diesel_paid', 0) or 0
        g["bal"] += v.get('balance', 0) or 0
        html += f"""<tr><td class="c">#{v.get('voucher_no','')}</td><td>{fd}</td><td>{v.get('invoice_no','')}</td><td class="b">{v.get('party_name','')}</td>
        <td>{items_str}</td><td>{truck_rst}</td>
        <td class="r amt">{v.get('subtotal',0):,.0f}</td><td class="r amt">{gst:,.0f}</td>
        <td class="r amt b">{v.get('total',0):,.0f}</td><td class="r amt">{v.get('advance',0) or 0:,.0f}</td>
        <td class="r amt">{v.get('cash_paid',0) or 0:,.0f}</td><td class="r amt">{v.get('diesel_paid',0) or 0:,.0f}</td>
        <td class="r amt b">{v.get('balance',0):,.0f}</td></tr>"""
    
    html += f"""<tr class="total-row"><td colspan="6" class="b">TOTAL ({len(vouchers)} vouchers)</td>
    <td class="r amt">{g['sub']:,.0f}</td><td class="r amt">{g['gst']:,.0f}</td><td class="r amt">{g['total']:,.0f}</td>
    <td class="r amt">{g['adv']:,.0f}</td><td class="r amt">{g['cash']:,.0f}</td><td class="r amt">{g['diesel']:,.0f}</td>
    <td class="r amt">{g['bal']:,.0f}</td></tr></table>
    <div class="footer">Generated on {datetime.now().strftime('%d-%m-%Y %H:%M')} | {company}</div></body></html>"""
    
    return Response(content=html, media_type="text/html", headers={"Content-Disposition": "inline; filename=sale_book.html"})


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
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Sale Book"
    
    # Page setup for A4
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.orientation = 'landscape'
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_options.horizontalCentered = True
    
    # Styles
    header_font = Font(name='Calibri', size=14, bold=True, color='1a5276')
    sub_font = Font(name='Calibri', size=9, color='666666')
    col_header_font = Font(name='Calibri', size=9, bold=True, color='FFFFFF')
    col_header_fill = PatternFill(start_color='1a5276', end_color='1a5276', fill_type='solid')
    data_font = Font(name='Calibri', size=9)
    bold_font = Font(name='Calibri', size=9, bold=True)
    total_font = Font(name='Calibri', size=10, bold=True, color='FFFFFF')
    total_fill = PatternFill(start_color='1a5276', end_color='1a5276', fill_type='solid')
    thin_border = Border(bottom=Side(style='thin', color='E0E0E0'))
    
    # Header
    ws.merge_cells('A1:M1')
    ws['A1'] = company
    ws['A1'].font = header_font
    ws['A1'].alignment = Alignment(horizontal='center')
    
    ws.merge_cells('A2:M2')
    ws['A2'] = f"Sale Book Report | {f'FY: {kms_year}' if kms_year else ''} {f'| {season}' if season else ''} | Date: {datetime.now().strftime('%d-%m-%Y')}"
    ws['A2'].font = sub_font
    ws['A2'].alignment = Alignment(horizontal='center')
    
    # Column headers
    cols = ['No.', 'Date', 'Inv No.', 'Party', 'Items', 'Truck/RST', 'Subtotal', 'GST', 'Total', 'Advance', 'Cash', 'Diesel', 'Balance']
    widths = [6, 10, 10, 18, 28, 14, 10, 8, 10, 10, 8, 8, 10]
    for i, (col, w) in enumerate(zip(cols, widths), 1):
        cell = ws.cell(row=4, column=i, value=col)
        cell.font = col_header_font
        cell.fill = col_header_fill
        cell.alignment = Alignment(horizontal='right' if i >= 7 else 'left', vertical='center')
        ws.column_dimensions[cell.column_letter].width = w
    
    # Data rows
    g = {"sub": 0, "gst": 0, "total": 0, "adv": 0, "cash": 0, "diesel": 0, "bal": 0}
    for ri, v in enumerate(vouchers, 5):
        items_str = ', '.join(f"{i['item_name']}({i['quantity']}Q)" for i in v.get('items', []))
        gst = (v.get('cgst_amount', 0) or 0) + (v.get('sgst_amount', 0) or 0) + (v.get('igst_amount', 0) or 0)
        dp = str(v.get('date', '')).split('-')
        fd = f"{dp[2]}/{dp[1]}/{dp[0]}" if len(dp) == 3 else v.get('date', '')
        truck_rst = v.get('truck_no', '')
        if v.get('rst_no'): truck_rst += f" / {v['rst_no']}"
        
        g["sub"] += v.get('subtotal', 0) or 0
        g["gst"] += gst
        g["total"] += v.get('total', 0) or 0
        g["adv"] += v.get('advance', 0) or 0
        g["cash"] += v.get('cash_paid', 0) or 0
        g["diesel"] += v.get('diesel_paid', 0) or 0
        g["bal"] += v.get('balance', 0) or 0
        
        row_data = [f"#{v.get('voucher_no','')}", fd, v.get('invoice_no',''), v.get('party_name',''), items_str, truck_rst,
                    v.get('subtotal', 0), gst, v.get('total', 0), v.get('advance', 0) or 0,
                    v.get('cash_paid', 0) or 0, v.get('diesel_paid', 0) or 0, v.get('balance', 0)]
        for ci, val in enumerate(row_data, 1):
            cell = ws.cell(row=ri, column=ci, value=val)
            cell.font = bold_font if ci in (4, 9, 13) else data_font
            cell.border = thin_border
            if ci >= 7: cell.alignment = Alignment(horizontal='right')
            if ci >= 7 and isinstance(val, (int, float)): cell.number_format = '#,##0'
    
    # Total row
    tr = len(vouchers) + 5
    ws.merge_cells(f'A{tr}:F{tr}')
    ws.cell(row=tr, column=1, value=f"TOTAL ({len(vouchers)} vouchers)").font = total_font
    ws.cell(row=tr, column=1).fill = total_fill
    for ci, val in enumerate([g['sub'], g['gst'], g['total'], g['adv'], g['cash'], g['diesel'], g['bal']], 7):
        cell = ws.cell(row=tr, column=ci, value=val)
        cell.font = total_font
        cell.fill = total_fill
        cell.alignment = Alignment(horizontal='right')
        cell.number_format = '#,##0'
    # Fill remaining total cells
    for ci in range(2, 7):
        ws.cell(row=tr, column=ci).fill = total_fill
    
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=sale_book_{datetime.now().strftime('%Y%m%d')}.xlsx"}
    )


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
