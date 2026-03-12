"""
Test suite for CMR Milling Entry System APIs
Tests: POST, GET, PUT, DELETE /api/milling-entries and GET /api/milling-summary
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://voucher-reports-app.preview.emergentagent.com"

API_URL = f"{BASE_URL}/api"

# Test credentials
ADMIN_USER = "admin"
ADMIN_PASS = "admin123"
STAFF_USER = "staff"
STAFF_PASS = "staff123"


class TestMillingAuth:
    """Test authentication before milling tests"""
    
    def test_admin_login(self):
        """Verify admin can login"""
        response = requests.post(f"{API_URL}/auth/login", json={
            "username": ADMIN_USER,
            "password": ADMIN_PASS
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert data["success"] == True
        assert data["role"] == "admin"
        print(f"Admin login successful: {data['username']}")


class TestMillingEntryCRUD:
    """CRUD tests for milling entries with auto-calculation verification"""
    
    created_entry_ids = []
    
    def test_create_milling_entry_parboiled(self):
        """Create parboiled milling entry with auto-calculated fields"""
        payload = {
            "date": "2026-01-15",
            "rice_type": "parboiled",
            "paddy_input_qntl": 100,
            "rice_percent": 52,
            "frk_percent": 15,
            "bran_percent": 5,
            "kunda_percent": 3,
            "broken_percent": 2,
            "kanki_percent": 1,
            "kms_year": "2025-26",
            "season": "Kharif",
            "note": "TEST_parboiled_entry"
        }
        
        response = requests.post(
            f"{API_URL}/milling-entries?username={ADMIN_USER}&role=admin",
            json=payload
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        print(f"Created parboiled entry: {data.get('id')}")
        
        # Verify auto-calculated fields
        assert "id" in data, "Entry should have an id"
        assert data["rice_qntl"] == 52.0, f"Rice QNTL should be 52, got {data['rice_qntl']}"
        assert data["frk_qntl"] == 15.0, f"FRK QNTL should be 15, got {data['frk_qntl']}"
        assert data["bran_qntl"] == 5.0, f"Bran QNTL should be 5, got {data['bran_qntl']}"
        assert data["kunda_qntl"] == 3.0, f"Kunda QNTL should be 3, got {data['kunda_qntl']}"
        assert data["broken_qntl"] == 2.0, f"Broken QNTL should be 2, got {data['broken_qntl']}"
        assert data["kanki_qntl"] == 1.0, f"Kanki QNTL should be 1, got {data['kanki_qntl']}"
        
        # Verify husk_percent = 100 - (52+15+5+3+2+1) = 22
        assert data["husk_percent"] == 22.0, f"Husk percent should be 22, got {data['husk_percent']}"
        assert data["husk_qntl"] == 22.0, f"Husk QNTL should be 22, got {data['husk_qntl']}"
        
        # CMR delivery = rice + frk = 52 + 15 = 67
        assert data["cmr_delivery_qntl"] == 67.0, f"CMR delivery should be 67, got {data['cmr_delivery_qntl']}"
        
        # Outturn ratio = rice_percent + frk_percent = 52 + 15 = 67
        assert data["outturn_ratio"] == 67.0, f"Outturn ratio should be 67%, got {data['outturn_ratio']}"
        
        TestMillingEntryCRUD.created_entry_ids.append(data["id"])
        print("Auto-calculations verified successfully!")
    
    def test_create_milling_entry_raw(self):
        """Create raw (arwa) milling entry"""
        payload = {
            "date": "2026-01-16",
            "rice_type": "raw",
            "paddy_input_qntl": 50,
            "rice_percent": 48,
            "frk_percent": 12,
            "bran_percent": 8,
            "kunda_percent": 4,
            "broken_percent": 3,
            "kanki_percent": 2,
            "kms_year": "2025-26",
            "season": "Rabi",
            "note": "TEST_raw_entry"
        }
        
        response = requests.post(
            f"{API_URL}/milling-entries?username={ADMIN_USER}&role=admin",
            json=payload
        )
        assert response.status_code == 200, f"Create raw entry failed: {response.text}"
        
        data = response.json()
        print(f"Created raw entry: {data.get('id')}")
        
        # Verify calculations for raw rice
        assert data["rice_qntl"] == 24.0, f"Rice QNTL should be 24 (50*48%), got {data['rice_qntl']}"
        assert data["frk_qntl"] == 6.0, f"FRK QNTL should be 6 (50*12%), got {data['frk_qntl']}"
        assert data["cmr_delivery_qntl"] == 30.0, f"CMR should be 30, got {data['cmr_delivery_qntl']}"
        assert data["outturn_ratio"] == 60.0, f"Outturn should be 60%, got {data['outturn_ratio']}"
        
        # Husk = 100 - (48+12+8+4+3+2) = 23
        assert data["husk_percent"] == 23.0, f"Husk percent should be 23, got {data['husk_percent']}"
        
        TestMillingEntryCRUD.created_entry_ids.append(data["id"])
    
    def test_get_all_milling_entries(self):
        """Get list of milling entries"""
        response = requests.get(f"{API_URL}/milling-entries")
        assert response.status_code == 200, f"Get entries failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Total milling entries: {len(data)}")
        
        # Check that our test entries exist
        test_entries = [e for e in data if "TEST_" in (e.get("note") or "")]
        assert len(test_entries) >= 2, f"Should have at least 2 test entries, got {len(test_entries)}"
    
    def test_get_entries_with_rice_type_filter(self):
        """Test filtering entries by rice_type"""
        response = requests.get(f"{API_URL}/milling-entries?rice_type=parboiled")
        assert response.status_code == 200
        
        data = response.json()
        for entry in data:
            assert entry["rice_type"] == "parboiled", f"Filter failed: got {entry['rice_type']}"
        print(f"Filtered parboiled entries: {len(data)}")
    
    def test_get_entries_with_date_filter(self):
        """Test filtering entries by date range"""
        response = requests.get(
            f"{API_URL}/milling-entries?date_from=2026-01-15&date_to=2026-01-16"
        )
        assert response.status_code == 200
        data = response.json()
        print(f"Entries in date range: {len(data)}")
    
    def test_get_single_milling_entry(self):
        """Get a specific milling entry by ID"""
        if not TestMillingEntryCRUD.created_entry_ids:
            pytest.skip("No entry created to fetch")
        
        entry_id = TestMillingEntryCRUD.created_entry_ids[0]
        response = requests.get(f"{API_URL}/milling-entries/{entry_id}")
        assert response.status_code == 200, f"Get single entry failed: {response.text}"
        
        data = response.json()
        assert data["id"] == entry_id
        print(f"Fetched entry: {data['id']}, type: {data['rice_type']}")
    
    def test_get_nonexistent_entry_returns_404(self):
        """Verify 404 for non-existent entry"""
        response = requests.get(f"{API_URL}/milling-entries/nonexistent-id-12345")
        assert response.status_code == 404
        print("404 returned correctly for non-existent entry")
    
    def test_update_milling_entry(self):
        """Update milling entry and verify recalculation"""
        if not TestMillingEntryCRUD.created_entry_ids:
            pytest.skip("No entry created to update")
        
        entry_id = TestMillingEntryCRUD.created_entry_ids[0]
        
        # Update with new percentages
        update_payload = {
            "date": "2026-01-15",
            "rice_type": "parboiled",
            "paddy_input_qntl": 200,  # Changed from 100 to 200
            "rice_percent": 55,  # Changed from 52 to 55
            "frk_percent": 12,   # Changed from 15 to 12
            "bran_percent": 5,
            "kunda_percent": 3,
            "broken_percent": 2,
            "kanki_percent": 1,
            "kms_year": "2025-26",
            "season": "Kharif",
            "note": "TEST_updated_entry"
        }
        
        response = requests.put(
            f"{API_URL}/milling-entries/{entry_id}?username={ADMIN_USER}&role=admin",
            json=update_payload
        )
        assert response.status_code == 200, f"Update failed: {response.text}"
        
        data = response.json()
        
        # Verify recalculated values
        assert data["paddy_input_qntl"] == 200
        assert data["rice_qntl"] == 110.0, f"Rice QNTL should be 110 (200*55%), got {data['rice_qntl']}"
        assert data["frk_qntl"] == 24.0, f"FRK QNTL should be 24 (200*12%), got {data['frk_qntl']}"
        assert data["cmr_delivery_qntl"] == 134.0, f"CMR should be 134, got {data['cmr_delivery_qntl']}"
        assert data["outturn_ratio"] == 67.0, f"Outturn should be 67%, got {data['outturn_ratio']}"
        
        # Husk = 100 - (55+12+5+3+2+1) = 22
        assert data["husk_percent"] == 22.0
        
        print(f"Entry updated successfully, new CMR: {data['cmr_delivery_qntl']}")


class TestMillingSummary:
    """Test the milling summary aggregation endpoint"""
    
    def test_get_milling_summary(self):
        """Get aggregated milling summary"""
        response = requests.get(f"{API_URL}/milling-summary")
        assert response.status_code == 200, f"Summary failed: {response.text}"
        
        data = response.json()
        
        # Verify summary structure
        assert "total_entries" in data
        assert "total_paddy_qntl" in data
        assert "total_rice_qntl" in data
        assert "total_cmr_qntl" in data
        assert "avg_outturn_ratio" in data
        assert "parboiled" in data
        assert "raw" in data
        
        print(f"Summary: {data['total_entries']} entries, "
              f"Paddy: {data['total_paddy_qntl']} Q, "
              f"CMR: {data['total_cmr_qntl']} Q, "
              f"Outturn: {data['avg_outturn_ratio']}%")
        
        # Verify type breakdown structure
        assert "count" in data["parboiled"]
        assert "total_paddy_qntl" in data["parboiled"]
        assert "avg_outturn" in data["parboiled"]
        
        print(f"Parboiled: {data['parboiled']['count']} entries, Avg Outturn: {data['parboiled']['avg_outturn']}%")
        print(f"Raw: {data['raw']['count']} entries, Avg Outturn: {data['raw']['avg_outturn']}%")
    
    def test_summary_with_kms_filter(self):
        """Test summary with KMS year filter"""
        response = requests.get(f"{API_URL}/milling-summary?kms_year=2025-26")
        assert response.status_code == 200
        
        data = response.json()
        print(f"Summary for KMS 2025-26: {data['total_entries']} entries")


class TestMillingEntryDelete:
    """Test deletion of milling entries (run last)"""
    
    def test_delete_milling_entries(self):
        """Delete test entries created during tests"""
        for entry_id in TestMillingEntryCRUD.created_entry_ids:
            response = requests.delete(
                f"{API_URL}/milling-entries/{entry_id}?username={ADMIN_USER}&role=admin"
            )
            assert response.status_code == 200, f"Delete failed for {entry_id}: {response.text}"
            print(f"Deleted entry: {entry_id}")
        
        TestMillingEntryCRUD.created_entry_ids.clear()
    
    def test_delete_nonexistent_returns_404(self):
        """Verify 404 when deleting non-existent entry"""
        response = requests.delete(
            f"{API_URL}/milling-entries/nonexistent-id?username={ADMIN_USER}&role=admin"
        )
        assert response.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
