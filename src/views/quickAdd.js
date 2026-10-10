import { MEAL_CATEGORIES, guessCategory } from '../categories.js'
import { logEntry } from '../mealOps.js'
import { addToFoodLibrary } from '../supabase.js'
import { icon } from '../icons.js'
import { todayStr, nowTime, round1, toast, escapeHtml, fmtNum } from '../helpers.js'

// Optional diet-quality fields (desktop v2.12): carried over from a library
// item when it has them, scaled like the macros. Never shown or asked for here.
const DQ_KEYS = ['sugar', 'addedSugar', 'satFat']
const isNum = v => typeof v === 'number' && isFinite(v)

export function renderQuickAdd(container, { profile, foodLibrary, onSaved }) {
  let mode = 'search' // 'search' | 'custom'
  let query = ''
  let picked = null
  let amount = 1
  let category = guessCategory()
  let time = nowTime()
  const custom = { name: '', kcal: '', protein: '', carbs: '', fat: '', fiber: '' }

  function scaled() {
    const scale = (Number(amount) || 0) / (Number(picked.serving) || 1)
    const s = {
      kcal: round1(picked.kcal * scale),
      protein: round1(picked.protein * scale),
      carbs: round1(picked.carbs * scale),
      fat: round1(picked.fat * scale),
      fiber: round1((picked.fiber || 0) * scale),
    }
    DQ_KEYS.forEach(k => { if (isNum(picked[k])) s[k] = round1(picked[k] * scale) })
    return s
  }

  function draw() {
    container.innerHTML = `
      <header class="top-bar"><h1>Log food</h1></header>
      <div class="segmented" id="modeToggle" role="tablist">
        <button type="button" role="tab" data-mode="search" aria-selected="${mode === 'search'}" class="${mode === 'search' ? 'active' : ''}">${icon('search', 15)} Library</button>
        <button type="button" role="tab" data-mode="custom" aria-selected="${mode === 'custom'}" class="${mode === 'custom' ? 'active' : ''}">${icon('pen', 15)} Custom</button>
      </div>
      <div id="modeBody"></div>
      <label>Meal</label>
      <div class="cat-grid" id="catGrid">
        ${MEAL_CATEGORIES.map(c => `<button type="button" class="cat-chip ${c.id === category ? 'active' : ''}" data-cat="${c.id}">${icon(c.icon, 18)}<span>${c.label}</span></button>`).join('')}
      </div>
      <label for="timeInput">Time</label>
      <input id="timeInput" type="time" value="${time}" />
      <button class="btn save-btn" id="saveBtn" type="button">${icon('check', 18)} Save entry</button>
    `
    container.querySelectorAll('#modeToggle button').forEach(btn => {
      btn.onclick = () => { if (mode !== btn.dataset.mode) { mode = btn.dataset.mode; picked = null; draw() } }
    })
    container.querySelectorAll('#catGrid .cat-chip').forEach(chip => {
      chip.onclick = () => {
        category = chip.dataset.cat
        container.querySelectorAll('#catGrid .cat-chip').forEach(c => c.classList.toggle('active', c === chip))
      }
    })
    container.querySelector('#timeInput').oninput = e => { time = e.target.value }
    container.querySelector('#saveBtn').onclick = save
    drawModeBody()
  }

  function drawModeBody() {
    const body = container.querySelector('#modeBody')
    if (mode === 'search') {
      body.innerHTML = `
        <div class="search-field">${icon('search', 18)}<input id="foodSearch" type="search" placeholder="Search your food library…" value="${escapeHtml(query)}" autocomplete="off" enterkeyhint="search" /></div>
        <div class="search-results card list" id="searchResults" hidden></div>
        <div id="pickedBox"></div>
      `
      const input = body.querySelector('#foodSearch')
      input.oninput = e => { query = e.target.value; picked = null; renderPicked(); updateResults() }
      if (!picked) input.focus()
      updateResults()
      renderPicked()
    } else {
      body.innerHTML = `
        <label for="cName">Food name</label>
        <input id="cName" type="text" placeholder="e.g. Som tam" value="${escapeHtml(custom.name)}" />
        <div class="field-row">
          <div><label for="cKcal">Calories</label><input id="cKcal" type="number" inputmode="decimal" placeholder="kcal" value="${escapeHtml(custom.kcal)}" /></div>
          <div><label for="cProtein">Protein</label><input id="cProtein" type="number" inputmode="decimal" placeholder="g" value="${escapeHtml(custom.protein)}" /></div>
        </div>
        <div class="field-row">
          <div><label for="cCarbs">Carbs</label><input id="cCarbs" type="number" inputmode="decimal" placeholder="g" value="${escapeHtml(custom.carbs)}" /></div>
          <div><label for="cFat">Fat</label><input id="cFat" type="number" inputmode="decimal" placeholder="g" value="${escapeHtml(custom.fat)}" /></div>
        </div>
        <label for="cFiber">Fiber <span class="opt">optional</span></label>
        <input id="cFiber" type="number" inputmode="decimal" placeholder="g" value="${escapeHtml(custom.fiber)}" />
      `
      const bind = (id, key) => { body.querySelector(id).oninput = e => { custom[key] = e.target.value } }
      bind('#cName', 'name'); bind('#cKcal', 'kcal'); bind('#cProtein', 'protein')
      bind('#cCarbs', 'carbs'); bind('#cFat', 'fat'); bind('#cFiber', 'fiber')
      body.querySelector('#cName').focus()
    }
  }

  function updateResults() {
    const box = container.querySelector('#searchResults')
    if (!box) return
    const q = query.trim().toLowerCase()
    const matches = q ? foodLibrary.filter(f => f.name?.toLowerCase().includes(q)).slice(0, 8) : []
    box.hidden = !matches.length
    box.innerHTML = matches.map((f, i) => `
      <button class="result-row" type="button" data-i="${i}">
        <div class="result-main">
          <div class="result-name">${escapeHtml(f.name)}</div>
          <div class="result-meta">per ${escapeHtml(`${f.serving} ${f.unit || ''}`.trim())}</div>
        </div>
        <div class="result-kcal">${fmtNum(f.kcal)}<small> kcal</small></div>
      </button>`).join('')
    box.querySelectorAll('.result-row').forEach(row => {
      row.onclick = () => {
        picked = matches[Number(row.dataset.i)]
        amount = Number(picked.serving) || 1
        query = ''
        drawModeBody()
      }
    })
  }

  // Built once per pick: typing in the amount field must not rebuild that
  // input (recreating a focused input dismisses the phone keyboard).
  function renderPicked() {
    const box = container.querySelector('#pickedBox')
    if (!box) return
    if (!picked) { box.innerHTML = ''; return }
    box.innerHTML = `
      <div class="card picked">
        <div class="picked-head">
          <div class="picked-name">${escapeHtml(picked.name)}</div>
          <button id="unpick" type="button" class="icon-btn" aria-label="Clear selection">${icon('x', 18)}</button>
        </div>
        <label for="amountInput">Amount <span class="opt">${escapeHtml(picked.unit || 'serving')}</span></label>
        <input id="amountInput" type="number" inputmode="decimal" value="${amount}" />
        <div class="mini-macros" id="pickedSummary"></div>
      </div>
    `
    box.querySelector('#unpick').onclick = () => { picked = null; drawModeBody() }
    box.querySelector('#amountInput').oninput = e => { amount = e.target.value; updateSummary() }
    updateSummary()
  }

  function updateSummary() {
    const el = container.querySelector('#pickedSummary')
    if (!el || !picked) return
    const s = scaled()
    el.innerHTML = `
      <div><b>${s.kcal}</b><span>kcal</span></div>
      <div><b>${s.protein}g</b><span>protein</span></div>
      <div><b>${s.carbs}g</b><span>carbs</span></div>
      <div><b>${s.fat}g</b><span>fat</span></div>
    `
  }

  async function save() {
    const date = todayStr()
    let entry
    if (mode === 'search') {
      if (!picked) { toast('Search and pick a food first'); return }
      // Validate the amount, not the kcal — a zero-calorie food is legitimate.
      const amt = Number(amount)
      if (!amt || amt <= 0) { toast('Enter a valid amount'); return }
      const s = scaled()
      const base = { kcal: picked.kcal, protein: picked.protein, carbs: picked.carbs, fat: picked.fat, fiber: picked.fiber || 0, serving: picked.serving }
      DQ_KEYS.forEach(k => { if (isNum(picked[k])) base[k] = picked[k] })
      if (picked.nEst && DQ_KEYS.some(k => isNum(picked[k]))) { s.nEst = true; base.nEst = true }
      entry = { cat: category, date, time, name: picked.name, unit: picked.unit || 'serving', serving: amt, ...s, notes: '', _base: base }
    } else {
      if (!custom.name.trim()) { toast('Enter a food name'); return }
      // Empty means missing; an explicit 0 (black coffee) is a real value.
      if (String(custom.kcal).trim() === '') { toast('Enter calories (0 is fine)'); return }
      const macros = {
        kcal: parseFloat(custom.kcal) || 0,
        protein: parseFloat(custom.protein) || 0,
        carbs: parseFloat(custom.carbs) || 0,
        fat: parseFloat(custom.fat) || 0,
        fiber: parseFloat(custom.fiber) || 0,
      }
      entry = { cat: category, date, time, name: custom.name.trim(), unit: 'serving', serving: 1, ...macros, notes: '', _base: { ...macros, serving: 1 } }
    }

    const btn = container.querySelector('#saveBtn')
    btn.disabled = true
    btn.textContent = 'Saving…'
    try {
      await logEntry(profile.id, date, entry)
      // A custom food goes into the shared library too, so search finds it next time.
      if (mode === 'custom') {
        addToFoodLibrary({ name: entry.name, serving: 1, unit: 'serving', kcal: entry.kcal, protein: entry.protein, fat: entry.fat, carbs: entry.carbs, fiber: entry.fiber })
      }
      toast(`Logged ${entry.name}`)
      onSaved()
    } catch (e) {
      toast(e.message || 'Failed to save')
      btn.disabled = false
      btn.innerHTML = `${icon('check', 18)} Save entry`
    }
  }

  draw()
}
