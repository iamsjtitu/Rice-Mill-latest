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
    data["balance"] = round(data["total"] - advance, 2)

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
    data["balance"] = round(data["total"] - advance, 2)

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
async def export_bp_sales_excel(product: str = "", kms_year: str = "", season: str = "",
    date_from: str = "", date_to: str = "", billing_date_from: str = "", billing_date_to: str = "",
    rst_no: str = "", vehicle_no: str = "", bill_from: str = "", party_name: str = "", destination: str = ""):
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
    if rst_no: query["rst_no"] = {"$regex": rst_no, "$options": "i"}
    if vehicle_no: query["vehicle_no"] = {"$regex": vehicle_no, "$options": "i"}
    if bill_from: query["bill_from"] = {"$regex": bill_from, "$options": "i"}
    if party_name: query["party_name"] = {"$regex": party_name, "$options": "i"}
    if destination: query["destination"] = {"$regex": destination, "$options": "i"}
    if date_from or date_to:
        query["date"] = {}
        if date_from: query["date"]["$gte"] = date_from
        if date_to: query["date"]["$lte"] = date_to
    if billing_date_from or billing_date_to:
        query["billing_date"] = {}
        if billing_date_from: query["billing_date"]["$gte"] = billing_date_from
        if billing_date_to: query["billing_date"]["$lte"] = billing_date_to
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

    title = f"{product or 'By-Product'} Sale Register"
    if kms_year: title += f" - FY {kms_year}"
    if season: title += f" ({season})"

    # Detect which optional columns have any data across ALL sales
    has_bill_no = any(s.get('bill_number') for s in sales)
    has_billing_date = any(s.get('billing_date') for s in sales)
    has_rst = any(s.get('rst_no') for s in sales)
    has_vehicle = any(s.get('vehicle_no') for s in sales)
    has_bill_from = any(s.get('bill_from') for s in sales)
    has_dest = any(s.get('destination') for s in sales)
    has_bags = any(s.get('bags', 0) for s in sales)
    has_tax = any(s.get('tax_amount', 0) for s in sales)
    has_cash = any(s.get('cash_paid', 0) for s in sales)
    has_diesel = any(s.get('diesel_paid', 0) for s in sales)
    has_adv = any(s.get('advance', 0) for s in sales)
    has_remark = any(s.get('remark') for s in sales)

    # Build dynamic headers and column config
    cols = [('S.No', 5, 'sno')]
    cols.append(('Date', 10, 'date'))
    if has_bill_no: cols.append(('Bill No', 10, 'bill_number'))
    if has_billing_date: cols.append(('Billing Date', 10, 'billing_date'))
    if has_rst: cols.append(('RST No', 8, 'rst_no'))
    if has_vehicle: cols.append(('Vehicle No', 12, 'vehicle_no'))
    if has_bill_from: cols.append(('Bill From', 14, 'bill_from'))
    cols.append(('Party Name', 16, 'party_name'))
    if has_dest: cols.append(('Destination', 14, 'destination'))
    cols.append(('N/W (Kg)', 10, 'net_weight_kg'))
    cols.append(('N/W (Qtl)', 9, 'net_weight_qtl'))
    if has_bags: cols.append(('Bags', 7, 'bags'))
    cols.append(('Rate/Qtl', 9, 'rate_per_qtl'))
    cols.append(('Amount', 12, 'amount'))
    if has_tax: cols.append(('Tax', 9, 'tax_amount'))
    cols.append(('Total', 12, 'total'))
    if has_cash: cols.append(('Cash', 10, 'cash_paid'))
    if has_diesel: cols.append(('Diesel', 10, 'diesel_paid'))
    if has_adv: cols.append(('Advance', 10, 'advance'))
    cols.append(('Balance', 12, 'balance'))
    if has_remark: cols.append(('Remark', 16, 'remark'))

    headers = [c[0] for c in cols]
    widths = [c[1] for c in cols]
    keys = [c[2] for c in cols]
    ncols = len(headers)

    row = 5
    # Merge header rows to match ncols
    last_col_letter = get_column_letter(ncols)
    ws.merge_cells(f'A1:{last_col_letter}1')
    c1 = ws.cell(row=1, column=1, value=company.upper())
    c1.font = Font(bold=True, size=14, color="1F4E79"); c1.alignment = Alignment(horizontal='center')
    if address:
        ws.merge_cells(f'A2:{last_col_letter}2')
        c2 = ws.cell(row=2, column=1, value=f"{address}  |  {phone}")
        c2.font = Font(size=9, color="666666"); c2.alignment = Alignment(horizontal='center')
    ws.merge_cells(f'A3:{last_col_letter}3')
    c3 = ws.cell(row=3, column=1, value=title)
    c3.font = Font(bold=True, size=12, color="FFFFFF")
    c3.fill = PatternFill(start_color="2E75B6", end_color="2E75B6", fill_type="solid")
    c3.alignment = Alignment(horizontal='center')

    for col_idx, h in enumerate(headers, 1):
        cell = ws.cell(row=row, column=col_idx, value=h)
        cell.font = Font(bold=True, size=9, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center', wrap_text=True)
        cell.border = border

    # Data rows
    t_nw = t_bags = t_amount = t_tax = t_total = t_cash = t_diesel = t_adv = t_bal = 0
    for idx, s in enumerate(sales):
        r = row + 1 + idx
        fill = alt_fill if idx % 2 == 0 else None
        t_nw += s.get('net_weight_kg', 0); t_bags += s.get('bags', 0)
        t_amount += s.get('amount', 0); t_tax += s.get('tax_amount', 0); t_total += s.get('total', 0)
        t_cash += s.get('cash_paid', 0); t_diesel += s.get('diesel_paid', 0)
        t_adv += s.get('advance', 0); t_bal += s.get('balance', 0)
        for col_idx, key in enumerate(keys, 1):
            if key == 'sno': val = idx + 1
            elif key == 'date': val = fmt_date(s.get('date', ''))
            elif key == 'billing_date': val = fmt_date(s.get('billing_date', ''))
            elif key == 'net_weight_qtl': val = round(s.get('net_weight_qtl', 0), 2)
            else: val = s.get(key, 0) if key in ('net_weight_kg','bags','rate_per_qtl','amount','tax_amount','total','cash_paid','diesel_paid','advance','balance') else s.get(key, '')
            cell = ws.cell(row=r, column=col_idx, value=val)
            cell.font = Font(size=9)
            cell.border = border
            if fill: cell.fill = fill
            if key in ('net_weight_kg','net_weight_qtl','bags','rate_per_qtl','amount','tax_amount','total','cash_paid','diesel_paid','advance','balance'):
                cell.alignment = Alignment(horizontal='right')
            if key in ('amount','tax_amount','total','cash_paid','diesel_paid','advance','balance'):
                cell.number_format = '#,##0.00'

    # Total row
    tr = row + 1 + len(sales)
    for col_idx in range(1, ncols + 1):
        cell = ws.cell(row=tr, column=col_idx)
        cell.border = border; cell.fill = total_fill; cell.font = Font(bold=True, size=9, color="FFFFFF")
    # Set total values in correct columns
    for col_idx, key in enumerate(keys, 1):
        if key == 'date': ws.cell(row=tr, column=col_idx, value="TOTAL")
        elif key == 'net_weight_kg': ws.cell(row=tr, column=col_idx, value=round(t_nw, 2)).alignment = Alignment(horizontal='right')
        elif key == 'net_weight_qtl': ws.cell(row=tr, column=col_idx, value=round(t_nw/100, 2)).alignment = Alignment(horizontal='right')
        elif key == 'bags': ws.cell(row=tr, column=col_idx, value=t_bags).alignment = Alignment(horizontal='right')
        elif key == 'amount': ws.cell(row=tr, column=col_idx, value=round(t_amount, 2)).alignment = Alignment(horizontal='right')
        elif key == 'tax_amount': ws.cell(row=tr, column=col_idx, value=round(t_tax, 2)).alignment = Alignment(horizontal='right')
        elif key == 'total': ws.cell(row=tr, column=col_idx, value=round(t_total, 2)).alignment = Alignment(horizontal='right')
        elif key == 'cash_paid': ws.cell(row=tr, column=col_idx, value=round(t_cash, 2)).alignment = Alignment(horizontal='right')
        elif key == 'diesel_paid': ws.cell(row=tr, column=col_idx, value=round(t_diesel, 2)).alignment = Alignment(horizontal='right')
        elif key == 'advance': ws.cell(row=tr, column=col_idx, value=round(t_adv, 2)).alignment = Alignment(horizontal='right')
        elif key == 'balance': ws.cell(row=tr, column=col_idx, value=round(t_bal, 2)).alignment = Alignment(horizontal='right')

    # Column widths
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
async def export_bp_sales_pdf(product: str = "", kms_year: str = "", season: str = "",
    date_from: str = "", date_to: str = "", billing_date_from: str = "", billing_date_to: str = "",
    rst_no: str = "", vehicle_no: str = "", bill_from: str = "", party_name: str = "", destination: str = ""):
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
    if rst_no: query["rst_no"] = {"$regex": rst_no, "$options": "i"}
    if vehicle_no: query["vehicle_no"] = {"$regex": vehicle_no, "$options": "i"}
    if bill_from: query["bill_from"] = {"$regex": bill_from, "$options": "i"}
    if party_name: query["party_name"] = {"$regex": party_name, "$options": "i"}
    if destination: query["destination"] = {"$regex": destination, "$options": "i"}
    if date_from or date_to:
        query["date"] = {}
        if date_from: query["date"]["$gte"] = date_from
        if date_to: query["date"]["$lte"] = date_to
    if billing_date_from or billing_date_to:
        query["billing_date"] = {}
        if billing_date_from: query["billing_date"]["$gte"] = billing_date_from
        if billing_date_to: query["billing_date"]["$lte"] = billing_date_to
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

    # Detect which optional columns have data
    has_bill_no = any(s.get('bill_number') for s in sales)
    has_rst = any(s.get('rst_no') for s in sales)
    has_vehicle = any(s.get('vehicle_no') for s in sales)
    has_bill_from = any(s.get('bill_from') for s in sales)
    has_dest = any(s.get('destination') for s in sales)
    has_bags = any(s.get('bags', 0) for s in sales)
    has_tax = any(s.get('tax_amount', 0) for s in sales)
    has_cash = any(s.get('cash_paid', 0) for s in sales)
    has_diesel = any(s.get('diesel_paid', 0) for s in sales)
    has_adv = any(s.get('advance', 0) for s in sales)

    # Build dynamic columns: (header, width, key)
    pdf_cols = [('S.No', 22, 'sno'), ('Date', 42, 'date')]
    if has_bill_no: pdf_cols.append(('Bill No', 40, 'bill_number'))
    if has_rst: pdf_cols.append(('RST', 28, 'rst_no'))
    if has_vehicle: pdf_cols.append(('Vehicle', 48, 'vehicle_no'))
    if has_bill_from: pdf_cols.append(('Bill From', 55, 'bill_from'))
    pdf_cols.append(('Party', 65, 'party_name'))
    if has_dest: pdf_cols.append(('Dest', 45, 'destination'))
    pdf_cols.append(('N/W(Kg)', 40, 'net_weight_kg'))
    if has_bags: pdf_cols.append(('Bags', 28, 'bags'))
    pdf_cols.append(('Rate/Q', 38, 'rate_per_qtl'))
    pdf_cols.append(('Amount', 50, 'amount'))
    if has_tax: pdf_cols.append(('Tax', 35, 'tax_amount'))
    pdf_cols.append(('Total', 50, 'total'))
    if has_cash: pdf_cols.append(('Cash', 38, 'cash_paid'))
    if has_diesel: pdf_cols.append(('Diesel', 38, 'diesel_paid'))
    if has_adv: pdf_cols.append(('Adv', 32, 'advance'))
    pdf_cols.append(('Balance', 48, 'balance'))

    headers = [c[0] for c in pdf_cols]
    col_widths = [c[1] for c in pdf_cols]
    col_keys = [c[2] for c in pdf_cols]

    data = [headers]
    t_nw = t_bags = t_amt = t_tax = t_total = t_cash = t_diesel = t_adv = t_bal = 0
    for idx, s in enumerate(sales):
        t_nw += s.get('net_weight_kg', 0); t_bags += s.get('bags', 0)
        t_amt += s.get('amount', 0); t_tax += s.get('tax_amount', 0); t_total += s.get('total', 0)
        t_cash += s.get('cash_paid', 0); t_diesel += s.get('diesel_paid', 0)
        t_adv += s.get('advance', 0); t_bal += s.get('balance', 0)
        row_data = []
        for key in col_keys:
            if key == 'sno': row_data.append(idx + 1)
            elif key == 'date': row_data.append(fmt_date(s.get('date', '')))
            elif key == 'party_name': row_data.append((s.get('party_name', '') or '')[:16])
            elif key == 'bill_from': row_data.append((s.get('bill_from', '') or '')[:14])
            elif key == 'destination': row_data.append((s.get('destination', '') or '')[:12])
            elif key in ('amount', 'tax_amount', 'total', 'balance'): row_data.append(f"{s.get(key, 0):,.0f}")
            else: row_data.append(s.get(key, 0) if key in ('net_weight_kg','bags','rate_per_qtl','cash_paid','diesel_paid','advance') else s.get(key, ''))
        data.append(row_data)

    # Total row
    total_row = []
    for key in col_keys:
        if key == 'date': total_row.append('TOTAL')
        elif key == 'net_weight_kg': total_row.append(round(t_nw, 0))
        elif key == 'bags': total_row.append(t_bags)
        elif key == 'amount': total_row.append(f"{t_amt:,.0f}")
        elif key == 'tax_amount': total_row.append(f"{t_tax:,.0f}")
        elif key == 'total': total_row.append(f"{t_total:,.0f}")
        elif key == 'cash_paid': total_row.append(round(t_cash, 0))
        elif key == 'diesel_paid': total_row.append(round(t_diesel, 0))
        elif key == 'advance': total_row.append(round(t_adv, 0))
        elif key == 'balance': total_row.append(f"{t_bal:,.0f}")
        else: total_row.append('')
    data.append(total_row)

    table = RLTable(data, colWidths=col_widths, repeatRows=1)

    # Find first numeric column index for right-align
    first_num = next((i for i, k in enumerate(col_keys) if k in ('net_weight_kg','bags','rate_per_qtl','amount','tax_amount','total','cash_paid','diesel_paid','advance','balance')), len(col_keys))

    nrows = len(data)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 7),
        ('FONTSIZE', (0, 1), (-1, -1), 7),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('ALIGN', (first_num, 1), (-1, -1), 'RIGHT'),
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

    # Payment summary footer - only show non-zero
    pay_parts = []
    if t_cash > 0: pay_parts.append(f"Cash: <font color='green'>{t_cash:,.0f}</font>")
    if t_diesel > 0: pay_parts.append(f"Diesel: <font color='#FF6600'>{t_diesel:,.0f}</font>")
    if t_adv > 0: pay_parts.append(f"Advance: <font color='#0066CC'>{t_adv:,.0f}</font>")
    pay_parts.append(f"<b>Balance: <font color='red'>{t_bal:,.0f}</font></b>")
    if pay_parts:
        elements.append(Spacer(1, 8))
        pay_style = ParagraphStyle('PaySummary', parent=styles['Normal'], fontSize=8,
            textColor=colors.HexColor('#1F4E79'))
        elements.append(Paragraph(f"<b>Payment Summary:</b>  {'  |  '.join(pay_parts)}", pay_style))

    # Generated date
    elements.append(Spacer(1, 4))
    gen_style = ParagraphStyle('Gen', parent=styles['Normal'], fontSize=7, textColor=colors.HexColor('#999999'))
    elements.append(Paragraph(f"Generated: {datetime.now().strftime('%d/%m/%Y %H:%M')}", gen_style))

    doc.build(elements)
    buffer.seek(0)
    fn = f"{(product or 'byproduct').lower().replace(' ','_')}_sale_register_{datetime.now().strftime('%Y%m%d')}.pdf"
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={fn}"})
