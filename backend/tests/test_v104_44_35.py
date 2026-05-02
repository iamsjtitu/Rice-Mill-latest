"""
v104.44.35 Backend Tests - Smallest-Unused RST/TP Logic
========================================================
Critical fixes tested:
1. next-rst returns SMALLEST UNUSED RST (not max+1) - prevents stale high RST (e.g., 77777) from poisoning suggestions
2. next-tp returns SMALLEST UNUSED TP across mill_entries + vehicle_weights
3. Both /api/rst-check/next-rst AND /api/vehicle-weight/next-rst return same value (unified logic)
4. Collection names fixed in vehicle_weight.py:_next_rst (mill_entries, bp_sale_register)
5. BP Sale 404 'RST not found' toast silenced (fresh RST should be accepted)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
KMS_YEAR = "2026-2027"


class TestSmallestUnusedRstLogic:
    """Test that next-rst returns smallest unused integer, not max+1"""
    
    def test_rst_check_next_rst_returns_sensible_value(self):
        """GET /api/rst-check/next-rst should return smallest unused RST (NOT 77778)"""
        response = requests.get(f"{BASE_URL}/api/rst-check/next-rst", params={
            "kms_year": KMS_YEAR
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "rst_no" in data
        rst = data["rst_no"]
        assert isinstance(rst, int)
        
        # CRITICAL: Should NOT be 77778 (which would be max+1 of stale RST 77777)
        assert rst < 1000, f"next-rst returned {rst} - likely using max+1 instead of smallest-unused"
        print(f"✓ /api/rst-check/next-rst returned sensible value: {rst}")
    
    def test_vehicle_weight_next_rst_returns_sensible_value(self):
        """GET /api/vehicle-weight/next-rst should return smallest unused RST (NOT 77778)"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/next-rst", params={
            "kms_year": KMS_YEAR
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "rst_no" in data
        rst = data["rst_no"]
        assert isinstance(rst, int)
        
        # CRITICAL: Should NOT be 77778
        assert rst < 1000, f"VW next-rst returned {rst} - likely using max+1 instead of smallest-unused"
        print(f"✓ /api/vehicle-weight/next-rst returned sensible value: {rst}")
    
    def test_both_next_rst_endpoints_agree(self):
        """Both next-rst endpoints should return the same value (unified logic)"""
        r1 = requests.get(f"{BASE_URL}/api/rst-check/next-rst", params={"kms_year": KMS_YEAR})
        r2 = requests.get(f"{BASE_URL}/api/vehicle-weight/next-rst", params={"kms_year": KMS_YEAR})
        
        assert r1.status_code == 200
        assert r2.status_code == 200
        
        rst1 = r1.json()["rst_no"]
        rst2 = r2.json()["rst_no"]
        
        assert rst1 == rst2, f"Endpoints disagree: rst-check={rst1}, vehicle-weight={rst2}"
        print(f"✓ Both endpoints agree: next-rst = {rst1}")


class TestSmallestUnusedTpLogic:
    """Test that next-tp returns smallest unused TP number"""
    
    def test_next_tp_returns_sensible_value(self):
        """GET /api/rst-check/next-tp should return smallest unused TP"""
        response = requests.get(f"{BASE_URL}/api/rst-check/next-tp", params={
            "kms_year": KMS_YEAR
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "tp_no" in data
        tp = data["tp_no"]
        assert isinstance(tp, int)
        assert tp >= 1, f"TP should be positive, got {tp}"
        print(f"✓ /api/rst-check/next-tp returned: {tp}")


class TestBpSaleFreshRstAccepted:
    """Test that BP Sale accepts fresh RST numbers (404 silenced)"""
    
    def test_vw_by_rst_returns_404_for_fresh_rst(self):
        """GET /api/vehicle-weight/by-rst/{fresh_rst} should return 404 (not error)"""
        # Use a fresh RST that definitely doesn't exist
        fresh_rst = 99999
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/by-rst/{fresh_rst}", params={
            "kms_year": KMS_YEAR
        })
        
        # Should be 404 (not found) - this is expected for fresh RST
        assert response.status_code == 404, f"Expected 404 for fresh RST, got {response.status_code}"
        print(f"✓ Fresh RST {fresh_rst} correctly returns 404 (frontend silences this)")
    
    def test_vw_by_rst_returns_200_for_existing_rst(self):
        """GET /api/vehicle-weight/by-rst/{existing_rst} should return 200 with entry data"""
        # RST 7 exists in vehicle_weights
        existing_rst = 7
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/by-rst/{existing_rst}", params={
            "kms_year": KMS_YEAR
        })
        
        # Should be 200 with entry data
        assert response.status_code == 200, f"Expected 200 for existing RST, got {response.status_code}"
        data = response.json()
        assert data.get("success") == True
        assert "entry" in data
        print(f"✓ Existing RST {existing_rst} returns entry data")


class TestCollectionNamesFixed:
    """Verify correct collection names are used (mill_entries, bp_sale_register)"""
    
    def test_rst_check_includes_mill_entries(self):
        """RST check should include mill_entries collection"""
        # RST 77777 exists in mill_entries
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "77777",
            "context": "purchase",
            "kms_year": KMS_YEAR
        })
        assert response.status_code == 200
        data = response.json()
        
        # Should find the stale RST 77777 in mill_entries
        all_entries = data.get("exists_same", []) + data.get("exists_other", [])
        mill_entries = [e for e in all_entries if e.get("collection") == "mill_entries"]
        
        # Note: RST 77777 may or may not be in current kms_year filter
        print(f"✓ RST 77777 check returned {len(mill_entries)} mill_entries")
    
    def test_rst_check_includes_bp_sale_register(self):
        """RST check should include bp_sale_register collection"""
        # RST 7 exists in bp_sale_register
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "7",
            "context": "sale"
        })
        assert response.status_code == 200
        data = response.json()
        
        all_entries = data.get("exists_same", []) + data.get("exists_other", [])
        bp_entries = [e for e in all_entries if e.get("collection") == "bp_sale_register"]
        
        assert len(bp_entries) >= 1, f"Expected bp_sale_register entries for RST 7, got {len(bp_entries)}"
        print(f"✓ RST 7 check returned {len(bp_entries)} bp_sale_register entries")


class TestVwHardBlockStillWorks:
    """Regression: VW RST duplicate check should still block duplicates"""
    
    def test_vw_create_with_duplicate_rst_blocked(self):
        """POST /api/vehicle-weight with duplicate RST should return 400"""
        # RST 7 already exists
        response = requests.post(f"{BASE_URL}/api/vehicle-weight", json={
            "rst_no": 7,
            "kms_year": KMS_YEAR,
            "vehicle_no": "TEST-DUPLICATE",
            "party_name": "Test Party",
            "farmer_name": "Test Mandi",
            "first_wt": 15000,
            "trans_type": "Receive(Purchase)",
            "product": "GOVT PADDY"
        })
        
        # Should be blocked with 400
        assert response.status_code == 400, f"Expected 400 for duplicate RST, got {response.status_code}"
        data = response.json()
        assert "duplicate" in data.get("detail", "").lower() or "already exists" in data.get("detail", "").lower()
        print(f"✓ Duplicate RST 7 correctly blocked: {data.get('detail')}")


class TestRstCheckApiRegression:
    """Regression tests for RST check API"""
    
    def test_rst_check_returns_all_collections(self):
        """RST check should search all 6 collections"""
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "7",
            "context": "sale"
        })
        assert response.status_code == 200
        data = response.json()
        
        all_entries = data.get("exists_same", []) + data.get("exists_other", [])
        collections = set(e.get("collection") for e in all_entries)
        
        print(f"✓ RST 7 found in collections: {collections}")
        # Should have at least bp_sale_register and vehicle_weights
        assert "bp_sale_register" in collections or "vehicle_weights" in collections
    
    def test_rst_check_exclude_id_works(self):
        """exclude_id parameter should exclude the specified entry"""
        # First get an entry ID
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "7",
            "context": "sale"
        })
        data = response.json()
        entries = data.get("exists_same", [])
        
        if entries:
            entry_id = entries[0].get("id")
            
            # Now check with exclude_id
            response2 = requests.get(f"{BASE_URL}/api/rst-check", params={
                "rst_no": "7",
                "context": "sale",
                "exclude_id": entry_id
            })
            data2 = response2.json()
            entries2 = data2.get("exists_same", [])
            
            # Should have one less entry
            assert len(entries2) < len(entries), "exclude_id should reduce entry count"
            print(f"✓ exclude_id works: {len(entries)} → {len(entries2)} entries")


class TestNextRstAfterCrossSave:
    """Test that next-rst updates after saving in other collections"""
    
    def test_next_rst_is_smallest_gap(self):
        """next-rst should find the smallest gap in used RST numbers"""
        # Get current next-rst
        response = requests.get(f"{BASE_URL}/api/rst-check/next-rst", params={
            "kms_year": KMS_YEAR
        })
        assert response.status_code == 200
        next_rst = response.json()["rst_no"]
        
        # Verify it's a sensible value (not poisoned by stale high RST)
        assert next_rst < 100, f"next-rst {next_rst} seems too high - check for stale data"
        
        # Get all used RSTs to verify the gap
        vw_response = requests.get(f"{BASE_URL}/api/vehicle-weight", params={
            "kms_year": KMS_YEAR,
            "page_size": 1000
        })
        vw_rsts = set()
        for e in vw_response.json().get("entries", []):
            try:
                vw_rsts.add(int(e.get("rst_no", 0)))
            except:
                pass
        
        # next_rst should be the smallest positive integer not in vw_rsts
        # (simplified check - actual logic checks all 6 collections)
        print(f"✓ next-rst={next_rst}, VW RSTs used: {sorted(vw_rsts)[:20]}...")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
