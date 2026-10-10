import phoneCss from './style.css?inline'
import { getSession, onAuthChange, fetchProfilesAndSettings, fetchFoodLibrary, fetchDayMeals, fetchHistory, saveSettingsPatch } from './supabase.js'
import { renderAuth } from './views/auth.js'
import { renderToday } from './views/today.js'
import { renderQuickAdd } from './views/quickAdd.js'
import { renderHistory } from './views/history.js'
import { renderTrends } from './views/trends.js'
import { renderSettings } from './views/settings.js'
import { icon } from './icons.js'
import { toast, todayStr } from './helpers.js'
import { applyTheme, applyThemeFromSettings, setTheme, setVariant } from './theme.js'
import { cacheLoad, cacheGet, cacheClearAll } from './cache.js'
import { setupPullToRefresh } from './pullToRefresh.js'
import { isDesktopView, onDesktopViewChange } from './platform.js'
import { initUpdateReload } from './swUpdate.js'

applyTheme()

// Two layouts from one codebase: the phone views below, or (at ≥860px, signed
// in) the desktop UI from src/desktop/. Each brings its own stylesheet, so only
// one is ever on the page; crossing the breakpoint reloads into the other.
let layout = null // 'phone' | 'desktop'
let reloadWhenIdle = false

const PROFILE_KEY = 'nutrilog_active_profile'
const app = document.getElementById('app')

const state = {
  session: null,
  loading: true,
  view: 'today',
  profiles: [],
  profileId: null,
  settingsByProfile: {},
  foodLibrary: [],
  todayMeals: [],
  history: [],
  offline: false,
  loadedAt: 0,
  loadedDate: null,
}

const currentProfile = () => state.profiles.find(p => p.id === state.profileId) || { id: state.profileId, name: state.profileId || '' }
const currentSettings = () => state.settingsByProfile[state.profileId] || {}

function readActiveProfile() {
  try { return localStorage.getItem(PROFILE_KEY) || 'alex' } catch { return 'alex' }
}
function writeActiveProfile(id) {
  try { localStorage.setItem(PROFILE_KEY, id) } catch { /* remembered for this session only */ }
}

async function loadProfileData() {
  const date = todayStr()
  const [todayMeals, history] = await Promise.all([fetchDayMeals(state.profileId, date), fetchHistory(state.profileId)])
  state.todayMeals = todayMeals
  state.history = history
  state.loadedAt = Date.now()
  state.loadedDate = date
}

function saveOfflineCopy() {
  cacheLoad(state.profileId, {
    profiles: state.profiles, settingsByProfile: state.settingsByProfile, foodLibrary: state.foodLibrary,
    todayMeals: state.todayMeals, history: state.history, date: state.loadedDate,
  })
}

// Everything a fresh session needs — shared by app start and sign-in.
async function loadEverything() {
  const preferred = readActiveProfile()
  try {
    const [{ profiles, settingsByProfile }, foodLibrary] = await Promise.all([fetchProfilesAndSettings(), fetchFoodLibrary()])
    state.profiles = profiles
    state.settingsByProfile = settingsByProfile
    state.foodLibrary = foodLibrary
    state.profileId = profiles.some(p => p.id === preferred) ? preferred : (profiles.find(p => p.id === 'alex') || profiles[0]).id
    await loadProfileData()
    state.offline = false
    applyThemeFromSettings(currentSettings())
    saveOfflineCopy()
  } catch (e) {
    const cached = cacheGet(preferred)
    if (!cached) { toast(e.message || 'Failed to load data'); return }
    Object.assign(state, {
      profiles: cached.profiles || [], settingsByProfile: cached.settingsByProfile || {}, foodLibrary: cached.foodLibrary || [],
      profileId: preferred, history: cached.history || [], offline: true,
      // a cached "today" from an earlier date isn't today any more
      todayMeals: cached.date === todayStr() ? cached.todayMeals || [] : [],
    })
    toast('Offline — showing your last synced data')
  }
}

async function refresh() {
  try {
    await loadProfileData()
    state.offline = false
    saveOfflineCopy()
  } catch (e) {
    toast(e.message || 'Failed to refresh')
  }
  render()
}

// Drops everything tied to the account — in-memory data and the offline copy —
// so a different sign-in on this device never sees the previous account's data.
function signedOut() {
  Object.assign(state, { session: null, view: 'today', profiles: [], profileId: null, settingsByProfile: {}, foodLibrary: [], todayMeals: [], history: [], offline: false })
  cacheClearAll()
}

function setView(view) {
  if (reloadWhenIdle && view !== 'add') { location.reload(); return }
  state.view = view
  render()
  window.scrollTo(0, 0)
}

async function switchProfile(id) {
  writeActiveProfile(id)
  state.profileId = id
  state.loading = true
  render()
  try {
    await loadProfileData()
    state.offline = false
    applyThemeFromSettings(currentSettings())
    saveOfflineCopy()
  } catch (e) {
    toast(e.message || 'Failed to load profile')
  }
  state.loading = false
  state.view = 'today'
  render()
}

function changeTheme({ theme, variant }) {
  if (theme) setTheme(theme)
  if (variant) setVariant(variant)
  render()
  const patch = theme ? { theme } : { variant }
  state.settingsByProfile[state.profileId] = { ...currentSettings(), ...patch }
  saveSettingsPatch(state.profileId, patch).catch(e => toast(e.message || 'Theme saved on this device only'))
}

function render() {
  const skip = !document.startViewTransition || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (skip) renderImmediate()
  else document.startViewTransition(() => renderImmediate()).ready.catch(() => {})
}

function renderImmediate() {
  app.innerHTML = ''

  if (!state.session) {
    renderAuth(app, {
      onSignedIn: async () => {
        if (isDesktopView()) { location.reload(); return }
        state.session = await getSession()
        state.loading = true
        render()
        await loadEverything()
        state.loading = false
        setView('today')
      },
    })
    return
  }

  if (state.loading) {
    app.innerHTML = '<div class="center-screen"><div class="loader" aria-label="Loading"></div></div>'
    return
  }

  const screen = document.createElement('main')
  screen.className = 'screen view-' + state.view
  app.appendChild(screen)

  const profile = currentProfile()
  const settings = currentSettings()

  if (state.view === 'today') {
    renderToday(screen, {
      profile, profiles: state.profiles, settings, todayMeals: state.todayMeals, history: state.history, offline: state.offline,
      onChanged: refresh, onAdd: () => setView('add'), onOpenSettings: () => setView('settings'),
    })
  } else if (state.view === 'add') {
    renderQuickAdd(screen, { profile, foodLibrary: state.foodLibrary, onSaved: () => { state.view = 'today'; refresh() } })
  } else if (state.view === 'history') {
    renderHistory(screen, { history: state.history, settings })
  } else if (state.view === 'trends') {
    renderTrends(screen, { history: state.history, todayMeals: state.todayMeals, settings })
  } else if (state.view === 'settings') {
    renderSettings(screen, {
      session: state.session, profiles: state.profiles, profile, settings,
      onSwitchProfile: switchProfile, onThemeChange: changeTheme,
      onSignedOut: () => { signedOut(); render() },
    })
  }

  const tab = (view, ic, label) => `
    <button class="tab ${state.view === view ? 'active' : ''}" data-view="${view}" type="button" aria-current="${state.view === view ? 'page' : 'false'}">
      ${icon(ic, 22)}<span>${label}</span>
    </button>`
  const tabbar = document.createElement('nav')
  tabbar.className = 'tabbar'
  tabbar.setAttribute('aria-label', 'Main')
  tabbar.innerHTML = `
    ${tab('today', 'today', 'Today')}
    ${tab('history', 'history', 'History')}
    <button class="tab tab-add ${state.view === 'add' ? 'active' : ''}" data-view="add" type="button" aria-label="Log food">
      <span class="tab-add-circle">${icon('plus', 26)}</span><span>Log</span>
    </button>
    ${tab('trends', 'trends', 'Trends')}
    ${tab('settings', 'settings', 'Settings')}
  `
  tabbar.querySelectorAll('.tab').forEach(btn => { btn.onclick = () => setView(btn.dataset.view) })
  app.appendChild(tabbar)
}

function startPhoneListeners() {
  // Coming back to the app (phone unlocked, window refocused): pick up entries
  // logged on another device, and roll over to a new day if the date changed.
  // Never on Log, where a rebuild would wipe a half-typed entry.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !state.session || state.loading || state.view === 'add') return
    if (state.loadedDate !== todayStr() || Date.now() - state.loadedAt > 2 * 60 * 1000) refresh()
  })

  setupPullToRefresh({
    isEnabled: () => !!state.session && !state.loading && state.view !== 'add',
    onRefresh: refresh,
  })

  // iOS Safari ignores user-scalable=no; block pinch-zoom via its gesture events.
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false })

  // Escape closes the topmost popup by replaying a backdrop click.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    const overlays = document.querySelectorAll('.confirm-overlay')
    overlays[overlays.length - 1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

onDesktopViewChange(async () => {
  if (layout === 'desktop') {
    await window.saveSession?.().catch(() => {}) // flush an unsaved edit first
    location.reload()
  } else if (layout === 'phone' && state.session) {
    if (state.view === 'add') reloadWhenIdle = true // don't throw away a half-typed entry
    else location.reload()
  }
})

// Offline shell + instant deploys. Not under Electron (file://), which has no service workers.
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !import.meta.env.DEV) {
  navigator.serviceWorker.register('./sw.js').catch(e => console.warn('Service worker not registered:', e))
  initUpdateReload({ isBusy: () => layout === 'phone' && state.view === 'add' })
}

async function boot() {
  state.session = await getSession()

  if (state.session && isDesktopView()) {
    layout = 'desktop'
    const { mountDesktop } = await import('./desktop/mount.js')
    await mountDesktop()
    return
  }

  layout = 'phone'
  const style = document.createElement('style')
  style.textContent = phoneCss
  document.head.appendChild(style)
  startPhoneListeners()
  onAuthChange((session) => {
    if (!session && state.session) { signedOut(); toast('Signed out — please sign in again'); render(); return }
    state.session = session
  })
  if (state.session) await loadEverything()
  state.loading = false
  render()
}

boot()
