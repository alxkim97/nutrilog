// Read-only offline copy of the last successful load, per profile — like Coin's
// cacheData(). Never written back to Supabase; it only lets the app open with
// your data when there's no connection. Cleared on sign-out.
const PREFIX = 'nutrilog_cache_'
const HISTORY_DAYS = 120 // keeps the copy well under localStorage's ~5 MB

export function cacheLoad(profileId, data) {
  try {
    const trimmed = { ...data, history: (data.history || []).slice(0, HISTORY_DAYS), cachedAt: Date.now() }
    localStorage.setItem(PREFIX + profileId, JSON.stringify(trimmed))
  } catch { /* quota or private mode — offline copy is best-effort */ }
}

export function cacheGet(profileId) {
  try {
    const raw = localStorage.getItem(PREFIX + profileId)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function cacheClearAll() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k))
  } catch { /* nothing to clear */ }
}
