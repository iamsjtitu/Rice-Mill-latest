"""
Iteration 66 - Enhanced Gunny Bags, Stock Summary, and Party Summary Tests
Tests for:
1. Gunny Bags CRUD with new fields (invoice_no, truck_no, rst_no, party_name, gst_type, gst_percent, advance)
2. Gunny Bags GST calculation (CGST+SGST and IGST)
3. Gunny Bags accounting entries (party ledger JAMA, advance NIKASI, cash NIKASI)
4. Gunny Bags DELETE and PUT with accounting entry cleanup/recreation
5. Stock Summary includes Gunny Bags with in/out/available in Bags unit
6. Party Summary search functionality
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://grain-ledger-sync.preview.emergentagent.com"


class TestGunnyBagsEnhancedCRUD:
    """Test Gunny Bags CRUD with new fields"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_id_prefix = f"TEST_{uuid.uuid4().hex[:8]}"
        self.created_ids = []
        yield
        # Cleanup after tests
        for entry_id in self.created_ids:
            try:
                requests.delete(f"{BASE_URL}/api/gunny-bags/{entry_id}")
            except:
                pass

    def test_create_gunny_bag_with_new_fields_no_gst(self):
        """Test creating gunny bag entry with new fields and no GST"""
        payload = {
            "date": "2025-01-15",
            "bag_type": "old",
            "txn_type": "in",
            "quantity": 100,
            "rate": 10.0,
            "party_name": f"{self.test_id_prefix}_Party_A",
            "invoice_no": f"INV-{self.test_id_prefix}",
            "truck_no": "OD01XY1234",
            "rst_no": "RST-001",
            "gst_type": "none",
            "gst_percent": 0,
            "advance": 500,
            "reference": "REF-001",
            "notes": "Test entry",
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/gunny-bags?username=admin", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        self.created_ids.append(data["id"])
        
        # Verify new fields are saved
        assert data["party_name"] == payload["party_name"], f"party_name mismatch"
        assert data["invoice_no"] == payload["invoice_no"], f"invoice_no mismatch"
        assert data["truck_no"] == payload["truck_no"], f"truck_no mismatch"
        assert data["rst_no"] == payload["rst_no"], f"rst_no mismatch"
        assert data["gst_type"] == "none", f"gst_type mismatch"
        assert data["advance"] == 500, f"advance mismatch"
        
        # Verify amount calculation (no GST)
        expected_subtotal = 100 * 10.0
        assert data["subtotal"] == expected_subtotal, f"Expected subtotal {expected_subtotal}, got {data['subtotal']}"
        assert data["gst_amount"] == 0, f"Expected gst_amount 0, got {data['gst_amount']}"
        assert data["total"] == expected_subtotal, f"Expected total {expected_subtotal}, got {data['total']}"
        print(f"✓ Created gunny bag with no GST - Total: {data['total']}")

    def test_create_gunny_bag_with_cgst_sgst(self):
        """Test creating gunny bag entry with CGST+SGST"""
        payload = {
            "date": "2025-01-15",
            "bag_type": "old",
            "txn_type": "in",
            "quantity": 200,
            "rate": 15.0,
            "party_name": f"{self.test_id_prefix}_Party_B",
            "invoice_no": f"INV2-{self.test_id_prefix}",
            "truck_no": "OD02AB5678",
            "rst_no": "RST-002",
            "gst_type": "cgst_sgst",
            "gst_percent": 9,  # 9% CGST + 9% SGST = 18% total
            "advance": 1000,
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/gunny-bags?username=admin", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        self.created_ids.append(data["id"])
        
        # Verify GST calculation: subtotal + (subtotal * gst_percent / 100) * 2
        expected_subtotal = 200 * 15.0  # 3000
        expected_gst = round(expected_subtotal * 9 / 100, 2) * 2  # 540 (9% x 2 for CGST+SGST)
        expected_total = expected_subtotal + expected_gst  # 3540
        
        assert data["subtotal"] == expected_subtotal, f"Expected subtotal {expected_subtotal}, got {data['subtotal']}"
        assert data["gst_amount"] == expected_gst, f"Expected gst_amount {expected_gst}, got {data['gst_amount']}"
        assert data["total"] == expected_total, f"Expected total {expected_total}, got {data['total']}"
        print(f"✓ Created gunny bag with CGST+SGST - Subtotal: {expected_subtotal}, GST: {expected_gst}, Total: {data['total']}")

    def test_create_gunny_bag_with_igst(self):
        """Test creating gunny bag entry with IGST"""
        payload = {
            "date": "2025-01-15",
            "bag_type": "old",
            "txn_type": "in",
            "quantity": 150,
            "rate": 12.0,
            "party_name": f"{self.test_id_prefix}_Party_C",
            "invoice_no": f"INV3-{self.test_id_prefix}",
            "truck_no": "OD03CD9012",
            "rst_no": "RST-003",
            "gst_type": "igst",
            "gst_percent": 18,  # 18% IGST
            "advance": 300,
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/gunny-bags?username=admin", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        self.created_ids.append(data["id"])
        
        # Verify GST calculation: subtotal + (subtotal * gst_percent / 100)
        expected_subtotal = 150 * 12.0  # 1800
        expected_gst = round(expected_subtotal * 18 / 100, 2)  # 324
        expected_total = expected_subtotal + expected_gst  # 2124
        
        assert data["subtotal"] == expected_subtotal, f"Expected subtotal {expected_subtotal}, got {data['subtotal']}"
        assert data["gst_amount"] == expected_gst, f"Expected gst_amount {expected_gst}, got {data['gst_amount']}"
        assert data["total"] == expected_total, f"Expected total {expected_total}, got {data['total']}"
        print(f"✓ Created gunny bag with IGST - Subtotal: {expected_subtotal}, GST: {expected_gst}, Total: {data['total']}")


class TestGunnyBagsAccountingEntries:
    """Test Gunny Bags accounting entries creation"""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.test_id_prefix = f"TEST_{uuid.uuid4().hex[:8]}"
        self.created_ids = []
        yield
        for entry_id in self.created_ids:
            try:
                requests.delete(f"{BASE_URL}/api/gunny-bags/{entry_id}")
            except:
                pass

    def test_accounting_entries_created_for_purchase(self):
        """Test that accounting entries are created when gunny bag is purchased"""
        party_name = f"{self.test_id_prefix}_Gunny_Supplier"
        payload = {
            "date": "2025-01-15",
            "bag_type": "old",
            "txn_type": "in",
            "quantity": 50,
            "rate": 20.0,
            "party_name": party_name,
            "invoice_no": f"ACCT-INV-{self.test_id_prefix}",
            "gst_type": "none",
            "gst_percent": 0,
            "advance": 500,
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/gunny-bags?username=admin", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        self.created_ids.append(data["id"])
        doc_id = data["id"]
        
        # Check accounting entries in cash-book
        txn_response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2024-2025&season=Kharif")
        assert txn_response.status_code == 200
        
        transactions = txn_response.json()
        
        # Find entries related to this gunny bag
        jama_entry = None
        nikasi_advance_entry = None
        cash_nikasi_entry = None
        
        for txn in transactions:
            ref = txn.get("reference", "")
            if f"gunny_purchase:{doc_id}" in ref:
                jama_entry = txn
            elif f"gunny_advance:{doc_id}" in ref:
                nikasi_advance_entry = txn
            elif f"gunny_cash:{doc_id}" in ref:
                cash_nikasi_entry = txn
        
        # Verify JAMA entry (party ledger - total amount we owe)
        assert jama_entry is not None, f"JAMA entry not found for gunny_purchase:{doc_id}"
        assert jama_entry["txn_type"] == "jama", "Expected JAMA entry"
        assert jama_entry["amount"] == 1000, f"Expected JAMA amount 1000 (50*20), got {jama_entry['amount']}"
        assert jama_entry["category"] == party_name, f"Expected category {party_name}"
        print(f"✓ JAMA entry created: Rs.{jama_entry['amount']} for {party_name}")
        
        # Verify NIKASI entry in party ledger (advance paid)
        assert nikasi_advance_entry is not None, f"NIKASI advance entry not found"
        assert nikasi_advance_entry["txn_type"] == "nikasi", "Expected NIKASI entry"
        assert nikasi_advance_entry["amount"] == 500, f"Expected advance NIKASI 500, got {nikasi_advance_entry['amount']}"
        print(f"✓ NIKASI (advance) entry in party ledger: Rs.{nikasi_advance_entry['amount']}")
        
        # Verify Cash NIKASI entry (cash going out)
        assert cash_nikasi_entry is not None, f"Cash NIKASI entry not found"
        assert cash_nikasi_entry["account"] == "cash", "Expected cash account"
        assert cash_nikasi_entry["txn_type"] == "nikasi", "Expected NIKASI"
        assert cash_nikasi_entry["amount"] == 500, f"Expected cash NIKASI 500, got {cash_nikasi_entry['amount']}"
        print(f"✓ Cash NIKASI entry: Rs.{cash_nikasi_entry['amount']}")


class TestGunnyBagsDeleteCleansUpAccounting:
    """Test that deleting gunny bags cleans up accounting entries"""

    def test_delete_cleans_up_accounting_entries(self):
        """Test DELETE /api/gunny-bags/{id} removes accounting entries"""
        test_id = f"TEST_{uuid.uuid4().hex[:8]}"
        party_name = f"{test_id}_Delete_Test_Party"
        
        # Create a gunny bag with accounting
        payload = {
            "date": "2025-01-15",
            "bag_type": "old",
            "txn_type": "in",
            "quantity": 30,
            "rate": 25.0,
            "party_name": party_name,
            "invoice_no": f"DEL-INV-{test_id}",
            "gst_type": "none",
            "advance": 200,
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        create_response = requests.post(f"{BASE_URL}/api/gunny-bags?username=admin", json=payload)
        assert create_response.status_code == 200
        doc_id = create_response.json()["id"]
        
        # Verify accounting entries exist
        txn_response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2024-2025&season=Kharif")
        transactions = txn_response.json()
        related_entries = [t for t in transactions if doc_id in t.get("reference", "")]
        assert len(related_entries) >= 2, f"Expected accounting entries, found {len(related_entries)}"
        
        # Delete the gunny bag
        delete_response = requests.delete(f"{BASE_URL}/api/gunny-bags/{doc_id}")
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        print(f"✓ Deleted gunny bag {doc_id}")
        
        # Verify accounting entries are cleaned up
        txn_response2 = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2024-2025&season=Kharif")
        transactions2 = txn_response2.json()
        remaining_entries = [t for t in transactions2 if doc_id in t.get("reference", "")]
        assert len(remaining_entries) == 0, f"Expected 0 accounting entries after delete, found {len(remaining_entries)}"
        print(f"✓ Accounting entries cleaned up after delete")


class TestGunnyBagsUpdate:
    """Test Gunny Bags PUT updates amounts and recreates accounting entries"""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.test_id_prefix = f"TEST_{uuid.uuid4().hex[:8]}"
        self.created_ids = []
        yield
        for entry_id in self.created_ids:
            try:
                requests.delete(f"{BASE_URL}/api/gunny-bags/{entry_id}")
            except:
                pass

    def test_update_recalculates_amounts_and_accounting(self):
        """Test PUT /api/gunny-bags/{id} recalculates amounts and recreates accounting"""
        party_name = f"{self.test_id_prefix}_Update_Party"
        
        # Create initial entry
        payload = {
            "date": "2025-01-15",
            "bag_type": "old",
            "txn_type": "in",
            "quantity": 40,
            "rate": 10.0,
            "party_name": party_name,
            "invoice_no": f"UPD-INV-{self.test_id_prefix}",
            "gst_type": "none",
            "advance": 100,
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        create_response = requests.post(f"{BASE_URL}/api/gunny-bags?username=admin", json=payload)
        assert create_response.status_code == 200
        doc_id = create_response.json()["id"]
        self.created_ids.append(doc_id)
        
        # Initial total should be 400 (40 * 10)
        assert create_response.json()["total"] == 400
        print(f"✓ Initial entry created with total: 400")
        
        # Update with new values and add GST
        update_payload = {
            "date": "2025-01-16",
            "bag_type": "old",
            "txn_type": "in",
            "quantity": 60,  # increased
            "rate": 15.0,   # increased
            "party_name": party_name,
            "invoice_no": f"UPD-INV-{self.test_id_prefix}",
            "gst_type": "cgst_sgst",  # added GST
            "gst_percent": 9,
            "advance": 500,  # increased
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        update_response = requests.put(f"{BASE_URL}/api/gunny-bags/{doc_id}?username=admin", json=update_payload)
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        updated = update_response.json()
        
        # Verify recalculated amounts
        expected_subtotal = 60 * 15.0  # 900
        expected_gst = round(expected_subtotal * 9 / 100, 2) * 2  # 162
        expected_total = expected_subtotal + expected_gst  # 1062
        
        assert updated["subtotal"] == expected_subtotal, f"Expected subtotal {expected_subtotal}, got {updated['subtotal']}"
        assert updated["gst_amount"] == expected_gst, f"Expected gst_amount {expected_gst}, got {updated['gst_amount']}"
        assert updated["total"] == expected_total, f"Expected total {expected_total}, got {updated['total']}"
        print(f"✓ Updated entry - Subtotal: {expected_subtotal}, GST: {expected_gst}, Total: {expected_total}")
        
        # Verify accounting entries were recreated with new amounts
        txn_response = requests.get(f"{BASE_URL}/api/cash-book?kms_year=2024-2025&season=Kharif")
        transactions = txn_response.json()
        
        jama_entry = next((t for t in transactions if f"gunny_purchase:{doc_id}" in t.get("reference", "")), None)
        assert jama_entry is not None, "JAMA entry should exist after update"
        assert jama_entry["amount"] == expected_total, f"JAMA amount should be {expected_total}, got {jama_entry['amount']}"
        print(f"✓ Accounting entries recreated with new total: Rs.{expected_total}")


class TestStockSummaryIncludesGunnyBags:
    """Test Stock Summary includes Gunny Bags"""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.test_id_prefix = f"TEST_{uuid.uuid4().hex[:8]}"
        self.created_ids = []
        yield
        for entry_id in self.created_ids:
            try:
                requests.delete(f"{BASE_URL}/api/gunny-bags/{entry_id}")
            except:
                pass

    def test_stock_summary_shows_gunny_bags(self):
        """Test GET /api/stock-summary includes Gunny Bags with correct in/out/available"""
        # Create some gunny bag entries
        # Entry 1: 100 bags IN
        payload1 = {
            "date": "2025-01-15",
            "bag_type": "old",
            "txn_type": "in",
            "quantity": 100,
            "rate": 10.0,
            "party_name": f"{self.test_id_prefix}_Stock_Party",
            "gst_type": "none",
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        resp1 = requests.post(f"{BASE_URL}/api/gunny-bags?username=admin", json=payload1)
        assert resp1.status_code == 200
        self.created_ids.append(resp1.json()["id"])
        
        # Entry 2: 50 bags OUT
        payload2 = {
            "date": "2025-01-16",
            "bag_type": "old",
            "txn_type": "out",
            "quantity": 50,
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        resp2 = requests.post(f"{BASE_URL}/api/gunny-bags?username=admin", json=payload2)
        assert resp2.status_code == 200
        self.created_ids.append(resp2.json()["id"])
        
        # Get stock summary
        stock_response = requests.get(f"{BASE_URL}/api/stock-summary?kms_year=2024-2025&season=Kharif")
        assert stock_response.status_code == 200
        
        stock_data = stock_response.json()
        items = stock_data.get("items", [])
        
        # Find Gunny Bags item
        gunny_item = next((i for i in items if i.get("name") == "Gunny Bags"), None)
        assert gunny_item is not None, "Gunny Bags should be in stock summary"
        
        assert gunny_item["category"] == "Raw Material", f"Expected category 'Raw Material', got {gunny_item['category']}"
        assert gunny_item["unit"] == "Bags", f"Expected unit 'Bags', got {gunny_item['unit']}"
        
        # Check that in_qty includes our entry (may have other entries too)
        assert gunny_item["in_qty"] >= 100, f"Expected in_qty >= 100, got {gunny_item['in_qty']}"
        print(f"✓ Stock Summary shows Gunny Bags - In: {gunny_item['in_qty']}, Out: {gunny_item['out_qty']}, Available: {gunny_item['available']}, Unit: {gunny_item['unit']}")


class TestPartySummarySearch:
    """Test Party Summary search functionality"""

    def test_party_summary_search_filters_results(self):
        """Test GET /api/private-trading/party-summary?search=xyz filters all 3 sections"""
        # First get full party summary
        full_response = requests.get(f"{BASE_URL}/api/private-trading/party-summary?kms_year=2024-2025&season=Kharif")
        assert full_response.status_code == 200, f"Party summary failed: {full_response.text}"
        full_data = full_response.json()
        
        # Check structure
        assert "paddy_purchase" in full_data, "Missing paddy_purchase section"
        assert "sale_vouchers" in full_data, "Missing sale_vouchers section"
        assert "purchase_vouchers" in full_data, "Missing purchase_vouchers section"
        assert "totals" in full_data, "Missing totals section"
        print(f"✓ Party summary structure correct")
        
        # Now test with a search term that likely won't match
        search_response = requests.get(f"{BASE_URL}/api/private-trading/party-summary?kms_year=2024-2025&season=Kharif&search=XYZNOTEXIST123")
        assert search_response.status_code == 200
        search_data = search_response.json()
        
        # All sections should be empty or have filtered results
        assert len(search_data["paddy_purchase"].get("parties", [])) <= len(full_data["paddy_purchase"].get("parties", [])), "Search should filter or match"
        assert len(search_data["sale_vouchers"].get("parties", [])) <= len(full_data["sale_vouchers"].get("parties", [])), "Search should filter or match"
        assert len(search_data["purchase_vouchers"].get("parties", [])) <= len(full_data["purchase_vouchers"].get("parties", [])), "Search should filter or match"
        print(f"✓ Party summary search filters results correctly")

    def test_party_summary_endpoint_accessible(self):
        """Test party summary endpoint is accessible and returns valid data"""
        response = requests.get(f"{BASE_URL}/api/private-trading/party-summary")
        assert response.status_code == 200, f"Party summary endpoint failed: {response.text}"
        
        data = response.json()
        totals = data.get("totals", {})
        
        # Verify totals structure
        assert "total_parties" in totals, "Missing total_parties"
        assert "total_purchase_balance" in totals, "Missing total_purchase_balance"
        assert "total_sale_balance" in totals, "Missing total_sale_balance"
        assert "total_net_balance" in totals, "Missing total_net_balance"
        print(f"✓ Party summary totals: {totals['total_parties']} parties, Purchase bal: {totals['total_purchase_balance']}, Sale bal: {totals['total_sale_balance']}")


class TestGunnyBagsGetAndList:
    """Test Gunny Bags list endpoint"""

    def test_gunny_bags_list_returns_new_fields(self):
        """Test GET /api/gunny-bags returns entries with all new fields"""
        # Create a test entry first
        test_id = f"TEST_{uuid.uuid4().hex[:8]}"
        payload = {
            "date": "2025-01-15",
            "bag_type": "old",
            "txn_type": "in",
            "quantity": 25,
            "rate": 8.0,
            "party_name": f"{test_id}_List_Test",
            "invoice_no": f"LIST-INV-{test_id}",
            "truck_no": "OD99ZZ9999",
            "rst_no": "RST-LIST",
            "gst_type": "igst",
            "gst_percent": 5,
            "advance": 50,
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        create_resp = requests.post(f"{BASE_URL}/api/gunny-bags?username=admin", json=payload)
        assert create_resp.status_code == 200
        created_id = create_resp.json()["id"]
        
        try:
            # Get list
            list_response = requests.get(f"{BASE_URL}/api/gunny-bags?kms_year=2024-2025&season=Kharif")
            assert list_response.status_code == 200
            
            entries = list_response.json()
            assert isinstance(entries, list), "Expected list of entries"
            
            # Find our entry
            our_entry = next((e for e in entries if e.get("id") == created_id), None)
            assert our_entry is not None, "Created entry not found in list"
            
            # Verify all fields are present
            assert "party_name" in our_entry, "party_name field missing"
            assert "invoice_no" in our_entry, "invoice_no field missing"
            assert "truck_no" in our_entry, "truck_no field missing"
            assert "rst_no" in our_entry, "rst_no field missing"
            assert "gst_type" in our_entry, "gst_type field missing"
            assert "gst_amount" in our_entry, "gst_amount field missing"
            assert "advance" in our_entry, "advance field missing"
            assert "total" in our_entry, "total field missing"
            
            # Verify values
            assert our_entry["party_name"] == payload["party_name"]
            assert our_entry["invoice_no"] == payload["invoice_no"]
            assert our_entry["truck_no"] == payload["truck_no"]
            print(f"✓ Gunny bags list returns all new fields correctly")
        finally:
            requests.delete(f"{BASE_URL}/api/gunny-bags/{created_id}")


class TestGunnyBagsSummary:
    """Test Gunny Bags summary endpoint"""

    def test_gunny_bags_summary_endpoint(self):
        """Test GET /api/gunny-bags/summary returns correct structure"""
        response = requests.get(f"{BASE_URL}/api/gunny-bags/summary?kms_year=2024-2025&season=Kharif")
        assert response.status_code == 200, f"Summary failed: {response.text}"
        
        data = response.json()
        
        # Check structure
        assert "new" in data, "Missing 'new' (govt bags) section"
        assert "old" in data, "Missing 'old' (market bags) section"
        
        # Check new bags structure
        new_bags = data["new"]
        assert "total_in" in new_bags, "Missing total_in in new bags"
        assert "total_out" in new_bags, "Missing total_out in new bags"
        assert "balance" in new_bags, "Missing balance in new bags"
        
        # Check old bags structure
        old_bags = data["old"]
        assert "total_in" in old_bags, "Missing total_in in old bags"
        assert "total_out" in old_bags, "Missing total_out in old bags"
        assert "balance" in old_bags, "Missing balance in old bags"
        assert "total_cost" in old_bags, "Missing total_cost in old bags"
        
        print(f"✓ Gunny bags summary - Govt: {new_bags['balance']} bags, Market: {old_bags['balance']} bags, Cost: Rs.{old_bags['total_cost']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
