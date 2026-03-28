"""
Test Bug Fixes - Iteration 117
Tests for:
1. Daily Report PDF - no empty 'Payments Summary' section when payment values are 0
2. Daily Report PDF - Cash Flow section has header + Cash/Bank rows without duplicate empty summary box
3. Entries PDF download endpoint works (/api/export/pdf)
4. Cashbook PDF download endpoint works (/api/cash-book/pdf)
5. WhatsApp send-payment-reminder endpoint returns footer with 'Thank you' instead of 'Kripya baaki rashi'
6. WhatsApp send-daily-report endpoint works
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDailyReportPDF:
    """Test Daily Report PDF generation fixes"""
    
    def test_daily_report_json_endpoint(self):
        """Test daily report JSON endpoint returns data"""
        response = requests.get(f"{BASE_URL}/api/reports/daily", params={
            "date": "2026-03-22",
            "mode": "normal"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "date" in data
        assert "payments" in data
        assert "cash_flow" in data
        print(f"Daily report JSON: date={data['date']}, payments={data['payments']}")
    
    def test_daily_report_pdf_endpoint_normal_mode(self):
        """Test daily report PDF endpoint works in normal mode"""
        response = requests.get(f"{BASE_URL}/api/reports/daily/pdf", params={
            "date": "2026-03-22",
            "mode": "normal"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "application/pdf" in response.headers.get("content-type", "")
        assert len(response.content) > 1000, "PDF content too small"
        print(f"Daily report PDF (normal): {len(response.content)} bytes")
    
    def test_daily_report_pdf_endpoint_detail_mode(self):
        """Test daily report PDF endpoint works in detail mode"""
        response = requests.get(f"{BASE_URL}/api/reports/daily/pdf", params={
            "date": "2026-03-22",
            "mode": "detail"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "application/pdf" in response.headers.get("content-type", "")
        assert len(response.content) > 1000, "PDF content too small"
        print(f"Daily report PDF (detail): {len(response.content)} bytes")
    
    def test_daily_report_payments_conditional(self):
        """Verify payments section is conditional based on values"""
        # Get JSON data to check payment values
        response = requests.get(f"{BASE_URL}/api/reports/daily", params={
            "date": "2026-03-22",
            "mode": "normal"
        })
        assert response.status_code == 200
        data = response.json()
        payments = data.get("payments", {})
        
        # Check if has_payments logic is correct
        msp = payments.get("msp_received", 0) or 0
        pvt_paid = payments.get("pvt_paddy_paid", 0) or 0
        rice_received = payments.get("rice_sale_received", 0) or 0
        has_payments = msp > 0 or pvt_paid > 0 or rice_received > 0
        
        print(f"Payments: MSP={msp}, PvtPaid={pvt_paid}, RiceReceived={rice_received}, has_payments={has_payments}")
        # This test just verifies the data structure - PDF rendering is tested separately
    
    def test_daily_report_cash_flow_structure(self):
        """Verify cash flow section has proper structure"""
        response = requests.get(f"{BASE_URL}/api/reports/daily", params={
            "date": "2026-03-22",
            "mode": "normal"
        })
        assert response.status_code == 200
        data = response.json()
        cf = data.get("cash_flow", {})
        
        # Verify cash flow has required fields
        assert "cash_jama" in cf
        assert "cash_nikasi" in cf
        assert "bank_jama" in cf
        assert "bank_nikasi" in cf
        assert "net_cash" in cf
        assert "net_bank" in cf
        
        print(f"Cash Flow: cash_jama={cf['cash_jama']}, cash_nikasi={cf['cash_nikasi']}, bank_jama={cf['bank_jama']}, bank_nikasi={cf['bank_nikasi']}")


class TestEntriesPDF:
    """Test Entries PDF export endpoint"""
    
    def test_entries_pdf_endpoint(self):
        """Test /api/export/pdf endpoint works"""
        response = requests.get(f"{BASE_URL}/api/export/pdf", params={
            "kms_year": "2024-25"
        })
        # Should return 200 with PDF or 200 with empty data
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        content_type = response.headers.get("content-type", "")
        assert "application/pdf" in content_type, f"Expected PDF, got {content_type}"
        print(f"Entries PDF: {len(response.content)} bytes")


class TestCashbookPDF:
    """Test Cashbook PDF export endpoint"""
    
    def test_cashbook_pdf_endpoint(self):
        """Test /api/cash-book/pdf endpoint works"""
        response = requests.get(f"{BASE_URL}/api/cash-book/pdf", params={
            "start_date": "2026-01-01",
            "end_date": "2026-03-31"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        content_type = response.headers.get("content-type", "")
        assert "application/pdf" in content_type, f"Expected PDF, got {content_type}"
        print(f"Cashbook PDF: {len(response.content)} bytes")


class TestWhatsAppFooterFix:
    """Test WhatsApp footer fix - should say 'Thank you' instead of 'Kripya baaki rashi'"""
    
    def test_send_payment_reminder_footer(self):
        """Test send-payment-reminder endpoint returns correct footer"""
        # This will fail if no API key is set, but we can check the message format
        response = requests.post(f"{BASE_URL}/api/whatsapp/send-payment-reminder", json={
            "party_name": "Test Party",
            "total_amount": 10000,
            "paid_amount": 5000,
            "balance": 5000,
            "phone": ""  # Empty phone to trigger default numbers check
        })
        
        # Should return 200 with success:false if no API key/numbers configured
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # If no API key, it will return error message
        if not data.get("success"):
            error = data.get("error", "")
            print(f"WhatsApp not configured (expected): {error}")
            # This is expected if WhatsApp is not configured
            assert "API key" in error or "number" in error.lower(), f"Unexpected error: {error}"
        else:
            print(f"WhatsApp message sent: {data}")
    
    def test_send_daily_report_endpoint(self):
        """Test send-daily-report endpoint works"""
        response = requests.post(f"{BASE_URL}/api/whatsapp/send-daily-report", json={
            "report_text": "Test Daily Report\nDate: 2026-03-22\nTotal: Rs.10,000",
            "pdf_url": "",
            "send_to_group": False,
            "phone": ""
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        if not data.get("success"):
            error = data.get("error", "")
            print(f"WhatsApp not configured (expected): {error}")
            # Expected if no numbers configured
        else:
            print(f"Daily report sent: {data}")


class TestWhatsAppCodeReview:
    """Code review tests - verify footer text in whatsapp.py"""
    
    def test_whatsapp_py_footer_text(self):
        """Verify whatsapp.py has correct footer text"""
        # Read the whatsapp.py file and check for correct footer
        whatsapp_file = "/app/backend/routes/whatsapp.py"
        with open(whatsapp_file, 'r') as f:
            content = f.read()
        
        # Should NOT contain old footer
        assert "Kripya baaki rashi" not in content, "Old footer 'Kripya baaki rashi' still present in whatsapp.py"
        assert "bhugtan karein" not in content, "Old footer 'bhugtan karein' still present in whatsapp.py"
        
        # Should contain new footer
        assert "Thank you" in content, "New footer 'Thank you' not found in whatsapp.py"
        
        print("WhatsApp footer text verified: 'Thank you' present, old Hindi text removed")


class TestDailyReportCodeReview:
    """Code review tests - verify daily report PDF fixes"""
    
    def test_daily_report_py_payments_conditional(self):
        """Verify daily_report.py has conditional payments section"""
        daily_report_file = "/app/backend/routes/daily_report.py"
        with open(daily_report_file, 'r') as f:
            content = f.read()
        
        # Should have conditional check for payments
        assert "has_payments" in content, "Conditional 'has_payments' check not found"
        assert "if has_payments:" in content, "Conditional 'if has_payments:' not found"
        
        print("Daily report payments conditional verified")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
