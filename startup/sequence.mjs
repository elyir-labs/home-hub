// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// How an Elyir product with a screen starts: the name written by hand, the dot of the i lighting
// like a lamp and breathing, then gliding into the product's mark and breathing there until the
// product is ready. Chosen 7 October 2026 as J in design/boot/; this file is the one source the
// boot splash is rendered from, and startup.test.mjs holds the board to it.
//
// Everything is in the boards' space, 1440x900; a renderer scales it to the screen it is for.

export const SPACE = { width: 1440, height: 900 }

export const COLOR = {
  ink: '#f1eee8',
  lamp: [233, 184, 114],
  unlit: [74, 64, 52],
  // What the panel paints first, so the splash ends on the color the panel begins on.
  panel: [12, 13, 16],
}

// The name, as a path in its own units, placed centered at 1.5x.
const ELYIR =
  'M68 222C80 216 90 211 100 205C120 195 145 180 145 165C145 150 118 152 110 175C102 200 110 240 140 240' +
  'C160 240 175 225 185 205C200 170 225 90 225 55C225 25 200 25 195 60C190 100 190 200 200 230C207 245 225 245 240 225' +
  'C248 210 252 185 255 160C252 195 255 240 280 240C300 240 310 205 312 160C312 230 310 300 295 330C285 350 260 345 268 320' +
  'C278 290 320 265 345 235C352 215 358 185 362 160C358 195 356 225 368 240C378 250 395 235 405 215C410 195 415 175 420 160' +
  'C428 168 440 170 448 162C450 190 452 220 458 240C463 228 476 214 494 208'

export const NAME = (() => {
  const viewBox = [10, 10, 530, 380], scale = 1.5
  const width = viewBox[2] * scale, height = viewBox[3] * scale
  const left = (SPACE.width - width) / 2, top = (SPACE.height - height) / 2
  const at = (x, y) => [left + (x - viewBox[0]) * scale, top + (y - viewBox[1]) * scale]
  return { d: ELYIR, viewBox, scale, stroke: 10, left, top, width, height, tittle: at(364, 118), tittleSize: 24 }
})()

// The hub's mark: the house from the app's icon, whose lamp the dot becomes.
export const HOUSE = (() => {
  const size = 340, center = [720, 430], k = size / 512
  const left = center[0] - size / 2, top = center[1] - size / 2
  return {
    roof: 'M112 248 256 120l144 128', walls: 'M148 226v170h216V226', stroke: 26,
    size, left, top, lamp: [left + 256 * k, top + 306 * k], lampSize: 60 * k,
  }
})()

// Seconds from the first frame the splash draws.
export const TIME = {
  fps: 25,
  write: 2.6,       // the name, written
  dotted: 2.7,      // the dot appears, unlit
  lit: 3.1,         // and lights, over 0.8 s
  hold: 4.5,        // the name begins to go
  nameOut: 0.9,
  leave: 4.6,       // the dot sets off for the house
  houseIn: 5.2,     // the house fades in around where it lands
  land: 5.8,
  ending: 0.9,      // the house opens into the panel
  readyAfter: 6.2,  // the earliest the ending may start, however soon the product is ready
  slowAfter: 180,   // when one sentence comes up under the house
}

// One slow breath, shared by the dot and the house's lamp.
export const BREATH = { period: 6.4, low: 0.72 }

export const SLOW = 'This is taking longer than usual. If it stays like this, unplug it for ten seconds and plug it back in.'

// What a first start says while it installs (design/first-start/, A with B's quieter line, and Ready, decided
// 20 October 2026). Each step is sent by the step itself as it starts (startup/say.sh); every other start says
// nothing but the name. The quiet line is only where there is something to know.
export const FIRST = {
  preparing: { line: 'Getting the hub ready' },
  moving: { line: 'Moving onto this computer’s drive', quiet: 'Leave it plugged in. It restarts by itself when this is done.' },
  downloading: { line: 'Downloading the rest of the hub' },
  starting: { line: 'Starting the house for the first time' },
}

// The end of a first start on a screen that is not a wall: where to go next. The address, the Wi-Fi's name and
// its password are this hub's own, so they are drawn on the unit from the letters in GLYPHS.
export const READY = {
  line: 'Your hub is ready',
  cable: 'On a phone on the same Wi‑Fi, open ',
  wifi: 'On your phone, join the Wi‑Fi ',
  password: ', password ',
}
export const GLYPHS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-. '

// Where and how big, in the boards' space, as design/first-start/first.css draws them.
export const WORDS = {
  line: { top: 628, size: 30, color: '#e6e2da' },
  quiet: { top: 676, size: 20, color: '#8f8b84' },
  ready: { top: 620, size: 34, color: '#f1eee8' },
  where: { top: 678, size: 24, color: '#b9b5ad', value: '#f1eee8', weight: 500 },
}
