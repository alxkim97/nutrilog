// Read-only export of every NutriLog table (all profiles) to a dated JSON file
// in ../nutrilog-backups/. Usage: npm run backup:cloud
// Signs in with your own account; the password is typed hidden and never stored.
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'

const SUPA_URL = 'https://jpsisvaprkrcyvwnmasb.supabase.co'
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impwc2lzdmFwcmtyY3l2d25tYXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDM3NDgsImV4cCI6MjA5MzQ3OTc0OH0.Q7kmjiYSayzFJkjH42RoEXhbr9hjI9lXaDmX5Es4D4M'
const TABLES = ['nutrilog_sessions', 'nutrilog_history', 'nutrilog_settings', 'nutrilog_food_library', 'nutrilog_recipes', 'nutrilog_templates', 'nutrilog_checkins']
const PAGE = 1000

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
    const { data, error } = await supa.from(table).select('*').eq('user_id', userId)
      .order('profile_id').order(table === 'nutrilog_sessions' || table === 'nutrilog_history' ? 'date' : 'profile_id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...data)
    if (data.length < PAGE) return rows
  }
}

const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } })
const email = await ask('NutriLog email: ')
const password = await ask('Password (hidden): ', true)
const { data: auth, error: authErr } = await supa.auth.signInWithPassword({ email, password })
if (authErr) { console.error('Sign-in failed:', authErr.message); process.exit(1) }

const out = { exportedAt: new Date().toISOString(), userId: auth.user.id, tables: {} }
for (const t of TABLES) {
  out.tables[t] = await readAll(supa, t, auth.user.id)
  const profiles = [...new Set(out.tables[t].map(r => r.profile_id))].join(', ')
  console.log(`${t.padEnd(24)} ${String(out.tables[t].length).padStart(5)} rows  [${profiles}]`)
}
await supa.auth.signOut()

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'nutrilog-backups')
mkdirSync(dir, { recursive: true })
const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
const file = join(dir, `${stamp}_cloud.json`)
writeFileSync(file, JSON.stringify(out, null, 1))
console.log('\nSaved', file)
