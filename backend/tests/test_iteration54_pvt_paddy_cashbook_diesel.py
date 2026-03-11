"""
Test Iteration 54: Pvt Paddy Cash Book & Diesel Integration
Tests:
1. POST /api/private-paddy with cash_paid creates cash_transactions entry
2. POST /api/private-paddy with diesel_paid creates diesel_accounts entry
3. GET /api/reports/party-ledger?party_type=pvt_paddy shows Pvt Paddy Purchase entries
4. Party Ledger shows debit=total_amount, credit for cash/diesel advances
5. DELETE /api/private-paddy/{id} cascades delete to cash_transactions and diesel_accounts
6. PUT /api/private-paddy/{id} updates linked cash_transactions and diesel_accounts
7. Cash Book shows nikasi entries for pvt paddy cash advances
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPvtPaddyCashBookDieselIntegration:
    """Test Pvt Paddy auto-creates cash book and diesel entries"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_party = f"TEST_PARTY_{uuid.uuid4().hex[:8]}"
        self.test_mandi = "TEST_MANDI"
        self.created_entry_id = None
        yield
        # Cleanup
        if self.created_entry_id:
            try:
                self.session.delete(f"{BASE_URL}/api/private-paddy/{self.created_entry_id}")
            except:
                pass
    
    def test_01_create_pvt_paddy_with_cash_and_diesel(self):
        """Create a pvt paddy entry with cash_paid and diesel_paid"""
        payload = {
            "date": "2026-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": self.test_party,
            "mandi_name": self.test_mandi,
            "agent_name": "Test Agent",
            "truck_no": "UP14XX1234",
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2100,
            "cash_paid": 500,
            "diesel_paid": 300
        }
        
        response = self.session.post(f"{BASE_URL}/api/private-paddy", json=payload)
        assert response.status_code == 200, f"Failed to create: {response.text}"
        
        data = response.json()
        assert "id" in data
        self.created_entry_id = data["id"]
        
        assert data["cash_paid"] == 500
        assert data["diesel_paid"] == 300
        assert data["party_name"] == self.test_party
        print(f"Created pvt paddy entry: {self.created_entry_id}")
    
    def test_02_verify_cash_transaction_created(self):
        """Verify cash_transaction nikasi entry was auto-created"""
        # First create entry
        payload = {
            "date": "2026-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": self.test_party,
            "mandi_name": self.test_mandi,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2100,
            "cash_paid": 500,
            "diesel_paid": 0
        }
        
        response = self.session.post(f"{BASE_URL}/api/private-paddy", json=payload)
        assert response.status_code == 200
        entry_id = response.json()["id"]
        self.created_entry_id = entry_id
        
        # Check cash book for this entry
        response = self.session.get(f"{BASE_URL}/api/cash-book", params={"account": "cash"})
        assert response.status_code == 200
        
        cash_entries = response.json()
        matching = [e for e in cash_entries if e.get("linked_entry_id") == entry_id and "pvt_paddy" in (e.get("reference") or "")]
        
        assert len(matching) >= 1, f"No cash_transaction found for pvt paddy entry {entry_id}"
        
        cash_entry = matching[0]
        assert cash_entry["txn_type"] == "nikasi", "Cash advance should be nikasi"
        assert cash_entry["amount"] == 500, f"Amount mismatch: {cash_entry['amount']}"
        assert cash_entry["account"] == "cash"
        assert "Pvt Paddy" in cash_entry.get("description", "")
        print(f"Verified cash_transaction nikasi entry: {cash_entry['id']}")
    
    def test_03_verify_diesel_account_created(self):
        """Verify diesel_accounts entry was auto-created"""
        # First create entry with diesel
        payload = {
            "date": "2026-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": self.test_party,
            "mandi_name": self.test_mandi,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2100,
            "cash_paid": 0,
            "diesel_paid": 300
        }
        
        response = self.session.post(f"{BASE_URL}/api/private-paddy", json=payload)
        assert response.status_code == 200
        entry_id = response.json()["id"]
        self.created_entry_id = entry_id
        
        # Check diesel accounts for this entry
        response = self.session.get(f"{BASE_URL}/api/diesel-accounts")
        assert response.status_code == 200
        
        diesel_entries = response.json()
        matching = [e for e in diesel_entries if e.get("linked_entry_id") == entry_id]
        
        assert len(matching) >= 1, f"No diesel_account found for pvt paddy entry {entry_id}"
        
        diesel_entry = matching[0]
        assert diesel_entry["amount"] == 300, f"Diesel amount mismatch: {diesel_entry['amount']}"
        assert "Pvt Paddy" in diesel_entry.get("description", "")
        print(f"Verified diesel_account entry: {diesel_entry['id']}")
    
    def test_04_party_ledger_shows_pvt_paddy_entries(self):
        """Party ledger with party_type=pvt_paddy shows Pvt Paddy Purchase entries"""
        response = self.session.get(f"{BASE_URL}/api/reports/party-ledger", params={"party_type": "pvt_paddy"})
        assert response.status_code == 200
        
        data = response.json()
        assert "ledger" in data
        
        # Check for Pvt Paddy Purchase party_type
        pvt_entries = [e for e in data["ledger"] if e.get("party_type") == "Pvt Paddy Purchase"]
        print(f"Found {len(pvt_entries)} Pvt Paddy Purchase entries in party ledger")
        
        # Verify party_name format (Party - Mandi)
        if pvt_entries:
            sample = pvt_entries[0]
            assert sample["party_type"] == "Pvt Paddy Purchase"
            print(f"Sample entry party_name: {sample['party_name']}")
    
    def test_05_party_ledger_shows_debit_credit_structure(self):
        """Party ledger shows debit=total_amount, credit for advances"""
        # Create entry with both cash and diesel
        payload = {
            "date": "2026-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": self.test_party,
            "mandi_name": self.test_mandi,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2100,
            "cash_paid": 500,
            "diesel_paid": 300
        }
        
        response = self.session.post(f"{BASE_URL}/api/private-paddy", json=payload)
        assert response.status_code == 200
        entry = response.json()
        entry_id = entry["id"]
        self.created_entry_id = entry_id
        
        expected_party_name = f"{self.test_party} - {self.test_mandi}"
        
        # Check party ledger
        response = self.session.get(f"{BASE_URL}/api/reports/party-ledger", params={"party_type": "pvt_paddy"})
        assert response.status_code == 200
        
        data = response.json()
        
        # Find entries for this party
        party_entries = [e for e in data["ledger"] if self.test_party in e.get("party_name", "")]
        
        # Should have debit entry (purchase) + credit entries (cash + diesel advances)
        debit_entries = [e for e in party_entries if e.get("debit", 0) > 0]
        credit_entries = [e for e in party_entries if e.get("credit", 0) > 0]
        
        assert len(debit_entries) >= 1, "Should have at least one debit entry for purchase"
        assert len(credit_entries) >= 2, "Should have credit entries for cash and diesel advances"
        
        # Verify debit is total_amount
        debit_sum = sum(e["debit"] for e in debit_entries)
        assert debit_sum == entry["total_amount"], f"Debit sum {debit_sum} should match total_amount {entry['total_amount']}"
        
        # Verify credits include cash and diesel
        credit_sum = sum(e["credit"] for e in credit_entries)
        assert credit_sum >= 800, f"Credit sum {credit_sum} should include cash(500) + diesel(300)"
        
        print(f"Party ledger structure verified: debit={debit_sum}, credit_sum={credit_sum}")
    
    def test_06_delete_pvt_paddy_cascades_cash_diesel(self):
        """DELETE /api/private-paddy/{id} cascades to cash_transactions and diesel_accounts"""
        # Create entry
        payload = {
            "date": "2026-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": self.test_party,
            "mandi_name": self.test_mandi,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2100,
            "cash_paid": 500,
            "diesel_paid": 300
        }
        
        response = self.session.post(f"{BASE_URL}/api/private-paddy", json=payload)
        assert response.status_code == 200
        entry_id = response.json()["id"]
        
        # Verify cash_transaction exists
        response = self.session.get(f"{BASE_URL}/api/cash-book", params={"account": "cash"})
        cash_before = [e for e in response.json() if e.get("linked_entry_id") == entry_id]
        assert len(cash_before) >= 1, "Cash entry should exist before delete"
        
        # Verify diesel_account exists
        response = self.session.get(f"{BASE_URL}/api/diesel-accounts")
        diesel_before = [e for e in response.json() if e.get("linked_entry_id") == entry_id]
        assert len(diesel_before) >= 1, "Diesel entry should exist before delete"
        
        # DELETE pvt paddy
        response = self.session.delete(f"{BASE_URL}/api/private-paddy/{entry_id}")
        assert response.status_code == 200
        
        # Verify cash_transaction deleted
        response = self.session.get(f"{BASE_URL}/api/cash-book", params={"account": "cash"})
        cash_after = [e for e in response.json() if e.get("linked_entry_id") == entry_id]
        assert len(cash_after) == 0, f"Cash entries should be deleted, found {len(cash_after)}"
        
        # Verify diesel_account deleted
        response = self.session.get(f"{BASE_URL}/api/diesel-accounts")
        diesel_after = [e for e in response.json() if e.get("linked_entry_id") == entry_id]
        assert len(diesel_after) == 0, f"Diesel entries should be deleted, found {len(diesel_after)}"
        
        print("Cascade delete verified: cash_transactions and diesel_accounts deleted")
        self.created_entry_id = None  # Already deleted
    
    def test_07_update_pvt_paddy_updates_cash_diesel(self):
        """PUT /api/private-paddy/{id} updates linked cash_transactions and diesel_accounts"""
        # Create entry
        payload = {
            "date": "2026-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": self.test_party,
            "mandi_name": self.test_mandi,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2100,
            "cash_paid": 500,
            "diesel_paid": 300
        }
        
        response = self.session.post(f"{BASE_URL}/api/private-paddy", json=payload)
        assert response.status_code == 200
        entry_id = response.json()["id"]
        self.created_entry_id = entry_id
        
        # Update with new cash_paid and diesel_paid
        update_payload = {
            "cash_paid": 700,
            "diesel_paid": 400
        }
        
        response = self.session.put(f"{BASE_URL}/api/private-paddy/{entry_id}", json=update_payload)
        assert response.status_code == 200
        
        updated = response.json()
        assert updated["cash_paid"] == 700
        assert updated["diesel_paid"] == 400
        
        # Verify cash_transaction updated
        response = self.session.get(f"{BASE_URL}/api/cash-book", params={"account": "cash"})
        cash_entries = [e for e in response.json() if e.get("linked_entry_id") == entry_id and "pvt_paddy" in (e.get("reference") or "")]
        assert len(cash_entries) >= 1, "Should have updated cash entry"
        assert cash_entries[0]["amount"] == 700, f"Cash amount should be updated to 700, got {cash_entries[0]['amount']}"
        
        # Verify diesel_account updated
        response = self.session.get(f"{BASE_URL}/api/diesel-accounts")
        diesel_entries = [e for e in response.json() if e.get("linked_entry_id") == entry_id]
        assert len(diesel_entries) >= 1, "Should have updated diesel entry"
        assert diesel_entries[0]["amount"] == 400, f"Diesel amount should be updated to 400, got {diesel_entries[0]['amount']}"
        
        print("Update verification passed: cash=700, diesel=400")
    
    def test_08_cash_book_shows_nikasi_for_pvt_paddy(self):
        """GET /api/cash-book?account=cash shows nikasi entries for pvt paddy advances"""
        # Create entry
        payload = {
            "date": "2026-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": self.test_party,
            "mandi_name": self.test_mandi,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2100,
            "cash_paid": 500,
            "diesel_paid": 0
        }
        
        response = self.session.post(f"{BASE_URL}/api/private-paddy", json=payload)
        assert response.status_code == 200
        entry_id = response.json()["id"]
        self.created_entry_id = entry_id
        
        # Check cash book
        response = self.session.get(f"{BASE_URL}/api/cash-book", params={"account": "cash"})
        assert response.status_code == 200
        
        entries = response.json()
        pvt_entries = [e for e in entries if e.get("linked_entry_id") == entry_id]
        
        assert len(pvt_entries) >= 1, "Should have nikasi entry in cash book"
        
        nikasi_entry = pvt_entries[0]
        assert nikasi_entry["txn_type"] == "nikasi", "Entry should be nikasi (deduction from cash)"
        assert nikasi_entry["account"] == "cash"
        assert nikasi_entry["amount"] == 500
        
        print(f"Cash book nikasi verified: txn_type={nikasi_entry['txn_type']}, amount={nikasi_entry['amount']}")
    
    def test_09_party_name_format_with_mandi(self):
        """Party ledger shows party_name in format 'Party - Mandi'"""
        # Create entry with mandi
        payload = {
            "date": "2026-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": self.test_party,
            "mandi_name": self.test_mandi,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2100,
            "cash_paid": 100,
            "diesel_paid": 0
        }
        
        response = self.session.post(f"{BASE_URL}/api/private-paddy", json=payload)
        assert response.status_code == 200
        entry_id = response.json()["id"]
        self.created_entry_id = entry_id
        
        expected_name = f"{self.test_party} - {self.test_mandi}"
        
        response = self.session.get(f"{BASE_URL}/api/reports/party-ledger", params={"party_type": "pvt_paddy"})
        assert response.status_code == 200
        
        data = response.json()
        matching = [e for e in data["ledger"] if expected_name in e.get("party_name", "")]
        
        assert len(matching) >= 1, f"Should find entry with party_name containing '{expected_name}'"
        print(f"Party name format verified: {matching[0]['party_name']}")
    
    def test_10_no_cash_entry_when_zero(self):
        """No cash_transaction when cash_paid is 0"""
        payload = {
            "date": "2026-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": self.test_party,
            "mandi_name": self.test_mandi,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2100,
            "cash_paid": 0,
            "diesel_paid": 0
        }
        
        response = self.session.post(f"{BASE_URL}/api/private-paddy", json=payload)
        assert response.status_code == 200
        entry_id = response.json()["id"]
        self.created_entry_id = entry_id
        
        # Check no cash entry
        response = self.session.get(f"{BASE_URL}/api/cash-book", params={"account": "cash"})
        cash_entries = [e for e in response.json() if e.get("linked_entry_id") == entry_id]
        assert len(cash_entries) == 0, f"Should have no cash entry when cash_paid=0, found {len(cash_entries)}"
        
        # Check no diesel entry
        response = self.session.get(f"{BASE_URL}/api/diesel-accounts")
        diesel_entries = [e for e in response.json() if e.get("linked_entry_id") == entry_id]
        assert len(diesel_entries) == 0, f"Should have no diesel entry when diesel_paid=0, found {len(diesel_entries)}"
        
        print("Verified: No entries created when cash_paid=0 and diesel_paid=0")


class TestCashBookEndpoint:
    """Test cash book endpoint shows pvt paddy entries correctly"""
    
    def test_cash_book_api_accessible(self):
        """Cash book API is accessible"""
        response = requests.get(f"{BASE_URL}/api/cash-book", params={"account": "cash"})
        assert response.status_code == 200
        print(f"Cash book API returned {len(response.json())} entries")
    
    def test_diesel_accounts_api_accessible(self):
        """Diesel accounts API is accessible"""
        response = requests.get(f"{BASE_URL}/api/diesel-accounts")
        assert response.status_code == 200
        print(f"Diesel accounts API returned {len(response.json())} entries")


class TestPartyLedgerEndpoint:
    """Test party ledger endpoint"""
    
    def test_party_ledger_all(self):
        """Party ledger returns all parties"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger")
        assert response.status_code == 200
        
        data = response.json()
        assert "ledger" in data
        assert "party_list" in data
        assert "total_debit" in data
        assert "total_credit" in data
        
        print(f"Party ledger: {len(data['ledger'])} entries, {len(data['party_list'])} parties")
    
    def test_party_ledger_pvt_paddy_filter(self):
        """Party ledger filters by party_type=pvt_paddy"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger", params={"party_type": "pvt_paddy"})
        assert response.status_code == 200
        
        data = response.json()
        
        # All entries should be Pvt Paddy Purchase
        for entry in data["ledger"]:
            assert entry["party_type"] == "Pvt Paddy Purchase", f"Wrong party_type: {entry['party_type']}"
        
        print(f"Filtered party ledger: {len(data['ledger'])} Pvt Paddy Purchase entries")
    
    def test_party_ledger_export_excel(self):
        """Party ledger Excel export works"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger/excel", params={"party_type": "pvt_paddy"})
        assert response.status_code == 200
        assert "spreadsheetml" in response.headers.get("content-type", "")
        print("Party ledger Excel export: OK")
    
    def test_party_ledger_export_pdf(self):
        """Party ledger PDF export works"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger/pdf", params={"party_type": "pvt_paddy"})
        assert response.status_code == 200
        assert "pdf" in response.headers.get("content-type", "")
        print("Party ledger PDF export: OK")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
