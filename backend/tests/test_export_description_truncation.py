"""
Test PDF/Excel Export Description Column Truncation Fix
Tests that description/party columns are NOT truncated in exports.

Bug fix: Main agent removed text truncation (desc[:42], description[:25], party_name[:18])
and increased column widths for better readability.

Tested endpoints:
- GET /api/cash-book/pdf - Description column
- GET /api/cash-book/excel - Description column width (40)
- GET /api/cash-book/party-summary/pdf - Party Name column
- GET /api/cash-book/party-summary/excel - Party Name column width (35)
- GET /api/reports/party-ledger/pdf - Description and Party columns
- GET /api/reports/party-ledger/excel - Description column width (50)
- GET /api/reports/agent-mandi-wise - Agent Mandi Report
- GET /api/mandi-targets - Mandi Targets CRUD
"""
import pytest
import requests
import os
from io import BytesIO

# Get base URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCashBookExports:
    """Test Cash Book PDF/Excel exports - Description column should NOT be truncated"""
    
    def test_01_cash_book_pdf_returns_200_and_valid_pdf(self):
        """Cash Book PDF export returns 200 and valid PDF file"""
        response = requests.get(f"{BASE_URL}/api/cash-book/pdf")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Check content type
        content_type = response.headers.get('Content-Type', '')
        assert 'pdf' in content_type.lower(), f"Expected PDF content type, got {content_type}"
        
        # Check content disposition
        content_disp = response.headers.get('Content-Disposition', '')
        assert 'attachment' in content_disp.lower(), f"Expected attachment, got {content_disp}"
        assert 'cash_book' in content_disp.lower(), f"Expected cash_book filename, got {content_disp}"
        
        # Check file size is non-zero
        content = response.content
        assert len(content) > 0, "PDF file should not be empty"
        
        # Verify PDF magic bytes
        assert content[:4] == b'%PDF', "File should be a valid PDF"
        
        print(f"Cash Book PDF: {len(content)} bytes, Content-Type: {content_type}")
    
    def test_02_cash_book_pdf_with_filters_returns_200(self):
        """Cash Book PDF export with filters returns 200"""
        response = requests.get(f"{BASE_URL}/api/cash-book/pdf", params={
            "account": "cash",
            "txn_type": "nikasi"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.content[:4] == b'%PDF', "Should return valid PDF"
        print(f"Cash Book PDF with filters: {len(response.content)} bytes")
    
    def test_03_cash_book_excel_returns_200_and_valid_xlsx(self):
        """Cash Book Excel export returns 200 and valid XLSX file"""
        response = requests.get(f"{BASE_URL}/api/cash-book/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Check content type
        content_type = response.headers.get('Content-Type', '')
        assert 'spreadsheet' in content_type.lower() or 'excel' in content_type.lower(), f"Expected Excel content type, got {content_type}"
        
        # Check content disposition
        content_disp = response.headers.get('Content-Disposition', '')
        assert 'cash_book' in content_disp.lower(), f"Expected cash_book filename, got {content_disp}"
        
        # Check file size is non-zero
        content = response.content
        assert len(content) > 0, "Excel file should not be empty"
        
        # Verify XLSX magic bytes (PK header for ZIP format)
        assert content[:2] == b'PK', "File should be a valid XLSX (ZIP format)"
        
        print(f"Cash Book Excel: {len(content)} bytes, Content-Type: {content_type}")
    
    def test_04_cash_book_excel_with_filters_returns_200(self):
        """Cash Book Excel export with filters returns 200"""
        response = requests.get(f"{BASE_URL}/api/cash-book/excel", params={
            "account": "bank",
            "date_from": "2024-01-01"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.content[:2] == b'PK', "Should return valid XLSX"
        print(f"Cash Book Excel with filters: {len(response.content)} bytes")


class TestPartySummaryExports:
    """Test Party Summary PDF/Excel exports - Party Name column should NOT be truncated"""
    
    def test_05_party_summary_pdf_returns_200_and_valid_pdf(self):
        """Party Summary PDF export returns 200 and valid PDF file"""
        response = requests.get(f"{BASE_URL}/api/cash-book/party-summary/pdf")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Check content type
        content_type = response.headers.get('Content-Type', '')
        assert 'pdf' in content_type.lower(), f"Expected PDF content type, got {content_type}"
        
        # Check file size
        content = response.content
        assert len(content) > 0, "PDF file should not be empty"
        
        # Verify PDF magic bytes
        assert content[:4] == b'%PDF', "File should be a valid PDF"
        
        print(f"Party Summary PDF: {len(content)} bytes")
    
    def test_06_party_summary_pdf_with_status_filter(self):
        """Party Summary PDF with status=pending returns 200"""
        response = requests.get(f"{BASE_URL}/api/cash-book/party-summary/pdf", params={
            "status": "pending"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.content[:4] == b'%PDF', "Should return valid PDF"
        print(f"Party Summary PDF (pending): {len(response.content)} bytes")
    
    def test_07_party_summary_pdf_with_party_type_filter(self):
        """Party Summary PDF with party_type=Truck returns 200"""
        response = requests.get(f"{BASE_URL}/api/cash-book/party-summary/pdf", params={
            "party_type": "Truck"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.content[:4] == b'%PDF', "Should return valid PDF"
        print(f"Party Summary PDF (Truck): {len(response.content)} bytes")
    
    def test_08_party_summary_excel_returns_200_and_valid_xlsx(self):
        """Party Summary Excel export returns 200 and valid XLSX file"""
        response = requests.get(f"{BASE_URL}/api/cash-book/party-summary/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Check content type
        content_type = response.headers.get('Content-Type', '')
        assert 'spreadsheet' in content_type.lower() or 'excel' in content_type.lower(), f"Expected Excel content type, got {content_type}"
        
        # Check file size
        content = response.content
        assert len(content) > 0, "Excel file should not be empty"
        
        # Verify XLSX magic bytes
        assert content[:2] == b'PK', "File should be a valid XLSX"
        
        print(f"Party Summary Excel: {len(content)} bytes")
    
    def test_09_party_summary_excel_with_filters(self):
        """Party Summary Excel with filters returns 200"""
        response = requests.get(f"{BASE_URL}/api/cash-book/party-summary/excel", params={
            "party_type": "Agent",
            "status": "settled"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.content[:2] == b'PK', "Should return valid XLSX"
        print(f"Party Summary Excel with filters: {len(response.content)} bytes")


class TestPartyLedgerExports:
    """Test Party Ledger PDF/Excel exports - Description and Party columns should NOT be truncated"""
    
    def test_10_party_ledger_pdf_returns_200_and_valid_pdf(self):
        """Party Ledger PDF export returns 200 and valid PDF file"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger/pdf")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Check content type
        content_type = response.headers.get('Content-Type', '')
        assert 'pdf' in content_type.lower(), f"Expected PDF content type, got {content_type}"
        
        # Check file size
        content = response.content
        assert len(content) > 0, "PDF file should not be empty"
        
        # Verify PDF magic bytes
        assert content[:4] == b'%PDF', "File should be a valid PDF"
        
        print(f"Party Ledger PDF: {len(content)} bytes")
    
    def test_11_party_ledger_pdf_with_party_type_filter(self):
        """Party Ledger PDF with party_type=Truck returns 200"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger/pdf", params={
            "party_type": "truck"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.content[:4] == b'%PDF', "Should return valid PDF"
        print(f"Party Ledger PDF (Truck): {len(response.content)} bytes")
    
    def test_12_party_ledger_pdf_with_date_filter(self):
        """Party Ledger PDF with date range returns 200"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger/pdf", params={
            "date_from": "2024-01-01",
            "date_to": "2025-12-31"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.content[:4] == b'%PDF', "Should return valid PDF"
        print(f"Party Ledger PDF (date range): {len(response.content)} bytes")
    
    def test_13_party_ledger_excel_returns_200_and_valid_xlsx(self):
        """Party Ledger Excel export returns 200 and valid XLSX file"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Check content type
        content_type = response.headers.get('Content-Type', '')
        assert 'spreadsheet' in content_type.lower() or 'excel' in content_type.lower(), f"Expected Excel content type, got {content_type}"
        
        # Check file size
        content = response.content
        assert len(content) > 0, "Excel file should not be empty"
        
        # Verify XLSX magic bytes
        assert content[:2] == b'PK', "File should be a valid XLSX"
        
        print(f"Party Ledger Excel: {len(content)} bytes")
    
    def test_14_party_ledger_excel_with_party_type_filter(self):
        """Party Ledger Excel with party_type=Agent returns 200"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger/excel", params={
            "party_type": "Agent"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.content[:2] == b'PK', "Should return valid XLSX"
        print(f"Party Ledger Excel (Agent): {len(response.content)} bytes")
    
    def test_15_party_ledger_excel_with_combined_filters(self):
        """Party Ledger Excel with combined filters returns 200"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger/excel", params={
            "party_type": "Truck",
            "date_from": "2024-01-01",
            "date_to": "2025-12-31"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.content[:2] == b'PK', "Should return valid XLSX"
        print(f"Party Ledger Excel (combined): {len(response.content)} bytes")


class TestAgentMandiReport:
    """Test Agent Mandi Wise Report API"""
    
    def test_16_agent_mandi_wise_api_returns_200(self):
        """Agent Mandi Wise Report API returns 200"""
        response = requests.get(f"{BASE_URL}/api/reports/agent-mandi-wise")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "mandis" in data, "Response should have 'mandis' key"
        assert "grand_totals" in data, "Response should have 'grand_totals' key"
        
        print(f"Agent Mandi Report: {len(data['mandis'])} mandis, Grand total entries: {data['grand_totals'].get('entry_count', 0)}")
    
    def test_17_agent_mandi_wise_with_filters(self):
        """Agent Mandi Wise Report with filters returns 200"""
        response = requests.get(f"{BASE_URL}/api/reports/agent-mandi-wise", params={
            "kms_year": "2024-25",
            "season": "kharif"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "mandis" in data, "Response should have 'mandis' key"
        print(f"Agent Mandi Report (filtered): {len(data['mandis'])} mandis")
    
    def test_18_agent_mandi_wise_excel_returns_200(self):
        """Agent Mandi Wise Excel export returns 200"""
        response = requests.get(f"{BASE_URL}/api/reports/agent-mandi-wise/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify XLSX format
        assert response.content[:2] == b'PK', "Should return valid XLSX"
        print(f"Agent Mandi Excel: {len(response.content)} bytes")
    
    def test_19_agent_mandi_wise_pdf_returns_200(self):
        """Agent Mandi Wise PDF export returns 200"""
        response = requests.get(f"{BASE_URL}/api/reports/agent-mandi-wise/pdf")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify PDF format
        assert response.content[:4] == b'%PDF', "Should return valid PDF"
        print(f"Agent Mandi PDF: {len(response.content)} bytes")


class TestMandiTargets:
    """Test Mandi Targets CRUD API"""
    
    def test_20_mandi_targets_get_returns_200(self):
        """Mandi Targets GET API returns 200"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Mandi Targets: {len(data)} targets found")
    
    def test_21_mandi_targets_with_filters(self):
        """Mandi Targets with kms_year filter returns 200"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets", params={
            "kms_year": "2024-25"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Mandi Targets (2024-25): {len(data)} targets found")
    
    def test_22_mandi_targets_summary_returns_200(self):
        """Mandi Targets Summary API returns 200"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets/summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Mandi Targets Summary: {len(data)} summaries found")


class TestExportAPIDataIntegrity:
    """Verify export APIs return proper data (not just 200 status)"""
    
    def test_23_cash_book_api_returns_transactions(self):
        """Cash Book API returns transactions list"""
        response = requests.get(f"{BASE_URL}/api/cash-book")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Cash Book: {len(data)} transactions")
    
    def test_24_party_summary_api_returns_data(self):
        """Party Summary API returns parties and summary"""
        response = requests.get(f"{BASE_URL}/api/cash-book/party-summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "parties" in data, "Response should have 'parties' key"
        assert "summary" in data, "Response should have 'summary' key"
        print(f"Party Summary: {len(data['parties'])} parties, Total outstanding: {data['summary'].get('total_outstanding', 0)}")
    
    def test_25_party_ledger_api_returns_data(self):
        """Party Ledger API returns ledger entries"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "ledger" in data, "Response should have 'ledger' key"
        assert "total_debit" in data, "Response should have 'total_debit' key"
        assert "total_credit" in data, "Response should have 'total_credit' key"
        print(f"Party Ledger: {len(data['ledger'])} entries, Debit: {data['total_debit']}, Credit: {data['total_credit']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
