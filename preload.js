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
  getRecipes:    ()       => ipcRenderer.invoke('storage:get-recipes'),
  setRecipes:    (data)   => ipcRenderer.invoke('storage:set-recipes', data),
  getDayNotes:   ()       => ipcRenderer.invoke('storage:get-daynotes'),
  setDayNotes:   (data)   => ipcRenderer.invoke('storage:set-daynotes', data),
  getSyncLog:    ()       => ipcRenderer.invoke('storage:get-synclog'),
  setSyncLog:    (data)   => ipcRenderer.invoke('storage:set-synclog', data),
  exportData:    (d)      => ipcRenderer.invoke('storage:export', d),

  // ── App info ──
  getVersion:    ()       => ipcRenderer.invoke('app:get-version'),
  getDataDir:    ()       => ipcRenderer.invoke('app:get-data-dir'),

  // ── Profile management ──
  getProfiles:       ()              => ipcRenderer.invoke('profile:get-all'),
  setActiveProfile:  (id)            => ipcRenderer.invoke('profile:set-active', id),
  updateProfileName: (id, name)      => ipcRenderer.invoke('profile:update-name', id, name),
  addProfile:        (profile)       => ipcRenderer.invoke('profile:add', profile),
  deleteProfile:     (id)            => ipcRenderer.invoke('profile:delete', id),

  // ── Easter egg image management ──
  listEggImages:  ()      => ipcRenderer.invoke('egg:list'),
  readEggImage:   (name)  => ipcRenderer.invoke('egg:read', name),
  addEggImages:   ()      => ipcRenderer.invoke('egg:add'),
  deleteEggImage: (name)  => ipcRenderer.invoke('egg:delete', name),

  // ── In-app updates ──
  checkForUpdate:  ()    => ipcRenderer.invoke('app:check-update'),
  downloadUpdate:  ()    => ipcRenderer.invoke('app:download-update'),
  installUpdate:   ()    => ipcRenderer.invoke('app:install-update'),
  onUpdateStatus:  (cb) => {
    const h = (_, data) => cb(data);
    ipcRenderer.on('update:status', h);
    return () => ipcRenderer.removeListener('update:status', h);
  },

  // ── Menu events → renderer ──
  onMenuSave: (cb) => {
    const h = () => cb();
    ipcRenderer.on('menu:save', h);
    return () => ipcRenderer.removeListener('menu:save', h);
  },
  onMenuExport: (cb) => {
    const h = () => cb();
    ipcRenderer.on('menu:export', h);
    return () => ipcRenderer.removeListener('menu:export', h);
  },
  onMenuNav: (cb) => {
    const h = (_, p) => cb(p);
    ipcRenderer.on('menu:nav', h);
    return () => ipcRenderer.removeListener('menu:nav', h);
  },
  onMenuTheme: (cb) => {
    const h = () => cb();
    ipcRenderer.on('menu:theme', h);
    return () => ipcRenderer.removeListener('menu:theme', h);
  },
  onMenuPushCloud: (cb) => {
    const h = () => cb();
    ipcRenderer.on('menu:push-cloud', h);
    return () => ipcRenderer.removeListener('menu:push-cloud', h);
  },
  onMenuPullCloud: (cb) => {
    const h = () => cb();
    ipcRenderer.on('menu:pull-cloud', h);
    return () => ipcRenderer.removeListener('menu:pull-cloud', h);
  },
  onBeforeQuit: (cb) => {
    const h = () => cb();
    ipcRenderer.on('app:before-quit', h);
    return () => ipcRenderer.removeListener('app:before-quit', h);
  },
});
