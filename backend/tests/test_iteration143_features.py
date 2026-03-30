"""
Iteration 143 Tests: Photo Zoom, AWE Action Buttons, Linked RST Edit/Delete Hide
Tests for:
1. Auto Weight Entries has full action buttons (View, Edit, Print, Download, Delete)
2. Photo View Dialog with print slip layout
3. Linked RST behavior - Edit and Delete hidden, green checkmark shown
4. GET /api/vehicle-weight/linked-rst returns list of linked RST numbers
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestLinkedRstEndpoint:
    """Test GET /api/vehicle-weight/linked-rst endpoint"""
    
    def test_linked_rst_returns_200(self):
        """Test that linked-rst endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/linked-rst")
        assert response.status_code == 200
        print(f"linked-rst endpoint returned 200")
    
    def test_linked_rst_returns_array(self):
        """Test that linked-rst returns linked_rst array"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/linked-rst")
        assert response.status_code == 200
        data = response.json()
        assert "linked_rst" in data
        assert isinstance(data["linked_rst"], list)
        print(f"linked_rst array: {data['linked_rst']}")
    
    def test_linked_rst_contains_mill_entry_rst(self):
        """Test that linked_rst contains RST numbers from Mill Entries"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/linked-rst")
        assert response.status_code == 200
        data = response.json()
        # RST 1 and 100 should be linked (from Mill Entries)
        linked = data["linked_rst"]
        assert 1 in linked or 100 in linked, f"Expected RST 1 or 100 in linked_rst, got {linked}"
        print(f"Linked RST numbers: {linked}")


class TestVehicleWeightPhotosEndpoint:
    """Test GET /api/vehicle-weight/{entry_id}/photos endpoint"""
    
    def test_photos_endpoint_returns_entry_data(self):
        """Test that photos endpoint returns entry data with photo fields"""
        # First get a vehicle weight entry
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?status=completed&page_size=1")
        assert response.status_code == 200
        entries = response.json().get("entries", [])
        
        if len(entries) == 0:
            pytest.skip("No completed vehicle weight entries to test")
        
        entry_id = entries[0]["id"]
        
        # Get photos for this entry
        photos_response = requests.get(f"{BASE_URL}/api/vehicle-weight/{entry_id}/photos")
        assert photos_response.status_code == 200
        
        data = photos_response.json()
        # Check required fields are present
        assert "entry_id" in data
        assert "rst_no" in data
        assert "vehicle_no" in data
        assert "first_wt" in data
        assert "second_wt" in data
        assert "net_wt" in data
        
        # Check photo fields are present (may be empty strings)
        assert "first_wt_front_img" in data
        assert "first_wt_side_img" in data
        assert "second_wt_front_img" in data
        assert "second_wt_side_img" in data
        
        print(f"Photos endpoint returned data for entry {entry_id}")


class TestVehicleWeightCRUD:
    """Test Vehicle Weight CRUD operations"""
    
    def test_list_completed_entries(self):
        """Test listing completed vehicle weight entries"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?status=completed")
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        assert "total" in data
        assert "page" in data
        print(f"Found {data['total']} completed entries")
    
    def test_list_pending_entries(self):
        """Test listing pending vehicle weight entries"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/pending")
        assert response.status_code == 200
        data = response.json()
        assert "pending" in data
        print(f"Found {len(data['pending'])} pending entries")
    
    def test_next_rst_endpoint(self):
        """Test next RST number endpoint"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/next-rst")
        assert response.status_code == 200
        data = response.json()
        # API returns either "next_rst" or "rst_no"
        rst_key = "next_rst" if "next_rst" in data else "rst_no"
        assert rst_key in data
        assert isinstance(data[rst_key], int)
        print(f"Next RST: {data[rst_key]}")


class TestMillEntriesLinkedRst:
    """Test Mill Entries and linked RST relationship"""
    
    def test_mill_entries_list(self):
        """Test listing mill entries"""
        response = requests.get(f"{BASE_URL}/api/entries?page_size=10")
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        print(f"Found {len(data['entries'])} mill entries")
    
    def test_linked_rst_matches_mill_entries(self):
        """Test that linked_rst matches RST numbers in Mill Entries"""
        # Get mill entries
        mill_response = requests.get(f"{BASE_URL}/api/entries?page_size=100")
        assert mill_response.status_code == 200
        mill_entries = mill_response.json().get("entries", [])
        
        # Get linked RST
        linked_response = requests.get(f"{BASE_URL}/api/vehicle-weight/linked-rst")
        assert linked_response.status_code == 200
        linked_rst = set(linked_response.json().get("linked_rst", []))
        
        # Extract RST numbers from mill entries
        mill_rst = set()
        for entry in mill_entries:
            rst = entry.get("rst_no", "")
            if rst and rst.strip():
                try:
                    mill_rst.add(int(rst))
                except:
                    pass
        
        # Linked RST should be subset of mill RST
        assert linked_rst == mill_rst, f"Linked RST {linked_rst} should match Mill RST {mill_rst}"
        print(f"Linked RST matches Mill Entries RST: {linked_rst}")


class TestVehicleWeightExport:
    """Test Vehicle Weight export endpoints"""
    
    def test_excel_export_endpoint(self):
        """Test Excel export endpoint returns file"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/export/excel?status=completed")
        assert response.status_code == 200
        assert "application" in response.headers.get("content-type", "")
        print("Excel export endpoint working")
    
    def test_pdf_export_endpoint(self):
        """Test PDF export endpoint returns file"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/export/pdf?status=completed")
        assert response.status_code == 200
        assert "application/pdf" in response.headers.get("content-type", "")
        print("PDF export endpoint working")


class TestVehicleWeightSlipPdf:
    """Test Vehicle Weight slip PDF endpoint"""
    
    def test_slip_pdf_endpoint(self):
        """Test slip PDF endpoint for a completed entry"""
        # Get a completed entry
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?status=completed&page_size=1")
        assert response.status_code == 200
        entries = response.json().get("entries", [])
        
        if len(entries) == 0:
            pytest.skip("No completed vehicle weight entries to test")
        
        entry_id = entries[0]["id"]
        
        # Get slip PDF
        pdf_response = requests.get(f"{BASE_URL}/api/vehicle-weight/{entry_id}/slip-pdf")
        assert pdf_response.status_code == 200
        assert "application/pdf" in pdf_response.headers.get("content-type", "")
        print(f"Slip PDF generated for entry {entry_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
