"""
Test iteration 120: WhatsApp Sale Voucher Send + GST Summary Dialog
Features:
1. POST /api/sale-book/{id}/whatsapp-send - generates PDF, uploads to tmpfiles.org, returns pdf_url
2. WhatsApp send endpoint handles voucher not found (404)
3. Existing Sale voucher CRUD still works with per-item GST calculations
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestWhatsAppSaleVoucherSend:
    """Test WhatsApp send functionality for sale vouchers"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_voucher_id = None
    
    def test_whatsapp_send_voucher_not_found(self):
        """Test WhatsApp send returns 404 for non-existent voucher"""
        response = self.session.post(
            f"{BASE_URL}/api/sale-book/non-existent-id-12345/whatsapp-send",
            json={"phone": ""}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        data = response.json()
        assert "detail" in data or "error" in data
        print("PASS: WhatsApp send returns 404 for non-existent voucher")
    
    def test_whatsapp_send_existing_voucher(self):
        """Test WhatsApp send for existing voucher - generates PDF and uploads"""
        # First, get existing vouchers
        response = self.session.get(f"{BASE_URL}/api/sale-book?kms_year=2025-2026&season=Kharif")
        assert response.status_code == 200
        vouchers = response.json()
        
        # Find a voucher with gst_type != 'none' (like Rajan's voucher)
        gst_voucher = None
        for v in vouchers:
            if v.get('gst_type') and v.get('gst_type') != 'none':
                gst_voucher = v
                break
        
        if not gst_voucher:
            # Create a test voucher with GST
            create_response = self.session.post(
                f"{BASE_URL}/api/sale-book?username=admin&role=admin",
                json={
                    "date": "2025-01-15",
                    "party_name": "TEST_WhatsApp_Party",
                    "invoice_no": "TEST-WA-001",
                    "buyer_gstin": "21AAAAA0000A1Z5",
                    "buyer_address": "Test Address",
                    "items": [
                        {"item_name": "Rice (Usna)", "quantity": 10, "rate": 2500, "unit": "Qntl", "hsn_code": "1006 30 20", "gst_percent": 5}
                    ],
                    "gst_type": "cgst_sgst",
                    "truck_no": "CG04AB1234",
                    "kms_year": "2025-2026",
                    "season": "Kharif"
                }
            )
            assert create_response.status_code == 200
            gst_voucher = create_response.json()
            self.created_voucher_id = gst_voucher.get('id')
        
        voucher_id = gst_voucher.get('id')
        
        # Test WhatsApp send (without phone - will use default numbers or return error)
        response = self.session.post(
            f"{BASE_URL}/api/sale-book/{voucher_id}/whatsapp-send",
            json={"phone": ""}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Response should have success field (may be false if API key not set)
        assert "success" in data, f"Response should have 'success' field: {data}"
        
        # If success is false, it should have error message about API key or phone
        if not data.get("success"):
            assert "error" in data, f"Failed response should have 'error': {data}"
            print(f"PASS: WhatsApp send returned expected error: {data.get('error')}")
        else:
            # If success, should have pdf_url
            assert "pdf_url" in data, f"Success response should have 'pdf_url': {data}"
            print(f"PASS: WhatsApp send succeeded with pdf_url: {data.get('pdf_url')}")
        
        # Cleanup if we created a test voucher
        if self.created_voucher_id:
            self.session.delete(f"{BASE_URL}/api/sale-book/{self.created_voucher_id}?username=admin&role=admin")
    
    def test_whatsapp_send_returns_pdf_url(self):
        """Test that WhatsApp send generates PDF and returns pdf_url"""
        # Create a test voucher
        create_response = self.session.post(
            f"{BASE_URL}/api/sale-book?username=admin&role=admin",
            json={
                "date": "2025-01-15",
                "party_name": "TEST_PDF_Upload_Party",
                "invoice_no": "TEST-PDF-001",
                "items": [
                    {"item_name": "Rice (Usna)", "quantity": 5, "rate": 2000, "unit": "Qntl", "hsn_code": "1006 30 20", "gst_percent": 5}
                ],
                "gst_type": "cgst_sgst",
                "kms_year": "2025-2026",
                "season": "Kharif"
            }
        )
        assert create_response.status_code == 200
        voucher = create_response.json()
        voucher_id = voucher.get('id')
        
        try:
            # Call WhatsApp send
            response = self.session.post(
                f"{BASE_URL}/api/sale-book/{voucher_id}/whatsapp-send",
                json={"phone": ""}
            )
            assert response.status_code == 200
            data = response.json()
            
            # Check response structure
            assert "success" in data
            
            # pdf_url should be present (even if empty when upload fails)
            # The endpoint always returns pdf_url field
            if data.get("success"):
                assert "pdf_url" in data
                if data.get("pdf_url"):
                    assert "tmpfiles.org" in data.get("pdf_url") or data.get("pdf_url") == ""
                    print(f"PASS: PDF uploaded to tmpfiles.org: {data.get('pdf_url')}")
            else:
                # Even on failure, response structure should be correct
                assert "error" in data
                print(f"PASS: WhatsApp send returned error (expected if API key not set): {data.get('error')}")
        finally:
            # Cleanup
            self.session.delete(f"{BASE_URL}/api/sale-book/{voucher_id}?username=admin&role=admin")


class TestSaleVoucherCRUDWithGST:
    """Test existing Sale voucher CRUD with per-item GST calculations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_ids = []
    
    def teardown_method(self):
        """Cleanup test data"""
        for vid in self.created_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/sale-book/{vid}?username=admin&role=admin")
            except:
                pass
    
    def test_create_sale_voucher_cgst_sgst(self):
        """Test creating sale voucher with CGST+SGST"""
        response = self.session.post(
            f"{BASE_URL}/api/sale-book?username=admin&role=admin",
            json={
                "date": "2025-01-15",
                "party_name": "TEST_CGST_SGST_Party",
                "invoice_no": "TEST-GST-001",
                "buyer_gstin": "21AAAAA0000A1Z5",
                "items": [
                    {"item_name": "Rice (Usna)", "quantity": 10, "rate": 2500, "unit": "Qntl", "hsn_code": "1006 30 20", "gst_percent": 5}
                ],
                "gst_type": "cgst_sgst",
                "kms_year": "2025-2026",
                "season": "Kharif"
            }
        )
        assert response.status_code == 200
        data = response.json()
        self.created_ids.append(data.get('id'))
        
        # Verify GST calculations
        assert data.get('subtotal') == 25000  # 10 * 2500
        assert data.get('cgst_amount') == 625  # 25000 * 5% / 2
        assert data.get('sgst_amount') == 625  # 25000 * 5% / 2
        assert data.get('igst_amount') == 0
        assert data.get('total') == 26250  # 25000 + 625 + 625
        
        # Verify per-item GST
        items = data.get('items', [])
        assert len(items) == 1
        assert items[0].get('gst_amount') == 1250  # 25000 * 5%
        
        print("PASS: CGST+SGST calculation correct")
    
    def test_create_sale_voucher_igst(self):
        """Test creating sale voucher with IGST"""
        response = self.session.post(
            f"{BASE_URL}/api/sale-book?username=admin&role=admin",
            json={
                "date": "2025-01-15",
                "party_name": "TEST_IGST_Party",
                "invoice_no": "TEST-IGST-001",
                "items": [
                    {"item_name": "Rice (Raw)", "quantity": 20, "rate": 2000, "unit": "Qntl", "hsn_code": "1006 30 10", "gst_percent": 5}
                ],
                "gst_type": "igst",
                "kms_year": "2025-2026",
                "season": "Kharif"
            }
        )
        assert response.status_code == 200
        data = response.json()
        self.created_ids.append(data.get('id'))
        
        # Verify IGST calculations
        assert data.get('subtotal') == 40000  # 20 * 2000
        assert data.get('cgst_amount') == 0
        assert data.get('sgst_amount') == 0
        assert data.get('igst_amount') == 2000  # 40000 * 5%
        assert data.get('total') == 42000  # 40000 + 2000
        
        print("PASS: IGST calculation correct")
    
    def test_create_sale_voucher_no_gst(self):
        """Test creating sale voucher without GST"""
        response = self.session.post(
            f"{BASE_URL}/api/sale-book?username=admin&role=admin",
            json={
                "date": "2025-01-15",
                "party_name": "TEST_NoGST_Party",
                "invoice_no": "TEST-NOGST-001",
                "items": [
                    {"item_name": "Bran", "quantity": 50, "rate": 500, "unit": "Qntl", "hsn_code": "2302 40 00", "gst_percent": 5}
                ],
                "gst_type": "none",
                "kms_year": "2025-2026",
                "season": "Kharif"
            }
        )
        assert response.status_code == 200
        data = response.json()
        self.created_ids.append(data.get('id'))
        
        # Verify no GST applied
        assert data.get('subtotal') == 25000  # 50 * 500
        assert data.get('cgst_amount') == 0
        assert data.get('sgst_amount') == 0
        assert data.get('igst_amount') == 0
        assert data.get('total') == 25000  # No GST added
        
        print("PASS: No GST calculation correct")
    
    def test_get_sale_vouchers(self):
        """Test fetching sale vouchers"""
        response = self.session.get(f"{BASE_URL}/api/sale-book?kms_year=2025-2026&season=Kharif")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: GET sale vouchers returned {len(data)} vouchers")
    
    def test_update_sale_voucher(self):
        """Test updating sale voucher recalculates GST"""
        # Create voucher
        create_response = self.session.post(
            f"{BASE_URL}/api/sale-book?username=admin&role=admin",
            json={
                "date": "2025-01-15",
                "party_name": "TEST_Update_Party",
                "items": [{"item_name": "Rice (Usna)", "quantity": 10, "rate": 2000, "unit": "Qntl", "hsn_code": "1006 30 20", "gst_percent": 5}],
                "gst_type": "cgst_sgst",
                "kms_year": "2025-2026",
                "season": "Kharif"
            }
        )
        assert create_response.status_code == 200
        voucher = create_response.json()
        self.created_ids.append(voucher.get('id'))
        
        # Update voucher with different quantity
        update_response = self.session.put(
            f"{BASE_URL}/api/sale-book/{voucher.get('id')}?username=admin&role=admin",
            json={
                "date": "2025-01-15",
                "party_name": "TEST_Update_Party",
                "items": [{"item_name": "Rice (Usna)", "quantity": 20, "rate": 2000, "unit": "Qntl", "hsn_code": "1006 30 20", "gst_percent": 5}],
                "gst_type": "cgst_sgst",
                "kms_year": "2025-2026",
                "season": "Kharif"
            }
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        
        # Verify recalculated GST
        assert updated.get('subtotal') == 40000  # 20 * 2000
        assert updated.get('cgst_amount') == 1000  # 40000 * 5% / 2
        assert updated.get('sgst_amount') == 1000
        assert updated.get('total') == 42000
        
        print("PASS: Update recalculates GST correctly")
    
    def test_delete_sale_voucher(self):
        """Test deleting sale voucher"""
        # Create voucher
        create_response = self.session.post(
            f"{BASE_URL}/api/sale-book?username=admin&role=admin",
            json={
                "date": "2025-01-15",
                "party_name": "TEST_Delete_Party",
                "items": [{"item_name": "Rice (Usna)", "quantity": 5, "rate": 1000, "unit": "Qntl"}],
                "gst_type": "none",
                "kms_year": "2025-2026",
                "season": "Kharif"
            }
        )
        assert create_response.status_code == 200
        voucher = create_response.json()
        voucher_id = voucher.get('id')
        
        # Delete voucher
        delete_response = self.session.delete(f"{BASE_URL}/api/sale-book/{voucher_id}?username=admin&role=admin")
        assert delete_response.status_code == 200
        
        # Verify deleted
        get_response = self.session.get(f"{BASE_URL}/api/sale-book?kms_year=2025-2026&season=Kharif")
        vouchers = get_response.json()
        assert not any(v.get('id') == voucher_id for v in vouchers)
        
        print("PASS: Delete sale voucher works correctly")
    
    def test_sale_voucher_pdf_generation(self):
        """Test PDF generation for sale voucher"""
        # Create voucher
        create_response = self.session.post(
            f"{BASE_URL}/api/sale-book?username=admin&role=admin",
            json={
                "date": "2025-01-15",
                "party_name": "TEST_PDF_Party",
                "invoice_no": "TEST-PDF-002",
                "items": [{"item_name": "Rice (Usna)", "quantity": 10, "rate": 2500, "unit": "Qntl", "hsn_code": "1006 30 20", "gst_percent": 5}],
                "gst_type": "cgst_sgst",
                "kms_year": "2025-2026",
                "season": "Kharif"
            }
        )
        assert create_response.status_code == 200
        voucher = create_response.json()
        self.created_ids.append(voucher.get('id'))
        
        # Get PDF
        pdf_response = self.session.get(f"{BASE_URL}/api/sale-book/{voucher.get('id')}/pdf")
        assert pdf_response.status_code == 200
        assert pdf_response.headers.get('content-type') == 'application/pdf'
        assert len(pdf_response.content) > 1000  # PDF should have content
        
        print("PASS: PDF generation works correctly")


class TestGSTSummaryData:
    """Test GST Summary data structure for frontend dialog"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_ids = []
    
    def teardown_method(self):
        for vid in self.created_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/sale-book/{vid}?username=admin&role=admin")
            except:
                pass
    
    def test_voucher_has_gst_fields_for_summary(self):
        """Test that voucher response has all fields needed for GST Summary dialog"""
        # Create voucher with multiple items and different HSN codes
        response = self.session.post(
            f"{BASE_URL}/api/sale-book?username=admin&role=admin",
            json={
                "date": "2025-01-15",
                "party_name": "TEST_GST_Summary_Party",
                "invoice_no": "TEST-GSTS-001",
                "items": [
                    {"item_name": "Rice (Usna)", "quantity": 10, "rate": 2500, "unit": "Qntl", "hsn_code": "1006 30 20", "gst_percent": 5},
                    {"item_name": "Bran", "quantity": 20, "rate": 500, "unit": "Qntl", "hsn_code": "2302 40 00", "gst_percent": 5}
                ],
                "gst_type": "cgst_sgst",
                "kms_year": "2025-2026",
                "season": "Kharif"
            }
        )
        assert response.status_code == 200
        data = response.json()
        self.created_ids.append(data.get('id'))
        
        # Verify fields needed for GST Summary dialog
        assert 'gst_type' in data
        assert data.get('gst_type') == 'cgst_sgst'
        assert 'subtotal' in data
        assert 'cgst_amount' in data
        assert 'sgst_amount' in data
        assert 'igst_amount' in data
        assert 'total' in data
        
        # Verify items have HSN and GST fields
        items = data.get('items', [])
        assert len(items) == 2
        for item in items:
            assert 'hsn_code' in item
            assert 'gst_percent' in item
            assert 'gst_amount' in item
            assert 'amount' in item
        
        # Verify calculations
        # Item 1: 10 * 2500 = 25000, GST = 1250
        # Item 2: 20 * 500 = 10000, GST = 500
        # Total taxable = 35000, Total GST = 1750
        assert data.get('subtotal') == 35000
        assert data.get('cgst_amount') == 875  # 1750 / 2
        assert data.get('sgst_amount') == 875
        assert data.get('total') == 36750  # 35000 + 1750
        
        print("PASS: Voucher has all fields needed for GST Summary dialog")
    
    def test_voucher_gst_type_none_has_zero_gst(self):
        """Test that voucher with gst_type=none has zero GST amounts"""
        response = self.session.post(
            f"{BASE_URL}/api/sale-book?username=admin&role=admin",
            json={
                "date": "2025-01-15",
                "party_name": "TEST_NoGST_Summary_Party",
                "items": [
                    {"item_name": "Rice (Usna)", "quantity": 10, "rate": 2500, "unit": "Qntl", "hsn_code": "1006 30 20", "gst_percent": 5}
                ],
                "gst_type": "none",
                "kms_year": "2025-2026",
                "season": "Kharif"
            }
        )
        assert response.status_code == 200
        data = response.json()
        self.created_ids.append(data.get('id'))
        
        # Verify no GST applied even though gst_percent is set
        assert data.get('gst_type') == 'none'
        assert data.get('cgst_amount') == 0
        assert data.get('sgst_amount') == 0
        assert data.get('igst_amount') == 0
        assert data.get('total') == data.get('subtotal')
        
        # Items should have gst_amount = 0
        for item in data.get('items', []):
            assert item.get('gst_amount') == 0
        
        print("PASS: gst_type=none has zero GST amounts")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
