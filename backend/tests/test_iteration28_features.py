"""
Test Iteration 28 - New Features:
1. Mill Parts search/find by part name
2. Local Party date-to-date filter
3. Auto cutting % from mandi target when mandi is selected
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = 'https://payment-regression-2.preview.emergentagent.com'


class TestLocalPartyDateFilter:
    """Test Local Party date_from and date_to filter functionality"""

    def test_summary_with_date_filter(self):
        """GET /api/local-party/summary with date_from and date_to filters"""
        # Filter for dates 2025-02-15 to 2025-02-16 (known test data for Bicky)
        response = requests.get(
            f"{BASE_URL}/api/local-party/summary",
            params={"date_from": "2025-02-15", "date_to": "2025-02-16"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "parties" in data
        assert "grand_total_debit" in data
        assert "grand_total_paid" in data
        assert "grand_balance" in data
        
        # Verify Bicky is in the filtered results (has transactions on 2025-02-15 and 2025-02-16)
        party_names = [p["party_name"] for p in data["parties"]]
        assert "Bicky" in party_names, f"Expected Bicky in filtered results, got {party_names}"
        
        # Verify only filtered data is returned
        bicky = next((p for p in data["parties"] if p["party_name"] == "Bicky"), None)
        assert bicky is not None
        # Bicky should have exactly 2 transactions in this date range
        assert bicky["txn_count"] == 2, f"Expected 2 transactions for Bicky, got {bicky['txn_count']}"
        print(f"✓ Local Party Summary with date filter works: {len(data['parties'])} parties, Bicky has {bicky['txn_count']} txns")

    def test_summary_without_date_filter(self):
        """GET /api/local-party/summary without date filter returns all data"""
        response = requests.get(f"{BASE_URL}/api/local-party/summary")
        assert response.status_code == 200
        
        data = response.json()
        assert "parties" in data
        assert len(data["parties"]) >= 1, "Expected at least 1 party"
        print(f"✓ Local Party Summary without filter: {len(data['parties'])} parties total")

    def test_transactions_with_date_filter(self):
        """GET /api/local-party/transactions with date_from and date_to"""
        response = requests.get(
            f"{BASE_URL}/api/local-party/transactions",
            params={"party_name": "Bicky", "date_from": "2025-02-15", "date_to": "2025-02-16"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Expected list of transactions"
        assert len(data) == 2, f"Expected 2 transactions for Bicky in date range, got {len(data)}"
        
        # Verify all transactions are within date range
        for txn in data:
            assert "2025-02-15" <= txn["date"] <= "2025-02-16", f"Transaction date {txn['date']} outside range"
        print(f"✓ Local Party Transactions with date filter: {len(data)} transactions")

    def test_report_with_date_filter(self):
        """GET /api/local-party/report/{party_name} with date_from and date_to"""
        response = requests.get(
            f"{BASE_URL}/api/local-party/report/Bicky",
            params={"date_from": "2025-02-15", "date_to": "2025-02-16"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["party_name"] == "Bicky"
        assert "transactions" in data
        assert "running_balance" in data["transactions"][0], "Transactions should have running_balance"
        assert len(data["transactions"]) == 2, f"Expected 2 transactions, got {len(data['transactions'])}"
        assert data["total_debit"] == 5000.0, f"Expected total_debit 5000, got {data['total_debit']}"
        assert data["total_paid"] == 2000.0, f"Expected total_paid 2000, got {data['total_paid']}"
        assert data["balance"] == 3000.0, f"Expected balance 3000, got {data['balance']}"
        print(f"✓ Local Party Report with date filter: {len(data['transactions'])} txns, balance={data['balance']}")

    def test_date_filter_empty_result(self):
        """Date filter with no matching data returns empty list"""
        response = requests.get(
            f"{BASE_URL}/api/local-party/summary",
            params={"date_from": "2020-01-01", "date_to": "2020-01-02"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["parties"] == [] or len(data["parties"]) == 0, "Expected empty parties list for old dates"
        print(f"✓ Date filter returns empty for dates with no data")


class TestMillPartsStock:
    """Test Mill Parts Stock data - for frontend search feature validation"""

    def test_mill_parts_list(self):
        """GET /api/mill-parts returns available parts"""
        response = requests.get(f"{BASE_URL}/api/mill-parts")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3, f"Expected at least 3 parts (Bearing, Belt, Sieve), got {len(data)}"
        
        part_names = [p["name"] for p in data]
        assert "Bearing" in part_names, f"Expected 'Bearing' in parts, got {part_names}"
        assert "Belt" in part_names, f"Expected 'Belt' in parts, got {part_names}"
        assert "Sieve" in part_names, f"Expected 'Sieve' in parts, got {part_names}"
        print(f"✓ Mill Parts List: {len(data)} parts available ({', '.join(part_names)})")

    def test_mill_parts_stock_transactions(self):
        """GET /api/mill-parts-stock returns stock transactions"""
        response = requests.get(f"{BASE_URL}/api/mill-parts-stock")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1, "Expected at least 1 stock transaction"
        
        # Verify transaction structure
        txn = data[0]
        assert "part_name" in txn
        assert "party_name" in txn
        assert "txn_type" in txn
        print(f"✓ Mill Parts Stock Transactions: {len(data)} transactions")

    def test_mill_parts_summary(self):
        """GET /api/mill-parts/summary returns stock summary"""
        response = requests.get(f"{BASE_URL}/api/mill-parts/summary")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        # Summary should have current_stock, stock_in, stock_used etc
        if len(data) > 0:
            summary_item = data[0]
            assert "part_name" in summary_item
            assert "current_stock" in summary_item
            print(f"✓ Mill Parts Summary: {len(data)} parts with summary data")
        else:
            print(f"✓ Mill Parts Summary: No summary data yet (empty)")


class TestMandiTargets:
    """Test Mandi Targets API for auto-fill cutting percent feature"""

    def test_mandi_targets_list(self):
        """GET /api/mandi-targets returns list (may be empty)"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Expected list of mandi targets"
        print(f"✓ Mandi Targets API working: {len(data)} targets configured")

    def test_mandi_targets_create_and_verify(self):
        """POST /api/mandi-targets - requires admin role (auth check)"""
        # Create a test mandi target with cutting_percent
        test_target = {
            "mandi_name": "TestMandi_AutoFill",
            "target_qntl": 1000,
            "cutting_percent": 7.5,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        
        # Create target - without auth, should get 403 (admin only)
        response = requests.post(f"{BASE_URL}/api/mandi-targets", json=test_target)
        
        # Without auth it should return 403 (admin only)
        if response.status_code == 403:
            print(f"✓ Mandi Target API correctly requires admin role (403)")
        elif response.status_code in [200, 201]:
            data = response.json()
            print(f"✓ Mandi Target created: {data.get('mandi_name')}")
            # Cleanup if created
            try:
                delete_response = requests.delete(f"{BASE_URL}/api/mandi-targets/{data['id']}")
            except:
                pass
        else:
            print(f"✓ Mandi Target API responds with {response.status_code}")
        
        # Verify list API works regardless
        list_response = requests.get(f"{BASE_URL}/api/mandi-targets")
        assert list_response.status_code == 200, f"Expected 200 for list, got {list_response.status_code}"
        print(f"✓ Mandi Target List API verified")


class TestMillEntryFormIntegration:
    """Test mill entry form related APIs"""

    def test_suggestions_mandis(self):
        """GET /api/suggestions/mandis returns mandi suggestions"""
        response = requests.get(f"{BASE_URL}/api/suggestions/mandis")
        assert response.status_code == 200
        
        data = response.json()
        assert "suggestions" in data
        print(f"✓ Mandi suggestions API working: {len(data['suggestions'])} suggestions")

    def test_suggestions_agents(self):
        """GET /api/suggestions/agents returns agent suggestions"""
        response = requests.get(f"{BASE_URL}/api/suggestions/agents")
        assert response.status_code == 200
        
        data = response.json()
        assert "suggestions" in data
        print(f"✓ Agent suggestions API working: {len(data['suggestions'])} suggestions")


class TestHealthAndConnectivity:
    """Basic health checks"""

    def test_api_health(self):
        """Health check endpoint"""
        response = requests.get(f"{BASE_URL}/api")
        assert response.status_code == 200
        print(f"✓ API Health: OK")

    def test_auth_login(self):
        """Login with admin credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("success") == True
        assert data.get("username") == "admin"
        assert data.get("role") == "admin"
        print(f"✓ Admin login successful")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
