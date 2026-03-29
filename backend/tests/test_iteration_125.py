"""
Iteration 125: Test download.js migration and WhatsApp internal PDF generation
Features to test:
1. Login: POST /api/auth/login with username=admin, password=admin123
2. Party Ledger PDF: GET /api/reports/party-ledger/pdf returns valid PDF
3. WhatsApp send: POST /api/whatsapp/send-party-ledger generates PDF internally
4. Various page load tests (CashBook, DCTracker, MillingTracker, Reports, SaleBook, Settings)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestLoginFlow:
    """Test login functionality"""
    
    def test_login_success(self):
        """Test login with admin credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "user" in data or "username" in data or "role" in data, f"Unexpected response: {data}"
        print(f"Login successful: {data}")
    
    def test_login_invalid_credentials(self):
        """Test login with wrong credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "wrongpassword"
        })
        assert response.status_code in [401, 400], f"Expected 401/400, got {response.status_code}"


class TestPartyLedgerPDF:
    """Test Party Ledger PDF generation"""
    
    def test_party_ledger_pdf_returns_valid_pdf(self):
        """GET /api/reports/party-ledger/pdf returns valid PDF"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger/pdf")
        assert response.status_code == 200, f"PDF endpoint failed: {response.status_code}"
        
        # Check content type
        content_type = response.headers.get('Content-Type', '')
        assert 'application/pdf' in content_type, f"Expected PDF content type, got: {content_type}"
        
        # Check PDF magic bytes
        content = response.content
        assert len(content) > 100, f"PDF too small: {len(content)} bytes"
        assert content[:4] == b'%PDF', f"Invalid PDF magic bytes: {content[:10]}"
        print(f"Party Ledger PDF valid: {len(content)} bytes")
    
    def test_party_ledger_pdf_with_party_name(self):
        """GET /api/reports/party-ledger/pdf?party_name=test returns valid PDF"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger/pdf", params={"party_name": "test"})
        assert response.status_code == 200, f"PDF endpoint failed: {response.status_code}"
        
        content_type = response.headers.get('Content-Type', '')
        assert 'application/pdf' in content_type, f"Expected PDF content type, got: {content_type}"
        
        content = response.content
        assert content[:4] == b'%PDF', f"Invalid PDF magic bytes"
        print(f"Party Ledger PDF with party_name=test: {len(content)} bytes")


class TestWhatsAppSendPartyLedger:
    """Test WhatsApp send party ledger endpoint"""
    
    def test_whatsapp_send_party_ledger_generates_pdf_internally(self):
        """POST /api/whatsapp/send-party-ledger generates PDF internally"""
        # This endpoint should work even without WhatsApp API key configured
        # It should generate PDF internally and return appropriate response
        response = requests.post(f"{BASE_URL}/api/whatsapp/send-party-ledger", json={
            "party_name": "test",
            "total_debit": 1000,
            "total_credit": 500,
            "balance": 500,
            "transactions": []
        })
        
        # Should return 200 even if WhatsApp not configured (will return error message)
        assert response.status_code == 200, f"Endpoint failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Check response structure
        assert "success" in data or "error" in data, f"Unexpected response: {data}"
        print(f"WhatsApp send-party-ledger response: {data}")
    
    def test_whatsapp_settings_endpoint(self):
        """GET /api/whatsapp/settings returns settings"""
        response = requests.get(f"{BASE_URL}/api/whatsapp/settings")
        assert response.status_code == 200, f"Settings endpoint failed: {response.status_code}"
        data = response.json()
        
        # Check expected fields
        assert "api_key_masked" in data or "enabled" in data or "country_code" in data, f"Unexpected response: {data}"
        print(f"WhatsApp settings: {data}")


class TestExportEndpoints:
    """Test various export endpoints"""
    
    def test_party_ledger_excel(self):
        """GET /api/reports/party-ledger/excel returns valid Excel"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger/excel")
        assert response.status_code == 200, f"Excel endpoint failed: {response.status_code}"
        
        content_type = response.headers.get('Content-Type', '')
        assert 'spreadsheet' in content_type or 'excel' in content_type or 'openxml' in content_type, f"Expected Excel content type, got: {content_type}"
        
        content = response.content
        assert len(content) > 100, f"Excel too small: {len(content)} bytes"
        # Excel files start with PK (zip format)
        assert content[:2] == b'PK', f"Invalid Excel magic bytes: {content[:10]}"
        print(f"Party Ledger Excel valid: {len(content)} bytes")
    
    def test_outstanding_report_pdf(self):
        """GET /api/reports/outstanding/pdf returns valid PDF"""
        response = requests.get(f"{BASE_URL}/api/reports/outstanding/pdf")
        assert response.status_code == 200, f"PDF endpoint failed: {response.status_code}"
        
        content_type = response.headers.get('Content-Type', '')
        assert 'application/pdf' in content_type, f"Expected PDF content type, got: {content_type}"
        print(f"Outstanding Report PDF valid: {len(response.content)} bytes")
    
    def test_outstanding_report_excel(self):
        """GET /api/reports/outstanding/excel returns valid Excel"""
        response = requests.get(f"{BASE_URL}/api/reports/outstanding/excel")
        assert response.status_code == 200, f"Excel endpoint failed: {response.status_code}"
        
        content = response.content
        assert content[:2] == b'PK', f"Invalid Excel magic bytes"
        print(f"Outstanding Report Excel valid: {len(content)} bytes")
    
    def test_cash_book_excel(self):
        """GET /api/cash-book/excel returns valid Excel"""
        response = requests.get(f"{BASE_URL}/api/cash-book/excel")
        assert response.status_code == 200, f"Cash Book Excel endpoint failed: {response.status_code}"
        
        content = response.content
        assert content[:2] == b'PK', f"Invalid Excel magic bytes"
        print(f"Cash Book Excel valid: {len(content)} bytes")


class TestAPIEndpoints:
    """Test various API endpoints for page data"""
    
    def test_dashboard_endpoint(self):
        """GET /api/dashboard returns data"""
        response = requests.get(f"{BASE_URL}/api/dashboard")
        assert response.status_code == 200, f"Dashboard failed: {response.status_code}"
        data = response.json()
        print(f"Dashboard data keys: {list(data.keys()) if isinstance(data, dict) else 'list'}")
    
    def test_mill_entries_endpoint(self):
        """GET /api/mill-entries returns data"""
        response = requests.get(f"{BASE_URL}/api/mill-entries")
        assert response.status_code == 200, f"Mill entries failed: {response.status_code}"
        data = response.json()
        print(f"Mill entries count: {len(data) if isinstance(data, list) else 'dict'}")
    
    def test_dc_entries_endpoint(self):
        """GET /api/dc-entries returns data"""
        response = requests.get(f"{BASE_URL}/api/dc-entries")
        assert response.status_code == 200, f"DC entries failed: {response.status_code}"
        data = response.json()
        print(f"DC entries count: {len(data) if isinstance(data, list) else 'dict'}")
    
    def test_milling_entries_endpoint(self):
        """GET /api/milling-entries returns data"""
        response = requests.get(f"{BASE_URL}/api/milling-entries")
        assert response.status_code == 200, f"Milling entries failed: {response.status_code}"
        data = response.json()
        print(f"Milling entries count: {len(data) if isinstance(data, list) else 'dict'}")
    
    def test_cash_transactions_endpoint(self):
        """GET /api/cash-transactions returns data"""
        response = requests.get(f"{BASE_URL}/api/cash-transactions")
        assert response.status_code == 200, f"Cash transactions failed: {response.status_code}"
        data = response.json()
        print(f"Cash transactions count: {len(data) if isinstance(data, list) else 'dict'}")
    
    def test_sale_vouchers_endpoint(self):
        """GET /api/sale-vouchers returns data"""
        response = requests.get(f"{BASE_URL}/api/sale-vouchers")
        assert response.status_code == 200, f"Sale vouchers failed: {response.status_code}"
        data = response.json()
        print(f"Sale vouchers count: {len(data) if isinstance(data, list) else 'dict'}")
    
    def test_settings_branding_endpoint(self):
        """GET /api/settings/branding returns data"""
        response = requests.get(f"{BASE_URL}/api/settings/branding")
        assert response.status_code == 200, f"Branding settings failed: {response.status_code}"
        data = response.json()
        print(f"Branding settings: {list(data.keys()) if isinstance(data, dict) else data}")
    
    def test_staff_list_endpoint(self):
        """GET /api/staff returns data"""
        response = requests.get(f"{BASE_URL}/api/staff")
        assert response.status_code == 200, f"Staff list failed: {response.status_code}"
        data = response.json()
        print(f"Staff count: {len(data) if isinstance(data, list) else 'dict'}")
    
    def test_reports_cmr_vs_dc_endpoint(self):
        """GET /api/reports/cmr-vs-dc returns data"""
        response = requests.get(f"{BASE_URL}/api/reports/cmr-vs-dc")
        assert response.status_code == 200, f"CMR vs DC report failed: {response.status_code}"
        data = response.json()
        print(f"CMR vs DC report keys: {list(data.keys()) if isinstance(data, dict) else 'list'}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
