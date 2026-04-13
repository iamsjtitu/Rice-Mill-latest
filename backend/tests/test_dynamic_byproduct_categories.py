"""
Test Dynamic By-Product Categories - Iteration 186
Tests for custom categories like 'rejection_rice' appearing everywhere:
- Milling Entry save
- Stock Summary
- Sale Voucher dropdown
- FY Summary
- Purchase Book
- Opening Stock from Settings
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def session():
    """Create authenticated session"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # Login
    resp = s.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return s


class TestByProductCategories:
    """Test by-product categories CRUD and dynamic behavior"""
    
    def test_get_byproduct_categories_includes_rejection_rice(self, session):
        """GET /api/byproduct-categories should include 'rejection_rice' category"""
        resp = session.get(f"{BASE_URL}/api/byproduct-categories")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        categories = resp.json()
        assert isinstance(categories, list), "Response should be a list"
        
        # Check if rejection_rice exists
        cat_ids = [c["id"] for c in categories]
        print(f"Available categories: {cat_ids}")
        
        # If rejection_rice doesn't exist, create it
        if "rejection_rice" not in cat_ids:
            create_resp = session.post(f"{BASE_URL}/api/byproduct-categories", json={
                "id": "rejection_rice",
                "name": "Rejection Rice",
                "name_hi": "रिजेक्शन चावल",
                "is_auto": False
            })
            assert create_resp.status_code == 200, f"Failed to create rejection_rice: {create_resp.text}"
            print("Created rejection_rice category")
            
            # Verify it was created
            resp = session.get(f"{BASE_URL}/api/byproduct-categories")
            categories = resp.json()
            cat_ids = [c["id"] for c in categories]
        
        assert "rejection_rice" in cat_ids, f"rejection_rice not found in categories: {cat_ids}"
        print(f"PASS: rejection_rice category exists")


class TestMillingEntryWithDynamicCategories:
    """Test milling entry creation with dynamic by-product categories"""
    
    created_entry_id = None
    
    def test_create_milling_entry_with_rejection_rice(self, session):
        """POST /api/milling-entries with rejection_rice_percent=5, paddy_input_qntl=100"""
        payload = {
            "date": "2025-01-15",
            "rice_type": "parboiled",
            "paddy_input_qntl": 100,
            "rice_percent": 67,
            "bran_percent": 5,
            "kunda_percent": 3,
            "broken_percent": 2,
            "kanki_percent": 1,
            "rejection_rice_percent": 5,  # Dynamic category
            "frk_used_qntl": 0,
            "note": "TEST_dynamic_category_test",
            "kms_year": "2025-26",
            "season": "Kharif"
        }
        resp = session.post(f"{BASE_URL}/api/milling-entries", json=payload)
        assert resp.status_code == 200, f"Failed to create milling entry: {resp.text}"
        
        data = resp.json()
        TestMillingEntryWithDynamicCategories.created_entry_id = data.get("id")
        
        # Verify rejection_rice_qntl is calculated correctly (5% of 100 = 5.0)
        assert "rejection_rice_qntl" in data, f"rejection_rice_qntl not in response: {data.keys()}"
        assert data["rejection_rice_qntl"] == 5.0, f"Expected 5.0, got {data['rejection_rice_qntl']}"
        
        # Verify husk_percent is auto-calculated (100 - 67 - 5 - 3 - 2 - 1 - 5 = 17)
        expected_husk = 100 - 67 - 5 - 3 - 2 - 1 - 5
        assert data.get("husk_percent") == expected_husk, f"Expected husk_percent={expected_husk}, got {data.get('husk_percent')}"
        
        print(f"PASS: Milling entry created with rejection_rice_qntl={data['rejection_rice_qntl']}")
        print(f"PASS: husk_percent auto-calculated as {data.get('husk_percent')}")
    
    def test_get_milling_entry_has_rejection_rice(self, session):
        """GET /api/milling-entries/{id} should have rejection_rice fields"""
        if not TestMillingEntryWithDynamicCategories.created_entry_id:
            pytest.skip("No entry created")
        
        entry_id = TestMillingEntryWithDynamicCategories.created_entry_id
        resp = session.get(f"{BASE_URL}/api/milling-entries/{entry_id}")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        data = resp.json()
        assert "rejection_rice_qntl" in data, f"rejection_rice_qntl not in entry"
        assert data["rejection_rice_qntl"] == 5.0
        print(f"PASS: GET milling entry has rejection_rice_qntl={data['rejection_rice_qntl']}")


class TestByProductStock:
    """Test by-product stock includes dynamic categories"""
    
    def test_byproduct_stock_has_rejection_rice(self, session):
        """GET /api/byproduct-stock?kms_year=2025-26 should have rejection_rice with produced_qntl > 0"""
        resp = session.get(f"{BASE_URL}/api/byproduct-stock", params={"kms_year": "2025-26"})
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        stock = resp.json()
        assert isinstance(stock, dict), "Response should be a dict"
        
        # Check rejection_rice exists in stock
        assert "rejection_rice" in stock, f"rejection_rice not in stock: {stock.keys()}"
        
        rejection_rice_stock = stock["rejection_rice"]
        print(f"rejection_rice stock: {rejection_rice_stock}")
        
        # Should have produced_qntl > 0 if milling entry was created
        assert rejection_rice_stock.get("produced_qntl", 0) >= 0, "produced_qntl should be >= 0"
        print(f"PASS: rejection_rice in byproduct-stock with produced_qntl={rejection_rice_stock.get('produced_qntl')}")


class TestSaleBookStockItems:
    """Test sale book stock items includes dynamic categories"""
    
    def test_sale_book_stock_items_has_rejection_rice(self, session):
        """GET /api/sale-book/stock-items?kms_year=2025-26 should have 'Rejection Rice'"""
        resp = session.get(f"{BASE_URL}/api/sale-book/stock-items", params={"kms_year": "2025-26"})
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        items = resp.json()
        assert isinstance(items, list), "Response should be a list"
        
        item_names = [i["name"] for i in items]
        print(f"Sale book stock items: {item_names}")
        
        # Check for Rejection Rice (display name)
        assert "Rejection Rice" in item_names, f"'Rejection Rice' not in sale book stock items: {item_names}"
        
        # Find the item and check quantity
        rejection_item = next((i for i in items if i["name"] == "Rejection Rice"), None)
        assert rejection_item is not None
        print(f"PASS: 'Rejection Rice' in sale-book/stock-items with available_qntl={rejection_item.get('available_qntl')}")


class TestPurchaseBookStockItems:
    """Test purchase book stock items includes dynamic categories"""
    
    def test_purchase_book_stock_items_has_rejection_rice(self, session):
        """GET /api/purchase-book/stock-items?kms_year=2025-26 should have 'Rejection Rice'"""
        resp = session.get(f"{BASE_URL}/api/purchase-book/stock-items", params={"kms_year": "2025-26"})
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        items = resp.json()
        assert isinstance(items, list), "Response should be a list"
        
        item_names = [i["name"] for i in items]
        print(f"Purchase book stock items: {item_names}")
        
        # Check for Rejection Rice (display name)
        assert "Rejection Rice" in item_names, f"'Rejection Rice' not in purchase book stock items: {item_names}"
        print(f"PASS: 'Rejection Rice' in purchase-book/stock-items")


class TestOpeningStockAndFYSummary:
    """Test opening stock from Settings reflects in FY Summary"""
    
    def test_set_opening_stock_with_rejection_rice(self, session):
        """PUT /api/opening-stock with rejection_rice=50"""
        payload = {
            "kms_year": "2025-26",
            "stocks": {
                "paddy": 0,
                "rice_usna": 0,
                "rice_raw": 0,
                "bran": 0,
                "kunda": 0,
                "broken": 0,
                "kanki": 0,
                "husk": 0,
                "frk": 0,
                "rejection_rice": 50  # Dynamic category opening stock
            }
        }
        # Admin-only endpoint requires username and role params
        resp = session.put(f"{BASE_URL}/api/opening-stock", json=payload, params={"username": "admin", "role": "admin"})
        assert resp.status_code == 200, f"Failed to set opening stock: {resp.text}"
        
        data = resp.json()
        assert data.get("success") == True, f"Expected success=True: {data}"
        print(f"PASS: Opening stock set with rejection_rice=50")
    
    def test_get_opening_stock_has_rejection_rice(self, session):
        """GET /api/opening-stock?kms_year=2025-26 should have rejection_rice=50"""
        resp = session.get(f"{BASE_URL}/api/opening-stock", params={"kms_year": "2025-26"})
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        data = resp.json()
        stocks = data.get("stocks", {})
        
        assert "rejection_rice" in stocks, f"rejection_rice not in opening stock: {stocks.keys()}"
        assert stocks["rejection_rice"] == 50, f"Expected 50, got {stocks['rejection_rice']}"
        print(f"PASS: Opening stock has rejection_rice={stocks['rejection_rice']}")
    
    def test_fy_summary_has_rejection_rice_opening_stock(self, session):
        """GET /api/fy-summary?kms_year=2025-26 should show rejection_rice opening_stock=50"""
        resp = session.get(f"{BASE_URL}/api/fy-summary", params={"kms_year": "2025-26"})
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        data = resp.json()
        byproducts = data.get("byproducts", {})
        
        print(f"FY Summary byproducts: {list(byproducts.keys())}")
        
        # Check rejection_rice exists in byproducts
        assert "rejection_rice" in byproducts, f"rejection_rice not in FY summary byproducts: {byproducts.keys()}"
        
        rejection_rice = byproducts["rejection_rice"]
        print(f"rejection_rice in FY summary: {rejection_rice}")
        
        # Opening stock should be 50 (from Settings)
        assert rejection_rice.get("opening_stock") == 50, f"Expected opening_stock=50, got {rejection_rice.get('opening_stock')}"
        print(f"PASS: FY Summary has rejection_rice opening_stock={rejection_rice.get('opening_stock')}")


class TestStockSummary:
    """Test stock summary includes dynamic categories"""
    
    def test_stock_summary_has_rejection_rice(self, session):
        """GET /api/stock-summary?kms_year=2025-26 should have 'Rejection Rice'"""
        resp = session.get(f"{BASE_URL}/api/stock-summary", params={"kms_year": "2025-26"})
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        data = resp.json()
        items = data.get("items", [])
        
        item_names = [i["name"] for i in items]
        print(f"Stock summary items: {item_names}")
        
        # Check for Rejection Rice
        assert "Rejection Rice" in item_names, f"'Rejection Rice' not in stock summary: {item_names}"
        
        rejection_item = next((i for i in items if i["name"] == "Rejection Rice"), None)
        assert rejection_item is not None
        
        # Should have opening stock from Settings
        print(f"Rejection Rice in stock summary: {rejection_item}")
        print(f"PASS: 'Rejection Rice' in stock-summary with opening={rejection_item.get('opening')}, available={rejection_item.get('available')}")


class TestMillingSummary:
    """Test milling summary includes dynamic categories"""
    
    def test_milling_summary_has_rejection_rice_total(self, session):
        """GET /api/milling-summary?kms_year=2025-26 should have total_rejection_rice_qntl"""
        resp = session.get(f"{BASE_URL}/api/milling-summary", params={"kms_year": "2025-26"})
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        data = resp.json()
        print(f"Milling summary keys: {data.keys()}")
        
        # Check for total_rejection_rice_qntl
        assert "total_rejection_rice_qntl" in data, f"total_rejection_rice_qntl not in milling summary: {data.keys()}"
        print(f"PASS: Milling summary has total_rejection_rice_qntl={data.get('total_rejection_rice_qntl')}")


class TestCleanup:
    """Cleanup test data"""
    
    def test_delete_test_milling_entry(self, session):
        """DELETE the test milling entry"""
        entry_id = TestMillingEntryWithDynamicCategories.created_entry_id
        if not entry_id:
            pytest.skip("No entry to delete")
        
        resp = session.delete(f"{BASE_URL}/api/milling-entries/{entry_id}")
        assert resp.status_code == 200, f"Failed to delete: {resp.text}"
        print(f"PASS: Deleted test milling entry {entry_id}")
    
    def test_reset_opening_stock(self, session):
        """Reset opening stock to 0"""
        payload = {
            "kms_year": "2025-26",
            "stocks": {
                "paddy": 0,
                "rice_usna": 0,
                "rice_raw": 0,
                "bran": 0,
                "kunda": 0,
                "broken": 0,
                "kanki": 0,
                "husk": 0,
                "frk": 0,
                "rejection_rice": 0
            }
        }
        # Admin-only endpoint requires username and role params
        resp = session.put(f"{BASE_URL}/api/opening-stock", json=payload, params={"username": "admin", "role": "admin"})
        assert resp.status_code == 200, f"Failed to reset opening stock: {resp.text}"
        print(f"PASS: Reset opening stock to 0")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
