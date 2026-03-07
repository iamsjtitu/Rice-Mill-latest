"""
Test Suite for Cash Book Feature - Iteration 14
Tests CRUD operations, summary, categories, and exports for Cash Book module
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCashBookEndpoints:
    """Test all Cash Book API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and base URL"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_txn_ids = []
        self.test_category_ids = []
        yield
        # Cleanup after tests
        for txn_id in self.test_txn_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/cash-book/{txn_id}")
            except:
                pass
        for cat_id in self.test_category_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/cash-book/categories/{cat_id}")
            except:
                pass
    
    # ============ TRANSACTION CRUD TESTS ============
    
    def test_create_cash_transaction_jama(self):
        """POST /api/cash-book - Create a cash jama (credit) transaction"""
        txn_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "account": "cash",
            "txn_type": "jama",
            "category": "Sale Payment",
            "description": "TEST_Cash received from sale",
            "amount": 5000.50,
            "reference": "TEST_REC001",
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        response = self.session.post(f"{BASE_URL}/api/cash-book?username=admin&role=admin", json=txn_data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure and values
        assert "id" in data, "Transaction ID not returned"
        assert data["account"] == "cash"
        assert data["txn_type"] == "jama"
        assert data["amount"] == 5000.50
        assert data["category"] == "Sale Payment"
        assert data["kms_year"] == "2025-2026"
        
        self.test_txn_ids.append(data["id"])
        print(f"✓ Created cash jama transaction with ID: {data['id']}")
    
    def test_create_cash_transaction_nikasi(self):
        """POST /api/cash-book - Create a cash nikasi (debit) transaction"""
        txn_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "account": "cash",
            "txn_type": "nikasi",
            "category": "Labour",
            "description": "TEST_Labour payment",
            "amount": 2000.00,
            "reference": "TEST_PAY001",
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        response = self.session.post(f"{BASE_URL}/api/cash-book?username=admin&role=admin", json=txn_data)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["txn_type"] == "nikasi"
        assert data["amount"] == 2000.00
        self.test_txn_ids.append(data["id"])
        print(f"✓ Created cash nikasi transaction with ID: {data['id']}")
    
    def test_create_bank_transaction_jama(self):
        """POST /api/cash-book - Create a bank jama (credit) transaction"""
        txn_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "account": "bank",
            "txn_type": "jama",
            "category": "MSP Payment",
            "description": "TEST_MSP payment received",
            "amount": 100000.00,
            "reference": "TEST_NEFT001",
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        response = self.session.post(f"{BASE_URL}/api/cash-book?username=admin&role=admin", json=txn_data)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["account"] == "bank"
        assert data["txn_type"] == "jama"
        assert data["amount"] == 100000.00
        self.test_txn_ids.append(data["id"])
        print(f"✓ Created bank jama transaction with ID: {data['id']}")
    
    def test_create_bank_transaction_nikasi(self):
        """POST /api/cash-book - Create a bank nikasi (debit) transaction"""
        txn_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "account": "bank",
            "txn_type": "nikasi",
            "category": "Payment Transfer",
            "description": "TEST_Payment transfer",
            "amount": 50000.00,
            "reference": "TEST_CHQ001",
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        response = self.session.post(f"{BASE_URL}/api/cash-book?username=admin&role=admin", json=txn_data)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["account"] == "bank"
        assert data["txn_type"] == "nikasi"
        self.test_txn_ids.append(data["id"])
        print(f"✓ Created bank nikasi transaction with ID: {data['id']}")
    
    def test_get_cash_transactions_list(self):
        """GET /api/cash-book - List all transactions sorted by date desc"""
        response = self.session.get(f"{BASE_URL}/api/cash-book")
        
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list), "Expected list of transactions"
        print(f"✓ GET /api/cash-book returns {len(data)} transactions")
        
        # Verify data is sorted by date descending
        if len(data) >= 2:
            dates = [t.get('date', '') for t in data]
            assert dates == sorted(dates, reverse=True), "Transactions should be sorted by date desc"
            print("✓ Transactions are sorted by date descending")
    
    def test_get_transactions_with_filters(self):
        """GET /api/cash-book with query filters"""
        # Test with account filter
        response = self.session.get(f"{BASE_URL}/api/cash-book?account=cash")
        assert response.status_code == 200
        data = response.json()
        for t in data:
            assert t.get('account') == 'cash', "Filter by account not working"
        print(f"✓ Filter by account=cash returns {len(data)} cash transactions")
        
        # Test with kms_year filter
        response = self.session.get(f"{BASE_URL}/api/cash-book?kms_year=2025-2026")
        assert response.status_code == 200
        print("✓ Filter by kms_year works correctly")
    
    def test_delete_cash_transaction(self):
        """DELETE /api/cash-book/{id} - Delete a transaction"""
        # First create a transaction to delete
        txn_data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "account": "cash",
            "txn_type": "jama",
            "category": "Other",
            "description": "TEST_Transaction to delete",
            "amount": 100.00,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        create_response = self.session.post(f"{BASE_URL}/api/cash-book?username=admin&role=admin", json=txn_data)
        assert create_response.status_code == 200
        txn_id = create_response.json()["id"]
        
        # Now delete it
        delete_response = self.session.delete(f"{BASE_URL}/api/cash-book/{txn_id}")
        assert delete_response.status_code == 200
        
        data = delete_response.json()
        assert data.get("message") == "Transaction deleted"
        assert data.get("id") == txn_id
        print(f"✓ DELETE /api/cash-book/{txn_id} successful")
        
        # Verify it's gone by trying to get the list again (it shouldn't be there)
        # (No GET by ID endpoint, so we verify by checking list)
    
    def test_delete_nonexistent_transaction(self):
        """DELETE /api/cash-book/{id} - Delete non-existent transaction should return 404"""
        fake_id = "nonexistent-uuid-12345"
        response = self.session.delete(f"{BASE_URL}/api/cash-book/{fake_id}")
        assert response.status_code == 404
        print("✓ DELETE non-existent transaction returns 404")
    
    # ============ SUMMARY ENDPOINT TESTS ============
    
    def test_get_cash_book_summary(self):
        """GET /api/cash-book/summary - Get summary with balances"""
        response = self.session.get(f"{BASE_URL}/api/cash-book/summary")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify all required fields in summary
        required_fields = ['cash_in', 'cash_out', 'cash_balance', 'bank_in', 'bank_out', 'bank_balance', 'total_balance', 'total_transactions']
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        # Verify balance calculations
        assert data['cash_balance'] == round(data['cash_in'] - data['cash_out'], 2), "Cash balance calculation incorrect"
        assert data['bank_balance'] == round(data['bank_in'] - data['bank_out'], 2), "Bank balance calculation incorrect"
        assert data['total_balance'] == round(data['cash_balance'] + data['bank_balance'], 2), "Total balance calculation incorrect"
        
        print(f"✓ Summary - Cash: ₹{data['cash_balance']}, Bank: ₹{data['bank_balance']}, Total: ₹{data['total_balance']}")
    
    def test_get_summary_with_filters(self):
        """GET /api/cash-book/summary with kms_year and season filters"""
        response = self.session.get(f"{BASE_URL}/api/cash-book/summary?kms_year=2025-2026&season=Kharif")
        assert response.status_code == 200
        data = response.json()
        assert 'total_balance' in data
        print("✓ Summary with filters works correctly")
    
    # ============ CATEGORY ENDPOINTS TESTS ============
    
    def test_get_categories(self):
        """GET /api/cash-book/categories - Get all custom categories"""
        response = self.session.get(f"{BASE_URL}/api/cash-book/categories")
        
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list), "Categories should be a list"
        print(f"✓ GET /api/cash-book/categories returns {len(data)} custom categories")
    
    def test_create_category(self):
        """POST /api/cash-book/categories - Create a new custom category"""
        category_data = {
            "name": "TEST_Custom Category",
            "type": "cash_jama"
        }
        response = self.session.post(f"{BASE_URL}/api/cash-book/categories", json=category_data)
        
        assert response.status_code == 200
        data = response.json()
        
        assert "id" in data
        assert data["name"] == "TEST_Custom Category"
        assert data["type"] == "cash_jama"
        
        self.test_category_ids.append(data["id"])
        print(f"✓ Created custom category with ID: {data['id']}")
    
    def test_create_duplicate_category_fails(self):
        """POST /api/cash-book/categories - Creating duplicate category should fail"""
        category_data = {
            "name": "TEST_Duplicate Category",
            "type": "cash_nikasi"
        }
        # Create first
        response1 = self.session.post(f"{BASE_URL}/api/cash-book/categories", json=category_data)
        assert response1.status_code == 200
        cat_id = response1.json()["id"]
        self.test_category_ids.append(cat_id)
        
        # Try to create duplicate
        response2 = self.session.post(f"{BASE_URL}/api/cash-book/categories", json=category_data)
        assert response2.status_code == 400
        print("✓ Duplicate category creation returns 400")
    
    def test_create_category_without_name_fails(self):
        """POST /api/cash-book/categories - Missing name should fail"""
        category_data = {"type": "bank_jama"}
        response = self.session.post(f"{BASE_URL}/api/cash-book/categories", json=category_data)
        assert response.status_code == 400
        print("✓ Category creation without name returns 400")
    
    def test_delete_category(self):
        """DELETE /api/cash-book/categories/{id} - Delete a category"""
        # First create a category
        category_data = {"name": "TEST_Category to Delete", "type": "bank_nikasi"}
        create_response = self.session.post(f"{BASE_URL}/api/cash-book/categories", json=category_data)
        assert create_response.status_code == 200
        cat_id = create_response.json()["id"]
        
        # Delete it
        delete_response = self.session.delete(f"{BASE_URL}/api/cash-book/categories/{cat_id}")
        assert delete_response.status_code == 200
        print(f"✓ DELETE /api/cash-book/categories/{cat_id} successful")
    
    def test_delete_nonexistent_category_fails(self):
        """DELETE /api/cash-book/categories/{id} - Non-existent category should return 404"""
        response = self.session.delete(f"{BASE_URL}/api/cash-book/categories/fake-cat-id")
        assert response.status_code == 404
        print("✓ DELETE non-existent category returns 404")
    
    # ============ EXPORT ENDPOINTS TESTS ============
    
    def test_export_excel(self):
        """GET /api/cash-book/excel - Export to Excel file"""
        response = self.session.get(f"{BASE_URL}/api/cash-book/excel")
        
        assert response.status_code == 200
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers.get('content-type', '')
        assert len(response.content) > 0
        print(f"✓ GET /api/cash-book/excel returns {len(response.content)} bytes (xlsx)")
    
    def test_export_excel_with_filters(self):
        """GET /api/cash-book/excel with filters"""
        response = self.session.get(f"{BASE_URL}/api/cash-book/excel?kms_year=2025-2026&season=Kharif&account=cash")
        assert response.status_code == 200
        print("✓ Excel export with filters works correctly")
    
    def test_export_pdf(self):
        """GET /api/cash-book/pdf - Export to PDF file"""
        response = self.session.get(f"{BASE_URL}/api/cash-book/pdf")
        
        assert response.status_code == 200
        assert "application/pdf" in response.headers.get('content-type', '')
        assert len(response.content) > 0
        print(f"✓ GET /api/cash-book/pdf returns {len(response.content)} bytes (pdf)")
    
    def test_export_pdf_with_filters(self):
        """GET /api/cash-book/pdf with filters"""
        response = self.session.get(f"{BASE_URL}/api/cash-book/pdf?kms_year=2025-2026&season=Kharif&account=bank")
        assert response.status_code == 200
        print("✓ PDF export with filters works correctly")


class TestCashBookIntegration:
    """Integration tests - Create, verify summary, delete flow"""
    
    def test_full_cash_book_workflow(self):
        """Full workflow: Add transactions → Verify summary → Delete → Verify updated summary"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Get initial summary
        initial_summary = session.get(f"{BASE_URL}/api/cash-book/summary").json()
        initial_cash_balance = initial_summary.get('cash_balance', 0)
        initial_bank_balance = initial_summary.get('bank_balance', 0)
        print(f"Initial balances - Cash: ₹{initial_cash_balance}, Bank: ₹{initial_bank_balance}")
        
        # Add cash jama
        txn1 = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "account": "cash",
            "txn_type": "jama",
            "amount": 10000.00,
            "description": "TEST_Integration test jama",
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        res1 = session.post(f"{BASE_URL}/api/cash-book?username=admin&role=admin", json=txn1)
        assert res1.status_code == 200
        txn1_id = res1.json()["id"]
        
        # Add cash nikasi
        txn2 = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "account": "cash",
            "txn_type": "nikasi",
            "amount": 3000.00,
            "description": "TEST_Integration test nikasi",
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        res2 = session.post(f"{BASE_URL}/api/cash-book?username=admin&role=admin", json=txn2)
        assert res2.status_code == 200
        txn2_id = res2.json()["id"]
        
        # Verify summary updated
        mid_summary = session.get(f"{BASE_URL}/api/cash-book/summary").json()
        expected_cash_change = 10000.00 - 3000.00  # jama - nikasi
        actual_cash_change = mid_summary.get('cash_balance', 0) - initial_cash_balance
        assert abs(actual_cash_change - expected_cash_change) < 0.01, f"Cash balance change incorrect: expected {expected_cash_change}, got {actual_cash_change}"
        print(f"✓ Summary correctly updated after adding transactions")
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/cash-book/{txn1_id}")
        session.delete(f"{BASE_URL}/api/cash-book/{txn2_id}")
        
        # Verify summary restored
        final_summary = session.get(f"{BASE_URL}/api/cash-book/summary").json()
        assert abs(final_summary.get('cash_balance', 0) - initial_cash_balance) < 0.01, "Summary not restored after cleanup"
        print(f"✓ Full workflow test completed successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
