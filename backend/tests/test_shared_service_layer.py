"""
Test Suite for Shared Service Layer Refactoring (v78.0.0)
Tests: Web backend APIs (Python/MongoDB) - private-paddy, private-payments, quick-search
Note: The shared JS modules (party-helpers.js, paddy-calc.js, payment-service.js) are tested via node -e scripts
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
API = f"{BASE_URL}/api"

class TestQuickSearch:
    """Quick Search API tests"""
    
    def test_quick_search_returns_results(self):
        """Test /api/quick-search returns grouped results"""
        response = requests.get(f"{API}/quick-search", params={"q": "test", "limit": 5})
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert "total" in data
        assert "query" in data
        assert data["query"] == "test"
        print(f"PASS: Quick search returned {data['total']} results")
    
    def test_quick_search_empty_query(self):
        """Test /api/quick-search with empty query returns 422 (validation)"""
        response = requests.get(f"{API}/quick-search", params={"q": "", "limit": 5})
        # Empty query returns 422 validation error - this is expected
        assert response.status_code == 422
        print("PASS: Empty query returns 422 validation error (expected)")
    
    def test_quick_search_special_characters(self):
        """Test /api/quick-search handles special characters safely"""
        response = requests.get(f"{API}/quick-search", params={"q": "test.*+?^${}()|[]\\", "limit": 5})
        assert response.status_code == 200
        # Should not crash with regex special chars
        print("PASS: Special characters handled safely")


class TestPrivatePaddy:
    """Private Paddy API tests"""
    
    def test_get_private_paddy_list(self):
        """Test GET /api/private-paddy returns list with payment_status"""
        response = requests.get(f"{API}/private-paddy")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Check that entries have payment_status field
        if len(data) > 0:
            assert "payment_status" in data[0]
            assert data[0]["payment_status"] in ["paid", "pending"]
        print(f"PASS: GET /api/private-paddy returned {len(data)} entries with payment_status")
    
    def test_create_private_paddy(self):
        """Test POST /api/private-paddy creates entry with auto-calculated fields"""
        test_entry = {
            "date": "2026-01-15",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "party_name": f"TEST_SharedLayer_{uuid.uuid4().hex[:8]}",
            "mandi_name": "TestMandi",
            "truck_no": "TEST123",
            "kg": 1000,
            "bag": 10,
            "rate_per_qntl": 2000,
            "g_deposite": 0,
            "plastic_bag": 0,
            "moisture": 15,
            "cutting_percent": 0,
            "disc_dust_poll": 0,
            "paid_amount": 0
        }
        response = requests.post(f"{API}/private-paddy", json=test_entry, params={"username": "test"})
        assert response.status_code == 200
        data = response.json()
        
        # Verify auto-calculated fields
        assert "id" in data
        assert "qntl" in data
        assert "final_qntl" in data
        assert "total_amount" in data
        assert "balance" in data
        assert data["qntl"] == 10.0  # 1000 kg / 100
        print(f"PASS: Created private paddy entry with id={data['id']}")
        
        # Cleanup
        delete_response = requests.delete(f"{API}/private-paddy/{data['id']}")
        assert delete_response.status_code == 200
        print("PASS: Cleaned up test entry")
    
    def test_private_paddy_filter_by_party(self):
        """Test GET /api/private-paddy with party_name filter"""
        response = requests.get(f"{API}/private-paddy", params={"party_name": "test"})
        assert response.status_code == 200
        data = response.json()
        # All results should contain 'test' in party_name (case insensitive)
        for entry in data:
            assert "test" in entry.get("party_name", "").lower()
        print(f"PASS: Filter by party_name returned {len(data)} entries")


class TestPrivatePayments:
    """Private Payments API tests"""
    
    def test_get_private_payments_list(self):
        """Test GET /api/private-payments returns list"""
        response = requests.get(f"{API}/private-payments")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/private-payments returned {len(data)} payments")
    
    def test_create_and_delete_payment(self):
        """Test POST /api/private-payments creates payment and updates entry balance"""
        # First create a private paddy entry
        test_entry = {
            "date": "2026-01-15",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "party_name": f"TEST_Payment_{uuid.uuid4().hex[:8]}",
            "mandi_name": "TestMandi",
            "truck_no": "TEST456",
            "kg": 1000,
            "bag": 10,
            "rate_per_qntl": 2000,
            "g_deposite": 0,
            "plastic_bag": 0,
            "moisture": 15,
            "cutting_percent": 0,
            "disc_dust_poll": 0,
            "paid_amount": 0
        }
        entry_response = requests.post(f"{API}/private-paddy", json=test_entry, params={"username": "test"})
        assert entry_response.status_code == 200
        entry = entry_response.json()
        entry_id = entry["id"]
        initial_balance = entry["balance"]
        print(f"Created test entry with id={entry_id}, balance={initial_balance}")
        
        # Create a payment
        payment_data = {
            "date": "2026-01-16",
            "ref_type": "paddy_purchase",
            "ref_id": entry_id,
            "party_name": entry["party_name"],
            "amount": 5000,
            "mode": "cash",
            "round_off": 0,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        payment_response = requests.post(f"{API}/private-payments", json=payment_data, params={"username": "test"})
        assert payment_response.status_code == 200
        payment = payment_response.json()
        payment_id = payment["id"]
        print(f"Created payment with id={payment_id}")
        
        # Verify entry balance was updated
        updated_entry_response = requests.get(f"{API}/private-paddy")
        updated_entries = [e for e in updated_entry_response.json() if e["id"] == entry_id]
        assert len(updated_entries) == 1
        updated_entry = updated_entries[0]
        assert updated_entry["paid_amount"] == 5000
        assert updated_entry["balance"] == initial_balance - 5000
        print(f"PASS: Entry balance updated correctly: paid_amount={updated_entry['paid_amount']}, balance={updated_entry['balance']}")
        
        # Delete payment and verify balance reversal
        delete_payment_response = requests.delete(f"{API}/private-payments/{payment_id}")
        assert delete_payment_response.status_code == 200
        print("PASS: Payment deleted")
        
        # Verify balance was reversed
        final_entry_response = requests.get(f"{API}/private-paddy")
        final_entries = [e for e in final_entry_response.json() if e["id"] == entry_id]
        assert len(final_entries) == 1
        final_entry = final_entries[0]
        assert final_entry["paid_amount"] == 0
        assert final_entry["balance"] == initial_balance
        print(f"PASS: Balance reversed correctly after payment deletion")
        
        # Cleanup
        requests.delete(f"{API}/private-paddy/{entry_id}")
        print("PASS: Cleaned up test entry")


class TestCashTransactions:
    """Test that private paddy creates cash book entries"""
    
    def test_private_paddy_creates_cash_entries(self):
        """Test that creating private paddy creates linked cash book entries"""
        # Create a private paddy entry with cash_paid and diesel_paid
        test_entry = {
            "date": "2026-01-15",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "party_name": f"TEST_CashEntry_{uuid.uuid4().hex[:8]}",
            "mandi_name": "TestMandi",
            "truck_no": "TESTCASH",
            "kg": 1000,
            "bag": 10,
            "rate_per_qntl": 2000,
            "g_deposite": 0,
            "plastic_bag": 0,
            "moisture": 15,
            "cutting_percent": 0,
            "disc_dust_poll": 0,
            "paid_amount": 1000,  # Advance
            "cash_paid": 500,
            "diesel_paid": 200
        }
        response = requests.post(f"{API}/private-paddy", json=test_entry, params={"username": "test"})
        assert response.status_code == 200
        entry = response.json()
        entry_id = entry["id"]
        print(f"Created entry with id={entry_id}")
        
        # Check cash book for linked entries
        cash_response = requests.get(f"{API}/cash-book")
        assert cash_response.status_code == 200
        cash_data = cash_response.json()
        cash_entries = cash_data.get("transactions", [])
        
        # Find entries linked to our test entry
        linked_entries = [c for c in cash_entries if c.get("linked_entry_id") == entry_id]
        print(f"Found {len(linked_entries)} linked cash entries")
        
        # Should have party jama entry at minimum
        jama_entries = [c for c in linked_entries if "pvt_party_jama" in c.get("reference", "")]
        assert len(jama_entries) >= 1, "Should have party jama entry"
        print("PASS: Party jama entry created")
        
        # Cleanup
        requests.delete(f"{API}/private-paddy/{entry_id}")
        print("PASS: Cleaned up test entry")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
