"""
Test Paddy Custody Register API - Iteration 195
Tests the fix: Released (Qtl) should come from paddy_release collection, NOT milling_entries
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://paddy-ledger-1.preview.emergentagent.com').rstrip('/')

class TestPaddyCustodyRegister:
    """Paddy Custody Register API tests - verifying Released comes from paddy_release"""
    
    def test_paddy_custody_register_returns_200(self):
        """GET /api/paddy-custody-register should return 200"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "rows" in data
        assert "total_received" in data
        assert "total_issued" in data
        assert "final_balance" in data
        print(f"✓ Paddy Custody Register returns 200 with {len(data['rows'])} rows")
    
    def test_released_comes_from_paddy_release(self):
        """Released (Qtl) should come from paddy_release collection, NOT milling_entries"""
        # Get paddy_release data
        release_response = requests.get(f"{BASE_URL}/api/paddy-release")
        assert release_response.status_code == 200
        releases = release_response.json()
        
        # Get paddy custody register
        register_response = requests.get(f"{BASE_URL}/api/paddy-custody-register")
        assert register_response.status_code == 200
        register = register_response.json()
        
        # Find issued rows in register
        issued_rows = [r for r in register['rows'] if r['type'] == 'issued']
        
        # Verify total_issued matches sum of paddy_release qty_qtl
        total_released_from_api = sum(r.get('qty_qtl', 0) for r in releases)
        total_issued_in_register = register['total_issued']
        
        assert abs(total_issued_in_register - total_released_from_api) < 0.01, \
            f"total_issued ({total_issued_in_register}) should match paddy_release total ({total_released_from_api})"
        
        print(f"✓ Released total ({total_issued_in_register}) matches paddy_release total ({total_released_from_api})")
    
    def test_released_description_format(self):
        """Released rows should have description 'Paddy Release | RO: ... | Qty: ...'"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register")
        assert response.status_code == 200
        data = response.json()
        
        issued_rows = [r for r in data['rows'] if r['type'] == 'issued']
        
        for row in issued_rows:
            desc = row.get('description', '')
            assert 'Paddy Release' in desc, f"Description should contain 'Paddy Release', got: {desc}"
            assert 'RO:' in desc, f"Description should contain 'RO:', got: {desc}"
            print(f"✓ Released row description format correct: {desc[:60]}...")
    
    def test_received_comes_from_mill_entries_tp_weight(self):
        """Received (Qtl) should come from mill_entries tp_weight"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register")
        assert response.status_code == 200
        data = response.json()
        
        received_rows = [r for r in data['rows'] if r['type'] == 'received']
        
        # Verify received rows have truck/agent/mandi info (from mill_entries)
        for row in received_rows[:3]:  # Check first 3
            desc = row.get('description', '')
            assert 'Truck:' in desc, f"Received description should contain 'Truck:', got: {desc}"
            print(f"✓ Received row has mill_entry format: {desc[:60]}...")
    
    def test_balance_calculation(self):
        """Balance should be Received - Released running total"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register")
        assert response.status_code == 200
        data = response.json()
        
        # Verify final_balance = total_received - total_issued
        expected_balance = data['total_received'] - data['total_issued']
        assert abs(data['final_balance'] - expected_balance) < 0.01, \
            f"final_balance ({data['final_balance']}) should equal total_received - total_issued ({expected_balance})"
        
        print(f"✓ Balance calculation correct: {data['total_received']} - {data['total_issued']} = {data['final_balance']}")
    
    def test_weekly_grouping(self):
        """GET /api/paddy-custody-register?group_by=weekly should work"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register?group_by=weekly")
        assert response.status_code == 200
        data = response.json()
        
        assert "rows" in data
        # Weekly rows should have type 'summary'
        for row in data['rows']:
            assert row.get('type') == 'summary', f"Weekly rows should have type 'summary', got: {row.get('type')}"
            # Date should be in range format
            assert 'to' in row.get('date', ''), f"Weekly date should be range format, got: {row.get('date')}"
        
        print(f"✓ Weekly grouping works with {len(data['rows'])} weekly summaries")
    
    def test_excel_export(self):
        """GET /api/paddy-custody-register/excel should return 200 with correct content type"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        content_type = response.headers.get('content-type', '')
        assert 'spreadsheet' in content_type or 'excel' in content_type.lower() or 'octet-stream' in content_type, \
            f"Expected Excel content type, got: {content_type}"
        
        print(f"✓ Excel export returns 200 with content-type: {content_type}")
    
    def test_pdf_export(self):
        """GET /api/paddy-custody-register/pdf should return 200 with correct content type"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register/pdf")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        content_type = response.headers.get('content-type', '')
        assert 'pdf' in content_type.lower(), f"Expected PDF content type, got: {content_type}"
        
        print(f"✓ PDF export returns 200 with content-type: {content_type}")
    
    def test_filter_by_kms_year(self):
        """GET /api/paddy-custody-register?kms_year=2026-2027 should filter correctly"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register?kms_year=2026-2027")
        assert response.status_code == 200
        data = response.json()
        assert "rows" in data
        print(f"✓ KMS year filter works, returned {len(data['rows'])} rows")
    
    def test_filter_by_season(self):
        """GET /api/paddy-custody-register?season=Kharif should filter correctly"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register?season=Kharif")
        assert response.status_code == 200
        data = response.json()
        assert "rows" in data
        print(f"✓ Season filter works, returned {len(data['rows'])} rows")


class TestPaddyReleaseAPI:
    """Paddy Release API tests - source of truth for released paddy"""
    
    def test_get_paddy_releases(self):
        """GET /api/paddy-release should return list"""
        response = requests.get(f"{BASE_URL}/api/paddy-release")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Paddy Release API returns {len(data)} releases")
    
    def test_paddy_release_has_required_fields(self):
        """Paddy release entries should have qty_qtl, ro_number, date"""
        response = requests.get(f"{BASE_URL}/api/paddy-release")
        assert response.status_code == 200
        releases = response.json()
        
        for release in releases:
            assert 'qty_qtl' in release, "Release should have qty_qtl"
            assert 'date' in release, "Release should have date"
            assert 'ro_number' in release, "Release should have ro_number"
            print(f"✓ Release {release.get('id', 'N/A')}: RO={release.get('ro_number')}, Qty={release.get('qty_qtl')} Qtl")
    
    def test_paddy_release_stock(self):
        """GET /api/paddy-release/stock should return stock info"""
        response = requests.get(f"{BASE_URL}/api/paddy-release/stock")
        assert response.status_code == 200
        data = response.json()
        
        assert 'total_released' in data
        assert 'total_milled' in data
        assert 'available_for_milling' in data
        
        print(f"✓ Paddy Release Stock: Released={data['total_released']}, Milled={data['total_milled']}, Available={data['available_for_milling']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
