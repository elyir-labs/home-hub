// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The household's photos for a TV at rest (hub/photos.py, design/rest-tv/, A), in the mock house. Three painted
   stand-ins, one wide and two taken upright, so a preview shows nobody's real pictures. PHOTOS=none is a house
   nobody has sent a photo to yet, which rests on the sky instead (C). A photo sent here is acknowledged and not kept. */
const WIDE = `<svg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080' viewBox='0 0 1920 1080'><defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#5d5a8e'/><stop offset='.38' stop-color='#d98a72'/><stop offset='.6' stop-color='#f4c58b'/></linearGradient><linearGradient id='w' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#c98a6e'/><stop offset='.5' stop-color='#5f5574'/><stop offset='1' stop-color='#2e2c44'/></linearGradient></defs><rect width='1920' height='660' fill='url(#s)'/><circle cx='1190' cy='600' r='46' fill='#fff1cf'/><rect y='620' width='1920' height='460' fill='url(#w)'/><path d='M0 600 C 180 520 330 540 470 590 S 700 640 760 640 L0 660z' fill='#3b3047'/><path d='M1500 640 C 1600 560 1760 520 1920 545 V660 H1500z' fill='#342b40'/><path d='M0 880 C 400 840 900 860 1920 900 V1080 H0z' fill='#c9a68a'/><path d='M0 930 C 500 905 1100 920 1920 960 V1080 H0z' fill='#a98a74'/></svg>`
const TREE = `<svg xmlns='http://www.w3.org/2000/svg' width='1080' height='1440' viewBox='0 0 600 800'><defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#a9c3d9'/><stop offset='1' stop-color='#e7dccb'/></linearGradient></defs><rect width='600' height='800' fill='url(#s)'/><rect x='282' y='330' width='34' height='300' fill='#4a3426'/><circle cx='300' cy='300' r='170' fill='#d27a2c'/><circle cx='190' cy='360' r='110' fill='#c0612a'/><circle cx='410' cy='350' r='120' fill='#e0953c'/><circle cx='300' cy='190' r='110' fill='#e9a648'/><path d='M0 640 C 200 600 400 610 600 650 V800 H0z' fill='#7d8b4a'/></svg>`
const SNOW = `<svg xmlns='http://www.w3.org/2000/svg' width='1080' height='1440' viewBox='0 0 600 800'><defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#1e2440'/><stop offset='.6' stop-color='#3d4a72'/><stop offset='1' stop-color='#cdd6e6'/></linearGradient></defs><rect width='600' height='800' fill='url(#s)'/><path d='M40 260 L180 180 L320 260 V640 H40z' fill='#2a2f45'/><path d='M320 300 L450 230 L580 300 V640 H320z' fill='#323954'/><g fill='#f3c27a'><rect x='90' y='330' width='56' height='70'/><rect x='214' y='330' width='56' height='70'/><rect x='370' y='360' width='50' height='62'/></g><path d='M0 630 C 200 610 420 620 600 640 V800 H0z' fill='#e8edf5'/></svg>`
const DAY = 86400
const now = () => Date.now() / 1000
const SHELF = [
  { id: 'coast', kind: 'svg', art: WIDE, w: 1920, h: 1080, by: "Sam's phone", taken: now() - 460 * DAY },
  { id: 'tree', kind: 'svg', art: TREE, w: 1080, h: 1440, by: "Jordan's iPhone", taken: now() - 30 * DAY },
  { id: 'snow', kind: 'svg', art: SNOW, w: 1080, h: 1440, by: "Jordan's iPhone", taken: now() - 330 * DAY },
]

export function photosRoute(req, res, p, env) {
  if (p !== '/photos' && !p.startsWith('/photos/')) return false
  const shelf = env.PHOTOS === 'none' ? [] : SHELF
  const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
  if (p === '/photos' && req.method === 'POST') { json(200, { id: `sent${Date.now()}`, kind: 'jpg', added: now(), taken: null, by: 'This phone' }); return true }
  if (p === '/photos') { json(200, { photos: shelf.map(({ art: _art, ...rest }) => ({ ...rest, added: rest.taken })) }); return true }
  const one = shelf.find(x => x.id === p.slice('/photos/'.length))
  if (!one) { json(404, { detail: 'no such photo' }); return true }
  if (req.method === 'DELETE') { json(200, { ok: true }); return true }
  res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(one.art)
  return true
}
