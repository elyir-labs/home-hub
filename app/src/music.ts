// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Music in every room (design/music/, A with C's sentences): the rules the speaker's card and the pane draw from.

   Music lives on the speaker's card, the way light lives on a lamp. A quiet speaker the hub can play on offers Play
   something and its last two things again; music shared with other rooms is a row of rooms on the card; and the pane
   is what to play on one side and which rooms on the other, this room already ticked. Which speakers can start music
   is the brain's answer (`attrs.music`), and what kind of speaker it is never reaches here: the screen is the same
   for all of them. */
import type { Device, Room } from './api'

export type MusicItem = { uri: string; name: string; kind: 'radio' | 'playlist' | 'album' | 'track' | 'artist'; by: string | null; art: string | null }
export type Catalog = { again: MusicItem[]; radio: MusicItem[]; own: MusicItem[] }

const ACTIVE = new Set(['playing', 'paused', 'buffering'])
export const AGAIN = 2

export const canStart = (d: Device) => d.attrs.music === true && d.state !== 'unavailable'

export type Card = {
  moment: 'plain' | 'quiet' | 'playing'
  again: MusicItem[]
  rooms: { id: string; name: string; on: boolean }[]
}

/* `left` are rooms somebody took out of the music from this card, this visit: they keep their chip, drained, and
   are the way to put the room back. Only the wall going to rest, or the room being left, clears them. */
export function cardFor(d: Device, rooms: Room[], again: MusicItem[], left: string[] = []): Card {
  if (!canStart(d)) return { moment: 'plain', again: [], rooms: [] }
  if (!ACTIVE.has(d.state)) return { moment: 'quiet', again: again.slice(0, AGAIN), rooms: [] }
  const roomOf = (id: string) => rooms.find(r => r.devices.some(x => x.id === id))
  const mates = ((d.attrs.together as string[] | undefined) ?? []).map(roomOf).filter((r): r is Room => !!r && r.id !== d.room_id)
  const on = new Set(mates.map(r => r.id))
  const drained = left.filter(id => !on.has(id) && id !== d.room_id).map(id => rooms.find(r => r.id === id)).filter((r): r is Room => !!r)
  if (!mates.length && !drained.length) return { moment: 'playing', again: [], rooms: [] }
  return {
    moment: 'playing', again: [],
    rooms: [{ id: d.room_id, name: 'Here', on: true }, ...mates.map(r => ({ id: r.id, name: r.name, on: true })),
      ...drained.map(r => ({ id: r.id, name: r.name, on: false }))],
  }
}

export type PaneRoom = { id: string; name: string; note: string; ticked: boolean; everywhere?: true }

/* Which rooms: the one it was opened from first and ticked, then every other room with a speaker that can start
   music, then Everywhere. A room with only a screen the music cannot reach is not offered. */
export function paneRooms(rooms: Room[], here: string | null): PaneRoom[] {
  const able = rooms.filter(r => r.id !== 'unassigned' && r.devices.some(canStart))
  const playing = (r: Room) => r.devices.find(d => canStart(d) && ACTIVE.has(d.state))?.attrs.media_title as string | undefined
  const sorted = [...able].sort((a, b) => Number(b.id === here) - Number(a.id === here) || a.name.localeCompare(b.name))
  return [
    ...sorted.map(r => ({ id: r.id, name: r.name, note: r.id === here ? 'This room' : playing(r) ?? 'Nothing playing', ticked: r.id === here })),
    { id: '*', name: 'Everywhere', note: 'Every speaker in the house', ticked: false, everywhere: true as const },
  ]
}

/* What to play, in the board's order. An empty shelf is left out rather than drawn with nothing on it. */
export function sections(c: Catalog): { title: string; items: MusicItem[]; key: keyof Catalog }[] {
  return ([['again', 'Again'], ['radio', 'Radio'], ['own', 'Your own music']] as const)
    .map(([key, title]) => ({ key, title, items: c[key] ?? [] }))
    .filter(s => s.items.length)
}

/* Two speakers in one room playing one song (design/speaker-pair/, B with C, decided 20 November 2026). A pair the
   household said yes to is one card for good, playing or quiet (`attrs.pair`, the brain's). Two playing the same song
   that nobody has answered for are shown as one leading and the other a line under it, and the room asks once; two
   the household called two speakers (`attrs.apart`) stay two cards. Pause, play and the volume work the whole group. */
const SOUNDING = new Set(['playing', 'paused'])
export const pairOf = (d: Device, room: Room) => d.attrs.pair ? room.devices.find(x => x.id === d.attrs.pair) ?? null : null
export function inStep(a: Device, b: Device): boolean {
  if (a.id === b.id || !canStart(a) || !canStart(b) || a.room_id !== b.room_id) return false
  if (((a.attrs.apart as string[] | undefined) ?? []).includes(b.id)) return false
  const t = a.attrs.media_title
  return !!t && t === b.attrs.media_title && SOUNDING.has(a.state) && SOUNDING.has(b.state)
}
/* The speakers that go with this one: its pair, and any playing the same song in step. */
export function groupOf(d: Device, room: Room): Device[] {
  const pair = pairOf(d, room)
  const mates = room.devices.filter(x => x.id !== d.id && (x.id === pair?.id || inStep(d, x)))
  return [d, ...mates]
}
/* Which one carries the card: the one playing, then the first by name, so the same speaker leads on every screen. */
export function leadOf(d: Device, room: Room): Device {
  const g = groupOf(d, room)
  return [...g].sort((a, b) => Number(b.state === 'playing') - Number(a.state === 'playing') || a.name.localeCompare(b.name))[0]
}
export const follows = (d: Device, room: Room) => leadOf(d, room).id !== d.id
/* The ones under a leader that nobody has answered for yet: C's line, and the question. */
export const unanswered = (lead: Device, room: Room) => groupOf(lead, room).filter(x => x.id !== lead.id && pairOf(lead, room)?.id !== x.id)
export const namesOf = (ds: Device[], short: (d: Device) => string) => {
  const n = ds.map(short)
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n[0] ?? ''
}
