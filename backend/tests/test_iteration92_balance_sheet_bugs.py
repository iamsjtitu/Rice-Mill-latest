"""
Test Balance Sheet Bug Fixes for Iteration 92
==============================================

Bug Fix 1: Mandi/Agent target calculation when cutting_rate=0
  - Old Bug: cutting_rate || 5 defaulted 0 to 5, adding extra Rs to agent total
  - Fix: cutting_rate != null ? cutting_rate : 5 (nullish coalescing)
  - Expected: Gokul with cutting_rate=0 should have total=4000 (not 4100)

Bug Fix 2: Truck Payments Not Reflected in Balance Sheet
  - Old Bug: Total = gross - deductions, Paid = external payments only  
  - Fix: Total = gross, Paid = deductions + external payments
  - Expected: Balance = Total - Paid = gross - deductions - external_paid
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestBalanceSheetBugFixes:
    """Test both P0 bug fixes for Balance Sheet"""

    def test_01_balance_sheet_api_returns_200(self):
        """Balance Sheet API should return 200 with correct structure"""
        response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-2026")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify structure
        assert "liabilities" in data, "Missing liabilities in response"
        assert "assets" in data, "Missing assets in response"
        assert "total_liabilities" in data, "Missing total_liabilities"
        assert "total_assets" in data, "Missing total_assets"
        assert "truck_accounts" in data, "Missing truck_accounts"
        assert "agent_accounts" in data, "Missing agent_accounts"
        print(f"PASS: Balance Sheet API returns 200 with correct structure")

    def test_02_mandi_target_cutting_rate_zero(self):
        """
        Bug Fix 1: Verify Gokul mandi with cutting_rate=0 calculates correctly
        Expected: 400 qntl * Rs 10 base_rate + (400 * 5%) * Rs 0 cutting = Rs 4000
        NOT Rs 4100 (which would happen if 0 defaulted to 5)
        """
        # First verify the mandi target data
        targets_response = requests.get(f"{BASE_URL}/api/mandi-targets?kms_year=2025-2026")
        assert targets_response.status_code == 200
        
        targets = targets_response.json()
        if isinstance(targets, dict):
            targets = targets.get('targets', [])
        
        gokul_target = next((t for t in targets if (t.get('mandi_name') or '').lower() == 'gokul'), None)
        assert gokul_target is not None, "Gokul mandi target not found in test data"
        assert gokul_target.get('cutting_rate') == 0, f"Expected cutting_rate=0, got {gokul_target.get('cutting_rate')}"
        print(f"Gokul target data: target_qntl={gokul_target.get('target_qntl')}, base_rate={gokul_target.get('base_rate')}, cutting_rate={gokul_target.get('cutting_rate')}, cutting_percent={gokul_target.get('cutting_percent')}")
        
        # Now verify balance sheet calculation
        bs_response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-2026")
        assert bs_response.status_code == 200
        
        data = bs_response.json()
        agent_accounts = data.get('agent_accounts', [])
        
        gokul_account = next((a for a in agent_accounts if a.get('name', '').lower() == 'gokul'), None)
        assert gokul_account is not None, "Gokul not found in agent_accounts"
        
        # Calculate expected: 400 * 10 + (400 * 5/100) * 0 = 4000
        target_qntl = gokul_target.get('target_qntl', 0)
        base_rate = gokul_target.get('base_rate', 0)
        cutting_percent = gokul_target.get('cutting_percent', 0)
        cutting_rate = gokul_target.get('cutting_rate', 0)  # This is 0, not None
        
        expected_total = target_qntl * base_rate + (target_qntl * cutting_percent / 100) * cutting_rate
        actual_total = gokul_account.get('total', 0)
        
        print(f"Expected Gokul total: {expected_total}")
        print(f"Actual Gokul total: {actual_total}")
        
        # The fix: with cutting_rate=0, total should be 4000, NOT 4100
        assert actual_total == expected_total, f"BUG NOT FIXED: Expected {expected_total}, got {actual_total}"
        assert actual_total == 4000, f"Gokul total should be 4000 (not 4100 which includes Rs100 cutting charge)"
        print("PASS: Bug Fix 1 - cutting_rate=0 is correctly handled, Gokul total = Rs 4000")

    def test_03_mandi_target_cutting_rate_nonzero(self):
        """
        Verify Barsana mandi with cutting_rate=10 calculates correctly
        Expected: 400 qntl * Rs 10 base_rate + (400 * 5%) * Rs 10 cutting = Rs 4200
        """
        targets_response = requests.get(f"{BASE_URL}/api/mandi-targets?kms_year=2025-2026")
        targets = targets_response.json()
        if isinstance(targets, dict):
            targets = targets.get('targets', [])
        
        barsana_target = next((t for t in targets if (t.get('mandi_name') or '').lower() == 'barsana'), None)
        assert barsana_target is not None, "Barsana mandi target not found"
        print(f"Barsana target data: cutting_rate={barsana_target.get('cutting_rate')}")
        
        bs_response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-2026")
        data = bs_response.json()
        agent_accounts = data.get('agent_accounts', [])
        
        barsana_account = next((a for a in agent_accounts if a.get('name', '').lower() == 'barsana'), None)
        assert barsana_account is not None, "Barsana not found in agent_accounts"
        
        # Expected: 400 * 10 + (400 * 5/100) * 10 = 4000 + 200 = 4200
        expected_total = 4200
        actual_total = barsana_account.get('total', 0)
        
        print(f"Expected Barsana total: {expected_total}")
        print(f"Actual Barsana total: {actual_total}")
        
        assert actual_total == expected_total, f"Expected {expected_total}, got {actual_total}"
        print("PASS: Barsana with cutting_rate=10 correctly calculates total = Rs 4200")

    def test_04_truck_accounts_structure(self):
        """
        Bug Fix 2: Verify truck accounts have correct structure
        - total = gross earnings (qntl * rate)
        - paid = deductions (diesel_paid + cash_paid + g_deposite) + external payments
        - balance = total - paid
        """
        bs_response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-2026")
        assert bs_response.status_code == 200
        
        data = bs_response.json()
        truck_accounts = data.get('truck_accounts', [])
        
        assert len(truck_accounts) > 0, "No truck accounts found in test data"
        
        for truck in truck_accounts:
            assert 'name' in truck, "Missing 'name' in truck account"
            assert 'total' in truck, "Missing 'total' in truck account"
            assert 'paid' in truck, "Missing 'paid' in truck account"
            assert 'balance' in truck, "Missing 'balance' in truck account"
            
            # Verify balance calculation: balance = total - paid
            expected_balance = round(truck['total'] - truck['paid'], 2)
            actual_balance = truck['balance']
            assert abs(actual_balance - expected_balance) < 0.01, \
                f"Truck {truck['name']}: balance={actual_balance} should be total({truck['total']}) - paid({truck['paid']}) = {expected_balance}"
            
            print(f"Truck {truck['name']}: total={truck['total']}, paid={truck['paid']}, balance={truck['balance']}")
        
        print("PASS: All truck accounts have correct structure and balance calculation")

    def test_05_truck_od15a1234_calculations(self):
        """
        Verify specific truck OD15A1234 calculations
        - final_w = 46196 kg = 461.96 qntl
        - rate = 32 (from truck_payments)
        - Gross = 461.96 * 32 = 14782.72
        - Deductions = diesel_paid(3000) + cash_paid(2500) = 5500
        - External paid from ledger = 10404
        - Total Paid = 5500 + 10404 = 15904
        - Balance = 14782.72 - 15904 = -1121.28 (overpaid)
        """
        bs_response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-2026")
        data = bs_response.json()
        truck_accounts = data.get('truck_accounts', [])
        
        od15a1234 = next((t for t in truck_accounts if t.get('name') == 'OD15A1234'), None)
        assert od15a1234 is not None, "Truck OD15A1234 not found in balance sheet"
        
        # Verify Total = gross (qntl * rate)
        expected_total = round(461.96 * 32, 2)  # 14782.72
        actual_total = od15a1234.get('total', 0)
        assert abs(actual_total - expected_total) < 1, \
            f"Total should be gross={expected_total}, got {actual_total}"
        print(f"OD15A1234 Total (gross): {actual_total} (expected ~{expected_total})")
        
        # Verify Paid includes deductions + external payments
        # Deductions = 3000 + 2500 + 0 = 5500
        # External = 10404
        # Total Paid = 15904
        expected_paid = 15904
        actual_paid = od15a1234.get('paid', 0)
        assert abs(actual_paid - expected_paid) < 1, \
            f"Paid should include deductions+external={expected_paid}, got {actual_paid}"
        print(f"OD15A1234 Paid (deductions+external): {actual_paid} (expected {expected_paid})")
        
        # Verify Balance = Total - Paid
        expected_balance = round(actual_total - actual_paid, 2)
        actual_balance = od15a1234.get('balance', 0)
        assert abs(actual_balance - expected_balance) < 0.01, \
            f"Balance should be {expected_balance}, got {actual_balance}"
        print(f"OD15A1234 Balance: {actual_balance} (overpaid by Rs {abs(actual_balance)})")
        
        print("PASS: Bug Fix 2 - Truck payments correctly include deductions in 'Paid' column")

    def test_06_balance_sheet_balances(self):
        """
        Verify Balance Sheet totals balance: total_liabilities == total_assets
        This is fundamental accounting - assets must equal liabilities + capital
        """
        bs_response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-2026")
        assert bs_response.status_code == 200
        
        data = bs_response.json()
        total_liabilities = data.get('total_liabilities', 0)
        total_assets = data.get('total_assets', 0)
        
        print(f"Total Liabilities: {total_liabilities}")
        print(f"Total Assets: {total_assets}")
        
        assert total_liabilities == total_assets, \
            f"Balance Sheet does not balance! Liabilities={total_liabilities}, Assets={total_assets}"
        
        print("PASS: Balance Sheet balances correctly (total_liabilities == total_assets)")

    def test_07_balance_sheet_without_year_filter(self):
        """Verify Balance Sheet API works without kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get('total_liabilities') == data.get('total_assets'), "Balance Sheet should balance"
        print(f"PASS: Balance Sheet without filter - Liabilities={data['total_liabilities']}, Assets={data['total_assets']}")


class TestFYSummaryAPI:
    """Additional tests for FY Summary API"""

    def test_fy_summary_api(self):
        """Test FY Summary API returns correct data"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        assert response.status_code == 200
        
        data = response.json()
        assert "cash_bank" in data
        assert "paddy_stock" in data
        assert "milling" in data
        print("PASS: FY Summary API returns correct structure")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
