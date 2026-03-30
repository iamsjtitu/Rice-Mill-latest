"""
Iteration 132: Test Auto Vehicle Weight Messaging feature
- GET /api/vehicle-weight/auto-notify-setting - returns enabled status
- PUT /api/vehicle-weight/auto-notify-setting - toggles the setting
- POST /api/vehicle-weight/auto-notify - accepts entry_id and returns success
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAutoVWMessagingAPIs:
    """Test the 3 new auto-notify endpoints for Vehicle Weight"""
    
    def test_get_auto_notify_setting(self):
        """GET /api/vehicle-weight/auto-notify-setting returns enabled status"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/auto-notify-setting")
        assert response.status_code == 200
        data = response.json()
        assert "enabled" in data
        assert isinstance(data["enabled"], bool)
        print(f"Auto-notify setting: enabled={data['enabled']}")
    
    def test_put_auto_notify_setting_on(self):
        """PUT /api/vehicle-weight/auto-notify-setting toggles to ON"""
        response = requests.put(
            f"{BASE_URL}/api/vehicle-weight/auto-notify-setting",
            json={"enabled": True}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["enabled"] == True
        print("Auto-notify setting toggled ON")
        
        # Verify it persisted
        get_response = requests.get(f"{BASE_URL}/api/vehicle-weight/auto-notify-setting")
        assert get_response.status_code == 200
        assert get_response.json()["enabled"] == True
    
    def test_put_auto_notify_setting_off(self):
        """PUT /api/vehicle-weight/auto-notify-setting toggles to OFF"""
        response = requests.put(
            f"{BASE_URL}/api/vehicle-weight/auto-notify-setting",
            json={"enabled": False}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["enabled"] == False
        print("Auto-notify setting toggled OFF")
        
        # Verify it persisted
        get_response = requests.get(f"{BASE_URL}/api/vehicle-weight/auto-notify-setting")
        assert get_response.status_code == 200
        assert get_response.json()["enabled"] == False
    
    def test_post_auto_notify_with_valid_entry(self):
        """POST /api/vehicle-weight/auto-notify with valid entry_id returns success"""
        # First create a test entry
        create_response = requests.post(
            f"{BASE_URL}/api/vehicle-weight",
            json={
                "kms_year": "2025-2026",
                "vehicle_no": "TEST_AUTO_NOTIFY_001",
                "party_name": "Test Party",
                "product": "GOVT PADDY",
                "trans_type": "Receive(Pur)",
                "first_wt": 15000,
                "rst_no": 9998
            }
        )
        assert create_response.status_code == 200
        entry_id = create_response.json()["entry"]["id"]
        print(f"Created test entry: {entry_id}")
        
        # Add second weight to complete the entry
        second_wt_response = requests.put(
            f"{BASE_URL}/api/vehicle-weight/{entry_id}/second-weight",
            json={"second_wt": 5000}
        )
        assert second_wt_response.status_code == 200
        print("Added second weight to entry")
        
        # Now test auto-notify endpoint
        notify_response = requests.post(
            f"{BASE_URL}/api/vehicle-weight/auto-notify",
            json={
                "entry_id": entry_id,
                "front_image": "",  # Empty - no camera in test env
                "side_image": ""    # Empty - no camera in test env
            }
        )
        assert notify_response.status_code == 200
        data = notify_response.json()
        assert data["success"] == True
        assert "message" in data
        assert "results" in data
        print(f"Auto-notify response: {data['message']}")
        
        # Cleanup - delete the test entry
        delete_response = requests.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
        assert delete_response.status_code == 200
        print("Cleaned up test entry")
    
    def test_post_auto_notify_with_invalid_entry(self):
        """POST /api/vehicle-weight/auto-notify with invalid entry_id returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/vehicle-weight/auto-notify",
            json={
                "entry_id": "non-existent-id-12345",
                "front_image": "",
                "side_image": ""
            }
        )
        assert response.status_code == 404
        print("Correctly returned 404 for invalid entry_id")


class TestExistingVehicleWeightAPIs:
    """Verify existing Vehicle Weight APIs still work"""
    
    def test_get_vehicle_weight_list(self):
        """GET /api/vehicle-weight returns entries list"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        assert "count" in data
        print(f"Vehicle weight entries: {data['count']}")
    
    def test_get_pending_vehicles(self):
        """GET /api/vehicle-weight/pending returns pending list"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/pending?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert "pending" in data
        assert "count" in data
        print(f"Pending vehicles: {data['count']}")
    
    def test_get_next_rst(self):
        """GET /api/vehicle-weight/next-rst returns next RST number"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/next-rst?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert "rst_no" in data
        assert isinstance(data["rst_no"], int)
        print(f"Next RST: {data['rst_no']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
