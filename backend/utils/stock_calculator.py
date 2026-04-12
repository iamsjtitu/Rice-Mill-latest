"""
Centralized Stock Calculator
All stock-related computations live HERE. Routes only fetch data and call these.
"""

BY_PRODUCTS = ["bran", "kunda", "broken", "kanki", "husk"]


def get_dynamic_byproducts(categories=None):
    """Return list of by-product IDs from dynamic categories or fallback to default."""
    if categories:
        return [c["id"] for c in categories]
    return BY_PRODUCTS


def calc_cmr_paddy_in(mill_entries: list) -> float:
    """CMR (govt) paddy received = qntl - bag deduction - pkt cut"""
    return round(sum(
        e.get('qntl', 0) - e.get('bag', 0) / 100 - e.get('p_pkt_cut', 0) / 100
        for e in mill_entries
    ), 2)


def calc_pvt_paddy_in(pvt_paddy: list) -> float:
    """Private paddy received - prefer final_qntl (pre-computed), fallback to qntl - bag/100"""
    return round(sum(
        e.get('final_qntl', 0) or (e.get('qntl', 0) - e.get('bag', 0) / 100)
        for e in pvt_paddy
    ), 2)


def calc_paddy_used(milling: list) -> float:
    """Paddy consumed by milling"""
    return round(sum(e.get('paddy_input_qntl', 0) for e in milling), 2)


def calc_rice_produced(milling: list, rice_type: str) -> float:
    """Rice produced by milling. rice_type = 'usna' or 'raw'"""
    if rice_type == 'usna':
        return round(sum(e.get('rice_qntl', 0) for e in milling if e.get('rice_type', '').lower() in ('usna', 'parboiled')), 2)
    elif rice_type == 'raw':
        return round(sum(e.get('rice_qntl', 0) for e in milling if e.get('rice_type', '').lower() == 'raw'), 2)
    return 0


def calc_govt_delivered(dc: list) -> float:
    """Rice delivered to govt via DC"""
    return round(sum(e.get('quantity_qntl', 0) for e in dc), 2)


def calc_pvt_rice_sold(pvt_sales: list, rice_type: str) -> float:
    """Private rice sold. rice_type = 'usna' or 'raw'"""
    if rice_type == 'usna':
        return round(sum(s.get('quantity_qntl', 0) for s in pvt_sales if s.get('rice_type', '').lower() in ('usna', 'parboiled')), 2)
    elif rice_type == 'raw':
        return round(sum(s.get('quantity_qntl', 0) for s in pvt_sales if s.get('rice_type', '').lower() == 'raw'), 2)
    return 0


def calc_sale_voucher_items(sale_vouchers: list) -> dict:
    """Aggregate sold quantities from sale vouchers: {item_name: total_qty}"""
    sb_sold = {}
    for sv in sale_vouchers:
        for item in sv.get('items', []):
            name = item.get('item_name', '')
            sb_sold[name] = sb_sold.get(name, 0) + (item.get('quantity', 0) or 0)
    return sb_sold


def calc_purchase_voucher_items(purchase_vouchers: list) -> dict:
    """Aggregate bought quantities from purchase vouchers: {item_name: total_qty}"""
    pv_bought = {}
    for pv in purchase_vouchers:
        for item in pv.get('items', []):
            name = item.get('item_name', '')
            pv_bought[name] = pv_bought.get(name, 0) + (item.get('quantity', 0) or 0)
    return pv_bought


def calc_byproduct_produced(milling: list, categories=None) -> dict:
    """By-product quantities produced from milling: {product: total_qntl}"""
    bp = {}
    products = get_dynamic_byproducts(categories)
    for p in products:
        bp[p] = round(sum(e.get(f'{p}_qntl', 0) for e in milling), 2)
    return bp


def calc_byproduct_sold(bp_sales: list) -> dict:
    """By-product quantities sold: {product: total_qntl}"""
    bp_sold = {}
    for s in bp_sales:
        prod = s.get('product', '')
        bp_sold[prod] = bp_sold.get(prod, 0) + s.get('quantity_qntl', 0)
    return bp_sold


def calc_frk_in(frk_purchases: list) -> float:
    """FRK quantity purchased"""
    return round(sum(e.get('quantity_qntl', 0) or e.get('quantity', 0) for e in frk_purchases), 2)
