from fastapi import APIRouter, HTTPException
from typing import Optional
from datetime import datetime, timezone
from database import db
import uuid

router = APIRouter()

# ============ MILL PARTS MASTER ============

@router.post("/mill-parts")
async def create_mill_part(data: dict):
    doc = {
        "id": str(uuid.uuid4()),
        "name": data.get("name", "").strip(),
        "category": data.get("category", "General"),
        "unit": data.get("unit", "Pcs"),
        "min_stock": float(data.get("min_stock", 0)),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if not doc["name"]:
        raise HTTPException(status_code=400, detail="Part name is required")
    existing = await db.mill_parts.find_one({"name": {"$regex": f"^{doc['name']}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail="Part already exists")
    await db.mill_parts.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.get("/mill-parts")
async def get_mill_parts():
    items = await db.mill_parts.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    return items

@router.delete("/mill-parts/{part_id}")
async def delete_mill_part(part_id: str):
    result = await db.mill_parts.delete_one({"id": part_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"message": "Deleted", "id": part_id}

# ============ MILL PARTS STOCK TRANSACTIONS ============

@router.post("/mill-parts-stock")
async def create_stock_entry(data: dict):
    doc = {
        "id": str(uuid.uuid4()),
        "date": data.get("date", ""),
        "part_name": data.get("part_name", ""),
        "txn_type": data.get("txn_type", "in"),  # "in" or "used"
        "quantity": float(data.get("quantity", 0)),
        "rate": float(data.get("rate", 0)),
        "total_amount": round(float(data.get("quantity", 0)) * float(data.get("rate", 0)), 2),
        "party_name": data.get("party_name", ""),
        "bill_no": data.get("bill_no", ""),
        "remark": data.get("remark", ""),
        "kms_year": data.get("kms_year", ""),
        "season": data.get("season", ""),
        "created_by": data.get("created_by", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if not doc["part_name"] or doc["quantity"] <= 0:
        raise HTTPException(status_code=400, detail="Part name and quantity required")
    await db.mill_parts_stock.insert_one(doc)
    doc.pop("_id", None)

    # Auto-create local party account entry for purchases (txn_type=in) with party
    if doc["txn_type"] == "in" and doc["party_name"] and doc["total_amount"] > 0:
        lp = {
            "id": str(uuid.uuid4()),
            "date": doc["date"],
            "party_name": doc["party_name"],
            "txn_type": "debit",
            "amount": doc["total_amount"],
            "description": f"{doc['part_name']} x{doc['quantity']} @ Rs.{doc['rate']}",
            "source_type": "mill_part",
            "reference": f"mill_part:{doc['id'][:8]}",
            "kms_year": doc.get("kms_year", ""),
            "season": doc.get("season", ""),
            "created_by": doc.get("created_by", "system"),
            "linked_stock_id": doc["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.local_party_accounts.insert_one(lp)

    return doc

@router.get("/mill-parts-stock")
async def get_stock_entries(part_name: Optional[str] = None, txn_type: Optional[str] = None,
                            kms_year: Optional[str] = None, season: Optional[str] = None,
                            party_name: Optional[str] = None):
    query = {}
    if part_name: query["part_name"] = part_name
    if txn_type: query["txn_type"] = txn_type
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if party_name: query["party_name"] = {"$regex": party_name, "$options": "i"}
    items = await db.mill_parts_stock.find(query, {"_id": 0}).sort("date", -1).to_list(5000)
    return items

@router.delete("/mill-parts-stock/{entry_id}")
async def delete_stock_entry(entry_id: str):
    # Also remove linked local party entry
    await db.local_party_accounts.delete_many({"linked_stock_id": entry_id})
    result = await db.mill_parts_stock.delete_one({"id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"message": "Deleted", "id": entry_id}

@router.put("/mill-parts-stock/{entry_id}")
async def update_stock_entry(entry_id: str, data: dict):
    existing = await db.mill_parts_stock.find_one({"id": entry_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    update = {
        "date": data.get("date", existing.get("date", "")),
        "part_name": data.get("part_name", existing.get("part_name", "")),
        "txn_type": data.get("txn_type", existing.get("txn_type", "in")),
        "quantity": float(data.get("quantity", existing.get("quantity", 0))),
        "rate": float(data.get("rate", existing.get("rate", 0))),
        "party_name": data.get("party_name", existing.get("party_name", "")),
        "bill_no": data.get("bill_no", existing.get("bill_no", "")),
        "remark": data.get("remark", existing.get("remark", "")),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    update["total_amount"] = round(update["quantity"] * update["rate"], 2)
    await db.mill_parts_stock.update_one({"id": entry_id}, {"$set": update})
    # Update linked local party entry
    await db.local_party_accounts.delete_many({"linked_stock_id": entry_id})
    if update["txn_type"] == "in" and update["party_name"] and update["total_amount"] > 0:
        lp = {
            "id": str(uuid.uuid4()), "date": update["date"],
            "party_name": update["party_name"], "txn_type": "debit",
            "amount": update["total_amount"],
            "description": f"{update['part_name']} x{update['quantity']} @ Rs.{update['rate']}",
            "source_type": "mill_part",
            "reference": f"mill_part:{entry_id[:8]}",
            "kms_year": data.get("kms_year", existing.get("kms_year", "")),
            "season": data.get("season", existing.get("season", "")),
            "created_by": data.get("created_by", "system"), "linked_stock_id": entry_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.local_party_accounts.insert_one(lp)
    updated = await db.mill_parts_stock.find_one({"id": entry_id}, {"_id": 0})
    return updated

# ============ STOCK SUMMARY ============

@router.get("/mill-parts/summary")
async def get_stock_summary(kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    txns = await db.mill_parts_stock.find(query, {"_id": 0}).to_list(10000)
    parts = await db.mill_parts.find({}, {"_id": 0}).to_list(1000)

    summary = {}
    for p in parts:
        summary[p["name"]] = {"part_name": p["name"], "category": p.get("category", ""),
            "unit": p.get("unit", "Pcs"), "min_stock": p.get("min_stock", 0),
            "stock_in": 0, "stock_used": 0, "current_stock": 0,
            "total_purchase_amount": 0, "parties": {}}

    for t in txns:
        pn = t.get("part_name", "")
        if pn not in summary:
            summary[pn] = {"part_name": pn, "category": "", "unit": "Pcs", "min_stock": 0,
                "stock_in": 0, "stock_used": 0, "current_stock": 0,
                "total_purchase_amount": 0, "parties": {}}
        if t.get("txn_type") == "in":
            summary[pn]["stock_in"] += t.get("quantity", 0)
            summary[pn]["total_purchase_amount"] += t.get("total_amount", 0)
            party = t.get("party_name", "")
            if party:
                if party not in summary[pn]["parties"]:
                    summary[pn]["parties"][party] = {"qty": 0, "amount": 0}
                summary[pn]["parties"][party]["qty"] += t.get("quantity", 0)
                summary[pn]["parties"][party]["amount"] += t.get("total_amount", 0)
        else:
            summary[pn]["stock_used"] += t.get("quantity", 0)

    result = []
    for pn, s in summary.items():
        s["stock_in"] = round(s["stock_in"], 2)
        s["stock_used"] = round(s["stock_used"], 2)
        s["current_stock"] = round(s["stock_in"] - s["stock_used"], 2)
        s["total_purchase_amount"] = round(s["total_purchase_amount"], 2)
        s["parties"] = [{"name": k, **v} for k, v in s["parties"].items()]
        result.append(s)

    result.sort(key=lambda x: x["part_name"])
    return result

# ============ STOCK EXPORT ============

@router.get("/mill-parts/summary/excel")
async def export_stock_excel(kms_year: Optional[str] = None, season: Optional[str] = None):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from fastapi.responses import StreamingResponse
    import io

    summary = await get_stock_summary(kms_year, season)
    wb = Workbook()
    ws = wb.active
    ws.title = "Mill Parts Stock"
    ws.merge_cells('A1:G1')
    ws['A1'] = f"Mill Parts Stock Summary{' - ' + kms_year if kms_year else ''}"
    ws['A1'].font = Font(bold=True, size=14)

    headers = ['Part Name', 'Category', 'Unit', 'Stock In', 'Stock Used', 'Current Stock', 'Purchase Amount (₹)']
    hdr_fill = PatternFill(start_color='1a365d', end_color='1a365d', fill_type='solid')
    hdr_font = Font(bold=True, color='FFFFFF')
    for i, h in enumerate(headers, 1):
        c = ws.cell(row=3, column=i, value=h)
        c.fill = hdr_fill
        c.font = hdr_font

    for idx, s in enumerate(summary, 4):
        ws.cell(row=idx, column=1, value=s["part_name"])
        ws.cell(row=idx, column=2, value=s["category"])
        ws.cell(row=idx, column=3, value=s["unit"])
        ws.cell(row=idx, column=4, value=s["stock_in"])
        ws.cell(row=idx, column=5, value=s["stock_used"])
        ws.cell(row=idx, column=6, value=s["current_stock"])
        ws.cell(row=idx, column=7, value=s["total_purchase_amount"])

    for col in range(1, 8):
        ws.column_dimensions[chr(64 + col)].width = 18

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=mill_parts_stock_{datetime.now().strftime('%Y%m%d')}.xlsx"})

@router.get("/mill-parts/summary/pdf")
async def export_stock_pdf(kms_year: Optional[str] = None, season: Optional[str] = None):
    from fastapi.responses import StreamingResponse
    import io

    summary = await get_stock_summary(kms_year, season)
    try:
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Table as RTable, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=30, rightMargin=30)
        styles = getSampleStyleSheet()
        elements = [Paragraph(f"Mill Parts Stock Summary{' - ' + kms_year if kms_year else ''}", styles['Title']), Spacer(1, 12)]

        data = [['Part', 'Category', 'Unit', 'In', 'Used', 'Stock', 'Amount (₹)']]
        for s in summary:
            data.append([s["part_name"], s["category"], s["unit"], s["stock_in"], s["stock_used"], s["current_stock"], f"₹{s['total_purchase_amount']:,.0f}"])

        t = RTable(data, repeatRows=1)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a365d')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f0f0')]),
        ]))
        elements.append(t)
        doc.build(elements)
        buf.seek(0)
        return StreamingResponse(buf, media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=mill_parts_stock_{datetime.now().strftime('%Y%m%d')}.pdf"})
    except ImportError:
        # Fallback to simple text PDF
        from reportlab.pdfgen import canvas as pdfcanvas
        buf = io.BytesIO()
        c = pdfcanvas.Canvas(buf)
        c.setFont("Helvetica-Bold", 16)
        c.drawString(50, 780, "Mill Parts Stock Summary")
        y = 750
        c.setFont("Helvetica", 9)
        for s in summary:
            c.drawString(50, y, f"{s['part_name']} | In:{s['stock_in']} | Used:{s['stock_used']} | Stock:{s['current_stock']} | Amount: Rs.{s['total_purchase_amount']}")
            y -= 15
            if y < 50:
                c.showPage()
                y = 780
        c.save()
        buf.seek(0)
        return StreamingResponse(buf, media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=mill_parts_stock.pdf"})
