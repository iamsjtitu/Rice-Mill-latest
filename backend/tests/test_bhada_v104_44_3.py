"""
Test suite for Bhada (Lumpsum) feature v104.44.3
Tests Purchase-side bhada ledger sync, Sale bhada regression, and VW CRUD operations.
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("REACT_APP_BACKEND_URL environment variable not set")

API = f"{BASE_URL}/api"

# Test credentials
USERNAME = "admin"
PASSWORD = "admin123"

# Test data prefix for cleanup
TEST_PREFIX = "TEST_BHADA_"


class TestBhadaPurchaseSync:
    """Tests for Purchase-side bhada ledger sync (vw_purchase_bhada:{rst})"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data and cleanup after"""
        self.created_vw_ids = []
        yield
        # Cleanup created VW entries
        for vw_id in self.created_vw_ids:
            try:
                requests.delete(f"{API}/vehicle-weight/{vw_id}?username={USERNAME}&role=admin")
            except:
                pass
    
    def test_create_purchase_vw_with_bhada_creates_ledger(self):
        """POST /api/vehicle-weight with trans_type='Receive(Purchase)' + bhada=2500 
        → cash_transactions me 'vw_purchase_bhada:{rst}' reference se Truck JAMA entry ban jaye"""
        
        # Create a Purchase VW entry with bhada
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "vehicle_no": f"{TEST_PREFIX}OD01AB1234",
            "party_name": f"{TEST_PREFIX}Test Party",
            "farmer_name": f"{TEST_PREFIX}Test Farmer",
            "product": "PADDY",
            "trans_type": "Receive(Purchase)",
            "tot_pkts": 100,
            "first_wt": 5000,
            "bhada": 2500,
            "username": USERNAME
        }
        
        response = requests.post(f"{API}/vehicle-weight", json=payload)
        assert response.status_code == 200, f"Failed to create VW: {response.text}"
        
        data = response.json()
        assert data.get("success") is True
        vw_entry = data.get("entry", {})
        vw_id = vw_entry.get("id")
        rst_no = vw_entry.get("rst_no")
        
        self.created_vw_ids.append(vw_id)
        
        # Verify the ledger entry was created with correct reference
        ref = f"vw_purchase_bhada:{rst_no}"
        ledger_response = requests.get(f"{API}/cash-book", params={"page_size": 500})
        assert ledger_response.status_code == 200
        
        ledger_data = ledger_response.json()
        ledger_entries = ledger_data.get("transactions", []) if isinstance(ledger_data, dict) else ledger_data
        # Find the entry with our reference
        matching = [e for e in ledger_entries if e.get("reference") == ref]
        
        assert len(matching) >= 1, f"No ledger entry found with reference {ref}"
        
        ledger_entry = matching[0]
        assert ledger_entry.get("party_type") == "Truck", "party_type should be Truck"
        assert ledger_entry.get("txn_type") == "jama", "txn_type should be jama (CR)"
        assert ledger_entry.get("amount") == 2500, f"amount should be 2500, got {ledger_entry.get('amount')}"
        assert "Purchase Bhada" in (ledger_entry.get("description") or ""), "description should contain 'Purchase Bhada'"
        
        print(f"✓ Purchase VW with bhada=2500 created ledger entry with ref {ref}")
    
    def test_edit_purchase_vw_bhada_updates_ledger(self):
        """PUT /api/vehicle-weight/{id}/edit with {bhada:4000} on Purchase entry 
        → 'vw_purchase_bhada:{rst}' ledger amount updates to 4000"""
        
        # First create a Purchase VW entry with initial bhada
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "vehicle_no": f"{TEST_PREFIX}OD02CD5678",
            "party_name": f"{TEST_PREFIX}Edit Test Party",
            "product": "PADDY",
            "trans_type": "Receive(Purchase)",
            "tot_pkts": 50,
            "first_wt": 3000,
            "bhada": 1500,
            "username": USERNAME
        }
        
        create_resp = requests.post(f"{API}/vehicle-weight", json=payload)
        assert create_resp.status_code == 200
        
        vw_entry = create_resp.json().get("entry", {})
        vw_id = vw_entry.get("id")
        rst_no = vw_entry.get("rst_no")
        self.created_vw_ids.append(vw_id)
        
        # Now edit the bhada to 4000
        edit_resp = requests.put(
            f"{API}/vehicle-weight/{vw_id}/edit",
            json={"bhada": 4000},
            params={"username": USERNAME, "role": "admin"}
        )
        assert edit_resp.status_code == 200, f"Edit failed: {edit_resp.text}"
        
        # Verify ledger was updated
        ref = f"vw_purchase_bhada:{rst_no}"
        ledger_response = requests.get(f"{API}/cash-book", params={"page_size": 500})
        ledger_data = ledger_response.json()
        ledger_entries = ledger_data.get("transactions", []) if isinstance(ledger_data, dict) else ledger_data
        matching = [e for e in ledger_entries if e.get("reference") == ref]
        
        assert len(matching) >= 1, f"No ledger entry found with reference {ref}"
        assert matching[0].get("amount") == 4000, f"Ledger amount should be 4000, got {matching[0].get('amount')}"
        
        print(f"✓ Edit bhada to 4000 updated ledger entry")
    
    def test_edit_purchase_vw_bhada_zero_deletes_ledger(self):
        """PUT /api/vehicle-weight/{id}/edit with {bhada:0} on Purchase entry 
        → 'vw_purchase_bhada:{rst}' ledger gets auto-deleted"""
        
        # Create Purchase VW with bhada
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "vehicle_no": f"{TEST_PREFIX}OD03EF9012",
            "party_name": f"{TEST_PREFIX}Zero Bhada Test",
            "product": "PADDY",
            "trans_type": "Receive(Purchase)",
            "tot_pkts": 30,
            "first_wt": 2000,
            "bhada": 3000,
            "username": USERNAME
        }
        
        create_resp = requests.post(f"{API}/vehicle-weight", json=payload)
        assert create_resp.status_code == 200
        
        vw_entry = create_resp.json().get("entry", {})
        vw_id = vw_entry.get("id")
        rst_no = vw_entry.get("rst_no")
        self.created_vw_ids.append(vw_id)
        
        # Verify ledger exists
        ref = f"vw_purchase_bhada:{rst_no}"
        ledger_resp = requests.get(f"{API}/cash-book", params={"page_size": 500})
        ledger_data = ledger_resp.json()
        ledger_entries = ledger_data.get("transactions", []) if isinstance(ledger_data, dict) else ledger_data
        initial_matching = [e for e in ledger_entries if e.get("reference") == ref]
        assert len(initial_matching) >= 1, "Initial ledger entry should exist"
        
        # Set bhada to 0
        edit_resp = requests.put(
            f"{API}/vehicle-weight/{vw_id}/edit",
            json={"bhada": 0},
            params={"username": USERNAME, "role": "admin"}
        )
        assert edit_resp.status_code == 200
        
        # Verify ledger was deleted
        ledger_resp2 = requests.get(f"{API}/cash-book", params={"page_size": 500})
        ledger_data2 = ledger_resp2.json()
        ledger_entries2 = ledger_data2.get("transactions", []) if isinstance(ledger_data2, dict) else ledger_data2
        final_matching = [e for e in ledger_entries2 if e.get("reference") == ref]
        assert len(final_matching) == 0, f"Ledger entry should be deleted when bhada=0, found {len(final_matching)}"
        
        print(f"✓ Setting bhada=0 deleted ledger entry")
    
    def test_delete_purchase_vw_cascades_ledger(self):
        """DELETE /api/vehicle-weight/{id} on Purchase entry with bhada 
        → cascade-removes 'vw_purchase_bhada:{rst}' ledger"""
        
        # Create Purchase VW with bhada
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "vehicle_no": f"{TEST_PREFIX}OD04GH3456",
            "party_name": f"{TEST_PREFIX}Delete Cascade Test",
            "product": "PADDY",
            "trans_type": "Receive(Purchase)",
            "tot_pkts": 40,
            "first_wt": 2500,
            "bhada": 2000,
            "username": USERNAME
        }
        
        create_resp = requests.post(f"{API}/vehicle-weight", json=payload)
        assert create_resp.status_code == 200
        
        vw_entry = create_resp.json().get("entry", {})
        vw_id = vw_entry.get("id")
        rst_no = vw_entry.get("rst_no")
        # Don't add to cleanup list since we're deleting it
        
        # Verify ledger exists
        ref = f"vw_purchase_bhada:{rst_no}"
        ledger_resp = requests.get(f"{API}/cash-book", params={"page_size": 500})
        ledger_data = ledger_resp.json()
        ledger_entries = ledger_data.get("transactions", []) if isinstance(ledger_data, dict) else ledger_data
        initial_matching = [e for e in ledger_entries if e.get("reference") == ref]
        assert len(initial_matching) >= 1, "Initial ledger entry should exist"
        
        # Delete the VW entry
        delete_resp = requests.delete(f"{API}/vehicle-weight/{vw_id}?username={USERNAME}&role=admin")
        assert delete_resp.status_code == 200
        
        # Verify ledger was cascade deleted
        ledger_resp2 = requests.get(f"{API}/cash-book", params={"page_size": 500})
        ledger_data2 = ledger_resp2.json()
        ledger_entries2 = ledger_data2.get("transactions", []) if isinstance(ledger_data2, dict) else ledger_data2
        final_matching = [e for e in ledger_entries2 if e.get("reference") == ref]
        assert len(final_matching) == 0, f"Ledger should be cascade deleted, found {len(final_matching)}"
        
        print(f"✓ Deleting VW cascade-deleted ledger entry")


class TestBhadaSaleRegression:
    """Regression tests for Sale-side bhada (existing functionality)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data and cleanup after"""
        self.created_vw_ids = []
        yield
        for vw_id in self.created_vw_ids:
            try:
                requests.delete(f"{API}/vehicle-weight/{vw_id}?username={USERNAME}&role=admin")
            except:
                pass
    
    def test_sale_vw_with_bhada_creates_sale_ledger(self):
        """POST Sale entry with bhada=4000 → 'vw_sale_bhada:{rst}' (existing) — verify still works"""
        
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "vehicle_no": f"{TEST_PREFIX}OD05IJ7890",
            "party_name": f"{TEST_PREFIX}Sale Bhada Test",
            "product": "RICE",
            "trans_type": "Dispatch(Sale)",
            "tot_pkts": 80,
            "first_wt": 6000,
            "bhada": 4000,
            "username": USERNAME
        }
        
        response = requests.post(f"{API}/vehicle-weight", json=payload)
        assert response.status_code == 200, f"Failed to create Sale VW: {response.text}"
        
        vw_entry = response.json().get("entry", {})
        vw_id = vw_entry.get("id")
        rst_no = vw_entry.get("rst_no")
        self.created_vw_ids.append(vw_id)
        
        # Verify sale ledger entry
        ref = f"vw_sale_bhada:{rst_no}"
        ledger_resp = requests.get(f"{API}/cash-book", params={"page_size": 500})
        ledger_data = ledger_resp.json()
        ledger_entries = ledger_data.get("transactions", []) if isinstance(ledger_data, dict) else ledger_data
        matching = [e for e in ledger_entries if e.get("reference") == ref]
        
        assert len(matching) >= 1, f"No sale ledger entry found with reference {ref}"
        assert matching[0].get("amount") == 4000
        assert matching[0].get("party_type") == "Truck"
        assert matching[0].get("txn_type") == "jama"
        assert "Sale Bhada" in (matching[0].get("description") or "")
        
        print(f"✓ Sale VW with bhada=4000 created ledger entry (regression OK)")


class TestVehicleWeightCRUD:
    """Test existing Vehicle Weight CRUD operations work (no regression)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.created_vw_ids = []
        yield
        for vw_id in self.created_vw_ids:
            try:
                requests.delete(f"{API}/vehicle-weight/{vw_id}?username={USERNAME}&role=admin")
            except:
                pass
    
    def test_list_vehicle_weights(self):
        """GET /api/vehicle-weight returns list"""
        response = requests.get(f"{API}/vehicle-weight", params={"kms_year": "2024-2025"})
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        print(f"✓ List VW returned {data.get('count', 0)} entries")
    
    def test_create_purchase_vw(self):
        """POST /api/vehicle-weight creates Purchase entry"""
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "vehicle_no": f"{TEST_PREFIX}CRUD_PUR",
            "party_name": f"{TEST_PREFIX}CRUD Purchase",
            "product": "PADDY",
            "trans_type": "Receive(Purchase)",
            "tot_pkts": 20,
            "first_wt": 1500,
            "username": USERNAME
        }
        
        response = requests.post(f"{API}/vehicle-weight", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("success") is True
        vw_id = data.get("entry", {}).get("id")
        self.created_vw_ids.append(vw_id)
        
        print(f"✓ Created Purchase VW entry")
    
    def test_create_sale_vw(self):
        """POST /api/vehicle-weight creates Sale entry"""
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "vehicle_no": f"{TEST_PREFIX}CRUD_SALE",
            "party_name": f"{TEST_PREFIX}CRUD Sale",
            "product": "RICE",
            "trans_type": "Dispatch(Sale)",
            "tot_pkts": 60,
            "first_wt": 4000,
            "username": USERNAME
        }
        
        response = requests.post(f"{API}/vehicle-weight", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("success") is True
        vw_id = data.get("entry", {}).get("id")
        self.created_vw_ids.append(vw_id)
        
        print(f"✓ Created Sale VW entry")
    
    def test_edit_vw_entry(self):
        """PUT /api/vehicle-weight/{id}/edit updates entry"""
        # Create first
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "vehicle_no": f"{TEST_PREFIX}EDIT_TEST",
            "party_name": f"{TEST_PREFIX}Edit Test",
            "product": "PADDY",
            "trans_type": "Receive(Purchase)",
            "tot_pkts": 10,
            "first_wt": 1000,
            "username": USERNAME
        }
        
        create_resp = requests.post(f"{API}/vehicle-weight", json=payload)
        assert create_resp.status_code == 200
        vw_id = create_resp.json().get("entry", {}).get("id")
        self.created_vw_ids.append(vw_id)
        
        # Edit
        edit_resp = requests.put(
            f"{API}/vehicle-weight/{vw_id}/edit",
            json={"party_name": f"{TEST_PREFIX}Edited Party"},
            params={"username": USERNAME, "role": "admin"}
        )
        assert edit_resp.status_code == 200
        
        updated = edit_resp.json().get("entry", {})
        assert updated.get("party_name") == f"{TEST_PREFIX}Edited Party"
        
        print(f"✓ Edited VW entry")
    
    def test_delete_vw_entry(self):
        """DELETE /api/vehicle-weight/{id} removes entry"""
        # Create first
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "vehicle_no": f"{TEST_PREFIX}DELETE_TEST",
            "party_name": f"{TEST_PREFIX}Delete Test",
            "product": "PADDY",
            "trans_type": "Receive(Purchase)",
            "tot_pkts": 5,
            "first_wt": 500,
            "username": USERNAME
        }
        
        create_resp = requests.post(f"{API}/vehicle-weight", json=payload)
        assert create_resp.status_code == 200
        vw_id = create_resp.json().get("entry", {}).get("id")
        
        # Delete
        delete_resp = requests.delete(f"{API}/vehicle-weight/{vw_id}?username={USERNAME}&role=admin")
        assert delete_resp.status_code == 200
        
        print(f"✓ Deleted VW entry")


class TestVwByRstLookup:
    """Test RST lookup endpoint used by forms for auto-fill"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.created_vw_ids = []
        yield
        for vw_id in self.created_vw_ids:
            try:
                requests.delete(f"{API}/vehicle-weight/{vw_id}?username={USERNAME}&role=admin")
            except:
                pass
    
    def test_lookup_by_rst_returns_entry(self):
        """GET /api/vehicle-weight/by-rst/{rst_no} returns entry with bhada"""
        # Create a VW entry
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "vehicle_no": f"{TEST_PREFIX}LOOKUP_TEST",
            "party_name": f"{TEST_PREFIX}Lookup Party",
            "product": "PADDY",
            "trans_type": "Receive(Purchase)",
            "tot_pkts": 25,
            "first_wt": 2000,
            "bhada": 1800,
            "username": USERNAME
        }
        
        create_resp = requests.post(f"{API}/vehicle-weight", json=payload)
        assert create_resp.status_code == 200
        
        vw_entry = create_resp.json().get("entry", {})
        vw_id = vw_entry.get("id")
        rst_no = vw_entry.get("rst_no")
        self.created_vw_ids.append(vw_id)
        
        # Lookup by RST
        lookup_resp = requests.get(f"{API}/vehicle-weight/by-rst/{rst_no}", params={"kms_year": "2024-2025"})
        assert lookup_resp.status_code == 200
        
        lookup_data = lookup_resp.json()
        entry = lookup_data.get("entry", {})
        
        assert entry.get("rst_no") == rst_no
        assert entry.get("vehicle_no") == f"{TEST_PREFIX}LOOKUP_TEST"
        assert entry.get("bhada") == 1800
        
        print(f"✓ RST lookup returned entry with bhada={entry.get('bhada')}")
    
    def test_lookup_nonexistent_rst_returns_404(self):
        """GET /api/vehicle-weight/by-rst/{invalid} returns 404"""
        response = requests.get(f"{API}/vehicle-weight/by-rst/999999", params={"kms_year": "2024-2025"})
        assert response.status_code == 404
        print(f"✓ Nonexistent RST returns 404")


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_api_health(self):
        """API is accessible"""
        response = requests.get(f"{API}/health")
        # Some APIs return 200, some 404 for /health - just check connectivity
        assert response.status_code in [200, 404, 422]
        print(f"✓ API is accessible")
    
    def test_vehicle_weight_endpoint_accessible(self):
        """Vehicle weight endpoint is accessible"""
        response = requests.get(f"{API}/vehicle-weight")
        assert response.status_code == 200
        print(f"✓ Vehicle weight endpoint accessible")
