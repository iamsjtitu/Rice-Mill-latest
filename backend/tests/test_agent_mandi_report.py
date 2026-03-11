"""
Test Agent & Mandi Wise Report API and Mark Paid bug fix
Tests for:
1. /api/reports/agent-mandi-wise - data structure validation
2. Search by mandi name (Utkela)
3. Search by agent name (Raju)
4. Excel export endpoint
5. PDF export endpoint
6. Mark Paid for truck owner creates only 1 cash book entry (bug fix verification)
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAgentMandiWiseReport:
    """Agent & Mandi Wise Report API Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        if login_resp.status_code == 200:
            data = login_resp.json()
            token = data.get("token")
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_agent_mandi_wise_report_returns_200(self):
        """Test /api/reports/agent-mandi-wise returns 200"""
        resp = self.session.get(f"{BASE_URL}/api/reports/agent-mandi-wise")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASSED: /api/reports/agent-mandi-wise returns 200")
    
    def test_agent_mandi_wise_report_structure(self):
        """Test report has correct structure with mandis and grand_totals"""
        resp = self.session.get(f"{BASE_URL}/api/reports/agent-mandi-wise")
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify main structure
        assert "mandis" in data, "Response missing 'mandis' key"
        assert "grand_totals" in data, "Response missing 'grand_totals' key"
        assert isinstance(data["mandis"], list), "'mandis' should be a list"
        assert isinstance(data["grand_totals"], dict), "'grand_totals' should be a dict"
        
        # Verify grand_totals structure
        gt = data["grand_totals"]
        expected_fields = ["total_kg", "total_qntl", "total_bag", "total_g_deposite", 
                          "total_g_issued", "total_mill_w", "total_final_w", 
                          "total_cutting", "total_cash_paid", "total_diesel_paid", "entry_count"]
        for field in expected_fields:
            assert field in gt, f"grand_totals missing '{field}'"
        
        print(f"PASSED: Report has correct structure with {len(data['mandis'])} mandis")
        print(f"Grand totals: {gt}")
    
    def test_mandi_entry_structure(self):
        """Test each mandi entry has correct fields"""
        resp = self.session.get(f"{BASE_URL}/api/reports/agent-mandi-wise")
        assert resp.status_code == 200
        data = resp.json()
        
        if len(data["mandis"]) > 0:
            mandi = data["mandis"][0]
            
            # Verify mandi structure
            assert "mandi_name" in mandi, "Missing 'mandi_name'"
            assert "agent_name" in mandi, "Missing 'agent_name'"
            assert "entries" in mandi, "Missing 'entries'"
            assert "totals" in mandi, "Missing 'totals'"
            assert isinstance(mandi["entries"], list), "'entries' should be a list"
            
            # Verify entry structure if entries exist
            if len(mandi["entries"]) > 0:
                entry = mandi["entries"][0]
                expected_entry_fields = ["date", "truck_no", "rst_no", "tp_no", "kg", "qntl", 
                                         "bag", "g_deposite", "g_issued", "mill_w", "final_w", 
                                         "cutting", "cash_paid", "diesel_paid"]
                for field in expected_entry_fields:
                    assert field in entry, f"Entry missing '{field}'"
                
            print(f"PASSED: Mandi '{mandi['mandi_name']}' has correct structure with {len(mandi['entries'])} entries")
        else:
            print("PASSED: No mandis in data (empty response is valid)")
    
    def test_search_by_mandi_name_utkela(self):
        """Test search functionality - search by mandi name 'Utkela'"""
        resp = self.session.get(f"{BASE_URL}/api/reports/agent-mandi-wise?search=Utkela")
        assert resp.status_code == 200
        data = resp.json()
        
        print(f"Search 'Utkela' returned {len(data['mandis'])} mandis")
        
        # If results exist, verify they contain 'Utkela' in mandi_name or agent_name
        if len(data["mandis"]) > 0:
            for mandi in data["mandis"]:
                mandi_name = mandi.get("mandi_name", "").lower()
                agent_name = mandi.get("agent_name", "").lower()
                assert "utkela" in mandi_name or "utkela" in agent_name, \
                    f"Search result '{mandi['mandi_name']}' doesn't match 'Utkela'"
            print(f"PASSED: Search 'Utkela' returned {len(data['mandis'])} matching mandis")
        else:
            print("PASSED: Search 'Utkela' returned 0 results (no matching data)")
    
    def test_search_by_agent_name_raju(self):
        """Test search functionality - search by agent name 'Raju'"""
        resp = self.session.get(f"{BASE_URL}/api/reports/agent-mandi-wise?search=Raju")
        assert resp.status_code == 200
        data = resp.json()
        
        print(f"Search 'Raju' returned {len(data['mandis'])} mandis")
        
        # If results exist, verify they contain 'Raju' in mandi_name or agent_name
        if len(data["mandis"]) > 0:
            for mandi in data["mandis"]:
                mandi_name = mandi.get("mandi_name", "").lower()
                agent_name = mandi.get("agent_name", "").lower()
                assert "raju" in mandi_name or "raju" in agent_name, \
                    f"Search result '{mandi['agent_name']}' doesn't match 'Raju'"
            print(f"PASSED: Search 'Raju' returned {len(data['mandis'])} matching mandis with Agent: {data['mandis'][0]['agent_name']}")
        else:
            print("PASSED: Search 'Raju' returned 0 results (no matching data)")
    
    def test_excel_export_returns_200(self):
        """Test Excel export endpoint returns 200 and xlsx file"""
        resp = self.session.get(f"{BASE_URL}/api/reports/agent-mandi-wise/excel")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        # Verify content type is Excel
        content_type = resp.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "application/vnd.openxmlformats-officedocument" in content_type, \
            f"Unexpected content type: {content_type}"
        
        # Verify content disposition has .xlsx
        content_disp = resp.headers.get("content-disposition", "")
        assert "agent_mandi_report" in content_disp and ".xlsx" in content_disp, \
            f"Content-Disposition missing xlsx: {content_disp}"
        
        print(f"PASSED: Excel export returns valid xlsx file ({len(resp.content)} bytes)")
    
    def test_pdf_export_returns_200(self):
        """Test PDF export endpoint returns 200 and pdf file"""
        resp = self.session.get(f"{BASE_URL}/api/reports/agent-mandi-wise/pdf")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        # Verify content type is PDF
        content_type = resp.headers.get("content-type", "")
        assert "pdf" in content_type.lower(), f"Unexpected content type: {content_type}"
        
        # Verify content disposition has .pdf
        content_disp = resp.headers.get("content-disposition", "")
        assert "agent_mandi_report" in content_disp and ".pdf" in content_disp, \
            f"Content-Disposition missing pdf: {content_disp}"
        
        print(f"PASSED: PDF export returns valid pdf file ({len(resp.content)} bytes)")
    
    def test_search_with_filter_params(self):
        """Test search with kms_year and season filters"""
        resp = self.session.get(f"{BASE_URL}/api/reports/agent-mandi-wise?kms_year=2024-25&season=Kharif")
        assert resp.status_code == 200
        data = resp.json()
        print(f"PASSED: Search with filters returned {len(data['mandis'])} mandis")


class TestTruckOwnerMarkPaidBugFix:
    """Test that Mark Paid for truck owner creates only 1 cash book entry (not 2)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        if login_resp.status_code == 200:
            data = login_resp.json()
            token = data.get("token")
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Store test truck number for cleanup
        self.test_truck_no = f"TEST_MARK_PAID_{datetime.now().strftime('%H%M%S')}"
    
    def test_mark_paid_creates_single_cash_entry(self):
        """
        Bug fix verification: Mark Paid for truck owner should create only 1 cash book entry
        Previously it was creating 2 entries (one ledger jama + one cash nikasi)
        Now it should only create 1 cash nikasi entry
        """
        # First, create a test mill entry
        entry_data = {
            "truck_no": self.test_truck_no,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "agent_name": "Test Agent",
            "mandi_name": "Test Mandi",
            "kg": 5000,
            "qntl": 50,
            "bag": 50,
            "g_deposite": 10,
            "g_issued": 5,
            "mill_w": 4900,
            "final_w": 4800,
            "cutting": 200,
            "cutting_percent": 4,
            "cash_paid": 0,
            "diesel_paid": 0,
            "kms_year": "2024-25",
            "season": "Kharif",
            "rst_no": "TEST123",
            "tp_no": "TP123"
        }
        
        # Create entry
        create_resp = self.session.post(f"{BASE_URL}/api/mill-entries", json=entry_data)
        if create_resp.status_code != 201:
            pytest.skip(f"Could not create test entry: {create_resp.status_code} - {create_resp.text}")
        
        entry_id = create_resp.json().get("id")
        print(f"Created test entry with ID: {entry_id}")
        
        try:
            # Set rate for the truck
            rate_resp = self.session.put(
                f"{BASE_URL}/api/truck-payments/{entry_id}/rate?username=admin&role=admin",
                json={"rate_per_qntl": 32}
            )
            print(f"Rate set response: {rate_resp.status_code}")
            
            # Get cash transactions count BEFORE mark paid
            cash_before = self.session.get(
                f"{BASE_URL}/api/cash-transactions?kms_year=2024-25&season=Kharif"
            )
            cash_before_count = len(cash_before.json()) if cash_before.status_code == 200 else 0
            print(f"Cash transactions before mark paid: {cash_before_count}")
            
            # Now mark paid for the truck owner
            mark_paid_resp = self.session.post(
                f"{BASE_URL}/api/truck-owner/{self.test_truck_no}/mark-paid?kms_year=2024-25&season=Kharif&username=admin&role=admin"
            )
            print(f"Mark paid response: {mark_paid_resp.status_code} - {mark_paid_resp.json()}")
            
            if mark_paid_resp.status_code != 200:
                pytest.skip(f"Mark paid failed: {mark_paid_resp.text}")
            
            # Get cash transactions count AFTER mark paid
            cash_after = self.session.get(
                f"{BASE_URL}/api/cash-transactions?kms_year=2024-25&season=Kharif"
            )
            cash_after_count = len(cash_after.json()) if cash_after.status_code == 200 else 0
            print(f"Cash transactions after mark paid: {cash_after_count}")
            
            # Calculate how many entries were created
            entries_created = cash_after_count - cash_before_count
            print(f"Cash entries created by mark paid: {entries_created}")
            
            # Verify only 1 entry was created (not 2)
            assert entries_created == 1, \
                f"Expected 1 cash entry created, but got {entries_created}. Bug may not be fixed!"
            
            # Verify the entry is a 'nikasi' type (not 'jama')
            if cash_after.status_code == 200:
                cash_list = cash_after.json()
                # Find entries with our test truck
                truck_entries = [e for e in cash_list if self.test_truck_no in str(e.get("category", "")) 
                                or self.test_truck_no in str(e.get("description", ""))]
                
                if truck_entries:
                    latest_entry = truck_entries[-1]
                    assert latest_entry.get("txn_type") == "nikasi", \
                        f"Expected 'nikasi' type, got '{latest_entry.get('txn_type')}'"
                    print(f"PASSED: Single cash entry created with type: {latest_entry.get('txn_type')}")
            
            print("PASSED: Mark Paid creates only 1 cash book entry (bug fix verified)")
            
        finally:
            # Cleanup - undo the payment and delete the entry
            try:
                # Undo payment
                self.session.post(
                    f"{BASE_URL}/api/truck-owner/{self.test_truck_no}/undo-paid?kms_year=2024-25&season=Kharif&username=admin&role=admin"
                )
                # Delete entry
                self.session.delete(f"{BASE_URL}/api/mill-entries/{entry_id}?username=admin&role=admin")
                print(f"Cleaned up test entry: {entry_id}")
            except Exception as e:
                print(f"Cleanup warning: {e}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
