"""
Test file for voucher export and purchase voucher bug fixes (Iteration 76)

Tests:
1. Purchase Voucher CREATE with advance_paid - should save successfully without errors
2. Sale Book PDF export - should return application/pdf content type
3. Sale Book Excel export - should return xlsx format
4. Purchase Book PDF export - should return application/pdf content type
5. Purchase Book Excel export - should return xlsx format
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestPurchaseVoucherCreate:
    """Test Purchase Voucher create with advance_paid - KeyError 'id' bug fix"""
    
    def test_create_purchase_voucher_with_advance(self):
        """Create purchase voucher with advance - should NOT throw KeyError"""
        payload = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "party_name": "TEST_Export_Party_Advance",
            "invoice_no": "INV-TEST-001",
            "rst_no": "RST-001",
            "items": [
                {"item_name": "Paddy", "quantity": 100, "rate": 2000, "unit": "Qntl"}
            ],
            "gst_type": "none",
            "cgst_percent": 0,
            "sgst_percent": 0,
            "igst_percent": 0,
            "truck_no": "OD99X1234",
            "cash_paid": 500,
            "diesel_paid": 1000,
            "advance": 5000,
            "eway_bill_no": "EW123456",
            "remark": "Test voucher with advance",
            "kms_year": "2025-26",
            "season": "KMS"
        }
        
        response = requests.post(f"{BASE_URL}/api/purchase-book?username=test&role=admin", json=payload)
        
        # Should NOT return 500 - was KeyError 'id' before fix
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should have 'id' field"
        assert data["party_name"] == "TEST_Export_Party_Advance"
        assert data["advance"] == 5000
        # Balance = Total - Advance
        assert data["balance"] == 200000 - 5000, f"Balance should be 195000, got {data.get('balance')}"
        assert data["paid_amount"] == 5000
        
        # Cleanup
        voucher_id = data["id"]
        requests.delete(f"{BASE_URL}/api/purchase-book/{voucher_id}?username=test&role=admin")
        
    def test_create_purchase_voucher_without_advance(self):
        """Create purchase voucher without advance - should also work"""
        payload = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "party_name": "TEST_Export_Party_NoAdvance",
            "items": [
                {"item_name": "Rice", "quantity": 50, "rate": 3000, "unit": "Qntl"}
            ],
            "gst_type": "none",
            "kms_year": "2025-26",
            "season": "KMS"
        }
        
        response = requests.post(f"{BASE_URL}/api/purchase-book?username=test&role=admin", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert data["advance"] == 0
        assert data["balance"] == 150000  # Total = 50*3000 = 150000
        
        # Cleanup
        voucher_id = data["id"]
        requests.delete(f"{BASE_URL}/api/purchase-book/{voucher_id}?username=test&role=admin")


class TestSaleBookExports:
    """Test Sale Book PDF and Excel exports - HTML to reportlab fix"""
    
    def test_sale_book_pdf_export(self):
        """Sale Book PDF export should return valid PDF"""
        response = requests.get(f"{BASE_URL}/api/sale-book/export/pdf")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Check content type is PDF
        content_type = response.headers.get('Content-Type', '')
        assert 'application/pdf' in content_type, f"Expected application/pdf, got {content_type}"
        
        # Check PDF bytes start with %PDF-
        pdf_bytes = response.content
        assert pdf_bytes[:5] == b'%PDF-', f"PDF should start with %PDF-, got {pdf_bytes[:20]}"
        
        # Check Content-Disposition header
        content_disp = response.headers.get('Content-Disposition', '')
        assert 'attachment' in content_disp, "Should have attachment disposition"
        assert 'sale_book' in content_disp.lower(), "Filename should contain sale_book"
        
    def test_sale_book_pdf_with_filters(self):
        """Sale Book PDF export with kms_year and season filters"""
        response = requests.get(f"{BASE_URL}/api/sale-book/export/pdf?kms_year=2025-26&season=KMS")
        
        assert response.status_code == 200
        assert 'application/pdf' in response.headers.get('Content-Type', '')
        assert response.content[:5] == b'%PDF-'
        
    def test_sale_book_excel_export(self):
        """Sale Book Excel export should return valid xlsx"""
        response = requests.get(f"{BASE_URL}/api/sale-book/export/excel")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Check content type is xlsx
        content_type = response.headers.get('Content-Type', '')
        expected_ct = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        assert expected_ct in content_type, f"Expected xlsx content type, got {content_type}"
        
        # Check xlsx bytes (starts with PK - zip archive)
        xlsx_bytes = response.content
        assert xlsx_bytes[:2] == b'PK', f"XLSX should start with PK (zip), got {xlsx_bytes[:10]}"
        
        # Check Content-Disposition header
        content_disp = response.headers.get('Content-Disposition', '')
        assert 'attachment' in content_disp
        assert 'sale_book' in content_disp.lower() and '.xlsx' in content_disp.lower()
        
    def test_sale_book_excel_with_filters(self):
        """Sale Book Excel export with filters"""
        response = requests.get(f"{BASE_URL}/api/sale-book/export/excel?kms_year=2025-26")
        
        assert response.status_code == 200
        assert 'spreadsheetml' in response.headers.get('Content-Type', '')
        assert response.content[:2] == b'PK'


class TestPurchaseBookExports:
    """Test Purchase Book PDF and Excel exports - reportlab platypus fix"""
    
    def test_purchase_book_pdf_export(self):
        """Purchase Book PDF export should return valid PDF"""
        response = requests.get(f"{BASE_URL}/api/purchase-book/export/pdf")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Check content type is PDF
        content_type = response.headers.get('Content-Type', '')
        assert 'application/pdf' in content_type, f"Expected application/pdf, got {content_type}"
        
        # Check PDF bytes start with %PDF-
        pdf_bytes = response.content
        assert pdf_bytes[:5] == b'%PDF-', f"PDF should start with %PDF-, got {pdf_bytes[:20]}"
        
        # Check Content-Disposition header
        content_disp = response.headers.get('Content-Disposition', '')
        assert 'attachment' in content_disp
        assert 'purchase_book' in content_disp.lower()
        
    def test_purchase_book_pdf_with_filters(self):
        """Purchase Book PDF export with filters"""
        response = requests.get(f"{BASE_URL}/api/purchase-book/export/pdf?kms_year=2025-26&season=KMS")
        
        assert response.status_code == 200
        assert 'application/pdf' in response.headers.get('Content-Type', '')
        assert response.content[:5] == b'%PDF-'
        
    def test_purchase_book_excel_export(self):
        """Purchase Book Excel export should return valid xlsx"""
        response = requests.get(f"{BASE_URL}/api/purchase-book/export/excel")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Check content type is xlsx
        content_type = response.headers.get('Content-Type', '')
        expected_ct = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        assert expected_ct in content_type, f"Expected xlsx content type, got {content_type}"
        
        # Check xlsx bytes (starts with PK - zip archive)
        xlsx_bytes = response.content
        assert xlsx_bytes[:2] == b'PK', f"XLSX should start with PK (zip), got {xlsx_bytes[:10]}"
        
        # Check Content-Disposition header
        content_disp = response.headers.get('Content-Disposition', '')
        assert 'attachment' in content_disp
        assert 'purchase_book' in content_disp.lower()
        
    def test_purchase_book_excel_with_filters(self):
        """Purchase Book Excel export with filters"""
        response = requests.get(f"{BASE_URL}/api/purchase-book/export/excel?kms_year=2025-26")
        
        assert response.status_code == 200
        assert 'spreadsheetml' in response.headers.get('Content-Type', '')
        assert response.content[:2] == b'PK'


class TestAdvanceDeductionLogic:
    """Test that advance is properly deducted from total to compute balance"""
    
    def test_balance_equals_total_minus_advance(self):
        """Verify balance = total - advance in response"""
        payload = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "party_name": "TEST_BalanceCalc_Party",
            "items": [
                {"item_name": "Test Item", "quantity": 10, "rate": 1000, "unit": "Qntl"}
            ],
            "gst_type": "none",
            "advance": 3000,
            "kms_year": "2025-26",
            "season": "KMS"
        }
        
        response = requests.post(f"{BASE_URL}/api/purchase-book?username=test&role=admin", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        
        # Total should be 10 * 1000 = 10000
        assert data["total"] == 10000, f"Total should be 10000, got {data.get('total')}"
        
        # Balance should be 10000 - 3000 = 7000
        assert data["balance"] == 7000, f"Balance should be 7000, got {data.get('balance')}"
        
        # paid_amount should equal advance
        assert data["paid_amount"] == 3000, f"paid_amount should be 3000, got {data.get('paid_amount')}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/purchase-book/{data['id']}?username=test&role=admin")
        
    def test_balance_with_gst(self):
        """Verify balance calculation with GST"""
        payload = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "party_name": "TEST_BalanceGST_Party",
            "items": [
                {"item_name": "Test Item GST", "quantity": 10, "rate": 1000, "unit": "Qntl"}
            ],
            "gst_type": "cgst_sgst",
            "cgst_percent": 2.5,
            "sgst_percent": 2.5,
            "advance": 2000,
            "kms_year": "2025-26",
            "season": "KMS"
        }
        
        response = requests.post(f"{BASE_URL}/api/purchase-book?username=test&role=admin", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        
        # Subtotal = 10000
        # CGST = 10000 * 2.5% = 250
        # SGST = 10000 * 2.5% = 250
        # Total = 10000 + 250 + 250 = 10500
        assert data["subtotal"] == 10000
        assert data["cgst_amount"] == 250
        assert data["sgst_amount"] == 250
        assert data["total"] == 10500
        
        # Balance = 10500 - 2000 = 8500
        assert data["balance"] == 8500, f"Balance should be 8500, got {data.get('balance')}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/purchase-book/{data['id']}?username=test&role=admin")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
