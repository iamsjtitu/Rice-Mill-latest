"""
Test Iteration 94: Balance Sheet Bug Fixes
Three bugs fixed:
1. Diesel payment reflection - should use ledger nikasi as source of truth
2. Party summary format - GET /api/cash-book/party-summary returns {parties, summary} 
3. Agent jama reconciliation - stale ledger amounts auto-corrected
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

class TestBalanceSheetBugFixes:
    """Test all three bug fixes for Balance Sheet"""

    def test_fy_summary_returns_200(self):
        """GET /api/fy-summary works without errors"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert "diesel" in data
        assert "cash_bank" in data
        print(f"FY Summary API working - Diesel entries: {len(data.get('diesel', []))}")

    def test_balance_sheet_returns_200(self):
        """GET /api/fy-summary/balance-sheet works and balances"""
        response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert "total_liabilities" in data
        assert "total_assets" in data
        assert data["total_liabilities"] == data["total_assets"], \
            f"Balance sheet doesn't balance: Liabilities={data['total_liabilities']}, Assets={data['total_assets']}"
        print(f"Balance Sheet balances at Rs {data['total_assets']:,.2f}")

    def test_bug1_diesel_payment_uses_ledger_nikasi(self):
        """Bug Fix 1: Diesel closing_balance uses ledger nikasi as source of truth"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        diesel_list = data.get("diesel", [])
        
        # Find Lokesh Fuels (the diesel pump in test data)
        lokesh_fuels = next((d for d in diesel_list if "lokesh" in d["pump_name"].lower()), None)
        
        if lokesh_fuels:
            print(f"Lokesh Fuels: diesel={lokesh_fuels['total_diesel']}, paid={lokesh_fuels['total_paid']}, balance={lokesh_fuels['closing_balance']}")
            # If diesel was fully paid via ledger nikasi, closing_balance should be 0 or close to it
            # The fix ensures paid = max(diesel_accounts_payment, ledger_nikasi)
            assert lokesh_fuels['total_paid'] > 0 or lokesh_fuels['total_diesel'] == 0, \
                "Diesel paid should use ledger nikasi"
            # If diesel == paid, balance should be 0
            if lokesh_fuels['total_diesel'] == lokesh_fuels['total_paid']:
                assert lokesh_fuels['closing_balance'] == 0, \
                    f"Fully paid diesel should show 0 balance, got {lokesh_fuels['closing_balance']}"
        else:
            print("No Lokesh Fuels found in diesel data - test data may have changed")

    def test_bug1_diesel_not_in_creditors_when_fully_paid(self):
        """Bug Fix 1: Fully paid diesel should NOT appear in Sundry Creditors"""
        response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        # Check Sundry Creditors for diesel entries
        sundry_creditors = next((l for l in data["liabilities"] if l["group"] == "Sundry Creditors"), None)
        
        if sundry_creditors:
            diesel_children = [c for c in sundry_creditors.get("children", []) 
                             if "diesel" in c["name"].lower()]
            for dc in diesel_children:
                print(f"Diesel in creditors: {dc['name']} = {dc['amount']}")
                # If diesel is in creditors, amount should be > 0
                assert dc["amount"] > 0, f"Diesel with 0 balance shouldn't be in Sundry Creditors"
        
        # Check diesel section - if balance=0, shouldn't be in creditors
        for d in data.get("diesel_section", []):
            if d.get("closing_balance", 0) == 0:
                assert not any(c["name"].lower() == f"diesel - {d['pump_name'].lower()}" 
                              for c in sundry_creditors.get("children", []) if sundry_creditors), \
                    f"Diesel {d['pump_name']} with 0 balance appears in Sundry Creditors"
        
        print("Diesel creditor check passed")

    def test_bug2_party_summary_format(self):
        """Bug Fix 2: GET /api/cash-book/party-summary returns {parties, summary} format"""
        response = requests.get(f"{BASE_URL}/api/cash-book/party-summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        # Must have 'parties' key (list)
        assert "parties" in data, "Response must have 'parties' key"
        assert isinstance(data["parties"], list), "'parties' must be a list"
        
        # Must have 'summary' key (dict)
        assert "summary" in data, "Response must have 'summary' key"
        assert isinstance(data["summary"], dict), "'summary' must be a dict"
        
        # Summary must have required fields
        summary = data["summary"]
        required_fields = ["total_parties", "settled_count", "pending_count", "total_outstanding"]
        for field in required_fields:
            assert field in summary, f"Summary missing required field: {field}"
        
        print(f"Party summary format correct - {summary['total_parties']} parties, "
              f"{summary['settled_count']} settled, {summary['pending_count']} pending")

    def test_bug2_party_summary_counts_match(self):
        """Bug Fix 2: Party summary counts are consistent"""
        response = requests.get(f"{BASE_URL}/api/cash-book/party-summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        parties = data["parties"]
        summary = data["summary"]
        
        # Manual count should match summary
        settled = sum(1 for p in parties if p["balance"] == 0)
        pending = sum(1 for p in parties if p["balance"] != 0)
        
        assert summary["total_parties"] == len(parties), \
            f"total_parties mismatch: summary={summary['total_parties']}, actual={len(parties)}"
        assert summary["settled_count"] == settled, \
            f"settled_count mismatch: summary={summary['settled_count']}, actual={settled}"
        assert summary["pending_count"] == pending, \
            f"pending_count mismatch: summary={summary['pending_count']}, actual={pending}"
        
        print(f"Party counts verified: total={len(parties)}, settled={settled}, pending={pending}")

    def test_bug3_agent_jama_calculation_with_cutting_rate_zero(self):
        """Bug Fix 3: Agent jama with cutting_rate=0 calculates correctly (not default to 5)"""
        response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        agent_accounts = data.get("agent_accounts", [])
        
        # Find Gokul (cutting_rate=0) and Barsana (cutting_rate=10) for comparison
        gokul = next((a for a in agent_accounts if a["name"].lower() == "gokul"), None)
        barsana = next((a for a in agent_accounts if a["name"].lower() == "barsana"), None)
        
        # Verify mandi targets to understand expected calculations
        targets_resp = requests.get(f"{BASE_URL}/api/mandi-targets?kms_year=2025-2026")
        targets = targets_resp.json()
        gokul_target = next((t for t in targets if t["mandi_name"].lower() == "gokul"), None)
        barsana_target = next((t for t in targets if t["mandi_name"].lower() == "barsana"), None)
        
        if gokul and gokul_target:
            # Expected: base_rate * target_qntl + cutting_qntl * cutting_rate
            # For Gokul with cutting_rate=0: 400*10 + (400*0.05)*0 = 4000
            expected_gokul = gokul_target["target_qntl"] * gokul_target["base_rate"] + \
                            gokul_target["target_qntl"] * gokul_target.get("cutting_percent", 0) / 100 * \
                            (gokul_target.get("cutting_rate") if gokul_target.get("cutting_rate") is not None else 5)
            
            print(f"Gokul: expected={expected_gokul}, actual={gokul['total']}")
            # With cutting_rate=0, total should be 4000 (not 4100 which is buggy)
            assert gokul["total"] == round(expected_gokul, 2), \
                f"Gokul agent jama incorrect: expected {expected_gokul}, got {gokul['total']}"
        
        if barsana and barsana_target:
            # For Barsana with cutting_rate=10: 400*10 + (400*0.05)*10 = 4200
            expected_barsana = barsana_target["target_qntl"] * barsana_target["base_rate"] + \
                              barsana_target["target_qntl"] * barsana_target.get("cutting_percent", 0) / 100 * \
                              (barsana_target.get("cutting_rate") if barsana_target.get("cutting_rate") is not None else 5)
            
            print(f"Barsana: expected={expected_barsana}, actual={barsana['total']}")
            assert barsana["total"] == round(expected_barsana, 2), \
                f"Barsana agent jama incorrect: expected {expected_barsana}, got {barsana['total']}"

    def test_truck_accounts_balance_correctly(self):
        """Verify truck accounts show correct balance (0 when fully paid)"""
        response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        truck_accounts = data.get("truck_accounts", [])
        
        for truck in truck_accounts:
            # Balance = total - paid
            expected_balance = round(truck["total"] - truck["paid"], 2)
            assert truck["balance"] == expected_balance, \
                f"Truck {truck['name']} balance mismatch: expected {expected_balance}, got {truck['balance']}"
            print(f"Truck {truck['name']}: total={truck['total']}, paid={truck['paid']}, balance={truck['balance']}")

    def test_balance_sheet_liabilities_equals_assets(self):
        """Final verification: total_liabilities must equal total_assets"""
        response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        assert data["total_liabilities"] == data["total_assets"], \
            f"BALANCE SHEET DOES NOT BALANCE! Liabilities={data['total_liabilities']}, Assets={data['total_assets']}"
        
        print(f"✓ Balance Sheet balances at Rs {data['total_assets']:,.2f}")


class TestFYSummaryEndpoints:
    """Additional tests for FY Summary endpoints"""

    def test_fy_summary_diesel_section_structure(self):
        """Verify diesel section has required fields"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        for d in data.get("diesel", []):
            required = ["pump_name", "opening_balance", "total_diesel", "total_paid", "closing_balance"]
            for field in required:
                assert field in d, f"Diesel entry missing field: {field}"
            
            # Verify calculation: closing = opening + diesel - paid
            expected_closing = round(d["opening_balance"] + d["total_diesel"] - d["total_paid"], 2)
            assert d["closing_balance"] == expected_closing, \
                f"{d['pump_name']} closing balance wrong: expected {expected_closing}, got {d['closing_balance']}"

    def test_fy_summary_ledger_parties_structure(self):
        """Verify ledger parties section has required fields"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        ledger = data.get("ledger_parties", {})
        assert "parties" in ledger, "ledger_parties must have 'parties' key"
        assert "total_parties" in ledger, "ledger_parties must have 'total_parties'"
        
        for p in ledger.get("parties", []):
            required = ["party_name", "opening_balance", "total_jama", "total_nikasi", "closing_balance"]
            for field in required:
                assert field in p, f"Ledger party missing field: {field}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
