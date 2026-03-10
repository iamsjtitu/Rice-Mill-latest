from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, Response
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from database import db, USERS, print_pages
from models import *
import uuid, io, csv
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

router = APIRouter()

# ============ CASH BOOK / DAILY CASH & BANK REGISTER ============

class CashTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    account: str  # "cash", "bank", or "ledger"
    txn_type: str  # "jama" (credit/in) or "nikasi" (debit/out)
    category: str = ""  # Party name
    party_type: str = ""  # "Truck", "Agent", "Local Party", "Diesel", "Manual"
    description: str = ""
    amount: float = 0
    reference: str = ""
    kms_year: str = ""
    season: str = ""
    created_by: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@router.post("/cash-book")
async def add_cash_transaction(txn: CashTransaction, username: str = "", role: str = ""):
    txn_dict = txn.model_dump()
    txn_dict['created_by'] = username
    txn_dict['amount'] = round(txn_dict['amount'], 2)
    await db.cash_transactions.insert_one(txn_dict)
    txn_dict.pop('_id', None)
    return txn_dict


@router.get("/cash-book")
async def get_cash_transactions(kms_year: Optional[str] = None, season: Optional[str] = None,
                                 account: Optional[str] = None, txn_type: Optional[str] = None,
                                 category: Optional[str] = None, party_type: Optional[str] = None,
                                 date_from: Optional[str] = None, date_to: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if account: query["account"] = account
    if txn_type: query["txn_type"] = txn_type
    if category: query["category"] = category
    if party_type: query["party_type"] = party_type
    if date_from or date_to:
        date_q = {}
        if date_from: date_q["$gte"] = date_from
        if date_to: date_q["$lte"] = date_to
        if date_q: query["date"] = date_q
    txns = await db.cash_transactions.find(query, {"_id": 0}).sort("date", -1).to_list(5000)
    return txns


@router.delete("/cash-book/{txn_id}")
async def delete_cash_transaction(txn_id: str):
    result = await db.cash_transactions.delete_one({"id": txn_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"message": "Transaction deleted", "id": txn_id}


@router.put("/cash-book/{txn_id}")
async def update_cash_transaction(txn_id: str, request: Request, username: str = "", role: str = ""):
    body = await request.json()
    body.pop("_id", None)
    body.pop("id", None)
    body["updated_at"] = datetime.now(timezone.utc).isoformat()
    body["updated_by"] = username or body.get("updated_by", "")
    if "amount" in body:
        body["amount"] = round(float(body["amount"]), 2)
    result = await db.cash_transactions.update_one({"id": txn_id}, {"$set": body})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    updated = await db.cash_transactions.find_one({"id": txn_id}, {"_id": 0})
    return updated


@router.post("/cash-book/delete-bulk")
async def delete_cash_transactions_bulk(request: Request):
    body = await request.json()
    ids = body.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No ids provided")
    result = await db.cash_transactions.delete_many({"id": {"$in": ids}})
    return {"message": f"{result.deleted_count} transactions deleted", "deleted": result.deleted_count}


@router.get("/cash-book/summary")
async def get_cash_book_summary(kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    txns = await db.cash_transactions.find(query, {"_id": 0}).to_list(10000)
    
    cash_in = sum(t['amount'] for t in txns if t.get('account') == 'cash' and t.get('txn_type') == 'jama')
    cash_out = sum(t['amount'] for t in txns if t.get('account') == 'cash' and t.get('txn_type') == 'nikasi')
    bank_in = sum(t['amount'] for t in txns if t.get('account') == 'bank' and t.get('txn_type') == 'jama')
    bank_out = sum(t['amount'] for t in txns if t.get('account') == 'bank' and t.get('txn_type') == 'nikasi')
    
    # Compute opening balance from previous FY
    opening_cash = 0.0
    opening_bank = 0.0
    if kms_year:
        parts = kms_year.split('-')
        if len(parts) == 2:
            try:
                prev_fy = f"{int(parts[0])-1}-{int(parts[1])-1}"
                # Also check for manually saved opening balance
                saved_ob = await db.opening_balances.find_one({"kms_year": kms_year}, {"_id": 0})
                if saved_ob:
                    opening_cash = saved_ob.get("cash", 0.0)
                    opening_bank = saved_ob.get("bank", 0.0)
                else:
                    prev_txns = await db.cash_transactions.find({"kms_year": prev_fy}, {"_id": 0}).to_list(10000)
                    prev_cash_in = sum(t['amount'] for t in prev_txns if t.get('account') == 'cash' and t.get('txn_type') == 'jama')
                    prev_cash_out = sum(t['amount'] for t in prev_txns if t.get('account') == 'cash' and t.get('txn_type') == 'nikasi')
                    prev_bank_in = sum(t['amount'] for t in prev_txns if t.get('account') == 'bank' and t.get('txn_type') == 'jama')
                    prev_bank_out = sum(t['amount'] for t in prev_txns if t.get('account') == 'bank' and t.get('txn_type') == 'nikasi')
                    # Check if previous FY also had an opening balance
                    prev_ob = await db.opening_balances.find_one({"kms_year": prev_fy}, {"_id": 0})
                    if prev_ob:
                        opening_cash = round((prev_ob.get("cash", 0) + prev_cash_in - prev_cash_out), 2)
                        opening_bank = round((prev_ob.get("bank", 0) + prev_bank_in - prev_bank_out), 2)
                    else:
                        opening_cash = round(prev_cash_in - prev_cash_out, 2)
                        opening_bank = round(prev_bank_in - prev_bank_out, 2)
            except (ValueError, IndexError):
                pass
    
    return {
        "opening_cash": opening_cash,
        "opening_bank": opening_bank,
        "cash_in": round(cash_in, 2),
        "cash_out": round(cash_out, 2),
        "cash_balance": round(opening_cash + cash_in - cash_out, 2),
        "bank_in": round(bank_in, 2),
        "bank_out": round(bank_out, 2),
        "bank_balance": round(opening_bank + bank_in - bank_out, 2),
        "total_balance": round((opening_cash + cash_in - cash_out) + (opening_bank + bank_in - bank_out), 2),
        "total_transactions": len(txns)
    }

@router.get("/cash-book/opening-balance")
async def get_opening_balance(kms_year: str):
    saved = await db.opening_balances.find_one({"kms_year": kms_year}, {"_id": 0})
    if saved:
        return {"cash": saved.get("cash", 0), "bank": saved.get("bank", 0), "source": "manual"}
    # Auto-compute from previous FY
    parts = kms_year.split('-')
    if len(parts) == 2:
        try:
            prev_fy = f"{int(parts[0])-1}-{int(parts[1])-1}"
            prev_txns = await db.cash_transactions.find({"kms_year": prev_fy}, {"_id": 0}).to_list(10000)
            prev_cash_in = sum(t['amount'] for t in prev_txns if t.get('account') == 'cash' and t.get('txn_type') == 'jama')
            prev_cash_out = sum(t['amount'] for t in prev_txns if t.get('account') == 'cash' and t.get('txn_type') == 'nikasi')
            prev_bank_in = sum(t['amount'] for t in prev_txns if t.get('account') == 'bank' and t.get('txn_type') == 'jama')
            prev_bank_out = sum(t['amount'] for t in prev_txns if t.get('account') == 'bank' and t.get('txn_type') == 'nikasi')
            prev_ob = await db.opening_balances.find_one({"kms_year": prev_fy}, {"_id": 0})
            ob_cash = prev_ob.get("cash", 0) if prev_ob else 0
            ob_bank = prev_ob.get("bank", 0) if prev_ob else 0
            return {"cash": round(ob_cash + prev_cash_in - prev_cash_out, 2), "bank": round(ob_bank + prev_bank_in - prev_bank_out, 2), "source": "auto"}
        except (ValueError, IndexError):
            pass
    return {"cash": 0, "bank": 0, "source": "none"}

@router.put("/cash-book/opening-balance")
async def save_opening_balance(data: dict):
    kms_year = data.get("kms_year")
    if not kms_year:
        raise HTTPException(status_code=400, detail="kms_year is required")
    doc = {"kms_year": kms_year, "cash": float(data.get("cash", 0)), "bank": float(data.get("bank", 0)), "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.opening_balances.update_one({"kms_year": kms_year}, {"$set": doc}, upsert=True)
    return doc


@router.get("/cash-book/categories")
async def get_cash_book_categories():
    cats = await db.cash_book_categories.find({}, {"_id": 0}).to_list(500)
    return cats


@router.post("/cash-book/categories")
async def add_cash_book_category(request: Request):
    data = await request.json()
    name = (data.get("name") or "").strip()
    cat_type = data.get("type", "")  # cash_jama, cash_nikasi, bank_jama, bank_nikasi
    if not name or not cat_type:
        raise HTTPException(status_code=400, detail="Name and type required")
    existing = await db.cash_book_categories.find_one({"name": name, "type": cat_type})
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    cat = {"id": str(uuid.uuid4()), "name": name, "type": cat_type, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.cash_book_categories.insert_one(cat)
    cat.pop('_id', None)
    return cat


@router.delete("/cash-book/categories/{cat_id}")
async def delete_cash_book_category(cat_id: str):
    result = await db.cash_book_categories.delete_one({"id": cat_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted", "id": cat_id}


@router.get("/cash-book/party-summary")
async def get_party_summary(kms_year: Optional[str] = None, season: Optional[str] = None, party_type: Optional[str] = None):
    """Get Tally-style party summary - total jama, nikasi, outstanding per party"""
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if party_type: query["party_type"] = party_type
    
    txns = await db.cash_transactions.find(query, {"_id": 0}).to_list(100000)
    
    # Group by category (party name)
    party_map = {}
    for t in txns:
        cat = t.get("category", "").strip()
        if not cat: continue
        if cat not in party_map:
            party_map[cat] = {"party_name": cat, "party_type": t.get("party_type", ""), "total_jama": 0, "total_nikasi": 0, "balance": 0, "txn_count": 0}
        if t.get("txn_type") == "jama":
            party_map[cat]["total_jama"] += t.get("amount", 0)
        else:
            party_map[cat]["total_nikasi"] += t.get("amount", 0)
        party_map[cat]["txn_count"] += 1
        # Update party_type if empty
        if not party_map[cat]["party_type"] and t.get("party_type"):
            party_map[cat]["party_type"] = t["party_type"]
    
    # Calculate balance and sort
    parties = []
    for p in party_map.values():
        p["total_jama"] = round(p["total_jama"], 2)
        p["total_nikasi"] = round(p["total_nikasi"], 2)
        p["balance"] = round(p["total_jama"] - p["total_nikasi"], 2)
        parties.append(p)
    
    parties.sort(key=lambda x: abs(x["balance"]), reverse=True)
    
    # Summary totals
    total_jama = round(sum(p["total_jama"] for p in parties), 2)
    total_nikasi = round(sum(p["total_nikasi"] for p in parties), 2)
    total_outstanding = round(sum(p["balance"] for p in parties if p["balance"] != 0), 2)
    settled_count = sum(1 for p in parties if p["balance"] == 0)
    pending_count = sum(1 for p in parties if p["balance"] != 0)
    
    return {
        "parties": parties,
        "summary": {
            "total_parties": len(parties),
            "settled_count": settled_count,
            "pending_count": pending_count,
            "total_jama": total_jama,
            "total_nikasi": total_nikasi,
            "total_outstanding": total_outstanding
        }
    }


@router.get("/cash-book/party-summary/pdf")
async def export_party_summary_pdf(kms_year: Optional[str] = None, season: Optional[str] = None, party_type: Optional[str] = None):
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet
    from io import BytesIO
    
    result = await get_party_summary(kms_year, season, party_type)
    parties = result["parties"]
    summary = result["summary"]
    
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=30, rightMargin=30, topMargin=30, bottomMargin=30)
    styles = getSampleStyleSheet()
    elements = []
    
    # Title
    elements.append(Paragraph("Party Summary / पार्टी सारांश", styles['Title']))
    filter_text = ""
    if party_type: filter_text += f"Party Type: {party_type} | "
    if kms_year: filter_text += f"Year: {kms_year} | "
    if season: filter_text += f"Season: {season}"
    if filter_text: elements.append(Paragraph(filter_text, styles['Normal']))
    elements.append(Spacer(1, 12))
    
    # Summary cards
    sum_data = [
        ['Total Parties', 'Settled (0 Balance)', 'Pending', 'Total Jama', 'Total Nikasi', 'Outstanding'],
        [str(summary['total_parties']), str(summary['settled_count']), str(summary['pending_count']),
         f"Rs.{summary['total_jama']:,.2f}", f"Rs.{summary['total_nikasi']:,.2f}", f"Rs.{summary['total_outstanding']:,.2f}"]
    ]
    t = RLTable(sum_data, colWidths=[80, 90, 60, 90, 90, 90])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1a365d')), ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'), ('FONTSIZE', (0,0), (-1,-1), 8),
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey), ('ALIGN', (3,0), (-1,-1), 'RIGHT'),
    ]))
    elements.append(t); elements.append(Spacer(1, 16))
    
    # Party table
    data = [['#', 'Party Name', 'Party Type', 'Jama (Rs)', 'Nikasi (Rs)', 'Balance (Rs)', 'Txns', 'Status']]
    for i, p in enumerate(parties, 1):
        status = 'Settled' if p['balance'] == 0 else 'Pending'
        data.append([str(i), p['party_name'], p['party_type'], f"{p['total_jama']:,.2f}", f"{p['total_nikasi']:,.2f}",
                      f"{p['balance']:,.2f}", str(p['txn_count']), status])
    
    table = RLTable(data, colWidths=[25, 95, 70, 75, 75, 75, 35, 50], repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1a365d')), ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'), ('FONTSIZE', (0,0), (-1,-1), 7),
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
        ('ALIGN', (3,0), (5,-1), 'RIGHT'), ('ALIGN', (6,0), (6,-1), 'CENTER'),
    ]))
    # Color rows based on status
    for i, p in enumerate(parties, 1):
        if p['balance'] == 0:
            table.setStyle(TableStyle([('BACKGROUND', (0,i), (-1,i), colors.HexColor('#f0fff4'))]))
        elif p['balance'] < 0:
            table.setStyle(TableStyle([('BACKGROUND', (0,i), (-1,i), colors.HexColor('#fff5f5'))]))
    
    elements.append(table)
    doc.build(elements)
    
    from starlette.responses import Response
    return Response(content=buf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=party_summary_{datetime.now().strftime('%Y%m%d')}.pdf"})


@router.get("/cash-book/party-summary/excel")
async def export_party_summary_excel(kms_year: Optional[str] = None, season: Optional[str] = None, party_type: Optional[str] = None):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO
    
    result = await get_party_summary(kms_year, season, party_type)
    parties = result["parties"]
    summary = result["summary"]
    
    wb = Workbook(); ws = wb.active; ws.title = "Party Summary"
    hf = PatternFill(start_color="1a365d", end_color="1a365d", fill_type="solid")
    hfont = Font(color="FFFFFF", bold=True, size=9)
    tb = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
    
    ws.merge_cells('A1:H1'); ws['A1'] = "Party Summary / पार्टी सारांश"
    ws['A1'].font = Font(bold=True, size=14); ws['A1'].alignment = Alignment(horizontal='center')
    
    # Summary
    ws.cell(row=3, column=1, value="Total Parties").font = Font(bold=True)
    ws.cell(row=3, column=2, value=summary['total_parties'])
    ws.cell(row=3, column=3, value="Settled").font = Font(bold=True)
    ws.cell(row=3, column=4, value=summary['settled_count'])
    ws.cell(row=3, column=5, value="Pending").font = Font(bold=True)
    ws.cell(row=3, column=6, value=summary['pending_count'])
    ws.cell(row=4, column=1, value="Total Outstanding").font = Font(bold=True, color="FF0000")
    ws.cell(row=4, column=2, value=summary['total_outstanding']).number_format = '#,##0.00'
    
    # Headers
    row = 6
    for col, h in enumerate(['#', 'Party Name', 'Party Type', 'Jama (Rs)', 'Nikasi (Rs)', 'Balance (Rs)', 'Transactions', 'Status'], 1):
        c = ws.cell(row=row, column=col, value=h); c.fill = hf; c.font = hfont; c.border = tb; c.alignment = Alignment(horizontal='center')
    
    settled_fill = PatternFill(start_color="f0fff4", end_color="f0fff4", fill_type="solid")
    pending_fill = PatternFill(start_color="fff5f5", end_color="fff5f5", fill_type="solid")
    
    for i, p in enumerate(parties, 1):
        row += 1
        status = 'Settled' if p['balance'] == 0 else 'Pending'
        fill = settled_fill if p['balance'] == 0 else pending_fill if p['balance'] < 0 else None
        for col, v in enumerate([i, p['party_name'], p['party_type'], p['total_jama'], p['total_nikasi'], p['balance'], p['txn_count'], status], 1):
            c = ws.cell(row=row, column=col, value=v); c.border = tb
            if col in [4,5,6]: c.number_format = '#,##0.00'; c.alignment = Alignment(horizontal='right')
            if fill: c.fill = fill
    
    for letter in ['A','B','C','D','E','F','G','H']:
        ws.column_dimensions[letter].width = 16
    ws.column_dimensions['A'].width = 6
    ws.column_dimensions['B'].width = 22
    
    buf = BytesIO(); wb.save(buf); buf.seek(0)
    from starlette.responses import Response
    return Response(content=buf.getvalue(),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename=party_summary_{datetime.now().strftime('%Y%m%d')}.xlsx"})


@router.post("/cash-book/migrate-ledger-entries")
async def migrate_ledger_entries():
    """Migrate old local_party, truck, agent, diesel entries to cash_transactions"""
    migrated = {"local_party_debit": 0, "local_party_payment": 0, "diesel_payment": 0, "total": 0}
    
    # 1. Migrate local_party debit entries (purchase side - Jama)
    lp_debits = await db.local_party_accounts.find({"txn_type": "debit"}, {"_id": 0}).to_list(50000)
    for t in lp_debits:
        existing = await db.cash_transactions.find_one({"linked_local_party_id": t["id"], "txn_type": "jama"})
        if not existing:
            cb = {
                "id": str(uuid.uuid4()), "date": t.get("date", ""),
                "account": "ledger", "txn_type": "jama",
                "category": t.get("party_name", ""), "party_type": "Local Party",
                "description": f"Purchase: {t.get('party_name','')} - {t.get('description','')} Rs.{t.get('amount',0)}",
                "amount": round(t.get("amount", 0), 2),
                "reference": f"lp_migrate:{t['id'][:8]}",
                "kms_year": t.get("kms_year", ""), "season": t.get("season", ""),
                "created_by": "migration", "linked_local_party_id": t["id"],
                "created_at": t.get("created_at", datetime.now(timezone.utc).isoformat()),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.cash_transactions.insert_one(cb)
            migrated["local_party_debit"] += 1
    
    # 2. Migrate local_party payment entries that don't have linked cash_transactions
    lp_payments = await db.local_party_accounts.find({"txn_type": "payment"}, {"_id": 0}).to_list(50000)
    for t in lp_payments:
        existing = await db.cash_transactions.find_one({"linked_local_party_id": t["id"], "txn_type": "nikasi"})
        if not existing:
            cb = {
                "id": str(uuid.uuid4()), "date": t.get("date", ""),
                "account": "cash", "txn_type": "nikasi",
                "category": t.get("party_name", ""), "party_type": "Local Party",
                "description": f"Local Party Payment: {t.get('party_name','')} - Rs.{t.get('amount',0)}",
                "amount": round(t.get("amount", 0), 2),
                "reference": f"lp_pay_migrate:{t['id'][:8]}",
                "kms_year": t.get("kms_year", ""), "season": t.get("season", ""),
                "created_by": "migration", "linked_local_party_id": t["id"],
                "created_at": t.get("created_at", datetime.now(timezone.utc).isoformat()),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.cash_transactions.insert_one(cb)
            migrated["local_party_payment"] += 1
    
    # 3. Migrate diesel payment entries that don't have linked cash_transactions
    diesel_payments = await db.diesel_accounts.find({"txn_type": "payment"}, {"_id": 0}).to_list(50000)
    for t in diesel_payments:
        existing = await db.cash_transactions.find_one({"linked_diesel_payment_id": t["id"]})
        if not existing:
            pump = await db.diesel_pumps.find_one({"id": t.get("pump_id")}, {"_id": 0})
            pump_name = pump["name"] if pump else t.get("pump_id", "")
            cb = {
                "id": str(uuid.uuid4()), "date": t.get("date", ""),
                "account": "cash", "txn_type": "nikasi",
                "category": pump_name, "party_type": "Diesel",
                "description": f"Diesel Payment: {pump_name} - Rs.{t.get('amount',0)}",
                "amount": round(t.get("amount", 0), 2),
                "reference": f"diesel_migrate:{t['id'][:8]}",
                "kms_year": t.get("kms_year", ""), "season": t.get("season", ""),
                "created_by": "migration", "linked_diesel_payment_id": t["id"],
                "created_at": t.get("created_at", datetime.now(timezone.utc).isoformat()),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.cash_transactions.insert_one(cb)
            migrated["diesel_payment"] += 1
    
    # 4. Update existing cash_transactions that have old-style categories
    # Extract party name from description and update category
    import re
    old_style = await db.cash_transactions.find(
        {"category": {"$in": ["Local Party Payment", "Truck Payment", "Agent Payment", "Diesel Payment"]}},
        {"_id": 0}
    ).to_list(50000)
    for t in old_style:
        party_name = t.get("category", "")
        pt = ""
        desc = t.get("description", "")
        if t["category"] == "Local Party Payment":
            pt = "Local Party"
            m = re.search(r"Local Party Payment: (.+?) -", desc)
            if m: party_name = m.group(1).strip()
        elif t["category"] == "Truck Payment":
            pt = "Truck"
            m = re.search(r"Truck Payment: (.+?) -", desc) or re.search(r"Truck Payment: (.+?) \(", desc)
            if m: party_name = m.group(1).strip()
        elif t["category"] == "Agent Payment":
            pt = "Agent"
            m = re.search(r"Agent Payment: (.+?) -", desc) or re.search(r"Agent Payment: (.+?) \(", desc)
            if m: party_name = m.group(1).strip()
        elif t["category"] == "Diesel Payment":
            pt = "Diesel"
            m = re.search(r"Diesel Payment: (.+?) -", desc)
            if m: party_name = m.group(1).strip()
        await db.cash_transactions.update_one(
            {"id": t["id"]},
            {"$set": {"category": party_name, "party_type": pt}}
        )
    
    # Also set party_type for entries that have it empty
    await db.cash_transactions.update_many(
        {"party_type": {"$exists": False}},
        {"$set": {"party_type": ""}}
    )
    
    migrated["old_categories_fixed"] = len(old_style)
    migrated["total"] = migrated["local_party_debit"] + migrated["local_party_payment"] + migrated["diesel_payment"] + len(old_style)
    return {"success": True, "migrated": migrated}


@router.get("/cash-book/excel")
async def export_cash_book_excel(kms_year: Optional[str] = None, season: Optional[str] = None,
                                  account: Optional[str] = None):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO
    
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if account: query["account"] = account
    txns = await db.cash_transactions.find(query, {"_id": 0}).sort("date", 1).to_list(10000)
    summary = await get_cash_book_summary(kms_year=kms_year, season=season)
    
    wb = Workbook(); ws = wb.active; ws.title = "Cash Book"
    hf = PatternFill(start_color="1a365d", end_color="1a365d", fill_type="solid")
    hfont = Font(bold=True, color="FFFFFF", size=10)
    tb = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
    
    title = "Daily Cash Book / रोज़नामचा"
    if kms_year: title += f" - KMS {kms_year}"
    ws.merge_cells('A1:J1'); ws['A1'] = title; ws['A1'].font = Font(bold=True, size=14); ws['A1'].alignment = Alignment(horizontal='center')
    
    # Summary section
    ws.cell(row=3, column=1, value="Summary").font = Font(bold=True, size=11)
    for col, h in enumerate(['', 'Jama (In)', 'Nikasi (Out)', 'Balance'], 1):
        c = ws.cell(row=4, column=col, value=h); c.fill = hf; c.font = hfont; c.border = tb
    for col, v in enumerate(['Cash (नकद)', summary['cash_in'], summary['cash_out'], summary['cash_balance']], 1):
        c = ws.cell(row=5, column=col, value=v); c.border = tb
        if col >= 2: c.alignment = Alignment(horizontal='right'); c.number_format = '#,##0.00'
    for col, v in enumerate(['Bank (बैंक)', summary['bank_in'], summary['bank_out'], summary['bank_balance']], 1):
        c = ws.cell(row=6, column=col, value=v); c.border = tb
        if col >= 2: c.alignment = Alignment(horizontal='right'); c.number_format = '#,##0.00'
    ws.cell(row=7, column=1, value="Total").font = Font(bold=True)
    ws.cell(row=7, column=4, value=summary['total_balance']).font = Font(bold=True)
    ws.cell(row=7, column=4).number_format = '#,##0.00'
    
    # Transactions
    row = 9
    ws.cell(row=row, column=1, value="Transactions").font = Font(bold=True, size=11)
    row += 1
    for col, h in enumerate(['Date', 'Account', 'Type', 'Party / पार्टी', 'Party Type', 'Description', 'Jama (₹)', 'Nikasi (₹)', 'Balance (₹)', 'Reference'], 1):
        c = ws.cell(row=row, column=col, value=h); c.fill = hf; c.font = hfont; c.border = tb; c.alignment = Alignment(horizontal='center')
    row += 1
    run_bal = 0
    for t in txns:
        jama = t['amount'] if t['txn_type'] == 'jama' else 0
        nikasi = t['amount'] if t['txn_type'] == 'nikasi' else 0
        run_bal += jama - nikasi
        acct_label = 'Ledger' if t.get('account') == 'ledger' else ('Cash' if t.get('account') == 'cash' else 'Bank')
        for col, v in enumerate([t.get('date',''), acct_label,
            'Jama' if t.get('txn_type')=='jama' else 'Nikasi',
            t.get('category',''), t.get('party_type',''), t.get('description',''), jama, nikasi, round(run_bal, 2), t.get('reference','')], 1):
            c = ws.cell(row=row, column=col, value=v); c.border = tb
            if col in [7,8,9]: c.alignment = Alignment(horizontal='right'); c.number_format = '#,##0.00'
        row += 1
    
    ws.cell(row=row, column=1, value="TOTAL").font = Font(bold=True)
    ws.cell(row=row, column=7, value=round(sum(t['amount'] for t in txns if t['txn_type']=='jama'),2)).font = Font(bold=True)
    ws.cell(row=row, column=8, value=round(sum(t['amount'] for t in txns if t['txn_type']=='nikasi'),2)).font = Font(bold=True)
    ws.cell(row=row, column=9, value=round(run_bal, 2)).font = Font(bold=True)
    for letter in ['A','B','C','D','E','F','G','H','I','J']: ws.column_dimensions[letter].width = 16
    
    buffer = BytesIO(); wb.save(buffer); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=cash_book_{datetime.now().strftime('%Y%m%d')}.xlsx"})


@router.get("/cash-book/pdf")
async def export_cash_book_pdf(kms_year: Optional[str] = None, season: Optional[str] = None,
                                account: Optional[str] = None):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    from io import BytesIO
    
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if account: query["account"] = account
    txns = await db.cash_transactions.find(query, {"_id": 0}).sort("date", 1).to_list(10000)
    summary = await get_cash_book_summary(kms_year=kms_year, season=season)
    
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=30, rightMargin=30, topMargin=30, bottomMargin=30)
    elements = []; styles = getSampleStyleSheet()
    title = "Daily Cash Book"
    if kms_year: title += f" - KMS {kms_year}"
    elements.append(Paragraph(title, styles['Title'])); elements.append(Spacer(1, 12))
    
    # Summary table
    elements.append(Paragraph("Summary", styles['Heading2'])); elements.append(Spacer(1, 6))
    sdata = [['', 'Jama (In)', 'Nikasi (Out)', 'Balance'],
             ['Cash', summary['cash_in'], summary['cash_out'], summary['cash_balance']],
             ['Bank', summary['bank_in'], summary['bank_out'], summary['bank_balance']],
             ['Total', round(summary['cash_in']+summary['bank_in'],2), round(summary['cash_out']+summary['bank_out'],2), summary['total_balance']]]
    st = RLTable(sdata, colWidths=[80, 80, 80, 80])
    st.setStyle(TableStyle([('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1a365d')), ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('BACKGROUND', (0,1), (-1,-2), colors.white), ('TEXTCOLOR', (0,1), (-1,-2), colors.black),
        ('FONTSIZE', (0,0), (-1,-1), 8), ('ALIGN', (1,0), (-1,-1), 'RIGHT'), ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'), ('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold'),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor('#f0f0f0'))]))
    elements.append(st); elements.append(Spacer(1, 15))
    
    # Transactions table
    elements.append(Paragraph("Transactions", styles['Heading2'])); elements.append(Spacer(1, 6))
    data = [['Date', 'Account', 'Type', 'Party', 'Party Type', 'Description', 'Jama(Rs)', 'Nikasi(Rs)', 'Balance(Rs)']]
    tj = tn = 0
    run_bal = 0
    for t in txns:
        jama = t['amount'] if t['txn_type'] == 'jama' else 0
        nikasi = t['amount'] if t['txn_type'] == 'nikasi' else 0
        tj += jama; tn += nikasi
        run_bal += jama - nikasi
        acct_label = 'Ledger' if t.get('account') == 'ledger' else ('Cash' if t.get('account') == 'cash' else 'Bank')
        data.append([t.get('date',''), acct_label,
            'Jama' if t.get('txn_type')=='jama' else 'Nikasi',
            t.get('category','')[:14], t.get('party_type','')[:10], t.get('description','')[:16], jama if jama > 0 else '', nikasi if nikasi > 0 else '', round(run_bal, 2)])
    data.append(['TOTAL', '', '', '', '', '', round(tj,2), round(tn,2), round(run_bal,2)])
    
    table = RLTable(data, colWidths=[48, 38, 35, 62, 48, 85, 50, 50, 50], repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1a365d')), ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('BACKGROUND', (0,1), (-1,-2), colors.white), ('TEXTCOLOR', (0,1), (-1,-2), colors.black),
        ('FONTSIZE', (0,0), (-1,-1), 6.5), ('ALIGN', (6,0), (8,-1), 'RIGHT'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor('#f0f0f0')),
        ('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold'), ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
    ]))
    elements.append(table); doc.build(elements); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=cash_book_{datetime.now().strftime('%Y%m%d')}.pdf"})


