"""
Test Vehicle Weight API - Iteration 131
Testing: Auto Vehicle Weight feature changes
1. POST /api/vehicle-weight accepts custom rst_no parameter
2. DELETE /api/vehicle-weight/{id} works for pending and completed entries
3. All existing APIs still work correctly
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
KMS_YEAR = "2025-2026"

class TestVehicleWeightAPIs:
    """Vehicle Weight API tests for iteration 131"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_ids = []
        yield
        # Cleanup created test entries
        for entry_id in self.created_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
            except:
                pass
    
    def test_get_next_rst(self):
        """Test GET /api/vehicle-weight/next-rst returns next RST number"""
        response = self.session.get(f"{BASE_URL}/api/vehicle-weight/next-rst?kms_year={KMS_YEAR}")
        assert response.status_code == 200
        data = response.json()
        assert "rst_no" in data
        assert isinstance(data["rst_no"], int)
        assert data["rst_no"] >= 1
        print(f"Next RST number: {data['rst_no']}")
    
    def test_create_first_weight_auto_rst(self):
        """Test POST /api/vehicle-weight with auto RST number"""
        payload = {
            "kms_year": KMS_YEAR,
            "vehicle_no": "TEST OD 01 AB 1234",
            "party_name": "TEST PARTY AUTO RST",
            "farmer_name": "TEST FARMER",
            "product": "GOVT PADDY",
            "trans_type": "Receive(Pur)",
            "tot_pkts": 50,
            "first_wt": 15000,
            "remark": "Test auto RST",
            "cash_paid": 500,
            "diesel_paid": 200
        }
        response = self.session.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert "entry" in data
        entry = data["entry"]
        assert entry["vehicle_no"] == "TEST OD 01 AB 1234"
        assert entry["first_wt"] == 15000
        assert entry["status"] == "pending"
        assert "rst_no" in entry
        self.created_ids.append(entry["id"])
        print(f"Created entry with auto RST #{entry['rst_no']}")
    
    def test_create_first_weight_custom_rst(self):
        """Test POST /api/vehicle-weight with custom RST number"""
        # First get next RST to use a custom one
        rst_response = self.session.get(f"{BASE_URL}/api/vehicle-weight/next-rst?kms_year={KMS_YEAR}")
        next_rst = rst_response.json()["rst_no"]
        custom_rst = next_rst + 100  # Use a custom RST number
        
        payload = {
            "kms_year": KMS_YEAR,
            "vehicle_no": "TEST OD 02 CD 5678",
            "party_name": "TEST PARTY CUSTOM RST",
            "farmer_name": "TEST FARMER CUSTOM",
            "product": "PADDY",
            "trans_type": "Receive(Pur)",
            "tot_pkts": 30,
            "first_wt": 12000,
            "rst_no": custom_rst,  # Custom RST number
            "remark": "Test custom RST"
        }
        response = self.session.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        entry = data["entry"]
        assert entry["rst_no"] == custom_rst, f"Expected RST {custom_rst}, got {entry['rst_no']}"
        assert entry["vehicle_no"] == "TEST OD 02 CD 5678"
        self.created_ids.append(entry["id"])
        print(f"Created entry with custom RST #{entry['rst_no']}")
    
    def test_list_pending_vehicles(self):
        """Test GET /api/vehicle-weight/pending returns pending entries"""
        response = self.session.get(f"{BASE_URL}/api/vehicle-weight/pending?kms_year={KMS_YEAR}")
        assert response.status_code == 200
        data = response.json()
        assert "pending" in data
        assert isinstance(data["pending"], list)
        print(f"Found {len(data['pending'])} pending vehicles")
    
    def test_update_second_weight(self):
        """Test PUT /api/vehicle-weight/{id}/second-weight"""
        # First create a pending entry
        payload = {
            "kms_year": KMS_YEAR,
            "vehicle_no": "TEST OD 03 EF 9012",
            "party_name": "TEST PARTY 2ND WT",
            "first_wt": 18000
        }
        create_response = self.session.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        assert create_response.status_code == 200
        entry_id = create_response.json()["entry"]["id"]
        self.created_ids.append(entry_id)
        
        # Update second weight
        update_payload = {"second_wt": 8000}
        response = self.session.put(f"{BASE_URL}/api/vehicle-weight/{entry_id}/second-weight", json=update_payload)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        entry = data["entry"]
        assert entry["second_wt"] == 8000
        assert entry["net_wt"] == 10000  # 18000 - 8000
        assert entry["status"] == "completed"
        print(f"Updated second weight, net_wt: {entry['net_wt']}")
    
    def test_delete_pending_entry(self):
        """Test DELETE /api/vehicle-weight/{id} for pending entry"""
        # Create a pending entry
        payload = {
            "kms_year": KMS_YEAR,
            "vehicle_no": "TEST OD 04 GH 3456",
            "party_name": "TEST DELETE PENDING",
            "first_wt": 14000
        }
        create_response = self.session.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        assert create_response.status_code == 200
        entry_id = create_response.json()["entry"]["id"]
        
        # Delete the pending entry
        delete_response = self.session.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
        assert delete_response.status_code == 200
        data = delete_response.json()
        assert data["success"] == True
        print("Successfully deleted pending entry")
        
        # Verify it's deleted
        list_response = self.session.get(f"{BASE_URL}/api/vehicle-weight?kms_year={KMS_YEAR}")
        entries = list_response.json()["entries"]
        assert not any(e["id"] == entry_id for e in entries), "Entry should be deleted"
    
    def test_delete_completed_entry(self):
        """Test DELETE /api/vehicle-weight/{id} for completed entry"""
        # Create and complete an entry
        payload = {
            "kms_year": KMS_YEAR,
            "vehicle_no": "TEST OD 05 IJ 7890",
            "party_name": "TEST DELETE COMPLETED",
            "first_wt": 16000
        }
        create_response = self.session.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        assert create_response.status_code == 200
        entry_id = create_response.json()["entry"]["id"]
        
        # Complete it with second weight
        self.session.put(f"{BASE_URL}/api/vehicle-weight/{entry_id}/second-weight", json={"second_wt": 6000})
        
        # Delete the completed entry
        delete_response = self.session.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
        assert delete_response.status_code == 200
        data = delete_response.json()
        assert data["success"] == True
        print("Successfully deleted completed entry")
    
    def test_get_by_rst(self):
        """Test GET /api/vehicle-weight/by-rst/{rst_no}"""
        # Create an entry first
        payload = {
            "kms_year": KMS_YEAR,
            "vehicle_no": "TEST OD 06 KL 1111",
            "party_name": "TEST GET BY RST",
            "first_wt": 13000
        }
        create_response = self.session.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        assert create_response.status_code == 200
        entry = create_response.json()["entry"]
        self.created_ids.append(entry["id"])
        rst_no = entry["rst_no"]
        
        # Get by RST
        response = self.session.get(f"{BASE_URL}/api/vehicle-weight/by-rst/{rst_no}?kms_year={KMS_YEAR}")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["entry"]["rst_no"] == rst_no
        print(f"Successfully retrieved entry by RST #{rst_no}")
    
    def test_list_all_entries(self):
        """Test GET /api/vehicle-weight returns all entries"""
        response = self.session.get(f"{BASE_URL}/api/vehicle-weight?kms_year={KMS_YEAR}&limit=50")
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        assert isinstance(data["entries"], list)
        print(f"Found {len(data['entries'])} total entries")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
