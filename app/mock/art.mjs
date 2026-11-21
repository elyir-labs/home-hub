// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The paintings (hub/art.py, design/tv-art/) in the mock house, served by the mock's own server and not the pretend
   house in the browser, since it reads files. The set is the hub's own paintings.json. A painting tools/art/prepare.py
   has already made on this computer (~/.cache/elyir/art) is shown as itself; any other is a plain stand-in of the
   same shape, so a preview never needs the download. ART=none is a hub whose code has no set yet. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SET = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'brain', 'hub', 'paintings.json')
const OUT = path.join(process.env.ART_CACHE || path.join(os.homedir(), '.cache', 'elyir', 'art'), 'out')
const paintings = () => {
  if (process.env.ART === 'none') return []
  try { return JSON.parse(fs.readFileSync(SET, 'utf8')).paintings.filter(p => p.id && p.w && p.h) } catch { return [] }
}
const KEYS = ['id', 'title', 'painter', 'year', 'museum', 'line', 'w', 'h', 'focus']
const standIn = p => `<svg xmlns='http://www.w3.org/2000/svg' width='${p.w}' height='${p.h}' viewBox='0 0 ${p.w} ${p.h}'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#6b7a5a'/><stop offset='.5' stop-color='#c9a35e'/><stop offset='1' stop-color='#3f4a5c'/></linearGradient></defs><rect width='100%' height='100%' fill='url(#g)'/><g fill='none' stroke='#2a2418' stroke-opacity='.25' stroke-width='${Math.round(p.w / 200)}'>${Array.from({ length: 24 }, (_, i) => `<path d='M0 ${Math.round(p.h * (i + 1) / 25)} Q ${p.w / 2} ${Math.round(p.h * (i + 1) / 25 - p.h / 12)} ${p.w} ${Math.round(p.h * (i + 1) / 25)}'/>`).join('')}</g></svg>`

export function artRoute(req, res) {
  const p = new URL(req.url, 'http://x').pathname
  if (p !== '/art' && !p.startsWith('/art/')) return false
  const set = paintings()
  if (p === '/art') {
    const list = set.map(x => Object.fromEntries(KEYS.map(k => [k, x[k] ?? null])))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ paintings: list, have: list.length, of: list.length, bytes: set.reduce((t, x) => t + (x.bytes || 400_000), 0), getting: false, failed: false }))
    return true
  }
  const one = set.find(x => x.id === decodeURIComponent(p.slice('/art/'.length)))
  if (!one) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"detail":"no such painting"}'); return true }
  const file = one.file && path.join(OUT, one.file)
  if (file && fs.existsSync(file)) { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); fs.createReadStream(file).pipe(res); return true }
  res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(standIn(one))
  return true
}
