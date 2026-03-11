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
    items: list[SaleItemCreate] = []
    gst_type: str = "none"  # none, cgst_sgst, igst
    cgst_percent: float = 0
    sgst_percent: float = 0
    igst_percent: float = 0
    truck_no: str = ""
    rst_no: str = ""
    remark: str = ""
    cash_paid: float = 0
    diesel_paid: float = 0
    kms_year: str = ""
    season: str = ""

class SaleVoucher(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    voucher_no: int = 0
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
    paid_amount: float = 0
    balance: float = 0
    kms_year: str = ""
    season: str = ""
    created_by: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@router.get("/sale-book/stock-items")
async def get_stock_items(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Get all available stock items for sale book dropdown"""
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    
    # Rice stock
    milling = await db.milling_entries.find(query, {"_id": 0}).to_list(10000)
    dc = await db.dc_entries.find(query, {"_id": 0}).to_list(10000)
    pvt_sales = await db.rice_sales.find(query, {"_id": 0}).to_list(10000)
    sale_vouchers = await db.sale_vouchers.find(query, {"_id": 0}).to_list(10000)
    
    # Calculate rice produced by type
    parboiled_produced = round(sum(e.get('rice_qntl', 0) for e in milling if e.get('rice_type', '').lower() in ('usna', 'parboiled')), 2)
    raw_produced = round(sum(e.get('rice_qntl', 0) for e in milling if e.get('rice_type', '').lower() == 'raw'), 2)
    
    # Rice sold/delivered
    govt_delivered = round(sum(e.get('quantity_qntl', 0) for e in dc), 2)
    pvt_sold_usna = round(sum(s.get('quantity_qntl', 0) for s in pvt_sales if s.get('rice_type', '').lower() in ('usna', 'parboiled')), 2)
    pvt_sold_raw = round(sum(s.get('quantity_qntl', 0) for s in pvt_sales if s.get('rice_type', '').lower() == 'raw'), 2)
    
    # Sale book sold
    sb_sold = {}
    for sv in sale_vouchers:
        for item in sv.get('items', []):
            name = item.get('item_name', '')
            sb_sold[name] = sb_sold.get(name, 0) + (item.get('quantity', 0) or 0)
    
    # By-product stock
    bp_sales = await db.byproduct_sales.find(query, {"_id": 0}).to_list(10000)
    products = ["bran", "kunda", "broken", "kanki", "husk"]
    
    items = []
    
    # Rice items
    usna_avail = round(parboiled_produced - govt_delivered - pvt_sold_usna - sb_sold.get("Rice (Usna)", 0), 2)
    raw_avail = round(raw_produced - pvt_sold_raw - sb_sold.get("Rice (Raw)", 0), 2)
    items.append({"name": "Rice (Usna)", "available_qntl": usna_avail, "unit": "Qntl"})
    items.append({"name": "Rice (Raw)", "available_qntl": raw_avail, "unit": "Qntl"})
    
    # By-products
    for p in products:
        produced = round(sum(e.get(f'{p}_qntl', 0) for e in milling), 2)
        sold_bp = round(sum(s.get('quantity_qntl', 0) for s in bp_sales if s.get('product') == p), 2)
        sold_sb = sb_sold.get(p.title(), 0)
        avail = round(produced - sold_bp - sold_sb, 2)
        items.append({"name": p.title(), "available_qntl": avail, "unit": "Qntl"})
    
    # FRK stock
    frk_purchases = await db.frk_purchases.find(query, {"_id": 0}).to_list(10000) if await db.frk_purchases.count_documents(query) > 0 else []
    frk_produced = round(sum(e.get('quantity_qntl', 0) or e.get('quantity', 0) for e in frk_purchases), 2)
    frk_sold_sb = sb_sold.get("FRK", 0)
    items.append({"name": "FRK", "available_qntl": round(frk_produced - frk_sold_sb, 2), "unit": "Qntl"})
    
    return items


@router.get("/sale-book")
async def get_sale_vouchers(kms_year: Optional[str] = None, season: Optional[str] = None, party_name: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if party_name: query["party_name"] = {"$regex": party_name, "$options": "i"}
    return await db.sale_vouchers.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)


@router.post("/sale-book")
async def create_sale_voucher(input: SaleVoucherCreate, username: str = "", role: str = ""):
    d = input.model_dump()
    
    # Calculate item amounts and subtotal
    items = []
    subtotal = 0
    for item in d.get('items', []):
        amount = round(item.get('quantity', 0) * item.get('rate', 0), 2)
        items.append({**item, "amount": amount})
        subtotal += amount
    
    d['items'] = items
    d['subtotal'] = round(subtotal, 2)
    
    # Calculate GST
    cgst_amt = round(subtotal * d.get('cgst_percent', 0) / 100, 2) if d.get('gst_type') == 'cgst_sgst' else 0
    sgst_amt = round(subtotal * d.get('sgst_percent', 0) / 100, 2) if d.get('gst_type') == 'cgst_sgst' else 0
    igst_amt = round(subtotal * d.get('igst_percent', 0) / 100, 2) if d.get('gst_type') == 'igst' else 0
    
    d['cgst_amount'] = cgst_amt
    d['sgst_amount'] = sgst_amt
    d['igst_amount'] = igst_amt
    total = round(subtotal + cgst_amt + sgst_amt + igst_amt, 2)
    d['total'] = total
    
    cash = d.get('cash_paid', 0) or 0
    diesel = d.get('diesel_paid', 0) or 0
    d['paid_amount'] = round(cash + diesel, 2)
    d['balance'] = round(total - cash - diesel, 2)
    d['created_by'] = username
    
    # Auto voucher number
    last = await db.sale_vouchers.find_one(sort=[("voucher_no", -1)], projection={"_id": 0, "voucher_no": 1})
    d['voucher_no'] = (last.get('voucher_no', 0) if last else 0) + 1
    
    obj = SaleVoucher(**d)
    doc = obj.model_dump()
    await db.sale_vouchers.insert_one(doc)
    doc.pop('_id', None)
    
    # Create party_ledger entry (jama = amount to be received from party)
    party = (d.get('party_name') or '').strip()
    if party and total > 0:
        ledger_jama = {
            "id": str(uuid.uuid4()),
            "date": d.get('date', ''),
            "account": "ledger",
            "txn_type": "jama",
            "amount": total,
            "category": party,
            "party_type": "Sale Book",
            "description": f"Sale Voucher #{d['voucher_no']} - {', '.join(i['item_name'] for i in items)}",
            "reference": f"sale_voucher:{doc.get('id','')}",
            "kms_year": d.get('kms_year', ''),
            "season": d.get('season', ''),
            "created_by": username,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.cash_transactions.insert_one(ledger_jama)
    
    # If cash paid, create nikasi entry
    if cash > 0 and party:
        nikasi = {
            "id": str(uuid.uuid4()),
            "date": d.get('date', ''),
            "account": "ledger",
            "txn_type": "nikasi",
            "amount": cash,
            "category": party,
            "party_type": "Sale Book",
            "description": f"Cash received - Sale #{d['voucher_no']}",
            "reference": f"sale_voucher_cash:{doc.get('id','')}",
            "kms_year": d.get('kms_year', ''),
            "season": d.get('season', ''),
            "created_by": username,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.cash_transactions.insert_one(nikasi)
        # Cash book entry
        cash_entry = {
            "id": str(uuid.uuid4()),
            "date": d.get('date', ''),
            "account": "cash",
            "txn_type": "jama",
            "amount": cash,
            "category": party,
            "party_type": "Sale Book",
            "description": f"Cash from Sale #{d['voucher_no']}",
            "reference": f"sale_voucher_cash:{doc.get('id','')}",
            "kms_year": d.get('kms_year', ''),
            "season": d.get('season', ''),
            "created_by": username,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.cash_transactions.insert_one(cash_entry)
    
    return doc


@router.delete("/sale-book/{voucher_id}")
async def delete_sale_voucher(voucher_id: str, username: str = "", role: str = ""):
    existing = await db.sale_vouchers.find_one({"id": voucher_id}, {"_id": 0})
    if not existing: raise HTTPException(status_code=404, detail="Voucher not found")
    await db.sale_vouchers.delete_one({"id": voucher_id})
    # Delete linked ledger entries
    await db.cash_transactions.delete_many({"reference": {"$regex": f"sale_voucher.*:{voucher_id}"}})
    return {"message": "Sale voucher deleted", "id": voucher_id}
