import { signOut } from '../supabase.js'
import { icon } from '../icons.js'
import { confirmDialog, escapeHtml, fmtNum, round1 } from '../helpers.js'
import { VARIANTS, getTheme, getVariant } from '../theme.js'
import { MACROS, macroOrder, goalFor } from '../nutrition.js'

export function renderSettings(container, opts) {
  const { session, profiles, profile, settings, onSwitchProfile, onThemeChange, onSignedOut } = opts
  const theme = getTheme()
  const variant = getVariant()

  container.innerHTML = `
    <header class="top-bar"><h1>Settings</h1></header>

    <section class="card account">
      <div class="account-ico">${icon('user', 20)}</div>
      <div class="account-main">
        <div class="account-name">${escapeHtml(profile.name)}</div>
        <div class="account-email">${escapeHtml(session?.user?.email || '')}</div>
      </div>
    </section>

    ${profiles.length > 1 ? `
    <h2>Profile</h2>
    <div class="card list" id="profileList">
      ${profiles.map(p => `
        <button class="option-row" type="button" data-id="${escapeHtml(p.id)}" aria-pressed="${p.id === profile.id}">
          <span>${escapeHtml(p.name)}</span>
          ${p.id === profile.id ? `<span class="option-check">${icon('check', 18)}</span>` : ''}
        </button>`).join('')}
    </div>` : ''}

    <h2>Appearance</h2>
    <section class="card">
      <div class="segmented" id="themeToggle">
        <button type="button" data-theme="dark" class="${theme === 'dark' ? 'active' : ''}">${icon('moon', 15)} Dark</button>
        <button type="button" data-theme="light" class="${theme === 'light' ? 'active' : ''}">${icon('sun', 15)} Light</button>
      </div>
      <div class="variant-grid" id="variantGrid">
        ${VARIANTS.map(v => `
          <button type="button" class="variant ${v.id === variant ? 'active' : ''}" data-v="${v.id}" aria-pressed="${v.id === variant}">
            <span class="variant-swatch" style="background:${v.swatch}"></span><span>${v.label}</span>
          </button>`).join('')}
      </div>
    </section>

    <h2>Daily targets</h2>
    <section class="card">
      ${['kcal', ...macroOrder(settings)].map(k => targetRowHtml(k, goalFor(settings, k))).join('')}
      <p class="hint">Targets are set in the desktop app's Settings.</p>
    </section>

    <h2>Account</h2>
    <section class="card">
      <button class="btn danger" id="signOutBtn" type="button">${icon('logOut', 18)} Sign out</button>
    </section>

    <div class="version">NutriLog v${__APP_VERSION__}</div>
  `

  container.querySelectorAll('#profileList .option-row').forEach(btn => {
    btn.onclick = () => { if (btn.dataset.id !== profile.id) onSwitchProfile(btn.dataset.id) }
  })
  container.querySelectorAll('#themeToggle button').forEach(btn => {
    btn.onclick = () => onThemeChange({ theme: btn.dataset.theme })
  })
  container.querySelectorAll('#variantGrid .variant').forEach(btn => {
    btn.onclick = () => onThemeChange({ variant: btn.dataset.v })
  })
  container.querySelector('#signOutBtn').onclick = async () => {
    if (!(await confirmDialog('Sign out?', 'Sign out'))) return
    await signOut()
    onSignedOut()
  }
}

function targetRowHtml(key, goal) {
  const d = MACROS[key]
  const f = v => (key === 'kcal' ? fmtNum(v) : round1(v) + d.unit)
  const range = goal.min != null && goal.max != null ? `${f(goal.min)}–${f(goal.max)}`
    : goal.min != null ? `min ${f(goal.min)}` : goal.max != null ? `max ${f(goal.max)}` : ''
  return `
    <div class="target-row">
      <span class="bar-label"><i style="background:${d.color}"></i>${d.label}</span>
      <span class="target-val">${goal.target != null ? f(goal.target) : '—'}${range ? `<small>${range}</small>` : ''}</span>
    </div>`
}
