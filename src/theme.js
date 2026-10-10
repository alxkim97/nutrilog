// The desktop app's theme system: dark/light plus a UI variant, applied as
// body.light + body[data-variant]. Same localStorage keys as the desktop UI so
// both layouts agree on one device; the profile's saved choice (settings.theme
// / settings.variant) wins on load, like the desktop app's loadSettings().
const THEME_KEY = 'nutrilog_theme'
const VARIANT_KEY = 'nutrilog_variant'

export const VARIANTS = [
  { id: 'default', label: 'Aura', swatch: '#8b82ff' },
  { id: 'onyx', label: 'Onyx', swatch: '#0a84ff' },
  { id: 'linear', label: 'Linear', swatch: '#5c6aff' },
  { id: 'amber', label: 'Amber', swatch: '#f0a030' },
  { id: 'rose', label: 'Rose', swatch: '#e879a8' },
  { id: 'nord', label: 'Nord', swatch: '#88c0d0' },
  { id: 'forest', label: 'Forest', swatch: '#4ade80' },
  { id: 'teal', label: 'Teal', swatch: '#2dd4bf' },
]

function read(key, fallback) {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}
function write(key, value) {
  try { localStorage.setItem(key, value) } catch { /* private mode — applies for this session only */ }
}

export function getTheme() { return read(THEME_KEY, 'dark') === 'light' ? 'light' : 'dark' }
export function getVariant() {
  const v = read(VARIANT_KEY, 'default')
  return VARIANTS.some(x => x.id === v) ? v : 'default'
}

export function applyTheme() {
  const body = document.body
  body.classList.toggle('light', getTheme() === 'light')
  const v = getVariant()
  if (v === 'default') delete body.dataset.variant
  else body.dataset.variant = v
  // <html> can't see body's light/variant tokens, so mirror the page colour onto
  // it (overscroll area) and the browser chrome.
  const bg = getComputedStyle(body).getPropertyValue('--bg').trim() || '#0d0b1a'
  document.documentElement.style.background = bg
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = bg
}

export function setTheme(theme) { write(THEME_KEY, theme === 'light' ? 'light' : 'dark'); applyTheme() }
export function setVariant(variant) { write(VARIANT_KEY, variant || 'default'); applyTheme() }

export function applyThemeFromSettings(settings) {
  if (!settings) return
  if (settings.theme === 'light' || settings.theme === 'dark') write(THEME_KEY, settings.theme)
  if (settings.variant && VARIANTS.some(x => x.id === settings.variant)) write(VARIANT_KEY, settings.variant)
  applyTheme()
}
