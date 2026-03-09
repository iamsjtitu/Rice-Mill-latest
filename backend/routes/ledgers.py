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

# ============ PHASE 5: CONSOLIDATED LEDGERS ============

@router.get("/reports/outstanding")
async def report_outstanding(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Outstanding Report - all pending payments/deliveries across modules"""
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season

    # DC pending deliveries
    dcs = await db.dc_entries.find(query, {"_id": 0}).to_list(1000)
    all_dels = await db.dc_deliveries.find(query, {"_id": 0}).to_list(5000)
    dc_outstanding = []
    for dc in dcs:
        delivered = round(sum(d.get("quantity_qntl", 0) for d in all_dels if d.get("dc_id") == dc["id"]), 2)
        pending = round(dc["quantity_qntl"] - delivered, 2)
        if pending > 0:
            dc_outstanding.append({"dc_number": dc.get("dc_number", ""), "allotted": dc["quantity_qntl"], "delivered": delivered, "pending": pending, "deadline": dc.get("deadline", ""), "rice_type": dc.get("rice_type", "")})
    dc_pending_total = round(sum(d["pending"] for d in dc_outstanding), 2)

    # MSP payment pending
    msp_payments = await db.msp_payments.find(query, {"_id": 0}).to_list(5000)
    total_delivered_qntl = round(sum(d.get("quantity_qntl", 0) for d in all_dels), 2)
    total_msp_paid_qty = round(sum(p.get("quantity_qntl", 0) for p in msp_payments), 2)
    total_msp_paid_amt = round(sum(p.get("amount", 0) for p in msp_payments), 2)
    msp_pending_qty = round(total_delivered_qntl - total_msp_paid_qty, 2)

    # Truck payment pending (entries with cash_paid < expected)
    entries = await db.mill_entries.find(query, {"_id": 0}).to_list(10000)
    truck_map = {}
    for e in entries:
        truck = e.get("truck_no", "Unknown")
        if truck not in truck_map:
            truck_map[truck] = {"truck_no": truck, "total_trips": 0, "total_qty_qntl": 0, "total_cash_paid": 0, "total_diesel_paid": 0}
        truck_map[truck]["total_trips"] += 1
        truck_map[truck]["total_qty_qntl"] = round(truck_map[truck]["total_qty_qntl"] + (e.get("mill_w", 0) / 100), 2)
        truck_map[truck]["total_cash_paid"] = round(truck_map[truck]["total_cash_paid"] + (e.get("cash_paid", 0)), 2)
        truck_map[truck]["total_diesel_paid"] = round(truck_map[truck]["total_diesel_paid"] + (e.get("diesel_paid", 0)), 2)

    # Agent summary
    agent_map = {}
    for e in entries:
        agent = e.get("agent_name", "Unknown")
        if not agent: agent = "Unknown"
        if agent not in agent_map:
            agent_map[agent] = {"agent_name": agent, "total_entries": 0, "total_qty_qntl": 0}
        agent_map[agent]["total_entries"] += 1
        agent_map[agent]["total_qty_qntl"] = round(agent_map[agent]["total_qty_qntl"] + (e.get("mill_w", 0) / 100), 2)

    # FRK purchase outstanding
    frk_purchases = await db.frk_purchases.find(query, {"_id": 0}).to_list(5000)
    frk_party_map = {}
    for p in frk_purchases:
        party = p.get("party_name", "Unknown")
        if party not in frk_party_map:
            frk_party_map[party] = {"party_name": party, "total_qty": 0, "total_amount": 0}
        frk_party_map[party]["total_qty"] = round(frk_party_map[party]["total_qty"] + (p.get("quantity_qntl", 0)), 2)
        frk_party_map[party]["total_amount"] = round(frk_party_map[party]["total_amount"] + (p.get("total_amount", 0)), 2)

    return {
        "dc_outstanding": {"items": dc_outstanding, "total_pending_qntl": dc_pending_total, "count": len(dc_outstanding)},
        "msp_outstanding": {"total_delivered_qntl": total_delivered_qntl, "total_paid_qty": total_msp_paid_qty, "total_paid_amount": total_msp_paid_amt, "pending_qty": msp_pending_qty},
        "trucks": list(truck_map.values()),
        "agents": list(agent_map.values()),
        "frk_parties": list(frk_party_map.values()),
    }


@router.get("/reports/party-ledger")
async def report_party_ledger(party_name: Optional[str] = None, party_type: Optional[str] = None,
                                kms_year: Optional[str] = None, season: Optional[str] = None):
    """Party Ledger - all transactions for a specific party or all parties"""
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season

    ledger = []

    # Paddy entries (Truck only - Agent payments come from Cash Book)
    entries = await db.mill_entries.find(query, {"_id": 0}).to_list(10000)
    # Paddy entries - Truck ledger (cash + diesel payments go here)
    if not party_type or party_type == "truck":
        for e in entries:
            truck = e.get("truck_no", "")
            if not truck: continue
            if party_name and truck.lower() != party_name.lower(): continue
            total_paid = round(e.get("cash_paid", 0) + e.get("diesel_paid", 0), 2)
            if total_paid > 0:
                ledger.append({"date": e.get("date", ""), "party_name": truck, "party_type": "Truck",
                    "description": f"Mandi: {e.get('mandi_name','')} | Cash: {e.get('cash_paid',0)} Diesel: {e.get('diesel_paid',0)}",
                    "debit": 0, "credit": total_paid, "ref": e.get("id", "")[:8]})

    # Cash Book categories → Party Ledger (auto)
    if not party_type or party_type == "cash_party":
        cash_query = dict(query)
        cash_txns = await db.cash_transactions.find(cash_query, {"_id": 0}).to_list(10000)
        for t in cash_txns:
            cat = (t.get("category") or "").strip()
            if not cat: continue
            # Skip system categories (Cash Payment, Diesel Payment etc.)
            if cat.lower() in ("cash payment", "diesel payment", "cash paid", "diesel", "cash paid (entry)", "diesel (entry)"): continue
            if party_name and cat.lower() != party_name.lower(): continue
            is_jama = t.get("txn_type") == "jama"
            ledger.append({"date": t.get("date", ""), "party_name": cat, "party_type": "Cash Party",
                "description": t.get("description", "") or f"{'Jama' if is_jama else 'Nikasi'}: ₹{t.get('amount',0)}",
                "debit": round(t.get("amount", 0), 2) if not is_jama else 0,
                "credit": round(t.get("amount", 0), 2) if is_jama else 0,
                "ref": t.get("id", "")[:8]})

    # FRK purchases
    if not party_type or party_type == "frk_party":
        frk_purchases = await db.frk_purchases.find(query, {"_id": 0}).to_list(5000)
        for p in frk_purchases:
            party = p.get("party_name", "")
            if not party: continue
            if party_name and party.lower() != party_name.lower(): continue
            ledger.append({"date": p.get("date", ""), "party_name": party, "party_type": "FRK Seller",
                "description": f"FRK: {p.get('quantity_qntl',0)}Q @ ₹{p.get('rate_per_qntl',0)}/Q",
                "debit": round(p.get("total_amount", 0), 2), "credit": 0, "ref": p.get("id", "")[:8]})

    # By-product sales
    if not party_type or party_type == "buyer":
        bp_sales = await db.byproduct_sales.find(query, {"_id": 0}).to_list(5000)
        for s in bp_sales:
            buyer = s.get("buyer_name", "")
            if not buyer: continue
            if party_name and buyer.lower() != party_name.lower(): continue
            ledger.append({"date": s.get("date", ""), "party_name": buyer, "party_type": "Buyer",
                "description": f"{(s.get('product','')).capitalize()}: {s.get('quantity_qntl',0)}Q @ ₹{s.get('rate_per_qntl',0)}/Q",
                "debit": 0, "credit": round(s.get("total_amount", 0), 2), "ref": s.get("id", "")[:8]})

    # Private Paddy Purchase (debit = purchase amount, credit = payment received)
    if not party_type or party_type == "pvt_paddy":
        pvt_paddy = await db.private_paddy.find(query, {"_id": 0}).to_list(5000)
        for p in pvt_paddy:
            party = p.get("party_name", "")
            if not party: continue
            if party_name and party.lower() != party_name.lower(): continue
            ledger.append({"date": p.get("date", ""), "party_name": party, "party_type": "Pvt Paddy",
                "description": f"Paddy Purchase: {p.get('final_qntl',0)}Q @ ₹{p.get('rate_per_qntl',0)}/Q = ₹{p.get('total_amount',0)}",
                "debit": round(p.get("total_amount", 0), 2), "credit": 0, "ref": p.get("id", "")[:8]})

    # Rice Sale (debit = 0, credit = sale amount)
    if not party_type or party_type == "rice_buyer":
        rice_sales = await db.rice_sales.find(query, {"_id": 0}).to_list(5000)
        for s in rice_sales:
            party = s.get("party_name", "")
            if not party: continue
            if party_name and party.lower() != party_name.lower(): continue
            ledger.append({"date": s.get("date", ""), "party_name": party, "party_type": "Rice Buyer",
                "description": f"Rice Sale: {s.get('quantity_qntl',0)}Q ({s.get('rice_type','')}) @ ₹{s.get('rate_per_qntl',0)}/Q = ₹{s.get('total_amount',0)}",
                "debit": 0, "credit": round(s.get("total_amount", 0), 2), "ref": s.get("id", "")[:8]})

    # Private Payments (received/paid)
    if not party_type or party_type in ("pvt_paddy", "rice_buyer", "pvt_payment"):
        pvt_payments = await db.private_payments.find(query if kms_year or season else {}, {"_id": 0}).to_list(5000)
        for pay in pvt_payments:
            pn = pay.get("party_name", "")
            if not pn: continue
            if party_name and pn.lower() != party_name.lower(): continue
            if pay.get("ref_type") == "paddy_purchase":
                if party_type and party_type not in ("pvt_paddy", "pvt_payment"): continue
                ledger.append({"date": pay.get("date", ""), "party_name": pn, "party_type": "Pvt Paddy",
                    "description": f"Payment: ₹{pay.get('amount',0)} ({pay.get('mode','cash')})",
                    "debit": 0, "credit": round(pay.get("amount", 0), 2), "ref": pay.get("id", "")[:8]})
            elif pay.get("ref_type") == "rice_sale":
                if party_type and party_type not in ("rice_buyer", "pvt_payment"): continue
                ledger.append({"date": pay.get("date", ""), "party_name": pn, "party_type": "Rice Buyer",
                    "description": f"Payment Received: ₹{pay.get('amount',0)} ({pay.get('mode','cash')})",
                    "debit": round(pay.get("amount", 0), 2), "credit": 0, "ref": pay.get("id", "")[:8]})

    ledger.sort(key=lambda x: x.get("date", ""), reverse=True)

    # Party list for filter
    parties = set()
    for item in ledger: parties.add((item["party_name"], item["party_type"]))
    party_list = [{"name": n, "type": t} for n, t in sorted(parties)]

    return {"ledger": ledger, "party_list": party_list, "total_debit": round(sum(l["debit"] for l in ledger), 2),
            "total_credit": round(sum(l["credit"] for l in ledger), 2)}


@router.get("/reports/outstanding/excel")
async def export_outstanding_excel(kms_year: Optional[str] = None, season: Optional[str] = None):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO
    data = await report_outstanding(kms_year=kms_year, season=season)
    wb = Workbook(); ws = wb.active; ws.title = "Outstanding Report"
    hf = PatternFill(start_color="1a365d", end_color="1a365d", fill_type="solid")
    hfont = Font(bold=True, color="FFFFFF", size=10)
    tb = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
    ws.merge_cells('A1:F1'); ws['A1'] = "Outstanding Report"; ws['A1'].font = Font(bold=True, size=14); ws['A1'].alignment = Alignment(horizontal='center')
    # DC Outstanding
    row = 3; ws.cell(row=row, column=1, value="DC PENDING DELIVERIES").font = Font(bold=True, size=11, color="dc2626"); row += 1
    for col, h in enumerate(['DC No', 'Allotted(Q)', 'Delivered(Q)', 'Pending(Q)', 'Deadline', 'Type'], 1):
        c = ws.cell(row=row, column=col, value=h); c.fill = hf; c.font = hfont; c.border = tb
    row += 1
    for d in data["dc_outstanding"]["items"]:
        for col, v in enumerate([d["dc_number"], d["allotted"], d["delivered"], d["pending"], d["deadline"], d["rice_type"]], 1):
            ws.cell(row=row, column=col, value=v).border = tb
        row += 1
    ws.cell(row=row, column=1, value="Total Pending").font = Font(bold=True)
    ws.cell(row=row, column=4, value=data["dc_outstanding"]["total_pending_qntl"]).font = Font(bold=True)
    # MSP Outstanding
    row += 2; ws.cell(row=row, column=1, value="MSP PAYMENT PENDING").font = Font(bold=True, size=11, color="d97706"); row += 1
    for label, val in [("Total Delivered (Q)", data["msp_outstanding"]["total_delivered_qntl"]), ("Paid Qty (Q)", data["msp_outstanding"]["total_paid_qty"]),
                        ("Paid Amount (₹)", data["msp_outstanding"]["total_paid_amount"]), ("Pending Qty (Q)", data["msp_outstanding"]["pending_qty"])]:
        ws.cell(row=row, column=1, value=label).border = tb; ws.cell(row=row, column=2, value=val).border = tb; row += 1
    # Trucks
    row += 1; ws.cell(row=row, column=1, value="TRUCK SUMMARY").font = Font(bold=True, size=11, color="2563eb"); row += 1
    for col, h in enumerate(['Truck No', 'Trips', 'Qty(Q)', 'Cash Paid', 'Diesel Paid'], 1):
        c = ws.cell(row=row, column=col, value=h); c.fill = hf; c.font = hfont; c.border = tb
    row += 1
    for t in data["trucks"]:
        for col, v in enumerate([t["truck_no"], t["total_trips"], t["total_qty_qntl"], t["total_cash_paid"], t["total_diesel_paid"]], 1):
            ws.cell(row=row, column=col, value=v).border = tb
        row += 1
    for letter in ['A','B','C','D','E','F']: ws.column_dimensions[letter].width = 18
    buffer = BytesIO(); wb.save(buffer); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=outstanding_{datetime.now().strftime('%Y%m%d')}.xlsx"})


@router.get("/reports/outstanding/pdf")
async def export_outstanding_pdf(kms_year: Optional[str] = None, season: Optional[str] = None):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    from io import BytesIO
    data = await report_outstanding(kms_year=kms_year, season=season)
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=30, rightMargin=30, topMargin=30, bottomMargin=30)
    elements = []; styles = getSampleStyleSheet()
    elements.append(Paragraph("Outstanding Report", styles['Title'])); elements.append(Spacer(1, 12))
    # DC pending
    elements.append(Paragraph("DC Pending Deliveries", styles['Heading2'])); elements.append(Spacer(1, 4))
    ddata = [['DC No', 'Allotted(Q)', 'Delivered(Q)', 'Pending(Q)', 'Deadline', 'Type']]
    for d in data["dc_outstanding"]["items"]:
        ddata.append([d["dc_number"], d["allotted"], d["delivered"], d["pending"], d["deadline"], d["rice_type"]])
    ddata.append(['TOTAL', '', '', data["dc_outstanding"]["total_pending_qntl"], '', ''])
    dt = RLTable(ddata, colWidths=[60, 60, 60, 60, 60, 50])
    dt.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#991b1b')),('TEXTCOLOR',(0,0),(-1,0),colors.white),('FONTSIZE',(0,0),(-1,-1),8),
        ('GRID',(0,0),(-1,-1),0.5,colors.grey),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('FONTNAME',(0,-1),(-1,-1),'Helvetica-Bold')]))
    elements.append(dt); elements.append(Spacer(1, 12))
    # MSP
    elements.append(Paragraph("MSP Payment Pending", styles['Heading2'])); elements.append(Spacer(1, 4))
    mdata = [['Metric', 'Value'], ['Delivered(Q)', data['msp_outstanding']['total_delivered_qntl']], ['Paid Qty(Q)', data['msp_outstanding']['total_paid_qty']],
             ['Paid Amount(₹)', data['msp_outstanding']['total_paid_amount']], ['Pending Qty(Q)', data['msp_outstanding']['pending_qty']]]
    mt = RLTable(mdata, colWidths=[150, 100])
    mt.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#92400e')),('TEXTCOLOR',(0,0),(-1,0),colors.white),('FONTSIZE',(0,0),(-1,-1),8),
        ('GRID',(0,0),(-1,-1),0.5,colors.grey),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold')]))
    elements.append(mt); doc.build(elements); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=outstanding_{datetime.now().strftime('%Y%m%d')}.pdf"})


@router.get("/reports/party-ledger/excel")
async def export_party_ledger_excel(party_name: Optional[str] = None, party_type: Optional[str] = None,
                                     kms_year: Optional[str] = None, season: Optional[str] = None):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO
    data = await report_party_ledger(party_name=party_name, party_type=party_type, kms_year=kms_year, season=season)
    wb = Workbook(); ws = wb.active; ws.title = "Party Ledger"
    hf = PatternFill(start_color="1a365d", end_color="1a365d", fill_type="solid")
    hfont = Font(bold=True, color="FFFFFF", size=10)
    tb = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
    title = "Party Ledger"
    if party_name: title += f" - {party_name}"
    ws.merge_cells('A1:G1'); ws['A1'] = title; ws['A1'].font = Font(bold=True, size=14); ws['A1'].alignment = Alignment(horizontal='center')
    for col, h in enumerate(['Date', 'Party', 'Type', 'Description', 'Debit(₹)', 'Credit(₹)', 'Ref'], 1):
        c = ws.cell(row=3, column=col, value=h); c.fill = hf; c.font = hfont; c.border = tb
    for i, l in enumerate(data["ledger"], 4):
        for col, v in enumerate([l["date"], l["party_name"], l["party_type"], l["description"], l["debit"] if l["debit"] > 0 else "", l["credit"] if l["credit"] > 0 else "", l["ref"]], 1):
            c = ws.cell(row=i, column=col, value=v); c.border = tb
            if col in [5, 6]: c.number_format = '#,##0.00'
    row = len(data["ledger"]) + 4
    ws.cell(row=row, column=1, value="TOTAL").font = Font(bold=True)
    ws.cell(row=row, column=5, value=data["total_debit"]).font = Font(bold=True)
    ws.cell(row=row, column=6, value=data["total_credit"]).font = Font(bold=True)
    for letter in ['A','B','C','D','E','F','G']: ws.column_dimensions[letter].width = 18
    buffer = BytesIO(); wb.save(buffer); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=party_ledger_{datetime.now().strftime('%Y%m%d')}.xlsx"})


@router.get("/reports/party-ledger/pdf")
async def export_party_ledger_pdf(party_name: Optional[str] = None, party_type: Optional[str] = None,
                                    kms_year: Optional[str] = None, season: Optional[str] = None):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    from io import BytesIO
    data = await report_party_ledger(party_name=party_name, party_type=party_type, kms_year=kms_year, season=season)
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=30, rightMargin=30, topMargin=30, bottomMargin=30)
    elements = []; styles = getSampleStyleSheet()
    title = "Party Ledger"
    if party_name: title += f" - {party_name}"
    elements.append(Paragraph(title, styles['Title'])); elements.append(Spacer(1, 12))
    tdata = [['Date', 'Party', 'Type', 'Description', 'Debit(₹)', 'Credit(₹)', 'Ref']]
    for l in data["ledger"]:
        tdata.append([l["date"], l["party_name"][:18], l["party_type"], l["description"][:25],
            l["debit"] if l["debit"] > 0 else '-', l["credit"] if l["credit"] > 0 else '-', l["ref"]])
    tdata.append(['TOTAL', '', '', '', data["total_debit"], data["total_credit"], ''])
    table = RLTable(tdata, colWidths=[50, 80, 50, 120, 55, 55, 45], repeatRows=1)
    table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#1a365d')),('TEXTCOLOR',(0,0),(-1,0),colors.white),
        ('FONTSIZE',(0,0),(-1,-1),7),('GRID',(0,0),(-1,-1),0.5,colors.grey),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('FONTNAME',(0,-1),(-1,-1),'Helvetica-Bold'),('ALIGN',(4,0),(5,-1),'RIGHT')]))
    elements.append(table); doc.build(elements); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=party_ledger_{datetime.now().strftime('%Y%m%d')}.pdf"})


# Include the router in the main app
