"""
Test carry-forward endpoint for opening stock
Tests the POST /api/opening-stock/carry-forward endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCarryForward:
    """Tests for opening stock carry-forward endpoint"""
    
    def test_login_admin(self):
        """Test admin login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert data.get("role") == "admin"
        print(f"✓ Admin login successful: {data}")
    
    def test_carry_forward_requires_admin_role(self):
        """Test carry-forward endpoint requires admin role"""
        # Test without role param - should fail
        response = requests.post(f"{BASE_URL}/api/opening-stock/carry-forward", json={
            "source_kms_year": "2024-2025",
            "target_kms_year": "2025-2026"
        })
        assert response.status_code == 403, f"Expected 403 without admin role, got {response.status_code}"
        print(f"✓ Carry-forward correctly requires admin role (403 without role)")
        
        # Test with staff role - should fail
        response = requests.post(f"{BASE_URL}/api/opening-stock/carry-forward?username=staff&role=staff", json={
            "source_kms_year": "2024-2025",
            "target_kms_year": "2025-2026"
        })
        assert response.status_code == 403, f"Expected 403 with staff role, got {response.status_code}"
        print(f"✓ Carry-forward correctly rejects staff role (403)")
    
    def test_carry_forward_requires_source_and_target(self):
        """Test carry-forward requires both source and target years"""
        # Missing target
        response = requests.post(f"{BASE_URL}/api/opening-stock/carry-forward?username=admin&role=admin", json={
            "source_kms_year": "2024-2025"
        })
        assert response.status_code == 400, f"Expected 400 without target, got {response.status_code}"
        print(f"✓ Carry-forward correctly requires target year (400)")
        
        # Missing source
        response = requests.post(f"{BASE_URL}/api/opening-stock/carry-forward?username=admin&role=admin", json={
            "target_kms_year": "2025-2026"
        })
        assert response.status_code == 400, f"Expected 400 without source, got {response.status_code}"
        print(f"✓ Carry-forward correctly requires source year (400)")
    
    def test_carry_forward_success(self):
        """Test carry-forward endpoint with valid params"""
        response = requests.post(f"{BASE_URL}/api/opening-stock/carry-forward?username=admin&role=admin", json={
            "source_kms_year": "2024-2025",
            "target_kms_year": "2025-2026",
            "target_financial_year": "2025-2026"
        })
        assert response.status_code == 200, f"Carry-forward failed: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert "data" in data
        assert data["data"].get("kms_year") == "2025-2026"
        assert "stocks" in data["data"]
        
        # Verify stocks structure has expected keys
        stocks = data["data"]["stocks"]
        expected_keys = ["paddy", "rice_usna", "rice_raw", "bran", "kunda", "broken", "kanki", "husk", "frk"]
        for key in expected_keys:
            assert key in stocks, f"Missing stock key: {key}"
        
        print(f"✓ Carry-forward successful: {data['message']}")
        print(f"  Stocks: {stocks}")
    
    def test_get_opening_stock_after_carry_forward(self):
        """Test GET opening stock returns carried-forward data"""
        response = requests.get(f"{BASE_URL}/api/opening-stock?kms_year=2025-2026")
        assert response.status_code == 200, f"GET opening stock failed: {response.text}"
        data = response.json()
        assert data.get("kms_year") == "2025-2026"
        assert "stocks" in data
        
        # Verify it has the auto_carried flag if it was carried forward
        if data.get("auto_carried"):
            assert data.get("carried_from") == "2024-2025"
            print(f"✓ Opening stock for 2025-2026 shows auto_carried=True, carried_from=2024-2025")
        
        print(f"✓ GET opening stock for 2025-2026: {data}")


class TestOpeningStockCRUD:
    """Tests for opening stock CRUD operations"""
    
    def test_get_opening_stock(self):
        """Test GET opening stock endpoint"""
        response = requests.get(f"{BASE_URL}/api/opening-stock?kms_year=2024-2025")
        assert response.status_code == 200
        data = response.json()
        assert "stocks" in data
        print(f"✓ GET opening stock: {data}")
    
    def test_put_opening_stock_requires_admin(self):
        """Test PUT opening stock requires admin role"""
        response = requests.put(f"{BASE_URL}/api/opening-stock", json={
            "kms_year": "2024-2025",
            "stocks": {"paddy": 100}
        })
        assert response.status_code == 403
        print(f"✓ PUT opening stock correctly requires admin role")
    
    def test_put_opening_stock_success(self):
        """Test PUT opening stock with admin role"""
        response = requests.put(f"{BASE_URL}/api/opening-stock?username=admin&role=admin", json={
            "kms_year": "2024-2025",
            "financial_year": "2024-2025",
            "stocks": {
                "paddy": 1000,
                "rice_usna": 500,
                "rice_raw": 200,
                "bran": 50,
                "kunda": 30,
                "broken": 20,
                "kanki": 10,
                "husk": 100,
                "frk": 25
            }
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        print(f"✓ PUT opening stock successful: {data}")


class TestFYSettings:
    """Tests for FY settings endpoints"""
    
    def test_get_fy_settings(self):
        """Test GET FY settings"""
        response = requests.get(f"{BASE_URL}/api/fy-settings")
        assert response.status_code == 200
        data = response.json()
        assert "active_fy" in data
        print(f"✓ GET FY settings: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
