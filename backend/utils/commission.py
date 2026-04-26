"""
Agent Commission Cap Helper
============================
Business rule (v104.28.38+): Agent commission is paid on the contracted scope only —
that is `target_qntl + (target_qntl × cutting%)`. Anything the agent delivers ABOVE
this cap is treated as Private Paddy Purchase (move-to-pvt) and the agent gets
NEITHER `base_rate` nor `cutting_rate` on that excess.

Example:
    target = 5000, cutting% = 5  →  expected_max = 5250
    agent delivered TP = 5500    →  capped_tp = 5250
    agent commission base = 5250 (not 5500)
    extra 250 Q  → goes to Pvt Purchase ledger separately
"""


def capped_tp_for_commission(tp_weight, target_qntl, cutting_pct):
    """Return the TP weight to be used for agent commission, capped at
    target_qntl × (1 + cutting_pct/100). If `target_qntl` is 0 / falsy
    (no target set for that mandi), return `tp_weight` unchanged.
    """
    try:
        tp = float(tp_weight or 0)
    except (TypeError, ValueError):
        tp = 0.0
    try:
        tg = float(target_qntl or 0)
    except (TypeError, ValueError):
        tg = 0.0
    try:
        cp = float(cutting_pct or 0)
    except (TypeError, ValueError):
        cp = 0.0
    if tg <= 0:
        return tp
    cap = tg * (1 + cp / 100.0)
    return min(tp, cap)
