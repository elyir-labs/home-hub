/* The watcher's page: design/watch's chosen board (A's rows with B's chart under them), what it says, and that it shows
   nothing to anybody Access did not let in. The arrangement assertions fail on purpose if the page drifts from the
   board; change the board first (AGENTS.md, section 1). `node --test watch/page.test.mjs` */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { render, shape } from './page.js'
import worker, { CHECKS, rollUp, signedIn } from './worker.js'

const MIN = 60_000, H = 60 * MIN, D = 24 * H
const NOW = Date.UTC(2026, 9, 29, 14, 32)
const names = CHECKS.map((c) => c.name)
const OUTAGE = Date.UTC(2026, 9, 27, 3, 12)

function week(over = {}) {
  const hours = []
  for (const name of names) for (let h = Math.floor(NOW / H) * H - 3 * D; h < NOW - H; h += H) hours.push({ name, hour: h, n: 60, up: 60, p95: 80 })
  const today = Math.floor(NOW / D) * D
  return {
    now: NOW, names, latest: names.map((name) => ({ name, at: NOW - 20_000, ok: 1 })), state: {}, hours,
    incidents: [{ name: 'The relay', began: OUTAGE, ended: OUTAGE + 7 * MIN }, { name: 'The address offer', began: OUTAGE + MIN, ended: OUTAGE + 7 * MIN }],
    relay: { houses: { names: 5, carried: 4 }, box: { disk_used: 0.31, memory_used: 0.42, load: [0.12] } },
    carried: [1, 1, 2, 2, 3, 3, 4, 4],
    loads: [{ day: today, path: '/', n: 30 }, { day: today - 6 * D, path: '/install', n: 7 }, { day: today - 7 * D, path: '/', n: 20 }, { day: today - 7 * D, path: '/install', n: 5 }],
    joins: [new Date(NOW - D).toISOString(), new Date(NOW - 9 * D).toISOString()], joinedTotal: 31,
    downloads: [100, 101, 103, 106, 110, 115, 121, 128, 140],
    ...over,
  }
}
const page = (over) => render(shape(week(over)))

test("the page is the chosen board: the answer, every service's row, the week beside them, the chart under them", () => {
  const html = page()
  const at = (s) => { const i = html.indexOf(s); assert.ok(i > 0, `missing ${s}`); return i }
  assert.ok(at('class="answer"') < at('class="card rows"'))
  assert.ok(at('class="card rows"') < at('class="side"'))
  assert.ok(at('class="side"') < at('class="card chart"'))
  assert.ok(at('class="card chart"') < at('class="card pages"'))
  assert.match(html, /grid-template-columns: 1fr 420px; grid-template-areas: "rows side" "chart pages"/, 'B\'s chart sits under A\'s rows, the week beside them')
  assert.match(html, /grid-template-areas: "rows" "chart" "side" "pages"/, 'one column puts the chart straight after the services')
  const rows = html.match(/<div class="svc">/g)
  assert.equal(rows.length, CHECKS.length, 'a row for every service the watcher asks')
  for (const row of html.split('<div class="svc">').slice(1)) assert.equal((row.split('</div>')[0].match(/<i /g) || []).length, 42, 'seven days, four hours a mark')
  assert.equal((html.match(/<div class="card tile">/g) || []).length, 4)
  assert.equal((html.match(/class="col now"/g) || []).length, 2, "this week lit, once for each width's chart")
  assert.equal((html.match(/class="col"/g) || []).length, 14, 'and seven weeks before it')
})

test('it answers the question first, and an outage that took two services is one outage', () => {
  const html = page()
  assert.match(html, /<h1>Everything is up\.<\/h1>/)
  assert.match(html, /All 9 answered in the last minute/)
  assert.match(html, /One outage this week: the relay and the address offer, 7 minutes, Tue 03:12 UTC\./)
  assert.match(page({ incidents: [] }), /Nothing was down this week\./)
})

test('a service down changes the sentence, its row and its last mark, and nothing else moves', () => {
  const v = shape(week({
    state: { 'The relay': { told: 1, down_since: NOW - 4 * MIN, why: "couldn't be reached (fetch failed)" } },
    latest: names.map((name) => ({ name, at: NOW - 20_000, ok: name === 'The relay' ? 0 : 1 })),
    incidents: [{ name: 'The relay', began: NOW - 4 * MIN, ended: null }],
  }))
  assert.equal(v.answer.headline, 'The relay is down.')
  assert.equal(v.answer.said, "The relay couldn't be reached (fetch failed), since 14:28 UTC.")
  assert.deepEqual(v.answer.pill, { ok: false, text: '8 of 9 answered in the last minute' })
  const relay = v.services.find((s) => s.name === 'The relay')
  assert.equal(relay.up, false)
  assert.equal(relay.marks.at(-1), 'down')
  assert.ok(v.services.filter((s) => s.name !== 'The relay').every((s) => s.up))
})

test('a watcher that has stopped checking says so, rather than showing the last good minute', () => {
  const v = shape(week({ latest: names.map((name) => ({ name, at: NOW - 12 * MIN, ok: 1 })) }))
  assert.deepEqual(v.answer.pill, { ok: false, text: 'The last check was 12 minutes ago' })
})

test('a mark is red where the service was down, and empty before the watcher was watching', () => {
  const relay = shape(week()).services.find((s) => s.name === 'The relay')
  const red = relay.marks.flatMap((m, i) => (m === 'down' ? [i] : []))
  assert.equal(red.length, 1)
  assert.equal(relay.marks.lastIndexOf('none') < red[0], true)
  assert.equal(relay.marks[0], 'none', 'three days of hours leave the first four days empty')
  assert.equal(relay.uptime, '100.00%')
  assert.equal(relay.ms, 80)
})

test('weeks are the last seven days and the six before them, as in the Monday note', () => {
  const v = shape(week())
  assert.deepEqual(v.chart.values.slice(-2), [25, 37], 'today and six days ago are this week; seven days ago is the week before')
  assert.equal(v.chart.change, '+48%')
  assert.equal(v.chart.labels.at(-1), 'Oct 23')
  assert.deepEqual(v.pages.map((p) => [p.name, p.now, p.was]).slice(0, 2), [['The front page', 30, 20], ['The install command', 7, 5]])
  const [joined, install, carried, downloads] = v.tiles
  assert.equal(joined.value, 1)
  assert.equal(joined.said, '<b>31</b> in all')
  assert.equal(install.said, 'fetched, <b>+40%</b>')
  assert.equal(carried.said, 'of <b>5</b> with a name')
  assert.equal(downloads.value, 12)
  assert.deepEqual(downloads.series, [1, 2, 3, 4, 5, 6, 7, 12])
})

test('a page with nothing yet still draws, and says what it does not know', () => {
  const html = render(shape({ now: NOW, names, latest: [], state: {}, hours: [], incidents: [], relay: null, carried: Array(8).fill(null), loads: [], joins: [], joinedTotal: 0, downloads: Array(9).fill(null) }))
  assert.match(html, /No checks yet/)
  assert.match(html, /The relay has not reported yet\./)
  assert.ok(!/NaN|undefined|Infinity/.test(html))
})

test('the page asks nothing of anybody but our own site, and runs no script', () => {
  const html = page()
  assert.ok(!/<script/i.test(html))
  const elsewhere = [...html.matchAll(/https?:\/\/[^'")\s]+/g)].map((m) => m[0]).filter((u) => !u.startsWith('http://www.w3.org'))
  assert.deepEqual(elsewhere, ['https://hub.elyir.com/fonts/instrument-sans.woff2'])
})

test('an hour is rolled up into how often each service answered and how quickly', () => {
  const rows = [{ name: 'a', ok: 1, ms: 50 }, { name: 'a', ok: 0, ms: 10_000 }, { name: 'a', ok: 1, ms: 70 }, { name: 'b', ok: 1, ms: 9 }]
  assert.deepEqual(rollUp(rows, 7), [{ name: 'a', hour: 7, n: 3, up: 2, p95: 70 }, { name: 'b', hour: 7, n: 1, up: 1, p95: 9 }])
})

// Access's tokens, signed here with a key of our own and handed over as its certificate list.
const TEAM = 'elyir.cloudflareaccess.com', AUD = 'aud-of-the-watch-app'
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
const certs = async () => Response.json({ keys: [{ ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1' }] })
const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
async function token(claims = {}, head = {}) {
  const body = `${enc({ alg: 'RS256', kid: 'k1', ...head })}.${enc({ iss: `https://${TEAM}`, aud: [AUD], exp: NOW / 1000 + 600, email: 'me@example.com', ...claims })}`
  return `${body}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(body))).toString('base64url')}`
}
const asked = (t) => new Request('https://watch.elyir.com/', { headers: t ? { 'Cf-Access-Jwt-Assertion': t } : {} })
const ENV = { ACCESS_TEAM: TEAM, ACCESS_AUD: AUD }

test("only a token Access signed for this page, still in date, lets anybody see it", async () => {
  assert.equal(await signedIn(asked(await token()), ENV, NOW, certs), true)
  assert.equal(await signedIn(asked(), ENV, NOW, certs), false, 'no token')
  assert.equal(await signedIn(asked(await token({ aud: ['another-app'] })), ENV, NOW, certs), false, 'signed for another app')
  assert.equal(await signedIn(asked(await token({ exp: NOW / 1000 - 1 })), ENV, NOW, certs), false, 'out of date')
  assert.equal(await signedIn(asked(await token({ iss: 'https://somebody.cloudflareaccess.com' })), ENV, NOW, certs), false, "another team's")
  assert.equal(await signedIn(asked(await token({}, { alg: 'none' })), ENV, NOW, certs), false, 'unsigned')
  const t = await token()
  assert.equal(await signedIn(asked(t.replace(/\.[^.]+$/, '.' + 'A'.repeat(342))), ENV, NOW, certs), false, 'a signature that is not the key\'s')
  assert.equal(await signedIn(asked(await token()), {}, NOW, certs), false, 'a Worker never told which app it is')
})

test('the Worker answers its one page only, and only after Access', async () => {
  assert.equal((await worker.fetch(new Request('https://watch.elyir.com/anything'), ENV)).status, 404)
  const refused = await worker.fetch(asked(), ENV)
  assert.equal(refused.status, 403)
  assert.ok(!/Everything|The relay/.test(await refused.text()))
})
