"""
Iteration 85 - Balance Sheet Feature + Login Error Fix Tests
Features tested:
1. Balance Sheet API: GET /api/fy-summary/balance-sheet
2. Balance Sheet PDF Export: GET /api/fy-summary/balance-sheet/pdf
3. Balance Sheet Excel Export: GET /api/fy-summary/balance-sheet/excel
4. Balance Sheet should have total_liabilities == total_assets
5. Balance Sheet includes Truck, Agent, DC accounts
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestBalanceSheetAPI:
    """Balance Sheet API endpoint tests"""

    def test_balance_sheet_endpoint_returns_200(self):
        """Test Balance Sheet API returns 200"""
        response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-26")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "liabilities" in data, "Response missing 'liabilities'"
        assert "assets" in data, "Response missing 'assets'"
        assert "total_liabilities" in data, "Response missing 'total_liabilities'"
        assert "total_assets" in data, "Response missing 'total_assets'"
        print(f"PASSED: Balance Sheet API returns 200 with required fields")

    def test_balance_sheet_is_balanced(self):
        """Test that total_liabilities == total_assets (balanced sheet)"""
        response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-26")
        assert response.status_code == 200
        data = response.json()
        
        total_liabilities = data.get("total_liabilities", 0)
        total_assets = data.get("total_assets", 0)
        
        assert total_liabilities == total_assets, \
            f"Balance Sheet NOT balanced: Liabilities={total_liabilities}, Assets={total_assets}"
        print(f"PASSED: Balance Sheet is balanced - Liabilities={total_liabilities}, Assets={total_assets}")

    def test_balance_sheet_has_required_structure(self):
        """Test Balance Sheet response structure"""
        response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-26")
        assert response.status_code == 200
        data = response.json()
        
        # Check liabilities structure
        assert isinstance(data["liabilities"], list), "liabilities should be a list"
        for liability in data["liabilities"]:
            assert "group" in liability, "Each liability should have 'group'"
            assert "amount" in liability, "Each liability should have 'amount'"
            assert "children" in liability, "Each liability should have 'children'"
        
        # Check assets structure
        assert isinstance(data["assets"], list), "assets should be a list"
        for asset in data["assets"]:
            assert "group" in asset, "Each asset should have 'group'"
            assert "amount" in asset, "Each asset should have 'amount'"
            assert "children" in asset, "Each asset should have 'children'"
        
        print(f"PASSED: Balance Sheet has correct structure - {len(data['liabilities'])} liability groups, {len(data['assets'])} asset groups")

    def test_balance_sheet_includes_account_details(self):
        """Test Balance Sheet includes truck, agent, DC account details"""
        response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-26")
        assert response.status_code == 200
        data = response.json()
        
        # These fields should exist even if empty
        assert "truck_accounts" in data, "Response missing 'truck_accounts'"
        assert "agent_accounts" in data, "Response missing 'agent_accounts'"
        assert "dc_accounts" in data, "Response missing 'dc_accounts'"
        
        # Verify structure if data exists
        if data["truck_accounts"]:
            for t in data["truck_accounts"]:
                assert "name" in t, "Truck account should have 'name'"
                assert "balance" in t, "Truck account should have 'balance'"
        
        if data["agent_accounts"]:
            for a in data["agent_accounts"]:
                assert "name" in a, "Agent account should have 'name'"
                assert "balance" in a, "Agent account should have 'balance'"
        
        if data["dc_accounts"]:
            for d in data["dc_accounts"]:
                assert "name" in d, "DC account should have 'name'"
                assert "balance" in d, "DC account should have 'balance'"
        
        print(f"PASSED: Balance Sheet includes account details - Trucks: {len(data['truck_accounts'])}, Agents: {len(data['agent_accounts'])}, DC: {len(data['dc_accounts'])}")

    def test_balance_sheet_has_date_info(self):
        """Test Balance Sheet includes date and KMS year info"""
        response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-26")
        assert response.status_code == 200
        data = response.json()
        
        assert "as_on_date" in data, "Response missing 'as_on_date'"
        assert "kms_year" in data, "Response missing 'kms_year'"
        assert data["kms_year"] == "2025-26", f"Expected kms_year='2025-26', got '{data['kms_year']}'"
        
        print(f"PASSED: Balance Sheet has date info - as_on: {data['as_on_date']}, kms_year: {data['kms_year']}")


class TestBalanceSheetExports:
    """Balance Sheet PDF and Excel export tests"""

    def test_balance_sheet_pdf_export(self):
        """Test Balance Sheet PDF export returns valid PDF"""
        response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet/pdf?kms_year=2025-26")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Check content type
        content_type = response.headers.get("Content-Type", "")
        assert "application/pdf" in content_type, f"Expected PDF content type, got {content_type}"
        
        # Check content disposition
        content_disp = response.headers.get("Content-Disposition", "")
        assert "Balance_Sheet" in content_disp, f"Expected 'Balance_Sheet' in filename, got {content_disp}"
        
        # Check content size (PDF should be > 1KB)
        assert len(response.content) > 1000, f"PDF too small: {len(response.content)} bytes"
        
        # Check PDF magic bytes
        assert response.content[:4] == b'%PDF', "Response is not a valid PDF (missing PDF magic bytes)"
        
        print(f"PASSED: Balance Sheet PDF export - Size: {len(response.content)} bytes")

    def test_balance_sheet_excel_export(self):
        """Test Balance Sheet Excel export returns valid Excel file"""
        response = requests.get(f"{BASE_URL}/api/fy-summary/balance-sheet/excel?kms_year=2025-26")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Check content type
        content_type = response.headers.get("Content-Type", "")
        assert "spreadsheet" in content_type.lower() or "excel" in content_type.lower(), \
            f"Expected Excel content type, got {content_type}"
        
        # Check content disposition
        content_disp = response.headers.get("Content-Disposition", "")
        assert "Balance_Sheet" in content_disp, f"Expected 'Balance_Sheet' in filename, got {content_disp}"
        assert ".xlsx" in content_disp, f"Expected .xlsx extension, got {content_disp}"
        
        # Check content size (Excel should be > 1KB)
        assert len(response.content) > 1000, f"Excel too small: {len(response.content)} bytes"
        
        # Check XLSX magic bytes (PK zip header)
        assert response.content[:2] == b'PK', "Response is not a valid XLSX (missing PK zip header)"
        
        print(f"PASSED: Balance Sheet Excel export - Size: {len(response.content)} bytes")


class TestLoginErrorMessage:
    """Test login error message display"""

    def test_login_wrong_password_returns_error(self):
        """Test login with wrong password returns 401 with error message"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "wrongpassword123"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data, "Error response should have 'detail'"
        
        print(f"PASSED: Wrong password returns 401 with error: {data.get('detail')}")

    def test_login_correct_credentials(self):
        """Test login with correct credentials returns 200"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True, "Login should return success=True"
        assert data.get("username") == "admin", "Should return username"
        assert data.get("role") == "admin", "Should return role"
        
        print(f"PASSED: Correct credentials login - username: {data.get('username')}, role: {data.get('role')}")


class TestFYSummarySubTabs:
    """Test that FY Summary API still works (sub-tabs depend on it)"""

    def test_fy_summary_api_works(self):
        """Test FY Summary API returns data for Balance Sheet sub-tab"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-26")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Check all expected sections exist
        required_sections = ["cash_bank", "paddy_stock", "milling", "frk_stock", 
                           "byproducts", "mill_parts", "diesel", "local_party",
                           "staff_advances", "private_trading", "ledger_parties"]
        
        for section in required_sections:
            assert section in data, f"Missing section: {section}"
        
        print(f"PASSED: FY Summary API has all {len(required_sections)} sections")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
