// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* One yes on this phone for every house (design/notify/, B): the rules of houses/src/push.ts, and what the
   worker (houses/public/sw.js) shows and opens. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { askedFor, b64u, fineFor, lineFor, makerOf, overall, ruledOut, unb64u, type Phone } from '../houses/src/push'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1'
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15'
const PIXEL = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'
const FIREFOX_ANDROID = 'Mozilla/5.0 (Android 15; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0'
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'

const phone = (extra: Partial<Phone> = {}): Phone =>
  ({ ua: PIXEL, touch: 5, secure: true, standalone: false, worker: true, push: true, notify: true, ...extra })

describe('who carries it, said in the fine print', () => {
  it('is Apple on an iPhone or iPad, Google on Android, and otherwise the browser’s maker', () => {
    expect(makerOf(IPHONE)).toBe('Apple')
    expect(makerOf(IPAD, 5)).toBe('Apple')
    expect(makerOf(PIXEL)).toBe('Google')
    expect(makerOf(FIREFOX_ANDROID)).toBe('your browser’s maker')
    expect(makerOf(MAC_CHROME)).toBe('your browser’s maker')
    expect(makerOf(IPAD, 0), 'a Mac with no touch screen is a Mac').toBe('your browser’s maker')
  })
  it('as the board writes it, starting a sentence', () => {
    expect(fineFor(IPHONE)).toBe('Each house decides what is worth telling you. Apple sees that one of your houses sent this phone something, and when, never what.')
    expect(fineFor(MAC_CHROME)).toContain('. Your browser’s maker sees that one of your houses')
  })
})

describe('what the phone rules out before any house is asked', () => {
  it('nothing, where the switch can work', () => {
    expect(ruledOut(phone(), 'default')).toBeNull()
    expect(ruledOut(phone({ ua: IPHONE, standalone: true }), 'granted')).toBeNull()
  })
  it('a page that is not secure, or a browser with no push', () => {
    expect(ruledOut(phone({ secure: false }), 'default')).toBe('unsupported')
    expect(ruledOut(phone({ push: false }), null)).toBe('unsupported')
    expect(ruledOut(phone({ worker: false }), 'default')).toBe('unsupported')
  })
  it('Safari on an iPhone, which allows it only from the Home Screen', () => {
    expect(ruledOut(phone({ ua: IPHONE, push: false, notify: false }), null)).toBe('needs-install')
    expect(ruledOut(phone({ ua: IPAD, touch: 5 }), 'default')).toBe('needs-install')
  })
  it('a phone set not to allow them', () => {
    expect(ruledOut(phone(), 'denied')).toBe('blocked')
  })
})

describe('on, off, or not every house yet', () => {
  it('is off until the phone has subscribed', () => {
    expect(overall(false, [true, true])).toBe('off')
  })
  it('is on when every house holds the key, partial when one does not, even when none does', () => {
    expect(overall(true, [true, true])).toBe('on')
    expect(overall(true, [true, false])).toBe('partial')
    expect(overall(true, [false])).toBe('partial')
  })
})

describe('the line under Notifications', () => {
  it('is the board’s, on or off', () => {
    expect(lineFor('off')).toBe('Your houses can tell this phone when something needs you.')
    expect(lineFor('on')).toBe('Your houses can tell this phone when something needs you.')
  })
  it('names the houses that cannot tell this phone yet, by this phone’s names for them', () => {
    expect(lineFor('partial', ['Lake house'])).toBe('Lake house can’t tell this phone yet. It will be asked again.')
    expect(lineFor('partial', ['Lake house', 'Elm Street'])).toBe('Lake house and Elm Street can’t tell this phone yet. They will be asked again.')
    expect(lineFor('partial', ['Home', 'Lake house', 'Elm Street'])).toBe('Home, Lake house and Elm Street can’t tell this phone yet. They will be asked again.')
  })
  it('says what to do when the phone rules it out', () => {
    expect(lineFor('needs-install', [], IPHONE)).toBe('On iPhone they work only from the Home Screen. Add Houses there first.')
    expect(lineFor('needs-install', [], IPAD, 5)).toBe('On iPad they work only from the Home Screen. Add Houses there first.')
    expect(lineFor('blocked')).toBe('This phone is set not to allow them. You can change that in Settings.')
    expect(lineFor('unsupported')).toBe('This browser can’t show notifications.')
  })
})

describe('the key, written as a house reads it', () => {
  it('goes to base64url and back unchanged', () => {
    const raw = new Uint8Array([4, 255, 254, 62, 63, 0, 1])
    expect(b64u(raw)).toBe('BP_-Pj8AAQ')
    expect([...unb64u(b64u(raw))]).toEqual([...raw])
  })
})

describe('a tapped notification', () => {
  it('opens the house it names, if this phone has it', () => {
    const houses = [{ id: 'maple-court' }, { id: 'lake' }]
    expect(askedFor('lake', houses)).toBe('lake')
    expect(askedFor('elsewhere', houses)).toBeNull()
    expect(askedFor(null, houses)).toBeNull()
  })
})

describe('the worker', () => {
  const src = readFileSync('houses/public/sw.js', 'utf8')
  const fakeSelf = { addEventListener: () => {} }
  const { titleFor, targetFor } = new Function('self', `${src}\nreturn { titleFor, targetFor }`)(fakeSelf) as {
    titleFor: (houses: { id: string; name: string }[], data: Record<string, unknown>) => string
    targetFor: (data: Record<string, unknown>) => string
  }
  const houses = [{ id: 'maple-court', name: 'Home' }, { id: 'lake', name: 'Lake house' }]

  it('titles a notification with this phone’s own name for the house that sent it', () => {
    expect(titleFor(houses, { label: 'lake', house: 'The Cabin' })).toBe('Lake house')
  })
  it('falls back to the house’s own name when it has no address, or this phone does not know it', () => {
    expect(titleFor(houses, { label: null, house: 'The Cabin' })).toBe('The Cabin')
    expect(titleFor(houses, { label: 'elsewhere', house: 'The Cabin' })).toBe('The Cabin')
    expect(titleFor([], {})).toBe('Your house')
  })
  it('opens that house, or the app when it cannot say which', () => {
    expect(targetFor({ label: 'lake' })).toBe('/?open=lake')
    expect(targetFor({ label: null })).toBe('/')
  })
})
