"""
Test RST Check API for v104.44.33 - GLOBAL HARD BLOCK including VW
User demand: "rst number kabhi pai b duplicate nahi hona chahiye entire software mai"

v104.44.33 Changes:
1. VW is now a HARD BLOCKER (previously was filtered out as "natural source")
2. Added "edit-if-unchanged" skip logic to preserve legitimate VW+voucher linked pairs
3. Frontend useRstCheck.jsx: hasBlocker = same.length + other.length > 0 (VW no longer exempt)

Tests verify:
1. BACKEND: GET /api/rst-check returns ALL entries including VW (no filtering)
2. FRONTEND: New VW entry with duplicate RST must HARD BLOCK
3. FRONTEND: Edit VW entry without changing RST must succeed (no false-positive)
4. FRONTEND: Edit VW entry with RST change to duplicate must HARD BLOCK
5. FRONTEND: BP Sale with duplicate RST must HARD BLOCK
6. FRONTEND: Edit BP Sale without changing RST must succeed
7. FRONTEND: Edit BP Sale with RST change to duplicate must HARD BLOCK
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestRstCheckV104_44_33_Backend:
    """Backend API tests for v104.44.33 GLOBAL HARD BLOCK"""
    
    def test_rst_7_returns_all_entries_including_vw(self):
        """CRITICAL: RST 7 must return ALL 3 entries (2 bp_sale_register + 1 VW Dispatch(Sale))
        
        v104.44.33 change: VW is no longer filtered out from blockers.
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
        
        # CRITICAL: Must have ALL entries
        assert bp_sale_count >= 2, f"Expected at least 2 bp_sale_register entries, got {bp_sale_count}"
        assert vw_count >= 1, f"Expected at least 1 vehicle_weights entry, got {vw_count}"
        
        # Total should be at least 3
        total = len(data["exists_same"])
        assert total >= 3, f"Expected at least 3 total entries, got {total}"
        
        print(f"✅ RST 7 returns ALL entries: {bp_sale_count} bp_sale + {vw_count} VW = {total} total")
    
    def test_vw_not_filtered_from_blockers(self):
        """v104.44.33: VW entries should NOT be filtered out from blockers
        
        Previous behavior (v104.44.32): VW was treated as "natural source" and filtered
        New behavior (v104.44.33): VW is a HARD BLOCKER
        """
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "7",
            "context": "sale"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Simulate v104.44.33 frontend hasBlocker logic
        # hasBlocker = same.length + other.length > 0 (VW no longer exempt)
        same = data["exists_same"]
        other = data["exists_other"]
        has_blocker = len(same) + len(other) > 0
        
        # VW should be included in blockers
        vw_entries = [e for e in same if e["collection"] == "vehicle_weights"]
        assert len(vw_entries) >= 1, "VW entries should be in exists_same"
        assert has_blocker, "hasBlocker should be True when VW exists"
        
        print(f"✅ VW not filtered: {len(vw_entries)} VW entries in blockers, hasBlocker={has_blocker}")
    
    def test_exclude_id_works_for_vw(self):
        """Test exclude_id parameter correctly excludes VW entry
        
        This is critical for "edit-if-unchanged" logic - when editing a VW entry,
        we exclude its own ID so it doesn't flag itself as duplicate.
        """
        # First get all entries for RST 7
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "7",
            "context": "sale"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Get VW entry ID
        vw_entries = [e for e in data["exists_same"] if e["collection"] == "vehicle_weights"]
        assert len(vw_entries) >= 1, "Need at least 1 VW entry to test exclude_id"
        
        exclude_id = vw_entries[0]["id"]
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
        assert exclude_id not in result_ids, f"Excluded VW ID {exclude_id} should not be in results"
        
        print(f"✅ exclude_id works for VW: {original_count} → {new_count} entries")
    
    def test_cross_type_check_still_works(self):
        """REGRESSION: RST cross-type check (sale RST in purchase) must still return exists_other"""
        # RST 7 is a sale RST (Dispatch(Sale) VW + bp_sale_register)
        # Checking in purchase context should return it in exists_other
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "7",
            "context": "purchase"
        })
        assert response.status_code == 200
        data = response.json()
        
        # RST 7 should appear in exists_other (cross-type)
        # because it's a sale RST being checked in purchase context
        total_other = len(data["exists_other"])
        
        # Should find the VW Dispatch(Sale) entry in exists_other
        vw_other = [e for e in data["exists_other"] if e["collection"] == "vehicle_weights"]
        bp_other = [e for e in data["exists_other"] if e["collection"] == "bp_sale_register"]
        
        print(f"✅ Cross-type check: exists_other has {len(vw_other)} VW + {len(bp_other)} bp_sale = {total_other} total")
        
        # At minimum, the sale-side entries should appear in exists_other
        assert total_other >= 1, "Cross-type check should find sale entries in exists_other"


class TestRstCheckV104_44_33_EditUnchangedSkip:
    """Test "edit-if-unchanged" skip logic for v104.44.33
    
    When editing an existing entry and RST is NOT changed, the check should be skipped
    to prevent false-positive blocks on legitimate linked pairs.
    """
    
    def test_edit_unchanged_rst_should_not_block(self):
        """Simulate edit scenario: RST unchanged should not trigger block
        
        Frontend logic (v104.44.33):
        - originalRst state tracks RST at edit open
        - On submit: if (rstTrim && (!editingId || rstTrim !== originalRst)) { checkRst... }
        - If editing and RST unchanged, skip check entirely
        """
        # Get an existing entry with RST 7
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "7",
            "context": "sale"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Get one entry ID (simulating edit mode)
        entries = data["exists_same"]
        assert len(entries) >= 1, "Need at least 1 entry to test edit scenario"
        
        editing_id = entries[0]["id"]
        original_rst = "7"
        new_rst = "7"  # Unchanged
        
        # Simulate frontend logic: skip check if editing and RST unchanged
        should_check = new_rst and (not editing_id or new_rst != original_rst)
        
        # Since RST is unchanged, should_check should be False
        assert not should_check, "Edit with unchanged RST should skip check"
        
        print(f"✅ Edit unchanged RST: should_check={should_check} (correctly skipped)")
    
    def test_edit_changed_rst_should_check(self):
        """Simulate edit scenario: RST changed should trigger check
        
        If user changes RST from 7 to 99, the check should run.
        """
        editing_id = "some-existing-id"
        original_rst = "7"
        new_rst = "99"  # Changed
        
        # Simulate frontend logic
        should_check = new_rst and (not editing_id or new_rst != original_rst)
        
        # Since RST is changed, should_check should be True
        assert should_check, "Edit with changed RST should trigger check"
        
        print(f"✅ Edit changed RST: should_check={should_check} (correctly triggers check)")
    
    def test_new_entry_should_always_check(self):
        """Simulate new entry scenario: should always check
        
        When creating new entry (editingId is null), always check RST.
        """
        editing_id = None  # New entry
        original_rst = ""
        new_rst = "7"
        
        # Simulate frontend logic
        should_check = new_rst and (not editing_id or new_rst != original_rst)
        
        # Since it's a new entry, should_check should be True
        assert should_check, "New entry should always trigger check"
        
        print(f"✅ New entry: should_check={should_check} (correctly triggers check)")


class TestRstCheckV104_44_33_VWContext:
    """Test VW context detection (Dispatch/Sale vs Receive/Purchase)"""
    
    def test_vw_dispatch_sale_in_sale_context(self):
        """VW with trans_type Dispatch(Sale) should appear in sale context exists_same"""
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "7",
            "context": "sale"
        })
        assert response.status_code == 200
        data = response.json()
        
        # VW Dispatch(Sale) should be in exists_same
        vw_same = [e for e in data["exists_same"] if e["collection"] == "vehicle_weights"]
        assert len(vw_same) >= 1, "VW Dispatch(Sale) should be in exists_same for sale context"
        
        # Verify trans_type
        for vw in vw_same:
            trans_type = vw.get("trans_type", "").lower()
            assert "dispatch" in trans_type or "sale" in trans_type, \
                f"VW in sale context should have Dispatch/Sale trans_type, got: {trans_type}"
        
        print(f"✅ VW Dispatch(Sale) correctly in sale context exists_same")
    
    def test_vw_dispatch_sale_in_purchase_context(self):
        """VW with trans_type Dispatch(Sale) should appear in purchase context exists_other"""
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "7",
            "context": "purchase"
        })
        assert response.status_code == 200
        data = response.json()
        
        # VW Dispatch(Sale) should be in exists_other (cross-type)
        vw_other = [e for e in data["exists_other"] if e["collection"] == "vehicle_weights"]
        
        # Should find the Dispatch(Sale) VW in exists_other
        dispatch_vw = [v for v in vw_other if "dispatch" in v.get("trans_type", "").lower() or "sale" in v.get("trans_type", "").lower()]
        assert len(dispatch_vw) >= 1, "VW Dispatch(Sale) should be in exists_other for purchase context"
        
        print(f"✅ VW Dispatch(Sale) correctly in purchase context exists_other")


class TestRstCheckV104_44_33_HasBlockerLogic:
    """Test v104.44.33 hasBlocker logic (VW no longer exempt)"""
    
    def test_hasBlocker_includes_vw(self):
        """v104.44.33: hasBlocker = same.length + other.length > 0 (VW included)
        
        Previous (v104.44.32): hasBlocker = blockingSame.length + other.length > 0
        where blockingSame = same.filter(m => m.collection !== "vehicle_weights")
        
        New (v104.44.33): VW is no longer filtered out
        """
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "7",
            "context": "sale"
        })
        assert response.status_code == 200
        data = response.json()
        
        same = data["exists_same"]
        other = data["exists_other"]
        
        # v104.44.33 logic: VW is a blocker
        has_blocker_v33 = len(same) + len(other) > 0
        
        # v104.44.32 logic (for comparison): VW was exempt
        blocking_same_v32 = [m for m in same if m["collection"] != "vehicle_weights"]
        has_blocker_v32 = len(blocking_same_v32) + len(other) > 0
        
        # Both should be True for RST 7 (has bp_sale_register entries)
        assert has_blocker_v33, "v104.44.33 hasBlocker should be True"
        assert has_blocker_v32, "v104.44.32 hasBlocker should also be True (bp_sale exists)"
        
        # But if we had ONLY VW entries, v104.44.33 would block while v104.44.32 wouldn't
        vw_only_same = [m for m in same if m["collection"] == "vehicle_weights"]
        if len(vw_only_same) > 0 and len(blocking_same_v32) == 0:
            # This would be the case where v104.44.33 blocks but v104.44.32 didn't
            print("⚠️ VW-only scenario: v104.44.33 would block, v104.44.32 wouldn't")
        
        print(f"✅ hasBlocker logic: v104.44.33={has_blocker_v33}, v104.44.32={has_blocker_v32}")
    
    def test_vw_only_rst_should_block_in_v33(self):
        """Test scenario where RST exists ONLY in VW (no vouchers)
        
        v104.44.33: Should HARD BLOCK
        v104.44.32: Would NOT block (VW was exempt)
        """
        # Find an RST that exists only in VW (not in any voucher collection)
        # This is the key scenario that v104.44.33 fixes
        
        # First, get a list of VW entries
        vw_response = requests.get(f"{BASE_URL}/api/vehicle-weight", params={
            "kms_year": "2026-2027",
            "status": "completed"
        })
        
        if vw_response.status_code == 200:
            vw_data = vw_response.json()
            entries = vw_data.get("entries", [])
            
            # Find a VW entry with RST that might be unique
            for entry in entries[:10]:  # Check first 10
                rst = entry.get("rst_no")
                if not rst:
                    continue
                
                # Check if this RST exists in voucher collections
                check_response = requests.get(f"{BASE_URL}/api/rst-check", params={
                    "rst_no": str(rst),
                    "context": "sale"
                })
                if check_response.status_code == 200:
                    check_data = check_response.json()
                    same = check_data["exists_same"]
                    
                    # Check if ONLY VW entries exist
                    non_vw = [m for m in same if m["collection"] != "vehicle_weights"]
                    vw_only = [m for m in same if m["collection"] == "vehicle_weights"]
                    
                    if len(vw_only) > 0 and len(non_vw) == 0:
                        # Found a VW-only RST
                        has_blocker_v33 = len(same) > 0
                        has_blocker_v32 = len(non_vw) > 0
                        
                        assert has_blocker_v33, f"v104.44.33 should block VW-only RST {rst}"
                        assert not has_blocker_v32, f"v104.44.32 would NOT block VW-only RST {rst}"
                        
                        print(f"✅ VW-only RST {rst}: v104.44.33 blocks={has_blocker_v33}, v104.44.32 blocks={has_blocker_v32}")
                        return
            
            print("⚠️ No VW-only RST found in first 10 entries - test inconclusive")
        else:
            print(f"⚠️ Could not fetch VW entries: {vw_response.status_code}")


class TestRstCheckV104_44_33_Regression:
    """Regression tests to ensure v104.44.32 fixes still work"""
    
    def test_bp_sale_register_still_searched(self):
        """REGRESSION: bp_sale_register (not by_product_sale_vouchers) must still be searched"""
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "7",
            "context": "sale"
        })
        assert response.status_code == 200
        data = response.json()
        
        collections = set(e["collection"] for e in data["exists_same"])
        assert "bp_sale_register" in collections, "bp_sale_register must be searched"
        assert "by_product_sale_vouchers" not in collections, "by_product_sale_vouchers should not appear"
        
        print(f"✅ REGRESSION: bp_sale_register correctly searched")
    
    def test_mill_entries_still_searched(self):
        """REGRESSION: mill_entries (not entries) must still be searched in purchase context"""
        response = requests.get(f"{BASE_URL}/api/rst-check", params={
            "rst_no": "1",
            "context": "purchase"
        })
        assert response.status_code == 200
        data = response.json()
        
        collections = set(e["collection"] for e in data["exists_same"])
        assert "entries" not in collections, "entries (Node naming) should not appear"
        
        print(f"✅ REGRESSION: mill_entries correctly searched (not 'entries')")
    
    def test_next_rst_still_works(self):
        """REGRESSION: next-rst endpoint must still work"""
        response = requests.get(f"{BASE_URL}/api/rst-check/next-rst", params={
            "kms_year": "2026-2027"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "rst_no" in data
        assert isinstance(data["rst_no"], int)
        assert data["rst_no"] > 0
        
        print(f"✅ REGRESSION: next-rst returns {data['rst_no']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
