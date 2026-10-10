import { MEAL_ICON } from '../categories.js'
import { icon } from '../icons.js'
import { dateHeaderLabel, escapeHtml, fmtNum, round1, sumMacros } from '../helpers.js'
import { goalFor } from '../nutrition.js'

const PAGE_DAYS = 30
let query = '' // kept across re-renders within the session
let shown = PAGE_DAYS

export function renderHistory(container, { history, settings }) {
  container.innerHTML = `
    <header class="top-bar"><h1>History</h1></header>
    <div class="search-field">${icon('search', 18)}<input id="historySearch" type="search" placeholder="Search past meals…" value="${escapeHtml(query)}" autocomplete="off" /></div>
    <div id="historyList"></div>
  `
  container.querySelector('#historySearch').oninput = e => { query = e.target.value; shown = PAGE_DAYS; updateList() }
  updateList()

  function updateList() {
    const q = query.trim().toLowerCase()
    const days = history
      .map(day => ({ date: day.date, all: day.meals || [], meals: q ? (day.meals || []).filter(m => m.name?.toLowerCase().includes(q)) : (day.meals || []) }))
      .filter(day => day.meals.length > 0)
    const list = container.querySelector('#historyList')
    if (!days.length) {
      list.innerHTML = `<div class="empty-state">${history.length ? 'No meals match your search.' : 'No history yet.'}</div>`
      return
    }
    const goal = goalFor(settings, 'kcal')
    list.innerHTML = days.slice(0, shown).map(day => {
      const t = sumMacros(day.all)
      const state = goal.max != null && t.kcal > goal.max ? 'over' : goal.min != null && t.kcal < goal.min ? 'under' : 'ok'
      return `
        <section class="day">
          <div class="day-head">
            <span class="day-dot ${state}" aria-hidden="true"></span>
            <span class="day-date">${escapeHtml(dateHeaderLabel(day.date))}</span>
            <span class="day-kcal">${fmtNum(t.kcal)} kcal</span>
          </div>
          <div class="day-macros">P ${Math.round(t.protein)}g · C ${Math.round(t.carbs)}g · F ${Math.round(t.fat)}g · Fiber ${Math.round(t.fiber)}g</div>
          <div class="card list">
            ${day.meals.map(m => `
              <div class="meal-row static">
                <span class="meal-ico">${icon(MEAL_ICON[m.cat] || 'snack', 16)}</span>
                <div class="meal-main">
                  <div class="meal-name">${escapeHtml(m.name)}</div>
                  <div class="meal-sub">${escapeHtml(`${round1(m.serving)} ${m.unit || ''}`.trim())} · ${escapeHtml(m.time || '')}</div>
                </div>
                <div class="meal-right"><div class="meal-kcal">${fmtNum(m.kcal)}</div></div>
              </div>`).join('')}
          </div>
        </section>`
    }).join('') + (days.length > shown ? `<button class="btn secondary" id="moreDays" type="button">Show older days</button>` : '')
    list.querySelector('#moreDays')?.addEventListener('click', () => { shown += PAGE_DAYS; updateList() })
  }
}
