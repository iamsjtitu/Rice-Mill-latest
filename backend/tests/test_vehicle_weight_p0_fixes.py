"""
Test Vehicle Weight P0 Fixes - Iteration 197
Tests:
1. GET /api/vehicle-weight/{entry_id}/photos - should return gross_wt, tare_wt, remark, net_wt, tot_pkts fields
2. GET /api/settings/weighbridge-host - should return {url: ''} or configured URL
3. PUT /api/settings/weighbridge-host - save desktop app URL
4. GET /api/weighbridge/live-weight - should return weight data (or error if weighbridge_host not configured)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestVehicleWeightPhotosEndpoint:
    """Test /api/vehicle-weight/{entry_id}/photos endpoint returns all required fields"""
    
    def test_photos_endpoint_returns_gross_wt_tare_wt_remark(self):
        """Test that photos endpoint returns gross_wt, tare_wt, remark fields (P0 fix)"""
        # Use the known entry_id with remark from agent context
        entry_id = "501db432-048a-456f-91a1-bee12e258a94"
        
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/{entry_id}/photos")
        
        # Should return 200 or 404 if entry doesn't exist
        if response.status_code == 404:
            pytest.skip(f"Entry {entry_id} not found - may have been deleted")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify all required fields are present in response (P0 fix verification)
        required_fields = [
            'entry_id', 'rst_no', 'date', 'vehicle_no', 'party_name', 'farmer_name',
            'product', 'trans_type', 'tot_pkts', 'first_wt', 'first_wt_time',
            'second_wt', 'second_wt_time', 'net_wt', 'gross_wt', 'tare_wt', 'remark',
            'cash_paid', 'diesel_paid', 'g_issued', 'tp_no', 'tp_weight'
        ]
        
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        print(f"✓ All required fields present in photos endpoint response")
        print(f"  - gross_wt: {data.get('gross_wt')}")
        print(f"  - tare_wt: {data.get('tare_wt')}")
        print(f"  - remark: {data.get('remark')}")
        print(f"  - net_wt: {data.get('net_wt')}")
        print(f"  - tot_pkts: {data.get('tot_pkts')}")
    
    def test_photos_endpoint_with_any_completed_entry(self):
        """Test photos endpoint with any completed entry from the system"""
        # First get list of vehicle weights
        response = requests.get(f"{BASE_URL}/api/vehicle-weight", params={"status": "completed"})
        
        if response.status_code != 200:
            pytest.skip("Could not fetch vehicle weights list")
        
        data = response.json()
        entries = data.get('entries', [])
        
        if not entries:
            pytest.skip("No completed entries found")
        
        # Test with first completed entry
        entry = entries[0]
        entry_id = entry.get('id')
        
        photos_response = requests.get(f"{BASE_URL}/api/vehicle-weight/{entry_id}/photos")
        assert photos_response.status_code == 200, f"Photos endpoint failed: {photos_response.text}"
        
        photos_data = photos_response.json()
        
        # Verify P0 fix fields are present
        assert 'gross_wt' in photos_data, "Missing gross_wt field"
        assert 'tare_wt' in photos_data, "Missing tare_wt field"
        assert 'remark' in photos_data, "Missing remark field"
        assert 'net_wt' in photos_data, "Missing net_wt field"
        assert 'tot_pkts' in photos_data, "Missing tot_pkts field"
        
        print(f"✓ Photos endpoint for entry {entry_id} returns all P0 fix fields")
    
    def test_photos_endpoint_404_for_invalid_entry(self):
        """Test that photos endpoint returns 404 for non-existent entry"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/invalid-entry-id-12345/photos")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestWeighbridgeHostSettings:
    """Test weighbridge-host settings endpoints"""
    
    def test_get_weighbridge_host_returns_url(self):
        """Test GET /api/settings/weighbridge-host returns url field"""
        response = requests.get(f"{BASE_URL}/api/settings/weighbridge-host")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'url' in data, "Response should contain 'url' field"
        
        print(f"✓ GET weighbridge-host returns: {data}")
    
    def test_put_weighbridge_host_saves_url(self):
        """Test PUT /api/settings/weighbridge-host saves the URL"""
        test_url = "http://192.168.1.100:5000"
        
        response = requests.put(
            f"{BASE_URL}/api/settings/weighbridge-host",
            json={"url": test_url}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get('success') == True, "Response should indicate success"
        assert data.get('url') == test_url, f"URL should be saved as {test_url}"
        
        # Verify by GET
        get_response = requests.get(f"{BASE_URL}/api/settings/weighbridge-host")
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data.get('url') == test_url, "GET should return saved URL"
        
        print(f"✓ PUT weighbridge-host saved and verified: {test_url}")
    
    def test_put_weighbridge_host_empty_url(self):
        """Test PUT /api/settings/weighbridge-host with empty URL"""
        response = requests.put(
            f"{BASE_URL}/api/settings/weighbridge-host",
            json={"url": ""}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get('success') == True
        assert data.get('url') == ""
        
        print(f"✓ PUT weighbridge-host with empty URL works")


class TestWeighbridgeLiveWeight:
    """Test /api/weighbridge/live-weight endpoint"""
    
    def test_live_weight_endpoint_exists(self):
        """Test GET /api/weighbridge/live-weight endpoint exists and returns valid response"""
        response = requests.get(f"{BASE_URL}/api/weighbridge/live-weight")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Web version should return disconnected status (no serial port)
        # Expected fields: connected, weight, stable, timestamp
        assert 'connected' in data, "Response should contain 'connected' field"
        
        print(f"✓ Live weight endpoint response: {data}")
    
    def test_live_weight_returns_expected_structure(self):
        """Test that live-weight returns expected structure for web version"""
        response = requests.get(f"{BASE_URL}/api/weighbridge/live-weight")
        
        assert response.status_code == 200
        data = response.json()
        
        # Web version returns: {"connected": False, "weight": 0, "stable": False, "timestamp": 0}
        expected_fields = ['connected', 'weight', 'stable', 'timestamp']
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        
        # Web version should show disconnected
        assert data['connected'] == False, "Web version should show disconnected"
        
        print(f"✓ Live weight structure verified: {data}")


class TestVehicleWeightList:
    """Test vehicle weight list endpoint"""
    
    def test_get_vehicle_weights_list(self):
        """Test GET /api/vehicle-weight returns list of entries"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert 'entries' in data, "Response should contain 'entries' field"
        
        print(f"✓ Vehicle weight list returned {len(data.get('entries', []))} entries")
    
    def test_get_completed_vehicle_weights(self):
        """Test GET /api/vehicle-weight with status=completed filter"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight", params={"status": "completed"})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        entries = data.get('entries', [])
        
        # All entries should have status=completed
        for entry in entries:
            assert entry.get('status') == 'completed', f"Entry {entry.get('id')} has status {entry.get('status')}"
        
        print(f"✓ Completed entries filter works: {len(entries)} entries")
    
    def test_vehicle_weight_entry_has_required_fields(self):
        """Test that vehicle weight entries have required fields for View Dialog"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight", params={"status": "completed"})
        
        if response.status_code != 200:
            pytest.skip("Could not fetch vehicle weights")
        
        data = response.json()
        entries = data.get('entries', [])
        
        if not entries:
            pytest.skip("No completed entries to test")
        
        entry = entries[0]
        
        # Fields needed for View Dialog
        view_dialog_fields = [
            'id', 'rst_no', 'date', 'vehicle_no', 'party_name', 'product',
            'tot_pkts', 'first_wt', 'second_wt', 'net_wt', 'status'
        ]
        
        for field in view_dialog_fields:
            assert field in entry, f"Entry missing field: {field}"
        
        print(f"✓ Entry has all required fields for View Dialog")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
