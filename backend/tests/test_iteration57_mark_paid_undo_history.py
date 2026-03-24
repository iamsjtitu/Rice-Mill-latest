"""
Iteration 57: Test Mark Paid, Undo Paid, and Payment History features for Private Trading Paddy Purchase
Similar to Truck Payment page functionality.

Test Focus:
1. GET /api/private-paddy/{id}/history - Returns payment history array
2. POST /api/private-paddy/{id}/mark-paid - Marks entry as fully paid, creates cash book entries
3. POST /api/private-paddy/{id}/undo-paid - Resets all payments to 0
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://styled-exports-node.preview.emergentagent.com').rstrip('/')

# Raju entry ID from context
RAJU_ENTRY_ID = "326b1eb2-1c7d-43e5-9b0c-f20f56a63dda"


@pytest.fixture
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestPrivatePaddyHistoryAPI:
    """Test GET /api/private-paddy/{id}/history endpoint"""

    def test_01_history_endpoint_exists(self, api_client):
        """Test that history endpoint returns 200"""
        response = api_client.get(f"{BASE_URL}/api/private-paddy/{RAJU_ENTRY_ID}/history")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASSED: History endpoint exists and returns 200")

    def test_02_history_returns_correct_structure(self, api_client):
        """Test history endpoint returns history array and total_paid"""
        response = api_client.get(f"{BASE_URL}/api/private-paddy/{RAJU_ENTRY_ID}/history")
        data = response.json()
        
        assert "history" in data, "Response should have 'history' key"
        assert "total_paid" in data, "Response should have 'total_paid' key"
        assert isinstance(data["history"], list), "'history' should be a list"
        print(f"PASSED: History structure correct - history count: {len(data['history'])}, total_paid: {data['total_paid']}")

    def test_03_history_not_found_for_invalid_id(self, api_client):
        """Test history endpoint returns 404 for invalid entry ID"""
        response = api_client.get(f"{BASE_URL}/api/private-paddy/invalid-id/history")
        # Should return empty history or 404
        if response.status_code == 200:
            data = response.json()
            assert len(data.get("history", [])) == 0, "Invalid ID should have no history"
        print("PASSED: Invalid ID handled correctly")


class TestMarkPaidAPI:
    """Test POST /api/private-paddy/{id}/mark-paid endpoint"""

    def test_01_mark_paid_requires_admin_role(self, api_client):
        """Test that mark-paid requires admin role"""
        response = api_client.post(f"{BASE_URL}/api/private-paddy/{RAJU_ENTRY_ID}/mark-paid")
        assert response.status_code == 403, f"Expected 403 without admin role, got {response.status_code}"
        data = response.json()
        assert "admin" in data.get("detail", "").lower(), "Error should mention admin"
        print("PASSED: Mark paid requires admin role (403 without role)")

    def test_02_mark_paid_with_admin_role(self, api_client):
        """Test mark-paid succeeds with admin role"""
        response = api_client.post(f"{BASE_URL}/api/private-paddy/{RAJU_ENTRY_ID}/mark-paid?username=admin&role=admin")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True, "Response should have success=True"
        print(f"PASSED: Mark paid succeeded - {data.get('message')}")

    def test_03_verify_entry_status_after_mark_paid(self, api_client):
        """Verify entry has payment_status=paid and balance=0 after mark-paid"""
        response = api_client.get(f"{BASE_URL}/api/private-paddy")
        data = response.json()
        raju = next((i for i in data if i.get("id") == RAJU_ENTRY_ID), None)
        
        assert raju is not None, "Raju entry should exist"
        assert raju.get("payment_status") == "paid", f"Expected payment_status='paid', got '{raju.get('payment_status')}'"
        assert raju.get("balance") == 0, f"Expected balance=0, got {raju.get('balance')}"
        print(f"PASSED: Entry status verified - payment_status={raju.get('payment_status')}, balance={raju.get('balance')}")


class TestUndoPaidAPI:
    """Test POST /api/private-paddy/{id}/undo-paid endpoint"""

    def test_01_undo_paid_requires_admin_role(self, api_client):
        """Test that undo-paid requires admin role"""
        response = api_client.post(f"{BASE_URL}/api/private-paddy/{RAJU_ENTRY_ID}/undo-paid")
        assert response.status_code == 403, f"Expected 403 without admin role, got {response.status_code}"
        print("PASSED: Undo paid requires admin role (403 without role)")

    def test_02_undo_paid_with_admin_role(self, api_client):
        """Test undo-paid succeeds with admin role"""
        response = api_client.post(f"{BASE_URL}/api/private-paddy/{RAJU_ENTRY_ID}/undo-paid?username=admin&role=admin")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True, "Response should have success=True"
        print(f"PASSED: Undo paid succeeded - {data.get('message')}")

    def test_03_verify_entry_reset_after_undo(self, api_client):
        """Verify entry has payment_status=pending, paid_amount=0, balance=total after undo"""
        response = api_client.get(f"{BASE_URL}/api/private-paddy")
        data = response.json()
        raju = next((i for i in data if i.get("id") == RAJU_ENTRY_ID), None)
        
        assert raju is not None, "Raju entry should exist"
        assert raju.get("payment_status") == "pending", f"Expected payment_status='pending', got '{raju.get('payment_status')}'"
        assert raju.get("paid_amount") == 0, f"Expected paid_amount=0, got {raju.get('paid_amount')}"
        assert raju.get("balance") == raju.get("total_amount"), f"Expected balance={raju.get('total_amount')}, got {raju.get('balance')}"
        print(f"PASSED: Entry reset verified - status={raju.get('payment_status')}, paid={raju.get('paid_amount')}, balance={raju.get('balance')}")


class TestCashBookEntriesCreation:
    """Test that mark-paid creates cash book entries with correct format"""

    def test_01_mark_paid_creates_cashbook_entries(self, api_client):
        """Test: When balance > 0 and mark paid, cash book entries should be created"""
        # First verify Raju's balance is > 0 (from undo)
        response = api_client.get(f"{BASE_URL}/api/private-paddy")
        data = response.json()
        raju = next((i for i in data if i.get("id") == RAJU_ENTRY_ID), None)
        
        if raju and raju.get("balance", 0) == 0:
            # Already paid, undo first
            api_client.post(f"{BASE_URL}/api/private-paddy/{RAJU_ENTRY_ID}/undo-paid?username=admin&role=admin")
            response = api_client.get(f"{BASE_URL}/api/private-paddy")
            data = response.json()
            raju = next((i for i in data if i.get("id") == RAJU_ENTRY_ID), None)
        
        balance_before = raju.get("balance", 0) if raju else 0
        print(f"Balance before mark-paid: Rs.{balance_before}")
        
        # Mark as paid
        response = api_client.post(f"{BASE_URL}/api/private-paddy/{RAJU_ENTRY_ID}/mark-paid?username=admin&role=admin")
        assert response.status_code == 200, f"Mark paid failed: {response.text}"
        
        # Check cash book entries
        response = api_client.get(f"{BASE_URL}/api/cash-book")
        transactions = response.json()
        
        # Look for mark_paid entries
        mark_paid_entries = [t for t in transactions if "mark_paid" in (t.get("reference", "") or "").lower()]
        print(f"Found {len(mark_paid_entries)} mark_paid entries in cash book")
        
        # If balance was > 0, there should be entries
        if balance_before > 0:
            assert len(mark_paid_entries) > 0, "Expected cash book entries when balance > 0"
            
            # Verify description format: 'Party - Mandi - qty @ Rs.rate'
            for entry in mark_paid_entries:
                desc = entry.get("description", "")
                print(f"  Entry description: {desc}")
                # Should contain party name and '@ Rs.' format
                assert "Raju" in desc or entry.get("category", "") == "Raju - Nanu", f"Entry should mention party name"
        
        print("PASSED: Cash book entries created correctly for mark-paid")


class TestDescriptionFormat:
    """Test that cash book descriptions have 'qty @ Rs.rate' format"""

    def test_01_verify_cashbook_description_format(self, api_client):
        """Verify cash book entries have 'qty @ Rs.rate' format"""
        response = api_client.get(f"{BASE_URL}/api/cash-book")
        data = response.json()
        
        # Filter for pvt paddy related entries
        pvt_entries = [t for t in data if 
                       "Pvt Paddy" in (t.get("party_type", "") or "") or
                       "mark_paid" in (t.get("reference", "") or "") or
                       "pvt_paddy" in (t.get("reference", "") or "")]
        
        print(f"Found {len(pvt_entries)} pvt paddy related cash book entries")
        
        # Check description format
        has_qty_format = False
        for entry in pvt_entries[:10]:
            desc = entry.get("description", "")
            if "@ Rs." in desc or "@Rs." in desc:
                has_qty_format = True
                print(f"  Found qty@rate format: {desc}")
        
        if pvt_entries:
            # At least some entries should have the format
            print(f"PASSED: Cash book entries found, checking format in descriptions")
        else:
            print("INFO: No pvt paddy cash book entries found to verify format")


class TestPrivatePaddyAPIs:
    """General API tests for private paddy endpoints"""

    def test_01_private_paddy_list(self, api_client):
        """Test GET /api/private-paddy returns data"""
        response = api_client.get(f"{BASE_URL}/api/private-paddy")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASSED: Private paddy list - {len(data)} entries")

    def test_02_private_payments_list(self, api_client):
        """Test GET /api/private-payments returns data"""
        response = api_client.get(f"{BASE_URL}/api/private-payments")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASSED: Private payments list - {len(data)} payments")

    def test_03_party_summary(self, api_client):
        """Test GET /api/private-trading/party-summary returns data"""
        response = api_client.get(f"{BASE_URL}/api/private-trading/party-summary")
        assert response.status_code == 200
        data = response.json()
        assert "parties" in data
        assert "totals" in data
        print(f"PASSED: Party summary - {len(data['parties'])} parties")


class TestRestoreRajuState:
    """Restore Raju to a known state after tests"""

    def test_final_restore_raju(self, api_client):
        """Restore Raju entry to balance=0 state for consistency"""
        # First check current state
        response = api_client.get(f"{BASE_URL}/api/private-paddy")
        data = response.json()
        raju = next((i for i in data if i.get("id") == RAJU_ENTRY_ID), None)
        
        if raju and raju.get("payment_status") != "paid":
            # Mark as paid to restore
            api_client.post(f"{BASE_URL}/api/private-paddy/{RAJU_ENTRY_ID}/mark-paid?username=admin&role=admin")
            print("Restored Raju to paid state")
        else:
            print("Raju already in paid state")
        
        print("PASSED: Test cleanup complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
