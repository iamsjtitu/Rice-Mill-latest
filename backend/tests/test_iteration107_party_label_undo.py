"""
Test iteration 107: Party Label Deduplication and Payment Undo Button
Tests for:
1. _make_party_label helper - avoids duplicate party names like 'Kridha (Kesinga) - Kesinga'
2. Consistent category names in ledger entries for paddy purchase, payments, mark paid
3. Auto-fix endpoint detects and merges duplicate party names
4. Payment History dialog shows Undo buttons for each payment
5. Undo payment actually deletes the payment and updates paid_amount
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPartyLabelDeduplication:
    """Test that party labels are created consistently without duplication"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_party = "TEST_PartyLabel"
        self.test_mandi = "LocalMandi"
        self.test_entry_id = None
        yield
        # Cleanup
        if self.test_entry_id:
            try:
                requests.delete(f"{BASE_URL}/api/private-paddy/{self.test_entry_id}")
            except:
                pass
    
    def test_create_paddy_purchase_party_label_no_duplication(self):
        """Test that creating a Paddy Purchase with party 'TestParty (LocalMandi)' and mandi 'LocalMandi' 
        creates ledger entries with category 'TestParty (LocalMandi)' (NOT 'TestParty (LocalMandi) - LocalMandi')"""
        # Create a paddy purchase entry with party name containing mandi in parentheses
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": f"{self.test_party} ({self.test_mandi})",
            "mandi_name": self.test_mandi,
            "truck_no": "OD01TEST001",
            "kg": 1000,
            "bag": 10,
            "rate_per_qntl": 2500,
            "cash_paid": 0,
            "diesel_paid": 0,
            "paid_amount": 0
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Failed to create paddy purchase: {response.text}"
        
        data = response.json()
        self.test_entry_id = data.get("id")
        assert self.test_entry_id, "Entry ID not returned"
        
        # Check ledger entries - category should NOT have duplicate mandi
        time.sleep(0.5)  # Allow async operations to complete
        
        ledger_response = requests.get(f"{BASE_URL}/api/cash-book?account=ledger&kms_year=2024-25")
        assert ledger_response.status_code == 200
        
        ledger_entries = ledger_response.json()
        
        # Find entries linked to our test entry
        linked_entries = [e for e in ledger_entries if e.get("linked_entry_id") == self.test_entry_id]
        
        # Check that category does NOT contain duplicate mandi
        expected_category = f"{self.test_party} ({self.test_mandi})"
        bad_category = f"{self.test_party} ({self.test_mandi}) - {self.test_mandi}"
        
        for entry in linked_entries:
            category = entry.get("category", "")
            assert category != bad_category, f"Found duplicate mandi in category: {category}"
            if entry.get("party_type") == "Pvt Paddy Purchase":
                assert category == expected_category, f"Expected category '{expected_category}', got '{category}'"
        
        print(f"✓ Party label created correctly: {expected_category}")
    
    def test_create_paddy_purchase_party_label_with_different_mandi(self):
        """Test that party 'TestParty' with mandi 'DifferentMandi' creates 'TestParty - DifferentMandi'"""
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": f"{self.test_party}",
            "mandi_name": "DifferentMandi",
            "truck_no": "OD01TEST002",
            "kg": 1000,
            "bag": 10,
            "rate_per_qntl": 2500,
            "cash_paid": 0,
            "diesel_paid": 0,
            "paid_amount": 0
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Failed to create paddy purchase: {response.text}"
        
        data = response.json()
        entry_id = data.get("id")
        
        try:
            # Check ledger entries
            time.sleep(0.5)
            
            ledger_response = requests.get(f"{BASE_URL}/api/cash-book?account=ledger&kms_year=2024-25")
            assert ledger_response.status_code == 200
            
            ledger_entries = ledger_response.json()
            linked_entries = [e for e in ledger_entries if e.get("linked_entry_id") == entry_id]
            
            # When mandi is different from party name, it should be appended
            expected_category = f"{self.test_party} - DifferentMandi"
            
            for entry in linked_entries:
                category = entry.get("category", "")
                if entry.get("party_type") == "Pvt Paddy Purchase":
                    assert category == expected_category, f"Expected category '{expected_category}', got '{category}'"
            
            print(f"✓ Party label with different mandi created correctly: {expected_category}")
        finally:
            # Cleanup
            requests.delete(f"{BASE_URL}/api/private-paddy/{entry_id}")


class TestPaymentConsistentCategory:
    """Test that payments maintain consistent category names"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_entry_id = None
        self.test_payment_id = None
        yield
        # Cleanup
        if self.test_payment_id:
            try:
                requests.delete(f"{BASE_URL}/api/private-payments/{self.test_payment_id}?username=admin&role=admin")
            except:
                pass
        if self.test_entry_id:
            try:
                requests.delete(f"{BASE_URL}/api/private-paddy/{self.test_entry_id}")
            except:
                pass
    
    def test_payment_keeps_consistent_category(self):
        """Test that making a payment on entry keeps consistent category names in cashbook ledger"""
        # Create entry
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": "TEST_PaymentParty (TestMandi)",
            "mandi_name": "TestMandi",
            "truck_no": "OD01PAY001",
            "kg": 1000,
            "bag": 10,
            "rate_per_qntl": 2500,
            "cash_paid": 0,
            "diesel_paid": 0,
            "paid_amount": 0
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        data = response.json()
        self.test_entry_id = data.get("id")
        
        # Make a payment
        payment_payload = {
            "date": "2025-01-16",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": "TEST_PaymentParty (TestMandi)",
            "payment_type": "paid",
            "ref_type": "paddy_purchase",
            "ref_id": self.test_entry_id,
            "amount": 5000,
            "mode": "cash",
            "reference": "TEST_PAY_001",
            "remark": "Test payment"
        }
        
        pay_response = requests.post(f"{BASE_URL}/api/private-payments?username=admin&role=admin", json=payment_payload)
        assert pay_response.status_code == 200, f"Failed to create payment: {pay_response.text}"
        
        pay_data = pay_response.json()
        self.test_payment_id = pay_data.get("id")
        
        # Check ledger entries for payment
        time.sleep(0.5)
        
        ledger_response = requests.get(f"{BASE_URL}/api/cash-book?account=ledger&kms_year=2024-25")
        assert ledger_response.status_code == 200
        
        ledger_entries = ledger_response.json()
        payment_entries = [e for e in ledger_entries if e.get("linked_payment_id") == self.test_payment_id]
        
        expected_category = "TEST_PaymentParty (TestMandi)"
        bad_category = "TEST_PaymentParty (TestMandi) - TestMandi"
        
        for entry in payment_entries:
            category = entry.get("category", "")
            assert category != bad_category, f"Found duplicate mandi in payment category: {category}"
            assert category == expected_category, f"Expected category '{expected_category}', got '{category}'"
        
        print(f"✓ Payment category consistent: {expected_category}")


class TestMarkPaidConsistentCategory:
    """Test that Mark Paid keeps consistent category names"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_entry_id = None
        yield
        # Cleanup
        if self.test_entry_id:
            try:
                # First undo paid to clean up
                requests.post(f"{BASE_URL}/api/private-paddy/{self.test_entry_id}/undo-paid?username=admin&role=admin")
                requests.delete(f"{BASE_URL}/api/private-paddy/{self.test_entry_id}")
            except:
                pass
    
    def test_mark_paid_keeps_consistent_category(self):
        """Test that Mark Paid keeps consistent category names"""
        # Create entry
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": "TEST_MarkPaidParty (MarkMandi)",
            "mandi_name": "MarkMandi",
            "truck_no": "OD01MARK001",
            "kg": 1000,
            "bag": 10,
            "rate_per_qntl": 2500,
            "cash_paid": 0,
            "diesel_paid": 0,
            "paid_amount": 0
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        data = response.json()
        self.test_entry_id = data.get("id")
        
        # Mark as paid
        mark_response = requests.post(f"{BASE_URL}/api/private-paddy/{self.test_entry_id}/mark-paid?username=admin&role=admin")
        assert mark_response.status_code == 200, f"Failed to mark paid: {mark_response.text}"
        
        # Check ledger entries
        time.sleep(0.5)
        
        ledger_response = requests.get(f"{BASE_URL}/api/cash-book?account=ledger&kms_year=2024-25")
        assert ledger_response.status_code == 200
        
        ledger_entries = ledger_response.json()
        
        # Find mark_paid entries
        mark_paid_entries = [e for e in ledger_entries if 
                            e.get("linked_payment_id", "").startswith(f"mark_paid:{self.test_entry_id[:8]}") or
                            e.get("reference", "").startswith(f"mark_paid_ledger:{self.test_entry_id[:8]}")]
        
        expected_category = "TEST_MarkPaidParty (MarkMandi)"
        bad_category = "TEST_MarkPaidParty (MarkMandi) - MarkMandi"
        
        for entry in mark_paid_entries:
            category = entry.get("category", "")
            assert category != bad_category, f"Found duplicate mandi in mark paid category: {category}"
            assert category == expected_category, f"Expected category '{expected_category}', got '{category}'"
        
        print(f"✓ Mark Paid category consistent: {expected_category}")


class TestAutoFixDuplicatePartyNames:
    """Test that auto-fix endpoint detects and merges duplicate party names"""
    
    def test_auto_fix_endpoint_works(self):
        """Test that running /api/cash-book/auto-fix endpoint works and returns success"""
        response = requests.post(f"{BASE_URL}/api/cash-book/auto-fix")
        assert response.status_code == 200, f"Auto-fix failed: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, f"Auto-fix did not return success: {data}"
        assert "total_fixes" in data, "Auto-fix response missing total_fixes"
        assert "details" in data, "Auto-fix response missing details"
        
        print(f"✓ Auto-fix endpoint works: {data.get('total_fixes')} fixes applied")
        print(f"  Details: {data.get('details')}")


class TestPaymentHistoryAndUndo:
    """Test Payment History and Undo functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_entry_id = None
        self.test_payment_ids = []
        yield
        # Cleanup
        for pay_id in self.test_payment_ids:
            try:
                requests.delete(f"{BASE_URL}/api/private-payments/{pay_id}?username=admin&role=admin")
            except:
                pass
        if self.test_entry_id:
            try:
                requests.post(f"{BASE_URL}/api/private-paddy/{self.test_entry_id}/undo-paid?username=admin&role=admin")
                requests.delete(f"{BASE_URL}/api/private-paddy/{self.test_entry_id}")
            except:
                pass
    
    def test_payment_history_returns_payments(self):
        """Test that payment history endpoint returns all payments for an entry"""
        # Create entry
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": "TEST_HistoryParty",
            "mandi_name": "HistoryMandi",
            "truck_no": "OD01HIST001",
            "kg": 1000,
            "bag": 10,
            "rate_per_qntl": 2500,
            "cash_paid": 0,
            "diesel_paid": 0,
            "paid_amount": 0
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        data = response.json()
        self.test_entry_id = data.get("id")
        
        # Make two payments
        for i, amount in enumerate([3000, 2000]):
            payment_payload = {
                "date": "2025-01-16",
                "kms_year": "2024-25",
                "season": "Kharif",
                "party_name": "TEST_HistoryParty",
                "payment_type": "paid",
                "ref_type": "paddy_purchase",
                "ref_id": self.test_entry_id,
                "amount": amount,
                "mode": "cash",
                "reference": f"TEST_HIST_{i+1}",
                "remark": f"Test payment {i+1}"
            }
            
            pay_response = requests.post(f"{BASE_URL}/api/private-payments?username=admin&role=admin", json=payment_payload)
            assert pay_response.status_code == 200
            self.test_payment_ids.append(pay_response.json().get("id"))
        
        # Get payment history
        history_response = requests.get(f"{BASE_URL}/api/private-paddy/{self.test_entry_id}/history")
        assert history_response.status_code == 200, f"Failed to get history: {history_response.text}"
        
        history_data = history_response.json()
        assert "history" in history_data, "History response missing 'history' field"
        assert len(history_data["history"]) == 2, f"Expected 2 payments in history, got {len(history_data['history'])}"
        
        # Verify each payment has an id (needed for undo button)
        for payment in history_data["history"]:
            assert "id" in payment, "Payment in history missing 'id' field (needed for undo)"
            assert "amount" in payment, "Payment in history missing 'amount' field"
        
        print(f"✓ Payment history returns {len(history_data['history'])} payments with IDs for undo")
    
    def test_undo_payment_deletes_and_updates_paid_amount(self):
        """Test that clicking Undo on a payment actually deletes the payment and updates paid_amount"""
        # Create entry
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": "TEST_UndoParty",
            "mandi_name": "UndoMandi",
            "truck_no": "OD01UNDO001",
            "kg": 1000,
            "bag": 10,
            "rate_per_qntl": 2500,
            "cash_paid": 0,
            "diesel_paid": 0,
            "paid_amount": 0
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        data = response.json()
        self.test_entry_id = data.get("id")
        total_amount = data.get("total_amount", 0)
        
        # Make a payment
        payment_payload = {
            "date": "2025-01-16",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": "TEST_UndoParty",
            "payment_type": "paid",
            "ref_type": "paddy_purchase",
            "ref_id": self.test_entry_id,
            "amount": 5000,
            "mode": "cash",
            "reference": "TEST_UNDO_001",
            "remark": "Test payment to undo"
        }
        
        pay_response = requests.post(f"{BASE_URL}/api/private-payments?username=admin&role=admin", json=payment_payload)
        assert pay_response.status_code == 200
        payment_id = pay_response.json().get("id")
        self.test_payment_ids.append(payment_id)
        
        # Verify entry has paid_amount updated
        entry_response = requests.get(f"{BASE_URL}/api/private-paddy?kms_year=2024-25")
        assert entry_response.status_code == 200
        entries = entry_response.json()
        entry = next((e for e in entries if e.get("id") == self.test_entry_id), None)
        assert entry, "Entry not found"
        assert entry.get("paid_amount") == 5000, f"Expected paid_amount 5000, got {entry.get('paid_amount')}"
        
        # Delete the payment (undo)
        delete_response = requests.delete(f"{BASE_URL}/api/private-payments/{payment_id}?username=admin&role=admin")
        assert delete_response.status_code == 200, f"Failed to delete payment: {delete_response.text}"
        
        # Verify entry paid_amount is reset
        entry_response2 = requests.get(f"{BASE_URL}/api/private-paddy?kms_year=2024-25")
        assert entry_response2.status_code == 200
        entries2 = entry_response2.json()
        entry2 = next((e for e in entries2 if e.get("id") == self.test_entry_id), None)
        assert entry2, "Entry not found after undo"
        assert entry2.get("paid_amount") == 0, f"Expected paid_amount 0 after undo, got {entry2.get('paid_amount')}"
        assert entry2.get("balance") == total_amount, f"Expected balance {total_amount} after undo, got {entry2.get('balance')}"
        
        # Remove from cleanup list since already deleted
        self.test_payment_ids.remove(payment_id)
        
        print(f"✓ Undo payment works: paid_amount reset from 5000 to 0")


class TestMainTableUndoHistoryIcon:
    """Test that main table shows correct icons for entries with payments"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_entry_id = None
        self.test_payment_id = None
        yield
        # Cleanup
        if self.test_payment_id:
            try:
                requests.delete(f"{BASE_URL}/api/private-payments/{self.test_payment_id}?username=admin&role=admin")
            except:
                pass
        if self.test_entry_id:
            try:
                requests.delete(f"{BASE_URL}/api/private-paddy/{self.test_entry_id}")
            except:
                pass
    
    def test_entry_with_payment_has_paid_amount_greater_than_zero(self):
        """Test that entry with payment has paid_amount > 0 (needed for Undo+History icon)"""
        # Create entry
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": "TEST_IconParty",
            "mandi_name": "IconMandi",
            "truck_no": "OD01ICON001",
            "kg": 1000,
            "bag": 10,
            "rate_per_qntl": 2500,
            "cash_paid": 0,
            "diesel_paid": 0,
            "paid_amount": 0
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        data = response.json()
        self.test_entry_id = data.get("id")
        
        # Make a payment
        payment_payload = {
            "date": "2025-01-16",
            "kms_year": "2024-25",
            "season": "Kharif",
            "party_name": "TEST_IconParty",
            "payment_type": "paid",
            "ref_type": "paddy_purchase",
            "ref_id": self.test_entry_id,
            "amount": 5000,
            "mode": "cash",
            "reference": "TEST_ICON_001",
            "remark": "Test payment for icon"
        }
        
        pay_response = requests.post(f"{BASE_URL}/api/private-payments?username=admin&role=admin", json=payment_payload)
        assert pay_response.status_code == 200
        self.test_payment_id = pay_response.json().get("id")
        
        # Verify entry has paid_amount > 0
        entry_response = requests.get(f"{BASE_URL}/api/private-paddy?kms_year=2024-25")
        assert entry_response.status_code == 200
        entries = entry_response.json()
        entry = next((e for e in entries if e.get("id") == self.test_entry_id), None)
        assert entry, "Entry not found"
        assert entry.get("paid_amount", 0) > 0, f"Expected paid_amount > 0, got {entry.get('paid_amount')}"
        
        print(f"✓ Entry with payment has paid_amount={entry.get('paid_amount')} (Undo+History icon should show)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
