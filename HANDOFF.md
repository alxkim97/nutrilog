# NutriLog — Session Handoff

**Last updated:** 2026-05-17 (Condo PC)
**Current version:** v2.3.3
**Branch:** main
**Supabase project:** lifelog (renamed from nutrilog)

---

## App overview

NutriLog is a personal macro nutrition tracker — Electron 31 desktop app, vanilla HTML/CSS/JS, no framework. Data stored locally as JSON + optional Supabase cloud sync.

**Key files:**
- `src/app.js` — 4,300+ line renderer (all UI + logic)
- `src/styles.css` — dark/light theme via CSS custom properties
- `src/index.html` — HTML shell
- `main.js` — Electron main process (IPC, file ops, HEIC photos)
- `preload.js` — context bridge (34 IPC methods as `window.electronAPI`)
- `PRODUCT.md` — impeccable design context (Clean · Calm · Motivated)

**Data directory (Windows):** `%APPDATA%\NutriLog\NutriLogData\`

---

## What was done this session (2026-05-17)

### Bug fixes (v2.3.1)
- XSS: template/meal names now escaped with `esc()` in all innerHTML slots
- Theme: persisted to `localStorage`, no flash on startup
- Silent saves: critical saves now toast on failure; history saves `console.warn`
- Sync race: `_periodicSyncRunning` + `_pullInProgress` flags prevent interval stacking and concurrent pulls
- `pullFromSupabase()`: union merge for past dates — cloud-only entries (e.g. late-night meals) are no longer lost on pull
- Day rollover: pulls cloud first, then union-merges session into history
- Copy Yesterday: now shows confirmation if today already has meals
- Autocomplete: starts-with matches ranked before contains matches
- Modal Tab: focus trap added (Tab cycles within open modal)
- Streak animations: `IntersectionObserver` pauses flame CSS when Today page is off-screen
- Trend canvas: debounced resize listener redraws the trend line
- Sidenav scrollbar: custom 4px scrollbar + `scrollbar-width: thin` for Firefox
- HEIC: `egg:add` returns `{added, failed}`, renderer toasts on import failures
- `pullFromSupabase()`: also checks `nutrilog_sessions` for past dates — fixed missing entries that were in the sessions table but not history

### Feature (v2.3.2)
- Auto macro recalculation from body weight
  - `recalcMacrosFromWeight(kg)` — protein 2.0 g/kg target, 1.8 g/kg min; carbs from remaining kcal; fiber 14g/1000kcal (IOM)
  - Fat is NOT auto-recalculated (AHA cholesterol constraint: ≤65g)
  - Rolling average of last 3 check-ins used for stability (`getAvgWeight()`)
  - Check-in dialog now offers "Recalculate" instead of "save settings to apply"
  - Settings page has "⚖️ Recalculate Macros from Latest Weight" button
- `maybeShowCheckin()` moved to `onSignedIn()` — always fires after sync, not buried inside pull
- "Log Check-in" added to ⋯ More menu for on-demand check-in

### UI polish (v2.3.3)
- `DM Serif Display` removed from all product surfaces → `Outfit 600`
  - Affects: page titles, section titles, modal titles, weekly summary header, history date label, empty states, Photo Manager
  - Serif kept only in the logo mark (`.logo-name`)
- Kcal bar gradient replaced with solid `var(--mk)` color
- Modal animation: `ease` → `cubic-bezier(0,0,.2,1)` (ease-out)
- Category badges: `border-radius: 100px` pill → `5px` chip
- Weekly summary bars: `60px` → `90px` tall (better day-to-day difference visibility)
- Font floor raised: 9px → 10px minimum across all small labels
- Firefox scrollbar: `scrollbar-width: thin` on `#main` and `.sidenav`
- `btn-accent` focus ring: `focus-visible` outline added
- Nav section label tracking reduced `.8px` → `.4px`
- `PRODUCT.md` created for impeccable skill context

### Git checkpoint
- Commit `3c2c19a` = safe rollback point before UI redesign
- To revert UI changes only: `git reset --hard 3c2c19a`

---

## Known issues / not yet fixed

- Protein streak broke May 16 (155.9g logged vs 156g min) — fix: click "⚖️ Recalculate Macros from Latest Weight" in Settings after app starts
- Check-in prompt frequency ("Every 3 days") should trigger automatically — test after restarting app
- Ring size was reduced to 100px during UI pass then reverted — user prefers 150px

---

## What to continue next session

1. **Run macro recalculation** — open app → Settings → "⚖️ Recalculate Macros from Latest Weight" to fix protein streak min/max based on 76.4 kg
2. **Impeccable recommendations pending** — streak row redesign, date/time pill differentiation, ring card hover affordance review
3. **Test check-in auto-prompt** — verify it fires on next startup (fixed in this session, not yet verified)
4. **Consider** — the impeccable audit also noted the streak row reads as 5 identical cards; worth a dedicated redesign pass

---

## How to run

```
npm start        # dev (no dev tools)
npm run dev      # dev with --dev flag
npm run build:win  # build Windows installer → dist/
```

---

## Supabase

- Project: lifelog (supabase.com)
- Tables: `nutrilog_sessions`, `nutrilog_history`, `nutrilog_settings`, `nutrilog_food_library`, `nutrilog_checkins`, `nutrilog_templates`, `nutrilog_eggs`
- Key: public anon key, security via RLS
- Sync: pull merges history + sessions tables; push writes all tables

---

## Session protocol

When you type **"git push"** to Claude Code:
1. Claude generates/updates `HANDOFF.md`
2. Commits all staged changes with a version bump
3. Pushes to GitHub (`origin/main`)
4. Returns the handoff prompt for the other PC
