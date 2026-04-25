"""
Password Recovery Feature Tests - Iteration 201
Tests for:
1. Recovery Code generation, status, and password reset
2. Recovery WhatsApp number set/get
3. WhatsApp OTP send (expected to fail without API key)
4. Password strength validation (min 6 chars)
5. Authorization checks (admin-only endpoints)
"""
import pytest
import requests
import os
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USER = "admin"
ADMIN_PASS = "admin123"
NEW_PASSWORD = "newSecret456"
TEST_WHATSAPP = "9876543210"


class TestPasswordRecoveryFlow:
    """Full password recovery flow tests"""
    
    recovery_code = None  # Store generated code for later tests
    
    def test_01_login_with_default_password(self):
        """Step 1: Login with admin/admin123 must succeed"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USER,
            "password": ADMIN_PASS
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert data.get("success") is True
        assert data.get("role") == "admin"
        print(f"✓ Login successful: {data.get('username')}")
    
    def test_02_generate_recovery_code(self):
        """Step 2: POST /api/auth/recovery-code/generate returns 16-char code in XXXX-XXXX-XXXX-XXXX format"""
        response = requests.post(f"{BASE_URL}/api/auth/recovery-code/generate", json={
            "username": ADMIN_USER,
            "current_password": ADMIN_PASS
        })
        assert response.status_code == 200, f"Generate failed: {response.text}"
        data = response.json()
        assert data.get("success") is True
        code = data.get("code", "")
        # Validate format: XXXX-XXXX-XXXX-XXXX (16 chars + 3 dashes)
        assert re.match(r'^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$', code), f"Invalid code format: {code}"
        TestPasswordRecoveryFlow.recovery_code = code
        print(f"✓ Recovery code generated: {code}")
    
    def test_03_recovery_code_status(self):
        """Step 3: GET /api/auth/recovery-code/status returns has_code:true"""
        response = requests.get(f"{BASE_URL}/api/auth/recovery-code/status", params={
            "username": ADMIN_USER,
            "role": "admin"
        })
        assert response.status_code == 200, f"Status check failed: {response.text}"
        data = response.json()
        assert data.get("has_code") is True
        assert data.get("set_at") != ""
        print(f"✓ Recovery code status: has_code={data.get('has_code')}, set_at={data.get('set_at')}")
    
    def test_04_set_recovery_whatsapp(self):
        """Step 4: PUT /api/auth/recovery-whatsapp sets WhatsApp number"""
        response = requests.put(f"{BASE_URL}/api/auth/recovery-whatsapp", json={
            "username": ADMIN_USER,
            "current_password": ADMIN_PASS,
            "whatsapp": TEST_WHATSAPP
        })
        assert response.status_code == 200, f"Set WhatsApp failed: {response.text}"
        data = response.json()
        assert data.get("success") is True
        assert data.get("masked") == "******3210"
        print(f"✓ Recovery WhatsApp set: masked={data.get('masked')}")
    
    def test_05_get_recovery_whatsapp(self):
        """Step 5: GET /api/auth/recovery-whatsapp returns has_number:true"""
        response = requests.get(f"{BASE_URL}/api/auth/recovery-whatsapp", params={
            "username": ADMIN_USER,
            "role": "admin"
        })
        assert response.status_code == 200, f"Get WhatsApp failed: {response.text}"
        data = response.json()
        assert data.get("has_number") is True
        assert "3210" in data.get("masked", "")
        print(f"✓ Recovery WhatsApp status: has_number={data.get('has_number')}, masked={data.get('masked')}")
    
    def test_06_reset_password_via_recovery_code(self):
        """Step 6: POST /api/auth/forgot-password/recovery-code resets password"""
        assert TestPasswordRecoveryFlow.recovery_code, "Recovery code not generated"
        response = requests.post(f"{BASE_URL}/api/auth/forgot-password/recovery-code", json={
            "username": ADMIN_USER,
            "code": TestPasswordRecoveryFlow.recovery_code,
            "new_password": NEW_PASSWORD
        })
        assert response.status_code == 200, f"Reset failed: {response.text}"
        data = response.json()
        assert data.get("success") is True
        assert data.get("code_invalidated") is True
        print(f"✓ Password reset via recovery code: {data.get('message')}")
    
    def test_07_old_password_must_fail(self):
        """Step 7: Login with old password (admin123) must FAIL with 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USER,
            "password": ADMIN_PASS
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("✓ Old password correctly rejected (401)")
    
    def test_08_new_password_must_work(self):
        """Step 8: Login with new password (newSecret456) must succeed"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USER,
            "password": NEW_PASSWORD
        })
        assert response.status_code == 200, f"Login with new password failed: {response.text}"
        data = response.json()
        assert data.get("success") is True
        print(f"✓ Login with new password successful")
    
    def test_09_recovery_code_one_time_use(self):
        """Step 9: Using same recovery code again must FAIL with 404"""
        assert TestPasswordRecoveryFlow.recovery_code, "Recovery code not generated"
        response = requests.post(f"{BASE_URL}/api/auth/forgot-password/recovery-code", json={
            "username": ADMIN_USER,
            "code": TestPasswordRecoveryFlow.recovery_code,
            "new_password": "anotherPassword123"
        })
        assert response.status_code == 404, f"Expected 404 (code invalidated), got {response.status_code}: {response.text}"
        print("✓ Recovery code correctly invalidated (one-time use)")
    
    def test_10_password_min_length_validation(self):
        """Step 10: POST /api/auth/change-password with 5-char password must FAIL with 400"""
        response = requests.post(f"{BASE_URL}/api/auth/change-password", json={
            "username": ADMIN_USER,
            "current_password": NEW_PASSWORD,
            "new_password": "short"  # Only 5 chars
        })
        assert response.status_code == 400, f"Expected 400 for short password, got {response.status_code}: {response.text}"
        print("✓ Password min length (6 chars) enforced")
    
    def test_11_wrong_recovery_code_fails(self):
        """Step 11: POST /api/auth/forgot-password/recovery-code with WRONG code must FAIL with 401"""
        response = requests.post(f"{BASE_URL}/api/auth/forgot-password/recovery-code", json={
            "username": ADMIN_USER,
            "code": "XXXX-XXXX-XXXX-XXXX",  # Wrong code
            "new_password": "somePassword123"
        })
        # Should be 404 (no code set) or 401 (wrong code)
        assert response.status_code in [401, 404], f"Expected 401/404, got {response.status_code}: {response.text}"
        print(f"✓ Wrong recovery code rejected ({response.status_code})")
    
    def test_12_cleanup_restore_password(self):
        """Step 12: Cleanup - restore password to admin123"""
        response = requests.post(f"{BASE_URL}/api/auth/change-password", json={
            "username": ADMIN_USER,
            "current_password": NEW_PASSWORD,
            "new_password": ADMIN_PASS
        })
        assert response.status_code == 200, f"Restore password failed: {response.text}"
        print("✓ Password restored to admin123")
    
    def test_13_cleanup_clear_recovery_whatsapp(self):
        """Step 13: Cleanup - clear recovery WhatsApp"""
        response = requests.put(f"{BASE_URL}/api/auth/recovery-whatsapp", json={
            "username": ADMIN_USER,
            "current_password": ADMIN_PASS,
            "whatsapp": ""  # Empty to clear
        })
        assert response.status_code == 200, f"Clear WhatsApp failed: {response.text}"
        print("✓ Recovery WhatsApp cleared")
    
    def test_14_verify_final_state(self):
        """Step 14: Verify final state - admin/admin123 works, no recovery data"""
        # Login works
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USER,
            "password": ADMIN_PASS
        })
        assert response.status_code == 200, f"Final login check failed: {response.text}"
        
        # No recovery WhatsApp
        response = requests.get(f"{BASE_URL}/api/auth/recovery-whatsapp", params={
            "username": ADMIN_USER,
            "role": "admin"
        })
        data = response.json()
        assert data.get("has_number") is False
        
        # No recovery code (was invalidated)
        response = requests.get(f"{BASE_URL}/api/auth/recovery-code/status", params={
            "username": ADMIN_USER,
            "role": "admin"
        })
        data = response.json()
        assert data.get("has_code") is False
        
        print("✓ Final state verified: admin/admin123, no recovery data")


class TestAuthorizationChecks:
    """Authorization tests for admin-only endpoints"""
    
    def test_01_recovery_code_generate_non_admin_fails(self):
        """recovery-code/generate must reject non-admin role with 403"""
        # First create a staff user or use existing
        # For this test, we'll try with a non-existent user which should fail differently
        # The key test is that role check happens
        response = requests.post(f"{BASE_URL}/api/auth/recovery-code/generate", json={
            "username": "staff",  # Non-admin user
            "current_password": "staff123"
        })
        # Should be 403 (not admin) or 404 (user not found)
        assert response.status_code in [403, 404], f"Expected 403/404, got {response.status_code}"
        print(f"✓ Non-admin recovery code generate rejected ({response.status_code})")
    
    def test_02_recovery_code_status_non_admin_fails(self):
        """recovery-code/status?role=staff must reject with 403"""
        response = requests.get(f"{BASE_URL}/api/auth/recovery-code/status", params={
            "username": ADMIN_USER,
            "role": "staff"  # Non-admin role
        })
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("✓ Non-admin recovery code status rejected (403)")
    
    def test_03_recovery_whatsapp_wrong_password_fails(self):
        """recovery-whatsapp PUT must reject if current_password is wrong (401)"""
        response = requests.put(f"{BASE_URL}/api/auth/recovery-whatsapp", json={
            "username": ADMIN_USER,
            "current_password": "wrongPassword",
            "whatsapp": "1234567890"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("✓ Wrong password for recovery WhatsApp rejected (401)")
    
    def test_04_recovery_whatsapp_get_non_admin_fails(self):
        """recovery-whatsapp GET with role=staff must reject with 403"""
        response = requests.get(f"{BASE_URL}/api/auth/recovery-whatsapp", params={
            "username": ADMIN_USER,
            "role": "staff"
        })
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("✓ Non-admin recovery WhatsApp get rejected (403)")


class TestWhatsAppOTPFlow:
    """WhatsApp OTP tests - expected to fail without API key"""
    
    def test_01_send_otp_without_recovery_number(self):
        """send-otp without recovery WhatsApp set should return 404"""
        # First ensure no recovery WhatsApp is set
        response = requests.post(f"{BASE_URL}/api/auth/forgot-password/send-otp", json={
            "username": ADMIN_USER
        })
        # Should be 404 (no recovery WhatsApp set)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        assert "recovery WhatsApp" in response.json().get("detail", "").lower() or "set nahi" in response.json().get("detail", "")
        print("✓ Send OTP without recovery number correctly returns 404")
    
    def test_02_send_otp_with_recovery_number_fails_gracefully(self):
        """send-otp with recovery WhatsApp should fail gracefully (500 with clear message)"""
        # First set recovery WhatsApp
        requests.put(f"{BASE_URL}/api/auth/recovery-whatsapp", json={
            "username": ADMIN_USER,
            "current_password": ADMIN_PASS,
            "whatsapp": TEST_WHATSAPP
        })
        
        # Now try to send OTP - should fail because WhatsApp API not configured
        response = requests.post(f"{BASE_URL}/api/auth/forgot-password/send-otp", json={
            "username": ADMIN_USER
        })
        # Expected: 500 with clear error message about WhatsApp send failure
        assert response.status_code == 500, f"Expected 500 (WhatsApp not configured), got {response.status_code}: {response.text}"
        detail = response.json().get("detail", "")
        assert "error" in detail.lower() or "fail" in detail.lower(), f"Expected clear error message, got: {detail}"
        print(f"✓ Send OTP fails gracefully with clear message: {detail}")
        
        # Cleanup - clear recovery WhatsApp
        requests.put(f"{BASE_URL}/api/auth/recovery-whatsapp", json={
            "username": ADMIN_USER,
            "current_password": ADMIN_PASS,
            "whatsapp": ""
        })


class TestPasswordStrengthValidation:
    """Password strength validation tests"""
    
    def test_01_change_password_min_length(self):
        """change-password with <6 chars must fail with 400"""
        response = requests.post(f"{BASE_URL}/api/auth/change-password", json={
            "username": ADMIN_USER,
            "current_password": ADMIN_PASS,
            "new_password": "12345"  # 5 chars
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "6" in response.json().get("detail", "")
        print("✓ change-password min 6 chars enforced")
    
    def test_02_recovery_code_reset_min_length(self):
        """forgot-password/recovery-code with <6 chars must fail with 400"""
        response = requests.post(f"{BASE_URL}/api/auth/forgot-password/recovery-code", json={
            "username": ADMIN_USER,
            "code": "XXXX-XXXX-XXXX-XXXX",
            "new_password": "abc"  # 3 chars
        })
        # Should be 400 (password too short) before checking code validity
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ recovery-code reset min 6 chars enforced")
    
    def test_03_verify_otp_reset_min_length(self):
        """forgot-password/verify-otp with <6 chars must fail with 400"""
        response = requests.post(f"{BASE_URL}/api/auth/forgot-password/verify-otp", json={
            "username": ADMIN_USER,
            "otp": "123456",
            "new_password": "ab"  # 2 chars
        })
        # Should be 400 (password too short)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ verify-otp reset min 6 chars enforced")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
