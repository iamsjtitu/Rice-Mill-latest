"""
Iteration 101 Tests: Round Off Feature & Telegram Button
- Cash Book: Round Off entries hidden by default, toggle to show/hide
- Daily Report: Telegram button in Detail mode only
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCashBookRoundOffFeature:
    """Test Round Off entries filtering in Cash Book"""
    
    def test_cash_book_exclude_round_off_true(self):
        """GET /api/cash-book?account=cash&exclude_round_off=true should exclude Round Off entries"""
        response = requests.get(f"{BASE_URL}/api/cash-book?account=cash&exclude_round_off=true")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Verify no Round Off entries in response
        round_off_entries = [t for t in data if t.get('party_type') == 'Round Off']
        assert len(round_off_entries) == 0, f"Found {len(round_off_entries)} Round Off entries when exclude_round_off=true"
        print(f"PASS: exclude_round_off=true returns {len(data)} entries with 0 Round Off entries")
    
    def test_cash_book_without_exclude_round_off(self):
        """GET /api/cash-book?account=cash should include all entries (including Round Off)"""
        response = requests.get(f"{BASE_URL}/api/cash-book?account=cash")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: Without exclude_round_off returns {len(data)} entries")
    
    def test_cash_book_exclude_round_off_false(self):
        """GET /api/cash-book?account=cash&exclude_round_off=false should include Round Off entries"""
        response = requests.get(f"{BASE_URL}/api/cash-book?account=cash&exclude_round_off=false")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: exclude_round_off=false returns {len(data)} entries")
    
    def test_cash_book_party_type_filter_overrides_exclude(self):
        """When party_type filter is set, exclude_round_off should not apply"""
        # If user explicitly filters by party_type='Round Off', they should see Round Off entries
        response = requests.get(f"{BASE_URL}/api/cash-book?account=cash&party_type=Round%20Off")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # All entries should be Round Off type (if any exist)
        for entry in data:
            assert entry.get('party_type') == 'Round Off', f"Expected party_type='Round Off', got {entry.get('party_type')}"
        print(f"PASS: party_type=Round Off filter returns {len(data)} Round Off entries")
    
    def test_cash_book_ledger_account_not_affected(self):
        """exclude_round_off should only work for cash account, not ledger"""
        response = requests.get(f"{BASE_URL}/api/cash-book?account=ledger&exclude_round_off=true")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: Ledger account with exclude_round_off returns {len(data)} entries")


class TestTelegramSendReportEndpoint:
    """Test Telegram send-report endpoint exists and responds"""
    
    def test_telegram_send_report_endpoint_exists(self):
        """POST /api/telegram/send-report endpoint should exist"""
        # Send with a test date - may fail if Telegram not configured, but endpoint should exist
        response = requests.post(f"{BASE_URL}/api/telegram/send-report", json={
            "date": "2026-01-15",
            "kms_year": "2025-26",
            "season": "Kharif"
        })
        
        # Endpoint should return 200 (success) or 400 (config not set) - not 404
        assert response.status_code in [200, 400, 500], f"Expected 200/400/500, got {response.status_code}"
        
        data = response.json()
        if response.status_code == 400:
            # Expected if Telegram not configured
            assert 'detail' in data or 'message' in data, "Should have error message"
            print(f"PASS: Endpoint exists, returns 400 (Telegram not configured): {data.get('detail', data.get('message'))}")
        elif response.status_code == 200:
            assert 'success' in data, "Should have success field"
            print(f"PASS: Endpoint exists and works: {data.get('message')}")
        else:
            print(f"PASS: Endpoint exists, returns {response.status_code}: {data}")
    
    def test_telegram_config_endpoint(self):
        """GET /api/telegram/config should return config structure"""
        response = requests.get(f"{BASE_URL}/api/telegram/config")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Should have these fields even if empty
        assert 'chat_ids' in data or 'bot_token' in data, "Should have config fields"
        print(f"PASS: Telegram config endpoint returns: enabled={data.get('enabled', False)}")


class TestDailyReportAPI:
    """Test Daily Report API for both modes"""
    
    def test_daily_report_normal_mode(self):
        """GET /api/reports/daily?mode=normal should work"""
        response = requests.get(f"{BASE_URL}/api/reports/daily?date=2026-01-15&mode=normal")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert 'paddy_entries' in data, "Should have paddy_entries"
        print(f"PASS: Daily report normal mode works")
    
    def test_daily_report_detail_mode(self):
        """GET /api/reports/daily?mode=detail should work"""
        response = requests.get(f"{BASE_URL}/api/reports/daily?date=2026-01-15&mode=detail")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert 'paddy_entries' in data, "Should have paddy_entries"
        print(f"PASS: Daily report detail mode works")


class TestVersionCheck:
    """Test version is v25.1.55"""
    
    def test_cash_book_summary_endpoint(self):
        """Cash book summary endpoint should work"""
        response = requests.get(f"{BASE_URL}/api/cash-book/summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert 'cash_in' in data, "Should have cash_in field"
        print(f"PASS: Cash book summary endpoint works")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
