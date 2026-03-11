"""
Private Trading Page Overhaul Tests - Iteration 49
Tests the following features:
1. Separate columns for Party, Mandi, Agent in the table
2. Balance calculation (not showing 0) 
3. PDF/Excel export functionality
4. Search/filter capability
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPrivatePaddyDataStructure:
    """Test that private paddy entries have the correct data structure with separate columns"""
    
    def test_01_get_private_paddy_entries(self):
        """Verify GET /api/private-paddy returns data with correct structure"""
        response = requests.get(f"{BASE_URL}/api/private-paddy")
        assert response.status_code == 200, f"GET /api/private-paddy failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} private paddy entries")
        assert len(data) >= 1, "Should have at least 1 entry (agent_extra from move-to-pvt)"
    
    def test_02_entry_has_separate_columns(self):
        """Verify entries have separate party_name, mandi_name, agent_name columns"""
        response = requests.get(f"{BASE_URL}/api/private-paddy")
        data = response.json()
        
        if len(data) == 0:
            pytest.skip("No entries to verify")
        
        entry = data[0]
        # Check all required columns exist
        required_fields = ['id', 'date', 'party_name', 'mandi_name', 'agent_name', 
                          'truck_no', 'kg', 'final_qntl', 'rate_per_qntl', 
                          'total_amount', 'paid_amount', 'balance']
        
        for field in required_fields:
            assert field in entry, f"Entry should have '{field}' field"
        
        print(f"Entry structure verified: party_name={entry.get('party_name')}, mandi_name={entry.get('mandi_name')}, agent_name={entry.get('agent_name')}")
    
    def test_03_balance_not_zero_for_agent_extra(self):
        """Verify balance is correctly calculated (not showing 0) for agent_extra entries"""
        response = requests.get(f"{BASE_URL}/api/private-paddy")
        data = response.json()
        
        # Find agent_extra entry (from move-to-pvt)
        agent_extra_entries = [e for e in data if e.get('source') == 'agent_extra']
        
        if len(agent_extra_entries) == 0:
            pytest.skip("No agent_extra entries to verify")
        
        entry = agent_extra_entries[0]
        balance = entry.get('balance', 0)
        total_amount = entry.get('total_amount', 0)
        paid_amount = entry.get('paid_amount', 0)
        
        expected_balance = total_amount - paid_amount
        
        print(f"Agent extra entry: total={total_amount}, paid={paid_amount}, balance={balance}")
        
        # Balance should not be 0 if total_amount > paid_amount
        if total_amount > paid_amount:
            assert balance > 0, f"Balance should be > 0 when total > paid. Got balance={balance}"
            assert abs(balance - expected_balance) < 1, f"Balance should be {expected_balance}, got {balance}"
        
        # Verify the specific entry from context (Rs.137,484 balance)
        if entry.get('mandi_name') == 'Utkela' and entry.get('agent_name') == 'Annu':
            assert balance == 137484.0, f"Utkela/Annu entry should have balance=137484, got {balance}"
            print(f"VERIFIED: Utkela/Annu entry has correct balance Rs.{balance}")
    
    def test_04_final_qntl_correct_for_agent_extra(self):
        """Verify final_qntl shows correct value (76.38 Q) for agent_extra entries"""
        response = requests.get(f"{BASE_URL}/api/private-paddy")
        data = response.json()
        
        agent_extra_entries = [e for e in data if e.get('source') == 'agent_extra']
        
        if len(agent_extra_entries) == 0:
            pytest.skip("No agent_extra entries to verify")
        
        entry = agent_extra_entries[0]
        final_qntl = entry.get('final_qntl') or entry.get('quantity_qntl', 0)
        
        print(f"Agent extra entry: final_qntl={final_qntl}")
        
        # Verify the specific entry from context (76.38 Q)
        if entry.get('mandi_name') == 'Utkela' and entry.get('agent_name') == 'Annu':
            assert final_qntl == 76.38, f"Utkela/Annu entry should have final_qntl=76.38, got {final_qntl}"
            print(f"VERIFIED: Utkela/Annu entry has correct final_qntl {final_qntl} Q")


class TestPrivatePaddyExports:
    """Test PDF and Excel export functionality for Private Paddy"""
    
    def test_05_pdf_export_success(self):
        """Verify PDF export endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/private-paddy/pdf")
        assert response.status_code == 200, f"GET /api/private-paddy/pdf failed: {response.text}"
        assert 'application/pdf' in response.headers.get('Content-Type', ''), "Should return PDF content type"
        assert len(response.content) > 1000, f"PDF should have content, got {len(response.content)} bytes"
        print(f"PDF export successful: {len(response.content)} bytes")
    
    def test_06_excel_export_success(self):
        """Verify Excel export endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/private-paddy/excel")
        assert response.status_code == 200, f"GET /api/private-paddy/excel failed: {response.text}"
        assert 'spreadsheet' in response.headers.get('Content-Type', ''), "Should return Excel content type"
        assert len(response.content) > 1000, f"Excel should have content, got {len(response.content)} bytes"
        print(f"Excel export successful: {len(response.content)} bytes")
    
    def test_07_pdf_export_with_filters(self):
        """Test PDF export with kms_year and season filters"""
        response = requests.get(f"{BASE_URL}/api/private-paddy/pdf?kms_year=2024-2025&season=Kharif")
        assert response.status_code == 200, f"PDF export with filters failed: {response.text}"
        print(f"PDF export with filters successful: {len(response.content)} bytes")
    
    def test_08_excel_export_with_search(self):
        """Test Excel export with search filter"""
        response = requests.get(f"{BASE_URL}/api/private-paddy/excel?search=Utkela")
        assert response.status_code == 200, f"Excel export with search failed: {response.text}"
        print(f"Excel export with search successful: {len(response.content)} bytes")


class TestRiceSalesExports:
    """Test PDF and Excel export functionality for Rice Sales"""
    
    def test_09_rice_sales_pdf_export(self):
        """Verify Rice Sales PDF export endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/rice-sales/pdf")
        assert response.status_code == 200, f"GET /api/rice-sales/pdf failed: {response.text}"
        assert 'application/pdf' in response.headers.get('Content-Type', ''), "Should return PDF content type"
        print(f"Rice Sales PDF export successful: {len(response.content)} bytes")
    
    def test_10_rice_sales_excel_export(self):
        """Verify Rice Sales Excel export endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/rice-sales/excel")
        assert response.status_code == 200, f"GET /api/rice-sales/excel failed: {response.text}"
        assert 'spreadsheet' in response.headers.get('Content-Type', ''), "Should return Excel content type"
        print(f"Rice Sales Excel export successful: {len(response.content)} bytes")


class TestPrivatePaddySearch:
    """Test search/filter capability for Private Paddy"""
    
    def test_11_search_by_party_name(self):
        """Test searching by party name"""
        response = requests.get(f"{BASE_URL}/api/private-paddy?party_name=Annu")
        assert response.status_code == 200, f"Search by party_name failed: {response.text}"
        data = response.json()
        print(f"Search by party_name 'Annu': Found {len(data)} entries")
    
    def test_12_filter_by_kms_year_season(self):
        """Test filtering by kms_year and season"""
        response = requests.get(f"{BASE_URL}/api/private-paddy?kms_year=2024-2025&season=Kharif")
        assert response.status_code == 200, f"Filter by kms_year/season failed: {response.text}"
        data = response.json()
        print(f"Filter by 2024-2025 Kharif: Found {len(data)} entries")


class TestReportConfigValidation:
    """Test that report config has the correct columns for private paddy report"""
    
    def test_13_private_paddy_report_config(self):
        """Verify report_config.json has private_paddy_report with correct columns"""
        import json
        config_path = '/app/shared/report_config.json'
        with open(config_path) as f:
            config = json.load(f)
        
        assert 'private_paddy_report' in config, "Config should have private_paddy_report"
        
        columns = config['private_paddy_report']['columns']
        column_fields = [c['field'] for c in columns]
        
        required_columns = ['date', 'party_name', 'mandi_name', 'agent_name', 'truck_no', 
                           'kg', 'final_qntl', 'rate_per_qntl', 'total_amount', 'paid_amount', 'balance']
        
        for col in required_columns:
            assert col in column_fields, f"Report config should have '{col}' column"
        
        print(f"Report config columns verified: {column_fields}")
    
    def test_14_rice_sales_report_config(self):
        """Verify report_config.json has rice_sales_report with correct columns"""
        import json
        config_path = '/app/shared/report_config.json'
        with open(config_path) as f:
            config = json.load(f)
        
        assert 'rice_sales_report' in config, "Config should have rice_sales_report"
        
        columns = config['rice_sales_report']['columns']
        column_fields = [c['field'] for c in columns]
        
        required_columns = ['date', 'party_name', 'rice_type', 'quantity_qntl', 
                           'rate_per_qntl', 'total_amount', 'paid_amount', 'balance', 'truck_no']
        
        for col in required_columns:
            assert col in column_fields, f"Rice sales report config should have '{col}' column"
        
        print(f"Rice sales report config columns verified: {column_fields}")


class TestSummaryCardTotals:
    """Test that summary card totals are calculated correctly"""
    
    def test_15_verify_totals_calculation(self):
        """Verify that totals match expected values based on entries"""
        response = requests.get(f"{BASE_URL}/api/private-paddy")
        data = response.json()
        
        total_entries = len(data)
        total_qntl = sum(e.get('final_qntl') or e.get('quantity_qntl', 0) for e in data)
        total_amount = sum(e.get('total_amount', 0) for e in data)
        total_paid = sum(e.get('paid_amount', 0) for e in data)
        total_balance = sum(e.get('balance', 0) or (e.get('total_amount', 0) - e.get('paid_amount', 0)) for e in data)
        
        print(f"Backend Totals: Entries={total_entries}, Qntl={total_qntl}, Amount={total_amount}, Paid={total_paid}, Balance={total_balance}")
        
        # Verify balance calculation is correct
        expected_balance = total_amount - total_paid
        assert abs(total_balance - expected_balance) < 10, f"Total balance should be ~{expected_balance}, got {total_balance}"
        
        # Verify specific values from context
        if total_entries == 1:
            assert total_qntl == 76.38, f"Total qntl should be 76.38 Q, got {total_qntl}"
            assert total_balance == 137484.0, f"Total balance should be Rs.137,484, got {total_balance}"
            print(f"VERIFIED: Summary totals match expected values (76.38 Q, Rs.137,484 balance)")
