// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/*
 * The pretend house (hub.elyir.com/try, docs/apps.md): the real panel, with the mock house running inside this page
 * instead of a hub behind it. Each visitor has a house of their own, and a reload puts it back as it was.
 *
 * The panel is left exactly as it ships. It reaches a hub through fetch on its own origin and one websocket to
 * /stream, so before it loads, this page answers both itself: a request for anything outside the page's own folder
 * goes to the house (mock/house.mjs), and the stream is the house's pushes. What the panel loads by <img> or
 * <audio> -- a QR code, a camera's moving picture, a printer's camera -- is never seen here and does not draw.
 */
import { createHouse } from '../mock/house.mjs'

/* With a code already set, as a house in use has, so a visitor isn't greeted by a warning to go and set one. */
const house = createHouse({ env: { PRETEND: '1', LOCKED: '1' } })
const own = import.meta.env.BASE_URL
const forHouse = (url: URL) => url.origin === location.origin && !url.pathname.startsWith(own)
const NO_BODY = [101, 103, 204, 205, 304]
const missed = new Set<string>()

const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new Request(input, init)
  const url = new URL(req.url)
  if (!forHouse(url)) return realFetch(input, init)
  const headers: Record<string, string> = { referer: location.href }   // printers and power read the page's own address off it
  req.headers.forEach((v, k) => { headers[k] = v })
  const body = req.method === 'GET' || req.method === 'HEAD' ? '' : await req.text()
  const answer = await house.handle({ method: req.method, url: url.pathname + url.search, headers, body })
  if (answer.pass) {
    /* A hub that does not know a route says 404, and the panel already reads that as an older hub. */
    if (!missed.has(url.pathname)) { missed.add(url.pathname); console.warn(`the pretend house has no answer for ${req.method} ${url.pathname}`) }
    return Response.json({ detail: 'Not Found' }, { status: 404 })
  }
  return new Response(NO_BODY.includes(answer.status) ? null : answer.body as BodyInit, { status: answer.status, headers: answer.headers })
}

/* The live link. Messages arrive on a later turn than the answer to the tap that caused them, as they do from a hub. */
class HouseSocket extends EventTarget {
  static readonly CONNECTING = 0; static readonly OPEN = 1; static readonly CLOSING = 2; static readonly CLOSED = 3
  readonly CONNECTING = 0; readonly OPEN = 1; readonly CLOSING = 2; readonly CLOSED = 3
  readyState = 0
  protocol = ''
  extensions = ''
  binaryType: BinaryType = 'blob'
  bufferedAmount = 0
  onopen: ((e: Event) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onclose: ((e: CloseEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  private stop: (() => void) | null = null
  readonly url: string

  constructor(url: string, stream: boolean) {
    super()
    this.url = url
    setTimeout(() => {
      if (this.readyState !== 0) return
      /* Only /stream is the house's: a camera's live picture (/webrtc) has nothing to come from, and fails the way
         a hub with no video fails, so the viewer settles for stills. */
      if (!stream) { this.fire(new Event('error')); return this.finish(1006) }
      this.readyState = 1
      this.stop = house.listen(data => setTimeout(() => { if (this.readyState === 1) this.fire(new MessageEvent('message', { data })) }))
      this.fire(new Event('open'))
    })
  }
  send() {}
  close(code = 1000) {
    if (this.readyState >= 2) return
    this.stop?.()
    this.finish(code)
  }
  private finish(code: number) {
    this.readyState = 3
    this.fire(new CloseEvent('close', { code, wasClean: code === 1000 }))
  }
  private fire(e: Event) {
    this.dispatchEvent(e)
    const on = (this as any)[`on${e.type}`]
    if (typeof on === 'function') on.call(this, e)
  }
}

window.WebSocket = new Proxy(window.WebSocket, {
  construct(Real, [url, protocols]: [string | URL, (string | string[])?]) {
    const u = new URL(url, location.href)
    if (u.host !== location.host || u.pathname.startsWith(own)) return new Real(url, protocols)
    return new HouseSocket(u.href, u.pathname === '/stream')
  },
})

void import('./main')
