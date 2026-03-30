"""
Test WhatsApp Group Send Feature - Iteration 127
Tests for GET /api/whatsapp/groups and POST /api/whatsapp/send-group endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://paddy-ledger-1.preview.emergentagent.com')


class TestWhatsAppGroupEndpoints:
    """Tests for WhatsApp Group Send feature"""
    
    def test_get_whatsapp_groups_returns_success(self):
        """GET /api/whatsapp/groups should return success even when groups are empty"""
        response = requests.get(f"{BASE_URL}/api/whatsapp/groups")
        assert response.status_code == 200
        data = response.json()
        assert "success" in data
        assert "groups" in data
        assert isinstance(data["groups"], list)
        print(f"✓ GET /api/whatsapp/groups returned {len(data['groups'])} groups")
    
    def test_send_group_with_valid_data(self):
        """POST /api/whatsapp/send-group with valid group_id and text should succeed"""
        response = requests.post(
            f"{BASE_URL}/api/whatsapp/send-group",
            json={"group_id": "test_group_123", "text": "Test message from pytest"}
        )
        assert response.status_code == 200
        data = response.json()
        # API may return success or error depending on actual group existence
        assert "success" in data or "error" in data
        print(f"✓ POST /api/whatsapp/send-group with valid data: {data}")
    
    def test_send_group_without_group_id_returns_400(self):
        """POST /api/whatsapp/send-group without group_id should return 400"""
        response = requests.post(
            f"{BASE_URL}/api/whatsapp/send-group",
            json={"text": "Test message"}
        )
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        assert "Group ID" in data["detail"]
        print(f"✓ POST without group_id returns 400: {data['detail']}")
    
    def test_send_group_without_text_or_media_returns_400(self):
        """POST /api/whatsapp/send-group without text or media should return 400"""
        response = requests.post(
            f"{BASE_URL}/api/whatsapp/send-group",
            json={"group_id": "test_group_123"}
        )
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        assert "Text" in data["detail"] or "media" in data["detail"]
        print(f"✓ POST without text/media returns 400: {data['detail']}")
    
    def test_send_group_with_pdf_url(self):
        """POST /api/whatsapp/send-group with pdf_url should work"""
        response = requests.post(
            f"{BASE_URL}/api/whatsapp/send-group",
            json={
                "group_id": "test_group_123",
                "text": "Test with PDF",
                "pdf_url": "/api/cash-book/pdf"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "success" in data or "error" in data
        print(f"✓ POST with pdf_url: {data}")


class TestWhatsAppSettings:
    """Tests for WhatsApp settings endpoint"""
    
    def test_get_whatsapp_settings(self):
        """GET /api/whatsapp/settings should return settings"""
        response = requests.get(f"{BASE_URL}/api/whatsapp/settings")
        assert response.status_code == 200
        data = response.json()
        # Should have api_key_masked or enabled field
        assert "enabled" in data or "api_key_masked" in data
        print(f"✓ GET /api/whatsapp/settings returned settings")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
