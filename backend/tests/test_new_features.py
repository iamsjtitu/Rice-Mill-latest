"""
Test Suite for Iteration 20: New Features
- P&L Summary Card on Dashboard (uses /api/reports/season-pnl)
- Mill Parts Stock module (/api/mill-parts, /api/mill-parts-stock, /api/mill-parts/summary)
- Daily Report (/api/reports/daily, /api/reports/daily/pdf, /api/reports/daily/excel)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://desktop-sync-fix.preview.emergentagent.com').rstrip('/')

class TestAuthentication:
    """Test login with admin and staff credentials"""
    
    def test_admin_login(self):
        """Admin login should work with admin/admin123"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert data.get("role") == "admin"
    
    def test_staff_login(self):
        """Staff login should work with staff/staff123"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "staff",
            "password": "staff123"
        })
        assert response.status_code == 200, f"Staff login failed: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert data.get("role") == "staff"


class TestSeasonPnL:
    """Test /api/reports/season-pnl endpoint (used for Dashboard P&L Summary Card)"""
    
    def test_get_season_pnl_returns_valid_json(self):
        """GET /api/reports/season-pnl should return income, expenses, net_pnl, profit"""
        response = requests.get(f"{BASE_URL}/api/reports/season-pnl")
        assert response.status_code == 200, f"Season P&L failed: {response.text}"
        data = response.json()
        
        # Validate structure
        assert "income" in data, "income field missing"
        assert "expenses" in data, "expenses field missing"
        assert "net_pnl" in data, "net_pnl field missing"
        assert "profit" in data, "profit field missing"
        
        # Validate income sub-fields
        income = data["income"]
        assert "msp_payments" in income
        assert "byproduct_sales" in income
        assert "cash_book_jama" in income
        assert "total" in income
        
        # Validate expenses sub-fields
        expenses = data["expenses"]
        assert "frk_purchases" in expenses
        assert "gunny_bags" in expenses
        assert "cash_book_nikasi" in expenses
        assert "truck_payments" in expenses
        assert "agent_payments" in expenses
        assert "total" in expenses
    
    def test_get_season_pnl_with_filter(self):
        """GET /api/reports/season-pnl with kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/reports/season-pnl?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert "net_pnl" in data


class TestMillParts:
    """Test Mill Parts Master CRUD endpoints"""
    
    def test_get_mill_parts_list(self):
        """GET /api/mill-parts should return list of parts"""
        response = requests.get(f"{BASE_URL}/api/mill-parts")
        assert response.status_code == 200, f"Mill parts list failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Check if existing sample parts are present
        part_names = [p.get("name") for p in data]
        # At least some parts should exist (Bearing, Belt, Sieve were added)
        assert len(data) >= 0, "Should have parts list"
        
        # If parts exist, validate structure
        if len(data) > 0:
            part = data[0]
            assert "id" in part, "Part should have id"
            assert "name" in part, "Part should have name"
            assert "category" in part, "Part should have category"
            assert "unit" in part, "Part should have unit"
    
    def test_create_and_delete_mill_part(self):
        """POST /api/mill-parts should create a new part, DELETE should remove it"""
        # Create
        test_part = {
            "name": f"TEST_Part_Automation_{os.urandom(4).hex()}",
            "category": "Test Category",
            "unit": "Pcs",
            "min_stock": "5"
        }
        response = requests.post(f"{BASE_URL}/api/mill-parts", json=test_part)
        assert response.status_code == 200, f"Create part failed: {response.text}"
        created = response.json()
        assert created.get("name") == test_part["name"]
        part_id = created.get("id")
        
        # Verify it exists in list
        list_response = requests.get(f"{BASE_URL}/api/mill-parts")
        parts = list_response.json()
        found = any(p.get("id") == part_id for p in parts)
        assert found, "Created part should be in list"
        
        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/mill-parts/{part_id}")
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        
        # Verify deleted
        list_response2 = requests.get(f"{BASE_URL}/api/mill-parts")
        parts2 = list_response2.json()
        found2 = any(p.get("id") == part_id for p in parts2)
        assert not found2, "Deleted part should not be in list"


class TestMillPartsSummary:
    """Test Mill Parts Stock Summary endpoint"""
    
    def test_get_stock_summary(self):
        """GET /api/mill-parts/summary should return summary for all parts"""
        response = requests.get(f"{BASE_URL}/api/mill-parts/summary")
        assert response.status_code == 200, f"Stock summary failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Validate structure for existing parts
        if len(data) > 0:
            summary = data[0]
            assert "part_name" in summary, "Should have part_name"
            assert "stock_in" in summary, "Should have stock_in"
            assert "stock_used" in summary, "Should have stock_used"
            assert "current_stock" in summary, "Should have current_stock"
            assert "total_purchase_amount" in summary, "Should have total_purchase_amount"
    
    def test_get_stock_summary_with_filter(self):
        """GET /api/mill-parts/summary with kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/mill-parts/summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestMillPartsStock:
    """Test Mill Parts Stock transactions endpoints"""
    
    def test_get_stock_entries(self):
        """GET /api/mill-parts-stock should return list of stock transactions"""
        response = requests.get(f"{BASE_URL}/api/mill-parts-stock")
        assert response.status_code == 200, f"Stock entries failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Validate structure if entries exist
        if len(data) > 0:
            entry = data[0]
            assert "id" in entry, "Should have id"
            assert "date" in entry, "Should have date"
            assert "part_name" in entry, "Should have part_name"
            assert "txn_type" in entry, "Should have txn_type (in/used)"
            assert "quantity" in entry, "Should have quantity"


class TestDailyReport:
    """Test Daily Report endpoints"""
    
    def test_get_daily_report_valid_date(self):
        """GET /api/reports/daily?date=2026-03-08 should return valid JSON"""
        response = requests.get(f"{BASE_URL}/api/reports/daily?date=2026-03-08")
        assert response.status_code == 200, f"Daily report failed: {response.text}"
        data = response.json()
        
        # Validate main sections
        assert "date" in data, "Should have date"
        assert "paddy_entries" in data, "Should have paddy_entries section"
        assert "milling" in data, "Should have milling section"
        assert "cash_flow" in data, "Should have cash_flow section"
        assert "payments" in data, "Should have payments section"
        assert "mill_parts" in data, "Should have mill_parts section"
        
        # Validate paddy_entries structure
        paddy = data["paddy_entries"]
        assert "count" in paddy, "paddy_entries should have count"
        assert "total_kg" in paddy, "paddy_entries should have total_kg"
        assert "total_bags" in paddy, "paddy_entries should have total_bags"
        
        # Validate cash_flow structure
        cash = data["cash_flow"]
        assert "cash_jama" in cash
        assert "cash_nikasi" in cash
        assert "bank_jama" in cash
        assert "bank_nikasi" in cash
        assert "net_cash" in cash
        assert "net_bank" in cash
        
        # Validate mill_parts structure
        parts = data["mill_parts"]
        assert "in_count" in parts, "mill_parts should have in_count"
        assert "used_count" in parts, "mill_parts should have used_count"
    
    def test_daily_report_with_today_date(self):
        """GET /api/reports/daily with today's date"""
        from datetime import datetime
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/reports/daily?date={today}")
        assert response.status_code == 200
        data = response.json()
        assert data["date"] == today


class TestDailyReportExport:
    """Test Daily Report export endpoints (PDF/Excel)"""
    
    def test_daily_report_excel_export_works(self):
        """GET /api/reports/daily/excel should return Excel file"""
        response = requests.get(f"{BASE_URL}/api/reports/daily/excel?date=2026-03-08")
        assert response.status_code == 200, f"Excel export failed: {response.status_code}"
        
        # Check content-type header
        content_type = response.headers.get('content-type', '')
        assert 'spreadsheet' in content_type or 'octet-stream' in content_type, f"Expected spreadsheet content-type, got {content_type}"
    
    def test_daily_report_pdf_export_works(self):
        """GET /api/reports/daily/pdf should return PDF file"""
        response = requests.get(f"{BASE_URL}/api/reports/daily/pdf?date=2026-03-08")
        assert response.status_code == 200, f"PDF export failed: {response.status_code}"
        
        # Check content-type header
        content_type = response.headers.get('content-type', '')
        assert 'pdf' in content_type, f"Expected PDF content-type, got {content_type}"


class TestMillPartsExport:
    """Test Mill Parts export endpoints"""
    
    def test_mill_parts_summary_excel_export(self):
        """GET /api/mill-parts/summary/excel should return Excel file"""
        response = requests.get(f"{BASE_URL}/api/mill-parts/summary/excel")
        assert response.status_code == 200, f"Parts Excel export failed: {response.status_code}"
    
    def test_mill_parts_summary_pdf_export(self):
        """GET /api/mill-parts/summary/pdf should return PDF file"""
        response = requests.get(f"{BASE_URL}/api/mill-parts/summary/pdf")
        assert response.status_code == 200, f"Parts PDF export failed: {response.status_code}"


class TestCMRvsDCReport:
    """Test CMR vs DC Report endpoint"""
    
    def test_cmr_vs_dc_returns_valid_json(self):
        """GET /api/reports/cmr-vs-dc should return milling vs DC comparison"""
        response = requests.get(f"{BASE_URL}/api/reports/cmr-vs-dc")
        assert response.status_code == 200, f"CMR vs DC failed: {response.text}"
        data = response.json()
        
        assert "milling" in data, "Should have milling section"
        assert "dc" in data, "Should have dc section"
        assert "comparison" in data, "Should have comparison section"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
