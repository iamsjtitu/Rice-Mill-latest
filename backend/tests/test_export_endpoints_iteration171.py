"""
Test Export Endpoints - Iteration 171
Tests all PDF/Excel export endpoints return 200 status codes.
Also verifies UI listing endpoints still sort descending (newest first).
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "admin",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Authentication failed - skipping authenticated tests")

@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestMillEntriesExports:
    """Mill entries export endpoints - entries.py"""
    
    def test_export_pdf_returns_200(self, auth_headers):
        """GET /api/export/pdf - Mill entries PDF export"""
        response = requests.get(f"{BASE_URL}/api/export/pdf", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        assert "application/pdf" in response.headers.get("content-type", "")
        print("PASS: /api/export/pdf returns 200 with PDF content")
    
    def test_export_excel_returns_200(self, auth_headers):
        """GET /api/export/excel - Mill entries Excel export"""
        response = requests.get(f"{BASE_URL}/api/export/excel", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        assert "spreadsheet" in response.headers.get("content-type", "")
        print("PASS: /api/export/excel returns 200 with Excel content")
    
    def test_truck_payments_excel_returns_200(self, auth_headers):
        """GET /api/export/truck-payments-excel - Truck payments Excel"""
        response = requests.get(f"{BASE_URL}/api/export/truck-payments-excel", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        print("PASS: /api/export/truck-payments-excel returns 200")
    
    def test_truck_payments_pdf_returns_200(self, auth_headers):
        """GET /api/export/truck-payments-pdf - Truck payments PDF"""
        response = requests.get(f"{BASE_URL}/api/export/truck-payments-pdf", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        print("PASS: /api/export/truck-payments-pdf returns 200")


class TestPrivateTradingExports:
    """Private trading export endpoints - private_trading.py"""
    
    def test_private_paddy_pdf_returns_200(self, auth_headers):
        """GET /api/private-paddy/pdf - Private paddy PDF export"""
        response = requests.get(f"{BASE_URL}/api/private-paddy/pdf", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        print("PASS: /api/private-paddy/pdf returns 200")
    
    def test_private_paddy_excel_returns_200(self, auth_headers):
        """GET /api/private-paddy/excel - Private paddy Excel export"""
        response = requests.get(f"{BASE_URL}/api/private-paddy/excel", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        print("PASS: /api/private-paddy/excel returns 200")
    
    def test_rice_sales_pdf_returns_200(self, auth_headers):
        """GET /api/rice-sales/pdf - Rice sales PDF export"""
        response = requests.get(f"{BASE_URL}/api/rice-sales/pdf", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        print("PASS: /api/rice-sales/pdf returns 200")
    
    def test_rice_sales_excel_returns_200(self, auth_headers):
        """GET /api/rice-sales/excel - Rice sales Excel export"""
        response = requests.get(f"{BASE_URL}/api/rice-sales/excel", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        print("PASS: /api/rice-sales/excel returns 200")
    
    def test_party_summary_pdf_returns_200(self, auth_headers):
        """GET /api/private-trading/party-summary/pdf - Party summary PDF"""
        response = requests.get(f"{BASE_URL}/api/private-trading/party-summary/pdf", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        print("PASS: /api/private-trading/party-summary/pdf returns 200")
    
    def test_party_summary_excel_returns_200(self, auth_headers):
        """GET /api/private-trading/party-summary/excel - Party summary Excel"""
        response = requests.get(f"{BASE_URL}/api/private-trading/party-summary/excel", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        print("PASS: /api/private-trading/party-summary/excel returns 200")


class TestStaffExports:
    """Staff export endpoints - staff.py"""
    
    def test_staff_payments_export_returns_200(self, auth_headers):
        """GET /api/staff/export/payments - Staff payments export"""
        response = requests.get(f"{BASE_URL}/api/staff/export/payments", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        print("PASS: /api/staff/export/payments returns 200")


class TestMillPartsExports:
    """Mill parts export endpoints - mill_parts.py"""
    
    def test_mill_parts_stock_excel_returns_200(self, auth_headers):
        """GET /api/mill-parts-stock/export/excel - Mill parts stock Excel"""
        response = requests.get(f"{BASE_URL}/api/mill-parts-stock/export/excel", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        print("PASS: /api/mill-parts-stock/export/excel returns 200")
    
    def test_mill_parts_stock_pdf_returns_200(self, auth_headers):
        """GET /api/mill-parts-stock/export/pdf - Mill parts stock PDF"""
        response = requests.get(f"{BASE_URL}/api/mill-parts-stock/export/pdf", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        print("PASS: /api/mill-parts-stock/export/pdf returns 200")


class TestCashBookExports:
    """Cash book export endpoints - cashbook.py"""
    
    def test_cash_book_excel_returns_200(self, auth_headers):
        """GET /api/cash-book/excel - Cash book Excel export"""
        response = requests.get(f"{BASE_URL}/api/cash-book/excel", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        print("PASS: /api/cash-book/excel returns 200")


class TestVehicleWeightExports:
    """Vehicle weight export endpoints - vehicle_weight.py"""
    
    def test_vehicle_weight_pdf_returns_200(self, auth_headers):
        """GET /api/vehicle-weight/export/pdf - Vehicle weight PDF"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/export/pdf", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        print("PASS: /api/vehicle-weight/export/pdf returns 200")
    
    def test_vehicle_weight_excel_returns_200(self, auth_headers):
        """GET /api/vehicle-weight/export/excel - Vehicle weight Excel"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/export/excel", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        print("PASS: /api/vehicle-weight/export/excel returns 200")


class TestExportsRouteExports:
    """Export endpoints from exports.py"""
    
    def test_truck_owner_excel_returns_200(self, auth_headers):
        """GET /api/export/truck-owner-excel - Truck owner Excel"""
        response = requests.get(f"{BASE_URL}/api/export/truck-owner-excel", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        print("PASS: /api/export/truck-owner-excel returns 200")
    
    def test_truck_owner_pdf_returns_200(self, auth_headers):
        """GET /api/export/truck-owner-pdf - Truck owner PDF"""
        response = requests.get(f"{BASE_URL}/api/export/truck-owner-pdf", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        print("PASS: /api/export/truck-owner-pdf returns 200")
    
    def test_summary_report_pdf_returns_200(self, auth_headers):
        """GET /api/export/summary-report-pdf - Summary report PDF"""
        response = requests.get(f"{BASE_URL}/api/export/summary-report-pdf", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        print("PASS: /api/export/summary-report-pdf returns 200")


class TestUIListingEndpointsSortDescending:
    """Verify UI listing endpoints still sort descending (newest first)"""
    
    def test_rice_sales_listing_sorts_descending(self, auth_headers):
        """GET /api/rice-sales - Should sort descending (newest first for UI)"""
        response = requests.get(f"{BASE_URL}/api/rice-sales", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        # If there are multiple items, verify they are sorted descending by date
        if isinstance(data, list) and len(data) >= 2:
            dates = [item.get("date", "") for item in data if item.get("date")]
            if len(dates) >= 2:
                # Check that dates are in descending order (newest first)
                for i in range(len(dates) - 1):
                    assert dates[i] >= dates[i+1], f"Rice sales not sorted descending: {dates[i]} < {dates[i+1]}"
        print("PASS: /api/rice-sales returns 200 and sorts descending")
    
    def test_private_paddy_listing_sorts_descending(self, auth_headers):
        """GET /api/private-paddy - Should sort descending (newest first for UI)"""
        response = requests.get(f"{BASE_URL}/api/private-paddy", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        # If there are multiple items, verify they are sorted descending by date
        if isinstance(data, list) and len(data) >= 2:
            dates = [item.get("date", "") for item in data if item.get("date")]
            if len(dates) >= 2:
                # Check that dates are in descending order (newest first)
                for i in range(len(dates) - 1):
                    assert dates[i] >= dates[i+1], f"Private paddy not sorted descending: {dates[i]} < {dates[i+1]}"
        print("PASS: /api/private-paddy returns 200 and sorts descending")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
