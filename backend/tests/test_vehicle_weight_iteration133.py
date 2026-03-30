"""
Iteration 133: Test Vehicle Weight Edit, Print, and Manual WA/Group Send features
- PUT /api/vehicle-weight/{id}/edit - updates editable fields (vehicle_no, party_name, farmer_name, product, tot_pkts, cash_paid, diesel_paid)
- POST /api/vehicle-weight/send-manual - sends text to WA/Telegram (returns success even if not configured)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="module")
def auth_token(api_client):
    """Get authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "username": "admin",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Authentication failed - skipping authenticated tests")

@pytest.fixture(scope="module")
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client

@pytest.fixture(scope="module")
def test_entry(authenticated_client):
    """Create a test vehicle weight entry for testing edit functionality"""
    # Create first weight entry
    create_payload = {
        "vehicle_no": "TEST_OD02AB1234",
        "party_name": "TEST_PARTY_133",
        "farmer_name": "TEST_MANDI_133",
        "product": "GOVT PADDY",
        "tot_pkts": "50",
        "first_wt": 15000,
        "cash_paid": 1000,
        "diesel_paid": 500,
        "kms_year": ""
    }
    response = authenticated_client.post(f"{BASE_URL}/api/vehicle-weight", json=create_payload)
    assert response.status_code == 200, f"Failed to create test entry: {response.text}"
    data = response.json()
    assert data.get("success") == True
    entry = data.get("entry")
    entry_id = entry.get("id")
    
    # Add second weight to make it completed
    second_wt_payload = {
        "second_wt": 5000,
        "cash_paid": 1000,
        "diesel_paid": 500
    }
    response = authenticated_client.put(f"{BASE_URL}/api/vehicle-weight/{entry_id}/second-weight", json=second_wt_payload)
    assert response.status_code == 200, f"Failed to add second weight: {response.text}"
    
    yield entry_id
    
    # Cleanup - delete test entry
    try:
        authenticated_client.delete(f"{BASE_URL}/api/vehicle-weight/{entry_id}")
    except:
        pass


class TestVehicleWeightEditAPI:
    """Test PUT /api/vehicle-weight/{id}/edit endpoint"""
    
    def test_edit_vehicle_no(self, authenticated_client, test_entry):
        """Test editing vehicle number"""
        edit_payload = {"vehicle_no": "TEST_OD99ZZ9999"}
        response = authenticated_client.put(f"{BASE_URL}/api/vehicle-weight/{test_entry}/edit", json=edit_payload)
        
        assert response.status_code == 200, f"Edit failed: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert data.get("entry", {}).get("vehicle_no") == "TEST_OD99ZZ9999"
    
    def test_edit_party_name(self, authenticated_client, test_entry):
        """Test editing party name"""
        edit_payload = {"party_name": "UPDATED_PARTY_133"}
        response = authenticated_client.put(f"{BASE_URL}/api/vehicle-weight/{test_entry}/edit", json=edit_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert data.get("entry", {}).get("party_name") == "UPDATED_PARTY_133"
    
    def test_edit_farmer_name(self, authenticated_client, test_entry):
        """Test editing farmer/mandi name"""
        edit_payload = {"farmer_name": "UPDATED_MANDI_133"}
        response = authenticated_client.put(f"{BASE_URL}/api/vehicle-weight/{test_entry}/edit", json=edit_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert data.get("entry", {}).get("farmer_name") == "UPDATED_MANDI_133"
    
    def test_edit_product(self, authenticated_client, test_entry):
        """Test editing product"""
        edit_payload = {"product": "RICE"}
        response = authenticated_client.put(f"{BASE_URL}/api/vehicle-weight/{test_entry}/edit", json=edit_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert data.get("entry", {}).get("product") == "RICE"
    
    def test_edit_tot_pkts(self, authenticated_client, test_entry):
        """Test editing total packets"""
        edit_payload = {"tot_pkts": "100"}
        response = authenticated_client.put(f"{BASE_URL}/api/vehicle-weight/{test_entry}/edit", json=edit_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert str(data.get("entry", {}).get("tot_pkts")) == "100"
    
    def test_edit_cash_paid(self, authenticated_client, test_entry):
        """Test editing cash paid"""
        edit_payload = {"cash_paid": "2500"}
        response = authenticated_client.put(f"{BASE_URL}/api/vehicle-weight/{test_entry}/edit", json=edit_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert float(data.get("entry", {}).get("cash_paid", 0)) == 2500.0
    
    def test_edit_diesel_paid(self, authenticated_client, test_entry):
        """Test editing diesel paid"""
        edit_payload = {"diesel_paid": "750"}
        response = authenticated_client.put(f"{BASE_URL}/api/vehicle-weight/{test_entry}/edit", json=edit_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert float(data.get("entry", {}).get("diesel_paid", 0)) == 750.0
    
    def test_edit_multiple_fields(self, authenticated_client, test_entry):
        """Test editing multiple fields at once"""
        edit_payload = {
            "vehicle_no": "TEST_MULTI_EDIT",
            "party_name": "MULTI_PARTY",
            "product": "PADDY",
            "cash_paid": "3000",
            "diesel_paid": "1000"
        }
        response = authenticated_client.put(f"{BASE_URL}/api/vehicle-weight/{test_entry}/edit", json=edit_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        entry = data.get("entry", {})
        assert entry.get("vehicle_no") == "TEST_MULTI_EDIT"
        assert entry.get("party_name") == "MULTI_PARTY"
        assert entry.get("product") == "PADDY"
        assert float(entry.get("cash_paid", 0)) == 3000.0
        assert float(entry.get("diesel_paid", 0)) == 1000.0
    
    def test_edit_nonexistent_entry(self, authenticated_client):
        """Test editing non-existent entry returns 404"""
        fake_id = str(uuid.uuid4())
        edit_payload = {"vehicle_no": "SHOULD_FAIL"}
        response = authenticated_client.put(f"{BASE_URL}/api/vehicle-weight/{fake_id}/edit", json=edit_payload)
        
        assert response.status_code == 404


class TestVehicleWeightSendManualAPI:
    """Test POST /api/vehicle-weight/send-manual endpoint"""
    
    def test_send_manual_to_numbers(self, authenticated_client, test_entry):
        """Test sending manual message to WhatsApp numbers"""
        payload = {
            "entry_id": test_entry,
            "text": "*Weight Slip — RST #TEST*\nVehicle: TEST123\nParty: Test Party\nNet Wt: 10,000 KG",
            "front_image": "",
            "side_image": "",
            "send_to_numbers": True,
            "send_to_group": False
        }
        response = authenticated_client.post(f"{BASE_URL}/api/vehicle-weight/send-manual", json=payload)
        
        assert response.status_code == 200, f"Send manual failed: {response.text}"
        data = response.json()
        assert data.get("success") == True
        # Should return success even if WA/TG not configured
        assert "message" in data
        assert "results" in data
    
    def test_send_manual_to_group(self, authenticated_client, test_entry):
        """Test sending manual message to WhatsApp group"""
        payload = {
            "entry_id": test_entry,
            "text": "*Weight Slip — RST #TEST*\nVehicle: TEST123\nParty: Test Party\nNet Wt: 10,000 KG",
            "front_image": "",
            "side_image": "",
            "send_to_numbers": False,
            "send_to_group": True
        }
        response = authenticated_client.post(f"{BASE_URL}/api/vehicle-weight/send-manual", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert "message" in data
    
    def test_send_manual_with_images(self, authenticated_client, test_entry):
        """Test sending manual message with camera images (base64)"""
        # Small test image (1x1 pixel transparent PNG in base64)
        test_image_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        
        payload = {
            "entry_id": test_entry,
            "text": "*Weight Slip — RST #TEST*\nWith Images",
            "front_image": test_image_b64,
            "side_image": test_image_b64,
            "send_to_numbers": True,
            "send_to_group": True
        }
        response = authenticated_client.post(f"{BASE_URL}/api/vehicle-weight/send-manual", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True


class TestVehicleWeightSlipPDF:
    """Test GET /api/vehicle-weight/{id}/slip-pdf endpoint"""
    
    def test_get_slip_pdf(self, authenticated_client, test_entry):
        """Test generating weight slip PDF"""
        response = authenticated_client.get(f"{BASE_URL}/api/vehicle-weight/{test_entry}/slip-pdf")
        
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf"
        # Check PDF magic bytes
        assert response.content[:4] == b'%PDF'
    
    def test_get_slip_pdf_nonexistent(self, authenticated_client):
        """Test PDF generation for non-existent entry returns 404"""
        fake_id = str(uuid.uuid4())
        response = authenticated_client.get(f"{BASE_URL}/api/vehicle-weight/{fake_id}/slip-pdf")
        
        assert response.status_code == 404


class TestBrandingAPI:
    """Test GET /api/branding endpoint used by print function"""
    
    def test_get_branding(self, authenticated_client):
        """Test getting branding settings for print slip"""
        response = authenticated_client.get(f"{BASE_URL}/api/branding")
        
        # Should return 200 even if no branding configured
        assert response.status_code == 200
        data = response.json()
        # Should have company_name and tagline (may be defaults)
        assert isinstance(data, dict)


class TestCompletedEntriesData:
    """Test that completed entries have all required fields"""
    
    def test_completed_entries_have_all_fields(self, authenticated_client):
        """Test that completed entries return all required fields for display"""
        response = authenticated_client.get(f"{BASE_URL}/api/vehicle-weight?status=completed")
        
        assert response.status_code == 200
        data = response.json()
        entries = data.get("entries", [])
        
        # Check first completed entry has all required fields
        if entries:
            entry = entries[0]
            required_fields = ["rst_no", "date", "vehicle_no", "party_name", "product", 
                            "tot_pkts", "first_wt", "second_wt", "net_wt", "cash_paid", "diesel_paid"]
            for field in required_fields:
                assert field in entry, f"Missing field: {field}"
