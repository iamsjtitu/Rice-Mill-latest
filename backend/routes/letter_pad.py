"""
Letter Pad — Company letterhead generator with optional AI assistant.

Features:
  - Generate professional letterhead PDF + Word (.docx) from user-typed body
  - Letterhead matches the reference design: GSTIN top-left, ॐ + Company Name
    centered in red, address + email below; phone numbers top-right; red divider;
    Ref. No. left + Date right; body; signature block.
  - Optional AI assistant (Gemini 2.5 Flash OR GPT-5-mini) for:
      * Generate letter from a short prompt
      * Improve grammar/tone of typed text
      * Translate between English / Hindi / Odia
  - AI keys are per-installation (saved in app_settings) — each miller adds their
    own free Gemini key from Google AI Studio.
"""
from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import StreamingResponse
from datetime import datetime
from io import BytesIO
import httpx

from database import db
from utils.branding_helper import get_branding_data
from utils.export_helpers import register_hindi_fonts

router = APIRouter()

# ---------- Settings (signature + AI keys) ----------

@router.get("/letter-pad/settings")
async def get_letter_pad_settings():
    """Return signature + letterhead fields + AI key presence (never the actual keys)."""
    doc = await db.app_settings.find_one({"setting_id": "letter_pad"}, {"_id": 0}) or {}
    return {
        "gstin": doc.get("gstin", ""),
        "phone": doc.get("phone", ""),
        "phone_secondary": doc.get("phone_secondary", ""),
        "address": doc.get("address", ""),
        "email": doc.get("email", ""),
        "license_number": doc.get("license_number", ""),
        "signature_name": doc.get("signature_name", ""),
        "signature_designation": doc.get("signature_designation", ""),
        "ai_enabled": bool(doc.get("ai_enabled", False)),
        "has_gemini_key": bool(doc.get("gemini_key")),
        "has_openai_key": bool(doc.get("openai_key")),
        "ai_provider": doc.get("ai_provider", "gemini"),
    }


@router.put("/letter-pad/settings")
async def update_letter_pad_settings(payload: dict = Body(...)):
    """Update letterhead + signature + AI configuration. Empty key strings are
    ignored (so users can update other fields without re-entering keys).
    """
    update = {}
    text_fields = (
        "gstin", "phone", "phone_secondary", "address", "email", "license_number",
        "signature_name", "signature_designation", "ai_provider",
    )
    for f in text_fields:
        if f in payload:
            update[f] = str(payload.get(f) or "").strip()
    if "ai_enabled" in payload:
        update["ai_enabled"] = bool(payload["ai_enabled"])
    if payload.get("gemini_key"):
        update["gemini_key"] = str(payload["gemini_key"]).strip()
    if payload.get("openai_key"):
        update["openai_key"] = str(payload["openai_key"]).strip()
    if payload.get("clear_gemini_key"):
        update["gemini_key"] = ""
    if payload.get("clear_openai_key"):
        update["openai_key"] = ""
    update["updated_at"] = datetime.utcnow().isoformat()
    await db.app_settings.update_one(
        {"setting_id": "letter_pad"},
        {"$set": update, "$setOnInsert": {"setting_id": "letter_pad"}},
        upsert=True,
    )
    return await get_letter_pad_settings()


# ---------- AI proxy ----------

_AI_SYSTEM_PROMPTS = {
    "generate": (
        "You are a professional business letter writer. Write ONLY the BODY of a "
        "formal Indian business letter — never include the letterhead, sender's "
        "company name/address (those are pre-printed on the letterhead), date, "
        "ref number, To/recipient block, or signature (those are added separately). "
        "STRICT RULES:\n"
        "1. NO preamble like 'Here is your letter:' or 'Sure, here's a letter'.\n"
        "2. NO sender's company info (NO 'I, [Company Name], am writing...') — "
        "the letterhead already contains the company name and address.\n"
        "3. NO placeholders like '[Your Name]', '[Date]', '[Recipient]', '[Account No]'.\n"
        "4. Start directly with 'Respected Sir/Madam,' (or appropriate greeting).\n"
        "5. End with 'Thanking you.' (NO 'Yours faithfully' / 'Sincerely' / signature).\n"
        "6. Write in first person plural (we/our) for company correspondence.\n"
        "7. Match the language requested (Hindi/English/Odia). 150-300 words. "
        "Polite, direct, formal.\n"
        "8. Output ONLY the letter body — nothing else."
    ),
    "improve": (
        "You are a professional business letter editor. Rewrite the user's draft "
        "with improved grammar, tone, and professionalism. "
        "STRICT RULES:\n"
        "1. Output ONLY the improved letter body — no preamble, no explanation.\n"
        "2. NO placeholders like '[Your Name]'.\n"
        "3. Preserve the user's intent and key facts (dates, amounts, names).\n"
        "4. Don't add 'Yours faithfully' / signature — those are added separately.\n"
        "5. Keep length similar (don't pad or shorten drastically). Same language as input."
    ),
    "translate": (
        "You are a professional translator for Indian business letters. Translate "
        "between English, Hindi (Devanagari), and Odia. "
        "STRICT RULES:\n"
        "1. Output ONLY the translation — no preamble, no explanation.\n"
        "2. Preserve formal business tone and all factual details (numbers, dates, names).\n"
        "3. Use natural, professional phrasing in the target language."
    ),
}


async def _call_gemini(api_key: str, system_prompt: str, user_prompt: str) -> str:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.5-flash:generateContent?key={api_key}"
    )
    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        # NOTE on Gemini 2.5 Flash: maxOutputTokens includes "thinking" tokens.
        # Disable thinking (thinkingBudget=0) so all 2048 tokens are available
        # for the actual letter body, otherwise Gemini truncates mid-sentence.
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 2048,
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(url, json=payload)
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Gemini error: {r.text[:300]}")
        data = r.json()
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except (KeyError, IndexError):
            raise HTTPException(status_code=502, detail="Gemini returned no text")


async def _call_openai(api_key: str, system_prompt: str, user_prompt: str) -> str:
    url = "https://api.openai.com/v1/chat/completions"
    payload = {
        "model": "gpt-5-mini",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_completion_tokens": 1024,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(url, json=payload, headers=headers)
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"OpenAI error: {r.text[:300]}")
        data = r.json()
        try:
            return data["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError):
            raise HTTPException(status_code=502, detail="OpenAI returned no text")


@router.post("/letter-pad/ai")
async def letter_pad_ai(payload: dict = Body(...)):
    """payload = { mode: 'generate'|'improve'|'translate', text: '...',
                   target_lang?: 'English'|'Hindi'|'Odia' }"""
    mode = payload.get("mode")
    text = (payload.get("text") or "").strip()
    if mode not in _AI_SYSTEM_PROMPTS:
        raise HTTPException(status_code=400, detail="Invalid mode")
    if not text:
        raise HTTPException(status_code=400, detail="Text/prompt is required")
    settings = await db.app_settings.find_one({"setting_id": "letter_pad"}, {"_id": 0}) or {}
    if not settings.get("ai_enabled"):
        raise HTTPException(status_code=400, detail="AI is disabled. Settings → Letter Pad → AI Assistant on karein.")
    provider = settings.get("ai_provider", "gemini")
    gemini_key = settings.get("gemini_key", "")
    openai_key = settings.get("openai_key", "")
    if provider == "gemini" and not gemini_key:
        if openai_key:
            provider = "openai"
        else:
            raise HTTPException(status_code=400, detail="Gemini API key not set")
    elif provider == "openai" and not openai_key:
        if gemini_key:
            provider = "gemini"
        else:
            raise HTTPException(status_code=400, detail="OpenAI API key not set")

    system_prompt = _AI_SYSTEM_PROMPTS[mode]
    user_prompt = text
    if mode == "translate":
        target = payload.get("target_lang") or "English"
        user_prompt = f"Translate the following to {target}:\n\n{text}"

    if provider == "gemini":
        out = await _call_gemini(gemini_key, system_prompt, user_prompt)
    else:
        out = await _call_openai(openai_key, system_prompt, user_prompt)
    return {"result": out, "provider": provider}


# ---------- PDF letterhead ----------

async def _build_letter_context():
    """Pull branding + letter pad customization from DB. Letter Pad's own
    overrides (GSTIN, phone, email, address, license) take priority over the
    global branding values."""
    branding = await get_branding_data()
    lp = await db.app_settings.find_one({"setting_id": "letter_pad"}, {"_id": 0}) or {}

    def pick(*opts):
        for o in opts:
            if o:
                return o
        return ""

    return {
        "company_name": pick(branding.get("company_name"), "NAVKAR AGRO"),
        "tagline": pick(branding.get("tagline")),
        "address": pick(lp.get("address"), branding.get("address"), "Laitara Road, Jolko - 766012, Dist. Kalahandi (Odisha)"),
        "email": pick(lp.get("email"), branding.get("email")),
        "phone": pick(lp.get("phone"), branding.get("phone")),
        "phone_secondary": pick(lp.get("phone_secondary"), branding.get("phone_secondary")),
        "gstin": pick(lp.get("gstin"), branding.get("gstin")),
        "license_number": pick(lp.get("license_number"), branding.get("mill_code")),
        "logo": pick(branding.get("logo")),
        "signature_name": pick(lp.get("signature_name"), "Aditya Jain"),
        "signature_designation": pick(lp.get("signature_designation"), "Proprietor"),
    }


def _draw_letterhead_pdf(canvas, ctx, page_w, page_h):
    """Draw the Navkar-style letterhead on the given canvas (top portion).

    Layout:
      Row 1: GSTIN top-left  |  Mob phones top-right
      Row 2: Centered ॐ + Company Name (red bold, 22pt)
      Row 3: Address (centered, 10pt slate)
      Row 4: Email (centered, 10pt slate)
      Row 5: Red divider line
      Row 6 (optional): License number centered below divider, 9pt
    Returns the y position where body content can start.
    """
    from reportlab.lib.colors import HexColor

    register_hindi_fonts()
    BRAND_RED = HexColor("#C0392B")
    DARK = HexColor("#1f2937")
    MUTED = HexColor("#475569")

    top = page_h - 38

    # GSTIN top-left
    if ctx["gstin"]:
        canvas.setFont("InterBold", 9)
        canvas.setFillColor(DARK)
        canvas.drawString(40, top, f"GSTIN: {ctx['gstin']}")

    # Phone(s) top-right (one per line)
    canvas.setFont("InterBold", 9)
    canvas.setFillColor(DARK)
    phones = []
    if ctx["phone"]:
        phones.append(ctx["phone"])
    if ctx["phone_secondary"]:
        phones.append(ctx["phone_secondary"])
    for i, p in enumerate(phones):
        canvas.drawRightString(page_w - 40, top - i * 11, f"Mob. {p}")

    # Center: ॐ + Company Name (red, bold). Pulled down a bit so phone numbers fit.
    canvas.setFont("InterBold", 22)
    canvas.setFillColor(BRAND_RED)
    name_text = f"\u0950 {ctx['company_name']}"
    canvas.drawCentredString(page_w / 2, top - 28, name_text)

    # Address (centered)
    addr_y = top - 46
    canvas.setFont("Inter", 10)
    canvas.setFillColor(MUTED)
    if ctx["address"]:
        canvas.drawCentredString(page_w / 2, addr_y, ctx["address"])
        addr_y -= 13

    # Email (centered)
    if ctx["email"]:
        canvas.setFont("Inter", 10)
        canvas.setFillColor(MUTED)
        canvas.drawCentredString(page_w / 2, addr_y, f"Email: {ctx['email']}")
        addr_y -= 13

    # Red divider line
    divider_y = addr_y - 6
    canvas.setStrokeColor(BRAND_RED)
    canvas.setLineWidth(1.5)
    canvas.line(40, divider_y, page_w - 40, divider_y)

    # License number (optional, below divider, centered, small)
    if ctx.get("license_number"):
        canvas.setFont("Inter", 8)
        canvas.setFillColor(MUTED)
        canvas.drawCentredString(page_w / 2, divider_y - 11, f"License No: {ctx['license_number']}")
        return divider_y - 22
    return divider_y - 8


def _draw_footer_signature(canvas, ctx, page_w, y):
    """Draw 'Yours faithfully,' + signature name + designation."""
    canvas.setFont("Inter", 11)
    canvas.setFillColor("#1f2937")
    canvas.drawRightString(page_w - 40, y, "Yours faithfully,")
    canvas.setFont("InterBold", 12)
    canvas.drawRightString(page_w - 40, y - 50, ctx["signature_name"])
    canvas.setFont("Inter", 10)
    canvas.setFillColor("#475569")
    canvas.drawRightString(page_w - 40, y - 64, ctx["signature_designation"])
    canvas.drawRightString(page_w - 40, y - 78, f"M/s {ctx['company_name']}")


@router.post("/letter-pad/pdf")
async def generate_letter_pdf(payload: dict = Body(...)):
    """payload = { ref_no, date, to_address, subject, body, references }"""
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.pagesizes import A4

    ctx = await _build_letter_context()
    buf = BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    page_w, page_h = A4

    # === Top letterhead — returns y where content starts ===
    content_top_y = _draw_letterhead_pdf(c, ctx, page_w, page_h)

    y = content_top_y - 18
    c.setFillColor("#1f2937")
    c.setFont("Inter", 10)
    # Ref. No. (left) + Date (right)
    ref_no = (payload.get("ref_no") or "").strip()
    date = (payload.get("date") or datetime.now().strftime("%d-%m-%Y")).strip()
    c.drawString(40, y, f"Ref. No.: {ref_no or '_____________'}")
    c.drawRightString(page_w - 40, y, f"Date: {date}")
    y -= 30

    # === To ===
    to_addr = (payload.get("to_address") or "").strip()
    if to_addr:
        c.setFont("InterBold", 10)
        c.drawString(40, y, "To,")
        y -= 14
        c.setFont("Inter", 10)
        for line in to_addr.split("\n"):
            c.drawString(50, y, line[:90])
            y -= 13
        y -= 8

    # === Subject ===
    subject = (payload.get("subject") or "").strip()
    if subject:
        c.setFont("InterBold", 11)
        c.drawString(40, y, f"Subject: {subject}")
        y -= 18

    # === References (optional) ===
    refs = (payload.get("references") or "").strip()
    if refs:
        c.setFont("InterBold", 10)
        c.drawString(40, y, "Reference:")
        y -= 13
        c.setFont("Inter", 10)
        for line in refs.split("\n"):
            c.drawString(50, y, line[:95])
            y -= 13
        y -= 6

    # === Body (greeting + paragraphs) ===
    from reportlab.lib.colors import HexColor as _HexColor
    c.setFont("Inter", 11)
    body = (payload.get("body") or "").strip()
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import Paragraph
    from reportlab.lib.enums import TA_JUSTIFY
    body_style = ParagraphStyle(
        "Body", fontName="Inter", fontSize=11, leading=15,
        alignment=TA_JUSTIFY, textColor=_HexColor("#1f2937"),
    )
    # Render each paragraph via a Paragraph (auto-wrap)
    from reportlab.platypus import KeepInFrame
    for para in body.split("\n\n"):
        if not para.strip():
            continue
        p = Paragraph(para.replace("\n", "<br/>"), body_style)
        avail_h = y - 150  # reserve 150pt for signature block
        w, h = p.wrap(page_w - 80, avail_h)
        if h > avail_h:
            # New page
            c.showPage()
            new_top = _draw_letterhead_pdf(c, ctx, page_w, page_h)
            y = new_top - 18
            w, h = p.wrap(page_w - 80, page_h - 200)
        p.drawOn(c, 40, y - h)
        y -= h + 8

    # === Signature ===
    sig_y = max(150, y - 30)
    _draw_footer_signature(c, ctx, page_w, sig_y)

    c.save()
    buf.seek(0)
    fname = f"letter_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return StreamingResponse(
        buf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# ---------- Word (.docx) letterhead ----------

@router.post("/letter-pad/docx")
async def generate_letter_docx(payload: dict = Body(...)):
    """Generate a Word document with the same letterhead. Editable in MS Word."""
    from docx import Document
    from docx.shared import Pt, RGBColor, Cm
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    ctx = await _build_letter_context()
    doc = Document()

    # Page margins
    for section in doc.sections:
        section.top_margin = Cm(1.0)
        section.bottom_margin = Cm(2.0)
        section.left_margin = Cm(1.5)
        section.right_margin = Cm(1.5)

    # === Letterhead header (table for layout) ===
    table = doc.add_table(rows=1, cols=2)
    table.autofit = False
    cells = table.rows[0].cells
    if ctx["gstin"]:
        p = cells[0].paragraphs[0]
        run = p.add_run(f"GSTIN: {ctx['gstin']}")
        run.font.size = Pt(9)
    p_right = cells[1].paragraphs[0]
    p_right.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    if ctx["phone"]:
        run = p_right.add_run(f"Mob. {ctx['phone']}")
        run.font.size = Pt(9)
    if ctx["phone_secondary"]:
        p2 = cells[1].add_paragraph()
        p2.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        run = p2.add_run(f"Mob. {ctx['phone_secondary']}")
        run.font.size = Pt(9)

    # Center: company name
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(f"\u0950 {ctx['company_name']}")
    run.bold = True
    run.font.size = Pt(28)
    run.font.color.rgb = RGBColor(0xC0, 0x39, 0x2B)

    if ctx["address"]:
        p = doc.add_paragraph(ctx["address"])
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for run in p.runs:
            run.font.size = Pt(10)
            run.font.color.rgb = RGBColor(0x47, 0x55, 0x69)
    if ctx["email"]:
        p = doc.add_paragraph(f"Email: {ctx['email']}")
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for run in p.runs:
            run.font.size = Pt(10)
            run.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    # Red divider (horizontal rule via bottom border on a paragraph)
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    p = doc.add_paragraph()
    p_pr = p._p.get_or_add_pPr()
    border = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "12")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), "C0392B")
    border.append(bottom)
    p_pr.append(border)

    # === Ref + Date row ===
    table = doc.add_table(rows=1, cols=2)
    cells = table.rows[0].cells
    p = cells[0].paragraphs[0]
    p.add_run(f"Ref. No.: {payload.get('ref_no') or '_____________'}").font.size = Pt(10)
    p_r = cells[1].paragraphs[0]
    p_r.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    date_str = payload.get("date") or datetime.now().strftime("%d-%m-%Y")
    p_r.add_run(f"Date: {date_str}").font.size = Pt(10)

    doc.add_paragraph()

    # === To ===
    if payload.get("to_address"):
        p = doc.add_paragraph()
        run = p.add_run("To,")
        run.bold = True
        run.font.size = Pt(11)
        for line in payload["to_address"].split("\n"):
            sub = doc.add_paragraph(line)
            sub.paragraph_format.left_indent = Cm(0.5)
            for r in sub.runs:
                r.font.size = Pt(10)

    # === Subject ===
    if payload.get("subject"):
        p = doc.add_paragraph()
        run = p.add_run(f"Subject: {payload['subject']}")
        run.bold = True
        run.font.size = Pt(11)

    # === References (optional) ===
    if payload.get("references"):
        p = doc.add_paragraph()
        run = p.add_run("Reference:")
        run.bold = True
        run.font.size = Pt(10)
        for line in payload["references"].split("\n"):
            sub = doc.add_paragraph(line)
            sub.paragraph_format.left_indent = Cm(0.5)
            for r in sub.runs:
                r.font.size = Pt(10)

    # === Body ===
    body = (payload.get("body") or "").strip()
    for para in body.split("\n\n"):
        if not para.strip():
            continue
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(8)
        for line in para.split("\n"):
            run = p.add_run(line)
            run.font.size = Pt(11)
            run.add_break()

    # === Signature ===
    doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p.add_run("Yours faithfully,").font.size = Pt(11)
    doc.add_paragraph()
    doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = p.add_run(ctx["signature_name"])
    run.bold = True
    run.font.size = Pt(12)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = p.add_run(ctx["signature_designation"])
    run.font.size = Pt(10)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = p.add_run(f"M/s {ctx['company_name']}")
    run.font.size = Pt(10)

    buf = BytesIO()
    doc.save(buf)
    buf.seek(0)
    fname = f"letter_{datetime.now().strftime('%Y%m%d_%H%M%S')}.docx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
