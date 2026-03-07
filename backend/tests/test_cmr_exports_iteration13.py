"""
CMR Export Endpoints Tests - Iteration 13
Tests for:
- Milling Report Excel/PDF exports
- FRK Purchases Excel/PDF exports
- By-Product Sales Excel/PDF exports
- Paddy Custody Register Excel/PDF exports
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMillingReportExports:
    """Milling Report Export endpoints"""
    
    def test_milling_report_excel_export(self):
        """Test GET /api/milling-report/excel returns 200 with xlsx content"""
        response = requests.get(f"{BASE_URL}/api/milling-report/excel")
        assert response.status_code == 200
        assert 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' in response.headers.get('content-type', '')
        assert len(response.content) > 0
        print("✓ Milling Report Excel export works")
    
    def test_milling_report_pdf_export(self):
        """Test GET /api/milling-report/pdf returns 200 with pdf content"""
        response = requests.get(f"{BASE_URL}/api/milling-report/pdf")
        assert response.status_code == 200
        assert 'application/pdf' in response.headers.get('content-type', '')
        assert len(response.content) > 0
        print("✓ Milling Report PDF export works")
    
    def test_milling_report_excel_with_filter(self):
        """Test Excel export with KMS year filter"""
        response = requests.get(f"{BASE_URL}/api/milling-report/excel?kms_year=2025-26")
        assert response.status_code == 200
        print("✓ Milling Report Excel with filter works")
    
    def test_milling_report_pdf_with_filter(self):
        """Test PDF export with season filter"""
        response = requests.get(f"{BASE_URL}/api/milling-report/pdf?season=Kharif")
        assert response.status_code == 200
        print("✓ Milling Report PDF with filter works")


class TestFRKPurchasesExports:
    """FRK Purchases Export endpoints"""
    
    def test_frk_purchases_excel_export(self):
        """Test GET /api/frk-purchases/excel returns 200 with xlsx content"""
        response = requests.get(f"{BASE_URL}/api/frk-purchases/excel")
        assert response.status_code == 200
        assert 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' in response.headers.get('content-type', '')
        assert len(response.content) > 0
        print("✓ FRK Purchases Excel export works")
    
    def test_frk_purchases_pdf_export(self):
        """Test GET /api/frk-purchases/pdf returns 200 with pdf content"""
        response = requests.get(f"{BASE_URL}/api/frk-purchases/pdf")
        assert response.status_code == 200
        assert 'application/pdf' in response.headers.get('content-type', '')
        assert len(response.content) > 0
        print("✓ FRK Purchases PDF export works")
    
    def test_frk_purchases_excel_with_filter(self):
        """Test Excel export with filter"""
        response = requests.get(f"{BASE_URL}/api/frk-purchases/excel?kms_year=2025-26&season=Kharif")
        assert response.status_code == 200
        print("✓ FRK Purchases Excel with filter works")
    
    def test_frk_purchases_pdf_with_filter(self):
        """Test PDF export with filter"""
        response = requests.get(f"{BASE_URL}/api/frk-purchases/pdf?kms_year=2025-26")
        assert response.status_code == 200
        print("✓ FRK Purchases PDF with filter works")


class TestByProductSalesExports:
    """By-Product Sales Export endpoints"""
    
    def test_byproduct_sales_excel_export(self):
        """Test GET /api/byproduct-sales/excel returns 200 with xlsx content"""
        response = requests.get(f"{BASE_URL}/api/byproduct-sales/excel")
        assert response.status_code == 200
        assert 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' in response.headers.get('content-type', '')
        assert len(response.content) > 0
        print("✓ By-Product Sales Excel export works")
    
    def test_byproduct_sales_pdf_export(self):
        """Test GET /api/byproduct-sales/pdf returns 200 with pdf content"""
        response = requests.get(f"{BASE_URL}/api/byproduct-sales/pdf")
        assert response.status_code == 200
        assert 'application/pdf' in response.headers.get('content-type', '')
        assert len(response.content) > 0
        print("✓ By-Product Sales PDF export works")
    
    def test_byproduct_sales_excel_with_filter(self):
        """Test Excel export with filter"""
        response = requests.get(f"{BASE_URL}/api/byproduct-sales/excel?season=Kharif")
        assert response.status_code == 200
        print("✓ By-Product Sales Excel with filter works")
    
    def test_byproduct_sales_pdf_with_filter(self):
        """Test PDF export with filter"""
        response = requests.get(f"{BASE_URL}/api/byproduct-sales/pdf?kms_year=2025-26")
        assert response.status_code == 200
        print("✓ By-Product Sales PDF with filter works")


class TestPaddyCustodyRegisterExports:
    """Paddy Custody Register Export endpoints"""
    
    def test_custody_register_excel_export(self):
        """Test GET /api/paddy-custody-register/excel returns 200 with xlsx content"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register/excel")
        assert response.status_code == 200
        assert 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' in response.headers.get('content-type', '')
        assert len(response.content) > 0
        print("✓ Paddy Custody Register Excel export works")
    
    def test_custody_register_pdf_export(self):
        """Test GET /api/paddy-custody-register/pdf returns 200 with pdf content"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register/pdf")
        assert response.status_code == 200
        assert 'application/pdf' in response.headers.get('content-type', '')
        assert len(response.content) > 0
        print("✓ Paddy Custody Register PDF export works")
    
    def test_custody_register_excel_with_filter(self):
        """Test Excel export with filter"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register/excel?kms_year=2025-26")
        assert response.status_code == 200
        print("✓ Paddy Custody Register Excel with filter works")
    
    def test_custody_register_pdf_with_filter(self):
        """Test PDF export with filter"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register/pdf?season=Kharif")
        assert response.status_code == 200
        print("✓ Paddy Custody Register PDF with filter works")


class TestPaddyCustodyRegisterAPI:
    """Paddy Custody Register API tests"""
    
    def test_custody_register_get(self):
        """Test GET /api/paddy-custody-register returns correct structure"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register")
        assert response.status_code == 200
        data = response.json()
        # Verify structure
        assert 'total_received' in data
        assert 'total_issued' in data
        assert 'final_balance' in data
        assert 'rows' in data
        assert isinstance(data['rows'], list)
        print(f"✓ Custody Register API works - Received: {data['total_received']}, Released: {data['total_issued']}, Balance: {data['final_balance']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
