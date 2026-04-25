"""
Test Hemali PDF/Excel Export Endpoints
- Monthly Summary PDF (banner centering fix)
- Payment Report PDF
- Monthly Summary Excel
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHemaliExports:
    """Test Hemali export endpoints - PDF and Excel generation"""
    
    def test_01_hemali_monthly_summary_pdf_generates(self):
        """Test /api/hemali/monthly-summary/pdf returns 200 and valid PDF"""
        response = requests.get(f"{BASE_URL}/api/hemali/monthly-summary/pdf")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get('content-type') == 'application/pdf', f"Expected PDF content-type, got {response.headers.get('content-type')}"
        
        # Verify PDF magic bytes (%PDF-)
        content = response.content
        assert content[:5] == b'%PDF-', f"Response is not a valid PDF (missing %PDF- header)"
        assert len(content) > 1000, f"PDF seems too small ({len(content)} bytes)"
        
        print(f"PASS: Monthly Summary PDF generated successfully ({len(content)} bytes)")
    
    def test_02_hemali_monthly_summary_pdf_with_filters(self):
        """Test PDF generation with kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/hemali/monthly-summary/pdf?kms_year=2025-2026")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.content[:5] == b'%PDF-', "Response is not a valid PDF"
        
        print(f"PASS: Monthly Summary PDF with filter generated ({len(response.content)} bytes)")
    
    def test_03_hemali_payment_report_pdf_generates(self):
        """Test /api/hemali/export/pdf returns 200 and valid PDF"""
        response = requests.get(f"{BASE_URL}/api/hemali/export/pdf")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get('content-type') == 'application/pdf', f"Expected PDF content-type, got {response.headers.get('content-type')}"
        
        # Verify PDF magic bytes
        content = response.content
        assert content[:5] == b'%PDF-', "Response is not a valid PDF"
        assert len(content) > 1000, f"PDF seems too small ({len(content)} bytes)"
        
        print(f"PASS: Payment Report PDF generated successfully ({len(content)} bytes)")
    
    def test_04_hemali_payment_report_pdf_with_filters(self):
        """Test Payment Report PDF with date filters"""
        response = requests.get(f"{BASE_URL}/api/hemali/export/pdf?kms_year=2025-2026")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.content[:5] == b'%PDF-', "Response is not a valid PDF"
        
        print(f"PASS: Payment Report PDF with filter generated ({len(response.content)} bytes)")
    
    def test_05_hemali_monthly_summary_excel_generates(self):
        """Test /api/hemali/monthly-summary/excel returns 200 and valid xlsx"""
        response = requests.get(f"{BASE_URL}/api/hemali/monthly-summary/excel")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        content_type = response.headers.get('content-type', '')
        assert 'spreadsheetml' in content_type or 'excel' in content_type.lower(), f"Expected Excel content-type, got {content_type}"
        
        # Verify xlsx magic bytes (PK zip header)
        content = response.content
        assert content[:2] == b'PK', "Response is not a valid xlsx (missing PK header)"
        assert len(content) > 500, f"Excel file seems too small ({len(content)} bytes)"
        
        print(f"PASS: Monthly Summary Excel generated successfully ({len(content)} bytes)")
    
    def test_06_hemali_monthly_summary_excel_with_filters(self):
        """Test Excel generation with filters"""
        response = requests.get(f"{BASE_URL}/api/hemali/monthly-summary/excel?kms_year=2025-2026")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.content[:2] == b'PK', "Response is not a valid xlsx"
        
        print(f"PASS: Monthly Summary Excel with filter generated ({len(response.content)} bytes)")
    
    def test_07_hemali_payments_api_returns_data(self):
        """Verify hemali payments data exists for PDF generation"""
        response = requests.get(f"{BASE_URL}/api/hemali/payments")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of payments"
        assert len(data) > 0, "No hemali payments found - PDFs may be empty"
        
        print(f"PASS: Found {len(data)} hemali payments in database")
    
    def test_08_hemali_monthly_summary_api_returns_data(self):
        """Verify monthly summary data exists"""
        response = requests.get(f"{BASE_URL}/api/hemali/monthly-summary")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of sardar summaries"
        
        print(f"PASS: Monthly summary returns {len(data)} sardar(s)")


class TestBackupEndpoints:
    """Test backup-related endpoints for Data tab"""
    
    def test_01_backups_list_endpoint(self):
        """Test /api/backups returns backup list with total_size_bytes"""
        response = requests.get(f"{BASE_URL}/api/backups")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert 'backups' in data, "Response should have 'backups' key"
        assert isinstance(data['backups'], list), "backups should be a list"
        
        # Check if total_size_bytes is present (new feature)
        # Note: This may not be present in Python web backend
        print(f"PASS: Backups endpoint returns {len(data['backups'])} backups")
        if 'total_size_bytes' in data:
            print(f"  - total_size_bytes: {data['total_size_bytes']}")
        if 'has_today_backup' in data:
            print(f"  - has_today_backup: {data['has_today_backup']}")
    
    def test_02_auto_delete_settings_endpoint(self):
        """Test /api/backups/auto-delete GET endpoint"""
        response = requests.get(f"{BASE_URL}/api/backups/auto-delete")
        
        # This endpoint may return 404/405 if not implemented in Python backend
        if response.status_code in [404, 405]:
            print(f"INFO: /api/backups/auto-delete returns {response.status_code} (expected for web version)")
            return
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        print(f"PASS: Auto-delete settings: enabled={data.get('enabled')}, days={data.get('days')}")
    
    def test_03_schedule_endpoint_expected_to_fail_on_web(self):
        """Test /api/backups/schedule - expected to fail on Python web backend"""
        response = requests.get(f"{BASE_URL}/api/backups/schedule")
        
        # This endpoint only exists in desktop-app/local-server (Node.js)
        # Python web backend should return 404 or 405
        if response.status_code in [404, 405]:
            print(f"INFO: /api/backups/schedule returns {response.status_code} (expected for web version)")
        elif response.status_code == 200:
            print(f"INFO: /api/backups/schedule unexpectedly works - data: {response.json()}")
        else:
            print(f"INFO: /api/backups/schedule returns {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
