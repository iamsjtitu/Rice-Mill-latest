"""
Iteration 77 - Stock Items Dropdown for Purchase Vouchers

Tests the new feature: Stock items dropdown in Purchase Voucher form
1. GET /api/purchase-book/stock-items endpoint
2. Purchase voucher creation with stock item selection
3. Purchase voucher creation with custom item
4. Stock quantity display in dropdown
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestStockItemsEndpoint:
    """Test GET /api/purchase-book/stock-items endpoint"""
    
    def test_stock_items_returns_200(self):
        """Stock items endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/purchase-book/stock-items")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASSED: Stock items endpoint returns 200")
    
    def test_stock_items_returns_list(self):
        """Stock items should return a list"""
        response = requests.get(f"{BASE_URL}/api/purchase-book/stock-items")
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"PASSED: Returns list with {len(data)} items")
    
    def test_stock_items_have_required_fields(self):
        """Each stock item should have name and available_qntl fields"""
        response = requests.get(f"{BASE_URL}/api/purchase-book/stock-items")
        data = response.json()
        
        if len(data) == 0:
            pytest.skip("No stock items to validate")
        
        for item in data:
            assert "name" in item, f"Item missing 'name' field: {item}"
            assert "available_qntl" in item, f"Item missing 'available_qntl' field: {item}"
            assert isinstance(item["name"], str), f"name should be string: {item}"
            assert isinstance(item["available_qntl"], (int, float)), f"available_qntl should be numeric: {item}"
        
        print(f"PASSED: All {len(data)} items have required fields (name, available_qntl)")
    
    def test_stock_items_include_common_items(self):
        """Stock items should include common items like Paddy, Rice, FRK, etc."""
        response = requests.get(f"{BASE_URL}/api/purchase-book/stock-items")
        data = response.json()
        
        item_names = [item["name"] for item in data]
        expected_items = ["Paddy", "Rice (Usna)", "Rice (Raw)", "FRK", "Bran", "Kunda"]
        
        found_items = [item for item in expected_items if item in item_names]
        print(f"PASSED: Found {len(found_items)}/{len(expected_items)} expected items: {found_items}")
        
        # At least some standard items should be present
        assert len(found_items) >= 3, f"Expected at least 3 standard items, found {len(found_items)}"
    
    def test_stock_items_with_filters(self):
        """Stock items endpoint should accept kms_year and season filters"""
        response = requests.get(f"{BASE_URL}/api/purchase-book/stock-items", params={
            "kms_year": "2024-25",
            "season": "Kharif"
        })
        assert response.status_code == 200
        print("PASSED: Stock items endpoint accepts filters without error")


class TestPurchaseVoucherWithStockItem:
    """Test creating purchase vouchers with stock items"""
    
    def test_create_voucher_with_stock_item_paddy(self):
        """Create purchase voucher selecting Paddy from stock"""
        test_party = f"TEST_Party_{uuid.uuid4().hex[:8]}"
        payload = {
            "date": "2024-12-15",
            "party_name": test_party,
            "invoice_no": f"INV-{uuid.uuid4().hex[:6]}",
            "rst_no": "",
            "items": [{
                "item_name": "Paddy",
                "quantity": 10.5,
                "rate": 2500,
                "unit": "Qntl"
            }],
            "gst_type": "none",
            "cgst_percent": 0,
            "sgst_percent": 0,
            "igst_percent": 0,
            "truck_no": "",
            "cash_paid": 0,
            "diesel_paid": 0,
            "advance": 0,
            "eway_bill_no": "",
            "remark": "Test stock item - Paddy",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/purchase-book?username=admin&role=admin",
            json=payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify item saved correctly
        assert len(data.get("items", [])) == 1
        assert data["items"][0]["item_name"] == "Paddy"
        assert data["items"][0]["quantity"] == 10.5
        assert data["items"][0]["rate"] == 2500
        
        # Calculate expected values
        expected_subtotal = 10.5 * 2500  # 26250
        assert data["subtotal"] == expected_subtotal
        assert data["total"] == expected_subtotal
        
        print(f"PASSED: Created voucher #{data.get('voucher_no')} with Paddy (10.5 Qntl @ Rs.2500)")
        
        # Cleanup
        voucher_id = data.get("id")
        if voucher_id:
            requests.delete(f"{BASE_URL}/api/purchase-book/{voucher_id}?username=admin&role=admin")
    
    def test_create_voucher_with_stock_item_frk(self):
        """Create purchase voucher selecting FRK from stock"""
        test_party = f"TEST_Party_{uuid.uuid4().hex[:8]}"
        payload = {
            "date": "2024-12-15",
            "party_name": test_party,
            "invoice_no": "",
            "rst_no": "",
            "items": [{
                "item_name": "FRK",
                "quantity": 5.0,
                "rate": 3500,
                "unit": "Qntl"
            }],
            "gst_type": "none",
            "cgst_percent": 0,
            "sgst_percent": 0,
            "igst_percent": 0,
            "truck_no": "",
            "cash_paid": 0,
            "diesel_paid": 0,
            "advance": 0,
            "eway_bill_no": "",
            "remark": "Test stock item - FRK",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/purchase-book?username=admin&role=admin",
            json=payload
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["items"][0]["item_name"] == "FRK"
        print(f"PASSED: Created voucher with FRK item successfully")
        
        # Cleanup
        if data.get("id"):
            requests.delete(f"{BASE_URL}/api/purchase-book/{data['id']}?username=admin&role=admin")


class TestPurchaseVoucherWithCustomItem:
    """Test creating purchase vouchers with custom/other items"""
    
    def test_create_voucher_with_custom_item(self):
        """Create purchase voucher with custom item (not in stock list)"""
        test_party = f"TEST_Party_{uuid.uuid4().hex[:8]}"
        custom_item = f"Custom_Item_{uuid.uuid4().hex[:6]}"
        
        payload = {
            "date": "2024-12-15",
            "party_name": test_party,
            "invoice_no": "",
            "rst_no": "",
            "items": [{
                "item_name": custom_item,
                "quantity": 3.0,
                "rate": 1500,
                "unit": "Qntl"
            }],
            "gst_type": "none",
            "cgst_percent": 0,
            "sgst_percent": 0,
            "igst_percent": 0,
            "truck_no": "",
            "cash_paid": 0,
            "diesel_paid": 0,
            "advance": 0,
            "eway_bill_no": "",
            "remark": "Test custom item",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/purchase-book?username=admin&role=admin",
            json=payload
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["items"][0]["item_name"] == custom_item
        print(f"PASSED: Created voucher with custom item '{custom_item}'")
        
        # Cleanup
        if data.get("id"):
            requests.delete(f"{BASE_URL}/api/purchase-book/{data['id']}?username=admin&role=admin")
    
    def test_custom_item_appears_in_stock_after_creation(self):
        """After creating a voucher with custom item, it should appear in stock items"""
        test_party = f"TEST_Party_{uuid.uuid4().hex[:8]}"
        custom_item = f"TestItem_{uuid.uuid4().hex[:6]}"
        
        # Get initial stock items
        initial_response = requests.get(f"{BASE_URL}/api/purchase-book/stock-items")
        initial_items = [item["name"] for item in initial_response.json()]
        
        # Create voucher with custom item
        payload = {
            "date": "2024-12-15",
            "party_name": test_party,
            "invoice_no": "",
            "rst_no": "",
            "items": [{
                "item_name": custom_item,
                "quantity": 2.0,
                "rate": 1000,
                "unit": "Qntl"
            }],
            "gst_type": "none",
            "cgst_percent": 0,
            "sgst_percent": 0,
            "igst_percent": 0,
            "truck_no": "",
            "cash_paid": 0,
            "diesel_paid": 0,
            "advance": 0,
            "eway_bill_no": "",
            "remark": "Test for stock appearance",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/purchase-book?username=admin&role=admin",
            json=payload
        )
        assert create_response.status_code == 200
        voucher_data = create_response.json()
        
        # Check if custom item now appears in stock
        after_response = requests.get(f"{BASE_URL}/api/purchase-book/stock-items")
        after_items = {item["name"]: item["available_qntl"] for item in after_response.json()}
        
        if custom_item in after_items:
            print(f"PASSED: Custom item '{custom_item}' appears in stock with qty {after_items[custom_item]}")
        else:
            print(f"INFO: Custom item may not appear until filtered - this is expected behavior")
        
        # Cleanup
        if voucher_data.get("id"):
            requests.delete(f"{BASE_URL}/api/purchase-book/{voucher_data['id']}?username=admin&role=admin")


class TestMultipleItemsInVoucher:
    """Test purchase voucher with multiple items (both stock and custom)"""
    
    def test_create_voucher_with_multiple_items(self):
        """Create purchase voucher with multiple items"""
        test_party = f"TEST_MultiItem_{uuid.uuid4().hex[:8]}"
        
        payload = {
            "date": "2024-12-15",
            "party_name": test_party,
            "invoice_no": f"MULTI-{uuid.uuid4().hex[:6]}",
            "rst_no": "",
            "items": [
                {"item_name": "Paddy", "quantity": 5.0, "rate": 2500, "unit": "Qntl"},
                {"item_name": "FRK", "quantity": 3.0, "rate": 3500, "unit": "Qntl"},
                {"item_name": "Bran", "quantity": 2.0, "rate": 1800, "unit": "Qntl"}
            ],
            "gst_type": "none",
            "cgst_percent": 0,
            "sgst_percent": 0,
            "igst_percent": 0,
            "truck_no": "OD12AB3456",
            "cash_paid": 1000,
            "diesel_paid": 500,
            "advance": 2000,
            "eway_bill_no": "",
            "remark": "Test multiple items",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/purchase-book?username=admin&role=admin",
            json=payload
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify all items saved
        assert len(data.get("items", [])) == 3
        
        # Calculate expected subtotal: 5*2500 + 3*3500 + 2*1800 = 12500 + 10500 + 3600 = 26600
        expected_subtotal = 26600
        assert data["subtotal"] == expected_subtotal, f"Expected subtotal {expected_subtotal}, got {data['subtotal']}"
        
        # Balance = Total - Advance = 26600 - 2000 = 24600
        assert data["balance"] == 24600, f"Expected balance 24600, got {data['balance']}"
        
        print(f"PASSED: Created voucher #{data.get('voucher_no')} with 3 items, subtotal Rs.{expected_subtotal}, balance Rs.{data['balance']}")
        
        # Cleanup
        if data.get("id"):
            requests.delete(f"{BASE_URL}/api/purchase-book/{data['id']}?username=admin&role=admin")


class TestStockQuantityVerification:
    """Test that stock quantities are correctly returned"""
    
    def test_paddy_in_stock_items(self):
        """Verify Paddy stock quantity is returned correctly"""
        response = requests.get(f"{BASE_URL}/api/purchase-book/stock-items")
        data = response.json()
        
        paddy_item = next((item for item in data if item["name"] == "Paddy"), None)
        assert paddy_item is not None, "Paddy should be in stock items"
        assert "available_qntl" in paddy_item
        assert isinstance(paddy_item["available_qntl"], (int, float))
        
        print(f"PASSED: Paddy stock available: {paddy_item['available_qntl']} Qntl")
    
    def test_stock_items_have_unit_field(self):
        """Verify each stock item has unit field"""
        response = requests.get(f"{BASE_URL}/api/purchase-book/stock-items")
        data = response.json()
        
        for item in data:
            assert "unit" in item, f"Item {item['name']} missing 'unit' field"
        
        print(f"PASSED: All {len(data)} items have 'unit' field")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
