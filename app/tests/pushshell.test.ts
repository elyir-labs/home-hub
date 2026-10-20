// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Notifications inside the iOS app (docs/apps.md, What the page gives the shell): the switch asks the app for this
   phone's push identity inside the tap, and every house is handed what it answered. The app, the houses and the
   phone's storage are played here; the identity is made fresh each run, since a written-down one reads as a
   credential to the secret scan. */
import { createECDH, randomBytes } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const kv = new Map<string, unknown>()
vi.mock('../houses/src/db', () => ({
  all: async () => [], put: async () => 'ok', del: async () => undefined,
  kept: async (k: string) => kv.get(k), keep: async (k: string, v: unknown) => { kv.set(k, v); return k },
}))

type Push = typeof import('../houses/src/push')
type Houses = typeof import('../houses/src/houses')
let push: Push, houses: Houses

const identity = (extra: Record<string, unknown> = {}) => {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys()
  return { kind: 'apns', token: randomBytes(32).toString('hex'), env: 'sandbox', p256dh: ecdh.getPublicKey('base64url'), auth: randomBytes(16).toString('base64url'), ...extra }
}

/* The app's half: a handler where WKWebView puts one, answering the identity question the way the app will. */
let toApp: { type: string }[] = []
let answer: unknown = null
function theApp() {
  toApp = []
  ;(window as unknown as { webkit: unknown }).webkit = { messageHandlers: { houses: { postMessage: (m: { type: string }) => {
    toApp.push(m)
    if (m.type === 'houses:push-identity') setTimeout(() => window.dispatchEvent(new CustomEvent('houses:push-identity', { detail: answer })), 0)
  } } } }
}

let asked: { url: string; method: string; body: unknown; auth: string }[] = []
let failing = new Set<string>()
beforeAll(async () => {
  sessionStorage.setItem('houses:shell', '&shell=ios&store=US')
  vi.resetModules()
  push = await import('../houses/src/push')
  houses = await import('../houses/src/houses')
})

beforeEach(() => {
  kv.clear(); asked = []; failing = new Set(); theApp()
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const headers = init.headers as Record<string, string>
    asked.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body as string) : null, auth: headers?.Authorization })
    if ([...failing].some(f => url.startsWith(f))) throw new TypeError('not answering')
    return new Response(JSON.stringify({ phone: { push: true } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  const house = (id: string, name: string) => ({ id, name, origin: `https://${id}.elyir.app`, lan: '', token: `pass-${id}`, added: 1, opened: 1, reach: 'away' as const, glance: null })
  houses.state.houses = [house('maple-court', 'Home'), house('lake', 'Lake house')]
  push.pushing.state = 'off'
})

describe('what the app answers, checked before a house is handed it', () => {
  it('an identity, as the contract has it', () => {
    const id = identity()
    expect(push.answerOf(id)).toEqual({ identity: id })
    expect(push.answerOf({ ...id, env: 'production', extra: 1 })).toEqual({ identity: { ...id, env: 'production' } })
  })
  it('no, or an error, said as such', () => {
    expect(push.answerOf({ denied: true })).toEqual({ denied: true })
    expect(push.answerOf({ error: 'no aps-environment' })).toEqual({ error: 'no aps-environment' })
  })
  it('anything else is an error, never handed on', () => {
    const id = identity()
    for (const bad of [null, undefined, 'x', {}, { ...id, kind: 'fcm' }, { ...id, token: 'ab'.repeat(31) }, { ...id, token: 'zz'.repeat(32) },
      { ...id, env: 'staging' }, { ...id, p256dh: id.auth }, { ...id, p256dh: 'not base64!' }, { ...id, auth: id.p256dh }]) {
      expect('error' in push.answerOf(bad), JSON.stringify(bad)).toBe(true)
    }
  })
  it('a house is handed the token, the environment, the key and the zone, and nothing else', () => {
    const { identity: id } = push.answerOf(identity()) as { identity: import('../houses/src/push').Identity }
    expect(push.apnsBody(id, 'America/Chicago')).toEqual({ apns: { token: id.token, env: id.env, p256dh: id.p256dh, auth: id.auth }, tz: 'America/Chicago' })
  })
})

describe('asking the app', () => {
  it('posts the question to the iOS handler at once, and hears the answer', async () => {
    const id = identity(); answer = id
    const got = push.askShell('ios')
    expect(toApp).toEqual([{ type: 'houses:push-identity' }])
    expect(await got).toEqual({ identity: id })
  })
  it('with no app to ask, or on Android, or with no answer, it is an error', async () => {
    expect(await push.askShell('ios', { addEventListener() {}, removeEventListener() {} })).toEqual({ error: 'no app to ask' })
    expect(await push.askShell('android')).toEqual({ error: 'no app to ask' })
    expect(await push.askShell(null)).toEqual({ error: 'no app to ask' })
    const silent = { webkit: { messageHandlers: { houses: { postMessage: () => {} } } }, addEventListener() {}, removeEventListener() {} }
    expect(await push.askShell('ios', silent, 5)).toEqual({ error: 'no answer' })
  })
})

describe('the part, in the apps', () => {
  it('shows in the iOS app and in a browser, and not on Android until FCM', () => {
    expect(push.pushShown('ios')).toBe(true)
    expect(push.pushShown(null)).toBe(true)
    expect(push.pushShown('android')).toBe(false)
  })
  it('names Apple in the fine print in the iOS app, whatever the web view calls itself', () => {
    expect(push.fineFor('Mozilla/5.0 (Macintosh)', 0, 'ios')).toContain('. Apple sees that one of your houses sent this phone something')
  })
})

describe('the switch, in the iOS app', () => {
  it('on: the app is asked, and every house is handed the identity with this phone’s pass', async () => {
    const id = identity(); answer = id
    await push.turnOn()
    expect(toApp.filter(m => m.type === 'houses:push-identity')).toHaveLength(1)
    const posts = asked.filter(a => a.method === 'POST')
    expect(posts.map(a => [a.url, a.auth]).sort()).toEqual([
      ['https://lake.elyir.app/phones/me/push', 'Bearer pass-lake'], ['https://maple-court.elyir.app/phones/me/push', 'Bearer pass-maple-court']])
    for (const p of posts) expect(p.body).toEqual({ apns: { token: id.token, env: 'sandbox', p256dh: id.p256dh, auth: id.auth }, tz: 'America/Chicago' })
    expect(push.pushing.state).toBe('on')
    expect(houses.state.houses.every(h => h.push)).toBe(true)
  })

  it('a house that could not be told is named', async () => {
    answer = identity(); failing.add('https://lake.')
    await push.turnOn()
    expect(push.pushing.state).toBe('partial')
    expect(push.lineFor(push.pushing.state, push.pushing.missing)).toBe('Lake house can’t tell this phone yet. It will be asked again.')
  })

  it('a phone set not to allow them says so, and no house is asked', async () => {
    answer = { denied: true }
    await push.turnOn()
    expect(push.pushing.state).toBe('blocked')
    expect(push.lineFor(push.pushing.state)).toBe('This phone is set not to allow them. You can change that in Settings.')
    expect(asked).toEqual([])
  })

  it('an app that could not get one says to try again, and no house is asked', async () => {
    answer = { error: 'registration failed' }
    await push.turnOn()
    expect(push.pushing.state).toBe('failed')
    expect(push.lineFor(push.pushing.state)).toBe('This phone couldn’t turn them on just now. Try again in a moment.')
    expect(asked).toEqual([])
  })

  it('opening Houses again finds it on, and hands it to a house that missed it', async () => {
    answer = identity(); failing.add('https://lake.')
    await push.turnOn()
    failing.clear(); asked = []
    houses.state.houses[1].push = false
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      asked.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body as string) : null, auth: '' })
      const told = url.startsWith('https://maple-court.') || init.method === 'POST'
      return new Response(JSON.stringify({ phone: { push: told } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    await push.look(true)
    expect(asked.filter(a => a.method === 'POST').map(a => a.url)).toEqual(['https://lake.elyir.app/phones/me/push'])
    expect(push.pushing.state).toBe('on')
  })

  it('a house added while it is on is handed it as it joins', async () => {
    answer = identity()
    await push.turnOn()
    asked = []
    await push.tellNew('lake')
    expect(asked.map(a => [a.method, a.url])).toEqual([['POST', 'https://lake.elyir.app/phones/me/push']])
  })

  it('off: the app is told, and every house lets it go', async () => {
    answer = identity()
    await push.turnOn()
    asked = []
    await push.turnOff()
    expect(toApp.at(-1)).toEqual({ type: 'houses:push-off' })
    expect(asked.map(a => [a.method, a.url]).sort()).toEqual([['DELETE', 'https://lake.elyir.app/phones/me/push'], ['DELETE', 'https://maple-court.elyir.app/phones/me/push']])
    expect(push.pushing.state).toBe('off')
    await push.look()
    expect(push.pushing.state).toBe('off')
    asked = []
    await push.tellNew('lake')
    expect(asked).toEqual([])
  })
})
