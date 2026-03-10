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
    account: str  # "cash" or "bank"
    txn_type: str  # "jama" (credit/in) or "nikasi" (debit/out)
    category: str = ""
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
                                 category: Optional[str] = None, date_from: Optional[str] = None,
                                 date_to: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if account: query["account"] = account
    if txn_type: query["txn_type"] = txn_type
    if category: query["category"] = category
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
    ws.merge_cells('A1:I1'); ws['A1'] = title; ws['A1'].font = Font(bold=True, size=14); ws['A1'].alignment = Alignment(horizontal='center')
    
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
    for col, h in enumerate(['Date', 'Account', 'Type', 'Category', 'Description', 'Jama (₹)', 'Nikasi (₹)', 'Balance (₹)', 'Reference'], 1):
        c = ws.cell(row=row, column=col, value=h); c.fill = hf; c.font = hfont; c.border = tb; c.alignment = Alignment(horizontal='center')
    row += 1
    run_bal = 0
    for t in txns:
        jama = t['amount'] if t['txn_type'] == 'jama' else 0
        nikasi = t['amount'] if t['txn_type'] == 'nikasi' else 0
        run_bal += jama - nikasi
        for col, v in enumerate([t.get('date',''), 'Cash' if t.get('account')=='cash' else 'Bank',
            'Jama' if t.get('txn_type')=='jama' else 'Nikasi',
            t.get('category',''), t.get('description',''), jama, nikasi, round(run_bal, 2), t.get('reference','')], 1):
            c = ws.cell(row=row, column=col, value=v); c.border = tb
            if col in [6,7,8]: c.alignment = Alignment(horizontal='right'); c.number_format = '#,##0.00'
        row += 1
    
    ws.cell(row=row, column=1, value="TOTAL").font = Font(bold=True)
    ws.cell(row=row, column=6, value=round(sum(t['amount'] for t in txns if t['txn_type']=='jama'),2)).font = Font(bold=True)
    ws.cell(row=row, column=7, value=round(sum(t['amount'] for t in txns if t['txn_type']=='nikasi'),2)).font = Font(bold=True)
    ws.cell(row=row, column=8, value=round(run_bal, 2)).font = Font(bold=True)
    for letter in ['A','B','C','D','E','F','G','H','I']: ws.column_dimensions[letter].width = 16
    
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
    data = [['Date', 'Account', 'Type', 'Category', 'Description', 'Jama(Rs)', 'Nikasi(Rs)', 'Balance(Rs)', 'Ref']]
    tj = tn = 0
    run_bal = 0
    for t in txns:
        jama = t['amount'] if t['txn_type'] == 'jama' else 0
        nikasi = t['amount'] if t['txn_type'] == 'nikasi' else 0
        tj += jama; tn += nikasi
        run_bal += jama - nikasi
        data.append([t.get('date',''), 'Cash' if t.get('account')=='cash' else 'Bank',
            'Jama' if t.get('txn_type')=='jama' else 'Nikasi',
            t.get('category','')[:15], t.get('description','')[:18], jama if jama > 0 else '', nikasi if nikasi > 0 else '', round(run_bal, 2), t.get('reference','')[:10]])
    data.append(['TOTAL', '', '', '', '', round(tj,2), round(tn,2), round(run_bal,2), ''])
    
    table = RLTable(data, colWidths=[50, 40, 38, 65, 90, 52, 52, 52, 50], repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1a365d')), ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('BACKGROUND', (0,1), (-1,-2), colors.white), ('TEXTCOLOR', (0,1), (-1,-2), colors.black),
        ('FONTSIZE', (0,0), (-1,-1), 7), ('ALIGN', (5,0), (7,-1), 'RIGHT'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor('#f0f0f0')),
        ('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold'), ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
    ]))
    elements.append(table); doc.build(elements); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=cash_book_{datetime.now().strftime('%Y%m%d')}.pdf"})


