"""
Test RST Check API and Transit Pass Register endpoints for v104.44.31
Tests:
1. RST duplicate detection (same context)
2. RST cross-type detection (sale vs purchase)
3. Transit Pass Register with mandi filter
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestRstCheck:
    """RST Check endpoint tests"""
    
    def test_rst_check_existing_rst_sale_context(self):
        """Test RST check with existing RST in sale context"""
        # RST 1 exists in vehicle_weights with Dispatch(Sale) trans_type
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "1",
            "context": "sale"
        })
        assert response.status_code == 200
        data = response.json()
        assert "exists_same" in data
        assert "exists_other" in data
        assert data["rst_no"] == "1"
        assert data["context"] == "sale"
        # Should find at least one entry in exists_same (VW Dispatch) or exists_other (VW Receive)
        total_found = len(data["exists_same"]) + len(data["exists_other"])
        assert total_found > 0, "RST 1 should exist in database"
        print(f"RST 1 check: exists_same={len(data['exists_same'])}, exists_other={len(data['exists_other'])}")
    
    def test_rst_check_existing_rst_purchase_context(self):
        """Test RST check with existing RST in purchase context"""
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "10",
            "context": "purchase"
        })
        assert response.status_code == 200
        data = response.json()
        assert "exists_same" in data
        assert "exists_other" in data
        print(f"RST 10 check: exists_same={len(data['exists_same'])}, exists_other={len(data['exists_other'])}")
    
    def test_rst_check_nonexistent_rst(self):
        """Test RST check with non-existent RST"""
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "999999",
            "context": "sale"
        })
        assert response.status_code == 200
        data = response.json()
        assert len(data["exists_same"]) == 0
        assert len(data["exists_other"]) == 0
        print("Non-existent RST 999999: no duplicates found (correct)")
    
    def test_rst_check_empty_rst(self):
        """Test RST check with empty RST"""
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "",
            "context": "sale"
        })
        assert response.status_code == 200
        data = response.json()
        assert len(data["exists_same"]) == 0
        assert len(data["exists_other"]) == 0
        print("Empty RST: returns empty arrays (correct)")
    
    def test_rst_check_with_exclude_id(self):
        """Test RST check with exclude_id parameter"""
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "1",
            "context": "sale",
            "exclude_id": "some-id-to-exclude"
        })
        assert response.status_code == 200
        data = response.json()
        # Should still work, just exclude the specified ID
        assert "exists_same" in data
        assert "exists_other" in data
        print(f"RST 1 with exclude_id: exists_same={len(data['exists_same'])}, exists_other={len(data['exists_other'])}")


class TestTransitPassRegister:
    """Transit Pass Register endpoint tests"""
    
    def test_transit_pass_register_list(self):
        """Test Transit Pass Register list endpoint"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/transit-pass", params={
            "kms_year": "2026-2027"
        })
        assert response.status_code == 200
        data = response.json()
        assert "rows" in data
        assert "summary" in data
        assert "filter_options" in data
        assert "mandis" in data["filter_options"]
        assert "agents" in data["filter_options"]
        print(f"Transit Pass Register: {len(data['rows'])} entries, {data['summary']['total_entries']} total")
    
    def test_transit_pass_register_with_mandi_filter(self):
        """Test Transit Pass Register with mandi filter"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/transit-pass", params={
            "kms_year": "2026-2027",
            "mandi_name": "Kesinga"
        })
        assert response.status_code == 200
        data = response.json()
        # All rows should have mandi_name = Kesinga (case-insensitive)
        for row in data["rows"]:
            assert row["mandi_name"].lower() == "kesinga", f"Mandi filter not working: {row['mandi_name']}"
        print(f"Transit Pass with Kesinga filter: {len(data['rows'])} entries")
    
    def test_transit_pass_excel_export(self):
        """Test Transit Pass Excel export"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/transit-pass/excel", params={
            "kms_year": "2026-2027"
        })
        assert response.status_code == 200
        assert "spreadsheet" in response.headers.get("content-type", "").lower() or \
               "octet-stream" in response.headers.get("content-type", "").lower()
        assert len(response.content) > 0
        print(f"Transit Pass Excel export: {len(response.content)} bytes")
    
    def test_transit_pass_excel_with_mandi_filter(self):
        """Test Transit Pass Excel export with mandi filter"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/transit-pass/excel", params={
            "kms_year": "2026-2027",
            "mandi_name": "Kesinga"
        })
        assert response.status_code == 200
        assert len(response.content) > 0
        print(f"Transit Pass Excel with Kesinga filter: {len(response.content)} bytes")
    
    def test_transit_pass_pdf_export(self):
        """Test Transit Pass PDF export"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/transit-pass/pdf", params={
            "kms_year": "2026-2027"
        })
        assert response.status_code == 200
        assert "pdf" in response.headers.get("content-type", "").lower()
        assert len(response.content) > 0
        print(f"Transit Pass PDF export: {len(response.content)} bytes")


class TestNextRstTp:
    """Next RST/TP number endpoints"""
    
    def test_next_rst(self):
        """Test next RST number endpoint"""
        response = requests.get(f"{BASE_URL}/api/rst-check/next-rst", params={
            "kms_year": "2026-2027"
        })
        assert response.status_code == 200
        data = response.json()
        assert "rst_no" in data
        assert isinstance(data["rst_no"], int)
        assert data["rst_no"] > 0
        print(f"Next RST: {data['rst_no']}")
    
    def test_next_tp(self):
        """Test next TP number endpoint"""
        response = requests.get(f"{BASE_URL}/api/rst-check/next-tp", params={
            "kms_year": "2026-2027"
        })
        assert response.status_code == 200
        data = response.json()
        assert "tp_no" in data
        assert isinstance(data["tp_no"], int)
        assert data["tp_no"] > 0
        print(f"Next TP: {data['tp_no']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
