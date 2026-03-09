"""
Test Suite for Code Refactoring (Phase: Code Refactoring + Global FY)
Tests:
1. Backend APIs after splitting from monolithic server.py to route modules
2. Global FY year settings API
3. Cash Book opening balance carry-forward from previous FY
4. Login after refactoring
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://mill-entry-sys.preview.emergentagent.com').rstrip('/')


class TestLoginAfterRefactoring:
    """Tests that login still works after backend refactoring"""
    
    def test_admin_login(self):
        """Login with admin/admin123 should work"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["username"] == "admin"
        assert data["role"] == "admin"
    
    def test_staff_login(self):
        """Login with staff/staff123 should work"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "staff",
            "password": "staff123"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["username"] == "staff"
        assert data["role"] == "staff"


class TestEntriesAfterRefactoring:
    """Tests GET /api/entries still works after refactoring"""
    
    def test_get_entries(self):
        """GET /api/entries should return list"""
        response = requests.get(f"{BASE_URL}/api/entries")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_entries_with_filter(self):
        """GET /api/entries with kms_year filter should work"""
        response = requests.get(f"{BASE_URL}/api/entries?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestCashBookAfterRefactoring:
    """Tests Cash Book APIs after refactoring"""
    
    def test_get_cash_book_transactions(self):
        """GET /api/cash-book should return transactions"""
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_cash_book_summary(self):
        """GET /api/cash-book/summary should return summary with opening balance fields"""
        response = requests.get(f"{BASE_URL}/api/cash-book/summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure has opening balance fields
        assert "opening_cash" in data
        assert "opening_bank" in data
        assert "cash_in" in data
        assert "cash_out" in data
        assert "cash_balance" in data
        assert "bank_in" in data
        assert "bank_out" in data
        assert "bank_balance" in data
        assert "total_balance" in data
        assert "total_transactions" in data
    
    def test_cash_book_summary_includes_opening_balance(self):
        """Cash book summary should include opening_cash and opening_bank from saved or previous FY"""
        response = requests.get(f"{BASE_URL}/api/cash-book/summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        # 2025-2026 has manual opening balance cash=500000, bank=1200000 per test notes
        assert data["opening_cash"] == 500000.0
        assert data["opening_bank"] == 1200000.0


class TestOpeningBalanceAPIs:
    """Tests for GET and PUT opening balance APIs"""
    
    def test_get_opening_balance(self):
        """GET /api/cash-book/opening-balance should return cash, bank, source fields"""
        response = requests.get(f"{BASE_URL}/api/cash-book/opening-balance?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "cash" in data
        assert "bank" in data
        assert "source" in data
    
    def test_get_opening_balance_for_2025_2026(self):
        """2025-2026 should have manual opening balance"""
        response = requests.get(f"{BASE_URL}/api/cash-book/opening-balance?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        # Verify it's manually saved data
        assert data["cash"] == 500000.0
        assert data["bank"] == 1200000.0
        assert data["source"] == "manual"
    
    def test_put_opening_balance(self):
        """PUT /api/cash-book/opening-balance should save opening balance"""
        # Save test opening balance for different year
        response = requests.put(f"{BASE_URL}/api/cash-book/opening-balance", json={
            "kms_year": "2024-2025",
            "cash": 100000.0,
            "bank": 200000.0
        })
        assert response.status_code == 200
        data = response.json()
        assert data["kms_year"] == "2024-2025"
        assert data["cash"] == 100000.0
        assert data["bank"] == 200000.0
        
        # Verify it was saved
        get_response = requests.get(f"{BASE_URL}/api/cash-book/opening-balance?kms_year=2024-2025")
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["source"] == "manual"


class TestFYSettingsAPI:
    """Tests for Global FY Settings API"""
    
    def test_get_fy_settings(self):
        """GET /api/fy-settings should return active FY and season"""
        response = requests.get(f"{BASE_URL}/api/fy-settings")
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "active_fy" in data
        assert "season" in data
    
    def test_get_fy_settings_returns_saved_value(self):
        """FY settings should return previously saved value"""
        response = requests.get(f"{BASE_URL}/api/fy-settings")
        assert response.status_code == 200
        data = response.json()
        
        # Should have saved 2025-2026 Kharif from previous usage
        assert data["active_fy"] == "2025-2026"
    
    def test_put_fy_settings(self):
        """PUT /api/fy-settings should save FY setting"""
        # Save a different value
        response = requests.put(f"{BASE_URL}/api/fy-settings", json={
            "active_fy": "2025-2026",
            "season": "Rabi"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["active_fy"] == "2025-2026"
        assert data["season"] == "Rabi"
        
        # Verify it persists
        get_response = requests.get(f"{BASE_URL}/api/fy-settings")
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["active_fy"] == "2025-2026"
        assert get_data["season"] == "Rabi"
        
        # Restore to Kharif
        requests.put(f"{BASE_URL}/api/fy-settings", json={
            "active_fy": "2025-2026",
            "season": "Kharif"
        })


class TestReportsAfterRefactoring:
    """Tests that report APIs still work after refactoring"""
    
    def test_outstanding_report(self):
        """GET /api/reports/outstanding should return report data"""
        response = requests.get(f"{BASE_URL}/api/reports/outstanding?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "dc_outstanding" in data
        assert "msp_outstanding" in data
        assert "trucks" in data
        assert "agents" in data
    
    def test_party_ledger_report(self):
        """GET /api/reports/party-ledger should return ledger data"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "ledger" in data
        assert "party_list" in data
        assert isinstance(data["ledger"], list)


class TestPrivateTradingAfterRefactoring:
    """Tests Private Trading APIs still work after refactoring"""
    
    def test_get_private_paddy(self):
        """GET /api/private-paddy should return paddy purchases"""
        response = requests.get(f"{BASE_URL}/api/private-paddy?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Should have Ram Singh entry from seed data
        if len(data) > 0:
            entry = data[0]
            assert "party_name" in entry
            assert "total_amount" in entry
            assert "balance" in entry
    
    def test_get_rice_sales(self):
        """GET /api/rice-sales should return rice sales"""
        response = requests.get(f"{BASE_URL}/api/rice-sales?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestOtherRefactoredEndpoints:
    """Tests other endpoints that were moved to route modules"""
    
    def test_branding_endpoint(self):
        """GET /api/branding should work"""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200
        data = response.json()
        assert "company_name" in data
        assert "tagline" in data
    
    def test_suggestions_trucks(self):
        """GET /api/suggestions/trucks should work"""
        response = requests.get(f"{BASE_URL}/api/suggestions/trucks")
        assert response.status_code == 200
        data = response.json()
        assert "suggestions" in data
    
    def test_suggestions_agents(self):
        """GET /api/suggestions/agents should work"""
        response = requests.get(f"{BASE_URL}/api/suggestions/agents")
        assert response.status_code == 200
        data = response.json()
        assert "suggestions" in data
    
    def test_suggestions_mandis(self):
        """GET /api/suggestions/mandis should work"""
        response = requests.get(f"{BASE_URL}/api/suggestions/mandis")
        assert response.status_code == 200
        data = response.json()
        assert "suggestions" in data
    
    def test_totals_endpoint(self):
        """GET /api/totals should work"""
        response = requests.get(f"{BASE_URL}/api/totals?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        # Should have totals fields
        assert isinstance(data, dict)
    
    def test_dashboard_agent_totals(self):
        """GET /api/dashboard/agent-totals should work"""
        response = requests.get(f"{BASE_URL}/api/dashboard/agent-totals?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert "agent_totals" in data
    
    def test_mandi_targets_summary(self):
        """GET /api/mandi-targets/summary should work"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets/summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_truck_payments(self):
        """GET /api/truck-payments should work"""
        response = requests.get(f"{BASE_URL}/api/truck-payments?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_agent_payments(self):
        """GET /api/agent-payments should work"""
        response = requests.get(f"{BASE_URL}/api/agent-payments?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
