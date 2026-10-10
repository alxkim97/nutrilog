import { todayStr, addDays, sumMacros, round1 } from './helpers.js'

// Field names the desktop app saves in nutrilog_settings (target/min/max).
// Goal-setting stays a desktop action; the phone reads and shows progress.
export const MACROS = {
  kcal: { key: 'kcal', label: 'Calories', short: 'kcal', unit: '', target: 'kcalTarget', min: 'kcalMin', max: 'kcalMax', color: 'var(--mk)' },
  protein: { key: 'protein', label: 'Protein', short: 'P', unit: 'g', target: 'protein', min: 'proteinMin', max: 'proteinMax', color: 'var(--mp)' },
  carbs: { key: 'carbs', label: 'Carbs', short: 'C', unit: 'g', target: 'carbs', min: 'carbsMin', max: 'carbsMax', color: 'var(--mc)' },
  fat: { key: 'fat', label: 'Fat', short: 'F', unit: 'g', target: 'fat', min: 'fatMin', max: 'fatMax', color: 'var(--mf)' },
  fiber: { key: 'fiber', label: 'Fiber', short: 'Fi', unit: 'g', target: 'fiber', min: 'fiberMin', max: 'fiberMax', color: 'var(--mfi)', floor: true },
}
const DEFAULT_ORDER = ['protein', 'carbs', 'fat', 'fiber']

export function macroOrder(settings) {
  const saved = Array.isArray(settings?.macroOrder) ? settings.macroOrder.filter(k => MACROS[k] && k !== 'kcal') : []
  return [...saved, ...DEFAULT_ORDER.filter(k => !saved.includes(k))]
}

const num = v => (v == null || v === '' || !isFinite(Number(v)) ? null : Number(v))

export function goalFor(settings, key) {
  const d = MACROS[key]
  const s = settings || {}
  return { target: num(s[d.target]), min: num(s[d.min]), max: d.floor ? null : num(s[d.max]) }
}

// state: 'over' (past max), 'under' (below min), 'ok' (in range or no bounds)
export function macroStatus(consumed, goal, unit = 'g') {
  const { target, min, max } = goal
  if (max != null && consumed > max) return { state: 'over', text: `${round1(consumed - max)}${unit} over max` }
  if (min != null && consumed < min) return { state: 'under', text: `${round1(min - consumed)}${unit} to min` }
  if (min != null || max != null) return { state: 'ok', text: 'In range' }
  if (target != null) {
    const left = round1(target - consumed)
    return { state: 'ok', text: left >= 0 ? `${left}${unit} left` : `${Math.abs(left)}${unit} over` }
  }
  return { state: 'ok', text: '' }
}

export function ringSvg(pct, { size = 64, stroke = 7, color = 'var(--accent)', over = false } = {}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, pct || 0))
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${over ? 'var(--red)' : color}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`
}

// date → macro totals, from history plus today's live meals (history may lag).
export function dailyTotals(history, todayMeals) {
  const map = new Map()
  for (const day of history || []) if (day.meals?.length) map.set(day.date, sumMacros(day.meals))
  const today = todayStr()
  if (todayMeals) {
    if (todayMeals.length) map.set(today, sumMacros(todayMeals))
    else map.delete(today)
  }
  return map
}

// Consecutive days meeting `test`, ending today — or ending yesterday if today
// doesn't meet it yet (an unfinished day shouldn't break the streak).
export function streak(totals, test) {
  let d = todayStr()
  if (!(totals.has(d) && test(totals.get(d)))) d = addDays(d, -1)
  let n = 0
  while (totals.has(d) && test(totals.get(d))) { n++; d = addDays(d, -1) }
  return n
}

// One-tap re-logging: most frequently logged foods, each with its most recent
// occurrence so amount/macros match how you usually log it.
export function frequentFoods(history, limit = 8) {
  const byName = new Map()
  for (const day of history || []) {
    for (const m of day.meals || []) {
      if (!m.name) continue
      const stamp = `${m.date || day.date}${m.time || ''}`
      const f = byName.get(m.name)
      if (!f) byName.set(m.name, { name: m.name, count: 1, latest: m, stamp })
      else {
        f.count++
        if (stamp > f.stamp) { f.latest = m; f.stamp = stamp }
      }
    }
  }
  return [...byName.values()].filter(f => f.count > 1).sort((a, b) => b.count - a.count || (b.stamp > a.stamp ? 1 : -1)).slice(0, limit)
}
