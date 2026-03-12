"""
Test Iteration 71: DC Delivery creates truck ledger + diesel account entries
Tests for:
1. DC Delivery cash_paid creates both Cash Book + Truck Ledger entries
2. DC Delivery diesel_paid creates Cash Book + Truck Ledger + Diesel Account entries
3. Delete delivery cleans up all entries (including new ledger refs)
4. DC search by DC Number and Invoice Number
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestDCDeliveryEntries:
    """Test DC Delivery creates correct ledger and diesel account entries"""
    
    def test_cash_book_contains_delivery_cash_entry(self):
        """Verify delivery cash entry exists in cash_transactions with account=cash"""
        response = requests.get(f"{BASE_URL}/api/cash-book")
        assert response.status_code == 200
        
        entries = response.json()
        # Find cash entry for ABQ7894 with reference delivery:2bfa96ca
        cash_entries = [e for e in entries if e.get('reference', '').startswith('delivery:') 
                        and e.get('category') == 'ABQ7894' and e.get('account') == 'cash']
        
        assert len(cash_entries) >= 1, "Should have at least 1 cash book delivery entry for ABQ7894"
        
        entry = cash_entries[0]
        assert entry['amount'] == 200.0, "Cash paid should be Rs.200"
        assert entry['txn_type'] == 'nikasi', "Should be nikasi (withdrawal)"
        assert entry['party_type'] == 'Truck', "Party type should be Truck"
        print(f"PASS: Cash book entry found - {entry['description']}, Rs.{entry['amount']}")
    
    def test_truck_ledger_contains_delivery_cash_entry(self):
        """Verify delivery cash also creates truck ledger entry with reference delivery_tcash"""
        response = requests.get(f"{BASE_URL}/api/cash-book")
        assert response.status_code == 200
        
        entries = response.json()
        # Find ledger entry for ABQ7894 with reference delivery_tcash
        ledger_entries = [e for e in entries if 'delivery_tcash:' in e.get('reference', '') 
                          and e.get('category') == 'ABQ7894' and e.get('account') == 'ledger']
        
        assert len(ledger_entries) >= 1, "Should have at least 1 truck ledger entry (delivery_tcash) for ABQ7894"
        
        entry = ledger_entries[0]
        assert entry['amount'] == 200.0, "Ledger cash entry should be Rs.200"
        assert entry['txn_type'] == 'nikasi', "Should be nikasi (debit/outgoing)"
        assert entry['party_type'] == 'Truck', "Party type should be Truck for ledger entry"
        print(f"PASS: Truck ledger (cash) entry found - {entry['reference']}, Rs.{entry['amount']}")
    
    def test_cash_book_contains_delivery_diesel_entry(self):
        """Verify delivery diesel entry exists in cash_transactions with account=cash"""
        response = requests.get(f"{BASE_URL}/api/cash-book")
        assert response.status_code == 200
        
        entries = response.json()
        # Find diesel entry for ABQ7894 with reference delivery_diesel
        diesel_cash_entries = [e for e in entries if 'delivery_diesel:' in e.get('reference', '') 
                               and e.get('category') == 'ABQ7894' and e.get('account') == 'cash']
        
        assert len(diesel_cash_entries) >= 1, "Should have at least 1 cash book diesel entry for ABQ7894"
        
        entry = diesel_cash_entries[0]
        assert entry['amount'] == 300.0, "Diesel paid should be Rs.300"
        assert entry['txn_type'] == 'nikasi', "Should be nikasi"
        assert entry['party_type'] == 'Diesel', "Party type should be Diesel"
        print(f"PASS: Cash book diesel entry found - {entry['description']}, Rs.{entry['amount']}")
    
    def test_truck_ledger_contains_delivery_diesel_entry(self):
        """Verify delivery diesel also creates truck ledger entry with reference delivery_tdiesel"""
        response = requests.get(f"{BASE_URL}/api/cash-book")
        assert response.status_code == 200
        
        entries = response.json()
        # Find ledger entry for ABQ7894 with reference delivery_tdiesel
        ledger_diesel_entries = [e for e in entries if 'delivery_tdiesel:' in e.get('reference', '') 
                                  and e.get('category') == 'ABQ7894' and e.get('account') == 'ledger']
        
        assert len(ledger_diesel_entries) >= 1, "Should have at least 1 truck ledger entry (delivery_tdiesel) for ABQ7894"
        
        entry = ledger_diesel_entries[0]
        assert entry['amount'] == 300.0, "Ledger diesel entry should be Rs.300"
        assert entry['txn_type'] == 'nikasi', "Should be nikasi"
        assert entry['party_type'] == 'Truck', "Party type should be Truck for ledger diesel entry"
        print(f"PASS: Truck ledger (diesel) entry found - {entry['reference']}, Rs.{entry['amount']}")
    
    def test_diesel_account_contains_delivery_entry(self):
        """Verify delivery diesel creates diesel_accounts entry"""
        response = requests.get(f"{BASE_URL}/api/diesel-accounts")
        assert response.status_code == 200
        
        entries = response.json()
        # Find diesel account entry for ABQ7894
        diesel_entries = [e for e in entries if e.get('truck_no') == 'ABQ7894']
        
        assert len(diesel_entries) >= 1, "Should have at least 1 diesel account entry for ABQ7894"
        
        entry = diesel_entries[0]
        assert entry['amount'] == 300.0, "Diesel account amount should be Rs.300"
        assert entry['txn_type'] == 'debit', "Should be debit type"
        assert 'DC Delivery Diesel' in entry.get('description', ''), "Description should mention DC Delivery Diesel"
        assert entry.get('linked_entry_id'), "Should have linked_entry_id to delivery"
        print(f"PASS: Diesel account entry found - {entry['truck_no']}, Rs.{entry['amount']}, pump: {entry.get('pump_name')}")
    
    def test_dc_entries_return_delivery_with_invoice(self):
        """Verify DC AB21 has delivery with invoice_no INV-001"""
        response = requests.get(f"{BASE_URL}/api/dc-entries")
        assert response.status_code == 200
        
        entries = response.json()
        dc_ab21 = next((d for d in entries if d.get('dc_number') == 'AB21'), None)
        
        assert dc_ab21 is not None, "DC AB21 should exist"
        assert dc_ab21['status'] == 'completed', "DC AB21 should be completed"
        
        deliveries = dc_ab21.get('deliveries', [])
        assert len(deliveries) >= 1, "DC AB21 should have at least 1 delivery"
        
        delivery = deliveries[0]
        assert delivery['invoice_no'] == 'INV-001', "Delivery should have invoice_no INV-001"
        assert delivery['vehicle_no'] == 'ABQ7894', "Delivery vehicle should be ABQ7894"
        assert delivery['cash_paid'] == 200.0, "Cash paid should be 200"
        assert delivery['diesel_paid'] == 300.0, "Diesel paid should be 300"
        print(f"PASS: DC AB21 delivery verified - invoice: {delivery['invoice_no']}, vehicle: {delivery['vehicle_no']}")


class TestDCDeliveryCleanup:
    """Test delivery deletion cleans up all related entries"""
    
    def test_create_and_delete_delivery_cleanup(self):
        """Create a delivery, verify entries, delete, verify cleanup"""
        # First, get existing DC or create one
        dc_response = requests.get(f"{BASE_URL}/api/dc-entries")
        assert dc_response.status_code == 200
        dcs = dc_response.json()
        
        # Use AB21 or create a test DC
        test_dc = next((d for d in dcs if d.get('dc_number') == 'AB21'), None)
        if not test_dc:
            pytest.skip("No DC AB21 found to test deletion cleanup")
        
        dc_id = test_dc['id']
        
        # Create a test delivery
        unique_vehicle = f"TEST{uuid.uuid4().hex[:6].upper()}"
        delivery_data = {
            "dc_id": dc_id,
            "date": "2026-03-12",
            "quantity_qntl": 5.0,
            "vehicle_no": unique_vehicle,
            "driver_name": "TestDriver",
            "invoice_no": "TEST-INV-001",
            "cash_paid": 150.0,
            "diesel_paid": 250.0,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/dc-deliveries?username=test", json=delivery_data)
        assert create_response.status_code == 200, f"Failed to create delivery: {create_response.text}"
        
        created_delivery = create_response.json()
        delivery_id = created_delivery['id']
        ref_prefix = delivery_id[:8]
        print(f"Created test delivery: {delivery_id}, vehicle: {unique_vehicle}")
        
        # Verify entries were created
        cash_book = requests.get(f"{BASE_URL}/api/cash-book").json()
        delivery_entries = [e for e in cash_book if unique_vehicle in e.get('category', '')]
        assert len(delivery_entries) >= 4, f"Should have 4 entries (cash+ledger for cash_paid and diesel_paid), found {len(delivery_entries)}"
        print(f"PASS: Created {len(delivery_entries)} cash_transactions entries")
        
        diesel_accounts = requests.get(f"{BASE_URL}/api/diesel-accounts").json()
        diesel_entries = [e for e in diesel_accounts if e.get('truck_no') == unique_vehicle]
        assert len(diesel_entries) >= 1, "Should have at least 1 diesel_account entry"
        print(f"PASS: Created {len(diesel_entries)} diesel_accounts entry")
        
        # Now delete the delivery
        delete_response = requests.delete(f"{BASE_URL}/api/dc-deliveries/{delivery_id}")
        assert delete_response.status_code == 200, f"Failed to delete delivery: {delete_response.text}"
        print(f"Deleted delivery: {delivery_id}")
        
        # Verify entries are cleaned up
        cash_book_after = requests.get(f"{BASE_URL}/api/cash-book").json()
        remaining_entries = [e for e in cash_book_after if unique_vehicle in e.get('category', '')]
        assert len(remaining_entries) == 0, f"Should have 0 entries after deletion, found {len(remaining_entries)}"
        print("PASS: All cash_transactions entries cleaned up")
        
        diesel_accounts_after = requests.get(f"{BASE_URL}/api/diesel-accounts").json()
        remaining_diesel = [e for e in diesel_accounts_after if e.get('truck_no') == unique_vehicle]
        assert len(remaining_diesel) == 0, f"Should have 0 diesel entries after deletion, found {len(remaining_diesel)}"
        print("PASS: All diesel_accounts entries cleaned up")


class TestDCSearchFeature:
    """Test DC search by DC Number and Invoice Number"""
    
    def test_dc_entries_api_returns_deliveries_with_invoice(self):
        """Verify API returns DC entries with embedded deliveries including invoice_no"""
        response = requests.get(f"{BASE_URL}/api/dc-entries")
        assert response.status_code == 200
        
        entries = response.json()
        assert len(entries) > 0, "Should have at least one DC entry"
        
        # Find DC with deliveries that have invoice_no
        dc_with_invoice = None
        for dc in entries:
            for delivery in dc.get('deliveries', []):
                if delivery.get('invoice_no'):
                    dc_with_invoice = dc
                    break
            if dc_with_invoice:
                break
        
        assert dc_with_invoice is not None, "Should have at least one DC with delivery that has invoice_no"
        print(f"PASS: Found DC {dc_with_invoice['dc_number']} with invoice in deliveries")
    
    def test_dc_ab21_has_invoice_inv001(self):
        """Verify DC AB21 has delivery with invoice_no INV-001"""
        response = requests.get(f"{BASE_URL}/api/dc-entries")
        assert response.status_code == 200
        
        entries = response.json()
        dc_ab21 = next((d for d in entries if d.get('dc_number') == 'AB21'), None)
        assert dc_ab21 is not None, "DC AB21 should exist"
        
        deliveries = dc_ab21.get('deliveries', [])
        inv_delivery = next((d for d in deliveries if d.get('invoice_no') == 'INV-001'), None)
        assert inv_delivery is not None, "DC AB21 should have delivery with invoice INV-001"
        print(f"PASS: DC AB21 has delivery with invoice {inv_delivery['invoice_no']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
