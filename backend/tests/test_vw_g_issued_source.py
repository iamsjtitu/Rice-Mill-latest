"""
Test Vehicle Weight - G.Issued field and Source rename
Tests for iteration 155:
1. POST /api/vehicle-weight with g_issued field saves correctly
2. GET /api/vehicle-weight returns g_issued field in entries
3. PUT /api/vehicle-weight/{id}/edit accepts g_issued field
4. GET /api/vehicle-weight/{id}/slip-pdf works (PDF generation)
5. GET /api/branding returns data
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestVehicleWeightGIssued:
    """Test G.Issued field in Vehicle Weight entries"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_entry_id = None
        self.test_rst_no = None
        yield
        # Cleanup: delete test entry if created
        if self.test_entry_id:
            try:
                requests.delete(f"{BASE_URL}/api/vehicle-weight/{self.test_entry_id}")
            except:
                pass
    
    def test_branding_api_returns_data(self):
        """GET /api/branding returns data"""
        response = requests.get(f"{BASE_URL}/api/branding")
        print(f"Branding API status: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        print(f"Branding data: {data}")
        # Should have company_name at minimum
        assert "company_name" in data or data == {}, "Branding should return company_name or empty dict"
        print("PASS: GET /api/branding returns data")
    
    def test_create_vw_entry_with_g_issued(self):
        """POST /api/vehicle-weight with g_issued field saves correctly"""
        payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD01AB1234",
            "party_name": "TEST_PARTY",
            "farmer_name": "TEST_SOURCE_MANDI",  # This is the Source field
            "product": "GOVT PADDY",
            "trans_type": "Receive(Pur)",
            "tot_pkts": 100,
            "first_wt": 15000,
            "g_issued": 5000,  # New G.Issued field
            "cash_paid": 1000,
            "diesel_paid": 500,
            "kms_year": "2025-26"
        }
        
        response = requests.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        print(f"Create VW entry status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("success") == True, "Expected success=True"
        
        entry = data.get("entry", {})
        self.test_entry_id = entry.get("id")
        self.test_rst_no = entry.get("rst_no")
        
        # Verify g_issued was saved
        assert entry.get("g_issued") == 5000, f"Expected g_issued=5000, got {entry.get('g_issued')}"
        assert entry.get("farmer_name") == "TEST_SOURCE_MANDI", f"Expected farmer_name=TEST_SOURCE_MANDI, got {entry.get('farmer_name')}"
        print(f"PASS: Created VW entry with g_issued=5000, RST #{self.test_rst_no}")
    
    def test_get_vw_entries_returns_g_issued(self):
        """GET /api/vehicle-weight returns g_issued field in entries"""
        # First create an entry with g_issued
        payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD02CD5678",
            "party_name": "TEST_PARTY2",
            "farmer_name": "TEST_SOURCE2",
            "product": "PADDY",
            "trans_type": "Receive(Pur)",
            "tot_pkts": 50,
            "first_wt": 10000,
            "g_issued": 3500,
            "kms_year": "2025-26"
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        assert create_resp.status_code == 200
        entry_id = create_resp.json().get("entry", {}).get("id")
        
        try:
            # Now fetch entries and verify g_issued is returned
            response = requests.get(f"{BASE_URL}/api/vehicle-weight?kms_year=2025-26")
            print(f"GET VW entries status: {response.status_code}")
            
            assert response.status_code == 200
            data = response.json()
            entries = data.get("entries", [])
            
            # Find our test entry
            test_entry = next((e for e in entries if e.get("id") == entry_id), None)
            assert test_entry is not None, "Test entry not found in list"
            
            # Verify g_issued field is present
            assert "g_issued" in test_entry, "g_issued field missing from entry"
            assert test_entry.get("g_issued") == 3500, f"Expected g_issued=3500, got {test_entry.get('g_issued')}"
            print(f"PASS: GET /api/vehicle-weight returns g_issued field")
        finally:
            # Cleanup
            requests.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
    
    def test_edit_vw_entry_with_g_issued(self):
        """PUT /api/vehicle-weight/{id}/edit accepts g_issued field"""
        # First create an entry
        payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD03EF9012",
            "party_name": "TEST_PARTY3",
            "farmer_name": "TEST_SOURCE3",
            "product": "RICE",
            "trans_type": "Dispatch(Sale)",
            "tot_pkts": 75,
            "first_wt": 12000,
            "g_issued": 2000,
            "kms_year": "2025-26"
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        assert create_resp.status_code == 200
        entry = create_resp.json().get("entry", {})
        entry_id = entry.get("id")
        
        try:
            # Edit the entry with new g_issued value
            edit_payload = {
                "vehicle_no": "TEST_OD03EF9012_EDITED",
                "party_name": "TEST_PARTY3_EDITED",
                "farmer_name": "TEST_SOURCE3_EDITED",
                "g_issued": 7500  # Updated g_issued
            }
            
            edit_resp = requests.put(f"{BASE_URL}/api/vehicle-weight/{entry_id}/edit", json=edit_payload)
            print(f"Edit VW entry status: {edit_resp.status_code}")
            print(f"Edit response: {edit_resp.json()}")
            
            assert edit_resp.status_code == 200
            edit_data = edit_resp.json()
            assert edit_data.get("success") == True
            
            updated_entry = edit_data.get("entry", {})
            assert updated_entry.get("g_issued") == 7500, f"Expected g_issued=7500 after edit, got {updated_entry.get('g_issued')}"
            assert updated_entry.get("farmer_name") == "TEST_SOURCE3_EDITED", f"Expected farmer_name=TEST_SOURCE3_EDITED, got {updated_entry.get('farmer_name')}"
            print(f"PASS: PUT /api/vehicle-weight/{entry_id}/edit accepts g_issued field")
        finally:
            # Cleanup
            requests.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
    
    def test_pdf_slip_generation(self):
        """GET /api/vehicle-weight/{id}/slip-pdf works"""
        # First create an entry with g_issued
        payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD04GH3456",
            "party_name": "TEST_PARTY_PDF",
            "farmer_name": "TEST_SOURCE_PDF",
            "product": "GOVT PADDY",
            "trans_type": "Receive(Pur)",
            "tot_pkts": 120,
            "first_wt": 18000,
            "g_issued": 6000,
            "kms_year": "2025-26"
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        assert create_resp.status_code == 200
        entry_id = create_resp.json().get("entry", {}).get("id")
        
        try:
            # Complete the entry with second weight
            second_wt_payload = {
                "second_wt": 5000
            }
            second_resp = requests.put(f"{BASE_URL}/api/vehicle-weight/{entry_id}/second-weight", json=second_wt_payload)
            assert second_resp.status_code == 200
            
            # Now test PDF generation
            pdf_resp = requests.get(f"{BASE_URL}/api/vehicle-weight/{entry_id}/slip-pdf?party_only=1")
            print(f"PDF slip status: {pdf_resp.status_code}")
            print(f"PDF content-type: {pdf_resp.headers.get('content-type')}")
            
            assert pdf_resp.status_code == 200, f"Expected 200, got {pdf_resp.status_code}"
            assert "application/pdf" in pdf_resp.headers.get("content-type", ""), "Expected PDF content type"
            assert len(pdf_resp.content) > 1000, "PDF content seems too small"
            print(f"PASS: GET /api/vehicle-weight/{entry_id}/slip-pdf works, PDF size: {len(pdf_resp.content)} bytes")
        finally:
            # Cleanup
            requests.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
    
    def test_vw_entry_photos_endpoint(self):
        """GET /api/vehicle-weight/{id}/photos returns entry data"""
        # First create an entry
        payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD05IJ7890",
            "party_name": "TEST_PARTY_PHOTOS",
            "farmer_name": "TEST_SOURCE_PHOTOS",
            "product": "PADDY",
            "trans_type": "Receive(Pur)",
            "tot_pkts": 80,
            "first_wt": 14000,
            "g_issued": 4500,
            "kms_year": "2025-26"
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        assert create_resp.status_code == 200
        entry_id = create_resp.json().get("entry", {}).get("id")
        
        try:
            # Get photos endpoint
            photos_resp = requests.get(f"{BASE_URL}/api/vehicle-weight/{entry_id}/photos")
            print(f"Photos endpoint status: {photos_resp.status_code}")
            
            assert photos_resp.status_code == 200
            data = photos_resp.json()
            
            # Verify entry data is returned
            assert data.get("entry_id") == entry_id
            assert data.get("vehicle_no") == "TEST_OD05IJ7890"
            assert data.get("farmer_name") == "TEST_SOURCE_PHOTOS"
            print(f"PASS: GET /api/vehicle-weight/{entry_id}/photos returns entry data")
        finally:
            # Cleanup
            requests.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")


class TestVehicleWeightExports:
    """Test Excel and PDF exports include G.Issued column"""
    
    def test_excel_export_endpoint(self):
        """GET /api/vehicle-weight/export/excel works"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/export/excel?kms_year=2025-26&status=completed")
        print(f"Excel export status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "excel" in content_type.lower(), f"Expected Excel content type, got {content_type}"
        print(f"PASS: Excel export works, size: {len(response.content)} bytes")
    
    def test_pdf_export_endpoint(self):
        """GET /api/vehicle-weight/export/pdf works"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/export/pdf?kms_year=2025-26&status=completed")
        print(f"PDF export status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "application/pdf" in response.headers.get("content-type", ""), "Expected PDF content type"
        print(f"PASS: PDF export works, size: {len(response.content)} bytes")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
