// Run this yourself, in your own terminal — not through Claude. Sign in as the
// HELPER account (Settings → Claude access), never your own. It saves that
// account's session to .nutrilog-session.json (gitignored) so Claude can use
// scripts/nutrilog-claude.mjs without ever seeing a password. What the helper
// may do is enforced by the database, per Settings → Claude access.
//
//   node scripts/save-session.mjs
//
// Refuses an account that has NutriLog data of its own (i.e. your main one).
// To revoke: Disconnect in Settings (immediate), and/or delete the file.
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import readline from 'readline'

const SESSION_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '.nutrilog-session.json')
const SUPA_URL = 'https://jpsisvaprkrcyvwnmasb.supabase.co'
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impwc2lzdmFwcmtyY3l2d25tYXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDM3NDgsImV4cCI6MjA5MzQ3OTc0OH0.Q7kmjiYSayzFJkjH42RoEXhbr9hjI9lXaDmX5Es4D4M'

function ask(question, hidden = false) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s) }
    rl.question(question, a => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()) })
  })
}

const email = await ask('Helper account email: ')
const password = await ask('Password (hidden): ', true)
if (!email || !password) { console.error('Email and password are required.'); process.exit(1) }

const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } })
const { data, error } = await supa.auth.signInWithPassword({ email, password })
if (error) { console.error('Sign-in failed:', error.message); process.exit(1) }
const uid = data.user.id

// Safety: the helper owns no NutriLog data of its own.
for (const table of ['nutrilog_entries', 'nutrilog_foods', 'nutrilog_settings']) {
  const { data: own, error: e } = await supa.from(table).select('user_id').eq('user_id', uid).limit(1)
  if (e) { console.error(`${table}: ${e.message}`); process.exit(1) }
  if (own.length) {
    await supa.auth.signOut()
    console.error(`${data.user.email} has its own NutriLog data — that looks like your main account. Not saved.`)
    console.error('Sign in with the separate helper account instead (Settings → Claude access).')
    process.exit(1)
  }
}
const { data: grants, error: gErr } = await supa.from('nutrilog_delegates').select('owner_id').eq('delegate_id', uid)
if (gErr) console.warn(`Note: ${gErr.message} — has the 2026-11-25 SQL been run?`)
else if (!grants.length) console.warn('Note: this account is not connected yet — enter its email in Settings → Claude access.')

writeFileSync(SESSION_PATH, JSON.stringify({
  access_token: data.session.access_token,
  refresh_token: data.session.refresh_token,
  saved_at: new Date().toISOString(),
  email: data.user.email,
}, null, 2))
console.log(`Signed in as ${data.user.email}. Session saved to ${SESSION_PATH}`)
console.log('Claude can now act as this helper, limited to what Settings → Claude access allows.')
