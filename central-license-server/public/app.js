// MillEntry Central License Admin — Dashboard SPA (vanilla JS)

const API = '/api';
const state = { token: null, email: null, licenses: [], stats: null };

// ========== Auth ==========
function getToken() { return state.token || localStorage.getItem('admin_token'); }
function setToken(t, email) {
  state.token = t; state.email = email;
  if (t) { localStorage.setItem('admin_token', t); localStorage.setItem('admin_email', email); }
  else { localStorage.removeItem('admin_token'); localStorage.removeItem('admin_email'); }
}
function restoreSession() {
  const t = localStorage.getItem('admin_token');
  const e = localStorage.getItem('admin_email');
  if (t && e) { state.token = t; state.email = e; }
}

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

function logout() {
  setToken(null, null);
  showLogin();
}

// ========== View Management ==========
function showLogin() {
  document.getElementById('login-view').style.display = 'flex';
  document.getElementById('dashboard-view').style.display = 'none';
}
function showDashboard() {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('dashboard-view').style.display = 'block';
  document.getElementById('user-email').textContent = state.email || '';
  loadDashboard();
}

async function loadDashboard() {
  await Promise.all([loadStats(), loadLicenses()]);
}

async function loadStats() {
  try {
    const s = await apiCall('GET', '/admin/stats');
    state.stats = s;
    document.getElementById('stat-total').textContent = s.total_licenses;
    document.getElementById('stat-active').textContent = s.active_licenses;
    document.getElementById('stat-expired').textContent = s.expired_licenses;
    document.getElementById('stat-revoked').textContent = s.revoked_licenses;
    document.getElementById('stat-online').textContent = s.currently_online;
  } catch (e) {
    if (/401|403/.test(e.message) || /Unauthorized/i.test(e.message)) { logout(); return; }
    console.error('Stats:', e);
  }
}

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
    document.getElementById('license-tbody').innerHTML = `<tr><td colspan="11" class="empty">Error: ${e.message}</td></tr>`;
  }
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
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="11" class="empty">No licenses yet. Click "New License" to create one.</td></tr>'; return; }
  tbody.innerHTML = rows.map(r => {
    const now = new Date();
    const isExpired = r.expires_at && new Date(r.expires_at) < now;
    let statusBadge = '';
    if (r.status === 'revoked') statusBadge = '<span class="badge badge-revoked">Revoked</span>';
    else if (isExpired) statusBadge = '<span class="badge badge-expired">Expired</span>';
    else statusBadge = '<span class="badge badge-active">Active</span>';
    if (r.is_master) statusBadge += ' <span class="badge badge-master">MASTER</span>';
    const online = r.last_seen_at && (Date.now() - new Date(r.last_seen_at).getTime()) < 10 * 60 * 1000;
    const pcText = r.current_pc && (r.current_pc.hostname || r.current_pc.platform)
      ? `${r.current_pc.hostname || ''} ${r.current_pc.platform ? `(${r.current_pc.platform})` : ''}`.trim()
      : (r.current_machine ? r.current_machine.slice(0, 8) + '…' : '—');
    const seenText = online ? '<span class="badge badge-online">LIVE</span>' : fmtDT(r.last_seen_at);
    return `
      <tr>
        <td class="mono">${r.key}</td>
        <td>${escapeHtml(r.customer_name)}</td>
        <td>${escapeHtml(r.mill_name)}</td>
        <td>${escapeHtml(r.contact || '—')}</td>
        <td>${r.plan}</td>
        <td>${fmtD(r.issued_at)}</td>
        <td>${r.expires_at ? fmtD(r.expires_at) : 'Never'}</td>
        <td>${statusBadge}</td>
        <td>${escapeHtml(pcText)}</td>
        <td>${seenText}</td>
        <td><div class="action-btns">
          ${r.status === 'active' ? `<button class="btn-ghost btn-sm" data-action="reset" data-id="${r.id}" title="Reset machine binding so customer can re-activate on another PC">Reset PC</button>` : ''}
          ${r.status !== 'revoked' && !r.is_master ? `<button class="btn-danger btn-sm" data-action="revoke" data-id="${r.id}">Revoke</button>` : ''}
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
  const err = document.getElementById('login-error');
  err.textContent = '';
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  try {
    await login(email, password);
    showDashboard();
  } catch (e2) {
    err.textContent = e2.message || 'Login failed';
  }
});

document.getElementById('logout-btn').addEventListener('click', logout);
document.getElementById('refresh-btn').addEventListener('click', loadDashboard);
document.getElementById('search').addEventListener('input', debounce(loadLicenses, 300));
document.getElementById('filter-status').addEventListener('change', loadLicenses);

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Open/close modals
document.getElementById('create-license-btn').addEventListener('click', () => {
  document.getElementById('create-modal').style.display = 'flex';
  document.getElementById('create-error').textContent = '';
  document.getElementById('create-form').reset();
});
document.querySelectorAll('[data-close-modal]').forEach(b => {
  b.addEventListener('click', () => { document.getElementById(b.dataset.closeModal).style.display = 'none'; });
});

// Create license
document.getElementById('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('create-error'); err.textContent = '';
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  if (body.expires_at === '') delete body.expires_at;
  try {
    const res = await apiCall('POST', '/admin/licenses', body);
    document.getElementById('create-modal').style.display = 'none';
    document.getElementById('new-key-display').textContent = res.license.key;
    document.getElementById('success-modal').style.display = 'flex';
    loadDashboard();
  } catch (e2) {
    err.textContent = e2.message || 'Create failed';
  }
});

// Copy key
document.getElementById('copy-key-btn').addEventListener('click', async () => {
  const key = document.getElementById('new-key-display').textContent;
  try { await navigator.clipboard.writeText(key); const btn = document.getElementById('copy-key-btn'); const t = btn.textContent; btn.textContent = '✓ Copied!'; setTimeout(() => btn.textContent = t, 1500); } catch {}
});

// Table action buttons (event delegation)
document.getElementById('license-tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if (action === 'revoke') {
    if (!confirm('Revoke this license? Customer will lose access immediately.')) return;
    try { await apiCall('POST', `/admin/licenses/${id}/revoke`); loadDashboard(); }
    catch (e2) { alert('Revoke failed: ' + e2.message); }
  } else if (action === 'reset') {
    if (!confirm('Reset machine binding? Current active PC will be kicked off at next heartbeat.')) return;
    try { await apiCall('POST', `/admin/licenses/${id}/reset-machine`); loadDashboard(); }
    catch (e2) { alert('Reset failed: ' + e2.message); }
  }
});

// Init
restoreSession();
if (getToken()) {
  apiCall('GET', '/auth/me').then(d => { state.email = d.email; showDashboard(); }).catch(() => showLogin());
} else {
  showLogin();
}
