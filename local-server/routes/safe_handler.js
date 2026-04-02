const fs = require('fs');
const path = require('path');

let errorLogPath;
try {
  const { app } = require('electron');
  errorLogPath = path.join(app.getPath('userData'), 'mill-entry-error.log');
} catch (_) {
  errorLogPath = path.join(__dirname, '..', 'mill-entry-error.log');
}

function logError(context, err) {
  const timestamp = new Date().toISOString();
  const msg = `[${timestamp}] [${context}] ${err && err.stack ? err.stack : err}\n`;
  try { fs.appendFileSync(errorLogPath, msg); } catch (_) {}
  console.error(msg);
}

function safeAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      logError('ASYNC_ROUTE_ERROR: ' + req.method + ' ' + req.originalUrl, err);
      if (!res.headersSent) {
        res.status(500).json({ detail: 'Internal server error', error_message: err.message || String(err) });
      }
    });
  };
}

function safeSync(fn) {
  return (req, res, next) => {
    try {
      const result = fn(req, res, next);
      if (result && typeof result.catch === 'function') {
        result.catch((err) => {
          logError('ASYNC_ROUTE_ERROR: ' + req.method + ' ' + req.originalUrl, err);
          if (!res.headersSent) {
            res.status(500).json({ detail: 'Internal server error' });
          }
        });
      }
    } catch (err) {
      logError('SYNC_ROUTE_ERROR: ' + req.method + ' ' + req.originalUrl, err);
      if (!res.headersSent) {
        res.status(500).json({ detail: 'Internal server error' });
      }
    }
  };
}

module.exports = { safeAsync, safeSync, safeHandler: safeAsync, logError };
