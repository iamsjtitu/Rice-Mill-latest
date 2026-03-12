"""
Iteration 84 Tests - FY Summary with Ledger Parties, Carry Forward API, and Local Party Summary Bar Fix

Features tested:
1. Local Party API: Summary data for party-specific display
2. FY Summary GET: Returns all 11 sections including ledger_parties
3. FY Summary Carry Forward POST: Saves closing balances as next FY opening balances
4. FY Summary PDF: Exports with all sections including Ledger Parties
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
AUTH_PAYLOAD = {"username": "admin", "password": "admin123"}


@pytest.fixture(scope="session")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def auth_headers(api_client):
    """Get authentication headers"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json=AUTH_PAYLOAD)
    if response.status_code == 200:
        token = response.json().get("token")
        return {"Authorization": f"Bearer {token}"}
    pytest.skip("Authentication failed - skipping authenticated tests")


class TestLocalPartySummary:
    """Test Local Party summary endpoint - verifies data structure for summary bar"""
    
    def test_local_party_summary_returns_parties_list(self, api_client, auth_headers):
        """Summary should return parties list with individual party totals"""
        response = api_client.get(f"{BASE_URL}/api/local-party/summary?kms_year=2025-26", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        # Should have parties list
        assert "parties" in data, "Missing parties list in summary"
        # Should have grand totals
        assert "grand_total_debit" in data, "Missing grand_total_debit"
        assert "grand_total_paid" in data, "Missing grand_total_paid"
        assert "grand_balance" in data, "Missing grand_balance"
        print(f"PASSED: Local party summary has {len(data.get('parties', []))} parties with grand totals")
    
    def test_local_party_report_single_party(self, api_client, auth_headers):
        """Report endpoint should return party-specific data with running balance"""
        # First get a party name from summary
        summary = api_client.get(f"{BASE_URL}/api/local-party/summary?kms_year=2025-26", headers=auth_headers)
        parties = summary.json().get("parties", [])
        if not parties:
            pytest.skip("No local parties found in test data")
        
        party_name = parties[0]["party_name"]
        response = api_client.get(f"{BASE_URL}/api/local-party/report/{party_name}?kms_year=2025-26", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Should have party-specific totals
        assert "total_debit" in data, "Missing total_debit"
        assert "total_paid" in data, "Missing total_paid"
        assert "balance" in data, "Missing balance"
        assert "transactions" in data, "Missing transactions"
        assert data["party_name"] == party_name, "Party name mismatch"
        print(f"PASSED: Party report for '{party_name}' - Balance: {data['balance']}, Transactions: {len(data['transactions'])}")


class TestFYSummaryEndpoint:
    """Test FY Summary API - all 11 sections including ledger_parties"""
    
    def test_fy_summary_returns_all_sections(self, api_client, auth_headers):
        """FY Summary should return all 11 sections"""
        response = api_client.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-26", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify all 11 sections exist
        required_sections = [
            "cash_bank", "paddy_stock", "milling", "frk_stock", "byproducts",
            "mill_parts", "diesel", "local_party", "staff_advances",
            "private_trading", "ledger_parties"
        ]
        for section in required_sections:
            assert section in data, f"Missing section: {section}"
        
        print(f"PASSED: FY Summary has all {len(required_sections)} sections")
    
    def test_fy_summary_cash_bank_structure(self, api_client, auth_headers):
        """Cash & Bank section should have opening, in/out, closing for cash and bank"""
        response = api_client.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-26", headers=auth_headers)
        data = response.json()
        cb = data.get("cash_bank", {})
        
        required_fields = ["opening_cash", "cash_in", "cash_out", "closing_cash",
                          "opening_bank", "bank_in", "bank_out", "closing_bank"]
        for field in required_fields:
            assert field in cb, f"Cash bank missing: {field}"
        
        # Verify calculation: closing = opening + in - out
        calc_closing_cash = cb["opening_cash"] + cb["cash_in"] - cb["cash_out"]
        assert round(cb["closing_cash"], 2) == round(calc_closing_cash, 2), "Cash closing calculation mismatch"
        print(f"PASSED: Cash & Bank structure valid - Closing Cash: {cb['closing_cash']}, Closing Bank: {cb['closing_bank']}")
    
    def test_fy_summary_ledger_parties_section(self, api_client, auth_headers):
        """Ledger Parties section should have totals and party-level details"""
        response = api_client.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-26", headers=auth_headers)
        data = response.json()
        ledger = data.get("ledger_parties", {})
        
        # Check totals
        assert "total_parties" in ledger, "Missing total_parties in ledger_parties"
        assert "total_opening" in ledger, "Missing total_opening in ledger_parties"
        assert "total_jama" in ledger, "Missing total_jama in ledger_parties"
        assert "total_nikasi" in ledger, "Missing total_nikasi in ledger_parties"
        assert "total_closing" in ledger, "Missing total_closing in ledger_parties"
        assert "parties" in ledger, "Missing parties list in ledger_parties"
        
        # Check party structure if any parties exist
        if ledger.get("parties"):
            party = ledger["parties"][0]
            assert "party_name" in party, "Missing party_name in ledger party"
            assert "opening_balance" in party, "Missing opening_balance in ledger party"
            assert "total_jama" in party, "Missing total_jama in ledger party"
            assert "total_nikasi" in party, "Missing total_nikasi in ledger party"
            assert "closing_balance" in party, "Missing closing_balance in ledger party"
        
        print(f"PASSED: Ledger Parties section has {ledger['total_parties']} parties, Total Closing: {ledger['total_closing']}")
    
    def test_fy_summary_paddy_stock_section(self, api_client, auth_headers):
        """Paddy stock section should have opening, in, used, closing"""
        response = api_client.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-26", headers=auth_headers)
        data = response.json()
        ps = data.get("paddy_stock", {})
        
        required_fields = ["opening_stock", "paddy_in", "paddy_used", "closing_stock"]
        for field in required_fields:
            assert field in ps, f"Paddy stock missing: {field}"
        
        print(f"PASSED: Paddy Stock - Opening: {ps['opening_stock']}, In: {ps['paddy_in']}, Used: {ps['paddy_used']}, Closing: {ps['closing_stock']}")
    
    def test_fy_summary_milling_section(self, api_client, auth_headers):
        """Milling section should have summary stats"""
        response = api_client.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-26", headers=auth_headers)
        data = response.json()
        ml = data.get("milling", {})
        
        required_fields = ["total_paddy_milled", "total_rice_produced", "total_frk_used", 
                          "total_cmr_delivered", "avg_outturn", "total_entries"]
        for field in required_fields:
            assert field in ml, f"Milling missing: {field}"
        
        print(f"PASSED: Milling - Entries: {ml['total_entries']}, Paddy Milled: {ml['total_paddy_milled']}, CMR: {ml['total_cmr_delivered']}")
    
    def test_fy_summary_local_party_section(self, api_client, auth_headers):
        """Local Party section should have aggregated totals"""
        response = api_client.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-26", headers=auth_headers)
        data = response.json()
        lp = data.get("local_party", {})
        
        required_fields = ["party_count", "opening_balance", "total_debit", "total_paid", "closing_balance"]
        for field in required_fields:
            assert field in lp, f"Local party missing: {field}"
        
        print(f"PASSED: Local Party - Parties: {lp['party_count']}, Closing Balance: {lp['closing_balance']}")


class TestFYSummaryCarryForward:
    """Test Carry Forward API - saves closing as next FY opening"""
    
    def test_carry_forward_requires_kms_year(self, api_client, auth_headers):
        """Carry forward should fail without kms_year"""
        response = api_client.post(f"{BASE_URL}/api/fy-summary/carry-forward", json={}, headers=auth_headers)
        assert response.status_code == 400, "Should fail without kms_year"
        print("PASSED: Carry forward rejects missing kms_year")
    
    def test_carry_forward_success(self, api_client, auth_headers):
        """Carry forward should save closing balances for next FY"""
        payload = {"kms_year": "2025-26"}
        response = api_client.post(f"{BASE_URL}/api/fy-summary/carry-forward", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Carry forward failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "next_fy" in data, "Missing next_fy in response"
        assert "opening_balances" in data, "Missing opening_balances in response"
        assert data["next_fy"] == "2026-27", f"Unexpected next_fy: {data['next_fy']}"
        
        ob = data["opening_balances"]
        assert "cash" in ob, "Missing cash in opening_balances"
        assert "bank" in ob, "Missing bank in opening_balances"
        assert "paddy_stock" in ob, "Missing paddy_stock in opening_balances"
        assert "ledger_parties" in ob, "Missing ledger_parties in opening_balances"
        
        print(f"PASSED: Carry forward to {data['next_fy']} - Cash: {ob['cash']}, Bank: {ob['bank']}, Paddy: {ob['paddy_stock']}")
    
    def test_next_fy_uses_carried_forward_opening(self, api_client, auth_headers):
        """Next FY summary should use carried forward opening balances"""
        # First do carry forward
        api_client.post(f"{BASE_URL}/api/fy-summary/carry-forward", json={"kms_year": "2025-26"}, headers=auth_headers)
        
        # Get 2025-26 summary for closing values
        fy25_response = api_client.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-26", headers=auth_headers)
        fy25_data = fy25_response.json()
        
        # Get 2026-27 summary for opening values  
        fy26_response = api_client.get(f"{BASE_URL}/api/fy-summary?kms_year=2026-27", headers=auth_headers)
        fy26_data = fy26_response.json()
        
        # Verify opening matches previous closing
        assert round(fy26_data["cash_bank"]["opening_cash"], 2) == round(fy25_data["cash_bank"]["closing_cash"], 2), \
            f"Cash opening mismatch: {fy26_data['cash_bank']['opening_cash']} != {fy25_data['cash_bank']['closing_cash']}"
        assert round(fy26_data["cash_bank"]["opening_bank"], 2) == round(fy25_data["cash_bank"]["closing_bank"], 2), \
            f"Bank opening mismatch: {fy26_data['cash_bank']['opening_bank']} != {fy25_data['cash_bank']['closing_bank']}"
        
        print(f"PASSED: 2026-27 opening matches 2025-26 closing - Cash: {fy26_data['cash_bank']['opening_cash']}, Bank: {fy26_data['cash_bank']['opening_bank']}")


class TestFYSummaryPDF:
    """Test FY Summary PDF export with all sections"""
    
    def test_fy_summary_pdf_export(self, api_client, auth_headers):
        """PDF export should succeed and return application/pdf"""
        response = api_client.get(f"{BASE_URL}/api/fy-summary/pdf?kms_year=2025-26", headers=auth_headers)
        assert response.status_code == 200, f"PDF export failed: {response.text}"
        assert "application/pdf" in response.headers.get("content-type", ""), "Response is not PDF"
        assert len(response.content) > 1000, "PDF content too small - may be empty"
        
        # Check content disposition for filename
        cd = response.headers.get("content-disposition", "")
        assert "FY_Summary" in cd, "PDF filename should contain FY_Summary"
        
        print(f"PASSED: FY Summary PDF exported - Size: {len(response.content)} bytes")


class TestByproductsAndFRK:
    """Test byproducts and FRK sections"""
    
    def test_byproducts_structure(self, api_client, auth_headers):
        """Byproducts should have per-product opening, produced, sold, closing"""
        response = api_client.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-26", headers=auth_headers)
        data = response.json()
        bp = data.get("byproducts", {})
        
        expected_products = ["bran", "kunda", "broken", "kanki", "husk"]
        for product in expected_products:
            assert product in bp, f"Missing byproduct: {product}"
            p_data = bp[product]
            assert "opening_stock" in p_data, f"{product} missing opening_stock"
            assert "produced" in p_data, f"{product} missing produced"
            assert "sold" in p_data, f"{product} missing sold"
            assert "closing_stock" in p_data, f"{product} missing closing_stock"
        
        print(f"PASSED: All {len(expected_products)} byproducts have correct structure")
    
    def test_frk_stock_structure(self, api_client, auth_headers):
        """FRK stock should have opening, purchased, used, closing, total_cost"""
        response = api_client.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-26", headers=auth_headers)
        data = response.json()
        frk = data.get("frk_stock", {})
        
        required_fields = ["opening_stock", "purchased", "used", "closing_stock", "total_cost"]
        for field in required_fields:
            assert field in frk, f"FRK missing: {field}"
        
        print(f"PASSED: FRK Stock - Opening: {frk['opening_stock']}, Purchased: {frk['purchased']}, Closing: {frk['closing_stock']}")


class TestPrivateTrading:
    """Test private trading section"""
    
    def test_private_trading_structure(self, api_client, auth_headers):
        """Private trading should have paddy purchase and rice sales data"""
        response = api_client.get(f"{BASE_URL}/api/fy-summary?kms_year=2025-26", headers=auth_headers)
        data = response.json()
        pt = data.get("private_trading", {})
        
        required_fields = ["paddy_purchase_amount", "paddy_paid", "paddy_balance", "paddy_qty",
                          "rice_sale_amount", "rice_received", "rice_balance", "rice_qty"]
        for field in required_fields:
            assert field in pt, f"Private trading missing: {field}"
        
        print(f"PASSED: Private Trading - Paddy Balance: {pt['paddy_balance']}, Rice Balance: {pt['rice_balance']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
