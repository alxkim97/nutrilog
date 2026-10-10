// Show a new deploy on the first open instead of the second. sw.js takes control
// within seconds of launch, but the page keeps running the bundle it booted
// with — reloading on `controllerchange` closes that gap.
// Never on first install, at most once a minute, and never while `isBusy()`
// (the Log form is open): then it waits until the app is next hidden.
const RELOAD_KEY = 'nutrilog_sw_reloaded_at'
const CHECK_EVERY_MS = 60 * 60 * 1000

export function initUpdateReload({ isBusy }) {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return // Electron and old browsers
  let hadController = !!navigator.serviceWorker.controller
  let pending = false

  const reload = () => {
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
      if (Date.now() - last < 60 * 1000) return
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
    } catch { /* storage blocked — the controllerchange guard still prevents loops */ }
    window.location.reload()
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return }
    if (isBusy()) { pending = true; return }
    reload()
  })
  document.addEventListener('visibilitychange', () => {
    if (pending && document.visibilityState === 'hidden') reload()
  })
  navigator.serviceWorker.getRegistration().then(reg => {
    if (reg) setInterval(() => reg.update().catch(() => {}), CHECK_EVERY_MS)
  }).catch(() => {})
}