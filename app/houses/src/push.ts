// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/*
 * One yes on this phone, for every house it has joined (design/notify/, B, chosen 20 October 2026).
 *
 * A browser allows one push subscription per worker, and this app's one worker serves every house, so every house
 * has to sign this phone's notifications with the same key (docs/apps.md, Decided). The phone makes that P-256 key
 * once, keeps it, subscribes with its public half, and hands each house the subscription and the key; a house
 * added later gets the same, and turning it off takes it back from every house. The printer app does it this way.
 *
 * The rules the row leans on are plain functions, so tests/push.test.ts can pin them.
 */
import { reactive } from 'vue'
import { keep, kept } from './db'
import { baseOf, save, state, type House } from './houses'

export type PushState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on' | 'partial'
export type Phone = { ua: string; touch: number; secure: boolean; standalone: boolean; worker: boolean; push: boolean; notify: boolean }
type Vapid = { publicKey: string; privateKey: string }

// ---- the pure parts ----------------------------------------------------------------------------

/** iPadOS Safari calls itself a Mac; the touch screen gives it away. */
export const onApple = (ua: string, touch = 0) => /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1)

/** Whose push service carries a notification to this phone: every browser on an iPhone uses Apple's, Chrome on
    Android uses Google's, and Firefox anywhere uses Mozilla's, which is named only as the browser's maker. */
export function makerOf(ua: string, touch = 0): string {
  if (onApple(ua, touch)) return 'Apple'
  if (/Android/.test(ua) && !/Firefox/.test(ua)) return 'Google'
  return 'your browser’s maker'
}

/** What the phone itself rules out before any house is asked, or null when the switch can work. */
export function ruledOut(p: Phone, permission: NotificationPermission | null): PushState | null {
  if (!p.secure) return 'unsupported'
  if (onApple(p.ua, p.touch) && !p.standalone) return 'needs-install'
  if (!p.worker || !p.push || !p.notify || !permission) return 'unsupported'
  if (permission === 'denied') return 'blocked'
  return null
}

/** Subscribed, it is on when every house holds the key; a house that could not be told leaves it partial. */
export const overall = (subscribed: boolean, told: boolean[]): PushState =>
  !subscribed ? 'off' : told.every(Boolean) ? 'on' : 'partial'

const listed = (names: string[]) => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

/** The line under Notifications. */
export function lineFor(s: PushState, missing: string[] = [], ua = '', touch = 0): string {
  switch (s) {
    case 'unsupported': return 'This browser can’t show notifications.'
    case 'needs-install': return `On ${/iPad/.test(ua) || (/Macintosh/.test(ua) && touch > 1) ? 'iPad' : 'iPhone'} they work only from the Home Screen. Add Houses there first.`
    case 'blocked': return 'This phone is set not to allow them. You can change that in Settings.'
    case 'partial': return `${listed(missing)} can’t tell this phone yet. ${missing.length > 1 ? 'They' : 'It'} will be asked again.`
    default: return 'Your houses can tell this phone when something needs you.'
  }
}

export const fineFor = (ua: string, touch = 0) => {
  const maker = makerOf(ua, touch)
  return `Each house decides what is worth telling you. ${maker[0].toUpperCase()}${maker.slice(1)} sees that one of your houses sent this phone something, and when, never what.`
}

/** The house a tapped notification names, if this phone has it. */
export const askedFor = (label: unknown, houses: { id: string }[]): string | null =>
  typeof label === 'string' && houses.some(h => h.id === label) ? label : null

export const b64u = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export function unb64u(s: string): Uint8Array<ArrayBuffer> {
  const raw = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// ---- this phone --------------------------------------------------------------------------------

export const pushing = reactive({ state: 'off' as PushState, missing: [] as string[], busy: false })

const phone = (): Phone => ({
  ua: navigator.userAgent, touch: navigator.maxTouchPoints || 0, secure: window.isSecureContext,
  standalone: matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
  worker: 'serviceWorker' in navigator, push: 'PushManager' in window, notify: 'Notification' in window,
})
const permission = () => ('Notification' in window ? Notification.permission : null)

let registration: Promise<ServiceWorkerRegistration> | null = null
const worker = () => (registration ??= navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready))
const subscription = async () => (await worker()).pushManager.getSubscription()

/** This phone's signing key: made once, kept. */
async function vapid(): Promise<Vapid> {
  const saved = await kept<Vapid>('vapid')
  if (saved) return saved
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
  const key = { publicKey: b64u(await crypto.subtle.exportKey('raw', pair.publicKey)), privateKey: (await crypto.subtle.exportKey('jwk', pair.privateKey)).d! }
  await keep('vapid', key)
  return key
}

function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const k = sub.options.applicationServerKey
  if (!k) return false
  const a = new Uint8Array(k)
  return a.length === key.length && a.every((v, i) => v === key[i])
}

const ask = (h: House, init: RequestInit) => fetch(`${baseOf(h)}/phones/me/push`, {
  ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${h.token}` }, signal: AbortSignal.timeout(8000),
})

async function tell(h: House, sub: PushSubscription, key: Vapid) {
  try {
    const r = await ask(h, { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON(), vapid: key, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }) })
    if (r.ok) { h.push = true; await save(h) }
  } catch { /* not answering: asked again the next time Houses opens */ }
}

/** What the house itself says, when it says: a subscription it threw away is one to hand it again. */
async function confirm(h: House) {
  try {
    const r = await fetch(`${baseOf(h)}/phones/me`, { headers: { Authorization: `Bearer ${h.token}` }, signal: AbortSignal.timeout(6000), cache: 'no-store' })
    const me = r.ok ? await r.json() : null
    if (me?.phone && !!me.phone.push !== !!h.push) { h.push = !!me.phone.push; await save(h) }
  } catch { /* keep what it said last */ }
}

function settle(subscribed: boolean) {
  pushing.state = overall(subscribed, state.houses.map(h => !!h.push))
  pushing.missing = subscribed ? state.houses.filter(h => !h.push).map(h => h.name) : []
}

/** Where things stand, and any house that has not got the key yet is handed it: the phone already said yes. */
export async function look(again = false) {
  const no = ruledOut(phone(), permission())
  if (no) { pushing.state = no; pushing.missing = []; return }
  const sub = await subscription()
  settle(!!sub)
  if (!sub || !again) return
  await Promise.all(state.houses.map(confirm))
  const key = await vapid()
  await Promise.all(state.houses.filter(h => !h.push).map(h => tell(h, sub, key)))
  settle(true)
}

/** From the tap itself: iOS only asks for permission inside one, so nothing is awaited before asking. */
export async function turnOn() {
  const asked = Notification.requestPermission()
  pushing.busy = true
  try {
    const reg = await worker()
    if ((await asked) !== 'granted') return
    const key = await vapid()
    const pub = unb64u(key.publicKey)
    let sub = await reg.pushManager.getSubscription()
    if (sub && !sameKey(sub, pub)) { await sub.unsubscribe(); sub = null }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pub })
    const s = sub
    await Promise.all(state.houses.map(async h => { h.push = false; await save(h); await tell(h, s, key) }))
  } finally {
    pushing.busy = false
    await look()
  }
}

export async function turnOff() {
  pushing.busy = true
  try {
    // A house that misses this still holds the key, but the push service turns it away once the phone has
    // unsubscribed, and the house drops it then (brain/hub/pusher.py, GONE).
    await Promise.all(state.houses.map(async h => {
      await ask(h, { method: 'DELETE' }).catch(() => null)
      h.push = false; await save(h)
    }))
    await (await subscription())?.unsubscribe()
  } finally {
    pushing.busy = false
    await look()
  }
}

/** A house added while notifications are on is handed the key as it joins. */
export async function tellNew(id: string) {
  if (ruledOut(phone(), permission())) return
  const h = state.houses.find(x => x.id === id)
  const sub = h && await subscription()
  if (h && sub) await tell(h, sub, await vapid())
}
