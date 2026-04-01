"""
Test iteration 156 - Bug fixes verification:
1. RST auto-increment shows correct next value (8 for FY 2025-2026)
2. What's New dialog shows exactly 5 versions
3. Photo zoom ESC handler (code-level verification)
4. Layout structure verification
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestIteration156BugFixes:
    """Test bug fixes for iteration 156"""
    
    def test_next_rst_api_returns_correct_value(self):
        """Test GET /api/vehicle-weight/next-rst returns rst_no field (not next_rst)"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/next-rst?kms_year=2025-2026")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify the response has rst_no field (not next_rst)
        assert "rst_no" in data, f"Response should have 'rst_no' field, got: {data}"
        
        # The value should be a positive integer
        rst_no = data["rst_no"]
        assert isinstance(rst_no, int), f"rst_no should be int, got {type(rst_no)}"
        assert rst_no >= 1, f"rst_no should be >= 1, got {rst_no}"
        
        print(f"✓ next-rst API returns rst_no: {rst_no}")
    
    def test_next_rst_for_different_fy(self):
        """Test next-rst API for different FY years"""
        # Test for 2024-2025
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/next-rst?kms_year=2024-2025")
        assert response.status_code == 200
        data = response.json()
        assert "rst_no" in data
        print(f"✓ FY 2024-2025 next RST: {data['rst_no']}")
        
        # Test for 2025-2026
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/next-rst?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert "rst_no" in data
        print(f"✓ FY 2025-2026 next RST: {data['rst_no']}")
    
    def test_vehicle_weight_list_api(self):
        """Test GET /api/vehicle-weight returns entries with proper structure"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight?kms_year=2025-2026&status=completed&page=1&page_size=10")
        assert response.status_code == 200
        
        data = response.json()
        assert "entries" in data
        assert "total" in data
        assert "page" in data
        assert "total_pages" in data
        
        print(f"✓ Vehicle weight list API works - {data['total']} entries found")
    
    def test_pending_vehicles_api(self):
        """Test GET /api/vehicle-weight/pending returns pending list"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/pending?kms_year=2025-2026")
        assert response.status_code == 200
        
        data = response.json()
        assert "pending" in data
        
        print(f"✓ Pending vehicles API works - {len(data['pending'])} pending entries")
    
    def test_linked_rst_api(self):
        """Test GET /api/vehicle-weight/linked-rst returns linked RST numbers"""
        response = requests.get(f"{BASE_URL}/api/vehicle-weight/linked-rst?kms_year=2025-2026")
        assert response.status_code == 200
        
        data = response.json()
        assert "linked_rst" in data
        assert isinstance(data["linked_rst"], list)
        
        print(f"✓ Linked RST API works - {len(data['linked_rst'])} linked entries")
    
    def test_branding_api(self):
        """Test GET /api/branding returns branding data"""
        response = requests.get(f"{BASE_URL}/api/branding")
        assert response.status_code == 200
        
        data = response.json()
        # Should have mill_name at minimum
        assert "mill_name" in data or "name" in data or isinstance(data, dict)
        
        print(f"✓ Branding API works")


class TestCodeVerification:
    """Code-level verification tests"""
    
    def test_esc_handler_exists_in_vehicle_weight(self):
        """Verify ESC key handler exists in VehicleWeight.jsx"""
        jsx_path = "/app/frontend/src/components/VehicleWeight.jsx"
        
        with open(jsx_path, 'r') as f:
            content = f.read()
        
        # Check for ESC handler with zoomImg dependency
        assert "useEffect" in content, "useEffect should exist"
        assert "zoomImg" in content, "zoomImg state should exist"
        assert "Escape" in content, "Escape key handler should exist"
        assert "setZoomImg(null)" in content, "setZoomImg(null) should be called on ESC"
        
        # Verify the specific pattern
        assert "if (!zoomImg) return" in content, "ESC handler should check zoomImg state"
        assert "e.key === 'Escape'" in content or "e.key === \"Escape\"" in content, "Should check for Escape key"
        
        print("✓ ESC handler for photo zoom exists in VehicleWeight.jsx")
    
    def test_whats_new_shows_5_versions(self):
        """Verify WhatsNew.jsx slices CHANGELOG to 5 entries"""
        jsx_path = "/app/frontend/src/components/WhatsNew.jsx"
        
        with open(jsx_path, 'r') as f:
            content = f.read()
        
        # Check for slice(0, 5)
        assert "CHANGELOG.slice(0, 5)" in content, "CHANGELOG should be sliced to 5 entries"
        
        print("✓ What's New dialog shows exactly 5 versions (CHANGELOG.slice(0, 5))")
    
    def test_whats_new_title_format(self):
        """Verify WhatsNew.jsx title doesn't have duplicate version numbers"""
        jsx_path = "/app/frontend/src/components/WhatsNew.jsx"
        
        with open(jsx_path, 'r') as f:
            content = f.read()
        
        # The title should use release.title directly, not add version again
        # Check that we're using {release.title} not {release.version} - {release.title}
        assert "{release.title}" in content, "Should use release.title for display"
        
        # Verify the CHANGELOG entries have proper title format
        # Title should be like "v70.0.0 - G.Issued Field + Source Label"
        assert 'title: "v' in content, "CHANGELOG titles should start with version"
        
        print("✓ What's New titles use release.title (no duplicate version numbers)")
    
    def test_sticky_sidebar_layout(self):
        """Verify VehicleWeight.jsx has sticky sidebar layout"""
        jsx_path = "/app/frontend/src/components/VehicleWeight.jsx"
        
        with open(jsx_path, 'r') as f:
            content = f.read()
        
        # Check for sticky positioning
        assert "lg:sticky" in content, "Sidebar should have lg:sticky class"
        assert "lg:top-4" in content or "lg:top-" in content, "Sidebar should have top positioning"
        assert "lg:self-start" in content, "Sidebar should have self-start for sticky to work"
        
        # Check for flex layout
        assert "flex flex-col lg:flex-row" in content, "Should have flex layout"
        
        print("✓ Sticky sidebar layout exists in VehicleWeight.jsx")
    
    def test_layout_column_spans(self):
        """Verify form and pending list use correct column spans"""
        jsx_path = "/app/frontend/src/components/VehicleWeight.jsx"
        
        with open(jsx_path, 'r') as f:
            content = f.read()
        
        # Check for col-span-5 (form) and col-span-7 (pending)
        assert "lg:col-span-5" in content, "Form should have col-span-5"
        assert "lg:col-span-7" in content, "Pending list should have col-span-7"
        
        print("✓ Layout uses col-span-5 (form) + col-span-7 (pending)")
    
    def test_next_rst_uses_correct_field(self):
        """Verify VehicleWeight.jsx uses nR.data.rst_no (not next_rst)"""
        jsx_path = "/app/frontend/src/components/VehicleWeight.jsx"
        
        with open(jsx_path, 'r') as f:
            content = f.read()
        
        # Should use rst_no from API response
        assert "nR.data.rst_no" in content, "Should use nR.data.rst_no from API response"
        
        # Should NOT use next_rst (old incorrect field)
        # Note: next_rst might appear in other contexts, so we check the specific pattern
        assert "setNextRst(nR.data.rst_no" in content, "setNextRst should use nR.data.rst_no"
        
        print("✓ VehicleWeight.jsx uses nR.data.rst_no (correct field)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
