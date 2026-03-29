"""GST Invoice routes - CRUD + PDF + WhatsApp"""
from fastapi import APIRouter, HTTPException
from database import db
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid, io
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table as RTable, TableStyle, Paragraph, Spacer, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from starlette.responses import StreamingResponse
import os

router = APIRouter()

# Register Hindi fonts
font_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'fonts')
for fname, ffile in [('FreeSans', 'FreeSans.ttf'), ('FreeSansBold', 'FreeSansBold.ttf')]:
    fpath = os.path.join(font_dir, ffile)
    if os.path.exists(fpath):
        try:
            pdfmetrics.registerFont(TTFont(fname, fpath))
        except Exception:
            pass

# ============ GST COMPANY SETTINGS ============

class GstCompanySettings(BaseModel):
    company_name: str = ""
    gstin: str = ""
    address: str = ""
    state_code: str = ""
    state_name: str = ""
    phone: str = ""
    bank_name: str = ""
    bank_account: str = ""
    bank_ifsc: str = ""

@router.get("/gst-company-settings")
async def get_gst_company_settings():
    s = await db.settings.find_one({"key": "gst_company"}, {"_id": 0})
    if not s:
        return {"company_name": "", "gstin": "", "address": "", "state_code": "21", "state_name": "Odisha", "phone": "", "bank_name": "", "bank_account": "", "bank_ifsc": ""}
    return {k: s.get(k, "") for k in ["company_name", "gstin", "address", "state_code", "state_name", "phone", "bank_name", "bank_account", "bank_ifsc"]}

@router.put("/gst-company-settings")
async def update_gst_company_settings(data: GstCompanySettings):
    await db.settings.update_one(
        {"key": "gst_company"},
        {"$set": {"key": "gst_company", **data.dict()}},
        upsert=True
    )
    return {"success": True}

# ============ GST INVOICE CRUD ============

class GstInvoiceItem(BaseModel):
    name: str = ""
    hsn: str = ""
    qty: float = 0
    unit: str = "QNTL"
    rate: float = 0
    gst_pct: float = 5

class GstInvoiceCreate(BaseModel):
    invoice_no: str
    date: str
    buyer_name: str = ""
    buyer_gstin: str = ""
    buyer_address: str = ""
    buyer_phone: str = ""
    is_igst: bool = False
    items: List[GstInvoiceItem] = []
    kms_year: str = ""
    season: str = ""
    notes: str = ""

@router.get("/gst-invoices")
async def list_gst_invoices(kms_year: str = "", season: str = ""):
    filt = {}
    if kms_year:
        filt["kms_year"] = kms_year
    if season:
        filt["season"] = season
    docs = await db.gst_invoices.find(filt, {"_id": 0}).sort("date", -1).to_list(5000)
    return docs

@router.post("/gst-invoices")
async def create_gst_invoice(data: GstInvoiceCreate):
    inv = data.dict()
    inv["id"] = str(uuid.uuid4())
    inv["created_at"] = datetime.now(timezone.utc).isoformat()
    # Calculate totals
    taxable = sum((it["qty"] or 0) * (it["rate"] or 0) for it in inv["items"])
    gst_amt = sum((it["qty"] or 0) * (it["rate"] or 0) * (it["gst_pct"] or 0) / 100 for it in inv["items"])
    inv["totals"] = {
        "taxable": round(taxable, 2),
        "gst": round(gst_amt, 2),
        "cgst": round(gst_amt / 2, 2) if not inv["is_igst"] else 0,
        "sgst": round(gst_amt / 2, 2) if not inv["is_igst"] else 0,
        "igst": round(gst_amt, 2) if inv["is_igst"] else 0,
        "total": round(taxable + gst_amt, 2)
    }
    await db.gst_invoices.insert_one(inv)
    inv.pop("_id", None)
    return inv

@router.put("/gst-invoices/{inv_id}")
async def update_gst_invoice(inv_id: str, data: GstInvoiceCreate):
    inv = data.dict()
    taxable = sum((it["qty"] or 0) * (it["rate"] or 0) for it in inv["items"])
    gst_amt = sum((it["qty"] or 0) * (it["rate"] or 0) * (it["gst_pct"] or 0) / 100 for it in inv["items"])
    inv["totals"] = {
        "taxable": round(taxable, 2),
        "gst": round(gst_amt, 2),
        "cgst": round(gst_amt / 2, 2) if not inv["is_igst"] else 0,
        "sgst": round(gst_amt / 2, 2) if not inv["is_igst"] else 0,
        "igst": round(gst_amt, 2) if inv["is_igst"] else 0,
        "total": round(taxable + gst_amt, 2)
    }
    inv["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.gst_invoices.update_one({"id": inv_id}, {"$set": inv})
    if result.matched_count == 0:
        raise HTTPException(404, "Invoice not found")
    return {"success": True, "totals": inv["totals"]}

@router.delete("/gst-invoices/{inv_id}")
async def delete_gst_invoice(inv_id: str):
    result = await db.gst_invoices.delete_one({"id": inv_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Invoice not found")
    return {"success": True}

# ============ GST INVOICE PDF ============

def _fmt(v):
    return f"{v:,.2f}" if v else "0.00"

@router.get("/gst-invoices/{inv_id}/pdf")
async def gst_invoice_pdf(inv_id: str):
    inv = await db.gst_invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    company = await db.settings.find_one({"key": "gst_company"}, {"_id": 0}) or {}

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm, topMargin=15*mm, bottomMargin=15*mm)
    styles = getSampleStyleSheet()

    # Font selection
    try:
        pdfmetrics.getFont('FreeSansBold')
        bfont = 'FreeSansBold'
        nfont = 'FreeSans'
    except Exception:
        bfont = 'Helvetica-Bold'
        nfont = 'Helvetica'

    title_style = ParagraphStyle('title', fontName=bfont, fontSize=16, alignment=1, spaceAfter=2)
    sub_style = ParagraphStyle('sub', fontName=nfont, fontSize=9, alignment=1, spaceAfter=1, textColor=colors.grey)
    label_style = ParagraphStyle('label', fontName=nfont, fontSize=8, textColor=colors.grey)
    val_style = ParagraphStyle('val', fontName=bfont, fontSize=9)
    small_style = ParagraphStyle('small', fontName=nfont, fontSize=8)

    elements = []

    # === HEADER ===
    elements.append(Paragraph(company.get("company_name", "COMPANY NAME"), title_style))
    if company.get("address"):
        elements.append(Paragraph(company["address"], sub_style))
    if company.get("gstin"):
        elements.append(Paragraph(f"GSTIN: {company['gstin']}", sub_style))
    if company.get("phone"):
        elements.append(Paragraph(f"Phone: {company['phone']}", sub_style))
    elements.append(Spacer(1, 4))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#334155')))
    elements.append(Spacer(1, 4))

    # TAX INVOICE title
    elements.append(Paragraph("<b>TAX INVOICE</b>", ParagraphStyle('inv', fontName=bfont, fontSize=14, alignment=1, textColor=colors.HexColor('#1e40af'))))
    elements.append(Spacer(1, 6))

    # Invoice info + Buyer info in a 2-column table
    info_data = [
        [Paragraph(f"<b>Invoice No:</b> {inv.get('invoice_no','')}", small_style),
         Paragraph(f"<b>Date:</b> {inv.get('date','')}", small_style)],
        [Paragraph(f"<b>Bill To:</b> {inv.get('buyer_name','')}", val_style),
         Paragraph(f"<b>GSTIN:</b> {inv.get('buyer_gstin','')}", small_style)],
    ]
    if inv.get('buyer_address'):
        info_data.append([Paragraph(f"Address: {inv['buyer_address']}", small_style), Paragraph("", small_style)])
    info_t = RTable(info_data, colWidths=[280, 280])
    info_t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    elements.append(info_t)
    elements.append(Spacer(1, 8))

    # === ITEMS TABLE ===
    items = inv.get("items", [])
    hdr = ['#', 'Item', 'HSN', 'Qty', 'Unit', 'Rate', 'Taxable', 'GST%', 'GST Amt', 'Total']
    rows = [hdr]
    for i, it in enumerate(items):
        taxable = (it.get("qty", 0) or 0) * (it.get("rate", 0) or 0)
        gst_a = taxable * (it.get("gst_pct", 0) or 0) / 100
        total = taxable + gst_a
        rows.append([
            str(i + 1), it.get("name", ""), it.get("hsn", ""),
            str(round(it.get("qty", 0), 2)), it.get("unit", ""),
            f"Rs.{_fmt(it.get('rate', 0))}", f"Rs.{_fmt(taxable)}",
            f"{it.get('gst_pct', 0)}%", f"Rs.{_fmt(gst_a)}", f"Rs.{_fmt(total)}"
        ])

    totals = inv.get("totals", {})
    rows.append(['', '', '', '', '', '', f"Rs.{_fmt(totals.get('taxable', 0))}", '',
                 f"Rs.{_fmt(totals.get('gst', 0))}", f"Rs.{_fmt(totals.get('total', 0))}"])

    col_w = [22, 95, 55, 40, 35, 55, 60, 35, 50, 60]
    t = RTable(rows, colWidths=col_w)
    t_style = [
        ('FONTNAME', (0, 0), (-1, 0), bfont),
        ('FONTNAME', (0, 1), (-1, -2), nfont),
        ('FONTNAME', (0, -1), (-1, -1), bfont),
        ('FONTSIZE', (0, 0), (-1, -1), 7.5),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e2e8f0')),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#f0fdf4')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#94a3b8')),
        ('ALIGN', (0, 0), (0, -1), 'CENTER'),
        ('ALIGN', (3, 0), (-1, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]
    t.setStyle(TableStyle(t_style))
    elements.append(t)
    elements.append(Spacer(1, 8))

    # === TAX SUMMARY ===
    if inv.get("is_igst"):
        tax_rows = [
            ['Taxable Amount', f"Rs.{_fmt(totals.get('taxable', 0))}"],
            ['IGST', f"Rs.{_fmt(totals.get('igst', 0))}"],
            ['Grand Total', f"Rs.{_fmt(totals.get('total', 0))}"],
        ]
    else:
        tax_rows = [
            ['Taxable Amount', f"Rs.{_fmt(totals.get('taxable', 0))}"],
            ['CGST', f"Rs.{_fmt(totals.get('cgst', 0))}"],
            ['SGST', f"Rs.{_fmt(totals.get('sgst', 0))}"],
            ['Grand Total', f"Rs.{_fmt(totals.get('total', 0))}"],
        ]
    tax_t = RTable(tax_rows, colWidths=[120, 100])
    tax_t.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -2), nfont), ('FONTNAME', (0, -1), (-1, -1), bfont),
        ('FONTSIZE', (0, 0), (-1, -1), 9), ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LINEBELOW', (0, -1), (-1, -1), 1, colors.black),
    ]))
    # Right-align the tax summary
    wrapper = RTable([['' , tax_t]], colWidths=[340, 220])
    wrapper.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    elements.append(wrapper)
    elements.append(Spacer(1, 12))

    # === BANK DETAILS ===
    if company.get("bank_name") or company.get("bank_account"):
        elements.append(Paragraph("<b>Bank Details:</b>", ParagraphStyle('bk', fontName=bfont, fontSize=8)))
        bank_text = []
        if company.get("bank_name"):
            bank_text.append(f"Bank: {company['bank_name']}")
        if company.get("bank_account"):
            bank_text.append(f"A/C: {company['bank_account']}")
        if company.get("bank_ifsc"):
            bank_text.append(f"IFSC: {company['bank_ifsc']}")
        elements.append(Paragraph(" | ".join(bank_text), small_style))
        elements.append(Spacer(1, 8))

    # === NOTES ===
    if inv.get("notes"):
        elements.append(Paragraph(f"<b>Notes:</b> {inv['notes']}", small_style))
        elements.append(Spacer(1, 6))

    # === FOOTER ===
    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#cbd5e1')))
    elements.append(Spacer(1, 4))
    elements.append(Paragraph(f"Thank you - {company.get('company_name', '')}", ParagraphStyle('foot', fontName=nfont, fontSize=8, alignment=1, textColor=colors.grey)))

    doc.build(elements)
    buf.seek(0)
    fn = f"GST_Invoice_{inv.get('invoice_no', inv_id)}.pdf"
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={fn}"})
