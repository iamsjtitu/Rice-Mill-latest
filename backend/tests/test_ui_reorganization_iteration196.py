"""
Test UI Reorganization - Iteration 196
Tests all backend APIs after major UI reorganization:
- Register tab components (Paddy Custody, Transit Pass, Milling Register)
- Stock Register tab (Gunny Bags, Stock Summary)
- Payments tab (DC Payments)
- Export endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBackendAPIs:
    """Test all backend APIs mentioned in the reorganization"""
    
    def test_health_check(self):
        """Test API is accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print("✓ Health check passed")
    
    # ============ PADDY CUSTODY REGISTER ============
    def test_paddy_custody_register(self):
        """Test /api/paddy-custody-register endpoint"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register")
        assert response.status_code == 200
        data = response.json()
        assert 'rows' in data or 'total_received' in data or isinstance(data, list)
        print(f"✓ Paddy Custody Register API: {response.status_code}")
    
    def test_paddy_custody_register_excel_export(self):
        """Test /api/paddy-custody-register/excel endpoint"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register/excel")
        assert response.status_code == 200
        content_type = response.headers.get('content-type', '')
        assert 'spreadsheet' in content_type or 'excel' in content_type or 'octet-stream' in content_type
        print(f"✓ Paddy Custody Register Excel Export: {response.status_code}")
    
    def test_paddy_custody_register_pdf_export(self):
        """Test /api/paddy-custody-register/pdf endpoint"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register/pdf")
        assert response.status_code == 200
        content_type = response.headers.get('content-type', '')
        assert 'pdf' in content_type or 'octet-stream' in content_type
        print(f"✓ Paddy Custody Register PDF Export: {response.status_code}")
    
    # ============ TRANSIT PASS REGISTER ============
    def test_transit_pass_register(self):
        """Test /api/govt-registers/transit-pass endpoint"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/transit-pass")
        assert response.status_code == 200
        data = response.json()
        assert 'rows' in data or 'summary' in data or isinstance(data, list)
        print(f"✓ Transit Pass Register API: {response.status_code}")
    
    def test_transit_pass_excel_export(self):
        """Test /api/govt-registers/transit-pass/excel endpoint"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/transit-pass/excel")
        assert response.status_code == 200
        print(f"✓ Transit Pass Excel Export: {response.status_code}")
    
    # ============ MILLING REGISTER ============
    def test_milling_register(self):
        """Test /api/govt-registers/milling-register endpoint"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/milling-register")
        assert response.status_code == 200
        data = response.json()
        assert 'rows' in data or 'summary' in data or isinstance(data, list)
        print(f"✓ Milling Register API: {response.status_code}")
    
    def test_milling_register_excel_export(self):
        """Test /api/govt-registers/milling-register/excel endpoint"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/milling-register/excel")
        assert response.status_code == 200
        print(f"✓ Milling Register Excel Export: {response.status_code}")
    
    # ============ GUNNY BAGS (Stock Register) ============
    def test_gunny_bags(self):
        """Test /api/gunny-bags endpoint"""
        response = requests.get(f"{BASE_URL}/api/gunny-bags")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Gunny Bags API: {response.status_code}")
    
    def test_gunny_bags_summary(self):
        """Test /api/gunny-bags/summary endpoint"""
        response = requests.get(f"{BASE_URL}/api/gunny-bags/summary")
        assert response.status_code == 200
        print(f"✓ Gunny Bags Summary API: {response.status_code}")
    
    def test_gunny_bags_excel_export(self):
        """Test /api/gunny-bags/excel endpoint"""
        response = requests.get(f"{BASE_URL}/api/gunny-bags/excel")
        assert response.status_code == 200
        print(f"✓ Gunny Bags Excel Export: {response.status_code}")
    
    # ============ STOCK SUMMARY ============
    def test_stock_summary(self):
        """Test /api/stock-summary endpoint"""
        response = requests.get(f"{BASE_URL}/api/stock-summary")
        assert response.status_code == 200
        print(f"✓ Stock Summary API: {response.status_code}")
    
    # ============ DC ENTRIES (Payments tab) ============
    def test_dc_entries(self):
        """Test /api/dc-entries endpoint"""
        response = requests.get(f"{BASE_URL}/api/dc-entries")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ DC Entries API: {response.status_code}")
    
    def test_dc_summary(self):
        """Test /api/dc-summary endpoint"""
        response = requests.get(f"{BASE_URL}/api/dc-summary")
        assert response.status_code == 200
        print(f"✓ DC Summary API: {response.status_code}")
    
    # ============ PADDY RELEASE ============
    def test_paddy_release(self):
        """Test /api/paddy-release endpoint"""
        response = requests.get(f"{BASE_URL}/api/paddy-release")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Paddy Release API: {response.status_code}")
    
    def test_paddy_release_stock(self):
        """Test /api/paddy-release/stock endpoint"""
        response = requests.get(f"{BASE_URL}/api/paddy-release/stock")
        assert response.status_code == 200
        print(f"✓ Paddy Release Stock API: {response.status_code}")
    
    # ============ ADDITIONAL REGISTER ENDPOINTS ============
    def test_mandi_custody_register(self):
        """Test /api/mandi-custody-register endpoint (Mandi Wise sub-tab)"""
        response = requests.get(f"{BASE_URL}/api/mandi-custody-register")
        assert response.status_code == 200
        print(f"✓ Mandi Custody Register API: {response.status_code}")
    
    def test_purchase_vouchers(self):
        """Test /api/purchase-vouchers endpoint (Purchase Register sub-tab)"""
        response = requests.get(f"{BASE_URL}/api/purchase-vouchers")
        assert response.status_code == 200
        print(f"✓ Purchase Vouchers API: {response.status_code}")
    
    def test_sale_book(self):
        """Test /api/sale-book endpoint (Sales Register)"""
        response = requests.get(f"{BASE_URL}/api/sale-book")
        assert response.status_code == 200
        print(f"✓ Sale Book API: {response.status_code}")
    
    def test_party_summary(self):
        """Test /api/party-summary endpoint"""
        response = requests.get(f"{BASE_URL}/api/party-summary")
        assert response.status_code == 200
        print(f"✓ Party Summary API: {response.status_code}")
    
    def test_msp_payments(self):
        """Test /api/msp-payments endpoint (DC Payments sub-tab)"""
        response = requests.get(f"{BASE_URL}/api/msp-payments")
        assert response.status_code == 200
        print(f"✓ MSP Payments API: {response.status_code}")


class TestFilteredAPIs:
    """Test APIs with filter parameters"""
    
    def test_paddy_custody_with_kms_year(self):
        """Test paddy custody register with kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/paddy-custody-register?kms_year=2025-2026")
        assert response.status_code == 200
        print(f"✓ Paddy Custody with kms_year filter: {response.status_code}")
    
    def test_transit_pass_with_filters(self):
        """Test transit pass with filters"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/transit-pass?kms_year=2025-2026&season=Kharif")
        assert response.status_code == 200
        print(f"✓ Transit Pass with filters: {response.status_code}")
    
    def test_milling_register_with_filters(self):
        """Test milling register with filters"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/milling-register?kms_year=2025-2026")
        assert response.status_code == 200
        print(f"✓ Milling Register with filters: {response.status_code}")
    
    def test_gunny_bags_with_filters(self):
        """Test gunny bags with filters"""
        response = requests.get(f"{BASE_URL}/api/gunny-bags?kms_year=2025-2026&season=Kharif")
        assert response.status_code == 200
        print(f"✓ Gunny Bags with filters: {response.status_code}")
    
    def test_dc_entries_with_filters(self):
        """Test DC entries with filters"""
        response = requests.get(f"{BASE_URL}/api/dc-entries?kms_year=2025-2026")
        assert response.status_code == 200
        print(f"✓ DC Entries with filters: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
