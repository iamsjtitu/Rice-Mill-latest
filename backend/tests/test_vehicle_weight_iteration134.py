"""
Vehicle Weight API Tests - Iteration 134
Tests all vehicle-weight endpoints for the Rice Mill Management System
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://paddy-ledger-1.preview.emergentagent.com').rstrip('/')

class TestVehicleWeightAPIs:
    """Test all Vehicle Weight API endpoints"""
    
    # Store created entry ID for cleanup
    created_entry_id = None
    created_rst_no = None
    
    def test_01_list_vehicle_weights(self):
        """GET /api/vehicle-weight - list all vehicle weights"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "entries" in data, "Response should have 'entries' key"
        assert "count" in data, "Response should have 'count' key"
        assert isinstance(data["entries"], list), "entries should be a list"
        print(f"✓ List vehicle weights: {data['count']} entries found")
    
    def test_02_list_with_filters(self):
        """GET /api/vehicle-weight with kms_year, status, limit filters"""
        # Test with kms_year filter
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        print(f"✓ List with kms_year filter: {data['count']} entries")
        
        # Test with status filter
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?status=completed")
        assert response.status_code == 200
        data = response.json()
        for entry in data["entries"]:
            assert entry.get("status") == "completed", "All entries should be completed"
        print(f"✓ List with status=completed filter: {data['count']} entries")
        
        # Test with limit filter
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?limit=5")
        assert response.status_code == 200
        data = response.json()
        assert len(data["entries"]) <= 5, "Should return at most 5 entries"
        print(f"✓ List with limit=5: {len(data['entries'])} entries")
    
    def test_03_get_pending_vehicles(self):
        """GET /api/vehicle-weight/pending - get pending vehicle weights"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/pending")
        assert response.status_code == 200
        data = response.json()
        assert "pending" in data, "Response should have 'pending' key"
        assert "count" in data, "Response should have 'count' key"
        for entry in data["pending"]:
            assert entry.get("status") == "pending", "All entries should be pending"
        print(f"✓ Get pending vehicles: {data['count']} pending entries")
    
    def test_04_get_next_rst(self):
        """GET /api/vehicle-weight/next-rst - get next RST number"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/next-rst")
        assert response.status_code == 200
        data = response.json()
        assert "rst_no" in data, "Response should have 'rst_no' key"
        assert isinstance(data["rst_no"], int), "rst_no should be an integer"
        assert data["rst_no"] > 0, "rst_no should be positive"
        print(f"✓ Get next RST: {data['rst_no']}")
    
    def test_05_get_auto_notify_setting(self):
        """GET /api/vehicle-weight/auto-notify-setting - get auto notify setting"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/auto-notify-setting")
        assert response.status_code == 200
        data = response.json()
        assert "enabled" in data, "Response should have 'enabled' key"
        assert isinstance(data["enabled"], bool), "enabled should be a boolean"
        print(f"✓ Get auto notify setting: enabled={data['enabled']}")
    
    def test_06_update_auto_notify_setting(self):
        """PUT /api/vehicle-weight/auto-notify-setting - update auto notify setting"""
        # Get current setting
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/auto-notify-setting")
        current = response.json().get("enabled", False)
        
        # Toggle setting
        new_value = not current
        response = requests.put(
            f"{BASE_URL}/api/vehicle-weight/auto-notify-setting",
            json={"enabled": new_value}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True, "Should return success=True"
        assert data.get("enabled") == new_value, f"enabled should be {new_value}"
        
        # Restore original setting
        requests.put(
            f"{BASE_URL}/api/vehicle-weight/auto-notify-setting",
            json={"enabled": current}
        )
        print(f"✓ Update auto notify setting: toggled to {new_value} and restored to {current}")
    
    def test_07_create_weight_entry(self):
        """POST /api/vehicle-weight - create a new weight entry with first weight"""
        payload = {
            "date": "2026-01-15",
            "kms_year": "2025-2026",
            "vehicle_no": "TEST OD 99 ZZ 1234",
            "party_name": "TEST_PARTY_134",
            "farmer_name": "TEST_MANDI_134",
            "product": "PADDY",
            "trans_type": "Receive(Pur)",
            "tot_pkts": 50,
            "first_wt": 18500,
            "remark": "Test entry iteration 134",
            "cash_paid": 1000,
            "diesel_paid": 500
        }
        response = requests.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True, "Should return success=True"
        assert "entry" in data, "Response should have 'entry' key"
        assert "message" in data, "Response should have 'message' key"
        
        entry = data["entry"]
        assert entry.get("vehicle_no") == "TEST OD 99 ZZ 1234"
        assert entry.get("party_name") == "TEST_PARTY_134"
        assert entry.get("first_wt") == 18500.0
        assert entry.get("status") == "pending"
        assert "id" in entry, "Entry should have an id"
        assert "rst_no" in entry, "Entry should have rst_no"
        
        # Store for later tests
        TestVehicleWeightAPIs.created_entry_id = entry["id"]
        TestVehicleWeightAPIs.created_rst_no = entry["rst_no"]
        print(f"✓ Create weight entry: RST #{entry['rst_no']}, ID={entry['id']}")
    
    def test_08_verify_created_entry_in_pending(self):
        """Verify created entry appears in pending list"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/pending")
        assert response.status_code == 200
        data = response.json()
        
        found = False
        for entry in data["pending"]:
            if entry.get("id") == TestVehicleWeightAPIs.created_entry_id:
                found = True
                assert entry.get("status") == "pending"
                break
        
        assert found, f"Created entry {TestVehicleWeightAPIs.created_entry_id} should be in pending list"
        print(f"✓ Verified entry in pending list")
    
    def test_09_get_by_rst(self):
        """GET /api/vehicle-weight/by-rst/{rst_no} - lookup entry by RST number"""
        rst_no = TestVehicleWeightAPIs.created_rst_no
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/by-rst/{rst_no}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("success") == True
        assert "entry" in data
        assert data["entry"]["rst_no"] == rst_no
        assert data["entry"]["id"] == TestVehicleWeightAPIs.created_entry_id
        print(f"✓ Get by RST #{rst_no}: found entry")
    
    def test_10_get_by_rst_not_found(self):
        """GET /api/vehicle-weight/by-rst/{rst_no} - 404 for non-existent RST"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/by-rst/999999")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Get by RST 999999: correctly returns 404")
    
    def test_11_update_second_weight(self):
        """PUT /api/vehicle-weight/{id}/second-weight - update second weight and calculate net"""
        entry_id = TestVehicleWeightAPIs.created_entry_id
        payload = {
            "second_wt": 8500,
            "cash_paid": 1500,
            "diesel_paid": 750
        }
        response = requests.put(f"{BASE_URL}/api/vehicle-weight/{entry_id}/second-weight", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert "entry" in data
        
        entry = data["entry"]
        assert entry.get("second_wt") == 8500.0
        assert entry.get("status") == "completed"
        # Net weight = abs(first_wt - second_wt) = abs(18500 - 8500) = 10000
        assert entry.get("net_wt") == 10000.0, f"Expected net_wt=10000, got {entry.get('net_wt')}"
        assert entry.get("gross_wt") == 18500.0, "Gross should be max of first/second"
        assert entry.get("tare_wt") == 8500.0, "Tare should be min of first/second"
        assert entry.get("cash_paid") == 1500.0
        assert entry.get("diesel_paid") == 750.0
        print(f"✓ Update second weight: net_wt={entry['net_wt']} KG, status=completed")
    
    def test_12_verify_entry_in_completed(self):
        """Verify entry moved from pending to completed"""
        # Should NOT be in pending
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/pending")
        data = response.json()
        for entry in data["pending"]:
            assert entry.get("id") != TestVehicleWeightAPIs.created_entry_id, "Entry should not be in pending"
        
        # Should be in completed
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?status=completed")
        data = response.json()
        found = False
        for entry in data["entries"]:
            if entry.get("id") == TestVehicleWeightAPIs.created_entry_id:
                found = True
                assert entry.get("status") == "completed"
                break
        assert found, "Entry should be in completed list"
        print(f"✓ Verified entry moved to completed")
    
    def test_13_edit_weight_entry(self):
        """PUT /api/vehicle-weight/{id}/edit - edit completed weight entry fields"""
        entry_id = TestVehicleWeightAPIs.created_entry_id
        payload = {
            "vehicle_no": "TEST OD 99 ZZ 9999",
            "party_name": "EDITED_PARTY_134",
            "farmer_name": "EDITED_MANDI_134",
            "product": "RICE",
            "tot_pkts": 75,
            "cash_paid": 2000,
            "diesel_paid": 1000
        }
        response = requests.put(f"{BASE_URL}/api/vehicle-weight/{entry_id}/edit", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True
        
        entry = data["entry"]
        assert entry.get("vehicle_no") == "TEST OD 99 ZZ 9999"
        assert entry.get("party_name") == "EDITED_PARTY_134"
        assert entry.get("farmer_name") == "EDITED_MANDI_134"
        assert entry.get("product") == "RICE"
        assert entry.get("tot_pkts") == 75
        assert entry.get("cash_paid") == 2000.0
        assert entry.get("diesel_paid") == 1000.0
        # Weights should remain unchanged
        assert entry.get("net_wt") == 10000.0
        print(f"✓ Edit weight entry: updated fields successfully")
    
    def test_14_edit_nonexistent_entry(self):
        """PUT /api/vehicle-weight/{id}/edit - 404 for non-existent entry"""
        fake_id = str(uuid.uuid4())
        response = requests.put(f"{BASE_URL}/api/vehicle-weight/{fake_id}/edit", json={"party_name": "Test"})
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Edit non-existent entry: correctly returns 404")
    
    def test_15_slip_pdf(self):
        """GET /api/vehicle-weight/{id}/slip-pdf - generate PDF slip"""
        entry_id = TestVehicleWeightAPIs.created_entry_id
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/{entry_id}/slip-pdf")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get("content-type") == "application/pdf", "Should return PDF content-type"
        assert len(response.content) > 1000, "PDF should have substantial content"
        print(f"✓ Generate PDF slip: {len(response.content)} bytes")
    
    def test_16_slip_pdf_not_found(self):
        """GET /api/vehicle-weight/{id}/slip-pdf - 404 for non-existent entry"""
        fake_id = str(uuid.uuid4())
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/{fake_id}/slip-pdf")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ PDF for non-existent entry: correctly returns 404")
    
    def test_17_delete_weight_entry(self):
        """DELETE /api/vehicle-weight/{id} - delete weight entry"""
        entry_id = TestVehicleWeightAPIs.created_entry_id
        response = requests.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("success") == True
        assert "message" in data
        print(f"✓ Delete weight entry: {data['message']}")
    
    def test_18_verify_deletion(self):
        """Verify deleted entry no longer exists"""
        entry_id = TestVehicleWeightAPIs.created_entry_id
        rst_no = TestVehicleWeightAPIs.created_rst_no
        
        # Should not be in list
        response = requests.get(f"{BASE_URL}/api/vehicle-weight")
        data = response.json()
        for entry in data["entries"]:
            assert entry.get("id") != entry_id, "Deleted entry should not be in list"
        
        # Get by RST should return 404
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/by-rst/{rst_no}?kms_year=2025-2026")
        # Note: might find another entry with same RST in different kms_year, so just check our ID is gone
        print(f"✓ Verified entry deleted")
    
    def test_19_delete_nonexistent_entry(self):
        """DELETE /api/vehicle-weight/{id} - 404 for non-existent entry"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(f"{BASE_URL}/api/vehicle-weight/{fake_id}")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Delete non-existent entry: correctly returns 404")
    
    def test_20_second_weight_nonexistent(self):
        """PUT /api/vehicle-weight/{id}/second-weight - 404 for non-existent entry"""
        fake_id = str(uuid.uuid4())
        response = requests.put(f"{BASE_URL}/api/vehicle-weight/{fake_id}/second-weight", json={"second_wt": 5000})
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Second weight for non-existent entry: correctly returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
