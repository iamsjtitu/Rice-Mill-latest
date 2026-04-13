"""
Test Suite for AppHeader + Reports Refactoring v90.3.0 - Iteration 190

Tests for:
1. AppHeader extraction from App.js (281 lines)
2. Reports.jsx decomposition - DailyReport (872 lines) + AgentMandiReport (337 lines)
3. Backend API regression tests for daily-report and agent-mandi endpoints
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthLogin:
    """Test authentication with admin credentials"""
    
    def test_admin_login(self):
        """Test login with admin/admin123"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert data.get("role") == "admin"
        print(f"✓ Admin login successful: {data.get('username')}")


class TestDailyReportAPI:
    """Test Daily Report API endpoints (regression after DailyReport.jsx extraction)"""
    
    def test_daily_report_endpoint(self):
        """GET /api/reports/daily - should return daily report data"""
        params = {"date": "2025-01-01", "mode": "normal", "kms_year": "2025-26"}
        response = requests.get(f"{BASE_URL}/api/reports/daily", params=params)
        assert response.status_code == 200, f"Daily report failed: {response.text}"
        data = response.json()
        # Verify expected structure
        assert "paddy_entries" in data
        assert "milling" in data
        assert "cash_flow" in data
        print(f"✓ Daily report API working - paddy entries: {data.get('paddy_entries', {}).get('count', 0)}")
    
    def test_daily_report_detail_mode(self):
        """GET /api/reports/daily with detail mode"""
        params = {"date": "2025-01-01", "mode": "detail", "kms_year": "2025-26"}
        response = requests.get(f"{BASE_URL}/api/reports/daily", params=params)
        assert response.status_code == 200, f"Daily report detail mode failed: {response.text}"
        data = response.json()
        assert "paddy_entries" in data
        print(f"✓ Daily report detail mode working")


class TestAgentMandiReportAPI:
    """Test Agent & Mandi Report API endpoints (regression after AgentMandiReport.jsx extraction)"""
    
    def test_agent_mandi_wise_endpoint(self):
        """GET /api/reports/agent-mandi-wise - should return agent/mandi grouped data"""
        params = {"kms_year": "2025-26"}
        response = requests.get(f"{BASE_URL}/api/reports/agent-mandi-wise", params=params)
        assert response.status_code == 200, f"Agent-mandi report failed: {response.text}"
        data = response.json()
        # Verify expected structure
        assert "mandis" in data or "grand_totals" in data
        print(f"✓ Agent-mandi report API working - mandis count: {len(data.get('mandis', []))}")
    
    def test_agent_mandi_with_search(self):
        """GET /api/reports/agent-mandi-wise with search filter"""
        params = {"kms_year": "2025-26", "search": "test"}
        response = requests.get(f"{BASE_URL}/api/reports/agent-mandi-wise", params=params)
        assert response.status_code == 200, f"Agent-mandi search failed: {response.text}"
        print(f"✓ Agent-mandi search filter working")


class TestCMRvsDCReportAPI:
    """Test CMR vs DC Report API (regression - previously extracted)"""
    
    def test_cmr_vs_dc_endpoint(self):
        """GET /api/reports/cmr-vs-dc - should return CMR vs DC comparison"""
        params = {"kms_year": "2025-26"}
        response = requests.get(f"{BASE_URL}/api/reports/cmr-vs-dc", params=params)
        assert response.status_code == 200, f"CMR vs DC report failed: {response.text}"
        data = response.json()
        assert "milling" in data
        assert "dc" in data
        assert "comparison" in data
        print(f"✓ CMR vs DC report API working")


class TestSeasonPnLReportAPI:
    """Test Season P&L Report API (regression - previously extracted)"""
    
    def test_season_pnl_endpoint(self):
        """GET /api/reports/season-pnl - should return P&L data"""
        params = {"kms_year": "2025-26"}
        response = requests.get(f"{BASE_URL}/api/reports/season-pnl", params=params)
        assert response.status_code == 200, f"Season P&L report failed: {response.text}"
        data = response.json()
        assert "income" in data
        assert "expenses" in data
        assert "net_pnl" in data
        print(f"✓ Season P&L report API working - Net P&L: {data.get('net_pnl', 0)}")


class TestEntriesAPI:
    """Test Entries API (regression for AppHeader extraction)"""
    
    def test_entries_endpoint(self):
        """GET /api/entries - should return paginated entries"""
        params = {"kms_year": "2025-26", "page": 1, "page_size": 10}
        response = requests.get(f"{BASE_URL}/api/entries", params=params)
        assert response.status_code == 200, f"Entries API failed: {response.text}"
        data = response.json()
        assert "entries" in data or isinstance(data, list)
        print(f"✓ Entries API working")
    
    def test_totals_endpoint(self):
        """GET /api/totals - should return totals summary"""
        params = {"kms_year": "2025-26"}
        response = requests.get(f"{BASE_URL}/api/totals", params=params)
        assert response.status_code == 200, f"Totals API failed: {response.text}"
        print(f"✓ Totals API working")


class TestBrandingAPI:
    """Test Branding API (used by AppHeader)"""
    
    def test_branding_endpoint(self):
        """GET /api/branding - should return company branding"""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200, f"Branding API failed: {response.text}"
        data = response.json()
        assert "company_name" in data
        print(f"✓ Branding API working - Company: {data.get('company_name')}")


class TestFYSettingsAPI:
    """Test FY Settings API (used by FY selector in AppHeader)"""
    
    def test_fy_settings_endpoint(self):
        """GET /api/fy-settings - should return FY configuration"""
        response = requests.get(f"{BASE_URL}/api/fy-settings")
        assert response.status_code == 200, f"FY Settings API failed: {response.text}"
        print(f"✓ FY Settings API working")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
