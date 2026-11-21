// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Draws the boot splash's images from sequence.mjs and writes the theme beside them, into
// startup/plymouth/elyir/. Run after changing sequence.mjs:
//
//   node startup/render.mjs
//
// It borrows the panel's Playwright (app/node_modules) to draw; PLAYWRIGHT=<path to the package's
// index.mjs> points it at another copy.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { COLOR, NAME, HOUSE, TIME, SLOW, ONCE, FIRST, READY, GLYPHS, WORDS, SCAN, ASK, ASK_AT, MODEM } from './sequence.mjs'
import { THEME, K, NAME_FRAMES, fingerprint, themeFile, timingSh, script, glyphFile, smallFile, driveFile, DRIVE_SETS, optionFile } from './plymouth.mjs'

const OUT = new URL(`plymouth/${THEME}/`, import.meta.url)
const from = process.env.PLAYWRIGHT ?? new URL('../app/node_modules/playwright/index.mjs', import.meta.url).href
const { chromium } = await import(from)

const rgb = (c, a = 1) => `rgba(${c.join(',')},${a})`
const ease = (x) => x * x * (3 - 2 * x)
const LINE = 'fill="none" stroke-linecap="round" stroke-linejoin="round"'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 2000, height: 1400 } })
await page.setContent(`<!doctype html><html><head>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500&display=swap">
  <style>html,body{margin:0;background:transparent} #c{position:absolute;left:0;top:0}</style></head><body><div id="c"></div></body></html>`)
await page.evaluate(() => document.fonts.ready)

async function shoot(file, w, h, html) {
  await page.evaluate(([w, h, html]) => {
    const c = document.getElementById('c')
    Object.assign(c.style, { width: w + 'px', height: h + 'px' })
    c.innerHTML = html
  }, [Math.round(w), Math.round(h), html])
  await page.locator('#c').screenshot({ path: new URL(file, OUT).pathname, omitBackground: true })
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

// The name, frame by frame as the pen goes, without its dot: the dot is a lamp of its own.
const nw = NAME.width * K, nh = NAME.height * K
const total = await page.evaluate((d) => {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  p.setAttribute('d', d)
  return p.getTotalLength()
}, NAME.d)
for (let i = 0; i < NAME_FRAMES; i++) {
  const shown = total * ease(i / (NAME_FRAMES - 1))
  await shoot(`name-${String(i).padStart(2, '0')}.png`, nw, nh, `<svg width="${nw}" height="${nh}" viewBox="${NAME.viewBox.join(' ')}">
    <path d="${NAME.d}" stroke="${COLOR.ink}" stroke-width="${NAME.stroke}" ${LINE}
      stroke-dasharray="${total} ${total}" stroke-dashoffset="${total - shown}" ${shown === 0 ? 'opacity="0"' : ''}/></svg>`)
}

// The lamp, lit and unlit, drawn large; the splash scales it to whatever size the moment wants.
const disc = (c) => `<div style="width:128px;height:128px;border-radius:50%;background:${rgb(c)}"></div>`
await shoot('dot.png', 128, 128, disc(COLOR.lamp))
await shoot('dot-unlit.png', 128, 128, disc(COLOR.unlit))

// The dot's own glow, drawn around a dot 32 px across and scaled with the dot. A shadow
// is not painted under its own box, so the box is filled too; otherwise a smaller dot shows a dark ring.
const g = (32 + 180) * K, d = 32 * K
await shoot('dot-glow.png', g, g, `<div style="position:absolute;left:${(g - d) / 2}px;top:${(g - d) / 2}px;width:${d}px;height:${d}px;border-radius:50%;
  background:${rgb(COLOR.lamp, 0.45)};box-shadow:0 0 ${60 * K}px ${18 * K}px ${rgb(COLOR.lamp, 0.45)}"></div>`)

// The house's outline, without its lamp, and the wide warm glow the lamp throws in it.
const hs = HOUSE.size * K
await shoot('house.png', hs, hs, `<svg width="${hs}" height="${hs}" viewBox="0 0 512 512">
  <path d="${HOUSE.roof}" stroke="${COLOR.ink}" stroke-width="${HOUSE.stroke}" ${LINE}/>
  <path d="${HOUSE.walls}" stroke="${COLOR.ink}" stroke-width="${HOUSE.stroke}" ${LINE}/></svg>`)
const hg = HOUSE.size * 1.1 * K
await shoot('house-glow.png', hg, hg, `<div style="width:100%;height:100%;border-radius:50%;
  background:radial-gradient(circle, ${rgb(COLOR.lamp, 0.55)}, ${rgb(COLOR.lamp, 0)} 68%)"></div>`)

// The one sentence a slow start shows.
const sw = 1100 * K, sh = 80 * K
await shoot('slow.png', sw, sh, `<div style="width:${sw}px;text-align:center;font:400 ${24 * K}px/1.35 'Instrument Sans',sans-serif;color:#b9b5ad">${SLOW}</div>`)

// A first start's words (design/first-start/): a line per step, centered in a box as wide as the screen, and the
// quieter line under it: the step's own, or how long a first start takes.
const font = (w, weight = 400) => `font:${weight} ${w.size * K}px/1.3 'Instrument Sans',sans-serif`
const across = (file, w, text, color = w.color, weight = 400) =>
  shoot(file, 1400 * K, w.size * 1.3 * K, `<div style="text-align:center;white-space:nowrap;${font(w, weight)};color:${color}">${text}</div>`)
for (const [id, w] of Object.entries(FIRST)) {
  await across(`step-${id}.png`, WORDS.line, w.line)
  if (w.quiet) await across(`quiet-${id}.png`, WORDS.quiet, w.quiet)
}
await across('quiet-once.png', WORDS.quiet, ONCE)
await across('ready.png', WORDS.ready, READY.line)

// Where to go next is set on the unit from pieces laid side by side: the words, and this hub's own address, Wi-Fi
// and password a letter at a time. Each piece is exactly as wide as its text, so the pieces meet as the line would.
const wide = (text, weight, w = WORDS.where) => page.evaluate(([text, f]) => {
  const span = document.createElement('span')
  span.style.cssText = `${f};white-space:pre;position:absolute`
  span.textContent = text
  document.body.appendChild(span)
  const w = span.getBoundingClientRect().width
  span.remove()
  return w
}, [text, font(w, weight)])
const piece = async (file, text, color, weight, w = WORDS.where) =>
  shoot(file, Math.max(1, Math.round(await wide(text, weight, w))), w.size * 1.3 * K,
    `<div style="white-space:pre;${font(w, weight)};color:${color}">${text}</div>`)
await piece('where-cable.png', READY.cable, WORDS.where.color, 400)
await piece('where-wifi.png', READY.wifi, WORDS.where.color, 400)
await piece('where-password.png', READY.password, WORDS.where.color, 400)
for (const c of GLYPHS) await piece(glyphFile(c), c, WORDS.where.value, WORDS.where.weight)

// Ready with a code (E): the light tile the code sits on, the line over the words, and the words, smaller.
const ts = SCAN.tile.size * K
await shoot('tile.png', ts, ts, `<div style="width:${ts}px;height:${ts}px;border-radius:${SCAN.tile.radius * K}px;background:${SCAN.tile.color}"></div>`)
await across('scan-wifi.png', WORDS.scan, SCAN.wifi)
await across('scan-addr.png', WORDS.scan, SCAN.addr)
await piece('or-wifi.png', SCAN.orWifi, WORDS.or.color, 400, WORDS.or)
await piece('or-password.png', SCAN.orPassword, WORDS.or.color, 400, WORDS.or)
await piece('or-addr.png', SCAN.orAddr, WORDS.or.color, 400, WORDS.or)
await piece('or-addr-after.png', SCAN.orAddrAfter, WORDS.or.color, 400, WORDS.or)
for (const c of GLYPHS) await piece(smallFile(c), c, WORDS.or.value, WORDS.or.weight, WORDS.or)

// Asked on the screen at the start (design/move-to-drive/: screen-asks, keys-2, stick-try): the fixed parts are pictures,
// each answer drawn twice (highlighted and not), and the card's own words are set from letters in the sizes and colors
// the card, the warning and the typed word use.
const at = (w) => ({ size: w.size, top: w.top, color: w.color })
const A = ASK_AT
for (const [kind, q] of Object.entries(ASK.kinds)) {
  await across(`ask-${kind}-title.png`, at(A.title), q.title)
  await across(`ask-${kind}-foot.png`, at(A.foot), q.foot)
}
await across('ask-hint.png', A.hint, ASK.hint)
await across('drive-sure.png', at(A.title), ASK.sure)
await across('over-title.png', at(A.title), ASK.over.title)
await across('drive-type.png', at(A.type), ASK.type.replace('<b>', `<b style="font-weight:500;color:#f1eee8">`))
await across('drive-undone.png', at(A.warn), ASK.undone)
await across('drive-ready.png', WORDS.ready, ASK.ready)
await across('drive-scan.png', WORDS.scan, ASK.scan)
const c = A.card
const cardBg = (icon, bg) => `<div style="box-sizing:border-box;width:${c.width * K}px;height:${c.height * K}px;
  padding:0 ${26 * K}px;border-radius:${16 * K}px;background:#15161a;border:${K}px solid #26272c;display:flex;align-items:center">
  <span style="width:${52 * K}px;height:${52 * K}px;border-radius:${12 * K}px;background:${bg};display:grid;place-items:center">${icon}</span></div>`
await shoot('drive-card.png', c.width * K, c.height * K, cardBg(`<svg width="${28 * K}" height="${28 * K}" viewBox="0 0 24 24" fill="none"
  stroke="#d9d5cd" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 12h.01M11 12h6"/></svg>`, '#1f2025'))
await shoot('home-card.png', c.width * K, c.height * K, cardBg(`<svg width="${28 * K}" height="${28 * K}" viewBox="0 0 24 24" fill="none"
  stroke="#e9b872" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/>
  <circle cx="12" cy="14.5" r="1.6" fill="#e9b872" stroke="none"/></svg>`, '#2a2219'))
const ch = A.choices
for (const [kind, q] of Object.entries(ASK.kinds)) for (const o of q.options) for (const on of [0, 1]) {
  await shoot(optionFile(kind, o.key, on), ch.width * K, ch.height * K, `<div style="box-sizing:border-box;width:${ch.width * K}px;
    height:${ch.height * K}px;padding:0 ${22 * K}px;border-radius:${14 * K}px;display:flex;gap:${18 * K}px;align-items:center;
    font-family:'Instrument Sans',sans-serif;line-height:1.35;${on ? `border:${2 * K}px solid #e9b872;background:#17181c;color:#f1eee8`
      : `border:${K}px solid #26272c;background:#101114;color:#d9d5cd`}">
    <span style="flex:none;width:${44 * K}px;text-align:center;box-sizing:border-box;padding:${6 * K}px 0;border-radius:${9 * K}px;
      border:${K}px solid ${on ? '#e9b872' : '#3a3b41'};border-bottom-width:${3 * K}px;font-size:${18 * K}px;font-weight:500;
      color:${on ? '#e9b872' : '#f1eee8'};background:#1b1c20">${o.key}</span>
    <span style="font-size:${21 * K}px;white-space:nowrap">${o.text}<small style="display:block;margin-top:${2 * K}px;
      font-size:${18 * K}px;color:#8f8b84">${o.small}</small></span></div>`)
}
const keyRows = (rows, width) => `<div style="width:${width * K}px;font-family:'Instrument Sans',sans-serif">${rows.map((r) =>
  `<div style="display:flex;align-items:baseline;gap:${18 * K}px;margin-bottom:${20 * K}px;font-size:${21 * K}px;color:#d9d5cd;line-height:1.35">
  <span style="flex:none;min-width:${84 * K}px;text-align:center;box-sizing:border-box;padding:${6 * K}px ${12 * K}px;border-radius:${9 * K}px;
  border:${K}px solid #3a3b41;border-bottom-width:${3 * K}px;font-size:${18 * K}px;font-weight:500;color:#f1eee8;background:#1b1c20">${r.cap}</span>
  <span>${r.text}</span></div>`).join('')}</div>`
const tall = async (html, width) => page.evaluate(([html, w]) => {
  const d = document.createElement('div'); d.style.cssText = `position:absolute;width:${w}px`; d.innerHTML = html
  document.body.appendChild(d); const h = d.getBoundingClientRect().height; d.remove(); return Math.ceil(h)
}, [html, width])
for (const [file, rows, w] of [['drive-sure-keys.png', ASK.sureKeys, A.keys.width], ['drive-back-key.png', ASK.backKey, A.keys.width],
  ['over-keys.png', ASK.over.keys, A.overKeys.width]]) {
  const html = keyRows(rows, w)
  await shoot(file, w * K, await tall(html, w * K), html)
}
const ow = `<div style="width:${1400 * K}px;text-align:center;${font(A.warn)};line-height:1.45;color:${A.warn.color}">${ASK.over.warn}</div>`
await shoot('over-warn.png', 1400 * K, await tall(ow, 1400 * K), ow)
const e = A.entry, k = A.caret
await shoot('drive-entry.png', e.width * K, e.height * K, `<div style="box-sizing:border-box;width:${e.width * K}px;height:${e.height * K}px;
  border-radius:${12 * K}px;border:${K}px solid ${k.color};background:#15161a"></div>`)
await shoot('drive-caret.png', k.width * K, k.height * K, `<div style="width:${k.width * K}px;height:${k.height * K}px;background:${k.color}"></div>`)
const holdFont = `font:400 ${e.size * K}px/1.3 'Instrument Sans',sans-serif;letter-spacing:${e.spacing}em`
const holdW = await page.evaluate(([t, f]) => {
  const span = document.createElement('span'); span.style.cssText = `${f};white-space:pre;position:absolute`; span.textContent = t
  document.body.appendChild(span); const w = span.getBoundingClientRect().width; span.remove(); return w
}, [ASK.placeholder, holdFont])
await shoot('drive-hold.png', Math.round(holdW), e.size * 1.3 * K, `<div style="white-space:pre;${holdFont};color:${e.hold}">${ASK.placeholder}</div>`)
const letter = async (file, ch, w) => {
  const f = `font:${w.weight || 400} ${w.size * K}px/1.3 'Instrument Sans',sans-serif;letter-spacing:${w.spacing || 0}em`
  const width = await page.evaluate(([t, f]) => {
    const span = document.createElement('span'); span.style.cssText = `${f};white-space:pre;position:absolute`; span.textContent = t
    document.body.appendChild(span); const w = span.getBoundingClientRect().width; span.remove(); return w
  }, [ch, f])
  await shoot(file, Math.max(1, Math.round(width)), w.size * 1.3 * K, `<div style="white-space:pre;${f};color:${w.color}">${ch}</div>`)
}
for (const [set, key] of Object.entries(DRIVE_SETS)) for (const ch of GLYPHS) await letter(driveFile(set, ch), ch, ASK_AT[key])

// Ready on a cable into the modem (design/modem-cable/, C): a smaller tile for the left column, the lines that are
// always the same, the drawing of the cable, the split between the two answers, and the words beside the drawing.
const mt = MODEM.tile.size * K
await shoot('modem-tile.png', mt, mt, `<div style="width:${mt}px;height:${mt}px;border-radius:${SCAN.tile.radius * K}px;background:${SCAN.tile.color}"></div>`)
await across('modem-ready.png', WORDS.scanReady, MODEM.ready)
await across('modem-alone.png', WORDS.scanReady, MODEM.alone)
await across('modem-scan.png', MODEM.big, MODEM.scan)
await piece('modem-or-join.png', MODEM.orJoin, WORDS.or.color, 400, WORDS.or)
const mp = MODEM.picture
await shoot('modem-picture.png', mp.width * K, mp.height * K,
  MODEM.drawing.replace(`width="${mp.width}" height="${mp.height}"`, `width="${mp.width * K}" height="${mp.height * K}"`))
const sp = MODEM.split
await shoot('modem-split.png', sp.width * K, sp.height * K, `<div style="width:${sp.width * K}px;height:${sp.height * K}px;display:flex;flex-direction:column;align-items:center;font-family:'Instrument Sans',sans-serif">
  <i style="display:block;width:${K}px;height:${120 * K}px;background:#2b2721"></i>
  <span style="height:${60 * K}px;line-height:${60 * K}px;font-size:${18 * K}px;color:#6f6b64;letter-spacing:.1em;text-transform:uppercase">or</span>
  <i style="display:block;width:${K}px;height:${160 * K}px;background:#2b2721"></i></div>`)
const words = (big, small, width) => `<div style="width:${width * K}px;text-align:center;font-family:'Instrument Sans',sans-serif">
  <div style="font-size:${MODEM.big.size * K}px;color:${MODEM.big.color};line-height:1.3">${big}</div>
  <div style="margin-top:${10 * K}px;font-size:${MODEM.small.size * K}px;color:${MODEM.small.color};line-height:1.45">${small}</div></div>`
for (const [file, big, small, w] of [['modem-move.png', MODEM.move, MODEM.moveWhy, MODEM.words.width],
  ['modem-alone-move.png', MODEM.aloneMove, MODEM.aloneWhy, MODEM.aloneWords.width]]) {
  const html = words(big, small, w)
  await shoot(file, w * K, await tall(html, w * K), html)
}

await browser.close()

writeFileSync(new URL(`${THEME}.plymouth`, OUT), themeFile())
writeFileSync(new URL(`${THEME}.script`, OUT), script())
writeFileSync(new URL('timing.sh', OUT), timingSh())
writeFileSync(new URL('fingerprint', OUT), fingerprint() + '\n')
console.log(`drew ${NAME_FRAMES} frames of the name, the splash's lamp, house and sentence, and a first start's words into ${OUT.pathname}`)
