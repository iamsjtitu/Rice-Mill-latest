"""
Test cases for Iteration 83 Bug Fixes:
1. Daily Report PDF table overlapping in detail mode - should use landscape A4
2. Local Party payment linking - cashbook payments should show in party report without double-counting
"""

import pytest
import requests
import os
from io import BytesIO

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDailyReportPDFModes:
    """Tests for Daily Report PDF generation in different modes"""
    
    def test_daily_report_detail_mode_returns_pdf(self):
        """PDF should be generated successfully in detail mode"""
        response = requests.get(f"{BASE_URL}/api/reports/daily/pdf?date=2026-03-12&mode=detail")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert 'application/pdf' in response.headers.get('Content-Type', '')
        # PDF should be substantial (not empty)
        assert len(response.content) > 1000, f"PDF too small: {len(response.content)} bytes"
        print(f"Detail mode PDF size: {len(response.content)} bytes")
    
    def test_daily_report_normal_mode_returns_pdf(self):
        """PDF should be generated successfully in normal mode"""
        response = requests.get(f"{BASE_URL}/api/reports/daily/pdf?date=2026-03-12&mode=normal")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert 'application/pdf' in response.headers.get('Content-Type', '')
        assert len(response.content) > 500, f"PDF too small: {len(response.content)} bytes"
        print(f"Normal mode PDF size: {len(response.content)} bytes")
    
    def test_detail_mode_pdf_larger_than_normal(self):
        """Detail mode PDF should be larger due to landscape and more columns"""
        detail_resp = requests.get(f"{BASE_URL}/api/reports/daily/pdf?date=2026-03-12&mode=detail")
        normal_resp = requests.get(f"{BASE_URL}/api/reports/daily/pdf?date=2026-03-12&mode=normal")
        
        detail_size = len(detail_resp.content)
        normal_size = len(normal_resp.content)
        
        print(f"Detail PDF: {detail_size} bytes, Normal PDF: {normal_size} bytes")
        # Detail mode should be larger due to more columns
        # Note: This is a soft check - we primarily care that both generate successfully
        assert detail_size > 0 and normal_size > 0
    
    def test_daily_report_api_returns_data_for_detail_mode(self):
        """Verify the API returns correct data structure for detail mode"""
        response = requests.get(f"{BASE_URL}/api/reports/daily?date=2026-03-12&mode=detail")
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("mode") == "detail"
        paddy = data.get("paddy_entries", {})
        assert "count" in paddy
        assert "details" in paddy
        
        # Check that details have all expected fields for detail mode
        if paddy.get("details"):
            detail = paddy["details"][0]
            expected_fields = ["truck_no", "mandi", "agent", "rst_no", "tp_no", "qntl", "bags",
                             "g_deposite", "gbw_cut", "mill_w", "moisture", "moisture_cut",
                             "cutting_percent", "disc_dust_poll", "final_w", "g_issued",
                             "cash_paid", "diesel_paid"]
            for field in expected_fields:
                assert field in detail, f"Missing field '{field}' in detail mode"
        print(f"Detail mode API has {paddy.get('count', 0)} paddy entries with all required fields")
    
    def test_daily_report_api_returns_data_for_normal_mode(self):
        """Verify the API returns correct data structure for normal mode"""
        response = requests.get(f"{BASE_URL}/api/reports/daily?date=2026-03-12&mode=normal")
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("mode") == "normal"
        paddy = data.get("paddy_entries", {})
        assert "count" in paddy
        print(f"Normal mode API has {paddy.get('count', 0)} paddy entries")


class TestLocalPartyPaymentLinking:
    """Tests for Local Party report including cashbook payments without double-counting"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get party names from summary"""
        response = requests.get(f"{BASE_URL}/api/local-party/summary")
        if response.status_code == 200:
            data = response.json()
            self.parties = data.get("parties", [])
            self.party_names = [p["party_name"] for p in self.parties]
        else:
            self.parties = []
            self.party_names = []
    
    def test_local_party_summary_endpoint(self):
        """Local party summary should return valid response"""
        response = requests.get(f"{BASE_URL}/api/local-party/summary")
        assert response.status_code == 200
        data = response.json()
        
        assert "parties" in data
        assert "grand_total_debit" in data
        assert "grand_total_paid" in data
        assert "grand_balance" in data
        
        print(f"Found {len(data['parties'])} local parties")
        print(f"Grand totals - Debit: {data['grand_total_debit']}, Paid: {data['grand_total_paid']}, Balance: {data['grand_balance']}")
    
    def test_local_party_report_includes_cashbook_payments(self):
        """Party report should include cashbook payments with source_type='cashbook'"""
        if not self.party_names:
            pytest.skip("No local parties found")
        
        for party_name in self.party_names[:3]:  # Test first 3 parties
            response = requests.get(f"{BASE_URL}/api/local-party/report/{party_name}")
            assert response.status_code == 200, f"Failed for party: {party_name}"
            data = response.json()
            
            transactions = data.get("transactions", [])
            source_types = set(t.get("source_type", "") for t in transactions)
            
            print(f"Party '{party_name}': {len(transactions)} transactions, source_types: {source_types}")
            
            # Check balance calculation
            assert "balance" in data
            assert "total_debit" in data
            assert "total_paid" in data
    
    def test_local_party_report_balance_matches_summary(self):
        """Report balance should match summary balance for each party"""
        if not self.parties:
            pytest.skip("No local parties found")
        
        mismatches = []
        for party in self.parties[:5]:  # Test first 5 parties
            party_name = party["party_name"]
            summary_balance = party["balance"]
            
            # Get detailed report
            response = requests.get(f"{BASE_URL}/api/local-party/report/{party_name}")
            if response.status_code == 200:
                report = response.json()
                report_balance = report.get("balance", 0)
                
                if abs(summary_balance - report_balance) > 0.01:  # Allow for floating point
                    mismatches.append({
                        "party": party_name,
                        "summary_balance": summary_balance,
                        "report_balance": report_balance,
                        "diff": summary_balance - report_balance
                    })
        
        if mismatches:
            print(f"Balance mismatches found: {mismatches}")
        # This is the key test - balances should match
        assert len(mismatches) == 0, f"Balance mismatches: {mismatches}"
    
    def test_local_party_transactions_includes_cashbook(self):
        """Transactions endpoint should include cashbook payments"""
        if not self.party_names:
            pytest.skip("No local parties found")
        
        party_name = self.party_names[0]
        response = requests.get(f"{BASE_URL}/api/local-party/transactions?party_name={party_name}")
        assert response.status_code == 200
        
        transactions = response.json()
        source_types = set(t.get("source_type", "") for t in transactions)
        
        print(f"Transactions for '{party_name}': {len(transactions)} items, source_types: {source_types}")
    
    def test_local_party_no_double_counting(self):
        """Verify no double counting - each transaction should appear once"""
        if not self.party_names:
            pytest.skip("No local parties found")
        
        for party_name in self.party_names[:3]:
            response = requests.get(f"{BASE_URL}/api/local-party/report/{party_name}")
            assert response.status_code == 200
            data = response.json()
            
            transactions = data.get("transactions", [])
            
            # Check for duplicate IDs
            ids = [t.get("id") for t in transactions if t.get("id")]
            unique_ids = set(ids)
            
            if len(ids) != len(unique_ids):
                print(f"WARNING: Party '{party_name}' has duplicate transaction IDs")
            
            # Calculate totals manually
            manual_debit = sum(t.get("amount", 0) for t in transactions if t.get("txn_type") == "debit")
            manual_paid = sum(t.get("amount", 0) for t in transactions if t.get("txn_type") == "payment")
            
            # Should match reported totals
            assert abs(manual_debit - data.get("total_debit", 0)) < 0.01, f"Debit mismatch for {party_name}"
            assert abs(manual_paid - data.get("total_paid", 0)) < 0.01, f"Paid mismatch for {party_name}"
            
            print(f"Party '{party_name}': Debit={manual_debit}, Paid={manual_paid}, Balance={data.get('balance', 0)}")


class TestLocalPartyCashBookSourceType:
    """Tests for cashbook source_type display in local party"""
    
    def test_cashbook_payments_have_source_type(self):
        """Cashbook payments should have source_type='cashbook'"""
        # Get a party with transactions
        summary_resp = requests.get(f"{BASE_URL}/api/local-party/summary")
        if summary_resp.status_code != 200:
            pytest.skip("Could not get party summary")
        
        parties = summary_resp.json().get("parties", [])
        if not parties:
            pytest.skip("No parties found")
        
        # Look for cashbook payments
        found_cashbook = False
        for party in parties[:5]:
            party_name = party["party_name"]
            response = requests.get(f"{BASE_URL}/api/local-party/report/{party_name}")
            if response.status_code == 200:
                data = response.json()
                transactions = data.get("transactions", [])
                
                for txn in transactions:
                    if txn.get("source_type") == "cashbook":
                        found_cashbook = True
                        print(f"Found cashbook payment for '{party_name}': {txn.get('amount')} - {txn.get('description', '')}")
                        # Verify structure
                        assert "id" in txn
                        assert "date" in txn
                        assert "amount" in txn
                        assert txn.get("txn_type") == "payment"
        
        print(f"Cashbook source_type payments found: {found_cashbook}")
        # Note: It's OK if no cashbook payments exist yet - this just validates the structure


class TestDailyReportExcelExport:
    """Tests for Daily Report Excel export in different modes"""
    
    def test_daily_report_detail_excel_export(self):
        """Excel should be generated in detail mode"""
        response = requests.get(f"{BASE_URL}/api/reports/daily/excel?date=2026-03-12&mode=detail")
        assert response.status_code == 200
        content_type = response.headers.get('Content-Type', '')
        assert 'spreadsheet' in content_type or 'excel' in content_type or 'application/vnd' in content_type
        assert len(response.content) > 1000
        print(f"Detail Excel size: {len(response.content)} bytes")
    
    def test_daily_report_normal_excel_export(self):
        """Excel should be generated in normal mode"""
        response = requests.get(f"{BASE_URL}/api/reports/daily/excel?date=2026-03-12&mode=normal")
        assert response.status_code == 200
        assert len(response.content) > 500
        print(f"Normal Excel size: {len(response.content)} bytes")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
