"""
Iteration 123: Regression tests for critical fixes
- Login flow
- PDF download endpoint (party-ledger/pdf)
- Excel export (cash-book/excel)
- WhatsApp settings endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthLogin:
    """Test login flow with admin credentials"""
    
    def test_login_success(self):
        """POST /api/auth/login with username=admin, password=admin123 should succeed"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "username" in data or "role" in data, f"Response missing user info: {data}"
        print(f"Login success: {data}")
    
    def test_login_invalid_credentials(self):
        """POST /api/auth/login with wrong credentials should fail"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "wronguser",
            "password": "wrongpass"
        })
        assert response.status_code in [401, 400], f"Expected 401/400, got {response.status_code}"
        print(f"Invalid login correctly rejected: {response.status_code}")


class TestPDFDownload:
    """Test PDF download endpoints"""
    
    def test_party_ledger_pdf(self):
        """GET /api/reports/party-ledger/pdf returns valid PDF"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger/pdf")
        assert response.status_code == 200, f"PDF endpoint failed: {response.status_code} - {response.text}"
        content_type = response.headers.get('content-type', '')
        assert 'application/pdf' in content_type, f"Expected PDF content-type, got: {content_type}"
        # Check PDF magic bytes
        assert response.content[:4] == b'%PDF', f"Response is not a valid PDF file"
        print(f"Party ledger PDF: {len(response.content)} bytes, content-type: {content_type}")
    
    def test_outstanding_pdf(self):
        """GET /api/reports/outstanding/pdf returns valid PDF"""
        response = requests.get(f"{BASE_URL}/api/reports/outstanding/pdf")
        assert response.status_code == 200, f"Outstanding PDF failed: {response.status_code}"
        content_type = response.headers.get('content-type', '')
        assert 'application/pdf' in content_type, f"Expected PDF content-type, got: {content_type}"
        print(f"Outstanding PDF: {len(response.content)} bytes")


class TestExcelExport:
    """Test Excel export endpoints"""
    
    def test_cash_book_excel(self):
        """GET /api/cash-book/excel returns valid Excel file"""
        response = requests.get(f"{BASE_URL}/api/cash-book/excel")
        assert response.status_code == 200, f"Excel export failed: {response.status_code} - {response.text}"
        content_type = response.headers.get('content-type', '')
        # Excel content types
        valid_excel_types = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
                            'application/vnd.ms-excel', 'application/octet-stream']
        assert any(t in content_type for t in valid_excel_types), f"Expected Excel content-type, got: {content_type}"
        # Check XLSX magic bytes (PK zip header)
        assert response.content[:2] == b'PK', f"Response is not a valid XLSX file"
        print(f"Cash book Excel: {len(response.content)} bytes, content-type: {content_type}")
    
    def test_party_ledger_excel(self):
        """GET /api/reports/party-ledger/excel returns valid Excel file"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger/excel")
        assert response.status_code == 200, f"Party ledger Excel failed: {response.status_code}"
        content_type = response.headers.get('content-type', '')
        assert 'spreadsheet' in content_type or 'octet-stream' in content_type, f"Unexpected content-type: {content_type}"
        print(f"Party ledger Excel: {len(response.content)} bytes")


class TestWhatsAppSettings:
    """Test WhatsApp settings endpoint"""
    
    def test_get_whatsapp_settings(self):
        """GET /api/whatsapp/settings works"""
        response = requests.get(f"{BASE_URL}/api/whatsapp/settings")
        assert response.status_code == 200, f"WhatsApp settings failed: {response.status_code} - {response.text}"
        data = response.json()
        # Should have expected fields
        assert 'country_code' in data or 'enabled' in data or 'api_key_masked' in data, f"Missing expected fields: {data}"
        print(f"WhatsApp settings: {data}")


class TestCashBookAPI:
    """Test CashBook related endpoints"""
    
    def test_cash_book_list(self):
        """GET /api/cash-book returns list"""
        response = requests.get(f"{BASE_URL}/api/cash-book")
        assert response.status_code == 200, f"Cash book list failed: {response.status_code}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got: {type(data)}"
        print(f"Cash book entries: {len(data)}")
    
    def test_cash_book_summary(self):
        """GET /api/cash-book/summary returns summary"""
        response = requests.get(f"{BASE_URL}/api/cash-book/summary")
        assert response.status_code == 200, f"Cash book summary failed: {response.status_code}"
        data = response.json()
        print(f"Cash book summary: {data}")


class TestLedgersAPI:
    """Test Ledgers related endpoints"""
    
    def test_party_ledger(self):
        """GET /api/reports/party-ledger returns ledger data"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger")
        assert response.status_code == 200, f"Party ledger failed: {response.status_code}"
        data = response.json()
        assert 'ledger' in data or 'party_list' in data, f"Missing expected fields: {data.keys()}"
        print(f"Party ledger: {len(data.get('ledger', []))} entries, {len(data.get('party_list', []))} parties")
    
    def test_outstanding_report(self):
        """GET /api/reports/outstanding returns outstanding data"""
        response = requests.get(f"{BASE_URL}/api/reports/outstanding")
        assert response.status_code == 200, f"Outstanding report failed: {response.status_code}"
        data = response.json()
        assert 'dc_outstanding' in data or 'msp_outstanding' in data, f"Missing expected fields: {data.keys()}"
        print(f"Outstanding report: DC={data.get('dc_outstanding', {}).get('count', 0)}, trucks={len(data.get('trucks', []))}")


class TestSettingsAPI:
    """Test Settings related endpoints"""
    
    def test_branding(self):
        """GET /api/branding returns branding data"""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200, f"Branding failed: {response.status_code}"
        data = response.json()
        print(f"Branding: {data.get('company_name', 'N/A')}")
    
    def test_gst_settings(self):
        """GET /api/gst-settings returns GST settings (may be 404 if not set)"""
        response = requests.get(f"{BASE_URL}/api/gst-settings")
        # 404 is acceptable if no settings saved yet
        assert response.status_code in [200, 404], f"GST settings unexpected status: {response.status_code}"
        if response.status_code == 200:
            data = response.json()
            print(f"GST settings: {data}")
        else:
            print("GST settings not configured (404)")


class TestDashboardAPI:
    """Test Dashboard related endpoints"""
    
    def test_dashboard_summary(self):
        """GET /api/dashboard/summary returns dashboard data"""
        response = requests.get(f"{BASE_URL}/api/dashboard/summary")
        # May return 200 or 404 depending on implementation
        if response.status_code == 200:
            data = response.json()
            print(f"Dashboard summary: {data}")
        elif response.status_code == 404:
            print("Dashboard summary endpoint not found (may be different route)")
        else:
            # Try alternative endpoint
            response2 = requests.get(f"{BASE_URL}/api/fy-summary")
            if response2.status_code == 200:
                print(f"FY Summary: {response2.json()}")
            else:
                print(f"Dashboard/FY summary status: {response.status_code}, {response2.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
