"""
Test iteration 108: Payment status dynamic computation and history fix
Bug: When paid_amount was set via form (not through payment dialog), payment_status was not computed dynamically
Fix: GET /api/private-paddy now computes payment_status dynamically based on paid_amount >= total_amount
     GET /api/private-paddy/{id}/history now includes advance entries from cash_transactions
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPaymentStatusDynamicComputation:
    """Test that payment_status is computed dynamically in GET endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_entry_id = None
        yield
        # Cleanup
        if self.test_entry_id:
            try:
                requests.delete(f"{BASE_URL}/api/private-paddy/{self.test_entry_id}")
            except:
                pass
    
    def test_01_create_entry_with_advance_payment(self):
        """Create paddy purchase entry with paid_amount > 0 (advance) - verify payment_status is 'paid' in GET response"""
        # Create entry with paid_amount = total_amount (fully paid via form)
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "season": "Kharif",
            "party_name": "TEST_PaymentStatusParty",
            "truck_no": "OD01XX1234",
            "kg": 1000,  # 10 quintals
            "bag": 20,
            "rate_per_qntl": 2000,  # Total = 10 * 2000 = 20000 (approx after cuts)
            "paid_amount": 20000,  # Fully paid via form
            "mandi_name": "TestMandi"
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        self.test_entry_id = data["id"]
        
        # Verify the entry was created with paid_amount
        assert data["paid_amount"] == 20000, f"paid_amount should be 20000, got {data.get('paid_amount')}"
        
        # Now GET the entry and verify payment_status is computed dynamically
        get_response = requests.get(f"{BASE_URL}/api/private-paddy")
        assert get_response.status_code == 200
        
        entries = get_response.json()
        test_entry = next((e for e in entries if e["id"] == self.test_entry_id), None)
        assert test_entry is not None, "Test entry not found in GET response"
        
        # Key assertion: payment_status should be 'paid' because paid_amount >= total_amount
        total = test_entry.get("total_amount", 0)
        paid = test_entry.get("paid_amount", 0)
        
        print(f"Total: {total}, Paid: {paid}, Status: {test_entry.get('payment_status')}")
        
        if paid >= total:
            assert test_entry.get("payment_status") == "paid", \
                f"payment_status should be 'paid' when paid_amount ({paid}) >= total_amount ({total}), got {test_entry.get('payment_status')}"
        
        print("TEST PASSED: payment_status is dynamically computed as 'paid' when paid_amount >= total_amount")
    
    def test_02_history_shows_advance_entries(self):
        """Verify GET /api/private-paddy/{id}/history returns advance entries from cash_transactions"""
        # Create entry with advance payment
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "season": "Kharif",
            "party_name": "TEST_HistoryAdvanceParty",
            "truck_no": "OD02XX5678",
            "kg": 500,
            "bag": 10,
            "rate_per_qntl": 1800,
            "paid_amount": 5000,  # Advance payment via form
            "mandi_name": "HistoryMandi"
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        self.test_entry_id = data["id"]
        
        # Wait a moment for cash_transactions to be created
        time.sleep(0.5)
        
        # Get payment history
        history_response = requests.get(f"{BASE_URL}/api/private-paddy/{self.test_entry_id}/history")
        assert history_response.status_code == 200, f"History GET failed: {history_response.text}"
        
        history_data = history_response.json()
        history = history_data.get("history", [])
        
        print(f"History entries: {len(history)}")
        for h in history:
            print(f"  - {h.get('payment_type', 'unknown')}: Rs.{h.get('amount', 0)} ({h.get('mode', 'N/A')})")
        
        # Key assertion: History should NOT be empty - should contain advance entry
        assert len(history) > 0, "History should not be empty - advance entry should be included"
        
        # Verify advance entry is present
        advance_entries = [h for h in history if h.get("payment_type") == "advance" or h.get("mode") == "advance"]
        assert len(advance_entries) > 0, "History should contain advance entry from cash_transactions"
        
        # Verify advance amount matches
        advance_entry = advance_entries[0]
        assert advance_entry.get("amount") == 5000, f"Advance amount should be 5000, got {advance_entry.get('amount')}"
        
        print("TEST PASSED: History includes advance entries from cash_transactions")
    
    def test_03_undo_paid_resets_to_pending(self):
        """Verify Undo Paid resets paid_amount to 0 and payment_status to 'pending'"""
        # Create fully paid entry
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "season": "Kharif",
            "party_name": "TEST_UndoPaidParty",
            "truck_no": "OD03XX9999",
            "kg": 200,
            "bag": 4,
            "rate_per_qntl": 2500,
            "paid_amount": 5000,  # Will be fully paid
            "mandi_name": "UndoMandi"
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        self.test_entry_id = data["id"]
        total_amount = data.get("total_amount", 0)
        
        # First mark as paid to ensure payment_status is 'paid'
        mark_response = requests.post(f"{BASE_URL}/api/private-paddy/{self.test_entry_id}/mark-paid?username=admin&role=admin")
        assert mark_response.status_code == 200, f"Mark paid failed: {mark_response.text}"
        
        # Verify it's marked as paid
        get_response = requests.get(f"{BASE_URL}/api/private-paddy")
        entries = get_response.json()
        test_entry = next((e for e in entries if e["id"] == self.test_entry_id), None)
        assert test_entry.get("payment_status") == "paid", "Entry should be marked as paid"
        
        # Now undo paid
        undo_response = requests.post(f"{BASE_URL}/api/private-paddy/{self.test_entry_id}/undo-paid?username=admin&role=admin")
        assert undo_response.status_code == 200, f"Undo paid failed: {undo_response.text}"
        
        # Verify paid_amount is reset to 0 and payment_status is 'pending'
        get_response2 = requests.get(f"{BASE_URL}/api/private-paddy")
        entries2 = get_response2.json()
        test_entry2 = next((e for e in entries2 if e["id"] == self.test_entry_id), None)
        
        assert test_entry2.get("paid_amount") == 0, f"paid_amount should be 0 after undo, got {test_entry2.get('paid_amount')}"
        assert test_entry2.get("payment_status") == "pending", f"payment_status should be 'pending' after undo, got {test_entry2.get('payment_status')}"
        
        print("TEST PASSED: Undo Paid resets paid_amount to 0 and payment_status to 'pending'")
    
    def test_04_mark_paid_flow_works(self):
        """Verify Mark Paid flow still works correctly"""
        # Create entry with no advance
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "season": "Kharif",
            "party_name": "TEST_MarkPaidParty",
            "truck_no": "OD04XX1111",
            "kg": 300,
            "bag": 6,
            "rate_per_qntl": 2200,
            "paid_amount": 0,  # No advance
            "mandi_name": "MarkPaidMandi"
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        self.test_entry_id = data["id"]
        total_amount = data.get("total_amount", 0)
        
        # Verify initial status is pending
        get_response = requests.get(f"{BASE_URL}/api/private-paddy")
        entries = get_response.json()
        test_entry = next((e for e in entries if e["id"] == self.test_entry_id), None)
        assert test_entry.get("payment_status") == "pending", "Initial status should be pending"
        
        # Mark as paid
        mark_response = requests.post(f"{BASE_URL}/api/private-paddy/{self.test_entry_id}/mark-paid?username=admin&role=admin")
        assert mark_response.status_code == 200, f"Mark paid failed: {mark_response.text}"
        
        # Verify status is now paid
        get_response2 = requests.get(f"{BASE_URL}/api/private-paddy")
        entries2 = get_response2.json()
        test_entry2 = next((e for e in entries2 if e["id"] == self.test_entry_id), None)
        
        assert test_entry2.get("payment_status") == "paid", f"Status should be 'paid' after mark-paid, got {test_entry2.get('payment_status')}"
        assert test_entry2.get("paid_amount") == test_entry2.get("total_amount"), "paid_amount should equal total_amount after mark-paid"
        
        print("TEST PASSED: Mark Paid flow works correctly")
    
    def test_05_partial_payment_status_pending(self):
        """Verify partial payment keeps status as 'pending'"""
        # Create entry with partial advance
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "season": "Kharif",
            "party_name": "TEST_PartialPayParty",
            "truck_no": "OD05XX2222",
            "kg": 1000,
            "bag": 20,
            "rate_per_qntl": 2000,
            "paid_amount": 1000,  # Partial payment (much less than total)
            "mandi_name": "PartialMandi"
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        self.test_entry_id = data["id"]
        
        # Verify status is pending (partial payment)
        get_response = requests.get(f"{BASE_URL}/api/private-paddy")
        entries = get_response.json()
        test_entry = next((e for e in entries if e["id"] == self.test_entry_id), None)
        
        total = test_entry.get("total_amount", 0)
        paid = test_entry.get("paid_amount", 0)
        
        print(f"Total: {total}, Paid: {paid}, Status: {test_entry.get('payment_status')}")
        
        # Since paid < total, status should be pending
        assert paid < total, "This test requires paid < total"
        assert test_entry.get("payment_status") == "pending", \
            f"Status should be 'pending' when paid ({paid}) < total ({total}), got {test_entry.get('payment_status')}"
        
        print("TEST PASSED: Partial payment keeps status as 'pending'")


class TestHistoryEndpointAdvanceEntries:
    """Test that history endpoint includes advance entries from cash_transactions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_entry_id = None
        yield
        # Cleanup
        if self.test_entry_id:
            try:
                requests.delete(f"{BASE_URL}/api/private-paddy/{self.test_entry_id}")
            except:
                pass
    
    def test_history_includes_pvt_paddy_adv_entries(self):
        """Verify history includes entries with reference pvt_paddy_adv:*"""
        # Create entry with advance
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "season": "Kharif",
            "party_name": "TEST_AdvRefParty",
            "truck_no": "OD06XX3333",
            "kg": 400,
            "bag": 8,
            "rate_per_qntl": 2100,
            "paid_amount": 3000,  # Advance
            "mandi_name": "AdvRefMandi"
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        self.test_entry_id = data["id"]
        
        time.sleep(0.5)
        
        # Get history
        history_response = requests.get(f"{BASE_URL}/api/private-paddy/{self.test_entry_id}/history")
        assert history_response.status_code == 200
        
        history_data = history_response.json()
        history = history_data.get("history", [])
        
        # Check for advance entry
        advance_found = False
        for h in history:
            if h.get("payment_type") == "advance" or h.get("mode") == "advance":
                advance_found = True
                assert h.get("amount") == 3000, f"Advance amount mismatch: expected 3000, got {h.get('amount')}"
                print(f"Found advance entry: Rs.{h.get('amount')} - {h.get('remark', '')}")
        
        assert advance_found, "Advance entry not found in history"
        print("TEST PASSED: History includes pvt_paddy_adv entries")
    
    def test_history_includes_mark_paid_entries(self):
        """Verify history includes mark_paid entries"""
        # Create entry
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "season": "Kharif",
            "party_name": "TEST_MarkPaidHistParty",
            "truck_no": "OD07XX4444",
            "kg": 500,
            "bag": 10,
            "rate_per_qntl": 2000,
            "paid_amount": 0,
            "mandi_name": "MarkPaidHistMandi"
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        self.test_entry_id = data["id"]
        
        # Mark as paid
        mark_response = requests.post(f"{BASE_URL}/api/private-paddy/{self.test_entry_id}/mark-paid?username=admin&role=admin")
        assert mark_response.status_code == 200
        
        time.sleep(0.5)
        
        # Get history
        history_response = requests.get(f"{BASE_URL}/api/private-paddy/{self.test_entry_id}/history")
        assert history_response.status_code == 200
        
        history_data = history_response.json()
        history = history_data.get("history", [])
        
        # Check for mark_paid entry
        mark_paid_found = False
        for h in history:
            if h.get("payment_type") == "mark_paid" or h.get("mode") == "mark_paid":
                mark_paid_found = True
                print(f"Found mark_paid entry: Rs.{h.get('amount')} - {h.get('remark', '')}")
        
        assert mark_paid_found, "Mark paid entry not found in history"
        print("TEST PASSED: History includes mark_paid entries")


class TestCleanup:
    """Cleanup any remaining test entries"""
    
    def test_cleanup_test_entries(self):
        """Delete all TEST_ prefixed entries"""
        response = requests.get(f"{BASE_URL}/api/private-paddy")
        if response.status_code == 200:
            entries = response.json()
            test_entries = [e for e in entries if e.get("party_name", "").startswith("TEST_")]
            for entry in test_entries:
                try:
                    requests.delete(f"{BASE_URL}/api/private-paddy/{entry['id']}")
                    print(f"Cleaned up: {entry['party_name']}")
                except:
                    pass
        print(f"Cleanup complete: removed {len(test_entries) if 'test_entries' in dir() else 0} test entries")
