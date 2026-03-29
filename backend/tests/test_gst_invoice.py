"""
GST Invoice Feature Tests - Iteration 118
Tests for GST Invoice CRUD, PDF generation, WhatsApp send, and Company Settings
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://paddy-ledger-1.preview.emergentagent.com').rstrip('/')

class TestGstCompanySettings:
    """GST Company Settings API tests"""
    
    def test_get_gst_company_settings_returns_defaults(self):
        """GET /api/gst-company-settings returns default settings"""
        response = requests.get(f"{BASE_URL}/api/gst-company-settings")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify all expected fields exist
        expected_fields = ["company_name", "gstin", "address", "state_code", "state_name", "phone", "bank_name", "bank_account", "bank_ifsc"]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        print(f"✓ GET /api/gst-company-settings returns all expected fields")
        print(f"  Current company_name: {data.get('company_name', '(empty)')}")
    
    def test_put_gst_company_settings_saves_data(self):
        """PUT /api/gst-company-settings saves company details"""
        test_data = {
            "company_name": "TEST_GST_Company_" + str(uuid.uuid4())[:8],
            "gstin": "21AAAAA0000A1Z5",
            "address": "Test Address, Odisha",
            "state_code": "21",
            "state_name": "Odisha",
            "phone": "9876543210",
            "bank_name": "Test Bank",
            "bank_account": "1234567890",
            "bank_ifsc": "TEST0001234"
        }
        
        # Save settings
        response = requests.put(f"{BASE_URL}/api/gst-company-settings", json=test_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.json().get("success") == True
        print(f"✓ PUT /api/gst-company-settings saved successfully")
        
        # Verify by GET
        get_response = requests.get(f"{BASE_URL}/api/gst-company-settings")
        assert get_response.status_code == 200
        saved_data = get_response.json()
        assert saved_data["company_name"] == test_data["company_name"]
        assert saved_data["gstin"] == test_data["gstin"]
        assert saved_data["bank_name"] == test_data["bank_name"]
        print(f"✓ GET verified saved data: company_name={saved_data['company_name']}")


class TestGstInvoiceCRUD:
    """GST Invoice CRUD API tests"""
    
    @pytest.fixture
    def test_invoice_data(self):
        """Generate unique test invoice data"""
        return {
            "invoice_no": f"TEST-INV-{uuid.uuid4().hex[:6].upper()}",
            "date": "2026-01-15",
            "buyer_name": "Test Buyer Party",
            "buyer_gstin": "22BBBBB0000B1Z5",
            "buyer_address": "Test Buyer Address",
            "buyer_phone": "9876543210",
            "is_igst": False,
            "items": [
                {"name": "Rice (Parboiled)", "hsn": "1006 30 20", "qty": 10, "unit": "QNTL", "rate": 2500, "gst_pct": 5},
                {"name": "Broken Rice", "hsn": "1006 40 00", "qty": 5, "unit": "QNTL", "rate": 1500, "gst_pct": 5}
            ],
            "kms_year": "2025-2026",
            "season": "Kharif",
            "notes": "Test invoice notes"
        }
    
    def test_create_gst_invoice_with_correct_totals(self, test_invoice_data):
        """POST /api/gst-invoices creates invoice with correct CGST/SGST split"""
        response = requests.post(f"{BASE_URL}/api/gst-invoices", json=test_invoice_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain invoice id"
        assert "totals" in data, "Response should contain totals"
        
        totals = data["totals"]
        # Calculate expected values
        # Item 1: 10 * 2500 = 25000, GST 5% = 1250
        # Item 2: 5 * 1500 = 7500, GST 5% = 375
        # Total taxable = 32500, Total GST = 1625
        expected_taxable = 32500
        expected_gst = 1625
        expected_cgst = 812.5
        expected_sgst = 812.5
        expected_total = 34125
        
        assert totals["taxable"] == expected_taxable, f"Expected taxable {expected_taxable}, got {totals['taxable']}"
        assert totals["gst"] == expected_gst, f"Expected gst {expected_gst}, got {totals['gst']}"
        assert totals["cgst"] == expected_cgst, f"Expected cgst {expected_cgst}, got {totals['cgst']}"
        assert totals["sgst"] == expected_sgst, f"Expected sgst {expected_sgst}, got {totals['sgst']}"
        assert totals["igst"] == 0, f"Expected igst 0 for intra-state, got {totals['igst']}"
        assert totals["total"] == expected_total, f"Expected total {expected_total}, got {totals['total']}"
        
        print(f"✓ POST /api/gst-invoices created invoice {data['invoice_no']}")
        print(f"  Totals: taxable={totals['taxable']}, CGST={totals['cgst']}, SGST={totals['sgst']}, total={totals['total']}")
        
        # Cleanup - delete the test invoice
        requests.delete(f"{BASE_URL}/api/gst-invoices/{data['id']}")
        return data
    
    def test_create_gst_invoice_with_igst(self):
        """POST /api/gst-invoices with is_igst=True calculates IGST correctly"""
        invoice_data = {
            "invoice_no": f"TEST-IGST-{uuid.uuid4().hex[:6].upper()}",
            "date": "2026-01-15",
            "buyer_name": "Inter-State Buyer",
            "buyer_gstin": "27CCCCC0000C1Z5",
            "buyer_address": "Maharashtra",
            "buyer_phone": "9876543210",
            "is_igst": True,  # Inter-state
            "items": [
                {"name": "Rice (Raw)", "hsn": "1006 30 10", "qty": 20, "unit": "QNTL", "rate": 3000, "gst_pct": 5}
            ],
            "kms_year": "2025-2026",
            "season": "Kharif",
            "notes": ""
        }
        
        response = requests.post(f"{BASE_URL}/api/gst-invoices", json=invoice_data)
        assert response.status_code == 200
        
        data = response.json()
        totals = data["totals"]
        
        # 20 * 3000 = 60000 taxable, 5% GST = 3000 IGST
        assert totals["taxable"] == 60000
        assert totals["igst"] == 3000
        assert totals["cgst"] == 0, "CGST should be 0 for IGST invoice"
        assert totals["sgst"] == 0, "SGST should be 0 for IGST invoice"
        assert totals["total"] == 63000
        
        print(f"✓ IGST invoice created: taxable=60000, IGST=3000, total=63000")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/gst-invoices/{data['id']}")
    
    def test_list_gst_invoices_with_filters(self):
        """GET /api/gst-invoices lists invoices filtered by kms_year/season"""
        # List all invoices for 2025-2026
        response = requests.get(f"{BASE_URL}/api/gst-invoices?kms_year=2025-2026")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/gst-invoices returned {len(data)} invoices for kms_year=2025-2026")
        
        # Verify all returned invoices have correct kms_year
        for inv in data:
            assert inv.get("kms_year") == "2025-2026", f"Invoice {inv.get('invoice_no')} has wrong kms_year"
    
    def test_update_gst_invoice(self, test_invoice_data):
        """PUT /api/gst-invoices/{id} updates invoice"""
        # First create an invoice
        create_response = requests.post(f"{BASE_URL}/api/gst-invoices", json=test_invoice_data)
        assert create_response.status_code == 200
        created = create_response.json()
        inv_id = created["id"]
        
        # Update the invoice
        updated_data = test_invoice_data.copy()
        updated_data["buyer_name"] = "Updated Buyer Name"
        updated_data["items"] = [
            {"name": "Rice (Parboiled)", "hsn": "1006 30 20", "qty": 15, "unit": "QNTL", "rate": 2500, "gst_pct": 5}
        ]
        
        update_response = requests.put(f"{BASE_URL}/api/gst-invoices/{inv_id}", json=updated_data)
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        update_result = update_response.json()
        assert update_result.get("success") == True
        
        # Verify new totals: 15 * 2500 = 37500, GST 5% = 1875
        assert update_result["totals"]["taxable"] == 37500
        assert update_result["totals"]["gst"] == 1875
        print(f"✓ PUT /api/gst-invoices/{inv_id} updated successfully")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/gst-invoices/{inv_id}")
    
    def test_delete_gst_invoice(self, test_invoice_data):
        """DELETE /api/gst-invoices/{id} deletes invoice"""
        # Create an invoice
        create_response = requests.post(f"{BASE_URL}/api/gst-invoices", json=test_invoice_data)
        assert create_response.status_code == 200
        inv_id = create_response.json()["id"]
        
        # Delete it
        delete_response = requests.delete(f"{BASE_URL}/api/gst-invoices/{inv_id}")
        assert delete_response.status_code == 200
        assert delete_response.json().get("success") == True
        print(f"✓ DELETE /api/gst-invoices/{inv_id} successful")
        
        # Verify it's gone - should return 404
        get_response = requests.get(f"{BASE_URL}/api/gst-invoices?kms_year=2025-2026")
        invoices = get_response.json()
        assert not any(inv["id"] == inv_id for inv in invoices), "Deleted invoice should not appear in list"
        print(f"✓ Verified invoice {inv_id} no longer in list")


class TestGstInvoicePDF:
    """GST Invoice PDF generation tests"""
    
    def test_get_gst_invoice_pdf(self):
        """GET /api/gst-invoices/{id}/pdf generates valid PDF"""
        # First, get an existing invoice or create one
        list_response = requests.get(f"{BASE_URL}/api/gst-invoices?kms_year=2025-2026")
        invoices = list_response.json()
        
        if not invoices:
            # Create a test invoice
            test_data = {
                "invoice_no": f"TEST-PDF-{uuid.uuid4().hex[:6].upper()}",
                "date": "2026-01-15",
                "buyer_name": "PDF Test Buyer",
                "buyer_gstin": "21DDDDD0000D1Z5",
                "buyer_address": "Test Address",
                "buyer_phone": "9876543210",
                "is_igst": False,
                "items": [{"name": "Rice (Parboiled)", "hsn": "1006 30 20", "qty": 10, "unit": "QNTL", "rate": 2500, "gst_pct": 5}],
                "kms_year": "2025-2026",
                "season": "Kharif",
                "notes": ""
            }
            create_response = requests.post(f"{BASE_URL}/api/gst-invoices", json=test_data)
            inv_id = create_response.json()["id"]
            cleanup_needed = True
        else:
            inv_id = invoices[0]["id"]
            cleanup_needed = False
        
        # Get PDF
        pdf_response = requests.get(f"{BASE_URL}/api/gst-invoices/{inv_id}/pdf")
        assert pdf_response.status_code == 200, f"PDF generation failed: {pdf_response.status_code}"
        assert pdf_response.headers.get("content-type") == "application/pdf"
        assert len(pdf_response.content) > 1000, "PDF content too small"
        
        # Check PDF magic bytes
        assert pdf_response.content[:4] == b'%PDF', "Response is not a valid PDF"
        print(f"✓ GET /api/gst-invoices/{inv_id}/pdf returned valid PDF ({len(pdf_response.content)} bytes)")
        
        if cleanup_needed:
            requests.delete(f"{BASE_URL}/api/gst-invoices/{inv_id}")
    
    def test_pdf_for_nonexistent_invoice_returns_404(self):
        """GET /api/gst-invoices/{id}/pdf returns 404 for non-existent invoice"""
        fake_id = "nonexistent-invoice-id-12345"
        response = requests.get(f"{BASE_URL}/api/gst-invoices/{fake_id}/pdf")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ PDF for non-existent invoice correctly returns 404")


class TestWhatsAppGstInvoice:
    """WhatsApp GST Invoice send tests"""
    
    def test_send_gst_invoice_endpoint_exists(self):
        """POST /api/whatsapp/send-gst-invoice endpoint exists and handles request"""
        # Get an existing invoice
        list_response = requests.get(f"{BASE_URL}/api/gst-invoices?kms_year=2025-2026")
        invoices = list_response.json()
        
        if not invoices:
            pytest.skip("No invoices available for WhatsApp test")
        
        inv_id = invoices[0]["id"]
        
        # Try to send (will fail if no WhatsApp API key, but endpoint should work)
        response = requests.post(f"{BASE_URL}/api/whatsapp/send-gst-invoice", json={
            "invoice_id": inv_id,
            "pdf_url": f"{BASE_URL}/api/gst-invoices/{inv_id}/pdf",
            "phone": ""
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Either success or error about no numbers configured (both are valid responses)
        assert "success" in data or "error" in data
        print(f"✓ POST /api/whatsapp/send-gst-invoice endpoint working")
        print(f"  Response: {data}")
    
    def test_send_gst_invoice_with_invalid_id(self):
        """POST /api/whatsapp/send-gst-invoice with invalid invoice_id returns error"""
        response = requests.post(f"{BASE_URL}/api/whatsapp/send-gst-invoice", json={
            "invoice_id": "invalid-id-12345",
            "pdf_url": "",
            "phone": ""
        })
        
        assert response.status_code == 200  # Returns 200 with error in body
        data = response.json()
        assert data.get("success") == False
        assert "not found" in data.get("error", "").lower() or "error" in data
        print(f"✓ WhatsApp send with invalid invoice_id correctly returns error")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
