// Settings → Claude access, shared by the phone and the desktop.
// Claude works through its own helper account (never your login). The database
// enforces what this card switches on (SUPABASE-SETUP.md, 2026-11-25):
//   connected       — read this profile's entries and the food database
//   editing window  — add / edit / delete those until edit_until, then refused
// Every change the helper makes lands in nutrilog_delegate_log (a trigger),
// listed here with Undo. Undo runs as you, so it isn't logged again.
import { supa } from './supabase.js'
import { escapeHtml } from './helpers.js'

const TABLES = ['nutrilog_entries', 'nutrilog_foods']
const NOT_SET_UP = '42P01' // undefined table

/* ── data ── */

async function fetchDelegate() {
  const { data, error } = await supa.from('nutrilog_delegates').select('*').order('created_at').limit(1)
  if (error) throw error
  return data[0] || null
}

async function fetchLog(limit = 30) {
  const { data, error } = await supa.from('nutrilog_delegate_log').select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data
}

async function updateDelegate(delegateId, patch) {
  const { error } = await supa.from('nutrilog_delegates').update(patch).eq('delegate_id', delegateId)
  if (error) throw error
}

async function removeDelegate(delegateId) {
  const { error } = await supa.from('nutrilog_delegates').delete().eq('delegate_id', delegateId)
  if (error) throw error
}

async function addDelegate(email, profileId) {
  const { error } = await supa.rpc('nutrilog_add_delegate', { helper_email: email, profile: profileId })
  if (error) throw error
}

const BOOKKEEPING = ['id', 'user_id', 'created_at', 'updated_at']
const strip = (row, keys) => Object.fromEntries(Object.entries(row || {}).filter(([k]) => !keys.includes(k)))

async function undoEntry(entry) {
  if (!TABLES.includes(entry.tbl)) throw new Error('Unknown table in the log')
  const t = supa.from(entry.tbl)
  if (entry.action === 'insert') {
    const { error } = await t.delete().eq('id', entry.row_id)
    if (error) throw error
  } else if (entry.action === 'update') {
    const { data, error } = await t.update(strip(entry.before, BOOKKEEPING)).eq('id', entry.row_id).select('id')
    if (error) throw error
    if (!data.length) throw new Error('That item has since been deleted')
  } else {
    const { error } = await t.insert(strip(entry.before, ['updated_at']))
    if (error) throw new Error(error.code === '23505' ? 'It already exists again (same id or food name)' : error.message)
  }
  const { error } = await supa.from('nutrilog_delegate_log').update({ undone_at: new Date().toISOString() }).eq('id', entry.id)
  if (error) throw error
}

/* ── view ── */

const isOpen = d => !!d?.edit_until && new Date(d.edit_until) > new Date()

function fmtUntil(iso) {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${time}`
}

function describe(entry) {
  const row = entry.after || entry.before || {}
  const verb = { insert: 'Added', update: 'Edited', delete: 'Deleted' }[entry.action] || entry.action
  const kind = entry.tbl === 'nutrilog_foods' ? 'food' : 'entry'
  const kcal = row.kcal != null ? ` · ${Math.round(row.kcal)} kcal` : ''
  const date = entry.tbl === 'nutrilog_entries' && row.date ? ` <span class="ca-dim">(${escapeHtml(row.date)})</span>` : ''
  let change = ''
  if (entry.action === 'update' && entry.before && entry.after) {
    const keys = ['name', 'serving', 'unit', 'kcal', 'protein', 'fat', 'carbs', 'fiber', 'date', 'time', 'cat']
      .filter(k => JSON.stringify(entry.before[k]) !== JSON.stringify(entry.after[k]))
    if (keys.length) change = ` <span class="ca-dim">— ${keys.map(k => `${k} ${escapeHtml(String(entry.before[k] ?? '–'))}→${escapeHtml(String(entry.after[k] ?? '–'))}`).join(', ')}</span>`
  }
  return `${verb} ${kind} <strong>${escapeHtml(row.name || '')}</strong>${kcal}${date}${change}`
}

const CSS = `
.ca { font-size: 13px; color: var(--text); }
.ca p { margin: 0 0 10px; line-height: 1.45; }
.ca-dim { color: var(--text3); }
.ca-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .5px; color: var(--text3); margin: 14px 0 6px; font-family: var(--fm); }
.ca-strong { font-weight: 600; }
.ca-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
.ca-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.ca input[type=email], .ca input[type=text] { flex: 1; min-width: 180px; box-sizing: border-box; width: 100%; padding: 9px 11px; border-radius: 10px;
  border: 1px solid var(--border); background: var(--bg3); color: var(--text); font: inherit; }
.ca-btn { font: inherit; font-size: 12.5px; font-weight: 600; padding: 8px 13px; border-radius: 10px; cursor: pointer;
  border: 1px solid var(--border); background: var(--bg3); color: var(--text); }
.ca-btn:disabled { opacity: .5; cursor: default; }
.ca-btn.danger { color: var(--red); border-color: var(--red); background: transparent; }
.ca-btn.accent { background: var(--accent); border-color: var(--accent); color: #fff; }
.ca-status { padding: 9px 11px; border-radius: 10px; background: var(--bg3); }
.ca-status.on { border: 1px solid var(--accent); }
.ca ol { margin: 6px 0 10px 18px; padding: 0; line-height: 1.5; }
.ca .mono { font-family: var(--fm); font-size: 12px; }
.ca-log-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--border); }
.ca-log-row:first-child { border-top: 0; }
`

function injectCss() {
  if (document.getElementById('ca-css')) return
  const s = document.createElement('style')
  s.id = 'ca-css'
  s.textContent = CSS
  document.head.appendChild(s)
}

// opts: profileId, profileName, confirm(message, label) → Promise<bool>, toast(msg)
export async function renderClaudeAccess(el, opts) {
  injectCss()
  const { profileId, profileName, confirm, toast } = opts
  el.classList.add('ca')
  el.innerHTML = '<div class="ca-dim">Loading…</div>'
  let d, log
  try {
    ;[d, log] = await Promise.all([fetchDelegate(), fetchLog()])
  } catch (e) {
    el.innerHTML = e?.code === NOT_SET_UP || /does not exist|schema cache/i.test(e?.message || '')
      ? '<div class="ca-dim">Not set up yet — run the "Claude access" SQL (2026-11-25) from SUPABASE-SETUP.md in Supabase first.</div>'
      : `<div class="ca-dim">Couldn't load: ${escapeHtml(e?.message || String(e))}</div>`
    return
  }
  const rerender = () => { if (el.isConnected) renderClaudeAccess(el, opts) }
  const run = async (btn, fn, ok) => {
    if (btn) btn.disabled = true
    try { await fn(); if (ok) toast(ok); rerender() } catch (e) { toast(e?.message || 'Failed'); if (btn) btn.disabled = false }
  }

  if (!d) {
    el.innerHTML = `
      <p>Let Claude log and fix entries and foods through its <strong>own</strong> account — never your login. It can only read until you open an editing window, and every change is listed here with Undo.</p>
      <ol>
        <li>Use the helper account you made for Coin, or make one (sign out → Create one, e.g. <span class="mono">you+claude@gmail.com</span>).</li>
        <li>Enter its email below. Access covers <strong>${escapeHtml(profileName || profileId)}</strong> and the food database.</li>
        <li>On your PC, run <span class="mono">node scripts/save-session.mjs</span> yourself and sign in as the helper.</li>
      </ol>
      <div class="ca-row"><input type="email" id="caEmail" placeholder="helper account email" autocomplete="off" /><button class="ca-btn accent" id="caConnect" type="button">Connect</button></div>`
    el.querySelector('#caConnect').onclick = (e) => {
      const email = el.querySelector('#caEmail').value.trim()
      if (!email.includes('@')) { toast('Enter the helper account email'); return }
      run(e.currentTarget, () => addDelegate(email, profileId), 'Helper connected — it can read now')
    }
    return
  }

  const open = isOpen(d)
  el.innerHTML = `
    <div class="ca-head">
      <div><div class="ca-label" style="margin-top:0">Helper account</div><div class="ca-strong">${escapeHtml(d.delegate_email)}</div>
        <div class="ca-dim">Profile: ${escapeHtml(d.profile_id)} · plus the food database</div></div>
      <button class="ca-btn danger" id="caRemove" type="button">Disconnect</button>
    </div>
    <div class="ca-label">Editing</div>
    ${open
      ? `<div class="ca-status on">On until <strong>${fmtUntil(d.edit_until)}</strong>${d.edit_note ? ` — ${escapeHtml(d.edit_note)}` : ''}</div>
         <div class="ca-row"><button class="ca-btn" id="caStop" type="button">Stop now</button></div>`
      : `<div class="ca-status">Off — Claude can read but not change anything.</div>
         <div class="ca-row"><input type="text" id="caNote" placeholder="What for? e.g. fix the chicken leg entry (optional)" /></div>
         <div class="ca-row">
           <button class="ca-btn" data-window="1h" type="button">1 hour</button>
           <button class="ca-btn" data-window="today" type="button">Rest of today</button>
           <button class="ca-btn" data-window="24h" type="button">24 hours</button>
         </div>`}
    <div class="ca-label">Claude activity</div>
    ${log.length ? `<div>${log.map(x => `
      <div class="ca-log-row">
        <div><div>${describe(x)}</div><div class="ca-dim">${new Date(x.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div>
        ${x.undone_at ? '<span class="ca-dim">Undone</span>' : `<button class="ca-btn ca-undo" data-id="${x.id}" type="button">Undo</button>`}
      </div>`).join('')}</div>` : '<div class="ca-dim">No changes yet.</div>'}`

  el.querySelector('#caRemove').onclick = async (e) => {
    const btn = e.currentTarget
    if (!(await confirm(`Disconnect ${d.delegate_email}? It loses all access immediately. Its activity log stays here.`, 'Disconnect'))) return
    run(btn, () => removeDelegate(d.delegate_id), 'Helper disconnected')
  }
  el.querySelector('#caStop')?.addEventListener('click', (e) =>
    run(e.currentTarget, () => updateDelegate(d.delegate_id, { edit_until: null, edit_note: null }), 'Editing stopped'))
  el.querySelectorAll('[data-window]').forEach(btn => {
    btn.onclick = async () => {
      const now = new Date()
      const until = btn.dataset.window === '1h' ? new Date(now.getTime() + 3600e3)
        : btn.dataset.window === '24h' ? new Date(now.getTime() + 24 * 3600e3)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
      const note = el.querySelector('#caNote')?.value.trim() || null
      if (!(await confirm(`Let Claude add, edit and delete ${d.profile_id}'s entries and foods until ${fmtUntil(until.toISOString())}? Every change is listed here with Undo.`, 'Allow'))) return
      run(btn, () => updateDelegate(d.delegate_id, { edit_until: until.toISOString(), edit_note: note }), 'Editing on')
    }
  })
  el.querySelectorAll('.ca-undo').forEach(btn => {
    btn.onclick = () => run(btn, () => undoEntry(log.find(x => x.id === btn.dataset.id)), 'Undone')
  })
}
