import { MEAL_CATEGORIES } from '../categories.js'
import { icon } from '../icons.js'
import { escapeHtml, toast } from '../helpers.js'

// A bottom sheet for editing one already-logged entry — opened from a
// swiped row's Edit button. Mirrors Quick Add's custom-entry fields
// (same classes, so it reads as the same form) but pre-filled, single-
// purpose, and edits in place instead of appending a new entry.
export function openEditSheet(entry, { onSave }) {
  let category = entry.cat || 'snack'
  let time = entry.time || ''
  const fields = {
    name: entry.name || '',
    kcal: entry.kcal ?? '',
    protein: entry.protein ?? '',
    carbs: entry.carbs ?? '',
    fat: entry.fat ?? '',
    fiber: entry.fiber ?? '',
  }

  const overlay = document.createElement('div')
  overlay.className = 'sheet-overlay'
  overlay.innerHTML = `
    <div class="sheet-box" role="dialog" aria-modal="true" aria-label="Edit entry">
      <h2>Edit entry</h2>
      <label for="eName">Food name</label>
      <input id="eName" type="text" value="${escapeHtml(fields.name)}" />
      <div class="field-row">
        <div><label for="eKcal">Calories</label><input id="eKcal" type="number" inputmode="decimal" value="${escapeHtml(String(fields.kcal))}" /></div>
        <div><label for="eProtein">Protein</label><input id="eProtein" type="number" inputmode="decimal" value="${escapeHtml(String(fields.protein))}" /></div>
      </div>
      <div class="field-row">
        <div><label for="eCarbs">Carbs</label><input id="eCarbs" type="number" inputmode="decimal" value="${escapeHtml(String(fields.carbs))}" /></div>
        <div><label for="eFat">Fat</label><input id="eFat" type="number" inputmode="decimal" value="${escapeHtml(String(fields.fat))}" /></div>
      </div>
      <label for="eFiber">Fiber <span class="opt">optional</span></label>
      <input id="eFiber" type="number" inputmode="decimal" value="${escapeHtml(String(fields.fiber))}" />
      <label>Meal</label>
      <div class="cat-grid" id="eCatGrid">
        ${MEAL_CATEGORIES.map(c => `<button type="button" class="cat-chip cat-${c.id} ${c.id === category ? 'active' : ''}" data-cat="${c.id}">${icon(c.icon, 18)}<span>${c.label}</span></button>`).join('')}
      </div>
      <label for="eTime">Time</label>
      <input id="eTime" type="time" value="${escapeHtml(time)}" />
      <div class="sheet-actions">
        <button class="btn secondary" id="eCancel" type="button">Cancel</button>
        <button class="btn" id="eSave" type="button">${icon('check', 18)} Save changes</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  const bind = (id, key) => { overlay.querySelector(id).oninput = e => { fields[key] = e.target.value } }
  bind('#eName', 'name'); bind('#eKcal', 'kcal'); bind('#eProtein', 'protein')
  bind('#eCarbs', 'carbs'); bind('#eFat', 'fat'); bind('#eFiber', 'fiber')
  overlay.querySelector('#eTime').oninput = e => { time = e.target.value }
  overlay.querySelectorAll('#eCatGrid .cat-chip').forEach(chip => {
    chip.onclick = () => {
      category = chip.dataset.cat
      overlay.querySelectorAll('#eCatGrid .cat-chip').forEach(c => c.classList.toggle('active', c === chip))
    }
  })

  const close = () => overlay.remove()
  overlay.querySelector('#eCancel').onclick = close
  overlay.onclick = (e) => { if (e.target === overlay) close() }

  overlay.querySelector('#eSave').onclick = async () => {
    const name = fields.name.trim()
    if (!name) { toast('Enter a food name'); overlay.querySelector('#eName').focus(); return }
    if (String(fields.kcal).trim() === '') { toast('Enter calories (0 is fine)'); return }
    const updated = {
      ...entry,
      cat: category,
      time: time || entry.time,
      name,
      kcal: parseFloat(fields.kcal) || 0,
      protein: parseFloat(fields.protein) || 0,
      carbs: parseFloat(fields.carbs) || 0,
      fat: parseFloat(fields.fat) || 0,
      fiber: parseFloat(fields.fiber) || 0,
    }
    const btn = overlay.querySelector('#eSave')
    btn.disabled = true
    btn.textContent = 'Saving…'
    try {
      await onSave(updated)
      close()
    } catch (e) {
      toast(e.message || 'Failed to save')
      btn.disabled = false
      btn.innerHTML = `${icon('check', 18)} Save changes`
    }
  }

  overlay.querySelector('#eName').focus()
}
