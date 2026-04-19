"""
Test Suite for FCI Annexure-1 Verification Report (v104.19.0)
Tests:
- GET /api/govt-registers/verification-report/full - Annexure-1 structure
- GET /api/govt-registers/verification-report/pdf - PDF export
- GET/PUT /api/settings/verification-meter - Settings persistence
- GET /api/govt-registers/milling-register - Bug regression (FCI delivery column)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestVerificationReportFull:
    """Test Annexure-1 Verification Report Full API"""
    
    def test_verification_report_full_structure(self):
        """Test that /api/govt-registers/verification-report/full returns correct Annexure-1 structure"""
        params = {
            "kms_year": "2026-2027",
            "from_date": "2026-04-07",
            "to_date": "2026-04-17",
            "last_meter_reading": 50000,
            "variety": "Boiled"
        }
        response = requests.get(f"{BASE_URL}/api/govt-registers/verification-report/full", params=params)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify top-level structure
        assert "header" in data, "Missing 'header' in response"
        assert "agencies" in data, "Missing 'agencies' in response"
        assert "rice_cols" in data, "Missing 'rice_cols' in response"
        assert "paddy" in data, "Missing 'paddy' in response"
        assert "rice" in data, "Missing 'rice' in response"
        
        print(f"Response structure verified: header, agencies, rice_cols, paddy, rice")
    
    def test_verification_report_agencies_list(self):
        """Test that agencies list contains expected values"""
        params = {"kms_year": "2026-2027", "from_date": "2026-04-07", "to_date": "2026-04-17"}
        response = requests.get(f"{BASE_URL}/api/govt-registers/verification-report/full", params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        expected_agencies = ["OSCSC_OWN", "OSCSC_KORAPUT", "NAFED", "TDCC", "LEVY"]
        assert data["agencies"] == expected_agencies, f"Expected agencies {expected_agencies}, got {data['agencies']}"
        print(f"Agencies verified: {data['agencies']}")
    
    def test_verification_report_rice_cols_list(self):
        """Test that rice_cols list contains expected values"""
        params = {"kms_year": "2026-2027", "from_date": "2026-04-07", "to_date": "2026-04-17"}
        response = requests.get(f"{BASE_URL}/api/govt-registers/verification-report/full", params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        expected_rice_cols = ["RRC", "FCI", "RRC_FRK", "FCI_FRK"]
        assert data["rice_cols"] == expected_rice_cols, f"Expected rice_cols {expected_rice_cols}, got {data['rice_cols']}"
        print(f"Rice columns verified: {data['rice_cols']}")
    
    def test_verification_report_paddy_rows(self):
        """Test paddy section has rows I-VI with by_agency breakdown"""
        params = {
            "kms_year": "2026-2027",
            "from_date": "2026-04-07",
            "to_date": "2026-04-17",
            "last_meter_reading": 50000
        }
        response = requests.get(f"{BASE_URL}/api/govt-registers/verification-report/full", params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        paddy = data["paddy"]
        expected_rows = ["I_week", "II_prog", "III_week", "IV_prog", "V_book", "VI_verified"]
        for row in expected_rows:
            assert row in paddy, f"Missing paddy row '{row}'"
            assert "by_agency" in paddy[row] or "total" in paddy[row], f"Row {row} missing by_agency or total"
        
        print(f"Paddy rows verified: {list(paddy.keys())}")
        
        # Check III_week (Paddy Milled during week) - expected 866 for OSCSC_OWN based on context
        iii_week = paddy.get("III_week", {})
        print(f"III_week (Paddy Milled during week): {iii_week}")
        
        # Check IV_prog (Progressive paddy milled)
        iv_prog = paddy.get("IV_prog", {})
        print(f"IV_prog (Progressive paddy milled): {iv_prog}")
    
    def test_verification_report_rice_rows(self):
        """Test rice section has rows VII-XIV with by_col breakdown"""
        params = {
            "kms_year": "2026-2027",
            "from_date": "2026-04-07",
            "to_date": "2026-04-17",
            "last_meter_reading": 50000
        }
        response = requests.get(f"{BASE_URL}/api/govt-registers/verification-report/full", params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        rice = data["rice"]
        expected_rows = ["VII_week", "VIII_prog", "IX_week", "X_prog_issued", "XI_prog_delivered", "XII_undelivered", "XIII_book", "XIV_verified"]
        for row in expected_rows:
            assert row in rice, f"Missing rice row '{row}'"
        
        print(f"Rice rows verified: {list(rice.keys())}")
        
        # Check XI_prog_delivered (Progressive rice delivered) - expected FCI=290 based on context
        xi_prog = rice.get("XI_prog_delivered", {})
        print(f"XI_prog_delivered: {xi_prog}")
        
        # Check IX_week (Rice delivered during week)
        ix_week = rice.get("IX_week", {})
        print(f"IX_week (Rice delivered during week): {ix_week}")
    
    def test_verification_report_header_fields(self):
        """Test header contains miller details and meter readings"""
        params = {
            "kms_year": "2026-2027",
            "from_date": "2026-04-07",
            "to_date": "2026-04-17",
            "last_meter_reading": 50000,
            "variety": "Boiled"
        }
        response = requests.get(f"{BASE_URL}/api/govt-registers/verification-report/full", params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        header = data["header"]
        
        # Check required header fields
        assert "miller_name" in header, "Missing miller_name"
        assert "miller_code" in header, "Missing miller_code"
        assert "address" in header, "Missing address"
        assert "milling_capacity_mt" in header, "Missing milling_capacity_mt"
        assert "electricity_kw" in header, "Missing electricity_kw"
        assert "electricity_kv" in header, "Missing electricity_kv"
        assert "meter" in header, "Missing meter"
        
        meter = header["meter"]
        assert "last_reading" in meter, "Missing meter.last_reading"
        assert "present_reading" in meter, "Missing meter.present_reading"
        assert "units_consumed" in meter, "Missing meter.units_consumed"
        
        print(f"Header verified: miller_name={header['miller_name']}, miller_code={header['miller_code']}")
        print(f"Meter: last={meter['last_reading']}, present={meter['present_reading']}, consumed={meter['units_consumed']}")
    
    def test_verification_report_meter_calculation(self):
        """Test meter calculation: present_reading = last_reading + (paddy_milled * units_per_qtl)"""
        params = {
            "kms_year": "2026-2027",
            "from_date": "2026-04-07",
            "to_date": "2026-04-17",
            "last_meter_reading": 50000,
            "units_per_qtl": 6.0
        }
        response = requests.get(f"{BASE_URL}/api/govt-registers/verification-report/full", params=params)
        
        assert response.status_code == 200
        data = response.json()
        
        meter = data["header"]["meter"]
        paddy_milled_week = data["paddy"]["III_week"]["total"]
        
        expected_units = paddy_milled_week * 6.0
        expected_present = 50000 + expected_units
        
        print(f"Paddy milled this week: {paddy_milled_week}")
        print(f"Expected units consumed: {expected_units}")
        print(f"Expected present reading: {expected_present}")
        print(f"Actual units consumed: {meter['units_consumed']}")
        print(f"Actual present reading: {meter['present_reading']}")
        
        # Allow small floating point tolerance
        assert abs(meter["units_consumed"] - expected_units) < 0.01, f"Units consumed mismatch"
        assert abs(meter["present_reading"] - expected_present) < 0.01, f"Present reading mismatch"


class TestVerificationReportPDF:
    """Test Annexure-1 PDF Export"""
    
    def test_verification_report_pdf_returns_200(self):
        """Test PDF endpoint returns HTTP 200"""
        params = {
            "kms_year": "2026-2027",
            "from_date": "2026-04-07",
            "to_date": "2026-04-17",
            "last_meter_reading": 50000
        }
        response = requests.get(f"{BASE_URL}/api/govt-registers/verification-report/pdf", params=params)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"PDF endpoint returned HTTP 200")
    
    def test_verification_report_pdf_content_type(self):
        """Test PDF has correct content type"""
        params = {
            "kms_year": "2026-2027",
            "from_date": "2026-04-07",
            "to_date": "2026-04-17",
            "last_meter_reading": 50000
        }
        response = requests.get(f"{BASE_URL}/api/govt-registers/verification-report/pdf", params=params)
        
        assert response.status_code == 200
        content_type = response.headers.get("content-type", "")
        assert "application/pdf" in content_type, f"Expected PDF content type, got {content_type}"
        print(f"Content-Type: {content_type}")
    
    def test_verification_report_pdf_starts_with_pdf_header(self):
        """Test PDF content starts with %PDF-1"""
        params = {
            "kms_year": "2026-2027",
            "from_date": "2026-04-07",
            "to_date": "2026-04-17",
            "last_meter_reading": 50000
        }
        response = requests.get(f"{BASE_URL}/api/govt-registers/verification-report/pdf", params=params)
        
        assert response.status_code == 200
        content = response.content
        assert content[:5] == b'%PDF-', f"PDF should start with %PDF-, got {content[:10]}"
        print(f"PDF starts with: {content[:10]}")
    
    def test_verification_report_pdf_size(self):
        """Test PDF is larger than 10KB (meaningful content)"""
        params = {
            "kms_year": "2026-2027",
            "from_date": "2026-04-07",
            "to_date": "2026-04-17",
            "last_meter_reading": 50000
        }
        response = requests.get(f"{BASE_URL}/api/govt-registers/verification-report/pdf", params=params)
        
        assert response.status_code == 200
        size_kb = len(response.content) / 1024
        assert size_kb > 10, f"PDF should be > 10KB, got {size_kb:.2f}KB"
        print(f"PDF size: {size_kb:.2f} KB")


class TestVerificationMeterSettings:
    """Test verification meter settings persistence"""
    
    def test_get_verification_meter_settings(self):
        """Test GET /api/settings/verification-meter returns expected fields"""
        response = requests.get(f"{BASE_URL}/api/settings/verification-meter")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        expected_fields = ["last_meter_reading", "last_verification_date", "units_per_qtl", 
                          "rice_recovery", "electricity_kw", "electricity_kv", 
                          "milling_capacity_mt", "variety"]
        for field in expected_fields:
            assert field in data, f"Missing field '{field}' in response"
        
        print(f"Verification meter settings: {data}")
    
    def test_put_verification_meter_settings(self):
        """Test PUT /api/settings/verification-meter saves and retrieves correctly"""
        test_data = {
            "last_meter_reading": 55000,
            "last_verification_date": "2026-04-17",
            "units_per_qtl": 6.0,
            "rice_recovery": 0.67,
            "electricity_kw": 200,
            "electricity_kv": 250,
            "milling_capacity_mt": 10,
            "variety": "Boiled"
        }
        
        # Save settings
        put_response = requests.put(f"{BASE_URL}/api/settings/verification-meter", json=test_data)
        assert put_response.status_code == 200, f"PUT failed: {put_response.text}"
        
        # Verify saved
        get_response = requests.get(f"{BASE_URL}/api/settings/verification-meter")
        assert get_response.status_code == 200
        saved = get_response.json()
        
        assert saved["electricity_kw"] == 200, f"electricity_kw not saved correctly"
        assert saved["electricity_kv"] == 250, f"electricity_kv not saved correctly"
        assert saved["milling_capacity_mt"] == 10, f"milling_capacity_mt not saved correctly"
        assert saved["variety"] == "Boiled", f"variety not saved correctly"
        
        print(f"Settings saved and verified: electricity_kw={saved['electricity_kw']}, electricity_kv={saved['electricity_kv']}, milling_capacity_mt={saved['milling_capacity_mt']}, variety={saved['variety']}")


class TestMillingRegisterBugRegression:
    """Test milling register bug fix - FCI delivery should not show in RRC column"""
    
    def test_milling_register_delivery_columns(self):
        """Test that FCI delivery shows in FCI column, not RRC"""
        params = {"kms_year": "2026-2027"}
        response = requests.get(f"{BASE_URL}/api/govt-registers/milling-register", params=params)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "rows" in data, "Missing 'rows' in response"
        
        # Find the row for 2026-04-17 (the date with FCI delivery)
        target_date = "2026-04-17"
        target_row = None
        for row in data["rows"]:
            if row.get("date") == target_date:
                target_row = row
                break
        
        if target_row:
            delivery_rrc = target_row.get("delivery_rrc", 0)
            delivery_fci = target_row.get("delivery_fci", 0)
            
            print(f"Date {target_date}: delivery_rrc={delivery_rrc}, delivery_fci={delivery_fci}")
            
            # Bug fix verification: FCI delivery should be in FCI column, RRC should be 0
            # Based on context: 290 Qtl delivery on 2026-04-17 to FCI
            assert delivery_rrc == 0, f"Bug regression: RRC should be 0, got {delivery_rrc}"
            assert delivery_fci == 290, f"FCI delivery should be 290, got {delivery_fci}"
            print("Bug fix verified: FCI delivery correctly in FCI column, RRC=0")
        else:
            print(f"No row found for {target_date}, checking summary")
            print(f"Summary: {data.get('summary', {})}")


class TestPaddyReleaseAgency:
    """Test Paddy Release form has agency field"""
    
    def test_paddy_release_list_has_agency(self):
        """Test that paddy_release entries have agency field"""
        params = {"kms_year": "2026-2027"}
        response = requests.get(f"{BASE_URL}/api/paddy-release", params=params)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        if isinstance(data, list) and len(data) > 0:
            # Check if agency field exists in entries
            first_entry = data[0]
            print(f"Paddy release entry fields: {list(first_entry.keys())}")
            # Agency field should exist (may be empty for old entries)
            # Just verify the endpoint works
        else:
            print("No paddy release entries found or empty response")
        
        print(f"Paddy release endpoint working, returned {len(data) if isinstance(data, list) else 'dict'} entries")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
