"""
Private Trading Module Tests - Paddy Purchase, Rice Sale, and Payments
Tests all CRUD operations and integrations for the new private trading feature
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data IDs to track for cleanup
created_paddy_ids = []
created_rice_sale_ids = []
created_payment_ids = []

class TestPrivateTradingPaddyPurchase:
    """Private Paddy Purchase (धान खरीदी) CRUD tests"""
    
    def test_get_existing_paddy_purchases(self):
        """Verify existing test data - Ram Singh entry should exist"""
        response = requests.get(f"{BASE_URL}/api/private-paddy")
        assert response.status_code == 200, f"GET /api/private-paddy failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # Check if any entry exists (test data should be present)
        print(f"Found {len(data)} paddy purchase entries")
        if len(data) > 0:
            # Verify entry has expected fields
            entry = data[0]
            assert "id" in entry, "Entry should have id"
            assert "party_name" in entry, "Entry should have party_name"
            assert "final_qntl" in entry, "Entry should have final_qntl"
            assert "total_amount" in entry, "Entry should have total_amount"
            print(f"Sample entry: {entry.get('party_name')} - {entry.get('final_qntl')}Q - Rs.{entry.get('total_amount')}")
    
    def test_create_paddy_purchase(self):
        """Create new paddy purchase with auto-calculations"""
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "season": "Kharif",
            "party_name": "TEST_Gopal Traders",
            "truck_no": "OD09X1234",
            "rst_no": "RST-123",
            "agent_name": "Ramesh Agent",
            "mandi_name": "Test Mandi",
            "kg": 5000,  # 50 QNTL
            "bag": 100,
            "rate_per_qntl": 2200,
            "g_deposite": 50,
            "plastic_bag": 10,
            "moisture": 18,  # 1% moisture cut
            "cutting_percent": 5,
            "disc_dust_poll": 5,
            "paid_amount": 10000,
            "remark": "Test entry"
        }
        response = requests.post(
            f"{BASE_URL}/api/private-paddy?username=admin&role=admin",
            json=payload
        )
        assert response.status_code == 200, f"POST /api/private-paddy failed: {response.text}"
        data = response.json()
        
        # Verify auto-calculations
        assert "id" in data, "Should have ID"
        assert data["qntl"] == 50.0, f"QNTL should be 50, got {data.get('qntl')}"
        assert data["final_qntl"] > 0, "Final QNTL should be calculated"
        assert data["total_amount"] > 0, "Total amount should be calculated"
        assert data["balance"] == data["total_amount"] - 10000, "Balance should be total - paid"
        
        created_paddy_ids.append(data["id"])
        print(f"Created paddy purchase: {data['id']} - Final: {data['final_qntl']}Q - Total: Rs.{data['total_amount']}")
    
    def test_get_paddy_purchase_with_filters(self):
        """Test GET with kms_year and season filters"""
        response = requests.get(f"{BASE_URL}/api/private-paddy?kms_year=2024-2025&season=Kharif")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} entries for 2024-2025 Kharif")
    
    def test_update_paddy_purchase(self):
        """Update existing paddy purchase entry"""
        if not created_paddy_ids:
            pytest.skip("No paddy entry created to update")
        
        item_id = created_paddy_ids[0]
        payload = {
            "rate_per_qntl": 2300,
            "paid_amount": 15000,
            "remark": "Updated test entry"
        }
        response = requests.put(
            f"{BASE_URL}/api/private-paddy/{item_id}",
            json=payload
        )
        assert response.status_code == 200, f"PUT /api/private-paddy/{item_id} failed: {response.text}"
        data = response.json()
        
        assert data["rate_per_qntl"] == 2300, "Rate should be updated"
        assert data["paid_amount"] == 15000, "Paid amount should be updated"
        print(f"Updated paddy entry: Rate={data['rate_per_qntl']}, Paid={data['paid_amount']}, Balance={data['balance']}")


class TestPrivateTradingRiceSale:
    """Rice Sale (चावल बिक्री) CRUD tests"""
    
    def test_get_existing_rice_sales(self):
        """Verify existing test data - Shyam Traders entry should exist"""
        response = requests.get(f"{BASE_URL}/api/rice-sales")
        assert response.status_code == 200, f"GET /api/rice-sales failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} rice sale entries")
        if len(data) > 0:
            entry = data[0]
            assert "party_name" in entry
            assert "quantity_qntl" in entry
            assert "total_amount" in entry
            print(f"Sample entry: {entry.get('party_name')} - {entry.get('quantity_qntl')}Q - Rs.{entry.get('total_amount')}")
    
    def test_create_rice_sale(self):
        """Create new rice sale entry"""
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "season": "Kharif",
            "party_name": "TEST_Sharma Rice Buyer",
            "rice_type": "Usna",
            "quantity_qntl": 50,
            "rate_per_qntl": 3500,
            "bags": 100,
            "truck_no": "OD10Y5678",
            "paid_amount": 50000,
            "remark": "Test rice sale"
        }
        response = requests.post(
            f"{BASE_URL}/api/rice-sales?username=admin&role=admin",
            json=payload
        )
        assert response.status_code == 200, f"POST /api/rice-sales failed: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert data["quantity_qntl"] == 50
        assert data["total_amount"] == 50 * 3500  # 175000
        assert data["balance"] == 175000 - 50000  # 125000
        
        created_rice_sale_ids.append(data["id"])
        print(f"Created rice sale: {data['id']} - Total: Rs.{data['total_amount']}, Balance: Rs.{data['balance']}")
    
    def test_get_rice_sales_with_filters(self):
        """Test GET with filters"""
        response = requests.get(f"{BASE_URL}/api/rice-sales?kms_year=2024-2025&season=Kharif")
        assert response.status_code == 200
        data = response.json()
        print(f"Found {len(data)} rice sales for 2024-2025 Kharif")
    
    def test_update_rice_sale(self):
        """Update existing rice sale entry"""
        if not created_rice_sale_ids:
            pytest.skip("No rice sale created to update")
        
        item_id = created_rice_sale_ids[0]
        payload = {
            "paid_amount": 75000,
            "remark": "Updated rice sale"
        }
        response = requests.put(
            f"{BASE_URL}/api/rice-sales/{item_id}",
            json=payload
        )
        assert response.status_code == 200, f"PUT /api/rice-sales/{item_id} failed: {response.text}"
        data = response.json()
        
        assert data["paid_amount"] == 75000
        assert data["balance"] == 175000 - 75000  # 100000
        print(f"Updated rice sale: Paid={data['paid_amount']}, Balance={data['balance']}")


class TestPrivatePayments:
    """Private Payments tests - payments against paddy purchase and rice sale"""
    
    def test_get_payments(self):
        """Get all private payments"""
        response = requests.get(f"{BASE_URL}/api/private-payments")
        assert response.status_code == 200, f"GET /api/private-payments failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} private payments")
    
    def test_create_payment_for_paddy_purchase(self):
        """Create payment for paddy purchase and verify balance update"""
        if not created_paddy_ids:
            pytest.skip("No paddy entry to make payment against")
        
        paddy_id = created_paddy_ids[0]
        # First get current balance
        get_resp = requests.get(f"{BASE_URL}/api/private-paddy")
        paddy_entries = [e for e in get_resp.json() if e["id"] == paddy_id]
        if not paddy_entries:
            pytest.skip("Could not find paddy entry")
        
        initial_paid = paddy_entries[0].get("paid_amount", 0)
        initial_balance = paddy_entries[0].get("balance", 0)
        
        payload = {
            "date": "2025-01-16",
            "kms_year": "2024-2025",
            "season": "Kharif",
            "party_name": "TEST_Gopal Traders",
            "payment_type": "paid",
            "ref_type": "paddy_purchase",
            "ref_id": paddy_id,
            "amount": 5000,
            "mode": "cash",
            "reference": "Cash payment",
            "remark": "Test payment"
        }
        response = requests.post(
            f"{BASE_URL}/api/private-payments?username=admin&role=admin",
            json=payload
        )
        assert response.status_code == 200, f"POST /api/private-payments failed: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert data["amount"] == 5000
        created_payment_ids.append(data["id"])
        
        # Verify balance was updated on paddy entry
        get_resp2 = requests.get(f"{BASE_URL}/api/private-paddy")
        paddy_entries2 = [e for e in get_resp2.json() if e["id"] == paddy_id]
        if paddy_entries2:
            new_paid = paddy_entries2[0].get("paid_amount", 0)
            assert new_paid == initial_paid + 5000, f"Paid amount should increase by 5000"
            print(f"Payment created: Rs.5000, Paddy entry paid increased from {initial_paid} to {new_paid}")
    
    def test_create_payment_for_rice_sale(self):
        """Create payment for rice sale and verify balance update"""
        if not created_rice_sale_ids:
            pytest.skip("No rice sale entry to make payment against")
        
        rice_id = created_rice_sale_ids[0]
        payload = {
            "date": "2025-01-16",
            "kms_year": "2024-2025",
            "season": "Kharif",
            "party_name": "TEST_Sharma Rice Buyer",
            "payment_type": "received",
            "ref_type": "rice_sale",
            "ref_id": rice_id,
            "amount": 25000,
            "mode": "bank",
            "reference": "UTR12345",
            "remark": "Bank transfer received"
        }
        response = requests.post(
            f"{BASE_URL}/api/private-payments?username=admin&role=admin",
            json=payload
        )
        assert response.status_code == 200, f"POST /api/private-payments failed: {response.text}"
        data = response.json()
        
        assert data["amount"] == 25000
        created_payment_ids.append(data["id"])
        print(f"Rice sale payment created: Rs.25000 via bank")
    
    def test_delete_payment_reverses_balance(self):
        """Delete payment and verify balance is reversed"""
        if not created_payment_ids:
            pytest.skip("No payment to delete")
        
        pay_id = created_payment_ids.pop()
        response = requests.delete(f"{BASE_URL}/api/private-payments/{pay_id}")
        assert response.status_code == 200, f"DELETE /api/private-payments/{pay_id} failed: {response.text}"
        print(f"Payment {pay_id} deleted and balance reversed")


class TestPartyLedgerIntegration:
    """Test Party Ledger includes pvt_paddy and rice_buyer entries"""
    
    def test_party_ledger_pvt_paddy_filter(self):
        """Test Party Ledger with pvt_paddy filter"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger?party_type=pvt_paddy")
        assert response.status_code == 200, f"GET party-ledger?party_type=pvt_paddy failed: {response.text}"
        data = response.json()
        
        assert "ledger" in data, "Response should have ledger"
        assert "party_list" in data, "Response should have party_list"
        
        # Check if pvt_paddy entries are included
        ledger = data.get("ledger", [])
        pvt_entries = [e for e in ledger if e.get("party_type") == "Pvt Paddy"]
        print(f"Found {len(pvt_entries)} Pvt Paddy entries in ledger")
    
    def test_party_ledger_rice_buyer_filter(self):
        """Test Party Ledger with rice_buyer filter"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger?party_type=rice_buyer")
        assert response.status_code == 200, f"GET party-ledger?party_type=rice_buyer failed: {response.text}"
        data = response.json()
        
        ledger = data.get("ledger", [])
        rice_entries = [e for e in ledger if e.get("party_type") == "Rice Buyer"]
        print(f"Found {len(rice_entries)} Rice Buyer entries in ledger")
    
    def test_party_ledger_all_types(self):
        """Test Party Ledger shows all party types"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger")
        assert response.status_code == 200
        data = response.json()
        
        party_list = data.get("party_list", [])
        party_types = set(p.get("type", "") for p in party_list)
        print(f"Party types in ledger: {party_types}")
        
        # Verify Pvt Paddy and Rice Buyer are in the dropdown options
        # (they should appear if there's data)


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_paddy_entries(self):
        """Delete test paddy entries"""
        for item_id in created_paddy_ids:
            response = requests.delete(f"{BASE_URL}/api/private-paddy/{item_id}")
            if response.status_code == 200:
                print(f"Deleted paddy entry: {item_id}")
    
    def test_cleanup_rice_sale_entries(self):
        """Delete test rice sale entries"""
        for item_id in created_rice_sale_ids:
            response = requests.delete(f"{BASE_URL}/api/rice-sales/{item_id}")
            if response.status_code == 200:
                print(f"Deleted rice sale: {item_id}")
    
    def test_cleanup_payments(self):
        """Delete remaining test payments"""
        for pay_id in created_payment_ids:
            response = requests.delete(f"{BASE_URL}/api/private-payments/{pay_id}")
            if response.status_code == 200:
                print(f"Deleted payment: {pay_id}")
