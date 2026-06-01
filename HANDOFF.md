# NutriLog — Session Handoff

**Last updated:** 2026-06-01 (Condo PC)
**Current version:** v2.6.2
**Branch:** main
**Supabase project:** lifelog

---

## App overview

NutriLog is a personal macro nutrition tracker — Electron 31 desktop app, vanilla HTML/CSS/JS, no framework. Data stored locally as JSON + optional Supabase cloud sync. Now supports multiple user profiles on a single device.

**Key files:**
- `src/app.js` — 4,700+ line renderer (all UI + logic)
- `src/styles.css` — dark/light theme via CSS custom properties
- `src/index.html` — HTML shell
- `main.js` — Electron main process (IPC, file ops, HEIC photos, profile routing)
- `preload.js` — context bridge (37 IPC methods as `window.electronAPI`)
- `PRODUCT.md` — design context (Clean · Calm · Motivated / Raycast)

**Run:** `npm start` | **Build:** `npm run build:win`
**Data dir (Windows):** `%APPDATA%\NutriLog\NutriLogData\`

---

## What was done this session (2026-06-01, Condo PC)

### v2.6.1 — Profile switch cloud pull fix
- `switchProfile()` now calls `pullFromSupabase()` after switching — local profile files are empty on first switch, this restores cloud data automatically
- `pullFromSupabase()` calls `renderCalendar()` if History page is active after a pull
- **To recover existing profiles:** just switch to them — data pulls from Supabase automatically. If profile was deleted, re-add with same name (same ID = same cloud data)

### v2.6.2 — Simple mode, recipe builder, UX polish
**Simple Mode** (Settings → Appearance):
- Toggle hides Analysis + Projection from sidebar — designed for parents/new users
- State persisted per-profile in settings

**Recipe Builder** (Food Database → Recipes tab):
- Create recipes from food library ingredients with amounts
- Per-serving macro calculation (total ÷ servings)
- "+ Log" button pre-fills the meal form in one click
- Recipes show in meal form autocomplete with 🍳 tag

**Goal/settings improvements:**
- Goal Weight optional — leave blank → maintenance (0 deficit)
- "Gentle Loss (−200 kcal)" goal added, recommended for users 60+
- Goal Weight + Timeline fields auto-hide for non-recomp goals
- Profile pill removed from topbar — sidebar toggle is sufficient

**Claude Code settings (this PC):**
- `~/.claude/settings.json` updated with `permissions.defaultMode: "auto"`
- Auto mode only applies to CLI (`claude` in terminal), not VS Code extension

**Answered questions:**
- **Goal weight for no-weight-goal users:** Leave blank → maintenance mode
- **Elderly deficit (-500):** Too aggressive for 60s. Use "Gentle Loss (−200 kcal)" goal. Aim for -200 to -300 kcal/day. Protein 1.6–2.0 g/kg critical to prevent sarcopenia.

---

## What was done this session (2026-05-31, CNX Parents' PC)

### Major feature: Multi-profile system (v2.6.0)

**Architecture:**
- One Supabase account, multiple profiles tagged by `profile_id` column
- Local files stored per-profile: `NutriLogData/profiles/{id}/`
- Food library shared across all profiles: `NutriLogData/foodlib.json`
- Cloud: profile data tagged `profile_id = {id}`, food library tagged `profile_id = 'shared'`

**Profiles on this device:** Mom, Dad, Alex
**Profile IDs in Supabase:** `mom`, `dad`, `alex`, `shared` (food library)

**Supabase schema changes:**
- Added `profile_id text NOT NULL DEFAULT 'alex'` to 6 tables
- Updated unique constraints from `(user_id)` / `(user_id,date)` → include `profile_id`
- SQL was run in two passes (first pass constraint names were wrong, second pass used dynamic drop)

**New IPC methods in preload.js:** `getProfiles`, `setActiveProfile`, `updateProfileName`, `addProfile`, `deleteProfile`

**Key app.js functions added:**
- `switchProfile(id)` — saves current session, switches file routing, reloads all data, shows loading overlay, lands on Today
- `updateProfileToggle()` — renders sidebar buttons + topbar pill dynamically
- `renderProfileSettings()` — dynamic profile list in Settings with rename/delete
- `addProfileFromInput()` / `deleteProfile(id)` / `renameProfile(id, name)`
- `maybeShowFirstRun()` / `submitFirstRun()` — first-run name prompt for fresh installs
- `slugifyProfileName(name)` / `makeProfileId(name)` — stable ID generation

**Bugs fixed during session:**
- `LOG_SEED` (historical meal data baked into app) was contaminating Mom/Dad profiles → now only applied when `_activeProfile === 'alex'`
- Migration accidentally copied Alex's data to `profiles/mom/` (old hardcoded first profile) → wiped manually via PowerShell
- Stats Dashboard not refreshing on profile switch → added `renderStatsDashboard()` to switch sequence
- Supabase sync failing for non-Alex profiles → unique constraints were wrong names, fixed with dynamic SQL drop

### Per-profile themes (v2.6.0)
- Theme (dark/light) and variant (Aura/Onyx/Linear/Amber) now saved in `nutrilog_settings` per profile
- `toggleTheme()` and `applyVariant()` both save to profile settings immediately
- `loadSettings()` applies theme+variant on load → switching profile changes the look

### Shared food library (v2.6.0)
- Food library moved from per-profile dir to shared `NutriLogData/foodlib.json`
- Cloud sync uses `profile_id = 'shared'` via new `sbGetShared`/`sbSetShared` functions
- Migration auto-copies the largest existing profile foodlib to shared on startup

### Cholesterol management toggle (v2.6.0)
- New toggle in Settings → Daily Macro Targets
- OFF (standard, default): fat = 30% of calories, min 20%, max 35% — recalculates with weight
- ON (cholesterol management): fat = 20% of calories, max 65g (AHA guidelines) — fat NOT overridden by weight recalc
- Alex: enable this toggle and save settings

### Topbar profile indicator (v2.6.0)
- Accent-colored pill shows active profile name in topbar
- Only visible when 2+ profiles exist
- Clicking navigates to Settings → Profiles

### First-run name prompt (v2.6.0)
- Fresh install (no existing settings) shows a "What's your name?" screen
- Sets up the default profile with their name and a slug ID
- Prevents the migration contamination issue that happened this session

---

## Current macro settings (Alex, 77 kg)

- Protein: 155g target, 139g min, no max
- **Fat: 56g target, 45g min, 65g max — CHOLESTEROL MANAGEMENT ON**
- Carbs: 348g target, 307g min, 377g max
- Fiber: 35g target, 28g min, 44g max
- Kcal target: 2517, range 2300–2700

**Action needed on Alex's work/condo PCs after pulling latest:**
1. Go to Settings → Daily Macro Targets → enable "Cholesterol Management" toggle
2. Save Settings

---

## Pending items

1. Body composition trend chart (weight + body fat % overlaid on Projection page)
2. Meal timing analysis improvements (avg gap per day in Analysis)
3. Electron desktop notifications for meal reminders (currently uses browser Notification API — unreliable on Windows)
4. Streak row padding review (UI polish, still pending)
5. Code audit — targeted review of new profile system edge cases

---

## How to continue on work/condo PC

```
Pull latest from GitHub first, then:

Continue NutriLog development. Read HANDOFF.md for full session context.
Current version: v2.6.0

Key facts:
- Electron 31, vanilla HTML/CSS/JS, no framework
- src/app.js (4700+ lines), src/styles.css, src/index.html, main.js
- Supabase cloud sync (project: lifelog), local JSON per-profile data store
- Multi-profile system: profiles stored in NutriLogData/profiles/{id}/
- Food library shared: NutriLogData/foodlib.json (profile_id='shared' in Supabase)
- LOG_SEED only applies to profile id 'alex' (guard in indexHistory())
- PRODUCT.md has design context
- run: npm start

Action needed: Settings → Daily Macro Targets → enable Cholesterol Management → Save
```

---

## Session protocol

When you type **"git push"** to Claude Code:
1. Claude updates `HANDOFF.md` with session summary
2. Bumps version if needed
3. Commits all staged changes
4. Pushes to GitHub (`origin/main`)
5. Returns the handoff prompt for the other PC
