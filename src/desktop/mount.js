// Desktop layout: the v2.12 desktop UI (markup, stylesheet and script copied
// into this folder), started on top of the cloud store instead of local files.
// Its script is a classic (non-module) script on purpose — its ~300 inline
// onclick="…" handlers call top-level functions, which must stay global.
import Chart from 'chart.js/auto'
import desktopCss from './styles.css?inline'
import shellHtml from './shell.html?raw'
import legacyAppUrl from './legacy-app.js?url'
import { NutriCloud } from './cloudStore.js'
import { escapeHtml } from '../helpers.js'

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = resolve
    s.onerror = () => reject(new Error('Could not load the desktop app script'))
    document.body.appendChild(s)
  })
}

function bootScreen(html) {
  document.body.innerHTML = `<div class="desk-boot">${html}</div>`
}

export async function mountDesktop() {
  window.Chart = Chart
  window.NutriCloud = NutriCloud
  const style = document.createElement('style')
  style.textContent = desktopCss + `
    .desk-boot { position:fixed; inset:0; display:flex; flex-direction:column; gap:14px; align-items:center; justify-content:center;
      background:var(--bg); color:var(--text2); font-family:var(--fb); font-size:14px; text-align:center; padding:24px; }
    .desk-boot button { font:inherit; font-weight:600; padding:9px 18px; border-radius:10px; border:1px solid var(--border); background:var(--bg3); color:var(--text); cursor:pointer; }`
  document.head.appendChild(style)
  bootScreen('Loading your log…')

  try {
    await NutriCloud.init()
  } catch (e) {
    bootScreen(`<div>Couldn't load your data from the cloud.</div><div style="color:var(--text3)">${escapeHtml(e.message || String(e))}</div><button type="button" id="deskRetry">Try again</button>`)
    document.getElementById('deskRetry').onclick = () => location.reload()
    return
  }

  document.body.innerHTML = shellHtml
  // Signing in happens before this layout loads; the old in-page sign-in and
  // first-run screens are never needed.
  for (const id of ['authScreen', 'firstRunScreen']) {
    const el = document.getElementById(id)
    if (el) el.style.display = 'none'
  }
  await loadScript(legacyAppUrl)
}
