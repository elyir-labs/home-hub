// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* What the Houses app hands the store app for its widget (design/widget/, A and C; docs/apps.md, What the page gives
   the shell): the houses as the widget reads them, only to the shell's own handler, and never in a browser. */
import { describe, expect, it, vi } from 'vitest'
import { forShell, handHouses, osOf, postToShell, type ShellHouse } from '../houses/src/shell'

const lake = { id: 'lake', name: 'Lake house', origin: 'https://lake.elyir.app', lan: '192-168-1-53.lake.home.elyir.app', token: 'pass-lake' }
const home = { id: 'maple-court', name: 'Home', origin: 'https://maple-court.elyir.app', lan: '', token: 'pass-maple' }

const ios = () => { const postMessage = vi.fn(); return { w: { webkit: { messageHandlers: { houses: { postMessage } } } }, postMessage } }
const android = () => { const postMessage = vi.fn(); return { w: { HousesShell: { postMessage } }, postMessage } }

describe('the list the shell is handed', () => {
  it('is each house as the widget reads it, and nothing the phone keeps for itself', () => {
    const kept = [{ ...lake, added: 1, opened: 2, push: true, reach: 'here', glance: null }, { ...home, added: 3, opened: 4 }]
    expect(forShell(kept as unknown as ShellHouse[])).toEqual([
      { id: 'lake', name: 'Lake house', origin: 'https://lake.elyir.app', lan: '192-168-1-53.lake.home.elyir.app', token: 'pass-lake' },
      { id: 'maple-court', name: 'Home', origin: 'https://maple-court.elyir.app', lan: null, token: 'pass-maple' },
    ])
  })
})

describe('the shell', () => {
  it('is read off what the store app put on the address', () => {
    expect(osOf('&shell=ios&store=US')).toBe('ios')
    expect(osOf('?shell=android')).toBe('android')
    expect(osOf('')).toBeNull()
    expect(osOf('?shell=windows')).toBeNull()
  })

  it('on iOS gets the message itself, on Android as text', () => {
    const a = ios(), b = android()
    expect(postToShell({ type: 'houses:opened', id: 'lake' }, 'ios', a.w)).toBe(true)
    expect(a.postMessage).toHaveBeenCalledWith({ type: 'houses:opened', id: 'lake' })
    expect(postToShell({ type: 'houses:opened', id: 'lake' }, 'android', b.w)).toBe(true)
    expect(b.postMessage).toHaveBeenCalledWith('{"type":"houses:opened","id":"lake"}')
  })

  it('in a browser is nobody: nothing is posted, even with a handler that looks like one', () => {
    const a = ios(), b = android()
    expect(postToShell({ type: 'houses:opened', id: 'lake' }, null, { ...a.w, ...b.w })).toBe(false)
    expect(postToShell({ type: 'houses:opened', id: 'lake' }, 'ios', {})).toBe(false)
    expect(postToShell({ type: 'houses:opened', id: 'lake' }, 'android', a.w)).toBe(false)
    handHouses([lake], null, { ...a.w, ...b.w })
    expect(a.postMessage).not.toHaveBeenCalled()
    expect(b.postMessage).not.toHaveBeenCalled()
  })

  it('in this test, with no shell on the address, posts nothing by default', () => {
    const a = ios()
    Object.assign(window, a.w)
    try {
      expect(postToShell({ type: 'houses:opened', id: 'lake' })).toBe(false)
      handHouses([lake])
      expect(a.postMessage).not.toHaveBeenCalled()
    } finally { delete (window as { webkit?: unknown }).webkit }
  })

  it('is handed the list when it changes, not every time it is saved', () => {
    const a = ios()
    handHouses([lake], 'ios', a.w)
    handHouses([{ ...lake }], 'ios', a.w)
    expect(a.postMessage).toHaveBeenCalledTimes(1)
    expect(a.postMessage).toHaveBeenLastCalledWith({ type: 'houses:list', houses: forShell([lake]) })
    handHouses([lake, home], 'ios', a.w)
    handHouses([{ ...lake, token: 'a-new-pass' }, home], 'ios', a.w)
    handHouses([{ ...lake, token: 'a-new-pass', name: 'The lake' }, home], 'ios', a.w)
    handHouses([home], 'ios', a.w)
    expect(a.postMessage).toHaveBeenCalledTimes(5)
    expect(a.postMessage.mock.calls.map(c => c[0].houses.map((h: ShellHouse) => `${h.name}:${h.token}`))).toEqual([
      ['Lake house:pass-lake'], ['Lake house:pass-lake', 'Home:pass-maple'], ['Lake house:a-new-pass', 'Home:pass-maple'],
      ['The lake:a-new-pass', 'Home:pass-maple'], ['Home:pass-maple'],
    ])
  })
})
