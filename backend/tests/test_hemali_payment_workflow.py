"""
Test: Hemali Payment Workflow - Mark Paid, Undo, Print, Delete
Focus: unpaid → paid → undo cycle and cash book integration
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestHemaliPaymentWorkflow:
    """Test complete workflow: Create Unpaid → Mark Paid → Undo → Mark Paid Again"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test sardar name for this test class"""
        self.sardar_name = f"TEST_Sardar_{uuid.uuid4().hex[:6]}"
        self.created_item_ids = []
        self.created_payment_ids = []
        yield
        # Cleanup
        for pid in self.created_payment_ids:
            try:
                requests.delete(f"{BASE_URL}/api/hemali/payments/{pid}")
            except:
                pass
        for item_id in self.created_item_ids:
            try:
                requests.delete(f"{BASE_URL}/api/hemali/items/{item_id}")
            except:
                pass

    def test_01_create_payment_status_unpaid(self):
        """Create payment should have status 'unpaid' and NO cash book entries"""
        # First create a test item
        item_resp = requests.post(f"{BASE_URL}/api/hemali/items", json={
            "name": f"TEST_Item_{uuid.uuid4().hex[:6]}",
            "rate": 10,
            "unit": "bag"
        })
        assert item_resp.status_code == 200, f"Failed to create item: {item_resp.text}"
        item = item_resp.json()
        self.created_item_ids.append(item["id"])
        
        # Create payment
        payment_data = {
            "sardar_name": self.sardar_name,
            "date": "2026-01-15",
            "items": [{"item_name": item["name"], "rate": 10, "quantity": 5}],
            "kms_year": "2025-26",
            "season": "Kharif"
        }
        resp = requests.post(f"{BASE_URL}/api/hemali/payments", json=payment_data)
        assert resp.status_code == 200, f"Create failed: {resp.text}"
        payment = resp.json()
        self.created_payment_ids.append(payment["id"])
        
        # Verify status is 'unpaid'
        assert payment["status"] == "unpaid", f"Expected 'unpaid', got '{payment['status']}'"
        assert payment["total"] == 50.0  # 5 * 10
        
        # Verify NO cash book entries created
        cash_resp = requests.get(f"{BASE_URL}/api/cash/transactions")
        if cash_resp.status_code == 200:
            cash_txns = cash_resp.json()
            hemali_entries = [t for t in cash_txns if f"hemali_payment:{payment['id']}" in t.get("reference", "")]
            assert len(hemali_entries) == 0, "Cash entry should NOT be created for unpaid payment"
        
        return payment

    def test_02_mark_paid_creates_cash_entry(self):
        """Mark Paid should change status and create cash book nikasi entry"""
        # Create unpaid payment first
        item_resp = requests.post(f"{BASE_URL}/api/hemali/items", json={
            "name": f"TEST_Item_{uuid.uuid4().hex[:6]}",
            "rate": 15,
            "unit": "bag"
        })
        item = item_resp.json()
        self.created_item_ids.append(item["id"])
        
        payment_resp = requests.post(f"{BASE_URL}/api/hemali/payments", json={
            "sardar_name": self.sardar_name,
            "date": "2026-01-15",
            "items": [{"item_name": item["name"], "rate": 15, "quantity": 10}],
            "kms_year": "2025-26",
            "season": "Kharif"
        })
        payment = payment_resp.json()
        self.created_payment_ids.append(payment["id"])
        
        # Mark as paid
        mark_resp = requests.put(f"{BASE_URL}/api/hemali/payments/{payment['id']}/mark-paid", json={})
        assert mark_resp.status_code == 200, f"Mark paid failed: {mark_resp.text}"
        result = mark_resp.json()
        assert "message" in result
        
        # Verify status changed to 'paid'
        get_resp = requests.get(f"{BASE_URL}/api/hemali/payments")
        payments = get_resp.json()
        updated = next((p for p in payments if p["id"] == payment["id"]), None)
        assert updated is not None
        assert updated["status"] == "paid", f"Expected 'paid', got '{updated['status']}'"
        
        # Verify cash book entry created
        cash_resp = requests.get(f"{BASE_URL}/api/cash/transactions")
        if cash_resp.status_code == 200:
            cash_txns = cash_resp.json()
            hemali_entries = [t for t in cash_txns if f"hemali_payment:{payment['id']}" in t.get("reference", "")]
            assert len(hemali_entries) >= 1, "Cash nikasi entry should be created for paid payment"
            
            nikasi_entry = hemali_entries[0]
            assert nikasi_entry["txn_type"] == "nikasi"
            assert nikasi_entry["amount"] == 150.0  # 10 * 15
        
        return payment["id"]

    def test_03_mark_paid_already_paid_fails(self):
        """Cannot mark-paid an already paid payment"""
        # Create and mark paid
        item_resp = requests.post(f"{BASE_URL}/api/hemali/items", json={
            "name": f"TEST_Item_{uuid.uuid4().hex[:6]}",
            "rate": 5,
            "unit": "bag"
        })
        item = item_resp.json()
        self.created_item_ids.append(item["id"])
        
        payment_resp = requests.post(f"{BASE_URL}/api/hemali/payments", json={
            "sardar_name": self.sardar_name,
            "date": "2026-01-15",
            "items": [{"item_name": item["name"], "rate": 5, "quantity": 20}]
        })
        payment = payment_resp.json()
        self.created_payment_ids.append(payment["id"])
        
        # Mark as paid
        requests.put(f"{BASE_URL}/api/hemali/payments/{payment['id']}/mark-paid", json={})
        
        # Try to mark paid again - should fail
        mark_resp2 = requests.put(f"{BASE_URL}/api/hemali/payments/{payment['id']}/mark-paid", json={})
        assert mark_resp2.status_code == 400, f"Expected 400 for already paid, got {mark_resp2.status_code}"

    def test_04_undo_changes_status_removes_cash(self):
        """Undo Payment should change status to 'unpaid' and remove cash book entries"""
        # Create and mark paid
        item_resp = requests.post(f"{BASE_URL}/api/hemali/items", json={
            "name": f"TEST_Item_{uuid.uuid4().hex[:6]}",
            "rate": 8,
            "unit": "bag"
        })
        item = item_resp.json()
        self.created_item_ids.append(item["id"])
        
        payment_resp = requests.post(f"{BASE_URL}/api/hemali/payments", json={
            "sardar_name": self.sardar_name,
            "date": "2026-01-15",
            "items": [{"item_name": item["name"], "rate": 8, "quantity": 25}],
            "kms_year": "2025-26"
        })
        payment = payment_resp.json()
        self.created_payment_ids.append(payment["id"])
        
        # Mark as paid
        requests.put(f"{BASE_URL}/api/hemali/payments/{payment['id']}/mark-paid", json={})
        
        # Undo
        undo_resp = requests.put(f"{BASE_URL}/api/hemali/payments/{payment['id']}/undo")
        assert undo_resp.status_code == 200, f"Undo failed: {undo_resp.text}"
        
        # Verify status changed to 'unpaid'
        get_resp = requests.get(f"{BASE_URL}/api/hemali/payments")
        payments = get_resp.json()
        updated = next((p for p in payments if p["id"] == payment["id"]), None)
        assert updated is not None
        assert updated["status"] == "unpaid", f"Expected 'unpaid' after undo, got '{updated['status']}'"
        
        # Verify cash entries removed
        cash_resp = requests.get(f"{BASE_URL}/api/cash/transactions")
        if cash_resp.status_code == 200:
            cash_txns = cash_resp.json()
            hemali_entries = [t for t in cash_txns if f"hemali_payment:{payment['id']}" in t.get("reference", "")]
            assert len(hemali_entries) == 0, "Cash entries should be removed after undo"

    def test_05_undo_already_unpaid_fails(self):
        """Cannot undo an already unpaid payment"""
        item_resp = requests.post(f"{BASE_URL}/api/hemali/items", json={
            "name": f"TEST_Item_{uuid.uuid4().hex[:6]}",
            "rate": 5,
            "unit": "bag"
        })
        item = item_resp.json()
        self.created_item_ids.append(item["id"])
        
        payment_resp = requests.post(f"{BASE_URL}/api/hemali/payments", json={
            "sardar_name": self.sardar_name,
            "date": "2026-01-15",
            "items": [{"item_name": item["name"], "rate": 5, "quantity": 10}]
        })
        payment = payment_resp.json()
        self.created_payment_ids.append(payment["id"])
        
        # Try to undo unpaid payment - should fail
        undo_resp = requests.put(f"{BASE_URL}/api/hemali/payments/{payment['id']}/undo")
        assert undo_resp.status_code == 400, f"Expected 400 for undo unpaid, got {undo_resp.status_code}"

    def test_06_full_workflow_create_paid_undo_paid_again(self):
        """Full cycle: Create → Mark Paid → Undo → Mark Paid Again"""
        item_resp = requests.post(f"{BASE_URL}/api/hemali/items", json={
            "name": f"TEST_Item_{uuid.uuid4().hex[:6]}",
            "rate": 20,
            "unit": "bag"
        })
        item = item_resp.json()
        self.created_item_ids.append(item["id"])
        
        # Step 1: Create payment (status=unpaid)
        payment_resp = requests.post(f"{BASE_URL}/api/hemali/payments", json={
            "sardar_name": self.sardar_name,
            "date": "2026-01-15",
            "items": [{"item_name": item["name"], "rate": 20, "quantity": 10}],
            "kms_year": "2025-26",
            "season": "Kharif"
        })
        payment = payment_resp.json()
        self.created_payment_ids.append(payment["id"])
        assert payment["status"] == "unpaid"
        
        # Step 2: Mark Paid (status=paid, cash entry created)
        mark1 = requests.put(f"{BASE_URL}/api/hemali/payments/{payment['id']}/mark-paid", json={})
        assert mark1.status_code == 200
        
        # Verify status
        payments = requests.get(f"{BASE_URL}/api/hemali/payments").json()
        p1 = next((p for p in payments if p["id"] == payment["id"]), None)
        assert p1["status"] == "paid"
        
        # Step 3: Undo (status=unpaid, cash entry removed)
        undo = requests.put(f"{BASE_URL}/api/hemali/payments/{payment['id']}/undo")
        assert undo.status_code == 200
        
        payments = requests.get(f"{BASE_URL}/api/hemali/payments").json()
        p2 = next((p for p in payments if p["id"] == payment["id"]), None)
        assert p2["status"] == "unpaid"
        
        # Step 4: Mark Paid Again (status=paid, new cash entry created)
        mark2 = requests.put(f"{BASE_URL}/api/hemali/payments/{payment['id']}/mark-paid", json={})
        assert mark2.status_code == 200
        
        payments = requests.get(f"{BASE_URL}/api/hemali/payments").json()
        p3 = next((p for p in payments if p["id"] == payment["id"]), None)
        assert p3["status"] == "paid"
        
        # Verify final cash entry
        cash_resp = requests.get(f"{BASE_URL}/api/cash/transactions")
        if cash_resp.status_code == 200:
            cash_txns = cash_resp.json()
            hemali_entries = [t for t in cash_txns if f"hemali_payment:{payment['id']}" in t.get("reference", "")]
            assert len(hemali_entries) == 1, f"Should have exactly 1 cash entry, got {len(hemali_entries)}"

    def test_07_print_receipt_returns_pdf(self):
        """Print Receipt should return PDF"""
        item_resp = requests.post(f"{BASE_URL}/api/hemali/items", json={
            "name": f"TEST_Item_{uuid.uuid4().hex[:6]}",
            "rate": 5,
            "unit": "bag"
        })
        item = item_resp.json()
        self.created_item_ids.append(item["id"])
        
        payment_resp = requests.post(f"{BASE_URL}/api/hemali/payments", json={
            "sardar_name": self.sardar_name,
            "date": "2026-01-15",
            "items": [{"item_name": item["name"], "rate": 5, "quantity": 10}]
        })
        payment = payment_resp.json()
        self.created_payment_ids.append(payment["id"])
        
        # Get print receipt
        print_resp = requests.get(f"{BASE_URL}/api/hemali/payments/{payment['id']}/print")
        assert print_resp.status_code == 200, f"Print failed: {print_resp.text}"
        assert "application/pdf" in print_resp.headers.get("content-type", "")
        assert "attachment" in print_resp.headers.get("content-disposition", "")
        assert len(print_resp.content) > 0, "PDF should have content"

    def test_08_delete_removes_payment_and_cash(self):
        """Delete should remove payment and any cash entries"""
        item_resp = requests.post(f"{BASE_URL}/api/hemali/items", json={
            "name": f"TEST_Item_{uuid.uuid4().hex[:6]}",
            "rate": 12,
            "unit": "bag"
        })
        item = item_resp.json()
        self.created_item_ids.append(item["id"])
        
        payment_resp = requests.post(f"{BASE_URL}/api/hemali/payments", json={
            "sardar_name": self.sardar_name,
            "date": "2026-01-15",
            "items": [{"item_name": item["name"], "rate": 12, "quantity": 15}]
        })
        payment = payment_resp.json()
        payment_id = payment["id"]
        
        # Mark as paid (creates cash entry)
        requests.put(f"{BASE_URL}/api/hemali/payments/{payment_id}/mark-paid", json={})
        
        # Delete
        del_resp = requests.delete(f"{BASE_URL}/api/hemali/payments/{payment_id}")
        assert del_resp.status_code == 200, f"Delete failed: {del_resp.text}"
        
        # Verify payment removed
        payments = requests.get(f"{BASE_URL}/api/hemali/payments").json()
        deleted_payment = next((p for p in payments if p["id"] == payment_id), None)
        assert deleted_payment is None, "Payment should be deleted"
        
        # Verify cash entries removed
        cash_resp = requests.get(f"{BASE_URL}/api/cash/transactions")
        if cash_resp.status_code == 200:
            cash_txns = cash_resp.json()
            hemali_entries = [t for t in cash_txns if f"hemali_payment:{payment_id}" in t.get("reference", "")]
            assert len(hemali_entries) == 0, "Cash entries should be removed after delete"

    def test_09_advance_only_counts_paid_payments(self):
        """Advance balance should only count 'paid' payments"""
        unique_sardar = f"TEST_AdvSardar_{uuid.uuid4().hex[:6]}"
        
        item_resp = requests.post(f"{BASE_URL}/api/hemali/items", json={
            "name": f"TEST_Item_{uuid.uuid4().hex[:6]}",
            "rate": 100,
            "unit": "bag"
        })
        item = item_resp.json()
        self.created_item_ids.append(item["id"])
        
        # Create payment with extra paid (creates new_advance)
        payment_resp = requests.post(f"{BASE_URL}/api/hemali/payments", json={
            "sardar_name": unique_sardar,
            "date": "2026-01-15",
            "items": [{"item_name": item["name"], "rate": 100, "quantity": 1}],  # Total: 100
            "amount_paid": 150,  # Extra 50 paid
            "kms_year": "2025-26",
            "season": "Kharif"
        })
        payment = payment_resp.json()
        self.created_payment_ids.append(payment["id"])
        
        # Payment is unpaid - advance should be 0
        adv_resp = requests.get(f"{BASE_URL}/api/hemali/advance?sardar_name={unique_sardar}&kms_year=2025-26&season=Kharif")
        adv = adv_resp.json()
        assert adv["advance"] == 0, f"Advance should be 0 for unpaid payment, got {adv['advance']}"
        
        # Mark as paid
        requests.put(f"{BASE_URL}/api/hemali/payments/{payment['id']}/mark-paid", json={"amount_paid": 150})
        
        # Now advance should be 50 (150 paid - 100 work = 50 advance)
        adv_resp2 = requests.get(f"{BASE_URL}/api/hemali/advance?sardar_name={unique_sardar}&kms_year=2025-26&season=Kharif")
        adv2 = adv_resp2.json()
        assert adv2["advance"] == 50.0, f"Advance should be 50 for paid payment, got {adv2['advance']}"

    def test_10_print_not_found(self):
        """Print for non-existent payment should return 404"""
        print_resp = requests.get(f"{BASE_URL}/api/hemali/payments/non-existent-id/print")
        assert print_resp.status_code == 404


class TestEndpointValidation:
    """Test endpoint error handling"""
    
    def test_mark_paid_not_found(self):
        resp = requests.put(f"{BASE_URL}/api/hemali/payments/fake-id-123/mark-paid", json={})
        assert resp.status_code == 404
    
    def test_undo_not_found(self):
        resp = requests.put(f"{BASE_URL}/api/hemali/payments/fake-id-123/undo")
        assert resp.status_code == 404
    
    def test_delete_not_found(self):
        resp = requests.delete(f"{BASE_URL}/api/hemali/payments/fake-id-123")
        assert resp.status_code == 404
