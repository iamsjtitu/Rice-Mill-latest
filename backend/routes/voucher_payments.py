from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from database import db
from typing import Optional
from datetime import datetime, timezone
import uuid

router = APIRouter()


@router.post("/voucher-payment")
async def make_voucher_payment(request: Request):
    """Universal payment endpoint for any voucher type (sale/purchase/gunny)"""
    data = await request.json()
    voucher_type = data.get("voucher_type", "")  # sale / purchase / gunny
    voucher_id = data.get("voucher_id", "")
    amount = float(data.get("amount", 0))
    date = data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    notes = data.get("notes", "")
    username = data.get("username", "system")
    kms_year = data.get("kms_year", "")
    season = data.get("season", "")
    pay_account = data.get("account", "cash")  # cash or bank
    bank_name = data.get("bank_name", "")

    if not voucher_id or amount <= 0:
        raise HTTPException(status_code=400, detail="Voucher ID aur amount (>0) required hai")

    # Find the voucher
    collection_map = {"sale": "sale_vouchers", "purchase": "purchase_vouchers", "gunny": "gunny_bags"}
    coll_name = collection_map.get(voucher_type)
    if not coll_name:
        raise HTTPException(status_code=400, detail="Invalid voucher type")

    coll = db[coll_name]
    voucher = await coll.find_one({"id": voucher_id}, {"_id": 0})
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")

    party = (voucher.get("party_name") or voucher.get("source") or "").strip()
    if not party:
        raise HTTPException(status_code=400, detail="Voucher mein party name nahi hai")

    now_iso = datetime.now(timezone.utc).isoformat()
    base = {"kms_year": kms_year or voucher.get("kms_year", ""), "season": season or voucher.get("season", ""), "created_by": username, "created_at": now_iso, "updated_at": now_iso}
    payment_id = str(uuid.uuid4())

    # Determine if this is payment received (sale) or payment made (purchase/gunny)
    if voucher_type == "sale":
        # Sale: party pays us → Cash JAMA (cash coming in), Party Ledger NIKASI (reduces party debt)
        source_label = f"Sale #{voucher.get('voucher_no', '')}"
        party_type = "Sale Book"

        # Cash/Bank JAMA - payment coming in
        cash_entry = {
            "id": str(uuid.uuid4()), "date": date, "account": pay_account, "txn_type": "jama",
            "amount": round(amount, 2), "category": party, "party_type": party_type,
            "description": f"Payment received - {source_label} - {party}" + (f" ({notes})" if notes else ""),
            "reference": f"voucher_payment:{payment_id}", **base
        }
        if pay_account == "bank" and bank_name:
            cash_entry["bank_name"] = bank_name
        # Ledger NIKASI - reduces what party owes us
        ledger_entry = {
            "id": str(uuid.uuid4()), "date": date, "account": "ledger", "txn_type": "nikasi",
            "amount": round(amount, 2), "category": party, "party_type": party_type,
            "description": f"Payment received - {source_label} - {party}" + (f" ({notes})" if notes else ""),
            "reference": f"voucher_payment_ledger:{payment_id}", **base
        }
        await db.cash_transactions.insert_one(cash_entry)
        await db.cash_transactions.insert_one(ledger_entry)

        # Local party payment entry (txn_type=payment since party is paying us)
        lp_entry = {
            "id": str(uuid.uuid4()), "date": date, "party_name": party,
            "txn_type": "payment", "amount": round(amount, 2),
            "description": f"Payment received - {source_label}" + (f" ({notes})" if notes else ""),
            "source_type": "sale_voucher_payment", "reference": f"voucher_payment:{payment_id}",
            **base
        }
        await db.local_party_accounts.insert_one(lp_entry)

        # Update voucher paid_amount and balance
        old_paid = voucher.get("paid_amount", 0) or voucher.get("advance", 0) or 0
        new_paid = round(old_paid + amount, 2)
        new_balance = round(voucher.get("total", 0) - new_paid, 2)
        await coll.update_one({"id": voucher_id}, {"$set": {"paid_amount": new_paid, "balance": new_balance}})

    else:
        # Purchase/Gunny: we pay the party → Cash NIKASI (cash going out), Party Ledger NIKASI (reduces our debt)
        if voucher_type == "purchase":
            source_label = f"Purchase #{voucher.get('voucher_no', '')}"
            party_type = "Purchase Voucher"
        else:
            source_label = f"Gunny Bag ({voucher.get('date', '')})"
            party_type = "Gunny Bag"

        # Cash/Bank NIKASI - payment going out
        cash_entry = {
            "id": str(uuid.uuid4()), "date": date, "account": pay_account, "txn_type": "nikasi",
            "amount": round(amount, 2), "category": party, "party_type": party_type,
            "description": f"Payment made - {source_label} - {party}" + (f" ({notes})" if notes else ""),
            "reference": f"voucher_payment:{payment_id}", **base
        }
        if pay_account == "bank" and bank_name:
            cash_entry["bank_name"] = bank_name
        # Ledger NIKASI - reduces what we owe the party
        ledger_entry = {
            "id": str(uuid.uuid4()), "date": date, "account": "ledger", "txn_type": "nikasi",
            "amount": round(amount, 2), "category": party, "party_type": party_type,
            "description": f"Payment made - {source_label} - {party}" + (f" ({notes})" if notes else ""),
            "reference": f"voucher_payment_ledger:{payment_id}", **base
        }
        await db.cash_transactions.insert_one(cash_entry)
        await db.cash_transactions.insert_one(ledger_entry)

        # Local party settlement entry (txn_type=payment means we paid them)
        lp_entry = {
            "id": str(uuid.uuid4()), "date": date, "party_name": party,
            "txn_type": "payment", "amount": round(amount, 2),
            "description": f"Payment made - {source_label}" + (f" ({notes})" if notes else ""),
            "source_type": f"{voucher_type}_voucher_payment", "reference": f"voucher_payment:{payment_id}",
            **base
        }
        await db.local_party_accounts.insert_one(lp_entry)

        # Update voucher
        if voucher_type == "purchase":
            old_paid = voucher.get("paid_amount", 0) or voucher.get("advance", 0) or 0
            new_paid = round(old_paid + amount, 2)
            new_balance = round(voucher.get("total", 0) - new_paid, 2)
            await coll.update_one({"id": voucher_id}, {"$set": {"paid_amount": new_paid, "balance": new_balance}})
        else:
            # Gunny bag - update advance
            old_advance = voucher.get("advance", 0) or 0
            new_advance = round(old_advance + amount, 2)
            await coll.update_one({"id": voucher_id}, {"$set": {"advance": new_advance}})

    return {"success": True, "payment_id": payment_id, "amount": amount, "party": party}



@router.get("/voucher-payment/history/{party_name}")
async def get_voucher_payment_history(party_name: str, party_type: str = ""):
    """Get payment history for a party from the ledger (source of truth)"""
    query = {"account": "ledger", "txn_type": "nikasi", "category": party_name}
    if party_type:
        query["party_type"] = party_type
    ledger_payments = await db.cash_transactions.find(query, {"_id": 0}).to_list(50000)
    history = []
    for txn in ledger_payments:
        ref = txn.get("reference", "")
        # Extract payment_id from reference like "voucher_payment_ledger:{payment_id}" or "sale_voucher_adv:{id}"
        payment_id = ""
        if ref.startswith("voucher_payment_ledger:"):
            payment_id = ref.replace("voucher_payment_ledger:", "")
        history.append({
            "id": txn.get("id", ""),
            "payment_id": payment_id,
            "amount": txn.get("amount", 0),
            "date": txn.get("created_at") or txn.get("date", ""),
            "note": txn.get("description", ""),
            "by": txn.get("created_by", "system"),
            "reference": ref,
            "source": "ledger",
            "can_undo": bool(payment_id)
        })
    history.sort(key=lambda h: h.get("date", ""), reverse=True)
    total_paid = round(sum(h.get("amount", 0) for h in history), 2)
    return {"history": history, "total_paid": total_paid}


@router.post("/voucher-payment/undo")
async def undo_voucher_payment(request: Request):
    """Undo a voucher payment by deleting all related entries (cash, ledger, local_party)"""
    data = await request.json()
    payment_id = data.get("payment_id", "")
    if not payment_id:
        raise HTTPException(status_code=400, detail="payment_id required hai")

    # Find the cash entry to get the voucher details
    cash_entry = await db.cash_transactions.find_one(
        {"reference": f"voucher_payment:{payment_id}"}, {"_id": 0}
    )
    if not cash_entry:
        raise HTTPException(status_code=404, detail="Payment entry not found")

    amount = cash_entry.get("amount", 0)
    party = cash_entry.get("category", "")
    party_type = cash_entry.get("party_type", "")

    # Delete cash/bank entry
    del_cash = await db.cash_transactions.delete_many({"reference": f"voucher_payment:{payment_id}"})
    # Delete ledger entry
    del_ledger = await db.cash_transactions.delete_many({"reference": f"voucher_payment_ledger:{payment_id}"})
    # Delete local_party_accounts entry
    del_lp = await db.local_party_accounts.delete_many({"reference": f"voucher_payment:{payment_id}"})

    # Update voucher paid_amount
    collection_map = {"Sale Book": "sale_vouchers", "Purchase Voucher": "purchase_vouchers", "Gunny Bag": "gunny_bags"}
    coll_name = collection_map.get(party_type)
    if coll_name and party:
        coll = db[coll_name]
        voucher = await coll.find_one({"party_name": party}, {"_id": 0})
        if voucher:
            old_paid = voucher.get("paid_amount", 0) or 0
            new_paid = max(round(old_paid - amount, 2), 0)
            new_balance = round(voucher.get("total", 0) - new_paid, 2)
            await coll.update_one({"id": voucher["id"]}, {"$set": {"paid_amount": new_paid, "balance": new_balance}})

    total_deleted = del_cash.deleted_count + del_ledger.deleted_count + del_lp.deleted_count
    return {"success": True, "deleted_count": total_deleted, "amount": amount, "party": party}



# ============ SALE INVOICE PDF ============

@router.get("/sale-book/invoice/{voucher_id}")
async def get_sale_invoice(voucher_id: str):
    """Generate a professional invoice PDF for a sale voucher"""
    voucher = await db.sale_vouchers.find_one({"id": voucher_id}, {"_id": 0})
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")

    branding = await db.settings.find_one({"key": "branding"}, {"_id": 0}) or {}
    company = branding.get("company_name", "NAVKAR AGRO")
    address = branding.get("address", "")
    phone = branding.get("phone", "")
    gstin = branding.get("gstin", "")
    tagline = branding.get("tagline", "")

    items = voucher.get("items", [])
    dp = str(voucher.get("date", "")).split("-")
    fmt_date = f"{dp[2]}-{dp[1]}-{dp[0]}" if len(dp) == 3 else voucher.get("date", "")

    # Build items rows
    items_html = ""
    for idx, item in enumerate(items, 1):
        items_html += f"""<tr>
            <td class="c">{idx}</td>
            <td>{item.get('item_name', '')}</td>
            <td class="r">{item.get('quantity', 0)} {item.get('unit', 'Qntl')}</td>
            <td class="r">Rs.{item.get('rate', 0):,.2f}</td>
            <td class="r b">Rs.{item.get('amount', 0):,.2f}</td>
        </tr>"""

    gst_html = ""
    if voucher.get("gst_type") == "cgst_sgst":
        gst_html = f"""
        <tr><td colspan="4" class="r">CGST ({voucher.get('cgst_percent', 0)}%):</td><td class="r">Rs.{voucher.get('cgst_amount', 0):,.2f}</td></tr>
        <tr><td colspan="4" class="r">SGST ({voucher.get('sgst_percent', 0)}%):</td><td class="r">Rs.{voucher.get('sgst_amount', 0):,.2f}</td></tr>"""
    elif voucher.get("gst_type") == "igst":
        gst_html = f"""<tr><td colspan="4" class="r">IGST ({voucher.get('igst_percent', 0)}%):</td><td class="r">Rs.{voucher.get('igst_amount', 0):,.2f}</td></tr>"""

    paid_amount = voucher.get("paid_amount", 0) or voucher.get("advance", 0) or 0
    balance = voucher.get("balance", 0) or 0

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page {{ size: A4; margin: 15mm; }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #222; }}
    .invoice-box {{ max-width: 800px; margin: 0 auto; padding: 20px; border: 2px solid #1a5276; }}
    .header {{ text-align: center; border-bottom: 3px double #1a5276; padding-bottom: 12px; margin-bottom: 15px; }}
    .header h1 {{ font-size: 24px; color: #1a5276; letter-spacing: 2px; margin-bottom: 4px; }}
    .header .sub {{ font-size: 11px; color: #555; }}
    .header .gstin {{ font-size: 10px; color: #777; margin-top: 3px; }}
    .invoice-title {{ text-align: center; font-size: 16px; font-weight: bold; color: #1a5276; margin: 10px 0; padding: 5px; background: #f0f5fa; border: 1px solid #1a5276; }}
    .meta {{ display: flex; justify-content: space-between; margin-bottom: 15px; padding: 10px; background: #f8f9fa; border: 1px solid #ddd; }}
    .meta-left, .meta-right {{ font-size: 11px; }}
    .meta-left p, .meta-right p {{ margin: 3px 0; }}
    .meta-label {{ color: #666; font-weight: 600; }}
    table {{ width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; }}
    th {{ background: #1a5276; color: white; padding: 8px 6px; text-align: left; font-weight: 600; }}
    td {{ padding: 7px 6px; border-bottom: 1px solid #ddd; }}
    .r {{ text-align: right; }} .c {{ text-align: center; }} .b {{ font-weight: 700; }}
    .subtotal-row {{ background: #f0f5fa; }}
    .subtotal-row td {{ border-top: 2px solid #1a5276; font-weight: 600; }}
    .total-row {{ background: #1a5276; }}
    .total-row td {{ color: white; font-weight: 700; font-size: 13px; padding: 10px 6px; }}
    .payment-section {{ margin-top: 15px; padding: 10px; border: 1px solid #ddd; background: #fafafa; }}
    .payment-section h3 {{ font-size: 12px; color: #1a5276; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }}
    .payment-row {{ display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px; }}
    .footer {{ margin-top: 30px; display: flex; justify-content: space-between; }}
    .footer-left, .footer-right {{ font-size: 10px; }}
    .signature {{ text-align: right; margin-top: 50px; border-top: 1px solid #333; padding-top: 5px; width: 200px; float: right; }}
    </style></head><body>
    <div class="invoice-box">
        <div class="header">
            <h1>{company}</h1>
            {"<div class='sub'>" + tagline + "</div>" if tagline else ""}
            {"<div class='sub'>" + address + "</div>" if address else ""}
            {"<div class='sub'>Phone: " + phone + "</div>" if phone else ""}
            {"<div class='gstin'>GSTIN: " + gstin + "</div>" if gstin else ""}
        </div>
        <div class="invoice-title">TAX INVOICE / बिक्री बिल</div>
        <div class="meta">
            <div class="meta-left">
                <p><span class="meta-label">Invoice No:</span> {voucher.get('invoice_no', '-')}</p>
                <p><span class="meta-label">Voucher No:</span> #{voucher.get('voucher_no', '')}</p>
                <p><span class="meta-label">Date:</span> {fmt_date}</p>
            </div>
            <div class="meta-right">
                <p><span class="meta-label">Party:</span> <strong>{voucher.get('party_name', '')}</strong></p>
                <p><span class="meta-label">Truck No:</span> {voucher.get('truck_no', '-')}</p>
                <p><span class="meta-label">RST No:</span> {voucher.get('rst_no', '-')}</p>
            </div>
        </div>

        <table>
            <tr><th class="c">#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr>
            {items_html}
            <tr class="subtotal-row"><td colspan="4" class="r">Subtotal:</td><td class="r b">Rs.{voucher.get('subtotal', 0):,.2f}</td></tr>
            {gst_html}
            <tr class="total-row"><td colspan="4" class="r">GRAND TOTAL:</td><td class="r">Rs.{voucher.get('total', 0):,.2f}</td></tr>
        </table>

        <div class="payment-section">
            <h3>Payment Details</h3>
            <div class="payment-row"><span>Advance / Payment Received:</span><span class="b">Rs.{paid_amount:,.2f}</span></div>
            <div class="payment-row"><span>Cash Paid (Truck):</span><span>Rs.{voucher.get('cash_paid', 0):,.2f}</span></div>
            <div class="payment-row"><span>Diesel Paid:</span><span>Rs.{voucher.get('diesel_paid', 0):,.2f}</span></div>
            <div class="payment-row" style="border-top:1px solid #999;padding-top:5px;margin-top:5px;">
                <span class="b">Balance Due:</span>
                <span class="b" style="color:{'#c0392b' if balance > 0 else '#27ae60'}">Rs.{balance:,.2f}</span>
            </div>
        </div>

        {"<p style='margin-top:10px;font-size:10px;color:#666;'>Remark: " + voucher.get('remark', '') + "</p>" if voucher.get('remark') else ""}

        <div class="signature">
            <p>Authorized Signatory</p>
            <p style="font-size:10px;color:#666;margin-top:3px;">{company}</p>
        </div>
        <div style="clear:both;"></div>
        <div style="text-align:center;margin-top:20px;font-size:9px;color:#999;border-top:1px solid #ddd;padding-top:8px;">
            Generated on {datetime.now().strftime('%d-%m-%Y %H:%M')} | {company}
        </div>
    </div>
    </body></html>"""

    return Response(content=html, media_type="text/html")
