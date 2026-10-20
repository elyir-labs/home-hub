// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The offer inside the store app (design/store-app/, C, chosen 19 October 2026): on the US storefront the
   offer as design/address/ chose it, its button opening the browser; on every other storefront no step at
   all. A phone or wall outside the store app is untouched. */
import { describe, expect, it } from 'vitest'
import type { AddressState, Offer } from '../src/api'
import { browserFor, offersOutside, takeWords } from '../src/address'
import { readShell } from '../src/inapp'
import { shellQuery } from '../houses/src/shell'

const offer: Offer = { open: true, price: '$3 a month', pay: 'https://pay.example/start', by_hand: false } as Offer
const fresh = { offer, house: null } as unknown as AddressState
const ios = (store: string) => ({ os: 'ios' as const, store })

describe('readShell', () => {
  it('reads what the shell put on the address', () => {
    expect(readShell('?app=1&shell=ios&store=US')).toEqual({ os: 'ios', store: 'US' })
    expect(readShell('?app=1&shell=android&store=de')).toEqual({ os: 'android', store: 'DE' })
  })
  it('is nothing outside a shell', () => {
    expect(readShell('?app=1')).toBeNull()
    expect(readShell('')).toBeNull()
  })
  it('treats a storefront it cannot read as not the US', () => {
    expect(readShell('?app=1&shell=ios')).toEqual({ os: 'ios', store: '' })
    expect(readShell('?app=1&shell=ios&store=USA')).toEqual({ os: 'ios', store: '' })
  })
  it('knows only the two shells', () => {
    expect(readShell('?shell=windows&store=US')).toBeNull()
  })
})

describe('the setup step, by storefront', () => {
  it('is offered in a browser and on the wall, as before', () => {
    expect(offersOutside(fresh)).toBe(true)
    expect(offersOutside(fresh, null)).toBe(true)
  })
  it('is offered on the US storefront', () => {
    expect(offersOutside(fresh, ios('US'))).toBe(true)
  })
  it('is left out on every other storefront, and on one nobody could read', () => {
    expect(offersOutside(fresh, ios('CA'))).toBe(false)
    expect(offersOutside(fresh, { os: 'android', store: 'GB' })).toBe(false)
    expect(offersOutside(fresh, ios(''))).toBe(false)
  })
})

describe('the button', () => {
  it('names the browser that opens in the store app', () => {
    expect(takeWords(offer, ios('US'))).toBe('Continue in Safari')
    expect(takeWords(offer, { os: 'android', store: 'US' })).toBe('Continue in your browser')
    expect(browserFor(ios('US'))).toBe('Safari')
  })
  it('is unchanged outside it', () => {
    expect(takeWords(offer)).toBe('Continue on your phone')
    expect(takeWords({ ...offer, pay: null } as Offer, ios('US'))).toBe('Give it this address')
  })
})

describe('the Houses app hands the shell on to each house', () => {
  it('passes exactly what it was opened with', () => {
    expect(shellQuery('?shell=ios&store=US')).toBe('&shell=ios&store=US')
    expect(shellQuery('?shell=android&store=fr')).toBe('&shell=android&store=FR')
  })
  it('passes nothing in a browser, or anything it does not recognize', () => {
    expect(shellQuery('')).toBe('')
    expect(shellQuery('?shell=ios&store=<x>')).toBe('&shell=ios')
    expect(shellQuery('?shell=other&store=US')).toBe('')
  })
})
