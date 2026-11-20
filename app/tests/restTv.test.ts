// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A TV at rest, as design/rest-tv/ decided on 20 November 2026: A (the household's photos), with C (the sky) until
   there are photos, B (what's playing) while music plays, and E (Bedtime) at bedtime. These fail on purpose if
   which face wins, or what Bedtime lists and says, drifts from the boards. */
import { describe, expect, it } from 'vitest'
import type { Device, Room } from '../src/api'
import { atBedtime, drift, faceFor, bedtimeLine, photoLine, playingNow, playingRooms, position, beats, beatAt, dayTitle, agoLine, BEAT_FOR, stillOn,
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
  const on = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime() / 1000
  const day = [photo('a', 1, 1, { taken: on(2025, 8, 16, 9), by: "Sam's phone" }), photo('b', 1, 1, { taken: on(2025, 8, 16, 18), by: "Sam's phone" }),
    photo('c', 1, 1, { taken: on(2025, 8, 16, 21), by: "Sam's phone" })]
  const lone = photo('d', 1, 1, { taken: on(2026, 10, 3) })
  const yearAgo = photo('e', 1, 1, { taken: on(2025, 11, 20, 17), by: "Jordan's iPhone" })
  const today = at(19, 40)   // November 20, 2026
  const kinds = (b: ReturnType<typeof beats>) => b.map(x => x.kind === 'photo' ? `photo:${x.photo.id}${x.ago ? `+${x.ago}y` : ''}` : x.kind === 'title' ? `title:${x.count}` : `collage:${x.photos.map(p => p.id).join('')}`)

  it('one after another plays every photo, with a year ago today first', () => {
    expect(kinds(beats([lone, ...day, yearAgo], 'each', today))).toEqual(['photo:e+1y', 'photo:d', 'photo:a', 'photo:b', 'photo:c'])
  })

  it('day by day opens a day of three or more on its title and three together, then each in the order taken', () => {
    expect(kinds(beats([day[2], lone, day[0], day[1], yearAgo], 'days', today))).toEqual(['photo:e+1y', 'title:3', 'collage:abc', 'photo:a', 'photo:b', 'photo:c', 'photo:d'])
    const t = beats(day, 'days', today)[0]
    expect(t.kind === 'title' && dayTitle(t, 'en-US')).toEqual({ day: 'Saturday, August 16, 2025', sub: "3 photos · from Sam's phone" })
    expect([agoLine(1), agoLine(3)]).toEqual(['One year ago today', '3 years ago today'])
  })

  it('moves each photo its own way, the same way every time it comes round', () => {
    const moves = beats(Array.from({ length: 12 }, (_, i) => photo(`p${i}`)), 'each', today).map(b => b.kind === 'photo' ? b.move : -1)
    expect(new Set(moves).size).toBeGreaterThan(2)
    expect(beats([photo('p3')], 'each', today)[0]).toEqual(beats([photo('p3')], 'each', today)[0])
  })

  it('holds a photo 18 seconds, a title 7 and three together 12, and comes round again', () => {
    const list = beats(day, 'days', today)
    expect([BEAT_FOR.photo, BEAT_FOR.title, BEAT_FOR.collage]).toEqual([18_000, 7_000, 12_000])
    expect([0, 6_999, 7_000, 19_000, 37_000].map(t => beatAt(list, t)?.beat.kind)).toEqual(['title', 'title', 'collage', 'photo', 'photo'])
    const total = 7_000 + 12_000 + 3 * 18_000
    expect(beatAt(list, total + 1)?.index).toBe(0)
    expect(beatAt([], 0)).toBeNull()
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
