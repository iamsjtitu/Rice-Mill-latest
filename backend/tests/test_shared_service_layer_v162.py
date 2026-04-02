"""
Test Suite for Shared Service Layer Refactoring (v78.0.0) - Iteration 162
Tests: cashbook-service.js, hemali-service.js, staff-service.js shared modules
Tests: Web backend APIs (cash-book, quick-search, private-paddy)
"""
import pytest
import requests
import os
import subprocess
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSharedModulesDesktopApp:
    """Test shared modules load correctly in desktop-app"""
    
    def test_cashbook_service_exports(self):
        """Test cashbook-service.js exports all required functions"""
        result = subprocess.run(
            ['node', '-e', '''
const cs = require('./shared/cashbook-service.js');
const exports = Object.keys(cs);
const required = ['autoDetectPartyType', 'retroFixPartyType', 'createCashTxnSideEffects', 'deleteCashTxnSideEffects'];
const missing = required.filter(f => !exports.includes(f));
if (missing.length > 0) {
    console.log('FAIL: Missing exports:', missing.join(', '));
    process.exit(1);
}
console.log('PASS: All required exports present');
'''],
            cwd='/app/desktop-app',
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"cashbook-service.js failed: {result.stderr}"
        assert 'PASS' in result.stdout
    
    def test_hemali_service_exports(self):
        """Test hemali-service.js exports all required functions"""
        result = subprocess.run(
            ['node', '-e', '''
const hs = require('./shared/hemali-service.js');
const exports = Object.keys(hs);
const required = ['filterByFy', 'getAdvanceBalance', 'calcHemaliTotals', 'markHemaliPaidSideEffects', 'undoHemaliPaidSideEffects', 'deleteHemaliPaymentSideEffects'];
const missing = required.filter(f => !exports.includes(f));
if (missing.length > 0) {
    console.log('FAIL: Missing exports:', missing.join(', '));
    process.exit(1);
}
console.log('PASS: All required exports present');
'''],
            cwd='/app/desktop-app',
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"hemali-service.js failed: {result.stderr}"
        assert 'PASS' in result.stdout
    
    def test_staff_service_exports(self):
        """Test staff-service.js exports all required functions"""
        result = subprocess.run(
            ['node', '-e', '''
const ss = require('./shared/staff-service.js');
const exports = Object.keys(ss);
const required = ['calculateAdvanceBalance', 'createStaffAdvanceCashEntries', 'deleteStaffAdvanceCashEntries'];
const missing = required.filter(f => !exports.includes(f));
if (missing.length > 0) {
    console.log('FAIL: Missing exports:', missing.join(', '));
    process.exit(1);
}
console.log('PASS: All required exports present');
'''],
            cwd='/app/desktop-app',
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"staff-service.js failed: {result.stderr}"
        assert 'PASS' in result.stdout
    
    def test_autodetect_party_type_logic(self):
        """Test autoDetectPartyType correctly identifies party types"""
        result = subprocess.run(
            ['node', '-e', '''
const cs = require('./shared/cashbook-service.js');
const mockDb = {
  data: {
    cash_transactions: [{ category: 'Test Party', party_type: 'Cash Party' }],
    private_paddy: [{ party_name: 'Pvt Farmer' }],
    rice_sales: [{ party_name: 'Rice Buyer' }],
    diesel_accounts: [{ pump_name: 'HP Pump' }],
    local_party_accounts: [{ party_name: 'Local Vendor' }],
    truck_payments: [{ truck_no: 'OD-01-1234' }],
    mandi_targets: [{ mandi_name: 'Kesinga Mandi' }],
    staff: [{ name: 'Ramesh', active: true }]
  }
};
const tests = [
  ['Pvt Farmer', 'Pvt Paddy Purchase'],
  ['Rice Buyer', 'Rice Sale'],
  ['HP Pump', 'Diesel'],
  ['Local Vendor', 'Local Party'],
  ['OD-01-1234', 'Truck'],
  ['Kesinga Mandi', 'Agent'],
  ['Ramesh', 'Staff'],
  ['Unknown', 'Cash Party']
];
let passed = 0;
for (const [input, expected] of tests) {
  const result = cs.autoDetectPartyType(mockDb, input);
  if (result === expected) passed++;
  else console.log('FAIL:', input, 'expected', expected, 'got', result);
}
if (passed === tests.length) console.log('PASS: All party type detections correct');
else process.exit(1);
'''],
            cwd='/app/desktop-app',
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"autoDetectPartyType failed: {result.stderr}"
        assert 'PASS' in result.stdout
    
    def test_hemali_advance_balance_calculation(self):
        """Test getAdvanceBalance calculates correct sardar advance"""
        result = subprocess.run(
            ['node', '-e', '''
const hs = require('./shared/hemali-service.js');
const payments = [
  { sardar_name: 'Sardar A', status: 'paid', new_advance: 500, advance_deducted: 200 },
  { sardar_name: 'Sardar A', status: 'paid', new_advance: 300, advance_deducted: 100 },
  { sardar_name: 'Sardar B', status: 'paid', new_advance: 1000, advance_deducted: 0 }
];
const advA = hs.getAdvanceBalance(payments, 'Sardar A');
const advB = hs.getAdvanceBalance(payments, 'Sardar B');
// Sardar A: (500-200) + (300-100) = 500
// Sardar B: 1000-0 = 1000
if (advA === 500 && advB === 1000) {
  console.log('PASS: Advance balance calculations correct');
} else {
  console.log('FAIL: Expected A=500, B=1000, got A=' + advA + ', B=' + advB);
  process.exit(1);
}
'''],
            cwd='/app/desktop-app',
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"getAdvanceBalance failed: {result.stderr}"
        assert 'PASS' in result.stdout
    
    def test_staff_advance_balance_calculation(self):
        """Test calculateAdvanceBalance returns correct balance"""
        result = subprocess.run(
            ['node', '-e', '''
const ss = require('./shared/staff-service.js');
const mockDb = {
  data: {
    staff_advances: [
      { staff_id: 'staff1', amount: 5000, kms_year: '2025-2026', season: 'Kharif' },
      { staff_id: 'staff1', amount: 3000, kms_year: '2025-2026', season: 'Kharif' }
    ],
    staff_payments: [
      { staff_id: 'staff1', advance_deducted: 2000, kms_year: '2025-2026', season: 'Kharif' }
    ]
  }
};
const balance = ss.calculateAdvanceBalance(mockDb, 'staff1', '2025-2026', 'Kharif');
// total_advance = 8000, total_deducted = 2000, balance = 6000
if (balance.balance === 6000 && balance.total_advance === 8000 && balance.total_deducted === 2000) {
  console.log('PASS: Staff advance balance calculation correct');
} else {
  console.log('FAIL: Expected balance=6000, got', JSON.stringify(balance));
  process.exit(1);
}
'''],
            cwd='/app/desktop-app',
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"calculateAdvanceBalance failed: {result.stderr}"
        assert 'PASS' in result.stdout


class TestSharedModulesLocalServer:
    """Test shared modules load correctly in local-server"""
    
    def test_all_shared_modules_load(self):
        """Test all shared modules load without errors in local-server"""
        result = subprocess.run(
            ['node', '-e', '''
const modules = ['cashbook-service', 'hemali-service', 'staff-service', 'payment-service', 'paddy-calc', 'party-helpers'];
let passed = 0;
for (const m of modules) {
  try {
    require('./shared/' + m + '.js');
    passed++;
  } catch (e) {
    console.log('FAIL:', m, e.message);
  }
}
if (passed === modules.length) console.log('PASS: All', modules.length, 'shared modules loaded');
else process.exit(1);
'''],
            cwd='/app/local-server',
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"local-server shared modules failed: {result.stderr}"
        assert 'PASS' in result.stdout


class TestRouteFilesLoad:
    """Test route files load correctly with shared modules"""
    
    def test_desktop_app_routes_load(self):
        """Test all 11 route files load in desktop-app"""
        result = subprocess.run(
            ['node', '-e', '''
const routes = ['cashbook', 'hemali', 'staff', 'private_trading', 'payments', 'diesel', 'entries', 'milling', 'salebook', 'truck_lease', 'local_party'];
let passed = 0;
for (const r of routes) {
  try {
    require('./routes/' + r + '.js');
    passed++;
  } catch (e) {
    console.log('FAIL:', r, e.message);
  }
}
if (passed === routes.length) console.log('PASS: All', routes.length, 'routes loaded');
else process.exit(1);
'''],
            cwd='/app/desktop-app',
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"desktop-app routes failed: {result.stderr}"
        assert 'PASS' in result.stdout
    
    def test_local_server_routes_load(self):
        """Test all 11 route files load in local-server"""
        result = subprocess.run(
            ['node', '-e', '''
const routes = ['cashbook', 'hemali', 'staff', 'private_trading', 'payments', 'diesel', 'entries', 'milling', 'salebook', 'truck_lease', 'local_party'];
let passed = 0;
for (const r of routes) {
  try {
    require('./routes/' + r + '.js');
    passed++;
  } catch (e) {
    console.log('FAIL:', r, e.message);
  }
}
if (passed === routes.length) console.log('PASS: All', routes.length, 'routes loaded');
else process.exit(1);
'''],
            cwd='/app/local-server',
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"local-server routes failed: {result.stderr}"
        assert 'PASS' in result.stdout


class TestRouteFileParity:
    """Test route file parity between desktop-app and local-server"""
    
    def test_shared_folder_parity(self):
        """Test shared/ folder is identical between desktop-app and local-server"""
        result = subprocess.run(
            ['diff', '-rq', '/app/desktop-app/shared/', '/app/local-server/shared/'],
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"shared/ folders differ: {result.stdout}"
    
    def test_route_files_parity(self):
        """Test route files are identical (except local-server extras)"""
        result = subprocess.run(
            ['diff', '-rq', '/app/desktop-app/routes/', '/app/local-server/routes/'],
            capture_output=True,
            text=True
        )
        # local-server has 2 extra files: cmr_exports.js and ledgers.js
        # These are expected differences
        if result.returncode != 0:
            lines = result.stdout.strip().split('\n')
            unexpected = [l for l in lines if 'cmr_exports.js' not in l and 'ledgers.js' not in l]
            assert len(unexpected) == 0, f"Unexpected route file differences: {unexpected}"


class TestWebBackendAPIs:
    """Test web backend APIs work correctly"""
    
    def test_cash_book_get(self):
        """Test GET /api/cash-book returns transactions"""
        response = requests.get(f"{BASE_URL}/api/cash-book?page_size=5")
        assert response.status_code == 200
        data = response.json()
        assert 'transactions' in data
        assert 'total' in data
    
    def test_cash_book_post_auto_party_type(self):
        """Test POST /api/cash-book creates transaction with auto-detected party_type"""
        payload = {
            "date": "2026-04-02",
            "account": "cash",
            "txn_type": "nikasi",
            "category": "TEST_Party_162",
            "description": "Test transaction for iteration 162",
            "amount": 500,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/cash-book", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert 'id' in data
        assert data['amount'] == 500
        assert 'party_type' in data  # Should be auto-detected
    
    def test_quick_search(self):
        """Test GET /api/quick-search returns results"""
        response = requests.get(f"{BASE_URL}/api/quick-search?q=test&limit=5")
        assert response.status_code == 200
        data = response.json()
        assert 'results' in data
        assert 'total' in data
    
    def test_private_paddy_post(self):
        """Test POST /api/private-paddy creates entry with cash entries"""
        payload = {
            "date": "2026-04-02",
            "party_name": "TEST_Farmer_162",
            "mandi_name": "TestMandi",
            "kg": 500,
            "rate_per_qntl": 2000,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        response = requests.post(f"{BASE_URL}/api/private-paddy", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert 'id' in data
        assert data['party_name'] == "TEST_Farmer_162"
        assert 'total_amount' in data
        assert 'balance' in data
    
    def test_private_paddy_get(self):
        """Test GET /api/private-paddy returns entries"""
        response = requests.get(f"{BASE_URL}/api/private-paddy?page_size=5")
        assert response.status_code == 200
        data = response.json()
        assert 'entries' in data or isinstance(data, list)


class TestFrontendLoads:
    """Test frontend loads correctly"""
    
    def test_frontend_accessible(self):
        """Test frontend is accessible"""
        response = requests.get(BASE_URL)
        assert response.status_code == 200
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/session-status")
        assert response.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
