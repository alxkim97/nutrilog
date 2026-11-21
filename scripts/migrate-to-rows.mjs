// Copies NutriLog's old blob tables into the one-row-per-item tables
// (nutrilog_entries, nutrilog_foods). See SUPABASE-SETUP.md, 2026-11-21.
//
//   npm run migrate:rows                       dry run: reads everything, writes nothing
//   npm run migrate:rows -- --apply            backup file first, then copy
//   npm run migrate:rows -- --apply --replace  empty the two new tables first, then copy
//
// The old tables are only ever read. Signs in with your own account; the
// password is typed hidden and never stored.
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'
import { pickDays, daysToEntryRows, dedupeFoods, totals } from '../src/rowsShape.js'

const SUPA_URL = 'https://jpsisvaprkrcyvwnmasb.supabase.co'
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impwc2lzdmFwcmtyY3l2d25tYXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDM3NDgsImV4cCI6MjA5MzQ3OTc0OH0.Q7kmjiYSayzFJkjH42RoEXhbr9hjI9lXaDmX5Es4D4M'
const SOURCE = ['nutrilog_sessions', 'nutrilog_history', 'nutrilog_food_library', 'nutrilog_settings', 'nutrilog_recipes', 'nutrilog_templates', 'nutrilog_checkins']
const PAGE = 1000
const CHUNK = 500

const APPLY = process.argv.includes('--apply')
const REPLACE = process.argv.includes('--replace')

function ask(question, hidden = false) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s) }
    rl.question(question, answer => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer.trim()) })
  })
}

async function readAll(supa, table, userId) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supa.from(table).select('*').eq('user_id', userId).order('profile_id').range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...data)
    if (data.length < PAGE) return rows
  }
}

async function countRows(supa, table, userId) {
  const { count, error } = await supa.from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId)
  if (error) throw new Error(`${table}: ${error.message} — has step 1 of the 2026-11-21 SQL been run?`)
  return count || 0
}

async function insertAll(supa, table, rows) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supa.from(table).insert(rows.slice(i, i + CHUNK))
    if (error) throw new Error(`${table} rows ${i + 1}–${i + CHUNK}: ${error.message}`)
    process.stdout.write(`\r  ${table}: ${Math.min(i + CHUNK, rows.length)} / ${rows.length}`)
  }
  process.stdout.write('\n')
}

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ── sign in and read ── */

const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } })
console.log(APPLY ? 'NutriLog → rows: APPLY (will write)\n' : 'NutriLog → rows: dry run (writes nothing)\n')
const email = await ask('NutriLog email: ')
const password = await ask('Password (hidden): ', true)
const { data: auth, error: authErr } = await supa.auth.signInWithPassword({ email, password })
if (authErr) { console.error('Sign-in failed:', authErr.message); process.exit(1) }
const uid = auth.user.id

const src = {}
for (const t of SOURCE) src[t] = await readAll(supa, t, uid)

/* ── convert ── */

const today = localToday()
const { days, disagreements } = pickDays(src.nutrilog_history, src.nutrilog_sessions, today)
const entryRows = daysToEntryRows(days).map(r => ({ ...r, user_id: uid }))
const shared = src.nutrilog_food_library.find(r => r.profile_id === 'shared')
const libList = Array.isArray(shared?.data) ? shared.data : []
const { rows: foodRows0, duplicates } = dedupeFoods(libList)
const foodRows = foodRows0.map(r => ({ ...r, user_id: uid }))

/* ── report ── */

console.log(`\nToday is ${today} (this computer's date).`)
console.log('\nEntries per profile:')
const byProfile = {}
for (const d of days) {
  const p = (byProfile[d.profileId] ||= { days: 0, entries: 0, first: d.date, last: d.date })
  p.days++; p.entries += d.meals.length
  if (d.date < p.first) p.first = d.date
  if (d.date > p.last) p.last = d.date
}
for (const [p, v] of Object.entries(byProfile)) console.log(`  ${p.padEnd(10)} ${String(v.days).padStart(5)} days ${String(v.entries).padStart(6)} entries   ${v.first} → ${v.last}`)
const t = totals(entryRows)
console.log(`  total      ${String(days.length).padStart(5)} days ${String(t.count).padStart(6)} entries   ${t.kcal.toLocaleString()} kcal`)

console.log(`\nDays where sessions and history disagree: ${disagreements.length}`)
for (const d of disagreements.slice(0, 40)) console.log(`  ${d.profileId.padEnd(10)} ${d.date}  history ${d.history} · sessions ${d.sessions} entries → using ${d.used}`)
if (disagreements.length > 40) console.log(`  … and ${disagreements.length - 40} more`)

console.log(`\nFoods: ${libList.length} in the library → ${foodRows.length} rows`)
console.log(`Names that differ only by case/spaces: ${duplicates.length}`)
for (const d of duplicates) console.log(`  kept "${d.kept}" (${d.keptKcal} kcal) · merged "${d.dropped}" (${d.droppedKcal} kcal)`)

console.log('\nNot moved (stay in their current tables):')
for (const tname of ['nutrilog_settings', 'nutrilog_recipes', 'nutrilog_templates', 'nutrilog_checkins']) console.log(`  ${tname.padEnd(22)} ${src[tname].length} rows`)

/* ── write ── */

if (!APPLY) {
  await supa.auth.signOut()
  console.log('\nDry run finished — nothing was written. Send this output to Claude before running with --apply.')
  process.exit(0)
}

const existing = { entries: await countRows(supa, 'nutrilog_entries', uid), foods: await countRows(supa, 'nutrilog_foods', uid) }
if ((existing.entries || existing.foods) && !REPLACE) {
  console.error(`\nStopped: the new tables already hold ${existing.entries} entries and ${existing.foods} foods for your account.`)
  console.error('Run with --apply --replace to empty them and copy again.')
  await supa.auth.signOut()
  process.exit(1)
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'nutrilog-backups')
mkdirSync(dir, { recursive: true })
const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
const file = join(dir, `${stamp}_before-rows.json`)
writeFileSync(file, JSON.stringify({ exportedAt: new Date().toISOString(), userId: uid, tables: src }, null, 1))
console.log(`\nBackup saved: ${file}`)

const answer = await ask(`Copy ${entryRows.length} entries and ${foodRows.length} foods${REPLACE ? ' (emptying the new tables first)' : ''}? Type yes: `)
if (answer.toLowerCase() !== 'yes') { console.log('Cancelled — nothing written.'); await supa.auth.signOut(); process.exit(0) }

if (REPLACE) {
  for (const tname of ['nutrilog_entries', 'nutrilog_foods']) {
    const { error } = await supa.from(tname).delete().eq('user_id', uid)
    if (error) throw new Error(`${tname} (emptying): ${error.message}`)
  }
}
await insertAll(supa, 'nutrilog_foods', foodRows)
await insertAll(supa, 'nutrilog_entries', entryRows)

const after = { entries: await countRows(supa, 'nutrilog_entries', uid), foods: await countRows(supa, 'nutrilog_foods', uid) }
await supa.auth.signOut()
const ok = after.entries === entryRows.length && after.foods === foodRows.length
console.log(`\nNew tables now hold ${after.entries} entries and ${after.foods} foods — ${ok ? 'matches what was copied.' : 'DOES NOT MATCH; tell Claude.'}`)
process.exit(ok ? 0 : 1)
