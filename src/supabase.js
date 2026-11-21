import { createClient } from '@supabase/supabase-js'
import { entryToRow, foodToRow, rowToEntry, rowToFood } from './rowsShape.js'

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

/* ── Food library: one row per food in nutrilog_foods, shared by every profile ── */

export async function fetchFoodLibrary() {
  const uid = await userId()
  const rows = await readAll(() => supa.from('nutrilog_foods').select('*').eq('user_id', uid).order('created_at', { ascending: false }).order('name'))
  return rows.map(rowToFood)
}

// Adds `item` unless a food with that name exists (the table refuses a second
// one, ignoring case and spaces). Non-fatal: the meal is already saved by now.
export async function addToFoodLibrary(item) {
  try {
    const { error } = await supa.from('nutrilog_foods').insert({ ...foodToRow({ ...item, _uses: 1 }) })
    if (error && error.code !== DUPLICATE) throw error
  } catch (e) {
    console.warn('addToFoodLibrary failed (meal was still saved):', e)
  }
}

/* ── Meals: one row per logged entry in nutrilog_entries ── */

const DUPLICATE = '23505' // unique-index violation
const byTimeThenAdded = q => q.order('time', { ascending: true, nullsFirst: true }).order('created_at')

export async function fetchDayMeals(profileId, date) {
  const uid = await userId()
  const { data, error } = await byTimeThenAdded(supa.from('nutrilog_entries').select('*')
    .eq('user_id', uid).eq('profile_id', profileId).eq('date', date))
  if (error) throw error
  return data.map(rowToEntry)
}

export async function insertEntry(profileId, date, entry) {
  const row = { ...entryToRow(entry, { profileId, date }) }
  if (entry.id) row.id = entry.id
  const { data, error } = await supa.from('nutrilog_entries').insert(row).select().single()
  if (error) throw error
  return rowToEntry(data)
}

// Edits one entry in place. Throws if it no longer exists (deleted on another device).
export async function updateEntryRow(id, profileId, date, entry) {
  const { data, error } = await supa.from('nutrilog_entries')
    .update(entryToRow(entry, { profileId, date })).eq('id', id).select()
  if (error) throw error
  if (!data.length) throw new Error('This entry was deleted on another device — refresh to see the latest')
  return rowToEntry(data[0])
}

export async function deleteEntryRow(id) {
  const { error } = await supa.from('nutrilog_entries').delete().eq('id', id)
  if (error) throw error
}

// Every day that has entries, newest first, as [{ date, meals }] (includes today).
export async function fetchHistory(profileId) {
  const uid = await userId()
  const rows = await readAll(() => byTimeThenAdded(supa.from('nutrilog_entries').select('*')
    .eq('user_id', uid).eq('profile_id', profileId).order('date', { ascending: false })))
  const days = new Map()
  for (const r of rows) {
    if (!days.has(r.date)) days.set(r.date, [])
    days.get(r.date).push(rowToEntry(r))
  }
  return [...days].map(([date, meals]) => ({ date, meals }))
}

/* ── Live updates ── */

// Calls onChange() whenever an entry of this profile, or any food, changes on
// any device. Returns an unsubscribe function. Deletes can't be filtered by
// profile on the server, so a delete in another profile also triggers a
// (harmless) refresh.
export function subscribeChanges(profileId, onChange) {
  let timer = null
  const fire = () => { clearTimeout(timer); timer = setTimeout(onChange, 400) }
  const channel = supa.channel(`nutrilog-${profileId}-${Date.now()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nutrilog_entries', filter: `profile_id=eq.${profileId}` }, fire)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'nutrilog_entries', filter: `profile_id=eq.${profileId}` }, fire)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'nutrilog_entries' }, fire)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'nutrilog_foods' }, fire)
    .subscribe()
  return () => { clearTimeout(timer); supa.removeChannel(channel) }
}
