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
 * Inside the store app on iOS there is no web push. The page asks the app instead, inside the tap, and the app
 * answers with the phone's APNs token and a key of its own whose private half never leaves it; each house is
 * handed those, seals what it has to say to that key, and gives it to the sender Elyir runs (docs/apps.md, What
 * the page gives the shell). On Android the part stays hidden until FCM.
 *
 * The rules the row leans on are plain functions, so tests/push.test.ts can pin them.
 */
import { reactive } from 'vue'
import { keep, kept } from './db'
import { baseOf, save, state, type House } from './houses'
import { osOf, postToShell, shell, type Native, type ShellOs } from './shell'

export type PushState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on' | 'partial' | 'failed'
export type Identity = { kind: 'apns'; token: string; env: 'sandbox' | 'production'; p256dh: string; auth: string }
export type Answer = { identity: Identity } | { denied: true } | { error: string }
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
    case 'failed': return 'This phone couldn’t turn them on just now. Try again in a moment.'
    default: return 'Your houses can tell this phone when something needs you.'
  }
}

export const fineFor = (ua: string, touch = 0, os: ShellOs | null = null) => {
  const maker = os === 'ios' ? 'Apple' : makerOf(ua, touch)
  return `Each house decides what is worth telling you. ${maker[0].toUpperCase()}${maker.slice(1)} sees that one of your houses sent this phone something, and when, never what.`
}

/** Where the part is drawn: everywhere but the Android app, which has no way to be told until FCM. */
export const pushShown = (os: ShellOs | null) => os !== 'android'

/** What the iOS app answered when asked for this phone's push identity, checked before any house is handed it. */
export function answerOf(detail: unknown): Answer {
  const d = (detail ?? {}) as Record<string, unknown>
  if (d.denied === true) return { denied: true }
  if (typeof d.error === 'string') return { error: d.error || 'unknown' }
  const bytes = (v: unknown) => { try { return typeof v === 'string' && /^[A-Za-z0-9_-]+=*$/.test(v) ? unb64u(v.replace(/=+$/, '')) : null } catch { return null } }
  const key = bytes(d.p256dh), auth = bytes(d.auth)
  const ok = d.kind === 'apns' && typeof d.token === 'string' && /^[0-9a-fA-F]{64,200}$/.test(d.token) && (d.env === 'sandbox' || d.env === 'production') &&
    key?.length === 65 && key[0] === 4 && auth?.length === 16
  return ok ? { identity: { kind: 'apns', token: d.token as string, env: d.env as Identity['env'], p256dh: d.p256dh as string, auth: d.auth as string } } : { error: 'not an identity' }
}

/** What a house is handed for a phone in the store app (brain/hub/pusher.py, checked_apns). */
export const apnsBody = (id: Identity, tz: string) => ({ apns: { token: id.token, env: id.env, p256dh: id.p256dh, auth: id.auth }, tz })

type Listens = Pick<Window, 'addEventListener' | 'removeEventListener'>

/** Asks the iOS app for this phone's push identity. Posted at once, so a tap that calls this is still the tap the
    app needs to ask the phone's permission inside. No app to ask, or no answer in time, is an error. */
export function askShell(os: ShellOs | null = osOf(shell), w: Listens & Native = window as Listens & Native, wait = 120_000): Promise<Answer> {
  return new Promise(resolve => {
    let finished = false
    const done = (a: Answer) => { if (finished) return; finished = true; w.removeEventListener('houses:push-identity', heard); resolve(a) }
    const heard = (ev: Event) => done(answerOf((ev as CustomEvent).detail))
    w.addEventListener('houses:push-identity', heard)
    if (os !== 'ios' || !postToShell({ type: 'houses:push-identity' }, os, w)) return done({ error: 'no app to ask' })
    setTimeout(() => done({ error: 'no answer' }), wait)
  })
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

const inApp = () => osOf(shell) === 'ios'
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

const ask = (h: House, init: RequestInit) => fetch(`${baseOf(h)}/phones/me/push`, {
  ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${h.token}` }, signal: AbortSignal.timeout(8000),
})

const webBody = (sub: PushSubscription, key: Vapid) => ({ subscription: sub.toJSON(), vapid: key, tz: zone() })

async function tell(h: House, body: object) {
  try {
    const r = await ask(h, { method: 'POST', body: JSON.stringify(body) })
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
  if (inApp()) return lookInApp(again)
  const no = ruledOut(phone(), permission())
  if (no) { pushing.state = no; pushing.missing = []; return }
  const sub = await subscription()
  settle(!!sub)
  if (!sub || !again) return
  await Promise.all(state.houses.map(confirm))
  const body = webBody(sub, await vapid())
  await Promise.all(state.houses.filter(h => !h.push).map(h => tell(h, body)))
  settle(true)
}

async function lookInApp(again: boolean) {
  const id = await kept<Identity | null>('apns')
  settle(!!id)
  if (!id || !again) return
  await Promise.all(state.houses.map(confirm))
  await Promise.all(state.houses.filter(h => !h.push).map(h => tell(h, apnsBody(id, zone()))))
  settle(true)
}

/** In the iOS app: the app is asked inside the tap, and every house is handed what it answered. */
async function turnOnInApp() {
  const asked = askShell()
  pushing.busy = true
  try {
    const got = await asked
    if ('denied' in got) { pushing.state = 'blocked'; pushing.missing = []; return }
    if ('error' in got) { pushing.state = 'failed'; pushing.missing = []; return }
    await keep('apns', got.identity)
    const body = apnsBody(got.identity, zone())
    await Promise.all(state.houses.map(async h => { h.push = false; await save(h); await tell(h, body) }))
    settle(true)
  } finally {
    pushing.busy = false
  }
}

async function turnOffInApp() {
  pushing.busy = true
  try {
    postToShell({ type: 'houses:push-off' })
    await Promise.all(state.houses.map(async h => {
      await ask(h, { method: 'DELETE' }).catch(() => null)
      h.push = false; await save(h)
    }))
    await keep('apns', null)
    settle(false)
  } finally {
    pushing.busy = false
  }
}

/** From the tap itself: iOS only asks for permission inside one, so nothing is awaited before asking. */
export async function turnOn() {
  if (inApp()) return turnOnInApp()
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
    const body = webBody(sub, key)
    await Promise.all(state.houses.map(async h => { h.push = false; await save(h); await tell(h, body) }))
  } finally {
    pushing.busy = false
    await look()
  }
}

export async function turnOff() {
  if (inApp()) return turnOffInApp()
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
  const h = state.houses.find(x => x.id === id)
  if (!h) return
  if (inApp()) {
    const identity = await kept<Identity | null>('apns')
    if (identity) await tell(h, apnsBody(identity, zone()))
    return
  }
  if (ruledOut(phone(), permission())) return
  const sub = await subscription()
  if (sub) await tell(h, webBody(sub, await vapid()))
}
