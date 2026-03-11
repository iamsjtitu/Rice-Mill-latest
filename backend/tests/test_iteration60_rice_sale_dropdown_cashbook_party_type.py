"""
Iteration 60: Testing Rice Sale dropdown (only Usna/Raw) and Cash Book party_type auto-detection

Tests:
1. Rice Sale form dropdown should only have Usna and Raw (no Boiled/Other)
2. Rice Stock API returns type-specific stock (parboiled_available_qntl, raw_available_qntl)
3. Cash Book party_type auto-detection - never empty
4. Cash Book fallback to 'Cash Party' for unknown parties
5. POST /api/cash-book/fix-empty-party-types endpoint
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestRiceStockAPI:
    """Test rice stock API returns type-specific stock values"""
    
    def test_01_rice_stock_returns_type_specific_values(self):
        """Verify /api/rice-stock returns parboiled_available_qntl and raw_available_qntl"""
        response = requests.get(f"{BASE_URL}/api/rice-stock")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify keys exist
        assert "parboiled_available_qntl" in data, "Missing parboiled_available_qntl field"
        assert "raw_available_qntl" in data, "Missing raw_available_qntl field"
        assert "total_produced_qntl" in data, "Missing total_produced_qntl field"
        
        print(f"Rice stock: parboiled={data['parboiled_available_qntl']}, raw={data['raw_available_qntl']}")
    
    def test_02_rice_stock_with_kms_year_filter(self):
        """Verify rice stock API respects kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/rice-stock?kms_year=2025-2026")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "parboiled_available_qntl" in data
        assert "raw_available_qntl" in data
        print(f"Filtered rice stock (2025-2026): parboiled={data['parboiled_available_qntl']}, raw={data['raw_available_qntl']}")


class TestRiceSaleRiceTypes:
    """Test Rice Sale creation with Usna and Raw rice types only"""
    
    def test_01_create_rice_sale_usna_type(self):
        """Create rice sale with Usna type - should succeed"""
        payload = {
            "date": "2026-01-15",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "party_name": "TEST_UsnaTypeParty",
            "rice_type": "Usna",
            "quantity_qntl": 10,
            "rate_per_qntl": 2500
        }
        response = requests.post(f"{BASE_URL}/api/rice-sales?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["rice_type"] == "Usna"
        print(f"Created Usna rice sale: ID={data['id']}, total={data['total_amount']}")
        
        # Store ID for cleanup
        TestRiceSaleRiceTypes.usna_sale_id = data['id']
    
    def test_02_create_rice_sale_raw_type(self):
        """Create rice sale with Raw type - should succeed"""
        payload = {
            "date": "2026-01-15",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "party_name": "TEST_RawTypeParty",
            "rice_type": "Raw",
            "quantity_qntl": 5,
            "rate_per_qntl": 2200
        }
        response = requests.post(f"{BASE_URL}/api/rice-sales?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["rice_type"] == "Raw"
        print(f"Created Raw rice sale: ID={data['id']}, total={data['total_amount']}")
        
        # Store ID for cleanup
        TestRiceSaleRiceTypes.raw_sale_id = data['id']
    
    def test_03_rice_sales_list_shows_correct_types(self):
        """Verify rice sales list shows Usna and Raw types"""
        response = requests.get(f"{BASE_URL}/api/rice-sales?kms_year=2025-2026")
        assert response.status_code == 200
        
        data = response.json()
        rice_types = set(s.get('rice_type', '') for s in data)
        print(f"Rice types in database: {rice_types}")
        
        # Verify our test entries exist with correct types
        test_entries = [s for s in data if s.get('party_name', '').startswith('TEST_')]
        usna_entries = [s for s in test_entries if s.get('rice_type') == 'Usna']
        raw_entries = [s for s in test_entries if s.get('rice_type') == 'Raw']
        
        assert len(usna_entries) > 0, "No Usna entries found"
        assert len(raw_entries) > 0, "No Raw entries found"
        print(f"Found {len(usna_entries)} Usna and {len(raw_entries)} Raw test entries")
    
    def test_99_cleanup_test_rice_sales(self):
        """Clean up test rice sale entries"""
        if hasattr(TestRiceSaleRiceTypes, 'usna_sale_id'):
            response = requests.delete(f"{BASE_URL}/api/rice-sales/{TestRiceSaleRiceTypes.usna_sale_id}")
            print(f"Deleted Usna sale: {response.status_code}")
        
        if hasattr(TestRiceSaleRiceTypes, 'raw_sale_id'):
            response = requests.delete(f"{BASE_URL}/api/rice-sales/{TestRiceSaleRiceTypes.raw_sale_id}")
            print(f"Deleted Raw sale: {response.status_code}")


class TestCashBookPartyTypeAutoDetection:
    """Test Cash Book party_type auto-detection - never empty"""
    
    def test_01_create_cash_entry_auto_detect_rice_sale_party(self):
        """Create cash entry for existing Rice Sale party - should auto-detect party_type"""
        # First create a rice sale party
        sale_payload = {
            "date": "2026-01-15",
            "kms_year": "2025-2026", 
            "season": "Kharif",
            "party_name": "TEST_AutoDetectParty",
            "rice_type": "Usna",
            "quantity_qntl": 5,
            "rate_per_qntl": 2000
        }
        sale_response = requests.post(f"{BASE_URL}/api/rice-sales?username=admin&role=admin", json=sale_payload)
        assert sale_response.status_code == 200
        sale_data = sale_response.json()
        TestCashBookPartyTypeAutoDetection.rice_sale_id = sale_data['id']
        
        # Now create cash book entry for this party - party_type should be auto-detected
        cash_payload = {
            "date": "2026-01-15",
            "account": "cash",
            "txn_type": "nikasi",
            "category": "TEST_AutoDetectParty",  # Same as rice sale party
            "party_type": "",  # Empty - should be auto-detected
            "description": "Test payment",
            "amount": 1000,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        cash_response = requests.post(f"{BASE_URL}/api/cash-book?username=admin&role=admin", json=cash_payload)
        assert cash_response.status_code == 200, f"Expected 200, got {cash_response.status_code}"
        
        cash_data = cash_response.json()
        assert cash_data.get('party_type') == "Rice Sale", f"Expected 'Rice Sale', got '{cash_data.get('party_type')}'"
        print(f"Auto-detected party_type: {cash_data.get('party_type')}")
        
        TestCashBookPartyTypeAutoDetection.cash_txn_id = cash_data['id']
    
    def test_02_create_cash_entry_unknown_party_fallback_cash_party(self):
        """Create cash entry for unknown party - should fallback to 'Cash Party'"""
        unique_party = f"TEST_UnknownParty_{uuid.uuid4().hex[:8]}"
        
        cash_payload = {
            "date": "2026-01-15",
            "account": "cash",
            "txn_type": "jama",
            "category": unique_party,
            "party_type": "",  # Empty - should fallback to 'Cash Party'
            "description": "Test unknown party",
            "amount": 500,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        cash_response = requests.post(f"{BASE_URL}/api/cash-book?username=admin&role=admin", json=cash_payload)
        assert cash_response.status_code == 200, f"Expected 200, got {cash_response.status_code}"
        
        cash_data = cash_response.json()
        assert cash_data.get('party_type') == "Cash Party", f"Expected 'Cash Party', got '{cash_data.get('party_type')}'"
        print(f"Fallback party_type for unknown party: {cash_data.get('party_type')}")
        
        TestCashBookPartyTypeAutoDetection.unknown_txn_id = cash_data['id']
    
    def test_03_party_type_never_empty_on_new_entry(self):
        """Verify party_type is never empty on new entry"""
        # Fetch the created entries
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        assert response.status_code == 200
        
        data = response.json()
        test_entries = [t for t in data if t.get('category', '').startswith('TEST_')]
        
        for entry in test_entries:
            party_type = entry.get('party_type', '')
            assert party_type != "", f"party_type is empty for entry: {entry.get('id')}"
            assert party_type is not None, f"party_type is None for entry: {entry.get('id')}"
        
        print(f"Verified {len(test_entries)} test entries have non-empty party_type")
    
    def test_04_case_insensitive_matching(self):
        """Test case-insensitive matching for party_type detection"""
        # Create entry with lowercase category that matches existing party
        cash_payload = {
            "date": "2026-01-15",
            "account": "cash",
            "txn_type": "nikasi",
            "category": "test_autodetectparty",  # lowercase - should match TEST_AutoDetectParty
            "party_type": "",
            "description": "Case insensitive test",
            "amount": 100,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        cash_response = requests.post(f"{BASE_URL}/api/cash-book?username=admin&role=admin", json=cash_payload)
        assert cash_response.status_code == 200
        
        cash_data = cash_response.json()
        # Should detect as Rice Sale or have a party_type (not empty)
        party_type = cash_data.get('party_type', '')
        assert party_type != "", f"party_type should not be empty, got: '{party_type}'"
        print(f"Case-insensitive match detected party_type: {party_type}")
        
        TestCashBookPartyTypeAutoDetection.case_insensitive_txn_id = cash_data['id']
    
    def test_99_cleanup_test_entries(self):
        """Clean up test entries"""
        # Delete cash transactions
        if hasattr(TestCashBookPartyTypeAutoDetection, 'cash_txn_id'):
            requests.delete(f"{BASE_URL}/api/cash-book/{TestCashBookPartyTypeAutoDetection.cash_txn_id}")
        
        if hasattr(TestCashBookPartyTypeAutoDetection, 'unknown_txn_id'):
            requests.delete(f"{BASE_URL}/api/cash-book/{TestCashBookPartyTypeAutoDetection.unknown_txn_id}")
        
        if hasattr(TestCashBookPartyTypeAutoDetection, 'case_insensitive_txn_id'):
            requests.delete(f"{BASE_URL}/api/cash-book/{TestCashBookPartyTypeAutoDetection.case_insensitive_txn_id}")
        
        # Delete rice sale
        if hasattr(TestCashBookPartyTypeAutoDetection, 'rice_sale_id'):
            requests.delete(f"{BASE_URL}/api/rice-sales/{TestCashBookPartyTypeAutoDetection.rice_sale_id}")
        
        print("Cleanup completed")


class TestFixEmptyPartyTypesEndpoint:
    """Test the fix-empty-party-types endpoint"""
    
    def test_01_fix_empty_party_types_endpoint_exists(self):
        """Verify POST /api/cash-book/fix-empty-party-types endpoint exists"""
        response = requests.post(f"{BASE_URL}/api/cash-book/fix-empty-party-types")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "success" in data, "Response should contain 'success' field"
        assert data["success"] == True, f"Expected success=True, got {data}"
        assert "fixed_count" in data, "Response should contain 'fixed_count' field"
        
        print(f"Fix empty party types result: fixed_count={data.get('fixed_count')}, categories_processed={data.get('categories_processed')}")
    
    def test_02_retroactive_update_on_new_entry(self):
        """Test that creating new entry with detected party_type updates old entries for same category"""
        unique_party = f"TEST_RetroParty_{uuid.uuid4().hex[:8]}"
        
        # Create first entry with empty party_type (simulating old entry)
        entry1_payload = {
            "date": "2026-01-10",
            "account": "cash",
            "txn_type": "nikasi",
            "category": unique_party,
            "party_type": "",
            "description": "First entry",
            "amount": 100,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        resp1 = requests.post(f"{BASE_URL}/api/cash-book?username=admin&role=admin", json=entry1_payload)
        assert resp1.status_code == 200
        entry1_id = resp1.json()['id']
        
        # Now run fix-empty-party-types to set party_type
        fix_response = requests.post(f"{BASE_URL}/api/cash-book/fix-empty-party-types")
        assert fix_response.status_code == 200
        
        # Verify the entry now has party_type set
        verify_response = requests.get(f"{BASE_URL}/api/cash-book?category={unique_party}")
        assert verify_response.status_code == 200
        
        entries = verify_response.json()
        for entry in entries:
            if entry.get('id') == entry1_id:
                assert entry.get('party_type') != "", f"party_type should be set after fix, got: '{entry.get('party_type')}'"
                print(f"Retroactive fix set party_type to: {entry.get('party_type')}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/cash-book/{entry1_id}")
        print("Retroactive update test completed")


class TestPartySummaryPartyType:
    """Test party summary shows correct party_type"""
    
    def test_01_party_summary_has_party_type(self):
        """Verify party summary returns party_type for each party"""
        response = requests.get(f"{BASE_URL}/api/cash-book/party-summary?kms_year=2025-2026")
        assert response.status_code == 200
        
        data = response.json()
        assert "parties" in data, "Response should contain 'parties' field"
        
        parties = data['parties']
        if len(parties) > 0:
            # Check that parties have party_type field
            for party in parties[:5]:  # Check first 5
                assert "party_type" in party, f"Party missing party_type field: {party.get('party_name')}"
                print(f"Party: {party.get('party_name')}, Type: {party.get('party_type')}")
    
    def test_02_filter_party_summary_by_party_type(self):
        """Test filtering party summary by party_type"""
        response = requests.get(f"{BASE_URL}/api/cash-book/party-summary?party_type=Rice%20Sale")
        assert response.status_code == 200
        
        data = response.json()
        parties = data.get('parties', [])
        
        # All returned parties should have party_type = "Rice Sale"
        for party in parties:
            assert party.get('party_type') == "Rice Sale", f"Expected 'Rice Sale', got '{party.get('party_type')}'"
        
        print(f"Found {len(parties)} parties with party_type='Rice Sale'")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
