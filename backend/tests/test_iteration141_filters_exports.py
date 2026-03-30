"""
Iteration 141: Test default today's date filters and export functionality
- Mill Entries defaults to today's date (date_from and date_to = today)
- Cash Book defaults to today's date (date_from and date_to = today)
- Vehicle Weight defaults to today's date in filters
- Vehicle Weight filter params: date_from, date_to, vehicle_no, party_name, farmer_name, rst_no
- Vehicle Weight Excel export endpoint
- Vehicle Weight PDF export endpoint
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TODAY = datetime.now().strftime("%Y-%m-%d")


class TestVehicleWeightFilters:
    """Test Vehicle Weight API filter parameters"""
    
    def test_vw_list_default(self):
        """Test GET /api/vehicle-weight returns paginated response"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight")
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert "total_pages" in data
        print(f"PASS: VW list default - {data['total']} total entries")
    
    def test_vw_filter_date_from_to(self):
        """Test date_from and date_to filter params"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight", params={
            "date_from": TODAY,
            "date_to": TODAY
        })
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        # All entries should be from today
        for entry in data["entries"]:
            assert entry.get("date") == TODAY or entry.get("date", "") >= TODAY
        print(f"PASS: VW date filter - {len(data['entries'])} entries for today")
    
    def test_vw_filter_vehicle_no(self):
        """Test vehicle_no filter param"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight", params={
            "vehicle_no": "OD"
        })
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        # All entries should contain "OD" in vehicle_no (case insensitive)
        for entry in data["entries"]:
            assert "od" in entry.get("vehicle_no", "").lower()
        print(f"PASS: VW vehicle_no filter - {len(data['entries'])} entries")
    
    def test_vw_filter_party_name(self):
        """Test party_name filter param"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight", params={
            "party_name": "test"
        })
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        print(f"PASS: VW party_name filter - {len(data['entries'])} entries")
    
    def test_vw_filter_farmer_name(self):
        """Test farmer_name (mandi) filter param"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight", params={
            "farmer_name": "mandi"
        })
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        print(f"PASS: VW farmer_name filter - {len(data['entries'])} entries")
    
    def test_vw_filter_rst_no(self):
        """Test rst_no filter param"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight", params={
            "rst_no": "1"
        })
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        # If entries exist, rst_no should be 1
        for entry in data["entries"]:
            assert entry.get("rst_no") == 1
        print(f"PASS: VW rst_no filter - {len(data['entries'])} entries")
    
    def test_vw_combined_filters(self):
        """Test multiple filters combined"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight", params={
            "date_from": "2024-01-01",
            "date_to": TODAY,
            "status": "completed"
        })
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        print(f"PASS: VW combined filters - {len(data['entries'])} entries")


class TestVehicleWeightExports:
    """Test Vehicle Weight export endpoints"""
    
    def test_vw_export_excel(self):
        """Test GET /api/vehicle-weight/export/excel returns Excel file"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/export/excel", params={
            "status": "completed"
        })
        assert response.status_code == 200
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "excel" in content_type or "octet-stream" in content_type
        assert len(response.content) > 0
        print(f"PASS: VW Excel export - {len(response.content)} bytes")
    
    def test_vw_export_excel_with_filters(self):
        """Test Excel export with date filters"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/export/excel", params={
            "status": "completed",
            "date_from": TODAY,
            "date_to": TODAY
        })
        assert response.status_code == 200
        assert len(response.content) > 0
        print(f"PASS: VW Excel export with filters - {len(response.content)} bytes")
    
    def test_vw_export_pdf(self):
        """Test GET /api/vehicle-weight/export/pdf returns PDF file"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/export/pdf", params={
            "status": "completed"
        })
        assert response.status_code == 200
        content_type = response.headers.get("content-type", "")
        assert "pdf" in content_type or "octet-stream" in content_type
        assert len(response.content) > 0
        print(f"PASS: VW PDF export - {len(response.content)} bytes")
    
    def test_vw_export_pdf_with_filters(self):
        """Test PDF export with date filters"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/export/pdf", params={
            "status": "completed",
            "date_from": TODAY,
            "date_to": TODAY
        })
        assert response.status_code == 200
        assert len(response.content) > 0
        print(f"PASS: VW PDF export with filters - {len(response.content)} bytes")


class TestCashBookFilters:
    """Test Cash Book API with date filters"""
    
    def test_cashbook_list_default(self):
        """Test GET /api/cash-book returns paginated response"""
        response = requests.get(f"{BASE_URL}/api/cash-book")
        assert response.status_code == 200
        data = response.json()
        assert "transactions" in data
        assert "total" in data
        assert "page" in data
        print(f"PASS: Cash Book list - {data['total']} total transactions")
    
    def test_cashbook_filter_date_from_to(self):
        """Test date_from and date_to filter params"""
        response = requests.get(f"{BASE_URL}/api/cash-book", params={
            "date_from": TODAY,
            "date_to": TODAY
        })
        assert response.status_code == 200
        data = response.json()
        assert "transactions" in data
        print(f"PASS: Cash Book date filter - {len(data['transactions'])} transactions for today")
    
    def test_cashbook_summary(self):
        """Test GET /api/cash-book/summary"""
        response = requests.get(f"{BASE_URL}/api/cash-book/summary")
        assert response.status_code == 200
        data = response.json()
        # Summary should have balance info
        print(f"PASS: Cash Book summary - {data}")


class TestMillEntriesFilters:
    """Test Mill Entries API with date filters"""
    
    def test_entries_list_default(self):
        """Test GET /api/entries returns paginated response"""
        response = requests.get(f"{BASE_URL}/api/entries")
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        assert "total" in data
        assert "page" in data
        print(f"PASS: Mill Entries list - {data['total']} total entries")
    
    def test_entries_filter_date_from_to(self):
        """Test date_from and date_to filter params"""
        response = requests.get(f"{BASE_URL}/api/entries", params={
            "date_from": TODAY,
            "date_to": TODAY
        })
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        print(f"PASS: Mill Entries date filter - {len(data['entries'])} entries for today")


class TestEmptyStateMessages:
    """Test that empty state messages work correctly when no data for today"""
    
    def test_vw_empty_today(self):
        """Test VW returns empty entries for today if no data"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight", params={
            "date_from": TODAY,
            "date_to": TODAY,
            "status": "completed"
        })
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        # entries can be empty or have data - both are valid
        print(f"PASS: VW today check - {len(data['entries'])} entries")
    
    def test_cashbook_empty_today(self):
        """Test Cash Book returns empty transactions for today if no data"""
        response = requests.get(f"{BASE_URL}/api/cash-book", params={
            "date_from": TODAY,
            "date_to": TODAY
        })
        assert response.status_code == 200
        data = response.json()
        assert "transactions" in data
        print(f"PASS: Cash Book today check - {len(data['transactions'])} transactions")
    
    def test_entries_empty_today(self):
        """Test Mill Entries returns empty entries for today if no data"""
        response = requests.get(f"{BASE_URL}/api/entries", params={
            "date_from": TODAY,
            "date_to": TODAY
        })
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        print(f"PASS: Mill Entries today check - {len(data['entries'])} entries")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
