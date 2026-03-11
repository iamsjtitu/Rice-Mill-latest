"""
Iteration 52: Test Private Paddy New Features
- g_issued, cash_paid, diesel_paid fields in paddy purchase
- Auto gunny bag entries (BAG→IN, G.Issued→OUT) on create/update/delete
- Export endpoints still working
- Party summary API
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPrivatePaddyNewFields:
    """Test g_issued, cash_paid, diesel_paid fields in private paddy purchase"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_paddy_ids = []
        yield
        # Cleanup test data
        for paddy_id in self.test_paddy_ids:
            try:
                requests.delete(f"{BASE_URL}/api/private-paddy/{paddy_id}")
            except:
                pass
    
    def test_01_create_paddy_with_new_fields(self):
        """Create paddy entry with g_issued, cash_paid, diesel_paid and verify response"""
        payload = {
            "date": "2026-01-15",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "party_name": "TEST_Party_Iter52",
            "truck_no": "OD01AB1234",
            "agent_name": "TEST_Agent",
            "mandi_name": "TEST_Mandi",
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2500,
            "g_issued": 10,
            "cash_paid": 5000,
            "diesel_paid": 2000,
            "paid_amount": 0,
            "remark": "Test entry for iteration 52"
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        self.test_paddy_ids.append(data["id"])
        
        # Verify new fields are returned correctly
        assert data["g_issued"] == 10, f"g_issued mismatch: {data.get('g_issued')}"
        assert data["cash_paid"] == 5000, f"cash_paid mismatch: {data.get('cash_paid')}"
        assert data["diesel_paid"] == 2000, f"diesel_paid mismatch: {data.get('diesel_paid')}"
        
        # Verify other calculated fields
        assert data["bag"] == 50
        assert data["party_name"] == "TEST_Party_Iter52"
        assert "total_amount" in data
        print(f"PASS: Paddy created with g_issued={data['g_issued']}, cash_paid={data['cash_paid']}, diesel_paid={data['diesel_paid']}")
    
    def test_02_get_paddy_returns_new_fields(self):
        """Verify GET returns paddy entries with new fields"""
        # Create entry first
        payload = {
            "date": "2026-01-15",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "party_name": "TEST_Party_Get_Fields",
            "kg": 3000,
            "bag": 30,
            "rate_per_qntl": 2600,
            "g_issued": 5,
            "cash_paid": 3000,
            "diesel_paid": 1500
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert create_resp.status_code == 200
        created = create_resp.json()
        self.test_paddy_ids.append(created["id"])
        
        # GET and verify
        get_resp = requests.get(f"{BASE_URL}/api/private-paddy?party_name=TEST_Party_Get_Fields")
        assert get_resp.status_code == 200
        
        items = get_resp.json()
        assert len(items) > 0, "No items returned"
        
        item = items[0]
        assert item["g_issued"] == 5
        assert item["cash_paid"] == 3000
        assert item["diesel_paid"] == 1500
        print(f"PASS: GET returns new fields correctly")
    
    def test_03_update_paddy_preserves_new_fields(self):
        """Update paddy and verify new fields are updated correctly"""
        # Create entry
        payload = {
            "date": "2026-01-15",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "party_name": "TEST_Party_Update",
            "kg": 4000,
            "bag": 40,
            "rate_per_qntl": 2500,
            "g_issued": 8,
            "cash_paid": 4000,
            "diesel_paid": 1000
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert create_resp.status_code == 200
        created = create_resp.json()
        self.test_paddy_ids.append(created["id"])
        
        # Update the entry
        update_payload = {
            "g_issued": 15,
            "cash_paid": 8000,
            "diesel_paid": 3000
        }
        
        update_resp = requests.put(f"{BASE_URL}/api/private-paddy/{created['id']}", json=update_payload)
        assert update_resp.status_code == 200
        
        updated = update_resp.json()
        assert updated["g_issued"] == 15
        assert updated["cash_paid"] == 8000
        assert updated["diesel_paid"] == 3000
        print(f"PASS: Update correctly modifies new fields")


class TestGunnyBagAutoCreation:
    """Test auto gunny bag entries when creating/updating/deleting paddy"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_paddy_ids = []
        yield
        # Cleanup test data - this also triggers gunny bag deletion
        for paddy_id in self.test_paddy_ids:
            try:
                requests.delete(f"{BASE_URL}/api/private-paddy/{paddy_id}")
            except:
                pass
    
    def test_04_create_paddy_creates_gunny_entries(self):
        """Creating paddy with bag=50, g_issued=10 should create 2 gunny entries"""
        payload = {
            "date": "2026-01-16",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "party_name": "TEST_GunnyAuto_Create",
            "truck_no": "OD02XY9999",
            "kg": 5000,
            "bag": 50,
            "rate_per_qntl": 2500,
            "g_issued": 10
        }
        
        response = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        created = response.json()
        paddy_id = created["id"]
        self.test_paddy_ids.append(paddy_id)
        
        # Query gunny bags for linked entries
        gunny_resp = requests.get(f"{BASE_URL}/api/gunny-bags")
        assert gunny_resp.status_code == 200
        
        gunny_entries = gunny_resp.json()
        linked = [g for g in gunny_entries if g.get("linked_entry_id") == paddy_id]
        
        assert len(linked) == 2, f"Expected 2 gunny entries, got {len(linked)}"
        
        # Check IN entry (bag=50)
        in_entries = [g for g in linked if g["txn_type"] == "in"]
        assert len(in_entries) == 1, "No IN entry found"
        assert in_entries[0]["quantity"] == 50, f"IN quantity mismatch: {in_entries[0]['quantity']}"
        
        # Check OUT entry (g_issued=10)
        out_entries = [g for g in linked if g["txn_type"] == "out"]
        assert len(out_entries) == 1, "No OUT entry found"
        assert out_entries[0]["quantity"] == 10, f"OUT quantity mismatch: {out_entries[0]['quantity']}"
        
        print(f"PASS: Gunny auto-creation: IN={in_entries[0]['quantity']}, OUT={out_entries[0]['quantity']}")
    
    def test_05_update_paddy_recreates_gunny_entries(self):
        """Updating paddy should re-create gunny entries with new values"""
        # Create entry
        payload = {
            "date": "2026-01-16",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "party_name": "TEST_GunnyAuto_Update",
            "kg": 4000,
            "bag": 40,
            "rate_per_qntl": 2500,
            "g_issued": 5
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert create_resp.status_code == 200
        created = create_resp.json()
        paddy_id = created["id"]
        self.test_paddy_ids.append(paddy_id)
        
        # Update with new bag and g_issued values
        update_payload = {
            "bag": 60,
            "g_issued": 15
        }
        
        update_resp = requests.put(f"{BASE_URL}/api/private-paddy/{paddy_id}", json=update_payload)
        assert update_resp.status_code == 200
        
        # Query gunny bags again
        gunny_resp = requests.get(f"{BASE_URL}/api/gunny-bags")
        assert gunny_resp.status_code == 200
        
        gunny_entries = gunny_resp.json()
        linked = [g for g in gunny_entries if g.get("linked_entry_id") == paddy_id]
        
        assert len(linked) == 2, f"Expected 2 gunny entries after update, got {len(linked)}"
        
        in_entries = [g for g in linked if g["txn_type"] == "in"]
        out_entries = [g for g in linked if g["txn_type"] == "out"]
        
        assert in_entries[0]["quantity"] == 60, f"Updated IN quantity should be 60, got {in_entries[0]['quantity']}"
        assert out_entries[0]["quantity"] == 15, f"Updated OUT quantity should be 15, got {out_entries[0]['quantity']}"
        
        print(f"PASS: Gunny re-created after update: IN={in_entries[0]['quantity']}, OUT={out_entries[0]['quantity']}")
    
    def test_06_delete_paddy_deletes_gunny_entries(self):
        """Deleting paddy should also delete linked gunny entries"""
        # Create entry
        payload = {
            "date": "2026-01-16",
            "kms_year": "2025-2026",
            "season": "Kharif",
            "party_name": "TEST_GunnyAuto_Delete",
            "kg": 3000,
            "bag": 30,
            "rate_per_qntl": 2500,
            "g_issued": 8
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/private-paddy?username=admin&role=admin", json=payload)
        assert create_resp.status_code == 200
        created = create_resp.json()
        paddy_id = created["id"]
        
        # Verify gunny entries exist
        gunny_resp = requests.get(f"{BASE_URL}/api/gunny-bags")
        gunny_entries = gunny_resp.json()
        linked_before = [g for g in gunny_entries if g.get("linked_entry_id") == paddy_id]
        assert len(linked_before) == 2, "Gunny entries should exist before delete"
        
        # Delete the paddy entry
        delete_resp = requests.delete(f"{BASE_URL}/api/private-paddy/{paddy_id}")
        assert delete_resp.status_code == 200
        
        # Verify gunny entries are also deleted
        gunny_resp2 = requests.get(f"{BASE_URL}/api/gunny-bags")
        gunny_entries2 = gunny_resp2.json()
        linked_after = [g for g in gunny_entries2 if g.get("linked_entry_id") == paddy_id]
        
        assert len(linked_after) == 0, f"Gunny entries should be deleted, but found {len(linked_after)}"
        print(f"PASS: Gunny entries deleted with paddy entry")


class TestExportEndpoints:
    """Test that export endpoints still work with new fields"""
    
    def test_07_private_paddy_excel_export(self):
        """GET /api/private-paddy/excel returns 200"""
        response = requests.get(f"{BASE_URL}/api/private-paddy/excel")
        assert response.status_code == 200, f"Excel export failed: {response.status_code}"
        
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "application/vnd" in content_type, f"Invalid content type: {content_type}"
        print(f"PASS: Excel export returns 200")
    
    def test_08_private_paddy_pdf_export(self):
        """GET /api/private-paddy/pdf returns 200"""
        response = requests.get(f"{BASE_URL}/api/private-paddy/pdf")
        assert response.status_code == 200, f"PDF export failed: {response.status_code}"
        
        content_type = response.headers.get("content-type", "")
        assert "pdf" in content_type.lower(), f"Invalid content type: {content_type}"
        print(f"PASS: PDF export returns 200")
    
    def test_09_party_summary_api(self):
        """GET /api/private-trading/party-summary returns valid JSON"""
        response = requests.get(f"{BASE_URL}/api/private-trading/party-summary")
        assert response.status_code == 200, f"Party summary failed: {response.status_code}"
        
        data = response.json()
        assert "parties" in data, "Response missing 'parties' key"
        assert "totals" in data, "Response missing 'totals' key"
        print(f"PASS: Party summary returns valid JSON with {len(data['parties'])} parties")
    
    def test_10_rice_sales_excel_export(self):
        """GET /api/rice-sales/excel returns 200"""
        response = requests.get(f"{BASE_URL}/api/rice-sales/excel")
        assert response.status_code == 200, f"Rice Excel export failed: {response.status_code}"
        print(f"PASS: Rice sales Excel export returns 200")
    
    def test_11_rice_sales_pdf_export(self):
        """GET /api/rice-sales/pdf returns 200"""
        response = requests.get(f"{BASE_URL}/api/rice-sales/pdf")
        assert response.status_code == 200, f"Rice PDF export failed: {response.status_code}"
        print(f"PASS: Rice sales PDF export returns 200")


class TestReportConfigFields:
    """Verify report config has new fields for g_issued, cash_paid, diesel_paid"""
    
    def test_12_report_config_has_new_columns(self):
        """Verify private_paddy_report in report_config.json has new columns"""
        import json
        config_path = "/app/shared/report_config.json"
        
        with open(config_path, 'r') as f:
            config = json.load(f)
        
        assert "private_paddy_report" in config, "Missing private_paddy_report in config"
        
        columns = config["private_paddy_report"]["columns"]
        field_names = [c["field"] for c in columns]
        
        assert "g_issued" in field_names, "Missing g_issued column in config"
        assert "cash_paid" in field_names, "Missing cash_paid column in config"
        assert "diesel_paid" in field_names, "Missing diesel_paid column in config"
        
        # Verify total 14 columns
        assert len(columns) == 14, f"Expected 14 columns, got {len(columns)}"
        
        print(f"PASS: Report config has all 14 columns including g_issued, cash_paid, diesel_paid")


class TestExistingDataIntegrity:
    """Test existing data is not broken by new features"""
    
    def test_13_existing_paddy_entries_accessible(self):
        """GET /api/private-paddy should return existing entries"""
        response = requests.get(f"{BASE_URL}/api/private-paddy")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: Found {len(data)} existing paddy entries")
    
    def test_14_existing_rice_sales_accessible(self):
        """GET /api/rice-sales should return existing entries"""
        response = requests.get(f"{BASE_URL}/api/rice-sales")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: Found {len(data)} existing rice sale entries")
    
    def test_15_existing_gunny_bags_accessible(self):
        """GET /api/gunny-bags should return existing entries"""
        response = requests.get(f"{BASE_URL}/api/gunny-bags")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: Found {len(data)} existing gunny bag entries")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
