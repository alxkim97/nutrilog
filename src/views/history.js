import { MEAL_ICON } from '../categories.js'
import { icon } from '../icons.js'
import { dateHeaderLabel, escapeHtml, fmtNum, round1, sumMacros } from '../helpers.js'
import { goalFor } from '../nutrition.js'

let query = '' // kept across re-renders within the session
let monthKey = null // 'YYYY-MM' of the page on screen; re-picked (newest with data) whenever it's no longer valid

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export function renderHistory(container, { history, settings }) {
  container.innerHTML = `
    <header class="top-bar"><h1>History</h1></header>
    <div class="search-field">${icon('search', 18)}<input id="historySearch" type="search" placeholder="Search past meals…" value="${escapeHtml(query)}" autocomplete="off" /></div>
    <div id="historyList"></div>
  `
  container.querySelector('#historySearch').oninput = e => { query = e.target.value; updateList() }
  updateList()

  function updateList() {
    const q = query.trim().toLowerCase()
    const days = history
      .map(day => ({ date: day.date, meals: day.meals || [] }))
      .filter(day => day.meals.length > 0)
    const list = container.querySelector('#historyList')

    if (!days.length) {
      list.innerHTML = `<div class="empty-state">No history yet.</div>`
      return
    }

    // A search query looks across the whole history at once — paging by
    // month would make an older match easy to miss.
    if (q) {
      const matches = days
        .map(day => ({ date: day.date, meals: day.meals.filter(m => m.name?.toLowerCase().includes(q)) }))
        .filter(day => day.meals.length > 0)
      list.innerHTML = matches.length
        ? matches.map(day => dayCardHtml(day, settings)).join('')
        : `<div class="empty-state">No meals match your search.</div>`
      return
    }

    // Browse mode: one calendar month per page, newest first, skipping
    // months with nothing logged so Prev/Next never lands on an empty page.
    const months = [...new Set(days.map(d => d.date.slice(0, 7)))].sort().reverse()
    if (!monthKey || !months.includes(monthKey)) monthKey = months[0]
    const idx = months.indexOf(monthKey)
    const pageDays = days.filter(d => d.date.slice(0, 7) === monthKey)

    list.innerHTML = `
      <div class="month-nav">
        <button class="icon-btn" id="olderMonth" type="button" ${idx >= months.length - 1 ? 'disabled' : ''} aria-label="Older month">${icon('chevronRight', 18)}</button>
        <div class="month-label">${escapeHtml(monthLabel(monthKey))}</div>
        <button class="icon-btn" id="newerMonth" type="button" ${idx <= 0 ? 'disabled' : ''} aria-label="Newer month">${icon('chevronRight', 18)}</button>
      </div>
      ${pageDays.map(day => dayCardHtml(day, settings)).join('')}
    `
    const olderIco = list.querySelector('#olderMonth .ico')
    if (olderIco) olderIco.style.transform = 'rotate(180deg)' // same chevron, pointed the other way
    list.querySelector('#olderMonth').onclick = () => { if (idx < months.length - 1) { monthKey = months[idx + 1]; updateList() } }
    list.querySelector('#newerMonth').onclick = () => { if (idx > 0) { monthKey = months[idx - 1]; updateList() } }
  }
}

function dayCardHtml({ date, meals }, settings) {
  const t = sumMacros(meals)
  const goal = goalFor(settings, 'kcal')
  const state = goal.max != null && t.kcal > goal.max ? 'over' : goal.min != null && t.kcal < goal.min ? 'under' : 'ok'
  return `
    <section class="day">
      <div class="day-head">
        <span class="day-dot ${state}" aria-hidden="true"></span>
        <span class="day-date">${escapeHtml(dateHeaderLabel(date))}</span>
        <span class="day-kcal">${fmtNum(t.kcal)} kcal</span>
      </div>
      <div class="day-macros">P ${Math.round(t.protein)}g · C ${Math.round(t.carbs)}g · F ${Math.round(t.fat)}g · Fiber ${Math.round(t.fiber)}g</div>
      <div class="card list">
        ${meals.map(m => `
          <div class="meal-row static cat-${MEAL_ICON[m.cat] ? m.cat : 'snack'}">
            <span class="meal-ico">${icon(MEAL_ICON[m.cat] || 'snack', 15)}</span>
            <div class="meal-main">
              <div class="meal-name">${escapeHtml(m.name)}</div>
              <div class="meal-sub">${escapeHtml(`${round1(m.serving)} ${m.unit || ''}`.trim())} · ${escapeHtml(m.time || '')}</div>
            </div>
            <div class="meal-right"><div class="meal-kcal">${fmtNum(m.kcal)}</div></div>
          </div>`).join('')}
      </div>
    </section>`
}
