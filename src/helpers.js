function pad2(n) { return String(n).padStart(2, '0') }

// Local calendar date (not UTC) — matches the desktop app's todayStr(), so
// entries logged near midnight land on the same day everywhere.
export function todayStr(d = new Date()) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}

export function nowTime(d = new Date()) {
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return todayStr(d)
}

export function dateHeaderLabel(dateStr) {
  const today = todayStr()
  if (dateStr === today) return 'Today'
  if (dateStr === addDays(today, -1)) return 'Yesterday'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function longDateLabel(d = new Date()) {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10
}

export function fmtNum(n) {
  return Math.round(Number(n) || 0).toLocaleString('en-US')
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

let toastTimer = null
export function toast(msg) {
  let el = document.querySelector('.toast')
  if (!el) {
    el = document.createElement('div')
    el.className = 'toast'
    el.setAttribute('role', 'status')
    document.body.appendChild(el)
  }
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200)
}

// In-DOM confirm — window.confirm() doesn't reliably prompt in an installed PWA.
export function confirmDialog(message, confirmLabel = 'Delete', { danger = true } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'confirm-overlay'
    overlay.innerHTML = `
      <div class="confirm-box" role="dialog" aria-modal="true">
        <p>${escapeHtml(message)}</p>
        <div class="confirm-actions">
          <button class="btn secondary" type="button" data-r="0">Cancel</button>
          <button class="btn ${danger ? 'danger' : ''}" type="button" data-r="1">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    const close = (result) => { overlay.remove(); resolve(result) }
    overlay.querySelectorAll('[data-r]').forEach(b => { b.onclick = () => close(b.dataset.r === '1') })
    overlay.onclick = (e) => { if (e.target === overlay) close(false) }
    overlay.querySelector('[data-r="1"]').focus()
  })
}

export function sumMacros(meals) {
  return (meals || []).reduce((t, m) => ({
    kcal: t.kcal + (Number(m.kcal) || 0),
    protein: t.protein + (Number(m.protein) || 0),
    carbs: t.carbs + (Number(m.carbs) || 0),
    fat: t.fat + (Number(m.fat) || 0),
    fiber: t.fiber + (Number(m.fiber) || 0),
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })
}
