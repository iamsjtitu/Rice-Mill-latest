"""
Shared Excel & PDF styling helpers for professional colorful exports.
Used by all backend export endpoints.
"""
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment

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


def style_excel_title(ws, title, ncols, subtitle=""):
    """Add a colorful title section at top of worksheet."""
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncols)
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=ncols)
    
    c = ws.cell(row=1, column=1, value=title)
    c.font = Font(bold=True, size=16, color=COLORS['title_text'])
    c.fill = PatternFill(start_color=COLORS['title_bg'], fill_type='solid')
    c.alignment = Alignment(horizontal='center', vertical='center')
    ws.row_dimensions[1].height = 34
    
    c2 = ws.cell(row=2, column=1, value=subtitle or "Mill Entry System")
    c2.font = Font(size=9, italic=True, color='666666')
    c2.alignment = Alignment(horizontal='center')


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
    
    style = [
        # Header
        ('BACKGROUND', (0, 0), (-1, 0), rl_colors.HexColor('#1B4F72')),
        ('TEXTCOLOR', (0, 0), (-1, 0), rl_colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 6.5),
        ('FONTSIZE', (0, 0), (-1, 0), 7),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('GRID', (0, 0), (-1, -1), 0.4, rl_colors.HexColor('#D0D5DD')),
        # Total row (last row)
        ('BACKGROUND', (0, -1), (-1, -1), rl_colors.HexColor('#FEF3C7')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
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
