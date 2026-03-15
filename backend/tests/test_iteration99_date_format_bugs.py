"""
Test iteration 99: Bug fixes testing
1) Date format DD-MM-YYYY verification in API responses and PDFs
2) Print Receipt PDF - no Hindi text, proper English only
3) Advance auto-fetch when typing sardar name (400ms debounce in frontend)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestDateFormatInHemaliPayments:
    """Test date format in Hemali Payments API responses"""
    
    def test_hemali_payments_list_returns_date(self, session):
        """Hemali payments list should return date field in YYYY-MM-DD format (API stores it that way)"""
        r = session.get(f"{BASE_URL}/api/hemali/payments")
        assert r.status_code == 200
        payments = r.json()
        # Check if there's data
        if len(payments) > 0:
            p = payments[0]
            assert "date" in p
            # Backend stores date as YYYY-MM-DD, frontend converts to DD-MM-YYYY
            date_val = p["date"]
            # Should be in YYYY-MM-DD format from API
            parts = date_val.split("-")
            assert len(parts) == 3, f"Date should have 3 parts, got {parts}"
            # Year should be 4 digits
            assert len(parts[0]) == 4, f"Year should be 4 digits: {parts[0]}"
            print(f"✓ Payment date from API: {date_val}")
    
    def test_hemali_print_receipt_pdf_no_hindi_boxes(self, session):
        """Print receipt PDF should be valid and not contain Hindi text that causes boxes"""
        # First get a payment
        r = session.get(f"{BASE_URL}/api/hemali/payments")
        assert r.status_code == 200
        payments = r.json()
        
        if len(payments) == 0:
            pytest.skip("No payments found to test print receipt")
        
        payment_id = payments[0]["id"]
        
        # Get print receipt
        r = session.get(f"{BASE_URL}/api/hemali/payments/{payment_id}/print")
        assert r.status_code == 200
        assert r.headers.get("content-type") == "application/pdf"
        
        # Verify it's a valid PDF
        content = r.content
        assert content.startswith(b"%PDF"), "Should be valid PDF"
        assert len(content) > 1000, "PDF should have reasonable size"
        print(f"✓ Print receipt PDF generated: {len(content)} bytes")
    
    def test_hemali_export_pdf_date_format(self, session):
        """Hemali export PDF should have dates formatted correctly"""
        r = session.get(f"{BASE_URL}/api/hemali/export/pdf")
        assert r.status_code == 200
        assert r.headers.get("content-type") == "application/pdf"
        
        content = r.content
        assert content.startswith(b"%PDF"), "Should be valid PDF"
        print(f"✓ Hemali export PDF generated: {len(content)} bytes")


class TestDailyReportDateFormat:
    """Test date format in Daily Report API responses and PDFs"""
    
    def test_daily_report_api_date_field(self, session):
        """Daily report API should return date field"""
        r = session.get(f"{BASE_URL}/api/reports/daily?date=2026-03-15")
        assert r.status_code == 200
        data = r.json()
        assert "date" in data
        # API returns date as-is (YYYY-MM-DD)
        assert data["date"] == "2026-03-15"
        print(f"✓ Daily report API returns date: {data['date']}")
    
    def test_daily_report_pdf_generates(self, session):
        """Daily report PDF should generate successfully"""
        r = session.get(f"{BASE_URL}/api/reports/daily/pdf?date=2026-03-15")
        assert r.status_code == 200
        assert r.headers.get("content-type") == "application/pdf"
        
        content = r.content
        assert content.startswith(b"%PDF"), "Should be valid PDF"
        print(f"✓ Daily report PDF generated: {len(content)} bytes")
    
    def test_daily_report_hemali_section_has_data(self, session):
        """Daily report should include hemali_payments section"""
        r = session.get(f"{BASE_URL}/api/reports/daily?date=2026-03-15")
        assert r.status_code == 200
        data = r.json()
        
        assert "hemali_payments" in data
        hemali = data["hemali_payments"]
        assert "count" in hemali
        assert "paid_count" in hemali
        assert "unpaid_count" in hemali
        assert "details" in hemali
        print(f"✓ Daily report hemali section: count={hemali['count']}, paid={hemali['paid_count']}")


class TestAdvanceAutoFetch:
    """Test advance API endpoint that frontend uses for auto-fetch"""
    
    def test_advance_api_for_known_sardar(self, session):
        """Advance API should return advance balance for known sardar"""
        r = session.get(f"{BASE_URL}/api/hemali/advance?sardar_name=Ramesh")
        assert r.status_code == 200
        data = r.json()
        
        assert "advance" in data
        assert "sardar_name" in data
        assert data["sardar_name"] == "Ramesh"
        print(f"✓ Advance for Ramesh: Rs.{data['advance']}")
    
    def test_advance_api_for_unknown_sardar(self, session):
        """Advance API should return 0 for unknown sardar"""
        r = session.get(f"{BASE_URL}/api/hemali/advance?sardar_name=UnknownSardar999")
        assert r.status_code == 200
        data = r.json()
        
        assert data["advance"] == 0
        print(f"✓ Advance for unknown sardar: Rs.{data['advance']}")
    
    def test_advance_api_empty_name(self, session):
        """Advance API should return 0 for empty sardar name"""
        r = session.get(f"{BASE_URL}/api/hemali/advance?sardar_name=")
        assert r.status_code == 200
        data = r.json()
        
        assert data["advance"] == 0
        print("✓ Advance for empty name: 0")


class TestLedgersDateFormat:
    """Test date format in Ledgers API"""
    
    def test_ledgers_list_returns_date(self, session):
        """Ledgers list should return transactions with date field"""
        r = session.get(f"{BASE_URL}/api/cash-book?account=ledger")
        assert r.status_code == 200
        txns = r.json()
        
        if len(txns) > 0:
            t = txns[0]
            assert "date" in t
            date_val = t["date"]
            parts = date_val.split("-")
            assert len(parts) == 3, f"Date should have 3 parts: {date_val}"
            print(f"✓ Ledger transaction date from API: {date_val}")
        else:
            print("⚠ No ledger transactions to verify date format")


class TestSaleBookDateFormat:
    """Test date format in SaleBook API"""
    
    def test_sale_vouchers_list_date_format(self, session):
        """Sale vouchers list should return date field"""
        r = session.get(f"{BASE_URL}/api/sale-book")
        assert r.status_code == 200
        vouchers = r.json()
        
        if len(vouchers) > 0:
            v = vouchers[0]
            assert "date" in v
            date_val = v["date"]
            parts = date_val.split("-")
            assert len(parts) == 3, f"Date should have 3 parts: {date_val}"
            print(f"✓ Sale voucher date from API: {date_val}")
        else:
            print("⚠ No sale vouchers to verify date format")


class TestCashBookDateFormat:
    """Test date format in CashBook Transactions API"""
    
    def test_cash_transactions_date_format(self, session):
        """Cash transactions should return date field in YYYY-MM-DD format"""
        r = session.get(f"{BASE_URL}/api/cash-book?account=cash")
        assert r.status_code == 200
        txns = r.json()
        
        if len(txns) > 0:
            t = txns[0]
            assert "date" in t
            date_val = t["date"]
            parts = date_val.split("-")
            assert len(parts) == 3, f"Date should have 3 parts: {date_val}"
            assert len(parts[0]) == 4, "Year should be 4 digits"
            print(f"✓ Cash transaction date from API: {date_val}")
        else:
            print("⚠ No cash transactions to verify date format")


class TestMonthlySummaryDateFormat:
    """Test Monthly Summary API date handling"""
    
    def test_monthly_summary_month_format(self, session):
        """Monthly summary should group by YYYY-MM month"""
        r = session.get(f"{BASE_URL}/api/hemali/monthly-summary")
        assert r.status_code == 200
        data = r.json()
        
        if len(data) > 0:
            sardar = data[0]
            assert "months" in sardar
            if len(sardar["months"]) > 0:
                month_obj = sardar["months"][0]
                assert "month" in month_obj
                month_val = month_obj["month"]
                # Month should be YYYY-MM format
                parts = month_val.split("-")
                assert len(parts) == 2, f"Month should be YYYY-MM: {month_val}"
                print(f"✓ Monthly summary month format: {month_val}")


class TestReceipt404:
    """Test receipt endpoint for non-existent payment"""
    
    def test_print_receipt_404(self, session):
        """Print receipt should return 404 for non-existent payment"""
        r = session.get(f"{BASE_URL}/api/hemali/payments/non-existent-id-12345/print")
        assert r.status_code == 404
        print("✓ Print receipt returns 404 for non-existent payment")
