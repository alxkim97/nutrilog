// Cloud-backed storage for the desktop UI (src/desktop/legacy-app.js).
//
// The desktop UI reads and writes whole values by key through its Store object
// ('nutrilog_v1' = today's entries, 'nutrilog_history' = every day,
// 'nutrilog_foodlib' = the food library, ...). This module answers reads from an
// in-memory copy and turns each write into row operations:
//
//   entries (nutrilog_entries) and foods (nutrilog_foods) are one row each, with
//   an id. A save compares the value with what this window last loaded and
//   sends only the differences — insert the new ids, update the changed ones,
//   delete the ones that are gone. Rows this window never loaded (logged on the
//   phone meanwhile) are never touched, so there is nothing to merge.
//
// Settings, templates, recipes and check-ins are small per-profile values,
// still one row each, saved with a three-way merge (mergeMap / mergeList).
import { supa, fetchProfilesAndSettings } from '../supabase.js'
import { todayStr } from '../helpers.js'
import { rowToEntry, rowToFood, sameEntry, sameFood, assignEntryIds as assignIds, assignFoodIds as assignFIds, diffEntries, diffFoods } from '../rowsShape.js'

const PAGE = 1000
const SHARED = 'shared'
const DUPLICATE = '23505'
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const newId = () => crypto.randomUUID()

/* ── three-way merges (settings, templates, recipes, check-ins) ── */

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
  take(local)
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

const entryOrder = q => q.order('time', { ascending: true, nullsFirst: true }).order('created_at')

async function readDay(profileId, date) {
  const id = await uid()
  const { data, error } = await entryOrder(supa.from('nutrilog_entries').select('*').eq('user_id', id).eq('profile_id', profileId).eq('date', date))
  if (error) throw error
  return data.map(rowToEntry)
}

async function readFoods() {
  const id = await uid()
  const rows = await readAll(() => supa.from('nutrilog_foods').select('*').eq('user_id', id).order('created_at', { ascending: false }).order('name'))
  return rows.map(rowToFood)
}

/* ── the store ── */

const ACTIVE_KEY = 'nutrilog_active_profile'
const local = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb } catch { return fb } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* device-only extra, best-effort */ } },
}

// What the window last loaded, per profile. `days` includes today.
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
  const [settings, foodlib, templates, recipes, checkins, rows] = await Promise.all([
    readBlob('nutrilog_settings', pid),
    readFoods(),
    readBlob('nutrilog_templates', pid),
    readBlob('nutrilog_recipes', pid),
    readBlob('nutrilog_checkins', pid),
    readAll(() => entryOrder(supa.from('nutrilog_entries').select('*').eq('user_id', id).eq('profile_id', pid).order('date'))),
  ])
  const days = {}
  for (const r of rows) (days[r.date] ||= []).push(rowToEntry(r))
  return {
    settings: settings || {},
    foodlib,
    templates: templates || {},
    recipes: recipes || {},
    checkins: Array.isArray(checkins) ? checkins : [],
    days,
  }
}

/* ── ids ──
   Done synchronously on the UI's own objects before a save is queued, so the
   id sticks: an entry saved without one would otherwise be inserted again on
   every later save. An entry copied from another day (copy-day, templates
   spread {...m}) arrives carrying that day's id; it gets a fresh one, so the
   copy is added instead of the original being moved. */

function ownerDates() {
  const owner = new Map()
  for (const [date, list] of Object.entries(S?.days || {})) for (const e of list) owner.set(e.id, date)
  return owner
}

const assignEntryIds = daysMap => assignIds(daysMap, ownerDates(), newId)
const assignFoodIds = list => assignFIds(list, newId)

/* ── saving entries ── */

const diffDay = (date, mine, base) => diffEntries(date, mine, base, profileId)

async function applyDay({ upserts, updates, deletes }) {
  if (upserts.length) {
    const { error } = await supa.from('nutrilog_entries').upsert(upserts, { onConflict: 'id' })
    if (error) throw error
  }
  for (const row of updates) {
    const { id, ...patch } = row
    // An entry deleted on another device meanwhile simply isn't there to update.
    const { error } = await supa.from('nutrilog_entries').update(patch).eq('id', id)
    if (error) throw error
  }
  for (let i = 0; i < deletes.length; i += 200) {
    const { error } = await supa.from('nutrilog_entries').delete().in('id', deletes.slice(i, i + 200))
    if (error) throw error
  }
}

// Safety net: only an explicit "delete these days" action may empty more than a
// month of days at once — anything else doing so is a bug, not a user action.
const MASS_DELETE_LIMIT = 31
let massDeleteAllowed = false

// `complete`: localDays is the whole history, so a date missing from it was
// emptied. Otherwise only the dates given are touched.
async function saveDays(localDays, { complete }) {
  const today = todayStr()
  const dates = complete ? new Set([...Object.keys(S.days), ...Object.keys(localDays)]) : new Set(Object.keys(localDays))
  const plans = []
  let emptied = 0
  for (const date of dates) {
    // Today is owned by nutrilog_v1; a full-history save without it has no opinion on it.
    if (complete && date === today && !(date in localDays)) continue
    const mine = localDays[date] || []
    const base = S.days[date] || []
    const plan = diffDay(date, mine, base)
    if (!plan.upserts.length && !plan.updates.length && !plan.deletes.length) continue
    if (base.length && plan.deletes.length === base.length && !plan.upserts.length) emptied++
    plans.push([date, plan])
  }
  const allowed = complete && massDeleteAllowed
  if (complete) massDeleteAllowed = false
  if (emptied > MASS_DELETE_LIMIT && !allowed) {
    const err = new Error(`Refused to empty ${emptied} days in one save`)
    err.refused = true
    throw err
  }
  for (const [date, plan] of plans) {
    await applyDay(plan)
    // The loaded copy becomes exactly what this window saved. Entries another
    // device added meanwhile are NOT folded in here: if the UI had an edit in
    // flight it wouldn't have them, and its next save would delete them. They
    // arrive through the live-update path (peekDay/acceptDay), which waits
    // until nothing is unsaved.
    const mine = (localDays[date] || []).filter(e => e && typeof e === 'object' && e.id).map(e => ({ ...e, date }))
    if (mine.length) S.days[date] = clone(mine)
    else delete S.days[date]
  }
}

// Same entries (by id and content), whatever the order or key order.
function sameDay(a, b) {
  if ((a || []).length !== (b || []).length) return false
  const byId = new Map((b || []).map(e => [e.id, e]))
  return (a || []).every(e => e?.id && byId.has(e.id) && sameEntry(e, byId.get(e.id)))
}

/* ── saving foods ── */

async function saveFoods(list) {
  const { inserts, updates, deletes } = diffFoods(list, S.foodlib)

  if (inserts.length) {
    const { error } = await supa.from('nutrilog_foods').upsert(inserts, { onConflict: 'id' })
    if (error && error.code !== DUPLICATE) throw error
    if (error) {
      // One of them has a name already in the library (perhaps just added on the
      // phone): add the rest one by one, keep the existing food for that name.
      for (const row of inserts) {
        const { error: e } = await supa.from('nutrilog_foods').upsert(row, { onConflict: 'id' })
        if (e && e.code !== DUPLICATE) throw e
      }
    }
  }
  for (const row of updates) {
    const { id, ...patch } = row
    const { error } = await supa.from('nutrilog_foods').update(patch).eq('id', id)
    if (error?.code === DUPLICATE) {
      const err = new Error(`A food named "${patch.name}" is already in the library`)
      err.refused = true
      throw err
    }
    if (error) throw error
  }
  for (let i = 0; i < deletes.length; i += 200) {
    const { error } = await supa.from('nutrilog_foods').delete().in('id', deletes.slice(i, i + 200))
    if (error) throw error
  }
  S.foodlib = await readFoods()
  return S.foodlib
}

/* ── the small per-profile values ── */

const BLOBS = {
  nutrilog_settings: { table: 'nutrilog_settings', field: 'settings', merge: mergeMap, empty: {} },
  nutrilog_templates: { table: 'nutrilog_templates', field: 'templates', merge: mergeMap, empty: {} },
  nutrilog_recipes: { table: 'nutrilog_recipes', field: 'recipes', merge: mergeMap, empty: {} },
  nutrilog_checkins: { table: 'nutrilog_checkins', field: 'checkins', merge: (b, l, r) => mergeList(b, l, r, x => JSON.stringify(x)), empty: [] },
}

async function saveBlob(def, value) {
  const base = S[def.field]
  if (same(value, base)) return base
  const remote = (await readBlob(def.table, profileId)) ?? def.empty
  const merged = def.merge(base, value, remote)
  if (!same(merged, remote)) await writeBlob(def.table, profileId, merged)
  S[def.field] = merged
  return merged
}

async function doSet(key, value) {
  if (BLOBS[key]) return saveBlob(BLOBS[key], value)
  if (key === 'nutrilog_foodlib') return saveFoods(value || [])
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
    // Day notes live in the profile's settings row under `dayNotes`, merged per date.
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
    case 'nutrilog_foodlib': return clone(S.foodlib)
    case 'nutrilog_daynotes': return clone(S.settings.dayNotes || {})
    case 'nutrilog_history_meta': return {}
    case 'nutrilog_tpl_dismissed': return local.get(`${key}_${profileId}`, [])
    case 'nutrilog_synclog': return local.get(`${key}_${profileId}`, [])
    default: return BLOBS[key] ? clone(S[BLOBS[key].field]) : null
  }
}

// Returns the value actually saved (may include changes from another device).
// On failure the value is kept and retried, and the error rethrown.
function set(key, value) {
  // ids go onto the caller's own objects first (see "ids" above)
  if (key === 'nutrilog_v1' && value && Array.isArray(value.meals)) assignEntryIds({ [value.date || todayStr()]: value.meals })
  else if (key === 'nutrilog_history' && value) assignEntryIds(value)
  else if (key === 'nutrilog_foodlib' && Array.isArray(value)) assignFoodIds(value)
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

/* ── live updates ──
   Supabase pushes every entry/food change. The UI is told which date (or the
   food library) changed and decides when to take it — never under an edit it
   hasn't saved, since moving the loaded copy under an unsaved edit would make
   that save delete the other device's entries. */

let channel = null
const listeners = new Set()
let pendingDates = new Set()
let foodsChanged = false
let notifyTimer = null

function notifySoon() {
  clearTimeout(notifyTimer)
  notifyTimer = setTimeout(() => {
    const dates = [...pendingDates]
    const foods = foodsChanged
    pendingDates = new Set()
    foodsChanged = false
    for (const cb of listeners) { try { cb({ dates, foods }) } catch (e) { console.warn('Live update handler failed', e) } }
  }, 400)
}

function onEntryEvent(payload) {
  const date = payload.new?.date || payload.old?.date || (payload.old?.id && ownerDates().get(payload.old.id))
  if (payload.eventType === 'DELETE' && !date) return // another profile's entry
  if (date) pendingDates.add(date)
  notifySoon()
}

function watch(pid) {
  if (channel) supa.removeChannel(channel)
  channel = supa.channel(`nutrilog-desk-${pid}-${Date.now()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nutrilog_entries', filter: `profile_id=eq.${pid}` }, onEntryEvent)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'nutrilog_entries', filter: `profile_id=eq.${pid}` }, onEntryEvent)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'nutrilog_entries' }, onEntryEvent)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'nutrilog_foods' }, () => { foodsChanged = true; notifySoon() })
    .subscribe()
}

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
    watch(profileId)
  },

  // Full re-read (another device may have edited anything). A save that failed
  // must land first.
  async reload() {
    if (pending.size && !(await retryPending())) throw new Error('Changes are still waiting to save')
    await queue
    S = await loadProfile(profileId)
  },

  // cb({ dates: ['YYYY-MM-DD', …], foods: bool }) after another device changes something.
  onRemoteChange(cb) { listeners.add(cb); return () => listeners.delete(cb) },

  // A date's entries as the cloud has them now, or null if unchanged since the
  // last load. Doesn't adopt them: the caller does (acceptDay) once it knows
  // nothing changed locally meanwhile.
  async peekDay(date) {
    await queue
    const remote = await readDay(profileId, date)
    return sameDay(remote, S.days[date] || []) ? null : remote
  },
  acceptDay(date, remote) {
    if (remote.length) S.days[date] = clone(remote)
    else delete S.days[date]
  },
  peekToday() { return this.peekDay(todayStr()) },

  // Gives today's new entries their id as soon as they exist (called on every
  // render), so a copy made before the save — e.g. History showing today —
  // carries the same id instead of becoming a second entry.
  ensureTodayIds(list) { if (Array.isArray(list)) assignEntryIds({ [todayStr()]: list }) },

  // Does `list` hold exactly what was last saved for `date`? (order and key order ignored)
  dayMatches(list, date = todayStr()) {
    return Array.isArray(list) && sameDay(list, S?.days[date] || [])
  },
  acceptToday(remote) { this.acceptDay(todayStr(), remote) },

  // The food library as the cloud has it now (adopted at once — the UI only
  // calls this when its own copy has no unsaved change: foodsMatch).
  async refreshFoods() {
    await queue
    S.foodlib = await readFoods()
    return clone(S.foodlib)
  },
  foodsMatch(list) {
    if (!S || !Array.isArray(list) || list.length !== S.foodlib.length) return false
    return list.every((f, i) => f.id === S.foodlib[i].id && sameFood(f, S.foodlib[i]))
  },

  async switchProfile(id) {
    await queue
    profileId = id
    try { localStorage.setItem(ACTIVE_KEY, id) } catch { /* this session only */ }
    S = await loadProfile(id)
    watch(id)
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
    if (channel) supa.removeChannel(channel)
    await supa.auth.signOut()
    try { Object.keys(localStorage).filter(k => k.startsWith('nutrilog_cache_')).forEach(k => localStorage.removeItem(k)) } catch { /* nothing cached */ }
  },
}

// Shared with the phone layout, which stores the active profile as a plain string.
function readRaw(k) { try { return localStorage.getItem(k) } catch { return null } }
