# Date format utility: YYYY-MM-DD -> DD-MM-YYYY
def fmt_date(d):
    if not d:
        return ''
    s = str(d).split('T')[0]
    parts = s.split('-')
    if len(parts) == 3 and len(parts[0]) == 4:
        return f"{parts[2]}-{parts[1]}-{parts[0]}"
    return s
