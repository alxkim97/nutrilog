# NutriLog — Electron Desktop App

Personal macro tracker desktop application.

## npm Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies (once, or after pulling changes) |
| `npm run dev` | Run with DevTools open |
| `npm start` | Launch the app normally |
| `npm run build:win` | Build Windows installer → `dist/NutriLog Setup 1.0.0.exe` |
| `npm run build:mac` | Build macOS installer → `dist/NutriLog-1.0.0.dmg` (must run on macOS) |
| `npm run build:linux` | Build Linux AppImage → `dist/NutriLog-1.0.0.AppImage` |
| `npm run publish` | Build + publish an auto-update release |

There's no plain `npm run build` — pick the platform-specific one. See the
full [npm cheat sheet](../../NPM-CHEATSHEET.md) for how this compares to
other projects.

### Prerequisites
- **Node.js** v18 or later — https://nodejs.org
- **npm** (comes with Node.js)

---

## Data Storage

All your data is stored locally on your machine:

| OS | Location |
|----|----------|
| **Windows** | `%APPDATA%\NutriLog\NutriLogData\` |
| **macOS** | `~/Library/Application Support/NutriLog/NutriLogData/` |
| **Linux** | `~/.config/NutriLog/NutriLogData/` |

Files:
- `sessions.json` — Today's meal log
- `settings.json` — Personal targets & profile
- `foodlib.json` — Your food database (301 items pre-loaded)
- `history.json` — All past daily logs

You can open the data folder from **Help → Open Data Folder** in the app.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` / `Cmd+S` | Save session |
| `Ctrl+Enter` | Submit form (in Add Meal modal) |
| `Ctrl+1` | Go to Today |
| `Ctrl+2` | Go to History |
| `Ctrl+3` | Go to Food Database |
| `Ctrl+4` | Go to Settings |
| `Ctrl+T` | Toggle dark/light mode |
| `Escape` | Close any modal |
| `↑ ↓` | Navigate autocomplete list |

---

## Project Structure

```
nutrilog-electron/
├── main.js          # Main process (window, menus, file I/O)
├── preload.js       # Secure IPC bridge
├── package.json     # Dependencies & build config
├── assets/
│   ├── icon.png     # App icon (Linux / general)
│   └── icon.ico     # App icon (Windows)
├── src/
│   └── index.html   # The full app (self-contained)
└── dist/            # Built installers (after npm run build:*)
```

---

## Version History

| Version | Date | Notes |
|---------|------|-------|
| 1.0.0 | 2026-04-30 | Initial release |
