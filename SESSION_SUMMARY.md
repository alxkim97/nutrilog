# NutriLog — Session Summary (May 14 2026)

## Project Overview
Personal macro tracker desktop app built with **Electron 31 + vanilla HTML/CSS/JS + Chart.js + Supabase**.  
All app logic lives in one large file: `src/index.html` (~211K tokens — never read in full, always use targeted grep + offset reads).

---

## Two Separate Codebases (IMPORTANT)

| Codebase | Location | Current Version | Status |
|----------|----------|-----------------|--------|
| **Condo PC source** | `C:\Users\alex_\Desktop\NutriLog-Electron-v1_6_1\NutriLog-v1.6.0\` | v1.8.0 | Edited by Claude Code |
| **GitHub repo (work PC)** | `C:\Users\alex_\Desktop\Claude Code\nutrilog\` | v2.1.1 | Cloned from GitHub |
| Installed old app | `C:\Users\alex_\Desktop\Claude Code\NutriLog Setup 1.8.2.exe` | v1.8.2 | Outdated, ignore |
| v1.6.0 backup zip | `C:\Users\alex_\Desktop\NutriLog-Electron-v1_6_1.zip` | v1.6.0 | Restore point |

**The GitHub repo (`iiAlera/nutrilog`) is the main codebase going forward.**  
GitHub Desktop: clone is at `C:\Users\alex_\Desktop\Claude Code\nutrilog\`  
To run: `npm start` from that folder. To push changes: GitHub Desktop → commit → Push origin.  
On work PC: open GitHub Desktop → Pull origin to get latest.

---

## Key Files (same structure in both codebases)
| File | Purpose |
|------|---------|
| `main.js` | Electron main process — window, menus, file I/O, IPC handlers |
| `preload.js` | Secure IPC bridge (contextBridge) |
| `src/index.html` | Entire frontend — all CSS, HTML, JS in one file |
| `src/vendor/chart.umd.min.js` | Chart.js (bundled) |
| `src/vendor/supabase.js` | Supabase client (bundled) |

## Data Storage
Local JSON files via Electron IPC at `%APPDATA%\nutrilog\NutriLogData\`:
- `sessions.json` — today's meals (`nutrilog_v1` key) — **must NOT contain today's date in history.json**
- `history.json` — all past days (`nutrilog_history` key)
- `settings.json`, `foodlib.json`, `checkins.json`, `templates.json`, `daynotes.json`
- `eggs/` folder — easter egg photos (jpg/png/gif/webp)

Supabase tables: `history`, `sessions`, `settings`, `food_library`, `templates`, `checkins`, `eggs`

## Supabase Config (in index.html ~line 2031)
- URL: `https://jpsisvaprkrcyvwnmasb.supabase.co`
- User email: alera.gamez@gmail.com

## How to Run
```bash
# GitHub repo (main codebase)
cd "C:\Users\alex_\Desktop\Claude Code\nutrilog"
npm install      # first time only
npm start        # run dev version
npm run build    # build Windows installer → dist/

# Condo PC source (older, v1.8.0)
cd "C:\Users\alex_\Desktop\NutriLog-Electron-v1_6_1\NutriLog-v1.6.0"
npm start
```

---

## All Changes Made (v1.6.0 → v1.8.0) — Condo PC source

### v1.7.0 — Feature batch
1. **Easter egg pin** — 📌 button locks position (can't drag/resize), X and Escape still close
2. **Easter egg interval slideshow** — ⏱ seconds input in footer, cycles images automatically
3. **Easter egg star burst** — 32 emoji stars animate out on every open (140–360px spread)
4. **Hidden Photo Manager** — tap photo counter ("1 / 3") 5× fast → opens add/delete modal
5. **Easter egg images on disk** — saved to `NutriLogData/eggs/`, loaded via IPC
6. **Days left bug fix** — projection page showed total plan days instead of remaining
7. **Projected weight card** — "Weight Estimate" on Projection page (Current → Projected + delta)

New IPC: `egg:list`, `egg:read`, `egg:add`, `egg:delete`  
New bridge: `listEggImages`, `readEggImage`, `addEggImages`, `deleteEggImage`

### v1.7.1 — Sync fix (cross-device data loss)
- `pullFromSupabase` was calling `sbDeleteDate` on cloud-only dates → wiped other-device data
- Fixed: cloud-only dates always merge in; `forcePushToCloud` mirrors today to history table

### v1.7.2 — Sync improvements
- `Store.set` for `nutrilog_v1` mirrors to history table on every auto-save
- Periodic background sync every 5 minutes
- Pin button fix: drag bar `mousedown` now skips button clicks

### v1.7.3 — Today page blank after sync
- `pullFromSupabase` saved today's session without `date` field → `autoLoad` couldn't match it
- Fixed: added `date:todayStr()` to the stored object

### v1.7.4 — Sidebar macros showing 0
- `buildSidebarRows()` was called AFTER `render()` → zeroed out all macro bars
- Fixed: order changed to `buildSidebarRows(); await autoLoad(); render()`

### v1.7.5 — Features
- **Calorie range bar** — Settings → "Calorie Range" row with Floor Min (green tick) + Ceiling Max (red tick)
  - Visual only — does NOT affect projection math
  - Keys: `kcalMin`, `kcalMax` in settings; `TGT_MIN.kcal`, `TGT_MAX.kcal` in JS
- **Auto-preselect meal type by time** — `catByTime()`:
  - 05:00–09:59 → Breakfast | 10:00–13:59 → Lunch | 14:00–17:59 → Snack | 18:00–21:59 → Dinner | 22:00–04:59 → Snack

### v1.7.6 — Push All stale disk bug
- `forcePushToCloud` read from disk; if user edited a meal before auto-save fired, disk had old data
- Fixed: uses **in-memory `meals` array** for today; excludes today from history push
- `pullFromSupabase` no longer writes today's date into `history.json`

### v1.8.0 — Pre-log + shortcuts + egg cloud sync
- **Pre-log fix**: `autoLoad` + `handleDayRollover` now check `histIdx[today]` and auto-load pre-logged meals when the day arrives; pre-logs merge instead of override
- **Push shortcut**: `Ctrl+Shift+U` → triggers "Push Local → Cloud"
- **Simpler pre-logging**: Add Meal modal has Today / +1 / +2 / +3 quick date buttons
- **Egg cloud sync**: Push All uploads egg images as base64 to `eggs` Supabase table; Pull downloads missing images
  - New IPC: `egg:get-all-base64`, `egg:write-all-base64`
  - New bridge: `getAllEggImages()`, `writeAllEggImages(imgs)`
  - **Eggs table SQL** (run once in Supabase):
    ```sql
    create table if not exists eggs (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users not null unique,
      data jsonb,
      updated_at timestamptz default now()
    );
    alter table eggs enable row level security;
    create policy "Users manage own eggs" on eggs for all using (auth.uid() = user_id);
    ```

---

## Changes Made to GitHub Repo (v2.1.1) — Work PC codebase

### v2.1.1 — Deleted history dates keep coming back (tombstone fix)
**Root cause:** Deleting a history date removes it locally and from Supabase, but the other PC still has it in its local `history.json`. When that PC syncs, it re-uploads the deleted date → it comes back indefinitely.

**Fix — deletion tombstone log:**
- New global `_deletedDates = new Set()` — tracks intentionally deleted dates
- New `addDeletedDate(ds)` function — adds to set, prunes entries >60 days old, saves to settings
- `delHistEntry`: calls `addDeletedDate(ds)` when all entries for a date are removed
- `deleteHistSelected`: calls `addDeletedDate` for each bulk-deleted date
- `pullFromSupabase`: filters `_deletedDates` out of merged history; re-calls `sbDeleteDate` for each → propagates deletion to cloud
- `loadSettings`: restores `_deletedDates` from saved settings on startup
- `saveSettings`: persists `_deletedDates` array in settings object
- Result: any device that pulls will honour the deletion and remove it from cloud again

**Committed and pushed to GitHub** (commit: `c7a5028`). Work PC needs `git pull` to receive this fix.

---

## Architecture Notes

### Sync flow
- **`sessions` table** — today's in-progress meals (authoritative for today)
- **`history` table** — past completed days + mirror of today (for cross-device pull)
- `Store.set` → saves to local file + immediately pushes to Supabase (if signed in)
- `Store._localGet` / `Store._localSet` → local file only, no cloud sync
- `pullFromSupabase` → called on sign-in + manual "Pull from Cloud"
- `forcePushToCloud` → manual "Push All" + `Ctrl+Shift+U`
- Periodic background sync every 5 minutes (silent)

### Key JS globals
- `meals` — in-memory array of today's meals (source of truth — always use this, not disk)
- `histIdx` — `{date: meals[]}` for all history
- `_deletedDates` — `Set` of intentionally deleted dates (tombstone log)
- `TGT` / `TGT_MIN` / `TGT_MAX` — macro targets and ranges (includes `kcal`)
- `_syncEnabled` — true if signed into Supabase
- `_supaUser` — current Supabase user object
- `_eggPhotos` — `[{src, name}]` loaded egg photos
- `_eggPinned` — true = overlay locked in place (can't drag/resize)

### Important patterns
- `todayStr()` — `YYYY-MM-DD` for today
- `se(id)` — `document.getElementById(id)`
- `toast(msg, type)` — toast notification
- `showConf(title, body, okLbl, cb)` — confirmation dialog
- `Store.set(key, value)` — save locally AND sync to cloud
- `Store._localSet(key, value)` — save locally ONLY

### Reading index.html safely
File is 211K tokens — **never read all at once** (25K limit per read call).  
Always: `Grep` for line numbers → `Read` with `offset` + `limit`.

---

## Known Remaining Items
- [ ] **Create `eggs` Supabase table** — SQL in v1.8.0 notes above (required for egg image sync)
- [ ] Work PC needs `git pull` to receive the v2.1.1 tombstone fix
- [ ] Merge condo PC changes (v1.8.0) into the GitHub repo — the two codebases have diverged
- [ ] Split `index.html` into separate CSS/JS/HTML files (865KB single file is hard to maintain)
- [ ] Add per-date `modified_at` timestamps for true conflict resolution
- [ ] Electron notifications — remind to log meals at set times
- [ ] Barcode scanner for packaged food entry

---

## User Notes
- User: Alex Kim (alera.gamez@gmail.com), GitHub: `iiAlera`
- Two PCs: work PC + condo PC, both sync via Supabase
- Thai food items in database (some with Thai characters)
- Body recomp goal — tracking protein/fat/carbs/fiber + kcal
- Projection model: hybrid BMR recalc + adaptive factor from week 5
- `heic-convert` dependency added in v2.x (likely for HEIC photo support)
