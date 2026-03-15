const fs = require('fs');
const localPartyRoutes = require('./routes/local_party');

// Mock database
const database = {
  data: {
    local_party_accounts: [],
    cash_transactions: []
  },
  save: () => console.log('Database saved')
};

// Create router
const router = localPartyRoutes(database);

// Helper to simulate request
function mockReq(method, url, body) {
  return { method, url, body, query: {}, params: {} };
}

function mockRes() {
  const res = {
    json: (data) => { res.data = data; return res; },
    status: (code) => { res.statusCode = code; return res; }
  };
  return res;
}

// Test Case 1: Settle Payment (Paid / Nikasi)
console.log('--- Test 1: Settle Payment (Paid) ---');
const req1 = mockReq('POST', '/api/local-party/settle', {
  party_name: 'Nabu', amount: 5000, type: 'paid', date: '2025-12-25'
});
const res1 = mockRes();
const handler = router.stack.find(r => r.route && r.route.path === '/api/local-party/settle').route.stack[0].handle;
handler(req1, res1);

console.log('Txn ID:', res1.data.txn_id);
const c1 = database.data.cash_transactions.find(t => t.linked_local_party_id === res1.data.txn_id && t.account === 'cash');
console.log('Cash Entry Type:', c1.txn_type); // Should be 'nikasi'

if (c1.txn_type === 'nikasi') console.log('SUCCESS: Paid = Nikasi');
else console.log('FAILURE: Paid != Nikasi');

// Test Case 2: Settle Receipt (Received / Jama)
console.log('\n--- Test 2: Settle Receipt (Received) ---');
const req2 = mockReq('POST', '/api/local-party/settle', {
  party_name: 'Nabu', amount: 2000, type: 'received', date: '2025-12-25'
});
const res2 = mockRes();
handler(req2, res2);

console.log('Txn ID:', res2.data.txn_id);
const c2 = database.data.cash_transactions.find(t => t.linked_local_party_id === res2.data.txn_id && t.account === 'cash');
console.log('Cash Entry Type:', c2.txn_type); // Should be 'jama'

if (c2.txn_type === 'jama') console.log('SUCCESS: Received = Jama');
else console.log('FAILURE: Received != Jama');
