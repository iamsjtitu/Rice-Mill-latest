const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

let mainWindow;
let splashWindow;
let dataPath = null;
let db = null;
let server = null;

// Config file path
const configPath = path.join(app.getPath('userData'), 'config.json');

// Load saved config
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config;
    }
  } catch (e) {
    console.error('Config load error:', e);
  }
  return { recentPaths: [] };
}

// Save config
function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Config save error:', e);
  }
}

// Initialize SQLite Database
function initDatabase(dbPath) {
  const Database = require('better-sqlite3');
  const dbFile = path.join(dbPath, 'millentry.db');
  
  db = new Database(dbFile);
  
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS branding (
      id INTEGER PRIMARY KEY DEFAULT 1,
      company_name TEXT DEFAULT 'Mill Entry System',
      tagline TEXT DEFAULT 'Data Management System',
      updated_at TEXT
    );
    
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'staff'
    );
    
    CREATE TABLE IF NOT EXISTS mill_entries (
      id TEXT PRIMARY KEY,
      date TEXT,
      kms_year TEXT,
      season TEXT,
      truck_no TEXT,
      rst_no TEXT,
      tp_no TEXT,
      agent_name TEXT,
      mandi_name TEXT,
      kg REAL DEFAULT 0,
      qntl REAL DEFAULT 0,
      bag INTEGER DEFAULT 0,
      g_deposite REAL DEFAULT 0,
      gbw_cut REAL DEFAULT 0,
      mill_w REAL DEFAULT 0,
      plastic_bag INTEGER DEFAULT 0,
      p_pkt_cut REAL DEFAULT 0,
      moisture REAL DEFAULT 0,
      moisture_cut REAL DEFAULT 0,
      moisture_cut_percent REAL DEFAULT 0,
      cutting_percent REAL DEFAULT 0,
      cutting REAL DEFAULT 0,
      disc_dust_poll REAL DEFAULT 0,
      final_w REAL DEFAULT 0,
      g_issued REAL DEFAULT 0,
      cash_paid REAL DEFAULT 0,
      diesel_paid REAL DEFAULT 0,
      remark TEXT,
      created_by TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    
    CREATE TABLE IF NOT EXISTS mandi_targets (
      id TEXT PRIMARY KEY,
      mandi_name TEXT,
      target_qntl REAL,
      cutting_percent REAL,
      expected_total REAL,
      base_rate REAL DEFAULT 10,
      cutting_rate REAL DEFAULT 5,
      kms_year TEXT,
      season TEXT,
      created_by TEXT,
      created_at TEXT
    );
    
    CREATE TABLE IF NOT EXISTS truck_payments (
      entry_id TEXT PRIMARY KEY,
      rate_per_qntl REAL DEFAULT 32,
      paid_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      payment_history TEXT DEFAULT '[]'
    );
    
    CREATE TABLE IF NOT EXISTS agent_payments (
      id TEXT PRIMARY KEY,
      mandi_name TEXT,
      kms_year TEXT,
      season TEXT,
      paid_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      payment_history TEXT DEFAULT '[]'
    );
  `);
  
  // Insert default users if not exist
  const adminExists = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', 'admin123', 'admin');
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('staff', 'staff123', 'staff');
  }
  
  // Insert default branding if not exist
  const brandingExists = db.prepare('SELECT * FROM branding WHERE id = 1').get();
  if (!brandingExists) {
    db.prepare('INSERT INTO branding (id, company_name, tagline) VALUES (1, ?, ?)').run('Mill Entry System', 'Data Management System');
  }
  
  console.log('Database initialized at:', dbFile);
  return db;
}

// Create Express API Server
function createApiServer() {
  const apiApp = express();
  apiApp.use(cors());
  apiApp.use(express.json());
  
  // ========== AUTH ROUTES ==========
  apiApp.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (user && user.password === password) {
      res.json({ success: true, username: user.username, role: user.role, message: 'Login successful' });
    } else {
      res.status(401).json({ detail: 'Invalid credentials' });
    }
  });
  
  apiApp.post('/api/auth/change-password', (req, res) => {
    const { username, current_password, new_password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (!user || user.password !== current_password) {
      return res.status(401).json({ detail: 'Current password galat hai' });
    }
    
    db.prepare('UPDATE users SET password = ? WHERE username = ?').run(new_password, username);
    res.json({ success: true, message: 'Password change ho gaya' });
  });
  
  // ========== BRANDING ROUTES ==========
  apiApp.get('/api/branding', (req, res) => {
    const branding = db.prepare('SELECT * FROM branding WHERE id = 1').get();
    res.json(branding || { company_name: 'Mill Entry System', tagline: 'Data Management System' });
  });
  
  apiApp.put('/api/branding', (req, res) => {
    const { company_name, tagline } = req.body;
    const updated_at = new Date().toISOString();
    
    db.prepare('UPDATE branding SET company_name = ?, tagline = ?, updated_at = ? WHERE id = 1')
      .run(company_name, tagline, updated_at);
    
    res.json({ success: true, message: 'Branding update ho gaya', branding: { company_name, tagline } });
  });
  
  // ========== ENTRIES ROUTES ==========
  apiApp.get('/api/entries', (req, res) => {
    let query = 'SELECT * FROM mill_entries WHERE 1=1';
    const params = [];
    
    if (req.query.kms_year) {
      query += ' AND kms_year = ?';
      params.push(req.query.kms_year);
    }
    if (req.query.season) {
      query += ' AND season = ?';
      params.push(req.query.season);
    }
    if (req.query.truck_no) {
      query += ' AND truck_no LIKE ?';
      params.push(`%${req.query.truck_no}%`);
    }
    if (req.query.rst_no) {
      query += ' AND rst_no LIKE ?';
      params.push(`%${req.query.rst_no}%`);
    }
    if (req.query.tp_no) {
      query += ' AND tp_no LIKE ?';
      params.push(`%${req.query.tp_no}%`);
    }
    if (req.query.agent_name) {
      query += ' AND agent_name LIKE ?';
      params.push(`%${req.query.agent_name}%`);
    }
    if (req.query.mandi_name) {
      query += ' AND mandi_name LIKE ?';
      params.push(`%${req.query.mandi_name}%`);
    }
    if (req.query.date_from) {
      query += ' AND date >= ?';
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      query += ' AND date <= ?';
      params.push(req.query.date_to);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const entries = db.prepare(query).all(...params);
    res.json(entries);
  });
  
  apiApp.post('/api/entries', (req, res) => {
    const data = req.body;
    const id = uuidv4();
    const created_at = new Date().toISOString();
    
    // Auto calculations
    const kg = data.kg || 0;
    const gbw_cut = data.gbw_cut || 0;
    const plastic_bag = data.plastic_bag || 0;
    const cutting_percent = data.cutting_percent || 0;
    const moisture = data.moisture || 0;
    const disc_dust_poll = data.disc_dust_poll || 0;
    
    const qntl = kg / 100;
    const mill_w = kg - gbw_cut;
    const mill_w_qntl = mill_w / 100;
    const p_pkt_cut = plastic_bag * 0.5;
    
    const moisture_cut_percent = Math.max(0, moisture - 17);
    const moisture_cut = (mill_w_qntl * moisture_cut_percent) / 100 * 100;
    
    const cutting = (mill_w_qntl * cutting_percent) / 100 * 100;
    
    const final_w = mill_w - p_pkt_cut - moisture_cut - cutting - disc_dust_poll;
    
    db.prepare(`
      INSERT INTO mill_entries (
        id, date, kms_year, season, truck_no, rst_no, tp_no, agent_name, mandi_name,
        kg, qntl, bag, g_deposite, gbw_cut, mill_w, plastic_bag, p_pkt_cut,
        moisture, moisture_cut, moisture_cut_percent, cutting_percent, cutting,
        disc_dust_poll, final_w, g_issued, cash_paid, diesel_paid, remark,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.date, data.kms_year, data.season, data.truck_no, data.rst_no || '', data.tp_no || '',
      data.agent_name, data.mandi_name, kg, qntl, data.bag || 0, data.g_deposite || 0,
      gbw_cut, mill_w, plastic_bag, p_pkt_cut, moisture, moisture_cut, moisture_cut_percent,
      cutting_percent, cutting, disc_dust_poll, final_w, data.g_issued || 0,
      data.cash_paid || 0, data.diesel_paid || 0, data.remark || '',
      req.query.username || 'admin', created_at, created_at
    );
    
    const entry = db.prepare('SELECT * FROM mill_entries WHERE id = ?').get(id);
    res.json(entry);
  });
  
  apiApp.put('/api/entries/:id', (req, res) => {
    const { id } = req.params;
    const data = req.body;
    const updated_at = new Date().toISOString();
    
    // Recalculate
    const kg = data.kg || 0;
    const gbw_cut = data.gbw_cut || 0;
    const plastic_bag = data.plastic_bag || 0;
    const cutting_percent = data.cutting_percent || 0;
    const moisture = data.moisture || 0;
    const disc_dust_poll = data.disc_dust_poll || 0;
    
    const qntl = kg / 100;
    const mill_w = kg - gbw_cut;
    const mill_w_qntl = mill_w / 100;
    const p_pkt_cut = plastic_bag * 0.5;
    const moisture_cut_percent = Math.max(0, moisture - 17);
    const moisture_cut = (mill_w_qntl * moisture_cut_percent) / 100 * 100;
    const cutting = (mill_w_qntl * cutting_percent) / 100 * 100;
    const final_w = mill_w - p_pkt_cut - moisture_cut - cutting - disc_dust_poll;
    
    db.prepare(`
      UPDATE mill_entries SET
        date = ?, kms_year = ?, season = ?, truck_no = ?, rst_no = ?, tp_no = ?,
        agent_name = ?, mandi_name = ?, kg = ?, qntl = ?, bag = ?, g_deposite = ?,
        gbw_cut = ?, mill_w = ?, plastic_bag = ?, p_pkt_cut = ?, moisture = ?,
        moisture_cut = ?, moisture_cut_percent = ?, cutting_percent = ?, cutting = ?,
        disc_dust_poll = ?, final_w = ?, g_issued = ?, cash_paid = ?, diesel_paid = ?,
        remark = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.date, data.kms_year, data.season, data.truck_no, data.rst_no || '', data.tp_no || '',
      data.agent_name, data.mandi_name, kg, qntl, data.bag || 0, data.g_deposite || 0,
      gbw_cut, mill_w, plastic_bag, p_pkt_cut, moisture, moisture_cut, moisture_cut_percent,
      cutting_percent, cutting, disc_dust_poll, final_w, data.g_issued || 0,
      data.cash_paid || 0, data.diesel_paid || 0, data.remark || '', updated_at, id
    );
    
    const entry = db.prepare('SELECT * FROM mill_entries WHERE id = ?').get(id);
    res.json(entry);
  });
  
  apiApp.delete('/api/entries/:id', (req, res) => {
    db.prepare('DELETE FROM mill_entries WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });
  
  apiApp.post('/api/entries/bulk-delete', (req, res) => {
    const { entry_ids } = req.body;
    const placeholders = entry_ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM mill_entries WHERE id IN (${placeholders})`).run(...entry_ids);
    res.json({ success: true, deleted: entry_ids.length });
  });
  
  // ========== TOTALS ==========
  apiApp.get('/api/totals', (req, res) => {
    let query = 'SELECT * FROM mill_entries WHERE 1=1';
    const params = [];
    
    if (req.query.kms_year) {
      query += ' AND kms_year = ?';
      params.push(req.query.kms_year);
    }
    if (req.query.season) {
      query += ' AND season = ?';
      params.push(req.query.season);
    }
    
    const entries = db.prepare(query).all(...params);
    
    const totals = entries.reduce((acc, e) => ({
      total_kg: acc.total_kg + (e.kg || 0),
      total_qntl: acc.total_qntl + (e.qntl || 0),
      total_bag: acc.total_bag + (e.bag || 0),
      total_g_deposite: acc.total_g_deposite + (e.g_deposite || 0),
      total_gbw_cut: acc.total_gbw_cut + (e.gbw_cut || 0),
      total_mill_w: acc.total_mill_w + (e.mill_w || 0),
      total_p_pkt_cut: acc.total_p_pkt_cut + (e.p_pkt_cut || 0),
      total_cutting: acc.total_cutting + (e.cutting || 0),
      total_disc_dust_poll: acc.total_disc_dust_poll + (e.disc_dust_poll || 0),
      total_final_w: acc.total_final_w + (e.final_w || 0),
      total_g_issued: acc.total_g_issued + (e.g_issued || 0),
      total_cash_paid: acc.total_cash_paid + (e.cash_paid || 0),
      total_diesel_paid: acc.total_diesel_paid + (e.diesel_paid || 0)
    }), {
      total_kg: 0, total_qntl: 0, total_bag: 0, total_g_deposite: 0,
      total_gbw_cut: 0, total_mill_w: 0, total_p_pkt_cut: 0, total_cutting: 0,
      total_disc_dust_poll: 0, total_final_w: 0, total_g_issued: 0,
      total_cash_paid: 0, total_diesel_paid: 0
    });
    
    res.json(totals);
  });
  
  // ========== SUGGESTIONS ==========
  apiApp.get('/api/suggestions/trucks', (req, res) => {
    const trucks = db.prepare('SELECT DISTINCT truck_no FROM mill_entries WHERE truck_no != ""').all();
    res.json(trucks.map(t => t.truck_no));
  });
  
  apiApp.get('/api/suggestions/agents', (req, res) => {
    const agents = db.prepare('SELECT DISTINCT agent_name FROM mill_entries WHERE agent_name != ""').all();
    res.json(agents.map(a => a.agent_name));
  });
  
  apiApp.get('/api/suggestions/mandis', (req, res) => {
    const mandis = db.prepare('SELECT DISTINCT mandi_name FROM mill_entries WHERE mandi_name != ""').all();
    res.json(mandis.map(m => m.mandi_name));
  });
  
  // ========== MANDI TARGETS ==========
  apiApp.get('/api/mandi-targets', (req, res) => {
    let query = 'SELECT * FROM mandi_targets WHERE 1=1';
    const params = [];
    
    if (req.query.kms_year) {
      query += ' AND kms_year = ?';
      params.push(req.query.kms_year);
    }
    if (req.query.season) {
      query += ' AND season = ?';
      params.push(req.query.season);
    }
    
    const targets = db.prepare(query).all(...params);
    res.json(targets);
  });
  
  apiApp.post('/api/mandi-targets', (req, res) => {
    const data = req.body;
    const id = uuidv4();
    const created_at = new Date().toISOString();
    const expected_total = data.target_qntl + (data.target_qntl * data.cutting_percent / 100);
    
    db.prepare(`
      INSERT INTO mandi_targets (id, mandi_name, target_qntl, cutting_percent, expected_total, base_rate, cutting_rate, kms_year, season, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.mandi_name, data.target_qntl, data.cutting_percent, expected_total, data.base_rate || 10, data.cutting_rate || 5, data.kms_year, data.season, req.query.username || 'admin', created_at);
    
    const target = db.prepare('SELECT * FROM mandi_targets WHERE id = ?').get(id);
    res.json(target);
  });
  
  apiApp.delete('/api/mandi-targets/:id', (req, res) => {
    db.prepare('DELETE FROM mandi_targets WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });
  
  // Start server on random available port
  return new Promise((resolve) => {
    server = apiApp.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      console.log(`API Server running on port ${port}`);
      resolve(port);
    });
  });
}

// Create Splash/Data Selection Window
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 600,
    height: 500,
    frame: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  const config = loadConfig();
  
  const splashHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          color: white;
          height: 100vh;
          display: flex;
          flex-direction: column;
        }
        .header {
          background: #0f172a;
          padding: 20px;
          text-align: center;
          border-bottom: 2px solid #f59e0b;
        }
        .header h1 { color: #f59e0b; font-size: 24px; }
        .header p { color: #94a3b8; font-size: 12px; margin-top: 5px; }
        .content { flex: 1; padding: 20px; overflow-y: auto; }
        .section-title { color: #f59e0b; font-size: 14px; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
        .recent-list { margin-bottom: 20px; }
        .recent-item {
          background: #334155;
          padding: 12px 15px;
          border-radius: 8px;
          margin-bottom: 8px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.2s;
        }
        .recent-item:hover { background: #475569; transform: translateX(5px); }
        .recent-item .path { font-size: 13px; }
        .recent-item .arrow { color: #f59e0b; }
        .btn-group { display: flex; gap: 10px; margin-top: 20px; }
        .btn {
          flex: 1;
          padding: 15px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
        }
        .btn-primary { background: #f59e0b; color: #0f172a; font-weight: bold; }
        .btn-primary:hover { background: #fbbf24; }
        .btn-secondary { background: #334155; color: white; }
        .btn-secondary:hover { background: #475569; }
        .footer {
          background: #0f172a;
          padding: 10px;
          text-align: center;
          font-size: 11px;
          color: #64748b;
        }
        .empty-state { text-align: center; padding: 30px; color: #64748b; }
        .close-btn {
          position: absolute;
          top: 10px;
          right: 15px;
          background: none;
          border: none;
          color: #64748b;
          font-size: 20px;
          cursor: pointer;
        }
        .close-btn:hover { color: #ef4444; }
      </style>
    </head>
    <body>
      <button class="close-btn" onclick="window.close()">×</button>
      <div class="header">
        <h1>🏭 Mill Entry System</h1>
        <p>Data Management Software</p>
      </div>
      <div class="content">
        <div class="section-title">📂 Recent Data Folders</div>
        <div class="recent-list" id="recentList">
          ${config.recentPaths.length > 0 
            ? config.recentPaths.map(p => `
              <div class="recent-item" onclick="openRecent('${p.replace(/\\/g, '\\\\')}')">
                <span class="path">${p}</span>
                <span class="arrow">→</span>
              </div>
            `).join('')
            : '<div class="empty-state">Koi recent folder nahi hai.<br>Naya folder select karein ya create karein.</div>'
          }
        </div>
        
        <div class="section-title">📁 Data Folder Select Karein</div>
        <div class="btn-group">
          <button class="btn btn-primary" onclick="selectFolder()">
            📂 Existing Folder Open Karein
          </button>
          <button class="btn btn-secondary" onclick="createNewFolder()">
            ➕ New Data Folder Create Karein
          </button>
        </div>
      </div>
      <div class="footer">
        Tally जैसा Data Management | Data आपके selected folder में save होगा
      </div>
      
      <script>
        const { ipcRenderer } = require('electron');
        
        function selectFolder() {
          ipcRenderer.send('select-folder');
        }
        
        function createNewFolder() {
          ipcRenderer.send('create-folder');
        }
        
        function openRecent(path) {
          ipcRenderer.send('open-recent', path);
        }
      </script>
    </body>
    </html>
  `;
  
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHTML)}`);
}

// Create Main Application Window
async function createMainWindow(apiPort) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: path.join(__dirname, 'icon.ico')
  });
  
  // Check if we have a built frontend
  const frontendPath = path.join(__dirname, 'frontend', 'index.html');
  if (fs.existsSync(frontendPath)) {
    // Load from built files
    mainWindow.loadFile(frontendPath);
  } else {
    // For development, load from localhost
    mainWindow.loadURL(`http://localhost:3000`);
  }
  
  // Inject the API URL
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      window.REACT_APP_BACKEND_URL = 'http://127.0.0.1:${apiPort}';
      localStorage.setItem('API_URL', 'http://127.0.0.1:${apiPort}');
    `);
  });
  
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (server) server.close();
    app.quit();
  });
}

// IPC Handlers
ipcMain.on('select-folder', async (event) => {
  const result = await dialog.showOpenDialog(splashWindow, {
    properties: ['openDirectory'],
    title: 'Data Folder Select Karein'
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    dataPath = result.filePaths[0];
    await startApp();
  }
});

ipcMain.on('create-folder', async (event) => {
  const result = await dialog.showSaveDialog(splashWindow, {
    title: 'New Data Folder Create Karein',
    defaultPath: 'MillData',
    buttonLabel: 'Create Folder'
  });
  
  if (!result.canceled && result.filePath) {
    dataPath = result.filePath;
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
    }
    await startApp();
  }
});

ipcMain.on('open-recent', async (event, path) => {
  if (fs.existsSync(path)) {
    dataPath = path;
    await startApp();
  } else {
    dialog.showErrorBox('Error', 'Folder not found: ' + path);
  }
});

// Start the application
async function startApp() {
  // Save to recent paths
  const config = loadConfig();
  config.recentPaths = [dataPath, ...config.recentPaths.filter(p => p !== dataPath)].slice(0, 5);
  saveConfig(config);
  
  // Initialize database
  initDatabase(dataPath);
  
  // Start API server
  const apiPort = await createApiServer();
  
  // Close splash and open main window
  if (splashWindow) {
    splashWindow.close();
    splashWindow = null;
  }
  
  await createMainWindow(apiPort);
}

// App lifecycle
app.whenReady().then(() => {
  createSplashWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createSplashWindow();
  }
});
