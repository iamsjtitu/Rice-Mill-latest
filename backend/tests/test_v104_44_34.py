"""
v104.44.34 Backend Tests
- RST check API regression
- Axios interceptor 422 flattening (tested via frontend)
- VW Next RST endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestRstCheckV104_44_34:
    """RST Check API - verify returns all entries including VW"""
    
    def test_rst_check_returns_vw_entries(self):
        """RST 7 should return 3 entries: 2 bp_sale_register + 1 vehicle_weights"""
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "7",
            "context": "sale"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Should have exists_same with entries
        assert "exists_same" in data
        same = data["exists_same"]
        
        # Count by collection
        bp_count = sum(1 for e in same if e.get("collection") == "bp_sale_register")
        vw_count = sum(1 for e in same if e.get("collection") == "vehicle_weights")
        
        print(f"RST 7 check: {len(same)} total, {bp_count} bp_sale_register, {vw_count} vehicle_weights")
        
        # Should have at least 2 bp_sale_register and 1 vehicle_weights
        assert bp_count >= 2, f"Expected at least 2 bp_sale_register, got {bp_count}"
        assert vw_count >= 1, f"Expected at least 1 vehicle_weights, got {vw_count}"
    
    def test_rst_check_vw_has_trans_type(self):
        """VW entries should include trans_type field"""
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "7",
            "context": "sale"
        })
        assert response.status_code == 200
        data = response.json()
        
        vw_entries = [e for e in data.get("exists_same", []) if e.get("collection") == "vehicle_weights"]
        assert len(vw_entries) > 0, "No VW entries found"
        
        for vw in vw_entries:
            assert "trans_type" in vw, "VW entry missing trans_type"
            print(f"VW entry trans_type: {vw.get('trans_type')}")


class TestVwNextRst:
    """VW Next RST endpoint"""
    
    def test_next_rst_endpoint(self):
        """GET /api/vehicle-weight/next-rst should return a number"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/next-rst", params={
            "kms_year": "2026-2027"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "rst_no" in data
        assert isinstance(data["rst_no"], int)
        print(f"Next RST: {data['rst_no']}")


class TestAxiosInterceptor422:
    """Test that 422 validation errors are properly formatted"""
    
    def test_entries_validation_error_format(self):
        """POST /api/entries with invalid data should return 422 with detail"""
        response = requests.post(
            f"{BASE_URL}/api/entries",
            params={"username": "admin", "role": "admin"},
            json={"kg": "invalid"}  # Invalid - should be number
        )
        
        # Should be 422 validation error
        assert response.status_code == 422
        data = response.json()
        
        # Should have detail field
        assert "detail" in data
        detail = data["detail"]
        
        # Detail should be either string (flattened by interceptor) or array (raw Pydantic)
        # Backend returns array, frontend interceptor flattens it
        print(f"422 detail type: {type(detail)}, value: {str(detail)[:200]}")
        
        if isinstance(detail, list):
            # Raw Pydantic format - each item has loc, msg, type
            assert len(detail) > 0
            for item in detail:
                assert "msg" in item or "message" in item
        elif isinstance(detail, str):
            # Already flattened
            assert len(detail) > 0


class TestGlobalAxiosInterceptorRegression:
    """Ensure axios interceptor doesn't break normal flows"""
    
    def test_get_requests_work(self):
        """GET requests should work normally"""
        response = requests.get(f"{BASE_URL}/api/entries", params={
            "kms_year": "2026-2027",
            "page": 1,
            "page_size": 10
        })
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data or isinstance(data, list)
    
    def test_non_422_errors_pass_through(self):
        """Non-422 errors should pass through unchanged"""
        # Try to access non-existent entry
        response = requests.get(f"{BASE_URL}/api/entries/nonexistent-id-12345")
        # Should be 404 or similar, not modified
        assert response.status_code in [404, 400, 422]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
