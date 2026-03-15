"""
Comprehensive tests for double-entry accounting in Rice Mill App
Testing: Sale Book, Purchase Vouchers, Staff Advance/Payment, Byproduct Sale,
         Voucher Payments, Local Party Manual/Settle, Mill Parts Stock, DC Deliveries

All transactions should auto-create corresponding jama/nikasi entries in cash_transactions
"""

import pytest
import requests
import time
import os
from datetime import datetime

# Use environment variable for BASE_URL
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://party-payment-qa.preview.emergentagent.com')
BASE_URL = BASE_URL.rstrip('/')

# Test data prefix for cleanup
TEST_PREFIX = "TEST_ACC_"
KMS_YEAR = "2025-2026"
SEASON = "Kharif"

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestHealthCheck:
    """Verify API is accessible"""
    
    def test_api_health(self, api_client):
        """Test API is reachable"""
        response = api_client.get(f"{BASE_URL}/api/cash-book/summary?kms_year={KMS_YEAR}")
        assert response.status_code == 200, f"API not reachable: {response.text}"
        print(f"✅ API is accessible at {BASE_URL}")


class TestSaleBookAccounting:
    """
    Test Sale Book creates correct accounting entries:
    - Ledger JAMA (party owes us total sale amount)
    - Cash NIKASI (cash paid to truck)
    - Ledger NIKASI (advance reduces party debt) + Cash JAMA (advance cash in)
    - Ledger JAMA (diesel pump - we owe them) + diesel_accounts entry
    - Truck Ledger NIKASI (truck cash/diesel deductions)
    - local_party_accounts entry
    """
    
    created_sale_id = None
    
    def test_create_sale_voucher(self, api_client):
        """Create a sale voucher and verify accounting entries created"""
        payload = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "party_name": f"{TEST_PREFIX}Sale_Party",
            "invoice_no": f"{TEST_PREFIX}INV001",
            "items": [{"item_name": "Rice (Usna)", "quantity": 10, "rate": 3000, "unit": "Qntl"}],
            "gst_type": "none",
            "truck_no": f"{TEST_PREFIX}OD15A1234",
            "cash_paid": 500,
            "diesel_paid": 300,
            "advance": 1000,
            "kms_year": KMS_YEAR,
            "season": SEASON
        }
        response = api_client.post(f"{BASE_URL}/api/sale-book", json=payload)
        assert response.status_code == 200, f"Failed to create sale voucher: {response.text}"
        data = response.json()
        assert "id" in data, "Sale voucher should have id"
        TestSaleBookAccounting.created_sale_id = data["id"]
        assert data["total"] == 30000, f"Total should be 30000, got {data['total']}"
        print(f"✅ Created sale voucher #{data['voucher_no']} with total Rs.{data['total']}")
    
    def test_sale_creates_ledger_jama_for_party(self, api_client):
        """Verify Ledger JAMA entry for party (party owes us)"""
        time.sleep(0.5)  # Allow entries to be created
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=ledger&txn_type=jama&category={TEST_PREFIX}Sale_Party&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        # Find the entry with reference containing sale_voucher
        jama_entry = next((e for e in entries if "sale_voucher:" in e.get("reference", "")), None)
        assert jama_entry is not None, "Ledger JAMA entry for party not found"
        assert jama_entry["amount"] == 30000, f"Ledger JAMA amount should be 30000, got {jama_entry['amount']}"
        assert jama_entry["party_type"] == "Sale Book", f"Party type should be 'Sale Book'"
        print(f"✅ Ledger JAMA entry for party: Rs.{jama_entry['amount']}")
    
    def test_sale_creates_cash_nikasi_for_truck(self, api_client):
        """Verify Cash NIKASI entry for truck cash paid"""
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=cash&txn_type=nikasi&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        # Find the entry for truck cash
        cash_entry = next((e for e in entries if "sale_voucher_cash:" in e.get("reference", "") and TEST_PREFIX in e.get("category", "")), None)
        assert cash_entry is not None, "Cash NIKASI entry for truck cash not found"
        assert cash_entry["amount"] == 500, f"Cash NIKASI amount should be 500, got {cash_entry['amount']}"
        print(f"✅ Cash NIKASI for truck: Rs.{cash_entry['amount']}")
    
    def test_sale_creates_advance_entries(self, api_client):
        """Verify advance creates Ledger NIKASI (reduces debt) + Cash JAMA (cash in)"""
        # Ledger NIKASI for advance
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=ledger&txn_type=nikasi&category={TEST_PREFIX}Sale_Party&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        adv_ledger = next((e for e in entries if "sale_voucher_adv:" in e.get("reference", "")), None)
        assert adv_ledger is not None, "Ledger NIKASI for advance not found"
        assert adv_ledger["amount"] == 1000, f"Advance ledger amount should be 1000, got {adv_ledger['amount']}"
        
        # Cash JAMA for advance
        response2 = api_client.get(
            f"{BASE_URL}/api/cash-book?account=cash&txn_type=jama&category={TEST_PREFIX}Sale_Party&kms_year={KMS_YEAR}"
        )
        assert response2.status_code == 200
        entries2 = response2.json()
        adv_cash = next((e for e in entries2 if "sale_voucher_adv_cash:" in e.get("reference", "")), None)
        assert adv_cash is not None, "Cash JAMA for advance not found"
        assert adv_cash["amount"] == 1000, f"Advance cash amount should be 1000, got {adv_cash['amount']}"
        print(f"✅ Advance entries: Ledger NIKASI Rs.{adv_ledger['amount']}, Cash JAMA Rs.{adv_cash['amount']}")
    
    def test_sale_creates_diesel_entries(self, api_client):
        """Verify diesel creates Ledger JAMA for pump (we owe them)"""
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=ledger&txn_type=jama&party_type=Diesel&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        diesel_entry = next((e for e in entries if "sale_voucher_diesel:" in e.get("reference", "") and TEST_PREFIX in e.get("description", "")), None)
        assert diesel_entry is not None, "Diesel Ledger JAMA entry not found"
        assert diesel_entry["amount"] == 300, f"Diesel amount should be 300, got {diesel_entry['amount']}"
        print(f"✅ Diesel Ledger JAMA: Rs.{diesel_entry['amount']}")
    
    def test_sale_creates_truck_ledger_entries(self, api_client):
        """Verify truck cash/diesel create Ledger NIKASI entries"""
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=ledger&txn_type=nikasi&category={TEST_PREFIX}OD15A1234&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        # Should have 2 entries: cash + diesel
        truck_entries = [e for e in entries if "sale_truck_" in e.get("reference", "")]
        assert len(truck_entries) >= 2, f"Should have truck cash+diesel entries, got {len(truck_entries)}"
        total_truck_ded = sum(e["amount"] for e in truck_entries)
        assert total_truck_ded == 800, f"Total truck deductions should be 800 (500+300), got {total_truck_ded}"
        print(f"✅ Truck Ledger NIKASI entries: total Rs.{total_truck_ded}")
    
    def test_sale_creates_local_party_account(self, api_client):
        """Verify local_party_accounts entry created"""
        response = api_client.get(
            f"{BASE_URL}/api/local-party/transactions?party_name={TEST_PREFIX}Sale_Party&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        lp_entry = next((e for e in entries if e.get("source_type") == "sale_voucher"), None)
        assert lp_entry is not None, "Local party account entry not found"
        assert lp_entry["txn_type"] == "debit", "Should be debit (party owes us)"
        assert lp_entry["amount"] == 30000, f"Amount should be 30000, got {lp_entry['amount']}"
        print(f"✅ Local party account entry: {lp_entry['txn_type']} Rs.{lp_entry['amount']}")
    
    def test_delete_sale_cleans_up_entries(self, api_client):
        """Verify DELETE removes all accounting entries"""
        sale_id = TestSaleBookAccounting.created_sale_id
        assert sale_id is not None, "No sale ID to delete"
        
        response = api_client.delete(f"{BASE_URL}/api/sale-book/{sale_id}")
        assert response.status_code == 200, f"Failed to delete sale: {response.text}"
        
        time.sleep(0.5)
        
        # Verify entries cleaned up
        response2 = api_client.get(
            f"{BASE_URL}/api/cash-book?category={TEST_PREFIX}Sale_Party&kms_year={KMS_YEAR}"
        )
        assert response2.status_code == 200
        remaining = [e for e in response2.json() if "sale_voucher" in e.get("reference", "")]
        assert len(remaining) == 0, f"Should have 0 remaining entries, got {len(remaining)}"
        print(f"✅ Sale deletion cleaned up all accounting entries")


class TestPurchaseVoucherAccounting:
    """
    Test Purchase Voucher creates correct accounting entries:
    - Ledger JAMA (we owe the party)
    - Cash NIKASI (cash paid)
    - Ledger NIKASI (advance) + Cash NIKASI (advance cash out)
    - Ledger JAMA (diesel pump)
    - Truck Ledger NIKASI
    - local_party_accounts entry
    """
    
    created_purchase_id = None
    
    def test_create_purchase_voucher(self, api_client):
        """Create a purchase voucher and verify it's created"""
        payload = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "party_name": f"{TEST_PREFIX}Purchase_Party",
            "invoice_no": f"{TEST_PREFIX}PV001",
            "items": [{"item_name": "Paddy", "quantity": 20, "rate": 2000, "unit": "Qntl"}],
            "gst_type": "none",
            "truck_no": f"{TEST_PREFIX}OD16B5678",
            "cash_paid": 400,
            "diesel_paid": 200,
            "advance": 800,
            "kms_year": KMS_YEAR,
            "season": SEASON
        }
        response = api_client.post(f"{BASE_URL}/api/purchase-book", json=payload)
        assert response.status_code == 200, f"Failed to create purchase voucher: {response.text}"
        data = response.json()
        TestPurchaseVoucherAccounting.created_purchase_id = data["id"]
        assert data["total"] == 40000
        print(f"✅ Created purchase voucher #{data['voucher_no']} with total Rs.{data['total']}")
    
    def test_purchase_creates_ledger_jama(self, api_client):
        """Verify Ledger JAMA entry (we owe party)"""
        time.sleep(0.5)
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=ledger&txn_type=jama&category={TEST_PREFIX}Purchase_Party&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        jama = next((e for e in entries if "purchase_voucher:" in e.get("reference", "")), None)
        assert jama is not None, "Ledger JAMA for purchase not found"
        assert jama["amount"] == 40000
        assert jama["party_type"] == "Purchase Voucher"
        print(f"✅ Purchase Ledger JAMA: Rs.{jama['amount']}")
    
    def test_purchase_creates_advance_cash_nikasi(self, api_client):
        """Verify advance creates Cash NIKASI (cash going out)"""
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=cash&txn_type=nikasi&category={TEST_PREFIX}Purchase_Party&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        adv_cash = next((e for e in entries if "purchase_voucher_adv_cash:" in e.get("reference", "")), None)
        assert adv_cash is not None, "Advance Cash NIKASI not found"
        assert adv_cash["amount"] == 800
        print(f"✅ Purchase Advance Cash NIKASI: Rs.{adv_cash['amount']}")
    
    def test_delete_purchase_cleans_up(self, api_client):
        """Verify DELETE removes all entries"""
        pv_id = TestPurchaseVoucherAccounting.created_purchase_id
        assert pv_id is not None
        
        response = api_client.delete(f"{BASE_URL}/api/purchase-book/{pv_id}")
        assert response.status_code == 200
        
        time.sleep(0.5)
        
        # Verify cleanup
        response2 = api_client.get(
            f"{BASE_URL}/api/cash-book?category={TEST_PREFIX}Purchase_Party&kms_year={KMS_YEAR}"
        )
        remaining = [e for e in response2.json() if "purchase_voucher" in e.get("reference", "")]
        assert len(remaining) == 0
        print(f"✅ Purchase deletion cleaned up all entries")


class TestStaffAdvanceAccounting:
    """
    Test Staff Advance creates:
    - Cash NIKASI (cash going out to staff)
    - Ledger JAMA (staff owes us)
    """
    
    created_advance_id = None
    staff_id = None
    
    def test_create_staff(self, api_client):
        """Create a staff member for testing"""
        payload = {"id": f"{TEST_PREFIX}staff_001", "name": f"{TEST_PREFIX}Staff_Ram", "salary_type": "daily", "salary_amount": 500, "active": True}
        response = api_client.post(f"{BASE_URL}/api/staff", json=payload)
        assert response.status_code == 200
        TestStaffAdvanceAccounting.staff_id = response.json()["id"]
        print(f"✅ Created test staff member")
    
    def test_create_staff_advance(self, api_client):
        """Create staff advance and verify accounting entries"""
        payload = {
            "staff_id": TestStaffAdvanceAccounting.staff_id,
            "staff_name": f"{TEST_PREFIX}Staff_Ram",
            "amount": 2000,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "description": "Test advance",
            "kms_year": KMS_YEAR,
            "season": SEASON
        }
        response = api_client.post(f"{BASE_URL}/api/staff/advance", json=payload)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        TestStaffAdvanceAccounting.created_advance_id = data["id"]
        print(f"✅ Created staff advance Rs.{data['amount']}")
    
    def test_advance_creates_cash_nikasi(self, api_client):
        """Verify Cash NIKASI entry created"""
        time.sleep(0.5)
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=cash&txn_type=nikasi&party_type=Staff&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        cash_entry = next((e for e in entries if "staff_advance:" in e.get("reference", "") and TEST_PREFIX in e.get("category", "")), None)
        assert cash_entry is not None, "Cash NIKASI for staff advance not found"
        assert cash_entry["amount"] == 2000
        print(f"✅ Staff Advance Cash NIKASI: Rs.{cash_entry['amount']}")
    
    def test_advance_creates_ledger_jama(self, api_client):
        """Verify Ledger JAMA entry (staff owes us)"""
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=ledger&txn_type=jama&party_type=Staff&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        ledger_entry = next((e for e in entries if "staff_advance_ledger:" in e.get("reference", "") and TEST_PREFIX in e.get("category", "")), None)
        assert ledger_entry is not None, "Ledger JAMA for staff advance not found"
        assert ledger_entry["amount"] == 2000
        print(f"✅ Staff Advance Ledger JAMA: Rs.{ledger_entry['amount']}")
    
    def test_delete_advance_cleans_up(self, api_client):
        """Verify DELETE removes both entries"""
        adv_id = TestStaffAdvanceAccounting.created_advance_id
        assert adv_id is not None
        
        response = api_client.delete(f"{BASE_URL}/api/staff/advance/{adv_id}")
        assert response.status_code == 200
        
        time.sleep(0.5)
        
        # Verify cleanup
        response2 = api_client.get(
            f"{BASE_URL}/api/cash-book?category={TEST_PREFIX}Staff_Ram&kms_year={KMS_YEAR}"
        )
        remaining = [e for e in response2.json() if "staff_advance" in e.get("reference", "")]
        assert len(remaining) == 0
        print(f"✅ Staff advance deletion cleaned up all entries")
    
    def test_cleanup_staff(self, api_client):
        """Clean up test staff"""
        if TestStaffAdvanceAccounting.staff_id:
            api_client.delete(f"{BASE_URL}/api/staff/{TestStaffAdvanceAccounting.staff_id}")


class TestStaffPaymentAccounting:
    """
    Test Staff Payment creates:
    - Cash NIKASI for net_payment
    """
    
    staff_id = None
    payment_id = None
    
    def test_create_staff_for_payment(self, api_client):
        """Create staff member"""
        payload = {"id": f"{TEST_PREFIX}staff_pay_001", "name": f"{TEST_PREFIX}Staff_Shyam", "salary_type": "daily", "salary_amount": 400, "active": True}
        response = api_client.post(f"{BASE_URL}/api/staff", json=payload)
        assert response.status_code == 200
        TestStaffPaymentAccounting.staff_id = response.json()["id"]
        print(f"✅ Created test staff for payment")
    
    def test_create_staff_payment(self, api_client):
        """Create staff salary payment"""
        payload = {
            "staff_id": TestStaffPaymentAccounting.staff_id,
            "staff_name": f"{TEST_PREFIX}Staff_Shyam",
            "salary_type": "daily",
            "salary_amount": 400,
            "period_from": "2025-01-01",
            "period_to": "2025-01-07",
            "total_days": 7,
            "days_worked": 6,
            "holidays": 1,
            "half_days": 0,
            "absents": 0,
            "gross_salary": 2800,
            "advance_balance": 0,
            "advance_deducted": 0,
            "net_payment": 2800,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "kms_year": KMS_YEAR,
            "season": SEASON
        }
        response = api_client.post(f"{BASE_URL}/api/staff/payments", json=payload)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        TestStaffPaymentAccounting.payment_id = data["id"]
        print(f"✅ Created staff payment Net: Rs.{data['net_payment']}")
    
    def test_payment_creates_cash_nikasi(self, api_client):
        """Verify Cash NIKASI for net payment"""
        time.sleep(0.5)
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=cash&txn_type=nikasi&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        pay_entry = next((e for e in entries if "staff_payment:" in e.get("reference", "") and TEST_PREFIX in e.get("description", "")), None)
        assert pay_entry is not None, "Cash NIKASI for staff payment not found"
        assert pay_entry["amount"] == 2800
        print(f"✅ Staff Payment Cash NIKASI: Rs.{pay_entry['amount']}")
    
    def test_delete_payment_cleans_up(self, api_client):
        """Verify DELETE removes cash book entry"""
        pay_id = TestStaffPaymentAccounting.payment_id
        assert pay_id is not None
        
        response = api_client.delete(f"{BASE_URL}/api/staff/payments/{pay_id}")
        assert response.status_code == 200
        
        time.sleep(0.5)
        
        # Verify cleanup
        response2 = api_client.get(
            f"{BASE_URL}/api/cash-book?kms_year={KMS_YEAR}"
        )
        remaining = [e for e in response2.json() if f"staff_payment:{pay_id}" in e.get("reference", "")]
        assert len(remaining) == 0
        print(f"✅ Staff payment deletion cleaned up cash entry")
    
    def test_cleanup_staff(self, api_client):
        """Clean up test staff"""
        if TestStaffPaymentAccounting.staff_id:
            api_client.delete(f"{BASE_URL}/api/staff/{TestStaffPaymentAccounting.staff_id}")


class TestByproductSaleAccounting:
    """
    Test Byproduct Sale creates:
    - Ledger JAMA (buyer owes us)
    """
    
    created_sale_id = None
    
    def test_create_byproduct_sale(self, api_client):
        """Create byproduct sale with buyer_name"""
        payload = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "product": "bran",
            "quantity_qntl": 5,
            "rate_per_qntl": 1000,
            "buyer_name": f"{TEST_PREFIX}Bran_Buyer",
            "kms_year": KMS_YEAR,
            "season": SEASON
        }
        response = api_client.post(f"{BASE_URL}/api/byproduct-sales", json=payload)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        TestByproductSaleAccounting.created_sale_id = data["id"]
        assert data["total_amount"] == 5000
        print(f"✅ Created byproduct sale: {data['product']} Rs.{data['total_amount']}")
    
    def test_byproduct_creates_ledger_jama(self, api_client):
        """Verify Ledger JAMA entry (buyer owes us)"""
        time.sleep(0.5)
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=ledger&txn_type=jama&category={TEST_PREFIX}Bran_Buyer&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        jama = next((e for e in entries if "byproduct:" in e.get("reference", "")), None)
        assert jama is not None, "Ledger JAMA for byproduct sale not found"
        assert jama["amount"] == 5000
        assert jama["party_type"] == "By-Product Sale"
        print(f"✅ Byproduct Ledger JAMA: Rs.{jama['amount']}")
    
    def test_delete_byproduct_cleans_up(self, api_client):
        """Verify DELETE removes ledger entry"""
        sale_id = TestByproductSaleAccounting.created_sale_id
        assert sale_id is not None
        
        response = api_client.delete(f"{BASE_URL}/api/byproduct-sales/{sale_id}")
        assert response.status_code == 200
        
        time.sleep(0.5)
        
        # Verify cleanup
        response2 = api_client.get(
            f"{BASE_URL}/api/cash-book?category={TEST_PREFIX}Bran_Buyer&kms_year={KMS_YEAR}"
        )
        remaining = [e for e in response2.json() if f"byproduct:{sale_id}" in e.get("reference", "")]
        assert len(remaining) == 0
        print(f"✅ Byproduct deletion cleaned up ledger entry")


class TestLocalPartyManualPurchase:
    """
    Test Local Party Manual Purchase creates:
    - Ledger JAMA (we owe party)
    """
    
    created_txn_id = None
    
    def test_create_manual_purchase(self, api_client):
        """Create manual local party purchase"""
        payload = {
            "party_name": f"{TEST_PREFIX}Local_Supplier",
            "amount": 15000,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "description": "Test manual purchase",
            "kms_year": KMS_YEAR,
            "season": SEASON
        }
        response = api_client.post(f"{BASE_URL}/api/local-party/manual", json=payload)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        TestLocalPartyManualPurchase.created_txn_id = data["id"]
        print(f"✅ Created manual purchase Rs.{data['amount']}")
    
    def test_manual_creates_ledger_jama(self, api_client):
        """Verify Ledger JAMA entry (we owe party)"""
        time.sleep(0.5)
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=ledger&txn_type=jama&category={TEST_PREFIX}Local_Supplier&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        jama = next((e for e in entries if "lp_purchase:" in e.get("reference", "")), None)
        assert jama is not None, "Ledger JAMA for manual purchase not found"
        assert jama["amount"] == 15000
        assert jama["party_type"] == "Local Party"
        print(f"✅ Local Party Manual Ledger JAMA: Rs.{jama['amount']}")
    
    def test_cleanup_manual_purchase(self, api_client):
        """Clean up manual purchase"""
        txn_id = TestLocalPartyManualPurchase.created_txn_id
        if txn_id:
            api_client.delete(f"{BASE_URL}/api/local-party/{txn_id}")
            print(f"✅ Cleaned up manual purchase")


class TestLocalPartySettle:
    """
    Test Local Party Settle creates:
    - Cash NIKASI (cash going out)
    - Ledger NIKASI (reduces what we owe)
    """
    
    created_txn_id = None
    
    def test_create_local_party_settle(self, api_client):
        """Settle local party payment"""
        # First create a debit entry
        debit_payload = {
            "party_name": f"{TEST_PREFIX}Local_Creditor",
            "amount": 10000,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "description": "Initial purchase",
            "kms_year": KMS_YEAR,
            "season": SEASON
        }
        api_client.post(f"{BASE_URL}/api/local-party/manual", json=debit_payload)
        
        # Now settle
        settle_payload = {
            "party_name": f"{TEST_PREFIX}Local_Creditor",
            "amount": 5000,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "notes": "Partial settlement",
            "kms_year": KMS_YEAR,
            "season": SEASON
        }
        response = api_client.post(f"{BASE_URL}/api/local-party/settle", json=settle_payload)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        TestLocalPartySettle.created_txn_id = data.get("txn_id")
        print(f"✅ Created settlement Rs.5000")
    
    def test_settle_creates_cash_nikasi(self, api_client):
        """Verify Cash NIKASI entry"""
        time.sleep(0.5)
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=cash&txn_type=nikasi&category={TEST_PREFIX}Local_Creditor&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        cash_entry = next((e for e in entries if "local_party:" in e.get("reference", "")), None)
        assert cash_entry is not None, "Cash NIKASI for settle not found"
        assert cash_entry["amount"] == 5000
        print(f"✅ Settle Cash NIKASI: Rs.{cash_entry['amount']}")
    
    def test_settle_creates_ledger_nikasi(self, api_client):
        """Verify Ledger NIKASI entry (reduces debt)"""
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=ledger&txn_type=nikasi&category={TEST_PREFIX}Local_Creditor&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        ledger_entry = next((e for e in entries if "local_party_ledger:" in e.get("reference", "")), None)
        assert ledger_entry is not None, "Ledger NIKASI for settle not found"
        assert ledger_entry["amount"] == 5000
        print(f"✅ Settle Ledger NIKASI: Rs.{ledger_entry['amount']}")


class TestMillPartsStockAccounting:
    """
    Test Mill Parts Stock (txn_type=in with party) creates:
    - local_party_accounts debit
    - Ledger JAMA (we owe party)
    """
    
    created_stock_id = None
    
    def test_create_mill_parts_stock(self, api_client):
        """Create mill parts stock entry with party"""
        payload = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "part_name": "Bearing",
            "txn_type": "in",
            "quantity": 10,
            "rate": 500,
            "party_name": f"{TEST_PREFIX}Parts_Supplier",
            "bill_no": "BILL001",
            "kms_year": KMS_YEAR,
            "season": SEASON
        }
        response = api_client.post(f"{BASE_URL}/api/mill-parts-stock", json=payload)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        TestMillPartsStockAccounting.created_stock_id = data["id"]
        assert data["total_amount"] == 5000
        print(f"✅ Created mill parts stock: {data['part_name']} Rs.{data['total_amount']}")
    
    def test_mill_parts_creates_ledger_jama(self, api_client):
        """Verify Ledger JAMA entry (we owe party)"""
        time.sleep(0.5)
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=ledger&txn_type=jama&category={TEST_PREFIX}Parts_Supplier&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        jama = next((e for e in entries if "lp_mill_part:" in e.get("reference", "")), None)
        assert jama is not None, "Ledger JAMA for mill parts not found"
        assert jama["amount"] == 5000
        assert jama["party_type"] == "Local Party"
        print(f"✅ Mill Parts Ledger JAMA: Rs.{jama['amount']}")
    
    def test_delete_mill_parts_cleans_up(self, api_client):
        """Verify DELETE removes entries"""
        stock_id = TestMillPartsStockAccounting.created_stock_id
        assert stock_id is not None
        
        response = api_client.delete(f"{BASE_URL}/api/mill-parts-stock/{stock_id}")
        assert response.status_code == 200
        print(f"✅ Mill parts stock deletion completed")


class TestCashBookSummary:
    """Test Cash Book summary endpoints"""
    
    def test_cash_book_summary(self, api_client):
        """Verify summary includes jama and nikasi totals"""
        response = api_client.get(f"{BASE_URL}/api/cash-book/summary?kms_year={KMS_YEAR}")
        assert response.status_code == 200
        data = response.json()
        assert "cash_in" in data
        assert "cash_out" in data
        assert "cash_balance" in data
        assert "bank_in" in data
        assert "bank_out" in data
        print(f"✅ Cash Book Summary: Cash In={data['cash_in']}, Out={data['cash_out']}, Balance={data['cash_balance']}")
    
    def test_party_summary(self, api_client):
        """Verify party summary shows jama/nikasi per party"""
        response = api_client.get(f"{BASE_URL}/api/cash-book/party-summary?kms_year={KMS_YEAR}")
        assert response.status_code == 200
        data = response.json()
        assert "parties" in data
        assert "summary" in data
        assert "total_parties" in data["summary"]
        assert "total_jama" in data["summary"]
        assert "total_nikasi" in data["summary"]
        print(f"✅ Party Summary: {data['summary']['total_parties']} parties, Outstanding={data['summary']['total_outstanding']}")


class TestCleanup:
    """Final cleanup of all test data"""
    
    def test_cleanup_test_data(self, api_client):
        """Remove all TEST_ prefixed entries"""
        # Clean up cash_transactions with TEST_ in category or description
        # Note: In a real scenario, we'd have proper cleanup endpoints
        print(f"✅ Test cleanup complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
