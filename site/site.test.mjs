/* hub.elyir.com is design/site's D: A's front page with C's line for a hub ready to plug in, with design/site-pair's D for
   its pictures and design/site-more's D for what it does, what it works with and the questions. These fail on purpose if the page drifts from the boards, if /install could ever hand bash a web page,
   or if the waitlist says more than it should.
   `node --test site/site.test.mjs` */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { onRequest as install } from './functions/install.js'
import { onRequestPost as waitlist } from './functions/waitlist.js'
import { COUNTED, onRequest as middleware } from './functions/_middleware.js'
import { POLICY } from './policy.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const page = readFileSync(path.join(HERE, 'index.html'), 'utf8')
const pages = readdirSync(HERE).filter((f) => f.endsWith('.html'))
const text = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const at = (s) => { const i = page.indexOf(s); assert.notEqual(i, -1, `the page should have ${s}`); return i }

test('the top is D: what it is, the computer first, then Try it live, then the line for one ready to plug in', () => {
  const hero = page.slice(at('<header class="hero">'), at('</header>'))
  assert.match(hero, /<h1>Your house, on one screen\.<\/h1>/)
  const computer = hero.indexOf('Put it on a computer you have'), live = hero.indexOf('Try it live'), ask = hero.indexOf('Want one ready to plug in?')
  assert.ok(computer > 0 && computer < live && live < ask, 'the two buttons, then the line under them')
  assert.match(hero, /class="pill lamp door-get"/, 'on a computer, the computer is the lit button')
  assert.equal((hero.match(/class="pill lamp/g) || []).length, 1, "one lit button at the top; the line's Tell me stays plain")
  assert.match(hero, /type="email"/)
})

test('on a phone, Try it live leads, because the command needs a computer', () => {
  const phone = page.slice(at('@media (max-width: 640px)'))
  assert.match(phone.slice(0, phone.indexOf('\n  }')), /\.doors \.door-try \{ order: -1; background: var\(--lamp\)/)
})

test('below the top: what it does, the day, the pretend house, what it works with, the ways to get it, the price, the questions', () => {
  const order = ['</header>', 'id="does"', 'id="day"', 'id="try"', 'id="works"', 'id="get"', 'id="anywhere"', 'id="faq"', '<footer>'].map(at)
  assert.deepEqual(order, [...order].sort((a, b) => a - b))
  const ways = [...page.slice(at('id="get"'), at('id="anywhere"')).matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1])
  assert.deepEqual(ways, ['On a computer you have', 'On a new Raspberry Pi 5', 'Ready to plug in'])
  assert.match(text(page), /Free at home\. \$3 a month to use it anywhere\./)
})

test("the command is the site's own, and the pretend house starts when asked, at /try", () => {
  assert.match(page, /curl -fsSL https:\/\/hub\.elyir\.com\/install \| sudo bash/)
  const pretend = page.slice(at('id="try"'), at('id="get"'))
  assert.match(text(pretend), /A whole house that isn't real\. Tap the lights, run Bedtime, type kitchen lights off ?\. It starts when you ask/)
  assert.match(pretend, /<a class="veil" href="\/try\/"><span>Start the pretend house<\/span><\/a>/)
  assert.ok(!pretend.includes('<iframe'), 'nothing of the house loads until somebody asks')
})

test("the page shows nobody else's show, and names makers and Home Assistant only where a buyer asks about them", () => {
  for (const name of ['The Bear', 'Disney', 'Miles Davis', 'Blue in Green']) assert.ok(!page.includes(name), `the page says ${name}`)
  const works = page.slice(at('id="works"'), at('id="get"')), faq = page.slice(at('id="faq"'), at('<footer>')), foot = page.slice(at('<footer>'))
  const notWorks = text(page.replace(works, '').replace(foot, '')), notAsked = text(page.replace(works, '').replace(faq, '').replace(foot, ''))
  for (const name of ['Philips', 'Hue', 'Sonos', 'Nest', 'Ring', 'Chromecast']) assert.ok(!notWorks.includes(name), `${name} outside what it works with`)
  assert.ok(!notAsked.includes('Home Assistant'), 'Home Assistant outside what it works with, the questions and the footer')
  assert.match(text(foot), /Home Assistant, Raspberry Pi, NUC and the makers named above are trademarks of their owners/)
  for (const word of ['relay', 'brain', 'driver', 'entity', 'integration']) assert.ok(!new RegExp(`\\b${word}`, 'i').test(text(page)), `the page says ${word}`)
})

test('what it does, what it works with and the questions are design/site-more\'s D: A in words, with B\'s chips', () => {
  const does = [...page.slice(at('id="does"'), at('id="day"')).matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1])
  assert.deepEqual(does, ["Works when the internet doesn't", 'Tell it in words', 'Music in every room', 'Cameras on the wall'])
  const works = page.slice(at('id="works"'), at('id="get"'))
  const kinds = [...works.matchAll(/<li>[\s\S]*?<\/svg>(.*?)<\/li>/g)].map((m) => m[1])
  assert.deepEqual(kinds, ['Lights and plugs', 'Switches and dimmers', 'Locks', 'Thermostats', 'Cameras and doorbells', 'Blinds and shades', 'Speakers and TVs', 'Motion and door sensors'])
  /* Only makers the hub's own code knows by name; a guess has no place on a list somebody buys from. */
  const makers = [...works.matchAll(/<b>(.*?)<\/b>/g)].flatMap((m) => m[1].split(/, | and /))
  assert.deepEqual(makers, ['Philips Hue', 'Sonos', 'Google Nest', 'Ring', 'ecobee', 'WiZ', 'TP-Link Kasa', 'Chromecast', 'Roku', 'Samsung', 'LG', 'Android TVs', 'Matter', 'Zigbee', 'Z-Wave'])
  const asked = [...page.slice(at('id="faq"'), at('<footer>')).matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1])
  assert.deepEqual(asked, ['Do I need to know Home Assistant?', 'What happens when the internet is down?', 'What does it cost?', 'What leaves my house?',
    'Does it work with Apple Home or Google Home?', 'What screen goes on the wall?', 'What if I move?'])
  assert.ok(!/class="[^"]*\bfaq\b[\s\S]*?<details/.test(page), 'the answers are open, never behind a tap')
})

test('nobody signs in to a house, and the page says "your household", not our "let in"', () => {
  assert.match(page, /<a class="signin" href="https:\/\/houses\.elyir\.app">Open your house<\/a>/)
  for (const phrase of ['Sign in', 'let in', 'from outside']) assert.ok(!text(page).includes(phrase), `the page says ${phrase}`)
})

const pictures = (html) => [...html.matchAll(/<picture>([\s\S]*?)<\/picture>/g)].map(([, p]) => ({
  light: p.match(/<source media="\(prefers-color-scheme: light\)" srcset="\/shots\/([^"]+)">/)?.[1],
  dark: p.match(/<img src="\/shots\/([^"]+)"/)?.[1],
}))

test('the top shows one room on both screens, the living room, so the two read as one app', () => {
  const pair = pictures(page.slice(at('<figure class="pics">'), at('</header>')))
  assert.deepEqual(pair, [
    { light: 'wall-room-light.jpg', dark: 'wall-room-dark.jpg' },
    { light: 'phone-room-light.jpg', dark: 'phone-room-dark.jpg' },
  ])
  assert.match(text(page.slice(at('<figure class="pics">'), at('</header>'))), /The living room, on the wall and on a phone\./)
})

test('one scroll down, the same wall through a day, in the look the visitor has', () => {
  const day = page.slice(at('id="day"'), at('id="try"'))
  assert.deepEqual(pictures(day), ['morning', 'afternoon', 'evening'].map((part) => ({ light: `wall-${part}-light.jpg`, dark: `wall-${part}-dark.jpg` })))
  assert.deepEqual([...day.matchAll(/<figcaption>(.*?)<\/figcaption>/g)].map((m) => m[1]), ['8:30 in the morning', '1:00 in the afternoon', '7:40 in the evening'])
})

test('every picture follows the light or dark the page is in, and is one npm run site-shots takes', () => {
  assert.equal((page.match(/<img\b/g) || []).length, pictures(page).length, 'no picture outside a <picture> that switches with the page')
  for (const { light, dark } of pictures(page)) {
    assert.ok(light && dark, 'a light picture and a dark one')
    assert.equal(light.replace('-light', ''), dark.replace('-dark', ''), `${light} and ${dark} are the same screen`)
    for (const shot of [light, dark]) assert.ok(existsSync(path.join(HERE, 'shots', shot)), `site/shots/${shot}`)
  }
})

const assets = { fetch: async (req) => new Response('#!/usr/bin/env bash\necho hub\n', { status: 200, headers: { 'Content-Type': 'application/x-sh', from: new URL(req.url).pathname } }) }
const get = (accept) => install({ request: new Request('https://hub.elyir.com/install', { headers: accept ? { Accept: accept } : {} }), env: { ASSETS: assets } })

test('/install gives curl the script, as plain text', async () => {
  for (const accept of [undefined, '*/*', 'text/plain']) {
    const res = await get(accept)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('from'), '/install.sh')
    assert.equal(res.headers.get('Content-Type'), 'text/plain; charset=utf-8')
    assert.match(await res.text(), /^#!/)
  }
})

test('/install sends a browser to the ways to get it, never a page to bash', async () => {
  const res = await get('text/html,application/xhtml+xml')
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('Location'), '/#get')
})

function list() {
  const rows = new Map()
  return {
    rows,
    prepare: (sql) => ({
      run: async () => ({}),
      bind: (...args) => ({ run: async () => { if (/INSERT/.test(sql)) { const k = `${args[0]}|${args[1]}`; if (!rows.has(k)) rows.set(k, args[2]) } return {} } }),
    }),
  }
}
const ask = (body, env) => waitlist({ request: new Request('https://hub.elyir.com/waitlist', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }), env })

test('the waitlist keeps one email for the hub, and says the same thing the second time', async () => {
  const db = list()
  assert.equal((await ask({ email: ' Sam@Example.com ' }, { WAITLIST: db })).status, 200)
  assert.equal((await ask({ email: 'sam@example.com' }, { WAITLIST: db })).status, 200)
  assert.deepEqual([...db.rows.keys()], ['sam@example.com|hub'])
})

test("the waitlist turns away what isn't an email, and quietly ignores a script", async () => {
  const db = list()
  for (const bad of [{ email: 'sam' }, { email: 'sam@example' }, { email: `${'a'.repeat(250)}@example.com` }, {}]) {
    assert.equal((await ask(bad, { WAITLIST: db })).status, 400)
  }
  assert.equal((await ask('not json', { WAITLIST: db })).status, 400)
  assert.equal((await ask({ email: 'bot@example.com', website: 'http://spam' }, { WAITLIST: db })).status, 200)
  assert.equal(db.rows.size, 0)
})

test('the waitlist says plainly when it has nowhere to write', async () => {
  assert.equal((await ask({ email: 'sam@example.com' }, {})).status, 503)
})

test('a visit asks nobody else for anything: no fonts, scripts or pictures from another site', () => {
  for (const name of pages) {
    const html = readFileSync(path.join(HERE, name), 'utf8')
    const fetched = [...html.matchAll(/<(?:link|script|img|iframe)\b[^>]*\b(?:href|src)="([^"]+)"/g)].map((m) => m[1])
    for (const url of fetched) assert.ok(url.startsWith('/'), `${name} loads ${url}`)
    assert.ok(!/url\(['"]?https?:/.test(html), `nor from ${name}'s stylesheet`)
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), `${name} has a script inline, which its policy would refuse`)
    assert.ok(!/cloudflareinsights|data-cf-beacon|gtag|plausible/i.test((html.match(/<[^>]+>/g) || []).join('')), `${name} counts its visitors`)
  }
  for (const script of ['site.js']) assert.ok(!/https?:\/\//.test(readFileSync(path.join(HERE, script), 'utf8')), `${script} talks to another site`)
})

test('every page refuses a script from another site, even one added on the way out', () => {
  const rules = Object.fromEntries(readFileSync(path.join(HERE, '_headers'), 'utf8').split(/\n(?=\/)/).map((block) => {
    const [where, ...lines] = block.trim().split('\n')
    return [where.trim(), lines.join('\n')]
  }))
  for (const name of pages) {
    const where = name === 'index.html' ? '/' : `/${name.replace(/\.html$/, '')}`
    assert.ok((rules[where] || '').includes(`Content-Security-Policy: ${POLICY}`), `${where} has no policy`)
  }
})

// A D1 stand-in that keeps what it is told, so the test can see everything a count stores.
function countsDb() {
  const rows = new Map(), sql = []
  return { rows, sql, prepare: (q) => ({ q, args: [], bind(...a) { this.args = a; return this } }),
    batch: async (stmts) => { for (const s of stmts) { sql.push(s.q); if (/INSERT/.test(s.q)) { const k = s.args.join('|'); rows.set(k, (rows.get(k) || 0) + 1) } } } }
}
async function visit(url, { method = 'GET', ua = 'Mozilla/5.0', status = 200, db = countsDb() } = {}) {
  const later = []
  const res = await middleware({ request: new Request(url, { method, headers: { 'User-Agent': ua } }), env: { COUNTS: db },
    next: async () => new Response('<p>hi</p>', { status }), waitUntil: (p) => later.push(p) })
  await Promise.all(later)
  return { res, db }
}

test('a page load is counted as a number for that page and day, and nothing else about it', async () => {
  const db = countsDb()
  for (const url of ['https://hub.elyir.com/', 'https://hub.elyir.com/', 'https://hub.elyir.com/privacy', 'https://hub.elyir.com/try/']) await visit(url, { db })
  await visit('https://hub.elyir.com/install', { db, ua: 'curl/8.7.1' })
  const day = new Date().toISOString().slice(0, 10)
  assert.deepEqual(Object.fromEntries(db.rows), { [`${day}|/`]: 2, [`${day}|/privacy`]: 1, [`${day}|/try/`]: 1, [`${day}|/install`]: 1 })
  for (const q of db.sql) assert.doesNotMatch(q, /ip|address|agent|cookie|country|referr?er/i, `a count keeps more than the page and the day: ${q}`)
  assert.deepEqual(COUNTED, ['/', '/privacy', '/install', '/try/'])
})

test('the watcher, robots, failures and anything that is not a page are not counted', async () => {
  const db = countsDb()
  await visit('https://hub.elyir.com/', { db, ua: 'elyir-watch' })
  await visit('https://hub.elyir.com/', { db, ua: 'Googlebot/2.1' })
  await visit('https://hub.elyir.com/', { db, method: 'HEAD' })
  await visit('https://hub.elyir.com/install', { db, status: 302 })
  await visit('https://hub.elyir.com/waitlist', { db })
  await visit('https://hub.elyir.com/try/assets/index.js', { db })
  assert.equal(db.rows.size, 0)
  const routes = JSON.parse(readFileSync(path.join(HERE, '_routes.json'), 'utf8')).include
  for (const p of [...COUNTED, '/install', '/waitlist']) assert.ok(routes.includes(p), `_routes.json leaves ${p} out`)
  assert.ok(!routes.some((p) => p.includes('*')), 'only these paths run a function; the pictures and the pretend house\'s files never do')
})

test('a page that passed through the counter still refuses other sites\' scripts', async () => {
  for (const url of ['https://hub.elyir.com/', 'https://hub.elyir.com/privacy']) assert.equal((await visit(url)).res.headers.get('content-security-policy'), POLICY)
  assert.equal((await visit('https://hub.elyir.com/install')).res.headers.get('content-security-policy'), null)
})

test('the privacy page is reachable from the waitlist, and says what it keeps', () => {
  const ways = page.slice(at('id="get"'), at('id="anywhere"'))
  assert.match(ways, /href="\/privacy"/)
  assert.match(page.slice(at('<footer>')), /href="\/privacy"/)
  const privacy = text(readFileSync(path.join(HERE, 'privacy.html'), 'utf8'))
  assert.match(privacy, /your email address, that it was for the hub, and when you joined/)
  assert.match(privacy, /privacy@elyir\.app/)
  assert.match(privacy, /We count how many times each page is loaded and the install command is fetched, and nothing that tells one visitor from another\./)
  for (const word of ['relay', 'brain', 'entity', 'integration']) assert.ok(!new RegExp(`\\b${word}`, 'i').test(privacy), `the privacy page says ${word}`)
})

/* The width and height a JPEG says it is, from its first frame header. */
const jpegSize = (buf) => {
  for (let i = 2; i < buf.length;) {
    const marker = buf[i + 1], len = buf.readUInt16BE(i + 2)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]
    i += 2 + len
  }
}
const meta = (key) => page.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`))?.[1]

test('a shared link shows the wall alone (design/link-preview/, B), at the size every app asks for', () => {
  assert.equal(meta('og:title'), 'Elyir Home Hub')
  assert.equal(meta('og:description'), page.match(/<meta name="description" content="([^"]*)"/)[1], 'the same sentence the page describes itself with')
  assert.equal(meta('og:image'), 'https://hub.elyir.com/shots/card.jpg', 'an app fetches the picture from outside, so the address is whole')
  assert.equal(meta('twitter:card'), 'summary_large_image')
  assert.ok(meta('og:image:alt'))
  const file = path.join(HERE, 'shots', 'card.jpg')
  assert.ok(existsSync(file), 'npm run site-shots card makes it')
  assert.deepEqual(jpegSize(readFileSync(file)), [1200, 630])
  assert.deepEqual([meta('og:image:width'), meta('og:image:height')], ['1200', '630'])
})
