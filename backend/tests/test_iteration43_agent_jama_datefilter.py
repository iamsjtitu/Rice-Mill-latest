"""
Iteration 43 Tests: Agent Mark Paid Jama Entry Bug Fix + Date Range Filter
==========================================================================
Tests for:
1. Agent Mark Paid creates BOTH jama (ledger) AND nikasi (cash) entries
2. Undo-paid deletes BOTH jama and nikasi entries
3. Date range filter for Agent & Mandi Wise Report
4. Excel/PDF export with date range params

Note: Auth is passed via query params: ?username=admin&role=admin
Cash book endpoint: /api/cash-book
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAgentMarkPaidJamaEntry:
    """Test that Agent Mark Paid creates BOTH jama and nikasi entries in cash book"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - create session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login to set cookies
        self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        self.kms_year = "2025-2026"
        self.season = "Kharif"
        # Auth params passed in query string
        self.auth_params = {"username": "admin", "role": "admin"}
        yield
        self.session.close()
    
    def get_cash_book_transactions(self):
        """Helper to get all cash book transactions"""
        res = self.session.get(f"{BASE_URL}/api/cash-book", params={
            "kms_year": self.kms_year,
            "season": self.season
        })
        if res.status_code == 200:
            data = res.json()
            # API returns list directly
            if isinstance(data, list):
                return data
            return data.get("transactions", [])
        return []
    
    def test_01_undo_kesinga_payment(self):
        """Step 1: Undo Kesinga payment to reset state"""
        params = {**self.auth_params, "kms_year": self.kms_year, "season": self.season}
        res = self.session.post(
            f"{BASE_URL}/api/agent-payments/Kesinga/undo-paid",
            params=params
        )
        # Should succeed or return 404 if already not paid
        assert res.status_code in [200, 404], f"Undo Kesinga failed: {res.status_code} - {res.text}"
        if res.status_code == 200:
            print(f"PASSED: Kesinga payment undone successfully")
        else:
            print(f"PASSED: Kesinga had no payment to undo (404 expected)")
    
    def test_02_undo_utkela_payment(self):
        """Step 2: Undo Utkela payment to reset state"""
        params = {**self.auth_params, "kms_year": self.kms_year, "season": self.season}
        res = self.session.post(
            f"{BASE_URL}/api/agent-payments/Utkela/undo-paid",
            params=params
        )
        assert res.status_code in [200, 404], f"Undo Utkela failed: {res.status_code} - {res.text}"
        if res.status_code == 200:
            print(f"PASSED: Utkela payment undone successfully")
        else:
            print(f"PASSED: Utkela had no payment to undo")
    
    def test_03_verify_no_jama_entry_before_mark_paid(self):
        """Step 3: Verify no jama entries exist for Kesinga before mark-paid"""
        transactions = self.get_cash_book_transactions()
        
        # Check for Kesinga jama entry with specific linked_payment_id pattern
        kesinga_jama = [t for t in transactions 
                       if t.get("linked_payment_id") == f"agent_jama:Kesinga:{self.kms_year}:{self.season}"]
        
        assert len(kesinga_jama) == 0, f"Unexpected Kesinga jama entry found before mark-paid: {kesinga_jama}"
        print("PASSED: No Kesinga jama entry exists before mark-paid")
    
    def test_04_mark_kesinga_paid(self):
        """Step 4: Mark Kesinga as paid - should create BOTH jama and nikasi entries"""
        params = {**self.auth_params, "kms_year": self.kms_year, "season": self.season}
        res = self.session.post(
            f"{BASE_URL}/api/agent-payments/Kesinga/mark-paid",
            params=params
        )
        assert res.status_code == 200, f"Mark Kesinga paid failed: {res.status_code} - {res.text}"
        data = res.json()
        assert data.get("success") == True, f"Mark paid didn't return success: {data}"
        print(f"PASSED: Kesinga marked as paid - {data.get('message', '')}")
    
    def test_05_verify_kesinga_jama_entry_created(self):
        """Step 5: Verify jama (ledger) entry was created for Kesinga"""
        transactions = self.get_cash_book_transactions()
        
        # Find Kesinga jama entry
        kesinga_jama = [t for t in transactions 
                       if t.get("linked_payment_id") == f"agent_jama:Kesinga:{self.kms_year}:{self.season}"]
        
        assert len(kesinga_jama) >= 1, f"MISSING JAMA: Kesinga jama entry NOT created after mark-paid! Total transactions: {len(transactions)}, agent-related: {[t for t in transactions if 'Kesinga' in str(t)]}"
        
        jama = kesinga_jama[0]
        assert jama.get("txn_type") == "jama", f"Expected txn_type='jama', got {jama.get('txn_type')}"
        assert jama.get("account") == "ledger", f"Expected account='ledger', got {jama.get('account')}"
        assert jama.get("party_type") == "Agent", f"Expected party_type='Agent', got {jama.get('party_type')}"
        assert float(jama.get("amount", 0)) > 0, f"Jama amount should be > 0, got {jama.get('amount')}"
        
        print(f"PASSED: Kesinga JAMA entry created - amount: Rs.{jama.get('amount')}, account: {jama.get('account')}, txn_type: {jama.get('txn_type')}")
    
    def test_06_verify_kesinga_nikasi_entry_created(self):
        """Step 6: Verify nikasi (cash) entry was created for Kesinga"""
        transactions = self.get_cash_book_transactions()
        
        # Find Kesinga nikasi entry
        kesinga_nikasi = [t for t in transactions 
                        if t.get("linked_payment_id") == f"agent:Kesinga:{self.kms_year}:{self.season}"]
        
        assert len(kesinga_nikasi) >= 1, f"MISSING NIKASI: Kesinga nikasi entry NOT created! Total transactions: {len(transactions)}"
        
        nikasi = kesinga_nikasi[0]
        assert nikasi.get("txn_type") == "nikasi", f"Expected txn_type='nikasi', got {nikasi.get('txn_type')}"
        assert nikasi.get("account") == "cash", f"Expected account='cash', got {nikasi.get('account')}"
        
        print(f"PASSED: Kesinga NIKASI entry created - amount: Rs.{nikasi.get('amount')}, account: {nikasi.get('account')}")
    
    def test_07_mark_utkela_paid(self):
        """Step 7: Mark Utkela as paid - should also create BOTH entries"""
        params = {**self.auth_params, "kms_year": self.kms_year, "season": self.season}
        res = self.session.post(
            f"{BASE_URL}/api/agent-payments/Utkela/mark-paid",
            params=params
        )
        assert res.status_code == 200, f"Mark Utkela paid failed: {res.status_code} - {res.text}"
        print(f"PASSED: Utkela marked as paid")
    
    def test_08_verify_utkela_jama_entry_created(self):
        """Step 8: Verify jama entry was created for Utkela"""
        transactions = self.get_cash_book_transactions()
        
        # Find Utkela jama entry
        utkela_jama = [t for t in transactions 
                      if t.get("linked_payment_id") == f"agent_jama:Utkela:{self.kms_year}:{self.season}"]
        
        assert len(utkela_jama) >= 1, f"MISSING JAMA: Utkela jama entry NOT created!"
        
        jama = utkela_jama[0]
        assert jama.get("txn_type") == "jama"
        assert jama.get("account") == "ledger"
        
        print(f"PASSED: Utkela JAMA entry created - amount: Rs.{jama.get('amount')}")


class TestAgentUndoPaidDeletesBothEntries:
    """Test that undo-paid deletes BOTH jama and nikasi entries"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin", "password": "admin123"
        })
        self.kms_year = "2025-2026"
        self.season = "Kharif"
        self.auth_params = {"username": "admin", "role": "admin"}
        yield
        self.session.close()
    
    def get_cash_book_transactions(self):
        res = self.session.get(f"{BASE_URL}/api/cash-book", params={
            "kms_year": self.kms_year, "season": self.season
        })
        if res.status_code == 200:
            data = res.json()
            if isinstance(data, list):
                return data
            return data.get("transactions", [])
        return []
    
    def test_09_undo_kesinga_payment(self):
        """Step 9: Undo Kesinga payment - should delete BOTH entries"""
        params = {**self.auth_params, "kms_year": self.kms_year, "season": self.season}
        res = self.session.post(
            f"{BASE_URL}/api/agent-payments/Kesinga/undo-paid",
            params=params
        )
        assert res.status_code in [200, 404]
        print(f"PASSED: Kesinga undo-paid called (status: {res.status_code})")
    
    def test_10_verify_kesinga_jama_deleted(self):
        """Step 10: Verify Kesinga jama entry was deleted after undo"""
        transactions = self.get_cash_book_transactions()
        
        kesinga_jama = [t for t in transactions 
                       if t.get("linked_payment_id") == f"agent_jama:Kesinga:{self.kms_year}:{self.season}"]
        
        assert len(kesinga_jama) == 0, f"Kesinga jama entry NOT deleted after undo! Found: {kesinga_jama}"
        print("PASSED: Kesinga JAMA entry deleted after undo-paid")
    
    def test_11_verify_kesinga_nikasi_deleted(self):
        """Step 11: Verify Kesinga nikasi entry was deleted after undo"""
        transactions = self.get_cash_book_transactions()
        
        kesinga_nikasi = [t for t in transactions 
                        if t.get("linked_payment_id") == f"agent:Kesinga:{self.kms_year}:{self.season}"]
        
        assert len(kesinga_nikasi) == 0, f"Kesinga nikasi entry NOT deleted after undo! Found: {kesinga_nikasi}"
        print("PASSED: Kesinga NIKASI entry deleted after undo-paid")


class TestDateRangeFilterAgentMandiReport:
    """Test date range filter for Agent & Mandi Wise Report"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin", "password": "admin123"
        })
        yield
        self.session.close()
    
    def test_12_date_range_filter_returns_data(self):
        """Step 12: Date range filter should return entries within range"""
        # Test with date that has data (2026-03-11 based on context)
        res = self.session.get(f"{BASE_URL}/api/reports/agent-mandi-wise", params={
            "date_from": "2026-03-11",
            "date_to": "2026-03-11"
        })
        assert res.status_code == 200, f"Agent mandi report failed: {res.text}"
        
        data = res.json()
        assert "mandis" in data, f"Response missing 'mandis' key: {data.keys()}"
        assert "grand_totals" in data, f"Response missing 'grand_totals' key"
        
        # Check that entries exist or are correctly filtered
        total_entries = data["grand_totals"].get("entry_count", 0)
        print(f"PASSED: Date range filter returned {total_entries} entries for 2026-03-11")
    
    def test_13_future_date_returns_zero_entries(self):
        """Step 13: Future date range should return 0 entries"""
        res = self.session.get(f"{BASE_URL}/api/reports/agent-mandi-wise", params={
            "date_from": "2030-01-01",
            "date_to": "2030-12-31"
        })
        assert res.status_code == 200
        
        data = res.json()
        total_entries = data["grand_totals"].get("entry_count", 0)
        
        assert total_entries == 0, f"Expected 0 entries for future dates, got {total_entries}"
        print(f"PASSED: Future date range correctly returns 0 entries")
    
    def test_14_date_from_only_filter(self):
        """Step 14: Test with only date_from param"""
        res = self.session.get(f"{BASE_URL}/api/reports/agent-mandi-wise", params={
            "date_from": "2020-01-01"
        })
        assert res.status_code == 200
        data = res.json()
        assert "mandis" in data
        print(f"PASSED: date_from only filter works - {data['grand_totals'].get('entry_count', 0)} entries")
    
    def test_15_date_to_only_filter(self):
        """Step 15: Test with only date_to param"""
        res = self.session.get(f"{BASE_URL}/api/reports/agent-mandi-wise", params={
            "date_to": "2030-12-31"
        })
        assert res.status_code == 200
        data = res.json()
        assert "mandis" in data
        print(f"PASSED: date_to only filter works - {data['grand_totals'].get('entry_count', 0)} entries")


class TestExcelPdfExportWithDateRange:
    """Test Excel and PDF exports with date range params"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin", "password": "admin123"
        })
        yield
        self.session.close()
    
    def test_16_excel_export_with_date_range(self):
        """Step 16: Excel export should work with date range params"""
        res = self.session.get(f"{BASE_URL}/api/reports/agent-mandi-wise/excel", params={
            "date_from": "2026-03-11",
            "date_to": "2026-03-11"
        })
        assert res.status_code == 200, f"Excel export failed: {res.text}"
        
        content_type = res.headers.get("Content-Type", "")
        assert "spreadsheet" in content_type or "octet-stream" in content_type or len(res.content) > 0
        
        # Verify file content starts with Excel signature (PK for zip-based xlsx)
        assert res.content[:2] == b'PK', f"Invalid Excel file - expected PK header"
        
        print(f"PASSED: Excel export with date range - {len(res.content)} bytes")
    
    def test_17_pdf_export_with_date_range(self):
        """Step 17: PDF export should work with date range params"""
        res = self.session.get(f"{BASE_URL}/api/reports/agent-mandi-wise/pdf", params={
            "date_from": "2026-03-11"
        })
        assert res.status_code == 200, f"PDF export failed: {res.text}"
        
        # PDF should start with %PDF
        assert res.content[:4] == b'%PDF', f"Invalid PDF file - expected %PDF header, got {res.content[:10]}"
        
        print(f"PASSED: PDF export with date range - {len(res.content)} bytes")


class TestAgentPaymentStatusAfterMarkPaid:
    """Verify agent payment status after mark-paid"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin", "password": "admin123"
        })
        self.kms_year = "2025-2026"
        self.season = "Kharif"
        self.auth_params = {"username": "admin", "role": "admin"}
        yield
        self.session.close()
    
    def test_18_re_mark_kesinga_paid(self):
        """Step 18: Re-mark Kesinga as paid for status verification"""
        params = {**self.auth_params, "kms_year": self.kms_year, "season": self.season}
        res = self.session.post(
            f"{BASE_URL}/api/agent-payments/Kesinga/mark-paid",
            params=params
        )
        assert res.status_code == 200, f"Re-mark Kesinga failed: {res.status_code} - {res.text}"
        print("PASSED: Kesinga re-marked as paid")
    
    def test_19_verify_agent_payment_status_is_paid(self):
        """Step 19: Verify Kesinga shows status=paid in agent-payments list"""
        res = self.session.get(f"{BASE_URL}/api/agent-payments", params={
            "kms_year": self.kms_year,
            "season": self.season
        })
        assert res.status_code == 200, f"Get agent payments failed: {res.text}"
        
        payments = res.json()
        kesinga_payment = next((p for p in payments if p.get("mandi_name") == "Kesinga"), None)
        
        assert kesinga_payment is not None, f"Kesinga not found in agent payments: {payments}"
        assert kesinga_payment.get("status") == "paid", f"Expected status='paid', got {kesinga_payment.get('status')}"
        assert kesinga_payment.get("balance_amount", 1) <= 0, f"Expected balance_amount=0, got {kesinga_payment.get('balance_amount')}"
        
        print(f"PASSED: Kesinga status={kesinga_payment.get('status')}, balance={kesinga_payment.get('balance_amount')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
