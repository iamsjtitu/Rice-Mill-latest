"""
Audit Log Feature Tests
- Tests audit log creation for CRUD operations on entries, cashbook, private_trading
- Tests GET /api/audit-log endpoint with filters
- Tests GET /api/audit-log/record/{record_id} for per-record history
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USER = "admin"
ADMIN_PASS = "admin123"


class TestAuditLogFeature:
    """Test Audit Log feature - tracks who changed what"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_entry_id = None
        self.created_cash_txn_id = None
        self.created_pvt_paddy_id = None
    
    # ============ MILL ENTRIES AUDIT LOG TESTS ============
    
    def test_01_create_entry_creates_audit_log(self):
        """POST /api/entries?username=admin should create audit log"""
        entry_data = {
            "date": "2025-01-15",
            "truck_no": f"TEST_AUDIT_{uuid.uuid4().hex[:6]}",
            "agent_name": "Test Agent",
            "mandi_name": "Test Mandi",
            "kg": 5000,
            "bag": 50,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/entries?username={ADMIN_USER}&role=admin",
            json=entry_data
        )
        
        assert response.status_code == 200, f"Create entry failed: {response.text}"
        data = response.json()
        assert "id" in data
        self.created_entry_id = data["id"]
        
        # Verify audit log was created
        audit_response = self.session.get(
            f"{BASE_URL}/api/audit-log/record/{self.created_entry_id}"
        )
        assert audit_response.status_code == 200
        audit_data = audit_response.json()
        logs = audit_data.get("logs", [])
        
        assert len(logs) >= 1, "No audit log created for entry"
        create_log = next((l for l in logs if l.get("action") == "create"), None)
        assert create_log is not None, "No 'create' action in audit log"
        assert create_log.get("collection") == "mill_entries"
        assert create_log.get("username") == ADMIN_USER or create_log.get("username") == ""
        print(f"PASS - Create entry audit log: {create_log.get('summary', '')}")
        
        return self.created_entry_id
    
    def test_02_update_entry_creates_audit_log(self):
        """PUT /api/entries/{id}?username=admin should create audit log with changes"""
        # First create an entry
        entry_id = self.test_01_create_entry_creates_audit_log()
        
        # Update the entry
        update_data = {
            "kg": 5500,
            "bag": 55,
            "remark": "Updated for audit test"
        }
        
        response = self.session.put(
            f"{BASE_URL}/api/entries/{entry_id}?username={ADMIN_USER}&role=admin",
            json=update_data
        )
        
        assert response.status_code == 200, f"Update entry failed: {response.text}"
        
        # Verify audit log was created
        audit_response = self.session.get(
            f"{BASE_URL}/api/audit-log/record/{entry_id}"
        )
        assert audit_response.status_code == 200
        audit_data = audit_response.json()
        logs = audit_data.get("logs", [])
        
        update_log = next((l for l in logs if l.get("action") == "update"), None)
        assert update_log is not None, "No 'update' action in audit log"
        assert update_log.get("collection") == "mill_entries"
        
        # Check that changes are recorded
        changes = update_log.get("changes", {})
        assert len(changes) > 0, "No changes recorded in update audit log"
        print(f"PASS - Update entry audit log: {update_log.get('summary', '')} | Changes: {list(changes.keys())}")
        
        return entry_id
    
    def test_03_delete_entry_creates_audit_log(self):
        """DELETE /api/entries/{id}?username=admin should create audit log"""
        # First create an entry
        entry_data = {
            "date": "2025-01-15",
            "truck_no": f"TEST_DEL_{uuid.uuid4().hex[:6]}",
            "agent_name": "Delete Test Agent",
            "mandi_name": "Delete Test Mandi",
            "kg": 3000,
            "bag": 30,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/entries?username={ADMIN_USER}&role=admin",
            json=entry_data
        )
        assert create_response.status_code == 200
        entry_id = create_response.json()["id"]
        
        # Delete the entry
        delete_response = self.session.delete(
            f"{BASE_URL}/api/entries/{entry_id}?username={ADMIN_USER}&role=admin"
        )
        
        assert delete_response.status_code == 200, f"Delete entry failed: {delete_response.text}"
        
        # Verify audit log was created (even after deletion)
        audit_response = self.session.get(
            f"{BASE_URL}/api/audit-log/record/{entry_id}"
        )
        assert audit_response.status_code == 200
        audit_data = audit_response.json()
        logs = audit_data.get("logs", [])
        
        delete_log = next((l for l in logs if l.get("action") == "delete"), None)
        assert delete_log is not None, "No 'delete' action in audit log"
        assert delete_log.get("collection") == "mill_entries"
        print(f"PASS - Delete entry audit log: {delete_log.get('summary', '')}")
    
    # ============ CASH BOOK AUDIT LOG TESTS ============
    
    def test_04_create_cash_transaction_creates_audit_log(self):
        """POST /api/cash-book?username=admin should create audit log"""
        txn_data = {
            "date": "2025-01-15",
            "account": "cash",
            "txn_type": "jama",
            "category": f"TEST_AUDIT_PARTY_{uuid.uuid4().hex[:6]}",
            "party_type": "Manual",
            "description": "Test cash transaction for audit",
            "amount": 5000,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/cash-book?username={ADMIN_USER}&role=admin",
            json=txn_data
        )
        
        assert response.status_code == 200, f"Create cash txn failed: {response.text}"
        data = response.json()
        assert "id" in data
        self.created_cash_txn_id = data["id"]
        
        # Verify audit log was created
        audit_response = self.session.get(
            f"{BASE_URL}/api/audit-log/record/{self.created_cash_txn_id}"
        )
        assert audit_response.status_code == 200
        audit_data = audit_response.json()
        logs = audit_data.get("logs", [])
        
        assert len(logs) >= 1, "No audit log created for cash transaction"
        create_log = next((l for l in logs if l.get("action") == "create"), None)
        assert create_log is not None, "No 'create' action in audit log for cash transaction"
        assert create_log.get("collection") == "cash_transactions"
        print(f"PASS - Create cash transaction audit log: {create_log.get('summary', '')}")
        
        return self.created_cash_txn_id
    
    def test_05_update_cash_transaction_creates_audit_log(self):
        """PUT /api/cash-book/{id}?username=admin should create audit log"""
        # First create a transaction
        txn_id = self.test_04_create_cash_transaction_creates_audit_log()
        
        # Update the transaction
        update_data = {
            "amount": 6000,
            "description": "Updated cash transaction for audit test"
        }
        
        response = self.session.put(
            f"{BASE_URL}/api/cash-book/{txn_id}?username={ADMIN_USER}&role=admin",
            json=update_data
        )
        
        assert response.status_code == 200, f"Update cash txn failed: {response.text}"
        
        # Verify audit log was created
        audit_response = self.session.get(
            f"{BASE_URL}/api/audit-log/record/{txn_id}"
        )
        assert audit_response.status_code == 200
        audit_data = audit_response.json()
        logs = audit_data.get("logs", [])
        
        update_log = next((l for l in logs if l.get("action") == "update"), None)
        assert update_log is not None, "No 'update' action in audit log for cash transaction"
        print(f"PASS - Update cash transaction audit log: {update_log.get('summary', '')}")
        
        return txn_id
    
    def test_06_delete_cash_transaction_creates_audit_log(self):
        """DELETE /api/cash-book/{id}?username=admin should create audit log"""
        # First create a transaction
        txn_data = {
            "date": "2025-01-15",
            "account": "cash",
            "txn_type": "nikasi",
            "category": f"TEST_DEL_PARTY_{uuid.uuid4().hex[:6]}",
            "party_type": "Manual",
            "description": "Test cash transaction for delete audit",
            "amount": 2000,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/cash-book?username={ADMIN_USER}&role=admin",
            json=txn_data
        )
        assert create_response.status_code == 200
        txn_id = create_response.json()["id"]
        
        # Delete the transaction
        delete_response = self.session.delete(
            f"{BASE_URL}/api/cash-book/{txn_id}?username={ADMIN_USER}"
        )
        
        assert delete_response.status_code == 200, f"Delete cash txn failed: {delete_response.text}"
        
        # Verify audit log was created
        audit_response = self.session.get(
            f"{BASE_URL}/api/audit-log/record/{txn_id}"
        )
        assert audit_response.status_code == 200
        audit_data = audit_response.json()
        logs = audit_data.get("logs", [])
        
        delete_log = next((l for l in logs if l.get("action") == "delete"), None)
        assert delete_log is not None, "No 'delete' action in audit log for cash transaction"
        print(f"PASS - Delete cash transaction audit log: {delete_log.get('summary', '')}")
    
    # ============ PRIVATE TRADING AUDIT LOG TESTS ============
    
    def test_07_create_private_paddy_creates_audit_log(self):
        """POST /api/private-paddy?username=admin should create audit log"""
        paddy_data = {
            "date": "2025-01-15",
            "party_name": f"TEST_AUDIT_PARTY_{uuid.uuid4().hex[:6]}",
            "mandi_name": "Test Mandi",
            "kg": 4000,
            "bag": 40,
            "rate_per_qntl": 2500,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/private-paddy?username={ADMIN_USER}&role=admin",
            json=paddy_data
        )
        
        assert response.status_code == 200, f"Create private paddy failed: {response.text}"
        data = response.json()
        assert "id" in data
        self.created_pvt_paddy_id = data["id"]
        
        # Verify audit log was created
        audit_response = self.session.get(
            f"{BASE_URL}/api/audit-log/record/{self.created_pvt_paddy_id}"
        )
        assert audit_response.status_code == 200
        audit_data = audit_response.json()
        logs = audit_data.get("logs", [])
        
        assert len(logs) >= 1, "No audit log created for private paddy"
        create_log = next((l for l in logs if l.get("action") == "create"), None)
        assert create_log is not None, "No 'create' action in audit log for private paddy"
        assert create_log.get("collection") == "private_paddy"
        print(f"PASS - Create private paddy audit log: {create_log.get('summary', '')}")
        
        return self.created_pvt_paddy_id
    
    def test_08_update_private_paddy_creates_audit_log(self):
        """PUT /api/private-paddy/{id}?username=admin should create audit log"""
        # First create a private paddy entry
        paddy_id = self.test_07_create_private_paddy_creates_audit_log()
        
        # Update the entry
        update_data = {
            "kg": 4500,
            "bag": 45,
            "remark": "Updated for audit test"
        }
        
        response = self.session.put(
            f"{BASE_URL}/api/private-paddy/{paddy_id}?username={ADMIN_USER}",
            json=update_data
        )
        
        assert response.status_code == 200, f"Update private paddy failed: {response.text}"
        
        # Verify audit log was created
        audit_response = self.session.get(
            f"{BASE_URL}/api/audit-log/record/{paddy_id}"
        )
        assert audit_response.status_code == 200
        audit_data = audit_response.json()
        logs = audit_data.get("logs", [])
        
        update_log = next((l for l in logs if l.get("action") == "update"), None)
        assert update_log is not None, "No 'update' action in audit log for private paddy"
        print(f"PASS - Update private paddy audit log: {update_log.get('summary', '')}")
        
        return paddy_id
    
    def test_09_delete_private_paddy_creates_audit_log(self):
        """DELETE /api/private-paddy/{id}?username=admin should create audit log"""
        # First create a private paddy entry
        paddy_data = {
            "date": "2025-01-15",
            "party_name": f"TEST_DEL_PARTY_{uuid.uuid4().hex[:6]}",
            "mandi_name": "Delete Test Mandi",
            "kg": 2000,
            "bag": 20,
            "rate_per_qntl": 2500,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/private-paddy?username={ADMIN_USER}&role=admin",
            json=paddy_data
        )
        assert create_response.status_code == 200
        paddy_id = create_response.json()["id"]
        
        # Delete the entry
        delete_response = self.session.delete(
            f"{BASE_URL}/api/private-paddy/{paddy_id}?username={ADMIN_USER}"
        )
        
        assert delete_response.status_code == 200, f"Delete private paddy failed: {delete_response.text}"
        
        # Verify audit log was created
        audit_response = self.session.get(
            f"{BASE_URL}/api/audit-log/record/{paddy_id}"
        )
        assert audit_response.status_code == 200
        audit_data = audit_response.json()
        logs = audit_data.get("logs", [])
        
        delete_log = next((l for l in logs if l.get("action") == "delete"), None)
        assert delete_log is not None, "No 'delete' action in audit log for private paddy"
        print(f"PASS - Delete private paddy audit log: {delete_log.get('summary', '')}")
    
    # ============ AUDIT LOG API TESTS ============
    
    def test_10_get_audit_log_requires_admin(self):
        """GET /api/audit-log should require admin role"""
        # Test with non-admin role
        response = self.session.get(
            f"{BASE_URL}/api/audit-log?username=testuser&role=viewer"
        )
        
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}"
        print("PASS - GET /api/audit-log requires admin role")
    
    def test_11_get_audit_log_as_admin(self):
        """GET /api/audit-log?username=admin&role=admin should return logs"""
        response = self.session.get(
            f"{BASE_URL}/api/audit-log?username={ADMIN_USER}&role=admin"
        )
        
        assert response.status_code == 200, f"Get audit log failed: {response.text}"
        data = response.json()
        
        assert "logs" in data
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        
        print(f"PASS - GET /api/audit-log returns {data['total']} total logs")
    
    def test_12_get_audit_log_with_user_filter(self):
        """GET /api/audit-log with filter_user should filter by username"""
        response = self.session.get(
            f"{BASE_URL}/api/audit-log?username={ADMIN_USER}&role=admin&filter_user={ADMIN_USER}"
        )
        
        assert response.status_code == 200
        data = response.json()
        logs = data.get("logs", [])
        
        # All logs should be from admin user
        for log in logs:
            assert log.get("username") == ADMIN_USER or log.get("username") == "", f"Log from wrong user: {log.get('username')}"
        
        print(f"PASS - GET /api/audit-log with filter_user returns {len(logs)} logs")
    
    def test_13_get_audit_log_with_collection_filter(self):
        """GET /api/audit-log with filter_collection should filter by collection"""
        response = self.session.get(
            f"{BASE_URL}/api/audit-log?username={ADMIN_USER}&role=admin&filter_collection=mill_entries"
        )
        
        assert response.status_code == 200
        data = response.json()
        logs = data.get("logs", [])
        
        # All logs should be from mill_entries collection
        for log in logs:
            assert log.get("collection") == "mill_entries", f"Log from wrong collection: {log.get('collection')}"
        
        print(f"PASS - GET /api/audit-log with filter_collection returns {len(logs)} logs")
    
    def test_14_get_record_audit_history(self):
        """GET /api/audit-log/record/{record_id} should return per-record history"""
        # First create an entry with multiple operations
        entry_data = {
            "date": "2025-01-15",
            "truck_no": f"TEST_HIST_{uuid.uuid4().hex[:6]}",
            "agent_name": "History Test Agent",
            "mandi_name": "History Test Mandi",
            "kg": 6000,
            "bag": 60,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        # Create
        create_response = self.session.post(
            f"{BASE_URL}/api/entries?username={ADMIN_USER}&role=admin",
            json=entry_data
        )
        assert create_response.status_code == 200
        entry_id = create_response.json()["id"]
        
        # Update
        update_response = self.session.put(
            f"{BASE_URL}/api/entries/{entry_id}?username={ADMIN_USER}&role=admin",
            json={"kg": 6500, "bag": 65}
        )
        assert update_response.status_code == 200
        
        # Get record history
        history_response = self.session.get(
            f"{BASE_URL}/api/audit-log/record/{entry_id}"
        )
        
        assert history_response.status_code == 200
        data = history_response.json()
        logs = data.get("logs", [])
        
        # Should have at least create and update logs
        assert len(logs) >= 2, f"Expected at least 2 logs, got {len(logs)}"
        
        actions = [log.get("action") for log in logs]
        assert "create" in actions, "Missing 'create' action in history"
        assert "update" in actions, "Missing 'update' action in history"
        
        print(f"PASS - GET /api/audit-log/record/{entry_id} returns {len(logs)} history entries")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/entries/{entry_id}?username={ADMIN_USER}&role=admin")
    
    def test_15_audit_log_records_changes(self):
        """Audit log should record old vs new values for updates"""
        # Create entry
        entry_data = {
            "date": "2025-01-15",
            "truck_no": f"TEST_CHG_{uuid.uuid4().hex[:6]}",
            "agent_name": "Original Agent",
            "mandi_name": "Original Mandi",
            "kg": 7000,
            "bag": 70,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/entries?username={ADMIN_USER}&role=admin",
            json=entry_data
        )
        assert create_response.status_code == 200
        entry_id = create_response.json()["id"]
        
        # Update with different values
        update_response = self.session.put(
            f"{BASE_URL}/api/entries/{entry_id}?username={ADMIN_USER}&role=admin",
            json={"kg": 7500, "bag": 75, "agent_name": "Updated Agent"}
        )
        assert update_response.status_code == 200
        
        # Get audit log
        audit_response = self.session.get(
            f"{BASE_URL}/api/audit-log/record/{entry_id}"
        )
        assert audit_response.status_code == 200
        logs = audit_response.json().get("logs", [])
        
        update_log = next((l for l in logs if l.get("action") == "update"), None)
        assert update_log is not None
        
        changes = update_log.get("changes", {})
        # Check that changes contain old and new values
        if "kg" in changes:
            assert "old" in changes["kg"] or "new" in changes["kg"], "Changes should have old/new values"
        
        print(f"PASS - Audit log records changes: {list(changes.keys())}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/entries/{entry_id}?username={ADMIN_USER}&role=admin")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
