// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The household's photos for a TV at rest (hub/photos.py, design/rest-tv/, A), in the mock house. Three painted
   stand-ins, one wide and two taken upright, so a preview shows nobody's real pictures. PHOTOS=none is a house
   nobody has sent a photo to yet, which rests on the sky instead (C). A photo sent here is acknowledged and not kept.
   Two screens say what they are (hub/screens.py, design/which-tv/): the living room TV and the kitchen's wall screen,
   whose switches on Photos hold for as long as the mock runs. */
const WIDE = `<svg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080' viewBox='0 0 1920 1080'><defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#5d5a8e'/><stop offset='.38' stop-color='#d98a72'/><stop offset='.6' stop-color='#f4c58b'/></linearGradient><linearGradient id='w' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#c98a6e'/><stop offset='.5' stop-color='#5f5574'/><stop offset='1' stop-color='#2e2c44'/></linearGradient></defs><rect width='1920' height='660' fill='url(#s)'/><circle cx='1190' cy='600' r='46' fill='#fff1cf'/><rect y='620' width='1920' height='460' fill='url(#w)'/><path d='M0 600 C 180 520 330 540 470 590 S 700 640 760 640 L0 660z' fill='#3b3047'/><path d='M1500 640 C 1600 560 1760 520 1920 545 V660 H1500z' fill='#342b40'/><path d='M0 880 C 400 840 900 860 1920 900 V1080 H0z' fill='#c9a68a'/><path d='M0 930 C 500 905 1100 920 1920 960 V1080 H0z' fill='#a98a74'/></svg>`
const TREE = `<svg xmlns='http://www.w3.org/2000/svg' width='1080' height='1440' viewBox='0 0 600 800'><defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#a9c3d9'/><stop offset='1' stop-color='#e7dccb'/></linearGradient></defs><rect width='600' height='800' fill='url(#s)'/><rect x='282' y='330' width='34' height='300' fill='#4a3426'/><circle cx='300' cy='300' r='170' fill='#d27a2c'/><circle cx='190' cy='360' r='110' fill='#c0612a'/><circle cx='410' cy='350' r='120' fill='#e0953c'/><circle cx='300' cy='190' r='110' fill='#e9a648'/><path d='M0 640 C 200 600 400 610 600 650 V800 H0z' fill='#7d8b4a'/></svg>`
const SNOW = `<svg xmlns='http://www.w3.org/2000/svg' width='1080' height='1440' viewBox='0 0 600 800'><defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#1e2440'/><stop offset='.6' stop-color='#3d4a72'/><stop offset='1' stop-color='#cdd6e6'/></linearGradient></defs><rect width='600' height='800' fill='url(#s)'/><path d='M40 260 L180 180 L320 260 V640 H40z' fill='#2a2f45'/><path d='M320 300 L450 230 L580 300 V640 H320z' fill='#323954'/><g fill='#f3c27a'><rect x='90' y='330' width='56' height='70'/><rect x='214' y='330' width='56' height='70'/><rect x='370' y='360' width='50' height='62'/></g><path d='M0 630 C 200 610 420 620 600 640 V800 H0z' fill='#e8edf5'/></svg>`
const LAKE = `<svg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080' viewBox='0 0 1920 1080'><defs><linearGradient id='l' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#7fa6c9'/><stop offset='.55' stop-color='#d7e2e6'/></linearGradient></defs><rect width='1920' height='1080' fill='url(#l)'/><path d='M0 560 L380 260 L640 470 L900 210 L1260 520 L1520 330 L1920 560 V1080 H0z' fill='#5d6f86'/><path d='M300 330 L380 260 L450 320z M820 280 L900 210 L980 270z' fill='#f2f5f7'/><path d='M0 600 C 600 570 1300 580 1920 600 V700 H0z' fill='#3f5a4a'/><rect y='690' width='1920' height='390' fill='#6f93ad'/><path d='M0 690 L380 960 L640 760 L900 1010 L1260 730 L1520 900 L1920 690z' fill='#5d6f86' opacity='.25'/><g fill='#2f4638'><path d='M150 640l22-80 22 80z'/><path d='M200 645l16-60 16 60z'/><path d='M1650 640l20-74 20 74z'/></g></svg>`
const CITY = `<svg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080' viewBox='0 0 1920 1080'><defs><linearGradient id='c' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#283a6a'/><stop offset='.6' stop-color='#c5708a'/><stop offset='.8' stop-color='#f0a27a'/></linearGradient></defs><rect width='1920' height='1080' fill='url(#c)'/><g fill='#1b1d2e'><rect x='80' y='520' width='180' height='560'/><rect x='300' y='420' width='140' height='660'/><rect x='480' y='600' width='220' height='480'/><rect x='760' y='360' width='160' height='720'/><rect x='960' y='560' width='240' height='520'/><rect x='1250' y='460' width='150' height='620'/><rect x='1440' y='620' width='200' height='460'/><rect x='1680' y='500' width='180' height='580'/></g><g fill='#f3c27a'><rect x='110' y='560' width='14' height='18'/><rect x='170' y='620' width='14' height='18'/><rect x='330' y='470' width='14' height='18'/><rect x='390' y='520' width='14' height='18'/><rect x='520' y='650' width='14' height='18'/><rect x='600' y='700' width='14' height='18'/><rect x='790' y='420' width='14' height='18'/><rect x='850' y='500' width='14' height='18'/><rect x='1000' y='610' width='14' height='18'/><rect x='1100' y='680' width='14' height='18'/><rect x='1280' y='520' width='14' height='18'/><rect x='1470' y='680' width='14' height='18'/><rect x='1720' y='560' width='14' height='18'/><rect x='1790' y='640' width='14' height='18'/></g></svg>`
const DAY = 86400
const now = () => Date.now() / 1000
/* A day out with three photos, so Day by day opens on its title and a collage (design/tv-moments/, B), and one taken on
   this date a year ago, which comes first with "One year ago today". */
const at = (y, m, d, h) => new Date(y, m - 1, d, h).getTime() / 1000
const yearAgo = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); d.setHours(17, 0, 0, 0); return d.getTime() / 1000 })()
const SHELF = [
  { id: 'lake', kind: 'svg', art: LAKE, w: 1920, h: 1080, by: "Sam's phone", taken: at(2025, 8, 16, 9) },
  { id: 'coast', kind: 'svg', art: WIDE, w: 1920, h: 1080, by: "Sam's phone", taken: at(2025, 8, 16, 18) },
  { id: 'city', kind: 'svg', art: CITY, w: 1920, h: 1080, by: "Sam's phone", taken: at(2025, 8, 16, 21) },
  { id: 'tree', kind: 'svg', art: TREE, w: 1080, h: 1440, by: "Jordan's iPhone", taken: now() - 30 * DAY },
  { id: 'snow', kind: 'svg', art: SNOW, w: 1080, h: 1440, by: "Jordan's iPhone", taken: yearAgo },
]

const SCREENS = [
  { id: 'a1b2c3d4e5f60718a1b2c3d4e5f60718', room: 'living', room_name: 'Living room', tv: true, by: 'screen', photos: true, play: 'days', shows: 'photos', notes: true, lines: true },
  { id: 'f0e1d2c3b4a59687f0e1d2c3b4a59687', room: 'kitchen', room_name: 'Kitchen', tv: false, by: 'screen', photos: false, play: 'days', shows: 'photos', notes: true, lines: true },
]
const body = req => new Promise(done => { let raw = ''; req.on('data', c => (raw += c)); req.on('end', () => { try { done(JSON.parse(raw || '{}')) } catch { done({}) } }) })

/* The family board (hub/board.py): a note from this morning and one from yesterday, a birthday in three days and a day
   out in six. What a phone leaves or takes down holds for as long as the mock runs. */
const ymd = days => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const todayAt = (h, back = 0) => { const d = new Date(); d.setDate(d.getDate() - back); d.setHours(h, 10, 0, 0); return d.getTime() / 1000 }
const BOARD = {
  notes: [{ id: 'n1', text: 'Dinner at 7. Love, Mom', by: "Mom's phone", added: todayAt(8), until: null },
          { id: 'n2', text: 'Piano at 4 on Saturday', by: "Dad's phone", added: todayAt(20, 1), until: null }],
  countdowns: [{ id: 'c1', what: "Sam's birthday", date: '2014-' + ymd(3).slice(5), next: ymd(3), yearly: true, by: "Dad's phone", added: todayAt(9, 5) },
               { id: 'c2', what: 'The lake trip', date: ymd(6), next: ymd(6), yearly: false, by: "Mom's phone", added: todayAt(9, 2) }],
  mornings: [],
}
/* The day's lines (hub/words.py reads brain/hub/words/), a few of each here, the same all day. */
const WORDS = {
  morning: ["You don't have to do it all today. Just the next thing.", 'Start small. Small things add up by evening.', 'If today gets hard, it won\'t stay hard all day.'],
  evening: ['Rest well. You did enough today.', 'Hang up the day like a coat by the door.', 'The moon has the night shift. You can rest.'],
}

export function photosRoute(req, res, p, env) {
  const send = (status, b) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)) }
  if (p === '/board' && req.method === 'GET') { send(200, BOARD); return true }
  if (p === '/board/notes' && req.method === 'POST') {
    body(req).then(b => { const n = { id: `n${Date.now()}`, text: String(b.text || '').trim(), by: 'This phone', added: Date.now() / 1000, until: b.until ?? null }
      if (!n.text) return send(400, { detail: 'A note needs something written in it.' })
      BOARD.notes.unshift(n); send(200, n) })
    return true
  }
  if (p === '/words/today') {
    const day = new URL(req.url, 'http://x').searchParams.get('day') || '', n = Math.floor(Date.parse(day) / 86400000) || 0
    send(200, { day, morning: WORDS.morning[n % 3], evening: WORDS.evening[n % 3] }); return true
  }
  if (p === '/board/mornings' && req.method === 'POST') {
    body(req).then(b => { const m = { id: `m${Date.now()}`, text: String(b.text || '').trim(), day: b.day, by: 'This phone', added: Date.now() / 1000 }
      if (!m.text) return send(400, { detail: 'A line for the morning needs something written in it.' })
      BOARD.mornings = [...BOARD.mornings.filter(x => x.day !== m.day), m]; send(200, m) })
    return true
  }
  if (p === '/board/countdowns' && req.method === 'POST') {
    body(req).then(b => { const c = { id: `c${Date.now()}`, what: String(b.what || '').trim(), date: b.date, next: b.date, yearly: /\b(birthday|anniversary)\b/i.test(b.what || ''), by: 'This phone', added: Date.now() / 1000 }
      if (!c.what || !/^\d{4}-\d{2}-\d{2}$/.test(c.date || '')) return send(400, { detail: 'A countdown needs a name and a day.' })
      BOARD.countdowns.push(c); BOARD.countdowns.sort((a, z) => a.next.localeCompare(z.next)); send(200, c) })
    return true
  }
  if (p.startsWith('/board/') && req.method === 'DELETE') {
    const id = p.slice('/board/'.length), size = () => BOARD.notes.length + BOARD.countdowns.length + BOARD.mornings.length, before = size()
    BOARD.notes = BOARD.notes.filter(n => n.id !== id); BOARD.countdowns = BOARD.countdowns.filter(c => c.id !== id); BOARD.mornings = BOARD.mornings.filter(m => m.id !== id)
    send(before === size() ? 404 : 200, { ok: true }); return true
  }
  if (p === '/screens/me' && req.method === 'POST') {
    body(req).then(b => {
      const known = SCREENS.find(s => s.id === b.id)
      const me = known ?? { id: String(b.id || 'screen'), room: b.room ?? null, room_name: null, tv: !!b.tv, by: b.by === 'person' ? 'person' : 'screen', photos: !!b.tv, play: 'days' }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(me))
    })
    return true
  }
  if (p.startsWith('/photos/screens/') && req.method === 'POST') {
    const s = SCREENS.find(x => x.id === p.slice('/photos/screens/'.length))
    body(req).then(b => { if (s && typeof b.on === 'boolean') s.photos = b.on; if (s && (b.play === 'each' || b.play === 'days')) s.play = b.play; if (s && (b.shows === 'photos' || b.shows === 'board')) s.shows = b.shows; if (s && typeof b.notes === 'boolean') s.notes = b.notes; if (s && typeof b.lines === 'boolean') s.lines = b.lines; res.writeHead(s ? 200 : 404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(s ?? { detail: 'No such screen.' })) })
    return true
  }
  if (p !== '/photos' && !p.startsWith('/photos/')) return false
  const shelf = env.PHOTOS === 'none' ? [] : SHELF
  const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
  if (p === '/photos' && req.method === 'POST') { json(200, { id: `sent${Date.now()}`, kind: 'jpg', added: now(), taken: null, by: 'This phone' }); return true }
  if (p === '/photos') { json(200, { photos: shelf.map(({ art: _art, ...rest }) => ({ ...rest, added: rest.taken })), screens: SCREENS }); return true }
  const one = shelf.find(x => x.id === p.slice('/photos/'.length))
  if (!one) { json(404, { detail: 'no such photo' }); return true }
  if (req.method === 'DELETE') { json(200, { ok: true }); return true }
  res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(one.art)
  return true
}
