import { signIn } from '../supabase.js'

export function renderAuth(container, { onSignedIn }) {
  container.innerHTML = `
    <div class="center-screen auth">
      <div class="auth-brand">
        <img src="./favicon.svg" alt="" width="56" height="56" />
        <h1>NutriLog</h1>
        <p>Sign in to sync your log across devices.</p>
      </div>
      <form id="authForm" class="card" novalidate>
        <label for="email">Email</label>
        <input id="email" type="email" autocomplete="username" inputmode="email" required />
        <label for="password">Password</label>
        <input id="password" type="password" autocomplete="current-password" required />
        <div class="field-error" id="authErr" role="alert"></div>
        <button class="btn" id="authBtn" type="submit" style="margin-top:18px">Sign In</button>
      </form>
    </div>
  `
  const form = container.querySelector('#authForm')
  const err = container.querySelector('#authErr')
  const btn = container.querySelector('#authBtn')
  form.onsubmit = async (e) => {
    e.preventDefault()
    const email = form.email.value.trim()
    const password = form.password.value
    if (!email || !password) { err.textContent = 'Enter your email and password.'; return }
    btn.disabled = true
    btn.textContent = 'Signing in…'
    err.textContent = ''
    try {
      await signIn(email, password)
      await onSignedIn()
    } catch (ex) {
      err.textContent = ex.message || 'Sign-in failed'
      btn.disabled = false
      btn.textContent = 'Sign In'
    }
  }
}
