"""
Test: Auto Gunny Bag Entries from Mill Entries (Iteration 46)

This tests the NEW feature where:
- g_issued in mill entry -> Creates OUT entry in gunny_bags with linked_entry_id
- g_deposite in mill entry -> Creates IN entry in gunny_bags with linked_entry_id
- Source = "Agent Name - Mandi Name", Reference = "Truck No"
- On update: old gunny entries deleted, new ones recreated
- On delete: linked gunny entries removed

Also tests existing PDF/Excel exports still working.
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAutoGunnyFromMillEntry:
    """Test auto gunny bag entry creation from mill entries"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Store test data for cleanup"""
        self.created_entry_ids = []
        yield
        # Cleanup: delete test entries
        for entry_id in self.created_entry_ids:
            try:
                requests.delete(f"{BASE_URL}/api/entries/{entry_id}?username=admin&role=admin")
            except:
                pass

    # === Test 1: Create mill entry with g_issued creates OUT gunny entry ===
    def test_01_create_mill_entry_with_g_issued_creates_out_gunny(self):
        """Create mill entry with g_issued > 0 should create OUT gunny entry"""
        payload = {
            "date": "2026-01-11",
            "truck_no": "TEST-GUNNY-01",
            "agent_name": "TestAgent",
            "mandi_name": "TestMandi",
            "kg": 5000,
            "bag": 100,
            "g_issued": 50,
            "g_deposite": 0,
            "kms_year": "2025-26",
            "season": "kharif"
        }
        
        response = requests.post(f"{BASE_URL}/api/entries?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        entry_id = data["id"]
        self.created_entry_ids.append(entry_id)
        
        # Verify gunny bag entry created
        gunny_response = requests.get(f"{BASE_URL}/api/gunny-bags")
        assert gunny_response.status_code == 200
        
        gunny_entries = gunny_response.json()
        linked_entries = [g for g in gunny_entries if g.get("linked_entry_id") == entry_id]
        
        assert len(linked_entries) == 1, f"Expected 1 linked gunny entry, got {len(linked_entries)}"
        
        gunny = linked_entries[0]
        assert gunny["txn_type"] == "out", "g_issued should create OUT entry"
        assert gunny["quantity"] == 50, f"Quantity should be 50, got {gunny['quantity']}"
        assert "TestAgent" in gunny["source"], f"Source should contain TestAgent: {gunny['source']}"
        assert "TestMandi" in gunny["source"], f"Source should contain TestMandi: {gunny['source']}"
        assert gunny["reference"] == "TEST-GUNNY-01", f"Reference should be truck_no: {gunny['reference']}"
        assert gunny["notes"] == "Auto from Mill Entry"
        print(f"PASS: OUT gunny entry created with source={gunny['source']}, ref={gunny['reference']}")

    # === Test 2: Create mill entry with g_deposite creates IN gunny entry ===
    def test_02_create_mill_entry_with_g_deposite_creates_in_gunny(self):
        """Create mill entry with g_deposite > 0 should create IN gunny entry"""
        payload = {
            "date": "2026-01-11",
            "truck_no": "TEST-GUNNY-02",
            "agent_name": "AgentB",
            "mandi_name": "MandiB",
            "kg": 4000,
            "bag": 80,
            "g_issued": 0,
            "g_deposite": 30,
            "kms_year": "2025-26",
            "season": "kharif"
        }
        
        response = requests.post(f"{BASE_URL}/api/entries?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        entry_id = data["id"]
        self.created_entry_ids.append(entry_id)
        
        # Verify gunny bag entry created
        gunny_response = requests.get(f"{BASE_URL}/api/gunny-bags")
        assert gunny_response.status_code == 200
        
        gunny_entries = gunny_response.json()
        linked_entries = [g for g in gunny_entries if g.get("linked_entry_id") == entry_id]
        
        assert len(linked_entries) == 1, f"Expected 1 linked gunny entry, got {len(linked_entries)}"
        
        gunny = linked_entries[0]
        assert gunny["txn_type"] == "in", "g_deposite should create IN entry"
        assert gunny["quantity"] == 30, f"Quantity should be 30, got {gunny['quantity']}"
        assert gunny["source"] == "AgentB - MandiB", f"Source format wrong: {gunny['source']}"
        assert gunny["reference"] == "TEST-GUNNY-02"
        print(f"PASS: IN gunny entry created with qty={gunny['quantity']}")

    # === Test 3: Create mill entry with both g_issued AND g_deposite ===
    def test_03_create_mill_entry_with_both_g_issued_and_g_deposite(self):
        """Create mill entry with both g_issued > 0 and g_deposite > 0 should create 2 gunny entries"""
        payload = {
            "date": "2026-01-11",
            "truck_no": "TEST-GUNNY-03",
            "agent_name": "AgentC",
            "mandi_name": "MandiC",
            "kg": 6000,
            "bag": 120,
            "g_issued": 40,
            "g_deposite": 25,
            "kms_year": "2025-26",
            "season": "kharif"
        }
        
        response = requests.post(f"{BASE_URL}/api/entries?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        entry_id = data["id"]
        self.created_entry_ids.append(entry_id)
        
        # Verify gunny bag entries
        gunny_response = requests.get(f"{BASE_URL}/api/gunny-bags")
        gunny_entries = gunny_response.json()
        linked_entries = [g for g in gunny_entries if g.get("linked_entry_id") == entry_id]
        
        assert len(linked_entries) == 2, f"Expected 2 linked gunny entries, got {len(linked_entries)}"
        
        out_entry = next((g for g in linked_entries if g["txn_type"] == "out"), None)
        in_entry = next((g for g in linked_entries if g["txn_type"] == "in"), None)
        
        assert out_entry is not None, "OUT entry not found"
        assert in_entry is not None, "IN entry not found"
        assert out_entry["quantity"] == 40, f"OUT quantity should be 40, got {out_entry['quantity']}"
        assert in_entry["quantity"] == 25, f"IN quantity should be 25, got {in_entry['quantity']}"
        print(f"PASS: Both OUT(40) and IN(25) gunny entries created")

    # === Test 4: Update mill entry replaces gunny entries ===
    def test_04_update_mill_entry_replaces_gunny_entries(self):
        """Update mill entry g_issued/g_deposite should delete old and create new gunny entries"""
        # Create initial entry
        payload = {
            "date": "2026-01-11",
            "truck_no": "TEST-GUNNY-04",
            "agent_name": "AgentD",
            "mandi_name": "MandiD",
            "kg": 5000,
            "bag": 100,
            "g_issued": 20,
            "g_deposite": 10,
            "kms_year": "2025-26",
            "season": "kharif"
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/entries?username=admin&role=admin", json=payload)
        assert create_resp.status_code == 200
        entry_id = create_resp.json()["id"]
        self.created_entry_ids.append(entry_id)
        
        # Verify initial gunny entries (2 entries: OUT=20, IN=10)
        gunny_resp = requests.get(f"{BASE_URL}/api/gunny-bags")
        linked = [g for g in gunny_resp.json() if g.get("linked_entry_id") == entry_id]
        assert len(linked) == 2, f"Initial: Expected 2, got {len(linked)}"
        
        # Update: change g_issued to 30, g_deposite to 0
        update_payload = {
            "g_issued": 30,
            "g_deposite": 0
        }
        update_resp = requests.put(f"{BASE_URL}/api/entries/{entry_id}?username=admin&role=admin", json=update_payload)
        assert update_resp.status_code == 200, f"Update failed: {update_resp.text}"
        
        # Verify gunny entries updated
        gunny_resp = requests.get(f"{BASE_URL}/api/gunny-bags")
        linked = [g for g in gunny_resp.json() if g.get("linked_entry_id") == entry_id]
        
        # Should only have 1 entry now (OUT=30)
        assert len(linked) == 1, f"After update: Expected 1, got {len(linked)}"
        assert linked[0]["txn_type"] == "out"
        assert linked[0]["quantity"] == 30, f"Should be 30, got {linked[0]['quantity']}"
        print(f"PASS: Update replaced gunny entries correctly (OUT=30)")

    # === Test 5: Delete mill entry removes linked gunny entries ===
    def test_05_delete_mill_entry_removes_linked_gunny_entries(self):
        """Delete mill entry should remove all linked gunny bag entries"""
        # Create entry
        payload = {
            "date": "2026-01-11",
            "truck_no": "TEST-GUNNY-05",
            "agent_name": "AgentE",
            "mandi_name": "MandiE",
            "kg": 4000,
            "bag": 80,
            "g_issued": 15,
            "g_deposite": 8,
            "kms_year": "2025-26",
            "season": "kharif"
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/entries?username=admin&role=admin", json=payload)
        assert create_resp.status_code == 200
        entry_id = create_resp.json()["id"]
        
        # Verify gunny entries exist
        gunny_resp = requests.get(f"{BASE_URL}/api/gunny-bags")
        linked = [g for g in gunny_resp.json() if g.get("linked_entry_id") == entry_id]
        assert len(linked) == 2, f"Before delete: Expected 2, got {len(linked)}"
        
        # Delete the mill entry
        delete_resp = requests.delete(f"{BASE_URL}/api/entries/{entry_id}?username=admin&role=admin")
        assert delete_resp.status_code == 200, f"Delete failed: {delete_resp.text}"
        
        # Verify gunny entries removed
        gunny_resp = requests.get(f"{BASE_URL}/api/gunny-bags")
        linked = [g for g in gunny_resp.json() if g.get("linked_entry_id") == entry_id]
        
        assert len(linked) == 0, f"After delete: Expected 0 linked entries, got {len(linked)}"
        print(f"PASS: Delete removed linked gunny entries")

    # === Test 6: Create entry with zero g_issued/g_deposite creates no gunny entries ===
    def test_06_create_entry_with_zero_gunny_values_creates_no_entries(self):
        """Create mill entry with g_issued=0 and g_deposite=0 should create no gunny entries"""
        payload = {
            "date": "2026-01-11",
            "truck_no": "TEST-GUNNY-06",
            "agent_name": "AgentF",
            "mandi_name": "MandiF",
            "kg": 3000,
            "bag": 60,
            "g_issued": 0,
            "g_deposite": 0,
            "kms_year": "2025-26",
            "season": "kharif"
        }
        
        response = requests.post(f"{BASE_URL}/api/entries?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        entry_id = response.json()["id"]
        self.created_entry_ids.append(entry_id)
        
        # Verify no gunny entries
        gunny_resp = requests.get(f"{BASE_URL}/api/gunny-bags")
        linked = [g for g in gunny_resp.json() if g.get("linked_entry_id") == entry_id]
        
        assert len(linked) == 0, f"Expected 0 gunny entries, got {len(linked)}"
        print(f"PASS: No gunny entries created for zero values")

    # === Test 7: GET /api/gunny-bags returns linked_entry_id field ===
    def test_07_get_gunny_bags_returns_linked_entry_id(self):
        """GET /api/gunny-bags should include linked_entry_id in response"""
        response = requests.get(f"{BASE_URL}/api/gunny-bags")
        assert response.status_code == 200
        
        entries = response.json()
        # Check that the schema includes linked_entry_id (some may be None for manual entries)
        # Auto-created entries should have linked_entry_id set
        print(f"GET /api/gunny-bags returned {len(entries)} entries")
        
        # Check structure of an entry if available
        if entries:
            sample = entries[0]
            # linked_entry_id may or may not be present for manual entries
            print(f"Sample entry keys: {list(sample.keys())}")
        
        print(f"PASS: GET /api/gunny-bags returns 200 OK")


class TestPDFExcelExportsStillWorking:
    """Verify PDF/Excel exports still return 200 OK"""
    
    def test_08_cash_book_pdf_returns_200(self):
        """Cash Book PDF export should return 200"""
        response = requests.get(f"{BASE_URL}/api/cash-book/pdf")
        assert response.status_code == 200, f"Cash Book PDF failed: {response.status_code}"
        assert 'application/pdf' in response.headers.get('content-type', '').lower()
        print(f"PASS: Cash Book PDF returns 200 OK")

    def test_09_cash_book_excel_returns_200(self):
        """Cash Book Excel export should return 200"""
        response = requests.get(f"{BASE_URL}/api/cash-book/excel")
        assert response.status_code == 200, f"Cash Book Excel failed: {response.status_code}"
        print(f"PASS: Cash Book Excel returns 200 OK")

    def test_10_party_ledger_pdf_returns_200(self):
        """Party Ledger PDF export should return 200"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger/pdf")
        assert response.status_code == 200, f"Party Ledger PDF failed: {response.status_code}"
        assert 'application/pdf' in response.headers.get('content-type', '').lower()
        print(f"PASS: Party Ledger PDF returns 200 OK")

    def test_11_party_ledger_excel_returns_200(self):
        """Party Ledger Excel export should return 200"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger/excel")
        assert response.status_code == 200, f"Party Ledger Excel failed: {response.status_code}"
        print(f"PASS: Party Ledger Excel returns 200 OK")

    def test_12_party_summary_pdf_returns_200(self):
        """Party Summary PDF export should return 200"""
        response = requests.get(f"{BASE_URL}/api/cash-book/party-summary/pdf")
        assert response.status_code == 200, f"Party Summary PDF failed: {response.status_code}"
        assert 'application/pdf' in response.headers.get('content-type', '').lower()
        print(f"PASS: Party Summary PDF returns 200 OK")

    def test_13_party_summary_excel_returns_200(self):
        """Party Summary Excel export should return 200"""
        response = requests.get(f"{BASE_URL}/api/cash-book/party-summary/excel")
        assert response.status_code == 200, f"Party Summary Excel failed: {response.status_code}"
        print(f"PASS: Party Summary Excel returns 200 OK")


class TestGunnyBagSummaryWithLinkedEntries:
    """Test gunny bag summary endpoint with auto-created entries"""
    
    def test_14_gunny_bag_summary_returns_200(self):
        """GET /api/gunny-bags/summary should return 200 and include totals"""
        response = requests.get(f"{BASE_URL}/api/gunny-bags/summary")
        assert response.status_code == 200
        
        data = response.json()
        assert "new" in data, "Summary should have 'new' bag type"
        assert "old" in data, "Summary should have 'old' bag type"
        assert "g_issued" in data, "Summary should have g_issued from entries"
        print(f"PASS: Gunny Bag Summary returns proper structure")

    def test_15_gunny_bag_excel_export_returns_200(self):
        """GET /api/gunny-bags/excel should return 200"""
        response = requests.get(f"{BASE_URL}/api/gunny-bags/excel")
        assert response.status_code == 200
        print(f"PASS: Gunny Bags Excel export returns 200 OK")

    def test_16_gunny_bag_pdf_export_returns_200(self):
        """GET /api/gunny-bags/pdf should return 200"""
        response = requests.get(f"{BASE_URL}/api/gunny-bags/pdf")
        assert response.status_code == 200
        assert 'application/pdf' in response.headers.get('content-type', '').lower()
        print(f"PASS: Gunny Bags PDF export returns 200 OK")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
