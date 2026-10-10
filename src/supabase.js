import { createClient } from '@supabase/supabase-js'

// Same Supabase project ("lifelog") the NutriLog desktop app has always used.
// SUPA_KEY is the public anon key — intentionally client-visible; access is
// enforced by Row Level Security (see SUPABASE-SETUP.md), not key secrecy.
const SUPA_URL = 'https://jpsisvaprkrcyvwnmasb.supabase.co'
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impwc2lzdmFwcmtyY3l2d25tYXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDM3NDgsImV4cCI6MjA5MzQ3OTc0OH0.Q7kmjiYSayzFJkjH42RoEXhbr9hjI9lXaDmX5Es4D4M'

export const supa = createClient(SUPA_URL, SUPA_KEY)

// PostgREST caps a response at 1000 rows and silently drops the rest.
const PAGE = 1000
const SHARED = 'shared' // profile_id of the food library row (and the profile list)

async function userId() {
  const { data } = await supa.auth.getSession()
  const id = data.session?.user?.id
  if (!id) throw new Error('Signed out — please sign in again')
  return id
}

async function readAll(buildQuery) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < PAGE) return rows
  }
}

/* ── Auth ── */

export async function getSession() {
  const { data } = await supa.auth.getSession()
  return data.session
}

export function onAuthChange(cb) {
  supa.auth.onAuthStateChange((_event, session) => cb(session))
}

export async function signIn(email, password) {
  const { data, error } = await supa.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  await supa.auth.signOut()
}

/* ── Profiles + settings ── */

function titleCase(id) {
  return String(id).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Every profile's settings row in one read. The profile list itself comes from
// the shared row's `profiles` array once one has been saved; until then it's
// derived from which profiles have a settings row, so nothing needs writing.
export async function fetchProfilesAndSettings() {
  const uid = await userId()
  const rows = await readAll(() => supa.from('nutrilog_settings').select('profile_id,data').eq('user_id', uid).order('profile_id'))
  const settingsByProfile = {}
  for (const r of rows) settingsByProfile[r.profile_id] = r.data || {}
  const saved = settingsByProfile[SHARED]?.profiles
  let profiles
  if (Array.isArray(saved) && saved.length) {
    profiles = saved.filter(p => p && p.id).map(p => ({ id: p.id, name: p.name || titleCase(p.id) }))
  } else {
    // Named from the id, not settings.displayName — some profiles' settings
    // carry another profile's displayName (Mom's says "Alex Kim").
    profiles = rows
      .filter(r => r.profile_id !== SHARED)
      .map(r => ({ id: r.profile_id, name: titleCase(r.profile_id) }))
  }
  if (!profiles.length) profiles = [{ id: 'alex', name: 'Alex' }]
  delete settingsByProfile[SHARED]
  return { profiles, settingsByProfile }
}

// Read-modify-write of one profile's settings blob, so a phone-side change
// (theme) only touches the keys it means to and keeps everything the desktop saved.
export async function saveSettingsPatch(profileId, patch) {
  const uid = await userId()
  const { data, error } = await supa.from('nutrilog_settings').select('data').eq('user_id', uid).eq('profile_id', profileId).maybeSingle()
  if (error) throw error
  const next = { ...(data?.data || {}), ...patch, savedAt: new Date().toISOString() }
  const { error: e2 } = await supa.from('nutrilog_settings')
    .upsert({ user_id: uid, profile_id: profileId, data: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id,profile_id' })
  if (e2) throw e2
  return next
}

/* ── Food library (one shared JSON array) ── */

export async function fetchFoodLibrary() {
  const uid = await userId()
  const { data, error } = await supa.from('nutrilog_food_library').select('data').eq('user_id', uid).eq('profile_id', SHARED).maybeSingle()
  if (error) throw error
  return Array.isArray(data?.data) ? data.data : []
}

// Adds `item` unless an entry with the same name (case-insensitive) exists.
// Re-reads the latest library first so another device's additions survive.
// Non-fatal: the meal itself has already been saved by the time this runs.
export async function addToFoodLibrary(item) {
  try {
    const uid = await userId()
    const latest = await fetchFoodLibrary()
    const name = item.name.toLowerCase()
    if (latest.some(f => (f.name || '').toLowerCase() === name)) return
    const { error } = await supa.from('nutrilog_food_library')
      .upsert({ user_id: uid, profile_id: SHARED, data: [{ ...item, _uses: 1 }, ...latest], updated_at: new Date().toISOString() }, { onConflict: 'user_id,profile_id' })
    if (error) throw error
  } catch (e) {
    console.warn('addToFoodLibrary failed (meal was still saved):', e)
  }
}

/* ── Meals: one row per profile per date ── */

export async function fetchDayMeals(profileId, date) {
  const uid = await userId()
  const { data, error } = await supa.from('nutrilog_sessions').select('meals')
    .eq('user_id', uid).eq('profile_id', profileId).eq('date', date).maybeSingle()
  if (error) throw error
  return Array.isArray(data?.meals) ? data.meals : []
}

// Writes `date` to both nutrilog_sessions and nutrilog_history, as the desktop
// app does, so the day shows up in history on every device straight away.
// Sessions first: if that fails nothing is written, rather than leaving
// history holding an entry Today doesn't have.
export async function saveDayMeals(profileId, date, meals) {
  const uid = await userId()
  const updated_at = new Date().toISOString()
  const withDate = meals.map(m => ({ ...m, date }))
  const { error: e1 } = await supa.from('nutrilog_sessions')
    .upsert({ user_id: uid, profile_id: profileId, date, meals: withDate, updated_at }, { onConflict: 'user_id,profile_id,date' })
  if (e1) throw e1
  const { error: e2 } = await supa.from('nutrilog_history')
    .upsert({ user_id: uid, profile_id: profileId, date, meals: withDate, updated_at }, { onConflict: 'user_id,profile_id,date' })
  if (e2) throw e2
}

// All past days, newest first, as [{ date, meals }].
export async function fetchHistory(profileId) {
  const uid = await userId()
  const rows = await readAll(() => supa.from('nutrilog_history').select('date,meals')
    .eq('user_id', uid).eq('profile_id', profileId).order('date', { ascending: false }))
  return rows.map(r => ({ date: r.date, meals: Array.isArray(r.meals) ? r.meals : [] }))
}
