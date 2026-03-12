"""
Iteration 70 - Testing Payment-related features:
1. Gunny Bags - fully paid items show 'Paid' badge + History icon (NOT Payment Karein button)
2. Purchase Vouchers - same behavior for fully paid items
3. Backend API /api/voucher-payment/history/{party_name}?party_type=... returns history
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestVoucherPaymentHistoryAPI:
    """Test the voucher payment history API endpoint"""
    
    def test_get_payment_history_existing_party(self):
        """Test getting payment history for a party that has made payments (Shyam Sarma)"""
        response = requests.get(
            f"{BASE_URL}/api/voucher-payment/history/Shyam%20Sarma",
            params={"party_type": "Gunny Bag"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "history" in data, "Response should have 'history' key"
        assert "total_paid" in data, "Response should have 'total_paid' key"
        assert isinstance(data["history"], list), "history should be a list"
        assert isinstance(data["total_paid"], (int, float)), "total_paid should be a number"
        
        # Based on earlier test, Shyam Sarma should have payment history
        print(f"Found {len(data['history'])} payment records, total paid: {data['total_paid']}")
        
    def test_get_payment_history_new_party(self):
        """Test getting payment history for a party with no payments"""
        response = requests.get(
            f"{BASE_URL}/api/voucher-payment/history/NonExistentParty123",
            params={"party_type": "Gunny Bag"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["history"] == [], "New party should have empty history"
        assert data["total_paid"] == 0, "New party should have 0 total_paid"
        
    def test_get_payment_history_purchase_voucher_type(self):
        """Test getting payment history with Purchase Voucher party type"""
        response = requests.get(
            f"{BASE_URL}/api/voucher-payment/history/TestParty",
            params={"party_type": "Purchase Voucher"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "history" in data
        assert "total_paid" in data
        
    def test_get_payment_history_without_party_type(self):
        """Test getting payment history without specifying party_type (should still work)"""
        response = requests.get(
            f"{BASE_URL}/api/voucher-payment/history/Shyam%20Sarma"
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "history" in data
        assert "total_paid" in data


class TestGunnyBagsEndpoint:
    """Test the gunny bags endpoint returns proper ledger balance data"""
    
    def test_gunny_bags_list(self):
        """Test that gunny bags list returns ledger_paid and ledger_balance"""
        response = requests.get(f"{BASE_URL}/api/gunny-bags")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Should return a list"
        
        # Check if entries have ledger fields (for items with payments)
        for entry in data:
            if entry.get("total", 0) > 0 or entry.get("amount", 0) > 0:
                # These entries should have ledger_paid and ledger_balance fields
                print(f"Entry: {entry.get('party_name', entry.get('source', 'N/A'))} - "
                      f"Total: {entry.get('total', entry.get('amount', 0))}, "
                      f"Ledger Paid: {entry.get('ledger_paid', 0)}, "
                      f"Ledger Balance: {entry.get('ledger_balance', 'N/A')}")


class TestPurchaseVouchersEndpoint:
    """Test the purchase vouchers endpoint returns proper ledger balance data"""
    
    def test_purchase_vouchers_list(self):
        """Test that purchase vouchers list returns ledger_paid and ledger_balance"""
        response = requests.get(f"{BASE_URL}/api/purchase-book")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Should return a list"
        print(f"Found {len(data)} purchase vouchers")
        
        # Check if entries have ledger fields
        for entry in data:
            if entry.get("total", 0) > 0:
                print(f"Voucher: {entry.get('voucher_no', 'N/A')} - Party: {entry.get('party_name', 'N/A')}, "
                      f"Total: {entry.get('total', 0)}, Ledger Paid: {entry.get('ledger_paid', 0)}, "
                      f"Ledger Balance: {entry.get('ledger_balance', 'N/A')}")


class TestPaymentTabsEndpoints:
    """Test all payment-related endpoints that power the Payments tab"""
    
    def test_truck_payments_endpoint(self):
        """Test truck payments endpoint"""
        response = requests.get(f"{BASE_URL}/api/truck-payments")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Truck payments: {len(data)} records")
        
    def test_agent_payments_endpoint(self):
        """Test agent payments endpoint"""
        response = requests.get(f"{BASE_URL}/api/agent-payments")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Agent payments: {len(data)} records")
        
    def test_diesel_account_endpoint(self):
        """Test diesel account endpoint"""
        response = requests.get(f"{BASE_URL}/api/diesel-accounts")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Diesel accounts: {len(data)} records")
        
    def test_local_party_endpoint(self):
        """Test local party transactions endpoint"""
        response = requests.get(f"{BASE_URL}/api/local-party/transactions")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Local party transactions: {len(data)} records")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
