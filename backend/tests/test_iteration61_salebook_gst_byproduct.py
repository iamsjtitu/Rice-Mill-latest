"""
Iteration 61: Sale Book, GST Settings, CashBook Party Type Dropdown, By-product Ledger Integration
Tests:
1. Sale Book: Stock overview API returns correct items and available stock
2. Sale Book: Create voucher with items, GST, verify calculations
3. Sale Book: Party ledger entries auto-created (jama for total, nikasi for cash, cash jama for cash)
4. Sale Book: Delete voucher cleans up all linked ledger entries
5. GST Settings: GET returns saved rates
6. GST Settings: PUT updates rates
7. CashBook: party_type dropdown options available
8. By-product sales: Auto-create party ledger entry when buyer_name provided
9. By-product sales: Delete also deletes linked ledger entry
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestGSTSettings:
    """GST Settings CRUD tests"""
    
    def test_01_get_gst_settings(self):
        """GET /api/gst-settings should return GST rates"""
        response = requests.get(f"{BASE_URL}/api/gst-settings")
        assert response.status_code == 200
        data = response.json()
        assert "cgst_percent" in data
        assert "sgst_percent" in data
        assert "igst_percent" in data
        print(f"GST Settings: CGST={data['cgst_percent']}%, SGST={data['sgst_percent']}%, IGST={data['igst_percent']}%")
    
    def test_02_update_gst_settings(self):
        """PUT /api/gst-settings should update rates"""
        payload = {"cgst_percent": 2.5, "sgst_percent": 2.5, "igst_percent": 5.0}
        response = requests.put(f"{BASE_URL}/api/gst-settings", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        print("GST Settings updated successfully")
        
        # Verify update persisted
        verify_response = requests.get(f"{BASE_URL}/api/gst-settings")
        assert verify_response.status_code == 200
        verify_data = verify_response.json()
        assert verify_data["cgst_percent"] == 2.5
        assert verify_data["sgst_percent"] == 2.5
        assert verify_data["igst_percent"] == 5.0
        print("GST Settings verified after update: CGST=2.5%, SGST=2.5%, IGST=5%")


class TestSaleBookStockItems:
    """Sale Book Stock Items API tests"""
    
    def test_01_get_stock_items(self):
        """GET /api/sale-book/stock-items should return all stock items"""
        response = requests.get(f"{BASE_URL}/api/sale-book/stock-items")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Check required stock items exist
        item_names = [item["name"] for item in data]
        expected_items = ["Rice (Usna)", "Rice (Raw)", "Bran", "Kunda", "Broken", "Kanki", "Husk", "FRK"]
        for expected in expected_items:
            assert expected in item_names, f"Missing stock item: {expected}"
        
        print(f"Stock items returned: {len(data)} items")
        for item in data:
            print(f"  - {item['name']}: {item['available_qntl']} Q")
    
    def test_02_stock_items_have_correct_structure(self):
        """Each stock item should have name, available_qntl, unit"""
        response = requests.get(f"{BASE_URL}/api/sale-book/stock-items")
        assert response.status_code == 200
        data = response.json()
        
        for item in data:
            assert "name" in item, "Stock item missing 'name'"
            assert "available_qntl" in item, "Stock item missing 'available_qntl'"
            assert "unit" in item, "Stock item missing 'unit'"
            assert isinstance(item["available_qntl"], (int, float)), "available_qntl should be numeric"


class TestSaleBookVouchers:
    """Sale Book Voucher CRUD and Ledger Integration tests"""
    
    created_voucher_id = None
    test_party_name = f"TEST_SaleParty_{uuid.uuid4().hex[:8]}"
    
    def test_01_create_sale_voucher_no_gst(self):
        """Create sale voucher without GST"""
        payload = {
            "date": "2024-01-15",
            "party_name": self.test_party_name,
            "items": [
                {"item_name": "Bran", "quantity": 10, "rate": 1500, "unit": "Qntl"}
            ],
            "gst_type": "none",
            "truck_no": "OD00XX1234",
            "rst_no": "RST-001",
            "remark": "Test sale",
            "cash_paid": 5000,
            "diesel_paid": 0,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        # Validate calculations
        assert data.get("subtotal") == 15000  # 10 * 1500
        assert data.get("total") == 15000  # no GST
        assert data.get("paid_amount") == 5000
        assert data.get("balance") == 10000  # 15000 - 5000
        assert "id" in data
        assert "voucher_no" in data
        
        TestSaleBookVouchers.created_voucher_id = data["id"]
        print(f"Created sale voucher #{data['voucher_no']}: ID={data['id']}, Total=Rs.{data['total']}")
    
    def test_02_verify_ledger_entries_created(self):
        """After voucher save, ledger entries should be auto-created"""
        if not TestSaleBookVouchers.created_voucher_id:
            pytest.skip("No voucher created")
        
        voucher_id = TestSaleBookVouchers.created_voucher_id
        
        # Fetch cash_transactions to find linked entries
        response = requests.get(f"{BASE_URL}/api/cash-book")
        assert response.status_code == 200
        txns = response.json()
        
        # Find ledger jama entry (total amount receivable from party)
        jama_entry = next((t for t in txns if t.get("reference") == f"sale_voucher:{voucher_id}"), None)
        assert jama_entry is not None, "Ledger jama entry not found for sale voucher"
        assert jama_entry["txn_type"] == "jama"
        assert jama_entry["amount"] == 15000
        assert jama_entry["category"] == TestSaleBookVouchers.test_party_name
        assert jama_entry["party_type"] == "Sale Book"
        print(f"Found ledger jama entry: Rs.{jama_entry['amount']} for {jama_entry['category']}")
        
        # Find ledger nikasi entry (cash received - reduces party liability) - account=ledger
        nikasi_entry = next((t for t in txns if t.get("reference") == f"sale_voucher_cash:{voucher_id}" and t.get("account") == "ledger"), None)
        assert nikasi_entry is not None, "Ledger nikasi entry not found for cash received"
        assert nikasi_entry["txn_type"] == "nikasi"
        assert nikasi_entry["amount"] == 5000
        print(f"Found ledger nikasi entry: Rs.{nikasi_entry['amount']}")
        
        # Find cash jama entry - account=cash
        cash_jama = next((t for t in txns if t.get("reference") == f"sale_voucher_cash:{voucher_id}" and t.get("account") == "cash"), None)
        assert cash_jama is not None, "Cash jama entry not found"
        assert cash_jama["txn_type"] == "jama"
        assert cash_jama["amount"] == 5000
        print(f"Found cash jama entry: Rs.{cash_jama['amount']}")
    
    def test_03_create_sale_voucher_with_cgst_sgst(self):
        """Create sale voucher with CGST+SGST"""
        party_name = f"TEST_GSTParty_{uuid.uuid4().hex[:8]}"
        payload = {
            "date": "2024-01-16",
            "party_name": party_name,
            "items": [
                {"item_name": "Kunda", "quantity": 5, "rate": 1000, "unit": "Qntl"},
                {"item_name": "Broken", "quantity": 3, "rate": 2000, "unit": "Qntl"}
            ],
            "gst_type": "cgst_sgst",
            "cgst_percent": 2.5,
            "sgst_percent": 2.5,
            "truck_no": "OD00YY5678",
            "rst_no": "RST-002",
            "remark": "GST sale test",
            "cash_paid": 0,
            "diesel_paid": 0,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        # Subtotal = (5 * 1000) + (3 * 2000) = 5000 + 6000 = 11000
        assert data.get("subtotal") == 11000
        # CGST = 11000 * 2.5% = 275
        assert data.get("cgst_amount") == 275
        # SGST = 11000 * 2.5% = 275
        assert data.get("sgst_amount") == 275
        # Total = 11000 + 275 + 275 = 11550
        assert data.get("total") == 11550
        # Balance = 11550 (no cash paid)
        assert data.get("balance") == 11550
        
        print(f"Created GST sale voucher: Subtotal=Rs.{data['subtotal']}, CGST=Rs.{data['cgst_amount']}, SGST=Rs.{data['sgst_amount']}, Total=Rs.{data['total']}")
        
        # Clean up
        if data.get("id"):
            requests.delete(f"{BASE_URL}/api/sale-book/{data['id']}?username=admin&role=admin")
    
    def test_04_create_sale_voucher_with_igst(self):
        """Create sale voucher with IGST"""
        party_name = f"TEST_IGSTParty_{uuid.uuid4().hex[:8]}"
        payload = {
            "date": "2024-01-17",
            "party_name": party_name,
            "items": [
                {"item_name": "Husk", "quantity": 20, "rate": 500, "unit": "Qntl"}
            ],
            "gst_type": "igst",
            "igst_percent": 5,
            "truck_no": "OD00ZZ9999",
            "cash_paid": 10000,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        # Subtotal = 20 * 500 = 10000
        assert data.get("subtotal") == 10000
        # IGST = 10000 * 5% = 500
        assert data.get("igst_amount") == 500
        # Total = 10000 + 500 = 10500
        assert data.get("total") == 10500
        # Paid = 10000, Balance = 500
        assert data.get("paid_amount") == 10000
        assert data.get("balance") == 500
        
        print(f"Created IGST sale voucher: Subtotal=Rs.{data['subtotal']}, IGST=Rs.{data['igst_amount']}, Total=Rs.{data['total']}")
        
        # Clean up
        if data.get("id"):
            requests.delete(f"{BASE_URL}/api/sale-book/{data['id']}?username=admin&role=admin")
    
    def test_05_get_sale_vouchers_list(self):
        """GET /api/sale-book should return vouchers list"""
        response = requests.get(f"{BASE_URL}/api/sale-book")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Sale vouchers list: {len(data)} vouchers")
    
    def test_06_delete_voucher_cleans_ledger_entries(self):
        """Delete voucher should also delete linked ledger entries"""
        if not TestSaleBookVouchers.created_voucher_id:
            pytest.skip("No voucher to delete")
        
        voucher_id = TestSaleBookVouchers.created_voucher_id
        
        # Delete voucher
        response = requests.delete(f"{BASE_URL}/api/sale-book/{voucher_id}?username=admin&role=admin")
        assert response.status_code == 200
        print(f"Deleted voucher: {voucher_id}")
        
        # Verify ledger entries are also deleted
        txns_response = requests.get(f"{BASE_URL}/api/cash-book")
        assert txns_response.status_code == 200
        txns = txns_response.json()
        
        # Check no entries with this voucher reference exist
        linked_entries = [t for t in txns if t.get("reference", "").startswith(f"sale_voucher") and voucher_id in t.get("reference", "")]
        assert len(linked_entries) == 0, f"Linked ledger entries should be deleted, found: {len(linked_entries)}"
        print("Verified: All linked ledger entries deleted")


class TestByProductLedgerIntegration:
    """By-product sales ledger auto-creation tests"""
    
    created_sale_id = None
    test_buyer_name = f"TEST_BPBuyer_{uuid.uuid4().hex[:8]}"
    
    def test_01_create_byproduct_sale_creates_ledger_entry(self):
        """POST /api/byproduct-sales should auto-create party ledger entry"""
        payload = {
            "date": "2024-01-20",
            "product": "bran",
            "quantity_qntl": 5,
            "rate_per_qntl": 1500,
            "buyer_name": self.test_buyer_name,
            "note": "Test by-product sale",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/byproduct-sales?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("total_amount") == 7500  # 5 * 1500
        assert "id" in data
        TestByProductLedgerIntegration.created_sale_id = data["id"]
        print(f"Created by-product sale: ID={data['id']}, Amount=Rs.{data['total_amount']}")
        
        # Verify ledger entry created
        txns_response = requests.get(f"{BASE_URL}/api/cash-book")
        assert txns_response.status_code == 200
        txns = txns_response.json()
        
        ledger_entry = next((t for t in txns if t.get("reference") == f"byproduct:{data['id']}"), None)
        assert ledger_entry is not None, "Ledger entry not created for by-product sale"
        assert ledger_entry["txn_type"] == "jama"
        assert ledger_entry["amount"] == 7500
        assert ledger_entry["category"] == self.test_buyer_name
        assert ledger_entry["party_type"] == "By-Product Sale"
        print(f"Found ledger entry: Rs.{ledger_entry['amount']} for {ledger_entry['category']}")
    
    def test_02_delete_byproduct_sale_deletes_ledger_entry(self):
        """DELETE /api/byproduct-sales/{id} should delete linked ledger entry"""
        if not TestByProductLedgerIntegration.created_sale_id:
            pytest.skip("No by-product sale to delete")
        
        sale_id = TestByProductLedgerIntegration.created_sale_id
        
        # Delete sale
        response = requests.delete(f"{BASE_URL}/api/byproduct-sales/{sale_id}?username=admin&role=admin")
        assert response.status_code == 200
        print(f"Deleted by-product sale: {sale_id}")
        
        # Verify ledger entry also deleted
        txns_response = requests.get(f"{BASE_URL}/api/cash-book")
        assert txns_response.status_code == 200
        txns = txns_response.json()
        
        ledger_entry = next((t for t in txns if t.get("reference") == f"byproduct:{sale_id}"), None)
        assert ledger_entry is None, "Ledger entry should be deleted with by-product sale"
        print("Verified: Linked ledger entry deleted")


class TestCashBookPartyTypeDropdown:
    """CashBook party_type dropdown options test"""
    
    def test_01_party_type_options_in_transactions(self):
        """Cash book transactions should support various party_type values"""
        expected_party_types = [
            "Cash Party", "Pvt Paddy Purchase", "Rice Sale", "Diesel", 
            "Local Party", "Truck", "Agent", "By-Product Sale", "Staff"
        ]
        
        # Create a test transaction with manual party_type
        payload = {
            "date": "2024-01-20",
            "account": "cash",
            "txn_type": "nikasi",
            "amount": 100,
            "category": f"TEST_ManualPartyType_{uuid.uuid4().hex[:8]}",
            "party_type": "Staff",
            "description": "Test manual party type",
            "reference": "",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/cash-book?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("party_type") == "Staff"
        print(f"Created transaction with manual party_type='Staff'")
        
        # Clean up
        if data.get("id"):
            requests.delete(f"{BASE_URL}/api/cash-book/{data['id']}?username=admin&role=admin")
        print("Test transaction cleaned up")


class TestCleanupAllTestData:
    """Cleanup all TEST_ prefixed data"""
    
    def test_99_cleanup(self):
        """Clean up any remaining test data"""
        # Get all sale vouchers and delete TEST_ ones
        sv_response = requests.get(f"{BASE_URL}/api/sale-book")
        if sv_response.status_code == 200:
            for v in sv_response.json():
                if v.get("party_name", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/sale-book/{v['id']}?username=admin&role=admin")
                    print(f"Deleted test sale voucher: {v['id']}")
        
        # Get all by-product sales and delete TEST_ ones
        bp_response = requests.get(f"{BASE_URL}/api/byproduct-sales")
        if bp_response.status_code == 200:
            for s in bp_response.json():
                if s.get("buyer_name", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/byproduct-sales/{s['id']}?username=admin&role=admin")
                    print(f"Deleted test by-product sale: {s['id']}")
        
        # Get cash transactions and delete TEST_ ones
        txn_response = requests.get(f"{BASE_URL}/api/cash-book")
        if txn_response.status_code == 200:
            for t in txn_response.json():
                if t.get("category", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/cash-book/{t['id']}?username=admin&role=admin")
                    print(f"Deleted test transaction: {t['id']}")
        
        print("Cleanup complete")
