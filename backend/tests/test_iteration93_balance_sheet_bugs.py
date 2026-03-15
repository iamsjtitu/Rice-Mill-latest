"""
Test Suite for Balance Sheet Bug Fixes (Iteration 93)
=====================================================
Tests three critical bugs:
1. Truck calculation: uses (qntl - bag/100) * rate, matching entry creation
2. Diesel accounts: should appear even when diesel_pumps collection is empty
3. cutting_rate=0: should not default to 5 (nullish coalescing fix)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestBalanceSheetBugFixes:
    """Tests for the three P0 bug fixes in Balance Sheet"""

    def test_api_health(self):
        """Test that fy-summary API is accessible"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        assert response.status_code == 200, f"FY Summary API failed: {response.text}"
        data = response.json()
        assert "cash_bank" in data
        assert "diesel" in data

    def test_balance_sheet_api_accessible(self):
        """Test that balance-sheet endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-2026")
        assert response.status_code == 200, f"Balance Sheet API failed: {response.text}"
        data = response.json()
        assert "total_liabilities" in data
        assert "total_assets" in data
        assert "truck_accounts" in data
        assert "agent_accounts" in data

    def test_balance_sheet_balances(self):
        """Bug Fix Verification: Balance sheet should balance"""
        response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        total_liabilities = data.get("total_liabilities", 0)
        total_assets = data.get("total_assets", 0)
        
        assert total_liabilities == total_assets, \
            f"Balance sheet not balanced: Liabilities={total_liabilities}, Assets={total_assets}"

    def test_truck_calculation_uses_correct_formula(self):
        """Bug Fix 1: Truck gross should use (qntl - bag/100) * rate, not final_w/100"""
        # Get entries for truck OD15A1234
        entries_response = requests.get(f"{BASE_URL}/api/entries?kms_year=2025-2026")
        assert entries_response.status_code == 200
        entries = [e for e in entries_response.json() if e.get("truck_no") == "OD15A1234"]
        
        if not entries:
            pytest.skip("No entries for truck OD15A1234")
        
        # Calculate expected gross using correct formula (qntl - bag/100) * rate
        expected_gross = 0
        for e in entries:
            qntl = e.get("qntl", 0)
            bag = e.get("bag", 0)
            rate = e.get("rate_per_qntl", 32)
            net_qntl = qntl - bag / 100
            expected_gross += round(net_qntl * rate, 2)
        
        # Get balance sheet and verify truck calculation
        bs_response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-2026")
        assert bs_response.status_code == 200
        data = bs_response.json()
        
        truck = next((t for t in data.get("truck_accounts", []) if t["name"] == "OD15A1234"), None)
        assert truck is not None, "Truck OD15A1234 not found in balance sheet"
        
        # Verify the total matches our expected calculation
        assert truck["total"] == expected_gross, \
            f"Truck total mismatch: got {truck['total']}, expected {expected_gross}"
        
    def test_truck_balance_should_be_zero_when_fully_paid(self):
        """Bug Fix 1 Verification: With correct formula, fully paid trucks should have balance=0"""
        bs_response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-2026")
        assert bs_response.status_code == 200
        data = bs_response.json()
        
        truck = next((t for t in data.get("truck_accounts", []) if t["name"] == "OD15A1234"), None)
        if truck:
            # OD15A1234 should have balance=0 after bug fix (was -1121.28 before)
            assert truck["balance"] == 0.0, \
                f"Truck OD15A1234 balance should be 0.0, got {truck['balance']}"

    def test_diesel_accounts_in_fy_summary(self):
        """Bug Fix 2: Diesel accounts should appear in FY summary"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        diesel = data.get("diesel", [])
        assert len(diesel) > 0, "Diesel section should have entries"
        
        # Verify Lokesh Fuels is present
        lokesh = next((d for d in diesel if "Lokesh" in d.get("pump_name", "")), None)
        assert lokesh is not None, "Lokesh Fuels should be in diesel accounts"

    def test_diesel_in_balance_sheet_creditors(self):
        """Bug Fix 2: Diesel accounts with positive balance should appear in Sundry Creditors"""
        response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        # Find Sundry Creditors
        creditors = next((l for l in data.get("liabilities", []) if l["group"] == "Sundry Creditors"), None)
        assert creditors is not None, "Sundry Creditors should exist in liabilities"
        
        # Check for diesel items in children
        diesel_items = [c for c in creditors.get("children", []) if "Diesel" in c.get("name", "")]
        
        # If diesel has positive balance, it should appear in creditors
        fy_response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        fy_data = fy_response.json()
        diesel_with_balance = [d for d in fy_data.get("diesel", []) if d.get("closing_balance", 0) > 0]
        
        if diesel_with_balance:
            assert len(diesel_items) > 0, \
                "Diesel accounts with positive balance should appear in Sundry Creditors"

    def test_cutting_rate_zero_not_defaulting_to_five(self):
        """Bug Fix 3: cutting_rate=0 should calculate as 0, not default to 5"""
        # Get mandi targets
        targets_response = requests.get(f"{BASE_URL}/api/mandi-targets?kms_year=2025-2026")
        assert targets_response.status_code == 200
        targets = targets_response.json()
        
        # Find Gokul (has cutting_rate=0)
        gokul_target = next((t for t in targets if t.get("mandi_name") == "Gokul"), None)
        if not gokul_target:
            pytest.skip("Gokul mandi target not found")
        
        # Verify cutting_rate is 0
        assert gokul_target.get("cutting_rate") == 0.0, \
            f"Gokul should have cutting_rate=0, got {gokul_target.get('cutting_rate')}"
        
        # Calculate expected agent amount with cutting_rate=0
        target_qntl = gokul_target.get("target_qntl", 0)
        base_rate = gokul_target.get("base_rate", 10)
        cutting_percent = gokul_target.get("cutting_percent", 0)
        cutting_qntl = target_qntl * cutting_percent / 100
        
        # Correct calculation: cutting_rate=0 means no cutting amount
        correct_total = target_qntl * base_rate + cutting_qntl * 0  # = target_qntl * base_rate
        # Buggy calculation would be: target_qntl * base_rate + cutting_qntl * 5
        buggy_total = target_qntl * base_rate + cutting_qntl * 5
        
        # Get balance sheet and verify Gokul agent amount
        bs_response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-2026")
        assert bs_response.status_code == 200
        data = bs_response.json()
        
        gokul_agent = next((a for a in data.get("agent_accounts", []) if a["name"] == "Gokul"), None)
        assert gokul_agent is not None, "Gokul should be in agent_accounts"
        
        assert gokul_agent["total"] == correct_total, \
            f"Gokul total should be {correct_total}, got {gokul_agent['total']} (buggy would be {buggy_total})"

    def test_barsana_agent_amount_with_nonzero_cutting_rate(self):
        """Verify agent amount calculation with non-zero cutting_rate (control test)"""
        # Get mandi targets
        targets_response = requests.get(f"{BASE_URL}/api/mandi-targets?kms_year=2025-2026")
        assert targets_response.status_code == 200
        targets = targets_response.json()
        
        # Find Barsana (has cutting_rate=10)
        barsana_target = next((t for t in targets if t.get("mandi_name") == "Barsana"), None)
        if not barsana_target:
            pytest.skip("Barsana mandi target not found")
        
        # Calculate expected agent amount
        target_qntl = barsana_target.get("target_qntl", 0)
        base_rate = barsana_target.get("base_rate", 10)
        cutting_percent = barsana_target.get("cutting_percent", 0)
        cutting_rate = barsana_target.get("cutting_rate", 0)
        cutting_qntl = target_qntl * cutting_percent / 100
        
        expected_total = target_qntl * base_rate + cutting_qntl * cutting_rate
        
        # Get balance sheet and verify
        bs_response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-2026")
        assert bs_response.status_code == 200
        data = bs_response.json()
        
        barsana_agent = next((a for a in data.get("agent_accounts", []) if a["name"] == "Barsana"), None)
        assert barsana_agent is not None, "Barsana should be in agent_accounts"
        
        assert barsana_agent["total"] == expected_total, \
            f"Barsana total should be {expected_total}, got {barsana_agent['total']}"


class TestOrphanDieselHandling:
    """Tests for orphaned diesel accounts (pump_id not in diesel_pumps)"""
    
    def test_diesel_pumps_endpoint(self):
        """Verify diesel_pumps endpoint works"""
        response = requests.get(f"{BASE_URL}/api/diesel-pumps")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_diesel_accounts_endpoint(self):
        """Verify diesel_accounts endpoint works"""
        response = requests.get(f"{BASE_URL}/api/diesel-accounts?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
