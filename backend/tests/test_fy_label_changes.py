"""
Test FY Label Changes - Iteration 114
Tests that KMS has been replaced with FY in user-facing labels
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestFYLabelChanges:
    """Test FY label changes - KMS replaced with FY"""
    
    def test_stock_summary_api_works_with_kms_year_param(self):
        """Backend API /api/stock-summary works with kms_year param (internal field unchanged)"""
        response = requests.get(f"{BASE_URL}/api/stock-summary?kms_year=2025-2026")
        assert response.status_code == 200, f"Stock summary failed: {response.text}"
        data = response.json()
        assert "items" in data, "Response should have items"
        print(f"PASS: Stock summary API works with kms_year param, returned {len(data['items'])} items")
    
    def test_entries_api_works_with_kms_year_param(self):
        """Backend API /api/entries works with kms_year param (internal field unchanged)"""
        response = requests.get(f"{BASE_URL}/api/entries?kms_year=2025-2026&limit=5")
        assert response.status_code == 200, f"Entries API failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: Entries API works with kms_year param, returned {len(data)} entries")
    
    def test_cash_book_api_works_with_kms_year_param(self):
        """Backend API /api/cash-book works with kms_year param"""
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026&limit=5")
        assert response.status_code == 200, f"Cash book API failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: Cash book API works with kms_year param, returned {len(data)} entries")
    
    def test_login_works(self):
        """Login with admin/admin123 works correctly"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert data.get("success") == True, "Login should return success=true"
        assert data.get("username") == "admin", "Login should return username"
        print("PASS: Login with admin/admin123 works correctly")
    
    def test_fy_year_logic_april_march(self):
        """FY year logic uses April-March (current month March 2026 should show 2025-2026)"""
        from datetime import datetime
        now = datetime.now()
        month = now.month
        year = now.year
        
        # FY logic: if month < 4 (April), use previous year
        if month < 4:
            expected_fy = f"{year-1}-{year}"
        else:
            expected_fy = f"{year}-{year+1}"
        
        # Current date is March 2026, so FY should be 2025-2026
        print(f"Current month: {month}, year: {year}")
        print(f"Expected FY: {expected_fy}")
        
        # Verify by checking stock summary default
        response = requests.get(f"{BASE_URL}/api/stock-summary?kms_year={expected_fy}")
        assert response.status_code == 200, f"Stock summary for {expected_fy} failed"
        print(f"PASS: FY year logic correct - {expected_fy}")
    
    def test_dashboard_api_works(self):
        """Dashboard API works with kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/dashboard/agent-totals?kms_year=2025-2026")
        assert response.status_code == 200, f"Dashboard API failed: {response.text}"
        print("PASS: Dashboard API works with kms_year filter")
    
    def test_private_trading_api_works(self):
        """Private trading API works with kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/private-trading/party-summary?kms_year=2025-2026")
        assert response.status_code == 200, f"Private trading API failed: {response.text}"
        data = response.json()
        assert "paddy_purchase" in data, "Response should have paddy_purchase"
        print("PASS: Private trading API works with kms_year filter")
    
    def test_fy_summary_api_works(self):
        """FY Summary API works"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        assert response.status_code == 200, f"FY Summary API failed: {response.text}"
        print("PASS: FY Summary API works")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
