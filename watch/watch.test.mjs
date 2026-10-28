/* The watcher's judgment: what counts as down, when the operator is written to, and what the Monday note says. The
   minute loop and the mail are Cloudflare's and are seen working only on the real thing (watch/README.md).
   `node --test watch/watch.test.mjs` */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHECKS, digest, probe, step } from './worker.js'

const MIN = 60_000
const answer = (body, init = {}) => async () => new Response(body, { status: 200, ...init })
const check = (name) => CHECKS.find((c) => c.name === name)
const SAFE = { 'content-security-policy': "script-src 'self'; connect-src 'self'", 'content-type': 'text/html' }

test('one miss is the internet; the second writes to the operator, once, and coming back writes again', () => {
  const down = { name: 'The relay', ok: false, why: "couldn't be reached" }, up = { name: 'The relay', ok: true }
  let s = step(undefined, down, 0)
  assert.equal(s.say, undefined)
  s = step(s.state, down, MIN)
  assert.equal(s.say.subject, 'Down: The relay')
  assert.match(s.say.text, /The relay couldn't be reached\./)
  assert.ok(s.began)
  s = step(s.state, down, 2 * MIN)
  assert.equal(s.say, undefined, 'not again every minute it stays down')
  s = step(s.state, up, 7 * MIN)
  assert.equal(s.say.subject, 'Back: The relay')
  assert.match(s.say.text, /after 7 minutes/)
  assert.ok(s.ended)
  assert.equal(step(step(undefined, down, 0).state, up, MIN).say, undefined, 'a single miss that came back says nothing')
})

test('the site is down to the watcher when it breaks its promise, not only when it stops answering', async () => {
  const page = check('The front page')
  assert.equal((await probe(page, {}, {}, answer('<script src="/site.js"></script>', { headers: SAFE }))).ok, true)
  assert.match((await probe(page, {}, {}, answer('<p>hi</p>', { headers: { 'content-type': 'text/html' } }))).why, /is missing the header/)
  assert.match((await probe(page, {}, {}, answer('<script defer src="https://static.cloudflareinsights.com/beacon.min.js"></script>', { headers: SAFE }))).why, /another site/)
  assert.match((await probe(page, {}, {}, answer('<script data-cf-beacon="{}"></script>', { headers: SAFE }))).why, /beacon/)
})

test('the install command is down if it would hand bash a web page', async () => {
  const install = check('The install command')
  assert.equal((await probe(install, {}, {}, answer('#!/usr/bin/env bash\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } }))).ok, true)
  assert.match((await probe(install, {}, {}, answer('<!doctype html>', { headers: { 'content-type': 'text/html' } }))).why, /bash would run/)
})

test("the relay is asked with the watcher's key, and is down when its disk is nearly full", async () => {
  const relay = check('The relay')
  let sent
  const fine = { ok: true, houses: { names: 3 }, box: { disk_used: 0.4, memory_used: 0.5 } }
  const seen = {}
  const r = await probe(relay, { RELAY_KEY: 'k' }, seen, async (url, init) => { sent = init.headers; return Response.json(fine) })
  assert.equal(sent.Authorization, 'Bearer k')
  assert.ok(r.ok)
  assert.deepEqual(seen.relay, fine)
  assert.match((await probe(relay, {}, {}, async () => Response.json({ ok: true }))).why, /key/)
  assert.match((await probe(relay, { RELAY_KEY: 'k' }, {}, async () => Response.json({ ...fine, box: { disk_used: 0.9 } }))).why, /has used 90% of its disk/)
  assert.equal(sent && (await probe(check('The address offer'), { RELAY_KEY: 'k' }, {}, async (u, i) => { sent = i.headers; return Response.json({}) })).ok, true)
  assert.equal(sent.Authorization, undefined, 'the key goes to the relay alone')
})

test('a check that cannot be reached, or answers wrongly, says why', async () => {
  const r = await probe(check('The Houses app'), {}, {}, async () => { throw new TypeError('fetch failed') })
  assert.equal(r.ok, false)
  assert.match(r.why, /couldn't be reached/)
  assert.equal((await probe(check('The Houses app'), {}, {}, async () => new Response('', { status: 502 }))).why, 'answered 502')
})

test('every check has its own name and is asked over https', () => {
  assert.equal(new Set(CHECKS.map((c) => c.name)).size, CHECKS.length)
  for (const c of CHECKS) assert.match(c.url, /^https:\/\//)
  assert.deepEqual(CHECKS.filter((c) => c.keyed).map((c) => c.url), ['https://api.elyir.app/alive'])
})

test('the Monday note says the week in numbers', () => {
  const text = digest({
    checks: [{ name: 'The relay', n: 10080, up: 10079, p95: 140 }, { name: 'The front page', n: 10080, up: 10080, p95: 60 }],
    incidents: [{ name: 'The relay', began: 0, ended: 3 * MIN }],
    relayNow: { houses: { names: 5, carried: 4, dialed_in_day: 3, dialed_in_week: 4, invites_open: 1 }, box: { disk_used: 0.31, memory_used: 0.42, load: [0.1, 0.2, 0.3] } },
    relayBefore: { houses: { names: 4, carried: 4, dialed_in_day: 2, dialed_in_week: 4, invites_open: 1 } },
    waitlist: { week: 2, total: 17 },
    downloads: { total: 120, before: 100 },
  })
  assert.match(text, /The relay: 99\.99%, 140 ms/)
  assert.match(text, /The front page: 100\.00%, 60 ms/)
  assert.match(text, /The relay: .*, 3 minutes/)
  assert.match(text, /Houses with a name: 5 \(was 4\); carried: 4$/m)
  assert.match(text, /2 joined this week, 17 in all/)
  assert.match(text, /120 in all, 20 this week/)
  assert.match(digest({ checks: [], incidents: [] }), /Nothing was down this week\./)
})
