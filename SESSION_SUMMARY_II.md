# NutriLog — Session Summary II (May 15–16 2026)

---

## About the Developer
- **Name:** Alex Kim (`alera.gamez@gmail.com`, GitHub: `iiAlera`)
- **Experience level:** Novice — learning as he goes. Not experienced with GitHub, Supabase, Electron, or app development in general. Needs clear step-by-step instructions and explanations for anything outside the code editor.
- **Setup:** Two PCs — Work PC and Condo PC. Both must stay in sync via GitHub + Supabase.
- **Goal:** Body recomposition — tracks protein, fat, carbs, fiber, and kcal daily.

---

## Two Active App Projects

| App | Repo | Local Path | Version | Stack |
|-----|------|-----------|---------|-------|
| **NutriLog** | `iiAlera/nutrilog` | `C:\Users\alex_\Desktop\Claude Code\nutrilog\` | v2.3.0 | Electron + Vanilla JS + Supabase |
| **Iron Log** | `iiAlera/iron-log` | `C:\Users\alex_\Desktop\Claude Code\iron log\` | v1.2.0 | Electron + Vanilla JS + Supabase |

- Both share the **same Supabase project** (`https://jpsisvaprkrcyvwnmasb.supabase.co`) using **different table prefixes** (`nutrilog_*` and `iron_*`)
- Both have **separate GitHub repositories**
- Use **separate Claude Code chats** for each app to avoid confusion

---

## Shared Infrastructure

### GitHub Workflow (IMPORTANT — novice reminder)
Always do this when switching PCs:
```
End of session on any PC  →  git push
Start of session on new PC  →  git pull
```
In VSCode terminal (`Ctrl+`` ` ``):
```bash
cd "C:\Users\alex_\Desktop\Claude Code\nutrilog"
git pull   # or git push
```

### Supabase
- **Project:** `nutrilog` (Alex Kim, Free tier)
- **User email:** `alera.gamez@gmail.com`
- Tables are prefixed so multiple apps share one Supabase project without confusion

#### NutriLog Supabase Tables (as of May 16 2026)
| Table | Purpose |
|-------|---------|
| `nutrilog_history` | Past days' meal logs |
| `nutrilog_sessions` | Today's in-progress meals |
| `nutrilog_settings` | User settings and targets |
| `nutrilog_food_library` | Custom food database |
| `nutrilog_checkins` | Weekly weight/body check-ins |
| `nutrilog_templates` | Saved meal templates |
| `nutrilog_eggs` | Easter egg photos (base64) |

> **Note:** Tables were renamed from unprefixed names (`history`, `sessions`, etc.) to `nutrilog_*` in this session. The code already used the new names since v2.2.1.

#### Iron Log Supabase Tables (already prefixed)
`iron_sessions`, `iron_checkins`, `iron_exerciselib`, `iron_templates`, `iron_walkdata`, `iron_bwlog`

---

## NutriLog File Structure (after refactor in this session)

```
nutrilog/
  main.js          ← Electron main process (window, menus, IPC, shortcuts)
  preload.js       ← Secure IPC bridge (contextBridge)
  package.json     ← Version, dependencies, build config
  src/
    index.html     ← HTML structure only (~1,423 lines)
    styles.css     ← All CSS (~837 lines)
    app.js         ← All JavaScript (~3,993 lines)
    vendor/
      chart.umd.min.js
      supabase.js
  assets/
    icon.ico / icon.png
```

> **Important for Claude:** `src/app.js` is large. Always `Grep` for line numbers first, then `Read` with `offset` + `limit`. Never read it all at once.

---

## Key NutriLog JS Globals (in app.js)
| Variable | Purpose |
|---------|---------|
| `meals` | In-memory today's meals — **source of truth, use this not disk** |
| `histIdx` | `{date: meals[]}` all history |
| `_deletedDates` | Set of tombstoned deleted dates |
| `TGT` / `TGT_MIN` / `TGT_MAX` | Macro targets and ranges |
| `_syncEnabled` | True if signed into Supabase |
| `_supaUser` | Current Supabase user object |

### Key Patterns
- `todayStr()` → `YYYY-MM-DD`
- `se(id)` → `document.getElementById(id)`
- `toast(msg, type)` → toast notification
- `Store.set(key, val)` → save locally AND sync to cloud
- `Store._localSet(key, val)` → save locally ONLY

---

## Keyboard Shortcuts (as of v2.3.0)

| Shortcut | Action |
|----------|--------|
| `?` | Open shortcuts panel |
| `Ctrl+1` | Today page |
| `Ctrl+2` | History page |
| `Ctrl+3` | Food Database |
| `Ctrl+4` | Settings |
| `Ctrl+S` | **Push All to Cloud** |
| `Ctrl+Shift+U` | **Pull from Cloud** |
| `Ctrl+T` | Toggle dark/light mode |
| `Ctrl+Z` | Undo last meal action |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |

---

## Changes Made in This Session (v2.1.2 → current)

### Refactor: Split monolithic index.html (commit `4385628`)
- `src/index.html` was 865KB / 6,255 lines — all HTML, CSS, and JS in one file
- Split into `index.html` (HTML), `styles.css` (CSS), `app.js` (JS)
- **No behavior change** — purely a maintenance improvement
- Encoding note: Always use `[System.IO.File]::ReadAllLines(path, UTF8)` when reading with PowerShell — plain `Get-Content` breaks Thai characters and emoji

### Fix: Pre-logged meals not appearing on Today page (commit `2add7ae`)
**Root cause:** `autoLoad()` only checked `nutrilog_v1` (session store). Pre-logged meals for future dates are stored in `nutrilog_history`, which it never checked. Also, `pullFromSupabase()` deleted today's date from merged history before saving, wiping pre-logged meals.

**Fixes applied:**
1. `autoLoad()` — now merges `histIdx[today]` after loading session store
2. `handleDayRollover()` — now loads pre-logged meals for new day at midnight
3. `pullFromSupabase()` — now restores today's pre-logged meals into `histIdx[today]` in memory after pull (still not persisted to disk)

### Shortcuts remapped (commit `2add7ae`)
- `Ctrl+S` → Push All to Cloud (was Save Session)
- `Ctrl+Shift+U` → Pull from Cloud (new)
- Save Session no longer has a keyboard shortcut (auto-save handles it)
- Changes in: `main.js` (accelerators), `preload.js` (IPC bridge), `app.js` (handler), `src/index.html` (panel display)

### Supabase table rename (done manually in Supabase SQL Editor)
Renamed all nutrilog tables from unprefixed to `nutrilog_*` prefix.
Created missing `nutrilog_templates` and `nutrilog_eggs` tables fresh.

---

## Sync Architecture (how cloud sync works)

```
nutrilog_sessions  ← today's in-progress meals (authoritative for today)
nutrilog_history   ← past completed days + mirror of today
```

- `Store.set(key, val)` → saves to local JSON file + immediately pushes to Supabase
- `Store._localSet(key, val)` → local file only, no cloud
- `pullFromSupabase()` → called on sign-in + `Ctrl+Shift+U`
- `forcePushToCloud()` → called on `Ctrl+S`
- Background auto-sync every 5 minutes

### Local data files location
`%APPDATA%\nutrilog\NutriLogData\`
- `sessions.json` → today's meals (`nutrilog_v1` key)
- `history.json` → all past days (`nutrilog_history` key)
- `settings.json`, `foodlib.json`, `checkins.json`, `templates.json`, `daynotes.json`
- `eggs/` folder → easter egg photos

---

## Claude Code: Local Tab vs Web Tab

| | Local Tab | Web Tab |
|--|-----------|---------|
| Chat history | This PC only | All PCs and browsers |
| File access | Full | Full (runs on whichever PC has VSCode) |
| CMD / PowerShell | Yes | Yes (on whichever PC is open) |
| Continue from another PC | No | Yes |
| Offline | Yes | Needs internet |

**Recommendation for Alex:** Use the **Web tab** for all sessions. Chat history follows you across both PCs. Still do `git push` / `git pull` when switching machines for the actual code files.

---

## Version History (NutriLog)
| Version | Key Changes |
|---------|------------|
| v2.3.0 | Achievement system |
| v2.2.1 | Instant egg switching, `nutrilog_` table prefix in code |
| v2.2.0 | Food heatmap, daily reminders, smarter template sync |
| v2.1.3 | Sync widget refresh fix, egg image delay fix |
| v2.1.2 | Pre-log fix, Ctrl+S → Push to Cloud, Ctrl+Shift+U → Pull from Cloud |
| v2.1.1 | Tombstone fix (deleted dates no longer restored by other devices) |
| v2.1.0 | Meal timing analysis, copy day to date, collapsible widgets |
| v2.0.0 | HEIC fix, weight log, quick-log recent, calorie widget |

---

## Known Remaining Items
- [ ] Merge Iron Log local folder with GitHub repo (local has no `.git` — needs `git init` + link to `iiAlera/iron-log`)
- [ ] Verify sync fully working after Supabase table rename (press `Ctrl+S` and check Supabase Table Editor)
- [ ] Split `iron log/index.html` into separate CSS/JS/HTML files (same refactor as NutriLog)
- [ ] Barcode scanner for packaged food entry
- [ ] Meal reminder notifications
- [ ] Per-date `modified_at` timestamps for true conflict resolution

---

## How to Start a New Web Session

1. Open VSCode on either PC
2. Click **Claude Code** in the sidebar → **Web tab** → **New session**
3. Paste this file's contents as context, or reference:
   - NutriLog repo: `C:\Users\alex_\Desktop\Claude Code\nutrilog\`
   - Iron Log folder: `C:\Users\alex_\Desktop\Claude Code\iron log\`
4. Always run `git pull` first if switching from another PC
