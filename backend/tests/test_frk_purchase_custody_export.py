"""
Test Suite for Mill Entry System - CMR Module Phase 2:
- FRK Purchases API (POST/GET/DELETE)
- FRK Stock API (purchased/used/available/total_cost)
- Milling Entry with frk_used_qntl (CMR = rice_qntl + frk_used_qntl)
- Paddy Custody Maintenance Register API
- Milling Report Excel/PDF Export APIs
- Paddy Custody Register Excel Export API
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("REACT_APP_BACKEND_URL not set in environment")

# Test data identifiers for cleanup
TEST_PREFIX = "TEST_FRK_CUSTODY_"

class TestFRKPurchaseAPI:
    """FRK Purchase CRUD operations"""
    
    @pytest.fixture
    def cleanup_frk_purchases(self):
        """Cleanup any test FRK purchases after test"""
        yield
        # Clean up test data
        try:
            res = requests.get(f"{BASE_URL}/api/frk-purchases")
            if res.status_code == 200:
                for p in res.json():
                    if p.get('party_name', '').startswith(TEST_PREFIX):
                        requests.delete(f"{BASE_URL}/api/frk-purchases/{p['id']}")
        except:
            pass
    
    def test_create_frk_purchase_auto_total(self, cleanup_frk_purchases):
        """POST /api/frk-purchases - creates FRK purchase with auto-calculated total_amount"""
        payload = {
            "date": "2025-01-15",
            "party_name": f"{TEST_PREFIX}Party1",
            "quantity_qntl": 20,
            "rate_per_qntl": 2500,
            "note": "Test FRK purchase",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        res = requests.post(f"{BASE_URL}/api/frk-purchases?username=admin&role=admin", json=payload)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        assert data["party_name"] == payload["party_name"]
        assert data["quantity_qntl"] == 20
        assert data["rate_per_qntl"] == 2500
        assert data["total_amount"] == 50000, f"Auto total should be 20 * 2500 = 50000, got {data['total_amount']}"
        assert "id" in data
        print(f"PASS: FRK purchase created with auto-calculated total_amount = {data['total_amount']}")
    
    def test_get_frk_purchases_with_filter(self, cleanup_frk_purchases):
        """GET /api/frk-purchases - lists with kms_year/season filter"""
        # Create test purchase
        payload = {
            "date": "2025-01-16",
            "party_name": f"{TEST_PREFIX}Party2",
            "quantity_qntl": 15,
            "rate_per_qntl": 2400,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        requests.post(f"{BASE_URL}/api/frk-purchases?username=admin&role=admin", json=payload)
        
        # Test with filter
        res = requests.get(f"{BASE_URL}/api/frk-purchases?kms_year=2024-25&season=Kharif")
        assert res.status_code == 200
        
        purchases = res.json()
        assert isinstance(purchases, list)
        # Check test purchase is in list
        found = [p for p in purchases if p.get('party_name') == payload['party_name']]
        assert len(found) > 0, "Created purchase not found in filtered list"
        print(f"PASS: GET with filter returned {len(purchases)} purchases")
    
    def test_delete_frk_purchase(self, cleanup_frk_purchases):
        """DELETE /api/frk-purchases/{id} - deletes FRK purchase"""
        # Create
        payload = {
            "date": "2025-01-17",
            "party_name": f"{TEST_PREFIX}ToDelete",
            "quantity_qntl": 10,
            "rate_per_qntl": 2000,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        create_res = requests.post(f"{BASE_URL}/api/frk-purchases?username=admin&role=admin", json=payload)
        assert create_res.status_code == 200
        purchase_id = create_res.json()["id"]
        
        # Delete
        del_res = requests.delete(f"{BASE_URL}/api/frk-purchases/{purchase_id}")
        assert del_res.status_code == 200
        
        # Verify deleted
        list_res = requests.get(f"{BASE_URL}/api/frk-purchases")
        purchases = list_res.json()
        found = [p for p in purchases if p.get('id') == purchase_id]
        assert len(found) == 0, "Deleted purchase should not be in list"
        print(f"PASS: FRK purchase deleted successfully")
    
    def test_delete_nonexistent_frk_purchase(self):
        """DELETE /api/frk-purchases/{id} - returns 404 for non-existent"""
        res = requests.delete(f"{BASE_URL}/api/frk-purchases/nonexistent-id-12345")
        assert res.status_code == 404, f"Expected 404, got {res.status_code}"
        print("PASS: DELETE non-existent returns 404")


class TestFRKStockAPI:
    """FRK Stock API - purchased/used/available/total_cost"""
    
    @pytest.fixture
    def setup_frk_stock_data(self):
        """Setup FRK purchases and milling entries for stock test"""
        # Create FRK purchases
        purchase1 = {
            "date": "2025-01-18",
            "party_name": f"{TEST_PREFIX}Stock1",
            "quantity_qntl": 20,
            "rate_per_qntl": 2500,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        purchase2 = {
            "date": "2025-01-19",
            "party_name": f"{TEST_PREFIX}Stock2",
            "quantity_qntl": 15,
            "rate_per_qntl": 2400,
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        p1_res = requests.post(f"{BASE_URL}/api/frk-purchases?username=admin&role=admin", json=purchase1)
        p2_res = requests.post(f"{BASE_URL}/api/frk-purchases?username=admin&role=admin", json=purchase2)
        
        p1_id = p1_res.json()["id"] if p1_res.status_code == 200 else None
        p2_id = p2_res.json()["id"] if p2_res.status_code == 200 else None
        
        # Create milling entry using FRK
        milling = {
            "date": "2025-01-20",
            "rice_type": "parboiled",
            "paddy_input_qntl": 50,
            "rice_percent": 52,
            "bran_percent": 5,
            "kunda_percent": 3,
            "broken_percent": 2,
            "kanki_percent": 1,
            "frk_used_qntl": 10,
            "kms_year": "2024-25",
            "season": "Kharif",
            "note": f"{TEST_PREFIX}Milling"
        }
        m_res = requests.post(f"{BASE_URL}/api/milling-entries?username=admin&role=admin", json=milling)
        m_id = m_res.json()["id"] if m_res.status_code == 200 else None
        
        yield {"p1_id": p1_id, "p2_id": p2_id, "m_id": m_id}
        
        # Cleanup
        if p1_id: requests.delete(f"{BASE_URL}/api/frk-purchases/{p1_id}")
        if p2_id: requests.delete(f"{BASE_URL}/api/frk-purchases/{p2_id}")
        if m_id: requests.delete(f"{BASE_URL}/api/milling-entries/{m_id}?username=admin&role=admin")
    
    def test_frk_stock_calculation(self, setup_frk_stock_data):
        """GET /api/frk-stock - returns purchased/used/available/total_cost"""
        res = requests.get(f"{BASE_URL}/api/frk-stock?kms_year=2024-25&season=Kharif")
        assert res.status_code == 200
        
        stock = res.json()
        assert "total_purchased_qntl" in stock
        assert "total_used_qntl" in stock
        assert "available_qntl" in stock
        assert "total_cost" in stock
        
        # Our test added 20 + 15 = 35 purchased, 10 used
        # But there might be other data, so just verify structure
        assert isinstance(stock["total_purchased_qntl"], (int, float))
        assert isinstance(stock["total_used_qntl"], (int, float))
        assert isinstance(stock["available_qntl"], (int, float))
        assert isinstance(stock["total_cost"], (int, float))
        
        # available = purchased - used
        expected_available = round(stock["total_purchased_qntl"] - stock["total_used_qntl"], 2)
        assert stock["available_qntl"] == expected_available, f"Available should be {expected_available}, got {stock['available_qntl']}"
        
        print(f"PASS: FRK Stock - Purchased: {stock['total_purchased_qntl']}Q, Used: {stock['total_used_qntl']}Q, Available: {stock['available_qntl']}Q, Cost: ₹{stock['total_cost']}")


class TestMillingEntryWithFRKFromStock:
    """Milling Entry with frk_used_qntl from stock"""
    
    @pytest.fixture
    def cleanup_milling(self):
        """Cleanup test milling entries"""
        created_ids = []
        yield created_ids
        for mid in created_ids:
            try:
                requests.delete(f"{BASE_URL}/api/milling-entries/{mid}?username=admin&role=admin")
            except:
                pass
    
    def test_create_milling_entry_with_frk_used(self, cleanup_milling):
        """POST /api/milling-entries - uses frk_used_qntl from stock, CMR = rice + frk"""
        payload = {
            "date": "2025-01-21",
            "rice_type": "parboiled",
            "paddy_input_qntl": 50,
            "rice_percent": 52,
            "bran_percent": 5,
            "kunda_percent": 3,
            "broken_percent": 2,
            "kanki_percent": 1,
            "frk_used_qntl": 10,  # FRK from stock
            "kms_year": "2024-25",
            "season": "Kharif",
            "note": f"{TEST_PREFIX}CMRTest"
        }
        
        res = requests.post(f"{BASE_URL}/api/milling-entries?username=admin&role=admin", json=payload)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        cleanup_milling.append(data["id"])
        
        # Verify calculations
        # rice_qntl = 50 * 52 / 100 = 26
        expected_rice_qntl = round(50 * 52 / 100, 2)
        assert data["rice_qntl"] == expected_rice_qntl, f"Rice QNTL should be {expected_rice_qntl}, got {data['rice_qntl']}"
        
        # CMR = rice_qntl + frk_used_qntl = 26 + 10 = 36
        expected_cmr = round(expected_rice_qntl + 10, 2)
        assert data["cmr_delivery_qntl"] == expected_cmr, f"CMR should be {expected_cmr}, got {data['cmr_delivery_qntl']}"
        
        # Outturn = CMR / paddy * 100 = 36 / 50 * 100 = 72%
        expected_outturn = round(expected_cmr / 50 * 100, 2)
        assert data["outturn_ratio"] == expected_outturn, f"Outturn should be {expected_outturn}%, got {data['outturn_ratio']}%"
        
        # husk_percent = 100 - (52 + 5 + 3 + 2 + 1) = 37%
        expected_husk = 100 - (52 + 5 + 3 + 2 + 1)
        assert data["husk_percent"] == expected_husk, f"Husk% should be {expected_husk}, got {data['husk_percent']}"
        
        print(f"PASS: Milling entry created - Rice: {data['rice_qntl']}Q, FRK: {data['frk_used_qntl']}Q, CMR: {data['cmr_delivery_qntl']}Q, Outturn: {data['outturn_ratio']}%")


class TestPaddyCustodyRegisterAPI:
    """Paddy Custody Maintenance Register API"""
    
    def test_paddy_custody_register_structure(self):
        """GET /api/paddy-custody-register - returns rows with received/issued/balance"""
        res = requests.get(f"{BASE_URL}/api/paddy-custody-register")
        assert res.status_code == 200
        
        register = res.json()
        assert "rows" in register
        assert "total_received" in register
        assert "total_issued" in register
        assert "final_balance" in register
        
        assert isinstance(register["rows"], list)
        assert isinstance(register["total_received"], (int, float))
        assert isinstance(register["total_issued"], (int, float))
        assert isinstance(register["final_balance"], (int, float))
        
        print(f"PASS: Paddy Custody Register - Received: {register['total_received']}Q, Issued: {register['total_issued']}Q, Balance: {register['final_balance']}Q")
    
    def test_paddy_custody_register_with_filter(self):
        """GET /api/paddy-custody-register with kms_year/season filter"""
        res = requests.get(f"{BASE_URL}/api/paddy-custody-register?kms_year=2024-25&season=Kharif")
        assert res.status_code == 200
        
        register = res.json()
        # Verify row structure if any rows exist
        if len(register["rows"]) > 0:
            row = register["rows"][0]
            assert "date" in row
            assert "type" in row  # 'received' or 'issued'
            assert "description" in row
            assert "received_qntl" in row
            assert "issued_qntl" in row
            assert "balance_qntl" in row
            print(f"PASS: Register row structure verified - {len(register['rows'])} rows")
        else:
            print("PASS: Register filter works (no data for filter)")
    
    def test_paddy_custody_balance_calculation(self):
        """Verify running balance calculation in custody register"""
        res = requests.get(f"{BASE_URL}/api/paddy-custody-register")
        assert res.status_code == 200
        
        register = res.json()
        rows = register["rows"]
        
        # Verify running balance
        running_balance = 0
        for i, row in enumerate(rows):
            running_balance += row["received_qntl"] - row["issued_qntl"]
            expected_balance = round(running_balance, 2)
            # Allow small floating point differences
            assert abs(row["balance_qntl"] - expected_balance) < 0.01, f"Row {i} balance mismatch: expected {expected_balance}, got {row['balance_qntl']}"
        
        # Final balance should match
        assert abs(register["final_balance"] - round(running_balance, 2)) < 0.01
        print(f"PASS: Running balance verified across {len(rows)} rows")


class TestMillingReportExport:
    """Milling Report Excel/PDF Export APIs"""
    
    def test_milling_report_excel_export(self):
        """GET /api/milling-report/excel - returns Excel file"""
        res = requests.get(f"{BASE_URL}/api/milling-report/excel")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        
        # Verify content type
        content_type = res.headers.get('Content-Type', '')
        assert 'spreadsheetml' in content_type or 'octet-stream' in content_type, f"Expected Excel content type, got {content_type}"
        
        # Verify content-disposition
        content_disp = res.headers.get('Content-Disposition', '')
        assert 'attachment' in content_disp, f"Expected attachment disposition, got {content_disp}"
        assert '.xlsx' in content_disp, f"Expected .xlsx filename, got {content_disp}"
        
        # Verify file size is non-empty
        assert len(res.content) > 0, "Excel file should not be empty"
        
        print(f"PASS: Milling report Excel export - {len(res.content)} bytes")
    
    def test_milling_report_excel_with_filter(self):
        """GET /api/milling-report/excel with kms_year/season filter"""
        res = requests.get(f"{BASE_URL}/api/milling-report/excel?kms_year=2024-25&season=Kharif")
        assert res.status_code == 200
        assert len(res.content) > 0
        print(f"PASS: Milling report Excel with filter - {len(res.content)} bytes")
    
    def test_milling_report_pdf_export(self):
        """GET /api/milling-report/pdf - returns PDF file"""
        res = requests.get(f"{BASE_URL}/api/milling-report/pdf")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        
        # Verify content type
        content_type = res.headers.get('Content-Type', '')
        assert 'pdf' in content_type, f"Expected PDF content type, got {content_type}"
        
        # Verify content-disposition
        content_disp = res.headers.get('Content-Disposition', '')
        assert 'attachment' in content_disp, f"Expected attachment disposition, got {content_disp}"
        assert '.pdf' in content_disp, f"Expected .pdf filename, got {content_disp}"
        
        # Verify file starts with PDF header
        assert res.content[:4] == b'%PDF', "PDF file should start with %PDF"
        
        print(f"PASS: Milling report PDF export - {len(res.content)} bytes")
    
    def test_milling_report_pdf_with_filter(self):
        """GET /api/milling-report/pdf with kms_year/season filter"""
        res = requests.get(f"{BASE_URL}/api/milling-report/pdf?kms_year=2024-25&season=Kharif")
        assert res.status_code == 200
        assert res.content[:4] == b'%PDF'
        print(f"PASS: Milling report PDF with filter - {len(res.content)} bytes")


class TestPaddyCustodyRegisterExport:
    """Paddy Custody Register Excel Export"""
    
    def test_custody_register_excel_export(self):
        """GET /api/paddy-custody-register/excel - returns Excel file"""
        res = requests.get(f"{BASE_URL}/api/paddy-custody-register/excel")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        
        # Verify content type
        content_type = res.headers.get('Content-Type', '')
        assert 'spreadsheetml' in content_type or 'octet-stream' in content_type, f"Expected Excel content type, got {content_type}"
        
        # Verify content-disposition
        content_disp = res.headers.get('Content-Disposition', '')
        assert 'attachment' in content_disp
        assert '.xlsx' in content_disp
        
        # Verify file is non-empty
        assert len(res.content) > 0
        
        print(f"PASS: Paddy custody register Excel export - {len(res.content)} bytes")
    
    def test_custody_register_excel_with_filter(self):
        """GET /api/paddy-custody-register/excel with kms_year/season filter"""
        res = requests.get(f"{BASE_URL}/api/paddy-custody-register/excel?kms_year=2024-25&season=Kharif")
        assert res.status_code == 200
        assert len(res.content) > 0
        print(f"PASS: Custody register Excel with filter - {len(res.content)} bytes")


class TestIntegrationFRKStockMillingCMR:
    """Integration test: FRK Purchase -> Milling Entry -> CMR calculation -> Stock update"""
    
    def test_full_frk_flow(self):
        """Full integration: create FRK purchase, use in milling, verify stock, verify CMR"""
        
        # Step 1: Create FRK purchase
        frk_purchase = {
            "date": "2025-01-22",
            "party_name": f"{TEST_PREFIX}Integration",
            "quantity_qntl": 25,
            "rate_per_qntl": 2500,
            "note": "Integration test",
            "kms_year": "2024-25",
            "season": "Kharif"
        }
        
        p_res = requests.post(f"{BASE_URL}/api/frk-purchases?username=admin&role=admin", json=frk_purchase)
        assert p_res.status_code == 200
        frk_id = p_res.json()["id"]
        
        try:
            # Step 2: Get initial FRK stock
            stock_before = requests.get(f"{BASE_URL}/api/frk-stock?kms_year=2024-25&season=Kharif").json()
            print(f"FRK Stock before milling: Purchased={stock_before['total_purchased_qntl']}, Used={stock_before['total_used_qntl']}, Available={stock_before['available_qntl']}")
            
            # Step 3: Create milling entry using FRK from stock
            milling = {
                "date": "2025-01-22",
                "rice_type": "parboiled",
                "paddy_input_qntl": 100,
                "rice_percent": 52,
                "bran_percent": 5,
                "kunda_percent": 3,
                "broken_percent": 2,
                "kanki_percent": 1,
                "frk_used_qntl": 15,  # Use 15Q of FRK from stock
                "kms_year": "2024-25",
                "season": "Kharif",
                "note": f"{TEST_PREFIX}Integration"
            }
            
            m_res = requests.post(f"{BASE_URL}/api/milling-entries?username=admin&role=admin", json=milling)
            assert m_res.status_code == 200
            milling_data = m_res.json()
            milling_id = milling_data["id"]
            
            try:
                # Step 4: Verify CMR calculation
                # rice_qntl = 100 * 52% = 52Q
                # CMR = rice_qntl + frk_used_qntl = 52 + 15 = 67Q
                assert milling_data["rice_qntl"] == 52, f"Rice should be 52Q, got {milling_data['rice_qntl']}"
                assert milling_data["frk_used_qntl"] == 15, f"FRK used should be 15Q, got {milling_data['frk_used_qntl']}"
                assert milling_data["cmr_delivery_qntl"] == 67, f"CMR should be 67Q, got {milling_data['cmr_delivery_qntl']}"
                
                # Outturn = CMR / paddy * 100 = 67 / 100 * 100 = 67%
                assert milling_data["outturn_ratio"] == 67, f"Outturn should be 67%, got {milling_data['outturn_ratio']}"
                
                # Step 5: Verify FRK stock updated
                stock_after = requests.get(f"{BASE_URL}/api/frk-stock?kms_year=2024-25&season=Kharif").json()
                print(f"FRK Stock after milling: Purchased={stock_after['total_purchased_qntl']}, Used={stock_after['total_used_qntl']}, Available={stock_after['available_qntl']}")
                
                # Used should increase by 15
                expected_used = round(stock_before['total_used_qntl'] + 15, 2)
                assert stock_after['total_used_qntl'] == expected_used, f"Used should be {expected_used}, got {stock_after['total_used_qntl']}"
                
                # Available should decrease by 15
                expected_available = round(stock_before['available_qntl'] - 15, 2)
                assert stock_after['available_qntl'] == expected_available, f"Available should be {expected_available}, got {stock_after['available_qntl']}"
                
                print(f"PASS: Full FRK flow - Purchase: 25Q @ ₹2500, Milling used: 15Q, CMR: 67Q, Outturn: 67%")
                
            finally:
                # Cleanup milling entry
                requests.delete(f"{BASE_URL}/api/milling-entries/{milling_id}?username=admin&role=admin")
                
        finally:
            # Cleanup FRK purchase
            requests.delete(f"{BASE_URL}/api/frk-purchases/{frk_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
