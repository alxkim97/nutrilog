// Conversion between the app's entry / food objects and the one-row-per-item
// tables (nutrilog_entries, nutrilog_foods), plus the one-time copy from the old
// blob tables. Used by the app, scripts/migrate-to-rows.mjs and
// test/rows-transform.test.mjs.

const ENTRY_CORE = ['name', 'time', 'cat', 'serving', 'unit', 'kcal', 'protein', 'fat', 'carbs', 'fiber', 'notes']
const FOOD_CORE = ['name', 'serving', 'unit', 'kcal', 'protein', 'fat', 'carbs', 'fiber', 'type']
// Never stored in `extra`: columns of their own (id, date, user/profile, timestamps),
// `_ri` (a screen-position index, rebuilt on every render), `_uses` (→ uses).
const ROW_COLUMNS = ['id', 'user_id', 'profile_id', 'created_at', 'updated_at', 'extra']
const ENTRY_DROP = new Set(['date', ...ROW_COLUMNS])
const FOOD_DROP = new Set(['_ri', '_uses', 'uses', ...ROW_COLUMNS])
const MACROS = ['kcal', 'protein', 'fat', 'carbs', 'fiber']

// '' / null / 'abc' → null; '12.5' → 12.5
export function toNum(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function extraOf(obj, core, drop) {
  const x = {}
  for (const [k, v] of Object.entries(obj || {})) {
    if (core.includes(k) || drop.has(k) || v === undefined) continue
    x[k] = v
  }
  return x
}

export function entryToRow(m, { profileId, date }) {
  const row = {
    profile_id: profileId,
    date,
    time: m.time ? String(m.time) : null,
    cat: m.cat ? String(m.cat) : null,
    name: String(m.name ?? '').trim() || '(unnamed)',
    serving: toNum(m.serving),
    unit: m.unit ? String(m.unit) : null,
    notes: m.notes ? String(m.notes) : '',
    extra: extraOf(m, ENTRY_CORE, ENTRY_DROP),
  }
  for (const k of MACROS) row[k] = toNum(m[k]) ?? 0
  // A macro that wasn't a number is kept as typed, so nothing is silently lost.
  for (const k of MACROS) if (m[k] !== undefined && m[k] !== '' && toNum(m[k]) === null) row.extra[`raw_${k}`] = m[k]
  return row
}

export function foodToRow(f) {
  const row = {
    name: String(f.name ?? '').trim(),
    serving: toNum(f.serving),
    unit: f.unit ? String(f.unit) : null,
    type: f.type ? String(f.type) : null,
    uses: Math.max(0, Math.round(toNum(f._uses) ?? 0)),
    extra: extraOf(f, FOOD_CORE, FOOD_DROP),
  }
  for (const k of MACROS) row[k] = toNum(f[k]) ?? 0
  return row
}

// Row → the object shape the app has always used (extras spread back on top level).
export function rowToEntry(r) {
  return {
    ...(r.extra || {}),
    id: r.id, date: r.date, time: r.time || '', cat: r.cat, name: r.name,
    serving: r.serving, unit: r.unit,
    kcal: r.kcal, protein: r.protein, fat: r.fat, carbs: r.carbs, fiber: r.fiber,
    notes: r.notes || '',
  }
}

export function rowToFood(r) {
  const f = {
    ...(r.extra || {}),
    id: r.id, name: r.name, serving: r.serving, unit: r.unit,
    kcal: r.kcal, protein: r.protein, fat: r.fat, carbs: r.carbs, fiber: r.fiber,
    _uses: r.uses || 0,
  }
  if (r.type) f.type = r.type
  return f
}

// Same content? (ignores key order, screen-only fields, and the date/id bookkeeping)
export const sameEntry = (a, b) => JSON.stringify(entryToRow(a, { profileId: '', date: '' })) === JSON.stringify(entryToRow(b, { profileId: '', date: '' }))
export const sameFood = (a, b) => JSON.stringify(foodToRow(a)) === JSON.stringify(foodToRow(b))

/* ── ids and diffs (desktop saves) ── */

// Gives every entry an id, in place. `owner` maps an id to the date it was last
// saved under; an entry carrying another date's id (copied from that day) or an
// id already seen in this save gets a fresh one, so it's added, not moved.
export function assignEntryIds(daysMap, owner, newId) {
  const seen = new Set()
  for (const [date, list] of Object.entries(daysMap || {})) {
    for (const e of list || []) {
      if (!e || typeof e !== 'object') continue
      const o = e.id && owner.get(e.id)
      if (!e.id || seen.has(e.id) || (o && o !== date)) e.id = newId()
      seen.add(e.id)
    }
  }
}

export function assignFoodIds(list, newId) {
  const seen = new Set()
  for (const f of list || []) {
    if (!f || typeof f !== 'object') continue
    if (!f.id || seen.has(f.id)) f.id = newId()
    seen.add(f.id)
  }
}

// Row operations that turn `base` (what was last loaded) into `mine` for one
// date. Rows only the cloud has (another device's) are left alone.
export function diffEntries(date, mine, base, profileId) {
  const baseById = new Map(base.map(e => [e.id, e]))
  const mineIds = new Set()
  const upserts = [], updates = []
  for (const e of mine || []) {
    if (!e || typeof e !== 'object' || !e.id) continue
    mineIds.add(e.id)
    const b = baseById.get(e.id)
    const row = { id: e.id, ...entryToRow(e, { profileId, date }) }
    if (!b) upserts.push(row)
    else if (!sameEntry(e, b)) updates.push(row)
  }
  const deletes = base.filter(e => !mineIds.has(e.id)).map(e => e.id)
  return { upserts, updates, deletes }
}

export function diffFoods(mine, base) {
  const baseById = new Map(base.map(f => [f.id, f]))
  const mineIds = new Set()
  const inserts = [], updates = []
  for (const f of mine || []) {
    if (!f || typeof f !== 'object' || !f.id || !String(f.name || '').trim()) continue
    mineIds.add(f.id)
    const b = baseById.get(f.id)
    const row = { id: f.id, ...foodToRow(f) }
    if (!b) inserts.push(row)
    else if (!sameFood(f, b)) updates.push(row)
  }
  const deletes = base.filter(f => !mineIds.has(f.id)).map(f => f.id)
  return { inserts, updates, deletes }
}

const dayKey = (profileId, date) => `${profileId}|${date}`

// Picks one copy of each day. Today: the sessions row (every app writes it first).
// Any other day: history, which is what the desktop shows; sessions only when
// history has no row for that day.
export function pickDays(historyRows, sessionRows, today) {
  const hist = new Map(historyRows.map(r => [dayKey(r.profile_id, r.date), r]))
  const sess = new Map(sessionRows.map(r => [dayKey(r.profile_id, r.date), r]))
  const days = []
  const disagreements = []
  for (const key of new Set([...hist.keys(), ...sess.keys()])) {
    const h = hist.get(key), s = sess.get(key)
    const hm = Array.isArray(h?.meals) ? h.meals : null
    const sm = Array.isArray(s?.meals) ? s.meals : null
    const [profileId, date] = [(h || s).profile_id, (h || s).date]
    let meals, source
    if (date === today && sm) { meals = sm; source = 'sessions' }
    else if (hm) { meals = hm; source = 'history' }
    else { meals = sm || []; source = 'sessions' }
    if (hm && sm && JSON.stringify(hm) !== JSON.stringify(sm)) {
      disagreements.push({ profileId, date, history: hm.length, sessions: sm.length, used: source })
    }
    days.push({ profileId, date, meals, source })
  }
  days.sort((a, b) => a.profileId.localeCompare(b.profileId) || a.date.localeCompare(b.date))
  disagreements.sort((a, b) => a.profileId.localeCompare(b.profileId) || a.date.localeCompare(b.date))
  return { days, disagreements }
}

export function daysToEntryRows(days) {
  const rows = []
  for (const d of days) for (const m of d.meals) if (m && typeof m === 'object') rows.push(entryToRow(m, d))
  return rows
}

// One row per name, ignoring case and outer spaces. The first copy (the most
// recently added, since new foods go to the front) wins; use counts are summed.
export function dedupeFoods(list) {
  const byName = new Map()
  const duplicates = []
  for (const f of list || []) {
    if (!f || typeof f !== 'object') continue
    const row = foodToRow(f)
    if (!row.name) continue
    const key = row.name.toLowerCase()
    const kept = byName.get(key)
    if (kept) {
      kept.uses += row.uses
      duplicates.push({ kept: kept.name, dropped: row.name, keptKcal: kept.kcal, droppedKcal: row.kcal })
    } else byName.set(key, row)
  }
  return { rows: [...byName.values()], duplicates }
}

export function totals(rows) {
  const t = { count: rows.length }
  for (const k of MACROS) t[k] = Math.round(rows.reduce((a, r) => a + (r[k] || 0), 0) * 10) / 10
  return t
}
