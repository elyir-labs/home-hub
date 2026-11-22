// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/*
 * Photos on the TV, from a phone (design/tv-photos/, A with C, decided 20 November 2026).
 *
 * A photo leaves the phone already redrawn: no longer than the TV needs, turned the right way up, and as a
 * fresh JPEG, which carries none of the original's metadata -- above all not where it was taken. The one
 * thing kept is when it was taken, read here from the original and sent beside it, because that is the line
 * the TV shows under it.
 */
import type { ShownScreen } from './api'
import type { Photo } from './restTv'

export const LONGEST = 3840   // a 4K TV fills 3840 across; a photo made smaller is stretched on one

/** The size to redraw at: the same shape, no edge longer than LONGEST, never larger than it was. */
export function fitted(w: number, h: number, longest = LONGEST): { w: number; h: number } {
  const k = Math.min(1, longest / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/** When a JPEG says it was taken (EXIF DateTimeOriginal), in seconds, or null. Reads the camera's own clock as local time. */
export function takenAt(buf: ArrayBuffer): number | null {
  const v = new DataView(buf)
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null
  let at = 2
  while (at + 4 <= v.byteLength) {
    const marker = v.getUint16(at), size = v.getUint16(at + 2)
    if (marker === 0xffe1 && at + 10 <= v.byteLength && v.getUint32(at + 4) === 0x45786966) return fromTiff(v, at + 10)
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null
    at += 2 + size
  }
  return null
}

function fromTiff(v: DataView, base: number): number | null {
  if (base + 8 > v.byteLength) return null
  const little = v.getUint16(base) === 0x4949
  const u16 = (o: number) => v.getUint16(base + o, little), u32 = (o: number) => v.getUint32(base + o, little)
  const find = (ifd: number, tag: number): number | null => {
    if (base + ifd + 2 > v.byteLength) return null
    const n = u16(ifd)
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12
      if (base + e + 12 > v.byteLength) return null
      if (u16(e) === tag) return e
    }
    return null
  }
  const exifPtr = find(u32(4), 0x8769)
  if (exifPtr === null) return null
  const entry = find(u32(exifPtr + 8), 0x9003)
  if (entry === null || u32(entry + 4) < 19) return null
  const off = u32(entry + 8)
  if (base + off + 19 > v.byteLength) return null
  const text = String.fromCharCode(...new Uint8Array(v.buffer, v.byteOffset + base + off, 19))
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text)
  if (!m) return null
  const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime()
  return Number.isFinite(t) && +m[1] > 1900 ? t / 1000 : null
}

export type Prepared = { blob: Blob; w: number; h: number; taken: number | null }

/** A picked photo, ready to send. The browser turns it upright when it draws it, as it does on screen. */
export async function prepare(file: File): Promise<Prepared> {
  const head = await file.slice(0, 256 * 1024).arrayBuffer()
  const taken = takenAt(head)
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const size = fitted(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = size.w; canvas.height = size.h
    canvas.getContext('2d')!.drawImage(img, 0, 0, size.w, size.h)
    const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, 'image/jpeg', 0.86))
    if (!blob) throw new Error('That photo couldn’t be read.')
    return { blob, ...size, taken }
  } catch (e: any) {
    throw new Error(e?.message?.startsWith('That') ? e.message : 'That photo couldn’t be read.', { cause: e })
  } finally { URL.revokeObjectURL(url) }
}

/** "12 photos" and "from 3 phones", for the line over the grid. */
export function countLine(photos: Photo[]): { count: string; from: string } {
  const phones = new Set(photos.map(p => p.by ?? '')).size
  return { count: photos.length === 1 ? '1 photo' : `${photos.length} photos`, from: phones === 1 ? 'from 1 phone' : `from ${phones} phones` }
}

/** "From Jordan's iPhone · sent on Tuesday": whose phone, and when it was sent, as a day this week or a date. */
export function sentLine(p: Photo, now = new Date(), locale?: string): string {
  const at = new Date(p.added * 1000)
  const days = (new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86400000
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 7 ? `on ${at.toLocaleDateString(locale, { weekday: 'long' })}`
    : `on ${at.toLocaleDateString(locale, { month: 'long', day: 'numeric' })}`
  return p.by ? `From ${p.by} · sent ${when}` : `Sent ${when}`
}

/** A screen on Photos: "Living room TV" for a TV, the room's name for a wall screen, and what it shows at rest when
    its switch is off (design/which-tv/, C). */
export function screenLines(s: ShownScreen): { name: string; sub: string } {
  const name = s.room_name ? (s.tv ? `${s.room_name} TV` : s.room_name) : (s.tv ? 'A TV' : 'A screen on the wall')
  const kind = s.tv ? 'A TV' : 'A screen on the wall'
  const showing = s.shows === 'board' ? 'the family board' : s.shows === 'art' ? 'paintings'
    : s.photos ? (s.play === 'each' ? 'photos, one after another' : 'photos, day by day') : (s.tv ? 'the sky' : 'the clock')
  return { name, sub: `${kind} · shows ${showing}` }
}

/** What the Art switch says under it, and the line under the switches about the download (design/tv-art/PhoneEvery):
    how many paintings and from where, then how big the download is, how far it has got, or that it did not work. */
export function artLines(a: { have: number; of: number; bytes: number; getting: boolean; failed: boolean }, wanted: boolean): { sub: string; foot: string } {
  const sub = `A painting every few photos · ${a.of} from museums’ free collections`
  const mb = Math.max(1, Math.round(a.bytes / 1e6))
  if (a.getting) return { sub, foot: `Getting the paintings: ${a.have} of ${a.of}.` }
  if (wanted && a.failed) return { sub, foot: 'Some paintings didn’t download. The hub tries again in an hour.' }
  if (wanted && a.have >= a.of) return { sub, foot: `The paintings are on the hub, about ${mb} MB. Turning art off on every screen frees the room again.` }
  return { sub, foot: `The first time any screen turns art on, the hub downloads the paintings once, about ${mb} MB. Turning art off on every screen frees the room again.` }
}

/** When a note comes down, in this phone's own day: the end of tonight, the end of tomorrow, or never. */
export type Until = 'tonight' | 'tomorrow' | 'down'
export function untilFor(u: Until, now = new Date()): number | null {
  if (u === 'down') return null
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (u === 'tonight' ? 1 : 2))
  return end.getTime() / 1000
}

/** A countdown named for a birthday or an anniversary comes round every year; the hub reads the name the same way. */
export const yearly = (what: string) => /\b(birthday|anniversary)\b/i.test(what)

/** The morning a line left now greets: tomorrow's, or this morning's when it is still the small hours. */
export function morningFor(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (now.getHours() < 4 ? 0 : 1))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A note's line on the phone: until when, and whose. */
export function noteLine(until: number | null, by: string | null, now = new Date()): string {
  const when = until === null ? 'until somebody takes it down' : new Date(until * 1000).getDate() === new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getDate() ? 'until tonight' : 'until tomorrow night'
  return by ? `${when} · from ${by}` : when
}

/** Where a phone's camera is sent from the TV's code: this page, on the address the phone can reach. */
export function photosPageUrl(loc: { protocol: string; host: string; hostname: string } = location): string {
  const here = loc.hostname.endsWith('.local') || /^\d+\.\d+\.\d+\.\d+$/.test(loc.hostname) ? `${loc.protocol}//${loc.host}` : 'http://hub.local'
  return `${here}/?sheet=photos`
}
