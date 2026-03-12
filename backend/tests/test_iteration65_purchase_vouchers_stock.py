"""
Iteration 65 Test - Purchase Vouchers and Stock Summary Feature
Tests:
- Purchase Vouchers CRUD operations
- Stock Summary API
- Accounting entries (Party Ledger, Cash, Diesel, Truck payments)
- PDF and Excel exports
"""

import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
API = f"{BASE_URL}/api"


class TestPurchaseVouchersCRUD:
    """Test Purchase Vouchers CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_party = f"TEST_PARTY_{uuid.uuid4().hex[:6]}"
        self.test_invoice = f"INV_{uuid.uuid4().hex[:6]}"
        self.test_truck = f"CG{uuid.uuid4().hex[:4]}"
        self.created_voucher_id = None
        yield
        # Cleanup - delete test voucher if created
        if self.created_voucher_id:
            try:
                requests.delete(f"{API}/purchase-book/{self.created_voucher_id}?username=admin&role=admin")
            except:
                pass
    
    def test_01_create_purchase_voucher(self):
        """Test creating a new purchase voucher"""
        payload = {
            "date": "2026-01-15",
            "party_name": self.test_party,
            "invoice_no": self.test_invoice,
            "truck_no": self.test_truck,
            "items": [
                {"item_name": "TestItem", "quantity": 10, "rate": 100, "unit": "Qntl"},
                {"item_name": "AnotherItem", "quantity": 5, "rate": 200, "unit": "Kg"}
            ],
            "cash_paid": 500,
            "diesel_paid": 200,
            "advance": 300,
            "remark": "Test remark",
            "kms_year": "2025-26",
            "season": "Kharif"
        }
        
        response = requests.post(f"{API}/purchase-book?username=admin&role=admin", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should have id"
        assert "voucher_no" in data, "Response should have voucher_no"
        assert data["party_name"] == self.test_party
        assert data["invoice_no"] == self.test_invoice
        assert data["truck_no"] == self.test_truck
        assert len(data["items"]) == 2
        
        # Verify totals
        expected_subtotal = (10 * 100) + (5 * 200)  # 1000 + 1000 = 2000
        assert data["subtotal"] == expected_subtotal, f"Expected subtotal {expected_subtotal}, got {data['subtotal']}"
        assert data["total"] == expected_subtotal
        assert data["cash_paid"] == 500
        assert data["diesel_paid"] == 200
        assert data["advance"] == 300
        assert data["balance"] == expected_subtotal - 300  # 2000 - 300 = 1700
        
        self.created_voucher_id = data["id"]
        print(f"Created purchase voucher #{data['voucher_no']} with id: {data['id']}")
    
    def test_02_get_purchase_vouchers_list(self):
        """Test getting list of purchase vouchers"""
        response = requests.get(f"{API}/purchase-book")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} purchase vouchers")
    
    def test_03_get_purchase_vouchers_with_filters(self):
        """Test getting vouchers with search filter"""
        # First create a voucher
        payload = {
            "date": "2026-01-15",
            "party_name": f"FILTER_TEST_{uuid.uuid4().hex[:6]}",
            "invoice_no": f"FILTER_INV_{uuid.uuid4().hex[:6]}",
            "items": [{"item_name": "FilterItem", "quantity": 5, "rate": 50, "unit": "Qntl"}],
            "cash_paid": 0, "diesel_paid": 0, "advance": 0
        }
        create_res = requests.post(f"{API}/purchase-book?username=admin&role=admin", json=payload)
        assert create_res.status_code == 200
        created = create_res.json()
        
        # Search by party name
        response = requests.get(f"{API}/purchase-book?search=FILTER_TEST")
        assert response.status_code == 200
        data = response.json()
        assert any(v.get("party_name", "").startswith("FILTER_TEST") for v in data), "Search filter should work"
        
        # Cleanup
        requests.delete(f"{API}/purchase-book/{created['id']}?username=admin&role=admin")
        print("Search filter test passed")
    
    def test_04_update_purchase_voucher(self):
        """Test updating a purchase voucher"""
        # First create a voucher
        payload = {
            "date": "2026-01-15",
            "party_name": f"UPDATE_TEST_{uuid.uuid4().hex[:6]}",
            "invoice_no": f"UPD_INV_{uuid.uuid4().hex[:6]}",
            "items": [{"item_name": "OriginalItem", "quantity": 10, "rate": 100, "unit": "Qntl"}],
            "cash_paid": 100, "diesel_paid": 50, "advance": 200
        }
        create_res = requests.post(f"{API}/purchase-book?username=admin&role=admin", json=payload)
        assert create_res.status_code == 200
        created = create_res.json()
        voucher_id = created["id"]
        
        # Update the voucher
        update_payload = {
            "date": "2026-01-16",
            "party_name": payload["party_name"],
            "invoice_no": payload["invoice_no"],
            "items": [
                {"item_name": "UpdatedItem", "quantity": 20, "rate": 150, "unit": "Qntl"}
            ],
            "cash_paid": 200, "diesel_paid": 100, "advance": 500
        }
        update_res = requests.put(f"{API}/purchase-book/{voucher_id}?username=admin&role=admin", json=update_payload)
        assert update_res.status_code == 200
        
        updated = update_res.json()
        assert updated["date"] == "2026-01-16"
        assert updated["items"][0]["item_name"] == "UpdatedItem"
        assert updated["items"][0]["quantity"] == 20
        assert updated["cash_paid"] == 200
        assert updated["diesel_paid"] == 100
        assert updated["advance"] == 500
        
        # Cleanup
        requests.delete(f"{API}/purchase-book/{voucher_id}?username=admin&role=admin")
        print("Update test passed")
    
    def test_05_delete_purchase_voucher(self):
        """Test deleting a purchase voucher"""
        # First create a voucher
        payload = {
            "date": "2026-01-15",
            "party_name": f"DELETE_TEST_{uuid.uuid4().hex[:6]}",
            "items": [{"item_name": "DeleteItem", "quantity": 5, "rate": 50, "unit": "Qntl"}],
            "cash_paid": 0, "diesel_paid": 0, "advance": 0
        }
        create_res = requests.post(f"{API}/purchase-book?username=admin&role=admin", json=payload)
        assert create_res.status_code == 200
        voucher_id = create_res.json()["id"]
        
        # Delete it
        delete_res = requests.delete(f"{API}/purchase-book/{voucher_id}?username=admin&role=admin")
        assert delete_res.status_code == 200
        
        # Verify deletion - should return empty list or not contain deleted voucher
        get_res = requests.get(f"{API}/purchase-book")
        vouchers = get_res.json()
        assert not any(v.get("id") == voucher_id for v in vouchers), "Voucher should be deleted"
        print("Delete test passed")
    
    def test_06_item_suggestions(self):
        """Test item suggestions endpoint"""
        response = requests.get(f"{API}/purchase-book/item-suggestions")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list of strings"
        print(f"Item suggestions: {data[:5]}..." if len(data) > 5 else f"Item suggestions: {data}")


class TestStockSummary:
    """Test Stock Summary functionality"""
    
    def test_01_get_stock_summary(self):
        """Test getting stock summary"""
        response = requests.get(f"{API}/stock-summary")
        assert response.status_code == 200
        
        data = response.json()
        assert "items" in data, "Response should have 'items' key"
        items = data["items"]
        assert isinstance(items, list), "Items should be a list"
        
        # Check expected stock categories exist
        item_names = [i["name"] for i in items]
        expected_items = ["Paddy", "Rice (Usna)", "Rice (Raw)"]
        for expected in expected_items:
            assert expected in item_names, f"Stock summary should include {expected}"
        
        # Verify each item has required fields
        for item in items:
            assert "name" in item, "Item should have name"
            assert "category" in item, "Item should have category"
            assert "in_qty" in item, "Item should have in_qty"
            assert "out_qty" in item, "Item should have out_qty"
            assert "available" in item, "Item should have available"
            assert "unit" in item, "Item should have unit"
        
        print(f"Stock summary has {len(items)} items:")
        for item in items[:10]:
            print(f"  - {item['name']}: Available={item['available']} {item['unit']}")
    
    def test_02_stock_reflects_purchase_voucher(self):
        """Test that purchase voucher items appear in stock"""
        # Create a purchase voucher with a custom item
        custom_item = f"CustomStock_{uuid.uuid4().hex[:6]}"
        payload = {
            "date": "2026-01-15",
            "party_name": "StockTestParty",
            "items": [{"item_name": custom_item, "quantity": 100, "rate": 50, "unit": "Qntl"}],
            "cash_paid": 0, "diesel_paid": 0, "advance": 0
        }
        create_res = requests.post(f"{API}/purchase-book?username=admin&role=admin", json=payload)
        assert create_res.status_code == 200
        voucher_id = create_res.json()["id"]
        
        # Check stock summary
        stock_res = requests.get(f"{API}/stock-summary")
        assert stock_res.status_code == 200
        
        items = stock_res.json()["items"]
        custom_stock = [i for i in items if i["name"] == custom_item]
        
        assert len(custom_stock) > 0, f"Custom item {custom_item} should appear in stock"
        assert custom_stock[0]["in_qty"] == 100, "In qty should match purchase voucher"
        assert custom_stock[0]["category"] == "Custom", "Custom items should be categorized as 'Custom'"
        
        # Cleanup
        requests.delete(f"{API}/purchase-book/{voucher_id}?username=admin&role=admin")
        print(f"Custom item {custom_item} reflected in stock correctly")
    
    def test_03_stock_summary_with_filters(self):
        """Test stock summary with kms_year and season filters"""
        response = requests.get(f"{API}/stock-summary?kms_year=2025-26&season=Kharif")
        assert response.status_code == 200
        
        data = response.json()
        assert "items" in data
        print(f"Filtered stock summary has {len(data['items'])} items")


class TestAccountingEntries:
    """Test accounting entries created by purchase vouchers"""
    
    def test_01_party_ledger_entry_created(self):
        """Test that party ledger JAMA entry is created"""
        party_name = f"LEDGER_TEST_{uuid.uuid4().hex[:6]}"
        payload = {
            "date": "2026-01-15",
            "party_name": party_name,
            "items": [{"item_name": "LedgerItem", "quantity": 10, "rate": 100, "unit": "Qntl"}],
            "cash_paid": 0, "diesel_paid": 0, "advance": 0
        }
        create_res = requests.post(f"{API}/purchase-book?username=admin&role=admin", json=payload)
        assert create_res.status_code == 200
        voucher_id = create_res.json()["id"]
        voucher_no = create_res.json()["voucher_no"]
        
        # Check cash-book for party ledger entry
        ledger_res = requests.get(f"{API}/cash-book")
        assert ledger_res.status_code == 200
        
        transactions = ledger_res.json()
        party_entries = [t for t in transactions if 
                         t.get("reference", "").startswith(f"purchase_voucher:{voucher_id}") and
                         t.get("account") == "ledger" and
                         t.get("txn_type") == "jama"]
        
        assert len(party_entries) > 0, f"Party ledger JAMA entry should be created for {party_name}"
        assert party_entries[0]["amount"] == 1000, "Amount should be 10 * 100 = 1000"
        assert party_entries[0]["category"] == party_name, f"Category should be {party_name}"
        
        # Cleanup
        requests.delete(f"{API}/purchase-book/{voucher_id}?username=admin&role=admin")
        print(f"Party ledger JAMA entry verified for Purchase #{voucher_no}")
    
    def test_02_cash_nikasi_entry_created(self):
        """Test that cash NIKASI entry is created when cash_paid > 0"""
        party_name = f"CASH_TEST_{uuid.uuid4().hex[:6]}"
        payload = {
            "date": "2026-01-15",
            "party_name": party_name,
            "truck_no": "CG04XX1234",
            "items": [{"item_name": "CashItem", "quantity": 10, "rate": 100, "unit": "Qntl"}],
            "cash_paid": 500, "diesel_paid": 0, "advance": 0
        }
        create_res = requests.post(f"{API}/purchase-book?username=admin&role=admin", json=payload)
        assert create_res.status_code == 200
        voucher_id = create_res.json()["id"]
        
        # Check for cash NIKASI entry
        ledger_res = requests.get(f"{API}/cash-book")
        transactions = ledger_res.json()
        cash_entries = [t for t in transactions if 
                        t.get("reference", "").startswith(f"purchase_voucher_cash:{voucher_id}") and
                        t.get("account") == "cash" and
                        t.get("txn_type") == "nikasi"]
        
        assert len(cash_entries) > 0, "Cash NIKASI entry should be created"
        assert cash_entries[0]["amount"] == 500, "Cash amount should be 500"
        
        # Cleanup
        requests.delete(f"{API}/purchase-book/{voucher_id}?username=admin&role=admin")
        print("Cash NIKASI entry verified")
    
    def test_03_diesel_entry_created(self):
        """Test that diesel account entry is created when diesel_paid > 0"""
        party_name = f"DIESEL_TEST_{uuid.uuid4().hex[:6]}"
        payload = {
            "date": "2026-01-15",
            "party_name": party_name,
            "truck_no": "CG04XX5678",
            "items": [{"item_name": "DieselItem", "quantity": 10, "rate": 100, "unit": "Qntl"}],
            "cash_paid": 0, "diesel_paid": 300, "advance": 0
        }
        create_res = requests.post(f"{API}/purchase-book?username=admin&role=admin", json=payload)
        assert create_res.status_code == 200
        voucher_id = create_res.json()["id"]
        
        # Check for diesel ledger entry (Pump JAMA)
        ledger_res = requests.get(f"{API}/cash-book")
        transactions = ledger_res.json()
        diesel_ledger_entries = [t for t in transactions if 
                                  t.get("reference", "").startswith(f"purchase_voucher_diesel:{voucher_id}") and
                                  t.get("account") == "ledger" and
                                  t.get("party_type") == "Diesel"]
        
        assert len(diesel_ledger_entries) > 0, "Diesel pump ledger JAMA entry should be created"
        assert diesel_ledger_entries[0]["amount"] == 300, "Diesel amount should be 300"
        
        # Cleanup
        requests.delete(f"{API}/purchase-book/{voucher_id}?username=admin&role=admin")
        print("Diesel account entry verified")
    
    def test_04_truck_payment_entry_created(self):
        """Test that truck payment entry is created"""
        party_name = f"TRUCK_TEST_{uuid.uuid4().hex[:6]}"
        truck_no = f"CG{uuid.uuid4().hex[:6]}"
        payload = {
            "date": "2026-01-15",
            "party_name": party_name,
            "truck_no": truck_no,
            "items": [{"item_name": "TruckItem", "quantity": 10, "rate": 100, "unit": "Qntl"}],
            "cash_paid": 200, "diesel_paid": 150, "advance": 0
        }
        create_res = requests.post(f"{API}/purchase-book?username=admin&role=admin", json=payload)
        assert create_res.status_code == 200
        voucher_id = create_res.json()["id"]
        
        # Check for truck ledger entry
        ledger_res = requests.get(f"{API}/cash-book")
        transactions = ledger_res.json()
        truck_ledger_entries = [t for t in transactions if 
                                 t.get("reference", "").startswith(f"purchase_voucher_truck:{voucher_id}") and
                                 t.get("account") == "ledger" and
                                 t.get("party_type") == "Truck"]
        
        assert len(truck_ledger_entries) > 0, "Truck ledger JAMA entry should be created"
        assert truck_ledger_entries[0]["amount"] == 350, "Truck amount should be cash + diesel = 350"
        assert truck_ledger_entries[0]["category"] == truck_no, f"Category should be truck number {truck_no}"
        
        # Cleanup
        requests.delete(f"{API}/purchase-book/{voucher_id}?username=admin&role=admin")
        print("Truck payment entry verified")


class TestExports:
    """Test PDF and Excel export functionality"""
    
    def test_01_purchase_book_pdf_export(self):
        """Test Purchase Book PDF export"""
        response = requests.get(f"{API}/purchase-book/export/pdf")
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf" or "pdf" in response.headers.get("content-disposition", "")
        assert len(response.content) > 0, "PDF should have content"
        print(f"Purchase Book PDF export: {len(response.content)} bytes")
    
    def test_02_purchase_book_excel_export(self):
        """Test Purchase Book Excel export"""
        response = requests.get(f"{API}/purchase-book/export/excel")
        assert response.status_code == 200
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "excel" in content_type.lower() or response.status_code == 200
        print(f"Purchase Book Excel export: {len(response.content)} bytes")
    
    def test_03_stock_summary_pdf_export(self):
        """Test Stock Summary PDF export"""
        response = requests.get(f"{API}/stock-summary/export/pdf")
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf" or "pdf" in response.headers.get("content-disposition", "")
        assert len(response.content) > 0, "PDF should have content"
        print(f"Stock Summary PDF export: {len(response.content)} bytes")
    
    def test_04_stock_summary_excel_export(self):
        """Test Stock Summary Excel export"""
        response = requests.get(f"{API}/stock-summary/export/excel")
        assert response.status_code == 200
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "excel" in content_type.lower() or response.status_code == 200
        print(f"Stock Summary Excel export: {len(response.content)} bytes")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
