const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const heicConvert = require('heic-convert');

// ── Keep a global reference to prevent GC ──
let mainWindow = null;
const isDev = process.argv.includes('--dev');

// ── Data directory: use userData so it survives app updates ──
const DATA_DIR = path.join(app.getPath('userData'), 'NutriLogData');
const DATA_FILE = path.join(DATA_DIR, 'sessions.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const FOODLIB_FILE = path.join(DATA_DIR, 'foodlib.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const CHECKINS_FILE = path.join(DATA_DIR, 'checkins.json');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const DAYNOTES_FILE = path.join(DATA_DIR, 'daynotes.json');
const SYNCLOG_FILE = path.join(DATA_DIR, 'synclog.json');
const EGGS_DIR = path.join(DATA_DIR, 'eggs');

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
      sandbox: false,
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

  mainWindow.on('closed', () => { mainWindow = null; });
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
          click: async () => {
            const { filePath } = await dialog.showSaveDialog(mainWindow, {
              title: 'Export Food Log',
              defaultPath: `NutriLog_export_${new Date().toISOString().slice(0,10)}.json`,
              filters: [{ name: 'JSON', extensions: ['json'] }]
            });
            if (filePath) mainWindow?.webContents.send('menu:export', filePath);
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
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
    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('writeJSON error:', filePath, e.message);
    return false;
  }
}

// Sessions (today's meals)
ipcMain.handle('storage:get-session', () => readJSON(DATA_FILE));
ipcMain.handle('storage:set-session', (_, data) => writeJSON(DATA_FILE, data));

// Settings
ipcMain.handle('storage:get-settings', () => readJSON(SETTINGS_FILE));
ipcMain.handle('storage:set-settings', (_, data) => writeJSON(SETTINGS_FILE, data));

// Food library
ipcMain.handle('storage:get-foodlib', () => readJSON(FOODLIB_FILE));
ipcMain.handle('storage:set-foodlib', (_, data) => writeJSON(FOODLIB_FILE, data));

// History (all past days)
ipcMain.handle('storage:get-history', () => readJSON(HISTORY_FILE, {}));
ipcMain.handle('storage:set-history', (_, data) => writeJSON(HISTORY_FILE, data));

// Check-ins (weekly progress)
ipcMain.handle('storage:get-checkins', () => readJSON(CHECKINS_FILE, []));
ipcMain.handle('storage:set-checkins', (_, data) => writeJSON(CHECKINS_FILE, data));

// Meal prep templates
ipcMain.handle('storage:get-templates', () => readJSON(TEMPLATES_FILE, {}));
ipcMain.handle('storage:set-templates', (_, data) => writeJSON(TEMPLATES_FILE, data));

// Day notes (per-date context notes)
ipcMain.handle('storage:get-daynotes', () => readJSON(DAYNOTES_FILE, {}));
ipcMain.handle('storage:set-daynotes', (_, data) => writeJSON(DAYNOTES_FILE, data));

ipcMain.handle('storage:get-synclog', () => readJSON(SYNCLOG_FILE, []));
ipcMain.handle('storage:set-synclog', (_, data) => writeJSON(SYNCLOG_FILE, data));

// Export handler
ipcMain.handle('storage:export', (_, filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch(e) { return false; }
});

// App info
ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:get-data-dir', () => DATA_DIR);

// ── Easter egg image management ──
const HEIC_EXTS = /\.(heic|heif)$/i;
const IMG_EXTS  = /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i;
const MAX_EGG_PX = 1920; // resize iPhone photos to this width max

async function processEggImage(srcBuf, isHeic) {
  let buf = srcBuf;
  // 1. Convert HEIC → JPEG
  if (isHeic) {
    buf = Buffer.from(await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.92 }));
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
  try { fs.unlinkSync(path.join(EGGS_DIR, name)); return true; }
  catch(e) { return false; }
});

// ── App lifecycle ──
app.whenReady().then(() => {
  ensureDataDir();
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Auto-save on quit
app.on('before-quit', () => {
  mainWindow?.webContents.send('app:before-quit');
});
