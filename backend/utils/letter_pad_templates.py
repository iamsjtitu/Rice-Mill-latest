"""
Pre-seeded Letter Pad templates for rice millers.
Used by all 3 backends (Python / Electron / Local-Server) — keep IDs stable.
"""

LETTER_PAD_TEMPLATES = [
    {
        "id": "bank_statement",
        "name": "Bank Statement Request",
        "category": "Banking",
        "icon": "Banknote",
        "to_address": "The Branch Manager,\nState Bank of India,\n[Branch Name & Address]",
        "subject": "Request for Account Statement",
        "references": "Account No.: __________________\nAccount Holder: M/s [Company Name]",
        "body": (
            "Respected Sir/Madam,\n\n"
            "We hereby request you to kindly issue us the account statement for our "
            "Current Account mentioned above for the period from __/__/____ to __/__/____ "
            "for our internal accounting and audit purposes.\n\n"
            "We request you to provide the statement at the earliest. We shall be highly "
            "obliged for your kind cooperation.\n\n"
            "Thanking you."
        ),
    },
    {
        "id": "supplier_reminder",
        "name": "Supplier Payment Reminder",
        "category": "Payments",
        "icon": "AlertCircle",
        "to_address": "M/s [Supplier Name],\n[Supplier Address]",
        "subject": "Reminder for Pending Payment Receipt",
        "references": "Invoice No.: __________________\nInvoice Date: __/__/____\nAmount: Rs. ____________",
        "body": (
            "Respected Sir,\n\n"
            "This is to bring to your kind notice that the payment against the above "
            "referred invoice is still outstanding at your end. Despite our earlier "
            "communications, we have not received the said payment so far.\n\n"
            "We request you to kindly arrange the payment at the earliest to avoid any "
            "inconvenience and to maintain our business relationship smoothly.\n\n"
            "Thanking you."
        ),
    },
    {
        "id": "agent_dispute",
        "name": "Agent Commission Dispute",
        "category": "Disputes",
        "icon": "FileWarning",
        "to_address": "M/s [Agent Name],\n[Mandi Name],\n[Address]",
        "subject": "Discrepancy in Commission / Cutting Calculation",
        "references": "Period: __/__/____ to __/__/____\nVehicle / Truck Numbers: __________",
        "body": (
            "Respected Sir,\n\n"
            "On reconciliation of accounts for the above mentioned period, we have "
            "observed certain discrepancies in the commission and cutting amounts "
            "claimed by you against the trucks supplied through your agency.\n\n"
            "As per our records, the agreed commission rate is Rs. ____ per quintal "
            "with cutting of ____%. The difference works out to Rs. __________ in "
            "your favour.\n\n"
            "We request you to verify the same with your records and clarify the "
            "discrepancy. Pending clarification, the disputed amount shall be held "
            "in suspense.\n\n"
            "Thanking you."
        ),
    },
    {
        "id": "govt_inquiry",
        "name": "Reply to Govt. Office Inquiry",
        "category": "Government",
        "icon": "Building2",
        "to_address": "The [Designation],\nOffice of the [Department],\n[Address]",
        "subject": "Reply to your letter dated __/__/____",
        "references": "Your Ref. No.: __________\nDate: __/__/____",
        "body": (
            "Respected Sir/Madam,\n\n"
            "With reference to your above mentioned letter, we hereby submit the "
            "required information / clarification as under:\n\n"
            "1. ________________________________________________________\n"
            "2. ________________________________________________________\n"
            "3. ________________________________________________________\n\n"
            "All relevant supporting documents are enclosed herewith for your kind "
            "perusal. In case any further information is required, we shall be glad "
            "to provide the same.\n\n"
            "Thanking you."
        ),
    },
    {
        "id": "truck_owner_notice",
        "name": "Truck Owner Payment Notice",
        "category": "Transport",
        "icon": "Truck",
        "to_address": "M/s [Truck Owner Name],\nVehicle No.: __________",
        "subject": "Settlement of Trip Account",
        "references": "Trip Period: __/__/____ to __/__/____",
        "body": (
            "Respected Sir,\n\n"
            "We are pleased to inform you that your trip account for the period "
            "mentioned above has been finalized. The detailed bifurcation is as under:\n\n"
            "Gross Bhada Amount: Rs. __________\n"
            "Less: Diesel / Advance: Rs. __________\n"
            "Less: Cutting / Other Deductions: Rs. __________\n"
            "Net Payable: Rs. __________\n\n"
            "The net payable amount shall be released on or before __/__/____ subject "
            "to submission of all original documents at our office.\n\n"
            "Thanking you."
        ),
    },
    {
        "id": "paddy_quality",
        "name": "Paddy Quality Complaint",
        "category": "Quality",
        "icon": "AlertTriangle",
        "to_address": "M/s [Mandi / Agent Name],\n[Address]",
        "subject": "Complaint regarding sub-standard Paddy supply",
        "references": "Truck No.: __________\nDate of Receipt: __/__/____\nBilty No.: __________",
        "body": (
            "Respected Sir,\n\n"
            "We regret to inform you that the consignment of paddy received from your "
            "end against the above reference has been found to be of sub-standard "
            "quality. On checking, the following deviations have been observed:\n\n"
            "- Excess moisture content: ____%\n"
            "- Foreign matter / dust: ____%\n"
            "- Discoloured / damaged grains: ____%\n\n"
            "As per the agreed terms, such quality is not acceptable. We request you "
            "to either replace the consignment or agree to the appropriate cutting "
            "before final settlement.\n\n"
            "Thanking you."
        ),
    },
    {
        "id": "noc_request",
        "name": "NOC Request",
        "category": "Compliance",
        "icon": "FileCheck",
        "to_address": "The [Authority Name],\n[Office Address]",
        "subject": "Request for No Objection Certificate (NOC)",
        "references": "Mill License No.: __________\nFactory Address: __________",
        "body": (
            "Respected Sir/Madam,\n\n"
            "We, M/s [Company Name], are running a rice milling unit at the above "
            "mentioned address. We hereby request your kind office to issue us a "
            "No Objection Certificate (NOC) for the purpose of __________________ "
            "_____________________________.\n\n"
            "All necessary documents — license copy, address proof, and applicable "
            "fee receipt — are enclosed herewith for your reference.\n\n"
            "We request you to kindly issue the said NOC at the earliest. We shall "
            "be highly obliged for your kind cooperation.\n\n"
            "Thanking you."
        ),
    },
    {
        "id": "gst_compliance",
        "name": "GST Compliance Reply",
        "category": "Tax",
        "icon": "Receipt",
        "to_address": "The Superintendent / Proper Officer,\nGST Range: __________,\n[Address]",
        "subject": "Reply / Compliance to GST Notice",
        "references": "GSTIN: __________\nNotice No.: __________\nNotice Date: __/__/____",
        "body": (
            "Respected Sir/Madam,\n\n"
            "With reference to the above mentioned notice issued by your office, we "
            "submit the following compliance / reply for your kind consideration:\n\n"
            "1. The discrepancy pointed out in the notice is duly verified from our "
            "books of accounts.\n"
            "2. The required documents — invoices, e-way bills, and ledger extracts — "
            "are enclosed herewith.\n"
            "3. Any short-payment / interest, if any, has been deposited vide "
            "Challan No. __________ dated __/__/____.\n\n"
            "We request you to kindly accept this compliance and drop the proceedings. "
            "We assure you of full cooperation in any further verification required.\n\n"
            "Thanking you."
        ),
    },
]


def get_templates():
    """Return list of templates without large body text (for picker UI)."""
    return [
        {
            "id": t["id"],
            "name": t["name"],
            "category": t["category"],
            "icon": t.get("icon", "FileText"),
            "preview": t["subject"],
        }
        for t in LETTER_PAD_TEMPLATES
    ]


def get_template_by_id(tid: str):
    for t in LETTER_PAD_TEMPLATES:
        if t["id"] == tid:
            return t
    return None
