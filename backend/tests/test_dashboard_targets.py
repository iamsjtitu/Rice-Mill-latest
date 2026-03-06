"""
Test Dashboard and Mandi Target Features
Tests for:
- Dashboard agent-wise bar chart data
- Mandi Target CRUD operations
- Target calculation (expected_total = target_qntl + cutting%)
- Progress tracking (achieved vs pending)
- Role-based access (Admin vs Staff)
- KMS Year filter for dashboard
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USER = {"username": "admin", "password": "admin123"}
STAFF_USER = {"username": "staff", "password": "staff123"}


class TestAuthentication:
    """Test login for admin and staff users"""
    
    def test_admin_login(self):
        """Test admin login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["role"] == "admin"
        print("✓ Admin login successful")
    
    def test_staff_login(self):
        """Test staff login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STAFF_USER)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["role"] == "staff"
        print("✓ Staff login successful")


class TestDashboardAgentTotals:
    """Test Dashboard agent-wise totals endpoint"""
    
    def test_get_agent_totals(self):
        """Test getting agent-wise totals for bar chart"""
        response = requests.get(f"{BASE_URL}/api/dashboard/agent-totals")
        assert response.status_code == 200
        data = response.json()
        
        assert "agent_totals" in data
        assert isinstance(data["agent_totals"], list)
        print(f"✓ Got {len(data['agent_totals'])} agents in totals")
        
        # Verify structure of each agent total
        if len(data["agent_totals"]) > 0:
            agent = data["agent_totals"][0]
            assert "agent_name" in agent
            assert "total_qntl" in agent
            assert "total_final_w" in agent
            assert "total_entries" in agent
            assert "total_bag" in agent
            print(f"✓ Agent data structure correct: {agent['agent_name']} - {agent['total_final_w']} QNTL")
    
    def test_agent_totals_with_kms_year_filter(self):
        """Test agent totals with KMS year filter"""
        response = requests.get(f"{BASE_URL}/api/dashboard/agent-totals?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert "agent_totals" in data
        print(f"✓ Agent totals with KMS filter: {len(data['agent_totals'])} agents")
    
    def test_agent_totals_with_season_filter(self):
        """Test agent totals with season filter"""
        response = requests.get(f"{BASE_URL}/api/dashboard/agent-totals?season=Kharif")
        assert response.status_code == 200
        data = response.json()
        assert "agent_totals" in data
        print(f"✓ Agent totals with season filter: {len(data['agent_totals'])} agents")


class TestMandiTargetCRUD:
    """Test Mandi Target CRUD operations"""
    
    def test_get_mandi_targets(self):
        """Test getting all mandi targets"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} mandi targets")
        
        # Verify existing Badkutru target
        badkutru = next((t for t in data if t["mandi_name"] == "Badkutru"), None)
        if badkutru:
            assert badkutru["target_qntl"] == 5000.0
            assert badkutru["cutting_percent"] == 5.0
            assert badkutru["expected_total"] == 5250.0  # 5000 + 5% = 5250
            print(f"✓ Badkutru target verified: {badkutru['target_qntl']} + {badkutru['cutting_percent']}% = {badkutru['expected_total']}")
    
    def test_get_mandi_targets_with_filters(self):
        """Test getting targets with KMS year and season filters"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets?kms_year=2025-2026&season=Kharif")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} targets with filters")
    
    def test_create_mandi_target_admin(self):
        """Test admin can create a new mandi target"""
        unique_mandi = f"TEST_Mandi_{uuid.uuid4().hex[:6]}"
        payload = {
            "mandi_name": unique_mandi,
            "target_qntl": 3000.0,
            "cutting_percent": 5.26,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/mandi-targets?username=admin&role=admin",
            json=payload
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify expected_total calculation
        expected_total = 3000.0 + (3000.0 * 5.26 / 100)  # 3157.8
        assert data["mandi_name"] == unique_mandi
        assert data["target_qntl"] == 3000.0
        assert data["cutting_percent"] == 5.26
        assert abs(data["expected_total"] - expected_total) < 0.01
        print(f"✓ Created target: {unique_mandi} - Expected: {data['expected_total']} QNTL")
        
        # Store ID for cleanup
        return data["id"]
    
    def test_create_mandi_target_staff_forbidden(self):
        """Test staff cannot create mandi target"""
        payload = {
            "mandi_name": "TEST_StaffMandi",
            "target_qntl": 1000.0,
            "cutting_percent": 5.0,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/mandi-targets?username=staff&role=staff",
            json=payload
        )
        assert response.status_code == 403
        print("✓ Staff correctly forbidden from creating targets")
    
    def test_update_mandi_target_admin(self):
        """Test admin can update a mandi target"""
        # First create a target
        unique_mandi = f"TEST_Update_{uuid.uuid4().hex[:6]}"
        create_payload = {
            "mandi_name": unique_mandi,
            "target_qntl": 2000.0,
            "cutting_percent": 5.0,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/mandi-targets?username=admin&role=admin",
            json=create_payload
        )
        assert create_response.status_code == 200
        target_id = create_response.json()["id"]
        
        # Update the target
        update_payload = {
            "target_qntl": 2500.0,
            "cutting_percent": 6.0
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/mandi-targets/{target_id}?username=admin&role=admin",
            json=update_payload
        )
        assert update_response.status_code == 200
        data = update_response.json()
        
        # Verify updated values
        assert data["target_qntl"] == 2500.0
        assert data["cutting_percent"] == 6.0
        expected_total = 2500.0 + (2500.0 * 6.0 / 100)  # 2650
        assert abs(data["expected_total"] - expected_total) < 0.01
        print(f"✓ Updated target: {data['target_qntl']} + {data['cutting_percent']}% = {data['expected_total']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/mandi-targets/{target_id}?username=admin&role=admin")
    
    def test_update_mandi_target_staff_forbidden(self):
        """Test staff cannot update mandi target"""
        # Get existing target
        response = requests.get(f"{BASE_URL}/api/mandi-targets")
        targets = response.json()
        if len(targets) > 0:
            target_id = targets[0]["id"]
            
            update_response = requests.put(
                f"{BASE_URL}/api/mandi-targets/{target_id}?username=staff&role=staff",
                json={"target_qntl": 9999.0}
            )
            assert update_response.status_code == 403
            print("✓ Staff correctly forbidden from updating targets")
    
    def test_delete_mandi_target_admin(self):
        """Test admin can delete a mandi target"""
        # First create a target
        unique_mandi = f"TEST_Delete_{uuid.uuid4().hex[:6]}"
        create_payload = {
            "mandi_name": unique_mandi,
            "target_qntl": 1000.0,
            "cutting_percent": 5.0,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/mandi-targets?username=admin&role=admin",
            json=create_payload
        )
        assert create_response.status_code == 200
        target_id = create_response.json()["id"]
        
        # Delete the target
        delete_response = requests.delete(
            f"{BASE_URL}/api/mandi-targets/{target_id}?username=admin&role=admin"
        )
        assert delete_response.status_code == 200
        print("✓ Admin successfully deleted target")
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/mandi-targets")
        targets = get_response.json()
        deleted_target = next((t for t in targets if t["id"] == target_id), None)
        assert deleted_target is None
        print("✓ Target verified as deleted")
    
    def test_delete_mandi_target_staff_forbidden(self):
        """Test staff cannot delete mandi target"""
        # Get existing target
        response = requests.get(f"{BASE_URL}/api/mandi-targets")
        targets = response.json()
        if len(targets) > 0:
            target_id = targets[0]["id"]
            
            delete_response = requests.delete(
                f"{BASE_URL}/api/mandi-targets/{target_id}?username=staff&role=staff"
            )
            assert delete_response.status_code == 403
            print("✓ Staff correctly forbidden from deleting targets")


class TestMandiTargetSummary:
    """Test Mandi Target Summary endpoint (achieved vs pending)"""
    
    def test_get_target_summary(self):
        """Test getting target summary with achieved/pending calculations"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets/summary")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} target summaries")
        
        # Verify Badkutru summary
        badkutru = next((t for t in data if t["mandi_name"] == "Badkutru"), None)
        if badkutru:
            assert "achieved_qntl" in badkutru
            assert "pending_qntl" in badkutru
            assert "progress_percent" in badkutru
            
            # Verify calculation: pending = expected - achieved
            expected_pending = badkutru["expected_total"] - badkutru["achieved_qntl"]
            assert abs(badkutru["pending_qntl"] - expected_pending) < 0.01
            
            # Verify progress percent
            expected_progress = (badkutru["achieved_qntl"] / badkutru["expected_total"]) * 100
            assert abs(badkutru["progress_percent"] - expected_progress) < 0.1
            
            print(f"✓ Badkutru summary: Achieved={badkutru['achieved_qntl']}, Pending={badkutru['pending_qntl']}, Progress={badkutru['progress_percent']}%")
    
    def test_target_summary_with_filters(self):
        """Test target summary with KMS year and season filters"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets/summary?kms_year=2025-2026&season=Kharif")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} target summaries with filters")


class TestExpectedTotalCalculation:
    """Test expected_total calculation: target_qntl + (target_qntl * cutting_percent / 100)"""
    
    def test_expected_total_5_percent(self):
        """Test expected total with 5% cutting"""
        unique_mandi = f"TEST_5pct_{uuid.uuid4().hex[:6]}"
        payload = {
            "mandi_name": unique_mandi,
            "target_qntl": 5000.0,
            "cutting_percent": 5.0,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/mandi-targets?username=admin&role=admin",
            json=payload
        )
        assert response.status_code == 200
        data = response.json()
        
        # 5000 + (5000 * 5 / 100) = 5000 + 250 = 5250
        assert data["expected_total"] == 5250.0
        print(f"✓ 5% cutting: 5000 + 5% = {data['expected_total']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/mandi-targets/{data['id']}?username=admin&role=admin")
    
    def test_expected_total_5_26_percent(self):
        """Test expected total with 5.26% cutting"""
        unique_mandi = f"TEST_526pct_{uuid.uuid4().hex[:6]}"
        payload = {
            "mandi_name": unique_mandi,
            "target_qntl": 3000.0,
            "cutting_percent": 5.26,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/mandi-targets?username=admin&role=admin",
            json=payload
        )
        assert response.status_code == 200
        data = response.json()
        
        # 3000 + (3000 * 5.26 / 100) = 3000 + 157.8 = 3157.8
        expected = 3000.0 + (3000.0 * 5.26 / 100)
        assert abs(data["expected_total"] - expected) < 0.01
        print(f"✓ 5.26% cutting: 3000 + 5.26% = {data['expected_total']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/mandi-targets/{data['id']}?username=admin&role=admin")


class TestDateRangeTotals:
    """Test date range filter for reporting"""
    
    def test_date_range_totals_endpoint(self):
        """Test date range totals endpoint exists and works"""
        response = requests.get(f"{BASE_URL}/api/dashboard/date-range-totals")
        assert response.status_code == 200
        data = response.json()
        
        assert "total_kg" in data
        assert "total_qntl" in data
        assert "total_bag" in data
        assert "total_final_w" in data
        assert "total_entries" in data
        print(f"✓ Date range totals: {data['total_entries']} entries, {data['total_final_w']} QNTL")
    
    def test_date_range_totals_with_dates(self):
        """Test date range totals with start and end dates"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/date-range-totals?start_date=2025-01-01&end_date=2026-12-31"
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["start_date"] == "2025-01-01"
        assert data["end_date"] == "2026-12-31"
        print(f"✓ Date range totals with dates: {data['total_entries']} entries")
    
    def test_date_range_totals_with_kms_filter(self):
        """Test date range totals with KMS year filter"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/date-range-totals?kms_year=2025-2026"
        )
        assert response.status_code == 200
        data = response.json()
        print(f"✓ Date range totals with KMS filter: {data['total_entries']} entries")


class TestDuplicateTargetPrevention:
    """Test that duplicate targets for same mandi/year/season are prevented"""
    
    def test_duplicate_target_rejected(self):
        """Test creating duplicate target is rejected"""
        unique_mandi = f"TEST_Dup_{uuid.uuid4().hex[:6]}"
        payload = {
            "mandi_name": unique_mandi,
            "target_qntl": 1000.0,
            "cutting_percent": 5.0,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        
        # Create first target
        response1 = requests.post(
            f"{BASE_URL}/api/mandi-targets?username=admin&role=admin",
            json=payload
        )
        assert response1.status_code == 200
        target_id = response1.json()["id"]
        
        # Try to create duplicate
        response2 = requests.post(
            f"{BASE_URL}/api/mandi-targets?username=admin&role=admin",
            json=payload
        )
        assert response2.status_code == 400
        print("✓ Duplicate target correctly rejected")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/mandi-targets/{target_id}?username=admin&role=admin")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_targets(self):
        """Remove all TEST_ prefixed targets"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets")
        targets = response.json()
        
        deleted = 0
        for target in targets:
            if target["mandi_name"].startswith("TEST_"):
                requests.delete(
                    f"{BASE_URL}/api/mandi-targets/{target['id']}?username=admin&role=admin"
                )
                deleted += 1
        
        print(f"✓ Cleaned up {deleted} test targets")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
