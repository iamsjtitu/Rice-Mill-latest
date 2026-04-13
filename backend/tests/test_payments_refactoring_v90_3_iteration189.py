"""
Test suite for Payments.jsx DieselAccount extraction refactoring - v90.3.0 Iteration 189
Tests backend APIs used by Payments page tabs (Truck, Agent, Diesel, etc.)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthAndBasics:
    """Authentication and basic API tests"""
    
    def test_login_admin(self):
        """Test admin login with correct credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "role" in data
        assert data["role"] == "admin"
        print("PASS: Admin login successful")

class TestTruckPaymentsAPI:
    """Truck Payments API tests - used by Truck Payments tab"""
    
    def test_get_truck_payments(self):
        """GET /api/truck-payments with kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/truck-payments", params={"kms_year": "2025-26"})
        assert response.status_code == 200, f"Truck payments failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"PASS: GET /api/truck-payments returned {len(data)} records")

class TestAgentPaymentsAPI:
    """Agent Payments API tests - used by Agent Payments tab"""
    
    def test_get_agent_payments(self):
        """GET /api/agent-payments with kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/agent-payments", params={"kms_year": "2025-26"})
        assert response.status_code == 200, f"Agent payments failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"PASS: GET /api/agent-payments returned {len(data)} records")

class TestDieselAccountAPI:
    """Diesel Account API tests - used by extracted DieselAccount component"""
    
    def test_get_diesel_pumps(self):
        """GET /api/diesel-pumps - list all pumps"""
        response = requests.get(f"{BASE_URL}/api/diesel-pumps")
        assert response.status_code == 200, f"Diesel pumps failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"PASS: GET /api/diesel-pumps returned {len(data)} pumps")
    
    def test_get_diesel_accounts_summary(self):
        """GET /api/diesel-accounts/summary with kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/diesel-accounts/summary", params={"kms_year": "2025-26"})
        assert response.status_code == 200, f"Diesel summary failed: {response.text}"
        data = response.json()
        # Verify summary structure
        assert "pumps" in data or "grand_balance" in data or data == {}, f"Unexpected summary structure: {data}"
        print(f"PASS: GET /api/diesel-accounts/summary returned summary data")
    
    def test_get_diesel_accounts_transactions(self):
        """GET /api/diesel-accounts - list transactions"""
        response = requests.get(f"{BASE_URL}/api/diesel-accounts", params={"kms_year": "2025-26"})
        assert response.status_code == 200, f"Diesel accounts failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"PASS: GET /api/diesel-accounts returned {len(data)} transactions")

class TestRegressionAPIs:
    """Regression tests for previously refactored components"""
    
    def test_cmr_vs_dc_report(self):
        """GET /api/reports/cmr-vs-dc - CMRvsDC component data"""
        response = requests.get(f"{BASE_URL}/api/reports/cmr-vs-dc", params={"kms_year": "2025-26"})
        assert response.status_code == 200, f"CMR vs DC report failed: {response.text}"
        print("PASS: GET /api/reports/cmr-vs-dc working")
    
    def test_cash_book_summary(self):
        """GET /api/cash-book/summary - Cash Book page"""
        response = requests.get(f"{BASE_URL}/api/cash-book/summary", params={"kms_year": "2025-26"})
        assert response.status_code == 200, f"Cash book summary failed: {response.text}"
        print("PASS: GET /api/cash-book/summary working")
    
    def test_fy_settings(self):
        """GET /api/fy-settings - useFilters hook data"""
        response = requests.get(f"{BASE_URL}/api/fy-settings")
        assert response.status_code == 200, f"FY settings failed: {response.text}"
        print("PASS: GET /api/fy-settings working")

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
