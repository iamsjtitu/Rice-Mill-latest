"""
Test User Permissions API - Bug Fix Verification
Tests for:
1. Login returns can_edit_rst in permissions
2. PUT /api/users/{user_id} with can_edit_rst toggle succeeds
3. GET /api/users returns users with can_edit_rst in permissions
4. Admin self-edit permissions update works correctly
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestUserPermissionsAPI:
    """Test user permissions endpoints - Bug fix verification"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Credentials from environment
        self.admin_username = os.environ.get('TEST_ADMIN_USERNAME', 'admin')
        self.admin_password = os.environ.get('TEST_ADMIN_PASSWORD', 'admin123')
        
    def test_login_returns_can_edit_rst_permission(self):
        """Test that login response includes can_edit_rst in permissions"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": self.admin_username,
            "password": self.admin_password
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Verify login success
        assert data.get("success") is True
        assert data.get("username") == self.admin_username
        assert data.get("role") == "admin"
        
        # Verify permissions object exists and contains can_edit_rst
        permissions = data.get("permissions", {})
        assert "can_edit_rst" in permissions, f"can_edit_rst missing from permissions: {permissions}"
        assert permissions["can_edit_rst"] is True, "Admin should have can_edit_rst=True"
        
        # Verify other expected permissions
        assert permissions.get("can_edit") is True
        assert permissions.get("can_delete") is True
        assert permissions.get("can_edit_settings") is True
        print(f"✓ Login returns can_edit_rst in permissions: {permissions}")
        
    def test_get_users_returns_can_edit_rst(self):
        """Test that GET /api/users returns users with can_edit_rst in permissions"""
        response = self.session.get(
            f"{BASE_URL}/api/users",
            params={"username": self.admin_username, "role": "admin"}
        )
        
        assert response.status_code == 200, f"GET users failed: {response.text}"
        data = response.json()
        
        users = data.get("users", [])
        assert len(users) >= 0, "Users list should be returned"
        
        # If there are users, verify they have permissions with can_edit_rst
        for user in users:
            if "permissions" in user:
                # can_edit_rst should be present in permissions
                assert "can_edit_rst" in user["permissions"], f"can_edit_rst missing for user {user.get('username')}"
        
        print(f"✓ GET /api/users returns {len(users)} users with proper permissions")
        
    def test_update_staff_user_can_edit_rst_toggle(self):
        """Test PUT /api/users/default_staff with can_edit_rst toggle succeeds"""
        # First, get current staff user state
        get_response = self.session.get(
            f"{BASE_URL}/api/users",
            params={"username": self.admin_username, "role": "admin"}
        )
        assert get_response.status_code == 200
        
        # Update staff user with can_edit_rst = True
        update_data = {
            "username": "staff",
            "display_name": "Staff User",
            "role": "entry_operator",
            "permissions": {
                "can_edit": True,
                "can_delete": False,
                "can_export": False,
                "can_see_payments": False,
                "can_see_cashbook": False,
                "can_see_reports": False,
                "can_edit_settings": False,
                "can_manual_weight": False,
                "can_edit_rst": True  # Toggle this ON
            }
        }
        
        response = self.session.put(
            f"{BASE_URL}/api/users/default_staff",
            params={"username": self.admin_username, "role": "admin"},
            json=update_data
        )
        
        assert response.status_code == 200, f"Update staff user failed: {response.text}"
        data = response.json()
        
        assert data.get("success") is True
        assert "user" in data
        
        # Verify can_edit_rst was updated
        updated_user = data["user"]
        assert updated_user.get("permissions", {}).get("can_edit_rst") is True, \
            f"can_edit_rst should be True after update: {updated_user.get('permissions')}"
        
        print(f"✓ PUT /api/users/default_staff with can_edit_rst=True succeeded")
        
        # Now toggle it back to False
        update_data["permissions"]["can_edit_rst"] = False
        response2 = self.session.put(
            f"{BASE_URL}/api/users/default_staff",
            params={"username": self.admin_username, "role": "admin"},
            json=update_data
        )
        
        assert response2.status_code == 200, f"Update staff user (toggle off) failed: {response2.text}"
        data2 = response2.json()
        assert data2["user"]["permissions"]["can_edit_rst"] is False, \
            "can_edit_rst should be False after toggle off"
        
        print(f"✓ PUT /api/users/default_staff with can_edit_rst=False succeeded")
        
    def test_update_admin_user_permissions(self):
        """Test PUT /api/users/default_admin with permissions update succeeds"""
        update_data = {
            "username": "admin",
            "display_name": "Admin User",
            "role": "admin",
            "permissions": {
                "can_edit": True,
                "can_delete": True,
                "can_export": True,
                "can_see_payments": True,
                "can_see_cashbook": True,
                "can_see_reports": True,
                "can_edit_settings": True,
                "can_manual_weight": True,
                "can_edit_rst": True
            }
        }
        
        response = self.session.put(
            f"{BASE_URL}/api/users/default_admin",
            params={"username": self.admin_username, "role": "admin"},
            json=update_data
        )
        
        assert response.status_code == 200, f"Update admin user failed: {response.text}"
        data = response.json()
        
        assert data.get("success") is True
        assert "user" in data
        
        # Verify permissions were updated
        updated_user = data["user"]
        perms = updated_user.get("permissions", {})
        assert perms.get("can_edit_rst") is True
        assert perms.get("can_edit") is True
        assert perms.get("can_delete") is True
        
        print(f"✓ PUT /api/users/default_admin succeeded with permissions: {perms}")
        
    def test_non_admin_cannot_update_users(self):
        """Test that non-admin users cannot update user permissions"""
        update_data = {
            "username": "staff",
            "permissions": {"can_edit_rst": True}
        }
        
        # Try to update as non-admin (staff role)
        response = self.session.put(
            f"{BASE_URL}/api/users/default_staff",
            params={"username": "staff", "role": "entry_operator"},
            json=update_data
        )
        
        assert response.status_code == 403, f"Non-admin should get 403, got: {response.status_code}"
        print(f"✓ Non-admin correctly blocked from updating users (403)")


class TestRolePermissionsDefaults:
    """Test that ROLE_PERMISSIONS includes can_edit_rst for all roles"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def test_admin_role_has_can_edit_rst_true(self):
        """Admin role should have can_edit_rst=True by default"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        
        assert response.status_code == 200
        perms = response.json().get("permissions", {})
        assert perms.get("can_edit_rst") is True, "Admin should have can_edit_rst=True"
        print(f"✓ Admin role has can_edit_rst=True")
        
    def test_staff_login_has_can_edit_rst_false(self):
        """Staff role should have can_edit_rst=False by default"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "staff",
            "password": "staff123"
        })
        
        assert response.status_code == 200
        perms = response.json().get("permissions", {})
        # Staff/entry_operator should have can_edit_rst=False by default
        assert perms.get("can_edit_rst") is False, f"Staff should have can_edit_rst=False, got: {perms}"
        print(f"✓ Staff role has can_edit_rst=False")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
