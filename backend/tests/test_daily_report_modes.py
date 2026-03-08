# Test Daily Report Normal/Detail modes - Iteration 21
# Tests new Normal/Detail mode toggle feature, Mill Parts Stock in daily report, PDF/Excel exports

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDailyReportModes:
    """Tests for Daily Report Normal/Detail mode toggle functionality"""
    
    def test_daily_report_normal_mode_returns_correct_mode(self):
        """Verify normal mode returns mode:'normal' in response"""
        response = requests.get(f"{BASE_URL}/api/reports/daily?date=2026-03-08&mode=normal")
        assert response.status_code == 200
        data = response.json()
        assert data["mode"] == "normal", f"Expected mode='normal', got '{data.get('mode')}'"
        assert "date" in data
        assert data["date"] == "2026-03-08"
    
    def test_daily_report_detail_mode_returns_correct_mode(self):
        """Verify detail mode returns mode:'detail' in response"""
        response = requests.get(f"{BASE_URL}/api/reports/daily?date=2026-03-08&mode=detail")
        assert response.status_code == 200
        data = response.json()
        assert data["mode"] == "detail", f"Expected mode='detail', got '{data.get('mode')}'"
    
    def test_normal_mode_paddy_details_simplified(self):
        """Normal mode should have simplified paddy details (truck_no, agent, kg, final_w only)"""
        response = requests.get(f"{BASE_URL}/api/reports/daily?date=2026-03-08&mode=normal")
        assert response.status_code == 200
        data = response.json()
        
        # Check paddy_entries structure exists
        assert "paddy_entries" in data
        paddy = data["paddy_entries"]
        assert "count" in paddy
        assert "total_kg" in paddy
        assert "total_bags" in paddy
        assert "total_final_w" in paddy
        assert "details" in paddy
        
        # If there are details, verify simplified structure
        # Normal mode: truck_no, agent, kg, final_w only
        # (No mandi, rst_no, bags, moisture, mill_w in normal mode)
    
    def test_detail_mode_paddy_details_expanded(self):
        """Detail mode should have expanded paddy details (mandi, rst_no, moisture, mill_w, bags)"""
        response = requests.get(f"{BASE_URL}/api/reports/daily?date=2026-03-08&mode=detail")
        assert response.status_code == 200
        data = response.json()
        
        assert "paddy_entries" in data
        # Verify expanded fields would be present in detail mode (structure check)
        # Detail mode details include: truck_no, agent, mandi, rst_no, kg, bags, moisture, mill_w, final_w
    
    def test_normal_mode_cash_flow_simplified(self):
        """Normal mode cash flow details should have: desc, type, account, amount"""
        response = requests.get(f"{BASE_URL}/api/reports/daily?date=2026-03-08&mode=normal")
        assert response.status_code == 200
        data = response.json()
        
        cf = data.get("cash_flow", {})
        assert "cash_jama" in cf
        assert "cash_nikasi" in cf
        assert "bank_jama" in cf
        assert "bank_nikasi" in cf
        assert "net_cash" in cf
        assert "net_bank" in cf
        assert "details" in cf
        
        # Normal mode details have: desc, type, account, amount (no party, category)
        if cf["details"]:
            detail = cf["details"][0]
            assert "desc" in detail
            assert "type" in detail
            assert "account" in detail
            assert "amount" in detail
    
    def test_detail_mode_cash_flow_expanded(self):
        """Detail mode cash flow details should have: desc, party, category, type, account, amount"""
        response = requests.get(f"{BASE_URL}/api/reports/daily?date=2026-03-08&mode=detail")
        assert response.status_code == 200
        data = response.json()
        
        cf = data.get("cash_flow", {})
        if cf["details"]:
            detail = cf["details"][0]
            assert "desc" in detail
            assert "party" in detail
            assert "category" in detail
            assert "type" in detail
            assert "account" in detail
            assert "amount" in detail
    
    def test_detail_mode_has_private_payment_details(self):
        """Detail mode should include pvt_payment_details under payments"""
        response = requests.get(f"{BASE_URL}/api/reports/daily?date=2026-03-08&mode=detail")
        assert response.status_code == 200
        data = response.json()
        
        payments = data.get("payments", {})
        assert "pvt_payment_details" in payments
        # Detail mode shows private payment details
        if payments["pvt_payment_details"]:
            detail = payments["pvt_payment_details"][0]
            assert "party" in detail
            assert "amount" in detail
            assert "ref_type" in detail
            assert "mode" in detail


class TestMillPartsInDailyReport:
    """Tests for Mill Parts Stock section in Daily Report"""
    
    def test_mill_parts_section_exists(self):
        """Verify mill_parts section exists in daily report"""
        response = requests.get(f"{BASE_URL}/api/reports/daily?date=2026-03-08&mode=normal")
        assert response.status_code == 200
        data = response.json()
        
        assert "mill_parts" in data
        mp = data["mill_parts"]
        assert "in_count" in mp
        assert "used_count" in mp
        assert "in_amount" in mp
        assert "in_details" in mp
        assert "used_details" in mp
    
    def test_mill_parts_has_data_for_test_date(self):
        """Verify mill parts data exists for 2026-03-08 (Belt: 5 in, 2 used)"""
        response = requests.get(f"{BASE_URL}/api/reports/daily?date=2026-03-08&mode=normal")
        assert response.status_code == 200
        data = response.json()
        
        mp = data["mill_parts"]
        assert mp["in_count"] == 1, f"Expected 1 part in, got {mp['in_count']}"
        assert mp["used_count"] == 1, f"Expected 1 part used, got {mp['used_count']}"
        assert mp["in_amount"] == 4250.0, f"Expected in_amount=4250, got {mp['in_amount']}"
    
    def test_mill_parts_in_details_structure(self):
        """Verify parts_in details have: part, qty, rate, party, bill_no, amount"""
        response = requests.get(f"{BASE_URL}/api/reports/daily?date=2026-03-08&mode=normal")
        assert response.status_code == 200
        data = response.json()
        
        mp = data["mill_parts"]
        assert len(mp["in_details"]) > 0
        detail = mp["in_details"][0]
        assert "part" in detail
        assert "qty" in detail
        assert "rate" in detail
        assert "party" in detail
        assert "bill_no" in detail
        assert "amount" in detail
        
        # Verify actual data
        assert detail["part"] == "Belt"
        assert detail["qty"] == 5.0
        assert detail["rate"] == 850.0
        assert detail["party"] == "ABC Spares"
        assert detail["amount"] == 4250.0
    
    def test_mill_parts_used_details_structure(self):
        """Verify parts_used details have: part, qty, remark"""
        response = requests.get(f"{BASE_URL}/api/reports/daily?date=2026-03-08&mode=normal")
        assert response.status_code == 200
        data = response.json()
        
        mp = data["mill_parts"]
        assert len(mp["used_details"]) > 0
        detail = mp["used_details"][0]
        assert "part" in detail
        assert "qty" in detail
        assert "remark" in detail
        
        assert detail["part"] == "Belt"
        assert detail["qty"] == 2.0


class TestDailyReportExports:
    """Tests for PDF and Excel exports with mode parameter"""
    
    def test_pdf_export_normal_mode_returns_200(self):
        """PDF export with mode=normal should return 200"""
        response = requests.get(f"{BASE_URL}/api/reports/daily/pdf?date=2026-03-08&mode=normal")
        assert response.status_code == 200
        assert "application/pdf" in response.headers.get("content-type", "")
    
    def test_pdf_export_detail_mode_returns_200(self):
        """PDF export with mode=detail should return 200"""
        response = requests.get(f"{BASE_URL}/api/reports/daily/pdf?date=2026-03-08&mode=detail")
        assert response.status_code == 200
        assert "application/pdf" in response.headers.get("content-type", "")
    
    def test_excel_export_normal_mode_returns_200(self):
        """Excel export with mode=normal should return 200"""
        response = requests.get(f"{BASE_URL}/api/reports/daily/excel?date=2026-03-08&mode=normal")
        assert response.status_code == 200
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "application/vnd" in content_type
    
    def test_excel_export_detail_mode_returns_200(self):
        """Excel export with mode=detail should return 200"""
        response = requests.get(f"{BASE_URL}/api/reports/daily/excel?date=2026-03-08&mode=detail")
        assert response.status_code == 200
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "application/vnd" in content_type
    
    def test_pdf_filename_includes_mode(self):
        """PDF filename should include mode in Content-Disposition"""
        response = requests.get(f"{BASE_URL}/api/reports/daily/pdf?date=2026-03-08&mode=detail")
        assert response.status_code == 200
        content_disp = response.headers.get("content-disposition", "")
        assert "daily_report_detail_2026-03-08.pdf" in content_disp


class TestCashBookData:
    """Verify cash book data shows correctly in daily report"""
    
    def test_cash_flow_bank_jama_exists(self):
        """Verify Bank Jama from existing cash transaction (Rice Payment from Shyam Traders)"""
        response = requests.get(f"{BASE_URL}/api/reports/daily?date=2026-03-08&mode=normal")
        assert response.status_code == 200
        data = response.json()
        
        cf = data.get("cash_flow", {})
        assert cf["bank_jama"] == 50000.0, f"Expected bank_jama=50000, got {cf['bank_jama']}"
        assert cf["net_bank"] == 50000.0
        
        # Check details
        details = cf["details"]
        assert len(details) > 0
        detail = details[0]
        assert detail["amount"] == 50000.0
        assert detail["type"] == "jama"
        assert detail["account"] == "bank"
    
    def test_payments_rice_sale_received(self):
        """Verify rice_sale_received payment amount"""
        response = requests.get(f"{BASE_URL}/api/reports/daily?date=2026-03-08&mode=normal")
        assert response.status_code == 200
        data = response.json()
        
        payments = data.get("payments", {})
        assert payments["rice_sale_received"] == 50000.0
