"""
Test WhatsApp Truck Payment and Truck Owner endpoints
Tests for v50.8.0 features:
- POST /api/whatsapp/send-truck-payment
- POST /api/whatsapp/send-truck-owner
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestWhatsAppTruckPayment:
    """Test /api/whatsapp/send-truck-payment endpoint"""
    
    def test_send_truck_payment_success(self):
        """Test sending truck payment with valid data"""
        response = requests.post(f"{BASE_URL}/api/whatsapp/send-truck-payment", json={
            "truck_no": "OD15A1234",
            "payments": [{"date": "2026-01-15", "mandi_name": "Test Mandi", "net_amount": 50000}],
            "total_net": 50000,
            "total_paid": 25000,
            "total_balance": 25000
        })
        # Should return 200 even if WhatsApp API fails (returns success: false)
        assert response.status_code == 200
        data = response.json()
        # Check response structure
        assert "success" in data or "error" in data
        print(f"send-truck-payment response: {data}")
    
    def test_send_truck_payment_missing_truck_no(self):
        """Test validation - truck_no is required"""
        response = requests.post(f"{BASE_URL}/api/whatsapp/send-truck-payment", json={
            "payments": [],
            "total_net": 50000,
            "total_paid": 25000,
            "total_balance": 25000
        })
        # Should return 400 when truck_no is missing
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        assert "truck" in data["detail"].lower() or "required" in data["detail"].lower()
        print(f"Missing truck_no validation: {data}")
    
    def test_send_truck_payment_empty_truck_no(self):
        """Test validation - empty truck_no should fail"""
        response = requests.post(f"{BASE_URL}/api/whatsapp/send-truck-payment", json={
            "truck_no": "",
            "payments": [],
            "total_net": 50000,
            "total_paid": 25000,
            "total_balance": 25000
        })
        # Should return 400 when truck_no is empty
        assert response.status_code == 400
        print(f"Empty truck_no validation: {response.json()}")


class TestWhatsAppTruckOwner:
    """Test /api/whatsapp/send-truck-owner endpoint"""
    
    def test_send_truck_owner_success(self):
        """Test sending truck owner summary with valid data"""
        response = requests.post(f"{BASE_URL}/api/whatsapp/send-truck-owner", json={
            "truck_no": "OD15A5678",
            "total_trips": 5,
            "total_gross": 100000,
            "total_deductions": 10000,
            "total_net": 90000,
            "total_paid": 50000,
            "total_balance": 40000
        })
        # Should return 200 even if WhatsApp API fails
        assert response.status_code == 200
        data = response.json()
        assert "success" in data or "error" in data
        print(f"send-truck-owner response: {data}")
    
    def test_send_truck_owner_missing_truck_no(self):
        """Test validation - truck_no is required"""
        response = requests.post(f"{BASE_URL}/api/whatsapp/send-truck-owner", json={
            "total_trips": 5,
            "total_gross": 100000,
            "total_deductions": 10000,
            "total_net": 90000,
            "total_paid": 50000,
            "total_balance": 40000
        })
        # Should return 400 when truck_no is missing
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        print(f"Missing truck_no validation: {data}")
    
    def test_send_truck_owner_empty_truck_no(self):
        """Test validation - empty truck_no should fail"""
        response = requests.post(f"{BASE_URL}/api/whatsapp/send-truck-owner", json={
            "truck_no": "",
            "total_trips": 5,
            "total_gross": 100000,
            "total_deductions": 10000,
            "total_net": 90000,
            "total_paid": 50000,
            "total_balance": 40000
        })
        # Should return 400 when truck_no is empty
        assert response.status_code == 400
        print(f"Empty truck_no validation: {response.json()}")


class TestWhatsAppEndpointExists:
    """Test that endpoints exist and are accessible"""
    
    def test_whatsapp_settings_endpoint(self):
        """Test WhatsApp settings endpoint exists"""
        response = requests.get(f"{BASE_URL}/api/whatsapp/settings")
        assert response.status_code == 200
        data = response.json()
        # Should have expected fields
        assert "enabled" in data or "api_key_masked" in data
        print(f"WhatsApp settings: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
