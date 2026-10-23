// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Giving a hub with no network the house's Wi-Fi, from a phone on the Wi-Fi the hub makes of its own
   (design/setup-network/, A, decided 19 October 2026). The phone arrives here because the hub answered
   its "is there internet?" question with this page, at the one address that Wi-Fi ever has.

   Three screens: which Wi-Fi, its password, and the hub is on it. A card that can't hold its own Wi-Fi
   while it tries the house's takes the phone with it, so there the last screen comes before the try and
   a wrong password is said when the person comes back (OwnWiFiA-4-alone). */
import type { NetState, SeenNetwork } from './api'

export const SETUP_HOST = '10.42.0.1'

/* The phone is on the hub's own Wi-Fi. `?wifi=1` previews it anywhere, as `?setup=1` does first run. */
export function onSetupWifi(loc: { hostname: string; search: string }): boolean {
  return loc.hostname === SETUP_HOST || new URLSearchParams(loc.search).get('wifi') === '1'
}

/* The screen plugged into a hub with no network asks the same question itself, with the hub's own Wi-Fi as a code
   beside it for anyone who would rather use a phone (design/screen-wifi/, C, decided 22 October 2026). Only that
   screen is told the password, so being told it is what says this is that screen; once the hub has joined, the
   question is over. */
export const askHere = (net: NetState | null): boolean => !!net?.setup?.password && !net.joined

/* A phone on the hub's own Wi-Fi is answering it, so the screen steps aside, unless somebody already began here. */
export const phoneHasIt = (net: NetState | null, begun: boolean): boolean => !begun && (net?.setup?.phones ?? 0) > 0

/* A screen nobody can touch or point at shows only the code: the question would be one it can't answer. */
export const canAnswer = (): boolean => typeof matchMedia !== 'function' || !matchMedia('(any-pointer: none)').matches

/* Welcome home's line while the rest of the hub downloads, once it joined from here. */
export const fetchingLine = (ssid: string) => `On ${ssid}. Getting the rest of the hub, which takes a few minutes the first time.`

export type WifiScreen = 'which' | 'password' | 'done' | 'leaving' | 'phone'
export type WifiAt = { screen: WifiScreen; ssid?: string; error?: string }

/* Where a phone lands. Somebody coming back after a wrong password on a card that can't do both is
   shown that network's password again with the reason, and somebody reopening the sheet after it
   worked is told it worked. */
export function firstScreen(net: NetState | null): WifiAt {
  if (net?.joined) return { screen: 'done', ssid: net.joined }
  if (net?.reverted) return { screen: 'password', ssid: net.reverted, error: wrongLine(net.reverted, net.reverted_why) }
  return { screen: 'which' }
}

/* How a try is going, read off the hub's picture after the join was sent. */
export function afterJoin(net: NetState, ssid: string): 'done' | 'wrong' | 'waiting' {
  if (net.joined === ssid) return 'done'
  if (net.reverted === ssid) return 'wrong'
  return 'waiting'
}

export function wrongLine(ssid: string, why?: string): string {
  return why === 'password'
    ? `${ssid} didn’t accept that password. Check it and try again.`
    : `The hub couldn’t reach ${ssid}. Bring it closer to your router, or try again.`
}

/* The networks to offer: never the hub's own, each name once, strongest first. */
export function offered(seen: SeenNetwork[], own?: string): SeenNetwork[] {
  const rank = { strong: 0, ok: 1, faint: 2 } as Record<string, number>
  const out: SeenNetwork[] = [], names = new Set(own ? [own] : [])
  for (const n of [...seen].sort((a, b) => (rank[a.signal ?? ''] ?? 3) - (rank[b.signal ?? ''] ?? 3))) {
    if (!n.ssid || names.has(n.ssid)) continue
    names.add(n.ssid); out.push(n)
  }
  return out
}

/* The hub's address on the house's Wi-Fi, for a phone that can't open .local names. Never its address
   on its own Wi-Fi, which is gone by the time anyone types it. */
export function houseAddress(net: NetState | null): string | null {
  const ip = net?.ip
  return ip && !ip.startsWith('127.') && ip !== SETUP_HOST ? ip : null
}

export const bars = (signal?: string) => ({ strong: 4, ok: 3, faint: 1 } as Record<string, number>)[signal ?? ''] ?? 2
