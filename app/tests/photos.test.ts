// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Photos on the TV from a phone (design/tv-photos/, A with C, decided 20 November 2026): what a photo is redrawn
   to before it leaves, when it says it was taken, and the page's words. */
import { describe, expect, it } from 'vitest'
import { countLine, fitted, LONGEST, noteLine, photosPageUrl, screenLines, sentLine, takenAt, untilFor, yearly } from '../src/photos'
import type { Photo } from '../src/restTv'

/** A JPEG's first bytes with one EXIF date in it, big-endian, laid out the way a camera writes it. */
function exifJpeg(date: string, little = false): ArrayBuffer {
  const tiff = new DataView(new ArrayBuffer(64))
  const u16 = (o: number, v: number) => tiff.setUint16(o, v, little), u32 = (o: number, v: number) => tiff.setUint32(o, v, little)
  tiff.setUint16(0, little ? 0x4949 : 0x4d4d); u16(2, 42); u32(4, 8)
  u16(8, 1); u16(10, 0x8769); u16(12, 4); u32(14, 1); u32(18, 26); u32(22, 0)
  u16(26, 1); u16(28, 0x9003); u16(30, 2); u32(32, 20); u32(36, 44); u32(40, 0)
  for (let i = 0; i < date.length; i++) tiff.setUint8(44 + i, date.charCodeAt(i))
  const out = new Uint8Array(4 + 2 + 6 + 64)
  out.set([0xff, 0xd8, 0xff, 0xe1, 0, 72, 0x45, 0x78, 0x69, 0x66, 0, 0]); out.set(new Uint8Array(tiff.buffer), 12)
  return out.buffer
}
const photo = (over: Partial<Photo> = {}): Photo => ({ id: 'a', taken: null, added: 0, by: null, ...over })

describe('a photo leaving the phone', () => {
  it('is redrawn no longer than the TV needs, the same shape, and never made larger', () => {
    expect(fitted(4032, 3024)).toEqual({ w: LONGEST, h: 1536 })
    expect(fitted(3024, 4032)).toEqual({ w: 1536, h: LONGEST })
    expect(fitted(800, 600)).toEqual({ w: 800, h: 600 })
  })

  it('takes when it was taken from the camera, read as the camera\'s own clock, in either byte order', () => {
    const want = new Date(2025, 7, 14, 18, 30, 0).getTime() / 1000
    expect(takenAt(exifJpeg('2025:08:14 18:30:00'))).toBe(want)
    expect(takenAt(exifJpeg('2025:08:14 18:30:00', true))).toBe(want)
  })

  it('knows no date rather than a wrong one', () => {
    expect(takenAt(exifJpeg('0000:00:00 00:00:00'))).toBeNull()
    expect(takenAt(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull()
    expect(takenAt(exifJpeg('2025:08:14 18:30:00').slice(0, 40))).toBeNull()
  })
})

describe('the page\'s words', () => {
  it('counts the photos and the phones they came from', () => {
    expect(countLine([photo({ by: "Sam's phone" }), photo({ by: "Sam's phone" }), photo({ by: "Jordan's iPhone" })])).toEqual({ count: '3 photos', from: 'from 2 phones' })
    expect(countLine([photo({ by: "Sam's phone" })])).toEqual({ count: '1 photo', from: 'from 1 phone' })
  })

  it('says whose phone and when it was sent: today, yesterday, a day this week, then a date', () => {
    const now = new Date(2026, 10, 20, 19, 40)
    const sent = (d: Date) => sentLine(photo({ by: "Jordan's iPhone", added: d.getTime() / 1000 }), now, 'en-US')
    expect(sent(new Date(2026, 10, 20, 9))).toBe("From Jordan's iPhone · sent today")
    expect(sent(new Date(2026, 10, 19, 23))).toBe("From Jordan's iPhone · sent yesterday")
    expect(sent(new Date(2026, 10, 17, 12))).toBe("From Jordan's iPhone · sent on Tuesday")
    expect(sent(new Date(2026, 10, 3, 12))).toBe("From Jordan's iPhone · sent on November 3")
  })
})

describe('the TV\'s code (C)', () => {
  it('opens Photos on the TV on the address a phone can reach', () => {
    expect(photosPageUrl({ protocol: 'http:', host: 'hub.local', hostname: 'hub.local' })).toBe('http://hub.local/?sheet=photos')
    expect(photosPageUrl({ protocol: 'http:', host: '192.168.1.20:80', hostname: '192.168.1.20' })).toBe('http://192.168.1.20:80/?sheet=photos')
    expect(photosPageUrl({ protocol: 'http:', host: 'localhost', hostname: 'localhost' })).toBe('http://hub.local/?sheet=photos')
  })
})

describe('the screens on Photos (design/which-tv/, C)', () => {
  const screen = (over: object) => ({ id: 'a', room: 'living', room_name: 'Living room', tv: true, by: 'screen' as const, photos: true, ...over })
  it('names a TV by its room and a wall screen by its own, and says what each shows when its photos are off', () => {
    expect(screenLines(screen({}))).toEqual({ name: 'Living room TV', sub: 'A TV · shows photos, day by day' })
    expect(screenLines(screen({ play: 'each' }))).toEqual({ name: 'Living room TV', sub: 'A TV · shows photos, one after another' })
    expect(screenLines(screen({ photos: false }))).toEqual({ name: 'Living room TV', sub: 'A TV · shows the sky' })
    expect(screenLines(screen({ room_name: 'Hallway', tv: false, photos: false }))).toEqual({ name: 'Hallway', sub: 'A screen on the wall · shows the clock' })
    expect(screenLines(screen({ room_name: null, tv: false })).name).toBe('A screen on the wall')
  })
})

describe('writing a note or a countdown on a phone (design/tv-moments/WriteEvery)', () => {
  const now = new Date(2026, 10, 20, 19, 40)
  it('works out tonight and tomorrow in the phone\'s own day', () => {
    expect(untilFor('tonight', now)).toBe(new Date(2026, 10, 21).getTime() / 1000)
    expect(untilFor('tomorrow', now)).toBe(new Date(2026, 10, 22).getTime() / 1000)
    expect(untilFor('down', now)).toBeNull()
    expect(noteLine(untilFor('tonight', now), "Mom's phone", now)).toBe("until tonight · from Mom's phone")
    expect(noteLine(untilFor('tomorrow', now), null, now)).toBe('until tomorrow night')
    expect(noteLine(null, null, now)).toBe('until somebody takes it down')
  })
  it('knows a birthday or an anniversary comes round every year', () => {
    expect([yearly("Sam's birthday"), yearly('Our anniversary'), yearly('The lake trip'), yearly('Birthdays party')]).toEqual([true, true, false, false])
  })
  it('names a screen resting on the family board', () => {
    expect(screenLines({ id: 'a', room: 'kitchen', room_name: 'Kitchen', tv: false, by: 'screen', photos: false, shows: 'board' }).sub).toBe('A screen on the wall · shows the family board')
  })
})
