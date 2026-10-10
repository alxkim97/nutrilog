const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const { autoUpdater } = require('electron-updater')

// Windows taskbar/Start icon identity. Dev runs get their own ID so they don't
// borrow the installed app's pinned icon.
app.setAppUserModelId(app.isPackaged ? 'com.apm.nutrilog' : 'com.apm.nutrilog.dev')

// A second launch (easy to do while it sits in the tray) focuses the first window.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) app.quit()

const isDev = process.argv.includes('--dev')
let mainWindow = null
let tray = null
let isQuitting = false

// Your data lives in Supabase now. This folder still holds the old local JSON
// files (left untouched, as a backup) and the photos for the easter-egg viewer.
const DATA_DIR = path.join(app.getPath('userData'), 'NutriLogData')
const EGGS_DIR = path.join(DATA_DIR, 'eggs')

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'NutriLog',
    backgroundColor: '#0d0b1a',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = null })
  // The X button hides to the tray; quitting is the tray's or menu's job.
  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    mainWindow.hide()
  })
}

function showMainWindow() {
  if (!mainWindow) { createWindow(); return }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function rebuildTrayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open NutriLog', click: showMainWindow },
    { type: 'separator' },
    updateDownloaded
      ? { label: 'Restart to Install Update', click: () => { isQuitting = true; autoUpdater.quitAndInstall() } }
      : { label: 'Check for Updates', click: () => checkForUpdates(true) },
    { type: 'separator' },
    { label: 'Quit NutriLog', click: () => { isQuitting = true; app.quit() } },
  ]))
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.ico')).resize({ width: 16, height: 16 }))
  tray.setToolTip('NutriLog')
  rebuildTrayMenu()
  tray.on('click', showMainWindow)
}

const send = (channel, ...args) => mainWindow?.webContents.send(channel, ...args)

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Save Session', click: () => send('menu:save') },
        { label: 'Push All to Cloud', accelerator: 'CmdOrCtrl+S', click: () => send('menu:push-cloud') },
        { label: 'Refresh from Cloud', accelerator: 'CmdOrCtrl+Shift+U', click: () => send('menu:pull-cloud') },
        { type: 'separator' },
        { label: 'Export Food Log (JSON)', click: () => send('menu:export') },
        { type: 'separator' },
        { label: 'Quit NutriLog', click: () => { isQuitting = true; app.quit() } },
      ],
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: 'View',
      submenu: [
        { label: 'Today', accelerator: 'CmdOrCtrl+1', click: () => send('menu:nav', 'today') },
        { label: 'History', accelerator: 'CmdOrCtrl+2', click: () => send('menu:nav', 'history') },
        { label: 'Food Database', accelerator: 'CmdOrCtrl+3', click: () => send('menu:nav', 'foods') },
        { label: 'Settings', accelerator: 'CmdOrCtrl+4', click: () => send('menu:nav', 'settings') },
        { type: 'separator' },
        { label: 'Toggle Dark/Light Mode', accelerator: 'CmdOrCtrl+T', click: () => send('menu:theme') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Open Local Data Folder', click: () => shell.openPath(DATA_DIR) },
        {
          label: 'About NutriLog',
          click: () => dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'About NutriLog',
            message: `NutriLog v${app.getVersion()}`,
            detail: 'Personal Macro Tracker\nBuilt for APm R&D · Alex\n\nYour log is stored in the cloud (Supabase).',
            buttons: ['OK'],
          }),
        },
      ],
    },
  ]))
}

/* ── Export: the dialog lives here so the page can't pick an arbitrary path ── */

ipcMain.handle('storage:export', async (_, data) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Food Log',
    defaultPath: `NutriLog_export_${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (canceled || !filePath) return false
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
    return true
  } catch { return false }
})

ipcMain.handle('app:get-version', () => app.getVersion())

/* ── Easter-egg photo viewer: images in NutriLogData/eggs, iPhone HEIC converted ── */

const HEIC_EXTS = /\.(heic|heif)$/i
const IMG_EXTS = /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i
const MAX_EGG_PX = 1920
let heicConvert
const getHeicConvert = () => (heicConvert ||= require('heic-convert'))

function isSafeEggName(name) {
  if (typeof name !== 'string') return false
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return false
  if (name.includes('\0') || name.includes(':')) return false // null byte + Windows ADS
  if (!IMG_EXTS.test(name)) return false
  return path.resolve(EGGS_DIR, name).startsWith(path.resolve(EGGS_DIR))
}

async function processEggImage(srcBuf, isHeic) {
  let buf = srcBuf
  if (isHeic) buf = Buffer.from(await getHeicConvert()({ buffer: buf, format: 'JPEG', quality: 0.92 }))
  try {
    const img = nativeImage.createFromBuffer(buf)
    if (img.getSize().width > MAX_EGG_PX) buf = img.resize({ width: MAX_EGG_PX, quality: 'good' }).toJPEG(88)
  } catch { /* gif or unsupported — keep the original */ }
  return buf
}

ipcMain.handle('egg:list', () => {
  fs.mkdirSync(EGGS_DIR, { recursive: true })
  try { return fs.readdirSync(EGGS_DIR).filter(f => IMG_EXTS.test(f)).sort() } catch { return [] }
})

ipcMain.handle('egg:read', async (_, name) => {
  if (!isSafeEggName(name)) return null
  try {
    const filePath = path.join(EGGS_DIR, name)
    if (HEIC_EXTS.test(name)) {
      const cached = filePath.replace(HEIC_EXTS, '.jpg')
      if (!fs.existsSync(cached)) fs.writeFileSync(cached, await processEggImage(fs.readFileSync(filePath), true))
      return `data:image/jpeg;base64,${fs.readFileSync(cached).toString('base64')}`
    }
    const ext = path.extname(name).slice(1).toLowerCase()
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/webp'
    return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`
  } catch { return null }
})

ipcMain.handle('egg:add', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Add Photos',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'] }],
    properties: ['openFile', 'multiSelections'],
  })
  if (!filePaths || !filePaths.length) return { added: [], failed: [] }
  fs.mkdirSync(EGGS_DIR, { recursive: true })
  const added = []
  const failed = []
  for (const fp of filePaths) {
    const isHeic = HEIC_EXTS.test(fp)
    let destName = isHeic ? path.basename(fp, path.extname(fp)) + '.jpg' : path.basename(fp)
    if (fs.existsSync(path.join(EGGS_DIR, destName))) destName = Date.now() + '_' + destName
    try {
      fs.writeFileSync(path.join(EGGS_DIR, destName), await processEggImage(fs.readFileSync(fp), isHeic))
      added.push(destName)
    } catch (e) {
      console.error('egg:add failed for', fp, e.message)
      failed.push(path.basename(fp))
    }
  }
  return { added, failed }
})

ipcMain.handle('egg:delete', (_, name) => {
  if (!isSafeEggName(name)) return false
  try { fs.unlinkSync(path.join(EGGS_DIR, name)); return true } catch { return false }
})

/* ── Auto-update from GitHub Releases ──
   Status goes to the Settings page; a check started from the tray (which has no
   page to report to) always answers with a dialog. Background checks are silent
   unless something is found. */

let updateDownloaded = false
let manualCheck = false
let checkInProgress = false
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

autoUpdater.on('checking-for-update', () => send('update:status', { status: 'checking' }))
autoUpdater.on('update-available', info => send('update:status', { status: 'available', version: info.version }))
autoUpdater.on('download-progress', p => send('update:status', { status: 'downloading', percent: Math.round(p.percent) }))
autoUpdater.on('update-not-available', () => {
  send('update:status', { status: 'current' })
  if (manualCheck) dialog.showMessageBox(mainWindow || undefined, { type: 'info', title: 'NutriLog', message: "You're up to date.", buttons: ['OK'] })
  manualCheck = false
})
autoUpdater.on('update-downloaded', info => {
  updateDownloaded = true
  manualCheck = false
  if (tray) rebuildTrayMenu()
  send('update:status', { status: 'downloaded', version: info.version })
  dialog.showMessageBox(mainWindow || undefined, {
    type: 'info',
    title: 'NutriLog update ready',
    message: `Version ${info.version} has been downloaded.`,
    detail: 'Restart now to install it, or it will install automatically the next time you quit.',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response }) => { if (response === 0) { isQuitting = true; autoUpdater.quitAndInstall() } })
})
autoUpdater.on('error', e => {
  send('update:status', { status: 'error', message: e.message })
  if (manualCheck) dialog.showMessageBox(mainWindow || undefined, { type: 'error', title: 'NutriLog', message: 'Could not check for updates.', detail: e.message, buttons: ['OK'] })
  manualCheck = false
})

// One check at a time; the flag is cleared by the promise itself so a rejected
// check can't leave every later "Check for Updates" silently ignored.
function checkForUpdates(fromTray) {
  if (isDev) return Promise.resolve({ skipped: true })
  if (updateDownloaded) {
    if (fromTray) dialog.showMessageBox(mainWindow || undefined, { type: 'info', title: 'NutriLog', message: 'Update already downloaded — restart NutriLog to install it.' })
    return Promise.resolve({ ok: true })
  }
  if (checkInProgress) return Promise.resolve({ ok: true })
  checkInProgress = true
  manualCheck = !!fromTray
  return autoUpdater.checkForUpdates()
    .then(() => ({ ok: true }), e => ({ error: e.message }))
    .finally(() => { checkInProgress = false })
}

ipcMain.handle('app:check-update', () => checkForUpdates(false))
ipcMain.handle('app:download-update', async () => {
  if (isDev) return { skipped: true }
  try { await autoUpdater.downloadUpdate(); return { ok: true } } catch (e) { return { error: e.message } }
})
ipcMain.handle('app:install-update', () => {
  if (isDev) return
  isQuitting = true
  autoUpdater.quitAndInstall()
})

/* ── Lifecycle ── */

if (gotSingleInstanceLock) {
  app.on('second-instance', showMainWindow)

  app.whenReady().then(() => {
    buildMenu()
    createWindow()
    try {
      createTray()
    } catch (err) {
      console.error('createTray failed:', err) // a broken tray icon mustn't stop the update timers
    }
    if (!isDev) {
      setTimeout(() => checkForUpdates(false), 10_000)
      setInterval(() => checkForUpdates(false), 4 * 60 * 60 * 1000)
    }
    app.on('activate', showMainWindow)
  })
}

app.on('before-quit', () => {
  isQuitting = true
  send('app:before-quit')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
