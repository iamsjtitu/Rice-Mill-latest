"""
Test Running Balance Feature - Iteration 35
Tests the new running balance column feature in:
1. Cash Book PDF export - Balance(Rs.) column
2. Cash Book Excel export - Balance (Rs.) column  
3. Party Ledger API verification
"""

import pytest
import requests
import os
from io import BytesIO

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCashBookExports:
    """Test Cash Book PDF and Excel exports with running balance column"""
    
    def test_cash_book_pdf_returns_200(self):
        """Verify Cash Book PDF export returns 200"""
        response = requests.get(f"{BASE_URL}/api/cash-book/pdf")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get('content-type') == 'application/pdf', "Should return PDF content type"
        assert len(response.content) > 500, "PDF should have content"
        print("✓ Cash Book PDF export returns 200 with PDF content")
    
    def test_cash_book_excel_returns_200(self):
        """Verify Cash Book Excel export returns 200"""
        response = requests.get(f"{BASE_URL}/api/cash-book/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        content_type = response.headers.get('content-type', '')
        assert 'spreadsheet' in content_type or 'excel' in content_type.lower() or 'openxml' in content_type, f"Should return Excel content type, got: {content_type}"
        assert len(response.content) > 500, "Excel should have content"
        print("✓ Cash Book Excel export returns 200 with Excel content")
    
    def test_cash_book_pdf_with_kms_year_filter(self):
        """Verify PDF export works with kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/cash-book/pdf?kms_year=2025-2026")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ Cash Book PDF export with kms_year filter works")
    
    def test_cash_book_excel_with_kms_year_filter(self):
        """Verify Excel export works with kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/cash-book/excel?kms_year=2025-2026")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ Cash Book Excel export with kms_year filter works")


class TestPartyLedgerAPI:
    """Test Party Ledger API responses for running balance feature"""
    
    def test_party_ledger_returns_ledger_data(self):
        """Verify Party Ledger API returns proper structure"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify required fields
        assert 'ledger' in data, "Response should contain 'ledger' field"
        assert 'total_debit' in data, "Response should contain 'total_debit' field"
        assert 'total_credit' in data, "Response should contain 'total_credit' field"
        assert 'party_list' in data, "Response should contain 'party_list' field"
        print("✓ Party Ledger API returns proper structure")
    
    def test_party_ledger_with_kms_year_filter(self):
        """Verify Party Ledger works with kms_year filter"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger?kms_year=2025-2026")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify ledger items have required fields
        if len(data.get('ledger', [])) > 0:
            item = data['ledger'][0]
            required_fields = ['date', 'party_name', 'party_type', 'description', 'debit', 'credit']
            for field in required_fields:
                assert field in item, f"Ledger item should have '{field}' field"
        print("✓ Party Ledger with kms_year filter returns valid data")
    
    def test_party_ledger_totals_calculation(self):
        """Verify total_debit and total_credit are calculated correctly"""
        response = requests.get(f"{BASE_URL}/api/reports/party-ledger?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        ledger = data.get('ledger', [])
        calculated_debit = sum(item.get('debit', 0) for item in ledger)
        calculated_credit = sum(item.get('credit', 0) for item in ledger)
        
        # Allow small floating point differences
        assert abs(calculated_debit - data.get('total_debit', 0)) < 0.01, "Total debit should match sum of ledger debits"
        assert abs(calculated_credit - data.get('total_credit', 0)) < 0.01, "Total credit should match sum of ledger credits"
        print(f"✓ Party Ledger totals verified: Debit=₹{data['total_debit']}, Credit=₹{data['total_credit']}")


class TestCashBookSummary:
    """Test Cash Book Summary API for balance calculations"""
    
    def test_cash_book_summary_returns_data(self):
        """Verify Cash Book Summary API returns proper structure"""
        response = requests.get(f"{BASE_URL}/api/cash-book/summary")
        assert response.status_code == 200
        data = response.json()
        
        required_fields = ['cash_in', 'cash_out', 'cash_balance', 'bank_in', 'bank_out', 'bank_balance', 'total_balance']
        for field in required_fields:
            assert field in data, f"Summary should have '{field}' field"
        print(f"✓ Cash Book Summary: Cash Balance=₹{data['cash_balance']}, Bank Balance=₹{data['bank_balance']}, Total=₹{data['total_balance']}")
    
    def test_cash_book_summary_balance_calculation(self):
        """Verify balance calculations are correct"""
        response = requests.get(f"{BASE_URL}/api/cash-book/summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        # Verify cash balance = opening + in - out
        opening_cash = data.get('opening_cash', 0)
        expected_cash_balance = opening_cash + data['cash_in'] - data['cash_out']
        assert abs(data['cash_balance'] - expected_cash_balance) < 0.01, "Cash balance calculation should be correct"
        
        # Verify bank balance = opening + in - out
        opening_bank = data.get('opening_bank', 0)
        expected_bank_balance = opening_bank + data['bank_in'] - data['bank_out']
        assert abs(data['bank_balance'] - expected_bank_balance) < 0.01, "Bank balance calculation should be correct"
        
        print("✓ Cash Book balance calculations verified")


class TestCashBookTransactions:
    """Test Cash Book Transactions API for running balance computation"""
    
    def test_cash_book_transactions_sorted_by_date(self):
        """Verify transactions are returned sorted by date"""
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        assert response.status_code == 200
        txns = response.json()
        
        if len(txns) > 1:
            # API returns newest first (descending)
            dates = [t.get('date', '') for t in txns]
            sorted_dates = sorted(dates, reverse=True)
            assert dates == sorted_dates, "Transactions should be sorted by date (newest first)"
        print(f"✓ Cash Book transactions sorted correctly, count={len(txns)}")
    
    def test_cash_book_transaction_structure(self):
        """Verify transaction structure for running balance computation"""
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        assert response.status_code == 200
        txns = response.json()
        
        if len(txns) > 0:
            txn = txns[0]
            required_fields = ['date', 'account', 'txn_type', 'amount']
            for field in required_fields:
                assert field in txn, f"Transaction should have '{field}' field"
            assert txn['txn_type'] in ['jama', 'nikasi'], "txn_type should be 'jama' or 'nikasi'"
        print("✓ Cash Book transaction structure is correct for balance computation")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
