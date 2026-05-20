# NutriLog — Session Handoff

**Last updated:** 2026-05-20 (Work PC)
**Current version:** v2.3.5
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

## What was done this session (2026-05-20, Work PC)

### UI polish + weekly macro breakdown (v2.3.5)

**Date/time pill visual distinction:**
- Date pill: removed background and border — now a plain `text3` monospace caption (static context)
- Time pill: `border-radius:6px`, full `--text` color, `letter-spacing:.5px` — live clock feel
- Added subtle `·` separator between the two in the topbar

**Weekly macro breakdown view:**
- New **Macro** toggle button in Weekly Summary (before the separator)
- Stacked bars: Protein (blue/bottom) → Carbs (green/mid) → Fat (yellow/top)
- Scales to same max-kcal reference as normal bars
- Label below each day shows protein grams when active
- Overlay buttons (Trend/Target/Zone/Avg) dim to 40% opacity — they only apply to kcal view
- Colour legend (P / C / F) appears below the grid
- Weekly sub-label changes to "This week's macro breakdown"
- State persisted to localStorage alongside other chart opts

**Sync fixes (v2.3.4 work PC session):**
- Safety-net interval now bypasses `_syncEnabled` flag — only checks `_supaUser`
- `sbSetSession` and `sbSetHistory` now check `{error}` from Supabase response
- Runs unconditionally every 30s when meals + user present

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

1. **Run dedup** — Settings → "🧹 Remove Duplicate Meals from History" if first run on condo PC
2. **Test sync** — add a meal, wait 30s without pressing Ctrl+S, verify Supabase `updated_at` refreshes
3. **Pending items:**
   - Streak row padding review (still pending)
   - Body composition trend chart (weight + body fat % overlaid on Projection page)
   - Meal timing analysis improvements (avg gap per day in Analysis)
4. **Next features (priority order):**
   - Body recomp progress: overlay weight trend + body fat estimate on Projection
   - Quick-add from barcode scan (stretch goal)
   - Export to CSV (easy, useful)

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

Pending: streak row padding review, body composition trend chart,
sync test (add meal → wait 30s → check Supabase without pressing Ctrl+S).
```
