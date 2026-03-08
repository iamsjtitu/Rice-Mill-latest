"""
Test Staff Export endpoints and Daily Report Staff Attendance Integration
Iteration 23 - Testing new PDF/Excel exports for Staff module and 
Staff Attendance in Daily Report
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestStaffAttendanceExport:
    """Test /api/staff/export/attendance endpoint"""
    
    def test_attendance_export_excel(self):
        """Test attendance export to Excel format"""
        response = requests.get(
            f"{BASE_URL}/api/staff/export/attendance",
            params={"date_from": "2026-03-01", "date_to": "2026-03-05", "fmt": "excel"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers.get("content-type", "")
        assert response.headers.get("content-disposition", "").startswith("attachment")
        assert len(response.content) > 0, "Excel file should not be empty"
        print(f"SUCCESS: Attendance Excel export returned {len(response.content)} bytes")

    def test_attendance_export_pdf(self):
        """Test attendance export to PDF format"""
        response = requests.get(
            f"{BASE_URL}/api/staff/export/attendance",
            params={"date_from": "2026-03-01", "date_to": "2026-03-05", "fmt": "pdf"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "application/pdf" in response.headers.get("content-type", "")
        assert response.headers.get("content-disposition", "").startswith("attachment")
        assert len(response.content) > 0, "PDF file should not be empty"
        print(f"SUCCESS: Attendance PDF export returned {len(response.content)} bytes")

    def test_attendance_export_default_format(self):
        """Test attendance export with default (excel) format"""
        response = requests.get(
            f"{BASE_URL}/api/staff/export/attendance",
            params={"date_from": "2026-03-01", "date_to": "2026-03-05"}
        )
        assert response.status_code == 200
        assert "spreadsheetml" in response.headers.get("content-type", "")
        print("SUCCESS: Default format is Excel")


class TestStaffPaymentsExport:
    """Test /api/staff/export/payments endpoint"""
    
    def test_payments_export_excel(self):
        """Test payments export to Excel format"""
        response = requests.get(
            f"{BASE_URL}/api/staff/export/payments",
            params={"fmt": "excel"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers.get("content-type", "")
        assert response.headers.get("content-disposition", "").startswith("attachment")
        assert len(response.content) > 0, "Excel file should not be empty"
        print(f"SUCCESS: Payments Excel export returned {len(response.content)} bytes")

    def test_payments_export_pdf(self):
        """Test payments export to PDF format"""
        response = requests.get(
            f"{BASE_URL}/api/staff/export/payments",
            params={"fmt": "pdf"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "application/pdf" in response.headers.get("content-type", "")
        assert response.headers.get("content-disposition", "").startswith("attachment")
        assert len(response.content) > 0, "PDF file should not be empty"
        print(f"SUCCESS: Payments PDF export returned {len(response.content)} bytes")

    def test_payments_export_default_format(self):
        """Test payments export with default (excel) format"""
        response = requests.get(f"{BASE_URL}/api/staff/export/payments")
        assert response.status_code == 200
        assert "spreadsheetml" in response.headers.get("content-type", "")
        print("SUCCESS: Default format is Excel")


class TestDailyReportStaffAttendance:
    """Test Daily Report includes Staff Attendance data"""
    
    def test_daily_report_json_has_staff_attendance(self):
        """Test daily report JSON includes staff_attendance object"""
        response = requests.get(
            f"{BASE_URL}/api/reports/daily",
            params={"date": "2026-03-01"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify staff_attendance object exists
        assert "staff_attendance" in data, "staff_attendance should be in daily report"
        
        sa = data["staff_attendance"]
        # Verify structure
        assert "total" in sa, "staff_attendance should have 'total'"
        assert "present" in sa, "staff_attendance should have 'present'"
        assert "absent" in sa, "staff_attendance should have 'absent'"
        assert "half_day" in sa, "staff_attendance should have 'half_day'"
        assert "holiday" in sa, "staff_attendance should have 'holiday'"
        assert "details" in sa, "staff_attendance should have 'details'"
        
        print(f"SUCCESS: Daily report has staff_attendance - Total: {sa['total']}, Present: {sa['present']}, Absent: {sa['absent']}, Half_day: {sa['half_day']}, Holiday: {sa['holiday']}")
        
        # Verify details structure (if any attendance exists)
        if sa["total"] > 0:
            assert len(sa["details"]) > 0, "Should have details when total > 0"
            first_detail = sa["details"][0]
            assert "name" in first_detail, "detail should have 'name'"
            assert "status" in first_detail, "detail should have 'status'"
            print(f"SUCCESS: Staff attendance details: {sa['details']}")

    def test_daily_report_detail_mode_has_staff_attendance(self):
        """Test daily report in detail mode also has staff_attendance"""
        response = requests.get(
            f"{BASE_URL}/api/reports/daily",
            params={"date": "2026-03-01", "mode": "detail"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "staff_attendance" in data
        print(f"SUCCESS: Detail mode daily report has staff_attendance")


class TestDailyReportPDFWithStaffAttendance:
    """Test Daily Report PDF includes Staff Attendance section"""
    
    def test_daily_pdf_normal_mode(self):
        """Test daily report PDF in normal mode"""
        response = requests.get(
            f"{BASE_URL}/api/reports/daily/pdf",
            params={"date": "2026-03-01", "mode": "normal"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "application/pdf" in response.headers.get("content-type", "")
        assert len(response.content) > 0
        print(f"SUCCESS: Daily PDF (normal) returned {len(response.content)} bytes")

    def test_daily_pdf_detail_mode(self):
        """Test daily report PDF in detail mode includes Staff Attendance (Section 10)"""
        response = requests.get(
            f"{BASE_URL}/api/reports/daily/pdf",
            params={"date": "2026-03-01", "mode": "detail"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "application/pdf" in response.headers.get("content-type", "")
        assert len(response.content) > 0
        print(f"SUCCESS: Daily PDF (detail) returned {len(response.content)} bytes")


class TestDailyReportExcelWithStaffAttendance:
    """Test Daily Report Excel includes Staff Attendance section"""
    
    def test_daily_excel_normal_mode(self):
        """Test daily report Excel in normal mode"""
        response = requests.get(
            f"{BASE_URL}/api/reports/daily/excel",
            params={"date": "2026-03-01", "mode": "normal"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "spreadsheetml" in response.headers.get("content-type", "")
        assert len(response.content) > 0
        print(f"SUCCESS: Daily Excel (normal) returned {len(response.content)} bytes")

    def test_daily_excel_detail_mode(self):
        """Test daily report Excel in detail mode includes Staff Attendance (Section 8)"""
        response = requests.get(
            f"{BASE_URL}/api/reports/daily/excel",
            params={"date": "2026-03-01", "mode": "detail"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "spreadsheetml" in response.headers.get("content-type", "")
        assert len(response.content) > 0
        print(f"SUCCESS: Daily Excel (detail) returned {len(response.content)} bytes")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
