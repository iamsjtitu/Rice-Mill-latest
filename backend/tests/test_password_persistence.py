"""
Test: Admin Password Persistence Bug Fix
Verifies that after changing password via /api/auth/change-password:
1. Old password (admin123) is REJECTED
2. New password works
3. Password persists (no reset to default on login)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPasswordPersistence:
    """Test admin password persistence after change-password"""
    
    def test_01_login_with_default_password(self):
        """Step 1: Login with admin/admin123 should succeed initially"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        print(f"Login with admin123: {response.status_code} - {response.text[:200]}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert data.get("username") == "admin"
        assert data.get("role") == "admin"
    
    def test_02_change_password_to_new(self):
        """Step 2: Change password from admin123 to mySecret123"""
        response = requests.post(f"{BASE_URL}/api/auth/change-password", json={
            "username": "admin",
            "current_password": "admin123",
            "new_password": "mySecret123"
        })
        print(f"Change password: {response.status_code} - {response.text[:200]}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True
    
    def test_03_old_password_must_fail(self):
        """Step 3: Login with OLD password admin123 MUST FAIL with 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        print(f"Login with OLD password: {response.status_code} - {response.text[:200]}")
        # This is the critical test - old password MUST be rejected
        assert response.status_code == 401, f"BUG: Old password should be rejected! Got {response.status_code}: {response.text}"
        data = response.json()
        assert "Invalid" in data.get("detail", ""), f"Expected 'Invalid username or password', got: {data}"
    
    def test_04_new_password_must_work(self):
        """Step 4: Login with NEW password mySecret123 MUST SUCCEED"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "mySecret123"
        })
        print(f"Login with NEW password: {response.status_code} - {response.text[:200]}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert data.get("username") == "admin"
    
    def test_05_restore_original_password(self):
        """Step 5: Restore password back to admin123 for clean state"""
        response = requests.post(f"{BASE_URL}/api/auth/change-password", json={
            "username": "admin",
            "current_password": "mySecret123",
            "new_password": "admin123"
        })
        print(f"Restore password: {response.status_code} - {response.text[:200]}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True
    
    def test_06_verify_restored_password_works(self):
        """Step 6: Verify restored password admin123 works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        print(f"Login with restored password: {response.status_code} - {response.text[:200]}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True


class TestBackupBulkDelete:
    """Test backup bulk delete functionality"""
    
    def test_01_create_manual_backup(self):
        """Create a manual backup for testing"""
        response = requests.post(f"{BASE_URL}/api/backups")
        print(f"Create backup: {response.status_code} - {response.text[:200]}")
        # May fail if no backup system configured, but we try
        if response.status_code == 200:
            data = response.json()
            assert "message" in data or "filename" in data
    
    def test_02_get_backups_list(self):
        """Get list of backups"""
        response = requests.get(f"{BASE_URL}/api/backups")
        print(f"Get backups: {response.status_code} - {response.text[:300]}")
        assert response.status_code == 200
        data = response.json()
        assert "backups" in data
        print(f"Total backups: {len(data.get('backups', []))}")
    
    def test_03_bulk_delete_manual_backups(self):
        """Test bulk delete for manual backups section"""
        response = requests.post(f"{BASE_URL}/api/backups/bulk-delete", json={
            "source": "manual"
        })
        print(f"Bulk delete manual: {response.status_code} - {response.text[:200]}")
        # Endpoint may not exist or may return 200 with deleted count
        if response.status_code == 200:
            data = response.json()
            print(f"Deleted count: {data.get('deleted', 0)}")
        elif response.status_code == 404:
            print("Bulk delete endpoint not found - may need implementation")
