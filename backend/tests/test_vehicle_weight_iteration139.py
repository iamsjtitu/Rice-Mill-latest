"""
Test Vehicle Weight New Features - Iteration 139
Tests for:
1. Photo View dialog - GET /api/vehicle-weight/{entry_id}/photos
2. Image serving endpoint - GET /api/vehicle-weight/image/{filename}
3. Auto-notify-setting with wa_group_id, wa_group_name, tg_chat_ids
4. POST /api/vehicle-weight with first_wt_front_img saved to disk
5. POST /api/vehicle-weight/auto-notify processes entry without crash
"""
import pytest
import requests
import os
import base64
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Small test image (1x1 red pixel JPEG)
TEST_IMAGE_B64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEAwEPwAB//9k="


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestAutoNotifySettingWithGroups:
    """Test auto-notify-setting endpoint with new wa_group_id, wa_group_name, tg_chat_ids fields"""
    
    def test_get_auto_notify_setting_returns_new_fields(self, api_client):
        """GET /api/vehicle-weight/auto-notify-setting returns wa_group_id, wa_group_name, tg_chat_ids"""
        response = api_client.get(f"{BASE_URL}/api/vehicle-weight/auto-notify-setting")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify new fields exist in response
        assert "enabled" in data, "Missing 'enabled' field"
        assert "wa_group_id" in data, "Missing 'wa_group_id' field"
        assert "wa_group_name" in data, "Missing 'wa_group_name' field"
        assert "tg_chat_ids" in data, "Missing 'tg_chat_ids' field"
        
        # Verify types
        assert isinstance(data["wa_group_id"], str), "wa_group_id should be string"
        assert isinstance(data["wa_group_name"], str), "wa_group_name should be string"
        assert isinstance(data["tg_chat_ids"], list), "tg_chat_ids should be list"
        print(f"GET auto-notify-setting: enabled={data['enabled']}, wa_group_id={data['wa_group_id']}, tg_chat_ids count={len(data['tg_chat_ids'])}")
    
    def test_put_auto_notify_setting_saves_wa_group_id(self, api_client):
        """PUT /api/vehicle-weight/auto-notify-setting saves wa_group_id, wa_group_name"""
        test_group_id = f"TEST_GROUP_{uuid.uuid4().hex[:8]}"
        test_group_name = "Test VW Group"
        
        response = api_client.put(f"{BASE_URL}/api/vehicle-weight/auto-notify-setting", json={
            "wa_group_id": test_group_id,
            "wa_group_name": test_group_name
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True, "Expected success=True"
        
        # Verify by GET
        get_response = api_client.get(f"{BASE_URL}/api/vehicle-weight/auto-notify-setting")
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["wa_group_id"] == test_group_id, f"wa_group_id not persisted: {get_data['wa_group_id']}"
        assert get_data["wa_group_name"] == test_group_name, f"wa_group_name not persisted: {get_data['wa_group_name']}"
        print(f"PUT auto-notify-setting: wa_group_id={test_group_id} saved and verified")
    
    def test_put_auto_notify_setting_saves_tg_chat_ids(self, api_client):
        """PUT /api/vehicle-weight/auto-notify-setting saves tg_chat_ids"""
        test_tg_chat_ids = [
            {"name": "Test Owner", "chat_id": "-1001234567890"},
            {"name": "Test Group", "chat_id": "-1009876543210"}
        ]
        
        response = api_client.put(f"{BASE_URL}/api/vehicle-weight/auto-notify-setting", json={
            "tg_chat_ids": test_tg_chat_ids
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True, "Expected success=True"
        
        # Verify by GET
        get_response = api_client.get(f"{BASE_URL}/api/vehicle-weight/auto-notify-setting")
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert len(get_data["tg_chat_ids"]) == 2, f"Expected 2 tg_chat_ids, got {len(get_data['tg_chat_ids'])}"
        print(f"PUT auto-notify-setting: tg_chat_ids saved with {len(get_data['tg_chat_ids'])} entries")


class TestImageServingEndpoint:
    """Test GET /api/vehicle-weight/image/{filename} endpoint"""
    
    def test_image_endpoint_returns_404_for_nonexistent(self, api_client):
        """GET /api/vehicle-weight/image/{filename} returns 404 for non-existent file"""
        response = api_client.get(f"{BASE_URL}/api/vehicle-weight/image/nonexistent_file_12345.jpg")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Image endpoint returns 404 for non-existent file")
    
    def test_create_entry_with_image_then_serve(self, api_client):
        """Create entry with image, then verify image can be served"""
        # Create entry with first_wt_front_img
        entry_data = {
            "vehicle_no": f"TEST_IMG_{uuid.uuid4().hex[:6]}",
            "party_name": "Test Party",
            "product": "PADDY",
            "trans_type": "Receive(Pur)",
            "first_wt": 5000,
            "first_wt_front_img": TEST_IMAGE_B64
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/vehicle-weight", json=entry_data)
        assert create_response.status_code == 200, f"Create failed: {create_response.status_code}"
        
        created = create_response.json()
        assert created.get("success") == True
        entry = created.get("entry", {})
        entry_id = entry.get("id")
        first_wt_front_img = entry.get("first_wt_front_img", "")
        
        assert first_wt_front_img, "first_wt_front_img filename should be set"
        print(f"Created entry {entry_id} with image filename: {first_wt_front_img}")
        
        # Now try to serve the image
        image_response = requests.get(f"{BASE_URL}/api/vehicle-weight/image/{first_wt_front_img}")
        assert image_response.status_code == 200, f"Image serve failed: {image_response.status_code}"
        assert "image/jpeg" in image_response.headers.get("content-type", ""), "Expected image/jpeg content type"
        print(f"Image served successfully: {len(image_response.content)} bytes")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")


class TestPhotosEndpoint:
    """Test GET /api/vehicle-weight/{entry_id}/photos endpoint"""
    
    def test_photos_endpoint_returns_404_for_nonexistent(self, api_client):
        """GET /api/vehicle-weight/{entry_id}/photos returns 404 for non-existent entry"""
        fake_id = str(uuid.uuid4())
        response = api_client.get(f"{BASE_URL}/api/vehicle-weight/{fake_id}/photos")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Photos endpoint returns 404 for non-existent entry")
    
    def test_photos_endpoint_returns_base64_images(self, api_client):
        """GET /api/vehicle-weight/{entry_id}/photos returns base64 images for entry"""
        # Create entry with images
        entry_data = {
            "vehicle_no": f"TEST_PHOTO_{uuid.uuid4().hex[:6]}",
            "party_name": "Test Photo Party",
            "product": "PADDY",
            "trans_type": "Receive(Pur)",
            "first_wt": 6000,
            "first_wt_front_img": TEST_IMAGE_B64,
            "first_wt_side_img": TEST_IMAGE_B64
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/vehicle-weight", json=entry_data)
        assert create_response.status_code == 200
        
        created = create_response.json()
        entry_id = created.get("entry", {}).get("id")
        
        # Get photos
        photos_response = api_client.get(f"{BASE_URL}/api/vehicle-weight/{entry_id}/photos")
        assert photos_response.status_code == 200, f"Photos endpoint failed: {photos_response.status_code}"
        
        photos_data = photos_response.json()
        
        # Verify structure
        assert "entry_id" in photos_data, "Missing entry_id"
        assert "rst_no" in photos_data, "Missing rst_no"
        assert "first_wt" in photos_data, "Missing first_wt"
        assert "second_wt" in photos_data, "Missing second_wt"
        assert "net_wt" in photos_data, "Missing net_wt"
        assert "vehicle_no" in photos_data, "Missing vehicle_no"
        assert "party_name" in photos_data, "Missing party_name"
        assert "product" in photos_data, "Missing product"
        assert "first_wt_front_img" in photos_data, "Missing first_wt_front_img"
        assert "first_wt_side_img" in photos_data, "Missing first_wt_side_img"
        assert "second_wt_front_img" in photos_data, "Missing second_wt_front_img"
        assert "second_wt_side_img" in photos_data, "Missing second_wt_side_img"
        
        # Verify base64 images are returned
        assert photos_data["first_wt_front_img"], "first_wt_front_img should have base64 data"
        assert photos_data["first_wt_side_img"], "first_wt_side_img should have base64 data"
        
        print(f"Photos endpoint returned data for entry {entry_id}")
        print(f"  - first_wt_front_img: {len(photos_data['first_wt_front_img'])} chars")
        print(f"  - first_wt_side_img: {len(photos_data['first_wt_side_img'])} chars")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")


class TestCreateEntryWithImage:
    """Test POST /api/vehicle-weight creates entry with first_wt_front_img saved to disk"""
    
    def test_create_entry_saves_image_to_disk(self, api_client):
        """POST /api/vehicle-weight creates entry with first_wt_front_img saved to disk"""
        entry_data = {
            "vehicle_no": f"TEST_DISK_{uuid.uuid4().hex[:6]}",
            "party_name": "Test Disk Party",
            "product": "PADDY",
            "trans_type": "Receive(Pur)",
            "first_wt": 7000,
            "first_wt_front_img": TEST_IMAGE_B64
        }
        
        response = api_client.post(f"{BASE_URL}/api/vehicle-weight", json=entry_data)
        assert response.status_code == 200, f"Create failed: {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True
        
        entry = data.get("entry", {})
        entry_id = entry.get("id")
        first_wt_front_img = entry.get("first_wt_front_img", "")
        
        # Verify filename format
        assert first_wt_front_img, "first_wt_front_img should be set"
        assert entry_id in first_wt_front_img, f"Filename should contain entry_id: {first_wt_front_img}"
        assert "1st_front" in first_wt_front_img, f"Filename should contain '1st_front': {first_wt_front_img}"
        assert first_wt_front_img.endswith(".jpg"), f"Filename should end with .jpg: {first_wt_front_img}"
        
        print(f"Entry created with image saved to disk: {first_wt_front_img}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")


class TestAutoNotifyEndpoint:
    """Test POST /api/vehicle-weight/auto-notify processes entry without crash"""
    
    def test_auto_notify_returns_404_for_nonexistent(self, api_client):
        """POST /api/vehicle-weight/auto-notify returns 404 for non-existent entry"""
        fake_id = str(uuid.uuid4())
        response = api_client.post(f"{BASE_URL}/api/vehicle-weight/auto-notify", json={
            "entry_id": fake_id
        })
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Auto-notify returns 404 for non-existent entry")
    
    def test_auto_notify_processes_without_crash(self, api_client):
        """POST /api/vehicle-weight/auto-notify processes entry without crash"""
        # Create a completed entry
        entry_data = {
            "vehicle_no": f"TEST_NOTIFY_{uuid.uuid4().hex[:6]}",
            "party_name": "Test Notify Party",
            "product": "PADDY",
            "trans_type": "Receive(Pur)",
            "first_wt": 8000,
            "first_wt_front_img": TEST_IMAGE_B64
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/vehicle-weight", json=entry_data)
        assert create_response.status_code == 200
        
        entry_id = create_response.json().get("entry", {}).get("id")
        
        # Complete with second weight
        second_wt_response = api_client.put(f"{BASE_URL}/api/vehicle-weight/{entry_id}/second-weight", json={
            "second_wt": 3000,
            "second_wt_front_img": TEST_IMAGE_B64
        })
        assert second_wt_response.status_code == 200
        
        # Now test auto-notify
        notify_response = api_client.post(f"{BASE_URL}/api/vehicle-weight/auto-notify", json={
            "entry_id": entry_id
        })
        
        # Should return 200 even if WA/TG not configured (just 0 sent)
        assert notify_response.status_code == 200, f"Auto-notify failed: {notify_response.status_code}"
        
        notify_data = notify_response.json()
        assert notify_data.get("success") == True, "Expected success=True"
        assert "message" in notify_data, "Expected message in response"
        
        print(f"Auto-notify processed successfully: {notify_data.get('message')}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")


class TestCompleteFlow:
    """Test complete flow: create with image -> second weight -> photos -> auto-notify"""
    
    def test_complete_flow_with_photos(self, api_client):
        """Complete flow: create entry with images, add second weight, view photos, auto-notify"""
        # Step 1: Create entry with first weight images
        entry_data = {
            "vehicle_no": f"TEST_FLOW_{uuid.uuid4().hex[:6]}",
            "party_name": "Test Flow Party",
            "farmer_name": "Test Farmer",
            "product": "GOVT PADDY",
            "trans_type": "Receive(Pur)",
            "tot_pkts": 50,
            "first_wt": 10000,
            "first_wt_front_img": TEST_IMAGE_B64,
            "first_wt_side_img": TEST_IMAGE_B64
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/vehicle-weight", json=entry_data)
        assert create_response.status_code == 200, f"Create failed: {create_response.status_code}"
        
        entry = create_response.json().get("entry", {})
        entry_id = entry.get("id")
        rst_no = entry.get("rst_no")
        
        print(f"Step 1: Created entry RST #{rst_no} with first weight images")
        
        # Step 2: Add second weight with images
        second_wt_response = api_client.put(f"{BASE_URL}/api/vehicle-weight/{entry_id}/second-weight", json={
            "second_wt": 4000,
            "cash_paid": 500,
            "diesel_paid": 200,
            "second_wt_front_img": TEST_IMAGE_B64,
            "second_wt_side_img": TEST_IMAGE_B64
        })
        assert second_wt_response.status_code == 200, f"Second weight failed: {second_wt_response.status_code}"
        
        updated_entry = second_wt_response.json().get("entry", {})
        net_wt = updated_entry.get("net_wt")
        
        print(f"Step 2: Added second weight, net_wt = {net_wt} KG")
        
        # Step 3: Get photos
        photos_response = api_client.get(f"{BASE_URL}/api/vehicle-weight/{entry_id}/photos")
        assert photos_response.status_code == 200, f"Photos failed: {photos_response.status_code}"
        
        photos_data = photos_response.json()
        assert photos_data["first_wt_front_img"], "Missing first_wt_front_img"
        assert photos_data["first_wt_side_img"], "Missing first_wt_side_img"
        assert photos_data["second_wt_front_img"], "Missing second_wt_front_img"
        assert photos_data["second_wt_side_img"], "Missing second_wt_side_img"
        
        print(f"Step 3: Photos endpoint returned all 4 images")
        
        # Step 4: Auto-notify
        notify_response = api_client.post(f"{BASE_URL}/api/vehicle-weight/auto-notify", json={
            "entry_id": entry_id
        })
        assert notify_response.status_code == 200, f"Auto-notify failed: {notify_response.status_code}"
        
        print(f"Step 4: Auto-notify processed: {notify_response.json().get('message')}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
        print(f"Cleanup: Deleted entry {entry_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
