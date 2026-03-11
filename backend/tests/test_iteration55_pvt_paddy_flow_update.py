"""
Test Iteration 55: Pvt Paddy Purchase Flow Update

Key Changes:
- Cash+Diesel go to Truck Payment (category=truck_no, party_type='Truck')
- Advance (paid_amount) goes to Party Ledger as credit
- Cash/Diesel should NOT appear in Party Ledger
- Cash+Advance deduct from Cash Book
- Diesel goes to Diesel Account

Tests:
1. POST /api/private-paddy with cash_paid creates cash book nikasi under truck_no with party_type='Truck'
2. POST /api/private-paddy with cash_paid creates truck ledger nikasi (account=ledger) under truck_no
3. POST /api/private-paddy with diesel_paid creates diesel_accounts entry AND truck ledger nikasi
4. POST /api/private-paddy with paid_amount (advance) creates cash book nikasi under party_label with party_type='Pvt Paddy Purchase'
5. GET /api/reports/party-ledger?party_type=pvt_paddy shows total_amount as debit and advance (paid_amount) as credit ONLY - NO cash/diesel credits
6. DELETE /api/private-paddy/{id} cascades delete all linked cash_transactions and diesel_accounts
7. PUT /api/private-paddy/{id} with empty string fields should NOT error (float conversion fix)
8. GET /api/cash-book?account=cash shows pvt_paddy entries - cash under truck, advance under party
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPvtPaddyFlowUpdate:
    """Test the updated Pvt Paddy Purchase flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_party = f"TEST_ITER55_{uuid.uuid4().hex[:8]}"
        self.test_mandi = "TEST_MANDI_55"
        self.test_truck = f"OD55{uuid.uuid4().hex[:4].upper()}"
        self.created_entry_ids = []
        yield
        # Cleanup
        for entry_id in self.created_entry_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/private-paddy/{entry_id}")
            except:
                pass
    
    def test_01_cash_paid_creates_truck_cash_book_entry(self):
        """Cash paid creates cash book nikasi under truck_no with party_type='Truck'"""
        payload = {
            "date": "2026-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": self.test_party,
            "mandi_name": self.test_mandi,
            "truck_no": self.test_truck,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2100,
            "cash_paid": 500,
            "diesel_paid": 0,
            "paid_amount": 0
        }
        
        response = self.session.post(f"{BASE_URL}/api/private-paddy", json=payload)
        assert response.status_code == 200, f"Failed to create: {response.text}"
        entry_id = response.json()["id"]
        self.created_entry_ids.append(entry_id)
        
        # Check cash book for truck entry
        response = self.session.get(f"{BASE_URL}/api/cash-book", params={"account": "cash"})
        assert response.status_code == 200
        
        entries = response.json()
        truck_entries = [e for e in entries if e.get("linked_entry_id") == entry_id 
                        and e.get("category") == self.test_truck
                        and e.get("party_type") == "Truck"]
        
        assert len(truck_entries) == 1, f"Expected 1 truck cash book entry, found {len(truck_entries)}"
        
        entry = truck_entries[0]
        assert entry["txn_type"] == "nikasi", "Should be nikasi (cash out)"
        assert entry["amount"] == 500, f"Amount should be 500, got {entry['amount']}"
        assert entry["account"] == "cash"
        assert "pvt_paddy_cash" in entry.get("reference", "")
        print(f"PASSED: Cash book nikasi created under truck {self.test_truck}")
    
    def test_02_cash_paid_creates_truck_ledger_entry(self):
        """Cash paid creates truck ledger nikasi (account=ledger)"""
        payload = {
            "date": "2026-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": self.test_party,
            "mandi_name": self.test_mandi,
            "truck_no": self.test_truck,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2100,
            "cash_paid": 600,
            "diesel_paid": 0,
            "paid_amount": 0
        }
        
        response = self.session.post(f"{BASE_URL}/api/private-paddy", json=payload)
        assert response.status_code == 200
        entry_id = response.json()["id"]
        self.created_entry_ids.append(entry_id)
        
        # Check truck ledger entries
        response = self.session.get(f"{BASE_URL}/api/cash-book", params={"account": "ledger"})
        assert response.status_code == 200
        
        entries = response.json()
        truck_ledger = [e for e in entries if e.get("linked_entry_id") == entry_id 
                       and e.get("category") == self.test_truck
                       and e.get("party_type") == "Truck"]
        
        assert len(truck_ledger) == 1, f"Expected 1 truck ledger entry, found {len(truck_ledger)}"
        
        entry = truck_ledger[0]
        assert entry["txn_type"] == "nikasi"
        assert entry["amount"] == 600
        assert entry["account"] == "ledger"
        assert "pvt_paddy_tcash" in entry.get("reference", "")
        print(f"PASSED: Truck ledger nikasi created for cash payment")
    
    def test_03_diesel_paid_creates_diesel_and_truck_ledger(self):
        """Diesel paid creates diesel_accounts AND truck ledger nikasi"""
        payload = {
            "date": "2026-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": self.test_party,
            "mandi_name": self.test_mandi,
            "truck_no": self.test_truck,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2100,
            "cash_paid": 0,
            "diesel_paid": 350,
            "paid_amount": 0
        }
        
        response = self.session.post(f"{BASE_URL}/api/private-paddy", json=payload)
        assert response.status_code == 200
        entry_id = response.json()["id"]
        self.created_entry_ids.append(entry_id)
        
        # Check diesel accounts
        response = self.session.get(f"{BASE_URL}/api/diesel-accounts")
        assert response.status_code == 200
        
        diesel_entries = [e for e in response.json() if e.get("linked_entry_id") == entry_id]
        assert len(diesel_entries) == 1, f"Expected 1 diesel entry, found {len(diesel_entries)}"
        
        diesel = diesel_entries[0]
        assert diesel["amount"] == 350
        assert diesel["truck_no"] == self.test_truck
        assert diesel["txn_type"] == "debit"
        
        # Check truck ledger for diesel
        response = self.session.get(f"{BASE_URL}/api/cash-book", params={"account": "ledger"})
        truck_diesel = [e for e in response.json() if e.get("linked_entry_id") == entry_id
                       and "pvt_paddy_tdiesel" in (e.get("reference") or "")]
        
        assert len(truck_diesel) == 1, "Should have truck ledger entry for diesel"
        assert truck_diesel[0]["amount"] == 350
        assert truck_diesel[0]["category"] == self.test_truck
        print(f"PASSED: Diesel account AND truck ledger created")
    
    def test_04_advance_creates_party_cash_book_entry(self):
        """Advance (paid_amount) creates cash book nikasi under party with party_type='Pvt Paddy Purchase'"""
        payload = {
            "date": "2026-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": self.test_party,
            "mandi_name": self.test_mandi,
            "truck_no": self.test_truck,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2100,
            "cash_paid": 0,
            "diesel_paid": 0,
            "paid_amount": 400  # This is the advance
        }
        
        response = self.session.post(f"{BASE_URL}/api/private-paddy", json=payload)
        assert response.status_code == 200
        entry_id = response.json()["id"]
        self.created_entry_ids.append(entry_id)
        
        expected_party_label = f"{self.test_party} - {self.test_mandi}"
        
        # Check cash book for party advance entry
        response = self.session.get(f"{BASE_URL}/api/cash-book", params={"account": "cash"})
        assert response.status_code == 200
        
        entries = response.json()
        advance_entries = [e for e in entries if e.get("linked_entry_id") == entry_id 
                         and e.get("party_type") == "Pvt Paddy Purchase"]
        
        assert len(advance_entries) == 1, f"Expected 1 advance entry, found {len(advance_entries)}"
        
        entry = advance_entries[0]
        assert entry["txn_type"] == "nikasi"
        assert entry["amount"] == 400
        assert entry["category"] == expected_party_label
        assert "pvt_paddy_adv" in entry.get("reference", "")
        print(f"PASSED: Advance creates cash book nikasi under party")
    
    def test_05_party_ledger_shows_debit_and_advance_credit_only(self):
        """Party ledger shows total_amount as debit, advance as credit - NO cash/diesel"""
        payload = {
            "date": "2026-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": self.test_party,
            "mandi_name": self.test_mandi,
            "truck_no": self.test_truck,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2100,
            "cash_paid": 500,      # Should NOT appear in party ledger
            "diesel_paid": 300,    # Should NOT appear in party ledger
            "paid_amount": 200     # ONLY this should appear as credit
        }
        
        response = self.session.post(f"{BASE_URL}/api/private-paddy", json=payload)
        assert response.status_code == 200
        entry = response.json()
        entry_id = entry["id"]
        self.created_entry_ids.append(entry_id)
        
        expected_total_amount = entry["total_amount"]
        
        # Get party ledger
        response = self.session.get(f"{BASE_URL}/api/reports/party-ledger", params={"party_type": "pvt_paddy"})
        assert response.status_code == 200
        
        ledger = response.json()["ledger"]
        party_entries = [e for e in ledger if self.test_party in e.get("party_name", "")]
        
        # Should have exactly 2 entries: 1 debit (purchase) + 1 credit (advance)
        assert len(party_entries) == 2, f"Expected 2 entries, found {len(party_entries)}: {party_entries}"
        
        debit_entries = [e for e in party_entries if e.get("debit", 0) > 0]
        credit_entries = [e for e in party_entries if e.get("credit", 0) > 0]
        
        # Verify debit = total_amount
        assert len(debit_entries) == 1, "Should have exactly 1 debit entry"
        assert debit_entries[0]["debit"] == expected_total_amount
        
        # Verify credit = advance only (NOT cash + diesel + advance)
        assert len(credit_entries) == 1, f"Should have exactly 1 credit entry (advance only), found {len(credit_entries)}"
        assert credit_entries[0]["credit"] == 200, f"Credit should be 200 (advance only), got {credit_entries[0]['credit']}"
        
        # Verify no cash/diesel in party ledger
        total_credit = sum(e["credit"] for e in party_entries)
        assert total_credit == 200, f"Total credit should be 200 (advance only), not {total_credit}"
        
        print(f"PASSED: Party ledger shows debit={expected_total_amount}, credit=200 (advance only)")
    
    def test_06_delete_cascades_to_all_linked_entries(self):
        """DELETE cascades to cash_transactions and diesel_accounts"""
        payload = {
            "date": "2026-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": self.test_party,
            "mandi_name": self.test_mandi,
            "truck_no": self.test_truck,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2100,
            "cash_paid": 500,
            "diesel_paid": 300,
            "paid_amount": 200
        }
        
        response = self.session.post(f"{BASE_URL}/api/private-paddy", json=payload)
        assert response.status_code == 200
        entry_id = response.json()["id"]
        
        # Verify entries exist before delete
        cash_before = self._get_linked_cash_entries(entry_id)
        diesel_before = self._get_linked_diesel_entries(entry_id)
        ledger_before = self._get_linked_ledger_entries(entry_id)
        
        # Cash: 1 for truck cash, 1 for advance = 2
        # Ledger: 1 for truck cash ledger, 1 for truck diesel ledger = 2
        # Diesel: 1 = 1
        assert len(cash_before) >= 2, f"Expected 2+ cash entries, found {len(cash_before)}"
        assert len(diesel_before) >= 1, f"Expected 1+ diesel entry, found {len(diesel_before)}"
        assert len(ledger_before) >= 2, f"Expected 2+ ledger entries, found {len(ledger_before)}"
        
        # DELETE
        response = self.session.delete(f"{BASE_URL}/api/private-paddy/{entry_id}")
        assert response.status_code == 200
        
        # Verify all deleted
        cash_after = self._get_linked_cash_entries(entry_id)
        diesel_after = self._get_linked_diesel_entries(entry_id)
        ledger_after = self._get_linked_ledger_entries(entry_id)
        
        assert len(cash_after) == 0, f"Cash entries should be deleted, found {len(cash_after)}"
        assert len(diesel_after) == 0, f"Diesel entries should be deleted, found {len(diesel_after)}"
        assert len(ledger_after) == 0, f"Ledger entries should be deleted, found {len(ledger_after)}"
        
        print("PASSED: CASCADE DELETE removed all linked entries")
    
    def test_07_put_with_empty_strings_no_error(self):
        """PUT with empty string fields should NOT error"""
        payload = {
            "date": "2026-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": self.test_party,
            "mandi_name": self.test_mandi,
            "truck_no": self.test_truck,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2100,
            "cash_paid": 500,
            "diesel_paid": 300,
            "paid_amount": 200
        }
        
        response = self.session.post(f"{BASE_URL}/api/private-paddy", json=payload)
        assert response.status_code == 200
        entry_id = response.json()["id"]
        self.created_entry_ids.append(entry_id)
        
        # Update with empty strings (frontend might send these)
        update_payload = {
            "cash_paid": "",
            "diesel_paid": "",
            "paid_amount": "",
            "kg": "",
            "rate_per_qntl": "",
            "moisture": "",
            "cutting_percent": ""
        }
        
        response = self.session.put(f"{BASE_URL}/api/private-paddy/{entry_id}", json=update_payload)
        assert response.status_code == 200, f"PUT with empty strings failed: {response.text}"
        
        updated = response.json()
        # Empty strings should convert to 0
        assert updated["cash_paid"] == 0
        assert updated["diesel_paid"] == 0
        assert updated["paid_amount"] == 0
        
        print("PASSED: PUT with empty strings handled correctly")
    
    def test_08_cash_book_shows_correct_entries(self):
        """Cash book shows pvt_paddy entries - cash under truck, advance under party"""
        payload = {
            "date": "2026-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": self.test_party,
            "mandi_name": self.test_mandi,
            "truck_no": self.test_truck,
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2100,
            "cash_paid": 500,
            "diesel_paid": 300,
            "paid_amount": 200
        }
        
        response = self.session.post(f"{BASE_URL}/api/private-paddy", json=payload)
        assert response.status_code == 200
        entry_id = response.json()["id"]
        self.created_entry_ids.append(entry_id)
        
        # Get all cash book entries
        response = self.session.get(f"{BASE_URL}/api/cash-book", params={"account": "cash"})
        assert response.status_code == 200
        
        entries = response.json()
        linked = [e for e in entries if e.get("linked_entry_id") == entry_id]
        
        # Should have 2 cash entries: truck cash + advance
        assert len(linked) == 2, f"Expected 2 cash entries, found {len(linked)}"
        
        truck_cash = [e for e in linked if e.get("category") == self.test_truck]
        advance = [e for e in linked if e.get("party_type") == "Pvt Paddy Purchase"]
        
        assert len(truck_cash) == 1, "Should have 1 truck cash entry"
        assert truck_cash[0]["amount"] == 500
        
        assert len(advance) == 1, "Should have 1 advance entry"
        assert advance[0]["amount"] == 200
        
        # Total cash deducted = 500 + 200 = 700 (diesel not in cash book)
        total_nikasi = sum(e["amount"] for e in linked)
        assert total_nikasi == 700, f"Total cash nikasi should be 700, got {total_nikasi}"
        
        print("PASSED: Cash book shows correct entries")
    
    # Helper methods
    def _get_linked_cash_entries(self, entry_id):
        response = self.session.get(f"{BASE_URL}/api/cash-book", params={"account": "cash"})
        return [e for e in response.json() if e.get("linked_entry_id") == entry_id]
    
    def _get_linked_diesel_entries(self, entry_id):
        response = self.session.get(f"{BASE_URL}/api/diesel-accounts")
        return [e for e in response.json() if e.get("linked_entry_id") == entry_id]
    
    def _get_linked_ledger_entries(self, entry_id):
        response = self.session.get(f"{BASE_URL}/api/cash-book", params={"account": "ledger"})
        return [e for e in response.json() if e.get("linked_entry_id") == entry_id]


class TestExistingData:
    """Test with existing data mentioned in requirements"""
    
    def test_party_ledger_no_cash_diesel_credits(self):
        """Party ledger for pvt_paddy should NOT have cash/diesel as credits"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger", params={"party_type": "pvt_paddy"})
        assert response.status_code == 200
        
        data = response.json()
        
        # Check all credit entries - none should mention cash/diesel
        for entry in data["ledger"]:
            if entry.get("credit", 0) > 0:
                desc = entry.get("description", "").lower()
                # Credit description should be about "Advance" not "Cash" or "Diesel"
                # Allow "Payment" which is from private_payments
                # Disallow "Cash Paid" or "Diesel Paid" as standalone credits
                assert "cash paid:" not in desc and "diesel paid:" not in desc, \
                    f"Party ledger should not show cash/diesel as credit: {entry}"
        
        print(f"PASSED: Party ledger has no cash/diesel credit entries")
    
    def test_frontend_pvt_trading_loads(self):
        """Frontend Pvt Trading page should load (basic check)"""
        response = requests.get(f"{BASE_URL}/api/private-paddy")
        assert response.status_code == 200
        
        data = response.json()
        print(f"PASSED: Private paddy API returns {len(data)} entries")
    
    def test_existing_raju_buria_entry(self):
        """Check if existing Raju-Buria entry has correct linked entries"""
        response = requests.get(f"{BASE_URL}/api/private-paddy")
        assert response.status_code == 200
        
        entries = response.json()
        raju_entries = [e for e in entries if "Raju" in (e.get("party_name") or "") 
                       and e.get("truck_no") == "OD19E2587"]
        
        if raju_entries:
            entry = raju_entries[0]
            print(f"Found Raju-Buria entry: cash={entry.get('cash_paid')}, diesel={entry.get('diesel_paid')}, advance={entry.get('paid_amount')}")
            
            # Check linked entries
            entry_id = entry["id"]
            
            # Check truck ledger
            response = requests.get(f"{BASE_URL}/api/cash-book", params={"account": "ledger"})
            truck_ledger = [e for e in response.json() if e.get("linked_entry_id") == entry_id]
            print(f"Truck ledger entries: {len(truck_ledger)}")
        else:
            print("No Raju-Buria entry found with truck OD19E2587")


class TestEndpointsAccessibility:
    """Basic accessibility tests for all relevant endpoints"""
    
    def test_private_paddy_api(self):
        response = requests.get(f"{BASE_URL}/api/private-paddy")
        assert response.status_code == 200
        print(f"Private paddy API: OK - {len(response.json())} entries")
    
    def test_cash_book_cash_api(self):
        response = requests.get(f"{BASE_URL}/api/cash-book", params={"account": "cash"})
        assert response.status_code == 200
        print(f"Cash book (cash) API: OK - {len(response.json())} entries")
    
    def test_cash_book_ledger_api(self):
        response = requests.get(f"{BASE_URL}/api/cash-book", params={"account": "ledger"})
        assert response.status_code == 200
        print(f"Cash book (ledger) API: OK - {len(response.json())} entries")
    
    def test_diesel_accounts_api(self):
        response = requests.get(f"{BASE_URL}/api/diesel-accounts")
        assert response.status_code == 200
        print(f"Diesel accounts API: OK - {len(response.json())} entries")
    
    def test_party_ledger_api(self):
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger", params={"party_type": "pvt_paddy"})
        assert response.status_code == 200
        data = response.json()
        assert "ledger" in data
        assert "total_debit" in data
        assert "total_credit" in data
        print(f"Party ledger (pvt_paddy) API: OK - {len(data['ledger'])} entries")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
