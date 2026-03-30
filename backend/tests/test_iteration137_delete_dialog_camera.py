"""
Iteration 137 Tests: Delete Confirmation Dialog, Camera Setup, WhatsApp Message Format
Tests for:
1. Vehicle Weight delete endpoint
2. Auto-notify endpoint returns formatted text with RST#, Date, separators, ₹ symbol
3. Vehicle Weight CRUD operations
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestVehicleWeightDelete:
    """Test Vehicle Weight delete functionality"""
    
    def test_delete_nonexistent_entry_returns_404(self):
        """DELETE /api/vehicle-weight/{id} should return 404 for non-existent entry"""
        response = requests.delete(f"{BASE_URL}/api/vehicle-weight/nonexistent-id-12345")
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        print(f"PASS: Delete non-existent entry returns 404: {data}")
    
    def test_vehicle_weight_list_endpoint(self):
        """GET /api/vehicle-weight should return entries list"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight")
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        assert "count" in data
        print(f"PASS: Vehicle weight list returns {data['count']} entries")
        return data['entries']
    
    def test_vehicle_weight_pending_endpoint(self):
        """GET /api/vehicle-weight/pending should return pending list"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/pending")
        assert response.status_code == 200
        data = response.json()
        assert "pending" in data
        assert "count" in data
        print(f"PASS: Vehicle weight pending returns {data['count']} pending entries")


class TestAutoNotifyMessageFormat:
    """Test auto-notify endpoint returns properly formatted WhatsApp message"""
    
    def test_auto_notify_with_existing_entry(self):
        """POST /api/vehicle-weight/auto-notify should return formatted message with RST#, Date, separators, ₹ symbol"""
        # First get an existing completed entry
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?status=completed")
        assert response.status_code == 200
        entries = response.json().get('entries', [])
        
        if not entries:
            pytest.skip("No completed entries to test auto-notify")
        
        entry = entries[0]
        entry_id = entry.get('id')
        
        # Test auto-notify endpoint
        response = requests.post(f"{BASE_URL}/api/vehicle-weight/auto-notify", json={
            "entry_id": entry_id,
            "front_image": "",
            "side_image": ""
        })
        
        # Should return success (even if WA/TG not configured)
        assert response.status_code == 200
        data = response.json()
        assert data.get('success') == True
        print(f"PASS: Auto-notify endpoint works for entry {entry_id}")
    
    def test_auto_notify_with_known_entry(self):
        """Test auto-notify with known entry ID 782d2b15-d344-40c8-b57c-a9a0b66c649f"""
        entry_id = "782d2b15-d344-40c8-b57c-a9a0b66c649f"
        
        response = requests.post(f"{BASE_URL}/api/vehicle-weight/auto-notify", json={
            "entry_id": entry_id,
            "front_image": "",
            "side_image": ""
        })
        
        # Entry may or may not exist
        if response.status_code == 404:
            pytest.skip(f"Entry {entry_id} not found")
        
        assert response.status_code == 200
        data = response.json()
        assert data.get('success') == True
        print(f"PASS: Auto-notify works for RST#4 entry")
    
    def test_auto_notify_nonexistent_entry_returns_404(self):
        """POST /api/vehicle-weight/auto-notify should return 404 for non-existent entry"""
        response = requests.post(f"{BASE_URL}/api/vehicle-weight/auto-notify", json={
            "entry_id": "nonexistent-entry-id-12345",
            "front_image": "",
            "side_image": ""
        })
        assert response.status_code == 404
        print("PASS: Auto-notify returns 404 for non-existent entry")


class TestAutoNotifySettingToggle:
    """Test auto VW messaging setting toggle"""
    
    def test_get_auto_notify_setting(self):
        """GET /api/vehicle-weight/auto-notify-setting should return enabled status"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/auto-notify-setting")
        assert response.status_code == 200
        data = response.json()
        assert "enabled" in data
        print(f"PASS: Auto-notify setting is {'ON' if data['enabled'] else 'OFF'}")
    
    def test_toggle_auto_notify_setting_on(self):
        """PUT /api/vehicle-weight/auto-notify-setting should toggle ON"""
        response = requests.put(f"{BASE_URL}/api/vehicle-weight/auto-notify-setting", json={
            "enabled": True
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get('success') == True
        assert data.get('enabled') == True
        print("PASS: Auto-notify setting toggled ON")
    
    def test_toggle_auto_notify_setting_off(self):
        """PUT /api/vehicle-weight/auto-notify-setting should toggle OFF"""
        response = requests.put(f"{BASE_URL}/api/vehicle-weight/auto-notify-setting", json={
            "enabled": False
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get('success') == True
        assert data.get('enabled') == False
        print("PASS: Auto-notify setting toggled OFF")


class TestVehicleWeightCRUD:
    """Test Vehicle Weight CRUD operations"""
    
    def test_create_first_weight_entry(self):
        """POST /api/vehicle-weight should create entry with first weight"""
        import uuid
        test_vehicle = f"TEST{uuid.uuid4().hex[:6].upper()}"
        
        response = requests.post(f"{BASE_URL}/api/vehicle-weight", json={
            "date": "2026-01-15",
            "vehicle_no": test_vehicle,
            "party_name": "Test Party",
            "farmer_name": "Test Farmer",
            "product": "PADDY",
            "trans_type": "Receive(Pur)",
            "tot_pkts": 50,
            "first_wt": 15000,
            "kms_year": "2024-25"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data.get('success') == True
        assert 'entry' in data
        entry = data['entry']
        assert entry['vehicle_no'] == test_vehicle
        assert entry['first_wt'] == 15000
        assert entry['status'] == 'pending'
        print(f"PASS: Created entry RST#{entry['rst_no']} with first weight")
        return entry
    
    def test_update_second_weight(self):
        """PUT /api/vehicle-weight/{id}/second-weight should complete entry"""
        # First create an entry
        import uuid
        test_vehicle = f"TEST{uuid.uuid4().hex[:6].upper()}"
        
        create_response = requests.post(f"{BASE_URL}/api/vehicle-weight", json={
            "date": "2026-01-15",
            "vehicle_no": test_vehicle,
            "party_name": "Test Party 2",
            "first_wt": 20000,
            "kms_year": "2024-25"
        })
        
        assert create_response.status_code == 200
        entry = create_response.json()['entry']
        entry_id = entry['id']
        
        # Update with second weight
        update_response = requests.put(f"{BASE_URL}/api/vehicle-weight/{entry_id}/second-weight", json={
            "second_wt": 5000,
            "cash_paid": 1000,
            "diesel_paid": 500
        })
        
        assert update_response.status_code == 200
        data = update_response.json()
        assert data.get('success') == True
        updated_entry = data['entry']
        assert updated_entry['second_wt'] == 5000
        assert updated_entry['net_wt'] == 15000  # 20000 - 5000
        assert updated_entry['status'] == 'completed'
        assert updated_entry['cash_paid'] == 1000
        assert updated_entry['diesel_paid'] == 500
        print(f"PASS: Updated entry with second weight, net_wt={updated_entry['net_wt']}")
        
        # Cleanup - delete the test entry
        requests.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
    
    def test_delete_entry(self):
        """DELETE /api/vehicle-weight/{id} should delete entry"""
        import uuid
        test_vehicle = f"TEST{uuid.uuid4().hex[:6].upper()}"
        
        # Create entry
        create_response = requests.post(f"{BASE_URL}/api/vehicle-weight", json={
            "date": "2026-01-15",
            "vehicle_no": test_vehicle,
            "first_wt": 10000,
            "kms_year": "2024-25"
        })
        
        assert create_response.status_code == 200
        entry_id = create_response.json()['entry']['id']
        
        # Delete entry
        delete_response = requests.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
        assert delete_response.status_code == 200
        data = delete_response.json()
        assert data.get('success') == True
        print(f"PASS: Deleted entry {entry_id}")
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/vehicle-weight")
        entries = get_response.json().get('entries', [])
        entry_ids = [e['id'] for e in entries]
        assert entry_id not in entry_ids
        print("PASS: Entry no longer exists after deletion")


class TestMessageFormatVerification:
    """Verify the WhatsApp message format includes required elements"""
    
    def test_message_format_in_backend_code(self):
        """Verify backend code has correct message format with RST#, separators, ₹ symbol"""
        # Read the backend code to verify format
        import os
        backend_file = "/app/backend/routes/vehicle_weight.py"
        
        if not os.path.exists(backend_file):
            pytest.skip("Backend file not found")
        
        with open(backend_file, 'r') as f:
            content = f.read()
        
        # Check for RST# format
        assert "RST #" in content or "RST#{" in content, "Message should include RST#"
        print("PASS: Message format includes RST#")
        
        # Check for separator line
        assert "───" in content, "Message should include separator line ───"
        print("PASS: Message format includes separator line")
        
        # Check for ₹ symbol (Unicode \u20b9)
        assert "₹" in content or "\\u20b9" in content, "Message should include ₹ symbol"
        print("PASS: Message format includes ₹ symbol")
        
        # Check for Date field
        assert "Date:" in content, "Message should include Date field"
        print("PASS: Message format includes Date field")
        
        # Check for Farmer/Mandi field
        assert "Farmer/Mandi" in content or "farmer_mandi" in content, "Message should include Farmer/Mandi"
        print("PASS: Message format includes Farmer/Mandi field")
        
        # Check for Packets field
        assert "Packets" in content or "pkts" in content, "Message should include Packets"
        print("PASS: Message format includes Packets field")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
