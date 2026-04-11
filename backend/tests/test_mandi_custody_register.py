"""
Test Mandi Custody Register API endpoints
- GET /api/reports/mandi-custody-register - JSON data
- GET /api/reports/mandi-custody-register/pdf - PDF export
- GET /api/reports/mandi-custody-register/excel - Excel export
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://paddy-ledger-1.preview.emergentagent.com').rstrip('/')


class TestMandiCustodyRegister:
    """Mandi Custody Register API tests"""

    def test_mandi_custody_register_json_returns_200(self):
        """Test JSON endpoint returns 200 with correct structure"""
        response = requests.get(f"{BASE_URL}/api/reports/mandi-custody-register", params={"kms_year": "2025-2026"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify structure
        assert "mandis" in data, "Response should have 'mandis' array"
        assert "rows" in data, "Response should have 'rows' array"
        assert "grand_total" in data, "Response should have 'grand_total'"
        
        # Verify mandis is a list
        assert isinstance(data["mandis"], list), "mandis should be a list"
        
        # Verify rows structure
        assert isinstance(data["rows"], list), "rows should be a list"
        
        print(f"PASS: JSON endpoint returns correct structure with {len(data['mandis'])} mandis and {len(data['rows'])} rows")

    def test_mandi_custody_register_row_structure(self):
        """Test each row has date, mandis dict, total, and prog_total"""
        response = requests.get(f"{BASE_URL}/api/reports/mandi-custody-register", params={"kms_year": "2025-2026"})
        assert response.status_code == 200
        
        data = response.json()
        if len(data["rows"]) > 0:
            row = data["rows"][0]
            assert "date" in row, "Row should have 'date'"
            assert "mandis" in row, "Row should have 'mandis' dict"
            assert "total" in row, "Row should have 'total'"
            assert "prog_total" in row, "Row should have 'prog_total'"
            
            # Verify mandis is a dict
            assert isinstance(row["mandis"], dict), "row.mandis should be a dict"
            
            print(f"PASS: Row structure is correct - date: {row['date']}, total: {row['total']}, prog_total: {row['prog_total']}")
        else:
            print("SKIP: No rows to verify structure")

    def test_prog_total_is_cumulative(self):
        """Test PROG.TOTAL is a running cumulative sum"""
        response = requests.get(f"{BASE_URL}/api/reports/mandi-custody-register", params={"kms_year": "2025-2026"})
        assert response.status_code == 200
        
        data = response.json()
        rows = data["rows"]
        
        if len(rows) >= 2:
            running_total = 0
            for i, row in enumerate(rows):
                running_total += row["total"]
                expected_prog = round(running_total, 2)
                actual_prog = round(row["prog_total"], 2)
                assert abs(actual_prog - expected_prog) < 0.01, f"Row {i}: prog_total {actual_prog} != expected {expected_prog}"
            
            print(f"PASS: PROG.TOTAL is correctly cumulative across {len(rows)} rows")
        else:
            print("SKIP: Not enough rows to verify cumulative calculation")

    def test_total_equals_sum_of_mandis(self):
        """Test TOTAL column equals sum of all mandi values for that day"""
        response = requests.get(f"{BASE_URL}/api/reports/mandi-custody-register", params={"kms_year": "2025-2026"})
        assert response.status_code == 200
        
        data = response.json()
        rows = data["rows"]
        
        for i, row in enumerate(rows):
            mandi_sum = sum(row["mandis"].values())
            expected_total = round(mandi_sum, 2)
            actual_total = round(row["total"], 2)
            assert abs(actual_total - expected_total) < 0.01, f"Row {i}: total {actual_total} != sum of mandis {expected_total}"
        
        print(f"PASS: TOTAL column correctly sums mandi values for all {len(rows)} rows")

    def test_grand_total_equals_last_prog_total(self):
        """Test grand_total equals the last row's prog_total"""
        response = requests.get(f"{BASE_URL}/api/reports/mandi-custody-register", params={"kms_year": "2025-2026"})
        assert response.status_code == 200
        
        data = response.json()
        rows = data["rows"]
        
        if len(rows) > 0:
            last_prog_total = round(rows[-1]["prog_total"], 2)
            grand_total = round(data["grand_total"], 2)
            assert abs(grand_total - last_prog_total) < 0.01, f"grand_total {grand_total} != last prog_total {last_prog_total}"
            print(f"PASS: grand_total ({grand_total}) equals last prog_total")
        else:
            print("SKIP: No rows to verify grand_total")

    def test_pdf_export_returns_200(self):
        """Test PDF export endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/reports/mandi-custody-register/pdf", params={"kms_year": "2025-2026"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Verify content type
        content_type = response.headers.get("content-type", "")
        assert "pdf" in content_type.lower(), f"Expected PDF content type, got {content_type}"
        
        # Verify content disposition
        content_disp = response.headers.get("content-disposition", "")
        assert "mandi_custody_register" in content_disp.lower(), f"Expected filename in content-disposition, got {content_disp}"
        
        # Verify file size is reasonable
        assert len(response.content) > 1000, f"PDF file too small: {len(response.content)} bytes"
        
        print(f"PASS: PDF export returns valid PDF ({len(response.content)} bytes)")

    def test_excel_export_returns_200(self):
        """Test Excel export endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/reports/mandi-custody-register/excel", params={"kms_year": "2025-2026"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Verify content type
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type.lower() or "excel" in content_type.lower(), f"Expected Excel content type, got {content_type}"
        
        # Verify content disposition
        content_disp = response.headers.get("content-disposition", "")
        assert "mandi_custody_register" in content_disp.lower(), f"Expected filename in content-disposition, got {content_disp}"
        
        # Verify file size is reasonable
        assert len(response.content) > 1000, f"Excel file too small: {len(response.content)} bytes"
        
        print(f"PASS: Excel export returns valid Excel ({len(response.content)} bytes)")

    def test_date_filter_works(self):
        """Test date_from and date_to filters work"""
        # First get all data
        response_all = requests.get(f"{BASE_URL}/api/reports/mandi-custody-register", params={"kms_year": "2025-2026"})
        assert response_all.status_code == 200
        data_all = response_all.json()
        
        if len(data_all["rows"]) >= 2:
            # Get first date
            first_date = data_all["rows"][0]["date"]
            
            # Filter to only first date
            response_filtered = requests.get(f"{BASE_URL}/api/reports/mandi-custody-register", params={
                "kms_year": "2025-2026",
                "date_from": first_date,
                "date_to": first_date
            })
            assert response_filtered.status_code == 200
            data_filtered = response_filtered.json()
            
            # Should have only 1 row
            assert len(data_filtered["rows"]) == 1, f"Expected 1 row, got {len(data_filtered['rows'])}"
            assert data_filtered["rows"][0]["date"] == first_date
            
            print(f"PASS: Date filter works - filtered to {first_date}")
        else:
            print("SKIP: Not enough rows to test date filter")

    def test_empty_kms_year_returns_data(self):
        """Test endpoint works without kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/reports/mandi-custody-register")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "mandis" in data
        assert "rows" in data
        assert "grand_total" in data
        
        print(f"PASS: Endpoint works without kms_year filter")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
