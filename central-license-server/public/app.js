// 9X License Command — Vanilla SPA (Obsidian theme)

const API = '/api';
const state = { token: null, email: null, licenses: [], stats: null, view: 'overview' };

// ========== Auth ==========
const getToken = () => state.token || localStorage.getItem('admin_token');
const setToken = (t, e) => {
  state.token = t; state.email = e;
  if (t) { localStorage.setItem('admin_token', t); localStorage.setItem('admin_email', e); }
  else { localStorage.removeItem('admin_token'); localStorage.removeItem('admin_email'); }
};
const restoreSession = () => {
  const t = localStorage.getItem('admin_token');
  const e = localStorage.getItem('admin_email');
  if (t && e) { state.token = t; state.email = e; }
};

async function apiCall(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  const tok = getToken();
  if (tok) opts.headers['Authorization'] = 'Bearer ' + tok;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function login(email, password) {
  const data = await apiCall('POST', '/auth/login', { email, password });
  setToken(data.token, data.email);
  return data;
}
function logout() { setToken(null, null); showLogin(); }

// ========== View Management ==========
function showLogin() {
  document.getElementById('login-view').style.display = 'flex';
  document.getElementById('dashboard-view').style.display = 'none';
}
function showDashboard() {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('dashboard-view').style.display = 'grid';
  const emailEl = document.getElementById('user-email');
  const avatarEl = document.getElementById('user-avatar');
  emailEl.textContent = state.email || '';
  avatarEl.textContent = (state.email || 'A').slice(0, 1).toUpperCase();
  switchSection(state.view);
  loadDashboard();
}

function switchSection(view) {
  state.view = view;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  const overTitle = {
    overview: ['OVERVIEW', 'Command Center'],
    licenses: ['LICENSES', 'All Customers'],
    notifications: ['NOTIFICATIONS', 'WhatsApp Delivery Log'],
    settings: ['SETTINGS', 'Server Configuration']
  };
  const [over, title] = overTitle[view] || overTitle.overview;
  document.getElementById('page-overline').textContent = over;
  document.getElementById('page-title').textContent = title;
  document.getElementById('overview-section').style.display      = view === 'overview' ? 'block' : 'none';
  document.getElementById('licenses-section').style.display      = view === 'licenses' ? 'block' : 'none';
  document.getElementById('notifications-section').style.display = view === 'notifications' ? 'block' : 'none';
  document.getElementById('settings-section').style.display      = view === 'settings' ? 'block' : 'none';
  if (view === 'settings') loadSettings();
  if (view === 'notifications') loadNotifications();
}

// ========== Settings tabs ==========
const SETTINGS_TAB_KEY = 'mls_settings_tab';
function switchSettingsTab(tab) {
  const valid = ['whatsapp', 'tunnels', 'updates', 'website', 'account'];
  if (!valid.includes(tab)) tab = 'whatsapp';
  try { localStorage.setItem(SETTINGS_TAB_KEY, tab); } catch {}
  document.querySelectorAll('.settings-tab').forEach(b => {
    const on = b.dataset.settingsTab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.settings-panel').forEach(p => {
    const on = p.dataset.settingsPanel === tab;
    if (on) { p.hidden = false; p.classList.add('active'); }
    else    { p.hidden = true;  p.classList.remove('active'); }
  });
}

async function loadDashboard() {
  await Promise.all([loadStats(), loadLicenses()]);
  renderActivity();
}

async function loadStats() {
  try {
    const s = await apiCall('GET', '/admin/stats');
    state.stats = s;
    animateCounter('stat-total', s.total_licenses);
    animateCounter('stat-active', s.active_licenses);
    animateCounter('stat-expired', s.expired_licenses);
    animateCounter('stat-revoked', s.revoked_licenses);
    animateCounter('stat-suspended', s.suspended_licenses || 0);
    animateCounter('stat-online', s.currently_online);
    document.getElementById('live-count').textContent = `${s.currently_online} LIVE`;
  } catch (e) {
    if (/401|403|Unauthorized/i.test(e.message)) { logout(); return; }
  }
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const duration = 600;
  const steps = 30;
  let i = 0;
  clearInterval(el._tm);
  el._tm = setInterval(() => {
    i++;
    const p = i / steps;
    const val = Math.round(start + (target - start) * easeOutCubic(p));
    el.textContent = val;
    if (i >= steps) { clearInterval(el._tm); el.textContent = target; }
  }, duration / steps);
}
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

async function loadLicenses() {
  const search = document.getElementById('search').value.trim();
  const status = document.getElementById('filter-status').value;
  const qp = new URLSearchParams();
  if (search) qp.append('search', search);
  if (status) qp.append('status', status);
  try {
    const rows = await apiCall('GET', '/admin/licenses' + (qp.toString() ? '?' + qp.toString() : ''));
    state.licenses = rows;
    renderLicenses(rows);
  } catch (e) {
    if (/401|403|Unauthorized/i.test(e.message)) { logout(); return; }
    document.getElementById('license-tbody').innerHTML = `<tr><td colspan="10" class="table-empty">Error: ${e.message}</td></tr>`;
  }
}

function renderActivity() {
  // Show 6 most recent heartbeats (live customers)
  const feed = document.getElementById('activity-feed');
  const rows = (state.licenses || [])
    .filter(l => l.last_seen_at && l.status === 'active')
    .sort((a, b) => String(b.last_seen_at).localeCompare(String(a.last_seen_at)))
    .slice(0, 8);
  if (!rows.length) {
    feed.innerHTML = '<div class="activity-empty">No recent activity — new heartbeats will appear here.</div>';
    return;
  }
  feed.innerHTML = rows.map(r => {
    const online = (Date.now() - new Date(r.last_seen_at).getTime()) < 10 * 60 * 1000;
    return `<div class="activity-item">
      <div class="activity-left">
        <div class="activity-icon" style="${!online ? 'background:var(--text-3); box-shadow:none' : ''}"></div>
        <div>
          <div class="activity-text">${escapeHtml(r.customer_name)} · ${escapeHtml(r.mill_name)}</div>
          <div class="activity-sub">${r.key}</div>
        </div>
      </div>
      <div class="activity-time">${online ? 'LIVE' : fmtDT(r.last_seen_at)}</div>
    </div>`;
  }).join('');
}

function fmtD(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); }
  catch { return String(iso).slice(0, 10); }
}
function fmtDT(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.round(diff / 60) + 'm ago';
    if (diff < 86400) return Math.round(diff / 3600) + 'h ago';
    if (diff < 86400 * 7) return Math.round(diff / 86400) + 'd ago';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  } catch { return '—'; }
}

function renderLicenses(rows) {
  const tbody = document.getElementById('license-tbody');
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="10" class="table-empty">No licenses yet. Issue your first one with the button above.</td></tr>'; return; }
  tbody.innerHTML = rows.map(r => {
    const now = new Date();
    const isExpired = r.expires_at && new Date(r.expires_at) < now;
    let statusBadge = '';
    if (r.status === 'revoked')        statusBadge = '<span class="badge badge-revoked">Revoked</span>';
    else if (r.status === 'suspended') statusBadge = `<span class="badge badge-suspended" title="${escapeHtml(r.suspension_reason || 'Suspended')}">Suspended${r.auto_suspended ? ' · Auto' : ''}</span>`;
    else if (isExpired)                statusBadge = '<span class="badge badge-expired">Expired</span>';
    else                               statusBadge = '<span class="badge badge-active">Active</span>';
    if (r.is_master) statusBadge += ' <span class="badge badge-master">Master</span>';
    const online = r.last_seen_at && (Date.now() - new Date(r.last_seen_at).getTime()) < 10 * 60 * 1000;
    const pcText = r.current_pc && (r.current_pc.hostname || r.current_pc.platform)
      ? `${r.current_pc.hostname || ''}${r.current_pc.platform ? ' · ' + r.current_pc.platform : ''}`.trim()
      : (r.current_machine ? r.current_machine.slice(0, 10) + '…' : '—');
    const seenText = online ? '<span class="badge badge-live">Live</span>' : fmtDT(r.last_seen_at);
    const planLabel = r.plan === 'lifetime' ? 'Lifetime' : r.plan === 'yearly' ? 'Yearly' : r.plan === 'trial' ? 'Trial' : r.plan;
    const reasonLine = r.status === 'suspended' && r.suspension_reason
      ? `<div class="suspend-reason-inline" title="${escapeHtml(r.suspension_reason)}">${escapeHtml(r.suspension_reason)}</div>`
      : '';
    return `
      <tr>
        <td class="mono-cell">${r.key}</td>
        <td><div class="cell-main">${escapeHtml(r.customer_name)}</div><div class="cell-sub">${escapeHtml(r.contact || '—')}</div></td>
        <td><div class="cell-main">${escapeHtml(r.mill_name)}</div>${reasonLine}</td>
        <td class="mono-cell">${planLabel}</td>
        <td class="mono-cell">${fmtD(r.issued_at)}</td>
        <td class="mono-cell">${r.expires_at ? fmtD(r.expires_at) : '<span style="color:var(--text-3)">Never</span>'}</td>
        <td>${statusBadge}</td>
        <td><div class="cell-main" style="font-size:12px">${escapeHtml(pcText)}</div></td>
        <td>${seenText}</td>
        <td><div class="action-group">
          ${r.status === 'active' ? `<button class="btn btn-ghost btn-sm" data-action="reset" data-id="${r.id}" title="Reset machine binding">Reset PC</button>` : ''}
          ${r.status === 'active' && !r.is_master ? `<button class="btn btn-accent btn-sm" data-action="mlic" data-id="${r.id}" data-key="${escapeHtml(r.key)}" data-mill="${escapeHtml(r.mill_name)}" data-contact="${escapeHtml(r.contact || '')}" title="Generate Offline Activation File">.mlic</button>` : ''}
          ${r.status === 'active' && !r.is_master ? `<button class="btn btn-warn btn-sm" data-action="suspend" data-id="${r.id}" data-key="${escapeHtml(r.key)}" data-mill="${escapeHtml(r.mill_name)}">Suspend</button>` : ''}
          ${r.status === 'suspended' && !r.is_master ? `<button class="btn btn-success btn-sm" data-action="unsuspend" data-id="${r.id}">Restore</button>` : ''}
          ${r.status !== 'revoked' && !r.is_master ? `<button class="btn btn-danger btn-sm" data-action="revoke" data-id="${r.id}">Revoke</button>` : ''}
          ${!r.is_master ? `<button class="btn btn-hard-danger btn-sm" data-action="delete" data-id="${r.id}" data-key="${escapeHtml(r.key)}" data-mill="${escapeHtml(r.mill_name)}" title="Permanently delete">Delete</button>` : ''}
        </div></td>
      </tr>`;
  }).join('');
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ========== Event bindings ==========
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('login-error'); err.textContent = '';
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.querySelector('.btn-label').textContent = 'Authenticating…';
  try { await login(email, password); showDashboard(); }
  catch (e2) { err.textContent = e2.message || 'Login failed'; }
  finally { btn.disabled = false; btn.querySelector('.btn-label').textContent = 'Access Command Center'; }
});

document.getElementById('logout-btn').addEventListener('click', logout);
document.getElementById('refresh-btn').addEventListener('click', loadDashboard);
document.getElementById('refresh-activity').addEventListener('click', loadDashboard);
document.getElementById('search').addEventListener('input', debounce(loadLicenses, 280));
document.getElementById('filter-status').addEventListener('change', loadLicenses);
document.querySelectorAll('.nav-item').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); switchSection(a.dataset.view); }));
document.querySelectorAll('.settings-tab').forEach(b => b.addEventListener('click', () => switchSettingsTab(b.dataset.settingsTab)));
// Restore last-selected settings tab on page load
try {
  const saved = localStorage.getItem(SETTINGS_TAB_KEY);
  if (saved) switchSettingsTab(saved);
} catch {}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// Keyboard shortcut ⌘K / Ctrl+K → focus search
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    if (state.view !== 'licenses') switchSection('licenses');
    setTimeout(() => document.getElementById('search').focus(), 50);
  }
});

// Modals
document.getElementById('create-license-btn').addEventListener('click', () => {
  document.getElementById('create-modal').style.display = 'flex';
  document.getElementById('create-error').textContent = '';
  document.getElementById('create-form').reset();
});
document.querySelectorAll('[data-close-modal]').forEach(b => {
  b.addEventListener('click', () => { document.getElementById(b.dataset.closeModal).style.display = 'none'; });
});

document.getElementById('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('create-error'); err.textContent = '';
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  if (!body.expires_at) delete body.expires_at;
  try {
    const res = await apiCall('POST', '/admin/licenses', body);
    document.getElementById('create-modal').style.display = 'none';
    document.getElementById('new-key-display').textContent = res.license.key;
    document.getElementById('success-modal').style.display = 'flex';
    loadDashboard();
  } catch (e2) { err.textContent = e2.message || 'Create failed'; }
});

document.getElementById('copy-key-btn').addEventListener('click', async () => {
  const key = document.getElementById('new-key-display').textContent;
  try {
    await navigator.clipboard.writeText(key);
    const btn = document.getElementById('copy-key-btn');
    const lab = btn.querySelector('.btn-label'); const original = lab.textContent;
    lab.textContent = '✓ Copied';
    setTimeout(() => { lab.textContent = original; }, 1800);
  } catch {}
});

document.getElementById('license-tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if (action === 'revoke') {
    if (!confirm('Revoke this license? Customer will lose access at next heartbeat.')) return;
    try { await apiCall('POST', `/admin/licenses/${id}/revoke`); loadDashboard(); }
    catch (e2) { alert('Revoke failed: ' + e2.message); }
  } else if (action === 'reset') {
    if (!confirm('Reset machine binding? Current PC will be kicked off so customer can activate on a new one.')) return;
    try { await apiCall('POST', `/admin/licenses/${id}/reset-machine`); loadDashboard(); }
    catch (e2) { alert('Reset failed: ' + e2.message); }
  } else if (action === 'suspend') {
    openSuspendModal(id, btn.dataset.key || '', btn.dataset.mill || '');
  } else if (action === 'unsuspend') {
    if (!confirm('Restore this license? Customer software will resume at next heartbeat and WhatsApp restoration message will be sent.')) return;
    try { await apiCall('POST', `/admin/licenses/${id}/unsuspend`); loadDashboard(); }
    catch (e2) { alert('Restore failed: ' + e2.message); }
  } else if (action === 'delete') {
    openDeleteModal(id, btn.dataset.key || '', btn.dataset.mill || '');
  } else if (action === 'mlic') {
    openMlicModal(id, btn.dataset.key || '', btn.dataset.mill || '', btn.dataset.contact || '');
  }
});

// ========== Delete modal ==========
function openDeleteModal(licenseId, key, mill) {
  const modal = document.getElementById('delete-modal');
  const form = document.getElementById('delete-form');
  const title = document.getElementById('delete-modal-title');
  const keyDisplay = document.getElementById('delete-key-display');
  const input = document.getElementById('delete-confirm-input');
  const submitBtn = document.getElementById('delete-submit-btn');
  const err = document.getElementById('delete-error');
  form.dataset.licenseId = licenseId;
  form.dataset.licenseKey = key;
  title.textContent = mill ? `Delete ${mill}?` : `Delete ${key}?`;
  keyDisplay.textContent = key;
  input.value = '';
  err.textContent = '';
  submitBtn.disabled = true;
  modal.style.display = 'flex';
  setTimeout(() => input.focus(), 120);
}

document.getElementById('delete-confirm-input').addEventListener('input', (e) => {
  const expected = document.getElementById('delete-form').dataset.licenseKey || '';
  document.getElementById('delete-submit-btn').disabled = (e.target.value.trim().toUpperCase() !== expected.toUpperCase());
});

document.getElementById('delete-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const licenseId = form.dataset.licenseId;
  const expectedKey = form.dataset.licenseKey;
  const typed = document.getElementById('delete-confirm-input').value.trim().toUpperCase();
  const err = document.getElementById('delete-error');
  err.textContent = '';
  if (typed !== expectedKey.toUpperCase()) { err.textContent = 'Key does not match.'; return; }
  const btn = document.getElementById('delete-submit-btn');
  const lab = btn.querySelector('.btn-label'); const orig = lab.textContent;
  btn.disabled = true; lab.textContent = 'Deleting…';
  try {
    await apiCall('DELETE', `/admin/licenses/${licenseId}`, { confirm_key: expectedKey });
    document.getElementById('delete-modal').style.display = 'none';
    loadDashboard();
  } catch (e2) {
    err.textContent = e2.message || 'Delete failed';
  } finally {
    btn.disabled = false; lab.textContent = orig;
  }
});

// ========== Suspend modal ==========
function openSuspendModal(licenseId, key, mill) {
  const modal = document.getElementById('suspend-modal');
  const form = document.getElementById('suspend-form');
  const title = document.getElementById('suspend-modal-title');
  const reasonEl = document.getElementById('suspend-reason');
  const errorEl = document.getElementById('suspend-error');
  form.dataset.licenseId = licenseId;
  title.textContent = mill ? `Suspend ${mill}?` : `Suspend ${key}?`;
  reasonEl.value = '';
  errorEl.textContent = '';
  modal.style.display = 'flex';
  setTimeout(() => reasonEl.focus(), 120);
}

// Preset chips populate the reason textarea
document.querySelectorAll('#suspend-modal .preset-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.getElementById('suspend-reason').value = chip.dataset.preset || '';
  });
});

document.getElementById('suspend-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const licenseId = form.dataset.licenseId;
  const reason = document.getElementById('suspend-reason').value.trim();
  const errorEl = document.getElementById('suspend-error');
  errorEl.textContent = '';
  if (!reason) { errorEl.textContent = 'Reason is required.'; return; }
  const submitBtn = form.querySelector('button[type="submit"]');
  const lab = submitBtn.querySelector('.btn-label');
  const original = lab.textContent;
  submitBtn.disabled = true; lab.textContent = 'Suspending…';
  try {
    await apiCall('POST', `/admin/licenses/${licenseId}/suspend`, { reason });
    document.getElementById('suspend-modal').style.display = 'none';
    loadDashboard();
  } catch (e2) {
    errorEl.textContent = e2.message || 'Failed to suspend';
  } finally {
    submitBtn.disabled = false; lab.textContent = original;
  }
});

// ========== Custom Cursor ==========
(() => {
  const dot = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (!dot || !ring) return;
  let tx = 0, ty = 0, rx = 0, ry = 0;
  document.addEventListener('mousemove', (e) => {
    tx = e.clientX; ty = e.clientY;
    dot.style.transform = `translate(${tx}px, ${ty}px) translate(-50%, -50%)`;
  });
  function loop() {
    rx += (tx - rx) * 0.15;
    ry += (ty - ry) * 0.15;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
    requestAnimationFrame(loop);
  }
  loop();
  document.addEventListener('mouseover', (e) => {
    const t = e.target;
    const interactive = t.closest('a, button, input, select, textarea, [data-close-modal]');
    document.documentElement.classList.toggle('cursor-hover', !!interactive);
  });
})();

// ========== Settings View ==========
async function loadSettings() {
  const statusEl = document.getElementById('settings-status');
  const hintEl = document.getElementById('key-hint');
  const toggleLabel = document.getElementById('toggle-label');
  try {
    const s = await apiCall('GET', '/admin/settings');
    document.getElementById('setting-wa-key').value = '';
    document.getElementById('setting-wa-key').placeholder = s.whatsapp_api_key_set
      ? 'Current: ' + s.whatsapp_api_key_masked + '  ·  paste new key to replace'
      : (s.env_key_available ? 'Using .env fallback · paste here to override' : 'Paste your 360Messenger API key');
    document.getElementById('setting-wa-cc').value = s.whatsapp_cc || '91';
    document.getElementById('setting-wa-enabled').checked = !!s.whatsapp_enabled;
    toggleLabel.textContent = s.whatsapp_enabled ? 'Enabled' : 'Disabled';

    if (s.whatsapp_api_key_set && s.whatsapp_enabled) {
      statusEl.className = 'settings-status ok';
      statusEl.querySelector('.status-text').innerHTML = '<strong>Live</strong> · WhatsApp notifications are active. Key set via admin panel.';
    } else if (s.env_key_available && s.whatsapp_enabled) {
      statusEl.className = 'settings-status ok';
      statusEl.querySelector('.status-text').innerHTML = '<strong>Live</strong> · Using fallback key from <code>.env</code>. Override it here if needed.';
    } else if (s.whatsapp_api_key_set && !s.whatsapp_enabled) {
      statusEl.className = 'settings-status warn';
      statusEl.querySelector('.status-text').innerHTML = '<strong>Key saved, but disabled.</strong> Toggle on to enable notifications.';
    } else {
      statusEl.className = 'settings-status off';
      statusEl.querySelector('.status-text').innerHTML = '<strong>Not configured.</strong> Paste a 360Messenger API key and save to activate customer notifications.';
    }
    hintEl.textContent = s.whatsapp_api_key_set ? '(stored)' : '';
  } catch (e) {
    if (/401|403|Unauthorized/i.test(e.message)) { logout(); return; }
    statusEl.className = 'settings-status off';
    statusEl.querySelector('.status-text').textContent = 'Error loading settings: ' + e.message;
  }
}

document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('settings-error'); err.textContent = '';
  const ok = document.getElementById('settings-success'); ok.textContent = '';
  const body = {
    whatsapp_api_key: document.getElementById('setting-wa-key').value.trim() || undefined,
    whatsapp_cc: document.getElementById('setting-wa-cc').value.trim() || undefined,
    whatsapp_enabled: document.getElementById('setting-wa-enabled').checked,
  };
  // Drop undefined keys so server does not wipe stored key on blank save
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);
  const btn = document.getElementById('setting-save');
  btn.disabled = true; btn.querySelector('.btn-label').textContent = 'Saving…';
  try {
    await apiCall('PUT', '/admin/settings', body);
    ok.textContent = '✓ Configuration saved.';
    await loadSettings();
    setTimeout(() => { ok.textContent = ''; }, 3000);
  } catch (e2) {
    err.textContent = e2.message || 'Save failed';
  } finally {
    btn.disabled = false; btn.querySelector('.btn-label').textContent = 'Save Configuration';
  }
});

document.getElementById('setting-wa-enabled').addEventListener('change', (e) => {
  document.getElementById('toggle-label').textContent = e.target.checked ? 'Enabled' : 'Disabled';
});

document.getElementById('setting-remove-key').addEventListener('click', async () => {
  if (!confirm('Remove the saved WhatsApp API key? Notifications will stop until a new key is saved (or .env fallback is available).')) return;
  try {
    await apiCall('DELETE', '/admin/settings/whatsapp-key');
    await loadSettings();
  } catch (e) { alert('Remove failed: ' + e.message); }
});

document.getElementById('test-wa-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const phone = document.getElementById('test-wa-phone').value.trim();
  const resEl = document.getElementById('test-wa-result');
  resEl.className = 'test-result loading';
  resEl.textContent = 'Sending test message…';
  try {
    const r = await apiCall('POST', '/admin/settings/test-whatsapp', { phone });
    if (r.success) {
      resEl.className = 'test-result ok';
      resEl.innerHTML = `<strong>✓ Sent.</strong> Check WhatsApp on ${escapeHtml(r.sent_to)} — message should arrive in a few seconds.`;
    } else {
      const reason = (r.result && (r.result.reason || r.result.error || (r.result.response && r.result.response.message))) || 'Unknown error';
      resEl.className = 'test-result fail';
      resEl.innerHTML = `<strong>× Failed.</strong> ${escapeHtml(reason)}`;
    }
  } catch (e2) {
    resEl.className = 'test-result fail';
    resEl.textContent = 'Error: ' + e2.message;
  }
});

document.getElementById('run-expiry-scan').addEventListener('click', async () => {
  const resEl = document.getElementById('expiry-scan-result');
  resEl.className = 'test-result loading';
  resEl.textContent = 'Scanning licenses…';
  try {
    const r = await apiCall('POST', '/admin/expiry-scan');
    resEl.className = 'test-result ok';
    resEl.innerHTML = `<strong>✓ Scan complete.</strong> Scanned ${r.scanned} · 7-day warnings: ${r.warnings} · expired notices: ${r.expired} · skipped: ${r.skipped}`;
  } catch (e) {
    resEl.className = 'test-result fail';
    resEl.textContent = 'Error: ' + e.message;
  }
});

// ========== Cloudflare Settings ==========
function paintCfStatus(s) {
  const statusEl = document.getElementById('cf-status');
  if (!s.cloudflare_api_token_set) {
    statusEl.className = 'settings-status off';
    statusEl.querySelector('.status-text').innerHTML = '<strong>Not configured.</strong> Paste a Cloudflare API token and save to enable auto-provisioning.';
  } else if (!s.cloudflare_ready) {
    statusEl.className = 'settings-status warn';
    statusEl.querySelector('.status-text').innerHTML = '<strong>Token saved — IDs missing.</strong> Click “Auto-Discover IDs” to complete setup.';
  } else if (!s.cloudflare_enabled) {
    statusEl.className = 'settings-status warn';
    statusEl.querySelector('.status-text').innerHTML = '<strong>Ready, but disabled.</strong> Toggle on to provision customer tunnels.';
  } else {
    statusEl.className = 'settings-status ok';
    statusEl.querySelector('.status-text').innerHTML = '<strong>Live</strong> · Cloudflare auto-provisioning active for zone <code>' + escapeHtml(s.cloudflare_tunnel_domain) + '</code>.';
  }
  const idsEl = document.getElementById('cf-ids');
  if (s.cloudflare_account_id && s.cloudflare_zone_id) {
    idsEl.style.display = 'grid';
    document.getElementById('cf-account-id').textContent = s.cloudflare_account_id;
    document.getElementById('cf-zone-id').textContent = s.cloudflare_zone_id;
  } else { idsEl.style.display = 'none'; }
  document.getElementById('setting-cf-token').value = '';
  document.getElementById('setting-cf-token').placeholder = s.cloudflare_api_token_set
    ? 'Current: ' + s.cloudflare_api_token_masked + '  ·  paste new token to replace'
    : 'Paste your Cloudflare API token';
  document.getElementById('setting-cf-domain').value = s.cloudflare_tunnel_domain || '9x.design';
  document.getElementById('setting-cf-enabled').checked = !!s.cloudflare_enabled;
  document.getElementById('cf-toggle-label').textContent = s.cloudflare_enabled ? 'Enabled' : 'Disabled';
  document.getElementById('cf-key-hint').textContent = s.cloudflare_api_token_set ? '(stored)' : '';
}

// Extend loadSettings to also paint CF
const _origLoadSettings = loadSettings;
loadSettings = async function() {
  try {
    const s = await apiCall('GET', '/admin/settings');
    // reuse original renderer for WhatsApp part (just inline it since we have 's' already)
    document.getElementById('setting-wa-key').value = '';
    document.getElementById('setting-wa-key').placeholder = s.whatsapp_api_key_set
      ? 'Current: ' + s.whatsapp_api_key_masked + '  ·  paste new key to replace'
      : (s.env_key_available ? 'Using .env fallback · paste here to override' : 'Paste your 360Messenger API key');
    document.getElementById('setting-wa-cc').value = s.whatsapp_cc || '91';
    document.getElementById('setting-wa-enabled').checked = !!s.whatsapp_enabled;
    document.getElementById('toggle-label').textContent = s.whatsapp_enabled ? 'Enabled' : 'Disabled';
    const waStatus = document.getElementById('settings-status');
    if (s.whatsapp_api_key_set && s.whatsapp_enabled) {
      waStatus.className = 'settings-status ok';
      waStatus.querySelector('.status-text').innerHTML = '<strong>Live</strong> · WhatsApp notifications are active. Key set via admin panel.';
    } else if (s.env_key_available && s.whatsapp_enabled) {
      waStatus.className = 'settings-status ok';
      waStatus.querySelector('.status-text').innerHTML = '<strong>Live</strong> · Using fallback key from <code>.env</code>. Override it here if needed.';
    } else if (s.whatsapp_api_key_set && !s.whatsapp_enabled) {
      waStatus.className = 'settings-status warn';
      waStatus.querySelector('.status-text').innerHTML = '<strong>Key saved, but disabled.</strong> Toggle on to enable notifications.';
    } else {
      waStatus.className = 'settings-status off';
      waStatus.querySelector('.status-text').innerHTML = '<strong>Not configured.</strong> Paste a 360Messenger API key and save to activate customer notifications.';
    }
    document.getElementById('key-hint').textContent = s.whatsapp_api_key_set ? '(stored)' : '';
    paintCfStatus(s);
    paintSuspendSettings(s);
  } catch (e) {
    if (/401|403|Unauthorized/i.test(e.message)) { logout(); return; }
    document.getElementById('settings-status').className = 'settings-status off';
    document.getElementById('settings-status').querySelector('.status-text').textContent = 'Error loading: ' + e.message;
  }
};

document.getElementById('cf-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('cf-error'); err.textContent = '';
  const ok = document.getElementById('cf-success'); ok.textContent = '';
  const body = {
    cloudflare_api_token: document.getElementById('setting-cf-token').value.trim() || undefined,
    cloudflare_tunnel_domain: document.getElementById('setting-cf-domain').value.trim() || undefined,
    cloudflare_enabled: document.getElementById('setting-cf-enabled').checked,
  };
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);
  try {
    await apiCall('PUT', '/admin/settings', body);
    ok.textContent = '✓ Cloudflare configuration saved.';
    // If token was newly provided and IDs are missing, auto-discover
    const s = await apiCall('GET', '/admin/settings');
    if (s.cloudflare_api_token_set && !s.cloudflare_ready) {
      ok.textContent += ' Auto-discovering account & zone…';
      try {
        await apiCall('POST', '/admin/settings/cloudflare-discover');
        ok.textContent = '✓ Saved. Account & Zone discovered.';
      } catch (e2) { err.textContent = 'Discovery failed: ' + e2.message; }
    }
    await loadSettings();
    setTimeout(() => { ok.textContent = ''; }, 3500);
  } catch (e3) { err.textContent = e3.message; }
});

document.getElementById('cf-discover').addEventListener('click', async () => {
  const err = document.getElementById('cf-error'); err.textContent = '';
  const ok = document.getElementById('cf-success'); ok.textContent = 'Discovering…';
  try {
    const info = await apiCall('POST', '/admin/settings/cloudflare-discover');
    ok.textContent = `✓ Found account "${info.account_name}" and zone "${info.zone_name}".`;
    await loadSettings();
  } catch (e) {
    ok.textContent = '';
    err.textContent = e.message;
  }
});

document.getElementById('cf-remove').addEventListener('click', async () => {
  if (!confirm('Remove the saved Cloudflare API token? Existing customer tunnels will keep working, but new provisioning will stop.')) return;
  try { await apiCall('DELETE', '/admin/settings/cloudflare-token'); await loadSettings(); }
  catch (e) { alert('Remove failed: ' + e.message); }
});

document.getElementById('setting-cf-enabled').addEventListener('change', (e) => {
  document.getElementById('cf-toggle-label').textContent = e.target.checked ? 'Enabled' : 'Disabled';
});

// ========== Server Updates ==========
let _latestSha = null;

function paintUpdateStatus(info) {
  const statusEl = document.getElementById('update-status');
  const metaEl = document.getElementById('update-meta');
  const applyBtn = document.getElementById('update-apply-btn');
  if (!info) {
    statusEl.className = 'settings-status';
    statusEl.querySelector('.status-text').textContent = 'Click "Check for Updates" to see what\'s new…';
    metaEl.style.display = 'none';
    applyBtn.disabled = true;
    return;
  }
  metaEl.style.display = 'grid';
  document.getElementById('update-repo-val').textContent = info.repo;
  document.getElementById('update-branch-val').textContent = info.branch;
  document.getElementById('update-current-sha').textContent = info.current_sha ? info.current_sha.slice(0, 10) : '(first deploy)';
  document.getElementById('update-latest-sha').textContent = info.latest_sha.slice(0, 10);
  document.getElementById('update-last-commit').textContent = `${info.latest_commit_message || '(no message)'} — ${info.latest_commit_author || 'unknown'}`;
  if (info.update_available) {
    statusEl.className = 'settings-status warn';
    statusEl.querySelector('.status-text').innerHTML = '<strong>Update available.</strong> Click "Install Update" to deploy the latest commit.';
    applyBtn.disabled = false;
    _latestSha = info.latest_sha;
  } else {
    statusEl.className = 'settings-status ok';
    statusEl.querySelector('.status-text').innerHTML = '<strong>Up to date.</strong> Running the latest commit.';
    applyBtn.disabled = true;
    _latestSha = null;
  }
}

document.getElementById('update-check-btn').addEventListener('click', async () => {
  const err = document.getElementById('update-error'); err.textContent = '';
  const ok = document.getElementById('update-success'); ok.textContent = '';
  document.getElementById('update-progress').style.display = 'none';
  const btn = document.getElementById('update-check-btn');
  btn.disabled = true; btn.querySelector('.btn-label').textContent = 'Checking…';
  try {
    const info = await apiCall('GET', '/admin/server-update/check');
    paintUpdateStatus(info);
  } catch (e) { err.textContent = e.message; }
  finally {
    btn.disabled = false; btn.querySelector('.btn-label').textContent = 'Check for Updates';
  }
});

document.getElementById('update-apply-btn').addEventListener('click', async () => {
  if (!confirm('Install latest update?\n\nThe server will restart immediately after applying. All active sessions will stay logged in, but any in-flight HTTP request during the ~3 second restart will fail (safe to retry).')) return;
  const err = document.getElementById('update-error'); err.textContent = '';
  const ok = document.getElementById('update-success'); ok.textContent = '';
  const progressEl = document.getElementById('update-progress');
  progressEl.style.display = 'block';
  progressEl.className = 'test-result loading';
  progressEl.textContent = 'Starting update…';
  const btn = document.getElementById('update-apply-btn');
  btn.disabled = true; btn.querySelector('.btn-label').textContent = 'Installing…';
  try {
    const r = await apiCall('POST', '/admin/server-update/apply');
    if (r.success) {
      progressEl.className = 'test-result ok';
      progressEl.innerHTML = `<strong>✓ Update applied</strong> — ${r.applied_sha.slice(0, 10)}. Server restarting in 1-2 seconds…`;
      ok.textContent = 'Page will auto-refresh in 8 seconds…';
      // Wait for PM2 to restart, then reload
      setTimeout(() => {
        const url = window.location.pathname + '?t=' + Date.now();
        window.location.replace(url);
      }, 8000);
    } else {
      progressEl.className = 'test-result fail';
      progressEl.textContent = r.error || 'Update failed';
      btn.disabled = false; btn.querySelector('.btn-label').textContent = 'Install Update';
    }
  } catch (e) {
    // Server restart mid-response is expected — if we got here with a network error AFTER a small delay, the update likely applied
    progressEl.className = 'test-result ok';
    progressEl.innerHTML = '<strong>✓ Server restarting</strong> — page will auto-refresh shortly…';
    setTimeout(() => { window.location.replace(window.location.pathname + '?t=' + Date.now()); }, 8000);
  }
});

document.getElementById('update-settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('update-error'); err.textContent = '';
  const ok = document.getElementById('update-success'); ok.textContent = '';
  const body = {
    repo: document.getElementById('update-repo').value.trim() || undefined,
    branch: document.getElementById('update-branch').value.trim() || undefined,
    github_pat: document.getElementById('update-pat').value.trim() || undefined,
  };
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);
  try {
    await apiCall('PUT', '/admin/server-update/settings', body);
    ok.textContent = '✓ Configuration saved.';
    document.getElementById('update-pat').value = '';
    setTimeout(() => { ok.textContent = ''; }, 3000);
  } catch (e2) { err.textContent = e2.message; }
});

document.getElementById('update-pat-remove').addEventListener('click', async () => {
  if (!confirm('Remove the saved GitHub PAT? Updates will work for public repos only.')) return;
  try { await apiCall('DELETE', '/admin/server-update/pat'); document.getElementById('update-pat').value = ''; alert('PAT removed.'); }
  catch (e) { alert('Remove failed: ' + e.message); }
});

document.getElementById('update-url-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = document.getElementById('update-url-input').value.trim();
  if (!url) return;
  if (!confirm(`Install update from this URL?\n\n${url}\n\nServer will download, extract and restart (~5 seconds). Active sessions stay logged in.`)) return;
  const err = document.getElementById('update-error'); err.textContent = '';
  const ok = document.getElementById('update-success'); ok.textContent = '';
  const progressEl = document.getElementById('update-progress');
  progressEl.style.display = 'block';
  progressEl.className = 'test-result loading';
  progressEl.textContent = 'Fetching from ' + url + '…';
  try {
    const r = await apiCall('POST', '/admin/server-update/apply-url', { url });
    if (r.success) {
      progressEl.className = 'test-result ok';
      progressEl.innerHTML = `<strong>✓ Update applied from URL</strong> — server restarting…`;
      ok.textContent = 'Page will auto-refresh in 8 seconds…';
      setTimeout(() => window.location.replace(window.location.pathname + '?t=' + Date.now()), 8000);
    } else {
      progressEl.className = 'test-result fail';
      progressEl.textContent = r.error || 'Update failed';
    }
  } catch (e2) {
    // Likely a connection-reset-by-restart; assume success
    progressEl.className = 'test-result ok';
    progressEl.innerHTML = '<strong>✓ Server restarting</strong> — page will auto-refresh shortly…';
    setTimeout(() => window.location.replace(window.location.pathname + '?t=' + Date.now()), 8000);
  }
});

// ========== Change Credentials ==========
document.getElementById('credentials-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('cred-error'); err.textContent = '';
  const ok = document.getElementById('cred-success'); ok.textContent = '';
  const current_password = document.getElementById('cred-current').value;
  const new_email = document.getElementById('cred-new-email').value.trim();
  const new_password = document.getElementById('cred-new-password').value;

  if (!current_password) { err.textContent = 'Current password required'; return; }
  if (!new_email && !new_password) { err.textContent = 'Enter a new email or new password'; return; }
  if (new_password && new_password.length < 6) { err.textContent = 'New password must be at least 6 characters'; return; }

  try {
    const body = { current_password };
    if (new_email) body.new_email = new_email;
    if (new_password) body.new_password = new_password;
    const r = await apiCall('PUT', '/auth/change-credentials', body);
    // Backend returns fresh token if email changed — refresh storage so session continues
    if (r.token) { state.token = r.token; localStorage.setItem('admin_token', r.token); localStorage.setItem('admin_email', r.email); }
    ok.textContent = '✓ Credentials updated successfully';
    // Clear form fields
    document.getElementById('cred-current').value = '';
    document.getElementById('cred-new-email').value = '';
    document.getElementById('cred-new-password').value = '';
    // Update top bar display if present
    const emailEl = document.querySelector('[data-admin-email]');
    if (emailEl) emailEl.textContent = r.email;
    setTimeout(() => { ok.textContent = ''; }, 4000);
  } catch (e2) {
    err.textContent = e2.message || 'Update failed';
  }
});

// ========== Init ==========
restoreSession();
if (getToken()) {
  apiCall('GET', '/auth/me').then(d => { state.email = d.email; showDashboard(); }).catch(() => showLogin());
} else {
  showLogin();
}

// Periodic refresh of dashboard (every 30s) when visible
setInterval(() => {
  if (document.getElementById('dashboard-view').style.display !== 'none') {
    loadStats();
  }
}, 30000);


// ========== Auto-Suspension settings ==========
function paintSuspendSettings(s) {
  const hbEl = document.getElementById('setting-suspend-hb-days');
  const expEl = document.getElementById('setting-suspend-expiry');
  const labEl = document.getElementById('suspend-expiry-label');
  if (!hbEl || !expEl) return;
  expEl.checked = s.suspend_on_expiry !== false;
  labEl.textContent = expEl.checked ? 'Enabled' : 'Disabled';
  hbEl.value = Number(s.suspend_after_heartbeat_days) || 0;
}

(function wireSuspendSettings() {
  const form = document.getElementById('suspend-settings-form');
  if (!form) return;
  const expEl = document.getElementById('setting-suspend-expiry');
  const labEl = document.getElementById('suspend-expiry-label');
  expEl.addEventListener('change', (e) => { labEl.textContent = e.target.checked ? 'Enabled' : 'Disabled'; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('suspend-settings-error'); err.textContent = '';
    const ok = document.getElementById('suspend-settings-success'); ok.textContent = '';
    const body = {
      suspend_on_expiry: expEl.checked,
      suspend_after_heartbeat_days: parseInt(document.getElementById('setting-suspend-hb-days').value, 10) || 0,
    };
    try {
      await apiCall('PUT', '/admin/settings', body);
      ok.textContent = '✓ Auto-suspension rules saved.';
      setTimeout(() => { ok.textContent = ''; }, 3500);
    } catch (e2) { err.textContent = e2.message; }
  });
})();

// ========== Auto Cache-Busting: poll /api/version ==========
(function versionPoller() {
  const meta = document.querySelector('meta[name="build-version"]');
  const initialVersion = meta ? meta.content : null;
  if (!initialVersion) return; // dev mode / version injection not active
  let warned = false;
  async function check() {
    try {
      const r = await fetch('/api/version', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (j.version && j.version !== initialVersion && !warned) {
        warned = true;
        showVersionToast(initialVersion, j.version);
      }
    } catch { /* silent: offline or transient */ }
  }
  // First check 10s after boot (give server time to stabilize), then every 30s
  setTimeout(() => { check(); setInterval(check, 30000); }, 10000);
})();

function showVersionToast(oldV, newV) {
  // Don't interrupt the admin mid-action — show a small toast with a Reload CTA.
  if (document.getElementById('version-toast')) return;
  const toast = document.createElement('div');
  toast.id = 'version-toast';
  toast.className = 'version-toast';
  toast.innerHTML = `
    <div class="v-dot"></div>
    <div class="v-text">
      <strong>New version available</strong>
      <span>${escapeHtml(oldV)} → ${escapeHtml(newV)}</span>
    </div>
    <button type="button" class="v-btn" id="version-reload-btn">Reload</button>
  `;
  document.body.appendChild(toast);
  document.getElementById('version-reload-btn').addEventListener('click', () => {
    // Force reload from server (ignore cache)
    try { window.location.reload(true); } catch { window.location.reload(); }
  });
  // Auto-reload ONLY if admin is not busy — no open modal, no focused input/textarea.
  function isBusy() {
    const modalOpen = Array.from(document.querySelectorAll('.modal'))
      .some(m => m.style.display && m.style.display !== 'none');
    const ae = document.activeElement;
    const editing = ae && /^(input|textarea|select)$/i.test(ae.tagName);
    return modalOpen || editing;
  }
  let elapsed = 0;
  const timer = setInterval(() => {
    elapsed += 1000;
    if (elapsed >= 8000 && !isBusy()) {
      clearInterval(timer);
      try { window.location.reload(true); } catch { window.location.reload(); }
    }
    // Cap wait at 60s — if admin is still busy, they'll click reload themselves.
    if (elapsed >= 60000) clearInterval(timer);
  }, 1000);
}


// ========== Notifications Log ==========
const NOTIF_EVENT_LABELS = {
  activated:   'Activated',
  revoked:     'Revoked',
  suspended:   'Suspended',
  unsuspended: 'Restored',
  expiring:    'Expiring',
  expired:     'Expired',
  test:        'Test',
  custom:      'Custom',
};

async function loadNotifications() {
  const tbody = document.getElementById('notif-tbody');
  if (!tbody) return;
  const q = document.getElementById('notif-search').value.trim();
  const event = document.getElementById('notif-event-filter').value;
  const status = document.getElementById('notif-status-filter').value;
  const qp = new URLSearchParams();
  if (q) qp.append('q', q);
  if (event) qp.append('event', event);
  if (status) qp.append('status', status);
  qp.append('limit', '250');
  try {
    const r = await apiCall('GET', '/admin/notifications' + (qp.toString() ? '?' + qp.toString() : ''));
    // Stats
    const t = r.totals || {};
    document.getElementById('notif-total').textContent     = t.total || 0;
    document.getElementById('notif-delivered').textContent = t.delivered || 0;
    document.getElementById('notif-failed').textContent    = t.failed || 0;
    document.getElementById('notif-skipped').textContent   = t.skipped || 0;
    // Rows
    if (!r.rows.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty">${q || event || status ? 'No notifications match your filters.' : 'No notifications sent yet. Logs appear here when WhatsApp messages are dispatched.'}</td></tr>`;
      return;
    }
    tbody.innerHTML = r.rows.map(row => {
      const t = fmtDT(row.sent_at);
      const eventLab = NOTIF_EVENT_LABELS[row.event] || row.event;
      const eventCls = `notif-event-${row.event}`;
      const keyCell = row.license_key
        ? `<div class="notif-key">${escapeHtml(row.license_key)}</div>`
        : `<div class="notif-key" style="color:var(--text-3)">—</div>`;
      const phoneCell = row.phone ? `+${escapeHtml(row.phone)}` : '<span style="color:var(--text-3)">—</span>';
      const msgCell = row.status === 'failed' || row.status === 'skipped'
        ? `<div class="notif-msg err" title="${escapeHtml(row.error || row.message_preview || '')}">${escapeHtml(row.error || row.message_preview || '—')}</div>`
        : `<div class="notif-msg" title="${escapeHtml(row.message_preview || '')}">${escapeHtml(row.message_preview || '—')}</div>`;
      const retryBtn = (row.status === 'failed' || row.status === 'skipped') && row.license_id && row.event !== 'test' && row.event !== 'custom'
        ? `<button class="btn btn-ghost btn-sm" data-notif-action="retry" data-notif-id="${row.id}">↻ Retry</button>`
        : '';
      return `
        <tr>
          <td class="notif-time">${escapeHtml(t)}</td>
          <td><span class="notif-event-badge ${eventCls}">${escapeHtml(eventLab)}</span></td>
          <td>${keyCell}</td>
          <td class="mono-cell" style="font-size:11px">${phoneCell}</td>
          <td><span class="notif-status ${row.status}">${escapeHtml(row.status)}</span></td>
          <td>${msgCell}</td>
          <td style="text-align:right">${retryBtn}</td>
        </tr>`;
    }).join('');
  } catch (e) {
    if (/401|403|Unauthorized/i.test(e.message)) { logout(); return; }
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Error: ${escapeHtml(e.message)}</td></tr>`;
  }
}

(function wireNotifications() {
  const search = document.getElementById('notif-search');
  const eventFilter = document.getElementById('notif-event-filter');
  const statusFilter = document.getElementById('notif-status-filter');
  const refreshBtn = document.getElementById('notif-refresh-btn');
  const clearBtn = document.getElementById('notif-clear-btn');
  const tbody = document.getElementById('notif-tbody');
  if (!tbody) return;
  let _t;
  search.addEventListener('input', () => { clearTimeout(_t); _t = setTimeout(loadNotifications, 300); });
  eventFilter.addEventListener('change', loadNotifications);
  statusFilter.addEventListener('change', loadNotifications);
  refreshBtn.addEventListener('click', loadNotifications);
  clearBtn.addEventListener('click', async () => {
    if (!confirm('Delete notification log entries older than 30 days? Recent logs will be kept.')) return;
    try {
      const r = await apiCall('DELETE', '/admin/notifications?older_than_days=30');
      alert(`Deleted ${r.deleted} old log entries.`);
      loadNotifications();
    } catch (e) { alert('Clear failed: ' + e.message); }
  });
  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-notif-action]');
    if (!btn) return;
    const id = btn.dataset.notifId;
    const action = btn.dataset.notifAction;
    if (action === 'retry') {
      const lab = btn.querySelector('.btn-label'); const orig = lab.textContent;
      btn.disabled = true; lab.textContent = 'Retrying…';
      try {
        const r = await apiCall('POST', `/admin/notifications/${id}/retry`);
        if (r.success) { alert('✓ Resent successfully'); }
        else { alert('Retry failed: ' + ((r.result && (r.result.error || r.result.reason)) || 'unknown')); }
        loadNotifications();
      } catch (e2) {
        alert('Retry failed: ' + e2.message);
      } finally {
        btn.disabled = false; lab.textContent = orig;
      }
    }
  });
})();

// ========== Offline .mlic Modal ==========
function openMlicModal(licenseId, key, mill, contact) {
  const modal = document.getElementById('mlic-modal');
  const title = document.getElementById('mlic-modal-title');
  const noteEl = document.getElementById('mlic-note');
  const errorEl = document.getElementById('mlic-error');
  const resultEl = document.getElementById('mlic-result');
  modal.dataset.licenseId = licenseId;
  modal.dataset.licenseKey = key;
  modal.dataset.licenseContact = contact || '';
  title.textContent = mill ? `Offline File for ${mill}` : `Offline File for ${key}`;
  noteEl.value = '';
  errorEl.textContent = '';
  resultEl.style.display = 'none';
  modal.style.display = 'flex';
}

document.getElementById('mlic-generate-btn').addEventListener('click', async () => {
  const modal = document.getElementById('mlic-modal');
  const licenseId = modal.dataset.licenseId;
  const note = document.getElementById('mlic-note').value.trim();
  const errorEl = document.getElementById('mlic-error');
  errorEl.textContent = '';
  const btn = document.getElementById('mlic-generate-btn');
  const lab = btn.querySelector('.btn-label'); const orig = lab.textContent;
  btn.disabled = true; lab.textContent = 'Generating…';
  try {
    const r = await apiCall('POST', `/admin/licenses/${licenseId}/generate-mlic`, note ? { note } : {});
    showMlicResult(r);
    // Auto-trigger browser download
    downloadBlob(JSON.stringify(r.payload, null, 2), r.filename || `${modal.dataset.licenseKey}.mlic`);
  } catch (e) {
    errorEl.textContent = e.message || 'Generation failed';
  } finally {
    btn.disabled = false; lab.textContent = orig;
  }
});

document.getElementById('mlic-send-whatsapp-btn').addEventListener('click', async () => {
  const modal = document.getElementById('mlic-modal');
  const licenseId = modal.dataset.licenseId;
  const contact = modal.dataset.licenseContact;
  const note = document.getElementById('mlic-note').value.trim();
  const errorEl = document.getElementById('mlic-error');
  errorEl.textContent = '';
  if (!contact) {
    if (!confirm('No phone number on this license. Send anyway? Admin will need to enter phone.')) return;
  }
  const btn = document.getElementById('mlic-send-whatsapp-btn');
  const lab = btn.querySelector('.btn-label'); const orig = lab.textContent;
  btn.disabled = true; lab.textContent = 'Sending…';
  try {
    const r = await apiCall('POST', `/admin/licenses/${licenseId}/send-mlic-whatsapp`,
      note ? { note } : {});
    if (r.success) {
      showMlicResult({
        filename: `${modal.dataset.licenseKey}.mlic`,
        download_url: r.download_url,
        mlic_id: r.mlic_id,
      });
      lab.textContent = '✓ Sent';
      setTimeout(() => { lab.textContent = orig; }, 2500);
    } else {
      const reason = (r.result && (r.result.error || r.result.reason)) || 'unknown error';
      errorEl.textContent = 'WhatsApp send failed: ' + reason;
      lab.textContent = orig;
    }
  } catch (e) {
    errorEl.textContent = e.message || 'Send failed';
    lab.textContent = orig;
  } finally {
    btn.disabled = false;
  }
});

function showMlicResult(r) {
  const resultEl = document.getElementById('mlic-result');
  document.getElementById('mlic-filename').textContent = r.filename || '—';
  document.getElementById('mlic-download-url').textContent = r.download_url || '—';
  document.getElementById('mlic-download-link').href = r.download_url || '#';
  resultEl.style.display = 'block';
}

document.getElementById('mlic-copy-url-btn').addEventListener('click', async () => {
  const url = document.getElementById('mlic-download-url').textContent;
  try {
    await navigator.clipboard.writeText(url);
    const b = document.getElementById('mlic-copy-url-btn');
    const t = b.textContent; b.textContent = '✓ Copied';
    setTimeout(() => { b.textContent = t; }, 1500);
  } catch {}
});

function downloadBlob(content, filename) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}


// ============= WEBSITE UPDATES (9x.design auto-deploy) =============
(function initWebsiteDeploy() {
  const API_BASE = 'https://9x.design/api/deploy';
  const TOKEN_KEY = '9x_website_deploy_token';

  const $ = (id) => document.getElementById(id);
  const getToken = () => localStorage.getItem(TOKEN_KEY) || '';

  function setStatus(text, state) {
    const box = $('website-status');
    if (!box) return;
    box.className = 'settings-status' + (state ? ' ' + state : '');
    const t = box.querySelector('.status-text');
    if (t) t.textContent = text;
  }
  function showError(msg) {
    const e = $('website-error'); if (!e) return;
    e.textContent = msg; e.style.display = msg ? 'block' : 'none';
    const s = $('website-success'); if (s) s.style.display = 'none';
  }
  function showSuccess(msg) {
    const e = $('website-success'); if (!e) return;
    e.textContent = msg; e.style.display = msg ? 'block' : 'none';
    const x = $('website-error'); if (x) x.style.display = 'none';
  }

  async function deployApi(path, opts) {
    opts = opts || {};
    const token = getToken();
    if (!token) throw new Error('Deploy token not set. Open "Deploy token" below and save your secret.');
    const res = await fetch(API_BASE + path, Object.assign({}, opts, {
      headers: Object.assign({ 'X-Deploy-Token': token }, opts.headers || {}),
    }));
    if (res.status === 401) throw new Error('Invalid deploy token');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || ('HTTP ' + res.status));
    return data;
  }

  async function checkStatus() {
    showError(''); showSuccess('');
    setStatus('Checking…');
    const applyBtn = $('website-apply-btn');
    if (applyBtn) applyBtn.disabled = true;
    try {
      const s = await deployApi('/status');
      $('website-current-sha').textContent = s.current_sha || '—';
      $('website-remote-sha').textContent = s.remote_sha || '—';
      $('website-last-commit').textContent = s.latest_commit || '—';
      $('website-meta').style.display = 'block';
      if (s.has_update) {
        setStatus('Update available. Click "Install Update" to deploy.', 'warn');
        if (applyBtn) applyBtn.disabled = false;
      } else {
        setStatus('Website is up to date.', 'ok');
      }
    } catch (e) {
      setStatus('Error: ' + e.message, 'err');
      showError(e.message);
    }
  }

  async function installUpdate() {
    if (!confirm('Pull latest from GitHub, rebuild frontend, and restart 9x.design?\n\nWebsite will be briefly unavailable (~20s).')) return;
    showError('');
    const btn = $('website-apply-btn');
    btn.disabled = true;
    const lbl = btn.querySelector('.btn-label');
    const origLbl = lbl.textContent;
    lbl.textContent = 'Deploying…';
    setStatus('Deploy running…', 'warn');
    try {
      const r = await deployApi('/run', { method: 'POST' });
      showSuccess(r.message || 'Deploy started');
      $('website-progress').style.display = 'block';
      $('website-progress').textContent = 'Starting…\n';
      let ticks = 0;
      const iv = setInterval(async () => {
        try {
          const l = await deployApi('/logs?tail=250');
          $('website-progress').textContent = l.logs || '';
          $('website-progress').scrollTop = $('website-progress').scrollHeight;
        } catch (_) {}
        if (++ticks > 30) clearInterval(iv);
      }, 3000);
      setTimeout(() => {
        lbl.textContent = origLbl;
        btn.disabled = false;
        checkStatus();
      }, 90000);
    } catch (e) {
      showError(e.message);
      setStatus('Deploy failed', 'err');
      lbl.textContent = origLbl;
      btn.disabled = false;
    }
  }

  const cb = $('website-check-btn'); if (cb) cb.addEventListener('click', checkStatus);
  const ab = $('website-apply-btn'); if (ab) ab.addEventListener('click', installUpdate);
  const tf = $('website-token-form');
  if (tf) tf.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('website-deploy-token').value.trim();
    if (v) {
      localStorage.setItem(TOKEN_KEY, v);
      $('website-deploy-token').value = '';
      showSuccess('Token saved. Click "Check for Updates" to verify.');
    }
  });
  const tc = $('website-token-clear');
  if (tc) tc.addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    showSuccess('Token cleared.');
  });
})();

