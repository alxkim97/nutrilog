import { MEAL_CATEGORIES, guessCategory } from '../categories.js'
import { logEntry, deleteEntry } from '../mealOps.js'
import { icon } from '../icons.js'
import { todayStr, nowTime, addDays, longDateLabel, confirmDialog, toast, escapeHtml, fmtNum, round1, sumMacros } from '../helpers.js'
import { MACROS, macroOrder, goalFor, macroStatus, ringSvg, dailyTotals, streak, frequentFoods } from '../nutrition.js'

export function renderToday(container, opts) {
  const { profile, profiles, settings, todayMeals, history, offline, onChanged, onAdd, onOpenSettings } = opts
  const totals = sumMacros(todayMeals)
  const frequent = frequentFoods(history)
  const byDate = dailyTotals(history, todayMeals)

  container.innerHTML = `
    <header class="top-bar">
      <div>
        <div class="eyebrow">${escapeHtml(longDateLabel())}</div>
        <h1>Today</h1>
      </div>
      ${profiles.length > 1 ? `<button class="profile-chip" id="profileChip" type="button">${icon('user', 14)}<span>${escapeHtml(profile.name)}</span></button>` : ''}
    </header>
    ${offline ? `<div class="offline-banner">${icon('cloudOff', 16)}<span>Offline — showing your last synced data</span></div>` : ''}
    ${heroHtml(totals, settings, todayMeals.length)}
    <div class="macro-grid">${macroOrder(settings).map(k => macroTileHtml(k, totals[k], settings)).join('')}</div>
    ${frequent.length ? `
      <h2>Quick log</h2>
      <div class="chip-scroll" id="quickChips">
        ${frequent.map((f, i) => `
          <button class="food-chip" type="button" data-i="${i}">
            <span class="food-chip-name">${escapeHtml(f.name)}</span>
            <span class="food-chip-kcal">${fmtNum(f.latest.kcal)} kcal</span>
          </button>`).join('')}
      </div>` : ''}
    <h2>This week</h2>
    ${weekHtml(byDate, settings)}
    <h2>Logged today</h2>
    ${mealsHtml(todayMeals)}
  `

  container.querySelector('#profileChip')?.addEventListener('click', onOpenSettings)
  container.querySelector('#emptyAdd')?.addEventListener('click', onAdd)

  container.querySelectorAll('#quickChips .food-chip').forEach(chip => {
    chip.onclick = async () => {
      if (chip.disabled) return
      chip.disabled = true
      const base = frequent[Number(chip.dataset.i)].latest
      const date = todayStr()
      const entry = { ...base, date, time: nowTime(), cat: guessCategory() }
      try {
        await logEntry(profile.id, date, entry)
        toast(`Logged ${entry.name}`)
        onChanged()
      } catch (e) {
        toast(e.message || 'Failed to log')
        chip.disabled = false
      }
    }
  })

  container.querySelectorAll('.meal-row').forEach(row => {
    row.onclick = async () => {
      const meal = todayMeals[Number(row.dataset.i)]
      if (!(await confirmDialog(`Delete "${meal.name}"?`))) return
      try {
        await deleteEntry(profile.id, todayStr(), meal)
        toast('Deleted')
        onChanged()
      } catch (e) {
        toast(e.message || 'Failed to delete')
      }
    }
  })
}

function heroHtml(totals, settings, count) {
  const goal = goalFor(settings, 'kcal')
  const target = goal.target
  const st = macroStatus(totals.kcal, goal, ' kcal')
  const pct = target ? totals.kcal / target : 0
  const remaining = target != null ? Math.round(target - totals.kcal) : null
  const range = goal.min != null && goal.max != null ? `${fmtNum(goal.min)}–${fmtNum(goal.max)}` : '—'
  return `
    <section class="card hero" aria-label="Calories today">
      <div class="hero-ring">
        ${ringSvg(pct, { size: 132, stroke: 12, color: 'var(--mk)', over: st.state === 'over' })}
        <div class="hero-ring-label">
          <div class="hero-kcal">${fmtNum(totals.kcal)}</div>
          <div class="hero-of">${target != null ? `of ${fmtNum(target)} kcal` : 'kcal'}</div>
        </div>
      </div>
      <div class="hero-side">
        <div class="hero-stat">
          <div class="k">${remaining != null && remaining < 0 ? 'Over target' : 'Remaining'}</div>
          <div class="v ${st.state}">${remaining != null ? fmtNum(Math.abs(remaining)) : '—'}</div>
        </div>
        <div class="hero-stat"><div class="k">Target range</div><div class="v sm">${range}</div></div>
        <div class="hero-stat"><div class="k">Entries</div><div class="v sm">${count}</div></div>
      </div>
    </section>`
}

function macroTileHtml(key, consumed, settings) {
  const d = MACROS[key]
  const goal = goalFor(settings, key)
  const st = macroStatus(consumed, goal, d.unit)
  const pct = goal.target ? consumed / goal.target : 0
  return `
    <div class="macro-tile">
      <div class="macro-ring">
        ${ringSvg(pct, { size: 46, stroke: 5, color: d.color, over: st.state === 'over' })}
        <span>${goal.target ? Math.min(999, Math.round(pct * 100)) + '%' : ''}</span>
      </div>
      <div class="macro-info">
        <div class="macro-label"><i style="background:${d.color}"></i>${d.label}</div>
        <div class="macro-val">${round1(consumed)}<small>${goal.target != null ? ` / ${round1(goal.target)}${d.unit}` : d.unit}</small></div>
        <div class="macro-status ${st.state}">${escapeHtml(st.text)}</div>
      </div>
    </div>`
}

function weekHtml(byDate, settings) {
  const today = todayStr()
  const goal = goalFor(settings, 'kcal')
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const vals = days.map(d => byDate.get(d)?.kcal || 0)
  const scale = Math.max(goal.max || 0, (goal.target || 0) * 1.15, ...vals, 1)
  const proteinGoal = goalFor(settings, 'protein')
  const proteinFloor = proteinGoal.min ?? proteinGoal.target
  const logStreak = streak(byDate, t => t.kcal > 0)
  const proteinStreak = proteinFloor ? streak(byDate, t => t.protein >= proteinFloor) : 0
  const bars = days.map((d, i) => {
    const v = vals[i]
    let cls = 'empty'
    if (v > 0) cls = d === today ? 'today' : (goal.max != null && v > goal.max) ? 'over' : (goal.min != null && v < goal.min) ? 'under' : 'ok'
    return `<div class="wbar" title="${d}: ${fmtNum(v)} kcal"><div class="wbar-fill ${cls}" style="height:${(v / scale) * 100}%"></div></div>`
  }).join('')
  const labels = days.map(d => `<span class="${d === today ? 'is-today' : ''}">${new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'narrow' })}</span>`).join('')
  return `
    <section class="card week">
      <div class="week-plot">
        ${goal.target ? `<div class="week-target" style="bottom:${(goal.target / scale) * 100}%"><span>${fmtNum(goal.target)}</span></div>` : ''}
        ${bars}
      </div>
      <div class="week-days">${labels}</div>
      <div class="streak-row">
        <div class="streak-item">
          <div class="streak-icon${logStreak ? '' : ' idle'}">${icon('flame', 22)}</div>
          <div><div class="streak-value">${logStreak}</div><div class="streak-label">day${logStreak === 1 ? '' : 's'} logged in a row</div></div>
        </div>
        ${proteinFloor ? `
        <div class="streak-item">
          <div class="streak-icon${proteinStreak ? '' : ' idle'}">${icon('target', 22)}</div>
          <div><div class="streak-value">${proteinStreak}</div><div class="streak-label">day${proteinStreak === 1 ? '' : 's'} hitting protein</div></div>
        </div>` : ''}
      </div>
    </section>`
}

function mealsHtml(meals) {
  if (!meals.length) {
    return `<div class="card empty-card">
      <div class="empty-state">Nothing logged yet today.</div>
      <button class="btn" id="emptyAdd" type="button">${icon('plus', 18)} Log food</button>
    </div>`
  }
  return MEAL_CATEGORIES.map(c => {
    const rows = meals.map((m, i) => ({ m, i })).filter(({ m }) => (m.cat || 'snack') === c.id)
    if (!rows.length) return ''
    const kcal = rows.reduce((s, { m }) => s + (Number(m.kcal) || 0), 0)
    return `
      <div class="meal-group">
        <div class="meal-group-head"><span class="meal-group-ico">${icon(c.icon, 15)}</span>${c.label}<span class="meal-group-kcal">${fmtNum(kcal)} kcal</span></div>
        <div class="card list">
          ${rows.map(({ m, i }) => `
            <button class="meal-row" type="button" data-i="${i}" aria-label="${escapeHtml(m.name)} — tap to delete">
              <div class="meal-main">
                <div class="meal-name">${escapeHtml(m.name)}</div>
                <div class="meal-sub">${escapeHtml(`${round1(m.serving)} ${m.unit || ''}`.trim())} · ${escapeHtml(m.time || '')}</div>
              </div>
              <div class="meal-right">
                <div class="meal-kcal">${fmtNum(m.kcal)}</div>
                <div class="meal-macros">P${Math.round(m.protein || 0)} · C${Math.round(m.carbs || 0)} · F${Math.round(m.fat || 0)}</div>
              </div>
            </button>`).join('')}
        </div>
      </div>`
  }).join('')
}
