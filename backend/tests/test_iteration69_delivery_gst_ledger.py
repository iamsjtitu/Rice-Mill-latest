"""
Iteration 69 Tests - DC Delivery enhancements, GST Ledger, and related features
Features being tested:
1. DC Delivery - new fields (invoice_no, rst_no, bags_used, cash_paid, diesel_paid)
2. DC Delivery - auto-entries (cash_paid -> cash_transactions, diesel_paid -> cash_transactions, bags_used -> gunny_bags)
3. DC Delivery delete - cleans up auto-created entries
4. DC Delivery Invoice endpoint - generates HTML invoice
5. GST Ledger - computes from purchase & sale vouchers
6. GST Opening Balance - get/set opening balance by KMS year
7. Govt Bags Stock - returns stock summary
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDCDeliveryNewFields:
    """Tests for DC Delivery with new fields: invoice_no, rst_no, bags_used, cash_paid, diesel_paid"""
    
    @pytest.fixture(scope="class")
    def test_dc_id(self):
        """Create a test DC for delivery tests"""
        dc_data = {
            "dc_number": f"TEST_DC_{uuid.uuid4().hex[:6]}",
            "date": "2025-01-15",
            "quantity_qntl": 100,
            "rice_type": "parboiled",
            "godown_name": "Test Godown",
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/dc-entries?username=test", json=dc_data)
        assert response.status_code == 200
        data = response.json()
        yield data["id"]
        # Cleanup
        requests.delete(f"{BASE_URL}/api/dc-entries/{data['id']}")
    
    def test_create_delivery_with_new_fields(self, test_dc_id):
        """POST /api/dc-deliveries - Create delivery with invoice_no, rst_no, bags_used, cash_paid, diesel_paid"""
        delivery_data = {
            "dc_id": test_dc_id,
            "date": "2025-01-16",
            "quantity_qntl": 25,
            "vehicle_no": "OD01AB1234",
            "driver_name": "Test Driver",
            "slip_no": "SLIP-001",
            "godown_name": "Test Godown",
            "invoice_no": "TEST_INV_001",
            "rst_no": "TEST_RST_001",
            "bags_used": 50,
            "cash_paid": 3000,
            "diesel_paid": 2000,
            "notes": "Test delivery with all new fields",
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/dc-deliveries?username=test", json=delivery_data)
        assert response.status_code == 200
        data = response.json()
        
        # Verify all new fields are returned
        assert data["invoice_no"] == "TEST_INV_001"
        assert data["rst_no"] == "TEST_RST_001"
        assert data["bags_used"] == 50
        assert data["cash_paid"] == 3000
        assert data["diesel_paid"] == 2000
        assert "id" in data
        
        # Store delivery_id for later tests
        self.__class__.test_delivery_id = data["id"]
    
    def test_delivery_creates_cash_auto_entry(self, test_dc_id):
        """Verify cash_paid creates auto cash_transactions entry with party_type=Truck"""
        # Wait a moment and then check for the auto-created cash entry
        delivery_id = getattr(self.__class__, 'test_delivery_id', None)
        if not delivery_id:
            pytest.skip("No test delivery created")
        
        # Check cash_transactions for the auto-created cash entry
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        assert response.status_code == 200
        txns = response.json()
        
        # Find the auto-created cash entry for this delivery
        cash_entries = [t for t in txns if t.get("reference", "").startswith(f"delivery:{delivery_id[:8]}")]
        assert len(cash_entries) >= 1, "Cash auto-entry not created"
        
        cash_entry = [t for t in cash_entries if t.get("party_type") == "Truck"]
        assert len(cash_entry) >= 1, "Cash entry with party_type=Truck not found"
        assert cash_entry[0]["amount"] == 3000
        assert cash_entry[0]["txn_type"] == "nikasi"
        assert cash_entry[0]["account"] == "cash"
    
    def test_delivery_creates_diesel_auto_entry(self, test_dc_id):
        """Verify diesel_paid creates auto cash_transactions entry with party_type=Diesel"""
        delivery_id = getattr(self.__class__, 'test_delivery_id', None)
        if not delivery_id:
            pytest.skip("No test delivery created")
        
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        assert response.status_code == 200
        txns = response.json()
        
        # Find diesel auto-entry
        diesel_entries = [t for t in txns if t.get("reference", "").startswith(f"delivery_diesel:{delivery_id[:8]}")]
        assert len(diesel_entries) >= 1, "Diesel auto-entry not created"
        assert diesel_entries[0]["amount"] == 2000
        assert diesel_entries[0]["party_type"] == "Diesel"
        assert diesel_entries[0]["txn_type"] == "nikasi"
    
    def test_delivery_creates_bags_auto_entry(self, test_dc_id):
        """Verify bags_used creates auto gunny_bags entry with txn_type=out"""
        delivery_id = getattr(self.__class__, 'test_delivery_id', None)
        if not delivery_id:
            pytest.skip("No test delivery created")
        
        response = requests.get(f"{BASE_URL}/api/gunny-bags?kms_year=2025-2026")
        assert response.status_code == 200
        bags = response.json()
        
        # Find the auto-created bags entry
        auto_bags = [b for b in bags if b.get("reference", "").startswith(f"delivery:{delivery_id[:8]}")]
        assert len(auto_bags) >= 1, "Bags auto-entry not created"
        assert auto_bags[0]["quantity"] == 50
        assert auto_bags[0]["txn_type"] == "out"
        assert auto_bags[0]["bag_type"] == "new"  # Govt bags


class TestDCDeliveryInvoice:
    """Tests for DC Delivery Invoice HTML generation"""
    
    def test_get_delivery_invoice_html(self):
        """GET /api/dc-deliveries/invoice/{id} - returns HTML invoice"""
        # First get an existing delivery (from the context - id: f209f83e-de0c-4abf-9138-bbff4520898f)
        delivery_id = "f209f83e-de0c-4abf-9138-bbff4520898f"
        
        response = requests.get(f"{BASE_URL}/api/dc-deliveries/invoice/{delivery_id}")
        # It might not exist, so check for 200 or 404
        if response.status_code == 404:
            # Create a delivery first
            dc_response = requests.get(f"{BASE_URL}/api/dc-entries?kms_year=2025-2026")
            if dc_response.status_code == 200 and len(dc_response.json()) > 0:
                dc_id = dc_response.json()[0]["id"]
                del_data = {
                    "dc_id": dc_id,
                    "date": "2025-01-17",
                    "quantity_qntl": 10,
                    "vehicle_no": "TEST123",
                    "invoice_no": "TEST_INV_002",
                    "kms_year": "2025-2026",
                    "season": "Kharif"
                }
                del_response = requests.post(f"{BASE_URL}/api/dc-deliveries?username=test", json=del_data)
                assert del_response.status_code == 200
                delivery_id = del_response.json()["id"]
                
                # Now get invoice
                inv_response = requests.get(f"{BASE_URL}/api/dc-deliveries/invoice/{delivery_id}")
                assert inv_response.status_code == 200
                assert "text/html" in inv_response.headers.get("content-type", "")
                assert "Delivery Challan" in inv_response.text
                
                # Cleanup
                requests.delete(f"{BASE_URL}/api/dc-deliveries/{delivery_id}")
        else:
            assert response.status_code == 200
            assert "text/html" in response.headers.get("content-type", "")
            assert "Delivery Challan" in response.text
    
    def test_invoice_not_found(self):
        """GET /api/dc-deliveries/invoice/{id} with invalid id returns 404"""
        response = requests.get(f"{BASE_URL}/api/dc-deliveries/invoice/nonexistent-id-12345")
        assert response.status_code == 404


class TestDCDeliveryDelete:
    """Tests for DC Delivery delete with auto-entry cleanup"""
    
    def test_delete_delivery_cleans_up_auto_entries(self):
        """DELETE /api/dc-deliveries/{id} should clean up all auto-created entries"""
        # Create a DC
        dc_data = {
            "dc_number": f"TEST_DC_DEL_{uuid.uuid4().hex[:6]}",
            "date": "2025-01-15",
            "quantity_qntl": 50,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        dc_response = requests.post(f"{BASE_URL}/api/dc-entries?username=test", json=dc_data)
        assert dc_response.status_code == 200
        dc_id = dc_response.json()["id"]
        
        # Create a delivery with all auto-entries
        delivery_data = {
            "dc_id": dc_id,
            "date": "2025-01-16",
            "quantity_qntl": 20,
            "vehicle_no": "TEST_DEL_001",
            "invoice_no": "TEST_DEL_INV",
            "rst_no": "TEST_DEL_RST",
            "bags_used": 25,
            "cash_paid": 1500,
            "diesel_paid": 1000,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        del_response = requests.post(f"{BASE_URL}/api/dc-deliveries?username=test", json=delivery_data)
        assert del_response.status_code == 200
        delivery_id = del_response.json()["id"]
        
        # Verify auto-entries were created
        cash_response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        cash_txns = cash_response.json()
        cash_count_before = len([t for t in cash_txns if f"delivery:{delivery_id[:8]}" in t.get("reference", "") or f"delivery_diesel:{delivery_id[:8]}" in t.get("reference", "")])
        assert cash_count_before >= 2, "Auto cash entries should exist before delete"
        
        # Delete the delivery
        delete_response = requests.delete(f"{BASE_URL}/api/dc-deliveries/{delivery_id}")
        assert delete_response.status_code == 200
        
        # Verify auto-entries are cleaned up
        cash_response_after = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        cash_txns_after = cash_response_after.json()
        cash_count_after = len([t for t in cash_txns_after if f"delivery:{delivery_id[:8]}" in t.get("reference", "") or f"delivery_diesel:{delivery_id[:8]}" in t.get("reference", "")])
        assert cash_count_after == 0, "Auto cash entries should be deleted"
        
        # Cleanup DC
        requests.delete(f"{BASE_URL}/api/dc-entries/{dc_id}")


class TestGSTLedger:
    """Tests for GST Ledger API"""
    
    def test_get_gst_ledger(self):
        """GET /api/gst-ledger - returns ledger with entries and summary"""
        response = requests.get(f"{BASE_URL}/api/gst-ledger?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "opening_balance" in data
        assert "entries" in data
        assert "summary" in data
        assert "total_entries" in data
        
        # Verify opening_balance structure
        ob = data["opening_balance"]
        assert "igst" in ob
        assert "sgst" in ob
        assert "cgst" in ob
        
        # Verify summary structure
        summary = data["summary"]
        assert "credit" in summary
        assert "debit" in summary
        assert "balance" in summary
        
        # Verify balance has all GST types
        assert "cgst" in summary["balance"]
        assert "sgst" in summary["balance"]
        assert "igst" in summary["balance"]
    
    def test_get_gst_opening_balance(self):
        """GET /api/gst-ledger/opening-balance - returns opening balance for KMS year"""
        response = requests.get(f"{BASE_URL}/api/gst-ledger/opening-balance?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        assert "igst" in data
        assert "sgst" in data
        assert "cgst" in data
        assert "kms_year" in data
        assert data["kms_year"] == "2025-2026"
    
    def test_set_gst_opening_balance(self):
        """PUT /api/gst-ledger/opening-balance - saves IGST/SGST/CGST opening balance"""
        ob_data = {
            "kms_year": "2025-2026",
            "igst": 1000,
            "sgst": 6000,
            "cgst": 6000
        }
        response = requests.put(f"{BASE_URL}/api/gst-ledger/opening-balance", json=ob_data)
        assert response.status_code == 200
        data = response.json()
        
        assert data["igst"] == 1000
        assert data["sgst"] == 6000
        assert data["cgst"] == 6000
        
        # Verify by GET
        get_response = requests.get(f"{BASE_URL}/api/gst-ledger/opening-balance?kms_year=2025-2026")
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["igst"] == 1000
        assert get_data["sgst"] == 6000
        assert get_data["cgst"] == 6000
    
    def test_set_gst_opening_balance_without_kms_year(self):
        """PUT /api/gst-ledger/opening-balance without kms_year returns 400"""
        ob_data = {
            "igst": 1000,
            "sgst": 2000,
            "cgst": 2000
        }
        response = requests.put(f"{BASE_URL}/api/gst-ledger/opening-balance", json=ob_data)
        assert response.status_code == 400


class TestGovtBagsStock:
    """Tests for Govt Bags Stock endpoint"""
    
    def test_get_govt_bags_stock(self):
        """GET /api/govt-bags/stock - returns bags in/out/stock"""
        response = requests.get(f"{BASE_URL}/api/govt-bags/stock?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        assert "bags_in" in data
        assert "bags_out" in data
        assert "stock" in data
        
        # Verify stock calculation
        assert data["stock"] == data["bags_in"] - data["bags_out"]


class TestDCDeliveriesGet:
    """Tests for GET DC Deliveries to verify new fields are returned"""
    
    def test_get_deliveries_returns_new_fields(self):
        """GET /api/dc-deliveries - returns invoice_no, rst_no, bags_used, cash_paid, diesel_paid"""
        response = requests.get(f"{BASE_URL}/api/dc-deliveries?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        # If there are deliveries, check the structure
        if len(data) > 0:
            d = data[0]
            # These fields should exist in the response (might be empty/null)
            assert "invoice_no" in d or d.get("invoice_no") is not None or "invoice_no" in str(d.keys())
            assert "rst_no" in d or d.get("rst_no") is not None
            assert "bags_used" in d or d.get("bags_used") is not None
            assert "cash_paid" in d or d.get("cash_paid") is not None
            assert "diesel_paid" in d or d.get("diesel_paid") is not None


# Run cleanup after all tests
@pytest.fixture(scope="session", autouse=True)
def cleanup_test_data():
    yield
    # Cleanup any TEST_ prefixed data
    try:
        dcs = requests.get(f"{BASE_URL}/api/dc-entries?kms_year=2025-2026").json()
        for dc in dcs:
            if dc.get("dc_number", "").startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/dc-entries/{dc['id']}")
    except:
        pass
