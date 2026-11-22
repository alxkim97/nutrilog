// One-off: adds "Aro Fish Chip (1 piece, est.)" to the food database and logs
// 3 pieces for today. Label: 230 kcal / 8 P / 13 F / 19 C per 100 g; a piece is
// estimated at 50 g. Signs in with your account (password typed hidden).
//   node scripts/add-fish-chip.mjs
import { createClient } from '@supabase/supabase-js'
import readline from 'readline'
import { foodToRow, entryToRow } from '../src/rowsShape.js'

const SUPA_URL = 'https://jpsisvaprkrcyvwnmasb.supabase.co'
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impwc2lzdmFwcmtyY3l2d25tYXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDM3NDgsImV4cCI6MjA5MzQ3OTc0OH0.Q7kmjiYSayzFJkjH42RoEXhbr9hjI9lXaDmX5Es4D4M'

const FOOD = { name: 'Aro Fish Chip (1 piece, est.)', serving: 1, unit: 'piece', kcal: 115, protein: 4, fat: 6.5, carbs: 9.5, fiber: 0, sugar: 2, satFat: 3.5, _uses: 3 }
const PIECES = 3

function ask(question, hidden = false) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s) }
    rl.question(question, a => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()) })
  })
}

const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } })
const email = await ask('NutriLog email: ')
const password = await ask('Password (hidden): ', true)
const { data: auth, error: authErr } = await supa.auth.signInWithPassword({ email, password })
if (authErr) { console.error('Sign-in failed:', authErr.message); process.exit(1) }

const profileId = (await ask('Profile [alex]: ')) || 'alex'
const cat = (await ask('Meal (breakfast / lunch / dinner / snack) [snack]: ')) || 'snack'
const d = new Date()
const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

const { error: fErr } = await supa.from('nutrilog_foods').insert(foodToRow(FOOD))
if (fErr && fErr.code !== '23505') { console.error('Food not added:', fErr.message); process.exit(1) }
console.log(fErr ? 'Food already in the database — left as is.' : 'Food added to the database.')

const entry = { ...FOOD, serving: PIECES, cat, time, kcal: FOOD.kcal * PIECES, protein: FOOD.protein * PIECES, fat: FOOD.fat * PIECES, carbs: FOOD.carbs * PIECES, fiber: 0, sugar: FOOD.sugar * PIECES, satFat: FOOD.satFat * PIECES, notes: 'est. 50 g per piece' }
delete entry._uses
const { error: eErr } = await supa.from('nutrilog_entries').insert(entryToRow(entry, { profileId, date }))
if (eErr) { console.error('Entry not logged:', eErr.message); process.exit(1) }
console.log(`Logged ${PIECES} pieces on ${date} at ${time} (${cat}): ${entry.kcal} kcal, ${entry.protein} P, ${entry.fat} F, ${entry.carbs} C.`)
await supa.auth.signOut()
