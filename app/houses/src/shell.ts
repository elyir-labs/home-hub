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
