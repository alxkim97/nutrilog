import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exifTakenAt, parseExifDate, pickTakenAt } from '../src/exif.js'

// Builds a minimal JPEG: SOI + APP1("Exif\0\0" + TIFF) with IFD0 → Exif IFD.
function fakeJpeg({ le = true, original, digitized, dateTime, prefix = [0xff, 0xd8, 0xff, 0xe1, 0x00, 0x00] } = {}) {
  const tiff = []
  const u16 = v => le ? [v & 255, v >> 8] : [v >> 8, v & 255]
  const u32 = v => le ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24] : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255]
  const ascii = s => [...s].map(c => c.charCodeAt(0)).concat(0)
  const ifd0Tags = [[0x8769, 4, 1, null]] // value patched below
  if (dateTime) ifd0Tags.unshift([0x0132, 2, 20, dateTime])
  const subTags = []
  if (original) subTags.push([0x9003, 2, 20, original])
  if (digitized) subTags.push([0x9004, 2, 20, digitized])

  const ifd0At = 8
  const ifd0Size = 2 + ifd0Tags.length * 12 + 4
  const subAt = ifd0At + ifd0Size
  const subSize = 2 + subTags.length * 12 + 4
  let dataAt = subAt + subSize
  const data = []
  const entry = ([tag, type, count, val]) => {
    if (tag === 0x8769) return [...u16(tag), ...u16(type), ...u32(count), ...u32(subAt)]
    const off = dataAt; dataAt += 20; data.push(...ascii(val))
    return [...u16(tag), ...u16(type), ...u32(count), ...u32(off)]
  }
  tiff.push(...(le ? [0x49, 0x49, 0x2a, 0] : [0x4d, 0x4d, 0, 0x2a]), ...u32(ifd0At))
  tiff.push(...u16(ifd0Tags.length), ...ifd0Tags.flatMap(entry), ...u32(0))
  tiff.push(...u16(subTags.length), ...subTags.flatMap(entry), ...u32(0))
  tiff.push(...data)
  const exifHeader = [0x45, 0x78, 0x69, 0x66, 0, 0]
  return new Uint8Array([...prefix, ...exifHeader, ...tiff, 0xff, 0xd9])
}

test('reads DateTimeOriginal as local time (little-endian)', () => {
  const d = exifTakenAt(fakeJpeg({ original: '2026:11:28 12:41:07', dateTime: '2026:11:29 09:00:00' }))
  assert.equal(d.getTime(), new Date(2026, 10, 28, 12, 41, 7).getTime())
})

test('big-endian, falls back to DateTimeDigitized then DateTime', () => {
  assert.equal(exifTakenAt(fakeJpeg({ le: false, digitized: '2026:01:02 03:04:05' })).getTime(), new Date(2026, 0, 2, 3, 4, 5).getTime())
  assert.equal(exifTakenAt(fakeJpeg({ dateTime: '2025:12:31 23:59:00' })).getTime(), new Date(2025, 11, 31, 23, 59, 0).getTime())
})

test('finds the Exif block inside other containers (e.g. HEIC)', () => {
  const d = exifTakenAt(fakeJpeg({ original: '2026:11:28 08:15:00', prefix: [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 6] }))
  assert.equal(d.getTime(), new Date(2026, 10, 28, 8, 15, 0).getTime())
})

test('no EXIF, blank or garbage dates → null', () => {
  assert.equal(exifTakenAt(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), null)
  assert.equal(exifTakenAt(fakeJpeg({ original: '0000:00:00 00:00:00' })), null)
  assert.equal(exifTakenAt(new Uint8Array(0)), null)
  assert.equal(parseExifDate('2026:13:01 00:00:00'), null)
  assert.equal(parseExifDate('    :  :     :  :  '), null)
})

test('pickTakenAt: exif → file date → upload time', () => {
  const now = new Date(2026, 10, 28, 13, 0)
  const exif = new Date(2026, 10, 28, 12, 41)
  assert.deepEqual(pickTakenAt({ exif, lastModified: now - 1000, now }), { takenAt: exif, source: 'exif' })
  const file = new Date(2026, 10, 28, 12, 30)
  assert.deepEqual(pickTakenAt({ exif: null, lastModified: file.getTime(), now }), { takenAt: file, source: 'file' })
  // file date too old (copied/saved image) or in the future → upload time
  assert.equal(pickTakenAt({ exif: null, lastModified: new Date(2026, 8, 1).getTime(), now }).source, 'upload')
  assert.equal(pickTakenAt({ exif: null, lastModified: new Date(2026, 10, 29).getTime(), now }).source, 'upload')
  assert.equal(pickTakenAt({ exif: new Date(2026, 11, 5), lastModified: 0, now }).source, 'upload')
})
