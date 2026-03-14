"""
Test Suite for Iteration 91 - Leased Truck Features
Tests newly implemented features:
- GET /api/truck-leases returns list of leases
- GET /api/truck-leases?status=active returns only active leases
- GET /api/truck-leases/export/pdf returns valid PDF
- GET /api/truck-leases/export/excel returns valid Excel file
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestAuthLogin:
    """Test Login with admin/admin123"""
    
    def test_login_success(self, api_client):
        """Test login with valid credentials"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert data.get("username") == "admin"
        print(f"✓ Login successful: admin")


class TestTruckLeasesList:
    """Test GET /api/truck-leases endpoints"""
    
    def test_get_all_leases(self, api_client):
        """GET /api/truck-leases - returns list of leases"""
        response = api_client.get(f"{BASE_URL}/api/truck-leases")
        assert response.status_code == 200, f"Failed: {response.text}"
        leases = response.json()
        assert isinstance(leases, list), "Response should be a list"
        
        # Should have at least 1 lease (OD15B5678)
        assert len(leases) >= 1, "Expected at least 1 lease"
        
        # Verify lease structure
        for lease in leases:
            assert "id" in lease
            assert "truck_no" in lease
            assert "status" in lease
            
        print(f"✓ GET /api/truck-leases returned {len(leases)} leases")
        
    def test_get_active_leases_only(self, api_client):
        """GET /api/truck-leases?status=active - returns only active leases"""
        response = api_client.get(f"{BASE_URL}/api/truck-leases?status=active")
        assert response.status_code == 200, f"Failed: {response.text}"
        leases = response.json()
        assert isinstance(leases, list), "Response should be a list"
        
        # All returned leases should be active
        for lease in leases:
            assert lease.get("status") == "active", f"Lease {lease.get('truck_no')} is not active but got status: {lease.get('status')}"
        
        # Check known active leased trucks are present
        truck_nos = [l["truck_no"] for l in leases]
        # OD15B5678 should be in active leases
        assert "OD15B5678" in truck_nos, f"OD15B5678 not found in active leases: {truck_nos}"
        
        print(f"✓ GET /api/truck-leases?status=active returned {len(leases)} active leases")
        print(f"  Active leased trucks: {truck_nos}")


class TestTruckLeaseExports:
    """Test PDF and Excel export endpoints"""
    
    def test_export_pdf_returns_valid_pdf(self, api_client):
        """GET /api/truck-leases/export/pdf - returns valid PDF (status 200, correct content-type)"""
        response = api_client.get(f"{BASE_URL}/api/truck-leases/export/pdf")
        assert response.status_code == 200, f"PDF export failed: {response.text}"
        
        # Check content type is PDF
        content_type = response.headers.get("Content-Type", "")
        assert "application/pdf" in content_type, f"Expected PDF content type, got: {content_type}"
        
        # Check content-disposition has filename
        content_disp = response.headers.get("Content-Disposition", "")
        assert "truck_lease_report.pdf" in content_disp, f"Expected filename in Content-Disposition, got: {content_disp}"
        
        # Verify content starts with PDF header
        pdf_content = response.content
        assert pdf_content[:4] == b'%PDF', f"Content doesn't start with PDF header, got: {pdf_content[:20]}"
        
        print(f"✓ PDF export returned valid PDF ({len(pdf_content)} bytes)")
    
    def test_export_pdf_with_filters(self, api_client):
        """GET /api/truck-leases/export/pdf with kms_year filter"""
        response = api_client.get(f"{BASE_URL}/api/truck-leases/export/pdf?kms_year=2025-2026")
        assert response.status_code == 200, f"PDF export with filters failed: {response.text}"
        
        content_type = response.headers.get("Content-Type", "")
        assert "application/pdf" in content_type
        
        print(f"✓ PDF export with filters works")
    
    def test_export_excel_returns_valid_excel(self, api_client):
        """GET /api/truck-leases/export/excel - returns valid Excel file (status 200)"""
        response = api_client.get(f"{BASE_URL}/api/truck-leases/export/excel")
        assert response.status_code == 200, f"Excel export failed: {response.text}"
        
        # Check content type is Excel
        content_type = response.headers.get("Content-Type", "")
        assert "openxmlformats-officedocument.spreadsheetml" in content_type or "application/vnd" in content_type, \
            f"Expected Excel content type, got: {content_type}"
        
        # Check content-disposition has filename
        content_disp = response.headers.get("Content-Disposition", "")
        assert "truck_lease_report.xlsx" in content_disp, f"Expected filename in Content-Disposition, got: {content_disp}"
        
        # Verify content starts with ZIP header (xlsx is a ZIP file)
        xlsx_content = response.content
        assert xlsx_content[:2] == b'PK', f"Content doesn't start with ZIP/XLSX header, got: {xlsx_content[:20]}"
        
        print(f"✓ Excel export returned valid XLSX ({len(xlsx_content)} bytes)")
    
    def test_export_excel_with_filters(self, api_client):
        """GET /api/truck-leases/export/excel with kms_year filter"""
        response = api_client.get(f"{BASE_URL}/api/truck-leases/export/excel?kms_year=2025-2026")
        assert response.status_code == 200, f"Excel export with filters failed: {response.text}"
        
        content_type = response.headers.get("Content-Type", "")
        assert "openxmlformats-officedocument.spreadsheetml" in content_type or "application/vnd" in content_type
        
        print(f"✓ Excel export with filters works")


class TestKnownLeasedTrucks:
    """Verify known leased truck data for frontend badge testing"""
    
    def test_known_leased_trucks_exist(self, api_client):
        """Verify known test leased trucks exist"""
        response = api_client.get(f"{BASE_URL}/api/truck-leases?status=active")
        assert response.status_code == 200
        leases = response.json()
        
        truck_nos = [l["truck_no"] for l in leases]
        
        # OD15B5678 should exist (from context)
        assert "OD15B5678" in truck_nos, f"OD15B5678 not found in leases"
        
        # Find the OD15B5678 lease and verify its data
        od15b_lease = next((l for l in leases if l["truck_no"] == "OD15B5678"), None)
        assert od15b_lease is not None
        assert od15b_lease["status"] == "active"
        assert od15b_lease["owner_name"] == "Ramesh Kumar"
        assert od15b_lease["monthly_rent"] == 120000
        
        print(f"✓ Known leased truck OD15B5678 exists with correct data")
        print(f"  All active leased trucks: {truck_nos}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
