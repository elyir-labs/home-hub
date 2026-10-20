/* A stand-in for the brain, for looking at the panel without a hub: serves ../dist and the mock house of eight rooms
   (mock/house.mjs, where the house and every knob it takes live). `npm run mock`, then open http://localhost:8399/ (every
   ?at= ?wx= ?month= ?room= ?sheet= ?setup= preview works), or `BRAIN=http://localhost:8399 npm run dev` for hot reload
   against it. PORT moves it; every other knob is the house's, read from the environment. This file is only the Node
   around the house: the server, the page's own files, the QR codes the brain's venv can draw, and the live stream. */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createHouse } from './house.mjs'

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const PORT = Number(process.env.PORT || 8399)
const BRAIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'brain')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' }

/* A real code where one can be drawn, and a picture of one where it cannot.

   This used to be a fixed decorative pattern that ignored `text`, which is fine for a screenshot
   and a trap for anything else: the wall's hand-off code and the phone-onboarding code both looked
   right and decoded to nothing, so a camera pointed at the mock silently did nothing at all. The
   hub draws these with qrcode in Python (qr_svg_bytes, brain/hub/api.py); if that venv is here,
   use it, so what the mock shows is the same code the hub would show. */
function qr(text) {
  try {
    return execFileSync(path.join(BRAIN, '.venv/bin/python'),
      ['-c', 'import sys; sys.path.insert(0, sys.argv[1]); from hub.api import qr_svg_bytes; sys.stdout.buffer.write(qr_svg_bytes(sys.argv[2]))', BRAIN, text],
      { timeout: 4000 })
  } catch { return null }
}

const house = createHouse({ env: process.env, qr })

const server = http.createServer((req, res) => {
  const chunks = []
  req.on('data', c => chunks.push(c))
  req.on('end', async () => {
    const answer = await house.handle({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() })
    if (!answer.pass) { res.writeHead(answer.status, answer.headers); return res.end(answer.body) }
    for (const [k, v] of Object.entries(answer.headers)) res.setHeader(k, v)
    const p = new URL(req.url, 'http://x').pathname
    let f = path.join(DIST, p === '/' ? 'index.html' : p)
    if (!fs.existsSync(f)) f = path.join(DIST, 'index.html')
    if (!fs.existsSync(f)) { res.writeHead(503, { 'Content-Type': 'text/plain' }); return res.end('No dist/ yet: run `npm run build` first, or use `BRAIN=http://localhost:' + PORT + ' npm run dev`.') }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' })
    fs.createReadStream(f).pipe(res)
  })
})
/* The panel's live stream. It used to be held open and never written to, which was fine until a
   screen existed whose whole point is something happening in the room while you watch -- naming a
   switch by pressing it. Now anything the house changes is pushed the way the hub pushes it. */
const live = new Set()
house.listen(s => { for (const sock of live) { try { sock.write(frame(s)) } catch { live.delete(sock) } } })
function frame(text) {
  const b = Buffer.from(text)
  const head = b.length < 126 ? Buffer.from([0x81, b.length])
    : Buffer.concat([Buffer.from([0x81, 126]), Buffer.from([b.length >> 8, b.length & 0xff])])
  return Buffer.concat([head, b])
}
// keep the websocket open; the panel shows Connected, and the house's pushes are sent when there is something to say
server.on('upgrade', (req, socket) => {
  if (/\/webrtc$/.test(req.url)) return socket.destroy()   // no WebRTC here either
  const key = req.headers['sec-websocket-key']
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
  // A page that carries its pass as the subprotocol pair `hub, <token>` (the house's own name, the Houses app) must
  // be answered with `hub`, as the brain does (_ws_accept_kwargs), or the browser drops the link.
  const sub = String(req.headers['sec-websocket-protocol'] || '').startsWith('hub') ? 'Sec-WebSocket-Protocol: hub\r\n' : ''
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' + sub + 'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n')
  live.add(socket)
  socket.on('close', () => live.delete(socket))
  socket.on('error', () => { live.delete(socket); })
})
server.listen(PORT, () => console.log(`mock brain on http://localhost:${PORT}/`))
