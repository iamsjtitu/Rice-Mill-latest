"""
Test suite for Local Party Payment feature (Iteration 26)
Tests local party accounts, manual purchases, settlements, cash book integration,
mill parts stock edit, and exports.
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://v27-stable.preview.emergentagent.com').rstrip('/')

class TestLogin:
    """Verify admin login works"""
    
    def test_admin_login(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin", "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "username" in data
        assert data["username"] == "admin"
        assert data["role"] == "admin"
        print("Admin login: PASS")


class TestLocalPartySummary:
    """Test GET /api/local-party/summary endpoint"""
    
    def test_get_summary_returns_parties(self):
        """Summary should return party-wise balances"""
        response = requests.get(f"{BASE_URL}/api/local-party/summary", params={
            "kms_year": "2024-25", "season": "Kharif"
        })
        assert response.status_code == 200
        data = response.json()
        assert "parties" in data
        assert "grand_total_debit" in data
        assert "grand_total_paid" in data
        assert "grand_balance" in data
        print(f"Summary: {len(data['parties'])} parties, Grand Balance: Rs.{data['grand_balance']}")
        
    def test_summary_party_structure(self):
        """Each party should have required fields"""
        response = requests.get(f"{BASE_URL}/api/local-party/summary")
        data = response.json()
        if data["parties"]:
            party = data["parties"][0]
            assert "party_name" in party
            assert "total_debit" in party
            assert "total_paid" in party
            assert "balance" in party
            assert "txn_count" in party
            print(f"Party structure verified: {party['party_name']} - Balance Rs.{party['balance']}")


class TestLocalPartyTransactions:
    """Test GET /api/local-party/transactions endpoint"""
    
    def test_get_all_transactions(self):
        """Should return all transactions"""
        response = requests.get(f"{BASE_URL}/api/local-party/transactions", params={
            "kms_year": "2024-25", "season": "Kharif"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Got {len(data)} transactions")
        
    def test_filter_by_party_name(self):
        """Filter transactions by party name"""
        response = requests.get(f"{BASE_URL}/api/local-party/transactions", params={
            "party_name": "Bicky"
        })
        assert response.status_code == 200
        data = response.json()
        for txn in data:
            assert txn["party_name"].lower() == "bicky"
        print(f"Filtered: {len(data)} Bicky transactions")
        
    def test_transaction_structure(self):
        """Transaction should have required fields"""
        response = requests.get(f"{BASE_URL}/api/local-party/transactions")
        data = response.json()
        if data:
            txn = data[0]
            required = ["id", "date", "party_name", "txn_type", "amount", "source_type"]
            for field in required:
                assert field in txn, f"Missing field: {field}"
            print(f"Transaction structure verified: {txn['party_name']} - {txn['txn_type']} Rs.{txn['amount']}")


class TestManualPurchase:
    """Test POST /api/local-party/manual endpoint"""
    
    def test_add_manual_purchase(self):
        """Add manual purchase (debit) entry"""
        test_party = f"TestParty_{uuid.uuid4().hex[:6]}"
        response = requests.post(f"{BASE_URL}/api/local-party/manual", json={
            "party_name": test_party,
            "amount": 500,
            "date": "2025-02-20",
            "description": "Test manual purchase",
            "kms_year": "2024-25",
            "season": "Kharif",
            "created_by": "test"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["party_name"] == test_party
        assert data["amount"] == 500
        assert data["txn_type"] == "debit"
        assert data["source_type"] == "manual"
        print(f"Manual purchase added: {test_party} - Rs.500")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/local-party/{data['id']}")
        
    def test_manual_purchase_validation(self):
        """Should reject invalid amount"""
        response = requests.post(f"{BASE_URL}/api/local-party/manual", json={
            "party_name": "Test",
            "amount": 0
        })
        assert response.status_code == 400
        print("Validation for zero amount: PASS")


class TestLocalPartySettlement:
    """Test POST /api/local-party/settle endpoint"""
    
    def test_settle_creates_payment_and_cashbook(self):
        """Settlement should create payment entry AND cash book nikasi"""
        # First create a manual purchase to settle
        test_party = f"SettleTest_{uuid.uuid4().hex[:6]}"
        manual = requests.post(f"{BASE_URL}/api/local-party/manual", json={
            "party_name": test_party,
            "amount": 1000,
            "date": "2025-02-20",
            "kms_year": "2024-25",
            "season": "Kharif"
        })
        assert manual.status_code == 200
        
        # Now settle partial amount
        settle = requests.post(f"{BASE_URL}/api/local-party/settle", json={
            "party_name": test_party,
            "amount": 500,
            "date": "2025-02-21",
            "notes": "Test settlement",
            "kms_year": "2024-25",
            "season": "Kharif",
            "created_by": "test"
        })
        assert settle.status_code == 200
        settle_data = settle.json()
        assert settle_data["success"] == True
        assert "txn_id" in settle_data
        print(f"Settlement created: {test_party} - Rs.500")
        
        # Verify local party transaction created
        txns = requests.get(f"{BASE_URL}/api/local-party/transactions", params={
            "party_name": test_party
        })
        txn_list = txns.json()
        payment_txn = [t for t in txn_list if t["txn_type"] == "payment"]
        assert len(payment_txn) >= 1
        assert payment_txn[0]["source_type"] == "settlement"
        print("Payment transaction verified: PASS")
        
        # Verify cash book entry created
        cb = requests.get(f"{BASE_URL}/api/cash-book", params={
            "kms_year": "2024-25", "season": "Kharif"
        })
        cb_data = cb.json()
        linked_cb = [c for c in cb_data if f"local_party:{settle_data['txn_id'][:8]}" in c.get("reference", "")]
        assert len(linked_cb) >= 1
        assert linked_cb[0]["txn_type"] == "nikasi"
        assert linked_cb[0]["category"] == "Local Party Payment"
        print("Cash Book nikasi entry verified: PASS")
        
        # Cleanup
        for t in txn_list:
            requests.delete(f"{BASE_URL}/api/local-party/{t['id']}")
            
    def test_settle_validation(self):
        """Should reject invalid settlement"""
        response = requests.post(f"{BASE_URL}/api/local-party/settle", json={
            "party_name": "",
            "amount": 100
        })
        assert response.status_code == 400
        print("Settlement validation: PASS")


class TestDeleteTransaction:
    """Test DELETE /api/local-party/{id} endpoint"""
    
    def test_delete_manual_transaction(self):
        """Delete manual transaction"""
        # Create
        test_party = f"DeleteTest_{uuid.uuid4().hex[:6]}"
        create = requests.post(f"{BASE_URL}/api/local-party/manual", json={
            "party_name": test_party,
            "amount": 200,
            "date": "2025-02-20"
        })
        txn_id = create.json()["id"]
        
        # Delete
        delete = requests.delete(f"{BASE_URL}/api/local-party/{txn_id}")
        assert delete.status_code == 200
        print(f"Deleted transaction: {txn_id}")
        
        # Verify gone
        verify = requests.get(f"{BASE_URL}/api/local-party/transactions", params={
            "party_name": test_party
        })
        assert len(verify.json()) == 0
        print("Delete verification: PASS")
        
    def test_delete_settlement_removes_cashbook(self):
        """Deleting settlement should also delete linked cash book entry"""
        # Create manual + settle
        test_party = f"DeleteSettle_{uuid.uuid4().hex[:6]}"
        requests.post(f"{BASE_URL}/api/local-party/manual", json={
            "party_name": test_party, "amount": 1000, "date": "2025-02-20",
            "kms_year": "2024-25", "season": "Kharif"
        })
        settle = requests.post(f"{BASE_URL}/api/local-party/settle", json={
            "party_name": test_party, "amount": 500, "date": "2025-02-21",
            "kms_year": "2024-25", "season": "Kharif"
        })
        
        # Get the payment transaction id
        txns = requests.get(f"{BASE_URL}/api/local-party/transactions", params={
            "party_name": test_party
        })
        payment_txn = [t for t in txns.json() if t["txn_type"] == "payment"][0]
        
        # Delete the settlement
        delete = requests.delete(f"{BASE_URL}/api/local-party/{payment_txn['id']}")
        assert delete.status_code == 200
        
        # Verify cash book entry also removed
        cb = requests.get(f"{BASE_URL}/api/cash-book", params={"kms_year": "2024-25"})
        linked = [c for c in cb.json() if payment_txn['id'] in c.get("linked_local_party_id", "")]
        assert len(linked) == 0
        print("Settlement delete cascades to cash book: PASS")
        
        # Cleanup remaining manual entry
        for t in requests.get(f"{BASE_URL}/api/local-party/transactions", params={"party_name": test_party}).json():
            requests.delete(f"{BASE_URL}/api/local-party/{t['id']}")


class TestExports:
    """Test Excel and PDF exports"""
    
    def test_excel_export(self):
        """GET /api/local-party/excel should return xlsx file"""
        response = requests.get(f"{BASE_URL}/api/local-party/excel", params={
            "kms_year": "2024-25", "season": "Kharif"
        })
        assert response.status_code == 200
        assert "spreadsheet" in response.headers.get("content-type", "").lower() or \
               "octet-stream" in response.headers.get("content-type", "").lower()
        assert len(response.content) > 0
        print(f"Excel export: {len(response.content)} bytes")
        
    def test_pdf_export(self):
        """GET /api/local-party/pdf should return pdf file"""
        response = requests.get(f"{BASE_URL}/api/local-party/pdf", params={
            "kms_year": "2024-25", "season": "Kharif"
        })
        assert response.status_code == 200
        assert "pdf" in response.headers.get("content-type", "").lower()
        assert len(response.content) > 0
        print(f"PDF export: {len(response.content)} bytes")


class TestMillPartsStockEdit:
    """Test PUT /api/mill-parts-stock/{id} endpoint"""
    
    def test_edit_mill_parts_stock_entry(self):
        """Edit should update entry and linked local party entry"""
        # First get existing parts
        parts = requests.get(f"{BASE_URL}/api/mill-parts").json()
        if not parts:
            # Create a test part
            requests.post(f"{BASE_URL}/api/mill-parts", json={
                "name": "TestPart", "category": "Test", "unit": "Pcs"
            })
            parts = requests.get(f"{BASE_URL}/api/mill-parts").json()
        
        part_name = parts[0]["name"]
        test_party = f"StockEditTest_{uuid.uuid4().hex[:6]}"
        
        # Create stock entry with party
        create = requests.post(f"{BASE_URL}/api/mill-parts-stock", json={
            "date": "2025-02-20",
            "part_name": part_name,
            "txn_type": "in",
            "quantity": 10,
            "rate": 100,
            "party_name": test_party,
            "kms_year": "2024-25",
            "season": "Kharif",
            "created_by": "test"
        })
        assert create.status_code == 200
        stock_id = create.json()["id"]
        print(f"Created stock entry: {stock_id}")
        
        # Verify local party entry created
        lp = requests.get(f"{BASE_URL}/api/local-party/transactions", params={
            "party_name": test_party
        })
        assert len(lp.json()) >= 1
        assert lp.json()[0]["amount"] == 1000  # 10 * 100
        print("Initial local party entry: Rs.1000")
        
        # Edit the stock entry
        edit = requests.put(f"{BASE_URL}/api/mill-parts-stock/{stock_id}", json={
            "date": "2025-02-21",
            "part_name": part_name,
            "txn_type": "in",
            "quantity": 15,
            "rate": 100,
            "party_name": test_party,
            "kms_year": "2024-25",
            "season": "Kharif"
        })
        assert edit.status_code == 200
        print(f"Edited stock entry: qty 10 -> 15")
        
        # Verify local party entry updated
        lp2 = requests.get(f"{BASE_URL}/api/local-party/transactions", params={
            "party_name": test_party
        })
        assert len(lp2.json()) >= 1
        assert lp2.json()[0]["amount"] == 1500  # 15 * 100
        print("Updated local party entry: Rs.1500 - PASS")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/mill-parts-stock/{stock_id}")


class TestMillPartsAutoCreateLocalParty:
    """Test POST /api/mill-parts-stock auto-creates local party entry"""
    
    def test_stock_in_with_party_creates_local_party(self):
        """Stock In with party_name should auto-create local party debit entry"""
        parts = requests.get(f"{BASE_URL}/api/mill-parts").json()
        if not parts:
            requests.post(f"{BASE_URL}/api/mill-parts", json={
                "name": "AutoTestPart", "category": "Test", "unit": "Pcs"
            })
            parts = requests.get(f"{BASE_URL}/api/mill-parts").json()
            
        test_party = f"AutoCreate_{uuid.uuid4().hex[:6]}"
        
        # Create stock entry
        create = requests.post(f"{BASE_URL}/api/mill-parts-stock", json={
            "date": "2025-02-22",
            "part_name": parts[0]["name"],
            "txn_type": "in",
            "quantity": 5,
            "rate": 200,
            "party_name": test_party,
            "kms_year": "2024-25",
            "season": "Kharif"
        })
        assert create.status_code == 200
        
        # Verify local party entry
        lp = requests.get(f"{BASE_URL}/api/local-party/transactions", params={
            "party_name": test_party
        })
        lp_data = lp.json()
        assert len(lp_data) >= 1
        assert lp_data[0]["source_type"] == "mill_part"
        assert lp_data[0]["amount"] == 1000  # 5 * 200
        print(f"Auto-created local party entry from mill parts: Rs.1000 - PASS")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/mill-parts-stock/{create.json()['id']}")


class TestSourceTypeBadges:
    """Verify source_type is correctly set for different sources"""
    
    def test_source_types(self):
        """Different sources should have correct source_type"""
        txns = requests.get(f"{BASE_URL}/api/local-party/transactions").json()
        source_types = set(t.get("source_type") for t in txns)
        print(f"Found source types: {source_types}")
        
        # Check valid source types
        valid_types = {"manual", "mill_part", "gunny_bag", "settlement"}
        for st in source_types:
            assert st in valid_types, f"Invalid source_type: {st}"
        print("Source type validation: PASS")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
