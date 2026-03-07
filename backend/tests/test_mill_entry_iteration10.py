"""
Mill Entry System - Comprehensive Backend Tests - Iteration 10
Focus: Print API, Agent Payment Calculation (cutting_rate=0), Truck Payment Rate Edit
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
API = f"{BASE_URL}/api"


class TestPrintAPI:
    """CRITICAL P0: Test print page endpoints for Electron compatibility"""
    
    def test_print_create_and_retrieve(self):
        """POST /api/print creates page, GET retrieves HTML content"""
        html_content = "<html><head><title>Test Receipt</title></head><body><h1>NAVKAR AGRO</h1><p>Payment Receipt Test</p></body></html>"
        
        # Create print page
        create_response = requests.post(
            f"{API}/print",
            json={"html": html_content}
        )
        
        assert create_response.status_code == 200, f"Create print page failed: {create_response.text}"
        
        data = create_response.json()
        assert "id" in data, "Response should contain page id"
        assert "url" in data, "Response should contain url"
        assert data["url"].startswith("/api/print/"), f"URL should start with /api/print/, got {data['url']}"
        
        page_id = data["id"]
        print(f"✓ Print page created with ID: {page_id}")
        
        # Retrieve print page
        get_response = requests.get(f"{API}/print/{page_id}")
        
        assert get_response.status_code == 200, f"Get print page failed: {get_response.text}"
        assert "NAVKAR AGRO" in get_response.text, "Retrieved page should contain company name"
        assert "Payment Receipt Test" in get_response.text, "Retrieved page should contain receipt content"
        print("✓ Print page retrieved successfully with correct content")
    
    def test_print_page_consumed_after_get(self):
        """Print page should be consumed after first GET (one-time use)"""
        html_content = "<h1>One-time page</h1>"
        
        create_response = requests.post(f"{API}/print", json={"html": html_content})
        assert create_response.status_code == 200
        page_id = create_response.json()["id"]
        
        # First GET should succeed
        get_response1 = requests.get(f"{API}/print/{page_id}")
        assert get_response1.status_code == 200
        assert "One-time page" in get_response1.text
        
        # Second GET should return 404 (page consumed)
        get_response2 = requests.get(f"{API}/print/{page_id}")
        assert get_response2.status_code == 404, "Page should be consumed after first access"
        print("✓ Print page correctly consumed after first access")


class TestAuth:
    """P1: Authentication tests"""
    
    def test_admin_login(self):
        """Admin login with correct credentials"""
        response = requests.post(f"{API}/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["username"] == "admin"
        assert data["role"] == "admin"
        print("✓ Admin login successful")
    
    def test_staff_login(self):
        """Staff login with correct credentials"""
        response = requests.post(f"{API}/auth/login", json={
            "username": "staff",
            "password": "staff123"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["role"] == "staff"
        print("✓ Staff login successful")
    
    def test_invalid_login(self):
        """Invalid login should return 401"""
        response = requests.post(f"{API}/auth/login", json={
            "username": "admin",
            "password": "wrongpass"
        })
        
        assert response.status_code == 401
        print("✓ Invalid login correctly rejected")


class TestBranding:
    """P1: Branding API tests"""
    
    def test_get_branding(self):
        """GET /api/branding returns company info"""
        response = requests.get(f"{API}/branding")
        
        assert response.status_code == 200
        data = response.json()
        assert "company_name" in data
        assert "tagline" in data
        # Verify NAVKAR AGRO is the expected company
        assert data["company_name"] == "NAVKAR AGRO"
        print(f"✓ Branding retrieved: {data['company_name']} - {data['tagline']}")


class TestAgentPaymentCalculation:
    """P0: Test agent payment calculation with cutting_rate=0"""
    
    def test_agent_payments_with_zero_cutting_rate(self):
        """Verify agent payment with cutting_rate=0 doesn't include cutting amount"""
        response = requests.get(f"{API}/agent-payments?kms_year=2025-2026&season=Kharif")
        
        assert response.status_code == 200
        data = response.json()
        
        # Find the payment with cutting_rate=0
        for payment in data:
            if payment.get("cutting_rate") == 0:
                # When cutting_rate is 0, cutting_amount should be 0
                assert payment["cutting_amount"] == 0, f"Cutting amount should be 0 when cutting_rate=0, got {payment['cutting_amount']}"
                # Total should equal target_amount only (no cutting bonus)
                expected_total = payment["target_amount"]
                assert payment["total_amount"] == expected_total, f"Total should be {expected_total}, got {payment['total_amount']}"
                print(f"✓ Agent payment for {payment['mandi_name']}: cutting_rate=0, cutting_amount={payment['cutting_amount']}, total={payment['total_amount']}")
                break
        else:
            pytest.skip("No agent payment with cutting_rate=0 found in test data")


class TestMandiTargets:
    """P2: Mandi target CRUD tests"""
    
    def test_get_mandi_targets(self):
        """GET /api/mandi-targets returns target list"""
        response = requests.get(f"{API}/mandi-targets")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} mandi targets")
    
    def test_mandi_targets_summary(self):
        """GET /api/mandi-targets/summary returns progress info"""
        response = requests.get(f"{API}/mandi-targets/summary?kms_year=2025-2026&season=Kharif")
        
        assert response.status_code == 200
        data = response.json()
        
        for target in data:
            # Verify required fields
            assert "mandi_name" in target
            assert "target_qntl" in target
            assert "achieved_qntl" in target
            assert "progress_percent" in target
            assert "total_agent_amount" in target
            print(f"✓ Target {target['mandi_name']}: {target['achieved_qntl']}/{target['target_qntl']} QNTL ({target['progress_percent']}%)")


class TestTruckPayments:
    """P0: Truck payment tests including rate editing"""
    
    def test_get_truck_payments(self):
        """GET /api/truck-payments returns payment list"""
        response = requests.get(f"{API}/truck-payments")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} truck payments")
        
        if data:
            payment = data[0]
            # Verify required fields
            assert "entry_id" in payment
            assert "truck_no" in payment
            assert "rate_per_qntl" in payment
            assert "net_amount" in payment
            assert "status" in payment
            print(f"✓ Sample payment: {payment['truck_no']} - Rate: ₹{payment['rate_per_qntl']}, Status: {payment['status']}")
    
    def test_truck_payment_rate_edit(self):
        """P0: Edit truck payment rate (admin only)"""
        # First get an existing truck payment
        response = requests.get(f"{API}/truck-payments")
        assert response.status_code == 200
        payments = response.json()
        
        if not payments:
            pytest.skip("No truck payments to test rate editing")
        
        entry_id = payments[0]["entry_id"]
        original_rate = payments[0]["rate_per_qntl"]
        new_rate = 45.0 if original_rate != 45.0 else 40.0
        
        # Set new rate
        rate_response = requests.put(
            f"{API}/truck-payments/{entry_id}/rate?username=admin&role=admin",
            json={"rate_per_qntl": new_rate}
        )
        
        assert rate_response.status_code == 200, f"Rate update failed: {rate_response.text}"
        print(f"✓ Updated rate from ₹{original_rate} to ₹{new_rate}")
        
        # Verify rate was updated
        verify_response = requests.get(f"{API}/truck-payments")
        assert verify_response.status_code == 200
        updated_payment = next((p for p in verify_response.json() if p["entry_id"] == entry_id), None)
        
        assert updated_payment is not None, "Updated payment not found"
        assert updated_payment["rate_per_qntl"] == new_rate, f"Rate not updated. Expected {new_rate}, got {updated_payment['rate_per_qntl']}"
        print(f"✓ Verified rate is now ₹{updated_payment['rate_per_qntl']}")
        
        # Reset to original rate
        requests.put(
            f"{API}/truck-payments/{entry_id}/rate?username=admin&role=admin",
            json={"rate_per_qntl": original_rate}
        )
        print(f"✓ Rate reset to original ₹{original_rate}")


class TestExports:
    """P1: Export functionality tests"""
    
    def test_excel_export(self):
        """GET /api/export/excel returns valid file"""
        response = requests.get(f"{API}/export/excel")
        
        assert response.status_code == 200
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers.get("content-type", "")
        assert len(response.content) > 0, "Excel file should not be empty"
        print(f"✓ Excel export successful, size: {len(response.content)} bytes")
    
    def test_pdf_export(self):
        """GET /api/export/pdf returns valid file"""
        response = requests.get(f"{API}/export/pdf")
        
        assert response.status_code == 200
        assert "application/pdf" in response.headers.get("content-type", "")
        assert len(response.content) > 0, "PDF file should not be empty"
        print(f"✓ PDF export successful, size: {len(response.content)} bytes")


class TestMillEntries:
    """P2: Mill entry CRUD tests"""
    
    def test_get_entries(self):
        """GET /api/entries returns entry list"""
        response = requests.get(f"{API}/entries")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} entries")
    
    def test_create_entry(self):
        """POST /api/entries creates new entry"""
        entry_data = {
            "date": "2026-03-07",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "truck_no": "TEST_OD99ZZ9999",
            "agent_name": "TEST_Agent",
            "mandi_name": "TEST_Mandi",
            "kg": 10000,
            "bag": 100,
            "g_deposite": 50,
            "gbw_cut": 50,
            "plastic_bag": 10,
            "cutting_percent": 5.0,
            "disc_dust_poll": 5,
            "moisture": 18,
            "cash_paid": 1000,
            "diesel_paid": 500
        }
        
        response = requests.post(
            f"{API}/entries?username=admin&role=admin",
            json=entry_data
        )
        
        assert response.status_code == 200, f"Create entry failed: {response.text}"
        data = response.json()
        
        # Verify auto-calculated fields
        assert "id" in data
        assert data["qntl"] == 100.0  # kg / 100
        assert data["mill_w"] > 0  # kg - gbw_cut
        assert data["final_w"] > 0  # calculated final weight
        print(f"✓ Created entry with ID: {data['id']}, Final W: {data['final_w']/100:.2f} QNTL")
        
        # Cleanup - delete test entry
        delete_response = requests.delete(f"{API}/entries/{data['id']}?username=admin&role=admin")
        assert delete_response.status_code == 200
        print("✓ Test entry cleaned up")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
