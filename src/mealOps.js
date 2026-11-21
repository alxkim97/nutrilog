import { insertEntry, updateEntryRow, deleteEntryRow } from './supabase.js'

// Each logged entry is its own row with an id, so adding, editing and deleting
// touch only that row — nothing to re-read or merge, and a change made on
// another device meanwhile is never undone.

export function logEntry(profileId, date, entry) {
  return insertEntry(profileId, date, entry)
}

export async function deleteEntry(profileId, date, meal) {
  if (!meal?.id) throw new Error('This entry is out of date — refresh and try again')
  await deleteEntryRow(meal.id)
}

export function updateEntry(profileId, date, oldMeal, newMeal) {
  if (!oldMeal?.id) throw new Error('This entry is out of date — refresh and try again')
  return updateEntryRow(oldMeal.id, profileId, date, newMeal)
}
