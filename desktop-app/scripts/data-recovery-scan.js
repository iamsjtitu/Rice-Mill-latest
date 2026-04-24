#!/usr/bin/env node
/**
 * data-recovery-scan.js
 *
 * Scans common locations for millentry-data.json files and reports:
 *   - File path
 *   - File size
 *   - Record counts (hemali_items, entries, vehicle_weights, etc.)
 *   - Last modified time
 *
 * Usage: double-click this script, or run in terminal:
 *   node data-recovery-scan.js
 *
 * Output: opens a window with all found DB files sorted by size (biggest first).
 * The biggest file usually has your complete data.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const SEARCH_ROOTS = [
  path.join(os.homedir(), 'AppData', 'Roaming'),
  path.join(os.homedir(), 'AppData', 'Local'),
  path.join(os.homedir(), 'Documents'),
  path.join(os.homedir(), 'Desktop'),
  os.homedir(),
  'C:\\',
  'D:\\',
  'E:\\',
];

const MAX_DEPTH = 6;
const TARGET_FILES = ['millentry-data.json', 'millentry-data.db', 'millentry-data.sqlite'];
const IGNORE_DIRS = ['node_modules', '.git', 'System Volume Information', 'Windows', 'Program Files', 'Program Files (x86)', '$Recycle.Bin', 'ProgramData'];

const results = [];

function scanDir(dir, depth) {
  if (depth > MAX_DEPTH) return;
  if (!fs.existsSync(dir)) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; /* permission denied */ }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (IGNORE_DIRS.includes(ent.name)) continue;
      scanDir(full, depth + 1);
    } else if (TARGET_FILES.includes(ent.name)) {
      try {
        const stat = fs.statSync(full);
        const info = {
          path: full,
          size_kb: Math.round(stat.size / 1024),
          modified: stat.mtime.toISOString().slice(0, 19).replace('T', ' '),
        };
        // Try to read counts if JSON
        if (ent.name.endsWith('.json') && stat.size < 500 * 1024 * 1024) {
          try {
            const content = JSON.parse(fs.readFileSync(full, 'utf8'));
            info.collections = {};
            for (const k of ['hemali_items', 'hemali_sardars', 'hemali_payments', 'entries', 'vehicle_weights', 'cash_book', 'payments', 'private_paddy', 'sales', 'purchases']) {
              const arr = content[k];
              if (Array.isArray(arr)) info.collections[k] = arr.length;
            }
          } catch { info.error = 'unreadable JSON'; }
        }
        results.push(info);
      } catch { /* skip unreadable files */ }
    }
  }
}

console.log('Scanning for MillEntry database files...');
console.log('This may take 30-60 seconds.\n');
for (const root of SEARCH_ROOTS) scanDir(root, 0);

results.sort((a, b) => b.size_kb - a.size_kb);

console.log(`\n=== Found ${results.length} MillEntry DB files ===\n`);
if (results.length === 0) {
  console.log('No database files found in standard locations.');
  console.log('Try searching manually in your Google Drive, Dropbox, external HDD, etc.');
  process.exit(0);
}

console.log('Sorted by size (biggest = most data):\n');
results.forEach((r, idx) => {
  console.log(`${idx + 1}. ${r.path}`);
  console.log(`   Size: ${r.size_kb} KB  |  Modified: ${r.modified}`);
  if (r.collections) {
    const summary = Object.entries(r.collections)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    console.log(`   Records: ${summary || '(all empty)'}`);
  }
  console.log('');
});

console.log('\n=== Recovery Steps ===');
console.log('1. Note the path with most hemali_items / entries');
console.log('2. In Mill Entry System → Home → change Data Folder to that path');
console.log('3. Restart the app — data should reappear\n');

// Write to a log file too
try {
  const logPath = path.join(os.homedir(), 'Desktop', 'millentry-db-scan-results.txt');
  const logContent = `MillEntry Data Recovery Scan\nRan: ${new Date().toISOString()}\n\n` +
    results.map((r, idx) => {
      const lines = [`${idx + 1}. ${r.path}`, `   Size: ${r.size_kb} KB  |  Modified: ${r.modified}`];
      if (r.collections) {
        lines.push(`   Records: ${Object.entries(r.collections).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(', ') || '(all empty)'}`);
      }
      return lines.join('\n');
    }).join('\n\n');
  fs.writeFileSync(logPath, logContent);
  console.log(`✓ Results saved to Desktop: ${logPath}`);
} catch (e) { console.error('Could not save log:', e.message); }
