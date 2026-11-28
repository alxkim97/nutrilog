// Photo inbox: quick food photos kept for 7 days so Claude can estimate and log
// them later (SUPABASE-SETUP.md, 2026-11-28). Files live in the private bucket
// nutrilog-photos at <user_id>/<uuid>.jpg; one row each in nutrilog_photos.
import { supa } from './supabase.js'
import { exifTakenAt, pickTakenAt } from './exif.js'

export const BUCKET = 'nutrilog-photos'
const MAX_EDGE = 1600
const QUALITY = 0.82
const NOT_SET_UP = new Set(['42P01', 'PGRST205']) // table missing (SQL not run yet)

async function userId() {
  const { data } = await supa.auth.getSession()
  const id = data.session?.user?.id
  if (!id) throw new Error('Signed out — please sign in again')
  return id
}

/* ── reading the time + shrinking, all on the phone before upload ── */

export async function photoTime(file) {
  let exif = null
  try { exif = exifTakenAt(await file.slice(0, 512 * 1024).arrayBuffer()) } catch { /* no EXIF */ }
  return pickTakenAt({ exif, lastModified: file.lastModified })
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve({ img, url })
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Can't read ${file.name || 'that image'}`)) }
    img.src = url
  })
}

// ~1600 px JPEG. Drawing to a canvas drops all metadata (GPS included) — the
// time has already been read by then. Browsers apply the EXIF rotation when
// drawing an <img>, so the result is upright.
export async function compressPhoto(file) {
  const { img, url } = await loadImage(file)
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(img, 0, 0, w, h)
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', QUALITY))
    if (!blob) throw new Error('Could not compress the photo')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

/* ── rows + files ── */

export async function uploadPhoto(profileId, { blob, takenAt, source, note }) {
  const uid = await userId()
  const id = crypto.randomUUID()
  const path = `${uid}/${id}.jpg`
  const { error: upErr } = await supa.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (upErr) throw upErr
  const { data, error } = await supa.from('nutrilog_photos').insert({
    id, user_id: uid, profile_id: profileId, taken_at: takenAt.toISOString(), time_source: source,
    note: note?.trim() || null, path,
  }).select().single()
  if (error) {
    await supa.storage.from(BUCKET).remove([path]).catch(() => {})
    throw error
  }
  return data
}

// This profile's photos that haven't expired, newest first, each with a
// short-lived signed URL for showing it. [] if the SQL hasn't been run yet.
export async function fetchPhotos(profileId) {
  const uid = await userId()
  const { data, error } = await supa.from('nutrilog_photos').select('*')
    .eq('user_id', uid).eq('profile_id', profileId).gt('expires_at', new Date().toISOString())
    .order('taken_at', { ascending: false })
  if (error) {
    if (NOT_SET_UP.has(error.code)) return []
    throw error
  }
  if (!data.length) return []
  const { data: urls } = await supa.storage.from(BUCKET).createSignedUrls(data.map(p => p.path), 3600)
  const byPath = new Map((urls || []).map(u => [u.path, u.signedUrl]))
  return data.map(p => ({ ...p, url: byPath.get(p.path) || null }))
}

export async function updatePhoto(id, patch) {
  const { error } = await supa.from('nutrilog_photos').update(patch).eq('id', id)
  if (error) throw error
}

export async function deletePhoto(photo) {
  const { error } = await supa.storage.from(BUCKET).remove([photo.path])
  if (error) throw error
  const { error: e2 } = await supa.from('nutrilog_photos').delete().eq('id', photo.id)
  if (e2) throw e2
}

// Removes every expired photo (all profiles) — file first, then the row.
// Runs once when the app opens; failures are left for the next open.
export async function purgeExpiredPhotos() {
  try {
    const uid = await userId()
    const { data, error } = await supa.from('nutrilog_photos').select('id,path')
      .eq('user_id', uid).lte('expires_at', new Date().toISOString())
    if (error || !data.length) return 0
    const { error: rmErr } = await supa.storage.from(BUCKET).remove(data.map(p => p.path))
    if (rmErr) return 0
    await supa.from('nutrilog_photos').delete().in('id', data.map(p => p.id))
    return data.length
  } catch {
    return 0
  }
}

// Live updates (e.g. Claude marking a photo logged). Its own channel, so a
// missing table or publication can't disturb the entries channel.
export function subscribePhotos(profileId, onChange) {
  let timer = null
  const fire = () => { clearTimeout(timer); timer = setTimeout(onChange, 400) }
  const channel = supa.channel(`nutrilog-photos-${profileId}-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'nutrilog_photos', filter: `profile_id=eq.${profileId}` }, fire)
    .subscribe()
  return () => { clearTimeout(timer); supa.removeChannel(channel) }
}
