"""
Test Python Backend APIs after Node.js Refactoring
Tests the Python/FastAPI backend that powers the web preview.
Verifies all core endpoints are working correctly.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"
STAFF_USERNAME = "staff"
STAFF_PASSWORD = "staff123"


class TestHealthAndBasics:
    """Basic API connectivity tests"""
    
    def test_root_endpoint(self):
        """Test root API endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ Root endpoint: {data}")
    
    def test_branding_endpoint(self):
        """Test branding endpoint"""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200
        data = response.json()
        assert "company_name" in data
        print(f"✓ Branding: {data}")


class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_login_admin_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert data.get("role") == "admin"
        assert data.get("username") == ADMIN_USERNAME
        print(f"✓ Admin login success: role={data.get('role')}")
    
    def test_login_staff_success(self):
        """Test staff login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": STAFF_USERNAME,
            "password": STAFF_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert data.get("role") == "staff"
        print(f"✓ Staff login success: role={data.get('role')}")
    
    def test_login_wrong_password(self):
        """Test login with wrong password should return 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": "wrongpassword123"
        })
        assert response.status_code == 401
        print(f"✓ Wrong password returns 401 as expected")
    
    def test_login_invalid_user(self):
        """Test login with non-existent user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "nonexistentuser",
            "password": "password123"
        })
        assert response.status_code == 401
        print(f"✓ Invalid user returns 401 as expected")


class TestEntriesEndpoint:
    """Mill entries endpoint tests"""
    
    def test_get_entries(self):
        """Test GET /api/entries returns list"""
        response = requests.get(f"{BASE_URL}/api/entries")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/entries: {len(data)} entries found")
    
    def test_get_entries_with_filters(self):
        """Test GET /api/entries with kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/entries?kms_year=2024-2025")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/entries with filters: {len(data)} entries")


class TestTotalsEndpoint:
    """Totals endpoint tests"""
    
    def test_get_totals(self):
        """Test GET /api/totals returns totals object"""
        response = requests.get(f"{BASE_URL}/api/totals")
        assert response.status_code == 200
        data = response.json()
        # Verify totals structure
        expected_keys = ["total_kg", "total_qntl", "total_bag"]
        for key in expected_keys:
            assert key in data, f"Missing key: {key}"
        print(f"✓ GET /api/totals: total_qntl={data.get('total_qntl')}")
    
    def test_get_totals_with_filters(self):
        """Test GET /api/totals with filters"""
        response = requests.get(f"{BASE_URL}/api/totals?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        print(f"✓ GET /api/totals with filters: total_qntl={data.get('total_qntl')}")


class TestSuggestionsEndpoints:
    """Auto-suggest endpoint tests"""
    
    def test_get_truck_suggestions(self):
        """Test GET /api/suggestions/trucks returns suggestions"""
        response = requests.get(f"{BASE_URL}/api/suggestions/trucks")
        assert response.status_code == 200
        data = response.json()
        assert "suggestions" in data
        assert isinstance(data["suggestions"], list)
        print(f"✓ GET /api/suggestions/trucks: {len(data['suggestions'])} trucks")
    
    def test_get_agent_suggestions(self):
        """Test GET /api/suggestions/agents"""
        response = requests.get(f"{BASE_URL}/api/suggestions/agents")
        assert response.status_code == 200
        data = response.json()
        assert "suggestions" in data
        print(f"✓ GET /api/suggestions/agents: {len(data['suggestions'])} agents")
    
    def test_get_mandi_suggestions(self):
        """Test GET /api/suggestions/mandis"""
        response = requests.get(f"{BASE_URL}/api/suggestions/mandis")
        assert response.status_code == 200
        data = response.json()
        assert "suggestions" in data
        print(f"✓ GET /api/suggestions/mandis: {len(data['suggestions'])} mandis")


class TestMandiTargetsEndpoint:
    """Mandi targets endpoint tests"""
    
    def test_get_mandi_targets(self):
        """Test GET /api/mandi-targets returns list"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/mandi-targets: {len(data)} targets")
    
    def test_get_mandi_targets_with_filter(self):
        """Test GET /api/mandi-targets with kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/mandi-targets with filter: {len(data)} targets")


class TestDashboardEndpoints:
    """Dashboard endpoint tests"""
    
    def test_get_agent_totals(self):
        """Test GET /api/dashboard/agent-totals returns data"""
        response = requests.get(f"{BASE_URL}/api/dashboard/agent-totals")
        assert response.status_code == 200
        data = response.json()
        assert "agent_totals" in data
        assert isinstance(data["agent_totals"], list)
        print(f"✓ GET /api/dashboard/agent-totals: {len(data['agent_totals'])} agents")
    
    def test_get_date_range_totals(self):
        """Test GET /api/dashboard/date-range-totals returns data"""
        response = requests.get(f"{BASE_URL}/api/dashboard/date-range-totals")
        assert response.status_code == 200
        data = response.json()
        expected_keys = ["total_kg", "total_qntl", "total_entries"]
        for key in expected_keys:
            assert key in data, f"Missing key: {key}"
        print(f"✓ GET /api/dashboard/date-range-totals: {data.get('total_entries')} entries")


class TestCashBookEndpoint:
    """Cash book endpoint tests"""
    
    def test_get_cash_book(self):
        """Test GET /api/cash-book returns list"""
        response = requests.get(f"{BASE_URL}/api/cash-book")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/cash-book: {len(data)} transactions")
    
    def test_get_cash_book_summary(self):
        """Test GET /api/cash-book/summary"""
        response = requests.get(f"{BASE_URL}/api/cash-book/summary")
        assert response.status_code == 200
        data = response.json()
        assert "cash_balance" in data
        assert "bank_balance" in data
        print(f"✓ GET /api/cash-book/summary: cash={data.get('cash_balance')}, bank={data.get('bank_balance')}")


class TestDieselPumpsEndpoint:
    """Diesel pumps endpoint tests"""
    
    def test_get_diesel_pumps(self):
        """Test GET /api/diesel-pumps returns list"""
        response = requests.get(f"{BASE_URL}/api/diesel-pumps")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/diesel-pumps: {len(data)} pumps")
    
    def test_get_diesel_accounts_summary(self):
        """Test GET /api/diesel-accounts/summary"""
        response = requests.get(f"{BASE_URL}/api/diesel-accounts/summary")
        assert response.status_code == 200
        data = response.json()
        assert "pumps" in data
        assert "grand_balance" in data
        print(f"✓ GET /api/diesel-accounts/summary: balance={data.get('grand_balance')}")


class TestDCEntriesEndpoint:
    """DC entries endpoint tests"""
    
    def test_get_dc_entries(self):
        """Test GET /api/dc-entries returns list"""
        response = requests.get(f"{BASE_URL}/api/dc-entries")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/dc-entries: {len(data)} DCs")


class TestFYSettings:
    """FY Settings endpoint tests"""
    
    def test_get_fy_settings(self):
        """Test GET /api/fy-settings"""
        response = requests.get(f"{BASE_URL}/api/fy-settings")
        assert response.status_code == 200
        data = response.json()
        assert "active_fy" in data
        print(f"✓ GET /api/fy-settings: active_fy={data.get('active_fy')}")


class TestAdditionalEndpoints:
    """Additional endpoint tests"""
    
    def test_get_mandi_targets_summary(self):
        """Test GET /api/mandi-targets/summary"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets/summary")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/mandi-targets/summary: {len(data)} summaries")
    
    def test_get_diesel_accounts(self):
        """Test GET /api/diesel-accounts"""
        response = requests.get(f"{BASE_URL}/api/diesel-accounts")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/diesel-accounts: {len(data)} transactions")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
