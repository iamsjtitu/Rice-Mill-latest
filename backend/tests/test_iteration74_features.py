"""
Iteration 74 Test Suite - Testing 4 key changes:
1. Cash Book - 4 action cards at top (Bank Accounts, Sale Voucher Payment, Purchase Voucher Payment, Set Opening Balance)
2. Cash Book - Purchase Voucher Payment dialog
3. Purchase Vouchers - Payment dialog with Cash/Bank mode + Undo button in history
4. Sale Book - Opening Balance button removed
5. Sale Voucher creation (KeyError 'id' bug fix)
6. Sale Book - checkboxes and bulk delete still work
7. Cash Book - Sale Voucher Payment dialog still works
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://web-app-mirror-2.preview.emergentagent.com').rstrip('/')


class TestSaleBookKeyErrorFix:
    """Test that Sale Voucher creation works without KeyError 'id' bug"""

    def test_create_sale_voucher_success(self):
        """Creating a sale voucher should work without KeyError"""
        payload = {
            "date": "2025-01-15",
            "party_name": f"TEST_KeyErrorFix_{uuid.uuid4().hex[:6]}",
            "invoice_no": "TEST-INV-001",
            "items": [
                {"item_name": "Rice (Usna)", "quantity": 10, "rate": 1000, "unit": "Qntl"}
            ],
            "gst_type": "none",
            "cgst_percent": 0,
            "sgst_percent": 0,
            "igst_percent": 0,
            "truck_no": "OD01XX1234",
            "rst_no": "RST-001",
            "remark": "Testing KeyError fix",
            "cash_paid": 0,
            "diesel_paid": 0,
            "advance": 500,
            "eway_bill_no": "EWB-001",
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/sale-book?username=admin&role=admin",
            json=payload
        )
        
        # Should not return 500 error (KeyError)
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain 'id'"
        assert "voucher_no" in data, "Response should contain 'voucher_no'"
        assert data["party_name"] == payload["party_name"]
        assert data["total"] == 10000  # 10 * 1000
        assert data["balance"] == 9500  # total - advance
        
        # Cleanup
        if data.get("id"):
            requests.delete(f"{BASE_URL}/api/sale-book/{data['id']}?username=admin&role=admin")
        
        print(f"PASSED: Sale voucher created successfully with id={data['id']}, voucher_no={data['voucher_no']}")


class TestPurchaseVoucherPaymentWithCashBank:
    """Test Purchase Voucher Payment with Cash/Bank mode selection"""
    
    def test_create_purchase_voucher_for_payment(self):
        """Create a purchase voucher to test payment"""
        payload = {
            "date": "2025-01-15",
            "party_name": f"TEST_PVPay_{uuid.uuid4().hex[:6]}",
            "invoice_no": "PV-TEST-001",
            "rst_no": "RST-PV-001",
            "truck_no": "OD02XX5678",
            "eway_bill_no": "EWB-PV-001",
            "items": [
                {"item_name": "Paddy", "quantity": 50, "rate": 2000, "unit": "Qntl"}
            ],
            "gst_type": "none",
            "cgst_percent": 0,
            "sgst_percent": 0,
            "igst_percent": 0,
            "cash_paid": 0,
            "diesel_paid": 0,
            "advance": 1000,
            "remark": "Testing payment modes",
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/purchase-book?username=admin&role=admin",
            json=payload
        )
        
        assert response.status_code in [200, 201], f"Failed to create purchase voucher: {response.text}"
        data = response.json()
        voucher_id = data.get("id")
        assert voucher_id, "Should return voucher id"
        
        print(f"PASSED: Purchase voucher created with id={voucher_id}")
        return voucher_id, data["party_name"]

    def test_cash_payment_on_purchase_voucher(self):
        """Test making a cash payment on a purchase voucher"""
        voucher_id, party_name = self.test_create_purchase_voucher_for_payment()
        
        payment_payload = {
            "voucher_type": "purchase",
            "voucher_id": voucher_id,
            "amount": 5000,
            "date": "2025-01-15",
            "notes": "Cash payment test",
            "username": "admin",
            "kms_year": "2024-2025",
            "season": "Kharif",
            "account": "cash",
            "bank_name": ""
        }
        
        response = requests.post(f"{BASE_URL}/api/voucher-payment", json=payment_payload)
        assert response.status_code == 200, f"Cash payment failed: {response.text}"
        
        data = response.json()
        assert data["success"] == True
        assert data["amount"] == 5000
        assert "payment_id" in data
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/purchase-book/{voucher_id}?username=admin&role=admin")
        
        print(f"PASSED: Cash payment successful, payment_id={data['payment_id']}")
        return data["payment_id"]

    def test_bank_payment_on_purchase_voucher(self):
        """Test making a bank payment on a purchase voucher"""
        voucher_id, party_name = self.test_create_purchase_voucher_for_payment()
        
        payment_payload = {
            "voucher_type": "purchase",
            "voucher_id": voucher_id,
            "amount": 10000,
            "date": "2025-01-15",
            "notes": "Bank payment test",
            "username": "admin",
            "kms_year": "2024-2025",
            "season": "Kharif",
            "account": "bank",
            "bank_name": "Bank of Baroda"
        }
        
        response = requests.post(f"{BASE_URL}/api/voucher-payment", json=payment_payload)
        assert response.status_code == 200, f"Bank payment failed: {response.text}"
        
        data = response.json()
        assert data["success"] == True
        assert data["amount"] == 10000
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/purchase-book/{voucher_id}?username=admin&role=admin")
        
        print(f"PASSED: Bank payment successful with bank_name=Bank of Baroda")


class TestPurchaseVoucherPaymentHistory:
    """Test Payment History with Undo functionality for Purchase Vouchers"""
    
    def test_payment_history_has_can_undo(self):
        """Verify payment history includes can_undo field"""
        # First create a voucher and make a payment
        payload = {
            "date": "2025-01-15",
            "party_name": f"TEST_HistoryUndo_{uuid.uuid4().hex[:6]}",
            "invoice_no": "PV-UNDO-001",
            "items": [
                {"item_name": "Paddy", "quantity": 20, "rate": 2500, "unit": "Qntl"}
            ],
            "gst_type": "none",
            "cash_paid": 0,
            "diesel_paid": 0,
            "advance": 0,
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        
        response = requests.post(f"{BASE_URL}/api/purchase-book?username=admin&role=admin", json=payload)
        assert response.status_code in [200, 201]
        voucher = response.json()
        voucher_id = voucher["id"]
        party_name = voucher["party_name"]
        
        # Make a payment
        payment_payload = {
            "voucher_type": "purchase",
            "voucher_id": voucher_id,
            "amount": 20000,
            "date": "2025-01-15",
            "notes": "Undo test payment",
            "username": "admin",
            "kms_year": "2024-2025",
            "season": "Kharif",
            "account": "cash"
        }
        
        pay_response = requests.post(f"{BASE_URL}/api/voucher-payment", json=payment_payload)
        assert pay_response.status_code == 200
        payment_id = pay_response.json()["payment_id"]
        
        # Check payment history
        history_response = requests.get(
            f"{BASE_URL}/api/voucher-payment/history/{party_name}?party_type=Purchase Voucher"
        )
        assert history_response.status_code == 200
        
        history_data = history_response.json()
        assert "history" in history_data
        assert len(history_data["history"]) >= 1
        
        # Find our payment and verify can_undo
        payment_found = False
        for record in history_data["history"]:
            if record.get("payment_id") == payment_id:
                assert record.get("can_undo") == True, "Payment should have can_undo=True"
                payment_found = True
                break
        
        assert payment_found, f"Payment {payment_id} not found in history"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/purchase-book/{voucher_id}?username=admin&role=admin")
        
        print(f"PASSED: Payment history shows can_undo=True for voucher payments")

    def test_undo_payment_flow(self):
        """Test the complete undo payment flow"""
        # Create voucher
        payload = {
            "date": "2025-01-15",
            "party_name": f"TEST_UndoFlow_{uuid.uuid4().hex[:6]}",
            "invoice_no": "PV-UNDO-FLOW",
            "items": [{"item_name": "Paddy", "quantity": 10, "rate": 3000, "unit": "Qntl"}],
            "gst_type": "none",
            "cash_paid": 0,
            "diesel_paid": 0,
            "advance": 0,
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        
        response = requests.post(f"{BASE_URL}/api/purchase-book?username=admin&role=admin", json=payload)
        voucher = response.json()
        voucher_id = voucher["id"]
        
        # Make payment
        payment_payload = {
            "voucher_type": "purchase",
            "voucher_id": voucher_id,
            "amount": 15000,
            "date": "2025-01-15",
            "username": "admin",
            "kms_year": "2024-2025",
            "account": "cash"
        }
        
        pay_response = requests.post(f"{BASE_URL}/api/voucher-payment", json=payment_payload)
        payment_id = pay_response.json()["payment_id"]
        
        # Undo the payment
        undo_response = requests.post(
            f"{BASE_URL}/api/voucher-payment/undo",
            json={"payment_id": payment_id}
        )
        
        assert undo_response.status_code == 200, f"Undo failed: {undo_response.text}"
        undo_data = undo_response.json()
        assert undo_data["success"] == True
        assert undo_data["deleted_count"] >= 2  # At least cash + ledger entries
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/purchase-book/{voucher_id}?username=admin&role=admin")
        
        print(f"PASSED: Undo payment flow works correctly, deleted {undo_data['deleted_count']} entries")


class TestSaleBookBulkDelete:
    """Test that Sale Book checkboxes and bulk delete still work"""
    
    def test_bulk_delete_sale_vouchers(self):
        """Test bulk deletion of sale vouchers"""
        created_ids = []
        
        # Create multiple vouchers
        for i in range(2):
            payload = {
                "date": "2025-01-15",
                "party_name": f"TEST_BulkDel_{uuid.uuid4().hex[:6]}",
                "invoice_no": f"BULK-{i}",
                "items": [{"item_name": "Rice (Usna)", "quantity": 5, "rate": 1000, "unit": "Qntl"}],
                "gst_type": "none",
                "cash_paid": 0,
                "diesel_paid": 0,
                "advance": 0,
                "kms_year": "2024-2025",
                "season": "Kharif"
            }
            
            response = requests.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=payload)
            assert response.status_code in [200, 201]
            created_ids.append(response.json()["id"])
        
        # Bulk delete
        bulk_response = requests.post(
            f"{BASE_URL}/api/sale-book/delete-bulk",
            json={"ids": created_ids}
        )
        
        assert bulk_response.status_code == 200, f"Bulk delete failed: {bulk_response.text}"
        bulk_data = bulk_response.json()
        assert bulk_data["deleted"] == 2
        
        print(f"PASSED: Bulk delete works correctly, deleted {bulk_data['deleted']} vouchers")


class TestCashBookSaleVoucherPayment:
    """Test that Sale Voucher Payment dialog in Cash Book still works"""
    
    def test_sale_book_vouchers_returned(self):
        """Verify sale vouchers are available for payment in Cash Book"""
        response = requests.get(f"{BASE_URL}/api/sale-book?kms_year=2024-2025&season=Kharif")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"PASSED: Sale Book returns {len(data)} vouchers for Cash Book payment dialog")

    def test_sale_voucher_payment_from_cashbook(self):
        """Test making a sale voucher payment (as would be done from Cash Book)"""
        # Create a sale voucher
        payload = {
            "date": "2025-01-15",
            "party_name": f"TEST_CBPay_{uuid.uuid4().hex[:6]}",
            "invoice_no": "CB-PAY-001",
            "items": [{"item_name": "Rice (Raw)", "quantity": 8, "rate": 1200, "unit": "Qntl"}],
            "gst_type": "none",
            "cash_paid": 0,
            "diesel_paid": 0,
            "advance": 0,
            "kms_year": "2024-2025",
            "season": "Kharif"
        }
        
        response = requests.post(f"{BASE_URL}/api/sale-book?username=admin&role=admin", json=payload)
        voucher = response.json()
        voucher_id = voucher["id"]
        
        # Make payment as Cash Book would
        payment_payload = {
            "voucher_type": "sale",
            "voucher_id": voucher_id,
            "amount": 5000,
            "date": "2025-01-15",
            "notes": "From Cash Book",
            "username": "admin",
            "kms_year": "2024-2025",
            "season": "Kharif",
            "account": "cash"
        }
        
        pay_response = requests.post(f"{BASE_URL}/api/voucher-payment", json=payment_payload)
        assert pay_response.status_code == 200
        
        pay_data = pay_response.json()
        assert pay_data["success"] == True
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sale-book/{voucher_id}?username=admin&role=admin")
        
        print(f"PASSED: Sale Voucher Payment from Cash Book dialog works")


class TestPurchaseBookForCashBookDialog:
    """Test that Purchase Vouchers are available for Cash Book Purchase Voucher Payment dialog"""
    
    def test_purchase_vouchers_with_balance(self):
        """Verify purchase vouchers with balance are available"""
        response = requests.get(f"{BASE_URL}/api/purchase-book?kms_year=2024-2025&season=Kharif")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # Filter those with balance > 0 (as the dialog does)
        pending = [v for v in data if (v.get("ledger_balance") or v.get("balance", 0)) > 0]
        
        print(f"PASSED: Purchase Book returns {len(data)} total, {len(pending)} pending for Cash Book payment dialog")


class TestBankAccounts:
    """Test bank accounts for Cash/Bank payment mode"""
    
    def test_get_bank_accounts(self):
        """Verify bank accounts endpoint works"""
        response = requests.get(f"{BASE_URL}/api/bank-accounts")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        bank_names = [b.get("name") for b in data]
        print(f"PASSED: Bank accounts available: {bank_names}")


class TestCashBookOpeningBalance:
    """Test Cash Book opening balance endpoints"""
    
    def test_get_opening_balance(self):
        """Test fetching opening balance settings"""
        response = requests.get(f"{BASE_URL}/api/cash-book/opening-balance?kms_year=2024-2025")
        # May return 404 if not set, or 200 with data
        assert response.status_code in [200, 404]
        
        if response.status_code == 200:
            data = response.json()
            print(f"PASSED: Opening balance fetched: cash={data.get('cash', 0)}, bank_details={data.get('bank_details', {})}")
        else:
            print("PASSED: Opening balance not set yet (404)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
