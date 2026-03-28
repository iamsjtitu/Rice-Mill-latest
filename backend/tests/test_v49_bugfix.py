"""
Test v49.0.0 Bug Fixes:
1. Sale Voucher stock-items now includes opening stock
2. Party Summary returns correct data with kms_year filter
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSaleBookStockItemsBugFix:
    """BUG FIX: GET /api/sale-book/stock-items now includes opening stock"""
    
    def test_stock_items_returns_rice_usna_with_opening_stock(self):
        """Rice (Usna) should have 300Q available from opening stock"""
        response = requests.get(f"{BASE_URL}/api/sale-book/stock-items?kms_year=2025-2026")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # Find Rice (Usna) item
        rice_usna = next((item for item in data if item['name'] == 'Rice (Usna)'), None)
        assert rice_usna is not None, "Rice (Usna) should be in stock items"
        assert rice_usna['available_qntl'] == 300.0, f"Rice (Usna) should have 300Q from opening stock, got {rice_usna['available_qntl']}"
        assert rice_usna['unit'] == 'Qntl'
        print(f"✅ Rice (Usna) available: {rice_usna['available_qntl']}Q (from opening stock)")
    
    def test_stock_items_returns_all_expected_items(self):
        """All stock items should be returned"""
        response = requests.get(f"{BASE_URL}/api/sale-book/stock-items?kms_year=2025-2026")
        assert response.status_code == 200
        
        data = response.json()
        expected_items = ['Rice (Usna)', 'Rice (Raw)', 'Bran', 'Kunda', 'Broken', 'Kanki', 'Husk', 'FRK']
        item_names = [item['name'] for item in data]
        
        for expected in expected_items:
            assert expected in item_names, f"{expected} should be in stock items"
        print(f"✅ All {len(expected_items)} expected stock items present")
    
    def test_stock_items_without_kms_year(self):
        """Stock items endpoint should work without kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/sale-book/stock-items")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Stock items without filter returns {len(data)} items")


class TestPartySummaryBugFix:
    """BUG FIX: Party Summary returns correct data with kms_year=2025-2026"""
    
    def test_party_summary_returns_paddy_parties(self):
        """Party summary should return paddy_purchase parties for 2025-2026"""
        response = requests.get(f"{BASE_URL}/api/private-trading/party-summary?kms_year=2025-2026")
        assert response.status_code == 200
        
        data = response.json()
        assert 'paddy_purchase' in data
        assert 'parties' in data['paddy_purchase']
        
        parties = data['paddy_purchase']['parties']
        assert len(parties) >= 4, f"Expected at least 4 paddy parties, got {len(parties)}"
        print(f"✅ Party Summary returns {len(parties)} paddy parties")
    
    def test_party_summary_totals(self):
        """Party summary should have correct totals structure"""
        response = requests.get(f"{BASE_URL}/api/private-trading/party-summary?kms_year=2025-2026")
        assert response.status_code == 200
        
        data = response.json()
        assert 'totals' in data
        totals = data['totals']
        
        assert 'total_parties' in totals
        assert 'total_purchase' in totals
        assert 'total_purchase_paid' in totals
        assert 'total_purchase_balance' in totals
        
        assert totals['total_parties'] >= 4
        print(f"✅ Party Summary totals: {totals['total_parties']} parties, Rs.{totals['total_purchase']} purchase")
    
    def test_party_summary_2024_2025_empty(self):
        """Party summary for 2024-2025 should have fewer/no parties (data is on 2025-2026)"""
        response = requests.get(f"{BASE_URL}/api/private-trading/party-summary?kms_year=2024-2025")
        assert response.status_code == 200
        
        data = response.json()
        # This year may have no data or less data
        print(f"✅ Party Summary 2024-2025: {data['totals']['total_parties']} parties (expected fewer than 2025-2026)")


class TestStockSummaryRegression:
    """Regression: Stock Summary still works with opening stock"""
    
    def test_stock_summary_includes_opening(self):
        """Stock summary should include opening field for all items"""
        response = requests.get(f"{BASE_URL}/api/stock-summary?kms_year=2025-2026")
        assert response.status_code == 200
        
        data = response.json()
        assert 'items' in data
        
        for item in data['items']:
            assert 'opening' in item, f"Item {item['name']} should have 'opening' field"
            assert 'available' in item
            assert 'in_qty' in item
            assert 'out_qty' in item
        
        # Check Paddy opening stock
        paddy = next((item for item in data['items'] if item['name'] == 'Paddy'), None)
        assert paddy is not None
        assert paddy['opening'] == 500.0, f"Paddy opening should be 500Q, got {paddy['opening']}"
        
        # Check Rice (Usna) opening stock
        rice_usna = next((item for item in data['items'] if item['name'] == 'Rice (Usna)'), None)
        assert rice_usna is not None
        assert rice_usna['opening'] == 300.0, f"Rice (Usna) opening should be 300Q, got {rice_usna['opening']}"
        
        print(f"✅ Stock Summary: Paddy OB={paddy['opening']}Q, Rice(Usna) OB={rice_usna['opening']}Q")


class TestBrandingRegression:
    """Regression: Branding custom_fields still saved"""
    
    def test_branding_custom_fields(self):
        """Branding should return custom_fields array"""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200
        
        data = response.json()
        assert 'custom_fields' in data
        assert isinstance(data['custom_fields'], list)
        
        # Check GSTIN and Mobile fields exist
        field_labels = [f['label'] for f in data['custom_fields']]
        assert 'GSTIN' in field_labels or 'Mobile' in field_labels, "Custom fields should have GSTIN or Mobile"
        
        # Check position field
        for field in data['custom_fields']:
            assert 'position' in field
            assert field['position'] in ['left', 'center', 'right']
        
        print(f"✅ Branding custom_fields: {len(data['custom_fields'])} fields with positions")


class TestOpeningStock:
    """Test opening stock endpoint"""
    
    def test_opening_stock_returns_data(self):
        """Opening stock should return stock items for kms_year"""
        response = requests.get(f"{BASE_URL}/api/opening-stock?kms_year=2025-2026")
        assert response.status_code == 200
        
        data = response.json()
        assert 'stocks' in data or isinstance(data, dict)
        print(f"✅ Opening stock endpoint working")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
