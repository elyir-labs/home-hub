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
import { COLOR, NAME, HOUSE, TIME, SLOW, FIRST, READY, GLYPHS, WORDS, SCAN } from './sequence.mjs'
import { THEME, K, NAME_FRAMES, fingerprint, themeFile, timingSh, script, glyphFile, smallFile } from './plymouth.mjs'

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
// quieter line under it where a step has one.
const font = (w, weight = 400) => `font:${weight} ${w.size * K}px/1.3 'Instrument Sans',sans-serif`
const across = (file, w, text, color = w.color, weight = 400) =>
  shoot(file, 1400 * K, w.size * 1.3 * K, `<div style="text-align:center;white-space:nowrap;${font(w, weight)};color:${color}">${text}</div>`)
for (const [id, w] of Object.entries(FIRST)) {
  await across(`step-${id}.png`, WORDS.line, w.line)
  if (w.quiet) await across(`quiet-${id}.png`, WORDS.quiet, w.quiet)
}
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

await browser.close()

writeFileSync(new URL(`${THEME}.plymouth`, OUT), themeFile())
writeFileSync(new URL(`${THEME}.script`, OUT), script())
writeFileSync(new URL('timing.sh', OUT), timingSh())
writeFileSync(new URL('fingerprint', OUT), fingerprint() + '\n')
console.log(`drew ${NAME_FRAMES} frames of the name, the splash's lamp, house and sentence, and a first start's words into ${OUT.pathname}`)
