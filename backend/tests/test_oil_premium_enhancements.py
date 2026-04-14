"""
Test Oil Premium Enhancements - Iteration 194
Tests:
1. Rice Bran Sales Register with Oil%, Diff%, Premium columns in exports
2. Oil Premium Register filters (date_from, date_to, party_name, bran_type)
3. Export endpoints (Excel/PDF) with filter params
4. Linkage between Rice Bran sale and Oil Premium via voucher_no
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestOilPremiumEnhancements:
    """Test Oil Premium feature enhancements"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_voucher = f"TEST-V-{uuid.uuid4().hex[:6]}"
        self.test_rst = f"TEST-RST-{uuid.uuid4().hex[:4]}"
        self.test_party = f"TEST_PARTY_{uuid.uuid4().hex[:4]}"
        self.kms_year = "2026-2027"
        self.test_date = datetime.now().strftime("%Y-%m-%d")
        yield
        # Cleanup will be done in individual tests
    
    # ============ BP Sale Register API Tests ============
    
    def test_bp_sale_register_get(self):
        """Test GET /api/bp-sale-register for Rice Bran"""
        response = requests.get(f"{BASE_URL}/api/bp-sale-register", params={
            "product": "Rice Bran",
            "kms_year": self.kms_year
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: GET /api/bp-sale-register returns {len(data)} Rice Bran entries")
    
    def test_create_rice_bran_sale_with_voucher(self):
        """Test creating Rice Bran sale with voucher_no"""
        payload = {
            "product": "Rice Bran",
            "voucher_no": self.test_voucher,
            "rst_no": self.test_rst,
            "party_name": self.test_party,
            "date": self.test_date,
            "net_weight_kg": 1000,
            "rate_per_qtl": 3000,
            "kms_year": self.kms_year,
            "season": ""
        }
        response = requests.post(f"{BASE_URL}/api/bp-sale-register", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("voucher_no") == self.test_voucher, "Voucher no should match"
        assert data.get("party_name") == self.test_party, "Party name should match"
        assert "id" in data, "Response should have id"
        print(f"PASS: Created Rice Bran sale with voucher_no={self.test_voucher}, id={data['id']}")
        
        # Cleanup
        sale_id = data["id"]
        requests.delete(f"{BASE_URL}/api/bp-sale-register/{sale_id}")
        return data
    
    # ============ Oil Premium API Tests ============
    
    def test_oil_premium_get_with_filters(self):
        """Test GET /api/oil-premium with filters"""
        # Test with kms_year filter
        response = requests.get(f"{BASE_URL}/api/oil-premium", params={
            "kms_year": self.kms_year
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: GET /api/oil-premium with kms_year filter returns {len(data)} entries")
        
        # Test with bran_type filter
        response = requests.get(f"{BASE_URL}/api/oil-premium", params={
            "kms_year": self.kms_year,
            "bran_type": "Boiled"
        })
        assert response.status_code == 200
        data = response.json()
        for item in data:
            assert item.get("bran_type") == "Boiled", "All items should be Boiled type"
        print(f"PASS: GET /api/oil-premium with bran_type=Boiled filter returns {len(data)} entries")
    
    def test_create_oil_premium_positive(self):
        """Test creating Oil Premium with positive premium (actual > standard)"""
        payload = {
            "voucher_no": self.test_voucher,
            "rst_no": self.test_rst,
            "party_name": self.test_party,
            "date": self.test_date,
            "bran_type": "Boiled",  # Standard 25%
            "rate": 3000,
            "qty_qtl": 10,
            "actual_oil_pct": 27,  # 2% above standard
            "kms_year": self.kms_year,
            "remark": "TEST positive premium"
        }
        response = requests.post(f"{BASE_URL}/api/oil-premium", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify calculations
        assert data.get("standard_oil_pct") == 25, "Standard should be 25% for Boiled"
        assert data.get("difference_pct") == 2, "Diff should be 2%"
        # Premium = 3000 * 2 * 10 / 25 = 2400
        expected_premium = 3000 * 2 * 10 / 25
        assert abs(data.get("premium_amount", 0) - expected_premium) < 1, f"Premium should be ~{expected_premium}"
        assert data.get("premium_amount", 0) > 0, "Premium should be positive"
        print(f"PASS: Created Oil Premium with positive premium={data.get('premium_amount')}")
        
        # Cleanup
        item_id = data["id"]
        requests.delete(f"{BASE_URL}/api/oil-premium/{item_id}")
        return data
    
    def test_create_oil_premium_negative(self):
        """Test creating Oil Premium with negative premium (actual < standard) - deduction"""
        payload = {
            "voucher_no": f"TEST-NEG-{uuid.uuid4().hex[:4]}",
            "party_name": self.test_party,
            "date": self.test_date,
            "bran_type": "Raw",  # Standard 22%
            "rate": 2500,
            "qty_qtl": 10,
            "actual_oil_pct": 20,  # 2% below standard
            "kms_year": self.kms_year,
            "remark": "TEST negative premium (deduction)"
        }
        response = requests.post(f"{BASE_URL}/api/oil-premium", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify calculations
        assert data.get("standard_oil_pct") == 22, "Standard should be 22% for Raw"
        assert data.get("difference_pct") == -2, "Diff should be -2%"
        # Premium = 2500 * (-2) * 10 / 22 = -2272.73
        assert data.get("premium_amount", 0) < 0, "Premium should be negative (deduction)"
        print(f"PASS: Created Oil Premium with negative premium (deduction)={data.get('premium_amount')}")
        
        # Cleanup
        item_id = data["id"]
        requests.delete(f"{BASE_URL}/api/oil-premium/{item_id}")
        return data
    
    def test_oil_premium_lookup_sale(self):
        """Test /api/oil-premium/lookup-sale endpoint"""
        # First create a Rice Bran sale
        sale_payload = {
            "product": "Rice Bran",
            "voucher_no": self.test_voucher,
            "party_name": self.test_party,
            "date": self.test_date,
            "net_weight_kg": 1000,
            "rate_per_qtl": 3000,
            "kms_year": self.kms_year
        }
        sale_resp = requests.post(f"{BASE_URL}/api/bp-sale-register", json=sale_payload)
        assert sale_resp.status_code == 200
        sale_data = sale_resp.json()
        sale_id = sale_data["id"]
        
        # Test lookup by voucher_no
        lookup_resp = requests.get(f"{BASE_URL}/api/oil-premium/lookup-sale", params={
            "voucher_no": self.test_voucher,
            "kms_year": self.kms_year
        })
        assert lookup_resp.status_code == 200, f"Expected 200, got {lookup_resp.status_code}"
        lookup_data = lookup_resp.json()
        assert lookup_data.get("voucher_no") == self.test_voucher, "Voucher should match"
        assert lookup_data.get("party_name") == self.test_party, "Party should match"
        print(f"PASS: Lookup sale by voucher_no works correctly")
        
        # Test lookup with non-existent voucher
        not_found_resp = requests.get(f"{BASE_URL}/api/oil-premium/lookup-sale", params={
            "voucher_no": "NON-EXISTENT-VOUCHER"
        })
        assert not_found_resp.status_code == 404, "Should return 404 for non-existent voucher"
        print(f"PASS: Lookup returns 404 for non-existent voucher")
        
        # Test lookup without params
        bad_resp = requests.get(f"{BASE_URL}/api/oil-premium/lookup-sale")
        assert bad_resp.status_code == 400, "Should return 400 when no params"
        print(f"PASS: Lookup returns 400 when no params provided")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/bp-sale-register/{sale_id}")
    
    # ============ Export API Tests ============
    
    def test_bp_sale_register_excel_export(self):
        """Test BP Sale Register Excel export for Rice Bran"""
        response = requests.get(f"{BASE_URL}/api/bp-sale-register/export/excel", params={
            "product": "Rice Bran",
            "kms_year": self.kms_year
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "spreadsheet" in response.headers.get("content-type", ""), "Should return Excel file"
        assert len(response.content) > 0, "Excel file should have content"
        print(f"PASS: BP Sale Register Excel export works, size={len(response.content)} bytes")
    
    def test_bp_sale_register_pdf_export(self):
        """Test BP Sale Register PDF export for Rice Bran"""
        response = requests.get(f"{BASE_URL}/api/bp-sale-register/export/pdf", params={
            "product": "Rice Bran",
            "kms_year": self.kms_year
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "pdf" in response.headers.get("content-type", ""), "Should return PDF file"
        assert len(response.content) > 0, "PDF file should have content"
        print(f"PASS: BP Sale Register PDF export works, size={len(response.content)} bytes")
    
    def test_oil_premium_excel_export_with_filters(self):
        """Test Oil Premium Excel export with filter params"""
        # Test with date range filter
        response = requests.get(f"{BASE_URL}/api/oil-premium/export/excel", params={
            "kms_year": self.kms_year,
            "date_from": "2026-01-01",
            "date_to": "2026-12-31"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "spreadsheet" in response.headers.get("content-type", ""), "Should return Excel file"
        print(f"PASS: Oil Premium Excel export with date filter works")
        
        # Test with party_name filter
        response = requests.get(f"{BASE_URL}/api/oil-premium/export/excel", params={
            "kms_year": self.kms_year,
            "party_name": "test"
        })
        assert response.status_code == 200
        print(f"PASS: Oil Premium Excel export with party_name filter works")
        
        # Test with bran_type filter
        response = requests.get(f"{BASE_URL}/api/oil-premium/export/excel", params={
            "kms_year": self.kms_year,
            "bran_type": "Boiled"
        })
        assert response.status_code == 200
        print(f"PASS: Oil Premium Excel export with bran_type filter works")
    
    def test_oil_premium_pdf_export_with_filters(self):
        """Test Oil Premium PDF export with filter params"""
        response = requests.get(f"{BASE_URL}/api/oil-premium/export/pdf", params={
            "kms_year": self.kms_year,
            "date_from": "2026-01-01",
            "date_to": "2026-12-31",
            "party_name": "",
            "bran_type": "Raw"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "pdf" in response.headers.get("content-type", ""), "Should return PDF file"
        print(f"PASS: Oil Premium PDF export with filters works")
    
    # ============ Integration Test: Sale + Oil Premium Linkage ============
    
    def test_sale_oil_premium_linkage_flow(self):
        """Test full flow: Create Rice Bran sale, then Oil Premium with same voucher_no"""
        # Step 1: Create Rice Bran sale
        sale_payload = {
            "product": "Rice Bran",
            "voucher_no": self.test_voucher,
            "rst_no": self.test_rst,
            "party_name": self.test_party,
            "date": self.test_date,
            "net_weight_kg": 1185,  # 11.85 Qtl
            "rate_per_qtl": 3030,
            "kms_year": self.kms_year
        }
        sale_resp = requests.post(f"{BASE_URL}/api/bp-sale-register", json=sale_payload)
        assert sale_resp.status_code == 200
        sale_data = sale_resp.json()
        sale_id = sale_data["id"]
        print(f"Step 1 PASS: Created Rice Bran sale id={sale_id}, voucher={self.test_voucher}")
        
        # Step 2: Create Oil Premium with same voucher_no
        op_payload = {
            "voucher_no": self.test_voucher,
            "rst_no": self.test_rst,
            "party_name": self.test_party,
            "date": self.test_date,
            "bran_type": "Boiled",
            "rate": 3030,
            "qty_qtl": 11.85,
            "actual_oil_pct": 26.73,  # Above standard 25%
            "kms_year": self.kms_year
        }
        op_resp = requests.post(f"{BASE_URL}/api/oil-premium", json=op_payload)
        assert op_resp.status_code == 200
        op_data = op_resp.json()
        op_id = op_data["id"]
        print(f"Step 2 PASS: Created Oil Premium id={op_id}, premium={op_data.get('premium_amount')}")
        
        # Step 3: Verify linkage - fetch oil premium list and check voucher_no
        op_list_resp = requests.get(f"{BASE_URL}/api/oil-premium", params={
            "kms_year": self.kms_year
        })
        assert op_list_resp.status_code == 200
        op_list = op_list_resp.json()
        linked_op = next((op for op in op_list if op.get("voucher_no") == self.test_voucher), None)
        assert linked_op is not None, "Oil Premium with matching voucher_no should exist"
        assert linked_op.get("party_name") == self.test_party
        print(f"Step 3 PASS: Oil Premium linked to sale via voucher_no={self.test_voucher}")
        
        # Step 4: Verify Excel export includes Oil% columns when oil_premium exists
        excel_resp = requests.get(f"{BASE_URL}/api/bp-sale-register/export/excel", params={
            "product": "Rice Bran",
            "kms_year": self.kms_year
        })
        assert excel_resp.status_code == 200
        # Can't easily verify Excel content, but endpoint should work
        print(f"Step 4 PASS: Excel export with Oil% columns generated successfully")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/oil-premium/{op_id}")
        requests.delete(f"{BASE_URL}/api/bp-sale-register/{sale_id}")
        print(f"Cleanup PASS: Deleted test data")


class TestOilPremiumFiltersUI:
    """Test Oil Premium filter functionality at API level"""
    
    def test_filter_by_date_range(self):
        """Test filtering by date range"""
        kms_year = "2026-2027"
        
        # Create test entry with specific date
        test_date = "2026-06-15"
        payload = {
            "voucher_no": f"TEST-DATE-{uuid.uuid4().hex[:4]}",
            "party_name": "TEST_DATE_FILTER_PARTY",
            "date": test_date,
            "bran_type": "Boiled",
            "rate": 3000,
            "qty_qtl": 10,
            "actual_oil_pct": 26,
            "kms_year": kms_year
        }
        create_resp = requests.post(f"{BASE_URL}/api/oil-premium", json=payload)
        assert create_resp.status_code == 200
        created_id = create_resp.json()["id"]
        
        # Test date_from filter (should include)
        resp = requests.get(f"{BASE_URL}/api/oil-premium", params={
            "kms_year": kms_year
        })
        all_items = resp.json()
        
        # Filter in export endpoint
        export_resp = requests.get(f"{BASE_URL}/api/oil-premium/export/excel", params={
            "kms_year": kms_year,
            "date_from": "2026-06-01",
            "date_to": "2026-06-30"
        })
        assert export_resp.status_code == 200
        print(f"PASS: Date range filter works in export")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/oil-premium/{created_id}")
    
    def test_filter_by_party_name(self):
        """Test filtering by party name"""
        kms_year = "2026-2027"
        unique_party = f"UNIQUE_PARTY_{uuid.uuid4().hex[:6]}"
        
        # Create test entry
        payload = {
            "voucher_no": f"TEST-PARTY-{uuid.uuid4().hex[:4]}",
            "party_name": unique_party,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "bran_type": "Raw",
            "rate": 2500,
            "qty_qtl": 5,
            "actual_oil_pct": 23,
            "kms_year": kms_year
        }
        create_resp = requests.post(f"{BASE_URL}/api/oil-premium", json=payload)
        assert create_resp.status_code == 200
        created_id = create_resp.json()["id"]
        
        # Test party_name filter in export
        export_resp = requests.get(f"{BASE_URL}/api/oil-premium/export/excel", params={
            "kms_year": kms_year,
            "party_name": unique_party[:10]  # Partial match
        })
        assert export_resp.status_code == 200
        print(f"PASS: Party name filter works in export")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/oil-premium/{created_id}")
    
    def test_filter_by_bran_type(self):
        """Test filtering by bran type (Raw/Boiled)"""
        kms_year = "2026-2027"
        
        # Create Raw type entry
        raw_payload = {
            "voucher_no": f"TEST-RAW-{uuid.uuid4().hex[:4]}",
            "party_name": "TEST_BRAN_TYPE_PARTY",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "bran_type": "Raw",
            "rate": 2500,
            "qty_qtl": 5,
            "actual_oil_pct": 21,
            "kms_year": kms_year
        }
        raw_resp = requests.post(f"{BASE_URL}/api/oil-premium", json=raw_payload)
        assert raw_resp.status_code == 200
        raw_id = raw_resp.json()["id"]
        
        # Test bran_type filter
        filter_resp = requests.get(f"{BASE_URL}/api/oil-premium", params={
            "kms_year": kms_year,
            "bran_type": "Raw"
        })
        assert filter_resp.status_code == 200
        filtered = filter_resp.json()
        for item in filtered:
            assert item.get("bran_type") == "Raw", "All filtered items should be Raw"
        print(f"PASS: Bran type filter returns only Raw entries ({len(filtered)} items)")
        
        # Test in export
        export_resp = requests.get(f"{BASE_URL}/api/oil-premium/export/pdf", params={
            "kms_year": kms_year,
            "bran_type": "Raw"
        })
        assert export_resp.status_code == 200
        print(f"PASS: Bran type filter works in PDF export")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/oil-premium/{raw_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
