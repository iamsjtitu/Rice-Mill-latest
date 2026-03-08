from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import datetime
from database import db
import io

router = APIRouter()

@router.get("/reports/daily")
async def get_daily_report(date: str, kms_year: Optional[str] = None, season: Optional[str] = None):
    q_date = {"date": date}
    q_fy = {}
    if kms_year: q_fy["kms_year"] = kms_year
    if season: q_fy["season"] = season
    q = {**q_date, **q_fy}

    # Paddy Entries
    entries = await db.entries.find(q, {"_id": 0}).to_list(500)
    total_paddy_kg = sum(e.get("kg", 0) for e in entries)
    total_paddy_bags = sum(e.get("bag", 0) for e in entries)
    total_final_w = sum(e.get("final_w", 0) for e in entries)

    # Private Paddy
    pvt_paddy = await db.private_paddy.find(q, {"_id": 0}).to_list(500)
    pvt_paddy_kg = sum(e.get("kg", 0) for e in pvt_paddy)
    pvt_paddy_amount = sum(e.get("total_amount", 0) for e in pvt_paddy)

    # Rice Sales
    rice_sales = await db.rice_sales.find(q, {"_id": 0}).to_list(500)
    rice_sale_qntl = sum(s.get("quantity_qntl", 0) for s in rice_sales)
    rice_sale_amount = sum(s.get("total_amount", 0) for s in rice_sales)

    # Milling
    milling = await db.milling_entries.find(q, {"_id": 0}).to_list(500)
    milling_paddy_input = sum(m.get("paddy_input_qntl", 0) for m in milling)
    milling_rice_output = sum(m.get("rice_qntl", 0) for m in milling)
    milling_frk_used = sum(m.get("frk_used_qntl", 0) for m in milling)

    # DC Deliveries
    dc_deliveries = await db.dc_deliveries.find(q_date, {"_id": 0}).to_list(500)
    dc_delivery_qntl = sum(d.get("quantity_qntl", 0) for d in dc_deliveries)

    # Cash Book
    cash_txns = await db.cash_transactions.find(q, {"_id": 0}).to_list(500)
    cash_jama = sum(t.get("amount", 0) for t in cash_txns if t.get("txn_type") == "jama" and t.get("account") == "cash")
    cash_nikasi = sum(t.get("amount", 0) for t in cash_txns if t.get("txn_type") == "nikasi" and t.get("account") == "cash")
    bank_jama = sum(t.get("amount", 0) for t in cash_txns if t.get("txn_type") == "jama" and t.get("account") == "bank")
    bank_nikasi = sum(t.get("amount", 0) for t in cash_txns if t.get("txn_type") == "nikasi" and t.get("account") == "bank")

    # MSP Payments
    msp = await db.msp_payments.find(q, {"_id": 0}).to_list(500)
    msp_amount = sum(p.get("amount", 0) for p in msp)

    # Private Payments
    pvt_payments = await db.private_payments.find(q_date, {"_id": 0}).to_list(500)
    pvt_paid = sum(p.get("amount", 0) for p in pvt_payments if p.get("ref_type") == "paddy_purchase")
    pvt_received = sum(p.get("amount", 0) for p in pvt_payments if p.get("ref_type") == "rice_sale")

    # By-product Sales
    bp_sales = await db.byproduct_sales.find(q, {"_id": 0}).to_list(500)
    bp_amount = sum(s.get("total_amount", 0) for s in bp_sales)

    # FRK Purchases
    frk = await db.frk_purchases.find(q, {"_id": 0}).to_list(500)
    frk_qntl = sum(f.get("quantity_qntl", 0) for f in frk)
    frk_amount = sum(f.get("total_amount", 0) for f in frk)

    # Mill Parts Stock
    parts_txns = await db.mill_parts_stock.find(q_date, {"_id": 0}).to_list(500)
    parts_in = [t for t in parts_txns if t.get("txn_type") == "in"]
    parts_used = [t for t in parts_txns if t.get("txn_type") == "used"]

    return {
        "date": date,
        "paddy_entries": {
            "count": len(entries), "total_kg": round(total_paddy_kg, 2),
            "total_bags": total_paddy_bags, "total_final_w": round(total_final_w, 2),
            "details": [{"truck_no": e.get("truck_no", ""), "agent": e.get("agent_name", ""),
                "kg": e.get("kg", 0), "final_w": e.get("final_w", 0)} for e in entries]
        },
        "pvt_paddy": {
            "count": len(pvt_paddy), "total_kg": round(pvt_paddy_kg, 2),
            "total_amount": round(pvt_paddy_amount, 2),
            "details": [{"party": p.get("party_name", ""), "kg": p.get("kg", 0),
                "amount": p.get("total_amount", 0)} for p in pvt_paddy]
        },
        "rice_sales": {
            "count": len(rice_sales), "total_qntl": round(rice_sale_qntl, 2),
            "total_amount": round(rice_sale_amount, 2),
            "details": [{"party": s.get("party_name", ""), "qntl": s.get("quantity_qntl", 0),
                "type": s.get("rice_type", ""), "amount": s.get("total_amount", 0)} for s in rice_sales]
        },
        "milling": {
            "count": len(milling), "paddy_input_qntl": round(milling_paddy_input, 2),
            "rice_output_qntl": round(milling_rice_output, 2),
            "frk_used_qntl": round(milling_frk_used, 2),
            "details": [{"paddy_in": m.get("paddy_input_qntl", 0), "rice_out": m.get("rice_qntl", 0),
                "type": m.get("rice_type", "")} for m in milling]
        },
        "dc_deliveries": {"count": len(dc_deliveries), "total_qntl": round(dc_delivery_qntl, 2)},
        "cash_flow": {
            "cash_jama": round(cash_jama, 2), "cash_nikasi": round(cash_nikasi, 2),
            "bank_jama": round(bank_jama, 2), "bank_nikasi": round(bank_nikasi, 2),
            "net_cash": round(cash_jama - cash_nikasi, 2),
            "net_bank": round(bank_jama - bank_nikasi, 2),
            "details": [{"desc": t.get("description", ""), "type": t.get("txn_type", ""),
                "account": t.get("account", ""), "amount": t.get("amount", 0)} for t in cash_txns]
        },
        "payments": {
            "msp_received": round(msp_amount, 2),
            "pvt_paddy_paid": round(pvt_paid, 2),
            "rice_sale_received": round(pvt_received, 2),
        },
        "byproducts": {"count": len(bp_sales), "total_amount": round(bp_amount, 2)},
        "frk": {"count": len(frk), "total_qntl": round(frk_qntl, 2), "total_amount": round(frk_amount, 2)},
        "mill_parts": {
            "in_count": len(parts_in), "used_count": len(parts_used),
            "in_details": [{"part": t.get("part_name", ""), "qty": t.get("quantity", 0),
                "party": t.get("party_name", ""), "amount": t.get("total_amount", 0)} for t in parts_in],
            "used_details": [{"part": t.get("part_name", ""), "qty": t.get("quantity", 0)} for t in parts_used]
        }
    }

@router.get("/reports/daily/pdf")
async def export_daily_pdf(date: str, kms_year: Optional[str] = None, season: Optional[str] = None):
    data = await get_daily_report(date, kms_year, season)

    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas as pdfcanvas

        buf = io.BytesIO()
        c = pdfcanvas.Canvas(buf, pagesize=A4)
        w, h = A4
        y = h - 40

        def write(text, bold=False, size=10):
            nonlocal y
            if y < 40:
                c.showPage(); y = h - 40
            c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
            c.drawString(40, y, text)
            y -= size + 4

        write(f"Daily Report - {date}", bold=True, size=16)
        y -= 10

        p = data["paddy_entries"]
        write(f"PADDY ENTRIES ({p['count']}): {p['total_kg']} KG, {p['total_bags']} Bags, Final: {p['total_final_w']} KG", bold=True)
        for d in p["details"]:
            write(f"  Truck: {d['truck_no']} | Agent: {d['agent']} | KG: {d['kg']} | Final: {d['final_w']}")

        pp = data["pvt_paddy"]
        if pp["count"]:
            write(f"PVT PADDY PURCHASE ({pp['count']}): {pp['total_kg']} KG, Amount: Rs.{pp['total_amount']:,.0f}", bold=True)

        rs = data["rice_sales"]
        if rs["count"]:
            write(f"RICE SALES ({rs['count']}): {rs['total_qntl']} Q, Amount: Rs.{rs['total_amount']:,.0f}", bold=True)
            for d in rs["details"]:
                write(f"  {d['party']} | {d['qntl']}Q ({d['type']}) | Rs.{d['amount']:,.0f}")

        ml = data["milling"]
        if ml["count"]:
            write(f"MILLING ({ml['count']}): Paddy In: {ml['paddy_input_qntl']}Q, Rice Out: {ml['rice_output_qntl']}Q, FRK: {ml['frk_used_qntl']}Q", bold=True)

        cf = data["cash_flow"]
        write(f"CASH FLOW:", bold=True)
        write(f"  Cash: Jama Rs.{cf['cash_jama']:,.0f} | Nikasi Rs.{cf['cash_nikasi']:,.0f} | Net Rs.{cf['net_cash']:,.0f}")
        write(f"  Bank: Jama Rs.{cf['bank_jama']:,.0f} | Nikasi Rs.{cf['bank_nikasi']:,.0f} | Net Rs.{cf['net_bank']:,.0f}")

        pay = data["payments"]
        write(f"PAYMENTS: MSP Rs.{pay['msp_received']:,.0f} | Pvt Paid Rs.{pay['pvt_paddy_paid']:,.0f} | Rice Rcvd Rs.{pay['rice_sale_received']:,.0f}", bold=True)

        c.save()
        buf.seek(0)
        return StreamingResponse(buf, media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=daily_report_{date}.pdf"})
    except Exception as e:
        raise

@router.get("/reports/daily/excel")
async def export_daily_excel(date: str, kms_year: Optional[str] = None, season: Optional[str] = None):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    data = await get_daily_report(date, kms_year, season)
    wb = Workbook()
    ws = wb.active
    ws.title = f"Daily Report {date}"
    hdr_fill = PatternFill(start_color='1a365d', end_color='1a365d', fill_type='solid')
    hdr_font = Font(bold=True, color='FFFFFF')
    bold = Font(bold=True)

    ws.merge_cells('A1:F1')
    ws['A1'] = f"Daily Report - {date}"
    ws['A1'].font = Font(bold=True, size=14)
    row = 3

    def section(title, headers_list, rows_data):
        nonlocal row
        ws.cell(row=row, column=1, value=title).font = bold
        row += 1
        for i, h in enumerate(headers_list, 1):
            c = ws.cell(row=row, column=i, value=h)
            c.fill = hdr_fill; c.font = hdr_font
        row += 1
        for r in rows_data:
            for i, v in enumerate(r, 1):
                ws.cell(row=row, column=i, value=v)
            row += 1
        row += 1

    p = data["paddy_entries"]
    section(f"Paddy Entries ({p['count']}) - Total KG: {p['total_kg']}, Final: {p['total_final_w']}",
        ["Truck", "Agent", "KG", "Final W"],
        [[d["truck_no"], d["agent"], d["kg"], d["final_w"]] for d in p["details"]])

    ml = data["milling"]
    if ml["count"]:
        section(f"Milling ({ml['count']})", ["Paddy In (Q)", "Rice Out (Q)", "Type"],
            [[d["paddy_in"], d["rice_out"], d["type"]] for d in ml["details"]])

    rs = data["rice_sales"]
    if rs["count"]:
        section(f"Rice Sales ({rs['count']}) - Total: {rs['total_qntl']}Q, Amount: {rs['total_amount']}",
            ["Party", "Qntl", "Type", "Amount"],
            [[d["party"], d["qntl"], d["type"], d["amount"]] for d in rs["details"]])

    cf = data["cash_flow"]
    section("Cash Flow", ["Description", "Type", "Account", "Amount"],
        [[d["desc"], d["type"], d["account"], d["amount"]] for d in cf["details"]])

    ws.cell(row=row, column=1, value="Summary").font = bold
    row += 1
    for label, val in [
        ("Cash Net", cf["net_cash"]), ("Bank Net", cf["net_bank"]),
        ("MSP Received", data["payments"]["msp_received"]),
        ("Pvt Paddy Paid", data["payments"]["pvt_paddy_paid"]),
        ("Rice Sale Received", data["payments"]["rice_sale_received"]),
    ]:
        ws.cell(row=row, column=1, value=label)
        ws.cell(row=row, column=2, value=val)
        row += 1

    for col in range(1, 7):
        ws.column_dimensions[chr(64 + col)].width = 20

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=daily_report_{date}.xlsx"})
