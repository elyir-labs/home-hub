// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The house on a TV, worked from the sofa with a remote (design/living-room/, B with C's band). The TV
   opens on its own room in rows -- this room's things, its scenes, the other rooms, the cameras -- and
   while it is resting (later, while it plays a film) OK brings the room up as one band along the foot
   instead, where Up and Down are the level and the colored buttons are the room's scenes.

   A remote is arrows, OK, Back, Home and four colors, whether it is the TV's own over HDMI-CEC, a USB
   or Bluetooth one, or a keyboard. These are the rules a test can hold; installRemote() puts them on
   the page, and TvView.vue and TvBand.vue draw the two answers. */

import { shallowRef } from 'vue'
import type { Device, Room } from './api'
import { cap, doneLine, done, isActive, isDead, PASSIVE, perform, SCENES, type Scene } from './store'
import { dimmable, lightPct, step, tempUnit } from './levels'
import { isScreen } from './screen'
import { typable } from './keys'
import { canStart, groupOf } from './music'
import { isBox } from './boxes'

/* Worked out, not told: a screen for the hub, in Chromium on Linux, that nobody can touch -- a mini PC on a
   TV. A wall screen has a touchscreen and keeps the wall. ?tv=1 forces it for previews, ?tv=0 turns it off. */
export function onTV(search = location.search, ua = navigator.userAgent, screen = isScreen(search), touch = navigator.maxTouchPoints): boolean {
  const asked = new URLSearchParams(search).get('tv')
  if (asked === '1') return true
  if (asked === '0') return false
  return screen && /\bLinux\b/.test(ua) && !/Android|CrOS/.test(ua) && touch === 0
}

export type Press = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'home' | Color
export type Color = 'red' | 'green' | 'yellow' | 'blue'

/* What a key is, from whichever remote sent it. The TV's own remote over CEC arrives as Enter, Escape and F1 to F4
   for the colors (startup/cec-keys.toml); a USB remote and a keyboard as Enter, Escape or Backspace. The digits
   are never a press: they only type, where a screen asks for a number (design/tv-join/), so a remote's 1 never
   starts a scene. */
const PRESSES: Record<string, Press> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'ok', Select: 'ok', ' ': 'ok',
  Escape: 'back', Backspace: 'back', BrowserBack: 'back', GoBack: 'back', Exit: 'back',
  Home: 'home', BrowserHome: 'home', GoHome: 'home', ContextMenu: 'home',
  ColorF0Red: 'red', ColorF1Green: 'green', ColorF2Yellow: 'yellow', ColorF3Blue: 'blue',
  F1: 'red', F2: 'green', F3: 'yellow', F4: 'blue',
}
export const pressOf = (key: string): Press | null => PRESSES[key] ?? null
export const digitOf = (key: string): string | null => /^[0-9]$/.test(key) ? key : null

/* The colored buttons are always the same scene, in every room, so a hand learns them once. */
export const SCENE_COLOR: Record<Color, string> = { red: 'movie', green: 'guests', yellow: 'asleep', blue: 'empty' }
export const COLOR_OF: Record<string, Color> = Object.fromEntries(Object.entries(SCENE_COLOR).map(([c, s]) => [s, c as Color]))
export const sceneFor = (color: Color, scenes: Scene[]) => scenes.find(s => s.id === SCENE_COLOR[color]) ?? null
export const coloredScenes = (scenes: Scene[]) => SCENES.filter(s => scenes.some(x => x.id === s.id))

/* ---------- what is in a room, for the sofa ---------- */

/* Music in the TV's own room (design/tv-music/, A and B): the room's speakers play it and the TV is its screen.
   Awake, a paused record still leads the room, so it can be started again from the sofa; at rest only one that plays
   takes the screen. The speakers are this room's that play in step with it, the one the remote works first. */
export function musicIn(room: Room | null, playingOnly = false): Device | null {
  const on = room?.devices.filter(d => canStart(d) && (d.state === 'playing' || (!playingOnly && d.state === 'paused'))) ?? []
  return on.find(d => d.state === 'playing') ?? on[0] ?? null
}
export function speakersOf(d: Device, room: Room): Device[] {
  const mates = new Set((d.attrs.together as string[] | undefined) ?? [])
  // its pair, and a speaker playing the same song in step (an Apple TV playing to both HomePods): music.ts groupOf
  const group = groupOf(d, room)
  return [...group, ...room.devices.filter(x => mates.has(x.id) && !group.includes(x))]
}

/* A streaming box beside the TV (design/tv-box/, A): the hub opens an app on it and switches the TV over, and the box's
   own remote's Home brings the house back. The brain says which players are boxes; the panel only sees one with apps. */
export const boxIn = (room: Room | null): Device | null => room?.devices.find(isBox) ?? null

/* The rows above the room's own, in order: what plays here, then Watch. A TV with no box has no Watch row, so it opens
   on its room as it did before. */
export type Lead = 'music' | 'watch'
export function leadsOf(room: Room | null): Lead[] {
  return [...(musicIn(room) ? ['music' as const] : []), ...(boxIn(room) ? ['watch' as const] : [])]
}

export { appsOf, appTint, APPS_SHOWN, boxAsleep, isBox, lastOn } from './boxes'

/* What the handover says for the two seconds before the TV switches (design/tv-box/, coming back: B, falling back to A).
   A colored button is the way back only where this screen has said it can hear one meant for the box. */
export function wayBack(colors: boolean, box: string): string {
  return colors ? 'To come back to the house, press any colored button on the TV’s remote:'
    : `To come back to the house, press Input on the TV’s remote. When the ${box} goes to sleep, the house comes back by itself.`
}
export const HANDOVER_MS = 2200

/* A remote plugged into the hub while the box is on the TV. The hub's own screen is out of sight then, so no press may
   act on it: the box's keys go to the box, and Home or a colored button brings the house back. The words are the
   brain's (brain/hub/boxes.py KEYS), which turns them into whatever the box's integration calls them. */
export type BoxKey = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'play_pause' | 'play' | 'pause' | 'next' | 'previous'
  | 'forward' | 'rewind' | 'louder' | 'quieter'
const BOX_KEYS: Record<string, BoxKey> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'ok', Select: 'ok', ' ': 'ok',
  Escape: 'back', Backspace: 'back', BrowserBack: 'back', GoBack: 'back', Exit: 'back',
  MediaPlayPause: 'play_pause', MediaPlay: 'play', MediaPause: 'pause', MediaTrackNext: 'next', MediaTrackPrevious: 'previous',
  MediaFastForward: 'forward', MediaRewind: 'rewind', AudioVolumeUp: 'louder', AudioVolumeDown: 'quieter',
}
export const boxKeyOf = (key: string): BoxKey | null => BOX_KEYS[key] ?? null

export type PassOn = { key: (k: BoxKey, repeat: boolean) => void; back: () => void }
export const passTo = shallowRef<PassOn | null>(null)

/* Keys go to the box one at a time, in the order pressed. A held arrow sends as fast as the box answers rather than as
   fast as the key repeats, so letting go stops it where it is. */
export function keySender(send: (k: BoxKey) => Promise<unknown>): PassOn['key'] {
  let chain: Promise<unknown> = Promise.resolve(), waiting = 0
  return (k, repeat) => {
    if (repeat && waiting > 0) return
    waiting++
    chain = chain.then(() => send(k)).catch(() => {}).finally(() => { waiting-- })
  }
}

const ORDER = ['light', 'cover', 'climate', 'media', 'fan', 'switch', 'lock']
/* Everything in the room a person can do something to, in an order that never changes with its state:
   a light turned off from the sofa stays exactly where it was. Cameras have a row of their own. */
export function thingsIn(room: Room): Device[] {
  const rank = (d: Device) => { const i = ORDER.indexOf(cap(d)); return i < 0 ? ORDER.length : i }
  return room.devices.filter(d => !PASSIVE.has(cap(d)) && !d.attrs?.off_home)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}
export const camerasIn = (rooms: Room[]) => rooms.flatMap(r => r.devices.filter(d => cap(d) === 'camera'))

/* A thing's state in a few words, sized to be read from across the room. */
export function stateOf(d: Device): string {
  if (isDead(d)) return 'Not answering'
  if (done[d.id] && !isActive(d)) return doneLine(d.id)
  const c = cap(d), a = d.attrs
  if (c === 'light') return d.state !== 'on' ? 'Off' : dimmable(d) ? `On, ${lightPct(d)}%` : 'On'
  if (c === 'cover') return a.current_position != null ? (Number(a.current_position) > 0 ? `${a.current_position}% open` : 'Closed') : d.state === 'open' ? 'Open' : 'Closed'
  if (c === 'climate') {
    const t = a.sense_from ? a.wanted : a.temperature
    const doing = ({ heating: 'heating', cooling: 'cooling' } as Record<string, string>)[a.hvac_action] ?? ''
    return d.state === 'off' ? 'Off' : t == null ? 'On' : `${Math.round(t)}${tempUnit() ? '°' : ''}${doing ? ` · ${doing}` : ''}`
  }
  if (c === 'media') return d.state === 'playing' ? (a.media_title || 'Playing') : d.state === 'paused' ? 'Paused' : d.state === 'off' ? 'Off' : 'Quiet'
  if (c === 'lock') return d.state === 'locked' ? 'Locked' : 'Unlocked'
  return d.state === 'on' ? 'On' : d.state === 'off' ? 'Off' : d.state.charAt(0).toUpperCase() + d.state.slice(1)
}

/* What OK does to a thing. A lock, a thermostat and anything unusual open instead of acting: from across
   a room a press should never unlock a door. */
export type Ok = { label: string; action: string; guess: { state: string } } | { label: string; open: true }
export function okOf(d: Device): Ok {
  const c = cap(d), on = d.state === 'on'
  if (!isDead(d)) {
    if (c === 'light' || c === 'switch' || c === 'fan') return { label: on ? 'Turn off' : 'Turn on', action: on ? 'off' : 'on', guess: { state: on ? 'off' : 'on' } }
    if (c === 'cover') { const open = d.state === 'open' || Number(d.attrs.current_position) > 0; return { label: open ? 'Close' : 'Open', action: open ? 'close' : 'open', guess: { state: open ? 'closing' : 'opening' } } }
    if (c === 'media' && d.state !== 'off') return d.state === 'playing' ? { label: 'Pause', action: 'pause', guess: { state: 'paused' } } : { label: 'Play', action: 'play', guess: { state: 'playing' } }
  }
  return { label: 'Open', open: true }
}

/* What Up and Down do on the band, said in words; empty when a thing has no level. */
export function levelWords(d: Device): string {
  const c = cap(d)
  if (c === 'light') return dimmable(d) ? 'Brighter or dimmer' : ''
  if (c === 'cover') return d.attrs.current_position != null ? 'Open or close' : ''
  if (c === 'climate') return d.state === 'off' ? '' : 'Warmer or cooler'
  if (c === 'media') return d.attrs.volume_level != null && d.state !== 'off' ? 'Louder or quieter' : ''
  return ''
}

/* The hint line under the highlight: each part is "KEY|words", parts split by ";". A key written ~Hold OK
   is plain words before the key. */
export function hintFor(d: Device, onBand: boolean): string {
  const ok = okOf(d), lv = levelWords(d)
  const parts = [`OK|${ok.label}`]
  if (onBand && lv) parts.unshift(`▲ ▼|${lv}`)
  if (!onBand && !('open' in ok)) parts.push('~Hold OK|More')
  return parts.join(';')
}
export function hintParts(hint: string): { keys: string[]; before: string; words: string }[] {
  return hint.split(';').filter(Boolean).map(p => {
    const [k, words = ''] = p.split('|')
    const before = k.startsWith('~') ? k.slice(1).replace(/\s*OK$/, '') : ''
    return { keys: k.startsWith('~') ? ['OK'] : k.split(' '), before, words }
  })
}

/* Pause, play and the volume work every speaker the record is on, so a pair of HomePods moves as one. Next is asked
   of the first only: the others follow the same source, and asking each would skip as many songs. */
export function playPause(d: Device, room: Room) {
  const o = okOf(d)
  if (!('open' in o)) for (const x of speakersOf(d, room)) perform(x, o.action, undefined, o.guess)
}
export function louder(d: Device, room: Room, dir: 1 | -1): boolean {
  let moved = false
  for (const x of speakersOf(d, room)) moved = !!step(x, dir) || moved
  return moved
}

/* ---------- moving the highlight ---------- */

export type Box = { left: number; top: number; right: number; bottom: number }
export type Dir = 'up' | 'down' | 'left' | 'right'
/* The nearest thing that way: wholly beyond this one's edge in that direction (a shorter card beside it is
   not "above" it), and something overlapping on the other axis counts as straight ahead, so a row of
   different heights still moves straight along. Returns its index, or -1 when nothing is that way. */
export function nearest(from: Box, others: Box[], dir: Dir): number {
  const flat = dir === 'left' || dir === 'right'
  const c = (b: Box) => ({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 })
  const a = c(from)
  let best = -1, score = Infinity
  others.forEach((o, i) => {
    if (o === from) return
    const gap = dir === 'right' ? o.left - from.right : dir === 'left' ? from.left - o.right : dir === 'down' ? o.top - from.bottom : from.top - o.bottom
    if (gap < -8) return
    const b = c(o)
    const apart = flat ? Math.max(from.top, o.top) >= Math.min(from.bottom, o.bottom) : Math.max(from.left, o.left) >= Math.min(from.right, o.right)
    const across = apart ? (flat ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x)) : 0
    const s = Math.max(0, gap) + across * 3 + (flat ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x)) * 0.01
    if (s < score) { score = s; best = i }
  })
  return best
}

/* ---------- the remote on the page ---------- */

export const lit = shallowRef<HTMLElement | null>(null)
export const HOLD_MS = 500

const PICKABLE = '[data-tv], button, a[href], input, select, textarea, [role="button"], [role="slider"], [tabindex]:not([tabindex="-1"])'

function scroller(el: Element): Element | null {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const s = getComputedStyle(n)
    if ((n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(s.overflowY)) || (n.scrollWidth > n.clientWidth + 1 && /auto|scroll/.test(s.overflowX))) return n
  }
  return null
}
/* What the remote can reach: on screen and not under anything else (a pane or a sheet covers what is
   beneath it, so only what is on top is reachable), or scrolled out of sight in the same list as the
   thing that is lit. The TV's own views (data-tv-own-scroll) bring their cards into view themselves,
   and a remote is pressed faster than a row slides, so all of theirs count while nothing covers them. */
function onTop(el: Element): boolean {
  const r = el.getBoundingClientRect()
  const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1)
  const hit = document.elementFromPoint(x, y)
  return !!hit && el.contains(hit)
}
function reachable(here: HTMLElement | null): HTMLElement[] {
  const home = here && scroller(here)
  const own = new Map<Element, boolean>()
  return [...document.querySelectorAll<HTMLElement>(PICKABLE)].filter(e => {
    if ((e as HTMLButtonElement).disabled || e.closest('[inert], [aria-hidden="true"]')) return false
    const r = e.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    const view = e.hasAttribute('data-tv') && e.closest('[data-tv-own-scroll]')
    if (view) { if (!own.has(view)) own.set(view, onTop(view)); return own.get(view)! }
    const x = r.left + r.width / 2, y = r.top + r.height / 2
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return !!home && home.contains(e)
    const hit = document.elementFromPoint(x, y)
    return !!hit && (e === hit || e.contains(hit))
  })
}

/* What was lit before, newest last: closing a pane comes back to the card that opened it. */
const before: HTMLElement[] = []
export function light(e: HTMLElement | null) {
  if (lit.value && lit.value !== e) { before.push(lit.value); if (before.length > 12) before.shift() }
  /* an attribute, not a class: Vue rewrites a bound class whole whenever the card's state changes */
  if (lit.value && lit.value !== e) lit.value.removeAttribute('data-lit')
  lit.value = e
  if (!e) return
  e.setAttribute('data-lit', '')
  e.focus({ preventScroll: true })
  if (!e.closest('[data-tv-own-scroll]')) e.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

/* A screen that asks for a number takes the digits, and Back while there is one to take off. */
export const typing = shallowRef<{ digit: (d: string) => void; back: () => boolean } | null>(null)

/* A key as it is counted: the browser's name for it, with any of Control, Alt or Meta held, since some remotes send a
   combination for one button. A key the browser cannot name keeps its code, so two such buttons still count apart. */
export function keyName(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'metaKey'>): string {
  const key = e.key === 'Unidentified' || !e.key ? `Unidentified:${e.code || '?'}` : e.key
  const held = [e.ctrlKey && key !== 'Control' && 'Control', e.altKey && key !== 'Alt' && 'Alt', e.metaKey && key !== 'Meta' && 'Meta']
  return [...held.filter(Boolean), key].join('+')
}

export type RemoteHooks = {
  /* Every press, counted, with who had the TV. Never a held key's repeats, and never typing into a field. */
  pressed?: (key: string, on: 'box' | 'house') => void
  /* Takes a press before anything else: the resting TV raising its band. True when it took it. */
  first?: (p: Press) => boolean
  back: () => boolean
  home: () => void
  color: (c: Color) => void
}

export function installRemote(hooks: RemoteHooks): () => void {
  let holding: number | undefined, held = false

  function settle(): HTMLElement | null {
    const here = lit.value
    const can = reachable(here)
    if (here && here.isConnected && can.includes(here)) return here
    let back: HTMLElement | undefined
    while ((back = before.pop())) if (back.isConnected && can.includes(back)) break
    const pick = back ?? can.find(e => e.hasAttribute('data-tv-start')) ?? can.find(e => e.hasAttribute('data-tv')) ?? can[0] ?? null
    light(pick)
    return null   // the press that found nothing lit only lights something
  }
  function move(dir: Dir) {
    const here = settle(); if (!here) return
    const can = reachable(here).filter(e => e !== here)
    const i = nearest(here.getBoundingClientRect(), can.map(e => e.getBoundingClientRect()), dir)
    if (i >= 0) light(can[i])
  }

  function down(e: KeyboardEvent) {
    const box = passTo.value
    if (!e.repeat && (box || !typable(e.target as Element))) hooks.pressed?.(keyName(e), box ? 'box' : 'house')
    if (box) {
      e.preventDefault(); e.stopImmediatePropagation()
      const p = pressOf(e.key)
      if (p === 'home' || p === 'red' || p === 'green' || p === 'yellow' || p === 'blue') { if (!e.repeat) box.back(); return }
      const k = boxKeyOf(e.key)
      if (k) box.key(k, e.repeat)
      return
    }
    if (typable(e.target as Element)) {
      if (e.key === 'Escape') { (e.target as HTMLElement).blur(); e.preventDefault() }
      return
    }
    const d = digitOf(e.key), taker = typing.value
    if (d && taker) { e.preventDefault(); e.stopImmediatePropagation(); taker.digit(d); return }
    const p = pressOf(e.key)
    if (!p) return
    if (p === 'back' && taker?.back()) { e.preventDefault(); e.stopImmediatePropagation(); return }
    if (hooks.first?.(p)) { e.preventDefault(); e.stopImmediatePropagation(); return }
    if (p === 'ok') {
      e.preventDefault(); e.stopImmediatePropagation()
      if (e.repeat || holding) return
      held = false
      holding = window.setTimeout(() => {
        held = true
        const here = lit.value
        if (here?.isConnected) here.dispatchEvent(new CustomEvent('tv-hold', { bubbles: false }))
      }, HOLD_MS)
      return
    }
    if (p === 'back') {
      e.preventDefault(); e.stopImmediatePropagation()
      // once what closed has slid away, the highlight goes back to what opened it
      if (!e.repeat && hooks.back()) window.setTimeout(settle, 400)
      return
    }
    if (p === 'home') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) hooks.home(); return }
    if (p === 'red' || p === 'green' || p === 'yellow' || p === 'blue') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) hooks.color(p); return }
    const here = lit.value
    if (here?.isConnected && (p === 'up' || p === 'down')) {
      // a slider takes Up and Down as its own; a band card takes them as its level
      if (here.getAttribute('role') === 'slider') return
      const level = new CustomEvent('tv-level', { detail: p === 'up' ? 1 : -1, cancelable: true })
      here.dispatchEvent(level)
      if (level.defaultPrevented) { e.preventDefault(); e.stopImmediatePropagation(); return }
    }
    e.preventDefault(); e.stopImmediatePropagation()
    move(p as Dir)
  }
  function up(e: KeyboardEvent) {
    if (passTo.value) { e.preventDefault(); e.stopImmediatePropagation(); return }
    if (pressOf(e.key) !== 'ok' || typable(e.target as Element)) return
    e.preventDefault(); e.stopImmediatePropagation()
    if (!holding) return
    clearTimeout(holding); holding = undefined
    if (held) return
    const here = settle()
    here?.click()
  }
  /* A click lights what it clicked, so a mouse on a TV agrees with the remote. */
  function clicked(e: MouseEvent) {
    const t = (e.target as Element | null)?.closest<HTMLElement>(PICKABLE)
    if (t && e.isTrusted) light(t)
  }
  window.addEventListener('keydown', down, true)
  window.addEventListener('keyup', up, true)
  window.addEventListener('click', clicked, true)
  return () => {
    window.removeEventListener('keydown', down, true)
    window.removeEventListener('keyup', up, true)
    window.removeEventListener('click', clicked, true)
    light(null)
  }
}
