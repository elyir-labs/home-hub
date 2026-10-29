// The maker's watcher. Every minute it asks each thing we run whether it is up, from outside, the way a phone would,
// and writes to the operator when one stops answering and again when it is back. On Monday mornings it sends the
// week in numbers: how often each was up, how the relay is doing, the waitlist and the downloads. It reads only what
// our own services already see, and nothing about a visitor or a house (AGENTS.md, section 5). It runs on Cloudflare,
// which already serves the site, so watching adds no new company; watch/terraform makes it.

const MISSES = 2                 // in a row before anybody is written to: one is the internet, two is us
const KEEP_DAYS = 35
const DAY = 24 * 3600 * 1000

const header = (res, name) => res.headers.get(name) || ''
const status = (want) => (res) => (res.status === want ? null : `answered ${res.status}`)

// The site's promise, read off the live page rather than the repository: an edge setting can add a script that no
// test of site/ would ever see.
async function promisedPage(res) {
  if (res.status !== 200) return `answered ${res.status}`
  if (!/script-src 'self'/.test(header(res, 'content-security-policy'))) return 'is missing the header that refuses scripts from other sites'
  const html = await res.text()
  const elsewhere = [...html.matchAll(/<script\b[^>]*\bsrc="(https?:[^"]+)"/g)].map((m) => m[1])
  if (elsewhere.length) return `loads a script from another site: ${elsewhere[0]}`
  if (/cloudflareinsights|data-cf-beacon/.test(html)) return "carries Cloudflare's visitor beacon"
  return null
}

async function installScript(res) {
  if (res.status !== 200) return `answered ${res.status}`
  if (!header(res, 'content-type').startsWith('text/plain')) return `came back as ${header(res, 'content-type') || 'nothing'}, which bash would run`
  return (await res.text()).startsWith('#!') ? null : "isn't a script"
}

async function json(res) {
  if (res.status !== 200) return `answered ${res.status}`
  try { await res.json(); return null } catch { return "answered with something that isn't JSON" }
}

// The relay's /alive answers the watcher's key with how it is doing (relay/service/app.py).
async function relay(res, seen) {
  if (res.status !== 200) return `answered ${res.status}`
  const body = await res.json().catch(() => ({}))
  if (!body.ok) return "didn't say it was up"
  if (!body.houses) return "didn't recognize the watcher's key, so its numbers can't be read"
  seen.relay = body
  const box = body.box || {}
  if (box.disk_used > 0.85) return `has used ${Math.round(box.disk_used * 100)}% of its disk`
  if (box.memory_used > 0.95) return `has used ${Math.round(box.memory_used * 100)}% of its memory`
  return null
}

export const CHECKS = [
  { name: 'The front page', url: 'https://hub.elyir.com/', look: promisedPage },
  { name: 'The privacy page', url: 'https://hub.elyir.com/privacy', look: promisedPage },
  { name: 'The install command', url: 'https://hub.elyir.com/install', look: installScript },
  { name: 'The pretend house', url: 'https://hub.elyir.com/try/', look: status(200) },
  { name: 'The relay', url: 'https://api.elyir.app/alive', look: relay, keyed: true },
  { name: 'The address offer', url: 'https://api.elyir.app/offer', look: json },
  { name: 'Which houses are on this Wi-Fi', url: 'https://nearby.elyir.app/nearby', look: json },
  { name: 'The Houses app', url: 'https://houses.elyir.app/', look: status(200) },
  { name: 'The printer app', url: 'https://printers.elyir.app/', look: status(200) },
]

export async function probe(check, env, seen = {}, fetcher = fetch) {
  const began = Date.now()
  // Named, so the site's page counts (site/functions/_middleware.js) leave the watcher's visits out.
  const headers = { 'User-Agent': 'elyir-watch', ...(check.keyed && env.RELAY_KEY ? { Authorization: `Bearer ${env.RELAY_KEY}` } : {}) }
  try {
    const res = await fetcher(check.url, { headers, redirect: 'manual', signal: AbortSignal.timeout(10_000) })
    const why = await check.look(res, seen)
    return { name: check.name, ok: !why, ms: Date.now() - began, why }
  } catch (e) {
    return { name: check.name, ok: false, ms: Date.now() - began, why: e?.name === 'TimeoutError' ? 'took longer than 10 seconds' : `couldn't be reached (${e?.message || e})` }
  }
}

const minutes = (from, to) => Math.max(1, Math.round((to - from) / 60_000))

// One check's memory, moved on by one result. `say` is what to write to the operator, if anything.
export function step(prev, result, at) {
  const was = prev || { misses: 0, down_since: null, told: 0 }
  if (result.ok) {
    const state = { misses: 0, down_since: null, told: 0 }
    if (!was.told) return { state }
    return { state, ended: true, say: { subject: `Back: ${result.name}`, text: `${result.name} is answering again, after ${minutes(was.down_since, at)} minutes.` } }
  }
  const state = { misses: was.misses + 1, down_since: was.down_since ?? at, told: was.told }
  if (state.misses < MISSES || was.told) return { state }
  state.told = 1
  return { state, began: true, say: { subject: `Down: ${result.name}`, text: `${result.name} ${result.why}.\n\nIt has failed ${state.misses} checks in a row, since ${new Date(state.down_since).toUTCString()}.` } }
}

const pct = (up, n) => (n ? `${(Math.floor((up / n) * 10000) / 100).toFixed(2)}%` : 'no checks')
function p95(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
}

// The Monday note: plain text, numbers only, a week against the one before where there is one.
const PAGE_NAMES = { '/': 'The front page', '/privacy': 'The privacy page', '/install': 'The install command', '/try/': 'The pretend house' }

export function digest({ checks, incidents, relayNow, relayBefore, loads, waitlist, downloads }) {
  const lines = ['How the week went.', '', 'UP, AND HOW QUICKLY (95 in 100 answers were at least this fast)']
  for (const c of checks) lines.push(`  ${c.name}: ${pct(c.up, c.n)}${c.p95 != null ? `, ${c.p95} ms` : ''}`)
  lines.push('', incidents.length ? 'TIMES SOMETHING WAS DOWN' : 'Nothing was down this week.')
  for (const i of incidents) lines.push(`  ${i.name}: ${new Date(i.began).toUTCString()}, ${i.ended ? `${minutes(i.began, i.ended)} minutes` : 'still down'}`)
  if (relayNow) {
    const h = relayNow.houses, b = relayNow.box || {}
    const was = relayBefore?.houses
    const change = (k) => (was && was[k] !== h[k] ? ` (was ${was[k]})` : '')
    lines.push('', 'THE RELAY',
      `  Houses with a name: ${h.names}${change('names')}; carried: ${h.carried}${change('carried')}`,
      `  Dialed in this week: ${h.dialed_in_week}${change('dialed_in_week')}; today: ${h.dialed_in_day}`,
      `  Invites not yet used: ${h.invites_open}`,
      `  Disk ${Math.round((b.disk_used ?? 0) * 100)}% full, memory ${Math.round((b.memory_used ?? 0) * 100)}% used, load ${(b.load || []).join(' ')}`)
  }
  if (loads) {
    lines.push('', 'PAGE LOADS THIS WEEK (people, not the watcher or robots)')
    for (const [p, name] of Object.entries(PAGE_NAMES)) {
      const now = loads.week[p] || 0, was = loads.before[p]
      lines.push(`  ${name}: ${now}${was != null ? ` (week before: ${was})` : ''}`)
    }
  }
  if (waitlist) lines.push('', `THE WAITLIST: ${waitlist.week} joined this week, ${waitlist.total} in all`)
  if (downloads) lines.push('', `DOWNLOADS FROM THE RELEASES: ${downloads.total} in all${downloads.before != null ? `, ${downloads.total - downloads.before} this week` : ''}`)
  return lines.join('\n')
}

async function mail(env, subject, text) {
  if (!env.MAIL || !env.TO || !env.FROM) return
  const { EmailMessage } = await import('cloudflare:email')
  const raw = [
    `From: Elyir watch <${env.FROM}>`, `To: ${env.TO}`, `Subject: ${subject}`, `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${env.FROM.split('@')[1]}>`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', text,
  ].join('\r\n')
  await env.MAIL.send(new EmailMessage(env.FROM, env.TO, raw))
}

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS checks (name TEXT NOT NULL, at INTEGER NOT NULL, ok INTEGER NOT NULL, ms INTEGER NOT NULL, why TEXT)',
  'CREATE INDEX IF NOT EXISTS checks_at ON checks (at)',
  'CREATE TABLE IF NOT EXISTS state (name TEXT PRIMARY KEY, misses INTEGER NOT NULL, down_since INTEGER, told INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS incidents (name TEXT NOT NULL, began INTEGER NOT NULL, ended INTEGER, why TEXT)',
  'CREATE TABLE IF NOT EXISTS relay (at INTEGER NOT NULL, body TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS downloads (at INTEGER NOT NULL, total INTEGER NOT NULL)',
]

async function everyMinute(env, at) {
  const db = env.DB
  await db.batch(SCHEMA.map((s) => db.prepare(s)))
  const seen = {}
  const results = await Promise.all(CHECKS.map((c) => probe(c, env, seen)))
  const before = Object.fromEntries((await db.prepare('SELECT * FROM state').all()).results.map((r) => [r.name, r]))
  const writes = [], says = []
  for (const r of results) {
    writes.push(db.prepare('INSERT INTO checks (name, at, ok, ms, why) VALUES (?1, ?2, ?3, ?4, ?5)').bind(r.name, at, r.ok ? 1 : 0, r.ms, r.why))
    const { state, say, began, ended } = step(before[r.name], r, at)
    writes.push(db.prepare('INSERT OR REPLACE INTO state (name, misses, down_since, told) VALUES (?1, ?2, ?3, ?4)').bind(r.name, state.misses, state.down_since, state.told))
    if (began) writes.push(db.prepare('INSERT INTO incidents (name, began, why) VALUES (?1, ?2, ?3)').bind(r.name, state.down_since, r.why))
    if (ended) writes.push(db.prepare('UPDATE incidents SET ended = ?1 WHERE name = ?2 AND ended IS NULL').bind(at, r.name))
    if (say) says.push(say)
  }
  if (seen.relay && new Date(at).getUTCMinutes() % 15 === 0) writes.push(db.prepare('INSERT INTO relay (at, body) VALUES (?1, ?2)').bind(at, JSON.stringify(seen.relay)))
  if (new Date(at).getUTCHours() === 3 && new Date(at).getUTCMinutes() === 0) {
    writes.push(db.prepare('DELETE FROM checks WHERE at < ?1').bind(at - KEEP_DAYS * DAY))
  }
  await db.batch(writes)
  for (const s of says) await mail(env, s.subject, s.text)
}

async function downloadsNow(env) {
  const res = await fetch(`https://api.github.com/repos/${env.REPOSITORY}/releases?per_page=100`, { headers: { 'User-Agent': 'elyir-watch', Accept: 'application/vnd.github+json' } })
  if (!res.ok) return null
  return (await res.json()).reduce((sum, r) => sum + (r.assets || []).reduce((s, a) => s + (a.download_count || 0), 0), 0)
}

async function weekly(env, at) {
  const db = env.DB, since = at - 7 * DAY
  const all = (await db.prepare('SELECT name, ok, ms FROM checks WHERE at >= ?1').bind(since).all()).results
  const checks = CHECKS.map(({ name }) => {
    const mine = all.filter((r) => r.name === name)
    return { name, n: mine.length, up: mine.filter((r) => r.ok).length, p95: p95(mine.filter((r) => r.ok).map((r) => r.ms)) }
  })
  const incidents = (await db.prepare('SELECT * FROM incidents WHERE began >= ?1 OR ended IS NULL ORDER BY began').bind(since).all()).results
  const relayAt = async (sql, ...args) => { const r = await db.prepare(sql).bind(...args).first(); return r ? JSON.parse(r.body) : null }
  const relayNow = await relayAt('SELECT body FROM relay ORDER BY at DESC LIMIT 1')
  const relayBefore = await relayAt('SELECT body FROM relay WHERE at <= ?1 ORDER BY at DESC LIMIT 1', since)
  let loads = null
  if (env.COUNTS) {
    const days = (from, to) => [new Date(from).toISOString().slice(0, 10), new Date(to).toISOString().slice(0, 10)]
    const sum = async ([a, b]) => Object.fromEntries((await env.COUNTS.prepare('SELECT path, sum(n) AS n FROM loads WHERE day >= ?1 AND day < ?2 GROUP BY path')
      .bind(a, b).all().catch(() => ({ results: [] }))).results.map((r) => [r.path, r.n]))
    loads = { week: await sum(days(since, at)), before: await sum(days(since - 7 * DAY, since)) }
  }
  let waitlist = null
  if (env.WAITLIST) {
    const n = async (sql, ...args) => (await env.WAITLIST.prepare(sql).bind(...args).first())?.n ?? 0
    waitlist = { week: await n("SELECT count(*) AS n FROM signups WHERE product = 'hub' AND at >= ?1", new Date(since).toISOString()),
                 total: await n("SELECT count(*) AS n FROM signups WHERE product = 'hub'") }
  }
  let downloads = null
  const total = await downloadsNow(env).catch(() => null)
  if (total != null) {
    const before = await db.prepare('SELECT total FROM downloads WHERE at <= ?1 ORDER BY at DESC LIMIT 1').bind(at - 6 * DAY).first()
    await db.prepare('INSERT INTO downloads (at, total) VALUES (?1, ?2)').bind(at, total).run()
    downloads = { total, before: before?.total ?? null }
  }
  await mail(env, 'The week, in numbers', digest({ checks, incidents, relayNow, relayBefore, loads, waitlist, downloads }))
}

export default {
  async scheduled(event, env, ctx) {
    const at = event.scheduledTime
    if (event.cron === env.WEEKLY) return ctx.waitUntil(weekly(env, at))
    ctx.waitUntil(everyMinute(env, at))
  },
}
