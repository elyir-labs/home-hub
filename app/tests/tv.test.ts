// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The TV's rules (design/living-room/): which screens are TVs, what each remote's keys mean, where an arrow
   goes, what is in a room's row and in what order, and what OK and Up/Down ask of a thing. */
import { describe, expect, it } from 'vitest'
import type { Device, Room } from '../src/api'
import { hintFor, nearest, okOf, onTV, pressOf, sceneFor, stateOf, thingsIn } from '../src/tv'
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
})

describe('the keys every remote sends', () => {
  it('reads the TV remote over HDMI, a USB remote and a keyboard alike', () => {
    expect(['Enter', 'Select'].map(pressOf)).toEqual(['ok', 'ok'])
    expect(['Escape', 'Backspace', 'BrowserBack', 'GoBack'].map(pressOf)).toEqual(['back', 'back', 'back', 'back'])
    expect(['ColorF0Red', '1', 'ColorF3Blue', '4'].map(pressOf)).toEqual(['red', 'red', 'blue', 'blue'])
    expect(pressOf('a')).toBeNull()
  })
  it('gives each color the same scene in every room', () => {
    expect(sceneFor('red', SCENES)?.id).toBe('movie')
    expect(sceneFor('yellow', SCENES)?.id).toBe('asleep')
    expect(sceneFor('red', SCENES.filter(s => s.id !== 'movie'))).toBeNull()
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
