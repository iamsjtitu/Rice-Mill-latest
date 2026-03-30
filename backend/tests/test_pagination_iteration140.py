"""
Test Server-Side Pagination for Mill Entries, Cash Book, and Vehicle Weight
Iteration 140: Testing pagination implementation for 50k+ entries handling
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestEntriesPagination:
    """Test /api/entries pagination"""
    
    def test_entries_pagination_default(self):
        """GET /api/entries returns paginated response with default page_size"""
        response = requests.get(f"{BASE_URL}/api/entries")
        assert response.status_code == 200
        data = response.json()
        # Check pagination fields exist
        assert "entries" in data
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert "total_pages" in data
        # Verify types
        assert isinstance(data["entries"], list)
        assert isinstance(data["total"], int)
        assert isinstance(data["page"], int)
        assert isinstance(data["page_size"], int)
        assert isinstance(data["total_pages"], int)
        print(f"PASS: Entries pagination default - total={data['total']}, page={data['page']}, page_size={data['page_size']}, total_pages={data['total_pages']}")
    
    def test_entries_pagination_with_params(self):
        """GET /api/entries?page=1&page_size=5 returns correct pagination"""
        response = requests.get(f"{BASE_URL}/api/entries?page=1&page_size=5")
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert "total_pages" in data
        assert data["page"] == 1
        assert data["page_size"] == 5
        # entries should be <= page_size
        assert len(data["entries"]) <= 5
        # total_pages calculation
        if data["total"] > 0:
            expected_pages = max(1, (data["total"] + 4) // 5)  # ceil division
            assert data["total_pages"] == expected_pages
        print(f"PASS: Entries pagination with params - entries_count={len(data['entries'])}, total={data['total']}, total_pages={data['total_pages']}")
    
    def test_entries_pagination_page_size_zero(self):
        """GET /api/entries?page_size=0 returns all entries (no pagination)"""
        response = requests.get(f"{BASE_URL}/api/entries?page_size=0")
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        assert "total" in data
        # When page_size=0, should return all entries
        assert data["total_pages"] == 1
        assert data["page_size"] == data["total"]
        print(f"PASS: Entries page_size=0 returns all - entries_count={len(data['entries'])}, total={data['total']}")
    
    def test_entries_pagination_page_2(self):
        """GET /api/entries?page=2&page_size=5 returns page 2"""
        response = requests.get(f"{BASE_URL}/api/entries?page=2&page_size=5")
        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 2 or data["total"] < 6  # page 2 or not enough data
        print(f"PASS: Entries page 2 - page={data['page']}, entries_count={len(data['entries'])}")


class TestCashBookPagination:
    """Test /api/cash-book pagination"""
    
    def test_cashbook_pagination_default(self):
        """GET /api/cash-book returns paginated response"""
        response = requests.get(f"{BASE_URL}/api/cash-book")
        assert response.status_code == 200
        data = response.json()
        # Check pagination fields exist
        assert "transactions" in data
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert "total_pages" in data
        print(f"PASS: Cash Book pagination default - total={data['total']}, page={data['page']}, page_size={data['page_size']}, total_pages={data['total_pages']}")
    
    def test_cashbook_pagination_with_params(self):
        """GET /api/cash-book?page=1&page_size=5 returns correct pagination"""
        response = requests.get(f"{BASE_URL}/api/cash-book?page=1&page_size=5")
        assert response.status_code == 200
        data = response.json()
        assert "transactions" in data
        assert "total" in data
        assert data["page"] == 1
        assert data["page_size"] == 5
        assert len(data["transactions"]) <= 5
        print(f"PASS: Cash Book pagination with params - txn_count={len(data['transactions'])}, total={data['total']}, total_pages={data['total_pages']}")
    
    def test_cashbook_pagination_page_size_zero(self):
        """GET /api/cash-book?page_size=0 returns all transactions (for category filtering)"""
        response = requests.get(f"{BASE_URL}/api/cash-book?page_size=0")
        assert response.status_code == 200
        data = response.json()
        assert "transactions" in data
        assert "total" in data
        # When page_size=0, should return all transactions
        assert data["total_pages"] == 1
        assert data["page_size"] == data["total"]
        print(f"PASS: Cash Book page_size=0 returns all - txn_count={len(data['transactions'])}, total={data['total']}")
    
    def test_cashbook_pagination_page_2(self):
        """GET /api/cash-book?page=2&page_size=5 returns page 2"""
        response = requests.get(f"{BASE_URL}/api/cash-book?page=2&page_size=5")
        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 2 or data["total"] < 6
        print(f"PASS: Cash Book page 2 - page={data['page']}, txn_count={len(data['transactions'])}")


class TestVehicleWeightPagination:
    """Test /api/vehicle-weight pagination"""
    
    def test_vehicle_weight_pagination_default(self):
        """GET /api/vehicle-weight returns paginated response"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight")
        assert response.status_code == 200
        data = response.json()
        # Check pagination fields exist
        assert "entries" in data
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert "total_pages" in data
        print(f"PASS: Vehicle Weight pagination default - total={data['total']}, page={data['page']}, page_size={data['page_size']}, total_pages={data['total_pages']}")
    
    def test_vehicle_weight_pagination_with_status(self):
        """GET /api/vehicle-weight?status=completed&page=1&page_size=5 returns correct pagination"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?status=completed&page=1&page_size=5")
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        assert "total" in data
        assert data["page"] == 1
        assert data["page_size"] == 5
        assert len(data["entries"]) <= 5
        print(f"PASS: Vehicle Weight pagination with status - entries_count={len(data['entries'])}, total={data['total']}, total_pages={data['total_pages']}")
    
    def test_vehicle_weight_pagination_page_2(self):
        """GET /api/vehicle-weight?page=2&page_size=5 returns page 2"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?page=2&page_size=5")
        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 2 or data["total"] < 6
        print(f"PASS: Vehicle Weight page 2 - page={data['page']}, entries_count={len(data['entries'])}")


class TestPaginationTotalCount:
    """Test that total count is from server, not array length"""
    
    def test_entries_total_vs_array_length(self):
        """Verify entries total is server count, not array length"""
        response = requests.get(f"{BASE_URL}/api/entries?page=1&page_size=5")
        assert response.status_code == 200
        data = response.json()
        # total should be >= entries array length
        assert data["total"] >= len(data["entries"])
        # If total > page_size, entries should be exactly page_size (or less if last page)
        if data["total"] > 5:
            assert len(data["entries"]) == 5
        print(f"PASS: Entries total ({data['total']}) >= array length ({len(data['entries'])})")
    
    def test_cashbook_total_vs_array_length(self):
        """Verify cash book total is server count, not array length"""
        response = requests.get(f"{BASE_URL}/api/cash-book?page=1&page_size=5")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= len(data["transactions"])
        if data["total"] > 5:
            assert len(data["transactions"]) == 5
        print(f"PASS: Cash Book total ({data['total']}) >= array length ({len(data['transactions'])})")
    
    def test_vehicle_weight_total_vs_array_length(self):
        """Verify vehicle weight total is server count, not array length"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?page=1&page_size=5")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= len(data["entries"])
        if data["total"] > 5:
            assert len(data["entries"]) == 5
        print(f"PASS: Vehicle Weight total ({data['total']}) >= array length ({len(data['entries'])})")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
