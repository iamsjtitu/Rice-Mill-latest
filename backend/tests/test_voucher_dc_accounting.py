"""
Additional tests for Voucher Payments and DC Deliveries accounting entries
"""

import pytest
import requests
import time
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://grain-ledger-sync.preview.emergentagent.com')
BASE_URL = BASE_URL.rstrip('/')

TEST_PREFIX = "TEST_VP_"
KMS_YEAR = "2025-2026"
SEASON = "Kharif"

@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestVoucherPaymentForSale:
    """
    Test Voucher Payment for SALE type creates:
    - Cash/Bank JAMA (cash coming in)
    - Ledger NIKASI (reduces party debt)
    - local_party_accounts entry
    """
    
    sale_id = None
    payment_id = None
    
    def test_create_sale_for_payment(self, api_client):
        """Create a sale voucher to pay"""
        payload = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "party_name": f"{TEST_PREFIX}SaleParty",
            "invoice_no": f"{TEST_PREFIX}SI001",
            "items": [{"item_name": "Rice (Usna)", "quantity": 5, "rate": 3000, "unit": "Qntl"}],
            "gst_type": "none",
            "kms_year": KMS_YEAR,
            "season": SEASON
        }
        response = api_client.post(f"{BASE_URL}/api/sale-book", json=payload)
        assert response.status_code == 200
        data = response.json()
        TestVoucherPaymentForSale.sale_id = data["id"]
        assert data["total"] == 15000
        print(f"✅ Created sale voucher #{data['voucher_no']} for Rs.15000")
    
    def test_make_voucher_payment_for_sale(self, api_client):
        """Make payment on sale voucher"""
        payload = {
            "voucher_type": "sale",
            "voucher_id": TestVoucherPaymentForSale.sale_id,
            "amount": 5000,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "notes": "Test payment",
            "account": "cash",
            "kms_year": KMS_YEAR,
            "season": SEASON
        }
        response = api_client.post(f"{BASE_URL}/api/voucher-payment", json=payload)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["success"] == True
        TestVoucherPaymentForSale.payment_id = data["payment_id"]
        print(f"✅ Made voucher payment: Rs.{data['amount']}")
    
    def test_sale_payment_creates_cash_jama(self, api_client):
        """Verify Cash JAMA entry (payment received)"""
        time.sleep(0.5)
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=cash&txn_type=jama&category={TEST_PREFIX}SaleParty&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        cash_entry = next((e for e in entries if "voucher_payment:" in e.get("reference", "")), None)
        assert cash_entry is not None, "Cash JAMA for voucher payment not found"
        assert cash_entry["amount"] == 5000
        print(f"✅ Sale Payment Cash JAMA: Rs.{cash_entry['amount']}")
    
    def test_sale_payment_creates_ledger_nikasi(self, api_client):
        """Verify Ledger NIKASI entry (reduces party debt)"""
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=ledger&txn_type=nikasi&category={TEST_PREFIX}SaleParty&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        ledger_entry = next((e for e in entries if "voucher_payment_ledger:" in e.get("reference", "")), None)
        assert ledger_entry is not None, "Ledger NIKASI for voucher payment not found"
        assert ledger_entry["amount"] == 5000
        print(f"✅ Sale Payment Ledger NIKASI: Rs.{ledger_entry['amount']}")
    
    def test_sale_payment_creates_local_party_entry(self, api_client):
        """Verify local_party_accounts entry"""
        response = api_client.get(
            f"{BASE_URL}/api/local-party/transactions?party_name={TEST_PREFIX}SaleParty&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        lp_entry = next((e for e in entries if e.get("source_type") == "sale_voucher_payment"), None)
        assert lp_entry is not None, "Local party entry for sale payment not found"
        assert lp_entry["txn_type"] == "payment"
        assert lp_entry["amount"] == 5000
        print(f"✅ Sale Payment Local Party entry: {lp_entry['txn_type']} Rs.{lp_entry['amount']}")
    
    def test_undo_sale_payment_cleans_up(self, api_client):
        """Verify UNDO removes all entries"""
        pay_id = TestVoucherPaymentForSale.payment_id
        assert pay_id is not None
        
        response = api_client.post(f"{BASE_URL}/api/voucher-payment/undo", json={"payment_id": pay_id})
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["deleted_count"] >= 3  # cash + ledger + local_party
        print(f"✅ Undo deleted {data['deleted_count']} entries")
        
        time.sleep(0.5)
        
        # Verify cleanup
        response2 = api_client.get(
            f"{BASE_URL}/api/cash-book?kms_year={KMS_YEAR}"
        )
        remaining = [e for e in response2.json() if f"voucher_payment:{pay_id}" in e.get("reference", "") or f"voucher_payment_ledger:{pay_id}" in e.get("reference", "")]
        assert len(remaining) == 0
        print(f"✅ Undo cleaned up all voucher payment entries")
    
    def test_cleanup_sale(self, api_client):
        """Clean up test sale"""
        if TestVoucherPaymentForSale.sale_id:
            api_client.delete(f"{BASE_URL}/api/sale-book/{TestVoucherPaymentForSale.sale_id}")


class TestVoucherPaymentForPurchase:
    """
    Test Voucher Payment for PURCHASE type creates:
    - Cash/Bank NIKASI (cash going out)
    - Ledger NIKASI (reduces what we owe)
    - local_party_accounts entry
    """
    
    purchase_id = None
    payment_id = None
    
    def test_create_purchase_for_payment(self, api_client):
        """Create a purchase voucher to pay"""
        payload = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "party_name": f"{TEST_PREFIX}PurchaseParty",
            "invoice_no": f"{TEST_PREFIX}PI001",
            "items": [{"item_name": "Paddy", "quantity": 10, "rate": 2000, "unit": "Qntl"}],
            "gst_type": "none",
            "kms_year": KMS_YEAR,
            "season": SEASON
        }
        response = api_client.post(f"{BASE_URL}/api/purchase-book", json=payload)
        assert response.status_code == 200
        data = response.json()
        TestVoucherPaymentForPurchase.purchase_id = data["id"]
        assert data["total"] == 20000
        print(f"✅ Created purchase voucher #{data['voucher_no']} for Rs.20000")
    
    def test_make_voucher_payment_for_purchase(self, api_client):
        """Make payment on purchase voucher"""
        payload = {
            "voucher_type": "purchase",
            "voucher_id": TestVoucherPaymentForPurchase.purchase_id,
            "amount": 8000,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "notes": "Test purchase payment",
            "account": "cash",
            "kms_year": KMS_YEAR,
            "season": SEASON
        }
        response = api_client.post(f"{BASE_URL}/api/voucher-payment", json=payload)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["success"] == True
        TestVoucherPaymentForPurchase.payment_id = data["payment_id"]
        print(f"✅ Made purchase voucher payment: Rs.{data['amount']}")
    
    def test_purchase_payment_creates_cash_nikasi(self, api_client):
        """Verify Cash NIKASI entry (payment made)"""
        time.sleep(0.5)
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=cash&txn_type=nikasi&category={TEST_PREFIX}PurchaseParty&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        cash_entry = next((e for e in entries if "voucher_payment:" in e.get("reference", "")), None)
        assert cash_entry is not None, "Cash NIKASI for purchase payment not found"
        assert cash_entry["amount"] == 8000
        print(f"✅ Purchase Payment Cash NIKASI: Rs.{cash_entry['amount']}")
    
    def test_purchase_payment_creates_ledger_nikasi(self, api_client):
        """Verify Ledger NIKASI entry (reduces what we owe)"""
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=ledger&txn_type=nikasi&category={TEST_PREFIX}PurchaseParty&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        ledger_entry = next((e for e in entries if "voucher_payment_ledger:" in e.get("reference", "")), None)
        assert ledger_entry is not None, "Ledger NIKASI for purchase payment not found"
        assert ledger_entry["amount"] == 8000
        print(f"✅ Purchase Payment Ledger NIKASI: Rs.{ledger_entry['amount']}")
    
    def test_cleanup_purchase(self, api_client):
        """Clean up test purchase"""
        if TestVoucherPaymentForPurchase.payment_id:
            api_client.post(f"{BASE_URL}/api/voucher-payment/undo", json={"payment_id": TestVoucherPaymentForPurchase.payment_id})
        if TestVoucherPaymentForPurchase.purchase_id:
            api_client.delete(f"{BASE_URL}/api/purchase-book/{TestVoucherPaymentForPurchase.purchase_id}")
        print(f"✅ Cleaned up purchase voucher and payment")


class TestDCDeliveryAccounting:
    """
    Test DC Delivery with cash_paid, diesel_paid creates:
    - Cash NIKASI (truck cash)
    - Truck Ledger NIKASI (deduction)
    - Diesel Pump Ledger JAMA (we owe them)
    - diesel_accounts entry
    """
    
    dc_id = None
    delivery_id = None
    
    def test_create_dc_entry(self, api_client):
        """Create DC entry first"""
        payload = {
            "dc_number": f"{TEST_PREFIX}DC001",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "quantity_qntl": 100,
            "rice_type": "parboiled",
            "godown_name": "Test Godown",
            "kms_year": KMS_YEAR,
            "season": SEASON
        }
        response = api_client.post(f"{BASE_URL}/api/dc-entries", json=payload)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        TestDCDeliveryAccounting.dc_id = data["id"]
        print(f"✅ Created DC entry: {data['dc_number']}")
    
    def test_create_dc_delivery(self, api_client):
        """Create DC delivery with cash and diesel"""
        payload = {
            "dc_id": TestDCDeliveryAccounting.dc_id,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "quantity_qntl": 50,
            "vehicle_no": f"{TEST_PREFIX}TRUCK123",
            "driver_name": "Test Driver",
            "cash_paid": 2000,
            "diesel_paid": 1500,
            "bags_used": 0,
            "kms_year": KMS_YEAR,
            "season": SEASON
        }
        response = api_client.post(f"{BASE_URL}/api/dc-deliveries", json=payload)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        TestDCDeliveryAccounting.delivery_id = data["id"]
        print(f"✅ Created DC delivery: {data['quantity_qntl']}Q, cash={data['cash_paid']}, diesel={data['diesel_paid']}")
    
    def test_delivery_creates_cash_nikasi(self, api_client):
        """Verify Cash NIKASI entry for truck cash"""
        time.sleep(0.5)
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=cash&txn_type=nikasi&category={TEST_PREFIX}TRUCK123&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        cash_entry = next((e for e in entries if "delivery:" in e.get("reference", "")), None)
        assert cash_entry is not None, "Cash NIKASI for delivery not found"
        assert cash_entry["amount"] == 2000
        print(f"✅ DC Delivery Cash NIKASI: Rs.{cash_entry['amount']}")
    
    def test_delivery_creates_truck_ledger_nikasi(self, api_client):
        """Verify Truck Ledger NIKASI entries for cash and diesel"""
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=ledger&txn_type=nikasi&category={TEST_PREFIX}TRUCK123&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        truck_entries = [e for e in entries if "delivery_t" in e.get("reference", "")]
        # Should have entries for both cash and diesel deductions
        total_deductions = sum(e["amount"] for e in truck_entries)
        assert total_deductions == 3500, f"Total truck deductions should be 3500 (2000+1500), got {total_deductions}"
        print(f"✅ DC Delivery Truck Ledger NIKASI: total Rs.{total_deductions}")
    
    def test_delivery_creates_diesel_ledger_jama(self, api_client):
        """Verify Diesel Pump Ledger JAMA entry"""
        response = api_client.get(
            f"{BASE_URL}/api/cash-book?account=ledger&txn_type=jama&party_type=Diesel&kms_year={KMS_YEAR}"
        )
        assert response.status_code == 200
        entries = response.json()
        diesel_entry = next((e for e in entries if "delivery_dfill:" in e.get("reference", "") and TEST_PREFIX in e.get("description", "")), None)
        assert diesel_entry is not None, "Diesel Pump Ledger JAMA for delivery not found"
        assert diesel_entry["amount"] == 1500
        print(f"✅ DC Delivery Diesel Ledger JAMA: Rs.{diesel_entry['amount']}")
    
    def test_delete_delivery_cleans_up(self, api_client):
        """Verify DELETE removes all entries"""
        delivery_id = TestDCDeliveryAccounting.delivery_id
        assert delivery_id is not None
        
        response = api_client.delete(f"{BASE_URL}/api/dc-deliveries/{delivery_id}")
        assert response.status_code == 200
        
        time.sleep(0.5)
        
        # Verify cleanup
        response2 = api_client.get(
            f"{BASE_URL}/api/cash-book?category={TEST_PREFIX}TRUCK123&kms_year={KMS_YEAR}"
        )
        remaining = [e for e in response2.json() if "delivery" in e.get("reference", "")]
        assert len(remaining) == 0, f"Expected 0 remaining, got {len(remaining)}"
        print(f"✅ DC Delivery deletion cleaned up all entries")
    
    def test_cleanup_dc(self, api_client):
        """Clean up DC entry"""
        if TestDCDeliveryAccounting.dc_id:
            api_client.delete(f"{BASE_URL}/api/dc-entries/{TestDCDeliveryAccounting.dc_id}")
        print(f"✅ Cleaned up DC entry")


class TestVoucherPaymentHistory:
    """Test voucher payment history endpoint"""
    
    def test_get_payment_history(self, api_client):
        """Verify payment history endpoint works"""
        response = api_client.get(f"{BASE_URL}/api/voucher-payment/history/TestParty?party_type=Sale%20Book")
        assert response.status_code == 200
        data = response.json()
        assert "history" in data
        assert "total_paid" in data
        print(f"✅ Payment history endpoint working, total_paid={data['total_paid']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
