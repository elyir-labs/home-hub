// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The picture chosen in design/boot/ (J) is the spec. These fail on purpose when the board, the
// sequence and the splash that ships stop agreeing: change the board first, then sequence.mjs,
// then `node startup/render.mjs`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { NAME, HOUSE, TIME, BREATH, FIRST_BREATH, ONCE, FIRST, READY, GLYPHS, WORDS, SCAN, ASK, ASK_AT } from './sequence.mjs'
import { json } from './json.mjs'
import { THEME, NAME_FRAMES, CODE, fingerprint, themeFile, timingSh, script } from './plymouth.mjs'

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
  const names = [...script().matchAll(/Image\("([^"]+)"\)/g)].map((m) => m[1]).filter((f) => !f.startsWith('name-') && f !== CODE)  // CODE is made on the unit
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
const said = (html, cls) => [...html.matchAll(new RegExp(`class="say ${cls}"[^>]*>(.*?)</div>`, 'g'))].map((m) => m[1])

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

// Round 2 (first-2: A with C's pulse): the steps "getting ready" hid, how long a first start takes, and a deeper,
// quicker lamp than an ordinary start's.
test('a first start names the steps it used to hide, and pulses where it can be seen', () => {
  assert.deepEqual(said(first('NamedA-1.dc.html'), 'line'), [FIRST.unpacking.line])
  assert.deepEqual(said(first('NamedA-2.dc.html'), 'line'), [FIRST.setting.line])
  for (const f of ['NamedA-1.dc.html', 'NamedA-2.dc.html']) assert.deepEqual(said(first(f), 'quiet'), [ONCE])
  const note = JSON.parse(first('canvas.json')).annotations.find((a) => a.id === 'c-2').text
  assert.match(note, new RegExp(`${Math.round(FIRST_BREATH.low * 100)}% to full every ${FIRST_BREATH.period} s`))
  assert.ok(FIRST_BREATH.period < BREATH.period && FIRST_BREATH.low < BREATH.low)
  const sc = script()
  assert.match(sc, /global\.step_quiet\["unpacking"\] = once_image;/)
  assert.match(sc, /global\.step_quiet\["moving"\] = fit\(Image\("quiet-moving\.png"\)\);/)
  assert.ok(existsSync(theme('quiet-once.png')))
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

// design/move-to-drive/ is the spec for the questions on a start from the stick (keys-2: A and C together; stick-try: A),
// as its Built and Step boards draw them, and for Ready while the phone still has the drive's question (screen-asks, B1).
const move = (f) => read(new URL(`../design/move-to-drive/${f}`, import.meta.url))
const text = (html, cls) => [...html.matchAll(new RegExp(`class="${cls}"[^>]*>(.*?)</div>`, 'g'))].map((m) => m[1])
const css = (html, cls, prop) => +html.match(new RegExp(`class="${cls}" style="[^"]*${prop}: (\\d+)px`))[1]
const boards = { drive: 'BuiltDrive-1', here: 'BuiltHere-1', away: 'BuiltAway-1', hub: 'BuiltHub-1' }

test('each question says what its board says, with the safe answer lit, where the board puts it', () => {
  const sheet = move('screen.css') + move('try.css')
  const rule = (sel, prop) => +sheet.match(new RegExp(`(^|\\n)\\${sel} \\{[^}]*?${prop}: (\\d+)px`))[2]
  assert.deepEqual(Object.keys(boards), Object.keys(ASK.kinds))
  for (const [kind, q] of Object.entries(ASK.kinds)) {
    const b = move(`${boards[kind]}.dc.html`)
    assert.deepEqual(text(b, 'title'), [q.title], kind)
    assert.deepEqual(text(b, 'foot'), [q.foot], kind)
    const choices = [...b.matchAll(/<div class="choice k( on)?"><span class="cap">(.*?)<\/span><span>(.*?)<small>(.*?)<\/small><\/span><\/div>/g)]
    assert.deepEqual(choices.map((m) => [m[2], m[3], m[4]]), q.options.map((o) => [o.key, o.text, o.small]), kind)
    assert.deepEqual(choices.filter((m) => m[1]).map((m) => m[2]), [q.safe], `${kind} starts on its safe answer`)
    assert.equal(css(b, 'choices built', 'top'), ASK_AT.choices.top)
    assert.equal(css(b, 'ask', 'top'), ASK_AT.choices.top + ASK_AT.hint.below + q.options.length * (ASK_AT.choices.height + ASK_AT.choices.gap))
    assert.deepEqual(text(b, 'ask'), [ASK.hint])
    assert.equal(css(b, 'foot', 'top'), ASK_AT.foot.top)
    assert.ok(q.foot.includes(q.wait >= 60 ? `${q.wait / 60} minutes` : `${q.wait} seconds`), `${kind}'s foot says how long it waits`)
    assert.match(read(new URL('say.sh', import.meta.url)), new RegExp(`${kind}\\) safe=${q.safe}; wait=${q.wait} ;;`))
  }
  assert.equal(rule('.choices.built .choice', 'height'), ASK_AT.choices.height)
  assert.equal(rule('.choices.built .choice', 'margin-bottom'), ASK_AT.choices.gap)
  assert.equal(rule('.title', 'top'), ASK_AT.title.top); assert.equal(rule('.card', 'top'), ASK_AT.card.top)
  assert.equal(rule('.card', 'left'), ASK_AT.card.left); assert.equal(rule('.card', 'width'), ASK_AT.card.width)
  assert.equal(rule('.choices', 'left'), ASK_AT.choices.left); assert.equal(rule('.choices', 'width'), ASK_AT.choices.width)
})

test('erase is typed into a box that is there, and starting over is said plainly', () => {
  const e1 = move('BuiltErase-1.dc.html'), e2 = move('BuiltErase-2.dc.html'), over = move('BuiltOver-1.dc.html')
  const keys = (html) => [...html.matchAll(/<span class="cap">(.*?)<\/span><span>(.*?)<\/span>/g)].map((m) => [m[1], m[2]])
  for (const e of [e1, e2]) {
    assert.deepEqual(text(e, 'title'), [ASK.sure])
    assert.deepEqual(text(e, 'ask'), [ASK.type])
    assert.equal(css(e, 'ask', 'top'), ASK_AT.type.top); assert.equal(css(e, 'entry', 'top'), ASK_AT.entry.top)
    assert.equal(css(e, 'warn', 'top'), ASK_AT.warn.top); assert.equal(css(e, 'keys', 'top'), ASK_AT.keys.top)
    assert.match(text(e, 'warn')[0], new RegExp(`<br>${ASK.undone}$`))
  }
  assert.match(e1, new RegExp(`<span class="hold">${ASK.placeholder}</span>`))
  assert.deepEqual(keys(e1), ASK.backKey.map((k) => [k.cap, k.text]), 'only going back until erase is typed')
  assert.deepEqual(keys(e2), ASK.sureKeys.map((k) => [k.cap, k.text]))
  assert.deepEqual(text(over, 'title'), [ASK.over.title])
  assert.deepEqual(text(over, 'warn'), [ASK.over.warn])
  assert.deepEqual(keys(over), ASK.over.keys.map((k) => [k.cap, k.text]))
  assert.equal(css(over, 'warn', 'top'), ASK_AT.overWarn.top); assert.equal(css(over, 'keys', 'top'), ASK_AT.overKeys.top)
})

test('a try, starting over, and the hub on the drive say what the boards say; Ready while the phone has the question too', () => {
  for (const [id, f] of [['trying', 'StepTrying-1'], ['unasked', 'StepUnasked-1'], ['clearing', 'StepClearing-1'], ['todrive', 'StepToDrive-1']]) {
    assert.deepEqual(said(move(`${f}.dc.html`), 'line'), [FIRST[id].line])
    assert.deepEqual(said(move(`${f}.dc.html`), 'quiet'), [FIRST[id].quiet])
  }
  const b1 = move('PhoneB-1.dc.html')
  assert.deepEqual(said(b1, 'ready'), [ASK.ready])
  assert.deepEqual(said(b1, 'line'), [ASK.scan])
  assert.equal(css(b1, 'say ready', 'top'), WORDS.scanReady.top)
  assert.equal(css(b1, 'say line', 'top'), WORDS.scan.top)
  const sc = script()
  assert.doesNotMatch(sc, /SetDisplayQuestionFunction/, 'the keys are read by say.sh, never through Plymouth\'s own question')
  for (const [kind, q] of Object.entries(ASK.kinds)) {
    assert.match(sc, new RegExp(`"elyir:ask:${kind}"`))
    for (const o of q.options) assert.match(sc, new RegExp(`"elyir:opt:${kind}:${o.key}"`))
  }
  for (const s of ['pick:0', 'pick:3', 'page:choose', 'page:erase', 'page:over', 'ask:done', 'dtyped', 'emodel', 'drive:phone', 'drive:none']) assert.match(sc, new RegExp(`"elyir:${s}"`))
  for (const c of '·,’') assert.ok(GLYPHS.includes(c), `the cards' words need ${c}`)
})

test('no function in the splash shares a name with a global, which would overwrite it', () => {
  const sc = script()
  const funs = [...sc.matchAll(/^fun (\w+)\(/gm)].map((m) => m[1])
  const globals = new Set([...sc.matchAll(/global\.(\w+)/g)].map((m) => m[1]))
  for (const f of funs) assert.ok(!globals.has(f), `fun ${f} and global.${f}: Plymouth keeps both in one place, so the second replaces the first`)
})

test('Ready with a code is where E puts it, and says what E says', () => {
  const e1 = first('ScanCenterE-1.dc.html'), e2 = first('ScanCenterE-2.dc.html'), css = first('first.css')
  const top = (html, cls) => +html.match(new RegExp(`class="say ${cls}" style="top: (\\d+)px"`))[1]
  assert.equal(top(e1, 'ready'), WORDS.scanReady.top)
  assert.equal(top(e1, 'line'), WORDS.scan.top)
  assert.equal(top(e1, 'quiet'), WORDS.or.top)
  assert.deepEqual(said(e1, 'line'), [SCAN.wifi])
  assert.deepEqual(said(e2, 'line'), [SCAN.addr])
  assert.deepEqual(said(e1, 'quiet'), [`${SCAN.orWifi}<b>Elyir Hub 4F2A</b>${SCAN.orPassword}<b>kite-maple-41</b>`])
  assert.deepEqual(said(e2, 'quiet'), [`${SCAN.orAddr}<b>hub.local</b>${SCAN.orAddrAfter}`])
  const [, l, t, w, h, pad] = e1.match(/class="tile" style="left: (\d+)px; top: (\d+)px; width: (\d+)px; height: (\d+)px; padding: (\d+)px"/).map(Number)
  assert.deepEqual([l, t, w, h, pad], [SCAN.tile.left, SCAN.tile.top, SCAN.tile.size, SCAN.tile.size, SCAN.tile.pad])
  assert.equal(+css.match(/\.tile \{[^}]*border-radius: (\d+)px/)[1], SCAN.tile.radius)
  const [, hl, ht, hw] = css.match(/\.house\.small \{ left: (\d+)px; top: (\d+)px; width: (\d+)px/).map(Number)
  assert.deepEqual([hl + hw / 2, ht + hw / 2, hw], [...SCAN.house.center, SCAN.house.size])
  assert.equal(+css.match(/\.quiet \{[^}]*font-size: (\d+)px/)[1], WORDS.or.size)
})
