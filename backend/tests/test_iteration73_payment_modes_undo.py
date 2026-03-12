"""
Iteration 73 - Testing Sale Voucher Payment Features:
1. Cash/Bank payment mode selector with bank account dropdown
2. Undo payment functionality
3. Payment History with can_undo field
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')
if BASE_URL:
    BASE_URL = BASE_URL.rstrip('/')

API = f"{BASE_URL}/api"


class TestBankAccountsAPI:
    """Test bank accounts API for payment mode dropdown"""
    
    def test_get_bank_accounts(self):
        """GET /api/bank-accounts should return list of banks"""
        response = requests.get(f"{API}/bank-accounts")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Expected list of bank accounts"
        print(f"Bank accounts found: {len(data)}")
        
        # Look for Bank of Baroda
        bank_names = [b.get('name') for b in data]
        print(f"Bank names: {bank_names}")
        
        if 'Bank of Baroda' in bank_names:
            print("Bank of Baroda found in accounts")
        else:
            print("Bank of Baroda NOT found - may need to add it")
        
        return data


class TestVoucherPaymentModes:
    """Test payment with cash vs bank modes"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - create a test sale voucher if needed"""
        self.test_party = f"TEST_PaymentMode_{uuid.uuid4().hex[:8]}"
        self.test_voucher_id = None
    
    def test_create_test_sale_voucher(self):
        """Create a test sale voucher for payment testing"""
        payload = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "party_name": self.test_party,
            "invoice_no": f"TEST-INV-{uuid.uuid4().hex[:6]}",
            "items": [{"item_name": "Bran", "quantity": 10, "rate": 100, "unit": "Qntl"}],
            "gst_type": "none",
            "truck_no": "MH12AB1234",
            "kms_year": "2025-26",
            "season": "rabi"
        }
        response = requests.post(f"{API}/sale-book?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Failed to create voucher: {response.text}"
        data = response.json()
        assert "id" in data, "No id returned"
        print(f"Created test voucher: {data.get('id')}, total: {data.get('total')}")
        return data
    
    def test_cash_payment_on_sale_voucher(self):
        """Test making a cash payment on sale voucher"""
        # First create a voucher
        voucher = self.test_create_test_sale_voucher()
        voucher_id = voucher.get('id')
        
        # Make cash payment
        pay_payload = {
            "voucher_type": "sale",
            "voucher_id": voucher_id,
            "amount": 500,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "notes": "Test cash payment",
            "username": "admin",
            "kms_year": "2025-26",
            "season": "rabi",
            "account": "cash",  # Cash mode
            "bank_name": ""
        }
        response = requests.post(f"{API}/voucher-payment", json=pay_payload)
        assert response.status_code == 200, f"Payment failed: {response.text}"
        data = response.json()
        assert data.get("success") == True, "Payment not successful"
        assert "payment_id" in data, "No payment_id returned"
        print(f"Cash payment created with payment_id: {data.get('payment_id')}")
        
        # Verify cash entry was created (not bank)
        cash_entries = requests.get(f"{API}/cash-book?kms_year=2025-26&season=rabi").json()
        matching = [e for e in cash_entries if e.get('reference', '').endswith(data['payment_id'])]
        print(f"Found {len(matching)} cash entries with this payment_id")
        
        if matching:
            entry = matching[0]
            assert entry.get('account') == 'cash', f"Expected account='cash', got {entry.get('account')}"
            assert 'bank_name' not in entry or not entry.get('bank_name'), "Cash entry should not have bank_name"
            print(f"Verified: Entry is cash, no bank_name")
        
        # Cleanup
        requests.delete(f"{API}/sale-book/{voucher_id}?username=admin&role=admin")
        
        return data
    
    def test_bank_payment_on_sale_voucher(self):
        """Test making a bank payment with bank name on sale voucher"""
        # First create a voucher
        voucher = self.test_create_test_sale_voucher()
        voucher_id = voucher.get('id')
        party_name = voucher.get('party_name')
        
        # Make bank payment
        pay_payload = {
            "voucher_type": "sale",
            "voucher_id": voucher_id,
            "amount": 300,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "notes": "Test bank payment",
            "username": "admin",
            "kms_year": "2025-26",
            "season": "rabi",
            "account": "bank",  # Bank mode
            "bank_name": "Bank of Baroda"
        }
        response = requests.post(f"{API}/voucher-payment", json=pay_payload)
        assert response.status_code == 200, f"Payment failed: {response.text}"
        data = response.json()
        assert data.get("success") == True, "Payment not successful"
        payment_id = data.get('payment_id')
        print(f"Bank payment created with payment_id: {payment_id}")
        
        # Verify bank entry was created with bank_name
        cash_entries = requests.get(f"{API}/cash-book?kms_year=2025-26&season=rabi").json()
        matching = [e for e in cash_entries if e.get('reference', '') == f'voucher_payment:{payment_id}']
        print(f"Found {len(matching)} entries with this payment_id")
        
        if matching:
            entry = matching[0]
            assert entry.get('account') == 'bank', f"Expected account='bank', got {entry.get('account')}"
            assert entry.get('bank_name') == 'Bank of Baroda', f"Expected bank_name='Bank of Baroda', got {entry.get('bank_name')}"
            print(f"Verified: Entry is bank with bank_name='Bank of Baroda'")
        
        # Cleanup
        requests.delete(f"{API}/sale-book/{voucher_id}?username=admin&role=admin")
        
        return data


class TestPaymentHistory:
    """Test payment history API with can_undo field"""
    
    def test_payment_history_returns_can_undo(self):
        """GET /api/voucher-payment/history/{party_name} should return can_undo field"""
        # Use existing Gayatri Agro party that has payments
        response = requests.get(f"{API}/voucher-payment/history/Gayatri%20Agro?party_type=Sale Book")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "history" in data, "No history field in response"
        assert "total_paid" in data, "No total_paid field in response"
        
        print(f"History count: {len(data['history'])}, total_paid: {data['total_paid']}")
        
        # Check structure of history entries
        for idx, entry in enumerate(data['history'][:3]):  # Check first 3
            print(f"Entry {idx}: payment_id={entry.get('payment_id')}, can_undo={entry.get('can_undo')}, amount={entry.get('amount')}")
            assert 'can_undo' in entry, f"Entry {idx} missing can_undo field"
            assert 'payment_id' in entry, f"Entry {idx} missing payment_id field"
            assert 'reference' in entry, f"Entry {idx} missing reference field"
        
        return data


class TestUndoPayment:
    """Test undo payment functionality"""
    
    def test_undo_payment_flow(self):
        """Full flow: Create voucher -> Make payment -> Verify entries -> Undo -> Verify cleanup"""
        test_party = f"TEST_Undo_{uuid.uuid4().hex[:8]}"
        
        # Step 1: Create voucher
        voucher_payload = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "party_name": test_party,
            "invoice_no": f"TEST-UNDO-{uuid.uuid4().hex[:6]}",
            "items": [{"item_name": "Bran", "quantity": 10, "rate": 200, "unit": "Qntl"}],
            "gst_type": "none",
            "kms_year": "2025-26",
            "season": "rabi"
        }
        voucher_res = requests.post(f"{API}/sale-book?username=admin&role=admin", json=voucher_payload)
        assert voucher_res.status_code == 200
        voucher = voucher_res.json()
        voucher_id = voucher['id']
        print(f"Step 1: Created voucher {voucher_id}, total={voucher.get('total')}, balance={voucher.get('balance')}")
        
        # Step 2: Make payment
        pay_payload = {
            "voucher_type": "sale",
            "voucher_id": voucher_id,
            "amount": 500,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "notes": "Test for undo",
            "username": "admin",
            "kms_year": "2025-26",
            "season": "rabi",
            "account": "cash",
            "bank_name": ""
        }
        pay_res = requests.post(f"{API}/voucher-payment", json=pay_payload)
        assert pay_res.status_code == 200
        pay_data = pay_res.json()
        payment_id = pay_data['payment_id']
        print(f"Step 2: Made payment {payment_id} of Rs.500")
        
        # Step 3: Verify voucher balance updated
        voucher_after_pay = requests.get(f"{API}/sale-book?kms_year=2025-26&season=rabi").json()
        our_voucher = next((v for v in voucher_after_pay if v['id'] == voucher_id), None)
        assert our_voucher is not None, "Voucher not found after payment"
        paid_after = our_voucher.get('paid_amount', 0)
        balance_after = our_voucher.get('balance', 0)
        print(f"Step 3: After payment - paid_amount={paid_after}, balance={balance_after}")
        assert paid_after == 500, f"Expected paid_amount=500, got {paid_after}"
        
        # Step 4: Verify cash_transactions has entry
        cash_entries_before = requests.get(f"{API}/cash-book?kms_year=2025-26&season=rabi").json()
        cash_matching = [e for e in cash_entries_before if f'voucher_payment:{payment_id}' in e.get('reference', '')]
        ledger_matching = [e for e in cash_entries_before if f'voucher_payment_ledger:{payment_id}' in e.get('reference', '')]
        print(f"Step 4: Found {len(cash_matching)} cash entries, {len(ledger_matching)} ledger entries")
        assert len(cash_matching) >= 1, "No cash entry found for payment"
        assert len(ledger_matching) >= 1, "No ledger entry found for payment"
        
        # Step 5: Undo the payment
        undo_res = requests.post(f"{API}/voucher-payment/undo", json={"payment_id": payment_id})
        assert undo_res.status_code == 200, f"Undo failed: {undo_res.text}"
        undo_data = undo_res.json()
        print(f"Step 5: Undo response - success={undo_data.get('success')}, deleted_count={undo_data.get('deleted_count')}")
        assert undo_data.get('success') == True, "Undo not successful"
        assert undo_data.get('deleted_count', 0) >= 2, "Expected at least 2 entries deleted (cash + ledger)"
        
        # Step 6: Verify entries deleted
        cash_entries_after = requests.get(f"{API}/cash-book?kms_year=2025-26&season=rabi").json()
        cash_matching_after = [e for e in cash_entries_after if f'voucher_payment:{payment_id}' in e.get('reference', '')]
        ledger_matching_after = [e for e in cash_entries_after if f'voucher_payment_ledger:{payment_id}' in e.get('reference', '')]
        print(f"Step 6: After undo - {len(cash_matching_after)} cash entries, {len(ledger_matching_after)} ledger entries")
        assert len(cash_matching_after) == 0, "Cash entry should be deleted"
        assert len(ledger_matching_after) == 0, "Ledger entry should be deleted"
        
        # Step 7: Verify voucher balance restored
        voucher_after_undo = requests.get(f"{API}/sale-book?kms_year=2025-26&season=rabi").json()
        our_voucher_after = next((v for v in voucher_after_undo if v['id'] == voucher_id), None)
        assert our_voucher_after is not None
        paid_after_undo = our_voucher_after.get('paid_amount', 0)
        balance_after_undo = our_voucher_after.get('balance', 0)
        print(f"Step 7: After undo - paid_amount={paid_after_undo}, balance={balance_after_undo}")
        assert paid_after_undo == 0, f"Expected paid_amount=0 after undo, got {paid_after_undo}"
        
        # Cleanup
        requests.delete(f"{API}/sale-book/{voucher_id}?username=admin&role=admin")
        print("Step 8: Cleanup - voucher deleted")
        
        return True
    
    def test_undo_nonexistent_payment(self):
        """Undo with invalid payment_id should return 404"""
        response = requests.post(f"{API}/voucher-payment/undo", json={"payment_id": "fake-payment-id-12345"})
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Correctly returns 404 for non-existent payment")
    
    def test_undo_missing_payment_id(self):
        """Undo without payment_id should return 400"""
        response = requests.post(f"{API}/voucher-payment/undo", json={})
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("Correctly returns 400 for missing payment_id")


class TestSaleBookPaidBadge:
    """Test Sale Book shows Paid badge correctly"""
    
    def test_sale_book_returns_balance_field(self):
        """GET /api/sale-book should return balance/ledger_balance field"""
        response = requests.get(f"{API}/sale-book?kms_year=2025-26&season=rabi")
        assert response.status_code == 200
        vouchers = response.json()
        
        if len(vouchers) > 0:
            # Check first voucher has required fields
            v = vouchers[0]
            print(f"Sample voucher: party={v.get('party_name')}, total={v.get('total')}, balance={v.get('balance')}, ledger_balance={v.get('ledger_balance')}")
            # Either balance or ledger_balance should exist
            has_balance = 'balance' in v or 'ledger_balance' in v
            assert has_balance, "Voucher missing balance field"
            
            # Find Gayatri Agro if exists
            gayatri = next((x for x in vouchers if x.get('party_name') == 'Gayatri Agro'), None)
            if gayatri:
                ledger_balance = gayatri.get('ledger_balance')
                balance = gayatri.get('balance')
                effective_balance = ledger_balance if ledger_balance is not None else balance
                print(f"Gayatri Agro: total={gayatri.get('total')}, balance={balance}, ledger_balance={ledger_balance}, effective={effective_balance}")
                if effective_balance is not None and effective_balance <= 0:
                    print("Gayatri Agro should show Paid badge (balance <= 0)")
        else:
            print("No vouchers found in sale-book")


class TestHistoryCanUndoField:
    """Test that payment history correctly identifies undoable payments"""
    
    def test_voucher_payment_has_can_undo_true(self):
        """Payments made via voucher-payment API should have can_undo=true"""
        # Create voucher and payment
        test_party = f"TEST_CanUndo_{uuid.uuid4().hex[:8]}"
        
        voucher_payload = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "party_name": test_party,
            "invoice_no": f"TEST-CAN-{uuid.uuid4().hex[:6]}",
            "items": [{"item_name": "Bran", "quantity": 5, "rate": 100, "unit": "Qntl"}],
            "gst_type": "none",
            "kms_year": "2025-26",
            "season": "rabi"
        }
        voucher_res = requests.post(f"{API}/sale-book?username=admin&role=admin", json=voucher_payload)
        voucher = voucher_res.json()
        voucher_id = voucher['id']
        
        # Make payment
        pay_payload = {
            "voucher_type": "sale",
            "voucher_id": voucher_id,
            "amount": 200,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "username": "admin",
            "kms_year": "2025-26",
            "account": "cash"
        }
        requests.post(f"{API}/voucher-payment", json=pay_payload)
        
        # Check history
        history_res = requests.get(f"{API}/voucher-payment/history/{test_party}?party_type=Sale Book")
        assert history_res.status_code == 200
        history = history_res.json().get('history', [])
        
        # Should have at least one entry with can_undo=true
        undoable = [h for h in history if h.get('can_undo') == True]
        print(f"Found {len(undoable)} undoable payments for {test_party}")
        assert len(undoable) >= 1, "Expected at least 1 undoable payment"
        
        # Verify the payment has payment_id
        for entry in undoable:
            assert entry.get('payment_id'), "Undoable entry should have payment_id"
            print(f"Undoable entry: payment_id={entry.get('payment_id')}, amount={entry.get('amount')}")
        
        # Cleanup
        requests.delete(f"{API}/sale-book/{voucher_id}?username=admin&role=admin")
        
        return True


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
