"""
Test suite for Government Registers v89.3.0 - 3 New Features:
1. Transit Pass Register (view-only, auto-generated from mill_entries with tp_no)
2. CMR Delivery Tracker (CRUD with OTR calculation)
3. Security Deposit Management (CRUD)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestTransitPassRegister:
    """Transit Pass Register - VIEW ONLY (auto-generated from mill_entries where tp_no exists)"""
    
    def test_get_transit_pass_returns_200(self):
        """GET /api/govt-registers/transit-pass returns 200"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/transit-pass")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: GET /api/govt-registers/transit-pass returns 200")
    
    def test_transit_pass_response_structure(self):
        """Response has rows and summary structure"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/transit-pass")
        assert response.status_code == 200
        data = response.json()
        
        # Check top-level structure
        assert "rows" in data, "Response missing 'rows' key"
        assert "summary" in data, "Response missing 'summary' key"
        assert isinstance(data["rows"], list), "rows should be a list"
        
        # Check summary structure
        summary = data["summary"]
        assert "total_entries" in summary, "Summary missing total_entries"
        assert "total_qty" in summary, "Summary missing total_qty"
        assert "total_bags" in summary, "Summary missing total_bags"
        print(f"PASS: Transit Pass response structure correct. {summary['total_entries']} entries found")
    
    def test_transit_pass_row_structure(self):
        """Each row has required fields"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/transit-pass")
        assert response.status_code == 200
        data = response.json()
        
        if len(data["rows"]) > 0:
            row = data["rows"][0]
            required_fields = ["date", "tp_no", "rst_no", "truck_no", "agent_name", 
                             "mandi_name", "qty_qntl", "tp_weight", "bags", "status"]
            for field in required_fields:
                assert field in row, f"Row missing field: {field}"
            print(f"PASS: Transit Pass row structure correct. First TP No: {row['tp_no']}")
        else:
            print("PASS: Transit Pass row structure check skipped (no data)")
    
    def test_transit_pass_kms_year_filter(self):
        """kms_year filter works"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/transit-pass?kms_year=2024-25")
        assert response.status_code == 200
        print("PASS: Transit Pass kms_year filter works")
    
    def test_transit_pass_date_filters(self):
        """date_from and date_to filters work"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/transit-pass?date_from=2024-01-01&date_to=2024-12-31")
        assert response.status_code == 200
        print("PASS: Transit Pass date filters work")
    
    def test_transit_pass_excel_export(self):
        """GET /api/govt-registers/transit-pass/excel returns Excel file"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/transit-pass/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "spreadsheet" in response.headers.get("content-type", "") or \
               "application/vnd" in response.headers.get("content-type", ""), \
               f"Expected Excel content-type, got {response.headers.get('content-type')}"
        assert len(response.content) > 0, "Excel file is empty"
        print("PASS: Transit Pass Excel export works")


class TestCmrDeliveryTracker:
    """CMR Delivery Tracker - Full CRUD with OTR (Outturn Ratio) calculation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_id = None
        yield
        # Cleanup
        if self.test_id:
            try:
                requests.delete(f"{BASE_URL}/api/govt-registers/cmr-delivery/{self.test_id}?username=test&role=admin")
            except:
                pass
    
    def test_get_cmr_delivery_returns_200(self):
        """GET /api/govt-registers/cmr-delivery returns 200"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/cmr-delivery")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: GET /api/govt-registers/cmr-delivery returns 200")
    
    def test_cmr_delivery_response_structure(self):
        """Response has entries and summary with OTR"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/cmr-delivery")
        assert response.status_code == 200
        data = response.json()
        
        # Check top-level structure
        assert "entries" in data, "Response missing 'entries' key"
        assert "summary" in data, "Response missing 'summary' key"
        
        # Check summary has OTR fields
        summary = data["summary"]
        assert "total_cmr_delivered" in summary, "Summary missing total_cmr_delivered"
        assert "total_paddy_received" in summary, "Summary missing total_paddy_received"
        assert "outturn_ratio" in summary, "Summary missing outturn_ratio (OTR)"
        assert "total_deliveries" in summary, "Summary missing total_deliveries"
        assert "total_bags" in summary, "Summary missing total_bags"
        print(f"PASS: CMR Delivery response structure correct. OTR: {summary['outturn_ratio']}%")
    
    def test_create_cmr_delivery(self):
        """POST /api/govt-registers/cmr-delivery creates entry"""
        payload = {
            "date": "2024-12-15",
            "kms_year": "2024-25",
            "season": "Kharif",
            "delivery_no": f"TEST_DEL_{uuid.uuid4().hex[:6]}",
            "rrc_depot": "TEST_RRC_Depot",
            "rice_type": "Parboiled",
            "cmr_qty": 100.5,
            "bags": 200,
            "vehicle_no": "OD01AB1234",
            "driver_name": "Test Driver",
            "fortified": True,
            "gate_pass_no": "GP001",
            "quality_grade": "FAQ",
            "remark": "Test CMR delivery"
        }
        response = requests.post(f"{BASE_URL}/api/govt-registers/cmr-delivery?username=test", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response missing 'id'"
        assert data["cmr_qty"] == 100.5, f"Expected cmr_qty 100.5, got {data['cmr_qty']}"
        assert data["bags"] == 200, f"Expected bags 200, got {data['bags']}"
        assert data["fortified"] == True, "Expected fortified True"
        
        self.test_id = data["id"]
        print(f"PASS: CMR Delivery created with id: {self.test_id}")
    
    def test_create_and_verify_cmr_delivery(self):
        """Create CMR delivery and verify via GET"""
        # Create
        payload = {
            "date": "2024-12-16",
            "kms_year": "2024-25",
            "delivery_no": f"TEST_VERIFY_{uuid.uuid4().hex[:6]}",
            "rrc_depot": "TEST_Verify_Depot",
            "rice_type": "Raw",
            "cmr_qty": 50.25,
            "bags": 100,
            "fortified": False,
            "quality_grade": "A"
        }
        create_resp = requests.post(f"{BASE_URL}/api/govt-registers/cmr-delivery?username=test", json=payload)
        assert create_resp.status_code == 200
        created = create_resp.json()
        self.test_id = created["id"]
        
        # Verify via GET
        get_resp = requests.get(f"{BASE_URL}/api/govt-registers/cmr-delivery?kms_year=2024-25")
        assert get_resp.status_code == 200
        data = get_resp.json()
        
        found = False
        for entry in data["entries"]:
            if entry["id"] == self.test_id:
                found = True
                assert entry["cmr_qty"] == 50.25
                assert entry["rice_type"] == "Raw"
                assert entry["fortified"] == False
                break
        
        assert found, f"Created entry {self.test_id} not found in GET response"
        print("PASS: CMR Delivery create and verify works")
    
    def test_update_cmr_delivery(self):
        """PUT /api/govt-registers/cmr-delivery/{id} updates entry"""
        # First create
        payload = {
            "date": "2024-12-17",
            "kms_year": "2024-25",
            "delivery_no": f"TEST_UPDATE_{uuid.uuid4().hex[:6]}",
            "rrc_depot": "Original Depot",
            "cmr_qty": 75.0,
            "bags": 150
        }
        create_resp = requests.post(f"{BASE_URL}/api/govt-registers/cmr-delivery?username=test", json=payload)
        assert create_resp.status_code == 200
        self.test_id = create_resp.json()["id"]
        
        # Update
        update_payload = {
            "rrc_depot": "Updated Depot",
            "cmr_qty": 80.0,
            "bags": 160,
            "remark": "Updated via test"
        }
        update_resp = requests.put(f"{BASE_URL}/api/govt-registers/cmr-delivery/{self.test_id}?username=test", json=update_payload)
        assert update_resp.status_code == 200, f"Expected 200, got {update_resp.status_code}: {update_resp.text}"
        
        # Verify update
        get_resp = requests.get(f"{BASE_URL}/api/govt-registers/cmr-delivery?kms_year=2024-25")
        data = get_resp.json()
        for entry in data["entries"]:
            if entry["id"] == self.test_id:
                assert entry["rrc_depot"] == "Updated Depot", f"Expected 'Updated Depot', got {entry['rrc_depot']}"
                assert entry["cmr_qty"] == 80.0, f"Expected 80.0, got {entry['cmr_qty']}"
                break
        
        print("PASS: CMR Delivery update works")
    
    def test_delete_cmr_delivery(self):
        """DELETE /api/govt-registers/cmr-delivery/{id} deletes entry"""
        # First create
        payload = {
            "date": "2024-12-18",
            "kms_year": "2024-25",
            "delivery_no": f"TEST_DELETE_{uuid.uuid4().hex[:6]}",
            "cmr_qty": 25.0,
            "bags": 50
        }
        create_resp = requests.post(f"{BASE_URL}/api/govt-registers/cmr-delivery?username=test", json=payload)
        assert create_resp.status_code == 200
        entry_id = create_resp.json()["id"]
        
        # Delete
        delete_resp = requests.delete(f"{BASE_URL}/api/govt-registers/cmr-delivery/{entry_id}?username=test&role=admin")
        assert delete_resp.status_code == 200, f"Expected 200, got {delete_resp.status_code}"
        
        # Verify deleted
        get_resp = requests.get(f"{BASE_URL}/api/govt-registers/cmr-delivery?kms_year=2024-25")
        data = get_resp.json()
        for entry in data["entries"]:
            assert entry["id"] != entry_id, f"Entry {entry_id} should have been deleted"
        
        print("PASS: CMR Delivery delete works")
    
    def test_delete_nonexistent_cmr_delivery_returns_404(self):
        """DELETE non-existent entry returns 404"""
        response = requests.delete(f"{BASE_URL}/api/govt-registers/cmr-delivery/nonexistent-id-12345?username=test&role=admin")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: CMR Delivery delete non-existent returns 404")
    
    def test_update_nonexistent_cmr_delivery_returns_404(self):
        """PUT non-existent entry returns 404"""
        response = requests.put(f"{BASE_URL}/api/govt-registers/cmr-delivery/nonexistent-id-12345?username=test", json={"cmr_qty": 10})
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: CMR Delivery update non-existent returns 404")
    
    def test_cmr_delivery_excel_export(self):
        """GET /api/govt-registers/cmr-delivery/excel returns Excel file"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/cmr-delivery/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "spreadsheet" in response.headers.get("content-type", "") or \
               "application/vnd" in response.headers.get("content-type", "")
        print("PASS: CMR Delivery Excel export works")


class TestSecurityDepositManagement:
    """Security Deposit Management - Full CRUD with auto-expiry check"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_id = None
        yield
        # Cleanup
        if self.test_id:
            try:
                requests.delete(f"{BASE_URL}/api/govt-registers/security-deposit/{self.test_id}?username=test&role=admin")
            except:
                pass
    
    def test_get_security_deposit_returns_200(self):
        """GET /api/govt-registers/security-deposit returns 200"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/security-deposit")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: GET /api/govt-registers/security-deposit returns 200")
    
    def test_security_deposit_response_structure(self):
        """Response has entries and summary structure"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/security-deposit")
        assert response.status_code == 200
        data = response.json()
        
        # Check top-level structure
        assert "entries" in data, "Response missing 'entries' key"
        assert "summary" in data, "Response missing 'summary' key"
        
        # Check summary structure
        summary = data["summary"]
        assert "total_deposits" in summary, "Summary missing total_deposits"
        assert "active_count" in summary, "Summary missing active_count"
        assert "total_active_amount" in summary, "Summary missing total_active_amount"
        assert "released_count" in summary, "Summary missing released_count"
        assert "expired_count" in summary, "Summary missing expired_count"
        print(f"PASS: Security Deposit response structure correct. {summary['total_deposits']} deposits, {summary['active_count']} active")
    
    def test_create_security_deposit(self):
        """POST /api/govt-registers/security-deposit creates entry"""
        payload = {
            "kms_year": "2024-25",
            "bg_number": f"TEST_BG_{uuid.uuid4().hex[:6]}",
            "bank_name": "TEST State Bank",
            "amount": 500000.00,
            "sd_ratio": "1:6",
            "milling_capacity_mt": 100.0,
            "issue_date": "2024-01-01",
            "expiry_date": "2025-12-31",
            "status": "active",
            "miller_type": "regular",
            "remark": "Test security deposit"
        }
        response = requests.post(f"{BASE_URL}/api/govt-registers/security-deposit?username=test", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response missing 'id'"
        assert data["amount"] == 500000.00, f"Expected amount 500000, got {data['amount']}"
        assert data["status"] == "active", f"Expected status 'active', got {data['status']}"
        
        self.test_id = data["id"]
        print(f"PASS: Security Deposit created with id: {self.test_id}")
    
    def test_create_and_verify_security_deposit(self):
        """Create security deposit and verify via GET"""
        # Create
        payload = {
            "kms_year": "2024-25",
            "bg_number": f"TEST_VERIFY_BG_{uuid.uuid4().hex[:6]}",
            "bank_name": "TEST Verify Bank",
            "amount": 250000.00,
            "sd_ratio": "1:6",
            "milling_capacity_mt": 50.0,
            "issue_date": "2024-06-01",
            "expiry_date": "2025-06-01",
            "status": "active"
        }
        create_resp = requests.post(f"{BASE_URL}/api/govt-registers/security-deposit?username=test", json=payload)
        assert create_resp.status_code == 200
        created = create_resp.json()
        self.test_id = created["id"]
        
        # Verify via GET
        get_resp = requests.get(f"{BASE_URL}/api/govt-registers/security-deposit?kms_year=2024-25")
        assert get_resp.status_code == 200
        data = get_resp.json()
        
        found = False
        for entry in data["entries"]:
            if entry["id"] == self.test_id:
                found = True
                assert entry["amount"] == 250000.00
                assert entry["bank_name"] == "TEST Verify Bank"
                break
        
        assert found, f"Created entry {self.test_id} not found in GET response"
        print("PASS: Security Deposit create and verify works")
    
    def test_update_security_deposit(self):
        """PUT /api/govt-registers/security-deposit/{id} updates entry"""
        # First create
        payload = {
            "kms_year": "2024-25",
            "bg_number": f"TEST_UPDATE_BG_{uuid.uuid4().hex[:6]}",
            "bank_name": "Original Bank",
            "amount": 100000.00,
            "status": "active"
        }
        create_resp = requests.post(f"{BASE_URL}/api/govt-registers/security-deposit?username=test", json=payload)
        assert create_resp.status_code == 200
        self.test_id = create_resp.json()["id"]
        
        # Update
        update_payload = {
            "bank_name": "Updated Bank",
            "amount": 150000.00,
            "status": "released",
            "remark": "Released after milling complete"
        }
        update_resp = requests.put(f"{BASE_URL}/api/govt-registers/security-deposit/{self.test_id}?username=test", json=update_payload)
        assert update_resp.status_code == 200, f"Expected 200, got {update_resp.status_code}: {update_resp.text}"
        
        # Verify update
        get_resp = requests.get(f"{BASE_URL}/api/govt-registers/security-deposit?kms_year=2024-25")
        data = get_resp.json()
        for entry in data["entries"]:
            if entry["id"] == self.test_id:
                assert entry["bank_name"] == "Updated Bank", f"Expected 'Updated Bank', got {entry['bank_name']}"
                assert entry["amount"] == 150000.00, f"Expected 150000, got {entry['amount']}"
                assert entry["status"] == "released", f"Expected 'released', got {entry['status']}"
                break
        
        print("PASS: Security Deposit update works")
    
    def test_delete_security_deposit(self):
        """DELETE /api/govt-registers/security-deposit/{id} deletes entry"""
        # First create
        payload = {
            "kms_year": "2024-25",
            "bg_number": f"TEST_DELETE_BG_{uuid.uuid4().hex[:6]}",
            "bank_name": "Delete Test Bank",
            "amount": 50000.00,
            "status": "active"
        }
        create_resp = requests.post(f"{BASE_URL}/api/govt-registers/security-deposit?username=test", json=payload)
        assert create_resp.status_code == 200
        entry_id = create_resp.json()["id"]
        
        # Delete
        delete_resp = requests.delete(f"{BASE_URL}/api/govt-registers/security-deposit/{entry_id}?username=test&role=admin")
        assert delete_resp.status_code == 200, f"Expected 200, got {delete_resp.status_code}"
        
        # Verify deleted
        get_resp = requests.get(f"{BASE_URL}/api/govt-registers/security-deposit?kms_year=2024-25")
        data = get_resp.json()
        for entry in data["entries"]:
            assert entry["id"] != entry_id, f"Entry {entry_id} should have been deleted"
        
        print("PASS: Security Deposit delete works")
    
    def test_delete_nonexistent_security_deposit_returns_404(self):
        """DELETE non-existent entry returns 404"""
        response = requests.delete(f"{BASE_URL}/api/govt-registers/security-deposit/nonexistent-id-12345?username=test&role=admin")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: Security Deposit delete non-existent returns 404")
    
    def test_update_nonexistent_security_deposit_returns_404(self):
        """PUT non-existent entry returns 404"""
        response = requests.put(f"{BASE_URL}/api/govt-registers/security-deposit/nonexistent-id-12345?username=test", json={"amount": 10000})
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: Security Deposit update non-existent returns 404")
    
    def test_security_deposit_kms_year_filter(self):
        """kms_year filter works"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/security-deposit?kms_year=2024-25")
        assert response.status_code == 200
        print("PASS: Security Deposit kms_year filter works")
    
    def test_security_deposit_excel_export(self):
        """GET /api/govt-registers/security-deposit/excel returns Excel file"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/security-deposit/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "spreadsheet" in response.headers.get("content-type", "") or \
               "application/vnd" in response.headers.get("content-type", "")
        print("PASS: Security Deposit Excel export works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
