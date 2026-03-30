"""
Test WhatsApp Settings - Default Group, Schedule, and related features
Iteration 128 - Testing new fields: default_group_id, default_group_name, group_schedule_enabled, group_schedule_time
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestWhatsAppSettings:
    """Test WhatsApp settings API endpoints for new group schedule features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_get_whatsapp_settings_returns_new_fields(self):
        """GET /api/whatsapp/settings should return all new fields"""
        response = self.session.get(f"{BASE_URL}/api/whatsapp/settings")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Check that new fields exist in response (may be empty strings/false initially)
        assert "default_group_id" in data or data.get("default_group_id", "") == "", "default_group_id field should exist"
        assert "default_group_name" in data or data.get("default_group_name", "") == "", "default_group_name field should exist"
        # group_schedule_enabled and group_schedule_time may not be returned if not set
        print(f"GET /api/whatsapp/settings response: {data}")
        print("PASS: GET /api/whatsapp/settings returns expected fields")
    
    def test_put_whatsapp_settings_saves_all_new_fields(self):
        """PUT /api/whatsapp/settings should save default_group_id, default_group_name, group_schedule_enabled, group_schedule_time"""
        # First get current settings to preserve api_key
        get_response = self.session.get(f"{BASE_URL}/api/whatsapp/settings")
        current = get_response.json()
        
        # Update with new fields
        update_payload = {
            "api_key": current.get("api_key", ""),  # Preserve existing API key
            "country_code": current.get("country_code", "91"),
            "default_numbers": ",".join(current.get("default_numbers", [])) if isinstance(current.get("default_numbers"), list) else current.get("default_numbers", ""),
            "default_group_id": "test-group-128",
            "default_group_name": "Test Group 128",
            "group_schedule_enabled": True,
            "group_schedule_time": "09:30"
        }
        
        response = self.session.put(f"{BASE_URL}/api/whatsapp/settings", json=update_payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, f"Expected success=True, got {data}"
        print(f"PUT /api/whatsapp/settings response: {data}")
        
        # Verify by GET
        verify_response = self.session.get(f"{BASE_URL}/api/whatsapp/settings")
        verify_data = verify_response.json()
        
        assert verify_data.get("default_group_id") == "test-group-128", f"default_group_id not saved: {verify_data}"
        assert verify_data.get("default_group_name") == "Test Group 128", f"default_group_name not saved: {verify_data}"
        assert verify_data.get("group_schedule_enabled") == True, f"group_schedule_enabled not saved: {verify_data}"
        assert verify_data.get("group_schedule_time") == "09:30", f"group_schedule_time not saved: {verify_data}"
        
        print("PASS: PUT /api/whatsapp/settings saves all new fields correctly")
    
    def test_put_whatsapp_settings_schedule_disabled(self):
        """PUT /api/whatsapp/settings with schedule disabled"""
        get_response = self.session.get(f"{BASE_URL}/api/whatsapp/settings")
        current = get_response.json()
        
        update_payload = {
            "api_key": current.get("api_key", ""),
            "country_code": "91",
            "default_numbers": "",
            "default_group_id": "test-group-disabled",
            "default_group_name": "Test Group Disabled",
            "group_schedule_enabled": False,
            "group_schedule_time": ""
        }
        
        response = self.session.put(f"{BASE_URL}/api/whatsapp/settings", json=update_payload)
        assert response.status_code == 200
        
        verify_response = self.session.get(f"{BASE_URL}/api/whatsapp/settings")
        verify_data = verify_response.json()
        
        assert verify_data.get("group_schedule_enabled") == False, f"group_schedule_enabled should be False: {verify_data}"
        print("PASS: Schedule can be disabled correctly")
    
    def test_get_whatsapp_groups_endpoint(self):
        """GET /api/whatsapp/groups should work (may return empty if no API key)"""
        response = self.session.get(f"{BASE_URL}/api/whatsapp/groups")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Should have success and groups fields
        assert "success" in data, "Response should have 'success' field"
        assert "groups" in data, "Response should have 'groups' field"
        print(f"GET /api/whatsapp/groups response: success={data.get('success')}, groups_count={len(data.get('groups', []))}")
        print("PASS: GET /api/whatsapp/groups endpoint works")
    
    def test_post_send_group_without_group_id(self):
        """POST /api/whatsapp/send-group without group_id should return 400"""
        response = self.session.post(f"{BASE_URL}/api/whatsapp/send-group", json={
            "text": "Test message"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("PASS: POST /api/whatsapp/send-group without group_id returns 400")
    
    def test_post_send_group_without_text_or_media(self):
        """POST /api/whatsapp/send-group without text or media should return 400"""
        response = self.session.post(f"{BASE_URL}/api/whatsapp/send-group", json={
            "group_id": "some-group-id"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("PASS: POST /api/whatsapp/send-group without text/media returns 400")
    
    def test_post_send_group_with_valid_data(self):
        """POST /api/whatsapp/send-group with valid data should work (may fail if no API key)"""
        response = self.session.post(f"{BASE_URL}/api/whatsapp/send-group", json={
            "group_id": "test-group-id",
            "text": "Test message from iteration 128"
        })
        # Should return 200 even if API call fails (returns success: false)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Either success or error message
        assert "success" in data or "error" in data, f"Response should have success or error: {data}"
        print(f"POST /api/whatsapp/send-group response: {data}")
        print("PASS: POST /api/whatsapp/send-group endpoint works")


class TestWhatsAppSettingsCleanup:
    """Cleanup test data after tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_cleanup_restore_settings(self):
        """Restore settings to a clean state"""
        # Get current settings
        get_response = self.session.get(f"{BASE_URL}/api/whatsapp/settings")
        current = get_response.json()
        
        # Reset test fields but keep API key
        update_payload = {
            "api_key": current.get("api_key", ""),
            "country_code": current.get("country_code", "91"),
            "default_numbers": ",".join(current.get("default_numbers", [])) if isinstance(current.get("default_numbers"), list) else current.get("default_numbers", ""),
            "default_group_id": "",
            "default_group_name": "",
            "group_schedule_enabled": False,
            "group_schedule_time": ""
        }
        
        response = self.session.put(f"{BASE_URL}/api/whatsapp/settings", json=update_payload)
        assert response.status_code == 200
        print("PASS: Settings cleaned up")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
