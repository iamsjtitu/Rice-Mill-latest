"""
Test Bug Fixes - Iteration 106
Tests for:
1. Payment endpoint creates exactly 1 cash + 1 ledger entry (no duplicates)
2. Ledger entry from payment should include round_off in the amount
3. Cash Book transaction with party_type 'Pvt Paddy Purchase' auto-updates pvt_paddy paid_amount
4. Data Health Check endpoint works properly
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPaymentNoDuplicates:
    """Test that payment endpoint creates exactly 1 cash + 1 ledger entry"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_party = f"TEST_PaymentParty_{uuid.uuid4().hex[:6]}"
        self.test_date = datetime.now().strftime("%Y-%m-%d")
        self.kms_year = "2024-2025"
        self.season = "Kharif"
        self.created_ids = {"pvt_paddy": [], "cash_book": [], "payments": []}
        yield
        # Cleanup
        self._cleanup()
    
    def _cleanup(self):
        """Clean up test data"""
        for pvt_id in self.created_ids["pvt_paddy"]:
            try:
                requests.delete(f"{BASE_URL}/api/private-paddy/{pvt_id}")
            except:
                pass
        for pay_id in self.created_ids["payments"]:
            try:
                requests.delete(f"{BASE_URL}/api/private-payments/{pay_id}")
            except:
                pass
        # Clean up cash book entries by category
        try:
            txns = requests.get(f"{BASE_URL}/api/cash-book?category={self.test_party}").json()
            for txn in txns:
                requests.delete(f"{BASE_URL}/api/cash-book/{txn['id']}")
        except:
            pass
    
    def test_create_pvt_paddy_entry(self):
        """Create a pvt_paddy entry for testing"""
        payload = {
            "date": self.test_date,
            "kms_year": self.kms_year,
            "season": self.season,
            "party_name": self.test_party,
            "kg": 1000,
            "bag": 10,
            "rate_per_qntl": 2000,
            "paid_amount": 0
        }
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Failed to create pvt_paddy: {response.text}"
        data = response.json()
        assert "id" in data
        self.created_ids["pvt_paddy"].append(data["id"])
        return data
    
    def test_payment_creates_exactly_one_cash_and_one_ledger(self):
        """Test that making a payment creates exactly 1 cash + 1 ledger entry"""
        # First create a pvt_paddy entry
        pvt_entry = self.test_create_pvt_paddy_entry()
        pvt_id = pvt_entry["id"]
        
        # Get initial cash book count for this party
        initial_txns = requests.get(f"{BASE_URL}/api/cash-book?category={self.test_party}").json()
        initial_count = len(initial_txns)
        
        # Make a payment
        payment_payload = {
            "date": self.test_date,
            "party_name": self.test_party,
            "payment_type": "paid",
            "ref_type": "paddy_purchase",
            "ref_id": pvt_id,
            "amount": 5000,
            "mode": "cash",
            "reference": "TEST_REF",
            "remark": "Test payment",
            "round_off": 0,
            "kms_year": self.kms_year,
            "season": self.season
        }
        pay_response = requests.post(f"{BASE_URL}/api/private-payments?username=admin&role=admin", json=payment_payload)
        assert pay_response.status_code == 200, f"Payment failed: {pay_response.text}"
        pay_data = pay_response.json()
        self.created_ids["payments"].append(pay_data["id"])
        
        # Check cash book entries
        final_txns = requests.get(f"{BASE_URL}/api/cash-book?category={self.test_party}").json()
        
        # Filter to only entries created by this payment (linked_payment_id)
        payment_linked_txns = [t for t in final_txns if t.get("linked_payment_id") == pay_data["id"]]
        
        # Should have exactly 2 entries: 1 cash nikasi + 1 ledger nikasi
        cash_entries = [t for t in payment_linked_txns if t.get("account") == "cash"]
        ledger_entries = [t for t in payment_linked_txns if t.get("account") == "ledger"]
        
        assert len(cash_entries) == 1, f"Expected 1 cash entry, got {len(cash_entries)}"
        assert len(ledger_entries) == 1, f"Expected 1 ledger entry, got {len(ledger_entries)}"
        
        # Verify amounts
        assert cash_entries[0]["amount"] == 5000, f"Cash entry amount mismatch: {cash_entries[0]['amount']}"
        assert ledger_entries[0]["amount"] == 5000, f"Ledger entry amount mismatch: {ledger_entries[0]['amount']}"
        
        print(f"PASS: Payment created exactly 1 cash + 1 ledger entry")


class TestRoundOffInLedger:
    """Test that ledger entry includes round_off in the amount"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_party = f"TEST_RoundOffParty_{uuid.uuid4().hex[:6]}"
        self.test_date = datetime.now().strftime("%Y-%m-%d")
        self.kms_year = "2024-2025"
        self.season = "Kharif"
        self.created_ids = {"pvt_paddy": [], "payments": []}
        yield
        # Cleanup
        self._cleanup()
    
    def _cleanup(self):
        """Clean up test data"""
        for pvt_id in self.created_ids["pvt_paddy"]:
            try:
                requests.delete(f"{BASE_URL}/api/private-paddy/{pvt_id}")
            except:
                pass
        for pay_id in self.created_ids["payments"]:
            try:
                requests.delete(f"{BASE_URL}/api/private-payments/{pay_id}")
            except:
                pass
        # Clean up cash book entries
        try:
            txns = requests.get(f"{BASE_URL}/api/cash-book?category={self.test_party}").json()
            for txn in txns:
                requests.delete(f"{BASE_URL}/api/cash-book/{txn['id']}")
        except:
            pass
    
    def test_ledger_includes_round_off(self):
        """Test that ledger entry amount = payment amount + round_off"""
        # Create pvt_paddy entry
        pvt_payload = {
            "date": self.test_date,
            "kms_year": self.kms_year,
            "season": self.season,
            "party_name": self.test_party,
            "kg": 1000,
            "bag": 10,
            "rate_per_qntl": 2000,
            "paid_amount": 0
        }
        pvt_response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=pvt_payload)
        assert pvt_response.status_code == 200
        pvt_data = pvt_response.json()
        self.created_ids["pvt_paddy"].append(pvt_data["id"])
        
        # Make payment with round_off
        payment_amount = 5000
        round_off = -50  # Discount of 50
        expected_ledger_amount = payment_amount + round_off  # 4950
        
        payment_payload = {
            "date": self.test_date,
            "party_name": self.test_party,
            "payment_type": "paid",
            "ref_type": "paddy_purchase",
            "ref_id": pvt_data["id"],
            "amount": payment_amount,
            "mode": "cash",
            "reference": "TEST_ROUNDOFF",
            "remark": "Test round off",
            "round_off": round_off,
            "kms_year": self.kms_year,
            "season": self.season
        }
        pay_response = requests.post(f"{BASE_URL}/api/private-payments?username=admin&role=admin", json=payment_payload)
        assert pay_response.status_code == 200, f"Payment failed: {pay_response.text}"
        pay_data = pay_response.json()
        self.created_ids["payments"].append(pay_data["id"])
        
        # Check ledger entry
        txns = requests.get(f"{BASE_URL}/api/cash-book?category={self.test_party}").json()
        payment_ledger = [t for t in txns if t.get("linked_payment_id") == pay_data["id"] and t.get("account") == "ledger"]
        
        assert len(payment_ledger) == 1, f"Expected 1 ledger entry, got {len(payment_ledger)}"
        
        # Ledger amount should include round_off
        actual_ledger_amount = payment_ledger[0]["amount"]
        assert actual_ledger_amount == expected_ledger_amount, f"Ledger amount {actual_ledger_amount} != expected {expected_ledger_amount}"
        
        # Cash entry should be the payment amount (without round_off)
        payment_cash = [t for t in txns if t.get("linked_payment_id") == pay_data["id"] and t.get("account") == "cash"]
        assert len(payment_cash) == 1
        assert payment_cash[0]["amount"] == payment_amount, f"Cash amount should be {payment_amount}, got {payment_cash[0]['amount']}"
        
        print(f"PASS: Ledger entry includes round_off. Cash: {payment_amount}, Ledger: {actual_ledger_amount}")


class TestCashBookAutoLinkPvtPaddy:
    """Test that Cash Book transaction with party_type 'Pvt Paddy Purchase' auto-updates pvt_paddy paid_amount"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_party = f"TEST_AutoLinkParty_{uuid.uuid4().hex[:6]}"
        self.test_date = datetime.now().strftime("%Y-%m-%d")
        self.kms_year = "2024-2025"
        self.season = "Kharif"
        self.created_ids = {"pvt_paddy": [], "cash_book": []}
        yield
        # Cleanup
        self._cleanup()
    
    def _cleanup(self):
        """Clean up test data"""
        for pvt_id in self.created_ids["pvt_paddy"]:
            try:
                requests.delete(f"{BASE_URL}/api/private-paddy/{pvt_id}")
            except:
                pass
        for cb_id in self.created_ids["cash_book"]:
            try:
                requests.delete(f"{BASE_URL}/api/cash-book/{cb_id}")
            except:
                pass
    
    def test_cashbook_auto_links_to_pvt_paddy(self):
        """Test that creating a Cash Book nikasi for Pvt Paddy Purchase updates pvt_paddy paid_amount"""
        # Create pvt_paddy entry with balance > 0
        pvt_payload = {
            "date": self.test_date,
            "kms_year": self.kms_year,
            "season": self.season,
            "party_name": self.test_party,
            "kg": 1000,
            "bag": 10,
            "rate_per_qntl": 2000,
            "paid_amount": 0
        }
        pvt_response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=pvt_payload)
        assert pvt_response.status_code == 200
        pvt_data = pvt_response.json()
        self.created_ids["pvt_paddy"].append(pvt_data["id"])
        
        initial_paid = pvt_data.get("paid_amount", 0)
        initial_balance = pvt_data.get("balance", pvt_data.get("total_amount", 0))
        
        # Create Cash Book transaction with party_type 'Pvt Paddy Purchase'
        cashbook_amount = 3000
        cb_payload = {
            "date": self.test_date,
            "account": "cash",
            "txn_type": "nikasi",
            "category": self.test_party,
            "party_type": "Pvt Paddy Purchase",
            "description": "Test auto-link payment",
            "amount": cashbook_amount,
            "kms_year": self.kms_year,
            "season": self.season
        }
        cb_response = requests.post(f"{BASE_URL}/api/cash-book?username=admin&role=admin", json=cb_payload)
        assert cb_response.status_code == 200, f"Cash Book creation failed: {cb_response.text}"
        cb_data = cb_response.json()
        self.created_ids["cash_book"].append(cb_data["id"])
        
        # Check if pvt_paddy paid_amount was updated
        pvt_check = requests.get(f"{BASE_URL}/api/private-paddy?party_name={self.test_party}").json()
        updated_pvt = next((p for p in pvt_check if p["id"] == pvt_data["id"]), None)
        
        assert updated_pvt is not None, "Could not find updated pvt_paddy entry"
        
        expected_paid = initial_paid + cashbook_amount
        actual_paid = updated_pvt.get("paid_amount", 0)
        
        assert actual_paid == expected_paid, f"paid_amount not updated. Expected {expected_paid}, got {actual_paid}"
        
        # Verify balance was also updated
        expected_balance = initial_balance - cashbook_amount
        actual_balance = updated_pvt.get("balance", 0)
        
        assert actual_balance == expected_balance, f"balance not updated. Expected {expected_balance}, got {actual_balance}"
        
        print(f"PASS: Cash Book auto-linked to pvt_paddy. paid_amount: {initial_paid} -> {actual_paid}")


class TestDataHealthCheck:
    """Test that Data Health Check endpoint works properly"""
    
    def test_health_check_endpoint_returns_success(self):
        """Test POST /api/cash-book/auto-fix returns success"""
        response = requests.post(f"{BASE_URL}/api/cash-book/auto-fix")
        
        assert response.status_code == 200, f"Health check failed with status {response.status_code}: {response.text}"
        
        data = response.json()
        assert "success" in data, f"Response missing 'success' field: {data}"
        assert data["success"] == True, f"Health check returned success=False: {data}"
        
        # Should have details about fixes
        assert "total_fixes" in data or "details" in data, f"Response missing fix details: {data}"
        
        print(f"PASS: Health check returned success. Details: {data}")
    
    def test_health_check_is_idempotent(self):
        """Test that running health check multiple times is safe"""
        # Run twice
        response1 = requests.post(f"{BASE_URL}/api/cash-book/auto-fix")
        assert response1.status_code == 200
        
        response2 = requests.post(f"{BASE_URL}/api/cash-book/auto-fix")
        assert response2.status_code == 200
        
        # Both should succeed
        data1 = response1.json()
        data2 = response2.json()
        
        assert data1["success"] == True
        assert data2["success"] == True
        
        print(f"PASS: Health check is idempotent. Run 1: {data1.get('total_fixes', 0)} fixes, Run 2: {data2.get('total_fixes', 0)} fixes")


class TestAPIEndpoints:
    """Basic API endpoint tests"""
    
    def test_private_paddy_list(self):
        """Test GET /api/private-paddy returns list"""
        response = requests.get(f"{BASE_URL}/api/private-paddy")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("PASS: GET /api/private-paddy returns list")
    
    def test_cash_book_list(self):
        """Test GET /api/cash-book returns list"""
        response = requests.get(f"{BASE_URL}/api/cash-book")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("PASS: GET /api/cash-book returns list")
    
    def test_private_payments_list(self):
        """Test GET /api/private-payments returns list"""
        response = requests.get(f"{BASE_URL}/api/private-payments")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("PASS: GET /api/private-payments returns list")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
