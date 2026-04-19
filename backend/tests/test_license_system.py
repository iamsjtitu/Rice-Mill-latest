"""
License System Tests - Central License Server + Python Web Backend
Tests WhatsApp notification hooks, expiry scheduler, and license stub endpoints.
"""
import pytest
import requests
import os
from datetime import datetime, timedelta
import json

# Central License Server (standalone Node.js Express)
CLS_BASE_URL = "http://localhost:7100"

# Python Web Backend (via REACT_APP_BACKEND_URL)
BACKEND_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials for Central License Server
CLS_EMAIL = "t2@host9x.com"
CLS_PASSWORD = "We@1992!"


class TestCentralLicenseServerAuth:
    """Test authentication for Central License Server"""
    
    def test_cls_health_check(self):
        """Verify Central License Server is running"""
        response = requests.get(f"{CLS_BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "uptime" in data
        print(f"✓ CLS health check passed - uptime: {data['uptime']:.1f}s")
    
    def test_cls_login_success(self):
        """Login to Central License Server with super admin credentials"""
        response = requests.post(f"{CLS_BASE_URL}/api/auth/login", json={
            "email": CLS_EMAIL,
            "password": CLS_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        # Email is at top level, not nested under user
        assert data.get("email") == CLS_EMAIL or data.get("user", {}).get("email") == CLS_EMAIL
        print(f"✓ CLS login successful - token received")
        return data["token"]
    
    def test_cls_login_invalid_credentials(self):
        """Login with invalid credentials should fail"""
        response = requests.post(f"{CLS_BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpass"
        })
        assert response.status_code in [401, 403]
        print(f"✓ CLS invalid login correctly rejected")


@pytest.fixture(scope="module")
def cls_token():
    """Get authentication token for Central License Server"""
    response = requests.post(f"{CLS_BASE_URL}/api/auth/login", json={
        "email": CLS_EMAIL,
        "password": CLS_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("CLS authentication failed")


@pytest.fixture(scope="module")
def cls_headers(cls_token):
    """Headers with auth token for CLS requests"""
    return {
        "Authorization": f"Bearer {cls_token}",
        "Content-Type": "application/json"
    }


class TestCentralLicenseServerLicenses:
    """Test license CRUD and notification hooks"""
    
    test_license_id = None
    
    def test_create_license_with_notification(self, cls_headers):
        """POST /api/admin/licenses - create test license with 5-day expiry"""
        expires_at = (datetime.now() + timedelta(days=5)).isoformat()
        response = requests.post(f"{CLS_BASE_URL}/api/admin/licenses", 
            headers=cls_headers,
            json={
                "customer_name": "TEST_License_Customer",
                "mill_name": "TEST_Mill_Facility",
                "contact": "9999999999",
                "plan": "yearly",
                "expires_at": expires_at,
                "notes": "Test license for automated testing"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert "license" in data
        license = data["license"]
        assert license["customer_name"] == "TEST_License_Customer"
        assert license["mill_name"] == "TEST_Mill_Facility"
        assert license["contact"] == "9999999999"
        assert license["plan"] == "yearly"
        assert license["status"] == "active"
        assert "key" in license
        assert "id" in license
        
        # Store for later tests
        TestCentralLicenseServerLicenses.test_license_id = license["id"]
        print(f"✓ License created: {license['key']} (ID: {license['id']})")
        print(f"  → Notifier should have logged: '[notifier:created:{license['key']}] skipped (NOTIFY_WA_API_KEY not set)'")
    
    def test_test_notify_revoked(self, cls_headers):
        """POST /api/admin/licenses/:id/test-notify with kind=revoked"""
        license_id = TestCentralLicenseServerLicenses.test_license_id
        if not license_id:
            pytest.skip("No test license created")
        
        response = requests.post(f"{CLS_BASE_URL}/api/admin/licenses/{license_id}/test-notify",
            headers=cls_headers,
            json={"kind": "revoked"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == False  # No API key set
        assert data.get("result", {}).get("skipped") == True
        assert data.get("result", {}).get("reason") == "NOTIFY_WA_API_KEY not set"
        print(f"✓ test-notify (revoked) correctly skipped - reason: {data['result']['reason']}")
    
    def test_test_notify_activated(self, cls_headers):
        """POST /api/admin/licenses/:id/test-notify with kind=activated"""
        license_id = TestCentralLicenseServerLicenses.test_license_id
        if not license_id:
            pytest.skip("No test license created")
        
        response = requests.post(f"{CLS_BASE_URL}/api/admin/licenses/{license_id}/test-notify",
            headers=cls_headers,
            json={"kind": "activated"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == False
        assert data.get("result", {}).get("skipped") == True
        assert data.get("result", {}).get("reason") == "NOTIFY_WA_API_KEY not set"
        print(f"✓ test-notify (activated) correctly skipped")
    
    def test_test_notify_expiring(self, cls_headers):
        """POST /api/admin/licenses/:id/test-notify with kind=expiring"""
        license_id = TestCentralLicenseServerLicenses.test_license_id
        if not license_id:
            pytest.skip("No test license created")
        
        response = requests.post(f"{CLS_BASE_URL}/api/admin/licenses/{license_id}/test-notify",
            headers=cls_headers,
            json={"kind": "expiring"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == False
        assert data.get("result", {}).get("skipped") == True
        print(f"✓ test-notify (expiring) correctly skipped")
    
    def test_test_notify_expired(self, cls_headers):
        """POST /api/admin/licenses/:id/test-notify with kind=expired"""
        license_id = TestCentralLicenseServerLicenses.test_license_id
        if not license_id:
            pytest.skip("No test license created")
        
        response = requests.post(f"{CLS_BASE_URL}/api/admin/licenses/{license_id}/test-notify",
            headers=cls_headers,
            json={"kind": "expired"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == False
        assert data.get("result", {}).get("skipped") == True
        print(f"✓ test-notify (expired) correctly skipped")
    
    def test_expiry_scan(self, cls_headers):
        """POST /api/admin/expiry-scan - trigger manual expiry scan"""
        response = requests.post(f"{CLS_BASE_URL}/api/admin/expiry-scan", headers=cls_headers)
        assert response.status_code == 200
        data = response.json()
        assert "warnings" in data
        assert "expired" in data
        assert "skipped" in data
        assert "scanned" in data
        # The 5-day license should be in the 7-day warning window
        # Since NOTIFY_WA_API_KEY is not set, it should be skipped
        print(f"✓ Expiry scan completed - warnings:{data['warnings']}, expired:{data['expired']}, skipped:{data['skipped']}, scanned:{data['scanned']}")
    
    def test_verify_notified_7day_not_persisted(self, cls_headers):
        """Verify notified_7day is NOT set when NOTIFY_WA_API_KEY is missing"""
        license_id = TestCentralLicenseServerLicenses.test_license_id
        if not license_id:
            pytest.skip("No test license created")
        
        # Read database.json directly to check the flag
        with open("/app/central-license-server/database.json", "r") as f:
            db_data = json.load(f)
        
        test_license = next((l for l in db_data["licenses"] if l["id"] == license_id), None)
        assert test_license is not None
        # notified_7day should NOT be set because NOTIFY_WA_API_KEY is not configured
        # This ensures once the key is configured, the notification will fire
        assert test_license.get("notified_7day") is None, \
            f"notified_7day should be null but was: {test_license.get('notified_7day')}"
        print(f"✓ notified_7day correctly NOT persisted (will fire once API key is configured)")
    
    def test_reset_notifications(self, cls_headers):
        """POST /api/admin/licenses/:id/reset-notifications"""
        license_id = TestCentralLicenseServerLicenses.test_license_id
        if not license_id:
            pytest.skip("No test license created")
        
        response = requests.post(f"{CLS_BASE_URL}/api/admin/licenses/{license_id}/reset-notifications",
            headers=cls_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        print(f"✓ reset-notifications successful")
    
    def test_revoke_license(self, cls_headers):
        """POST /api/admin/licenses/:id/revoke"""
        license_id = TestCentralLicenseServerLicenses.test_license_id
        if not license_id:
            pytest.skip("No test license created")
        
        response = requests.post(f"{CLS_BASE_URL}/api/admin/licenses/{license_id}/revoke",
            headers=cls_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert data.get("license", {}).get("status") == "revoked"
        print(f"✓ License revoked - notifier should have logged '[notifier:revoked:...] skipped'")
    
    def test_reactivate_license(self, cls_headers):
        """PUT /api/admin/licenses/:id with status=active (reactivation)"""
        license_id = TestCentralLicenseServerLicenses.test_license_id
        if not license_id:
            pytest.skip("No test license created")
        
        response = requests.put(f"{CLS_BASE_URL}/api/admin/licenses/{license_id}",
            headers=cls_headers,
            json={"status": "active"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert data.get("license", {}).get("status") == "active"
        assert data.get("license", {}).get("revoked_at") is None
        print(f"✓ License reactivated - notifier should have logged '[notifier:reactivated:...] skipped'")
    
    def test_revoke_again(self, cls_headers):
        """PUT /api/admin/licenses/:id with status=revoked (via update)"""
        license_id = TestCentralLicenseServerLicenses.test_license_id
        if not license_id:
            pytest.skip("No test license created")
        
        response = requests.put(f"{CLS_BASE_URL}/api/admin/licenses/{license_id}",
            headers=cls_headers,
            json={"status": "revoked"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert data.get("license", {}).get("status") == "revoked"
        print(f"✓ License revoked via PUT - notifier should have logged '[notifier:revoked:...] skipped'")
    
    def test_update_expiry_resets_notification_flags(self, cls_headers):
        """PUT /api/admin/licenses/:id with extended expires_at resets notification flags"""
        license_id = TestCentralLicenseServerLicenses.test_license_id
        if not license_id:
            pytest.skip("No test license created")
        
        # First reactivate
        requests.put(f"{CLS_BASE_URL}/api/admin/licenses/{license_id}",
            headers=cls_headers,
            json={"status": "active"}
        )
        
        # Extend expiry by 30 days
        new_expiry = (datetime.now() + timedelta(days=30)).isoformat()
        response = requests.put(f"{CLS_BASE_URL}/api/admin/licenses/{license_id}",
            headers=cls_headers,
            json={"expires_at": new_expiry}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        
        # Verify notification flags are reset in database
        with open("/app/central-license-server/database.json", "r") as f:
            db_data = json.load(f)
        
        test_license = next((l for l in db_data["licenses"] if l["id"] == license_id), None)
        assert test_license is not None
        assert test_license.get("notified_7day") is None, "notified_7day should be reset on renewal"
        assert test_license.get("notified_expired") is None, "notified_expired should be reset on renewal"
        print(f"✓ License renewal resets notification flags (notified_7day=null, notified_expired=null)")


class TestCentralLicenseServerCleanup:
    """Cleanup test data"""
    
    def test_delete_test_license(self, cls_headers):
        """Delete the test license from database.json"""
        license_id = TestCentralLicenseServerLicenses.test_license_id
        if not license_id:
            pytest.skip("No test license to delete")
        
        # Read database.json
        with open("/app/central-license-server/database.json", "r") as f:
            db_data = json.load(f)
        
        # Remove test license
        original_count = len(db_data["licenses"])
        db_data["licenses"] = [l for l in db_data["licenses"] if l["id"] != license_id]
        new_count = len(db_data["licenses"])
        
        # Write back
        with open("/app/central-license-server/database.json", "w") as f:
            json.dump(db_data, f, indent=2)
        
        assert new_count == original_count - 1
        print(f"✓ Test license deleted from database.json")


class TestPythonWebBackendLicenseStub:
    """Test Python web backend license stub endpoints"""
    
    def test_license_info_stub(self):
        """GET /api/license/info - returns web deployment stub"""
        response = requests.get(f"{BACKEND_URL}/api/license/info")
        assert response.status_code == 200
        data = response.json()
        
        # Verify stub response structure
        assert data.get("activated") == True
        assert data.get("key") == "WEB-DEPLOYMENT"
        assert data.get("mill_name") == "mill.9x.design (Cloud)"
        assert data.get("customer_name") == "Web Deployment"
        assert data.get("plan") == "lifetime"
        assert data.get("expires_at") is None
        assert data.get("is_master") == True
        assert data.get("machine_fingerprint") == "web-stub"
        assert "pc_info" in data
        assert data["pc_info"]["hostname"] == "web"
        assert data["pc_info"]["platform"] == "web"
        print(f"✓ License info stub returns correct web deployment data")
        print(f"  → Key: {data['key']}, Mill: {data['mill_name']}, Plan: {data['plan']}")
    
    def test_license_heartbeat_stub(self):
        """POST /api/license/heartbeat - returns web deployment stub"""
        response = requests.post(f"{BACKEND_URL}/api/license/heartbeat")
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("active") == True
        assert data.get("note") == "web_deployment"
        print(f"✓ License heartbeat stub returns active=true, note=web_deployment")


class TestCentralLicenseServerLogs:
    """Verify server logs contain expected notifier messages"""
    
    def test_check_server_logs(self):
        """Check /tmp/cls.log for notifier skip messages"""
        try:
            with open("/tmp/cls.log", "r") as f:
                logs = f.read()
            
            # Check for expected log patterns
            has_scheduler_start = "[expiry-scheduler] started" in logs
            print(f"✓ Server logs available")
            print(f"  → Expiry scheduler started: {has_scheduler_start}")
            
            # Look for notifier skip messages (may or may not be present depending on test order)
            if "skipped (NOTIFY_WA_API_KEY not set)" in logs:
                print(f"  → Found notifier skip messages (expected behavior)")
            
            assert has_scheduler_start, "Expiry scheduler should have started"
        except FileNotFoundError:
            pytest.skip("Server log file not found")
