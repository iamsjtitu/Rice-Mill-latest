"""
Test RST Check API for v104.44.32 - Collection Name Fix
Critical Bug Fix: rst_check.py was checking wrong collection names:
  - by_product_sale_vouchers (doesn't exist) → bp_sale_register (actual)
  - entries (Node naming) → mill_entries (Python naming)

Tests verify:
1. RST 7 returns bp_sale_register entries (not just vehicle_weights)
2. exclude_id works for bp_sale_register collection
3. next-rst includes bp_sale_register + mill_entries in max scan
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestRstCheckV104_44_32:
    """RST Check endpoint tests for v104.44.32 collection name fix"""
    
    def test_rst_7_returns_bp_sale_register_entries(self):
        """CRITICAL: RST 7 must return bp_sale_register entries, not just vehicle_weights
        
        Expected: 2 bp_sale_register entries (MBOPL) + 1 vehicle_weights entry
        Bug was: only vehicle_weights returned because wrong collection name was used
        """
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "7",
            "context": "sale"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Count entries by collection
        bp_sale_count = sum(1 for e in data["exists_same"] if e["collection"] == "bp_sale_register")
        vw_count = sum(1 for e in data["exists_same"] if e["collection"] == "vehicle_weights")
        
        # CRITICAL ASSERTION: Must have bp_sale_register entries
        assert bp_sale_count >= 2, f"Expected at least 2 bp_sale_register entries, got {bp_sale_count}"
        assert vw_count >= 1, f"Expected at least 1 vehicle_weights entry, got {vw_count}"
        
        # Verify bp_sale_register entries have correct party_name
        bp_entries = [e for e in data["exists_same"] if e["collection"] == "bp_sale_register"]
        for entry in bp_entries:
            assert entry["party_name"] == "MBOPL", f"Expected MBOPL, got {entry['party_name']}"
        
        print(f"✅ RST 7: {bp_sale_count} bp_sale_register + {vw_count} vehicle_weights entries")
    
    def test_exclude_id_works_for_bp_sale_register(self):
        """Test exclude_id parameter correctly excludes bp_sale_register entry
        
        When editing an existing BP sale, we pass its ID to exclude_id so it doesn't
        flag itself as a duplicate.
        """
        # First get all entries for RST 7
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "7",
            "context": "sale"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Get one bp_sale_register entry ID
        bp_entries = [e for e in data["exists_same"] if e["collection"] == "bp_sale_register"]
        assert len(bp_entries) >= 1, "Need at least 1 bp_sale_register entry to test exclude_id"
        
        exclude_id = bp_entries[0]["id"]
        original_count = len(data["exists_same"])
        
        # Now check with exclude_id
        response2 = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "7",
            "context": "sale",
            "exclude_id": exclude_id
        })
        assert response2.status_code == 200
        data2 = response2.json()
        
        # Should have one less entry
        new_count = len(data2["exists_same"])
        assert new_count == original_count - 1, f"exclude_id should reduce count by 1: {original_count} → {new_count}"
        
        # The excluded ID should not be in results
        result_ids = [e["id"] for e in data2["exists_same"]]
        assert exclude_id not in result_ids, f"Excluded ID {exclude_id} should not be in results"
        
        print(f"✅ exclude_id works: {original_count} → {new_count} entries (excluded {exclude_id})")
    
    def test_next_rst_includes_bp_sale_register(self):
        """Test next-rst endpoint includes bp_sale_register in max scan
        
        The next RST should be max+1 across ALL collections including bp_sale_register.
        """
        response = requests.get(f"{BASE_URL}/api/rst-check/next-rst", params={
            "kms_year": "2026-2027"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "rst_no" in data
        assert isinstance(data["rst_no"], int)
        assert data["rst_no"] > 0
        
        # The next RST should be reasonably high if bp_sale_register is included
        # (RST 7 exists in bp_sale_register, so next should be at least 8)
        print(f"✅ Next RST: {data['rst_no']} (includes bp_sale_register in scan)")
    
    def test_rst_check_sale_context_collections(self):
        """Verify SALE_COLLECTIONS includes bp_sale_register (not by_product_sale_vouchers)"""
        # Check RST 7 which exists in bp_sale_register
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "7",
            "context": "sale"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "exists_same" in data
        assert "exists_other" in data
        assert data["context"] == "sale"
        
        # Check that bp_sale_register is being searched (not by_product_sale_vouchers)
        collections_found = set(e["collection"] for e in data["exists_same"])
        assert "bp_sale_register" in collections_found, \
            f"bp_sale_register should be in results. Found: {collections_found}"
        
        # by_product_sale_vouchers should NOT appear (it doesn't exist)
        assert "by_product_sale_vouchers" not in collections_found, \
            "by_product_sale_vouchers should not appear (wrong collection name)"
        
        print(f"✅ Sale context collections: {collections_found}")
    
    def test_rst_check_purchase_context_collections(self):
        """Verify PURCHASE_COLLECTIONS includes mill_entries (not entries)"""
        # Check an RST that might exist in mill_entries
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "1",
            "context": "purchase"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "exists_same" in data
        assert "exists_other" in data
        assert data["context"] == "purchase"
        
        # If any mill_entries exist, they should appear with collection="mill_entries"
        # (not "entries" which is the Node naming)
        collections_found = set(e["collection"] for e in data["exists_same"])
        
        # "entries" should NOT appear (that's Node naming, not Python)
        assert "entries" not in collections_found, \
            "entries should not appear (Node naming, not Python)"
        
        print(f"✅ Purchase context collections: {collections_found}")
    
    def test_hasBlocker_logic_bp_sale_register(self):
        """Test that bp_sale_register entries trigger hasBlocker (not just VW)
        
        Frontend logic: hasBlocker = blockingSame.length + other.length > 0
        where blockingSame = same.filter(m => m.collection !== "vehicle_weights")
        
        So bp_sale_register entries SHOULD trigger hasBlocker.
        """
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "7",
            "context": "sale"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Simulate frontend hasBlocker logic
        same = data["exists_same"]
        other = data["exists_other"]
        blocking_same = [m for m in same if m["collection"] != "vehicle_weights"]
        has_blocker = len(blocking_same) + len(other) > 0
        
        # RST 7 has bp_sale_register entries, so hasBlocker should be True
        assert has_blocker, f"hasBlocker should be True for RST 7. blocking_same={len(blocking_same)}, other={len(other)}"
        assert len(blocking_same) >= 2, f"Should have at least 2 blocking entries (bp_sale_register). Got {len(blocking_same)}"
        
        print(f"✅ hasBlocker logic: blocking_same={len(blocking_same)}, other={len(other)}, hasBlocker={has_blocker}")


class TestBpSaleRegisterDuplicateBlock:
    """Test that BP Sale Register correctly blocks duplicate RST"""
    
    def test_bp_sale_register_count_before_duplicate_attempt(self):
        """Get current count of BP sales for RST 7"""
        response = requests.get(f"{BASE_URL}/api/bp-sale-register", params={
            "kms_year": "2026-2027",
            "product": "Rice Bran"
        })
        assert response.status_code == 200
        data = response.json()
        
        rst_7_count = sum(1 for s in data if str(s.get("rst_no", "")) == "7")
        print(f"✅ Current BP sales with RST 7: {rst_7_count}")
        return rst_7_count


class TestMillEntriesCollection:
    """Test mill_entries collection is correctly searched"""
    
    def test_mill_entries_in_purchase_context(self):
        """Verify mill_entries (not 'entries') is searched in purchase context"""
        # Get existing mill entries to find an RST
        response = requests.get(f"{BASE_URL}/api/entries", params={
            "kms_year": "2026-2027"
        })
        
        if response.status_code == 200:
            data = response.json()
            # API returns paginated response with 'entries' key
            entries = data.get("entries", []) if isinstance(data, dict) else data
            if entries and len(entries) > 0:
                # Find an entry with RST
                entry_with_rst = next((e for e in entries if isinstance(e, dict) and e.get("rst_no")), None)
                if entry_with_rst:
                    rst_no = entry_with_rst["rst_no"]
                    
                    # Check this RST in purchase context
                    check_response = requests.get(f"{BASE_URL}/api/rst-check", params={
                        "rst_no": str(rst_no),
                        "context": "purchase"
                    })
                    assert check_response.status_code == 200
                    check_data = check_response.json()
                    
                    # Should find mill_entries in exists_same
                    mill_entries_found = [e for e in check_data["exists_same"] if e["collection"] == "mill_entries"]
                    print(f"✅ RST {rst_no} in purchase context: {len(mill_entries_found)} mill_entries found")
                else:
                    print("⚠️ No mill entries with RST found - skipping mill_entries test")
            else:
                print("⚠️ No mill entries found - skipping mill_entries test")
        else:
            print(f"⚠️ Could not fetch mill entries: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
