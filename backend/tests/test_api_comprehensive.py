"""
Comprehensive API Tests for Mill Entry System
Tests all major endpoints: auth, entries, suggestions, totals, dashboard, branding
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://frk-stock-manager.preview.emergentagent.com').rstrip('/')


class TestAuthEndpoints:
    """Authentication endpoint tests"""
    
    def test_login_admin_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["username"] == "admin"
        assert data["role"] == "admin"
        assert "message" in data
        print(f"✓ Admin login successful: {data}")
    
    def test_login_staff_success(self):
        """Test staff login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "staff",
            "password": "staff123"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["username"] == "staff"
        assert data["role"] == "staff"
        print(f"✓ Staff login successful: {data}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "wronguser",
            "password": "wrongpass"
        })
        assert response.status_code == 401
        print(f"✓ Invalid login correctly rejected with 401")
    
    def test_auth_verify_valid_user(self):
        """Test auth verify for valid user"""
        response = requests.get(f"{BASE_URL}/api/auth/verify?username=admin&role=admin")
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is True
        print(f"✓ Auth verify for admin: {data}")


class TestEntriesEndpoints:
    """Mill entries CRUD endpoint tests"""
    
    def test_get_entries_returns_array(self):
        """Test GET /api/entries returns array"""
        response = requests.get(f"{BASE_URL}/api/entries")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET entries returns array with {len(data)} entries")
    
    def test_get_entries_structure(self):
        """Test entries have correct structure"""
        response = requests.get(f"{BASE_URL}/api/entries")
        assert response.status_code == 200
        data = response.json()
        if len(data) > 0:
            entry = data[0]
            required_fields = ["id", "date", "truck_no", "agent_name", "mandi_name", 
                             "kg", "qntl", "bag", "final_w"]
            for field in required_fields:
                assert field in entry, f"Field '{field}' missing from entry"
            print(f"✓ Entries have correct structure")
        else:
            print("✓ Entries endpoint works (no entries to verify structure)")


class TestSuggestionEndpoints:
    """Auto-suggestion endpoint tests"""
    
    def test_get_truck_suggestions(self):
        """Test GET /api/suggestions/trucks returns correct format"""
        response = requests.get(f"{BASE_URL}/api/suggestions/trucks")
        assert response.status_code == 200
        data = response.json()
        assert "suggestions" in data
        assert isinstance(data["suggestions"], list)
        print(f"✓ Truck suggestions: {data['suggestions']}")
    
    def test_get_agent_suggestions(self):
        """Test GET /api/suggestions/agents returns correct format"""
        response = requests.get(f"{BASE_URL}/api/suggestions/agents")
        assert response.status_code == 200
        data = response.json()
        assert "suggestions" in data
        assert isinstance(data["suggestions"], list)
        print(f"✓ Agent suggestions: {data['suggestions']}")
    
    def test_get_mandi_suggestions(self):
        """Test GET /api/suggestions/mandis returns correct format"""
        response = requests.get(f"{BASE_URL}/api/suggestions/mandis")
        assert response.status_code == 200
        data = response.json()
        assert "suggestions" in data
        assert isinstance(data["suggestions"], list)
        print(f"✓ Mandi suggestions: {data['suggestions']}")
    
    def test_get_kms_years_suggestions(self):
        """Test GET /api/suggestions/kms_years returns correct format"""
        response = requests.get(f"{BASE_URL}/api/suggestions/kms_years")
        assert response.status_code == 200
        data = response.json()
        assert "suggestions" in data
        assert isinstance(data["suggestions"], list)
        print(f"✓ KMS Year suggestions: {data['suggestions']}")


class TestTotalsEndpoint:
    """Totals calculation endpoint tests"""
    
    def test_get_totals(self):
        """Test GET /api/totals returns totals object"""
        response = requests.get(f"{BASE_URL}/api/totals")
        assert response.status_code == 200
        data = response.json()
        
        required_fields = ["total_kg", "total_qntl", "total_bag", "total_final_w", 
                         "total_cash_paid", "total_diesel_paid"]
        for field in required_fields:
            assert field in data, f"Field '{field}' missing from totals"
        
        # Verify numeric types
        assert isinstance(data["total_kg"], (int, float))
        assert isinstance(data["total_qntl"], (int, float))
        assert isinstance(data["total_bag"], int)
        print(f"✓ Totals: total_qntl={data['total_qntl']}, total_bag={data['total_bag']}")


class TestDashboardEndpoints:
    """Dashboard endpoint tests"""
    
    def test_get_agent_totals(self):
        """Test GET /api/dashboard/agent-totals returns correct format"""
        response = requests.get(f"{BASE_URL}/api/dashboard/agent-totals")
        assert response.status_code == 200
        data = response.json()
        assert "agent_totals" in data
        assert isinstance(data["agent_totals"], list)
        
        if len(data["agent_totals"]) > 0:
            agent = data["agent_totals"][0]
            assert "agent_name" in agent
            assert "total_qntl" in agent
            assert "total_final_w" in agent
        print(f"✓ Agent totals: {len(data['agent_totals'])} agents")
    
    def test_get_mandi_targets_summary(self):
        """Test GET /api/mandi-targets/summary returns summary data"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets/summary")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        if len(data) > 0:
            target = data[0]
            assert "mandi_name" in target
            assert "target_qntl" in target
            assert "achieved_qntl" in target
            assert "progress_percent" in target
        print(f"✓ Mandi targets summary: {len(data)} targets")


class TestBrandingEndpoint:
    """Branding settings endpoint tests"""
    
    def test_get_branding(self):
        """Test GET /api/branding returns branding object with company_name"""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200
        data = response.json()
        assert "company_name" in data
        assert isinstance(data["company_name"], str)
        assert len(data["company_name"]) > 0
        print(f"✓ Branding: company_name='{data['company_name']}'")


class TestPaymentEndpoints:
    """Payment endpoint tests"""
    
    def test_get_truck_payments(self):
        """Test GET /api/truck-payments returns array"""
        response = requests.get(f"{BASE_URL}/api/truck-payments")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Truck payments: {len(data)} records")
    
    def test_get_agent_payments(self):
        """Test GET /api/agent-payments returns array"""
        response = requests.get(f"{BASE_URL}/api/agent-payments")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Agent payments: {len(data)} records")


class TestRootEndpoint:
    """Root API endpoint tests"""
    
    def test_api_root(self):
        """Test GET /api/ returns API info"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Mill Entry" in data["message"] or "Navkar" in data["message"]
        print(f"✓ API root: {data['message']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
