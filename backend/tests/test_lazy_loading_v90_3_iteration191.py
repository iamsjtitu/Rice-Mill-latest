"""
Test file for React.lazy + Suspense lazy loading v90.3.0 - Iteration 191
Tests backend API regression for lazy-loaded components
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestLazyLoadingRegression:
    """Backend API regression tests for lazy loading v90.3.0"""
    
    def test_auth_login(self):
        """Test login with admin/admin123"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert data.get("role") == "admin"
        print("Login test passed")
    
    def test_entries_api(self):
        """Test GET /api/entries (regression)"""
        response = requests.get(f"{BASE_URL}/api/entries?page=1&page_size=10")
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data or isinstance(data, list)
        print(f"Entries API test passed - returned {len(data.get('entries', data))} entries")
    
    def test_fy_summary_api(self):
        """Test GET /api/fy-summary (regression)"""
        response = requests.get(f"{BASE_URL}/api/fy-summary")
        assert response.status_code == 200
        data = response.json()
        # FY Summary should return summary data
        assert isinstance(data, dict)
        print("FY Summary API test passed")
    
    def test_totals_api(self):
        """Test GET /api/totals (regression)"""
        response = requests.get(f"{BASE_URL}/api/totals")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        print("Totals API test passed")
    
    def test_branding_api(self):
        """Test GET /api/branding (regression)"""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200
        data = response.json()
        assert "company_name" in data
        print(f"Branding API test passed - company: {data.get('company_name')}")
    
    def test_reports_daily_api(self):
        """Test GET /api/reports/daily (lazy Reports component)"""
        from datetime import date
        today = date.today().isoformat()
        response = requests.get(f"{BASE_URL}/api/reports/daily?date={today}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert "date" in data
        print("Daily Report API test passed")
    
    def test_reports_agent_mandi_api(self):
        """Test GET /api/reports/agent-mandi-wise (lazy AgentMandiReport)"""
        response = requests.get(f"{BASE_URL}/api/reports/agent-mandi-wise")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, (dict, list))
        print("Agent Mandi Report API test passed")
    
    def test_staff_api(self):
        """Test GET /api/staff (lazy StaffManagement)"""
        response = requests.get(f"{BASE_URL}/api/staff")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Staff API test passed - {len(data)} staff members")
    
    def test_dc_tracker_api(self):
        """Test GET /api/dc-entries (lazy DCTracker)"""
        response = requests.get(f"{BASE_URL}/api/dc-entries")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, (dict, list))
        print("DC Tracker API test passed")
    
    def test_settings_branding_api(self):
        """Test GET /api/branding (lazy Settings)"""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200
        data = response.json()
        assert "company_name" in data
        print("Settings/Branding API test passed")
    
    def test_milling_entries_api(self):
        """Test GET /api/milling-entries (lazy GovtRegisters uses milling data)"""
        response = requests.get(f"{BASE_URL}/api/milling-entries")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, (dict, list))
        print("Milling Entries API test passed")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
