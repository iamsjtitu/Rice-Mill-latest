"""
Test Branding Placement Feature
- Tests PUT /api/branding with placement='above' and empty label
- Tests that fields with only value (no label) are saved correctly
- Tests GET /api/branding returns saved fields with placement property
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBrandingPlacement:
    """Test branding custom fields with placement feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - store original branding to restore later"""
        self.original_branding = requests.get(f"{BASE_URL}/api/branding").json()
        yield
        # Restore original branding after tests
        requests.put(
            f"{BASE_URL}/api/branding?username=admin&role=admin",
            json=self.original_branding
        )
    
    def test_save_custom_field_with_placement_above(self):
        """Test saving custom field with placement='above'"""
        payload = {
            "company_name": "TEST COMPANY",
            "tagline": "Test Tagline",
            "custom_fields": [
                {"label": "GSTIN", "value": "22AAAAA0000A1Z5", "position": "left", "placement": "above"},
                {"label": "Phone", "value": "9876543210", "position": "right", "placement": "below"}
            ]
        }
        
        response = requests.put(
            f"{BASE_URL}/api/branding?username=admin&role=admin",
            json=payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True
        
        # Verify the saved branding
        branding = data.get("branding", {})
        custom_fields = branding.get("custom_fields", [])
        
        assert len(custom_fields) == 2, f"Expected 2 custom fields, got {len(custom_fields)}"
        
        # Check first field has placement='above'
        field1 = custom_fields[0]
        assert field1["label"] == "GSTIN"
        assert field1["value"] == "22AAAAA0000A1Z5"
        assert field1["placement"] == "above", f"Expected placement='above', got '{field1.get('placement')}'"
        
        # Check second field has placement='below'
        field2 = custom_fields[1]
        assert field2["label"] == "Phone"
        assert field2["placement"] == "below", f"Expected placement='below', got '{field2.get('placement')}'"
        
        print("PASS: Custom field with placement='above' saved correctly")
    
    def test_save_field_with_only_value_no_label(self):
        """Test saving field with only value (empty label) - label is optional now"""
        payload = {
            "company_name": "TEST COMPANY",
            "tagline": "Test Tagline",
            "custom_fields": [
                {"label": "", "value": "Value Without Label", "position": "center", "placement": "above"},
                {"label": "With Label", "value": "Value With Label", "position": "left", "placement": "below"}
            ]
        }
        
        response = requests.put(
            f"{BASE_URL}/api/branding?username=admin&role=admin",
            json=payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True
        
        branding = data.get("branding", {})
        custom_fields = branding.get("custom_fields", [])
        
        # Both fields should be saved (value-only field should NOT be filtered out)
        assert len(custom_fields) == 2, f"Expected 2 fields (value-only should be saved), got {len(custom_fields)}"
        
        # Find the value-only field
        value_only_field = next((f for f in custom_fields if f["value"] == "Value Without Label"), None)
        assert value_only_field is not None, "Value-only field should be saved"
        assert value_only_field["label"] == "", "Label should be empty string"
        assert value_only_field["placement"] == "above"
        
        print("PASS: Field with only value (no label) saved correctly")
    
    def test_get_branding_returns_placement_property(self):
        """Test GET /api/branding returns fields with placement property"""
        # First save some fields with placement
        payload = {
            "company_name": "TEST COMPANY",
            "tagline": "Test Tagline",
            "custom_fields": [
                {"label": "Above Field", "value": "Above Value", "position": "center", "placement": "above"},
                {"label": "Below Field", "value": "Below Value", "position": "center", "placement": "below"}
            ]
        }
        
        save_response = requests.put(
            f"{BASE_URL}/api/branding?username=admin&role=admin",
            json=payload
        )
        assert save_response.status_code == 200
        
        # Now GET and verify placement is returned
        get_response = requests.get(f"{BASE_URL}/api/branding")
        assert get_response.status_code == 200
        
        data = get_response.json()
        custom_fields = data.get("custom_fields", [])
        
        assert len(custom_fields) == 2, f"Expected 2 fields, got {len(custom_fields)}"
        
        # Verify each field has placement property
        for field in custom_fields:
            assert "placement" in field, f"Field missing 'placement' property: {field}"
            assert field["placement"] in ("above", "below"), f"Invalid placement value: {field['placement']}"
        
        # Verify specific placements
        above_field = next((f for f in custom_fields if f["label"] == "Above Field"), None)
        below_field = next((f for f in custom_fields if f["label"] == "Below Field"), None)
        
        assert above_field is not None and above_field["placement"] == "above"
        assert below_field is not None and below_field["placement"] == "below"
        
        print("PASS: GET /api/branding returns placement property correctly")
    
    def test_default_placement_is_below(self):
        """Test that fields without explicit placement default to 'below'"""
        payload = {
            "company_name": "TEST COMPANY",
            "tagline": "Test Tagline",
            "custom_fields": [
                {"label": "No Placement", "value": "Test Value", "position": "center"}  # No placement specified
            ]
        }
        
        response = requests.put(
            f"{BASE_URL}/api/branding?username=admin&role=admin",
            json=payload
        )
        
        assert response.status_code == 200
        data = response.json()
        
        custom_fields = data.get("branding", {}).get("custom_fields", [])
        assert len(custom_fields) == 1
        
        # Should default to 'below'
        assert custom_fields[0]["placement"] == "below", f"Expected default placement='below', got '{custom_fields[0].get('placement')}'"
        
        print("PASS: Default placement is 'below'")
    
    def test_invalid_placement_defaults_to_below(self):
        """Test that invalid placement values default to 'below'"""
        payload = {
            "company_name": "TEST COMPANY",
            "tagline": "Test Tagline",
            "custom_fields": [
                {"label": "Invalid Placement", "value": "Test Value", "position": "center", "placement": "invalid_value"}
            ]
        }
        
        response = requests.put(
            f"{BASE_URL}/api/branding?username=admin&role=admin",
            json=payload
        )
        
        assert response.status_code == 200
        data = response.json()
        
        custom_fields = data.get("branding", {}).get("custom_fields", [])
        assert len(custom_fields) == 1
        
        # Invalid placement should default to 'below'
        assert custom_fields[0]["placement"] == "below", f"Expected placement='below' for invalid value, got '{custom_fields[0].get('placement')}'"
        
        print("PASS: Invalid placement defaults to 'below'")
    
    def test_empty_value_field_not_saved(self):
        """Test that fields with empty value are NOT saved (value is required)"""
        payload = {
            "company_name": "TEST COMPANY",
            "tagline": "Test Tagline",
            "custom_fields": [
                {"label": "Has Label", "value": "", "position": "center", "placement": "above"},  # Empty value
                {"label": "Valid", "value": "Valid Value", "position": "center", "placement": "below"}
            ]
        }
        
        response = requests.put(
            f"{BASE_URL}/api/branding?username=admin&role=admin",
            json=payload
        )
        
        assert response.status_code == 200
        data = response.json()
        
        custom_fields = data.get("branding", {}).get("custom_fields", [])
        
        # Only the field with value should be saved
        assert len(custom_fields) == 1, f"Expected 1 field (empty value should be filtered), got {len(custom_fields)}"
        assert custom_fields[0]["value"] == "Valid Value"
        
        print("PASS: Empty value field not saved (value is required)")
    
    def test_non_admin_cannot_update_branding(self):
        """Test that non-admin users cannot update branding"""
        payload = {
            "company_name": "HACKER COMPANY",
            "tagline": "Hacked",
            "custom_fields": []
        }
        
        response = requests.put(
            f"{BASE_URL}/api/branding?username=staff&role=staff",
            json=payload
        )
        
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}"
        
        print("PASS: Non-admin cannot update branding")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
