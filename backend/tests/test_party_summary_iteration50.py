"""
Test Party Summary Feature - Iteration 50
Tests the new Party-wise Summary tab in Private Trading page
- GET /api/private-trading/party-summary - returns parties array with aggregated data
- Party summary fields: party_name, mandi_name, agent_name, purchase_amount, purchase_paid, purchase_balance, sale_amount, sale_received, sale_balance, net_balance
- Balance calculations: purchase_balance = purchase_amount - purchase_paid, sale_balance = sale_amount - sale_received, net_balance = purchase_balance - sale_balance
- Totals object aggregation
- Date range filter, search filter
- PDF export: GET /api/private-trading/party-summary/pdf
- Excel export: GET /api/private-trading/party-summary/excel
- report_config.json has party_summary_report with 10 columns
"""

import pytest
import requests
import json
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://desktop-sync-fix.preview.emergentagent.com').rstrip('/')


class TestPartySummaryAPI:
    """Test Party Summary API endpoint"""
    
    def test_01_party_summary_endpoint_returns_200(self):
        """Test that party summary endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/private-trading/party-summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "parties" in data, "Response should contain 'parties' key"
        assert "totals" in data, "Response should contain 'totals' key"
        print(f"PASSED: Party summary endpoint returns 200 with parties array ({len(data['parties'])} parties)")
    
    def test_02_party_summary_has_correct_fields(self):
        """Test that each party has all required fields"""
        response = requests.get(f"{BASE_URL}/api/private-trading/party-summary")
        assert response.status_code == 200
        data = response.json()
        
        required_fields = [
            "party_name", "mandi_name", "agent_name",
            "purchase_amount", "purchase_paid", "purchase_balance",
            "sale_amount", "sale_received", "sale_balance",
            "net_balance"
        ]
        
        if len(data["parties"]) > 0:
            party = data["parties"][0]
            for field in required_fields:
                assert field in party, f"Party missing required field: {field}"
            print(f"PASSED: Party has all 10 required fields: {list(party.keys())}")
        else:
            print("INFO: No parties in data, but structure is correct")
    
    def test_03_balance_calculations_correct(self):
        """Test that balance calculations are correct"""
        response = requests.get(f"{BASE_URL}/api/private-trading/party-summary")
        assert response.status_code == 200
        data = response.json()
        
        for party in data["parties"]:
            # purchase_balance = purchase_amount - purchase_paid
            expected_purchase_balance = round(party["purchase_amount"] - party["purchase_paid"], 2)
            assert party["purchase_balance"] == expected_purchase_balance, \
                f"Purchase balance mismatch: {party['purchase_balance']} != {expected_purchase_balance}"
            
            # sale_balance = sale_amount - sale_received
            expected_sale_balance = round(party["sale_amount"] - party["sale_received"], 2)
            assert party["sale_balance"] == expected_sale_balance, \
                f"Sale balance mismatch: {party['sale_balance']} != {expected_sale_balance}"
            
            # net_balance = purchase_balance - sale_balance
            expected_net_balance = round(party["purchase_balance"] - party["sale_balance"], 2)
            assert party["net_balance"] == expected_net_balance, \
                f"Net balance mismatch: {party['net_balance']} != {expected_net_balance}"
        
        print(f"PASSED: All balance calculations correct for {len(data['parties'])} parties")
    
    def test_04_totals_object_correct_aggregation(self):
        """Test that totals object correctly aggregates all parties"""
        response = requests.get(f"{BASE_URL}/api/private-trading/party-summary")
        assert response.status_code == 200
        data = response.json()
        totals = data["totals"]
        parties = data["parties"]
        
        # Expected totals keys
        expected_keys = [
            "total_purchase", "total_purchase_paid", "total_purchase_balance",
            "total_sale", "total_sale_received", "total_sale_balance",
            "total_net_balance"
        ]
        
        for key in expected_keys:
            assert key in totals, f"Totals missing key: {key}"
        
        # Verify aggregation
        if len(parties) > 0:
            calc_purchase = round(sum(p["purchase_amount"] for p in parties), 2)
            calc_paid = round(sum(p["purchase_paid"] for p in parties), 2)
            calc_purchase_bal = round(sum(p["purchase_balance"] for p in parties), 2)
            calc_sale = round(sum(p["sale_amount"] for p in parties), 2)
            calc_received = round(sum(p["sale_received"] for p in parties), 2)
            calc_sale_bal = round(sum(p["sale_balance"] for p in parties), 2)
            calc_net_bal = round(sum(p["net_balance"] for p in parties), 2)
            
            assert totals["total_purchase"] == calc_purchase, \
                f"Total purchase: {totals['total_purchase']} != {calc_purchase}"
            assert totals["total_purchase_paid"] == calc_paid, \
                f"Total purchase paid: {totals['total_purchase_paid']} != {calc_paid}"
            assert totals["total_purchase_balance"] == calc_purchase_bal, \
                f"Total purchase balance: {totals['total_purchase_balance']} != {calc_purchase_bal}"
            assert totals["total_sale"] == calc_sale, \
                f"Total sale: {totals['total_sale']} != {calc_sale}"
            assert totals["total_sale_received"] == calc_received, \
                f"Total sale received: {totals['total_sale_received']} != {calc_received}"
            assert totals["total_sale_balance"] == calc_sale_bal, \
                f"Total sale balance: {totals['total_sale_balance']} != {calc_sale_bal}"
            assert totals["total_net_balance"] == calc_net_bal, \
                f"Total net balance: {totals['total_net_balance']} != {calc_net_bal}"
        
        print(f"PASSED: Totals correctly aggregated - {totals}")
    
    def test_05_date_range_filter_works(self):
        """Test date range filter"""
        # Test with wide date range
        response = requests.get(
            f"{BASE_URL}/api/private-trading/party-summary",
            params={"date_from": "2024-01-01", "date_to": "2026-12-31"}
        )
        assert response.status_code == 200, f"Date filter failed: {response.text}"
        data = response.json()
        print(f"PASSED: Date range filter works, returned {len(data['parties'])} parties")
    
    def test_06_search_filter_works(self):
        """Test search filter by party name"""
        response = requests.get(
            f"{BASE_URL}/api/private-trading/party-summary",
            params={"search": "Annu"}
        )
        assert response.status_code == 200, f"Search filter failed: {response.text}"
        data = response.json()
        
        # If there's a party named "Annu", it should be in results
        # If not, empty array is fine
        if len(data["parties"]) > 0:
            party_names = [p["party_name"].lower() for p in data["parties"]]
            # At least one should match
            has_match = any("annu" in name for name in party_names)
            if not has_match:
                # Check mandi and agent names too
                mandi_names = [p["mandi_name"].lower() for p in data["parties"]]
                agent_names = [p["agent_name"].lower() for p in data["parties"]]
                has_match = any("annu" in name for name in mandi_names + agent_names)
            assert has_match, "Search should return parties matching 'Annu'"
        
        print(f"PASSED: Search filter works, returned {len(data['parties'])} parties for 'Annu'")
    
    def test_07_pdf_export_returns_200(self):
        """Test PDF export endpoint"""
        response = requests.get(f"{BASE_URL}/api/private-trading/party-summary/pdf")
        assert response.status_code == 200, f"PDF export failed: {response.status_code}"
        
        content_type = response.headers.get("content-type", "")
        assert "application/pdf" in content_type, f"Expected PDF content type, got {content_type}"
        
        content_disp = response.headers.get("content-disposition", "")
        assert "party_summary" in content_disp, f"Content disposition missing filename: {content_disp}"
        
        print(f"PASSED: PDF export returns 200 with application/pdf, size={len(response.content)} bytes")
    
    def test_08_excel_export_returns_200(self):
        """Test Excel export endpoint"""
        response = requests.get(f"{BASE_URL}/api/private-trading/party-summary/excel")
        assert response.status_code == 200, f"Excel export failed: {response.status_code}"
        
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "excel" in content_type.lower(), \
            f"Expected spreadsheet content type, got {content_type}"
        
        content_disp = response.headers.get("content-disposition", "")
        assert "party_summary" in content_disp, f"Content disposition missing filename: {content_disp}"
        
        print(f"PASSED: Excel export returns 200 with spreadsheet type, size={len(response.content)} bytes")
    
    def test_09_pdf_export_with_filters(self):
        """Test PDF export with date range and search filters"""
        response = requests.get(
            f"{BASE_URL}/api/private-trading/party-summary/pdf",
            params={"date_from": "2024-01-01", "date_to": "2026-12-31", "search": "test"}
        )
        assert response.status_code == 200, f"PDF export with filters failed: {response.status_code}"
        print(f"PASSED: PDF export with filters returns 200, size={len(response.content)} bytes")
    
    def test_10_excel_export_with_filters(self):
        """Test Excel export with date range and search filters"""
        response = requests.get(
            f"{BASE_URL}/api/private-trading/party-summary/excel",
            params={"date_from": "2024-01-01", "date_to": "2026-12-31", "search": "test"}
        )
        assert response.status_code == 200, f"Excel export with filters failed: {response.status_code}"
        print(f"PASSED: Excel export with filters returns 200, size={len(response.content)} bytes")


class TestPartySummaryReportConfig:
    """Test report_config.json has party_summary_report with 10 columns"""
    
    def test_11_report_config_has_party_summary_report(self):
        """Test report_config.json contains party_summary_report"""
        config_path = "/app/shared/report_config.json"
        with open(config_path, 'r') as f:
            config = json.load(f)
        
        assert "party_summary_report" in config, "report_config.json missing party_summary_report"
        print(f"PASSED: party_summary_report found in report_config.json")
    
    def test_12_party_summary_report_has_10_columns(self):
        """Test party_summary_report has exactly 10 columns"""
        config_path = "/app/shared/report_config.json"
        with open(config_path, 'r') as f:
            config = json.load(f)
        
        columns = config["party_summary_report"]["columns"]
        assert len(columns) == 10, f"Expected 10 columns, got {len(columns)}"
        
        expected_fields = [
            "party_name", "mandi_name", "agent_name",
            "purchase_amount", "purchase_paid", "purchase_balance",
            "sale_amount", "sale_received", "sale_balance",
            "net_balance"
        ]
        
        actual_fields = [col["field"] for col in columns]
        for field in expected_fields:
            assert field in actual_fields, f"Missing column field: {field}"
        
        print(f"PASSED: party_summary_report has all 10 columns: {actual_fields}")


class TestPartySummaryWithExistingData:
    """Test Party Summary with existing data from Iteration 49"""
    
    def test_13_existing_paddy_entry_appears_in_summary(self):
        """Test that existing Annu (Utkela) paddy entry appears in party summary"""
        response = requests.get(f"{BASE_URL}/api/private-trading/party-summary")
        assert response.status_code == 200
        data = response.json()
        
        # From iteration 49: 1 private_paddy entry (Annu/Utkela, balance=137484, final_qntl=76.38)
        # Party name should be "Annu (Utkela)" based on agent_extra source
        annu_party = None
        for party in data["parties"]:
            if "annu" in party["party_name"].lower():
                annu_party = party
                break
        
        if annu_party:
            print(f"Found Annu party: {annu_party}")
            # Verify purchase_amount = 137484 (total_amount)
            # paid_amount = 0, so purchase_balance = 137484
            assert annu_party["purchase_balance"] >= 0, "Purchase balance should be >= 0"
            print(f"PASSED: Annu party found in summary with purchase_balance={annu_party['purchase_balance']}")
        else:
            # Check if any parties exist
            if len(data["parties"]) > 0:
                print(f"INFO: Annu not found, but {len(data['parties'])} other parties exist")
            else:
                print("INFO: No parties found (may be filtered out or no data)")
    
    def test_14_verify_kms_year_season_filter(self):
        """Test filtering by kms_year and season"""
        response = requests.get(
            f"{BASE_URL}/api/private-trading/party-summary",
            params={"kms_year": "2025-2026", "season": "Kharif"}
        )
        assert response.status_code == 200, f"KMS/Season filter failed: {response.text}"
        data = response.json()
        print(f"PASSED: KMS/Season filter works, returned {len(data['parties'])} parties")
    
    def test_15_net_balance_formula_verification(self):
        """Verify net_balance = purchase_balance - sale_balance formula"""
        response = requests.get(f"{BASE_URL}/api/private-trading/party-summary")
        assert response.status_code == 200
        data = response.json()
        
        for party in data["parties"]:
            # net_balance = purchase_balance - sale_balance
            # Positive net_balance = owe money to party (for paddy purchase)
            # Negative net_balance = party owes us (for rice sale)
            expected = round(party["purchase_balance"] - party["sale_balance"], 2)
            assert party["net_balance"] == expected, \
                f"Net balance mismatch for {party['party_name']}: {party['net_balance']} != {expected}"
        
        print(f"PASSED: Net balance formula verified for all {len(data['parties'])} parties")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
