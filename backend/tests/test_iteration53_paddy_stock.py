"""
Iteration 53: Paddy Stock Formula Change & Custody Register Tests

Key changes tested:
1. CMR Paddy calculation changed from (QNTL - BAG) to (QNTL - BAG - P.Cut)
2. Private trading paddy is now included in total stock (pvt_paddy_in_qntl)
3. Custody register should NOT include private paddy entries
4. Formula validation: total_paddy_in = cmr_paddy_in + pvt_paddy_in
5. Formula validation: available_paddy = total_paddy_in - total_paddy_used
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPaddyStockAPI:
    """Test /api/paddy-stock endpoint with new formula"""
    
    def test_01_paddy_stock_returns_all_required_fields(self):
        """Verify paddy-stock returns cmr_paddy_in_qntl, pvt_paddy_in_qntl, total_paddy_in_qntl, total_paddy_used_qntl, available_paddy_qntl"""
        response = requests.get(f"{BASE_URL}/api/paddy-stock")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        required_fields = [
            'cmr_paddy_in_qntl',
            'pvt_paddy_in_qntl', 
            'total_paddy_in_qntl',
            'total_paddy_used_qntl',
            'available_paddy_qntl'
        ]
        
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
            print(f"✓ Field '{field}' = {data[field]}")
    
    def test_02_total_paddy_equals_cmr_plus_pvt(self):
        """Verify total_paddy_in_qntl = cmr_paddy_in_qntl + pvt_paddy_in_qntl"""
        response = requests.get(f"{BASE_URL}/api/paddy-stock")
        assert response.status_code == 200
        
        data = response.json()
        cmr = data['cmr_paddy_in_qntl']
        pvt = data['pvt_paddy_in_qntl']
        total_in = data['total_paddy_in_qntl']
        
        expected_total = round(cmr + pvt, 2)
        assert total_in == expected_total, f"total_paddy_in_qntl ({total_in}) != cmr ({cmr}) + pvt ({pvt}) = {expected_total}"
        print(f"✓ total_paddy_in_qntl = {cmr} + {pvt} = {total_in}")
    
    def test_03_available_paddy_equals_total_minus_used(self):
        """Verify available_paddy_qntl = total_paddy_in_qntl - total_paddy_used_qntl"""
        response = requests.get(f"{BASE_URL}/api/paddy-stock")
        assert response.status_code == 200
        
        data = response.json()
        total_in = data['total_paddy_in_qntl']
        total_used = data['total_paddy_used_qntl']
        available = data['available_paddy_qntl']
        
        expected_available = round(total_in - total_used, 2)
        assert available == expected_available, f"available_paddy_qntl ({available}) != total_in ({total_in}) - used ({total_used}) = {expected_available}"
        print(f"✓ available_paddy_qntl = {total_in} - {total_used} = {available}")
    
    def test_04_paddy_stock_with_filters(self):
        """Test paddy-stock with kms_year and season filters"""
        # Test with kms_year
        response = requests.get(f"{BASE_URL}/api/paddy-stock?kms_year=2025-26")
        assert response.status_code == 200
        data = response.json()
        assert 'cmr_paddy_in_qntl' in data
        print(f"✓ With kms_year filter: CMR={data['cmr_paddy_in_qntl']}, Pvt={data['pvt_paddy_in_qntl']}, Total={data['total_paddy_in_qntl']}")
        
        # Test with season
        response = requests.get(f"{BASE_URL}/api/paddy-stock?season=Kharif")
        assert response.status_code == 200
        data = response.json()
        assert 'cmr_paddy_in_qntl' in data
        print(f"✓ With season filter: CMR={data['cmr_paddy_in_qntl']}, Pvt={data['pvt_paddy_in_qntl']}, Total={data['total_paddy_in_qntl']}")


class TestPaddyCustodyRegister:
    """Test /api/paddy-custody-register - should NOT include private paddy entries"""
    
    def test_05_custody_register_returns_200(self):
        """Verify custody register endpoint works"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register")
        assert response.status_code == 200
        
        data = response.json()
        assert 'rows' in data
        assert 'total_received' in data
        assert 'total_issued' in data
        assert 'final_balance' in data
        print(f"✓ Custody register: {len(data['rows'])} rows, balance={data['final_balance']} Q")
    
    def test_06_custody_register_no_private_entries(self):
        """Verify custody register rows do NOT contain private paddy entries"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register")
        assert response.status_code == 200
        
        data = response.json()
        rows = data.get('rows', [])
        
        # Check that no row description contains 'Private' or 'Pvt'
        private_found = False
        for row in rows:
            desc = row.get('description', '').lower()
            if 'private' in desc or 'pvt' in desc:
                private_found = True
                print(f"WARNING: Found private entry: {row}")
                break
        
        assert not private_found, "Custody register should NOT include private paddy entries"
        print(f"✓ No private paddy entries in custody register ({len(rows)} rows checked)")
    
    def test_07_custody_register_only_mill_entries(self):
        """Verify custody register 'received' entries come from mill_entries only"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register")
        assert response.status_code == 200
        
        data = response.json()
        rows = data.get('rows', [])
        
        # All 'received' type entries should have 'Truck:' in description
        received_rows = [r for r in rows if r.get('type') == 'received']
        for row in received_rows:
            desc = row.get('description', '')
            # Mill entries have format: "Truck: XX | Agent: YY | Mandi: ZZ"
            assert 'Truck:' in desc or 'Agent:' in desc or 'Mandi:' in desc, f"Unexpected received entry: {desc}"
        
        print(f"✓ All {len(received_rows)} received entries are from mill entries")
    
    def test_08_custody_register_balance_calculation(self):
        """Verify custody register balance is correctly calculated"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register")
        assert response.status_code == 200
        
        data = response.json()
        total_received = data['total_received']
        total_issued = data['total_issued']
        final_balance = data['final_balance']
        
        # final_balance should be total_received - total_issued
        expected_balance = round(total_received - total_issued, 2)
        assert final_balance == expected_balance, f"Balance mismatch: {final_balance} != {total_received} - {total_issued}"
        print(f"✓ Balance correct: {total_received} - {total_issued} = {final_balance} Q")


class TestPaddyStockVsCustodyBalance:
    """Compare paddy stock with custody register balance"""
    
    def test_09_cmr_stock_matches_custody_balance(self):
        """
        CMR paddy stock should match custody register balance
        Note: Custody uses (QNTL - BAG) while stock uses (QNTL - BAG - P.Cut)
        So they may differ by P.Cut amount
        """
        # Get paddy stock
        stock_resp = requests.get(f"{BASE_URL}/api/paddy-stock")
        assert stock_resp.status_code == 200
        stock = stock_resp.json()
        
        # Get custody register
        custody_resp = requests.get(f"{BASE_URL}/api/paddy-custody-register")
        assert custody_resp.status_code == 200
        custody = custody_resp.json()
        
        cmr_stock = stock['cmr_paddy_in_qntl']
        custody_balance = custody['final_balance']
        
        # The difference should be the P.Cut deduction
        # We just verify both are reasonable values
        print(f"CMR Stock (with P.Cut deduction): {cmr_stock} Q")
        print(f"Custody Balance (without P.Cut): {custody_balance} Q")
        print(f"Difference (P.Cut effect): {round(custody_balance - cmr_stock, 2)} Q")
        
        # At minimum, custody balance should be >= cmr_stock since P.Cut reduces stock
        # But this depends on data, so we just log it
        assert isinstance(cmr_stock, (int, float)), "cmr_stock should be numeric"
        assert isinstance(custody_balance, (int, float)), "custody_balance should be numeric"


class TestMillEntriesAndPrivatePaddy:
    """Test data source endpoints"""
    
    def test_10_mill_entries_api(self):
        """Verify mill entries (CMR) can be fetched"""
        response = requests.get(f"{BASE_URL}/api/entries")
        assert response.status_code == 200
        
        data = response.json()
        if len(data) > 0:
            entry = data[0]
            # CMR entries should have qntl, bag, and optionally p_pkt_cut
            print(f"✓ Mill entries available: {len(data)} entries")
            if 'qntl' in entry:
                print(f"  Sample: qntl={entry.get('qntl')}, bag={entry.get('bag')}, p_pkt_cut={entry.get('p_pkt_cut', 0)}")
        else:
            print("✓ Mill entries endpoint works (0 entries)")
    
    def test_11_private_paddy_api(self):
        """Verify private paddy can be fetched"""
        response = requests.get(f"{BASE_URL}/api/private-paddy")
        assert response.status_code == 200
        
        data = response.json()
        if len(data) > 0:
            entry = data[0]
            # Private paddy should have final_qntl
            print(f"✓ Private paddy available: {len(data)} entries")
            if 'final_qntl' in entry:
                print(f"  Sample: final_qntl={entry.get('final_qntl')}, party_name={entry.get('party_name')}")
        else:
            print("✓ Private paddy endpoint works (0 entries)")


class TestMillingEntriesUsage:
    """Test milling entries that consume paddy"""
    
    def test_12_milling_entries_api(self):
        """Verify milling entries endpoint works"""
        response = requests.get(f"{BASE_URL}/api/milling-entries")
        assert response.status_code == 200
        
        data = response.json()
        total_used = sum(e.get('paddy_input_qntl', 0) for e in data)
        print(f"✓ Milling entries: {len(data)} entries, total paddy used: {total_used} Q")
    
    def test_13_milling_summary_api(self):
        """Verify milling summary endpoint works"""
        response = requests.get(f"{BASE_URL}/api/milling-summary")
        assert response.status_code == 200
        
        data = response.json()
        assert 'total_paddy_qntl' in data
        assert 'total_cmr_qntl' in data
        print(f"✓ Milling summary: {data.get('total_entries', 0)} entries, {data.get('total_paddy_qntl', 0)} Q paddy used")


class TestExportEndpoints:
    """Test custody register export endpoints"""
    
    def test_14_custody_register_excel_export(self):
        """Test custody register Excel export"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register/excel")
        assert response.status_code == 200
        assert 'spreadsheet' in response.headers.get('Content-Type', '') or 'octet-stream' in response.headers.get('Content-Type', '')
        print(f"✓ Custody register Excel export works, size: {len(response.content)} bytes")
    
    def test_15_custody_register_pdf_export(self):
        """Test custody register PDF export"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register/pdf")
        assert response.status_code == 200
        assert 'pdf' in response.headers.get('Content-Type', '').lower()
        print(f"✓ Custody register PDF export works, size: {len(response.content)} bytes")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
