// The desktop's save logic: ids, and the row operations a save sends.
// Each test is a situation that caused lost or duplicated entries with the old
// whole-day blobs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rowToEntry, rowToFood, sameEntry, assignEntryIds, assignFoodIds, diffEntries, diffFoods } from '../src/rowsShape.js'

let n = 0
const newId = () => `new-${++n}`
const row = (id, date, name, extra = {}) => ({ id, date, time: '08:00', cat: 'breakfast', name, serving: 1, unit: 'serving', kcal: 100, protein: 5, fat: 1, carbs: 10, fiber: 1, notes: '', extra })

test('rowToEntry gives back the app shape, extras on top level', () => {
  const e = rowToEntry(row('a', '2026-11-21', 'Oats', { sugar: 2 }))
  assert.equal(e.id, 'a')
  assert.equal(e.sugar, 2)
  assert.equal(e.extra, undefined)
})

test('sameEntry ignores key order and the id/date bookkeeping', () => {
  const a = rowToEntry(row('a', '2026-11-21', 'Oats'))
  const b = { name: 'Oats', cat: 'breakfast', time: '08:00', serving: 1, unit: 'serving', kcal: 100, protein: 5, fat: 1, carbs: 10, fiber: 1, notes: '', date: 'x' }
  assert.ok(sameEntry(a, b))
  assert.ok(!sameEntry(a, { ...b, kcal: 101 }))
})

test('an entry logged on the phone meanwhile is never deleted by a desktop save', () => {
  const base = [rowToEntry(row('a', 'D', 'Oats'))]
  // desktop adds Milk; the phone added Banana (id p) — the desktop never loaded it
  const mine = [...base.map(e => ({ ...e })), { name: 'Milk', kcal: 60 }]
  assignEntryIds({ D: mine }, new Map([['a', 'D']]), newId)
  const plan = diffEntries('D', mine, base, 'alex')
  assert.equal(plan.upserts.length, 1)
  assert.equal(plan.upserts[0].name, 'Milk')
  assert.deepEqual(plan.deletes, [])
  assert.ok(!plan.upserts.some(r => r.id === 'p'))
})

test('deleting and editing touch only those rows', () => {
  const base = [rowToEntry(row('a', 'D', 'Oats')), rowToEntry(row('b', 'D', 'Egg'))]
  const mine = [{ ...base[1], kcal: 80 }]
  const plan = diffEntries('D', mine, base, 'alex')
  assert.deepEqual(plan.deletes, ['a'])
  assert.equal(plan.updates.length, 1)
  assert.equal(plan.updates[0].id, 'b')
  assert.equal(plan.updates[0].kcal, 80)
  assert.equal(plan.upserts.length, 0)
})

test('nothing changed → no row operations', () => {
  const base = [rowToEntry(row('a', 'D', 'Oats'))]
  const plan = diffEntries('D', base.map(e => ({ ...e })), base, 'alex')
  assert.deepEqual(plan, { upserts: [], updates: [], deletes: [] })
})

test('copying a day gives the copies new ids, so the originals stay put', () => {
  const owner = new Map([['a', '2026-11-20']])
  const copy = { ...rowToEntry(row('a', '2026-11-20', 'Oats')) }
  assignEntryIds({ '2026-11-21': [copy] }, owner, newId)
  assert.notEqual(copy.id, 'a')
})

test('an id that appears twice in one save keeps the first and renews the second', () => {
  const x = { id: 'a', name: 'Oats' }, y = { id: 'a', name: 'Oats' }
  assignEntryIds({ D: [x, y] }, new Map([['a', 'D']]), newId)
  assert.equal(x.id, 'a')
  assert.notEqual(y.id, 'a')
})

test('ids are written onto the caller\'s own objects, so a second save does not insert again', () => {
  const entry = { name: 'Milk', kcal: 60 }
  assignEntryIds({ D: [entry] }, new Map(), newId)
  const id = entry.id
  assignEntryIds({ D: [entry] }, new Map([[id, 'D']]), newId)
  assert.equal(entry.id, id)
})

test('foods: new, changed and removed items; the screen index is ignored', () => {
  const base = [rowToFood({ id: 'f1', name: 'Honey', serving: 21, unit: 'g', kcal: 64, protein: 0, fat: 0, carbs: 17, fiber: 0, uses: 2, type: 'packaged', extra: {} }),
    rowToFood({ id: 'f2', name: 'Oil', serving: 1, unit: 'tbsp', kcal: 120, protein: 0, fat: 14, carbs: 0, fiber: 0, uses: 0, type: null, extra: {} })]
  const mine = [{ ...base[0], _ri: 7 }, { name: 'Muesli Mix', serving: 1, unit: 'tbsp', kcal: 32 }]
  assignFoodIds(mine, newId)
  const plan = diffFoods(mine, base)
  assert.equal(plan.updates.length, 0) // _ri alone isn't a change
  assert.equal(plan.inserts.length, 1)
  assert.equal(plan.inserts[0].name, 'Muesli Mix')
  assert.deepEqual(plan.deletes, ['f2'])
})
