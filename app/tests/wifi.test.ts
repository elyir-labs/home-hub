// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Setting up a hub with no cable, from a phone on its own Wi-Fi (design/setup-network/, A, decided 19
   October 2026). These pin the board: where the phone lands, how a try ends, the words for a wrong
   password, and that the hub's own Wi-Fi is never offered as the house's. */
import { describe, expect, it } from 'vitest'
import type { NetState } from '../src/api'
import { afterJoin, askHere, fetchingLine, firstScreen, houseAddress, offered, onSetupWifi, phoneHasIt, wrongLine } from '../src/wifi'

const net = (over: Partial<NetState> = {}): NetState => ({
  how: 'none', ip: '10.42.0.1', name: 'hub', can_change: true, managed: true,
  bridges: { ssid: '', checked: false, known: false, count: 0 }, setup: { ssid: 'Elyir Hub 4F2A', both: true }, ...over,
})

describe('the setup Wi-Fi', () => {
  it('is known by the one address it ever has, and can be previewed anywhere', () => {
    expect(onSetupWifi({ hostname: '10.42.0.1', search: '' })).toBe(true)
    expect(onSetupWifi({ hostname: 'hub.local', search: '' })).toBe(false)
    expect(onSetupWifi({ hostname: 'localhost', search: '?wifi=1' })).toBe(true)
  })
})

describe('where the phone lands', () => {
  it('asks which Wi-Fi first', () => expect(firstScreen(net())).toEqual({ screen: 'which' }))
  it('says it worked to somebody reopening the sheet after it did', () =>
    expect(firstScreen(net({ joined: 'Bluebell' }))).toEqual({ screen: 'done', ssid: 'Bluebell' }))
  it('comes back to the password, with the reason, after a wrong one on a card that cannot do both', () =>
    expect(firstScreen(net({ reverted: 'Bluebell', reverted_why: 'password' }))).toEqual({
      screen: 'password', ssid: 'Bluebell', error: 'Bluebell didn’t accept that password. Check it and try again.' }))
})

describe('a try', () => {
  it('ends when the hub says which network it joined, or which it put back', () => {
    expect(afterJoin(net({ joined: 'Bluebell' }), 'Bluebell')).toBe('done')
    expect(afterJoin(net({ reverted: 'Bluebell' }), 'Bluebell')).toBe('wrong')
    expect(afterJoin(net({ reverted: 'Bluebell Guest' }), 'Bluebell')).toBe('waiting')
  })
  it('tells a wrong password from a network that never answered', () => {
    expect(wrongLine('Bluebell', 'password')).toBe('Bluebell didn’t accept that password. Check it and try again.')
    expect(wrongLine('Bluebell', 'unreachable')).toBe('The hub couldn’t reach Bluebell. Bring it closer to your router, or try again.')
  })
})

describe('the networks offered', () => {
  it('never include the hub’s own, name each once, and put the strongest first', () => {
    const seen = [{ ssid: 'NETGEAR-72', signal: 'faint' as const, secure: true }, { ssid: 'Elyir Hub 4F2A', signal: 'strong' as const, secure: true },
      { ssid: 'Bluebell', signal: 'strong' as const, secure: true }, { ssid: 'Bluebell', signal: 'ok' as const, secure: true }]
    expect(offered(seen, 'Elyir Hub 4F2A').map(n => n.ssid)).toEqual(['Bluebell', 'NETGEAR-72'])
  })
})

describe('the address under hub.local', () => {
  it('is the hub’s address on the house’s Wi-Fi, never on its own', () => {
    expect(houseAddress(net({ ip: '192.168.1.20' }))).toBe('192.168.1.20')
    expect(houseAddress(net())).toBe(null)
    expect(houseAddress(net({ ip: '127.0.0.1' }))).toBe(null)
  })
})

/* The screen plugged into a hub with no network (design/screen-wifi/, C, decided 22 October 2026). */
describe('on the hub’s own screen', () => {
  const here = (over: Partial<NetState> = {}) => net({ setup: { ssid: 'Elyir Hub 4F2A', both: true, phones: 0, password: 'kite-maple-41' }, ...over })

  it('asks only where it was told the password, and only until the hub has joined', () => {
    expect(askHere(here())).toBe(true)
    expect(askHere(net())).toBe(false)
    expect(askHere(here({ joined: 'Bluebell' }))).toBe(false)
    expect(askHere(null)).toBe(false)
  })
  it('steps aside for a phone on the hub’s Wi-Fi, unless somebody already began here', () => {
    expect(phoneHasIt(here(), false)).toBe(false)
    const phone = here({ setup: { ssid: 'Elyir Hub 4F2A', both: true, phones: 1, password: 'kite-maple-41' } })
    expect(phoneHasIt(phone, false)).toBe(true)
    expect(phoneHasIt(phone, true)).toBe(false)
  })
  it('says which Wi-Fi it joined while the rest downloads', () =>
    expect(fetchingLine('Bluebell')).toBe('On Bluebell. Getting the rest of the hub, which takes a few minutes the first time.'))
})
