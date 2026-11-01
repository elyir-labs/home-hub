// The maker's page of the watcher's numbers (design/watch: A's rows with B's chart under them, picked 1 November 2026).
// It answers the question it is opened for first, is everything up, then shows each service's week, then whether the
// site is being found. Counts only, the same as the Monday note: nothing about a visitor or a house. The Worker
// gathers the numbers (worker.js, gather); this file only shapes and draws them, so it can be tested without Cloudflare.

const HOUR = 3600 * 1000, DAY = 24 * HOUR, MARK = 4 * HOUR, MARKS = 42, WEEKS = 8
const FONT = 'https://hub.elyir.com/fonts/instrument-sans.woff2'
export const PAGE_NAMES = { '/': 'The front page', '/privacy': 'The privacy page', '/install': 'The install command', '/try/': 'The pretend house' }

export const pct = (up, n) => (n ? `${(Math.floor((up / n) * 10000) / 100).toFixed(2)}%` : 'no checks')
export function p95(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
}

const minutes = (from, to) => Math.max(1, Math.round((to - from) / 60_000))
const clock = (t) => new Date(t).toISOString().slice(11, 16)
const weekday = (t) => new Date(t).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
const short = (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const midnight = (t) => Math.floor(t / DAY) * DAY
const inSentence = (name) => name.replace(/^The /, 'the ')
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
const change = (now, was) => (was ? `${now >= was ? '+' : '−'}${Math.abs(Math.round(((now - was) / was) * 100))}%` : null)

// Rolling weeks ending today, the Monday note's weeks: index 7 is the last seven days, 0 is seven weeks before that.
const weekOf = (today, day) => WEEKS - 1 - Math.floor((today - day) / (7 * DAY))

// Outages that began within five minutes of each other are one outage: the relay going takes the address offer with it.
function outages(incidents, now) {
  const groups = []
  for (const i of [...incidents].sort((a, b) => a.began - b.began)) {
    const g = groups.at(-1)
    if (g && i.began - g.began < 5 * 60_000) { g.names.push(i.name); g.ended = g.ended && i.ended ? Math.max(g.ended, i.ended) : null }
    else groups.push({ began: i.began, ended: i.ended, names: [i.name] })
  }
  return groups.map((g) => ({ ...g, minutes: minutes(g.began, g.ended ?? now) }))
}

export function shape({ now, names, latest, state, hours, incidents, relay, carried, loads, joins, joinedTotal, downloads }) {
  const weekAgo = now - 7 * DAY
  const down = names.filter((n) => state[n]?.told)
  const answered = latest.filter((r) => r.ok).length
  const lastAt = Math.max(0, ...latest.map((r) => r.at))
  const stale = now - lastAt > 5 * 60_000

  let headline = 'Everything is up.', said
  if (down.length === 1) headline = `${down[0]} is down.`
  else if (down.length) headline = `${down.length} services are down.`
  if (down.length) {
    said = down.map((n) => `${n} ${state[n].why || 'stopped answering'}, since ${clock(state[n].down_since)} UTC`).join('. ') + '.'
  } else {
    const week = outages(incidents.filter((i) => i.began >= weekAgo), now)
    const say = (g) => `${list(g.names.map(inSentence))}, ${g.minutes} minutes, ${weekday(g.began)} ${clock(g.began)} UTC`
    said = !week.length ? 'Nothing was down this week.'
      : week.length === 1 ? `One outage this week: ${say(week[0])}.`
        : `${week.length} outages this week. The latest: ${say(week.at(-1))}.`
  }
  const pill = stale ? { ok: false, text: lastAt ? `The last check was ${minutes(lastAt, now)} minutes ago` : 'No checks yet' }
    : { ok: answered === names.length, text: answered === names.length ? `All ${names.length} answered in the last minute` : `${answered} of ${names.length} answered in the last minute` }

  // A mark is four hours. It is red when the service was down at any time in it, empty before the watcher was watching.
  const end = Math.ceil((now + 1) / MARK) * MARK, start = end - MARKS * MARK
  const services = names.map((name) => {
    const mine = hours.filter((h) => h.name === name)
    const week = mine.filter((h) => h.hour >= weekAgo)
    const seen = new Set(mine.map((h) => Math.floor((h.hour - start) / MARK)))
    const last = latest.find((r) => r.name === name)
    if (last) seen.add(Math.floor((last.at - start) / MARK))
    const hit = incidents.filter((i) => i.name === name)
    const marks = Array.from({ length: MARKS }, (_, k) => {
      const s = start + k * MARK, e = s + MARK
      if (hit.some((i) => i.began < e && (i.ended ?? now) >= s)) return 'down'
      return seen.has(k) ? 'up' : 'none'
    })
    // The week's 95th from each hour's 95th: near enough for a glance, and it keeps a page view to a few hundred rows.
    const ms = p95(week.map((h) => h.p95).filter((v) => v != null))
    return { name, up: !state[name]?.told, marks, uptime: pct(week.reduce((a, h) => a + h.up, 0), week.reduce((a, h) => a + h.n, 0)), ms }
  })

  const today = midnight(now)
  const labels = Array.from({ length: WEEKS }, (_, i) => short(today - (WEEKS - 1 - i) * 7 * DAY - 6 * DAY))
  const byWeek = (rows) => {
    const out = Array(WEEKS).fill(0)
    for (const { day, n } of rows) { const w = weekOf(today, midnight(day)); if (w >= 0 && w < WEEKS) out[w] += n }
    return out
  }
  const pageLoads = byWeek(loads.filter((l) => PAGE_NAMES[l.path]))
  const pages = Object.entries(PAGE_NAMES).map(([path, name]) => {
    const w = byWeek(loads.filter((l) => l.path === path))
    return { name, now: w[WEEKS - 1], was: w[WEEKS - 2] }
  }).sort((a, b) => b.now - a.now)
  const installs = byWeek(loads.filter((l) => l.path === '/install'))
  const joined = byWeek(joins.map((at) => ({ day: Date.parse(at), n: 1 })))
  // downloads and carried are totals at each week's end, oldest first, with the week before the first one leading.
  const fetched = downloads.slice(1).map((t, i) => (t != null && downloads[i] != null ? t - downloads[i] : 0))
  const houses = relay?.houses
  const tiles = [
    { label: 'Joined the waitlist', short: 'Joined', value: joined.at(-1), said: `<b>${joinedTotal}</b> in all`, series: joined },
    { label: 'Install command', short: 'Install fetched', value: installs.at(-1), said: change(installs.at(-1), installs.at(-2)) ? `fetched, <b>${change(installs.at(-1), installs.at(-2))}</b>` : 'fetched', series: installs },
    { label: 'Houses carried', short: 'Carried', value: houses?.carried ?? '–', said: houses ? `of <b>${houses.names}</b> with a name` : 'the relay has not said', series: carried.map((c) => c ?? 0) },
    { label: 'Downloads', short: 'Downloads', value: fetched.at(-1), said: downloads.at(-1) != null ? `<b>${downloads.at(-1)}</b> in all` : 'not counted yet', series: fetched },
  ]
  const box = relay?.box
  return {
    checked: lastAt ? clock(lastAt) : null,
    answer: { headline, said, pill },
    services,
    tiles,
    box: box ? [['Disk', box.disk_used, `${Math.round((box.disk_used ?? 0) * 100)}%`], ['Memory', box.memory_used, `${Math.round((box.memory_used ?? 0) * 100)}%`], ['Load', Math.min(1, box.load?.[0] ?? 0), (box.load?.[0] ?? 0).toFixed(2)]] : null,
    chart: { values: pageLoads, labels, change: change(pageLoads.at(-1), pageLoads.at(-2)) },
    pages,
  }
}

// ---------- drawing: the board's values (design/watch/watch.html), dark, at the board's sizes ----------

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// A small line in the emphasis form: earlier points gray, the last one the accent with its end-dot.
function spark(values, w = 84, h = 28) {
  const max = Math.max(...values), min = Math.min(...values, 0)
  const x = (i) => 4 + i * (w - 8) / (values.length - 1), y = (v) => h - 4 - (v - min) / (max - min || 1) * (h - 8)
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`), last = values.length - 1
  return `<svg class="spark" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts.slice(0, -1).join(' ')}" fill="none" stroke="#5c5a54" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <line x1="${x(last - 1)}" y1="${y(values[last - 1])}" x2="${x(last)}" y2="${y(values[last])}" stroke="#e9b872" stroke-width="2" stroke-linecap="round"/>
    <circle cx="${x(last)}" cy="${y(values[last])}" r="4" fill="#e9b872" stroke="#15171c" stroke-width="2"/></svg>`
}

const ceiling = (max) => { const m = 10 ** Math.floor(Math.log10(Math.max(max, 1))); return [1, 2, 2.5, 5, 10].map((k) => k * m).find((v) => v >= max) }

// B's chart: eight weeks of columns, this week in the accent and the rest gray, the value on this week's cap only.
export function weeksChart(values, labels, w, h, small = false) {
  const pad = { l: small ? 30 : 40, r: 8, t: 20, b: 26 }, max = ceiling(Math.max(...values, 10))
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b, band = iw / values.length, bw = Math.min(small ? 22 : 24, band * 0.5)
  const y = (v) => pad.t + ih - v / max * ih, fs = small ? 10 : 12
  let s = `<svg class="weeks${small ? ' small' : ''}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Page loads by week">`
  for (const t of [0, max / 2, max]) s += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(t)}" y2="${y(t)}" stroke="rgba(255,255,255,.07)"/><text x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end" font-size="${fs}" fill="#8f8c85">${t}</text>`
  values.forEach((v, i) => {
    const x = pad.l + band * i + (band - bw) / 2, top = y(v), last = i === values.length - 1
    s += v ? `<path class="col${last ? ' now' : ''}" d="M${x},${y(0)} V${Math.min(top + 4, y(0))} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${y(0)} Z" fill="${last ? '#e9b872' : '#4a4944'}"/>` : `<path class="col${last ? ' now' : ''}" d=""/>`
    if (!small || i % 2 === 1) s += `<text x="${x + bw / 2}" y="${h - 6}" text-anchor="middle" font-size="${fs}" fill="#8f8c85">${labels[i]}</text>`
    if (last) s += `<text x="${x + bw / 2}" y="${top - 8}" text-anchor="middle" font-size="${small ? 12 : 14}" font-weight="600" fill="#f1eee8">${v}</text>`
  })
  return s + '</svg>'
}

const CSS = `
@font-face { font-family: 'Instrument Sans'; src: url('${FONT}') format('woff2'); font-weight: 400 700; font-display: swap }
:root { --bg: #0c0d10; --card: #15171c; --ink: #f1eee8; --ink-2: #b9b5ad; --ink-3: #8f8c85; --lamp: #e9b872;
  --line: rgba(255,255,255,.08); --up: rgba(241,238,232,.26); --none: rgba(255,255,255,.06); --good: #0ca30c; --down: #d03b3b;
  --font: 'Instrument Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; color-scheme: dark }
* { box-sizing: border-box }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.45 var(--font); -webkit-font-smoothing: antialiased }
.num { font-variant-numeric: tabular-nums }
.label { font-size: 12px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3) }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px }
.ok { display: inline-flex; align-items: center; gap: 7px; font-size: 14px; color: var(--ink-2) }
.ok::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--good) }
.ok.no::before { background: var(--down) }
nav { height: 64px; display: flex; align-items: center; gap: 10px; padding: 0 48px; border-bottom: 1px solid var(--line) }
nav .mark { width: 10px; height: 10px; border-radius: 50%; background: var(--lamp); box-shadow: 0 0 12px rgba(233,184,114,.6) }
nav .name { font-weight: 500 } nav .name span { color: var(--ink-3) }
nav .when { margin-left: auto; font-size: 14px; color: var(--ink-3) }
main { max-width: 1440px; margin: 0 auto; padding: 0 48px 12px }
.short { display: none }
.answer { padding-top: 26px }
.answer .line { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 20px }
.answer h1 { margin: 0; font-size: 40px; font-weight: 500; letter-spacing: -.025em; line-height: 1.1 }
.answer .ok { font-size: 15px }
.answer p { margin: 6px 0 0; font-size: 17px; color: var(--ink-2) }
.grid { display: grid; grid-template-columns: 1fr 420px; grid-template-areas: "rows side" "chart pages"; gap: 20px 28px; padding-top: 22px }
.rows { grid-area: rows; padding: 4px 0 } .side { grid-area: side } .chart { grid-area: chart } .pages { grid-area: pages }
.svc { display: grid; grid-template-columns: 64px 1fr 334px 76px 70px; align-items: center; gap: 0 12px; height: 36px; padding: 0 22px; border-bottom: 1px solid var(--line) }
.svc.head { height: 34px } .svc.head span { font-size: 12px }
.svc .n { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.svc .r { text-align: right; font-size: 15px } .svc .ms { color: var(--ink-2) }
.marks { display: flex; gap: 2px; align-items: center }
.marks i { display: block; width: 6px; height: 16px; border-radius: 2px; background: var(--up) }
.marks i.down { background: var(--down) } .marks i.none { background: var(--none) }
.key { display: flex; gap: 18px; padding: 10px 22px 6px; font-size: 12px; color: var(--ink-3) }
.key span { display: inline-flex; align-items: center; gap: 6px } .key i { width: 4px; height: 12px; border-radius: 2px; background: var(--up) } .key i.down { background: var(--down) }
.side { display: flex; flex-direction: column; gap: 12px }
.side > .label { margin: 2px 0 -2px }
.tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 12px }
.tile { padding: 14px 16px 12px }
.tile .v { display: flex; align-items: center; justify-content: space-between; margin: 4px 0 2px }
.tile .v span { font-size: 28px; font-weight: 600; letter-spacing: -.02em }
.tile .d { font-size: 13px; color: var(--ink-3) } .tile .d b { color: var(--ink-2); font-weight: 500 }
.box { padding: 12px 20px; flex: 1; display: flex; flex-direction: column; justify-content: center }
.box .label { margin-bottom: 2px }
.box .m { display: grid; grid-template-columns: 70px 1fr 44px; align-items: center; gap: 12px; margin: 4px 0; font-size: 14px; color: var(--ink-2) }
.meter { height: 6px; border-radius: 3px; background: rgba(241,238,232,.10); overflow: hidden } .meter i { display: block; height: 100%; border-radius: 3px; background: var(--up) }
.box p { margin: 0; font-size: 14px; color: var(--ink-3) }
.chart { padding: 14px 24px 6px }
.chart .top { display: flex; align-items: baseline; gap: 14px }
.chart .top .big { font-size: 28px; font-weight: 600; letter-spacing: -.02em; margin-left: auto }
.chart .top .by { font-size: 15px; color: var(--ink-2) } .chart .top .by b { color: var(--ink); font-weight: 500 }
.weeks { display: block; width: 100%; height: auto } .weeks.small { display: none }
.pages { padding: 16px 22px }
.pages .label { display: flex; justify-content: space-between } .pages .label span + span { text-transform: none; letter-spacing: 0; font-weight: 400 }
.page { margin: 12px 0 0 } .page > div:first-child { display: flex; justify-content: space-between; font-size: 14px }
.page .was { color: var(--ink-3); font-size: 12px }
.page .bar { height: 8px; margin-top: 5px; border-radius: 0 4px 4px 0; background: var(--lamp) }
@media (max-width: 1100px) {
  .grid { grid-template-columns: 1fr; grid-template-areas: "rows" "chart" "side" "pages" }
}
@media (max-width: 720px) {
  nav { height: 52px; padding: 0 20px } nav .when { font-size: 12px } nav .long, .tile .full { display: none } .tile .short { display: inline }
  main { padding: 0 16px 24px }
  .answer { padding: 18px 4px 0 } .answer .line { flex-direction: column-reverse; gap: 6px }
  .answer h1 { font-size: 30px } .answer .ok { font-size: 14px } .answer p { font-size: 14px }
  .grid { gap: 12px; padding-top: 14px }
  .svc { grid-template-columns: 1fr 125px 58px; gap: 10px; height: 34px; padding: 0 14px }
  .svc.head, .svc .st, .svc .ms, .key { display: none }
  .svc .n, .svc .r { font-size: 13px }
  .marks { gap: 1px } .marks i { width: 2px; height: 12px; border-radius: 1px }
  .chart { padding: 14px 16px 6px } .chart .top .label { white-space: nowrap } .chart .top .big { font-size: 24px } .chart .top .by { font-size: 13px }
  .chart .top .by .long { display: none }
  .weeks { display: none } .weeks.small { display: block }
  .side > .label, .spark { display: none }
  .tiles { gap: 10px } .tile { padding: 12px 14px } .tile .v span { font-size: 26px }
}`

export function render(v) {
  const { answer, chart } = v
  const marks = (ms) => `<div class="marks">${ms.map((m) => `<i class="${m === 'up' ? '' : m}"></i>`).join('')}</div>`
  const rows = v.services.map((s) => `<div class="svc"><span class="ok st${s.up ? '' : ' no'}">${s.up ? 'Up' : 'Down'}</span><span class="n">${esc(s.name)}</span>${marks(s.marks)}<span class="r num">${s.uptime}</span><span class="r num ms">${s.ms ?? '–'}</span></div>`).join('')
  const tiles = v.tiles.map((t) => `<div class="card tile"><div class="label"><span class="full">${t.label}</span><span class="short">${t.short}</span></div><div class="v"><span class="num">${t.value}</span>${spark(t.series)}</div><div class="d">${t.said}</div></div>`).join('')
  const box = v.box ? v.box.map(([k, f, said]) => `<div class="m">${k}<div class="meter"><i style="width:${Math.round(Math.min(1, f ?? 0) * 100)}%"></i></div><span class="num" style="text-align:right">${said}</span></div>`).join('')
    : '<p>The relay has not reported yet.</p>'
  const top = Math.max(...v.pages.map((p) => p.now), 1)
  const pages = v.pages.map((p) => `<div class="page"><div><span>${p.name}</span><span><span class="num">${p.now}</span> <span class="was">was ${p.was}</span></span></div><div class="bar" style="width:${(p.now / top) * 100}%"></div></div>`).join('')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Elyir watch</title>
<style>${CSS}</style>
</head>
<body>
<nav><span class="mark"></span><span class="name">Elyir <span>· watch</span></span><span class="when">${v.checked ? `<span class="long">Checked </span>${v.checked} UTC<span class="long"> · every minute</span>` : 'Not checked yet'}</span></nav>
<main>
  <section class="answer"><div class="line"><h1>${esc(answer.headline)}</h1><span class="ok${answer.pill.ok ? '' : ' no'}">${esc(answer.pill.text)}</span></div><p>${esc(answer.said)}</p></section>
  <div class="grid">
    <section class="card rows" aria-label="Every service">
      <div class="svc head label"><span class="st"></span><span>Service</span><span>The last 7 days, four hours a mark</span><span class="r">Up</span><span class="r">95th ms</span></div>
      ${rows}
      <div class="key"><span><i></i>Answered</span><span><i class="down"></i>Missed two in a row</span></div>
    </section>
    <section class="side" aria-label="This week">
      <div class="label">This week</div>
      <div class="tiles">${tiles}</div>
      <div class="card box"><div class="label">The relay's box</div>${box}</div>
    </section>
    <section class="card chart" aria-label="Page loads by week">
      <div class="top"><span class="label">Page loads, by week</span><span class="big num">${chart.values.at(-1)}</span><span class="by">${chart.change ? `<span class="long">this week, </span><b>${chart.change}</b><span class="long"> on the week before</span>` : '<span class="long">this week</span>'}</span></div>
      ${weeksChart(chart.values, chart.labels, 848, 150)}${weeksChart(chart.values, chart.labels, 326, 112, true)}
    </section>
    <section class="card pages" aria-label="Which pages"><div class="label"><span>Which pages, this week</span><span>people only</span></div>${pages}</section>
  </div>
</main>
</body>
</html>`
}
