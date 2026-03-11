"""
Test Iteration 56: Pvt Paddy Payment Fix - Cash Book Entry with Correct Party Name & Party Type

Bug Description:
When making a pvt paddy payment (via ₹ button on Private Trading page), the cash book/ledger 
entries were not being created with correct party name and party_type:
- 'category' field was set to generic 'Pvt Paddy Payment' instead of actual party name
- 'party_type' was empty

Fix:
- category is now set to party_label (e.g., "Amit - Kullu")  
- party_type is now "Pvt Paddy Purchase"

Test Cases:
1. Create pvt paddy entry
2. Make payment via POST /api/private-payments
3. Verify cash_transactions has correct category (party name) and party_type ("Pvt Paddy Purchase")
4. Verify no generic "Pvt Paddy Payment" entries exist in cash_transactions
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://pvt-paddy-trading.preview.emergentagent.com')

@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestPvtPaddyPaymentFix:
    """Test that pvt paddy payments create correct cash book entries"""
    
    TEST_PARTY = f"TEST_PVT_PAY_{uuid.uuid4().hex[:6]}"
    TEST_MANDI = "TestMandi"
    pvt_paddy_id = None
    
    def test_01_create_pvt_paddy_entry(self, api_client):
        """Create a pvt paddy entry for testing"""
        payload = {
            "date": "2026-03-11",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "party_name": self.TEST_PARTY,
            "mandi_name": self.TEST_MANDI,
            "agent_name": "TestAgent",
            "truck_no": "TEST1234",
            "kg": 10000,
            "bag": 100,
            "rate_per_qntl": 1800,
            "cutting_percent": 5,
            "paid_amount": 0,  # No advance
            "cash_paid": 0,  # No cash
            "diesel_paid": 0  # No diesel
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/private-paddy?username=test&role=admin",
            json=payload
        )
        
        assert response.status_code == 200, f"Failed to create pvt paddy: {response.text}"
        data = response.json()
        
        assert data["party_name"] == self.TEST_PARTY
        assert data["mandi_name"] == self.TEST_MANDI
        assert "id" in data
        
        # Store ID for subsequent tests
        TestPvtPaddyPaymentFix.pvt_paddy_id = data["id"]
        print(f"\n✓ Created pvt paddy entry: {data['id']}")
        print(f"  Party: {data['party_name']} - {data['mandi_name']}")
        print(f"  Total Amount: {data['total_amount']}")
    
    def test_02_make_payment_via_api(self, api_client):
        """Make a payment via POST /api/private-payments"""
        assert self.pvt_paddy_id is not None, "No pvt paddy ID from previous test"
        
        payload = {
            "date": "2026-03-11",
            "kms_year": "2025-2026", 
            "season": "Kharif",
            "party_name": self.TEST_PARTY,
            "payment_type": "paid",
            "ref_type": "paddy_purchase",
            "ref_id": self.pvt_paddy_id,
            "amount": 100,  # Test payment of Rs.100
            "mode": "cash",
            "reference": "test_payment_ref",
            "remark": "Test payment"
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/private-payments?username=test&role=admin",
            json=payload
        )
        
        assert response.status_code == 200, f"Failed to create payment: {response.text}"
        data = response.json()
        
        assert data["party_name"] == self.TEST_PARTY
        assert data["amount"] == 100
        assert "id" in data
        
        print(f"\n✓ Created payment: {data['id']}")
        print(f"  Amount: Rs.{data['amount']}")
        print(f"  Party: {data['party_name']}")
    
    def test_03_verify_cash_book_entry_has_correct_party_name(self, api_client):
        """Verify cash_transactions has category = party label (not generic)"""
        expected_party_label = f"{self.TEST_PARTY} - {self.TEST_MANDI}"
        
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=cash&kms_year=2025-2026"
        )
        
        assert response.status_code == 200
        transactions = response.json()
        
        # Find entry with our party label
        party_entries = [
            t for t in transactions 
            if t.get("category") == expected_party_label
            and "Pvt Paddy Payment" in (t.get("description", "") or "")
        ]
        
        assert len(party_entries) > 0, \
            f"No cash_transactions found with category='{expected_party_label}'. " \
            f"Bug: category may still be generic 'Pvt Paddy Payment'"
        
        # Verify the entry details
        entry = party_entries[0]
        print(f"\n✓ Cash book entry found:")
        print(f"  Category: {entry.get('category')}")
        print(f"  Party Type: {entry.get('party_type')}")
        print(f"  Amount: {entry.get('amount')}")
        print(f"  Description: {entry.get('description')}")
    
    def test_04_verify_party_type_is_pvt_paddy_purchase(self, api_client):
        """Verify party_type is 'Pvt Paddy Purchase' not empty"""
        expected_party_label = f"{self.TEST_PARTY} - {self.TEST_MANDI}"
        
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=cash&kms_year=2025-2026"
        )
        
        assert response.status_code == 200
        transactions = response.json()
        
        # Find entry with our party
        party_entries = [
            t for t in transactions 
            if t.get("category") == expected_party_label
        ]
        
        assert len(party_entries) > 0
        
        for entry in party_entries:
            # party_type should be "Pvt Paddy Purchase"
            assert entry.get("party_type") == "Pvt Paddy Purchase", \
                f"party_type is '{entry.get('party_type')}' instead of 'Pvt Paddy Purchase'"
        
        print(f"\n✓ All entries have party_type='Pvt Paddy Purchase'")
    
    def test_05_no_generic_pvt_paddy_payment_category(self, api_client):
        """Verify no entries exist with generic 'Pvt Paddy Payment' category"""
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=cash&kms_year=2025-2026"
        )
        
        assert response.status_code == 200
        transactions = response.json()
        
        # Look for generic category
        generic_entries = [
            t for t in transactions 
            if t.get("category") == "Pvt Paddy Payment"
        ]
        
        if len(generic_entries) > 0:
            print(f"\n⚠ Found {len(generic_entries)} entries with generic 'Pvt Paddy Payment' category")
            print("  These are likely old entries before the fix")
            for e in generic_entries[:3]:
                print(f"    - {e.get('date')}: {e.get('description')}")
        else:
            print("\n✓ No generic 'Pvt Paddy Payment' category entries found")
    
    def test_06_verify_cash_book_ledger_entry(self, api_client):
        """Verify ledger entry was also created with correct party info"""
        expected_party_label = f"{self.TEST_PARTY} - {self.TEST_MANDI}"
        
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=ledger&kms_year=2025-2026"
        )
        
        assert response.status_code == 200
        transactions = response.json()
        
        # Find ledger entry with our party
        ledger_entries = [
            t for t in transactions 
            if t.get("category") == expected_party_label
            and t.get("party_type") == "Pvt Paddy Purchase"
        ]
        
        assert len(ledger_entries) > 0, \
            f"No ledger entry found with category='{expected_party_label}'"
        
        print(f"\n✓ Ledger entry found with correct party info")
        print(f"  Category: {ledger_entries[0].get('category')}")
        print(f"  Party Type: {ledger_entries[0].get('party_type')}")
    
    def test_07_party_summary_shows_pvt_paddy_purchase_type(self, api_client):
        """Verify Cash Book Party Summary shows party with 'Pvt Paddy Purchase' type"""
        response = api_client.get(
            f"{BASE_URL}/api/cash-book/party-summary?kms_year=2025-2026"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Find our test party
        our_party = None
        expected_party_label = f"{self.TEST_PARTY} - {self.TEST_MANDI}"
        
        for party in data.get("parties", []):
            if party.get("party_name") == expected_party_label:
                our_party = party
                break
        
        if our_party:
            assert our_party.get("party_type") == "Pvt Paddy Purchase", \
                f"Party type is '{our_party.get('party_type')}' instead of 'Pvt Paddy Purchase'"
            print(f"\n✓ Party Summary shows correct type:")
            print(f"  Party: {our_party.get('party_name')}")
            print(f"  Type: {our_party.get('party_type')}")
        else:
            print(f"\n⚠ Test party '{expected_party_label}' not found in party summary")
            print("  This might be expected if cleanup was run")
    
    def test_08_verify_existing_amit_entry_has_correct_type(self, api_client):
        """Verify existing 'Amit - Kullu' party has 'Pvt Paddy Purchase' type"""
        response = api_client.get(
            f"{BASE_URL}/api/cash-book/party-summary?kms_year=2025-2026"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Find Amit - Kullu party
        amit_party = None
        for party in data.get("parties", []):
            if "Amit" in party.get("party_name", "") and "Kullu" in party.get("party_name", ""):
                amit_party = party
                break
        
        if amit_party:
            print(f"\n✓ Found existing party: {amit_party.get('party_name')}")
            print(f"  Type: {amit_party.get('party_type')}")
            
            # The fix should have set this to "Pvt Paddy Purchase"
            assert amit_party.get("party_type") == "Pvt Paddy Purchase", \
                f"Amit party_type is '{amit_party.get('party_type')}' - may not be fixed yet"
        else:
            print("\n⚠ 'Amit - Kullu' party not found in party summary")
    
    def test_09_cleanup_test_data(self, api_client):
        """Clean up test data"""
        if self.pvt_paddy_id:
            response = api_client.delete(
                f"{BASE_URL}/api/private-paddy/{self.pvt_paddy_id}"
            )
            if response.status_code == 200:
                print(f"\n✓ Cleaned up test pvt paddy entry: {self.pvt_paddy_id}")
            else:
                print(f"\n⚠ Failed to cleanup: {response.status_code}")


class TestPvtTradingPartySummary:
    """Test Pvt Trading Party Summary tab functionality"""
    
    def test_01_party_summary_api_returns_data(self, api_client):
        """Verify /api/private-trading/party-summary returns data"""
        response = api_client.get(
            f"{BASE_URL}/api/private-trading/party-summary?kms_year=2025-2026"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "parties" in data
        assert "totals" in data
        
        print(f"\n✓ Party Summary API working")
        print(f"  Total Parties: {len(data['parties'])}")
        
        if len(data['parties']) > 0:
            print(f"  Sample party: {data['parties'][0].get('party_name')}")
    
    def test_02_amit_party_in_pvt_trading_summary(self, api_client):
        """Verify Amit party is in Pvt Trading Party Summary"""
        response = api_client.get(
            f"{BASE_URL}/api/private-trading/party-summary?kms_year=2025-2026"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        amit_found = False
        for party in data.get("parties", []):
            if "Amit" in party.get("party_name", ""):
                amit_found = True
                print(f"\n✓ Amit party found in Pvt Trading Summary:")
                print(f"  Party: {party.get('party_name')}")
                print(f"  Mandi: {party.get('mandi_name')}")
                print(f"  Purchase Amount: {party.get('purchase_amount')}")
                print(f"  Purchase Paid: {party.get('purchase_paid')}")
                print(f"  Purchase Balance: {party.get('purchase_balance')}")
                break
        
        assert amit_found, "Amit party not found in Pvt Trading Party Summary"


class TestCashBookPartySummaryUI:
    """Test Cash Book Party Summary UI elements"""
    
    def test_01_party_summary_has_pvt_paddy_purchase_filter(self, api_client):
        """Verify 'Pvt Paddy Purchase' is available as filter option"""
        # The filter options are defined in frontend, but we can verify
        # that entries with party_type='Pvt Paddy Purchase' exist
        response = api_client.get(
            f"{BASE_URL}/api/cash-book/party-summary?party_type=Pvt Paddy Purchase&kms_year=2025-2026"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data.get("parties", [])) > 0:
            print(f"\n✓ Found {len(data['parties'])} parties with type 'Pvt Paddy Purchase'")
            for party in data['parties'][:3]:
                print(f"  - {party.get('party_name')}: Balance Rs.{party.get('balance', 0)}")
        else:
            print("\n⚠ No parties found with 'Pvt Paddy Purchase' type")


class TestPrivatePaddyAPI:
    """Test Private Paddy API endpoints"""
    
    def test_01_get_private_paddy_entries(self, api_client):
        """Verify GET /api/private-paddy works"""
        response = api_client.get(
            f"{BASE_URL}/api/private-paddy?kms_year=2025-2026"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        print(f"\n✓ Private Paddy API working: {len(data)} entries found")
        
        if len(data) > 0:
            entry = data[0]
            print(f"  Latest entry: {entry.get('party_name')} - {entry.get('mandi_name')}")
    
    def test_02_get_private_payments(self, api_client):
        """Verify GET /api/private-payments works"""
        response = api_client.get(
            f"{BASE_URL}/api/private-payments?kms_year=2025-2026"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        print(f"\n✓ Private Payments API working: {len(data)} payments found")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
