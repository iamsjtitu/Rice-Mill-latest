"""
Test Code Quality Fixes v90.3.0
- Tests explicit imports (wildcard removal)
- Tests static uuid import in milling.py
- Tests timedelta import in govt_registers.py
- Tests opening_stock fallback in fy_summary.py
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthExplicitImports:
    """Test auth.py explicit imports from models"""
    
    def test_login_success(self):
        """Test login with admin/admin123 still works after wildcard import removal"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert data.get("username") == "admin"
        assert data.get("role") == "admin"
        print("✓ Login with admin/admin123 works - auth.py explicit imports OK")

    def test_login_invalid_credentials(self):
        """Test login with wrong credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid login returns 401 - auth.py error handling OK")


class TestMillingExplicitImports:
    """Test milling.py explicit imports and uuid.uuid4() static import"""
    
    def test_byproduct_categories_returns_dynamic(self):
        """GET /api/byproduct-categories returns dynamic categories (tests milling.py explicit imports)"""
        response = requests.get(f"{BASE_URL}/api/byproduct-categories")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 5  # At least default categories
        # Check structure
        for cat in data:
            assert "id" in cat
            assert "name" in cat
        print(f"✓ GET /api/byproduct-categories returns {len(data)} categories - milling.py explicit imports OK")

    def test_milling_entries_list(self):
        """GET /api/milling-entries works (tests milling.py imports)"""
        response = requests.get(f"{BASE_URL}/api/milling-entries")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/milling-entries returns {len(data)} entries - milling.py OK")

    def test_milling_summary(self):
        """GET /api/milling-summary works"""
        response = requests.get(f"{BASE_URL}/api/milling-summary?kms_year=2025-26")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "total_entries" in data
        assert "total_paddy_qntl" in data
        print(f"✓ GET /api/milling-summary works - milling.py OK")


class TestCashbookExplicitImports:
    """Test cashbook.py explicit imports from models + pydantic"""
    
    def test_cashbook_summary(self):
        """GET /api/cashbook-summary works (tests cashbook.py explicit imports)"""
        response = requests.get(f"{BASE_URL}/api/cash-book/summary?kms_year=2025-26")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "cash_in" in data
        assert "cash_out" in data
        assert "cash_balance" in data
        assert "bank_balance" in data
        print(f"✓ GET /api/cash-book/summary works - cashbook.py explicit imports OK")

    def test_cashbook_list(self):
        """GET /api/cash-book works"""
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-26")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "transactions" in data
        assert "total" in data
        print(f"✓ GET /api/cash-book returns {data['total']} transactions - cashbook.py OK")


class TestDCPaymentsExplicitImports:
    """Test dc_payments.py explicit imports from models + pydantic"""
    
    def test_dc_entries_list(self):
        """GET /api/dc-entries works (tests dc_payments.py explicit imports)"""
        response = requests.get(f"{BASE_URL}/api/dc-entries?kms_year=2025-26")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/dc-entries returns {len(data)} entries - dc_payments.py explicit imports OK")

    def test_dc_summary(self):
        """GET /api/dc-summary works"""
        response = requests.get(f"{BASE_URL}/api/dc-summary?kms_year=2025-26")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "total_dc" in data
        assert "total_allotted_qntl" in data
        print(f"✓ GET /api/dc-summary works - dc_payments.py OK")


class TestGovtRegistersTimedeltaImport:
    """Test govt_registers.py timedelta import fix"""
    
    def test_form_a_works(self):
        """GET /api/govt-registers/form-a works (tests govt_registers.py timedelta import)"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/form-a?kms_year=2025-26")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "rows" in data
        assert "summary" in data
        print(f"✓ GET /api/govt-registers/form-a works - govt_registers.py timedelta import OK")

    def test_form_a_weekly_grouping(self):
        """GET /api/govt-registers/form-a with weekly grouping (uses timedelta)"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/form-a?kms_year=2025-26&group_by=weekly")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "rows" in data
        assert "summary" in data
        print(f"✓ GET /api/govt-registers/form-a weekly grouping works - timedelta usage OK")


class TestFYSummaryOpeningStockFallback:
    """Test fy_summary.py opening_stock fallback"""
    
    def test_fy_summary(self):
        """GET /api/fy-summary works (tests fy_summary.py opening_stock fallback)"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-26")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        # Should have byproducts section with opening_stock in each item
        assert "byproducts" in data or "frk_stock" in data or "rice_stock" in data
        # Check byproducts have opening_stock field
        if "byproducts" in data:
            for bp_id, bp_data in data["byproducts"].items():
                assert "opening_stock" in bp_data, f"Missing opening_stock in {bp_id}"
        print(f"✓ GET /api/fy-summary works - fy_summary.py opening_stock fallback OK")


class TestMillingEntryWithDynamicByproduct:
    """Test POST /api/milling-entries with dynamic byproduct (tests uuid import fix)"""
    
    def test_create_milling_entry_with_dynamic_byproduct(self):
        """POST /api/milling-entries with dynamic byproduct still works (tests uuid.uuid4() static import)"""
        # First get categories to find a dynamic one
        cats_response = requests.get(f"{BASE_URL}/api/byproduct-categories")
        assert cats_response.status_code == 200
        cats = cats_response.json()
        
        # Create a test milling entry
        test_entry = {
            "date": "2025-01-15",
            "rice_type": "parboiled",
            "paddy_input_qntl": 100,
            "rice_percent": 67,
            "bran_percent": 5,
            "kunda_percent": 3,
            "broken_percent": 2,
            "kanki_percent": 1,
            "frk_used_qntl": 1,
            "kms_year": "2025-26",
            "season": "Kharif",
            "note": "TEST_code_quality_v90_3"
        }
        
        # Add dynamic byproduct percent if exists (e.g., rejection_rice)
        for cat in cats:
            if cat["id"] not in ["bran", "kunda", "broken", "kanki", "husk"]:
                test_entry[f"{cat['id']}_percent"] = 2
                break
        
        response = requests.post(
            f"{BASE_URL}/api/milling-entries?username=admin&role=admin",
            json=test_entry
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data.get("paddy_input_qntl") == 100
        assert data.get("rice_qntl") == 67  # 100 * 67%
        
        created_id = data["id"]
        print(f"✓ POST /api/milling-entries works - uuid.uuid4() static import OK")
        
        # Cleanup - delete the test entry
        delete_response = requests.delete(
            f"{BASE_URL}/api/milling-entries/{created_id}?username=admin&role=admin"
        )
        assert delete_response.status_code == 200
        print(f"✓ Cleanup: deleted test milling entry {created_id[:8]}...")


class TestOpeningStockAPI:
    """Test opening-stock API"""
    
    def test_get_opening_stock(self):
        """GET /api/opening-stock works"""
        response = requests.get(f"{BASE_URL}/api/opening-stock?kms_year=2025-26")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "stocks" in data or "kms_year" in data
        print(f"✓ GET /api/opening-stock works")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
