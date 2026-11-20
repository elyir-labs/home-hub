// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A streaming box -- an Apple TV, a Google TV, a Roku or a Fire TV -- wherever the panel shows it: the TV's Watch row
   (design/tv-box/, A) and its card and pane on the wall and the phone (design/box-card/, B). The brain says which players
   are boxes and hands over their apps; the panel only ever sees a player with apps, and never asks which kind it is. */
import type { Device } from './api'

export const isBox = (d: Device) => !!d.attrs?.box && ((d.attrs.apps as string[] | undefined)?.length ?? 0) > 0

/* The apps in the Watch row: those the house has seen used, newest first, then the rest as the box lists them. Seven
   are shown; All apps lays out the rest in the same row. */
export const APPS_SHOWN = 7
export function appsOf(d: Device): { shown: string[]; more: string[] } {
  const apps = (d.attrs.apps as string[] | undefined) ?? []
  const used = ((d.attrs.used_apps as string[] | undefined) ?? []).filter(a => apps.includes(a))
  const order = [...used, ...apps.filter(a => !used.includes(a))]
  return { shown: order.slice(0, APPS_SHOWN), more: order.slice(APPS_SHOWN) }
}

/* An app's card is its name on a quiet tint, never its logo, and the same app always gets the same tint. */
const TINTS = ['150, 45, 50', '105, 110, 125', '160, 75, 60', '45, 75, 150', '40, 115, 150', '85, 60, 160', '170, 60, 95', '60, 120, 90']
export function appTint(app: string): string {
  let h = 0
  for (const c of app) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TINTS[h % TINTS.length]
}

/* What the box last had on, as the row's first card says it, or null when it has never been seen playing. */
export function lastOn(d: Device): { label: string; title: string; where: string; app: string | null } | null {
  const l = d.attrs.last_on as { title: string | null; app: string | null } | null | undefined
  if (!l || (!l.title && !l.app)) return null
  return { label: d.state === 'playing' ? 'On now' : 'Last on', title: l.title || l.app!, where: l.title && l.app ? `In ${l.app}` : '', app: l.app }
}

/* The box gone to sleep: time for the TV to show the house again. Sleeping is the one thing every box reports; an
   Apple TV doesn't say when Home is pressed (tried on the living room TV, 20 November). Only acted on once the box has
   been seen awake since the hub sent the TV over, so the sleep it is woken from is not mistaken for it. */
export const boxAsleep = (d: Device) => ['off', 'standby', 'unavailable'].includes(d.state)

/* The card on the wall and the phone, asleep (design/box-card/, B): Asleep rather than Off, because it is somewhere to
   watch from rather than a thing to switch on, and what was last on when the house knows it. */
export function asleepLines(d: Device): { title: string; sub: string } {
  const l = lastOn(d)
  return { title: 'Asleep', sub: l ? `Last on ${l.title}` : '' }
}
