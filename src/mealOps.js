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

// Removes the single entry matching every identifying field — matching only
// name+time would delete both copies of a food logged twice in one minute.
export function deleteEntry(profileId, date, meal) {
  return serialize(async () => {
    const latest = await fetchDayMeals(profileId, date)
    const idx = latest.findIndex(m => m.name === meal.name && m.time === meal.time && m.kcal === meal.kcal && m.cat === meal.cat && m.serving === meal.serving)
    if (idx === -1) return latest
    const updated = [...latest.slice(0, idx), ...latest.slice(idx + 1)]
    await saveDayMeals(profileId, date, updated)
    return updated
  })
}
