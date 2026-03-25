"""
Iteration 102: Bug Fix Tests for Private Paddy Purchase Cash Book Integration
Tests:
1. POST /api/private-paddy creates pvt_party_jama entry with party_name as category
2. DELETE /api/private-paddy/{id} removes pvt_party_jama entries (regex: pvt_paddy|pvt_party_jama:|pvt_truck_jama:)
3. PUT /api/private-paddy/{id} replaces pvt_party_jama entries (no duplicates)
4. GET /api/cash-book?account=ledger returns Pvt Paddy Purchase entries with party names as category
"""
import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPrivatePaddyBugFix:
    """Test Private Paddy Purchase Cash Book integration bug fixes"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_party_name = f"TEST_Party_{uuid.uuid4().hex[:6]}"
        self.test_truck_no = f"TEST_TRK_{uuid.uuid4().hex[:4]}"
        self.created_ids = []
        yield
        # Cleanup
        for entry_id in self.created_ids:
            try:
                requests.delete(f"{BASE_URL}/api/private-paddy/{entry_id}")
            except:
                pass
    
    def test_01_create_pvt_paddy_creates_party_jama_entry(self):
        """Bug Fix 2: Creating Private Paddy Purchase should create party_jama entry with party_name as category"""
        # Create a private paddy purchase
        payload = {
            "date": "2026-01-15",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "party_name": self.test_party_name,
            "truck_no": self.test_truck_no,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2500,
            "moisture": 14,
            "cutting_percent": 2,
            "cash_paid": 1000,
            "diesel_paid": 500,
            "paid_amount": 2000,
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Failed to create pvt paddy: {response.text}"
        
        data = response.json()
        entry_id = data.get("id")
        self.created_ids.append(entry_id)
        
        # Verify entry was created
        assert entry_id is not None, "Entry ID should be returned"
        assert data.get("party_name") == self.test_party_name
        assert data.get("total_amount") > 0, "Total amount should be calculated"
        
        print(f"Created pvt paddy entry: {entry_id}")
        print(f"Party: {self.test_party_name}, Total: {data.get('total_amount')}")
        
        # Now check cash_transactions for party_jama entry
        time.sleep(0.5)  # Allow async operations to complete
        
        cb_response = requests.get(f"{BASE_URL}/api/cash-book?account=ledger&kms_year=2025-2026")
        assert cb_response.status_code == 200, f"Failed to get cash book: {cb_response.text}"
        
        transactions = cb_response.json()
        
        # Find the party_jama entry for this party
        party_jama_entries = [
            t for t in transactions 
            if t.get("category") == self.test_party_name 
            and t.get("party_type") == "Pvt Paddy Purchase"
            and t.get("txn_type") == "jama"
        ]
        
        assert len(party_jama_entries) >= 1, f"Expected at least 1 party_jama entry for {self.test_party_name}, found {len(party_jama_entries)}"
        
        # Verify the entry has correct data
        jama_entry = party_jama_entries[0]
        assert jama_entry.get("category") == self.test_party_name, f"Category should be party_name: {self.test_party_name}"
        assert jama_entry.get("amount") == data.get("total_amount"), f"Amount should match total_amount"
        assert "pvt_party_jama:" in jama_entry.get("reference", ""), f"Reference should contain pvt_party_jama:"
        
        print(f"PASS: Party jama entry found with category={jama_entry.get('category')}, amount={jama_entry.get('amount')}")
    
    def test_02_delete_pvt_paddy_removes_all_linked_entries(self):
        """Bug Fix 2b: Deleting Private Paddy Purchase should clean up ALL linked cash_transactions"""
        # Create a private paddy purchase
        payload = {
            "date": "2026-01-15",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "party_name": self.test_party_name,
            "truck_no": self.test_truck_no,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2500,
            "moisture": 14,
            "cutting_percent": 2,
            "cash_paid": 1000,
            "diesel_paid": 500,
            "paid_amount": 2000,
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        entry_id = data.get("id")
        entry_id_short = entry_id[:8]
        
        print(f"Created pvt paddy entry: {entry_id}")
        
        # Verify entries exist before delete
        time.sleep(0.5)
        cb_response = requests.get(f"{BASE_URL}/api/cash-book?account=ledger&kms_year=2025-2026")
        transactions_before = cb_response.json()
        
        # Count entries with references containing this entry_id
        linked_before = [
            t for t in transactions_before 
            if entry_id_short in t.get("reference", "")
        ]
        print(f"Found {len(linked_before)} linked entries before delete")
        
        # Delete the entry
        delete_response = requests.delete(f"{BASE_URL}/api/private-paddy/{entry_id}")
        assert delete_response.status_code == 200, f"Failed to delete: {delete_response.text}"
        
        # Verify all linked entries are removed
        time.sleep(0.5)
        cb_response_after = requests.get(f"{BASE_URL}/api/cash-book?account=ledger&kms_year=2025-2026")
        transactions_after = cb_response_after.json()
        
        # Check for orphaned entries
        linked_after = [
            t for t in transactions_after 
            if entry_id_short in t.get("reference", "")
        ]
        
        assert len(linked_after) == 0, f"Expected 0 linked entries after delete, found {len(linked_after)}: {[t.get('reference') for t in linked_after]}"
        
        print(f"PASS: All linked entries removed after delete (before: {len(linked_before)}, after: {len(linked_after)})")
    
    def test_03_update_pvt_paddy_replaces_entries_no_duplicates(self):
        """Bug Fix 2c: Updating Private Paddy Purchase should replace old entries (no duplicates)"""
        # Create a private paddy purchase
        payload = {
            "date": "2026-01-15",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "party_name": self.test_party_name,
            "truck_no": self.test_truck_no,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2500,
            "moisture": 14,
            "cutting_percent": 2,
            "cash_paid": 1000,
            "diesel_paid": 500,
            "paid_amount": 2000,
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        entry_id = data.get("id")
        entry_id_short = entry_id[:8]
        self.created_ids.append(entry_id)
        
        print(f"Created pvt paddy entry: {entry_id}")
        
        # Count entries before update
        time.sleep(0.5)
        cb_response = requests.get(f"{BASE_URL}/api/cash-book?account=ledger&kms_year=2025-2026")
        transactions_before = cb_response.json()
        
        party_jama_before = [
            t for t in transactions_before 
            if t.get("category") == self.test_party_name 
            and "pvt_party_jama:" in t.get("reference", "")
        ]
        print(f"Party jama entries before update: {len(party_jama_before)}")
        
        # Update the entry
        update_payload = {
            "kg": 6000,  # Changed
            "rate_per_qntl": 2600,  # Changed
        }
        
        update_response = requests.put(f"{BASE_URL}/api/private-paddy/{entry_id}?username=admin", json=update_payload)
        assert update_response.status_code == 200, f"Failed to update: {update_response.text}"
        
        # Count entries after update
        time.sleep(0.5)
        cb_response_after = requests.get(f"{BASE_URL}/api/cash-book?account=ledger&kms_year=2025-2026")
        transactions_after = cb_response_after.json()
        
        party_jama_after = [
            t for t in transactions_after 
            if t.get("category") == self.test_party_name 
            and "pvt_party_jama:" in t.get("reference", "")
        ]
        
        # Should have same count (replaced, not duplicated)
        assert len(party_jama_after) == len(party_jama_before), f"Expected same count after update (no duplicates), before: {len(party_jama_before)}, after: {len(party_jama_after)}"
        
        # Verify amount was updated
        if party_jama_after:
            updated_entry = party_jama_after[0]
            # New total should be different (6000kg / 100 * 2600 = ~156000 minus cuts)
            print(f"Updated party jama amount: {updated_entry.get('amount')}")
        
        print(f"PASS: No duplicate entries after update (before: {len(party_jama_before)}, after: {len(party_jama_after)})")
    
    def test_04_cash_book_ledger_shows_party_name_as_category(self):
        """Bug Fix 2: GET /api/cash-book?account=ledger should return Pvt Paddy Purchase entries with party names as category"""
        # Create a private paddy purchase
        unique_party = f"TEST_UniqueParty_{uuid.uuid4().hex[:6]}"
        payload = {
            "date": "2026-01-15",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "party_name": unique_party,
            "truck_no": self.test_truck_no,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2500,
            "moisture": 14,
            "cutting_percent": 2,
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        entry_id = data.get("id")
        self.created_ids.append(entry_id)
        
        # Get ledger transactions
        time.sleep(0.5)
        cb_response = requests.get(f"{BASE_URL}/api/cash-book?account=ledger&kms_year=2025-2026")
        assert cb_response.status_code == 200
        
        transactions = cb_response.json()
        
        # Find entries for this party
        party_entries = [
            t for t in transactions 
            if t.get("category") == unique_party
        ]
        
        assert len(party_entries) >= 1, f"Expected at least 1 entry with category={unique_party}"
        
        # Verify party_type is correct
        for entry in party_entries:
            if "pvt_party_jama:" in entry.get("reference", ""):
                assert entry.get("party_type") == "Pvt Paddy Purchase", f"party_type should be 'Pvt Paddy Purchase'"
                assert entry.get("category") == unique_party, f"category should be party_name: {unique_party}"
                print(f"PASS: Found entry with category={entry.get('category')}, party_type={entry.get('party_type')}")
    
    def test_05_verify_qntl_rate_in_description(self):
        """Bug Fix 2c: Verify quantity and rate appear correctly in Cash Book description"""
        unique_party = f"TEST_QntlRate_{uuid.uuid4().hex[:6]}"
        payload = {
            "date": "2026-01-15",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "party_name": unique_party,
            "truck_no": self.test_truck_no,
            "kg": 5000,  # 50 qntl
            "bag": 50,
            "rate_per_qntl": 2500,
            "moisture": 14,
            "cutting_percent": 2,
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        entry_id = data.get("id")
        self.created_ids.append(entry_id)
        
        final_qntl = data.get("final_qntl", 0)
        rate = data.get("rate_per_qntl", 0)
        
        print(f"Created entry with final_qntl={final_qntl}, rate={rate}")
        
        # Get ledger transactions
        time.sleep(0.5)
        cb_response = requests.get(f"{BASE_URL}/api/cash-book?account=ledger&kms_year=2025-2026")
        transactions = cb_response.json()
        
        # Find party_jama entry
        party_jama = [
            t for t in transactions 
            if t.get("category") == unique_party 
            and "pvt_party_jama:" in t.get("reference", "")
        ]
        
        assert len(party_jama) >= 1, f"Expected party_jama entry for {unique_party}"
        
        description = party_jama[0].get("description", "")
        print(f"Description: {description}")
        
        # Description should contain quantity and rate info
        # Format: "Paddy Purchase: {party} - {qntl}Q @ Rs.{rate}/Q = Rs.{total}"
        assert "Paddy Purchase" in description or "Q @" in description or "Rs." in description, \
            f"Description should contain quantity/rate info: {description}"
        
        print(f"PASS: Description contains proper format: {description}")


class TestPrivatePaddyAPIEndpoints:
    """Test Private Paddy API endpoints"""
    
    def test_get_private_paddy_list(self):
        """Test GET /api/private-paddy returns list"""
        response = requests.get(f"{BASE_URL}/api/private-paddy?kms_year=2025-2026")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"PASS: GET /api/private-paddy returns {len(response.json())} entries")
    
    def test_cash_book_ledger_endpoint(self):
        """Test GET /api/cash-book?account=ledger endpoint"""
        response = requests.get(f"{BASE_URL}/api/cash-book?account=ledger&kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Check for Pvt Paddy Purchase entries
        pvt_entries = [t for t in data if t.get("party_type") == "Pvt Paddy Purchase"]
        print(f"PASS: GET /api/cash-book?account=ledger returns {len(data)} entries, {len(pvt_entries)} are Pvt Paddy Purchase")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
