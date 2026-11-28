// When was this photo taken? Reads EXIF DateTimeOriginal (or DateTimeDigitized,
// then DateTime) straight from the file bytes — no library. Works for JPEG and
// for HEIC/other containers that embed a standard "Exif\0\0" + TIFF block.
// EXIF times carry no time zone; they're the camera's local clock, so they are
// read as local time on this device.

const SCAN_LIMIT = 512 * 1024 // EXIF sits near the start of the file

const TAG_EXIF_IFD = 0x8769
const TAG_DATETIME = 0x0132
const TAG_ORIGINAL = 0x9003
const TAG_DIGITIZED = 0x9004

// Offset of the TIFF header ("II*\0" / "MM\0*") that follows an "Exif\0\0" marker.
function findTiff(bytes) {
  const end = Math.min(bytes.length, SCAN_LIMIT) - 10
  for (let i = 0; i < end; i++) {
    if (bytes[i] === 0x45 && bytes[i + 1] === 0x78 && bytes[i + 2] === 0x69 && bytes[i + 3] === 0x66 &&
        bytes[i + 4] === 0 && bytes[i + 5] === 0) {
      const t = i + 6
      const le = bytes[t] === 0x49 && bytes[t + 1] === 0x49 && bytes[t + 2] === 0x2a && bytes[t + 3] === 0
      const be = bytes[t] === 0x4d && bytes[t + 1] === 0x4d && bytes[t + 2] === 0 && bytes[t + 3] === 0x2a
      if (le || be) return { start: t, le }
    }
  }
  return null
}

function readIfd(view, tiff, offset, le, wanted) {
  const out = {}
  if (offset + 2 > view.byteLength - tiff) return out
  const count = view.getUint16(tiff + offset, le)
  for (let n = 0; n < count; n++) {
    const p = tiff + offset + 2 + n * 12
    if (p + 12 > view.byteLength) break
    const tag = view.getUint16(p, le)
    if (!wanted.includes(tag)) continue
    const type = view.getUint16(p + 2, le)
    const len = view.getUint32(p + 4, le)
    if (tag === TAG_EXIF_IFD) { out[tag] = view.getUint32(p + 8, le); continue }
    if (type !== 2 || len < 19) continue // ASCII "YYYY:MM:DD HH:MM:SS\0"
    const at = len > 4 ? tiff + view.getUint32(p + 8, le) : p + 8
    if (at + 19 > view.byteLength) continue
    let s = ''
    for (let k = 0; k < 19; k++) s += String.fromCharCode(view.getUint8(at + k))
    out[tag] = s
  }
  return out
}

// "2026:11:28 12:41:07" → local Date, or null for blanks / zeros / garbage.
export function parseExifDate(s) {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(s || '').trim())
  if (!m) return null
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number)
  if (y < 1990 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null
  const date = new Date(y, mo - 1, d, h, mi, se)
  return isNaN(date) ? null : date
}

// ArrayBuffer (or Uint8Array) of the start of an image file → Date | null.
export function exifTakenAt(buffer) {
  try {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    const found = findTiff(bytes)
    if (!found) return null
    const { start: tiff, le } = found
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const ifd0 = readIfd(view, tiff, view.getUint32(tiff + 4, le), le, [TAG_EXIF_IFD, TAG_DATETIME])
    const sub = ifd0[TAG_EXIF_IFD] ? readIfd(view, tiff, ifd0[TAG_EXIF_IFD], le, [TAG_ORIGINAL, TAG_DIGITIZED]) : {}
    return parseExifDate(sub[TAG_ORIGINAL]) || parseExifDate(sub[TAG_DIGITIZED]) || parseExifDate(ifd0[TAG_DATETIME])
  } catch {
    return null
  }
}

// Best guess for when the food was eaten: photo EXIF → file's modified time →
// now. A file time from the future, or one more than 30 days old (copied
// files often carry odd dates), isn't trusted.
export function pickTakenAt({ exif, lastModified, now = new Date() }) {
  const ok = d => d && !isNaN(d) && d <= new Date(now.getTime() + 5 * 60 * 1000)
  if (ok(exif)) return { takenAt: exif, source: 'exif' }
  const file = lastModified ? new Date(lastModified) : null
  if (ok(file) && now - file < 30 * 24 * 3600 * 1000) return { takenAt: file, source: 'file' }
  return { takenAt: now, source: 'upload' }
}
