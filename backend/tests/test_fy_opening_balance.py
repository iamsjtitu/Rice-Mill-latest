"""
Test FY Opening Balance carry-forward for all modules
- Mill Parts Stock Summary: opening_stock field
- Diesel Accounts Summary: opening_balance per pump + grand_opening_balance
- Local Party Summary: opening_balance per party + grand_opening_balance
- Staff Advance Balance: opening_balance field
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://mill-entry-system-1.preview.emergentagent.com')
KMS_YEAR = "2025-2026"

class TestMillPartsSummary:
    """Mill Parts Stock Summary - opening_stock field verification"""
    
    def test_mill_parts_summary_has_opening_stock(self):
        """Verify opening_stock field is returned in mill-parts/summary"""
        response = requests.get(f"{BASE_URL}/api/mill-parts/summary?kms_year={KMS_YEAR}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Check structure if data exists
        if data:
            first_item = data[0]
            assert "opening_stock" in first_item, "opening_stock field missing in mill parts summary"
            assert "stock_in" in first_item
            assert "stock_used" in first_item
            assert "current_stock" in first_item
            # Verify current_stock = opening_stock + stock_in - stock_used
            expected_current = first_item["opening_stock"] + first_item["stock_in"] - first_item["stock_used"]
            assert abs(first_item["current_stock"] - expected_current) < 0.01, "current_stock calculation mismatch"
            print(f"✓ Mill Parts Summary has opening_stock: {first_item['opening_stock']}")


class TestDieselAccountsSummary:
    """Diesel Accounts Summary - opening_balance verification"""
    
    def test_diesel_summary_has_grand_opening_balance(self):
        """Verify grand_opening_balance field is returned"""
        response = requests.get(f"{BASE_URL}/api/diesel-accounts/summary?kms_year={KMS_YEAR}")
        assert response.status_code == 200
        data = response.json()
        assert "grand_opening_balance" in data, "grand_opening_balance missing in diesel summary"
        assert "pumps" in data
        assert "grand_total_diesel" in data
        assert "grand_total_paid" in data
        assert "grand_balance" in data
        print(f"✓ Diesel Summary has grand_opening_balance: {data['grand_opening_balance']}")
    
    def test_diesel_summary_pumps_have_opening_balance(self):
        """Verify each pump has opening_balance field"""
        response = requests.get(f"{BASE_URL}/api/diesel-accounts/summary?kms_year={KMS_YEAR}")
        assert response.status_code == 200
        data = response.json()
        pumps = data.get("pumps", [])
        for pump in pumps:
            assert "opening_balance" in pump, f"opening_balance missing for pump {pump.get('pump_name')}"
            assert "total_diesel" in pump
            assert "total_paid" in pump
            assert "balance" in pump
            # Verify balance = opening_balance + total_diesel - total_paid
            expected_balance = pump["opening_balance"] + pump["total_diesel"] - pump["total_paid"]
            assert abs(pump["balance"] - expected_balance) < 0.01, f"Balance calculation mismatch for pump {pump.get('pump_name')}"
            print(f"✓ Pump '{pump.get('pump_name')}' has opening_balance: {pump['opening_balance']}")


class TestLocalPartySummary:
    """Local Party Summary - opening_balance verification"""
    
    def test_local_party_summary_has_grand_opening_balance(self):
        """Verify grand_opening_balance field is returned"""
        response = requests.get(f"{BASE_URL}/api/local-party/summary?kms_year={KMS_YEAR}")
        assert response.status_code == 200
        data = response.json()
        assert "grand_opening_balance" in data, "grand_opening_balance missing in local party summary"
        assert "parties" in data
        assert "grand_total_debit" in data
        assert "grand_total_paid" in data
        assert "grand_balance" in data
        print(f"✓ Local Party Summary has grand_opening_balance: {data['grand_opening_balance']}")
    
    def test_local_party_summary_parties_have_opening_balance(self):
        """Verify each party has opening_balance field"""
        response = requests.get(f"{BASE_URL}/api/local-party/summary?kms_year={KMS_YEAR}")
        assert response.status_code == 200
        data = response.json()
        parties = data.get("parties", [])
        for party in parties:
            assert "opening_balance" in party, f"opening_balance missing for party {party.get('party_name')}"
            assert "total_debit" in party
            assert "total_paid" in party
            assert "balance" in party
            # Verify balance = opening_balance + total_debit - total_paid
            expected_balance = party["opening_balance"] + party["total_debit"] - party["total_paid"]
            assert abs(party["balance"] - expected_balance) < 0.01, f"Balance calculation mismatch for party {party.get('party_name')}"
            print(f"✓ Party '{party.get('party_name')}' has opening_balance: {party['opening_balance']}")


class TestStaffAdvanceBalance:
    """Staff Advance Balance - opening_balance verification"""
    
    @pytest.fixture
    def staff_id(self):
        """Get a staff ID for testing"""
        response = requests.get(f"{BASE_URL}/api/staff")
        assert response.status_code == 200
        staff_list = response.json()
        if not staff_list:
            pytest.skip("No staff found in database")
        return staff_list[0]["id"]
    
    def test_staff_advance_balance_has_opening_balance(self, staff_id):
        """Verify opening_balance field is returned in staff advance-balance"""
        response = requests.get(f"{BASE_URL}/api/staff/advance-balance/{staff_id}?kms_year={KMS_YEAR}")
        assert response.status_code == 200
        data = response.json()
        assert "opening_balance" in data, "opening_balance missing in staff advance-balance"
        assert "total_advance" in data
        assert "total_deducted" in data
        assert "balance" in data
        # Verify balance = opening_balance + total_advance - total_deducted
        expected_balance = data["opening_balance"] + data["total_advance"] - data["total_deducted"]
        assert abs(data["balance"] - expected_balance) < 0.01, "Balance calculation mismatch"
        print(f"✓ Staff Advance Balance has opening_balance: {data['opening_balance']}")


class TestStaffAdvanceEndpoint:
    """Test Staff Advance API endpoint (Monthly Report fix)"""
    
    def test_staff_advance_endpoint_exists(self):
        """Verify /api/staff/advance endpoint works (not /api/staff/advances)"""
        response = requests.get(f"{BASE_URL}/api/staff/advance")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ /api/staff/advance endpoint returns {len(data)} records")
    
    def test_staff_advances_endpoint_returns_404(self):
        """Verify /api/staff/advances (old endpoint) does not exist"""
        response = requests.get(f"{BASE_URL}/api/staff/advances")
        # Should be 404 or 405 (not found)
        assert response.status_code in [404, 405], "Old /api/staff/advances endpoint should not exist"
        print(f"✓ Old /api/staff/advances endpoint correctly returns {response.status_code}")


class TestMonthlyReportDataLoad:
    """Test Monthly Report data loading (Staff attendance and advances)"""
    
    def test_staff_list(self):
        """Get staff list for monthly report"""
        response = requests.get(f"{BASE_URL}/api/staff?active=true")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Staff list returns {len(data)} staff members")
    
    def test_staff_attendance(self):
        """Get staff attendance for monthly report"""
        # Get current month
        from datetime import datetime
        now = datetime.now()
        date_from = f"{now.year}-{now.month:02d}-01"
        # Get last day of month
        if now.month == 12:
            last_day = 31
        else:
            from calendar import monthrange
            last_day = monthrange(now.year, now.month)[1]
        date_to = f"{now.year}-{now.month:02d}-{last_day:02d}"
        
        response = requests.get(f"{BASE_URL}/api/staff/attendance?date_from={date_from}&date_to={date_to}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Staff attendance returns {len(data)} records for {date_from} to {date_to}")
    
    def test_staff_advance_for_report(self):
        """Get staff advances for monthly report (the fixed endpoint)"""
        response = requests.get(f"{BASE_URL}/api/staff/advance")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Staff advance returns {len(data)} advance records")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
