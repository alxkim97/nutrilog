// Cloud-backed storage for the desktop UI (src/desktop/legacy-app.js).
//
// The desktop UI reads and writes whole values by key through its Store
// object ('nutrilog_v1' = today, 'nutrilog_history' = every day, ...). This
// module answers those reads from an in-memory copy of the profile's Supabase
// rows and turns every write into a three-way merge:
//
//   synced (what this window last saw) · local (what it's saving) · remote (cloud, re-read now)
//
// Local additions/removals relative to `synced` are applied on top of `remote`,
// so an entry logged on the phone meanwhile is kept, and something deleted here
// stays deleted — instead of the old union merge that brought deletions back.
import { supa, fetchProfilesAndSettings } from '../supabase.js'
import { todayStr } from '../helpers.js'

const PAGE = 1000
const SHARED = 'shared'
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/* ── three-way merges ── */

// A day's meals as a multiset; identity is what makes two entries "the same log".
const entryKey = m => [m.name, m.time, m.cat, m.serving, m.kcal].join('|')

export function mergeList(base, local, remote, keyFn) {
  const count = (list) => { const c = new Map(); for (const x of list || []) { const k = keyFn(x); c.set(k, (c.get(k) || 0) + 1) } return c }
  const b = count(base), l = count(local), r = count(remote)
  const want = new Map()
  for (const k of new Set([...b.keys(), ...l.keys(), ...r.keys()])) {
    const n = (r.get(k) || 0) + (l.get(k) || 0) - (b.get(k) || 0)
    if (n > 0) want.set(k, n)
  }
  const out = []
  const take = (list) => { for (const x of list || []) { const k = keyFn(x); const n = want.get(k) || 0; if (n > 0) { out.push(x); want.set(k, n - 1) } } }
  take(local) // local order (and local objects) first, then anything only the cloud has
  take(remote)
  return out
}

// Objects keyed by id/name: a key the local side didn't change takes the cloud's
// value (including a cloud-side delete); a key it did change keeps the local value.
export function mergeMap(base, local, remote) {
  const out = {}
  for (const k of new Set([...Object.keys(base || {}), ...Object.keys(local || {}), ...Object.keys(remote || {})])) {
    const bv = base?.[k], lv = local?.[k], rv = remote?.[k]
    const v = same(lv, bv) ? rv : lv
    if (v !== undefined) out[k] = v
  }
  return out
}

const byTime = (a, b) => (a.time || '').localeCompare(b.time || '')
const mergeDay = (base, local, remote) => mergeList(base, local, remote, entryKey).sort(byTime)

// Food library: an array, identity = name. Order: local order, then cloud-only items.
function mergeLibrary(base, local, remote) {
  const toMap = list => Object.fromEntries((list || []).map(f => [f.name, f]))
  const merged = mergeMap(toMap(base), toMap(local), toMap(remote))
  const out = []
  for (const f of [...(local || []), ...(remote || [])]) {
    if (merged[f.name] !== undefined) { out.push(merged[f.name]); delete merged[f.name] }
  }
  return out
}

/* ── cloud I/O ── */

async function uid() {
  const { data } = await supa.auth.getSession() // also refreshes an expired token
  const id = data.session?.user?.id
  if (!id) throw new Error('Signed out — please sign in again')
  return id
}

async function readAll(build) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < PAGE) return rows
  }
}

async function readBlob(table, profileId) {
  const id = await uid()
  const { data, error } = await supa.from(table).select('data').eq('user_id', id).eq('profile_id', profileId).maybeSingle()
  if (error) throw error
  return data ? data.data : null
}

async function writeBlob(table, profileId, value) {
  const id = await uid()
  const { error } = await supa.from(table)
    .upsert({ user_id: id, profile_id: profileId, data: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,profile_id' })
  if (error) throw error
}

async function readDay(profileId, date) {
  const id = await uid()
  // Today lives in nutrilog_sessions (the row every app writes first); past days in history.
  const table = date === todayStr() ? 'nutrilog_sessions' : 'nutrilog_history'
  const { data, error } = await supa.from(table).select('meals').eq('user_id', id).eq('profile_id', profileId).eq('date', date).maybeSingle()
  if (error) throw error
  if (!data && table === 'nutrilog_sessions') return readDayFromHistory(profileId, date)
  return Array.isArray(data?.meals) ? data.meals : []
}

async function readDayFromHistory(profileId, date) {
  const id = await uid()
  const { data, error } = await supa.from('nutrilog_history').select('meals').eq('user_id', id).eq('profile_id', profileId).eq('date', date).maybeSingle()
  if (error) throw error
  return Array.isArray(data?.meals) ? data.meals : []
}

// Same dual write as the phone: sessions first, then history.
async function writeDay(profileId, date, meals) {
  const id = await uid()
  const updated_at = new Date().toISOString()
  const withDate = meals.map(m => ({ ...m, date }))
  const { error: e1 } = await supa.from('nutrilog_sessions')
    .upsert({ user_id: id, profile_id: profileId, date, meals: withDate, updated_at }, { onConflict: 'user_id,profile_id,date' })
  if (e1) throw e1
  const { error: e2 } = await supa.from('nutrilog_history')
    .upsert({ user_id: id, profile_id: profileId, date, meals: withDate, updated_at }, { onConflict: 'user_id,profile_id,date' })
  if (e2) throw e2
}

async function deleteDays(profileId, dates) {
  if (!dates.length) return
  const id = await uid()
  for (let i = 0; i < dates.length; i += 200) {
    const chunk = dates.slice(i, i + 200)
    const { error: e1 } = await supa.from('nutrilog_history').delete().eq('user_id', id).eq('profile_id', profileId).in('date', chunk)
    if (e1) throw e1
    const { error: e2 } = await supa.from('nutrilog_sessions').delete().eq('user_id', id).eq('profile_id', profileId).in('date', chunk)
    if (e2) throw e2
  }
}

/* ── the store ── */

const ACTIVE_KEY = 'nutrilog_active_profile'
const local = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb } catch { return fb } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* device-only extra, best-effort */ } },
}

// What the window last synced, per profile. `days` includes today.
let S = null
let profileId = null
let profiles = []
let user = null
let queue = Promise.resolve()
const pending = new Map() // key → value whose save failed; retried later

function serialize(fn) {
  const run = queue.then(fn, fn)
  queue = run.catch(() => {})
  return run
}

async function loadProfile(pid) {
  const id = await uid()
  const today = todayStr()
  const [settings, foodlib, templates, recipes, checkins, history, todayMeals] = await Promise.all([
    readBlob('nutrilog_settings', pid),
    readBlob('nutrilog_food_library', SHARED),
    readBlob('nutrilog_templates', pid),
    readBlob('nutrilog_recipes', pid),
    readBlob('nutrilog_checkins', pid),
    readAll(() => supa.from('nutrilog_history').select('date,meals').eq('user_id', id).eq('profile_id', pid).order('date')),
    readDay(pid, today),
  ])
  const days = {}
  for (const r of history) if (Array.isArray(r.meals)) days[r.date] = r.meals
  // today's sessions row wins over history (it's written first); an empty,
  // never-logged today isn't added as a day
  if (todayMeals.length || today in days) days[today] = todayMeals
  return {
    settings: settings || {},
    foodlib: Array.isArray(foodlib) ? foodlib : [],
    templates: templates || {},
    recipes: recipes || {},
    checkins: Array.isArray(checkins) ? checkins : [],
    days,
    today,
  }
}

// `complete`: localDays is the whole history, so a date missing from it was
// deleted. Otherwise only the dates given are touched — saving today must
// never read "every other day is absent" as "delete every other day".
async function saveDays(localDays, { complete }) {
  const today = todayStr()
  const dates = complete ? new Set([...Object.keys(S.days), ...Object.keys(localDays)]) : new Set(Object.keys(localDays))
  const toDelete = []
  for (const date of dates) {
    // In a complete history, a missing *today* still means "no opinion": today is
    // owned by nutrilog_v1, and e.g. "clear all history" must not empty it.
    if (date === today && !(date in localDays)) continue
    const mine = localDays[date] || []
    const base = S.days[date] || []
    if (same(mine, base)) continue
    const remote = await readDay(profileId, date)
    const merged = mergeDay(base, mine, remote)
    if (!merged.length && date !== today) {
      toDelete.push(date)
    } else {
      if (!same(merged, remote)) await writeDay(profileId, date, merged)
      S.days[date] = merged
    }
  }
  // Safety net: only an explicit "delete these days" action may remove more
  // than a month at once — anything else doing so is a bug, not a user action.
  const allowed = complete && massDeleteAllowed
  if (complete) massDeleteAllowed = false
  if (toDelete.length > MASS_DELETE_LIMIT && !allowed) {
    const err = new Error(`Refused to delete ${toDelete.length} days in one save`)
    err.refused = true
    throw err
  }
  await deleteDays(profileId, toDelete)
  for (const d of toDelete) delete S.days[d]
}
const MASS_DELETE_LIMIT = 31
let massDeleteAllowed = false

const BLOBS = {
  nutrilog_settings: { table: 'nutrilog_settings', field: 'settings', merge: mergeMap, empty: {} },
  nutrilog_templates: { table: 'nutrilog_templates', field: 'templates', merge: mergeMap, empty: {} },
  nutrilog_recipes: { table: 'nutrilog_recipes', field: 'recipes', merge: mergeMap, empty: {} },
  nutrilog_checkins: { table: 'nutrilog_checkins', field: 'checkins', merge: (b, l, r) => mergeList(b, l, r, x => JSON.stringify(x)), empty: [] },
  nutrilog_foodlib: { table: 'nutrilog_food_library', field: 'foodlib', merge: mergeLibrary, empty: [], shared: true },
}

async function saveBlob(def, value) {
  const pid = def.shared ? SHARED : profileId
  const base = S[def.field]
  if (same(value, base)) return base
  const remote = (await readBlob(def.table, pid)) ?? def.empty
  const merged = def.merge(base, value, remote)
  if (!same(merged, remote)) await writeBlob(def.table, pid, merged)
  S[def.field] = merged
  return merged
}

async function doSet(key, value) {
  if (BLOBS[key]) return saveBlob(BLOBS[key], value)
  if (key === 'nutrilog_v1') {
    const date = value?.date || todayStr()
    if (date !== todayStr()) return clone({ date: todayStr(), ts: Date.now(), meals: S.days[todayStr()] || [] })
    await saveDays({ [date]: value?.meals || [] }, { complete: false })
    return { date, ts: Date.now(), meals: S.days[date] || [] }
  }
  if (key === 'nutrilog_history') {
    await saveDays(value || {}, { complete: true })
    return S.days
  }
  if (key === 'nutrilog_daynotes') {
    // Day notes used to be device-only files; they now live in the profile's
    // settings row under `dayNotes`, merged per date.
    const base = S.settings.dayNotes || {}
    const remote = ((await readBlob('nutrilog_settings', profileId)) || {})
    const merged = mergeMap(base, value || {}, remote.dayNotes || {})
    const next = { ...remote, dayNotes: merged }
    await writeBlob('nutrilog_settings', profileId, next)
    S.settings = next
    return merged
  }
  if (key === 'nutrilog_tpl_dismissed' || key === 'nutrilog_synclog') {
    local.set(`${key}_${profileId}`, value)
    return value
  }
  return value // nutrilog_history_meta and anything else: nothing to keep
}

function get(key) {
  if (!S) return null
  switch (key) {
    case 'nutrilog_v1': return clone({ date: todayStr(), ts: Date.now(), meals: S.days[todayStr()] || [] })
    case 'nutrilog_history': return clone(S.days)
    case 'nutrilog_daynotes': return clone(S.settings.dayNotes || {})
    case 'nutrilog_history_meta': return {}
    case 'nutrilog_tpl_dismissed': return local.get(`${key}_${profileId}`, [])
    case 'nutrilog_synclog': return local.get(`${key}_${profileId}`, [])
    default: return BLOBS[key] ? clone(S[BLOBS[key].field]) : null
  }
}

// Returns the merged value actually saved (may include changes from another
// device). On failure the value is kept and retried, and the error rethrown.
function set(key, value) {
  const snapshot = clone(value)
  return serialize(async () => {
    try {
      const merged = await doSet(key, snapshot)
      pending.delete(key)
      return clone(merged)
    } catch (e) {
      if (!e.refused) pending.set(key, snapshot) // a refused save must not be retried
      throw e
    }
  })
}

async function retryPending() {
  for (const [key, value] of [...pending]) {
    try { await set(key, value) } catch { return false }
  }
  return true
}
window.addEventListener('online', () => { retryPending() })
setInterval(() => { if (pending.size) retryPending() }, 30 * 1000)

export const NutriCloud = {
  supa,
  get user() { return user },
  get profileId() { return profileId },
  get profiles() { return profiles },
  get hasPending() { return pending.size > 0 },
  appVersion: __APP_VERSION__,
  get,
  set,
  retryPending,
  // Called right before the desktop's own "delete these days" actions.
  allowMassDeleteOnce() { massDeleteAllowed = true },

  async init() {
    const { data } = await supa.auth.getSession()
    user = data.session?.user || null
    if (!user) throw new Error('Signed out — please sign in again')
    const info = await fetchProfilesAndSettings()
    profiles = info.profiles
    const preferred = readRaw(ACTIVE_KEY)
    profileId = profiles.some(p => p.id === preferred) ? preferred : (profiles.find(p => p.id === 'alex') || profiles[0]).id
    S = await loadProfile(profileId)
  },

  // Full re-read (another device may have edited anything). A save that failed
  // must land first: merging it later against the *new* copy would undo
  // whatever the other device changed.
  async reload() {
    if (pending.size && !(await retryPending())) throw new Error('Changes are still waiting to save')
    await queue
    S = await loadProfile(profileId)
  },

  // Today's row if it differs from the last sync, else null. Doesn't adopt it:
  // the caller does (acceptToday) only if nothing changed locally meanwhile —
  // moving the synced copy under an unsaved edit would make its save drop the
  // other device's entries.
  async peekToday() {
    await queue
    const today = todayStr()
    const remote = await readDay(profileId, today)
    return same(remote, S.days[today] || []) ? null : remote
  },
  acceptToday(remote) {
    S.days[todayStr()] = clone(remote)
  },

  async switchProfile(id) {
    await queue
    profileId = id
    try { localStorage.setItem(ACTIVE_KEY, id) } catch { /* this session only */ }
    S = await loadProfile(id)
  },

  // The profile list lives in the shared settings row (see SUPABASE-SETUP.md).
  async saveProfiles(list) {
    const clean = list.map(p => ({ id: p.id, name: p.name }))
    await serialize(async () => {
      const remote = (await readBlob('nutrilog_settings', SHARED)) || {}
      await writeBlob('nutrilog_settings', SHARED, { ...remote, profiles: clean })
    })
    profiles = clean
  },

  async signOut() {
    await supa.auth.signOut()
    try { Object.keys(localStorage).filter(k => k.startsWith('nutrilog_cache_')).forEach(k => localStorage.removeItem(k)) } catch { /* nothing cached */ }
  },
}

// Shared with the phone layout, which stores the active profile as a plain string.
function readRaw(k) { try { return localStorage.getItem(k) } catch { return null } }
