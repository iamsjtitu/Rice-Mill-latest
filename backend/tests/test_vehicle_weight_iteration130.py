"""
Test Vehicle Weight APIs - Iteration 130
Focus: Inline Second Weight Capture, RST Auto-fill in Mill Entries, Cash/Diesel auto-accounting
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestVehicleWeightAPIs:
    """Vehicle Weight CRUD and Second Weight Capture APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.kms_year = "2025-2026"
        self.test_vehicle = f"TEST_OD02AB{int(time.time()) % 10000}"
        self.created_ids = []
        yield
        # Cleanup
        for entry_id in self.created_ids:
            try:
                requests.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
            except:
                pass
    
    def test_01_create_first_weight_entry(self):
        """Create new vehicle weight entry with first weight"""
        payload = {
            "date": "2026-01-15",
            "kms_year": self.kms_year,
            "vehicle_no": self.test_vehicle,
            "party_name": "TEST_PARTY",
            "farmer_name": "TEST_MANDI",
            "product": "GOVT PADDY",
            "trans_type": "Receive(Pur)",
            "tot_pkts": 50,
            "first_wt": 15000,
            "remark": "Test entry",
            "cash_paid": 500,
            "diesel_paid": 200
        }
        
        response = requests.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["success"] == True
        assert "entry" in data
        assert data["entry"]["vehicle_no"] == self.test_vehicle
        assert data["entry"]["first_wt"] == 15000
        assert data["entry"]["status"] == "pending"
        assert data["entry"]["cash_paid"] == 500
        assert data["entry"]["diesel_paid"] == 200
        
        self.created_ids.append(data["entry"]["id"])
        print(f"PASS: Created first weight entry RST #{data['entry']['rst_no']}")
        return data["entry"]
    
    def test_02_get_pending_vehicles(self):
        """Get pending vehicles list"""
        # First create an entry
        entry = self.test_01_create_first_weight_entry()
        
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/pending?kms_year={self.kms_year}")
        assert response.status_code == 200
        
        data = response.json()
        assert "pending" in data
        # Should have at least our test entry
        pending_ids = [p["id"] for p in data["pending"]]
        assert entry["id"] in pending_ids, "Created entry should be in pending list"
        print(f"PASS: Pending list has {data['count']} entries")
    
    def test_03_update_second_weight(self):
        """Update second weight and verify net weight calculation"""
        # Create first weight entry
        entry = self.test_01_create_first_weight_entry()
        entry_id = entry["id"]
        
        # Update with second weight
        second_wt_payload = {"second_wt": 6000}
        response = requests.put(f"{BASE_URL}/api/vehicle-weight/{entry_id}/second-weight", json=second_wt_payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] == True
        assert data["entry"]["second_wt"] == 6000
        assert data["entry"]["net_wt"] == 9000  # 15000 - 6000
        assert data["entry"]["status"] == "completed"
        print(f"PASS: Second weight updated, net_wt = {data['entry']['net_wt']} KG")
    
    def test_04_get_by_rst_number(self):
        """Get vehicle weight entry by RST number - used for Mill Entries auto-fill"""
        # Create entry
        entry = self.test_01_create_first_weight_entry()
        rst_no = entry["rst_no"]
        
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/by-rst/{rst_no}?kms_year={self.kms_year}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] == True
        assert data["entry"]["rst_no"] == rst_no
        assert data["entry"]["vehicle_no"] == self.test_vehicle
        assert data["entry"]["party_name"] == "TEST_PARTY"
        assert data["entry"]["farmer_name"] == "TEST_MANDI"
        assert data["entry"]["cash_paid"] == 500
        assert data["entry"]["diesel_paid"] == 200
        print(f"PASS: RST #{rst_no} lookup returns correct data for auto-fill")
    
    def test_05_get_by_rst_not_found(self):
        """RST lookup returns 404 for non-existent RST"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/by-rst/999999?kms_year={self.kms_year}")
        assert response.status_code == 404
        print("PASS: Non-existent RST returns 404")
    
    def test_06_weight_slip_pdf(self):
        """Generate weight slip PDF for completed entry"""
        # Create and complete entry
        entry = self.test_01_create_first_weight_entry()
        entry_id = entry["id"]
        
        # Complete with second weight
        requests.put(f"{BASE_URL}/api/vehicle-weight/{entry_id}/second-weight", json={"second_wt": 6000})
        
        # Get PDF
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/{entry_id}/slip-pdf")
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf"
        assert len(response.content) > 1000  # PDF should have content
        print(f"PASS: Weight slip PDF generated ({len(response.content)} bytes)")
    
    def test_07_delete_entry(self):
        """Delete vehicle weight entry"""
        entry = self.test_01_create_first_weight_entry()
        entry_id = entry["id"]
        
        response = requests.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
        assert response.status_code == 200
        
        # Verify deleted
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/by-rst/{entry['rst_no']}?kms_year={self.kms_year}")
        assert response.status_code == 404
        
        # Remove from cleanup list since already deleted
        self.created_ids.remove(entry_id)
        print("PASS: Entry deleted successfully")


class TestMillEntriesWithCashDiesel:
    """Test Mill Entries auto-accounting for cash_paid and diesel_paid"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.kms_year = "2025-2026"
        self.test_truck = f"TEST_TRUCK{int(time.time()) % 10000}"
        self.created_entry_ids = []
        yield
        # Cleanup
        for entry_id in self.created_entry_ids:
            try:
                requests.delete(f"{BASE_URL}/api/entries/{entry_id}?username=admin&role=admin")
            except:
                pass
    
    def test_01_create_entry_with_cash_diesel(self):
        """Create mill entry with cash_paid and diesel_paid - should auto-create ledger entries"""
        payload = {
            "date": "2026-01-15",
            "kms_year": self.kms_year,
            "season": "Kharif",
            "truck_no": self.test_truck,
            "agent_name": "TEST_AGENT",
            "mandi_name": "TEST_MANDI",
            "kg": 5000,
            "bag": 50,
            "g_deposite": 0,
            "gbw_cut": 25,
            "plastic_bag": 0,
            "cutting_percent": 5,
            "disc_dust_poll": 0,
            "g_issued": 0,
            "moisture": 14,
            "cash_paid": 1000,
            "diesel_paid": 500,
            "remark": "Test entry with cash/diesel"
        }
        
        response = requests.post(f"{BASE_URL}/api/entries?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["truck_no"] == self.test_truck
        assert data["cash_paid"] == 1000
        assert data["diesel_paid"] == 500
        
        self.created_entry_ids.append(data["id"])
        print(f"PASS: Mill entry created with cash_paid={data['cash_paid']}, diesel_paid={data['diesel_paid']}")
        return data
    
    def test_02_verify_cash_book_entry_created(self):
        """Verify cash book nikasi entry created for cash_paid"""
        entry = self.test_01_create_entry_with_cash_diesel()
        
        # Check cash transactions for this entry
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year={self.kms_year}")
        assert response.status_code == 200
        
        data = response.json()
        transactions = data.get("transactions", [])
        
        # Find cash nikasi entry linked to our entry
        cash_entries = [t for t in transactions if t.get("linked_entry_id") == entry["id"] and t.get("account") == "cash"]
        assert len(cash_entries) > 0, "Cash book entry should be created for cash_paid"
        
        cash_entry = cash_entries[0]
        assert cash_entry["txn_type"] == "nikasi"
        assert cash_entry["amount"] == 1000
        print(f"PASS: Cash book nikasi entry created for Rs.{cash_entry['amount']}")
    
    def test_03_verify_ledger_entries_created(self):
        """Verify ledger entries created for truck (jama for purchase, nikasi for cash/diesel deductions)"""
        entry = self.test_01_create_entry_with_cash_diesel()
        
        # Check ledger transactions
        response = requests.get(f"{BASE_URL}/api/ledgers?party_type=Truck&kms_year={self.kms_year}")
        assert response.status_code == 200
        
        data = response.json()
        ledger_entries = data.get("entries", [])
        
        # Find entries linked to our mill entry
        linked_entries = [e for e in ledger_entries if e.get("linked_entry_id") == entry["id"]]
        
        # Should have: 1 jama (truck purchase), 1 nikasi (cash deduction), 1 nikasi (diesel deduction)
        jama_entries = [e for e in linked_entries if e.get("txn_type") == "jama"]
        nikasi_entries = [e for e in linked_entries if e.get("txn_type") == "nikasi"]
        
        assert len(jama_entries) >= 1, "Should have jama entry for truck purchase"
        assert len(nikasi_entries) >= 2, "Should have nikasi entries for cash and diesel deductions"
        
        print(f"PASS: Ledger entries created - {len(jama_entries)} jama, {len(nikasi_entries)} nikasi")


class TestVehicleWeightListFilters:
    """Test vehicle weight list with filters"""
    
    def test_01_list_with_kms_year_filter(self):
        """List vehicle weights with kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?kms_year=2025-2026&limit=10")
        assert response.status_code == 200
        
        data = response.json()
        assert "entries" in data
        assert "count" in data
        print(f"PASS: Listed {data['count']} entries for FY 2025-2026")
    
    def test_02_list_pending_only(self):
        """List only pending vehicle weights"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?status=pending&limit=10")
        assert response.status_code == 200
        
        data = response.json()
        # All entries should be pending
        for entry in data.get("entries", []):
            assert entry["status"] == "pending", f"Entry {entry['id']} should be pending"
        print(f"PASS: Listed {data['count']} pending entries")
    
    def test_03_get_next_rst_number(self):
        """Get next RST number"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/next-rst?kms_year=2025-2026")
        assert response.status_code == 200
        
        data = response.json()
        assert "rst_no" in data
        assert isinstance(data["rst_no"], int)
        assert data["rst_no"] >= 1
        print(f"PASS: Next RST number is {data['rst_no']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
