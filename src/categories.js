export const MEAL_CATEGORIES = [
  { id: 'breakfast', label: 'Breakfast', icon: 'sunrise' },
  { id: 'lunch', label: 'Lunch', icon: 'lunch' },
  { id: 'dinner', label: 'Dinner', icon: 'moon' },
  { id: 'snack', label: 'Snack', icon: 'snack' },
]

export const MEAL_ICON = Object.fromEntries(MEAL_CATEGORIES.map(c => [c.id, c.icon]))
export const MEAL_LABEL = Object.fromEntries(MEAL_CATEGORIES.map(c => [c.id, c.label]))

// Best-guess category from the clock, so quick-add starts on a sensible default.
export function guessCategory(date = new Date()) {
  const h = date.getHours()
  if (h < 10) return 'breakfast'
  if (h < 14) return 'lunch'
  if (h < 17) return 'snack'
  if (h < 21) return 'dinner'
  return 'snack'
}
