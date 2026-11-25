// Claude's command-line access to NutriLog, as the HELPER account saved by
// scripts/save-session.mjs — never the owner's login. The database limits it to
// what Settings → Claude access allows:
//   read   the connected profile's entries + the food database, while connected
//   write  add / edit / delete those only while an editing window is open
// Every write is logged (nutrilog_delegate_log) and undoable in Settings.
//
//   node scripts/nutrilog-claude.mjs status
//   node scripts/nutrilog-claude.mjs day [YYYY-MM-DD]                 entries + totals (default today)
//   node scripts/nutrilog-claude.mjs days --from YYYY-MM-DD [--to …]  daily totals
//   node scripts/nutrilog-claude.mjs foods [text]                     search the food database
//   node scripts/nutrilog-claude.mjs add-entry '<json>'               date/time default to now
//   node scripts/nutrilog-claude.mjs edit-entry <id> '<json>'         changed fields only
//   node scripts/nutrilog-claude.mjs delete-entry <id>
//   node scripts/nutrilog-claude.mjs add-food '<json>'
//   node scripts/nutrilog-claude.mjs edit-food <id> '<json>'
//   node scripts/nutrilog-claude.mjs delete-food <id>
// Entry JSON: name, serving, unit, kcal, protein, fat, carbs, fiber, cat
// (breakfast|lunch|dinner|snack…), time "HH:MM", date, notes, plus optional
// sugar / addedSugar / satFat (grams; leave out if unknown — never 0).
// Food JSON: name, serving, unit, kcal, protein, fat, carbs, fiber, type, sugar, satFat.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { entryToRow, foodToRow, rowToEntry, rowToFood } from '../src/rowsShape.js'

const SESSION_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '.nutrilog-session.json')
const SUPA_URL = 'https://jpsisvaprkrcyvwnmasb.supabase.co'
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impwc2lzdmFwcmtyY3l2d25tYXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDM3NDgsImV4cCI6MjA5MzQ3OTc0OH0.Q7kmjiYSayzFJkjH42RoEXhbr9hjI9lXaDmX5Es4D4M'

const fail = (msg) => { console.error(msg); process.exit(1) }
const parseJson = (s) => { if (!s) fail('Missing JSON argument'); try { return JSON.parse(s) } catch (e) { fail('Invalid JSON: ' + e.message) } }
const pad = n => String(n).padStart(2, '0')
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const r1 = n => Math.round((Number(n) || 0) * 10) / 10
const opt = (args, name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined }

async function connect() {
  if (!existsSync(SESSION_PATH)) fail('No helper session — ask the user to run: node scripts/save-session.mjs')
  const saved = JSON.parse(readFileSync(SESSION_PATH, 'utf8'))
  const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } })
  const { data, error } = await supa.auth.setSession({ access_token: saved.access_token, refresh_token: saved.refresh_token })
  if (error) fail('Helper session expired — ask the user to re-run: node scripts/save-session.mjs\n' + error.message)
  // refresh tokens rotate: keep the newest one
  writeFileSync(SESSION_PATH, JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token, saved_at: new Date().toISOString(), email: data.user.email }, null, 2))
  const { data: grants, error: gErr } = await supa.from('nutrilog_delegates').select('*').eq('delegate_id', data.user.id)
  if (gErr) fail(gErr.message)
  if (!grants.length) fail(`${data.user.email} isn't connected — the user enters it in NutriLog → Settings → Claude access.`)
  const grant = grants[0]
  return { supa, me: data.user, grant, owner: grant.owner_id, profile: grant.profile_id, editOpen: !!grant.edit_until && new Date(grant.edit_until) > new Date() }
}

function requireEdit(ctx) {
  if (!ctx.editOpen) fail('Editing is off — ask the user to open a window in Settings → Claude access.')
}

const fmtEntry = e => `${e.time || '--:--'} ${String(e.cat || '').padEnd(9)} ${e.name} — ${r1(e.serving)} ${e.unit || ''} · ${r1(e.kcal)} kcal P${r1(e.protein)} F${r1(e.fat)} C${r1(e.carbs)} Fi${r1(e.fiber)}${e.sugar != null ? ` S${r1(e.sugar)}` : ''}${e.satFat != null ? ` SF${r1(e.satFat)}` : ''}${e.notes ? ` (${e.notes})` : ''}  [${e.id}]`
const fmtFood = f => `${f.name} — ${r1(f.serving)} ${f.unit || ''} · ${r1(f.kcal)} kcal P${r1(f.protein)} F${r1(f.fat)} C${r1(f.carbs)} Fi${r1(f.fiber)}${f.type ? ` [${f.type}]` : ''} · used ${f._uses}  [${f.id}]`
const totalsLine = list => { const t = k => r1(list.reduce((a, e) => a + (Number(e[k]) || 0), 0)); return `${t('kcal')} kcal · P ${t('protein')} · F ${t('fat')} · C ${t('carbs')} · Fi ${t('fiber')}` }

async function getRow(ctx, table, id) {
  const { data, error } = await ctx.supa.from(table).select('*').eq('id', id).maybeSingle()
  if (error) fail(error.message)
  if (!data) fail(`No ${table === 'nutrilog_foods' ? 'food' : 'entry'} ${id} visible to the helper.`)
  return data
}

async function readAll(build) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) fail(error.message)
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}

const commands = {
  async status(ctx) {
    console.log(`Helper: ${ctx.me.email}`)
    console.log(`Profile: ${ctx.profile} (+ food database)`)
    console.log(`Editing: ${ctx.editOpen ? `on until ${new Date(ctx.grant.edit_until).toLocaleString('en-GB')}${ctx.grant.edit_note ? ' — ' + ctx.grant.edit_note : ''}` : 'off (read only)'}`)
  },

  async day(ctx, [date = today()]) {
    const { data, error } = await ctx.supa.from('nutrilog_entries').select('*')
      .eq('user_id', ctx.owner).eq('profile_id', ctx.profile).eq('date', date)
      .order('time', { ascending: true, nullsFirst: true }).order('created_at')
    if (error) fail(error.message)
    const list = data.map(rowToEntry)
    console.log(`${date} — ${list.length} entr${list.length === 1 ? 'y' : 'ies'}`)
    list.forEach(e => console.log('  ' + fmtEntry(e)))
    console.log(`Total: ${totalsLine(list)}`)
  },

  async days(ctx, args) {
    const from = opt(args, 'from') || fail('--from YYYY-MM-DD is required')
    const to = opt(args, 'to') || today()
    const rows = await readAll(() => ctx.supa.from('nutrilog_entries').select('*')
      .eq('user_id', ctx.owner).eq('profile_id', ctx.profile).gte('date', from).lte('date', to).order('date').order('id'))
    const byDate = new Map()
    for (const r of rows) { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(rowToEntry(r)) }
    for (const [d, list] of byDate) console.log(`${d}  ${String(list.length).padStart(2)} entries  ${totalsLine(list)}`)
  },

  async foods(ctx, [q = '']) {
    const rows = await readAll(() => ctx.supa.from('nutrilog_foods').select('*').eq('user_id', ctx.owner).order('name').order('id'))
    const needle = q.toLowerCase()
    const list = rows.map(rowToFood).filter(f => !needle || f.name.toLowerCase().includes(needle))
    list.forEach(f => console.log(fmtFood(f)))
    console.log(`${list.length} food(s)`)
  },

  async 'add-entry'(ctx, [json]) {
    requireEdit(ctx)
    const e = parseJson(json)
    if (!e.name) fail('Missing name')
    const date = e.date || today()
    const row = { ...entryToRow({ time: nowTime(), ...e }, { profileId: ctx.profile, date }), user_id: ctx.owner }
    const { data, error } = await ctx.supa.from('nutrilog_entries').insert(row).select().single()
    if (error) fail(error.message)
    console.log(`Added (${date}): ${fmtEntry(rowToEntry(data))}`)
  },

  async 'edit-entry'(ctx, [id, json]) {
    requireEdit(ctx)
    const before = rowToEntry(await getRow(ctx, 'nutrilog_entries', id))
    const merged = { ...before, ...parseJson(json) }
    const { data, error } = await ctx.supa.from('nutrilog_entries')
      .update(entryToRow(merged, { profileId: ctx.profile, date: merged.date })).eq('id', id).select().single()
    if (error) fail(error.message)
    console.log(`Edited: ${fmtEntry(before)}\n    →  ${fmtEntry(rowToEntry(data))}`)
  },

  async 'delete-entry'(ctx, [id]) {
    requireEdit(ctx)
    const before = rowToEntry(await getRow(ctx, 'nutrilog_entries', id))
    const { error } = await ctx.supa.from('nutrilog_entries').delete().eq('id', id)
    if (error) fail(error.message)
    console.log(`Deleted (${before.date}): ${fmtEntry(before)}`)
  },

  async 'add-food'(ctx, [json]) {
    requireEdit(ctx)
    const f = parseJson(json)
    if (!String(f.name || '').trim()) fail('Missing name')
    const { data, error } = await ctx.supa.from('nutrilog_foods').insert({ ...foodToRow(f), user_id: ctx.owner }).select().single()
    if (error) fail(error.code === '23505' ? `A food named "${f.name}" already exists — use edit-food.` : error.message)
    console.log(`Added food: ${fmtFood(rowToFood(data))}`)
  },

  async 'edit-food'(ctx, [id, json]) {
    requireEdit(ctx)
    const before = rowToFood(await getRow(ctx, 'nutrilog_foods', id))
    const merged = { ...before, ...parseJson(json) }
    const { data, error } = await ctx.supa.from('nutrilog_foods').update(foodToRow(merged)).eq('id', id).select().single()
    if (error) fail(error.code === '23505' ? 'Another food already has that name.' : error.message)
    console.log(`Edited food: ${fmtFood(before)}\n         →  ${fmtFood(rowToFood(data))}`)
  },

  async 'delete-food'(ctx, [id]) {
    requireEdit(ctx)
    const before = rowToFood(await getRow(ctx, 'nutrilog_foods', id))
    const { error } = await ctx.supa.from('nutrilog_foods').delete().eq('id', id)
    if (error) fail(error.message)
    console.log(`Deleted food: ${fmtFood(before)}`)
  },
}

const [cmd, ...args] = process.argv.slice(2)
if (!commands[cmd]) fail('Commands: ' + Object.keys(commands).join(', ') + ' — see the top of this file for usage.')
connect().then(ctx => commands[cmd](ctx, args)).catch(e => fail(e.message || String(e)))
