// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A TV at rest, as design/rest-tv/ decided on 20 November 2026: A (the household's photos), with C (the sky) until
   there are photos, B (what's playing) while music plays, and E (Bedtime) at bedtime. These fail on purpose if
   which face wins, or what Bedtime lists and says, drifts from the boards. */
import { describe, expect, it } from 'vitest'
import type { Device, Room } from '../src/api'
import { atBedtime, drift, faceFor, bedtimeLine, photoLine, playingNow, playingRooms, position, slideAt, slides, stillOn,
  type Photo } from '../src/restTv'
import { store } from '../src/store'

const at = (h: number, m = 0) => { const d = new Date(2026, 10, 20, h, m); return d }
const dev = (id: string, room: string, capability: string, state: string, attrs: Record<string, any> = {}, name = id): Device =>
  ({ id, name, room_id: room, capability, state, attrs })
const room = (id: string, name: string, devices: Device[]): Room => ({ id, name, devices, intent: 'unknown', set_by: null, hold_until: null })
const photo = (id: string, w?: number, h?: number, extra: Partial<Photo> = {}): Photo => ({ id, taken: null, added: 0, by: null, w, h, ...extra })

describe('which face a resting TV shows', () => {
  const base = { playing: false, stillOn: 0, photos: 3, now: at(19, 40), notYet: false }

  it('is the photos, and the sky only until somebody has sent one', () => {
    expect(faceFor(base)).toBe('photos')
    expect(faceFor({ ...base, photos: 0 })).toBe('window')
  })

  it('is the music whenever music is playing, at any hour, over everything else', () => {
    expect(faceFor({ ...base, playing: true })).toBe('playing')
    expect(faceFor({ ...base, playing: true, stillOn: 4, now: at(23, 0) })).toBe('playing')
  })

  it('is Bedtime from 10:30 PM to 4 AM, only while something is still on, and not after Not yet', () => {
    expect(faceFor({ ...base, stillOn: 2, now: at(22, 29) })).toBe('photos')
    expect(faceFor({ ...base, stillOn: 2, now: at(22, 30) })).toBe('bedtime')
    expect(faceFor({ ...base, stillOn: 2, now: at(3, 59) })).toBe('bedtime')
    expect(faceFor({ ...base, stillOn: 2, now: at(4, 0) })).toBe('photos')
    expect(faceFor({ ...base, stillOn: 0, now: at(23, 0) })).toBe('photos')
    expect(faceFor({ ...base, stillOn: 2, now: at(23, 0), notYet: true })).toBe('photos')
    expect([at(22, 30), at(0, 0), at(12, 0)].map(atBedtime)).toEqual([true, true, false])
  })
})

describe('the photos', () => {
  it('show a wide one alone and two taken upright side by side', () => {
    const list = [photo('a', 1080, 1440), photo('b', 1080, 1440), photo('c', 1920, 1080), photo('d', 1080, 1440)]
    expect(slides(list).map(s => s.map(p => p.id))).toEqual([['a', 'b'], ['c'], ['d']])
  })

  it('learn the shape of a photo whose size was not sent from the TV opening it', () => {
    const list = [photo('a'), photo('b')]
    expect(slides(list)).toHaveLength(2)
    expect(slides(list, { a: 'tall', b: 'tall' })).toHaveLength(1)
  })

  it('change once a minute and come round again', () => {
    expect([0, 59_999, 60_000, 180_000].map(t => slideAt(['x', 'y', 'z'], t))).toEqual(['x', 'x', 'y', 'x'])
    expect(slideAt([], 0)).toBeNull()
  })

  it('say when each was taken and whose phone it came from', () => {
    const taken = new Date(2025, 7, 14).getTime() / 1000
    expect(photoLine(photo('a', 1, 1, { taken, by: "Sam's phone" }), 'en-US')).toBe("August 2025 · from Sam's phone")
    expect(photoLine(photo('a', 1, 1, { added: taken }), 'en-US')).toBe('August 2025')
  })
})

describe('nothing holds still', () => {
  it('moves everything a few pixels every minute, and trades sides every hour', () => {
    const spots = new Set(Array.from({ length: 10 }, (_, i) => JSON.stringify(drift(at(19, i)))))
    expect(spots.size).toBeGreaterThan(5)
    for (let i = 0; i < 60; i++) { const d = drift(at(19, i)); expect(Math.abs(d.x)).toBeLessThanOrEqual(14); expect(Math.abs(d.y)).toBeLessThanOrEqual(10) }
    expect(drift(at(19, 0)).flip).not.toBe(drift(at(20, 0)).flip)
  })
})

describe('what is playing', () => {
  it('is a speaker playing music, never the TV\'s own film, and names every room it is in', () => {
    const tv = dev('m1', 'living', 'media', 'playing', { media_title: 'A film' })
    const kitchen = dev('s2', 'kitchen', 'media', 'playing', { music: true, together: ['s1'] })
    const living = dev('s1', 'living', 'media', 'playing', { music: true })
    store.rooms = [room('living', 'Living room', [tv, living]), room('kitchen', 'Kitchen', [kitchen])]
    expect(playingNow()?.id).toBe('s1')
    expect(playingRooms(kitchen)).toEqual(['Living room', 'Kitchen'])
    store.rooms = [room('living', 'Living room', [tv])]
    expect(playingNow()).toBeNull()
  })

  it('knows how far the song has got since the speaker last said', () => {
    const d = dev('s1', 'living', 'media', 'playing', { music: true, media_position: 100, media_duration: 337, media_position_updated_at: new Date(1_000_000).toISOString() })
    expect(position(d, 1_035_000)).toEqual({ at: 135, of: 337 })
    expect(position({ ...d, state: 'paused' }, 1_035_000)).toEqual({ at: 100, of: 337 })
    expect(position(dev('x', 'l', 'media', 'playing', { music: true }), 0)).toBeNull()
  })
})

describe('Bedtime', () => {
  it('lists the lights by room, then the music, then the doors left unlocked', () => {
    store.rooms = [
      room('kitchen', 'Kitchen', [dev('l1', 'kitchen', 'light', 'on'), dev('l2', 'kitchen', 'light', 'on'), dev('s', 'kitchen', 'media', 'playing', { music: true }, 'Kitchen speaker')]),
      room('office', 'Office', [dev('l3', 'office', 'light', 'on', {}, 'Desk lamp'), dev('l4', 'office', 'light', 'off')]),
      room('back', 'Backyard', [dev('k', 'back', 'lock', 'unlocked', {}, 'Back door')]),
    ]
    const left = stillOn()
    expect(left.map(s => [s.name, s.what])).toEqual([['Kitchen', '2 lights'], ['Office', 'Desk lamp'], ['Kitchen speaker', 'Playing'], ['Back door', 'Unlocked']])
    expect(bedtimeLine(left)).toBe('The lights off, the back door locked, the music stopped')
  })

  it('says only what it will do', () => {
    expect(bedtimeLine([{ name: 'Office', what: 'Desk lamp', kind: 'light' }])).toBe('The lights off')
  })
})
