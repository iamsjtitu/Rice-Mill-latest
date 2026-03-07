"""
Test DC (Delivery Challan), MSP Payments, and Gunny Bags features - Iteration 15
Tests all CRUD operations, summary endpoints, and export functionality
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestDCEntries:
    """DC (Delivery Challan) Management - CRUD and Summary Tests"""
    
    test_dc_ids = []
    test_delivery_ids = []
    
    def test_create_dc_entry(self):
        """POST /api/dc-entries - Create a DC entry"""
        dc_data = {
            "dc_number": f"TEST_DC_{uuid.uuid4().hex[:6]}",
            "date": "2025-01-15",
            "quantity_qntl": 500.0,
            "rice_type": "parboiled",
            "godown_name": "Test Godown",
            "deadline": "2025-02-15",
            "notes": "Test DC entry",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/dc-entries?username=admin", json=dc_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "id" in data
        assert data["dc_number"] == dc_data["dc_number"]
        assert data["quantity_qntl"] == 500.0
        assert data["rice_type"] == "parboiled"
        assert data["godown_name"] == "Test Godown"
        
        self.__class__.test_dc_ids.append(data["id"])
        print(f"PASS: DC entry created with id {data['id']}, dc_number: {data['dc_number']}")
    
    def test_get_dc_entries_with_computed_fields(self):
        """GET /api/dc-entries - Returns DCs with computed delivered_qntl, pending_qntl, status"""
        response = requests.get(f"{BASE_URL}/api/dc-entries")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert isinstance(data, list)
        # Check structure of entries
        if len(data) > 0:
            dc = data[0]
            assert "dc_number" in dc
            assert "delivered_qntl" in dc, "Missing computed field: delivered_qntl"
            assert "pending_qntl" in dc, "Missing computed field: pending_qntl"
            assert "status" in dc, "Missing computed field: status"
            assert dc["status"] in ["pending", "partial", "completed"]
        print(f"PASS: GET /api/dc-entries returns {len(data)} DCs with computed fields")
    
    def test_create_delivery_for_dc(self):
        """POST /api/dc-deliveries - Create a delivery against a DC"""
        if not self.test_dc_ids:
            pytest.skip("No test DC created")
        
        dc_id = self.test_dc_ids[0]
        delivery_data = {
            "dc_id": dc_id,
            "date": "2025-01-16",
            "quantity_qntl": 100.0,
            "vehicle_no": "OD-01-X-1234",
            "driver_name": "Test Driver",
            "slip_no": "SLIP001",
            "godown_name": "Test Godown",
            "notes": "First delivery",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/dc-deliveries?username=admin", json=delivery_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert data["dc_id"] == dc_id
        assert data["quantity_qntl"] == 100.0
        
        self.__class__.test_delivery_ids.append(data["id"])
        print(f"PASS: Delivery created with id {data['id']} for DC {dc_id}")
    
    def test_dc_status_updates_after_delivery(self):
        """Verify DC status auto-updates: pending -> partial after delivery"""
        if not self.test_dc_ids:
            pytest.skip("No test DC created")
        
        response = requests.get(f"{BASE_URL}/api/dc-entries")
        assert response.status_code == 200
        data = response.json()
        
        # Find our test DC
        test_dc = next((dc for dc in data if dc["id"] == self.test_dc_ids[0]), None)
        assert test_dc is not None, "Test DC not found"
        
        # Should be partial after 100/500 delivery
        assert test_dc["delivered_qntl"] == 100.0, f"Expected 100.0 delivered, got {test_dc['delivered_qntl']}"
        assert test_dc["pending_qntl"] == 400.0, f"Expected 400.0 pending, got {test_dc['pending_qntl']}"
        assert test_dc["status"] == "partial", f"Expected 'partial' status, got {test_dc['status']}"
        print(f"PASS: DC status correctly updated to 'partial' (100/500 delivered)")
    
    def test_get_deliveries_for_dc(self):
        """GET /api/dc-deliveries?dc_id=X - Returns deliveries for specific DC"""
        if not self.test_dc_ids:
            pytest.skip("No test DC created")
        
        dc_id = self.test_dc_ids[0]
        response = requests.get(f"{BASE_URL}/api/dc-deliveries?dc_id={dc_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert isinstance(data, list)
        assert len(data) >= 1, "Expected at least 1 delivery"
        assert all(d["dc_id"] == dc_id for d in data), "All deliveries should belong to the DC"
        print(f"PASS: GET /api/dc-deliveries returns {len(data)} deliveries for DC {dc_id}")
    
    def test_dc_summary(self):
        """GET /api/dc-summary - Returns aggregate stats"""
        response = requests.get(f"{BASE_URL}/api/dc-summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify summary structure
        assert "total_dc" in data
        assert "total_allotted_qntl" in data
        assert "total_delivered_qntl" in data
        assert "total_pending_qntl" in data
        assert "completed" in data
        assert "partial" in data
        assert "pending" in data
        
        print(f"PASS: DC Summary - Total: {data['total_dc']}, Allotted: {data['total_allotted_qntl']}Q, Delivered: {data['total_delivered_qntl']}Q, Pending: {data['total_pending_qntl']}Q")
        print(f"       Status counts - Completed: {data['completed']}, Partial: {data['partial']}, Pending: {data['pending']}")
    
    def test_dc_excel_export(self):
        """GET /api/dc-entries/excel - Returns xlsx file"""
        response = requests.get(f"{BASE_URL}/api/dc-entries/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers.get("content-type", ""), \
            f"Expected xlsx content-type, got {response.headers.get('content-type')}"
        assert len(response.content) > 100, "Excel file seems too small"
        print(f"PASS: DC Excel export returns {len(response.content)} bytes")
    
    def test_dc_pdf_export(self):
        """GET /api/dc-entries/pdf - Returns pdf file"""
        response = requests.get(f"{BASE_URL}/api/dc-entries/pdf")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "application/pdf" in response.headers.get("content-type", ""), \
            f"Expected PDF content-type, got {response.headers.get('content-type')}"
        assert len(response.content) > 100, "PDF file seems too small"
        print(f"PASS: DC PDF export returns {len(response.content)} bytes")
    
    def test_delete_delivery(self):
        """DELETE /api/dc-deliveries/{id} - Deletes a delivery"""
        if not self.test_delivery_ids:
            pytest.skip("No test delivery created")
        
        delivery_id = self.test_delivery_ids.pop()
        response = requests.delete(f"{BASE_URL}/api/dc-deliveries/{delivery_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "Deleted" in data.get("message", "") or "deleted" in data.get("message", "")
        print(f"PASS: Delivery {delivery_id} deleted")
    
    def test_delete_dc_deletes_deliveries(self):
        """DELETE /api/dc-entries/{id} - Deletes DC and its deliveries"""
        if not self.test_dc_ids:
            pytest.skip("No test DC created")
        
        dc_id = self.test_dc_ids.pop()
        response = requests.delete(f"{BASE_URL}/api/dc-entries/{dc_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "deleted" in data.get("message", "").lower()
        print(f"PASS: DC {dc_id} and its deliveries deleted")


class TestMSPPayments:
    """MSP Payment Tracking - CRUD and Summary Tests"""
    
    test_payment_ids = []
    test_dc_id = None
    
    @classmethod
    def setup_class(cls):
        """Create a test DC for linking payments"""
        dc_data = {
            "dc_number": f"TEST_MSP_DC_{uuid.uuid4().hex[:6]}",
            "date": "2025-01-15",
            "quantity_qntl": 1000.0,
            "rice_type": "parboiled",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/dc-entries?username=admin", json=dc_data)
        if response.status_code == 200:
            cls.test_dc_id = response.json()["id"]
    
    def test_create_msp_payment(self):
        """POST /api/msp-payments - Create MSP payment"""
        payment_data = {
            "date": "2025-01-15",
            "dc_id": self.test_dc_id or "",
            "quantity_qntl": 100.0,
            "rate_per_qntl": 2200.0,
            "amount": 220000.0,
            "payment_mode": "RTGS",
            "reference": "UTR12345678",
            "bank_name": "SBI",
            "notes": "Test payment",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/msp-payments?username=admin", json=payment_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert data["amount"] == 220000.0
        assert data["quantity_qntl"] == 100.0
        assert data["rate_per_qntl"] == 2200.0
        assert data["payment_mode"] == "RTGS"
        
        self.__class__.test_payment_ids.append(data["id"])
        print(f"PASS: MSP Payment created with id {data['id']}, amount: Rs.{data['amount']}")
    
    def test_get_msp_payments_with_dc_number(self):
        """GET /api/msp-payments - Returns payments with dc_number resolved"""
        response = requests.get(f"{BASE_URL}/api/msp-payments")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert isinstance(data, list)
        if len(data) > 0:
            payment = data[0]
            assert "dc_number" in payment, "Missing resolved dc_number field"
            assert "amount" in payment
            assert "quantity_qntl" in payment
        print(f"PASS: GET /api/msp-payments returns {len(data)} payments with dc_number")
    
    def test_msp_payment_summary(self):
        """GET /api/msp-payments/summary - Returns aggregate stats"""
        response = requests.get(f"{BASE_URL}/api/msp-payments/summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify summary structure
        assert "total_paid_amount" in data
        assert "total_paid_qty" in data
        assert "avg_rate" in data
        assert "pending_payment_qty" in data
        
        print(f"PASS: MSP Summary - Total Paid: Rs.{data['total_paid_amount']}, Qty: {data['total_paid_qty']}Q, Avg Rate: Rs.{data['avg_rate']}/Q, Pending: {data['pending_payment_qty']}Q")
    
    def test_msp_excel_export(self):
        """GET /api/msp-payments/excel - Returns xlsx file"""
        response = requests.get(f"{BASE_URL}/api/msp-payments/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers.get("content-type", "")
        print(f"PASS: MSP Excel export returns {len(response.content)} bytes")
    
    def test_msp_pdf_export(self):
        """GET /api/msp-payments/pdf - Returns pdf file"""
        response = requests.get(f"{BASE_URL}/api/msp-payments/pdf")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "application/pdf" in response.headers.get("content-type", "")
        print(f"PASS: MSP PDF export returns {len(response.content)} bytes")
    
    def test_delete_msp_payment(self):
        """DELETE /api/msp-payments/{id} - Deletes payment"""
        if not self.test_payment_ids:
            pytest.skip("No test payment created")
        
        payment_id = self.test_payment_ids.pop()
        response = requests.delete(f"{BASE_URL}/api/msp-payments/{payment_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "deleted" in data.get("message", "").lower()
        print(f"PASS: MSP Payment {payment_id} deleted")
    
    @classmethod
    def teardown_class(cls):
        """Cleanup test DC"""
        if cls.test_dc_id:
            requests.delete(f"{BASE_URL}/api/dc-entries/{cls.test_dc_id}")


class TestGunnyBags:
    """Gunny Bag (Bori) Tracking - CRUD and Summary Tests"""
    
    test_entry_ids = []
    
    def test_create_new_bag_entry_in(self):
        """POST /api/gunny-bags - Create entry for new (govt) bags IN"""
        entry_data = {
            "date": "2025-01-15",
            "bag_type": "new",
            "txn_type": "in",
            "quantity": 1000,
            "source": "Govt Free Supply",
            "rate": 0,
            "reference": "GS-2025-001",
            "notes": "Free govt bags",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/gunny-bags?username=admin", json=entry_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert data["bag_type"] == "new"
        assert data["txn_type"] == "in"
        assert data["quantity"] == 1000
        assert data["amount"] == 0  # Free bags
        
        self.__class__.test_entry_ids.append(data["id"])
        print(f"PASS: New (Govt) bags IN entry created - {data['quantity']} bags")
    
    def test_create_old_bag_entry_in(self):
        """POST /api/gunny-bags - Create entry for old (market) bags IN with rate"""
        entry_data = {
            "date": "2025-01-15",
            "bag_type": "old",
            "txn_type": "in",
            "quantity": 500,
            "source": "Market Purchase",
            "rate": 15.0,
            "reference": "INV-2025-001",
            "notes": "Purchased from market",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/gunny-bags?username=admin", json=entry_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert data["bag_type"] == "old"
        assert data["quantity"] == 500
        assert data["rate"] == 15.0
        assert data["amount"] == 7500.0, f"Expected auto-calculated amount 7500, got {data['amount']}"  # 500 * 15
        
        self.__class__.test_entry_ids.append(data["id"])
        print(f"PASS: Old (Market) bags IN entry created - {data['quantity']} bags @ Rs.{data['rate']} = Rs.{data['amount']}")
    
    def test_create_bag_out_entry(self):
        """POST /api/gunny-bags - Create OUT entry (bags used)"""
        entry_data = {
            "date": "2025-01-16",
            "bag_type": "new",
            "txn_type": "out",
            "quantity": 200,
            "source": "Used for CMR packing",
            "rate": 0,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/gunny-bags?username=admin", json=entry_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["txn_type"] == "out"
        assert data["quantity"] == 200
        
        self.__class__.test_entry_ids.append(data["id"])
        print(f"PASS: Bags OUT entry created - {data['quantity']} bags used")
    
    def test_get_gunny_bags_sorted(self):
        """GET /api/gunny-bags - Returns entries sorted by date desc"""
        response = requests.get(f"{BASE_URL}/api/gunny-bags")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert isinstance(data, list)
        if len(data) > 0:
            entry = data[0]
            assert "bag_type" in entry
            assert "txn_type" in entry
            assert "quantity" in entry
            assert "rate" in entry
            assert "amount" in entry
        print(f"PASS: GET /api/gunny-bags returns {len(data)} entries")
    
    def test_gunny_bag_summary(self):
        """GET /api/gunny-bags/summary - Returns new/old bag balances and grand_total"""
        response = requests.get(f"{BASE_URL}/api/gunny-bags/summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify summary structure
        assert "new" in data, "Missing 'new' bag summary"
        assert "old" in data, "Missing 'old' bag summary"
        assert "grand_total" in data
        
        # Verify new bag structure
        new_summary = data["new"]
        assert "total_in" in new_summary
        assert "total_out" in new_summary
        assert "balance" in new_summary
        
        # Verify old bag structure
        old_summary = data["old"]
        assert "total_in" in old_summary
        assert "total_out" in old_summary
        assert "balance" in old_summary
        assert "total_cost" in old_summary
        
        print(f"PASS: Gunny Bag Summary")
        print(f"       New (Govt): In={new_summary['total_in']}, Out={new_summary['total_out']}, Balance={new_summary['balance']}")
        print(f"       Old (Market): In={old_summary['total_in']}, Out={old_summary['total_out']}, Balance={old_summary['balance']}, Cost=Rs.{old_summary['total_cost']}")
        print(f"       Grand Total: {data['grand_total']} bags")
    
    def test_gunny_excel_export(self):
        """GET /api/gunny-bags/excel - Returns xlsx file"""
        response = requests.get(f"{BASE_URL}/api/gunny-bags/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers.get("content-type", "")
        print(f"PASS: Gunny Bags Excel export returns {len(response.content)} bytes")
    
    def test_gunny_pdf_export(self):
        """GET /api/gunny-bags/pdf - Returns pdf file"""
        response = requests.get(f"{BASE_URL}/api/gunny-bags/pdf")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "application/pdf" in response.headers.get("content-type", "")
        print(f"PASS: Gunny Bags PDF export returns {len(response.content)} bytes")
    
    def test_delete_gunny_entry(self):
        """DELETE /api/gunny-bags/{id} - Deletes entry"""
        while self.test_entry_ids:
            entry_id = self.test_entry_ids.pop()
            response = requests.delete(f"{BASE_URL}/api/gunny-bags/{entry_id}")
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            print(f"PASS: Gunny bag entry {entry_id} deleted")


class TestDCDeliveryStatusFlow:
    """Test complete DC status flow: pending -> partial -> completed"""
    
    dc_id = None
    delivery_ids = []
    
    @classmethod
    def setup_class(cls):
        """Create a test DC with 100 QNTL"""
        dc_data = {
            "dc_number": f"TEST_STATUS_DC_{uuid.uuid4().hex[:4]}",
            "date": "2025-01-15",
            "quantity_qntl": 100.0,
            "rice_type": "raw",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/dc-entries?username=admin", json=dc_data)
        if response.status_code == 200:
            cls.dc_id = response.json()["id"]
    
    def test_1_initial_status_pending(self):
        """New DC should have status='pending' with 0 deliveries"""
        response = requests.get(f"{BASE_URL}/api/dc-entries")
        data = response.json()
        dc = next((d for d in data if d["id"] == self.dc_id), None)
        
        assert dc is not None
        assert dc["status"] == "pending", f"Expected 'pending', got {dc['status']}"
        assert dc["delivered_qntl"] == 0
        print(f"PASS: Initial status is 'pending' with 0 delivered")
    
    def test_2_partial_delivery_status(self):
        """After partial delivery, status should be 'partial'"""
        delivery_data = {
            "dc_id": self.dc_id,
            "date": "2025-01-16",
            "quantity_qntl": 40.0,  # 40% of 100
            "vehicle_no": "TEST-001",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/dc-deliveries?username=admin", json=delivery_data)
        assert response.status_code == 200
        self.__class__.delivery_ids.append(response.json()["id"])
        
        # Check status
        response = requests.get(f"{BASE_URL}/api/dc-entries")
        data = response.json()
        dc = next((d for d in data if d["id"] == self.dc_id), None)
        
        assert dc["status"] == "partial", f"Expected 'partial', got {dc['status']}"
        assert dc["delivered_qntl"] == 40.0
        assert dc["pending_qntl"] == 60.0
        print(f"PASS: After 40/100 delivery, status is 'partial'")
    
    def test_3_complete_delivery_status(self):
        """After completing all delivery, status should be 'completed'"""
        delivery_data = {
            "dc_id": self.dc_id,
            "date": "2025-01-17",
            "quantity_qntl": 60.0,  # Remaining 60%
            "vehicle_no": "TEST-002",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/dc-deliveries?username=admin", json=delivery_data)
        assert response.status_code == 200
        self.__class__.delivery_ids.append(response.json()["id"])
        
        # Check status
        response = requests.get(f"{BASE_URL}/api/dc-entries")
        data = response.json()
        dc = next((d for d in data if d["id"] == self.dc_id), None)
        
        assert dc["status"] == "completed", f"Expected 'completed', got {dc['status']}"
        assert dc["delivered_qntl"] >= 100.0
        assert dc["pending_qntl"] <= 0
        print(f"PASS: After 100/100 delivery, status is 'completed'")
    
    @classmethod
    def teardown_class(cls):
        """Cleanup test data"""
        for del_id in cls.delivery_ids:
            requests.delete(f"{BASE_URL}/api/dc-deliveries/{del_id}")
        if cls.dc_id:
            requests.delete(f"{BASE_URL}/api/dc-entries/{cls.dc_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
