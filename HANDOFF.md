# NutriLog — Session Handoff

**Last updated:** 2026-05-19 (Condo PC)
**Current version:** v2.3.4
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
- `PRODUCT.md` — design context (Clean · Calm · Motivated / Raycast)

**Run:** `npm start` | **Build:** `npm run build:win`
**Data dir (Windows):** `%APPDATA%\NutriLog\NutriLogData\`

---

## What was done this session (2026-05-19, Condo PC)

### Bug fix: sync duplicate meals (v2.3.4)

**Root cause:** `autoLoad()` was double-merging today's meals from two sources:
1. `nutrilog_v1` (written from `nutrilog_sessions` table during pull)
2. `histIdx[today]` (written from `nutrilog_history` table during pull)

If `time` or `serving` strings differed even slightly between the two tables, dedup failed and ghost duplicate rows appeared (e.g. 20:09 dinner + 22:11 copy of same dinner).

**Fix (two parts):**
- `pullFromSupabase()` now merges sessions + history for today into one clean list before writing `nutrilog_v1`, then deletes `histIdx[today]` so `autoLoad()` can't re-merge
- `autoLoad()` simplified — loads `nutrilog_v1` only, no histIdx merge

**Cleanup tool:**
- Added `deduplicateHistory()` — scans all history dates, removes entries where `(name|category|serving)` duplicates within the same day, saves locally and pushes to Supabase
- "🧹 Remove Duplicate Meals from History" button added to Settings
- Silent dedup pass runs automatically after every cloud pull

---

## Previous session summary (v2.3.3, 2026-05-17)

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

### UI polish (v2.3.3)
- DM Serif Display removed from product surfaces → Outfit 600 (kept in logo)
- Kcal bar gradient → solid var(--mk)
- Modal ease → ease-out cubic-bezier
- Category badges: pill → 5px chip
- Weekly bars: 140px tall, 88% fill
- Weekly Summary: 5 chart toggles (Grid, Target, Zone, Trend, Avg) with collision-safe labels
- Streak widgets: column layout, flame left + wider (scaleX 1.35), text fills card
- Auto button in Settings for calorie range (±200 kcal around target)
- PRODUCT.md created, HANDOFF.md + pre-push hook created

### Git checkpoint
- Commit `3c2c19a` = safe rollback before UI redesign
- `git reset --hard 3c2c19a` to revert UI changes only

---

## Current macro settings (77 kg)

- Protein: 155g target, 139g min, no max
- Fat: 56g target, 45g min, 65g max (AHA cholesterol constraint — do NOT auto-recalc)
- Carbs: 348g target, 307g min, 377g max
- Fiber: 35g target, 28g min, 44g max
- Kcal target: 2517, range 2300–2700

---

## What to continue next session

1. **Run dedup first** — Settings → "🧹 Remove Duplicate Meals from History" to clean any historical duplicates
2. **Test sync on company PC** — pull latest, run npm start, verify no duplicates appear
3. **Pending UI items:**
   - Date pill vs time pill visual distinction (currently identical style)
   - Streak row padding review
4. **Feature ideas (priority order):**
   - Weekly macro breakdown view (protein/carbs/fat stacked bars by day)
   - Meal timing analysis (avg meal gaps, show in Analysis view)
   - Body composition trend chart (weight + body fat % overlaid)
   - Copy any past day (not just yesterday)

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
Read HANDOFF.md for full session context. Current version: v2.3.4.

Key facts:
- Electron 31, vanilla HTML/CSS/JS, no framework
- src/app.js (4400+ lines), src/styles.css, src/index.html, main.js
- Supabase cloud sync (project: lifelog), local JSON data store
- PRODUCT.md has design context (Clean · Calm · Motivated, Raycast reference)
- Git checkpoint 3c2c19a = safe rollback before UI changes
- run: npm start

First: go to Settings → click "🧹 Remove Duplicate Meals from History" to clean
any sync duplicates that accumulated before v2.3.4.

Pending: date/time pill visual distinction, streak row padding review,
weekly macro breakdown view (stacked bars). Test sync on this PC first.
```
