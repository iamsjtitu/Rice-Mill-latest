"""
Iteration 81 Backend Tests:
1. Paddy Stock Calculation Fix - stock-items should show Paddy ~297Q (NOT 461.96Q)
2. Paddy-stock API consistency with stock-items Paddy value
3. Single voucher PDF endpoints for Sale and Purchase
4. Bulk PDF exports still working (no regression)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://paddy-ledger-1.preview.emergentagent.com"

class TestPaddyStockCalculation:
    """Test Paddy stock calculation fix - should be ~297Q not 461.96Q"""
    
    def test_stock_items_paddy_value(self):
        """GET /api/purchase-book/stock-items - Paddy should be ~297Q"""
        response = requests.get(f"{BASE_URL}/api/purchase-book/stock-items")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of stock items"
        
        # Find Paddy item
        paddy_item = next((item for item in data if item.get('name') == 'Paddy'), None)
        assert paddy_item is not None, "Paddy item not found in stock-items"
        
        paddy_qty = paddy_item.get('available_qntl', 0)
        print(f"Paddy stock in stock-items: {paddy_qty} Qntl")
        
        # Paddy should be around 297Q, NOT 461.96Q (the bug value)
        # Allow some tolerance for any new milling entries
        assert paddy_qty < 350, f"Paddy stock ({paddy_qty}Q) is too high - might have bug. Expected ~297Q"
        assert paddy_qty > 200, f"Paddy stock ({paddy_qty}Q) is too low. Expected ~297Q"
        print(f"PASSED: Paddy stock is {paddy_qty}Q (expected ~297Q, NOT 461.96Q)")
    
    def test_paddy_stock_api_consistency(self):
        """GET /api/paddy-stock - available_paddy_qntl should match stock-items Paddy"""
        # Get stock-items Paddy value
        response1 = requests.get(f"{BASE_URL}/api/purchase-book/stock-items")
        assert response1.status_code == 200
        stock_items = response1.json()
        paddy_from_stock_items = next((item for item in stock_items if item.get('name') == 'Paddy'), {})
        stock_items_paddy_qty = paddy_from_stock_items.get('available_qntl', 0)
        
        # Get paddy-stock API value
        response2 = requests.get(f"{BASE_URL}/api/paddy-stock")
        assert response2.status_code == 200
        paddy_stock_data = response2.json()
        paddy_stock_qty = paddy_stock_data.get('available_paddy_qntl', 0)
        
        print(f"stock-items Paddy: {stock_items_paddy_qty} Qntl")
        print(f"paddy-stock API: {paddy_stock_qty} Qntl")
        
        # Both should match (or be very close due to rounding)
        diff = abs(stock_items_paddy_qty - paddy_stock_qty)
        assert diff < 1, f"Paddy values don't match: stock-items={stock_items_paddy_qty}, paddy-stock={paddy_stock_qty}"
        print(f"PASSED: Both APIs return consistent Paddy stock value (~{paddy_stock_qty}Q)")


class TestSingleVoucherPDF:
    """Test new single voucher PDF endpoints"""
    
    def test_sale_voucher_pdf_endpoint_exists(self):
        """GET /api/sale-book/{id}/pdf should work for existing voucher"""
        # First get list of sale vouchers
        response = requests.get(f"{BASE_URL}/api/sale-book")
        assert response.status_code == 200
        vouchers = response.json()
        
        if len(vouchers) == 0:
            pytest.skip("No sale vouchers exist to test PDF endpoint")
        
        # Get first voucher ID
        voucher_id = vouchers[0].get('id')
        assert voucher_id, "Voucher ID not found"
        voucher_no = vouchers[0].get('voucher_no', 'N/A')
        
        # Test PDF endpoint
        pdf_response = requests.get(f"{BASE_URL}/api/sale-book/{voucher_id}/pdf")
        assert pdf_response.status_code == 200, f"Sale voucher PDF failed: {pdf_response.status_code}"
        
        # Verify it's a PDF
        content = pdf_response.content
        assert content[:4] == b'%PDF', "Response is not a valid PDF"
        assert pdf_response.headers.get('content-type') == 'application/pdf'
        
        # Check Content-Disposition header
        content_disp = pdf_response.headers.get('content-disposition', '')
        assert 'attachment' in content_disp, "Missing attachment in Content-Disposition"
        assert 'sale_invoice' in content_disp or 'sale_voucher' in content_disp, f"Unexpected filename in Content-Disposition: {content_disp}"
        
        print(f"PASSED: Sale voucher #{voucher_no} PDF generated successfully ({len(content)} bytes)")
    
    def test_sale_voucher_pdf_invalid_id(self):
        """GET /api/sale-book/{invalid_id}/pdf should return 404"""
        response = requests.get(f"{BASE_URL}/api/sale-book/invalid-uuid-12345/pdf")
        assert response.status_code == 404, f"Expected 404 for invalid ID, got {response.status_code}"
        print("PASSED: Invalid sale voucher ID returns 404")
    
    def test_purchase_voucher_pdf_endpoint_exists(self):
        """GET /api/purchase-book/{id}/pdf should work for existing voucher"""
        # First get list of purchase vouchers
        response = requests.get(f"{BASE_URL}/api/purchase-book")
        assert response.status_code == 200
        vouchers = response.json()
        
        if len(vouchers) == 0:
            pytest.skip("No purchase vouchers exist to test PDF endpoint")
        
        # Get first voucher ID
        voucher_id = vouchers[0].get('id')
        assert voucher_id, "Voucher ID not found"
        voucher_no = vouchers[0].get('voucher_no', 'N/A')
        
        # Test PDF endpoint
        pdf_response = requests.get(f"{BASE_URL}/api/purchase-book/{voucher_id}/pdf")
        assert pdf_response.status_code == 200, f"Purchase voucher PDF failed: {pdf_response.status_code}"
        
        # Verify it's a PDF
        content = pdf_response.content
        assert content[:4] == b'%PDF', "Response is not a valid PDF"
        assert pdf_response.headers.get('content-type') == 'application/pdf'
        
        # Check Content-Disposition header
        content_disp = pdf_response.headers.get('content-disposition', '')
        assert 'attachment' in content_disp, "Missing attachment in Content-Disposition"
        assert 'purchase_voucher' in content_disp, f"Unexpected filename in Content-Disposition: {content_disp}"
        
        print(f"PASSED: Purchase voucher #{voucher_no} PDF generated successfully ({len(content)} bytes)")
    
    def test_purchase_voucher_pdf_invalid_id(self):
        """GET /api/purchase-book/{invalid_id}/pdf should return 404"""
        response = requests.get(f"{BASE_URL}/api/purchase-book/invalid-uuid-12345/pdf")
        assert response.status_code == 404, f"Expected 404 for invalid ID, got {response.status_code}"
        print("PASSED: Invalid purchase voucher ID returns 404")


class TestBulkPDFExports:
    """Test that bulk PDF exports still work (no regression)"""
    
    def test_sale_book_bulk_pdf_export(self):
        """GET /api/sale-book/export/pdf - Bulk export should still work"""
        response = requests.get(f"{BASE_URL}/api/sale-book/export/pdf")
        assert response.status_code == 200, f"Sale book bulk PDF failed: {response.status_code}"
        
        content = response.content
        assert content[:4] == b'%PDF', "Bulk sale book PDF is not valid"
        print(f"PASSED: Sale book bulk PDF export working ({len(content)} bytes)")
    
    def test_purchase_book_bulk_pdf_export(self):
        """GET /api/purchase-book/export/pdf - Bulk export should still work"""
        response = requests.get(f"{BASE_URL}/api/purchase-book/export/pdf")
        assert response.status_code == 200, f"Purchase book bulk PDF failed: {response.status_code}"
        
        content = response.content
        assert content[:4] == b'%PDF', "Bulk purchase book PDF is not valid"
        print(f"PASSED: Purchase book bulk PDF export working ({len(content)} bytes)")


class TestSaleBookAPI:
    """Basic Sale Book API tests"""
    
    def test_sale_book_list(self):
        """GET /api/sale-book returns list of vouchers"""
        response = requests.get(f"{BASE_URL}/api/sale-book")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASSED: Sale book has {len(data)} vouchers")


class TestPurchaseBookAPI:
    """Basic Purchase Book API tests"""
    
    def test_purchase_book_list(self):
        """GET /api/purchase-book returns list of vouchers"""
        response = requests.get(f"{BASE_URL}/api/purchase-book")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASSED: Purchase book has {len(data)} vouchers")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
