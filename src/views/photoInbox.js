// Photo inbox on Today: snap (or pick) food photos now, have Claude estimate
// and log them later. Photos stay 7 days, then the app deletes them.
import { icon } from '../icons.js'
import { escapeHtml, toast, confirmDialog, dateHeaderLabel, todayStr, nowTime, fmtNum } from '../helpers.js'
import { photoTime, compressPhoto, uploadPhoto, updatePhoto, deletePhoto } from '../photos.js'

const SOURCE_LABEL = { exif: 'from photo', file: 'from file date', upload: 'upload time', manual: 'set by you' }
const STATUS_LABEL = { pending: 'Waiting', logged: 'Logged', dismissed: 'Dismissed' }

const pad = n => String(n).padStart(2, '0')
const toLocalInput = d => `${todayStr(d)}T${nowTime(d)}`
const fromLocalInput = s => { const d = new Date(s); return isNaN(d) ? null : d }
const whenLabel = d => `${dateHeaderLabel(todayStr(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`
const daysLeft = p => Math.max(0, Math.ceil((new Date(p.expires_at) - Date.now()) / 86400000))

/* ── Today section ── */

export function photoInboxHtml(photos, { offline }) {
  const waiting = photos.filter(p => p.status === 'pending').length
  return `
    <div class="section-row">
      <h2>Photo inbox${waiting ? ` <span class="count-pill">${waiting}</span>` : ''}</h2>
      <button class="btn pill-btn" id="photoAdd" type="button" ${offline ? 'disabled' : ''}>${icon('camera', 16)} Photo</button>
    </div>
    ${photos.length ? `
      <div class="chip-scroll photo-strip" id="photoStrip">
        ${photos.map((p, i) => `
          <button class="photo-tile ${p.status}" type="button" data-i="${i}">
            ${p.url ? `<img src="${escapeHtml(p.url)}" alt="" loading="lazy" />` : `<span class="photo-missing">${icon('camera', 22)}</span>`}
            <span class="photo-tile-meta">
              <span class="photo-tile-time">${escapeHtml(whenLabel(new Date(p.taken_at)))}</span>
              <span class="photo-status ${p.status}">${STATUS_LABEL[p.status] || p.status}</span>
            </span>
          </button>`).join('')}
      </div>`
    : `<p class="hint photo-hint">Snap a meal now; Claude can estimate and log it later. Photos are kept for 7 days.</p>`}`
}

export function bindPhotoInbox(container, { profile, photos, entriesById, onChanged }) {
  container.querySelector('#photoAdd')?.addEventListener('click', () => pickPhotos(profile, onChanged))
  container.querySelectorAll('#photoStrip .photo-tile').forEach(tile => {
    tile.onclick = () => openPhotoSheet(photos[Number(tile.dataset.i)], { entriesById, onChanged })
  })
}

/* ── picking + uploading ── */

function pickPhotos(profile, onChanged) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  input.style.display = 'none'
  document.body.appendChild(input)
  input.onchange = () => {
    const files = [...(input.files || [])]
    input.remove()
    if (files.length) openUploadSheet(files, profile, onChanged)
  }
  // iOS asks: Take Photo / Photo Library / Choose File
  input.click()
}

async function openUploadSheet(files, profile, onChanged) {
  const items = await Promise.all(files.map(async file => ({
    file, ...(await photoTime(file)), note: '', preview: URL.createObjectURL(file),
  })))

  const overlay = document.createElement('div')
  overlay.className = 'sheet-overlay'
  overlay.innerHTML = `
    <div class="sheet-box" role="dialog" aria-modal="true" aria-label="Add photos">
      <h2>${items.length === 1 ? 'Add photo' : `Add ${items.length} photos`}</h2>
      <p class="hint">Saved for 7 days for Claude to log. Check the time — it's when the entry will be logged.</p>
      ${items.map((it, i) => `
        <div class="photo-up" data-i="${i}">
          <img src="${it.preview}" alt="" />
          <div class="photo-up-fields">
            <label for="pTime${i}">Taken <span class="opt" id="pSrc${i}">${SOURCE_LABEL[it.source]}</span></label>
            <input id="pTime${i}" type="datetime-local" value="${toLocalInput(it.takenAt)}" />
            <label for="pNote${i}">Note <span class="opt">optional</span></label>
            <input id="pNote${i}" type="text" placeholder="e.g. ate half" />
          </div>
        </div>`).join('')}
      <div class="sheet-actions">
        <button class="btn secondary" id="pCancel" type="button">Cancel</button>
        <button class="btn" id="pSave" type="button">${icon('check', 18)} Save</button>
      </div>
    </div>`
  document.body.appendChild(overlay)

  items.forEach((it, i) => {
    overlay.querySelector(`#pTime${i}`).oninput = e => {
      const d = fromLocalInput(e.target.value)
      if (d) { it.takenAt = d; it.source = 'manual'; overlay.querySelector(`#pSrc${i}`).textContent = SOURCE_LABEL.manual }
    }
    overlay.querySelector(`#pNote${i}`).oninput = e => { it.note = e.target.value }
  })

  let busy = false
  const close = () => { items.forEach(it => URL.revokeObjectURL(it.preview)); overlay.remove() }
  overlay.querySelector('#pCancel').onclick = () => { if (!busy) close() }
  overlay.onclick = e => { if (e.target === overlay && !busy) close() }

  overlay.querySelector('#pSave').onclick = async () => {
    const btn = overlay.querySelector('#pSave')
    busy = true
    btn.disabled = true
    let done = 0
    const failed = []
    for (const it of items) {
      btn.textContent = items.length > 1 ? `Uploading ${done + 1}/${items.length}…` : 'Uploading…'
      try {
        const blob = await compressPhoto(it.file)
        await uploadPhoto(profile.id, { blob, takenAt: it.takenAt, source: it.source, note: it.note })
        done++
      } catch (e) {
        console.warn('Photo upload failed:', e)
        failed.push(e)
      }
    }
    busy = false
    if (failed.length && !done) {
      toast(setupHint(failed[0]))
      btn.disabled = false
      btn.innerHTML = `${icon('check', 18)} Save`
      return
    }
    close()
    toast(failed.length ? `Saved ${done}, ${failed.length} failed` : done === 1 ? 'Photo saved' : `${done} photos saved`)
    onChanged()
  }
}

function setupHint(e) {
  const msg = String(e?.message || e || '')
  if (/bucket not found|nutrilog_photos|does not exist|schema cache/i.test(msg)) return 'Photo inbox isn\'t set up yet — run the 2026-11-28 SQL'
  return msg || 'Upload failed'
}

/* ── one photo ── */

function openPhotoSheet(photo, { entriesById, onChanged }) {
  const taken = new Date(photo.taken_at)
  const linked = (photo.entry_ids || []).map(id => entriesById.get(id)).filter(Boolean)
  const missing = (photo.entry_ids || []).length - linked.length
  const left = daysLeft(photo)

  const overlay = document.createElement('div')
  overlay.className = 'sheet-overlay'
  overlay.innerHTML = `
    <div class="sheet-box" role="dialog" aria-modal="true" aria-label="Photo">
      ${photo.url ? `<img class="photo-full" src="${escapeHtml(photo.url)}" alt="Food photo" />` : ''}
      <div class="photo-head">
        <span class="photo-status ${photo.status}">${STATUS_LABEL[photo.status] || photo.status}</span>
        <span class="hint">${left <= 1 ? 'Deleted within a day' : `Kept ${left} more days`}</span>
      </div>
      ${linked.length || missing ? `
        <label>Logged as</label>
        <div class="card list">
          ${linked.map(e => `
            <div class="meal-row static">
              <div class="meal-main"><div class="meal-name">${escapeHtml(e.name)}</div><div class="meal-sub">${escapeHtml(e.date)} · ${escapeHtml(e.time || '')}</div></div>
              <div class="meal-right"><div class="meal-kcal">${fmtNum(e.kcal)}</div></div>
            </div>`).join('')}
          ${missing ? `<div class="meal-row static"><div class="meal-sub">${missing} entr${missing === 1 ? 'y' : 'ies'} since deleted</div></div>` : ''}
        </div>` : ''}
      <label for="phTime">Taken <span class="opt">${SOURCE_LABEL[photo.time_source] || ''}</span></label>
      <input id="phTime" type="datetime-local" value="${toLocalInput(taken)}" />
      <label for="phNote">Note <span class="opt">optional</span></label>
      <input id="phNote" type="text" value="${escapeHtml(photo.note || '')}" placeholder="e.g. ate half" />
      <div class="sheet-actions">
        <button class="btn secondary" id="phDelete" type="button">${icon('trash', 16)} Delete</button>
        ${photo.status === 'dismissed'
          ? `<button class="btn secondary" id="phRestore" type="button">Restore</button>`
          : photo.status === 'pending' ? `<button class="btn secondary" id="phDismiss" type="button">${icon('x', 16)} Dismiss</button>` : ''}
        <button class="btn" id="phSave" type="button">${icon('check', 18)} Save</button>
      </div>
      ${photo.status === 'pending' ? '<p class="hint">Dismiss hides it from Claude (e.g. you logged it yourself).</p>' : ''}
    </div>`
  document.body.appendChild(overlay)

  const close = () => overlay.remove()
  overlay.onclick = e => { if (e.target === overlay) close() }
  const run = async (fn, okMsg) => {
    try { await fn(); close(); toast(okMsg); onChanged() } catch (e) { toast(e.message || 'Failed') }
  }

  overlay.querySelector('#phSave').onclick = () => {
    const d = fromLocalInput(overlay.querySelector('#phTime').value)
    const note = overlay.querySelector('#phNote').value.trim() || null
    const patch = {}
    if (d && Math.abs(d - taken) >= 60000) { patch.taken_at = d.toISOString(); patch.time_source = 'manual' }
    if (note !== (photo.note || null)) patch.note = note
    if (!Object.keys(patch).length) { close(); return }
    run(() => updatePhoto(photo.id, patch), 'Saved')
  }
  overlay.querySelector('#phDismiss')?.addEventListener('click', () => run(() => updatePhoto(photo.id, { status: 'dismissed' }), 'Dismissed'))
  overlay.querySelector('#phRestore')?.addEventListener('click', () => run(() => updatePhoto(photo.id, { status: 'pending' }), 'Back in the inbox'))
  overlay.querySelector('#phDelete').onclick = async () => {
    if (!(await confirmDialog('Delete this photo? Entries logged from it stay.'))) return
    run(() => deletePhoto(photo), 'Photo deleted')
  }
}
