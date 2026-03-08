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

# ============ PHASE 4: REPORTING ============

@router.get("/reports/cmr-vs-dc")
async def report_cmr_vs_dc(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Compare milling output (CMR) vs DC allotment and deliveries"""
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    # Milling data
    milling = await db.milling_entries.find(query, {"_id": 0}).to_list(5000)
    total_paddy_milled = round(sum(e.get("paddy_input_qntl", 0) for e in milling), 2)
    total_rice_produced = round(sum(e.get("rice_qntl", 0) for e in milling), 2)
    total_frk_used = round(sum(e.get("frk_used_qntl", 0) for e in milling), 2)
    total_cmr = round(sum(e.get("cmr_delivery_qntl", 0) for e in milling), 2)
    avg_outturn = round(total_cmr / total_paddy_milled * 100, 2) if total_paddy_milled > 0 else 0
    # DC data
    dcs = await db.dc_entries.find(query, {"_id": 0}).to_list(1000)
    deliveries = await db.dc_deliveries.find(query, {"_id": 0}).to_list(5000)
    total_dc_allotted = round(sum(d.get("quantity_qntl", 0) for d in dcs), 2)
    total_dc_delivered = round(sum(d.get("quantity_qntl", 0) for d in deliveries), 2)
    total_dc_pending = round(total_dc_allotted - total_dc_delivered, 2)
    # Comparison
    cmr_surplus = round(total_cmr - total_dc_allotted, 2)
    delivery_gap = round(total_cmr - total_dc_delivered, 2)  # CMR ready but not delivered
    # By-product revenue
    bp_sales = await db.byproduct_sales.find(query, {"_id": 0}).to_list(5000)
    bp_revenue = round(sum(s.get("total_amount", 0) for s in bp_sales), 2)
    return {
        "milling": {"total_paddy_milled": total_paddy_milled, "total_rice_produced": total_rice_produced, "total_frk_used": total_frk_used, "total_cmr_ready": total_cmr, "avg_outturn_pct": avg_outturn, "milling_count": len(milling)},
        "dc": {"total_allotted": total_dc_allotted, "total_delivered": total_dc_delivered, "total_pending": total_dc_pending, "dc_count": len(dcs), "delivery_count": len(deliveries)},
        "comparison": {"cmr_vs_dc_allotted": cmr_surplus, "cmr_vs_dc_delivered": delivery_gap},
        "byproduct_revenue": bp_revenue
    }


@router.get("/reports/season-pnl")
async def report_season_pnl(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Season-wise Profit & Loss summary"""
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    # Income
    msp_payments = await db.msp_payments.find(query, {"_id": 0}).to_list(5000)
    msp_income = round(sum(p.get("amount", 0) for p in msp_payments), 2)
    bp_sales = await db.byproduct_sales.find(query, {"_id": 0}).to_list(5000)
    bp_income = round(sum(s.get("total_amount", 0) for s in bp_sales), 2)
    # Expenses
    frk_purchases = await db.frk_purchases.find(query, {"_id": 0}).to_list(5000)
    frk_cost = round(sum(p.get("total_amount", 0) for p in frk_purchases), 2)
    gunny_bags = await db.gunny_bags.find(query, {"_id": 0}).to_list(5000)
    gunny_cost = round(sum(g.get("amount", 0) for g in gunny_bags if g.get("txn_type") == "in"), 2)
    cash_txns = await db.cash_transactions.find(query, {"_id": 0}).to_list(10000)
    cash_expenses = round(sum(t.get("amount", 0) for t in cash_txns if t.get("txn_type") == "nikasi"), 2)
    cash_income_other = round(sum(t.get("amount", 0) for t in cash_txns if t.get("txn_type") == "jama"), 2)
    # Truck/Agent payments from mill entries
    entries = await db.mill_entries.find(query, {"_id": 0}).to_list(10000)
    truck_payments = round(sum(e.get("tp_paid", 0) for e in entries), 2)
    agent_payments = round(sum(e.get("agent_paid", 0) for e in entries), 2)
    total_income = round(msp_income + bp_income + cash_income_other, 2)
    total_expenses = round(frk_cost + gunny_cost + cash_expenses + truck_payments + agent_payments, 2)
    net_pnl = round(total_income - total_expenses, 2)
    return {
        "income": {"msp_payments": msp_income, "byproduct_sales": bp_income, "cash_book_jama": cash_income_other, "total": total_income},
        "expenses": {"frk_purchases": frk_cost, "gunny_bags": gunny_cost, "cash_book_nikasi": cash_expenses, "truck_payments": truck_payments, "agent_payments": agent_payments, "total": total_expenses},
        "net_pnl": net_pnl, "profit": net_pnl >= 0
    }


@router.get("/reports/cmr-vs-dc/excel")
async def export_cmr_vs_dc_excel(kms_year: Optional[str] = None, season: Optional[str] = None):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO
    data = await report_cmr_vs_dc(kms_year=kms_year, season=season)
    wb = Workbook(); ws = wb.active; ws.title = "CMR vs DC"
    hf = PatternFill(start_color="1a365d", end_color="1a365d", fill_type="solid")
    hfont = Font(bold=True, color="FFFFFF", size=10)
    tb = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
    title = "CMR vs DC Report"
    if kms_year: title += f" - KMS {kms_year}"
    ws.merge_cells('A1:D1'); ws['A1'] = title; ws['A1'].font = Font(bold=True, size=14); ws['A1'].alignment = Alignment(horizontal='center')
    # Milling
    ws.cell(row=3, column=1, value="MILLING OUTPUT").font = Font(bold=True, size=11, color="2563eb")
    items = [("Paddy Milled (Q)", data["milling"]["total_paddy_milled"]), ("Rice Produced (Q)", data["milling"]["total_rice_produced"]),
             ("FRK Used (Q)", data["milling"]["total_frk_used"]), ("CMR Ready (Q)", data["milling"]["total_cmr_ready"]),
             ("Avg Outturn %", data["milling"]["avg_outturn_pct"]), ("Milling Count", data["milling"]["milling_count"])]
    for i, (label, val) in enumerate(items, 4):
        ws.cell(row=i, column=1, value=label).border = tb
        c = ws.cell(row=i, column=2, value=val); c.border = tb; c.alignment = Alignment(horizontal='right')
    # DC
    row = 11
    ws.cell(row=row, column=1, value="DC ALLOTMENT & DELIVERY").font = Font(bold=True, size=11, color="16a34a")
    items2 = [("DC Allotted (Q)", data["dc"]["total_allotted"]), ("DC Delivered (Q)", data["dc"]["total_delivered"]),
              ("DC Pending (Q)", data["dc"]["total_pending"]), ("Total DCs", data["dc"]["dc_count"]), ("Total Deliveries", data["dc"]["delivery_count"])]
    for i, (label, val) in enumerate(items2, row+1):
        ws.cell(row=i, column=1, value=label).border = tb
        c = ws.cell(row=i, column=2, value=val); c.border = tb; c.alignment = Alignment(horizontal='right')
    # Comparison
    row = 18
    ws.cell(row=row, column=1, value="COMPARISON").font = Font(bold=True, size=11, color="d97706")
    ws.cell(row=row+1, column=1, value="CMR vs DC Allotted").border = tb
    ws.cell(row=row+1, column=2, value=data["comparison"]["cmr_vs_dc_allotted"]).border = tb
    ws.cell(row=row+2, column=1, value="CMR vs DC Delivered").border = tb
    ws.cell(row=row+2, column=2, value=data["comparison"]["cmr_vs_dc_delivered"]).border = tb
    ws.cell(row=row+3, column=1, value="By-Product Revenue (₹)").border = tb
    ws.cell(row=row+3, column=2, value=data["byproduct_revenue"]).border = tb
    for letter in ['A','B','C','D']: ws.column_dimensions[letter].width = 22
    buffer = BytesIO(); wb.save(buffer); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=cmr_vs_dc_{datetime.now().strftime('%Y%m%d')}.xlsx"})


@router.get("/reports/cmr-vs-dc/pdf")
async def export_cmr_vs_dc_pdf(kms_year: Optional[str] = None, season: Optional[str] = None):
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    from io import BytesIO
    data = await report_cmr_vs_dc(kms_year=kms_year, season=season)
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=40, rightMargin=40, topMargin=30, bottomMargin=30)
    elements = []; styles = getSampleStyleSheet()
    elements.append(Paragraph("CMR vs DC Report", styles['Title'])); elements.append(Spacer(1, 12))
    rows = [['Metric', 'Value'],
        ['--- MILLING ---', ''], ['Paddy Milled (Q)', data['milling']['total_paddy_milled']], ['Rice Produced (Q)', data['milling']['total_rice_produced']],
        ['FRK Used (Q)', data['milling']['total_frk_used']], ['CMR Ready (Q)', data['milling']['total_cmr_ready']], ['Outturn %', data['milling']['avg_outturn_pct']],
        ['--- DC ---', ''], ['DC Allotted (Q)', data['dc']['total_allotted']], ['DC Delivered (Q)', data['dc']['total_delivered']], ['DC Pending (Q)', data['dc']['total_pending']],
        ['--- COMPARISON ---', ''], ['CMR vs DC Allotted', data['comparison']['cmr_vs_dc_allotted']], ['CMR vs DC Delivered', data['comparison']['cmr_vs_dc_delivered']],
        ['By-Product Revenue', f"₹{data['byproduct_revenue']}"]]
    table = RLTable(rows, colWidths=[200, 150])
    table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#1a365d')),('TEXTCOLOR',(0,0),(-1,0),colors.white),
        ('FONTSIZE',(0,0),(-1,-1),9),('GRID',(0,0),(-1,-1),0.5,colors.grey),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('ALIGN',(1,0),(1,-1),'RIGHT')]))
    elements.append(table); doc.build(elements); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=cmr_vs_dc_{datetime.now().strftime('%Y%m%d')}.pdf"})


@router.get("/reports/season-pnl/excel")
async def export_season_pnl_excel(kms_year: Optional[str] = None, season: Optional[str] = None):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO
    data = await report_season_pnl(kms_year=kms_year, season=season)
    wb = Workbook(); ws = wb.active; ws.title = "Season P&L"
    hf = PatternFill(start_color="1a365d", end_color="1a365d", fill_type="solid")
    tb = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
    title = "Season P&L Report"
    if kms_year: title += f" - KMS {kms_year}"
    ws.merge_cells('A1:C1'); ws['A1'] = title; ws['A1'].font = Font(bold=True, size=14); ws['A1'].alignment = Alignment(horizontal='center')
    row = 3
    ws.cell(row=row, column=1, value="INCOME").font = Font(bold=True, size=11, color="16a34a")
    for label, val in [("MSP Payments", data["income"]["msp_payments"]), ("By-Product Sales", data["income"]["byproduct_sales"]),
                        ("Cash Book Jama", data["income"]["cash_book_jama"]), ("TOTAL INCOME", data["income"]["total"])]:
        row += 1
        ws.cell(row=row, column=1, value=label).border = tb
        c = ws.cell(row=row, column=2, value=val); c.border = tb; c.number_format = '#,##0.00'
        if label.startswith("TOTAL"): ws.cell(row=row, column=1).font = Font(bold=True); c.font = Font(bold=True)
    row += 2
    ws.cell(row=row, column=1, value="EXPENSES").font = Font(bold=True, size=11, color="dc2626")
    for label, val in [("FRK Purchases", data["expenses"]["frk_purchases"]), ("Gunny Bags", data["expenses"]["gunny_bags"]),
                        ("Cash Book Nikasi", data["expenses"]["cash_book_nikasi"]), ("Truck Payments", data["expenses"]["truck_payments"]),
                        ("Agent Payments", data["expenses"]["agent_payments"]), ("TOTAL EXPENSES", data["expenses"]["total"])]:
        row += 1
        ws.cell(row=row, column=1, value=label).border = tb
        c = ws.cell(row=row, column=2, value=val); c.border = tb; c.number_format = '#,##0.00'
        if label.startswith("TOTAL"): ws.cell(row=row, column=1).font = Font(bold=True); c.font = Font(bold=True)
    row += 2
    pnl_label = "NET PROFIT" if data["profit"] else "NET LOSS"
    ws.cell(row=row, column=1, value=pnl_label).font = Font(bold=True, size=12, color="16a34a" if data["profit"] else "dc2626")
    ws.cell(row=row, column=2, value=data["net_pnl"]).font = Font(bold=True, size=12)
    ws.cell(row=row, column=2).number_format = '#,##0.00'
    for letter in ['A','B','C']: ws.column_dimensions[letter].width = 22
    buffer = BytesIO(); wb.save(buffer); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=season_pnl_{datetime.now().strftime('%Y%m%d')}.xlsx"})


@router.get("/reports/season-pnl/pdf")
async def export_season_pnl_pdf(kms_year: Optional[str] = None, season: Optional[str] = None):
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    from io import BytesIO
    data = await report_season_pnl(kms_year=kms_year, season=season)
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=40, rightMargin=40, topMargin=30, bottomMargin=30)
    elements = []; styles = getSampleStyleSheet()
    elements.append(Paragraph("Season P&L Report", styles['Title'])); elements.append(Spacer(1, 12))
    # Income
    elements.append(Paragraph("INCOME", styles['Heading2'])); elements.append(Spacer(1, 4))
    idata = [['Source', 'Amount (₹)'], ['MSP Payments', data['income']['msp_payments']], ['By-Product Sales', data['income']['byproduct_sales']],
             ['Cash Book Jama', data['income']['cash_book_jama']], ['TOTAL', data['income']['total']]]
    it = RLTable(idata, colWidths=[200, 120])
    it.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#166534')),('TEXTCOLOR',(0,0),(-1,0),colors.white),
        ('FONTSIZE',(0,0),(-1,-1),9),('GRID',(0,0),(-1,-1),0.5,colors.grey),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('FONTNAME',(0,-1),(-1,-1),'Helvetica-Bold'),('ALIGN',(1,0),(1,-1),'RIGHT')]))
    elements.append(it); elements.append(Spacer(1, 12))
    # Expenses
    elements.append(Paragraph("EXPENSES", styles['Heading2'])); elements.append(Spacer(1, 4))
    edata = [['Category', 'Amount (₹)'], ['FRK Purchases', data['expenses']['frk_purchases']], ['Gunny Bags', data['expenses']['gunny_bags']],
             ['Cash Book Nikasi', data['expenses']['cash_book_nikasi']], ['Truck Payments', data['expenses']['truck_payments']],
             ['Agent Payments', data['expenses']['agent_payments']], ['TOTAL', data['expenses']['total']]]
    et = RLTable(edata, colWidths=[200, 120])
    et.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#991b1b')),('TEXTCOLOR',(0,0),(-1,0),colors.white),
        ('FONTSIZE',(0,0),(-1,-1),9),('GRID',(0,0),(-1,-1),0.5,colors.grey),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('FONTNAME',(0,-1),(-1,-1),'Helvetica-Bold'),('ALIGN',(1,0),(1,-1),'RIGHT')]))
    elements.append(et); elements.append(Spacer(1, 15))
    # Net P&L
    pnl_color = colors.HexColor('#166534') if data['profit'] else colors.HexColor('#991b1b')
    pdata = [['NET ' + ('PROFIT' if data['profit'] else 'LOSS'), f"₹{data['net_pnl']}"]]
    pt = RLTable(pdata, colWidths=[200, 120])
    pt.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),pnl_color),('TEXTCOLOR',(0,0),(-1,0),colors.white),
        ('FONTSIZE',(0,0),(-1,0),14),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('ALIGN',(1,0),(1,0),'RIGHT')]))
    elements.append(pt); doc.build(elements); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=season_pnl_{datetime.now().strftime('%Y%m%d')}.pdf"})


