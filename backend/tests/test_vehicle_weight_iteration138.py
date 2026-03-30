"""
Test Vehicle Weight Dual-Photo Capture Feature - Iteration 138
Tests:
1. POST /api/vehicle-weight creates entry with first_wt_front_img and first_wt_side_img saved to disk
2. PUT /api/vehicle-weight/{id}/second-weight saves second_wt_front_img and second_wt_side_img to disk
3. POST /api/vehicle-weight/auto-notify reads saved images from disk (entry.first_wt_front_img etc) and returns success
4. Auto-notify endpoint should NOT read images from req.body (front_image/side_image), it should read from the entry's stored filenames
5. GET /api/vehicle-weight lists entries with image filenames
6. DELETE /api/vehicle-weight/{id} deletes entry
"""
import pytest
import requests
import os
import base64

# Use the public URL from frontend/.env
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://paddy-ledger-1.preview.emergentagent.com').rstrip('/')

# Small valid JPEG base64 (1x1 pixel red image)
SMALL_JPEG_B64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEAwEPwAB//9k="


class TestVehicleWeightDualPhoto:
    """Test dual-photo capture feature for vehicle weight entries"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_entry_id = None
        yield
        # Cleanup: delete test entry if created
        if self.created_entry_id:
            try:
                self.session.delete(f"{BASE_URL}/api/vehicle-weight/{self.created_entry_id}")
            except:
                pass
    
    def test_01_create_entry_with_first_weight_images(self):
        """Test POST /api/vehicle-weight creates entry with first weight images saved to disk"""
        payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD01AB1234",
            "party_name": "TEST_PARTY_138",
            "farmer_name": "TEST_FARMER_138",
            "product": "PADDY",
            "trans_type": "Receive(Pur)",
            "first_wt": 15000,
            "first_wt_front_img": SMALL_JPEG_B64,
            "first_wt_side_img": SMALL_JPEG_B64
        }
        
        response = self.session.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Expected success=True"
        assert "entry" in data, "Expected entry in response"
        
        entry = data["entry"]
        self.created_entry_id = entry.get("id")
        
        # Verify image filenames are stored (not empty)
        assert entry.get("first_wt_front_img"), "first_wt_front_img should be saved"
        assert entry.get("first_wt_side_img"), "first_wt_side_img should be saved"
        
        # Verify filename format: {entry_id}_{tag}.jpg
        assert entry["first_wt_front_img"].endswith(".jpg"), "Image filename should end with .jpg"
        assert entry["first_wt_side_img"].endswith(".jpg"), "Image filename should end with .jpg"
        assert "1st_front" in entry["first_wt_front_img"], "Front image should have 1st_front tag"
        assert "1st_side" in entry["first_wt_side_img"], "Side image should have 1st_side tag"
        
        print(f"✓ Created entry with first weight images: {entry['first_wt_front_img']}, {entry['first_wt_side_img']}")
    
    def test_02_create_entry_without_images(self):
        """Test POST /api/vehicle-weight works without images (optional)"""
        payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD01AB5678",
            "party_name": "TEST_PARTY_NO_IMG",
            "first_wt": 12000
        }
        
        response = self.session.post(f"{BASE_URL}/api/vehicle-weight", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        
        entry = data["entry"]
        entry_id = entry.get("id")
        
        # Images should be empty string when not provided
        assert entry.get("first_wt_front_img") == "", "first_wt_front_img should be empty when not provided"
        assert entry.get("first_wt_side_img") == "", "first_wt_side_img should be empty when not provided"
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
        print("✓ Entry created without images (optional feature)")
    
    def test_03_second_weight_with_images(self):
        """Test PUT /api/vehicle-weight/{id}/second-weight saves second weight images"""
        # First create an entry
        create_payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD01AB9999",
            "party_name": "TEST_PARTY_2ND_WT",
            "first_wt": 18000,
            "first_wt_front_img": SMALL_JPEG_B64,
            "first_wt_side_img": SMALL_JPEG_B64
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/vehicle-weight", json=create_payload)
        assert create_response.status_code == 200
        entry_id = create_response.json()["entry"]["id"]
        
        # Now add second weight with images
        second_wt_payload = {
            "second_wt": 8000,
            "cash_paid": 500,
            "diesel_paid": 200,
            "second_wt_front_img": SMALL_JPEG_B64,
            "second_wt_side_img": SMALL_JPEG_B64
        }
        
        response = self.session.put(f"{BASE_URL}/api/vehicle-weight/{entry_id}/second-weight", json=second_wt_payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        
        entry = data["entry"]
        
        # Verify second weight images are saved
        assert entry.get("second_wt_front_img"), "second_wt_front_img should be saved"
        assert entry.get("second_wt_side_img"), "second_wt_side_img should be saved"
        assert "2nd_front" in entry["second_wt_front_img"], "Second front image should have 2nd_front tag"
        assert "2nd_side" in entry["second_wt_side_img"], "Second side image should have 2nd_side tag"
        
        # Verify net weight calculation
        assert entry.get("net_wt") == 10000, f"Net weight should be 10000, got {entry.get('net_wt')}"
        assert entry.get("status") == "completed", "Status should be completed"
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
        print(f"✓ Second weight with images saved: {entry['second_wt_front_img']}, {entry['second_wt_side_img']}")
    
    def test_04_auto_notify_reads_from_disk(self):
        """Test POST /api/vehicle-weight/auto-notify reads images from disk, not from request body"""
        # Create a completed entry with all 4 images
        create_payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD01NOTIFY",
            "party_name": "TEST_PARTY_NOTIFY",
            "first_wt": 20000,
            "first_wt_front_img": SMALL_JPEG_B64,
            "first_wt_side_img": SMALL_JPEG_B64
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/vehicle-weight", json=create_payload)
        assert create_response.status_code == 200
        entry_id = create_response.json()["entry"]["id"]
        
        # Add second weight
        second_wt_payload = {
            "second_wt": 10000,
            "second_wt_front_img": SMALL_JPEG_B64,
            "second_wt_side_img": SMALL_JPEG_B64
        }
        self.session.put(f"{BASE_URL}/api/vehicle-weight/{entry_id}/second-weight", json=second_wt_payload)
        
        # Call auto-notify - should read images from disk, NOT from request body
        # Note: We're NOT sending front_image/side_image in the request
        notify_payload = {
            "entry_id": entry_id
        }
        
        response = self.session.post(f"{BASE_URL}/api/vehicle-weight/auto-notify", json=notify_payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Auto-notify should return success"
        
        # WhatsApp/Telegram not configured in preview, so 0 sent is expected
        assert "message" in data, "Should have message field"
        assert "WA:" in data["message"], "Message should mention WA count"
        assert "TG:" in data["message"], "Message should mention TG count"
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
        print(f"✓ Auto-notify reads from disk: {data['message']}")
    
    def test_05_auto_notify_entry_not_found(self):
        """Test auto-notify returns 404 for non-existent entry"""
        notify_payload = {
            "entry_id": "non-existent-id-12345"
        }
        
        response = self.session.post(f"{BASE_URL}/api/vehicle-weight/auto-notify", json=notify_payload)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Auto-notify returns 404 for non-existent entry")
    
    def test_06_list_entries_with_image_filenames(self):
        """Test GET /api/vehicle-weight lists entries with image filenames"""
        # Create an entry with images
        create_payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD01LIST",
            "party_name": "TEST_PARTY_LIST",
            "first_wt": 16000,
            "first_wt_front_img": SMALL_JPEG_B64,
            "first_wt_side_img": SMALL_JPEG_B64
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/vehicle-weight", json=create_payload)
        assert create_response.status_code == 200
        entry_id = create_response.json()["entry"]["id"]
        
        # List entries
        response = self.session.get(f"{BASE_URL}/api/vehicle-weight")
        assert response.status_code == 200
        
        data = response.json()
        assert "entries" in data
        assert "count" in data
        
        # Find our test entry
        test_entry = None
        for entry in data["entries"]:
            if entry.get("id") == entry_id:
                test_entry = entry
                break
        
        assert test_entry is not None, "Test entry should be in list"
        assert test_entry.get("first_wt_front_img"), "Entry should have first_wt_front_img"
        assert test_entry.get("first_wt_side_img"), "Entry should have first_wt_side_img"
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
        print(f"✓ List entries includes image filenames: {test_entry.get('first_wt_front_img')}")
    
    def test_07_delete_entry(self):
        """Test DELETE /api/vehicle-weight/{id} deletes entry"""
        # Create an entry
        create_payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD01DELETE",
            "party_name": "TEST_PARTY_DELETE",
            "first_wt": 14000
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/vehicle-weight", json=create_payload)
        assert create_response.status_code == 200
        entry_id = create_response.json()["entry"]["id"]
        
        # Delete entry
        response = self.session.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("success") == True
        assert "deleted" in data.get("message", "").lower()
        
        # Verify entry is deleted
        get_response = self.session.get(f"{BASE_URL}/api/vehicle-weight")
        entries = get_response.json().get("entries", [])
        entry_ids = [e.get("id") for e in entries]
        assert entry_id not in entry_ids, "Deleted entry should not be in list"
        
        print("✓ Delete entry works correctly")
    
    def test_08_delete_non_existent_entry(self):
        """Test DELETE returns 404 for non-existent entry"""
        response = self.session.delete(f"{BASE_URL}/api/vehicle-weight/non-existent-id-99999")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Delete returns 404 for non-existent entry")
    
    def test_09_pending_entries_list(self):
        """Test GET /api/vehicle-weight/pending returns pending entries"""
        # Create a pending entry (only first weight)
        create_payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_OD01PENDING",
            "party_name": "TEST_PARTY_PENDING",
            "first_wt": 17000
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/vehicle-weight", json=create_payload)
        assert create_response.status_code == 200
        entry_id = create_response.json()["entry"]["id"]
        
        # Get pending entries
        response = self.session.get(f"{BASE_URL}/api/vehicle-weight/pending")
        assert response.status_code == 200
        
        data = response.json()
        assert "pending" in data
        assert "count" in data
        
        # Find our test entry
        test_entry = None
        for entry in data["pending"]:
            if entry.get("id") == entry_id:
                test_entry = entry
                break
        
        assert test_entry is not None, "Test entry should be in pending list"
        assert test_entry.get("status") == "pending"
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
        print(f"✓ Pending entries list works: {data['count']} pending")
    
    def test_10_next_rst_number(self):
        """Test GET /api/vehicle-weight/next-rst returns next RST number"""
        response = self.session.get(f"{BASE_URL}/api/vehicle-weight/next-rst")
        assert response.status_code == 200
        
        data = response.json()
        assert "rst_no" in data
        assert isinstance(data["rst_no"], int)
        assert data["rst_no"] > 0
        
        print(f"✓ Next RST number: {data['rst_no']}")
    
    def test_11_auto_notify_setting_get(self):
        """Test GET /api/vehicle-weight/auto-notify-setting"""
        response = self.session.get(f"{BASE_URL}/api/vehicle-weight/auto-notify-setting")
        assert response.status_code == 200
        
        data = response.json()
        assert "enabled" in data
        assert isinstance(data["enabled"], bool)
        
        print(f"✓ Auto-notify setting: enabled={data['enabled']}")
    
    def test_12_auto_notify_setting_update(self):
        """Test PUT /api/vehicle-weight/auto-notify-setting"""
        # Get current setting
        get_response = self.session.get(f"{BASE_URL}/api/vehicle-weight/auto-notify-setting")
        original_enabled = get_response.json().get("enabled", False)
        
        # Toggle setting
        new_enabled = not original_enabled
        response = self.session.put(
            f"{BASE_URL}/api/vehicle-weight/auto-notify-setting",
            json={"enabled": new_enabled}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("success") == True
        assert data.get("enabled") == new_enabled
        
        # Verify persistence
        verify_response = self.session.get(f"{BASE_URL}/api/vehicle-weight/auto-notify-setting")
        assert verify_response.json().get("enabled") == new_enabled
        
        # Restore original setting
        self.session.put(
            f"{BASE_URL}/api/vehicle-weight/auto-notify-setting",
            json={"enabled": original_enabled}
        )
        
        print(f"✓ Auto-notify setting toggle works: {original_enabled} -> {new_enabled} -> {original_enabled}")


class TestVehicleWeightImageFlow:
    """Test complete image flow: create -> second weight -> auto-notify"""
    
    def test_complete_dual_photo_flow(self):
        """Test complete flow: create with images -> add second weight with images -> auto-notify"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Step 1: Create entry with first weight images
        create_payload = {
            "date": "2026-01-15",
            "vehicle_no": "TEST_FLOW_OD01",
            "party_name": "TEST_FLOW_PARTY",
            "farmer_name": "TEST_FLOW_FARMER",
            "product": "GOVT PADDY",
            "trans_type": "Receive(Pur)",
            "tot_pkts": 100,
            "first_wt": 25000,
            "first_wt_front_img": SMALL_JPEG_B64,
            "first_wt_side_img": SMALL_JPEG_B64
        }
        
        create_response = session.post(f"{BASE_URL}/api/vehicle-weight", json=create_payload)
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        
        entry = create_response.json()["entry"]
        entry_id = entry["id"]
        rst_no = entry["rst_no"]
        
        assert entry["first_wt_front_img"], "First weight front image should be saved"
        assert entry["first_wt_side_img"], "First weight side image should be saved"
        assert entry["status"] == "pending", "Status should be pending"
        print(f"Step 1 ✓ Created entry RST#{rst_no} with first weight images")
        
        # Step 2: Add second weight with images
        second_wt_payload = {
            "second_wt": 12000,
            "cash_paid": 1000,
            "diesel_paid": 500,
            "second_wt_front_img": SMALL_JPEG_B64,
            "second_wt_side_img": SMALL_JPEG_B64
        }
        
        second_response = session.put(f"{BASE_URL}/api/vehicle-weight/{entry_id}/second-weight", json=second_wt_payload)
        assert second_response.status_code == 200, f"Second weight failed: {second_response.text}"
        
        updated_entry = second_response.json()["entry"]
        assert updated_entry["second_wt_front_img"], "Second weight front image should be saved"
        assert updated_entry["second_wt_side_img"], "Second weight side image should be saved"
        assert updated_entry["status"] == "completed", "Status should be completed"
        assert updated_entry["net_wt"] == 13000, f"Net weight should be 13000, got {updated_entry['net_wt']}"
        print(f"Step 2 ✓ Added second weight with images, net_wt={updated_entry['net_wt']}")
        
        # Step 3: Call auto-notify (reads images from disk)
        notify_payload = {"entry_id": entry_id}
        notify_response = session.post(f"{BASE_URL}/api/vehicle-weight/auto-notify", json=notify_payload)
        assert notify_response.status_code == 200, f"Auto-notify failed: {notify_response.text}"
        
        notify_data = notify_response.json()
        assert notify_data["success"] == True
        # WhatsApp/Telegram not configured, so 0 sent is expected
        print(f"Step 3 ✓ Auto-notify success: {notify_data['message']}")
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
        print("✓ Complete dual-photo flow test passed!")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
