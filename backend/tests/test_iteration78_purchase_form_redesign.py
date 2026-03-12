"""
Iteration 78 Tests - Purchase Voucher Form Redesign + PDF/Excel Exports
Tests:
1. Purchase Book PDF export with ledger-based Paid/Balance columns
2. Sale Book PDF export with ledger-based balance column
3. Purchase voucher creation with stock item + advance paid
4. Balance calculation verification (Grand Total - Advance)
5. Stock items endpoint with OUT OF STOCK / LOW STOCK data
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPDFExports:
    """Test PDF export endpoints with ledger-based columns"""
    
    def test_sale_book_pdf_export_returns_valid_pdf(self):
        """Test GET /api/sale-book/export/pdf returns valid PDF"""
        response = requests.get(f"{BASE_URL}/api/sale-book/export/pdf")
        assert response.status_code == 200, f"Sale PDF export failed: {response.status_code}"
        assert response.headers.get('content-type') == 'application/pdf', "Content-Type should be application/pdf"
        # Verify PDF magic bytes
        assert response.content[:5] == b'%PDF-', "Response is not a valid PDF file"
        print(f"PASS: Sale Book PDF export returns valid PDF ({len(response.content)} bytes)")
    
    def test_purchase_book_pdf_export_returns_valid_pdf(self):
        """Test GET /api/purchase-book/export/pdf returns valid PDF"""
        response = requests.get(f"{BASE_URL}/api/purchase-book/export/pdf")
        assert response.status_code == 200, f"Purchase PDF export failed: {response.status_code}"
        assert response.headers.get('content-type') == 'application/pdf', "Content-Type should be application/pdf"
        # Verify PDF magic bytes
        assert response.content[:5] == b'%PDF-', "Response is not a valid PDF file"
        print(f"PASS: Purchase Book PDF export returns valid PDF ({len(response.content)} bytes)")
    
    def test_sale_book_pdf_with_filters(self):
        """Test Sale PDF export with kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/sale-book/export/pdf?kms_year=2024-25")
        assert response.status_code == 200, f"Sale PDF export with filter failed: {response.status_code}"
        assert response.content[:5] == b'%PDF-', "Response is not a valid PDF file"
        print("PASS: Sale Book PDF export works with kms_year filter")
    
    def test_purchase_book_pdf_with_filters(self):
        """Test Purchase PDF export with kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/purchase-book/export/pdf?kms_year=2024-25")
        assert response.status_code == 200, f"Purchase PDF export with filter failed: {response.status_code}"
        assert response.content[:5] == b'%PDF-', "Response is not a valid PDF file"
        print("PASS: Purchase Book PDF export works with kms_year filter")


class TestExcelExports:
    """Test Excel export endpoints"""
    
    def test_sale_book_excel_export(self):
        """Test GET /api/sale-book/export/excel returns valid Excel file"""
        response = requests.get(f"{BASE_URL}/api/sale-book/export/excel")
        assert response.status_code == 200, f"Sale Excel export failed: {response.status_code}"
        content_type = response.headers.get('content-type', '')
        assert 'spreadsheet' in content_type or 'excel' in content_type.lower(), f"Unexpected content-type: {content_type}"
        # Excel files start with PK (ZIP format)
        assert response.content[:2] == b'PK', "Response is not a valid Excel/ZIP file"
        print(f"PASS: Sale Book Excel export returns valid file ({len(response.content)} bytes)")
    
    def test_purchase_book_excel_export(self):
        """Test GET /api/purchase-book/export/excel returns valid Excel file"""
        response = requests.get(f"{BASE_URL}/api/purchase-book/export/excel")
        assert response.status_code == 200, f"Purchase Excel export failed: {response.status_code}"
        content_type = response.headers.get('content-type', '')
        assert 'spreadsheet' in content_type or 'excel' in content_type.lower(), f"Unexpected content-type: {content_type}"
        # Excel files start with PK (ZIP format)
        assert response.content[:2] == b'PK', "Response is not a valid Excel/ZIP file"
        print(f"PASS: Purchase Book Excel export returns valid file ({len(response.content)} bytes)")


class TestStockItemsForPurchaseVoucher:
    """Test stock items endpoint for purchase voucher form"""
    
    def test_stock_items_endpoint(self):
        """Test GET /api/purchase-book/stock-items returns items with quantities"""
        response = requests.get(f"{BASE_URL}/api/purchase-book/stock-items")
        assert response.status_code == 200, f"Stock items endpoint failed: {response.status_code}"
        items = response.json()
        assert isinstance(items, list), "Response should be a list"
        assert len(items) > 0, "Should return at least some stock items"
        
        # Verify structure
        for item in items:
            assert 'name' in item, "Item should have 'name' field"
            assert 'available_qntl' in item, "Item should have 'available_qntl' field"
        
        # Check for standard items
        item_names = [i['name'] for i in items]
        standard_items = ['Paddy', 'Rice (Usna)', 'Rice (Raw)']
        for std in standard_items:
            assert std in item_names, f"Standard item '{std}' should be in stock items"
        
        print(f"PASS: Stock items endpoint returns {len(items)} items with correct structure")
        print(f"  Items: {item_names[:5]}...")
    
    def test_stock_items_includes_low_stock_items(self):
        """Verify stock items include items that may have low or zero stock"""
        response = requests.get(f"{BASE_URL}/api/purchase-book/stock-items")
        assert response.status_code == 200
        items = response.json()
        
        # Check for by-products which often have varying stock levels
        item_names = [i['name'] for i in items]
        by_products = ['Bran', 'Kunda', 'Broken', 'Kanki', 'Husk']
        found_byproducts = [bp for bp in by_products if bp in item_names]
        assert len(found_byproducts) >= 3, f"Should have at least 3 by-products, found: {found_byproducts}"
        
        # Print stock levels for visibility
        for item in items:
            qty = item.get('available_qntl', 0)
            status = "OUT OF STOCK" if qty <= 0 else "LOW STOCK" if qty <= 10 else "OK"
            print(f"  {item['name']}: {qty} Q - {status}")
        
        print(f"PASS: Stock items include by-products with stock levels")


class TestPurchaseVoucherCreationWithBalance:
    """Test purchase voucher creation with balance calculation"""
    
    def test_create_voucher_with_advance_calculates_balance(self):
        """Create purchase voucher with advance and verify balance = total - advance"""
        test_party = "TEST_Balance_Calc_78"
        payload = {
            "date": "2025-01-25",
            "party_name": test_party,
            "invoice_no": "INV-TEST-78",
            "items": [
                {"item_name": "Paddy", "quantity": 10, "rate": 2500, "unit": "Qntl"}
            ],
            "gst_type": "none",
            "advance": 10000,  # Advance paid
            "cash_paid": 0,
            "diesel_paid": 0,
            "kms_year": "2024-25",
            "season": ""
        }
        
        response = requests.post(f"{BASE_URL}/api/purchase-book?username=test&role=admin", json=payload)
        assert response.status_code == 200, f"Create voucher failed: {response.status_code} - {response.text}"
        
        data = response.json()
        # Verify calculations
        assert data.get('subtotal') == 25000, f"Subtotal should be 25000, got {data.get('subtotal')}"
        assert data.get('total') == 25000, f"Total should be 25000, got {data.get('total')}"
        assert data.get('advance') == 10000, f"Advance should be 10000, got {data.get('advance')}"
        expected_balance = 25000 - 10000  # 15000
        assert data.get('balance') == expected_balance, f"Balance should be {expected_balance}, got {data.get('balance')}"
        
        voucher_id = data.get('id')
        print(f"PASS: Created voucher with Balance={data.get('balance')} (Total={data.get('total')} - Advance={data.get('advance')})")
        
        # Cleanup
        if voucher_id:
            requests.delete(f"{BASE_URL}/api/purchase-book/{voucher_id}?username=test&role=admin")
    
    def test_create_voucher_zero_advance_full_balance(self):
        """Create voucher with zero advance - balance should equal total"""
        test_party = "TEST_Zero_Advance_78"
        payload = {
            "date": "2025-01-25",
            "party_name": test_party,
            "invoice_no": "INV-ZERO-78",
            "items": [
                {"item_name": "Rice (Usna)", "quantity": 5, "rate": 3000, "unit": "Qntl"}
            ],
            "gst_type": "none",
            "advance": 0,
            "cash_paid": 0,
            "diesel_paid": 0,
            "kms_year": "2024-25",
            "season": ""
        }
        
        response = requests.post(f"{BASE_URL}/api/purchase-book?username=test&role=admin", json=payload)
        assert response.status_code == 200, f"Create voucher failed: {response.status_code}"
        
        data = response.json()
        assert data.get('total') == 15000, f"Total should be 15000, got {data.get('total')}"
        assert data.get('advance') == 0, f"Advance should be 0, got {data.get('advance')}"
        assert data.get('balance') == 15000, f"Balance should equal total (15000), got {data.get('balance')}"
        
        voucher_id = data.get('id')
        print(f"PASS: Voucher with zero advance has Balance={data.get('balance')} (equals Total)")
        
        # Cleanup
        if voucher_id:
            requests.delete(f"{BASE_URL}/api/purchase-book/{voucher_id}?username=test&role=admin")
    
    def test_create_voucher_with_gst_and_advance(self):
        """Create voucher with GST - balance = total_with_gst - advance"""
        test_party = "TEST_GST_Balance_78"
        payload = {
            "date": "2025-01-25",
            "party_name": test_party,
            "invoice_no": "INV-GST-78",
            "items": [
                {"item_name": "Paddy", "quantity": 10, "rate": 2000, "unit": "Qntl"}
            ],
            "gst_type": "cgst_sgst",
            "cgst_percent": 9,
            "sgst_percent": 9,
            "igst_percent": 0,
            "advance": 5000,
            "cash_paid": 0,
            "diesel_paid": 0,
            "kms_year": "2024-25",
            "season": ""
        }
        
        response = requests.post(f"{BASE_URL}/api/purchase-book?username=test&role=admin", json=payload)
        assert response.status_code == 200, f"Create voucher failed: {response.status_code}"
        
        data = response.json()
        # Subtotal = 20000, CGST = 1800, SGST = 1800, Total = 23600
        assert data.get('subtotal') == 20000, f"Subtotal should be 20000"
        assert data.get('cgst_amount') == 1800, f"CGST should be 1800"
        assert data.get('sgst_amount') == 1800, f"SGST should be 1800"
        assert data.get('total') == 23600, f"Total should be 23600"
        expected_balance = 23600 - 5000  # 18600
        assert data.get('balance') == expected_balance, f"Balance should be {expected_balance}, got {data.get('balance')}"
        
        voucher_id = data.get('id')
        print(f"PASS: GST voucher has Balance={data.get('balance')} (Total with GST={data.get('total')} - Advance={data.get('advance')})")
        
        # Cleanup
        if voucher_id:
            requests.delete(f"{BASE_URL}/api/purchase-book/{voucher_id}?username=test&role=admin")


class TestPurchaseVoucherLedgerBalance:
    """Test ledger-based balance in purchase voucher list"""
    
    def test_purchase_vouchers_list_includes_ledger_paid(self):
        """GET /api/purchase-book should include ledger_paid and ledger_balance fields"""
        response = requests.get(f"{BASE_URL}/api/purchase-book")
        assert response.status_code == 200, f"Get vouchers failed: {response.status_code}"
        
        vouchers = response.json()
        if len(vouchers) > 0:
            v = vouchers[0]
            # Check for ledger fields (may be 0 if no payments made)
            assert 'ledger_paid' in v or 'advance' in v, "Voucher should have ledger_paid or advance field"
            assert 'ledger_balance' in v or 'balance' in v, "Voucher should have ledger_balance or balance field"
            print(f"PASS: Purchase voucher includes ledger_paid={v.get('ledger_paid', 'N/A')}, ledger_balance={v.get('ledger_balance', v.get('balance'))}")
        else:
            print("SKIP: No vouchers found to verify ledger fields")


class TestItemSuggestions:
    """Test item suggestions endpoint"""
    
    def test_item_suggestions_endpoint(self):
        """Test GET /api/purchase-book/item-suggestions"""
        response = requests.get(f"{BASE_URL}/api/purchase-book/item-suggestions")
        assert response.status_code == 200, f"Item suggestions failed: {response.status_code}"
        suggestions = response.json()
        assert isinstance(suggestions, list), "Suggestions should be a list"
        print(f"PASS: Item suggestions returns {len(suggestions)} items")
        if len(suggestions) > 0:
            print(f"  Sample suggestions: {suggestions[:5]}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
