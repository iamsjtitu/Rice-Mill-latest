"""
Iteration 24 Tests: G.Issued Auto-Deduction, Entry Form Field Reorder, Error Log
Features tested:
1. Creating entry with g_issued > 0 auto-creates gunny bag 'out' entry for 'old' bags
2. Update entry updates linked gunny bag entry
3. Delete entry removes linked gunny bag entry
4. /api/gunny-bags/summary does NOT return g_issued key (it's now tracked via old bags out)
5. /api/error-log endpoint returns proper response
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestGIssueAutoDeduction:
    """Test g_issued auto-creates gunny bag out entry"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data and cleanup"""
        self.test_entry_id = None
        yield
        # Cleanup: delete test entry if created
        if self.test_entry_id:
            try:
                requests.delete(f"{BASE_URL}/api/entries/{self.test_entry_id}?username=admin&role=admin")
            except:
                pass
    
    def test_create_entry_with_g_issued_creates_gunny_out(self):
        """When g_issued > 0, should auto-create gunny bag 'out' entry for 'old' bags"""
        # Create entry with g_issued > 0
        payload = {
            "date": "2026-01-15",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "truck_no": "TEST_GISSUED_001",
            "agent_name": "Test Agent G",
            "mandi_name": "Test Mandi G",
            "kg": 5000,
            "bag": 50,
            "g_deposite": 50,
            "g_issued": 30,  # Should create gunny bag out entry
            "moisture": 15,
            "cutting_percent": 5
        }
        
        response = requests.post(
            f"{BASE_URL}/api/entries?username=admin&role=admin",
            json=payload
        )
        assert response.status_code == 200, f"Create entry failed: {response.text}"
        entry = response.json()
        self.test_entry_id = entry['id']
        
        # Verify gunny bag out entry was created
        gunny_response = requests.get(f"{BASE_URL}/api/gunny-bags?kms_year=2025-2026")
        assert gunny_response.status_code == 200
        gunny_entries = gunny_response.json()
        
        # Find the linked entry
        linked_entries = [g for g in gunny_entries if g.get('linked_entry_id') == entry['id']]
        assert len(linked_entries) == 1, f"Expected 1 linked gunny entry, found {len(linked_entries)}"
        
        gunny_entry = linked_entries[0]
        assert gunny_entry['bag_type'] == 'old', "Gunny entry should be for 'old' (market) bags"
        assert gunny_entry['txn_type'] == 'out', "Gunny entry should be 'out' type"
        assert gunny_entry['quantity'] == 30, f"Expected quantity 30, got {gunny_entry['quantity']}"
        assert "Test Agent G" in gunny_entry.get('source', '') or "Test Agent G" in gunny_entry.get('notes', ''), "Agent name should be in source/notes"
        assert "Test Mandi G" in gunny_entry.get('source', '') or "Test Mandi G" in gunny_entry.get('notes', ''), "Mandi name should be in source/notes"
        print(f"SUCCESS: G.Issued auto-created gunny bag out entry with quantity {gunny_entry['quantity']}")
    
    def test_create_entry_without_g_issued_no_gunny_entry(self):
        """When g_issued = 0, should NOT create gunny bag entry"""
        payload = {
            "date": "2026-01-15",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "truck_no": "TEST_NO_GISSUED_002",
            "agent_name": "Test Agent NoG",
            "mandi_name": "Test Mandi NoG",
            "kg": 3000,
            "bag": 30,
            "g_deposite": 30,
            "g_issued": 0,  # No gunny bag entry should be created
            "moisture": 15
        }
        
        response = requests.post(
            f"{BASE_URL}/api/entries?username=admin&role=admin",
            json=payload
        )
        assert response.status_code == 200
        entry = response.json()
        self.test_entry_id = entry['id']
        
        # Check no linked gunny entry
        gunny_response = requests.get(f"{BASE_URL}/api/gunny-bags?kms_year=2025-2026")
        gunny_entries = gunny_response.json()
        linked_entries = [g for g in gunny_entries if g.get('linked_entry_id') == entry['id']]
        assert len(linked_entries) == 0, f"Expected 0 linked gunny entries, found {len(linked_entries)}"
        print("SUCCESS: No gunny entry created when g_issued = 0")


class TestGIssueUpdateAndDelete:
    """Test update and delete of entries with g_issued"""
    
    def test_update_entry_g_issued_updates_gunny_entry(self):
        """Updating g_issued should update linked gunny bag entry"""
        # Create entry with g_issued
        payload = {
            "date": "2026-01-16",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "truck_no": "TEST_UPDATE_003",
            "agent_name": "Update Agent",
            "mandi_name": "Update Mandi",
            "kg": 4000,
            "bag": 40,
            "g_issued": 20
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/entries?username=admin&role=admin",
            json=payload
        )
        assert create_response.status_code == 200
        entry = create_response.json()
        entry_id = entry['id']
        
        try:
            # Verify gunny entry created
            gunny_response = requests.get(f"{BASE_URL}/api/gunny-bags?kms_year=2025-2026")
            gunny_entries = [g for g in gunny_response.json() if g.get('linked_entry_id') == entry_id]
            assert len(gunny_entries) == 1
            assert gunny_entries[0]['quantity'] == 20
            
            # Update g_issued to 35
            update_payload = {"g_issued": 35}
            update_response = requests.put(
                f"{BASE_URL}/api/entries/{entry_id}?username=admin&role=admin",
                json=update_payload
            )
            assert update_response.status_code == 200
            
            # Verify gunny entry updated
            gunny_response = requests.get(f"{BASE_URL}/api/gunny-bags?kms_year=2025-2026")
            gunny_entries = [g for g in gunny_response.json() if g.get('linked_entry_id') == entry_id]
            assert len(gunny_entries) == 1
            assert gunny_entries[0]['quantity'] == 35, f"Expected 35, got {gunny_entries[0]['quantity']}"
            print("SUCCESS: Update entry g_issued updated gunny entry quantity from 20 to 35")
            
        finally:
            # Cleanup
            requests.delete(f"{BASE_URL}/api/entries/{entry_id}?username=admin&role=admin")
    
    def test_delete_entry_removes_linked_gunny_entry(self):
        """Deleting entry should remove linked gunny bag entry"""
        # Create entry with g_issued
        payload = {
            "date": "2026-01-17",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "truck_no": "TEST_DELETE_004",
            "agent_name": "Delete Agent",
            "mandi_name": "Delete Mandi",
            "kg": 3500,
            "bag": 35,
            "g_issued": 25
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/entries?username=admin&role=admin",
            json=payload
        )
        assert create_response.status_code == 200
        entry = create_response.json()
        entry_id = entry['id']
        
        # Verify gunny entry exists
        gunny_response = requests.get(f"{BASE_URL}/api/gunny-bags?kms_year=2025-2026")
        gunny_entries = [g for g in gunny_response.json() if g.get('linked_entry_id') == entry_id]
        assert len(gunny_entries) == 1, "Gunny entry should exist before delete"
        
        # Delete entry
        delete_response = requests.delete(f"{BASE_URL}/api/entries/{entry_id}?username=admin&role=admin")
        assert delete_response.status_code == 200
        
        # Verify gunny entry removed
        gunny_response = requests.get(f"{BASE_URL}/api/gunny-bags?kms_year=2025-2026")
        gunny_entries = [g for g in gunny_response.json() if g.get('linked_entry_id') == entry_id]
        assert len(gunny_entries) == 0, f"Gunny entry should be deleted, found {len(gunny_entries)}"
        print("SUCCESS: Delete entry removed linked gunny entry")


class TestGunnySummaryNoGIssued:
    """Test that gunny-bags/summary does NOT return separate g_issued field"""
    
    def test_gunny_summary_no_g_issued_key(self):
        """Summary should show g_issued as part of 'old' bags total_out, not separate key"""
        response = requests.get(f"{BASE_URL}/api/gunny-bags/summary?kms_year=2025-2026")
        assert response.status_code == 200
        summary = response.json()
        
        # Should NOT have separate 'g_issued' key at top level
        assert 'g_issued' not in summary, f"Summary should not have 'g_issued' key, but found it: {summary.keys()}"
        
        # Should have 'old', 'new', 'paddy_bags', 'ppkt', 'grand_total'
        assert 'old' in summary, "Summary should have 'old' key"
        assert 'new' in summary, "Summary should have 'new' key"
        assert 'paddy_bags' in summary, "Summary should have 'paddy_bags' key"
        assert 'ppkt' in summary, "Summary should have 'ppkt' key"
        assert 'grand_total' in summary, "Summary should have 'grand_total' key"
        
        # 'old' should have total_in, total_out, balance
        old = summary['old']
        assert 'total_in' in old, "old should have total_in"
        assert 'total_out' in old, "old should have total_out (includes G.Issued)"
        assert 'balance' in old, "old should have balance"
        
        print(f"SUCCESS: Gunny summary has correct structure. Old bags out (includes G.Issued): {old.get('total_out')}")
        print(f"  Summary keys: {list(summary.keys())}")


class TestErrorLogEndpoint:
    """Test /api/error-log endpoint"""
    
    def test_error_log_returns_proper_response(self):
        """Error log endpoint should return content and available fields"""
        response = requests.get(f"{BASE_URL}/api/error-log")
        assert response.status_code == 200
        data = response.json()
        
        # Should have 'content' and 'available' fields
        assert 'content' in data, "Response should have 'content' field"
        assert 'available' in data, "Response should have 'available' field"
        
        # For web version, available should be False
        assert data['available'] == False, "For web version, available should be False"
        
        # Content should have explanatory message
        assert len(data['content']) > 0, "Content should not be empty"
        print(f"SUCCESS: Error log endpoint returns proper response: available={data['available']}")
        print(f"  Content: {data['content'][:100]}...")


class TestLogin:
    """Test login functionality"""
    
    def test_admin_login(self):
        """Login with admin credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get('success') == True, f"Login failed: {data}"
        assert data.get('role') == 'admin', f"Expected admin role, got: {data}"
        print("SUCCESS: Admin login works")
    
    def test_staff_login(self):
        """Login with staff credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "staff", "password": "staff123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get('success') == True, f"Login failed: {data}"
        assert data.get('role') == 'staff', f"Expected staff role, got: {data}"
        print("SUCCESS: Staff login works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
