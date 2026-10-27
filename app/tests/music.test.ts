// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Music in every room, as design/music/RoomA.dc.html and PhoneA.dc.html draw it (A, with C's sentences, picked
   20 October). These hold the parts of the picture that are rules rather than drawing: what a quiet speaker
   offers, which rooms the card names when music is shared, and the order of the pane's two sides. A card that
   went back to "Nothing playing" with a dead Play button, or a pane that forgot which room it was opened from,
   would pass everything else in the suite. */
import { describe, expect, it } from 'vitest'
import type { Device, Room } from '../src/api'
import { cardFor, paneRooms, sections, type MusicItem } from '../src/music'

const dev = (id: string, room: string, state: string, attrs: Record<string, unknown> = {}): Device =>
  ({ id, name: id, room_id: room, capability: 'media', state, attrs })
const room = (id: string, name: string, devices: Device[] = []): Room =>
  ({ id, name, devices, intent: 'unknown', set_by: null, hold_until: null })
const item = (name: string, kind: MusicItem['kind'] = 'radio'): MusicItem => ({ uri: `x://${name}`, name, kind, by: null, art: null })

const LIVING = room('living', 'Living room', [dev('s1', 'living', 'idle', { music: true })])
const KITCHEN = room('kitchen', 'Kitchen', [dev('k4', 'kitchen', 'idle', { music: true })])
const DINING = room('dining', 'Dining room', [dev('d1', 'dining', 'off', { music: true })])
const DEN = room('den', 'Den', [dev('tv', 'den', 'off')])            // a screen the music cannot reach
const ROOMS = [LIVING, KITCHEN, DINING, DEN]

describe('a speaker card (RoomA, the first moment)', () => {
  it('a quiet speaker offers Play something and the last two things again', () => {
    const c = cardFor(LIVING.devices[0], ROOMS, [item('Dinner', 'playlist'), item('Late-night jazz'), item('News')])
    expect(c.moment).toBe('quiet')
    expect(c.again.map(i => i.name)).toEqual(['Dinner', 'Late-night jazz'])
  })

  it('a speaker the music cannot reach stays the card it always was', () => {
    expect(cardFor(DEN.devices[0], ROOMS, [item('Dinner')]).moment).toBe('plain')
  })

  it('with nothing played yet it still offers Play something, and no empty Again', () => {
    const c = cardFor(LIVING.devices[0], ROOMS, [])
    expect(c.moment).toBe('quiet')
    expect(c.again).toEqual([])
  })

  it('music shared with the kitchen is a row of rooms on the card, this one first, called Here', () => {
    const s = dev('s1', 'living', 'playing', { music: true, media_title: 'Dinner', together: ['k4'] })
    const c = cardFor(s, ROOMS, [])
    expect(c.moment).toBe('playing')
    expect(c.rooms).toEqual([{ id: 'living', name: 'Here', on: true }, { id: 'kitchen', name: 'Kitchen', on: true }])
  })

  it('a room taken out keeps its chip, drained, so nothing vanishes under the finger that took it out', () => {
    const s = dev('s1', 'living', 'playing', { music: true, media_title: 'Dinner' })
    expect(cardFor(s, ROOMS, [], ['kitchen']).rooms).toEqual([{ id: 'living', name: 'Here', on: true }, { id: 'kitchen', name: 'Kitchen', on: false }])
  })

  it('playing alone, there is no row of rooms', () => {
    expect(cardFor(dev('s1', 'living', 'playing', { music: true }), ROOMS, []).rooms).toEqual([])
  })
})

describe('the pane (RoomA, the second moment; PhoneA)', () => {
  it('which rooms: this one first and already ticked, every other room with a speaker, then Everywhere', () => {
    const rows = paneRooms(ROOMS, 'kitchen')
    expect(rows.map(r => r.name)).toEqual(['Kitchen', 'Dining room', 'Living room', 'Everywhere'])
    expect(rows.map(r => r.ticked)).toEqual([true, false, false, false])
    expect(rows[0].note).toBe('This room')
  })

  it('what to play: again, then radio, then the household\'s own music -- and an empty shelf is not drawn', () => {
    expect(sections({ again: [item('Dinner')], radio: [item('Jazz FM')], own: [] }).map(s => s.title)).toEqual(['Again', 'Radio'])
    expect(sections({ again: [], radio: [item('Jazz FM')], own: [item('Kind of Blue', 'album')] }).map(s => s.title)).toEqual(['Radio', 'Your own music'])
  })
})
