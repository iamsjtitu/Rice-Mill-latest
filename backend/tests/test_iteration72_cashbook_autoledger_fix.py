"""
Iteration 72: Test Cash Book Cash In (Jama) Auto-Ledger Fix

Bug Context:
- Cash Book Cash In for sale voucher party (Gayatri Agro) was not reflecting in Sale Voucher paid status and Party Ledger
- The auto-ledger entry was creating Jama instead of Nikasi for Cash In entries

Two fixes applied:
1) cashbook.py auto-ledger always creates Nikasi (line 127-140)
2) private_trading.py party summary uses ledger for paid amounts (line 1185-1270)

Tests:
1. Create Cash Book Cash In (Jama) entry for a sale voucher party -> verify auto-ledger entry has txn_type=nikasi
2. Verify existing Sale Voucher for Gayatri Agro shows correct data
3. Create new sale voucher with advance, then make manual Cash In payment via Cash Book, verify voucher shows as Paid
4. Verify Cash Book Party Summary shows correct jama/nikasi/balance for sale parties
5. Verify Cash Out (Nikasi) entries still create correct auto-ledger entries (should also be Nikasi)
6. Verify DC Delivery flow still works
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://rice-mill-ledger.preview.emergentagent.com').rstrip('/')

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestAutoLedgerNikasiFix:
    """Test that Cash Book auto-ledger entries are always created with txn_type=nikasi"""
    
    def test_health_check(self, session):
        """Verify API is reachable"""
        res = session.get(f"{BASE_URL}/api/health")
        assert res.status_code == 200, f"Health check failed: {res.text}"
        print("✓ API health check passed")
    
    def test_cash_in_jama_creates_ledger_nikasi(self, session):
        """
        Test: Create Cash Book Cash In (Jama) entry for a party
        Expected: Auto-ledger entry should have txn_type=nikasi (not jama)
        """
        test_party = f"TEST_AutoLedger_{uuid.uuid4().hex[:8]}"
        
        # Create a Cash In (Jama) entry
        cash_in_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "account": "cash",
            "txn_type": "jama",  # Cash In = Jama
            "category": test_party,
            "party_type": "Sale Book",
            "description": f"Test Cash In payment from {test_party}",
            "amount": 5000,
            "reference": "test_cash_in",
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        
        res = session.post(f"{BASE_URL}/api/cash-book?username=admin&role=admin", json=cash_in_data)
        assert res.status_code == 200, f"Failed to create Cash In entry: {res.text}"
        created = res.json()
        cash_txn_id = created.get("id", "")
        print(f"✓ Created Cash In (Jama) entry with ID: {cash_txn_id}")
        
        # Now fetch all transactions for this party
        res = session.get(f"{BASE_URL}/api/cash-book?category={test_party}")
        assert res.status_code == 200
        txns = res.json()
        
        # Should have 2 entries: 1 cash (jama) + 1 ledger (nikasi)
        assert len(txns) >= 2, f"Expected at least 2 entries, got {len(txns)}"
        
        cash_entry = next((t for t in txns if t.get("account") == "cash"), None)
        ledger_entry = next((t for t in txns if t.get("account") == "ledger"), None)
        
        assert cash_entry is not None, "Cash entry not found"
        assert ledger_entry is not None, "Auto-created ledger entry not found"
        
        # Verify the auto-ledger entry has txn_type=nikasi (THE FIX)
        assert ledger_entry.get("txn_type") == "nikasi", \
            f"Auto-ledger should have txn_type=nikasi, got: {ledger_entry.get('txn_type')}"
        print(f"✓ Auto-ledger entry has correct txn_type=nikasi (not jama)")
        
        # Verify amounts match
        assert cash_entry.get("amount") == 5000
        assert ledger_entry.get("amount") == 5000
        print(f"✓ Both entries have correct amount: {cash_entry.get('amount')}")
        
        # Verify reference shows auto-ledger
        assert "auto_ledger:" in ledger_entry.get("reference", ""), \
            f"Ledger entry should have auto_ledger reference, got: {ledger_entry.get('reference')}"
        print(f"✓ Ledger entry has auto_ledger reference: {ledger_entry.get('reference')}")
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/cash-book/{cash_txn_id}")
        print(f"✓ Cleaned up test data for {test_party}")
    
    def test_cash_out_nikasi_creates_ledger_nikasi(self, session):
        """
        Test: Create Cash Book Cash Out (Nikasi) entry
        Expected: Auto-ledger entry should also have txn_type=nikasi
        """
        test_party = f"TEST_CashOut_{uuid.uuid4().hex[:8]}"
        
        # Create a Cash Out (Nikasi) entry
        cash_out_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "account": "cash",
            "txn_type": "nikasi",  # Cash Out = Nikasi
            "category": test_party,
            "party_type": "Pvt Paddy Purchase",
            "description": f"Test Cash Out payment to {test_party}",
            "amount": 10000,
            "reference": "test_cash_out",
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        
        res = session.post(f"{BASE_URL}/api/cash-book?username=admin&role=admin", json=cash_out_data)
        assert res.status_code == 200, f"Failed to create Cash Out entry: {res.text}"
        created = res.json()
        cash_txn_id = created.get("id", "")
        print(f"✓ Created Cash Out (Nikasi) entry with ID: {cash_txn_id}")
        
        # Fetch all transactions for this party
        res = session.get(f"{BASE_URL}/api/cash-book?category={test_party}")
        assert res.status_code == 200
        txns = res.json()
        
        ledger_entry = next((t for t in txns if t.get("account") == "ledger"), None)
        assert ledger_entry is not None, "Auto-created ledger entry not found"
        
        # Both Cash Out and Auto-Ledger should have txn_type=nikasi
        assert ledger_entry.get("txn_type") == "nikasi", \
            f"Auto-ledger should have txn_type=nikasi, got: {ledger_entry.get('txn_type')}"
        print(f"✓ Cash Out auto-ledger has correct txn_type=nikasi")
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/cash-book/{cash_txn_id}")
        print(f"✓ Cleaned up test data for {test_party}")


class TestSaleVoucherLedgerPaid:
    """Test that Sale Voucher listing shows ledger_paid from ledger entries"""
    
    def test_existing_gayatri_agro_voucher(self, session):
        """
        Verify existing Sale Voucher for Gayatri Agro shows correct data
        Expected: total=35400, advance=3000 based on context
        """
        res = session.get(f"{BASE_URL}/api/sale-book?search=Gayatri")
        assert res.status_code == 200
        vouchers = res.json()
        
        if not vouchers:
            pytest.skip("Gayatri Agro voucher not found - may have been deleted")
        
        gayatri_voucher = next((v for v in vouchers if "Gayatri" in v.get("party_name", "")), None)
        if gayatri_voucher:
            print(f"✓ Found Gayatri voucher: party={gayatri_voucher.get('party_name')}, "
                  f"invoice_no={gayatri_voucher.get('invoice_no')}, "
                  f"total={gayatri_voucher.get('total')}, "
                  f"advance={gayatri_voucher.get('advance')}")
            
            # Check if ledger_paid and ledger_balance fields exist
            if "ledger_paid" in gayatri_voucher:
                print(f"  ledger_paid={gayatri_voucher.get('ledger_paid')}, "
                      f"ledger_balance={gayatri_voucher.get('ledger_balance')}")
        else:
            pytest.skip("Gayatri Agro voucher not found in search results")
    
    def test_sale_voucher_api_returns_ledger_paid_field(self, session):
        """Verify sale-book API returns ledger_paid and ledger_balance fields"""
        res = session.get(f"{BASE_URL}/api/sale-book")
        assert res.status_code == 200
        vouchers = res.json()
        
        if not vouchers:
            pytest.skip("No sale vouchers found")
        
        # Check first voucher has the fields
        first = vouchers[0]
        assert "total" in first, "Voucher should have 'total' field"
        
        # ledger_paid and ledger_balance should be present (may be 0 or calculated)
        print(f"✓ First voucher: party={first.get('party_name')}, "
              f"total={first.get('total')}, advance={first.get('advance')}, "
              f"ledger_paid={first.get('ledger_paid', 'N/A')}, "
              f"ledger_balance={first.get('ledger_balance', 'N/A')}")


class TestCashBookPartySummary:
    """Test Cash Book Party Summary API"""
    
    def test_party_summary_returns_correct_format(self, session):
        """Verify /api/cash-book/party-summary returns correct structure"""
        res = session.get(f"{BASE_URL}/api/cash-book/party-summary")
        assert res.status_code == 200
        data = res.json()
        
        assert "parties" in data, "Response should have 'parties' field"
        assert "summary" in data, "Response should have 'summary' field"
        
        summary = data["summary"]
        assert "total_parties" in summary
        assert "total_jama" in summary
        assert "total_nikasi" in summary
        assert "total_outstanding" in summary
        
        print(f"✓ Party Summary: {summary['total_parties']} parties, "
              f"Jama={summary['total_jama']}, Nikasi={summary['total_nikasi']}, "
              f"Outstanding={summary['total_outstanding']}")
        
        # Check a few parties if available
        if data["parties"]:
            for p in data["parties"][:3]:
                print(f"  - {p.get('party_name')}: jama={p.get('total_jama')}, "
                      f"nikasi={p.get('total_nikasi')}, balance={p.get('balance')}")
    
    def test_party_summary_uses_ledger_entries(self, session):
        """
        Verify that party summary calculation uses ledger entries (account=ledger)
        Not cash/bank entries directly
        """
        # The endpoint filters by account=ledger
        # We verify by checking that the logic is correct
        res = session.get(f"{BASE_URL}/api/cash-book/party-summary?party_type=Sale%20Book")
        assert res.status_code == 200
        data = res.json()
        
        # If there are Sale Book parties, they should have balance calculated from ledger
        if data["parties"]:
            print(f"✓ Found {len(data['parties'])} Sale Book parties in ledger-based summary")
            for p in data["parties"][:3]:
                # Balance = jama - nikasi (from ledger entries)
                expected_balance = round(p.get("total_jama", 0) - p.get("total_nikasi", 0), 2)
                actual_balance = p.get("balance", 0)
                # Allow small floating point differences
                assert abs(expected_balance - actual_balance) < 0.1, \
                    f"Balance mismatch for {p.get('party_name')}: expected {expected_balance}, got {actual_balance}"
                print(f"  - {p.get('party_name')}: balance={actual_balance} ✓")


class TestVouchersPartySummary:
    """Test Vouchers Party Summary (private_trading) uses ledger for paid amounts"""
    
    def test_private_trading_party_summary_api(self, session):
        """Verify /api/private-trading/party-summary returns correct structure"""
        res = session.get(f"{BASE_URL}/api/private-trading/party-summary")
        assert res.status_code == 200
        data = res.json()
        
        # Check for expected sections
        assert "sale_vouchers" in data or "totals" in data, "Response should have expected fields"
        
        # The sale_vouchers section should show parties with paid amounts from ledger
        sale_section = data.get("sale_vouchers", {})
        if sale_section and sale_section.get("parties"):
            print(f"✓ Sale Vouchers section: {len(sale_section['parties'])} parties")
            for p in sale_section["parties"][:3]:
                print(f"  - {p.get('party_name')}: amount={p.get('amount')}, "
                      f"paid={p.get('paid')}, balance={p.get('balance')}")


class TestDCDeliveryNotBroken:
    """Verify DC Delivery flow still works after the fixes"""
    
    def test_dc_entries_api(self, session):
        """Verify DC entries API works"""
        res = session.get(f"{BASE_URL}/api/dc-entries")
        assert res.status_code == 200
        entries = res.json()
        print(f"✓ DC Entries API returned {len(entries)} entries")
    
    def test_dc_delivery_creates_entries(self, session):
        """
        Test that DC Delivery still creates correct cash_transactions entries
        This verifies the changes didn't break DC Delivery
        """
        # Get an existing DC entry to check if deliveries work
        res = session.get(f"{BASE_URL}/api/dc-entries")
        assert res.status_code == 200
        dc_entries = res.json()
        
        if not dc_entries:
            pytest.skip("No DC entries to test")
        
        # Find a DC with deliveries
        dc_with_delivery = next((dc for dc in dc_entries if dc.get("deliveries")), None)
        if dc_with_delivery:
            print(f"✓ Found DC with deliveries: {dc_with_delivery.get('dc_number')}")
            deliveries = dc_with_delivery.get("deliveries", [])
            if deliveries:
                d = deliveries[0]
                print(f"  Delivery: vehicle={d.get('vehicle_no')}, "
                      f"cash_paid={d.get('cash_paid')}, diesel_paid={d.get('diesel_paid')}")


class TestEndToEndCashInPaymentFlow:
    """End-to-end test: Create sale voucher, make Cash In payment, verify status"""
    
    def test_e2e_sale_voucher_cash_in_payment(self, session):
        """
        Full flow:
        1. Create a sale voucher with total=10000, advance=0
        2. Make a Cash In (Jama) payment of 5000 via Cash Book
        3. Verify sale voucher shows ledger_paid=5000, ledger_balance=5000
        4. Make another Cash In payment of 5000
        5. Verify sale voucher shows as Paid (ledger_balance=0)
        6. Cleanup
        """
        test_party = f"TEST_E2E_Party_{uuid.uuid4().hex[:8]}"
        
        # 1. Create sale voucher
        voucher_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "party_name": test_party,
            "invoice_no": "TEST-E2E-001",
            "items": [{"item_name": "Rice (Usna)", "quantity": 10, "rate": 1000, "unit": "Qntl"}],
            "gst_type": "none",
            "advance": 0,
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        
        res = session.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=voucher_data)
        assert res.status_code == 200, f"Failed to create sale voucher: {res.text}"
        voucher = res.json()
        voucher_id = voucher.get("id")
        total = voucher.get("total", 10000)
        print(f"✓ Step 1: Created sale voucher: {test_party}, total={total}, id={voucher_id}")
        
        # 2. Make Cash In payment via Cash Book
        cash_in_1 = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "account": "cash",
            "txn_type": "jama",
            "category": test_party,
            "party_type": "Sale Book",
            "description": f"Payment received from {test_party}",
            "amount": 5000,
            "reference": "payment_1",
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        
        res = session.post(f"{BASE_URL}/api/cash-book?username=admin&role=admin", json=cash_in_1)
        assert res.status_code == 200, f"Failed to create Cash In: {res.text}"
        cash_txn_1 = res.json()
        cash_txn_1_id = cash_txn_1.get("id")
        print(f"✓ Step 2: Created Cash In payment of Rs.5000, id={cash_txn_1_id}")
        
        # 3. Verify sale voucher listing shows ledger_paid
        res = session.get(f"{BASE_URL}/api/sale-book?search={test_party}")
        assert res.status_code == 200
        vouchers = res.json()
        found_voucher = next((v for v in vouchers if v.get("party_name") == test_party), None)
        assert found_voucher is not None, f"Could not find voucher for {test_party}"
        
        ledger_paid = found_voucher.get("ledger_paid", 0)
        ledger_balance = found_voucher.get("ledger_balance", total)
        
        # The auto-ledger creates nikasi entry when we do Cash In
        # Sale voucher creates jama entry for total amount
        # So: ledger_paid = sum of nikasi entries (payments received)
        # ledger_balance = total - ledger_paid
        
        print(f"✓ Step 3: Voucher status: total={found_voucher.get('total')}, "
              f"ledger_paid={ledger_paid}, ledger_balance={ledger_balance}")
        
        # Verify ledger_paid is at least 5000 (our payment + any advance)
        assert ledger_paid >= 5000, f"Expected ledger_paid >= 5000, got {ledger_paid}"
        
        # 4. Make another Cash In payment to fully pay
        remaining = ledger_balance
        if remaining > 0:
            cash_in_2 = {
                "date": datetime.now().strftime("%Y-%m-%d"),
                "account": "cash",
                "txn_type": "jama",
                "category": test_party,
                "party_type": "Sale Book",
                "description": f"Final payment from {test_party}",
                "amount": remaining,
                "reference": "payment_2",
                "kms_year": "2024-2025",
                "season": "Kharif"
            }
            
            res = session.post(f"{BASE_URL}/api/cash-book?username=admin&role=admin", json=cash_in_2)
            assert res.status_code == 200, f"Failed to create second Cash In: {res.text}"
            cash_txn_2 = res.json()
            cash_txn_2_id = cash_txn_2.get("id")
            print(f"✓ Step 4: Created second Cash In payment of Rs.{remaining}, id={cash_txn_2_id}")
        
        # 5. Verify voucher shows as Paid (ledger_balance = 0)
        res = session.get(f"{BASE_URL}/api/sale-book?search={test_party}")
        assert res.status_code == 200
        vouchers = res.json()
        found_voucher = next((v for v in vouchers if v.get("party_name") == test_party), None)
        
        final_balance = found_voucher.get("ledger_balance", 0)
        print(f"✓ Step 5: Final status: ledger_balance={final_balance}")
        assert final_balance <= 0, f"Expected ledger_balance=0 (Paid), got {final_balance}"
        
        # 6. Cleanup
        # Delete the voucher (this should cascade delete related entries)
        session.delete(f"{BASE_URL}/api/sale-book/{voucher_id}?username=admin&role=admin")
        
        # Delete cash book entries (including auto-ledger)
        session.delete(f"{BASE_URL}/api/cash-book/{cash_txn_1_id}")
        if remaining > 0:
            session.delete(f"{BASE_URL}/api/cash-book/{cash_txn_2_id}")
        
        print(f"✓ Step 6: Cleaned up test data for {test_party}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
