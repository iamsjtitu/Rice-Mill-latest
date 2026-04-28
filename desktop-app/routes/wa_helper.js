/**
 * WhatsApp provider helper — supports 360messenger (default) and wa.9x.design
 * (drop-in compatible API). Path stays `/v2/...` for both providers; only the
 * hostname differs.
 *
 * Usage:
 *   const { waHostname, waPathPrefix } = require('./wa_helper');
 *   const settings = (database.data.app_settings || []).find(s => s.setting_id === 'whatsapp_config') || {};
 *   const opts = { hostname: waHostname(settings), path: `${waPathPrefix(settings)}/sendMessage`, ... };
 */

const PROVIDER_HOSTS = {
  '360messenger': 'api.360messenger.com',
  'wa9x': 'wa.9x.design',
};

function waProvider(settings) {
  const p = String((settings && settings.wa_provider) || '360messenger').toLowerCase();
  return PROVIDER_HOSTS[p] ? p : '360messenger';
}

function waHostname(settings) {
  return PROVIDER_HOSTS[waProvider(settings)];
}

// wa.9x.design uses /api/v2/* while 360messenger uses /v2/*
function waPathPrefix(settings) {
  return waProvider(settings) === 'wa9x' ? '/api/v2' : '/v2';
}

module.exports = { waHostname, waPathPrefix, waProvider, PROVIDER_HOSTS };
