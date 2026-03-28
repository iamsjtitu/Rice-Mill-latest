"""
Shared Excel & PDF styling helpers for professional colorful exports.
Used by all backend export endpoints.
"""
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment

# === REGISTER HINDI-CAPABLE FONTS FOR PDF ===
_fonts_registered = False

def register_hindi_fonts():
    """Register FreeSans font family for Hindi/Devanagari support in PDFs."""
    global _fonts_registered
    if _fonts_registered:
        return
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        pdfmetrics.registerFont(TTFont('FreeSans', '/usr/share/fonts/truetype/freefont/FreeSans.ttf'))
        pdfmetrics.registerFont(TTFont('FreeSansBold', '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf'))
        pdfmetrics.registerFont(TTFont('FreeSansOblique', '/usr/share/fonts/truetype/freefont/FreeSansOblique.ttf'))
        pdfmetrics.registerFont(TTFont('FreeSansBoldOblique', '/usr/share/fonts/truetype/freefont/FreeSansBoldOblique.ttf'))
        from reportlab.pdfbase.pdfmetrics import registerFontFamily
        registerFontFamily('FreeSans', normal='FreeSans', bold='FreeSansBold', italic='FreeSansOblique', boldItalic='FreeSansBoldOblique')
        _fonts_registered = True
    except Exception:
        pass


def get_pdf_styles():
    """Return getSampleStyleSheet() with FreeSans (Hindi-capable) as default font."""
    register_hindi_fonts()
    from reportlab.lib.styles import getSampleStyleSheet
    styles = getSampleStyleSheet()
    for name in styles.byName:
        style = styles[name]
        if hasattr(style, 'fontName'):
            if style.fontName == 'Helvetica':
                style.fontName = 'FreeSans'
            elif style.fontName == 'Helvetica-Bold':
                style.fontName = 'FreeSansBold'
            elif style.fontName == 'Helvetica-Oblique':
                style.fontName = 'FreeSansOblique'
            elif style.fontName == 'Helvetica-BoldOblique':
                style.fontName = 'FreeSansBoldOblique'
    return styles

# === COLOR PALETTE ===
COLORS = {
    'header_bg': '1B4F72',
    'header_text': 'FFFFFF',
    'title_bg': 'FEF3C7',
    'title_text': '1B4F72',
    'subtitle_bg': 'FFF7ED',
    'subtitle_text': 'D97706',
    'alt_row1': 'F0F7FF',
    'alt_row2': 'FFFFFF',
    'border': 'D0D5DD',
    'header_border': '0D3B66',
    # Amount
    'jama_text': '16A34A', 'jama_bg': 'DCFCE7',
    'nikasi_text': 'DC2626', 'nikasi_bg': 'FEE2E2',
    'balance_bg': 'FEFCE8', 'balance_text': '92400E',
    'date_bg': 'EFF6FF', 'date_text': '1E40AF',
    # Status
    'paid_text': '16A34A', 'paid_bg': 'DCFCE7',
    'pending_text': 'DC2626', 'pending_bg': 'FEE2E2',
    'partial_text': 'D97706', 'partial_bg': 'FEF3C7',
    # Total
    'total_bg': 'FEF3C7', 'total_border': 'F59E0B',
}

_thin = Side(style='thin', color=COLORS['border'])
_hair = Side(style='hair', color=COLORS['border'])
_med = Side(style='medium', color=COLORS['header_border'])
BORDER_THIN = Border(left=_thin, right=_thin, top=_thin, bottom=_thin)
BORDER_HAIR = Border(left=_hair, right=_hair, top=_hair, bottom=_hair)
BORDER_HEADER = Border(left=_thin, right=_thin, top=_med, bottom=_med)


def style_excel_title(ws, title, ncols, subtitle="", branding=None):
    """Add a colorful title section: Company Name, Tagline + Custom Fields, Report Title.
    Always produces exactly 3 rows for backward compatibility."""
    branding = branding or {}
    company = branding.get("company_name", "NAVKAR AGRO")
    tagline = branding.get("tagline", "JOLKO, KESINGA")
    custom_fields = branding.get("custom_fields", [])

    # Build tagline + custom fields combined text
    tagline_parts = [tagline] if tagline else []
    for f in custom_fields:
        lbl = f.get("label", "").strip()
        val = f.get("value", "").strip()
        if lbl and val:
            tagline_parts.append(f"{lbl}: {val}")
    combined_tagline = "  |  ".join(tagline_parts) if tagline_parts else ""

    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncols)
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=ncols)
    ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=ncols)

    # Row 1: Company Name
    c1 = ws.cell(row=1, column=1, value=company)
    c1.font = Font(bold=True, size=18, color=COLORS['title_text'])
    c1.fill = PatternFill(start_color=COLORS['title_bg'], fill_type='solid')
    c1.alignment = Alignment(horizontal='center', vertical='center')
    ws.row_dimensions[1].height = 36

    # Row 2: Tagline + custom fields
    c2 = ws.cell(row=2, column=1, value=combined_tagline)
    c2.font = Font(size=9, italic=True, color='555555')
    c2.alignment = Alignment(horizontal='center', vertical='center')
    ws.row_dimensions[2].height = 22 if custom_fields else 20

    # Row 3: Report Title + date
    from datetime import datetime
    date_str = datetime.now().strftime('%d/%m/%Y')
    title_text = f"{title} | {date_str}" if subtitle == "" else f"{title} | {subtitle} | {date_str}"
    c3 = ws.cell(row=3, column=1, value=title_text)
    c3.font = Font(bold=True, size=12, color=COLORS['subtitle_text'])
    c3.fill = PatternFill(start_color=COLORS['subtitle_bg'], fill_type='solid')
    c3.alignment = Alignment(horizontal='center', vertical='center')
    ws.row_dimensions[3].height = 26


def style_excel_header_row(ws, row_num, ncols):
    """Style a header row with dark background and white text."""
    ws.row_dimensions[row_num].height = 30
    hf = PatternFill(start_color=COLORS['header_bg'], fill_type='solid')
    for col in range(1, ncols + 1):
        c = ws.cell(row=row_num, column=col)
        c.fill = hf
        c.font = Font(bold=True, size=10, color=COLORS['header_text'])
        c.border = BORDER_HEADER
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)


def style_excel_data_rows(ws, start_row, end_row, ncols, headers=None):
    """Style data rows with column-type-aware coloring."""
    # Detect column types from headers
    header_lower = []
    if headers:
        header_lower = [str(h).lower() for h in headers]
    else:
        for col in range(1, ncols + 1):
            header_lower.append(str(ws.cell(row=start_row - 1, column=col).value or '').lower())
    
    is_date = [any(k in h for k in ('date', 'tarikh')) for h in header_lower]
    is_jama = [any(k in h for k in ('jama', 'credit', 'received', ' in')) for h in header_lower]
    is_nikasi = [any(k in h for k in ('nikasi', 'debit', 'paid', ' out')) for h in header_lower]
    is_balance = [any(k in h for k in ('balance', 'bal', 'bakaya')) for h in header_lower]
    is_amount = [any(k in h for k in ('amount', 'total', 'gross', 'net', 'rent', 'rate')) for h in header_lower]
    is_status = [any(k in h for k in ('status',)) for h in header_lower]
    
    for row in range(start_row, end_row + 1):
        is_even = (row - start_row) % 2 == 0
        base_bg = COLORS['alt_row1'] if is_even else COLORS['alt_row2']
        ws.row_dimensions[row].height = 22
        
        for col in range(1, ncols + 1):
            c = ws.cell(row=row, column=col)
            ci = col - 1
            val = c.value
            
            c.fill = PatternFill(start_color=base_bg, fill_type='solid')
            c.border = BORDER_HAIR
            c.font = Font(size=10)
            c.alignment = Alignment(horizontal='center', vertical='center')
            
            if ci < len(is_date) and is_date[ci]:
                c.fill = PatternFill(start_color=COLORS['date_bg'], fill_type='solid')
                c.font = Font(size=10, color=COLORS['date_text'])
            
            if ci < len(is_jama) and is_jama[ci] and isinstance(val, (int, float)) and val > 0:
                c.fill = PatternFill(start_color=COLORS['jama_bg'], fill_type='solid')
                c.font = Font(bold=True, size=10, color=COLORS['jama_text'])
            
            if ci < len(is_nikasi) and is_nikasi[ci] and isinstance(val, (int, float)) and val > 0:
                c.fill = PatternFill(start_color=COLORS['nikasi_bg'], fill_type='solid')
                c.font = Font(bold=True, size=10, color=COLORS['nikasi_text'])
            
            if ci < len(is_balance) and is_balance[ci]:
                c.fill = PatternFill(start_color=COLORS['balance_bg'], fill_type='solid')
                c.font = Font(bold=True, size=10, color=COLORS['balance_text'])
                if isinstance(val, (int, float)) and val < 0:
                    c.font = Font(bold=True, size=10, color=COLORS['nikasi_text'])
            
            if ci < len(is_amount) and is_amount[ci] and isinstance(val, (int, float)):
                c.font = Font(bold=True, size=10)
                c.number_format = '#,##0.00'
            
            str_val = str(val or '')
            if ci < len(is_status) and is_status[ci]:
                if str_val.lower() in ('paid',):
                    c.fill = PatternFill(start_color=COLORS['paid_bg'], fill_type='solid')
                    c.font = Font(bold=True, size=10, color=COLORS['paid_text'])
                elif str_val.lower() in ('pending',):
                    c.fill = PatternFill(start_color=COLORS['pending_bg'], fill_type='solid')
                    c.font = Font(bold=True, size=10, color=COLORS['pending_text'])
                elif str_val.lower() in ('partial',):
                    c.fill = PatternFill(start_color=COLORS['partial_bg'], fill_type='solid')
                    c.font = Font(bold=True, size=10, color=COLORS['partial_text'])


def style_excel_total_row(ws, row_num, ncols):
    """Style the total row with amber background."""
    ws.row_dimensions[row_num].height = 26
    tf = PatternFill(start_color=COLORS['total_bg'], fill_type='solid')
    tb = Border(left=_thin, right=_thin, top=Side(style='medium', color=COLORS['total_border']),
                bottom=Side(style='medium', color=COLORS['total_border']))
    for col in range(1, ncols + 1):
        c = ws.cell(row=row_num, column=col)
        c.fill = tf
        c.font = Font(bold=True, size=11)
        c.border = tb


def style_excel_summary_header(ws, row_num, ncols):
    """Style a summary sub-header row."""
    hf = PatternFill(start_color=COLORS['header_bg'], fill_type='solid')
    for col in range(1, ncols + 1):
        c = ws.cell(row=row_num, column=col)
        c.fill = hf
        c.font = Font(bold=True, size=9, color=COLORS['header_text'])
        c.border = BORDER_THIN
        c.alignment = Alignment(horizontal='center')


def get_pdf_table_style(num_rows, cols_info=None):
    """Generate a colorful ReportLab TableStyle for PDF tables."""
    from reportlab.lib import colors as rl_colors
    
    register_hindi_fonts()
    style = [
        # Base font for all cells (Hindi support)
        ('FONTNAME', (0, 0), (-1, -1), 'FreeSans'),
        # Header
        ('BACKGROUND', (0, 0), (-1, 0), rl_colors.HexColor('#1B4F72')),
        ('TEXTCOLOR', (0, 0), (-1, 0), rl_colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'FreeSansBold'),
        ('FONTSIZE', (0, 0), (-1, -1), 6.5),
        ('FONTSIZE', (0, 0), (-1, 0), 7),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('GRID', (0, 0), (-1, -1), 0.4, rl_colors.HexColor('#D0D5DD')),
        # Total row (last row)
        ('BACKGROUND', (0, -1), (-1, -1), rl_colors.HexColor('#FEF3C7')),
        ('FONTNAME', (0, -1), (-1, -1), 'FreeSansBold'),
        ('LINEABOVE', (0, -1), (-1, -1), 1.5, rl_colors.HexColor('#F59E0B')),
    ]
    
    # Alternating row colors
    for i in range(1, num_rows):
        if i % 2 == 0:
            style.append(('BACKGROUND', (0, i), (-1, i), rl_colors.HexColor('#F0F7FF')))
    
    # Column-specific colors if cols_info provided
    if cols_info:
        for ci, col in enumerate(cols_info):
            h = col.get('header', '').lower() if isinstance(col, dict) else str(col).lower()
            if any(k in h for k in ('jama', 'credit', 'in')):
                for ri in range(1, num_rows):
                    style.append(('TEXTCOLOR', (ci, ri), (ci, ri), rl_colors.HexColor('#16A34A')))
            elif any(k in h for k in ('nikasi', 'debit', 'out')):
                for ri in range(1, num_rows):
                    style.append(('TEXTCOLOR', (ci, ri), (ci, ri), rl_colors.HexColor('#DC2626')))
    
    return style


def _build_custom_fields_row(branding):
    """Build a ReportLab Table row for custom_fields with Left/Center/Right alignment."""
    register_hindi_fonts()
    from reportlab.platypus import Paragraph, Table as RLTable, TableStyle
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
    from reportlab.lib import colors as rl_colors

    fields = branding.get("custom_fields", [])
    if not fields:
        return []

    left_parts, center_parts, right_parts = [], [], []
    for f in fields:
        txt = f"<b>{f.get('label', '')}:</b> {f.get('value', '')}"
        pos = f.get("position", "center").lower()
        if pos == "left":
            left_parts.append(txt)
        elif pos == "right":
            right_parts.append(txt)
        else:
            center_parts.append(txt)

    style_l = ParagraphStyle('CFL', fontSize=8, fontName='FreeSans', textColor=rl_colors.HexColor('#374151'), alignment=TA_LEFT)
    style_c = ParagraphStyle('CFC', fontSize=8, fontName='FreeSans', textColor=rl_colors.HexColor('#374151'), alignment=TA_CENTER)
    style_r = ParagraphStyle('CFR', fontSize=8, fontName='FreeSans', textColor=rl_colors.HexColor('#374151'), alignment=TA_RIGHT)

    left_p = Paragraph("<br/>".join(left_parts) if left_parts else "", style_l)
    center_p = Paragraph("<br/>".join(center_parts) if center_parts else "", style_c)
    right_p = Paragraph("<br/>".join(right_parts) if right_parts else "", style_r)

    tbl = RLTable([[left_p, center_p, right_p]], colWidths=['33%', '34%', '33%'])
    tbl.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'FreeSans'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#D0D5DD')),
    ]))
    return [tbl]


def get_pdf_header_elements(title, branding=None, subtitle=""):
    """Return ReportLab Paragraph elements for company name, tagline, custom fields, and report title."""
    register_hindi_fonts()
    from reportlab.platypus import Paragraph, Spacer
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib import colors as rl_colors

    branding = branding or {}
    company = branding.get("company_name", "NAVKAR AGRO")
    tagline = branding.get("tagline", "JOLKO, KESINGA")

    company_style = ParagraphStyle(
        'CompanyHeader', fontSize=18, fontName='FreeSansBold',
        textColor=rl_colors.HexColor('#1B4F72'), alignment=TA_CENTER,
        spaceAfter=2, backColor=rl_colors.HexColor('#FFFBEB'),
        borderPadding=(6, 4, 6, 4),
    )
    tagline_style = ParagraphStyle(
        'TaglineHeader', fontSize=9, fontName='FreeSansOblique',
        textColor=rl_colors.HexColor('#6B7280'), alignment=TA_CENTER,
        spaceAfter=4,
    )
    title_style = ParagraphStyle(
        'ReportTitle', fontSize=12, fontName='FreeSansBold',
        textColor=rl_colors.white, alignment=TA_CENTER,
        backColor=rl_colors.HexColor('#0891B2'),
        borderPadding=(4, 3, 4, 3), spaceAfter=6,
    )

    elements = [
        Paragraph(company, company_style),
        Spacer(1, 2),
    ]
    if tagline:
        elements.append(Paragraph(tagline, tagline_style))
    # Custom fields row (Left | Center | Right)
    elements.extend(_build_custom_fields_row(branding))
    elements.append(Paragraph(title if not subtitle else f"{title} | {subtitle}", title_style))
    elements.append(Spacer(1, 6))
    return elements


def get_pdf_company_header(branding=None):
    """Return just the company name + tagline + custom fields paragraphs for PDF (no title)."""
    register_hindi_fonts()
    from reportlab.platypus import Paragraph, Spacer
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib import colors as rl_colors

    branding = branding or {}
    company = branding.get("company_name", "NAVKAR AGRO")
    tagline = branding.get("tagline", "JOLKO, KESINGA")

    company_style = ParagraphStyle(
        'CompanyHdr', fontSize=18, fontName='FreeSansBold',
        textColor=rl_colors.HexColor('#1B4F72'), alignment=TA_CENTER,
        spaceAfter=2, backColor=rl_colors.HexColor('#FFFBEB'),
        borderPadding=(6, 4, 6, 4),
    )
    tagline_style = ParagraphStyle(
        'TaglineHdr', fontSize=9, fontName='FreeSansOblique',
        textColor=rl_colors.HexColor('#6B7280'), alignment=TA_CENTER,
        spaceAfter=6,
    )

    elements = [Paragraph(company, company_style), Spacer(1, 2)]
    if tagline:
        elements.append(Paragraph(tagline, tagline_style))
    # Custom fields row
    elements.extend(_build_custom_fields_row(branding))
    return elements
