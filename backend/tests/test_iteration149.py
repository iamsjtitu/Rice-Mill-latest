"""
Iteration 149 Backend Tests - Vehicle Weight, Camera, Branding APIs
Tests for: Login, Vehicle Weight tab, linked-rst API, Branding API, PDF/Excel exports
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthAndBranding:
    """Authentication and Branding API tests"""
    
    def test_login_admin(self):
        """Test admin login with admin/admin123"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert data.get("username") == "admin"
        assert data.get("role") == "admin"
        print("PASS: Admin login successful")
    
    def test_branding_api(self):
        """Test branding API returns company data"""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200
        data = response.json()
        assert "company_name" in data
        assert "tagline" in data
        assert "custom_fields" in data
        print(f"PASS: Branding API returns company: {data.get('company_name')}")


class TestVehicleWeight:
    """Vehicle Weight API tests"""
    
    def test_vehicle_weight_list(self):
        """Test vehicle weight list endpoint"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?page=1&page_size=10")
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        assert "total" in data
        assert "page" in data
        print(f"PASS: Vehicle weight list returns {len(data.get('entries', []))} entries, total: {data.get('total')}")
    
    def test_vehicle_weight_linked_rst(self):
        """Test linked-rst endpoint returns RST numbers from mill_entries"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/linked-rst")
        assert response.status_code == 200
        data = response.json()
        assert "linked_rst" in data
        assert isinstance(data["linked_rst"], list)
        print(f"PASS: Linked RST API returns {len(data.get('linked_rst', []))} linked RST numbers")
    
    def test_vehicle_weight_pending_count(self):
        """Test pending count endpoint"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/pending-count")
        assert response.status_code == 200
        data = response.json()
        assert "pending_count" in data
        assert "total_vw" in data
        assert "linked" in data
        print(f"PASS: Pending count: {data.get('pending_count')}, Total VW: {data.get('total_vw')}, Linked: {data.get('linked')}")
    
    def test_vehicle_weight_pending_list(self):
        """Test pending vehicles list"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/pending")
        assert response.status_code == 200
        data = response.json()
        assert "pending" in data
        assert "count" in data
        print(f"PASS: Pending vehicles: {data.get('count')}")
    
    def test_vehicle_weight_next_rst(self):
        """Test next RST number endpoint"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/next-rst")
        assert response.status_code == 200
        data = response.json()
        assert "rst_no" in data
        assert isinstance(data["rst_no"], int)
        print(f"PASS: Next RST number: {data.get('rst_no')}")


class TestVehicleWeightExports:
    """Vehicle Weight Export API tests"""
    
    def test_export_pdf(self):
        """Test PDF export endpoint"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/export/pdf?kms_year=2025-2026")
        assert response.status_code == 200
        assert "application/pdf" in response.headers.get("content-type", "")
        assert len(response.content) > 1000  # PDF should be > 1KB
        print(f"PASS: PDF export returns {len(response.content)} bytes")
    
    def test_export_excel(self):
        """Test Excel export endpoint"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/export/excel?kms_year=2025-2026")
        assert response.status_code == 200
        assert "spreadsheet" in response.headers.get("content-type", "")
        assert len(response.content) > 1000  # Excel should be > 1KB
        print(f"PASS: Excel export returns {len(response.content)} bytes")
    
    def test_slip_pdf(self):
        """Test individual slip PDF endpoint"""
        # First get a completed entry
        list_response = requests.get(f"{BASE_URL}/api/vehicle-weight?status=completed&page_size=1")
        assert list_response.status_code == 200
        entries = list_response.json().get("entries", [])
        if entries:
            entry_id = entries[0].get("id")
            response = requests.get(f"{BASE_URL}/api/vehicle-weight/{entry_id}/slip-pdf")
            assert response.status_code == 200
            assert "application/pdf" in response.headers.get("content-type", "")
            assert len(response.content) > 500  # Slip PDF should be > 500 bytes
            print(f"PASS: Slip PDF for entry {entry_id} returns {len(response.content)} bytes")
        else:
            pytest.skip("No completed entries to test slip PDF")


class TestAutoNotifySettings:
    """Auto-notify settings tests"""
    
    def test_get_auto_notify_setting(self):
        """Test get auto-notify setting"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/auto-notify-setting")
        assert response.status_code == 200
        data = response.json()
        assert "enabled" in data
        print(f"PASS: Auto-notify setting: enabled={data.get('enabled')}")


class TestImageCleanupSettings:
    """Image cleanup settings tests"""
    
    def test_get_image_cleanup_setting(self):
        """Test get image cleanup setting"""
        response = requests.get(f"{BASE_URL}/api/settings/image-cleanup")
        assert response.status_code == 200
        data = response.json()
        assert "days" in data
        assert "enabled" in data
        print(f"PASS: Image cleanup setting: days={data.get('days')}, enabled={data.get('enabled')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
