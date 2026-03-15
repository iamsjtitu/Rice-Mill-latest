"""
Tests for Hemali Monthly Summary and Party Ledger Hemali integration features.
- Monthly Summary: sardar-wise monthly report with items breakdown, advance tracking
- Party Ledger: Hemali sardars appear individually with payment details
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def session():
    """Session with auth"""
    s = requests.Session()
    # Login
    resp = s.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    if resp.status_code == 200:
        token = resp.json().get("access_token")
        if token:
            s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def test_item(session):
    """Create a test item for hemali payments"""
    item_data = {"name": f"TEST_MonthlyItem_{uuid.uuid4().hex[:6]}", "rate": 5.0, "unit": "bag"}
    resp = session.post(f"{BASE_URL}/api/hemali/items", json=item_data)
    item = resp.json()
    yield item
    # Cleanup
    session.delete(f"{BASE_URL}/api/hemali/items/{item['id']}")


@pytest.fixture(scope="module")
def test_payments(session, test_item):
    """Create test payments for monthly summary testing"""
    payments = []
    sardar1 = f"TEST_Sardar_A_{uuid.uuid4().hex[:4]}"
    sardar2 = f"TEST_Sardar_B_{uuid.uuid4().hex[:4]}"
    
    # Sardar1: 2 payments in 2026-01, 1 paid, 1 unpaid
    for i, (status_to_set, date) in enumerate([("paid", "2026-01-15"), ("unpaid", "2026-01-20")]):
        create_resp = session.post(f"{BASE_URL}/api/hemali/payments", json={
            "sardar_name": sardar1,
            "date": date,
            "items": [{"item_name": test_item["name"], "rate": 5.0, "quantity": 10 + i}],
            "amount_paid": (10 + i) * 5.0
        })
        payment = create_resp.json()
        if status_to_set == "paid":
            session.put(f"{BASE_URL}/api/hemali/payments/{payment['id']}/mark-paid")
        payments.append({"id": payment["id"], "sardar": sardar1, "status": status_to_set})
    
    # Sardar2: 1 paid payment in 2026-02
    create_resp = session.post(f"{BASE_URL}/api/hemali/payments", json={
        "sardar_name": sardar2,
        "date": "2026-02-10",
        "items": [{"item_name": test_item["name"], "rate": 5.0, "quantity": 20}],
        "amount_paid": 100.0
    })
    payment = create_resp.json()
    session.put(f"{BASE_URL}/api/hemali/payments/{payment['id']}/mark-paid")
    payments.append({"id": payment["id"], "sardar": sardar2, "status": "paid"})
    
    yield {"payments": payments, "sardar1": sardar1, "sardar2": sardar2, "item_name": test_item["name"]}
    
    # Cleanup
    for p in payments:
        session.delete(f"{BASE_URL}/api/hemali/payments/{p['id']}")


class TestMonthlySummaryAPI:
    """Tests for GET /api/hemali/monthly-summary"""
    
    def test_monthly_summary_returns_sardar_data(self, session, test_payments):
        """Monthly summary returns sardar-wise data"""
        resp = session.get(f"{BASE_URL}/api/hemali/monthly-summary")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Response should be a list of sardars"
        
        # Find our test sardars
        sardar1_data = next((s for s in data if s["sardar_name"] == test_payments["sardar1"]), None)
        sardar2_data = next((s for s in data if s["sardar_name"] == test_payments["sardar2"]), None)
        
        assert sardar1_data is not None, f"Sardar1 {test_payments['sardar1']} not found"
        assert sardar2_data is not None, f"Sardar2 {test_payments['sardar2']} not found"
        print(f"PASS: Both test sardars found in monthly summary")
    
    def test_monthly_summary_only_counts_paid_payments(self, session, test_payments):
        """Monthly summary total_work/total_paid only includes PAID payments"""
        resp = session.get(f"{BASE_URL}/api/hemali/monthly-summary")
        assert resp.status_code == 200
        data = resp.json()
        
        sardar1_data = next((s for s in data if s["sardar_name"] == test_payments["sardar1"]), None)
        assert sardar1_data is not None
        
        # Sardar1 has 2 payments: 1 paid (10 qty x 5 = 50), 1 unpaid (11 qty x 5 = 55)
        # Only paid should be counted
        assert sardar1_data["grand_total_work"] == 50.0, f"Expected 50 (only paid), got {sardar1_data['grand_total_work']}"
        assert sardar1_data["grand_total_paid"] == 50.0, f"Expected 50 paid, got {sardar1_data['grand_total_paid']}"
        print(f"PASS: Monthly summary only counts paid payments (work={sardar1_data['grand_total_work']})")
    
    def test_monthly_summary_has_items_breakdown(self, session, test_payments):
        """Monthly summary includes items_breakdown per month"""
        resp = session.get(f"{BASE_URL}/api/hemali/monthly-summary")
        assert resp.status_code == 200
        data = resp.json()
        
        sardar1_data = next((s for s in data if s["sardar_name"] == test_payments["sardar1"]), None)
        assert sardar1_data is not None
        assert "months" in sardar1_data
        assert len(sardar1_data["months"]) > 0
        
        # Check items breakdown exists
        month_data = sardar1_data["months"][0]
        assert "items_breakdown" in month_data, "items_breakdown missing from month data"
        assert test_payments["item_name"] in month_data["items_breakdown"], f"Item {test_payments['item_name']} not in breakdown"
        print(f"PASS: Items breakdown present: {month_data['items_breakdown']}")
    
    def test_monthly_summary_current_advance_balance(self, session, test_payments):
        """Monthly summary shows current_advance_balance per sardar"""
        resp = session.get(f"{BASE_URL}/api/hemali/monthly-summary")
        assert resp.status_code == 200
        data = resp.json()
        
        sardar1_data = next((s for s in data if s["sardar_name"] == test_payments["sardar1"]), None)
        assert sardar1_data is not None
        assert "current_advance_balance" in sardar1_data, "current_advance_balance field missing"
        print(f"PASS: current_advance_balance present: {sardar1_data['current_advance_balance']}")
    
    def test_monthly_summary_sardar_filter(self, session, test_payments):
        """Monthly summary can filter by sardar_name"""
        resp = session.get(f"{BASE_URL}/api/hemali/monthly-summary?sardar_name={test_payments['sardar1']}")
        assert resp.status_code == 200
        data = resp.json()
        
        # Should only return sardar1
        assert len(data) == 1, f"Expected 1 sardar, got {len(data)}"
        assert data[0]["sardar_name"] == test_payments["sardar1"]
        print(f"PASS: Sardar filter works correctly")


class TestMonthlySummaryExports:
    """Tests for Monthly Summary PDF/Excel exports"""
    
    def test_monthly_summary_pdf_export(self, session):
        """GET /api/hemali/monthly-summary/pdf returns PDF"""
        resp = session.get(f"{BASE_URL}/api/hemali/monthly-summary/pdf")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        assert "application/pdf" in resp.headers.get("Content-Type", ""), f"Expected PDF, got {resp.headers.get('Content-Type')}"
        assert len(resp.content) > 100, "PDF content too small"
        print(f"PASS: Monthly summary PDF export works ({len(resp.content)} bytes)")
    
    def test_monthly_summary_excel_export(self, session):
        """GET /api/hemali/monthly-summary/excel returns Excel"""
        resp = session.get(f"{BASE_URL}/api/hemali/monthly-summary/excel")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        content_type = resp.headers.get("Content-Type", "")
        assert "spreadsheet" in content_type or "excel" in content_type.lower(), f"Expected Excel, got {content_type}"
        assert len(resp.content) > 100, "Excel content too small"
        print(f"PASS: Monthly summary Excel export works ({len(resp.content)} bytes)")
    
    def test_monthly_summary_pdf_with_filter(self, session, test_payments):
        """PDF export with sardar filter"""
        resp = session.get(f"{BASE_URL}/api/hemali/monthly-summary/pdf?sardar_name={test_payments['sardar1']}")
        assert resp.status_code == 200
        assert "application/pdf" in resp.headers.get("Content-Type", "")
        print(f"PASS: Monthly summary PDF export with filter works")


class TestPartyLedgerHemali:
    """Tests for Party Ledger Hemali section"""
    
    def test_party_ledger_hemali_type_returns_individual_sardars(self, session, test_payments):
        """Party ledger with party_type=Hemali shows individual sardar names"""
        resp = session.get(f"{BASE_URL}/api/reports/party-ledger?party_type=Hemali")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        assert "ledger" in data, "ledger field missing"
        ledger = data["ledger"]
        
        # Find entries for our test sardars
        sardar1_entries = [e for e in ledger if e["party_name"] == test_payments["sardar1"]]
        sardar2_entries = [e for e in ledger if e["party_name"] == test_payments["sardar2"]]
        
        # Only paid payments should appear
        assert len(sardar1_entries) > 0, f"Sardar1 {test_payments['sardar1']} entries not found in party ledger"
        assert len(sardar2_entries) > 0, f"Sardar2 {test_payments['sardar2']} entries not found in party ledger"
        
        # Check party_type is Hemali
        assert all(e["party_type"] == "Hemali" for e in sardar1_entries), "party_type should be 'Hemali'"
        print(f"PASS: Party ledger shows individual sardars - {test_payments['sardar1']}: {len(sardar1_entries)} entries, {test_payments['sardar2']}: {len(sardar2_entries)} entries")
    
    def test_party_ledger_hemali_shows_debit_credit(self, session, test_payments):
        """Party ledger Hemali entries show correct debit/credit"""
        resp = session.get(f"{BASE_URL}/api/reports/party-ledger?party_type=Hemali")
        assert resp.status_code == 200
        data = resp.json()
        
        # Find an entry for sardar1
        sardar1_entries = [e for e in data["ledger"] if e["party_name"] == test_payments["sardar1"]]
        assert len(sardar1_entries) > 0
        
        # Payment should show credit (amount paid to sardar)
        payment_entry = next((e for e in sardar1_entries if "Hemali Payment" in e.get("description", "")), None)
        assert payment_entry is not None, "Payment entry not found"
        assert payment_entry["credit"] > 0, "Credit should be positive for hemali payment"
        print(f"PASS: Party ledger Hemali shows correct credit: {payment_entry['credit']}")
    
    def test_party_ledger_hemali_not_in_cash_party(self, session, test_payments):
        """Hemali entries should NOT appear in Cash Party section"""
        # Get cash party ledger
        resp = session.get(f"{BASE_URL}/api/reports/party-ledger?party_type=cash_party")
        assert resp.status_code == 200
        data = resp.json()
        
        ledger = data["ledger"]
        
        # Our test sardars should NOT appear in cash_party type
        sardar1_in_cash = [e for e in ledger if test_payments["sardar1"] in e.get("party_name", "")]
        sardar2_in_cash = [e for e in ledger if test_payments["sardar2"] in e.get("party_name", "")]
        
        assert len(sardar1_in_cash) == 0, f"Sardar1 should NOT appear in cash_party: {sardar1_in_cash}"
        assert len(sardar2_in_cash) == 0, f"Sardar2 should NOT appear in cash_party: {sardar2_in_cash}"
        print("PASS: Hemali sardars do not appear in Cash Party section (no duplicates)")
    
    def test_party_ledger_all_types_no_hemali_duplicate(self, session, test_payments):
        """When getting all party types, Hemali entries appear only once (under Hemali type)"""
        resp = session.get(f"{BASE_URL}/api/reports/party-ledger")
        assert resp.status_code == 200
        data = resp.json()
        
        ledger = data["ledger"]
        
        # Find all entries for sardar1
        sardar1_entries = [e for e in ledger if e.get("party_name") == test_payments["sardar1"]]
        
        # All should be party_type=Hemali
        non_hemali = [e for e in sardar1_entries if e.get("party_type") != "Hemali"]
        assert len(non_hemali) == 0, f"Sardar1 has non-Hemali entries (duplicate): {non_hemali}"
        print(f"PASS: No duplicate entries - all sardar1 entries are Hemali type: {len(sardar1_entries)} entries")


class TestExistingHemaliData:
    """Tests with existing data mentioned in context (Ramesh, Suresh)"""
    
    def test_monthly_summary_existing_ramesh(self, session):
        """Monthly summary includes existing Ramesh data"""
        resp = session.get(f"{BASE_URL}/api/hemali/monthly-summary?sardar_name=Ramesh")
        assert resp.status_code == 200
        data = resp.json()
        
        if len(data) > 0:
            ramesh = data[0]
            assert ramesh["sardar_name"] == "Ramesh"
            print(f"PASS: Ramesh found in monthly summary - grand_total_work: {ramesh['grand_total_work']}, months: {len(ramesh['months'])}")
        else:
            print("INFO: Ramesh has no paid payments in current filter")
    
    def test_party_ledger_existing_ramesh(self, session):
        """Party ledger shows Ramesh under Hemali type"""
        resp = session.get(f"{BASE_URL}/api/reports/party-ledger?party_type=Hemali&party_name=Ramesh")
        assert resp.status_code == 200
        data = resp.json()
        
        if len(data["ledger"]) > 0:
            assert all(e["party_type"] == "Hemali" for e in data["ledger"])
            assert all("Ramesh" in e["party_name"] for e in data["ledger"])
            print(f"PASS: Ramesh found in party ledger Hemali section: {len(data['ledger'])} entries")
        else:
            print("INFO: Ramesh has no paid payments for party ledger")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
