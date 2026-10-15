import { fetchDayMeals, saveDayMeals } from './supabase.js'

// Every add/delete is a read-modify-write of the whole day (re-read the latest
// copy, change it, save it back). Chaining them through one queue stops two
// quick taps from both reading the same old copy and the second save silently
// undoing the first.
let queue = Promise.resolve()
function serialize(fn) {
  const run = queue.then(fn, fn)
  queue = run.catch(() => {})
  return run
}

const byTime = (a, b) => (a.time || '').localeCompare(b.time || '')

export function logEntry(profileId, date, entry) {
  return serialize(async () => {
    const latest = await fetchDayMeals(profileId, date)
    const updated = [...latest, entry].sort(byTime)
    await saveDayMeals(profileId, date, updated)
    return updated
  })
}

// Every identifying field, not just name+time — two copies of the same food
// logged a minute apart would otherwise be indistinguishable.
const identify = (a, b) => a.name === b.name && a.time === b.time && a.kcal === b.kcal && a.cat === b.cat && a.serving === b.serving

// Removes the single entry matching every identifying field — matching only
// name+time would delete both copies of a food logged twice in one minute.
export function deleteEntry(profileId, date, meal) {
  return serialize(async () => {
    const latest = await fetchDayMeals(profileId, date)
    const idx = latest.findIndex(m => identify(m, meal))
    if (idx === -1) return latest
    const updated = [...latest.slice(0, idx), ...latest.slice(idx + 1)]
    await saveDayMeals(profileId, date, updated)
    return updated
  })
}

// Replaces one entry in place (editing name/macros/category/time), re-reading
// the day first so an edit never clobbers something logged from another
// device in the meantime. Throws if the original entry is no longer there —
// the caller should tell the user to refresh rather than silently no-op.
export function updateEntry(profileId, date, oldMeal, newMeal) {
  return serialize(async () => {
    const latest = await fetchDayMeals(profileId, date)
    const idx = latest.findIndex(m => identify(m, oldMeal))
    if (idx === -1) throw new Error('This entry changed elsewhere — refresh and try again')
    const updated = [...latest.slice(0, idx), newMeal, ...latest.slice(idx + 1)].sort(byTime)
    await saveDayMeals(profileId, date, updated)
    return updated
  })
}
