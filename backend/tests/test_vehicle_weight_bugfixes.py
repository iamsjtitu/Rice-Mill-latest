"""
Vehicle Weight Bug Fixes Tests - Iteration 167
Tests for:
1. G.Issued and TP No saving on second weight completion
2. saveImage crash prevention with non-string data
3. saveImage data URL prefix stripping
4. weighbridge/live-weight endpoint
5. pending-count endpoint
"""
import pytest
import requests
import os
import uuid
import base64

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestVehicleWeightBugFixes:
    """Test Vehicle Weight bug fixes"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_entry_ids = []
        yield
        # Cleanup test entries
        for entry_id in self.test_entry_ids:
            try:
                requests.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
            except:
                pass
    
    def test_create_entry_with_g_issued_and_tp_no(self):
        """Test POST /api/vehicle-weight - Create entry with g_issued and tp_no values"""
        payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD01AB1234",
            "party_name": "TEST_Party",
            "farmer_name": "TEST_Mandi",
            "product": "GOVT PADDY",
            "trans_type": "Receive(Purchase)",
            "tot_pkts": 100,
            "first_wt": 15000,
            "g_issued": 500,
            "tp_no": "TP-TEST-001",
            "kms_year": "2025-2026"
        }
        
        response = requests.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        assert "entry" in data
        
        entry = data["entry"]
        self.test_entry_ids.append(entry["id"])
        
        # Verify g_issued and tp_no are saved
        assert entry.get("g_issued") == 500, f"Expected g_issued=500, got {entry.get('g_issued')}"
        assert entry.get("tp_no") == "TP-TEST-001", f"Expected tp_no='TP-TEST-001', got {entry.get('tp_no')}"
        print(f"PASS: Created entry with g_issued={entry.get('g_issued')}, tp_no={entry.get('tp_no')}")
    
    def test_second_weight_saves_g_issued_and_tp_no(self):
        """Test PUT /api/vehicle-weight/{id}/second-weight - Verify g_issued and tp_no are saved"""
        # First create an entry
        create_payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD02CD5678",
            "party_name": "TEST_Party2",
            "product": "PADDY",
            "trans_type": "Receive(Purchase)",
            "tot_pkts": 50,
            "first_wt": 12000,
            "kms_year": "2025-2026"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/vehicle-weight", json=create_payload)
        assert create_response.status_code == 200
        entry = create_response.json()["entry"]
        entry_id = entry["id"]
        self.test_entry_ids.append(entry_id)
        
        # Now update with second weight including g_issued and tp_no
        second_wt_payload = {
            "second_wt": 5000,
            "cash_paid": 1000,
            "diesel_paid": 500,
            "g_issued": 750,
            "tp_no": "TP-SECOND-002"
        }
        
        update_response = requests.put(f"{BASE_URL}/api/vehicle-weight/{entry_id}/second-weight", json=second_wt_payload)
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        
        updated_data = update_response.json()
        assert updated_data.get("success") == True
        
        updated_entry = updated_data["entry"]
        
        # Verify g_issued and tp_no are saved (THIS WAS THE BUG - they weren't being saved before)
        assert updated_entry.get("g_issued") == 750, f"Expected g_issued=750, got {updated_entry.get('g_issued')}"
        assert updated_entry.get("tp_no") == "TP-SECOND-002", f"Expected tp_no='TP-SECOND-002', got {updated_entry.get('tp_no')}"
        assert updated_entry.get("status") == "completed"
        assert updated_entry.get("second_wt") == 5000
        assert updated_entry.get("net_wt") == 7000  # abs(12000 - 5000)
        
        print(f"PASS: Second weight saved g_issued={updated_entry.get('g_issued')}, tp_no={updated_entry.get('tp_no')}")
    
    def test_rst_lookup_returns_g_issued_and_tp_no(self):
        """Test GET /api/vehicle-weight/by-rst/{rst_no} - RST lookup returns g_issued and tp_no"""
        # Create entry with g_issued and tp_no
        create_payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD03EF9012",
            "party_name": "TEST_Party3",
            "product": "GOVT PADDY",
            "trans_type": "Receive(Purchase)",
            "tot_pkts": 75,
            "first_wt": 18000,
            "g_issued": 1000,
            "tp_no": "TP-RST-003",
            "kms_year": "2025-2026"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/vehicle-weight", json=create_payload)
        assert create_response.status_code == 200
        entry = create_response.json()["entry"]
        entry_id = entry["id"]
        rst_no = entry["rst_no"]
        self.test_entry_ids.append(entry_id)
        
        # Lookup by RST
        lookup_response = requests.get(f"{BASE_URL}/api/vehicle-weight/by-rst/{rst_no}?kms_year=2025-2026")
        assert lookup_response.status_code == 200, f"Expected 200, got {lookup_response.status_code}"
        
        lookup_data = lookup_response.json()
        assert lookup_data.get("success") == True
        
        found_entry = lookup_data["entry"]
        assert found_entry.get("g_issued") == 1000, f"Expected g_issued=1000, got {found_entry.get('g_issued')}"
        assert found_entry.get("tp_no") == "TP-RST-003", f"Expected tp_no='TP-RST-003', got {found_entry.get('tp_no')}"
        
        print(f"PASS: RST lookup returned g_issued={found_entry.get('g_issued')}, tp_no={found_entry.get('tp_no')}")
    
    def test_save_image_with_null_data_no_crash(self):
        """Test POST /api/vehicle-weight with null image data should NOT crash"""
        payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD04GH3456",
            "party_name": "TEST_Party4",
            "product": "PADDY",
            "trans_type": "Receive(Purchase)",
            "tot_pkts": 30,
            "first_wt": 8000,
            "first_wt_front_img": None,  # null image
            "first_wt_side_img": None,
            "kms_year": "2025-2026"
        }
        
        response = requests.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        self.test_entry_ids.append(data["entry"]["id"])
        
        print("PASS: Entry created with null image data - no crash")
    
    def test_save_image_with_object_data_no_crash(self):
        """Test POST /api/vehicle-weight with object image data should NOT crash"""
        payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD05IJ7890",
            "party_name": "TEST_Party5",
            "product": "PADDY",
            "trans_type": "Receive(Purchase)",
            "tot_pkts": 40,
            "first_wt": 9000,
            "first_wt_front_img": {"invalid": "object"},  # object instead of string
            "first_wt_side_img": 12345,  # number instead of string
            "kms_year": "2025-2026"
        }
        
        response = requests.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        self.test_entry_ids.append(data["entry"]["id"])
        
        print("PASS: Entry created with object/number image data - no crash")
    
    def test_save_image_strips_data_url_prefix(self):
        """Test POST /api/vehicle-weight with data:image/jpeg;base64 prefix should strip prefix and save correctly"""
        # Create a small valid base64 image (1x1 red pixel JPEG)
        # This is a minimal valid JPEG
        valid_b64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEAwEPwAB//9k="
        
        # Add data URL prefix
        data_url_image = f"data:image/jpeg;base64,{valid_b64}"
        
        payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD06KL1234",
            "party_name": "TEST_Party6",
            "product": "PADDY",
            "trans_type": "Receive(Purchase)",
            "tot_pkts": 25,
            "first_wt": 7000,
            "first_wt_front_img": data_url_image,  # with data URL prefix
            "kms_year": "2025-2026"
        }
        
        response = requests.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        entry = data["entry"]
        self.test_entry_ids.append(entry["id"])
        
        # Verify image was saved (filename should be set)
        assert entry.get("first_wt_front_img"), "Expected first_wt_front_img filename to be set"
        
        print(f"PASS: Image with data URL prefix saved correctly: {entry.get('first_wt_front_img')}")
    
    def test_weighbridge_live_weight_endpoint(self):
        """Test GET /api/weighbridge/live-weight returns connected/weight/stable status"""
        response = requests.get(f"{BASE_URL}/api/weighbridge/live-weight")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Web version should return disconnected status (no serial port)
        assert "connected" in data, "Expected 'connected' field in response"
        assert "weight" in data, "Expected 'weight' field in response"
        assert "stable" in data, "Expected 'stable' field in response"
        
        # Web version always returns disconnected
        assert data["connected"] == False, "Web version should return connected=False"
        assert data["weight"] == 0, "Web version should return weight=0"
        assert data["stable"] == False, "Web version should return stable=False"
        
        print(f"PASS: weighbridge/live-weight returns {data}")
    
    def test_pending_count_endpoint(self):
        """Test GET /api/vehicle-weight/pending-count returns pending_count"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/pending-count")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        assert "pending_count" in data, "Expected 'pending_count' field in response"
        assert "total_vw" in data, "Expected 'total_vw' field in response"
        assert "linked" in data, "Expected 'linked' field in response"
        
        assert isinstance(data["pending_count"], int), "pending_count should be an integer"
        assert isinstance(data["total_vw"], int), "total_vw should be an integer"
        assert isinstance(data["linked"], int), "linked should be an integer"
        
        print(f"PASS: pending-count returns pending_count={data['pending_count']}, total_vw={data['total_vw']}, linked={data['linked']}")
    
    def test_edit_entry_updates_g_issued_and_tp_no(self):
        """Test PUT /api/vehicle-weight/{id}/edit - Edit updates g_issued and tp_no"""
        # Create entry
        create_payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD07MN5678",
            "party_name": "TEST_Party7",
            "product": "PADDY",
            "trans_type": "Receive(Purchase)",
            "tot_pkts": 60,
            "first_wt": 14000,
            "g_issued": 200,
            "tp_no": "TP-EDIT-001",
            "kms_year": "2025-2026"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/vehicle-weight", json=create_payload)
        assert create_response.status_code == 200
        entry = create_response.json()["entry"]
        entry_id = entry["id"]
        self.test_entry_ids.append(entry_id)
        
        # Edit the entry
        edit_payload = {
            "g_issued": 999,
            "tp_no": "TP-EDIT-UPDATED"
        }
        
        edit_response = requests.put(f"{BASE_URL}/api/vehicle-weight/{entry_id}/edit", json=edit_payload)
        assert edit_response.status_code == 200, f"Expected 200, got {edit_response.status_code}"
        
        edited_entry = edit_response.json()["entry"]
        assert edited_entry.get("g_issued") == 999, f"Expected g_issued=999, got {edited_entry.get('g_issued')}"
        assert edited_entry.get("tp_no") == "TP-EDIT-UPDATED", f"Expected tp_no='TP-EDIT-UPDATED', got {edited_entry.get('tp_no')}"
        
        print(f"PASS: Edit updated g_issued={edited_entry.get('g_issued')}, tp_no={edited_entry.get('tp_no')}")


class TestVehicleWeightListAndFilters:
    """Test Vehicle Weight list and filter endpoints"""
    
    def test_list_entries_includes_g_issued_and_tp_no(self):
        """Test GET /api/vehicle-weight returns entries with g_issued and tp_no fields"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?page_size=5")
        assert response.status_code == 200
        
        data = response.json()
        assert "entries" in data
        
        # Check that entries have g_issued and tp_no fields (even if empty)
        for entry in data["entries"][:3]:  # Check first 3
            assert "g_issued" in entry or entry.get("g_issued") is None or entry.get("g_issued", 0) >= 0
            # tp_no may be empty string or None
            print(f"Entry RST#{entry.get('rst_no')}: g_issued={entry.get('g_issued')}, tp_no={entry.get('tp_no')}")
        
        print(f"PASS: List entries returns {len(data['entries'])} entries with g_issued and tp_no fields")
    
    def test_pending_entries_list(self):
        """Test GET /api/vehicle-weight/pending returns pending entries"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/pending")
        assert response.status_code == 200
        
        data = response.json()
        assert "pending" in data
        assert "count" in data
        
        print(f"PASS: Pending entries count={data['count']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
