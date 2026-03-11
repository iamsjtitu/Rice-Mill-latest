import json, os

CONFIG_PATH = os.path.join(os.path.dirname(__file__), '../../shared/report_config.json')

def load_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)

def get_columns(report_name, subkey="columns"):
    return load_config()[report_name][subkey]

def fmt_val(value, col_type):
    if col_type == "qntl":
        return round((value or 0) / 100, 2)
    elif col_type == "integer":
        return int(value or 0)
    elif col_type == "number":
        return value or 0
    return value or ""

def get_entry_row(entry, columns):
    return [fmt_val(entry.get(col["field"], 0), col["type"]) for col in columns]

def get_total_row(totals, columns):
    return [fmt_val(totals.get(col["total_key"], 0), col["type"]) if col.get("show_total") else None for col in columns]

def get_excel_headers(columns):
    return [c["header"] for c in columns]

def get_pdf_headers(columns):
    return [c["pdf_header"] for c in columns]

def get_excel_widths(columns):
    return [c["width_excel"] for c in columns]

def get_pdf_widths_mm(columns):
    return [c["width_pdf_mm"] for c in columns]

def col_count(columns):
    return len(columns)
