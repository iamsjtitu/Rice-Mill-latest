from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
from typing import Optional
from database import db
import uuid

router = APIRouter()

def fmt_date(d):
    if not d: return ""
    try:
        if "T" in str(d): d = str(d).split("T")[0]
        parts = str(d).split("-")
        if len(parts) == 3: return f"{parts[2]}/{parts[1]}/{parts[0]}"
    except: pass
    return str(d)


@router.get("/bp-sale-register")
async def get_bp_sales(product: str = "", kms_year: str = "", season: str = ""):
    query = {}
    if product: query["product"] = product
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    sales = await db.bp_sale_register.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return sales


@router.post("/bp-sale-register")
async def create_bp_sale(data: dict, username: str = "", role: str = ""):
    data["id"] = str(uuid.uuid4())[:12]
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_at"] = data["created_at"]
    data["created_by"] = username

    nw = float(data.get("net_weight_kg", 0) or 0)
    rate = float(data.get("rate_per_qtl", 0) or 0)
    nw_qtl = round(nw / 100, 4)
    amount = round(nw_qtl * rate, 2)
    data["net_weight_qtl"] = nw_qtl
    data["amount"] = amount

    tax_amount = 0
    if data.get("gst_percent"):
        gst = float(data["gst_percent"] or 0)
        tax_amount = round(amount * gst / 100, 2)
    data["tax_amount"] = tax_amount
    data["total"] = round(amount + tax_amount, 2)

    cash = float(data.get("cash_paid", 0) or 0)
    diesel = float(data.get("diesel_paid", 0) or 0)
    advance = float(data.get("advance", 0) or 0)
    data["cash_paid"] = cash
    data["diesel_paid"] = diesel
    data["advance"] = advance
    data["balance"] = round(data["total"] - cash - diesel - advance, 2)

    await db.bp_sale_register.insert_one({**data})
    data.pop("_id", None)
    return data


@router.put("/bp-sale-register/{sale_id}")
async def update_bp_sale(sale_id: str, data: dict, username: str = "", role: str = ""):
    existing = await db.bp_sale_register.find_one({"id": sale_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Sale not found")

    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_by"] = username

    nw = float(data.get("net_weight_kg", 0) or 0)
    rate = float(data.get("rate_per_qtl", 0) or 0)
    nw_qtl = round(nw / 100, 4)
    amount = round(nw_qtl * rate, 2)
    data["net_weight_qtl"] = nw_qtl
    data["amount"] = amount

    tax_amount = 0
    if data.get("gst_percent"):
        gst = float(data["gst_percent"] or 0)
        tax_amount = round(amount * gst / 100, 2)
    data["tax_amount"] = tax_amount
    data["total"] = round(amount + tax_amount, 2)

    cash = float(data.get("cash_paid", 0) or 0)
    diesel = float(data.get("diesel_paid", 0) or 0)
    advance = float(data.get("advance", 0) or 0)
    data["cash_paid"] = cash
    data["diesel_paid"] = diesel
    data["advance"] = advance
    data["balance"] = round(data["total"] - cash - diesel - advance, 2)

    data.pop("id", None)
    data.pop("_id", None)
    await db.bp_sale_register.update_one({"id": sale_id}, {"$set": data})
    return {"success": True}


@router.delete("/bp-sale-register/{sale_id}")
async def delete_bp_sale(sale_id: str, username: str = "", role: str = ""):
    result = await db.bp_sale_register.delete_one({"id": sale_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sale not found")
    return {"success": True}


@router.get("/bp-sale-register/suggestions/bill-from")
async def get_bill_from_suggestions():
    pipeline = [{"$group": {"_id": "$bill_from"}}, {"$sort": {"_id": 1}}]
    results = await db.bp_sale_register.aggregate(pipeline).to_list(500)
    return [r["_id"] for r in results if r["_id"]]


@router.get("/bp-sale-register/suggestions/party-name")
async def get_party_suggestions():
    pipeline = [{"$group": {"_id": "$party_name"}}, {"$sort": {"_id": 1}}]
    results = await db.bp_sale_register.aggregate(pipeline).to_list(500)
    return [r["_id"] for r in results if r["_id"]]


@router.get("/bp-sale-register/suggestions/destination")
async def get_destination_suggestions():
    pipeline = [{"$group": {"_id": "$destination"}}, {"$sort": {"_id": 1}}]
    results = await db.bp_sale_register.aggregate(pipeline).to_list(500)
    return [r["_id"] for r in results if r["_id"]]


@router.get("/bp-sale-register/export/excel")
async def export_bp_sales_excel(product: str = "", kms_year: str = "", season: str = ""):
    from io import BytesIO
    from openpyxl import Workbook
    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
    from openpyxl.utils import get_column_letter
    from fastapi.responses import Response
    from utils.export_helpers import COLORS

    query = {}
    if product: query["product"] = product
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    sales = await db.bp_sale_register.find(query, {"_id": 0}).sort("date", 1).to_list(10000)

    # Branding
    branding = await db.branding.find_one({}, {"_id": 0}) or {}
    company = branding.get("company_name", "Rice Mill")
    address = branding.get("address", "")
    phone = branding.get("phone", "")

    wb = Workbook(); ws = wb.active
    ws.title = f"{product or 'By-Product'} Sales"

    thin = Side(style='thin', color='000000')
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    alt_fill = PatternFill(start_color="D6E4F0", end_color="D6E4F0", fill_type="solid")
    total_fill = PatternFill(start_color="2E75B6", end_color="2E75B6", fill_type="solid")

    # Company header
    ws.merge_cells('A1:P1')
    c1 = ws.cell(row=1, column=1, value=company.upper())
    c1.font = Font(bold=True, size=14, color="1F4E79"); c1.alignment = Alignment(horizontal='center')
    if address:
        ws.merge_cells('A2:P2')
        c2 = ws.cell(row=2, column=1, value=f"{address}  |  {phone}")
        c2.font = Font(size=9, color="666666"); c2.alignment = Alignment(horizontal='center')

    # Title
    title = f"{product or 'By-Product'} Sale Register"
    if kms_year: title += f" - FY {kms_year}"
    if season: title += f" ({season})"
    ws.merge_cells('A3:P3')
    c3 = ws.cell(row=3, column=1, value=title)
    c3.font = Font(bold=True, size=12, color="FFFFFF")
    c3.fill = PatternFill(start_color="2E75B6", end_color="2E75B6", fill_type="solid")
    c3.alignment = Alignment(horizontal='center')

    # Headers
    headers = ['S.No', 'Date', 'Bill No', 'Billing Date', 'RST No', 'Vehicle No', 'Bill From',
               'Party Name', 'Destination', 'N/W (Kg)', 'N/W (Qtl)', 'Bags', 'Rate/Qtl',
               'Amount', 'Tax', 'Total']
    row = 5
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=row, column=col, value=h)
        cell.font = Font(bold=True, size=9, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center', wrap_text=True)
        cell.border = border

    # Data rows
    t_nw = t_bags = t_amount = t_tax = t_total = t_cash = t_diesel = t_adv = t_bal = 0
    for idx, s in enumerate(sales):
        r = row + 1 + idx
        fill = alt_fill if idx % 2 == 0 else None
        vals = [idx + 1, fmt_date(s.get('date', '')), s.get('bill_number', ''), fmt_date(s.get('billing_date', '')),
                s.get('rst_no', ''), s.get('vehicle_no', ''), s.get('bill_from', ''),
                s.get('party_name', ''), s.get('destination', ''),
                s.get('net_weight_kg', 0), round(s.get('net_weight_qtl', 0), 2), s.get('bags', 0),
                s.get('rate_per_qtl', 0), s.get('amount', 0), s.get('tax_amount', 0), s.get('total', 0)]
        t_nw += s.get('net_weight_kg', 0); t_bags += s.get('bags', 0)
        t_amount += s.get('amount', 0); t_tax += s.get('tax_amount', 0); t_total += s.get('total', 0)
        t_cash += s.get('cash_paid', 0); t_diesel += s.get('diesel_paid', 0)
        t_adv += s.get('advance', 0); t_bal += s.get('balance', 0)
        for col, v in enumerate(vals, 1):
            cell = ws.cell(row=r, column=col, value=v)
            cell.font = Font(size=9)
            cell.border = border
            if fill: cell.fill = fill
            if col >= 10: cell.alignment = Alignment(horizontal='right')
            if col in [14, 15, 16]: cell.number_format = '#,##0.00'

    # Total row
    tr = row + 1 + len(sales)
    ws.merge_cells(f'A{tr}:I{tr}')
    tc = ws.cell(row=tr, column=1, value="TOTAL")
    tc.font = Font(bold=True, size=10, color="FFFFFF"); tc.fill = total_fill; tc.alignment = Alignment(horizontal='right')
    for col in range(1, 17):
        ws.cell(row=tr, column=col).border = border
        ws.cell(row=tr, column=col).fill = total_fill
        ws.cell(row=tr, column=col).font = Font(bold=True, size=9, color="FFFFFF")
    ws.cell(row=tr, column=10, value=round(t_nw, 2)).alignment = Alignment(horizontal='right')
    ws.cell(row=tr, column=11, value=round(t_nw/100, 2)).alignment = Alignment(horizontal='right')
    ws.cell(row=tr, column=12, value=t_bags).alignment = Alignment(horizontal='right')
    ws.cell(row=tr, column=14, value=round(t_amount, 2)).alignment = Alignment(horizontal='right')
    ws.cell(row=tr, column=15, value=round(t_tax, 2)).alignment = Alignment(horizontal='right')
    ws.cell(row=tr, column=16, value=round(t_total, 2)).alignment = Alignment(horizontal='right')

    # Payment summary row
    pr = tr + 1
    ws.merge_cells(f'A{pr}:I{pr}')
    ws.cell(row=pr, column=1, value="PAYMENT SUMMARY").font = Font(bold=True, size=9, color="1F4E79")
    ws.cell(row=pr, column=10, value="Cash:").font = Font(bold=True, size=9)
    ws.cell(row=pr, column=11, value=round(t_cash, 2)).font = Font(bold=True, size=9, color="008000")
    ws.cell(row=pr, column=12, value="Diesel:").font = Font(bold=True, size=9)
    ws.cell(row=pr, column=13, value=round(t_diesel, 2)).font = Font(bold=True, size=9, color="FF6600")
    ws.cell(row=pr, column=14, value="Advance:").font = Font(bold=True, size=9)
    ws.cell(row=pr, column=15, value=round(t_adv, 2)).font = Font(bold=True, size=9, color="0066CC")
    ws.cell(row=pr, column=16, value=round(t_bal, 2)).font = Font(bold=True, size=9, color="CC0000")

    # Column widths
    widths = [5, 10, 10, 10, 8, 12, 14, 16, 14, 10, 9, 7, 9, 12, 9, 12]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.page_setup.orientation = 'landscape'
    ws.page_setup.fitToWidth = 1

    buffer = BytesIO(); wb.save(buffer); buffer.seek(0)
    fn = f"{(product or 'byproduct').lower().replace(' ','_')}_sale_register_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return Response(content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={fn}"})


@router.get("/bp-sale-register/export/pdf")
async def export_bp_sales_pdf(product: str = "", kms_year: str = "", season: str = ""):
    from io import BytesIO
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from fastapi.responses import Response

    query = {}
    if product: query["product"] = product
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    sales = await db.bp_sale_register.find(query, {"_id": 0}).sort("date", 1).to_list(10000)

    branding = await db.branding.find_one({}, {"_id": 0}) or {}
    company = branding.get("company_name", "Rice Mill")
    address = branding.get("address", "")
    phone = branding.get("phone", "")

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=15, rightMargin=15, topMargin=20, bottomMargin=20)
    elements = []
    styles = getSampleStyleSheet()

    # Company header
    company_style = ParagraphStyle('CompanyHeader', parent=styles['Title'], fontSize=14,
        textColor=colors.HexColor('#1F4E79'), spaceAfter=2, alignment=1)
    addr_style = ParagraphStyle('Addr', parent=styles['Normal'], fontSize=8,
        textColor=colors.HexColor('#666666'), spaceAfter=4, alignment=1)
    elements.append(Paragraph(company.upper(), company_style))
    if address:
        elements.append(Paragraph(f"{address}  |  {phone}", addr_style))

    # Title
    title = f"{product or 'By-Product'} Sale Register"
    if kms_year: title += f" - FY {kms_year}"
    if season: title += f" ({season})"
    title_style = ParagraphStyle('RegTitle', parent=styles['Heading2'], fontSize=11,
        textColor=colors.white, backColor=colors.HexColor('#2E75B6'), spaceAfter=8, alignment=1,
        borderPadding=(4, 4, 4, 4))
    elements.append(Paragraph(title, title_style))
    elements.append(Spacer(1, 6))

    # Table data
    headers = ['S.No', 'Date', 'Bill No', 'RST', 'Vehicle', 'Bill From', 'Party',
               'Dest', 'N/W(Kg)', 'Bags', 'Rate/Q', 'Amount', 'Tax', 'Total', 'Cash', 'Diesel', 'Adv', 'Bal']
    data = [headers]

    t_nw = t_bags = t_amt = t_tax = t_total = t_cash = t_diesel = t_adv = t_bal = 0
    for idx, s in enumerate(sales):
        t_nw += s.get('net_weight_kg', 0); t_bags += s.get('bags', 0)
        t_amt += s.get('amount', 0); t_tax += s.get('tax_amount', 0); t_total += s.get('total', 0)
        t_cash += s.get('cash_paid', 0); t_diesel += s.get('diesel_paid', 0)
        t_adv += s.get('advance', 0); t_bal += s.get('balance', 0)
        data.append([
            idx + 1, fmt_date(s.get('date', '')), s.get('bill_number', ''), s.get('rst_no', ''),
            s.get('vehicle_no', ''), (s.get('bill_from', '') or '')[:12], (s.get('party_name', '') or '')[:14],
            (s.get('destination', '') or '')[:10], s.get('net_weight_kg', 0), s.get('bags', 0),
            s.get('rate_per_qtl', 0), f"{s.get('amount', 0):,.0f}", f"{s.get('tax_amount', 0):,.0f}",
            f"{s.get('total', 0):,.0f}", s.get('cash_paid', 0), s.get('diesel_paid', 0),
            s.get('advance', 0), f"{s.get('balance', 0):,.0f}"
        ])

    # Total row
    data.append(['', 'TOTAL', '', '', '', '', '', '', round(t_nw, 0), t_bags, '',
                 f"{t_amt:,.0f}", f"{t_tax:,.0f}", f"{t_total:,.0f}",
                 round(t_cash, 0), round(t_diesel, 0), round(t_adv, 0), f"{t_bal:,.0f}"])

    col_widths = [22, 42, 40, 28, 48, 52, 60, 42, 38, 28, 35, 48, 35, 48, 35, 35, 30, 45]
    table = RLTable(data, colWidths=col_widths, repeatRows=1)

    nrows = len(data)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 7),
        ('FONTSIZE', (0, 1), (-1, -1), 7),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('ALIGN', (8, 1), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CCCCCC')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor('#EBF1F8')]),
        ('BACKGROUND', (0, nrows - 1), (-1, nrows - 1), colors.HexColor('#2E75B6')),
        ('TEXTCOLOR', (0, nrows - 1), (-1, nrows - 1), colors.white),
        ('FONTNAME', (0, nrows - 1), (-1, nrows - 1), 'Helvetica-Bold'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]
    table.setStyle(TableStyle(style_cmds))
    elements.append(table)

    # Payment summary footer
    elements.append(Spacer(1, 8))
    pay_style = ParagraphStyle('PaySummary', parent=styles['Normal'], fontSize=8,
        textColor=colors.HexColor('#1F4E79'))
    elements.append(Paragraph(
        f"<b>Payment Summary:</b>  Cash: <font color='green'>{t_cash:,.0f}</font>  |  "
        f"Diesel: <font color='#FF6600'>{t_diesel:,.0f}</font>  |  "
        f"Advance: <font color='#0066CC'>{t_adv:,.0f}</font>  |  "
        f"<b>Balance: <font color='red'>{t_bal:,.0f}</font></b>", pay_style))

    # Generated date
    elements.append(Spacer(1, 4))
    gen_style = ParagraphStyle('Gen', parent=styles['Normal'], fontSize=7, textColor=colors.HexColor('#999999'))
    elements.append(Paragraph(f"Generated: {datetime.now().strftime('%d/%m/%Y %H:%M')}", gen_style))

    doc.build(elements)
    buffer.seek(0)
    fn = f"{(product or 'byproduct').lower().replace(' ','_')}_sale_register_{datetime.now().strftime('%Y%m%d')}.pdf"
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={fn}"})
