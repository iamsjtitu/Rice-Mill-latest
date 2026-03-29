"""
Iteration 124 Tests: Download utility migration and WhatsApp internal PDF generation
- Login API
- Party Ledger PDF endpoint returns valid PDF
- WhatsApp send-party-ledger generates PDF internally
- Various export endpoints work
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestIteration124:
    """Tests for iteration 124 - download.js migration and WhatsApp internal PDF fix"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    # ===== AUTH TESTS =====
    def test_login_success(self):
        """Test login with admin credentials"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "user" in data or "username" in data, "Login response missing user data"
        print(f"✓ Login successful: {data}")
    
    # ===== PARTY LEDGER PDF TESTS =====
    def test_party_ledger_pdf_endpoint(self):
        """Test GET /api/reports/party-ledger/pdf returns valid PDF"""
        response = self.session.get(f"{BASE_URL}/api/reports/party-ledger/pdf?party_name=test")
        assert response.status_code == 200, f"Party ledger PDF failed: {response.status_code}"
        
        # Check content type
        content_type = response.headers.get('Content-Type', '')
        assert 'application/pdf' in content_type, f"Expected PDF content type, got: {content_type}"
        
        # Check PDF magic bytes
        content = response.content
        assert len(content) > 100, f"PDF too small: {len(content)} bytes"
        assert content[:4] == b'%PDF', f"Invalid PDF magic bytes: {content[:10]}"
        print(f"✓ Party ledger PDF valid: {len(content)} bytes, Content-Type: {content_type}")
    
    def test_party_ledger_excel_endpoint(self):
        """Test GET /api/reports/party-ledger/excel returns valid Excel"""
        response = self.session.get(f"{BASE_URL}/api/reports/party-ledger/excel?party_name=test")
        assert response.status_code == 200, f"Party ledger Excel failed: {response.status_code}"
        
        content_type = response.headers.get('Content-Type', '')
        assert 'spreadsheet' in content_type or 'excel' in content_type or 'octet-stream' in content_type, f"Expected Excel content type, got: {content_type}"
        
        content = response.content
        assert len(content) > 100, f"Excel too small: {len(content)} bytes"
        # Excel files start with PK (zip format)
        assert content[:2] == b'PK', f"Invalid Excel magic bytes: {content[:10]}"
        print(f"✓ Party ledger Excel valid: {len(content)} bytes")
    
    # ===== WHATSAPP SEND-PARTY-LEDGER TEST =====
    def test_whatsapp_send_party_ledger_internal_pdf(self):
        """Test POST /api/whatsapp/send-party-ledger generates PDF internally"""
        # This endpoint should generate PDF internally without HTTP self-call
        response = self.session.post(f"{BASE_URL}/api/whatsapp/send-party-ledger", json={
            "party_name": "Test Party",
            "total_debit": 10000,
            "total_credit": 5000,
            "balance": 5000,
            "transactions": [
                {"date": "2025-01-01", "txn_type": "nikasi", "amount": 10000, "description": "Test debit"},
                {"date": "2025-01-02", "txn_type": "jama", "amount": 5000, "description": "Test credit"}
            ],
            "pdf_url": "/api/reports/party-ledger/pdf?party_name=Test Party"
        })
        
        # Should return success or error about WhatsApp API key (not about PDF generation)
        assert response.status_code == 200, f"WhatsApp send-party-ledger failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # If WhatsApp API key not set, it should return that error (not PDF generation error)
        if not data.get("success"):
            error = data.get("error", "")
            # Acceptable errors: API key not set, no default numbers
            acceptable_errors = ["API key", "api_key", "number", "Number", "set nahi"]
            assert any(e in error for e in acceptable_errors), f"Unexpected error: {error}"
            print(f"✓ WhatsApp send-party-ledger: API key not configured (expected): {error}")
        else:
            print(f"✓ WhatsApp send-party-ledger success: {data}")
    
    # ===== EXPORT ENDPOINTS TESTS =====
    def test_cmr_vs_dc_excel_export(self):
        """Test CMR vs DC Excel export"""
        response = self.session.get(f"{BASE_URL}/api/reports/cmr-vs-dc/excel")
        assert response.status_code == 200, f"CMR vs DC Excel failed: {response.status_code}"
        assert len(response.content) > 100, "Excel file too small"
        print(f"✓ CMR vs DC Excel export: {len(response.content)} bytes")
    
    def test_cmr_vs_dc_pdf_export(self):
        """Test CMR vs DC PDF export"""
        response = self.session.get(f"{BASE_URL}/api/reports/cmr-vs-dc/pdf")
        assert response.status_code == 200, f"CMR vs DC PDF failed: {response.status_code}"
        assert response.content[:4] == b'%PDF', "Invalid PDF"
        print(f"✓ CMR vs DC PDF export: {len(response.content)} bytes")
    
    def test_season_pnl_excel_export(self):
        """Test Season P&L Excel export"""
        response = self.session.get(f"{BASE_URL}/api/reports/season-pnl/excel")
        assert response.status_code == 200, f"Season P&L Excel failed: {response.status_code}"
        print(f"✓ Season P&L Excel export: {len(response.content)} bytes")
    
    def test_season_pnl_pdf_export(self):
        """Test Season P&L PDF export"""
        response = self.session.get(f"{BASE_URL}/api/reports/season-pnl/pdf")
        assert response.status_code == 200, f"Season P&L PDF failed: {response.status_code}"
        print(f"✓ Season P&L PDF export: {len(response.content)} bytes")
    
    def test_dc_entries_excel_export(self):
        """Test DC Entries Excel export"""
        response = self.session.get(f"{BASE_URL}/api/dc-entries/excel")
        assert response.status_code == 200, f"DC Entries Excel failed: {response.status_code}"
        print(f"✓ DC Entries Excel export: {len(response.content)} bytes")
    
    def test_dc_entries_pdf_export(self):
        """Test DC Entries PDF export"""
        response = self.session.get(f"{BASE_URL}/api/dc-entries/pdf")
        assert response.status_code == 200, f"DC Entries PDF failed: {response.status_code}"
        print(f"✓ DC Entries PDF export: {len(response.content)} bytes")
    
    def test_msp_payments_excel_export(self):
        """Test MSP Payments Excel export"""
        response = self.session.get(f"{BASE_URL}/api/msp-payments/excel")
        assert response.status_code == 200, f"MSP Payments Excel failed: {response.status_code}"
        print(f"✓ MSP Payments Excel export: {len(response.content)} bytes")
    
    def test_msp_payments_pdf_export(self):
        """Test MSP Payments PDF export"""
        response = self.session.get(f"{BASE_URL}/api/msp-payments/pdf")
        assert response.status_code == 200, f"MSP Payments PDF failed: {response.status_code}"
        print(f"✓ MSP Payments PDF export: {len(response.content)} bytes")
    
    def test_gunny_bags_excel_export(self):
        """Test Gunny Bags Excel export"""
        response = self.session.get(f"{BASE_URL}/api/gunny-bags/excel")
        assert response.status_code == 200, f"Gunny Bags Excel failed: {response.status_code}"
        print(f"✓ Gunny Bags Excel export: {len(response.content)} bytes")
    
    def test_gunny_bags_pdf_export(self):
        """Test Gunny Bags PDF export"""
        response = self.session.get(f"{BASE_URL}/api/gunny-bags/pdf")
        assert response.status_code == 200, f"Gunny Bags PDF failed: {response.status_code}"
        print(f"✓ Gunny Bags PDF export: {len(response.content)} bytes")
    
    def test_milling_report_excel_export(self):
        """Test Milling Report Excel export"""
        response = self.session.get(f"{BASE_URL}/api/milling-report/excel")
        assert response.status_code == 200, f"Milling Report Excel failed: {response.status_code}"
        print(f"✓ Milling Report Excel export: {len(response.content)} bytes")
    
    def test_milling_report_pdf_export(self):
        """Test Milling Report PDF export"""
        response = self.session.get(f"{BASE_URL}/api/milling-report/pdf")
        assert response.status_code == 200, f"Milling Report PDF failed: {response.status_code}"
        print(f"✓ Milling Report PDF export: {len(response.content)} bytes")
    
    def test_frk_purchases_excel_export(self):
        """Test FRK Purchases Excel export"""
        response = self.session.get(f"{BASE_URL}/api/frk-purchases/excel")
        assert response.status_code == 200, f"FRK Purchases Excel failed: {response.status_code}"
        print(f"✓ FRK Purchases Excel export: {len(response.content)} bytes")
    
    def test_byproduct_sales_excel_export(self):
        """Test Byproduct Sales Excel export"""
        response = self.session.get(f"{BASE_URL}/api/byproduct-sales/excel")
        assert response.status_code == 200, f"Byproduct Sales Excel failed: {response.status_code}"
        print(f"✓ Byproduct Sales Excel export: {len(response.content)} bytes")
    
    def test_paddy_custody_register_excel_export(self):
        """Test Paddy Custody Register Excel export"""
        response = self.session.get(f"{BASE_URL}/api/paddy-custody-register/excel")
        assert response.status_code == 200, f"Paddy Custody Register Excel failed: {response.status_code}"
        print(f"✓ Paddy Custody Register Excel export: {len(response.content)} bytes")
    
    def test_sale_book_pdf_export(self):
        """Test Sale Book PDF export"""
        response = self.session.get(f"{BASE_URL}/api/sale-book/export/pdf")
        assert response.status_code == 200, f"Sale Book PDF failed: {response.status_code}"
        print(f"✓ Sale Book PDF export: {len(response.content)} bytes")
    
    def test_sale_book_excel_export(self):
        """Test Sale Book Excel export"""
        response = self.session.get(f"{BASE_URL}/api/sale-book/export/excel")
        assert response.status_code == 200, f"Sale Book Excel failed: {response.status_code}"
        print(f"✓ Sale Book Excel export: {len(response.content)} bytes")
    
    def test_cash_book_excel_export(self):
        """Test Cash Book Excel export"""
        response = self.session.get(f"{BASE_URL}/api/cash-book/excel")
        assert response.status_code == 200, f"Cash Book Excel failed: {response.status_code}"
        print(f"✓ Cash Book Excel export: {len(response.content)} bytes")
    
    def test_truck_payments_excel_export(self):
        """Test Truck Payments Excel export"""
        response = self.session.get(f"{BASE_URL}/api/export/truck-payments-excel")
        assert response.status_code == 200, f"Truck Payments Excel failed: {response.status_code}"
        print(f"✓ Truck Payments Excel export: {len(response.content)} bytes")
    
    def test_truck_payments_pdf_export(self):
        """Test Truck Payments PDF export"""
        response = self.session.get(f"{BASE_URL}/api/export/truck-payments-pdf")
        assert response.status_code == 200, f"Truck Payments PDF failed: {response.status_code}"
        print(f"✓ Truck Payments PDF export: {len(response.content)} bytes")
    
    # ===== WHATSAPP SETTINGS TEST =====
    def test_whatsapp_settings(self):
        """Test WhatsApp settings endpoint"""
        response = self.session.get(f"{BASE_URL}/api/whatsapp/settings")
        assert response.status_code == 200, f"WhatsApp settings failed: {response.status_code}"
        data = response.json()
        # Should have api_key_masked field
        assert "api_key_masked" in data or "enabled" in data, f"Missing expected fields: {data}"
        print(f"✓ WhatsApp settings: {data}")
    
    # ===== DAILY REPORT EXPORT TEST =====
    def test_daily_report_pdf_export(self):
        """Test Daily Report PDF export"""
        from datetime import date
        today = date.today().isoformat()
        response = self.session.get(f"{BASE_URL}/api/reports/daily/pdf?date={today}&mode=normal")
        assert response.status_code == 200, f"Daily Report PDF failed: {response.status_code}"
        print(f"✓ Daily Report PDF export: {len(response.content)} bytes")
    
    def test_daily_report_excel_export(self):
        """Test Daily Report Excel export"""
        from datetime import date
        today = date.today().isoformat()
        response = self.session.get(f"{BASE_URL}/api/reports/daily/excel?date={today}&mode=normal")
        assert response.status_code == 200, f"Daily Report Excel failed: {response.status_code}"
        print(f"✓ Daily Report Excel export: {len(response.content)} bytes")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
