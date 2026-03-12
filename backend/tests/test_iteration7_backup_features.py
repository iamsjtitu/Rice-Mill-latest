"""
Test Suite for Mill Entry System - Iteration 7
Testing new backup UI features and existing functionality

Features tested:
1. Login with admin/admin123 and staff/staff123
2. Settings tab visibility (Branding + Data Backup sections)
3. Entries tab with data table
4. Dashboard & Targets tab
5. Payments tab with sub-tabs
6. Core API endpoints
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://payment-regression-2.preview.emergentagent.com').rstrip('/')


class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_admin_login_success(self):
        """Test login with admin/admin123"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["username"] == "admin"
        assert data["role"] == "admin"
        print(f"PASS: Admin login successful - role={data['role']}")
    
    def test_staff_login_success(self):
        """Test login with staff/staff123"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "staff",
            "password": "staff123"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["username"] == "staff"
        assert data["role"] == "staff"
        print(f"PASS: Staff login successful - role={data['role']}")
    
    def test_invalid_login(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "invalid",
            "password": "wrong"
        })
        assert response.status_code == 401
        print("PASS: Invalid login returns 401")


class TestEntriesAPI:
    """Test entries API endpoints"""
    
    def test_get_entries_returns_array(self):
        """GET /api/entries returns array"""
        response = requests.get(f"{BASE_URL}/api/entries")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/entries returns array with {len(data)} entries")
    
    def test_get_totals(self):
        """GET /api/totals returns totals object"""
        response = requests.get(f"{BASE_URL}/api/totals")
        assert response.status_code == 200
        data = response.json()
        assert "total_kg" in data
        assert "total_qntl" in data
        assert "total_bag" in data
        print(f"PASS: GET /api/totals returns totals - total_qntl={data.get('total_qntl')}")


class TestSuggestionsAPI:
    """Test suggestions API endpoints"""
    
    def test_get_truck_suggestions(self):
        """GET /api/suggestions/trucks returns {suggestions: [...]}"""
        response = requests.get(f"{BASE_URL}/api/suggestions/trucks")
        assert response.status_code == 200
        data = response.json()
        assert "suggestions" in data
        assert isinstance(data["suggestions"], list)
        print(f"PASS: GET /api/suggestions/trucks - found {len(data['suggestions'])} trucks")
    
    def test_get_agent_suggestions(self):
        """GET /api/suggestions/agents returns suggestions"""
        response = requests.get(f"{BASE_URL}/api/suggestions/agents")
        assert response.status_code == 200
        data = response.json()
        assert "suggestions" in data
        print(f"PASS: GET /api/suggestions/agents - found {len(data['suggestions'])} agents")
    
    def test_get_mandi_suggestions(self):
        """GET /api/suggestions/mandis returns suggestions"""
        response = requests.get(f"{BASE_URL}/api/suggestions/mandis")
        assert response.status_code == 200
        data = response.json()
        assert "suggestions" in data
        print(f"PASS: GET /api/suggestions/mandis - found {len(data['suggestions'])} mandis")


class TestBrandingAPI:
    """Test branding settings API"""
    
    def test_get_branding(self):
        """GET /api/branding returns branding with company_name"""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200
        data = response.json()
        assert "company_name" in data
        assert "tagline" in data
        assert len(data["company_name"]) > 0
        print(f"PASS: GET /api/branding - company_name={data['company_name']}")


class TestDashboardAPI:
    """Test dashboard API endpoints"""
    
    def test_get_agent_totals(self):
        """GET /api/dashboard/agent-totals returns {agent_totals: [...]}"""
        response = requests.get(f"{BASE_URL}/api/dashboard/agent-totals")
        assert response.status_code == 200
        data = response.json()
        assert "agent_totals" in data
        assert isinstance(data["agent_totals"], list)
        print(f"PASS: GET /api/dashboard/agent-totals - found {len(data['agent_totals'])} agents")
    
    def test_get_mandi_targets_summary(self):
        """GET /api/mandi-targets/summary returns array"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets/summary")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/mandi-targets/summary - found {len(data)} targets")


class TestPaymentsAPI:
    """Test payments API endpoints"""
    
    def test_get_truck_payments(self):
        """GET /api/truck-payments returns array"""
        response = requests.get(f"{BASE_URL}/api/truck-payments")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/truck-payments - found {len(data)} payments")
    
    def test_get_agent_payments(self):
        """GET /api/agent-payments returns array"""
        response = requests.get(f"{BASE_URL}/api/agent-payments")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/agent-payments - found {len(data)} payments")


class TestBackupAPIWebVersion:
    """Test backup API behavior on web version (should return 404 or error gracefully)"""
    
    def test_backup_api_not_on_web(self):
        """Backup API endpoints are only on local-server, not web backend"""
        # This should return 404 on web version
        response = requests.get(f"{BASE_URL}/api/backups")
        # Either 404 (not found) or 405 (method not allowed) is acceptable
        # because backup endpoints are only on local-server version
        assert response.status_code in [404, 405, 422], f"Expected 404/405/422 but got {response.status_code}"
        print(f"PASS: GET /api/backups returns {response.status_code} (expected - not on web version)")
    
    def test_backup_status_api_not_on_web(self):
        """Backup status API not on web version"""
        response = requests.get(f"{BASE_URL}/api/backups/status")
        assert response.status_code in [404, 405, 422], f"Expected 404/405/422 but got {response.status_code}"
        print(f"PASS: GET /api/backups/status returns {response.status_code} (expected)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
