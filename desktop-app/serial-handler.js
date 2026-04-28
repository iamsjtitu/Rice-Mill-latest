/**
 * Serial Port Handler for Weighbridge Integration
 * Keshav Computer WetBridge Protocol
 * Default: COM4, 2400 baud, 8N1
 */

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let SerialPort = null;
let activePort = null;
let mainWin = null;
let stableBuffer = [];
let lastWeight = 0;
let isStable = false;
let lastUpdateTime = 0; // timestamp of last serial reading — for staleness detection
const STABLE_COUNT = 3; // 3 consecutive same readings = stable
const STABLE_TOLERANCE = 10; // +/- 10 KG tolerance for stability
const STALE_THRESHOLD_MS = 3000; // 3 sec without serial data → reading is STALE (truck moved off bridge)

// Default config
const DEFAULT_CONFIG = {
  enabled: false,
  port: 'COM4',
  baudRate: 2400,
  dataBits: 8,
  parity: 'none',
  stopBits: 1,
  autoConnect: true,
};

// Try to load serialport module (only available in Electron build)
function loadSerialPort() {
  if (SerialPort) return true;
  try {
    SerialPort = require('serialport');
    return true;
  } catch (e) {
    console.log('[Serial] serialport module not available:', e.message);
    return false;
  }
}

// Get config file path
function getConfigPath() {
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'weighbridge-config.json');
}

// Load weighbridge config
function loadWeighbridgeConfig() {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ...DEFAULT_CONFIG, ...data };
    }
  } catch (e) {
    console.error('[Serial] Config load error:', e.message);
  }
  return { ...DEFAULT_CONFIG };
}

// Save weighbridge config
function saveWeighbridgeConfig(config) {
  try {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (e) {
    console.error('[Serial] Config save error:', e.message);
    return false;
  }
}

// Parse weight from raw serial data
// Supports multiple common weighbridge formats:
// 1. Raw number: "15432\r\n"
// 2. With prefix: "S  15432\r\n" (S=stable, U=unstable)
// 3. Keshav format: "  15432.0  KG\r\n"
// 4. With sign: "+15432\r\n" or "-15432\r\n"
function parseWeight(rawData) {
  const str = rawData.toString().trim();
  if (!str) return null;

  // Extract numeric value (including decimal)
  const match = str.match(/[+-]?\d+\.?\d*/);
  if (!match) return null;

  const weight = Math.round(Math.abs(parseFloat(match[0])));
  if (weight < 0 || weight > 200000 || isNaN(weight)) return null;

  // Check for stable indicator in data
  const hasStableFlag = /^[Ss]/.test(str);

  return { weight, hasStableFlag };
}

// Check stability: 3 consecutive readings within tolerance
function checkStability(newWeight) {
  stableBuffer.push(newWeight);
  if (stableBuffer.length > STABLE_COUNT) {
    stableBuffer.shift();
  }

  if (stableBuffer.length >= STABLE_COUNT) {
    const avg = stableBuffer.reduce((a, b) => a + b, 0) / stableBuffer.length;
    const allClose = stableBuffer.every(w => Math.abs(w - avg) <= STABLE_TOLERANCE);
    return allClose;
  }
  return false;
}

// Open serial port connection
function openPort(config) {
  if (!loadSerialPort()) {
    sendToRenderer('serial-error', { error: 'serialport module not installed' });
    return;
  }

  closePort(); // Close any existing connection

  const portConfig = {
    path: config.port,
    baudRate: config.baudRate || 2400,
    dataBits: config.dataBits || 8,
    parity: config.parity || 'none',
    stopBits: config.stopBits || 1,
    autoOpen: false,
  };

  try {
    activePort = new SerialPort.SerialPort(portConfig);

    // Use raw data handler instead of ReadlineParser for better compatibility
    // Many Indian weighbridges use different line endings (\r, \n, \r\n, or none)
    let rawBuffer = '';
    activePort.on('data', (chunk) => {
      rawBuffer += chunk.toString();
      // Try to extract weight from accumulated buffer
      // Split on any line ending or when buffer exceeds threshold
      const lines = rawBuffer.split(/[\r\n]+/);
      // Process all complete lines (keep last incomplete chunk in buffer)
      rawBuffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parsed = parseWeight(trimmed);
        if (parsed) {
          lastWeight = parsed.weight;
          lastUpdateTime = Date.now();
          const wasStable = isStable;
          isStable = parsed.hasStableFlag || checkStability(parsed.weight);

          const payload = {
            weight: parsed.weight,
            stable: isStable,
            raw: trimmed,
            timestamp: Date.now()
          };
          sendToRenderer('serial-weight', payload);
          emitWeight(payload);

          if (isStable && !wasStable) {
            console.log(`[Serial] Weight STABLE at ${parsed.weight} KG`);
          }
        }
      }
      // Fallback: if buffer grows too large (no line endings), try to parse it directly
      if (rawBuffer.length > 50) {
        const parsed = parseWeight(rawBuffer);
        if (parsed) {
          lastWeight = parsed.weight;
          lastUpdateTime = Date.now();
          isStable = parsed.hasStableFlag || checkStability(parsed.weight);
          const payload = {
            weight: parsed.weight,
            stable: isStable,
            raw: rawBuffer.trim(),
            timestamp: Date.now()
          };
          sendToRenderer('serial-weight', payload);
          emitWeight(payload);
        }
        rawBuffer = '';
      }
    });

    activePort.open((err) => {
      if (err) {
        console.error('[Serial] Port open error:', err.message);
        sendToRenderer('serial-status', { connected: false, error: err.message });
        return;
      }
      console.log(`[Serial] Connected to ${config.port} at ${config.baudRate} baud`);
      stableBuffer = [];
      isStable = false;
      sendToRenderer('serial-status', { connected: true, port: config.port, baudRate: config.baudRate });
    });

    activePort.on('error', (err) => {
      console.error('[Serial] Port error:', err.message);
      sendToRenderer('serial-status', { connected: false, error: err.message });
    });

    activePort.on('close', () => {
      console.log('[Serial] Port closed');
      sendToRenderer('serial-status', { connected: false });
    });

  } catch (e) {
    console.error('[Serial] Open error:', e.message);
    sendToRenderer('serial-error', { error: e.message });
  }
}

// Close port
function closePort() {
  if (activePort && activePort.isOpen) {
    try {
      activePort.close();
    } catch (e) {
      console.error('[Serial] Close error:', e.message);
    }
  }
  activePort = null;
  stableBuffer = [];
  isStable = false;
  lastWeight = 0;
}

// Send data to renderer
function sendToRenderer(channel, data) {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send(channel, data);
  }
}

// List available COM ports
async function listPorts() {
  if (!loadSerialPort()) return [];
  try {
    const ports = await SerialPort.SerialPort.list();
    return ports.map(p => ({
      path: p.path,
      manufacturer: p.manufacturer || '',
      vendorId: p.vendorId || '',
      productId: p.productId || '',
      serialNumber: p.serialNumber || '',
    }));
  } catch (e) {
    console.error('[Serial] List ports error:', e.message);
    return [];
  }
}

// Initialize serial handler
function initSerialHandler(window) {
  mainWin = window;

  // IPC: Get weighbridge config
  ipcMain.handle('serial-get-config', async () => {
    return loadWeighbridgeConfig();
  });

  // IPC: Save weighbridge config
  ipcMain.handle('serial-save-config', async (_event, config) => {
    const saved = saveWeighbridgeConfig(config);
    return { success: saved };
  });

  // IPC: List available COM ports
  ipcMain.handle('serial-list-ports', async () => {
    return await listPorts();
  });

  // IPC: Connect to port
  ipcMain.on('serial-connect', (_event, config) => {
    const cfg = config || loadWeighbridgeConfig();
    openPort(cfg);
  });

  // IPC: Disconnect
  ipcMain.on('serial-disconnect', () => {
    closePort();
    sendToRenderer('serial-status', { connected: false });
  });

  // IPC: Get current status
  ipcMain.handle('serial-get-status', async () => {
    const stale = lastUpdateTime > 0 && (Date.now() - lastUpdateTime) > STALE_THRESHOLD_MS;
    return {
      connected: activePort && activePort.isOpen,
      weight: stale ? 0 : lastWeight,
      stable: stale ? false : isStable,
      stale,
    };
  });

  // Auto-connect if enabled
  const config = loadWeighbridgeConfig();
  if (config.enabled && config.autoConnect) {
    setTimeout(() => {
      console.log(`[Serial] Auto-connecting to ${config.port}...`);
      openPort(config);
    }, 3000);
  }

  // Periodic staleness checker: if no serial data for >3 sec, emit weight=0 to UI
  // This unfreezes the "STABLE - LOCKED" display when truck moves off the bridge
  let wasStale = false;
  setInterval(() => {
    if (!activePort || !activePort.isOpen) return;
    const stale = lastUpdateTime > 0 && (Date.now() - lastUpdateTime) > STALE_THRESHOLD_MS;
    if (stale && !wasStale) {
      console.log('[Serial] Weight reading STALE — bridge idle, resetting display to 0');
      isStable = false;
      stableBuffer = [];
      const payload = { weight: 0, stable: false, raw: 'STALE', timestamp: Date.now(), stale: true };
      sendToRenderer('serial-weight', payload);
      emitWeight(payload);
      wasStale = true;
    } else if (!stale && wasStale) {
      wasStale = false;
    }
  }, 1000);
}

// Cleanup
function cleanupSerial() {
  closePort();
}

// Weight subscribers for realtime broadcast (e.g. WebSocket push)
const weightSubscribers = new Set();
function subscribeWeight(fn) {
  weightSubscribers.add(fn);
  return () => weightSubscribers.delete(fn);
}
function emitWeight(payload) {
  for (const fn of weightSubscribers) {
    try { fn(payload); } catch (_) { /* ignore subscriber errors */ }
  }
}

// Get current weight status (for REST API / LAN access)
function getWeightStatus() {
  const stale = lastUpdateTime > 0 && (Date.now() - lastUpdateTime) > STALE_THRESHOLD_MS;
  return {
    connected: !!(activePort && activePort.isOpen),
    weight: stale ? 0 : lastWeight,
    stable: stale ? false : isStable,
    stale,
    timestamp: Date.now()
  };
}

module.exports = { initSerialHandler, cleanupSerial, getWeightStatus, subscribeWeight };
