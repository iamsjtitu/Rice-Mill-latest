"""
Iteration 51: Test Report Config Refactoring
Tests for Cash Book and Party Ledger exports using shared config.
Also tests report_config.json structure and regression for previously working endpoints.
"""

import pytest
import requests
import os
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
CONFIG_PATH = '/app/shared/report_config.json'

@pytest.fixture(scope="module")
def session():
    """Shared requests session"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s

@pytest.fixture(scope="module")
def report_config():
    """Load report config from shared file"""
    with open(CONFIG_PATH) as f:
        return json.load(f)


class TestReportConfigStructure:
    """Tests for report_config.json structure - verifying all required configs exist"""
    
    def test_01_config_has_cashbook_report(self, report_config):
        """Verify cashbook_report exists in config"""
        assert "cashbook_report" in report_config, "cashbook_report should exist in report_config.json"
        assert "columns" in report_config["cashbook_report"], "cashbook_report should have columns array"
        print(f"PASSED: cashbook_report found with {len(report_config['cashbook_report']['columns'])} columns")
    
    def test_02_cashbook_report_has_10_columns(self, report_config):
        """Verify cashbook_report has exactly 10 columns"""
        columns = report_config["cashbook_report"]["columns"]
        assert len(columns) == 10, f"cashbook_report should have 10 columns, found {len(columns)}"
        
        # Verify column fields
        expected_fields = ["date", "account_label", "type_label", "category", "party_type", 
                         "description", "jama", "nikasi", "balance", "reference"]
        actual_fields = [c["field"] for c in columns]
        assert actual_fields == expected_fields, f"Expected fields {expected_fields}, got {actual_fields}"
        print(f"PASSED: cashbook_report has correct 10 columns: {actual_fields}")
    
    def test_03_config_has_party_ledger_report(self, report_config):
        """Verify party_ledger_report exists in config"""
        assert "party_ledger_report" in report_config, "party_ledger_report should exist in report_config.json"
        assert "columns" in report_config["party_ledger_report"], "party_ledger_report should have columns array"
        print(f"PASSED: party_ledger_report found with {len(report_config['party_ledger_report']['columns'])} columns")
    
    def test_04_party_ledger_report_has_7_columns(self, report_config):
        """Verify party_ledger_report has exactly 7 columns"""
        columns = report_config["party_ledger_report"]["columns"]
        assert len(columns) == 7, f"party_ledger_report should have 7 columns, found {len(columns)}"
        
        # Verify column fields
        expected_fields = ["date", "party_name", "party_type", "description", "debit", "credit", "ref"]
        actual_fields = [c["field"] for c in columns]
        assert actual_fields == expected_fields, f"Expected fields {expected_fields}, got {actual_fields}"
        print(f"PASSED: party_ledger_report has correct 7 columns: {actual_fields}")
    
    def test_05_config_has_daily_paddy_entries_report(self, report_config):
        """Verify daily_paddy_entries_report exists with summary and detail modes"""
        assert "daily_paddy_entries_report" in report_config, "daily_paddy_entries_report should exist"
        config = report_config["daily_paddy_entries_report"]
        assert "summary_mode_columns" in config, "Should have summary_mode_columns"
        assert "detail_mode_columns" in config, "Should have detail_mode_columns"
        print(f"PASSED: daily_paddy_entries_report found with {len(config['summary_mode_columns'])} summary columns and {len(config['detail_mode_columns'])} detail columns")
    
    def test_06_column_definitions_have_required_fields(self, report_config):
        """Verify all column definitions have required fields"""
        required_fields = ["field", "header", "pdf_header", "type", "align", "width_excel", "width_pdf_mm"]
        
        for report_name in ["cashbook_report", "party_ledger_report"]:
            columns = report_config[report_name]["columns"]
            for col in columns:
                for req_field in required_fields:
                    assert req_field in col, f"{report_name} column {col.get('field', 'unknown')} missing {req_field}"
        print("PASSED: All column definitions have required fields")


class TestCashBookExports:
    """Tests for Cash Book Excel and PDF exports"""
    
    def test_07_cashbook_excel_export_returns_200(self, session):
        """GET /api/cash-book/excel returns 200 with valid spreadsheet"""
        response = session.get(f"{BASE_URL}/api/cash-book/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        content_type = response.headers.get("Content-Type", "")
        assert "spreadsheet" in content_type or "application/vnd.openxmlformats" in content_type, \
            f"Expected spreadsheet content type, got {content_type}"
        
        assert len(response.content) > 0, "Excel file should not be empty"
        print(f"PASSED: Cash Book Excel export returns 200, {len(response.content)} bytes")
    
    def test_08_cashbook_pdf_export_returns_200(self, session):
        """GET /api/cash-book/pdf returns 200 with valid PDF"""
        response = session.get(f"{BASE_URL}/api/cash-book/pdf")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        content_type = response.headers.get("Content-Type", "")
        assert "pdf" in content_type.lower(), f"Expected PDF content type, got {content_type}"
        
        assert len(response.content) > 0, "PDF file should not be empty"
        print(f"PASSED: Cash Book PDF export returns 200, {len(response.content)} bytes")
    
    def test_09_cashbook_excel_with_filters(self, session):
        """GET /api/cash-book/excel with filters returns 200"""
        response = session.get(f"{BASE_URL}/api/cash-book/excel?kms_year=2024-25&account=cash")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"PASSED: Cash Book Excel with filters returns 200, {len(response.content)} bytes")
    
    def test_10_cashbook_pdf_with_filters(self, session):
        """GET /api/cash-book/pdf with filters returns 200"""
        response = session.get(f"{BASE_URL}/api/cash-book/pdf?kms_year=2024-25&account=bank")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"PASSED: Cash Book PDF with filters returns 200, {len(response.content)} bytes")


class TestPartyLedgerExports:
    """Tests for Party Ledger Excel and PDF exports"""
    
    def test_11_party_ledger_excel_export_returns_200(self, session):
        """GET /api/reports/party-ledger/excel returns 200 with valid spreadsheet"""
        response = session.get(f"{BASE_URL}/api/reports/party-ledger/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        content_type = response.headers.get("Content-Type", "")
        assert "spreadsheet" in content_type or "application/vnd.openxmlformats" in content_type, \
            f"Expected spreadsheet content type, got {content_type}"
        
        assert len(response.content) > 0, "Excel file should not be empty"
        print(f"PASSED: Party Ledger Excel export returns 200, {len(response.content)} bytes")
    
    def test_12_party_ledger_pdf_export_returns_200(self, session):
        """GET /api/reports/party-ledger/pdf returns 200 with valid PDF"""
        response = session.get(f"{BASE_URL}/api/reports/party-ledger/pdf")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        content_type = response.headers.get("Content-Type", "")
        assert "pdf" in content_type.lower(), f"Expected PDF content type, got {content_type}"
        
        assert len(response.content) > 0, "PDF file should not be empty"
        print(f"PASSED: Party Ledger PDF export returns 200, {len(response.content)} bytes")
    
    def test_13_party_ledger_excel_with_filters(self, session):
        """GET /api/reports/party-ledger/excel with party_name filter returns 200"""
        response = session.get(f"{BASE_URL}/api/reports/party-ledger/excel?kms_year=2024-25")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"PASSED: Party Ledger Excel with filters returns 200, {len(response.content)} bytes")
    
    def test_14_party_ledger_pdf_with_date_range(self, session):
        """GET /api/reports/party-ledger/pdf with date range returns 200"""
        response = session.get(f"{BASE_URL}/api/reports/party-ledger/pdf?date_from=2024-01-01&date_to=2024-12-31")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"PASSED: Party Ledger PDF with date range returns 200, {len(response.content)} bytes")


class TestRegressionPrivateTrading:
    """Regression tests for Private Trading exports (tested in iterations 49-50)"""
    
    def test_15_private_paddy_excel_still_works(self, session):
        """GET /api/private-paddy/excel returns 200 (regression)"""
        response = session.get(f"{BASE_URL}/api/private-paddy/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"PASSED: Private Paddy Excel export still works, {len(response.content)} bytes")
    
    def test_16_private_trading_party_summary_returns_json(self, session):
        """GET /api/private-trading/party-summary returns valid JSON (regression)"""
        response = session.get(f"{BASE_URL}/api/private-trading/party-summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "parties" in data, "Response should have 'parties' array"
        assert "totals" in data, "Response should have 'totals' object"
        print(f"PASSED: Party Summary returns valid JSON with {len(data['parties'])} parties")


class TestRegressionAgentMandi:
    """Regression tests for Agent Mandi report"""
    
    def test_17_agent_mandi_report_returns_json(self, session):
        """GET /api/reports/agent-mandi-wise returns valid JSON (regression)"""
        response = session.get(f"{BASE_URL}/api/reports/agent-mandi-wise")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "mandis" in data or "entries" in data or isinstance(data, list), "Response should have mandis/entries or be array"
        print(f"PASSED: Agent Mandi report returns valid JSON")


class TestCashBookAPIBasics:
    """Tests for Cash Book API basic endpoints"""
    
    def test_18_cashbook_list_returns_200(self, session):
        """GET /api/cash-book returns 200"""
        response = session.get(f"{BASE_URL}/api/cash-book")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be an array"
        print(f"PASSED: Cash Book list returns 200, {len(data)} transactions")
    
    def test_19_cashbook_summary_returns_200(self, session):
        """GET /api/cash-book/summary returns 200"""
        response = session.get(f"{BASE_URL}/api/cash-book/summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "cash_balance" in data, "Summary should have cash_balance"
        assert "bank_balance" in data, "Summary should have bank_balance"
        assert "total_balance" in data, "Summary should have total_balance"
        print(f"PASSED: Cash Book summary returns 200, total_balance={data.get('total_balance')}")


class TestPartyLedgerAPIBasics:
    """Tests for Party Ledger API basic endpoints"""
    
    def test_20_party_ledger_list_returns_200(self, session):
        """GET /api/reports/party-ledger returns 200"""
        response = session.get(f"{BASE_URL}/api/reports/party-ledger")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "ledger" in data, "Response should have 'ledger' array"
        assert "party_list" in data, "Response should have 'party_list'"
        assert "total_debit" in data, "Response should have 'total_debit'"
        assert "total_credit" in data, "Response should have 'total_credit'"
        print(f"PASSED: Party Ledger returns 200, {len(data['ledger'])} entries")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
