// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The picture chosen in design/boot/ (J) is the spec. These fail on purpose when the board, the
// sequence and the splash that ships stop agreeing: change the board first, then sequence.mjs,
// then `node startup/render.mjs`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { NAME, HOUSE, TIME, BREATH, FIRST, READY, GLYPHS, WORDS } from './sequence.mjs'
import { json } from './json.mjs'
import { THEME, NAME_FRAMES, fingerprint, themeFile, timingSh, script } from './plymouth.mjs'

const theme = (f) => new URL(`plymouth/${THEME}/${f}`, import.meta.url)
const read = (u) => readFileSync(u, 'utf8')
const board = read(new URL('../design/boot/boot.js', import.meta.url))

test('the splash was drawn from this sequence', () => {
  assert.equal(read(theme('fingerprint')).trim(), fingerprint(), 'sequence.mjs or render.mjs changed: run node startup/render.mjs')
})

test('the committed theme is what the sequence generates', () => {
  assert.equal(read(theme(`${THEME}.script`)), script())
  assert.equal(read(theme(`${THEME}.plymouth`)), themeFile())
  assert.equal(read(theme('timing.sh')), timingSh())
})

test('the numbers the phone apps draw from are this sequence', () => {
  assert.equal(read(new URL('sequence.json', import.meta.url)), json(), 'run node startup/json.mjs')
})

test('every image the script asks for is there', () => {
  const names = [...script().matchAll(/Image\("([^"]+)"\)/g)].map((m) => m[1]).filter((f) => !f.startsWith('name-'))
  for (let i = 0; i < NAME_FRAMES; i++) names.push(`name-${String(i).padStart(2, '0')}.png`)
  for (const f of names) assert.ok(existsSync(theme(f)), `missing ${f}`)
})

test('the board draws the same name, house and timing', () => {
  const pieces = board.match(/const ELYIR = ([\s\S]*?)\n\s*const ELYIR_AT/)[1]
  assert.equal([...pieces.matchAll(/'([^']*)'/g)].map((m) => m[1]).join(''), NAME.d)
  assert.match(board, /const ELYIR_AT = \{ write: ([\d.]+), hold: ([\d.]+) \}/)
  const [, write, hold] = board.match(/const ELYIR_AT = \{ write: ([\d.]+), hold: ([\d.]+) \}/)
  assert.equal(+write, TIME.write)
  assert.equal(+hold, TIME.hold)
  assert.equal(+board.match(/const LAMP_BREATH = ([\d.]+)/)[1], BREATH.period)
  assert.match(board, /const S = dir === 'C' \? 150 : 340/)
  assert.equal(HOUSE.size, 340)
  assert.match(board, /viewBox="10 10 530 380"/)
  assert.deepEqual(NAME.viewBox, [10, 10, 530, 380])
  assert.match(board, /\(364 - 10\) \* 1\.5, \(900 - 570\) \/ 2 \+ \(118 - 10\) \* 1\.5/, 'the dot of the i starts where the board puts it')
})

test('the moments come in order', () => {
  assert.ok(TIME.write < TIME.dotted && TIME.dotted < TIME.lit && TIME.lit + 0.8 < TIME.hold)
  assert.ok(TIME.hold < TIME.leave && TIME.leave < TIME.land)
  assert.ok(TIME.readyAfter >= TIME.land, 'the ending may not start before the dot has landed')
  assert.ok(TIME.hold + TIME.nameOut >= 3 && TIME.hold + TIME.nameOut <= 6, 'the name is on screen for a few seconds, as asked')
})

// design/first-start/ (A with B's quieter line, and Ready) is the spec for what a first start says.
const first = (f) => read(new URL(`../design/first-start/${f}`, import.meta.url))
const said = (html, cls) => [...html.matchAll(new RegExp(`class="say ${cls}">(.*?)</div>`, 'g'))].map((m) => m[1])

test('a first start says what the boards say, where they say it', () => {
  assert.deepEqual(said(first('LineA-1.dc.html'), 'line'), [FIRST.moving.line])
  assert.deepEqual(said(first('LineA-1.dc.html'), 'quiet'), [FIRST.moving.quiet])
  assert.deepEqual(said(first('LineA-2.dc.html'), 'line'), [FIRST.downloading.line])
  assert.deepEqual(said(first('Ready-1.dc.html'), 'ready'), [READY.line])
  assert.deepEqual(said(first('Ready-1.dc.html'), 'quiet'), [`${READY.cable}<b>hub.local</b>`])
  assert.deepEqual(said(first('Ready-2.dc.html'), 'quiet'), [`${READY.wifi}<b>Elyir Hub 4F2A</b>${READY.password}<b>kite-maple-41</b>`])
  const css = first('first.css')
  const esc = (x) => x.replace(/[.+]/g, (c) => '\\' + c)
  const px = (sel, prop) => +css.match(new RegExp(`(^|\\n)${esc(sel)} \\{[^}]*?${prop}: (\\d+)px`))[2]
  assert.equal(px('.line', 'top'), WORDS.line.top); assert.equal(px('.line', 'font-size'), WORDS.line.size)
  assert.equal(px('.quiet', 'top'), WORDS.quiet.top); assert.equal(px('.quiet', 'font-size'), WORDS.quiet.size)
  assert.equal(px('.ready', 'top'), WORDS.ready.top); assert.equal(px('.ready', 'font-size'), WORDS.ready.size)
  assert.equal(px('.ready + .quiet', 'top'), WORDS.where.top); assert.equal(px('.ready + .quiet', 'font-size'), WORDS.where.size)
})

test("every letter a hub's own address, Wi-Fi name and password can have is drawn", () => {
  for (const word of 'amber birch cedar cloud coral daisy delta ember fable fern frost glade harbor hazel indigo ivory juniper kite lark linen maple meadow mint moss nectar oak opal orchid pebble pine plum quartz quill rain reed river robin sage shell slate sparrow spruce stone sun tide tulip velvet willow wren'.split(' '))
    for (const c of word) assert.ok(GLYPHS.includes(c), c)
  for (const c of 'Elyir Hub 0123456789ABCDEF hub.local -') assert.ok(GLYPHS.includes(c), c)
  for (const c of GLYPHS) assert.ok(existsSync(theme(`g-${c.charCodeAt(0)}.png`)), `missing the letter ${c}`)
})

test('a first start never shows the slow sentence, and a step is only ever one the sequence knows', () => {
  const sc = script()
  assert.match(sc, /if \(global\.first\) \{ gone = 0; \}/)
  for (const id of Object.keys(FIRST)) assert.match(sc, new RegExp(`"elyir:step:${id}"`))
  const say = read(new URL('say.sh', import.meta.url))
  for (const id of Object.keys(FIRST)) assert.ok(say.includes(id), `say.sh knows ${id}`)
})

test('no function in the splash shares a name with a global, which would overwrite it', () => {
  const sc = script()
  const funs = [...sc.matchAll(/^fun (\w+)\(/gm)].map((m) => m[1])
  const globals = new Set([...sc.matchAll(/global\.(\w+)/g)].map((m) => m[1]))
  for (const f of funs) assert.ok(!globals.has(f), `fun ${f} and global.${f}: Plymouth keeps both in one place, so the second replaces the first`)
})
