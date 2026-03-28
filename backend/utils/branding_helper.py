"""
Shared branding helper - single source of truth for all exports.
Reads from db.branding collection, syncs to db.settings for backward compat.
"""
from database import db


async def get_branding_data():
    """Fetch full branding including custom_fields from DB."""
    branding = await db.branding.find_one({}, {"_id": 0})
    if not branding:
        branding = {
            "company_name": "NAVKAR AGRO",
            "tagline": "JOLKO, KESINGA - Mill Entry System",
            "custom_fields": []
        }
    if "custom_fields" not in branding:
        branding["custom_fields"] = []
    return branding


async def get_company_name():
    """Backward-compatible helper returning (company, tagline)."""
    b = await get_branding_data()
    return b.get("company_name", "NAVKAR AGRO"), b.get("tagline", "")


async def get_custom_fields_by_position(branding=None):
    """Return custom fields grouped by position: {left: [], center: [], right: []}."""
    if branding is None:
        branding = await get_branding_data()
    fields = branding.get("custom_fields", [])
    grouped = {"left": [], "center": [], "right": []}
    for f in fields:
        pos = f.get("position", "center").lower()
        if pos not in grouped:
            pos = "center"
        grouped[pos].append(f)
    return grouped


async def get_pdf_company_header_from_db():
    """Async wrapper: fetch branding from DB and return PDF header elements."""
    branding = await get_branding_data()
    from utils.export_helpers import get_pdf_company_header
    return get_pdf_company_header(branding)


async def get_pdf_header_elements_from_db(title, subtitle=""):
    """Async wrapper: fetch branding from DB and return PDF header elements with title."""
    branding = await get_branding_data()
    from utils.export_helpers import get_pdf_header_elements
    return get_pdf_header_elements(title, branding, subtitle)


async def get_excel_branding():
    """Fetch branding dict for passing to style_excel_title."""
    return await get_branding_data()
