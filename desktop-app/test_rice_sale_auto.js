const fs = require('fs');
const privateTradingRoutes = require('./routes/private_trading');

// Mock database
const database = {
  data: {
    private_paddy: [],
    rice_sales: [],
    cash_transactions: [],
    diesel_accounts: [],
    diesel_pumps: []
  },
  save: () => console.log('Database saved')
};

// Create router
const router = privateTradingRoutes(database);

// Helper to simulate request
function mockReq(method, url, body, query = {}) {
  return { method, url, body, query, params: {} };
}

function mockRes() {
  const res = {
    json: (data) => { res.data = data; return res; },
    status: (code) => { res.statusCode = code; return res; }
  };
  return res;
}

// Test Case 1: Create Rice Sale with Paid Amount
console.log('--- Test 1: Create Rice Sale ---');
const req1 = mockReq('POST', '/api/rice-sales', {
  party_name: 'Nabu',
  quantity_qntl: 10,
  rate_per_qntl: 3000,
  paid_amount: 5000,
  date: '2025-12-25'
});
const res1 = mockRes();

// Find the handler and execute
const handler1 = router.stack.find(r => r.route && r.route.path === '/api/rice-sales' && r.route.methods.post).route.stack[0].handle;
handler1(req1, res1);

console.log('Rice Sale Created:', res1.data.id);
console.log('Cash Transactions:', database.data.cash_transactions.length);
if (database.data.cash_transactions.length > 0) {
  console.log('Entry 1:', database.data.cash_transactions[0]);
  console.log('Entry 2:', database.data.cash_transactions[1]);
}

if (database.data.cash_transactions.length === 2 && 
    database.data.cash_transactions[0].amount === 5000 &&
    database.data.cash_transactions[0].category === 'Nabu') {
  console.log('SUCCESS: Auto cash entry created.');
} else {
  console.log('FAILURE: Auto cash entry missing or incorrect.');
  process.exit(1);
}

// Test Case 2: Update Rice Sale (Change Paid Amount)
console.log('\n--- Test 2: Update Rice Sale ---');
const id = res1.data.id;
const req2 = mockReq('PUT', '/api/rice-sales/:id', {
  party_name: 'Nabu',
  quantity_qntl: 10,
  rate_per_qntl: 3000,
  paid_amount: 10000, // Changed from 5000
  date: '2025-12-25'
});
req2.params.id = id;
const res2 = mockRes();

const handler2 = router.stack.find(r => r.route && r.route.path === '/api/rice-sales/:id' && r.route.methods.put).route.stack[0].handle;
handler2(req2, res2);

console.log('Rice Sale Updated:', res2.data.paid_amount);
console.log('Cash Transactions:', database.data.cash_transactions.length);
// Should still be 2 (old deleted, new created)
const txn = database.data.cash_transactions.find(t => t.linked_entry_id === id && t.account === 'cash');
console.log('Updated Cash Entry Amount:', txn ? txn.amount : 'Not Found');

if (txn && txn.amount === 10000) {
  console.log('SUCCESS: Auto cash entry updated.');
} else {
  console.log('FAILURE: Auto cash entry update failed.');
  process.exit(1);
}
