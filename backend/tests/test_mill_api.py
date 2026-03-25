"""
Mill Entry System API Tests
Tests for: Print endpoint, Export endpoints, Payments, Agent calculations
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://rice-mill-ledger.preview.emergentagent.com').rstrip('/')

class TestPrintEndpoint:
    """CRITICAL: Test server-side print functionality for Electron compatibility"""
    
    def test_create_print_page(self):
        """POST /api/print should return id and url"""
        html_content = "<html><body><h1>Test Receipt</h1><p>Payment Details</p></body></html>"
        response = requests.post(f"{BASE_URL}/api/print", json={"html": html_content})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "id" in data, "Response should contain 'id'"
        assert "url" in data, "Response should contain 'url'"
        assert data["url"].startswith("/api/print/"), f"URL should start with /api/print/, got {data['url']}"
        print(f"✓ Print page created: id={data['id']}, url={data['url']}")
    
    def test_retrieve_print_page(self):
        """GET /api/print/{id} should return HTML content"""
        # Create a print page first
        html_content = "<html><body><h1>Test Receipt Content</h1></body></html>"
        create_response = requests.post(f"{BASE_URL}/api/print", json={"html": html_content})
        assert create_response.status_code == 200
        page_id = create_response.json()["id"]
        
        # Retrieve the page
        get_response = requests.get(f"{BASE_URL}/api/print/{page_id}")
        assert get_response.status_code == 200, f"Expected 200, got {get_response.status_code}"
        
        # Check the HTML is returned (may have CF wrapper)
        assert "Test Receipt Content" in get_response.text, "HTML content should be in response"
        print(f"✓ Print page retrieved successfully with content")
    
    def test_expired_print_page(self):
        """GET /api/print/{id} should return 404 for already consumed page"""
        # Create and consume a page
        html_content = "<html><body>Temp</body></html>"
        create_response = requests.post(f"{BASE_URL}/api/print", json={"html": html_content})
        page_id = create_response.json()["id"]
        
        # First retrieval (consumes the page)
        first_get = requests.get(f"{BASE_URL}/api/print/{page_id}")
        assert first_get.status_code == 200
        
        # Second retrieval should fail (page was consumed)
        second_get = requests.get(f"{BASE_URL}/api/print/{page_id}")
        assert second_get.status_code == 404, "Page should be expired/consumed after first retrieval"
        print(f"✓ Print page correctly expires after first retrieval")


class TestExportEndpoints:
    """Test Excel and PDF export functionality"""
    
    def test_excel_export(self):
        """GET /api/export/excel should return valid xlsx file"""
        response = requests.get(f"{BASE_URL}/api/export/excel")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        content_type = response.headers.get('content-type', '')
        assert 'spreadsheetml' in content_type or 'excel' in content_type, f"Expected Excel content-type, got {content_type}"
        assert len(response.content) > 0, "Excel file should not be empty"
        
        # Check for valid xlsx magic bytes (PK signature for zip-based format)
        assert response.content[:2] == b'PK', "Excel file should start with PK (ZIP signature)"
        print(f"✓ Excel export working: {len(response.content)} bytes")
    
    def test_pdf_export(self):
        """GET /api/export/pdf should return valid PDF file"""
        response = requests.get(f"{BASE_URL}/api/export/pdf")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        content_type = response.headers.get('content-type', '')
        assert 'pdf' in content_type, f"Expected PDF content-type, got {content_type}"
        assert len(response.content) > 0, "PDF file should not be empty"
        
        # Check for PDF magic bytes
        assert response.content[:4] == b'%PDF', "PDF file should start with %PDF"
        print(f"✓ PDF export working: {len(response.content)} bytes")
    
    def test_truck_payments_excel(self):
        """GET /api/export/truck-payments-excel should work"""
        response = requests.get(f"{BASE_URL}/api/export/truck-payments-excel")
        assert response.status_code == 200
        assert len(response.content) > 0
        print(f"✓ Truck payments Excel export working: {len(response.content)} bytes")
    
    def test_truck_payments_pdf(self):
        """GET /api/export/truck-payments-pdf should work"""
        response = requests.get(f"{BASE_URL}/api/export/truck-payments-pdf")
        assert response.status_code == 200
        assert response.content[:4] == b'%PDF'
        print(f"✓ Truck payments PDF export working: {len(response.content)} bytes")


class TestAuthEndpoints:
    """Test authentication endpoints"""
    
    def test_admin_login(self):
        """POST /api/auth/login with admin credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data["success"] == True
        assert data["username"] == "admin"
        assert data["role"] == "admin"
        print(f"✓ Admin login successful")
    
    def test_staff_login(self):
        """POST /api/auth/login with staff credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "staff",
            "password": "staff123"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["role"] == "staff"
        print(f"✓ Staff login successful")
    
    def test_invalid_login(self):
        """POST /api/auth/login with invalid credentials should fail"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "invalid",
            "password": "wrong"
        })
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Invalid login correctly rejected")


class TestTruckPayments:
    """Test truck payment functionality"""
    
    def test_get_truck_payments(self):
        """GET /api/truck-payments should return list"""
        response = requests.get(f"{BASE_URL}/api/truck-payments")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        if len(data) > 0:
            payment = data[0]
            required_fields = ["entry_id", "truck_no", "final_qntl", "rate_per_qntl", 
                             "gross_amount", "net_amount", "paid_amount", "balance_amount", "status"]
            for field in required_fields:
                assert field in payment, f"Payment should have '{field}' field"
        
        print(f"✓ Truck payments retrieved: {len(data)} records")
    
    def test_set_truck_rate(self):
        """PUT /api/truck-payments/{entry_id}/rate should update rate"""
        # Get an entry to update
        payments_response = requests.get(f"{BASE_URL}/api/truck-payments")
        payments = payments_response.json()
        
        if len(payments) == 0:
            pytest.skip("No truck payments to test rate update")
        
        entry_id = payments[0]["entry_id"]
        new_rate = 40.0
        
        response = requests.put(
            f"{BASE_URL}/api/truck-payments/{entry_id}/rate?username=admin&role=admin",
            json={"rate_per_qntl": new_rate}
        )
        
        assert response.status_code == 200
        assert "success" in response.json()
        assert response.json()["success"] == True
        
        # Verify rate was updated
        updated_payments = requests.get(f"{BASE_URL}/api/truck-payments").json()
        updated_payment = next((p for p in updated_payments if p["entry_id"] == entry_id), None)
        assert updated_payment is not None
        assert updated_payment["rate_per_qntl"] == new_rate, f"Rate should be {new_rate}, got {updated_payment['rate_per_qntl']}"
        
        print(f"✓ Truck rate updated to ₹{new_rate}/QNTL")


class TestAgentPayments:
    """Test agent payment calculations - especially cutting_rate=0"""
    
    def test_get_agent_payments(self):
        """GET /api/agent-payments should return list"""
        response = requests.get(f"{BASE_URL}/api/agent-payments")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Agent payments retrieved: {len(data)} records")
    
    def test_agent_payment_cutting_rate_zero(self):
        """Agent payment with cutting_rate=0 should NOT add cutting amount (uses ?? not ||)"""
        response = requests.get(f"{BASE_URL}/api/agent-payments")
        data = response.json()
        
        # Find a payment with cutting_rate=0
        zero_cutting_rate_payment = None
        for payment in data:
            if payment.get("cutting_rate") == 0:
                zero_cutting_rate_payment = payment
                break
        
        if zero_cutting_rate_payment is None:
            # Check mandi targets for cutting_rate=0
            targets_response = requests.get(f"{BASE_URL}/api/mandi-targets/summary")
            targets = targets_response.json()
            zero_cutting_target = next((t for t in targets if t.get("cutting_rate") == 0), None)
            
            if zero_cutting_target:
                # Verify cutting_amount is 0
                assert zero_cutting_target["cutting_amount"] == 0, \
                    f"Cutting amount should be 0 when cutting_rate=0, got {zero_cutting_target['cutting_amount']}"
                print(f"✓ Verified cutting_rate=0 target '{zero_cutting_target['mandi_name']}' has cutting_amount=0")
            else:
                print("⚠ No cutting_rate=0 targets found - test inconclusive")
        else:
            # Verify cutting_amount is 0 when cutting_rate is 0
            assert zero_cutting_rate_payment["cutting_amount"] == 0, \
                f"Cutting amount should be 0 when cutting_rate=0, got {zero_cutting_rate_payment['cutting_amount']}"
            print(f"✓ Agent payment with cutting_rate=0 has cutting_amount=0")


class TestMandiTargets:
    """Test mandi target functionality"""
    
    def test_get_mandi_targets_summary(self):
        """GET /api/mandi-targets/summary should return target progress"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets/summary")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        if len(data) > 0:
            target = data[0]
            required_fields = ["id", "mandi_name", "target_qntl", "cutting_percent", 
                             "expected_total", "achieved_qntl", "progress_percent",
                             "base_rate", "cutting_rate", "total_agent_amount"]
            for field in required_fields:
                assert field in target, f"Target should have '{field}' field"
        
        print(f"✓ Mandi targets summary retrieved: {len(data)} targets")


class TestEntries:
    """Test mill entries CRUD"""
    
    def test_get_entries(self):
        """GET /api/entries should return list"""
        response = requests.get(f"{BASE_URL}/api/entries")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Entries retrieved: {len(data)} records")
    
    def test_create_and_delete_entry(self):
        """POST /api/entries and DELETE /api/entries/{id}"""
        # Create entry
        entry_data = {
            "date": "2026-03-07",
            "truck_no": "TEST_TRUCK_123",
            "agent_name": "TEST_AGENT",
            "mandi_name": "TEST_MANDI",
            "kg": 5000,
            "bag": 100,
            "g_deposite": 100,
            "gbw_cut": 50,
            "plastic_bag": 10,
            "cutting_percent": 5.0,
            "disc_dust_poll": 10,
            "g_issued": 50,
            "cash_paid": 1000,
            "diesel_paid": 500
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/entries?username=admin&role=admin",
            json=entry_data
        )
        
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        created = create_response.json()
        entry_id = created["id"]
        
        # Verify auto calculations
        assert "final_w" in created
        assert created["qntl"] == 50.0, f"QNTL should be 50, got {created['qntl']}"
        
        # Delete the test entry
        delete_response = requests.delete(
            f"{BASE_URL}/api/entries/{entry_id}?username=admin&role=admin"
        )
        assert delete_response.status_code == 200
        
        print(f"✓ Entry CRUD working: created and deleted entry {entry_id}")


class TestBranding:
    """Test branding/settings endpoint"""
    
    def test_get_branding(self):
        """GET /api/branding should return company info"""
        response = requests.get(f"{BASE_URL}/api/branding")
        
        assert response.status_code == 200
        data = response.json()
        assert "company_name" in data
        assert "tagline" in data
        print(f"✓ Branding retrieved: {data['company_name']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
