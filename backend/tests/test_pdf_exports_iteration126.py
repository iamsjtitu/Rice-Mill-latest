"""
Test PDF Export Endpoints - Iteration 126
Tests for Cash Book PDF and Sale Book PDF exports
Bug fixes verified:
1. GET /api/cash-book/pdf - should return valid PDF (not 500 error)
2. GET /api/sale-book/export/pdf - should return valid PDF (not HTML/blank)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPDFExports:
    """Test PDF export endpoints for Cash Book and Sale Book"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login to get auth
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        if login_resp.status_code == 200:
            data = login_resp.json()
            if data.get("token"):
                self.session.headers.update({"Authorization": f"Bearer {data['token']}"})
        yield
    
    def test_login_works(self):
        """Test login flow works with admin/admin123"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data or "success" in data, f"Login response missing token: {data}"
        print(f"✓ Login successful")
    
    def test_cash_book_pdf_returns_valid_pdf(self):
        """Test GET /api/cash-book/pdf returns valid PDF (not 500 error)"""
        response = self.session.get(f"{BASE_URL}/api/cash-book/pdf")
        
        # Should not return 500 error
        assert response.status_code != 500, f"Cash Book PDF returned 500 error: {response.text[:500]}"
        assert response.status_code == 200, f"Cash Book PDF failed with status {response.status_code}: {response.text[:500]}"
        
        # Check Content-Type is PDF
        content_type = response.headers.get('Content-Type', '')
        assert 'application/pdf' in content_type, f"Expected PDF content type, got: {content_type}"
        
        # Check PDF magic bytes (%PDF-)
        content = response.content
        assert content.startswith(b'%PDF-'), f"Response does not start with PDF magic bytes. First 50 bytes: {content[:50]}"
        
        # Check PDF has reasonable size (not empty)
        assert len(content) > 1000, f"PDF seems too small ({len(content)} bytes), might be empty"
        
        print(f"✓ Cash Book PDF: {len(content)} bytes, Content-Type: {content_type}")
    
    def test_cash_book_pdf_with_kms_year_filter(self):
        """Test GET /api/cash-book/pdf?kms_year=2024-25 returns valid PDF"""
        response = self.session.get(f"{BASE_URL}/api/cash-book/pdf?kms_year=2024-25")
        
        assert response.status_code != 500, f"Cash Book PDF with filter returned 500: {response.text[:500]}"
        assert response.status_code == 200, f"Cash Book PDF with filter failed: {response.status_code}"
        
        content_type = response.headers.get('Content-Type', '')
        assert 'application/pdf' in content_type, f"Expected PDF, got: {content_type}"
        
        content = response.content
        assert content.startswith(b'%PDF-'), f"Not a valid PDF. First bytes: {content[:50]}"
        
        print(f"✓ Cash Book PDF with kms_year filter: {len(content)} bytes")
    
    def test_sale_book_pdf_returns_valid_pdf(self):
        """Test GET /api/sale-book/export/pdf returns valid PDF (not HTML/blank)"""
        response = self.session.get(f"{BASE_URL}/api/sale-book/export/pdf")
        
        # Should not return 500 error
        assert response.status_code != 500, f"Sale Book PDF returned 500 error: {response.text[:500]}"
        assert response.status_code == 200, f"Sale Book PDF failed with status {response.status_code}: {response.text[:500]}"
        
        # Check Content-Type is PDF (not HTML)
        content_type = response.headers.get('Content-Type', '')
        assert 'application/pdf' in content_type, f"Expected PDF content type, got: {content_type}"
        assert 'text/html' not in content_type, f"Got HTML instead of PDF: {content_type}"
        
        # Check PDF magic bytes (%PDF-)
        content = response.content
        assert content.startswith(b'%PDF-'), f"Response does not start with PDF magic bytes. First 100 bytes: {content[:100]}"
        
        # Ensure it's not HTML
        assert not content.startswith(b'<!DOCTYPE'), f"Got HTML document instead of PDF"
        assert not content.startswith(b'<html'), f"Got HTML instead of PDF"
        
        # Check PDF has reasonable size (not empty/blank)
        assert len(content) > 1000, f"PDF seems too small ({len(content)} bytes), might be blank"
        
        print(f"✓ Sale Book PDF: {len(content)} bytes, Content-Type: {content_type}")
    
    def test_sale_book_pdf_with_kms_year_filter(self):
        """Test GET /api/sale-book/export/pdf?kms_year=2024-25 returns valid PDF"""
        response = self.session.get(f"{BASE_URL}/api/sale-book/export/pdf?kms_year=2024-25")
        
        assert response.status_code != 500, f"Sale Book PDF with filter returned 500: {response.text[:500]}"
        assert response.status_code == 200, f"Sale Book PDF with filter failed: {response.status_code}"
        
        content_type = response.headers.get('Content-Type', '')
        assert 'application/pdf' in content_type, f"Expected PDF, got: {content_type}"
        
        content = response.content
        assert content.startswith(b'%PDF-'), f"Not a valid PDF. First bytes: {content[:100]}"
        
        print(f"✓ Sale Book PDF with kms_year filter: {len(content)} bytes")
    
    def test_cash_book_party_summary_pdf(self):
        """Test GET /api/cash-book/party-summary/pdf returns valid PDF"""
        response = self.session.get(f"{BASE_URL}/api/cash-book/party-summary/pdf")
        
        assert response.status_code == 200, f"Party Summary PDF failed: {response.status_code}"
        
        content_type = response.headers.get('Content-Type', '')
        assert 'application/pdf' in content_type, f"Expected PDF, got: {content_type}"
        
        content = response.content
        assert content.startswith(b'%PDF-'), f"Not a valid PDF"
        
        print(f"✓ Party Summary PDF: {len(content)} bytes")
    
    def test_single_sale_voucher_pdf(self):
        """Test GET /api/sale-book/{voucher_id}/pdf returns valid PDF"""
        # First get a sale voucher ID
        vouchers_resp = self.session.get(f"{BASE_URL}/api/sale-book")
        if vouchers_resp.status_code == 200:
            vouchers = vouchers_resp.json()
            if vouchers and len(vouchers) > 0:
                voucher_id = vouchers[0].get('id')
                if voucher_id:
                    response = self.session.get(f"{BASE_URL}/api/sale-book/{voucher_id}/pdf")
                    
                    assert response.status_code == 200, f"Single voucher PDF failed: {response.status_code}"
                    
                    content_type = response.headers.get('Content-Type', '')
                    assert 'application/pdf' in content_type, f"Expected PDF, got: {content_type}"
                    
                    content = response.content
                    assert content.startswith(b'%PDF-'), f"Not a valid PDF"
                    
                    print(f"✓ Single Sale Voucher PDF: {len(content)} bytes")
                    return
        
        print("⚠ No sale vouchers found to test single voucher PDF")
        pytest.skip("No sale vouchers available for testing")


class TestHealthAndBasicAPIs:
    """Test basic API health and connectivity"""
    
    def test_api_health(self):
        """Test API is reachable"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.status_code}"
        print(f"✓ API health check passed")
    
    def test_cash_book_list(self):
        """Test GET /api/cash-book returns data"""
        session = requests.Session()
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        if login_resp.status_code == 200:
            data = login_resp.json()
            if data.get("token"):
                session.headers.update({"Authorization": f"Bearer {data['token']}"})
        
        response = session.get(f"{BASE_URL}/api/cash-book")
        assert response.status_code == 200, f"Cash book list failed: {response.status_code}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got: {type(data)}"
        print(f"✓ Cash Book list: {len(data)} transactions")
    
    def test_sale_book_list(self):
        """Test GET /api/sale-book returns data"""
        session = requests.Session()
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        if login_resp.status_code == 200:
            data = login_resp.json()
            if data.get("token"):
                session.headers.update({"Authorization": f"Bearer {data['token']}"})
        
        response = session.get(f"{BASE_URL}/api/sale-book")
        assert response.status_code == 200, f"Sale book list failed: {response.status_code}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got: {type(data)}"
        print(f"✓ Sale Book list: {len(data)} vouchers")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
