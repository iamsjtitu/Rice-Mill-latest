"""
Test iteration 109: Branding Custom Fields, FY Settings, Opening Stock APIs
Features:
- GET/PUT /api/branding with custom_fields array (max 6 fields, label/value/position)
- GET/PUT /api/fy-settings with financial_year alongside active_fy
- GET/PUT /api/opening-stock with 8 stock item types
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from environment
USERNAME = os.environ.get('TEST_ADMIN_USERNAME', 'admin')
PASSWORD = os.environ.get('TEST_ADMIN_PASSWORD', 'admin123')


class TestBrandingAPI:
    """Test branding endpoints with custom_fields"""

    def test_get_branding_returns_custom_fields_array(self):
        """GET /api/branding should return custom_fields array"""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "company_name" in data, "Response should have company_name"
        assert "custom_fields" in data, "Response should have custom_fields array"
        assert isinstance(data["custom_fields"], list), "custom_fields should be a list"
        print(f"✓ GET /api/branding returns custom_fields: {len(data['custom_fields'])} fields")

    def test_put_branding_saves_custom_fields(self):
        """PUT /api/branding should save custom_fields with validation"""
        test_fields = [
            {"label": "GST No", "value": "TEST123456789", "position": "left"},
            {"label": "Phone", "value": "9876543210", "position": "center"},
            {"label": "Address", "value": "Test Address", "position": "right"}
        ]
        
        payload = {
            "company_name": "TEST COMPANY",
            "tagline": "Test Tagline",
            "custom_fields": test_fields
        }
        
        response = requests.put(
            f"{BASE_URL}/api/branding?username={USERNAME}&role=admin",
            json=payload
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Response should indicate success"
        assert "branding" in data, "Response should contain branding data"
        
        # Verify saved data
        saved = data["branding"]
        assert saved["company_name"] == "TEST COMPANY"
        assert len(saved["custom_fields"]) == 3
        print(f"✓ PUT /api/branding saved {len(saved['custom_fields'])} custom fields")

    def test_put_branding_validates_max_6_fields(self):
        """PUT /api/branding should limit to max 6 custom fields"""
        test_fields = [
            {"label": f"Field{i}", "value": f"Value{i}", "position": "center"}
            for i in range(10)  # Try to add 10 fields
        ]
        
        payload = {
            "company_name": "TEST COMPANY",
            "tagline": "Test",
            "custom_fields": test_fields
        }
        
        response = requests.put(
            f"{BASE_URL}/api/branding?username={USERNAME}&role=admin",
            json=payload
        )
        assert response.status_code == 200
        
        data = response.json()
        saved_fields = data["branding"]["custom_fields"]
        assert len(saved_fields) <= 6, f"Should limit to 6 fields, got {len(saved_fields)}"
        print(f"✓ PUT /api/branding limits to max 6 fields (saved {len(saved_fields)})")

    def test_put_branding_validates_position(self):
        """PUT /api/branding should validate position (left/center/right)"""
        test_fields = [
            {"label": "Test", "value": "Value", "position": "invalid_position"}
        ]
        
        payload = {
            "company_name": "TEST",
            "tagline": "",
            "custom_fields": test_fields
        }
        
        response = requests.put(
            f"{BASE_URL}/api/branding?username={USERNAME}&role=admin",
            json=payload
        )
        assert response.status_code == 200
        
        data = response.json()
        saved_fields = data["branding"]["custom_fields"]
        # Invalid position should default to "center"
        if len(saved_fields) > 0:
            assert saved_fields[0]["position"] == "center", "Invalid position should default to center"
        print("✓ PUT /api/branding validates position field")

    def test_put_branding_requires_admin_role(self):
        """PUT /api/branding should require admin role"""
        response = requests.put(
            f"{BASE_URL}/api/branding?username=operator&role=operator",
            json={"company_name": "Test", "custom_fields": []}
        )
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}"
        print("✓ PUT /api/branding requires admin role")

    def test_get_branding_after_save(self):
        """GET /api/branding should return previously saved data"""
        # First save
        test_fields = [
            {"label": "GSTIN", "value": "22AAAAA0000A1Z5", "position": "left"},
            {"label": "Mobile", "value": "9999999999", "position": "right"}
        ]
        
        requests.put(
            f"{BASE_URL}/api/branding?username={USERNAME}&role=admin",
            json={"company_name": "NAVKAR AGRO", "tagline": "JOLKO, KESINGA", "custom_fields": test_fields}
        )
        
        # Then fetch
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["custom_fields"]) >= 2, "Should have saved custom fields"
        print(f"✓ GET /api/branding returns saved data with {len(data['custom_fields'])} fields")


class TestFYSettingsAPI:
    """Test FY Settings endpoints with financial_year"""

    def test_get_fy_settings_returns_financial_year(self):
        """GET /api/fy-settings should return financial_year alongside active_fy"""
        response = requests.get(f"{BASE_URL}/api/fy-settings")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "active_fy" in data, "Response should have active_fy (KMS year)"
        assert "financial_year" in data, "Response should have financial_year"
        print(f"✓ GET /api/fy-settings returns active_fy={data['active_fy']}, financial_year={data['financial_year']}")

    def test_put_fy_settings_saves_financial_year(self):
        """PUT /api/fy-settings should save financial_year"""
        payload = {
            "active_fy": "2025-2026",
            "season": "Kharif",
            "financial_year": "2025-2026"
        }
        
        response = requests.put(f"{BASE_URL}/api/fy-settings", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("active_fy") == "2025-2026"
        assert data.get("financial_year") == "2025-2026"
        print("✓ PUT /api/fy-settings saves financial_year")

    def test_get_fy_settings_after_save(self):
        """GET /api/fy-settings should return saved financial_year"""
        # Save first
        requests.put(f"{BASE_URL}/api/fy-settings", json={
            "active_fy": "2024-2025",
            "season": "Rabi",
            "financial_year": "2024-2025"
        })
        
        # Fetch
        response = requests.get(f"{BASE_URL}/api/fy-settings")
        assert response.status_code == 200
        
        data = response.json()
        assert data["active_fy"] == "2024-2025"
        assert data["financial_year"] == "2024-2025"
        print("✓ GET /api/fy-settings returns saved financial_year")


class TestOpeningStockAPI:
    """Test Opening Stock endpoints with 8 item types"""

    STOCK_ITEMS = ["paddy", "rice", "bran", "kunda", "broken", "kanki", "husk", "frk"]

    def test_get_opening_stock_returns_all_items(self):
        """GET /api/opening-stock should return stocks for all 8 item types"""
        response = requests.get(f"{BASE_URL}/api/opening-stock?kms_year=2025-2026")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "stocks" in data, "Response should have stocks object"
        
        stocks = data["stocks"]
        for item in self.STOCK_ITEMS:
            assert item in stocks, f"stocks should have {item}"
        print(f"✓ GET /api/opening-stock returns all 8 stock items: {list(stocks.keys())}")

    def test_put_opening_stock_saves_all_items(self):
        """PUT /api/opening-stock should save stock balances for all 8 items"""
        test_stocks = {item: (i + 1) * 100.5 for i, item in enumerate(self.STOCK_ITEMS)}
        
        payload = {
            "kms_year": "2025-2026",
            "financial_year": "2025-2026",
            "stocks": test_stocks
        }
        
        response = requests.put(
            f"{BASE_URL}/api/opening-stock?username={USERNAME}&role=admin",
            json=payload
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        assert "data" in data
        
        saved_stocks = data["data"]["stocks"]
        for item in self.STOCK_ITEMS:
            assert item in saved_stocks, f"Saved stocks should have {item}"
        print(f"✓ PUT /api/opening-stock saves all 8 stock items")

    def test_put_opening_stock_requires_admin(self):
        """PUT /api/opening-stock should require admin role"""
        response = requests.put(
            f"{BASE_URL}/api/opening-stock?username=operator&role=operator",
            json={"kms_year": "2025-2026", "stocks": {"paddy": 100}}
        )
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}"
        print("✓ PUT /api/opening-stock requires admin role")

    def test_get_opening_stock_by_kms_year(self):
        """GET /api/opening-stock should filter by kms_year"""
        # Save for specific year
        requests.put(
            f"{BASE_URL}/api/opening-stock?username={USERNAME}&role=admin",
            json={"kms_year": "2024-2025", "stocks": {"paddy": 500, "rice": 300}}
        )
        
        # Fetch for that year
        response = requests.get(f"{BASE_URL}/api/opening-stock?kms_year=2024-2025")
        assert response.status_code == 200
        
        data = response.json()
        assert data["kms_year"] == "2024-2025"
        assert data["stocks"]["paddy"] == 500
        print("✓ GET /api/opening-stock filters by kms_year")

    def test_opening_stock_handles_invalid_values(self):
        """PUT /api/opening-stock should handle invalid stock values gracefully"""
        payload = {
            "kms_year": "2025-2026",
            "stocks": {
                "paddy": "invalid",
                "rice": None,
                "bran": 100.5
            }
        }
        
        response = requests.put(
            f"{BASE_URL}/api/opening-stock?username={USERNAME}&role=admin",
            json=payload
        )
        assert response.status_code == 200
        
        data = response.json()
        saved_stocks = data["data"]["stocks"]
        # Invalid values should be converted to 0
        assert saved_stocks["paddy"] == 0, "Invalid string should become 0"
        assert saved_stocks["rice"] == 0, "None should become 0"
        assert saved_stocks["bran"] == 100.5, "Valid float should be preserved"
        print("✓ PUT /api/opening-stock handles invalid values gracefully")


class TestAuthLogin:
    """Test login to verify credentials work"""

    def test_admin_login(self):
        """Test admin login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": USERNAME,
            "password": PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        assert data.get("role") == "admin"
        print("✓ Admin login successful")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
