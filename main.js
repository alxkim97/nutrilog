const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
let _heicConvert;
function getHeicConvert() {
  if (!_heicConvert) _heicConvert = require('heic-convert');
  return _heicConvert;
}
let autoUpdater;

// ── Keep a global reference to prevent GC ──
let mainWindow = null;
let tray = null;
// Closing the window hides it to the tray instead of quitting — actual quit
// only happens via the tray's Quit item or the app menu, which set this first.
let isQuitting = false;
const isDev = process.argv.includes('--dev');

// ── Single instance lock — launching a second copy (easy to do by accident now
// that the app lives in the tray) focuses the existing window instead of opening
// a duplicate, which would fight the first instance over local data files. ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());
}

// ── Data directory: use userData so it survives app updates ──
const DATA_DIR = path.join(app.getPath('userData'), 'NutriLogData');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const SHARED_FOODLIB_FILE = path.join(DATA_DIR, 'foodlib.json'); // shared across all profiles
const EGGS_DIR = path.join(DATA_DIR, 'eggs'); // shared across profiles

// ── Profile state (loaded synchronously before any IPC) ──
let _profiles = [
  { id: 'alex', name: 'Alex' },
];
let _activeProfileId = 'alex';

function loadProfilesSync() {
  try {
    if (fs.existsSync(PROFILES_FILE)) {
      const p = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
      if (Array.isArray(p.profiles) && p.profiles.length) _profiles = p.profiles;
      if (p.active) _activeProfileId = p.active;
    }
  } catch(e) { /* use defaults */ }
}

function saveProfilesSync() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PROFILES_FILE, JSON.stringify({ profiles: _profiles, active: _activeProfileId }, null, 2), 'utf8');
  } catch(e) { console.error('saveProfiles error', e); }
}

function profileDir() {
  return path.join(DATA_DIR, 'profiles', _activeProfileId);
}

function profileDataFile(name) {
  return path.join(profileDir(), name + '.json');
}

// ── One-time migration: copy old flat files → profiles/{firstProfile}/ ──
function migrateOldDataIfNeeded() {
  const firstId = _profiles[0]?.id || 'alex';
  const firstDir = path.join(DATA_DIR, 'profiles', firstId);
  if (fs.existsSync(firstDir)) return; // already done
  const oldSession = path.join(DATA_DIR, 'sessions.json');
  if (!fs.existsSync(oldSession)) return; // no old data to migrate
  try {
    fs.mkdirSync(firstDir, { recursive: true });
    ['sessions','settings','foodlib','history','checkins','templates','daynotes','synclog'].forEach(f => {
      const src = path.join(DATA_DIR, f + '.json');
      const dst = path.join(firstDir, f + '.json');
      if (fs.existsSync(src) && !fs.existsSync(dst)) fs.copyFileSync(src, dst);
    });
    console.log(`Migrated old NutriLog data to profiles/${firstId}/`);
  } catch(e) { console.error('Migration error', e); }
}

// Migrate food library to shared location — copies the largest profile foodlib
function migrateFoodLibToShared() {
  if (fs.existsSync(SHARED_FOODLIB_FILE)) return; // already shared
  let bestData = null;
  let bestCount = -1;
  _profiles.forEach(p => {
    const f = path.join(DATA_DIR, 'profiles', p.id, 'foodlib.json');
    if (!fs.existsSync(f)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
      const items = raw?.nutrilog_foodlib || raw || [];
      const count = Array.isArray(items) ? items.length : 0;
      if (count > bestCount) { bestCount = count; bestData = raw; }
    } catch(e) {}
  });
  if (bestData) {
    try { fs.writeFileSync(SHARED_FOODLIB_FILE, JSON.stringify(bestData, null, 2), 'utf8'); } catch(e) {}
  }
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function ensureEggsDir() {
  ensureDataDir();
  if (!fs.existsSync(EGGS_DIR)) fs.mkdirSync(EGGS_DIR, { recursive: true });
}

// ── Create window ──
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'NutriLog',
    backgroundColor: '#0f0f11',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    // Window chrome
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: process.platform !== 'darwin',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
  });

  // Load the app
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Show when ready to avoid white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools();
  });

  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── System tray (keeps the app running in the background, like a pinboard app) ──
function createTray() {
  const trayIcon = nativeImage.createFromPath(
    path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
  );
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  tray.setToolTip('NutriLog');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open NutriLog', click: () => showMainWindow() },
    { type: 'separator' },
    { label: 'Quit NutriLog', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', () => showMainWindow());
}

function showMainWindow() {
  if (!mainWindow) { createWindow(); return; }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ── Application menu ──
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Save Session',
          click: () => mainWindow?.webContents.send('menu:save')
        },
        {
          label: 'Push All to Cloud',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:push-cloud')
        },
        {
          label: 'Pull from Cloud',
          accelerator: 'CmdOrCtrl+Shift+U',
          click: () => mainWindow?.webContents.send('menu:pull-cloud')
        },
        { type: 'separator' },
        {
          label: 'Export Food Log (JSON)',
          click: () => mainWindow?.webContents.send('menu:export')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Today',
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow?.webContents.send('menu:nav', 'today')
        },
        {
          label: 'History',
          accelerator: 'CmdOrCtrl+2',
          click: () => mainWindow?.webContents.send('menu:nav', 'history')
        },
        {
          label: 'Food Database',
          accelerator: 'CmdOrCtrl+3',
          click: () => mainWindow?.webContents.send('menu:nav', 'foods')
        },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+4',
          click: () => mainWindow?.webContents.send('menu:nav', 'settings')
        },
        { type: 'separator' },
        {
          label: 'Toggle Dark/Light Mode',
          accelerator: 'CmdOrCtrl+T',
          click: () => mainWindow?.webContents.send('menu:theme')
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open Data Folder',
          click: () => shell.openPath(DATA_DIR)
        },
        {
          label: 'About NutriLog',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About NutriLog',
              message: `NutriLog v${app.getVersion()}`,
              detail: 'Personal Macro Tracker\nBuilt for APm R&D · Alex\n\nData stored at:\n' + DATA_DIR,
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC handlers: persistent storage (replaces localStorage) ──

// Generic read/write for each data file
function readJSON(filePath, fallback = null) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.error('readJSON error:', filePath, e.message);
  }
  return fallback;
}

function writeJSON(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('writeJSON error:', filePath, e.message);
    return false;
  }
}

// Sessions (today's meals)
ipcMain.handle('storage:get-session', () => readJSON(profileDataFile('sessions')));
ipcMain.handle('storage:set-session', (_, data) => writeJSON(profileDataFile('sessions'), data));

// Settings
ipcMain.handle('storage:get-settings', () => readJSON(profileDataFile('settings')));
ipcMain.handle('storage:set-settings', (_, data) => writeJSON(profileDataFile('settings'), data));

// Food library — shared across all profiles
ipcMain.handle('storage:get-foodlib', () => readJSON(SHARED_FOODLIB_FILE));
ipcMain.handle('storage:set-foodlib', (_, data) => writeJSON(SHARED_FOODLIB_FILE, data));

// History (all past days)
ipcMain.handle('storage:get-history', () => readJSON(profileDataFile('history'), {}));
ipcMain.handle('storage:set-history', (_, data) => writeJSON(profileDataFile('history'), data));

// Check-ins (weekly progress)
ipcMain.handle('storage:get-checkins', () => readJSON(profileDataFile('checkins'), []));
ipcMain.handle('storage:set-checkins', (_, data) => writeJSON(profileDataFile('checkins'), data));

// Meal prep templates
ipcMain.handle('storage:get-templates', () => readJSON(profileDataFile('templates'), {}));
ipcMain.handle('storage:set-templates', (_, data) => writeJSON(profileDataFile('templates'), data));

// Recipes (per-profile)
ipcMain.handle('storage:get-recipes', () => readJSON(profileDataFile('recipes'), {}));
ipcMain.handle('storage:set-recipes', (_, data) => writeJSON(profileDataFile('recipes'), data));

// Day notes (per-date context notes)
ipcMain.handle('storage:get-daynotes', () => readJSON(profileDataFile('daynotes'), {}));
ipcMain.handle('storage:set-daynotes', (_, data) => writeJSON(profileDataFile('daynotes'), data));

ipcMain.handle('storage:get-synclog', () => readJSON(profileDataFile('synclog'), []));
ipcMain.handle('storage:set-synclog', (_, data) => writeJSON(profileDataFile('synclog'), data));

// ── Profile management ──
ipcMain.handle('profile:get-all', () => ({ profiles: _profiles, active: _activeProfileId }));
ipcMain.handle('profile:set-active', (_, id) => {
  if (!_profiles.find(p => p.id === id)) return false;
  _activeProfileId = id;
  saveProfilesSync();
  return true;
});
ipcMain.handle('profile:update-name', (_, id, name) => {
  const p = _profiles.find(p => p.id === id);
  if (!p) return false;
  p.name = name.trim() || p.name;
  saveProfilesSync();
  return true;
});
ipcMain.handle('profile:add', (_, profile) => {
  if (!profile?.id || !isSafeProfileId(profile.id)) return false;
  if (_profiles.find(p => p.id === profile.id)) return false;
  _profiles.push({ id: profile.id, name: profile.name || profile.id });
  saveProfilesSync();
  return true;
});
ipcMain.handle('profile:delete', (_, id) => {
  if (_profiles.length <= 1) return false;
  _profiles = _profiles.filter(p => p.id !== id);
  if (_activeProfileId === id) _activeProfileId = _profiles[0].id;
  saveProfilesSync();
  return true;
});

// Export handler — dialog lives here so renderer cannot choose an arbitrary path
ipcMain.handle('storage:export', async (_, data) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Food Log',
    defaultPath: `NutriLog_export_${new Date().toISOString().slice(0,10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return false;
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch(e) { return false; }
});

// App info
ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:get-data-dir', () => DATA_DIR);

// ── In-app updates ──
ipcMain.handle('app:check-update', async () => {
  if (isDev) return { skipped: true };
  try { await autoUpdater.checkForUpdates(); return { ok: true }; }
  catch(e) { return { error: e.message }; }
});
ipcMain.handle('app:download-update', async () => {
  if (isDev) return { skipped: true };
  try { await autoUpdater.downloadUpdate(); return { ok: true }; }
  catch(e) { return { error: e.message }; }
});
ipcMain.handle('app:install-update', () => {
  if (isDev) return;
  autoUpdater.quitAndInstall();
});

// ── Easter egg image management ──
const HEIC_EXTS = /\.(heic|heif)$/i;
const IMG_EXTS  = /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i;

function isSafeProfileId(id) {
  if (typeof id !== 'string' || !id) return false;
  if (id.includes('/') || id.includes('\\') || id.includes('..')) return false;
  if (id.includes('\0') || id.includes(':')) return false;
  if (id.length > 64) return false;
  return path.resolve(DATA_DIR, 'profiles', id).startsWith(path.resolve(DATA_DIR, 'profiles'));
}

function isSafeEggName(name) {
  if (typeof name !== 'string') return false;
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return false;
  if (name.includes('\0') || name.includes(':')) return false; // null-byte + Windows ADS
  if (!IMG_EXTS.test(name)) return false;
  return path.resolve(EGGS_DIR, name).startsWith(path.resolve(EGGS_DIR));
}
const MAX_EGG_PX = 1920; // resize iPhone photos to this width max

async function processEggImage(srcBuf, isHeic) {
  let buf = srcBuf;
  // 1. Convert HEIC → JPEG
  if (isHeic) {
    buf = Buffer.from(await getHeicConvert()({ buffer: buf, format: 'JPEG', quality: 0.92 }));
  }
  // 2. Resize if wider than MAX_EGG_PX (handles large iPhone JPEGs too)
  try {
    const img = nativeImage.createFromBuffer(buf);
    const { width } = img.getSize();
    if (width > MAX_EGG_PX) {
      buf = img.resize({ width: MAX_EGG_PX, quality: 'good' }).toJPEG(88);
    }
  } catch (_) { /* gif or unsupported — keep original */ }
  return buf;
}

ipcMain.handle('egg:list', () => {
  ensureEggsDir();
  try {
    return fs.readdirSync(EGGS_DIR).filter(f => IMG_EXTS.test(f)).sort();
  } catch(e) { return []; }
});

ipcMain.handle('egg:read', async (_, name) => {
  if (!isSafeEggName(name)) return null;
  try {
    const filePath = path.join(EGGS_DIR, name);
    const isHeic = HEIC_EXTS.test(name);

    // For HEIC files dropped directly into the folder, convert+cache as JPEG
    if (isHeic) {
      const cached = filePath.replace(HEIC_EXTS, '.jpg');
      if (!fs.existsSync(cached)) {
        const buf = await processEggImage(fs.readFileSync(filePath), true);
        fs.writeFileSync(cached, buf);
      }
      const buf = fs.readFileSync(cached);
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    }

    const buf = fs.readFileSync(filePath);
    const ext = path.extname(name).slice(1).toLowerCase();
    const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg'
               : ext === 'png'  ? 'image/png'
               : ext === 'gif'  ? 'image/gif' : 'image/webp';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch(e) { return null; }
});

ipcMain.handle('egg:add', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Add Photos',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (!filePaths || !filePaths.length) return [];
  ensureEggsDir();
  const added = [];
  const failed = [];
  for (const fp of filePaths) {
    const isHeic = HEIC_EXTS.test(fp);
    // HEIC saved as .jpg; all images resized to ≤1920px at import time
    let destName = isHeic
      ? path.basename(fp, path.extname(fp)) + '.jpg'
      : path.basename(fp);
    let destPath = path.join(EGGS_DIR, destName);
    if (fs.existsSync(destPath)) {
      destName = Date.now() + '_' + destName;
      destPath = path.join(EGGS_DIR, destName);
    }
    try {
      const processed = await processEggImage(fs.readFileSync(fp), isHeic);
      fs.writeFileSync(destPath, processed);
      added.push(destName);
    } catch(e) {
      console.error('egg:add failed for', fp, e.message);
      failed.push(path.basename(fp));
    }
  }
  return {added, failed};
});

ipcMain.handle('egg:delete', (_, name) => {
  if (!isSafeEggName(name)) return false;
  try { fs.unlinkSync(path.join(EGGS_DIR, name)); return true; }
  catch(e) { return false; }
});

// ── Auto-updater setup ──
function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update:status', { status: 'checking' });
  });
  autoUpdater.on('update-available', info => {
    mainWindow?.webContents.send('update:status', { status: 'available', version: info.version });
  });
  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update:status', { status: 'current' });
  });
  autoUpdater.on('download-progress', p => {
    mainWindow?.webContents.send('update:status', { status: 'downloading', percent: Math.round(p.percent) });
  });
  autoUpdater.on('update-downloaded', info => {
    mainWindow?.webContents.send('update:status', { status: 'downloaded', version: info.version });
  });
  autoUpdater.on('error', e => {
    mainWindow?.webContents.send('update:status', { status: 'error', message: e.message });
  });
}

// ── App lifecycle ──
app.whenReady().then(() => {
  ensureDataDir();
  loadProfilesSync();
  migrateOldDataIfNeeded();
  migrateFoodLibToShared();
  buildMenu();
  createWindow();
  createTray();

  if (!isDev) {
    ({ autoUpdater } = require('electron-updater'));
    setupAutoUpdater();
    // Silent background check 4 seconds after launch
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 4000);
  }

  app.on('activate', () => showMainWindow());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Auto-save on quit
app.on('before-quit', () => {
  isQuitting = true;
  mainWindow?.webContents.send('app:before-quit');
});
