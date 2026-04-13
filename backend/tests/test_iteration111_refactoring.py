"""
Test Suite for Iteration 111 - Internal Refactoring Verification
Tests that stock_calculator.py and payment_service.py refactoring didn't break any functionality.
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from environment
TEST_USERNAME = os.environ.get('TEST_ADMIN_USERNAME', 'admin')
TEST_PASSWORD = os.environ.get('TEST_ADMIN_PASSWORD', 'admin123')
KMS_YEAR = "2025-2026"


class TestStockCalculatorRefactoring:
    """Tests for stock calculation endpoints using the new stock_calculator.py"""
    
    def test_stock_summary_returns_opening_balance(self):
        """GET /api/stock-summary should return items with 'opening' field"""
        response = requests.get(f"{BASE_URL}/api/stock-summary", params={"kms_year": KMS_YEAR})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "items" in data, "Response should have 'items' key"
        items = data["items"]
        assert len(items) > 0, "Should have at least one stock item"
        
        # Verify each item has required fields
        for item in items:
            assert "name" in item, f"Item missing 'name': {item}"
            assert "opening" in item, f"Item {item['name']} missing 'opening' field"
            assert "in_qty" in item, f"Item {item['name']} missing 'in_qty' field"
            assert "out_qty" in item, f"Item {item['name']} missing 'out_qty' field"
            assert "available" in item, f"Item {item['name']} missing 'available' field"
        
        print(f"Stock summary returned {len(items)} items with opening balances")
    
    def test_stock_summary_available_calculation(self):
        """Verify Available = Opening + In - Out formula"""
        response = requests.get(f"{BASE_URL}/api/stock-summary", params={"kms_year": KMS_YEAR})
        assert response.status_code == 200
        
        data = response.json()
        items = data["items"]
        
        for item in items:
            opening = float(item.get("opening", 0))
            in_qty = float(item.get("in_qty", 0))
            out_qty = float(item.get("out_qty", 0))
            available = float(item.get("available", 0))
            expected = round(opening + in_qty - out_qty, 2)
            
            # Allow small floating point differences
            assert abs(available - expected) < 0.01, \
                f"Item {item['name']}: Available {available} != Opening {opening} + In {in_qty} - Out {out_qty} = {expected}"
        
        print("All stock items have correct Available = Opening + In - Out calculation")
    
    def test_paddy_stock_endpoint(self):
        """GET /api/paddy-stock should return paddy in/out/available"""
        response = requests.get(f"{BASE_URL}/api/paddy-stock", params={"kms_year": KMS_YEAR})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        required_fields = ["total_paddy_in_qntl", "total_paddy_used_qntl", "available_paddy_qntl",
                          "cmr_paddy_in_qntl", "pvt_paddy_in_qntl", "pv_paddy_in_qntl"]
        
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        # Verify calculation
        total_in = data["total_paddy_in_qntl"]
        total_used = data["total_paddy_used_qntl"]
        available = data["available_paddy_qntl"]
        expected_available = round(total_in - total_used, 2)
        
        assert abs(available - expected_available) < 0.01, \
            f"Available {available} != Total In {total_in} - Used {total_used} = {expected_available}"
        
        print(f"Paddy stock: In={total_in}, Used={total_used}, Available={available}")


class TestPaymentServiceRefactoring:
    """Tests for payment operations using the new payment_service.py"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get auth headers for admin user"""
        return {"username": TEST_USERNAME, "role": "admin"}
    
    def test_create_private_payment_creates_cashbook_entries(self, auth_headers):
        """POST /api/private-payments should create payment + cashbook + ledger entries"""
        # First, get an existing paddy purchase entry to link payment to
        paddy_response = requests.get(f"{BASE_URL}/api/private-paddy", params={"kms_year": KMS_YEAR})
        
        if paddy_response.status_code != 200 or not paddy_response.json():
            pytest.skip("No paddy purchase entries to test payment against")
        
        paddy_entries = paddy_response.json()
        # Find an entry with balance > 0
        test_entry = None
        for entry in paddy_entries:
            balance = float(entry.get("balance", 0) or 0)
            if balance > 0:
                test_entry = entry
                break
        
        if not test_entry:
            pytest.skip("No paddy entries with balance > 0 to test payment")
        
        # Create a small test payment
        payment_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "kms_year": KMS_YEAR,
            "season": "",
            "party_name": test_entry.get("party_name", "Test Party"),
            "payment_type": "payment",
            "ref_type": "paddy_purchase",
            "ref_id": test_entry["id"],
            "amount": 100,  # Small test amount
            "mode": "cash",
            "reference": f"TEST_PAY_{uuid.uuid4().hex[:8]}",
            "remark": "Test payment for refactoring verification",
            "round_off": 0
        }
        
        response = requests.post(
            f"{BASE_URL}/api/private-payments",
            json=payment_data,
            params=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        payment = response.json()
        assert "id" in payment, "Payment should have an ID"
        payment_id = payment["id"]
        
        # Verify cashbook entries were created
        cash_response = requests.get(f"{BASE_URL}/api/cash-book", params={"kms_year": KMS_YEAR})
        assert cash_response.status_code == 200
        
        cash_entries = cash_response.json()
        linked_entries = [e for e in cash_entries if e.get("linked_payment_id") == payment_id]
        
        # Should have at least 1 cash entry (cash nikasi)
        assert len(linked_entries) >= 1, f"Expected at least 1 cashbook entry linked to payment, found {len(linked_entries)}"
        
        print(f"Payment {payment_id} created with {len(linked_entries)} linked cashbook entries")
        
        # Cleanup: Delete the test payment
        delete_response = requests.delete(
            f"{BASE_URL}/api/private-payments/{payment_id}",
            params=auth_headers
        )
        assert delete_response.status_code == 200, f"Failed to delete test payment: {delete_response.text}"
        print(f"Test payment {payment_id} deleted successfully")
    
    def test_delete_private_payment_reverses_entries(self, auth_headers):
        """DELETE /api/private-payments/{id} should reverse payment and delete cashbook entries"""
        # Get an existing paddy purchase entry
        paddy_response = requests.get(f"{BASE_URL}/api/private-paddy", params={"kms_year": KMS_YEAR})
        
        if paddy_response.status_code != 200 or not paddy_response.json():
            pytest.skip("No paddy purchase entries to test payment reversal")
        
        paddy_entries = paddy_response.json()
        test_entry = None
        for entry in paddy_entries:
            balance = float(entry.get("balance", 0) or 0)
            if balance > 0:
                test_entry = entry
                break
        
        if not test_entry:
            pytest.skip("No paddy entries with balance > 0")
        
        original_paid = float(test_entry.get("paid_amount", 0) or 0)
        
        # Create a payment
        payment_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "kms_year": KMS_YEAR,
            "season": "",
            "party_name": test_entry.get("party_name", "Test Party"),
            "payment_type": "payment",
            "ref_type": "paddy_purchase",
            "ref_id": test_entry["id"],
            "amount": 50,
            "mode": "cash",
            "reference": f"TEST_REV_{uuid.uuid4().hex[:8]}",
            "remark": "Test payment for reversal verification",
            "round_off": 0
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/private-payments",
            json=payment_data,
            params=auth_headers
        )
        assert create_response.status_code == 200
        payment_id = create_response.json()["id"]
        
        # Verify paid_amount increased
        updated_entry = requests.get(f"{BASE_URL}/api/private-paddy", params={"kms_year": KMS_YEAR}).json()
        updated_test_entry = next((e for e in updated_entry if e["id"] == test_entry["id"]), None)
        assert updated_test_entry is not None
        new_paid = float(updated_test_entry.get("paid_amount", 0) or 0)
        assert new_paid >= original_paid + 50, f"Paid amount should have increased by 50"
        
        # Delete the payment
        delete_response = requests.delete(
            f"{BASE_URL}/api/private-payments/{payment_id}",
            params=auth_headers
        )
        assert delete_response.status_code == 200
        
        # Verify paid_amount was reversed
        final_entry = requests.get(f"{BASE_URL}/api/private-paddy", params={"kms_year": KMS_YEAR}).json()
        final_test_entry = next((e for e in final_entry if e["id"] == test_entry["id"]), None)
        final_paid = float(final_test_entry.get("paid_amount", 0) or 0)
        
        # Should be back to original (or close to it)
        assert abs(final_paid - original_paid) < 1, \
            f"Paid amount should be reversed to {original_paid}, got {final_paid}"
        
        print(f"Payment reversal verified: {original_paid} -> {new_paid} -> {final_paid}")


class TestBrandingAndSettings:
    """Tests for branding, FY settings, and opening stock endpoints"""
    
    def test_get_branding_returns_custom_fields(self):
        """GET /api/branding should return custom_fields array"""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "company_name" in data, "Response should have 'company_name'"
        assert "custom_fields" in data, "Response should have 'custom_fields'"
        
        print(f"Branding: {data.get('company_name')}, {len(data.get('custom_fields', []))} custom fields")
    
    def test_get_fy_settings_returns_both_years(self):
        """GET /api/fy-settings should return both active_fy and financial_year"""
        response = requests.get(f"{BASE_URL}/api/fy-settings")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "active_fy" in data, "Response should have 'active_fy' (KMS year)"
        assert "financial_year" in data, "Response should have 'financial_year'"
        
        print(f"FY Settings: KMS={data.get('active_fy')}, FY={data.get('financial_year')}")
    
    def test_get_opening_stock_returns_balances(self):
        """GET /api/opening-stock should return stock balances"""
        response = requests.get(f"{BASE_URL}/api/opening-stock", params={"kms_year": KMS_YEAR})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "stocks" in data, "Response should have 'stocks'"
        
        stocks = data["stocks"]
        expected_items = ["paddy", "rice_usna", "rice_raw", "bran", "kunda", "broken", "kanki", "husk", "frk"]
        
        for item in expected_items:
            assert item in stocks, f"Missing stock item: {item}"
        
        print(f"Opening stock for {KMS_YEAR}: {stocks}")
    
    def test_carry_forward_endpoint_exists(self):
        """POST /api/opening-stock/carry-forward should exist and require admin"""
        # Test without admin role - should fail
        response = requests.post(
            f"{BASE_URL}/api/opening-stock/carry-forward",
            json={"source_kms_year": "2024-2025", "target_kms_year": "2025-2026"},
            params={"username": "staff", "role": "staff"}
        )
        
        # Should return 403 for non-admin
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}"
        print("Carry forward endpoint correctly requires admin role")


class TestStockSummaryIntegration:
    """Integration tests for stock summary with opening balances"""
    
    def test_stock_summary_includes_all_categories(self):
        """Stock summary should include Raw Material, Finished, and By-Product categories"""
        response = requests.get(f"{BASE_URL}/api/stock-summary", params={"kms_year": KMS_YEAR})
        assert response.status_code == 200
        
        data = response.json()
        items = data["items"]
        
        categories = set(item.get("category", "") for item in items)
        
        # Should have at least these categories
        assert "Raw Material" in categories, "Missing 'Raw Material' category"
        assert "Finished" in categories, "Missing 'Finished' category"
        assert "By-Product" in categories, "Missing 'By-Product' category"
        
        print(f"Stock summary categories: {categories}")
    
    def test_stock_summary_paddy_item(self):
        """Paddy should be in Raw Material category with correct structure"""
        response = requests.get(f"{BASE_URL}/api/stock-summary", params={"kms_year": KMS_YEAR})
        assert response.status_code == 200
        
        data = response.json()
        items = data["items"]
        
        paddy = next((item for item in items if item["name"] == "Paddy"), None)
        assert paddy is not None, "Paddy item not found in stock summary"
        assert paddy["category"] == "Raw Material", f"Paddy should be Raw Material, got {paddy['category']}"
        
        # Verify opening balance is included
        opening = paddy.get("opening", 0)
        print(f"Paddy: Opening={opening}, In={paddy.get('in_qty')}, Out={paddy.get('out_qty')}, Available={paddy.get('available')}")
    
    def test_stock_summary_rice_items(self):
        """Rice (Usna) and Rice (Raw) should be in Finished category"""
        response = requests.get(f"{BASE_URL}/api/stock-summary", params={"kms_year": KMS_YEAR})
        assert response.status_code == 200
        
        data = response.json()
        items = data["items"]
        
        rice_usna = next((item for item in items if item["name"] == "Rice (Usna)"), None)
        rice_raw = next((item for item in items if item["name"] == "Rice (Raw)"), None)
        
        assert rice_usna is not None, "Rice (Usna) not found"
        assert rice_raw is not None, "Rice (Raw) not found"
        
        assert rice_usna["category"] == "Finished", f"Rice (Usna) should be Finished"
        assert rice_raw["category"] == "Finished", f"Rice (Raw) should be Finished"
        
        print(f"Rice (Usna): Opening={rice_usna.get('opening')}, Available={rice_usna.get('available')}")
        print(f"Rice (Raw): Opening={rice_raw.get('opening')}, Available={rice_raw.get('available')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
