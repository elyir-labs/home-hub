// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The store app (docs/apps.md) opens this app as houses.elyir.app/?shell=ios&store=US, the storefront as two
   letters. Each house's panel is told the same, because what the stores allow is decided there
   (design/store-app/, C). Kept for the session: the address loses its query once the app moves on. */
export function shellQuery(search: string): string {
  const q = new URLSearchParams(search)
  const os = q.get('shell')
  if (os !== 'ios' && os !== 'android') return ''
  const store = (q.get('store') ?? '').toUpperCase()
  return `&shell=${os}` + (/^[A-Z]{2}$/.test(store) ? `&store=${store}` : '')
}

const KEY = 'houses:shell'

export const shell = (() => {
  let q = shellQuery(location.search)
  try { if (q) sessionStorage.setItem(KEY, q); else q = sessionStorage.getItem(KEY) ?? '' } catch {}
  return q
})()

/* ---- what the page gives the shell (docs/apps.md) --------------------------------------------------------------
   The widget asks each house itself, with this phone's pass, so the shell is handed the list: whenever it loads or
   changes, and which house was opened, since the widget starts on the house opened last. Only ever to the store
   app's own handler; in a browser there is nobody to hand it to, and nothing is posted. */
export type ShellOs = 'ios' | 'android'
export type ShellHouse = { id: string; name: string; origin: string; lan: string | null; token: string }
export type ToShell = { type: 'houses:list'; houses: ShellHouse[] } | { type: 'houses:opened'; id: string }
  | { type: 'houses:push-identity' } | { type: 'houses:push-off' }
export type Native = { webkit?: { messageHandlers?: { houses?: { postMessage(m: unknown): void } } }; HousesShell?: { postMessage(m: string): void } }

export const osOf = (q: string): ShellOs | null => {
  const os = new URLSearchParams(q).get('shell')
  return os === 'ios' || os === 'android' ? os : null
}

export const forShell = (houses: ShellHouse[]): ShellHouse[] =>
  houses.map(({ id, name, origin, lan, token }) => ({ id, name, origin, lan: lan || null, token }))

export function postToShell(m: ToShell, os: ShellOs | null = osOf(shell), w: Native = window as Native): boolean {
  if (os === 'ios' && w.webkit?.messageHandlers?.houses) { w.webkit.messageHandlers.houses.postMessage(m); return true }
  if (os === 'android' && w.HousesShell) { w.HousesShell.postMessage(JSON.stringify(m)); return true }
  return false
}

let handed = ''
export function handHouses(houses: ShellHouse[], os: ShellOs | null = osOf(shell), w: Native = window as Native) {
  const list = forShell(houses), said = JSON.stringify(list)
  if (said !== handed && postToShell({ type: 'houses:list', houses: list }, os, w)) handed = said
}
