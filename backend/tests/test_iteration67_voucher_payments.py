"""
Iteration 67 - Voucher Payment System Tests

Tests for:
1. POST /api/voucher-payment for sale/purchase/gunny vouchers
2. Sale voucher creation auto-creates local_party_accounts entries
3. Sale voucher deletion cleans up local_party_accounts entries
4. Purchase voucher creation auto-creates local_party_accounts entries
5. Gunny bag creation with CGST+SGST separate fields
6. GET /api/sale-book/invoice/{id} returns professional HTML invoice
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://voucher-export-1.preview.emergentagent.com')

# Test data prefix for cleanup
TEST_PREFIX = "TEST_ITR67_"


class TestVoucherPaymentSale:
    """Test voucher payment for sale vouchers"""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_ids = {"sale": [], "local_party": [], "cash_txn": []}
        yield
        # Cleanup after tests
        for sale_id in self.created_ids["sale"]:
            try:
                self.session.delete(f"{BASE_URL}/api/sale-book/{sale_id}?username=admin&role=admin")
            except:
                pass

    def test_sale_voucher_payment_creates_entries(self):
        """Test that payment for sale voucher creates cash + ledger + local_party entries"""
        # 1. Create a sale voucher
        sale_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "party_name": f"{TEST_PREFIX}Sale Party",
            "invoice_no": f"INV-{uuid.uuid4().hex[:6]}",
            "items": [{"item_name": "Rice (Usna)", "quantity": 10, "rate": 1000, "unit": "Qntl"}],
            "gst_type": "none",
            "advance": 0,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        create_resp = self.session.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=sale_data)
        assert create_resp.status_code == 200, f"Failed to create sale voucher: {create_resp.text}"
        voucher = create_resp.json()
        voucher_id = voucher.get("id")
        self.created_ids["sale"].append(voucher_id)

        assert voucher["total"] == 10000, f"Total should be 10000, got {voucher['total']}"
        assert voucher["balance"] == 10000, f"Balance should be 10000, got {voucher['balance']}"

        # 2. Make a payment
        payment_data = {
            "voucher_type": "sale",
            "voucher_id": voucher_id,
            "amount": 5000,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "notes": "Test payment",
            "username": "admin",
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        pay_resp = self.session.post(f"{BASE_URL}/api/voucher-payment", json=payment_data)
        assert pay_resp.status_code == 200, f"Failed to make payment: {pay_resp.text}"
        pay_result = pay_resp.json()
        assert pay_result["success"] == True
        assert pay_result["amount"] == 5000

        # 3. Verify sale voucher updated
        get_resp = self.session.get(f"{BASE_URL}/api/sale-book?kms_year=2025-2026")
        vouchers = get_resp.json()
        updated_voucher = next((v for v in vouchers if v["id"] == voucher_id), None)
        assert updated_voucher is not None, "Voucher not found after payment"
        assert updated_voucher["paid_amount"] == 5000, f"Paid amount should be 5000, got {updated_voucher['paid_amount']}"
        assert updated_voucher["balance"] == 5000, f"Balance should be 5000, got {updated_voucher['balance']}"
        print(f"Sale voucher payment test PASSED - voucher updated correctly")

    def test_sale_voucher_creates_local_party_entry(self):
        """Test that creating a sale voucher auto-creates local_party_accounts entry"""
        sale_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "party_name": f"{TEST_PREFIX}LocalParty Test",
            "invoice_no": f"LP-{uuid.uuid4().hex[:6]}",
            "items": [{"item_name": "Bran", "quantity": 5, "rate": 500, "unit": "Qntl"}],
            "gst_type": "none",
            "advance": 1000,  # Test advance payment entry
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        create_resp = self.session.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=sale_data)
        assert create_resp.status_code == 200, f"Failed to create sale voucher: {create_resp.text}"
        voucher = create_resp.json()
        voucher_id = voucher.get("id")
        self.created_ids["sale"].append(voucher_id)

        # Check local_party_accounts entries via transactions endpoint
        lp_resp = self.session.get(f"{BASE_URL}/api/local-party/transactions?kms_year=2025-2026")
        assert lp_resp.status_code == 200, f"Failed to get local party transactions: {lp_resp.text}"
        lp_entries = lp_resp.json()
        
        # Find entries for this party
        party_entries = [e for e in lp_entries if e.get("party_name") == f"{TEST_PREFIX}LocalParty Test"]
        
        # Should have at least 2 entries: debit (sale total) and payment (advance)
        debit_entry = next((e for e in party_entries if e.get("txn_type") == "debit" and f"sale_voucher:{voucher_id}" in (e.get("reference") or "")), None)
        advance_entry = next((e for e in party_entries if e.get("txn_type") == "payment" and "advance" in (e.get("source_type") or "").lower()), None)
        
        assert debit_entry is not None, f"Sale voucher debit entry not found in local_party_accounts. Entries: {party_entries}"
        assert debit_entry["amount"] == 2500, f"Debit amount should be 2500, got {debit_entry['amount']}"
        
        if sale_data["advance"] > 0:
            assert advance_entry is not None, f"Advance payment entry not found in local_party_accounts"
            assert advance_entry["amount"] == 1000, f"Advance amount should be 1000, got {advance_entry['amount']}"
        
        print("Sale voucher local_party_accounts entry test PASSED")

    def test_sale_voucher_delete_cleans_local_party(self):
        """Test that deleting a sale voucher cleans up local_party_accounts entries"""
        sale_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "party_name": f"{TEST_PREFIX}DeleteTest Party",
            "invoice_no": f"DT-{uuid.uuid4().hex[:6]}",
            "items": [{"item_name": "Rice (Raw)", "quantity": 3, "rate": 800, "unit": "Qntl"}],
            "gst_type": "none",
            "advance": 500,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        create_resp = self.session.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=sale_data)
        assert create_resp.status_code == 200
        voucher_id = create_resp.json().get("id")
        
        # Verify entries exist before delete
        lp_resp_before = self.session.get(f"{BASE_URL}/api/local-party/transactions?kms_year=2025-2026")
        lp_before = [e for e in lp_resp_before.json() if f"{TEST_PREFIX}DeleteTest Party" in (e.get("party_name") or "")]
        assert len(lp_before) >= 1, "Local party entries should exist before delete"
        
        # Delete the voucher
        del_resp = self.session.delete(f"{BASE_URL}/api/sale-book/{voucher_id}?username=admin&role=admin")
        assert del_resp.status_code == 200, f"Failed to delete sale voucher: {del_resp.text}"
        
        # Verify entries cleaned up
        lp_resp_after = self.session.get(f"{BASE_URL}/api/local-party/transactions?kms_year=2025-2026")
        lp_after = [e for e in lp_resp_after.json() if f"sale_voucher" in (e.get("reference") or "") and voucher_id in (e.get("reference") or "")]
        
        assert len(lp_after) == 0, f"Local party entries should be cleaned up after delete. Found: {len(lp_after)}"
        print("Sale voucher delete cleanup test PASSED")


class TestVoucherPaymentPurchase:
    """Test voucher payment for purchase vouchers"""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_ids = {"purchase": []}
        yield
        for purchase_id in self.created_ids["purchase"]:
            try:
                self.session.delete(f"{BASE_URL}/api/purchase-book/{purchase_id}?username=admin&role=admin")
            except:
                pass

    def test_purchase_voucher_payment(self):
        """Test payment for purchase voucher"""
        # Create purchase voucher
        purchase_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "party_name": f"{TEST_PREFIX}Purchase Supplier",
            "invoice_no": f"PV-{uuid.uuid4().hex[:6]}",
            "items": [{"item_name": "Paddy", "quantity": 20, "rate": 500, "unit": "Qntl"}],
            "gst_type": "none",
            "advance": 0,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        create_resp = self.session.post(f"{BASE_URL}/api/purchase-book?username=admin&role=admin", json=purchase_data)
        assert create_resp.status_code == 200, f"Failed to create purchase voucher: {create_resp.text}"
        voucher = create_resp.json()
        voucher_id = voucher.get("id")
        self.created_ids["purchase"].append(voucher_id)
        
        assert voucher["total"] == 10000, f"Total should be 10000, got {voucher['total']}"

        # Make payment
        payment_data = {
            "voucher_type": "purchase",
            "voucher_id": voucher_id,
            "amount": 3000,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "notes": "Test purchase payment",
            "username": "admin",
            "kms_year": "2025-2026"
        }
        pay_resp = self.session.post(f"{BASE_URL}/api/voucher-payment", json=payment_data)
        assert pay_resp.status_code == 200, f"Failed to make payment: {pay_resp.text}"
        pay_result = pay_resp.json()
        assert pay_result["success"] == True
        assert pay_result["amount"] == 3000

        # Verify voucher updated
        get_resp = self.session.get(f"{BASE_URL}/api/purchase-book?kms_year=2025-2026")
        vouchers = get_resp.json()
        updated = next((v for v in vouchers if v["id"] == voucher_id), None)
        assert updated is not None
        assert updated["paid_amount"] == 3000, f"Paid amount should be 3000, got {updated['paid_amount']}"
        assert updated["balance"] == 7000, f"Balance should be 7000, got {updated['balance']}"
        print("Purchase voucher payment test PASSED")

    def test_purchase_voucher_creates_local_party_entry(self):
        """Test that creating a purchase voucher auto-creates local_party_accounts entry"""
        purchase_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "party_name": f"{TEST_PREFIX}PurchaseLP Party",
            "invoice_no": f"PLP-{uuid.uuid4().hex[:6]}",
            "items": [{"item_name": "Broken", "quantity": 10, "rate": 300, "unit": "Qntl"}],
            "gst_type": "none",
            "advance": 500,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        create_resp = self.session.post(f"{BASE_URL}/api/purchase-book?username=admin&role=admin", json=purchase_data)
        assert create_resp.status_code == 200
        voucher = create_resp.json()
        voucher_id = voucher.get("id")
        self.created_ids["purchase"].append(voucher_id)

        # Check local_party_accounts via transactions endpoint
        lp_resp = self.session.get(f"{BASE_URL}/api/local-party/transactions?kms_year=2025-2026")
        lp_entries = lp_resp.json()
        party_entries = [e for e in lp_entries if e.get("party_name") == f"{TEST_PREFIX}PurchaseLP Party"]
        
        debit_entry = next((e for e in party_entries if e.get("txn_type") == "debit" and "purchase_voucher:" in (e.get("reference") or "")), None)
        assert debit_entry is not None, f"Purchase voucher debit entry not found. Entries: {party_entries}"
        assert debit_entry["amount"] == 3000, f"Debit amount should be 3000, got {debit_entry['amount']}"
        print("Purchase voucher local_party_accounts entry test PASSED")


class TestVoucherPaymentGunny:
    """Test voucher payment for gunny bag purchases"""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_ids = {"gunny": []}
        yield
        for gunny_id in self.created_ids["gunny"]:
            try:
                self.session.delete(f"{BASE_URL}/api/gunny-bags/{gunny_id}")
            except:
                pass

    def test_gunny_bag_payment(self):
        """Test payment for gunny bag purchase"""
        # Create gunny bag entry with amount
        gunny_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "bag_type": "old",
            "txn_type": "in",
            "quantity": 100,
            "party_name": f"{TEST_PREFIX}Gunny Supplier",
            "rate": 50,
            "gst_type": "none",
            "advance": 0,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        create_resp = self.session.post(f"{BASE_URL}/api/gunny-bags?username=admin", json=gunny_data)
        assert create_resp.status_code == 200, f"Failed to create gunny bag entry: {create_resp.text}"
        gunny = create_resp.json()
        gunny_id = gunny.get("id")
        self.created_ids["gunny"].append(gunny_id)
        
        # Total should be 100 * 50 = 5000
        assert gunny["total"] == 5000, f"Total should be 5000, got {gunny['total']}"

        # Make payment
        payment_data = {
            "voucher_type": "gunny",
            "voucher_id": gunny_id,
            "amount": 2000,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "notes": "Gunny bag payment",
            "username": "admin",
            "kms_year": "2025-2026"
        }
        pay_resp = self.session.post(f"{BASE_URL}/api/voucher-payment", json=payment_data)
        assert pay_resp.status_code == 200, f"Failed to make payment: {pay_resp.text}"
        pay_result = pay_resp.json()
        assert pay_result["success"] == True
        assert pay_result["amount"] == 2000

        # Verify advance updated
        get_resp = self.session.get(f"{BASE_URL}/api/gunny-bags?kms_year=2025-2026")
        entries = get_resp.json()
        updated = next((e for e in entries if e["id"] == gunny_id), None)
        assert updated is not None
        assert updated["advance"] == 2000, f"Advance should be 2000, got {updated['advance']}"
        print("Gunny bag payment test PASSED")

    def test_gunny_bag_cgst_sgst_separate(self):
        """Test gunny bag with separate CGST and SGST fields"""
        gunny_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "bag_type": "old",
            "txn_type": "in",
            "quantity": 100,
            "party_name": f"{TEST_PREFIX}GST Gunny Supplier",
            "rate": 100,
            "gst_type": "cgst_sgst",
            "cgst_percent": 9,
            "sgst_percent": 9,
            "advance": 0,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        create_resp = self.session.post(f"{BASE_URL}/api/gunny-bags?username=admin", json=gunny_data)
        assert create_resp.status_code == 200, f"Failed to create gunny bag: {create_resp.text}"
        gunny = create_resp.json()
        gunny_id = gunny.get("id")
        self.created_ids["gunny"].append(gunny_id)
        
        # Subtotal = 100 * 100 = 10000
        # CGST = 10000 * 9% = 900
        # SGST = 10000 * 9% = 900
        # Total = 10000 + 900 + 900 = 11800
        assert gunny["subtotal"] == 10000, f"Subtotal should be 10000, got {gunny['subtotal']}"
        assert gunny["cgst_amount"] == 900, f"CGST amount should be 900, got {gunny.get('cgst_amount')}"
        assert gunny["sgst_amount"] == 900, f"SGST amount should be 900, got {gunny.get('sgst_amount')}"
        assert gunny["total"] == 11800, f"Total should be 11800, got {gunny['total']}"
        print("Gunny bag CGST+SGST test PASSED")

    def test_gunny_creates_local_party_entry(self):
        """Test that creating a gunny bag purchase creates local_party_accounts entry"""
        gunny_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "bag_type": "old",
            "txn_type": "in",
            "quantity": 50,
            "party_name": f"{TEST_PREFIX}GunnyLP Party",
            "rate": 60,
            "gst_type": "none",
            "advance": 1000,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        create_resp = self.session.post(f"{BASE_URL}/api/gunny-bags?username=admin", json=gunny_data)
        assert create_resp.status_code == 200
        gunny = create_resp.json()
        gunny_id = gunny.get("id")
        self.created_ids["gunny"].append(gunny_id)

        # Check local_party_accounts via transactions endpoint
        lp_resp = self.session.get(f"{BASE_URL}/api/local-party/transactions?kms_year=2025-2026")
        lp_entries = lp_resp.json()
        party_entries = [e for e in lp_entries if e.get("party_name") == f"{TEST_PREFIX}GunnyLP Party"]
        
        debit_entry = next((e for e in party_entries if e.get("txn_type") == "debit" and "gunny_purchase:" in (e.get("reference") or "")), None)
        assert debit_entry is not None, f"Gunny bag debit entry not found. Entries: {party_entries}"
        assert debit_entry["amount"] == 3000, f"Debit amount should be 3000 (50*60), got {debit_entry['amount']}"
        
        advance_entry = next((e for e in party_entries if e.get("txn_type") == "payment" and "gunny" in (e.get("source_type") or "").lower()), None)
        assert advance_entry is not None, "Gunny bag advance payment entry not found"
        assert advance_entry["amount"] == 1000, f"Advance should be 1000, got {advance_entry['amount']}"
        print("Gunny bag local_party_accounts entry test PASSED")


class TestSaleInvoice:
    """Test sale invoice HTML generation"""

    def test_sale_invoice_returns_html(self):
        """Test GET /api/sale-book/invoice/{id} returns HTML"""
        session = requests.Session()
        
        # Use existing sale voucher
        existing_voucher_id = "8eab781a-f2e7-41e2-998a-14c5d3b8d050"
        
        resp = session.get(f"{BASE_URL}/api/sale-book/invoice/{existing_voucher_id}")
        assert resp.status_code == 200, f"Failed to get invoice: {resp.text}"
        assert "text/html" in resp.headers.get("content-type", ""), "Response should be HTML"
        
        html = resp.text
        # Verify it contains key invoice elements
        assert "TAX INVOICE" in html or "बिक्री बिल" in html, "Invoice should contain title"
        assert "Rajan Sales" in html, "Invoice should contain party name"
        assert "GRAND TOTAL" in html or "Grand Total" in html, "Invoice should contain total"
        print("Sale invoice HTML test PASSED")

    def test_sale_invoice_not_found(self):
        """Test invoice for non-existent voucher returns 404"""
        session = requests.Session()
        resp = session.get(f"{BASE_URL}/api/sale-book/invoice/non-existent-id-12345")
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("Sale invoice 404 test PASSED")


class TestCashBookEntries:
    """Test that payments create proper cash book entries"""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_ids = {"sale": []}
        yield
        for sale_id in self.created_ids["sale"]:
            try:
                self.session.delete(f"{BASE_URL}/api/sale-book/{sale_id}?username=admin&role=admin")
            except:
                pass

    def test_sale_payment_creates_cash_jama(self):
        """Test that sale voucher payment creates Cash JAMA entry"""
        # Create sale voucher
        sale_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "party_name": f"{TEST_PREFIX}CashBook Test",
            "items": [{"item_name": "Rice (Usna)", "quantity": 5, "rate": 1000}],
            "gst_type": "none",
            "advance": 0,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        create_resp = self.session.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=sale_data)
        assert create_resp.status_code == 200
        voucher = create_resp.json()
        voucher_id = voucher.get("id")
        self.created_ids["sale"].append(voucher_id)

        # Make payment
        payment_data = {
            "voucher_type": "sale",
            "voucher_id": voucher_id,
            "amount": 2000,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "notes": "Cash book test",
            "username": "admin"
        }
        pay_resp = self.session.post(f"{BASE_URL}/api/voucher-payment", json=payment_data)
        assert pay_resp.status_code == 200

        # Check cash book - should have JAMA entry for sale payment
        cb_resp = self.session.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        assert cb_resp.status_code == 200
        cb_entries = cb_resp.json()
        
        # Find cash JAMA entry for this payment
        cash_entry = next((e for e in cb_entries if 
            e.get("account") == "cash" and 
            e.get("txn_type") == "jama" and 
            "voucher_payment:" in (e.get("reference") or "") and
            f"{TEST_PREFIX}CashBook Test" in (e.get("category") or "")), None)
        
        assert cash_entry is not None, f"Cash JAMA entry not found for sale payment"
        assert cash_entry["amount"] == 2000, f"Cash entry amount should be 2000, got {cash_entry['amount']}"
        print("Sale payment cash book JAMA test PASSED")


class TestPaymentValidation:
    """Test payment validation"""

    def test_payment_invalid_voucher_type(self):
        """Test payment with invalid voucher type"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        payment_data = {
            "voucher_type": "invalid_type",
            "voucher_id": "some-id",
            "amount": 1000,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "username": "admin"
        }
        resp = session.post(f"{BASE_URL}/api/voucher-payment", json=payment_data)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        print("Invalid voucher type validation test PASSED")

    def test_payment_missing_voucher_id(self):
        """Test payment with missing voucher ID"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        payment_data = {
            "voucher_type": "sale",
            "voucher_id": "",
            "amount": 1000,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "username": "admin"
        }
        resp = session.post(f"{BASE_URL}/api/voucher-payment", json=payment_data)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        print("Missing voucher ID validation test PASSED")

    def test_payment_zero_amount(self):
        """Test payment with zero amount"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        payment_data = {
            "voucher_type": "sale",
            "voucher_id": "8eab781a-f2e7-41e2-998a-14c5d3b8d050",
            "amount": 0,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "username": "admin"
        }
        resp = session.post(f"{BASE_URL}/api/voucher-payment", json=payment_data)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        print("Zero amount validation test PASSED")

    def test_payment_voucher_not_found(self):
        """Test payment for non-existent voucher"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        payment_data = {
            "voucher_type": "sale",
            "voucher_id": "non-existent-voucher-id",
            "amount": 1000,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "username": "admin"
        }
        resp = session.post(f"{BASE_URL}/api/voucher-payment", json=payment_data)
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("Voucher not found validation test PASSED")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
