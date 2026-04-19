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
    settings: ['SETTINGS', 'Server Configuration']
  };
  const [over, title] = overTitle[view] || overTitle.overview;
  document.getElementById('page-overline').textContent = over;
  document.getElementById('page-title').textContent = title;
  document.getElementById('overview-section').style.display = view === 'overview' ? 'block' : 'none';
  document.getElementById('licenses-section').style.display = view === 'licenses' ? 'block' : 'none';
  document.getElementById('settings-section').style.display = view === 'settings' ? 'block' : 'none';
  if (view === 'settings') loadSettings();
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
    if (r.status === 'revoked') statusBadge = '<span class="badge badge-revoked">Revoked</span>';
    else if (isExpired) statusBadge = '<span class="badge badge-expired">Expired</span>';
    else statusBadge = '<span class="badge badge-active">Active</span>';
    if (r.is_master) statusBadge += ' <span class="badge badge-master">Master</span>';
    const online = r.last_seen_at && (Date.now() - new Date(r.last_seen_at).getTime()) < 10 * 60 * 1000;
    const pcText = r.current_pc && (r.current_pc.hostname || r.current_pc.platform)
      ? `${r.current_pc.hostname || ''}${r.current_pc.platform ? ' · ' + r.current_pc.platform : ''}`.trim()
      : (r.current_machine ? r.current_machine.slice(0, 10) + '…' : '—');
    const seenText = online ? '<span class="badge badge-live">Live</span>' : fmtDT(r.last_seen_at);
    const planLabel = r.plan === 'lifetime' ? 'Lifetime' : r.plan === 'yearly' ? 'Yearly' : r.plan === 'trial' ? 'Trial' : r.plan;
    return `
      <tr>
        <td class="mono-cell">${r.key}</td>
        <td><div class="cell-main">${escapeHtml(r.customer_name)}</div><div class="cell-sub">${escapeHtml(r.contact || '—')}</div></td>
        <td><div class="cell-main">${escapeHtml(r.mill_name)}</div></td>
        <td class="mono-cell">${planLabel}</td>
        <td class="mono-cell">${fmtD(r.issued_at)}</td>
        <td class="mono-cell">${r.expires_at ? fmtD(r.expires_at) : '<span style="color:var(--text-3)">Never</span>'}</td>
        <td>${statusBadge}</td>
        <td><div class="cell-main" style="font-size:12px">${escapeHtml(pcText)}</div></td>
        <td>${seenText}</td>
        <td><div class="action-group">
          ${r.status === 'active' ? `<button class="btn btn-ghost btn-sm" data-action="reset" data-id="${r.id}" title="Reset machine binding">Reset PC</button>` : ''}
          ${r.status !== 'revoked' && !r.is_master ? `<button class="btn btn-danger btn-sm" data-action="revoke" data-id="${r.id}">Revoke</button>` : ''}
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
