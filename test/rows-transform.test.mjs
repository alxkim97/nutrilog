import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toNum, entryToRow, foodToRow, pickDays, daysToEntryRows, dedupeFoods, totals } from '../src/rowsShape.js'

test('toNum keeps real numbers and turns blanks into null', () => {
  assert.equal(toNum('12.5'), 12.5)
  assert.equal(toNum(0), 0)
  assert.equal(toNum(''), null)
  assert.equal(toNum(null), null)
  assert.equal(toNum('abc'), null)
})

test('entryToRow puts core fields in columns and everything else in extra', () => {
  const m = { name: ' Pomelo ', time: '10:15', cat: 'snack', serving: '200', unit: 'g', kcal: 76, protein: 2, fat: 0, carbs: 20, fiber: 2, notes: '', sugar: 18, nEst: true, _base: { kcal: 38, serving: 100 }, date: '2026-11-21' }
  const r = entryToRow(m, { profileId: 'alex', date: '2026-11-21' })
  assert.equal(r.name, 'Pomelo')
  assert.equal(r.serving, 200)
  assert.equal(r.date, '2026-11-21')
  assert.deepEqual(r.extra, { sugar: 18, nEst: true, _base: { kcal: 38, serving: 100 } })
})

test('entryToRow keeps a non-numeric macro as typed instead of losing it', () => {
  const r = entryToRow({ name: 'x', kcal: 'about 100' }, { profileId: 'alex', date: '2026-01-01' })
  assert.equal(r.kcal, 0)
  assert.equal(r.extra.raw_kcal, 'about 100')
})

test('foodToRow drops the screen index and moves _uses to uses', () => {
  const r = foodToRow({ _ri: 340, name: 'Mix', unit: 'tbsp', serving: 1, kcal: 32, protein: 0.6, fat: 1, carbs: 5.5, fiber: 0.6, _uses: 3, type: 'recipe', satFat: 0.2 })
  assert.equal(r.uses, 3)
  assert.equal(r.type, 'recipe')
  assert.deepEqual(r.extra, { satFat: 0.2 })
})

test('pickDays: today from sessions, other days from history, sessions-only days kept', () => {
  const history = [
    { profile_id: 'alex', date: '2026-11-20', meals: [{ name: 'a' }, { name: 'b' }] },
    { profile_id: 'alex', date: '2026-11-21', meals: [{ name: 'old' }] },
  ]
  const sessions = [
    { profile_id: 'alex', date: '2026-11-20', meals: [{ name: 'a' }] },
    { profile_id: 'alex', date: '2026-11-21', meals: [{ name: 'old' }, { name: 'new' }] },
    { profile_id: 'mom', date: '2026-06-09', meals: [{ name: 'c' }] },
  ]
  const { days, disagreements } = pickDays(history, sessions, '2026-11-21')
  const get = (p, d) => days.find(x => x.profileId === p && x.date === d)
  assert.equal(get('alex', '2026-11-20').meals.length, 2)
  assert.equal(get('alex', '2026-11-20').source, 'history')
  assert.equal(get('alex', '2026-11-21').meals.length, 2)
  assert.equal(get('alex', '2026-11-21').source, 'sessions')
  assert.equal(get('mom', '2026-06-09').source, 'sessions')
  assert.equal(disagreements.length, 2)
  assert.equal(daysToEntryRows(days).length, 5)
})

test('dedupeFoods ignores case and spaces, keeps the first copy, sums uses', () => {
  const { rows, duplicates } = dedupeFoods([
    { name: 'Muesli', kcal: 130, _uses: 2 },
    { name: ' muesli ', kcal: 125, _uses: 5 },
    { name: 'Honey', kcal: 64 },
    { name: '' },
  ])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].kcal, 130)
  assert.equal(rows[0].uses, 7)
  assert.equal(duplicates.length, 1)
})

test('totals adds up macros', () => {
  assert.deepEqual(totals([{ kcal: 10, protein: 1, fat: 0, carbs: 2, fiber: 0 }, { kcal: 5.25, protein: 0, fat: 1, carbs: 0, fiber: 1 }]),
    { count: 2, kcal: 15.3, protein: 1, fat: 1, carbs: 2, fiber: 1 })
})
