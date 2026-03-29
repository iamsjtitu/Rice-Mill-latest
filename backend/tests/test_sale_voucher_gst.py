"""
Test Sale Voucher with Per-Item GST Fields
Tests: CGST+SGST, IGST, No GST, buyer_gstin/buyer_address, PDF, Update, Delete
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestSaleVoucherGST:
    """Sale Voucher with per-item GST tests"""
    
    created_ids = []
    
    def test_create_sale_voucher_cgst_sgst(self, api_client):
        """Test creating sale voucher with CGST+SGST (intra-state)"""
        payload = {
            "date": "2026-01-15",
            "party_name": f"TEST_CGST_Party_{uuid.uuid4().hex[:6]}",
            "invoice_no": "TEST-CGST-001",
            "buyer_gstin": "21AAAAA0000A1Z5",
            "buyer_address": "Test Address, Bihar",
            "items": [
                {"item_name": "Rice (Usna)", "quantity": 100, "rate": 2500, "unit": "Qntl", "hsn_code": "1006 30 20", "gst_percent": 5}
            ],
            "gst_type": "cgst_sgst",
            "truck_no": "BR01AB1234",
            "cash_paid": 1000,
            "diesel_paid": 500,
            "advance": 5000,
            "kms_year": "2025-26",
            "season": "Kharif"
        }
        
        response = api_client.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        self.created_ids.append(data["id"])
        
        # Verify per-item GST fields
        assert len(data["items"]) == 1
        item = data["items"][0]
        assert item["hsn_code"] == "1006 30 20", "HSN code not saved"
        assert item["gst_percent"] == 5.0, "GST percent not saved"
        assert item["amount"] == 250000.0, "Item amount incorrect"
        assert item["gst_amount"] == 12500.0, "Item GST amount incorrect (5% of 250000)"
        
        # Verify CGST/SGST split (50/50)
        assert data["subtotal"] == 250000.0
        assert data["cgst_amount"] == 6250.0, "CGST should be 50% of total GST"
        assert data["sgst_amount"] == 6250.0, "SGST should be 50% of total GST"
        assert data["igst_amount"] == 0.0, "IGST should be 0 for CGST+SGST"
        assert data["total"] == 262500.0, "Total = subtotal + CGST + SGST"
        
        # Verify buyer fields
        assert data["buyer_gstin"] == "21AAAAA0000A1Z5"
        assert data["buyer_address"] == "Test Address, Bihar"
        
        # Verify deduction fields still work
        assert data["cash_paid"] == 1000.0
        assert data["diesel_paid"] == 500.0
        assert data["advance"] == 5000.0
        
        print(f"PASS: CGST+SGST voucher created with ID {data['id']}")
    
    def test_create_sale_voucher_igst(self, api_client):
        """Test creating sale voucher with IGST (inter-state)"""
        payload = {
            "date": "2026-01-16",
            "party_name": f"TEST_IGST_Party_{uuid.uuid4().hex[:6]}",
            "invoice_no": "TEST-IGST-001",
            "buyer_gstin": "27BBBBB0000B2Z6",
            "buyer_address": "Test Address, Maharashtra",
            "items": [
                {"item_name": "Rice (Raw)", "quantity": 50, "rate": 2000, "unit": "Qntl", "hsn_code": "1006 30 10", "gst_percent": 5}
            ],
            "gst_type": "igst",
            "truck_no": "MH01CD5678",
            "kms_year": "2025-26",
            "season": "Kharif"
        }
        
        response = api_client.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        self.created_ids.append(data["id"])
        
        # Verify IGST calculation
        item = data["items"][0]
        assert item["gst_amount"] == 5000.0, "Item GST amount incorrect (5% of 100000)"
        
        assert data["cgst_amount"] == 0.0, "CGST should be 0 for IGST"
        assert data["sgst_amount"] == 0.0, "SGST should be 0 for IGST"
        assert data["igst_amount"] == 5000.0, "IGST should be full GST amount"
        assert data["total"] == 105000.0, "Total = subtotal + IGST"
        
        print(f"PASS: IGST voucher created with ID {data['id']}")
    
    def test_create_sale_voucher_no_gst(self, api_client):
        """Test creating sale voucher without GST"""
        payload = {
            "date": "2026-01-17",
            "party_name": f"TEST_NoGST_Party_{uuid.uuid4().hex[:6]}",
            "invoice_no": "TEST-NOGST-001",
            "items": [
                {"item_name": "Bran", "quantity": 20, "rate": 1500, "unit": "Qntl", "hsn_code": "2302 40 00", "gst_percent": 5}
            ],
            "gst_type": "none",
            "truck_no": "BR02EF9012",
            "kms_year": "2025-26",
            "season": "Kharif"
        }
        
        response = api_client.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        self.created_ids.append(data["id"])
        
        # Verify no GST calculated even though gst_percent is set
        item = data["items"][0]
        assert item["gst_amount"] == 0, "GST amount should be 0 when gst_type=none"
        
        assert data["cgst_amount"] == 0.0
        assert data["sgst_amount"] == 0.0
        assert data["igst_amount"] == 0.0
        assert data["total"] == 30000.0, "Total = subtotal (no GST)"
        
        # Verify buyer fields are empty when no GST
        assert data["buyer_gstin"] == ""
        assert data["buyer_address"] == ""
        
        print(f"PASS: No GST voucher created with ID {data['id']}")
    
    def test_create_sale_voucher_multiple_items_gst(self, api_client):
        """Test sale voucher with multiple items having different GST rates"""
        payload = {
            "date": "2026-01-18",
            "party_name": f"TEST_MultiItem_{uuid.uuid4().hex[:6]}",
            "invoice_no": "TEST-MULTI-001",
            "buyer_gstin": "21CCCCC0000C3Z7",
            "buyer_address": "Multi Item Address",
            "items": [
                {"item_name": "Rice (Usna)", "quantity": 100, "rate": 2500, "unit": "Qntl", "hsn_code": "1006 30 20", "gst_percent": 5},
                {"item_name": "Broken", "quantity": 50, "rate": 1800, "unit": "Qntl", "hsn_code": "1006 40 00", "gst_percent": 5}
            ],
            "gst_type": "cgst_sgst",
            "kms_year": "2025-26",
            "season": "Kharif"
        }
        
        response = api_client.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        self.created_ids.append(data["id"])
        
        # Verify each item has correct GST
        assert len(data["items"]) == 2
        
        # Item 1: 100 * 2500 = 250000, GST = 12500
        assert data["items"][0]["amount"] == 250000.0
        assert data["items"][0]["gst_amount"] == 12500.0
        
        # Item 2: 50 * 1800 = 90000, GST = 4500
        assert data["items"][1]["amount"] == 90000.0
        assert data["items"][1]["gst_amount"] == 4500.0
        
        # Total GST = 12500 + 4500 = 17000, split 50/50
        assert data["subtotal"] == 340000.0
        assert data["cgst_amount"] == 8500.0
        assert data["sgst_amount"] == 8500.0
        assert data["total"] == 357000.0
        
        print(f"PASS: Multi-item GST voucher created with ID {data['id']}")
    
    def test_update_sale_voucher_recalculates_gst(self, api_client):
        """Test that updating a sale voucher recalculates per-item GST"""
        # First create a voucher
        payload = {
            "date": "2026-01-19",
            "party_name": f"TEST_Update_{uuid.uuid4().hex[:6]}",
            "invoice_no": "TEST-UPD-001",
            "buyer_gstin": "21DDDDD0000D4Z8",
            "buyer_address": "Original Address",
            "items": [
                {"item_name": "Rice (Usna)", "quantity": 100, "rate": 2500, "unit": "Qntl", "hsn_code": "1006 30 20", "gst_percent": 5}
            ],
            "gst_type": "cgst_sgst",
            "kms_year": "2025-26",
            "season": "Kharif"
        }
        
        create_resp = api_client.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=payload)
        assert create_resp.status_code == 200
        voucher_id = create_resp.json()["id"]
        self.created_ids.append(voucher_id)
        
        # Update with new rate and additional item
        update_payload = {
            "date": "2026-01-19",
            "party_name": payload["party_name"],
            "invoice_no": "TEST-UPD-001-UPDATED",
            "buyer_gstin": "21DDDDD0000D4Z8",
            "buyer_address": "Updated Address",
            "items": [
                {"item_name": "Rice (Usna)", "quantity": 100, "rate": 2600, "unit": "Qntl", "hsn_code": "1006 30 20", "gst_percent": 5},
                {"item_name": "Broken", "quantity": 10, "rate": 1800, "unit": "Qntl", "hsn_code": "1006 40 00", "gst_percent": 5}
            ],
            "gst_type": "cgst_sgst",
            "kms_year": "2025-26",
            "season": "Kharif"
        }
        
        update_resp = api_client.put(f"{BASE_URL}/api/sale-book/{voucher_id}?username=admin&role=admin", json=update_payload)
        assert update_resp.status_code == 200
        
        data = update_resp.json()
        
        # Verify recalculated values
        # Item 1: 100 * 2600 = 260000, GST = 13000
        assert data["items"][0]["amount"] == 260000.0
        assert data["items"][0]["gst_amount"] == 13000.0
        
        # Item 2: 10 * 1800 = 18000, GST = 900
        assert data["items"][1]["amount"] == 18000.0
        assert data["items"][1]["gst_amount"] == 900.0
        
        # Total GST = 13000 + 900 = 13900, split 50/50
        assert data["subtotal"] == 278000.0
        assert data["cgst_amount"] == 6950.0
        assert data["sgst_amount"] == 6950.0
        assert data["total"] == 291900.0
        
        # Verify updated fields
        assert data["invoice_no"] == "TEST-UPD-001-UPDATED"
        assert data["buyer_address"] == "Updated Address"
        
        print(f"PASS: Sale voucher updated with recalculated GST")
    
    def test_sale_voucher_pdf_generation(self, api_client):
        """Test PDF generation for GST sale voucher"""
        # Create a voucher first
        payload = {
            "date": "2026-01-20",
            "party_name": f"TEST_PDF_{uuid.uuid4().hex[:6]}",
            "invoice_no": "TEST-PDF-001",
            "buyer_gstin": "21EEEEE0000E5Z9",
            "buyer_address": "PDF Test Address",
            "items": [
                {"item_name": "Rice (Usna)", "quantity": 50, "rate": 2500, "unit": "Qntl", "hsn_code": "1006 30 20", "gst_percent": 5}
            ],
            "gst_type": "cgst_sgst",
            "kms_year": "2025-26",
            "season": "Kharif"
        }
        
        create_resp = api_client.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=payload)
        assert create_resp.status_code == 200
        voucher_id = create_resp.json()["id"]
        self.created_ids.append(voucher_id)
        
        # Test PDF endpoint
        pdf_resp = api_client.get(f"{BASE_URL}/api/sale-book/{voucher_id}/pdf")
        assert pdf_resp.status_code == 200, f"PDF generation failed: {pdf_resp.status_code}"
        
        # Verify it's a PDF (starts with %PDF)
        assert pdf_resp.content[:4] == b'%PDF', "Response is not a valid PDF"
        assert len(pdf_resp.content) > 1000, "PDF seems too small"
        
        print(f"PASS: PDF generated successfully ({len(pdf_resp.content)} bytes)")
    
    def test_delete_sale_voucher(self, api_client):
        """Test deleting a sale voucher"""
        # Create a voucher to delete
        payload = {
            "date": "2026-01-21",
            "party_name": f"TEST_Delete_{uuid.uuid4().hex[:6]}",
            "invoice_no": "TEST-DEL-001",
            "items": [
                {"item_name": "Bran", "quantity": 10, "rate": 1500, "unit": "Qntl", "hsn_code": "2302 40 00", "gst_percent": 5}
            ],
            "gst_type": "none",
            "kms_year": "2025-26",
            "season": "Kharif"
        }
        
        create_resp = api_client.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=payload)
        assert create_resp.status_code == 200
        voucher_id = create_resp.json()["id"]
        
        # Delete the voucher
        delete_resp = api_client.delete(f"{BASE_URL}/api/sale-book/{voucher_id}?username=admin&role=admin")
        assert delete_resp.status_code == 200
        
        data = delete_resp.json()
        assert data["message"] == "Sale voucher deleted"
        assert data["id"] == voucher_id
        
        # Verify it's actually deleted (should return 404 or empty)
        get_resp = api_client.get(f"{BASE_URL}/api/sale-book?kms_year=2025-26&season=Kharif")
        vouchers = get_resp.json()
        assert not any(v["id"] == voucher_id for v in vouchers), "Voucher still exists after delete"
        
        print(f"PASS: Sale voucher deleted successfully")
    
    def test_gst_invoice_routes_removed(self, api_client):
        """Test that standalone GST Invoice routes return 404"""
        # GET /api/gst-invoices should return 404
        get_resp = api_client.get(f"{BASE_URL}/api/gst-invoices")
        assert get_resp.status_code == 404, f"Expected 404, got {get_resp.status_code}"
        
        # POST /api/gst-invoices should return 404
        post_resp = api_client.post(f"{BASE_URL}/api/gst-invoices", json={})
        assert post_resp.status_code == 404, f"Expected 404, got {post_resp.status_code}"
        
        print("PASS: GST Invoice routes correctly return 404 (removed)")
    
    def test_deduction_fields_still_work(self, api_client):
        """Test that Cash Truck ko, Diesel Pump se, Advance Party se mila fields still work"""
        payload = {
            "date": "2026-01-22",
            "party_name": f"TEST_Deductions_{uuid.uuid4().hex[:6]}",
            "invoice_no": "TEST-DED-001",
            "items": [
                {"item_name": "Rice (Usna)", "quantity": 100, "rate": 2500, "unit": "Qntl", "hsn_code": "1006 30 20", "gst_percent": 5}
            ],
            "gst_type": "cgst_sgst",
            "truck_no": "BR01XY9999",
            "cash_paid": 5000,      # Cash Truck ko
            "diesel_paid": 3000,    # Diesel Pump se
            "advance": 10000,       # Advance Party se mila
            "kms_year": "2025-26",
            "season": "Kharif"
        }
        
        response = api_client.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        self.created_ids.append(data["id"])
        
        # Verify all deduction fields
        assert data["cash_paid"] == 5000.0, "Cash paid not saved"
        assert data["diesel_paid"] == 3000.0, "Diesel paid not saved"
        assert data["advance"] == 10000.0, "Advance not saved"
        assert data["truck_no"] == "BR01XY9999", "Truck no not saved"
        
        # Verify balance calculation
        # Total = 250000 + 12500 = 262500
        # Paid = advance = 10000
        # Balance = 262500 - 10000 = 252500
        assert data["paid_amount"] == 10000.0
        assert data["balance"] == 252500.0
        
        print("PASS: All deduction fields (Cash, Diesel, Advance) working correctly")
    
    @pytest.fixture(autouse=True, scope="class")
    def cleanup(self, request, api_client):
        """Cleanup test data after all tests in class complete"""
        yield
        # Cleanup all created vouchers
        for voucher_id in self.created_ids:
            try:
                api_client.delete(f"{BASE_URL}/api/sale-book/{voucher_id}?username=admin&role=admin")
            except:
                pass
        print(f"Cleaned up {len(self.created_ids)} test vouchers")
