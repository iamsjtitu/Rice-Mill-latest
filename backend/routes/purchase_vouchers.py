from fastapi import APIRouter, HTTPException
from database import db
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime, timezone
import uuid

router = APIRouter()

# ============ PURCHASE VOUCHERS ============

class PurchaseItemCreate(BaseModel):
    item_name: str
    quantity: float = 0
    rate: float = 0
    unit: str = "Qntl"

class PurchaseVoucherCreate(BaseModel):
    date: str
    party_name: str
    invoice_no: str = ""
    items: list[PurchaseItemCreate] = []
    truck_no: str = ""
    cash_paid: float = 0
    diesel_paid: float = 0
    advance: float = 0
    remark: str = ""
    kms_year: str = ""
    season: str = ""

class PurchaseVoucher(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    voucher_no: int = 0
    invoice_no: str = ""
    date: str = ""
    party_name: str = ""
    items: list = []
    subtotal: float = 0
    total: float = 0
    truck_no: str = ""
    cash_paid: float = 0
    diesel_paid: float = 0
    advance: float = 0
    paid_amount: float = 0
    balance: float = 0
    remark: str = ""
    kms_year: str = ""
    season: str = ""
    created_by: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


async def _get_default_pump():
    pump = await db.diesel_accounts.find_one({}, {"_id": 0, "pump_name": 1}, sort=[("_id", -1)])
    return pump.get("pump_name", "Diesel Pump") if pump else "Diesel Pump"


async def _create_purchase_ledger_entries(d, doc_id, vno, items, username):
    """Create all accounting entries for a purchase voucher"""
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

    # 1. Party Ledger JAMA: total purchase amount (we owe the party)
    if party and total > 0:
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "ledger", "txn_type": "jama",
            "amount": total, "category": party, "party_type": "Purchase Voucher",
            "description": f"Purchase #{vno} - {items_str}{desc_suffix}",
            "reference": f"purchase_voucher:{doc_id}", **base
        })

    # 2. Advance paid to party: Party Ledger NIKASI (reduces what we owe)
    if advance > 0 and party:
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "ledger", "txn_type": "nikasi",
            "amount": advance, "category": party, "party_type": "Purchase Voucher",
            "description": f"Advance paid - Purchase #{vno}{desc_suffix}",
            "reference": f"purchase_voucher_adv:{doc_id}", **base
        })

    # 3. Cash paid → Cash NIKASI (cash going out)
    if cash > 0:
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "cash", "txn_type": "nikasi",
            "amount": cash, "category": truck or party, "party_type": "Truck" if truck else "Purchase Voucher",
            "description": f"Truck cash - Purchase #{vno}{desc_suffix}",
            "reference": f"purchase_voucher_cash:{doc_id}", **base
        })

    # 4. Diesel paid → Diesel Pump Ledger JAMA + diesel_accounts entry
    if diesel > 0:
        pump_name = await _get_default_pump()
        pump_doc = await db.diesel_accounts.find_one({"pump_name": pump_name}, {"_id": 0, "pump_id": 1})
        pump_id = pump_doc.get("pump_id", "") if pump_doc else ""
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "ledger", "txn_type": "jama",
            "amount": diesel, "category": pump_name, "party_type": "Diesel",
            "description": f"Diesel for truck - Purchase #{vno} - {party}{desc_suffix}",
            "reference": f"purchase_voucher_diesel:{doc_id}", **base
        })
        diesel_entry = {
            "id": str(uuid.uuid4()), "date": d.get('date', ''),
            "pump_id": pump_id, "pump_name": pump_name,
            "truck_no": truck, "agent_name": party,
            "amount": diesel, "txn_type": "debit",
            "description": f"Diesel for Purchase #{vno} - {party}{desc_suffix}",
            "reference": f"purchase_voucher_diesel:{doc_id}",
            **base
        }
        await db.diesel_accounts.insert_one(diesel_entry)

    # 5. Truck payment (cash + diesel) → Truck Ledger + truck_payments entry
    truck_total = cash + diesel
    if truck_total > 0 and truck:
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "ledger", "txn_type": "jama",
            "amount": truck_total, "category": truck, "party_type": "Truck",
            "description": f"Truck payment - Purchase #{vno} (Cash:{cash} + Diesel:{diesel}){desc_suffix}",
            "reference": f"purchase_voucher_truck:{doc_id}", **base
        })
        truck_entry = {
            "entry_id": str(uuid.uuid4()),
            "truck_no": truck, "date": d.get('date', ''),
            "cash_taken": cash, "diesel_taken": diesel,
            "gross_amount": truck_total, "deductions": truck_total,
            "net_amount": 0, "paid_amount": 0,
            "balance_amount": truck_total, "status": "pending",
            "source": "Purchase Voucher",
            "description": f"Purchase #{vno} - {party}{desc_suffix}",
            "reference": f"purchase_voucher_truck:{doc_id}",
            **base
        }
        await db.truck_payments.insert_one(truck_entry)

    for entry in entries:
        await db.cash_transactions.insert_one(entry)


@router.get("/purchase-book")
async def get_purchase_vouchers(kms_year: Optional[str] = None, season: Optional[str] = None,
                                party_name: Optional[str] = None, invoice_no: Optional[str] = None,
                                search: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if party_name: query["party_name"] = {"$regex": party_name, "$options": "i"}
    if invoice_no: query["invoice_no"] = {"$regex": invoice_no, "$options": "i"}
    if search:
        query["$or"] = [
            {"party_name": {"$regex": search, "$options": "i"}},
            {"invoice_no": {"$regex": search, "$options": "i"}},
            {"truck_no": {"$regex": search, "$options": "i"}},
        ]
    return await db.purchase_vouchers.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)


@router.post("/purchase-book")
async def create_purchase_voucher(input: PurchaseVoucherCreate, username: str = "", role: str = ""):
    d = input.model_dump()

    items = []
    subtotal = 0
    for item in d.get('items', []):
        amount = round(item.get('quantity', 0) * item.get('rate', 0), 2)
        items.append({**item, "amount": amount})
        subtotal += amount

    d['items'] = items
    d['subtotal'] = round(subtotal, 2)
    d['total'] = round(subtotal, 2)

    advance = d.get('advance', 0) or 0
    d['paid_amount'] = round(advance, 2)
    d['balance'] = round(subtotal - advance, 2)
    d['created_by'] = username

    last = await db.purchase_vouchers.find_one(sort=[("voucher_no", -1)], projection={"_id": 0, "voucher_no": 1})
    d['voucher_no'] = (last.get('voucher_no', 0) if last else 0) + 1

    obj = PurchaseVoucher(**d)
    doc = obj.model_dump()
    await db.purchase_vouchers.insert_one(doc)
    doc.pop('_id', None)

    await _create_purchase_ledger_entries(d, doc.get('id', ''), d['voucher_no'], items, username)
    return doc


@router.put("/purchase-book/{voucher_id}")
async def update_purchase_voucher(voucher_id: str, input: PurchaseVoucherCreate, username: str = "", role: str = ""):
    existing = await db.purchase_vouchers.find_one({"id": voucher_id}, {"_id": 0})
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
    d['total'] = round(subtotal, 2)
    advance = d.get('advance', 0) or 0
    d['paid_amount'] = round(advance, 2)
    d['balance'] = round(subtotal - advance, 2)
    d['updated_at'] = datetime.now(timezone.utc).isoformat()

    await db.purchase_vouchers.update_one({"id": voucher_id}, {"$set": d})

    # Delete old accounting entries and recreate
    await db.cash_transactions.delete_many({"reference": {"$regex": f"purchase_voucher.*:{voucher_id}"}})
    await db.diesel_accounts.delete_many({"reference": {"$regex": f"purchase_voucher.*:{voucher_id}"}})
    await db.truck_payments.delete_many({"reference": {"$regex": f"purchase_voucher.*:{voucher_id}"}})
    vno = existing.get('voucher_no', 0)
    await _create_purchase_ledger_entries(d, voucher_id, vno, items, username)

    updated = await db.purchase_vouchers.find_one({"id": voucher_id}, {"_id": 0})
    return updated


@router.delete("/purchase-book/{voucher_id}")
async def delete_purchase_voucher(voucher_id: str, username: str = "", role: str = ""):
    existing = await db.purchase_vouchers.find_one({"id": voucher_id}, {"_id": 0})
    if not existing: raise HTTPException(status_code=404, detail="Voucher not found")
    await db.purchase_vouchers.delete_one({"id": voucher_id})
    await db.cash_transactions.delete_many({"reference": {"$regex": f"purchase_voucher.*:{voucher_id}"}})
    await db.diesel_accounts.delete_many({"reference": {"$regex": f"purchase_voucher.*:{voucher_id}"}})
    await db.truck_payments.delete_many({"reference": {"$regex": f"purchase_voucher.*:{voucher_id}"}})
    return {"message": "Purchase voucher deleted", "id": voucher_id}


@router.get("/purchase-book/item-suggestions")
async def get_item_suggestions():
    """Get unique item names from purchase vouchers for autocomplete"""
    pipeline = [
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.item_name"}},
        {"$sort": {"_id": 1}}
    ]
    results = await db.purchase_vouchers.aggregate(pipeline).to_list(1000)
    return [r["_id"] for r in results if r["_id"]]


# ============ STOCK SUMMARY ============

@router.get("/stock-summary")
async def get_stock_summary(kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season

    milling = await db.milling_entries.find(query, {"_id": 0}).to_list(10000)
    dc = await db.dc_entries.find(query, {"_id": 0}).to_list(10000)
    pvt_sales = await db.rice_sales.find(query, {"_id": 0}).to_list(10000)
    sale_vouchers = await db.sale_vouchers.find(query, {"_id": 0}).to_list(10000)
    bp_sales = await db.byproduct_sales.find(query, {"_id": 0}).to_list(10000)
    purchase_vouchers = await db.purchase_vouchers.find(query, {"_id": 0}).to_list(10000)
    entries = await db.entries.find(query, {"_id": 0}).to_list(10000)
    pvt_paddy = await db.private_paddy.find(query, {"_id": 0}).to_list(10000)

    # Paddy stock from mill entries
    paddy_in_entries = round(sum(e.get('final_w', 0) / 100 for e in entries), 2)
    paddy_in_pvt = round(sum(e.get('final_qntl', 0) or e.get('quantity_qntl', 0) or 0 for e in pvt_paddy), 2)
    paddy_used_milling = round(sum(e.get('paddy_used_qntl', 0) or e.get('paddy_qntl', 0) or 0 for e in milling), 2)

    # Rice produced from milling
    usna_produced = round(sum(e.get('rice_qntl', 0) for e in milling if e.get('rice_type', '').lower() in ('usna', 'parboiled')), 2)
    raw_produced = round(sum(e.get('rice_qntl', 0) for e in milling if e.get('rice_type', '').lower() == 'raw'), 2)

    # Rice sold
    govt_delivered = round(sum(e.get('quantity_qntl', 0) for e in dc), 2)
    pvt_sold_usna = round(sum(s.get('quantity_qntl', 0) for s in pvt_sales if s.get('rice_type', '').lower() in ('usna', 'parboiled')), 2)
    pvt_sold_raw = round(sum(s.get('quantity_qntl', 0) for s in pvt_sales if s.get('rice_type', '').lower() == 'raw'), 2)

    # Sale voucher items sold
    sb_sold = {}
    for sv in sale_vouchers:
        for item in sv.get('items', []):
            name = item.get('item_name', '')
            sb_sold[name] = sb_sold.get(name, 0) + (item.get('quantity', 0) or 0)

    # Purchase voucher items bought
    pv_bought = {}
    for pv in purchase_vouchers:
        for item in pv.get('items', []):
            name = item.get('item_name', '')
            pv_bought[name] = pv_bought.get(name, 0) + (item.get('quantity', 0) or 0)

    # By-products
    products = ["bran", "kunda", "broken", "kanki", "husk"]
    bp_produced = {}
    for p in products:
        bp_produced[p] = round(sum(e.get(f'{p}_qntl', 0) for e in milling), 2)
    bp_sold_map = {}
    for s in bp_sales:
        prod = s.get('product', '')
        bp_sold_map[prod] = bp_sold_map.get(prod, 0) + s.get('quantity_qntl', 0)

    # FRK
    frk_purchases = []
    if await db.frk_purchases.count_documents(query) > 0:
        frk_purchases = await db.frk_purchases.find(query, {"_id": 0}).to_list(10000)
    frk_in = round(sum(e.get('quantity_qntl', 0) or e.get('quantity', 0) for e in frk_purchases), 2)

    # Build stock items list
    stock_items = []

    # Paddy
    paddy_total_in = round(paddy_in_entries + paddy_in_pvt + pv_bought.get("Paddy", 0), 2)
    stock_items.append({
        "name": "Paddy", "category": "Raw Material",
        "in_qty": paddy_total_in, "out_qty": paddy_used_milling,
        "available": round(paddy_total_in - paddy_used_milling, 2), "unit": "Qntl",
        "details": f"Mill Entry: {paddy_in_entries}Q + Pvt Purchase: {paddy_in_pvt}Q + Purchase Voucher: {pv_bought.get('Paddy', 0)}Q - Milling: {paddy_used_milling}Q"
    })

    # Rice Usna
    usna_sold_total = round(govt_delivered + pvt_sold_usna + sb_sold.get("Rice (Usna)", 0), 2)
    usna_avail = round(usna_produced + pv_bought.get("Rice (Usna)", 0) - usna_sold_total, 2)
    stock_items.append({
        "name": "Rice (Usna)", "category": "Finished",
        "in_qty": round(usna_produced + pv_bought.get("Rice (Usna)", 0), 2), "out_qty": usna_sold_total,
        "available": usna_avail, "unit": "Qntl",
        "details": f"Milling: {usna_produced}Q - DC: {govt_delivered}Q - Pvt Sale: {pvt_sold_usna}Q - Sale Voucher: {sb_sold.get('Rice (Usna)', 0)}Q"
    })

    # Rice Raw
    raw_sold_total = round(pvt_sold_raw + sb_sold.get("Rice (Raw)", 0), 2)
    raw_avail = round(raw_produced + pv_bought.get("Rice (Raw)", 0) - raw_sold_total, 2)
    stock_items.append({
        "name": "Rice (Raw)", "category": "Finished",
        "in_qty": round(raw_produced + pv_bought.get("Rice (Raw)", 0), 2), "out_qty": raw_sold_total,
        "available": raw_avail, "unit": "Qntl",
        "details": f"Milling: {raw_produced}Q - Pvt Sale: {pvt_sold_raw}Q - Sale Voucher: {sb_sold.get('Rice (Raw)', 0)}Q"
    })

    # By-products
    for p in products:
        produced = bp_produced.get(p, 0)
        sold_bp = round(bp_sold_map.get(p, 0), 2)
        sold_sb = sb_sold.get(p.title(), 0)
        purchased = pv_bought.get(p.title(), 0)
        total_in = round(produced + purchased, 2)
        total_out = round(sold_bp + sold_sb, 2)
        avail = round(total_in - total_out, 2)
        stock_items.append({
            "name": p.title(), "category": "By-Product",
            "in_qty": total_in, "out_qty": total_out,
            "available": avail, "unit": "Qntl",
            "details": f"Milling: {produced}Q + Purchased: {purchased}Q - Sold: {sold_bp}Q - Sale Voucher: {sold_sb}Q"
        })

    # FRK
    frk_purchased_pv = pv_bought.get("FRK", 0)
    frk_total_in = round(frk_in + frk_purchased_pv, 2)
    frk_sold_sb = sb_sold.get("FRK", 0)
    stock_items.append({
        "name": "FRK", "category": "By-Product",
        "in_qty": frk_total_in, "out_qty": frk_sold_sb,
        "available": round(frk_total_in - frk_sold_sb, 2), "unit": "Qntl",
        "details": f"FRK Purchase: {frk_in}Q + Purchase Voucher: {frk_purchased_pv}Q - Sale Voucher: {frk_sold_sb}Q"
    })

    # Custom items from purchase vouchers (not already covered above)
    known_items = {"Paddy", "Rice (Usna)", "Rice (Raw)", "FRK"} | {p.title() for p in products}
    for item_name, qty in pv_bought.items():
        if item_name not in known_items:
            sold = sb_sold.get(item_name, 0)
            stock_items.append({
                "name": item_name, "category": "Custom",
                "in_qty": round(qty, 2), "out_qty": round(sold, 2),
                "available": round(qty - sold, 2), "unit": "Qntl",
                "details": f"Purchased: {qty}Q - Sold: {sold}Q"
            })

    return {"items": stock_items}


# ============ PURCHASE BOOK PDF EXPORT ============

@router.get("/purchase-book/export/pdf")
async def export_purchase_book_pdf(kms_year: Optional[str] = None, season: Optional[str] = None, search: Optional[str] = None):
    from fastapi.responses import Response
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if search:
        query["$or"] = [
            {"party_name": {"$regex": search, "$options": "i"}},
            {"invoice_no": {"$regex": search, "$options": "i"}},
        ]
    vouchers = await db.purchase_vouchers.find(query, {"_id": 0}).sort("voucher_no", 1).to_list(10000)

    branding = await db.settings.find_one({"key": "branding"}, {"_id": 0}) or {}
    company = branding.get("company_name", "NAVKAR AGRO")
    tagline = branding.get("tagline", "")

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page {{ size: A4; margin: 12mm 10mm; }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 9px; color: #222; }}
    .header {{ text-align: center; border-bottom: 2px solid #2e7d32; padding-bottom: 8px; margin-bottom: 10px; }}
    .header h1 {{ font-size: 18px; color: #2e7d32; letter-spacing: 1px; }}
    .header .sub {{ font-size: 10px; color: #666; margin-top: 2px; }}
    .meta {{ display: flex; justify-content: space-between; font-size: 9px; color: #555; margin-bottom: 8px; padding: 4px 0; border-bottom: 1px solid #ddd; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 8.5px; }}
    th {{ background: #2e7d32; color: white; padding: 5px 4px; text-align: left; font-weight: 600; font-size: 8px; }}
    td {{ padding: 4px; border-bottom: 1px solid #e0e0e0; }}
    tr:nth-child(even) {{ background: #f8f9fa; }}
    .r {{ text-align: right; }} .c {{ text-align: center; }} .b {{ font-weight: 700; }}
    .total-row {{ background: #2e7d32 !important; color: white; font-weight: 700; }}
    .total-row td {{ padding: 6px 4px; border: none; }}
    .footer {{ margin-top: 12px; text-align: center; font-size: 8px; color: #999; border-top: 1px solid #ddd; padding-top: 6px; }}
    .amt {{ font-family: 'Consolas', monospace; }}
    </style></head><body>
    <div class="header"><h1>{company}</h1>"""
    if tagline:
        html += f'<div class="sub">{tagline}</div>'
    html += f"""</div>
    <div class="meta"><span>Purchase Book Report</span><span>{f'FY: {kms_year}' if kms_year else ''} {f'| {season}' if season else ''}</span><span>Date: {datetime.now().strftime('%d-%m-%Y')}</span></div>
    <table><tr><th class="c">No.</th><th>Date</th><th>Inv No.</th><th>Party</th><th>Items</th><th>Truck</th><th class="r">Total</th><th class="r">Advance</th><th class="r">Cash</th><th class="r">Diesel</th><th class="r">Balance</th></tr>"""

    g = {"total": 0, "adv": 0, "cash": 0, "diesel": 0, "bal": 0}
    for v in vouchers:
        items_str = ', '.join(f"{i['item_name']}({i.get('quantity', 0)})" for i in v.get('items', []))
        dp = str(v.get('date', '')).split('-')
        dt = f"{dp[2]}-{dp[1]}-{dp[0]}" if len(dp) == 3 else v.get('date', '')
        g["total"] += v.get('total', 0)
        g["adv"] += v.get('advance', 0)
        g["cash"] += v.get('cash_paid', 0)
        g["diesel"] += v.get('diesel_paid', 0)
        g["bal"] += v.get('balance', 0)
        html += f"""<tr><td class="c">{v.get('voucher_no','')}</td><td>{dt}</td><td>{v.get('invoice_no','')}</td>
        <td class="b">{v.get('party_name','')}</td><td>{items_str}</td><td>{v.get('truck_no','')}</td>
        <td class="r amt b">{v.get('total',0):,.0f}</td><td class="r amt">{v.get('advance',0):,.0f}</td>
        <td class="r amt">{v.get('cash_paid',0):,.0f}</td><td class="r amt">{v.get('diesel_paid',0):,.0f}</td>
        <td class="r amt b">{v.get('balance',0):,.0f}</td></tr>"""

    html += f"""<tr class="total-row"><td class="c" colspan="6">TOTAL ({len(vouchers)} vouchers)</td>
    <td class="r amt">{g['total']:,.0f}</td><td class="r amt">{g['adv']:,.0f}</td>
    <td class="r amt">{g['cash']:,.0f}</td><td class="r amt">{g['diesel']:,.0f}</td>
    <td class="r amt">{g['bal']:,.0f}</td></tr></table>
    <div class="footer">{company} - Purchase Book | Generated: {datetime.now().strftime('%d-%m-%Y %H:%M')}</div>
    </body></html>"""

    try:
        from weasyprint import HTML as WeasyprintHTML
        pdf_bytes = WeasyprintHTML(string=html).write_pdf()
    except Exception:
        import io
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=A4)
        c.drawString(50, 800, f"{company} - Purchase Book Report")
        y = 770
        for v in vouchers:
            items_str = ', '.join(f"{i['item_name']}({i.get('quantity', 0)})" for i in v.get('items', []))
            c.drawString(50, y, f"#{v.get('voucher_no','')} | {v.get('date','')} | {v.get('party_name','')} | {items_str} | Rs.{v.get('total',0):,.0f}")
            y -= 15
            if y < 50:
                c.showPage()
                y = 800
        c.save()
        pdf_bytes = buf.getvalue()

    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=purchase_book.pdf"})


# ============ PURCHASE BOOK EXCEL EXPORT ============

@router.get("/purchase-book/export/excel")
async def export_purchase_book_excel(kms_year: Optional[str] = None, season: Optional[str] = None, search: Optional[str] = None):
    from fastapi.responses import Response
    import io
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if search:
        query["$or"] = [
            {"party_name": {"$regex": search, "$options": "i"}},
            {"invoice_no": {"$regex": search, "$options": "i"}},
        ]
    vouchers = await db.purchase_vouchers.find(query, {"_id": 0}).sort("voucher_no", 1).to_list(10000)

    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
        wb = Workbook()
        ws = wb.active
        ws.title = "Purchase Book"
        headers = ["No.", "Date", "Invoice No.", "Party", "Items", "Truck", "Total", "Advance", "Cash", "Diesel", "Balance"]
        hfill = PatternFill(start_color="2E7D32", end_color="2E7D32", fill_type="solid")
        hfont = Font(bold=True, color="FFFFFF", size=9)
        thin = Side(style='thin', color='CCCCCC')
        for c, h in enumerate(headers, 1):
            cell = ws.cell(row=1, column=c, value=h)
            cell.fill = hfill
            cell.font = hfont
            cell.alignment = Alignment(horizontal='center')
        for r, v in enumerate(vouchers, 2):
            items_str = ', '.join(f"{i['item_name']}({i.get('quantity', 0)})" for i in v.get('items', []))
            vals = [v.get('voucher_no', ''), v.get('date', ''), v.get('invoice_no', ''), v.get('party_name', ''),
                    items_str, v.get('truck_no', ''), v.get('total', 0), v.get('advance', 0),
                    v.get('cash_paid', 0), v.get('diesel_paid', 0), v.get('balance', 0)]
            for c, val in enumerate(vals, 1):
                cell = ws.cell(row=r, column=c, value=val)
                cell.border = Border(bottom=thin)
        for c in range(1, 12):
            ws.column_dimensions[chr(64 + c)].width = 14
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return Response(content=buf.getvalue(),
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": "attachment; filename=purchase_book.xlsx"})
    except ImportError:
        return {"error": "openpyxl not installed"}


# ============ STOCK SUMMARY PDF EXPORT ============

@router.get("/stock-summary/export/pdf")
async def export_stock_summary_pdf(kms_year: Optional[str] = None, season: Optional[str] = None):
    from fastapi.responses import Response
    data = await get_stock_summary(kms_year, season)
    items = data.get("items", [])

    branding = await db.settings.find_one({"key": "branding"}, {"_id": 0}) or {}
    company = branding.get("company_name", "NAVKAR AGRO")
    tagline = branding.get("tagline", "")

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page {{ size: A4; margin: 12mm 10mm; }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #222; }}
    .header {{ text-align: center; border-bottom: 2px solid #1565c0; padding-bottom: 8px; margin-bottom: 10px; }}
    .header h1 {{ font-size: 18px; color: #1565c0; }}
    .header .sub {{ font-size: 10px; color: #666; margin-top: 2px; }}
    .meta {{ display: flex; justify-content: space-between; font-size: 9px; color: #555; margin-bottom: 10px; padding: 4px 0; border-bottom: 1px solid #ddd; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 9px; }}
    th {{ background: #1565c0; color: white; padding: 6px 5px; text-align: left; font-weight: 600; }}
    td {{ padding: 5px; border-bottom: 1px solid #e0e0e0; }}
    tr:nth-child(even) {{ background: #f5f5f5; }}
    .r {{ text-align: right; }} .b {{ font-weight: 700; }}
    .pos {{ color: #2e7d32; }} .neg {{ color: #c62828; }}
    .footer {{ margin-top: 12px; text-align: center; font-size: 8px; color: #999; border-top: 1px solid #ddd; padding-top: 6px; }}
    </style></head><body>
    <div class="header"><h1>{company}</h1>"""
    if tagline:
        html += f'<div class="sub">{tagline}</div>'
    html += f"""</div>
    <div class="meta"><span>Stock Summary</span><span>{f'FY: {kms_year}' if kms_year else ''} {f'| {season}' if season else ''}</span><span>{datetime.now().strftime('%d-%m-%Y')}</span></div>
    <table><tr><th>Item</th><th>Category</th><th class="r">In (Q)</th><th class="r">Out (Q)</th><th class="r">Available (Q)</th><th>Details</th></tr>"""

    for item in items:
        avail = item.get('available', 0)
        cls = 'pos' if avail >= 0 else 'neg'
        html += f"""<tr><td class="b">{item['name']}</td><td>{item.get('category','')}</td>
        <td class="r">{item.get('in_qty',0)}</td><td class="r">{item.get('out_qty',0)}</td>
        <td class="r b {cls}">{avail} {item.get('unit','Q')}</td><td style="font-size:7px;color:#666">{item.get('details','')}</td></tr>"""

    html += f"""</table><div class="footer">{company} - Stock Summary | {datetime.now().strftime('%d-%m-%Y %H:%M')}</div></body></html>"""

    try:
        from weasyprint import HTML as WeasyprintHTML
        pdf_bytes = WeasyprintHTML(string=html).write_pdf()
    except Exception:
        import io as _io
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        buf = _io.BytesIO()
        c = canvas.Canvas(buf, pagesize=A4)
        c.drawString(50, 800, f"{company} - Stock Summary")
        y = 770
        for item in items:
            c.drawString(50, y, f"{item['name']}: {item.get('available', 0)} {item.get('unit', 'Q')}")
            y -= 15
            if y < 50: c.showPage(); y = 800
        c.save()
        pdf_bytes = buf.getvalue()

    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=stock_summary.pdf"})


# ============ STOCK SUMMARY EXCEL EXPORT ============

@router.get("/stock-summary/export/excel")
async def export_stock_summary_excel(kms_year: Optional[str] = None, season: Optional[str] = None):
    from fastapi.responses import Response
    import io
    data = await get_stock_summary(kms_year, season)
    items = data.get("items", [])

    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
        wb = Workbook()
        ws = wb.active
        ws.title = "Stock Summary"
        headers = ["Item", "Category", "In (Qntl)", "Out (Qntl)", "Available (Qntl)", "Unit"]
        hfill = PatternFill(start_color="1565C0", end_color="1565C0", fill_type="solid")
        hfont = Font(bold=True, color="FFFFFF", size=10)
        for c, h in enumerate(headers, 1):
            cell = ws.cell(row=1, column=c, value=h)
            cell.fill = hfill
            cell.font = hfont
        for r, item in enumerate(items, 2):
            vals = [item['name'], item.get('category', ''), item.get('in_qty', 0), item.get('out_qty', 0), item.get('available', 0), item.get('unit', 'Qntl')]
            for c, val in enumerate(vals, 1):
                ws.cell(row=r, column=c, value=val)
        for c in range(1, 7):
            ws.column_dimensions[chr(64 + c)].width = 18
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return Response(content=buf.getvalue(),
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": "attachment; filename=stock_summary.xlsx"})
    except ImportError:
        return {"error": "openpyxl not installed"}
