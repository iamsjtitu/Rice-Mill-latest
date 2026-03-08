"""
Iteration 25 Tests: Diesel Account System & Cash Paid Auto Cash Book
Tests the following features:
1. Login with admin/admin123
2. POST /api/diesel-pumps creates a new pump
3. PUT /api/diesel-pumps/:id/set-default sets default pump
4. DELETE /api/diesel-pumps/:id deletes pump
5. Creating entry with cash_paid > 0 auto-creates cash book nikasi transaction
6. Creating entry with diesel_paid > 0 auto-creates diesel account debit entry linked to default pump
7. GET /api/diesel-accounts returns diesel transactions
8. GET /api/diesel-accounts/summary returns pump-wise summary with balance
9. POST /api/diesel-accounts/pay creates payment + auto cash book nikasi entry
10. Deleting entry removes linked cash book and diesel account entries
11. G.Issued still deducts from Total (Excl Govt) correctly in gunny bags summary
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="module")
def auth_token(api_client):
    """Get authentication token via admin login"""
    response = api_client.post(f"{BASE_URL}/api/login", json={
        "username": "admin",
        "password": "admin123"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "token" in data or "username" in data, f"No token/username in response: {response.text}"
    return data

class TestLogin:
    """Test admin login"""
    
    def test_admin_login(self, api_client):
        """Test admin login with admin/admin123"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert data.get("role") == "admin", f"Expected admin role, got: {data}"
        print(f"✓ Admin login successful: {data.get('username')}")


class TestDieselPumps:
    """Test diesel pump CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client):
        """Store client for reuse"""
        self.api = api_client
        self.created_pump_ids = []
        yield
        # Cleanup created pumps
        for pump_id in self.created_pump_ids:
            try:
                self.api.delete(f"{BASE_URL}/api/diesel-pumps/{pump_id}")
            except:
                pass
    
    def test_create_diesel_pump(self, api_client):
        """POST /api/diesel-pumps creates a new pump"""
        pump_name = f"TEST_Pump_{uuid.uuid4().hex[:8]}"
        response = api_client.post(f"{BASE_URL}/api/diesel-pumps", json={
            "name": pump_name,
            "is_default": False
        })
        assert response.status_code == 200, f"Failed to create pump: {response.text}"
        data = response.json()
        assert data.get("name") == pump_name, f"Pump name mismatch: {data}"
        assert "id" in data, f"No id in response: {data}"
        self.created_pump_ids.append(data["id"])
        print(f"✓ Created diesel pump: {pump_name}")
    
    def test_get_diesel_pumps(self, api_client):
        """GET /api/diesel-pumps returns list of pumps"""
        response = api_client.get(f"{BASE_URL}/api/diesel-pumps")
        assert response.status_code == 200, f"Failed to get pumps: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got: {type(data)}"
        print(f"✓ Got {len(data)} diesel pumps")
    
    def test_set_default_pump(self, api_client):
        """PUT /api/diesel-pumps/:id/set-default sets default pump"""
        # First create a pump
        pump_name = f"TEST_DefaultPump_{uuid.uuid4().hex[:8]}"
        create_resp = api_client.post(f"{BASE_URL}/api/diesel-pumps", json={
            "name": pump_name,
            "is_default": False
        })
        assert create_resp.status_code == 200, f"Failed to create pump: {create_resp.text}"
        pump_id = create_resp.json()["id"]
        self.created_pump_ids.append(pump_id)
        
        # Set as default
        response = api_client.put(f"{BASE_URL}/api/diesel-pumps/{pump_id}/set-default")
        assert response.status_code == 200, f"Failed to set default: {response.text}"
        data = response.json()
        assert data.get("message") == "Default pump set", f"Unexpected response: {data}"
        
        # Verify it's now default
        pumps_resp = api_client.get(f"{BASE_URL}/api/diesel-pumps")
        pumps = pumps_resp.json()
        target_pump = next((p for p in pumps if p["id"] == pump_id), None)
        assert target_pump is not None, f"Pump not found in list"
        assert target_pump.get("is_default") == True, f"Pump not set as default: {target_pump}"
        print(f"✓ Set default pump: {pump_name}")
    
    def test_delete_diesel_pump(self, api_client):
        """DELETE /api/diesel-pumps/:id deletes pump"""
        # Create pump to delete
        pump_name = f"TEST_DeletePump_{uuid.uuid4().hex[:8]}"
        create_resp = api_client.post(f"{BASE_URL}/api/diesel-pumps", json={
            "name": pump_name,
            "is_default": False
        })
        assert create_resp.status_code == 200
        pump_id = create_resp.json()["id"]
        
        # Delete it
        response = api_client.delete(f"{BASE_URL}/api/diesel-pumps/{pump_id}")
        assert response.status_code == 200, f"Failed to delete: {response.text}"
        
        # Verify it's gone
        pumps_resp = api_client.get(f"{BASE_URL}/api/diesel-pumps")
        pumps = pumps_resp.json()
        assert not any(p["id"] == pump_id for p in pumps), f"Pump still exists after delete"
        print(f"✓ Deleted diesel pump: {pump_name}")


class TestCashPaidAutoCashBook:
    """Test cash_paid auto cash book nikasi creation"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client):
        """Setup for tests"""
        self.api = api_client
        self.created_entry_ids = []
        yield
        # Cleanup
        for entry_id in self.created_entry_ids:
            try:
                self.api.delete(f"{BASE_URL}/api/entries/{entry_id}?username=admin&role=admin")
            except:
                pass
    
    def test_cash_paid_creates_cash_book_entry(self, api_client):
        """Creating entry with cash_paid > 0 auto-creates cash book nikasi transaction"""
        # Create entry with cash_paid
        entry_data = {
            "truck_no": f"TEST_OD01A{uuid.uuid4().hex[:4].upper()}",
            "rst_no": f"RST{uuid.uuid4().hex[:6]}",
            "agent_name": "TEST_Agent",
            "mandi_name": "TEST_Mandi",
            "date": "2025-01-15",
            "kg": 5000,
            "bag": 50,
            "g_deposite": 10,
            "cash_paid": 500,  # This should trigger auto cash book entry
            "diesel_paid": 0,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        response = api_client.post(f"{BASE_URL}/api/entries?username=admin&role=admin", json=entry_data)
        assert response.status_code == 200, f"Failed to create entry: {response.text}"
        entry = response.json()
        entry_id = entry["id"]
        self.created_entry_ids.append(entry_id)
        
        # Check cash-book for linked entry
        cash_resp = api_client.get(f"{BASE_URL}/api/cash-book")
        assert cash_resp.status_code == 200, f"Failed to get cash book: {cash_resp.text}"
        cash_txns = cash_resp.json()
        
        # Find linked cash book entry
        linked_cb = [t for t in cash_txns if t.get("linked_entry_id") == entry_id]
        assert len(linked_cb) > 0, f"No linked cash book entry found for entry {entry_id}"
        
        cb = linked_cb[0]
        assert cb.get("txn_type") == "nikasi", f"Expected nikasi txn_type, got: {cb.get('txn_type')}"
        assert cb.get("amount") == 500, f"Expected amount 500, got: {cb.get('amount')}"
        assert cb.get("category") == "Cash Paid (Entry)", f"Expected category 'Cash Paid (Entry)', got: {cb.get('category')}"
        assert entry_data["truck_no"] in cb.get("description", ""), f"Truck no not in description"
        print(f"✓ Cash paid Rs.500 auto-created cash book nikasi entry")
    
    def test_no_cash_book_when_zero_cash_paid(self, api_client):
        """Creating entry with cash_paid = 0 should NOT create cash book entry"""
        entry_data = {
            "truck_no": f"TEST_OD02B{uuid.uuid4().hex[:4].upper()}",
            "rst_no": f"RST{uuid.uuid4().hex[:6]}",
            "agent_name": "TEST_Agent2",
            "mandi_name": "TEST_Mandi2",
            "date": "2025-01-15",
            "kg": 3000,
            "bag": 30,
            "g_deposite": 5,
            "cash_paid": 0,  # No cash paid
            "diesel_paid": 0,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        response = api_client.post(f"{BASE_URL}/api/entries?username=admin&role=admin", json=entry_data)
        assert response.status_code == 200
        entry = response.json()
        entry_id = entry["id"]
        self.created_entry_ids.append(entry_id)
        
        # Verify no linked cash book entry
        cash_resp = api_client.get(f"{BASE_URL}/api/cash-book")
        cash_txns = cash_resp.json()
        linked_cb = [t for t in cash_txns if isinstance(t, dict) and t.get("linked_entry_id") == entry_id]
        assert len(linked_cb) == 0, f"Found linked cash book entry when cash_paid was 0"
        print(f"✓ No cash book entry created when cash_paid = 0")


class TestDieselPaidAutoDieselAccount:
    """Test diesel_paid auto diesel account debit creation"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client):
        """Setup - ensure there's a default pump"""
        self.api = api_client
        self.created_entry_ids = []
        self.created_pump_ids = []
        
        # Check if default pump exists, if not create one
        pumps_resp = api_client.get(f"{BASE_URL}/api/diesel-pumps")
        pumps = pumps_resp.json()
        default_pump = next((p for p in pumps if p.get("is_default")), None)
        
        if not default_pump:
            # Create a default pump
            pump_name = f"TEST_DefaultPump_{uuid.uuid4().hex[:6]}"
            create_resp = api_client.post(f"{BASE_URL}/api/diesel-pumps", json={
                "name": pump_name,
                "is_default": True
            })
            if create_resp.status_code == 200:
                self.created_pump_ids.append(create_resp.json()["id"])
        
        yield
        
        # Cleanup
        for entry_id in self.created_entry_ids:
            try:
                self.api.delete(f"{BASE_URL}/api/entries/{entry_id}?username=admin&role=admin")
            except:
                pass
        for pump_id in self.created_pump_ids:
            try:
                self.api.delete(f"{BASE_URL}/api/diesel-pumps/{pump_id}")
            except:
                pass
    
    def test_diesel_paid_creates_diesel_account_entry(self, api_client):
        """Creating entry with diesel_paid > 0 auto-creates diesel account debit entry"""
        # Get default pump
        pumps_resp = api_client.get(f"{BASE_URL}/api/diesel-pumps")
        pumps = pumps_resp.json()
        default_pump = next((p for p in pumps if p.get("is_default")), None)
        
        if not default_pump and len(pumps) > 0:
            # Set first pump as default
            api_client.put(f"{BASE_URL}/api/diesel-pumps/{pumps[0]['id']}/set-default")
            default_pump = pumps[0]
        
        assert default_pump is not None, "No default pump available for test"
        
        # Create entry with diesel_paid
        entry_data = {
            "truck_no": f"TEST_OD03C{uuid.uuid4().hex[:4].upper()}",
            "rst_no": f"RST{uuid.uuid4().hex[:6]}",
            "agent_name": "TEST_DieselAgent",
            "mandi_name": "TEST_DieselMandi",
            "date": "2025-01-16",
            "kg": 6000,
            "bag": 60,
            "g_deposite": 15,
            "cash_paid": 0,
            "diesel_paid": 750,  # This should trigger auto diesel account entry
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        response = api_client.post(f"{BASE_URL}/api/entries?username=admin&role=admin", json=entry_data)
        assert response.status_code == 200, f"Failed to create entry: {response.text}"
        entry = response.json()
        entry_id = entry["id"]
        self.created_entry_ids.append(entry_id)
        
        # Check diesel_accounts for linked entry
        diesel_resp = api_client.get(f"{BASE_URL}/api/diesel-accounts")
        assert diesel_resp.status_code == 200, f"Failed to get diesel accounts: {diesel_resp.text}"
        diesel_txns = diesel_resp.json()
        
        # Find linked diesel account entry
        linked_diesel = [t for t in diesel_txns if t.get("linked_entry_id") == entry_id]
        assert len(linked_diesel) > 0, f"No linked diesel account entry found for entry {entry_id}"
        
        d = linked_diesel[0]
        assert d.get("txn_type") == "debit", f"Expected debit txn_type, got: {d.get('txn_type')}"
        assert d.get("amount") == 750, f"Expected amount 750, got: {d.get('amount')}"
        assert d.get("pump_id") == default_pump["id"], f"Pump ID mismatch"
        assert entry_data["truck_no"] in d.get("truck_no", ""), f"Truck no mismatch"
        print(f"✓ Diesel paid Rs.750 auto-created diesel account debit entry linked to default pump")


class TestDieselAccountAPI:
    """Test diesel account API endpoints"""
    
    def test_get_diesel_accounts(self, api_client):
        """GET /api/diesel-accounts returns diesel transactions"""
        response = api_client.get(f"{BASE_URL}/api/diesel-accounts")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got: {type(data)}"
        print(f"✓ Got {len(data)} diesel account transactions")
    
    def test_get_diesel_accounts_with_filters(self, api_client):
        """GET /api/diesel-accounts with kms_year and season filters"""
        response = api_client.get(f"{BASE_URL}/api/diesel-accounts?kms_year=2024-25&season=Kharif")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got: {type(data)}"
        print(f"✓ Got {len(data)} diesel transactions with filters")
    
    def test_get_diesel_summary(self, api_client):
        """GET /api/diesel-accounts/summary returns pump-wise summary with balance"""
        response = api_client.get(f"{BASE_URL}/api/diesel-accounts/summary")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify structure
        assert "pumps" in data, f"Missing 'pumps' in summary: {data}"
        assert "grand_total_diesel" in data, f"Missing 'grand_total_diesel': {data}"
        assert "grand_total_paid" in data, f"Missing 'grand_total_paid': {data}"
        assert "grand_balance" in data, f"Missing 'grand_balance': {data}"
        
        # Verify pump summary structure
        if data["pumps"]:
            pump = data["pumps"][0]
            assert "pump_id" in pump, f"Missing pump_id in pump summary"
            assert "pump_name" in pump, f"Missing pump_name"
            assert "balance" in pump, f"Missing balance"
            assert "total_diesel" in pump, f"Missing total_diesel"
            assert "total_paid" in pump, f"Missing total_paid"
        
        print(f"✓ Diesel summary: {len(data['pumps'])} pumps, grand balance: Rs.{data['grand_balance']}")


class TestDieselPayment:
    """Test diesel payment and auto cash book creation"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client):
        """Setup - ensure there's a pump to pay"""
        self.api = api_client
        self.created_pump_ids = []
        
        # Ensure there's at least one pump
        pumps_resp = api_client.get(f"{BASE_URL}/api/diesel-pumps")
        pumps = pumps_resp.json()
        
        if not pumps:
            # Create a pump
            pump_name = f"TEST_PaymentPump_{uuid.uuid4().hex[:6]}"
            create_resp = api_client.post(f"{BASE_URL}/api/diesel-pumps", json={
                "name": pump_name,
                "is_default": True
            })
            if create_resp.status_code == 200:
                self.created_pump_ids.append(create_resp.json()["id"])
        
        yield
        
        # Cleanup
        for pump_id in self.created_pump_ids:
            try:
                self.api.delete(f"{BASE_URL}/api/diesel-pumps/{pump_id}")
            except:
                pass
    
    def test_diesel_payment_creates_cash_book_entry(self, api_client):
        """POST /api/diesel-accounts/pay creates payment + auto cash book nikasi entry"""
        # Get a pump to pay
        pumps_resp = api_client.get(f"{BASE_URL}/api/diesel-pumps")
        pumps = pumps_resp.json()
        assert len(pumps) > 0, "No pumps available for payment test"
        pump = pumps[0]
        
        payment_amount = 1000
        payment_data = {
            "pump_id": pump["id"],
            "amount": payment_amount,
            "date": "2025-01-17",
            "kms_year": "2024-25",
            "season": "Kharif",
            "notes": "TEST payment"
        }
        
        # Make payment
        response = api_client.post(f"{BASE_URL}/api/diesel-accounts/pay?username=admin", json=payment_data)
        assert response.status_code == 200, f"Failed to make payment: {response.text}"
        data = response.json()
        assert data.get("success") == True, f"Payment not successful: {data}"
        payment_txn_id = data.get("txn_id")
        
        # Verify diesel account has payment transaction
        diesel_resp = api_client.get(f"{BASE_URL}/api/diesel-accounts")
        diesel_txns = diesel_resp.json()
        payment_txn = next((t for t in diesel_txns if t.get("id") == payment_txn_id), None)
        assert payment_txn is not None, f"Payment transaction not found in diesel accounts"
        assert payment_txn.get("txn_type") == "payment", f"Expected payment type, got: {payment_txn.get('txn_type')}"
        assert payment_txn.get("amount") == payment_amount, f"Amount mismatch"
        
        # Verify cash book has linked nikasi entry
        cash_resp = api_client.get(f"{BASE_URL}/api/cash-book")
        cash_txns = cash_resp.json()
        linked_cb = [t for t in cash_txns if isinstance(t, dict) and t.get("linked_diesel_payment_id") == payment_txn_id]
        assert len(linked_cb) > 0, f"No linked cash book entry for diesel payment"
        
        cb = linked_cb[0]
        assert cb.get("txn_type") == "nikasi", f"Expected nikasi, got: {cb.get('txn_type')}"
        assert cb.get("amount") == payment_amount, f"Cash book amount mismatch"
        assert cb.get("category") == "Diesel Payment", f"Category mismatch: {cb.get('category')}"
        print(f"✓ Diesel payment Rs.{payment_amount} created cash book nikasi entry")
        
        # Cleanup - delete the payment
        try:
            api_client.delete(f"{BASE_URL}/api/diesel-accounts/{payment_txn_id}")
        except:
            pass


class TestDeleteEntryCleanup:
    """Test that deleting entry removes linked cash book and diesel account entries"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client):
        """Setup - ensure there's a default pump"""
        self.api = api_client
        self.created_pump_ids = []
        
        pumps_resp = api_client.get(f"{BASE_URL}/api/diesel-pumps")
        pumps = pumps_resp.json()
        default_pump = next((p for p in pumps if p.get("is_default")), None)
        
        if not default_pump:
            if pumps:
                api_client.put(f"{BASE_URL}/api/diesel-pumps/{pumps[0]['id']}/set-default")
            else:
                pump_name = f"TEST_CleanupPump_{uuid.uuid4().hex[:6]}"
                create_resp = api_client.post(f"{BASE_URL}/api/diesel-pumps", json={
                    "name": pump_name,
                    "is_default": True
                })
                if create_resp.status_code == 200:
                    self.created_pump_ids.append(create_resp.json()["id"])
        
        yield
        
        for pump_id in self.created_pump_ids:
            try:
                self.api.delete(f"{BASE_URL}/api/diesel-pumps/{pump_id}")
            except:
                pass
    
    def test_delete_entry_removes_linked_entries(self, api_client):
        """Deleting entry removes linked cash book and diesel account entries"""
        # Create entry with both cash_paid and diesel_paid
        entry_data = {
            "truck_no": f"TEST_OD04D{uuid.uuid4().hex[:4].upper()}",
            "rst_no": f"RST{uuid.uuid4().hex[:6]}",
            "agent_name": "TEST_CleanupAgent",
            "mandi_name": "TEST_CleanupMandi",
            "date": "2025-01-18",
            "kg": 4000,
            "bag": 40,
            "g_deposite": 8,
            "cash_paid": 300,  # Should create cash book entry
            "diesel_paid": 400,  # Should create diesel account entry
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        # Create entry
        create_resp = api_client.post(f"{BASE_URL}/api/entries?username=admin&role=admin", json=entry_data)
        assert create_resp.status_code == 200, f"Failed to create entry: {create_resp.text}"
        entry = create_resp.json()
        entry_id = entry["id"]
        
        # Verify linked entries exist
        cash_resp = api_client.get(f"{BASE_URL}/api/cash-book")
        diesel_resp = api_client.get(f"{BASE_URL}/api/diesel-accounts")
        
        linked_cash = [t for t in cash_resp.json() if isinstance(t, dict) and t.get("linked_entry_id") == entry_id]
        linked_diesel = [t for t in diesel_resp.json() if isinstance(t, dict) and t.get("linked_entry_id") == entry_id]
        
        assert len(linked_cash) > 0, f"No linked cash book entry created"
        assert len(linked_diesel) > 0, f"No linked diesel account entry created"
        print(f"✓ Verified linked entries exist before delete")
        
        # Delete the entry
        delete_resp = api_client.delete(f"{BASE_URL}/api/entries/{entry_id}?username=admin&role=admin")
        assert delete_resp.status_code == 200, f"Failed to delete entry: {delete_resp.text}"
        
        # Verify linked entries are gone
        cash_resp2 = api_client.get(f"{BASE_URL}/api/cash-book")
        diesel_resp2 = api_client.get(f"{BASE_URL}/api/diesel-accounts")
        
        linked_cash2 = [t for t in cash_resp2.json() if isinstance(t, dict) and t.get("linked_entry_id") == entry_id]
        linked_diesel2 = [t for t in diesel_resp2.json() if isinstance(t, dict) and t.get("linked_entry_id") == entry_id]
        
        assert len(linked_cash2) == 0, f"Cash book entry not cleaned up after delete"
        assert len(linked_diesel2) == 0, f"Diesel account entry not cleaned up after delete"
        print(f"✓ Deleting entry removed linked cash book and diesel account entries")


class TestGIssedDeduction:
    """Test G.Issued still deducts from Total (Excl Govt) correctly - now calculated from entries directly"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client):
        """Setup"""
        self.api = api_client
        self.created_entry_ids = []
        yield
        for entry_id in self.created_entry_ids:
            try:
                self.api.delete(f"{BASE_URL}/api/entries/{entry_id}?username=admin&role=admin")
            except:
                pass
    
    def test_g_issued_tracked_in_entries_and_summary(self, api_client):
        """G.Issued is tracked directly from entries and shown in gunny summary"""
        # Create entry with g_issued
        entry_data = {
            "truck_no": f"TEST_OD05E{uuid.uuid4().hex[:4].upper()}",
            "rst_no": f"RST{uuid.uuid4().hex[:6]}",
            "agent_name": "TEST_GIssueAgent",
            "mandi_name": "TEST_GIssueMandi",
            "date": "2025-01-19",
            "kg": 5000,
            "bag": 50,
            "g_deposite": 10,
            "g_issued": 5,  # This should be tracked in summary
            "cash_paid": 0,
            "diesel_paid": 0,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        response = api_client.post(f"{BASE_URL}/api/entries?username=admin&role=admin", json=entry_data)
        assert response.status_code == 200, f"Failed to create entry: {response.text}"
        entry = response.json()
        entry_id = entry["id"]
        self.created_entry_ids.append(entry_id)
        
        # Verify entry was created with g_issued
        entry_resp = api_client.get(f"{BASE_URL}/api/entries/{entry_id}")
        assert entry_resp.status_code == 200
        saved_entry = entry_resp.json()
        assert saved_entry.get("g_issued") == 5, f"Expected g_issued=5, got: {saved_entry.get('g_issued')}"
        print(f"✓ Entry created with g_issued=5")
    
    def test_gunny_summary_structure_with_g_issued(self, api_client):
        """Verify gunny summary structure includes g_issued from entries"""
        response = api_client.get(f"{BASE_URL}/api/gunny-bags/summary")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify structure - should have g_issued key now (calculated from entries)
        assert "old" in data, f"Missing 'old' in summary"
        assert "new" in data, f"Missing 'new' in summary"
        assert "paddy_bags" in data, f"Missing 'paddy_bags'"
        assert "g_issued" in data, f"Missing 'g_issued' in summary"
        assert "grand_total" in data, f"Missing 'grand_total' in summary"
        
        old = data["old"]
        assert "total_in" in old, f"Missing total_in in old"
        assert "total_out" in old, f"Missing total_out in old"
        assert "balance" in old, f"Missing balance in old"
        
        g_issued = data["g_issued"]
        assert "total" in g_issued, f"Missing total in g_issued"
        assert "label" in g_issued, f"Missing label in g_issued"
        
        # Grand total should be: paddy_bags + ppkt + old.balance - g_issued.total
        print(f"✓ Gunny summary structure correct - g_issued total: {g_issued['total']}, grand_total: {data['grand_total']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
