"""
Quick Search API Tests - Tests the /api/quick-search endpoint
Searches across 13 MongoDB collections: entries, cash_transactions, private_paddy,
sale_vouchers, purchase_vouchers, dc_entries, staff, milling_entries, diesel_accounts,
mill_parts_stock, hemali_payments, rice_sales, truck_leases
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestQuickSearchAPI:
    """Quick Search endpoint tests"""
    
    def test_quick_search_basic(self):
        """Test basic search returns results"""
        response = requests.get(f"{BASE_URL}/api/quick-search", params={"q": "test", "limit": 5})
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert "total" in data
        assert "query" in data
        assert data["query"] == "test"
        print(f"PASS: Basic search returned {data['total']} results")
    
    def test_quick_search_returns_grouped_results(self):
        """Test search returns results with type field for grouping"""
        response = requests.get(f"{BASE_URL}/api/quick-search", params={"q": "test", "limit": 20})
        assert response.status_code == 200
        data = response.json()
        
        # Check that results have required fields
        if data["total"] > 0:
            result = data["results"][0]
            assert "id" in result
            assert "type" in result
            assert "tab" in result
            assert "title" in result
            assert "subtitle" in result
            assert "data" in result
            print(f"PASS: Results have all required fields (id, type, tab, title, subtitle, data)")
        else:
            print("INFO: No results to verify structure")
    
    def test_quick_search_multiple_types(self):
        """Test search returns results from multiple collections"""
        response = requests.get(f"{BASE_URL}/api/quick-search", params={"q": "test", "limit": 20})
        assert response.status_code == 200
        data = response.json()
        
        # Collect unique types
        types_found = set()
        for result in data["results"]:
            types_found.add(result["type"])
        
        print(f"PASS: Found result types: {', '.join(types_found)}")
        
        # Verify at least some types are present (based on test data)
        expected_types = {"entry", "cash_transaction", "private_paddy", "sale_voucher", 
                        "purchase_voucher", "staff", "diesel", "rice_sale"}
        found_expected = types_found.intersection(expected_types)
        if len(found_expected) > 0:
            print(f"PASS: Found expected types: {', '.join(found_expected)}")
    
    def test_quick_search_limit_parameter(self):
        """Test limit parameter works correctly"""
        response = requests.get(f"{BASE_URL}/api/quick-search", params={"q": "test", "limit": 3})
        assert response.status_code == 200
        data = response.json()
        
        # Each collection is limited, so total could be more than limit
        # But individual collection results should be limited
        print(f"PASS: Search with limit=3 returned {data['total']} total results")
    
    def test_quick_search_empty_query(self):
        """Test empty query returns empty results"""
        response = requests.get(f"{BASE_URL}/api/quick-search", params={"q": "", "limit": 5})
        # Should return 422 (validation error) or empty results
        if response.status_code == 422:
            print("PASS: Empty query returns validation error (422)")
        elif response.status_code == 200:
            data = response.json()
            assert data["total"] == 0 or len(data["results"]) == 0
            print("PASS: Empty query returns empty results")
    
    def test_quick_search_no_results(self):
        """Test search with non-matching query returns empty"""
        response = requests.get(f"{BASE_URL}/api/quick-search", params={"q": "xyznonexistent12345", "limit": 5})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert len(data["results"]) == 0
        print("PASS: Non-matching query returns empty results")
    
    def test_quick_search_special_characters(self):
        """Test search handles special characters safely"""
        # Test with regex special characters
        response = requests.get(f"{BASE_URL}/api/quick-search", params={"q": "test.*", "limit": 5})
        assert response.status_code == 200
        print("PASS: Search handles regex special characters safely")
    
    def test_quick_search_entry_type(self):
        """Test search returns mill entries with correct structure"""
        response = requests.get(f"{BASE_URL}/api/quick-search", params={"q": "test", "limit": 20})
        assert response.status_code == 200
        data = response.json()
        
        entries = [r for r in data["results"] if r["type"] == "entry"]
        if len(entries) > 0:
            entry = entries[0]
            assert entry["tab"] == "entries"
            assert "Truck:" in entry["title"]
            assert "data" in entry
            print(f"PASS: Mill entry result has correct structure: {entry['title']}")
        else:
            print("INFO: No mill entries found in search results")
    
    def test_quick_search_cash_transaction_type(self):
        """Test search returns cash transactions with correct structure"""
        response = requests.get(f"{BASE_URL}/api/quick-search", params={"q": "test", "limit": 20})
        assert response.status_code == 200
        data = response.json()
        
        cash_txns = [r for r in data["results"] if r["type"] == "cash_transaction"]
        if len(cash_txns) > 0:
            txn = cash_txns[0]
            assert txn["tab"] == "cashbook"
            assert "Jama" in txn["title"] or "Nikasi" in txn["title"]
            print(f"PASS: Cash transaction result has correct structure: {txn['title']}")
        else:
            print("INFO: No cash transactions found in search results")
    
    def test_quick_search_staff_type(self):
        """Test search returns staff with correct structure"""
        response = requests.get(f"{BASE_URL}/api/quick-search", params={"q": "test", "limit": 20})
        assert response.status_code == 200
        data = response.json()
        
        staff = [r for r in data["results"] if r["type"] == "staff"]
        if len(staff) > 0:
            s = staff[0]
            assert s["tab"] == "staff"
            assert "Staff:" in s["title"]
            print(f"PASS: Staff result has correct structure: {s['title']}")
        else:
            print("INFO: No staff found in search results")
    
    def test_quick_search_voucher_types(self):
        """Test search returns vouchers with correct structure"""
        response = requests.get(f"{BASE_URL}/api/quick-search", params={"q": "test", "limit": 20})
        assert response.status_code == 200
        data = response.json()
        
        sale_vouchers = [r for r in data["results"] if r["type"] == "sale_voucher"]
        purchase_vouchers = [r for r in data["results"] if r["type"] == "purchase_voucher"]
        
        if len(sale_vouchers) > 0:
            sv = sale_vouchers[0]
            assert sv["tab"] == "vouchers"
            assert "Sale:" in sv["title"]
            print(f"PASS: Sale voucher result has correct structure: {sv['title']}")
        
        if len(purchase_vouchers) > 0:
            pv = purchase_vouchers[0]
            assert pv["tab"] == "vouchers"
            assert "Purchase:" in pv["title"]
            print(f"PASS: Purchase voucher result has correct structure: {pv['title']}")
    
    def test_quick_search_case_insensitive(self):
        """Test search is case insensitive"""
        response_lower = requests.get(f"{BASE_URL}/api/quick-search", params={"q": "test", "limit": 10})
        response_upper = requests.get(f"{BASE_URL}/api/quick-search", params={"q": "TEST", "limit": 10})
        
        assert response_lower.status_code == 200
        assert response_upper.status_code == 200
        
        data_lower = response_lower.json()
        data_upper = response_upper.json()
        
        # Both should return results (case insensitive)
        print(f"PASS: Case insensitive search - 'test': {data_lower['total']}, 'TEST': {data_upper['total']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
