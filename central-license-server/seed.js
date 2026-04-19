/**
 * Seed script — run once to initialize:
 *  1. Super admin user (t2@host9x.com)
 *  2. Pre-generated MASTER license for original owner
 *
 * Usage: node seed.js
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

const SUPER_ADMIN = {
  email: 't2@host9x.com',
  password: 'We@1992!',
};

const MASTER_LICENSE = {
  key: '9X-NVKR-OWNR-MSTR-2099',
  customer_name: 'Navkar Agro (Owner Master License)',
  mill_name: 'Navkar Agro - Jolko, Kesinga',
  contact: 't2@host9x.com',
  plan: 'lifetime',
  notes: 'Permanent master license for original owner. Never expires.',
  is_master: true,
};

(async () => {
  db.load();
  const data = db.getData();

  // 1. Seed super admin
  const existing = data.super_admins.find(a => a.email === SUPER_ADMIN.email);
  if (existing) {
    console.log(`[Seed] Super admin ${SUPER_ADMIN.email} already exists — updating password`);
    existing.password_hash = await bcrypt.hash(SUPER_ADMIN.password, 10);
    existing.updated_at = new Date().toISOString();
  } else {
    const hash = await bcrypt.hash(SUPER_ADMIN.password, 10);
    data.super_admins.push({
      id: uuidv4(),
      email: SUPER_ADMIN.email,
      password_hash: hash,
      created_at: new Date().toISOString(),
    });
    console.log(`[Seed] Super admin created: ${SUPER_ADMIN.email}`);
  }

  // 2. Seed master license (idempotent)
  const existingLic = data.licenses.find(l => l.key === MASTER_LICENSE.key);
  if (existingLic) {
    console.log(`[Seed] Master license ${MASTER_LICENSE.key} already exists`);
  } else {
    data.licenses.push({
      id: uuidv4(),
      key: MASTER_LICENSE.key,
      customer_name: MASTER_LICENSE.customer_name,
      mill_name: MASTER_LICENSE.mill_name,
      contact: MASTER_LICENSE.contact,
      plan: MASTER_LICENSE.plan,
      status: 'active',
      issued_at: new Date().toISOString(),
      expires_at: null,  // never expires
      notes: MASTER_LICENSE.notes,
      revoked_at: null,
      is_master: true,
    });
    console.log(`[Seed] Master license created: ${MASTER_LICENSE.key}`);
  }

  db.saveImmediate();
  console.log('\n✓ Seed complete.');
  console.log('──────────────────────────────────────────────────');
  console.log('Super admin login:');
  console.log(`  Email:    ${SUPER_ADMIN.email}`);
  console.log(`  Password: ${SUPER_ADMIN.password}`);
  console.log('');
  console.log('Master license (for your existing desktop-app):');
  console.log(`  Key:      ${MASTER_LICENSE.key}`);
  console.log('──────────────────────────────────────────────────');
  process.exit(0);
})().catch(e => { console.error('[Seed] Error:', e); process.exit(1); });
