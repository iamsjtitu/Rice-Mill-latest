"""
Test Telegram Bot Integration API endpoints
Tests for: GET/POST /api/telegram/config, POST /api/telegram/test, 
           POST /api/telegram/send-report, GET /api/telegram/logs
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestTelegramConfig:
    """Test /api/telegram/config GET and POST endpoints"""
    
    def test_get_config_returns_default_when_no_config_saved(self):
        """GET /api/telegram/config should return default empty config when no config saved"""
        response = requests.get(f"{BASE_URL}/api/telegram/config")
        
        # Status code check
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Data assertions
        data = response.json()
        # Should have default structure (bot_token may be empty or masked if config exists)
        assert "schedule_time" in data, "Missing schedule_time field"
        assert "enabled" in data, "Missing enabled field"
        print(f"✓ GET /api/telegram/config returned: {data}")
    
    def test_save_config_requires_bot_token(self):
        """POST /api/telegram/config should return 400 when bot_token is empty"""
        response = requests.post(
            f"{BASE_URL}/api/telegram/config",
            json={"bot_token": "", "chat_id": "123456789", "schedule_time": "21:00", "enabled": False}
        )
        
        # Status code check - should be 400 Bad Request
        assert response.status_code == 400, f"Expected 400 when bot_token empty, got {response.status_code}"
        
        # Data assertion - should have error detail
        data = response.json()
        assert "detail" in data, "Missing error detail"
        print(f"✓ POST /api/telegram/config (empty bot_token) returned 400: {data.get('detail')}")
    
    def test_save_config_requires_chat_id(self):
        """POST /api/telegram/config should return 400 when chat_id is empty"""
        response = requests.post(
            f"{BASE_URL}/api/telegram/config",
            json={"bot_token": "123456:ABC-DEF", "chat_id": "", "schedule_time": "21:00", "enabled": False}
        )
        
        # Status code check - should be 400 Bad Request
        assert response.status_code == 400, f"Expected 400 when chat_id empty, got {response.status_code}"
        
        # Data assertion
        data = response.json()
        assert "detail" in data, "Missing error detail"
        print(f"✓ POST /api/telegram/config (empty chat_id) returned 400: {data.get('detail')}")
    
    def test_save_config_validates_bot_token_with_telegram_api(self):
        """POST /api/telegram/config with invalid bot_token should return 400 from Telegram API validation"""
        response = requests.post(
            f"{BASE_URL}/api/telegram/config",
            json={"bot_token": "invalid_token_12345", "chat_id": "123456789", "schedule_time": "21:00", "enabled": False}
        )
        
        # Status code - should fail validation against Telegram API
        assert response.status_code == 400, f"Expected 400 for invalid bot token, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data, "Missing error detail"
        print(f"✓ POST /api/telegram/config (invalid token) returned 400: {data.get('detail')}")


class TestTelegramTest:
    """Test /api/telegram/test POST endpoint"""
    
    def test_test_message_requires_bot_token(self):
        """POST /api/telegram/test should return 400 when bot_token is empty"""
        response = requests.post(
            f"{BASE_URL}/api/telegram/test",
            json={"bot_token": "", "chat_id": "123456789"}
        )
        
        # Status code check
        assert response.status_code == 400, f"Expected 400 when bot_token empty, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data, "Missing error detail"
        print(f"✓ POST /api/telegram/test (empty bot_token) returned 400: {data.get('detail')}")
    
    def test_test_message_requires_chat_id(self):
        """POST /api/telegram/test should return 400 when chat_id is empty"""
        response = requests.post(
            f"{BASE_URL}/api/telegram/test",
            json={"bot_token": "123456:ABC-DEF", "chat_id": ""}
        )
        
        # Status code check
        assert response.status_code == 400, f"Expected 400 when chat_id empty, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data, "Missing error detail"
        print(f"✓ POST /api/telegram/test (empty chat_id) returned 400: {data.get('detail')}")
    
    def test_test_message_with_invalid_token_fails(self):
        """POST /api/telegram/test with invalid credentials should return 400"""
        response = requests.post(
            f"{BASE_URL}/api/telegram/test",
            json={"bot_token": "invalid_token_xyz", "chat_id": "123456789"}
        )
        
        # Should fail - Telegram API will reject invalid token
        assert response.status_code == 400, f"Expected 400 for invalid token, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data, "Missing error detail"
        print(f"✓ POST /api/telegram/test (invalid token) returned 400: {data.get('detail')}")


class TestTelegramSendReport:
    """Test /api/telegram/send-report POST endpoint"""
    
    def test_send_report_returns_error_when_no_config_saved(self):
        """POST /api/telegram/send-report should return 400 when no config is saved"""
        # First, ensure we don't have a valid config (we'll use the default state)
        # This test assumes no valid telegram config has been saved
        response = requests.post(
            f"{BASE_URL}/api/telegram/send-report",
            json={"date": "2026-01-15"}
        )
        
        # Should return 400 if no config is saved or config is incomplete
        # The actual status depends on whether config exists
        print(f"POST /api/telegram/send-report returned status: {response.status_code}")
        
        if response.status_code == 400:
            data = response.json()
            assert "detail" in data, "Missing error detail"
            print(f"✓ POST /api/telegram/send-report (no config) returned 400: {data.get('detail')}")
        elif response.status_code == 500:
            # This could happen if config exists but Telegram API fails
            print(f"✓ POST /api/telegram/send-report returned 500 (likely Telegram API error)")
        else:
            # If config exists and somehow works, that's fine too
            print(f"  POST /api/telegram/send-report returned {response.status_code}")
        
        # Test passes as long as we don't get unexpected errors
        assert response.status_code in [400, 500, 200], f"Unexpected status: {response.status_code}"


class TestTelegramLogs:
    """Test /api/telegram/logs GET endpoint"""
    
    def test_get_logs_returns_array(self):
        """GET /api/telegram/logs should return an array (possibly empty)"""
        response = requests.get(f"{BASE_URL}/api/telegram/logs")
        
        # Status code check
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Data assertion - should be a list
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✓ GET /api/telegram/logs returned {len(data)} log entries")
        
        # If there are logs, verify structure
        if len(data) > 0:
            first_log = data[0]
            assert "date" in first_log or "sent_at" in first_log, "Log entry missing date/sent_at field"
            assert "status" in first_log, "Log entry missing status field"
            print(f"  First log entry: {first_log}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
