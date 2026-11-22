# NutriLog — handoff (updated 2026-11-22)

Personal macro tracker: Electron 44 + Vite 8 + vanilla JS desktop app, plus a phone PWA on Vercel. Backend: Supabase project "lifelog" (`jpsisvaprkrcyvwnmasb`), anon key, RLS "own rows" policies. `HANDOFF.md` / `SESSION_SUMMARY*.md` are old (June, v2.6) — ignore them. Setup SQL history: `SUPABASE-SETUP.md`.

## Status: v2.17.0 is LIVE (shipped 2026-11-21)
- Sync rebuilt: one Supabase row per entry (`nutrilog_entries`) and per food (`nutrilog_foods`), uuid ids, `extra` jsonb for extra fields, realtime updates. Old per-day JSON blobs are no longer written by v2.17.0.
- Migration done and verified: 4,073 entries + 420 foods. Backups are in `../nutrilog-backups/` (outside the repo).
- Desktop release: https://github.com/alxkim97/nutrilog/releases/tag/v2.17.0 (an installed app updates itself on open). Phone: Vercel auto-deploys from `main`.
- **Not yet confirmed:** an end-to-end check on real devices (log on phone → appears on desktop, delete → disappears). The parents' PC still runs the old version until the app is opened; until then it writes only to the old tables.

## How the data layer works (don't re-break this)
- `src/rowsShape.js`: entry/food <-> row conversion, id assignment, diffs. Tested in `test/` (`npm test`, 16 tests).
- Desktop (`src/desktop/cloudStore.js`): keeps an in-memory copy; saves are diffed by id (upsert new, update changed, delete missing). Rows from other devices are never touched. Invariant: after a save, `S.days[date]` is exactly what was sent; other devices' rows enter only via peekDay/acceptDay when nothing is unsaved. A mass-delete guard blocks saves that would empty 31+ days.
- Phone (`src/supabase.js`, `src/mealOps.js`, `src/main.js`): reads/writes rows directly, `subscribeChanges` for realtime, read-only offline cache in `src/cache.js`.
- Still blobs with three-way merges: settings, templates, recipes, check-ins.
- Optional per-entry fields in grams: `sugar`, `addedSugar`, `satFat` (unknown = missing, never 0).
- Never run SQL, `--apply`, or any write against the user's cloud data without them typing their own password. Do NOT accept passwords in chat. Scripts prompt for the password (hidden) and sign in themselves (see `scripts/migrate-to-rows.mjs`).

## Release steps
`npm test` -> commit + push (Vercel) -> `npm run release` (needs `gh` logged in; installed 2026-11-21 via winget, so open a new terminal). Version lives in `package.json`.

## Next steps (agreed order)
1. Verify v2.17.0 on real devices (see above); watch for duplicate/missing entries for a day or two.
2. **Phase C cleanup:** dead stubs in `src/desktop/legacy-app.js` (~lines 406-426: `sbGet`/`sbSet`, `touchHistDate`, `history_meta`), the "Open Local Data Folder" menu item (the eggs folder still lives there), root `main.js` + `preload.js` (the app uses `main.cjs`/`preload.cjs`), the MODULE_TYPELESS_PACKAGE_JSON warning (add `"type": "module"`? check electron build first), archive old AppData JSON files. Optional: delete leftover profiles `alex_1`, `alex_kim`, `me`.
3. **Food database filter + reorganise (like Vetted):** column sort, show/hide/reorder columns, per-column filters/chips, group by type, saved layout.
4. **Recipes with yield:** build a food from ingredients + servings, show with the Thai/English "Nutrition information" label in the current Aura style. Re-add "Homemade Muesli Mix" (1 kg Aro muesli + 7 tbsp rice bran oil + 7 tbsp honey, 1 tbsp = 32 kcal ~ 8 g) — it never reached the cloud library.
5. Undo/redo.
6. **Claude access like Coin:** user taps "Give Claude access" -> temporary scoped key (e.g. 1 hour, revocable, own data only, with a change log). Wanted by the user; suggested to build before item 3.

## Pending data fixes (user to run, needs their password)
- `node scripts/add-fish-chip.mjs`: adds "Aro Fish Chip (1 piece, est.)" (115 kcal, 4 P, 6.5 F, 9.5 C, sugar 2, satFat 3.5 per est. 50 g piece) and logs 3 pieces today. Check whether it was already run before running again (food is skipped if present, but the entry would be logged twice).
- The "Chicken Veggie Blend (2.5 /1) - Leg" meal: the leg-trimmings (เศษน่องไก่) entry is ~120 kcal/100 g, which is skinless-lean; real trimmings with skin are likely 160-250. Suggested middle value ~170 kcal / 18 P / 11 F per 100 g. Waiting on which entry to change.

## Look
Keep the current Aura theme. Only the "Nutrition information" label from the redesign preview was liked.

## Working preferences
Suggest a model + effort after each new request and wait for "go" (global setting). Typing "เน" is "go" on a Thai keyboard layout. Windows; shell is PowerShell/Git Bash.
