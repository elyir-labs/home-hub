// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/*
 * What a TV shows when nobody is watching it (design/rest-tv/, decided 20 November: A, with C until there
 * are photos, B while music plays, E at bedtime).
 *
 * The wall's resting screen was drawn for a hallway glance; a TV is the biggest picture in the house and
 * spends most of its time on and unwatched. So a resting TV is the household's own photos (A), or the sky
 * as a window when nobody has sent one yet (C). Music playing anywhere takes the screen while it plays (B),
 * and from bedtime on, if anything is still on, it asks Goodnight (E).
 *
 * Under all four, nothing holds still -- an OLED TV keeps the ghost of anything held in one place for
 * weeks -- and after a long rest the TV is sent to standby, so a hub is never the reason it was on all night.
 */
import { reactive } from 'vue'
import type { Device } from './api'
import { cap, HOUSE_SCENES, isDead, roomOf, runScene, store } from './store'
import { sleepTv } from './thisScreen'

export type Face = 'photos' | 'window' | 'playing' | 'goodnight'
export type Photo = { id: string; taken: number | null; added: number; by: string | null; w?: number | null; h?: number | null }
export type Shape = 'wide' | 'tall'
export type StillOn = { name: string; what: string; kind: 'light' | 'music' | 'door' }

export const SLEEP_AFTER = 20 * 60 * 1000     // at rest this long with no key pressed, the TV goes to standby
export const PHOTO_FOR = 60 * 1000            // each photo, or pair of upright ones, for a minute
const BEDTIME_FROM = 22 * 60 + 30             // 10:30 PM, until
const BEDTIME_TO = 4 * 60                     // 4 AM

export function atBedtime(now: Date): boolean {
  const m = now.getHours() * 60 + now.getMinutes()
  return m >= BEDTIME_FROM || m < BEDTIME_TO
}

/** Which face, in the board's order of who wins: music, then bedtime, then photos, then the sky. */
export function faceFor(o: { playing: boolean; stillOn: number; photos: number; now: Date; notYet: boolean }): Face {
  if (o.playing) return 'playing'
  if (o.stillOn && atBedtime(o.now) && !o.notYet) return 'goodnight'
  return o.photos ? 'photos' : 'window'
}

const all = () => store.rooms.flatMap(r => r.devices)

/** The speaker that is playing, if music is playing anywhere. A TV's own media player is not music. */
export function playingNow(): Device | null {
  return all().find(d => d.attrs.music === true && d.state === 'playing' && !isDead(d)) ?? null
}

/** Every room the music is in: the speaker's own, then the ones playing with it, each once. */
export function playingRooms(d: Device): string[] {
  const along = new Set<string>([d.id, ...((d.attrs.together as string[] | undefined) ?? [])])
  const names = all().filter(x => along.has(x.id)).map(x => roomOf(x)?.name ?? x.name)
  return [...new Set(names)]
}

/** What is still on before bed: lights by room, music, then doors unlocked last, as the board lists them. */
export function stillOn(): StillOn[] {
  const out: StillOn[] = []
  for (const r of store.rooms) {
    const on = r.devices.filter(d => cap(d) === 'light' && d.state === 'on' && !isDead(d))
    if (on.length) out.push({ name: r.name, what: on.length === 1 ? on[0].name : `${on.length} lights`, kind: 'light' })
  }
  for (const d of all()) if (d.attrs.music === true && d.state === 'playing') out.push({ name: d.name, what: 'Playing', kind: 'music' })
  for (const d of all()) if (cap(d) === 'lock' && (d.state === 'unlocked' || d.state === 'open')) out.push({ name: d.name, what: 'Unlocked', kind: 'door' })
  return out
}

/** What Goodnight does, in the order it matters: the lights, the doors, the music. Bedtime is lights and media off and locks locked. */
export function goodnightLine(left: StillOn[]): string {
  const doors = left.filter(s => s.kind === 'door')
  const parts = ['The lights off']
  if (doors.length) parts.push(doors.length === 1 ? `the ${doors[0].name.toLowerCase()} locked` : 'the doors locked')
  if (left.some(s => s.kind === 'music')) parts.push('the music stopped')
  return parts.join(', ')
}

/** A photo's shape from the size the phone sent, or from what the TV learned when it opened it. */
export const shapeOf = (p: Photo, learned: Record<string, Shape>): Shape | undefined =>
  p.w && p.h ? (p.h > p.w ? 'tall' : 'wide') : learned[p.id]

/** Photos in the order they show: one wide photo alone, two upright ones side by side. A lone upright one shows alone. */
export function slides(photos: Photo[], learned: Record<string, Shape> = {}): Photo[][] {
  const out: Photo[][] = []
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i], next = photos[i + 1]
    if (shapeOf(p, learned) === 'tall' && next && shapeOf(next, learned) === 'tall') { out.push([p, next]); i++ }
    else out.push([p])
  }
  return out
}

export const slideAt = <T>(list: T[], at: number): T | null => list.length ? list[Math.floor(at / PHOTO_FOR) % list.length] : null

/** "August 2025 · from Sam's phone": when it was taken, else when it was sent, and whose phone it came from. */
export function photoLine(p: Photo, locale?: string): string {
  const when = new Date((p.taken ?? p.added) * 1000).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  return p.by ? `${when} · from ${p.by}` : when
}

/** Where everything on a resting TV sits this minute: a few pixels off, a new place each minute, so no edge of
    type stays on the same pixels for long; the clock and the strip also trade sides every hour. */
export function drift(now: Date): { x: number; y: number; flip: boolean } {
  const m = Math.floor(now.getTime() / 60000)
  return { x: Math.round(14 * Math.sin(m * 1.7)), y: Math.round(10 * Math.cos(m * 1.3)), flip: now.getHours() % 2 === 1 }
}

/** How far a song has got, in seconds, from the speaker's last report and how long ago that was. */
export function position(d: Device, now: number): { at: number; of: number } | null {
  const of = Number(d.attrs.media_duration), at = Number(d.attrs.media_position)
  if (!(of > 0) || !Number.isFinite(at)) return null
  const said = Date.parse(d.attrs.media_position_updated_at ?? '')
  const since = d.state === 'playing' && Number.isFinite(said) ? Math.max(0, (now - said) / 1000) : 0
  return { at: Math.min(of, at + since), of }
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** What the resting TV is showing, so the remote's OK and Back can do what that face says they do. `notYet` is the night
    Back was pressed on Goodnight, which then leaves the TV to its photos until the next evening. */
export const rest = reactive({ face: 'window' as Face, notYet: '' })

export const nightOf = (now: Date) => new Date(now.getTime() - BEDTIME_TO * 60000).toDateString()

/** Goodnight: the house's own Bedtime, then the TV to standby with the lights. */
export async function goodnight() {
  const bedtime = HOUSE_SCENES.find(s => s.id === 'asleep')
  if (bedtime && await runScene(null, bedtime)) await sleepTv()
}
