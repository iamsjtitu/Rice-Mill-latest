"""
Test Suite for Iteration 90 - Truck Lease Management Feature
Tests the new Truck Lease Management module including:
- CRUD operations for truck leases
- Monthly payment grid and payments
- Cash Book integration (nikasi entry on payment)
- Balance Sheet integration (Sundry Creditors)
- Duplicate lease prevention
- Cash Book delete with linked_payment_id reversal
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://farm-accounts-6.preview.emergentagent.com")

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestAuthLogin:
    """Test Login with admin/admin123"""
    
    def test_login_success(self, api_client):
        """Test login with valid credentials"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert data.get("username") == "admin"
        assert data.get("role") == "admin"
        print(f"✓ Login successful: {data}")


class TestTruckLeaseExisting:
    """Test existing truck lease data (OD15B5678)"""
    
    def test_get_all_leases(self, api_client):
        """GET /api/truck-leases - list existing leases"""
        response = api_client.get(f"{BASE_URL}/api/truck-leases")
        assert response.status_code == 200, f"Failed: {response.text}"
        leases = response.json()
        assert isinstance(leases, list)
        # Should have at least the existing lease OD15B5678
        lease_truck_nos = [l["truck_no"] for l in leases]
        assert "OD15B5678" in lease_truck_nos, f"Existing lease OD15B5678 not found"
        print(f"✓ Found {len(leases)} leases, including OD15B5678")
    
    def test_existing_lease_payments(self, api_client):
        """GET /api/truck-leases/{id}/payments - verify monthly breakdown"""
        # First get the lease id
        response = api_client.get(f"{BASE_URL}/api/truck-leases")
        leases = response.json()
        existing_lease = next((l for l in leases if l["truck_no"] == "OD15B5678"), None)
        assert existing_lease, "Existing lease OD15B5678 not found"
        
        lease_id = existing_lease["id"]
        response = api_client.get(f"{BASE_URL}/api/truck-leases/{lease_id}/payments")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify structure
        assert "lease" in data
        assert "monthly_records" in data
        assert "total_rent" in data
        assert "total_paid" in data
        assert "total_balance" in data
        
        # Verify values - 6 months @ 120000 = 720000, 1 payment of 120000
        assert data["total_rent"] == 720000.0, f"Expected 720000, got {data['total_rent']}"
        assert data["total_paid"] == 120000.0, f"Expected 120000, got {data['total_paid']}"
        assert data["total_balance"] == 600000.0, f"Expected 600000, got {data['total_balance']}"
        
        # Verify monthly records have correct status
        oct_record = next((r for r in data["monthly_records"] if r["month"] == "2025-10"), None)
        assert oct_record, "Oct 2025 record not found"
        assert oct_record["status"] == "paid", f"Oct should be paid, got {oct_record['status']}"
        assert oct_record["paid"] == 120000.0
        
        print(f"✓ Lease payments verified: total_rent={data['total_rent']}, total_paid={data['total_paid']}, total_balance={data['total_balance']}")
    
    def test_cash_book_has_lease_payment(self, api_client):
        """Verify cash book has nikasi entry for the lease payment"""
        response = api_client.get(f"{BASE_URL}/api/cash-book?party_type=Truck+Lease&kms_year=2025-2026")
        assert response.status_code == 200, f"Failed: {response.text}"
        txns = response.json()
        
        # Should have at least 1 transaction for the Oct 2025 payment
        lease_txns = [t for t in txns if "OD15B5678" in t.get("category", "")]
        assert len(lease_txns) >= 1, "No cash book entries for OD15B5678 lease"
        
        # Verify the cash transaction has nikasi type
        cash_txn = next((t for t in lease_txns if t.get("account") == "cash"), None)
        assert cash_txn, "No cash nikasi entry found"
        assert cash_txn["txn_type"] == "nikasi", "Should be nikasi type"
        assert cash_txn["amount"] == 120000.0
        assert cash_txn["party_type"] == "Truck Lease"
        assert "linked_payment_id" in cash_txn
        assert cash_txn["linked_payment_id"].startswith("truck_lease:")
        
        print(f"✓ Cash Book has lease payment entry: {cash_txn['category']} - Rs.{cash_txn['amount']}")


class TestBalanceSheetIntegration:
    """Test Balance Sheet shows truck lease under Sundry Creditors"""
    
    def test_balance_sheet_sundry_creditors(self, api_client):
        """GET /api/fy-summary/balance-sheet - verify Truck Lease in Sundry Creditors"""
        response = api_client.get(f"{BASE_URL}/api/fy-summary/balance-sheet?kms_year=2025-2026")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Find Sundry Creditors
        liabilities = data.get("liabilities", [])
        sundry_creditors = next((l for l in liabilities if l.get("group") == "Sundry Creditors"), None)
        assert sundry_creditors, "Sundry Creditors not found in liabilities"
        
        children = sundry_creditors.get("children", [])
        lease_entry = next((c for c in children if "Truck Lease - OD15B5678" in c.get("name", "")), None)
        assert lease_entry, f"Truck Lease - OD15B5678 not in Sundry Creditors. Children: {[c['name'] for c in children]}"
        
        # Verify the balance amount (600000 = 720000 total - 120000 paid)
        assert lease_entry["amount"] == 600000.0, f"Expected 600000, got {lease_entry['amount']}"
        
        # Check no duplicate entries
        lease_entries = [c for c in children if "Truck Lease - OD15B5678" in c.get("name", "")]
        assert len(lease_entries) == 1, f"Duplicate lease entries found: {lease_entries}"
        
        print(f"✓ Balance Sheet shows Truck Lease - OD15B5678 with balance Rs.{lease_entry['amount']}")


class TestTruckLeaseCRUD:
    """Test CRUD operations for truck leases"""
    
    @pytest.fixture
    def test_lease_data(self):
        """Generate unique test lease data"""
        unique_id = str(uuid.uuid4())[:6]
        return {
            "truck_no": f"TEST_LEASE_{unique_id}",
            "owner_name": f"Test Owner {unique_id}",
            "monthly_rent": 50000,
            "start_date": "2026-01-01",
            "end_date": "",
            "advance_deposit": 10000,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
    
    def test_create_lease(self, api_client, test_lease_data):
        """POST /api/truck-leases - create new lease"""
        response = api_client.post(f"{BASE_URL}/api/truck-leases", json=test_lease_data)
        assert response.status_code == 200, f"Create failed: {response.text}"
        lease = response.json()
        
        assert "id" in lease
        assert lease["truck_no"] == test_lease_data["truck_no"].upper()
        assert lease["owner_name"] == test_lease_data["owner_name"]
        assert lease["monthly_rent"] == test_lease_data["monthly_rent"]
        assert lease["status"] == "active"
        
        print(f"✓ Created lease: {lease['truck_no']} - Rs.{lease['monthly_rent']}/month")
        
        # Store for cleanup
        self.created_lease_id = lease["id"]
        return lease
    
    def test_duplicate_lease_prevention(self, api_client, test_lease_data):
        """Creating duplicate lease for same truck should fail"""
        # First create a lease
        response1 = api_client.post(f"{BASE_URL}/api/truck-leases", json=test_lease_data)
        assert response1.status_code == 200
        lease = response1.json()
        
        # Try to create another with same truck_no
        response2 = api_client.post(f"{BASE_URL}/api/truck-leases", json=test_lease_data)
        assert response2.status_code == 400, f"Should have failed but got {response2.status_code}: {response2.text}"
        error = response2.json()
        assert "already has an active lease" in error.get("detail", "").lower() or "already" in error.get("detail", "").lower()
        
        print(f"✓ Duplicate prevention works: {error.get('detail')}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/truck-leases/{lease['id']}")
    
    def test_create_and_delete_lease(self, api_client, test_lease_data):
        """Test full lifecycle: create, verify, delete"""
        # Create
        response = api_client.post(f"{BASE_URL}/api/truck-leases", json=test_lease_data)
        assert response.status_code == 200
        lease = response.json()
        lease_id = lease["id"]
        
        # Verify it's in the list
        response = api_client.get(f"{BASE_URL}/api/truck-leases")
        leases = response.json()
        found = any(l["id"] == lease_id for l in leases)
        assert found, "Created lease not found in list"
        
        # Delete
        response = api_client.delete(f"{BASE_URL}/api/truck-leases/{lease_id}")
        assert response.status_code == 200, f"Delete failed: {response.text}"
        
        # Verify it's gone
        response = api_client.get(f"{BASE_URL}/api/truck-leases")
        leases = response.json()
        found = any(l["id"] == lease_id for l in leases)
        assert not found, "Deleted lease still in list"
        
        print(f"✓ Create and delete lifecycle passed for {test_lease_data['truck_no']}")


class TestLeasePaymentFlow:
    """Test payment flow with cash book integration"""
    
    def test_make_payment_creates_cash_book_entry(self, api_client):
        """POST /api/truck-leases/{id}/pay - should create cash book nikasi entry"""
        # Create a test lease
        unique_id = str(uuid.uuid4())[:6]
        lease_data = {
            "truck_no": f"TEST_PAY_{unique_id}",
            "owner_name": f"Payment Test {unique_id}",
            "monthly_rent": 30000,
            "start_date": "2026-01-01",
            "end_date": "",
            "advance_deposit": 0,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        response = api_client.post(f"{BASE_URL}/api/truck-leases", json=lease_data)
        assert response.status_code == 200
        lease = response.json()
        lease_id = lease["id"]
        
        try:
            # Make a payment
            payment_data = {
                "amount": 30000,
                "month": "2026-01",
                "account": "cash",
                "payment_date": "2026-01-15",
                "notes": "Test payment"
            }
            response = api_client.post(f"{BASE_URL}/api/truck-leases/{lease_id}/pay", json=payment_data)
            assert response.status_code == 200, f"Payment failed: {response.text}"
            pay_result = response.json()
            
            assert "payment" in pay_result
            assert "cash_txn_id" in pay_result
            assert pay_result["payment"]["amount"] == 30000
            
            # Verify cash book has the entry (truck_no is uppercased)
            response = api_client.get(f"{BASE_URL}/api/cash-book?party_type=Truck+Lease&kms_year=2025-2026")
            txns = response.json()
            search_term = f"TEST_PAY_{unique_id}".upper()
            # Filter for cash account (not ledger) - the cash entry has linked_payment_id
            cash_entry = next((t for t in txns if search_term in t.get("category", "") and t.get("account") == "cash"), None)
            assert cash_entry, f"Cash book cash entry not found for {search_term}. Cash entries: {[(t.get('category'), t.get('account')) for t in txns[:5]]}"
            assert cash_entry["txn_type"] == "nikasi"
            assert cash_entry["amount"] == 30000
            assert cash_entry.get("linked_payment_id", "").startswith("truck_lease:"), f"Expected linked_payment_id to start with truck_lease:, got {cash_entry.get('linked_payment_id')}"
            
            print(f"✓ Payment created cash book entry: {cash_entry['category']} - Rs.{cash_entry['amount']}")
            
            # Verify payment summary updated
            response = api_client.get(f"{BASE_URL}/api/truck-leases/{lease_id}/payments")
            data = response.json()
            jan_record = next((r for r in data["monthly_records"] if r["month"] == "2026-01"), None)
            assert jan_record, "Jan 2026 record not found"
            assert jan_record["status"] == "paid", f"Jan should be paid, got {jan_record['status']}"
            assert jan_record["paid"] == 30000
            
            print(f"✓ Payment updated monthly record to 'paid'")
            
        finally:
            # Cleanup
            api_client.delete(f"{BASE_URL}/api/truck-leases/{lease_id}")


class TestCashBookDeleteReversal:
    """Test that deleting cash book entry with linked_payment_id reverses lease payment"""
    
    def test_delete_cash_book_removes_lease_payment(self, api_client):
        """DELETE /api/cash-book/{id} with truck_lease linked_payment_id should remove payment"""
        # Create a test lease
        unique_id = str(uuid.uuid4())[:6]
        lease_data = {
            "truck_no": f"TEST_DEL_{unique_id}",
            "owner_name": f"Delete Test {unique_id}",
            "monthly_rent": 25000,
            "start_date": "2026-02-01",
            "end_date": "",
            "advance_deposit": 0,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        response = api_client.post(f"{BASE_URL}/api/truck-leases", json=lease_data)
        assert response.status_code == 200
        lease = response.json()
        lease_id = lease["id"]
        
        try:
            # Make a payment
            payment_data = {
                "amount": 25000,
                "month": "2026-02",
                "account": "cash",
                "payment_date": "2026-02-15"
            }
            response = api_client.post(f"{BASE_URL}/api/truck-leases/{lease_id}/pay", json=payment_data)
            assert response.status_code == 200
            pay_result = response.json()
            cash_txn_id = pay_result["cash_txn_id"]
            
            # Verify payment exists
            response = api_client.get(f"{BASE_URL}/api/truck-leases/{lease_id}/payments")
            data = response.json()
            assert data["total_paid"] == 25000
            feb_record = next((r for r in data["monthly_records"] if r["month"] == "2026-02"), None)
            assert feb_record["status"] == "paid"
            
            # Delete the cash book entry
            response = api_client.delete(f"{BASE_URL}/api/cash-book/{cash_txn_id}")
            assert response.status_code == 200, f"Delete failed: {response.text}"
            
            # Verify payment was reversed
            response = api_client.get(f"{BASE_URL}/api/truck-leases/{lease_id}/payments")
            data = response.json()
            assert data["total_paid"] == 0, f"Expected 0 after reversal, got {data['total_paid']}"
            feb_record = next((r for r in data["monthly_records"] if r["month"] == "2026-02"), None)
            assert feb_record["status"] == "pending", f"Feb should be pending after reversal, got {feb_record['status']}"
            
            print(f"✓ Cash book delete correctly reversed lease payment")
            
        finally:
            # Cleanup
            api_client.delete(f"{BASE_URL}/api/truck-leases/{lease_id}")


class TestLeaseSummary:
    """Test lease summary endpoint"""
    
    def test_lease_summary(self, api_client):
        """GET /api/truck-leases/summary - should return aggregated data"""
        response = api_client.get(f"{BASE_URL}/api/truck-leases/summary?kms_year=2025-2026")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "leases" in data
        assert "total_rent" in data
        assert "total_paid" in data
        assert "total_balance" in data
        
        # Should include OD15B5678 with balance 600000
        lease_summary = next((l for l in data["leases"] if l["truck_no"] == "OD15B5678"), None)
        assert lease_summary, "OD15B5678 not in summary"
        assert lease_summary["balance"] == 600000.0
        
        print(f"✓ Lease summary: {len(data['leases'])} leases, total_balance={data['total_balance']}")


class TestLeaseHistory:
    """Test payment history endpoint"""
    
    def test_payment_history(self, api_client):
        """GET /api/truck-leases/{id}/history - should return payment history"""
        # Get existing lease
        response = api_client.get(f"{BASE_URL}/api/truck-leases")
        leases = response.json()
        existing_lease = next((l for l in leases if l["truck_no"] == "OD15B5678"), None)
        assert existing_lease, "Existing lease not found"
        
        response = api_client.get(f"{BASE_URL}/api/truck-leases/{existing_lease['id']}/history")
        assert response.status_code == 200, f"Failed: {response.text}"
        history = response.json()
        
        assert isinstance(history, list)
        # Should have at least 1 payment (Oct 2025)
        assert len(history) >= 1, "Expected at least 1 payment in history"
        
        payment = history[0]
        assert "amount" in payment
        assert "month" in payment
        assert "payment_date" in payment
        
        print(f"✓ Payment history has {len(history)} entries")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
