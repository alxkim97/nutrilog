// Publishes the already-built installer (npm run electron:build) as a GitHub
// Release, which is what every installed NutriLog's auto-updater checks.
//
// Usage: node scripts/publish-release.mjs "release notes text"
//
// latest.yml (what electron-updater reads) names the installer
// NutriLog-Setup-<version>.exe with dashes, so files are uploaded under those
// names. Needs the GitHub CLI (gh) logged in with the 'repo' scope.
import { readFileSync, copyFileSync, mkdtempSync, existsSync } from 'fs'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const notes = process.argv[2] || `NutriLog v${version} for Windows.`
const gh = existsSync('C:\\Program Files\\GitHub CLI\\gh.exe') ? 'C:\\Program Files\\GitHub CLI\\gh.exe' : 'gh'

const latest = readFileSync(join(root, 'release', 'latest.yml'), 'utf8')
if (!latest.includes(`version: ${version}\n`) && !latest.includes(`version: ${version}\r\n`)) {
  console.error(`release/latest.yml isn't for ${version} — run npm run electron:build first`)
  process.exit(1)
}

const stage = mkdtempSync(join(tmpdir(), 'nutrilog-release-'))
const files = [
  [`NutriLog Setup ${version}.exe`, `NutriLog-Setup-${version}.exe`],
  [`NutriLog Setup ${version}.exe.blockmap`, `NutriLog-Setup-${version}.exe.blockmap`],
  ['latest.yml', 'latest.yml'],
].map(([from, to]) => { copyFileSync(join(root, 'release', from), join(stage, to)); return join(stage, to) })

const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim()
execFileSync(gh, ['release', 'create', `v${version}`, '--target', sha, '--title', version, '--notes', notes, ...files], { cwd: root, stdio: 'inherit' })
