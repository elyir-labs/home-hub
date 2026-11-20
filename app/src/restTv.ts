// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/*
 * What a TV shows when nobody is watching it (design/rest-tv/, decided 20 November: A, with C until there
 * are photos, B while music plays, E at bedtime).
 *
 * The wall's resting screen was drawn for a hallway glance; a TV is the biggest picture in the house and
 * spends most of its time on and unwatched. So a resting TV is the household's own photos (A), or the sky
 * as a window when nobody has sent one yet (C). Music playing anywhere takes the screen while it plays (B),
 * and from bedtime on, if anything is still on, it offers Bedtime (E).
 *
 * Under all four, nothing holds still -- an OLED TV keeps the ghost of anything held in one place for
 * weeks -- and after a long rest the TV is sent to standby, so a hub is never the reason it was on all night.
 */
import { reactive } from 'vue'
import { getPhotos, sayScreen, type Device } from './api'
import { isScreen, keepScreenKind, screenId, screenKind, screenRoom } from './screen'
import { tvGuess } from './tv'
import { cap, HOUSE_SCENES, isDead, roomOf, runScene, store } from './store'
import { sleepTv } from './thisScreen'

export type Face = 'photos' | 'window' | 'playing' | 'bedtime'
export type Photo = { id: string; taken: number | null; added: number; by: string | null; w?: number | null; h?: number | null }
export type Shape = 'wide' | 'tall'
export type StillOn = { name: string; what: string; kind: 'light' | 'music' | 'door' }

export const SLEEP_AFTER = 20 * 60 * 1000     // at rest this long with no key pressed, the TV goes to standby
export const BEAT_FOR = { photo: 18_000, title: 7_000, collage: 12_000 }   // design/tv-moments/: a photo every 18 seconds
export const MOVES = 4                       // the ways a photo can move: in, across, out, up; each photo keeps its own
const BEDTIME_FROM = 22 * 60 + 30             // 10:30 PM, until
const BEDTIME_TO = 4 * 60                     // 4 AM

export function atBedtime(now: Date): boolean {
  const m = now.getHours() * 60 + now.getMinutes()
  return m >= BEDTIME_FROM || m < BEDTIME_TO
}

/** Which face, in the board's order of who wins: music, then bedtime, then photos, then the sky. */
export function faceFor(o: { playing: boolean; stillOn: number; photos: number; now: Date; notYet: boolean }): Face {
  if (o.playing) return 'playing'
  if (o.stillOn && atBedtime(o.now) && !o.notYet) return 'bedtime'
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

/** What Bedtime does, in the order it matters: the lights, the doors, the music. Bedtime is lights and media off and locks locked. */
export function bedtimeLine(left: StillOn[]): string {
  const doors = left.filter(s => s.kind === 'door')
  const parts = ['The lights off']
  if (doors.length) parts.push(doors.length === 1 ? `the ${doors[0].name.toLowerCase()} locked` : 'the doors locked')
  if (left.some(s => s.kind === 'music')) parts.push('the music stopped')
  return parts.join(', ')
}

/** A photo's shape from the size the phone sent, or from what the TV learned when it opened it. */
export const shapeOf = (p: Photo, learned: Record<string, Shape>): Shape | undefined =>
  p.w && p.h ? (p.h > p.w ? 'tall' : 'wide') : learned[p.id]

export type Play = 'each' | 'days'
export type Beat =
  | { kind: 'photo'; photo: Photo; move: number; ago?: number }
  | { kind: 'title'; cover: Photo; count: number; by: string[] }
  | { kind: 'collage'; photos: Photo[] }

const when = (p: Photo) => new Date((p.taken ?? p.added) * 1000)
const moveOf = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % MOVES

/** How many years ago today a photo was taken, or 0 when it wasn't taken on this date. */
export function yearsAgo(p: Photo, now: Date): number {
  const d = when(p)
  return d.getMonth() === now.getMonth() && d.getDate() === now.getDate() && d.getFullYear() < now.getFullYear() ? now.getFullYear() - d.getFullYear() : 0
}

/** What the screen plays, in order (design/tv-moments/, decided 20 November: A and B, chosen per screen). Photos taken
    on this date in an earlier year come first, saying so. Then, one after another (A), every photo with its own move;
    or day by day (B), a day with three or more photos opens on its title and three of them together, then each in turn. */
export function beats(photos: Photo[], play: Play, now: Date): Beat[] {
  const photo = (p: Photo): Beat => ({ kind: 'photo', photo: p, move: moveOf(p.id) })
  const ago = photos.filter(p => yearsAgo(p, now)).map(p => ({ ...photo(p), ago: yearsAgo(p, now) }) as Beat)
  const rest = photos.filter(p => !yearsAgo(p, now))
  if (play === 'each') return [...ago, ...rest.map(photo)]
  const days = new Map<string, Photo[]>()
  for (const p of rest) { const k = when(p).toDateString(); days.set(k, [...(days.get(k) ?? []), p]) }
  const out: Beat[] = [...ago]
  for (const day of days.values()) {
    const inOrder = [...day].sort((a, b) => when(a).getTime() - when(b).getTime())
    if (inOrder.length >= 3) out.push({ kind: 'title', cover: inOrder[0], count: inOrder.length, by: [...new Set(inOrder.map(p => p.by).filter(Boolean))] as string[] },
      { kind: 'collage', photos: inOrder.slice(0, 3) })
    out.push(...inOrder.map(photo))
  }
  return out
}

/** The beat showing at a moment, where it started and how long it lasts, going round the list again and again. */
export function beatAt(list: Beat[], at: number): { beat: Beat; index: number; from: number; lasts: number } | null {
  if (!list.length) return null
  const total = list.reduce((t, b) => t + BEAT_FOR[b.kind], 0)
  let t = at % total, from = at - t
  for (let index = 0; index < list.length; index++) {
    const lasts = BEAT_FOR[list[index].kind]
    if (t < lasts) return { beat: list[index], index, from, lasts }
    t -= lasts; from += lasts
  }
  return null
}

/** A day's title: "Saturday, August 16, 2025", and "6 photos · from Sam's phone" under it. */
export function dayTitle(b: Extract<Beat, { kind: 'title' }>, locale?: string): { day: string; sub: string } {
  const day = when(b.cover).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const from = b.by.length === 1 ? ` · from ${b.by[0]}` : b.by.length > 1 ? ` · from ${b.by.length} phones` : ''
  return { day, sub: `${b.count} photos${from}` }
}

export const agoLine = (years: number) => years === 1 ? 'One year ago today' : `${years} years ago today`

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
    Back was pressed on Bedtime, which then leaves the TV to its photos until the next evening. */
export const rest = reactive({ face: 'window' as Face, notYet: '', photos: [] as Photo[], photosKnown: false, shows: true, play: 'days' as Play })

/** The household's photos, read when a screen starts and each time it rests. A hub that cannot say leaves it on the sky. */
export async function loadRestPhotos() {
  try { rest.photos = await getPhotos(); rest.photosKnown = true } catch { /* nothing to show */ }
}

/** This screen tells the hub what it is and which room it is in, and hears back whether it shows photos at rest
    (design/which-tv/). An answer somebody gave on This screen is sent as theirs; one the hub kept from before, on a
    screen that has forgotten it, is taken back, and the screen starts again as that if it is not that now. */
export async function reportScreen(nowTv: boolean) {
  if (!isScreen()) return
  const said = screenKind()
  try {
    const me = await sayScreen({ id: screenId(), room: screenRoom(), tv: said ? said === 'tv' : tvGuess(), by: said ? 'person' : 'screen' })
    rest.shows = me.photos
    rest.play = me.play === 'each' ? 'each' : 'days'
    if (me.by === 'person' && !said) { keepScreenKind(me.tv ? 'tv' : 'wall'); if (me.tv !== nowTv) location.reload() }
  } catch { /* an older hub, or none reachable: the screen keeps its own guess and its photos */ }
}

export const nightOf = (now: Date) => new Date(now.getTime() - BEDTIME_TO * 60000).toDateString()

/** Bedtime: the house's own Bedtime, then the TV to standby with the lights. */
export async function bedtime() {
  const scene = HOUSE_SCENES.find(s => s.id === 'asleep')
  if (scene && await runScene(null, scene)) await sleepTv()
}
