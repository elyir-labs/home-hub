// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The TV's rules (design/living-room/): which screens are TVs, what each remote's keys mean, where an arrow
   goes, what is in a room's row and in what order, and what OK and Up/Down ask of a thing. */
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { Device, Room } from '../src/api'
import { activity } from '../src/store'
import { appsOf, appTint, boxAsleep, boxIn, boxKeyOf, digitOf, hintFor, installRemote, keyName, keySender, lastOn, leadsOf, musicIn, nearest, okOf, onTV, passTo, pressOf, RECORD_AFTER, restAfter, sceneFor, speakersOf, stateOf, thingsIn, wayBack } from '../src/tv'
import { stepOf } from '../src/levels'
import { SCENES, store } from '../src/store'

const dev = (id: string, name: string, capability: string, state: string, attrs: Record<string, any> = {}): Device =>
  ({ id, name, room_id: 'living', capability, state, attrs })
const room = (devices: Device[]): Room => ({ id: 'living', name: 'Living room', devices, intent: 'unknown', set_by: null, hold_until: null })
const DIM = { supported_color_modes: ['brightness'] }

describe('which screen is a TV', () => {
  const linux = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130'
  it('is a screen for the hub on Linux that nobody can touch', () => {
    expect(onTV('', linux, true, 0)).toBe(true)
    expect(onTV('', linux, true, 10)).toBe(false)          // the wall: a touchscreen
    expect(onTV('', linux, false, 0)).toBe(false)          // a laptop
    expect(onTV('', 'Mozilla/5.0 (Linux; Android 14)', true, 0)).toBe(false)
  })
  it('can be forced either way for a preview', () => {
    expect(onTV('?tv=1', 'Mac', false, 5)).toBe(true)
    expect(onTV('?tv=0', linux, true, 0)).toBe(false)
  })
  it('is what somebody answered on This screen, over the guess, and only on a screen (design/which-tv/, B\'s row)', () => {
    expect(onTV('', linux, true, 10, 'tv')).toBe(true)      // a touchscreen somebody says is a TV
    expect(onTV('', linux, true, 0, 'wall')).toBe(false)    // a TV-looking box somebody says is on the wall
    expect(onTV('', linux, false, 0, 'tv')).toBe(false)     // a laptop keeps no such answer
    expect(onTV('?tv=0', linux, true, 0, 'tv')).toBe(false) // a preview still wins
  })
})

describe('the keys every remote sends', () => {
  it('reads the TV remote over HDMI, a USB remote and a keyboard alike', () => {
    expect(['Enter', 'Select'].map(pressOf)).toEqual(['ok', 'ok'])
    expect(['Escape', 'Backspace', 'BrowserBack', 'GoBack'].map(pressOf)).toEqual(['back', 'back', 'back', 'back'])
    expect(['ColorF0Red', 'F1', 'ColorF3Blue', 'F4'].map(pressOf)).toEqual(['red', 'red', 'blue', 'blue'])
    // the digits only type, where a screen asks for a number, so 1 never starts a scene
    expect(['1', '4', '0'].map(pressOf)).toEqual([null, null, null])
    expect(['1', '0', 'F1', 'a'].map(digitOf)).toEqual(['1', '0', null, null])
    expect(pressOf('a')).toBeNull()
  })
  it('gives each color the same scene in every room', () => {
    expect(sceneFor('red', SCENES)?.id).toBe('movie')
    expect(sceneFor('yellow', SCENES)?.id).toBe('asleep')
    expect(sceneFor('red', SCENES.filter(s => s.id !== 'movie'))).toBeNull()
  })
})

describe("the TV's own remote, over HDMI-CEC", () => {
  // startup/cec-keys.toml turns each CEC code into a Linux key; Chromium hands the panel these names for them.
  const DOM: Record<string, string> = { KEY_ENTER: 'Enter', KEY_ESC: 'Escape', KEY_HOME: 'Home', KEY_UP: 'ArrowUp',
    KEY_DOWN: 'ArrowDown', KEY_LEFT: 'ArrowLeft', KEY_RIGHT: 'ArrowRight', KEY_F1: 'F1', KEY_F2: 'F2', KEY_F3: 'F3', KEY_F4: 'F4',
    ...Object.fromEntries([...'0123456789'].map(d => [`KEY_${d}`, d])) }
  const keys = Object.fromEntries([...readFileSync('../startup/cec-keys.toml', 'utf8')
    .matchAll(/^(0x[0-9a-f]{2}) = "(\w+)"/gm)].map(([, code, key]) => [code, pressOf(DOM[key] ?? '') ?? digitOf(DOM[key] ?? '')]))
  it('moves, chooses, goes back and goes home', () => {
    expect([keys['0x01'], keys['0x02'], keys['0x03'], keys['0x04']]).toEqual(['up', 'down', 'left', 'right'])
    expect([keys['0x00'], keys['0x0d'], keys['0x09']]).toEqual(['ok', 'back', 'home'])
  })
  it("gives each colored button its own color's scene: CEC numbers them blue, red, green, yellow", () => {
    expect([keys['0x71'], keys['0x72'], keys['0x73'], keys['0x74']]).toEqual(['blue', 'red', 'green', 'yellow'])
  })
  it('keeps the number buttons as digits, which type the passcode and never start a scene', () => {
    expect([...Array(10)].map((_, i) => keys[`0x${(0x20 + i).toString(16)}`])).toEqual([...'0123456789'])
    expect(Object.values(keys)).not.toContain(null)
  })
})

describe('where an arrow goes', () => {
  const box = (left: number, top: number, w = 100, h = 100) => ({ left, top, right: left + w, bottom: top + h })
  const row = [box(0, 0), box(130, 0), box(260, 0, 100, 60), box(0, 200, 300, 80), box(330, 200)]
  it('goes straight along a row, even past a shorter card', () => {
    expect(nearest(row[0], row, 'right')).toBe(1)
    expect(nearest(row[1], row, 'right')).toBe(2)
    expect(nearest(row[2], row, 'left')).toBe(1)
  })
  it('goes to the row below beneath it, not the nearest corner', () => {
    expect(nearest(row[1], row, 'down')).toBe(3)
    expect(nearest(row[2], row, 'down')).toBe(4)
  })
  it('stays put at an edge', () => {
    expect(nearest(row[0], row, 'up')).toBe(-1)
    expect(nearest(row[0], row, 'left')).toBe(-1)
  })
})

describe("a room's row", () => {
  const things = [
    dev('s', 'Speaker', 'media', 'paused', { volume_level: 0.3 }), dev('b', 'Blinds', 'cover', 'open', { current_position: 70 }),
    dev('m', 'Motion', 'motion', 'on'), dev('c', 'Door camera', 'camera', 'idle'), dev('l2', 'Reading lamp', 'light', 'off', DIM),
    dev('l1', 'Ceiling light', 'light', 'on', { ...DIM, brightness: 89 }), dev('k', 'Front door', 'lock', 'locked'),
  ]
  it('holds what can be done, lights first, and never reorders on a change', () => {
    const order = thingsIn(room(things)).map(d => d.name)
    expect(order).toEqual(['Ceiling light', 'Reading lamp', 'Blinds', 'Speaker', 'Front door'])
    const flipped = things.map(d => d.id === 'l1' ? { ...d, state: 'off' } : d.id === 'l2' ? { ...d, state: 'on' } : d)
    expect(thingsIn(room(flipped)).map(d => d.name)).toEqual(order)
  })
  it('says each state in a few words', () => {
    expect(stateOf(things[5])).toBe('On, 35%')
    expect(stateOf(things[4])).toBe('Off')
    expect(stateOf(things[1])).toBe('70% open')
  })
  it('never unlocks a door from across the room: OK on a lock opens it', () => {
    expect(okOf(things[6])).toEqual({ label: 'Open', open: true })
    expect(okOf(things[5])).toMatchObject({ label: 'Turn off', action: 'off' })
  })
  it('says Up and Down only on the band, and Hold only in the rows', () => {
    expect(hintFor(things[5], true)).toBe('▲ ▼|Brighter or dimmer;OK|Turn off')
    expect(hintFor(things[5], false)).toBe('OK|Turn off;~Hold OK|More')
  })
})

describe('Up and Down as the level', () => {
  it('brightens and dims a lamp a tenth at a time, and off at the bottom', () => {
    expect(stepOf(dev('l', 'Lamp', 'light', 'on', { ...DIM, brightness: 89 }), 1)?.data).toEqual({ brightness_pct: 45 })
    expect(stepOf(dev('l', 'Lamp', 'light', 'on', { ...DIM, brightness: 26 }), -1)?.action).toBe('off')
    expect(stepOf(dev('l', 'Lamp', 'light', 'off', DIM), 1)?.data).toEqual({ brightness_pct: 10 })
    expect(stepOf(dev('l', 'Lamp', 'light', 'off', DIM), -1)).toBeNull()
  })
  it('moves a thermostat one degree in a house that reads Fahrenheit', () => {
    store.tempUnit = '°F'
    expect(stepOf(dev('t', 'Thermostat', 'climate', 'cool', { temperature: 71 }), 1)?.data).toEqual({ temperature: 72 })
    expect(stepOf(dev('t', 'Thermostat', 'climate', 'off', { temperature: 71 }), 1)).toBeNull()
  })
})

describe('music in the TV\'s room (design/tv-music/, A and B)', () => {
  const sp = (id: string, state: string, attrs: Record<string, unknown> = {}) => ({ id, name: id, state, capability: 'media', room_id: 'living', attrs: { music: true, ...attrs } }) as any
  const room = (...devices: any[]) => ({ id: 'living', name: 'Living room', devices }) as any
  it('leads with what plays, and a paused record only while the TV is awake', () => {
    const tvSet = { id: 'tv', name: 'TV', state: 'playing', capability: 'media', room_id: 'living', attrs: {} } as any
    expect(musicIn(room(tvSet, sp('a', 'paused')))?.id).toBe('a')            // a TV playing a show is not the room's music
    expect(musicIn(room(sp('a', 'paused')), true)).toBeNull()                 // at rest only music that plays takes the screen
    expect(musicIn(room(sp('a', 'paused'), sp('b', 'playing')))?.id).toBe('b')
    expect(musicIn(room(sp('a', 'idle')))).toBeNull()
  })
  it('names the speakers in this room that play in step with it', () => {
    const left = sp('left', 'playing', { together: ['right', 'kitchen1'] }), right = sp('right', 'playing')
    expect(speakersOf(left, room(left, right, sp('other', 'idle'))).map(d => d.id)).toEqual(['left', 'right'])
  })
  it("says a song on both of a room's speakers once", () => {
    const pods = room(sp('left', 'playing', { media_title: 'Drowning' }), sp('right', 'playing', { media_title: 'Drowning' }))
    expect(activity(pods)).toBe('Drowning')
  })
  it('counts a speaker playing the same song in the room as in step, though nothing grouped them', () => {
    const left = sp('left', 'playing', { media_title: 'Drowning' }), right = sp('right', 'playing', { media_title: 'Drowning' })
    expect(speakersOf(left, room(left, right, sp('pod', 'playing', { media_title: 'Rock' }))).map(d => d.id)).toEqual(['left', 'right'])
  })
})

/* design/tv-box/, A: a streaming box beside the TV puts a Watch row above the room; a TV with none opens on its room. */
describe('a streaming box beside the TV', () => {
  const apps = ['Netflix', 'YouTube', 'Disney+', 'Max', 'Hulu', 'Peacock', 'Plex', 'Twitch', 'Prime Video']
  const box = (state = 'standby', attrs: Record<string, any> = {}) => dev('b', 'Apple TV', 'media', state, { box: true, apps, ...attrs })
  const lamp = dev('l', 'Floor lamp', 'light', 'on')
  const music = dev('s', 'Sonos', 'media', 'playing', { music: true, media_title: 'Dinner' })

  it('leads the room with Watch, after whatever is playing here, and is not there without a box', () => {
    expect(leadsOf(room([lamp]))).toEqual([])
    expect(leadsOf(room([lamp, box()]))).toEqual(['watch'])
    expect(leadsOf(room([lamp, box(), music]))).toEqual(['music', 'watch'])
    expect(boxIn(room([dev('tv', 'TV', 'media', 'on', { source_list: ['HDMI 1'] })]))).toBeNull()   // a TV's inputs are not apps
    expect(boxIn(room([box('on', { apps: [] })]))).toBeNull()
  })
  it('shows the apps the house has seen used first, then the rest as the box lists them, seven at a time', () => {
    const { shown, more } = appsOf(box('on', { used_apps: ['Max', 'Gone', 'YouTube'] }))
    expect(shown).toEqual(['Max', 'YouTube', 'Netflix', 'Disney+', 'Hulu', 'Peacock', 'Plex'])
    expect(more).toEqual(['Twitch', 'Prime Video'])
  })
  it('says what was last on, or what is on now', () => {
    expect(lastOn(box())).toBeNull()
    expect(lastOn(box('standby', { last_on: { title: 'Harbor Lights', app: 'Max' } }))).toMatchObject({ label: 'Last on', title: 'Harbor Lights', where: 'In Max', app: 'Max' })
    expect(lastOn(box('playing', { last_on: { title: null, app: 'YouTube' } }))).toMatchObject({ label: 'On now', title: 'YouTube', where: '' })
  })
  it('brings the house back only when the box goes to sleep, since a box does not say when Home is pressed', () => {
    expect(boxAsleep(box('standby'))).toBe(true)
    expect(boxAsleep(box('off'))).toBe(true)
    expect(boxAsleep(box('idle', { app_name: null }))).toBe(false)
    expect(boxAsleep(box('playing', { app_name: 'Netflix' }))).toBe(false)
  })
  it('says the way back before the TV switches: a colored button where one is heard, Input and sleep where not', () => {
    expect(wayBack(true, 'Apple TV')).toBe('To come back to the house, press any colored button on the TV’s remote:')
    expect(wayBack(false, 'Apple TV')).toBe('To come back to the house, press Input on the TV’s remote. When the Apple TV goes to sleep, the house comes back by itself.')
  })
  it('gives an app the same tint every time, from a quiet set, never a logo', () => {
    expect(appTint('Netflix')).toBe(appTint('Netflix'))
    expect(appTint('Netflix')).toMatch(/^\d+, \d+, \d+$/)
  })
})

describe('a remote plugged into the hub while the box has the TV', () => {
  it('passes the box the keys it has a word for, and media and volume keys too', () => {
    expect(['ArrowUp', 'Enter', 'Escape', 'BrowserBack'].map(boxKeyOf)).toEqual(['up', 'ok', 'back', 'back'])
    expect(['MediaPlayPause', 'MediaFastForward', 'AudioVolumeUp'].map(boxKeyOf)).toEqual(['play_pause', 'forward', 'louder'])
    expect(['F1', 'Home', '5'].map(boxKeyOf)).toEqual([null, null, null])
  })

  function pressing(keys: { key: string; repeat?: boolean }[], pressed = vi.fn()) {
    const sent: string[] = [], back = vi.fn(), home = vi.fn(), color = vi.fn(), first = vi.fn(() => false)
    const off = installRemote({ first, back: () => false, home, color, pressed })
    passTo.value = { key: (k) => sent.push(k), back }
    for (const k of keys) window.dispatchEvent(new KeyboardEvent('keydown', { key: k.key, repeat: !!k.repeat }))
    passTo.value = null
    off()
    return { sent, back, home, color, first }
  }
  it('sends arrows, OK and Back to the box and never to the screen out of sight', () => {
    const r = pressing([{ key: 'ArrowDown' }, { key: 'Enter' }, { key: 'Escape' }, { key: '7' }])
    expect(r.sent).toEqual(['down', 'ok', 'back'])
    expect(r.first).not.toHaveBeenCalled()      // a resting TV's band does not rise under the box
  })
  it('brings the house back on Home or any colored button, and starts no scene', () => {
    for (const key of ['Home', 'F2', 'ColorF3Blue']) {
      const r = pressing([{ key }])
      expect(r.back).toHaveBeenCalledOnce()
      expect(r.color).not.toHaveBeenCalled()
      expect(r.home).not.toHaveBeenCalled()
      expect(r.sent).toEqual([])
    }
  })
  it('counts every press once, keys the box has no word for too, as pressed while the box had the TV', () => {
    const pressed = vi.fn()
    pressing([{ key: 'ArrowDown' }, { key: 'ArrowDown', repeat: true }, { key: '7' }, { key: 'Home' }], pressed)
    expect(pressed.mock.calls).toEqual([['ArrowDown', 'box'], ['7', 'box'], ['Home', 'box']])
  })
  it('sends a held arrow only as fast as the box answers, in the order pressed', async () => {
    const answered: string[] = []
    let open!: () => void
    const send = keySender(k => { answered.push(k); return answered.length === 1 ? new Promise<void>(r => { open = r }) : Promise.resolve() })
    send('right', false)
    send('right', true); send('right', true)   // repeats while the first is still on its way
    send('ok', false)
    await Promise.resolve()
    open()
    await new Promise(r => setTimeout(r, 0))
    expect(answered).toEqual(['right', 'ok'])
  })
})

describe('counting which keys of a remote get pressed', () => {
  const k = (key: string, more: Partial<KeyboardEvent> = {}) => ({ key, code: '', ctrlKey: false, altKey: false, metaKey: false, ...more })
  it('names a key as the browser does, with Control, Alt or Meta held, and keeps the code of one it cannot name', () => {
    expect(keyName(k('ArrowUp'))).toBe('ArrowUp')
    expect(keyName(k('F4', { altKey: true }))).toBe('Alt+F4')
    expect(keyName(k('Control', { ctrlKey: true }))).toBe('Control')
    expect(keyName(k('Unidentified', { code: 'Lang3' }))).toBe('Unidentified:Lang3')
  })
  it('counts presses on the house too, and never what is typed into a field', () => {
    const pressed = vi.fn()
    const off = installRemote({ back: () => false, home: vi.fn(), color: vi.fn(), pressed })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    const field = document.body.appendChild(document.createElement('input'))
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    field.remove()
    off()
    expect(pressed.mock.calls).toEqual([['ArrowLeft', 'house']])
  })
})

describe('the record is the TV\'s home while its room plays (design/tv-playing/, A)', () => {
  const usual = 3 * 60 * 1000
  it('comes back after twenty seconds with no key, not the three minutes a quiet house waits', () => {
    expect(RECORD_AFTER).toBe(20 * 1000)
    expect(restAfter(usual, true, false)).toBe(RECORD_AFTER)
    expect(restAfter(usual, false, false)).toBe(usual)
  })
  it('waits the usual while a pane is open, since somebody is reading it', () => {
    expect(restAfter(usual, true, true)).toBe(usual)
  })
})
