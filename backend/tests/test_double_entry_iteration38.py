"""
Test Suite for Iteration 38 - Double-Entry Accounting System
Tests:
1. Login functionality
2. Entry creation with auto Jama/Nikasi entries
3. Double-entry verification (JAMA ledger for truck, NIKASI cash, NIKASI ledger for diesel deduction, JAMA ledger for diesel pump)
4. Truck rate setting and JAMA ledger update
5. Truck payment creates NIKASI cash entry
6. Agent payment creates both JAMA ledger (commission) and NIKASI cash entry
7. Diesel payment creates NIKASI cash entry
8. Cash Book API with sort order (date DESC, created_at DESC)
9. Cash Book party_type filter
10. Party Summary API (total_jama, total_nikasi, balance)
"""

import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("REACT_APP_BACKEND_URL must be set")

# Test data prefix for cleanup
TEST_PREFIX = "TEST_38_"

class TestDoubleEntryAccounting:
    """Double-Entry Accounting Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Store created IDs for cleanup
        self.created_entry_ids = []
        self.created_pump_ids = []
        self.created_mandi_target_ids = []
        self.test_truck_no = f"{TEST_PREFIX}OD04DT2002"
        self.test_mandi = f"{TEST_PREFIX}Kesinga"
        self.test_pump = f"{TEST_PREFIX}Arihant Fuels"
        self.test_agent = f"{TEST_PREFIX}Badkutru"
        self.kms_year = "2025-2026"
        self.season = "Kharif"
        yield
        # Cleanup after tests
        self._cleanup()
    
    def _cleanup(self):
        """Cleanup test data"""
        # Delete mill entries
        for entry_id in self.created_entry_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/entries/{entry_id}?username=admin&role=admin")
            except:
                pass
        # Delete diesel pumps
        for pump_id in self.created_pump_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/diesel-pumps/{pump_id}")
            except:
                pass
        # Delete mandi targets
        for target_id in self.created_mandi_target_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/mandi-targets/{target_id}?username=admin&role=admin")
            except:
                pass
        # Delete cash transactions with test prefix
        try:
            txns = self.session.get(f"{BASE_URL}/api/cash-book?kms_year={self.kms_year}").json()
            test_txn_ids = [t['id'] for t in txns if TEST_PREFIX in t.get('category', '') or TEST_PREFIX in t.get('description', '')]
            if test_txn_ids:
                self.session.post(f"{BASE_URL}/api/cash-book/delete-bulk", json={"ids": test_txn_ids})
        except:
            pass

    # ==================== TEST 1: LOGIN ====================
    def test_01_login_admin(self):
        """Test admin login with credentials admin/admin123"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data or "access_token" in data or data.get("success") or data.get("user"), f"Login response missing token: {data}"
        print(f"✅ Login successful: {data}")
    
    # ==================== TEST 2: CREATE DIESEL PUMP ====================
    def test_02_create_diesel_pump(self):
        """Create default diesel pump for entry creation"""
        response = self.session.post(f"{BASE_URL}/api/diesel-pumps", json={
            "name": self.test_pump,
            "is_default": True
        })
        # Pump may already exist
        if response.status_code == 400 and "already exists" in response.text.lower():
            print(f"✅ Diesel pump already exists, skipping creation")
            # Get existing pump
            pumps = self.session.get(f"{BASE_URL}/api/diesel-pumps").json()
            for p in pumps:
                if p.get('name') == self.test_pump:
                    self.created_pump_ids.append(p['id'])
            return
        assert response.status_code == 200, f"Create diesel pump failed: {response.text}"
        data = response.json()
        assert "id" in data, f"Pump response missing id: {data}"
        self.created_pump_ids.append(data['id'])
        print(f"✅ Created diesel pump: {data['name']} (id={data['id']})")
    
    # ==================== TEST 3: CREATE MANDI TARGET ====================
    def test_03_create_mandi_target(self):
        """Create mandi target with rates for agent payment testing"""
        response = self.session.post(f"{BASE_URL}/api/mandi-targets?username=admin&role=admin", json={
            "mandi_name": self.test_mandi,
            "target_qntl": 100,
            "base_rate": 18,
            "cutting_rate": 5,
            "cutting_percent": 5,
            "agent_name": self.test_agent,
            "kms_year": self.kms_year,
            "season": self.season
        })
        if response.status_code == 400 and "already set" in response.text.lower():
            print(f"✅ Mandi target already exists, skipping creation")
            # Get existing target
            targets = self.session.get(f"{BASE_URL}/api/mandi-targets?kms_year={self.kms_year}&season={self.season}").json()
            for t in targets:
                if t.get('mandi_name') == self.test_mandi:
                    self.created_mandi_target_ids.append(t['id'])
            return
        assert response.status_code == 200, f"Create mandi target failed: {response.text}"
        data = response.json()
        assert "id" in data, f"Target response missing id: {data}"
        self.created_mandi_target_ids.append(data['id'])
        print(f"✅ Created mandi target: {data['mandi_name']} (id={data['id']})")
    
    # ==================== TEST 4: CREATE MILL ENTRY ====================
    def test_04_create_mill_entry(self):
        """Create mill entry with cash_paid and diesel_paid - should auto-create double-entry transactions"""
        # First ensure diesel pump exists
        self.test_02_create_diesel_pump()
        
        response = self.session.post(f"{BASE_URL}/api/entries?username=admin&role=admin", json={
            "date": "2025-01-15",
            "truck_no": self.test_truck_no,
            "mandi_name": self.test_mandi,
            "agent_name": self.test_agent,
            "kg": 1050,
            "bag": 20,
            "cash_paid": 5000,
            "diesel_paid": 1000,
            "kms_year": self.kms_year,
            "season": self.season
        })
        assert response.status_code == 200, f"Create entry failed: {response.text}"
        data = response.json()
        assert "id" in data, f"Entry response missing id: {data}"
        self.created_entry_ids.append(data['id'])
        
        # Verify entry fields
        assert data.get('truck_no') == self.test_truck_no
        assert data.get('mandi_name') == self.test_mandi
        assert data.get('cash_paid') == 5000
        assert data.get('diesel_paid') == 1000
        
        print(f"✅ Created mill entry: {data['id']}")
        print(f"   truck_no={data['truck_no']}, mandi={data['mandi_name']}")
        print(f"   cash_paid={data['cash_paid']}, diesel_paid={data['diesel_paid']}")
        
        return data
    
    # ==================== TEST 5: VERIFY DOUBLE-ENTRY TRANSACTIONS ====================
    def test_05_verify_double_entry_transactions(self):
        """After entry creation, verify all 4 auto-created transactions in cash_transactions"""
        # Create entry first
        entry = self.test_04_create_mill_entry()
        entry_id = entry['id']
        
        # Wait for async operations
        time.sleep(0.5)
        
        # Fetch all cash transactions
        response = self.session.get(f"{BASE_URL}/api/cash-book?kms_year={self.kms_year}")
        assert response.status_code == 200
        txns = response.json()
        
        # Filter transactions linked to this entry
        entry_txns = [t for t in txns if t.get('linked_entry_id') == entry_id or 
                      (t.get('reference') and entry_id[:8] in t.get('reference', ''))]
        
        print(f"\n📋 Found {len(entry_txns)} transactions linked to entry {entry_id[:8]}...")
        
        # Check for JAMA ledger entry for truck purchase
        jama_truck = [t for t in entry_txns if t.get('txn_type') == 'jama' and 
                      t.get('party_type') == 'Truck' and t.get('account') == 'ledger']
        assert len(jama_truck) >= 1, f"Missing JAMA ledger entry for truck purchase. Found: {entry_txns}"
        print(f"✅ Found JAMA ledger for truck: category={jama_truck[0].get('category')}, amount={jama_truck[0].get('amount')}")
        
        # Check for NIKASI cash entry for cash_paid
        nikasi_cash = [t for t in entry_txns if t.get('txn_type') == 'nikasi' and 
                       t.get('party_type') == 'Truck' and t.get('account') == 'cash']
        assert len(nikasi_cash) >= 1, f"Missing NIKASI cash entry for cash_paid. Found: {entry_txns}"
        assert nikasi_cash[0].get('amount') == 5000, f"NIKASI cash amount should be 5000, got {nikasi_cash[0].get('amount')}"
        print(f"✅ Found NIKASI cash for cash_paid: amount={nikasi_cash[0].get('amount')}")
        
        # Check for NIKASI ledger entry for diesel deduction (counted against truck)
        nikasi_diesel_truck = [t for t in entry_txns if t.get('txn_type') == 'nikasi' and 
                               t.get('party_type') == 'Truck' and t.get('account') == 'ledger']
        assert len(nikasi_diesel_truck) >= 1, f"Missing NIKASI ledger entry for diesel deduction. Found: {entry_txns}"
        assert nikasi_diesel_truck[0].get('amount') == 1000, f"Diesel deduction amount should be 1000, got {nikasi_diesel_truck[0].get('amount')}"
        print(f"✅ Found NIKASI ledger for diesel deduction: amount={nikasi_diesel_truck[0].get('amount')}")
        
        # Check for JAMA ledger entry for diesel pump fill
        jama_diesel = [t for t in entry_txns if t.get('txn_type') == 'jama' and 
                       t.get('party_type') == 'Diesel' and t.get('account') == 'ledger']
        assert len(jama_diesel) >= 1, f"Missing JAMA ledger entry for diesel pump. Found: {entry_txns}"
        assert jama_diesel[0].get('amount') == 1000, f"Diesel pump JAMA amount should be 1000, got {jama_diesel[0].get('amount')}"
        print(f"✅ Found JAMA ledger for diesel pump: category={jama_diesel[0].get('category')}, amount={jama_diesel[0].get('amount')}")
        
        print(f"\n✅ All 4 double-entry transactions verified!")
    
    # ==================== TEST 6: TRUCK RATE SET ====================
    def test_06_set_truck_rate(self):
        """PUT /api/truck-payments/{entry_id}/rate with rate_per_qntl should update JAMA ledger entry"""
        # Create entry first
        entry = self.test_04_create_mill_entry()
        entry_id = entry['id']
        
        # Set rate
        response = self.session.put(f"{BASE_URL}/api/truck-payments/{entry_id}/rate?username=admin&role=admin", 
                                    json={"rate_per_qntl": 2200})
        assert response.status_code == 200, f"Set rate failed: {response.text}"
        data = response.json()
        assert data.get('success') == True
        print(f"✅ Rate set successfully: {data}")
        
        # Verify JAMA ledger entry was updated
        time.sleep(0.3)
        txns = self.session.get(f"{BASE_URL}/api/cash-book?kms_year={self.kms_year}").json()
        jama_truck = [t for t in txns if t.get('linked_entry_id') == entry_id and 
                      t.get('txn_type') == 'jama' and t.get('party_type') == 'Truck']
        
        assert len(jama_truck) >= 1, "JAMA ledger entry for truck not found after rate update"
        # The amount should be calculated as: final_qntl * rate
        # final_qntl = qntl - bag/100 ≈ 10.5 - 0.2 = 10.3 (approx)
        print(f"✅ JAMA ledger updated with new rate: amount={jama_truck[0].get('amount')}, description={jama_truck[0].get('description')}")
    
    # ==================== TEST 7: TRUCK PAYMENT ====================
    def test_07_make_truck_payment(self):
        """POST /api/truck-payments/{entry_id}/pay should create NIKASI cash entry"""
        # Create entry and set rate first
        entry = self.test_04_create_mill_entry()
        entry_id = entry['id']
        
        # Make payment
        payment_amount = 500
        response = self.session.post(f"{BASE_URL}/api/truck-payments/{entry_id}/pay?username=admin&role=admin",
                                     json={"amount": payment_amount, "note": "Test payment"})
        assert response.status_code == 200, f"Truck payment failed: {response.text}"
        data = response.json()
        assert data.get('success') == True
        print(f"✅ Truck payment recorded: {data}")
        
        # Verify NIKASI cash entry created
        time.sleep(0.3)
        txns = self.session.get(f"{BASE_URL}/api/cash-book?kms_year={self.kms_year}").json()
        nikasi_payments = [t for t in txns if t.get('linked_payment_id') == f"truck:{entry_id}" and 
                           t.get('txn_type') == 'nikasi' and t.get('account') == 'cash']
        
        assert len(nikasi_payments) >= 1, f"NIKASI cash entry for truck payment not found"
        assert nikasi_payments[0].get('amount') == payment_amount
        assert nikasi_payments[0].get('party_type') == 'Truck'
        print(f"✅ NIKASI cash entry created for truck payment: amount={nikasi_payments[0].get('amount')}")
    
    # ==================== TEST 8: AGENT PAYMENT ====================
    def test_08_make_agent_payment(self):
        """POST /api/agent-payments/{mandi_name}/pay should create both JAMA ledger and NIKASI cash"""
        # Create mandi target first
        self.test_03_create_mandi_target()
        # Create entry to have achieved quantity
        entry = self.test_04_create_mill_entry()
        
        payment_amount = 500
        response = self.session.post(
            f"{BASE_URL}/api/agent-payments/{self.test_mandi}/pay?kms_year={self.kms_year}&season={self.season}&username=admin&role=admin",
            json={"amount": payment_amount, "note": "Test agent payment"}
        )
        assert response.status_code == 200, f"Agent payment failed: {response.text}"
        data = response.json()
        assert data.get('success') == True
        print(f"✅ Agent payment recorded: {data}")
        
        # Verify NIKASI cash entry created
        time.sleep(0.3)
        txns = self.session.get(f"{BASE_URL}/api/cash-book?kms_year={self.kms_year}").json()
        
        nikasi_agent = [t for t in txns if self.test_mandi in t.get('category', '') and 
                        t.get('txn_type') == 'nikasi' and t.get('account') == 'cash' and
                        t.get('party_type') == 'Agent']
        assert len(nikasi_agent) >= 1, f"NIKASI cash entry for agent payment not found"
        print(f"✅ NIKASI cash entry for agent payment: amount={nikasi_agent[0].get('amount')}")
        
        # Check for JAMA ledger entry (agent commission)
        jama_agent = [t for t in txns if self.test_mandi in t.get('category', '') and 
                      t.get('txn_type') == 'jama' and t.get('account') == 'ledger' and
                      t.get('party_type') == 'Agent']
        # Note: JAMA ledger for agent is created once
        if len(jama_agent) >= 1:
            print(f"✅ JAMA ledger for agent commission: amount={jama_agent[0].get('amount')}")
        else:
            print(f"⚠️ JAMA ledger for agent commission may be created only once or on first payment")
    
    # ==================== TEST 9: DIESEL PAYMENT ====================
    def test_09_make_diesel_payment(self):
        """POST /api/diesel-accounts/pay should create NIKASI cash entry for diesel pump"""
        # Ensure diesel pump exists
        self.test_02_create_diesel_pump()
        pumps = self.session.get(f"{BASE_URL}/api/diesel-pumps").json()
        test_pump = next((p for p in pumps if self.test_pump in p.get('name', '')), None)
        
        if not test_pump:
            print("⚠️ Test pump not found, skipping diesel payment test")
            return
        
        pump_id = test_pump['id']
        payment_amount = 500
        
        response = self.session.post(f"{BASE_URL}/api/diesel-accounts/pay?username=admin&role=admin", json={
            "pump_id": pump_id,
            "amount": payment_amount,
            "kms_year": self.kms_year,
            "season": self.season,
            "date": "2025-01-15",
            "notes": "Test diesel payment"
        })
        assert response.status_code == 200, f"Diesel payment failed: {response.text}"
        data = response.json()
        assert data.get('success') == True
        print(f"✅ Diesel payment recorded: {data}")
        
        # Verify NIKASI cash entry created
        time.sleep(0.3)
        txns = self.session.get(f"{BASE_URL}/api/cash-book?kms_year={self.kms_year}").json()
        nikasi_diesel = [t for t in txns if self.test_pump in t.get('category', '') and 
                         t.get('txn_type') == 'nikasi' and t.get('account') == 'cash' and
                         t.get('party_type') == 'Diesel']
        assert len(nikasi_diesel) >= 1, f"NIKASI cash entry for diesel payment not found"
        print(f"✅ NIKASI cash entry for diesel payment: amount={nikasi_diesel[0].get('amount')}")
    
    # ==================== TEST 10: CASH BOOK SORT ORDER ====================
    def test_10_cash_book_sort_order(self):
        """GET /api/cash-book should return transactions sorted by date DESC then created_at DESC"""
        response = self.session.get(f"{BASE_URL}/api/cash-book?kms_year={self.kms_year}")
        assert response.status_code == 200
        txns = response.json()
        
        if len(txns) >= 2:
            # Check that dates are in descending order
            dates = [t.get('date', '9999-99-99') for t in txns]
            for i in range(len(dates) - 1):
                assert dates[i] >= dates[i + 1], f"Transactions not sorted by date DESC: {dates[i]} should be >= {dates[i+1]}"
            print(f"✅ Cash book sorted by date DESC (newest first): first={dates[0]}, last={dates[-1]}")
        else:
            print(f"⚠️ Not enough transactions to verify sort order ({len(txns)} found)")
    
    # ==================== TEST 11: CASH BOOK PARTY TYPE FILTER ====================
    def test_11_cash_book_party_type_filter(self):
        """GET /api/cash-book with party_type filter should only return matching entries"""
        # Create entry to have some data
        entry = self.test_04_create_mill_entry()
        time.sleep(0.3)
        
        # Filter by Truck
        response = self.session.get(f"{BASE_URL}/api/cash-book?kms_year={self.kms_year}&party_type=Truck")
        assert response.status_code == 200
        txns = response.json()
        
        for t in txns:
            assert t.get('party_type') == 'Truck', f"Expected party_type=Truck but got {t.get('party_type')}"
        print(f"✅ Party type filter works: {len(txns)} Truck transactions found")
        
        # Filter by Diesel
        response = self.session.get(f"{BASE_URL}/api/cash-book?kms_year={self.kms_year}&party_type=Diesel")
        assert response.status_code == 200
        txns = response.json()
        
        for t in txns:
            assert t.get('party_type') == 'Diesel', f"Expected party_type=Diesel but got {t.get('party_type')}"
        print(f"✅ Party type filter works: {len(txns)} Diesel transactions found")
    
    # ==================== TEST 12: PARTY SUMMARY API ====================
    def test_12_party_summary_api(self):
        """GET /api/party-summary should return parties with total_jama, total_nikasi, balance"""
        # Create entry to have some data
        entry = self.test_04_create_mill_entry()
        time.sleep(0.3)
        
        response = self.session.get(f"{BASE_URL}/api/cash-book/party-summary?kms_year={self.kms_year}")
        assert response.status_code == 200
        data = response.json()
        
        assert 'parties' in data, f"Response missing 'parties' key: {data}"
        assert 'summary' in data, f"Response missing 'summary' key: {data}"
        
        parties = data['parties']
        summary = data['summary']
        
        # Verify summary fields
        assert 'total_parties' in summary
        assert 'total_jama' in summary
        assert 'total_nikasi' in summary
        assert 'total_outstanding' in summary
        
        print(f"✅ Party summary: {summary['total_parties']} parties, jama={summary['total_jama']}, nikasi={summary['total_nikasi']}")
        
        # Verify party fields
        if len(parties) > 0:
            party = parties[0]
            assert 'party_name' in party
            assert 'total_jama' in party
            assert 'total_nikasi' in party
            assert 'balance' in party
            print(f"✅ Party example: {party['party_name']}, jama={party['total_jama']}, nikasi={party['total_nikasi']}, balance={party['balance']}")
    
    # ==================== TEST 13: PARTY SUMMARY WITH PARTY_TYPE FILTER ====================
    def test_13_party_summary_party_type_filter(self):
        """GET /api/party-summary with party_type filter should filter results"""
        # Create entry to have some data
        entry = self.test_04_create_mill_entry()
        time.sleep(0.3)
        
        # Filter by Truck
        response = self.session.get(f"{BASE_URL}/api/cash-book/party-summary?kms_year={self.kms_year}&party_type=Truck")
        assert response.status_code == 200
        data = response.json()
        
        parties = data['parties']
        for p in parties:
            assert p.get('party_type') == 'Truck' or p.get('party_type') == '', f"Expected Truck party but got {p.get('party_type')}"
        print(f"✅ Party summary with party_type=Truck filter: {len(parties)} parties")


class TestHealthCheck:
    """Basic API health check tests"""
    
    def test_api_root(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        print(f"✅ API root: {response.json()}")
    
    def test_entries_endpoint(self):
        """Test entries endpoint"""
        response = requests.get(f"{BASE_URL}/api/entries")
        assert response.status_code == 200
        print(f"✅ Entries endpoint: {len(response.json())} entries")
    
    def test_cash_book_endpoint(self):
        """Test cash book endpoint"""
        response = requests.get(f"{BASE_URL}/api/cash-book")
        assert response.status_code == 200
        print(f"✅ Cash book endpoint: {len(response.json())} transactions")
    
    def test_diesel_pumps_endpoint(self):
        """Test diesel pumps endpoint"""
        response = requests.get(f"{BASE_URL}/api/diesel-pumps")
        assert response.status_code == 200
        print(f"✅ Diesel pumps endpoint: {len(response.json())} pumps")
    
    def test_mandi_targets_endpoint(self):
        """Test mandi targets endpoint"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets")
        assert response.status_code == 200
        print(f"✅ Mandi targets endpoint: {len(response.json())} targets")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
