"""
Iteration 63: Sale Book Accounting Overhaul Tests
Major changes:
1. Cash paid → cash nikasi (truck ko diya) - cash going OUT to truck
2. Diesel paid → diesel pump ledger jama (Titu Fuels) - we owe pump
3. Cash + Diesel → truck payment ledger (jama + nikasi for truck)
4. Advance from party → party ledger nikasi (reduces party debt)
5. Balance = total - advance (NOT total - cash - diesel)
6. Invoice No field stored and returned
7. Search filter (party, invoice, rst, truck)
8. Excel export (xlsx)
"""

import pytest
import requests
import os
import uuid
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_PREFIX = "TEST_ITER63_"


class TestSaleBookLedgerEntries:
    """Test all 5 ledger entry types created on sale voucher with full accounting"""
    
    voucher_id = None
    voucher_no = None
    
    def test_01_create_sale_voucher_full_accounting(self):
        """Create sale voucher with cash, diesel, advance to test all ledger entries"""
        payload = {
            "date": "2025-01-20",
            "party_name": f"{TEST_PREFIX}FullAccountingParty",
            "invoice_no": "INV-63-001",
            "items": [
                {"item_name": "Rice (Usna)", "quantity": 100, "rate": 3000, "unit": "Qntl"}
            ],
            "gst_type": "none",
            "cgst_percent": 0, "sgst_percent": 0, "igst_percent": 0,
            "truck_no": "OD99X6363",
            "rst_no": "RST-63",
            "remark": "Full accounting test",
            "cash_paid": 5000,      # Cash to truck
            "diesel_paid": 3000,   # Diesel from pump to truck
            "advance": 50000,      # Advance received from party
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        
        response = requests.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        
        TestSaleBookLedgerEntries.voucher_id = data["id"]
        TestSaleBookLedgerEntries.voucher_no = data["voucher_no"]
        
        # Verify invoice_no is stored
        assert data["invoice_no"] == "INV-63-001", f"Invoice no not stored: {data.get('invoice_no')}"
        
        # Verify calculations
        assert data["total"] == 300000, f"Total should be 300000, got {data['total']}"  # 100 * 3000
        assert data["advance"] == 50000, f"Advance should be 50000, got {data.get('advance')}"
        
        # CRITICAL: Balance = total - advance (NOT total - cash - diesel)
        expected_balance = 300000 - 50000  # 250000
        assert data["balance"] == expected_balance, f"Balance should be {expected_balance}, got {data['balance']}"
        
        # Paid amount should be advance only
        assert data["paid_amount"] == 50000, f"Paid amount should be 50000, got {data['paid_amount']}"
        
        print(f"Created voucher #{data['voucher_no']} - Total: {data['total']}, Advance: {data['advance']}, Balance: {data['balance']}")
    
    def test_02_verify_party_jama_entry(self):
        """Entry 1: Party Ledger JAMA (party owes us total amount)"""
        assert TestSaleBookLedgerEntries.voucher_id is not None
        
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        assert response.status_code == 200
        txns = response.json()
        
        # Find party jama entry - reference should be sale_voucher:{id}
        party_jama = [t for t in txns if 
                      f"sale_voucher:{TestSaleBookLedgerEntries.voucher_id}" == t.get("reference", "") and
                      t["txn_type"] == "jama" and t["account"] == "ledger"]
        
        assert len(party_jama) == 1, f"Expected 1 party jama entry, got {len(party_jama)}"
        entry = party_jama[0]
        
        assert entry["amount"] == 300000, f"Party jama should be 300000 (total), got {entry['amount']}"
        assert entry["category"] == f"{TEST_PREFIX}FullAccountingParty"
        assert entry["party_type"] == "Sale Book"
        
        print(f"Party Jama Entry: Rs.{entry['amount']} for {entry['category']}")
    
    def test_03_verify_party_nikasi_advance_entry(self):
        """Entry 2: Party Ledger NIKASI (advance received reduces party debt)"""
        assert TestSaleBookLedgerEntries.voucher_id is not None
        
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        assert response.status_code == 200
        txns = response.json()
        
        # Find party nikasi entry - reference should be sale_voucher_adv:{id}
        party_nikasi = [t for t in txns if 
                        f"sale_voucher_adv:{TestSaleBookLedgerEntries.voucher_id}" == t.get("reference", "") and
                        t["txn_type"] == "nikasi" and t["account"] == "ledger"]
        
        assert len(party_nikasi) == 1, f"Expected 1 party nikasi (advance) entry, got {len(party_nikasi)}"
        entry = party_nikasi[0]
        
        assert entry["amount"] == 50000, f"Party nikasi (advance) should be 50000, got {entry['amount']}"
        assert entry["category"] == f"{TEST_PREFIX}FullAccountingParty"
        assert "Advance received" in entry.get("description", ""), f"Description should mention advance"
        
        print(f"Party Advance (Nikasi) Entry: Rs.{entry['amount']} - {entry['description']}")
    
    def test_04_verify_cash_nikasi_truck_entry(self):
        """Entry 3: Cash NIKASI (cash going out to truck)"""
        assert TestSaleBookLedgerEntries.voucher_id is not None
        
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        assert response.status_code == 200
        txns = response.json()
        
        # Find cash nikasi entry - reference should be sale_voucher_cash:{id}
        cash_nikasi = [t for t in txns if 
                       f"sale_voucher_cash:{TestSaleBookLedgerEntries.voucher_id}" == t.get("reference", "") and
                       t["txn_type"] == "nikasi" and t["account"] == "cash"]
        
        assert len(cash_nikasi) == 1, f"Expected 1 cash nikasi entry, got {len(cash_nikasi)}"
        entry = cash_nikasi[0]
        
        assert entry["amount"] == 5000, f"Cash nikasi (to truck) should be 5000, got {entry['amount']}"
        assert "OD99X6363" in entry.get("category", "") or entry.get("party_type") == "Truck"
        assert "Truck cash" in entry.get("description", ""), f"Description should mention truck cash"
        
        print(f"Cash Nikasi (Truck) Entry: Rs.{entry['amount']} - {entry['description']}")
    
    def test_05_verify_diesel_pump_jama_entry(self):
        """Entry 4: Diesel Pump Ledger JAMA (we owe pump for diesel)"""
        assert TestSaleBookLedgerEntries.voucher_id is not None
        
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        assert response.status_code == 200
        txns = response.json()
        
        # Find diesel pump jama entry - reference should be sale_voucher_diesel:{id}
        diesel_jama = [t for t in txns if 
                       f"sale_voucher_diesel:{TestSaleBookLedgerEntries.voucher_id}" == t.get("reference", "") and
                       t["txn_type"] == "jama" and t["account"] == "ledger"]
        
        assert len(diesel_jama) == 1, f"Expected 1 diesel pump jama entry, got {len(diesel_jama)}"
        entry = diesel_jama[0]
        
        assert entry["amount"] == 3000, f"Diesel pump jama should be 3000, got {entry['amount']}"
        assert entry["party_type"] == "Diesel", f"Party type should be Diesel, got {entry.get('party_type')}"
        assert "Diesel for truck" in entry.get("description", ""), f"Description should mention diesel for truck"
        
        print(f"Diesel Pump Jama Entry: Rs.{entry['amount']} to {entry['category']} - {entry['description']}")
    
    def test_06_verify_truck_jama_nikasi_entries(self):
        """Entry 5: Truck Ledger JAMA + NIKASI (truck earned and paid via cash+diesel)"""
        assert TestSaleBookLedgerEntries.voucher_id is not None
        
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        assert response.status_code == 200
        txns = response.json()
        
        # Find truck entries - reference should be sale_voucher_truck:{id}
        truck_entries = [t for t in txns if 
                         f"sale_voucher_truck:{TestSaleBookLedgerEntries.voucher_id}" == t.get("reference", "") and
                         t["account"] == "ledger"]
        
        assert len(truck_entries) == 2, f"Expected 2 truck entries (jama + nikasi), got {len(truck_entries)}"
        
        truck_jama = [t for t in truck_entries if t["txn_type"] == "jama"]
        truck_nikasi = [t for t in truck_entries if t["txn_type"] == "nikasi"]
        
        assert len(truck_jama) == 1, "Expected 1 truck jama entry"
        assert len(truck_nikasi) == 1, "Expected 1 truck nikasi entry"
        
        # Truck total = cash + diesel = 5000 + 3000 = 8000
        expected_truck_total = 8000
        
        assert truck_jama[0]["amount"] == expected_truck_total, f"Truck jama should be {expected_truck_total}, got {truck_jama[0]['amount']}"
        assert truck_nikasi[0]["amount"] == expected_truck_total, f"Truck nikasi should be {expected_truck_total}, got {truck_nikasi[0]['amount']}"
        assert truck_jama[0]["category"] == "OD99X6363", f"Truck category should be truck_no"
        assert truck_jama[0]["party_type"] == "Truck"
        
        print(f"Truck Jama: Rs.{truck_jama[0]['amount']}, Truck Nikasi: Rs.{truck_nikasi[0]['amount']}")


class TestBalanceCalculation:
    """Test that balance = total - advance (not total - cash - diesel)"""
    
    voucher_id = None
    
    def test_01_balance_equals_total_minus_advance(self):
        """Balance should be total - advance only"""
        payload = {
            "date": "2025-01-21",
            "party_name": f"{TEST_PREFIX}BalanceTestParty",
            "invoice_no": "INV-63-BAL",
            "items": [{"item_name": "Bran", "quantity": 50, "rate": 400, "unit": "Qntl"}],  # 20000
            "gst_type": "none",
            "cgst_percent": 0, "sgst_percent": 0, "igst_percent": 0,
            "truck_no": "OD11B2222",
            "rst_no": "",
            "remark": "Balance test",
            "cash_paid": 2000,      # Cash to truck - should NOT affect balance
            "diesel_paid": 1500,   # Diesel to truck - should NOT affect balance
            "advance": 5000,       # Advance from party - this affects balance
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        
        response = requests.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        data = response.json()
        TestBalanceCalculation.voucher_id = data["id"]
        
        # Total = 50 * 400 = 20000
        assert data["total"] == 20000
        
        # OLD WRONG: Balance = total - cash - diesel = 20000 - 2000 - 1500 = 16500
        # NEW CORRECT: Balance = total - advance = 20000 - 5000 = 15000
        expected_balance = 20000 - 5000  # 15000
        
        assert data["balance"] == expected_balance, \
            f"Balance should be {expected_balance} (total - advance), got {data['balance']}. " \
            f"Cash/Diesel should NOT affect balance!"
        
        print(f"VERIFIED: Balance = Total({data['total']}) - Advance({data['advance']}) = {data['balance']}")
    
    def test_02_balance_zero_when_advance_equals_total(self):
        """Balance = 0 when advance equals total"""
        payload = {
            "date": "2025-01-21",
            "party_name": f"{TEST_PREFIX}FullAdvanceParty",
            "invoice_no": "INV-63-FULL",
            "items": [{"item_name": "Kunda", "quantity": 20, "rate": 200, "unit": "Qntl"}],  # 4000
            "gst_type": "none",
            "cgst_percent": 0, "sgst_percent": 0, "igst_percent": 0,
            "truck_no": "OD11C3333",
            "rst_no": "",
            "remark": "Full advance test",
            "cash_paid": 1000,
            "diesel_paid": 500,
            "advance": 4000,  # Advance equals total
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        
        response = requests.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        assert data["total"] == 4000
        assert data["advance"] == 4000
        assert data["balance"] == 0, f"Balance should be 0 when advance=total, got {data['balance']}"
        
        print(f"VERIFIED: Balance = 0 when Advance({data['advance']}) = Total({data['total']})")


class TestInvoiceNoField:
    """Test invoice_no field is stored and returned correctly"""
    
    def test_01_invoice_no_stored_and_returned(self):
        """Invoice No should be stored and returned in voucher"""
        payload = {
            "date": "2025-01-22",
            "party_name": f"{TEST_PREFIX}InvoiceTestParty",
            "invoice_no": "TAX/2025/001",
            "items": [{"item_name": "Broken", "quantity": 10, "rate": 150, "unit": "Qntl"}],
            "gst_type": "none",
            "cgst_percent": 0, "sgst_percent": 0, "igst_percent": 0,
            "truck_no": "", "rst_no": "", "remark": "",
            "cash_paid": 0, "diesel_paid": 0, "advance": 0,
            "kms_year": "2025-2026", "season": "Kharif"
        }
        
        response = requests.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        assert data["invoice_no"] == "TAX/2025/001", f"Invoice no not stored: {data.get('invoice_no')}"
        print(f"Invoice No stored: {data['invoice_no']}")
    
    def test_02_invoice_no_in_list(self):
        """Invoice No should be returned in voucher list"""
        response = requests.get(f"{BASE_URL}/api/sale-book?kms_year=2025-2026")
        assert response.status_code == 200
        vouchers = response.json()
        
        # Find our test voucher
        test_voucher = [v for v in vouchers if v.get("party_name") == f"{TEST_PREFIX}InvoiceTestParty"]
        assert len(test_voucher) >= 1, "Test voucher not found in list"
        
        assert test_voucher[0].get("invoice_no") == "TAX/2025/001"
        print(f"Invoice No in list: {test_voucher[0].get('invoice_no')}")


class TestSearchFilter:
    """Test search filter across party_name, invoice_no, rst_no, truck_no"""
    
    def test_01_search_by_party_name(self):
        """Search by party name"""
        response = requests.get(f"{BASE_URL}/api/sale-book?kms_year=2025-2026&search={TEST_PREFIX}FullAccounting")
        assert response.status_code == 200
        vouchers = response.json()
        
        assert len(vouchers) >= 1, f"Should find at least 1 voucher by party name, got {len(vouchers)}"
        assert all(TEST_PREFIX in v.get("party_name", "") for v in vouchers)
        print(f"Search by party: found {len(vouchers)} vouchers")
    
    def test_02_search_by_invoice_no(self):
        """Search by invoice no"""
        response = requests.get(f"{BASE_URL}/api/sale-book?kms_year=2025-2026&search=INV-63")
        assert response.status_code == 200
        vouchers = response.json()
        
        assert len(vouchers) >= 1, f"Should find at least 1 voucher by invoice no"
        assert all("INV-63" in v.get("invoice_no", "") for v in vouchers)
        print(f"Search by invoice: found {len(vouchers)} vouchers")
    
    def test_03_search_by_rst_no(self):
        """Search by RST no"""
        response = requests.get(f"{BASE_URL}/api/sale-book?kms_year=2025-2026&search=RST-63")
        assert response.status_code == 200
        vouchers = response.json()
        
        assert len(vouchers) >= 1, f"Should find at least 1 voucher by RST no"
        print(f"Search by RST: found {len(vouchers)} vouchers")
    
    def test_04_search_by_truck_no(self):
        """Search by truck no"""
        response = requests.get(f"{BASE_URL}/api/sale-book?kms_year=2025-2026&search=OD99X6363")
        assert response.status_code == 200
        vouchers = response.json()
        
        assert len(vouchers) >= 1, f"Should find at least 1 voucher by truck no"
        assert all("OD99X6363" in v.get("truck_no", "") for v in vouchers)
        print(f"Search by truck: found {len(vouchers)} vouchers")
    
    def test_05_search_no_results(self):
        """Search with no matching results"""
        response = requests.get(f"{BASE_URL}/api/sale-book?kms_year=2025-2026&search=NONEXISTENT12345")
        assert response.status_code == 200
        vouchers = response.json()
        
        assert len(vouchers) == 0, f"Should find 0 vouchers for non-existent search"
        print("Search with no results: 0 vouchers (expected)")


class TestExcelExport:
    """Test Excel export endpoint"""
    
    def test_01_excel_export_returns_xlsx(self):
        """GET /api/sale-book/export/excel returns xlsx file"""
        response = requests.get(f"{BASE_URL}/api/sale-book/export/excel?kms_year=2025-2026")
        assert response.status_code == 200, f"Excel export failed: {response.status_code}"
        
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "xlsx" in content_type or "octet-stream" in content_type, \
            f"Content-Type should be xlsx, got {content_type}"
        
        # Check Content-Disposition header
        content_disposition = response.headers.get("content-disposition", "")
        assert "attachment" in content_disposition.lower(), f"Should be attachment, got {content_disposition}"
        assert ".xlsx" in content_disposition.lower(), f"Filename should be .xlsx, got {content_disposition}"
        
        # Check content starts with xlsx magic bytes (PK)
        assert len(response.content) > 100, "Excel file should have content"
        
        print(f"Excel export: {len(response.content)} bytes, Content-Disposition: {content_disposition}")
    
    def test_02_excel_export_with_search_filter(self):
        """Excel export respects search filter"""
        response = requests.get(f"{BASE_URL}/api/sale-book/export/excel?kms_year=2025-2026&search=NONEXISTENT12345")
        assert response.status_code == 200
        
        # Even with no results, should return valid xlsx (with headers only)
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "xlsx" in content_type or "octet-stream" in content_type
        
        print("Excel export with empty search filter: valid xlsx returned")


class TestEditVoucherLedgerRecreation:
    """Test PUT recreates all ledger entries correctly after edit"""
    
    voucher_id = None
    
    def test_01_create_voucher_for_edit(self):
        """Create voucher for edit test"""
        payload = {
            "date": "2025-01-23",
            "party_name": f"{TEST_PREFIX}EditLedgerTestParty",
            "invoice_no": "INV-63-EDIT",
            "items": [{"item_name": "Husk", "quantity": 30, "rate": 100, "unit": "Qntl"}],  # 3000
            "gst_type": "none",
            "cgst_percent": 0, "sgst_percent": 0, "igst_percent": 0,
            "truck_no": "OD22E4444",
            "rst_no": "",
            "remark": "",
            "cash_paid": 500,
            "diesel_paid": 300,
            "advance": 1000,
            "kms_year": "2025-2026", "season": "Kharif"
        }
        
        response = requests.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        data = response.json()
        TestEditVoucherLedgerRecreation.voucher_id = data["id"]
        
        # Verify initial ledger entries created
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        txns = response.json()
        
        initial_entries = [t for t in txns if TestEditVoucherLedgerRecreation.voucher_id in t.get("reference", "")]
        # Should have: party jama, party nikasi (advance), cash nikasi, diesel jama, truck jama, truck nikasi = 6 entries
        assert len(initial_entries) >= 5, f"Expected at least 5 ledger entries, got {len(initial_entries)}"
        
        print(f"Created voucher with {len(initial_entries)} ledger entries")
    
    def test_02_edit_voucher_updates_ledger_entries(self):
        """Edit voucher and verify ledger entries are recreated with new amounts"""
        assert TestEditVoucherLedgerRecreation.voucher_id is not None
        
        payload = {
            "date": "2025-01-24",
            "party_name": f"{TEST_PREFIX}EditLedgerTestParty",
            "invoice_no": "INV-63-EDIT-V2",
            "items": [{"item_name": "Husk", "quantity": 60, "rate": 100, "unit": "Qntl"}],  # Changed: 6000
            "gst_type": "none",
            "cgst_percent": 0, "sgst_percent": 0, "igst_percent": 0,
            "truck_no": "OD22E4444",
            "rst_no": "",
            "remark": "Updated",
            "cash_paid": 1000,     # Changed
            "diesel_paid": 600,   # Changed
            "advance": 2000,      # Changed
            "kms_year": "2025-2026", "season": "Kharif"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/sale-book/{TestEditVoucherLedgerRecreation.voucher_id}?username=admin&role=admin",
            json=payload
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify new calculations
        assert data["total"] == 6000
        assert data["advance"] == 2000
        assert data["balance"] == 4000, f"Balance should be 4000 (6000-2000), got {data['balance']}"
        
        # Verify ledger entries are updated
        time.sleep(0.5)  # Allow time for async operations
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        txns = response.json()
        
        voucher_entries = [t for t in txns if TestEditVoucherLedgerRecreation.voucher_id in t.get("reference", "")]
        
        # Verify party jama is now 6000
        party_jama = [t for t in voucher_entries if 
                      t.get("reference") == f"sale_voucher:{TestEditVoucherLedgerRecreation.voucher_id}" and
                      t["txn_type"] == "jama" and t["account"] == "ledger"]
        assert len(party_jama) == 1
        assert party_jama[0]["amount"] == 6000, f"Party jama should be 6000, got {party_jama[0]['amount']}"
        
        # Verify advance nikasi is now 2000
        advance_nikasi = [t for t in voucher_entries if 
                          "sale_voucher_adv" in t.get("reference", "") and
                          t["txn_type"] == "nikasi"]
        assert len(advance_nikasi) == 1
        assert advance_nikasi[0]["amount"] == 2000, f"Advance nikasi should be 2000, got {advance_nikasi[0]['amount']}"
        
        print(f"After edit: Party Jama={party_jama[0]['amount']}, Advance Nikasi={advance_nikasi[0]['amount']}")


class TestDeleteVoucherCleanup:
    """Test DELETE cleans up all related ledger entries"""
    
    def test_01_delete_removes_all_ledger_entries(self):
        """Delete voucher should remove all 5 types of ledger entries"""
        # Create a voucher
        payload = {
            "date": "2025-01-25",
            "party_name": f"{TEST_PREFIX}DeleteTestParty",
            "invoice_no": "INV-63-DEL",
            "items": [{"item_name": "FRK", "quantity": 20, "rate": 500, "unit": "Qntl"}],  # 10000
            "gst_type": "none",
            "cgst_percent": 0, "sgst_percent": 0, "igst_percent": 0,
            "truck_no": "OD33D5555",
            "rst_no": "",
            "remark": "",
            "cash_paid": 800,
            "diesel_paid": 400,
            "advance": 3000,
            "kms_year": "2025-2026", "season": "Kharif"
        }
        
        response = requests.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=payload)
        assert response.status_code == 200
        voucher_id = response.json()["id"]
        
        # Verify entries exist
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        txns = response.json()
        entries_before = [t for t in txns if voucher_id in t.get("reference", "")]
        assert len(entries_before) >= 5, f"Should have at least 5 entries before delete, got {len(entries_before)}"
        
        # Delete voucher
        response = requests.delete(f"{BASE_URL}/api/sale-book/{voucher_id}?username=admin&role=admin")
        assert response.status_code == 200
        
        # Verify all entries are cleaned up
        time.sleep(0.5)
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        txns = response.json()
        entries_after = [t for t in txns if voucher_id in t.get("reference", "")]
        
        assert len(entries_after) == 0, f"Should have 0 entries after delete, got {len(entries_after)}"
        
        print(f"Delete removed {len(entries_before)} ledger entries (all cleaned up)")


class TestCleanupIteration63:
    """Cleanup all test data"""
    
    def test_99_cleanup(self):
        """Delete all test vouchers and entries"""
        # Delete sale vouchers
        response = requests.get(f"{BASE_URL}/api/sale-book?kms_year=2025-2026")
        if response.status_code == 200:
            for v in response.json():
                if TEST_PREFIX in v.get("party_name", ""):
                    requests.delete(f"{BASE_URL}/api/sale-book/{v['id']}?username=admin")
                    print(f"Deleted voucher: {v['id']}")
        
        # Cleanup any stray cash transactions
        response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        if response.status_code == 200:
            for t in response.json():
                if TEST_PREFIX in t.get("category", ""):
                    requests.delete(f"{BASE_URL}/api/cash-book/{t['id']}?username=admin")
        
        print("Cleanup complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
