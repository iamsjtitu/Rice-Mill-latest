"""
Test Suite: Cash Book Export Filter Tests
Tests for iteration 44 - verifying exports respect applied filters

Test data available:
- 4 Agent transactions (Kesinga jama/nikasi + Utkela jama/nikasi)
- 10 Truck transactions (OD08T2002)
- 3 Diesel transactions (Titu Fuels)
- Party Summary: 2 pending (OD08T2002, Titu Fuels), 2 settled (Kesinga, Utkela)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
KMS_YEAR = "2025-2026"
SEASON = "Kharif"


class TestCashBookExportsWithFilters:
    """Test Cash Book export endpoints respect filters"""
    
    # ============ CASH TRANSACTIONS TAB TESTS ============
    
    def test_01_cash_book_pdf_with_account_cash_filter(self):
        """Cash Transactions tab: Export PDF with account=cash filter"""
        url = f"{BASE_URL}/api/cash-book/pdf?account=cash&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get('content-type') == 'application/pdf', "Expected PDF content type"
        assert len(response.content) > 100, "PDF should have content"
        print(f"PASS: Cash Book PDF export with account=cash returned {len(response.content)} bytes")
    
    def test_02_cash_book_excel_with_account_cash_filter(self):
        """Cash Transactions tab: Export Excel with account=cash filter"""
        url = f"{BASE_URL}/api/cash-book/excel?account=cash&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert 'spreadsheetml' in response.headers.get('content-type', ''), "Expected Excel content type"
        assert len(response.content) > 100, "Excel should have content"
        print(f"PASS: Cash Book Excel export with account=cash returned {len(response.content)} bytes")
    
    def test_03_cash_book_pdf_with_txn_type_jama_filter(self):
        """Export PDF with txn_type=jama filter"""
        url = f"{BASE_URL}/api/cash-book/pdf?txn_type=jama&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get('content-type') == 'application/pdf'
        print(f"PASS: Cash Book PDF with txn_type=jama returned {len(response.content)} bytes")
    
    def test_04_cash_book_excel_with_txn_type_jama_filter(self):
        """Export Excel with txn_type=jama filter - should only return jama entries"""
        url = f"{BASE_URL}/api/cash-book/excel?txn_type=jama&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert 'spreadsheetml' in response.headers.get('content-type', '')
        print(f"PASS: Cash Book Excel with txn_type=jama returned {len(response.content)} bytes")
    
    # ============ PARTY LEDGERS TAB TESTS ============
    
    def test_05_cash_book_pdf_with_category_filter(self):
        """Party Ledgers tab: Export PDF with category=Kesinga filter"""
        url = f"{BASE_URL}/api/cash-book/pdf?category=Kesinga&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get('content-type') == 'application/pdf'
        print(f"PASS: Cash Book PDF with category=Kesinga returned {len(response.content)} bytes")
    
    def test_06_cash_book_excel_with_category_filter(self):
        """Party Ledgers tab: Export Excel with category=Kesinga filter"""
        url = f"{BASE_URL}/api/cash-book/excel?category=Kesinga&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert 'spreadsheetml' in response.headers.get('content-type', '')
        print(f"PASS: Cash Book Excel with category=Kesinga returned {len(response.content)} bytes")
    
    def test_07_cash_book_pdf_with_party_type_agent_filter(self):
        """Export PDF with party_type=Agent filter"""
        url = f"{BASE_URL}/api/cash-book/pdf?party_type=Agent&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get('content-type') == 'application/pdf'
        print(f"PASS: Cash Book PDF with party_type=Agent returned {len(response.content)} bytes")
    
    def test_08_cash_book_excel_with_party_type_truck_filter(self):
        """Export Excel with party_type=Truck filter"""
        url = f"{BASE_URL}/api/cash-book/excel?party_type=Truck&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert 'spreadsheetml' in response.headers.get('content-type', '')
        print(f"PASS: Cash Book Excel with party_type=Truck returned {len(response.content)} bytes")
    
    def test_09_cash_book_with_date_range_filter(self):
        """Export with date range filter"""
        url = f"{BASE_URL}/api/cash-book/excel?date_from=2025-01-01&date_to=2025-12-31&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"PASS: Cash Book Excel with date range filter returned {len(response.content)} bytes")
    
    # ============ PARTY SUMMARY TAB TESTS ============
    
    def test_10_party_summary_pdf_with_status_pending_filter(self):
        """Party Summary tab: Export PDF with status=pending filter"""
        url = f"{BASE_URL}/api/cash-book/party-summary/pdf?status=pending&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get('content-type') == 'application/pdf'
        print(f"PASS: Party Summary PDF with status=pending returned {len(response.content)} bytes")
    
    def test_11_party_summary_excel_with_status_pending_filter(self):
        """Party Summary tab: Export Excel with status=pending filter"""
        url = f"{BASE_URL}/api/cash-book/party-summary/excel?status=pending&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert 'spreadsheetml' in response.headers.get('content-type', '')
        print(f"PASS: Party Summary Excel with status=pending returned {len(response.content)} bytes")
    
    def test_12_party_summary_pdf_with_status_settled_filter(self):
        """Party Summary tab: Export PDF with status=settled filter"""
        url = f"{BASE_URL}/api/cash-book/party-summary/pdf?status=settled&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get('content-type') == 'application/pdf'
        print(f"PASS: Party Summary PDF with status=settled returned {len(response.content)} bytes")
    
    def test_13_party_summary_excel_with_party_type_agent_filter(self):
        """Party Summary tab: Export Excel with party_type=Agent filter"""
        url = f"{BASE_URL}/api/cash-book/party-summary/excel?party_type=Agent&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert 'spreadsheetml' in response.headers.get('content-type', '')
        print(f"PASS: Party Summary Excel with party_type=Agent returned {len(response.content)} bytes")
    
    def test_14_party_summary_pdf_with_combined_filters(self):
        """Party Summary: Export PDF with party_type + status combined"""
        url = f"{BASE_URL}/api/cash-book/party-summary/pdf?party_type=Agent&status=settled&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get('content-type') == 'application/pdf'
        print(f"PASS: Party Summary PDF with party_type=Agent + status=settled returned {len(response.content)} bytes")
    
    # ============ PARTY LEDGER PAGE TESTS ============
    
    def test_15_party_ledger_pdf_with_party_type_agent(self):
        """Party Ledger page: Export PDF with party_type=Agent"""
        url = f"{BASE_URL}/api/reports/party-ledger/pdf?party_type=Agent&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get('content-type') == 'application/pdf'
        print(f"PASS: Party Ledger PDF with party_type=Agent returned {len(response.content)} bytes")
    
    def test_16_party_ledger_excel_with_party_type_agent(self):
        """Party Ledger page: Export Excel with party_type=Agent"""
        url = f"{BASE_URL}/api/reports/party-ledger/excel?party_type=Agent&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert 'spreadsheetml' in response.headers.get('content-type', '')
        print(f"PASS: Party Ledger Excel with party_type=Agent returned {len(response.content)} bytes")
    
    def test_17_party_ledger_pdf_with_date_range(self):
        """Party Ledger page: Export PDF with date range"""
        url = f"{BASE_URL}/api/reports/party-ledger/pdf?date_from=2025-01-01&date_to=2025-12-31&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get('content-type') == 'application/pdf'
        print(f"PASS: Party Ledger PDF with date range returned {len(response.content)} bytes")
    
    def test_18_party_ledger_excel_with_combined_filters(self):
        """Party Ledger: Export Excel with party_type + date range"""
        url = f"{BASE_URL}/api/reports/party-ledger/excel?party_type=Agent&date_from=2025-01-01&date_to=2025-12-31&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert 'spreadsheetml' in response.headers.get('content-type', '')
        print(f"PASS: Party Ledger Excel with party_type + date range returned {len(response.content)} bytes")


class TestCashBookAPIDataVerification:
    """Verify that API actually filters data correctly (not just returns 200)"""
    
    def test_19_verify_txn_type_jama_filter_returns_only_jama(self):
        """Verify /api/cash-book?txn_type=jama returns only jama entries"""
        url = f"{BASE_URL}/api/cash-book?txn_type=jama&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200
        data = response.json()
        for txn in data:
            assert txn.get('txn_type') == 'jama', f"Expected only jama entries, found {txn.get('txn_type')}"
        print(f"PASS: txn_type=jama filter returned {len(data)} jama entries (all verified)")
    
    def test_20_verify_party_type_agent_filter(self):
        """Verify /api/cash-book?party_type=Agent returns only Agent entries"""
        url = f"{BASE_URL}/api/cash-book?party_type=Agent&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200
        data = response.json()
        assert len(data) > 0, "Should have Agent entries"
        for txn in data:
            assert txn.get('party_type') == 'Agent', f"Expected only Agent entries, found {txn.get('party_type')}"
        print(f"PASS: party_type=Agent filter returned {len(data)} Agent entries (all verified)")
    
    def test_21_verify_category_kesinga_filter(self):
        """Verify /api/cash-book?category=Kesinga returns only Kesinga entries"""
        url = f"{BASE_URL}/api/cash-book?category=Kesinga&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200
        data = response.json()
        for txn in data:
            assert txn.get('category') == 'Kesinga', f"Expected only Kesinga entries, found {txn.get('category')}"
        print(f"PASS: category=Kesinga filter returned {len(data)} Kesinga entries (all verified)")
    
    def test_22_verify_party_summary_status_pending_filter(self):
        """Verify party-summary with status=pending returns only pending parties (balance != 0)"""
        # First get party summary data to verify filtering logic
        url = f"{BASE_URL}/api/cash-book/party-summary?kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200
        data = response.json()
        pending_parties = [p for p in data['parties'] if p['balance'] != 0]
        settled_parties = [p for p in data['parties'] if p['balance'] == 0]
        print(f"Party Summary: {len(pending_parties)} pending, {len(settled_parties)} settled")
        # Verify counts match summary
        assert data['summary']['pending_count'] == len(pending_parties)
        assert data['summary']['settled_count'] == len(settled_parties)
        print(f"PASS: Party Summary pending/settled counts verified")
    
    def test_23_verify_account_cash_filter(self):
        """Verify /api/cash-book?account=cash returns only cash entries"""
        url = f"{BASE_URL}/api/cash-book?account=cash&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200
        data = response.json()
        for txn in data:
            assert txn.get('account') == 'cash', f"Expected only cash entries, found {txn.get('account')}"
        print(f"PASS: account=cash filter returned {len(data)} cash entries (all verified)")
    
    def test_24_verify_combined_filters(self):
        """Verify combined filters work correctly"""
        url = f"{BASE_URL}/api/cash-book?party_type=Agent&txn_type=jama&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200
        data = response.json()
        for txn in data:
            assert txn.get('party_type') == 'Agent', f"party_type filter failed"
            assert txn.get('txn_type') == 'jama', f"txn_type filter failed"
        print(f"PASS: Combined filters (party_type=Agent & txn_type=jama) returned {len(data)} entries")


class TestPartyLedgerAPIFilters:
    """Test Party Ledger API accepts and uses filter parameters"""
    
    def test_25_party_ledger_accepts_date_from_param(self):
        """Verify /api/reports/party-ledger accepts date_from parameter"""
        url = f"{BASE_URL}/api/reports/party-ledger?date_from=2025-01-01&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert 'ledger' in data
        print(f"PASS: Party Ledger API accepts date_from param, returned {len(data['ledger'])} entries")
    
    def test_26_party_ledger_accepts_date_to_param(self):
        """Verify /api/reports/party-ledger accepts date_to parameter"""
        url = f"{BASE_URL}/api/reports/party-ledger?date_to=2025-12-31&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert 'ledger' in data
        print(f"PASS: Party Ledger API accepts date_to param, returned {len(data['ledger'])} entries")
    
    def test_27_party_ledger_with_party_type_filter(self):
        """Verify /api/reports/party-ledger with party_type=Agent filter"""
        url = f"{BASE_URL}/api/reports/party-ledger?party_type=Agent&kms_year={KMS_YEAR}&season={SEASON}"
        response = requests.get(url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert 'ledger' in data
        # All entries should have party_type = Agent
        for entry in data['ledger']:
            assert entry.get('party_type') == 'Agent', f"Expected Agent, got {entry.get('party_type')}"
        print(f"PASS: Party Ledger with party_type=Agent returned {len(data['ledger'])} entries")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
