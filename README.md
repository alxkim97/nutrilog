# NutriLog — Electron Desktop App

Personal macro tracker desktop application.

## Quick Start

### Prerequisites
- **Node.js** v18 or later — https://nodejs.org
- **npm** (comes with Node.js)

### Install & Run

```bash
# 1. Install dependencies (first time only, ~2 min)
npm install

# 2. Launch the app
npm start
```

That's it. The app opens in its own window.

---

## Building Installers

### Windows (.exe installer)
```bash
npm run build:win
```
Output: `dist/NutriLog Setup 1.0.0.exe`

### macOS (.dmg)
```bash
npm run build:mac
```
Output: `dist/NutriLog-1.0.0.dmg`

### Linux (.AppImage)
```bash
npm run build:linux
```
Output: `dist/NutriLog-1.0.0.AppImage`

> **Note:** Building for Windows requires running on Windows or using a CI service.
> Building for macOS requires running on macOS (Apple code-signing).

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

## Development

```bash
# Run with DevTools open
npm run dev
```

---

## Version History

| Version | Date | Notes |
|---------|------|-------|
| 1.0.0 | 2026-04-30 | Initial release |
