"""
Test TP Weight field across the application
- Vehicle Weight API: create, update, second-weight, edit endpoints
- Reports API: agent-mandi-wise report includes tp_weight and total_tp_weight
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestVehicleWeightTPWeight:
    """Test TP Weight field in Vehicle Weight endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.created_ids = []
        yield
        # Cleanup
        for entry_id in self.created_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
            except:
                pass
    
    def test_create_vw_with_tp_weight(self):
        """POST /api/vehicle-weight accepts tp_weight field"""
        payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD01AB1234",
            "party_name": "TEST_PARTY",
            "farmer_name": "TEST_MANDI",
            "product": "GOVT PADDY",
            "trans_type": "Receive(Purchase)",
            "tot_pkts": 100,
            "first_wt": 5000,
            "tp_no": "TEST_TP_001",
            "tp_weight": 4950,
            "kms_year": "2024-25"
        }
        resp = self.session.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        assert resp.status_code == 200, f"Create VW failed: {resp.text}"
        data = resp.json()
        assert data.get("success") == True
        entry = data.get("entry", {})
        self.created_ids.append(entry.get("id"))
        
        # Verify tp_weight is saved
        assert entry.get("tp_weight") == 4950, f"tp_weight not saved correctly: {entry.get('tp_weight')}"
        assert entry.get("tp_no") == "TEST_TP_001"
        print(f"PASS: VW created with tp_weight={entry.get('tp_weight')}")
    
    def test_second_weight_with_tp_weight(self):
        """PUT /api/vehicle-weight/{id}/second-weight accepts tp_weight"""
        # First create a pending entry
        create_payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD02CD5678",
            "party_name": "TEST_PARTY2",
            "farmer_name": "TEST_MANDI2",
            "product": "GOVT PADDY",
            "trans_type": "Receive(Purchase)",
            "tot_pkts": 80,
            "first_wt": 6000,
            "kms_year": "2024-25"
        }
        create_resp = self.session.post(f"{BASE_URL}/api/vehicle-weight", json=create_payload)
        assert create_resp.status_code == 200
        entry_id = create_resp.json().get("entry", {}).get("id")
        self.created_ids.append(entry_id)
        
        # Update with second weight and tp_weight
        update_payload = {
            "second_wt": 2000,
            "tp_no": "TEST_TP_002",
            "tp_weight": 3800
        }
        resp = self.session.put(f"{BASE_URL}/api/vehicle-weight/{entry_id}/second-weight", json=update_payload)
        assert resp.status_code == 200, f"Second weight update failed: {resp.text}"
        data = resp.json()
        assert data.get("success") == True
        entry = data.get("entry", {})
        
        # Verify tp_weight is saved
        assert entry.get("tp_weight") == 3800, f"tp_weight not saved in second-weight: {entry.get('tp_weight')}"
        assert entry.get("tp_no") == "TEST_TP_002"
        print(f"PASS: Second weight updated with tp_weight={entry.get('tp_weight')}")
    
    def test_edit_vw_with_tp_weight(self):
        """PUT /api/vehicle-weight/{id}/edit accepts tp_weight"""
        # First create an entry
        create_payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD03EF9012",
            "party_name": "TEST_PARTY3",
            "farmer_name": "TEST_MANDI3",
            "product": "GOVT PADDY",
            "trans_type": "Receive(Purchase)",
            "tot_pkts": 60,
            "first_wt": 4000,
            "tp_weight": 3900,
            "kms_year": "2024-25"
        }
        create_resp = self.session.post(f"{BASE_URL}/api/vehicle-weight", json=create_payload)
        assert create_resp.status_code == 200
        entry_id = create_resp.json().get("entry", {}).get("id")
        self.created_ids.append(entry_id)
        
        # Edit tp_weight
        edit_payload = {
            "tp_weight": 3850
        }
        resp = self.session.put(f"{BASE_URL}/api/vehicle-weight/{entry_id}/edit", json=edit_payload)
        assert resp.status_code == 200, f"Edit VW failed: {resp.text}"
        data = resp.json()
        assert data.get("success") == True
        entry = data.get("entry", {})
        
        # Verify tp_weight is updated
        assert entry.get("tp_weight") == 3850, f"tp_weight not updated in edit: {entry.get('tp_weight')}"
        print(f"PASS: VW edited with tp_weight={entry.get('tp_weight')}")
    
    def test_get_vw_photos_includes_tp_weight(self):
        """GET /api/vehicle-weight/{id}/photos returns tp_weight"""
        # First create an entry
        create_payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD04GH3456",
            "party_name": "TEST_PARTY4",
            "farmer_name": "TEST_MANDI4",
            "product": "GOVT PADDY",
            "trans_type": "Receive(Purchase)",
            "tot_pkts": 50,
            "first_wt": 3500,
            "tp_no": "TEST_TP_004",
            "tp_weight": 3400,
            "kms_year": "2024-25"
        }
        create_resp = self.session.post(f"{BASE_URL}/api/vehicle-weight", json=create_payload)
        assert create_resp.status_code == 200
        entry_id = create_resp.json().get("entry", {}).get("id")
        self.created_ids.append(entry_id)
        
        # Get photos endpoint
        resp = self.session.get(f"{BASE_URL}/api/vehicle-weight/{entry_id}/photos")
        assert resp.status_code == 200, f"Get photos failed: {resp.text}"
        data = resp.json()
        
        # Verify tp_weight is in response
        assert "tp_weight" in data, "tp_weight not in photos response"
        assert data.get("tp_weight") == 3400, f"tp_weight incorrect in photos: {data.get('tp_weight')}"
        print(f"PASS: Photos endpoint returns tp_weight={data.get('tp_weight')}")


class TestAgentMandiReportTPWeight:
    """Test TP Weight in Agent & Mandi Report"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.created_entry_ids = []
        yield
        # Cleanup
        for entry_id in self.created_entry_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/entries/{entry_id}")
            except:
                pass
    
    def test_agent_mandi_report_includes_tp_weight(self):
        """GET /api/reports/agent-mandi-wise returns tp_weight in entries and total_tp_weight in totals"""
        # First create a mill entry with tp_weight
        entry_payload = {
            "date": "2026-01-15",
            "truck_no": "TEST_OD05IJ7890",
            "agent_name": "TEST_AGENT_TP",
            "mandi_name": "TEST_MANDI_TP",
            "rst_no": "99999",
            "tp_no": "TEST_TP_REPORT",
            "tp_weight": 5000,
            "kg": 5100,
            "bag": 100,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        create_resp = self.session.post(f"{BASE_URL}/api/entries", json=entry_payload)
        if create_resp.status_code == 200:
            entry_id = create_resp.json().get("entry", {}).get("id")
            if entry_id:
                self.created_entry_ids.append(entry_id)
        
        # Get agent-mandi-wise report
        resp = self.session.get(f"{BASE_URL}/api/reports/agent-mandi-wise?kms_year=2024-25")
        assert resp.status_code == 200, f"Report API failed: {resp.text}"
        data = resp.json()
        
        # Check grand_totals has total_tp_weight
        grand_totals = data.get("grand_totals", {})
        assert "total_tp_weight" in grand_totals, f"total_tp_weight not in grand_totals: {grand_totals.keys()}"
        print(f"PASS: grand_totals has total_tp_weight={grand_totals.get('total_tp_weight')}")
        
        # Check mandis have totals with total_tp_weight
        mandis = data.get("mandis", [])
        if mandis:
            first_mandi = mandis[0]
            totals = first_mandi.get("totals", {})
            assert "total_tp_weight" in totals, f"total_tp_weight not in mandi totals: {totals.keys()}"
            print(f"PASS: mandi totals has total_tp_weight")
            
            # Check entries have tp_weight
            entries = first_mandi.get("entries", [])
            if entries:
                first_entry = entries[0]
                assert "tp_weight" in first_entry, f"tp_weight not in entry: {first_entry.keys()}"
                print(f"PASS: entry has tp_weight={first_entry.get('tp_weight')}")


class TestMillEntryTPWeight:
    """Test TP Weight in Mill Entry endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.created_ids = []
        yield
        # Cleanup
        for entry_id in self.created_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/entries/{entry_id}")
            except:
                pass
    
    def test_create_mill_entry_with_tp_weight(self):
        """POST /api/entries accepts tp_weight field"""
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "date": "2026-01-15",
            "truck_no": f"TEST_OD06KL{unique_id}",
            "agent_name": "TEST_AGENT_MILL",
            "mandi_name": "TEST_MANDI_MILL",
            "rst_no": f"RST{unique_id}",
            "tp_no": f"TP{unique_id}",
            "tp_weight": 4800,
            "kg": 5000,
            "bag": 100,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        resp = self.session.post(f"{BASE_URL}/api/entries", json=payload)
        assert resp.status_code == 200, f"Create entry failed: {resp.text}"
        # API returns entry directly, not wrapped in {"entry": ...}
        entry = resp.json()
        if entry.get("id"):
            self.created_ids.append(entry.get("id"))
        
        # Verify tp_weight is saved
        assert entry.get("tp_weight") == 4800, f"tp_weight not saved: {entry.get('tp_weight')}"
        print(f"PASS: Mill entry created with tp_weight={entry.get('tp_weight')}")
    
    def test_update_mill_entry_tp_weight(self):
        """PUT /api/entries/{id} accepts tp_weight field"""
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        # First create an entry
        create_payload = {
            "date": "2026-01-15",
            "truck_no": f"TEST_OD07MN{unique_id}",
            "agent_name": "TEST_AGENT_MILL2",
            "mandi_name": "TEST_MANDI_MILL2",
            "rst_no": f"RST2{unique_id}",
            "tp_weight": 4500,
            "kg": 4600,
            "bag": 90,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        create_resp = self.session.post(f"{BASE_URL}/api/entries", json=create_payload)
        assert create_resp.status_code == 200
        # API returns entry directly
        entry = create_resp.json()
        entry_id = entry.get("id")
        self.created_ids.append(entry_id)
        
        # Update tp_weight
        update_payload = {
            "tp_weight": 4550
        }
        resp = self.session.put(f"{BASE_URL}/api/entries/{entry_id}", json=update_payload)
        assert resp.status_code == 200, f"Update entry failed: {resp.text}"
        # API returns entry directly
        entry = resp.json()
        
        # Verify tp_weight is updated
        assert entry.get("tp_weight") == 4550, f"tp_weight not updated: {entry.get('tp_weight')}"
        print(f"PASS: Mill entry updated with tp_weight={entry.get('tp_weight')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
