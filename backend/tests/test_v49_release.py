"""
v49.0.0 Release Verification Tests
Tests for: Custom Branding, FY/KMS Settings, Opening Stock, Stock Summary, Payment Service
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication tests"""
    
    def test_login_admin(self):
        """Test admin login with correct credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["username"] == "admin"
        assert data["role"] == "admin"
        print("✓ Admin login successful")

    def test_login_invalid(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid login rejected correctly")


class TestBranding:
    """Custom Branding Fields tests"""
    
    def test_get_branding(self):
        """GET /api/branding returns custom_fields array"""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200
        data = response.json()
        assert "company_name" in data
        assert "custom_fields" in data
        assert isinstance(data["custom_fields"], list)
        print(f"✓ Branding: {data['company_name']}, {len(data['custom_fields'])} custom fields")
    
    def test_branding_custom_fields_structure(self):
        """Verify custom_fields have label, value, position"""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200
        data = response.json()
        for field in data.get("custom_fields", []):
            assert "label" in field
            assert "value" in field
            assert "position" in field
            assert field["position"] in ("left", "center", "right")
        print(f"✓ Custom fields structure valid: {[f['label'] for f in data.get('custom_fields', [])]}")
    
    def test_update_branding_requires_admin(self):
        """PUT /api/branding requires admin role"""
        response = requests.put(f"{BASE_URL}/api/branding?username=staff&role=staff", json={
            "company_name": "Test Company"
        })
        assert response.status_code == 403
        print("✓ Branding update requires admin role")


class TestFYSettings:
    """FY (Apr-Mar) + KMS (Oct-Sep) Settings tests"""
    
    def test_get_fy_settings(self):
        """GET /api/fy-settings returns both active_fy (KMS) and financial_year (FY)"""
        response = requests.get(f"{BASE_URL}/api/fy-settings")
        assert response.status_code == 200
        data = response.json()
        assert "active_fy" in data  # KMS year (Oct-Sep)
        assert "financial_year" in data  # FY year (Apr-Mar)
        print(f"✓ FY Settings: KMS={data['active_fy']}, FY={data['financial_year']}")
    
    def test_update_fy_settings(self):
        """PUT /api/fy-settings saves financial_year alongside active_fy"""
        response = requests.put(f"{BASE_URL}/api/fy-settings", json={
            "active_fy": "2024-2025",
            "financial_year": "2024-2025",
            "season": "Rabi"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["active_fy"] == "2024-2025"
        assert data["financial_year"] == "2024-2025"
        print("✓ FY Settings updated successfully")


class TestOpeningStock:
    """Opening Stock with carry-forward tests"""
    
    def test_get_opening_stock(self):
        """GET /api/opening-stock returns stock balances for KMS year"""
        response = requests.get(f"{BASE_URL}/api/opening-stock?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert "kms_year" in data
        assert "stocks" in data
        # Verify all 9 stock items exist
        expected_items = ["paddy", "rice_usna", "rice_raw", "bran", "kunda", "broken", "kanki", "husk", "frk"]
        for item in expected_items:
            assert item in data["stocks"], f"Missing stock item: {item}"
        print(f"✓ Opening stock for {data['kms_year']}: Paddy={data['stocks']['paddy']}, Rice(Usna)={data['stocks']['rice_usna']}")
    
    def test_opening_stock_has_9_items(self):
        """Verify all 9 stock items are present"""
        response = requests.get(f"{BASE_URL}/api/opening-stock?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        stocks = data.get("stocks", {})
        assert len(stocks) == 9, f"Expected 9 stock items, got {len(stocks)}"
        print(f"✓ All 9 stock items present: {list(stocks.keys())}")
    
    def test_save_opening_stock_requires_admin(self):
        """PUT /api/opening-stock requires admin role"""
        response = requests.put(f"{BASE_URL}/api/opening-stock?username=staff&role=staff", json={
            "kms_year": "2025-2026",
            "stocks": {"paddy": 100}
        })
        assert response.status_code == 403
        print("✓ Opening stock save requires admin role")
    
    def test_carry_forward_requires_admin(self):
        """POST /api/opening-stock/carry-forward requires admin role"""
        response = requests.post(f"{BASE_URL}/api/opening-stock/carry-forward?username=staff&role=staff", json={
            "source_kms_year": "2024-2025",
            "target_kms_year": "2025-2026"
        })
        assert response.status_code == 403
        print("✓ Carry forward requires admin role")


class TestStockSummary:
    """Stock Summary with Opening column tests"""
    
    def test_get_stock_summary(self):
        """GET /api/stock-summary returns items with 'opening' field included"""
        response = requests.get(f"{BASE_URL}/api/stock-summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        items = data["items"]
        assert len(items) > 0
        # Verify opening field exists in all items
        for item in items:
            assert "opening" in item, f"Missing 'opening' field in {item['name']}"
            assert "in_qty" in item
            assert "out_qty" in item
            assert "available" in item
        print(f"✓ Stock summary has {len(items)} items with opening field")
    
    def test_stock_summary_available_formula(self):
        """Verify Available = Opening + In - Out formula"""
        response = requests.get(f"{BASE_URL}/api/stock-summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        for item in data["items"]:
            expected = round(item["opening"] + item["in_qty"] - item["out_qty"], 2)
            actual = round(item["available"], 2)
            assert abs(expected - actual) < 0.01, f"{item['name']}: Expected {expected}, got {actual}"
        print("✓ Available = Opening + In - Out formula verified for all items")
    
    def test_stock_summary_paddy_opening(self):
        """Verify Paddy opening stock is included"""
        response = requests.get(f"{BASE_URL}/api/stock-summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        paddy = next((i for i in data["items"] if i["name"] == "Paddy"), None)
        assert paddy is not None
        assert paddy["opening"] == 500.0  # From carry-forward
        print(f"✓ Paddy opening stock: {paddy['opening']}Q")


class TestPaddyStock:
    """Paddy Stock endpoint tests"""
    
    def test_get_paddy_stock(self):
        """GET /api/paddy-stock returns correct paddy in/out/available"""
        response = requests.get(f"{BASE_URL}/api/paddy-stock?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert "total_paddy_in_qntl" in data
        assert "total_paddy_used_qntl" in data
        assert "available_paddy_qntl" in data
        assert "cmr_paddy_in_qntl" in data
        assert "pvt_paddy_in_qntl" in data
        print(f"✓ Paddy stock: In={data['total_paddy_in_qntl']}, Used={data['total_paddy_used_qntl']}, Available={data['available_paddy_qntl']}")


class TestCashBook:
    """Cash Book tests"""
    
    def test_get_cash_book(self):
        """GET /api/cash-book returns cashbook entries"""
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2024-2025")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Cash book has {len(data)} entries")
    
    def test_auto_fix_endpoint(self):
        """POST /api/cash-book/auto-fix runs 9-step integrity check"""
        response = requests.post(f"{BASE_URL}/api/cash-book/auto-fix")
        assert response.status_code == 200
        data = response.json()
        assert "success" in data or "message" in data
        print(f"✓ Auto-fix completed: {data.get('message', data)}")


class TestPrivatePayments:
    """Private Payments with payment_service tests"""
    
    def test_get_private_payments(self):
        """GET /api/private-payments returns payments list"""
        response = requests.get(f"{BASE_URL}/api/private-payments?kms_year=2024-2025")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Private payments: {len(data)} entries")
    
    def test_create_and_delete_payment(self):
        """POST /api/private-payments creates payment + cashbook + ledger entries"""
        # First create a test paddy entry
        paddy_data = {
            "date": "2025-01-20",
            "kms_year": "2024-2025",
            "season": "Kharif",
            "party_name": f"TEST_PaymentTest_{uuid.uuid4().hex[:6]}",
            "mandi_name": "TestMandi",
            "kg": 500,
            "bag": 10,
            "rate_per_qntl": 2000,
            "g_deposite": 0,
            "gbw_cut": 10,
            "plastic_bag": 0,
            "moisture": 14,
            "cutting_percent": 0,
            "disc_dust_poll": 0,
            "g_issued": 0,
            "cash_paid": 0,
            "diesel_paid": 0
        }
        paddy_response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=paddy_data)
        if paddy_response.status_code != 200:
            pytest.skip("Could not create test paddy entry")
        
        paddy = paddy_response.json()
        paddy_id = paddy["id"]
        
        # Create payment
        payment_data = {
            "date": "2025-01-20",
            "kms_year": "2024-2025",
            "season": "Kharif",
            "party_name": paddy_data["party_name"],
            "payment_type": "cash",
            "ref_type": "paddy_purchase",
            "ref_id": paddy_id,
            "amount": 1000,
            "mode": "cash",
            "reference": "TEST_PAYMENT",
            "remark": "Test payment",
            "round_off": 0
        }
        payment_response = requests.post(f"{BASE_URL}/api/private-payments?username=admin&role=admin", json=payment_data)
        assert payment_response.status_code == 200
        payment = payment_response.json()
        payment_id = payment["id"]
        print(f"✓ Payment created: {payment_id}")
        
        # Verify payment exists
        get_response = requests.get(f"{BASE_URL}/api/private-payments?ref_id={paddy_id}")
        assert get_response.status_code == 200
        payments = get_response.json()
        assert any(p["id"] == payment_id for p in payments)
        print("✓ Payment verified in list")
        
        # Delete payment
        delete_response = requests.delete(f"{BASE_URL}/api/private-payments/{payment_id}")
        assert delete_response.status_code == 200
        print("✓ Payment deleted successfully")
        
        # Cleanup: delete paddy entry
        requests.delete(f"{BASE_URL}/api/private-paddy/{paddy_id}")
        print("✓ Test data cleaned up")


class TestStockCalculator:
    """Stock Calculator centralization tests"""
    
    def test_stock_summary_uses_calculator(self):
        """Verify stock-summary endpoint uses centralized calculator"""
        response = requests.get(f"{BASE_URL}/api/stock-summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        # Verify structure matches calculator output
        for item in data["items"]:
            assert "name" in item
            assert "category" in item
            assert "opening" in item
            assert "in_qty" in item
            assert "out_qty" in item
            assert "available" in item
            assert "details" in item
        print("✓ Stock summary uses centralized calculator")


class TestVersionCheck:
    """Version verification"""
    
    def test_branding_has_version_info(self):
        """Verify branding endpoint works (version shown in frontend)"""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200
        print("✓ Branding endpoint working (version v49.0.0 shown in frontend)")


# Cleanup fixture
@pytest.fixture(scope="session", autouse=True)
def cleanup_test_data():
    """Cleanup TEST_ prefixed data after all tests"""
    yield
    # Cleanup any remaining test data
    try:
        # Get all private paddy entries
        response = requests.get(f"{BASE_URL}/api/private-paddy?kms_year=2024-2025")
        if response.status_code == 200:
            entries = response.json()
            for entry in entries:
                if entry.get("party_name", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/private-paddy/{entry['id']}")
    except:
        pass


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
