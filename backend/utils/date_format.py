# Date format utility: YYYY-MM-DD -> DD-MM-YYYY
def fmt_date(d):
    if not d:
        return ''
    parts = str(d).split('-')
    return f"{parts[2]}-{parts[1]}-{parts[0]}" if len(parts) == 3 else d
