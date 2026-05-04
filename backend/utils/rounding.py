"""
v104.44.97 — Commercial rounding utility for amount fields.

Python's built-in round() uses banker's rounding (50.5 → 50, NOT 51) which is
problematic for ledger / cash book amounts. Use this for ALL amount fields that
are user-facing (cash_transactions, local_party_accounts, payments etc).

Rules:
    49.49  → 49
    49.50  → 50    ✅ (NOT 49 like Python's round)
    50.50  → 51    ✅ (NOT 50 like Python's round)
    -49.50 → -50
"""
import math


def commercial_round(x):
    """Half-up commercial rounding to integer.

    Returns 0 for None / falsy non-numeric inputs.
    Preserves sign for negative numbers (-49.50 → -50).
    """
    if x is None or x == "":
        return 0
    try:
        x = float(x)
    except (TypeError, ValueError):
        return 0
    if x >= 0:
        return math.floor(x + 0.5)
    return -math.floor(abs(x) + 0.5)


def round_amount(d, key="amount"):
    """In-place round an amount key on a dict. Returns the dict for chaining."""
    if d and key in d:
        d[key] = commercial_round(d[key])
    return d
