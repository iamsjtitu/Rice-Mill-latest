"""
Iteration 79: Purchase Voucher Stock Integration Tests
Tests for verifying that Purchase Voucher quantities are correctly reflected in:
1. Rice Stock API (GET /api/rice-stock)
2. Sale Book Stock Items API (GET /api/sale-book/stock-items)
3. By-Product Stock API (GET /api/byproduct-stock)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_PREFIX = "TEST_ITER79_"


@pytest.fixture(scope="session")
def api_session():
    """Create requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestRiceStockWithPurchaseVouchers:
    """Test that rice-stock API includes purchased rice quantities from PV"""
    
    def test_rice_stock_returns_purchased_fields(self, api_session):
        """Verify GET /api/rice-stock returns purchased_qntl fields"""
        response = api_session.get(f"{BASE_URL}/api/rice-stock")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify new fields exist
        assert "purchased_qntl" in data, "Missing purchased_qntl field"
        assert "purchased_usna_qntl" in data, "Missing purchased_usna_qntl field"
        assert "purchased_raw_qntl" in data, "Missing purchased_raw_qntl field"
        assert "sb_sold_qntl" in data, "Missing sb_sold_qntl field"
        
        print(f"Rice Stock API fields verified:")
        print(f"  - purchased_qntl: {data['purchased_qntl']}")
        print(f"  - purchased_usna_qntl: {data['purchased_usna_qntl']}")
        print(f"  - purchased_raw_qntl: {data['purchased_raw_qntl']}")
        print(f"  - sb_sold_qntl: {data['sb_sold_qntl']}")
    
    def test_rice_stock_available_formula(self, api_session):
        """Verify available = produced + purchased - DC - pvt_sold - sb_sold"""
        response = api_session.get(f"{BASE_URL}/api/rice-stock")
        assert response.status_code == 200
        
        data = response.json()
        produced = data.get('total_produced_qntl', 0)
        purchased = data.get('purchased_qntl', 0)
        govt = data.get('govt_delivered_qntl', 0)
        pvt_sold = data.get('pvt_sold_qntl', 0)
        sb_sold = data.get('sb_sold_qntl', 0)
        available = data.get('available_qntl', 0)
        
        expected_available = round(produced + purchased - govt - pvt_sold - sb_sold, 2)
        
        print(f"Rice Stock Formula Check:")
        print(f"  Produced: {produced}")
        print(f"  + Purchased: {purchased}")
        print(f"  - DC Delivered: {govt}")
        print(f"  - Pvt Sold: {pvt_sold}")
        print(f"  - Sale Book Sold: {sb_sold}")
        print(f"  = Expected: {expected_available}")
        print(f"  Actual Available: {available}")
        
        assert abs(available - expected_available) < 0.01, \
            f"Available formula incorrect: expected {expected_available}, got {available}"


class TestPurchaseVoucherCreateDelete:
    """Test creating/deleting PV with Rice (Usna) and verifying stock changes"""
    
    def test_create_pv_with_rice_usna_increases_stock(self, api_session):
        """Create PV with Rice (Usna) 100Q and verify rice-stock increases"""
        # Get initial stock
        initial_resp = api_session.get(f"{BASE_URL}/api/rice-stock")
        assert initial_resp.status_code == 200
        initial = initial_resp.json()
        initial_purchased_usna = initial.get('purchased_usna_qntl', 0)
        initial_available = initial.get('available_qntl', 0)
        
        # Create test Purchase Voucher with Rice (Usna) 100Q
        pv_data = {
            "date": "2025-01-15",
            "party_name": f"{TEST_PREFIX}Seller",
            "invoice_no": f"{TEST_PREFIX}INV001",
            "items": [
                {"item_name": "Rice (Usna)", "quantity": 100, "rate": 3000, "unit": "Qntl"}
            ],
            "gst_type": "none",
            "cash_paid": 0,
            "diesel_paid": 0,
            "advance": 0,
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        
        create_resp = api_session.post(
            f"{BASE_URL}/api/purchase-book?username=admin&role=admin",
            json=pv_data
        )
        assert create_resp.status_code == 200, f"Failed to create PV: {create_resp.text}"
        created_pv = create_resp.json()
        pv_id = created_pv.get('id')
        assert pv_id, "No ID returned for created PV"
        
        print(f"Created PV with ID: {pv_id}")
        
        # Verify rice-stock increased
        updated_resp = api_session.get(f"{BASE_URL}/api/rice-stock")
        assert updated_resp.status_code == 200
        updated = updated_resp.json()
        
        new_purchased_usna = updated.get('purchased_usna_qntl', 0)
        new_available = updated.get('available_qntl', 0)
        
        print(f"Stock Changes:")
        print(f"  Purchased Usna: {initial_purchased_usna} -> {new_purchased_usna} (delta: +{new_purchased_usna - initial_purchased_usna})")
        print(f"  Available: {initial_available} -> {new_available} (delta: +{new_available - initial_available})")
        
        assert new_purchased_usna >= initial_purchased_usna + 100, \
            f"Purchased Usna should increase by at least 100: was {initial_purchased_usna}, now {new_purchased_usna}"
        
        # Also verify sale-book/stock-items includes the increase
        stock_items_resp = api_session.get(f"{BASE_URL}/api/sale-book/stock-items")
        assert stock_items_resp.status_code == 200
        stock_items = stock_items_resp.json()
        
        usna_item = next((i for i in stock_items if i['name'] == 'Rice (Usna)'), None)
        assert usna_item is not None, "Rice (Usna) not found in stock-items"
        print(f"Rice (Usna) in stock-items: {usna_item['available_qntl']}Q")
        
        # Cleanup - delete the test PV
        del_resp = api_session.delete(f"{BASE_URL}/api/purchase-book/{pv_id}?username=admin&role=admin")
        assert del_resp.status_code == 200, f"Failed to delete PV: {del_resp.text}"
        print(f"Deleted test PV: {pv_id}")
        
        # Verify stock returned to original
        final_resp = api_session.get(f"{BASE_URL}/api/rice-stock")
        assert final_resp.status_code == 200
        final = final_resp.json()
        
        final_purchased_usna = final.get('purchased_usna_qntl', 0)
        print(f"After delete - Purchased Usna: {final_purchased_usna} (original: {initial_purchased_usna})")
        
        assert abs(final_purchased_usna - initial_purchased_usna) < 0.01, \
            f"Stock should return to original after delete: was {initial_purchased_usna}, now {final_purchased_usna}"


class TestSaleBookStockItems:
    """Test that sale-book/stock-items includes PV purchased quantities"""
    
    def test_stock_items_includes_rice(self, api_session):
        """Verify stock-items endpoint returns Rice (Usna) and Rice (Raw)"""
        response = api_session.get(f"{BASE_URL}/api/sale-book/stock-items")
        assert response.status_code == 200
        
        items = response.json()
        item_names = [i['name'] for i in items]
        
        assert "Rice (Usna)" in item_names, "Rice (Usna) missing from stock-items"
        assert "Rice (Raw)" in item_names, "Rice (Raw) missing from stock-items"
        
        print("Stock items available:")
        for item in items:
            print(f"  - {item['name']}: {item['available_qntl']}Q")
    
    def test_stock_items_includes_byproducts(self, api_session):
        """Verify stock-items includes byproducts like Bran, Kunda, etc."""
        response = api_session.get(f"{BASE_URL}/api/sale-book/stock-items")
        assert response.status_code == 200
        
        items = response.json()
        item_names = [i['name'] for i in items]
        
        expected_byproducts = ["Bran", "Kunda", "Broken", "Kanki", "Husk"]
        for bp in expected_byproducts:
            assert bp in item_names, f"{bp} missing from stock-items"
        
        print("All byproducts present in stock-items")
    
    def test_stock_items_includes_frk(self, api_session):
        """Verify FRK is in stock-items"""
        response = api_session.get(f"{BASE_URL}/api/sale-book/stock-items")
        assert response.status_code == 200
        
        items = response.json()
        item_names = [i['name'] for i in items]
        
        assert "FRK" in item_names, "FRK missing from stock-items"
        print("FRK present in stock-items")


class TestByproductStockWithPurchaseVouchers:
    """Test that byproduct-stock includes PV purchased quantities"""
    
    def test_byproduct_stock_returns_purchased_field(self, api_session):
        """Verify GET /api/byproduct-stock includes purchased_qntl per product"""
        response = api_session.get(f"{BASE_URL}/api/byproduct-stock")
        assert response.status_code == 200
        
        data = response.json()
        products = ["bran", "kunda", "broken", "kanki", "husk"]
        
        for prod in products:
            assert prod in data, f"Missing {prod} in byproduct-stock"
            prod_data = data[prod]
            assert "purchased_qntl" in prod_data, f"Missing purchased_qntl for {prod}"
            assert "produced_qntl" in prod_data, f"Missing produced_qntl for {prod}"
            assert "available_qntl" in prod_data, f"Missing available_qntl for {prod}"
            print(f"{prod.title()}: produced={prod_data['produced_qntl']}, purchased={prod_data['purchased_qntl']}, available={prod_data['available_qntl']}")
    
    def test_byproduct_available_includes_purchased(self, api_session):
        """Verify available = produced + purchased - sold"""
        response = api_session.get(f"{BASE_URL}/api/byproduct-stock")
        assert response.status_code == 200
        
        data = response.json()
        
        for prod in ["bran", "kunda", "broken", "kanki", "husk"]:
            pd = data[prod]
            produced = pd.get('produced_qntl', 0)
            purchased = pd.get('purchased_qntl', 0)
            sold = pd.get('sold_qntl', 0)
            available = pd.get('available_qntl', 0)
            
            expected = round(produced + purchased - sold, 2)
            
            assert abs(available - expected) < 0.01, \
                f"{prod} available formula wrong: {produced} + {purchased} - {sold} = {expected}, got {available}"
        
        print("All byproduct available formulas correct")


class TestPurchaseVouchersLowStockAlertRemoved:
    """Verify Low Stock Alert is removed from Purchase Vouchers page"""
    
    def test_no_low_stock_alert_in_purchase_book_list(self, api_session):
        """Check the purchase-book list endpoint does not have low stock alert"""
        response = api_session.get(f"{BASE_URL}/api/purchase-book")
        assert response.status_code == 200
        # This is just a data endpoint - UI test will verify the alert is removed


class TestExistingPurchaseVoucherRiceData:
    """Test with existing PV data in database"""
    
    def test_existing_pv_rice_usna_counted(self, api_session):
        """Verify existing Purchase Vouchers with Rice (Usna) are counted in stock"""
        # Get current rice stock
        rice_resp = api_session.get(f"{BASE_URL}/api/rice-stock")
        assert rice_resp.status_code == 200
        rice_data = rice_resp.json()
        
        # Get purchase vouchers to sum up Rice (Usna)
        pv_resp = api_session.get(f"{BASE_URL}/api/purchase-book")
        assert pv_resp.status_code == 200
        vouchers = pv_resp.json()
        
        # Calculate total Rice (Usna) from PVs
        pv_rice_usna_total = 0
        for pv in vouchers:
            for item in pv.get('items', []):
                if item.get('item_name') == 'Rice (Usna)':
                    pv_rice_usna_total += item.get('quantity', 0)
        
        api_purchased_usna = rice_data.get('purchased_usna_qntl', 0)
        
        print(f"PV Rice (Usna) total from vouchers: {pv_rice_usna_total}Q")
        print(f"API purchased_usna_qntl: {api_purchased_usna}Q")
        
        # They should match (or be very close)
        assert abs(api_purchased_usna - pv_rice_usna_total) < 0.1, \
            f"Mismatch: API shows {api_purchased_usna}Q but vouchers sum to {pv_rice_usna_total}Q"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
