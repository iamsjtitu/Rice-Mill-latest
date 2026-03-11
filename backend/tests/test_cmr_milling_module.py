"""
Test suite for CMR (Custom Milled Rice) Milling Module - Phase 1
Tests: Milling entries CRUD, byproduct stock/sales, paddy stock calculation
Business Logic: 
- Paddy comes from existing mill entries (Mill W. QNTL)
- FRK is purchased separately (NOT percentage-based)
- CMR Delivery = Rice + FRK
- husk_percent = 100 - (rice% + bran% + kunda% + broken% + kanki%)
- outturn_ratio = cmr_delivery_qntl / paddy * 100
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://rice-mill-mgmt.preview.emergentagent.com"

API_URL = f"{BASE_URL}/api"

# Test credentials
ADMIN_USER = "admin"
ADMIN_PASS = "admin123"


class TestCMRMillingAuth:
    """Verify authentication before milling tests"""
    
    def test_admin_login(self):
        """Admin can login successfully"""
        response = requests.post(f"{API_URL}/auth/login", json={
            "username": ADMIN_USER,
            "password": ADMIN_PASS
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert data["success"] == True
        assert data["role"] == "admin"
        print("✓ Admin login successful")


class TestPaddyStock:
    """Test paddy stock calculation from mill entries"""
    
    def test_get_paddy_stock(self):
        """GET /api/paddy-stock returns correct fields"""
        response = requests.get(f"{API_URL}/paddy-stock")
        assert response.status_code == 200, f"Paddy stock failed: {response.text}"
        
        data = response.json()
        # Verify structure
        assert "total_paddy_in_qntl" in data, "Missing total_paddy_in_qntl"
        assert "total_paddy_used_qntl" in data, "Missing total_paddy_used_qntl"
        assert "available_paddy_qntl" in data, "Missing available_paddy_qntl"
        
        # Verify available = in - used
        expected_available = round(data["total_paddy_in_qntl"] - data["total_paddy_used_qntl"], 2)
        assert data["available_paddy_qntl"] == expected_available, \
            f"Available mismatch: {data['available_paddy_qntl']} != {expected_available}"
        
        print(f"✓ Paddy stock: In={data['total_paddy_in_qntl']} Q, Used={data['total_paddy_used_qntl']} Q, Available={data['available_paddy_qntl']} Q")
    
    def test_paddy_stock_with_filters(self):
        """Paddy stock respects kms_year and season filters"""
        response = requests.get(f"{API_URL}/paddy-stock?kms_year=2025-26&season=Kharif")
        assert response.status_code == 200
        print("✓ Paddy stock with filters works")


class TestMillingEntryCRUD:
    """Test milling entry CRUD with auto-calculations (FRK purchased separately)"""
    
    created_entry_id = None
    
    def test_create_milling_entry_auto_calculations(self):
        """POST /api/milling-entries - verify all auto-calculated fields"""
        payload = {
            "date": "2026-01-20",
            "rice_type": "parboiled",
            "paddy_input_qntl": 100,
            "rice_percent": 52,
            "bran_percent": 5,
            "kunda_percent": 3,
            "broken_percent": 2,
            "kanki_percent": 1,
            # FRK is purchased separately - NOT percentage!
            "frk_purchased_qntl": 15,
            "frk_purchase_rate": 2500,
            "kms_year": "2025-26",
            "season": "Kharif",
            "note": "TEST_CMR_auto_calc"
        }
        
        response = requests.post(
            f"{API_URL}/milling-entries?username={ADMIN_USER}&role=admin",
            json=payload
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        TestMillingEntryCRUD.created_entry_id = data["id"]
        
        # Verify husk_percent = 100 - (52+5+3+2+1) = 37
        assert data["husk_percent"] == 37, f"Husk% should be 37, got {data['husk_percent']}"
        
        # Verify QNTL calculations
        assert data["rice_qntl"] == 52, f"Rice QNTL should be 52, got {data['rice_qntl']}"
        assert data["bran_qntl"] == 5, f"Bran QNTL should be 5, got {data['bran_qntl']}"
        assert data["kunda_qntl"] == 3, f"Kunda QNTL should be 3, got {data['kunda_qntl']}"
        assert data["broken_qntl"] == 2, f"Broken QNTL should be 2, got {data['broken_qntl']}"
        assert data["kanki_qntl"] == 1, f"Kanki QNTL should be 1, got {data['kanki_qntl']}"
        assert data["husk_qntl"] == 37, f"Husk QNTL should be 37, got {data['husk_qntl']}"
        
        # Verify FRK total cost = qty * rate = 15 * 2500 = 37500
        assert data["frk_total_cost"] == 37500, f"FRK cost should be 37500, got {data['frk_total_cost']}"
        
        # Verify CMR delivery = rice + FRK = 52 + 15 = 67
        assert data["cmr_delivery_qntl"] == 67, f"CMR should be 67, got {data['cmr_delivery_qntl']}"
        
        # Verify outturn_ratio = cmr / paddy * 100 = 67 / 100 * 100 = 67
        assert data["outturn_ratio"] == 67, f"Outturn should be 67%, got {data['outturn_ratio']}"
        
        print(f"✓ Created entry {data['id']} with correct auto-calculations")
        print(f"  Husk%={data['husk_percent']}, CMR={data['cmr_delivery_qntl']}Q, Outturn={data['outturn_ratio']}%")
    
    def test_get_milling_entries_list(self):
        """GET /api/milling-entries - returns list"""
        response = requests.get(f"{API_URL}/milling-entries")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Milling entries list: {len(data)} entries")
    
    def test_filter_by_rice_type(self):
        """GET /api/milling-entries?rice_type=parboiled"""
        response = requests.get(f"{API_URL}/milling-entries?rice_type=parboiled")
        assert response.status_code == 200
        
        data = response.json()
        for entry in data:
            assert entry["rice_type"] == "parboiled"
        print(f"✓ Rice type filter works: {len(data)} parboiled entries")
    
    def test_filter_by_date_range(self):
        """GET /api/milling-entries with date_from and date_to"""
        response = requests.get(
            f"{API_URL}/milling-entries?date_from=2026-01-01&date_to=2026-12-31"
        )
        assert response.status_code == 200
        print("✓ Date range filter works")
    
    def test_get_single_entry(self):
        """GET /api/milling-entries/{id}"""
        if not TestMillingEntryCRUD.created_entry_id:
            pytest.skip("No entry created")
        
        entry_id = TestMillingEntryCRUD.created_entry_id
        response = requests.get(f"{API_URL}/milling-entries/{entry_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["id"] == entry_id
        print(f"✓ Get single entry works: {entry_id}")
    
    def test_get_nonexistent_entry_404(self):
        """GET non-existent entry returns 404"""
        response = requests.get(f"{API_URL}/milling-entries/non-existent-id-xyz")
        assert response.status_code == 404
        print("✓ 404 for non-existent entry")
    
    def test_update_milling_entry_recalculates(self):
        """PUT /api/milling-entries/{id} - recalculates all fields"""
        if not TestMillingEntryCRUD.created_entry_id:
            pytest.skip("No entry created")
        
        entry_id = TestMillingEntryCRUD.created_entry_id
        
        update_payload = {
            "date": "2026-01-20",
            "rice_type": "parboiled",
            "paddy_input_qntl": 200,  # Changed from 100 to 200
            "rice_percent": 55,  # Changed from 52 to 55
            "bran_percent": 5,
            "kunda_percent": 3,
            "broken_percent": 2,
            "kanki_percent": 1,
            "frk_purchased_qntl": 20,  # Changed from 15 to 20
            "frk_purchase_rate": 2600,  # Changed rate
            "kms_year": "2025-26",
            "season": "Kharif",
            "note": "TEST_CMR_updated"
        }
        
        response = requests.put(
            f"{API_URL}/milling-entries/{entry_id}?username={ADMIN_USER}&role=admin",
            json=update_payload
        )
        assert response.status_code == 200, f"Update failed: {response.text}"
        
        data = response.json()
        
        # Verify husk = 100 - (55+5+3+2+1) = 34
        assert data["husk_percent"] == 34, f"Updated husk% should be 34, got {data['husk_percent']}"
        
        # Verify rice_qntl = 200 * 55% = 110
        assert data["rice_qntl"] == 110, f"Updated rice QNTL should be 110, got {data['rice_qntl']}"
        
        # Verify FRK cost = 20 * 2600 = 52000
        assert data["frk_total_cost"] == 52000, f"Updated FRK cost should be 52000, got {data['frk_total_cost']}"
        
        # Verify CMR = 110 + 20 = 130
        assert data["cmr_delivery_qntl"] == 130, f"Updated CMR should be 130, got {data['cmr_delivery_qntl']}"
        
        # Verify outturn = 130 / 200 * 100 = 65
        assert data["outturn_ratio"] == 65, f"Updated outturn should be 65%, got {data['outturn_ratio']}"
        
        print(f"✓ Updated entry recalculates correctly: CMR={data['cmr_delivery_qntl']}Q, Outturn={data['outturn_ratio']}%")


class TestMillingSummary:
    """Test milling summary aggregation"""
    
    def test_get_milling_summary(self):
        """GET /api/milling-summary returns aggregated data"""
        response = requests.get(f"{API_URL}/milling-summary")
        assert response.status_code == 200, f"Summary failed: {response.text}"
        
        data = response.json()
        
        # Verify structure
        required_fields = [
            "total_entries", "total_paddy_qntl", "total_rice_qntl",
            "total_frk_qntl", "total_cmr_qntl", "total_frk_cost",
            "avg_outturn_ratio", "parboiled", "raw"
        ]
        for field in required_fields:
            assert field in data, f"Missing {field} in summary"
        
        # Verify parboiled/raw breakdown
        assert "count" in data["parboiled"]
        assert "avg_outturn" in data["parboiled"]
        assert "count" in data["raw"]
        
        print(f"✓ Milling summary: {data['total_entries']} entries, Paddy={data['total_paddy_qntl']}Q, CMR={data['total_cmr_qntl']}Q")
        print(f"  Parboiled: {data['parboiled']['count']} entries, Raw: {data['raw']['count']} entries")
    
    def test_summary_with_filters(self):
        """Summary respects kms_year filter"""
        response = requests.get(f"{API_URL}/milling-summary?kms_year=2025-26&season=Kharif")
        assert response.status_code == 200
        print("✓ Summary with filters works")


class TestByProductStock:
    """Test byproduct stock calculation"""
    
    def test_get_byproduct_stock(self):
        """GET /api/byproduct-stock returns all products"""
        response = requests.get(f"{API_URL}/byproduct-stock")
        assert response.status_code == 200, f"Byproduct stock failed: {response.text}"
        
        data = response.json()
        
        # Verify all products exist
        products = ["bran", "kunda", "broken", "kanki", "husk"]
        for product in products:
            assert product in data, f"Missing {product} in byproduct stock"
            assert "produced_qntl" in data[product]
            assert "sold_qntl" in data[product]
            assert "available_qntl" in data[product]
            assert "total_revenue" in data[product]
            
            # Verify available = produced - sold
            expected_available = round(data[product]["produced_qntl"] - data[product]["sold_qntl"], 2)
            assert data[product]["available_qntl"] == expected_available, \
                f"{product} available mismatch: {data[product]['available_qntl']} != {expected_available}"
        
        print(f"✓ Byproduct stock for all 5 products")
        for p in products:
            print(f"  {p}: produced={data[p]['produced_qntl']}Q, available={data[p]['available_qntl']}Q")


class TestByProductSales:
    """Test byproduct sales CRUD"""
    
    created_sale_id = None
    
    def test_create_byproduct_sale(self):
        """POST /api/byproduct-sales with auto total_amount"""
        payload = {
            "date": "2026-01-21",
            "product": "bran",
            "quantity_qntl": 2,
            "rate_per_qntl": 1500,
            "buyer_name": "TEST_buyer",
            "note": "TEST_bran_sale",
            "kms_year": "2025-26",
            "season": "Kharif"
        }
        
        response = requests.post(
            f"{API_URL}/byproduct-sales?username={ADMIN_USER}&role=admin",
            json=payload
        )
        assert response.status_code == 200, f"Create sale failed: {response.text}"
        
        data = response.json()
        TestByProductSales.created_sale_id = data["id"]
        
        # Verify auto total_amount = qty * rate = 2 * 1500 = 3000
        assert data["total_amount"] == 3000, f"Total amount should be 3000, got {data['total_amount']}"
        assert data["product"] == "bran"
        assert data["quantity_qntl"] == 2
        
        print(f"✓ Created sale: {data['id']}, total_amount=₹{data['total_amount']}")
    
    def test_get_byproduct_sales_list(self):
        """GET /api/byproduct-sales returns list"""
        response = requests.get(f"{API_URL}/byproduct-sales")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Byproduct sales list: {len(data)} sales")
    
    def test_sales_filter_by_product(self):
        """GET /api/byproduct-sales?product=bran"""
        response = requests.get(f"{API_URL}/byproduct-sales?product=bran")
        assert response.status_code == 200
        
        data = response.json()
        for sale in data:
            assert sale["product"] == "bran"
        print(f"✓ Product filter works: {len(data)} bran sales")
    
    def test_stock_updates_after_sale(self):
        """Verify byproduct stock shows sold quantity"""
        response = requests.get(f"{API_URL}/byproduct-stock")
        assert response.status_code == 200
        
        data = response.json()
        # Bran sold_qntl should include our 2 QNTL sale
        assert data["bran"]["sold_qntl"] >= 2, "Bran sold should include our sale"
        print(f"✓ Stock updated after sale: bran sold={data['bran']['sold_qntl']}Q")


class TestCleanup:
    """Cleanup test data"""
    
    def test_delete_byproduct_sale(self):
        """DELETE /api/byproduct-sales/{id}"""
        if not TestByProductSales.created_sale_id:
            pytest.skip("No sale to delete")
        
        sale_id = TestByProductSales.created_sale_id
        response = requests.delete(
            f"{API_URL}/byproduct-sales/{sale_id}?username={ADMIN_USER}&role=admin"
        )
        assert response.status_code == 200, f"Delete sale failed: {response.text}"
        print(f"✓ Deleted sale: {sale_id}")
    
    def test_delete_milling_entry(self):
        """DELETE /api/milling-entries/{id}"""
        if not TestMillingEntryCRUD.created_entry_id:
            pytest.skip("No entry to delete")
        
        entry_id = TestMillingEntryCRUD.created_entry_id
        response = requests.delete(
            f"{API_URL}/milling-entries/{entry_id}?username={ADMIN_USER}&role=admin"
        )
        assert response.status_code == 200, f"Delete entry failed: {response.text}"
        print(f"✓ Deleted entry: {entry_id}")
    
    def test_delete_nonexistent_entry_404(self):
        """DELETE non-existent returns 404"""
        response = requests.delete(
            f"{API_URL}/milling-entries/non-existent-xyz?username={ADMIN_USER}&role=admin"
        )
        assert response.status_code == 404
        print("✓ 404 for deleting non-existent entry")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
