"""
Test suite for PDF Watermark Settings feature
Tests:
- GET /api/settings/watermark - returns default watermark settings
- PUT /api/settings/watermark - saves watermark settings
- PUT /api/settings/watermark - validates opacity range (0.02-0.20)
- PDF export with watermark enabled generates successfully
- PDF export with watermark disabled generates successfully
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestWatermarkSettings:
    """Watermark settings API tests"""

    def test_get_watermark_settings_returns_defaults(self):
        """GET /api/settings/watermark returns default watermark settings"""
        response = requests.get(f"{BASE_URL}/api/settings/watermark")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify default structure
        assert "enabled" in data, "Response should have 'enabled' field"
        assert "type" in data, "Response should have 'type' field"
        assert "opacity" in data, "Response should have 'opacity' field"
        assert data["type"] in ["text", "image"], f"Type should be 'text' or 'image', got {data['type']}"
        print(f"PASS: GET /api/settings/watermark returns defaults: enabled={data.get('enabled')}, type={data.get('type')}, text={data.get('text')}, opacity={data.get('opacity')}")

    def test_put_watermark_settings_saves_text_watermark(self):
        """PUT /api/settings/watermark saves watermark settings (enabled, type, text, opacity)"""
        payload = {
            "enabled": True,
            "type": "text",
            "text": "TEST_WATERMARK_TEXT",
            "opacity": 0.10
        }
        response = requests.put(
            f"{BASE_URL}/api/settings/watermark?username=admin&role=admin",
            json=payload
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Response should indicate success"
        assert "settings" in data, "Response should contain settings"
        
        settings = data["settings"]
        assert settings["enabled"] == True, "Enabled should be True"
        assert settings["type"] == "text", "Type should be 'text'"
        assert settings["text"] == "TEST_WATERMARK_TEXT", "Text should match"
        assert settings["opacity"] == 0.10, f"Opacity should be 0.10, got {settings['opacity']}"
        print(f"PASS: PUT /api/settings/watermark saves text watermark correctly")

    def test_put_watermark_settings_validates_opacity_min(self):
        """PUT /api/settings/watermark validates opacity minimum (0.02)"""
        payload = {
            "enabled": True,
            "type": "text",
            "text": "TEST",
            "opacity": 0.01  # Below minimum
        }
        response = requests.put(
            f"{BASE_URL}/api/settings/watermark?username=admin&role=admin",
            json=payload
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        settings = data.get("settings", {})
        # Should be clamped to minimum 0.02
        assert settings["opacity"] >= 0.02, f"Opacity should be clamped to min 0.02, got {settings['opacity']}"
        print(f"PASS: Opacity below 0.02 is clamped to {settings['opacity']}")

    def test_put_watermark_settings_validates_opacity_max(self):
        """PUT /api/settings/watermark validates opacity maximum (0.20)"""
        payload = {
            "enabled": True,
            "type": "text",
            "text": "TEST",
            "opacity": 0.50  # Above maximum
        }
        response = requests.put(
            f"{BASE_URL}/api/settings/watermark?username=admin&role=admin",
            json=payload
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        settings = data.get("settings", {})
        # Should be clamped to maximum 0.20
        assert settings["opacity"] <= 0.20, f"Opacity should be clamped to max 0.20, got {settings['opacity']}"
        print(f"PASS: Opacity above 0.20 is clamped to {settings['opacity']}")

    def test_put_watermark_settings_disables_watermark(self):
        """PUT /api/settings/watermark can disable watermark"""
        payload = {
            "enabled": False,
            "type": "text",
            "text": "DISABLED_TEST",
            "opacity": 0.06
        }
        response = requests.put(
            f"{BASE_URL}/api/settings/watermark?username=admin&role=admin",
            json=payload
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        settings = data.get("settings", {})
        assert settings["enabled"] == False, "Watermark should be disabled"
        print(f"PASS: Watermark can be disabled")


class TestPDFExportWithWatermark:
    """Test PDF exports with watermark enabled/disabled"""

    def test_pdf_export_with_watermark_enabled(self):
        """When watermark is enabled with text='NAVKAR AGRO', PDF export generates successfully"""
        # First enable watermark with NAVKAR AGRO text
        payload = {
            "enabled": True,
            "type": "text",
            "text": "NAVKAR AGRO",
            "opacity": 0.06
        }
        settings_response = requests.put(
            f"{BASE_URL}/api/settings/watermark?username=admin&role=admin",
            json=payload
        )
        assert settings_response.status_code == 200, f"Failed to set watermark: {settings_response.text}"
        
        # Now test PDF export - using agent-mandi-wise report
        pdf_response = requests.get(
            f"{BASE_URL}/api/reports/agent-mandi-wise/pdf?kms_year=2026-2027"
        )
        assert pdf_response.status_code == 200, f"PDF export failed with status {pdf_response.status_code}: {pdf_response.text[:200] if pdf_response.text else 'No content'}"
        
        # Verify it's a PDF
        content_type = pdf_response.headers.get('content-type', '')
        assert 'pdf' in content_type.lower() or len(pdf_response.content) > 1000, f"Response should be PDF, got content-type: {content_type}"
        
        # Verify PDF has content
        assert len(pdf_response.content) > 0, "PDF should have content"
        print(f"PASS: PDF export with watermark enabled - size: {len(pdf_response.content)} bytes")

    def test_pdf_export_with_watermark_disabled(self):
        """When watermark is disabled, PDF should still generate fine"""
        # First disable watermark
        payload = {
            "enabled": False,
            "type": "text",
            "text": "NAVKAR AGRO",
            "opacity": 0.06
        }
        settings_response = requests.put(
            f"{BASE_URL}/api/settings/watermark?username=admin&role=admin",
            json=payload
        )
        assert settings_response.status_code == 200, f"Failed to disable watermark: {settings_response.text}"
        
        # Now test PDF export
        pdf_response = requests.get(
            f"{BASE_URL}/api/reports/agent-mandi-wise/pdf?kms_year=2026-2027"
        )
        assert pdf_response.status_code == 200, f"PDF export failed with status {pdf_response.status_code}"
        
        # Verify PDF has content
        assert len(pdf_response.content) > 0, "PDF should have content"
        print(f"PASS: PDF export with watermark disabled - size: {len(pdf_response.content)} bytes")

    def test_pdf_export_mill_entries_with_watermark(self):
        """Test mill entries PDF export with watermark"""
        # Enable watermark
        payload = {
            "enabled": True,
            "type": "text",
            "text": "NAVKAR AGRO",
            "opacity": 0.06
        }
        requests.put(
            f"{BASE_URL}/api/settings/watermark?username=admin&role=admin",
            json=payload
        )
        
        # Test mill entries PDF export
        pdf_response = requests.get(
            f"{BASE_URL}/api/export/pdf?kms_year=2026-2027"
        )
        assert pdf_response.status_code == 200, f"Mill entries PDF export failed: {pdf_response.status_code}"
        assert len(pdf_response.content) > 0, "PDF should have content"
        print(f"PASS: Mill entries PDF export with watermark - size: {len(pdf_response.content)} bytes")


class TestWatermarkSettingsPersistence:
    """Test that watermark settings persist correctly"""

    def test_settings_persist_after_save(self):
        """Verify settings are persisted and can be retrieved"""
        # Save specific settings
        save_payload = {
            "enabled": True,
            "type": "text",
            "text": "PERSISTENCE_TEST",
            "opacity": 0.15
        }
        save_response = requests.put(
            f"{BASE_URL}/api/settings/watermark?username=admin&role=admin",
            json=save_payload
        )
        assert save_response.status_code == 200
        
        # Retrieve and verify
        get_response = requests.get(f"{BASE_URL}/api/settings/watermark")
        assert get_response.status_code == 200
        
        data = get_response.json()
        assert data["enabled"] == True, "Enabled should persist"
        assert data["type"] == "text", "Type should persist"
        assert data["text"] == "PERSISTENCE_TEST", "Text should persist"
        assert data["opacity"] == 0.15, f"Opacity should persist as 0.15, got {data['opacity']}"
        print(f"PASS: Watermark settings persist correctly after save")


# Cleanup - restore default settings
@pytest.fixture(scope="module", autouse=True)
def cleanup_watermark_settings():
    """Restore watermark settings to NAVKAR AGRO enabled after tests"""
    yield
    # Restore to NAVKAR AGRO enabled state as mentioned in the context
    restore_payload = {
        "enabled": True,
        "type": "text",
        "text": "NAVKAR AGRO",
        "opacity": 0.06
    }
    requests.put(
        f"{BASE_URL}/api/settings/watermark?username=admin&role=admin",
        json=restore_payload
    )
    print("Cleanup: Restored watermark settings to NAVKAR AGRO enabled")
