"""
Test Users & Permissions Management (v84.1.0)
Tests:
- GET /api/users (admin only)
- POST /api/users (create user with role/permissions)
- PUT /api/users/{id} (update user)
- DELETE /api/users/{id} (deactivate user)
- POST /api/auth/login (returns permissions)
- Non-admin access restriction (403)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USER = "admin"
ADMIN_PASS = "admin123"
TEST_USER_PREFIX = "test_"  # Backend converts to lowercase


class TestUsersPermissions:
    """User CRUD and permissions tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_user_ids = []
        yield
        # Cleanup: deactivate test users
        for user_id in self.created_user_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/users/{user_id}?username={ADMIN_USER}&role=admin")
            except:
                pass
    
    def test_01_admin_login_returns_permissions(self):
        """Test admin login returns full permissions"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USER,
            "password": ADMIN_PASS
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Verify login response structure
        assert data["success"] == True
        assert data["username"] == ADMIN_USER
        assert data["role"] == "admin"
        assert "permissions" in data
        
        # Verify admin has all permissions
        perms = data["permissions"]
        assert perms.get("can_edit") == True
        assert perms.get("can_delete") == True
        assert perms.get("can_export") == True
        assert perms.get("can_see_payments") == True
        assert perms.get("can_see_cashbook") == True
        assert perms.get("can_see_reports") == True
        assert perms.get("can_edit_settings") == True
        print(f"PASS: Admin login returns correct permissions: {perms}")
    
    def test_02_get_users_as_admin(self):
        """Test GET /api/users returns users list for admin"""
        response = self.session.get(f"{BASE_URL}/api/users?username={ADMIN_USER}&role=admin")
        assert response.status_code == 200, f"GET users failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "users" in data
        assert "staff" in data
        assert isinstance(data["users"], list)
        
        # Check for default admin user
        users = data["users"]
        admin_found = any(u["username"] == "admin" for u in users)
        assert admin_found, "Admin user should be in users list"
        print(f"PASS: GET /api/users returns {len(users)} users")
    
    def test_03_non_admin_cannot_access_users(self):
        """Test non-admin role gets 403 on /api/users"""
        # Try with staff role
        response = self.session.get(f"{BASE_URL}/api/users?username=staff&role=staff")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("PASS: Non-admin (staff) gets 403 on GET /api/users")
        
        # Try with viewer role
        response = self.session.get(f"{BASE_URL}/api/users?username=viewer&role=viewer")
        assert response.status_code == 403
        print("PASS: Non-admin (viewer) gets 403 on GET /api/users")
    
    def test_04_create_user_entry_operator(self):
        """Test creating a user with entry_operator role"""
        test_username = f"{TEST_USER_PREFIX}testram_{uuid.uuid4().hex[:6]}"
        
        response = self.session.post(f"{BASE_URL}/api/users?username={ADMIN_USER}&role=admin", json={
            "username": test_username,
            "password": "test1234",
            "display_name": "Test Ram",
            "role": "entry_operator",
            "permissions": {
                "can_edit": True,
                "can_delete": False,
                "can_export": False,
                "can_see_payments": False,
                "can_see_cashbook": False,
                "can_see_reports": False,
                "can_edit_settings": False
            }
        })
        assert response.status_code == 200, f"Create user failed: {response.text}"
        data = response.json()
        
        assert data["success"] == True
        assert "user" in data
        user = data["user"]
        assert user["username"] == test_username
        assert user["role"] == "entry_operator"
        assert user["display_name"] == "Test Ram"
        
        # Store for cleanup
        self.created_user_ids.append(user["id"])
        
        # Verify permissions
        perms = user["permissions"]
        assert perms.get("can_edit") == True
        assert perms.get("can_delete") == False
        assert perms.get("can_see_payments") == False
        print(f"PASS: Created user {test_username} with entry_operator role")
        
        return test_username, user["id"]
    
    def test_05_create_user_and_login(self):
        """Test creating a user and logging in with correct permissions"""
        test_username = f"{TEST_USER_PREFIX}logintest_{uuid.uuid4().hex[:6]}"
        
        # Create user
        create_resp = self.session.post(f"{BASE_URL}/api/users?username={ADMIN_USER}&role=admin", json={
            "username": test_username,
            "password": "test1234",
            "display_name": "Login Test User",
            "role": "entry_operator",
            "permissions": {}
        })
        assert create_resp.status_code == 200
        user_id = create_resp.json()["user"]["id"]
        self.created_user_ids.append(user_id)
        
        # Login with new user
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": test_username,
            "password": "test1234"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        data = login_resp.json()
        
        assert data["success"] == True
        assert data["username"] == test_username
        assert data["role"] == "entry_operator"
        assert "permissions" in data
        
        # Verify entry_operator default permissions
        perms = data["permissions"]
        assert perms.get("can_edit") == True
        assert perms.get("can_delete") == False
        assert perms.get("can_see_payments") == False
        assert perms.get("can_see_cashbook") == False
        assert perms.get("can_see_reports") == False
        print(f"PASS: User {test_username} login returns correct entry_operator permissions")
    
    def test_06_update_user_role_and_permissions(self):
        """Test updating user role and permissions"""
        test_username = f"{TEST_USER_PREFIX}updatetest_{uuid.uuid4().hex[:6]}"
        
        # Create user as viewer
        create_resp = self.session.post(f"{BASE_URL}/api/users?username={ADMIN_USER}&role=admin", json={
            "username": test_username,
            "password": "test1234",
            "role": "viewer",
            "permissions": {}
        })
        assert create_resp.status_code == 200
        user_id = create_resp.json()["user"]["id"]
        self.created_user_ids.append(user_id)
        
        # Update to accountant with custom permissions
        update_resp = self.session.put(f"{BASE_URL}/api/users/{user_id}?username={ADMIN_USER}&role=admin", json={
            "role": "accountant",
            "display_name": "Updated Name",
            "permissions": {
                "can_edit": True,
                "can_delete": True,  # Custom override
                "can_export": True,
                "can_see_payments": True,
                "can_see_cashbook": True,
                "can_see_reports": True,
                "can_edit_settings": False
            }
        })
        assert update_resp.status_code == 200, f"Update failed: {update_resp.text}"
        data = update_resp.json()
        
        assert data["success"] == True
        user = data["user"]
        assert user["role"] == "accountant"
        assert user["display_name"] == "Updated Name"
        
        # Verify custom permission override
        perms = user["permissions"]
        assert perms.get("can_delete") == True  # Custom override
        print(f"PASS: Updated user {test_username} role and permissions")
    
    def test_07_deactivate_user(self):
        """Test DELETE /api/users/{id} deactivates user (soft delete)"""
        test_username = f"{TEST_USER_PREFIX}deltest_{uuid.uuid4().hex[:6]}"
        
        # Create user
        create_resp = self.session.post(f"{BASE_URL}/api/users?username={ADMIN_USER}&role=admin", json={
            "username": test_username,
            "password": "test1234",
            "role": "viewer"
        })
        assert create_resp.status_code == 200
        user_id = create_resp.json()["user"]["id"]
        
        # Delete (deactivate) user
        del_resp = self.session.delete(f"{BASE_URL}/api/users/{user_id}?username={ADMIN_USER}&role=admin")
        assert del_resp.status_code == 200, f"Delete failed: {del_resp.text}"
        data = del_resp.json()
        assert data["success"] == True
        
        # Verify user is deactivated (login should fail)
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": test_username,
            "password": "test1234"
        })
        assert login_resp.status_code == 401, "Deactivated user should not be able to login"
        print(f"PASS: User {test_username} deactivated and cannot login")
    
    def test_08_non_admin_cannot_create_user(self):
        """Test non-admin cannot create users"""
        response = self.session.post(f"{BASE_URL}/api/users?username=staff&role=staff", json={
            "username": "hacker",
            "password": "hack123",
            "role": "admin"
        })
        assert response.status_code == 403
        print("PASS: Non-admin cannot create users (403)")
    
    def test_09_non_admin_cannot_update_user(self):
        """Test non-admin cannot update users"""
        response = self.session.put(f"{BASE_URL}/api/users/some-id?username=staff&role=staff", json={
            "role": "admin"
        })
        assert response.status_code == 403
        print("PASS: Non-admin cannot update users (403)")
    
    def test_10_non_admin_cannot_delete_user(self):
        """Test non-admin cannot delete users"""
        response = self.session.delete(f"{BASE_URL}/api/users/some-id?username=staff&role=staff")
        assert response.status_code == 403
        print("PASS: Non-admin cannot delete users (403)")
    
    def test_11_cannot_delete_admin_user(self):
        """Test admin user cannot be deleted"""
        # First get admin user id
        users_resp = self.session.get(f"{BASE_URL}/api/users?username={ADMIN_USER}&role=admin")
        users = users_resp.json()["users"]
        admin_user = next((u for u in users if u["username"] == "admin" and u.get("id")), None)
        
        if admin_user:
            del_resp = self.session.delete(f"{BASE_URL}/api/users/{admin_user['id']}?username={ADMIN_USER}&role=admin")
            assert del_resp.status_code == 400, "Should not be able to delete admin user"
            print("PASS: Admin user cannot be deleted (400)")
        else:
            print("SKIP: Admin user is default (no id), cannot test delete")
    
    def test_12_duplicate_username_rejected(self):
        """Test duplicate username is rejected"""
        test_username = f"{TEST_USER_PREFIX}duptest_{uuid.uuid4().hex[:6]}"
        
        # Create first user
        resp1 = self.session.post(f"{BASE_URL}/api/users?username={ADMIN_USER}&role=admin", json={
            "username": test_username,
            "password": "test1234",
            "role": "viewer"
        })
        assert resp1.status_code == 200
        self.created_user_ids.append(resp1.json()["user"]["id"])
        
        # Try to create duplicate
        resp2 = self.session.post(f"{BASE_URL}/api/users?username={ADMIN_USER}&role=admin", json={
            "username": test_username,
            "password": "test5678",
            "role": "viewer"
        })
        assert resp2.status_code == 400, "Duplicate username should be rejected"
        print(f"PASS: Duplicate username {test_username} rejected (400)")
    
    def test_13_password_validation(self):
        """Test password minimum length validation"""
        test_username = f"{TEST_USER_PREFIX}pwtest_{uuid.uuid4().hex[:6]}"
        
        # Try short password
        resp = self.session.post(f"{BASE_URL}/api/users?username={ADMIN_USER}&role=admin", json={
            "username": test_username,
            "password": "123",  # Too short
            "role": "viewer"
        })
        assert resp.status_code == 400, "Short password should be rejected"
        print("PASS: Short password rejected (400)")


class TestRoleBasedPermissions:
    """Test role-based default permissions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_user_ids = []
        yield
        for user_id in self.created_user_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/users/{user_id}?username={ADMIN_USER}&role=admin")
            except:
                pass
    
    def _create_and_login(self, role):
        """Helper to create user with role and login"""
        test_username = f"{TEST_USER_PREFIX}{role}_{uuid.uuid4().hex[:6]}"
        
        create_resp = self.session.post(f"{BASE_URL}/api/users?username={ADMIN_USER}&role=admin", json={
            "username": test_username,
            "password": "test1234",
            "role": role,
            "permissions": {}
        })
        assert create_resp.status_code == 200
        self.created_user_ids.append(create_resp.json()["user"]["id"])
        
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": test_username,
            "password": "test1234"
        })
        assert login_resp.status_code == 200
        return login_resp.json()
    
    def test_entry_operator_permissions(self):
        """Test entry_operator role has correct default permissions"""
        data = self._create_and_login("entry_operator")
        perms = data["permissions"]
        
        assert perms.get("can_edit") == True
        assert perms.get("can_delete") == False
        assert perms.get("can_export") == False
        assert perms.get("can_see_payments") == False
        assert perms.get("can_see_cashbook") == False
        assert perms.get("can_see_reports") == False
        assert perms.get("can_edit_settings") == False
        print("PASS: entry_operator has correct default permissions")
    
    def test_accountant_permissions(self):
        """Test accountant role has correct default permissions"""
        data = self._create_and_login("accountant")
        perms = data["permissions"]
        
        assert perms.get("can_edit") == True
        assert perms.get("can_delete") == False
        assert perms.get("can_export") == True
        assert perms.get("can_see_payments") == True
        assert perms.get("can_see_cashbook") == True
        assert perms.get("can_see_reports") == True
        assert perms.get("can_edit_settings") == False
        print("PASS: accountant has correct default permissions")
    
    def test_viewer_permissions(self):
        """Test viewer role has correct default permissions"""
        data = self._create_and_login("viewer")
        perms = data["permissions"]
        
        assert perms.get("can_edit") == False
        assert perms.get("can_delete") == False
        assert perms.get("can_export") == True
        assert perms.get("can_see_payments") == True
        assert perms.get("can_see_cashbook") == True
        assert perms.get("can_see_reports") == True
        assert perms.get("can_edit_settings") == False
        print("PASS: viewer has correct default permissions")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
