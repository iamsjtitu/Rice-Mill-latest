"""
Test suite for Hemali Payment enhancements (Iteration 98):
1. Print Receipt - GET /api/hemali/payments/{id}/print - NAVKAR AGRO header PDF
2. Daily Report with hemali_payments section
3. Daily Report PDF/Excel with Hemali section
4. Monthly Summary with month filter
5. Monthly Summary PDF/Excel with month filter
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://v27-stable.preview.emergentagent.com')

@pytest.fixture
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestPrintReceiptPDF:
    """Test Hemali Payment Print Receipt - NAVKAR AGRO style PDF"""
    
    def test_print_receipt_returns_pdf(self, api_client):
        """GET /api/hemali/payments/{id}/print - should return PDF with 200"""
        # First get existing payments to find a valid ID
        res = api_client.get(f"{BASE_URL}/api/hemali/payments")
        assert res.status_code == 200
        payments = res.json()
        
        if not payments:
            pytest.skip("No existing hemali payments found")
        
        # Get a paid payment for print
        paid_payments = [p for p in payments if p.get("status") == "paid"]
        if not paid_payments:
            pytest.skip("No paid hemali payments found for print test")
        
        payment_id = paid_payments[0]["id"]
        
        # Test print endpoint
        print_res = api_client.get(f"{BASE_URL}/api/hemali/payments/{payment_id}/print")
        assert print_res.status_code == 200, f"Expected 200, got {print_res.status_code}"
        
        # Should return PDF
        content_type = print_res.headers.get("Content-Type", "")
        assert "pdf" in content_type.lower(), f"Expected PDF content type, got {content_type}"
        
        # PDF should have non-zero size
        assert len(print_res.content) > 500, "PDF content too small, likely empty or error"
        
        # PDF should start with PDF header
        assert print_res.content[:4] == b'%PDF', "Response is not a valid PDF file"
        
        print(f"✓ Print receipt PDF returned successfully for payment {payment_id[:8]}...")
        print(f"  PDF size: {len(print_res.content)} bytes")
    
    def test_print_receipt_404_for_invalid_id(self, api_client):
        """GET /api/hemali/payments/{invalid_id}/print - should return 404"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        res = api_client.get(f"{BASE_URL}/api/hemali/payments/{fake_id}/print")
        assert res.status_code == 404, f"Expected 404 for invalid ID, got {res.status_code}"
        print("✓ Print receipt correctly returns 404 for invalid payment ID")


class TestDailyReportHemaliSection:
    """Test Daily Report includes hemali_payments section"""
    
    def test_daily_report_has_hemali_section(self, api_client):
        """GET /api/reports/daily?date=2026-03-15 should include hemali_payments"""
        res = api_client.get(f"{BASE_URL}/api/reports/daily?date=2026-03-15")
        assert res.status_code == 200
        data = res.json()
        
        # Check hemali_payments section exists
        assert "hemali_payments" in data, "hemali_payments section missing from daily report"
        hp = data["hemali_payments"]
        
        # Check required fields
        assert "count" in hp, "hemali_payments.count missing"
        assert "paid_count" in hp, "hemali_payments.paid_count missing"
        assert "unpaid_count" in hp, "hemali_payments.unpaid_count missing"
        assert "details" in hp, "hemali_payments.details missing"
        
        print(f"✓ Daily report contains hemali_payments section")
        print(f"  count: {hp['count']}, paid: {hp['paid_count']}, unpaid: {hp['unpaid_count']}")
        
        # If there are details, check structure
        if hp["details"]:
            detail = hp["details"][0]
            required_fields = ["sardar", "items", "total", "status"]
            for field in required_fields:
                assert field in detail, f"Detail field '{field}' missing"
            print(f"  Details structure verified: {list(detail.keys())}")
    
    def test_daily_report_hemali_counts(self, api_client):
        """Verify hemali payment counts are correct"""
        res = api_client.get(f"{BASE_URL}/api/reports/daily?date=2026-03-15")
        assert res.status_code == 200
        data = res.json()
        
        hp = data.get("hemali_payments", {})
        count = hp.get("count", 0)
        paid_count = hp.get("paid_count", 0)
        unpaid_count = hp.get("unpaid_count", 0)
        
        # Verify count = paid + unpaid
        assert count == paid_count + unpaid_count, f"Count mismatch: {count} != {paid_count} + {unpaid_count}"
        
        # Verify details length matches count
        details = hp.get("details", [])
        assert len(details) == count, f"Details length {len(details)} != count {count}"
        
        print(f"✓ Hemali counts are consistent: {count} total ({paid_count} paid + {unpaid_count} unpaid)")


class TestDailyReportPDFWithHemali:
    """Test Daily Report PDF includes Hemali section"""
    
    def test_daily_report_pdf_returns_200(self, api_client):
        """GET /api/reports/daily/pdf?date=2026-03-15 - should return valid PDF"""
        res = api_client.get(f"{BASE_URL}/api/reports/daily/pdf?date=2026-03-15")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        
        # Verify PDF content type
        content_type = res.headers.get("Content-Type", "")
        assert "pdf" in content_type.lower(), f"Expected PDF, got {content_type}"
        
        # Verify PDF size
        assert len(res.content) > 1000, f"PDF too small: {len(res.content)} bytes"
        
        # Verify PDF header
        assert res.content[:4] == b'%PDF', "Not a valid PDF"
        
        print(f"✓ Daily report PDF generated successfully ({len(res.content)} bytes)")
    
    def test_daily_report_pdf_detail_mode(self, api_client):
        """GET /api/reports/daily/pdf?date=2026-03-15&mode=detail - detail mode PDF"""
        res = api_client.get(f"{BASE_URL}/api/reports/daily/pdf?date=2026-03-15&mode=detail")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        
        # Verify PDF 
        assert len(res.content) > 1000, f"PDF too small: {len(res.content)} bytes"
        assert res.content[:4] == b'%PDF', "Not a valid PDF"
        
        print(f"✓ Daily report PDF (detail mode) generated ({len(res.content)} bytes)")


class TestDailyReportExcelWithHemali:
    """Test Daily Report Excel includes Hemali section"""
    
    def test_daily_report_excel_returns_200(self, api_client):
        """GET /api/reports/daily/excel?date=2026-03-15 - should return valid Excel"""
        res = api_client.get(f"{BASE_URL}/api/reports/daily/excel?date=2026-03-15")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        
        # Verify Excel content type
        content_type = res.headers.get("Content-Type", "")
        assert "spreadsheet" in content_type or "xlsx" in content_type or "excel" in content_type.lower(), \
            f"Expected Excel content type, got {content_type}"
        
        # Verify file size
        assert len(res.content) > 500, f"Excel too small: {len(res.content)} bytes"
        
        # Verify Excel signature (PK for ZIP format)
        assert res.content[:2] == b'PK', "Not a valid Excel file (XLSX is a ZIP archive)"
        
        print(f"✓ Daily report Excel generated successfully ({len(res.content)} bytes)")


class TestMonthlySummaryWithMonthFilter:
    """Test Monthly Summary API with month filter"""
    
    def test_monthly_summary_unfiltered(self, api_client):
        """GET /api/hemali/monthly-summary - returns all months"""
        res = api_client.get(f"{BASE_URL}/api/hemali/monthly-summary")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list), "Expected list response"
        
        print(f"✓ Monthly summary (unfiltered) returned {len(data)} sardars")
        for sardar in data:
            months = sardar.get("months", [])
            print(f"  {sardar.get('sardar_name')}: {len(months)} months")
    
    def test_monthly_summary_with_month_filter(self, api_client):
        """GET /api/hemali/monthly-summary?month=2026-03 - filters by month"""
        res = api_client.get(f"{BASE_URL}/api/hemali/monthly-summary?month=2026-03")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list), "Expected list response"
        
        # Verify all returned data is only for 2026-03
        for sardar in data:
            for month_data in sardar.get("months", []):
                month = month_data.get("month", "")
                assert month.startswith("2026-03"), f"Month filter not working: got {month}"
        
        print(f"✓ Monthly summary with month=2026-03 filter returned {len(data)} sardars")
    
    def test_monthly_summary_month_filter_empty_result(self, api_client):
        """GET /api/hemali/monthly-summary?month=2099-12 - returns empty for future month"""
        res = api_client.get(f"{BASE_URL}/api/hemali/monthly-summary?month=2099-12")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list), "Expected list response"
        
        # Should be empty or have empty months
        total_months = sum(len(s.get("months", [])) for s in data)
        assert total_months == 0, f"Expected no data for future month, got {total_months} months"
        
        print(f"✓ Monthly summary with future month filter returns empty result")


class TestMonthlySummaryPDFWithMonthFilter:
    """Test Monthly Summary PDF with month filter"""
    
    def test_monthly_summary_pdf_unfiltered(self, api_client):
        """GET /api/hemali/monthly-summary/pdf - returns PDF"""
        res = api_client.get(f"{BASE_URL}/api/hemali/monthly-summary/pdf")
        assert res.status_code == 200
        
        # Verify PDF
        assert res.content[:4] == b'%PDF', "Not a valid PDF"
        assert len(res.content) > 500, f"PDF too small: {len(res.content)} bytes"
        
        print(f"✓ Monthly summary PDF (unfiltered) generated ({len(res.content)} bytes)")
    
    def test_monthly_summary_pdf_with_month_filter(self, api_client):
        """GET /api/hemali/monthly-summary/pdf?month=2026-03 - PDF with filter"""
        res = api_client.get(f"{BASE_URL}/api/hemali/monthly-summary/pdf?month=2026-03")
        assert res.status_code == 200
        
        # Verify PDF
        assert res.content[:4] == b'%PDF', "Not a valid PDF"
        assert len(res.content) > 500, f"PDF too small: {len(res.content)} bytes"
        
        print(f"✓ Monthly summary PDF with month=2026-03 filter ({len(res.content)} bytes)")


class TestMonthlySummaryExcelWithMonthFilter:
    """Test Monthly Summary Excel with month filter"""
    
    def test_monthly_summary_excel_unfiltered(self, api_client):
        """GET /api/hemali/monthly-summary/excel - returns Excel"""
        res = api_client.get(f"{BASE_URL}/api/hemali/monthly-summary/excel")
        assert res.status_code == 200
        
        # Verify Excel
        assert res.content[:2] == b'PK', "Not a valid Excel file"
        assert len(res.content) > 500, f"Excel too small: {len(res.content)} bytes"
        
        print(f"✓ Monthly summary Excel (unfiltered) generated ({len(res.content)} bytes)")
    
    def test_monthly_summary_excel_with_month_filter(self, api_client):
        """GET /api/hemali/monthly-summary/excel?month=2026-03 - Excel with filter"""
        res = api_client.get(f"{BASE_URL}/api/hemali/monthly-summary/excel?month=2026-03")
        assert res.status_code == 200
        
        # Verify Excel
        assert res.content[:2] == b'PK', "Not a valid Excel file"
        assert len(res.content) > 500, f"Excel too small: {len(res.content)} bytes"
        
        print(f"✓ Monthly summary Excel with month=2026-03 filter ({len(res.content)} bytes)")


class TestDailyReportHemaliDetails:
    """Test detailed Hemali section data in Daily Report"""
    
    def test_hemali_detail_fields(self, api_client):
        """Verify hemali_payments.details has all required fields"""
        res = api_client.get(f"{BASE_URL}/api/reports/daily?date=2026-03-15")
        assert res.status_code == 200
        data = res.json()
        
        hp = data.get("hemali_payments", {})
        details = hp.get("details", [])
        
        if not details:
            pytest.skip("No hemali payment details for 2026-03-15")
        
        # Check required fields in detail
        required_fields = ["sardar", "items", "total", "advance_deducted", "amount_paid", "new_advance", "status"]
        for detail in details:
            for field in required_fields:
                assert field in detail, f"Missing field '{field}' in hemali detail"
        
        print(f"✓ Hemali details contain all required fields: {required_fields}")
        
        # Print sample detail
        sample = details[0]
        print(f"  Sample: Sardar={sample.get('sardar')}, Status={sample.get('status')}, Total={sample.get('total')}")
    
    def test_hemali_total_work_and_paid(self, api_client):
        """Verify total_work and total_paid calculations"""
        res = api_client.get(f"{BASE_URL}/api/reports/daily?date=2026-03-15")
        assert res.status_code == 200
        data = res.json()
        
        hp = data.get("hemali_payments", {})
        total_work = hp.get("total_work", 0)
        total_paid = hp.get("total_paid", 0)
        
        # These should be present
        assert "total_work" in hp, "total_work field missing"
        assert "total_paid" in hp, "total_paid field missing"
        
        # Calculate expected values from details
        details = hp.get("details", [])
        expected_work = sum(d.get("total", 0) for d in details if d.get("status") == "paid")
        expected_paid = sum(d.get("amount_paid", 0) for d in details if d.get("status") == "paid")
        
        # Allow for floating point comparison
        assert abs(total_work - expected_work) < 0.01, f"total_work mismatch: {total_work} != {expected_work}"
        assert abs(total_paid - expected_paid) < 0.01, f"total_paid mismatch: {total_paid} != {expected_paid}"
        
        print(f"✓ Hemali totals verified: work={total_work}, paid={total_paid}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
