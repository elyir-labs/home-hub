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

/* With a code already set, as a house in use has, so a visitor isn't greeted by a warning to go and set one. Or, from
   Set one up from the box (?box, design/try-setup/, A), a hub out of its box: first run whole, its Wi-Fi question
   first, with a bulb that joins only when the bar below switches it on. */
const box = new URLSearchParams(location.search).has('box')
const house = createHouse({ env: box ? { PRETEND: '1', FRESH: '1', NET: 'screen', PAIR: 'wait' } : { PRETEND: '1', LOCKED: '1' } })
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

/* On a page of its own, as a phone opens it, the pretend house says what it is and leads back to the site
   (design/site-more/, D). Inside the site's frame on a computer the site is already around it. A pretend hub's bar also
   says what a real one would be doing where that happens off the screen, read from the house rather than the page
   (design/try-setup/, A): the download after the Wi-Fi, the Wi-Fi itself, and a bulb waiting for a hand. */
if (window.top === window) {
  const style = document.createElement('style')
  style.textContent = `
    .try-bar { min-height: 44px; display: flex; flex-wrap: wrap; align-items: center; align-content: center; gap: 4px 14px; padding: 0 16px;
      background: #f1eee8; color: #1c1a16; font: 500 14.5px var(--sans, system-ui, sans-serif) }
    .try-bar a { color: inherit; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; min-height: 44px; margin-left: auto }
    .try-bar .try-say { color: #57534b; font-weight: 400; flex: 1 1 260px; min-width: 0 }
    .try-bar .try-say:empty { display: none }
    .try-bar .try-say em { font-style: normal; color: #1c1a16 }
    .try-bar button { height: 34px; padding: 0 16px; border: 0; border-radius: 999px; background: #1c1a16; color: #f1eee8; font: inherit; cursor: pointer }
    @media (min-width: 641px) { .try-bar { min-height: 60px; padding: 0 20px; font-size: 16px; gap: 4px 16px } }
    @media (max-width: 640px) {
      .try-bar { padding: 0 14px } .try-bar:has(.try-say:not(:empty)) { padding-bottom: 10px }
      .try-bar .try-say { flex-basis: 100%; order: 3 } .try-bar button { order: 4 } }
    html[data-try-bar] .shell, html[data-try-bar] .setup { height: calc(100dvh - var(--try-bar, 44px)) }`
  const bar = document.createElement('div')
  bar.className = 'try-bar'
  bar.innerHTML = `<b>${box ? 'A pretend hub' : 'A pretend house'}</b><span class="try-say"></span><a href="/"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>${box ? 'Leave' : 'Back to the site'}</a>`
  document.head.append(style)
  document.body.prepend(bar)
  document.documentElement.dataset.tryBar = ''
  new ResizeObserver(() => document.documentElement.style.setProperty('--try-bar', `${bar.offsetHeight}px`)).observe(bar)
  if (box) narrate(bar)
}

/* The hub's own Wi-Fi as a code beside the question is a picture the panel loads by <img>, which never comes through
   the house, so on a pretend hub the house draws it into the page instead. */
function drawSetupCode() {
  const swap = async (img: HTMLImageElement) => {
    img.dataset.drawn = ''
    const answer = await house.handle({ url: '/network/setup.svg' })
    if ('body' in answer && answer.status === 200) img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(String(answer.body))}`
  }
  new MutationObserver(() => {
    for (const img of document.querySelectorAll<HTMLImageElement>('img[src$="/network/setup.svg"]:not([data-drawn])')) void swap(img)
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] })
}

function narrate(bar: HTMLElement) {
  const say = bar.querySelector('.try-say')!
  const ask = async (url: string) => {
    const answer = await house.handle({ url })
    try { return 'body' in answer ? JSON.parse(String(answer.body)) : {} } catch { return {} }
  }
  const switchOn = document.createElement('button')
  switchOn.type = 'button'
  switchOn.textContent = 'Switch one on'
  switchOn.onclick = () => { void house.handle({ method: 'POST', url: '/pretend/switch-on' }) }
  let said = ''
  const look = async () => {
    const [status, net, pair] = await Promise.all([ask('/setup/status'), ask('/network'), ask('/pair')])
    const line = pair.state === 'listening' ? 'A plug or bulb joins when you switch it on, or press its button.'
      : status.driver === 'down' && net.joined ? 'A real hub downloads the rest of itself the first time, which takes a few minutes. <em>This one takes a moment.</em>'
      : status.driver === 'down' && net.setup ? 'On a real hub this is your own Wi‑Fi. <em>Here, any password joins.</em>'
      : ''
    if (line === said) return
    said = line
    say.innerHTML = line
    if (pair.state === 'listening') bar.insertBefore(switchOn, bar.querySelector('a'))
    else switchOn.remove()
  }
  void look()
  window.setInterval(look, 1000)
}

if (box) drawSetupCode()

void import('./main')
