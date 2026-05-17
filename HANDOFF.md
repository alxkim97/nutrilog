# NutriLog — Session Handoff

**Last updated:** 2026-05-17 (Condo PC)
**Current version:** v2.3.3
**Branch:** main
**Supabase project:** lifelog (renamed from nutrilog — dashboard only, no code change)

---

## App overview

NutriLog is a personal macro nutrition tracker — Electron 31 desktop app, vanilla HTML/CSS/JS, no framework. Data stored locally as JSON + optional Supabase cloud sync.

**Key files:**
- `src/app.js` — 4,400+ line renderer (all UI + logic)
- `src/styles.css` — dark/light theme via CSS custom properties
- `src/index.html` — HTML shell
- `main.js` — Electron main process (IPC, file ops, HEIC photos)
- `preload.js` — context bridge (34 IPC methods as `window.electronAPI`)
- `PRODUCT.md` — impeccable design context (Clean · Calm · Motivated / Raycast)

**Run:** `npm start` | **Build:** `npm run build:win`
**Data dir (Windows):** `%APPDATA%\NutriLog\NutriLogData\`

---

## What was done this session (2026-05-17, Condo PC)

### Bug fixes (v2.3.1)
- XSS: template/meal names escaped in all innerHTML slots
- Theme: persisted to `localStorage`, no flash on startup
- Silent saves: critical saves toast on failure, history saves `console.warn`
- `_periodicSyncRunning` + `_pullInProgress` flags prevent overlapping syncs
- History pull: union merge for past dates — cloud-only entries no longer lost
- `pullFromSupabase()` now checks `nutrilog_sessions` for past dates (fixed missing May 16 entries)
- Day rollover: pulls cloud before archiving, then union-merges session
- Copy Yesterday: confirms before overwriting existing meals
- Autocomplete: starts-with before contains ranking
- Modal Tab trap, streak animation perf, trend canvas resize, sidenav scrollbar, HEIC errors

### Feature: Auto Macro Recalculation (v2.3.2)
- `recalcMacrosFromWeight(kg)` — 2.0 g/kg protein target, 1.8 g/kg min, IOM fiber
- Rolling average of last 3 check-ins for stability
- Check-in dialog auto-recalculates when weight differs ≥0.5 kg
- "⚖️ Recalculate Macros from Latest Weight" button in Settings
- `maybeShowCheckin()` moved to `onSignedIn()` — always fires after startup
- "Log Check-in" added to ⋯ More menu
- Direct settings.json fix: proteinMin 156→137g, fiber 40→36g (IOM)

### UI polish (v2.3.3)
- DM Serif Display removed from product surfaces → Outfit 600 (kept in logo)
- Kcal bar gradient → solid var(--mk)
- Modal ease → ease-out cubic-bezier
- Category badges: pill → 5px chip
- Weekly bars: 140px tall, 88% fill (bars closer to date labels)
- Font floor raised to 10px minimum
- Firefox scrollbar-width:thin
- btn-accent focus-visible ring
- Auto button in Settings for calorie range (±200 kcal around target)
- Weekly Summary: 5 chart toggles (Grid, Target, Zone, Trend, Avg) with collision-safe labels
- Streak widgets: column layout, flame left + wider (scaleX 1.35), text fills card
- PRODUCT.md created

### Git checkpoint
- Commit `3c2c19a` = safe rollback before UI redesign
- `git reset --hard 3c2c19a` to revert UI changes only

---

## Current macro settings (76.4→77 kg)

Settings auto-recalculated after weight update to 77 kg:
- Protein: 155g target, 139g min, no max
- Fat: 56g target, 45g min, 65g max (AHA cholesterol constraint — do NOT auto-recalc)
- Carbs: 348g target, 313g min, 384g max
- Fiber: 36g target, 29g min, 45g max
- Kcal target: 2517, range 2300–2700

---

## What to continue next session

1. **Pending impeccable audit items:**
   - Date pill vs time pill should look visually distinct (currently identical style)
   - Streak row could be tighter with less per-card padding
   - Ring card hover `translateY(-2px)` — rings are draggable so it's intentional, but worth reviewing

2. **Test across both PCs** — verify sync works correctly after the union-merge fixes

3. **Consider adding** — weekly macro breakdown view (protein/carbs/fat stacked bars by day)

---

## Session protocol

When you type **"git push"** to Claude Code:
1. Claude updates `HANDOFF.md` with session summary
2. Bumps version if needed
3. Commits all staged changes
4. Pushes to GitHub (`origin/main`)
5. Returns the handoff prompt for the other PC

## How to continue on company PC

Paste this prompt into a new Claude Code session after pulling latest:

```
Continue NutriLog development. Pull latest from GitHub first.
Read HANDOFF.md for full session context. Current version: v2.3.3.

Key facts:
- Electron 31, vanilla HTML/CSS/JS, no framework
- src/app.js (4400+ lines), src/styles.css, src/index.html, main.js
- Supabase cloud sync (project: lifelog), local JSON data store
- PRODUCT.md has design context (Clean · Calm · Motivated, Raycast reference)
- Git checkpoint 3c2c19a = safe rollback before UI changes
- run: npm start

Pending: date/time pill visual distinction, streak row padding review,
weekly macro breakdown view (stacked bars). Test sync on this PC first.
```
