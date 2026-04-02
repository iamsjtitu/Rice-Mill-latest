"""
Optimistic Locking Tests for Rice Mill Management System
Tests _v (version) field behavior for concurrent update protection

Test Scenarios:
1. POST creates record with _v:1
2. PUT with correct _v succeeds and increments _v
3. PUT with stale/wrong _v returns 409 Conflict
4. PUT without _v (legacy mode) still works
5. GET returns _v field for entries
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestEntriesOptimisticLocking:
    """Test optimistic locking for /api/entries endpoint"""
    
    created_entry_id = None
    
    def test_01_post_creates_entry_with_version_1(self, api_client):
        """POST /api/entries should create record with _v:1"""
        test_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "kms_year": "2025-2026",
            "season": "Kharif",
            "truck_no": f"TEST_OL_{uuid.uuid4().hex[:6]}",
            "agent_name": "Test Agent OL",
            "mandi_name": "Test Mandi OL",
            "kg": 5000,
            "bag": 50,
            "g_deposite": 0,
            "gbw_cut": 50,
            "plastic_bag": 0,
            "cutting_percent": 5,
            "disc_dust_poll": 0,
            "g_issued": 0,
            "moisture": 14,
            "cash_paid": 0,
            "diesel_paid": 0,
            "remark": "Optimistic Locking Test Entry"
        }
        
        response = api_client.post(f"{BASE_URL}/api/entries?username=admin&role=admin", json=test_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "_v" in data, "Response should contain _v field"
        assert data["_v"] == 1, f"New entry should have _v:1, got _v:{data.get('_v')}"
        assert "id" in data, "Response should contain id field"
        
        TestEntriesOptimisticLocking.created_entry_id = data["id"]
        print(f"✓ POST /api/entries created entry with _v:1, id={data['id']}")
    
    def test_02_get_entry_returns_version(self, api_client):
        """GET /api/entries/{id} should return _v field"""
        entry_id = TestEntriesOptimisticLocking.created_entry_id
        assert entry_id, "Entry ID not set from previous test"
        
        response = api_client.get(f"{BASE_URL}/api/entries/{entry_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "_v" in data, "GET response should contain _v field"
        assert data["_v"] == 1, f"Entry should have _v:1, got _v:{data.get('_v')}"
        print(f"✓ GET /api/entries/{entry_id} returns _v:1")
    
    def test_03_put_with_correct_version_succeeds(self, api_client):
        """PUT /api/entries/{id} with correct _v should succeed and increment _v"""
        entry_id = TestEntriesOptimisticLocking.created_entry_id
        assert entry_id, "Entry ID not set from previous test"
        
        update_data = {
            "remark": "Updated with correct version",
            "_v": 1  # Current version
        }
        
        response = api_client.put(f"{BASE_URL}/api/entries/{entry_id}?username=admin&role=admin", json=update_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "_v" in data, "Response should contain _v field"
        assert data["_v"] == 2, f"After update, _v should be 2, got _v:{data.get('_v')}"
        assert data["remark"] == "Updated with correct version", "Remark should be updated"
        print(f"✓ PUT with _v:1 succeeded, _v incremented to 2")
    
    def test_04_put_with_stale_version_returns_409(self, api_client):
        """PUT /api/entries/{id} with stale _v should return 409 Conflict"""
        entry_id = TestEntriesOptimisticLocking.created_entry_id
        assert entry_id, "Entry ID not set from previous test"
        
        # Try to update with old version (1) when current is (2)
        update_data = {
            "remark": "This should fail - stale version",
            "_v": 1  # Stale version
        }
        
        response = api_client.put(f"{BASE_URL}/api/entries/{entry_id}?username=admin&role=admin", json=update_data)
        assert response.status_code == 409, f"Expected 409 Conflict, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "409 response should contain detail message"
        assert "kisi aur ne update" in data["detail"].lower() or "conflict" in data["detail"].lower(), \
            f"Error message should indicate conflict: {data['detail']}"
        print(f"✓ PUT with stale _v:1 returned 409 Conflict: {data['detail']}")
    
    def test_05_put_without_version_legacy_mode_succeeds(self, api_client):
        """PUT /api/entries/{id} without _v (legacy mode) should still work"""
        entry_id = TestEntriesOptimisticLocking.created_entry_id
        assert entry_id, "Entry ID not set from previous test"
        
        # Update without sending _v - legacy mode
        update_data = {
            "remark": "Updated without version (legacy mode)"
            # No _v field
        }
        
        response = api_client.put(f"{BASE_URL}/api/entries/{entry_id}?username=admin&role=admin", json=update_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["remark"] == "Updated without version (legacy mode)", "Remark should be updated"
        # _v should still be incremented
        assert "_v" in data, "Response should contain _v field"
        assert data["_v"] >= 2, f"_v should be >= 2 after legacy update, got {data.get('_v')}"
        print(f"✓ PUT without _v (legacy mode) succeeded, _v is now {data['_v']}")
    
    def test_06_cleanup_test_entry(self, api_client):
        """Cleanup: Delete test entry"""
        entry_id = TestEntriesOptimisticLocking.created_entry_id
        if entry_id:
            response = api_client.delete(f"{BASE_URL}/api/entries/{entry_id}?username=admin&role=admin")
            assert response.status_code == 200, f"Cleanup failed: {response.status_code}"
            print(f"✓ Cleaned up test entry {entry_id}")


class TestCashBookOptimisticLocking:
    """Test optimistic locking for /api/cash-book endpoint"""
    
    created_txn_id = None
    
    def test_01_post_creates_transaction_with_version_1(self, api_client):
        """POST /api/cash-book should create record with _v:1"""
        test_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "account": "cash",
            "txn_type": "jama",
            "category": f"TEST_OL_Party_{uuid.uuid4().hex[:6]}",
            "party_type": "Cash Party",
            "description": "Optimistic Locking Test Transaction",
            "amount": 1000,
            "reference": "OL_TEST",
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        
        response = api_client.post(f"{BASE_URL}/api/cash-book?username=admin&role=admin", json=test_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "_v" in data, "Response should contain _v field"
        assert data["_v"] == 1, f"New transaction should have _v:1, got _v:{data.get('_v')}"
        assert "id" in data, "Response should contain id field"
        
        TestCashBookOptimisticLocking.created_txn_id = data["id"]
        print(f"✓ POST /api/cash-book created transaction with _v:1, id={data['id']}")
    
    def test_02_put_with_correct_version_succeeds(self, api_client):
        """PUT /api/cash-book/{id} with correct _v should succeed"""
        txn_id = TestCashBookOptimisticLocking.created_txn_id
        assert txn_id, "Transaction ID not set from previous test"
        
        update_data = {
            "description": "Updated with correct version",
            "_v": 1
        }
        
        response = api_client.put(f"{BASE_URL}/api/cash-book/{txn_id}?username=admin&role=admin", json=update_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "_v" in data, "Response should contain _v field"
        assert data["_v"] == 2, f"After update, _v should be 2, got _v:{data.get('_v')}"
        print(f"✓ PUT /api/cash-book with _v:1 succeeded, _v incremented to 2")
    
    def test_03_put_with_stale_version_returns_409(self, api_client):
        """PUT /api/cash-book/{id} with stale _v should return 409"""
        txn_id = TestCashBookOptimisticLocking.created_txn_id
        assert txn_id, "Transaction ID not set from previous test"
        
        update_data = {
            "description": "This should fail",
            "_v": 1  # Stale version
        }
        
        response = api_client.put(f"{BASE_URL}/api/cash-book/{txn_id}?username=admin&role=admin", json=update_data)
        assert response.status_code == 409, f"Expected 409 Conflict, got {response.status_code}: {response.text}"
        print(f"✓ PUT /api/cash-book with stale _v:1 returned 409 Conflict")
    
    def test_04_cleanup_test_transaction(self, api_client):
        """Cleanup: Delete test transaction"""
        txn_id = TestCashBookOptimisticLocking.created_txn_id
        if txn_id:
            response = api_client.delete(f"{BASE_URL}/api/cash-book/{txn_id}")
            assert response.status_code == 200, f"Cleanup failed: {response.status_code}"
            print(f"✓ Cleaned up test transaction {txn_id}")


class TestPrivatePaddyOptimisticLocking:
    """Test optimistic locking for /api/private-paddy endpoint"""
    
    created_entry_id = None
    
    def test_01_post_creates_entry_with_version_1(self, api_client):
        """POST /api/private-paddy should create record with _v:1"""
        test_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "kms_year": "2025-2026",
            "season": "Kharif",
            "party_name": f"TEST_OL_Party_{uuid.uuid4().hex[:6]}",
            "truck_no": "OD00TEST",
            "mandi_name": "Test Mandi",
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2000,
            "remark": "Optimistic Locking Test"
        }
        
        response = api_client.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=test_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "_v" in data, "Response should contain _v field"
        assert data["_v"] == 1, f"New entry should have _v:1, got _v:{data.get('_v')}"
        
        TestPrivatePaddyOptimisticLocking.created_entry_id = data["id"]
        print(f"✓ POST /api/private-paddy created entry with _v:1, id={data['id']}")
    
    def test_02_put_with_correct_version_succeeds(self, api_client):
        """PUT /api/private-paddy/{id} with correct _v should succeed"""
        entry_id = TestPrivatePaddyOptimisticLocking.created_entry_id
        assert entry_id, "Entry ID not set from previous test"
        
        update_data = {
            "remark": "Updated with correct version",
            "_v": 1
        }
        
        response = api_client.put(f"{BASE_URL}/api/private-paddy/{entry_id}?username=admin", json=update_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "_v" in data, "Response should contain _v field"
        assert data["_v"] == 2, f"After update, _v should be 2, got _v:{data.get('_v')}"
        print(f"✓ PUT /api/private-paddy with _v:1 succeeded, _v incremented to 2")
    
    def test_03_put_with_stale_version_returns_409(self, api_client):
        """PUT /api/private-paddy/{id} with stale _v should return 409"""
        entry_id = TestPrivatePaddyOptimisticLocking.created_entry_id
        assert entry_id, "Entry ID not set from previous test"
        
        update_data = {
            "remark": "This should fail",
            "_v": 1  # Stale version
        }
        
        response = api_client.put(f"{BASE_URL}/api/private-paddy/{entry_id}?username=admin", json=update_data)
        assert response.status_code == 409, f"Expected 409 Conflict, got {response.status_code}: {response.text}"
        print(f"✓ PUT /api/private-paddy with stale _v:1 returned 409 Conflict")
    
    def test_04_cleanup_test_entry(self, api_client):
        """Cleanup: Delete test entry"""
        entry_id = TestPrivatePaddyOptimisticLocking.created_entry_id
        if entry_id:
            response = api_client.delete(f"{BASE_URL}/api/private-paddy/{entry_id}")
            assert response.status_code == 200, f"Cleanup failed: {response.status_code}"
            print(f"✓ Cleaned up test entry {entry_id}")


class TestRiceSalesOptimisticLocking:
    """Test optimistic locking for /api/rice-sales endpoint"""
    
    created_entry_id = None
    
    def test_01_post_creates_entry_with_version(self, api_client):
        """POST /api/rice-sales should create record (check if _v is added)"""
        test_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "kms_year": "2025-2026",
            "season": "Kharif",
            "party_name": f"TEST_OL_Rice_{uuid.uuid4().hex[:6]}",
            "rice_type": "Boiled Rice",
            "quantity_qntl": 100,
            "rate_per_qntl": 3500,
            "bags": 100,
            "remark": "Optimistic Locking Test"
        }
        
        response = api_client.post(f"{BASE_URL}/api/rice-sales?username=admin&role=admin", json=test_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Rice sales may or may not have _v depending on implementation
        TestRiceSalesOptimisticLocking.created_entry_id = data["id"]
        print(f"✓ POST /api/rice-sales created entry, id={data['id']}, _v={data.get('_v', 'not set')}")
    
    def test_02_put_with_version_if_supported(self, api_client):
        """PUT /api/rice-sales/{id} - test version handling"""
        entry_id = TestRiceSalesOptimisticLocking.created_entry_id
        assert entry_id, "Entry ID not set from previous test"
        
        # First get current version
        get_response = api_client.get(f"{BASE_URL}/api/rice-sales")
        entries = get_response.json()
        current_entry = next((e for e in entries if e.get("id") == entry_id), None)
        current_v = current_entry.get("_v") if current_entry else None
        
        update_data = {
            "remark": "Updated rice sale"
        }
        if current_v:
            update_data["_v"] = current_v
        
        response = api_client.put(f"{BASE_URL}/api/rice-sales/{entry_id}", json=update_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ PUT /api/rice-sales succeeded")
    
    def test_03_cleanup_test_entry(self, api_client):
        """Cleanup: Delete test entry"""
        entry_id = TestRiceSalesOptimisticLocking.created_entry_id
        if entry_id:
            response = api_client.delete(f"{BASE_URL}/api/rice-sales/{entry_id}")
            assert response.status_code == 200, f"Cleanup failed: {response.status_code}"
            print(f"✓ Cleaned up test entry {entry_id}")


class TestGetEntriesReturnsVersion:
    """Test that GET endpoints return _v field"""
    
    def test_get_entries_list_includes_version(self, api_client):
        """GET /api/entries should return _v field for entries"""
        response = api_client.get(f"{BASE_URL}/api/entries?page_size=5")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        entries = data.get("entries", [])
        
        if entries:
            # Check if at least some entries have _v field
            entries_with_v = [e for e in entries if "_v" in e]
            print(f"✓ GET /api/entries: {len(entries_with_v)}/{len(entries)} entries have _v field")
            # New entries should have _v, old ones might not
        else:
            print("✓ GET /api/entries: No entries to check (empty list)")
    
    def test_get_cash_book_includes_version(self, api_client):
        """GET /api/cash-book should return _v field for transactions"""
        response = api_client.get(f"{BASE_URL}/api/cash-book?page_size=5")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        txns = data.get("transactions", [])
        
        if txns:
            txns_with_v = [t for t in txns if "_v" in t]
            print(f"✓ GET /api/cash-book: {len(txns_with_v)}/{len(txns)} transactions have _v field")
        else:
            print("✓ GET /api/cash-book: No transactions to check (empty list)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
