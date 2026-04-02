/**
 * SQLite Database Tests for Desktop App and Local Server
 * Tests the sqlite-database.js class functionality
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function test(name, fn) {
  try {
    fn();
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
    console.log(`✓ PASS: ${name}`);
  } catch (err) {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', error: err.message });
    console.log(`✗ FAIL: ${name} - ${err.message}`);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(condition, msg) {
  if (!condition) {
    throw new Error(msg || 'Assertion failed');
  }
}

// Create temp directory for tests
const testDir = path.join(os.tmpdir(), `sqlite-test-${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });
console.log(`Test directory: ${testDir}`);

// ============ DESKTOP APP TESTS ============
console.log('\n========== DESKTOP APP sqlite-database.js TESTS ==========\n');

let desktopDb;
try {
  const { SqliteDatabase } = require('/app/desktop-app/sqlite-database');
  
  test('Desktop: SqliteDatabase initializes correctly', () => {
    desktopDb = new SqliteDatabase(testDir);
    assertTrue(desktopDb !== null, 'Database should be created');
    assertTrue(fs.existsSync(path.join(testDir, 'millentry-data.db')), 'DB file should exist');
  });

  test('Desktop: getData("/settings") returns empty object for fresh DB', () => {
    const settings = desktopDb.getData('/settings');
    assertTrue(typeof settings === 'object', 'Settings should be an object');
    assertEqual(Object.keys(settings).length, 0, 'Fresh settings should be empty');
  });

  test('Desktop: push("/settings", {...}) saves and retrieves settings', () => {
    desktopDb.push('/settings', { test_key: 'test_value', another_key: 123 });
    desktopDb.saveImmediate();
    const settings = desktopDb.getData('/settings');
    assertEqual(settings.test_key, 'test_value', 'test_key should be saved');
    assertEqual(settings.another_key, 123, 'another_key should be saved');
  });

  test('Desktop: addEntry creates entry with calculated fields', () => {
    const entry = desktopDb.addEntry({
      date: '2025-01-15',
      truck_no: 'TEST-001',
      agent_name: 'Test Agent',
      mandi_name: 'Test Mandi',
      kg: 5000,
      bag: 50,
      g_deposite: 10,
      plastic_bag: 5,
      cutting_percent: 2,
      moisture: 18,
      kms_year: '2024-25',
      season: 'Kharif'
    });
    assertTrue(entry.id !== undefined, 'Entry should have ID');
    assertTrue(entry.qntl !== undefined, 'Entry should have calculated qntl');
    assertTrue(entry.mill_w !== undefined, 'Entry should have calculated mill_w');
    assertTrue(entry.final_w !== undefined, 'Entry should have calculated final_w');
    assertEqual(entry.qntl, 50, 'qntl should be kg/100');
  });

  test('Desktop: addEntry creates linked cash_transactions', () => {
    const cashTxns = desktopDb.data.cash_transactions.filter(t => t.linked_entry_id);
    assertTrue(cashTxns.length > 0, 'Should have linked cash transactions');
  });

  test('Desktop: updateEntry recalculates fields', () => {
    const entries = desktopDb.getEntries();
    const entryId = entries[0].id;
    const updated = desktopDb.updateEntry(entryId, {
      ...entries[0],
      kg: 6000,
      bag: 60
    });
    assertEqual(updated.qntl, 60, 'Updated qntl should be 60');
    assertTrue(updated.updated_at !== entries[0].created_at, 'updated_at should change');
  });

  test('Desktop: deleteEntry removes entry and linked records', () => {
    // Add a new entry to delete
    const entry = desktopDb.addEntry({
      date: '2025-01-16',
      truck_no: 'DELETE-TEST',
      kg: 1000,
      bag: 10,
      cash_paid: 500,
      diesel_paid: 200
    });
    const entryId = entry.id;
    
    // Verify linked records exist
    const cashBefore = desktopDb.data.cash_transactions.filter(t => t.linked_entry_id === entryId).length;
    assertTrue(cashBefore > 0, 'Should have linked cash transactions before delete');
    
    // Delete
    desktopDb.deleteEntry(entryId);
    
    // Verify entry and linked records are gone
    const entriesAfter = desktopDb.getEntries().filter(e => e.id === entryId);
    assertEqual(entriesAfter.length, 0, 'Entry should be deleted');
    
    const cashAfter = desktopDb.data.cash_transactions.filter(t => t.linked_entry_id === entryId).length;
    assertEqual(cashAfter, 0, 'Linked cash transactions should be deleted');
  });

  test('Desktop: bulkDeleteEntries removes multiple entries', () => {
    const e1 = desktopDb.addEntry({ date: '2025-01-17', truck_no: 'BULK-1', kg: 1000, bag: 10 });
    const e2 = desktopDb.addEntry({ date: '2025-01-17', truck_no: 'BULK-2', kg: 2000, bag: 20 });
    
    desktopDb.bulkDeleteEntries([e1.id, e2.id]);
    
    const remaining = desktopDb.getEntries().filter(e => e.truck_no.startsWith('BULK-'));
    assertEqual(remaining.length, 0, 'Bulk deleted entries should be gone');
  });

  test('Desktop: exportToJson returns valid JSON string', () => {
    const jsonStr = desktopDb.exportToJson();
    assertTrue(typeof jsonStr === 'string', 'Should return string');
    const parsed = JSON.parse(jsonStr);
    assertTrue(parsed.entries !== undefined, 'Should have entries array');
    assertTrue(parsed.branding !== undefined, 'Should have branding');
  });

  test('Desktop: importFromJson restores data', () => {
    const backup = desktopDb.exportToJson();
    
    // Add some data
    desktopDb.addEntry({ date: '2025-01-18', truck_no: 'IMPORT-TEST', kg: 3000, bag: 30 });
    const countBefore = desktopDb.getEntries().length;
    
    // Restore from backup
    desktopDb.importFromJson(backup);
    const countAfter = desktopDb.getEntries().length;
    
    assertTrue(countAfter < countBefore, 'Import should restore previous state');
  });

  test('Desktop: getMillingEntries returns array', () => {
    const entries = desktopDb.getMillingEntries();
    assertTrue(Array.isArray(entries), 'Should return array');
  });

  test('Desktop: createMillingEntry works', () => {
    const entry = desktopDb.createMillingEntry({
      date: '2025-01-15',
      rice_type: 'parboiled',
      paddy_input_qntl: 100,
      rice_percent: 67,
      bran_percent: 8,
      kunda_percent: 3,
      broken_percent: 2,
      kanki_percent: 1
    });
    assertTrue(entry.id !== undefined, 'Should have ID');
    assertEqual(entry.rice_qntl, 67, 'rice_qntl should be calculated');
    assertTrue(entry.husk_percent !== undefined, 'husk_percent should be calculated');
  });

  test('Desktop: updateMillingEntry works', () => {
    const entries = desktopDb.getMillingEntries();
    if (entries.length > 0) {
      const updated = desktopDb.updateMillingEntry(entries[0].id, {
        ...entries[0],
        paddy_input_qntl: 200
      });
      assertEqual(updated.paddy_input_qntl, 200, 'Should update paddy_input_qntl');
    }
  });

  test('Desktop: deleteMillingEntry works', () => {
    const entry = desktopDb.createMillingEntry({
      date: '2025-01-16',
      rice_type: 'raw',
      paddy_input_qntl: 50
    });
    const result = desktopDb.deleteMillingEntry(entry.id);
    assertTrue(result === true, 'Should return true on delete');
    const remaining = desktopDb.getMillingEntries().filter(e => e.id === entry.id);
    assertEqual(remaining.length, 0, 'Entry should be deleted');
  });

  test('Desktop: getMillingSummary returns aggregated data', () => {
    const summary = desktopDb.getMillingSummary();
    assertTrue(summary.total_entries !== undefined, 'Should have total_entries');
    assertTrue(summary.total_paddy_qntl !== undefined, 'Should have total_paddy_qntl');
    assertTrue(summary.parboiled !== undefined, 'Should have parboiled summary');
    assertTrue(summary.raw !== undefined, 'Should have raw summary');
  });

  test('Desktop: close() cleanly closes database', () => {
    desktopDb.close();
    // If no error thrown, test passes
    assertTrue(true, 'Database closed without error');
  });

} catch (err) {
  console.log(`✗ FAIL: Desktop SQLite tests - ${err.message}`);
  results.failed++;
  results.tests.push({ name: 'Desktop SQLite initialization', status: 'FAIL', error: err.message });
}

// ============ LOCAL SERVER TESTS ============
console.log('\n========== LOCAL SERVER sqlite-database.js TESTS ==========\n');

const localTestDir = path.join(os.tmpdir(), `sqlite-local-test-${Date.now()}`);
fs.mkdirSync(localTestDir, { recursive: true });

let localDb;
try {
  const { SqliteDatabase: LocalSqliteDatabase } = require('/app/local-server/sqlite-database');
  
  test('Local-server: SqliteDatabase initializes correctly', () => {
    localDb = new LocalSqliteDatabase(localTestDir);
    assertTrue(localDb !== null, 'Database should be created');
    assertTrue(fs.existsSync(path.join(localTestDir, 'millentry-data.db')), 'DB file should exist');
  });

  test('Local-server: getData("/settings") returns empty object for fresh DB', () => {
    const settings = localDb.getData('/settings');
    assertTrue(typeof settings === 'object', 'Settings should be an object');
    assertEqual(Object.keys(settings).length, 0, 'Fresh settings should be empty');
  });

  test('Local-server: push("/settings", {...}) saves and retrieves settings', () => {
    localDb.push('/settings', { local_key: 'local_value' });
    localDb.saveImmediate();
    const settings = localDb.getData('/settings');
    assertEqual(settings.local_key, 'local_value', 'local_key should be saved');
  });

  test('Local-server: addEntry creates entry with calculated fields', () => {
    const entry = localDb.addEntry({
      date: '2025-01-15',
      truck_no: 'LOCAL-001',
      kg: 4000,
      bag: 40
    });
    assertTrue(entry.id !== undefined, 'Entry should have ID');
    assertEqual(entry.qntl, 40, 'qntl should be calculated');
  });

  test('Local-server: exportToJson returns valid JSON', () => {
    const jsonStr = localDb.exportToJson();
    const parsed = JSON.parse(jsonStr);
    assertTrue(parsed.entries !== undefined, 'Should have entries');
  });

  test('Local-server: importFromJson restores data', () => {
    const backup = localDb.exportToJson();
    localDb.addEntry({ date: '2025-01-19', truck_no: 'IMPORT-LOCAL', kg: 5000, bag: 50 });
    localDb.importFromJson(backup);
    const entries = localDb.getEntries().filter(e => e.truck_no === 'IMPORT-LOCAL');
    assertEqual(entries.length, 0, 'Import should restore previous state');
  });

  test('Local-server: close() cleanly closes database', () => {
    localDb.close();
    assertTrue(true, 'Database closed without error');
  });

} catch (err) {
  console.log(`✗ FAIL: Local-server SQLite tests - ${err.message}`);
  results.failed++;
  results.tests.push({ name: 'Local-server SQLite initialization', status: 'FAIL', error: err.message });
}

// ============ PERSISTENCE TEST ============
console.log('\n========== PERSISTENCE TEST ==========\n');

const persistDir = path.join(os.tmpdir(), `sqlite-persist-test-${Date.now()}`);
fs.mkdirSync(persistDir, { recursive: true });

try {
  const { SqliteDatabase: PersistDb } = require('/app/desktop-app/sqlite-database');
  
  test('Persistence: Data survives close and re-open', () => {
    // Create and populate
    let db1 = new PersistDb(persistDir);
    db1.addEntry({ date: '2025-01-20', truck_no: 'PERSIST-TEST', kg: 7000, bag: 70 });
    db1.push('/settings', { persist_key: 'persist_value' });
    db1.saveImmediate();
    db1.close();
    
    // Re-open and verify
    let db2 = new PersistDb(persistDir);
    const entries = db2.getEntries().filter(e => e.truck_no === 'PERSIST-TEST');
    assertEqual(entries.length, 1, 'Entry should persist');
    
    const settings = db2.getData('/settings');
    assertEqual(settings.persist_key, 'persist_value', 'Settings should persist');
    db2.close();
  });

} catch (err) {
  console.log(`✗ FAIL: Persistence test - ${err.message}`);
  results.failed++;
  results.tests.push({ name: 'Persistence test', status: 'FAIL', error: err.message });
}

// ============ JSON MIGRATION TEST ============
console.log('\n========== JSON MIGRATION TEST ==========\n');

const migrationDir = path.join(os.tmpdir(), `sqlite-migration-test-${Date.now()}`);
fs.mkdirSync(migrationDir, { recursive: true });

try {
  const { SqliteDatabase: MigrationDb } = require('/app/desktop-app/sqlite-database');
  
  test('Migration: Auto-migration from existing JSON file works', () => {
    // Create a JSON file first
    const jsonData = {
      branding: { company_name: 'Migration Test Co' },
      users: [{ username: 'migrated_user', password: 'test123', role: 'admin' }],
      entries: [{ id: 'json-entry-1', date: '2025-01-01', truck_no: 'JSON-TRUCK', kg: 1000, bag: 10 }],
      mandi_targets: [],
      truck_payments: [],
      agent_payments: [],
      milling_entries: [],
      cash_transactions: []
    };
    fs.writeFileSync(path.join(migrationDir, 'millentry-data.json'), JSON.stringify(jsonData));
    
    // Now create SQLite database - should auto-migrate
    const db = new MigrationDb(migrationDir);
    
    // Verify migration
    assertEqual(db.data.branding.company_name, 'Migration Test Co', 'Branding should be migrated');
    const entries = db.getEntries().filter(e => e.truck_no === 'JSON-TRUCK');
    assertEqual(entries.length, 1, 'Entry should be migrated from JSON');
    
    db.close();
  });

} catch (err) {
  console.log(`✗ FAIL: Migration test - ${err.message}`);
  results.failed++;
  results.tests.push({ name: 'JSON Migration test', status: 'FAIL', error: err.message });
}

// ============ SUMMARY ============
console.log('\n========== TEST SUMMARY ==========\n');
console.log(`Total: ${results.passed + results.failed}`);
console.log(`Passed: ${results.passed}`);
console.log(`Failed: ${results.failed}`);
console.log(`Success Rate: ${Math.round(results.passed / (results.passed + results.failed) * 100)}%`);

// Cleanup
try {
  fs.rmSync(testDir, { recursive: true, force: true });
  fs.rmSync(localTestDir, { recursive: true, force: true });
  fs.rmSync(persistDir, { recursive: true, force: true });
  fs.rmSync(migrationDir, { recursive: true, force: true });
} catch (e) { /* ignore cleanup errors */ }

// Exit with appropriate code
process.exit(results.failed > 0 ? 1 : 0);
