// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A TV at rest, as design/rest-tv/ decided on 20 November 2026: A (the household's photos), with C (the sky) until
   there are photos, B (what's playing) while music plays, and E (Bedtime) at bedtime. These fail on purpose if
   which face wins, or what Bedtime lists and says, drifts from the boards. */
import { describe, expect, it } from 'vitest'
import type { Device, Room } from '../src/api'
import { atBedtime, drift, faceFor, bedtimeLine, photoLine, playingNow, playingRooms, position, beats, beatAt, dayTitle, agoLine, BEAT_FOR, stillOn, withCards, daysTo, countWords, noteWhen, noteFrom, faceFor as face_, isMorning, morningLine, rest, funCards, houseToday, sunCross,
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

describe('notes and countdowns between the photos (design/tv-moments/, cards A)', () => {
  const note = (id: string, added: number, by: string | null = "Mom's phone") => ({ id, text: 'Dinner at 7', by, added, until: null })
  const count = (id: string, next: string) => ({ id, what: "Sam's birthday", date: next, next, yearly: true, by: null, added: 0 })
  const photos = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, taken: null, added: 0, by: null }))
  const ids = (b: ReturnType<typeof withCards>) => b.map(x => x.kind === 'photo' ? 'p' : x.kind === 'note' ? `n:${x.note.id}` : x.kind === 'count' ? `c:${x.count.id}` : x.kind)

  it('takes a turn after every fifth photo, going through the notes and then the countdowns', () => {
    const list = withCards(beats(photos, 'each', at(19, 40)), { notes: [note('a', 0)], countdowns: [count('b', '2026-11-23')] })
    expect(ids(list)).toEqual(['p', 'p', 'p', 'p', 'p', 'n:a', 'p', 'p', 'p', 'p', 'p', 'c:b', 'p'])
    expect(BEAT_FOR.note).toBe(20_000)
  })

  it('still gets one turn when there are fewer than five photos, and changes nothing when there is nothing to show', () => {
    expect(ids(withCards(beats(photos.slice(0, 2), 'each', at(19, 40)), { notes: [note('a', 0)], countdowns: [] }))).toEqual(['p', 'p', 'n:a'])
    expect(ids(withCards(beats(photos.slice(0, 2), 'each', at(19, 40)), { notes: [], countdowns: [] }))).toEqual(['p', 'p'])
  })

  it('goes round the photos again until every note and countdown has had a turn', () => {
    const board = { notes: [note('a', 0), note('b', 0)], countdowns: [count('c', '2026-11-23')] }
    expect(ids(withCards(beats(photos.slice(0, 5), 'each', at(19, 40)), board))).toEqual([
      'p', 'p', 'p', 'p', 'p', 'n:a', 'p', 'p', 'p', 'p', 'p', 'n:b', 'p', 'p', 'p', 'p', 'p', 'c:c'])
    expect(ids(withCards(beats(photos.slice(0, 2), 'each', at(19, 40)), board))).toEqual(['p', 'p', 'n:a', 'p', 'p', 'n:b', 'p', 'p', 'c:c'])
  })

  it('counts days in this screen\'s own calendar, and says the day under the number', () => {
    const now = at(23, 50)   // Friday, November 20, 2026, late
    expect([daysTo('2026-11-20', now), daysTo('2026-11-21', now), daysTo('2026-11-23', now)]).toEqual([0, 1, 3])
    expect(countWords(count('c', '2026-11-23'), now, 'en-US')).toEqual({ big: '3', under: 'days to go · Monday' })
    expect(countWords(count('c', '2026-11-21'), now, 'en-US')).toEqual({ big: '1', under: 'day to go · tomorrow' })
    expect(countWords(count('c', '2026-11-20'), now, 'en-US')).toEqual({ big: 'Today', under: '' })
    expect(countWords(count('c', '2026-12-25'), now, 'en-US').under).toBe('days to go · December 25')
  })

  it('says when a note was left the way a person would', () => {
    const now = at(19, 40), t = (d: number, h: number) => new Date(2026, 10, d, h).getTime() / 1000
    expect([t(20, 8), t(20, 14), t(20, 18), t(19, 21), t(19, 9), t(17, 9)].map(x => noteWhen(x, now, 'en-US')))
      .toEqual(['this morning', 'this afternoon', 'this evening', 'last night', 'yesterday', 'on Tuesday'])
    expect(noteFrom(note('a', t(20, 8)), now, 'en-US')).toBe("A note from Mom's phone · this morning")
    expect(noteFrom(note('a', t(20, 8), null), now, 'en-US')).toBe('A note · this morning')
  })

  it('a screen set to the family board rests on it, after music and Bedtime', () => {
    const base = { playing: false, stillOn: 0, photos: 3, now: at(19, 40), notYet: false, board: true }
    expect(face_(base)).toBe('board')
    expect(face_({ ...base, playing: true })).toBe('playing')
    expect(face_({ ...base, stillOn: 2, now: at(23, 0) })).toBe('bedtime')
  })
})

describe('morning and night (design/tv-moments/, morning A and the night line)', () => {
  it('is morning from first light until 11, by the house\'s own sky', () => {
    expect([isMorning(at(4, 59), 5), isMorning(at(7, 2), -1), isMorning(at(7, 2), -9), isMorning(at(10, 59), 30), isMorning(at(11, 0), 30)]).toEqual([false, true, false, true, false])
  })

  it('greets with a line somebody left for this morning, signed, or the day\'s own', () => {
    rest.board = { notes: [], countdowns: [], mornings: [{ id: 'm', text: 'Proud of you for yesterday.', day: '2026-11-20', by: "Dad's phone", added: 0 }] }
    rest.words = { day: '2026-11-20', morning: 'Just the next thing.', evening: 'Rest well.' }
    expect(morningLine(at(7, 2))).toEqual({ text: 'Proud of you for yesterday.', from: "Left last night, from Dad's phone" })
    rest.board = { notes: [], countdowns: [], mornings: [] }
    expect(morningLine(at(7, 2))).toEqual({ text: 'Just the next thing.', from: '' })
  })

  it('puts the last word after Bedtime first, then music, Bedtime, the morning, the board', () => {
    const base = { playing: false, stillOn: 0, photos: 3, now: at(7, 2), notYet: false, board: true, morning: true }
    expect(face_(base)).toBe('morning')
    expect(face_({ ...base, playing: true })).toBe('playing')
    expect(face_({ ...base, playing: true, night: true })).toBe('night')
    expect(face_({ ...base, morning: false })).toBe('board')
  })
})

describe('the day\'s fun cards (design/tv-moments/, cards A)', () => {
  const words = { day: '2026-11-20', morning: null, evening: null, facts: [['F1', 'f1'], ['F2', 'f2']], trivia: [['Q1?', 'A1'], ['Q2?', 'A2']], jokes: [['J?', 'j.']], quotes: [['Q.', 'Who']] }
  const kinds = (b: ReturnType<typeof funCards>) => b.map(x => x.kind === 'fact' || x.kind === 'trivia' || x.kind === 'joke' || x.kind === 'quote' ? `${x.kind}:${x.first}` : x.kind)

  it('starts with the house today, then mixes the day\'s facts, questions, a joke and a quote, as the screen has them on', () => {
    expect(kinds(funCards(words, { today: true, facts: true, jokes: true, quotes: true }))).toEqual(['day', 'fact:F1', 'trivia:Q1?', 'joke:J?', 'quote:Q.', 'fact:F2', 'trivia:Q2?'])
    expect(kinds(funCards(words, { today: false, facts: true, jokes: false, quotes: false }))).toEqual(['fact:F1', 'trivia:Q1?', 'fact:F2', 'trivia:Q2?'])
    expect(funCards({ day: '', morning: null, evening: null }, { today: false, facts: true, jokes: true, quotes: true })).toEqual([])
  })

  it('takes a turn with the notes and countdowns, after them', () => {
    const list = withCards(beats([{ id: 'p', taken: null, added: 0, by: null }], 'each', at(19, 40)), { notes: [], countdowns: [] }, funCards(words, { today: true, facts: false, jokes: false, quotes: false }))
    expect(list.map(b => b.kind)).toEqual(['photo', 'day'])
  })

  it('says when the sun next sets or rises, what tonight brings, and the moon', () => {
    const clock = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
    const afternoon = houseToday(at(14, 0), null, { low: 28, frost: 32, change: '' }, clock)
    expect(afternoon.lines[0]).toMatch(/^The sun sets at \d+:\d\d\.$/)
    expect(afternoon.lines[1]).toBe('Frost likely tonight.')
    expect(houseToday(at(14, 0), null, { low: 45, frost: 32, change: 'Rain from 4 PM' }, clock).lines[1]).toBe('Rain from 4 PM.')
    expect(houseToday(at(14, 0), null, { low: 45, frost: 32, change: '' }, clock).lines[1]).toBe('Down to 45° tonight.')
    expect(houseToday(at(21, 0), null, { low: null, frost: 32, change: '' }, clock).lines).toEqual([expect.stringMatching(/^The sun rises at \d+:\d\d tomorrow\.$/)])
    expect(afternoon.under).toMatch(/moon tonight$/)
    expect(sunCross(at(14, 0), false, { lat: 42.5, lon: -92.4 })!.getTime()).toBeGreaterThan(at(14, 0).getTime())
  })
})
