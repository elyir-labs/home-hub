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
// Round 2 (design/first-start/, first-2: A with C's pulse, decided 18 November 2026): the long "getting ready" is
// split into the steps it hid, every step without a quiet line of its own says how long a first start takes, and
// the lamp pulses deeper and quicker until Ready.
export const ONCE = 'A first start takes about 10 minutes. It happens only once.'
export const FIRST = {
  preparing: { line: 'Getting the hub ready' },
  moving: { line: 'Moving onto this computer’s drive', quiet: 'Leave it plugged in. It restarts by itself when this is done.' },
  unpacking: { line: 'Unpacking what it came with' },
  setting: { line: 'Setting up the hub' },
  downloading: { line: 'Downloading the rest of the hub' },
  starting: { line: 'Starting the house for the first time' },
  trying: { line: 'Starting a try from the USB stick', quiet: 'The drive stays as it is. It restarts once, then carries on.' },
  unasked: { line: 'Starting a try from the USB stick', quiet: 'No answer, so the drive stays as it is. It restarts once, and your phone asks about the drive.' },
  clearing: { line: 'Starting over', quiet: 'Clearing the try from the USB stick. It restarts once.' },
  todrive: { line: 'Starting the hub on the drive', quiet: 'It restarts into it. The USB stick can stay in.' },
}
export const FIRST_BREATH = { period: 2.4, low: 0.45, blend: 1.5 }

// The end of a first start on a screen that is not a wall: where to go next. The address, the Wi-Fi's name and
// its password are this hub's own, so they are drawn on the unit from the letters in GLYPHS.
export const READY = {
  line: 'Your hub is ready',
  cable: 'On a phone on the same Wi‑Fi, open ',
  wifi: 'On your phone, join the Wi‑Fi ',
  password: ', password ',
}
// Ready with a code to scan (design/first-start/, E): the house rises and gets small, and the code takes the middle,
// made on the unit from this hub's own Wi-Fi or address. Without a code it is the words above, under the house.
export const SCAN = {
  house: { center: [720, 180], size: 130 },
  tile: { left: 580, top: 355, size: 280, pad: 22, radius: 18, color: '#f1eee8' },
  wifi: 'Scan with your phone’s camera to join the hub',
  addr: 'Scan with your phone’s camera to open the hub',
  orWifi: 'Or join the Wi‑Fi ',
  orPassword: ', password ',
  orAddr: 'Or open ',
  orAddrAfter: ' on a phone on the same Wi‑Fi',
}
export const GLYPHS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-. ·,’()/+_:'

// Asked on the screen at the start (design/move-to-drive/: screen-asks, C with BootNext, 18 November 2026; keys-2, A and
// C together, and stick-try, A, 19 November 2026). On a start from the USB stick the splash can ask four questions, each
// with a card and its answers as cards, every answer with its own letter: the arrows, Tab or a mouse wheel move the
// highlight, which starts on the safe answer, and Enter picks it, or the letter picks at once. Putting the hub on a
// drive with anything on it goes to a box where Enter erases only once erase is typed, and Backspace on an empty box
// goes back. Placed in the boards' space, as HybridAC-1, HybridAC-2 and the Ask boards draw it. Esc is Plymouth's own
// (it shows the boot log), so going back is Backspace.
export const ASK = {
  hint: '↑ ↓ or Tab to choose · Enter to pick · or press the letter',
  kinds: {
    drive: {
      title: 'This computer’s drive isn’t empty', card: 'drive', safe: 'T', wait: 120,
      foot: 'Nothing has been written to the drive. With no answer in 2 minutes, it starts as a try and your phone asks.',
      options: [
        { key: 'T', text: 'Try the hub from the USB stick', small: 'The drive stays as it is. Decide later, or start over.' },
        { key: 'E', text: 'Put the hub on this drive', small: 'Everything on the drive goes. You’ll type erase next.' },
      ],
    },
    here: {
      title: 'You were trying the hub on this computer', card: 'try', safe: 'C', wait: 30,
      foot: 'With no answer in 30 seconds, it carries on trying.',
      options: [
        { key: 'C', text: 'Carry on trying', small: 'Everything as you left it, still on the USB stick.' },
        { key: 'D', text: 'Put it on this computer’s drive', small: 'Your house comes too. Anything on the drive is erased.' },
        { key: 'S', text: 'Start over', small: 'Clears the try from the stick. The drive isn’t touched.' },
      ],
    },
    away: {
      title: 'This USB stick has a try from another computer', card: 'try', safe: 'B', wait: 120,
      foot: 'With no answer in 2 minutes, nothing is cleared: the try carries on here.',
      options: [
        { key: 'N', text: 'Start a new hub on this computer', small: 'Clears the try from the stick first.' },
        { key: 'B', text: 'Bring the try to this computer', small: 'The same house and devices, carrying on here.' },
      ],
    },
    hub: {
      title: 'This computer already has a hub on its drive', card: 'try', safe: 'H', wait: 120,
      foot: 'With no answer in 2 minutes, it starts the hub on the drive.',
      options: [
        { key: 'H', text: 'Start the hub on the drive', small: 'Restarts into it. The stick can stay in.' },
        { key: 'T', text: 'Try a new one from the USB stick', small: 'The drive and its hub stay as they are.' },
        { key: 'R', text: 'Replace it with a new hub', small: 'Erases the drive and its house. You’ll type erase next.' },
      ],
    },
  },
  sure: 'Erase this drive?',
  type: 'Type <b>erase</b> here, then press Enter',
  placeholder: 'erase',
  undone: 'It can’t be undone.',
  sureKeys: [
    { cap: 'Enter', text: 'Erase it and move the hub there, about 4 minutes' },
    { cap: 'Backspace', text: 'Go back' },
  ],
  backKey: [{ cap: 'Backspace', text: 'Go back' }],
  over: {
    title: 'Start over?',
    warn: 'The house you set up in the try is cleared from the stick.<br>The devices themselves keep working; you add them again to the new hub.',
    keys: [
      { cap: 'Enter', text: 'Clear the try and start a new hub' },
      { cap: 'Backspace', text: 'Go back' },
    ],
  },
  // Ready while the phone still has the question (B1).
  ready: 'One question before your hub is ready',
  scan: 'This computer’s drive isn’t empty. Scan, and your phone asks what to do with it.',
}
export const ASK_AT = {
  title: { top: 268, size: 34, color: '#f1eee8' },
  card: { left: 400, top: 336, width: 640, height: 101 },
  model: { left: 499, top: 359, size: 22, weight: 500, color: '#f1eee8' },
  system: { left: 499, top: 392, size: 18, color: '#d9d5cd' },
  rest: { size: 18, color: '#8f8b84' },
  choices: { left: 400, top: 476, width: 640, height: 82, gap: 10 },
  hint: { below: 14, size: 19, color: '#8f8b84' },
  foot: { top: 836, size: 18, color: '#6f6b65' },
  type: { top: 462, size: 22, color: '#d9d5cd' },
  entry: { left: 560, top: 504, width: 320, height: 64, text: 517, size: 30, color: '#f1eee8', hold: '#4a4b52', spacing: 0.06 },
  caret: { width: 2, height: 30, top: 521, gap: 3, color: '#e9b872' },
  warn: { top: 600, size: 21, color: '#d9d5cd', step: 30.45 },
  keys: { left: 400, top: 700, width: 640 },
  overWarn: { top: 492 },
  overKeys: { left: 400, top: 620, width: 640 },
}

// Where and how big, in the boards' space, as design/first-start/first.css draws them.
export const WORDS = {
  line: { top: 628, size: 30, color: '#e6e2da' },
  quiet: { top: 676, size: 20, color: '#8f8b84' },
  ready: { top: 620, size: 34, color: '#f1eee8' },
  where: { top: 678, size: 24, color: '#b9b5ad', value: '#f1eee8', weight: 500 },
  scanReady: { top: 275, size: 34, color: '#f1eee8' },
  scan: { top: 673, size: 30, color: '#e6e2da' },
  or: { top: 721, size: 20, color: '#8f8b84', value: '#d9d5cd', weight: 500 },
}
