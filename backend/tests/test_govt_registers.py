"""
Test Government Registers Feature - v89.1.0
Tests for Form A, B, E, F, FRK Blending, and Gunny Bag registers
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestGovtRegistersFormA:
    """Form A - Paddy Stock Register (from OSCSC/State Procuring Agency)"""
    
    def test_form_a_get_data(self):
        """GET /api/govt-registers/form-a returns paddy stock register"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/form-a")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "rows" in data, "Response should have 'rows' key"
        assert "summary" in data, "Response should have 'summary' key"
        
        # Validate summary structure
        summary = data["summary"]
        assert "total_received" in summary
        assert "total_milled" in summary
        assert "final_balance" in summary
        assert "total_days" in summary
        print(f"Form A: {len(data['rows'])} rows, Total Received: {summary['total_received']} Qtl")
    
    def test_form_a_with_kms_year_filter(self):
        """GET /api/govt-registers/form-a with kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/form-a?kms_year=2024-2025")
        assert response.status_code == 200
        
        data = response.json()
        assert "rows" in data
        print(f"Form A (2024-2025): {len(data['rows'])} rows")
    
    def test_form_a_row_structure(self):
        """Validate Form A row structure with running balances"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/form-a?kms_year=2024-2025")
        assert response.status_code == 200
        
        data = response.json()
        if len(data["rows"]) > 0:
            row = data["rows"][0]
            required_fields = ["date", "opening_balance", "received_qntl", "bags", 
                              "total_paddy", "milled_qntl", "closing_balance"]
            for field in required_fields:
                assert field in row, f"Row should have '{field}' field"
            print(f"Form A row structure validated: {list(row.keys())}")
    
    def test_form_a_excel_export(self):
        """GET /api/govt-registers/form-a/excel downloads Excel file"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/form-a/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "excel" in content_type or "octet-stream" in content_type, \
            f"Expected Excel content type, got: {content_type}"
        
        content_disp = response.headers.get("content-disposition", "")
        assert "Form_A" in content_disp or "attachment" in content_disp, \
            f"Expected Form_A filename in disposition: {content_disp}"
        print(f"Form A Excel export: {len(response.content)} bytes")


class TestGovtRegistersFormB:
    """Form B - CMR Produced and Delivered Register"""
    
    def test_form_b_get_data(self):
        """GET /api/govt-registers/form-b returns CMR delivery register"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/form-b")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "rows" in data
        assert "summary" in data
        
        summary = data["summary"]
        assert "total_produced" in summary
        assert "total_delivered" in summary
        assert "final_balance" in summary
        print(f"Form B: {len(data['rows'])} rows, Total Produced: {summary['total_produced']} Qtl")
    
    def test_form_b_row_structure(self):
        """Validate Form B row structure"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/form-b")
        assert response.status_code == 200
        
        data = response.json()
        if len(data["rows"]) > 0:
            row = data["rows"][0]
            required_fields = ["date", "opening_balance", "cmr_produced", "total_rice",
                              "cmr_delivered", "closing_balance", "delivered_to"]
            for field in required_fields:
                assert field in row, f"Row should have '{field}' field"
            print(f"Form B row structure validated: {list(row.keys())}")
    
    def test_form_b_excel_export(self):
        """GET /api/govt-registers/form-b/excel downloads Excel file"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/form-b/excel")
        assert response.status_code == 200
        
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "excel" in content_type or "octet-stream" in content_type
        print(f"Form B Excel export: {len(response.content)} bytes")


class TestGovtRegistersFormE:
    """Form E - Miller's Own Paddy Register"""
    
    def test_form_e_get_data(self):
        """GET /api/govt-registers/form-e returns miller own paddy register"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/form-e")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "rows" in data
        assert "summary" in data
        
        summary = data["summary"]
        assert "total_purchased" in summary
        assert "final_balance" in summary
        print(f"Form E: {len(data['rows'])} rows, Total Purchased: {summary['total_purchased']} Qtl")
    
    def test_form_e_row_structure(self):
        """Validate Form E row structure"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/form-e")
        assert response.status_code == 200
        
        data = response.json()
        if len(data["rows"]) > 0:
            row = data["rows"][0]
            required_fields = ["date", "opening_balance", "purchased_qntl", "bags",
                              "total", "closing_balance", "parties", "amount"]
            for field in required_fields:
                assert field in row, f"Row should have '{field}' field"
            print(f"Form E row structure validated: {list(row.keys())}")
    
    def test_form_e_excel_export(self):
        """GET /api/govt-registers/form-e/excel downloads Excel file"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/form-e/excel")
        assert response.status_code == 200
        print(f"Form E Excel export: {len(response.content)} bytes")


class TestGovtRegistersFormF:
    """Form F - Miller's Own Rice Sale Register"""
    
    def test_form_f_get_data(self):
        """GET /api/govt-registers/form-f returns miller own rice sale register"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/form-f")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "rows" in data
        assert "summary" in data
        
        summary = data["summary"]
        assert "total_sold" in summary
        print(f"Form F: {len(data['rows'])} rows, Total Sold: {summary['total_sold']} Qtl")
    
    def test_form_f_row_structure(self):
        """Validate Form F row structure"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/form-f")
        assert response.status_code == 200
        
        data = response.json()
        if len(data["rows"]) > 0:
            row = data["rows"][0]
            required_fields = ["date", "sold_qntl", "parties", "amount"]
            for field in required_fields:
                assert field in row, f"Row should have '{field}' field"
            print(f"Form F row structure validated: {list(row.keys())}")
    
    def test_form_f_excel_export(self):
        """GET /api/govt-registers/form-f/excel downloads Excel file"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/form-f/excel")
        assert response.status_code == 200
        print(f"Form F Excel export: {len(response.content)} bytes")


class TestGovtRegistersFRK:
    """FRK Blending Register - CRUD operations"""
    
    created_frk_id = None
    
    def test_frk_list_entries(self):
        """GET /api/govt-registers/frk lists FRK entries"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/frk")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"FRK Register: {len(data)} entries")
    
    def test_frk_create_entry(self):
        """POST /api/govt-registers/frk creates FRK blending entry"""
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "season": "Kharif",
            "batch_no": f"TEST_FRK_{uuid.uuid4().hex[:6]}",
            "supplier": "TEST_SUPPLIER_FRK",
            "opening_balance": 100,
            "received_qty": 50,
            "issued_for_blending": 30,
            "rice_blended_qty": 300,
            "blend_ratio": "1:100",
            "remark": "Test FRK entry"
        }
        
        response = requests.post(f"{BASE_URL}/api/govt-registers/frk?username=admin", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should have 'id'"
        assert data["batch_no"] == payload["batch_no"]
        assert data["supplier"] == payload["supplier"]
        assert data["opening_balance"] == payload["opening_balance"]
        assert data["received_qty"] == payload["received_qty"]
        assert data["issued_for_blending"] == payload["issued_for_blending"]
        
        # Verify calculated fields
        expected_total = payload["opening_balance"] + payload["received_qty"]
        expected_closing = expected_total - payload["issued_for_blending"]
        assert data["total"] == expected_total, f"Expected total {expected_total}, got {data['total']}"
        assert data["closing_balance"] == expected_closing, f"Expected closing {expected_closing}, got {data['closing_balance']}"
        
        TestGovtRegistersFRK.created_frk_id = data["id"]
        print(f"FRK entry created: {data['id']}, Closing Balance: {data['closing_balance']}")
    
    def test_frk_verify_created_entry(self):
        """Verify FRK entry was persisted"""
        if not TestGovtRegistersFRK.created_frk_id:
            pytest.skip("No FRK entry created")
        
        response = requests.get(f"{BASE_URL}/api/govt-registers/frk")
        assert response.status_code == 200
        
        data = response.json()
        entry_ids = [e["id"] for e in data]
        assert TestGovtRegistersFRK.created_frk_id in entry_ids, "Created entry should be in list"
        print(f"FRK entry verified in list")
    
    def test_frk_update_entry(self):
        """PUT /api/govt-registers/frk/{id} updates FRK entry"""
        if not TestGovtRegistersFRK.created_frk_id:
            pytest.skip("No FRK entry created")
        
        update_payload = {
            "received_qty": 75,
            "issued_for_blending": 50,
            "remark": "Updated test FRK entry"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/govt-registers/frk/{TestGovtRegistersFRK.created_frk_id}?username=admin",
            json=update_payload
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        print(f"FRK entry updated successfully")
    
    def test_frk_verify_update(self):
        """Verify FRK entry was updated"""
        if not TestGovtRegistersFRK.created_frk_id:
            pytest.skip("No FRK entry created")
        
        response = requests.get(f"{BASE_URL}/api/govt-registers/frk")
        assert response.status_code == 200
        
        data = response.json()
        entry = next((e for e in data if e["id"] == TestGovtRegistersFRK.created_frk_id), None)
        assert entry is not None, "Entry should exist"
        assert entry["received_qty"] == 75, f"Expected received_qty 75, got {entry['received_qty']}"
        assert entry["issued_for_blending"] == 50
        print(f"FRK update verified: received_qty={entry['received_qty']}, issued={entry['issued_for_blending']}")
    
    def test_frk_delete_entry(self):
        """DELETE /api/govt-registers/frk/{id} deletes FRK entry"""
        if not TestGovtRegistersFRK.created_frk_id:
            pytest.skip("No FRK entry created")
        
        response = requests.delete(
            f"{BASE_URL}/api/govt-registers/frk/{TestGovtRegistersFRK.created_frk_id}?username=admin&role=admin"
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        print(f"FRK entry deleted successfully")
    
    def test_frk_verify_deletion(self):
        """Verify FRK entry was deleted"""
        if not TestGovtRegistersFRK.created_frk_id:
            pytest.skip("No FRK entry created")
        
        response = requests.get(f"{BASE_URL}/api/govt-registers/frk")
        assert response.status_code == 200
        
        data = response.json()
        entry_ids = [e["id"] for e in data]
        assert TestGovtRegistersFRK.created_frk_id not in entry_ids, "Deleted entry should not be in list"
        print(f"FRK deletion verified")
    
    def test_frk_excel_export(self):
        """GET /api/govt-registers/frk/excel downloads Excel file"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/frk/excel")
        assert response.status_code == 200
        print(f"FRK Excel export: {len(response.content)} bytes")


class TestGovtRegistersGunnyBags:
    """Gunny Bag Register - CRUD operations"""
    
    created_gunny_id = None
    
    def test_gunny_list_entries(self):
        """GET /api/govt-registers/gunny-bags lists gunny bag entries"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/gunny-bags")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Gunny Bag Register: {len(data)} entries")
    
    def test_gunny_create_entry(self):
        """POST /api/govt-registers/gunny-bags creates gunny bag register entry"""
        payload = {
            "date": "2025-01-15",
            "kms_year": "2024-2025",
            "season": "Kharif",
            "bag_type": "new",
            "source": "TEST_OSCSC",
            "opening_balance": 1000,
            "received": 500,
            "used_for_rice": 200,
            "used_for_paddy": 100,
            "damaged": 10,
            "returned": 50,
            "remark": "Test gunny bag entry"
        }
        
        response = requests.post(f"{BASE_URL}/api/govt-registers/gunny-bags?username=admin", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should have 'id'"
        assert data["bag_type"] == payload["bag_type"]
        assert data["source"] == payload["source"]
        assert data["opening_balance"] == payload["opening_balance"]
        assert data["received"] == payload["received"]
        
        # Verify calculated closing balance
        total_in = payload["opening_balance"] + payload["received"]
        total_out = payload["used_for_rice"] + payload["used_for_paddy"] + payload["damaged"] + payload["returned"]
        expected_closing = total_in - total_out
        assert data["closing_balance"] == expected_closing, f"Expected closing {expected_closing}, got {data['closing_balance']}"
        
        TestGovtRegistersGunnyBags.created_gunny_id = data["id"]
        print(f"Gunny bag entry created: {data['id']}, Closing Balance: {data['closing_balance']}")
    
    def test_gunny_verify_created_entry(self):
        """Verify gunny bag entry was persisted"""
        if not TestGovtRegistersGunnyBags.created_gunny_id:
            pytest.skip("No gunny bag entry created")
        
        response = requests.get(f"{BASE_URL}/api/govt-registers/gunny-bags")
        assert response.status_code == 200
        
        data = response.json()
        entry_ids = [e["id"] for e in data]
        assert TestGovtRegistersGunnyBags.created_gunny_id in entry_ids, "Created entry should be in list"
        print(f"Gunny bag entry verified in list")
    
    def test_gunny_update_entry(self):
        """PUT /api/govt-registers/gunny-bags/{id} updates gunny bag entry"""
        if not TestGovtRegistersGunnyBags.created_gunny_id:
            pytest.skip("No gunny bag entry created")
        
        update_payload = {
            "received": 600,
            "used_for_rice": 250,
            "remark": "Updated test gunny bag entry"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/govt-registers/gunny-bags/{TestGovtRegistersGunnyBags.created_gunny_id}?username=admin",
            json=update_payload
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        print(f"Gunny bag entry updated successfully")
    
    def test_gunny_verify_update(self):
        """Verify gunny bag entry was updated"""
        if not TestGovtRegistersGunnyBags.created_gunny_id:
            pytest.skip("No gunny bag entry created")
        
        response = requests.get(f"{BASE_URL}/api/govt-registers/gunny-bags")
        assert response.status_code == 200
        
        data = response.json()
        entry = next((e for e in data if e["id"] == TestGovtRegistersGunnyBags.created_gunny_id), None)
        assert entry is not None, "Entry should exist"
        assert entry["received"] == 600, f"Expected received 600, got {entry['received']}"
        assert entry["used_for_rice"] == 250
        print(f"Gunny bag update verified: received={entry['received']}, used_for_rice={entry['used_for_rice']}")
    
    def test_gunny_delete_entry(self):
        """DELETE /api/govt-registers/gunny-bags/{id} deletes gunny bag entry"""
        if not TestGovtRegistersGunnyBags.created_gunny_id:
            pytest.skip("No gunny bag entry created")
        
        response = requests.delete(
            f"{BASE_URL}/api/govt-registers/gunny-bags/{TestGovtRegistersGunnyBags.created_gunny_id}?username=admin&role=admin"
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        print(f"Gunny bag entry deleted successfully")
    
    def test_gunny_verify_deletion(self):
        """Verify gunny bag entry was deleted"""
        if not TestGovtRegistersGunnyBags.created_gunny_id:
            pytest.skip("No gunny bag entry created")
        
        response = requests.get(f"{BASE_URL}/api/govt-registers/gunny-bags")
        assert response.status_code == 200
        
        data = response.json()
        entry_ids = [e["id"] for e in data]
        assert TestGovtRegistersGunnyBags.created_gunny_id not in entry_ids, "Deleted entry should not be in list"
        print(f"Gunny bag deletion verified")
    
    def test_gunny_excel_export(self):
        """GET /api/govt-registers/gunny-bags/excel downloads Excel file"""
        response = requests.get(f"{BASE_URL}/api/govt-registers/gunny-bags/excel")
        assert response.status_code == 200
        print(f"Gunny Bags Excel export: {len(response.content)} bytes")


class TestGovtRegistersFilters:
    """Test date and filter parameters across all registers"""
    
    def test_form_a_date_filters(self):
        """Test Form A with date range filters"""
        response = requests.get(
            f"{BASE_URL}/api/govt-registers/form-a?date_from=2024-01-01&date_to=2024-12-31"
        )
        assert response.status_code == 200
        print(f"Form A with date filters: {response.status_code}")
    
    def test_form_b_season_filter(self):
        """Test Form B with season filter"""
        response = requests.get(
            f"{BASE_URL}/api/govt-registers/form-b?kms_year=2024-2025&season=Kharif"
        )
        assert response.status_code == 200
        print(f"Form B with season filter: {response.status_code}")
    
    def test_frk_with_filters(self):
        """Test FRK with kms_year filter"""
        response = requests.get(
            f"{BASE_URL}/api/govt-registers/frk?kms_year=2024-2025"
        )
        assert response.status_code == 200
        print(f"FRK with kms_year filter: {response.status_code}")
    
    def test_gunny_with_filters(self):
        """Test Gunny Bags with kms_year and season filters"""
        response = requests.get(
            f"{BASE_URL}/api/govt-registers/gunny-bags?kms_year=2024-2025&season=Kharif"
        )
        assert response.status_code == 200
        print(f"Gunny Bags with filters: {response.status_code}")


class TestGovtRegistersErrorHandling:
    """Test error handling for invalid requests"""
    
    def test_frk_update_nonexistent(self):
        """PUT /api/govt-registers/frk/{id} returns 404 for non-existent entry"""
        response = requests.put(
            f"{BASE_URL}/api/govt-registers/frk/nonexistent-id-12345?username=admin",
            json={"remark": "test"}
        )
        assert response.status_code == 404
        print(f"FRK update non-existent: {response.status_code}")
    
    def test_frk_delete_nonexistent(self):
        """DELETE /api/govt-registers/frk/{id} returns 404 for non-existent entry"""
        response = requests.delete(
            f"{BASE_URL}/api/govt-registers/frk/nonexistent-id-12345?username=admin&role=admin"
        )
        assert response.status_code == 404
        print(f"FRK delete non-existent: {response.status_code}")
    
    def test_gunny_update_nonexistent(self):
        """PUT /api/govt-registers/gunny-bags/{id} returns 404 for non-existent entry"""
        response = requests.put(
            f"{BASE_URL}/api/govt-registers/gunny-bags/nonexistent-id-12345?username=admin",
            json={"remark": "test"}
        )
        assert response.status_code == 404
        print(f"Gunny update non-existent: {response.status_code}")
    
    def test_gunny_delete_nonexistent(self):
        """DELETE /api/govt-registers/gunny-bags/{id} returns 404 for non-existent entry"""
        response = requests.delete(
            f"{BASE_URL}/api/govt-registers/gunny-bags/nonexistent-id-12345?username=admin&role=admin"
        )
        assert response.status_code == 404
        print(f"Gunny delete non-existent: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
