import { icon } from '../icons.js'
import { todayStr, addDays, escapeHtml, fmtNum, round1 } from '../helpers.js'
import { MACROS, macroOrder, goalFor, dailyTotals } from '../nutrition.js'

const RANGES = [7, 30, 90]
let range = 30

// Averages use completed days only (today is still in progress) and only days
// that have entries — an unlogged day is missing data, not a 0-calorie day.
export function renderTrends(container, { history, todayMeals, settings }) {
  const totals = dailyTotals(history, todayMeals)
  const today = todayStr()
  const dates = Array.from({ length: range }, (_, i) => addDays(today, i - range))
  const logged = dates.filter(d => totals.has(d))
  const avg = key => logged.length ? logged.reduce((s, d) => s + totals.get(d)[key], 0) / logged.length : 0

  const kcalGoal = goalFor(settings, 'kcal')
  const proteinGoal = goalFor(settings, 'protein')
  const fiberGoal = goalFor(settings, 'fiber')
  const proteinFloor = proteinGoal.min ?? proteinGoal.target
  const fiberFloor = fiberGoal.min ?? fiberGoal.target
  const rate = test => logged.length ? Math.round((logged.filter(d => test(totals.get(d))).length / logged.length) * 100) : 0
  const inRange = t => (kcalGoal.min == null || t.kcal >= kcalGoal.min) && (kcalGoal.max == null || t.kcal <= kcalGoal.max)

  container.innerHTML = `
    <header class="top-bar"><h1>Trends</h1></header>
    <div class="segmented" id="rangeToggle">
      ${RANGES.map(r => `<button type="button" data-r="${r}" class="${r === range ? 'active' : ''}">${r} days</button>`).join('')}
    </div>
    ${!logged.length ? `<div class="card"><div class="empty-state">No completed days logged in this period.</div></div>` : `
    <section class="card stat-row">
      <div class="stat"><div class="k">Avg calories</div><div class="v">${fmtNum(avg('kcal'))}</div><div class="s">${kcalGoal.target != null ? `target ${fmtNum(kcalGoal.target)}` : 'per day'}</div></div>
      <div class="stat"><div class="k">Avg protein</div><div class="v">${Math.round(avg('protein'))}<small>g</small></div><div class="s">${proteinGoal.target != null ? `target ${Math.round(proteinGoal.target)}g` : 'per day'}</div></div>
      <div class="stat"><div class="k">Days logged</div><div class="v">${logged.length}<small>/${range}</small></div><div class="s">${Math.round((logged.length / range) * 100)}%</div></div>
    </section>

    <h2>Daily calories</h2>
    <section class="card">${chartHtml(dates, totals, kcalGoal)}</section>

    <h2>Average vs target</h2>
    <section class="card">
      ${['kcal', ...macroOrder(settings)].map(k => avgRowHtml(k, avg(k), goalFor(settings, k))).join('')}
    </section>

    <h2>Consistency</h2>
    <section class="card hit-grid">
      ${hitHtml('target', 'Calories in range', rate(inRange), kcalGoal.min != null || kcalGoal.max != null)}
      ${hitHtml('zap', 'Protein goal hit', rate(t => t.protein >= proteinFloor), proteinFloor != null)}
      ${hitHtml('award', 'Fiber floor met', rate(t => t.fiber >= fiberFloor), fiberFloor != null)}
    </section>

    <h2>Most logged</h2>
    <section class="card list">${topFoodsHtml(history, dates)}</section>
    `}
  `
  container.querySelectorAll('#rangeToggle button').forEach(b => {
    b.onclick = () => { range = Number(b.dataset.r); renderTrends(container, { history, todayMeals, settings }) }
  })
}

function chartHtml(dates, totals, goal) {
  const W = 320, H = 140, pad = 4
  const vals = dates.map(d => totals.get(d)?.kcal || 0)
  const scale = Math.max(goal.max || 0, (goal.target || 0) * 1.15, ...vals, 1)
  const bw = (W - pad * 2) / dates.length
  const y = v => H - (v / scale) * H
  const bars = vals.map((v, i) => {
    if (!v) return ''
    const cls = goal.max != null && v > goal.max ? 'over' : goal.min != null && v < goal.min ? 'under' : 'ok'
    const h = H - y(v)
    return `<rect class="cbar ${cls}" x="${(pad + i * bw + bw * 0.15).toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(3, bw * 0.3).toFixed(1)}"><title>${dates[i]}: ${fmtNum(v)} kcal</title></rect>`
  }).join('')
  const band = goal.min != null && goal.max != null
    ? `<rect class="cband" x="0" y="${y(goal.max).toFixed(1)}" width="${W}" height="${(y(goal.min) - y(goal.max)).toFixed(1)}"/>` : ''
  const target = goal.target != null ? `<line class="ctarget" x1="0" x2="${W}" y1="${y(goal.target).toFixed(1)}" y2="${y(goal.target).toFixed(1)}"/>` : ''
  const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Daily calories">${band}${target}${bars}</svg>
    <div class="chart-axis"><span>${fmt(dates[0])}</span><span>${fmt(dates[dates.length - 1])}</span></div>
    ${goal.min != null && goal.max != null ? `<div class="chart-legend"><i class="lg-band"></i>Target range ${fmtNum(goal.min)}–${fmtNum(goal.max)} kcal</div>` : ''}`
}

function avgRowHtml(key, value, goal) {
  const d = MACROS[key]
  const pct = goal.target ? Math.min(100, (value / goal.target) * 100) : 0
  const over = goal.max != null && value > goal.max
  return `
    <div class="bar-row">
      <div class="bar-row-top"><span class="bar-label"><i style="background:${d.color}"></i>${d.label}</span>
        <span class="bar-nums">${key === 'kcal' ? fmtNum(value) : round1(value) + d.unit}${goal.target != null ? ` / ${key === 'kcal' ? fmtNum(goal.target) : round1(goal.target) + d.unit}` : ''}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${over ? 'var(--red)' : d.color}"></div></div>
    </div>`
}

function hitHtml(ic, label, pct, enabled) {
  return `<div class="hit">
    <div class="hit-ico">${icon(ic, 18)}</div>
    <div class="hit-v">${enabled ? pct + '%' : '—'}</div>
    <div class="hit-k">${label}</div>
  </div>`
}

function topFoodsHtml(history, dates) {
  const inRange = new Set(dates)
  const counts = new Map()
  for (const day of history) {
    if (!inRange.has(day.date)) continue
    for (const m of day.meals || []) {
      if (!m.name) continue
      const c = counts.get(m.name) || { n: 0, kcal: 0 }
      c.n++; c.kcal += Number(m.kcal) || 0
      counts.set(m.name, c)
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8)
  if (!top.length) return '<div class="empty-state">Nothing logged in this period.</div>'
  return top.map(([name, c], i) => `
    <div class="meal-row static">
      <span class="rank">${i + 1}</span>
      <div class="meal-main"><div class="meal-name">${escapeHtml(name)}</div><div class="meal-sub">${fmtNum(c.kcal / c.n)} kcal avg</div></div>
      <div class="meal-right"><div class="meal-kcal">×${c.n}</div></div>
    </div>`).join('')
}
