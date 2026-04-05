"""
Iteration 170 - Test View Dialog and PPR Navigation Features
Tests:
1. GET /api/entries/{entry_id} - Fetch single entry by ID
2. round_amount function - Banker's rounding (>0.50 up, <=0.50 down)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestEntryByIdEndpoint:
    """Test GET /api/entries/{entry_id} endpoint"""
    
    def test_get_entry_by_id_success(self):
        """Test fetching a single entry by ID"""
        # First get list of entries to get a valid ID
        response = requests.get(f"{BASE_URL}/api/entries?kms_year=2025-2026&page_size=1")
        assert response.status_code == 200
        data = response.json()
        
        if data.get('entries') and len(data['entries']) > 0:
            entry_id = data['entries'][0]['id']
            
            # Now fetch by ID
            response = requests.get(f"{BASE_URL}/api/entries/{entry_id}")
            assert response.status_code == 200
            
            entry = response.json()
            assert 'id' in entry
            assert entry['id'] == entry_id
            assert 'date' in entry
            assert 'kms_year' in entry
            assert 'season' in entry
            assert 'truck_no' in entry
            assert 'agent_name' in entry
            assert 'mandi_name' in entry
            print(f"SUCCESS: Entry {entry_id} fetched with truck_no: {entry.get('truck_no')}")
        else:
            pytest.skip("No entries found in 2025-2026 FY")
    
    def test_get_entry_by_invalid_id(self):
        """Test fetching entry with invalid ID returns 404"""
        response = requests.get(f"{BASE_URL}/api/entries/invalid-uuid-12345")
        assert response.status_code == 404
        print("SUCCESS: Invalid ID returns 404")
    
    def test_entry_has_all_required_fields(self):
        """Test that entry response contains all required fields for View dialog"""
        response = requests.get(f"{BASE_URL}/api/entries?kms_year=2025-2026&page_size=1")
        assert response.status_code == 200
        data = response.json()
        
        if data.get('entries') and len(data['entries']) > 0:
            entry_id = data['entries'][0]['id']
            response = requests.get(f"{BASE_URL}/api/entries/{entry_id}")
            assert response.status_code == 200
            
            entry = response.json()
            
            # Required fields for View dialog
            required_fields = [
                'id', 'date', 'kms_year', 'season', 'truck_no', 'rst_no', 'tp_no',
                'agent_name', 'mandi_name', 'qntl', 'bag', 'g_deposite', 'gbw_cut',
                'plastic_bag', 'p_pkt_cut', 'mill_w', 'moisture', 'moisture_cut',
                'cutting_percent', 'cutting', 'disc_dust_poll', 'final_w', 'g_issued',
                'kg', 'cash_paid', 'diesel_paid', 'created_by', 'created_at', 'remark'
            ]
            
            for field in required_fields:
                assert field in entry, f"Missing field: {field}"
            
            print(f"SUCCESS: Entry has all {len(required_fields)} required fields")
        else:
            pytest.skip("No entries found in 2025-2026 FY")


class TestRoundAmountFunction:
    """Test round_amount function from models.py"""
    
    def test_round_amount_above_half(self):
        """Test round_amount(4000.51) = 4001 (rounds up)"""
        import sys
        sys.path.insert(0, '/app/backend')
        from models import round_amount
        
        result = round_amount(4000.51)
        assert result == 4001, f"Expected 4001, got {result}"
        print(f"SUCCESS: round_amount(4000.51) = {result}")
    
    def test_round_amount_exactly_half(self):
        """Test round_amount(4000.50) = 4000 (rounds down)"""
        import sys
        sys.path.insert(0, '/app/backend')
        from models import round_amount
        
        result = round_amount(4000.50)
        assert result == 4000, f"Expected 4000, got {result}"
        print(f"SUCCESS: round_amount(4000.50) = {result}")
    
    def test_round_amount_below_half(self):
        """Test round_amount(4000.49) = 4000 (rounds down)"""
        import sys
        sys.path.insert(0, '/app/backend')
        from models import round_amount
        
        result = round_amount(4000.49)
        assert result == 4000, f"Expected 4000, got {result}"
        print(f"SUCCESS: round_amount(4000.49) = {result}")
    
    def test_round_amount_small_number(self):
        """Test round_amount(100.51) = 101"""
        import sys
        sys.path.insert(0, '/app/backend')
        from models import round_amount
        
        result = round_amount(100.51)
        assert result == 101, f"Expected 101, got {result}"
        print(f"SUCCESS: round_amount(100.51) = {result}")
    
    def test_round_amount_zero(self):
        """Test round_amount(0) = 0"""
        import sys
        sys.path.insert(0, '/app/backend')
        from models import round_amount
        
        result = round_amount(0)
        assert result == 0, f"Expected 0, got {result}"
        print(f"SUCCESS: round_amount(0) = {result}")


class TestEntriesListEndpoint:
    """Test entries list endpoint for PPR"""
    
    def test_entries_list_returns_data(self):
        """Test that entries list returns data for PPR"""
        response = requests.get(f"{BASE_URL}/api/entries?kms_year=2025-2026&page_size=10")
        assert response.status_code == 200
        
        data = response.json()
        assert 'entries' in data
        assert 'total' in data
        assert 'page' in data
        assert 'total_pages' in data
        
        print(f"SUCCESS: Entries list returned {data['total']} entries")
    
    def test_entries_have_id_for_navigation(self):
        """Test that each entry has an ID for PPR navigation"""
        response = requests.get(f"{BASE_URL}/api/entries?kms_year=2025-2026&page_size=5")
        assert response.status_code == 200
        
        data = response.json()
        for entry in data.get('entries', []):
            assert 'id' in entry, "Entry missing 'id' field"
            assert entry['id'], "Entry 'id' is empty"
        
        print(f"SUCCESS: All {len(data.get('entries', []))} entries have valid IDs")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
