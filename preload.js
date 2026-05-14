const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe, minimal API to the renderer (index.html)
// This replaces localStorage with proper file-based persistence

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Storage ──
  getSession:    ()       => ipcRenderer.invoke('storage:get-session'),
  setSession:    (data)   => ipcRenderer.invoke('storage:set-session', data),
  getSettings:   ()       => ipcRenderer.invoke('storage:get-settings'),
  setSettings:   (data)   => ipcRenderer.invoke('storage:set-settings', data),
  getFoodLib:    ()       => ipcRenderer.invoke('storage:get-foodlib'),
  setFoodLib:    (data)   => ipcRenderer.invoke('storage:set-foodlib', data),
  getHistory:    ()       => ipcRenderer.invoke('storage:get-history'),
  setHistory:    (data)   => ipcRenderer.invoke('storage:set-history', data),
  getCheckins:   ()       => ipcRenderer.invoke('storage:get-checkins'),
  setCheckins:   (data)   => ipcRenderer.invoke('storage:set-checkins', data),
  getTemplates:  ()       => ipcRenderer.invoke('storage:get-templates'),
  setTemplates:  (data)   => ipcRenderer.invoke('storage:set-templates', data),
  getDayNotes:   ()       => ipcRenderer.invoke('storage:get-daynotes'),
  setDayNotes:   (data)   => ipcRenderer.invoke('storage:set-daynotes', data),
  getSyncLog:    ()       => ipcRenderer.invoke('storage:get-synclog'),
  setSyncLog:    (data)   => ipcRenderer.invoke('storage:set-synclog', data),
  exportData:    (p, d)   => ipcRenderer.invoke('storage:export', p, d),

  // ── App info ──
  getVersion:    ()       => ipcRenderer.invoke('app:get-version'),
  getDataDir:    ()       => ipcRenderer.invoke('app:get-data-dir'),

  // ── Easter egg image management ──
  listEggImages:  ()      => ipcRenderer.invoke('egg:list'),
  readEggImage:   (name)  => ipcRenderer.invoke('egg:read', name),
  addEggImages:   ()      => ipcRenderer.invoke('egg:add'),
  deleteEggImage: (name)  => ipcRenderer.invoke('egg:delete', name),

  // ── Menu events → renderer ──
  onMenuSave:       (cb) => ipcRenderer.on('menu:save',         () => cb()),
  onMenuExport:     (cb) => ipcRenderer.on('menu:export',       (_, p) => cb(p)),
  onMenuNav:        (cb) => ipcRenderer.on('menu:nav',          (_, p) => cb(p)),
  onMenuTheme:      (cb) => ipcRenderer.on('menu:theme',        () => cb()),
  onMenuPushCloud:  (cb) => ipcRenderer.on('menu:push-cloud',   () => cb()),
  onBeforeQuit:     (cb) => ipcRenderer.on('app:before-quit',   () => cb()),
});
