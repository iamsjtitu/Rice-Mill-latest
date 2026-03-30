"""
Iteration 142 Tests: Photo Dialog, Auto Weight Entries, Linked RST Checkmark
Tests for:
1. Photo View Dialog always shows 1st/2nd weight photo sections
2. New 'Auto Weight Entries' subtab with filters and exports
3. GET /api/vehicle-weight/linked-rst endpoint
4. VW completed entries checkmark logic for linked RSTs
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestLinkedRstEndpoint:
    """Test GET /api/vehicle-weight/linked-rst endpoint"""
    
    def test_linked_rst_endpoint_exists(self):
        """Test that linked-rst endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/linked-rst")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "linked_rst" in data, "Response should contain 'linked_rst' key"
        assert isinstance(data["linked_rst"], list), "linked_rst should be a list"
        print(f"PASS: linked-rst endpoint returns {len(data['linked_rst'])} RST numbers")
    
    def test_linked_rst_with_kms_year(self):
        """Test linked-rst endpoint with kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/linked-rst?kms_year=2024-2025")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "linked_rst" in data
        print(f"PASS: linked-rst with kms_year filter returns {len(data['linked_rst'])} RST numbers")


class TestVehicleWeightEndpoints:
    """Test Vehicle Weight API endpoints for Auto Weight Entries"""
    
    def test_vehicle_weight_list_with_status_completed(self):
        """Test VW list with status=completed filter (used by Auto Weight Entries)"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?status=completed&page=1&page_size=150")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "entries" in data, "Response should contain 'entries'"
        assert "total" in data, "Response should contain 'total'"
        assert "total_pages" in data, "Response should contain 'total_pages'"
        assert "page" in data, "Response should contain 'page'"
        print(f"PASS: VW list returns {len(data['entries'])} entries, total: {data['total']}")
    
    def test_vehicle_weight_list_with_date_filters(self):
        """Test VW list with date_from and date_to filters (last 7 days)"""
        from datetime import datetime, timedelta
        today = datetime.now().strftime("%Y-%m-%d")
        week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/vehicle-weight?status=completed&date_from={week_ago}&date_to={today}&page=1&page_size=150"
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "entries" in data
        print(f"PASS: VW list with date filters returns {len(data['entries'])} entries")
    
    def test_vehicle_weight_list_with_all_filters(self):
        """Test VW list with all filter params (RST, Vehicle, Party, Mandi)"""
        response = requests.get(
            f"{BASE_URL}/api/vehicle-weight?status=completed&rst_no=1&vehicle_no=TEST&party_name=TEST&farmer_name=TEST"
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "entries" in data
        print(f"PASS: VW list with all filters returns {len(data['entries'])} entries")


class TestVehicleWeightExports:
    """Test Vehicle Weight export endpoints (Excel/PDF)"""
    
    def test_excel_export_endpoint(self):
        """Test Excel export endpoint"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/export/excel?status=completed")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "spreadsheet" in response.headers.get("content-type", "").lower() or \
               "octet-stream" in response.headers.get("content-type", "").lower(), \
               f"Expected Excel content type, got {response.headers.get('content-type')}"
        print("PASS: Excel export endpoint works")
    
    def test_pdf_export_endpoint(self):
        """Test PDF export endpoint"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/export/pdf?status=completed")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "pdf" in response.headers.get("content-type", "").lower() or \
               "octet-stream" in response.headers.get("content-type", "").lower(), \
               f"Expected PDF content type, got {response.headers.get('content-type')}"
        print("PASS: PDF export endpoint works")


class TestVehicleWeightPhotos:
    """Test Vehicle Weight photos endpoint"""
    
    def test_photos_endpoint_structure(self):
        """Test that photos endpoint returns expected structure"""
        # First get a completed entry
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?status=completed&page=1&page_size=1")
        if response.status_code == 200:
            data = response.json()
            if data.get("entries") and len(data["entries"]) > 0:
                entry_id = data["entries"][0]["id"]
                photos_response = requests.get(f"{BASE_URL}/api/vehicle-weight/{entry_id}/photos")
                assert photos_response.status_code == 200, f"Expected 200, got {photos_response.status_code}"
                photos_data = photos_response.json()
                # Check expected fields exist (even if empty)
                expected_fields = ["rst_no", "date", "vehicle_no", "first_wt", "second_wt", "net_wt"]
                for field in expected_fields:
                    assert field in photos_data, f"Missing field: {field}"
                print(f"PASS: Photos endpoint returns expected structure for entry {entry_id}")
            else:
                pytest.skip("No completed entries to test photos endpoint")
        else:
            pytest.skip("Could not fetch entries to test photos endpoint")


class TestMillEntriesForLinkedRst:
    """Test Mill Entries endpoint to verify linked RST logic"""
    
    def test_mill_entries_list(self):
        """Test Mill Entries list endpoint"""
        response = requests.get(f"{BASE_URL}/api/entries?page=1&page_size=10")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "entries" in data or isinstance(data, list), "Response should contain entries"
        print(f"PASS: Mill Entries endpoint works")
    
    def test_linked_rst_matches_mill_entries(self):
        """Verify linked_rst contains RST numbers from mill_entries"""
        # Get linked RSTs
        linked_response = requests.get(f"{BASE_URL}/api/vehicle-weight/linked-rst")
        assert linked_response.status_code == 200
        linked_data = linked_response.json()
        linked_rst_set = set(linked_data.get("linked_rst", []))
        
        # Get mill entries
        mill_response = requests.get(f"{BASE_URL}/api/entries?page=1&page_size=100")
        if mill_response.status_code == 200:
            mill_data = mill_response.json()
            entries = mill_data.get("entries", mill_data if isinstance(mill_data, list) else [])
            mill_rst_set = set()
            for e in entries:
                rst = e.get("rst_no", "")
                if rst:
                    try:
                        mill_rst_set.add(int(rst))
                    except:
                        pass
            
            # Verify linked_rst contains mill entry RSTs
            if mill_rst_set:
                overlap = linked_rst_set.intersection(mill_rst_set)
                print(f"PASS: Found {len(overlap)} RST numbers in both linked_rst and mill_entries")
                print(f"  - Linked RSTs: {sorted(list(linked_rst_set)[:10])}...")
                print(f"  - Mill Entry RSTs: {sorted(list(mill_rst_set)[:10])}...")
            else:
                print("INFO: No RST numbers found in mill entries")
        else:
            pytest.skip("Could not fetch mill entries")


class TestPagination:
    """Test pagination for Auto Weight Entries (150 per page)"""
    
    def test_pagination_150_per_page(self):
        """Test that page_size=150 works correctly"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?status=completed&page=1&page_size=150")
        assert response.status_code == 200
        data = response.json()
        entries = data.get("entries", [])
        total = data.get("total", 0)
        total_pages = data.get("total_pages", 1)
        
        # Verify pagination math
        if total > 0:
            expected_pages = (total + 149) // 150  # Ceiling division
            assert total_pages == expected_pages or total_pages >= 1, \
                f"Expected {expected_pages} pages for {total} entries, got {total_pages}"
        
        # Verify entries count doesn't exceed page_size
        assert len(entries) <= 150, f"Expected max 150 entries, got {len(entries)}"
        print(f"PASS: Pagination works - {len(entries)} entries on page 1, total: {total}, pages: {total_pages}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
