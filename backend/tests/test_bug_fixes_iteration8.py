"""
Test Bug Fixes - Iteration 8
Testing 4 bug fixes:
1. Print functionality (safePrintHTML) - UI verified
2. Truck payment rate editing - API test
3. Agent payment calculation - API test
4. About section - UI verified

The app is Mill Entry System with Truck Payments, Agent Payments, and Settings tabs.
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthEndpoints:
    """Test authentication for admin/staff users"""
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["role"] == "admin"
        print("✓ Admin login successful")
    
    def test_staff_login(self):
        """Test staff login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "staff",
            "password": "staff123"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["role"] == "staff"
        print("✓ Staff login successful")


class TestTruckPaymentRateEdit:
    """Bug Fix #2: Test truck payment rate editing functionality"""
    
    @pytest.fixture(autouse=True)
    def setup_test_entry(self):
        """Create a test mill entry for truck payment testing"""
        # Create test entry
        response = requests.post(f"{BASE_URL}/api/entries?username=admin&role=admin", json={
            "date": "2026-03-07",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "truck_no": "TEST_RATE_EDIT_001",
            "agent_name": "Test Agent",
            "mandi_name": "Test Mandi",
            "kg": 5000,
            "bag": 50,
            "gbw_cut": 25,
            "cutting_percent": 5,
            "cash_paid": 200,
            "diesel_paid": 100
        })
        assert response.status_code == 200
        self.entry = response.json()
        self.entry_id = self.entry["id"]
        print(f"✓ Created test entry: {self.entry_id}")
        
        yield
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/entries/{self.entry_id}?username=admin&role=admin")
        print(f"✓ Cleaned up test entry: {self.entry_id}")
    
    def test_get_truck_payments(self):
        """Test GET /api/truck-payments returns entry with default rate"""
        response = requests.get(f"{BASE_URL}/api/truck-payments?kms_year=2025-2026&season=Kharif")
        assert response.status_code == 200
        payments = response.json()
        
        # Find our test entry
        test_payment = next((p for p in payments if p["truck_no"] == "TEST_RATE_EDIT_001"), None)
        assert test_payment is not None, "Test truck payment not found"
        
        # Default rate should be 32
        assert test_payment["rate_per_qntl"] == 32, f"Expected default rate 32, got {test_payment['rate_per_qntl']}"
        print(f"✓ Truck payment found with default rate: ₹{test_payment['rate_per_qntl']}")
    
    def test_set_truck_rate(self):
        """Bug Fix #2: Test PUT /api/truck-payments/{entry_id}/rate"""
        # Set new rate
        new_rate = 45.0
        response = requests.put(
            f"{BASE_URL}/api/truck-payments/{self.entry_id}/rate?username=admin&role=admin",
            json={"rate_per_qntl": new_rate}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        print(f"✓ Rate set successfully: {data['message']}")
        
        # Verify rate was updated
        payments_response = requests.get(f"{BASE_URL}/api/truck-payments?kms_year=2025-2026&season=Kharif")
        payments = payments_response.json()
        test_payment = next((p for p in payments if p["truck_no"] == "TEST_RATE_EDIT_001"), None)
        
        assert test_payment is not None
        assert test_payment["rate_per_qntl"] == new_rate, f"Rate not updated. Expected {new_rate}, got {test_payment['rate_per_qntl']}"
        print(f"✓ BUG FIX #2 VERIFIED: Rate successfully changed to ₹{new_rate}")


class TestTruckPaymentOperations:
    """Test truck payment operations: Make Payment, Mark Paid, Undo"""
    
    @pytest.fixture(autouse=True)
    def setup_test_entry(self):
        """Create a test mill entry"""
        response = requests.post(f"{BASE_URL}/api/entries?username=admin&role=admin", json={
            "date": "2026-03-07",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "truck_no": "TEST_PAYMENT_OPS_001",
            "agent_name": "Test Agent",
            "mandi_name": "Test Mandi",
            "kg": 10000,
            "bag": 100,
            "cutting_percent": 5,
            "cash_paid": 500,
            "diesel_paid": 300
        })
        assert response.status_code == 200
        self.entry = response.json()
        self.entry_id = self.entry["id"]
        
        yield
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/entries/{self.entry_id}?username=admin&role=admin")
    
    def test_make_payment(self):
        """Test POST /api/truck-payments/{entry_id}/pay"""
        response = requests.post(
            f"{BASE_URL}/api/truck-payments/{self.entry_id}/pay?username=admin&role=admin",
            json={"amount": 1000, "note": "Partial payment test"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["total_paid"] == 1000
        print(f"✓ Payment made: ₹{data['total_paid']}")
    
    def test_mark_paid(self):
        """Test POST /api/truck-payments/{entry_id}/mark-paid"""
        response = requests.post(
            f"{BASE_URL}/api/truck-payments/{self.entry_id}/mark-paid?username=admin&role=admin"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        print("✓ Payment marked as paid")
    
    def test_undo_paid(self):
        """Test POST /api/truck-payments/{entry_id}/undo-paid"""
        # First mark as paid
        requests.post(f"{BASE_URL}/api/truck-payments/{self.entry_id}/mark-paid?username=admin&role=admin")
        
        # Then undo
        response = requests.post(
            f"{BASE_URL}/api/truck-payments/{self.entry_id}/undo-paid?username=admin&role=admin"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        print("✓ Payment undo successful")


class TestAgentPaymentCalculation:
    """Bug Fix #3: Test agent payment calculation formula"""
    
    def test_agent_payment_formula(self):
        """
        Bug Fix #3: Verify agent payment calculation
        Formula: total_amount = (target_qntl × base_rate) + (cutting_qntl × cutting_rate)
        where cutting_qntl = target_qntl × cutting_percent / 100
        """
        response = requests.get(f"{BASE_URL}/api/agent-payments?kms_year=2025-2026&season=Kharif")
        assert response.status_code == 200
        payments = response.json()
        
        if len(payments) == 0:
            pytest.skip("No agent payments to verify calculation")
        
        for payment in payments:
            target_qntl = payment["target_qntl"]
            cutting_percent = payment["cutting_percent"]
            base_rate = payment["base_rate"]
            cutting_rate = payment["cutting_rate"]
            total_amount = payment["total_amount"]
            
            # Calculate expected total
            cutting_qntl = target_qntl * cutting_percent / 100
            expected_target_amount = target_qntl * base_rate
            expected_cutting_amount = cutting_qntl * cutting_rate
            expected_total = expected_target_amount + expected_cutting_amount
            
            # Verify calculation (allow small floating point tolerance)
            assert abs(total_amount - expected_total) < 0.01, (
                f"Agent payment calculation error for {payment['mandi_name']}: "
                f"Expected {expected_total}, got {total_amount}"
            )
            print(f"✓ {payment['mandi_name']}: ({target_qntl}×{base_rate}) + ({cutting_qntl}×{cutting_rate}) = ₹{total_amount}")
        
        print("✓ BUG FIX #3 VERIFIED: Agent payment calculation formula is correct")


class TestMandiTargetSummary:
    """Test mandi target summary API for dashboard"""
    
    def test_mandi_target_summary(self):
        """Test GET /api/mandi-targets/summary"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets/summary?kms_year=2025-2026&season=Kharif")
        assert response.status_code == 200
        summaries = response.json()
        
        for summary in summaries:
            assert "mandi_name" in summary
            assert "target_qntl" in summary
            assert "cutting_percent" in summary
            assert "expected_total" in summary
            assert "total_agent_amount" in summary
            
            # Verify expected_total calculation
            expected = summary["target_qntl"] + (summary["target_qntl"] * summary["cutting_percent"] / 100)
            assert abs(summary["expected_total"] - expected) < 0.01
            
            print(f"✓ Target summary for {summary['mandi_name']}: {summary['target_qntl']} + {summary['cutting_percent']}% = {summary['expected_total']} QNTL")


class TestPrintAndExportEndpoints:
    """Bug Fix #1: Test export endpoints (PDF/Excel) that use safePrintHTML equivalent on backend"""
    
    def test_truck_payments_pdf_export(self):
        """Test GET /api/export/truck-payments-pdf"""
        response = requests.get(f"{BASE_URL}/api/export/truck-payments-pdf?kms_year=2025-2026&season=Kharif")
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf"
        print("✓ Truck payments PDF export works")
    
    def test_truck_payments_excel_export(self):
        """Test GET /api/export/truck-payments-excel"""
        response = requests.get(f"{BASE_URL}/api/export/truck-payments-excel?kms_year=2025-2026&season=Kharif")
        assert response.status_code == 200
        assert "spreadsheet" in response.headers.get("content-type", "")
        print("✓ Truck payments Excel export works")
    
    def test_agent_payments_pdf_export(self):
        """Test GET /api/export/agent-payments-pdf"""
        response = requests.get(f"{BASE_URL}/api/export/agent-payments-pdf?kms_year=2025-2026&season=Kharif")
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf"
        print("✓ Agent payments PDF export works")
    
    def test_agent_payments_excel_export(self):
        """Test GET /api/export/agent-payments-excel"""
        response = requests.get(f"{BASE_URL}/api/export/agent-payments-excel?kms_year=2025-2026&season=Kharif")
        assert response.status_code == 200
        assert "spreadsheet" in response.headers.get("content-type", "")
        print("✓ Agent payments Excel export works")


class TestBrandingSettings:
    """Test branding settings API (used in receipts)"""
    
    def test_get_branding(self):
        """Test GET /api/branding"""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200
        data = response.json()
        assert "company_name" in data
        assert "tagline" in data
        print(f"✓ Branding: {data['company_name']} - {data['tagline']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
