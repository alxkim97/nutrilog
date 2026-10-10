const { contextBridge, ipcRenderer } = require('electron')

// Only what the desktop UI uses. Data no longer goes through Electron — the page
// talks to Supabase directly — so there are no storage or profile channels.
const listen = (channel) => (cb) => {
  const h = (_e, ...args) => cb(...args)
  ipcRenderer.on(channel, h)
  return () => ipcRenderer.removeListener(channel, h)
}

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  exportData: (data) => ipcRenderer.invoke('storage:export', data),

  checkForUpdate: () => ipcRenderer.invoke('app:check-update'),
  downloadUpdate: () => ipcRenderer.invoke('app:download-update'),
  installUpdate: () => ipcRenderer.invoke('app:install-update'),
  onUpdateStatus: listen('update:status'),

  listEggImages: () => ipcRenderer.invoke('egg:list'),
  readEggImage: (name) => ipcRenderer.invoke('egg:read', name),
  addEggImages: () => ipcRenderer.invoke('egg:add'),
  deleteEggImage: (name) => ipcRenderer.invoke('egg:delete', name),

  onMenuSave: listen('menu:save'),
  onMenuExport: listen('menu:export'),
  onMenuNav: listen('menu:nav'),
  onMenuTheme: listen('menu:theme'),
  onMenuPushCloud: listen('menu:push-cloud'),
  onMenuPullCloud: listen('menu:pull-cloud'),
  onBeforeQuit: listen('app:before-quit'),
})
