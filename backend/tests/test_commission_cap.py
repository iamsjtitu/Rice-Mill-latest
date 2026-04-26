"""
Regression test for v104.28.38 — Agent commission cap helper.

Business rule: Agent commission is paid on the contracted scope only —
`target_qntl + (target_qntl × cutting%)`. Anything above this cap should go
to Pvt Purchase, not earn agent commission.
"""
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from utils.commission import capped_tp_for_commission


class TestCappedTpForCommission:
    """Verify the cap helper behaves correctly across all real-world cases."""

    def test_over_delivery_caps_at_target_plus_cutting(self):
        # Agent delivered 5500 against a target of 5000 + 5% = 5250 cap
        assert capped_tp_for_commission(5500, 5000, 5) == 5250

    def test_exact_delivery_no_cap_applied(self):
        assert capped_tp_for_commission(5250, 5000, 5) == 5250

    def test_under_delivery_returns_actual_tp(self):
        assert capped_tp_for_commission(4000, 5000, 5) == 4000

    def test_target_only_delivery(self):
        assert capped_tp_for_commission(5000, 5000, 5) == 5000

    def test_no_target_returns_actual_tp(self):
        # When target is 0 / unset, no cap should be applied
        assert capped_tp_for_commission(5500, 0, 5) == 5500
        assert capped_tp_for_commission(5500, None, 5) == 5500

    def test_zero_cutting_caps_at_target(self):
        # When cutting% is 0, cap = target_qntl
        assert capped_tp_for_commission(5500, 5000, 0) == 5000

    def test_handles_falsy_inputs_gracefully(self):
        assert capped_tp_for_commission(None, 5000, 5) == 0
        assert capped_tp_for_commission("", 5000, 5) == 0
        assert capped_tp_for_commission(5500, "5000", "5") == 5250  # numeric strings ok

    def test_user_real_scenario_total_agent_amt(self):
        """User's exact scenario:
        target=5000, cutting=5%, base_rate=10, cutting_rate=5,
        agent delivered tpw=5500 → expected commission = ₹53,812.50
        """
        tpw, target, cut_pct, base_rate, cut_rate = 5500, 5000, 5, 10, 5
        capped = capped_tp_for_commission(tpw, target, cut_pct)
        cutting_qntl = capped * cut_pct / 100
        total = capped * base_rate + cutting_qntl * cut_rate
        assert capped == 5250
        assert cutting_qntl == 262.5
        assert total == 53812.5
        # Old buggy formula would have given 56375 (₹2,562.50 over-payment)
        old_buggy = tpw * base_rate + (tpw * cut_pct / 100) * cut_rate
        assert old_buggy == 56375
        assert old_buggy - total == 2562.5
