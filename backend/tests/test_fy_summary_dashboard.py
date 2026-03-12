"""
Test FY Summary Dashboard API and related endpoints
Iteration 34: Testing FY Summary Dashboard feature with all 10 sections
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://mill-entry-portal.preview.emergentagent.com').rstrip('/')

class TestFYSummaryAPI:
    """FY Summary Dashboard API Tests - All 10 Sections"""
    
    def test_fy_summary_endpoint_returns_200(self):
        """Verify /api/fy-summary endpoint returns 200 OK"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ FY Summary API returns 200 OK")
    
    def test_fy_summary_has_all_10_sections(self):
        """Verify FY Summary API returns all 10 required sections"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        data = response.json()
        
        required_sections = [
            'cash_bank', 'paddy_stock', 'milling', 'frk_stock', 
            'byproducts', 'mill_parts', 'diesel', 'local_party', 
            'staff_advances', 'private_trading'
        ]
        
        for section in required_sections:
            assert section in data, f"Missing section: {section}"
        
        print(f"✓ All 10 sections present: {', '.join(required_sections)}")
    
    def test_cash_bank_section_structure(self):
        """Verify cash_bank section has opening/closing/in/out fields"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        data = response.json()
        
        cb = data['cash_bank']
        required_fields = ['opening_cash', 'cash_in', 'cash_out', 'closing_cash',
                          'opening_bank', 'bank_in', 'bank_out', 'closing_bank']
        
        for field in required_fields:
            assert field in cb, f"Missing field: {field}"
        
        # Verify formula: closing = opening + in - out
        assert cb['closing_cash'] == cb['opening_cash'] + cb['cash_in'] - cb['cash_out']
        assert cb['closing_bank'] == cb['opening_bank'] + cb['bank_in'] - cb['bank_out']
        
        print(f"✓ Cash & Bank section: Opening={cb['opening_cash']+cb['opening_bank']}, In={cb['cash_in']+cb['bank_in']}, Out={cb['cash_out']+cb['bank_out']}, Closing={cb['closing_cash']+cb['closing_bank']}")
    
    def test_paddy_stock_section_structure(self):
        """Verify paddy_stock section has correct fields"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        data = response.json()
        
        ps = data['paddy_stock']
        assert 'opening_stock' in ps
        assert 'paddy_in' in ps
        assert 'paddy_used' in ps
        assert 'closing_stock' in ps
        
        # Verify formula: closing = opening + in - used
        assert ps['closing_stock'] == ps['opening_stock'] + ps['paddy_in'] - ps['paddy_used']
        
        print(f"✓ Paddy Stock: Opening={ps['opening_stock']}, In={ps['paddy_in']}, Used={ps['paddy_used']}, Closing={ps['closing_stock']} Qtl")
    
    def test_frk_stock_section_structure(self):
        """Verify frk_stock section has correct fields"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        data = response.json()
        
        frk = data['frk_stock']
        assert 'opening_stock' in frk
        assert 'purchased' in frk
        assert 'used' in frk
        assert 'closing_stock' in frk
        assert 'total_cost' in frk
        
        print(f"✓ FRK Stock: Opening={frk['opening_stock']}, Purchased={frk['purchased']}, Used={frk['used']}, Closing={frk['closing_stock']} Qtl, Cost=₹{frk['total_cost']}")
    
    def test_byproducts_section_has_all_products(self):
        """Verify byproducts section has bran, kunda, broken, kanki, husk"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        data = response.json()
        
        bp = data['byproducts']
        required_products = ['bran', 'kunda', 'broken', 'kanki', 'husk']
        
        for product in required_products:
            assert product in bp, f"Missing byproduct: {product}"
            assert 'opening_stock' in bp[product]
            assert 'produced' in bp[product]
            assert 'sold' in bp[product]
            assert 'closing_stock' in bp[product]
            assert 'revenue' in bp[product]
        
        print(f"✓ Byproducts: All 5 products (bran, kunda, broken, kanki, husk) with opening/produced/sold/closing/revenue")
    
    def test_mill_parts_section_structure(self):
        """Verify mill_parts section returns array with correct structure"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        data = response.json()
        
        parts = data['mill_parts']
        assert isinstance(parts, list)
        
        if len(parts) > 0:
            part = parts[0]
            assert 'name' in part
            assert 'unit' in part
            assert 'opening_stock' in part
            assert 'stock_in' in part
            assert 'stock_used' in part
            assert 'closing_stock' in part
            print(f"✓ Mill Parts: {len(parts)} parts found with opening/in/used/closing structure")
        else:
            print("✓ Mill Parts: Section present (no parts in system)")
    
    def test_diesel_section_structure(self):
        """Verify diesel section returns array with pump data"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        data = response.json()
        
        diesel = data['diesel']
        assert isinstance(diesel, list)
        
        if len(diesel) > 0:
            pump = diesel[0]
            assert 'pump_name' in pump
            assert 'opening_balance' in pump
            assert 'total_diesel' in pump
            assert 'total_paid' in pump
            assert 'closing_balance' in pump
            print(f"✓ Diesel: {len(diesel)} pumps found with opening/diesel/paid/closing structure")
        else:
            print("✓ Diesel: Section present (no pumps in system)")
    
    def test_local_party_section_structure(self):
        """Verify local_party section has totals"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        data = response.json()
        
        lp = data['local_party']
        assert 'party_count' in lp
        assert 'opening_balance' in lp
        assert 'total_debit' in lp
        assert 'total_paid' in lp
        assert 'closing_balance' in lp
        
        print(f"✓ Local Party: {lp['party_count']} parties, Opening=₹{lp['opening_balance']}, Debit=₹{lp['total_debit']}, Paid=₹{lp['total_paid']}, Closing=₹{lp['closing_balance']}")
    
    def test_staff_advances_section_structure(self):
        """Verify staff_advances section returns array"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        data = response.json()
        
        staff = data['staff_advances']
        assert isinstance(staff, list)
        
        if len(staff) > 0:
            s = staff[0]
            assert 'name' in s
            assert 'opening_balance' in s
            assert 'total_advance' in s
            assert 'total_deducted' in s
            assert 'closing_balance' in s
            print(f"✓ Staff Advances: {len(staff)} staff found - {staff[0]['name']}: Opening=₹{s['opening_balance']}, Advance=₹{s['total_advance']}, Deducted=₹{s['total_deducted']}, Balance=₹{s['closing_balance']}")
        else:
            print("✓ Staff Advances: Section present (no staff in system)")
    
    def test_private_trading_section_structure(self):
        """Verify private_trading section has paddy & rice data"""
        response = requests.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-2026")
        data = response.json()
        
        pt = data['private_trading']
        paddy_fields = ['paddy_purchase_amount', 'paddy_paid', 'paddy_balance', 'paddy_qty']
        rice_fields = ['rice_sale_amount', 'rice_received', 'rice_balance', 'rice_qty']
        
        for field in paddy_fields + rice_fields:
            assert field in pt, f"Missing field: {field}"
        
        print(f"✓ Private Trading: Paddy={pt['paddy_qty']} Qtl (₹{pt['paddy_balance']} pending), Rice={pt['rice_qty']} Qtl (₹{pt['rice_balance']} pending)")


class TestRelatedAPIsForFYSummary:
    """Test related APIs that feed into FY Summary"""
    
    def test_mill_parts_summary_has_opening_stock(self):
        """Verify /api/mill-parts/summary returns opening_stock field"""
        response = requests.get(f"{BASE_URL}/api/mill-parts/summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        if isinstance(data, list) and len(data) > 0:
            part = data[0]
            assert 'opening_stock' in part, "opening_stock field missing in mill-parts/summary"
            print(f"✓ Mill Parts Summary: opening_stock field present (value={part['opening_stock']})")
        else:
            print("✓ Mill Parts Summary: API works, no parts found")
    
    def test_diesel_summary_has_opening_balance(self):
        """Verify /api/diesel-accounts/summary returns opening_balance"""
        response = requests.get(f"{BASE_URL}/api/diesel-accounts/summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        assert 'grand_opening_balance' in data, "grand_opening_balance missing"
        assert 'pumps' in data
        
        if len(data['pumps']) > 0:
            pump = data['pumps'][0]
            assert 'opening_balance' in pump, "opening_balance missing in pump"
            print(f"✓ Diesel Summary: opening_balance present (grand={data['grand_opening_balance']}, per pump={pump['opening_balance']})")
        else:
            print(f"✓ Diesel Summary: grand_opening_balance={data['grand_opening_balance']}")
    
    def test_local_party_summary_has_opening_balance(self):
        """Verify /api/local-party/summary returns opening_balance per party"""
        response = requests.get(f"{BASE_URL}/api/local-party/summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        assert 'grand_opening_balance' in data, "grand_opening_balance missing"
        assert 'parties' in data
        
        if len(data['parties']) > 0:
            party = data['parties'][0]
            assert 'opening_balance' in party, "opening_balance missing in party"
            print(f"✓ Local Party Summary: opening_balance present (grand={data['grand_opening_balance']})")
        else:
            print(f"✓ Local Party Summary: grand_opening_balance={data['grand_opening_balance']}")
    
    def test_staff_advance_balance_has_opening_balance(self):
        """Verify /api/staff/advance-balance/{id} returns opening_balance"""
        # First get staff list
        staff_response = requests.get(f"{BASE_URL}/api/staff")
        staff_list = staff_response.json()
        
        if len(staff_list) > 0:
            staff_id = staff_list[0]['id']
            response = requests.get(f"{BASE_URL}/api/staff/advance-balance/{staff_id}?kms_year=2025-2026")
            assert response.status_code == 200
            data = response.json()
            
            assert 'opening_balance' in data, "opening_balance missing in staff advance balance"
            assert 'total_advance' in data
            assert 'total_deducted' in data
            assert 'balance' in data
            
            print(f"✓ Staff Advance Balance: opening_balance={data['opening_balance']}, balance={data['balance']}")
        else:
            pytest.skip("No staff found in system")
    
    def test_staff_list_endpoint(self):
        """Verify staff list endpoint works (used by Monthly Report)"""
        response = requests.get(f"{BASE_URL}/api/staff")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        if len(data) > 0:
            staff = data[0]
            assert 'id' in staff
            assert 'name' in staff
            print(f"✓ Staff List: {len(data)} staff found - {staff['name']}")
        else:
            print("✓ Staff List: API works, no staff found")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
