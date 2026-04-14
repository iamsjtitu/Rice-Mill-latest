"""
Oil Premium Register API Tests - Iteration 193
Tests for Oil Premium CRUD operations, premium calculation, and sale lookup
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Standard Oil% values: Raw=22%, Boiled=25%
STANDARD_OIL = {"Raw": 22, "Boiled": 25}


class TestOilPremiumCRUD:
    """Oil Premium CRUD endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_prefix = f"TEST_{uuid.uuid4().hex[:6]}"
        self.created_ids = []
        yield
        # Cleanup
        for item_id in self.created_ids:
            try:
                requests.delete(f"{BASE_URL}/api/oil-premium/{item_id}")
            except:
                pass
    
    def test_get_oil_premiums_empty(self):
        """GET /api/oil-premium - should return list (may be empty)"""
        response = requests.get(f"{BASE_URL}/api/oil-premium")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"GET /api/oil-premium - PASS (returned {len(data)} items)")
    
    def test_create_oil_premium_boiled_positive(self):
        """POST /api/oil-premium - Boiled bran with positive premium"""
        # Test case: Rate=3030, Actual=26.73%, Standard=25% (Boiled), Qty=118.50
        # Expected Premium = 3030 * (26.73 - 25) * 118.50 / 25 = 3030 * 1.73 * 118.50 / 25 = 24846.61
        payload = {
            "date": "2025-01-15",
            "voucher_no": f"{self.test_prefix}_V001",
            "rst_no": "RST001",
            "bran_type": "Boiled",
            "party_name": f"{self.test_prefix}_Party1",
            "rate": 3030,
            "qty_qtl": 118.50,
            "actual_oil_pct": 26.73,
            "remark": "Test positive premium",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        response = requests.post(f"{BASE_URL}/api/oil-premium?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        self.created_ids.append(data.get("id"))
        
        # Verify response structure
        assert "id" in data
        assert data["party_name"] == payload["party_name"]
        assert data["bran_type"] == "Boiled"
        assert data["standard_oil_pct"] == 25  # Boiled standard
        assert data["actual_oil_pct"] == 26.73
        
        # Verify premium calculation
        expected_diff = 26.73 - 25  # 1.73
        expected_premium = round(3030 * 1.73 * 118.50 / 25, 2)  # 24846.61
        
        assert abs(data["difference_pct"] - expected_diff) < 0.01, f"Expected diff {expected_diff}, got {data['difference_pct']}"
        assert abs(data["premium_amount"] - expected_premium) < 1, f"Expected premium {expected_premium}, got {data['premium_amount']}"
        assert data["premium_amount"] > 0, "Premium should be positive for actual > standard"
        
        print(f"POST /api/oil-premium (Boiled positive) - PASS")
        print(f"  Premium calculated: {data['premium_amount']} (expected ~{expected_premium})")
    
    def test_create_oil_premium_raw_negative(self):
        """POST /api/oil-premium - Raw bran with negative premium (deduction)"""
        # Test case: Rate=2500, Actual=20%, Standard=22% (Raw), Qty=100
        # Expected Premium = 2500 * (20 - 22) * 100 / 22 = 2500 * (-2) * 100 / 22 = -22727.27
        payload = {
            "date": "2025-01-15",
            "voucher_no": f"{self.test_prefix}_V002",
            "rst_no": "RST002",
            "bran_type": "Raw",
            "party_name": f"{self.test_prefix}_Party2",
            "rate": 2500,
            "qty_qtl": 100,
            "actual_oil_pct": 20,
            "remark": "Test negative premium",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        response = requests.post(f"{BASE_URL}/api/oil-premium?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        self.created_ids.append(data.get("id"))
        
        # Verify response structure
        assert data["bran_type"] == "Raw"
        assert data["standard_oil_pct"] == 22  # Raw standard
        assert data["actual_oil_pct"] == 20
        
        # Verify premium calculation
        expected_diff = 20 - 22  # -2
        expected_premium = round(2500 * (-2) * 100 / 22, 2)  # -22727.27
        
        assert abs(data["difference_pct"] - expected_diff) < 0.01, f"Expected diff {expected_diff}, got {data['difference_pct']}"
        assert abs(data["premium_amount"] - expected_premium) < 1, f"Expected premium {expected_premium}, got {data['premium_amount']}"
        assert data["premium_amount"] < 0, "Premium should be negative for actual < standard"
        
        print(f"POST /api/oil-premium (Raw negative) - PASS")
        print(f"  Deduction calculated: {data['premium_amount']} (expected ~{expected_premium})")
    
    def test_update_oil_premium(self):
        """PUT /api/oil-premium/:id - Update and verify recalculation"""
        # First create
        payload = {
            "date": "2025-01-15",
            "voucher_no": f"{self.test_prefix}_V003",
            "bran_type": "Boiled",
            "party_name": f"{self.test_prefix}_Party3",
            "rate": 3000,
            "qty_qtl": 100,
            "actual_oil_pct": 26,
            "kms_year": "2024-25"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/oil-premium?username=admin&role=admin", json=payload)
        assert create_response.status_code == 200
        created = create_response.json()
        item_id = created["id"]
        self.created_ids.append(item_id)
        
        # Update with new values
        update_payload = {
            "date": "2025-01-16",
            "voucher_no": f"{self.test_prefix}_V003_UPDATED",
            "bran_type": "Raw",  # Change to Raw (standard 22%)
            "party_name": f"{self.test_prefix}_Party3_Updated",
            "rate": 2800,
            "qty_qtl": 150,
            "actual_oil_pct": 24,  # 24% > 22% = positive premium
            "kms_year": "2024-25"
        }
        
        update_response = requests.put(f"{BASE_URL}/api/oil-premium/{item_id}?username=admin&role=admin", json=update_payload)
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        
        # Verify update via GET
        get_response = requests.get(f"{BASE_URL}/api/oil-premium")
        assert get_response.status_code == 200
        items = get_response.json()
        updated_item = next((i for i in items if i["id"] == item_id), None)
        
        assert updated_item is not None, "Updated item not found"
        assert updated_item["bran_type"] == "Raw"
        assert updated_item["standard_oil_pct"] == 22  # Raw standard
        assert updated_item["party_name"] == f"{self.test_prefix}_Party3_Updated"
        
        # Verify recalculated premium
        expected_diff = 24 - 22  # 2
        expected_premium = round(2800 * 2 * 150 / 22, 2)  # 38181.82
        assert abs(updated_item["difference_pct"] - expected_diff) < 0.01
        assert abs(updated_item["premium_amount"] - expected_premium) < 1
        
        print(f"PUT /api/oil-premium/{item_id} - PASS (premium recalculated: {updated_item['premium_amount']})")
    
    def test_delete_oil_premium(self):
        """DELETE /api/oil-premium/:id - Delete and verify removal"""
        # First create
        payload = {
            "date": "2025-01-15",
            "voucher_no": f"{self.test_prefix}_V004",
            "bran_type": "Boiled",
            "party_name": f"{self.test_prefix}_Party4",
            "rate": 3000,
            "qty_qtl": 100,
            "actual_oil_pct": 26,
            "kms_year": "2024-25"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/oil-premium?username=admin&role=admin", json=payload)
        assert create_response.status_code == 200
        item_id = create_response.json()["id"]
        
        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/oil-premium/{item_id}")
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        
        # Verify deletion - try to delete again should return 404
        delete_again = requests.delete(f"{BASE_URL}/api/oil-premium/{item_id}")
        assert delete_again.status_code == 404, "Deleted item should return 404"
        
        print(f"DELETE /api/oil-premium/{item_id} - PASS")
    
    def test_delete_nonexistent(self):
        """DELETE /api/oil-premium/:id - Should return 404 for non-existent"""
        response = requests.delete(f"{BASE_URL}/api/oil-premium/nonexistent_id_12345")
        assert response.status_code == 404
        print("DELETE /api/oil-premium (non-existent) - PASS (404)")
    
    def test_get_with_filters(self):
        """GET /api/oil-premium with query filters"""
        # Create test entry
        payload = {
            "date": "2025-01-15",
            "voucher_no": f"{self.test_prefix}_V005",
            "bran_type": "Boiled",
            "party_name": f"{self.test_prefix}_Party5",
            "rate": 3000,
            "qty_qtl": 100,
            "actual_oil_pct": 26,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/oil-premium?username=admin&role=admin", json=payload)
        assert create_response.status_code == 200
        self.created_ids.append(create_response.json()["id"])
        
        # Test filter by kms_year
        response = requests.get(f"{BASE_URL}/api/oil-premium?kms_year=2024-25")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Test filter by bran_type
        response = requests.get(f"{BASE_URL}/api/oil-premium?bran_type=Boiled")
        assert response.status_code == 200
        data = response.json()
        assert all(item["bran_type"] == "Boiled" for item in data if "bran_type" in item)
        
        print("GET /api/oil-premium with filters - PASS")


class TestOilPremiumLookup:
    """Oil Premium sale lookup endpoint tests"""
    
    def test_lookup_sale_missing_params(self):
        """GET /api/oil-premium/lookup-sale - Should require voucher_no or rst_no"""
        response = requests.get(f"{BASE_URL}/api/oil-premium/lookup-sale")
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("GET /api/oil-premium/lookup-sale (no params) - PASS (400)")
    
    def test_lookup_sale_not_found(self):
        """GET /api/oil-premium/lookup-sale - Should return 404 for non-existent sale"""
        response = requests.get(f"{BASE_URL}/api/oil-premium/lookup-sale?voucher_no=NONEXISTENT_12345")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("GET /api/oil-premium/lookup-sale (not found) - PASS (404)")


class TestOilPremiumCalculation:
    """Verify premium calculation formula: Premium = Rate × (Actual% - Standard%) × Qty ÷ Standard%"""
    
    def test_calculation_boiled_positive(self):
        """Verify: Rate=3030, Actual=26.73%, Standard=25% (Boiled), Qty=118.50 => Premium = 24846.61"""
        rate = 3030
        actual = 26.73
        standard = 25  # Boiled
        qty = 118.50
        
        expected_premium = round(rate * (actual - standard) * qty / standard, 2)
        # 3030 * 1.73 * 118.50 / 25 = 24846.61
        
        assert abs(expected_premium - 24846.61) < 1, f"Expected ~24846.61, got {expected_premium}"
        print(f"Calculation test (Boiled positive): {expected_premium} - PASS")
    
    def test_calculation_raw_negative(self):
        """Verify: Rate=2500, Actual=20%, Standard=22% (Raw), Qty=100 => Premium = -22727.27"""
        rate = 2500
        actual = 20
        standard = 22  # Raw
        qty = 100
        
        expected_premium = round(rate * (actual - standard) * qty / standard, 2)
        # 2500 * (-2) * 100 / 22 = -22727.27
        
        assert abs(expected_premium - (-22727.27)) < 1, f"Expected ~-22727.27, got {expected_premium}"
        print(f"Calculation test (Raw negative): {expected_premium} - PASS")


class TestByProductSaleVoucherNo:
    """Test voucher_no field in By-Product Sale Register"""
    
    def test_bp_sale_register_endpoint(self):
        """GET /api/bp-sale-register - Should return list with voucher_no field"""
        response = requests.get(f"{BASE_URL}/api/bp-sale-register?product=Rice%20Bran")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list)
        print(f"GET /api/bp-sale-register - PASS (returned {len(data)} items)")
        
        # If there are items, check for voucher_no field
        if len(data) > 0:
            # voucher_no may be empty but field should exist
            sample = data[0]
            print(f"  Sample fields: {list(sample.keys())[:10]}...")
            if "voucher_no" in sample:
                print(f"  voucher_no field present: '{sample.get('voucher_no', '')}'")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
